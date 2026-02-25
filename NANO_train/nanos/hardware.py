"""
Category 9: HARDWARE NANOS — System monitoring + optimization.
System Monitoring (7) + Hardware Optimization (5) + Hardware Compatibility (4) = 16 nanos.
"""
from .base import BaseNano, register_nano

# ═══════════════════════════════════════════════════════════════
# 9.1 SYSTEM MONITORING
# ═══════════════════════════════════════════════════════════════

@register_nano
class CPUMonitorNano(BaseNano):
    NANO_TYPE = "CPUMonitorNano"
    DEFAULT_RBY = (0.2, 0.6, 0.2)
    DEFAULT_PTAIE = (0.9, 1.0, 0.8, 0.9, 0.2)
    # Per-core load, frequency, temperature via psutil

@register_nano
class GPUMonitorNano(BaseNano):
    NANO_TYPE = "GPUMonitorNano"
    DEFAULT_RBY = (0.2, 0.6, 0.2)
    DEFAULT_PTAIE = (0.9, 1.0, 0.8, 0.9, 0.2)
    # VRAM, compute utilization, temp via pynvml/torch.cuda

@register_nano
class RAMMonitorNano(BaseNano):
    NANO_TYPE = "RAMMonitorNano"
    DEFAULT_RBY = (0.2, 0.6, 0.2)
    DEFAULT_PTAIE = (0.9, 1.0, 0.8, 0.9, 0.2)
    # Heap, available, swap, per-process breakdown

@register_nano
class DiskMonitorNano(BaseNano):
    NANO_TYPE = "DiskMonitorNano"
    DEFAULT_RBY = (0.2, 0.6, 0.2)
    DEFAULT_PTAIE = (0.8, 0.9, 0.7, 0.8, 0.2)
    # IOPS, throughput, latency, free space

@register_nano
class NetworkMonitorNano(BaseNano):
    NANO_TYPE = "NetworkMonitorNano"
    DEFAULT_RBY = (0.3, 0.5, 0.2)
    DEFAULT_PTAIE = (0.8, 0.9, 0.8, 0.8, 0.3)
    # Bandwidth, latency, packet loss, connection count

@register_nano
class ThermalMonitorNano(BaseNano):
    NANO_TYPE = "ThermalMonitorNano"
    DEFAULT_RBY = (0.2, 0.6, 0.2)
    DEFAULT_PTAIE = (0.9, 1.0, 0.7, 0.8, 0.2)
    # CPU/GPU junction temps, throttle detection

@register_nano
class PowerMonitorNano(BaseNano):
    NANO_TYPE = "PowerMonitorNano"
    DEFAULT_RBY = (0.2, 0.6, 0.2)
    DEFAULT_PTAIE = (0.7, 0.9, 0.6, 0.7, 0.2)
    # Power draw estimation, battery state

# ═══════════════════════════════════════════════════════════════
# 9.2 HARDWARE OPTIMIZATION
# ═══════════════════════════════════════════════════════════════

@register_nano
class MemoryOptimizerNano(BaseNano):
    NANO_TYPE = "MemoryOptimizerNano"
    DEFAULT_RBY = (0.3, 0.5, 0.2)
    DEFAULT_PTAIE = (0.9, 0.8, 0.9, 0.9, 0.4)
    # GC pressure reduction, tensor pooling, page-lock hints

@register_nano
class ComputeSchedulerNano(BaseNano):
    NANO_TYPE = "ComputeSchedulerNano"
    DEFAULT_RBY = (0.3, 0.5, 0.2)
    DEFAULT_PTAIE = (1.0, 0.9, 1.0, 1.0, 0.3)
    # CPU affinity, CUDA streams, kernel launch scheduling

@register_nano
class CacheOptimizerNano(BaseNano):
    NANO_TYPE = "CacheOptimizerNano"
    DEFAULT_RBY = (0.2, 0.6, 0.2)
    DEFAULT_PTAIE = (0.8, 0.8, 0.8, 0.8, 0.3)
    # L1/L2/L3 aware data layout, prefetch hints

@register_nano
class IOOptimizerNano(BaseNano):
    NANO_TYPE = "IOOptimizerNano"
    DEFAULT_RBY = (0.2, 0.6, 0.2)
    DEFAULT_PTAIE = (0.8, 0.8, 0.8, 0.8, 0.3)
    # Async I/O, mmap, buffering strategy

@register_nano
class ParallelismOptimizerNano(BaseNano):
    NANO_TYPE = "ParallelismOptimizerNano"
    DEFAULT_RBY = (0.3, 0.5, 0.2)
    DEFAULT_PTAIE = (0.8, 0.7, 0.9, 0.8, 0.5)
    # Data parallelism, pipeline parallelism, tensor parallelism

# ═══════════════════════════════════════════════════════════════
# 9.3 HARDWARE COMPATIBILITY
# ═══════════════════════════════════════════════════════════════

@register_nano
class DeviceDetectorNano(BaseNano):
    NANO_TYPE = "DeviceDetectorNano"
    DEFAULT_RBY = (0.2, 0.7, 0.1)
    DEFAULT_PTAIE = (0.9, 0.8, 0.7, 0.9, 0.2)
    # Auto-detect CUDA, ROCm, MPS, CPU capabilities

@register_nano
class DriverCompatibilityNano(BaseNano):
    NANO_TYPE = "DriverCompatibilityNano"
    DEFAULT_RBY = (0.2, 0.7, 0.1)
    DEFAULT_PTAIE = (0.7, 0.6, 0.6, 0.7, 0.2)
    # CUDA toolkit version, driver version, compute capability

@register_nano
class FallbackEngineNano(BaseNano):
    NANO_TYPE = "FallbackEngineNano"
    DEFAULT_RBY = (0.3, 0.5, 0.2)
    DEFAULT_PTAIE = (0.9, 0.8, 0.9, 0.9, 0.3)
    # GPU→CPU fallback, ONNX runtime, scikit-learn alternatives

@register_nano
class HardwareGraderNano(BaseNano):
    NANO_TYPE = "HardwareGraderNano"
    DEFAULT_RBY = (0.2, 0.6, 0.2)
    DEFAULT_PTAIE = (0.8, 0.7, 0.7, 0.8, 0.3)
    # Compute grade using JSON schemas: GPU×0.5+CPU×0.2+RAM×0.15+Storage×0.1+Net×0.05
