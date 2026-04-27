#!/usr/bin/env python3
"""
Ileices HPC - Bootstrap Script
Validates environment, installs dependencies, verifies hardware.

Usage:
    python bootstrap.py              # Full setup
    python bootstrap.py --check      # Verify-only mode (no installs)
    python bootstrap.py --force      # Force reinstall all packages
"""
import sys
import os
import platform
import subprocess
import shutil
import argparse
import json
from pathlib import Path

# ─── Constants ───────────────────────────────────────────────────────────────
MIN_PYTHON = (3, 10)
REQUIRED_PACKAGES = ["msgpack", "psutil", "nacl"]  # import names
PIP_PACKAGES = ["msgpack", "psutil", "PyNaCl"]     # pip names
OPTIONAL_PACKAGES = {"torch": "PyTorch (GPU training)"}
DATA_DIR = "ileices_data"
KEY_DIR = ".ileices_keys"

# ─── Colors ──────────────────────────────────────────────────────────────────
class C:
    if sys.platform == "win32":
        os.system("")  # enable ANSI on Windows
    OK = "\033[92m"
    WARN = "\033[93m"
    FAIL = "\033[91m"
    BOLD = "\033[1m"
    END = "\033[0m"

def ok(msg):    print(f"  {C.OK}[OK]{C.END}   {msg}")
def warn(msg):  print(f"  {C.WARN}[WARN]{C.END} {msg}")
def fail(msg):  print(f"  {C.FAIL}[FAIL]{C.END} {msg}")
def info(msg):  print(f"  [INFO] {msg}")
def header(msg): print(f"\n{C.BOLD}{'─'*60}\n  {msg}\n{'─'*60}{C.END}")


def check_python():
    """Verify Python version."""
    header("Python Environment")
    v = sys.version_info
    if (v.major, v.minor) >= MIN_PYTHON:
        ok(f"Python {v.major}.{v.minor}.{v.micro}")
    else:
        fail(f"Python {v.major}.{v.minor}.{v.micro} — need {MIN_PYTHON[0]}.{MIN_PYTHON[1]}+")
        return False

    # Check if we're in a venv
    in_venv = hasattr(sys, 'real_prefix') or (
        hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix
    )
    if in_venv:
        ok(f"Virtual environment active: {sys.prefix}")
    else:
        warn("Not in a virtual environment. Recommended: python -m venv .venv")

    ok(f"Executable: {sys.executable}")
    return True


def check_packages(check_only=False, force=False):
    """Check and optionally install required packages."""
    header("Required Packages")
    all_ok = True

    for imp_name, pip_name in zip(REQUIRED_PACKAGES, PIP_PACKAGES):
        try:
            mod = __import__(imp_name)
            version = getattr(mod, '__version__', getattr(mod, 'VERSION', '?'))
            ok(f"{pip_name} ({version})")
        except ImportError:
            if check_only:
                fail(f"{pip_name} — NOT INSTALLED")
                all_ok = False
            else:
                info(f"Installing {pip_name}...")
                result = subprocess.run(
                    [sys.executable, "-m", "pip", "install", pip_name],
                    capture_output=True, text=True
                )
                if result.returncode == 0:
                    ok(f"{pip_name} installed successfully")
                else:
                    fail(f"{pip_name} install failed: {result.stderr.strip()}")
                    all_ok = False

    if force and not check_only:
        info("Force reinstalling all packages...")
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "--force-reinstall"] + PIP_PACKAGES,
            capture_output=True, text=True
        )
        ok("Force reinstall complete")

    # Check optional
    header("Optional Packages")
    for imp_name, desc in OPTIONAL_PACKAGES.items():
        try:
            mod = __import__(imp_name)
            version = getattr(mod, '__version__', '?')
            ok(f"{desc}: {version}")
            if imp_name == "torch":
                import torch
                if torch.cuda.is_available():
                    for i in range(torch.cuda.device_count()):
                        name = torch.cuda.get_device_name(i)
                        props = torch.cuda.get_device_properties(i)
                        mem = getattr(props, 'total_memory', getattr(props, 'total_mem', 0)) / (1024**3)
                        ok(f"  GPU {i}: {name} ({mem:.1f} GB)")
                else:
                    warn("  CUDA not available — CPU-only mode")
        except ImportError:
            warn(f"{desc}: not installed (training will not work)")

    return all_ok


def check_network():
    """Verify network configuration."""
    header("Network")
    import socket

    hostname = socket.gethostname()
    ok(f"Hostname: {hostname}")

    # Get LAN IPs
    try:
        ips = []
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if ip not in ips and not ip.startswith("127."):
                ips.append(ip)
        if ips:
            for ip in ips:
                ok(f"LAN IP: {ip}")
        else:
            # Fallback
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            try:
                s.connect(("8.8.8.8", 80))
                ip = s.getsockname()[0]
                ok(f"LAN IP: {ip}")
            finally:
                s.close()
    except Exception as e:
        warn(f"Could not determine LAN IP: {e}")

    # Check default port
    port = 7777
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind(("0.0.0.0", port))
        ok(f"Port {port} available")
    except OSError:
        warn(f"Port {port} already in use — you'll need to pick another port")
    finally:
        sock.close()

    return True


