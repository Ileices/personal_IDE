"""
Tensor-to-Text Decode Pipeline — The missing link between nano output and readable text.

Pipeline: raw tensor → argmax → token IDs → BPE detokenize → UTF-8 text

This module provides multiple decoding strategies:
  1. Greedy decode (argmax)
  2. Top-k sampling
  3. Temperature-scaled sampling
  4. Beam search (for multi-step generation)
  
Works with both the legacy CharTokenizer and the new BPE SharedTokenizer.
"""
from __future__ import annotations
import logging
import math
from typing import List, Optional, Tuple, Dict, Any, TYPE_CHECKING

if TYPE_CHECKING:
    import torch

logger = logging.getLogger(__name__)


class DecodePipeline:
    """
    Converts raw nano output tensors into human-readable text.
    
    The nanos produce float tensors where each value represents either:
      A) Normalized token IDs (BPE mode): value ∈ [0,1] → id = round(value * vocab_size)
      B) Char ordinals (legacy mode): value ∈ [0,1] → char = chr(value * 256)
    
    This pipeline handles both modes and provides multiple decoding strategies.
    """

    def __init__(self, mode: str = "bpe"):
        """
        Initialize decode pipeline.
        
        Args:
            mode: "bpe" for BPE tokenizer, "char" for legacy CharTokenizer
        """
        self.mode = mode
        self._tokenizer = None

    def _get_tokenizer(self):
        """Lazy-load the BPE tokenizer."""
        if self._tokenizer is None and self.mode == "bpe":
            import sys, os
            sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
            from tokenizer import SharedTokenizer
            self._tokenizer = SharedTokenizer.get()
        return self._tokenizer

    # ─── Core Decode Methods ─────────────────────────────────

    def greedy_decode(self, tensor: "torch.Tensor") -> str:
        """
        Greedy decoding: take the argmax at each position.
        
        For BPE mode: denormalize values to token IDs, then decode
        For char mode: denormalize to char ordinals
        
        Args:
            tensor: Output tensor from nano, shape (1, seq_len) or (seq_len,)
        Returns:
            Decoded text string
        """
        values = self._to_list(tensor)

        if self.mode == "bpe":
            return self._decode_bpe(values)
        else:
            return self._decode_char(values)

    def topk_decode(self, logits_tensor: "torch.Tensor", k: int = 5,
                    temperature: float = 1.0) -> str:
        """
        Top-k sampling: restrict to top k tokens, then sample.
        
        Expects logits (unnormalized scores) of shape (1, seq_len, vocab_size)
        or a simple output tensor for fallback to greedy.
        """
        import torch

        if logits_tensor.dim() <= 2:
            return self.greedy_decode(logits_tensor)

        logits = logits_tensor.squeeze(0)  # (seq_len, vocab_size)

        ids = []
        for pos in range(logits.size(0)):
            logit = logits[pos] / max(temperature, 1e-8)
            topk_vals, topk_idx = torch.topk(logit, min(k, logit.size(0)))
            probs = torch.softmax(topk_vals, dim=-1)
            sampled = torch.multinomial(probs, 1).item()
            token_id = topk_idx[sampled].item()
            ids.append(token_id)

        if self.mode == "bpe":
            tok = self._get_tokenizer()
            return tok.decode(ids) if tok else self._ids_to_char(ids)
        else:
            return self._ids_to_char(ids)

    def temperature_decode(self, tensor: "torch.Tensor",
                           temperature: float = 0.7) -> str:
        """
        Temperature-scaled decoding for output tensors.
        
        Adds controlled randomness: temperature > 1 = more random,
        temperature < 1 = more deterministic (approaches greedy).
        """
        import torch

        values = self._to_list(tensor)

        if temperature <= 0.01:
            return self.greedy_decode(tensor)

        if self.mode == "bpe":
            tok = self._get_tokenizer()
            if tok is None:
                return self._decode_char(values)
            
            vocab_size = tok.vocab_size
            noisy_ids = []
            for v in values:
                base_id = v * vocab_size
                noise = (torch.randn(1).item()) * temperature * (vocab_size * 0.01)
                token_id = int(round(base_id + noise))
                token_id = max(0, min(token_id, vocab_size - 1))
                if token_id == 0:
                    continue
                noisy_ids.append(token_id)
            return tok.decode(noisy_ids)
        else:
            return self._decode_char(values)

    def beam_decode(self, nano: Any, initial_input: "torch.Tensor",
                    max_steps: int = 64, beam_width: int = 3) -> str:
        """
        Beam search decoding for auto-regressive generation.
        Runs the nano iteratively, feeding output back as input.
        """
        import torch

        beams: List[Tuple[float, List[int], torch.Tensor]] = [
            (0.0, [], initial_input)
        ]

        for step in range(max_steps):
            candidates = []
            for log_prob, ids, last_input in beams:
                with torch.no_grad():
                    output = nano(last_input)

                values = output.squeeze().detach().cpu()

                if self.mode == "bpe":
                    tok = self._get_tokenizer()
                    vocab_size = tok.vocab_size if tok else 256
                else:
                    vocab_size = 256

                for i in range(min(beam_width, values.size(0))):
                    v = values[i].item()
                    token_id = int(round(v * vocab_size))
                    token_id = max(0, min(token_id, vocab_size - 1))
                    if token_id <= 1:
                        continue
                    new_log_prob = log_prob + math.log(max(abs(v), 1e-10))
                    new_ids = ids + [token_id]
                    candidates.append((new_log_prob, new_ids, output))

            if not candidates:
                break

            candidates.sort(key=lambda x: x[0], reverse=True)
            beams = candidates[:beam_width]

            if self.mode == "bpe" and beams[0][1] and beams[0][1][-1] == 3:
                break

        best_ids = beams[0][1] if beams else []
        if self.mode == "bpe":
            tok = self._get_tokenizer()
            return tok.decode(best_ids) if tok else self._ids_to_char(best_ids)
        else:
            return self._ids_to_char(best_ids)

    # ─── Batch Decode ────────────────────────────────────────

    def batch_decode(self, tensors: List["torch.Tensor"]) -> List[str]:
        """Decode a batch of tensors."""
        return [self.greedy_decode(t) for t in tensors]

    # ─── Internal Helpers ────────────────────────────────────

    @staticmethod
    def _to_list(tensor: "torch.Tensor") -> List[float]:
        """Convert tensor to flat list of floats."""
        values = tensor.squeeze().detach().cpu().tolist()
        if isinstance(values, (int, float)):
            values = [values]
        return values

    def _decode_bpe(self, values: List[float]) -> str:
        """Decode normalized float values via BPE tokenizer."""
        tok = self._get_tokenizer()
        if tok is None:
            return self._decode_char(values)

        vocab_size = tok.vocab_size
        ids = []
        for v in values:
            token_id = int(round(v * vocab_size))
            token_id = max(0, min(token_id, vocab_size - 1))
            if token_id == 0:
                continue
            ids.append(token_id)

        return tok.decode(ids)

    @staticmethod
    def _decode_char(values: List[float]) -> str:
        """Legacy char-level decode: value * 256 → chr."""
        chars = []
        for v in values:
            c = int(v * 256)
            if 32 <= c < 127:
                chars.append(chr(c))
            elif c > 0:
                chars.append("?")
        return "".join(chars).rstrip("\x00").rstrip("?").strip()

    @staticmethod
    def _ids_to_char(ids: List[int]) -> str:
        """Convert raw token IDs to characters (fallback)."""
        chars = []
        for i in ids:
            if 32 <= i < 127:
                chars.append(chr(i))
            elif i > 0:
                chars.append("?")
        return "".join(chars).strip()


# ─── Convenience Functions ───────────────────────────────────

def decode_tensor(tensor: "torch.Tensor", mode: str = "bpe") -> str:
    """One-shot decode: tensor → text."""
    return DecodePipeline(mode=mode).greedy_decode(tensor)


def decode_nano_output(nano: Any, input_text: str,
                       max_len: int = 128, mode: str = "bpe") -> str:
    """
    Full end-to-end: text → nano → text.
    
    1. Encode input text to tensor via BPE tokenizer
    2. Run nano forward pass
    3. Decode output tensor back to text
    """
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    import torch

    pipeline = DecodePipeline(mode=mode)

    if mode == "bpe":
        from tokenizer import SharedTokenizer
        tok = SharedTokenizer.get()
        input_tensor = tok.encode_to_tensor(input_text, max_len=max_len)
    else:
        chars = [ord(c) / 256.0 for c in input_text[:max_len]]
        while len(chars) < max_len:
            chars.append(0.0)
        input_tensor = torch.tensor([chars], dtype=torch.float32)

    device = next(nano.parameters()).device
    input_tensor = input_tensor.to(device)

    with torch.no_grad():
        output_tensor = nano(input_tensor)

    return pipeline.greedy_decode(output_tensor)
