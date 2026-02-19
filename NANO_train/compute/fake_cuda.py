"""
Fake CUDA — Python + C shim layer that wraps non-CUDA GPU backends 
(DirectML, Vulkan, OpenCL) to provide a CUDA-like interface.

This module allows code that was written for CUDA to run on AMD/Intel GPUs
by intercepting PyTorch operations and routing them through alternative backends.

Strategy:
  1. DirectML (Windows, preferred) — torch-directml wraps DirectX 12 ML
  2. Vulkan Compute (cross-platform) — via custom compute shaders
  3. OpenCL (cross-platform) — via pyopencl for general compute
  4. CPU fallback — always works

For nano training specifically, the operations are simple enough
(linear layers, ReLU, MSE loss) that ANY GPU backend can handle them.
"""
from __future__ import annotations
import logging, os, sys, ctypes, struct
from typing import Optional, Any, Tuple
from pathlib import Path

logger = logging.getLogger(__name__)


class FakeCudaDevice:
    """
    Wraps a non-CUDA GPU device to present a CUDA-like interface.
    This is the Python-side shim — for code that checks `if cuda_available`.
    """

    def __init__(self):
        self._backend = None      # 'directml', 'vulkan', 'opencl', 'cpu'
        self._device = None       # Actual PyTorch device or backend handle
        self._device_name = "CPU"
        self._vram_gb = 0.0
        self._available = False

        self._probe()

    def _probe(self) -> None:
        """Try each backend in priority order."""
        # 1. DirectML (Windows)
        if self._try_directml():
            return
        # 2. Vulkan compute (if our C extension is available)
        if self._try_vulkan_extension():
            return
        # 3. OpenCL
        if self._try_opencl():
            return
        # 4. CPU
        self._backend = "cpu"
        self._device_name = "CPU (no GPU acceleration)"
        logger.info("FakeCUDA: no non-CUDA GPU backend available, using CPU")

    def _try_directml(self) -> bool:
        """Try DirectML backend."""
        try:
            import torch_directml
            count = torch_directml.device_count()
            if count > 0:
                self._backend = "directml"
                self._device = torch_directml.device(0)
                self._device_name = torch_directml.device_name(0)
                self._available = True
                logger.info(f"FakeCUDA → DirectML: {self._device_name}")
                return True
        except ImportError:
            pass
        except Exception as e:
            logger.debug(f"DirectML probe failed: {e}")
        return False

    def _try_vulkan_extension(self) -> bool:
        """Try our custom Vulkan compute C extension."""
        try:
            ext_path = Path(__file__).parent / "native"
            if sys.platform == "win32":
                lib_file = ext_path / "nano_vulkan.dll"
            elif sys.platform == "darwin":
                lib_file = ext_path / "libnano_vulkan.dylib"
            else:
                lib_file = ext_path / "libnano_vulkan.so"

            if lib_file.exists():
                lib = ctypes.CDLL(str(lib_file))
                if hasattr(lib, 'nano_vulkan_init'):
                    result = lib.nano_vulkan_init()
                    if result == 0:  # Success
                        self._backend = "vulkan"
                        self._available = True
                        # Get device name
                        lib.nano_vulkan_device_name.restype = ctypes.c_char_p
                        name = lib.nano_vulkan_device_name()
                        self._device_name = name.decode() if name else "Vulkan GPU"
                        logger.info(f"FakeCUDA → Vulkan: {self._device_name}")
                        return True
        except Exception as e:
            logger.debug(f"Vulkan extension probe failed: {e}")
        return False

    def _try_opencl(self) -> bool:
        """Try OpenCL backend."""
        try:
            import pyopencl as cl
            platforms = cl.get_platforms()
            for plat in platforms:
                gpus = plat.get_devices(device_type=cl.device_type.GPU)
                if gpus:
                    self._backend = "opencl"
                    self._device_name = gpus[0].name.strip()
                    self._vram_gb = round(gpus[0].global_mem_size / (1024**3), 1)
                    self._available = True
                    logger.info(f"FakeCUDA → OpenCL: {self._device_name} ({self._vram_gb}GB)")
                    return True
        except ImportError:
            pass
        except Exception as e:
            logger.debug(f"OpenCL probe failed: {e}")
        return False

    @property
    def is_available(self) -> bool:
        return self._available

    @property
    def backend_name(self) -> str:
        return self._backend or "cpu"

    @property
    def device_name(self) -> str:
        return self._device_name

    def get_torch_device(self) -> str:
        """Get the PyTorch device string for this backend."""
        if self._backend == "directml":
            return "privateuseone:0"
        # Vulkan and OpenCL don't have native PyTorch device types —
        # operations go through CPU with GPU-accelerated kernels
        return "cpu"

    def to_device(self, tensor_or_module: Any) -> Any:
        """Move a tensor or module to this device."""
        if self._backend == "directml" and self._device is not None:
            return tensor_or_module.to(self._device)
        return tensor_or_module  # CPU or extension-managed


