"""
NANO Training Integration Test
================================
End-to-end smoke test that exercises the full NANO pipeline:
  1. Train a BPE tokenizer on a tiny corpus
  2. Instantiate a BaseNano and run a forward pass
  3. Run the decode pipeline on model output
  4. Verify the round-trip produces readable text

Run:  python -m pytest NANO_train/tests/test_integration.py -v
      (or)  python NANO_train/tests/test_integration.py
"""
from __future__ import annotations
import sys, os, tempfile, shutil
from pathlib import Path

# Ensure NANO_train is importable
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import torch
import numpy as np

# ─── Helpers ──────────────────────────────────────────────

SAMPLE_CORPUS = """
def hello_world():
    print("Hello, world!")

class Calculator:
    def add(self, a, b):
        return a + b
    def multiply(self, a, b):
        return a * b

# This is a comment about the code
for i in range(10):
    result = Calculator().add(i, i * 2)
    print(f"Result: {result}")
""".strip()


# ─── Test 1: BPE Tokenizer round-trip ─────────────────────

def test_bpe_tokenizer_round_trip():
    """Train a tiny BPE tokenizer and verify encode → decode is lossless."""
    from tokenizer.bpe_tokenizer import BPETokenizer

    tok = BPETokenizer(vocab_size=300)
    tok.train(SAMPLE_CORPUS)

    assert tok.vocab_size >= 256, "Vocab should include byte-level entries"

    ids = tok.encode("def add(a, b):")
    assert len(ids) > 0, "Encoding should produce tokens"

    decoded = tok.decode(ids)
    assert decoded == "def add(a, b):", f"Decode mismatch: {decoded!r}"

    # Test unknown-char resilience
    ids2 = tok.encode("αβγ unicode test")
    decoded2 = tok.decode(ids2)
    assert "unicode test" in decoded2, "Should handle unicode gracefully"

    print("  ✅ BPE tokenizer round-trip passed")


# ─── Test 2: BaseNano forward pass ────────────────────────

def test_base_nano_forward():
    """Instantiate a BaseNano, run a forward pass, check output shape."""
    from nanos.base import BaseNano

    nano = BaseNano(input_size=128, hidden_size=64, output_size=64)
    assert nano.state.value == "dormant"

    x = torch.randn(1, 128)
    y = nano(x)

    assert y.shape == (1, 64), f"Expected (1,64), got {y.shape}"
    assert not torch.isnan(y).any(), "Output should not contain NaN"

    # Check param count is small (< 50K for L1/L2 cache fit)
    param_count = sum(p.numel() for p in nano.parameters())
    assert param_count < 50_000, f"Too many params: {param_count}"

    print(f"  ✅ BaseNano forward pass: {param_count} params, output shape {y.shape}")


# ─── Test 3: Training one step ────────────────────────────

def test_nano_training_step():
    """Run a single supervised training step on a BaseNano."""
    from nanos.base import BaseNano

    nano = BaseNano(input_size=128, hidden_size=64, output_size=64)
    optimizer = torch.optim.Adam(nano.parameters(), lr=1e-3)
    criterion = torch.nn.MSELoss()

    x = torch.randn(4, 128)   # batch of 4
    target = torch.randn(4, 64)

    # Forward
    nano.train()
    pred = nano(x)
    loss = criterion(pred, target)

    # Backward
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()

    assert loss.item() > 0, "Loss should be positive"
    assert loss.item() < 100, "Loss should be reasonable"

    print(f"  ✅ Training step: loss={loss.item():.4f}")


# ─── Test 4: Decode pipeline ──────────────────────────────

