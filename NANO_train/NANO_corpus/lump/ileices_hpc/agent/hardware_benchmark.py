"""
Hardware benchmarking -- probes GPU, CPU, RAM, disk.
Classifies the machine into a tier: NANO / EDGE / CORE / ULTRA.
"""
import os
import sys
import time
import platform
import tempfile
import logging
from pathlib import Path
from dataclasses import dataclass, asdict

logger = logging.getLogger("ileices.agent.benchmark")

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

try:
    import torch
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False


@dataclass
class HardwareProfile:
    """Complete hardware profile of this machine."""
    hostname: str = ""
    os_name: str = ""
    os_version: str = ""
    python_version: str = ""
    cpu_model: str = ""
    cpu_cores_physical: int = 0
    cpu_cores_logical: int = 0
    cpu_freq_mhz: float = 0.0
    ram_total_mb: int = 0
    ram_available_mb: int = 0
    gpus: list = None
    gpu_count: int = 0
    total_vram_mb: int = 0
    disk_total_gb: float = 0.0
    disk_free_gb: float = 0.0
    disk_read_mbps: float = 0.0
    disk_write_mbps: float = 0.0
    torch_version: str = ""
    cuda_available: bool = False
    tier: str = "UNKNOWN"

    def to_dict(self) -> dict:
        return asdict(self)

    def summary(self) -> str:
        lines = [
            f"=== Hardware Profile: {self.hostname} ===",
            f"OS: {self.os_name} {self.os_version}",
            f"CPU: {self.cpu_model} ({self.cpu_cores_physical}C/{self.cpu_cores_logical}T @ {self.cpu_freq_mhz:.0f} MHz)",
            f"RAM: {self.ram_total_mb:,} MB total, {self.ram_available_mb:,} MB available",
        ]
        if self.gpu_count > 0:
            for gpu in (self.gpus or []):
                g = gpu if isinstance(gpu, dict) else asdict(gpu)
                lines.append(f"GPU {g['index']}: {g['name']} ({g['vram_mb']:,} MB) -- {g['tflops_fp32']:.2f} TFLOPS FP32")
            lines.append(f"Total VRAM: {self.total_vram_mb:,} MB")
        else:
            lines.append("GPU: None detected")
        lines.append(f"Disk: {self.disk_free_gb:.1f} / {self.disk_total_gb:.1f} GB free")
        if self.disk_read_mbps > 0:
            lines.append(f"Disk I/O: {self.disk_read_mbps:.0f} MB/s read, {self.disk_write_mbps:.0f} MB/s write")
        lines.append(f"PyTorch: {self.torch_version} | CUDA: {self.cuda_available}")
        lines.append(f"*** TIER: {self.tier} ***")
        return "\n".join(lines)


def benchmark_gpu(device_idx: int, warmup_iters: int = 50,
                  bench_iters: int = 200, matrix_size: int = 4096,
                  timeout_s: float = 60.0) -> float:
    """Benchmark a GPU. Returns estimated TFLOPS for FP32."""
    if not HAS_TORCH or not torch.cuda.is_available():
        return 0.0

    device = torch.device(f'cuda:{device_idx}')
    start_wall = time.perf_counter()

    try:
        a = torch.randn(matrix_size, matrix_size, device=device)
        b = torch.randn(matrix_size, matrix_size, device=device)

        for _ in range(warmup_iters):
            torch.mm(a, b)
            if time.perf_counter() - start_wall > timeout_s:
                logger.warning(f"GPU {device_idx} benchmark timed out during warmup")
                del a, b
                torch.cuda.empty_cache()
                return 0.0
        torch.cuda.synchronize(device)

        start = time.perf_counter()
        for _ in range(bench_iters):
            torch.mm(a, b)
        torch.cuda.synchronize(device)
        elapsed = time.perf_counter() - start

        flops_per_op = 2 * (matrix_size ** 3)
        total_flops = flops_per_op * bench_iters
        tflops = total_flops / elapsed / 1e12

        del a, b
        torch.cuda.empty_cache()
        return tflops

    except Exception as e:
        logger.error(f"GPU {device_idx} benchmark failed: {e}")
        try:
            torch.cuda.empty_cache()
        except Exception:
            pass
        return 0.0


def benchmark_disk(test_size_mb: int = 256) -> tuple:
    """Benchmark disk sequential read/write speed.
    Returns (read_mbps, write_mbps). Always cleans up temp file.
    """
    test_bytes = test_size_mb * 1024 * 1024
    data = os.urandom(min(test_bytes, 64 * 1024 * 1024))
    tmp_path = None

    try:
        fd, tmp_path = tempfile.mkstemp(suffix='.ileices_bench')
        os.close(fd)

        # Write benchmark
        start = time.perf_counter()
        with open(tmp_path, 'wb') as f:
            written = 0
            while written < test_bytes:
                chunk = data[:min(len(data), test_bytes - written)]
                f.write(chunk)
                written += len(chunk)
            f.flush()
            os.fsync(f.fileno())
        write_time = time.perf_counter() - start
        write_mbps = test_size_mb / write_time if write_time > 0 else 0

        # Read benchmark
        start = time.perf_counter()
        with open(tmp_path, 'rb') as f:
            while f.read(64 * 1024 * 1024):
                pass
        read_time = time.perf_counter() - start
        read_mbps = test_size_mb / read_time if read_time > 0 else 0

        return (read_mbps, write_mbps)
    except Exception as e:
        logger.warning(f"Disk benchmark failed: {e}")
        return (0.0, 0.0)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception:
                pass


