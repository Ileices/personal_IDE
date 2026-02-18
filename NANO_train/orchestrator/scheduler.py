"""
PTAIE Priority Scheduler — schedules nano execution based on PTAIE vectors.

P (Priority) × T (Temporal urgency) determines execution order.
A (Associative) affects resource allocation.
I (Importance) determines survival during resource pressure.
E (Entropy/Novelty) biases exploration vs exploitation.

Handles both local (this machine) and global (mesh) task queues.
"""
from __future__ import annotations
import asyncio, heapq, time, logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Callable, Awaitable, Any, TYPE_CHECKING
from enum import Enum

if TYPE_CHECKING:
    from nanos.base import BaseNano

logger = logging.getLogger(__name__)


class TaskState(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass(order=True)
class ScheduledTask:
    """A task in the priority queue."""
    priority: float = field(compare=True)  # lower = higher priority (negated)
    task_id: str = field(compare=False)
    nano_type: str = field(compare=False)
    input_data: Any = field(compare=False, default=None)
    callback: Optional[Callable] = field(compare=False, default=None)
    state: TaskState = field(compare=False, default=TaskState.PENDING)
    created_at: float = field(compare=False, default_factory=time.time)
    started_at: Optional[float] = field(compare=False, default=None)
    completed_at: Optional[float] = field(compare=False, default=None)
    result: Any = field(compare=False, default=None)
    error: Optional[str] = field(compare=False, default=None)
    # Mesh routing
    prefer_local: bool = field(compare=False, default=True)
    require_gpu: bool = field(compare=False, default=False)


class PTAIEScheduler:
    """PTAIE-aware task scheduler with priority queuing.

    Scheduling formula:
        urgency = P × T × (1 + A × 0.3) × temporal_boost
        temporal_boost = 1.0 + min(age / deadline, 2.0) if deadline else 1.0

    Features:
    - Priority queue sorted by PTAIE urgency
    - Concurrent execution with configurable parallelism
    - GPU vs CPU task routing
    - Starvation prevention (age-based priority boost)
    - Task cancellation and timeout
    """

    def __init__(
        self,
        max_concurrent_cpu: int = 4,
        max_concurrent_gpu: int = 1,
        starvation_boost_seconds: float = 10.0,
        task_timeout: float = 30.0,
    ):
        self._task_queue: List[ScheduledTask] = []
        self._running_tasks: Dict[str, asyncio.Task] = {}
        self._completed: Dict[str, ScheduledTask] = {}
        self._nanos: Dict[str, "BaseNano"] = {}
        self._max_cpu = max_concurrent_cpu
        self._max_gpu = max_concurrent_gpu
        self._starvation_boost = starvation_boost_seconds
        self._task_timeout = task_timeout
        self._running = False
        self._task_counter = 0
        self._loop_task: Optional[asyncio.Task] = None
        self._semaphore_cpu = asyncio.Semaphore(max_concurrent_cpu)
        self._semaphore_gpu = asyncio.Semaphore(max_concurrent_gpu)

    def register_nano(self, nano: "BaseNano") -> None:
        self._nanos[nano.NANO_TYPE] = nano

    # ── Task Submission ────────────────────────────────────────
    def submit(
        self,
        nano_type: str,
        input_data: Any = None,
        callback: Optional[Callable] = None,
        require_gpu: bool = False,
        priority_override: Optional[float] = None,
    ) -> str:
        """Submit a task. Returns task_id."""
        self._task_counter += 1
        task_id = f"task-{self._task_counter}"

        nano = self._nanos.get(nano_type)
        if nano and priority_override is None:
            ptaie = nano.ptaie
            urgency = -(ptaie.p * ptaie.t * (1.0 + ptaie.a * 0.3))
        else:
            urgency = priority_override or -0.5

        task = ScheduledTask(
            priority=urgency,
            task_id=task_id,
            nano_type=nano_type,
            input_data=input_data,
            callback=callback,
            require_gpu=require_gpu,
        )
        heapq.heappush(self._task_queue, task)
        return task_id

    def cancel(self, task_id: str) -> bool:
        """Cancel a pending or running task."""
        # Cancel running
        if task_id in self._running_tasks:
            self._running_tasks[task_id].cancel()
            return True
        # Cancel pending
        for task in self._task_queue:
            if task.task_id == task_id and task.state == TaskState.PENDING:
                task.state = TaskState.CANCELLED
                return True
        return False

    def get_status(self, task_id: str) -> Optional[ScheduledTask]:
        for task in self._task_queue:
            if task.task_id == task_id:
                return task
        return self._completed.get(task_id)

    # ── Scheduler Loop ─────────────────────────────────────────
    async def start(self) -> None:
        self._running = True
        self._loop_task = asyncio.create_task(self._scheduler_loop())
        logger.info("PTAIE Scheduler started")

    async def stop(self) -> None:
        self._running = False
        for task in self._running_tasks.values():
            task.cancel()
        if self._loop_task:
            self._loop_task.cancel()
            try:
                await self._loop_task
            except asyncio.CancelledError:
                pass
        logger.info("PTAIE Scheduler stopped")

    async def _scheduler_loop(self) -> None:
        while self._running:
            # Apply starvation boost
            now = time.time()
            for task in self._task_queue:
                if task.state == TaskState.PENDING:
                    age = now - task.created_at
                    if age > self._starvation_boost:
                        boost = min(age / self._starvation_boost, 3.0) * 0.1
                        task.priority -= boost  # lower = higher priority

            # Dispatch tasks
            while self._task_queue:
                task = self._task_queue[0]
                if task.state == TaskState.CANCELLED:
                    heapq.heappop(self._task_queue)
                    continue

                # Check capacity
                sem = self._semaphore_gpu if task.require_gpu else self._semaphore_cpu
                if sem._value <= 0:  # no capacity
                    break

                task = heapq.heappop(self._task_queue)
                if task.state != TaskState.PENDING:
                    continue

                asyncio.create_task(self._execute_task(task, sem))

            await asyncio.sleep(0.01)  # 10ms tick

    async def _execute_task(self, task: ScheduledTask, sem: asyncio.Semaphore) -> None:
        async with sem:
            task.state = TaskState.RUNNING
            task.started_at = time.time()
            run_task = asyncio.current_task()
            if run_task:
                self._running_tasks[task.task_id] = run_task

            try:
                nano = self._nanos.get(task.nano_type)
                if nano is None:
                    raise RuntimeError(f"Nano type {task.nano_type} not registered")

                import torch
                with torch.no_grad():
                    if task.input_data is not None:
                        result = nano(task.input_data)
                    else:
                        # Default: pass a zero tensor
                        result = nano(torch.zeros(1, nano.input_size))

                task.result = result
                task.state = TaskState.COMPLETED

                if task.callback:
                    await task.callback(result) if asyncio.iscoroutinefunction(task.callback) else task.callback(result)

            except asyncio.CancelledError:
                task.state = TaskState.CANCELLED
            except Exception as e:
                task.state = TaskState.FAILED
                task.error = str(e)
                logger.error(f"Task {task.task_id} ({task.nano_type}) failed: {e}")
            finally:
                task.completed_at = time.time()
                self._running_tasks.pop(task.task_id, None)
                self._completed[task.task_id] = task

    # ── Stats ──────────────────────────────────────────────────
    @property
    def stats(self) -> dict:
        pending = sum(1 for t in self._task_queue if t.state == TaskState.PENDING)
        return {
            "pending": pending,
            "running": len(self._running_tasks),
            "completed": sum(1 for t in self._completed.values() if t.state == TaskState.COMPLETED),
            "failed": sum(1 for t in self._completed.values() if t.state == TaskState.FAILED),
            "total_submitted": self._task_counter,
        }
