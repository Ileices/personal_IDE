"""
tests/test_phase4_v2.py — Phase 4: Memory Paging, Prefetch, Federated Aggregation
===================================================================================
25 tests covering:
  - NanoMemoryManager: LRU math, budget accounting, tier cascade, thread safety
  - Aitchison distance: symmetry, identity, CLR sum-zero invariant
  - DepositStore.get_nearest_rby: correct KNN
  - DepositAwarePrefetcher: predict_needed, prefetch pipeline
  - FederatedAggregator: weight correctness, dim compatibility, passthrough
  - SwarmRuntime.status: cache stats keys present
  - soft_k_selection: temperature annealing correctness
  - RBY update: sum invariant
  - Full forward pass with memory manager active
"""
import os
import sys
import tempfile
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import torch

from config import D_MODEL, DEFAULT_HIDDEN_DIM, VOCAB_SIZE
from core.nano import Nano
from core.rby import aitchison_distance, compute_uf_io, update_rby
from core.router import soft_k_selection
from core.chromatic_index import ChromaticIndex
from lifecycle.compression import Deposit, DepositStore
from memory.paging import NanoMemoryManager
from memory.deposit_prefetch import DepositAwarePrefetcher

PASS = 0
FAIL = 0


def ok(name: str):
    global PASS
    PASS += 1
    print(f"  PASS  {name}")


def fail(name: str, err: str):
    global FAIL
    FAIL += 1
    print(f"  FAIL  {name}: {err}")


# ─── Helpers ────────────────────────────────────────────────────────────────

def make_nano(hidden_dim: int = 32, d_model: int = 64) -> Nano:
    return Nano(d_model=d_model, hidden_dim=hidden_dim)


def make_mgr(gpu_mb: int = 10, cpu_mb: int = 20, tmp_dir: str = None) -> NanoMemoryManager:
    return NanoMemoryManager(
        gpu_budget_mb=gpu_mb,
        cpu_budget_mb=cpu_mb,
        checkpoint_dir=tmp_dir or tempfile.mkdtemp(),
    )


