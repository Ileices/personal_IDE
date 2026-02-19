"""
GPU Detection — finds ALL available GPUs across all backends.
Probes: CUDA/ROCm (PyTorch), DirectML (torch-directml), MPS (Apple),
        Vulkan (vulkan SDK), OpenCL (pyopencl), CPU baseline.
"""
from __future__ import annotations
import platform, logging, subprocess, re, os
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional, Dict, Any
from pathlib import Path

logger = logging.getLogger(__name__)


class ComputeBackend(Enum):
    """Available compute backends in priority order."""
    CUDA = "cuda"
    ROCM = "rocm"
    DIRECTML = "directml"
    VULKAN = "vulkan"
    OPENCL = "opencl"
    METAL = "metal"
    MPS = "mps"          # Apple Metal Performance Shaders (via PyTorch)
    CPU = "cpu"


@dataclass
class GPUInfo:
    """Info about a single GPU device."""
    name: str
    vendor: str                     # nvidia, amd, intel, apple, unknown
    vram_gb: float
    backend: ComputeBackend
    device_index: int = 0
    driver_version: str = ""
    compute_capability: str = ""    # CUDA CC or equivalent
    is_integrated: bool = False
    supports_fp16: bool = True
    supports_bf16: bool = False
    supports_int8: bool = False
    pci_bus: str = ""
    grade: int = 0                  # 0-100 compute grade

    @property
    def torch_device(self) -> str:
        """Return the PyTorch device string."""
        if self.backend == ComputeBackend.CUDA:
            return f"cuda:{self.device_index}"
        if self.backend == ComputeBackend.DIRECTML:
            return f"privateuseone:{self.device_index}"
        if self.backend in (ComputeBackend.MPS, ComputeBackend.METAL):
            return "mps"
        if self.backend == ComputeBackend.ROCM:
            return f"cuda:{self.device_index}"  # ROCm uses cuda device in PyTorch
        return "cpu"


# ═══════════════════════════════════════════════════════════════
# Detection Probes
# ═══════════════════════════════════════════════════════════════

def _detect_cuda_gpus() -> List[GPUInfo]:
    """Detect NVIDIA CUDA GPUs via PyTorch."""
    gpus = []
    try:
        import torch
        if torch.cuda.is_available():
            for i in range(torch.cuda.device_count()):
                props = torch.cuda.get_device_properties(i)
                vram = props.total_mem / (1024**3)
                cc = f"{props.major}.{props.minor}"
                gpus.append(GPUInfo(
                    name=props.name,
                    vendor="nvidia",
                    vram_gb=round(vram, 1),
                    backend=ComputeBackend.CUDA,
                    device_index=i,
                    compute_capability=cc,
                    supports_fp16=props.major >= 6,
                    supports_bf16=props.major >= 8,
                    supports_int8=props.major >= 6,
                    grade=min(95, int(vram * 4)),
                ))
            logger.info(f"CUDA: found {len(gpus)} GPU(s)")
    except ImportError:
        logger.debug("PyTorch not available for CUDA detection")
    except Exception as e:
        logger.debug(f"CUDA detection failed: {e}")
    return gpus


def _detect_rocm_gpus() -> List[GPUInfo]:
    """Detect AMD ROCm GPUs (Linux + PyTorch-ROCm)."""
    gpus = []
    try:
        import torch
        if hasattr(torch.version, 'hip') and torch.version.hip is not None:
            if torch.cuda.is_available():  # ROCm mirrors CUDA API
                for i in range(torch.cuda.device_count()):
                    props = torch.cuda.get_device_properties(i)
                    vram = props.total_mem / (1024**3)
                    gpus.append(GPUInfo(
                        name=props.name,
                        vendor="amd",
                        vram_gb=round(vram, 1),
                        backend=ComputeBackend.ROCM,
                        device_index=i,
                        driver_version=torch.version.hip or "",
                        supports_fp16=True,
                        grade=min(90, int(vram * 3.5)),
                    ))
            logger.info(f"ROCm: found {len(gpus)} GPU(s)")
    except ImportError:
        pass
    except Exception as e:
        logger.debug(f"ROCm detection failed: {e}")
    return gpus


def _detect_directml_gpus() -> List[GPUInfo]:
    """Detect DirectML GPUs (Windows — works with AMD, Intel, NVIDIA)."""
    gpus = []
    try:
        import torch_directml
        count = torch_directml.device_count()
        for i in range(count):
            name = torch_directml.device_name(i)
            vendor = "unknown"
            name_lower = name.lower()
            if "nvidia" in name_lower or "geforce" in name_lower or "rtx" in name_lower or "gtx" in name_lower:
                vendor = "nvidia"
            elif "amd" in name_lower or "radeon" in name_lower or "rx " in name_lower:
                vendor = "amd"
            elif "intel" in name_lower or "iris" in name_lower or "uhd" in name_lower or "arc" in name_lower:
                vendor = "intel"

            # DirectML doesn't easily report VRAM — estimate from name or use DXGI
            vram = _estimate_vram_dxgi(i)
            gpus.append(GPUInfo(
                name=name,
                vendor=vendor,
                vram_gb=vram,
                backend=ComputeBackend.DIRECTML,
                device_index=i,
                supports_fp16=True,
                is_integrated="uhd" in name_lower or "iris" in name_lower,
                grade=min(80, max(10, int(vram * 3))),
            ))
        logger.info(f"DirectML: found {count} device(s)")
    except ImportError:
        logger.debug("torch-directml not installed")
    except Exception as e:
        logger.debug(f"DirectML detection failed: {e}")
    return gpus


