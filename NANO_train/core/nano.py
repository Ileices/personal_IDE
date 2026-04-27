"""
Universal Nano — The fundamental unit of the Nano Sea (v2).

Every nano is an instance of ONE class. No category hierarchy.
Specialization is LEARNED, not hardcoded.

Interface: d_model → d_model (always, regardless of hidden_dim).
Internal capacity varies by hidden_dim (set at birth, can change at rebirth).

A nano is like a neuron with a personality — it has an identity (uuid),
a position in concept space (rby), a reputation (fitness), and a history
(touch_count, birth_cycle).

Adapted from nano_sea_v2_reference.py (validated across 30 experiments).
"""
import torch
import torch.nn as nn
from uuid import uuid4
from typing import Optional

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from config import D_MODEL, DEFAULT_HIDDEN_DIM


class Nano(nn.Module):
    """
    The fundamental unit of the Nano Sea.

    Interface: ℝ^d_model → ℝ^d_model (always, regardless of hidden_dim).
    Internal capacity varies by hidden_dim.

    A nano is a Feed-Forward Network with identity and lifecycle metadata.
    All nanos share the same interface so they can be routed interchangeably.
    """

    def __init__(
        self,
        d_model: int = D_MODEL,
        hidden_dim: int = DEFAULT_HIDDEN_DIM,
        rby_seed: Optional[list] = None,
    ):
        super().__init__()
        # The FFN: d_model → hidden → d_model
        self.up = nn.Linear(d_model, hidden_dim)
        self.act = nn.GELU()
        self.down = nn.Linear(hidden_dim, d_model)

        # RBY position in concept space (this IS a learned parameter)
        rby = rby_seed if rby_seed is not None else [0.33, 0.33, 0.34]
        self.rby_position = nn.Parameter(
            torch.tensor(rby, dtype=torch.float32)
        )

        # Identity metadata (not nn.Parameters — just tracking)
        self.nano_id: str = uuid4().hex[:12]
        self.hidden_dim: int = hidden_dim
        self.fitness: float = 0.5       # 0.0–1.0, updated by FitnessEvaluator
        self.touch_count: int = 0       # how often activated by router
        self.birth_cycle: int = 0       # which cosmic cycle spawned this nano
        self.parent_deposit_id: Optional[str] = None  # if warm-started from a deposit
        self.pool_index: int = -1       # set when added to a pool

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """x: (batch, seq_len, d_model) → same shape"""
        return self.down(self.act(self.up(x)))

    @property
    def param_count(self) -> int:
        """Total number of trainable parameters in this nano."""
        return sum(p.numel() for p in self.parameters())

    def __repr__(self) -> str:
        return (
            f"Nano(id={self.nano_id}, hidden={self.hidden_dim}, "
            f"params={self.param_count}, fitness={self.fitness:.3f})"
        )
