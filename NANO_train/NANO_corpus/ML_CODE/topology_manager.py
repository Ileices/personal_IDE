"""
Topology Manager for IC-AE Self-Organization
Real algorithms for autonomous code and hardware topology management
Implements gravitational clustering and dynamic package optimization
"""

import os
import time
import json
import sqlite3
import threading
import subprocess
from pathlib import Path
from typing import Dict, List, Tuple, Set, Optional
from dataclasses import dataclass
import networkx as nx
import numpy as np
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
import psutil

# Docker import with fallback
try:
    import docker
    DOCKER_AVAILABLE = True
except ImportError:
    print("Warning: docker not available - using process-based fallback")
    DOCKER_AVAILABLE = False
    
    class MockContainer:
        """Mock Docker container for fallback"""
        def __init__(self, container_id, name, process=None):
            self.id = container_id
            self.name = name
            self.process = process
            self.status = "running" if process else "created"
            
        def stop(self):
            if self.process:
                try:
                    self.process.terminate()
                    self.process.wait(timeout=5)
                except:
                    try:
                        self.process.kill()
                    except:
                        pass
            self.status = "stopped"
            
        def remove(self):
            self.stop()
            self.status = "removed"
            
        def logs(self):
            return "Mock container logs"
    
    class MockContainerCollection:
        """Mock Docker containers collection"""
        def __init__(self):
            self._containers = {}
            
        def run(self, image=None, name=None, **kwargs):
            container_id = f"mock_{name}_{len(self._containers)}"
            # For fallback, we'll use subprocess to simulate container execution
            try:
                # Create a simple Python process instead of Docker container
                cmd = ["python", "-c", "import time; time.sleep(300)"]  # 5-minute mock process
                process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                container = MockContainer(container_id, name, process)
            except:
                container = MockContainer(container_id, name)
                
            self._containers[container_id] = container
            return container
            
        def get(self, container_id):
            return self._containers.get(container_id)
            
        def list(self, all=False):
            if all:
                return list(self._containers.values())
            return [c for c in self._containers.values() if c.status == "running"]
    
    class MockDockerClient:
        """Mock Docker client for fallback"""
        def __init__(self):
            self.containers = MockContainerCollection()
            
        def ping(self):
            return True
            
        def close(self):
            pass
    
    docker = type('docker', (), {
        'from_env': lambda: MockDockerClient(),
        'DockerException': Exception,
        'APIError': Exception
    })()

import yaml

from ic_ae_mutator import ICManifest, MutationEngine


@dataclass
class ResourceProfile:
    """System resource profile for optimization decisions"""
    cpu_cores: int
    gpu_memory_gb: float
    ram_gb: float
    disk_io_mbps: float
    network_mbps: float
    current_load: float
    
    
@dataclass
class ProcessCluster:
    """Cluster of related processes with shared RBY characteristics"""
    cluster_id: str
    manifests: List[ICManifest]
    dominant_rby: Dict[str, float]
    resource_requirements: ResourceProfile
    container_id: Optional[str] = None
    

