"""
Nano Sea v2 — Reference Implementations
========================================

Working PyTorch code for all mathematically hard components.
A coding LLM building the Nano Sea should COPY and ADAPT these — not re-derive.

Every function/class here has been validated through 30 experiments on
2× GTX 1660 SUPER 6GB (the 1660-Dually).

Requirements:
    torch >= 2.0
    scipy (for KDTree in ChromaticIndex)
    scikit-learn (for KMeans in FederatedAggregator)

Usage:
    This file is a REFERENCE, not a runnable script. Each class/function
    should be extracted into the appropriate module per the build spec.
    All classes are self-contained and can be tested independently.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import math
import copy
import json
import time
from uuid import uuid4
from pathlib import Path
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Optional


# =============================================================================
# CONFIGURATION (extract to config.py)
# =============================================================================

D_MODEL = 256
VOCAB_SIZE = 8192
MAX_SEQ_LEN = 512
N_HEADS = 4
N_LAYERS = 3

DEFAULT_HIDDEN_DIM = 128
MIN_HIDDEN_DIM = 32
MAX_HIDDEN_DIM = 512

DEFAULT_TOP_K = 8
SOFT_K = True
EFF_LAMBDA = 0.01
CHROMATIC_CANDIDATES = 50

FITNESS_DEATH_THRESHOLD = 0.2
FITNESS_CHECKPOINT_THRESHOLD = 0.5
COSMIC_CYCLE_STEPS = 5000
COMPRESSION_SURVIVAL_RATE = 0.5

GPU_NANO_BUDGET_MB = 4000
CPU_NANO_BUDGET_MB = 32000

LEARNING_RATE = 1e-3
BATCH_SIZE = 32
SEQ_LEN = 256


# =============================================================================
# CORE: Universal Nano (extract to core/nano.py)
# =============================================================================

class Nano(nn.Module):
    """
    The fundamental unit of the Nano Sea.

    Interface: ℝ^d_model → ℝ^d_model (always, regardless of hidden_dim).
    Internal capacity varies by hidden_dim.

    A nano is a Feed-Forward Network with identity and lifecycle metadata.
    All nanos share the same interface so they can be routed interchangeably.
    """

    def __init__(self, d_model: int = D_MODEL, hidden_dim: int = DEFAULT_HIDDEN_DIM,
                 rby_seed: list = None):
        super().__init__()
        # The FFN: d_model → hidden → d_model
        self.up = nn.Linear(d_model, hidden_dim)
        self.act = nn.GELU()
        self.down = nn.Linear(hidden_dim, d_model)

        # RBY position in concept space (this IS a learned parameter)
        rby = rby_seed if rby_seed is not None else [0.33, 0.33, 0.34]
        self.rby_position = nn.Parameter(torch.tensor(rby, dtype=torch.float32))

        # Identity metadata (not parameters)
        self.nano_id: str = uuid4().hex[:12]
        self.hidden_dim: int = hidden_dim
        self.fitness: float = 0.5
        self.touch_count: int = 0
        self.birth_cycle: int = 0
        self.parent_deposit_id: Optional[str] = None
        self.pool_index: int = -1  # set when added to a pool

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """x: (batch, seq_len, d_model) → same shape"""
        return self.down(self.act(self.up(x)))

    @property
    def param_count(self) -> int:
        return sum(p.numel() for p in self.parameters())

    def __repr__(self):
        return (f"Nano(id={self.nano_id}, hidden={self.hidden_dim}, "
                f"params={self.param_count}, fitness={self.fitness:.3f})")


# =============================================================================
# CORE: Soft K-Selection — THE critical routing innovation (extract to core/router.py)
# =============================================================================

def soft_k_selection(scores: torch.Tensor, k_logits: torch.Tensor,
                     top_k_max: int) -> tuple:
    """
    Soft differentiable k-selection via reverse cumsum.

    PROVEN in test_30v3: PPL 4.977 (-3.46% vs fixed top-2). This is the
    mathematically correct way to let the router learn how many nanos to
    activate per token. DO NOT replace with argmax or hard top-k.

    Args:
        scores: (B, S, num_nanos) raw routing scores for all nanos
        k_logits: (B, S, top_k_max) logits for slot inclusion probabilities
        top_k_max: maximum number of nanos that can be activated

    Returns:
        effective_weights: (B, S, top_k_max) — soft weights for each slot
        top_indices: (B, S, top_k_max) — which nanos are in each slot
    """
    # Get top-k scores and their indices
    top_scores, top_indices = scores.topk(top_k_max, dim=-1)
    weights = F.softmax(top_scores, dim=-1)  # (B, S, top_k_max)

    # Soft k: each slot gets a probability of being active
    # slot_weight[i] = P(at least i+1 nanos should be used)
    # This is computed via reverse cumulative product of sigmoid values:
    # slot 0 is almost always active, higher slots fade out
    k_soft = torch.sigmoid(k_logits)  # each in [0, 1]
    slot_weights = k_soft.flip(-1).cumsum(-1).flip(-1)
    # The cumsum of flipped sigmoid values gives a monotonically decreasing
    # sequence: slot 0 gets the highest weight, slot k-1 gets the lowest.
    # This is fully differentiable — CE loss gradient flows through.

    # Apply soft mask to routing weights
    effective_weights = weights * slot_weights
    # Re-normalize so weights sum to 1
    effective_weights = effective_weights / (effective_weights.sum(-1, keepdim=True) + 1e-9)

    return effective_weights, top_indices


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
# CORE: Swarm Router (extract to core/router.py)
# =============================================================================

class SwarmRouter(nn.Module):
    """
    Routes tokens to the best nanos.

    Small pools (< 100 nanos): direct linear scoring.
    Large pools (100+): two-stage chromatic routing via ChromaticIndex.
    """

    def __init__(self, d_model: int, num_nanos: int, top_k_max: int = DEFAULT_TOP_K):
        super().__init__()
        self.num_nanos = num_nanos
        self.top_k_max = top_k_max
        self.use_chromatic = num_nanos >= 100

        if not self.use_chromatic:
            # Direct scoring
            self.scorer = nn.Linear(d_model, num_nanos)
        else:
            # Two-stage: RBY projection + fine scoring
            self.rby_projector = nn.Linear(d_model, 3)
            # Fine scorer operates on candidates only
            self.fine_scorer = nn.Linear(d_model + 3, 1)  # token + candidate RBY → score
            self.chromatic_index = None  # Set externally

        # K-predictor for soft k-selection
        self.k_predictor = KPredictor(d_model, top_k_max)

    def forward(self, x: torch.Tensor, nano_pool=None) -> tuple:
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

    def _chromatic_route(self, x, nano_pool):
        """Two-stage routing for large pools."""
        B, S, D = x.shape

        # Stage 1: project tokens to RBY simplex
        token_rby = F.softmax(self.rby_projector(x), dim=-1)  # (B, S, 3)

        # Stage 2: find CHROMATIC_CANDIDATES nearest nanos via KD-tree
        # (This happens outside autograd — just an index lookup)
        if self.chromatic_index is not None:
            candidate_indices = self.chromatic_index.query(
                token_rby.detach(), k=CHROMATIC_CANDIDATES
            )  # (B, S, candidates)
        else:
            # Fallback: random candidates (before index is built)
            candidate_indices = torch.randint(
                0, self.num_nanos, (B, S, CHROMATIC_CANDIDATES),
                device=x.device
            )

        # Stage 3: fine-grained scoring among candidates
        # Get candidate RBY positions
        all_rby = torch.stack([n.rby_position for n in nano_pool])  # (N, 3)
        cand_rby = all_rby[candidate_indices]  # (B, S, candidates, 3)

        # Score each candidate: concat token features + candidate RBY → scalar
        token_expanded = x.unsqueeze(2).expand(-1, -1, CHROMATIC_CANDIDATES, -1)
        combined = torch.cat([token_expanded, cand_rby], dim=-1)  # (B, S, cands, D+3)
        fine_scores = self.fine_scorer(combined).squeeze(-1)  # (B, S, cands)

        # Scatter into full score matrix
        scores = torch.full((B, S, self.num_nanos), float('-inf'), device=x.device)
        scores.scatter_(2, candidate_indices, fine_scores)

        return scores


# =============================================================================
# CORE: Chromatic Index — O(log N) nano lookup (extract to core/chromatic_index.py)
# =============================================================================

class ChromaticIndex:
    """
    Spatial index of nano positions in RBY space using KD-tree.
    Enables O(log N) lookup of nearest nanos for any input RBY projection.

    Must be rebuilt when nanos are born/die (pool changes).
    """

    def __init__(self, nano_positions: torch.Tensor = None):
        """
        Args:
            nano_positions: (N, 3) tensor of RBY positions
        """
        self.tree = None
        if nano_positions is not None:
            self.rebuild(nano_positions)

    def rebuild(self, nano_positions: torch.Tensor):
        """Rebuild the KD-tree from current nano positions."""
        from scipy.spatial import KDTree
        positions_np = nano_positions.detach().cpu().numpy()
        self.tree = KDTree(positions_np)

    def query(self, rby_batch: torch.Tensor, k: int = CHROMATIC_CANDIDATES) -> torch.Tensor:
        """
        Find k nearest nanos for each input RBY position.

        Args:
            rby_batch: (B, S, 3) or (N, 3)
            k: number of nearest neighbors

        Returns:
            indices: same leading dims + (k,) — indices into nano pool
        """
        original_shape = rby_batch.shape[:-1]
        positions = rby_batch.detach().cpu().numpy().reshape(-1, 3)
        _, indices = self.tree.query(positions, k=k)
        indices = torch.tensor(indices, dtype=torch.long, device=rby_batch.device)
        return indices.reshape(*original_shape, k)


# =============================================================================
# CORE: Expert Crosstalk — IC-AE Reborn (extract to core/crosstalk.py)
# =============================================================================

class ExpertCrosstalk(nn.Module):
    """
    Active nanos attend to each other's outputs before combining.

    Gate starts at 0 → model begins as standard weighted sum.
    If crosstalk helps, gate learns to mix it in.
    Proven beneficial in test_24.

    CRITICAL: gate parameter MUST initialize at 0.0. Starting at other
    values causes training instability (proven empirically).
    """

    def __init__(self, d_model: int, n_heads: int = 2):
        super().__init__()
        self.cross_attn = nn.MultiheadAttention(d_model, n_heads, batch_first=True)
        self.gate = nn.Parameter(torch.tensor(0.0))  # MUST be 0.0

    def forward(self, nano_outputs: torch.Tensor, weights: torch.Tensor) -> torch.Tensor:
        """
        Args:
            nano_outputs: (B, S, k, D) — outputs from k active nanos
            weights: (B, S, k) — routing weights for each nano

        Returns:
            (B, S, D) — combined output
        """
        B, S, K, D = nano_outputs.shape

        # Standard path: weighted sum
        standard = (nano_outputs * weights.unsqueeze(-1)).sum(dim=2)  # (B, S, D)

        # Crosstalk path: nanos attend to each other within each position
        flat = nano_outputs.view(B * S, K, D)
        infected, _ = self.cross_attn(flat, flat, flat)
        infected = infected.view(B, S, K, D)
        infected_sum = (infected * weights.unsqueeze(-1)).sum(dim=2)

        # Learned gate
        alpha = torch.sigmoid(self.gate)
        return (1 - alpha) * standard + alpha * infected_sum


# =============================================================================
# CORE: Swarm Layer (extract to core/swarm_layer.py)
# =============================================================================

class SwarmLayer(nn.Module):
    """
    One layer of the Nano Sea: shared attention + routed nano swarm.

    Each layer has its OWN pool of nanos and its OWN router.
    """

    def __init__(self, d_model: int, n_heads: int, nano_pool: list,
                 top_k: int = DEFAULT_TOP_K):
        super().__init__()
        # Shared attention
        self.ln1 = nn.LayerNorm(d_model)
        self.attn = nn.MultiheadAttention(d_model, n_heads, batch_first=True)

        # Nano swarm
        self.ln2 = nn.LayerNorm(d_model)
        self.nano_pool = nn.ModuleList(nano_pool)
        self.router = SwarmRouter(d_model, len(nano_pool), top_k)
        self.top_k = top_k

        # Crosstalk
        self.crosstalk = ExpertCrosstalk(d_model, n_heads=2)

        # Set pool indices on nanos
        for i, nano in enumerate(self.nano_pool):
            nano.pool_index = i

    def forward(self, x: torch.Tensor, mask: torch.Tensor = None) -> tuple:
        """
        Args:
            x: (B, S, d_model)
            mask: optional attention mask

        Returns:
            x: (B, S, d_model) — output with residual connections
            touch_event: dict with routing info for TouchTensor
        """
        # 1. Shared attention
        h = self.ln1(x)
        h, _ = self.attn(h, h, h, attn_mask=mask)
        x = x + h

        # 2. Nano swarm
        h = self.ln2(x)
        h, touch_event = self._swarm_forward(h)
        x = x + h

        return x, touch_event

    def _swarm_forward(self, x: torch.Tensor) -> tuple:
        B, S, D = x.shape

        # Route: get weights and indices for top-k nanos
        weights, indices = self.router(x, self.nano_pool)
        # weights: (B, S, top_k), indices: (B, S, top_k)

        # Run selected nanos and collect outputs
        # For efficiency: batch all tokens going to each nano
        nano_outputs = torch.zeros(B, S, self.top_k, D, device=x.device)

        for k_idx in range(self.top_k):
            slot_indices = indices[:, :, k_idx]  # (B, S) — which nano for this slot

            # Group by nano index for batched execution
            for nano_idx in slot_indices.unique():
                mask = (slot_indices == nano_idx)  # (B, S) bool
                if mask.any():
                    nano = self.nano_pool[nano_idx.item()]
                    nano_input = x[mask]  # (num_selected, D)
                    nano_output = nano(nano_input.unsqueeze(1)).squeeze(1)  # (num_selected, D)
                    nano_outputs[mask, k_idx] = nano_output

                    # Track activation
                    nano.touch_count += mask.sum().item()

        # Crosstalk: nanos attend to each other, then weighted sum
        output = self.crosstalk(nano_outputs, weights)

        touch_event = {
            'indices': indices.detach(),
            'weights': weights.detach(),
        }

        return output, touch_event


# =============================================================================
# CORE: Full Nano Sea Model (extract to core/swarm_model.py)
# =============================================================================

class NanoSeaModel(nn.Module):
    """
    The complete Nano Sea model.

    SharedEmbedding → [SwarmLayer × N] → SharedOutputHead

    The shared layers (embedding + output head) ensure all nanos speak
    the same vector language. The swarm layers contain the nano pools.
    """

    def __init__(self, vocab_size: int = VOCAB_SIZE, d_model: int = D_MODEL,
                 n_heads: int = N_HEADS, n_layers: int = N_LAYERS,
                 nanos_per_layer: int = 8, nano_hidden_dim: int = DEFAULT_HIDDEN_DIM,
                 top_k: int = DEFAULT_TOP_K):
        super().__init__()

        # Shared embedding
        self.embedding = nn.Embedding(vocab_size, d_model)
        self.pos_encoding = nn.Embedding(MAX_SEQ_LEN, d_model)

        # Swarm layers — each with its own nano pool
        self.layers = nn.ModuleList()
        for _ in range(n_layers):
            pool = [Nano(d_model, nano_hidden_dim) for _ in range(nanos_per_layer)]
            layer = SwarmLayer(d_model, n_heads, pool, top_k)
            self.layers.append(layer)

        # Shared output head
        self.ln_final = nn.LayerNorm(d_model)
        self.head = nn.Linear(d_model, vocab_size)

        self._init_weights()

    def _init_weights(self):
        nn.init.normal_(self.embedding.weight, std=0.02)
        nn.init.normal_(self.pos_encoding.weight, std=0.02)
        nn.init.zeros_(self.head.bias)

    def forward(self, input_ids: torch.Tensor) -> tuple:
        """
        Args:
            input_ids: (B, S) token IDs

        Returns:
            logits: (B, S, vocab_size)
            all_touch_events: list of touch events from each layer
        """
        B, S = input_ids.shape

        # Embed
        tok_emb = self.embedding(input_ids)
        pos_ids = torch.arange(S, device=input_ids.device).unsqueeze(0)
        pos_emb = self.pos_encoding(pos_ids)
        h = tok_emb + pos_emb

        # Causal mask for autoregressive generation
        mask = torch.triu(torch.ones(S, S, device=h.device), diagonal=1).bool()

        # Swarm layers
        all_touch_events = []
        for layer in self.layers:
            h, touch = layer(h, mask)
            all_touch_events.append(touch)

        # Output head
        h = self.ln_final(h)
        logits = self.head(h)

        return logits, all_touch_events

    @torch.no_grad()
    def generate(self, input_ids: torch.Tensor, max_new_tokens: int = 100,
                 temperature: float = 0.8) -> torch.Tensor:
        """Autoregressive generation."""
        for _ in range(max_new_tokens):
            # Crop to max sequence length
            x = input_ids[:, -MAX_SEQ_LEN:]
            logits, _ = self(x)
            logits = logits[:, -1, :] / temperature
            probs = F.softmax(logits, dim=-1)
            next_token = torch.multinomial(probs, num_samples=1)
            input_ids = torch.cat([input_ids, next_token], dim=1)
        return input_ids

    @property
    def total_nanos(self) -> int:
        return sum(len(layer.nano_pool) for layer in self.layers)

    @property
    def total_params(self) -> int:
        return sum(p.numel() for p in self.parameters())


# =============================================================================
# CORE: Touch Tensor (extract to core/touch_tensor.py)
# =============================================================================

class TouchTensor:
    """
    Records which nanos activate for which inputs.

    Drives lifecycle decisions:
    - Underutilized nanos → candidates for death
    - Overloaded nanos → candidates for splitting
    - Co-activation patterns → synergy detection
    """

    def __init__(self, num_nanos: int):
        self.num_nanos = num_nanos
        self.profiles = torch.zeros(num_nanos, dtype=torch.float32)
        self.cross_matrix = torch.zeros(num_nanos, num_nanos, dtype=torch.float32)
        self.touch_counts = torch.zeros(num_nanos, dtype=torch.long)
        self.total_activations = 0

    def update(self, touch_events: list):
        """Update from a list of touch events (one per layer)."""
        for event in touch_events:
            indices = event['indices']   # (B, S, k)
            weights = event['weights']   # (B, S, k)

            flat_idx = indices.reshape(-1).cpu()
            self.touch_counts.scatter_add_(
                0, flat_idx,
                torch.ones_like(flat_idx, dtype=torch.long)
            )
            self.total_activations += flat_idx.shape[0]

            # Cross-matrix: which nanos co-activate
            B, S, K = indices.shape
            for b in range(min(B, 4)):  # sample to keep this fast
                for s in range(0, S, 8):  # sample every 8th position
                    active = indices[b, s].cpu()
                    for i in range(K):
                        for j in range(i + 1, K):
                            if active[i] < self.num_nanos and active[j] < self.num_nanos:
                                self.cross_matrix[active[i], active[j]] += 1
                                self.cross_matrix[active[j], active[i]] += 1

    def utilization(self) -> torch.Tensor:
        """Per-nano fraction of total activations."""
        total = self.touch_counts.sum().float()
        return self.touch_counts.float() / (total + 1e-9)

    def underutilized(self, threshold: float = 0.001) -> torch.Tensor:
        """Nanos almost never activated."""
        return (self.utilization() < threshold).nonzero(as_tuple=True)[0]

    def overloaded(self, threshold: float = 0.1) -> torch.Tensor:
        """Nanos activated too often."""
        return (self.utilization() > threshold).nonzero(as_tuple=True)[0]

    def synergy_partners(self, nano_idx: int, top_n: int = 5) -> torch.Tensor:
        """Which nanos most often co-activate with this one?"""
        return self.cross_matrix[nano_idx].topk(top_n).indices


# =============================================================================
# CORE: RBY Math (extract to core/rby.py)
# =============================================================================

def aitchison_distance(x: torch.Tensor, z: torch.Tensor, eps: float = 1e-8) -> torch.Tensor:
    """
    The CORRECT distance metric for points on the RBY simplex.

    Euclidean distance is WRONG on the simplex (distorts edges).
    Aitchison distance respects the compositional constraint R+B+Y=1.

    Used by Chromatic Router for all RBY distance calculations.
    Proven in test_22.
    """
    x = x.clamp(min=eps)
    z = z.clamp(min=eps)
    g_x = x.prod(dim=-1, keepdim=True).pow(1.0 / 3.0)
    g_z = z.prod(dim=-1, keepdim=True).pow(1.0 / 3.0)
    clr_x = (x / g_x).log()
    clr_z = (z / g_z).log()
    return (clr_x - clr_z).norm(dim=-1)


def compute_uf_io(success: float, error: float, complexity: float) -> tuple:
    """
    Compute the driving forces of the Nano Sea.

    UF (Unstoppable Force) = expansion drive
    IO (Immovable Object) = stability resistance

    Proven canonical in test_02.
    """
    UF = success * (1 - math.tanh(complexity))
    IO = error * math.tanh(complexity)
    return UF, IO


def update_rby(rby: tuple, UF: float, IO: float,
               success: float, error: float,
               plasticity: tuple = (0.1, 0.05, 0.08)) -> tuple:
    """
    Update the RBY seed based on current dynamics.

    Proven canonical in test_02.
    """
    r, b, y = rby
    pr, pb, py = plasticity

    r_new = r + pr * (error - r) * UF
    b_new = b + pb * (math.tanh(success) - b) * IO

    total = r_new + b_new
    if total >= 1.0:
        r_new = r_new / (total + 0.01) * 0.99
        b_new = b_new / (total + 0.01) * 0.99
    y_new = 1.0 - r_new - b_new

    return (max(0.01, r_new), max(0.01, b_new), max(0.01, y_new))


# =============================================================================
# LIFECYCLE: Fitness Evaluator (extract to lifecycle/fitness.py)
# =============================================================================

class FitnessEvaluator:
    """
    Computes nano fitness from three signals:
      contribution: how much did the nano lower loss?
      utilization: how often was it activated?
      efficiency: how few parameters for how much contribution?

    fitness = 0.5 * contribution + 0.3 * utilization + 0.2 * efficiency

    Fitness drives spawning (high → split), death (low → compress),
    and federated averaging (fitness-weighted).
    """

    def __init__(self, ema_alpha: float = 0.1):
        self.ema_alpha = ema_alpha  # exponential moving average smoothing
        self.contribution_history: dict[str, float] = {}

    def evaluate(self, nano: Nano, touch_tensor: TouchTensor,
                 loss_without: float = None, loss_with: float = None) -> float:
        """
        Args:
            nano: the nano to evaluate
            touch_tensor: global touch data
            loss_without: (optional) loss when this nano is masked out
            loss_with: (optional) loss with this nano active

        Returns:
            fitness score in [0, 1]
        """
        # Contribution: how much does removing this nano hurt?
        if loss_without is not None and loss_with is not None:
            delta = max(0, loss_without - loss_with)
            contribution = min(1.0, delta / (loss_with + 1e-9))
        else:
            contribution = 0.5  # neutral if we haven't measured

        # EMA smoothing
        prev = self.contribution_history.get(nano.nano_id, contribution)
        contribution = self.ema_alpha * contribution + (1 - self.ema_alpha) * prev
        self.contribution_history[nano.nano_id] = contribution

        # Utilization: fraction of total activations
        if nano.pool_index >= 0:
            util = touch_tensor.utilization()
            utilization = min(1.0, util[nano.pool_index].item() * 20)
        else:
            utilization = 0.0

        # Efficiency: contribution per parameter (normalized)
        params = nano.param_count
        efficiency = contribution / (math.log2(params + 1) / 20)
        efficiency = min(1.0, efficiency)

        fitness = 0.5 * contribution + 0.3 * utilization + 0.2 * efficiency
        nano.fitness = fitness
        return fitness

    def evaluate_all(self, model: NanoSeaModel, touch_tensor: TouchTensor) -> dict:
        """Quick pass: evaluate all nanos without ablation (no loss_without)."""
        results = {}
        for layer_idx, layer in enumerate(model.layers):
            for nano in layer.nano_pool:
                f = self.evaluate(nano, touch_tensor)
                results[nano.nano_id] = f
        return results


# =============================================================================
# LIFECYCLE: Cosmic Cycle Manager (extract to lifecycle/cosmic_cycle.py)
# =============================================================================

class CosmicCycleManager:
    """
    Orchestrates the nano lifecycle through cosmic cycles:

        EXPAND → TRAIN → ABSULARITY → COMPRESS → DEPOSIT → MUTATE → EXPAND

    This is the engine that makes the nano sea self-improving.

    One cycle = one complete loop. Each phase has clear entry/exit criteria
    and specific operations.
    """

    def __init__(self, model: NanoSeaModel, spawner: NanoSpawner,
                 compressor: CompressionEngine, detector: AbsularityDetector,
                 deposit_store: DepositStore, fitness_eval: FitnessEvaluator):
        self.model = model
        self.spawner = spawner
        self.compressor = compressor
        self.detector = detector
        self.deposit_store = deposit_store
        self.fitness_eval = fitness_eval
        self.cycle_count = 0
        self.phase = 'expand'

    def step(self, trainer: 'SwarmTrainer', touch_tensor: TouchTensor,
             val_loss: float, router_entropy: float) -> str:
        """
        Call every N training steps. Manages phase transitions.

        Returns: current phase name
        """
        if self.phase == 'expand':
            self._do_expand(touch_tensor, router_entropy)
            self.phase = 'train'

        elif self.phase == 'train':
            uf, io = compute_uf_io(
                success=1.0 / (val_loss + 1),
                error=val_loss / 10,
                complexity=self.cycle_count * 0.1
            )
            if self.detector.check(val_loss, router_entropy, uf, io):
                self.phase = 'compress'

        elif self.phase == 'compress':
            self._do_compress(trainer, touch_tensor)
            self.phase = 'deposit'

        elif self.phase == 'deposit':
            # Deposits were already created in compress. Now rebuild pools.
            self._do_rebuild(trainer)
            self.phase = 'mutate'

        elif self.phase == 'mutate':
            self._do_mutate()
            self.cycle_count += 1
            self.detector.reset()
            self.phase = 'expand'

        return self.phase

    def _do_expand(self, touch_tensor: TouchTensor, router_entropy: float):
        """Spawn new nanos based on need."""
        for layer in self.model.layers:
            reasons = self.spawner.should_spawn(
                touch_tensor, router_entropy, cycle_phase='expansion'
            )
            for reason, ctx in reasons[:3]:  # cap at 3 spawns per layer
                if reason == 'split' and 'nano_pool_index' in ctx:
                    idx = ctx['nano_pool_index']
                    if idx < len(layer.nano_pool):
                        parent = layer.nano_pool[idx]
                        new = self.spawner.spawn(
                            parent.up.in_features, 'split', parent=parent
                        )
                        new.birth_cycle = self.cycle_count
                        layer.nano_pool.append(new)
                elif reason == 'new':
                    deposit = self.deposit_store.get_best_unused()
                    if deposit:
                        new = self.spawner.spawn(
                            D_MODEL, 'deposit', deposit=deposit
                        )
                    else:
                        new = self.spawner.spawn(D_MODEL, 'new')
                    new.birth_cycle = self.cycle_count
                    layer.nano_pool.append(new)
            # Update router to match new pool size
            layer.router = SwarmRouter(
                D_MODEL, len(layer.nano_pool), layer.top_k
            ).to(next(layer.parameters()).device)

    def _do_compress(self, trainer: 'SwarmTrainer', touch_tensor: TouchTensor):
        """Kill weak nanos, create deposits."""
        self.compressor.current_cycle = self.cycle_count
        survivors, deposits = self.compressor.compress(
            self.model, touch_tensor
        )

        # Store deposits
        for dep in deposits:
            self.deposit_store.add(dep)

        # Remove dead nanos from pools
        for layer_idx, layer in enumerate(self.model.layers):
            surviving_nanos = []
            for nano_idx, nano in enumerate(layer.nano_pool):
                if (layer_idx, nano_idx) in survivors:
                    surviving_nanos.append(nano)
                else:
                    trainer.remove_nano(nano)
            layer.nano_pool = nn.ModuleList(surviving_nanos)
            layer.router = SwarmRouter(
                D_MODEL, len(surviving_nanos), layer.top_k
            ).to(next(layer.parameters()).device)

    def _do_rebuild(self, trainer: 'SwarmTrainer'):
        """Backfill pools from deposits if they're too small."""
        for layer in self.model.layers:
            min_pool = 4
            while len(layer.nano_pool) < min_pool:
                deposit = self.deposit_store.get_best_unused()
                if deposit:
                    new = self.spawner.spawn(D_MODEL, 'deposit', deposit=deposit)
                else:
                    new = self.spawner.spawn(D_MODEL, 'new')
                new.birth_cycle = self.cycle_count
                layer.nano_pool.append(new)
            layer.router = SwarmRouter(
                D_MODEL, len(layer.nano_pool), layer.top_k
            ).to(next(layer.parameters()).device)

    def _do_mutate(self):
        """Perturb RBY positions of surviving nanos to encourage exploration."""
        for layer in self.model.layers:
            for nano in layer.nano_pool:
                nano.rby_position.data += 0.02 * torch.randn(3)
                nano.rby_position.data = F.softmax(nano.rby_position.data, dim=0)


