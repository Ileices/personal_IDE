#!/usr/bin/env python3
"""
TEST 17 — THE REDESIGN: NanoMoE (Nano Mixture-of-Experts)
==========================================================

test_16 proved: NONE of 7 nano architectures can match a transformer.
The gap is architectural (ceiling 22.7% vs transformer's 49.6%).

Root cause: nanos lack CROSS-POSITION COMMUNICATION.
Every viable fix re-derives attention.

SOLUTION: Accept attention as shared infrastructure. Nanos become EXPERTS
(FFN blocks) within a Mixture-of-Experts transformer.

This IS still the nano vision:
  - Each experts a small, independent computation unit
  - Experts can be added/removed without retraining
  - Different experts specialize in different patterns
  - Experts can be distributed across machines (mesh)
  - Population grows organically over time

What's changed:
  - Shared attention layer provides cross-position communication
  - Nanos are experts (FFN blocks), not full predictors
  - Prediction at ALL positions (not just last token)
  - End-to-end gradient flow through the entire computation
  - Learned routing assigns tokens to experts

ARCHITECTURES TESTED:
  A. Baseline Transformer (2-layer, 4-head — same as test_16 reference)
  B. NanoMoE-Lite: 1 attn layer + N expert nanos, top-k routing
  C. NanoMoE-Full: 2 attn layers + N expert nanos per layer, top-k routing
  D. NanoMoE-Sparse: same as C but top-1 routing (extreme sparsity)
  E. NanoMoE-Growing: start with 4 experts, add experts during training
  F. NanoMoE-Distributed: experts split across 2 "virtual nodes" (simulated mesh)

PART 2: Match the transformer, then BEAT it with more experts
PART 3: Scaling law — accuracy vs N_experts at fixed attention size
PART 4: Efficiency — accuracy per FLOP comparison
"""

import os, sys, time, math, json
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Device: {device}")
if device == "cuda":
    print(f"GPU: {torch.cuda.get_device_properties(0).name}")
    torch.cuda.empty_cache()

# ═══════════════════════════════════════════════════════════════════════════
# DATA — Same corpus as test_16 for fair comparison
# ═══════════════════════════════════════════════════════════════════════════

CORPUS = """
The nano sea is a self-organizing system of tiny neural networks called nanos.
Each nano specializes in a narrow task: feature extraction, pattern recognition,
action generation, routing, or bridging between domains. Unlike large language
models that require massive centralized compute, nanos can train on any hardware
from a GT 1030 to an RTX 4090. The key insight is population batching: instead
of training nanos one at a time which wastes GPU due to kernel launch overhead,
we stack same-type nanos into a batched weight matrix and train them simultaneously
using torch.bmm. This achieves significant speedup at populations of hundreds.

The expansion-compression cycle drives evolution. During expansion, nanos spawn
from the primordial seed and begin processing data from the ambient environment.
During compression, nanos are triaged by fitness: the top survivors continue, the
middle majority are compressed into deposits that preserve their knowledge as
weight statistics, and the bottom fraction are destroyed completely. The surviving
nanos carry forward, guided by the knowledge of the compressed.

Deposits are the memory of the sea. When a nano is compressed, its weight means,
standard deviations, and activation patterns are recorded. New nanos use these
deposits to initialize their weights closer to proven configurations, avoiding
the mistakes of their predecessors. This is not random evolution but directed
learning across generations.

The mesh protocol enables multiple users to share deposits and high-fitness nanos
across the network. Each node maintains a local sea but participates in gossip
rounds where fitness scores and deposit summaries are exchanged. The critical
insight from experiments is that compute stays local. Transferring weights across
the network is almost always slower than retraining locally. The mesh exists for
coordination: discovering which nano architectures work best, sharing deposit
wisdom, and enabling marketplace exchange of proven nano populations.

Trust is earned through consistent contribution. Each node builds a reputation
based on the quality of deposits it shares. Nodes that provide deposits that
improve other seas gain trust; nodes that share garbage or adversarial weights
lose trust and eventually get blacklisted.

The efficiency ratchet ensures the system improves over time. Each cycle must
achieve quality with fewer resources than the previous cycle. If it cannot,
the ratchet stalls and the system explores new architectures. If it can, the
bar rises and efficiency increases.

Every nano has a position on the perception-cognition-execution spectrum.
Red nanos perceive (feature extraction), Blue nanos think (pattern recognition),
and Yellow nanos act (output generation). Bridge nanos connect different regions,
enabling cross-domain knowledge transfer. Router nanos direct queries to the
most relevant specialists.

Language models work by predicting the next token given a sequence of previous
tokens. The transformer architecture uses self-attention to create dynamic
connections between all positions in the input. This allows the model to learn
that the word after "the" depends on what came before "the" and what comes
after other similar patterns in the training data.

The fundamental question is whether a population of small, independent models
can collectively achieve what a single large connected model achieves. Current
evidence says no for raw accuracy but yes for distribution and resilience.
The challenge is to find an architecture that preserves the distribution benefits
while closing the accuracy gap through proper inter-model communication.

Machine learning research has shown that depth matters. A network with two layers
can represent functions that require exponentially many neurons in a single layer.
This is why modern neural networks are deep, not just wide. The original nano
architecture is wide (many nanos) but shallow (one hidden layer per nano), which
fundamentally limits what patterns it can learn.

The mixture of experts approach offers a middle ground. Instead of all experts
processing all inputs, a router selects the most relevant experts per input.
This creates effective depth through specialization: different experts handle
different aspects of the input. When combined with proper routing and training
signals, this can approach the capability of dense models while maintaining
distributional efficiency.
"""

CORPUS = CORPUS * 20

chars = sorted(set(CORPUS))
vocab_size = len(chars)
char_to_idx = {c: i for i, c in enumerate(chars)}
idx_to_char = {i: c for i, c in enumerate(chars)}

def encode(text):
    return [char_to_idx.get(c, 0) for c in text]

SEQ_LEN = 64
encoded = torch.tensor(encode(CORPUS), dtype=torch.long)
BOUNDARY = int(0.8 * len(encoded))

