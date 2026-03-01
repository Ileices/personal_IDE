"""
Global Compute Pool — Beyond peer-to-peer.

Architecture:
  - Permanent Global Nodes: Owner's machines (always available, anchor the pool)
  - Donation Pool: Users opt-in to donate a % of idle compute
  - Job Distribution: Tasks sent to pool members based on capacity + donation %
  - Idle Training: When global compute is idle, auto-train the nano sea
  - Diffusion Inference: Parallel across many nodes for massive throughput

The global pool is SEPARATE from peer-to-peer connections:
  - Peer connection = personal compute sharing with specific people/groups
  - Global pool = shared resource anyone can contribute to and draw from
"""
from __future__ import annotations
import asyncio, json, time, logging, hashlib, uuid
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional, Any, Set
from pathlib import Path
from enum import Enum

logger = logging.getLogger(__name__)


class PoolRole(str, Enum):
    PERMANENT = "permanent"     # Owner's machines — always in pool
    DONOR = "donor"             # Contributing compute
    CONSUMER = "consumer"       # Using pool compute
    IDLE = "idle"               # Connected but not active


class JobState(str, Enum):
    QUEUED = "queued"
    DISTRIBUTING = "distributing"
    RUNNING = "running"
    AGGREGATING = "aggregating"
    COMPLETE = "complete"
    FAILED = "failed"


@dataclass
class PoolMember:
    """A machine registered in the global compute pool."""
    node_id: str
    username: str
    hostname: str
    role: PoolRole
    # Compute capabilities
    compute_grade: float = 0.0
    tier: int = 10
    has_cuda: bool = False
    gpu_vram_gb: float = 0.0
    ram_gb: float = 0.0
    cpu_cores: int = 0
    # Donation settings
    donation_percent: int = 0       # 0-100% of idle compute to donate
    max_concurrent_jobs: int = 1    # How many jobs this node can run at once
    active_jobs: int = 0
    # Status
    is_online: bool = False
    last_heartbeat: float = 0.0
    total_jobs_completed: int = 0
    total_compute_hours: float = 0.0
    respect_score: float = 500.0

    def available_capacity(self) -> float:
        """How much of this node's capacity is available right now."""
        if not self.is_online:
            return 0.0
        usage_ratio = self.active_jobs / max(self.max_concurrent_jobs, 1)
        donation_factor = self.donation_percent / 100.0
        return max(0, (1.0 - usage_ratio) * donation_factor * self.compute_grade)

    def to_dict(self) -> dict:
        d = asdict(self)
        d['available_capacity'] = self.available_capacity()
        return d


@dataclass
class PoolJob:
    """A compute job distributed across the pool."""
    job_id: str = field(default_factory=lambda: uuid.uuid4().hex[:16])
    source_node: str = ""
    job_type: str = "training"      # training, inference, build, scan
    description: str = ""
    state: JobState = JobState.QUEUED
    # Distribution
    total_shards: int = 1
    assigned_shards: Dict[str, int] = field(default_factory=dict)  # node_id -> shard count
    completed_shards: int = 0
    failed_shards: int = 0
    # Payload
    payload: Dict[str, Any] = field(default_factory=dict)
    results: Dict[str, Any] = field(default_factory=dict)
    # Timing
    created_at: float = field(default_factory=time.time)
    started_at: float = 0.0
    completed_at: float = 0.0
    timeout_s: float = 300.0
    # Priority
    priority: int = 5              # 1=highest, 10=lowest
    require_gpu: bool = False

    def elapsed(self) -> float:
        if self.started_at:
            return (self.completed_at or time.time()) - self.started_at
        return 0.0

    def to_dict(self) -> dict:
        return {
            "job_id": self.job_id,
            "job_type": self.job_type,
            "description": self.description,
            "state": self.state.value,
            "total_shards": self.total_shards,
            "completed_shards": self.completed_shards,
            "failed_shards": self.failed_shards,
            "elapsed_s": round(self.elapsed(), 1),
            "priority": self.priority,
        }