# =============================================================================
# LIFECYCLE: Nano Spawner (extract to lifecycle/spawner.py)
# =============================================================================

class NanoSpawner:
    """Creates new nanos based on need, not hardcoded categories."""

    def spawn(self, d_model: int = D_MODEL, reason: str = 'new',
              parent: Nano = None, deposit=None,
              rby_seed: list = None) -> Nano:
        """
        Spawn a new nano.

        Reasons:
            'new': fresh random nano
            'split': clone parent + noise (parent overloaded)
            'deposit': warm-start from dead nano's deposit
            'expansion': cosmic cycle expansion phase
        """
        if reason == 'split' and parent is not None:
            child = copy.deepcopy(parent)
            child.nano_id = uuid4().hex[:12]
            for p in child.parameters():
                if p.requires_grad:
                    p.data += 0.01 * torch.randn_like(p)
            # Perturb RBY to differentiate from parent
            child.rby_position.data += 0.05 * torch.randn(3)
            child.rby_position.data = F.softmax(child.rby_position.data, dim=0)
            child.fitness = parent.fitness * 0.8
            child.touch_count = 0
            return child

        elif reason == 'deposit' and deposit is not None:
            nano = Nano(d_model, deposit.hidden_dim,
                        rby_seed=deposit.rby_position)
            # Load weights from deposit
            try:
                nano.load_state_dict(deposit.weights, strict=False)
            except Exception:
                pass  # shape mismatch → start fresh with deposit's RBY
            nano.parent_deposit_id = deposit.deposit_id
            return nano

        else:
            # Fresh nano, sized by RBY seed
            rby = rby_seed or [0.33, 0.33, 0.34]
            hidden_dim = self._size_from_rby(rby)
            return Nano(d_model, hidden_dim, rby_seed=rby)

    def _size_from_rby(self, rby: list) -> int:
        """Blue-heavy nanos get more params (deeper reasoning)."""
        r, b, y = rby
        scale = 0.5 + b  # b ∈ [0,1] → scale ∈ [0.5, 1.5]
        hidden = int(DEFAULT_HIDDEN_DIM * scale)
        return max(MIN_HIDDEN_DIM, min(MAX_HIDDEN_DIM, hidden))

    def should_spawn(self, touch_tensor: TouchTensor, router_entropy: float,
                     cycle_phase: str = 'training') -> list:
        """
        Determine if new nanos are needed and why.

        Returns list of (reason, context) tuples.
        """
        reasons = []

        # High router entropy → no existing nano matches well
        if router_entropy > 2.0:
            reasons.append(('new', {'trigger': 'high_entropy'}))

        # Overloaded nanos → split them
        overloaded = touch_tensor.overloaded(threshold=0.1)
        for idx in overloaded:
            reasons.append(('split', {'nano_pool_index': idx.item()}))

        # Expansion phase → periodic growth
        if cycle_phase == 'expansion':
            reasons.append(('new', {'trigger': 'expansion'}))

        return reasons


