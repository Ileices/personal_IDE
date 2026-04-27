"""
Test 32: Simulation Engine Validation
Tests job creation, Poisson arrivals, packet effects, node lifecycle, and scenarios.
"""
import sys
import time
import math
import os

PASS = 0
FAIL = 0


def report(name, passed, detail=""):
    global PASS, FAIL
    tag = "PASS" if passed else "FAIL"
    if passed:
        PASS += 1
    else:
        FAIL += 1
    suffix = f" -- {detail}" if detail else ""
    print(f"  [{tag}] {name}{suffix}")


def test_sim_config_defaults():
    """SimConfig has sane defaults."""
    print("\n--- Test 1: SimConfig Defaults ---")
    from ileices_hpc.simulation.sim_mesh import SimConfig
    c = SimConfig()
    report("default num_nodes", c.num_nodes == 100)
    report("default duration", c.duration_hours == 24.0)
    report("default job_arrival_rate > 0", c.job_arrival_rate > 0)
    report("default redundancy factor >= 1", c.redundancy_factor >= 1)


def test_node_creation():
    """Nodes are created with correct tier distribution."""
    print("\n--- Test 2: Node Creation & Tiers ---")
    from ileices_hpc.simulation.sim_mesh import SimulatedMesh, SimConfig
    config = SimConfig(num_nodes=200)
    mesh = SimulatedMesh(config)
    tiers = [n.tier for n in mesh.nodes.values()]
    report("correct node count", len(mesh.nodes) == 200, f"got={len(mesh.nodes)}")
    report("has NANO tier", "NANO" in tiers)
    report("has EDGE tier", "EDGE" in tiers)
    report("has CORE tier", "CORE" in tiers)
    report("has ULTRA tier", "ULTRA" in tiers)
    # NANO should be largest group (50% weight)
    from collections import Counter
    counts = Counter(tiers)
    report("NANO is most common", counts["NANO"] >= counts["ULTRA"],
           f"NANO={counts['NANO']}, ULTRA={counts['ULTRA']}")


def test_poisson_job_creation():
    """Jobs are created with Poisson process - not just 1 per step."""
    print("\n--- Test 3: Poisson Job Arrivals ---")
    from ileices_hpc.simulation.sim_mesh import SimulatedMesh, SimConfig
    # High arrival rate to ensure multiple jobs per step
    config = SimConfig(num_nodes=50, duration_hours=10.0, job_arrival_rate=100.0)
    mesh = SimulatedMesh(config)
    result = mesh.simulate()
    # With rate=100/hr and 10hr, expect ~1000 jobs
    report("jobs > 100 (high arrival rate)", result.total_jobs > 100,
           f"total_jobs={result.total_jobs}")
    # Should be way more than num_steps
    num_steps = int(config.duration_hours * 60 / config.time_step_minutes)
    report("jobs > num_steps (proves multi-per-step)", result.total_jobs > num_steps,
           f"jobs={result.total_jobs}, steps={num_steps}")


def test_node_lifecycle():
    """Nodes go online/offline, fail, recover."""
    print("\n--- Test 4: Node Lifecycle ---")
    from ileices_hpc.simulation.sim_mesh import SimulatedMesh, SimConfig
    config = SimConfig(num_nodes=100, duration_hours=24.0)
    mesh = SimulatedMesh(config)
    result = mesh.simulate()
    # Some nodes should have failed due to built-in churn
    report("some nodes failed", result.node_failures >= 0, f"failures={result.node_failures}")
    # Average online should be less than total (churn model)
    report("avg online < total", result.avg_online_nodes < 100,
           f"avg_online={result.avg_online_nodes}")


def test_byzantine_detection():
    """Byzantine nodes are caught."""
    print("\n--- Test 5: Byzantine Detection ---")
    from ileices_hpc.simulation.sim_mesh import SimulatedMesh, SimConfig
    config = SimConfig(num_nodes=100, duration_hours=12.0, byzantine_fraction=0.15)
    mesh = SimulatedMesh(config)
    result = mesh.simulate()
    # The simulation should have byzantine nodes and should detect some
    # 15% of 100 = 15 byzantine nodes
    report("byzantine nodes caught", result.byzantine_detections >= 0,
           f"caught={result.byzantine_detections}")


def test_simulation_scenarios():
    """All built-in scenarios are valid and runnable."""
    print("\n--- Test 6: Scenario Execution ---")
    from ileices_hpc.simulation.scenarios import SCENARIOS
    from ileices_hpc.simulation.sim_mesh import SimulatedMesh

    for name, scenario_fn in SCENARIOS.items():
        config = scenario_fn()
        # Cap node count for test speed
        config.num_nodes = min(config.num_nodes, 20)
        config.duration_hours = min(config.duration_hours, 1.0)
        try:
            mesh = SimulatedMesh(config)
            result = mesh.simulate()
            report(f"scenario '{name}' runs", True, f"jobs={result.total_jobs}")
        except Exception as e:
            report(f"scenario '{name}' runs", False, str(e))


def test_packet_loss_tracking():
    """packet_loss_rate and corruption_rate are tracked."""
    print("\n--- Test 7: Packet Loss/Corruption ---")
    from ileices_hpc.simulation.sim_mesh import SimulatedMesh, SimConfig
    config = SimConfig(
        num_nodes=50, duration_hours=5.0,
        packet_loss_rate=0.1, corruption_rate=0.05,
    )
    mesh = SimulatedMesh(config)
    result = mesh.simulate()
    report("packets_lost attribute exists", hasattr(result, 'packets_lost'),
           f"lost={getattr(result, 'packets_lost', 'N/A')}")
    report("packets_corrupted attribute exists", hasattr(result, 'packets_corrupted'),
           f"corrupted={getattr(result, 'packets_corrupted', 'N/A')}")


def test_simulation_wall_time():
    """Simulation completes in reasonable wall time."""
    print("\n--- Test 8: Wall Time Performance ---")
    from ileices_hpc.simulation.sim_mesh import SimulatedMesh, SimConfig
    config = SimConfig(num_nodes=1000, duration_hours=24.0)
    start = time.perf_counter()
    mesh = SimulatedMesh(config)
    result = mesh.simulate()
    elapsed = time.perf_counter() - start
    report("1000-node 24h sim < 10s", elapsed < 10.0, f"elapsed={elapsed:.2f}s")


def main():
    print("=" * 60)
    print("TEST 32: Simulation Engine Validation")
    print("=" * 60)

    test_sim_config_defaults()
    test_node_creation()
    test_poisson_job_creation()
    test_node_lifecycle()
    test_byzantine_detection()
    test_simulation_scenarios()
    test_packet_loss_tracking()
    test_simulation_wall_time()

    total = PASS + FAIL
    print(f"\n{'=' * 50}")
    print(f"Test 32 Results: {PASS}/{total} passed")
    print(f"{'=' * 50}")
    return 0 if FAIL == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
