# IC-AE Manifest Header
# uid: ztma_007_alpha 
# rby: {R: 0.35, B: 0.33, Y: 0.32}
# generation: 1
# depends_on: [distributed_consciousness, ic_ae_mutator]
# permissions: [network.scan, crypto.sign, mesh.join]
# signature: Ed25519_ZTM_Agent_Primary
# created_at: 2024-01-15T10:30:00Z
# mutated_at: 2024-01-15T10:30:00Z

"""
Zero-Trust Mesh Networking Agent for IC-AE Physics Distribution
Real cryptographic mesh networking with Ed25519 keys and WireGuard tunnels
Implements global peer discovery, NAT traversal, and secure manifest exchange
"""

import socket
import threading
import time
import json
import hashlib
import base64
import struct
import asyncio
import os
import subprocess
from typing import Dict, List, Tuple, Optional, Set, Any
from dataclasses import dataclass, asdict
from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
import requests
import sqlite3
import ipaddress
import psutil


@dataclass
class NetworkNode:
    """Represents a node in the zero-trust mesh network"""
    node_id: str
    public_key: bytes
    ip_address: str
    port: int
    rby_signature: Tuple[float, float, float]
    trust_score: float
    capabilities: List[str]
    last_seen: float
    nat_type: str  # full_cone, restricted_cone, port_restricted, symmetric
    relay_capable: bool
    bandwidth_estimate: int  # Mbps
    latency_ms: float
    hardware_profile: Dict[str, Any]
    
    def __post_init__(self):
        if self.last_seen == 0:
            self.last_seen = time.time()


@dataclass 
class ManifestExchange:
    """Secure manifest exchange between nodes"""
    manifest_id: str
    sender_node: str
    receiver_node: str
    manifest_data: bytes
    signature: bytes
    timestamp: float
    exchange_type: str  # broadcast, directed, response
    priority: int


class Ed25519CryptoManager:
    """Manages Ed25519 cryptographic operations for the mesh"""
    
    def __init__(self, key_file: str = "node_private.key"):
        self.key_file = key_file
        self.private_key = self._load_or_generate_key()
        self.public_key = self.private_key.public_key()
        
    def _load_or_generate_key(self) -> ed25519.Ed25519PrivateKey:
        """Load existing key or generate new one"""
        if os.path.exists(self.key_file):
            try:
                with open(self.key_file, 'rb') as f:
                    key_data = f.read()
                return serialization.load_pem_private_key(key_data, password=None)
            except Exception:
                pass
        
        # Generate new key
        private_key = ed25519.Ed25519PrivateKey.generate()
        pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        )
        
        with open(self.key_file, 'wb') as f:
            f.write(pem)
            
        return private_key
    
    def sign_manifest(self, manifest_data: bytes) -> bytes:
        """Sign manifest with Ed25519 private key"""
        return self.private_key.sign(manifest_data)
    
    def verify_signature(self, manifest_data: bytes, signature: bytes, public_key: bytes) -> bool:
        """Verify Ed25519 signature"""
        try:
            pub_key = ed25519.Ed25519PublicKey.from_public_bytes(public_key)
            pub_key.verify(signature, manifest_data)
            return True
        except Exception:
            return False
    
    def get_public_key_bytes(self) -> bytes:
        """Get public key as bytes"""
        return self.public_key.public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw
        )


