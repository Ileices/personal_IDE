"""
Mesh Node — identity, hardware profiling, and node lifecycle.

Each machine in the mesh is a MeshNode with:
- Ed25519 identity (persistent across restarts)
- Hardware profile (auto-detected + compute grade)
- Online/offline state with heartbeat
- RESPECT score
"""
from __future__ import annotations
import json, os, time, platform, hashlib, logging
from dataclasses import dataclass, field, asdict
from typing import Optional, Dict, Any
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class NodeInfo:
    """Serializable node identity and hardware info."""
    node_id: str
    hostname: str
    public_key_hex: str
    # Hardware
    cpu_model: str = ""
    cpu_cores: int = 0
    ram_gb: float = 0.0
    gpu_model: str = ""
    gpu_vram_gb: float = 0.0
    has_cuda: bool = False
    storage_tb: float = 0.0
    os_name: str = ""
    # Computed
    compute_grade: float = 0.0
    tier: int = 10
    # Network
    ip_address: str = ""
    port: int = 5101
    last_seen: float = field(default_factory=time.time)
    # RESPECT
    respect_score: float = 500.0

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "NodeInfo":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


class MeshNode:
    """Local mesh node — represents THIS machine."""

    def __init__(self, data_dir: str = "nano_data/mesh"):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self._identity_file = self.data_dir / "node_identity.json"
        self._info: Optional[NodeInfo] = None
        self._peers: Dict[str, NodeInfo] = {}
        self._online = False

    @property
    def info(self) -> NodeInfo:
        if self._info is None:
            self._info = self._load_or_create_identity()
        return self._info

    @property
    def node_id(self) -> str:
        return self.info.node_id

    @property
    def peers(self) -> Dict[str, NodeInfo]:
        return dict(self._peers)

    # ── Identity ───────────────────────────────────────────────
    def _load_or_create_identity(self) -> NodeInfo:
        """Load existing identity or create new one."""
        if self._identity_file.exists():
            try:
                data = json.loads(self._identity_file.read_text())
                info = NodeInfo.from_dict(data)
                info.last_seen = time.time()
                # Re-detect hardware (might have changed)
                self._detect_hardware(info)
                self._save_identity(info)
                logger.info(f"Loaded node identity: {info.node_id[:16]}...")
                return info
            except Exception as e:
                logger.warning(f"Failed to load identity: {e}, creating new")

        info = self._create_new_identity()
        self._save_identity(info)
        return info

    def _create_new_identity(self) -> NodeInfo:
        """Generate new Ed25519 identity."""
        from core.crypto import NodeIdentity
        identity = NodeIdentity.generate()

        info = NodeInfo(
            node_id=identity.node_id,
            hostname=platform.node(),
            public_key_hex=identity.public_signing_bytes().hex(),
            os_name=f"{platform.system()} {platform.release()}",
        )
        # Save the private key for later use
        key_file = self.data_dir / "node_key.bin"
        identity.save(str(key_file))
        self._detect_hardware(info)
        logger.info(f"Created new node identity: {info.node_id[:16]}... grade={info.compute_grade:.1f}")
        return info

    def _detect_hardware(self, info: NodeInfo) -> None:
        """Auto-detect hardware capabilities."""
        import psutil

        # CPU
        info.cpu_cores = psutil.cpu_count(logical=True) or 4
        try:
            info.cpu_model = platform.processor() or "Unknown"
        except Exception:
            info.cpu_model = "Unknown"

        # RAM
        mem = psutil.virtual_memory()
        info.ram_gb = round(mem.total / (1024**3), 1)

        # GPU (try CUDA)
        try:
            import torch
            if torch.cuda.is_available():
                info.has_cuda = True
                info.gpu_model = torch.cuda.get_device_name(0)
                info.gpu_vram_gb = round(torch.cuda.get_device_properties(0).total_mem / (1024**3), 1)
            else:
                info.has_cuda = False
                info.gpu_model = "None"
                info.gpu_vram_gb = 0.0
        except ImportError:
            info.has_cuda = False
            info.gpu_model = "None (torch not available)"
            info.gpu_vram_gb = 0.0

        # Storage
        try:
            total_storage = 0
            for part in psutil.disk_partitions():
                try:
                    usage = psutil.disk_usage(part.mountpoint)
                    total_storage += usage.total
                except PermissionError:
                    pass
            info.storage_tb = round(total_storage / (1024**4), 2)
        except Exception:
            info.storage_tb = 0.0

        # Compute grade
        info.compute_grade = self._compute_grade(info)
        info.tier = self._compute_tier(info.compute_grade)

    def _compute_grade(self, info: NodeInfo) -> float:
        """Compute grade using the schema formula:
        GPU×0.5 + CPU×0.2 + RAM×0.15 + Storage×0.1 + Network×0.05"""
        # GPU score (0-100)
        if info.gpu_vram_gb >= 24:
            gpu = 90 + min(info.gpu_vram_gb - 24, 24) / 24 * 10  # 90-100 for 24GB+
        elif info.gpu_vram_gb >= 12:
            gpu = 70 + (info.gpu_vram_gb - 12) / 12 * 20
        elif info.gpu_vram_gb >= 6:
            gpu = 40 + (info.gpu_vram_gb - 6) / 6 * 30
        elif info.gpu_vram_gb > 0:
            gpu = info.gpu_vram_gb / 6 * 40
        else:
            gpu = 0

        # CPU score (0-100)
        cpu = min(info.cpu_cores / 32 * 80 + 20, 100) if info.cpu_cores > 0 else 10

        # RAM score (0-100)
        if info.ram_gb >= 256:
            ram = 95
        elif info.ram_gb >= 128:
            ram = 80
        elif info.ram_gb >= 64:
            ram = 65
        elif info.ram_gb >= 32:
            ram = 50
        elif info.ram_gb >= 16:
            ram = 35
        else:
            ram = max(info.ram_gb / 16 * 35, 5)

        # Storage score (0-100)
        storage = min(info.storage_tb / 50 * 100, 100)

        # Network (estimate — will be measured later)
        network = 50  # default guess

        grade = gpu * 0.5 + cpu * 0.2 + ram * 0.15 + storage * 0.1 + network * 0.05
        return round(grade, 1)

    def _compute_tier(self, grade: float) -> int:
        """Map grade to tier (0=Global Root, 10=Observer)."""
        if grade >= 90: return 0
        if grade >= 80: return 1
        if grade >= 70: return 2
        if grade >= 60: return 3
        if grade >= 50: return 4
        if grade >= 40: return 5
        if grade >= 30: return 6
        if grade >= 20: return 7
        if grade >= 10: return 8
        if grade >= 5: return 9
        return 10

    def _save_identity(self, info: NodeInfo) -> None:
        self._identity_file.write_text(json.dumps(info.to_dict(), indent=2))

    # ── Peer Management ────────────────────────────────────────
    def add_peer(self, peer_info: NodeInfo) -> None:
        self._peers[peer_info.node_id] = peer_info
        logger.info(f"Added peer: {peer_info.hostname} ({peer_info.node_id[:12]}...) grade={peer_info.compute_grade}")

    def remove_peer(self, node_id: str) -> None:
        self._peers.pop(node_id, None)

    def get_peer(self, node_id: str) -> Optional[NodeInfo]:
        return self._peers.get(node_id)

    def update_peer_heartbeat(self, node_id: str) -> None:
        peer = self._peers.get(node_id)
        if peer:
            peer.last_seen = time.time()

    def get_stale_peers(self, timeout: float = 60.0) -> list[NodeInfo]:
        """Get peers that haven't sent heartbeat within timeout."""
        now = time.time()
        return [p for p in self._peers.values() if now - p.last_seen > timeout]

    # ── Online/Offline ─────────────────────────────────────────
    def go_online(self, port: int = 5101) -> None:
        self.info.port = port
        self.info.last_seen = time.time()
        self._online = True
        logger.info(f"Node {self.node_id[:12]}... is ONLINE (grade={self.info.compute_grade}, tier={self.info.tier})")

    def go_offline(self) -> None:
        self._online = False
        try:
            node_id = self._info.node_id[:12] if self._info else 'unknown'
        except Exception:
            node_id = 'unknown'
        logger.info(f"Node {node_id}... is OFFLINE")

    @property
    def is_online(self) -> bool:
        return self._online

    @property
    def stats(self) -> dict:
        return {
            "node_id": self.node_id[:16] + "...",
            "hostname": self.info.hostname,
            "grade": self.info.compute_grade,
            "tier": self.info.tier,
            "has_cuda": self.info.has_cuda,
            "ram_gb": self.info.ram_gb,
            "gpu_vram_gb": self.info.gpu_vram_gb,
            "online": self._online,
            "peer_count": len(self._peers),
        }