def check_hardware():
    """Quick hardware survey."""
    header("Hardware")

    try:
        import psutil
        cpu_count = psutil.cpu_count(logical=False)
        cpu_logical = psutil.cpu_count(logical=True)
        mem = psutil.virtual_memory()
        ok(f"CPU: {cpu_count} cores ({cpu_logical} threads)")
        ok(f"RAM: {mem.total / (1024**3):.1f} GB ({mem.available / (1024**3):.1f} GB free)")

        # Disk
        disk = psutil.disk_usage(os.path.splitdrive(os.getcwd())[0] + os.sep if sys.platform == "win32" else "/")
        ok(f"Disk: {disk.free / (1024**3):.1f} GB free / {disk.total / (1024**3):.1f} GB total")
    except ImportError:
        warn("psutil not installed — skipping hardware check")

    return True


def setup_directories():
    """Create required directories."""
    header("Directories")

    for d in [DATA_DIR, KEY_DIR]:
        path = Path(d)
        path.mkdir(parents=True, exist_ok=True)
        ok(f"Created: {path}")

    return True


def check_ileices_package():
    """Verify ileices_hpc package is importable."""
    header("Ileices HPC Package")

    try:
        import ileices_hpc
        ok("ileices_hpc package importable")
    except ImportError:
        fail("ileices_hpc package not found — make sure you're in the right directory")
        return False

    # Check submodules
    modules = [
        "ileices_hpc.mesh.protocol",
        "ileices_hpc.mesh.server",
        "ileices_hpc.mesh.client",
        "ileices_hpc.mesh.peer_discovery",
        "ileices_hpc.mesh.gossip",
        "ileices_hpc.crypto.identity",
        "ileices_hpc.crypto.encryption",
        "ileices_hpc.agent.config",
        "ileices_hpc.agent.hardware_benchmark",
        "ileices_hpc.agent.command_handler",
        "ileices_hpc.agent.main",
    ]
    for mod_name in modules:
        try:
            __import__(mod_name)
            ok(f"  {mod_name}")
        except Exception as e:
            fail(f"  {mod_name}: {e}")
            return False

    return True


def generate_config_template():
    """Generate a sample config file."""
    header("Config Template")
    config_path = Path(DATA_DIR) / "config_template.json"
    if config_path.exists():
        ok(f"Config template already exists: {config_path}")
        return True

    try:
        from ileices_hpc.agent.config import AgentConfig
        from dataclasses import asdict
        config = AgentConfig()
        config_path.parent.mkdir(parents=True, exist_ok=True)
        with open(config_path, "w") as f:
            json.dump(asdict(config), f, indent=2)
        ok(f"Config template written: {config_path}")
    except Exception as e:
        warn(f"Could not generate config template: {e}")

    return True


def print_summary(results):
    """Print final summary."""
    header("Summary")
    all_pass = all(results.values())

    for check, passed in results.items():
        status = f"{C.OK}PASS{C.END}" if passed else f"{C.FAIL}FAIL{C.END}"
        print(f"  {status}  {check}")

    print()
    if all_pass:
        print(f"  {C.OK}{C.BOLD}All checks passed! Ready to run.{C.END}")
        print()
        print("  Quick start:")
        print("    Commander:  python -m ileices_hpc --role commander --port 7777")
        print("    Worker:     python -m ileices_hpc --role worker --commander <IP>:7777")
        print()
    else:
        print(f"  {C.FAIL}{C.BOLD}Some checks failed. Fix the issues above before running.{C.END}")
        print()

    return all_pass


def main():
    parser = argparse.ArgumentParser(description="Ileices HPC Bootstrap")
    parser.add_argument("--check", action="store_true", help="Verify-only mode (no installs)")
    parser.add_argument("--force", action="store_true", help="Force reinstall all packages")
    args = parser.parse_args()

    print(f"\n{C.BOLD}  Ileices HPC Bootstrap v1.0{C.END}")
    print(f"  Platform: {platform.system()} {platform.release()} ({platform.machine()})")
    print(f"  CWD: {os.getcwd()}")

    results = {}

    results["Python"] = check_python()
    results["Packages"] = check_packages(check_only=args.check, force=args.force)
    results["Network"] = check_network()
    results["Hardware"] = check_hardware()
    results["Directories"] = setup_directories()
    results["Package Import"] = check_ileices_package()
    results["Config Template"] = generate_config_template()

    return 0 if print_summary(results) else 1


if __name__ == "__main__":
    sys.exit(main())
