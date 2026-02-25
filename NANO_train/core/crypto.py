"""
Cryptography Engine — Standardized on `cryptography` library.
Ed25519 signing, X25519 key exchange, AES-256-GCM encryption.
VDN (Visual DNA Native) binary container format.
"""
from __future__ import annotations
import os
import struct
import hashlib
import logging
from dataclasses import dataclass
from typing import Tuple, Optional

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import serialization

log = logging.getLogger("crypto")

# VDN container magic bytes
VDN_MAGIC = b"VDN\x01"
VDN_VERSION = 1


@dataclass
class NodeIdentity:
    """Cryptographic identity for a mesh node."""
    signing_key: Ed25519PrivateKey
    exchange_key: X25519PrivateKey
    node_id: str  # hex(sha256(public_key))

    @classmethod
    def generate(cls) -> NodeIdentity:
        signing = Ed25519PrivateKey.generate()
        exchange = X25519PrivateKey.generate()
        pub_bytes = signing.public_key().public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw
        )
        node_id = hashlib.sha256(pub_bytes).hexdigest()[:32]
        return cls(signing_key=signing, exchange_key=exchange, node_id=node_id)

    @property
    def public_signing_key(self) -> Ed25519PublicKey:
        return self.signing_key.public_key()

    @property
    def public_exchange_key(self) -> X25519PublicKey:
        return self.exchange_key.public_key()

    def public_signing_bytes(self) -> bytes:
        return self.public_signing_key.public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw
        )

    def public_exchange_bytes(self) -> bytes:
        return self.public_exchange_key.public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw
        )

    def sign(self, data: bytes) -> bytes:
        return self.signing_key.sign(data)

    def save(self, path: str):
        """Save identity to file (private keys!)."""
        signing_bytes = self.signing_key.private_bytes(
            serialization.Encoding.Raw,
            serialization.PrivateFormat.Raw,
            serialization.NoEncryption()
        )
        exchange_bytes = self.exchange_key.private_bytes(
            serialization.Encoding.Raw,
            serialization.PrivateFormat.Raw,
            serialization.NoEncryption()
        )
        with open(path, 'wb') as f:
            f.write(signing_bytes)
            f.write(exchange_bytes)

    @classmethod
    def load(cls, path: str) -> NodeIdentity:
        """Load identity from file."""
        with open(path, 'rb') as f:
            data = f.read()
        signing = Ed25519PrivateKey.from_private_bytes(data[:32])
        exchange = X25519PrivateKey.from_private_bytes(data[32:64])
        pub_bytes = signing.public_key().public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw
        )
        node_id = hashlib.sha256(pub_bytes).hexdigest()[:32]
        return cls(signing_key=signing, exchange_key=exchange, node_id=node_id)


class CryptoEngine:
    """Encryption/decryption engine for nano data and mesh transport."""

    def __init__(self, identity: Optional[NodeIdentity] = None):
        self.identity = identity or NodeIdentity.generate()

    def derive_shared_key(self, peer_exchange_pub: bytes) -> bytes:
        """X25519 key exchange → 32-byte shared secret."""
        peer_key = X25519PublicKey.from_public_bytes(peer_exchange_pub)
        shared = self.identity.exchange_key.exchange(peer_key)
        return hashlib.sha256(shared).digest()

    def encrypt(self, plaintext: bytes, key: Optional[bytes] = None) -> Tuple[bytes, bytes]:
        """AES-256-GCM encrypt. Returns (nonce, ciphertext)."""
        if key is None:
            key = os.urandom(32)
        nonce = os.urandom(12)
        aesgcm = AESGCM(key)
        ciphertext = aesgcm.encrypt(nonce, plaintext, None)
        return nonce, ciphertext

    def decrypt(self, nonce: bytes, ciphertext: bytes, key: bytes) -> bytes:
        """AES-256-GCM decrypt."""
        aesgcm = AESGCM(key)
        return aesgcm.decrypt(nonce, ciphertext, None)

    def sign(self, data: bytes) -> bytes:
        return self.identity.sign(data)

    def verify(self, public_key_bytes: bytes, signature: bytes, data: bytes) -> bool:
        try:
            pub = Ed25519PublicKey.from_public_bytes(public_key_bytes)
            pub.verify(signature, data)
            return True
        except Exception:
            return False

    def pack_vdn(self, data: bytes, rby: Tuple[float, float, float],
                 metadata: bytes = b"", encrypt_key: Optional[bytes] = None) -> bytes:
        """
        Pack data into VDN (Visual DNA Native) container.
        Format: MAGIC(4) + VERSION(1) + FLAGS(1) + RBY(12) + 
                META_LEN(4) + META + DATA_LEN(4) + DATA + SIG(64)
        """
        flags = 0x01 if encrypt_key else 0x00
        payload = data
        if encrypt_key:
            nonce, payload = self.encrypt(data, encrypt_key)
            payload = nonce + payload  # Prepend nonce
            flags |= 0x01

        rby_bytes = struct.pack('fff', *rby)
        meta_len = struct.pack('I', len(metadata))
        data_len = struct.pack('I', len(payload))

        container = (VDN_MAGIC + struct.pack('BB', VDN_VERSION, flags) +
                     rby_bytes + meta_len + metadata + data_len + payload)
        sig = self.sign(container)
        return container + sig

    def unpack_vdn(self, container: bytes,
                   decrypt_key: Optional[bytes] = None) -> Tuple[bytes, Tuple[float, float, float], bytes]:
        """Unpack VDN container. Returns (data, rby, metadata)."""
        assert container[:4] == VDN_MAGIC, "Invalid VDN container"
        version, flags = struct.unpack('BB', container[4:6])
        rby = struct.unpack('fff', container[6:18])
        meta_len = struct.unpack('I', container[18:22])[0]
        metadata = container[22:22 + meta_len]
        data_offset = 22 + meta_len
        data_len = struct.unpack('I', container[data_offset:data_offset + 4])[0]
        payload = container[data_offset + 4:data_offset + 4 + data_len]

        if flags & 0x01 and decrypt_key:
            nonce = payload[:12]
            ciphertext = payload[12:]
            payload = self.decrypt(nonce, ciphertext, decrypt_key)

        return payload, rby, metadata
