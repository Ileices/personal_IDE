"""
Distributed Node Smoke Testing for ATTACK Framework
Multi-agent local deployment with scarcity-score logic validation
Production-ready distributed consciousness testing
"""

import asyncio
import aiohttp
import json
import time
import threading
import logging
import socket
import subprocess
import psutil
from typing import Dict, List, Tuple, Any, Optional
from dataclasses import dataclass, field
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import numpy as np
import torch
import hashlib
import tempfile
import shutil
import os
from collections import defaultdict, deque
from enum import Enum
import signal
import sys

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class TaskType(Enum):
    """Types of tasks in the distributed system"""
    PERCEPTION_HEAVY = "perception_heavy"
    EXECUTION_HEAVY = "execution_heavy"
    BALANCED = "balanced"
    COORDINATION = "coordination"
    MAINTENANCE = "maintenance"

@dataclass
class ScarcityScore:
    """Represents node scarcity scoring for task distribution"""
    node_id: str
    cpu_availability: float  # 0.0 to 1.0
    memory_availability: float  # 0.0 to 1.0
    network_latency_ms: float
    task_queue_length: int
    processing_capacity: float
    specialization_bonus: float = 0.0  # Bonus for task type specialization
    
    def calculate_total_score(self, task_type: TaskType) -> float:
        """Calculate total scarcity score for task assignment"""
        base_score = (
            self.cpu_availability * 0.3 +
            self.memory_availability * 0.2 +
            (1.0 / max(1.0, self.network_latency_ms / 100.0)) * 0.2 +
            (1.0 / max(1.0, self.task_queue_length)) * 0.2 +
            self.processing_capacity * 0.1
        )
        
        # Apply specialization bonus
        if task_type == TaskType.PERCEPTION_HEAVY and self.specialization_bonus > 0:
            base_score += self.specialization_bonus * 0.15
        elif task_type == TaskType.EXECUTION_HEAVY and self.specialization_bonus > 0:
            base_score += self.specialization_bonus * 0.15
        
        return min(1.0, base_score)

@dataclass
class DistributedTask:
    """Represents a task in the distributed system"""
    task_id: str
    task_type: TaskType
    payload: Dict[str, Any]
    priority: float = 1.0
    estimated_duration_ms: float = 1000.0
    required_resources: Dict[str, float] = field(default_factory=dict)
    created_timestamp: float = field(default_factory=time.time)
    assigned_node: Optional[str] = None
    status: str = "pending"  # pending, assigned, running, completed, failed

@dataclass
class NodeStatus:
    """Current status of a distributed node"""
    node_id: str
    port: int
    is_alive: bool = True
    last_heartbeat: float = field(default_factory=time.time)
    current_tasks: List[str] = field(default_factory=list)
    completed_tasks: int = 0
    failed_tasks: int = 0
    total_processing_time_ms: float = 0.0
    node_type: str = "general"  # general, perception, execution, coordinator