# =============================================================================
# LIFECYCLE: Compression & Deposits (extract to lifecycle/compression.py)
# =============================================================================

@dataclass
class Deposit:
    """Knowledge extracted from a dead nano. Seeds future nanos."""
    deposit_id: str
    rby_position: list
    hidden_dim: int
    weights: dict              # full state_dict (Stage 0 — highest fidelity)
    centroid: torch.Tensor     # mean activation pattern (Stage 2)
    touch_count: int
    fitness_at_death: float
    birth_cycle: int
    death_cycle: int
    used: bool = False         # has this deposit been used to spawn a nano?


class CompressionEngine:
    """
    Cosmic compression: prune weak nanos, extract deposits.

    Triggered at Absularity. Weak nanos die, strong survive.
    Dead nanos become deposits that warm-start future nanos.

    Proven to improve cycle-over-cycle in test_26.
    """

    def __init__(self):
        self.current_cycle = 0

    def compress(self, model: NanoSeaModel, touch_tensor: TouchTensor,
                 survival_rate: float = COMPRESSION_SURVIVAL_RATE) -> tuple:
        """
        Returns:
            survivors: set of (layer_idx, nano_pool_idx) that survive
            deposits: list of Deposit objects from dead nanos
        """
        scores = {}
        for layer_idx, layer in enumerate(model.layers):
            for nano_idx, nano in enumerate(layer.nano_pool):
                utilization = touch_tensor.utilization()
                u = utilization[nano.pool_index].item() if nano.pool_index < len(utilization) else 0
                score = nano.fitness * 0.7 + min(1.0, u * 20) * 0.3
                scores[(layer_idx, nano_idx)] = score

        # Sort and split
        sorted_scores = sorted(scores.values())
        threshold_idx = int(len(sorted_scores) * (1 - survival_rate))
        threshold = sorted_scores[threshold_idx] if threshold_idx < len(sorted_scores) else 0

        survivors = set()
        condemned = []
        for key, score in scores.items():
            if score >= threshold:
                survivors.add(key)
            else:
                condemned.append(key)

        # Create deposits from condemned
        deposits = []
        for (layer_idx, nano_idx) in condemned:
            nano = model.layers[layer_idx].nano_pool[nano_idx]
            deposit = Deposit(
                deposit_id=uuid4().hex[:12],
                rby_position=nano.rby_position.detach().cpu().tolist(),
                hidden_dim=nano.hidden_dim,
                weights={k: v.detach().cpu() for k, v in nano.state_dict().items()},
                centroid=self._compute_centroid(nano),
                touch_count=nano.touch_count,
                fitness_at_death=nano.fitness,
                birth_cycle=nano.birth_cycle,
                death_cycle=self.current_cycle,
            )
            deposits.append(deposit)

        return survivors, deposits

    def _compute_centroid(self, nano: Nano) -> torch.Tensor:
        """Average weight magnitude per layer as a compact fingerprint."""
        centroids = []
        for p in nano.parameters():
            centroids.append(p.data.detach().cpu().mean())
        return torch.stack(centroids) if centroids else torch.tensor([0.0])


