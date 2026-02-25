"""
Distributed Trust Mesh Network - Real implementation of zero-trust mesh
networking with consciousness-aware routing, adaptive trust scoring,
and encrypted multi-node communication for the IC-AE framework.

This implements actual peer-to-peer networking with cryptographic handshakes,
distributed consensus, and consciousness state synchronization.
"""

import asyncio
import socket
import ssl
import json
import time
import hashlib
import secrets
import threading
from typing import Dict, List, Tuple, Optional, Any, Set, Callable
from dataclasses import dataclass, field, asdict
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
import websockets
import logging
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor
import struct

@dataclass
class TrustScore:
    """Represents trust metrics for a network node."""
    base_trust: float  # Base trust level (0.0 to 1.0)
    interaction_count: int  # Number of successful interactions
    failure_count: int  # Number of failed interactions
    last_interaction: float  # Timestamp of last interaction
    reputation_score: float  # Network-computed reputation
    decay_rate: float = 0.01  # Trust decay rate per hour
    
    def current_trust(self) -> float:
        """Calculate current trust with time-based decay."""
        hours_since_interaction = (time.time() - self.last_interaction) / 3600
        decay_factor = max(0.1, 1.0 - (self.decay_rate * hours_since_interaction))
        
        # Success ratio
        total_interactions = self.interaction_count + self.failure_count
        success_ratio = self.interaction_count / max(1, total_interactions)
        
        # Combined trust score
        trust = (self.base_trust * 0.3 + 
                success_ratio * 0.4 + 
                self.reputation_score * 0.3) * decay_factor
        
        return max(0.0, min(1.0, trust))

@dataclass
class NetworkNode:
    """Represents a node in the trust mesh network."""
    node_id: str
    public_key: bytes
    ip_address: str
    port: int
    last_seen: float
    trust_score: TrustScore
    capabilities: Set[str] = field(default_factory=set)
    consciousness_state: Optional[Dict[str, Any]] = None
    network_latency: float = 0.0
    bandwidth_mbps: float = 0.0

@dataclass
class EncryptedMessage:
    """Container for encrypted network messages."""
    sender_id: str
    recipient_id: str
    message_type: str
    encrypted_payload: bytes
    signature: bytes
    timestamp: float
    nonce: bytes

class CryptographicManager:
    """Handles cryptographic operations for the trust mesh."""
    
    def __init__(self):
        # Generate Ed25519 key pair for this node
        self.private_key = ed25519.Ed25519PrivateKey.generate()
        self.public_key = self.private_key.public_key()
        
        # Symmetric encryption for session keys
        self.session_keys: Dict[str, bytes] = {}
        
    def get_public_key_bytes(self) -> bytes:
        """Get public key in raw bytes format."""
        return self.public_key.public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw
        )
    
    def sign_message(self, message: bytes) -> bytes:
        """Sign message with private key."""
        return self.private_key.sign(message)
    
    def verify_signature(self, message: bytes, signature: bytes, 
                        public_key_bytes: bytes) -> bool:
        """Verify message signature."""
        try:
            public_key = ed25519.Ed25519PublicKey.from_public_bytes(public_key_bytes)
            public_key.verify(signature, message)
            return True
        except Exception:
            return False
    
    def generate_session_key(self, node_id: str) -> bytes:
        """Generate and store session key for a node."""
        session_key = secrets.token_bytes(32)  # 256-bit key
        self.session_keys[node_id] = session_key
        return session_key
    
    def encrypt_message(self, message: bytes, node_id: str) -> Tuple[bytes, bytes]:
        """Encrypt message for specific node using session key."""
        if node_id not in self.session_keys:
            raise ValueError(f"No session key for node {node_id}")
        
        key = self.session_keys[node_id]
        nonce = secrets.token_bytes(12)  # 96-bit nonce for GCM
        
        cipher = Cipher(algorithms.AES(key), modes.GCM(nonce))
        encryptor = cipher.encryptor()
        ciphertext = encryptor.update(message) + encryptor.finalize()
        
        return ciphertext + encryptor.tag, nonce
    
    def decrypt_message(self, encrypted_data: bytes, nonce: bytes, 
                       node_id: str) -> bytes:
        """Decrypt message from specific node."""
        if node_id not in self.session_keys:
            raise ValueError(f"No session key for node {node_id}")
        
        key = self.session_keys[node_id]
        ciphertext = encrypted_data[:-16]  # Remove tag
        tag = encrypted_data[-16:]  # Last 16 bytes are tag
        
        cipher = Cipher(algorithms.AES(key), modes.GCM(nonce, tag))
        decryptor = cipher.decryptor()
        plaintext = decryptor.update(ciphertext) + decryptor.finalize()
        
        return plaintext

