"""
RESPECT Scoring System — Reliability, Efficiency, Security, Performance, Engagement, Conduct, Trust.

RESPECT score determines:
1. What tasks a node can accept (higher RESPECT = higher-value tasks)
2. Priority in the task queue
3. Data access level
4. Voting weight in consensus decisions

Composite formula (from respect_score_schema.json):
  RESPECT = Task Performance × 0.40 + Resource Stability × 0.30 +
            Conduct × 0.20 + Community × 0.10

Starting score: 500 (neutral). Range: 0 - 1150.
"""
from __future__ import annotations
import time, json, logging
from dataclasses import dataclass, field
from typing import Dict, Optional, List
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class TaskPerformanceMetrics:
    """40% of RESPECT score."""
    tasks_completed: int = 0
    tasks_failed: int = 0
    tasks_timeout: int = 0
    avg_quality_score: float = 0.5   # 0..1
    avg_speed_ratio: float = 1.0     # actual/expected time

    @property
    def score(self) -> float:
        total = self.tasks_completed + self.tasks_failed + self.tasks_timeout
        if total == 0:
            return 50.0  # neutral
        completion_rate = self.tasks_completed / total
        quality = self.avg_quality_score
        speed = min(self.avg_speed_ratio, 2.0) / 2.0  # normalize to 0..1
        return (completion_rate * 40 + quality * 35 + speed * 25)


@dataclass
class ResourceStabilityMetrics:
    """30% of RESPECT score."""
    uptime_hours: float = 0.0
    total_hours: float = 0.0
    unexpected_disconnects: int = 0
    resource_promises_kept: int = 0
    resource_promises_total: int = 0

    @property
    def score(self) -> float:
        uptime_ratio = self.uptime_hours / max(self.total_hours, 1) 
        promise_ratio = self.resource_promises_kept / max(self.resource_promises_total, 1)
        disconnect_penalty = min(self.unexpected_disconnects * 2, 30)
        return max(0, uptime_ratio * 50 + promise_ratio * 50 - disconnect_penalty)


@dataclass
class ConductMetrics:
    """20% of RESPECT score."""
    data_integrity_violations: int = 0
    protocol_violations: int = 0
    helpful_actions: int = 0          # help requests fulfilled
    spam_reports: int = 0

    @property
    def score(self) -> float:
        base = 80.0  # assume good conduct
        penalties = (self.data_integrity_violations * 20 +
                     self.protocol_violations * 10 +
                     self.spam_reports * 15)
        bonuses = self.helpful_actions * 2
        return max(0, min(100, base - penalties + bonuses))


@dataclass
class CommunityMetrics:
    """10% of RESPECT score."""
    help_requests_answered: int = 0
    compute_donated_hours: float = 0.0
    nanos_shared: int = 0
    peer_endorsements: int = 0

    @property
    def score(self) -> float:
        help = min(self.help_requests_answered * 5, 30)
        donate = min(self.compute_donated_hours * 2, 30)
        share = min(self.nanos_shared * 3, 20)
        endorse = min(self.peer_endorsements * 5, 20)
        return min(100, help + donate + share + endorse)


