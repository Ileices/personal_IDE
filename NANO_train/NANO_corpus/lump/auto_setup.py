#!/usr/bin/env python3
"""
Ileices HPC — Automated Setup Script
═════════════════════════════════════
One-click installer that automates the entire SETUP_GUIDE.md pipeline.
Designed to run from SYSTEM Python (no venv required up front).

What this does:
  1. Asks one question: commander or worker?
  2. If worker, asks for commander address
  3. Detects Python version
  4. Creates virtual environment (non-destructive — skips if exists)
  5. Installs/upgrades pip
  6. Installs core dependencies (msgpack, psutil, PyNaCl)
  7. Detects NVIDIA GPU + CUDA version via nvidia-smi
  8. Installs correct PyTorch variant (CUDA-matched or CPU-only)
  9. Runs bootstrap.py --check for full validation
  10. Runs test suite to verify
  11. Generates node config
  12. Attempts Windows firewall rule (graceful failure if not admin)
  13. Offers to launch the agent

Non-destructive: skips steps that are already completed.
Logs everything to ileices_setup.log.

Usage:
    python auto_setup.py           (interactive — asks commander/worker)
    python auto_setup.py --role commander
    python auto_setup.py --role worker --commander 192.168.0.241:7777
"""

import sys
import os
import re
import json
import time
import shutil
import socket
import platform
import logging
import argparse
import tempfile
import subprocess
from pathlib import Path
from datetime import datetime

# ═══════════════════════════════════════════════════════════════════════
#  Constants
# ═══════════════════════════════════════════════════════════════════════

SCRIPT_DIR = Path(__file__).resolve().parent
VENV_DIR = SCRIPT_DIR / ".venv"
DATA_DIR = SCRIPT_DIR / "ileices_data"
KEY_DIR = SCRIPT_DIR / ".ileices_keys"
LOG_FILE = SCRIPT_DIR / "ileices_setup.log"
CONFIG_FILE = DATA_DIR / "node_config.json"
BOOTSTRAP_SCRIPT = SCRIPT_DIR / "bootstrap.py"
REQUIREMENTS_FILE = SCRIPT_DIR / "requirements.txt"

MIN_PYTHON = (3, 10)
DEFAULT_PORT = 7777

# PyTorch CUDA version mapping:
# nvidia-smi reports the max CUDA version the DRIVER supports.
# We pick the best matching PyTorch wheel.
PYTORCH_CUDA_MAP = [
    # (min_cuda_version, wheel_tag, index_url)
    ((12, 8), "cu128", "https://download.pytorch.org/whl/cu128"),
    ((12, 4), "cu124", "https://download.pytorch.org/whl/cu124"),
    ((12, 1), "cu121", "https://download.pytorch.org/whl/cu121"),
    ((11, 8), "cu118", "https://download.pytorch.org/whl/cu118"),
]
PYTORCH_CPU_URL = "https://download.pytorch.org/whl/cpu"

CORE_PACKAGES = ["msgpack", "psutil", "PyNaCl"]

# ═══════════════════════════════════════════════════════════════════════
#  Logging Setup
# ═══════════════════════════════════════════════════════════════════════

def setup_logging():
    """Configure dual logging: console (pretty) + file (detailed)."""
    log = logging.getLogger("ileices_setup")
    log.setLevel(logging.DEBUG)

    # File handler — everything goes here
    fh = logging.FileHandler(str(LOG_FILE), mode="a", encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)-7s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    ))
    log.addHandler(fh)

    # Console handler — INFO+
    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.INFO)
    ch.setFormatter(logging.Formatter("%(message)s"))
    log.addHandler(ch)

    # Banner in log file
    log.debug("=" * 72)
    log.debug(f"Ileices HPC Auto-Setup started at {datetime.now().isoformat()}")
    log.debug(f"Platform: {platform.system()} {platform.release()} ({platform.machine()})")
    log.debug(f"Python: {sys.version}")
    log.debug(f"CWD: {os.getcwd()}")
    log.debug(f"Script dir: {SCRIPT_DIR}")
    log.debug("=" * 72)

    return log


# ═══════════════════════════════════════════════════════════════════════
#  Console Output Helpers
# ═══════════════════════════════════════════════════════════════════════

if sys.platform == "win32":
    os.system("")  # enable ANSI escape codes on Windows

class C:
    OK =   "\033[92m"
    WARN = "\033[93m"
    FAIL = "\033[91m"
    CYAN = "\033[96m"
    BOLD = "\033[1m"
    DIM  = "\033[2m"
    END  = "\033[0m"

def step_header(num, total, msg):
    print(f"\n{C.BOLD}{C.CYAN}  [{num}/{total}] {msg}{C.END}")
    print(f"  {'─' * 56}")

def ok(msg):    print(f"    {C.OK}✓{C.END} {msg}")
def warn(msg):  print(f"    {C.WARN}⚠{C.END} {msg}")
def fail(msg):  print(f"    {C.FAIL}✗{C.END} {msg}")
def info(msg):  print(f"    {C.DIM}→{C.END} {msg}")


