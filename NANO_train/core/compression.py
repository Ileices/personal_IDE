"""
Compression Engine — Twmrto + RBY Glyph + Neural Map distillation.
Twmrto: Progressive text decay ("The cow jumped over the moon" → "Twmrto")
RBY Glyphs: Nanos compressed to color vectors for storage/resurrection.
Neural Maps: Distilled knowledge representations from compressed nanos.
"""
from __future__ import annotations
import zlib
import struct
import hashlib
import math
import logging
from dataclasses import dataclass, field
from typing import List, Dict, Tuple, Optional, Any

from .rby import RBYVector, normalize_rby

log = logging.getLogger("compression")


@dataclass
class CompressionMetrics:
    original_size: int = 0
    compressed_size: int = 0
    compression_ratio: float = 0.0
    reconstruction_error: float = 0.0
    encoding_time_ms: float = 0.0
    consciousness_preservation: float = 1.0  # How much "meaning" preserved


@dataclass
class RBYGlyph:
    """
    A compressed representation of a nano as a color glyph.
    Contains enough information to reconstruct the nano via RBYDecoderNano.
    """
    glyph_id: str
    source_nano_id: str
    source_nano_type: str
    rby: RBYVector
    weight_hash: str         # SHA-256 of original weights
    param_count: int
    compressed_weights: bytes  # zlib-compressed weight tensor
    metadata: Dict[str, Any] = field(default_factory=dict)
    cycle_id: int = 0

    def total_bytes(self) -> int:
        return len(self.compressed_weights) + 64  # Overhead

    def to_bytes(self) -> bytes:
        """Serialize glyph to binary format."""
        rby_bytes = self.rby.to_glyph_bytes()
        id_bytes = self.glyph_id.encode('utf-8')[:32].ljust(32, b'\0')
        type_bytes = self.source_nano_type.encode('utf-8')[:64].ljust(64, b'\0')
        header = struct.pack('I', self.param_count) + struct.pack('I', self.cycle_id)
        data_len = struct.pack('I', len(self.compressed_weights))
        return id_bytes + type_bytes + rby_bytes + header + data_len + self.compressed_weights

    @classmethod
    def from_bytes(cls, data: bytes) -> RBYGlyph:
        glyph_id = data[:32].rstrip(b'\0').decode('utf-8')
        nano_type = data[32:96].rstrip(b'\0').decode('utf-8')
        rby = RBYVector.from_glyph_bytes(data[96:108])
        param_count = struct.unpack('I', data[108:112])[0]
        cycle_id = struct.unpack('I', data[112:116])[0]
        data_len = struct.unpack('I', data[116:120])[0]
        weights = data[120:120 + data_len]
        return cls(
            glyph_id=glyph_id, source_nano_id=glyph_id,
            source_nano_type=nano_type, rby=rby,
            weight_hash="", param_count=param_count,
            compressed_weights=weights, cycle_id=cycle_id,
        )


class TwmrtoCompressor:
    """
    Twmrto semantic compression — progressive text decay.
    Preserves semantic meaning while dramatically reducing size.
    Steps: remove vowels → remove spaces → remove duplicates → compress
    """

    # Stopwords to remove first (low-information words)
    STOPWORDS = {'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
                 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
                 'would', 'could', 'should', 'may', 'might', 'can', 'shall',
                 'of', 'in', 'to', 'for', 'with', 'on', 'at', 'by', 'from',
                 'it', 'its', 'this', 'that', 'these', 'those'}

    VOWELS = set('aeiouAEIOU')

    def compress_text(self, text: str, level: int = 3) -> Tuple[str, CompressionMetrics]:
        """
        Progressive compression levels:
        0 = no compression
        1 = remove stopwords
        2 = remove vowels from non-keywords
        3 = consonant skeleton only
        4 = first-letter abbreviation
        5 = hash glyph (maximum compression)
        """
        import time
        start = time.time()
        original = text
        result = text

        if level >= 1:
            words = text.split()
            result = ' '.join(w for w in words if w.lower() not in self.STOPWORDS)

        if level >= 2:
            words = result.split()
            compressed_words = []
            for w in words:
                if len(w) > 3:
                    compressed_words.append(''.join(c for c in w if c not in self.VOWELS) or w[0])
                else:
                    compressed_words.append(w)
            result = ' '.join(compressed_words)

        if level >= 3:
            result = result.replace(' ', '')

        if level >= 4:
            words = original.split()
            result = ''.join(w[0] for w in words if w.lower() not in self.STOPWORDS)

        if level >= 5:
            result = hashlib.sha256(original.encode()).hexdigest()[:8]

        metrics = CompressionMetrics(
            original_size=len(original.encode()),
            compressed_size=len(result.encode()),
            compression_ratio=len(result.encode()) / max(1, len(original.encode())),
            encoding_time_ms=(time.time() - start) * 1000,
            consciousness_preservation=max(0, 1.0 - level * 0.15),
        )
        return result, metrics

    def decompress_hint(self, compressed: str, level: int) -> str:
        """Hint about what was compressed (lossy — can't fully reverse)."""
        if level <= 1:
            return f"[stopwords removed] {compressed}"
        if level <= 3:
            return f"[vowels+spaces removed] {compressed}"
        return f"[heavily compressed] {compressed}"


