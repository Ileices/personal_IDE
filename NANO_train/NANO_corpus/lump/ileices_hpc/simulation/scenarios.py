"""
Pre-built simulation scenarios for testing different conditions.
"""
from .sim_mesh import SimConfig


def lan_scenario() -> SimConfig:
    """Simulate your home LAN: 3-5 machines, reliable network."""
    return SimConfig(
        num_nodes=5,
        tier_distribution={
            'NANO': 0.0,
            'EDGE': 0.40,   # 2 edge machines
            'CORE': 0.60,   # 3 core machines (1660s, 3090)
            'ULTRA': 0.0,
        },
        duration_hours=2.0,
        job_arrival_rate=5.0,
        nanos_per_job=50,
        steps_per_job=100,
        redundancy_factor=1,   # No redundancy needed on LAN
        byzantine_fraction=0.0,
        packet_loss_rate=0.0,
    )


def small_community() -> SimConfig:
    """50-node community mesh — hobbyist cluster."""
    return SimConfig(
        num_nodes=50,
        tier_distribution={
            'NANO': 0.30,
            'EDGE': 0.35,
            'CORE': 0.30,
            'ULTRA': 0.05,
        },
        duration_hours=24.0,
        job_arrival_rate=20.0,
        nanos_per_job=100,
        steps_per_job=200,
        redundancy_factor=2,
        byzantine_fraction=0.02,
        packet_loss_rate=0.005,
    )


def city_scale() -> SimConfig:
    """1000-node city-scale mesh."""
    return SimConfig(
        num_nodes=1000,
        tier_distribution={
            'NANO': 0.45,
            'EDGE': 0.30,
            'CORE': 0.20,
            'ULTRA': 0.05,
        },
        duration_hours=24.0,
        job_arrival_rate=100.0,
        nanos_per_job=200,
        steps_per_job=500,
        redundancy_factor=2,
        byzantine_fraction=0.03,
        packet_loss_rate=0.01,
    )


def global_scale() -> SimConfig:
    """10,000-node global mesh — the target."""
    return SimConfig(
        num_nodes=10000,
        tier_distribution={
            'NANO': 0.50,
            'EDGE': 0.25,
            'CORE': 0.20,
            'ULTRA': 0.05,
        },
        duration_hours=24.0,
        time_step_minutes=5.0,  # Coarser steps for performance
        job_arrival_rate=500.0,
        nanos_per_job=500,
        steps_per_job=1000,
        redundancy_factor=3,
        byzantine_fraction=0.05,
        packet_loss_rate=0.02,
        corruption_rate=0.001,
    )


def adversarial() -> SimConfig:
    """Hostile environment: many byzantine nodes, high failure rate."""
    return SimConfig(
        num_nodes=200,
        tier_distribution={
            'NANO': 0.40,
            'EDGE': 0.30,
            'CORE': 0.25,
            'ULTRA': 0.05,
        },
        duration_hours=12.0,
        job_arrival_rate=30.0,
        nanos_per_job=100,
        steps_per_job=200,
        redundancy_factor=3,
        byzantine_fraction=0.15,  # 15% malicious!
        packet_loss_rate=0.05,    # 5% packet loss
        corruption_rate=0.01,     # 1% data corruption
    )


def catastrophic_recovery() -> SimConfig:
    """Test recovery from mass node failure."""
    return SimConfig(
        num_nodes=100,
        tier_distribution={
            'NANO': 0.30,
            'EDGE': 0.30,
            'CORE': 0.30,
            'ULTRA': 0.10,
        },
        duration_hours=4.0,
        time_step_minutes=0.5,
        job_arrival_rate=15.0,
        nanos_per_job=50,
        steps_per_job=100,
        redundancy_factor=2,
        byzantine_fraction=0.0,
        packet_loss_rate=0.0,
    )


SCENARIOS = {
    'lan': lan_scenario,
    'community': small_community,
    'city': city_scale,
    'global': global_scale,
    'adversarial': adversarial,
    'catastrophic': catastrophic_recovery,
}