# ═══════════════════════════════════════════════════════════════════════
#  Utility: Run a subprocess with logging
# ═══════════════════════════════════════════════════════════════════════

def run_cmd(cmd, log, description="", timeout=600, check=True, capture=True,
            env=None, cwd=None):
    """Run a command, log output, return CompletedProcess."""
    if isinstance(cmd, str):
        cmd_str = cmd
    else:
        cmd_str = " ".join(str(c) for c in cmd)

    log.debug(f"CMD: {cmd_str}")
    if description:
        log.debug(f"  Purpose: {description}")

    try:
        result = subprocess.run(
            cmd,
            capture_output=capture,
            text=True,
            timeout=timeout,
            env=env,
            cwd=str(cwd) if cwd else None,
        )
        if result.stdout:
            for line in result.stdout.strip().split("\n")[:50]:
                log.debug(f"  stdout: {line}")
        if result.stderr:
            for line in result.stderr.strip().split("\n")[:50]:
                log.debug(f"  stderr: {line}")
        log.debug(f"  exit code: {result.returncode}")

        if check and result.returncode != 0:
            log.error(f"Command failed (rc={result.returncode}): {cmd_str}")
            if result.stderr:
                log.error(f"  stderr: {result.stderr.strip()[:500]}")
        return result
    except subprocess.TimeoutExpired:
        log.error(f"Command timed out after {timeout}s: {cmd_str}")
        return None
    except FileNotFoundError:
        log.error(f"Command not found: {cmd_str}")
        return None
    except Exception as e:
        log.error(f"Command error: {e}")
        return None


# ═══════════════════════════════════════════════════════════════════════
#  Step 0: User Input — Commander or Worker?
# ═══════════════════════════════════════════════════════════════════════

def ask_role(log):
    """Ask the user for their role. Returns (role, commander_address)."""
    print(f"""
{C.BOLD}  ╔══════════════════════════════════════════════════╗
  ║        ILEICES HPC — Automated Setup             ║
  ╠══════════════════════════════════════════════════╣
  ║                                                  ║
  ║   [1]  COMMANDER  (main control node)            ║
  ║   [2]  WORKER     (compute node)                 ║
  ║                                                  ║
  ╚══════════════════════════════════════════════════╝{C.END}
""")

    while True:
        choice = input("  Enter 1 or 2: ").strip()
        if choice in ("1", "commander"):
            log.info("User selected role: COMMANDER")
            return "commander", None
        elif choice in ("2", "worker"):
            log.info("User selected role: WORKER")
            break
        else:
            print("  Please enter 1 (commander) or 2 (worker)")

    # Worker needs commander address
    print()
    print(f"  {C.BOLD}Enter the commander's IP address.{C.END}")
    print(f"  Example: 192.168.0.241  or  192.168.0.241:7777")
    print()

    while True:
        addr = input("  Commander IP: ").strip()
        if not addr:
            print("  Please enter an IP address.")
            continue

        # Add default port if not specified
        if ":" not in addr:
            addr = f"{addr}:{DEFAULT_PORT}"

        # Validate format
        parts = addr.rsplit(":", 1)
        if len(parts) != 2:
            print("  Invalid format. Use: IP:PORT (e.g. 192.168.0.241:7777)")
            continue
        try:
            port = int(parts[1])
            if not (1 <= port <= 65535):
                raise ValueError
        except ValueError:
            print("  Invalid port number.")
            continue

        log.info(f"Commander address set to: {addr}")
        return "worker", addr


# ═══════════════════════════════════════════════════════════════════════
#  Step 1: Check Python Version
# ═══════════════════════════════════════════════════════════════════════

def check_python_version(log):
    """Verify Python version meets minimum requirement."""
    v = sys.version_info
    log.info(f"Python version: {v.major}.{v.minor}.{v.micro}")

    if (v.major, v.minor) >= MIN_PYTHON:
        ok(f"Python {v.major}.{v.minor}.{v.micro}")
        return True
    else:
        fail(f"Python {v.major}.{v.minor}.{v.micro} — need {MIN_PYTHON[0]}.{MIN_PYTHON[1]}+")
        fail("Please install Python 3.10+ from https://www.python.org/downloads/")
        return False


# ═══════════════════════════════════════════════════════════════════════
#  Step 2: Create Virtual Environment
# ═══════════════════════════════════════════════════════════════════════

def get_venv_python():
    """Get the path to the venv Python executable."""
    if sys.platform == "win32":
        return VENV_DIR / "Scripts" / "python.exe"
    else:
        return VENV_DIR / "bin" / "python"

def get_venv_pip():
    """Get the path to the venv pip executable."""
    if sys.platform == "win32":
        return VENV_DIR / "Scripts" / "pip.exe"
    else:
        return VENV_DIR / "bin" / "pip"

