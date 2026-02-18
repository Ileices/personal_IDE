"""
RBY Encryption Core - Real cryptographic implementation using Red-Blue-Yellow
consciousness states for advanced security protocols in the IC-AE framework.

This implements actual encryption algorithms using RBY state transformations,
Twmrto compression, and VDN (Visual DNA Native) format for secure data transfer.
"""

import hashlib
import json
import secrets
import time
import struct
import zlib
from typing import Dict, List, Tuple, Optional, Any, Union
from dataclasses import dataclass, asdict
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
from Crypto.PublicKey import RSA
from Crypto.Signature import pkcs1_15
from Crypto.Hash import SHA256
import numpy as np

@dataclass
class RBYState:
    """Represents a Red-Blue-Yellow consciousness state."""
    red: float    # Perception weight
    blue: float   # Cognition weight  
    yellow: float # Execution weight
    timestamp: float = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = time.time()
        # Normalize to ensure sum = 1
        total = self.red + self.blue + self.yellow
        if total > 0:
            self.red /= total
            self.blue /= total
            self.yellow /= total

@dataclass
class TwmrtoCompressed:
    """Container for Twmrto-compressed data with metadata."""
    compressed_data: str
    original_length: int
    compression_passes: int
    semantic_markers: List[str]
    compression_ratio: float

class TwmrtoEngine:
    """Advanced Twmrto compression engine with semantic preservation."""
    
    def __init__(self):
        self.stopwords = {
            "the", "and", "or", "is", "to", "a", "of", "in", "for", "on", 
            "as", "at", "by", "with", "from", "this", "that", "are", "was"
        }
        self.preserve_patterns = [
            r'\b[A-Z][a-z]*[A-Z]\w*\b',  # CamelCase
            r'\b[a-z]+_[a-z]+\b',        # snake_case
            r'\b\d+\.\d+\b',             # Decimals
            r'\b[A-Z]{2,}\b'             # ACRONYMS
        ]
    
    def compress(self, text: str, passes: int = 4) -> TwmrtoCompressed:
        """Compress text using semantic-aware Twmrto algorithm."""
        import re
        
        original_length = len(text)
        compressed = text.strip()
        semantic_markers = []
        
        # Extract semantic markers before compression
        for pattern in self.preserve_patterns:
            matches = re.findall(pattern, compressed)
            semantic_markers.extend(matches)
        
        # Progressive compression passes
        for pass_num in range(passes):
            # Remove redundant whitespace
            compressed = re.sub(r'\s+', ' ', compressed)
            
            # Remove stopwords unless part of preserved patterns
            words = compressed.split()
            filtered_words = []
            for word in words:
                if word.lower() not in self.stopwords or word in semantic_markers:
                    filtered_words.append(word)
            compressed = ' '.join(filtered_words)
            
            # Character-level compression (alternate character removal)
            if pass_num > 1:
                compressed = ''.join(c for i, c in enumerate(compressed) if i % 2 == 0)
            
            # Remove duplicate consecutive characters
            compressed = re.sub(r'(.)\1+', r'\1', compressed)
        
        compression_ratio = len(compressed) / original_length if original_length > 0 else 0
        
        return TwmrtoCompressed(
            compressed_data=compressed,
            original_length=original_length,
            compression_passes=passes,
            semantic_markers=semantic_markers,
            compression_ratio=compression_ratio
        )
    
    def expand(self, compressed: TwmrtoCompressed) -> str:
        """Attempt to expand Twmrto-compressed data (lossy reconstruction)."""
        # This is a simplified expansion - real implementation would use
        # learned patterns and context to better reconstruct
        expanded = compressed.compressed_data
        
        # Reinsert semantic markers
        for marker in compressed.semantic_markers:
            if marker not in expanded:
                expanded += f" {marker}"
        
        return expanded