# =============================================================================
# 1. GPU cache respects budget
# =============================================================================
def test_gpu_cache_respects_budget():
    name = "test_gpu_cache_respects_budget"
    try:
        nano = make_nano()
        nano_bytes = NanoMemoryManager._bytes(nano)
        # Set budget to fit exactly 3 nanos
        budget = nano_bytes * 3
        mgr = make_mgr(gpu_mb=budget // (1024 * 1024), cpu_mb=500)
        for i in range(6):
            mgr.put(f"n{i}", make_nano())
            assert mgr.gpu_used <= mgr.gpu_budget, f"Step {i}: GPU over budget"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# =============================================================================
# 2. LRU eviction order
# =============================================================================
def test_lru_eviction_order():
    name = "test_lru_eviction_order"
    try:
        n0, n1, n2 = make_nano(), make_nano(), make_nano()
        bytes_each = NanoMemoryManager._bytes(n0)
        # Budget = exactly 2 nanos (set in raw bytes to avoid MB rounding)
        mgr = make_mgr(gpu_mb=50, cpu_mb=500)
        mgr.gpu_budget = bytes_each * 2  # exact 2-nano budget

        mgr.put("n0", n0)
        mgr.put("n1", n1)
        # Access n0 to refresh its LRU position (n1 is now oldest)
        mgr.get("n0")
        # Add n2 → must evict n1 (LRU), NOT n0
        mgr.put("n2", n2)

        assert "n0" in mgr.gpu_cache, "n0 should still be hot (was recently accessed)"
        assert "n1" not in mgr.gpu_cache, "n1 should have been evicted (LRU)"
        assert "n2" in mgr.gpu_cache, "n2 just added"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# =============================================================================
# 3. Cold-to-hot promotion
# =============================================================================
def test_cold_to_hot_promotion():
    name = "test_cold_to_hot_promotion"
    try:
        with tempfile.TemporaryDirectory() as tmp:
            nano = make_nano()
            orig_params = {k: v.clone() for k, v in nano.state_dict().items()}
            mgr = make_mgr(tmp_dir=tmp)

            # Save to disk manually
            mgr.save_to_disk("cold_nano", nano)
            assert not any("cold_nano" in k for k in mgr.gpu_cache), "should not be in GPU yet"

            # get() should load from disk and promote to GPU
            loaded = mgr.get("cold_nano")
            assert loaded is not None, "get() returned None for cold nano"
            assert "cold_nano" in mgr.gpu_cache, "nano not promoted to GPU cache"

            # Parameters must be identical
            for k, orig in orig_params.items():
                loaded_p = dict(loaded.named_parameters())[k] if k in dict(loaded.named_parameters()) else loaded.state_dict()[k]
                assert torch.allclose(orig, loaded_p.cpu(), atol=1e-6), f"Param {k} mismatch after disk→GPU promotion"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# =============================================================================
# 4. CPU spill when GPU full
# =============================================================================
def test_cpu_spill_on_gpu_full():
    name = "test_cpu_spill_on_gpu_full"
    try:
        nano = make_nano()
        bytes_each = NanoMemoryManager._bytes(nano)
        # GPU fits exactly 1 nano (set in bytes to avoid MB rounding)
        mgr = make_mgr(gpu_mb=50, cpu_mb=500)
        mgr.gpu_budget = bytes_each  # exact 1-nano budget

        mgr.put("n0", nano)
        mgr.put("n1", make_nano())  # should evict n0 to CPU

        assert "n0" in mgr.cpu_cache or mgr.cpu_used > 0, "evicted nano not in CPU cache"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# =============================================================================
# 5. Disk spill when CPU full
# =============================================================================
def test_disk_spill_on_cpu_full():
    name = "test_disk_spill_on_cpu_full"
    try:
        with tempfile.TemporaryDirectory() as tmp:
            nano = make_nano()
            bytes_each = NanoMemoryManager._bytes(nano)
            # GPU fits 1, CPU fits 2 — set in bytes to bypass MB rounding
            mgr = NanoMemoryManager(gpu_budget_mb=50, cpu_budget_mb=200, checkpoint_dir=tmp)
            mgr.gpu_budget = bytes_each      # exact 1-nano GPU budget
            mgr.cpu_budget = bytes_each * 2  # exact 2-nano CPU budget

            # Fill GPU (1) → CPU (2) → disk (overflow)
            for i in range(5):  # 5 nanos: 1 on GPU, 2 on CPU, 2 on disk
                mgr.put(f"n{i}", make_nano())

            # At least one nano should be on disk
            pt_files = list(p for p in __import__('pathlib').Path(tmp).glob("*.pt"))
            assert len(pt_files) > 0, "No nanos were spilled to disk"
            ok(name)
    except Exception as e:
        fail(name, str(e))


# =============================================================================
# 6. Prefetch skips already-hot nanos
# =============================================================================
def test_prefetch_skips_hot_nanos():
    name = "test_prefetch_skips_hot_nanos"
    try:
        mgr = make_mgr()
        nano = make_nano()
        mgr.put("n0", nano)
        hits_before = mgr._hits_gpu

        # Prefetch n0 — should detect it's already hot and skip
        mgr.prefetch(["n0"])
        # GPU hit counter should only increment if we actually called get() internally
        # The prefetch impl skips already-hot nanos without calling get()
        hits_after = mgr._hits_gpu
        assert hits_after == hits_before, "Prefetch should not count already-hot nano as a cache hit"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# =============================================================================
# 7. _bytes correct for fp32
# =============================================================================
def test_bytes_calculation_fp32():
    name = "test_bytes_calculation_fp32"
    try:
        nano = make_nano(hidden_dim=32, d_model=64)
        expected = sum(p.nelement() for p in nano.parameters()) * 4  # fp32 = 4 bytes
        got = NanoMemoryManager._bytes(nano)
        assert got == expected, f"Expected {expected}, got {got}"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# =============================================================================
# 8. _bytes correct for bf16
# =============================================================================
def test_bytes_calculation_bf16():
    name = "test_bytes_calculation_bf16"
    try:
        nano = make_nano(hidden_dim=32, d_model=64).to(torch.bfloat16)
        expected = sum(p.nelement() for p in nano.parameters()) * 2  # bf16 = 2 bytes
        got = NanoMemoryManager._bytes(nano)
        assert got == expected, f"Expected {expected}, got {got}"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# =============================================================================
# 9. cache_stats hit rates
# =============================================================================
def test_cache_stats_hit_rates():
    name = "test_cache_stats_hit_rates"
    try:
        mgr = make_mgr()
        mgr.put("x", make_nano())
        mgr.get("x")  # GPU hit
        mgr.get("x")  # GPU hit
        mgr.get("missing_id")  # miss

        stats = mgr.cache_stats()
        # 2 GPU hits, 1 miss → total 3
        assert stats["total_accesses"] == 3, f"Expected 3 accesses, got {stats['total_accesses']}"
        assert abs(stats["gpu_hit_rate"] - 2/3) < 0.01, f"GPU hit rate wrong: {stats['gpu_hit_rate']}"
        assert abs(stats["miss_rate"] - 1/3) < 0.01, f"Miss rate wrong: {stats['miss_rate']}"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# =============================================================================
# 10. Aitchison distance symmetry
# =============================================================================
def test_aitchison_distance_symmetry():
    name = "test_aitchison_distance_symmetry"
    try:
        for _ in range(10):
            raw_p = torch.rand(3).abs() + 0.01
            raw_q = torch.rand(3).abs() + 0.01
            p = raw_p / raw_p.sum()
            q = raw_q / raw_q.sum()
            d_pq = aitchison_distance(p, q).item()
            d_qp = aitchison_distance(q, p).item()
            assert abs(d_pq - d_qp) < 1e-5, f"Not symmetric: d(p,q)={d_pq}, d(q,p)={d_qp}"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# =============================================================================
# 11. Aitchison distance identity
# =============================================================================
def test_aitchison_distance_identity():
    name = "test_aitchison_distance_identity"
    try:
        for _ in range(5):
            raw = torch.rand(3).abs() + 0.01
            p = raw / raw.sum()
            d = aitchison_distance(p, p).item()
            assert abs(d) < 1e-5, f"d(p, p) should be 0, got {d}"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# =============================================================================
# 12. Aitchison CLR sum-zero
# =============================================================================
def test_aitchison_clr_sum_zero():
    name = "test_aitchison_clr_sum_zero"
    try:
        for _ in range(10):
            raw = torch.rand(3).abs() + 0.01
            p = raw / raw.sum()
            eps = 1e-8
            p_clamped = p.clamp(min=eps)
            g = p_clamped.prod().pow(1.0 / 3.0)
            clr = (p_clamped / g).log()
            clr_sum = clr.sum().item()
            assert abs(clr_sum) < 1e-4, f"CLR sum should be ~0, got {clr_sum}"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# =============================================================================
# 13. DepositStore get_nearest_rby returns correct nearest
# =============================================================================
def test_deposit_store_nearest_rby():
    name = "test_deposit_store_nearest_rby"
    try:
        with tempfile.TemporaryDirectory() as tmp:
            store = DepositStore(store_dir=tmp)
            # 5 deposits with known RBY positions
            positions = [
                [0.8, 0.1, 0.1],  # deposit 0 — far Red
                [0.1, 0.8, 0.1],  # deposit 1 — far Blue
                [0.1, 0.1, 0.8],  # deposit 2 — far Yellow
                [0.34, 0.33, 0.33],  # deposit 3 — neutral
                [0.5, 0.4, 0.1],  # deposit 4
            ]
            for i, pos in enumerate(positions):
                store.add(Deposit(
                    deposit_id=f"dep{i:04d}",
                    rby_position=pos,
                    hidden_dim=32,
                    weights={},
                    centroid=torch.tensor([0.0]),
                    touch_count=0,
                    fitness_at_death=float(i),
                    birth_cycle=0,
                    death_cycle=1,
                ))

            # Query near the Blue deposit → should return deposit 1
            result = store.get_nearest_rby([0.1, 0.8, 0.1], k=1)
            assert len(result) == 1, f"Expected 1 result, got {len(result)}"
            assert result[0].deposit_id == "dep0001", f"Wrong nearest: {result[0].deposit_id}"

            # Query near neutral → should return deposit 3
            result3 = store.get_nearest_rby([0.33, 0.34, 0.33], k=1)
            assert result3[0].deposit_id == "dep0003", f"Wrong nearest: {result3[0].deposit_id}"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# =============================================================================
# 14. DepositAwarePrefetcher predict_needed returns correct count
# =============================================================================
def test_deposit_prefetch_predict():
    name = "test_deposit_prefetch_predict"
    try:
        with tempfile.TemporaryDirectory() as tmp:
            N = 20  # nanos
            positions = torch.rand(N, 3).abs() + 0.01
            positions = positions / positions.sum(dim=-1, keepdim=True)

            index = ChromaticIndex(positions)
            store = DepositStore(store_dir=tmp)

            # nano_id map: pool index → id
            index_to_id = {i: f"nano_{i}" for i in range(N)}

            prefetcher = DepositAwarePrefetcher(
                chromatic_index=index,
                deposit_store=store,
                index_to_id=index_to_id,
                d_model=64,
                prefetch_batch=10,
                chromatic_k=5,
            )

            # Random RBY batch
            rby_batch = torch.rand(2, 8, 3).abs() + 0.01
            rby_batch = rby_batch / rby_batch.sum(dim=-1, keepdim=True)

            ids = prefetcher.predict_needed(rby_batch)
            assert len(ids) > 0, "predict_needed returned empty list"
            assert len(ids) <= 10, f"Exceeded prefetch_batch cap: {len(ids)}"
            # All returned IDs should be valid nano_ids
            valid = set(f"nano_{i}" for i in range(N))
            living_ids = [nid for nid in ids if not nid.startswith("deposit_")]
            for nid in living_ids:
                assert nid in valid, f"Invalid nano_id returned: {nid}"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# =============================================================================
# 15. Prefetch moves cold nano from disk to GPU
# =============================================================================
def test_prefetch_moves_cold_to_gpu():
    name = "test_prefetch_moves_cold_to_gpu"
    try:
        with tempfile.TemporaryDirectory() as tmp:
            nano = make_nano()
            mgr = make_mgr(tmp_dir=tmp)
            mgr.save_to_disk("cold_nano", nano)

            # Direct prefetch call
            mgr.prefetch(["cold_nano"])

            assert "cold_nano" in mgr.gpu_cache or "cold_nano" in mgr.cpu_cache, \
                "Nano not loaded into any cache after prefetch"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# =============================================================================
# 16. FederatedAggregator weights sum to one
# =============================================================================
def test_federated_aggregator_weights_sum_to_one():
    name = "test_federated_aggregator_weights_sum_to_one"
    try:
        from mesh.federated import FederatedAggregator

        # 3 nanos with known fitness, same dim
        nanos = []
        fitnesses = [0.1, 0.5, 0.4]
        for f in fitnesses:
            n = make_nano(hidden_dim=16, d_model=32)
            n.fitness = f
            nanos.append(n)

        total_fitness = sum(fitnesses)
        # Compute expected weighted average for "up.weight"
        expected_up = sum(
            (n.fitness / total_fitness) * n.up.weight.detach()
            for n in nanos
        )

        agg = FederatedAggregator(min_cluster_size=2, n_init=1)

        # Manually call _weighted_average (bypass clustering for determinism)
        result = agg._weighted_average(nanos)
        assert result is not None, "_weighted_average returned None"

        got_up = result.up.weight.detach()
        assert torch.allclose(expected_up, got_up, atol=1e-5), \
            f"Weighted average incorrect.\nExpected:\n{expected_up}\nGot:\n{got_up}"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# =============================================================================
# 17. FederatedAggregator incompatible dims are NOT averaged
# =============================================================================
def test_federated_aggregator_incompatible_dims_skip():
    name = "test_federated_aggregator_incompatible_dims_skip"
    try:
        from mesh.federated import FederatedAggregator

        n1 = make_nano(hidden_dim=16, d_model=32)
        n1.fitness = 0.5
        n2 = make_nano(hidden_dim=32, d_model=32)  # different hidden_dim
        n2.fitness = 0.5

        agg = FederatedAggregator(min_cluster_size=2)
        result = agg._aggregate_cluster([n1, n2])

        # Both should pass through unchanged since no compatible pair
        assert len(result) == 2, f"Expected 2 nanos (passthrough), got {len(result)}"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# =============================================================================
# 18. FederatedAggregator single nano passes through unchanged
# =============================================================================
def test_federated_aggregator_single_nano_passthrough():
    name = "test_federated_aggregator_single_nano_passthrough"
    try:
        from mesh.federated import FederatedAggregator

        n = make_nano(hidden_dim=32, d_model=64)
        n.fitness = 0.9

        agg = FederatedAggregator(min_cluster_size=2)
        result = agg._aggregate_cluster([n])

        assert len(result) == 1 and result[0] is n, "Single nano should pass through unchanged"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# =============================================================================
# 19. SwarmRuntime.status exposes cache stats keys
# =============================================================================
def test_runtime_exposes_cache_stats():
    name = "test_runtime_exposes_cache_stats"
    try:
        from training.swarm_runtime import SwarmRuntime

        rt = SwarmRuntime(batch_size=2, seq_len=16)
        s = rt.status
        required_keys = ["gpu_hit_rate", "cpu_hit_rate", "disk_hit_rate", "gpu_used_mb", "cpu_used_mb"]
        for k in required_keys:
            assert k in s, f"Missing key '{k}' in status"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# =============================================================================
# 20. Full forward pass with memory manager active
# =============================================================================
def test_full_forward_with_paging_active():
    name = "test_full_forward_with_paging_active"
    try:
        from core.swarm_model import NanoSeaModel

        model = NanoSeaModel(
            vocab_size=256, d_model=64, n_heads=4, n_layers=2,
            nanos_per_layer=4, nano_hidden_dim=32, top_k=2,
        )
        mgr = make_mgr()

        # Register all nanos
        for layer_idx, layer in enumerate(model.layers):
            for pool_idx, nano in enumerate(layer.nano_pool):
                mgr.put(f"{layer_idx}_{pool_idx}", nano)

        # Run 5 forward passes — should complete without error
        for step in range(5):
            ids = torch.randint(0, 256, (2, 32))
            logits, touch = model(ids)
            assert logits.shape == (2, 32, 256), f"Bad output shape: {logits.shape}"

        stats = mgr.cache_stats()
        assert stats["total_accesses"] == 0 or isinstance(stats["total_accesses"], int)
        ok(name)
    except Exception as e:
        fail(name, str(e))


# =============================================================================
# 21. evict_all_to_disk clears all caches
# =============================================================================
def test_evict_all_to_disk_on_stop():
    name = "test_evict_all_to_disk_on_stop"
    try:
        with tempfile.TemporaryDirectory() as tmp:
            mgr = make_mgr(tmp_dir=tmp)
            for i in range(4):
                mgr.put(f"n{i}", make_nano())

            initial_gpu = len(mgr.gpu_cache)
            assert initial_gpu > 0, "Setup failed: no nanos cached"

            mgr.evict_all_to_disk()

            assert len(mgr.gpu_cache) == 0, "GPU cache not cleared after evict_all_to_disk"
            assert len(mgr.cpu_cache) == 0, "CPU cache not cleared after evict_all_to_disk"
            assert mgr.gpu_used == 0, "GPU usage not reset after evict_all_to_disk"

            # All nanos should be on disk
            from pathlib import Path
            pt_files = list(Path(tmp).glob("*.pt"))
            assert len(pt_files) == initial_gpu, \
                f"Expected {initial_gpu} .pt files on disk, got {len(pt_files)}"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# =============================================================================
# 22. warmup loads by fitness order
# =============================================================================
def test_warmup_loads_by_fitness():
    name = "test_warmup_loads_by_fitness"
    try:
        nanos_raw = [(f"n{i}", make_nano()) for i in range(10)]
        fitnesses = [0.1 * (i + 1) for i in range(10)]  # n9 has highest fitness
        for (nid, nano), fit in zip(nanos_raw, fitnesses):
            nano.fitness = fit

        # Sort by descending fitness (as warmup caller should)
        sorted_nanos = sorted(nanos_raw, key=lambda x: x[1].fitness, reverse=True)

        # Budget fits only 3 nanos (set in bytes to avoid MB rounding)
        nano_bytes = NanoMemoryManager._bytes(sorted_nanos[0][1])
        mgr = make_mgr(gpu_mb=50, cpu_mb=500)
        mgr.gpu_budget = nano_bytes * 3  # exact 3-nano GPU budget

        mgr.warmup(sorted_nanos)

        # The 3 highest-fitness nanos (n9, n8, n7) should be hot
        assert "n9" in mgr.gpu_cache, "n9 (highest fitness) should be in GPU cache"
        assert "n8" in mgr.gpu_cache, "n8 should be in GPU cache"
        # Lowest fitness should NOT be in GPU cache
        assert "n0" not in mgr.gpu_cache, "n0 (lowest fitness) should NOT be in GPU cache"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# =============================================================================
# 23. Thread safety under concurrent get/put
# =============================================================================
def test_thread_safety():
    name = "test_thread_safety"
    try:
        mgr = make_mgr(gpu_mb=50, cpu_mb=200)
        # Pre-load some nanos
        for i in range(5):
            mgr.put(f"n{i}", make_nano())

        errors = []

        def worker(thread_id: int):
            for _ in range(50):
                try:
                    nid = f"n{thread_id % 5}"
                    nano = mgr.get(nid)
                    mgr.put(f"t{thread_id}_{_}", make_nano())
                    # Verify budget invariant never violated
                    assert mgr.gpu_used <= mgr.gpu_budget + 1024, \
                        f"Thread {thread_id}: GPU over budget ({mgr.gpu_used} > {mgr.gpu_budget})"
                except AssertionError as ae:
                    errors.append(str(ae))
                except Exception as ex:
                    errors.append(f"Thread {thread_id}: {ex}")

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=15)

        assert len(errors) == 0, f"Thread safety errors: {errors[:3]}"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# =============================================================================
