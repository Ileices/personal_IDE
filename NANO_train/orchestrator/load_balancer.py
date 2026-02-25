"""
Load Balancer — distributes work across heterogeneous hardware.

Balancing factors:
1. Hardware tier (GPU VRAM, CPU cores, RAM)
2. Current load (queue depth, utilization %)
3. RESPECT score (for mesh nodes)
4. Latency to node
5. Task requirements (GPU-required, memory-heavy, I/O-bound)
"""
from __future__ import annotations
import time, logging, random
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple
from enum import Enum

logger = logging.getLogger(__name__)


class WorkerState(Enum):
    IDLE = "idle"
    BUSY = "busy"
    OVERLOADED = "overloaded"
    OFFLINE = "offline"


@dataclass
class WorkerProfile:
    """A compute worker (local or mesh node)."""
    worker_id: str
    hostname: str
    is_local: bool = True
    # Hardware
    cpu_cores: int = 4
    ram_gb: float = 8.0
    gpu_vram_gb: float = 0.0
    has_cuda: bool = False
    compute_grade: float = 0.0
    # State
    state: WorkerState = WorkerState.IDLE
    current_load: float = 0.0        # 0..1
    queue_depth: int = 0
    last_heartbeat: float = field(default_factory=time.time)
    # Performance
    avg_task_ms: float = 100.0
    tasks_completed: int = 0
    tasks_failed: int = 0
    # Mesh
    latency_ms: float = 0.0          # 0 for local
    respect_score: float = 500.0


@dataclass
class LoadBalanceDecision:
    """Where to route a task."""
    worker_id: str
    score: float
    reason: str


class LoadBalancer:
    """Weighted load balancer for the nano sea.

    Scoring formula:
        score = (capacity × 0.3) + (speed × 0.25) + (reliability × 0.2) +
                (respect × 0.15) + (locality × 0.1)

    Where:
    - capacity = (1 - current_load) × compute_grade / 100
    - speed = 1.0 / (1.0 + avg_task_ms / 1000)
    - reliability = tasks_completed / (tasks_completed + tasks_failed + 1)
    - respect = respect_score / 1000
    - locality = 1.0 if local else 1.0 / (1.0 + latency_ms / 100)
    """

    def __init__(self, prefer_local: bool = True, overload_threshold: float = 0.85):
        self._workers: Dict[str, WorkerProfile] = {}
        self._prefer_local = prefer_local
        self._overload_threshold = overload_threshold

    def register_worker(self, profile: WorkerProfile) -> None:
        self._workers[profile.worker_id] = profile

    def remove_worker(self, worker_id: str) -> None:
        self._workers.pop(worker_id, None)

    def update_worker(self, worker_id: str, load: float,
                      queue_depth: int = 0) -> None:
        w = self._workers.get(worker_id)
        if w:
            w.current_load = load
            w.queue_depth = queue_depth
            w.last_heartbeat = time.time()
            w.state = (WorkerState.OVERLOADED if load > self._overload_threshold
                       else WorkerState.BUSY if load > 0.3
                       else WorkerState.IDLE)

    # ── Routing ────────────────────────────────────────────────
    def select_worker(
        self,
        require_gpu: bool = False,
        min_ram_gb: float = 0.0,
        prefer_local: bool | None = None,
    ) -> Optional[LoadBalanceDecision]:
        """Select best worker for a task."""
        prefer_local = prefer_local if prefer_local is not None else self._prefer_local
        candidates = []

        for w in self._workers.values():
            # Filter offline/overloaded
            if w.state == WorkerState.OFFLINE:
                continue
            # Heartbeat timeout (60s)
            if time.time() - w.last_heartbeat > 60.0 and not w.is_local:
                w.state = WorkerState.OFFLINE
                continue
            # GPU requirement
            if require_gpu and not w.has_cuda:
                continue
            # RAM requirement
            if w.ram_gb < min_ram_gb:
                continue

            score = self._score_worker(w, prefer_local)
            candidates.append((w, score))

        if not candidates:
            return None

        candidates.sort(key=lambda x: -x[1])
        best = candidates[0]
        return LoadBalanceDecision(
            worker_id=best[0].worker_id,
            score=best[1],
            reason=f"capacity={1 - best[0].current_load:.2f}, grade={best[0].compute_grade:.0f}",
        )

    def _score_worker(self, w: WorkerProfile, prefer_local: bool) -> float:
        capacity = (1.0 - w.current_load) * (w.compute_grade / 100.0)
        speed = 1.0 / (1.0 + w.avg_task_ms / 1000.0)
        reliability = w.tasks_completed / (w.tasks_completed + w.tasks_failed + 1)
        respect = w.respect_score / 1000.0
        locality = 1.0 if w.is_local else 1.0 / (1.0 + w.latency_ms / 100.0)

        score = (
            capacity * 0.30 +
            speed * 0.25 +
            reliability * 0.20 +
            respect * 0.15 +
            locality * 0.10
        )
        if prefer_local and w.is_local:
            score *= 1.2  # 20% boost for local
        return score

    # ── Stats ──────────────────────────────────────────────────
    @property
    def active_workers(self) -> int:
        return sum(1 for w in self._workers.values() if w.state != WorkerState.OFFLINE)

    @property
    def stats(self) -> dict:
        return {
            "total_workers": len(self._workers),
            "active_workers": self.active_workers,
            "workers": {
                w.worker_id: {
                    "state": w.state.value,
                    "load": w.current_load,
                    "grade": w.compute_grade,
                    "local": w.is_local,
                }
                for w in self._workers.values()
            },
        }