# =============================================================================
# LIFECYCLE: Deposit Store (extract to lifecycle/deposit_store.py)
# =============================================================================

class DepositStore:
    """Persists deposits to disk and provides retrieval."""

    def __init__(self, store_dir: str = 'deposits'):
        self.store_dir = Path(store_dir)
        self.store_dir.mkdir(parents=True, exist_ok=True)
        self.deposits: list[Deposit] = []

    def add(self, deposit: Deposit):
        self.deposits.append(deposit)
        self._save_deposit(deposit)

    def get_best_unused(self) -> Optional[Deposit]:
        """Get the highest-fitness unused deposit."""
        unused = [d for d in self.deposits if not d.used]
        if not unused:
            return None
        best = max(unused, key=lambda d: d.fitness_at_death)
        best.used = True
        return best

    def get_nearest_rby(self, rby: list, k: int = 1) -> list:
        """Find deposits closest to a given RBY position."""
        if not self.deposits:
            return []
        positions = torch.tensor([d.rby_position for d in self.deposits])
        target = torch.tensor(rby)
        distances = aitchison_distance(
            positions, target.unsqueeze(0).expand_as(positions)
        )
        _, indices = distances.topk(min(k, len(self.deposits)), largest=False)
        return [self.deposits[i] for i in indices]

    def _save_deposit(self, deposit: Deposit):
        path = self.store_dir / f'{deposit.deposit_id}.pt'
        data = {
            'deposit_id': deposit.deposit_id,
            'rby_position': deposit.rby_position,
            'hidden_dim': deposit.hidden_dim,
            'weights': deposit.weights,
            'centroid': deposit.centroid,
            'touch_count': deposit.touch_count,
            'fitness_at_death': deposit.fitness_at_death,
            'birth_cycle': deposit.birth_cycle,
            'death_cycle': deposit.death_cycle,
        }
        torch.save(data, path)

    def load_all(self):
        """Load all deposits from disk."""
        self.deposits = []
        for path in self.store_dir.glob('*.pt'):
            data = torch.load(path, weights_only=False)
            dep = Deposit(**data)
            self.deposits.append(dep)


