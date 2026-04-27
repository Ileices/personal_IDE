"""
Swarm Router — Routes tokens to the best nanos (v2).

Two routing strategies:
- Direct scoring: for small pools (< 100 nanos). Simple linear projection.
- Chromatic routing: for large pools (100+). Two-stage: KD-tree pre-filter
  via ChromaticIndex, then fine-grained scoring among candidates.

Uses soft_k_selection (reverse cumsum) for differentiable k-selection.
DO NOT replace with argmax or hard top-k — proven in test_30v3
(PPL 4.977, -3.46% vs fixed top-2).

Adapted from nano_sea_v2_reference.py.
"""
import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Optional, Tuple, List

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from config import D_MODEL, DEFAULT_TOP_K, CHROMATIC_CANDIDATES


# =============================================================================
# Soft-k Selection (differentiable)
# =============================================================================

def soft_k_selection(
    scores: torch.Tensor,
    k_logits: torch.Tensor,
    top_k_max: int,
    temperature: float = 1.0,
) -> Tuple[torch.Tensor, torch.Tensor]:
    """
    Soft differentiable k-selection via reverse cumsum.

    PROVEN in test_30v3: PPL 4.977 (-3.46% vs fixed top-2). This is the
    mathematically correct way to let the router learn how many nanos to
    activate per token. DO NOT replace with argmax or hard top-k.

    Args:
        scores: (B, S, num_nanos) raw routing scores for all nanos
        k_logits: (B, S, top_k_max) logits for slot inclusion probabilities
        top_k_max: maximum number of nanos that can be activated
        temperature: controls sharpness of k distribution.
                     Low (e.g. 0.1) → peaked/selective (few nanos activated).
                     High (e.g. 1.0) → diffuse (more nanos share weight).
                     Used for curriculum annealing: start warm, cool over training.

    Returns:
        effective_weights: (B, S, top_k_max) — soft weights for each slot
        top_indices: (B, S, top_k_max) — which nanos are in each slot
    """
    # Get top-k scores and their indices
    top_scores, top_indices = scores.topk(top_k_max, dim=-1)
    weights = F.softmax(top_scores, dim=-1)  # (B, S, top_k_max)

    # Soft k: each slot gets a probability of being active
    # Temperature scales logits: low T → sharper (fewer nanos), high T → flatter
    k_soft = torch.sigmoid(k_logits / max(temperature, 1e-6))  # each in [0, 1]
    # Reverse cumulative sum: slot 0 gets highest weight (always active),
    # higher slots fade monotonically.  Fully differentiable.
    slot_weights = k_soft.flip(-1).cumsum(-1).flip(-1)

    # Apply soft mask to routing weights
    effective_weights = weights * slot_weights
    # Re-normalize so weights sum to 1
    effective_weights = effective_weights / (
        effective_weights.sum(-1, keepdim=True) + 1e-9
    )

    return effective_weights, top_indices


# =============================================================================
# K-Predictor
# =============================================================================

class KPredictor(nn.Module):
    """
    Predicts how many nanos should be activated for each token.
    Output: logits for each slot's inclusion probability.
    """

    def __init__(self, d_model: int, top_k_max: int):
        super().__init__()
        self.proj = nn.Linear(d_model, top_k_max)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """x: (B, S, d_model) → (B, S, top_k_max)"""
        return self.proj(x)


# =============================================================================
# Swarm Router
# =============================================================================

