#!/usr/bin/env python3
"""
TEST 16 — THE RECKONING: WHY NANOS LOSE & HOW TO FIX THEM
==========================================================

Session 3 audit found nanos get 26.56% vs transformer's 38.28%.
Deep analysis identified 5 FATAL FLAWS:

  F1. 32-dim information bottleneck (position pooling destroys 98.4% of info)
  F2. No cross-position interaction (static weights, no content-dependent routing)
  F3. No compositional depth (parallel nanos = wide shallow net, not deep net)
  F4. Gradient dilution (50 nanos fight over shared embedding)
  F5. 1.6% parameter utilization (only best nano used at eval)

This experiment tests 7 ARCHITECTURES, from current (broken) to fully fixed,
to isolate which fixes matter and derive empirical scaling laws.

ARCHITECTURES:
  A. Original NanoPopulation (baseline — 26% accuracy)
  B. Wide Bottleneck: 128-dim pooling (fix F1)
  C. Content-Dependent Routing: nanos attend to input (fix F1+F2)
  D. Staged Pipeline: nano layers feed forward (fix F3)
  E. Mixture-of-Experts: learned router, top-k nanos per token (fix F4+F5)
  F. Message Passing: nanos communicate iteratively (fix F2+F3)
  G. Combined: best of all fixes (the redesigned nano)

Then: scaling sweep from N=10 to N=1000 nanos for architectures that work,
fitting power laws to predict performance at N=1M and N=1B.
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

# ═══════════════════════════════════════════════════════════════════════════
# SHARED DATA SETUP — Same as test_13 for fair comparison
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

# Repeat to get more data
CORPUS = CORPUS * 20

# Build vocabulary
chars = sorted(set(CORPUS))
vocab_size = len(chars)
char_to_idx = {c: i for i, c in enumerate(chars)}
idx_to_char = {i: c for i, c in enumerate(chars)}

def encode(text):
    return [char_to_idx.get(c, 0) for c in text]

def decode(indices):
    return ''.join(idx_to_char.get(i, '?') for i in indices)

SEQ_LEN = 64
encoded = torch.tensor(encode(CORPUS), dtype=torch.long)
BOUNDARY = int(0.8 * len(encoded))

def get_batch(batch_size, split='train'):
    data = encoded[:BOUNDARY] if split == 'train' else encoded[BOUNDARY:]
    ix = torch.randint(0, len(data) - SEQ_LEN - 1, (batch_size,))
    x = torch.stack([data[i:i+SEQ_LEN] for i in ix]).to(device)
    y = torch.stack([data[i+SEQ_LEN] for i in ix]).to(device)
    return x, y

print(f"Corpus: {len(CORPUS):,} chars, {vocab_size} unique, SEQ_LEN={SEQ_LEN}")
print()

# ═══════════════════════════════════════════════════════════════════════════
# ARCHITECTURE A: Original NanoPopulation (BASELINE — the broken one)
# ═══════════════════════════════════════════════════════════════════════════

class NanoOriginal(nn.Module):
    """The test_13 architecture. Shared embed → static position pooling → per-nano MLP."""

    def __init__(self, n, vocab, embed=32, hidden=64):
        super().__init__()
        self.n = n
        self.embed_dim = embed
        self.embedding = nn.Embedding(vocab, embed)
        self.pos_w = nn.Parameter(torch.randn(n, SEQ_LEN) * 0.01)
        self.W1 = nn.Parameter(torch.randn(n, embed, hidden) * (2/embed)**0.5)
        self.b1 = nn.Parameter(torch.zeros(n, 1, hidden))
        self.W2 = nn.Parameter(torch.randn(n, hidden, vocab) * (2/hidden)**0.5)
        self.b2 = nn.Parameter(torch.zeros(n, 1, vocab))

    def forward(self, x):  # x: (B, T)
        emb = self.embedding(x)  # (B, T, E)
        pw = F.softmax(self.pos_w, dim=-1).unsqueeze(1).unsqueeze(-1)  # (N, 1, T, 1)
        pooled = (emb.unsqueeze(0) * pw).sum(dim=2)  # (N, B, E)
        h = F.gelu(torch.bmm(pooled, self.W1) + self.b1)
        return torch.bmm(h, self.W2) + self.b2  # (N, B, V)


# ═══════════════════════════════════════════════════════════════════════════
# ARCHITECTURE B: Wide Bottleneck — 128-dim pooling (fix F1)
# ═══════════════════════════════════════════════════════════════════════════

class NanoWideBN(nn.Module):
    """Same as A but with 128-dim embedding. Tests if bottleneck width matters."""

    def __init__(self, n, vocab, embed=128, hidden=64):
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
        return torch.bmm(h, self.W2) + self.b2


# ═══════════════════════════════════════════════════════════════════════════
# ARCHITECTURE C: Content-Dependent Routing (fix F1+F2)
# ═══════════════════════════════════════════════════════════════════════════

class NanoContentRouted(nn.Module):
    """
    Each nano computes content-dependent attention over positions.
    Instead of static position weights, each nano has a QUERY vector
    that attends to the input embeddings (which act as keys/values).

    This is NOT a full transformer — it's a single attention head per nano,
    no multi-head, no causal mask. But it gives content-dependent routing.
    """

    def __init__(self, n, vocab, embed=32, hidden=64):
        super().__init__()
        self.n = n
        self.embed_dim = embed
        self.embedding = nn.Embedding(vocab, embed)
        # Per-nano query projection: embed_dim → embed_dim
        self.Wq = nn.Parameter(torch.randn(n, embed, embed) * (2/embed)**0.5)
        # Per-nano key projection (applied to shared embedding)
        self.Wk = nn.Parameter(torch.randn(n, embed, embed) * (2/embed)**0.5)
        self.W1 = nn.Parameter(torch.randn(n, embed, hidden) * (2/embed)**0.5)
        self.b1 = nn.Parameter(torch.zeros(n, 1, hidden))
        self.W2 = nn.Parameter(torch.randn(n, hidden, vocab) * (2/hidden)**0.5)
        self.b2 = nn.Parameter(torch.zeros(n, 1, vocab))
        # A learnable query per nano (what pattern am I looking for?)
        self.query = nn.Parameter(torch.randn(n, 1, embed) * 0.1)

    def forward(self, x):  # x: (B, T)
        B = x.shape[0]
        emb = self.embedding(x)  # (B, T, E)
        emb_n = emb.unsqueeze(0).expand(self.n, -1, -1, -1)  # (N, B, T, E)

        # Compute keys: project each position's embedding per nano
        # Reshape for bmm: (N*B, T, E) @ (N*B, E, E) — but this is expensive
        # Instead: broadcast. key_proj: (N, E, E), emb: (N, B, T, E)
        keys = torch.einsum('nbte,ned->nbtd', emb_n, self.Wk)  # (N, B, T, E)

        # Query: (N, 1, E) → project → (N, 1, E)
        queries = torch.bmm(self.query, self.Wq)  # (N, 1, E)
        queries_exp = queries.expand(-1, B, -1)  # (N, B, E)

        # Attention scores: (N, B, E) dot (N, B, T, E) → (N, B, T)
        attn = torch.einsum('nbe,nbte->nbt', queries_exp, keys)  # (N, B, T)
        attn = attn / (self.embed_dim ** 0.5)
        attn = F.softmax(attn, dim=-1)  # (N, B, T)

        # Weighted sum of values (values = embeddings)
        pooled = torch.einsum('nbt,nbte->nbe', attn, emb_n)  # (N, B, E)

        h = F.gelu(torch.bmm(pooled, self.W1) + self.b1)
        return torch.bmm(h, self.W2) + self.b2


# ═══════════════════════════════════════════════════════════════════════════
# ARCHITECTURE D: Staged Pipeline (fix F3 — compositional depth)
# ═══════════════════════════════════════════════════════════════════════════

class NanoPipeline(nn.Module):
    """
    Nanos arranged in 2 STAGES (like layers):
      Stage 1: N/2 nanos process the raw input → produce intermediate features
      Stage 2: N/2 nanos take Stage 1 output → produce final predictions

    This gives compositional depth=2 while keeping per-stage parallelism.
    Each stage still uses position-weighted pooling, but stage 2 operates
    on enriched representations from stage 1.
    """

    def __init__(self, n, vocab, embed=32, hidden=64):
        super().__init__()
        assert n % 2 == 0
        self.n = n
        n1 = n // 2
        n2 = n // 2
        self.n1 = n1
        self.n2 = n2
        self.embed_dim = embed
        self.embedding = nn.Embedding(vocab, embed)

        # Stage 1: raw input → intermediate
        self.pos_w1 = nn.Parameter(torch.randn(n1, SEQ_LEN) * 0.01)
        self.W1a = nn.Parameter(torch.randn(n1, embed, hidden) * (2/embed)**0.5)
        self.b1a = nn.Parameter(torch.zeros(n1, 1, hidden))
        # Stage 1 output: (n1, B, hidden) → we need to turn this back into a
        # sequence-like thing for stage 2. Use: spread each nano's output
        # across a "virtual position" dimension.

        # Stage 2: takes concatenated stage 1 outputs
        # Input dim = n1 * hidden (each stage-1 nano contributes hidden dims)
        # But this is huge. Instead: each stage-2 nano attends to stage-1 outputs
        # using a learned attention pattern.
        self.attn_2 = nn.Parameter(torch.randn(n2, n1) * 0.01)  # Which stage-1 nanos to attend to
        self.W2a = nn.Parameter(torch.randn(n2, hidden, hidden) * (2/hidden)**0.5)
        self.b2a = nn.Parameter(torch.zeros(n2, 1, hidden))
        self.W2b = nn.Parameter(torch.randn(n2, hidden, vocab) * (2/hidden)**0.5)
        self.b2b = nn.Parameter(torch.zeros(n2, 1, vocab))

    def forward(self, x):
        B = x.shape[0]
        emb = self.embedding(x)

        # Stage 1
        pw1 = F.softmax(self.pos_w1, dim=-1).unsqueeze(1).unsqueeze(-1)
        pooled1 = (emb.unsqueeze(0) * pw1).sum(dim=2)  # (n1, B, E)
        h1 = F.gelu(torch.bmm(pooled1, self.W1a) + self.b1a)  # (n1, B, hidden)

        # Stage 2: each stage-2 nano attends to stage-1 outputs
        attn = F.softmax(self.attn_2, dim=-1)  # (n2, n1)
        # Weighted combination of stage-1 outputs: (n2, n1) @ (n1, B, hidden) → (n2, B, hidden)
        s2_input = torch.einsum('sn,nbh->sbh', attn, h1)  # (n2, B, hidden)

        h2 = F.gelu(torch.bmm(s2_input, self.W2a) + self.b2a)
        return torch.bmm(h2, self.W2b) + self.b2b  # (n2, B, V)


# ═══════════════════════════════════════════════════════════════════════════
# ARCHITECTURE E: Mixture-of-Experts with learned router (fix F4+F5)
# ═══════════════════════════════════════════════════════════════════════════

class NanoMoE(nn.Module):
    """
    Nanos as experts with a LEARNED ROUTER.
    - Router: small net that looks at the input and selects top-k nanos
    - Only top-k nanos contribute to the output (sparse activation)
    - Output is weighted sum of selected nano outputs (not best-of-N)
    - Load balancing loss prevents all traffic going to one nano

    This is the architecture closest to Mixtral/Switch Transformer.
    """

    def __init__(self, n, vocab, embed=32, hidden=64, top_k=4):
        super().__init__()
        self.n = n
        self.top_k = min(top_k, n)
        self.embedding = nn.Embedding(vocab, embed)

        # Router: maps mean-pooled input to expert scores
        self.router = nn.Sequential(
            nn.Linear(embed, hidden),
            nn.GELU(),
            nn.Linear(hidden, n)
        )

        # Expert nanos — same as original
        self.pos_w = nn.Parameter(torch.randn(n, SEQ_LEN) * 0.01)
        self.W1 = nn.Parameter(torch.randn(n, embed, hidden) * (2/embed)**0.5)
        self.b1 = nn.Parameter(torch.zeros(n, 1, hidden))
        self.W2 = nn.Parameter(torch.randn(n, hidden, vocab) * (2/hidden)**0.5)
        self.b2 = nn.Parameter(torch.zeros(n, 1, vocab))

    def forward(self, x, return_aux=False):
        B = x.shape[0]
        emb = self.embedding(x)  # (B, T, E)

        # Router input: mean-pooled embedding
        router_input = emb.mean(dim=1)  # (B, E)
        gate_logits = self.router(router_input)  # (B, N)

        # Select top-k experts
        topk_vals, topk_idx = gate_logits.topk(self.top_k, dim=-1)  # (B, k)
        topk_weights = F.softmax(topk_vals, dim=-1)  # (B, k) — normalized

        # Compute ALL nano outputs (in batched mode, then select)
        pw = F.softmax(self.pos_w, dim=-1).unsqueeze(1).unsqueeze(-1)
        pooled = (emb.unsqueeze(0) * pw).sum(dim=2)  # (N, B, E)
        h = F.gelu(torch.bmm(pooled, self.W1) + self.b1)
        all_logits = torch.bmm(h, self.W2) + self.b2  # (N, B, V)
        all_logits = all_logits.permute(1, 0, 2)  # (B, N, V)

        # Weighted sum of top-k expert outputs
        # Gather top-k experts' logits
        topk_idx_exp = topk_idx.unsqueeze(-1).expand(-1, -1, all_logits.shape[-1])
        selected = all_logits.gather(1, topk_idx_exp)  # (B, k, V)
        output = (selected * topk_weights.unsqueeze(-1)).sum(dim=1)  # (B, V)

        if return_aux:
            # Load balancing loss (from Switch Transformer)
            # Fraction of tokens routed to each expert
            mask = F.one_hot(topk_idx[:, 0], self.n).float()  # (B, N)
            f = mask.mean(dim=0)  # fraction per expert
            # Average gate probability per expert
            P = F.softmax(gate_logits, dim=-1).mean(dim=0)  # (B, N).mean → (N,)
            aux_loss = (f * P).sum() * self.n  # Minimize concentration
            return output, aux_loss

        return output.unsqueeze(0)  # (1, B, V) for consistency


# ═══════════════════════════════════════════════════════════════════════════
# ARCHITECTURE F: Message-Passing Nanos (fix F2+F3)
# ═══════════════════════════════════════════════════════════════════════════

class NanoMessagePassing(nn.Module):
    """
    Nanos communicate via fixed-size messages for R rounds.

    Round 0: Each nano processes raw input (same as original)
    Round 1-R: Each nano reads messages from k neighbors, combines with own state,
               processes through its MLP, sends new message.

    This creates effective depth = R while keeping nanos independent-ish.
    Messages propagate information across nanos without a global backprop graph.
    (Actually we DO backprop through messages — this is basically a GNN.)
    """

    def __init__(self, n, vocab, embed=32, hidden=64, msg_dim=16, rounds=2, k_neighbors=4):
        super().__init__()
        self.n = n
        self.rounds = rounds
        self.k = min(k_neighbors, n - 1)
        self.msg_dim = msg_dim
        self.embedding = nn.Embedding(vocab, embed)
        self.pos_w = nn.Parameter(torch.randn(n, SEQ_LEN) * 0.01)

        # Initial processing
        self.W_init = nn.Parameter(torch.randn(n, embed, hidden) * (2/embed)**0.5)
        self.b_init = nn.Parameter(torch.zeros(n, 1, hidden))

        # Message passing layers (per round)
        self.msg_encode = nn.ParameterList()
        self.msg_decode = nn.ParameterList()
        self.state_update = nn.ParameterList()

        for r in range(rounds):
            # Encode state → message
            self.msg_encode.append(nn.Parameter(torch.randn(n, hidden, msg_dim) * (2/hidden)**0.5))
            # Decode incoming messages → update
            self.msg_decode.append(nn.Parameter(
                torch.randn(n, msg_dim * self.k, hidden) * (2/(msg_dim*self.k))**0.5))
            # State update: combine old state + decoded messages
            self.state_update.append(nn.Parameter(
                torch.randn(n, hidden * 2, hidden) * (2/(hidden*2))**0.5))

        # Adjacency: which nanos are neighbors (learned)
        self.adj = nn.Parameter(torch.randn(n, n) * 0.01)

        # Output
        self.W_out = nn.Parameter(torch.randn(n, hidden, vocab) * (2/hidden)**0.5)
        self.b_out = nn.Parameter(torch.zeros(n, 1, vocab))

    def forward(self, x):
        B = x.shape[0]
        emb = self.embedding(x)
        pw = F.softmax(self.pos_w, dim=-1).unsqueeze(1).unsqueeze(-1)
        pooled = (emb.unsqueeze(0) * pw).sum(dim=2)  # (N, B, E)

        # Initial state
        state = F.gelu(torch.bmm(pooled, self.W_init) + self.b_init)  # (N, B, H)

        for r in range(self.rounds):
            # Each nano encodes its state into a message
            messages = torch.bmm(state, self.msg_encode[r])  # (N, B, msg_dim)

            # Each nano reads top-k neighbors' messages
            adj_weights = F.softmax(self.adj, dim=-1)  # (N, N)
            topk_vals, topk_idx = adj_weights.topk(self.k, dim=-1)  # (N, k)
            topk_weights = F.softmax(topk_vals, dim=-1)  # (N, k)

            # Gather messages from neighbors: for each nano, gather k messages
            # messages: (N, B, msg_dim) → need (N, k, B, msg_dim)
            gathered = messages[topk_idx]  # (N, k, B, msg_dim)
            # Weight by adjacency
            gathered = gathered * topk_weights.unsqueeze(-1).unsqueeze(-1)  # (N, k, B, msg_dim)
            # Flatten: (N, B, k*msg_dim)
            incoming = gathered.permute(0, 2, 1, 3).reshape(self.n, B, -1)

            # Decode incoming
            decoded = torch.bmm(incoming, self.msg_decode[r])  # (N, B, H)

            # Update state: concat old + decoded
            combined = torch.cat([state, decoded], dim=-1)  # (N, B, 2H)
            state = F.gelu(torch.bmm(combined, self.state_update[r]))  # (N, B, H)

        # Output
        logits = torch.bmm(state, self.W_out) + self.b_out  # (N, B, V)
        return logits


# ═══════════════════════════════════════════════════════════════════════════
# ARCHITECTURE G: COMBINED — The Redesigned Nano
# ═══════════════════════════════════════════════════════════════════════════

class NanoCombined(nn.Module):
    """
    The full fix: Content-routing + staged pipeline + MoE selection.

    Stage 1: N/2 nanos with content-dependent attention (fix F1+F2)
    Stage 2: N/2 nanos attending to stage-1 outputs (fix F3)
    Router: learned, selects top-k final nanos per input (fix F4+F5)
    """

    def __init__(self, n, vocab, embed=32, hidden=64, top_k=4):
        super().__init__()
        assert n % 2 == 0
        self.n = n
        n1 = n // 2
        n2 = n // 2
        self.n1 = n1
        self.n2 = n2
        self.top_k = min(top_k, n2)
        self.embed_dim = embed
        self.embedding = nn.Embedding(vocab, embed)

        # Stage 1: content-dependent routing nanos
        self.Wq1 = nn.Parameter(torch.randn(n1, embed, embed) * (2/embed)**0.5)
        self.Wk1 = nn.Parameter(torch.randn(n1, embed, embed) * (2/embed)**0.5)
        self.query1 = nn.Parameter(torch.randn(n1, 1, embed) * 0.1)
        self.W1a = nn.Parameter(torch.randn(n1, embed, hidden) * (2/embed)**0.5)
        self.b1a = nn.Parameter(torch.zeros(n1, 1, hidden))

        # Stage 2: nanos that attend to stage 1 + learned routing
        self.attn_2 = nn.Parameter(torch.randn(n2, n1) * 0.01)
        self.W2a = nn.Parameter(torch.randn(n2, hidden, hidden) * (2/hidden)**0.5)
        self.b2a = nn.Parameter(torch.zeros(n2, 1, hidden))
        self.W2b = nn.Parameter(torch.randn(n2, hidden, vocab) * (2/hidden)**0.5)
        self.b2b = nn.Parameter(torch.zeros(n2, 1, vocab))

        # MoE Router for stage 2 output
        self.router = nn.Sequential(
            nn.Linear(embed, hidden // 2),
            nn.GELU(),
            nn.Linear(hidden // 2, n2)
        )

    def forward(self, x, return_aux=False):
        B = x.shape[0]
        emb = self.embedding(x)  # (B, T, E)
        emb_n = emb.unsqueeze(0).expand(self.n1, -1, -1, -1)  # (n1, B, T, E)

        # Stage 1: content-dependent attention
        keys = torch.einsum('nbte,ned->nbtd', emb_n, self.Wk1)  # (n1, B, T, E)
        queries = torch.bmm(self.query1, self.Wq1)  # (n1, 1, E)
        queries_exp = queries.expand(-1, B, -1)  # (n1, B, E)

        attn = torch.einsum('nbe,nbte->nbt', queries_exp, keys)
        attn = F.softmax(attn / (self.embed_dim ** 0.5), dim=-1)
        pooled1 = torch.einsum('nbt,nbte->nbe', attn, emb_n)  # (n1, B, E)
        h1 = F.gelu(torch.bmm(pooled1, self.W1a) + self.b1a)  # (n1, B, H)

        # Stage 2
        attn2 = F.softmax(self.attn_2, dim=-1)
        s2_input = torch.einsum('sn,nbh->sbh', attn2, h1)  # (n2, B, H)
        h2 = F.gelu(torch.bmm(s2_input, self.W2a) + self.b2a)
        all_logits = torch.bmm(h2, self.W2b) + self.b2b  # (n2, B, V)
        all_logits = all_logits.permute(1, 0, 2)  # (B, n2, V)

        # Router
        router_input = emb.mean(dim=1)
        gate_logits = self.router(router_input)  # (B, n2)
        topk_vals, topk_idx = gate_logits.topk(self.top_k, dim=-1)
        topk_weights = F.softmax(topk_vals, dim=-1)

        topk_idx_exp = topk_idx.unsqueeze(-1).expand(-1, -1, all_logits.shape[-1])
        selected = all_logits.gather(1, topk_idx_exp)
        output = (selected * topk_weights.unsqueeze(-1)).sum(dim=1)

        if return_aux:
            mask = F.one_hot(topk_idx[:, 0], self.n2).float()
            f = mask.mean(dim=0)
            P = F.softmax(gate_logits, dim=-1).mean(dim=0)
            aux_loss = (f * P).sum() * self.n2
            return output, aux_loss

        return output.unsqueeze(0)


# ═══════════════════════════════════════════════════════════════════════════
# REFERENCE: MiniTransformer (the target to beat)
# ═══════════════════════════════════════════════════════════════════════════

class MiniTransformer(nn.Module):
    def __init__(self, vocab, embed=64, n_heads=4, n_layers=2):
        super().__init__()
        self.embedding = nn.Embedding(vocab, embed)
        self.pos_embedding = nn.Embedding(SEQ_LEN, embed)
        layer = nn.TransformerEncoderLayer(
            d_model=embed, nhead=n_heads, dim_feedforward=embed*4,
            batch_first=True, dropout=0.1
        )
        self.transformer = nn.TransformerEncoder(layer, num_layers=n_layers)
        self.output = nn.Linear(embed, vocab)

    def forward(self, x):
        B, T = x.shape
        pos = torch.arange(T, device=x.device).unsqueeze(0).expand(B, T)
        emb = self.embedding(x) + self.pos_embedding(pos)
        mask = nn.Transformer.generate_square_subsequent_mask(T, device=x.device)
        h = self.transformer(emb, mask=mask, is_causal=True)
        return h[:, -1:]  # Last position only for fair comparison


# ═══════════════════════════════════════════════════════════════════════════
# TRAINING FRAMEWORK
# ═══════════════════════════════════════════════════════════════════════════

def count_params(model):
    return sum(p.numel() for p in model.parameters())

def train_model(name, model, steps=500, batch_size=128, is_moe=False, is_transformer=False):
    """Train any model architecture and return metrics."""
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    model.to(device)
    model.train()

    best_val = 0
    t0 = time.perf_counter()
    params = count_params(model)

    for step in range(1, steps + 1):
        x, y = get_batch(batch_size, 'train')
        optimizer.zero_grad()

        if is_moe:
            output, aux_loss = model(x, return_aux=True)
            loss = F.cross_entropy(output, y) + 0.01 * aux_loss
        elif is_transformer:
            logits = model(x)  # (B, 1, V)
            loss = F.cross_entropy(logits.squeeze(1), y)
        else:
            logits = model(x)  # (N, B, V) or variations
            if logits.dim() == 3 and logits.shape[0] > 1:
                # Multi-nano: compute mean loss across nanos
                n = logits.shape[0]
                losses = torch.stack([F.cross_entropy(logits[i], y) for i in range(n)])
                loss = losses.mean()
            else:
                if logits.dim() == 3:
                    logits = logits.squeeze(0)
                loss = F.cross_entropy(logits, y)

        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()

        if step % 100 == 0 or step == steps:
            model.eval()
            with torch.no_grad():
                vx, vy = get_batch(256, 'val')
                if is_moe:
                    vout = model(vx)
                    if isinstance(vout, tuple):
                        vout = vout[0]
                    vpreds = vout.argmax(dim=-1)
                elif is_transformer:
                    vlogits = model(vx).squeeze(1)
                    vpreds = vlogits.argmax(dim=-1)
                else:
                    vlogits = model(vx)
                    if vlogits.dim() == 3 and vlogits.shape[0] > 1:
                        # Use best nano
                        best_acc = 0
                        for i in range(vlogits.shape[0]):
                            a = (vlogits[i].argmax(-1) == vy).float().mean().item()
                            if a > best_acc:
                                best_acc = a
                                vpreds = vlogits[i].argmax(-1)
                    else:
                        if vlogits.dim() == 3:
                            vlogits = vlogits.squeeze(0)
                        vpreds = vlogits.argmax(dim=-1)

                vacc = (vpreds == vy).float().mean().item()
                best_val = max(best_val, vacc)
            model.train()

            elapsed = time.perf_counter() - t0
            throughput = step * batch_size / elapsed
            print(f"  [{name}] Step {step:>4} | val_acc={vacc:.2%} | best={best_val:.2%} | "
                  f"{throughput:.0f} s/s | {elapsed:.1f}s")

    elapsed = time.perf_counter() - t0
    mem_mb = params * 4 / (1024**2)

    return {
        "name": name,
        "params": params,
        "best_val_acc": best_val,
        "final_val_acc": vacc,
        "throughput": step * batch_size / elapsed,
        "time_s": elapsed,
        "mem_mb": mem_mb,
    }


# ═══════════════════════════════════════════════════════════════════════════
# PART 1: ARCHITECTURE COMPARISON (N=50)
# ═══════════════════════════════════════════════════════════════════════════

print("=" * 70)
print("PART 1: ARCHITECTURE COMPARISON — Which fixes matter?")
print("=" * 70)
print("All models: N=50 nanos, 500 training steps, batch=128\n")

N = 50
STEPS = 500

architectures = [
    ("A. Original",       lambda: NanoOriginal(N, vocab_size),                        False, False),
    ("B. Wide-BN",        lambda: NanoWideBN(N, vocab_size),                          False, False),
    ("C. ContentRouted",  lambda: NanoContentRouted(N, vocab_size),                   False, False),
    ("D. Pipeline",       lambda: NanoPipeline(N, vocab_size),                        False, False),
    ("E. MoE",            lambda: NanoMoE(N, vocab_size, top_k=4),                    True,  False),
    ("F. MsgPassing",     lambda: NanoMessagePassing(N, vocab_size, rounds=2, k_neighbors=4), False, False),
    ("G. Combined",       lambda: NanoCombined(N, vocab_size, top_k=4),               True,  False),
    ("REF. Transformer",  lambda: MiniTransformer(vocab_size),                        False, True),
]

results_part1 = []
for name, model_fn, is_moe, is_tf in architectures:
    print(f"\n--- {name} ---")
    torch.cuda.empty_cache() if device == "cuda" else None
    torch.manual_seed(42)  # Same init seed for fairness
    model = model_fn()
    params = count_params(model)
    print(f"  Params: {params:,}")
    r = train_model(name, model, steps=STEPS, is_moe=is_moe, is_transformer=is_tf)
    results_part1.append(r)
    del model
    torch.cuda.empty_cache() if device == "cuda" else None

# Print comparison table
print(f"\n{'='*70}")
print(f"ARCHITECTURE COMPARISON RESULTS")
print(f"{'='*70}")
print(f"{'Name':<20} {'Params':>10} {'Best Val%':>10} {'Throughput':>12} {'Time':>8} {'Fix':>12}")
print("-" * 75)
for r in results_part1:
    fix = ""
    if "Original" in r["name"]: fix = "none"
    elif "Wide" in r["name"]: fix = "F1"
    elif "Content" in r["name"]: fix = "F1+F2"
    elif "Pipeline" in r["name"]: fix = "F3"
    elif "MoE" in r["name"]: fix = "F4+F5"
    elif "Msg" in r["name"]: fix = "F2+F3"
    elif "Combined" in r["name"]: fix = "ALL"
    elif "Trans" in r["name"]: fix = "reference"
    print(f"{r['name']:<20} {r['params']:>10,} {r['best_val_acc']:>9.2%} {r['throughput']:>10,.0f} s/s {r['time_s']:>7.1f}s {fix:>12}")

transformer_acc = [r for r in results_part1 if "Trans" in r["name"]][0]["best_val_acc"]
print(f"\n  Transformer target: {transformer_acc:.2%}")
best_nano = max([r for r in results_part1 if "Trans" not in r["name"]], key=lambda r: r["best_val_acc"])
print(f"  Best nano arch: {best_nano['name']} at {best_nano['best_val_acc']:.2%}")
gap = transformer_acc - best_nano["best_val_acc"]
print(f"  Accuracy gap: {gap:.2%} ({'CLOSED!' if gap <= 0 else 'remaining'})")


# ═══════════════════════════════════════════════════════════════════════════
# PART 2: SCALING LAW MEASUREMENT
# ═══════════════════════════════════════════════════════════════════════════

print(f"\n{'='*70}")
print(f"PART 2: SCALING LAWS — How does nano count affect accuracy?")
print(f"{'='*70}")

# Find the best architecture from Part 1
best_arch_name = best_nano["name"]
print(f"Using best architecture: {best_arch_name}")

# Map name to constructor
def make_best_arch(n):
    name = best_arch_name
    if "Combined" in name:
        n = n if n % 2 == 0 else n + 1
        return NanoCombined(n, vocab_size, top_k=max(2, n // 10))
    elif "Content" in name:
        return NanoContentRouted(n, vocab_size)
    elif "Pipeline" in name:
        n = n if n % 2 == 0 else n + 1
        return NanoPipeline(n, vocab_size)
    elif "MoE" in name:
        return NanoMoE(n, vocab_size, top_k=max(2, n // 10))
    elif "Msg" in name:
        return NanoMessagePassing(n, vocab_size, rounds=2, k_neighbors=min(4, n-1))
    elif "Wide" in name:
        return NanoWideBN(n, vocab_size)
    else:
        return NanoOriginal(n, vocab_size)

is_moe = "MoE" in best_arch_name or "Combined" in best_arch_name

scaling_sizes = [10, 20, 50, 100, 200, 500]
scaling_results = []

for n in scaling_sizes:
    print(f"\n--- N={n} nanos ---")
    torch.cuda.empty_cache() if device == "cuda" else None
    torch.manual_seed(42)
    try:
        model = make_best_arch(n)
        params = count_params(model)
        print(f"  Params: {params:,}")
        r = train_model(f"N={n}", model, steps=STEPS, is_moe=is_moe)
        r["n_nanos"] = n
        scaling_results.append(r)
        del model
        torch.cuda.empty_cache() if device == "cuda" else None
    except Exception as e:
        print(f"  FAILED: {e}")
        scaling_results.append({"n_nanos": n, "best_val_acc": 0, "error": str(e)})


# ═══════════════════════════════════════════════════════════════════════════
# PART 3: SCALING LAW FITTING — Predict performance at N=1M, N=1B
# ═══════════════════════════════════════════════════════════════════════════

print(f"\n{'='*70}")
print(f"PART 3: SCALING LAW EXTRAPOLATION")
print(f"{'='*70}")

# Fit: accuracy = A_max - C / N^gamma  (power law with ceiling)
# Or equivalently: A_max - accuracy = C * N^(-gamma)
# log(A_max - accuracy) = log(C) - gamma * log(N)

valid_points = [(r["n_nanos"], r["best_val_acc"]) for r in scaling_results if r.get("best_val_acc", 0) > 0]

if len(valid_points) >= 3:
    ns = np.array([p[0] for p in valid_points], dtype=float)
    accs = np.array([p[1] for p in valid_points], dtype=float)

    # Try multiple A_max values and find best fit
    best_fit = None
    best_r2 = -999

    for a_max_candidate in np.arange(max(accs) + 0.01, 1.001, 0.01):
        gaps = a_max_candidate - accs
        if np.any(gaps <= 0):
            continue
        log_gaps = np.log(gaps)
        log_ns = np.log(ns)

        # Linear regression: log_gaps = log_C - gamma * log_ns
        A = np.vstack([np.ones_like(log_ns), -log_ns]).T
        coeffs, residuals, _, _ = np.linalg.lstsq(A, log_gaps, rcond=None)
        log_C, gamma = coeffs[0], coeffs[1]

        # R² score
        pred = log_C - gamma * log_ns
        ss_res = np.sum((log_gaps - pred) ** 2)
        ss_tot = np.sum((log_gaps - log_gaps.mean()) ** 2) + 1e-12
        r2 = 1 - ss_res / ss_tot

        if r2 > best_r2:
            best_r2 = r2
            best_fit = {
                "A_max": a_max_candidate,
                "C": math.exp(log_C),
                "gamma": gamma,
                "r2": r2,
            }

    if best_fit:
        print(f"\nFitted scaling law: accuracy = {best_fit['A_max']:.4f} - {best_fit['C']:.4f} / N^{best_fit['gamma']:.4f}")
        print(f"R² = {best_fit['r2']:.4f}")

        # Extrapolate
        print(f"\n{'N_nanos':>12} {'Predicted Acc':>14} {'vs Transformer':>16}")
        print("-" * 44)
        for n_ext in [10, 50, 100, 500, 1_000, 10_000, 100_000, 1_000_000, 1_000_000_000]:
            pred_acc = best_fit["A_max"] - best_fit["C"] / (n_ext ** best_fit["gamma"])
            pred_acc = min(pred_acc, best_fit["A_max"])
            gap_str = f"{pred_acc - transformer_acc:+.2%}"
            marker = " ← BEATS TRANSFORMER" if pred_acc > transformer_acc else ""
            print(f"{n_ext:>12,} {pred_acc:>13.2%} {gap_str:>16}{marker}")

        # Critical N: at what N do nanos match transformer?
        if best_fit["A_max"] > transformer_acc:
            # Solve: A_max - C/N^gamma = transformer_acc
            # C/N^gamma = A_max - transformer_acc
            # N^gamma = C / (A_max - transformer_acc)
            # N = (C / (A_max - transformer_acc))^(1/gamma)
            gap_to_close = best_fit["A_max"] - transformer_acc
            if gap_to_close > 0 and best_fit["gamma"] > 0:
                N_critical = (best_fit["C"] / gap_to_close) ** (1 / best_fit["gamma"])
                print(f"\n  ★ CRITICAL N: {N_critical:,.0f} nanos needed to match transformer")
                if N_critical < 1e12:
                    print(f"    This is ACHIEVABLE in a mesh of {N_critical/1000:,.0f}K nanos")
                else:
                    print(f"    This is {N_critical:.2e} — effectively IMPOSSIBLE")
        else:
            print(f"\n  ⚠ A_max ({best_fit['A_max']:.4f}) < transformer ({transformer_acc:.4f})")
            print(f"    Nanos NEVER catch up with this architecture, regardless of N")
            print(f"    The bottleneck is ARCHITECTURAL, not scale")

    else:
        print("  Could not fit scaling law — not enough data points")
else:
    print("  Not enough valid data points for scaling law fit")


# ═══════════════════════════════════════════════════════════════════════════
# PART 4: HONEST DIMENSIONAL ANALYSIS — What MUST change?
# ═══════════════════════════════════════════════════════════════════════════

print(f"\n{'='*70}")
print(f"PART 4: DIMENSIONAL ANALYSIS — Information Theory Bounds")
print(f"{'='*70}")

# Information bottleneck analysis
embed_dim = 32
n_positions = SEQ_LEN
total_input_info = n_positions * embed_dim  # 64 * 32 = 2048 dimensions
pooled_info = embed_dim  # 32 dimensions after pooling
info_preserved = pooled_info / total_input_info

print(f"Input information dimensions: {total_input_info}")
print(f"After position pooling: {pooled_info}")
print(f"Information preserved: {info_preserved:.1%}")
print(f"Information DESTROYED: {1-info_preserved:.1%}")

# Compute attention's information capacity
n_heads = 4
attn_interactions = n_heads * n_positions * n_positions  # 4 * 64 * 64
print(f"\nTransformer attention interactions: {attn_interactions:,} (per layer)")
print(f"Nano cross-position interactions: 0")
print(f"Information routing ratio: ∞ (transformer has infinite advantage in routing)")

# Effective parameter utilization
nano_params_per = 32*64 + 64 + 64*vocab_size + vocab_size + SEQ_LEN
total_nano_params = N * nano_params_per + vocab_size * embed_dim
single_nano_effective = nano_params_per + vocab_size * embed_dim
utilization = single_nano_effective / total_nano_params

print(f"\nParameter utilization:")
print(f"  Total nano params: {total_nano_params:,}")
print(f"  Effective at eval (1 nano + embed): {single_nano_effective:,}")
print(f"  Utilization: {utilization:.1%}")
print(f"  Transformer utilization: 100%")


# ═══════════════════════════════════════════════════════════════════════════
# FINAL SUMMARY
# ═══════════════════════════════════════════════════════════════════════════

print(f"\n{'='*70}")
print(f"TEST 16 SUMMARY — THE RECKONING")
print(f"{'='*70}")

if results_part1:
    print(f"\nARCHITECTURE RANKINGS:")
    sorted_r = sorted(results_part1, key=lambda r: r["best_val_acc"], reverse=True)
    for i, r in enumerate(sorted_r, 1):
        delta = r["best_val_acc"] - transformer_acc
        marker = "★" if delta >= 0 else " "
        print(f"  {marker} {i}. {r['name']:<20} {r['best_val_acc']:.2%} ({delta:+.2%} vs transformer)")

print(f"\nKEY FINDINGS:")
print(f"  1. Which fix matters most? → Compare A vs B vs C vs D vs E vs F")
print(f"  2. Can any nano arch beat the transformer? → Check if any ★ above")
print(f"  3. What scales and what doesn't? → See Part 2 scaling curves")
print(f"  4. At what N do nanos catch up? → See Part 3 extrapolation")

# Save everything
all_results = {
    "part1_architectures": results_part1,
    "part2_scaling": scaling_results,
    "part3_fit": best_fit if 'best_fit' in dir() and best_fit else None,
    "transformer_acc": transformer_acc,
}
with open("test_16_results.json", "w") as f:
    json.dump(all_results, f, indent=2, default=str)
print(f"\nResults saved to test_16_results.json")
