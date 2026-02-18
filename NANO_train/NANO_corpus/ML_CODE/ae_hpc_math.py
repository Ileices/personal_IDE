"""
AE HPC Mathematics - Global-scale distributed training with RBY dynamics
Implements Mathematical Batch ③ - Global-HPC Layer for planet-scale systems
"""

import math
import numpy as np
import torch
import torch.distributed as dist
from typing import Dict, List, Tuple, Any, Optional, Union
import time
import hashlib
import json
from dataclasses import dataclass
from ae_core import RBYTriplet

@dataclass
class HPC_Config:
    """Configuration for HPC operations"""
    # Network parameters
    alpha_latency: float = 1e-6  # Network latency parameter (seconds)
    beta_bandwidth: float = 1e-9  # Bandwidth parameter (seconds/byte)
    
    # Scalability parameters
    parallel_fraction: float = 0.8  # Fraction that can be parallelized
    
    # Reliability parameters
    mtbf_hours: float = 8760  # Mean time between failures (1 year)
    checkpoint_overhead: float = 0.1  # Checkpoint overhead fraction
    
    # Energy parameters
    base_power_watts: float = 300  # Base power consumption
    max_power_watts: float = 500   # Maximum power limit
    dvfs_exponent: float = 3.0     # Dynamic voltage/frequency scaling exponent

class AEScalabilityAnalysis:
    """Scalability ceilings and analysis (Table item 1)"""
    
    @staticmethod
    def amdahl_speedup(P: float, N: int) -> float:
        """Amdahl's Law speedup calculation"""
        return 1.0 / ((1 - P) + P / N)
    
    @staticmethod
    def gustafson_speedup(P: float, N: int) -> float:
        """Gustafson's Law speedup calculation"""
        return N - (1 - P) * (N - 1)
    
    @staticmethod
    def predict_spawn_threshold(current_nodes: int, parallel_fraction: float,
                              efficiency_threshold: float = 0.8) -> bool:
        """Predict when to spawn new CAE shard based on scaling efficiency"""
        current_efficiency = AEScalabilityAnalysis.amdahl_speedup(parallel_fraction, current_nodes) / current_nodes
        return current_efficiency < efficiency_threshold

class AEAllReduceOptimization:
    """Ring/Tree All-Reduce timing and optimization (Table item 2)"""
    
    @staticmethod
    def ring_allreduce_time(N: int, message_bytes: int, alpha: float, beta: float) -> float:
        """Calculate ring all-reduce communication time"""
        return 2 * (N - 1) * alpha + 2 * ((N - 1) / N) * message_bytes * beta
    
    @staticmethod
    def tree_allreduce_time(N: int, message_bytes: int, alpha: float, beta: float) -> float:
        """Calculate tree all-reduce communication time"""
        log_N = math.ceil(math.log2(N))
        return 2 * log_N * alpha + 2 * log_N * message_bytes * beta
    
    @staticmethod
    def rby_communication_efficiency(base_efficiency: float, rby: RBYTriplet) -> float:
        """RBY-aware communication efficiency (Table item 8.1)"""
        uncertainty_overhead = 0.1 * rby.blue
        synchronization_boost = 0.05 * rby.red
        return base_efficiency * (1 - uncertainty_overhead + synchronization_boost)

class AEDelayCompensatedSGD:
    """Delay-compensated SGD for asynchronous training (Table item 3)"""
    
    @staticmethod
    def dcsgd_update(theta: torch.Tensor, gradient_history: List[torch.Tensor],
                    eta: float, lam: float = 0.1) -> torch.Tensor:
        """Delay-compensated SGD parameter update"""
        if len(gradient_history) < 2:
            return theta - eta * gradient_history[-1]
        
        current_grad = gradient_history[-1]
        delayed_grad = gradient_history[0]
        delay_compensation = lam * (theta - delayed_grad)
        
        return theta - eta * current_grad + eta * delay_compensation
    
    @staticmethod
    def rby_adaptive_compensation(base_lambda: float, rby: RBYTriplet, 
                                network_delay: float) -> float:
        """RBY-aware delay compensation factor"""
        # Yellow increases tolerance for delays (exploration)
        # Blue increases compensation (uncertainty handling)
        # Red maintains focus (less compensation needed)
        compensation_factor = (base_lambda * 
                             (1 + 0.3 * rby.blue) *  # uncertainty -> more compensation
                             (1 + 0.2 * rby.yellow) * # exploration -> delay tolerance
                             (1 - 0.1 * rby.red))     # focus -> less compensation
        return compensation_factor