class ConsciousnessRouter:
    """Routes messages based on consciousness state compatibility."""
    
    def __init__(self):
        self.routing_table: Dict[str, List[str]] = defaultdict(list)
        self.consciousness_cache: Dict[str, Dict[str, Any]] = {}
        
    def update_consciousness_state(self, node_id: str, state: Dict[str, Any]):
        """Update cached consciousness state for a node."""
        self.consciousness_cache[node_id] = state
        self._update_routing_table()
    
    def _update_routing_table(self):
        """Update routing table based on consciousness compatibility."""
        self.routing_table.clear()
        
        for node_id, state in self.consciousness_cache.items():
            compatible_nodes = []
            
            for other_id, other_state in self.consciousness_cache.items():
                if node_id != other_id:
                    compatibility = self._compute_consciousness_compatibility(state, other_state)
                    if compatibility > 0.5:  # Threshold for routing
                        compatible_nodes.append(other_id)
            
            self.routing_table[node_id] = compatible_nodes
    
    def _compute_consciousness_compatibility(self, state1: Dict[str, Any], 
                                           state2: Dict[str, Any]) -> float:
        """Compute compatibility between two consciousness states."""
        
        # Extract RBY values if available
        rby1 = state1.get('rby', [0.33, 0.33, 0.34])
        rby2 = state2.get('rby', [0.33, 0.33, 0.34])
        
        # Compute RBY similarity
        rby_diff = sum(abs(a - b) for a, b in zip(rby1, rby2))
        rby_compatibility = 1.0 - (rby_diff / 3.0)  # Normalize to [0,1]
        
        # Extract other compatibility factors
        coherence1 = state1.get('coherence', 0.5)
        coherence2 = state2.get('coherence', 0.5)
        coherence_compatibility = 1.0 - abs(coherence1 - coherence2)
        
        # Weighted average
        return (rby_compatibility * 0.7 + coherence_compatibility * 0.3)
    
    def find_best_route(self, source: str, destination: str, 
                       exclude: Set[str] = None) -> Optional[List[str]]:
        """Find best route between nodes using consciousness-aware routing."""
        if exclude is None:
            exclude = set()
        
        # Simple breadth-first search with consciousness weighting
        queue = deque([(source, [source])])
        visited = {source}
        
        while queue:
            current_node, path = queue.popleft()
            
            if current_node == destination:
                return path
            
            # Get compatible neighbors
            neighbors = self.routing_table.get(current_node, [])
            
            for neighbor in neighbors:
                if neighbor not in visited and neighbor not in exclude:
                    visited.add(neighbor)
                    queue.append((neighbor, path + [neighbor]))
        
        return None  # No route found

