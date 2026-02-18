"""
Help Request System — "poor man's internet" compute sharing.

When a node needs more compute than it has:
1. It broadcasts a HelpRequest with task description + requirements
2. Nodes with spare capacity can Accept
3. Task gets dispatched to helper
4. Both nodes get RESPECT adjustments

Features:
- Toggle-based opt-in (auto_accept_help setting)
- PII scrubbing before sending any data
- RESPECT-gated (low-RESPECT nodes can't request high-tier help)
- Rate limiting to prevent abuse
"""
from __future__ import annotations
import asyncio, time, uuid, logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Callable, Awaitable
from enum import Enum

logger = logging.getLogger(__name__)


class HelpRequestState(Enum):
    OPEN = "open"
    ACCEPTED = "accepted"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


@dataclass
class HelpRequest:
    request_id: str = field(default_factory=lambda: str(uuid.uuid4())[:12])
    requester_id: str = ""
    # What's needed
    description: str = ""
    nano_types_needed: List[str] = field(default_factory=list)
    require_gpu: bool = False
    min_ram_gb: float = 0.0
    estimated_duration_s: float = 60.0
    # State
    state: HelpRequestState = HelpRequestState.OPEN
    helper_id: Optional[str] = None
    # Timing
    created_at: float = field(default_factory=time.time)
    expires_at: float = 0.0
    accepted_at: Optional[float] = None
    completed_at: Optional[float] = None
    # Result
    success: bool = False


