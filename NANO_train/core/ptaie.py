"""
PTAIE 5-Vector Control System.
P = Priority (0-1) — urgency of execution
T = Temporal (0-1) — time-sensitivity / recency
A = Affinity (0-1) — relatedness to other nanos (hub connectivity)
I = Importance (0-1) — significance to overall system
E = Execution (0-1) — computational cost to run
"""
from __future__ import annotations
import math
from dataclasses import dataclass
from typing import Tuple


@dataclass
class PTAIEVector:
    """5-dimensional control vector for nano scheduling, routing, and decay."""
    p: float = 0.5  # Priority
    t: float = 0.5  # Temporal
    a: float = 0.5  # Affinity
    i: float = 0.5  # Importance
    e: float = 0.5  # Execution cost

    def __post_init__(self):
        self.p = max(0.0, min(1.0, self.p))
        self.t = max(0.0, min(1.0, self.t))
        self.a = max(0.0, min(1.0, self.a))
        self.i = max(0.0, min(1.0, self.i))
        self.e = max(0.0, min(1.0, self.e))

    def to_tuple(self) -> Tuple[float, float, float, float, float]:
        return (self.p, self.t, self.a, self.i, self.e)

    @property
    def scheduling_score(self) -> float:
        """Combined score for priority scheduling. Higher = execute sooner."""
        return self.p * 0.4 + self.t * 0.2 + self.i * 0.3 + (1.0 - self.e) * 0.1

    @property
    def decay_rate(self) -> float:
        """How fast this nano's importance decays. Low I + low T = fast decay."""
        return 0.1 * (1.0 - self.i) * (1.0 - self.t)

    @property
    def routing_weight(self) -> float:
        """Weight for message routing decisions. High A = receives more messages."""
        return self.a * 0.5 + self.i * 0.3 + self.p * 0.2

    def compute_budget(self, available_flops: float) -> float:
        """How much compute this nano should receive given available FLOPS."""
        return available_flops * self.e * self.p

    def ranking_score(self, rby_match: float, semantic_sim: float, recency: float,
                      alpha: float = 0.3, beta: float = 0.25,
                      gamma: float = 0.25, delta: float = 0.2) -> float:
        """
        Combined ranking score for query results.
        combined_score = α×PTAIE_score + β×RBY_match + γ×semantic_sim + δ×recency
        """
        ptaie_score = self.scheduling_score
        return alpha * ptaie_score + beta * rby_match + gamma * semantic_sim + delta * recency

    def forget_priority(self, importance: float, decay: float, access_freq: float) -> float:
        """
        Priority for forgetting/pruning. Higher = forget sooner.
        forget_priority = (1 - importance) × decay × (1 / access_frequency)
        """
        safe_freq = max(0.001, access_freq)
        return (1.0 - importance) * decay * (1.0 / safe_freq)

    def distance(self, other: PTAIEVector) -> float:
        """Euclidean distance in PTAIE space."""
        return math.sqrt(
            (self.p - other.p) ** 2 + (self.t - other.t) ** 2 +
            (self.a - other.a) ** 2 + (self.i - other.i) ** 2 +
            (self.e - other.e) ** 2
        )

    def blend(self, other: PTAIEVector, weight: float = 0.5) -> PTAIEVector:
        return PTAIEVector(
            p=self.p * (1 - weight) + other.p * weight,
            t=self.t * (1 - weight) + other.t * weight,
            a=self.a * (1 - weight) + other.a * weight,
            i=self.i * (1 - weight) + other.i * weight,
            e=self.e * (1 - weight) + other.e * weight,
        )
