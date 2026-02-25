"""
Mesh Task Queue — distributes tasks across local and mesh nodes.

When a task arrives:
1. Check if local node can handle it (GPU/RAM/load)
2. If yes → execute locally
3. If no → check mesh peers, select best via LoadBalancer
4. Send task via encrypted transport
5. Await result with latency-compensated timeout
"""
from __future__ import annotations
import asyncio, time, uuid, logging
from dataclasses import dataclass, field
from typing import Dict, Optional, Any, Callable, Awaitable
from enum import Enum

logger = logging.getLogger(__name__)


class MeshTaskState(Enum):
    QUEUED = "queued"
    DISPATCHED = "dispatched"
    RUNNING_LOCAL = "running_local"
    RUNNING_REMOTE = "running_remote"
    COMPLETED = "completed"
    FAILED = "failed"
    TIMEOUT = "timeout"


@dataclass
class MeshTask:
    task_id: str = field(default_factory=lambda: str(uuid.uuid4())[:12])
    nano_type: str = ""
    input_data: Any = None
    require_gpu: bool = False
    min_ram_gb: float = 0.0
    priority: float = 0.5
    timeout_ms: float = 30000.0
    # Routing
    state: MeshTaskState = MeshTaskState.QUEUED
    assigned_node: Optional[str] = None
    # Result
    result: Any = None
    error: Optional[str] = None
    # Timing
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None


class MeshTaskQueue:
    """Manages task distribution across local and mesh nodes."""

    def __init__(self, local_node_id: str, max_local_queue: int = 100):
        self._local_id = local_node_id
        self._tasks: Dict[str, MeshTask] = {}
        self._local_queue: asyncio.Queue = asyncio.Queue(maxsize=max_local_queue)
        self._result_futures: Dict[str, asyncio.Future] = {}
        self._running = False
        self._total_dispatched = 0
        self._total_completed = 0
        self._total_failed = 0
        # External handlers
        self._local_executor: Optional[Callable] = None
        self._remote_sender: Optional[Callable] = None
        self._load_balancer = None
        self._latency_comp = None

    def set_local_executor(self, fn: Callable[[MeshTask], Awaitable[Any]]) -> None:
        self._local_executor = fn

    def set_remote_sender(self, fn: Callable[[str, MeshTask], Awaitable[bool]]) -> None:
        self._remote_sender = fn

    def set_load_balancer(self, lb) -> None:
        self._load_balancer = lb

    def set_latency_compensator(self, lc) -> None:
        self._latency_comp = lc

    # ── Submission ─────────────────────────────────────────────
    async def submit(self, task: MeshTask) -> asyncio.Future:
        """Submit a task. Returns a Future for the result."""
        self._tasks[task.task_id] = task
        self._total_dispatched += 1

        future = asyncio.get_event_loop().create_future()
        self._result_futures[task.task_id] = future

        # Decide: local or remote?
        decision = None
        if self._load_balancer:
            decision = self._load_balancer.select_worker(
                require_gpu=task.require_gpu,
                min_ram_gb=task.min_ram_gb,
            )

        if decision and not decision.worker_id.startswith(self._local_id[:12]):
            # Remote dispatch
            task.state = MeshTaskState.DISPATCHED
            task.assigned_node = decision.worker_id
            if self._remote_sender:
                sent = await self._remote_sender(decision.worker_id, task)
                if sent:
                    task.state = MeshTaskState.RUNNING_REMOTE
                    task.started_at = time.time()
                    # Set timeout
                    timeout = task.timeout_ms / 1000.0
                    if self._latency_comp:
                        profile = self._latency_comp.get_profile(decision.worker_id)
                        if profile:
                            timeout += profile.p95_ms / 1000.0 * 2  # add RTT buffer
                    asyncio.create_task(self._timeout_watcher(task.task_id, timeout))
                else:
                    # Fallback to local
                    await self._run_local(task)
            else:
                await self._run_local(task)
        else:
            # Local execution
            await self._run_local(task)

        return future

    async def _run_local(self, task: MeshTask) -> None:
        task.state = MeshTaskState.RUNNING_LOCAL
        task.assigned_node = self._local_id
        task.started_at = time.time()

        if self._local_executor:
            try:
                result = await self._local_executor(task)
                self.complete_task(task.task_id, result)
            except Exception as e:
                self.fail_task(task.task_id, str(e))
        else:
            self.fail_task(task.task_id, "No local executor configured")

    async def _timeout_watcher(self, task_id: str, timeout: float) -> None:
        await asyncio.sleep(timeout)
        task = self._tasks.get(task_id)
        if task and task.state in (MeshTaskState.RUNNING_REMOTE, MeshTaskState.DISPATCHED):
            task.state = MeshTaskState.TIMEOUT
            task.error = f"Timeout after {timeout:.1f}s"
            future = self._result_futures.pop(task_id, None)
            if future and not future.done():
                future.set_exception(TimeoutError(task.error))
            self._total_failed += 1

    # ── Completion ─────────────────────────────────────────────
    def complete_task(self, task_id: str, result: Any) -> None:
        task = self._tasks.get(task_id)
        if task:
            task.state = MeshTaskState.COMPLETED
            task.result = result
            task.completed_at = time.time()
            self._total_completed += 1

        future = self._result_futures.pop(task_id, None)
        if future and not future.done():
            future.set_result(result)

    def fail_task(self, task_id: str, error: str) -> None:
        task = self._tasks.get(task_id)
        if task:
            task.state = MeshTaskState.FAILED
            task.error = error
            task.completed_at = time.time()
            self._total_failed += 1

        future = self._result_futures.pop(task_id, None)
        if future and not future.done():
            future.set_exception(RuntimeError(error))

    # ── Incoming Results (from remote nodes) ───────────────────
    def handle_remote_result(self, task_id: str, result: Any) -> None:
        """Called when a remote node sends back a result."""
        self.complete_task(task_id, result)

    def handle_remote_failure(self, task_id: str, error: str) -> None:
        self.fail_task(task_id, f"Remote: {error}")

    # ── Stats ──────────────────────────────────────────────────
    @property
    def stats(self) -> dict:
        return {
            "total_dispatched": self._total_dispatched,
            "total_completed": self._total_completed,
            "total_failed": self._total_failed,
            "pending": sum(1 for t in self._tasks.values() if t.state in
                          (MeshTaskState.QUEUED, MeshTaskState.DISPATCHED)),
            "running_local": sum(1 for t in self._tasks.values() if t.state == MeshTaskState.RUNNING_LOCAL),
            "running_remote": sum(1 for t in self._tasks.values() if t.state == MeshTaskState.RUNNING_REMOTE),
        }