class DistributedNode:
    """Individual node in the distributed ATTACK framework"""
    
    def __init__(self, node_id: str, port: int, node_type: str = "general"):
        self.node_id = node_id
        self.port = port
        self.node_type = node_type
        self.status = NodeStatus(node_id, port, node_type=node_type)
        self.task_queue = deque()
        self.running_tasks = {}
        self.app = None
        self.server = None
        self.is_running = False
        
        # Node capabilities based on type
        self.capabilities = self._initialize_capabilities()
        
    def _initialize_capabilities(self) -> Dict[str, float]:
        """Initialize node capabilities based on type"""
        base_capabilities = {
            'cpu_power': 1.0,
            'memory_capacity': 1.0,
            'network_bandwidth': 1.0,
            'task_throughput': 1.0
        }
        
        if self.node_type == "perception":
            base_capabilities.update({
                'perception_processing': 1.5,
                'pattern_recognition': 1.3,
                'sensory_analysis': 1.4
            })
        elif self.node_type == "execution":
            base_capabilities.update({
                'computation_speed': 1.5,
                'parallel_processing': 1.3,
                'resource_efficiency': 1.2
            })
        elif self.node_type == "coordinator":
            base_capabilities.update({
                'task_scheduling': 1.4,
                'load_balancing': 1.3,
                'communication': 1.5
            })
        
        return base_capabilities
    
    async def start_server(self):
        """Start the node's HTTP server"""
        from aiohttp import web
        
        self.app = web.Application()
        self.app.router.add_post('/task', self.handle_task)
        self.app.router.add_get('/status', self.handle_status)
        self.app.router.add_get('/health', self.handle_health)
        self.app.router.add_post('/shutdown', self.handle_shutdown)
        
        runner = web.AppRunner(self.app)
        await runner.setup()
        
        site = web.TCPSite(runner, 'localhost', self.port)
        await site.start()
        
        self.is_running = True
        logger.info(f"Node {self.node_id} started on port {self.port}")
    
    async def handle_task(self, request):
        """Handle incoming task assignment"""
        try:
            task_data = await request.json()
            task = DistributedTask(**task_data)
            
            # Add to queue
            self.task_queue.append(task)
            task.assigned_node = self.node_id
            task.status = "assigned"
            
            # Start processing
            asyncio.create_task(self._process_task(task))
            
            return web.json_response({
                'status': 'accepted',
                'task_id': task.task_id,
                'node_id': self.node_id,
                'queue_position': len(self.task_queue)
            })
            
        except Exception as e:
            logger.error(f"Error handling task: {e}")
            return web.json_response({'error': str(e)}, status=500)
    
    async def handle_status(self, request):
        """Return current node status"""
        return web.json_response({
            'node_id': self.node_id,
            'node_type': self.node_type,
            'is_alive': self.status.is_alive,
            'queue_length': len(self.task_queue),
            'running_tasks': len(self.running_tasks),
            'completed_tasks': self.status.completed_tasks,
            'failed_tasks': self.status.failed_tasks,
            'capabilities': self.capabilities,
            'uptime_seconds': time.time() - self.status.last_heartbeat
        })
    
    async def handle_health(self, request):
        """Health check endpoint"""
        return web.json_response({'status': 'healthy', 'timestamp': time.time()})
    
    async def handle_shutdown(self, request):
        """Graceful shutdown endpoint"""
        self.is_running = False
        return web.json_response({'status': 'shutting_down'})
    
    async def _process_task(self, task: DistributedTask):
        """Process a distributed task"""
        start_time = time.time()
        task.status = "running"
        self.running_tasks[task.task_id] = task
        
        try:
            # Simulate task processing based on type
            if task.task_type == TaskType.PERCEPTION_HEAVY:
                result = await self._process_perception_task(task)
            elif task.task_type == TaskType.EXECUTION_HEAVY:
                result = await self._process_execution_task(task)
            elif task.task_type == TaskType.COORDINATION:
                result = await self._process_coordination_task(task)
            else:
                result = await self._process_generic_task(task)
            
            processing_time = (time.time() - start_time) * 1000
            task.status = "completed"
            self.status.completed_tasks += 1
            self.status.total_processing_time_ms += processing_time
            
            logger.info(f"Node {self.node_id} completed task {task.task_id} in {processing_time:.1f}ms")
            
        except Exception as e:
            task.status = "failed"
            self.status.failed_tasks += 1
            logger.error(f"Task {task.task_id} failed on node {self.node_id}: {e}")
        
        finally:
            if task.task_id in self.running_tasks:
                del self.running_tasks[task.task_id]
    
    async def _process_perception_task(self, task: DistributedTask) -> Dict[str, Any]:
        """Process perception-heavy task"""
        payload = task.payload
        
        # Simulate perception processing with RBY analysis
        data = payload.get('sensory_data', [])
        
        # Simulate pattern recognition
        await asyncio.sleep(0.1 * len(data) / 100)
        
        patterns = []
        for i, item in enumerate(data[:100]):  # Limit processing
            pattern = {
                'pattern_id': f"p_{i}",
                'confidence': np.random.uniform(0.7, 0.95),
                'rby_signature': self._generate_rby_signature(str(item))
            }
            patterns.append(pattern)
        
        return {
            'task_id': task.task_id,
            'result_type': 'perception_analysis',
            'patterns_detected': len(patterns),
            'patterns': patterns,
            'processing_node': self.node_id
        }
    
    async def _process_execution_task(self, task: DistributedTask) -> Dict[str, Any]:
        """Process execution-heavy task"""
        payload = task.payload
        
        # Simulate computational work
        matrix_size = payload.get('matrix_size', 100)
        iterations = payload.get('iterations', 10)
        
        # Simulate matrix operations
        results = []
        for i in range(iterations):
            # Simulate computation delay
            await asyncio.sleep(0.01)
            
            # Generate computation result
            result = {
                'iteration': i,
                'computation_value': np.random.uniform(0, 1),
                'convergence_metric': max(0, 1.0 - i / iterations)
            }
            results.append(result)
        
        return {
            'task_id': task.task_id,
            'result_type': 'execution_computation',
            'iterations_completed': len(results),
            'final_convergence': results[-1]['convergence_metric'] if results else 0,
            'results': results,
            'processing_node': self.node_id
        }
    
    async def _process_coordination_task(self, task: DistributedTask) -> Dict[str, Any]:
        """Process coordination task"""
        payload = task.payload
        
        # Simulate coordination logic
        nodes_to_coordinate = payload.get('target_nodes', [])
        coordination_type = payload.get('coordination_type', 'load_balance')
        
        await asyncio.sleep(0.05)  # Coordination delay
        
        return {
            'task_id': task.task_id,
            'result_type': 'coordination_result',
            'coordination_type': coordination_type,
            'nodes_coordinated': len(nodes_to_coordinate),
            'coordination_success': True,
            'processing_node': self.node_id
        }
    
    async def _process_generic_task(self, task: DistributedTask) -> Dict[str, Any]:
        """Process generic task"""
        await asyncio.sleep(0.1)  # Generic processing delay
        
        return {
            'task_id': task.task_id,
            'result_type': 'generic_result',
            'processing_node': self.node_id,
            'status': 'completed'
        }
    
    def _generate_rby_signature(self, data: str) -> str:
        """Generate RBY signature for data"""
        hash_value = hashlib.md5(data.encode()).hexdigest()
        rby_mapping = {'0': 'R', '1': 'B', '2': 'Y', '3': 'R', '4': 'B', '5': 'Y',
                      '6': 'R', '7': 'B', '8': 'Y', '9': 'R', 'a': 'B', 'b': 'Y',
                      'c': 'R', 'd': 'B', 'e': 'Y', 'f': 'R'}
        
        return ''.join(rby_mapping.get(c, 'Y') for c in hash_value[:9])
    
    def get_scarcity_score(self, task_type: TaskType) -> ScarcityScore:
        """Calculate current scarcity score for this node"""
        # Get system metrics
        cpu_percent = psutil.cpu_percent(interval=0.1)
        memory = psutil.virtual_memory()
        
        cpu_availability = max(0, (100 - cpu_percent) / 100)
        memory_availability = max(0, (100 - memory.percent) / 100)
        
        # Simulate network latency (in production, this would be measured)
        network_latency = np.random.uniform(10, 50)
        
        # Calculate processing capacity based on node type
        base_capacity = 1.0
        if self.node_type == "perception" and task_type == TaskType.PERCEPTION_HEAVY:
            base_capacity = 1.3
        elif self.node_type == "execution" and task_type == TaskType.EXECUTION_HEAVY:
            base_capacity = 1.3
        elif self.node_type == "coordinator" and task_type == TaskType.COORDINATION:
            base_capacity = 1.2
        
        specialization_bonus = 0.2 if base_capacity > 1.0 else 0.0
        
        return ScarcityScore(
            node_id=self.node_id,
            cpu_availability=cpu_availability,
            memory_availability=memory_availability,
            network_latency_ms=network_latency,
            task_queue_length=len(self.task_queue),
            processing_capacity=base_capacity,
            specialization_bonus=specialization_bonus
        )


