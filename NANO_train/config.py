"""
Sea of Nanos — Global Configuration (v2)
Hardware profiles, mesh settings, training params, storage paths.
Supersedes all prior configs. Aligned with NANO_SEA_V2_BUILD_SPEC.md.
"""
import os
import platform
import psutil
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from enum import Enum
from pathlib import Path

# ─── Base Paths ─────────────────────────────────────────────
NANO_ROOT = Path(__file__).parent
CORE_DIR = NANO_ROOT / "core"
DATA_DIR = NANO_ROOT / "data"
MODELS_DIR = NANO_ROOT / "models"
LOGS_DIR = NANO_ROOT / "logs"
SCHEMAS_DIR = NANO_ROOT / "NANO_corpus" / "schemas"
CHECKPOINT_DIR = NANO_ROOT / "checkpoints"
DEPOSIT_DIR = NANO_ROOT / "deposits"
GLYPH_DIR = NANO_ROOT / "glyphs"
AE_DEPOSIT_DIR = NANO_ROOT / "ae_deposits"
TOKENIZER_DIR = CHECKPOINT_DIR / "tokenizer"

for d in [DATA_DIR, MODELS_DIR, LOGS_DIR, CHECKPOINT_DIR, DEPOSIT_DIR,
          GLYPH_DIR, AE_DEPOSIT_DIR, TOKENIZER_DIR]:
    d.mkdir(parents=True, exist_ok=True)


# ═══════════════════════════════════════════════════════════════
# NANO SEA v2 — MODEL HYPERPARAMETERS
# Proven optimal via 30 validated experiments on 1660-Dually.
# ═══════════════════════════════════════════════════════════════

# ─── Model Dimensions ───────────────────────────────────────
D_MODEL = 256             # Vector size all nanos share
VOCAB_SIZE = 8192         # BPE tokenizer vocabulary
MAX_SEQ_LEN = 512         # Context window
N_HEADS = 4               # Attention heads per swarm layer
N_LAYERS = 3              # Number of swarm layers (proven optimal at small scale)

# ─── Nano Configuration ─────────────────────────────────────
DEFAULT_HIDDEN_DIM = 128  # Default FFN hidden dim per nano (~65K params each)
MIN_HIDDEN_DIM = 32       # Smallest possible nano (~16K params)
MAX_HIDDEN_DIM = 512      # Largest possible nano (~260K params)
DEFAULT_NANOS_PER_LAYER = 8  # Starting pool size per layer

# ─── Routing ────────────────────────────────────────────────
DEFAULT_TOP_K = 8         # Max nanos activated per token per layer
SOFT_K = True             # Use soft differentiable k (proven in test_30v3)
EFF_LAMBDA = 0.01         # Efficiency loss weight (penalizes activating too many)
CHROMATIC_CANDIDATES = 50 # ChromaticIndex returns this many candidates

# ─── Lifecycle ──────────────────────────────────────────────
FITNESS_DEATH_THRESHOLD = 0.2       # Nanos below this fitness die
FITNESS_CHECKPOINT_THRESHOLD = 0.5  # Only save nanos above this
COSMIC_CYCLE_STEPS = 5000           # Steps per cosmic cycle before absularity check
COMPRESSION_SURVIVAL_RATE = 0.5     # Half the nanos survive compression
ABSULARITY_WINDOW = 100             # Steps to check for loss plateau
ABSULARITY_THRESHOLD = 0.05         # Min loss change to NOT be a plateau

# ─── Memory Paging (for v2 NanoMemoryManager) ──────────────
GPU_NANO_BUDGET_MB = 4000    # Max VRAM for nano pool (leave room for activations)
CPU_NANO_BUDGET_MB = 32000   # Max RAM for warm nanos
PREFETCH_BATCH = 50          # Prefetch this many nanos per batch

# ─── Training ───────────────────────────────────────────────
LEARNING_RATE = 1e-3
BATCH_SIZE = 32
SEQ_LEN = 256                # Training sequence length
GRAD_CLIP = 1.0              # Gradient clipping norm
MIDWIFE_INTERVAL_SEC = 60    # Midwife generates data every 60 seconds
MIDWIFE_TASKS_PER_ROUND = 5  # Examples per midwife round

