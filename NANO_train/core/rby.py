"""
RBY Color Vectoring System — The canonical implementation.
R (Red)   = Perception / Novelty / Entropy
B (Blue)  = Cognition / Structure / Regularity
Y (Yellow)= Execution / Integration / Action
Constraint: r + b + y = 1.0 (AE = C = 1)

PTAIE_MAP from corpus rby_encryption_core.py — these are NOT arbitrary.
"""
from __future__ import annotations
import math
import hashlib
from dataclasses import dataclass, field
from typing import Tuple, Optional, Dict

# ─── Canonical PTAIE Character→RBY Map (from corpus) ───────
# Each character maps to an (R, B, Y) tuple defining its perceptual color
PTAIE_MAP: Dict[str, Tuple[float, float, float]] = {
    'A': (0.8, 0.1, 0.1), 'B': (0.1, 0.8, 0.1), 'C': (0.1, 0.1, 0.8),
    'D': (0.6, 0.3, 0.1), 'E': (0.3, 0.6, 0.1), 'F': (0.3, 0.1, 0.6),
    'G': (0.5, 0.4, 0.1), 'H': (0.4, 0.5, 0.1), 'I': (0.4, 0.1, 0.5),
    'J': (0.7, 0.2, 0.1), 'K': (0.2, 0.7, 0.1), 'L': (0.2, 0.1, 0.7),
    'M': (0.6, 0.2, 0.2), 'N': (0.2, 0.6, 0.2), 'O': (0.2, 0.2, 0.6),
    'P': (0.5, 0.3, 0.2), 'Q': (0.3, 0.5, 0.2), 'R': (0.3, 0.2, 0.5),
    'S': (0.4, 0.4, 0.2), 'T': (0.4, 0.2, 0.4), 'U': (0.2, 0.4, 0.4),
    'V': (0.5, 0.2, 0.3), 'W': (0.2, 0.5, 0.3), 'X': (0.3, 0.3, 0.4),
    'Y': (0.7, 0.1, 0.2), 'Z': (0.1, 0.7, 0.2),
    '0': (0.33, 0.34, 0.33), '1': (0.9, 0.05, 0.05), '2': (0.05, 0.9, 0.05),
    '3': (0.05, 0.05, 0.9), '4': (0.5, 0.5, 0.0), '5': (0.5, 0.0, 0.5),
    '6': (0.0, 0.5, 0.5), '7': (0.6, 0.3, 0.1), '8': (0.3, 0.6, 0.1),
    '9': (0.1, 0.3, 0.6), ' ': (0.33, 0.34, 0.33),
}

# Base seed from AE framework (pre-normalization)
RBY_BASE_SEED_RAW = (0.707, 0.500, 0.793)


def normalize_rby(r: float, b: float, y: float) -> Tuple[float, float, float]:
    """Normalize RBY so r + b + y = 1.0 (AE = C = 1)."""
    total = r + b + y
    if total <= 0:
        return (0.334, 0.333, 0.333)
    return (r / total, b / total, y / total)


def rby_from_seed_raw() -> Tuple[float, float, float]:
    """Get the normalized base RBY seed."""
    return normalize_rby(*RBY_BASE_SEED_RAW)