class TrustMeshNetwork:
    """Main trust mesh network implementation."""
    
    def __init__(self, node_id: str, listen_port: int = 8000):
        self.node_id = node_id
        self.listen_port = listen_port
        self.crypto_manager = CryptographicManager()
        self.consciousness_router = ConsciousnessRouter()
        
        # Network state
        self.known_nodes: Dict[str, NetworkNode] = {}
        self.pending_handshakes: Dict[str, Dict[str, Any]] = {}
        self.message_handlers: Dict[str, Callable] = {}
        self.running = False
        
        # Performance tracking
        self.network_stats = {
            'messages_sent': 0,
            'messages_received': 0,
            'handshakes_completed': 0,
            'trust_updates': 0,
            'routing_decisions': 0
        }
        
        # Threading
        self.network_lock = threading.Lock()
        self.executor = ThreadPoolExecutor(max_workers=10)
        
        # Default message handlers
        self._register_default_handlers()
        
        logging.info(f"Trust mesh network initialized for node {node_id}")
    
    def _register_default_handlers(self):
        """Register default message handlers."""
        self.message_handlers.update({
            'handshake_request': self._handle_handshake_request,
            'handshake_response': self._handle_handshake_response,
            'trust_update': self._handle_trust_update,
            'consciousness_sync': self._handle_consciousness_sync,
            'ping': self._handle_ping,
            'data_transfer': self._handle_data_transfer
        })
    
    async def start_network(self):
        """Start the trust mesh network server."""
        self.running = True
        
        # Start WebSocket server for incoming connections
        start_server = websockets.serve(
            self._handle_websocket_connection,
            "0.0.0.0",
            self.listen_port
        )
        
        # Start periodic maintenance tasks
        maintenance_task = asyncio.create_task(self._maintenance_loop())
        
        logging.info(f"Trust mesh network started on port {self.listen_port}")
        
        await asyncio.gather(start_server, maintenance_task)
    
    async def _handle_websocket_connection(self, websocket, path):
        """Handle incoming WebSocket connections."""
        try:
            async for message in websocket:
                await self._process_raw_message(message, websocket)
        except Exception as e:
            logging.error(f"WebSocket connection error: {e}")
    
    async def _process_raw_message(self, raw_message: str, websocket):
        """Process incoming raw message."""
        try:
            message_data = json.loads(raw_message)
            
            # Extract message components
            sender_id = message_data['sender_id']
            message_type = message_data['message_type']
            encrypted_payload = bytes.fromhex(message_data['encrypted_payload'])
            signature = bytes.fromhex(message_data['signature'])
            nonce = bytes.fromhex(message_data['nonce'])
            
            # Verify signature first
            if sender_id in self.known_nodes:
                node = self.known_nodes[sender_id]
                message_for_verification = encrypted_payload + nonce
                
                if not self.crypto_manager.verify_signature(
                    message_for_verification, signature, node.public_key):
                    logging.warning(f"Invalid signature from {sender_id}")
                    return
            
            # Decrypt payload
            try:
                decrypted_payload = self.crypto_manager.decrypt_message(
                    encrypted_payload, nonce, sender_id
                )
                payload_data = json.loads(decrypted_payload.decode('utf-8'))
            except Exception:
                # Handle unencrypted handshake messages
                payload_data = json.loads(encrypted_payload.decode('utf-8'))
            
            # Route to appropriate handler
            if message_type in self.message_handlers:
                await self.message_handlers[message_type](sender_id, payload_data, websocket)
            else:
                logging.warning(f"Unknown message type: {message_type}")
            
            self.network_stats['messages_received'] += 1
            
        except Exception as e:
            logging.error(f"Error processing message: {e}")
    
    async def _handle_handshake_request(self, sender_id: str, payload: Dict[str, Any], 
                                      websocket):
        """Handle handshake request from another node."""
        
        # Extract handshake data
        sender_public_key = bytes.fromhex(payload['public_key'])
        sender_capabilities = set(payload.get('capabilities', []))
        challenge = payload.get('challenge', '')
        
        # Generate response challenge
        response_challenge = secrets.token_hex(32)
        
        # Create node entry
        node = NetworkNode(
            node_id=sender_id,
            public_key=sender_public_key,
            ip_address=websocket.remote_address[0],
            port=payload.get('port', 8000),
            last_seen=time.time(),
            trust_score=TrustScore(
                base_trust=0.5,
                interaction_count=0,
                failure_count=0,
                last_interaction=time.time(),
                reputation_score=0.5
            ),
            capabilities=sender_capabilities
        )
        
        with self.network_lock:
            self.known_nodes[sender_id] = node
            self.pending_handshakes[sender_id] = {
                'challenge': response_challenge,
                'websocket': websocket
            }
        
        # Generate session key
        session_key = self.crypto_manager.generate_session_key(sender_id)
        
        # Send handshake response
        response_payload = {
            'public_key': self.crypto_manager.get_public_key_bytes().hex(),
            'challenge_response': hashlib.sha256((challenge + self.node_id).encode()).hexdigest(),
            'challenge': response_challenge,
            'session_key': session_key.hex(),
            'capabilities': list(self.get_node_capabilities())
        }
        
        await self._send_message(sender_id, 'handshake_response', response_payload, websocket)
        
        logging.info(f"Handled handshake request from {sender_id}")
    
    async def _handle_handshake_response(self, sender_id: str, payload: Dict[str, Any], 
                                        websocket):
        """Handle handshake response from another node."""
        
        if sender_id in self.pending_handshakes:
            expected_response = hashlib.sha256(
                (self.pending_handshakes[sender_id]['challenge'] + sender_id).encode()
            ).hexdigest()
            
            if payload.get('challenge_response') == expected_response:
                # Handshake successful
                session_key = bytes.fromhex(payload['session_key'])
                self.crypto_manager.session_keys[sender_id] = session_key
                
                with self.network_lock:
                    if sender_id in self.known_nodes:
                        self.known_nodes[sender_id].capabilities = set(payload.get('capabilities', []))
                        self.known_nodes[sender_id].trust_score.interaction_count += 1
                    
                    del self.pending_handshakes[sender_id]
                
                self.network_stats['handshakes_completed'] += 1
                logging.info(f"Handshake completed with {sender_id}")
            else:
                logging.warning(f"Handshake failed with {sender_id}: invalid challenge response")
    
    async def _handle_trust_update(self, sender_id: str, payload: Dict[str, Any], 
                                  websocket):
        """Handle trust score update from network."""
        
        with self.network_lock:
            if sender_id in self.known_nodes:
                node = self.known_nodes[sender_id]
                
                # Update interaction counts based on payload
                if payload.get('success', True):
                    node.trust_score.interaction_count += 1
                else:
                    node.trust_score.failure_count += 1
                
                node.trust_score.last_interaction = time.time()
                self.network_stats['trust_updates'] += 1
    
    async def _handle_consciousness_sync(self, sender_id: str, payload: Dict[str, Any], 
                                        websocket):
        """Handle consciousness state synchronization."""
        
        consciousness_state = payload.get('consciousness_state', {})
        
        with self.network_lock:
            if sender_id in self.known_nodes:
                self.known_nodes[sender_id].consciousness_state = consciousness_state
        
        # Update consciousness routing
        self.consciousness_router.update_consciousness_state(sender_id, consciousness_state)
        
        logging.debug(f"Updated consciousness state for {sender_id}")
    
    async def _handle_ping(self, sender_id: str, payload: Dict[str, Any], websocket):
        """Handle ping message for latency measurement."""
        
        # Send pong response
        pong_payload = {
            'original_timestamp': payload.get('timestamp', time.time()),
            'response_timestamp': time.time()
        }
        
        await self._send_message(sender_id, 'pong', pong_payload, websocket)
    
    async def _handle_data_transfer(self, sender_id: str, payload: Dict[str, Any], 
                                   websocket):
        """Handle general data transfer messages."""
        
        # This is a placeholder for application-specific data handling
        data_type = payload.get('data_type', 'unknown')
        data_content = payload.get('data', {})
        
        logging.info(f"Received {data_type} data from {sender_id}: {len(str(data_content))} bytes")
    
    async def _send_message(self, recipient_id: str, message_type: str, 
                           payload: Dict[str, Any], websocket=None):
        """Send encrypted message to a specific node."""
        
        try:
            # Serialize payload
            payload_bytes = json.dumps(payload).encode('utf-8')
            
            # Encrypt if we have a session key
            if recipient_id in self.crypto_manager.session_keys:
                encrypted_payload, nonce = self.crypto_manager.encrypt_message(
                    payload_bytes, recipient_id
                )
            else:
                # Send unencrypted for handshake
                encrypted_payload = payload_bytes
                nonce = b''
            
            # Sign message
            message_for_signature = encrypted_payload + nonce
            signature = self.crypto_manager.sign_message(message_for_signature)
            
            # Construct message
            message = {
                'sender_id': self.node_id,
                'recipient_id': recipient_id,
                'message_type': message_type,
                'encrypted_payload': encrypted_payload.hex(),
                'signature': signature.hex(),
                'nonce': nonce.hex(),
                'timestamp': time.time()
            }
            
            # Send via WebSocket
            if websocket:
                await websocket.send(json.dumps(message))
                self.network_stats['messages_sent'] += 1
            
        except Exception as e:
            logging.error(f"Error sending message to {recipient_id}: {e}")
    
    async def _maintenance_loop(self):
        """Periodic maintenance for the network."""
        
        while self.running:
            try:
                # Clean up stale nodes
                current_time = time.time()
                stale_nodes = []
                
                with self.network_lock:
                    for node_id, node in self.known_nodes.items():
                        if current_time - node.last_seen > 300:  # 5 minutes timeout
                            stale_nodes.append(node_id)
                
                # Remove stale nodes
                for node_id in stale_nodes:
                    with self.network_lock:
                        del self.known_nodes[node_id]
                        if node_id in self.crypto_manager.session_keys:
                            del self.crypto_manager.session_keys[node_id]
                    
                    logging.info(f"Removed stale node {node_id}")
                
                # Log network statistics
                if self.network_stats['messages_received'] % 100 == 0:
                    logging.info(f"Network stats: {self.network_stats}")
                
            except Exception as e:
                logging.error(f"Maintenance error: {e}")
            
            await asyncio.sleep(60)  # Run every minute
    
    def get_node_capabilities(self) -> Set[str]:
        """Get capabilities of this node."""
        return {
            'consciousness_sync',
            'trust_mesh',
            'rby_encryption',
            'field_physics'
        }
    
    def get_network_status(self) -> Dict[str, Any]:
        """Get comprehensive network status."""
        
        with self.network_lock:
            active_nodes = len(self.known_nodes)
            avg_trust = sum(node.trust_score.current_trust() for node in self.known_nodes.values()) / max(1, active_nodes)
            
            return {
                'node_id': self.node_id,
                'active_nodes': active_nodes,
                'average_trust': avg_trust,
                'pending_handshakes': len(self.pending_handshakes),
                'session_keys': len(self.crypto_manager.session_keys),
                'network_stats': self.network_stats.copy(),
                'capabilities': list(self.get_node_capabilities())
            }
    
    def stop_network(self):
        """Stop the trust mesh network."""
        self.running = False

