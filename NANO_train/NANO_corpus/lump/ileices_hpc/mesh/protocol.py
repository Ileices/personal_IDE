"""
Mesh networking protocol definitions.

Message framing:
  [4 bytes: length (big-endian uint32)]
  [N bytes: msgpack-encoded payload]

Every payload is a dict with at least:
  {"type": str, "sender": str, "timestamp": float, "nonce": bytes}
"""
import time
import struct
import os
import logging
import msgpack
from enum import Enum
from typing import Any, Optional
from dataclasses import dataclass, field

logger = logging.getLogger("ileices.mesh.protocol")

# Limits
MAX_MESSAGE_BYTES = 64 * 1024 * 1024  # 64 MB hard ceiling
NONCE_SIZE = 16


class MessageType(str, Enum):
    """All message types in the mesh protocol."""
    # Connection management
    HANDSHAKE_INIT = "handshake_init"
    HANDSHAKE_REPLY = "handshake_reply"
    HANDSHAKE_COMPLETE = "handshake_complete"
    HEARTBEAT = "heartbeat"
    HEARTBEAT_ACK = "heartbeat_ack"
    DISCONNECT = "disconnect"
    # Peer discovery
    PEER_LIST_REQUEST = "peer_list_request"
    PEER_LIST_RESPONSE = "peer_list_response"
    NODE_ANNOUNCE = "node_announce"
    NODE_DEPARTED = "node_departed"
    # Hardware & status
    BENCHMARK_REQUEST = "benchmark_request"
    BENCHMARK_RESULT = "benchmark_result"
    STATUS_REQUEST = "status_request"
    STATUS_RESPONSE = "status_response"
    # Nano operations
    NANO_TRANSFER = "nano_transfer"
    NANO_TRANSFER_ACK = "nano_transfer_ack"
    NANO_REQUEST = "nano_request"
    # Training
    TRAIN_JOB = "train_job"
    TRAIN_STATUS = "train_status"
    TRAIN_RESULT = "train_result"
    GRADIENT_UPDATE = "gradient_update"
    FEDERATED_AVG_REQUEST = "federated_avg_request"
    FEDERATED_AVG_RESULT = "federated_avg_result"
    # Routing
    ROUTE_QUERY = "route_query"
    ROUTE_RESPONSE = "route_response"
    PARTITION_MAP_UPDATE = "partition_map_update"
    # Commands (from commander)
    COMMAND = "command"
    COMMAND_RESULT = "command_result"
    # Remote terminal (commander reads worker stdout)
    TERMINAL_OUTPUT = "terminal_output"
    TERMINAL_COMMAND = "terminal_command"
    # Gossip
    GOSSIP = "gossip"


@dataclass
class PeerInfo:
    """Information about a peer node."""
    node_id: str
    host: str
    port: int
    tier: str = "UNKNOWN"
    gpu_model: str = "none"
    gpu_vram_mb: int = 0
    cpu_cores: int = 0
    ram_mb: int = 0
    tflops: float = 0.0
    last_seen: float = 0.0
    reputation: float = 0.5  # 0.0 = untrusted, 1.0 = fully trusted

    def to_dict(self) -> dict:
        return {
            'node_id': self.node_id, 'host': self.host, 'port': self.port,
            'tier': self.tier, 'gpu_model': self.gpu_model,
            'gpu_vram_mb': self.gpu_vram_mb, 'cpu_cores': self.cpu_cores,
            'ram_mb': self.ram_mb, 'tflops': self.tflops,
            'last_seen': self.last_seen, 'reputation': self.reputation,
        }

    @classmethod
    def from_dict(cls, d: dict) -> 'PeerInfo':
        allowed = set(cls.__dataclass_fields__)
        return cls(**{k: v for k, v in d.items() if k in allowed})


def make_message(msg_type, sender: str, **kwargs) -> dict:
    """Create a protocol message with nonce and timestamp."""
    return {
        'type': msg_type.value if isinstance(msg_type, MessageType) else str(msg_type),
        'sender': sender,
        'timestamp': time.time(),
        'nonce': os.urandom(NONCE_SIZE),
        **kwargs,
    }


def encode_message(msg: dict) -> bytes:
    """Encode a message for network transmission.
    Returns: length-prefixed msgpack bytes.
    """
    try:
        payload = msgpack.packb(msg, use_bin_type=True)
    except Exception as e:
        logger.error(f"Failed to pack message: {e}")
        raise
    return struct.pack('>I', len(payload)) + payload


async def read_message(reader, max_size: int = MAX_MESSAGE_BYTES) -> Optional[dict]:
    """Read a length-prefixed message from an async reader.
    Returns None if connection closed.
    Raises ValueError on oversized or malformed messages.
    """
    length_bytes = await reader.readexactly(4)
    if not length_bytes:
        return None
    length = struct.unpack('>I', length_bytes)[0]
    if length > max_size:
        raise ValueError(f"Message too large: {length} bytes (max {max_size})")
    if length == 0:
        raise ValueError("Zero-length message")
    payload = await reader.readexactly(length)
    try:
        msg = msgpack.unpackb(payload, raw=False)
    except Exception as e:
        raise ValueError(f"Malformed msgpack payload: {e}")
    if not isinstance(msg, dict):
        raise ValueError(f"Payload is {type(msg).__name__}, expected dict")
    if 'type' not in msg or 'sender' not in msg:
        raise ValueError("Message missing required fields (type/sender)")
    return msg


def validate_message(msg: dict) -> bool:
    """Validate a received message has required fields and sane values."""
    if not isinstance(msg, dict):
        return False
    if not isinstance(msg.get('type'), str) or not isinstance(msg.get('sender'), str):
        return False
    ts = msg.get('timestamp', 0)
    if not isinstance(ts, (int, float)):
        return False
    now = time.time()
    if ts > now + 60:
        logger.warning(f"Rejecting message from the future: ts={ts}")
        return False
    if ts < now - 86400:
        logger.warning(f"Rejecting stale message: ts={ts}")
        return False
    return True


def classify_tier(vram_mb: int, gpu_model: str,
                  cpu_cores: int, ram_mb: int) -> str:
    """Classify a machine into a performance tier.

    Tiers (from GLOBAL_HPC_SPEC):
      ULTRA  -- datacenter GPU (A100/H100/MI300+)   >=40 GB VRAM
      CORE   -- workstation GPU (RTX 3070-4090)      >=8 GB VRAM
      EDGE   -- entry GPU or strong CPU              >=2 GB VRAM or >=8 cores + >=16 GB RAM
      NANO   -- everything else (CPU only, phones)
    """
    model_lower = (gpu_model or "").lower()
    ultra_kw = ["a100", "h100", "h200", "mi300", "mi250", "tpu"]
    if any(kw in model_lower for kw in ultra_kw) or vram_mb >= 40960:
        return "ULTRA"
    if vram_mb >= 8192:
        return "CORE"
    if vram_mb >= 2048:
        return "EDGE"
    if cpu_cores >= 8 and ram_mb >= 16384:
        return "EDGE"
    return "NANO"