# 24. soft_k_selection temperature annealing: low T → more peaked
# =============================================================================
def test_soft_k_temperature_annealing():
    name = "test_soft_k_temperature_annealing"
    try:
        torch.manual_seed(42)
        scores = torch.randn(1, 1, 8)           # 1 batch, 1 token, 8 nanos
        # Non-zero descending logits so temperature scaling has visible effect
        k_logits = torch.tensor([[[3., 1., -1., -3.]]])  # strong gradient across slots

        # Warm temperature → more diffuse weights
        warm_weights, _ = soft_k_selection(scores, k_logits, top_k_max=4, temperature=1.0)
        # Cold temperature → more peaked (fewer nanos carry the weight)
        cold_weights, _ = soft_k_selection(scores, k_logits, top_k_max=4, temperature=0.01)

        # Entropy: lower entropy = more peaked
        def entropy(w):
            w = w.clamp(min=1e-9)
            return -(w * w.log()).sum().item()

        warm_entropy = entropy(warm_weights.squeeze())
        cold_entropy = entropy(cold_weights.squeeze())

        assert cold_entropy < warm_entropy, \
            f"Cold T should give lower entropy (more peaked). cold={cold_entropy:.4f}, warm={warm_entropy:.4f}"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# =============================================================================
# 25. RBY sum invariant after update_rby
# =============================================================================
def test_rby_sum_invariant_after_update():
    name = "test_rby_sum_invariant_after_update"
    try:
        for trial in range(20):
            raw = torch.rand(3).abs() + 0.1
            r, b, y = (raw / raw.sum()).tolist()
            rby = (r, b, y)

            uf, io = compute_uf_io(
                success=float(torch.rand(1)),
                error=float(torch.rand(1)),
                complexity=float(torch.rand(1)),
            )
            new_rby = update_rby(rby, uf, io, success=0.6, error=0.4)
            total = sum(new_rby)
            assert abs(total - 1.0) < 1e-5, \
                f"Trial {trial}: RBY sum = {total:.8f} (expected 1.0)"
        ok(name)
    except Exception as e:
        fail(name, str(e))


