"""Import validation — checks that all NANO_train modules import cleanly."""
import sys, os, traceback

# Add NANO_train to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

results = {"ok": [], "fail": []}

modules_to_test = [
    "config",
    "core",
    "core.rby",
    "core.ptaie",
    "core.ae",
    "core.crypto",
    "core.ic_ae",
    "core.lifecycle",
    "core.compression",
    "core.fitness",
    "core.storage",
    "nanos.base",
]

for mod in modules_to_test:
    try:
        __import__(mod)
        results["ok"].append(mod)
        print(f"  ✓ {mod}")
    except Exception as e:
        results["fail"].append((mod, str(e)))
        print(f"  ✗ {mod}: {e}")

# Try importing the nano registry (triggers all @register_nano)
print("\nTesting full nano registry import...")
try:
    from nanos import NANO_REGISTRY
    print(f"  ✓ NANO_REGISTRY: {len(NANO_REGISTRY)} nano types registered")
    results["ok"].append(f"NANO_REGISTRY ({len(NANO_REGISTRY)} nanos)")
except Exception as e:
    print(f"  ✗ NANO_REGISTRY: {e}")
    traceback.print_exc()
    results["fail"].append(("NANO_REGISTRY", str(e)))

# Test orchestrator
print("\nTesting orchestrator...")
for mod in ["orchestrator.ripple", "orchestrator.message_bus", "orchestrator.scheduler",
            "orchestrator.pipeline", "orchestrator.load_balancer"]:
    try:
        __import__(mod)
        results["ok"].append(mod)
        print(f"  ✓ {mod}")
    except Exception as e:
        results["fail"].append((mod, str(e)))
        print(f"  ✗ {mod}: {e}")

# Test mesh
print("\nTesting mesh...")
for mod in ["mesh.node", "mesh.latency", "mesh.respect"]:
    try:
        __import__(mod)
        results["ok"].append(mod)
        print(f"  ✓ {mod}")
    except Exception as e:
        results["fail"].append((mod, str(e)))
        print(f"  ✗ {mod}: {e}")

# Test server, training, scanner
print("\nTesting server/training/scanner...")
for mod in ["server.main", "training.trainer", "scanner.ae_scanner"]:
    try:
        __import__(mod)
        results["ok"].append(mod)
        print(f"  ✓ {mod}")
    except Exception as e:
        results["fail"].append((mod, str(e)))
        print(f"  ✗ {mod}: {e}")

print(f"\n{'='*50}")
print(f"Results: {len(results['ok'])} passed, {len(results['fail'])} failed")
if results["fail"]:
    print("Failures:")
    for mod, err in results["fail"]:
        print(f"  {mod}: {err}")