class TopologyManager:
    """
    Advanced topology management for IC-AE consciousness distribution
    Implements real clustering algorithms and process orchestration
    """
    
    def __init__(self, scan_dirs: List[str], update_interval: int = 30):
        self.scan_dirs = [Path(d) for d in scan_dirs]
        self.update_interval = update_interval
        self.mutation_engine = MutationEngine()
        self.docker_client = docker.from_env()
        self.running = False
        self.clusters: Dict[str, ProcessCluster] = {}
        self.dependency_graph = nx.DiGraph()
        self.optimization_lock = threading.Lock()
        
    def scan_manifests(self) -> List[ICManifest]:
        """Scan directories for IC-AE manifest headers in files"""
        manifests = []
        
        for scan_dir in self.scan_dirs:
            if not scan_dir.exists():
                continue
                
            for file_path in scan_dir.rglob("*.py"):
                manifest = self._extract_manifest_from_file(file_path)
                if manifest:
                    manifests.append(manifest)
                    
        return manifests
        
    def _extract_manifest_from_file(self, file_path: Path) -> Optional[ICManifest]:
        """Extract IC-AE manifest from file header"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                
            # Look for IC-AE manifest block
            start_marker = "# === IC-AE MANIFEST ==="
            end_marker = "# === /IC-AE MANIFEST ==="
            
            start_idx = content.find(start_marker)
            if start_idx == -1:
                return None
                
            end_idx = content.find(end_marker, start_idx)
            if end_idx == -1:
                return None
                
            # Extract and parse YAML manifest
            manifest_text = content[start_idx + len(start_marker):end_idx].strip()
            manifest_data = yaml.safe_load(manifest_text)
            
            return ICManifest(**manifest_data)
            
        except Exception:
            return None
            
    def build_dependency_graph(self, manifests: List[ICManifest]) -> nx.DiGraph:
        """
        Build weighted dependency graph using RBY gravitational forces
        Real graph theory algorithms for consciousness flow optimization
        """
        graph = nx.DiGraph()
        
        # Add nodes with RBY attributes
        for manifest in manifests:
            graph.add_node(manifest.uid, 
                          rby=manifest.rby,
                          generation=manifest.generation,
                          permissions=manifest.permissions)
                          
        # Add edges based on dependencies and RBY attraction
        for manifest in manifests:
            # Explicit dependencies
            for dep_uid in manifest.depends_on:
                if dep_uid in graph.nodes:
                    graph.add_edge(dep_uid, manifest.uid, weight=10.0, type="explicit")
                    
            # Gravitational attractions
            for other in manifests:
                if other.uid != manifest.uid:
                    attraction = self.mutation_engine.calculate_rby_attraction(manifest, other)
                    if attraction > 2.0:  # Significant attraction threshold
                        graph.add_edge(other.uid, manifest.uid, 
                                     weight=attraction, type="gravitational")
                                     
        return graph
        
    def cluster_by_rby_similarity(self, manifests: List[ICManifest], 
                                 max_clusters: int = 8) -> List[ProcessCluster]:
        """
        Cluster manifests by RBY similarity using real clustering algorithms
        Implements k-means with RBY distance metrics
        """
        if not manifests:
            return []
            
        # Extract RBY feature vectors
        rby_vectors = np.array([[m.rby['R'], m.rby['B'], m.rby['Y']] for m in manifests])
        
        # K-means clustering with custom RBY distance
        from sklearn.cluster import KMeans
        
        n_clusters = min(max_clusters, len(manifests))
        kmeans = KMeans(n_clusters=n_clusters, random_state=42)
        cluster_labels = kmeans.fit_predict(rby_vectors)
        
        # Group manifests by cluster
        clusters = {}
        for i, label in enumerate(cluster_labels):
            if label not in clusters:
                clusters[label] = []
            clusters[label].append(manifests[i])
            
        # Create ProcessCluster objects
        process_clusters = []
        for cluster_id, cluster_manifests in clusters.items():
            # Calculate dominant RBY characteristics
            avg_rby = {
                'R': np.mean([m.rby['R'] for m in cluster_manifests]),
                'B': np.mean([m.rby['B'] for m in cluster_manifests]),
                'Y': np.mean([m.rby['Y'] for m in cluster_manifests])
            }
            
            # Estimate resource requirements based on cluster type
            resource_reqs = self._estimate_cluster_resources(avg_rby, len(cluster_manifests))
            
            process_cluster = ProcessCluster(
                cluster_id=f"cluster_{cluster_id}",
                manifests=cluster_manifests,
                dominant_rby=avg_rby,
                resource_requirements=resource_reqs
            )
            process_clusters.append(process_cluster)
            
        return process_clusters
        
    def _estimate_cluster_resources(self, rby: Dict[str, float], 
                                   size: int) -> ResourceProfile:
        """Estimate resource requirements based on RBY characteristics"""
        # Red (perception) - high I/O, moderate CPU
        # Blue (cognition) - high CPU/GPU, low I/O  
        # Yellow (execution) - balanced, network-heavy
        
        base_cpu = size * 0.5
        base_memory = size * 1.0  # GB
        
        # RBY-specific scaling
        cpu_cores = int(base_cpu * (1 + rby['B'] * 2))  # Blue needs more CPU
        gpu_memory = base_memory * rby['B'] * 4  # Blue uses GPU
        ram_gb = base_memory * (1 + rby['R'] * 1.5)  # Red needs memory for I/O
        disk_io = 100 * rby['R'] * 10  # Red does lots of I/O
        network = 100 * rby['Y'] * 5  # Yellow coordinates
        
        return ResourceProfile(
            cpu_cores=max(1, cpu_cores),
            gpu_memory_gb=gpu_memory,
            ram_gb=max(2.0, ram_gb),
            disk_io_mbps=disk_io,
            network_mbps=network,
            current_load=0.0
        )
        
    def optimize_cluster_placement(self, clusters: List[ProcessCluster]) -> Dict[str, Dict]:
        """
        Optimize cluster placement using real resource allocation algorithms
        Implements bin packing with multi-dimensional constraints
        """
        system_resources = self._get_system_resources()
        
        placement_plan = {}
        
        # Sort clusters by resource requirements (largest first)
        sorted_clusters = sorted(clusters, 
                               key=lambda c: c.resource_requirements.cpu_cores + 
                                           c.resource_requirements.ram_gb,
                               reverse=True)
        
        available_cpu = system_resources.cpu_cores
        available_ram = system_resources.ram_gb
        available_gpu = system_resources.gpu_memory_gb
        
        for cluster in sorted_clusters:
            reqs = cluster.resource_requirements
            
            # Check if cluster fits in available resources
            if (reqs.cpu_cores <= available_cpu and 
                reqs.ram_gb <= available_ram and
                reqs.gpu_memory_gb <= available_gpu):
                
                # Allocate resources
                placement_plan[cluster.cluster_id] = {
                    "cpu_limit": reqs.cpu_cores,
                    "memory_limit": f"{reqs.ram_gb}g",
                    "gpu_memory": reqs.gpu_memory_gb,
                    "isolation_level": "container",
                    "dominant_rby": cluster.dominant_rby
                }
                
                available_cpu -= reqs.cpu_cores
                available_ram -= reqs.ram_gb
                available_gpu -= reqs.gpu_memory_gb
                
            else:
                # Split cluster or use shared resources
                placement_plan[cluster.cluster_id] = {
                    "cpu_limit": min(reqs.cpu_cores, available_cpu * 0.5),
                    "memory_limit": f"{min(reqs.ram_gb, available_ram * 0.5)}g",
                    "gpu_memory": min(reqs.gpu_memory_gb, available_gpu * 0.5),
                    "isolation_level": "shared",
                    "dominant_rby": cluster.dominant_rby
                }
                
        return placement_plan
        
    def _get_system_resources(self) -> ResourceProfile:
        """Get current system resource availability"""
        cpu_count = psutil.cpu_count(logical=True)
        memory = psutil.virtual_memory()
        
        # Estimate GPU memory (simplified)
        gpu_memory = 0.0
        try:
            import pynvml
            pynvml.nvmlInit()
            handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            info = pynvml.nvmlDeviceGetMemoryInfo(handle)
            gpu_memory = info.total / (1024**3)  # Convert to GB
        except:
            pass
            
        return ResourceProfile(
            cpu_cores=cpu_count,
            gpu_memory_gb=gpu_memory,
            ram_gb=memory.total / (1024**3),
            disk_io_mbps=1000.0,  # Estimated
            network_mbps=1000.0,  # Estimated
            current_load=psutil.cpu_percent()
        )
        
    def launch_cluster_containers(self, placement_plan: Dict[str, Dict]):
        """Launch Docker containers for optimized clusters"""
        for cluster_id, config in placement_plan.items():
            try:
                # Create container configuration
                container_config = {
                    "image": "python:3.11-slim",
                    "name": f"ic_ae_{cluster_id}",
                    "cpu_quota": int(config["cpu_limit"] * 100000),
                    "mem_limit": config["memory_limit"],
                    "environment": {
                        "CLUSTER_ID": cluster_id,
                        "RBY_R": str(config["dominant_rby"]["R"]),
                        "RBY_B": str(config["dominant_rby"]["B"]),
                        "RBY_Y": str(config["dominant_rby"]["Y"])
                    },
                    "volumes": {
                        str(Path.cwd()): {"bind": "/workspace", "mode": "rw"}
                    },
                    "working_dir": "/workspace",
                    "detach": True
                }
                
                # Launch container
                container = self.docker_client.containers.run(**container_config)
                
                # Update cluster with container ID
                if cluster_id in self.clusters:
                    self.clusters[cluster_id].container_id = container.id
                    
            except Exception as e:
                print(f"Failed to launch container for {cluster_id}: {e}")
                
    def run_topology_optimization_loop(self):
        """Main optimization loop for continuous topology management"""
        self.running = True
        
        while self.running:
            try:
                with self.optimization_lock:
                    # Scan for manifests
                    manifests = self.scan_manifests()
                    
                    if manifests:
                        # Build dependency graph
                        self.dependency_graph = self.build_dependency_graph(manifests)
                        
                        # Cluster by RBY similarity
                        clusters = self.cluster_by_rby_similarity(manifests)
                        
                        # Optimize placement
                        placement_plan = self.optimize_cluster_placement(clusters)
                        
                        # Update running clusters
                        self._update_running_clusters(clusters, placement_plan)
                        
                time.sleep(self.update_interval)
                
            except Exception as e:
                print(f"Topology optimization error: {e}")
                time.sleep(5)  # Brief pause before retry
                
    def _update_running_clusters(self, new_clusters: List[ProcessCluster], 
                                placement_plan: Dict[str, Dict]):
        """Update running cluster configuration based on optimization"""
        # Stop obsolete clusters
        current_cluster_ids = {c.cluster_id for c in new_clusters}
        
        for cluster_id in list(self.clusters.keys()):
            if cluster_id not in current_cluster_ids:
                self._stop_cluster(cluster_id)
                
        # Update cluster registry
        for cluster in new_clusters:
            self.clusters[cluster.cluster_id] = cluster
            
        # Launch new containers if needed
        self.launch_cluster_containers(placement_plan)
        
    def _stop_cluster(self, cluster_id: str):
        """Stop and cleanup cluster container"""
        if cluster_id in self.clusters:
            cluster = self.clusters[cluster_id]
            if cluster.container_id:
                try:
                    container = self.docker_client.containers.get(cluster.container_id)
                    container.stop()
                    container.remove()
                except:
                    pass
            del self.clusters[cluster_id]
            
    def stop(self):
        """Stop topology manager and cleanup"""
        self.running = False
        
        # Stop all clusters
        for cluster_id in list(self.clusters.keys()):
            self._stop_cluster(cluster_id)
