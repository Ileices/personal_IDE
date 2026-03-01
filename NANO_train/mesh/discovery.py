"""
Discovery Service — find peers on the mesh.

Three discovery methods:
1. Tracker (rendezvous server) — primary method
2. Subnet scan — local network fallback
3. Manual peer list — user-configured known peers
"""
from __future__ import annotations
import asyncio, json, logging, time
from typing import Dict, List, Optional, Set
from dataclasses import dataclass, field

from .node import MeshNode, NodeInfo

logger = logging.getLogger(__name__)


@dataclass
class TrackerConfig:
    """Configuration for the tracker (rendezvous) server."""
    url: str = ""  # e.g. "ws://tracker.example.com:5102"
    reconnect_interval: float = 30.0
    heartbeat_interval: float = 15.0


@dataclass
class DiscoveryConfig:
    """Discovery configuration."""
    tracker: TrackerConfig = field(default_factory=TrackerConfig)
    manual_peers: List[str] = field(default_factory=list)  # ["host:port", ...]
    subnet_scan: bool = False
    subnet_scan_port: int = 5101
    announce_interval: float = 30.0


class DiscoveryService:
    """Discovers and maintains peer connections.

    Lifecycle:
    1. Start → connect to tracker, announce self
    2. Receive peer list from tracker
    3. Periodically re-announce + request updated list
    4. Handle peer join/leave events
    5. Subnet scan for local peers (optional)
    """

    def __init__(self, node: MeshNode, config: DiscoveryConfig | None = None):
        self._node = node
        self._config = config or DiscoveryConfig()
        self._running = False
        self._tracker_ws = None
        self._known_peers: Set[str] = set()  # node_ids
        self._tasks: List[asyncio.Task] = []

    async def start(self) -> None:
        self._running = True
        # Connect to tracker if configured
        if self._config.tracker.url:
            self._tasks.append(asyncio.create_task(self._tracker_loop()))
        # Add manual peers
        for peer_addr in self._config.manual_peers:
            asyncio.create_task(self._connect_manual_peer(peer_addr))
        # Subnet scan
        if self._config.subnet_scan:
            self._tasks.append(asyncio.create_task(self._subnet_scan_loop()))
        logger.info("Discovery service started")

    async def stop(self) -> None:
        self._running = False
        for task in self._tasks:
            task.cancel()
        if self._tracker_ws:
            await self._tracker_ws.close()
        logger.info("Discovery service stopped")

    # ── Tracker ────────────────────────────────────────────────
    async def _tracker_loop(self) -> None:
        """Connect to tracker, announce, and receive peer updates."""
        import websockets
        while self._running:
            try:
                async with websockets.connect(self._config.tracker.url) as ws:
                    self._tracker_ws = ws
                    logger.info(f"Connected to tracker: {self._config.tracker.url}")

                    # Announce self
                    await ws.send(json.dumps({
                        "type": "announce",
                        "node": self._node.info.to_dict(),
                    }))

                    # Receive loop
                    async for raw_msg in ws:
                        try:
                            msg = json.loads(raw_msg)
                            await self._handle_tracker_message(msg)
                        except json.JSONDecodeError:
                            continue

            except Exception as e:
                logger.warning(f"Tracker connection failed: {e}")
                self._tracker_ws = None

            if self._running:
                await asyncio.sleep(self._config.tracker.reconnect_interval)

    async def _handle_tracker_message(self, msg: dict) -> None:
        msg_type = msg.get("type")

        if msg_type == "peer_list":
            peers = msg.get("peers", [])
            for peer_data in peers:
                try:
                    peer_info = NodeInfo.from_dict(peer_data)
                    if peer_info.node_id != self._node.node_id:
                        self._node.add_peer(peer_info)
                        self._known_peers.add(peer_info.node_id)
                except Exception as e:
                    logger.warning(f"Invalid peer data: {e}")

        elif msg_type == "peer_joined":
            peer_data = msg.get("node", {})
            try:
                peer_info = NodeInfo.from_dict(peer_data)
                if peer_info.node_id != self._node.node_id:
                    self._node.add_peer(peer_info)
                    self._known_peers.add(peer_info.node_id)
                    logger.info(f"Peer joined: {peer_info.hostname}")
            except Exception as e:
                logger.warning(f"Invalid peer_joined data: {e}")

        elif msg_type == "peer_left":
            node_id = msg.get("node_id")
            if node_id:
                self._node.remove_peer(node_id)
                self._known_peers.discard(node_id)

    # ── Manual Peers ───────────────────────────────────────────
    async def _connect_manual_peer(self, addr: str) -> None:
        """Connect to a manually configured peer."""
        try:
            host, port_str = addr.rsplit(":", 1)
            port = int(port_str)
            # Try HTTP info endpoint
            import httpx
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"http://{host}:{port}/v1/mesh/info")
                if resp.status_code == 200:
                    peer_info = NodeInfo.from_dict(resp.json())
                    self._node.add_peer(peer_info)
                    self._known_peers.add(peer_info.node_id)
                    logger.info(f"Manual peer connected: {host}:{port}")
        except Exception as e:
            logger.warning(f"Failed to connect manual peer {addr}: {e}")

    # ── Subnet Scan ────────────────────────────────────────────
    async def _subnet_scan_loop(self) -> None:
        """Periodically scan local subnet for peers."""
        while self._running:
            try:
                await self._scan_subnet()
            except Exception as e:
                logger.debug(f"Subnet scan error: {e}")
            await asyncio.sleep(60.0)  # scan every minute

    async def _scan_subnet(self) -> None:
        """Scan common local subnet ranges for mesh peers."""
        import httpx
        import socket

        # Get local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
        except Exception:
            return
        finally:
            s.close()

        # Scan /24 subnet
        subnet = ".".join(local_ip.split(".")[:3])
        port = self._config.subnet_scan_port
        tasks = []

        async def _try_peer(ip: str) -> None:
            if ip == local_ip:
                return
            try:
                async with httpx.AsyncClient(timeout=1.0) as client:
                    resp = await client.get(f"http://{ip}:{port}/v1/mesh/info")
                    if resp.status_code == 200:
                        peer_info = NodeInfo.from_dict(resp.json())
                        if peer_info.node_id != self._node.node_id:
                            self._node.add_peer(peer_info)
                            self._known_peers.add(peer_info.node_id)
                            logger.info(f"Found subnet peer: {ip}")
            except Exception:
                pass  # Expected: most IPs won't have a mesh node

        for i in range(1, 255):
            tasks.append(_try_peer(f"{subnet}.{i}"))

        # Run in batches to not overwhelm network
        for batch_start in range(0, len(tasks), 20):
            batch = tasks[batch_start:batch_start + 20]
            await asyncio.gather(*batch, return_exceptions=True)

    # ── Stats ──────────────────────────────────────────────────
    @property
    def stats(self) -> dict:
        return {
            "known_peers": len(self._known_peers),
            "tracker_connected": self._tracker_ws is not None,
            "tracker_url": self._config.tracker.url or "none",
        }