def setup_venv(log):
    """Create virtual environment if it doesn't exist."""
    venv_python = get_venv_python()

    if venv_python.exists():
        # Verify it works
        result = run_cmd(
            [str(venv_python), "--version"],
            log, "Verify existing venv Python"
        )
        if result and result.returncode == 0:
            ok(f"Virtual environment already exists: {VENV_DIR}")
            ok(f"Python: {result.stdout.strip()}")
            log.info("Venv already exists and is functional, skipping creation")
            return True
        else:
            warn("Existing venv is broken — recreating...")
            log.warning("Existing venv Python failed, will recreate")

    info("Creating virtual environment...")
    log.info(f"Creating venv at {VENV_DIR}")

    result = run_cmd(
        [sys.executable, "-m", "venv", str(VENV_DIR)],
        log, "Create virtual environment"
    )
    if result is None or result.returncode != 0:
        fail("Failed to create virtual environment")
        fail(f"Command: {sys.executable} -m venv {VENV_DIR}")
        if result and result.stderr:
            fail(f"Error: {result.stderr.strip()[:200]}")
        return False

    if venv_python.exists():
        ok(f"Virtual environment created: {VENV_DIR}")
        return True
    else:
        fail(f"Venv created but Python not found at expected path: {venv_python}")
        return False


# ═══════════════════════════════════════════════════════════════════════
#  Step 3: Upgrade pip
# ═══════════════════════════════════════════════════════════════════════

def upgrade_pip(log):
    """Upgrade pip inside the venv."""
    venv_python = get_venv_python()
    info("Upgrading pip...")

    result = run_cmd(
        [str(venv_python), "-m", "pip", "install", "--upgrade", "pip"],
        log, "Upgrade pip in venv",
        timeout=120
    )
    if result and result.returncode == 0:
        ok("pip upgraded")
        return True
    else:
        warn("pip upgrade failed — continuing with existing version")
        return True  # Non-fatal


# ═══════════════════════════════════════════════════════════════════════
#  Step 4: Install Core Dependencies
# ═══════════════════════════════════════════════════════════════════════

def install_core_deps(log):
    """Install msgpack, psutil, PyNaCl."""
    venv_python = get_venv_python()
    all_ok = True

    for pkg in CORE_PACKAGES:
        info(f"Installing {pkg}...")
        result = run_cmd(
            [str(venv_python), "-m", "pip", "install", pkg],
            log, f"Install {pkg}",
            timeout=180
        )
        if result and result.returncode == 0:
            ok(f"{pkg} installed")
        else:
            fail(f"{pkg} installation failed")
            all_ok = False

    # Also install from requirements.txt if it exists
    if REQUIREMENTS_FILE.exists():
        info("Installing from requirements.txt...")
        result = run_cmd(
            [str(venv_python), "-m", "pip", "install", "-r", str(REQUIREMENTS_FILE)],
            log, "Install from requirements.txt",
            timeout=180
        )
        if result and result.returncode == 0:
            ok("requirements.txt dependencies installed")
        else:
            warn("Some requirements.txt installs may have failed (continuing)")

    return all_ok


# ═══════════════════════════════════════════════════════════════════════
#  Step 5: Detect GPU + CUDA Version
# ═══════════════════════════════════════════════════════════════════════

def detect_nvidia_gpu(log):
    """
    Detect NVIDIA GPU and CUDA version using nvidia-smi.
    Returns dict with keys: has_gpu, gpu_name, gpu_count, cuda_version,
                            driver_version, cuda_major, cuda_minor
    """
    result_info = {
        "has_gpu": False,
        "gpu_name": "",
        "gpu_count": 0,
        "cuda_version": "",
        "driver_version": "",
        "cuda_major": 0,
        "cuda_minor": 0,
    }

    # Try to find nvidia-smi
    nvidia_smi = shutil.which("nvidia-smi")
    if not nvidia_smi:
        # Check common Windows paths
        common_paths = [
            r"C:\Windows\System32\nvidia-smi.exe",
            r"C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe",
        ]
        for p in common_paths:
            if os.path.exists(p):
                nvidia_smi = p
                break

    if not nvidia_smi:
        log.info("nvidia-smi not found — no NVIDIA GPU detected")
        info("No NVIDIA GPU detected (nvidia-smi not found)")
        return result_info

    log.info(f"Found nvidia-smi at: {nvidia_smi}")

    # Run nvidia-smi to get overview
    result = run_cmd(
        [nvidia_smi], log, "Detect NVIDIA GPU",
        timeout=30, check=False
    )
    if result is None or result.returncode != 0:
        log.warning("nvidia-smi failed")
        warn("nvidia-smi found but failed to run")
        return result_info

    output = result.stdout or ""

    # Parse CUDA version from header line:
    # "| NVIDIA-SMI 537.13       Driver Version: 537.13       CUDA Version: 12.2     |"
    cuda_match = re.search(r"CUDA Version:\s*([\d.]+)", output)
    driver_match = re.search(r"Driver Version:\s*([\d.]+)", output)

    if cuda_match:
        cuda_ver = cuda_match.group(1)
        result_info["cuda_version"] = cuda_ver
        parts = cuda_ver.split(".")
        result_info["cuda_major"] = int(parts[0]) if len(parts) > 0 else 0
        result_info["cuda_minor"] = int(parts[1]) if len(parts) > 1 else 0
        log.info(f"CUDA version: {cuda_ver}")

    if driver_match:
        result_info["driver_version"] = driver_match.group(1)
        log.info(f"Driver version: {result_info['driver_version']}")

    # Run nvidia-smi to get GPU list
    result2 = run_cmd(
        [nvidia_smi, "--query-gpu=name,memory.total,index", "--format=csv,noheader,nounits"],
        log, "Query GPU details",
        timeout=30, check=False
    )
    if result2 and result2.returncode == 0 and result2.stdout.strip():
        lines = [l.strip() for l in result2.stdout.strip().split("\n") if l.strip()]
        result_info["gpu_count"] = len(lines)
        result_info["has_gpu"] = True

        for line in lines:
            parts = [p.strip() for p in line.split(",")]
            if len(parts) >= 2:
                gpu_name = parts[0]
                gpu_mem = parts[1]
                ok(f"GPU: {gpu_name} ({gpu_mem} MB)")
                log.info(f"GPU detected: {gpu_name}, {gpu_mem} MB VRAM")
                if not result_info["gpu_name"]:
                    result_info["gpu_name"] = gpu_name

        if result_info["cuda_version"]:
            ok(f"CUDA Version: {result_info['cuda_version']} (driver: {result_info['driver_version']})")
    else:
        # Fallback: parse main output for GPU info
        gpu_lines = re.findall(r"\|\s+\d+\s+NVIDIA\s+(.+?)\s+\w+\s+\|", output)
        if gpu_lines:
            result_info["has_gpu"] = True
            result_info["gpu_count"] = len(gpu_lines)
            result_info["gpu_name"] = gpu_lines[0].strip()
            ok(f"GPU detected: {result_info['gpu_name']} (x{result_info['gpu_count']})")
        elif "NVIDIA" in output.upper():
            result_info["has_gpu"] = True
            result_info["gpu_count"] = 1
            ok("NVIDIA GPU detected (details unavailable)")

    if not result_info["has_gpu"]:
        info("No NVIDIA GPU detected in nvidia-smi output")

    return result_info