# ─── RBY Seed Constants (from corpus) ──────────────────────
RBY_BASE_SEED = (0.707, 0.500, 0.793)  # Pre-normalization
AE_EQUALS_C_EQUALS_1 = True  # r + b + y must always = 1.0

# ─── Legacy Constants (retained for AE/storage modules) ─────
STORAGE_COMPRESSION_THRESHOLD = 0.85
STORAGE_CRITICAL_THRESHOLD = 0.90
DECAY_LAMBDA = 0.01
REINFORCEMENT_ALPHA = 0.1

# ─── Fitness Weights (v2: contribution×0.5 + utilization×0.3 + efficiency×0.2) ──
FITNESS_CONTRIBUTION_WEIGHT = 0.5
FITNESS_UTILIZATION_WEIGHT = 0.3
FITNESS_EFFICIENCY_WEIGHT = 0.2

# ─── Server Configuration ───────────────────────────────────
NANO_SERVER_HOST = "0.0.0.0"
NANO_SERVER_PORT = 5100
MESH_TRACKER_PORT = 5101
WEBSOCKET_PORT = 5102


# ─── Hardware Profiles ──────────────────────────────────────
class ComputeTier(Enum):
    GLOBAL_ROOT = 0
    REGIONAL_COORDINATOR = 1
    ZONE_LEADER = 2
    POWER_NODE = 3
    STANDARD_NODE = 4
    CONTRIBUTOR = 5
    LIGHT_CONTRIBUTOR = 6
    MICRO_CONTRIBUTOR = 7
    OBSERVER = 8
    CLIENT_ONLY = 9


@dataclass
class GPUProfile:
    name: str
    vram_gb: float
    cuda_capable: bool
    compute_capability: float = 0.0
    grade: int = 0


@dataclass
class HardwareProfile:
    name: str
    hostname: str
    cpu_model: str
    cpu_cores: int
    cpu_threads: int
    cpu_freq_ghz: float
    ram_gb: float
    gpus: List[GPUProfile] = field(default_factory=list)
    ssd_tb: float = 0.0
    hdd_tb: float = 0.0
    external_tb: float = 0.0
    os_name: str = "Windows"
    tier: ComputeTier = ComputeTier.CLIENT_ONLY
    composite_grade: int = 0

    @property
    def total_storage_tb(self) -> float:
        return self.ssd_tb + self.hdd_tb + self.external_tb

    @property
    def total_vram_gb(self) -> float:
        return sum(g.vram_gb for g in self.gpus)

    @property
    def has_cuda(self) -> bool:
        return any(g.cuda_capable for g in self.gpus)


# ─── Hardware Auto-Detection ────────────────────────────────
# No static hardware registry. Every machine auto-detects its own
# capabilities at runtime. This ensures the system works on ANY hardware —
# from a Raspberry Pi to a datacenter GPU — with zero manual configuration.


