"""
Intuitive Peer Discovery — automatic detection, usernames, RESPECT scores.

This replaces manual config with automatic discovery of other IDE instances.
Peer connections are SEPARATE from the global pool:
  - Peer = personal sharing with a specific person/group you trust
  - Pool = anonymous shared resource anyone contributes to

Discovery methods:
  1. mDNS / multicast on local network (auto-detect LAN peers)
  2. Public rendezvous server (find internet peers who opt in)
  3. Direct address entry (fallback for manual connections)

Privacy:
  - Encrypted sharing opt-in: nothing is shared until you explicitly allow it
  - Username + avatar visible on your node
  - RESPECT score: computed from uptime, jobs completed, reliability
"""
from __future__ import annotations
import asyncio, json, time, logging, hashlib, socket, struct
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional, Any, Callable
from pathlib import Path
from enum import Enum

logger = logging.getLogger(__name__)

MDNS_GROUP = "239.255.73.68"
MDNS_PORT = 5353
DISCOVERY_PORT = 51000
ANNOUNCE_INTERVAL = 30  # seconds


class ConnectionState(str, Enum):
    DISCOVERED = "discovered"       # Seen on network, no connection
    PENDING_OUT = "pending_out"     # We sent a request
    PENDING_IN = "pending_in"       # They sent us a request
    CONNECTED = "connected"         # Active peer connection
    BLOCKED = "blocked"             # User blocked this peer
    DISCONNECTED = "disconnected"   # Was connected, now offline


class SharingLevel(str, Enum):
    NONE = "none"                   # Nothing shared
    METADATA = "metadata"           # Username, grade, online status only
    COMPUTE = "compute"             # Share compute resources
    CODE = "code"                   # Share code + compute
    FULL = "full"                   # Full collaboration (code, compute, chat)


@dataclass
class PeerInfo:
    """Information about a discovered peer."""
    node_id: str
    username: str = "Anonymous"
    hostname: str = ""
    ip_address: str = ""
    port: int = DISCOVERY_PORT
    state: ConnectionState = ConnectionState.DISCOVERED
    sharing_level: SharingLevel = SharingLevel.NONE
    # Compute info
    compute_grade: float = 0.0
    tier: int = 10
    has_cuda: bool = False
    gpu_name: str = ""
    # Trust + reputation
    respect_score: float = 500.0
    uptime_hours: float = 0.0
    jobs_completed: int = 0
    reliability: float = 1.0        # 0-1, how often they complete jobs vs fail
    # Connection
    connected_since: float = 0.0
    last_seen: float = 0.0
    latency_ms: float = 0.0
    # Groups
    groups: List[str] = field(default_factory=list)

    @property
    def display_name(self) -> str:
        if self.username and self.username != "Anonymous":
            return f"{self.username} ({self.hostname})"
        return self.hostname or self.ip_address

    @property
    def trust_level(self) -> str:
        if self.respect_score >= 900:
            return "trusted"
        elif self.respect_score >= 600:
            return "reliable"
        elif self.respect_score >= 300:
            return "neutral"
        else:
            return "untrusted"

    def to_dict(self) -> dict:
        d = asdict(self)
        d['display_name'] = self.display_name
        d['trust_level'] = self.trust_level
        return d


@dataclass
class PeerGroup:
    """A named group of peers for shared compute."""
    group_id: str
    name: str
    description: str = ""
    created_by: str = ""
    members: List[str] = field(default_factory=list)  # node_ids
    sharing_level: SharingLevel = SharingLevel.COMPUTE
    created_at: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return asdict(self)