def detect_amd_gpu(log):
    """Detect AMD GPU (ROCm). Returns dict with has_gpu, gpu_name."""
    result_info = {"has_gpu": False, "gpu_name": ""}

    # Check for rocm-smi (Linux only typically)
    rocm_smi = shutil.which("rocm-smi")
    if not rocm_smi:
        return result_info

    result = run_cmd([rocm_smi], log, "Detect AMD GPU", timeout=30, check=False)
    if result and result.returncode == 0 and result.stdout:
        result_info["has_gpu"] = True
        result_info["gpu_name"] = "AMD ROCm GPU"
        ok("AMD ROCm GPU detected")
        log.info("AMD ROCm GPU detected via rocm-smi")

    return result_info


# ═══════════════════════════════════════════════════════════════════════
#  Step 6: Install PyTorch
# ═══════════════════════════════════════════════════════════════════════

def select_pytorch_variant(gpu_info, log):
    """
    Given GPU detection results, select the best PyTorch install command.
    Returns (description, index_url) tuple.
    """
    if gpu_info["has_gpu"] and gpu_info["cuda_major"] > 0:
        cuda_ver = (gpu_info["cuda_major"], gpu_info["cuda_minor"])
        log.info(f"Selecting PyTorch for CUDA {cuda_ver[0]}.{cuda_ver[1]}")

        for min_ver, tag, url in PYTORCH_CUDA_MAP:
            if cuda_ver >= min_ver:
                log.info(f"Selected PyTorch variant: {tag} (index: {url})")
                return f"CUDA {tag}", url

        # CUDA too old for any known wheel
        log.warning(f"CUDA {cuda_ver[0]}.{cuda_ver[1]} is older than any supported PyTorch CUDA build")
        warn(f"CUDA {cuda_ver[0]}.{cuda_ver[1]} is too old for GPU-accelerated PyTorch")
        return "CPU (CUDA too old)", PYTORCH_CPU_URL

    return "CPU-only", PYTORCH_CPU_URL


def check_torch_installed(log):
    """Check if PyTorch is already installed in the venv."""
    venv_python = get_venv_python()
    result = run_cmd(
        [str(venv_python), "-c",
         "import torch; print(torch.__version__); print(torch.cuda.is_available())"],
        log, "Check existing PyTorch",
        timeout=60, check=False
    )
    if result and result.returncode == 0:
        lines = result.stdout.strip().split("\n")
        version = lines[0] if len(lines) > 0 else "unknown"
        cuda = lines[1].strip().lower() == "true" if len(lines) > 1 else False
        return version, cuda
    return None, False


