"""
Device Manager — picks the best available compute device and provides
a unified interface for moving tensors/models to the right backend.

Handles the "fake CUDA" concept: wraps non-CUDA GPUs (AMD, Intel)
via DirectML, OpenCL, or Vulkan so they can be used for training
with the same PyTorch-style API.
"""
from __future__ import annotations
import logging, os, platform
from typing import Optional, Any, List, Dict
from .gpu_detect import detect_all_gpus, GPUInfo, ComputeBackend

logger = logging.getLogger(__name__)


class DeviceManager:
    """
    Unified compute device manager.
    
    Automatically selects the best available backend:
    1. CUDA (NVIDIA) — native PyTorch support
    2. ROCm (AMD on Linux) — via PyTorch-ROCm
    3. DirectML (any GPU on Windows) — via torch-directml
    4. MPS (Apple Silicon) — via PyTorch MPS
    5. CPU fallback
    
    For non-CUDA GPUs on Windows, DirectML acts as "fake CUDA" —
    it provides GPU acceleration through DirectX 12 instead of CUDA.
    """

    def __init__(self, force_backend: Optional[str] = None, force_cpu: bool = False):
        self._gpus: List[GPUInfo] = []
        self._active_gpu: Optional[GPUInfo] = None
        self._device_str = "cpu"
        self._backend = ComputeBackend.CPU
        self._force_backend = force_backend
        self._force_cpu = force_cpu
        self._directml_device = None

        if not force_cpu:
            self._detect_and_select()

    def _detect_and_select(self) -> None:
        """Detect GPUs and select the best device."""
        self._gpus = detect_all_gpus()

        if self._force_backend:
            # User wants a specific backend
            target = ComputeBackend(self._force_backend)
            matches = [g for g in self._gpus if g.backend == target]
            if matches:
                self._active_gpu = matches[0]
                self._backend = target
                self._device_str = self._active_gpu.torch_device
                logger.info(f"Forced backend {target.value}: {self._active_gpu.name}")
                return
            logger.warning(f"Forced backend {self._force_backend} not available, auto-selecting")

        if not self._gpus:
            logger.info("No GPUs detected, using CPU")
            return

        # Auto-select best GPU
        best = self._gpus[0]  # Already sorted by grade
        self._active_gpu = best
        self._backend = best.backend
        self._device_str = best.torch_device

        # Initialize DirectML if needed
        if self._backend == ComputeBackend.DIRECTML:
            self._init_directml(best.device_index)

        logger.info(f"Selected device: [{best.backend.value}] {best.name} "
                     f"({best.vram_gb}GB, grade={best.grade}) → {self._device_str}")

    def _init_directml(self, device_index: int) -> None:
        """Initialize DirectML backend for PyTorch."""
        try:
            import torch_directml
            self._directml_device = torch_directml.device(device_index)
            logger.info(f"DirectML initialized on device {device_index}")
        except ImportError:
            logger.warning("torch-directml not installed — falling back to CPU")
            self._device_str = "cpu"
            self._backend = ComputeBackend.CPU
        except Exception as e:
            logger.warning(f"DirectML init failed: {e} — falling back to CPU")
            self._device_str = "cpu"
            self._backend = ComputeBackend.CPU

    @property
    def device(self) -> str:
        """PyTorch device string (e.g., 'cuda:0', 'privateuseone:0', 'mps', 'cpu')."""
        return self._device_str

    @property
    def backend(self) -> ComputeBackend:
        return self._backend

    @property
    def active_gpu(self) -> Optional[GPUInfo]:
        return self._active_gpu

    @property
    def all_gpus(self) -> List[GPUInfo]:
        return self._gpus

    @property
    def is_gpu(self) -> bool:
        return self._backend != ComputeBackend.CPU

    @property
    def supports_fp16(self) -> bool:
        return self._active_gpu.supports_fp16 if self._active_gpu else False

    def to_device(self, tensor_or_module: Any) -> Any:
        """Move a tensor or nn.Module to the active device."""
        import torch
        if self._backend == ComputeBackend.DIRECTML and self._directml_device is not None:
            return tensor_or_module.to(self._directml_device)
        return tensor_or_module.to(self._device_str)

    def empty_cache(self) -> None:
        """Clear GPU memory cache if supported."""
        try:
            import torch
            if self._backend == ComputeBackend.CUDA:
                torch.cuda.empty_cache()
            elif self._backend == ComputeBackend.MPS:
                if hasattr(torch.mps, 'empty_cache'):
                    torch.mps.empty_cache()
        except Exception:
            pass

    @property
    def memory_info(self) -> Dict[str, float]:
        """Get GPU memory usage in GB."""
        try:
            import torch
            if self._backend == ComputeBackend.CUDA:
                idx = self._active_gpu.device_index if self._active_gpu else 0
                total = torch.cuda.get_device_properties(idx).total_mem / (1024**3)
                used = torch.cuda.memory_allocated(idx) / (1024**3)
                cached = torch.cuda.memory_reserved(idx) / (1024**3)
                return {
                    "total_gb": round(total, 2),
                    "used_gb": round(used, 2),
                    "cached_gb": round(cached, 2),
                    "free_gb": round(total - used, 2),
                }
        except Exception:
            pass
        return {"total_gb": 0, "used_gb": 0, "cached_gb": 0, "free_gb": 0}

    def status(self) -> Dict[str, Any]:
        """Get full device status for the API."""
        return {
            "device": self._device_str,
            "backend": self._backend.value,
            "is_gpu": self.is_gpu,
            "gpu_name": self._active_gpu.name if self._active_gpu else None,
            "gpu_vendor": self._active_gpu.vendor if self._active_gpu else None,
            "vram_gb": self._active_gpu.vram_gb if self._active_gpu else 0,
            "supports_fp16": self.supports_fp16,
            "memory": self.memory_info,
            "all_gpus": [
                {
                    "name": g.name,
                    "vendor": g.vendor,
                    "backend": g.backend.value,
                    "vram_gb": g.vram_gb,
                    "grade": g.grade,
                    "torch_device": g.torch_device,
                }
                for g in self._gpus
            ],
        }


# ═══════════════════════════════════════════════════════════════
# Convenience
# ═══════════════════════════════════════════════════════════════

_global_device_manager: Optional[DeviceManager] = None


def get_best_device(force_cpu: bool = False) -> str:
    """Get the best available PyTorch device string."""
    global _global_device_manager
    if _global_device_manager is None:
        _global_device_manager = DeviceManager(force_cpu=force_cpu)
    return _global_device_manager.device


def get_device_manager() -> DeviceManager:
    """Get or create the global DeviceManager singleton."""
    global _global_device_manager
    if _global_device_manager is None:
        _global_device_manager = DeviceManager()
    return _global_device_manager