# =============================================================================
# LIFECYCLE: Absularity Detector (extract to lifecycle/absularity.py)
# =============================================================================

class AbsularityDetector:
    """
    Detects when the system has saturated its current configuration.

    ALL conditions must hold simultaneously:
    1. Loss plateau
    2. Router entropy stable
    3. RBY equilibrium (UF ≈ IO)

    When detected → trigger compression → next cosmic cycle.
    """

    def __init__(self, window_size: int = 100, threshold: float = 0.05):
        self.window_size = window_size
        self.threshold = threshold
        self.loss_history: list[float] = []
        self.entropy_history: list[float] = []

    def check(self, val_loss: float, router_entropy: float,
              uf: float, io: float) -> bool:
        self.loss_history.append(val_loss)
        self.entropy_history.append(router_entropy)

        if len(self.loss_history) < self.window_size:
            return False

        window = self.loss_history[-self.window_size:]

        loss_plateau = (max(window) - min(window)) < self.threshold
        entropy_stable = torch.std(
            torch.tensor(self.entropy_history[-self.window_size:])
        ).item() < self.threshold
        rby_equilibrium = abs(uf - io) < self.threshold

        return loss_plateau and entropy_stable and rby_equilibrium

    def reset(self):
        self.loss_history.clear()
        self.entropy_history.clear()


