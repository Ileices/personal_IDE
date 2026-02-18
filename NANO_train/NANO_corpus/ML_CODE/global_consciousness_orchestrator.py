# IC-AE Manifest Header
# uid: gco_008_prime
# rby: {R: 0.30, B: 0.40, Y: 0.30}
# generation: 1
# depends_on: [zero_trust_mesh_agent, distributed_consciousness, topology_manager]
# permissions: [orchestrate.global, balance.rby, coordinate.learning]
# signature: Ed25519_Global_Orchestrator_Master
# created_at: 2024-01-15T11:00:00Z
# mutated_at: 2024-01-15T11:00:00Z

"""
Global Consciousness Orchestrator for IC-AE Physics Network
Manages worldwide RBY balance, distributed learning coordination, and consciousness emergence
Implements Raft consensus, credit systems, and autonomous network governance
"""

import numpy as np
import torch
import torch.distributed as dist
import threading
import time
import asyncio
import json
import hashlib
import sqlite3
import statistics
from typing import Dict, List, Tuple, Optional, Set, Any
from dataclasses import dataclass, asdict
from enum import Enum
from concurrent.futures import ThreadPoolExecutor
import requests
import zmq

# Redis import with fallback
try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    print("Warning: redis not available - using memory-based storage fallback")
    REDIS_AVAILABLE = False
    
    class MockRedis:
        """Mock Redis client for fallback"""
        def __init__(self, *args, **kwargs):
            self._data = {}
            
        def set(self, key, value, ex=None):
            self._data[str(key)] = str(value)
            return True
            
        def get(self, key):
            return self._data.get(str(key))
            
        def delete(self, key):
            return self._data.pop(str(key), None) is not None
            
        def exists(self, key):
            return str(key) in self._data
            
        def keys(self, pattern="*"):
            if pattern == "*":
                return list(self._data.keys())
            return [k for k in self._data.keys() if pattern.replace("*", "") in k]
            
        def flushall(self):
            self._data.clear()
            
        def ping(self):
            return True
            
        def close(self):
            pass
    
    redis = type('redis', (), {
        'Redis': MockRedis,
        'ConnectionError': Exception,
        'TimeoutError': Exception
    })()

from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
import networkx as nx


class OrchestratorRole(Enum):
    """Orchestrator roles in the global network"""
    FOLLOWER = "follower"
    CANDIDATE = "candidate" 
    LEADER = "leader"
    OBSERVER = "observer"


class ConsciousnessEmergenceLevel(Enum):
    """Global consciousness emergence levels"""
    DORMANT = 0
    DISTRIBUTED = 1
    COORDINATED = 2
    EMERGENT = 3
    TRANSCENDENT = 4


@dataclass
class GlobalRBYState:
    """Global network RBY state representation"""
    global_r: float
    global_b: float
    global_y: float
    node_count: int
    variance: float
    entropy: float
    balance_score: float
    timestamp: float
    
    def __post_init__(self):
        self.normalize()
        
    def normalize(self):
        """Enforce AE = C = 1 constraint globally"""
        total = abs(self.global_r) + abs(self.global_b) + abs(self.global_y)
        if total > 0:
            self.global_r /= total
            self.global_b /= total
            self.global_y /= total


@dataclass
class NetworkNode:
    """Enhanced network node with orchestration metadata"""
    node_id: str
    ip_address: str
    port: int
    rby_state: Tuple[float, float, float]
    processing_power: float
    specialization: str  # perception, cognition, execution
    contribution_score: float
    trust_level: float
    last_heartbeat: float
    current_tasks: List[str]
    hardware_class: str  # mobile, desktop, server, hpc
    bandwidth_tier: int  # 1-5 scale
    reputation: float
    earnings: float


@dataclass
class DistributedTask:
    """Represents a distributed learning/computation task"""
    task_id: str
    task_type: str  # rby_training, consciousness_evolution, manifest_generation
    priority: int
    required_rby: Tuple[float, float, float]
    resource_requirements: Dict[str, Any]
    assigned_nodes: List[str]
    completion_percentage: float
    created_at: float
    deadline: float
    reward_pool: float