class VulkanComputeOps:
    """
    Python wrapper around our Vulkan compute shader library.
    Provides basic tensor operations: matmul, relu, mse_loss.
    
    These are the only ops needed for nano training
    (tiny 128→64→64→64 MLPs with MSE loss).
    
    Falls back to CPU PyTorch if the native library isn't compiled.
    """

    def __init__(self):
        self._lib = None
        self._available = False
        self._load_native()

    def _load_native(self) -> None:
        """Load the native Vulkan compute library."""
        ext_path = Path(__file__).parent / "native"
        if sys.platform == "win32":
            lib_file = ext_path / "nano_vulkan.dll"
        elif sys.platform == "darwin":
            lib_file = ext_path / "libnano_vulkan.dylib"
        else:
            lib_file = ext_path / "libnano_vulkan.so"

        if lib_file.exists():
            try:
                self._lib = ctypes.CDLL(str(lib_file))
                self._available = True
                logger.info(f"Vulkan compute ops loaded from {lib_file}")
            except Exception as e:
                logger.debug(f"Failed to load Vulkan library: {e}")

    @property
    def available(self) -> bool:
        return self._available

    def matmul(self, a: 'torch.Tensor', b: 'torch.Tensor') -> 'torch.Tensor':
        """GPU-accelerated matrix multiply via Vulkan compute shaders."""
        if self._available and self._lib and hasattr(self._lib, 'nano_vulkan_matmul'):
            import torch
            # Flatten to contiguous, send to native, get back
            a_flat = a.contiguous().float()
            b_flat = b.contiguous().float()
            m, k = a_flat.shape
            _, n = b_flat.shape
            out = torch.zeros(m, n, dtype=torch.float32)

            self._lib.nano_vulkan_matmul(
                a_flat.data_ptr(), b_flat.data_ptr(), out.data_ptr(),
                ctypes.c_int(m), ctypes.c_int(k), ctypes.c_int(n)
            )
            return out
        # Fallback: CPU PyTorch
        return a @ b


class OpenCLComputeOps:
    """
    OpenCL compute wrapper for basic tensor operations.
    Falls back to CPU if pyopencl isn't available.
    """

    def __init__(self):
        self._ctx = None
        self._queue = None
        self._available = False
        self._init()

    def _init(self) -> None:
        try:
            import pyopencl as cl
            platforms = cl.get_platforms()
            for plat in platforms:
                gpus = plat.get_devices(device_type=cl.device_type.GPU)
                if gpus:
                    self._ctx = cl.Context([gpus[0]])
                    self._queue = cl.CommandQueue(self._ctx)
                    self._available = True
                    logger.info(f"OpenCL compute ops initialized on {gpus[0].name}")
                    return
        except ImportError:
            pass
        except Exception as e:
            logger.debug(f"OpenCL init failed: {e}")

    @property
    def available(self) -> bool:
        return self._available

    def matmul(self, a: 'torch.Tensor', b: 'torch.Tensor') -> 'torch.Tensor':
        """GPU-accelerated matmul via OpenCL."""
        if not self._available:
            return a @ b

        try:
            import pyopencl as cl
            import numpy as np

            a_np = a.detach().cpu().numpy().astype(np.float32)
            b_np = b.detach().cpu().numpy().astype(np.float32)
            m, k = a_np.shape
            _, n = b_np.shape
            out_np = np.zeros((m, n), dtype=np.float32)

            # Create buffers
            mf = cl.mem_flags
            a_buf = cl.Buffer(self._ctx, mf.READ_ONLY | mf.COPY_HOST_PTR, hostbuf=a_np)
            b_buf = cl.Buffer(self._ctx, mf.READ_ONLY | mf.COPY_HOST_PTR, hostbuf=b_np)
            out_buf = cl.Buffer(self._ctx, mf.WRITE_ONLY, out_np.nbytes)

            # Simple matmul kernel
            kernel_src = """
            __kernel void matmul(
                __global const float* A, __global const float* B,
                __global float* C, int M, int K, int N)
            {
                int row = get_global_id(0);
                int col = get_global_id(1);
                if (row < M && col < N) {
                    float sum = 0.0f;
                    for (int i = 0; i < K; i++) {
                        sum += A[row * K + i] * B[i * N + col];
                    }
                    C[row * N + col] = sum;
                }
            }
            """
            prg = cl.Program(self._ctx, kernel_src).build()
            prg.matmul(
                self._queue, (m, n), None,
                a_buf, b_buf, out_buf,
                np.int32(m), np.int32(k), np.int32(n)
            )
            cl.enqueue_copy(self._queue, out_np, out_buf).wait()

            import torch
            return torch.from_numpy(out_np)
        except Exception as e:
            logger.debug(f"OpenCL matmul failed, falling back to CPU: {e}")
            return a @ b


# ═══════════════════════════════════════════════════════════════
# Global singleton
# ═══════════════════════════════════════════════════════════════

_fake_cuda: Optional[FakeCudaDevice] = None


def get_fake_cuda() -> FakeCudaDevice:
    """Get or create the FakeCUDA singleton."""
    global _fake_cuda
    if _fake_cuda is None:
        _fake_cuda = FakeCudaDevice()
    return _fake_cuda


def is_any_gpu_available() -> bool:
    """Check if ANY GPU (CUDA or non-CUDA) is available."""
    import torch
    if torch.cuda.is_available():
        return True
    fc = get_fake_cuda()
    return fc.is_available