def detect_local_hardware() -> HardwareProfile:
    """
    Auto-detect the current system's hardware.

    This is the ONLY way hardware profiles are created. No machine-specific
    lookups, no hardcoded hostnames, no manual profiles. Plug in any device
    and it self-profiles: CPU, RAM, GPUs (CUDA/ROCm/DirectML/Vulkan/OpenCL/MPS),
    storage, and a composite compute grade. The grade determines the machine's
    mesh tier automatically.
    """
    hostname = platform.node()
    cpu_freq = psutil.cpu_freq()
    ram = psutil.virtual_memory()
    disk = psutil.disk_usage("/") if os.name != "nt" else psutil.disk_usage("C:\\")

    gpus = []
    # Try unified GPU detection first (handles CUDA, DirectML, ROCm, Vulkan, OpenCL)
    try:
        from compute.gpu_detect import detect_all_gpus
        all_detected = detect_all_gpus()
        for g in all_detected:
            gpus.append(GPUProfile(
                name=g.name,
                vram_gb=g.vram_gb,
                cuda_capable=g.backend.value in ("cuda", "rocm"),
                compute_capability=float(g.compute_capability) if g.compute_capability else 0.0,
                grade=g.grade,
            ))
    except ImportError:
        # Fallback: basic CUDA-only detection
        try:
            import torch
            if torch.cuda.is_available():
                for i in range(torch.cuda.device_count()):
                    props = torch.cuda.get_device_properties(i)
                    gpus.append(GPUProfile(
                        name=props.name,
                        vram_gb=props.total_memory / (1024**3),
                        cuda_capable=True,
                        compute_capability=float(f"{props.major}.{props.minor}"),
                        grade=min(95, int(props.total_memory / (1024**3) * 4)),
                    ))
        except ImportError:
            pass

    cpu_grade = min(65, psutil.cpu_count(logical=False) * 4)
    gpu_grade = max((g.grade for g in gpus), default=0)
    ram_grade = min(100, int(ram.total / (1024**3) * 1.5))
    storage_grade = min(100, int(disk.total / (1024**4) * 25))

    composite = int(gpu_grade * 0.5 + cpu_grade * 0.2 + ram_grade * 0.15 + storage_grade * 0.1)

    tier = ComputeTier.CLIENT_ONLY
    if composite >= 80: tier = ComputeTier.REGIONAL_COORDINATOR
    elif composite >= 60: tier = ComputeTier.POWER_NODE
    elif composite >= 40: tier = ComputeTier.CONTRIBUTOR
    elif composite >= 20: tier = ComputeTier.LIGHT_CONTRIBUTOR
    elif composite >= 10: tier = ComputeTier.MICRO_CONTRIBUTOR

    return HardwareProfile(
        name=f"auto-{hostname}",
        hostname=hostname,
        cpu_model=platform.processor() or "Unknown",
        cpu_cores=psutil.cpu_count(logical=False) or 1,
        cpu_threads=psutil.cpu_count(logical=True) or 1,
        cpu_freq_ghz=round((cpu_freq.max if cpu_freq else 0) / 1000, 1),
        ram_gb=round(ram.total / (1024**3), 1),
        gpus=gpus,
        ssd_tb=round(disk.total / (1024**4), 1),
        os_name=f"{platform.system()} {platform.release()}",
        tier=tier,
        composite_grade=composite,
    )


# ─── Mesh Configuration ─────────────────────────────────────
@dataclass
class MeshConfig:
    enabled: bool = False
    scope: str = "lan"  # "lan" | "wan" | "global"
    max_cpu_dedication_pct: int = 80
    max_gpu_dedication_pct: int = 90
    max_ram_dedication_pct: int = 70
    max_storage_dedication_pct: int = 50
    max_bandwidth_dedication_pct: int = 60
    auto_accept_help_requests: bool = False
    auto_accept_max_dedication_pct: int = 30
    tracker_urls: List[str] = field(default_factory=lambda: [
        "ws://localhost:5101",  # Local tracker fallback
    ])
    pii_protection: bool = True
    encrypt_all_transfers: bool = True


# ─── Training Configuration ─────────────────────────────────
@dataclass
class TrainingConfig:
    batch_size: int = 8
    learning_rate: float = 1e-3
    max_epochs_per_nano: int = 10
    idle_training: bool = True
    idle_cpu_threshold_pct: float = 30.0  # Train when CPU below this
    background_training: bool = True
    training_priority: str = "low"  # "low" | "medium" | "high"
    use_cuda: bool = True
    use_mixed_precision: bool = True
    checkpoint_every_n_cycles: int = 5
    llm_observation_enabled: bool = True  # Phase 1: observe LLM calls


# ─── Global Runtime Config ──────────────────────────────────
@dataclass 
class NanoSystemConfig:
    hardware: HardwareProfile = field(default_factory=detect_local_hardware)
    mesh: MeshConfig = field(default_factory=MeshConfig)
    training: TrainingConfig = field(default_factory=TrainingConfig)
    ae_scan_paths: List[str] = field(default_factory=lambda: [
        os.path.expanduser("~"),  # Full user directory
    ])
    ae_scan_throttle_ms: int = 10  # Yield every N ms during scan
    ae_scan_max_memory_mb: int = 256  # Max memory for scanner
    log_level: str = "INFO"
    phase: int = 1  # LLM transition phase (1-5)


def get_config() -> NanoSystemConfig:
    """Get or create the global configuration."""
    return NanoSystemConfig()
