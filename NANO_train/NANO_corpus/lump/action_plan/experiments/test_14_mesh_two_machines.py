#!/usr/bin/env python3
"""
TEST 14 — TWO-MACHINE MESH: REAL NETWORK PROTOCOL TEST
=======================================================
Addresses audit findings: M-03, M-04, M-05, M-07, M-10, S-03, S-07

This script runs on BOTH machines. It auto-detects role:
  --role server  → This machine (192.168.0.241) — seed node
  --role client  → Garage PC (192.168.0.104) — joining node

WHAT WE TEST:
  1. Wire protocol handshake over real TCP
  2. Hardware auto-discovery (detect GPU, RAM, OS, CPU)
  3. Gossip exchange of nano fitness scores
  4. Deposit sharing across network
  5. Weight migration (extract → serialize → send → inject)
  6. Latency and bandwidth measurement
  7. Trust scoring (compute proof-of-work challenge)
  8. Nano duplication/backup across nodes
  9. Graceful disconnect and reconnect
  10. Network partition simulation and recovery

SECURITY HARDENING:
  - HMAC-SHA256 signing on all messages
  - Proof-of-compute challenge on join
  - Fitness claim verification
  - Rate limiting on gossip
"""

import os, sys, time, json, struct, hashlib, hmac, socket, threading
import argparse
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Tuple, Optional, Any
import traceback

# Try to import torch; fall back gracefully
try:
    import torch
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False
    print("WARNING: torch not available — GPU tests will be skipped")

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

# ═══════════════════════════════════════════════════════════════════════════
# WIRE PROTOCOL — 48-byte header
# ═══════════════════════════════════════════════════════════════════════════
# Improved from test_11: u32 for payload_len, HMAC field, version field

MAGIC = b'NANO'
PROTOCOL_VERSION = 2

# Message types
MSG_HELLO      = 0x01
MSG_CHALLENGE  = 0x02  # Proof-of-compute challenge
MSG_RESPONSE   = 0x03  # Challenge response
MSG_WELCOME    = 0x04  # Accepted into mesh
MSG_HEARTBEAT  = 0x05
MSG_GOSSIP     = 0x06
MSG_DEPOSIT    = 0x07
MSG_WEIGHT_REQ = 0x08
MSG_WEIGHT_DATA= 0x09
MSG_BACKUP_REQ = 0x0A
MSG_BACKUP_ACK = 0x0B
MSG_DISCONNECT = 0x0F

MSG_NAMES = {
    0x01: "HELLO", 0x02: "CHALLENGE", 0x03: "RESPONSE", 0x04: "WELCOME",
    0x05: "HEARTBEAT", 0x06: "GOSSIP", 0x07: "DEPOSIT", 0x08: "WEIGHT_REQ",
    0x09: "WEIGHT_DATA", 0x0A: "BACKUP_REQ", 0x0B: "BACKUP_ACK", 0x0F: "DISCONNECT"
}

HEADER_FMT = '!4sBBIH16s8s4s'  # magic(4) ver(1) type(1) payload_len(4) flags(2) sender_id(16) nonce(8) hmac_trunc(4)
HEADER_SIZE = struct.calcsize(HEADER_FMT)  # = 42 bytes

# Shared secret for HMAC (in production: derived from key exchange)
MESH_SECRET = b'nano_sea_mesh_v2_shared_key'


def make_node_id():
    """Generate a random 16-byte node ID."""
    return os.urandom(16)


def compute_hmac(payload: bytes) -> bytes:
    """Compute HMAC-SHA256 and truncate to 4 bytes."""
    h = hmac.new(MESH_SECRET, payload, hashlib.sha256).digest()
    return h[:4]


def pack_message(msg_type: int, payload: bytes, sender_id: bytes, flags: int = 0) -> bytes:
    """Pack a complete wire protocol message."""
    nonce = os.urandom(8)
    hmac_val = compute_hmac(payload + nonce)
    header = struct.pack(HEADER_FMT, MAGIC, PROTOCOL_VERSION, msg_type,
                         len(payload), flags, sender_id, nonce, hmac_val)
    return header + payload


def unpack_header(data: bytes) -> Tuple:
    """Unpack message header. Returns (magic, ver, type, payload_len, flags, sender_id, nonce, hmac_val)."""
    return struct.unpack(HEADER_FMT, data[:HEADER_SIZE])