def _estimate_vram_dxgi(device_index: int) -> float:
    """Try to get VRAM via DXGI on Windows."""
    if platform.system() != "Windows":
        return 0.0
    try:
        # Use PowerShell to query DXGI adapter info
        cmd = (
            'Get-CimInstance Win32_VideoController | '
            'Select-Object -Property Name, AdapterRAM | '
            'ConvertTo-Json'
        )
        result = subprocess.run(
            ["powershell", "-Command", cmd],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            import json
            data = json.loads(result.stdout)
            if isinstance(data, dict):
                data = [data]
            if device_index < len(data):
                adapter_ram = data[device_index].get("AdapterRAM", 0)
                if adapter_ram:
                    return round(adapter_ram / (1024**3), 1)
    except Exception:
        pass
    return 0.0


def _detect_vulkan_gpus() -> List[GPUInfo]:
    """Detect Vulkan-capable GPUs via vulkaninfo or the SDK."""
    gpus = []
    try:
        result = subprocess.run(
            ["vulkaninfo", "--summary"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            # Parse vulkaninfo output
            current_name = ""
            for line in result.stdout.splitlines():
                line = line.strip()
                if "deviceName" in line:
                    current_name = line.split("=")[-1].strip()
                elif "deviceType" in line and current_name:
                    vendor = "unknown"
                    name_lower = current_name.lower()
                    if "nvidia" in name_lower or "geforce" in name_lower:
                        vendor = "nvidia"
                    elif "amd" in name_lower or "radeon" in name_lower:
                        vendor = "amd"
                    elif "intel" in name_lower:
                        vendor = "intel"

                    gpus.append(GPUInfo(
                        name=current_name,
                        vendor=vendor,
                        vram_gb=0.0,  # Vulkan doesn't easily report this
                        backend=ComputeBackend.VULKAN,
                        device_index=len(gpus),
                        is_integrated="INTEGRATED" in line.upper(),
                        grade=20,  # Base grade — Vulkan compute is usable but slower
                    ))
                    current_name = ""
            logger.info(f"Vulkan: found {len(gpus)} device(s)")
    except FileNotFoundError:
        logger.debug("vulkaninfo not found")
    except Exception as e:
        logger.debug(f"Vulkan detection failed: {e}")
    return gpus


def _detect_opencl_gpus() -> List[GPUInfo]:
    """Detect OpenCL-capable GPUs."""
    gpus = []
    try:
        import pyopencl as cl
        platforms = cl.get_platforms()
        idx = 0
        for plat in platforms:
            for dev in plat.get_devices(device_type=cl.device_type.GPU):
                name = dev.name.strip()
                vendor_str = dev.vendor.strip().lower()
                vendor = "unknown"
                if "nvidia" in vendor_str:
                    vendor = "nvidia"
                elif "amd" in vendor_str or "advanced micro" in vendor_str:
                    vendor = "amd"
                elif "intel" in vendor_str:
                    vendor = "intel"

                vram_gb = round(dev.global_mem_size / (1024**3), 1)
                gpus.append(GPUInfo(
                    name=name,
                    vendor=vendor,
                    vram_gb=vram_gb,
                    backend=ComputeBackend.OPENCL,
                    device_index=idx,
                    driver_version=dev.driver_version,
                    supports_fp16="cl_khr_fp16" in dev.extensions,
                    grade=min(70, max(10, int(vram_gb * 3))),
                ))
                idx += 1
        logger.info(f"OpenCL: found {len(gpus)} GPU(s)")
    except ImportError:
        logger.debug("pyopencl not installed")
    except Exception as e:
        logger.debug(f"OpenCL detection failed: {e}")
    return gpus


def _detect_mps_gpus() -> List[GPUInfo]:
    """Detect Apple Metal Performance Shaders (macOS)."""
    gpus = []
    if platform.system() != "Darwin":
        return gpus
    try:
        import torch
        if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            # Get GPU name from system_profiler
            name = "Apple GPU"
            try:
                result = subprocess.run(
                    ["system_profiler", "SPDisplaysDataType", "-json"],
                    capture_output=True, text=True, timeout=10,
                )
                if result.returncode == 0:
                    import json
                    data = json.loads(result.stdout)
                    displays = data.get("SPDisplaysDataType", [])
                    if displays:
                        name = displays[0].get("sppci_model", "Apple GPU")
            except Exception:
                pass

            gpus.append(GPUInfo(
                name=name,
                vendor="apple",
                vram_gb=0.0,  # Shared memory
                backend=ComputeBackend.MPS,
                device_index=0,
                supports_fp16=True,
                grade=50,  # Apple Silicon is decent
            ))
            logger.info("MPS: found Apple GPU")
    except ImportError:
        pass
    except Exception as e:
        logger.debug(f"MPS detection failed: {e}")
    return gpus


def _detect_windows_gpus_wmi() -> List[Dict[str, Any]]:
    """Get raw GPU info from Windows WMI as fallback."""
    if platform.system() != "Windows":
        return []
    try:
        cmd = (
            "Get-CimInstance Win32_VideoController | "
            "Select-Object Name, AdapterRAM, DriverVersion, VideoProcessor, PNPDeviceID | "
            "ConvertTo-Json"
        )
        result = subprocess.run(
            ["powershell", "-Command", cmd],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            import json
            data = json.loads(result.stdout)
            return [data] if isinstance(data, dict) else data
    except Exception:
        pass
    return []


# ═══════════════════════════════════════════════════════════════
# Main Detection Entry Point
# ═══════════════════════════════════════════════════════════════

def detect_all_gpus() -> List[GPUInfo]:
    """
    Detect ALL GPUs on this system using every available backend.
    Returns a deduplicated list sorted by compute grade (best first).
    """
    logger.info("Detecting all GPUs across all backends...")

    all_gpus: List[GPUInfo] = []

    # Probe each backend
    all_gpus.extend(_detect_cuda_gpus())
    all_gpus.extend(_detect_rocm_gpus())
    all_gpus.extend(_detect_directml_gpus())
    all_gpus.extend(_detect_mps_gpus())
    all_gpus.extend(_detect_vulkan_gpus())
    all_gpus.extend(_detect_opencl_gpus())

    # Deduplicate: if the same physical GPU appears in multiple backends,
    # keep the highest-priority backend version
    deduped = _deduplicate_gpus(all_gpus)

    # Sort by grade (best first)
    deduped.sort(key=lambda g: g.grade, reverse=True)

    if not deduped:
        logger.info("No GPUs detected — will use CPU")
    else:
        for gpu in deduped:
            logger.info(f"  [{gpu.backend.value}] {gpu.name} ({gpu.vram_gb}GB, grade={gpu.grade})")

    return deduped


def _deduplicate_gpus(gpus: List[GPUInfo]) -> List[GPUInfo]:
    """Remove duplicate GPUs that appear across multiple backends.
    Priority: CUDA > ROCm > DirectML > MPS > Vulkan > OpenCL."""
    priority = {
        ComputeBackend.CUDA: 0,
        ComputeBackend.ROCM: 1,
        ComputeBackend.DIRECTML: 2,
        ComputeBackend.MPS: 3,
        ComputeBackend.VULKAN: 4,
        ComputeBackend.OPENCL: 5,
    }

    seen: Dict[str, GPUInfo] = {}  # key: normalized name
    for gpu in gpus:
        key = _normalize_gpu_name(gpu.name)
        existing = seen.get(key)
        if not existing or priority.get(gpu.backend, 99) < priority.get(existing.backend, 99):
            # Merge VRAM info if the better backend doesn't have it
            if existing and gpu.vram_gb == 0.0 and existing.vram_gb > 0:
                gpu.vram_gb = existing.vram_gb
                gpu.grade = max(gpu.grade, existing.grade)
            seen[key] = gpu

    return list(seen.values())


def _normalize_gpu_name(name: str) -> str:
    """Normalize GPU name for dedup comparison."""
    name = name.lower().strip()
    # Remove common prefixes
    for prefix in ["nvidia ", "amd ", "intel(r) ", "intel "]:
        if name.startswith(prefix):
            name = name[len(prefix):]
    # Remove trailing stuff like "- 6GB"
    name = re.sub(r'\s*-\s*\d+\s*gb\s*$', '', name)
    return name.strip()


def get_gpu_summary() -> Dict[str, Any]:
    """Get a JSON-serializable summary of all detected GPUs."""
    gpus = detect_all_gpus()
    return {
        "gpu_count": len(gpus),
        "total_vram_gb": round(sum(g.vram_gb for g in gpus), 1),
        "backends_available": list(set(g.backend.value for g in gpus)),
        "best_device": gpus[0].torch_device if gpus else "cpu",
        "gpus": [
            {
                "name": g.name,
                "vendor": g.vendor,
                "vram_gb": g.vram_gb,
                "backend": g.backend.value,
                "torch_device": g.torch_device,
                "grade": g.grade,
                "supports_fp16": g.supports_fp16,
                "is_integrated": g.is_integrated,
            }
            for g in gpus
        ],
    }