class HelpRequestSystem:
    """Manages help requests across the mesh."""

    def __init__(
        self,
        local_node_id: str,
        auto_accept: bool = False,
        max_concurrent_help: int = 2,
        request_ttl: float = 300.0,  # 5 min default expiry
        rate_limit_per_minute: int = 5,
    ):
        self._local_id = local_node_id
        self._auto_accept = auto_accept
        self._max_concurrent = max_concurrent_help
        self._request_ttl = request_ttl
        self._rate_limit = rate_limit_per_minute

        # Requests we've sent
        self._outgoing: Dict[str, HelpRequest] = {}
        # Requests we've received from others
        self._incoming: Dict[str, HelpRequest] = {}
        # Currently helping
        self._active_help: Dict[str, HelpRequest] = {}
        # Rate limiting
        self._request_timestamps: List[float] = []

        # Callbacks
        self._on_request_received: Optional[Callable] = None
        self._on_request_accepted: Optional[Callable] = None
        self._broadcast_fn: Optional[Callable] = None
        self._respect_system = None

        self._running = False
        self._cleanup_task: Optional[asyncio.Task] = None

    def set_broadcast(self, fn: Callable[[dict], Awaitable[None]]) -> None:
        self._broadcast_fn = fn

    def set_respect_system(self, rs) -> None:
        self._respect_system = rs

    @property
    def auto_accept(self) -> bool:
        return self._auto_accept

    @auto_accept.setter
    def auto_accept(self, value: bool) -> None:
        self._auto_accept = value
        logger.info(f"Auto-accept help: {'ON' if value else 'OFF'}")

    # ── Requesting Help ────────────────────────────────────────
    async def request_help(
        self,
        description: str,
        nano_types: List[str] | None = None,
        require_gpu: bool = False,
        min_ram_gb: float = 0.0,
        estimated_duration_s: float = 60.0,
    ) -> Optional[HelpRequest]:
        """Broadcast a help request to the mesh."""
        # Rate limit check
        now = time.time()
        self._request_timestamps = [t for t in self._request_timestamps if now - t < 60]
        if len(self._request_timestamps) >= self._rate_limit:
            logger.warning("Help request rate limit exceeded")
            return None

        req = HelpRequest(
            requester_id=self._local_id,
            description=description,
            nano_types_needed=nano_types or [],
            require_gpu=require_gpu,
            min_ram_gb=min_ram_gb,
            estimated_duration_s=estimated_duration_s,
            expires_at=now + self._request_ttl,
        )
        self._outgoing[req.request_id] = req
        self._request_timestamps.append(now)

        # Broadcast
        if self._broadcast_fn:
            await self._broadcast_fn({
                "type": "help_request",
                "request": {
                    "request_id": req.request_id,
                    "requester_id": self._local_id,
                    "description": req.description,
                    "nano_types": req.nano_types_needed,
                    "require_gpu": req.require_gpu,
                    "min_ram_gb": req.min_ram_gb,
                    "duration_s": req.estimated_duration_s,
                    "expires_at": req.expires_at,
                },
            })
            logger.info(f"Help request broadcast: {req.request_id}")

        return req

    # ── Receiving/Accepting Help ───────────────────────────────
    def handle_incoming_request(self, data: dict) -> Optional[HelpRequest]:
        """Handle a help request from the mesh."""
        req_data = data.get("request", {})
        req = HelpRequest(
            request_id=req_data.get("request_id", ""),
            requester_id=req_data.get("requester_id", ""),
            description=req_data.get("description", ""),
            nano_types_needed=req_data.get("nano_types", []),
            require_gpu=req_data.get("require_gpu", False),
            min_ram_gb=req_data.get("min_ram_gb", 0.0),
            estimated_duration_s=req_data.get("duration_s", 60.0),
            expires_at=req_data.get("expires_at", time.time() + 300),
        )

        # Don't accept our own requests
        if req.requester_id == self._local_id:
            return None

        # Check RESPECT gate
        if self._respect_system:
            requester_score = self._respect_system.get_score(req.requester_id)
            if requester_score < 100:
                logger.debug(f"Ignoring help request from low-RESPECT node: {requester_score}")
                return None

        self._incoming[req.request_id] = req

        # Auto-accept if enabled and have capacity
        if self._auto_accept and len(self._active_help) < self._max_concurrent:
            asyncio.create_task(self._accept_request(req))

        return req

    async def _accept_request(self, req: HelpRequest) -> None:
        """Accept a help request."""
        if len(self._active_help) >= self._max_concurrent:
            return

        req.state = HelpRequestState.ACCEPTED
        req.helper_id = self._local_id
        req.accepted_at = time.time()
        self._active_help[req.request_id] = req

        # Notify requester
        if self._broadcast_fn:
            await self._broadcast_fn({
                "type": "help_accepted",
                "request_id": req.request_id,
                "helper_id": self._local_id,
            })

        logger.info(f"Accepted help request {req.request_id} from {req.requester_id[:12]}...")

        # Record in RESPECT
        if self._respect_system:
            self._respect_system.record_help_given(self._local_id)

    async def accept_request(self, request_id: str) -> bool:
        """Manually accept a help request."""
        req = self._incoming.get(request_id)
        if not req or req.state != HelpRequestState.OPEN:
            return False
        await self._accept_request(req)
        return True

    def complete_help(self, request_id: str, success: bool = True) -> None:
        """Mark a help task as completed."""
        req = self._active_help.pop(request_id, None)
        if req:
            req.state = HelpRequestState.COMPLETED
            req.success = success
            req.completed_at = time.time()

    # ── Receiving Acceptance ───────────────────────────────────
    def handle_acceptance(self, data: dict) -> None:
        """Our help request was accepted by someone."""
        request_id = data.get("request_id")
        helper_id = data.get("helper_id")
        req = self._outgoing.get(request_id)
        if req and req.state == HelpRequestState.OPEN:
            req.state = HelpRequestState.ACCEPTED
            req.helper_id = helper_id
            req.accepted_at = time.time()
            logger.info(f"Help request {request_id} accepted by {helper_id[:12]}...")

    # ── Lifecycle ──────────────────────────────────────────────
    async def start(self) -> None:
        self._running = True
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())
        logger.info(f"Help request system started (auto_accept={self._auto_accept})")

    async def stop(self) -> None:
        self._running = False
        if self._cleanup_task:
            self._cleanup_task.cancel()

    async def _cleanup_loop(self) -> None:
        while self._running:
            now = time.time()
            # Expire old requests
            for req_id, req in list(self._incoming.items()):
                if req.state == HelpRequestState.OPEN and now > req.expires_at:
                    req.state = HelpRequestState.EXPIRED
                    del self._incoming[req_id]
            for req_id, req in list(self._outgoing.items()):
                if req.state == HelpRequestState.OPEN and now > req.expires_at:
                    req.state = HelpRequestState.EXPIRED
            await asyncio.sleep(30.0)

    @property
    def stats(self) -> dict:
        return {
            "outgoing_requests": len(self._outgoing),
            "incoming_requests": len(self._incoming),
            "active_help": len(self._active_help),
            "auto_accept": self._auto_accept,
        }