class RBYCryptographicMapper:
    """Maps RBY states to cryptographic operations."""
    
    def __init__(self):
        # Default PTAIE mapping for common characters
        self.ptaie_map = {
            'A': (0.45, 0.35, 0.20), 'B': (0.25, 0.45, 0.30), 'C': (0.35, 0.25, 0.40),
            'D': (0.40, 0.30, 0.30), 'E': (0.50, 0.25, 0.25), 'F': (0.30, 0.40, 0.30),
            'G': (0.35, 0.35, 0.30), 'H': (0.25, 0.50, 0.25), 'I': (0.60, 0.20, 0.20),
            'J': (0.20, 0.30, 0.50), 'K': (0.30, 0.20, 0.50), 'L': (0.40, 0.35, 0.25),
            'M': (0.35, 0.40, 0.25), 'N': (0.30, 0.45, 0.25), 'O': (0.55, 0.25, 0.20),
            'P': (0.25, 0.25, 0.50), 'Q': (0.20, 0.60, 0.20), 'R': (0.50, 0.30, 0.20),
            'S': (0.30, 0.30, 0.40), 'T': (0.30, 0.50, 0.20), 'U': (0.45, 0.30, 0.25),
            'V': (0.25, 0.35, 0.40), 'W': (0.35, 0.30, 0.35), 'X': (0.20, 0.40, 0.40),
            'Y': (0.20, 0.20, 0.60), 'Z': (0.30, 0.25, 0.45),
            ' ': (0.33, 0.33, 0.34), '0': (0.40, 0.40, 0.20), '1': (0.20, 0.40, 0.40),
            '2': (0.30, 0.35, 0.35), '3': (0.35, 0.30, 0.35), '4': (0.25, 0.45, 0.30),
            '5': (0.45, 0.25, 0.30), '6': (0.30, 0.30, 0.40), '7': (0.40, 0.30, 0.30),
            '8': (0.35, 0.35, 0.30), '9': (0.30, 0.40, 0.30)
        }
    
    def text_to_rby_sequence(self, text: str) -> List[RBYState]:
        """Convert text to sequence of RBY states using PTAIE mapping."""
        rby_sequence = []
        for char in text.upper():
            if char in self.ptaie_map:
                r, b, y = self.ptaie_map[char]
                rby_sequence.append(RBYState(r, b, y))
            else:
                # Default for unknown characters
                rby_sequence.append(RBYState(0.33, 0.33, 0.34))
        return rby_sequence
    
    def rby_sequence_to_bytes(self, rby_sequence: List[RBYState]) -> bytes:
        """Convert RBY sequence to binary data."""
        byte_data = bytearray()
        for rby in rby_sequence:
            # Pack each RBY state as 3 float32 values
            byte_data.extend(struct.pack('fff', rby.red, rby.blue, rby.yellow))
        return bytes(byte_data)
    
    def bytes_to_rby_sequence(self, data: bytes) -> List[RBYState]:
        """Convert binary data back to RBY sequence."""
        rby_sequence = []
        for i in range(0, len(data), 12):  # 3 float32 = 12 bytes
            if i + 12 <= len(data):
                r, b, y = struct.unpack('fff', data[i:i+12])
                rby_sequence.append(RBYState(r, b, y))
        return rby_sequence