def test_decode_pipeline():
    """Run the decode pipeline on synthetic logits → readable text."""
    from inference.decode_pipeline import DecodePipeline, DecodeConfig
    from tokenizer.bpe_tokenizer import BPETokenizer

    # Train tokenizer
    tok = BPETokenizer(vocab_size=300)
    tok.train(SAMPLE_CORPUS)

    # Build a synthetic logit tensor that heavily weights common token IDs
    # (byte-level chars for ASCII 'hello')
    hello_ids = tok.encode("hello")
    seq_len = len(hello_ids)
    vocab = tok.vocab_size
    logits = torch.full((1, seq_len, vocab), -10.0)
    for pos, tid in enumerate(hello_ids):
        logits[0, pos, tid] = 10.0  # spike the correct token

    # Decode
    cfg = DecodeConfig(strategy="greedy", temperature=1.0, max_length=seq_len)
    pipeline = DecodePipeline(config=cfg)
    result = pipeline.decode(logits, tok)

    assert "hello" in result.text.lower(), f"Expected 'hello' in output, got: {result.text!r}"
    assert result.token_count == seq_len

    print(f"  ✅ Decode pipeline: '{result.text}' ({result.token_count} tokens)")


# ─── Test 5: Checkpoint save / load ───────────────────────

def test_checkpoint_round_trip():
    """Save a nano checkpoint, reload it, verify weights match."""
    from nanos.base import BaseNano

    nano = BaseNano(input_size=64, hidden_size=32, output_size=32)
    x = torch.randn(1, 64)
    original_out = nano(x).detach()

    tmpdir = tempfile.mkdtemp(prefix="nano_test_")
    try:
        ckpt_path = os.path.join(tmpdir, "test_nano.pt")
        torch.save(nano.state_dict(), ckpt_path)

        nano2 = BaseNano(input_size=64, hidden_size=32, output_size=32)
        nano2.load_state_dict(torch.load(ckpt_path, weights_only=True))
        reloaded_out = nano2(x).detach()

        assert torch.allclose(original_out, reloaded_out, atol=1e-6), "Reloaded weights should produce same output"
        print("  ✅ Checkpoint round-trip passed")
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


# ─── Test 6: Full pipeline integration ────────────────────

def test_full_pipeline():
    """
    End-to-end: corpus → tokenizer → nano forward → decode → text.
    Verifies the entire chain hangs together.
    """
    from tokenizer.bpe_tokenizer import BPETokenizer
    from inference.decode_pipeline import DecodePipeline, DecodeConfig
    from nanos.base import BaseNano

    # 1. Train tokenizer
    tok = BPETokenizer(vocab_size=300)
    tok.train(SAMPLE_CORPUS)

    # 2. Encode some text → tensor
    input_ids = tok.encode("def add(")
    input_tensor = torch.tensor(input_ids, dtype=torch.float32).unsqueeze(0)  # (1, seq_len)

    # 3. Pad/truncate to BaseNano input size
    nano = BaseNano(input_size=128, hidden_size=64, output_size=tok.vocab_size)
    padded = torch.zeros(1, 128)
    trim_len = min(input_tensor.shape[1], 128)
    padded[0, :trim_len] = input_tensor[0, :trim_len]

    # 4. Forward pass
    nano.eval()
    with torch.no_grad():
        logits = nano(padded).unsqueeze(1)  # (1, 1, vocab_size)

    # 5. Decode — should produce *something*, even untrained
    cfg = DecodeConfig(strategy="greedy", max_length=1)
    pipeline = DecodePipeline(config=cfg)
    result = pipeline.decode(logits, tok)

    assert isinstance(result.text, str), "Decode should return a string"
    assert result.token_count >= 1, "Should produce at least 1 token"

    print(f"  ✅ Full pipeline: input='def add(' → output='{result.text}' ({result.token_count} tok)")


# ─── Runner ───────────────────────────────────────────────

def run_all():
    print("\n🧪 NANO Integration Tests\n" + "=" * 40)
    tests = [
        test_bpe_tokenizer_round_trip,
        test_base_nano_forward,
        test_nano_training_step,
        test_decode_pipeline,
        test_checkpoint_round_trip,
        test_full_pipeline,
    ]
    passed = 0
    failed = 0
    for t in tests:
        try:
            t()
            passed += 1
        except Exception as e:
            print(f"  ❌ {t.__name__}: {e}")
            failed += 1
    print(f"\n{'=' * 40}")
    print(f"Results: {passed} passed, {failed} failed out of {len(tests)}")
    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    run_all()