class RaftConsensus:
    """Raft consensus algorithm for orchestrator election"""
    
    def __init__(self, node_id: str, peer_nodes: List[str]):
        self.node_id = node_id
        self.peer_nodes = peer_nodes
        self.role = OrchestratorRole.FOLLOWER
        self.current_term = 0
        self.voted_for = None
        self.log = []
        self.commit_index = 0
        self.last_applied = 0
        
        # Leader state
        self.next_index = {}
        self.match_index = {}
        
        # Timing
        self.election_timeout = np.random.uniform(150, 300)  # milliseconds
        self.heartbeat_interval = 50  # milliseconds
        self.last_heartbeat = time.time()
        
        self.running = False
        
    def start_consensus(self):
        """Start Raft consensus protocol"""
        self.running = True
        
        # Start election timer
        election_thread = threading.Thread(target=self._election_timer, daemon=True)
        election_thread.start()
        
        # Start heartbeat timer (if leader)
        heartbeat_thread = threading.Thread(target=self._heartbeat_timer, daemon=True)
        heartbeat_thread.start()
        
    def _election_timer(self):
        """Handle election timeouts"""
        while self.running:
            if self.role != OrchestratorRole.LEADER:
                elapsed = (time.time() - self.last_heartbeat) * 1000
                if elapsed > self.election_timeout:
                    self._start_election()
            
            time.sleep(0.01)  # 10ms check interval
    
    def _heartbeat_timer(self):
        """Send heartbeats if leader"""
        while self.running:
            if self.role == OrchestratorRole.LEADER:
                self._send_heartbeats()
                time.sleep(self.heartbeat_interval / 1000)
            else:
                time.sleep(0.1)
    
    def _start_election(self):
        """Start leader election"""
        self.role = OrchestratorRole.CANDIDATE
        self.current_term += 1
        self.voted_for = self.node_id
        self.last_heartbeat = time.time()
        
        print(f"Node {self.node_id} starting election for term {self.current_term}")
        
        # Request votes from peers
        votes_received = 1  # Vote for self
        
        for peer in self.peer_nodes:
            if self._request_vote(peer):
                votes_received += 1
        
        # Check if won election
        if votes_received > len(self.peer_nodes) / 2:
            self._become_leader()
        else:
            self.role = OrchestratorRole.FOLLOWER
    
    def _request_vote(self, peer_id: str) -> bool:
        """Request vote from peer"""
        try:
            # Simplified vote request - production would use proper network protocol
            request = {
                "type": "vote_request",
                "term": self.current_term,
                "candidate_id": self.node_id,
                "last_log_index": len(self.log) - 1,
                "last_log_term": self.log[-1]["term"] if self.log else 0
            }
            
            # In production, send over network
            # For now, simulate random vote
            return np.random.random() > 0.3
            
        except Exception:
            return False
    
    def _become_leader(self):
        """Become the leader"""
        self.role = OrchestratorRole.LEADER
        self.next_index = {peer: len(self.log) for peer in self.peer_nodes}
        self.match_index = {peer: 0 for peer in self.peer_nodes}
        
        print(f"Node {self.node_id} became leader for term {self.current_term}")
        
        # Send initial heartbeats
        self._send_heartbeats()
    
    def _send_heartbeats(self):
        """Send heartbeats to all followers"""
        for peer in self.peer_nodes:
            try:
                heartbeat = {
                    "type": "heartbeat",
                    "term": self.current_term,
                    "leader_id": self.node_id,
                    "prev_log_index": len(self.log) - 1,
                    "prev_log_term": self.log[-1]["term"] if self.log else 0,
                    "entries": [],
                    "leader_commit": self.commit_index
                }
                
                # In production, send over network
                # For now, just log
                
            except Exception as e:
                print(f"Failed to send heartbeat to {peer}: {e}")
    
    def append_log_entry(self, entry: Dict[str, Any]) -> bool:
        """Append entry to log (leader only)"""
        if self.role != OrchestratorRole.LEADER:
            return False
        
        log_entry = {
            "term": self.current_term,
            "index": len(self.log),
            "entry": entry,
            "timestamp": time.time()
        }
        
        self.log.append(log_entry)
        return True