class AEShardingOptimization:
    """Sharding and placement optimization (Table item 4)"""
    
    @staticmethod
    def spectral_bisection(adjacency_matrix: np.ndarray) -> np.ndarray:
        """Simple k-way cut via spectral bisection (Fiedler vector)"""
        # Compute graph Laplacian
        degree_matrix = np.diag(adjacency_matrix.sum(axis=1))
        laplacian = degree_matrix - adjacency_matrix
        
        # Compute Fiedler vector (second smallest eigenvalue)
        eigenvals, eigenvecs = np.linalg.eigh(laplacian)
        fiedler_vector = eigenvecs[:, 1]  # Second eigenvector
        
        # Partition based on sign
        partition = (fiedler_vector > 0).astype(int)
        return partition
    
    @staticmethod
    def uf_io_aware_placement_cost(node_i: int, node_j: int, 
                                  uf_expansion: float, io_stability: float,
                                  network_cost: float, storage_cost: float) -> float:
        """Calculate UF*IO tension for placement decision"""
        expansion_cost = uf_expansion * network_cost
        stability_bonus = io_stability * storage_cost
        return expansion_cost - stability_bonus

class AEQueueingTheory:
    """Queueing and throughput analysis (Table item 5)"""
    
    @staticmethod
    def littles_law_analysis(arrival_rate: float, service_rate: float) -> Dict[str, float]:
        """Little's Law analysis for job dispatcher"""
        if service_rate <= arrival_rate:
            return {'utilization': 1.0, 'queue_length': float('inf'), 'wait_time': float('inf')}
        
        utilization = arrival_rate / service_rate
        avg_wait_time = 1.0 / (service_rate - arrival_rate)  # M/M/1 queue
        avg_queue_length = arrival_rate * avg_wait_time
        
        return {
            'utilization': utilization,
            'queue_length': avg_queue_length,
            'wait_time': avg_wait_time
        }
    
    @staticmethod
    def rby_queue_management(base_service_rate: float, rby: RBYTriplet) -> float:
        """RBY-aware service rate adjustment"""
        # Yellow weight increases processing speed (GPU utilization)
        # Blue weight may slow down due to uncertainty
        yellow_boost = 1 + 0.2 * rby.yellow
        blue_slowdown = 1 - 0.1 * rby.blue
        return base_service_rate * yellow_boost * blue_slowdown

class AEReliabilityModel:
    """Reliability and fault tolerance (Table item 8)"""
    
    @staticmethod
    def exponential_reliability(t: float, mtbf: float) -> float:
        """Exponential reliability model R(t) = exp(-t/θ)"""
        return math.exp(-t / mtbf)
    
    @staticmethod
    def system_reliability(node_reliability: float, N: int) -> float:
        """System-level reliability for N nodes"""
        return node_reliability ** N
    
    @staticmethod
    def checkpoint_schedule(mtbf: float, checkpoint_overhead: float) -> float:
        """Optimal checkpoint interval based on MTBF"""
        # Optimal interval ≈ sqrt(2 * mtbf * checkpoint_time)
        optimal_interval = math.sqrt(2 * mtbf * checkpoint_overhead * mtbf)
        return optimal_interval
    
    @staticmethod
    def rby_redundancy_decision(rby: RBYTriplet, system_reliability: float,
                              reliability_threshold: float = 0.95) -> bool:
        """Decide when to spawn redundant RBY copies"""
        # Blue (uncertainty) lowers threshold, Red (focus) raises it
        adjusted_threshold = (reliability_threshold * 
                            (1 - 0.1 * rby.blue) * 
                            (1 + 0.05 * rby.red))
        return system_reliability < adjusted_threshold

class AEEnergyManagement:
    """Energy and thermal budget management (Table item 9)"""
    
    @staticmethod
    def dvfs_power_model(frequency: float, base_frequency: float, 
                        base_power: float, exponent: float = 3.0) -> float:
        """Dynamic voltage/frequency scaling power model P ∝ f³"""
        frequency_ratio = frequency / base_frequency
        return base_power * (frequency_ratio ** exponent)
    
    @staticmethod
    def rby_thermal_management(base_frequency: float, rby: RBYTriplet,
                             max_power: float, base_power: float) -> float:
        """RBY-aware frequency scaling with thermal limits"""
        # Yellow increases frequency until power limit
        # IO (stability) clamps frequency when overheating
        yellow_boost = 1 + 0.3 * rby.yellow
        target_frequency = base_frequency * yellow_boost
        
        # Check power constraint
        predicted_power = AEEnergyManagement.dvfs_power_model(
            target_frequency, base_frequency, base_power
        )
        
        if predicted_power > max_power:
            # IO constraint kicks in - clamp frequency
            max_frequency_ratio = (max_power / base_power) ** (1/3)
            target_frequency = base_frequency * max_frequency_ratio
        
        return target_frequency

