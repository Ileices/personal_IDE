"""
Ripple Activation Engine — "stones in a pond."

When a nano fires, activation ripples outward to connected nanos,
decaying with distance. This creates emergent wave-like coordination
across the sea without centralized control.
"""
from __future__ import annotations
import asyncio, time, math, logging
from dataclasses import dataclass, field
from typing import Dict, Set, List, Optional, Callable, Awaitable, TYPE_CHECKING
from collections import defaultdict

if TYPE_CHECKING:
    from nanos.base import BaseNano

logger = logging.getLogger(__name__)


@dataclass
class RippleEvent:
    """A single ripple propagation event."""
    source_id: str
    strength: float          # 0..1, decays with hops
    hop: int = 0
    max_hops: int = 5
    timestamp: float = field(default_factory=time.time)
    payload: Optional[dict] = None


@dataclass
class RippleConnection:
    """Directed connection between two nanos with weight."""
    source_id: str
    target_id: str
    weight: float = 1.0      # learned affinity
    decay: float = 0.6       # strength multiplier per hop
    last_fired: float = 0.0
    fire_count: int = 0


class RippleEngine:
    """Manages ripple activation across the nano sea.

    Topology: Each nano has a set of outgoing RippleConnections.
    When nano A fires, its connections propagate a RippleEvent to targets.
    Each target may fire if strength > threshold, creating a cascade.
    Connections strengthen (Hebbian) when source→target fire together,
    and weaken with disuse.
    """

    def __init__(
        self,
        default_decay: float = 0.6,
        fire_threshold: float = 0.1,
        max_hops: int = 5,
        refractory_period: float = 0.05,  # seconds between firings of same nano
        hebbian_lr: float = 0.01,
    ):
        self.connections: Dict[str, List[RippleConnection]] = defaultdict(list)
        self.nanos: Dict[str, "BaseNano"] = {}
        self.default_decay = default_decay
        self.fire_threshold = fire_threshold
        self.max_hops = max_hops
        self.refractory_period = refractory_period
        self.hebbian_lr = hebbian_lr
        self._last_fire: Dict[str, float] = {}
        self._callbacks: List[Callable[[RippleEvent], Awaitable[None]]] = []
        self._total_ripples = 0

    # ── Registration ───────────────────────────────────────────
    def register_nano(self, nano: "BaseNano") -> None:
        self.nanos[nano.nano_id] = nano

    def connect(self, source_id: str, target_id: str,
                weight: float = 1.0, decay: float | None = None) -> None:
        decay = decay or self.default_decay
        conn = RippleConnection(source_id, target_id, weight, decay)
        self.connections[source_id].append(conn)

    def disconnect(self, source_id: str, target_id: str) -> None:
        self.connections[source_id] = [
            c for c in self.connections[source_id] if c.target_id != target_id
        ]

    def on_ripple(self, callback: Callable[[RippleEvent], Awaitable[None]]) -> None:
        self._callbacks.append(callback)

    # ── Auto-wiring ────────────────────────────────────────────
    def auto_wire_category(self, category_nanos: List["BaseNano"],
                           interconnect: bool = True) -> None:
        """Wire all nanos in a category to each other (intra-category mesh)."""
        for nano in category_nanos:
            self.register_nano(nano)
        if interconnect:
            ids = [n.nano_id for n in category_nanos]
            for src in ids:
                for tgt in ids:
                    if src != tgt:
                        self.connect(src, tgt, weight=0.5)

    def auto_wire_pipeline(self, ordered_nanos: List["BaseNano"]) -> None:
        """Wire nanos in sequence (A→B→C pipeline)."""
        for i in range(len(ordered_nanos) - 1):
            src = ordered_nanos[i]
            tgt = ordered_nanos[i + 1]
            self.register_nano(src)
            self.register_nano(tgt)
            self.connect(src.nano_id, tgt.nano_id, weight=1.0)

    # ── Firing ─────────────────────────────────────────────────
    async def fire(self, source_id: str, strength: float = 1.0,
                   payload: dict | None = None) -> int:
        """Initiate a ripple from source. Returns total nanos activated."""
        now = time.time()
        last = self._last_fire.get(source_id, 0.0)
        if now - last < self.refractory_period:
            return 0

        self._last_fire[source_id] = now
        event = RippleEvent(
            source_id=source_id,
            strength=strength,
            hop=0,
            max_hops=self.max_hops,
            payload=payload,
        )
        activated = await self._propagate(event)
        self._total_ripples += 1
        return activated

    async def _propagate(self, event: RippleEvent) -> int:
        """BFS propagation with decay."""
        if event.strength < self.fire_threshold or event.hop >= event.max_hops:
            return 0

        activated = 0
        conns = self.connections.get(event.source_id, [])

        tasks = []
        for conn in conns:
            child_strength = event.strength * conn.weight * conn.decay
            if child_strength < self.fire_threshold:
                continue

            # Notify target nano
            target = self.nanos.get(conn.target_id)
            if target is not None:
                activated += 1
                conn.fire_count += 1
                conn.last_fired = time.time()

                # Hebbian strengthening
                conn.weight = min(2.0, conn.weight + self.hebbian_lr)

                child_event = RippleEvent(
                    source_id=conn.target_id,
                    strength=child_strength,
                    hop=event.hop + 1,
                    max_hops=event.max_hops,
                    payload=event.payload,
                )
                for cb in self._callbacks:
                    tasks.append(cb(child_event))
                # Recursive propagation
                tasks.append(self._propagate(child_event))

        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for r in results:
                if isinstance(r, int):
                    activated += r

        return activated

    # ── Hebbian Decay ──────────────────────────────────────────
    def decay_unused_connections(self, decay_rate: float = 0.001) -> int:
        """Weaken connections that haven't fired recently. Returns pruned count."""
        pruned = 0
        now = time.time()
        for src_id in list(self.connections.keys()):
            remaining = []
            for conn in self.connections[src_id]:
                age = now - conn.last_fired if conn.last_fired > 0 else 60.0
                conn.weight -= decay_rate * age
                if conn.weight > 0.05:  # prune dead connections
                    remaining.append(conn)
                else:
                    pruned += 1
            self.connections[src_id] = remaining
        return pruned

    # ── Stats ──────────────────────────────────────────────────
    @property
    def total_connections(self) -> int:
        return sum(len(v) for v in self.connections.values())

    @property
    def stats(self) -> dict:
        return {
            "nanos_registered": len(self.nanos),
            "total_connections": self.total_connections,
            "total_ripples": self._total_ripples,
        }
