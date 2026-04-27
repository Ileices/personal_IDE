"""
Mesh TCP server — accepts incoming peer connections.
Manages connected peers and routes messages.
"""
import asyncio
import logging
import struct
import time
import msgpack
from typing import Dict, Optional, Callable, Any

from .protocol import (
    MessageType, PeerInfo, make_message, validate_message,
    MAX_MESSAGE_BYTES,
)
from ..crypto.identity import NodeIdentity
from ..crypto.encryption import EncryptedChannel, PlaintextChannel

logger = logging.getLogger("ileices.mesh.server")


class PeerConnection:
    """Represents one connected peer."""

    def __init__(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter,
                 peer_info: Optional[PeerInfo] = None):
        self.reader = reader
        self.writer = writer
        self.peer_info = peer_info
        self.channel = PlaintextChannel()
        self.connected_at = time.time()
        self.last_heartbeat = time.time()
        self.messages_sent = 0
        self.messages_received = 0
        self.bytes_sent = 0
        self.bytes_received = 0

    @property
    def node_id(self) -> str:
        return self.peer_info.node_id if self.peer_info else "unknown"

    @property
    def address(self) -> str:
        if self.writer:
            addr = self.writer.get_extra_info('peername')
            return f"{addr[0]}:{addr[1]}" if addr else "unknown"
        return "unknown"

    async def send(self, msg: dict):
        """Send a message to this peer."""
        try:
            payload = msgpack.packb(msg, use_bin_type=True)
        except Exception as e:
            logger.error(f"msgpack encode failed: {e}")
            raise
        encrypted = self.channel.encrypt(payload)
        length = struct.pack('>I', len(encrypted))
        self.writer.write(length + encrypted)
        await self.writer.drain()
        self.messages_sent += 1
        self.bytes_sent += len(encrypted) + 4

    async def recv(self, max_size: int = MAX_MESSAGE_BYTES) -> Optional[dict]:
        """Receive a message from this peer."""
        length_bytes = await self.reader.readexactly(4)
        length = struct.unpack('>I', length_bytes)[0]
        if length > max_size:
            raise ValueError(f"Message too large: {length}")
        if length == 0:
            raise ValueError("Zero-length message")
        encrypted = await self.reader.readexactly(length)
        payload = self.channel.decrypt(encrypted)
        try:
            msg = msgpack.unpackb(payload, raw=False)
        except Exception as e:
            raise ValueError(f"Malformed msgpack: {e}")
        if not isinstance(msg, dict):
            raise ValueError(f"Expected dict, got {type(msg).__name__}")
        self.messages_received += 1
        self.bytes_received += length + 4
        return msg

    def close(self):
        """Close this connection."""
        if self.writer and not self.writer.is_closing():
            self.writer.close()