class RBYGlyphEncoder:
    """
    Encodes nanos into RBY color glyphs for compressed storage.
    Each glyph contains enough to reconstruct the nano via RBYDecoderNano.
    """

    def encode_nano(self, nano_id: str, nano_type: str, rby: RBYVector,
                    weights: bytes, cycle_id: int = 0,
                    metadata: Optional[Dict] = None) -> RBYGlyph:
        """Compress a nano's weights into an RBY glyph."""
        compressed = zlib.compress(weights, level=9)
        weight_hash = hashlib.sha256(weights).hexdigest()

        glyph = RBYGlyph(
            glyph_id=hashlib.sha256(f"{nano_id}:{cycle_id}".encode()).hexdigest()[:16],
            source_nano_id=nano_id,
            source_nano_type=nano_type,
            rby=rby,
            weight_hash=weight_hash,
            param_count=len(weights) // 4,  # Assuming float32
            compressed_weights=compressed,
            metadata=metadata or {},
            cycle_id=cycle_id,
        )

        ratio = len(compressed) / max(1, len(weights))
        log.debug(f"Glyph encoded: {nano_type} ({len(weights)} → {len(compressed)} bytes, "
                  f"ratio={ratio:.2f})")
        return glyph

    def decode_glyph(self, glyph: RBYGlyph) -> bytes:
        """Decompress glyph back to weight bytes."""
        return zlib.decompress(glyph.compressed_weights)

    def validate_reconstruction(self, glyph: RBYGlyph, reconstructed_weights: bytes) -> bool:
        """Verify reconstructed weights match the original hash."""
        return hashlib.sha256(reconstructed_weights).hexdigest() == glyph.weight_hash


class NeuralMapDistiller:
    """
    Distills knowledge from trained nanos into compact neural maps.
    Neural maps are smaller representations that preserve key behaviors.
    """

    def distill(self, teacher_outputs: List[Dict[str, Any]],
                student_size: int = 32) -> Dict[str, Any]:
        """
        Distill teacher nano's behavior into a compact neural map.
        teacher_outputs: list of {input, output, confidence} from the teacher nano
        student_size: target hidden size for the distilled map
        """
        if not teacher_outputs:
            return {"weights": b"", "size": 0, "quality": 0.0}

        # Compute statistical summary of teacher behavior
        import numpy as np
        outputs = []
        for to in teacher_outputs:
            if isinstance(to.get("output"), (list, tuple)):
                outputs.append(to["output"])

        if not outputs:
            return {"weights": b"", "size": 0, "quality": 0.0}

        arr = np.array(outputs, dtype=np.float32)
        mean = arr.mean(axis=0)
        std = arr.std(axis=0)

        # Neural map = mean + std + covariance summary
        cov_diag = np.cov(arr.T).diagonal() if arr.shape[0] > 1 else std

        map_data = np.concatenate([mean, std, cov_diag]).astype(np.float32)
        weights = map_data.tobytes()

        quality = 1.0 - (std.mean() / (mean.std() + 1e-8))  # Low variance = high quality

        return {
            "weights": weights,
            "size": len(weights),
            "quality": float(max(0, min(1, quality))),
            "teacher_samples": len(teacher_outputs),
        }
