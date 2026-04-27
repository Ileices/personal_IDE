"""
Simulated Node — models a machine in the global HPC mesh.
Does NOT do real computation — models time costs mathematically.
"""
import random
from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


class Tier(str, Enum):
    NANO = "NANO"
    EDGE = "EDGE"  
    CORE = "CORE"
    ULTRA = "ULTRA"


# Realistic hardware profiles for simulation
TIER_PROFILES = {
    Tier.NANO: {
        'tflops_range': (0.05, 0.5),     # CPU-only
        'ram_mb_range': (2048, 8192),
        'vram_mb': 0,
        'bandwidth_mbps_range': (10, 100),
        'uptime_range': (0.3, 0.7),        # Flaky
        'latency_ms_range': (20, 200),
    },
    Tier.EDGE: {
        'tflops_range': (1.0, 5.0),        # Small GPU
        'ram_mb_range': (8192, 16384),
        'vram_mb_range': (2048, 6144),
        'bandwidth_mbps_range': (50, 500),
        'uptime_range': (0.5, 0.85),
        'latency_ms_range': (10, 100),
    },
    Tier.CORE: {
        'tflops_range': (5.0, 30.0),       # RTX 3060-3090 range
        'ram_mb_range': (16384, 65536),
        'vram_mb_range': (8192, 24576),
        'bandwidth_mbps_range': (100, 1000),
        'uptime_range': (0.7, 0.95),
        'latency_ms_range': (5, 50),
    },
    Tier.ULTRA: {
        'tflops_range': (30.0, 312.0),     # A100/H100
        'ram_mb_range': (65536, 524288),
        'vram_mb_range': (40960, 81920),
        'bandwidth_mbps_range': (1000, 100000),
        'uptime_range': (0.95, 0.999),
        'latency_ms_range': (1, 10),
    },
}


@dataclass
class SimulatedNode:
    """A simulated machine in the global HPC mesh."""
    node_id: str
    tier: Tier
    
    # Compute
    tflops: float = 0.0           # FP32 TFLOPS
    ram_mb: int = 0
    vram_mb: int = 0
    
    # Network
    bandwidth_mbps: float = 0.0   # Uplink bandwidth
    base_latency_ms: float = 0.0  # Base latency to nearest backbone
    
    # Reliability
    uptime: float = 1.0           # Fraction of time online (0-1)
    is_byzantine: bool = False    # Intentionally malicious?
    failure_rate: float = 0.0     # Probability of failure per hour
    
    # State
    is_online: bool = True
    nanos_hosted: int = 0
    compute_used: float = 0.0     # TFLOPS-hours used
    data_transferred_mb: float = 0.0
    reputation: float = 0.5
    
    # Geographic position (for latency modeling)
    geo_x: float = 0.0           # Abstract 2D position
    geo_y: float = 0.0
    
    @classmethod
    def random(cls, node_id: str, tier: Tier) -> 'SimulatedNode':
        """Generate a random node with realistic specs for its tier."""
        profile = TIER_PROFILES[tier]
        
        tflops = random.uniform(*profile['tflops_range'])
        ram_mb = random.randint(*profile['ram_mb_range'])
        
        if 'vram_mb_range' in profile:
            vram_mb = random.randint(*profile['vram_mb_range'])
        else:
            vram_mb = profile.get('vram_mb', 0)
        
        return cls(
            node_id=node_id,
            tier=tier,
            tflops=tflops,
            ram_mb=ram_mb,
            vram_mb=vram_mb,
            bandwidth_mbps=random.uniform(*profile['bandwidth_mbps_range']),
            base_latency_ms=random.uniform(*profile['latency_ms_range']),
            uptime=random.uniform(*profile['uptime_range']),
            failure_rate=random.uniform(0.001, 0.05) if tier in (Tier.NANO, Tier.EDGE) else random.uniform(0.0001, 0.01),
            geo_x=random.uniform(-180, 180),
            geo_y=random.uniform(-90, 90),
        )
    
    @property
    def max_nanos(self) -> int:
        """How many nanos this node can host (based on VRAM/RAM)."""
        # Each nano ~ 200KB. GPU nanos in VRAM, CPU nanos in RAM.
        nano_size_kb = 200
        gpu_nanos = (self.vram_mb * 1024) // nano_size_kb if self.vram_mb > 0 else 0
        cpu_nanos = (self.ram_mb * 1024 // 4) // nano_size_kb  # Use 25% of RAM for CPU nanos
        return gpu_nanos + cpu_nanos
    
    def compute_time_s(self, flops_required: float) -> float:
        """Time to compute a given number of FLOPs."""
        if self.tflops <= 0:
            return float('inf')
        return flops_required / (self.tflops * 1e12)
    
    def transfer_time_s(self, size_mb: float, remote_latency_ms: float = 0) -> float:
        """Time to transfer data to/from this node."""
        latency_s = (self.base_latency_ms + remote_latency_ms) / 1000.0
        transfer_s = (size_mb * 8) / self.bandwidth_mbps  # Convert MB to Mbits
        return latency_s + transfer_s
    
    def check_failure(self, hours_elapsed: float) -> bool:
        """Check if this node fails during the given time period."""
        # Poisson process: P(failure) ≈ 1 - e^(-rate * time)
        import math
        p_fail = 1 - math.exp(-self.failure_rate * hours_elapsed)
        if random.random() < p_fail:
            self.is_online = False
            return True
        return False
    
    def check_churn(self) -> bool:
        """Check if this node goes offline due to normal churn (user turns off PC)."""
        if random.random() > self.uptime:
            self.is_online = False
            return True
        if not self.is_online and random.random() < self.uptime:
            self.is_online = True
        return False