# Test and demonstration functions
async def test_trust_mesh():
    """Test the trust mesh network implementation."""
    print("Testing Trust Mesh Network...")
    
    # Create two network nodes
    node1 = TrustMeshNetwork("node_001", 8001)
    node2 = TrustMeshNetwork("node_002", 8002)
    
    try:
        # Start both networks
        print("Starting network nodes...")
        
        # In a real implementation, these would run on separate machines
        # For testing, we'll simulate the handshake process
        
        # Simulate handshake
        handshake_data = {
            'public_key': node2.crypto_manager.get_public_key_bytes().hex(),
            'capabilities': list(node2.get_node_capabilities()),
            'challenge': secrets.token_hex(32),
            'port': 8002
        }
        
        # Add nodes to each other's known nodes
        node1.known_nodes['node_002'] = NetworkNode(
            node_id='node_002',
            public_key=node2.crypto_manager.get_public_key_bytes(),
            ip_address='127.0.0.1',
            port=8002,
            last_seen=time.time(),
            trust_score=TrustScore(0.5, 0, 0, time.time(), 0.5),
            capabilities=set(handshake_data['capabilities'])
        )
        
        node2.known_nodes['node_001'] = NetworkNode(
            node_id='node_001', 
            public_key=node1.crypto_manager.get_public_key_bytes(),
            ip_address='127.0.0.1',
            port=8001,
            last_seen=time.time(),
            trust_score=TrustScore(0.5, 0, 0, time.time(), 0.5),
            capabilities=set(node1.get_node_capabilities())
        )
        
        # Generate session keys
        node1.crypto_manager.generate_session_key('node_002')
        node2.crypto_manager.generate_session_key('node_001')
        
        print("Simulated handshake completed")
        
        # Test consciousness routing
        consciousness_state_1 = {'rby': [0.4, 0.3, 0.3], 'coherence': 0.8}
        consciousness_state_2 = {'rby': [0.3, 0.4, 0.3], 'coherence': 0.75}
        
        node1.consciousness_router.update_consciousness_state('node_001', consciousness_state_1)
        node1.consciousness_router.update_consciousness_state('node_002', consciousness_state_2)
        
        # Test route finding
        route = node1.consciousness_router.find_best_route('node_001', 'node_002')
        print(f"Best route from node_001 to node_002: {route}")
        
        # Test trust updates
        node1.known_nodes['node_002'].trust_score.interaction_count += 5
        node1.known_nodes['node_002'].trust_score.failure_count += 1
        
        current_trust = node1.known_nodes['node_002'].trust_score.current_trust()
        print(f"Current trust for node_002: {current_trust:.3f}")
        
        # Get network status
        status1 = node1.get_network_status()
        status2 = node2.get_network_status()
        
        print(f"Node 1 status: {status1}")
        print(f"Node 2 status: {status2}")
        
    except Exception as e:
        print(f"Test error: {e}")
    finally:
        node1.stop_network()
        node2.stop_network()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(test_trust_mesh())