class GlobalComputePool:
    """
    Manages the global compute pool — a shared resource that goes beyond P2P.

    Key concepts:
      - Permanent nodes anchor the network (owner's machines)
      - Donors contribute idle compute at a configurable %
      - Jobs are sharded and distributed based on capacity
      - Idle time is used for continuous nano training
      - Diffusion inference: split work across many nodes in parallel
    """

    def __init__(self, local_node_id: str, data_dir: str = "nano_data/pool"):
        self.local_node_id = local_node_id
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)

        self._members: Dict[str, PoolMember] = {}
        self._jobs: Dict[str, PoolJob] = {}
        self._permanent_node_ids: Set[str] = set()
        self._running = False
        self._idle_training_enabled = True
        self._idle_task: Optional[asyncio.Task] = None
        self._job_watcher_task: Optional[asyncio.Task] = None

        # Protect shared mutable state in async context
        self._lock = asyncio.Lock()

        # Load persisted state
        self._load_state()

    # ── Pool Membership ────────────────────────────────────────
    def register_member(self, member: PoolMember) -> None:
        """Register a node in the global pool."""
        self._members[member.node_id] = member
        if member.role == PoolRole.PERMANENT:
            self._permanent_node_ids.add(member.node_id)
        logger.info(f"Pool member registered: {member.username}@{member.hostname} "
                     f"(grade={member.compute_grade}, donation={member.donation_percent}%)")
        self._save_state()

    def update_member(self, node_id: str, **kwargs) -> None:
        """Update a pool member's settings."""
        member = self._members.get(node_id)
        if member:
            for k, v in kwargs.items():
                if hasattr(member, k):
                    setattr(member, k, v)
            self._save_state()

    def set_donation_percent(self, node_id: str, percent: int) -> None:
        """Set how much idle compute this node donates (0-100%)."""
        percent = max(0, min(100, percent))
        self.update_member(node_id, donation_percent=percent)
        logger.info(f"Node {node_id[:12]} donation set to {percent}%")

    def add_permanent_node(self, node_id: str) -> None:
        """Mark a node as a permanent global node (owner's machines)."""
        self._permanent_node_ids.add(node_id)
        if node_id in self._members:
            self._members[node_id].role = PoolRole.PERMANENT
        self._save_state()

    def remove_member(self, node_id: str) -> None:
        self._members.pop(node_id, None)
        self._permanent_node_ids.discard(node_id)
        self._save_state()

    def heartbeat(self, node_id: str) -> None:
        member = self._members.get(node_id)
        if member:
            member.last_heartbeat = time.time()
            member.is_online = True

    # ── Online Members ─────────────────────────────────────────
    def get_online_members(self) -> List[PoolMember]:
        now = time.time()
        return [m for m in self._members.values()
                if m.is_online and now - m.last_heartbeat < 120]

    def get_available_workers(self, require_gpu: bool = False) -> List[PoolMember]:
        """Get pool members with available capacity, sorted by capacity."""
        workers = []
        for m in self.get_online_members():
            if m.available_capacity() <= 0:
                continue
            if require_gpu and not m.has_cuda:
                continue
            workers.append(m)
        workers.sort(key=lambda w: w.available_capacity(), reverse=True)
        return workers

    def total_pool_capacity(self) -> float:
        return sum(m.available_capacity() for m in self.get_online_members())

    # ── Job Submission ─────────────────────────────────────────
    async def submit_job(self, job: PoolJob) -> str:
        """Submit a job to the global pool for distributed execution."""
        async with self._lock:
            self._jobs[job.job_id] = job
            logger.info(f"Job submitted: {job.job_id} ({job.job_type}, {job.total_shards} shards)")
            # Distribute immediately
            await self._distribute_job(job)
        return job.job_id

    async def _distribute_job(self, job: PoolJob) -> None:
        """Distribute job shards to available workers."""
        workers = self.get_available_workers(require_gpu=job.require_gpu)
        if not workers:
            logger.warning(f"No workers available for job {job.job_id}")
            return

        job.state = JobState.DISTRIBUTING
        job.started_at = time.time()

        # Distribute shards proportionally to available capacity
        total_capacity = sum(w.available_capacity() for w in workers)
        remaining_shards = job.total_shards

        for worker in workers:
            if remaining_shards <= 0:
                break
            share = max(1, int(job.total_shards * worker.available_capacity() / total_capacity))
            share = min(share, remaining_shards)
            job.assigned_shards[worker.node_id] = share
            worker.active_jobs += 1
            remaining_shards -= share

        # If shards remain, assign to first worker
        if remaining_shards > 0 and workers:
            first = workers[0].node_id
            job.assigned_shards[first] = job.assigned_shards.get(first, 0) + remaining_shards

        job.state = JobState.RUNNING
        logger.info(f"Job {job.job_id} distributed to {len(job.assigned_shards)} workers")

    def report_shard_complete(self, job_id: str, node_id: str, result: Any = None) -> None:
        """Worker reports a shard completion."""
        job = self._jobs.get(job_id)
        if not job:
            return
        job.completed_shards += 1
        if result is not None:
            job.results[node_id] = result

        # Update worker stats
        member = self._members.get(node_id)
        if member:
            member.active_jobs = max(0, member.active_jobs - 1)

        if job.completed_shards + job.failed_shards >= job.total_shards:
            job.state = JobState.COMPLETE
            job.completed_at = time.time()
            if member:
                member.total_jobs_completed += 1
            logger.info(f"Job {job.job_id} complete: {job.completed_shards}/{job.total_shards} shards in {job.elapsed():.1f}s")

    def report_shard_failed(self, job_id: str, node_id: str, error: str = "") -> None:
        job = self._jobs.get(job_id)
        if not job:
            return
        job.failed_shards += 1
        member = self._members.get(node_id)
        if member:
            member.active_jobs = max(0, member.active_jobs - 1)
        if job.completed_shards + job.failed_shards >= job.total_shards:
            job.state = JobState.FAILED if job.failed_shards > job.completed_shards else JobState.COMPLETE
            job.completed_at = time.time()

    # ── Diffusion Inference ────────────────────────────────────
    async def diffusion_inference(self, query: str, nano_types: List[str],
                                   parallelism: int = 0) -> Dict[str, Any]:
        """
        Diffusion-style parallel inference: split work across pool nodes.
        Each node runs different nanos on the same query simultaneously.
        Results are aggregated back.
        """
        workers = self.get_available_workers()
        if not workers:
            return {"error": "No pool workers available", "results": []}

        if parallelism <= 0:
            parallelism = len(workers)

        # Split nano types across workers
        shards = []
        for i, nano_type in enumerate(nano_types):
            worker_idx = i % min(parallelism, len(workers))
            if worker_idx >= len(shards):
                shards.append([])
            shards[worker_idx].append(nano_type)

        job = PoolJob(
            source_node=self.local_node_id,
            job_type="diffusion_inference",
            description=f"Parallel inference across {len(shards)} nodes, {len(nano_types)} nanos",
            total_shards=len(shards),
            payload={"query": query, "shards": shards},
            priority=2,
        )

        await self.submit_job(job)
        return {"job_id": job.job_id, "shards": len(shards), "workers": len(workers)}

    # ── Idle Training ──────────────────────────────────────────
    async def start(self) -> None:
        """Start the global pool services."""
        self._running = True
        self._idle_task = asyncio.create_task(self._idle_training_loop())
        self._job_watcher_task = asyncio.create_task(self._job_watcher_loop())
        logger.info(f"Global compute pool started ({len(self._members)} members, "
                     f"{len(self._permanent_node_ids)} permanent)")

    async def stop(self) -> None:
        self._running = False
        if self._idle_task:
            self._idle_task.cancel()
        if self._job_watcher_task:
            self._job_watcher_task.cancel()
        self._save_state()

    async def _idle_training_loop(self) -> None:
        """When pool is idle, continuously train the nano sea."""
        while self._running:
            try:
                await asyncio.sleep(60)  # Check every minute
                if not self._idle_training_enabled:
                    continue

                # Check if pool is idle (no active jobs)
                active = sum(1 for j in self._jobs.values() if j.state == JobState.RUNNING)
                if active > 0:
                    continue

                available = self.total_pool_capacity()
                if available < 5.0:  # Minimum capacity threshold
                    continue

                # Submit idle training job
                job = PoolJob(
                    source_node=self.local_node_id,
                    job_type="idle_training",
                    description="Background nano sea training (idle pool utilization)",
                    total_shards=max(1, int(available / 10)),
                    priority=10,  # Lowest priority
                    timeout_s=120,
                )
                await self.submit_job(job)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"Idle training error: {e}")

    async def _job_watcher_loop(self) -> None:
        """Watch for timed-out jobs and stale members."""
        while self._running:
            try:
                await asyncio.sleep(30)
                now = time.time()

                # Timeout running jobs
                for job in list(self._jobs.values()):
                    if job.state == JobState.RUNNING and job.elapsed() > job.timeout_s:
                        job.state = JobState.FAILED
                        job.completed_at = now
                        logger.warning(f"Job {job.job_id} timed out after {job.timeout_s}s")

                # Mark stale members offline
                for member in self._members.values():
                    if member.is_online and now - member.last_heartbeat > 120:
                        member.is_online = False
                        member.active_jobs = 0

                # Clean old completed jobs (keep last 100)
                completed = [(j.completed_at, j.job_id) for j in self._jobs.values()
                             if j.state in (JobState.COMPLETE, JobState.FAILED)]
                if len(completed) > 100:
                    completed.sort()
                    for _, jid in completed[:-100]:
                        del self._jobs[jid]

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"Job watcher error: {e}")

    # ── Stats ──────────────────────────────────────────────────
    @property
    def stats(self) -> dict:
        online = self.get_online_members()
        active_jobs = [j for j in self._jobs.values() if j.state == JobState.RUNNING]
        return {
            "total_members": len(self._members),
            "online_members": len(online),
            "permanent_nodes": len(self._permanent_node_ids),
            "total_pool_capacity": round(self.total_pool_capacity(), 1),
            "active_jobs": len(active_jobs),
            "total_jobs_completed": sum(m.total_jobs_completed for m in self._members.values()),
            "idle_training_enabled": self._idle_training_enabled,
        }

    # ── Persistence ────────────────────────────────────────────
    def _save_state(self) -> None:
        state = {
            "members": {nid: m.to_dict() for nid, m in self._members.items()},
            "permanent_nodes": list(self._permanent_node_ids),
        }
        (self.data_dir / "pool_state.json").write_text(json.dumps(state, indent=2))

    def _load_state(self) -> None:
        state_file = self.data_dir / "pool_state.json"
        if state_file.exists():
            try:
                state = json.loads(state_file.read_text())
                self._permanent_node_ids = set(state.get("permanent_nodes", []))
                for nid, mdata in state.get("members", {}).items():
                    mdata.pop("available_capacity", None)
                    member = PoolMember(**{k: v for k, v in mdata.items()
                                          if k in PoolMember.__dataclass_fields__})
                    member.is_online = False  # Must re-heartbeat
                    self._members[nid] = member
            except Exception as e:
                logger.warning(f"Failed to load pool state: {e}")