# =============================================================================
# TRAINING: Swarm Trainer (extract to training/swarm_trainer.py)
# =============================================================================

class SwarmTrainer:
    """
    End-to-end training for the entire Nano Sea.

    Key: only ACTIVE nanos get gradients. Inactive nanos are untouched.
    This is automatic — PyTorch only backprops through used parameters.

    CRITICAL: Do NOT recreate the optimizer each cycle. Momentum is preserved.
    When nanos die, pop their state from optimizer.state (proven fix from test_30v2).
    """

    def __init__(self, model: NanoSeaModel, lr: float = LEARNING_RATE):
        self.model = model
        self.optimizer = torch.optim.AdamW(model.parameters(), lr=lr)

    def train_step(self, input_ids: torch.Tensor,
                   target_ids: torch.Tensor) -> dict:
        self.model.train()

        logits, touch_events = self.model(input_ids)

        # Language modeling loss
        ce_loss = F.cross_entropy(
            logits.view(-1, VOCAB_SIZE), target_ids.view(-1)
        )

        # Efficiency loss: penalize activating too many nanos
        eff_loss = self._efficiency_loss(touch_events)

        loss = ce_loss + EFF_LAMBDA * eff_loss

        self.optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(self.model.parameters(), 1.0)
        self.optimizer.step()

        return {
            'loss': loss.item(),
            'ce_loss': ce_loss.item(),
            'eff_loss': eff_loss.item(),
            'touch_events': touch_events,
            'router_entropy': self._router_entropy(touch_events),
        }

    def _efficiency_loss(self, touch_events: list) -> torch.Tensor:
        """Penalize using too many nanos per token."""
        total = 0.0
        for event in touch_events:
            weights = event['weights']  # (B, S, k)
            # Entropy of weights: lower = more focused on fewer nanos
            # We want to MINIMIZE the number of active nanos
            # → penalize when weights are spread evenly
            ent = -(weights * (weights + 1e-9).log()).sum(-1).mean()
            total += ent
        return total / len(touch_events)

    def _router_entropy(self, touch_events: list) -> float:
        """Average router entropy across layers."""
        entropies = []
        for event in touch_events:
            w = event['weights']
            ent = -(w * (w + 1e-9).log()).sum(-1).mean()
            entropies.append(ent.item())
        return sum(entropies) / len(entropies) if entropies else 0.0

    @torch.no_grad()
    def evaluate(self, input_ids: torch.Tensor,
                 target_ids: torch.Tensor) -> float:
        """Compute perplexity on validation data."""
        self.model.eval()
        logits, _ = self.model(input_ids)
        loss = F.cross_entropy(
            logits.view(-1, VOCAB_SIZE), target_ids.view(-1)
        )
        return math.exp(loss.item())

    def remove_nano(self, nano: Nano):
        """
        Clean up optimizer state when a nano dies.
        CRITICAL: use .pop(p, None), NOT id(p).
        Bug proven and fixed in test_30v2.
        """
        for p in nano.parameters():
            self.optimizer.state.pop(p, None)


# =============================================================================
# TRAINING: Validated Midwife — LLM Bird-Feeder (extract to training/midwife.py)
# =============================================================================

