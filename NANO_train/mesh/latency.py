"""
Latency Compensator — Mars-mission-style latency-aware scheduling.

Like NASA compensating for 4-24 minute Mars round-trip delay,
we measure and compensate for latency between mesh nodes so that:
1. Tasks are scheduled factoring in round-trip time
2. Results are pre-fetched when possible
3. Stale data is detected and re-requested
4. Critical tasks go to low-latency nodes
"""
from __future__ import annotations
import asyncio, time, logging, statistics
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from collections import deque

logger = logging.getLogger(__name__)


@dataclass
class LatencyProfile:
    """Latency statistics for a peer connection."""
    node_id: str
    # Raw measurements (ms)
    samples: deque = field(default_factory=lambda: deque(maxlen=100))
    # Computed stats
    avg_ms: float = 0.0
    p50_ms: float = 0.0
    p95_ms: float = 0.0
    p99_ms: float = 0.0
    jitter_ms: float = 0.0       # standard deviation
    min_ms: float = float("inf")
    max_ms: float = 0.0
    last_measured: float = 0.0
    # Compensation
    predicted_ms: float = 0.0     # EWMA prediction

    def add_sample(self, latency_ms: float) -> None:
        self.samples.append(latency_ms)
        self.last_measured = time.time()
        self._recompute()

    def _recompute(self) -> None:
        if not self.samples:
            return
        data = list(self.samples)
        self.avg_ms = statistics.mean(data)
        self.min_ms = min(data)
        self.max_ms = max(data)
        self.jitter_ms = statistics.stdev(data) if len(data) > 1 else 0.0

        sorted_data = sorted(data)
        n = len(sorted_data)
        self.p50_ms = sorted_data[n // 2]
        self.p95_ms = sorted_data[int(n * 0.95)] if n >= 20 else self.max_ms
        self.p99_ms = sorted_data[int(n * 0.99)] if n >= 100 else self.max_ms

        # EWMA prediction (α=0.3)
        alpha = 0.3
        self.predicted_ms = alpha * data[-1] + (1 - alpha) * self.predicted_ms if self.predicted_ms > 0 else data[-1]


class LatencyCompensator:
    """Manages latency measurement and compensation for all peers."""

    def __init__(self, ping_interval: float = 10.0, stale_threshold: float = 60.0):
        self._profiles: Dict[str, LatencyProfile] = {}
        self._ping_interval = ping_interval
        self._stale_threshold = stale_threshold
        self._running = False
        self._ping_task: Optional[asyncio.Task] = None
        # Callback for sending pings
        self._send_ping = None

    def set_ping_callback(self, callback) -> None:
        """Set callback: async def ping(node_id) -> latency_ms"""
        self._send_ping = callback

    async def start(self) -> None:
        self._running = True
        if self._send_ping:
            self._ping_task = asyncio.create_task(self._ping_loop())
        logger.info("Latency compensator started")

    async def stop(self) -> None:
        self._running = False
        if self._ping_task:
            self._ping_task.cancel()

    # ── Measurement ────────────────────────────────────────────
    def record_latency(self, node_id: str, latency_ms: float) -> None:
        """Record a latency measurement for a peer."""
        if node_id not in self._profiles:
            self._profiles[node_id] = LatencyProfile(node_id=node_id)
        self._profiles[node_id].add_sample(latency_ms)

    def get_profile(self, node_id: str) -> Optional[LatencyProfile]:
        return self._profiles.get(node_id)

    async def _ping_loop(self) -> None:
        while self._running:
            for node_id in list(self._profiles.keys()):
                try:
                    if self._send_ping:
                        start = time.time()
                        latency_ms = await self._send_ping(node_id)
                        if latency_ms is not None:
                            self.record_latency(node_id, latency_ms)
                except Exception as e:
                    logger.debug(f"Ping to {node_id[:12]}... failed: {e}")
            await asyncio.sleep(self._ping_interval)

    # ── Compensation ───────────────────────────────────────────
    def compensated_deadline(self, node_id: str, local_deadline_ms: float) -> float:
        """Adjust a deadline to account for round-trip latency.
        If task needs to complete by T, we need to send it at T - 2*latency."""
        profile = self._profiles.get(node_id)
        if not profile:
            return local_deadline_ms
        # Use p95 for safety margin
        rtt = profile.p95_ms * 2  # round trip
        return local_deadline_ms - rtt

    def should_prefetch(self, node_id: str, task_urgency: float) -> bool:
        """Should we pre-send tasks to this node to hide latency?"""
        profile = self._profiles.get(node_id)
        if not profile:
            return False
        # Prefetch if high urgency AND high latency
        return task_urgency > 0.7 and profile.predicted_ms > 50.0

    def best_nodes_by_latency(self, max_count: int = 5) -> List[str]:
        """Get nodes sorted by lowest predicted latency."""
        sorted_profiles = sorted(
            self._profiles.values(),
            key=lambda p: p.predicted_ms if p.predicted_ms > 0 else float("inf"),
        )
        return [p.node_id for p in sorted_profiles[:max_count]]

    def is_stale(self, node_id: str) -> bool:
        """Has it been too long since we measured this node?"""
        profile = self._profiles.get(node_id)
        if not profile:
            return True
        return (time.time() - profile.last_measured) > self._stale_threshold

    # ── Stats ──────────────────────────────────────────────────
    @property
    def stats(self) -> dict:
        return {
            "profiled_nodes": len(self._profiles),
            "profiles": {
                nid[:12]: {
                    "avg_ms": round(p.avg_ms, 1),
                    "p95_ms": round(p.p95_ms, 1),
                    "jitter_ms": round(p.jitter_ms, 1),
                    "predicted_ms": round(p.predicted_ms, 1),
                }
                for nid, p in self._profiles.items()
            },
        }