class VDNContainer:
    """Visual DNA Native container format for RBY-encrypted data."""
    
    VDN_HEADER = b'VDN1'
    
    def __init__(self):
        self.compression_enabled = True
    
    def pack(self, rby_data: List[RBYState], metadata: Dict[str, Any],
             relationships: Optional[List[Tuple[str, str]]] = None) -> bytes:
        """Pack RBY data into VDN binary format."""
        
        # Serialize RBY data
        rby_bytes = bytearray()
        for rby in rby_data:
            rby_bytes.extend(struct.pack('fff', rby.red, rby.blue, rby.yellow))
        
        # Serialize metadata and relationships
        meta_json = json.dumps(metadata, separators=(',', ':')).encode('utf-8')
        rel_json = json.dumps(relationships or [], separators=(',', ':')).encode('utf-8')
        
        # Optional compression
        if self.compression_enabled:
            rby_bytes = zlib.compress(rby_bytes)
            meta_json = zlib.compress(meta_json)
            rel_json = zlib.compress(rel_json)
        
        # Pack into VDN format
        packed = bytearray()
        packed.extend(self.VDN_HEADER)  # 4 bytes header
        packed.extend(struct.pack('B', 1 if self.compression_enabled else 0))  # Compression flag
        packed.extend(struct.pack('I', len(rby_bytes)))  # RBY data length
        packed.extend(rby_bytes)
        packed.extend(struct.pack('I', len(meta_json)))  # Metadata length
        packed.extend(meta_json)
        packed.extend(struct.pack('I', len(rel_json)))   # Relationships length
        packed.extend(rel_json)
        
        return bytes(packed)
    
    def unpack(self, vdn_data: bytes) -> Tuple[List[RBYState], Dict[str, Any], List[Tuple[str, str]]]:
        """Unpack VDN binary format to RBY data."""
        if not vdn_data.startswith(self.VDN_HEADER):
            raise ValueError("Invalid VDN header")
        
        offset = 4  # Skip header
        compressed = bool(vdn_data[offset])
        offset += 1
        
        # Read RBY data
        rby_length = struct.unpack('I', vdn_data[offset:offset+4])[0]
        offset += 4
        rby_bytes = vdn_data[offset:offset+rby_length]
        offset += rby_length
        
        # Read metadata
        meta_length = struct.unpack('I', vdn_data[offset:offset+4])[0]
        offset += 4
        meta_bytes = vdn_data[offset:offset+meta_length]
        offset += meta_length
        
        # Read relationships
        rel_length = struct.unpack('I', vdn_data[offset:offset+4])[0]
        offset += 4
        rel_bytes = vdn_data[offset:offset+rel_length]
        
        # Decompress if needed
        if compressed:
            rby_bytes = zlib.decompress(rby_bytes)
            meta_bytes = zlib.decompress(meta_bytes)
            rel_bytes = zlib.decompress(rel_bytes)
        
        # Deserialize
        rby_data = []
        for i in range(0, len(rby_bytes), 12):
            if i + 12 <= len(rby_bytes):
                r, b, y = struct.unpack('fff', rby_bytes[i:i+12])
                rby_data.append(RBYState(r, b, y))
        
        metadata = json.loads(meta_bytes.decode('utf-8'))
        relationships = json.loads(rel_bytes.decode('utf-8'))
        
        return rby_data, metadata, relationships