class PeerDiscovery:
    """
    Handles automatic peer discovery and connection management.

    Users see a list of discovered peers with:
      - Username + hostname
      - Compute grade + GPU info
      - RESPECT score + trust level
      - Connection state
      - One-click connect / disconnect
    """

    def __init__(self, local_node_id: str, username: str = "Anonymous",
                 data_dir: str = "nano_data/peers"):
        self.local_node_id = local_node_id
        self.username = username
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)

        self._peers: Dict[str, PeerInfo] = {}
        self._groups: Dict[str, PeerGroup] = {}
        self._blocked: set = set()
        self._running = False
        self._opt_in = False  # Must explicitly opt-in to be discoverable
        self._sharing_level = SharingLevel.METADATA
        self._my_port = DISCOVERY_PORT
        self._announce_task: Optional[asyncio.Task] = None
        self._listen_task: Optional[asyncio.Task] = None
        self._callbacks: Dict[str, List[Callable]] = {
            "peer_discovered": [],
            "peer_connected": [],
            "peer_disconnected": [],
            "connection_request": [],
            "group_invite": [],
        }

        # Local hardware info (set by mesh node)
        self.compute_grade: float = 0.0
        self.tier: int = 10
        self.has_cuda: bool = False
        self.gpu_name: str = ""
        self.hostname: str = socket.gethostname()

        self._load_state()

    # ── Event System ───────────────────────────────────────────
    def on(self, event: str, callback: Callable) -> None:
        if event in self._callbacks:
            self._callbacks[event].append(callback)

    def _emit(self, event: str, data: Any = None) -> None:
        for cb in self._callbacks.get(event, []):
            try:
                cb(data)
            except Exception as e:
                logger.warning(f"Callback error for {event}: {e}")

    # ── Opt-In Control ─────────────────────────────────────────
    def set_opt_in(self, enabled: bool, sharing: SharingLevel = SharingLevel.METADATA) -> None:
        """Enable or disable peer discovery. Must opt in to be visible."""
        self._opt_in = enabled
        self._sharing_level = sharing
        logger.info(f"Peer discovery: {'enabled' if enabled else 'disabled'} "
                     f"(sharing: {sharing.value})")
        self._save_state()

    @property
    def is_discoverable(self) -> bool:
        return self._opt_in and self._running

    # ── Start / Stop ───────────────────────────────────────────
    async def start(self, port: int = DISCOVERY_PORT) -> None:
        """Start peer discovery services."""
        self._my_port = port
        self._running = True
        self._announce_task = asyncio.create_task(self._announce_loop())
        self._listen_task = asyncio.create_task(self._listen_loop())
        logger.info(f"Peer discovery started on port {port} "
                     f"(opt-in: {self._opt_in})")

    async def stop(self) -> None:
        self._running = False
        for task in [self._announce_task, self._listen_task]:
            if task:
                task.cancel()
        self._save_state()

    # ── Manual Peer Operations ─────────────────────────────────
    def add_peer_manual(self, ip_address: str, port: int = DISCOVERY_PORT,
                        node_id: str = "") -> PeerInfo:
        """Add a peer by direct address (fallback for non-discoverable peers)."""
        if not node_id:
            node_id = hashlib.sha256(f"{ip_address}:{port}".encode()).hexdigest()[:32]
        peer = PeerInfo(
            node_id=node_id,
            ip_address=ip_address,
            port=port,
            state=ConnectionState.DISCOVERED,
            last_seen=time.time(),
        )
        self._peers[node_id] = peer
        self._emit("peer_discovered", peer)
        self._save_state()
        return peer

    async def send_connection_request(self, node_id: str,
                                       sharing: SharingLevel = SharingLevel.COMPUTE) -> bool:
        """Send a peer connection request."""
        peer = self._peers.get(node_id)
        if not peer:
            return False
        if peer.state == ConnectionState.BLOCKED:
            return False

        peer.state = ConnectionState.PENDING_OUT
        logger.info(f"Connection request sent to {peer.display_name}")
        self._save_state()

        # In real implementation, send via TCP/WebSocket
        # For now, simulate the request
        return True

    def accept_connection(self, node_id: str) -> bool:
        """Accept an incoming peer connection request."""
        peer = self._peers.get(node_id)
        if not peer or peer.state != ConnectionState.PENDING_IN:
            return False

        peer.state = ConnectionState.CONNECTED
        peer.connected_since = time.time()
        self._emit("peer_connected", peer)
        self._save_state()
        logger.info(f"Connection accepted from {peer.display_name}")
        return True

    def reject_connection(self, node_id: str) -> None:
        peer = self._peers.get(node_id)
        if peer and peer.state == ConnectionState.PENDING_IN:
            peer.state = ConnectionState.DISCOVERED

    def disconnect_peer(self, node_id: str) -> None:
        peer = self._peers.get(node_id)
        if peer:
            peer.state = ConnectionState.DISCONNECTED
            peer.connected_since = 0
            self._emit("peer_disconnected", peer)
            self._save_state()

    def block_peer(self, node_id: str) -> None:
        peer = self._peers.get(node_id)
        if peer:
            peer.state = ConnectionState.BLOCKED
            self._blocked.add(node_id)
            self._save_state()

    def unblock_peer(self, node_id: str) -> None:
        peer = self._peers.get(node_id)
        if peer and peer.state == ConnectionState.BLOCKED:
            peer.state = ConnectionState.DISCOVERED
            self._blocked.discard(node_id)
            self._save_state()

    # ── Peer Groups ────────────────────────────────────────────
    def create_group(self, name: str, description: str = "",
                     sharing: SharingLevel = SharingLevel.COMPUTE) -> PeerGroup:
        """Create a peer group for shared compute."""
        gid = hashlib.sha256(f"{name}:{time.time()}".encode()).hexdigest()[:16]
        group = PeerGroup(
            group_id=gid,
            name=name,
            description=description,
            created_by=self.local_node_id,
            members=[self.local_node_id],
            sharing_level=sharing,
        )
        self._groups[gid] = group
        self._save_state()
        return group

    def invite_to_group(self, group_id: str, node_id: str) -> bool:
        group = self._groups.get(group_id)
        peer = self._peers.get(node_id)
        if not group or not peer:
            return False
        if peer.state != ConnectionState.CONNECTED:
            return False
        if node_id not in group.members:
            group.members.append(node_id)
        self._save_state()
        return True

    def leave_group(self, group_id: str) -> None:
        group = self._groups.get(group_id)
        if group and self.local_node_id in group.members:
            group.members.remove(self.local_node_id)
            self._save_state()

    # ── RESPECT Score ──────────────────────────────────────────
    @staticmethod
    def compute_respect(uptime_hours: float, jobs_completed: int,
                        reliability: float) -> float:
        """
        RESPECT score: 0-1000 based on contribution and reliability.
          - Uptime: up to 300 pts (maxes at 720 hours = 30 days)
          - Jobs: up to 400 pts (diminishing returns after 100)
          - Reliability: up to 300 pts (linear with completion ratio)
        """
        uptime_pts = min(300, (uptime_hours / 720) * 300)
        job_pts = min(400, (1 - 1 / (1 + jobs_completed / 50)) * 400)
        reliability_pts = reliability * 300
        return round(uptime_pts + job_pts + reliability_pts, 1)

    # ── Discovery Loops ────────────────────────────────────────
    async def _announce_loop(self) -> None:
        """Periodically announce our presence via multicast."""
        while self._running:
            try:
                if self._opt_in:
                    announcement = json.dumps({
                        "type": "nano_sea_announce",
                        "node_id": self.local_node_id,
                        "username": self.username,
                        "hostname": self.hostname,
                        "port": self._my_port,
                        "compute_grade": self.compute_grade,
                        "tier": self.tier,
                        "has_cuda": self.has_cuda,
                        "gpu_name": self.gpu_name,
                        "sharing_level": self._sharing_level.value,
                        "timestamp": time.time(),
                    }).encode()

                    try:
                        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
                        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
                        sock.sendto(announcement, (MDNS_GROUP, MDNS_PORT))
                        sock.close()
                    except OSError:
                        pass  # Multicast not available

                await asyncio.sleep(ANNOUNCE_INTERVAL)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.debug(f"Announce error: {e}")
                await asyncio.sleep(ANNOUNCE_INTERVAL)

    async def _listen_loop(self) -> None:
        """Listen for multicast announcements from other IDE instances."""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(('', MDNS_PORT))
            mreq = struct.pack("4sl", socket.inet_aton(MDNS_GROUP), socket.INADDR_ANY)
            sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
            sock.setblocking(False)

            loop = asyncio.get_event_loop()
            while self._running:
                try:
                    data, addr = await asyncio.wait_for(
                        loop.run_in_executor(None, lambda: sock.recvfrom(4096)),
                        timeout=5.0
                    )
                    await self._handle_announcement(data, addr[0])
                except asyncio.TimeoutError:
                    continue
                except asyncio.CancelledError:
                    break
                except Exception:
                    await asyncio.sleep(1)
        except OSError as e:
            logger.info(f"Multicast listen unavailable ({e}), using fallback discovery")
        except asyncio.CancelledError:
            pass

    async def _handle_announcement(self, data: bytes, source_ip: str) -> None:
        """Process a discovery announcement from another IDE instance."""
        try:
            msg = json.loads(data)
            if msg.get("type") != "nano_sea_announce":
                return
            nid = msg["node_id"]
            if nid == self.local_node_id:
                return  # Ignore own announcements
            if nid in self._blocked:
                return

            existing = self._peers.get(nid)
            if existing:
                # Update known peer
                existing.ip_address = source_ip
                existing.last_seen = time.time()
                existing.compute_grade = msg.get("compute_grade", 0)
                existing.tier = msg.get("tier", 10)
                existing.has_cuda = msg.get("has_cuda", False)
                existing.gpu_name = msg.get("gpu_name", "")
                existing.username = msg.get("username", existing.username)
            else:
                # New peer discovered
                peer = PeerInfo(
                    node_id=nid,
                    username=msg.get("username", "Anonymous"),
                    hostname=msg.get("hostname", ""),
                    ip_address=source_ip,
                    port=msg.get("port", DISCOVERY_PORT),
                    state=ConnectionState.DISCOVERED,
                    compute_grade=msg.get("compute_grade", 0),
                    tier=msg.get("tier", 10),
                    has_cuda=msg.get("has_cuda", False),
                    gpu_name=msg.get("gpu_name", ""),
                    last_seen=time.time(),
                )
                self._peers[nid] = peer
                self._emit("peer_discovered", peer)
                logger.info(f"Peer discovered: {peer.display_name} at {source_ip}")

        except (json.JSONDecodeError, KeyError) as e:
            logger.debug(f"Invalid announcement from {source_ip}: {e}")

    # ── Query Methods ──────────────────────────────────────────
    def get_all_peers(self) -> List[PeerInfo]:
        return list(self._peers.values())

    def get_connected_peers(self) -> List[PeerInfo]:
        return [p for p in self._peers.values() if p.state == ConnectionState.CONNECTED]

    def get_pending_requests(self) -> List[PeerInfo]:
        return [p for p in self._peers.values() if p.state == ConnectionState.PENDING_IN]

    def get_peer(self, node_id: str) -> Optional[PeerInfo]:
        return self._peers.get(node_id)

    def get_groups(self) -> List[PeerGroup]:
        return list(self._groups.values())

    @property
    def status(self) -> dict:
        return {
            "discoverable": self.is_discoverable,
            "opt_in": self._opt_in,
            "sharing_level": self._sharing_level.value,
            "total_peers": len(self._peers),
            "connected_peers": len(self.get_connected_peers()),
            "pending_requests": len(self.get_pending_requests()),
            "groups": len(self._groups),
            "blocked": len(self._blocked),
        }

    # ── Persistence ────────────────────────────────────────────
    def _save_state(self) -> None:
        state = {
            "opt_in": self._opt_in,
            "sharing_level": self._sharing_level.value,
            "username": self.username,
            "peers": {nid: p.to_dict() for nid, p in self._peers.items()},
            "groups": {gid: g.to_dict() for gid, g in self._groups.items()},
            "blocked": list(self._blocked),
        }
        (self.data_dir / "discovery_state.json").write_text(json.dumps(state, indent=2))

    def _load_state(self) -> None:
        path = self.data_dir / "discovery_state.json"
        if path.exists():
            try:
                state = json.loads(path.read_text())
                self._opt_in = state.get("opt_in", False)
                self._sharing_level = SharingLevel(state.get("sharing_level", "none"))
                self.username = state.get("username", "Anonymous")
                self._blocked = set(state.get("blocked", []))
                for nid, pdata in state.get("peers", {}).items():
                    pdata.pop("display_name", None)
                    pdata.pop("trust_level", None)
                    peer = PeerInfo(**{k: v for k, v in pdata.items()
                                      if k in PeerInfo.__dataclass_fields__})
                    if peer.state == ConnectionState.CONNECTED:
                        peer.state = ConnectionState.DISCONNECTED
                    self._peers[nid] = peer
                for gid, gdata in state.get("groups", {}).items():
                    self._groups[gid] = PeerGroup(**{k: v for k, v in gdata.items()
                                                      if k in PeerGroup.__dataclass_fields__})
            except Exception as e:
                logger.warning(f"Failed to load discovery state: {e}")