class MeshServer:
    """Async TCP server that accepts peer connections and routes messages."""

    def __init__(self, identity: NodeIdentity, host: str = "0.0.0.0", port: int = 7777,
                 crypto_enabled: bool = True, max_message_size: int = MAX_MESSAGE_BYTES,
                 max_peers: int = 128):
        self.identity = identity
        self.host = host
        self.port = port
        self.crypto_enabled = crypto_enabled
        self.max_message_size = max_message_size
        self.max_peers = max_peers

        self.peers: Dict[str, PeerConnection] = {}
        self._server: Optional[asyncio.AbstractServer] = None
        self._message_handlers: Dict[str, Callable] = {}
        self._running = False

        # Stats
        self.total_connections = 0
        self.total_messages = 0
        self.rejected_connections = 0

    def on_message(self, msg_type: str, handler: Callable):
        """Register a handler for a message type."""
        self._message_handlers[msg_type] = handler

    async def start(self):
        """Start listening for connections."""
        self._server = await asyncio.start_server(
            self._handle_connection, self.host, self.port,
            reuse_address=True,  # Prevent "address already in use" on restart
        )
        self._running = True
        addrs = ', '.join(str(s.getsockname()) for s in self._server.sockets)
        logger.info(f"Mesh server listening on {addrs} (node_id={self.identity.node_id})")

    async def stop(self):
        """Stop the server and disconnect all peers."""
        self._running = False
        for peer_id, conn in list(self.peers.items()):
            try:
                msg = make_message(MessageType.DISCONNECT, self.identity.node_id,
                                   reason="server_shutdown")
                await asyncio.wait_for(conn.send(msg), timeout=2.0)
            except Exception:
                pass
            conn.close()
        self.peers.clear()
        if self._server:
            self._server.close()
            await self._server.wait_closed()
        logger.info("Mesh server stopped.")

    async def _handle_connection(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        """Handle a new incoming connection."""
        addr = writer.get_extra_info('peername')
        logger.info(f"New connection from {addr}")
        self.total_connections += 1

        # Enforce max_peers
        if len(self.peers) >= self.max_peers:
            logger.warning(f"Rejecting connection from {addr}: max_peers ({self.max_peers}) reached")
            self.rejected_connections += 1
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass
            return

        conn = PeerConnection(reader, writer)
        peer_id = None

        try:
            # Wait for handshake (timeout 10s)
            try:
                msg = await asyncio.wait_for(conn.recv(self.max_message_size), timeout=10.0)
            except asyncio.TimeoutError:
                logger.warning(f"Handshake timeout from {addr}")
                writer.close()
                return

            if msg is None or msg.get('type') != MessageType.HANDSHAKE_INIT.value:
                logger.warning(f"Expected handshake from {addr}, got: {msg.get('type') if msg else 'None'}")
                writer.close()
                return

            peer_id = msg.get('sender', '')
            if not peer_id or not isinstance(peer_id, str):
                logger.warning(f"Invalid peer_id in handshake from {addr}")
                writer.close()
                return

            # Reject duplicate connections
            if peer_id in self.peers:
                logger.warning(f"Duplicate connection from {peer_id}, closing old")
                old = self.peers.pop(peer_id)
                old.close()

            peer_info = PeerInfo(
                node_id=peer_id,
                host=addr[0],
                port=msg.get('listen_port', 0),
                tier=msg.get('tier', 'UNKNOWN'),
                gpu_model=msg.get('gpu_model', 'none'),
                gpu_vram_mb=msg.get('gpu_vram_mb', 0),
                cpu_cores=msg.get('cpu_cores', 0),
                ram_mb=msg.get('ram_mb', 0),
                tflops=msg.get('tflops', 0.0),
                last_seen=time.time(),
            )
            conn.peer_info = peer_info

            # Send handshake reply (plaintext — client hasn't set up crypto yet)
            reply = make_message(
                MessageType.HANDSHAKE_REPLY, self.identity.node_id,
                listen_port=self.port,
                dh_public=self.identity.dh_public_bytes,
                verify_key=self.identity.verify_key_bytes,
                accepted=True,
            )
            await conn.send(reply)

            # Set up encryption AFTER both sides have exchanged DH keys
            if self.crypto_enabled and self.identity.has_crypto and msg.get('dh_public'):
                try:
                    conn.channel = EncryptedChannel(
                        self.identity._dh_private,
                        bytes(msg['dh_public'])
                    )
                    logger.info(f"Encrypted channel with {peer_id}")
                except Exception as e:
                    logger.warning(f"Encryption setup failed with {peer_id}: {e}. Using plaintext.")
                    conn.channel = PlaintextChannel()

            # Wait for HANDSHAKE_COMPLETE from client to confirm crypto sync
            try:
                hs_complete = await asyncio.wait_for(conn.recv(self.max_message_size), timeout=5.0)
                if hs_complete and hs_complete.get('type') == MessageType.HANDSHAKE_COMPLETE.value:
                    logger.debug(f"Handshake complete from {peer_id}")
                else:
                    logger.warning(f"Unexpected msg during handshake from {peer_id}: {hs_complete}")
            except asyncio.TimeoutError:
                logger.warning(f"No HANDSHAKE_COMPLETE from {peer_id} — continuing anyway")
            except Exception:
                pass

            # Register peer
            self.peers[peer_id] = conn
            logger.info(f"Peer {peer_id} ({peer_info.tier}) registered from {addr}")

            # Notify handler
            handler = self._message_handlers.get('peer_connected')
            if handler:
                try:
                    await handler(peer_id, peer_info)
                except Exception as e:
                    logger.error(f"peer_connected handler error: {e}")

            # Message loop
            while self._running:
                try:
                    msg = await asyncio.wait_for(
                        conn.recv(self.max_message_size),
                        timeout=30.0
                    )
                except asyncio.TimeoutError:
                    continue

                if msg is None:
                    break

                self.total_messages += 1
                msg_type = msg.get('type', '')

                # Validate message
                if not validate_message(msg):
                    logger.warning(f"Invalid message from {peer_id}: {msg_type}")
                    continue

                # Update last seen
                if conn.peer_info:
                    conn.peer_info.last_seen = time.time()

                # Handle heartbeat internally
                if msg_type == MessageType.HEARTBEAT.value:
                    ack = make_message(MessageType.HEARTBEAT_ACK, self.identity.node_id)
                    await conn.send(ack)
                    conn.last_heartbeat = time.time()
                    continue

                if msg_type == MessageType.DISCONNECT.value:
                    logger.info(f"Peer {peer_id} disconnected: {msg.get('reason', 'unknown')}")
                    break

                # Dispatch to registered handler
                handler = self._message_handlers.get(msg_type)
                if handler:
                    try:
                        await handler(peer_id, msg)
                    except Exception as e:
                        logger.error(f"Handler error for {msg_type} from {peer_id}: {e}", exc_info=True)
                else:
                    logger.debug(f"No handler for message type: {msg_type}")

        except asyncio.IncompleteReadError:
            logger.info(f"Peer {peer_id or addr} disconnected (incomplete read)")
        except ConnectionResetError:
            logger.info(f"Peer {peer_id or addr} connection reset")
        except Exception as e:
            logger.error(f"Error handling peer {peer_id or addr}: {e}", exc_info=True)
        finally:
            if peer_id and peer_id in self.peers:
                del self.peers[peer_id]
                handler = self._message_handlers.get('peer_disconnected')
                if handler:
                    try:
                        await handler(peer_id)
                    except Exception:
                        pass
            conn.close()

    async def broadcast(self, msg: dict, exclude: Optional[str] = None):
        """Send a message to all connected peers."""
        for peer_id, conn in list(self.peers.items()):
            if peer_id == exclude:
                continue
            try:
                await conn.send(msg)
            except Exception as e:
                logger.warning(f"Failed to broadcast to {peer_id}: {e}")

    async def send_to(self, peer_id: str, msg: dict) -> bool:
        """Send a message to a specific peer. Returns True if sent."""
        conn = self.peers.get(peer_id)
        if conn is None:
            return False
        try:
            await conn.send(msg)
            return True
        except Exception as e:
            logger.warning(f"Failed to send to {peer_id}: {e}")
            return False

    def get_peer_list(self) -> list:
        """Get list of all connected peer infos."""
        return [
            conn.peer_info.to_dict()
            for conn in self.peers.values()
            if conn.peer_info
        ]
