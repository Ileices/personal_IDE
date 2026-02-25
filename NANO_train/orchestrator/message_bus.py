"""
Message Bus — pub/sub + direct messaging for the nano sea.

Three messaging patterns:
1. Direct: nano A → nano B (point-to-point)
2. Topic:  nano A publishes to topic, all subscribers receive
3. Broadcast: nano A → every nano (expensive, rare)
"""
from __future__ import annotations
import asyncio, time, logging
from dataclasses import dataclass, field
from typing import Dict, Set, List, Optional, Callable, Awaitable, Any
from collections import defaultdict, deque
from enum import Enum

logger = logging.getLogger(__name__)


class MessagePriority(Enum):
    LOW = 0
    NORMAL = 1
    HIGH = 2
    CRITICAL = 3


@dataclass
class BusMessage:
    """A message on the bus."""
    sender_id: str
    topic: str
    payload: Any
    priority: MessagePriority = MessagePriority.NORMAL
    timestamp: float = field(default_factory=time.time)
    target_id: Optional[str] = None  # None = topic broadcast
    ttl: int = 10                     # max forwards before discard


MessageHandler = Callable[["BusMessage"], Awaitable[None]]


class MessageBus:
    """Async pub/sub message bus for inter-nano communication.

    Features:
    - Topic subscriptions with handler callbacks
    - Direct messaging by nano_id
    - Priority queue (CRITICAL messages processed first)
    - Dead letter queue for undeliverable messages
    - Bounded queue to prevent memory blowup
    """

    def __init__(self, max_queue_size: int = 10_000, max_dead_letters: int = 1000):
        self._subscribers: Dict[str, List[MessageHandler]] = defaultdict(list)
        self._direct_handlers: Dict[str, MessageHandler] = {}
        self._queue: asyncio.PriorityQueue = asyncio.PriorityQueue(maxsize=max_queue_size)
        self._dead_letters: deque = deque(maxlen=max_dead_letters)
        self._running = False
        self._processed = 0
        self._dropped = 0
        self._worker_task: Optional[asyncio.Task] = None

    # ── Subscriptions ──────────────────────────────────────────
    def subscribe(self, topic: str, handler: MessageHandler) -> None:
        self._subscribers[topic].append(handler)

    def unsubscribe(self, topic: str, handler: MessageHandler) -> None:
        handlers = self._subscribers.get(topic, [])
        self._subscribers[topic] = [h for h in handlers if h is not handler]

    def register_direct(self, nano_id: str, handler: MessageHandler) -> None:
        self._direct_handlers[nano_id] = handler

    def unregister_direct(self, nano_id: str) -> None:
        self._direct_handlers.pop(nano_id, None)

    # ── Publishing ─────────────────────────────────────────────
    async def publish(self, msg: BusMessage) -> bool:
        """Enqueue a message. Returns False if queue is full."""
        # Priority queue sorts by (priority_value, timestamp) — lower = higher priority
        sort_key = (-msg.priority.value, msg.timestamp)
        try:
            self._queue.put_nowait((sort_key, msg))
            return True
        except asyncio.QueueFull:
            self._dropped += 1
            logger.warning(f"Message bus queue full, dropping msg from {msg.sender_id}")
            return False

    async def send_direct(self, sender_id: str, target_id: str,
                          topic: str, payload: Any,
                          priority: MessagePriority = MessagePriority.NORMAL) -> bool:
        msg = BusMessage(
            sender_id=sender_id, topic=topic, payload=payload,
            priority=priority, target_id=target_id,
        )
        return await self.publish(msg)

    async def broadcast(self, sender_id: str, topic: str, payload: Any,
                        priority: MessagePriority = MessagePriority.NORMAL) -> bool:
        msg = BusMessage(
            sender_id=sender_id, topic=topic, payload=payload,
            priority=priority,
        )
        return await self.publish(msg)

    # ── Processing ─────────────────────────────────────────────
    async def start(self) -> None:
        """Start the message processing loop."""
        self._running = True
        self._worker_task = asyncio.create_task(self._process_loop())
        logger.info("Message bus started")

    async def stop(self) -> None:
        self._running = False
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
        logger.info(f"Message bus stopped. Processed: {self._processed}, Dropped: {self._dropped}")

    async def _process_loop(self) -> None:
        while self._running:
            try:
                sort_key, msg = await asyncio.wait_for(self._queue.get(), timeout=0.1)
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

            try:
                await self._deliver(msg)
                self._processed += 1
            except Exception as e:
                logger.error(f"Message delivery error: {e}")
                self._dead_letters.append((msg, str(e)))

    async def _deliver(self, msg: BusMessage) -> None:
        """Deliver to direct target or topic subscribers."""
        if msg.target_id:
            handler = self._direct_handlers.get(msg.target_id)
            if handler:
                await handler(msg)
            else:
                self._dead_letters.append((msg, f"No handler for {msg.target_id}"))
        else:
            handlers = self._subscribers.get(msg.topic, [])
            if handlers:
                await asyncio.gather(
                    *[h(msg) for h in handlers],
                    return_exceptions=True,
                )
            else:
                # No subscribers — just discard silently for topic messages
                pass

    # ── Stats ──────────────────────────────────────────────────
    @property
    def stats(self) -> dict:
        return {
            "queue_size": self._queue.qsize(),
            "processed": self._processed,
            "dropped": self._dropped,
            "dead_letters": len(self._dead_letters),
            "topics": len(self._subscribers),
            "direct_handlers": len(self._direct_handlers),
        }