def install_pytorch(gpu_info, log):
    """Install the correct PyTorch variant."""
    venv_python = get_venv_python()

    # Check if already installed
    existing_ver, existing_cuda = check_torch_installed(log)
    if existing_ver:
        ok(f"PyTorch already installed: {existing_ver} (CUDA: {existing_cuda})")
        log.info(f"PyTorch already installed: v{existing_ver}, CUDA={existing_cuda}")

        # Check if it matches what we need
        if gpu_info["has_gpu"] and not existing_cuda:
            warn("GPU detected but PyTorch doesn't have CUDA support.")
            warn("Reinstalling PyTorch with CUDA support...")
            log.info("Reinstalling PyTorch — GPU available but current install is CPU-only")
        elif not gpu_info["has_gpu"] and existing_cuda:
            ok("PyTorch has CUDA but no GPU detected — that's fine, CPU fallback works")
            return True
        else:
            ok("PyTorch variant matches hardware")
            return True

    desc, index_url = select_pytorch_variant(gpu_info, log)
    info(f"Installing PyTorch ({desc})...")
    info(f"Index URL: {index_url}")
    info("This may take several minutes...")

    result = run_cmd(
        [str(venv_python), "-m", "pip", "install", "torch",
         "--index-url", index_url],
        log, f"Install PyTorch ({desc})",
        timeout=900  # 15 minutes — torch is big
    )
    if result and result.returncode == 0:
        # Verify installation
        ver, cuda = check_torch_installed(log)
        if ver:
            ok(f"PyTorch {ver} installed (CUDA: {cuda})")
            return True
        else:
            fail("PyTorch was installed but can't be imported")
            return False
    else:
        fail("PyTorch installation failed")
        fail("You can install it manually later:")
        fail(f"  .venv\\Scripts\\pip install torch --index-url {index_url}")
        return False


# ═══════════════════════════════════════════════════════════════════════
#  Step 7: Run Bootstrap Validation
# ═══════════════════════════════════════════════════════════════════════

def run_bootstrap(log):
    """Run bootstrap.py --check using the venv Python."""
    venv_python = get_venv_python()

    if not BOOTSTRAP_SCRIPT.exists():
        warn(f"bootstrap.py not found at {BOOTSTRAP_SCRIPT}")
        return False

    info("Running bootstrap validation...")
    result = run_cmd(
        [str(venv_python), str(BOOTSTRAP_SCRIPT), "--check"],
        log, "Bootstrap validation",
        timeout=120, check=False, capture=False
    )

    if result and result.returncode == 0:
        ok("Bootstrap validation passed")
        return True
    else:
        warn("Bootstrap reported issues (see output above)")
        return False


# ═══════════════════════════════════════════════════════════════════════
#  Step 8: Run Test Suite
# ═══════════════════════════════════════════════════════════════════════

def run_tests(log):
    """Run the test suite to verify everything works."""
    venv_python = get_venv_python()

    test_modules = [
        "ileices_hpc.tests.test_31_connection",
        "ileices_hpc.tests.test_34_config_benchmark",
    ]

    all_passed = True
    total_tests = 0
    total_failures = 0

    for module in test_modules:
        test_file = SCRIPT_DIR / module.replace(".", os.sep) + ".py"
        if not Path(str(test_file)).exists():
            # Try alternate path resolution
            parts = module.split(".")
            alt_path = SCRIPT_DIR / Path(*parts).with_suffix(".py")
            if not alt_path.exists():
                warn(f"Test module not found: {module}")
                log.warning(f"Test module not found: {module}")
                continue

        info(f"Running {module}...")
        result = run_cmd(
            [str(venv_python), "-m", "pytest", "-x", "-q", "--tb=short",
             "-m", "not slow",
             module.replace(".", "/") + ".py"],
            log, f"Run {module}",
            timeout=120, check=False,
            cwd=SCRIPT_DIR
        )

        # Fallback to unittest if pytest not available
        if result is None or (result.returncode != 0 and "No module named pytest" in (result.stderr or "")):
            log.info("pytest not available, falling back to unittest")
            result = run_cmd(
                [str(venv_python), "-m", "unittest", module, "-v"],
                log, f"Run {module} (unittest)",
                timeout=120, check=False,
                cwd=SCRIPT_DIR
            )

        if result and result.returncode == 0:
            ok(f"{module} — PASSED")
        else:
            warn(f"{module} — some tests may have failed")
            all_passed = False

    return all_passed


# ═══════════════════════════════════════════════════════════════════════
#  Step 9: Generate Node Config
# ═══════════════════════════════════════════════════════════════════════

