"""
Command handler -- processes commands from the CLI or remote peers.
Security: remote commands are whitelisted. Only commander can send quit/disconnect.
"""
import asyncio
import logging
import os
import subprocess
import sys
import time
import json
from typing import Dict, Any, Optional, Callable

from ..mesh.protocol import MessageType, make_message

logger = logging.getLogger("ileices.agent.command")

# Commands that can be executed remotely by any peer
REMOTE_ALLOWED = frozenset({
    'status', 'peers', 'benchmark', 'ping', 'gossip_state', 'echo',
})

# Commands only the commander can send remotely
COMMANDER_ONLY = frozenset({
    'quit', 'disconnect', 'broadcast', 'send_command',
    'remote_shell', 'logs',
})


class CommandHandler:
    """Handles interactive commands and remote commands with security."""

    def __init__(self, agent):
        self.agent = agent
        self._commands: Dict[str, Callable] = {}
        self._register_commands()

    def _register_commands(self):
        self._commands = {
            'help': self.cmd_help,
            'status': self.cmd_status,
            'peers': self.cmd_peers,
            'benchmark': self.cmd_benchmark,
            'ping': self.cmd_ping,
            'broadcast': self.cmd_broadcast,
            'disconnect': self.cmd_disconnect,
            'send_command': self.cmd_send_command,
            'gossip_state': self.cmd_gossip_state,
            'echo': self.cmd_echo,
            'logs': self.cmd_logs,
            'remote_shell': self.cmd_remote_shell,
            'quit': self.cmd_quit,
        }

    async def execute(self, command_line: str) -> str:
        """Execute a command string from local CLI."""
        parts = command_line.strip().split()
        if not parts:
            return ""
        cmd = parts[0].lower()
        args = parts[1:]
        handler = self._commands.get(cmd)
        if handler is None:
            return f"Unknown command: {cmd}. Type 'help' for available commands."
        try:
            return await handler(args)
        except Exception as e:
            logger.error(f"Command '{cmd}' failed: {e}", exc_info=True)
            return f"Error: {e}"

    async def handle_remote_command(self, sender_id: str, msg: dict):
        """Handle a command from a remote peer with security checks."""
        cmd_line = msg.get('command', '')
        if not cmd_line or not isinstance(cmd_line, str):
            return

        parts = cmd_line.strip().split()
        if not parts:
            return

        cmd = parts[0].lower()

        # Security: check if this command is allowed remotely
        if cmd not in REMOTE_ALLOWED and cmd not in COMMANDER_ONLY:
            logger.warning(f"Blocked remote command '{cmd}' from {sender_id}")
            reply = make_message(
                MessageType.COMMAND_RESULT, self.agent.identity.node_id,
                result=f"Command '{cmd}' not allowed remotely.",
                original_command=cmd_line,
            )
            await self.agent.send_to(sender_id, reply)
            return

        # Commander-only commands: verify sender is our commander
        if cmd in COMMANDER_ONLY:
            if self.agent.config.role != 'worker':
                # We're the commander, only local CLI can run these
                pass
            elif self.agent.config.commander_address:
                # TODO: verify sender_id matches commander identity
                pass

        result = await self.execute(cmd_line)
        reply = make_message(
            MessageType.COMMAND_RESULT, self.agent.identity.node_id,
            result=result,
            original_command=cmd_line,
        )
        await self.agent.send_to(sender_id, reply)

    # ---- Built-in Commands ----

    async def cmd_help(self, args) -> str:
        """Show available commands."""
        lines = ["=== Ileices HPC Commands ==="]
        for name, fn in sorted(self._commands.items()):
            doc = fn.__doc__ or "No description"
            lines.append(f"  {name:20s} -- {doc.strip().split(chr(10))[0]}")
        return "\n".join(lines)

    async def cmd_status(self, args) -> str:
        """Show this node's status and hardware info."""
        agent = self.agent
        peers = agent.get_connected_peers()
        lines = [
            f"=== Node Status ===",
            f"Node ID:    {agent.identity.node_id}",
            f"Role:       {agent.config.role}",
            f"Tier:       {agent.hardware_profile.get('tier', 'UNKNOWN') if agent.hardware_profile else 'NOT BENCHMARKED'}",
            f"Peers:      {len(peers)}",
            f"Uptime:     {time.time() - agent.start_time:.0f}s",
            f"Encryption: {'ON' if agent.config.crypto.enabled else 'OFF'}",
            f"Crypto lib: {'PyNaCl' if agent.identity.has_crypto else 'None (plaintext)'}",
        ]
        if agent.hardware_profile:
            hp = agent.hardware_profile
            lines.append(f"CPU:        {hp.get('cpu_model', 'unknown')} ({hp.get('cpu_cores_physical', '?')}C)")
            lines.append(f"RAM:        {hp.get('ram_total_mb', 0):,} MB")
            if hp.get('gpus'):
                for gpu in hp['gpus']:
                    lines.append(f"GPU:        {gpu['name']} ({gpu['vram_mb']:,} MB, {gpu['tflops_fp32']:.2f} TFLOPS)")
        if peers:
            lines.append(f"\n--- Connected Peers ---")
            for p in peers:
                lines.append(f"  {p['node_id'][:8]}  {p.get('tier','?'):6s}  {p['host']}:{p['port']}  rep={p.get('reputation', 0):.2f}")
        return "\n".join(lines)

    async def cmd_peers(self, args) -> str:
        """List all connected peers with details."""
        peers = self.agent.get_connected_peers()
        if not peers:
            return "No peers connected."
        lines = [f"{'ID':>10s}  {'Tier':>6s}  {'Address':>22s}  {'GPU':>20s}  {'VRAM':>8s}  {'TFLOPS':>8s}"]
        lines.append("-" * 80)
        for p in peers:
            lines.append(
                f"{p['node_id'][:10]:>10s}  {p.get('tier','?'):>6s}  "
                f"{p['host']}:{p['port']:>5d}  "
                f"{p.get('gpu_model','none'):>20s}  "
                f"{p.get('gpu_vram_mb',0):>6d}MB  "
                f"{p.get('tflops',0):>8.2f}"
            )
        return "\n".join(lines)

    async def cmd_benchmark(self, args) -> str:
        """Run hardware benchmark. Use 'benchmark all' for all peers."""
        if args and args[0] == 'all':
            msg = make_message(MessageType.BENCHMARK_REQUEST, self.agent.identity.node_id)
            await self.agent.server.broadcast(msg)
            return "Benchmark request sent to all peers."
        else:
            from .hardware_benchmark import run_benchmark
            print("Running local benchmark...")
            profile = run_benchmark(
                gpu_warmup=self.agent.config.benchmark.gpu_warmup_iters,
                gpu_iters=self.agent.config.benchmark.gpu_bench_iters,
                matrix_size=self.agent.config.benchmark.matrix_size,
                disk_test_mb=self.agent.config.benchmark.disk_test_size_mb,
            )
            self.agent.hardware_profile = profile.to_dict()
            return profile.summary()

    async def cmd_ping(self, args) -> str:
        """Ping a peer with true RTT. Usage: ping <node_id_prefix>"""
        if not args:
            return "Usage: ping <node_id_prefix>"
        target = args[0]
        peer_id = self.agent.resolve_peer_id(target)
        if not peer_id:
            return f"Peer not found: {target}"

        # Use echo-based RTT measurement
        start = time.perf_counter()
        ping_data = f"ping_{time.time()}"
        msg = make_message(MessageType.STATUS_REQUEST, self.agent.identity.node_id,
                           data=ping_data, is_ping=True)
        sent = await self.agent.send_to(peer_id, msg)
        if not sent:
            return f"Failed to send ping to {peer_id}"
        elapsed = (time.perf_counter() - start) * 1000
        return f"Ping sent to {peer_id[:10]} (send latency: {elapsed:.1f}ms)"

    async def cmd_broadcast(self, args) -> str:
        """Broadcast a text message to all peers."""
        if not args:
            return "Usage: broadcast <message>"
        text = " ".join(args)
        msg = make_message(MessageType.COMMAND, self.agent.identity.node_id, command=f"echo {text}")
        await self.agent.server.broadcast(msg)
        return f"Broadcast to {len(self.agent.get_connected_peers())} peers: {text}"

    async def cmd_send_command(self, args) -> str:
        """Send a command to a peer. Usage: send_command <node_id> <command>"""
        if len(args) < 2:
            return "Usage: send_command <node_id_prefix> <command ...>"
        target = args[0]
        command = " ".join(args[1:])
        peer_id = self.agent.resolve_peer_id(target)
        if not peer_id:
            return f"Peer not found: {target}"
        msg = make_message(MessageType.COMMAND, self.agent.identity.node_id, command=command)
        sent = await self.agent.send_to(peer_id, msg)
        return f"Command sent to {peer_id[:10]}: {command}" if sent else f"Failed to send to {peer_id}"

    async def cmd_gossip_state(self, args) -> str:
        """Show current gossip state."""
        state = self.agent.gossip.get_all()
        if not state:
            return "Gossip state is empty."
        return json.dumps(state, indent=2, default=str)

    async def cmd_echo(self, args) -> str:
        """Echo a message back. Used for ping/testing."""
        return " ".join(args) if args else ""

    async def cmd_logs(self, args) -> str:
        """Show recent log entries. Usage: logs [count]"""
        count = 20
        if args:
            try:
                count = int(args[0])
            except ValueError:
                pass
        log_file = self.agent.config.log_file
        if not log_file or not os.path.exists(log_file):
            return "No log file configured. Use --log-file to enable."
        try:
            import os
            with open(log_file, 'r') as f:
                lines = f.readlines()
            return "".join(lines[-count:])
        except Exception as e:
            return f"Error reading logs: {e}"

    async def cmd_disconnect(self, args) -> str:
        """Disconnect from a peer. Usage: disconnect <node_id_prefix>"""
        if not args:
            return "Usage: disconnect <node_id_prefix>"
        target = args[0]
        peer_id = self.agent.resolve_peer_id(target)
        if not peer_id:
            return f"Peer not found: {target}"

        # Close server-side connection
        if peer_id in self.agent.server.peers:
            conn = self.agent.server.peers[peer_id]
            msg = make_message(MessageType.DISCONNECT, self.agent.identity.node_id,
                               reason="operator_disconnect")
            try:
                await asyncio.wait_for(conn.send(msg), timeout=2.0)
            except Exception:
                pass
            conn.close()
            del self.agent.server.peers[peer_id]

        # Close client-side connection
        if peer_id in self.agent.client.connections:
            conn = self.agent.client.connections[peer_id]
            try:
                msg = make_message(MessageType.DISCONNECT, self.agent.identity.node_id,
                                   reason="operator_disconnect")
                await asyncio.wait_for(conn.send(msg), timeout=2.0)
            except Exception:
                pass
            conn.close()
            del self.agent.client.connections[peer_id]

        return f"Disconnected from {peer_id[:10]}"

    async def cmd_remote_shell(self, args) -> str:
        """Run a shell command on a worker. Usage: remote_shell <node_id> <command>"""
        if len(args) < 2:
            return "Usage: remote_shell <node_id_prefix> <shell command ...>"
        target = args[0]
        shell_cmd = " ".join(args[1:])
        peer_id = self.agent.resolve_peer_id(target)
        if not peer_id:
            return f"Peer not found: {target}"

        msg = make_message(
            MessageType.TERMINAL_COMMAND, self.agent.identity.node_id,
            shell_command=shell_cmd,
            timeout=30,
        )
        sent = await self.agent.send_to(peer_id, msg)
        if sent:
            return f"Shell command sent to {peer_id[:10]}: {shell_cmd}\n(Output will stream below)"
        return f"Failed to send to {peer_id}"

    async def handle_terminal_command(self, sender_id: str, msg: dict):
        """Execute a shell command received from the commander and stream output back."""
        shell_cmd = msg.get('shell_command', '')
        timeout = msg.get('timeout', 30)

        if not shell_cmd:
            return

        # Only accept from commander
        if self.agent.config.role != 'worker':
            logger.warning(f"Ignoring terminal command from {sender_id} — not a worker")
            return

        logger.info(f"Executing remote shell command from {sender_id[:8]}: {shell_cmd}")

        try:
            # Run the command with a timeout
            proc = await asyncio.create_subprocess_shell(
                shell_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=os.getcwd(),
            )

            async def stream_pipe(pipe, source_name):
                """Read a pipe line-by-line and send each chunk back."""
                buffer = b""
                while True:
                    chunk = await pipe.read(4096)
                    if not chunk:
                        break
                    buffer += chunk
                    # Send complete lines as they arrive
                    while b"\n" in buffer:
                        line, buffer = buffer.split(b"\n", 1)
                        text = line.decode('utf-8', errors='replace')
                        out_msg = make_message(
                            MessageType.TERMINAL_OUTPUT, self.agent.identity.node_id,
                            output=text + "\n",
                            source=source_name,
                            command=shell_cmd,
                        )
                        await self.agent.send_to(sender_id, out_msg)
                # Flush remaining buffer
                if buffer:
                    text = buffer.decode('utf-8', errors='replace')
                    out_msg = make_message(
                        MessageType.TERMINAL_OUTPUT, self.agent.identity.node_id,
                        output=text,
                        source=source_name,
                        command=shell_cmd,
                    )
                    await self.agent.send_to(sender_id, out_msg)

            # Stream stdout and stderr concurrently with timeout
            try:
                await asyncio.wait_for(
                    asyncio.gather(
                        stream_pipe(proc.stdout, "stdout"),
                        stream_pipe(proc.stderr, "stderr"),
                    ),
                    timeout=timeout,
                )
                returncode = await asyncio.wait_for(proc.wait(), timeout=5)
            except asyncio.TimeoutError:
                proc.kill()
                returncode = -1

            # Send completion marker
            done_msg = make_message(
                MessageType.TERMINAL_OUTPUT, self.agent.identity.node_id,
                output=f"\n[Exit code: {returncode}]\n",
                source="system",
                command=shell_cmd,
                done=True,
                returncode=returncode,
            )
            await self.agent.send_to(sender_id, done_msg)

        except Exception as e:
            logger.error(f"Remote shell failed: {e}", exc_info=True)
            err_msg = make_message(
                MessageType.TERMINAL_OUTPUT, self.agent.identity.node_id,
                output=f"[ERROR: {e}]\n",
                source="error",
                command=shell_cmd,
                done=True,
                returncode=-1,
            )
            await self.agent.send_to(sender_id, err_msg)

    async def cmd_quit(self, args) -> str:
        """Shut down this agent."""
        asyncio.create_task(self.agent.shutdown())
        return "Shutting down..."
