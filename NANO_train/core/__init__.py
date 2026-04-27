"""Sea of Nanos — Core foundation modules (v2)."""
# --- v2 core (Nano Sea architecture) ---
from .nano import Nano
from .router import SwarmRouter, KPredictor, soft_k_selection
from .crosstalk import ExpertCrosstalk
from .swarm_layer import SwarmLayer
from .swarm_model import NanoSeaModel
from .touch_tensor import TouchTensor
from .chromatic_index import ChromaticIndex
from .rby import (
    RBYVector, PTAIE_MAP, normalize_rby, rby_distance, rby_blend,
    aitchison_distance, compute_uf_io, update_rby,
)

# --- Retained v1 modules (still useful) ---
from .ptaie import PTAIEVector
from .ae import AE, AEc
from .storage import StorageTier, TieredStorageManager
from .crypto import CryptoEngine

# --- v1 modules kept for backward compat, will be replaced in Phase 3 ---
try:
    from .lifecycle import LifecycleState, LifecycleManager
except ImportError:
    LifecycleState = None
    LifecycleManager = None
try:
    from .ic_ae import ICAEEngine, ICAESandbox
except ImportError:
    ICAEEngine = None
    ICAESandbox = None
try:
    from .compression import TwmrtoCompressor, RBYGlyphEncoder, NeuralMapDistiller
except ImportError:
    TwmrtoCompressor = None
    RBYGlyphEncoder = None
    NeuralMapDistiller = None
try:
    from .fitness import FitnessEvaluator
except ImportError:
    FitnessEvaluator = None

__all__ = [
    # v2 core
    "Nano", "SwarmRouter", "KPredictor", "soft_k_selection",
    "ExpertCrosstalk", "SwarmLayer", "NanoSeaModel",
    "TouchTensor", "ChromaticIndex",
    "aitchison_distance", "compute_uf_io", "update_rby",
    # RBY
    "RBYVector", "PTAIE_MAP", "normalize_rby", "rby_distance", "rby_blend",
    # Retained
    "PTAIEVector", "AE", "AEc",
    "StorageTier", "TieredStorageManager", "CryptoEngine",
    # Legacy (may be None)
    "LifecycleState", "LifecycleManager",
    "ICAEEngine", "ICAESandbox",
    "TwmrtoCompressor", "RBYGlyphEncoder", "NeuralMapDistiller",
    "FitnessEvaluator",
]