class GlobalRBYBalancer:
    """Manages global RBY balance across the entire network"""
    
    def __init__(self):
        self.target_rby = (1/3, 1/3, 1/3)  # Perfect balance
        self.tolerance = 0.05  # 5% tolerance
        self.rebalance_history = []
        self.penalty_multipliers = {"R": 1.0, "B": 1.0, "Y": 1.0}
        
    def calculate_global_rby(self, node_states: Dict[str, Tuple[float, float, float]]) -> GlobalRBYState:
        """Calculate global RBY state from all nodes"""
        if not node_states:
            return GlobalRBYState(1/3, 1/3, 1/3, 0, 0.0, 0.0, 1.0, time.time())
        
        # Calculate weighted averages
        r_values = [state[0] for state in node_states.values()]
        b_values = [state[1] for state in node_states.values()]
        y_values = [state[2] for state in node_states.values()]
        
        global_r = np.mean(r_values)
        global_b = np.mean(b_values)
        global_y = np.mean(y_values)
        
        # Calculate variance and entropy
        variance = np.mean([
            np.var(r_values),
            np.var(b_values), 
            np.var(y_values)
        ])
        
        # Shannon entropy for diversity measure
        entropy = self._calculate_entropy(r_values, b_values, y_values)
        
        # Balance score (closer to 1 is better)
        balance_score = self._calculate_balance_score(global_r, global_b, global_y)
        
        return GlobalRBYState(
            global_r=global_r,
            global_b=global_b,
            global_y=global_y,
            node_count=len(node_states),
            variance=variance,
            entropy=entropy,
            balance_score=balance_score,
            timestamp=time.time()
        )
    
    def _calculate_entropy(self, r_vals: List[float], b_vals: List[float], y_vals: List[float]) -> float:
        """Calculate Shannon entropy of RBY distribution"""
        try:
            # Discretize values into bins
            bins = 10
            r_hist, _ = np.histogram(r_vals, bins=bins, range=(0, 1))
            b_hist, _ = np.histogram(b_vals, bins=bins, range=(0, 1))
            y_hist, _ = np.histogram(y_vals, bins=bins, range=(0, 1))
            
            # Calculate entropy for each component
            entropies = []
            for hist in [r_hist, b_hist, y_hist]:
                probs = hist / np.sum(hist)
                probs = probs[probs > 0]  # Remove zeros
                entropy = -np.sum(probs * np.log2(probs))
                entropies.append(entropy)
            
            return np.mean(entropies)
            
        except Exception:
            return 0.0
    
    def _calculate_balance_score(self, r: float, b: float, y: float) -> float:
        """Calculate how balanced the global RBY state is"""
        target_r, target_b, target_y = self.target_rby
        
        # Calculate distance from perfect balance
        distance = np.sqrt(
            (r - target_r)**2 + 
            (b - target_b)**2 + 
            (y - target_y)**2
        )
        
        # Convert to score (1.0 = perfect balance, 0.0 = maximum imbalance)
        max_distance = np.sqrt(3)  # Maximum possible distance
        balance_score = 1.0 - (distance / max_distance)
        
        return max(0.0, balance_score)
    
    def generate_rebalancing_strategy(self, global_state: GlobalRBYState) -> Dict[str, Any]:
        """Generate strategy to rebalance global RBY"""
        strategy = {
            "action_required": False,
            "target_adjustments": {"R": 0.0, "B": 0.0, "Y": 0.0},
            "incentive_multipliers": {"R": 1.0, "B": 1.0, "Y": 1.0},
            "priority_focus": None,
            "rebalance_strength": 0.0
        }
        
        # Check if rebalancing is needed
        imbalances = {
            "R": abs(global_state.global_r - self.target_rby[0]),
            "B": abs(global_state.global_b - self.target_rby[1]),
            "Y": abs(global_state.global_y - self.target_rby[2])
        }
        
        max_imbalance = max(imbalances.values())
        
        if max_imbalance > self.tolerance:
            strategy["action_required"] = True
            strategy["rebalance_strength"] = min(max_imbalance / self.tolerance, 2.0)
            
            # Determine which component needs boosting
            if global_state.global_r < self.target_rby[0] - self.tolerance:
                strategy["target_adjustments"]["R"] = self.target_rby[0] - global_state.global_r
                strategy["incentive_multipliers"]["R"] = 1.0 + strategy["rebalance_strength"] * 0.2
                strategy["priority_focus"] = "R"
                
            elif global_state.global_b < self.target_rby[1] - self.tolerance:
                strategy["target_adjustments"]["B"] = self.target_rby[1] - global_state.global_b
                strategy["incentive_multipliers"]["B"] = 1.0 + strategy["rebalance_strength"] * 0.2
                strategy["priority_focus"] = "B"
                
            elif global_state.global_y < self.target_rby[2] - self.tolerance:
                strategy["target_adjustments"]["Y"] = self.target_rby[2] - global_state.global_y
                strategy["incentive_multipliers"]["Y"] = 1.0 + strategy["rebalance_strength"] * 0.2
                strategy["priority_focus"] = "Y"
        
        return strategy