@dataclass
class RBYVector:
    """
    An RBY color vector. Always normalized so r + b + y = 1.0.
    Tracks lifecycle shifts: birth (high novelty/R) → maturity (high structure/B).
    """
    r: float = 0.354  # Perception / Novelty
    b: float = 0.250  # Cognition / Structure  
    y: float = 0.397  # Execution / Integration
    _birth_r: float = field(default=0.0, repr=False)
    _birth_b: float = field(default=0.0, repr=False)
    _birth_y: float = field(default=0.0, repr=False)
    _age: int = field(default=0, repr=False)

    def __post_init__(self):
        self.r, self.b, self.y = normalize_rby(self.r, self.b, self.y)
        if self._birth_r == 0.0:
            self._birth_r, self._birth_b, self._birth_y = self.r, self.b, self.y

    def to_tuple(self) -> Tuple[float, float, float]:
        return (self.r, self.b, self.y)

    def distance(self, other: RBYVector) -> float:
        """Euclidean distance in RBY space."""
        return math.sqrt(
            (self.r - other.r) ** 2 +
            (self.b - other.b) ** 2 +
            (self.y - other.y) ** 2
        )

    def blend(self, other: RBYVector, weight: float = 0.5) -> RBYVector:
        """Blend two RBY vectors with given weight toward `other`."""
        r = self.r * (1 - weight) + other.r * weight
        b = self.b * (1 - weight) + other.b * weight
        y = self.y * (1 - weight) + other.y * weight
        return RBYVector(r, b, y)

    def lifecycle_shift(self, learning_progress: float):
        """
        Shift RBY based on lifecycle progress.
        As nano learns: novelty (R) decreases, structure (B) increases.
        learning_progress: 0.0 (birth) → 1.0 (maturity)
        """
        self._age += 1
        shift = learning_progress * 0.1
        new_r = max(0.05, self.r - shift * 0.5)
        new_b = min(0.90, self.b + shift * 0.4)
        new_y = self.y + shift * 0.1
        self.r, self.b, self.y = normalize_rby(new_r, new_b, new_y)

    @property
    def dominance(self) -> str:
        """Which channel dominates: 'R' (perception), 'B' (cognition), 'Y' (execution)."""
        if self.r >= self.b and self.r >= self.y:
            return 'R'
        elif self.b >= self.r and self.b >= self.y:
            return 'B'
        return 'Y'

    @property
    def saturation(self) -> float:
        """How far from gray (0.33, 0.33, 0.33). 0 = gray, 1 = fully saturated."""
        gray = 1.0 / 3.0
        return math.sqrt(
            (self.r - gray) ** 2 + (self.b - gray) ** 2 + (self.y - gray) ** 2
        ) / math.sqrt(2.0 / 3.0)  # Max distance from gray

    @property
    def white_black_spectrum(self) -> float:
        """
        0.0 = white (birth, maximum potential, minimum learned)
        1.0 = black (saturated, compression ready)
        """
        return min(1.0, self._age / 1000.0) * (1.0 - abs(self.r - self._birth_r) * 2)

    def to_glyph_bytes(self) -> bytes:
        """Serialize to compact 12-byte representation."""
        import struct
        return struct.pack('fff', self.r, self.b, self.y)

    @classmethod
    def from_glyph_bytes(cls, data: bytes) -> RBYVector:
        import struct
        r, b, y = struct.unpack('fff', data[:12])
        return cls(r, b, y)

    @classmethod
    def from_text(cls, text: str) -> RBYVector:
        """Compute aggregate RBY from text using PTAIE_MAP."""
        if not text:
            return cls()
        r_sum, b_sum, y_sum, count = 0.0, 0.0, 0.0, 0
        for ch in text.upper():
            if ch in PTAIE_MAP:
                r, b, y = PTAIE_MAP[ch]
                r_sum += r
                b_sum += b
                y_sum += y
                count += 1
        if count == 0:
            return cls()
        return cls(r_sum / count, b_sum / count, y_sum / count)

    @classmethod
    def from_hash(cls, data: bytes, base_seed: bool = True) -> RBYVector:
        """Deterministic RBY from data hash, optionally blended with base seed."""
        h = hashlib.sha256(data).digest()
        r_raw = int.from_bytes(h[0:8], 'big') / (2**64)
        b_raw = int.from_bytes(h[8:16], 'big') / (2**64)
        y_raw = int.from_bytes(h[16:24], 'big') / (2**64)
        if base_seed:
            sr, sb, sy = rby_from_seed_raw()
            r_raw = (r_raw + sr) / 2
            b_raw = (b_raw + sb) / 2
            y_raw = (y_raw + sy) / 2
        return cls(r_raw, b_raw, y_raw)


def rby_distance(a: RBYVector, b: RBYVector) -> float:
    return a.distance(b)


def rby_blend(a: RBYVector, b: RBYVector, weight: float = 0.5) -> RBYVector:
    return a.blend(b, weight)


def text_to_rby_sequence(text: str) -> list:
    """Convert text to a sequence of RBY tuples for each character."""
    result = []
    for ch in text.upper():
        if ch in PTAIE_MAP:
            result.append(PTAIE_MAP[ch])
        else:
            result.append((0.33, 0.34, 0.33))
    return result
