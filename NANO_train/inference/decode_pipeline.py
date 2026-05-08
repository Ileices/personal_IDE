"""
Tensor-to-text decode pipeline.

Pipeline:
  raw logits/tensor -> argmax -> token IDs -> detokenize -> text
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, List, Optional, Sequence


SPECIAL_TOKEN_FALLBACK = {0, 2, 3}  # pad, bos, eos


def _to_numpy_array(values: Any):
    import numpy as np

    if values is None:
        return np.array([])

    if hasattr(values, "detach"):
        values = values.detach().cpu().numpy()

    return np.asarray(values)


def argmax_decode(logits: Any) -> List[int]:
    """Convert logits/tensor output to token IDs via argmax.

    Supports torch tensors, numpy arrays, and nested lists.
    - 1D: treated as token IDs/logits vector and converted to ints.
    - 2D: treated as (batch, vocab), argmax over vocab.
    - 3D+: treated as (..., vocab), argmax over last dim.
    """
    import numpy as np

    arr = _to_numpy_array(logits)
    if arr.size == 0:
        return []

    if arr.ndim == 0:
        return [int(arr.item())]

    if arr.ndim == 1:
        if np.issubdtype(arr.dtype, np.integer):
            return [int(x) for x in arr.tolist()]
        # 1D float logits across vocab -> one token ID
        if arr.shape[0] > 1:
            return [int(np.argmax(arr))]
        return [int(round(float(arr[0])))]

    if arr.ndim == 2:
        # (batch, vocab)
        token_ids = np.argmax(arr, axis=1)
        return [int(x) for x in token_ids.reshape(-1).tolist()]

    # (batch, seq, vocab) or higher: argmax over vocab dim
    token_ids = np.argmax(arr, axis=-1)
    return [int(x) for x in token_ids.reshape(-1).tolist()]


def _detect_special_ids(tokenizer: Any) -> set[int]:
    special_ids = set(SPECIAL_TOKEN_FALLBACK)
    for attr in ("pad_id", "bos_id", "eos_id", "pad_token_id", "bos_token_id", "eos_token_id"):
        value = getattr(tokenizer, attr, None)
        if isinstance(value, int):
            special_ids.add(value)
    return special_ids


def ids_to_text(token_ids: List[int], tokenizer: Any) -> str:
    """Convert token IDs to UTF-8 text using tokenizer.decode.

    Special IDs (pad/bos/eos) are removed before decode.
    """
    if tokenizer is None:
        return ""

    if not token_ids:
        return ""

    special_ids = _detect_special_ids(tokenizer)
    cleaned = [int(t) for t in token_ids if int(t) not in special_ids]
    if not cleaned:
        return ""

    try:
        text = tokenizer.decode(cleaned, skip_special=True)
    except TypeError:
        text = tokenizer.decode(cleaned)
    except Exception:
        return ""

    if not isinstance(text, str):
        text = str(text)
    return text.encode("utf-8", errors="replace").decode("utf-8", errors="replace").strip()


def _encode_text(tokenizer: Any, text: str, max_new_tokens: int):
    import torch

    if hasattr(tokenizer, "encode_to_tensor"):
        return tokenizer.encode_to_tensor(text, max_len=max_new_tokens)

    if hasattr(tokenizer, "encode"):
        ids = tokenizer.encode(text)
        if not ids:
            ids = [0]
        return torch.tensor([ids[:max_new_tokens]], dtype=torch.long)

    raise ValueError("Tokenizer does not expose encode() or encode_to_tensor()")


def run_inference(model: Any, input_text: str, tokenizer: Any, max_new_tokens: int = 128) -> str:
    """Full end-to-end inference: text in -> model -> text out."""
    if model is None or tokenizer is None:
        return ""

    try:
        import torch
    except Exception:
        torch = None

    encoded = _encode_text(tokenizer, input_text or "", max_new_tokens=max_new_tokens)

    # Keep CPU-only compatibility: only move tensor when model exposes a device.
    model_input = encoded
    if torch is not None and hasattr(model, "parameters"):
        try:
            device = next(model.parameters()).device
            model_input = encoded.to(device)
        except Exception:
            model_input = encoded

    try:
        if torch is not None:
            with torch.no_grad():
                output = model(model_input)
        else:
            output = model(model_input)
    except Exception:
        return ""

    if output is None:
        return ""

    if isinstance(output, (tuple, list)) and output:
        output = output[0]

    token_ids = argmax_decode(output)
    if not token_ids:
        return ""

    return ids_to_text(token_ids, tokenizer)


@dataclass
class DecodeConfig:
    strategy: str = "greedy"
    temperature: float = 1.0
    max_length: int = 128


@dataclass
class DecodeResult:
    text: str
    token_ids: List[int]
    token_count: int


class DecodePipeline:
    """Compatibility wrapper around argmax_decode + ids_to_text."""

    def __init__(self, mode: str = "bpe", config: Optional[DecodeConfig] = None):
        self.mode = mode
        self.config = config or DecodeConfig()

    def _resolve_tokenizer(self, tokenizer: Any = None):
        if tokenizer is not None:
            return tokenizer
        if self.mode != "bpe":
            return _FallbackByteTokenizer()
        try:
            from tokenizer import SharedTokenizer

            return SharedTokenizer.get()
        except Exception:
            return _FallbackByteTokenizer()

    def decode(self, logits: Any, tokenizer: Any = None) -> DecodeResult:
        tok = self._resolve_tokenizer(tokenizer)
        token_ids = argmax_decode(logits)
        if self.config.max_length > 0:
            token_ids = token_ids[: self.config.max_length]
        text = ids_to_text(token_ids, tok)
        return DecodeResult(text=text, token_ids=token_ids, token_count=len(token_ids))

    def greedy_decode(self, logits: Any, tokenizer: Any = None) -> str:
        return self.decode(logits, tokenizer=tokenizer).text


class _FallbackByteTokenizer:
    """Minimal tokenizer fallback when shared tokenizer is unavailable."""

    pad_id = 0
    bos_id = 2
    eos_id = 3

    def encode(self, text: str) -> List[int]:
        return [int(b) for b in text.encode("utf-8", errors="replace")]

    def decode(self, token_ids: Sequence[int], skip_special: bool = True) -> str:
        data = bytearray()
        for tid in token_ids:
            value = int(tid)
            if skip_special and value in SPECIAL_TOKEN_FALLBACK:
                continue
            if 0 <= value <= 255:
                data.append(value)
        return bytes(data).decode("utf-8", errors="replace")


def decode_tensor(tensor: Any, mode: str = "bpe") -> str:
    """One-shot decode helper."""
    return DecodePipeline(mode=mode).greedy_decode(tensor)


def decode_nano_output(nano: Any, input_text: str, max_len: int = 128, mode: str = "bpe") -> str:
    """Backward-compatible helper for text -> model -> text."""
    tokenizer: Any
    if mode == "bpe":
        try:
            from tokenizer import SharedTokenizer

            tokenizer = SharedTokenizer.get()
        except Exception:
            tokenizer = _FallbackByteTokenizer()
    else:
        tokenizer = _FallbackByteTokenizer()

    return run_inference(nano, input_text, tokenizer, max_new_tokens=max_len)


if __name__ == "__main__":
    # Smoke test: tokenizer round-trip and decode from synthetic logits.
    try:
        from tokenizer import SharedTokenizer

        tok = SharedTokenizer.get()
    except Exception:
        tok = _FallbackByteTokenizer()

    sample = "hello nano sea"
    encoded = tok.encode(sample)
    round_trip = ids_to_text(encoded, tok)
    print("roundtrip:", round_trip[:60])

    # Build deterministic synthetic logits for argmax decode.
    try:
        import numpy as np

        vocab = max(getattr(tok, "vocab_size", 256), 8)
        logits = np.full((1, min(len(encoded), 6), vocab), -10.0, dtype=float)
        for i, tid in enumerate(encoded[:6]):
            logits[0, i, int(tid) % vocab] = 10.0
        ids = argmax_decode(logits)
        print("decoded:", ids_to_text(ids, tok)[:60])
    except Exception as exc:
        print("smoke test warning:", exc)
