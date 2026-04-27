"""
Swarm Layer — One layer of the Nano Sea (v2).

Architecture: Shared Attention → Routed Nano Swarm → Crosstalk

Each layer has its OWN pool of nanos and its OWN router.
The shared attention provides global context; the nano swarm
provides specialized computation; crosstalk allows active nanos
to influence each other.

Adapted from nano_sea_v2_reference.py.
"""
import torch
import torch.nn as nn
from typing import Optional, Tuple, Dict

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from config import D_MODEL, N_HEADS, DEFAULT_TOP_K

from core.nano import Nano
from core.router import SwarmRouter
from core.crosstalk import ExpertCrosstalk


class SwarmLayer(nn.Module):
    """
    One layer of the Nano Sea: shared attention + routed nano swarm.

    Each layer has its OWN pool of nanos and its OWN router.
    """

    def __init__(
        self,
        d_model: int = D_MODEL,
        n_heads: int = N_HEADS,
        nano_pool: Optional[list] = None,
        top_k: int = DEFAULT_TOP_K,
    ):
        super().__init__()
        if nano_pool is None:
            nano_pool = [Nano(d_model) for _ in range(8)]

        # Shared attention
        self.ln1 = nn.LayerNorm(d_model)
        self.attn = nn.MultiheadAttention(d_model, n_heads, batch_first=True)

        # Nano swarm
        self.ln2 = nn.LayerNorm(d_model)
        self.nano_pool = nn.ModuleList(nano_pool)
        self.router = SwarmRouter(d_model, len(nano_pool), top_k)
        self.top_k = min(top_k, len(nano_pool))

        # Crosstalk (gate starts at 0.0 — proven constraint)
        self.crosstalk = ExpertCrosstalk(d_model, n_heads=2)

        # Set pool indices
        for i, nano in enumerate(self.nano_pool):
            nano.pool_index = i

    def forward(
        self,
        x: torch.Tensor,
        mask: Optional[torch.Tensor] = None,
    ) -> Tuple[torch.Tensor, Dict[str, torch.Tensor]]:
        """
        Args:
            x: (B, S, d_model)
            mask: optional attention mask

        Returns:
            x: (B, S, d_model) — output with residual connections
            touch_event: dict with routing info for TouchTensor
        """
        # 1. Shared attention (pre-norm residual)
        h = self.ln1(x)
        h, _ = self.attn(h, h, h, attn_mask=mask)
        x = x + h

        # 2. Nano swarm (pre-norm residual)
        h = self.ln2(x)
        h, touch_event = self._swarm_forward(h)
        x = x + h

        return x, touch_event

    def _swarm_forward(
        self, x: torch.Tensor,
    ) -> Tuple[torch.Tensor, Dict[str, torch.Tensor]]:
        B, S, D = x.shape

        # Route: get weights and indices for top-k nanos
        weights, indices = self.router(x, self.nano_pool)
        # weights: (B, S, top_k), indices: (B, S, top_k)

        # Run selected nanos and collect outputs
        nano_outputs = torch.zeros(
            B, S, self.top_k, D, device=x.device, dtype=x.dtype
        )

        for k_idx in range(self.top_k):
            slot_indices = indices[:, :, k_idx]  # (B, S) — which nano for this slot

            # Group by nano index for batched execution
            for nano_idx in slot_indices.unique():
                nano_idx_val = nano_idx.item()
                if nano_idx_val < 0 or nano_idx_val >= len(self.nano_pool):
                    continue
                mask = slot_indices == nano_idx  # (B, S) bool
                if mask.any():
                    nano = self.nano_pool[nano_idx_val]
                    nano_input = x[mask]  # (num_selected, D)
                    nano_output = nano(
                        nano_input.unsqueeze(1)
                    ).squeeze(1)  # (num_selected, D)
                    nano_outputs[mask, k_idx] = nano_output

                    # Track activation
                    nano.touch_count += mask.sum().item()

        # Crosstalk: nanos attend to each other, then weighted sum
        output = self.crosstalk(nano_outputs, weights)

        touch_event = {
            "indices": indices.detach(),
            "weights": weights.detach(),
        }

        return output, touch_event

    # ----- Lifecycle hooks (called by CosmicCycleManager) -----

    def add_nano(self, nano: Nano):
        """Add a new nano to the pool."""
        nano.pool_index = len(self.nano_pool)
        self.nano_pool.append(nano)
        self.router.resize(len(self.nano_pool))
        self.top_k = min(self.top_k, len(self.nano_pool))

    def remove_nano(self, pool_index: int):
        """Remove a nano from the pool (death event)."""
        if pool_index < 0 or pool_index >= len(self.nano_pool):
            return
        del self.nano_pool[pool_index]
        # Re-index
        for i, nano in enumerate(self.nano_pool):
            nano.pool_index = i
        self.router.resize(len(self.nano_pool))
        self.top_k = min(self.top_k, len(self.nano_pool))

    @property
    def num_nanos(self) -> int:
        return len(self.nano_pool)