def get_lan_ip():
    """Get this machine's primary LAN IP."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
        finally:
            s.close()
    except Exception:
        pass

    try:
        hostname = socket.gethostname()
        for info_entry in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info_entry[4][0]
            if not ip.startswith("127."):
                return ip
    except Exception:
        pass

    return "127.0.0.1"


def generate_config(role, commander_address, gpu_info, log):
    """Generate the node configuration file."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    KEY_DIR.mkdir(parents=True, exist_ok=True)

    hostname = platform.node()
    lan_ip = get_lan_ip()

    # Build a descriptive node name
    gpu_short = ""
    if gpu_info["has_gpu"] and gpu_info["gpu_name"]:
        # Shorten GPU name: "NVIDIA GeForce GTX 1660 SUPER" → "GTX-1660-SUPER"
        name = gpu_info["gpu_name"]
        name = re.sub(r"NVIDIA\s*GeForce\s*", "", name)
        name = re.sub(r"NVIDIA\s*", "", name)
        name = name.strip().replace(" ", "-")
        if gpu_info["gpu_count"] > 1:
            gpu_short = f"{name}-x{gpu_info['gpu_count']}"
        else:
            gpu_short = name
    else:
        gpu_short = "cpu"

    node_name = f"{hostname}-{gpu_short}".lower()

    config = {
        "node_name": node_name,
        "role": role,
        "commander_address": commander_address,
        "data_dir": str(DATA_DIR),
        "log_level": "INFO",
        "log_file": str(DATA_DIR / "ileices_agent.log"),
        "mesh": {
            "listen_host": "0.0.0.0",
            "listen_port": DEFAULT_PORT,
            "max_peers": 128,
            "heartbeat_interval_s": 5.0,
            "heartbeat_timeout_s": 15.0,
            "gossip_interval_s": 10.0,
            "message_max_bytes": 67108864,
            "connection_timeout_s": 10.0,
            "reconnect_delay_s": 5.0,
            "max_reconnect_attempts": 20,
        },
        "crypto": {
            "enabled": True,
            "key_dir": str(KEY_DIR),
            "require_auth": True,
        },
        "benchmark": {
            "gpu_warmup_iters": 50,
            "gpu_bench_iters": 200,
            "matrix_size": 4096,
            "disk_test_size_mb": 256,
        },
        "nanopool": {
            "max_gpu_nanos": 50000,
            "max_cpu_nanos": 200000,
            "nano_checkpoint_dir": "nano_checkpoints",
            "checkpoint_interval_steps": 100,
        },
        "training": {
            "default_batch_size": 32,
            "default_lr": 0.001,
            "gradient_compression": "topk",
            "topk_ratio": 0.01,
            "federated_avg_interval_steps": 50,
        },
    }

    # Don't overwrite existing config unless role changed
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE) as f:
                existing = json.load(f)
            if existing.get("role") == role and existing.get("commander_address") == commander_address:
                ok(f"Config already exists with correct role: {CONFIG_FILE}")
                log.info("Existing config matches, not overwriting")
                return True
            else:
                # Backup the old config
                backup = CONFIG_FILE.with_suffix(".json.bak")
                shutil.copy2(CONFIG_FILE, backup)
                ok(f"Backed up previous config to {backup.name}")
                log.info(f"Backed up config to {backup}")
        except Exception as e:
            log.warning(f"Could not read existing config: {e}")

    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)

    ok(f"Config written: {CONFIG_FILE}")
    ok(f"  Node name: {node_name}")
    ok(f"  Role: {role}")
    ok(f"  LAN IP: {lan_ip}")
    if commander_address:
        ok(f"  Commander: {commander_address}")
    log.info(f"Config generated: role={role}, name={node_name}, ip={lan_ip}")

    return True


# ═══════════════════════════════════════════════════════════════════════
#  Step 10: Windows Firewall Rule
# ═══════════════════════════════════════════════════════════════════════

def setup_firewall(log):
    """Attempt to create Windows firewall rule. Non-destructive."""
    if sys.platform != "win32":
        info("Non-Windows system — skip firewall setup (use ufw/iptables manually)")
        return True

    # Check if rule already exists
    result = run_cmd(
        ["powershell", "-Command",
         "Get-NetFirewallRule -DisplayName 'Ileices HPC' -ErrorAction SilentlyContinue | "
         "Select-Object -ExpandProperty DisplayName"],
        log, "Check existing firewall rule",
        timeout=30, check=False
    )

    if result and result.returncode == 0 and "Ileices HPC" in (result.stdout or ""):
        ok("Firewall rule 'Ileices HPC' already exists")
        log.info("Firewall rule already exists")
        return True

    info("Attempting to create firewall rule (may require admin)...")
    info(f"Rule: Allow TCP inbound on port {DEFAULT_PORT}")

    result = run_cmd(
        ["powershell", "-Command",
         f"New-NetFirewallRule -DisplayName 'Ileices HPC' "
         f"-Direction Inbound -Protocol TCP -LocalPort {DEFAULT_PORT} "
         f"-Action Allow -Description 'Ileices HPC mesh communication'"],
        log, "Create firewall rule",
        timeout=30, check=False
    )

    if result and result.returncode == 0:
        ok(f"Firewall rule created: TCP port {DEFAULT_PORT} allowed")
        return True
    else:
        warn("Could not create firewall rule (needs admin privileges)")
        warn("To fix manually, run as Administrator:")
        warn(f"  New-NetFirewallRule -DisplayName 'Ileices HPC' -Direction Inbound "
             f"-Protocol TCP -LocalPort {DEFAULT_PORT} -Action Allow")
        log.warning("Firewall rule creation failed — likely not running as admin")
        return False  # Non-fatal


# ═══════════════════════════════════════════════════════════════════════
#  Step 11: Create Launch Scripts
# ═══════════════════════════════════════════════════════════════════════