def get_batch(batch_size, split='train'):
    """Get batch with FULL sequence targets (predict every position)."""
    data = encoded[:BOUNDARY] if split == 'train' else encoded[BOUNDARY:]
    ix = torch.randint(0, len(data) - SEQ_LEN - 1, (batch_size,))
    x = torch.stack([data[i:i+SEQ_LEN] for i in ix]).to(device)
    # Target: next token at EVERY position (not just last)
    y = torch.stack([data[i+1:i+SEQ_LEN+1] for i in ix]).to(device)
    return x, y

def get_batch_last_only(batch_size, split='train'):
    """Get batch with LAST token target only (for old architectures)."""
    data = encoded[:BOUNDARY] if split == 'train' else encoded[BOUNDARY:]
    ix = torch.randint(0, len(data) - SEQ_LEN - 1, (batch_size,))
    x = torch.stack([data[i:i+SEQ_LEN] for i in ix]).to(device)
    y = torch.stack([data[i+SEQ_LEN] for i in ix]).to(device)
    return x, y

print(f"Corpus: {len(CORPUS):,} chars, {vocab_size} unique, SEQ_LEN={SEQ_LEN}")
print()


# ═══════════════════════════════════════════════════════════════════════════
# REFERENCE: Dense Transformer (same as test_16)
# ═══════════════════════════════════════════════════════════════════════════

class CausalSelfAttention(nn.Module):
    def __init__(self, d_model, n_heads, max_len=SEQ_LEN):
        super().__init__()
        assert d_model % n_heads == 0
        self.n_heads = n_heads
        self.head_dim = d_model // n_heads
        self.qkv = nn.Linear(d_model, 3 * d_model)
        self.proj = nn.Linear(d_model, d_model)
        self.register_buffer("mask", torch.tril(torch.ones(max_len, max_len)).unsqueeze(0).unsqueeze(0))

    def forward(self, x):
        B, T, C = x.shape
        qkv = self.qkv(x).reshape(B, T, 3, self.n_heads, self.head_dim).permute(2, 0, 3, 1, 4)
        q, k, v = qkv[0], qkv[1], qkv[2]
        att = (q @ k.transpose(-2, -1)) * (self.head_dim ** -0.5)
        att = att.masked_fill(self.mask[:,:,:T,:T] == 0, float('-inf'))
        att = F.softmax(att, dim=-1)
        y = (att @ v).transpose(1, 2).contiguous().reshape(B, T, C)
        return self.proj(y)


class TransformerBlock(nn.Module):
    def __init__(self, d_model, n_heads, ff_dim):
        super().__init__()
        self.ln1 = nn.LayerNorm(d_model)
        self.attn = CausalSelfAttention(d_model, n_heads)
        self.ln2 = nn.LayerNorm(d_model)
        self.ff = nn.Sequential(
            nn.Linear(d_model, ff_dim),
            nn.GELU(),
            nn.Linear(ff_dim, d_model)
        )

    def forward(self, x):
        x = x + self.attn(self.ln1(x))
        x = x + self.ff(self.ln2(x))
        return x


class MiniTransformer(nn.Module):
    """Reference: 2-layer 4-head transformer, predicts at ALL positions."""
    def __init__(self, vocab, d_model=32, n_heads=4, n_layers=2, ff_dim=128):
        super().__init__()
        self.tok_emb = nn.Embedding(vocab, d_model)
        self.pos_emb = nn.Embedding(SEQ_LEN, d_model)
        self.blocks = nn.Sequential(*[TransformerBlock(d_model, n_heads, ff_dim) for _ in range(n_layers)])
        self.ln = nn.LayerNorm(d_model)
        self.head = nn.Linear(d_model, vocab)

    def forward(self, x):
        B, T = x.shape
        tok = self.tok_emb(x)
        pos = self.pos_emb(torch.arange(T, device=x.device))
        x = tok + pos
        x = self.blocks(x)
        x = self.ln(x)
        return self.head(x)  # (B, T, V) — logits at every position


# ═══════════════════════════════════════════════════════════════════════════
# NANOMOE COMPONENTS
# ═══════════════════════════════════════════════════════════════════════════

class NanoExpert(nn.Module):
    """A single nano expert = small FFN (the computation unit)."""
    def __init__(self, d_model, ff_dim):
        super().__init__()
        self.w1 = nn.Linear(d_model, ff_dim)
        self.w2 = nn.Linear(ff_dim, d_model)

    def forward(self, x):
        return self.w2(F.gelu(self.w1(x)))


class BatchedNanoExperts(nn.Module):
    """
    N nano experts batched into matrix operations (the core nano-sea trick).
    Each expert is a 2-layer FFN: d_model → ff_dim → d_model.
    Uses torch.bmm for parallel expert computation.
    """
    def __init__(self, n_experts, d_model, ff_dim):
        super().__init__()
        self.n_experts = n_experts
        self.d_model = d_model
        self.ff_dim = ff_dim
        # Batched weight matrices: (N, d_in, d_out)
        self.W1 = nn.Parameter(torch.randn(n_experts, d_model, ff_dim) * (2/d_model)**0.5)
        self.b1 = nn.Parameter(torch.zeros(n_experts, 1, ff_dim))
        self.W2 = nn.Parameter(torch.randn(n_experts, ff_dim, d_model) * (2/ff_dim)**0.5)
        self.b2 = nn.Parameter(torch.zeros(n_experts, 1, d_model))

    def forward(self, x):
        """
        x: (N, tokens, d_model) — each expert gets its assigned tokens
        returns: (N, tokens, d_model)
        """
        h = F.gelu(torch.bmm(x, self.W1) + self.b1)
        return torch.bmm(h, self.W2) + self.b2


