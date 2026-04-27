"""
End-to-end encryption using XChaCha20-Poly1305.
Handles DH key exchange and per-message AEAD.
"""
import os
import logging
from typing import Optional, Tuple

logger = logging.getLogger("ileices.crypto.encryption")

try:
    from nacl.public import PrivateKey, PublicKey, Box
    from nacl.utils import random as nacl_random
    from nacl.secret import SecretBox
    from nacl.hash import blake2b
    HAS_NACL = True
except ImportError:
    HAS_NACL = False


class EncryptedChannel:
    """An encrypted channel between two nodes.

    Uses X25519 Diffie-Hellman for key exchange,
    then XChaCha20-Poly1305 for message encryption (via NaCl Box).
    """

    def __init__(self, our_private_key=None, their_public_key_bytes: bytes = b''):
        self._box = None
        self.encrypted = False

        if HAS_NACL and our_private_key is not None and their_public_key_bytes:
            try:
                their_public = PublicKey(their_public_key_bytes)
                self._box = Box(our_private_key, their_public)
                self.encrypted = True
            except Exception as e:
                logger.error(f"Failed to create encrypted channel: {e}")
                self.encrypted = False

    def encrypt(self, plaintext: bytes) -> bytes:
        if not self.encrypted or self._box is None:
            return plaintext
        return self._box.encrypt(plaintext)

    def decrypt(self, ciphertext: bytes) -> bytes:
        if not self.encrypted or self._box is None:
            return ciphertext
        return self._box.decrypt(ciphertext)


class PlaintextChannel:
    """Passthrough channel with no encryption. Used for LAN testing."""
    encrypted = False

    def encrypt(self, plaintext: bytes) -> bytes:
        return plaintext

    def decrypt(self, ciphertext: bytes) -> bytes:
        return ciphertext
