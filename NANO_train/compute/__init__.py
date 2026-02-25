"""
Compute abstraction layer — multi-backend GPU detection + unified tensor ops.
Supports: CUDA, DirectML, ROCm, Vulkan, OpenCL, Metal, CPU fallback.
"""
from .gpu_detect import detect_all_gpus, GPUInfo, ComputeBackend
from .device_manager import DeviceManager, get_best_device

__all__ = [
    "detect_all_gpus", "GPUInfo", "ComputeBackend",
    "DeviceManager", "get_best_device",
]