class TopKRouter(nn.Module):
    """
    Learned router: for each token, scores all experts and selects top-k.
    Returns routing weights and expert assignments.
    """
    def __init__(self, d_model, n_experts, top_k=2):
        super().__init__()
        self.n_experts = n_experts
        self.top_k = min(top_k, n_experts)
        self.gate = nn.Linear(d_model, n_experts, bias=False)

    def forward(self, x):
        """
        x: (B, T, d_model)
        returns:
          weights: (B, T, top_k) — softmax weights for selected experts
          indices: (B, T, top_k) — which experts selected
          aux_loss: scalar — load balancing loss
        """
        B, T, D = x.shape
        logits = self.gate(x)  # (B, T, N_experts)

        topk_vals, topk_idx = logits.topk(self.top_k, dim=-1)  # (B, T, k)
        weights = F.softmax(topk_vals, dim=-1)  # (B, T, k)

        # Load balancing auxiliary loss (Switch Transformer style)
        # f_i = fraction of tokens routed to expert i
        # P_i = average gate probability for expert i
        # aux = N * sum(f_i * P_i)
        probs = F.softmax(logits, dim=-1)  # (B, T, N)
        # Use top-1 assignment for load tracking
        top1_idx = topk_idx[:, :, 0]  # (B, T)
        mask = F.one_hot(top1_idx, self.n_experts).float()  # (B, T, N)
        f = mask.mean(dim=(0, 1))  # (N,) fraction per expert
        P = probs.mean(dim=(0, 1))  # (N,) avg probability per expert
        aux_loss = self.n_experts * (f * P).sum()

        return weights, topk_idx, aux_loss


class MoELayer(nn.Module):
    """
    A full MoE layer: attention + nano expert pool + routing.

    For each token position:
    1. Apply causal self-attention (shared)
    2. Route each token to top-k expert nanos
    3. Each expert processes its assigned tokens
    4. Combine expert outputs weighted by router scores
    """
    def __init__(self, d_model, n_heads, n_experts, ff_dim, top_k=2):
        super().__init__()
        self.ln1 = nn.LayerNorm(d_model)
        self.attn = CausalSelfAttention(d_model, n_heads)
        self.ln2 = nn.LayerNorm(d_model)
        self.router = TopKRouter(d_model, n_experts, top_k)
        self.experts = BatchedNanoExperts(n_experts, d_model, ff_dim)
        self.n_experts = n_experts
        self.d_model = d_model

    def forward(self, x):
        """
        x: (B, T, d_model)
        returns: (B, T, d_model), aux_loss
        """
        # Self-attention (shared communication fabric)
        x = x + self.attn(self.ln1(x))

        # MoE FFN (nano expert pool)
        residual = x
        normed = self.ln2(x)

        B, T, D = normed.shape
        weights, indices, aux_loss = self.router(normed)  # (B,T,k), (B,T,k), scalar
        k = weights.shape[-1]

        # Dispatch tokens to experts
        # Strategy: for each expert, gather tokens assigned to it,
        # process them in batch, scatter results back.
        # For simplicity and GPU efficiency, we use the "full compute + mask" approach:
        # compute all experts on all tokens, then select.
        # This is wasteful at large N but correct and fast on GPU for small N.

        if self.n_experts <= 64:
            # Full compute approach (fast for small N)
            # Expand input for all experts: (N, B*T, D)
            flat = normed.reshape(B*T, D).unsqueeze(0).expand(self.n_experts, -1, -1)
            all_out = self.experts(flat)  # (N, B*T, D)
            all_out = all_out.permute(1, 0, 2).reshape(B, T, self.n_experts, D)  # (B, T, N, D)

            # Gather selected experts' outputs
            idx_exp = indices.unsqueeze(-1).expand(-1, -1, -1, D)  # (B, T, k, D)
            selected = all_out.gather(2, idx_exp)  # (B, T, k, D)

            # Weighted combination
            out = (selected * weights.unsqueeze(-1)).sum(dim=2)  # (B, T, D)
        else:
            # Sparse dispatch for large N (avoids computing unused experts)
            out = torch.zeros(B, T, D, device=x.device)
            flat_normed = normed.reshape(B*T, D)  # (B*T, D)
            flat_weights = weights.reshape(B*T, k)  # (B*T, k)
            flat_indices = indices.reshape(B*T, k)  # (B*T, k)

            for ki in range(k):
                expert_ids = flat_indices[:, ki]  # (B*T,)
                for eid in range(self.n_experts):
                    mask = (expert_ids == eid)
                    if not mask.any():
                        continue
                    tokens = flat_normed[mask].unsqueeze(0)  # (1, n_tokens, D)
                    # Use single expert from batched params
                    w1 = self.experts.W1[eid:eid+1]  # (1, D, ff)
                    b1 = self.experts.b1[eid:eid+1]
                    w2 = self.experts.W2[eid:eid+1]
                    b2 = self.experts.b2[eid:eid+1]
                    h = F.gelu(torch.bmm(tokens, w1) + b1)
                    result = torch.bmm(h, w2) + b2  # (1, n_tokens, D)
                    result = result.squeeze(0)  # (n_tokens, D)
                    w = flat_weights[mask, ki:ki+1]  # (n_tokens, 1)
                    out_flat = out.reshape(B*T, D)
                    out_flat[mask] += result * w
                    out = out_flat.reshape(B, T, D)

        x = residual + out
        return x, aux_loss


# ═══════════════════════════════════════════════════════════════════════════
# ARCHITECTURE A: Baseline Dense Transformer (reference target)
# ═══════════════════════════════════════════════════════════════════════════

# Uses MiniTransformer defined above — predicts at all positions


# ═══════════════════════════════════════════════════════════════════════════
# ARCHITECTURE B: NanoMoE-Lite (1 attention layer + N nano experts)
# ═══════════════════════════════════════════════════════════════════════════

class NanoMoELite(nn.Module):
    """
    Single MoE layer: 1 attention + N expert nanos.
    Simplest version that has cross-position communication.
    """
    def __init__(self, vocab, d_model=32, n_heads=4, n_experts=8, ff_dim=64, top_k=2):
        super().__init__()
        self.tok_emb = nn.Embedding(vocab, d_model)
        self.pos_emb = nn.Embedding(SEQ_LEN, d_model)
        self.moe = MoELayer(d_model, n_heads, n_experts, ff_dim, top_k)
        self.ln = nn.LayerNorm(d_model)
        self.head = nn.Linear(d_model, vocab)

    def forward(self, x):
        B, T = x.shape
        tok = self.tok_emb(x)
        pos = self.pos_emb(torch.arange(T, device=x.device))
        x = tok + pos
        x, aux = self.moe(x)
        x = self.ln(x)
        return self.head(x), aux  # (B, T, V), scalar


