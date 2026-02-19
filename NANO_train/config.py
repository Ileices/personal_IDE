"""
Sea of Nanos — Global Configuration
Hardware profiles, mesh settings, training params, storage paths.
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
NANOS_DIR = NANO_ROOT / "nanos"
DATA_DIR = NANO_ROOT / "data"
MODELS_DIR = NANO_ROOT / "models"
LOGS_DIR = NANO_ROOT / "logs"
SCHEMAS_DIR = NANO_ROOT / "NANO_corpus" / "schemas"
CHECKPOINT_DIR = NANO_ROOT / "checkpoints"
GLYPH_DIR = NANO_ROOT / "glyphs"
AE_DEPOSIT_DIR = NANO_ROOT / "ae_deposits"

for d in [DATA_DIR, MODELS_DIR, LOGS_DIR, CHECKPOINT_DIR, GLYPH_DIR, AE_DEPOSIT_DIR]:
    d.mkdir(parents=True, exist_ok=True)


# ─── RBY Seed Constants (from corpus) ──────────────────────
RBY_BASE_SEED = (0.707, 0.500, 0.793)  # Pre-normalization
AE_EQUALS_C_EQUALS_1 = True  # r + b + y must always = 1.0


# ─── Lifecycle Constants ────────────────────────────────────
ABSULARITY_EPSILON = 0.01      # dV/dt threshold for Λ detection
ABSULARITY_ETA = 0.05          # LP-MD threshold
STORAGE_COMPRESSION_THRESHOLD = 0.85  # 85% triggers compression
STORAGE_CRITICAL_THRESHOLD = 0.90     # 90% forces immediate pruning
DECAY_LAMBDA = 0.01            # Exponential decay rate
REINFORCEMENT_ALPHA = 0.1      # Learning rate for importance reinforcement
IC_AE_MAX_DEPTH = 10           # Maximum recursion depth for IC-AE infection
IC_AE_MAX_CHILDREN = 1000      # Max child sandboxes per parent


# ─── Fitness Weights ────────────────────────────────────────
FITNESS_ALPHA = 0.30   # Performance weight
FITNESS_BETA = 0.25    # Efficiency weight
FITNESS_GAMMA = 0.15   # Inverse size weight
FITNESS_DELTA = 0.20   # Usage frequency weight
FITNESS_EPSILON = 0.10 # Novelty weight


# ─── Nano Architecture Defaults ─────────────────────────────
DEFAULT_HIDDEN_SIZE = 64
DEFAULT_INPUT_SIZE = 128
DEFAULT_OUTPUT_SIZE = 64
MAX_NANO_PARAMS = 50_000   # Must fit in L1/L2 cache
MIN_NANO_PARAMS = 256
TRAINING_TIMEOUT_SECONDS = 120  # Max seconds per nano training cycle


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


# ─── Known Hardware Registry ────────────────────────────────
KNOWN_HARDWARE: Dict[str, HardwareProfile] = {
    "garage-computer": HardwareProfile(
        name="garage-computer",
        hostname="DESKTOP-2ESV9MJ",
        cpu_model="Intel Core i7-10700F",
        cpu_cores=8,
        cpu_threads=16,
        cpu_freq_ghz=2.9,
        ram_gb=12.0,
        gpus=[],  # No GPU
        ssd_tb=0.0,
        hdd_tb=0.5,  # Approximate
        external_tb=0.0,
        os_name="Windows 10",
        tier=ComputeTier.LIGHT_CONTRIBUTOR,
        composite_grade=15,
    ),
    "1660-dually": HardwareProfile(
        name="1660-dually",
        hostname="1660-DUALLY",
        cpu_model="AMD Ryzen 9 5900X",
        cpu_cores=12,
        cpu_threads=24,
        cpu_freq_ghz=4.5,
        ram_gb=80.0,
        gpus=[
            GPUProfile("GTX 1660 Super", 6.0, True, 7.5, grade=40),
            GPUProfile("GTX 1660 Super", 6.0, True, 7.5, grade=40),
        ],
        ssd_tb=2.0,
        hdd_tb=3.0,
        external_tb=1.0,
        os_name="Windows",
        tier=ComputeTier.CONTRIBUTOR,
        composite_grade=48,
    ),
    "3090-rig": HardwareProfile(
        name="3090-rig",
        hostname="3090-RIG",
        cpu_model="AMD Ryzen 9 5950X",
        cpu_cores=16,
        cpu_threads=32,
        cpu_freq_ghz=4.5,
        ram_gb=60.0,
        gpus=[
            GPUProfile("RTX 3090 FE", 24.0, True, 8.6, grade=80),
        ],
        ssd_tb=2.0,
        hdd_tb=0.0,
        external_tb=20.0,
        os_name="Windows",
        tier=ComputeTier.POWER_NODE,
        composite_grade=70,
    ),
    "32-core": HardwareProfile(
        name="32-core",
        hostname="THREADRIPPER",
        cpu_model="AMD Threadripper 3970X",
        cpu_cores=32,
        cpu_threads=64,
        cpu_freq_ghz=3.7,
        ram_gb=256.0,
        gpus=[
            GPUProfile("RTX 4090 FE", 24.0, True, 8.9, grade=95),
        ],
        ssd_tb=5.0,
        hdd_tb=0.0,
        external_tb=45.0,
        os_name="Windows",
        tier=ComputeTier.REGIONAL_COORDINATOR,
        composite_grade=88,
    ),
}


def detect_local_hardware() -> HardwareProfile:
    """Auto-detect the current system's hardware."""
    hostname = platform.node()

    # Check if this is a known system
    for name, profile in KNOWN_HARDWARE.items():
        if profile.hostname.lower() == hostname.lower():
            return profile

    # Auto-detect unknown hardware
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
                        vram_gb=props.total_mem / (1024**3),
                        cuda_capable=True,
                        compute_capability=float(f"{props.major}.{props.minor}"),
                        grade=min(95, int(props.total_mem / (1024**3) * 4)),
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