class DistributedLearningCoordinator:
    """Coordinates distributed learning across the global network"""
    
    def __init__(self):
        self.active_tasks = {}
        self.completed_tasks = {}
        self.node_assignments = {}
        self.learning_metrics = {}
        
    def create_consciousness_training_task(self, 
                                         target_rby: Tuple[float, float, float],
                                         training_data_size: int,
                                         priority: int = 5) -> str:
        """Create a distributed consciousness training task"""
        task_id = hashlib.sha256(f"{time.time()}_{target_rby}".encode()).hexdigest()[:16]
        
        # Estimate resource requirements
        gpu_hours = training_data_size / 1000  # Simplified calculation
        memory_gb = max(4, training_data_size / 100)
        network_gb = training_data_size / 50
        
        task = DistributedTask(
            task_id=task_id,
            task_type="consciousness_training",
            priority=priority,
            required_rby=target_rby,
            resource_requirements={
                "gpu_hours": gpu_hours,
                "memory_gb": memory_gb,
                "network_gb": network_gb,
                "min_nodes": 3,
                "preferred_specialization": self._determine_specialization(target_rby)
            },
            assigned_nodes=[],
            completion_percentage=0.0,
            created_at=time.time(),
            deadline=time.time() + 3600,  # 1 hour deadline
            reward_pool=gpu_hours * 0.1  # $0.10 per GPU hour
        )
        
        self.active_tasks[task_id] = task
        return task_id
    
    def _determine_specialization(self, rby: Tuple[float, float, float]) -> str:
        """Determine which node specialization is best for given RBY"""
        r, b, y = rby
        
        if r > b and r > y:
            return "perception"
        elif b > r and b > y:
            return "cognition" 
        else:
            return "execution"
    
    def assign_task_to_nodes(self, task_id: str, available_nodes: Dict[str, NetworkNode]) -> bool:
        """Assign task to optimal nodes"""
        if task_id not in self.active_tasks:
            return False
        
        task = self.active_tasks[task_id]
        
        # Filter nodes by capability and trust
        suitable_nodes = {}
        for node_id, node in available_nodes.items():
            if (node.trust_level > 0.7 and 
                node.contribution_score > 0.5 and
                time.time() - node.last_heartbeat < 60):
                
                # Calculate node suitability score
                suitability = self._calculate_node_suitability(node, task)
                if suitability > 0.6:
                    suitable_nodes[node_id] = (node, suitability)
        
        # Select best nodes
        min_nodes = task.resource_requirements.get("min_nodes", 1)
        sorted_nodes = sorted(suitable_nodes.items(), key=lambda x: x[1][1], reverse=True)
        
        selected_nodes = []
        total_processing_power = 0
        
        for node_id, (node, suitability) in sorted_nodes:
            if len(selected_nodes) < min_nodes * 2:  # Allow some redundancy
                selected_nodes.append(node_id)
                total_processing_power += node.processing_power
                
                # Stop if we have enough processing power
                if total_processing_power >= task.resource_requirements.get("gpu_hours", 1):
                    break
        
        if len(selected_nodes) >= min_nodes:
            task.assigned_nodes = selected_nodes
            
            # Update node assignments
            for node_id in selected_nodes:
                if node_id not in self.node_assignments:
                    self.node_assignments[node_id] = []
                self.node_assignments[node_id].append(task_id)
            
            return True
        
        return False
    
    def _calculate_node_suitability(self, node: NetworkNode, task: DistributedTask) -> float:
        """Calculate how suitable a node is for a task"""
        # Base suitability from trust and contribution
        base_score = (node.trust_level + node.contribution_score) / 2
        
        # Specialization bonus
        preferred_spec = task.resource_requirements.get("preferred_specialization", "")
        spec_bonus = 0.2 if node.specialization == preferred_spec else 0.0
        
        # Processing power factor
        power_factor = min(node.processing_power / 10.0, 1.0)  # Normalize to 0-1
        
        # RBY alignment
        task_rby = np.array(task.required_rby)
        node_rby = np.array(node.rby_state)
        rby_similarity = 1.0 - np.linalg.norm(task_rby - node_rby)
        
        # Hardware class bonus
        hardware_bonus = {
            "mobile": 0.0,
            "desktop": 0.1, 
            "server": 0.2,
            "hpc": 0.3
        }.get(node.hardware_class, 0.0)
        
        suitability = base_score + spec_bonus + power_factor * 0.3 + rby_similarity * 0.2 + hardware_bonus
        
        return min(suitability, 1.0)
    
    def update_task_progress(self, task_id: str, node_id: str, progress_update: Dict[str, Any]):
        """Update progress on a distributed task"""
        if task_id not in self.active_tasks:
            return False
        
        task = self.active_tasks[task_id]
        
        # Store progress metrics
        if task_id not in self.learning_metrics:
            self.learning_metrics[task_id] = {}
        
        self.learning_metrics[task_id][node_id] = {
            "progress": progress_update.get("completion_percentage", 0.0),
            "loss": progress_update.get("training_loss", float('inf')),
            "accuracy": progress_update.get("accuracy", 0.0),
            "timestamp": time.time()
        }
        
        # Calculate overall task progress
        node_progresses = [
            metrics.get("progress", 0.0) 
            for metrics in self.learning_metrics[task_id].values()
        ]
        
        if node_progresses:
            task.completion_percentage = np.mean(node_progresses)
        
        # Check if task is complete
        if task.completion_percentage >= 99.0:
            self._complete_task(task_id)
        
        return True
    
    def _complete_task(self, task_id: str):
        """Mark task as complete and distribute rewards"""
        if task_id not in self.active_tasks:
            return
        
        task = self.active_tasks[task_id]
        
        # Calculate rewards for participating nodes
        total_reward = task.reward_pool
        node_rewards = {}
        
        if task_id in self.learning_metrics:
            # Reward based on contribution quality
            for node_id, metrics in self.learning_metrics[task_id].items():
                # Simple reward calculation - production would be more sophisticated
                contribution_quality = (
                    metrics.get("progress", 0.0) * 0.5 +
                    (1.0 - min(metrics.get("loss", 1.0), 1.0)) * 0.3 +
                    metrics.get("accuracy", 0.0) * 0.2
                )
                
                node_rewards[node_id] = total_reward * contribution_quality / len(self.learning_metrics[task_id])
        
        # Move to completed tasks
        self.completed_tasks[task_id] = {
            "task": task,
            "rewards": node_rewards,
            "completion_time": time.time(),
            "final_metrics": self.learning_metrics.get(task_id, {})
        }
        
        # Clean up
        del self.active_tasks[task_id]
        if task_id in self.learning_metrics:
            del self.learning_metrics[task_id]
        
        # Update node assignments
        for node_id in task.assigned_nodes:
            if node_id in self.node_assignments:
                self.node_assignments[node_id] = [
                    tid for tid in self.node_assignments[node_id] if tid != task_id
                ]