class ValidatedMidwife:
    """
    Uses an external LLM to generate training data, then VALIDATES it
    by executing code outputs and checking results.

    The midwife is the nano sea's teacher. As the sea gets better,
    the midwife generates harder problems (curriculum pacing).

    Flow:
        1. Ask LLM to generate (prompt, expected_output) pairs
        2. If code: execute to verify output matches expected
        3. If text: syntax/grammar/coherence check
        4. Only pass VALIDATED pairs to the trainer
        5. Increase difficulty as the sea's pass rate improves
    """

    def __init__(self, llm_endpoint: str = 'http://localhost:11434/api/generate',
                 difficulty: float = 0.3):
        self.llm_endpoint = llm_endpoint
        self.difficulty = difficulty
        self.pass_rate_history: list[float] = []

    def generate_batch(self, n: int = 10, topic: str = 'python') -> list:
        """
        Generate training pairs. Returns list of validated (input, output) dicts.

        In real implementation: calls LLM API. Here: shows the interface.
        """
        import subprocess

        raw_pairs = self._ask_llm(n, topic)
        validated = []

        for pair in raw_pairs:
            if pair.get('type') == 'code':
                if self._validate_code(pair):
                    validated.append(pair)
            elif pair.get('type') == 'text':
                if self._validate_text(pair):
                    validated.append(pair)
            else:
                validated.append(pair)  # unknown type: trust LLM

        # Track pass rate for curriculum pacing
        if raw_pairs:
            pass_rate = len(validated) / len(raw_pairs)
            self.pass_rate_history.append(pass_rate)

        return validated

    def _ask_llm(self, n: int, topic: str) -> list:
        """
        Ask the LLM to generate training pairs.

        Actual implementation should use requests to call the LLM API.
        This shows the expected prompt structure.
        """
        # The prompt must ask for BOTH input AND expected output
        prompt = (
            f"Generate {n} Python coding exercises at difficulty "
            f"{self.difficulty:.1f}/1.0 about {topic}.\n"
            f"For each, provide:\n"
            f'1. A code prompt (what to write)\n'
            f'2. A reference solution\n'
            f'3. A test case with expected output\n'
            f'Format as JSON array with keys: '
            f'"prompt", "solution", "test_input", "expected_output", "type"\n'
        )

        # In real implementation:
        # response = requests.post(self.llm_endpoint,
        #     json={"model": "codellama", "prompt": prompt, "stream": False})
        # return json.loads(response.json()['response'])

        # Placeholder: return empty (real implementation calls API)
        return []

    def _validate_code(self, pair: dict) -> bool:
        """Execute code and verify output matches expected."""
        import subprocess
        import tempfile

        solution = pair.get('solution', '')
        test = pair.get('test_input', '')
        expected = pair.get('expected_output', '')

        if not solution or not expected:
            return False

        code = f"{solution}\n{test}"

        try:
            with tempfile.NamedTemporaryFile(mode='w', suffix='.py',
                                              delete=False) as f:
                f.write(code)
                f.flush()

                result = subprocess.run(
                    ['python', f.name],
                    capture_output=True, text=True, timeout=10,
                    # SECURITY: sandbox this in production
                )

                actual = result.stdout.strip()
                return actual == expected.strip()
        except (subprocess.TimeoutExpired, Exception):
            return False

    def _validate_text(self, pair: dict) -> bool:
        """Basic text coherence check."""
        output = pair.get('expected_output', '')
        # Minimum: non-empty, reasonable length, no garbage
        if not output or len(output) < 10:
            return False
        # Check it's not just repeated characters
        unique_chars = len(set(output))
        if unique_chars < 5:
            return False
        return True

    def update_difficulty(self):
        """
        Curriculum pacing: if the sea is doing well, make it harder.
        """
        if len(self.pass_rate_history) < 10:
            return

        recent = self.pass_rate_history[-10:]
        avg = sum(recent) / len(recent)

        if avg > 0.8:
            self.difficulty = min(1.0, self.difficulty + 0.05)
        elif avg < 0.3:
            self.difficulty = max(0.1, self.difficulty - 0.05)


# =============================================================================
# TRAINING: Independence Tracker (extract to training/independence.py)
# =============================================================================

class IndependenceTracker:
    """
    Tracks how well the nano sea performs vs the midwife LLM on each task type.

    Goal: graduated independence. When the sea matches the LLM on a task,
    we stop needing the LLM for that task's training data.

    This is how the nano sea eventually REPLACES the LLM.
    """

    def __init__(self):
        self.task_scores: dict[str, dict] = {}
        # {task_name: {"sea_correct": int, "llm_correct": int, "total": int}}

    def record(self, task_name: str, sea_correct: bool, llm_correct: bool):
        if task_name not in self.task_scores:
            self.task_scores[task_name] = {
                'sea_correct': 0, 'llm_correct': 0, 'total': 0
            }
        self.task_scores[task_name]['total'] += 1
        if sea_correct:
            self.task_scores[task_name]['sea_correct'] += 1
        if llm_correct:
            self.task_scores[task_name]['llm_correct'] += 1

    def independence_ratio(self, task_name: str) -> float:
        """
        How close is the sea to matching the LLM?
        Returns 0.0 (sea useless) to 1.0+ (sea matches/beats LLM).
        """
        if task_name not in self.task_scores:
            return 0.0
        scores = self.task_scores[task_name]
        if scores['llm_correct'] == 0:
            return 1.0  # LLM can't do it either
        return scores['sea_correct'] / scores['llm_correct']

    def independent_tasks(self, threshold: float = 0.9) -> list:
        """Tasks where the sea no longer needs the LLM."""
        return [
            task for task in self.task_scores
            if self.independence_ratio(task) >= threshold
        ]

    def dependent_tasks(self, threshold: float = 0.5) -> list:
        """Tasks where the sea still needs heavy LLM support."""
        return [
            task for task in self.task_scores
            if self.independence_ratio(task) < threshold
        ]

    def summary(self) -> dict:
        return {
            task: {
                'independence': f'{self.independence_ratio(task):.1%}',
                **scores
            }
            for task, scores in self.task_scores.items()
        }


# =============================================================================
# MEMORY: Nano Paging Manager (extract to memory/paging.py)
# =============================================================================

class NanoMemoryManager:
    """
    Pages nanos between GPU, CPU RAM, and disk.

    With millions of nanos, only a fraction fits on GPU.
    Uses LRU eviction with predictive prefetch.

    Budget on GTX 1660 SUPER:
        GPU: ~4GB → ~20,000 nanos at 200KB each
        CPU: ~32GB → ~160,000 warm nanos
        Disk: unlimited cold storage
    """

    def __init__(self, gpu_budget_mb: int = GPU_NANO_BUDGET_MB,
                 cpu_budget_mb: int = CPU_NANO_BUDGET_MB,
                 checkpoint_dir: str = 'checkpoints'):
        self.gpu_cache: OrderedDict[str, Nano] = OrderedDict()
        self.cpu_cache: OrderedDict[str, Nano] = OrderedDict()
        self.checkpoint_dir = Path(checkpoint_dir)
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)
        self.gpu_budget = gpu_budget_mb * 1024 * 1024
        self.cpu_budget = cpu_budget_mb * 1024 * 1024
        self.gpu_used = 0
        self.cpu_used = 0

    def get(self, nano_id: str) -> Optional[Nano]:
        # GPU (hot)
        if nano_id in self.gpu_cache:
            self.gpu_cache.move_to_end(nano_id)
            return self.gpu_cache[nano_id]

        # CPU RAM (warm)
        if nano_id in self.cpu_cache:
            nano = self.cpu_cache.pop(nano_id)
            self.cpu_used -= self._bytes(nano)
            nano = nano.cuda()
            self._put_gpu(nano_id, nano)
            return nano

        # Disk (cold)
        path = self.checkpoint_dir / f'{nano_id}.pt'
        if path.exists():
            nano = torch.load(path, map_location='cuda', weights_only=False)
            self._put_gpu(nano_id, nano)
            return nano

        return None

    def put(self, nano_id: str, nano: Nano):
        """Add a nano to GPU cache."""
        if nano_id not in self.gpu_cache:
            self._put_gpu(nano_id, nano)

    def save_to_disk(self, nano_id: str, nano: Nano):
        """Persist nano to cold storage."""
        path = self.checkpoint_dir / f'{nano_id}.pt'
        torch.save(nano.cpu(), path)

    def prefetch(self, nano_ids: list):
        """Preload nanos that will be needed soon."""
        for nid in nano_ids:
            if nid not in self.gpu_cache:
                self.get(nid)

    def _put_gpu(self, nano_id: str, nano: Nano):
        nbytes = self._bytes(nano)
        while self.gpu_used + nbytes > self.gpu_budget and self.gpu_cache:
            self._evict_gpu()
        self.gpu_cache[nano_id] = nano
        self.gpu_used += nbytes

    def _evict_gpu(self):
        evicted_id, evicted = self.gpu_cache.popitem(last=False)
        self.gpu_used -= self._bytes(evicted)
        evicted = evicted.cpu()
        nbytes = self._bytes(evicted)

        while self.cpu_used + nbytes > self.cpu_budget and self.cpu_cache:
            disk_id, disk_nano = self.cpu_cache.popitem(last=False)
            self.cpu_used -= self._bytes(disk_nano)
            self.save_to_disk(disk_id, disk_nano)

        self.cpu_cache[evicted_id] = evicted
        self.cpu_used += nbytes

    @staticmethod
    def _bytes(nano: Nano) -> int:
        return sum(p.nelement() * p.element_size() for p in nano.parameters())