# ═══════════════════════════════════════════════════════════════════════════
# ARCHITECTURE C: NanoMoE-Full (2 attention layers + N nano experts each)
# ═══════════════════════════════════════════════════════════════════════════

class NanoMoEFull(nn.Module):
    """
    2 MoE layers, each with attention + N nano experts.
    This matches the transformer reference in depth.
    """
    def __init__(self, vocab, d_model=32, n_heads=4, n_experts=8, ff_dim=64, top_k=2):
        super().__init__()
        self.tok_emb = nn.Embedding(vocab, d_model)
        self.pos_emb = nn.Embedding(SEQ_LEN, d_model)
        self.moe1 = MoELayer(d_model, n_heads, n_experts, ff_dim, top_k)
        self.moe2 = MoELayer(d_model, n_heads, n_experts, ff_dim, top_k)
        self.ln = nn.LayerNorm(d_model)
        self.head = nn.Linear(d_model, vocab)

    def forward(self, x):
        B, T = x.shape
        tok = self.tok_emb(x)
        pos = self.pos_emb(torch.arange(T, device=x.device))
        x = tok + pos
        x, aux1 = self.moe1(x)
        x, aux2 = self.moe2(x)
        x = self.ln(x)
        return self.head(x), aux1 + aux2


# ═══════════════════════════════════════════════════════════════════════════
# ARCHITECTURE D: NanoMoE-Sparse (top-1 routing for extreme sparsity)
# ═══════════════════════════════════════════════════════════════════════════

class NanoMoESparse(nn.Module):
    """
    Same as Full but with top-1 routing.
    Each token goes to exactly ONE expert per layer.
    Maximizes sparsity → each expert processes fewer tokens.
    """
    def __init__(self, vocab, d_model=32, n_heads=4, n_experts=8, ff_dim=64):
        super().__init__()
        self.tok_emb = nn.Embedding(vocab, d_model)
        self.pos_emb = nn.Embedding(SEQ_LEN, d_model)
        self.moe1 = MoELayer(d_model, n_heads, n_experts, ff_dim, top_k=1)
        self.moe2 = MoELayer(d_model, n_heads, n_experts, ff_dim, top_k=1)
        self.ln = nn.LayerNorm(d_model)
        self.head = nn.Linear(d_model, vocab)

    def forward(self, x):
        B, T = x.shape
        tok = self.tok_emb(x)
        pos = self.pos_emb(torch.arange(T, device=x.device))
        x = tok + pos
        x, aux1 = self.moe1(x)
        x, aux2 = self.moe2(x)
        x = self.ln(x)
        return self.head(x), aux1 + aux2


# ═══════════════════════════════════════════════════════════════════════════
# ARCHITECTURE E: NanoMoE-Growing (dynamic expert addition during training)
# ═══════════════════════════════════════════════════════════════════════════

class GrowableMoELayer(nn.Module):
    """MoE layer that can grow its expert pool during training."""

    def __init__(self, d_model, n_heads, initial_experts, ff_dim, top_k=2):
        super().__init__()
        self.d_model = d_model
        self.ff_dim = ff_dim
        self.top_k = top_k
        self.ln1 = nn.LayerNorm(d_model)
        self.attn = CausalSelfAttention(d_model, n_heads)
        self.ln2 = nn.LayerNorm(d_model)

        # Start with initial experts
        self.n_experts = initial_experts
        self.experts = nn.ModuleList([NanoExpert(d_model, ff_dim) for _ in range(initial_experts)])
        self.gate = nn.Linear(d_model, initial_experts, bias=False)

    def add_experts(self, count):
        """Add new expert nanos to the pool."""
        old_n = self.n_experts
        new_n = old_n + count
        for _ in range(count):
            self.experts.append(NanoExpert(self.d_model, self.ff_dim).to(
                next(self.parameters()).device
            ))
        # Expand gate
        old_gate = self.gate
        self.gate = nn.Linear(self.d_model, new_n, bias=False).to(
            next(self.parameters()).device
        )
        with torch.no_grad():
            self.gate.weight[:old_n] = old_gate.weight
            # New expert gate weights initialized small (don't disrupt existing routing)
            self.gate.weight[old_n:] *= 0.01
        self.n_experts = new_n
        self.top_k = min(self.top_k, new_n)

    def forward(self, x):
        B, T, D = x.shape
        x = x + self.attn(self.ln1(x))
        residual = x
        normed = self.ln2(x)

        logits = self.gate(normed)  # (B, T, N)
        topk_vals, topk_idx = logits.topk(self.top_k, dim=-1)
        weights = F.softmax(topk_vals, dim=-1)  # (B, T, k)

        # Compute with individual experts (not batched — needed for dynamic pool)
        flat = normed.reshape(B*T, D)
        flat_idx = topk_idx.reshape(B*T, self.top_k)
        flat_w = weights.reshape(B*T, self.top_k)

        out = torch.zeros(B*T, D, device=x.device)
        for ki in range(self.top_k):
            for eid in range(self.n_experts):
                mask = (flat_idx[:, ki] == eid)
                if not mask.any():
                    continue
                tokens = flat[mask]  # (n, D)
                result = self.experts[eid](tokens)  # (n, D)
                out[mask] += result * flat_w[mask, ki:ki+1]

        # Aux loss
        probs = F.softmax(logits, dim=-1)
        top1_mask = F.one_hot(topk_idx[:,:,0], self.n_experts).float()
        f = top1_mask.mean(dim=(0,1))
        P = probs.mean(dim=(0,1))
        aux_loss = self.n_experts * (f * P).sum()

        x = residual + out.reshape(B, T, D)
        return x, aux_loss