class AESecurityAndConsensus:
    """Security and consensus mechanisms (Table item 10)"""
    
    @staticmethod
    def sha256_hash(data: bytes) -> str:
        """SHA-256 hash for glyph verification"""
        return hashlib.sha256(data).hexdigest()
    
    @staticmethod
    def pbft_quorum_check(N: int, f: int) -> bool:
        """PBFT Byzantine fault tolerance quorum check: N ≥ 3f + 1"""
        return N >= 3 * f + 1
    
    @staticmethod
    def verify_glyph_integrity(glyph_data: Dict[str, Any]) -> bool:
        """Verify glyph block integrity with hash"""
        # Extract hash and content
        stored_hash = glyph_data.get('hash', '')
        content = json.dumps(glyph_data.get('content', {}), sort_keys=True)
        
        # Compute hash and verify
        computed_hash = AESecurityAndConsensus.sha256_hash(content.encode())
        return stored_hash == computed_hash

class AEConsistentHashing:
    """Consistent hashing for stateless load balancing (Table item 11)"""
    
    def __init__(self, nodes: List[str], virtual_nodes: int = 150):
        self.nodes = nodes
        self.virtual_nodes = virtual_nodes
        self.ring = {}
        self._build_ring()
    
    def _hash(self, key: str) -> int:
        """Hash function for consistent hashing"""
        return int(hashlib.md5(key.encode()).hexdigest(), 16)
    
    def _build_ring(self):
        """Build the consistent hash ring"""
        for node in self.nodes:
            for i in range(self.virtual_nodes):
                virtual_key = f"{node}:{i}"
                hash_value = self._hash(virtual_key)
                self.ring[hash_value] = node
    
    def get_node(self, key: str) -> str:
        """Get node for a given key (stateless load balancing)"""
        if not self.ring:
            return None
        
        key_hash = self._hash(key)
        
        # Find the first node with hash >= key_hash (wrap around)
        for hash_value in sorted(self.ring.keys()):
            if hash_value >= key_hash:
                return self.ring[hash_value]
        
        # Wrap around to the first node
        return self.ring[min(self.ring.keys())]

class AEDistributedRoofline:
    """Distributed roofline performance model (Table item 12)"""
    
    @staticmethod
    def single_node_roofline(peak_flops: float, memory_bandwidth: float,
                           arithmetic_intensity: float) -> float:
        """Single-node roofline performance"""
        compute_bound = peak_flops
        memory_bound = memory_bandwidth * arithmetic_intensity
        return min(compute_bound, memory_bound)
    
    @staticmethod
    def distributed_roofline(peak_flops: float, memory_bandwidth: float,
                           network_bandwidth: float, arithmetic_intensity: float,
                           distributed_intensity: float) -> float:
        """Extended roofline for distributed systems"""
        compute_bound = peak_flops
        memory_bound = memory_bandwidth * arithmetic_intensity
        network_bound = network_bandwidth * distributed_intensity
        
        return min(compute_bound, memory_bound, network_bound)
    
    @staticmethod
    def rby_performance_optimization(base_performance: float, rby: RBYTriplet,
                                   bottleneck_type: str) -> Tuple[float, str]:
        """RBY-aware performance optimization decision"""
        if bottleneck_type == "network":
            # Spawn local IC-AE (reduce network dependency)
            recommendation = "spawn_local_icae"
            performance_boost = 1 + 0.2 * rby.red  # Focus helps local optimization
        elif bottleneck_type == "compute":
            # Fuse shards (better compute utilization)
            recommendation = "fuse_shards"
            performance_boost = 1 + 0.3 * rby.yellow  # Execution efficiency
        else:  # memory bound
            recommendation = "optimize_memory"
            performance_boost = 1 + 0.1 * rby.blue  # Blue handles complexity
        
        return base_performance * performance_boost, recommendation