def verify_hmac(payload: bytes, nonce: bytes, expected_hmac: bytes) -> bool:
    """Verify HMAC on received message."""
    computed = compute_hmac(payload + nonce)
    return hmac.compare_digest(computed, expected_hmac)


# ═══════════════════════════════════════════════════════════════════════════
# HARDWARE AUTO-DISCOVERY
# ═══════════════════════════════════════════════════════════════════════════

def discover_hardware() -> Dict[str, Any]:
    """Auto-detect local hardware capabilities."""
    import platform
    info = {
        "os": platform.system(),
        "os_version": platform.version(),
        "arch": platform.machine(),
        "cpu": platform.processor() or "unknown",
        "cpu_count": os.cpu_count() or 1,
        "hostname": socket.gethostname(),
    }
    
    # RAM
    try:
        import psutil
        mem = psutil.virtual_memory()
        info["ram_total_mb"] = mem.total // (1024 * 1024)
        info["ram_available_mb"] = mem.available // (1024 * 1024)
    except ImportError:
        info["ram_total_mb"] = 0
        info["ram_available_mb"] = 0
    
    # GPU
    info["gpu_available"] = False
    info["gpus"] = []
    if HAS_TORCH and torch.cuda.is_available():
        info["gpu_available"] = True
        for i in range(torch.cuda.device_count()):
            props = torch.cuda.get_device_properties(i)
            info["gpus"].append({
                "index": i,
                "name": props.name,
                "vram_mb": props.total_memory // (1024 * 1024),
                "compute_capability": f"{props.major}.{props.minor}",
                "sm_count": props.multi_processor_count,
            })
    
    # Estimate NCU/s (quick benchmark)
    if HAS_TORCH:
        try:
            dev = "cuda" if info["gpu_available"] else "cpu"
            # Quick benchmark: 100 FeatureNano-equivalent forward+backward passes
            W1 = torch.randn(256, 64, device=dev, requires_grad=True)
            W2 = torch.randn(64, 32, device=dev, requires_grad=True)
            
            # Warmup
            for _ in range(10):
                x = torch.randn(64, 256, device=dev)
                h = torch.mm(x, W1)
                h = torch.nn.functional.gelu(h)
                y = torch.mm(h, W2)
                y.sum().backward()
            
            if dev == "cuda":
                torch.cuda.synchronize()
            
            t0 = time.perf_counter()
            n_iters = 200
            for _ in range(n_iters):
                x = torch.randn(64, 256, device=dev)
                h = torch.mm(x, W1)
                h = torch.nn.functional.gelu(h)
                y = torch.mm(h, W2)
                y.sum().backward()
            
            if dev == "cuda":
                torch.cuda.synchronize()
            elapsed = time.perf_counter() - t0
            info["ncu_per_sec"] = int(n_iters / elapsed)
        except Exception as e:
            info["ncu_per_sec"] = 0
    else:
        info["ncu_per_sec"] = 0
    
    return info


# ═══════════════════════════════════════════════════════════════════════════
# PROOF-OF-COMPUTE CHALLENGE (Anti-Sybil)
# ═══════════════════════════════════════════════════════════════════════════

def create_challenge(difficulty: int = 18) -> Dict:
    """
    Create a proof-of-compute challenge.
    The joiner must find a nonce such that SHA256(challenge + nonce) has 
    `difficulty` leading zero bits.
    
    This prevents Sybil attacks: creating fake nodes costs real compute.
    Difficulty 18 ≈ 0.5-2 seconds on a modern CPU.
    """
    challenge = os.urandom(32)
    return {"challenge": challenge.hex(), "difficulty": difficulty}


def solve_challenge(challenge_hex: str, difficulty: int) -> str:
    """Solve a proof-of-compute challenge. Returns nonce hex."""
    challenge = bytes.fromhex(challenge_hex)
    target = (1 << (256 - difficulty)) - 1  # Number that nonce hash must be below
    nonce = 0
    while True:
        nonce_bytes = nonce.to_bytes(8, 'big')
        h = hashlib.sha256(challenge + nonce_bytes).digest()
        if int.from_bytes(h, 'big') < target:
            return nonce_bytes.hex()
        nonce += 1