def run_benchmark(
    gpu_warmup: int = 50,
    gpu_iters: int = 200,
    matrix_size: int = 4096,
    disk_test_mb: int = 256,
    skip_disk: bool = False,
    skip_gpu: bool = False,
) -> HardwareProfile:
    """Run full hardware benchmark and return a HardwareProfile."""
    profile = HardwareProfile()

    # --- System Info ---
    profile.hostname = platform.node()
    profile.os_name = platform.system()
    profile.os_version = platform.version()
    profile.python_version = platform.python_version()

    # --- CPU ---
    profile.cpu_cores_logical = os.cpu_count() or 1
    if HAS_PSUTIL:
        try:
            profile.cpu_cores_physical = psutil.cpu_count(logical=False) or profile.cpu_cores_logical
            freq = psutil.cpu_freq()
            if freq:
                profile.cpu_freq_mhz = freq.current
        except Exception:
            profile.cpu_cores_physical = profile.cpu_cores_logical
    else:
        profile.cpu_cores_physical = profile.cpu_cores_logical

    # CPU model
    try:
        if platform.system() == 'Windows':
            import winreg
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                                r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
            profile.cpu_model, _ = winreg.QueryValueEx(key, "ProcessorNameString")
            profile.cpu_model = profile.cpu_model.strip()
        elif platform.system() == 'Linux':
            with open('/proc/cpuinfo') as f:
                for line in f:
                    if 'model name' in line:
                        profile.cpu_model = line.split(':')[1].strip()
                        break
        elif platform.system() == 'Darwin':
            import subprocess
            result = subprocess.run(['sysctl', '-n', 'machdep.cpu.brand_string'],
                                    capture_output=True, text=True, timeout=5)
            profile.cpu_model = result.stdout.strip()
    except Exception:
        profile.cpu_model = platform.processor() or "Unknown"

    # --- RAM ---
    if HAS_PSUTIL:
        try:
            mem = psutil.virtual_memory()
            profile.ram_total_mb = int(mem.total / (1024 * 1024))
            profile.ram_available_mb = int(mem.available / (1024 * 1024))
        except Exception:
            pass

    # --- GPU ---
    profile.gpus = []
    if HAS_TORCH:
        profile.torch_version = torch.__version__
        profile.cuda_available = torch.cuda.is_available()
        if profile.cuda_available and not skip_gpu:
            profile.gpu_count = torch.cuda.device_count()
            for i in range(profile.gpu_count):
                props = torch.cuda.get_device_properties(i)
                vram_mb = getattr(props, 'total_memory', getattr(props, 'total_mem', 0)) // (1024 * 1024)
                logger.info(f"Benchmarking GPU {i}: {props.name}...")
                print(f"  Benchmarking GPU {i}: {props.name}...")
                tflops = benchmark_gpu(i, gpu_warmup, gpu_iters, matrix_size)
                gpu_info = {
                    'index': i,
                    'name': props.name,
                    'vram_mb': vram_mb,
                    'driver_version': '',
                    'cuda_version': f"{props.major}.{props.minor}",
                    'tflops_fp32': round(tflops, 3),
                }
                profile.gpus.append(gpu_info)
                profile.total_vram_mb += vram_mb

    # --- Disk ---
    if not skip_disk:
        logger.info(f"Benchmarking disk ({disk_test_mb} MB)...")
        print(f"  Benchmarking disk ({disk_test_mb} MB)...")
        read_mbps, write_mbps = benchmark_disk(disk_test_mb)
        profile.disk_read_mbps = round(read_mbps, 1)
        profile.disk_write_mbps = round(write_mbps, 1)

    if HAS_PSUTIL:
        try:
            # Use C: on Windows, / on Unix
            disk_path = 'C:\\' if platform.system() == 'Windows' else '/'
            disk = psutil.disk_usage(disk_path)
            profile.disk_total_gb = round(disk.total / (1024**3), 1)
            profile.disk_free_gb = round(disk.free / (1024**3), 1)
        except Exception:
            pass

    # --- Tier Classification ---
    from ..mesh.protocol import classify_tier
    primary_gpu_model = profile.gpus[0]['name'] if profile.gpus else "none"
    primary_vram = profile.gpus[0]['vram_mb'] if profile.gpus else 0
    profile.tier = classify_tier(
        primary_vram, primary_gpu_model,
        profile.cpu_cores_physical, profile.ram_total_mb
    )

    return profile