def create_launch_scripts(role, commander_address, log):
    """Create easy-to-use launch scripts for this node."""
    venv_python = get_venv_python()

    if sys.platform == "win32":
        launch_bat = SCRIPT_DIR / "LAUNCH.bat"
        if launch_bat.exists():
            ok(f"Launch script already exists: {launch_bat.name}")
            return True

        if role == "commander":
            cmd_line = f'"{venv_python}" -m ileices_hpc --config "{CONFIG_FILE}"'
        else:
            cmd_line = f'"{venv_python}" -m ileices_hpc --config "{CONFIG_FILE}"'

        content = f"""@echo off
title Ileices HPC — {role.upper()}
color 0A
cd /d "{SCRIPT_DIR}"
echo.
echo   Starting Ileices HPC agent ({role})...
echo.
{cmd_line}
echo.
echo   Agent stopped.
pause
"""
        with open(launch_bat, "w") as f:
            f.write(content)
        ok(f"Created {launch_bat.name} — double-click to start the agent")
        log.info(f"Created launch script: {launch_bat}")

    else:
        # Linux/macOS
        launch_sh = SCRIPT_DIR / "launch.sh"
        if launch_sh.exists():
            ok(f"Launch script already exists: {launch_sh.name}")
            return True

        content = f"""#!/bin/bash
cd "$(dirname "$0")"
echo "Starting Ileices HPC agent ({role})..."
"{venv_python}" -m ileices_hpc --config "{CONFIG_FILE}"
"""
        with open(launch_sh, "w") as f:
            f.write(content)
        os.chmod(launch_sh, 0o755)
        ok(f"Created {launch_sh.name} — run ./launch.sh to start")
        log.info(f"Created launch script: {launch_sh}")

    return True


# ═══════════════════════════════════════════════════════════════════════
#  Step 12: Offer to Launch
# ═══════════════════════════════════════════════════════════════════════

def offer_launch(role, log):
    """Ask user if they want to launch the agent now."""
    print()
    print(f"  {C.BOLD}Setup complete! Ready to launch.{C.END}")
    print()

    if role == "commander":
        print(f"  This machine will be the {C.BOLD}COMMANDER{C.END}.")
        print(f"  Other machines should connect to this IP on port {DEFAULT_PORT}.")
    else:
        print(f"  This machine will be a {C.BOLD}WORKER{C.END}.")

    print()
    choice = input("  Launch the agent now? [Y/n]: ").strip().lower()
    if choice in ("", "y", "yes"):
        print()
        info("Launching agent... (close this window to stop)")
        print()
        log.info("User chose to launch agent")

        venv_python = get_venv_python()
        # Switch to exec — replaces this process
        if sys.platform == "win32":
            os.system(f'cd /d "{SCRIPT_DIR}" && "{venv_python}" -m ileices_hpc --config "{CONFIG_FILE}"')
        else:
            os.execv(str(venv_python), [
                str(venv_python), "-m", "ileices_hpc",
                "--config", str(CONFIG_FILE)
            ])
    else:
        ok("Skipping launch.")
        print()
        print(f"  To start later, double-click {C.BOLD}LAUNCH.bat{C.END}")
        print(f"  Or run: .venv\\Scripts\\python -m ileices_hpc --config {CONFIG_FILE}")
        log.info("User chose not to launch")


# ═══════════════════════════════════════════════════════════════════════
#  Hardware Summary
# ═══════════════════════════════════════════════════════════════════════

def detect_hardware_summary(log):
    """Quick hardware summary using only stdlib."""
    info(f"Hostname: {platform.node()}")
    info(f"OS: {platform.system()} {platform.release()}")
    info(f"Architecture: {platform.machine()}")
    info(f"LAN IP: {get_lan_ip()}")

    # CPU info (Windows)
    if platform.system() == "Windows":
        try:
            import winreg
            key = winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE,
                r"HARDWARE\DESCRIPTION\System\CentralProcessor\0"
            )
            cpu_name, _ = winreg.QueryValueEx(key, "ProcessorNameString")
            info(f"CPU: {cpu_name.strip()}")
        except Exception:
            info(f"CPU: {platform.processor() or 'Unknown'}")
    else:
        info(f"CPU: {platform.processor() or 'Unknown'}")

    info(f"CPU cores: {os.cpu_count()}")

    # RAM (cross-platform without psutil)
    if platform.system() == "Windows":
        try:
            result = run_cmd(
                ["wmic", "os", "get", "TotalVisibleMemorySize", "/value"],
                log, "Get RAM info", timeout=10, check=False
            )
            if result and result.stdout:
                match = re.search(r"TotalVisibleMemorySize=(\d+)", result.stdout)
                if match:
                    ram_kb = int(match.group(1))
                    info(f"RAM: {ram_kb / (1024*1024):.1f} GB")
        except Exception:
            pass
    elif os.path.exists("/proc/meminfo"):
        try:
            with open("/proc/meminfo") as f:
                for line in f:
                    if "MemTotal" in line:
                        parts = line.split()
                        ram_kb = int(parts[1])
                        info(f"RAM: {ram_kb / (1024*1024):.1f} GB")
                        break
        except Exception:
            pass

    log.info(f"Hardware: {platform.node()}, {platform.system()}, "
             f"{platform.machine()}, {os.cpu_count()} cores")


# ═══════════════════════════════════════════════════════════════════════
#  MAIN — The Full Pipeline
# ═══════════════════════════════════════════════════════════════════════

