"""
Tiered Storage Manager — Hot/Warm/Cold/Frozen/Compressed.
Manages nano promotion/demotion across storage tiers based on usage, decay, and capacity.
"""
from __future__ import annotations
import os
import time
import math
import json
import shutil
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple
from enum import IntEnum
from pathlib import Path

log = logging.getLogger("storage")


class StorageTier(IntEnum):
    HOT = 0         # RAM — active inference nanos
    WARM = 1        # SSD — recently used
    COLD = 2        # HDD — infrequent
    FROZEN = 3      # Cloud/external — rare
    COMPRESSED = 4  # RBY glyphs — "dead" but reconstructable


@dataclass
class StoredNano:
    """Metadata for a nano in storage."""
    nano_id: str
    nano_type: str
    tier: StorageTier
    size_bytes: int
    importance: float = 0.5
    last_access: float = field(default_factory=time.time)
    access_count: int = 0
    decay_rate: float = 0.01
    storage_path: Optional[str] = None

    @property
    def current_importance(self) -> float:
        """importance(t) = importance(0) × e^(-λt) × (1 + access_frequency)"""
        elapsed = time.time() - self.last_access
        freq = self.access_count / max(1, elapsed / 3600)  # Per hour
        return self.importance * math.exp(-self.decay_rate * elapsed / 3600) * (1 + freq)

    @property
    def recency_score(self) -> float:
        """recency = 1 / (1 + log(time_since_access))"""
        elapsed = max(1, time.time() - self.last_access)
        return 1.0 / (1.0 + math.log(elapsed))

    @property
    def forget_priority(self) -> float:
        """Higher = forget sooner. (1 - importance) × decay × (1 / access_freq)"""
        freq = max(0.001, self.access_count / max(1, (time.time() - self.last_access) / 3600))
        return (1.0 - self.current_importance) * self.decay_rate * (1.0 / freq)

    def touch(self):
        self.last_access = time.time()
        self.access_count += 1


class TieredStorageManager:
    """
    Manages nano storage across 5 tiers: Hot (RAM) → Warm (SSD) → Cold (HDD) →
    Frozen (External) → Compressed (Glyphs).
    """

    def __init__(self, base_path: Path,
                 hot_max_mb: int = 512,
                 warm_max_mb: int = 4096,
                 cold_max_mb: int = 40960,
                 compression_threshold: float = 0.85):
        self.base_path = base_path
        self.hot_max = hot_max_mb * 1024 * 1024
        self.warm_max = warm_max_mb * 1024 * 1024
        self.cold_max = cold_max_mb * 1024 * 1024
        self.compression_threshold = compression_threshold

        self._nanos: Dict[str, StoredNano] = {}
        self._hot: Dict[str, bytes] = {}  # In-memory nano weights
        self._tier_usage: Dict[StorageTier, int] = {t: 0 for t in StorageTier}

        # Create tier directories
        for tier in ["warm", "cold", "frozen", "compressed"]:
            (base_path / tier).mkdir(parents=True, exist_ok=True)

    @property
    def hot_usage_pct(self) -> float:
        return self._tier_usage[StorageTier.HOT] / max(1, self.hot_max)

    @property
    def warm_usage_pct(self) -> float:
        return self._tier_usage[StorageTier.WARM] / max(1, self.warm_max)

    @property
    def needs_compression(self) -> bool:
        """Check if any tier exceeds the compression threshold (85-90%)."""
        return (self.hot_usage_pct >= self.compression_threshold or
                self.warm_usage_pct >= self.compression_threshold)

    def store(self, nano_id: str, nano_type: str, data: bytes,
              tier: StorageTier = StorageTier.HOT,
              importance: float = 0.5) -> StoredNano:
        """Store a nano in the specified tier."""
        size = len(data)
        entry = StoredNano(
            nano_id=nano_id, nano_type=nano_type,
            tier=tier, size_bytes=size, importance=importance,
        )

        if tier == StorageTier.HOT:
            self._hot[nano_id] = data
        else:
            tier_name = tier.name.lower()
            path = self.base_path / tier_name / f"{nano_id}.bin"
            path.write_bytes(data)
            entry.storage_path = str(path)

        self._nanos[nano_id] = entry
        self._tier_usage[tier] = self._tier_usage.get(tier, 0) + size
        return entry

    def retrieve(self, nano_id: str) -> Optional[bytes]:
        """Retrieve nano data, promoting to Hot if needed."""
        entry = self._nanos.get(nano_id)
        if not entry:
            return None

        entry.touch()

        if entry.tier == StorageTier.HOT:
            return self._hot.get(nano_id)

        # Promote to hot
        if entry.storage_path and os.path.exists(entry.storage_path):
            data = Path(entry.storage_path).read_bytes()
            self._promote(nano_id, data)
            return data
        return None

    def _promote(self, nano_id: str, data: bytes):
        """Promote a nano to Hot tier."""
        entry = self._nanos.get(nano_id)
        if not entry:
            return

        # Make room if needed
        while self._tier_usage[StorageTier.HOT] + len(data) > self.hot_max:
            if not self._evict_lru(StorageTier.HOT):
                break

        old_tier = entry.tier
        self._tier_usage[old_tier] -= entry.size_bytes
        entry.tier = StorageTier.HOT
        self._hot[nano_id] = data
        self._tier_usage[StorageTier.HOT] += entry.size_bytes
        log.debug(f"Promoted {nano_id}: {old_tier.name} → HOT")

    def _evict_lru(self, tier: StorageTier) -> bool:
        """Evict least recently used nano from tier. Returns True if evicted."""
        candidates = [(nid, e) for nid, e in self._nanos.items() if e.tier == tier]
        if not candidates:
            return False

        # Sort by forget priority (highest = evict first)
        candidates.sort(key=lambda x: x[1].forget_priority, reverse=True)
        evict_id, evict_entry = candidates[0]

        next_tier = StorageTier(min(tier.value + 1, StorageTier.COMPRESSED.value))

        if tier == StorageTier.HOT:
            data = self._hot.pop(evict_id, b"")
            if data:
                tier_name = next_tier.name.lower()
                path = self.base_path / tier_name / f"{evict_id}.bin"
                path.write_bytes(data)
                evict_entry.storage_path = str(path)

        self._tier_usage[tier] -= evict_entry.size_bytes
        evict_entry.tier = next_tier
        self._tier_usage[next_tier] = self._tier_usage.get(next_tier, 0) + evict_entry.size_bytes
        log.debug(f"Evicted {evict_id}: {tier.name} → {next_tier.name}")
        return True

    def get_tier_stats(self) -> Dict[str, Dict]:
        """Get statistics for each storage tier."""
        stats = {}
        for tier in StorageTier:
            nanos_in_tier = [e for e in self._nanos.values() if e.tier == tier]
            stats[tier.name] = {
                "count": len(nanos_in_tier),
                "bytes": self._tier_usage.get(tier, 0),
                "avg_importance": (sum(e.current_importance for e in nanos_in_tier) /
                                   max(1, len(nanos_in_tier))),
            }
        return stats

    def get_all_in_tier(self, tier: StorageTier) -> List[str]:
        return [nid for nid, e in self._nanos.items() if e.tier == tier]

    def remove(self, nano_id: str):
        """Remove a nano from storage entirely."""
        entry = self._nanos.pop(nano_id, None)
        if not entry:
            return
        if entry.tier == StorageTier.HOT:
            self._hot.pop(nano_id, None)
        elif entry.storage_path and os.path.exists(entry.storage_path):
            os.remove(entry.storage_path)
        self._tier_usage[entry.tier] -= entry.size_bytes
