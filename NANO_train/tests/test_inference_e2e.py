"""
Prompt 9 E2E inference integration test.

Covers:
1) Inference pipeline definition has 9 stages.
2) Text -> encode -> model forward -> argmax -> decode returns text (not tensor repr).
"""
from __future__ import annotations

import sys
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from inference.decode_pipeline import argmax_decode, ids_to_text, run_inference
from orchestrator.pipeline import PipelineExecutor
from tokenizer.bpe_tokenizer import BPETokenizer


def _build_tokenizer() -> BPETokenizer:
    tok = BPETokenizer(vocab_size=320)
    tok.train(
        [
            "hello nano sea",
            "def add(a, b): return a + b",
            "pipeline text output must be readable",
        ],
        verbose=False,
    )
    return tok


class DummyNanoModel(torch.nn.Module):
    """Tiny CPU-only model that emits deterministic token logits."""

    def __init__(self, vocab_size: int):
        super().__init__()
        self.vocab_size = vocab_size
        self.emb = torch.nn.Embedding(1024, 16)
        self.proj = torch.nn.Linear(16, vocab_size)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Accept either float-normalized inputs or int token IDs.
        if x.dtype in (torch.float16, torch.float32, torch.float64):
            # Map normalized float range to token-like IDs.
            token_ids = torch.clamp((x * 255.0).round().long(), min=0, max=1023)
        else:
            token_ids = torch.clamp(x.long(), min=0, max=1023)

        hidden = self.emb(token_ids)
        return self.proj(hidden)


def test_inference_pipeline_has_nine_stages():
    executor = PipelineExecutor()
    pipeline = executor.create_inference_pipeline()

    assert pipeline.name == "inference"
    assert len(pipeline.stages) == 9


def test_inference_e2e_text_in_text_out():
    tok = _build_tokenizer()
    model = DummyNanoModel(vocab_size=tok.vocab_size)
    model.eval()

    prompt = "hello nano"

    # 1) End-to-end helper path
    output_text = run_inference(model, prompt, tok, max_new_tokens=16)

    assert isinstance(output_text, str), "Output must be a string"
    assert not output_text.startswith("tensor("), "Output must be decoded text, not tensor repr"

    # 2) Explicit path: encode -> forward -> argmax -> decode
    input_tensor = tok.encode_to_tensor(prompt, max_len=16)
    with torch.no_grad():
        logits = model(input_tensor)

    token_ids = argmax_decode(logits)
    decoded = ids_to_text(token_ids, tok)

    assert isinstance(decoded, str)
    assert len(decoded) > 0, "Decoded text should be non-empty"
    decoded.encode("utf-8")

    print(f"PASS: inference returned text: {decoded[:50]}")
