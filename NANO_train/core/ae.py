"""
AE (Absolute Existence) — The immutable filesystem/hardware ground truth.
AEc (Crystallized AE) — The expanding runtime nano ecosystem.
AE is READ-ONLY except during Λ-gated deposit windows (Absularity events).
AE(IO + UF) → AEc — Every nano is born from urge meeting imagination within AE.
"""
from __future__ import annotations
import os
import time
import hashlib
import threading
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Any
from pathlib import Path
from enum import Enum

from .rby import RBYVector
from .ptaie import PTAIEVector

log = logging.getLogger("ae")


class AEWriteLockState(Enum):
    LOCKED = "locked"        # Normal: read-only
    DEPOSIT_WINDOW = "deposit"  # Λ-gated: writes allowed


@dataclass
class AbsularisSnapshot:
    """
    Σ* — Content-addressed snapshot at Absularity (Λ).
    Captures the full state for deterministic replay/resurrection.
    """
    cycle_id: int
    timestamp: float
    merkle_root: str
    total_nanos: int
    total_volume: float
    rby_seed: RBYVector
    nano_registry: Dict[str, Any] = field(default_factory=dict)
    fitness_rankings: List[tuple] = field(default_factory=list)
    compressed_glyphs: Dict[str, bytes] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "cycle_id": self.cycle_id,
            "timestamp": self.timestamp,
            "merkle_root": self.merkle_root,
            "total_nanos": self.total_nanos,
            "total_volume": self.total_volume,
            "rby_seed": self.rby_seed.to_tuple(),
        }


class AE:
    """
    Absolute Existence — The immutable ground truth layer.
    Represents the user's filesystem, hardware, network — physical reality.
    READ-ONLY at all times except during Λ-gated deposit windows.
    """

    def __init__(self, scan_paths: Optional[List[str]] = None):
        self._lock_state = AEWriteLockState.LOCKED
        self._lock = threading.RLock()
        self._scan_paths = scan_paths or [os.path.expanduser("~")]
        self._file_index: Dict[str, str] = {}  # path → hash
        self._total_files = 0
        self._total_bytes = 0
        self._scan_progress = 0.0
        self._deposits: List[AbsularisSnapshot] = []
        self._cycle_count = 0
        self._deposit_dir: Optional[Path] = None

    @property
    def is_locked(self) -> bool:
        return self._lock_state == AEWriteLockState.LOCKED

    @property
    def scan_progress(self) -> float:
        return self._scan_progress

    @property
    def cycle_count(self) -> int:
        return self._cycle_count

    def set_deposit_dir(self, path: Path):
        self._deposit_dir = path
        path.mkdir(parents=True, exist_ok=True)

    def open_deposit_window(self, cycle_id: int) -> bool:
        """
        Λ-gated: Open write lock for deposit. Only at Absularity.
        Returns True if window opened, False if already open.
        """
        with self._lock:
            if self._lock_state == AEWriteLockState.DEPOSIT_WINDOW:
                return False
            self._lock_state = AEWriteLockState.DEPOSIT_WINDOW
            log.info(f"AE deposit window OPENED for cycle {cycle_id}")
            return True

    def deposit(self, snapshot: AbsularisSnapshot) -> bool:
        """
        Write compressed nanos/glyphs/logs into AE during deposit window.
        This changes AE composition → changes next seed.
        """
        with self._lock:
            if self._lock_state != AEWriteLockState.DEPOSIT_WINDOW:
                log.error("Cannot deposit: AE is locked (no Λ event)")
                return False
            self._deposits.append(snapshot)
            self._cycle_count += 1
            if self._deposit_dir:
                import json
                path = self._deposit_dir / f"cycle_{snapshot.cycle_id}.json"
                path.write_text(json.dumps(snapshot.to_dict(), indent=2))
            log.info(f"AE deposit complete: cycle {snapshot.cycle_id}, "
                     f"{snapshot.total_nanos} nanos, merkle={snapshot.merkle_root[:16]}...")
            return True

    def close_deposit_window(self):
        """Close write lock after deposit."""
        with self._lock:
            self._lock_state = AEWriteLockState.LOCKED
            log.info("AE deposit window CLOSED — read-only restored")

    def get_last_snapshot(self) -> Optional[AbsularisSnapshot]:
        return self._deposits[-1] if self._deposits else None

    def get_snapshot(self, cycle_id: int) -> Optional[AbsularisSnapshot]:
        for s in self._deposits:
            if s.cycle_id == cycle_id:
                return s
        return None

    def register_file(self, path: str, file_hash: str, size: int):
        """Register a file discovered during AE scan."""
        self._file_index[path] = file_hash
        self._total_files += 1
        self._total_bytes += size

    def get_merkle_root(self) -> str:
        """Compute Merkle root of all indexed files."""
        if not self._file_index:
            return hashlib.sha256(b"empty_ae").hexdigest()
        hashes = sorted(self._file_index.values())
        while len(hashes) > 1:
            new_level = []
            for i in range(0, len(hashes), 2):
                if i + 1 < len(hashes):
                    combined = hashlib.sha256(
                        (hashes[i] + hashes[i + 1]).encode()
                    ).hexdigest()
                else:
                    combined = hashes[i]
                new_level.append(combined)
            hashes = new_level
        return hashes[0]