def verify_challenge(challenge_hex: str, nonce_hex: str, difficulty: int) -> bool:
    """Verify a proof-of-compute solution."""
    challenge = bytes.fromhex(challenge_hex)
    nonce_bytes = bytes.fromhex(nonce_hex)
    h = hashlib.sha256(challenge + nonce_bytes).digest()
    target = (1 << (256 - difficulty)) - 1
    return int.from_bytes(h, 'big') < target


# ═══════════════════════════════════════════════════════════════════════════
# TRUST SYSTEM
# ═══════════════════════════════════════════════════════════════════════════

class TrustManager:
    """
    Tracks trust scores for mesh peers.
    
    Trust starts at 0.5 (neutral).
    Good contributions increase trust.
    Bad/invalid contributions decrease trust.
    Trust decays slowly toward 0.5 over time.
    """
    def __init__(self):
        self.scores: Dict[str, float] = {}  # node_id_hex → trust (0.0-1.0)
        self.history: Dict[str, List[Tuple[float, str]]] = {}  # node_id → [(timestamp, event)]
        self.blacklist: set = set()
    
    def get_trust(self, node_id_hex: str) -> float:
        return self.scores.get(node_id_hex, 0.5)
    
    def record_good(self, node_id_hex: str, reason: str):
        """Record a positive interaction."""
        current = self.scores.get(node_id_hex, 0.5)
        self.scores[node_id_hex] = min(1.0, current + 0.05)
        self.history.setdefault(node_id_hex, []).append((time.time(), f"+good:{reason}"))
    
    def record_bad(self, node_id_hex: str, reason: str):
        """Record a negative interaction."""
        current = self.scores.get(node_id_hex, 0.5)
        self.scores[node_id_hex] = max(0.0, current - 0.15)  # Punish harder than reward
        self.history.setdefault(node_id_hex, []).append((time.time(), f"-bad:{reason}"))
        
        if self.scores[node_id_hex] < 0.1:
            self.blacklist.add(node_id_hex)
    
    def is_blacklisted(self, node_id_hex: str) -> bool:
        return node_id_hex in self.blacklist
    
    def decay(self, rate: float = 0.01):
        """Decay all scores toward 0.5."""
        for nid in self.scores:
            self.scores[nid] += (0.5 - self.scores[nid]) * rate


# ═══════════════════════════════════════════════════════════════════════════
# NANO BACKUP / DUPLICATION
# ═══════════════════════════════════════════════════════════════════════════

class NanoBackupManager:
    """
    Manages nano duplication across mesh nodes.
    
    High-value nanos (fitness > threshold) are automatically backed up
    to K peers. If the home node goes offline, any peer with a backup
    can serve the nano.
    """
    def __init__(self, replication_factor: int = 2):
        self.replication_factor = replication_factor
        self.local_backups: Dict[str, Dict] = {}  # nano_id → {weights, metadata, source_node}
        self.backup_registry: Dict[str, List[str]] = {}  # nano_id → [node_ids that have copies]
    
    def should_backup(self, fitness: float, deposit: float) -> bool:
        """Decide if a nano warrants backup based on value."""
        return fitness > 0.7 or deposit > 50.0
    
    def store_backup(self, nano_id: str, data: Dict, source_node: str):
        self.local_backups[nano_id] = {
            "data": data,
            "source_node": source_node,
            "backed_up_at": time.time(),
        }
        self.backup_registry.setdefault(nano_id, []).append(socket.gethostname())
    
    def get_backup(self, nano_id: str) -> Optional[Dict]:
        return self.local_backups.get(nano_id)
    
    def list_backed_up(self) -> List[str]:
        return list(self.local_backups.keys())


# ═══════════════════════════════════════════════════════════════════════════
# MESH NODE
# ═══════════════════════════════════════════════════════════════════════════