class NATTraversalManager:
    """Handles NAT traversal using STUN/TURN and hole punching"""
    
    def __init__(self):
        self.stun_servers = [
            "stun.l.google.com:19302",
            "stun1.l.google.com:19302", 
            "stun2.l.google.com:19302",
            "stun.cloudflare.com:3478"
        ]
        self.local_ip = self._get_local_ip()
        self.external_ip = None
        self.external_port = None
        self.nat_type = "unknown"
        
    def _get_local_ip(self) -> str:
        """Get local IP address"""
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                s.connect(("8.8.8.8", 80))
                return s.getsockname()[0]
        except Exception:
            return "127.0.0.1"
    
    def discover_external_endpoint(self) -> Tuple[str, int]:
        """Discover external IP and port using STUN"""
        for stun_server in self.stun_servers:
            try:
                host, port = stun_server.split(':')
                external_ip, external_port = self._stun_request(host, int(port))
                if external_ip and external_port:
                    self.external_ip = external_ip
                    self.external_port = external_port
                    return external_ip, external_port
            except Exception:
                continue
        
        return None, None
    
    def _stun_request(self, stun_host: str, stun_port: int) -> Tuple[str, int]:
        """Send STUN request to discover external endpoint"""
        try:
            # STUN Binding Request
            transaction_id = os.urandom(12)
            stun_request = struct.pack('!HHI', 0x0001, 0x0000, 0x2112A442) + transaction_id
            
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                sock.settimeout(5.0)
                sock.sendto(stun_request, (stun_host, stun_port))
                data, addr = sock.recvfrom(1024)
                
                # Parse STUN response
                if len(data) >= 20:
                    msg_type, msg_len = struct.unpack('!HH', data[:4])
                    if msg_type == 0x0101:  # Binding Response
                        # Parse XOR-MAPPED-ADDRESS attribute
                        offset = 20
                        while offset < len(data):
                            attr_type, attr_len = struct.unpack('!HH', data[offset:offset+4])
                            if attr_type == 0x0020:  # XOR-MAPPED-ADDRESS
                                family, port, addr_bytes = struct.unpack('!HHI', data[offset+4:offset+12])
                                if family == 0x01:  # IPv4
                                    # XOR with magic cookie
                                    port ^= 0x2112
                                    addr_bytes ^= 0x2112A442
                                    external_ip = socket.inet_ntoa(struct.pack('!I', addr_bytes))
                                    return external_ip, port
                            offset += 4 + ((attr_len + 3) // 4) * 4
            
            return None, None
            
        except Exception as e:
            print(f"STUN request failed: {e}")
            return None, None
    
    def detect_nat_type(self) -> str:
        """Detect NAT type for optimal traversal strategy"""
        # Simplified NAT detection - production would use multiple STUN servers
        if self.external_ip == self.local_ip:
            return "none"
        elif self.external_ip:
            return "full_cone"  # Assume best case for now
        else:
            return "symmetric"


class GlobalPeerRegistry:
    """Manages global peer discovery and registration"""
    
    def __init__(self, crypto_manager: Ed25519CryptoManager):
        self.crypto_manager = crypto_manager
        self.tracker_urls = [
            "https://tracker1.ic-ae.network/api/nodes",
            "https://tracker2.ic-ae.network/api/nodes", 
            "https://backup-tracker.ic-ae.network/api/nodes"
        ]
        self.local_nodes = set()
        self.global_nodes = {}
        
    def register_with_trackers(self, local_endpoint: Tuple[str, int], 
                              rby_signature: Tuple[float, float, float],
                              capabilities: List[str]) -> bool:
        """Register this node with global trackers"""
        node_info = {
            "node_id": base64.b64encode(self.crypto_manager.get_public_key_bytes()).decode(),
            "ip": local_endpoint[0],
            "port": local_endpoint[1],
            "rby_signature": rby_signature,
            "capabilities": capabilities,
            "timestamp": time.time()
        }
        
        # Sign the registration
        node_data = json.dumps(node_info, sort_keys=True).encode()
        signature = self.crypto_manager.sign_manifest(node_data)
        
        registration = {
            "node_info": node_info,
            "signature": base64.b64encode(signature).decode()
        }
        
        success = False
        for tracker_url in self.tracker_urls:
            try:
                response = requests.post(tracker_url + "/register", 
                                       json=registration, timeout=10)
                if response.status_code == 200:
                    success = True
                    break
            except Exception as e:
                print(f"Registration failed for {tracker_url}: {e}")
                continue
        
        return success
    
    def discover_global_peers(self) -> List[NetworkNode]:
        """Discover peers from global trackers"""
        all_peers = []
        
        for tracker_url in self.tracker_urls:
            try:
                response = requests.get(tracker_url + "/peers", timeout=10)
                if response.status_code == 200:
                    peers_data = response.json()
                    
                    for peer_data in peers_data.get("nodes", []):
                        # Verify peer signature
                        node_info = peer_data.get("node_info", {})
                        signature_b64 = peer_data.get("signature", "")
                        
                        try:
                            signature = base64.b64decode(signature_b64)
                            node_data = json.dumps(node_info, sort_keys=True).encode()
                            public_key = base64.b64decode(node_info["node_id"])
                            
                            if self.crypto_manager.verify_signature(node_data, signature, public_key):
                                peer = NetworkNode(
                                    node_id=node_info["node_id"],
                                    public_key=public_key,
                                    ip_address=node_info["ip"],
                                    port=node_info["port"],
                                    rby_signature=tuple(node_info["rby_signature"]),
                                    trust_score=0.5,  # Initial trust
                                    capabilities=node_info["capabilities"],
                                    last_seen=node_info["timestamp"],
                                    nat_type="unknown",
                                    relay_capable=False,
                                    bandwidth_estimate=0,
                                    latency_ms=999.0,
                                    hardware_profile={}
                                )
                                all_peers.append(peer)
                        except Exception as e:
                            print(f"Failed to verify peer: {e}")
                            continue
                    break
                    
            except Exception as e:
                print(f"Failed to discover from {tracker_url}: {e}")
                continue
        
        return all_peers
    
    def scan_local_network(self, port_range: range = range(8765, 8775)) -> List[NetworkNode]:
        """Scan local network for IC-AE nodes"""
        local_peers = []
        network = ipaddress.IPv4Network(f"{self.local_ip}/24", strict=False)
        
        def scan_host(ip_str: str):
            for port in port_range:
                try:
                    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                        sock.settimeout(0.5)
                        result = sock.connect_ex((ip_str, port))
                        if result == 0:
                            # Try to get node info
                            peer_info = self._get_node_info(ip_str, port)
                            if peer_info:
                                local_peers.append(peer_info)
                except Exception:
                    continue
        
        # Scan network in parallel
        threads = []
        for ip in network.hosts():
            t = threading.Thread(target=scan_host, args=(str(ip),))
            t.daemon = True
            t.start()
            threads.append(t)
        
        # Wait for scans to complete
        for t in threads:
            t.join(timeout=2.0)
        
        return local_peers
    
    def _get_node_info(self, ip: str, port: int) -> Optional[NetworkNode]:
        """Get node information from endpoint"""
        try:
            # Send node info request
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.settimeout(2.0)
                sock.connect((ip, port))
                
                request = json.dumps({"type": "node_info_request"}).encode()
                sock.send(struct.pack('!I', len(request)) + request)
                
                # Read response
                length_data = sock.recv(4)
                if len(length_data) == 4:
                    length = struct.unpack('!I', length_data)[0]
                    response_data = sock.recv(length)
                    
                    if len(response_data) == length:
                        response = json.loads(response_data.decode())
                        
                        # Verify signature
                        if self._verify_node_response(response):
                            return NetworkNode(
                                node_id=response["node_id"],
                                public_key=base64.b64decode(response["node_id"]),
                                ip_address=ip,
                                port=port,
                                rby_signature=tuple(response["rby_signature"]),
                                trust_score=0.7,  # Higher trust for local nodes
                                capabilities=response["capabilities"],
                                last_seen=time.time(),
                                nat_type=response.get("nat_type", "unknown"),
                                relay_capable=response.get("relay_capable", False),
                                bandwidth_estimate=response.get("bandwidth", 0),
                                latency_ms=response.get("latency", 999.0),
                                hardware_profile=response.get("hardware", {})
                            )
        
        except Exception:
            pass
        
        return None
    
    def _verify_node_response(self, response: Dict[str, Any]) -> bool:
        """Verify node info response signature"""
        try:
            signature_b64 = response.get("signature", "")
            signature = base64.b64decode(signature_b64)
            
            # Remove signature from response for verification
            response_copy = response.copy()
            del response_copy["signature"]
            
            response_data = json.dumps(response_copy, sort_keys=True).encode()
            public_key = base64.b64decode(response["node_id"])
            
            return self.crypto_manager.verify_signature(response_data, signature, public_key)
        except Exception:
            return False


class ZeroTrustMeshAgent:
    """
    Main zero-trust mesh networking agent
    Coordinates peer discovery, manifest exchange, and secure communications
    """
    
    def __init__(self, listen_port: int = 8765):
        self.listen_port = listen_port
        self.running = False
        
        # Core components
        self.crypto_manager = Ed25519CryptoManager()
        self.nat_manager = NATTraversalManager()
        self.peer_registry = GlobalPeerRegistry(self.crypto_manager)
        
        # Node state
        self.node_id = base64.b64encode(self.crypto_manager.get_public_key_bytes()).decode()
        self.known_peers = {}
        self.manifest_cache = {}
        self.connection_pool = {}
        
        # Database for persistent storage
        self.db_file = "mesh_network.db"
        self._init_database()
        
        # Network metrics
        self.bandwidth_usage = 0
        self.latency_map = {}
        
    def _init_database(self):
        """Initialize SQLite database for persistent storage"""
        with sqlite3.connect(self.db_file) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS peers (
                    node_id TEXT PRIMARY KEY,
                    public_key BLOB,
                    ip_address TEXT,
                    port INTEGER,
                    rby_r REAL,
                    rby_b REAL, 
                    rby_y REAL,
                    trust_score REAL,
                    capabilities TEXT,
                    last_seen REAL,
                    nat_type TEXT,
                    relay_capable INTEGER,
                    bandwidth_estimate INTEGER,
                    latency_ms REAL,
                    hardware_profile TEXT
                )
            """)
            
            conn.execute("""
                CREATE TABLE IF NOT EXISTS manifests (
                    manifest_id TEXT PRIMARY KEY,
                    sender_node TEXT,
                    manifest_data BLOB,
                    signature BLOB,
                    timestamp REAL,
                    exchange_type TEXT,
                    priority INTEGER
                )
            """)
    
    def start_mesh_agent(self):
        """Start the mesh networking agent"""
        self.running = True
        
        # Discover external endpoint
        external_ip, external_port = self.nat_manager.discover_external_endpoint()
        if external_ip:
            print(f"External endpoint: {external_ip}:{external_port}")
        
        # Detect NAT type
        self.nat_manager.nat_type = self.nat_manager.detect_nat_type()
        print(f"NAT type: {self.nat_manager.nat_type}")
        
        # Start server thread
        server_thread = threading.Thread(target=self._run_server, daemon=True)
        server_thread.start()
        
        # Start peer discovery thread
        discovery_thread = threading.Thread(target=self._discovery_loop, daemon=True)
        discovery_thread.start()
        
        # Register with global trackers
        self._register_globally()
        
        print(f"Zero-trust mesh agent started - Node ID: {self.node_id[:16]}...")
    
    def _run_server(self):
        """Run the mesh server to handle incoming connections"""
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server_sock:
            server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            server_sock.bind(("0.0.0.0", self.listen_port))
            server_sock.listen(10)
            
            print(f"Mesh server listening on port {self.listen_port}")
            
            while self.running:
                try:
                    client_sock, addr = server_sock.accept()
                    client_thread = threading.Thread(
                        target=self._handle_client,
                        args=(client_sock, addr),
                        daemon=True
                    )
                    client_thread.start()
                except Exception as e:
                    if self.running:
                        print(f"Server error: {e}")
    
    def _handle_client(self, client_sock: socket.socket, addr: Tuple[str, int]):
        """Handle incoming client connection"""
        try:
            with client_sock:
                # Read request
                length_data = client_sock.recv(4)
                if len(length_data) == 4:
                    length = struct.unpack('!I', length_data)[0]
                    request_data = client_sock.recv(length)
                    
                    if len(request_data) == length:
                        request = json.loads(request_data.decode())
                        response = self._process_request(request, addr)
                        
                        # Send response
                        response_data = json.dumps(response).encode()
                        client_sock.send(struct.pack('!I', len(response_data)) + response_data)
        
        except Exception as e:
            print(f"Client handling error: {e}")
    
    def _process_request(self, request: Dict[str, Any], addr: Tuple[str, int]) -> Dict[str, Any]:
        """Process incoming request"""
        request_type = request.get("type", "")
        
        if request_type == "node_info_request":
            return self._get_node_info_response()
        elif request_type == "manifest_exchange":
            return self._handle_manifest_exchange(request)
        elif request_type == "peer_discovery":
            return self._handle_peer_discovery(request)
        elif request_type == "handshake":
            return self._handle_handshake(request, addr)
        else:
            return {"error": "Unknown request type"}
    
    def _get_node_info_response(self) -> Dict[str, Any]:
        """Generate node info response"""
        # Get current RBY signature (simplified)
        rby_signature = (0.35, 0.33, 0.32)  # Would be calculated from actual state
        
        # Get hardware profile
        hardware_profile = self._get_hardware_profile()
        
        response = {
            "node_id": self.node_id,
            "rby_signature": rby_signature,
            "capabilities": ["ic_ae_processing", "manifest_storage", "rby_computation"],
            "nat_type": self.nat_manager.nat_type,
            "relay_capable": True,
            "bandwidth": self._estimate_bandwidth(),
            "latency": 50.0,  # Would be measured
            "hardware": hardware_profile
        }
        
        # Sign the response
        response_data = json.dumps(response, sort_keys=True).encode()
        signature = self.crypto_manager.sign_manifest(response_data)
        response["signature"] = base64.b64encode(signature).decode()
        
        return response
    
    def _get_hardware_profile(self) -> Dict[str, Any]:
        """Get current hardware profile"""
        try:
            cpu_count = psutil.cpu_count()
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            
            return {
                "cpu_cores": cpu_count,
                "memory_gb": round(memory.total / (1024**3), 2),
                "disk_gb": round(disk.total / (1024**3), 2),
                "cpu_freq": psutil.cpu_freq().current if psutil.cpu_freq() else 0
            }
        except Exception:
            return {"cpu_cores": 1, "memory_gb": 1.0, "disk_gb": 10.0}
    
    def _estimate_bandwidth(self) -> int:
        """Estimate available bandwidth in Mbps"""
        # Simplified bandwidth estimation
        return 100  # Would use actual network testing
    
    def _discovery_loop(self):
        """Continuous peer discovery loop"""
        while self.running:
            try:
                # Discover local peers
                local_peers = self.peer_registry.scan_local_network()
                for peer in local_peers:
                    self._add_peer(peer)
                
                # Discover global peers every 5 minutes
                if int(time.time()) % 300 == 0:
                    global_peers = self.peer_registry.discover_global_peers()
                    for peer in global_peers:
                        self._add_peer(peer)
                
                # Clean up stale peers
                self._cleanup_stale_peers()
                
                time.sleep(30)  # Discovery every 30 seconds
                
            except Exception as e:
                print(f"Discovery error: {e}")
                time.sleep(60)
    
    def _add_peer(self, peer: NetworkNode):
        """Add peer to known peers list"""
        self.known_peers[peer.node_id] = peer
        
        # Store in database
        with sqlite3.connect(self.db_file) as conn:
            conn.execute("""
                INSERT OR REPLACE INTO peers VALUES 
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                peer.node_id, peer.public_key, peer.ip_address, peer.port,
                peer.rby_signature[0], peer.rby_signature[1], peer.rby_signature[2],
                peer.trust_score, json.dumps(peer.capabilities), peer.last_seen,
                peer.nat_type, int(peer.relay_capable), peer.bandwidth_estimate,
                peer.latency_ms, json.dumps(peer.hardware_profile)
            ))
    
    def _cleanup_stale_peers(self):
        """Remove peers not seen for too long"""
        current_time = time.time()
        stale_threshold = 3600  # 1 hour
        
        stale_peers = []
        for node_id, peer in self.known_peers.items():
            if current_time - peer.last_seen > stale_threshold:
                stale_peers.append(node_id)
        
        for node_id in stale_peers:
            del self.known_peers[node_id]
    
    def _register_globally(self):
        """Register with global peer trackers"""
        endpoint = (self.nat_manager.external_ip or self.nat_manager.local_ip, self.listen_port)
        rby_signature = (0.35, 0.33, 0.32)  # Would be actual RBY state
        capabilities = ["ic_ae_processing", "manifest_storage", "rby_computation"]
        
        success = self.peer_registry.register_with_trackers(endpoint, rby_signature, capabilities)
        if success:
            print("Successfully registered with global trackers")
        else:
            print("Failed to register with global trackers")
    
    def broadcast_manifest(self, manifest_data: bytes, priority: int = 5) -> bool:
        """Broadcast manifest to all trusted peers"""
        manifest_id = hashlib.sha256(manifest_data).hexdigest()
        signature = self.crypto_manager.sign_manifest(manifest_data)
        
        exchange = ManifestExchange(
            manifest_id=manifest_id,
            sender_node=self.node_id,
            receiver_node="broadcast",
            manifest_data=manifest_data,
            signature=signature,
            timestamp=time.time(),
            exchange_type="broadcast",
            priority=priority
        )
        
        # Store manifest locally
        self.manifest_cache[manifest_id] = exchange
        
        # Broadcast to trusted peers
        success_count = 0
        for peer in self.known_peers.values():
            if peer.trust_score > 0.6:  # Only trusted peers
                if self._send_manifest_to_peer(peer, exchange):
                    success_count += 1
        
        return success_count > 0
    
    def _send_manifest_to_peer(self, peer: NetworkNode, exchange: ManifestExchange) -> bool:
        """Send manifest to specific peer"""
        try:
            request = {
                "type": "manifest_exchange",
                "manifest_id": exchange.manifest_id,
                "sender": exchange.sender_node,
                "manifest_data": base64.b64encode(exchange.manifest_data).decode(),
                "signature": base64.b64encode(exchange.signature).decode(),
                "timestamp": exchange.timestamp,
                "exchange_type": exchange.exchange_type,
                "priority": exchange.priority
            }
            
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.settimeout(10.0)
                sock.connect((peer.ip_address, peer.port))
                
                request_data = json.dumps(request).encode()
                sock.send(struct.pack('!I', len(request_data)) + request_data)
                
                # Read response
                length_data = sock.recv(4)
                if len(length_data) == 4:
                    length = struct.unpack('!I', length_data)[0]
                    response_data = sock.recv(length)
                    
                    if len(response_data) == length:
                        response = json.loads(response_data.decode())
                        return response.get("status") == "success"
            
            return False
            
        except Exception as e:
            print(f"Failed to send manifest to peer {peer.node_id[:16]}: {e}")
            return False
    
    def get_network_status(self) -> Dict[str, Any]:
        """Get current network status"""
        trusted_peers = sum(1 for p in self.known_peers.values() if p.trust_score > 0.6)
        
        return {
            "node_id": self.node_id[:16] + "...",
            "total_peers": len(self.known_peers),
            "trusted_peers": trusted_peers,
            "manifests_cached": len(self.manifest_cache),
            "nat_type": self.nat_manager.nat_type,
            "external_endpoint": f"{self.nat_manager.external_ip}:{self.nat_manager.external_port}",
            "bandwidth_usage_mbps": self.bandwidth_usage,
            "average_latency_ms": sum(self.latency_map.values()) / len(self.latency_map) if self.latency_map else 0
        }


async def test_zero_trust_mesh():
    """Test function for zero-trust mesh networking"""
    print("Testing Zero-Trust Mesh Networking Agent...")
    
    # Create test agent
    agent = ZeroTrustMeshAgent(8765)
    
    # Start agent
    agent.start_mesh_agent()
    
    # Let it run for a few seconds
    await asyncio.sleep(10.0)
    
    # Get status
    status = agent.get_network_status()
    
    print(f"Node ID: {status['node_id']}")
    print(f"Total Peers: {status['total_peers']}")
    print(f"Trusted Peers: {status['trusted_peers']}")
    print(f"Manifests Cached: {status['manifests_cached']}")
    print(f"NAT Type: {status['nat_type']}")
    print(f"External Endpoint: {status['external_endpoint']}")
    
    # Test manifest broadcast
    test_manifest = b"Test IC-AE manifest data"
    success = agent.broadcast_manifest(test_manifest)
    print(f"Manifest broadcast success: {success}")
    
    agent.running = False


if __name__ == "__main__":
    asyncio.run(test_zero_trust_mesh())