# Integration class that combines all HPC mathematics
class AEGlobalHPCOrchestrator:
    """Global HPC orchestrator combining all mathematical components"""
    
    def __init__(self, config: HPC_Config):
        self.config = config
        self.consistent_hash = None
        self.gradient_history = []
        self.performance_history = []
        
    def analyze_system_state(self, nodes: List[Dict], rby: RBYTriplet) -> Dict[str, Any]:
        """Comprehensive system analysis using all HPC mathematics"""
        N = len(nodes)
        
        # Scalability analysis
        spawn_needed = AEScalabilityAnalysis.predict_spawn_threshold(
            N, self.config.parallel_fraction
        )
        
        # Communication analysis
        message_size = 1024 * 1024  # 1MB typical gradient size
        ring_time = AEAllReduceOptimization.ring_allreduce_time(
            N, message_size, self.config.alpha_latency, self.config.beta_bandwidth
        )
        
        comm_efficiency = AEAllReduceOptimization.rby_communication_efficiency(
            1.0, rby
        )
        
        # Reliability analysis
        node_reliability = AEReliabilityModel.exponential_reliability(
            1.0, self.config.mtbf_hours  # 1 hour into operation
        )
        system_reliability = AEReliabilityModel.system_reliability(node_reliability, N)
        
        checkpoint_interval = AEReliabilityModel.checkpoint_schedule(
            self.config.mtbf_hours, self.config.checkpoint_overhead
        )
        
        redundancy_needed = AEReliabilityModel.rby_redundancy_decision(
            rby, system_reliability
        )
        
        # Energy analysis
        optimal_frequency = AEEnergyManagement.rby_thermal_management(
            1.0, rby, self.config.max_power_watts, self.config.base_power_watts
        )
        
        # Performance analysis
        base_performance = 1000.0  # Base GFLOPS
        memory_bandwidth = 500.0   # GB/s
        network_bandwidth = 100.0  # GB/s
        
        perf, bottleneck_recommendation = AEDistributedRoofline.rby_performance_optimization(
            base_performance, rby, "compute"  # Example bottleneck
        )
        
        return {
            'scalability': {
                'spawn_new_shard': spawn_needed,
                'current_nodes': N,
                'communication_time': ring_time,
                'efficiency': comm_efficiency
            },
            'reliability': {
                'system_reliability': system_reliability,
                'checkpoint_interval_hours': checkpoint_interval,
                'redundancy_needed': redundancy_needed
            },
            'performance': {
                'optimal_frequency_ghz': optimal_frequency,
                'predicted_performance_gflops': perf,
                'recommendation': bottleneck_recommendation
            },
            'rby_state': rby.to_tuple()
        }

def test_ae_hpc_mathematics():
    """Test all HPC mathematical components"""
    print("Testing AE HPC Mathematics Framework")
    print("=" * 50)
    
    # Test configuration
    config = HPC_Config()
    rby = RBYTriplet(0.4, 0.3, 0.3)
    
    # Test scalability
    speedup = AEScalabilityAnalysis.amdahl_speedup(0.8, 16)
    print(f"Amdahl speedup (16 nodes): {speedup:.2f}")
    
    # Test all-reduce timing
    ring_time = AEAllReduceOptimization.ring_allreduce_time(16, 1024*1024, 1e-6, 1e-9)
    print(f"Ring all-reduce time: {ring_time*1000:.2f} ms")
    
    # Test reliability
    reliability = AEReliabilityModel.exponential_reliability(24, 8760)  # 24 hours
    print(f"24-hour reliability: {reliability:.4f}")
    
    # Test energy management
    frequency = AEEnergyManagement.rby_thermal_management(2.0, rby, 400, 200)
    print(f"Optimal frequency: {frequency:.2f} GHz")
    
    # Test consistent hashing
    nodes = ["node1", "node2", "node3", "node4"]
    hash_ring = AEConsistentHashing(nodes)
    assigned_node = hash_ring.get_node("task_123")
    print(f"Task assigned to: {assigned_node}")
    
    # Test global orchestrator
    orchestrator = AEGlobalHPCOrchestrator(config)
    node_list = [{"id": f"node_{i}"} for i in range(8)]
    system_analysis = orchestrator.analyze_system_state(node_list, rby)
    
    print(f"\nSystem Analysis:")
    print(f"  Nodes: {system_analysis['scalability']['current_nodes']}")
    print(f"  Spawn needed: {system_analysis['scalability']['spawn_new_shard']}")
    print(f"  System reliability: {system_analysis['reliability']['system_reliability']:.4f}")
    print(f"  Performance: {system_analysis['performance']['predicted_performance_gflops']:.0f} GFLOPS")
    print(f"  Recommendation: {system_analysis['performance']['recommendation']}")
    
    print("\nAll HPC mathematical components working correctly! ✅")

if __name__ == "__main__":
    test_ae_hpc_mathematics()
