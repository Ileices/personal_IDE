"""Phase 2 validation for v2 trainer + lifecycle stack."""
import sys
from pathlib import Path

_nano_train = str(Path(__file__).resolve().parent.parent)
if _nano_train not in sys.path:
    sys.path.insert(0, _nano_train)

import torch

from core.swarm_model import NanoSeaModel
from core.touch_tensor import TouchTensor
from training.swarm_trainer import SwarmTrainer
from training.independence import IndependenceTracker
from lifecycle.fitness import FitnessEvaluator
from lifecycle.spawner import NanoSpawner
from lifecycle.absularity import AbsularityDetector
from lifecycle.compression import CompressionEngine, DepositStore
from lifecycle.cosmic_cycle import CosmicCycleManager


def main():
    print("=" * 60)
    print("NANO SEA v2 — Phase 2 Validation")
    print("=" * 60)

    model = NanoSeaModel(n_layers=2, nanos_per_layer=6, top_k=4)
    trainer = SwarmTrainer(model)

    batch = 2
    seq = 24
    input_ids = torch.randint(0, 8192, (batch, seq))
    target_ids = torch.randint(0, 8192, (batch, seq))

    print("\n[1] Trainer train_step...")
    train_out = trainer.train_step(input_ids, target_ids)
    assert "loss" in train_out and "touch_events" in train_out
    print(f"    PASS — loss={train_out['loss']:.4f}, entropy={train_out['router_entropy']:.4f}")

    print("\n[2] Trainer evaluate...")
    ppl = trainer.evaluate(input_ids, target_ids)
    assert ppl > 0
    print(f"    PASS — perplexity={ppl:.4f}")

    print("\n[3] TouchTensor + FitnessEvaluator...")
    total_nanos = model.total_nanos
    tt = TouchTensor(num_nanos=total_nanos)
    tt.update(train_out["touch_events"])
    fe = FitnessEvaluator()
    scores = fe.evaluate_all(model, tt)
    assert len(scores) == total_nanos
    print(f"    PASS — scored nanos={len(scores)}")

    print("\n[4] Spawner split/new...")
    spawner = NanoSpawner()
    parent = model.layers[0].nano_pool[0]
    split = spawner.spawn(reason="split", parent=parent)
    fresh = spawner.spawn(reason="new")
    assert split.nano_id != parent.nano_id
    assert fresh.hidden_dim >= 32
    print(f"    PASS — split={split.nano_id}, fresh_hidden={fresh.hidden_dim}")

    print("\n[5] Compression + DepositStore...")
    compressor = CompressionEngine()
    survivors, deposits = compressor.compress(model, tt, survival_rate=0.6)
    store = DepositStore(store_dir=str(Path(_nano_train) / "deposits" / "phase2_test"))
    for dep in deposits:
        store.add(dep)
    assert isinstance(survivors, set)
    print(f"    PASS — survivors={len(survivors)}, deposits={len(deposits)}")

    print("\n[6] CosmicCycleManager transition sanity...")
    detector = AbsularityDetector(window_size=2, threshold=10.0)
    cycle = CosmicCycleManager(
        model=model,
        spawner=spawner,
        compressor=compressor,
        detector=detector,
        deposit_store=store,
        fitness_eval=fe,
    )
    phase = cycle.step(trainer, tt, val_loss=0.5, router_entropy=1.0)
    assert phase in {"train", "compress", "deposit", "mutate", "expand"}
    print(f"    PASS — phase={phase}")

    print("\n[7] IndependenceTracker...")
    it = IndependenceTracker()
    it.record("python_refactor", sea_correct=True, llm_correct=True)
    it.record("python_refactor", sea_correct=False, llm_correct=True)
    ratio = it.independence_ratio("python_refactor")
    assert 0.0 <= ratio <= 1.0
    print(f"    PASS — independence ratio={ratio:.2f}")

    print("\n" + "=" * 60)
    print("ALL PHASE 2 TESTS PASSED")
    print("=" * 60)


if __name__ == "__main__":
    main()
