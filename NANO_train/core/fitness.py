"""
Fitness Evaluator — Survival of the Fittest.
fitness = α×performance + β×efficiency + γ×(1/size) + δ×usage_freq + ε×novelty
"""
from __future__ import annotations
import math
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Tuple, Optional

log = logging.getLogger("fitness")


@dataclass
class NanoFitnessRecord:
    """Tracks all fitness metrics for a single nano."""
    nano_id: str
    nano_type: str
    performance: float = 0.0      # Task accuracy / quality (0-1)
    efficiency: float = 0.0       # Output quality per FLOP (0-1)
    param_count: int = 0          # Number of parameters
    usage_count: int = 0          # Times activated for inference
    total_invocations: int = 0    # Total forward passes
    correct_outputs: int = 0      # Outputs deemed correct
    avg_latency_ms: float = 0.0   # Average inference time
    novelty: float = 0.5          # Uniqueness vs other nanos (0-1)
    creation_cycle: int = 0
    last_used_cycle: int = 0

    @property
    def usage_frequency(self) -> float:
        return self.usage_count / max(1, self.total_invocations)

    @property
    def accuracy(self) -> float:
        return self.correct_outputs / max(1, self.total_invocations)

    def update_performance(self, correct: bool, latency_ms: float):
        self.total_invocations += 1
        if correct:
            self.correct_outputs += 1
        # Exponential moving average for latency
        alpha = 0.1
        self.avg_latency_ms = (1 - alpha) * self.avg_latency_ms + alpha * latency_ms
        self.performance = self.accuracy
        self.efficiency = self.performance / max(0.001, self.avg_latency_ms / 1000)
        self.efficiency = min(1.0, self.efficiency)

    def record_usage(self, cycle_id: int):
        self.usage_count += 1
        self.last_used_cycle = cycle_id


class FitnessEvaluator:
    """
    Evaluates nano fitness for survival-of-the-fittest culling.
    fitness = α×performance + β×efficiency + γ×(1/size) + δ×usage_freq + ε×novelty
    """

    def __init__(self, alpha: float = 0.30, beta: float = 0.25,
                 gamma: float = 0.15, delta: float = 0.20, epsilon: float = 0.10):
        self.alpha = alpha
        self.beta = beta
        self.gamma = gamma
        self.delta = delta
        self.epsilon = epsilon
        self._records: Dict[str, NanoFitnessRecord] = {}

    def register(self, nano_id: str, nano_type: str, param_count: int,
                 creation_cycle: int = 0) -> NanoFitnessRecord:
        record = NanoFitnessRecord(
            nano_id=nano_id, nano_type=nano_type,
            param_count=param_count, creation_cycle=creation_cycle,
        )
        self._records[nano_id] = record
        return record

    def get_record(self, nano_id: str) -> Optional[NanoFitnessRecord]:
        return self._records.get(nano_id)

    def compute_fitness(self, nano_id: str) -> float:
        """Compute composite fitness score for a nano."""
        rec = self._records.get(nano_id)
        if not rec:
            return 0.0

        perf = rec.performance
        eff = rec.efficiency
        inv_size = 1.0 / max(1, rec.param_count / 1000)  # Normalize by 1K params
        inv_size = min(1.0, inv_size)
        usage = rec.usage_frequency
        novelty = rec.novelty

        fitness = (self.alpha * perf + self.beta * eff + self.gamma * inv_size +
                   self.delta * usage + self.epsilon * novelty)
        return max(0.0, min(1.0, fitness))

    def rank_all(self) -> List[Tuple[str, float]]:
        """Rank all nanos by fitness. Returns [(nano_id, fitness)] sorted descending."""
        rankings = [(nid, self.compute_fitness(nid)) for nid in self._records]
        rankings.sort(key=lambda x: x[1], reverse=True)
        return rankings

    def identify_redundant(self, type_threshold: int = 3) -> List[str]:
        """Find nanos that are redundant (too many of same type, low fitness)."""
        type_groups: Dict[str, List[Tuple[str, float]]] = {}
        for nid, rec in self._records.items():
            fitness = self.compute_fitness(nid)
            type_groups.setdefault(rec.nano_type, []).append((nid, fitness))

        redundant = []
        for ntype, members in type_groups.items():
            if len(members) > type_threshold:
                members.sort(key=lambda x: x[1])
                # Mark bottom performers as redundant
                cull_count = len(members) - type_threshold
                for nid, _ in members[:cull_count]:
                    redundant.append(nid)
        return redundant

    def get_pruning_candidates(self, keep_ratio: float = 0.7) -> List[str]:
        """Get nanos to prune during compression. Keeps top `keep_ratio` by fitness."""
        rankings = self.rank_all()
        keep_count = max(1, int(len(rankings) * keep_ratio))
        prune = [nid for nid, _ in rankings[keep_count:]]
        redundant = self.identify_redundant()
        prune_set = set(prune) | set(redundant)
        return list(prune_set)

    def compute_novelty(self, nano_id: str, all_nanos: Dict[str, any]) -> float:
        """
        Compute novelty: how unique is this nano's capability vs others?
        Uses type frequency as proxy — rarer types = higher novelty.
        """
        rec = self._records.get(nano_id)
        if not rec:
            return 0.5

        type_count = sum(1 for r in self._records.values() if r.nano_type == rec.nano_type)
        total = max(1, len(self._records))
        rarity = 1.0 - (type_count / total)
        rec.novelty = max(0.1, rarity)
        return rec.novelty

    def update_all_novelty(self):
        """Recalculate novelty scores for all nanos."""
        for nid in list(self._records.keys()):
            self.compute_novelty(nid, {})