class NanoMoEGrowing(nn.Module):
    """
    Starts with few experts, GROWS during training.
    This models the nano sea expansion: new nanos join the population.
    """
    def __init__(self, vocab, d_model=32, n_heads=4, initial_experts=4, ff_dim=64, top_k=2):
        super().__init__()
        self.tok_emb = nn.Embedding(vocab, d_model)
        self.pos_emb = nn.Embedding(SEQ_LEN, d_model)
        self.moe1 = GrowableMoELayer(d_model, n_heads, initial_experts, ff_dim, top_k)
        self.moe2 = GrowableMoELayer(d_model, n_heads, initial_experts, ff_dim, top_k)
        self.ln = nn.LayerNorm(d_model)
        self.head = nn.Linear(d_model, vocab)
        self._growth_schedule = []

    def set_growth_schedule(self, schedule):
        """schedule: list of (step, n_new_experts_per_layer)"""
        self._growth_schedule = list(schedule)

    def maybe_grow(self, step, optimizer):
        """Check if we should add experts at this step."""
        for sched_step, n_new in self._growth_schedule:
            if step == sched_step:
                self.moe1.add_experts(n_new)
                self.moe2.add_experts(n_new)
                # Update optimizer to include new parameters
                # (caller must reinitialize optimizer after growth)
                return True
        return False

    def forward(self, x):
        B, T = x.shape
        tok = self.tok_emb(x)
        pos = self.pos_emb(torch.arange(T, device=x.device))
        x = tok + pos
        x, aux1 = self.moe1(x)
        x, aux2 = self.moe2(x)
        x = self.ln(x)
        return self.head(x), aux1 + aux2


# ═══════════════════════════════════════════════════════════════════════════
# ARCHITECTURE F: NanoMoE-Distributed (simulated 2-node mesh)
# ═══════════════════════════════════════════════════════════════════════════

class NanoMoEDistributed(nn.Module):
    """
    Expert pool split across 2 "virtual nodes".
    Node 0 has experts 0..N/2-1, Node 1 has experts N/2..N-1.
    Router can assign tokens to experts on either node.
    Simulates mesh distribution with communication overhead.
    """
    def __init__(self, vocab, d_model=32, n_heads=4, n_experts=8, ff_dim=64, top_k=2):
        super().__init__()
        self.tok_emb = nn.Embedding(vocab, d_model)
        self.pos_emb = nn.Embedding(SEQ_LEN, d_model)
        self.moe1 = MoELayer(d_model, n_heads, n_experts, ff_dim, top_k)
        self.moe2 = MoELayer(d_model, n_heads, n_experts, ff_dim, top_k)
        self.ln = nn.LayerNorm(d_model)
        self.head = nn.Linear(d_model, vocab)
        self.n_experts = n_experts
        # Track which node each expert "lives on"
        self.node_assignment = [0] * (n_experts // 2) + [1] * (n_experts - n_experts // 2)

    def forward(self, x):
        B, T = x.shape
        tok = self.tok_emb(x)
        pos = self.pos_emb(torch.arange(T, device=x.device))
        x = tok + pos
        x, aux1 = self.moe1(x)
        x, aux2 = self.moe2(x)
        x = self.ln(x)
        return self.head(x), aux1 + aux2


# ═══════════════════════════════════════════════════════════════════════════
# OLD NANO ARCHITECTURE (for comparison — from test_16)
# ═══════════════════════════════════════════════════════════════════════════

class NanoOriginal(nn.Module):
    """The old architecture. Shared embed → static position pooling → per-nano MLP. Last token only."""

    def __init__(self, n, vocab, embed=32, hidden=64):
        super().__init__()
        self.n = n
        self.embedding = nn.Embedding(vocab, embed)
        self.pos_w = nn.Parameter(torch.randn(n, SEQ_LEN) * 0.01)
        self.W1 = nn.Parameter(torch.randn(n, embed, hidden) * (2/embed)**0.5)
        self.b1 = nn.Parameter(torch.zeros(n, 1, hidden))
        self.W2 = nn.Parameter(torch.randn(n, hidden, vocab) * (2/hidden)**0.5)
        self.b2 = nn.Parameter(torch.zeros(n, 1, vocab))

    def forward(self, x):
        emb = self.embedding(x)
        pw = F.softmax(self.pos_w, dim=-1).unsqueeze(1).unsqueeze(-1)
        pooled = (emb.unsqueeze(0) * pw).sum(dim=2)
        h = F.gelu(torch.bmm(pooled, self.W1) + self.b1)
        return torch.bmm(h, self.W2) + self.b2  # (N, B, V)


# ═══════════════════════════════════════════════════════════════════════════
# TRAINING AND EVALUATION
# ═══════════════════════════════════════════════════════════════════════════

def count_params(model):
    return sum(p.numel() for p in model.parameters())


def train_moe(model, name, steps=500, batch_size=128, lr=3e-3, aux_weight=0.01):
    """Train a MoE model (predicts at all positions)."""
    model.to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, steps)

    best_val = 0.0
    t0 = time.time()
    total_tokens = 0

    for step in range(1, steps + 1):
        model.train()
        x, y = get_batch(batch_size, 'train')
        logits, aux_loss = model(x)  # (B, T, V), scalar

        # Cross entropy at ALL positions (64× more signal than last-only)
        loss = F.cross_entropy(logits.reshape(-1, logits.shape[-1]), y.reshape(-1))
        loss = loss + aux_weight * aux_loss

        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        scheduler.step()

        total_tokens += batch_size * SEQ_LEN

        if step % 100 == 0:
            model.eval()
            with torch.no_grad():
                vx, vy = get_batch(256, 'val')
                vlogits, _ = model(vx)
                # Accuracy at last position (for comparison with old nanos)
                preds = vlogits[:, -1, :].argmax(dim=-1)
                acc = (preds == vy[:, -1]).float().mean().item()
                # Also track full-sequence accuracy
                full_preds = vlogits.argmax(dim=-1)
                full_acc = (full_preds == vy).float().mean().item()
                best_val = max(best_val, acc)
                elapsed = time.time() - t0
                tps = total_tokens / elapsed
                print(f"  [{name}] Step {step:4d} | last_acc={acc*100:.2f}% full_acc={full_acc*100:.2f}% | best={best_val*100:.2f}% | {tps:.0f} tok/s | {elapsed:.1f}s")

    mem = torch.cuda.max_memory_allocated() / 1e6 if device == "cuda" else 0
    torch.cuda.reset_peak_memory_stats() if device == "cuda" else None

    return {
        "name": name,
        "params": count_params(model),
        "best_val_acc": best_val,
        "time_s": time.time() - t0,
        "mem_mb": mem,
    }


