"""Build script for native Vulkan/OpenCL compute extensions."""
import os, sys, subprocess, platform
from pathlib import Path

NATIVE_DIR = Path(__file__).parent


def build_vulkan():
    """Build the Vulkan compute library."""
    src = NATIVE_DIR / "nano_vulkan.c"
    if not src.exists():
        print(f"Source not found: {src}")
        return False

    vulkan_sdk = os.environ.get("VULKAN_SDK", "")
    has_vulkan = bool(vulkan_sdk) and Path(vulkan_sdk).exists()

    defines = ["-DHAS_VULKAN"] if has_vulkan else []
    include_dirs = [f"-I{vulkan_sdk}/Include"] if has_vulkan else []
    link_libs = []

    if platform.system() == "Windows":
        out = NATIVE_DIR / "nano_vulkan.dll"
        if has_vulkan:
            link_libs = [f"/link", f"{vulkan_sdk}/Lib/vulkan-1.lib"]
        
        # Try MSVC first
        try:
            cmd = ["cl", "/LD", "/O2"] + defines + include_dirs + [str(src)]
            cmd += [f"/Fe:{out}"] + link_libs
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if result.returncode == 0:
                print(f"Built {out} (MSVC)")
                return True
        except FileNotFoundError:
            pass

        # Try gcc/MinGW
        try:
            cmd = ["gcc", "-shared", "-fPIC", "-O2"] + defines + include_dirs
            cmd += [str(src), "-o", str(out)]
            if has_vulkan:
                cmd += [f"-L{vulkan_sdk}/Lib", "-lvulkan-1"]
            cmd += ["-lm"]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if result.returncode == 0:
                print(f"Built {out} (GCC)")
                return True
            else:
                print(f"GCC build failed: {result.stderr}")
        except FileNotFoundError:
            pass

    elif platform.system() == "Darwin":
        out = NATIVE_DIR / "libnano_vulkan.dylib"
        cmd = ["gcc", "-shared", "-fPIC", "-O2"] + defines + include_dirs
        cmd += [str(src), "-o", str(out), "-lm"]
        if has_vulkan:
            cmd += [f"-L{vulkan_sdk}/lib", "-lvulkan"]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            print(f"Built {out}")
            return True

    else:  # Linux
        out = NATIVE_DIR / "libnano_vulkan.so"
        cmd = ["gcc", "-shared", "-fPIC", "-O2"] + defines + include_dirs
        cmd += [str(src), "-o", str(out), "-lm"]
        if has_vulkan:
            cmd += ["-lvulkan"]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            print(f"Built {out}")
            return True

    print("Native build failed — fake_cuda will use CPU fallback")
    return False


if __name__ == "__main__":
    print("Building native compute extensions...")
    ok = build_vulkan()
    sys.exit(0 if ok else 1)