def main():
    os.chdir(SCRIPT_DIR)
    log = setup_logging()
    start_time = time.time()

    TOTAL_STEPS = 12
    errors = []

    # ── Parse optional CLI args ──
    parser = argparse.ArgumentParser(description="Ileices HPC Auto-Setup")
    parser.add_argument("--role", choices=["commander", "worker"],
                        help="Skip the role question")
    parser.add_argument("--commander", type=str, default=None,
                        help="Commander address (IP:PORT) for worker mode")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT,
                        help=f"Port to use (default: {DEFAULT_PORT})")
    parser.add_argument("--skip-tests", action="store_true",
                        help="Skip running the test suite")
    parser.add_argument("--skip-launch", action="store_true",
                        help="Don't offer to launch at the end")
    args = parser.parse_args()

    # ── Step 0: Ask Role ──
    if args.role:
        role = args.role
        commander_address = args.commander
        if role == "worker" and not commander_address:
            print()
            addr = input("  Commander IP[:port]: ").strip()
            if ":" not in addr:
                addr = f"{addr}:{DEFAULT_PORT}"
            commander_address = addr
        log.info(f"Role from CLI: {role}, commander: {commander_address}")
    else:
        role, commander_address = ask_role(log)

    # ── Step 1: Python Version ──
    step_header(1, TOTAL_STEPS, "Checking Python Version")
    if not check_python_version(log):
        fail("FATAL: Python version too old. Cannot continue.")
        return 1

    # ── Step 2: Hardware Detection ──
    step_header(2, TOTAL_STEPS, "Detecting Hardware")
    detect_hardware_summary(log)

    # ── Step 3: GPU + CUDA Detection ──
    step_header(3, TOTAL_STEPS, "Detecting GPU & CUDA")
    gpu_info = detect_nvidia_gpu(log)
    if not gpu_info["has_gpu"]:
        amd_info = detect_amd_gpu(log)
        if amd_info["has_gpu"]:
            gpu_info = amd_info
            gpu_info["cuda_major"] = 0
            gpu_info["cuda_minor"] = 0
        else:
            info("No GPU found — will use CPU-only PyTorch")

    # ── Step 4: Create Virtual Environment ──
    step_header(4, TOTAL_STEPS, "Setting Up Virtual Environment")
    if not setup_venv(log):
        fail("FATAL: Cannot create virtual environment. Cannot continue.")
        return 1

    # ── Step 5: Upgrade pip ──
    step_header(5, TOTAL_STEPS, "Upgrading pip")
    upgrade_pip(log)

    # ── Step 6: Install Core Dependencies ──
    step_header(6, TOTAL_STEPS, "Installing Core Dependencies")
    if not install_core_deps(log):
        errors.append("Some core packages failed to install")

    # ── Step 7: Install PyTorch ──
    step_header(7, TOTAL_STEPS, "Installing PyTorch")
    if not install_pytorch(gpu_info, log):
        errors.append("PyTorch installation failed")

    # ── Step 8: Bootstrap Validation ──
    step_header(8, TOTAL_STEPS, "Running Bootstrap Validation")
    if not run_bootstrap(log):
        errors.append("Bootstrap validation reported issues")

    # ── Step 9: Run Tests ──
    if not args.skip_tests:
        step_header(9, TOTAL_STEPS, "Running Test Suite")
        if not run_tests(log):
            errors.append("Some tests did not pass")
    else:
        step_header(9, TOTAL_STEPS, "Running Test Suite (SKIPPED)")
        info("Skipped by --skip-tests flag")

    # ── Step 10: Generate Config ──
    step_header(10, TOTAL_STEPS, "Generating Node Config")
    if not generate_config(role, commander_address, gpu_info, log):
        errors.append("Config generation failed")

    # ── Step 11: Firewall Rule ──
    step_header(11, TOTAL_STEPS, "Firewall Configuration")
    setup_firewall(log)  # Non-fatal

    # ── Step 12: Create Launch Script ──
    step_header(12, TOTAL_STEPS, "Creating Launch Script")
    create_launch_scripts(role, commander_address, log)

    # ── Summary ──
    elapsed = time.time() - start_time
    print()
    print(f"  {'═' * 56}")
    if errors:
        print(f"\n  {C.WARN}{C.BOLD}Setup completed with warnings:{C.END}")
        for err in errors:
            print(f"    {C.WARN}⚠{C.END} {err}")
        log.warning(f"Setup completed with {len(errors)} warnings in {elapsed:.1f}s")
    else:
        print(f"\n  {C.OK}{C.BOLD}Setup completed successfully!{C.END}")
        log.info(f"Setup completed successfully in {elapsed:.1f}s")

    print(f"  {C.DIM}Time: {elapsed:.1f}s | Log: {LOG_FILE.name}{C.END}")
    print(f"  {'═' * 56}")

    # ── Offer Launch ──
    if not args.skip_launch:
        offer_launch(role, log)

    return 1 if errors else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n\n  Setup cancelled by user.")
        sys.exit(130)
    except Exception as e:
        print(f"\n  {C.FAIL}UNEXPECTED ERROR: {e}{C.END}")
        import traceback
        traceback.print_exc()
        print(f"\n  Check {LOG_FILE} for details.")
        sys.exit(1)