def train_growing_moe(model, name, steps=500, batch_size=128, lr=3e-3, aux_weight=0.01):
    """Train a growing MoE model with expert addition schedule."""
    model.to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)

    best_val = 0.0
    t0 = time.time()
    total_tokens = 0

    for step in range(1, steps + 1):
        # Check for growth events
        grew = model.maybe_grow(step, optimizer)
        if grew:
            # Reinitialize optimizer to include new parameters
            optimizer = torch.optim.AdamW(model.parameters(), lr=lr * 0.5)  # Lower LR after growth
            n = model.moe1.n_experts
            print(f"  [{name}] Step {step}: GREW to {n} experts per layer")

        model.train()
        x, y = get_batch(batch_size, 'train')
        logits, aux_loss = model(x)
        loss = F.cross_entropy(logits.reshape(-1, logits.shape[-1]), y.reshape(-1))
        loss = loss + aux_weight * aux_loss

        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()

        total_tokens += batch_size * SEQ_LEN

        if step % 100 == 0:
            model.eval()
            with torch.no_grad():
                vx, vy = get_batch(256, 'val')
                vlogits, _ = model(vx)
                preds = vlogits[:, -1, :].argmax(dim=-1)
                acc = (preds == vy[:, -1]).float().mean().item()
                full_preds = vlogits.argmax(dim=-1)
                full_acc = (full_preds == vy).float().mean().item()
                best_val = max(best_val, acc)
                elapsed = time.time() - t0
                tps = total_tokens / elapsed
                n = model.moe1.n_experts
                print(f"  [{name}] Step {step:4d} | {n} experts | last_acc={acc*100:.2f}% full_acc={full_acc*100:.2f}% | best={best_val*100:.2f}% | {elapsed:.1f}s")

    mem = torch.cuda.max_memory_allocated() / 1e6 if device == "cuda" else 0
    torch.cuda.reset_peak_memory_stats() if device == "cuda" else None

    return {
        "name": name,
        "params": count_params(model),
        "best_val_acc": best_val,
        "time_s": time.time() - t0,
        "mem_mb": mem,
    }


def train_transformer(model, name, steps=500, batch_size=128, lr=3e-3):
    """Train a dense transformer (predicts at all positions, no aux loss)."""
    model.to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, steps)

    best_val = 0.0
    t0 = time.time()
    total_tokens = 0

    for step in range(1, steps + 1):
        model.train()
        x, y = get_batch(batch_size, 'train')
        logits = model(x)
        loss = F.cross_entropy(logits.reshape(-1, logits.shape[-1]), y.reshape(-1))

        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        scheduler.step()

        total_tokens += batch_size * SEQ_LEN

        if step % 100 == 0:
            model.eval()
            with torch.no_grad():
                vx, vy = get_batch(256, 'val')
                vlogits = model(vx)
                preds = vlogits[:, -1, :].argmax(dim=-1)
                acc = (preds == vy[:, -1]).float().mean().item()
                full_preds = vlogits.argmax(dim=-1)
                full_acc = (full_preds == vy).float().mean().item()
                best_val = max(best_val, acc)
                elapsed = time.time() - t0
                tps = total_tokens / elapsed
                print(f"  [{name}] Step {step:4d} | last_acc={acc*100:.2f}% full_acc={full_acc*100:.2f}% | best={best_val*100:.2f}% | {tps:.0f} tok/s | {elapsed:.1f}s")

    mem = torch.cuda.max_memory_allocated() / 1e6 if device == "cuda" else 0
    torch.cuda.reset_peak_memory_stats() if device == "cuda" else None

    return {
        "name": name,
        "params": count_params(model),
        "best_val_acc": best_val,
        "time_s": time.time() - t0,
        "mem_mb": mem,
    }


def train_old_nano(model, name, steps=500, batch_size=128, lr=3e-3):
    """Train old-style nano (last token only, best-of-N eval)."""
    model.to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, steps)

    best_val = 0.0
    t0 = time.time()
    total_tokens = 0

    for step in range(1, steps + 1):
        model.train()
        x, y = get_batch_last_only(batch_size, 'train')
        all_logits = model(x)  # (N, B, V)
        losses = torch.stack([F.cross_entropy(all_logits[i], y) for i in range(all_logits.shape[0])])
        loss = losses.mean()

        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        scheduler.step()

        total_tokens += batch_size * SEQ_LEN

        if step % 100 == 0:
            model.eval()
            with torch.no_grad():
                vx, vy = get_batch_last_only(256, 'val')
                all_vlogits = model(vx)
                # Best-of-N: pick the nano with lowest val loss
                per_nano_loss = torch.stack([F.cross_entropy(all_vlogits[i], vy) for i in range(all_vlogits.shape[0])])
                best_nano = per_nano_loss.argmin()
                preds = all_vlogits[best_nano].argmax(dim=-1)
                acc = (preds == vy).float().mean().item()
                best_val = max(best_val, acc)
                elapsed = time.time() - t0
                tps = total_tokens / elapsed
                print(f"  [{name}] Step {step:4d} | last_acc={acc*100:.2f}% | best={best_val*100:.2f}% | {tps:.0f} tok/s | {elapsed:.1f}s")

    mem = torch.cuda.max_memory_allocated() / 1e6 if device == "cuda" else 0
    torch.cuda.reset_peak_memory_stats() if device == "cuda" else None

    return {
        "name": name,
        "params": count_params(model),
        "best_val_acc": best_val,
        "time_s": time.time() - t0,
        "mem_mb": mem,
    }


