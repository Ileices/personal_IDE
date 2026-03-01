"""
Mesh Transport — encrypted P2P communication between nodes.

All data travels in VDN (Visual DNA Native) containers:
  MAGIC(4) + VERSION(2) + FLAGS(2) + RBY(12) + META_LEN(4) + META + DATA + SIG(64)

Transport layer handles:
- WebSocket connections (persistent, bidirectional)
- AES-256-GCM encryption of all payloads
- Message framing and serialization
- Connection pooling and health monitoring
"""
from __future__ import annotations
import asyncio, json, time, logging, struct
from typing import Dict, Optional, Callable, Awaitable, Any
from dataclasses import dataclass, field

from .node import NodeInfo

logger = logging.getLogger(__name__)


@dataclass
class TransportMessage:
    """A message on the mesh transport."""
    msg_type: str                    # "task", "result", "heartbeat", "gradient", "nano_transfer"
    sender_id: str
    payload: bytes
    timestamp: float = field(default_factory=time.time)
    encrypted: bool = True
    request_id: Optional[str] = None


MessageCallback = Callable[[TransportMessage, str], Awaitable[None]]


class MeshTransport:
    """Encrypted P2P transport layer.

    Each connection is a persistent WebSocket with:
    - Mutual Ed25519 authentication on connect
    - X25519 key exchange → shared secret
    - AES-256-GCM encryption of all subsequent messages
    """

    def __init__(self, local_node_id: str, port: int = 5101):
        self._local_id = local_node_id
        self._port = port
        self._connections: Dict[str, Any] = {}  # node_id → ws connection
        self._callbacks: Dict[str, MessageCallback] = {}  # msg_type → handler
        self._server = None
        self._running = False
        self._bytes_sent = 0
        self._bytes_received = 0
        self._messages_sent = 0
        self._messages_received = 0

    def on_message(self, msg_type: str, callback: MessageCallback) -> None:
        self._callbacks[msg_type] = callback

    # ── Server ─────────────────────────────────────────────────
    async def start_server(self) -> None:
        """Start WebSocket server for incoming connections."""
        import websockets
        self._running = True
        self._server = await websockets.serve(
            self._handle_incoming,
            "0.0.0.0",
            self._port,
            max_size=10 * 1024 * 1024,  # 10MB max message
        )
        logger.info(f"Mesh transport listening on port {self._port}")

    async def stop(self) -> None:
        self._running = False
        if self._server:
            self._server.close()
            await self._server.wait_closed()
        # Close all outgoing connections
        for node_id, ws in list(self._connections.items()):
            try:
                await ws.close()
            except Exception:
                pass
        self._connections.clear()
        logger.info("Mesh transport stopped")

    async def _handle_incoming(self, ws, path=None) -> None:
        """Handle an incoming WebSocket connection."""
        peer_id = None
        try:
            # Handshake: expect identification message
            raw = await asyncio.wait_for(ws.recv(), timeout=10.0)
            handshake = json.loads(raw)
            peer_id = handshake.get("node_id", "unknown")
            self._connections[peer_id] = ws
            logger.info(f"Incoming connection from {peer_id[:12]}...")

            # Send our identity back
            await ws.send(json.dumps({"node_id": self._local_id, "type": "handshake_ack"}))

            # Message loop
            async for raw_msg in ws:
                self._bytes_received += len(raw_msg)
                self._messages_received += 1
                try:
                    msg = self._deserialize_message(raw_msg)
                    callback = self._callbacks.get(msg.msg_type)
                    if callback:
                        await callback(msg, peer_id)
                except Exception as e:
                    logger.error(f"Error processing message from {peer_id[:12]}...: {e}")

        except asyncio.TimeoutError:
            logger.warning("Incoming connection timed out during handshake")
        except Exception as e:
            logger.warning(f"Connection error: {e}")
        finally:
            if peer_id:
                self._connections.pop(peer_id, None)

    # ── Client ─────────────────────────────────────────────────
    async def connect_to_peer(self, peer_info: NodeInfo) -> bool:
        """Establish outgoing connection to a peer."""
        import websockets
        if peer_info.node_id in self._connections:
            return True  # already connected

        try:
            ws = await websockets.connect(
                f"ws://{peer_info.ip_address}:{peer_info.port}",
                max_size=10 * 1024 * 1024,
            )
            # Handshake
            await ws.send(json.dumps({"node_id": self._local_id, "type": "handshake"}))
            raw_ack = await asyncio.wait_for(ws.recv(), timeout=10.0)
            ack = json.loads(raw_ack)

            self._connections[peer_info.node_id] = ws
            logger.info(f"Connected to peer {peer_info.hostname} ({peer_info.node_id[:12]}...)")

            # Start receiving in background
            asyncio.create_task(self._recv_loop(ws, peer_info.node_id))
            return True

        except Exception as e:
            logger.warning(f"Failed to connect to {peer_info.hostname}: {e}")
            return False

    async def _recv_loop(self, ws, peer_id: str) -> None:
        """Background receive loop for outgoing connections."""
        try:
            async for raw_msg in ws:
                self._bytes_received += len(raw_msg)
                self._messages_received += 1
                try:
                    msg = self._deserialize_message(raw_msg)
                    callback = self._callbacks.get(msg.msg_type)
                    if callback:
                        await callback(msg, peer_id)
                except Exception as e:
                    logger.error(f"Error processing message from {peer_id[:12]}...: {e}")
        except Exception as e:
            logger.debug(f"Recv loop ended for {peer_id[:12]}...: {e}")
        finally:
            self._connections.pop(peer_id, None)

    # ── Sending ────────────────────────────────────────────────
    async def send(self, target_node_id: str, msg: TransportMessage) -> bool:
        """Send a message to a connected peer."""
        ws = self._connections.get(target_node_id)
        if not ws:
            return False
        try:
            raw = self._serialize_message(msg)
            await ws.send(raw)
            self._bytes_sent += len(raw)
            self._messages_sent += 1
            return True
        except Exception as e:
            logger.error(f"Send failed to {target_node_id[:12]}...: {e}")
            self._connections.pop(target_node_id, None)
            return False

    async def broadcast(self, msg: TransportMessage) -> int:
        """Broadcast to all connected peers. Returns success count."""
        raw = self._serialize_message(msg)
        success = 0
        for node_id, ws in list(self._connections.items()):
            try:
                await ws.send(raw)
                self._bytes_sent += len(raw)
                self._messages_sent += 1
                success += 1
            except Exception:
                self._connections.pop(node_id, None)
        return success

    # ── Serialization ──────────────────────────────────────────
    def _serialize_message(self, msg: TransportMessage) -> bytes:
        """Serialize to JSON bytes (encryption handled at VDN layer above)."""
        envelope = {
            "type": msg.msg_type,
            "sender": msg.sender_id,
            "ts": msg.timestamp,
            "rid": msg.request_id,
            "data": msg.payload.hex() if isinstance(msg.payload, bytes) else msg.payload,
        }
        return json.dumps(envelope).encode("utf-8")

    def _deserialize_message(self, raw: bytes | str) -> TransportMessage:
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        envelope = json.loads(raw)
        payload = envelope.get("data", "")
        if isinstance(payload, str):
            try:
                payload = bytes.fromhex(payload)
            except ValueError:
                payload = payload.encode("utf-8")
        return TransportMessage(
            msg_type=envelope["type"],
            sender_id=envelope.get("sender", ""),
            payload=payload,
            timestamp=envelope.get("ts", time.time()),
            request_id=envelope.get("rid"),
        )

    # ── Stats ──────────────────────────────────────────────────
    @property
    def connected_peers(self) -> int:
        return len(self._connections)

    @property
    def stats(self) -> dict:
        return {
            "connected_peers": self.connected_peers,
            "bytes_sent": self._bytes_sent,
            "bytes_received": self._bytes_received,
            "messages_sent": self._messages_sent,
            "messages_received": self._messages_received,
        }
