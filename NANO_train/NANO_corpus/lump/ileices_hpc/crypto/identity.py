"""
Node identity management using Ed25519 signing keys.
Each Ileices agent has a persistent identity on disk.
"""
import os
import hashlib
import json
import logging
import stat
from pathlib import Path
from typing import Tuple

logger = logging.getLogger("ileices.crypto.identity")

try:
    from nacl.signing import SigningKey, VerifyKey
    from nacl.public import PrivateKey as X25519Private, PublicKey as X25519Public
    from nacl.encoding import HexEncoder
    HAS_NACL = True
except ImportError:
    HAS_NACL = False
    logger.warning("PyNaCl not installed — running WITHOUT encryption. "
                    "Install with: pip install pynacl")


class NodeIdentity:
    """Manages the cryptographic identity of this node.

    If PyNaCl is not available, falls back to a simple random ID
    with no actual cryptography (for LAN testing without encryption).
    """

    def __init__(self, key_dir: str = ".ileices_keys"):
        self.key_dir = Path(key_dir)
        self.key_dir.mkdir(parents=True, exist_ok=True)

        self._signing_key = None
        self._verify_key = None
        self._dh_private = None
        self._dh_public = None
        self._node_id = None

        self._load_or_generate()

    def _load_or_generate(self):
        """Load existing keys or generate new ones."""
        id_file = self.key_dir / "node_identity.json"

        if HAS_NACL:
            signing_key_file = self.key_dir / "signing_key.bin"

            if signing_key_file.exists():
                with open(signing_key_file, 'rb') as f:
                    seed = f.read()
                if len(seed) != 32:
                    logger.warning("Corrupt signing key file — regenerating")
                    signing_key_file.unlink()
                    return self._load_or_generate()
                self._signing_key = SigningKey(seed)
            else:
                self._signing_key = SigningKey.generate()
                with open(signing_key_file, 'wb') as f:
                    f.write(bytes(self._signing_key))
                # Restrict permissions (best effort on Windows)
                try:
                    signing_key_file.chmod(stat.S_IRUSR | stat.S_IWUSR)
                except Exception:
                    pass

            self._verify_key = self._signing_key.verify_key

            # Ephemeral DH keys (new per session)
            self._dh_private = X25519Private.generate()
            self._dh_public = self._dh_private.public_key

            # Node ID = first 16 hex chars of SHA256(verify_key)
            vk_bytes = bytes(self._verify_key)
            self._node_id = hashlib.sha256(vk_bytes).hexdigest()[:16]
        else:
            # Fallback: random node ID, no crypto
            if id_file.exists():
                try:
                    with open(id_file) as f:
                        data = json.load(f)
                    self._node_id = data['node_id']
                except (json.JSONDecodeError, KeyError):
                    logger.warning("Corrupt identity file — regenerating")
                    self._node_id = os.urandom(8).hex()
            else:
                self._node_id = os.urandom(8).hex()

        # Save node ID for reference
        with open(id_file, 'w') as f:
            json.dump({'node_id': self._node_id, 'has_crypto': HAS_NACL}, f)
        logger.info(f"Node identity: {self._node_id} (crypto={'ON' if HAS_NACL else 'OFF'})")

    @property
    def node_id(self) -> str:
        return self._node_id

    @property
    def verify_key_bytes(self) -> bytes:
        if HAS_NACL and self._verify_key:
            return bytes(self._verify_key)
        return b''

    @property
    def dh_public_bytes(self) -> bytes:
        if HAS_NACL and self._dh_public:
            return bytes(self._dh_public)
        return b''

    def sign(self, data: bytes) -> bytes:
        if HAS_NACL and self._signing_key:
            return bytes(self._signing_key.sign(data))
        return data

    def verify(self, signed_data: bytes, verify_key_bytes: bytes) -> bytes:
        if HAS_NACL:
            vk = VerifyKey(verify_key_bytes)
            return vk.verify(signed_data)
        return signed_data

    @property
    def has_crypto(self) -> bool:
        return HAS_NACL and self._signing_key is not None