class RespectSystem:
    """Manages RESPECT scores for all known nodes."""

    def __init__(self, data_dir: str = "nano_data/respect"):
        self._data_dir = Path(data_dir)
        self._data_dir.mkdir(parents=True, exist_ok=True)
        self._scores: Dict[str, float] = {}
        self._task_perf: Dict[str, TaskPerformanceMetrics] = {}
        self._resource: Dict[str, ResourceStabilityMetrics] = {}
        self._conduct: Dict[str, ConductMetrics] = {}
        self._community: Dict[str, CommunityMetrics] = {}
        self._load_scores()

    def _load_scores(self) -> None:
        score_file = self._data_dir / "scores.json"
        if score_file.exists():
            try:
                self._scores = json.loads(score_file.read_text())
            except Exception:
                self._scores = {}

    def _save_scores(self) -> None:
        score_file = self._data_dir / "scores.json"
        score_file.write_text(json.dumps(self._scores, indent=2))

    # ── Score Computation ──────────────────────────────────────
    def get_score(self, node_id: str) -> float:
        return self._scores.get(node_id, 500.0)

    def compute_score(self, node_id: str) -> float:
        """Recompute RESPECT score from component metrics."""
        task_perf = self._task_perf.get(node_id, TaskPerformanceMetrics())
        resource = self._resource.get(node_id, ResourceStabilityMetrics())
        conduct = self._conduct.get(node_id, ConductMetrics())
        community = self._community.get(node_id, CommunityMetrics())

        # Weighted composite (scores are 0-100 each, total max ~1150 as per schema)
        raw = (
            task_perf.score * 0.40 +
            resource.score * 0.30 +
            conduct.score * 0.20 +
            community.score * 0.10
        )
        # Scale to 0-1150 range
        scaled = raw * 11.5
        self._scores[node_id] = round(scaled, 1)
        self._save_scores()
        return self._scores[node_id]

    # ── Recording Events ───────────────────────────────────────
    def record_task_completion(self, node_id: str, quality: float = 0.8,
                               speed_ratio: float = 1.0) -> None:
        m = self._task_perf.setdefault(node_id, TaskPerformanceMetrics())
        m.tasks_completed += 1
        # Running average
        total = m.tasks_completed + m.tasks_failed + m.tasks_timeout
        m.avg_quality_score = ((m.avg_quality_score * (total - 1)) + quality) / total
        m.avg_speed_ratio = ((m.avg_speed_ratio * (total - 1)) + speed_ratio) / total
        self.compute_score(node_id)

    def record_task_failure(self, node_id: str) -> None:
        m = self._task_perf.setdefault(node_id, TaskPerformanceMetrics())
        m.tasks_failed += 1
        self.compute_score(node_id)

    def record_uptime(self, node_id: str, hours: float) -> None:
        m = self._resource.setdefault(node_id, ResourceStabilityMetrics())
        m.uptime_hours += hours
        m.total_hours += hours
        self.compute_score(node_id)

    def record_disconnect(self, node_id: str) -> None:
        m = self._resource.setdefault(node_id, ResourceStabilityMetrics())
        m.unexpected_disconnects += 1
        self.compute_score(node_id)

    def record_help_given(self, node_id: str) -> None:
        m = self._community.setdefault(node_id, CommunityMetrics())
        m.help_requests_answered += 1
        c = self._conduct.setdefault(node_id, ConductMetrics())
        c.helpful_actions += 1
        self.compute_score(node_id)

    def record_compute_donation(self, node_id: str, hours: float) -> None:
        m = self._community.setdefault(node_id, CommunityMetrics())
        m.compute_donated_hours += hours
        self.compute_score(node_id)

    # ── Tier Access ────────────────────────────────────────────
    def get_tier(self, node_id: str) -> str:
        score = self.get_score(node_id)
        if score >= 1000: return "Exemplary"
        if score >= 800:  return "Trusted"
        if score >= 600:  return "Reliable"
        if score >= 400:  return "Standard"
        if score >= 200:  return "Probationary"
        return "Restricted"

    def can_accept_task_tier(self, node_id: str, task_tier: int) -> bool:
        """Can this node accept tasks at the given tier (0=highest)?"""
        score = self.get_score(node_id)
        min_scores = {0: 900, 1: 700, 2: 500, 3: 300, 4: 100, 5: 0}
        return score >= min_scores.get(task_tier, 0)

    # ── Leaderboard ────────────────────────────────────────────
    def leaderboard(self, top_n: int = 10) -> List[tuple]:
        """Get top N nodes by RESPECT score."""
        sorted_scores = sorted(self._scores.items(), key=lambda x: -x[1])
        return sorted_scores[:top_n]

    @property
    def stats(self) -> dict:
        return {
            "tracked_nodes": len(self._scores),
            "avg_score": round(sum(self._scores.values()) / max(len(self._scores), 1), 1),
            "top_score": max(self._scores.values()) if self._scores else 0,
        }