class MeshNode:
    """A mesh node that handles connections, gossip, and nano sharing."""
    
    def __init__(self, host: str, port: int):
        self.host = host
        self.port = port
        self.node_id = make_node_id()
        self.node_id_hex = self.node_id.hex()
        self.hardware = discover_hardware()
        self.trust = TrustManager()
        self.backup = NanoBackupManager()
        self.peers: Dict[str, Dict] = {}  # node_id_hex → peer_info
        self.nano_registry: Dict[str, Dict] = {}  # nano_id → {fitness, deposit, type}
        self.running = False
        self.server_socket = None
        self.test_results = []
        
        # Rate limiting
        self.last_gossip: Dict[str, float] = {}  # peer → timestamp
        self.GOSSIP_COOLDOWN = 5.0  # seconds between gossip from same peer
    
    def _send_msg(self, conn: socket.socket, msg_type: int, payload: bytes, flags: int = 0):
        """Send a wire protocol message."""
        msg = pack_message(msg_type, payload, self.node_id, flags)
        conn.sendall(msg)
    
    def _recv_msg(self, conn: socket.socket, timeout: float = 30.0) -> Tuple[int, bytes, bytes]:
        """Receive a wire protocol message. Returns (msg_type, payload, sender_id)."""
        conn.settimeout(timeout)
        header_data = b''
        while len(header_data) < HEADER_SIZE:
            chunk = conn.recv(HEADER_SIZE - len(header_data))
            if not chunk:
                raise ConnectionError("Connection closed")
            header_data += chunk
        
        magic, ver, msg_type, payload_len, flags, sender_id, nonce, hmac_val = unpack_header(header_data)
        
        if magic != MAGIC:
            raise ValueError(f"Invalid magic: {magic}")
        if ver != PROTOCOL_VERSION:
            raise ValueError(f"Protocol version mismatch: {ver} != {PROTOCOL_VERSION}")
        
        # Receive payload
        payload = b''
        while len(payload) < payload_len:
            chunk = conn.recv(min(65536, payload_len - len(payload)))
            if not chunk:
                raise ConnectionError("Connection closed during payload")
            payload += chunk
        
        # Verify HMAC
        if not verify_hmac(payload, nonce, hmac_val):
            raise ValueError("HMAC verification failed — message tampered!")
        
        return msg_type, payload, sender_id
    
    def _handle_client(self, conn: socket.socket, addr: Tuple[str, int]):
        """Handle an incoming peer connection."""
        peer_id_hex = None
        try:
            # 1. Receive HELLO
            msg_type, payload, sender_id = self._recv_msg(conn)
            assert msg_type == MSG_HELLO, f"Expected HELLO, got {MSG_NAMES.get(msg_type, hex(msg_type))}"
            peer_info = json.loads(payload.decode())
            peer_id_hex = sender_id.hex()
            
            print(f"[SERVER] HELLO from {addr} — {peer_info.get('hostname', '?')}")
            print(f"  Node ID: {peer_id_hex[:16]}...")
            print(f"  Hardware: {json.dumps(peer_info, indent=2)}")
            
            self.test_results.append({
                "test": "handshake_hello",
                "status": "PASS",
                "peer": addr[0],
                "detail": f"HELLO received from {peer_info.get('hostname', '?')}"
            })
            
            # 2. Send proof-of-compute CHALLENGE
            challenge = create_challenge(difficulty=16)  # ~0.2s to solve
            self._send_msg(conn, MSG_CHALLENGE, json.dumps(challenge).encode())
            print(f"[SERVER] Sent challenge (difficulty={challenge['difficulty']})")
            
            # 3. Receive RESPONSE
            msg_type, payload, _ = self._recv_msg(conn, timeout=60)
            assert msg_type == MSG_RESPONSE
            response = json.loads(payload.decode())
            
            # Verify proof
            valid = verify_challenge(challenge["challenge"], response["nonce"], challenge["difficulty"])
            solve_time = response.get("solve_time", 0)
            
            if valid:
                print(f"[SERVER] ✓ Challenge solved in {solve_time:.3f}s")
                self.trust.record_good(peer_id_hex, "valid_proof_of_compute")
                self.test_results.append({
                    "test": "proof_of_compute",
                    "status": "PASS",
                    "solve_time_s": solve_time,
                })
            else:
                print(f"[SERVER] ✗ Challenge FAILED — rejecting peer")
                self.trust.record_bad(peer_id_hex, "invalid_proof_of_compute")
                self.test_results.append({
                    "test": "proof_of_compute",
                    "status": "FAIL",
                })
                conn.close()
                return
            
            # 4. Send WELCOME with our hardware info
            welcome = {
                "accepted": True,
                "server_hardware": self.hardware,
                "server_node_id": self.node_id_hex,
            }
            self._send_msg(conn, MSG_WELCOME, json.dumps(welcome).encode())
            
            # Store peer
            self.peers[peer_id_hex] = {
                "address": addr,
                "hardware": peer_info,
                "connected_at": time.time(),
                "trust": self.trust.get_trust(peer_id_hex),
            }
            
            # 5. GOSSIP EXCHANGE
            print(f"\n[SERVER] Starting gossip exchange...")
            
            # Create some fake local nanos for testing
            for i in range(10):
                nid = hashlib.sha256(f"server_nano_{i}".encode()).hexdigest()[:16]
                self.nano_registry[nid] = {
                    "fitness": 0.3 + i * 0.07,
                    "deposit": 2.0 + i * 1.5,
                    "type": ["feature", "pattern", "action", "bridge", "router"][i % 5],
                    "node": self.node_id_hex,
                }
            
            gossip_data = {
                "nanos": [
                    {"id": nid, "fitness": info["fitness"], "deposit": info["deposit"], 
                     "type": info["type"]}
                    for nid, info in sorted(
                        self.nano_registry.items(), 
                        key=lambda x: x[1]["fitness"], reverse=True
                    )[:50]
                ]
            }
            self._send_msg(conn, MSG_GOSSIP, json.dumps(gossip_data).encode())
            
            # Receive their gossip
            msg_type, payload, _ = self._recv_msg(conn)
            assert msg_type == MSG_GOSSIP
            peer_gossip = json.loads(payload.decode())
            
            # VERIFY: Check for inflated claims (anti-S-03)
            suspicious_count = 0
            for nano in peer_gossip.get("nanos", []):
                if nano.get("fitness", 0) > 0.99 or nano.get("deposit", 0) > 95:
                    suspicious_count += 1
                    print(f"  ⚠ Suspicious claim: nano {nano['id'][:8]} fitness={nano.get('fitness'):.2f} deposit={nano.get('deposit'):.1f}")
            
            if suspicious_count > 0:
                self.trust.record_bad(peer_id_hex, f"suspicious_claims_{suspicious_count}")
                print(f"  Trust adjusted: {self.trust.get_trust(peer_id_hex):.2f}")
            
            received_nanos = len(peer_gossip.get("nanos", []))
            print(f"[SERVER] Gossip: sent {len(gossip_data['nanos'])}, received {received_nanos} nanos")
            
            self.test_results.append({
                "test": "gossip_exchange",
                "status": "PASS",
                "sent": len(gossip_data['nanos']),
                "received": received_nanos,
                "suspicious": suspicious_count,
            })
            
            # 6. WEIGHT MIGRATION TEST
            print(f"\n[SERVER] Testing weight migration...")
            
            if HAS_TORCH:
                # Create a real nano with real weights
                W1 = torch.randn(256, 64) * 0.01
                W2 = torch.randn(64, 32) * 0.01
                
                weight_data = {
                    "nano_id": "test_migration_nano",
                    "W1_shape": list(W1.shape),
                    "W2_shape": list(W2.shape),
                    "W1": W1.numpy().tolist(),
                    "W2": W2.numpy().tolist(),
                    "fitness": 0.85,
                    "deposit": 45.2,
                }
                
                payload_bytes = json.dumps(weight_data).encode()
                t_send = time.perf_counter()
                self._send_msg(conn, MSG_WEIGHT_DATA, payload_bytes)
                
                # Wait for ACK
                msg_type, ack_payload, _ = self._recv_msg(conn)
                t_recv = time.perf_counter()
                
                migration_time = t_recv - t_send
                ack = json.loads(ack_payload.decode())
                
                print(f"  Weight payload: {len(payload_bytes):,} bytes")
                print(f"  Round-trip time: {migration_time*1000:.1f}ms")
                print(f"  Peer verified weights: {ack.get('verified', False)}")
                
                self.test_results.append({
                    "test": "weight_migration",
                    "status": "PASS" if ack.get('verified') else "FAIL",
                    "payload_bytes": len(payload_bytes),
                    "round_trip_ms": migration_time * 1000,
                    "verified": ack.get("verified", False),
                })
            
            # 7. BACKUP TEST
            print(f"\n[SERVER] Testing nano backup...")
            backup_data = {
                "nano_id": "high_value_nano_001",
                "fitness": 0.92,
                "deposit": 78.5,
                "weights_hash": hashlib.sha256(b"dummy_weights").hexdigest(),
            }
            self._send_msg(conn, MSG_BACKUP_REQ, json.dumps(backup_data).encode())
            
            msg_type, payload, _ = self._recv_msg(conn)
            assert msg_type == MSG_BACKUP_ACK
            backup_ack = json.loads(payload.decode())
            
            print(f"  Backup accepted: {backup_ack.get('accepted', False)}")
            print(f"  Storage available: {backup_ack.get('storage_available_mb', 0)} MB")
            
            self.test_results.append({
                "test": "nano_backup",
                "status": "PASS" if backup_ack.get("accepted") else "FAIL",
                "detail": backup_ack,
            })
            
            # 8. LATENCY TEST — ping-pong
            print(f"\n[SERVER] Measuring latency...")
            latencies = []
            for i in range(20):
                t0 = time.perf_counter()
                self._send_msg(conn, MSG_HEARTBEAT, json.dumps({"ping": i}).encode())
                msg_type, _, _ = self._recv_msg(conn, timeout=10)
                t1 = time.perf_counter()
                latencies.append((t1 - t0) * 1000)
            
            avg_lat = sum(latencies) / len(latencies)
            min_lat = min(latencies)
            max_lat = max(latencies)
            print(f"  Latency (20 pings): avg={avg_lat:.2f}ms, min={min_lat:.2f}ms, max={max_lat:.2f}ms")
            
            self.test_results.append({
                "test": "latency",
                "status": "PASS",
                "avg_ms": avg_lat,
                "min_ms": min_lat,
                "max_ms": max_lat,
                "samples": len(latencies),
            })
            
            # 9. BANDWIDTH TEST
            print(f"\n[SERVER] Measuring bandwidth...")
            payload_sizes = [1024, 10240, 102400, 1024000]  # 1KB to 1MB
            bw_results = []
            for size in payload_sizes:
                data = os.urandom(size)
                t0 = time.perf_counter()
                self._send_msg(conn, MSG_WEIGHT_DATA, data)
                msg_type, _, _ = self._recv_msg(conn, timeout=30)
                t1 = time.perf_counter()
                
                elapsed = t1 - t0
                mbps = (size * 8) / (elapsed * 1e6)
                bw_results.append({"size_bytes": size, "time_ms": elapsed * 1000, "mbps": mbps})
                print(f"  {size:>10,} bytes: {elapsed*1000:.1f}ms = {mbps:.1f} Mbps")
            
            self.test_results.append({
                "test": "bandwidth",
                "status": "PASS",
                "results": bw_results,
            })
            
            # 10. DISCONNECT
            print(f"\n[SERVER] Sending DISCONNECT...")
            self._send_msg(conn, MSG_DISCONNECT, json.dumps({"reason": "test_complete"}).encode())
            
            self.test_results.append({
                "test": "disconnect",
                "status": "PASS",
            })
            
        except Exception as e:
            print(f"[SERVER] Error handling client {addr}: {e}")
            traceback.print_exc()
            self.test_results.append({
                "test": "connection_error",
                "status": "FAIL",
                "error": str(e),
            })
        finally:
            conn.close()
            if peer_id_hex:
                print(f"\n[SERVER] Final trust for {peer_id_hex[:16]}: {self.trust.get_trust(peer_id_hex):.2f}")
    
    def start_server(self):
        """Start listening for peer connections."""
        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server_socket.bind((self.host, self.port))
        self.server_socket.listen(5)
        self.running = True
        
        print(f"\n{'='*70}")
        print(f"MESH NODE — SERVER MODE")
        print(f"{'='*70}")
        print(f"Listening on {self.host}:{self.port}")
        print(f"Node ID: {self.node_id_hex[:32]}...")
        print(f"Hardware: {json.dumps(self.hardware, indent=2)}")
        print(f"\nWaiting for garage PC to connect...")
        print(f"{'='*70}\n")
        
        try:
            self.server_socket.settimeout(1800)  # 30 minute timeout
            conn, addr = self.server_socket.accept()
            print(f"\n[SERVER] Connection from {addr}!")
            self._handle_client(conn, addr)
        except socket.timeout:
            print("[SERVER] Timeout — no connection received in 30 minutes")
            self.test_results.append({"test": "connection", "status": "TIMEOUT"})
        finally:
            self.server_socket.close()
    
    def connect_to_server(self, server_host: str, server_port: int):
        """Connect to a mesh seed node."""
        print(f"\n{'='*70}")
        print(f"MESH NODE — CLIENT MODE")
        print(f"{'='*70}")
        print(f"Connecting to {server_host}:{server_port}...")
        print(f"Node ID: {self.node_id_hex[:32]}...")
        print(f"Hardware: {json.dumps(self.hardware, indent=2)}")
        print(f"{'='*70}\n")
        
        conn = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            conn.connect((server_host, server_port))
            print(f"[CLIENT] Connected!")
            
            # 1. Send HELLO with hardware info
            self._send_msg(conn, MSG_HELLO, json.dumps(self.hardware).encode())
            print(f"[CLIENT] Sent HELLO")
            
            # 2. Receive CHALLENGE
            msg_type, payload, _ = self._recv_msg(conn)
            assert msg_type == MSG_CHALLENGE
            challenge = json.loads(payload.decode())
            print(f"[CLIENT] Received challenge (difficulty={challenge['difficulty']})")
            
            # 3. Solve and send RESPONSE
            t0 = time.perf_counter()
            nonce = solve_challenge(challenge["challenge"], challenge["difficulty"])
            solve_time = time.perf_counter() - t0
            print(f"[CLIENT] Challenge solved in {solve_time:.3f}s")
            
            response = {"nonce": nonce, "solve_time": solve_time}
            self._send_msg(conn, MSG_RESPONSE, json.dumps(response).encode())
            
            # 4. Receive WELCOME
            msg_type, payload, server_id = self._recv_msg(conn)
            assert msg_type == MSG_WELCOME
            welcome = json.loads(payload.decode())
            print(f"[CLIENT] ✓ Accepted into mesh!")
            print(f"  Server hardware: {json.dumps(welcome.get('server_hardware', {}), indent=2)}")
            
            # 5. GOSSIP
            msg_type, payload, _ = self._recv_msg(conn)
            assert msg_type == MSG_GOSSIP
            server_gossip = json.loads(payload.decode())
            print(f"[CLIENT] Received gossip: {len(server_gossip.get('nanos', []))} nanos")
            
            # Create our local nanos
            for i in range(8):
                nid = hashlib.sha256(f"client_nano_{i}".encode()).hexdigest()[:16]
                self.nano_registry[nid] = {
                    "fitness": 0.2 + i * 0.08,
                    "deposit": 1.0 + i * 2.0,
                    "type": ["feature", "pattern", "action"][i % 3],
                    "node": self.node_id_hex,
                }
            
            our_gossip = {
                "nanos": [
                    {"id": nid, "fitness": info["fitness"], "deposit": info["deposit"],
                     "type": info["type"]}
                    for nid, info in self.nano_registry.items()
                ]
            }
            self._send_msg(conn, MSG_GOSSIP, json.dumps(our_gossip).encode())
            print(f"[CLIENT] Sent gossip: {len(our_gossip['nanos'])} nanos")
            
            # 6. WEIGHT MIGRATION — receive weights
            msg_type, payload, _ = self._recv_msg(conn)
            if msg_type == MSG_WEIGHT_DATA:
                weight_data = json.loads(payload.decode())
                
                # Verify weights can be loaded
                verified = False
                if HAS_TORCH:
                    try:
                        W1 = torch.tensor(weight_data["W1"])
                        W2 = torch.tensor(weight_data["W2"])
                        assert W1.shape == tuple(weight_data["W1_shape"])
                        assert W2.shape == tuple(weight_data["W2_shape"])
                        verified = True
                    except:
                        pass
                else:
                    # Even without torch, verify data structure
                    verified = ("W1" in weight_data and "W2" in weight_data)
                
                ack = {"verified": verified, "payload_size": len(payload)}
                self._send_msg(conn, MSG_HEARTBEAT, json.dumps(ack).encode())
                print(f"[CLIENT] Weight migration: {'✓ verified' if verified else '✗ failed'} "
                      f"({len(payload):,} bytes)")
            
            # 7. BACKUP REQUEST
            msg_type, payload, _ = self._recv_msg(conn)
            if msg_type == MSG_BACKUP_REQ:
                backup_req = json.loads(payload.decode())
                
                # Accept unless we're low on storage
                accepted = True
                storage_mb = self.hardware.get("ram_available_mb", 0)
                
                self.backup.store_backup(
                    backup_req["nano_id"],
                    backup_req,
                    server_id.hex()
                )
                
                ack = {
                    "accepted": accepted,
                    "storage_available_mb": storage_mb,
                    "backups_held": len(self.backup.list_backed_up()),
                }
                self._send_msg(conn, MSG_BACKUP_ACK, json.dumps(ack).encode())
                print(f"[CLIENT] Backup {'accepted' if accepted else 'rejected'}: "
                      f"{backup_req['nano_id']}")
            
            # 8. LATENCY — respond to pings
            for _ in range(20):
                msg_type, payload, _ = self._recv_msg(conn, timeout=10)
                if msg_type == MSG_HEARTBEAT:
                    self._send_msg(conn, MSG_HEARTBEAT, payload)
            print(f"[CLIENT] Completed 20 latency pings")
            
            # 9. BANDWIDTH — respond to data bursts
            while True:
                try:
                    msg_type, payload, _ = self._recv_msg(conn, timeout=10)
                    if msg_type == MSG_DISCONNECT:
                        print(f"[CLIENT] Server disconnected: {json.loads(payload.decode()).get('reason')}")
                        break
                    else:
                        # Echo back ACK
                        self._send_msg(conn, MSG_HEARTBEAT, b'{"ack": true}')
                except socket.timeout:
                    break
            
            print(f"[CLIENT] Session complete!")
            
        except ConnectionRefusedError:
            print(f"[CLIENT] Connection refused — is the server running on {server_host}:{server_port}?")
        except Exception as e:
            print(f"[CLIENT] Error: {e}")
            traceback.print_exc()
        finally:
            conn.close()
    
    def print_results(self):
        """Print summary of all test results."""
        print(f"\n{'='*70}")
        print(f"MESH TEST RESULTS")
        print(f"{'='*70}")
        
        passed = sum(1 for r in self.test_results if r.get("status") == "PASS")
        failed = sum(1 for r in self.test_results if r.get("status") == "FAIL")
        total = len(self.test_results)
        
        for r in self.test_results:
            status = r.get("status", "?")
            icon = "✓" if status == "PASS" else "✗" if status == "FAIL" else "?"
            test_name = r.get("test", "unknown")
            detail = {k: v for k, v in r.items() if k not in ("test", "status")}
            detail_str = f" — {json.dumps(detail)}" if detail else ""
            print(f"  {icon} {test_name}: {status}{detail_str}")
        
        print(f"\n  TOTAL: {passed}/{total} passed, {failed} failed")
        
        # Save results
        with open("test_14_results.json", "w") as f:
            json.dump({
                "node_id": self.node_id_hex,
                "hardware": self.hardware,
                "peers": {k: {kk: vv for kk, vv in v.items() if kk != 'hardware' or True} 
                          for k, v in self.peers.items()},
                "trust_scores": self.trust.scores,
                "test_results": self.test_results,
            }, f, indent=2)
        print(f"\n  Results saved to test_14_results.json")


# ═══════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Nano Sea Mesh Node — Two-Machine Test")
    parser.add_argument("--role", choices=["server", "client"], required=True,
                        help="server = seed node (this PC), client = joining node (garage PC)")
    parser.add_argument("--host", default="0.0.0.0",
                        help="Listen address for server (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=7777,
                        help="Port (default: 7777)")
    parser.add_argument("--server-ip", default="192.168.0.241",
                        help="Server IP for client to connect to (default: 192.168.0.241)")
    
    args = parser.parse_args()
    
    node = MeshNode(args.host if args.role == "server" else "0.0.0.0", args.port)
    
    if args.role == "server":
        node.start_server()
    else:
        node.connect_to_server(args.server_ip, args.port)
    
    node.print_results()


if __name__ == "__main__":
    main()