class SwarmRouter(nn.Module):
    """
    Routes tokens to the best nanos.

    Small pools (< 100 nanos): direct linear scoring.
    Large pools (100+): two-stage chromatic routing via ChromaticIndex.
    """

    def __init__(
        self,
        d_model: int = D_MODEL,
        num_nanos: int = 8,
        top_k_max: int = DEFAULT_TOP_K,
    ):
        super().__init__()
        self.num_nanos = num_nanos
        self.top_k_max = min(top_k_max, num_nanos)
        self.use_chromatic = num_nanos >= 100

        if not self.use_chromatic:
            # Direct scoring: one score per nano
            self.scorer = nn.Linear(d_model, num_nanos)
        else:
            # Two-stage: token → RBY projection → KD-tree pre-filter → fine score
            self.rby_projector = nn.Linear(d_model, 3)
            # Fine scorer: token + candidate RBY → scalar
            self.fine_scorer = nn.Linear(d_model + 3, 1)
            self.chromatic_index = None  # Set externally by SwarmLayer

        # K-predictor for soft k-selection
        self.k_predictor = KPredictor(d_model, self.top_k_max)

    def forward(
        self,
        x: torch.Tensor,
        nano_pool: Optional[nn.ModuleList] = None,
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Args:
            x: (B, S, d_model)
            nano_pool: list of Nano modules (needed for chromatic routing)

        Returns:
            effective_weights: (B, S, top_k_max)
            top_indices: (B, S, top_k_max)
        """
        if not self.use_chromatic:
            scores = self.scorer(x)  # (B, S, num_nanos)
        else:
            scores = self._chromatic_route(x, nano_pool)

        k_logits = self.k_predictor(x)
        return soft_k_selection(scores, k_logits, self.top_k_max)

    def _chromatic_route(
        self,
        x: torch.Tensor,
        nano_pool: nn.ModuleList,
    ) -> torch.Tensor:
        """Two-stage routing for large pools."""
        B, S, D = x.shape

        # Stage 1: project tokens to RBY simplex
        token_rby = F.softmax(self.rby_projector(x), dim=-1)  # (B, S, 3)

        # Stage 2: find CHROMATIC_CANDIDATES nearest nanos via KD-tree
        if self.chromatic_index is not None:
            candidate_indices = self.chromatic_index.query(
                token_rby.detach(), k=CHROMATIC_CANDIDATES
            )  # (B, S, candidates)
        else:
            candidate_indices = torch.randint(
                0, self.num_nanos, (B, S, CHROMATIC_CANDIDATES),
                device=x.device,
            )

        # Stage 3: fine-grained scoring among candidates
        all_rby = torch.stack(
            [n.rby_position for n in nano_pool]
        )  # (N, 3)
        cand_rby = all_rby[candidate_indices]  # (B, S, candidates, 3)

        # Score each candidate
        token_expanded = x.unsqueeze(2).expand(
            -1, -1, CHROMATIC_CANDIDATES, -1
        )
        combined = torch.cat(
            [token_expanded, cand_rby], dim=-1
        )  # (B, S, cands, D+3)
        fine_scores = self.fine_scorer(combined).squeeze(-1)  # (B, S, cands)

        # Scatter into full score matrix
        scores = torch.full(
            (B, S, self.num_nanos), float("-inf"), device=x.device
        )
        scores.scatter_(2, candidate_indices, fine_scores)

        return scores

    def resize(self, new_num_nanos: int):
        """
        Handle pool size changes from lifecycle events.
        Only relevant for direct scoring (small pools).
        If pool grows past 100, switch to chromatic.
        """
        old = self.num_nanos
        self.num_nanos = new_num_nanos
        self.top_k_max = min(self.top_k_max, new_num_nanos)

        if new_num_nanos >= 100 and not self.use_chromatic:
            # Switch to chromatic routing
            self.use_chromatic = True
            d_model = self.k_predictor.proj.in_features
            self.rby_projector = nn.Linear(d_model, 3)
            self.fine_scorer = nn.Linear(d_model + 3, 1)
            self.chromatic_index = None
            if hasattr(self, "scorer"):
                del self.scorer
        elif not self.use_chromatic:
            # Resize the scorer
            d_model = self.scorer.in_features
            old_weight = self.scorer.weight.data
            old_bias = self.scorer.bias.data
            self.scorer = nn.Linear(d_model, new_num_nanos)
            n = min(old, new_num_nanos)
            self.scorer.weight.data[:n] = old_weight[:n]
            self.scorer.bias.data[:n] = old_bias[:n]
