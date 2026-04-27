"""
Ileices HPC Agent -- main entry point.

Usage:
  Commander:  python -m ileices_hpc --role commander --port 7777
  Worker:     python -m ileices_hpc --role worker --commander 192.168.1.X:7777
"""
import asyncio
import argparse
import logging
import logging.handlers
import sys
import os
import time
from typing import Optional, Dict, List
from dataclasses import asdict
from pathlib import Path

from .config import AgentConfig
from .hardware_benchmark import run_benchmark
from .command_handler import CommandHandler
from ..crypto.identity import NodeIdentity
from ..mesh.server import MeshServer
from ..mesh.client import MeshClient
from ..mesh.peer_discovery import PeerDiscovery
from ..mesh.gossip import GossipProtocol
from ..mesh.protocol import MessageType, make_message, PeerInfo

logger = logging.getLogger("ileices.agent")


class IleicesAgent:
    """The main agent that runs on each machine in the mesh."""

    def __init__(self, config: AgentConfig):
        self.config = config
        self.start_time = time.time()
        self._shutdown_called = False

        # Identity
        self.identity = NodeIdentity(config.crypto.key_dir)
        self._display_name = config.node_name or self.identity.node_id[:8]

        # Hardware profile (populated after benchmark)
        self.hardware_profile: Optional[dict] = None

        # Mesh components
        self.server = MeshServer(
            self.identity,
            host=config.mesh.listen_host,
            port=config.mesh.listen_port,
            crypto_enabled=config.crypto.enabled,
            max_message_size=config.mesh.message_max_bytes,
            max_peers=config.mesh.max_peers,
        )

        self.client = MeshClient(
            self.identity,
            local_port=config.mesh.listen_port,
            crypto_enabled=config.crypto.enabled,
            max_reconnect_attempts=config.mesh.max_reconnect_attempts,
        )

        self.discovery = PeerDiscovery(
            self.identity.node_id,
            config.mesh.listen_port,
        )

        self.gossip = GossipProtocol(
            self.identity.node_id,
            interval_s=config.mesh.gossip_interval_s,
        )

        # Command handler
        self.commands = CommandHandler(self)

        # State
        self._running = False
        self._shutdown_event = asyncio.Event()

    async def start(self):
        """Start the agent: benchmark, start server, connect, discover."""
        self._running = True

        print(f"\n{'='*50}")
        print(f"  ILEICES HPC AGENT v0.1.0")
        print(f"  Node ID: {self.identity.node_id}")
        print(f"  Role:    {self.config.role}")
        print(f"  Port:    {self.config.mesh.listen_port}")
        print(f"  Crypto:  {'ON' if self.config.crypto.enabled else 'OFF'}")
        print(f"{'='*50}\n")

        # 1. Quick benchmark
        print("[1/4] Running hardware benchmark...")
        try:
            profile = run_benchmark(
                gpu_warmup=self.config.benchmark.gpu_warmup_iters,
                gpu_iters=self.config.benchmark.gpu_bench_iters,
                matrix_size=self.config.benchmark.matrix_size,
                disk_test_mb=self.config.benchmark.disk_test_size_mb,
                skip_disk=True,
            )
            self.hardware_profile = profile.to_dict()
            self.client.hardware_profile = self.hardware_profile
            print(profile.summary())
        except Exception as e:
            logger.error(f"Benchmark failed: {e}", exc_info=True)
            print(f"  Benchmark failed: {e}. Continuing with unknown hardware.")
            self.hardware_profile = {'tier': 'UNKNOWN'}

        # 2. Start mesh server
        print("\n[2/4] Starting mesh server...")
        try:
            await self.server.start()
        except OSError as e:
            if "address already in use" in str(e).lower() or e.errno == 10048:
                logger.error(f"Port {self.config.mesh.listen_port} already in use!")
                print(f"\n  ERROR: Port {self.config.mesh.listen_port} is already in use.")
                print(f"  Try a different port with --port <number>")
                raise SystemExit(1)
            raise
        self._register_handlers()

        # 3. Connect to commander or peers
        print("\n[3/4] Connecting to mesh...")
        if self.config.role == 'worker' and self.config.commander_address:
            host, port = self.config.commander_address.rsplit(':', 1)
            port = int(port)
            print(f"  Connecting to commander at {host}:{port}...")
            peer_id = await self.client.connect(host, port, reconnect=True)
            if peer_id:
                print(f"  Connected to commander: {peer_id[:10]}")
            else:
                print(f"  Failed to connect to commander (will retry with backoff)")

        # 4. Start discovery and gossip
        print("\n[4/4] Starting discovery and gossip...")
        self.discovery.tier = self.hardware_profile.get('tier', 'UNKNOWN')
        await self.discovery.start_advertising()

        self.gossip.configure(
            send_fn=self.send_to,
            get_peers_fn=lambda: list(self.server.peers.keys()),
            on_update=self._on_gossip_update,
        )
        self.gossip.set(f"node:{self.identity.node_id}", {
            'tier': self.hardware_profile.get('tier', 'UNKNOWN'),
            'hostname': self.hardware_profile.get('hostname', ''),
        })
        self.gossip.start()

        print(f"\n{'='*50}")
        print(f"Agent ready. Type 'help' for commands.")
        print(f"{'='*50}\n")

    def _register_handlers(self):
        """Register message handlers on server and client."""
        # Server-side
        self.server.on_message(MessageType.COMMAND.value, self._handle_command)
        self.server.on_message(MessageType.BENCHMARK_REQUEST.value, self._handle_benchmark_request)
        self.server.on_message(MessageType.BENCHMARK_RESULT.value, self._handle_benchmark_result)
        self.server.on_message(MessageType.GOSSIP.value, self.gossip.handle_gossip)
        self.server.on_message(MessageType.COMMAND_RESULT.value, self._handle_command_result)
        self.server.on_message(MessageType.TERMINAL_OUTPUT.value, self._handle_terminal_output)
        self.server.on_message(MessageType.TERMINAL_COMMAND.value, self._handle_terminal_command)
        self.server.on_message('peer_connected', self._on_peer_connected)
        self.server.on_message('peer_disconnected', self._on_peer_disconnected)

        # Client-side
        self.client.on_message(MessageType.COMMAND.value, self._handle_command)
        self.client.on_message(MessageType.BENCHMARK_REQUEST.value, self._handle_benchmark_request)
        self.client.on_message(MessageType.GOSSIP.value, self.gossip.handle_gossip)
        self.client.on_message(MessageType.COMMAND_RESULT.value, self._handle_command_result)
        self.client.on_message(MessageType.TERMINAL_OUTPUT.value, self._handle_terminal_output)
        self.client.on_message(MessageType.TERMINAL_COMMAND.value, self._handle_terminal_command)

    async def _handle_command(self, sender_id: str, msg: dict):
        await self.commands.handle_remote_command(sender_id, msg)

    async def _handle_command_result(self, sender_id: str, msg: dict):
        result = msg.get('result', '')
        cmd = msg.get('original_command', '')
        print(f"\n[{sender_id[:8]}] Result of '{cmd}':\n{result}\n> ", end='', flush=True)

    async def _handle_benchmark_request(self, sender_id: str, msg: dict):
        print(f"\n[{sender_id[:8]}] Benchmark requested. Running...")
        try:
            profile = run_benchmark(
                gpu_warmup=self.config.benchmark.gpu_warmup_iters,
                gpu_iters=self.config.benchmark.gpu_bench_iters,
                matrix_size=self.config.benchmark.matrix_size,
                disk_test_mb=self.config.benchmark.disk_test_size_mb,
            )
            self.hardware_profile = profile.to_dict()
            result = make_message(
                MessageType.BENCHMARK_RESULT, self.identity.node_id,
                profile=self.hardware_profile,
            )
            await self.send_to(sender_id, result)
            print(f"  Benchmark sent to {sender_id[:8]}")
        except Exception as e:
            logger.error(f"Benchmark request failed: {e}")

    async def _handle_benchmark_result(self, sender_id: str, msg: dict):
        profile = msg.get('profile', {})
        tier = profile.get('tier', 'UNKNOWN')
        hostname = profile.get('hostname', 'unknown')
        print(f"\n[{sender_id[:8]}] Benchmark result: {hostname} -> Tier {tier}")
        self.gossip.set(f"node:{sender_id}", {
            'tier': tier, 'hostname': hostname, 'profile': profile,
        })

    async def _handle_terminal_output(self, sender_id: str, msg: dict):
        """Handle terminal output from a worker (for remote terminal)."""
        output = msg.get('output', '')
        source = msg.get('source', 'stdout')
        if output:
            print(f"\n[{sender_id[:8]}|{source}] {output}", end='', flush=True)

    async def _handle_terminal_command(self, sender_id: str, msg: dict):
        """Handle a terminal command from the commander (worker-side execution)."""
        await self.commands.handle_terminal_command(sender_id, msg)

    async def _on_peer_connected(self, peer_id: str, peer_info: PeerInfo):
        print(f"\n[+] Peer connected: {peer_id[:10]} ({peer_info.tier}) from {peer_info.host}:{peer_info.port}")
        self.gossip.set(f"node:{peer_id}", peer_info.to_dict())

    async def _on_peer_disconnected(self, peer_id: str):
        print(f"\n[-] Peer disconnected: {peer_id[:10]}")

    async def _on_gossip_update(self, updated_keys: list):
        logger.debug(f"Gossip updated: {updated_keys}")

    # ---- Utility methods ----

    def get_connected_peers(self) -> list:
        peers = []
        for conn in self.server.peers.values():
            if conn.peer_info:
                peers.append(conn.peer_info.to_dict())
        for conn in self.client.connections.values():
            if conn.peer_info:
                info = conn.peer_info.to_dict()
                if not any(p['node_id'] == info['node_id'] for p in peers):
                    peers.append(info)
        return peers

    def resolve_peer_id(self, prefix: str) -> Optional[str]:
        for pid in self.server.peers:
            if pid.startswith(prefix):
                return pid
        for pid in self.client.connections:
            if pid.startswith(prefix):
                return pid
        return None

    async def send_to(self, peer_id: str, msg: dict) -> bool:
        if await self.server.send_to(peer_id, msg):
            return True
        return await self.client.send_to(peer_id, msg)

    async def run_cli(self):
        """Run the interactive CLI loop (for commander)."""
        loop = asyncio.get_event_loop()
        while self._running:
            try:
                line = await loop.run_in_executor(None, lambda: input("> "))
                if not line.strip():
                    continue
                result = await self.commands.execute(line)
                if result:
                    print(result)
            except EOFError:
                break
            except KeyboardInterrupt:
                break
        # Don't call shutdown here — let the finally block in main() handle it

    async def shutdown(self):
        """Gracefully shutdown the agent. Safe to call multiple times."""
        if self._shutdown_called:
            return
        self._shutdown_called = True
        print("\nShutting down agent...")

        self._running = False
        try:
            self.gossip.stop()
        except Exception:
            pass
        try:
            self.discovery.stop_advertising()
        except Exception:
            pass
        try:
            await self.client.disconnect_all()
        except Exception:
            pass
        try:
            await self.server.stop()
        except Exception:
            pass

        self._shutdown_event.set()
        print("Agent stopped.")

    async def run_forever(self):
        """Run until shutdown is requested (for workers)."""
        await self._shutdown_event.wait()