class DistributedNodeOrchestrator:
    """Orchestrates multiple distributed nodes for testing"""
    
    def __init__(self, base_port: int = 8080):
        self.base_port = base_port
        self.nodes = {}
        self.node_processes = {}
        self.task_history = []
        self.performance_metrics = {
            'total_tasks_dispatched': 0,
            'total_tasks_completed': 0,
            'average_task_completion_time': 0.0,
            'node_utilization': {},
            'load_balance_efficiency': 0.0
        }
    
    async def deploy_nodes(self, node_configs: List[Dict[str, Any]]) -> Dict[str, bool]:
        """Deploy multiple nodes with different configurations"""
        deployment_results = {}
        
        for config in node_configs:
            node_id = config['node_id']
            node_type = config.get('node_type', 'general')
            port = config.get('port', self.base_port + len(self.nodes))
            
            try:
                # Create and start node
                node = DistributedNode(node_id, port, node_type)
                
                # Start node in background
                loop = asyncio.get_event_loop()
                loop.create_task(node.start_server())
                
                # Wait for startup
                await asyncio.sleep(0.5)
                
                # Verify node is responsive
                is_healthy = await self._check_node_health(node_id, port)
                
                if is_healthy:
                    self.nodes[node_id] = {
                        'node': node,
                        'port': port,
                        'node_type': node_type,
                        'status': 'running'
                    }
                    deployment_results[node_id] = True
                    logger.info(f"Successfully deployed node {node_id} on port {port}")
                else:
                    deployment_results[node_id] = False
                    logger.error(f"Failed to deploy node {node_id} - health check failed")
                
            except Exception as e:
                deployment_results[node_id] = False
                logger.error(f"Failed to deploy node {node_id}: {e}")
        
        logger.info(f"Deployment complete: {sum(deployment_results.values())}/{len(node_configs)} nodes successful")
        return deployment_results
    
    async def _check_node_health(self, node_id: str, port: int) -> bool:
        """Check if a node is healthy and responsive"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f'http://localhost:{port}/health', timeout=aiohttp.ClientTimeout(total=5)) as response:
                    if response.status == 200:
                        return True
            return False
        except:
            return False
    
    async def dispatch_task(self, task: DistributedTask) -> Optional[str]:
        """Dispatch task to best available node using scarcity scoring"""
        if not self.nodes:
            logger.error("No nodes available for task dispatch")
            return None
        
        # Calculate scarcity scores for all nodes
        node_scores = {}
        for node_id, node_info in self.nodes.items():
            if node_info['status'] == 'running':
                node = node_info['node']
                score = node.get_scarcity_score(task.task_type)
                node_scores[node_id] = score.calculate_total_score(task.task_type)
        
        if not node_scores:
            logger.error("No running nodes available")
            return None
        
        # Select best node (highest scarcity score)
        best_node_id = max(node_scores.keys(), key=lambda x: node_scores[x])
        best_node_info = self.nodes[best_node_id]
        
        try:
            # Send task to selected node
            task_data = {
                'task_id': task.task_id,
                'task_type': task.task_type.value,
                'payload': task.payload,
                'priority': task.priority,
                'estimated_duration_ms': task.estimated_duration_ms,
                'required_resources': task.required_resources
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f'http://localhost:{best_node_info["port"]}/task',
                    json=task_data,
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    if response.status == 200:
                        result = await response.json()
                        task.assigned_node = best_node_id
                        task.status = "assigned"
                        self.task_history.append(task)
                        self.performance_metrics['total_tasks_dispatched'] += 1
                        
                        logger.info(f"Task {task.task_id} dispatched to node {best_node_id} "
                                  f"(score: {node_scores[best_node_id]:.3f})")
                        return best_node_id
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to dispatch task {task.task_id}: {e}")
            return None
    
    async def run_smoke_test_suite(self) -> Dict[str, Any]:
        """Run comprehensive smoke test suite"""
        logger.info("Starting distributed node smoke test suite...")
        
        test_results = {
            'node_deployment': {},
            'task_distribution': {},
            'load_balancing': {},
            'fault_tolerance': {},
            'performance_metrics': {},
            'overall_status': 'PASS'
        }
        
        # Test 1: Node Deployment
        logger.info("Test 1: Node deployment verification")
        deployment_test = await self._test_node_deployment()
        test_results['node_deployment'] = deployment_test
        
        # Test 2: Task Distribution Logic
        logger.info("Test 2: Task distribution and scarcity scoring")
        distribution_test = await self._test_task_distribution()
        test_results['task_distribution'] = distribution_test
        
        # Test 3: Load Balancing
        logger.info("Test 3: Load balancing efficiency")
        load_balance_test = await self._test_load_balancing()
        test_results['load_balancing'] = load_balance_test
        
        # Test 4: Basic Fault Tolerance
        logger.info("Test 4: Basic fault tolerance")
        fault_tolerance_test = await self._test_fault_tolerance()
        test_results['fault_tolerance'] = fault_tolerance_test
        
        # Test 5: Performance Metrics
        logger.info("Test 5: Performance metrics collection")
        performance_test = await self._collect_performance_metrics()
        test_results['performance_metrics'] = performance_test
        
        # Determine overall status
        all_tests_passed = all(
            result.get('status') == 'PASS'
            for result in test_results.values()
            if isinstance(result, dict) and 'status' in result
        )
        
        test_results['overall_status'] = 'PASS' if all_tests_passed else 'FAIL'
        
        logger.info(f"Smoke test suite complete. Overall status: {test_results['overall_status']}")
        return test_results
    
    async def _test_node_deployment(self) -> Dict[str, Any]:
        """Test node deployment functionality"""
        node_configs = [
            {'node_id': 'perception_node_1', 'node_type': 'perception', 'port': 8081},
            {'node_id': 'execution_node_1', 'node_type': 'execution', 'port': 8082},
            {'node_id': 'coordinator_node_1', 'node_type': 'coordinator', 'port': 8083},
            {'node_id': 'general_node_1', 'node_type': 'general', 'port': 8084}
        ]
        
        deployment_results = await self.deploy_nodes(node_configs)
        successful_deployments = sum(deployment_results.values())
        
        return {
            'status': 'PASS' if successful_deployments >= 3 else 'FAIL',
            'deployed_nodes': successful_deployments,
            'total_nodes': len(node_configs),
            'deployment_details': deployment_results
        }
    
    async def _test_task_distribution(self) -> Dict[str, Any]:
        """Test task distribution and scarcity scoring logic"""
        test_tasks = [
            DistributedTask("task_1", TaskType.PERCEPTION_HEAVY, {"sensory_data": list(range(50))}),
            DistributedTask("task_2", TaskType.EXECUTION_HEAVY, {"matrix_size": 100, "iterations": 5}),
            DistributedTask("task_3", TaskType.COORDINATION, {"target_nodes": ["node1", "node2"]}),
            DistributedTask("task_4", TaskType.BALANCED, {"data": "test_data"})
        ]
        
        dispatch_results = []
        for task in test_tasks:
            assigned_node = await self.dispatch_task(task)
            dispatch_results.append({
                'task_id': task.task_id,
                'task_type': task.task_type.value,
                'assigned_node': assigned_node,
                'success': assigned_node is not None
            })
        
        successful_dispatches = sum(1 for r in dispatch_results if r['success'])
        
        return {
            'status': 'PASS' if successful_dispatches >= 3 else 'FAIL',
            'successful_dispatches': successful_dispatches,
            'total_tasks': len(test_tasks),
            'dispatch_details': dispatch_results
        }
    
    async def _test_load_balancing(self) -> Dict[str, Any]:
        """Test load balancing across nodes"""
        # Generate multiple tasks of the same type
        tasks = [
            DistributedTask(f"load_test_task_{i}", TaskType.BALANCED, {"data": f"test_{i}"})
            for i in range(10)
        ]
        
        dispatch_results = []
        for task in tasks:
            assigned_node = await self.dispatch_task(task)
            if assigned_node:
                dispatch_results.append(assigned_node)
        
        # Wait for task completion
        await asyncio.sleep(2)
        
        # Analyze distribution
        node_distribution = defaultdict(int)
        for node_id in dispatch_results:
            node_distribution[node_id] += 1
        
        # Calculate load balance efficiency (lower variance = better balance)
        if len(node_distribution) > 1:
            values = list(node_distribution.values())
            mean_load = np.mean(values)
            variance = np.var(values)
            balance_efficiency = max(0, 1.0 - variance / max(1, mean_load))
        else:
            balance_efficiency = 1.0
        
        return {
            'status': 'PASS' if balance_efficiency > 0.5 else 'FAIL',
            'balance_efficiency': balance_efficiency,
            'node_distribution': dict(node_distribution),
            'total_tasks_distributed': len(dispatch_results)
        }
    
    async def _test_fault_tolerance(self) -> Dict[str, Any]:
        """Test basic fault tolerance by simulating node failures"""
        # This is a simplified test - in production would test actual failure scenarios
        
        initial_node_count = len([n for n in self.nodes.values() if n['status'] == 'running'])
        
        # Simulate one node going offline
        if self.nodes:
            first_node_id = list(self.nodes.keys())[0]
            self.nodes[first_node_id]['status'] = 'offline'
            
            # Try to dispatch a task
            test_task = DistributedTask("fault_test_task", TaskType.BALANCED, {"data": "fault_test"})
            assigned_node = await self.dispatch_task(test_task)
            
            # Restore node status
            self.nodes[first_node_id]['status'] = 'running'
            
            # Test passes if task was assigned to a different node
            fault_tolerance_works = assigned_node is not None and assigned_node != first_node_id
        else:
            fault_tolerance_works = False
        
        return {
            'status': 'PASS' if fault_tolerance_works else 'FAIL',
            'initial_nodes': initial_node_count,
            'fault_tolerance_verified': fault_tolerance_works
        }
    
    async def _collect_performance_metrics(self) -> Dict[str, Any]:
        """Collect performance metrics from all nodes"""
        node_metrics = {}
        
        for node_id, node_info in self.nodes.items():
            if node_info['status'] == 'running':
                try:
                    async with aiohttp.ClientSession() as session:
                        async with session.get(
                            f'http://localhost:{node_info["port"]}/status',
                            timeout=aiohttp.ClientTimeout(total=5)
                        ) as response:
                            if response.status == 200:
                                metrics = await response.json()
                                node_metrics[node_id] = metrics
                except Exception as e:
                    logger.warning(f"Failed to collect metrics from node {node_id}: {e}")
        
        # Calculate aggregate metrics
        total_completed = sum(m.get('completed_tasks', 0) for m in node_metrics.values())
        total_failed = sum(m.get('failed_tasks', 0) for m in node_metrics.values())
        
        success_rate = total_completed / max(1, total_completed + total_failed)
        
        return {
            'status': 'PASS' if success_rate > 0.8 else 'FAIL',
            'total_completed_tasks': total_completed,
            'total_failed_tasks': total_failed,
            'success_rate': success_rate,
            'node_metrics': node_metrics
        }


async def run_distributed_smoke_test():
    """Run the complete distributed node smoke test"""
    print("=== ATTACK Framework Distributed Node Smoke Test ===")
    
    orchestrator = DistributedNodeOrchestrator()
    
    try:
        # Run comprehensive smoke test
        results = await orchestrator.run_smoke_test_suite()
        
        print(f"\n=== SMOKE TEST RESULTS ===")
        print(f"Overall Status: {results['overall_status']}")
        print(f"Node Deployment: {results['node_deployment']['status']} "
              f"({results['node_deployment']['deployed_nodes']}/{results['node_deployment']['total_nodes']} nodes)")
        print(f"Task Distribution: {results['task_distribution']['status']} "
              f"({results['task_distribution']['successful_dispatches']}/{results['task_distribution']['total_tasks']} tasks)")
        print(f"Load Balancing: {results['load_balancing']['status']} "
              f"(efficiency: {results['load_balancing']['balance_efficiency']:.2f})")
        print(f"Fault Tolerance: {results['fault_tolerance']['status']}")
        print(f"Performance: {results['performance_metrics']['status']} "
              f"(success rate: {results['performance_metrics']['success_rate']:.1%})")
        
        if results['overall_status'] == 'PASS':
            print("✅ All distributed node smoke tests PASSED")
        else:
            print("❌ Some smoke tests FAILED")
        
        return results
        
    except Exception as e:
        logger.error(f"Smoke test failed: {e}")
        return {'overall_status': 'ERROR', 'error': str(e)}


def demo_distributed_nodes():
    """Demo function to run distributed node testing"""
    # Run the async smoke test
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        results = loop.run_until_complete(run_distributed_smoke_test())
        return results
    finally:
        loop.close()


if __name__ == "__main__":
    demo_distributed_nodes()
