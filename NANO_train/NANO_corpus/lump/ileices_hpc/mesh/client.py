"""
Mesh TCP client — connects to peer nodes and the commander.
Handles outbound connections, reconnection with exponential backoff.
"""
import asyncio
import logging
import time
import math
from typing import Optional, Dict, Callable

from .protocol import MessageType, PeerInfo, make_message, validate_message, MAX_MESSAGE_BYTES
from .server import PeerConnection
from ..crypto.identity import NodeIdentity
from ..crypto.encryption import EncryptedChannel, PlaintextChannel

logger = logging.getLogger("ileices.mesh.client")


class MeshClient:
    """Connects to peer nodes or commander, handles reconnection."""

    def __init__(self, identity: NodeIdentity, local_port: int = 7777,
                 crypto_enabled: bool = True,
                 hardware_profile: dict = None,
                 max_reconnect_attempts: int = 20):
        self.identity = identity
        self.local_port = local_port
        self.crypto_enabled = crypto_enabled
        self.hardware_profile = hardware_profile or {}
        self.max_reconnect_attempts = max_reconnect_attempts

        self.connections: Dict[str, PeerConnection] = {}
        self._message_handlers: Dict[str, Callable] = {}
        self._reconnect_tasks: Dict[str, asyncio.Task] = {}
        self._reconnect_counts: Dict[str, int] = {}
        self._running = False

    def on_message(self, msg_type: str, handler: Callable):
        self._message_handlers[msg_type] = handler

    async def connect(self, host: str, port: int,
                      reconnect: bool = True,
                      timeout: float = 10.0) -> Optional[str]:
        """Connect to a peer. Returns peer's node_id or None on failure."""
        key = f"{host}:{port}"
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(host, port),
                timeout=timeout
            )
        except (asyncio.TimeoutError, ConnectionRefusedError, OSError) as e:
            logger.warning(f"Failed to connect to {host}:{port}: {e}")
            if reconnect:
                self._schedule_reconnect(host, port)
            return None

        conn = PeerConnection(reader, writer)

        try:
            hw = self.hardware_profile
            handshake = make_message(
                MessageType.HANDSHAKE_INIT, self.identity.node_id,
                listen_port=self.local_port,
                dh_public=self.identity.dh_public_bytes,
                verify_key=self.identity.verify_key_bytes,
                tier=hw.get('tier', 'UNKNOWN'),
                gpu_model=hw.get('gpus', [{}])[0].get('name', 'none') if hw.get('gpus') else 'none',
                gpu_vram_mb=hw.get('total_vram_mb', 0),
                cpu_cores=hw.get('cpu_cores_physical', 0),
                ram_mb=hw.get('ram_total_mb', 0),
                tflops=hw.get('gpus', [{}])[0].get('tflops_fp32', 0.0) if hw.get('gpus') else 0.0,
            )
            await conn.send(handshake)

            reply = await asyncio.wait_for(conn.recv(), timeout=timeout)
            if reply is None or reply.get('type') != MessageType.HANDSHAKE_REPLY.value:
                logger.warning(f"Bad handshake reply from {host}:{port}")
                conn.close()
                return None
            if not reply.get('accepted', False):
                logger.warning(f"Connection rejected by {host}:{port}")
                conn.close()
                return None

            peer_id = reply['sender']

            # Set up encryption
            if self.crypto_enabled and self.identity.has_crypto and reply.get('dh_public'):
                try:
                    conn.channel = EncryptedChannel(
                        self.identity._dh_private,
                        bytes(reply['dh_public'])
                    )
                    logger.info(f"Encrypted channel to {peer_id}")
                except Exception as e:
                    logger.warning(f"Encryption failed for {peer_id}: {e}")

            # Send HANDSHAKE_COMPLETE to confirm crypto sync
            complete = make_message(
                MessageType.HANDSHAKE_COMPLETE, self.identity.node_id,
            )
            await conn.send(complete)

            conn.peer_info = PeerInfo(
                node_id=peer_id, host=host, port=port, last_seen=time.time(),
            )

            self.connections[peer_id] = conn
            self._running = True
            # Reset reconnect count on success
            self._reconnect_counts.pop(key, None)

            asyncio.create_task(self._recv_loop(peer_id, conn, host, port, reconnect))
            logger.info(f"Connected to peer {peer_id} at {host}:{port}")
            return peer_id

        except Exception as e:
            logger.error(f"Handshake error with {host}:{port}: {e}")
            conn.close()
            if reconnect:
                self._schedule_reconnect(host, port)
            return None

    async def _recv_loop(self, peer_id: str, conn: PeerConnection,
                         host: str, port: int, reconnect: bool):
        """Receive messages from a connected peer."""
        try:
            while self._running:
                try:
                    msg = await asyncio.wait_for(conn.recv(), timeout=30.0)
                except asyncio.TimeoutError:
                    try:
                        hb = make_message(MessageType.HEARTBEAT, self.identity.node_id)
                        await conn.send(hb)
                    except Exception:
                        break
                    continue

                if msg is None:
                    break

                # Validate
                if not validate_message(msg):
                    logger.warning(f"Invalid message from {peer_id}")
                    continue

                msg_type = msg.get('type', '')

                if msg_type == MessageType.HEARTBEAT_ACK.value:
                    conn.last_heartbeat = time.time()
                    continue

                if msg_type == MessageType.DISCONNECT.value:
                    logger.info(f"Peer {peer_id} sent disconnect: {msg.get('reason')}")
                    break

                handler = self._message_handlers.get(msg_type)
                if handler:
                    try:
                        await handler(peer_id, msg)
                    except Exception as e:
                        logger.error(f"Handler error for {msg_type}: {e}", exc_info=True)

        except asyncio.IncompleteReadError:
            logger.info(f"Peer {peer_id} disconnected")
        except ConnectionResetError:
            logger.info(f"Peer {peer_id} connection reset")
        except Exception as e:
            logger.error(f"Recv error from {peer_id}: {e}")
        finally:
            self.connections.pop(peer_id, None)
            conn.close()
            if reconnect and self._running:
                self._schedule_reconnect(host, port)

    def _schedule_reconnect(self, host: str, port: int):
        """Schedule a reconnection attempt with exponential backoff."""
        key = f"{host}:{port}"
        if key in self._reconnect_tasks:
            return

        count = self._reconnect_counts.get(key, 0)
        if count >= self.max_reconnect_attempts:
            logger.error(f"Max reconnect attempts ({self.max_reconnect_attempts}) reached for {key}")
            return

        # Exponential backoff: 2s, 4s, 8s, 16s, ... capped at 60s
        delay = min(2 ** (count + 1), 60)
        self._reconnect_counts[key] = count + 1

        async def _reconnect():
            await asyncio.sleep(delay)
            self._reconnect_tasks.pop(key, None)
            logger.info(f"Reconnect attempt {count+1}/{self.max_reconnect_attempts} to {key} (delay={delay}s)")
            await self.connect(host, port, reconnect=True)

        self._reconnect_tasks[key] = asyncio.create_task(_reconnect())

    async def send_to(self, peer_id: str, msg: dict) -> bool:
        conn = self.connections.get(peer_id)
        if conn is None:
            return False
        try:
            await conn.send(msg)
            return True
        except Exception as e:
            logger.warning(f"Send to {peer_id} failed: {e}")
            return False

    async def disconnect_all(self):
        self._running = False
        for key, task in self._reconnect_tasks.items():
            task.cancel()
        self._reconnect_tasks.clear()
        for peer_id, conn in list(self.connections.items()):
            try:
                msg = make_message(MessageType.DISCONNECT, self.identity.node_id,
                                   reason="client_shutdown")
                await asyncio.wait_for(conn.send(msg), timeout=2.0)
            except Exception:
                pass
            conn.close()
        self.connections.clear()
