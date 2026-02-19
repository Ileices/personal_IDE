"""
BaseNano — Universal parent class for ALL nanos in the sea.
Every nano is a tiny PyTorch nn.Module (L1/L2 cache sized, seconds to train).
Provides: RBY lifecycle, PTAIE scheduling, IC-AE infection, fitness tracking,
message bus interface, tiered storage, training hooks.
"""
from __future__ import annotations
import uuid
import time
import math
import struct
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Tuple
from enum import Enum

import torch
import torch.nn as nn
import numpy as np

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from core.rby import RBYVector
from core.ptaie import PTAIEVector
from core.lifecycle import LifecycleState

log = logging.getLogger("nano")


class NanoState(Enum):
    DORMANT = "dormant"        # Created but not yet trained
    TRAINING = "training"      # Currently being trained
    ACTIVE = "active"          # Trained and available for inference
    INFERENCE = "inference"    # Currently processing a query
    COMPRESSING = "compressing"# Being compressed to glyph
    COMPRESSED = "compressed"  # Stored as RBY glyph
    DEAD = "dead"              # Pruned (but glyph may exist)


@dataclass
class NanoMessage:
    """Message passed between nanos via the message bus."""
    sender_id: str
    receiver_id: str  # "*" for broadcast
    msg_type: str     # "data", "query", "response", "ripple", "training", "status"
    payload: Any = None
    priority: float = 0.5
    timestamp: float = field(default_factory=time.time)


