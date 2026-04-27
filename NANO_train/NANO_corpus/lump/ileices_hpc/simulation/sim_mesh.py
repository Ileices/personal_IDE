"""
Simulated Mesh -- discrete event simulation of the global HPC.
"""
import random
import math
import time
import logging
from dataclasses import dataclass, field
from typing import List, Dict, Tuple, Optional
from collections import defaultdict

from .sim_node import SimulatedNode, Tier

logger = logging.getLogger("ileices.sim")


@dataclass
class SimConfig:
    num_nodes: int = 100
    tier_distribution: Dict[str, float] = field(default_factory=lambda: {
        'NANO': 0.40, 'EDGE': 0.30, 'CORE': 0.25, 'ULTRA': 0.05,
    })
    duration_hours: float = 24.0
    time_step_minutes: float = 1.0
    nanos_per_job: int = 100
    nano_flops_per_step: float = 1e9
    steps_per_job: int = 100
    job_arrival_rate: float = 10.0
    nano_size_mb: float = 0.2
    redundancy_factor: int = 2
    byzantine_fraction: float = 0.02
    packet_loss_rate: float = 0.001
    corruption_rate: float = 0.0001
    gossip_interval_minutes: float = 0.5


@dataclass
class TrainingJob:
    job_id: str
    nanos_count: int
    steps: int
    flops_per_step: float
    created_at: float
    assigned_nodes: List[str] = field(default_factory=list)
    completed_steps: int = 0
    completed: bool = False
    failed: bool = False
    result_quality: float = 0.0
    completed_at: float = 0.0


@dataclass
class SimulationResult:
    config: SimConfig
    wall_time_s: float = 0.0
    simulated_hours: float = 0.0
    total_nodes: int = 0
    avg_online_nodes: float = 0.0
    node_failures: int = 0
    byzantine_detections: int = 0
    total_jobs: int = 0
    completed_jobs: int = 0
    failed_jobs: int = 0
    avg_job_time_hours: float = 0.0
    avg_job_quality: float = 0.0
    total_data_transferred_mb: float = 0.0
    total_messages: int = 0
    avg_latency_ms: float = 0.0
    total_tflops_hours: float = 0.0
    utilization: float = 0.0
    routing_decisions: int = 0
    remote_routes: int = 0
    local_routes: int = 0
    packets_lost: int = 0
    packets_corrupted: int = 0
    events: List[Tuple[float, str]] = field(default_factory=list)

    def print_summary(self):
        print(f"\n{'='*60}")
        print(f"SIMULATION RESULTS")
        print(f"{'='*60}")
        print(f"Config: {self.total_nodes} nodes, {self.simulated_hours:.1f}h simulated")
        print(f"Wall time: {self.wall_time_s:.1f}s")
        print(f"")
        print(f"--- Nodes ---")
        print(f"  Average online:  {self.avg_online_nodes:.0f} / {self.total_nodes} ({self.avg_online_nodes/max(self.total_nodes,1)*100:.1f}%)")
        print(f"  Failures:        {self.node_failures}")
        print(f"  Byzantine caught:{self.byzantine_detections}")
        print(f"")
        print(f"--- Jobs ---")
        print(f"  Submitted:       {self.total_jobs}")
        print(f"  Completed:       {self.completed_jobs} ({self.completed_jobs/max(self.total_jobs,1)*100:.1f}%)")
        print(f"  Failed:          {self.failed_jobs}")
        if self.completed_jobs > 0:
            print(f"  Avg time:        {self.avg_job_time_hours*60:.1f} minutes")
            print(f"  Avg quality:     {self.avg_job_quality:.3f}")
        print(f"")
        print(f"--- Network ---")
        print(f"  Data transferred:{self.total_data_transferred_mb:.0f} MB")
        print(f"  Messages:        {self.total_messages}")
        print(f"  Avg latency:     {self.avg_latency_ms:.1f} ms")
        print(f"  Packets lost:    {self.packets_lost}")
        print(f"  Packets corrupt: {self.packets_corrupted}")
        print(f"")
        print(f"--- Compute ---")
        print(f"  Total:           {self.total_tflops_hours:.1f} TFLOPS-hours")
        print(f"  Utilization:     {self.utilization*100:.1f}%")
        print(f"")
        print(f"--- Routing ---")
        print(f"  Decisions:       {self.routing_decisions}")
        print(f"  Local:           {self.local_routes} ({self.local_routes/max(self.routing_decisions,1)*100:.1f}%)")
        print(f"  Remote:          {self.remote_routes} ({self.remote_routes/max(self.routing_decisions,1)*100:.1f}%)")
        print(f"{'='*60}")


