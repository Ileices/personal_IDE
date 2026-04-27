"""Phase 3 validation: runtime integration (trainer + lifecycle + server-facing contract)."""
import asyncio
import sys
from pathlib import Path

_nano_train = str(Path(__file__).resolve().parent.parent)
if _nano_train not in sys.path:
    sys.path.insert(0, _nano_train)

from training.swarm_runtime import SwarmRuntime


async def main_async():
    print("=" * 60)
    print("NANO SEA v2 — Phase 3 Validation")
    print("=" * 60)

    runtime = SwarmRuntime(
        batch_size=2,
        seq_len=48,
        training_interval=0.01,
        cycle_steps=1,
        checkpoint_every=99999,
    )

    print("\n[1] Runtime start...")
    await runtime.start()
    assert runtime.status["running"] is True
    assert runtime.status["trainer"] == "swarm_v2"
    print("    PASS — runtime started")

    print("\n[2] Observation ingestion...")
    runtime.add_observation("write python function", "def add(a,b): return a+b")
    runtime.add_observation("explain loop", "A loop repeats code while condition is true")
    runtime.add_observation("fix bug", "Check None before indexing list")
    assert runtime.status["buffer_size"] >= 3
    print(f"    PASS — buffer_size={runtime.status['buffer_size']}")

    print("\n[3] Single train step (manual)...")
    trained = await runtime.train_once()
    assert trained is True
    st = runtime.status
    assert st["total_steps"] >= 1
    assert st["last_loss"] is not None
    print(f"    PASS — step={st['total_steps']}, loss={st['last_loss']:.4f}, phase={st['cycle_phase']}")

    print("\n[4] Generation API contract...")
    text = runtime.generate_text("hello world", max_new_tokens=16)
    assert isinstance(text, str)
    print(f"    PASS — generated_len={len(text)}")

    print("\n[5] Checkpoint info contract...")
    info = runtime.get_checkpoint_info()
    assert "checkpoint_dir" in info and "total_checkpoints" in info
    print(f"    PASS — checkpoints={info['total_checkpoints']}")

    print("\n[6] Runtime stop...")
    await runtime.stop()
    assert runtime.status["running"] is False
    print("    PASS — runtime stopped")

    print("\n" + "=" * 60)
    print("ALL PHASE 3 TESTS PASSED")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main_async())