# ═══════════════════════════════════════════════════════════════════════════
# MAIN EXPERIMENT
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    all_results = {}
    STEPS = 1000  # More training to let MoE routing converge
    N_EXPERTS = 8

    print("=" * 70)
    print("PART 1: Can NanoMoE MATCH the transformer?")
    print("=" * 70)
    print(f"Settings: {STEPS} steps, batch=128, d_model=32, {N_EXPERTS} experts")
    print()

    # --- OLD NANO (baseline from test_16) ---
    print("--- OLD. Original Nano (50 nanos, last-token only) ---")
    old_nano = NanoOriginal(50, vocab_size, embed=32, hidden=64)
    print(f"  Params: {count_params(old_nano):,}")
    r_old = train_old_nano(old_nano, "OLD. Nano", steps=STEPS)
    del old_nano; torch.cuda.empty_cache()
    print()

    # --- A. Reference Transformer ---
    print("--- A. Transformer (2-layer 4-head, all-position prediction) ---")
    transformer = MiniTransformer(vocab_size, d_model=32, n_heads=4, n_layers=2, ff_dim=128)
    print(f"  Params: {count_params(transformer):,}")
    r_trans = train_transformer(transformer, "A. Transformer", steps=STEPS)
    del transformer; torch.cuda.empty_cache()
    print()

    # --- B. NanoMoE-Lite (1 layer) ---
    print(f"--- B. NanoMoE-Lite (1 MoE layer, {N_EXPERTS} experts, top-2) ---")
    moe_lite = NanoMoELite(vocab_size, d_model=32, n_heads=4, n_experts=N_EXPERTS, ff_dim=64, top_k=2)
    print(f"  Params: {count_params(moe_lite):,}")
    r_lite = train_moe(moe_lite, "B. NanoMoE-Lite", steps=STEPS)
    del moe_lite; torch.cuda.empty_cache()
    print()

    # --- C. NanoMoE-Full (2 layers) ---
    print(f"--- C. NanoMoE-Full (2 MoE layers, {N_EXPERTS} experts each, top-2) ---")
    moe_full = NanoMoEFull(vocab_size, d_model=32, n_heads=4, n_experts=N_EXPERTS, ff_dim=64, top_k=2)
    print(f"  Params: {count_params(moe_full):,}")
    r_full = train_moe(moe_full, "C. NanoMoE-Full", steps=STEPS)
    del moe_full; torch.cuda.empty_cache()
    print()

    # --- D. NanoMoE-Sparse (top-1) ---
    print(f"--- D. NanoMoE-Sparse (2 MoE layers, {N_EXPERTS} experts, top-1) ---")
    moe_sparse = NanoMoESparse(vocab_size, d_model=32, n_heads=4, n_experts=N_EXPERTS, ff_dim=64)
    print(f"  Params: {count_params(moe_sparse):,}")
    r_sparse = train_moe(moe_sparse, "D. NanoMoE-Sparse", steps=STEPS)
    del moe_sparse; torch.cuda.empty_cache()
    print()

    # --- E. NanoMoE-Growing ---
    print(f"--- E. NanoMoE-Growing (starts with 4, grows to {N_EXPERTS}+) ---")
    moe_grow = NanoMoEGrowing(vocab_size, d_model=32, n_heads=4, initial_experts=4, ff_dim=64, top_k=2)
    # Growth schedule: add 2 experts at steps 200, 400
    moe_grow.set_growth_schedule([(200, 2), (400, 2)])
    print(f"  Initial params: {count_params(moe_grow):,}")
    r_grow = train_growing_moe(moe_grow, "E. NanoMoE-Growing", steps=STEPS)
    del moe_grow; torch.cuda.empty_cache()
    print()

    # --- F. NanoMoE-Distributed ---
    print(f"--- F. NanoMoE-Distributed (2-node simulation, {N_EXPERTS} experts) ---")
    moe_dist = NanoMoEDistributed(vocab_size, d_model=32, n_heads=4, n_experts=N_EXPERTS, ff_dim=64, top_k=2)
    print(f"  Params: {count_params(moe_dist):,}")
    r_dist = train_moe(moe_dist, "F. NanoMoE-Dist", steps=STEPS)
    del moe_dist; torch.cuda.empty_cache()
    print()

    # Collect part 1 results
    part1 = [r_old, r_trans, r_lite, r_full, r_sparse, r_grow, r_dist]
    all_results["part1"] = part1

    print("=" * 70)
    print("PART 1 RESULTS — CAN NANOMOE MATCH THE TRANSFORMER?")
    print("=" * 70)
    print(f"{'Name':<30s} {'Params':>10s} {'Best Val%':>10s} {'Time':>8s}")
    print("-" * 65)
    for r in sorted(part1, key=lambda x: -x["best_val_acc"]):
        print(f"{r['name']:<30s} {r['params']:>10,d} {r['best_val_acc']*100:>9.2f}% {r['time_s']:>7.1f}s")
    trans_acc = r_trans["best_val_acc"]
    best_moe = max([r for r in part1 if "Nano" in r["name"] or "MoE" in r["name"]], key=lambda x: x["best_val_acc"])
    print()
    print(f"  Transformer: {trans_acc*100:.2f}%")
    print(f"  Best NanoMoE: {best_moe['name']} at {best_moe['best_val_acc']*100:.2f}%")
    gap = trans_acc - best_moe["best_val_acc"]
    if gap > 0:
        print(f"  Gap: {gap*100:.2f}% (NanoMoE still behind)")
    else:
        print(f"  ★ NanoMoE BEAT the transformer by {-gap*100:.2f}%! ★")
    print()

    # ═══════════════════════════════════════════════════════════════════════
    # PART 2: SCALING — More experts = better?
    # ═══════════════════════════════════════════════════════════════════════

    print("=" * 70)
    print("PART 2: SCALING — Accuracy vs Number of Nano Experts")
    print("=" * 70)
    print("Using NanoMoE-Full (2 layers), varying expert count")
    print()

    scaling_results = []
    for n_exp in [2, 4, 8, 16, 32]:
        print(f"--- {n_exp} experts ---")
        try:
            top_k = min(2, n_exp)
            model = NanoMoEFull(vocab_size, d_model=32, n_heads=4, n_experts=n_exp, ff_dim=64, top_k=top_k)
            print(f"  Params: {count_params(model):,}")
            r = train_moe(model, f"N={n_exp}", steps=STEPS)
            r["n_experts"] = n_exp
            scaling_results.append(r)
            del model; torch.cuda.empty_cache()
        except Exception as e:
            print(f"  FAILED: {e}")
            scaling_results.append({"n_experts": n_exp, "best_val_acc": 0, "error": str(e)})
        print()

    all_results["part2_scaling"] = scaling_results

    print("=" * 70)
    print("SCALING RESULTS")
    print("=" * 70)
    print(f"{'N experts':>10s} {'Params':>10s} {'Best Val%':>10s}")
    print("-" * 35)
    for r in scaling_results:
        if "error" not in r:
            print(f"{r['n_experts']:>10d} {r['params']:>10,d} {r['best_val_acc']*100:>9.2f}%")
        else:
            print(f"{r['n_experts']:>10d} {'---':>10s} FAILED")
    print()

    # ═══════════════════════════════════════════════════════════════════════
    # PART 3: SCALING LAW FIT FOR NANOMOE
    # ═══════════════════════════════════════════════════════════════════════

    print("=" * 70)
    print("PART 3: SCALING LAW FIT")
    print("=" * 70)

    valid_scaling = [(r["n_experts"], r["best_val_acc"]) for r in scaling_results if r["best_val_acc"] > 0]

    if len(valid_scaling) >= 3:
        from scipy.optimize import curve_fit

        ns = np.array([x[0] for x in valid_scaling], dtype=float)
        accs = np.array([x[1] for x in valid_scaling], dtype=float)

        def power_law(n, a_max, c, gamma):
            return a_max - c / np.power(n, gamma)

        try:
            popt, pcov = curve_fit(power_law, ns, accs, p0=[0.5, 0.3, 0.5],
                                   bounds=([0.01, 0.001, 0.01], [1.0, 10.0, 5.0]),
                                   maxfev=10000)
            a_max, c, gamma = popt

            # R² calculation
            predicted = power_law(ns, *popt)
            ss_res = np.sum((accs - predicted)**2)
            ss_tot = np.sum((accs - np.mean(accs))**2)
            r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0

            print(f"\nFitted: accuracy = {a_max:.4f} - {c:.4f} / N^{gamma:.4f}")
            print(f"R² = {r2:.4f}")
            print()

            print(f"{'N_experts':>12s} {'Predicted Acc':>15s} {'vs Transformer':>16s}")
            print("-" * 45)
            for n in [2, 4, 8, 16, 32, 64, 128, 256, 512, 1000]:
                pred = power_law(n, *popt)
                diff = pred - trans_acc
                print(f"{n:>12,d} {pred*100:>14.2f}% {diff*100:>+15.2f}%")

            # Critical N: when does NanoMoE match transformer?
            if a_max >= trans_acc:
                n_critical = (c / (a_max - trans_acc))**(1/gamma)
                print(f"\n  ★ NanoMoE predicted to MATCH transformer at N = {n_critical:,.0f} experts")
            else:
                print(f"\n  ⚠ A_max ({a_max:.4f}) {'>' if a_max > trans_acc else '<'} transformer ({trans_acc:.4f})")
                if a_max < trans_acc:
                    print(f"    NanoMoE ceiling is below transformer — need larger d_model or more layers")
                else:
                    print(f"    NanoMoE CAN surpass transformer!")

            all_results["part3_fit"] = {
                "A_max": float(a_max), "C": float(c), "gamma": float(gamma), "r2": float(r2)
            }
        except Exception as e:
            print(f"Curve fitting failed: {e}")
            all_results["part3_fit"] = {"error": str(e)}
    else:
        print("Not enough data points for curve fitting")
        all_results["part3_fit"] = {"error": "insufficient data"}

    # ═══════════════════════════════════════════════════════════════════════
    # PART 4: EFFICIENCY COMPARISON (accuracy per FLOP)
    # ═══════════════════════════════════════════════════════════════════════

    print()
    print("=" * 70)
    print("PART 4: EFFICIENCY — Accuracy per Parameter")
    print("=" * 70)

    print(f"{'Name':<30s} {'Params':>10s} {'Acc%':>8s} {'Acc/Param':>12s} {'Acc/Time':>10s}")
    print("-" * 75)
    for r in sorted(part1, key=lambda x: -x["best_val_acc"]):
        acc = r["best_val_acc"]
        params = r["params"]
        time_s = r["time_s"]
        app = acc / params * 1e6  # acc per million params
        apt = acc / time_s  # acc per second of training
        print(f"{r['name']:<30s} {params:>10,d} {acc*100:>7.2f}% {app:>11.2f} {apt:>9.4f}")

    # ═══════════════════════════════════════════════════════════════════════
    # FINAL SUMMARY
    # ═══════════════════════════════════════════════════════════════════════

    print()
    print("=" * 70)
    print("TEST 17 SUMMARY — THE REDESIGN VERDICT")
    print("=" * 70)

    print()
    print("ARCHITECTURE RANKINGS (by last-token accuracy):")
    for i, r in enumerate(sorted(part1, key=lambda x: -x["best_val_acc"]), 1):
        marker = "★" if r["best_val_acc"] >= trans_acc else " "
        diff = r["best_val_acc"] - trans_acc
        print(f"  {marker} {i}. {r['name']:<28s} {r['best_val_acc']*100:.2f}% ({diff*100:+.2f}% vs transformer)")

    print()
    old_acc = r_old["best_val_acc"]
    best_moe_acc = best_moe["best_val_acc"]
    print(f"KEY METRICS:")
    print(f"  Old Nano accuracy (test_16 architecture): {old_acc*100:.2f}%")
    print(f"  Transformer accuracy: {trans_acc*100:.2f}%")
    print(f"  Best NanoMoE accuracy: {best_moe_acc*100:.2f}%")
    print(f"  Improvement over old nano: {(best_moe_acc - old_acc)*100:+.2f}%")
    print(f"  Gap to transformer: {(trans_acc - best_moe_acc)*100:+.2f}%")

    if best_moe_acc >= trans_acc:
        print()
        print("  ★★★ NANOMOE MATCHES OR BEATS THE TRANSFORMER! ★★★")
        print("  The nano concept is VIABLE when nanos are experts in an MoE architecture.")
    elif best_moe_acc >= old_acc * 1.5:
        print()
        print("  ▲ NanoMoE SIGNIFICANTLY improves over old nanos.")
        print("  The architecture pivot is working. Scale or depth may close the remaining gap.")
    else:
        print()
        print("  ⚠ NanoMoE is better but gap remains. Need more training, scale, or design changes.")

    # Save results
    all_results["transformer_acc"] = trans_acc
    with open("test_17_results.json", "w") as f:
        json.dump(all_results, f, indent=2, default=str)
    print(f"\nResults saved to test_17_results.json")