def setup_logging(config: AgentConfig):
    """Set up logging with console + optional file output."""
    root = logging.getLogger("ileices")
    root.setLevel(getattr(logging, config.log_level.upper(), logging.INFO))

    # Console handler
    console = logging.StreamHandler()
    console.setLevel(logging.INFO)
    console.setFormatter(logging.Formatter(
        '%(asctime)s [%(name)s] %(levelname)s: %(message)s', datefmt='%H:%M:%S'))
    root.addHandler(console)

    # File handler (rotating)
    if config.log_file:
        Path(config.log_file).parent.mkdir(parents=True, exist_ok=True)
        file_handler = logging.handlers.RotatingFileHandler(
            config.log_file, maxBytes=10*1024*1024, backupCount=5,
            encoding='utf-8')
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(logging.Formatter(
            '%(asctime)s [%(name)s] %(levelname)s: %(message)s'))
        root.addHandler(file_handler)
        logger.info(f"Logging to file: {config.log_file}")


def parse_args():
    parser = argparse.ArgumentParser(description="Ileices HPC Agent")
    parser.add_argument('--role', choices=['commander', 'worker'], default='worker',
                        help='Role: commander (with CLI) or worker (headless)')
    parser.add_argument('--port', type=int, default=7777,
                        help='Port to listen on (default: 7777)')
    parser.add_argument('--commander', type=str, default=None,
                        help='Commander address (host:port) for workers')
    parser.add_argument('--name', type=str, default=None,
                        help='Human-readable node name')
    parser.add_argument('--no-crypto', action='store_true',
                        help='Disable encryption (for LAN testing)')
    parser.add_argument('--config', type=str, default=None,
                        help='Path to config JSON file')
    parser.add_argument('--log-file', type=str, default=None,
                        help='Path to log file (enables file logging)')
    parser.add_argument('--log-level', type=str, default='INFO',
                        choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'],
                        help='Log level (default: INFO)')
    return parser.parse_args()


async def main():
    args = parse_args()

    config = AgentConfig.from_args(args)

    # Default log file if not specified
    if not config.log_file:
        os.makedirs(config.data_dir, exist_ok=True)
        config.log_file = os.path.join(config.data_dir, "ileices_agent.log")

    setup_logging(config)
    agent = IleicesAgent(config)

    try:
        await agent.start()
        if config.role == 'commander':
            await agent.run_cli()
        else:
            print("Running as worker. Press Ctrl+C to stop.")
            await agent.run_forever()
    except KeyboardInterrupt:
        pass
    except SystemExit:
        raise
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
    finally:
        await agent.shutdown()


if __name__ == '__main__':
    asyncio.run(main())
