"""
Gossip protocol for propagating state across the mesh.
Epidemic-style: each node periodically sends its state to random peers.
"""
import asyncio
import logging
import time
import random
import math
from typing import Dict, Any, Optional, Callable

from .protocol import MessageType, make_message

logger = logging.getLogger("ileices.mesh.gossip")

# Limits
MAX_STATE_ENTRIES = 10000
STATE_TTL_SECONDS = 3600  # Expire entries older than 1 hour


class GossipProtocol:
    """Gossip-based state propagation with TTL and size limits."""

    def __init__(self, node_id: str, interval_s: float = 10.0):
        self.node_id = node_id
        self.interval_s = interval_s
        # State: key -> (value, timestamp, origin_node)
        self._state: Dict[str, tuple] = {}
        self._on_update: Optional[Callable] = None
        self._send_fn: Optional[Callable] = None
        self._get_peers_fn: Optional[Callable] = None
        self._task: Optional[asyncio.Task] = None

    def configure(self, send_fn: Callable, get_peers_fn: Callable,
                  on_update: Optional[Callable] = None):
        self._send_fn = send_fn
        self._get_peers_fn = get_peers_fn
        self._on_update = on_update

    def set(self, key: str, value: Any):
        self._state[key] = (value, time.time(), self.node_id)
        self._enforce_limits()

    def get(self, key: str, default=None) -> Any:
        entry = self._state.get(key)
        return entry[0] if entry else default

    def get_all(self) -> Dict[str, Any]:
        return {k: v[0] for k, v in self._state.items()}

    def _enforce_limits(self):
        """Remove expired entries and enforce size limit."""
        now = time.time()
        # Remove expired
        expired = [k for k, (_, ts, _) in self._state.items()
                   if now - ts > STATE_TTL_SECONDS]
        for k in expired:
            del self._state[k]
        # Size limit: remove oldest if over limit
        if len(self._state) > MAX_STATE_ENTRIES:
            sorted_keys = sorted(self._state.keys(), key=lambda k: self._state[k][1])
            excess = len(self._state) - MAX_STATE_ENTRIES
            for k in sorted_keys[:excess]:
                del self._state[k]

    def merge(self, remote_state: Dict[str, tuple]) -> list:
        updated = []
        for key, entry in remote_state.items():
            if not isinstance(entry, (list, tuple)) or len(entry) != 3:
                continue
            value, timestamp, origin = entry
            if not isinstance(timestamp, (int, float)):
                continue
            # Reject future timestamps
            if timestamp > time.time() + 60:
                continue
            local = self._state.get(key)
            if local is None or timestamp > local[1]:
                self._state[key] = (value, timestamp, origin)
                updated.append(key)
        self._enforce_limits()
        return updated

    async def handle_gossip(self, sender_id: str, msg: dict):
        raw = msg.get('state', {})
        if not isinstance(raw, dict):
            return
        remote_state = {}
        for k, v in raw.items():
            if isinstance(v, (list, tuple)):
                remote_state[k] = tuple(v)
        updated = self.merge(remote_state)
        if updated and self._on_update:
            try:
                await self._on_update(updated)
            except Exception as e:
                logger.error(f"Gossip update handler error: {e}")

    async def _gossip_loop(self):
        while True:
            try:
                await asyncio.sleep(self.interval_s)
                if not self._send_fn or not self._get_peers_fn:
                    continue
                self._enforce_limits()
                peers = self._get_peers_fn()
                if not peers:
                    continue
                # Scale fanout with network size: log2(N) peers
                fanout = max(1, min(int(math.log2(len(peers) + 1)) + 1, len(peers)))
                targets = random.sample(peers, fanout)
                state_to_send = {k: list(v) for k, v in self._state.items()}
                msg = make_message(MessageType.GOSSIP, self.node_id, state=state_to_send)
                for peer_id in targets:
                    try:
                        await self._send_fn(peer_id, msg)
                    except Exception as e:
                        logger.debug(f"Gossip send to {peer_id} failed: {e}")
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Gossip loop error: {e}")

    def start(self):
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._gossip_loop())
            logger.info(f"Gossip started (interval={self.interval_s}s)")

    def stop(self):
        if self._task and not self._task.done():
            self._task.cancel()