class SimulatedMesh:
    def __init__(self, config: SimConfig):
        self.config = config
        self.nodes: Dict[str, SimulatedNode] = {}
        self.jobs: List[TrainingJob] = []
        self.current_time: float = 0.0
        self.result = SimulationResult(config=config)
        self._build_network()

    def _build_network(self):
        tiers = []
        for tier_name, fraction in self.config.tier_distribution.items():
            count = int(self.config.num_nodes * fraction)
            tiers.extend([Tier(tier_name)] * count)
        while len(tiers) < self.config.num_nodes:
            tiers.append(Tier.EDGE)
        random.shuffle(tiers)
        for i, tier in enumerate(tiers):
            node_id = f"sim_{i:06d}"
            node = SimulatedNode.random(node_id, tier)
            if random.random() < self.config.byzantine_fraction:
                node.is_byzantine = True
            self.nodes[node_id] = node
        self.result.total_nodes = len(self.nodes)

    def _latency_between(self, node_a: SimulatedNode, node_b: SimulatedNode) -> float:
        dx = node_a.geo_x - node_b.geo_x
        dy = node_a.geo_y - node_b.geo_y
        distance = math.sqrt(dx*dx + dy*dy)
        geo_latency = distance * 0.1
        total = node_a.base_latency_ms + node_b.base_latency_ms + geo_latency
        total *= random.uniform(0.8, 1.2)
        return total

    def _select_nodes_for_job(self, job: TrainingJob) -> List[str]:
        online = [nid for nid, n in self.nodes.items() if n.is_online and n.tflops > 0]
        if not online:
            return []
        needed = min(
            self.config.redundancy_factor * max(1, job.nanos_count // 50),
            len(online)
        )
        weights = []
        for nid in online:
            n = self.nodes[nid]
            w = n.tflops * n.reputation
            if n.tier == Tier.ULTRA:
                w *= 4
            elif n.tier == Tier.CORE:
                w *= 2
            elif n.tier == Tier.EDGE:
                w *= 1
            else:
                w *= 0.5
            weights.append(max(w, 0.01))
        selected = []
        remaining = list(zip(online, weights))
        for _ in range(needed):
            if not remaining:
                break
            total = sum(w for _, w in remaining)
            r = random.uniform(0, total)
            cumulative = 0
            for idx, (nid, w) in enumerate(remaining):
                cumulative += w
                if cumulative >= r:
                    selected.append(nid)
                    remaining.pop(idx)
                    break
        return selected

    def _simulate_packet_effects(self, num_messages: int) -> Tuple[int, int]:
        """Simulate packet loss and corruption. Returns (lost, corrupted)."""
        lost = sum(1 for _ in range(num_messages) if random.random() < self.config.packet_loss_rate)
        corrupted = sum(1 for _ in range(num_messages - lost) if random.random() < self.config.corruption_rate)
        return lost, corrupted

    def _execute_job_step(self, job: TrainingJob, time_step_hours: float) -> bool:
        if job.completed or job.failed:
            return job.completed
        alive_nodes = [nid for nid in job.assigned_nodes
                       if nid in self.nodes and self.nodes[nid].is_online]
        if not alive_nodes:
            job.failed = True
            return False
        total_tflops = sum(self.nodes[nid].tflops for nid in alive_nodes)
        flops_available = total_tflops * 1e12 * time_step_hours * 3600
        flops_per_step_total = job.flops_per_step * job.nanos_count
        if flops_per_step_total > 0:
            steps_possible = int(flops_available / flops_per_step_total)
        else:
            steps_possible = job.steps
        steps_done = min(steps_possible, job.steps - job.completed_steps)
        job.completed_steps += steps_done

        compute_used = steps_done * flops_per_step_total / 1e12 / 3600
        self.result.total_tflops_hours += compute_used
        for nid in alive_nodes:
            self.nodes[nid].compute_used += compute_used / len(alive_nodes)

        if len(alive_nodes) > 1:
            data_per_sync = job.nanos_count * self.config.nano_size_mb
            msg_count = len(alive_nodes) * 2
            lost, corrupted = self._simulate_packet_effects(msg_count)
            self.result.packets_lost += lost
            self.result.packets_corrupted += corrupted
            effective_msgs = msg_count - lost
            for nid in alive_nodes:
                self.nodes[nid].data_transferred_mb += data_per_sync
                self.result.total_data_transferred_mb += data_per_sync
            self.result.total_messages += effective_msgs

        self.result.routing_decisions += steps_done
        self.result.local_routes += steps_done * len(alive_nodes)
        if len(alive_nodes) > 1:
            self.result.remote_routes += steps_done * (len(alive_nodes) - 1)

        byzantine_in_group = any(self.nodes[nid].is_byzantine for nid in alive_nodes)
        if byzantine_in_group and len(alive_nodes) >= self.config.redundancy_factor:
            self.result.byzantine_detections += 1
            job.result_quality = max(0, job.result_quality - 0.05)

        if job.completed_steps >= job.steps:
            job.completed = True
            job.completed_at = self.current_time
            base_quality = 1.0
            if byzantine_in_group:
                base_quality -= 0.1
            job.result_quality = max(base_quality, 0.0)
            return True
        return False

    def simulate(self, hours: Optional[float] = None) -> SimulationResult:
        if hours is None:
            hours = self.config.duration_hours
        wall_start = time.perf_counter()
        time_step = self.config.time_step_minutes / 60.0
        total_steps = int(hours / time_step)
        online_counts = []
        latencies = []
        job_counter = 0
        pending_jobs: List[TrainingJob] = []
        completed_jobs: List[TrainingJob] = []

        for step in range(total_steps):
            self.current_time = step * time_step

            # Node churn
            for node in self.nodes.values():
                node.check_churn()
                if node.check_failure(time_step):
                    self.result.node_failures += 1
            online = sum(1 for n in self.nodes.values() if n.is_online)
            online_counts.append(online)

            # Job arrivals: proper Poisson sampling
            expected_jobs = self.config.job_arrival_rate * time_step
            # Poisson: number of events in interval
            num_new_jobs = 0
            if expected_jobs > 0:
                # numpy-free Poisson sampling (Knuth algorithm)
                L = math.exp(-expected_jobs)
                k = 0
                p = 1.0
                while True:
                    k += 1
                    p *= random.random()
                    if p < L:
                        break
                num_new_jobs = k - 1

            for _ in range(num_new_jobs):
                job_counter += 1
                job = TrainingJob(
                    job_id=f"job_{job_counter:06d}",
                    nanos_count=self.config.nanos_per_job,
                    steps=self.config.steps_per_job,
                    flops_per_step=self.config.nano_flops_per_step,
                    created_at=self.current_time,
                )
                assigned = self._select_nodes_for_job(job)
                if assigned:
                    job.assigned_nodes = assigned
                    pending_jobs.append(job)
                    self.result.total_jobs += 1
                else:
                    job.failed = True
                    self.result.total_jobs += 1
                    self.result.failed_jobs += 1

            # Execute pending jobs
            still_pending = []
            for job in pending_jobs:
                completed = self._execute_job_step(job, time_step)
                if completed:
                    completed_jobs.append(job)
                    self.result.completed_jobs += 1
                elif job.failed:
                    self.result.failed_jobs += 1
                else:
                    still_pending.append(job)
            pending_jobs = still_pending

            # Latency sampling
            if step % 10 == 0 and len(self.nodes) >= 2:
                online_nodes = [n for n in self.nodes.values() if n.is_online]
                if len(online_nodes) >= 2:
                    for _ in range(min(5, len(online_nodes))):
                        a, b = random.sample(online_nodes, 2)
                        latencies.append(self._latency_between(a, b))

            # Progress logging
            if total_steps >= 10 and step > 0 and step % (total_steps // 10) == 0:
                pct = step / total_steps * 100
                logger.info(f"  {pct:.0f}% -- {online}/{len(self.nodes)} online, "
                           f"{len(pending_jobs)} pending, {self.result.completed_jobs} done")

        # Final stats
        self.result.wall_time_s = time.perf_counter() - wall_start
        self.result.simulated_hours = hours
        self.result.avg_online_nodes = sum(online_counts) / max(len(online_counts), 1)

        if latencies:
            self.result.avg_latency_ms = sum(latencies) / len(latencies)

        if completed_jobs:
            # FIX: Track actual elapsed time per job
            job_times = [j.completed_at - j.created_at for j in completed_jobs
                        if j.completed_at > j.created_at]
            self.result.avg_job_time_hours = (sum(job_times) / len(job_times)) if job_times else 0
            self.result.avg_job_quality = sum(j.result_quality for j in completed_jobs) / len(completed_jobs)

        total_available = sum(n.tflops for n in self.nodes.values()) * hours
        if total_available > 0:
            self.result.utilization = self.result.total_tflops_hours / total_available

        for job in pending_jobs:
            if not job.completed:
                self.result.failed_jobs += 1

        self.jobs = completed_jobs + pending_jobs
        return self.result