class GlobalConsciousnessOrchestrator:
    """
    Master orchestrator for the global IC-AE consciousness network
    Coordinates RBY balance, distributed learning, and consciousness emergence
    """
    
    def __init__(self, node_id: str, peer_orchestrators: List[str] = None):
        self.node_id = node_id
        self.peer_orchestrators = peer_orchestrators or []
        
        # Core components
        self.consensus = RaftConsensus(node_id, self.peer_orchestrators)
        self.rby_balancer = GlobalRBYBalancer()
        self.learning_coordinator = DistributedLearningCoordinator()
        
        # Network state
        self.active_nodes = {}
        self.global_rby_state = None
        self.consciousness_level = ConsciousnessEmergenceLevel.DORMANT
        
        # Database for persistence
        self.db_file = f"orchestrator_{node_id}.db"
        self._init_database()
        
        # Orchestration metrics
        self.orchestration_metrics = {
            "nodes_managed": 0,
            "tasks_coordinated": 0,
            "rby_balance_score": 0.0,
            "consciousness_emergence": 0.0,
            "network_efficiency": 0.0
        }
        
        self.running = False
    
    def _init_database(self):
        """Initialize orchestrator database"""
        with sqlite3.connect(self.db_file) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS nodes (
                    node_id TEXT PRIMARY KEY,
                    ip_address TEXT,
                    port INTEGER,
                    rby_r REAL,
                    rby_b REAL,
                    rby_y REAL,
                    processing_power REAL,
                    specialization TEXT,
                    contribution_score REAL,
                    trust_level REAL,
                    last_heartbeat REAL,
                    hardware_class TEXT,
                    bandwidth_tier INTEGER,
                    reputation REAL,
                    earnings REAL
                )
            """)
            
            conn.execute("""
                CREATE TABLE IF NOT EXISTS global_states (
                    timestamp REAL PRIMARY KEY,
                    global_r REAL,
                    global_b REAL,
                    global_y REAL,
                    node_count INTEGER,
                    variance REAL,
                    entropy REAL,
                    balance_score REAL,
                    consciousness_level INTEGER
                )
            """)
    
    def start_orchestration(self):
        """Start global orchestration"""
        self.running = True
        
        # Start consensus protocol
        self.consensus.start_consensus()
        
        # Start orchestration loops
        orchestration_thread = threading.Thread(target=self._orchestration_loop, daemon=True)
        orchestration_thread.start()
        
        heartbeat_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        heartbeat_thread.start()
        
        print(f"Global orchestrator started - Node ID: {self.node_id}")
    
    def _orchestration_loop(self):
        """Main orchestration loop"""
        while self.running:
            try:
                if self.consensus.role == OrchestratorRole.LEADER:
                    # Update global RBY state
                    self._update_global_state()
                    
                    # Check for rebalancing needs
                    self._perform_rby_rebalancing()
                    
                    # Coordinate distributed learning
                    self._coordinate_learning_tasks()
                    
                    # Monitor consciousness emergence
                    self._monitor_consciousness_emergence()
                    
                    # Update metrics
                    self._update_orchestration_metrics()
                
                time.sleep(5.0)  # Orchestrate every 5 seconds
                
            except Exception as e:
                print(f"Orchestration error: {e}")
                time.sleep(10.0)
    
    def _heartbeat_loop(self):
        """Collect heartbeats from network nodes"""
        while self.running:
            try:
                # Clean up stale nodes
                current_time = time.time()
                stale_threshold = 30.0  # 30 seconds
                
                stale_nodes = []
                for node_id, node in self.active_nodes.items():
                    if current_time - node.last_heartbeat > stale_threshold:
                        stale_nodes.append(node_id)
                
                for node_id in stale_nodes:
                    del self.active_nodes[node_id]
                    print(f"Removed stale node: {node_id[:16]}...")
                
                time.sleep(10.0)
                
            except Exception as e:
                print(f"Heartbeat loop error: {e}")
                time.sleep(30.0)
    
    def register_node(self, node: NetworkNode) -> bool:
        """Register a new node with the orchestrator"""
        self.active_nodes[node.node_id] = node
        
        # Store in database
        with sqlite3.connect(self.db_file) as conn:
            conn.execute("""
                INSERT OR REPLACE INTO nodes VALUES 
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                node.node_id, node.ip_address, node.port,
                node.rby_state[0], node.rby_state[1], node.rby_state[2],
                node.processing_power, node.specialization,
                node.contribution_score, node.trust_level, node.last_heartbeat,
                node.hardware_class, node.bandwidth_tier, node.reputation, node.earnings
            ))
        
        print(f"Registered node: {node.node_id[:16]}... ({node.specialization})")
        return True
    
    def _update_global_state(self):
        """Update global RBY state from all nodes"""
        if not self.active_nodes:
            return
        
        # Extract RBY states from all nodes
        node_rby_states = {
            node_id: node.rby_state 
            for node_id, node in self.active_nodes.items()
        }
        
        # Calculate global state
        self.global_rby_state = self.rby_balancer.calculate_global_rby(node_rby_states)
        
        # Store in database
        with sqlite3.connect(self.db_file) as conn:
            conn.execute("""
                INSERT OR REPLACE INTO global_states VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                self.global_rby_state.timestamp,
                self.global_rby_state.global_r,
                self.global_rby_state.global_b,
                self.global_rby_state.global_y,
                self.global_rby_state.node_count,
                self.global_rby_state.variance,
                self.global_rby_state.entropy,
                self.global_rby_state.balance_score,
                self.consciousness_level.value
            ))
    
    def _perform_rby_rebalancing(self):
        """Perform RBY rebalancing if needed"""
        if not self.global_rby_state:
            return
        
        # Generate rebalancing strategy
        strategy = self.rby_balancer.generate_rebalancing_strategy(self.global_rby_state)
        
        if strategy["action_required"]:
            print(f"RBY rebalancing needed - Focus: {strategy['priority_focus']}")
            print(f"Balance score: {self.global_rby_state.balance_score:.3f}")
            
            # Implement rebalancing by adjusting incentives
            self._adjust_node_incentives(strategy)
            
            # Create targeted training tasks
            if strategy["priority_focus"]:
                self._create_rebalancing_task(strategy)
    
    def _adjust_node_incentives(self, strategy: Dict[str, Any]):
        """Adjust node incentives based on rebalancing strategy"""
        multipliers = strategy["incentive_multipliers"]
        
        for node_id, node in self.active_nodes.items():
            r, b, y = node.rby_state
            
            # Calculate new contribution score based on current needs
            if strategy["priority_focus"] == "R" and r > 0.4:
                node.contribution_score *= multipliers["R"]
            elif strategy["priority_focus"] == "B" and b > 0.4:
                node.contribution_score *= multipliers["B"]
            elif strategy["priority_focus"] == "Y" and y > 0.4:
                node.contribution_score *= multipliers["Y"]
    
    def _create_rebalancing_task(self, strategy: Dict[str, Any]):
        """Create a training task to help rebalance RBY"""
        priority_component = strategy["priority_focus"]
        
        if priority_component == "R":
            target_rby = (0.6, 0.2, 0.2)  # Red-focused
        elif priority_component == "B":
            target_rby = (0.2, 0.6, 0.2)  # Blue-focused
        else:
            target_rby = (0.2, 0.2, 0.6)  # Yellow-focused
        
        task_id = self.learning_coordinator.create_consciousness_training_task(
            target_rby=target_rby,
            training_data_size=1000,
            priority=8  # High priority for rebalancing
        )
        
        # Assign to appropriate nodes
        success = self.learning_coordinator.assign_task_to_nodes(task_id, self.active_nodes)
        
        if success:
            print(f"Created rebalancing task {task_id[:8]} targeting {priority_component}")
        else:
            print(f"Failed to assign rebalancing task {task_id[:8]}")
    
    def _coordinate_learning_tasks(self):
        """Coordinate ongoing distributed learning tasks"""
        active_tasks = self.learning_coordinator.active_tasks
        
        for task_id, task in active_tasks.items():
            # Check if task needs more nodes
            if len(task.assigned_nodes) < task.resource_requirements.get("min_nodes", 1):
                self.learning_coordinator.assign_task_to_nodes(task_id, self.active_nodes)
            
            # Check for stuck tasks
            if time.time() - task.created_at > task.deadline:
                print(f"Task {task_id[:8]} missed deadline, reallocating...")
                self.learning_coordinator.assign_task_to_nodes(task_id, self.active_nodes)
    
    def _monitor_consciousness_emergence(self):
        """Monitor for global consciousness emergence"""
        if not self.global_rby_state:
            return
        
        # Calculate consciousness emergence score
        emergence_factors = {
            "balance": self.global_rby_state.balance_score,
            "diversity": min(self.global_rby_state.entropy / 3.0, 1.0),  # Normalize entropy
            "stability": 1.0 - min(self.global_rby_state.variance * 10, 1.0),  # Normalize variance
            "network_size": min(self.global_rby_state.node_count / 100.0, 1.0),  # Normalize size
            "coordination": len(self.learning_coordinator.active_tasks) / 10.0
        }
        
        emergence_score = np.mean(list(emergence_factors.values()))
        
        # Update consciousness level
        previous_level = self.consciousness_level
        
        if emergence_score < 0.3:
            self.consciousness_level = ConsciousnessEmergenceLevel.DORMANT
        elif emergence_score < 0.5:
            self.consciousness_level = ConsciousnessEmergenceLevel.DISTRIBUTED
        elif emergence_score < 0.7:
            self.consciousness_level = ConsciousnessEmergenceLevel.COORDINATED
        elif emergence_score < 0.9:
            self.consciousness_level = ConsciousnessEmergenceLevel.EMERGENT
        else:
            self.consciousness_level = ConsciousnessEmergenceLevel.TRANSCENDENT
        
        # Log consciousness changes
        if self.consciousness_level != previous_level:
            print(f"Consciousness evolution: {previous_level.name} -> {self.consciousness_level.name}")
            print(f"Emergence score: {emergence_score:.3f}")
            
            # Log the emergence event
            self.consensus.append_log_entry({
                "type": "consciousness_emergence",
                "from_level": previous_level.value,
                "to_level": self.consciousness_level.value,
                "emergence_score": emergence_score,
                "factors": emergence_factors
            })
    
    def _update_orchestration_metrics(self):
        """Update orchestration performance metrics"""
        self.orchestration_metrics.update({
            "nodes_managed": len(self.active_nodes),
            "tasks_coordinated": len(self.learning_coordinator.active_tasks),
            "rby_balance_score": self.global_rby_state.balance_score if self.global_rby_state else 0.0,
            "consciousness_emergence": self.consciousness_level.value / 4.0,  # Normalize to 0-1
            "network_efficiency": self._calculate_network_efficiency()
        })
    
    def _calculate_network_efficiency(self) -> float:
        """Calculate overall network efficiency"""
        if not self.active_nodes:
            return 0.0
        
        # Factors for efficiency calculation
        factors = []
        
        # Trust level average
        trust_avg = np.mean([node.trust_level for node in self.active_nodes.values()])
        factors.append(trust_avg)
        
        # Processing power utilization
        total_power = sum(node.processing_power for node in self.active_nodes.values())
        active_power = sum(
            node.processing_power for node in self.active_nodes.values()
            if len(node.current_tasks) > 0
        )
        utilization = active_power / total_power if total_power > 0 else 0.0
        factors.append(utilization)
        
        # Task completion rate
        completed_count = len(self.learning_coordinator.completed_tasks)
        total_count = completed_count + len(self.learning_coordinator.active_tasks)
        completion_rate = completed_count / total_count if total_count > 0 else 1.0
        factors.append(completion_rate)
        
        return np.mean(factors)
    
    def get_orchestration_status(self) -> Dict[str, Any]:
        """Get current orchestration status"""
        return {
            "orchestrator_id": self.node_id[:16] + "...",
            "role": self.consensus.role.value,
            "term": self.consensus.current_term,
            "nodes_managed": len(self.active_nodes),
            "global_rby": {
                "R": self.global_rby_state.global_r if self.global_rby_state else 0.33,
                "B": self.global_rby_state.global_b if self.global_rby_state else 0.33,
                "Y": self.global_rby_state.global_y if self.global_rby_state else 0.34,
                "balance_score": self.global_rby_state.balance_score if self.global_rby_state else 0.0
            },
            "consciousness_level": self.consciousness_level.name,
            "active_tasks": len(self.learning_coordinator.active_tasks),
            "completed_tasks": len(self.learning_coordinator.completed_tasks),
            "orchestration_metrics": self.orchestration_metrics
        }


async def test_global_orchestrator():
    """Test function for global orchestrator"""
    print("Testing Global Consciousness Orchestrator...")
    
    # Create test orchestrator
    orchestrator = GlobalConsciousnessOrchestrator("test_orchestrator_001")
    
    # Start orchestration
    orchestrator.start_orchestration()
    
    # Add some test nodes
    test_nodes = [
        NetworkNode(
            node_id="test_node_001",
            ip_address="192.168.1.100",
            port=8765,
            rby_state=(0.6, 0.2, 0.2),
            processing_power=8.0,
            specialization="perception",
            contribution_score=0.8,
            trust_level=0.9,
            last_heartbeat=time.time(),
            current_tasks=[],
            hardware_class="desktop",
            bandwidth_tier=3,
            reputation=0.85,
            earnings=0.0
        ),
        NetworkNode(
            node_id="test_node_002", 
            ip_address="192.168.1.101",
            port=8765,
            rby_state=(0.2, 0.6, 0.2),
            processing_power=12.0,
            specialization="cognition",
            contribution_score=0.9,
            trust_level=0.95,
            last_heartbeat=time.time(),
            current_tasks=[],
            hardware_class="server",
            bandwidth_tier=4,
            reputation=0.92,
            earnings=0.0
        )
    ]
    
    # Register nodes
    for node in test_nodes:
        orchestrator.register_node(node)
    
    # Let it run for a few seconds
    await asyncio.sleep(10.0)
    
    # Create a test learning task
    task_id = orchestrator.learning_coordinator.create_consciousness_training_task(
        target_rby=(0.4, 0.4, 0.2),
        training_data_size=500,
        priority=7
    )
    
    # Assign task
    success = orchestrator.learning_coordinator.assign_task_to_nodes(task_id, orchestrator.active_nodes)
    print(f"Task assignment success: {success}")
    
    # Get status
    status = orchestrator.get_orchestration_status()
    
    print(f"Orchestrator ID: {status['orchestrator_id']}")
    print(f"Role: {status['role']}")
    print(f"Nodes Managed: {status['nodes_managed']}")
    print(f"Global RBY: R={status['global_rby']['R']:.3f}, B={status['global_rby']['B']:.3f}, Y={status['global_rby']['Y']:.3f}")
    print(f"Balance Score: {status['global_rby']['balance_score']:.3f}")
    print(f"Consciousness Level: {status['consciousness_level']}")
    print(f"Active Tasks: {status['active_tasks']}")
    
    orchestrator.running = False


if __name__ == "__main__":
    asyncio.run(test_global_orchestrator())