class BaseNano(nn.Module):
    """
    The fundamental building block of the Sea of Nanos.
    Every nano inherits from this. Provides the universal nano interface.

    Architecture: Configurable MLP (1-3 layers, 32-128 hidden units).
    Constraint: Must fit in L1/L2 cache (< 50K params, trains in seconds).
    """

    # Subclasses set these as class variables
    NANO_TYPE: str = "BaseNano"
    DEFAULT_RBY: Tuple[float, float, float] = (0.334, 0.333, 0.333)
    DEFAULT_PTAIE: Tuple[float, float, float, float, float] = (0.5, 0.5, 0.5, 0.5, 0.5)
    DEFAULT_HIDDEN: int = 64
    DEFAULT_INPUT: int = 128
    DEFAULT_OUTPUT: int = 64

    def __init__(self, nano_id: Optional[str] = None,
                 hidden_size: Optional[int] = None,
                 input_size: Optional[int] = None,
                 output_size: Optional[int] = None,
                 rby: Optional[Tuple[float, float, float]] = None,
                 ptaie: Optional[Tuple[float, float, float, float, float]] = None):
        super().__init__()

        self.nano_id = nano_id or f"{self.NANO_TYPE}_{uuid.uuid4().hex[:8]}"
        self.created_at = time.time()
        self.state = NanoState.DORMANT
        self.cycle_id = 0

        # RBY color vector (lifecycle-shifting)
        r, b, y = rby or self.DEFAULT_RBY
        self.rby = RBYVector(r, b, y)

        # PTAIE control vector
        p, t, a, i, e = ptaie or self.DEFAULT_PTAIE
        self.ptaie = PTAIEVector(p, t, a, i, e)

        # Neural network layers
        hs = hidden_size or self.DEFAULT_HIDDEN
        ins = input_size or self.DEFAULT_INPUT
        outs = output_size or self.DEFAULT_OUTPUT

        # Store sizes as instance attributes for pipeline access
        self.input_size = ins
        self.hidden_size = hs
        self.output_size = outs

        self.net = nn.Sequential(
            nn.Linear(ins, hs),
            nn.GELU(),
            nn.Linear(hs, hs),
            nn.GELU(),
            nn.Linear(hs, outs),
        )

        # Fitness tracking
        self.fitness_score = 0.0
        self.total_inferences = 0
        self.correct_inferences = 0
        self.avg_latency_ms = 0.0
        self.usage_count = 0

        # Training state
        self.training_steps = 0
        self.training_loss = float('inf')
        self.best_loss = float('inf')

        # IC-AE
        self.parent_sandbox_id: Optional[str] = None
        self.child_sandbox_ids: List[str] = []

        # Message inbox
        self._inbox: List[NanoMessage] = []

        # Connections to other nanos (for ripple activation)
        self._connections: Dict[str, float] = {}  # nano_id → affinity weight

    @property
    def param_count(self) -> int:
        return sum(p.numel() for p in self.parameters())

    @property
    def size_bytes(self) -> int:
        return sum(p.numel() * p.element_size() for p in self.parameters())

    @property
    def is_active(self) -> bool:
        return self.state in (NanoState.ACTIVE, NanoState.INFERENCE)

    @property
    def dominance(self) -> str:
        return self.rby.dominance

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Default forward pass. Subclasses override for specialization."""
        return self.net(x)

    def infer(self, input_data: torch.Tensor) -> Tuple[torch.Tensor, float]:
        """Run inference with latency tracking."""
        self.state = NanoState.INFERENCE
        start = time.time()

        with torch.no_grad():
            output = self.forward(input_data)

        latency = (time.time() - start) * 1000
        self.total_inferences += 1
        self.usage_count += 1
        self.avg_latency_ms = 0.9 * self.avg_latency_ms + 0.1 * latency
        self.state = NanoState.ACTIVE
        return output, latency

    def train_step(self, input_data: torch.Tensor, target: torch.Tensor,
                   optimizer: torch.optim.Optimizer,
                   loss_fn: Optional[nn.Module] = None) -> float:
        """Single training step. Returns loss value."""
        self.state = NanoState.TRAINING
        if loss_fn is None:
            loss_fn = nn.MSELoss()

        optimizer.zero_grad()
        output = self.forward(input_data)
        loss = loss_fn(output, target)
        loss.backward()
        optimizer.step()

        loss_val = loss.item()
        self.training_steps += 1
        self.training_loss = loss_val
        if loss_val < self.best_loss:
            self.best_loss = loss_val

        # Lifecycle shift: as training progresses, R decreases (less novel), B increases
        if self.training_steps % 100 == 0:
            progress = min(1.0, self.training_steps / 1000)
            self.rby.lifecycle_shift(progress)

        return loss_val

    def activate(self):
        """Mark nano as active and ready for inference."""
        self.state = NanoState.ACTIVE

    def deactivate(self):
        self.state = NanoState.DORMANT

    # ─── Messaging ──────────────────────────────────────────
    def receive_message(self, msg: NanoMessage):
        self._inbox.append(msg)

    def process_messages(self) -> List[NanoMessage]:
        """Process all pending messages. Returns responses."""
        responses = []
        for msg in self._inbox:
            response = self._handle_message(msg)
            if response:
                responses.append(response)
        self._inbox.clear()
        return responses

    def _handle_message(self, msg: NanoMessage) -> Optional[NanoMessage]:
        """Override in subclasses for specialized message handling."""
        if msg.msg_type == "ripple":
            # Default ripple: just acknowledge
            return NanoMessage(
                sender_id=self.nano_id,
                receiver_id=msg.sender_id,
                msg_type="response",
                payload={"acknowledged": True, "nano_type": self.NANO_TYPE},
            )
        return None

    def send_message(self, receiver_id: str, msg_type: str, payload: Any = None) -> NanoMessage:
        return NanoMessage(
            sender_id=self.nano_id,
            receiver_id=receiver_id,
            msg_type=msg_type,
            payload=payload,
            priority=self.ptaie.p,
        )

    # ─── Connections (for ripple) ───────────────────────────
    def connect(self, other_id: str, affinity: float = 0.5):
        self._connections[other_id] = affinity

    def disconnect(self, other_id: str):
        self._connections.pop(other_id, None)

    def get_ripple_targets(self, radius: float = 0.5) -> List[str]:
        """Get connected nanos within ripple radius."""
        return [nid for nid, aff in self._connections.items() if aff >= (1.0 - radius)]

    # ─── Serialization ──────────────────────────────────────
    def get_weight_bytes(self) -> bytes:
        """Serialize all parameters to bytes for glyph compression."""
        parts = []
        for p in self.parameters():
            parts.append(p.data.cpu().numpy().tobytes())
        return b''.join(parts)

    def load_weight_bytes(self, data: bytes):
        """Load parameters from bytes."""
        offset = 0
        for p in self.parameters():
            size = p.numel() * p.element_size()
            chunk = data[offset:offset + size]
            arr = np.frombuffer(chunk, dtype=np.float32).reshape(p.shape)
            p.data = torch.from_numpy(arr.copy())
            offset += size

    def get_state_dict_compact(self) -> Dict:
        """Compact state for serialization."""
        return {
            "nano_id": self.nano_id,
            "nano_type": self.NANO_TYPE,
            "rby": self.rby.to_tuple(),
            "ptaie": self.ptaie.to_tuple(),
            "state": self.state.value,
            "fitness": self.fitness_score,
            "training_steps": self.training_steps,
            "training_loss": self.training_loss,
            "usage_count": self.usage_count,
            "weights": self.state_dict(),
        }

    def __repr__(self) -> str:
        return (f"<{self.NANO_TYPE} id={self.nano_id[:12]} "
                f"state={self.state.value} "
                f"RBY=({self.rby.r:.2f},{self.rby.b:.2f},{self.rby.y:.2f}) "
                f"params={self.param_count}>")


# ─── Nano Registry ──────────────────────────────────────────
# All nano classes register themselves here for factory instantiation
NANO_REGISTRY: Dict[str, type] = {}


def register_nano(cls):
    """Decorator to register a nano class in the global registry."""
    NANO_REGISTRY[cls.NANO_TYPE] = cls
    return cls


def create_nano(nano_type: str, **kwargs) -> BaseNano:
    """Factory: create a nano by type name."""
    cls = NANO_REGISTRY.get(nano_type)
    if not cls:
        raise ValueError(f"Unknown nano type: {nano_type}. "
                         f"Available: {list(NANO_REGISTRY.keys())}")
    return cls(**kwargs)


def list_nano_types() -> List[str]:
    return sorted(NANO_REGISTRY.keys())
