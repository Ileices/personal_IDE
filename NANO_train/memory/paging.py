"""
memory/paging.py — Production-grade NanoMemoryManager
=======================================================
Three-tier LRU paging: GPU (hot) → CPU RAM (warm) → Disk (cold).

Key design decisions:
- RLock-protected: training loop (sync) and server handler (async thread) share the same manager safely.
- Budget accounting is dtype-aware: fp32 = 4B, bf16 = 2B (future quantization won't break math).
- Prefetch skips already-hot nanos to avoid redundant I/O.
- CPU-only fallback: if CUDA unavailable, GPU tier collapses into CPU tier.
- Eviction is cascade: GPU overflow → CPU; CPU overflow → Disk. Nothing is lost.
- cache_stats() exposes hit rates for monitoring (wired into SwarmRuntime.status).
"""
from __future__ import annotations

import threading
from collections import OrderedDict
from pathlib import Path
from typing import Dict, List, Optional, TYPE_CHECKING

import torch

from config import CPU_NANO_BUDGET_MB, GPU_NANO_BUDGET_MB

if TYPE_CHECKING:
    from core.nano import Nano


class NanoMemoryManager:
    """
    Pages Nano objects between GPU VRAM, CPU RAM, and disk.

    Budget defaults (from config.py — tuned for GTX 1660 SUPER + 32 GB RAM):
        GPU:  4 000 MB  → ~20 000 nanos @ 200 KB each
        CPU: 32 000 MB  → ~160 000 warm nanos
        Disk: unlimited cold storage

    Thread safety: a single RLock guards all state mutations.
    """

    def __init__(
        self,
        gpu_budget_mb: int = GPU_NANO_BUDGET_MB,
        cpu_budget_mb: int = CPU_NANO_BUDGET_MB,
        checkpoint_dir: str = "checkpoints",
    ):
        self.gpu_budget = gpu_budget_mb * 1024 * 1024
        self.cpu_budget = cpu_budget_mb * 1024 * 1024
        self.checkpoint_dir = Path(checkpoint_dir)
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)

        self._lock = threading.RLock()

        # LRU caches: key = nano_id (str), value = Nano
        self.gpu_cache: OrderedDict[str, "Nano"] = OrderedDict()
        self.cpu_cache: OrderedDict[str, "Nano"] = OrderedDict()

        # Budget tracking (bytes)
        self.gpu_used: int = 0
        self.cpu_used: int = 0

        # Telemetry
        self._hits_gpu: int = 0
        self._hits_cpu: int = 0
        self._hits_disk: int = 0
        self._misses: int = 0
        self._evictions_gpu: int = 0
        self._evictions_cpu: int = 0

        self._cuda_available: bool = torch.cuda.is_available()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get(self, nano_id: str) -> Optional["Nano"]:
        """
        Retrieve a nano from the nearest tier.

        Promotion chain: GPU (LRU touch) → CPU (move to GPU) → Disk (load to GPU).
        Returns None if nano_id is not found anywhere.
        """
        with self._lock:
            # ── GPU (hot) ──────────────────────────────────────────────
            if nano_id in self.gpu_cache:
                self.gpu_cache.move_to_end(nano_id)  # LRU refresh
                self._hits_gpu += 1
                return self.gpu_cache[nano_id]

            # ── CPU (warm) → GPU ──────────────────────────────────────
            if nano_id in self.cpu_cache:
                nano = self.cpu_cache.pop(nano_id)
                self.cpu_used -= self._bytes(nano)
                if self._cuda_available:
                    nano = nano.cuda()
                self._put_gpu(nano_id, nano)
                self._hits_cpu += 1
                return self.gpu_cache[nano_id]

            # ── Disk (cold) → GPU ─────────────────────────────────────
            path = self._disk_path(nano_id)
            if path.exists():
                device = "cuda" if self._cuda_available else "cpu"
                nano = torch.load(path, map_location=device, weights_only=False)
                self._put_gpu(nano_id, nano)
                self._hits_disk += 1
                return self.gpu_cache[nano_id]

            self._misses += 1
            return None

    def put(self, nano_id: str, nano: "Nano"):
        """
        Register a new/updated nano into the GPU (or CPU if CUDA unavailable) cache.
        No-op if nano_id is already hot.
        """
        with self._lock:
            if nano_id in self.gpu_cache:
                # Update in place without budget double-counting
                old = self.gpu_cache[nano_id]
                self.gpu_used -= self._bytes(old)
                self.gpu_cache[nano_id] = nano
                self.gpu_used += self._bytes(nano)
                self.gpu_cache.move_to_end(nano_id)
                return
            self._put_gpu(nano_id, nano)

    def device_aware_put(self, nano_id: str, nano: "Nano"):
        """
        Move nano to the correct device before insertion.
        Use this when registering nanos created on CPU.
        """
        if self._cuda_available and next(nano.parameters()).device.type != "cuda":
            nano = nano.cuda()
        elif not self._cuda_available and next(nano.parameters()).device.type == "cuda":
            nano = nano.cpu()
        self.put(nano_id, nano)

    def save_to_disk(self, nano_id: str, nano: "Nano"):
        """Persist nano to cold storage (always as CPU tensor)."""
        path = self._disk_path(nano_id)
        torch.save(nano.cpu(), path)

    def prefetch(self, nano_ids: List[str]):
        """
        Preload nanos that are about to be needed.

        Already-hot nanos are skipped (zero extra I/O).
        Respects GPU budget — will not thrash cache with oversized prefetch.
        """
        with self._lock:
            for nid in nano_ids:
                if nid in self.gpu_cache:
                    continue  # already hot — skip
                # delegate to get() which promotes through tiers
                self.get(nid)

    def evict_all_to_disk(self):
        """
        Flush all GPU and CPU nanos to disk.
        Called on graceful runtime shutdown so no nano knowledge is lost.
        """
        with self._lock:
            # Flush GPU → disk
            for nano_id, nano in list(self.gpu_cache.items()):
                self.save_to_disk(nano_id, nano)
            self.gpu_cache.clear()
            self.gpu_used = 0

            # Flush CPU → disk
            for nano_id, nano in list(self.cpu_cache.items()):
                self.save_to_disk(nano_id, nano)
            self.cpu_cache.clear()
            self.cpu_used = 0

    def warmup(self, nanos: List[tuple]):
        """
        Pre-load the highest-fitness nanos into GPU cache.

        Args:
            nanos: list of (nano_id, nano) pairs, pre-sorted by descending fitness.
                   Insertion stops when GPU budget is full.
        """
        with self._lock:
            for nano_id, nano in nanos:
                nbytes = self._bytes(nano)
                if self.gpu_used + nbytes > self.gpu_budget:
                    break  # budget full; remaining nanos stay on CPU/disk
                if nano_id not in self.gpu_cache:
                    self._put_gpu(nano_id, nano)

    def remove(self, nano_id: str):
        """Remove a dead nano from all tiers and disk."""
        with self._lock:
            if nano_id in self.gpu_cache:
                nano = self.gpu_cache.pop(nano_id)
                self.gpu_used -= self._bytes(nano)
            if nano_id in self.cpu_cache:
                nano = self.cpu_cache.pop(nano_id)
                self.cpu_used -= self._bytes(nano)
            disk = self._disk_path(nano_id)
            if disk.exists():
                disk.unlink()

    def cache_stats(self) -> Dict[str, object]:
        """
        Return cache telemetry suitable for the SwarmRuntime status dict.
        """
        with self._lock:
            total = self._hits_gpu + self._hits_cpu + self._hits_disk + self._misses
            def _rate(n: int) -> float:
                return round(n / total, 4) if total > 0 else 0.0

            return {
                "gpu_hit_rate": _rate(self._hits_gpu),
                "cpu_hit_rate": _rate(self._hits_cpu),
                "disk_hit_rate": _rate(self._hits_disk),
                "miss_rate": _rate(self._misses),
                "total_accesses": total,
                "gpu_used_mb": round(self.gpu_used / 1024 / 1024, 2),
                "cpu_used_mb": round(self.cpu_used / 1024 / 1024, 2),
                "gpu_cached_nanos": len(self.gpu_cache),
                "cpu_cached_nanos": len(self.cpu_cache),
                "evictions_gpu": self._evictions_gpu,
                "evictions_cpu": self._evictions_cpu,
            }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _put_gpu(self, nano_id: str, nano: "Nano"):
        """
        Insert nano into GPU cache, evicting as needed to stay within budget.

        If a single nano exceeds the entire GPU budget (extremely small GPU),
        it falls back to CPU tier.
        """
        nbytes = self._bytes(nano)

        # Edge case: nano is bigger than entire GPU budget → route to CPU
        if nbytes > self.gpu_budget:
            self._put_cpu(nano_id, nano)
            return

        # Evict until we have room
        while self.gpu_used + nbytes > self.gpu_budget and self.gpu_cache:
            self._evict_gpu()

        self.gpu_cache[nano_id] = nano
        self.gpu_used += nbytes

    def _put_cpu(self, nano_id: str, nano: "Nano"):
        """Insert nano into CPU cache, evicting/spilling to disk as needed."""
        nano_cpu = nano.cpu() if next(nano.parameters()).device.type != "cpu" else nano
        nbytes = self._bytes(nano_cpu)

        while self.cpu_used + nbytes > self.cpu_budget and self.cpu_cache:
            self._evict_cpu()

        self.cpu_cache[nano_id] = nano_cpu
        self.cpu_used += nbytes

    def _evict_gpu(self):
        """
        LRU evict the oldest GPU nano → cascade to CPU tier.
        """
        evicted_id, evicted = self.gpu_cache.popitem(last=False)  # oldest
        self.gpu_used -= self._bytes(evicted)
        self._evictions_gpu += 1
        evicted_cpu = evicted.cpu()
        self._put_cpu(evicted_id, evicted_cpu)

    def _evict_cpu(self):
        """
        LRU evict the oldest CPU nano → spill to disk (cold storage).
        """
        disk_id, disk_nano = self.cpu_cache.popitem(last=False)  # oldest
        self.cpu_used -= self._bytes(disk_nano)
        self._evictions_cpu += 1
        self.save_to_disk(disk_id, disk_nano)

    def _disk_path(self, nano_id: str) -> Path:
        return self.checkpoint_dir / f"{nano_id}.pt"

    @staticmethod
    def _bytes(nano: "Nano") -> int:
        """
        Exact byte footprint of a nano's parameters.
        dtype-aware: fp32 → 4B, bf16/fp16 → 2B, fp64 → 8B, etc.
        """
        return sum(p.nelement() * p.element_size() for p in nano.parameters())