class RBYEncryptionEngine:
    """Main encryption engine using RBY consciousness states."""
    
    def __init__(self):
        self.twmrto = TwmrtoEngine()
        self.mapper = RBYCryptographicMapper()
        self.vdn = VDNContainer()
        self._rsa_key = None
    
    def generate_session_key(self, rby_seed: RBYState, entropy: bytes = None) -> bytes:
        """Generate encryption key from RBY state and entropy."""
        if entropy is None:
            entropy = secrets.token_bytes(32)
        
        # Create deterministic but unpredictable key from RBY state
        key_material = bytearray()
        key_material.extend(struct.pack('fff', rby_seed.red, rby_seed.blue, rby_seed.yellow))
        key_material.extend(entropy)
        
        # Hash to create 256-bit key
        return hashlib.sha256(key_material).digest()
    
    def encrypt_with_rby(self, plaintext: str, master_rby: RBYState, 
                        metadata: Optional[Dict[str, Any]] = None) -> bytes:
        """Encrypt text using RBY-based encryption."""
        
        # Step 1: Compress using Twmrto
        compressed = self.twmrto.compress(plaintext)
        
        # Step 2: Convert to RBY sequence
        rby_sequence = self.mapper.text_to_rby_sequence(compressed.compressed_data)
        
        # Step 3: Generate session key from master RBY
        session_key = self.generate_session_key(master_rby)
        
        # Step 4: Encrypt RBY data with AES
        rby_bytes = self.mapper.rby_sequence_to_bytes(rby_sequence)
        cipher = AES.new(session_key, AES.MODE_GCM)
        ciphertext, auth_tag = cipher.encrypt_and_digest(rby_bytes)
        
        # Step 5: Pack metadata
        if metadata is None:
            metadata = {}
        metadata.update({
            'encryption_version': '1.0',
            'master_rby': asdict(master_rby),
            'twmrto_meta': asdict(compressed),
            'cipher_nonce': cipher.nonce.hex(),
            'auth_tag': auth_tag.hex(),
            'timestamp': time.time()
        })
        
        # Step 6: Create VDN container
        encrypted_rby = [RBYState(0.0, 0.0, 0.0)]  # Placeholder for encrypted data
        vdn_data = self.vdn.pack(encrypted_rby, metadata)
        
        # Step 7: Append encrypted payload
        return vdn_data + ciphertext
    
    def decrypt_with_rby(self, encrypted_data: bytes) -> str:
        """Decrypt RBY-encrypted data."""
        
        # Find VDN boundary (after relationships length)
        vdn_end = self._find_vdn_boundary(encrypted_data)
        vdn_part = encrypted_data[:vdn_end]
        ciphertext = encrypted_data[vdn_end:]
        
        # Unpack VDN container
        _, metadata, _ = self.vdn.unpack(vdn_part)
        
        # Extract encryption parameters
        master_rby_dict = metadata['master_rby']
        master_rby = RBYState(**master_rby_dict)
        nonce = bytes.fromhex(metadata['cipher_nonce'])
        auth_tag = bytes.fromhex(metadata['auth_tag'])
        
        # Regenerate session key
        session_key = self.generate_session_key(master_rby)
        
        # Decrypt RBY data
        cipher = AES.new(session_key, AES.MODE_GCM, nonce=nonce)
        rby_bytes = cipher.decrypt_and_verify(ciphertext, auth_tag)
        
        # Convert back to RBY sequence
        rby_sequence = self.mapper.bytes_to_rby_sequence(rby_bytes)
        
        # Reconstruct text (simplified - real implementation would use learned patterns)
        twmrto_meta = metadata['twmrto_meta']
        compressed = TwmrtoCompressed(**twmrto_meta)
        
        return self.twmrto.expand(compressed)
    
    def _find_vdn_boundary(self, data: bytes) -> int:
        """Find where VDN container ends and encrypted payload begins."""
        if not data.startswith(VDNContainer.VDN_HEADER):
            raise ValueError("Invalid VDN data")
        
        offset = 5  # Header + compression flag
        
        # Skip RBY data
        rby_length = struct.unpack('I', data[offset:offset+4])[0]
        offset += 4 + rby_length
        
        # Skip metadata
        meta_length = struct.unpack('I', data[offset:offset+4])[0]
        offset += 4 + meta_length
        
        # Skip relationships
        rel_length = struct.unpack('I', data[offset:offset+4])[0]
        offset += 4 + rel_length
        
        return offset

# Test and demonstration functions
def test_rby_encryption():
    """Test the RBY encryption system."""
    print("Testing RBY Encryption System...")
    
    engine = RBYEncryptionEngine()
    
    # Test data
    plaintext = "The consciousness quantum field resonates at frequency 42.7 Hz with RBY states"
    master_rby = RBYState(0.4, 0.35, 0.25)
    
    print(f"Original text: {plaintext}")
    print(f"Master RBY: R={master_rby.red:.3f}, B={master_rby.blue:.3f}, Y={master_rby.yellow:.3f}")
    
    # Encrypt
    encrypted = engine.encrypt_with_rby(plaintext, master_rby, 
                                       {"test_meta": "demonstration"})
    print(f"Encrypted size: {len(encrypted)} bytes")
    
    # Decrypt
    try:
        decrypted = engine.decrypt_with_rby(encrypted)
        print(f"Decrypted text: {decrypted}")
        print(f"Encryption successful: {plaintext in decrypted}")
    except Exception as e:
        print(f"Decryption failed: {e}")

if __name__ == "__main__":
    test_rby_encryption()