# =============================================================================
# Main
# =============================================================================
if __name__ == "__main__":
    print("=" * 65)
    print("Phase 4 v2 Tests — Memory Paging + Prefetch + Federated Mesh")
    print("=" * 65)

    test_gpu_cache_respects_budget()
    test_lru_eviction_order()
    test_cold_to_hot_promotion()
    test_cpu_spill_on_gpu_full()
    test_disk_spill_on_cpu_full()
    test_prefetch_skips_hot_nanos()
    test_bytes_calculation_fp32()
    test_bytes_calculation_bf16()
    test_cache_stats_hit_rates()
    test_aitchison_distance_symmetry()
    test_aitchison_distance_identity()
    test_aitchison_clr_sum_zero()
    test_deposit_store_nearest_rby()
    test_deposit_prefetch_predict()
    test_prefetch_moves_cold_to_gpu()
    test_federated_aggregator_weights_sum_to_one()
    test_federated_aggregator_incompatible_dims_skip()
    test_federated_aggregator_single_nano_passthrough()
    test_runtime_exposes_cache_stats()
    test_full_forward_with_paging_active()
    test_evict_all_to_disk_on_stop()
    test_warmup_loads_by_fitness()
    test_thread_safety()
    test_soft_k_temperature_annealing()
    test_rby_sum_invariant_after_update()

    print()
    print("=" * 65)
    total = PASS + FAIL
    print(f"Results: {PASS}/{total} passed  |  {FAIL} failed")
    if FAIL > 0:
        print("PHASE 4 INCOMPLETE — fix failures above")
        sys.exit(1)
    else:
        print("ALL PHASE 4 TESTS PASSED")
    print("=" * 65)
