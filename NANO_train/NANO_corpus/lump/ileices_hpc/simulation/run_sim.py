"""
Run simulation scenarios from the command line.

Usage:
    python -m ileices_hpc.simulation.run_sim --scenario lan
    python -m ileices_hpc.simulation.run_sim --scenario global
    python -m ileices_hpc.simulation.run_sim --scenario adversarial
    python -m ileices_hpc.simulation.run_sim --nodes 500 --hours 12
"""
import argparse
import logging
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from ileices_hpc.simulation.sim_mesh import SimulatedMesh, SimConfig
from ileices_hpc.simulation.scenarios import SCENARIOS


def main():
    parser = argparse.ArgumentParser(description="Ileices HPC Mesh Simulator")
    parser.add_argument('--scenario', choices=list(SCENARIOS.keys()),
                        help='Pre-built scenario to run')
    parser.add_argument('--nodes', type=int, default=None,
                        help='Number of nodes (overrides scenario)')
    parser.add_argument('--hours', type=float, default=None,
                        help='Simulation duration in hours')
    parser.add_argument('--verbose', '-v', action='store_true',
                        help='Verbose logging')
    args = parser.parse_args()
    
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format='%(asctime)s [%(name)s] %(levelname)s: %(message)s',
        datefmt='%H:%M:%S',
    )
    
    # Build config
    if args.scenario:
        config = SCENARIOS[args.scenario]()
        print(f"Running scenario: {args.scenario}")
    else:
        config = SimConfig()
    
    if args.nodes:
        config.num_nodes = args.nodes
    if args.hours:
        config.duration_hours = args.hours
    
    # Show config
    print(f"  Nodes:     {config.num_nodes}")
    tiers = {k: int(v * config.num_nodes) for k, v in config.tier_distribution.items()}
    print(f"  Tiers:     {tiers}")
    print(f"  Duration:  {config.duration_hours}h")
    print(f"  Job rate:  {config.job_arrival_rate}/h")
    print(f"  Byzantine: {config.byzantine_fraction*100:.1f}%")
    print(f"  Redundancy:{config.redundancy_factor}x")
    print()
    
    # Run simulation
    mesh = SimulatedMesh(config)
    result = mesh.simulate()
    result.print_summary()
    
    return result


if __name__ == '__main__':
    main()