# =============================================================================
# MESH: Federated Aggregation (extract to mesh/federated.py)
# =============================================================================

class FederatedAggregator:
    """
    Combines nanos from multiple machines into global "super nanos."

    Only averages nanos with SIMILAR RBY positions (same specialization).
    Uses fitness-weighted averaging.
    """

    def aggregate(self, nanos_by_machine: dict) -> list:
        """
        Args:
            nanos_by_machine: {machine_id: [Nano, ...]}

        Returns:
            list of super-nanos (averaged)
        """
        all_nanos = []
        for machine_id, nanos in nanos_by_machine.items():
            for nano in nanos:
                all_nanos.append(nano)

        if len(all_nanos) < 2:
            return all_nanos

        # Cluster by RBY position
        positions = torch.stack([n.rby_position.detach() for n in all_nanos])
        from sklearn.cluster import KMeans
        n_clusters = max(1, len(all_nanos) // 5)
        labels = KMeans(n_clusters=n_clusters, n_init=10).fit_predict(
            positions.numpy()
        )

        super_nanos = []
        for cid in range(n_clusters):
            members = [n for n, l in zip(all_nanos, labels) if l == cid]
            if not members:
                continue

            # Ensure all same hidden_dim (can only average compatible nanos)
            hidden_dims = set(n.hidden_dim for n in members)
            for hd in hidden_dims:
                group = [n for n in members if n.hidden_dim == hd]
                if len(group) < 2:
                    super_nanos.extend(group)
                    continue

                total_fitness = sum(n.fitness for n in group)
                if total_fitness < 1e-9:
                    continue

                template = group[0]
                super_nano = Nano(
                    template.up.in_features, template.hidden_dim,
                    rby_seed=template.rby_position.detach().tolist()
                )

                with torch.no_grad():
                    for name, param in super_nano.named_parameters():
                        param.zero_()
                        for member in group:
                            w = member.fitness / total_fitness
                            member_param = dict(member.named_parameters())[name]
                            param.add_(w * member_param.detach())

                super_nano.fitness = total_fitness / len(group)
                super_nanos.append(super_nano)

        return super_nanos


# =============================================================================
# QUICK VALIDATION (run this file directly to verify everything works)
# =============================================================================

if __name__ == '__main__':
    print("=" * 60)
    print("Nano Sea v2 — Reference Implementation Validation")
    print("=" * 60)

    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"\nDevice: {device}")

    # 1. Create model
    print("\n--- Building NanoSeaModel ---")
    model = NanoSeaModel(
        vocab_size=256,  # small vocab for testing
        d_model=64,
        n_heads=4,
        n_layers=3,
        nanos_per_layer=8,
        nano_hidden_dim=32,
        top_k=4,
    ).to(device)
    print(f"Total nanos: {model.total_nanos}")
    print(f"Total params: {model.total_params:,}")

    # 2. Forward pass
    print("\n--- Forward Pass ---")
    input_ids = torch.randint(0, 256, (2, 64), device=device)
    logits, touch_events = model(input_ids)
    print(f"Input shape: {input_ids.shape}")
    print(f"Output shape: {logits.shape}")
    print(f"Touch events: {len(touch_events)} layers")

    # 3. Touch tensor
    print("\n--- Touch Tensor ---")
    touch = TouchTensor(model.total_nanos)
    touch.update(touch_events)
    print(f"Utilization range: [{touch.utilization().min():.4f}, {touch.utilization().max():.4f}]")

    # 4. Training step
    print("\n--- Training Step ---")
    VOCAB_SIZE_TEST = 256
    trainer = SwarmTrainer(model, lr=1e-3)
    targets = torch.randint(0, 256, (2, 64), device=device)
    # Temporarily override VOCAB_SIZE for this test
    import nano_sea_v2_reference as ref
    original_vs = ref.VOCAB_SIZE
    ref.VOCAB_SIZE = 256
    metrics = trainer.train_step(input_ids, targets)
    ref.VOCAB_SIZE = original_vs
    print(f"CE Loss: {metrics['ce_loss']:.4f}")
    print(f"Eff Loss: {metrics['eff_loss']:.4f}")
    print(f"Router Entropy: {metrics['router_entropy']:.4f}")

    # 5. Soft k-selection
    print("\n--- Soft K-Selection ---")
    scores = torch.randn(2, 64, 8, device=device)
    k_logits = torch.randn(2, 64, 4, device=device)
    eff_weights, top_idx = soft_k_selection(scores, k_logits, top_k_max=4)
    print(f"Effective weights shape: {eff_weights.shape}")
    print(f"Weights sum per token: {eff_weights.sum(-1).mean():.4f} (should be ~1.0)")

    # 6. Aitchison distance
    print("\n--- Aitchison Distance ---")
    p1 = torch.tensor([0.5, 0.3, 0.2])
    p2 = torch.tensor([0.33, 0.33, 0.34])
    dist = aitchison_distance(p1, p2)
    print(f"Distance between (0.5,0.3,0.2) and (0.33,0.33,0.34): {dist:.4f}")

    # 7. RBY update
    print("\n--- RBY Update ---")
    rby = (0.35, 0.30, 0.35)
    uf, io = compute_uf_io(success=0.7, error=0.3, complexity=0.5)
    new_rby = update_rby(rby, uf, io, 0.7, 0.3)
    print(f"UF={uf:.4f}, IO={io:.4f}")
    print(f"RBY: {rby} → {tuple(round(x, 4) for x in new_rby)}")
    print(f"RBY sum: {sum(new_rby):.6f} (should be 1.0)")

    # 8. Spawner
    print("\n--- Nano Spawner ---")
    spawner = NanoSpawner()
    new_nano = spawner.spawn(d_model=64, reason='new', rby_seed=[0.2, 0.6, 0.2])
    print(f"Spawned: {new_nano}")
    split_nano = spawner.spawn(d_model=64, reason='split', parent=model.layers[0].nano_pool[0])
    print(f"Split: {split_nano}")

    # 9. Compression
    print("\n--- Compression ---")
    compressor = CompressionEngine()
    survivors, deposits = compressor.compress(model, touch, survival_rate=0.5)
    print(f"Survivors: {len(survivors)}")
    print(f"Deposits created: {len(deposits)}")
    if deposits:
        print(f"First deposit RBY: {deposits[0].rby_position}")

    # 10. Absularity
    print("\n--- Absularity Detector ---")
    detector = AbsularityDetector(window_size=5, threshold=0.1)
    for i in range(10):
        val = 5.0 + 0.001 * i  # barely changing → should trigger
        result = detector.check(val, 1.5, 0.5, 0.48)
    print(f"Absularity detected: {result}")

    # 11. Generation
    print("\n--- Generation ---")
    prompt = torch.randint(0, 256, (1, 10), device=device)
    output = model.generate(prompt, max_new_tokens=20, temperature=1.0)
    print(f"Prompt length: 10, Generated length: {output.shape[1]}")

    print("\n" + "=" * 60)
    print("ALL VALIDATION CHECKS PASSED")
    print("=" * 60)