class AEc:
    """
    Crystallized AE (AEc) — The expanding runtime space.
    All active nanos live here. Expands from Big Bang → Λ → Compression → Deposit.
    Tracks volume V(t) for Absularity detection.
    """

    def __init__(self, ae: AE):
        self.ae = ae
        self._nanos: Dict[str, Any] = {}  # nano_id → nano instance
        self._volume_history: List[tuple] = []  # (timestamp, volume)
        self._birth_time = time.time()
        self._expansion_active = False
        self._cycle_id = ae.cycle_count

    @property
    def volume(self) -> float:
        """Current expansion volume = total nano count × avg params."""
        if not self._nanos:
            return 0.0
        return float(len(self._nanos))

    @property
    def nano_count(self) -> int:
        return len(self._nanos)

    @property
    def dv_dt(self) -> float:
        """Rate of volume change. Negative = approaching Absularity."""
        if len(self._volume_history) < 2:
            return 1.0  # Still expanding
        _, v1 = self._volume_history[-2]
        _, v2 = self._volume_history[-1]
        t1 = self._volume_history[-2][0]
        t2 = self._volume_history[-1][0]
        dt = max(0.001, t2 - t1)
        return (v2 - v1) / dt

    @property
    def d2v_dt2(self) -> float:
        """Acceleration of volume change. Negative = decelerating growth."""
        if len(self._volume_history) < 3:
            return 0.0
        v = [h[1] for h in self._volume_history[-3:]]
        t = [h[0] for h in self._volume_history[-3:]]
        dt1 = max(0.001, t[1] - t[0])
        dt2 = max(0.001, t[2] - t[1])
        dv1 = (v[1] - v[0]) / dt1
        dv2 = (v[2] - v[1]) / dt2
        return (dv2 - dv1) / ((dt1 + dt2) / 2)

    def record_volume(self):
        """Record current volume for Λ detection."""
        self._volume_history.append((time.time(), self.volume))
        if len(self._volume_history) > 1000:
            self._volume_history = self._volume_history[-500:]

    def register_nano(self, nano_id: str, nano: Any):
        """Register a nano in the expanding AEc space."""
        self._nanos[nano_id] = nano
        self.record_volume()

    def remove_nano(self, nano_id: str) -> Optional[Any]:
        """Remove a nano (during compression/pruning)."""
        nano = self._nanos.pop(nano_id, None)
        if nano:
            self.record_volume()
        return nano

    def get_nano(self, nano_id: str) -> Optional[Any]:
        return self._nanos.get(nano_id)

    def get_all_nanos(self) -> Dict[str, Any]:
        return dict(self._nanos)

    def get_nanos_by_type(self, nano_type: str) -> List[Any]:
        return [n for n in self._nanos.values()
                if type(n).__name__ == nano_type]

    def begin_expansion(self):
        self._expansion_active = True
        self._birth_time = time.time()
        log.info(f"AEc expansion STARTED — cycle {self._cycle_id}")

    def halt_expansion(self):
        self._expansion_active = False
        log.info(f"AEc expansion HALTED — {self.nano_count} nanos, "
                 f"volume={self.volume:.1f}")
