#!/usr/bin/env python3
"""
TEST 22 — CHROMATIC ROUTER: RBY Aitchison Simplex Routing (NOVEL)
==================================================================

ARCHITECTURE COMPLETION Phase 2 — Novel routing mechanism.

test_21 proved: 3 layers optimal (PPL 7.13 vs 1L PPL 7.55, 5.6% better).

Now we test the FIRST genuinely novel component: Chromatic Routing.
Instead of standard linear routing (dot product in ℝ^d), we:
  1. Project tokens to the RBY simplex S² = {(r,b,y) : r+b+y=1}
  2. Give each expert a POSITION on the simplex (learned parameter)
  3. Route by Aitchison distance (proper metric for compositional data)

WHY THIS MATTERS:
  - Aitchison metric respects compositionality (R+B+Y=1 constraint)
  - Expert positions have INTERPRETABLE meaning (R=perception, B=cognition, Y=execution)
  - Fewer parameters than linear router (3×d + 3×E + E vs d×E)
  - After training, you can VISUALIZE the expert map as a color triangle

WHAT WE TEST:
  1. Standard Router (linear, proven baseline from test_21)
  2. Chromatic Router (Aitchison simplex routing)
  3. Chromatic + Spread Loss (geometric capacity balancing — solves Gap M3)
  All with 3 layers, 8 experts, same parameter budget.

HARDWARE: Dual GTX 1660 SUPER, sequential alternating.

DEPENDS ON: test_21 (optimal layer count = 3)
"""

import os, sys, time, math, json, gc
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from collections import defaultdict

# ═══════════════════════════════════════════════════════════════════════════
# HARDWARE
# ═══════════════════════════════════════════════════════════════════════════

N_GPUS = torch.cuda.device_count() if torch.cuda.is_available() else 0
DEVICES = [f"cuda:{i}" for i in range(N_GPUS)] if N_GPUS > 0 else ["cpu"]

print(f"{'='*70}")
print(f"TEST 22 — CHROMATIC ROUTER: RBY Aitchison Simplex Routing")
print(f"{'='*70}")
for i in range(N_GPUS):
    props = torch.cuda.get_device_properties(i)
    print(f"  GPU {i}: {props.name} ({props.total_memory // 1024**2} MB)")

# ═══════════════════════════════════════════════════════════════════════════
# CONFIG — Optimal from test_21: 3 layers
# ═══════════════════════════════════════════════════════════════════════════

SEQ_LEN = 128
BATCH_SIZE = 64
TRAIN_STEPS = 3000
EVAL_BATCHES = 30
LR = 1e-3
DROPOUT = 0.1
AUX_WEIGHT = 0.01
SPREAD_WEIGHT = 0.005  # Weight for chromatic spread loss (Gap M3)
BASE_SEED = 42
D_MODEL = 64
N_HEADS = 4
N_LAYERS = 3       # From test_21
N_EXPERTS = 8
FF_DIM = 85         # From test_21 (param-matched for 3L)
TOP_K = 2

# ═══════════════════════════════════════════════════════════════════════════
# DATA
# ═══════════════════════════════════════════════════════════════════════════

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)


def download_data():
    import urllib.request
    cache = os.path.join(DATA_DIR, "shakespeare.txt")
    if os.path.exists(cache):
        with open(cache, "r", encoding="utf-8") as f:
            text = f.read()
        if len(text) > 500000:
            return text
    url = "https://raw.githubusercontent.com/karpathy/char-rnn/master/data/tinyshakespeare/input.txt"
    print("Downloading Shakespeare...")
    try:
        text = urllib.request.urlopen(url, timeout=30).read().decode('utf-8')
    except Exception:
        import random
        words = "the and to of a in that is was he for it with as his on be at by".split()
        text = ""
        for _ in range(60000):
            text += " ".join(random.choices(words, k=random.randint(5, 20))) + ".\n"
        text = text[:1_100_000]
    with open(cache, "w", encoding="utf-8") as f:
        f.write(text)
    return text


def prepare_data(text):
    chars = sorted(set(text))
    stoi = {c: i for i, c in enumerate(chars)}
    data = torch.tensor([stoi[c] for c in text], dtype=torch.long)
    n = len(data)
    return {
        "train": data[:int(0.9*n)],
        "val": data[int(0.9*n):int(0.95*n)],
        "test": data[int(0.95*n):],
        "vocab_size": len(chars),
        "stoi": stoi,
        "itos": {i: c for c, i in stoi.items()},
    }


def get_batch(data_split, batch_size, device_str):
    ix = torch.randint(len(data_split) - SEQ_LEN - 1, (batch_size,))
    x = torch.stack([data_split[i:i+SEQ_LEN] for i in ix]).to(device_str)
    y = torch.stack([data_split[i+1:i+SEQ_LEN+1] for i in ix]).to(device_str)
    return x, y


# ═══════════════════════════════════════════════════════════════════════════
# SHARED COMPONENTS (proven from test_21)
# ═══════════════════════════════════════════════════════════════════════════

class CausalSelfAttention(nn.Module):
    def __init__(self, d_model, n_heads, dropout=0.1):
        super().__init__()
        self.n_heads = n_heads
        self.head_dim = d_model // n_heads
        self.qkv = nn.Linear(d_model, 3 * d_model)
        self.proj = nn.Linear(d_model, d_model)
        self.attn_drop = nn.Dropout(dropout)
        self.proj_drop = nn.Dropout(dropout)
        self.register_buffer("mask",
            torch.tril(torch.ones(SEQ_LEN, SEQ_LEN)).unsqueeze(0).unsqueeze(0))

    def forward(self, x):
        B, T, C = x.shape
        qkv = self.qkv(x).reshape(B, T, 3, self.n_heads, self.head_dim).permute(2, 0, 3, 1, 4)
        q, k, v = qkv[0], qkv[1], qkv[2]
        att = (q @ k.transpose(-2, -1)) * (self.head_dim ** -0.5)
        att = att.masked_fill(self.mask[:, :, :T, :T] == 0, float('-inf'))
        att = self.attn_drop(F.softmax(att, dim=-1))
        y = (att @ v).transpose(1, 2).contiguous().reshape(B, T, C)
        return self.proj_drop(self.proj(y))


class BatchedNanoExperts(nn.Module):
    def __init__(self, n_experts, d_model, ff_dim, dropout=0.1):
        super().__init__()
        self.n_experts = n_experts
        self.d_model = d_model
        self.ff_dim = ff_dim
        self.W1 = nn.Parameter(torch.randn(n_experts, d_model, ff_dim) * (2/d_model)**0.5)
        self.b1 = nn.Parameter(torch.zeros(n_experts, 1, ff_dim))
        self.W2 = nn.Parameter(torch.randn(n_experts, ff_dim, d_model) * (2/ff_dim)**0.5)
        self.b2 = nn.Parameter(torch.zeros(n_experts, 1, d_model))
        self.dropout = nn.Dropout(dropout)

    def forward(self, x):
        h = F.gelu(torch.bmm(x, self.W1) + self.b1)
        h = self.dropout(h)
        return torch.bmm(h, self.W2) + self.b2


# ═══════════════════════════════════════════════════════════════════════════
# STANDARD ROUTER (baseline from test_20/21)
# ═══════════════════════════════════════════════════════════════════════════

class StandardRouter(nn.Module):
    def __init__(self, d_model, n_experts, top_k=2, noise_std=0.1):
        super().__init__()
        self.n_experts = n_experts
        self.top_k = min(top_k, n_experts)
        self.gate = nn.Linear(d_model, n_experts, bias=False)
        self.noise_std = noise_std

    def forward(self, x):
        B, T, D = x.shape
        logits = self.gate(x)
        if self.training and self.noise_std > 0:
            logits = logits + torch.randn_like(logits) * self.noise_std
        topk_vals, topk_idx = logits.topk(self.top_k, dim=-1)
        weights = F.softmax(topk_vals, dim=-1)
        # Standard load-balancing aux loss
        probs = F.softmax(logits, dim=-1)
        top1_idx = topk_idx[:, :, 0]
        mask = F.one_hot(top1_idx, self.n_experts).float()
        f = mask.mean(dim=(0, 1))
        P = probs.mean(dim=(0, 1))
        aux_loss = self.n_experts * (f * P).sum()
        return weights, topk_idx, aux_loss, None  # None = no positions


# ═══════════════════════════════════════════════════════════════════════════
# CHROMATIC ROUTER — NOVEL: Aitchison simplex routing
# ═══════════════════════════════════════════════════════════════════════════

class ChromaticRouter(nn.Module):
    """
    Novel MoE router based on the RBY simplex with Aitchison distance.
    
    V2: Multi-head chromatic routing — multiple chromatic "channels" each 
    projecting to their own RBY simplex. Scores summed across channels.
    This increases expressiveness (3K degrees of freedom) while keeping 
    the compositional constraint per channel.
    
    PHILOSOPHY → MATH:
      "Red Hot, Blue Cold, Yellow in between... Our star is yellow and creates life."
      — weirdAI.md
    
    NOVELTY:
      - Aitchison metric (geology since 1982) applied to MoE routing — first time
      - Multi-channel composition: each channel is its own RBY world
      - Expert positions interpretable per-channel
      - Geometric spread loss with soft repulsive potential (Gap M3)
    """
    def __init__(self, d_model, n_experts, top_k=2, noise_std=0.1,
                 spread_weight=0.0, n_channels=1, eps=1e-8):
        super().__init__()
        self.n_experts = n_experts
        self.top_k = min(top_k, n_experts)
        self.noise_std = noise_std
        self.spread_weight = spread_weight
        self.n_channels = n_channels
        self.eps = eps
        
        # Multi-channel: K separate projections to 3D simplex
        self.W_c = nn.Linear(d_model, 3 * n_channels, bias=True)
        
        # Expert positions: K channels × E experts × 3 dims (log-space)
        init_positions = self._uniform_simplex_init(n_experts, n_channels)
        self.expert_log_positions = nn.Parameter(init_positions)  # (K, E, 3)
        
        # Per-expert bias
        self.expert_bias = nn.Parameter(torch.zeros(n_experts))
        
        # Learnable temperature per channel (controls sharpness)
        self.log_temperature = nn.Parameter(torch.zeros(n_channels))
    
    def _uniform_simplex_init(self, n, k):
        """Initialize K×E points spread on their respective simplices."""
        all_pts = []
        for ch in range(k):
            # Use different random seeds per channel for diversity
            torch.manual_seed(42 + ch * 137)
            pts = torch.rand(n, 3) + 0.1
            pts = pts / pts.sum(dim=1, keepdim=True)
            all_pts.append(pts.log())
        return torch.stack(all_pts)  # (K, E, 3)
    
    def get_expert_positions(self):
        """Get expert positions on the simplex (for visualization). Returns channel 0."""
        return F.softmax(self.expert_log_positions[0], dim=1)
    
    def get_all_positions(self):
        """Get positions across all channels."""
        return F.softmax(self.expert_log_positions, dim=2)  # (K, E, 3)
    
    def aitchison_distance_multi(self, x, y):
        """
        Aitchison distance across multiple channels.
        
        x: (BT, K, 3) — token positions on K simplices
        y: (K, E, 3) — expert positions on K simplices
        
        Returns: (BT, E) — summed distances across channels
        """
        x = x.clamp(min=self.eps)
        y = y.clamp(min=self.eps)
        
        # CLR transform per channel
        log_x = x.log()  # (BT, K, 3)
        log_y = y.log()  # (K, E, 3)
        
        clr_x = log_x - log_x.mean(dim=-1, keepdim=True)  # (BT, K, 3)
        clr_y = log_y - log_y.mean(dim=-1, keepdim=True)  # (K, E, 3)
        
        # Per-channel distances: (BT, K, 1, 3) - (1, K, E, 3) → (BT, K, E, 3)
        diff = clr_x.unsqueeze(2) - clr_y.unsqueeze(0)
        per_ch_dist = diff.pow(2).sum(dim=-1).sqrt()  # (BT, K, E)
        
        # Temperature-scaled sum across channels
        temps = self.log_temperature.exp().clamp(min=0.1, max=10.0)  # (K,)
        scaled = per_ch_dist / temps.unsqueeze(0).unsqueeze(2)  # (BT, K, E)
        
        return scaled.sum(dim=1)  # (BT, E)
    
    def spread_loss(self, all_positions):
        """
        Soft repulsive potential — penalize close experts, but BOUNDED.
        Uses 1/(d² + δ) so it's finite and well-behaved.
        """
        K, E, _ = all_positions.shape
        if E < 2:
            return torch.tensor(0.0, device=all_positions.device)
        
        total = torch.tensor(0.0, device=all_positions.device)
        delta = 0.1  # softening constant
        
        for ch in range(K):
            pos = all_positions[ch].clamp(min=self.eps)
            log_pos = pos.log()
            clr = log_pos - log_pos.mean(dim=-1, keepdim=True)
            
            # Pairwise squared distances
            diff = clr.unsqueeze(0) - clr.unsqueeze(1)  # (E, E, 3)
            d_sq = diff.pow(2).sum(dim=-1)  # (E, E)
            
            # Repulsive potential: high when experts are close
            mask = torch.triu(torch.ones(E, E, device=pos.device), diagonal=1).bool()
            repulsion = (1.0 / (d_sq[mask] + delta)).mean()
            total = total + repulsion
        
        return self.spread_weight * total / K
    
    def forward(self, x):
        B, T, D = x.shape
        
        # Multi-channel projection to K simplices
        rby_logits = self.W_c(x)  # (B, T, 3K)
        rby_logits = rby_logits.reshape(B, T, self.n_channels, 3)
        token_rby = F.softmax(rby_logits, dim=-1)  # (B, T, K, 3)
        
        # Get expert positions
        all_pos = self.get_all_positions()  # (K, E, 3)
        
        # Compute distances
        flat_rby = token_rby.reshape(B * T, self.n_channels, 3)  # (BT, K, 3)
        dists = self.aitchison_distance_multi(flat_rby, all_pos)  # (BT, E)
        
        # Routing scores: closer = higher score
        scores = -dists + self.expert_bias.unsqueeze(0)
        
        if self.training and self.noise_std > 0:
            scores = scores + torch.randn_like(scores) * self.noise_std
        
        scores = scores.reshape(B, T, self.n_experts)
        
        # Top-k selection
        topk_vals, topk_idx = scores.topk(self.top_k, dim=-1)
        weights = F.softmax(topk_vals, dim=-1)
        
        # Load-balancing aux loss
        probs = F.softmax(scores, dim=-1)
        top1_idx = topk_idx[:, :, 0]
        mask_oh = F.one_hot(top1_idx, self.n_experts).float()
        f = mask_oh.mean(dim=(0, 1))
        P = probs.mean(dim=(0, 1))
        aux_loss = self.n_experts * (f * P).sum()
        
        # Spread loss (bounded soft repulsion)
        if self.spread_weight > 0:
            aux_loss = aux_loss + self.spread_loss(all_pos)
        
        expert_pos = self.get_expert_positions()  # channel 0 for viz
        return weights, topk_idx, aux_loss, expert_pos


# ═══════════════════════════════════════════════════════════════════════════
# MoE BLOCK (supports both router types)
# ═══════════════════════════════════════════════════════════════════════════

class MoEBlock(nn.Module):
    def __init__(self, d_model, n_heads, n_experts, ff_dim, top_k=2,
                 router_type="standard", spread_weight=0.0, n_channels=1,
                 dropout=0.1):
        super().__init__()
        self.ln1 = nn.LayerNorm(d_model)
        self.attn = CausalSelfAttention(d_model, n_heads, dropout)
        self.ln2 = nn.LayerNorm(d_model)
        
        if router_type == "chromatic":
            self.router = ChromaticRouter(d_model, n_experts, top_k,
                                          spread_weight=spread_weight,
                                          n_channels=n_channels)
        else:
            self.router = StandardRouter(d_model, n_experts, top_k)
        
        self.experts = BatchedNanoExperts(n_experts, d_model, ff_dim, dropout)
        self.n_experts = n_experts
        self.d_model = d_model

    def forward(self, x):
        B, T, D = x.shape
        x = x + self.attn(self.ln1(x))
        residual = x
        normed = self.ln2(x)
        weights, indices, aux_loss, expert_pos = self.router(normed)
        # All-experts forward
        flat = normed.reshape(B*T, D).unsqueeze(0).expand(self.n_experts, -1, -1)
        all_out = self.experts(flat)
        all_out = all_out.permute(1, 0, 2).reshape(B, T, self.n_experts, D)
        idx_exp = indices.unsqueeze(-1).expand(-1, -1, -1, D)
        selected = all_out.gather(2, idx_exp)
        out = (selected * weights.unsqueeze(-1)).sum(dim=2)
        return residual + out, aux_loss, expert_pos


class NanoMoEStack(nn.Module):
    def __init__(self, vocab, d_model, n_heads, n_layers, n_experts, ff_dim,
                 top_k=2, router_type="standard", spread_weight=0.0,
                 n_channels=1, dropout=0.1):
        super().__init__()
        self.d_model = d_model
        self.n_layers = n_layers
        self.n_experts = n_experts
        self.ff_dim = ff_dim
        self.top_k = top_k
        self.router_type = router_type
        
        self.tok_emb = nn.Embedding(vocab, d_model)
        self.pos_emb = nn.Embedding(SEQ_LEN, d_model)
        self.drop = nn.Dropout(dropout)
        self.blocks = nn.ModuleList([
            MoEBlock(d_model, n_heads, n_experts, ff_dim, top_k, router_type,
                     spread_weight, n_channels, dropout)
            for _ in range(n_layers)
        ])
        self.ln = nn.LayerNorm(d_model)
        self.head = nn.Linear(d_model, vocab)
    
    def forward(self, x):
        B, T = x.shape
        x = self.drop(self.tok_emb(x) + self.pos_emb(torch.arange(T, device=x.device)))
        total_aux = 0.0
        all_positions = []
        for block in self.blocks:
            x, aux, expert_pos = block(x)
            total_aux += aux
            if expert_pos is not None:
                all_positions.append(expert_pos.detach().cpu())
        return self.head(self.ln(x)), total_aux, all_positions


# ═══════════════════════════════════════════════════════════════════════════
# TRAINING + EVALUATION
# ═══════════════════════════════════════════════════════════════════════════

def count_params(model):
    return sum(p.numel() for p in model.parameters())

def count_router_params(model):
    return sum(p.numel() for n, p in model.named_parameters() if 'router' in n)

def cuda_cleanup(dev="cuda:0"):
    gc.collect()
    if torch.cuda.is_available():
        idx = int(dev.split(":")[-1]) if ":" in dev else 0
        with torch.cuda.device(idx):
            torch.cuda.synchronize()
            torch.cuda.empty_cache()
            torch.cuda.reset_peak_memory_stats()

@torch.no_grad()
def evaluate(model, data_split, dev, n_batches=EVAL_BATCHES):
    model.eval()
    total_loss = 0.0
    total_correct = 0
    total_tokens = 0
    for _ in range(n_batches):
        x, y = get_batch(data_split, BATCH_SIZE, dev)
        logits, _, _ = model(x)
        loss = F.cross_entropy(logits.reshape(-1, logits.shape[-1]), y.reshape(-1))
        total_correct += (logits.argmax(-1) == y).sum().item()
        total_tokens += y.numel()
        total_loss += loss.item()
    avg_loss = total_loss / n_batches
    return {
        "loss": avg_loss,
        "ppl": math.exp(min(avg_loss, 20)),
        "acc": total_correct / total_tokens,
        "bpc": avg_loss / math.log(2),
    }


def train_and_eval(name, model, data, dev, steps=TRAIN_STEPS):
    model.to(dev)
    total_p = count_params(model)
    router_p = count_router_params(model)
    print(f"\n  [{name}] {total_p:,} params ({router_p:,} router) on {dev}")
    
    optimizer = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=0.01)
    warmup = min(200, steps // 5)
    
    def lr_lambda(step):
        if step < warmup:
            return step / max(warmup, 1)
        return 0.5 * (1 + math.cos(math.pi * (step - warmup) / max(1, steps - warmup)))
    
    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)
    t0 = time.time()
    total_tokens = 0
    position_snapshots = []
    
    for step in range(1, steps + 1):
        model.train()
        x, y = get_batch(data["train"], BATCH_SIZE, dev)
        logits, aux, positions = model(x)
        loss = F.cross_entropy(logits.reshape(-1, logits.shape[-1]), y.reshape(-1))
        loss = loss + AUX_WEIGHT * aux
        
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        scheduler.step()
        total_tokens += BATCH_SIZE * SEQ_LEN
        
        # Snapshot expert positions
        if positions and step % 500 == 0:
            position_snapshots.append({
                "step": step,
                "positions": [p.numpy().tolist() for p in positions]
            })
        
        if step % 500 == 0 or step == steps:
            elapsed = time.time() - t0
            m = evaluate(model, data["val"], dev, n_batches=10)
            print(f"    [{name}] Step {step:5d} | ppl={m['ppl']:.2f} "
                  f"acc={m['acc']*100:.1f}% bpc={m['bpc']:.3f} | "
                  f"{total_tokens/elapsed:.0f} tok/s")
    
    # Final test
    test_m = evaluate(model, data["test"], dev)
    elapsed = time.time() - t0
    
    # Peak VRAM
    peak_vram = 0
    if "cuda" in dev:
        peak_vram = torch.cuda.max_memory_allocated(int(dev.split(":")[1])) / 1024**2
    
    # Get final expert positions for analysis
    final_positions = None
    if hasattr(model, 'blocks'):
        final_positions = []
        for block in model.blocks:
            if hasattr(block.router, 'get_expert_positions'):
                final_positions.append(
                    block.router.get_expert_positions().detach().cpu().numpy().tolist()
                )
    
    result = {
        "name": name,
        "params": total_p,
        "router_params": router_p,
        "test_ppl": test_m["ppl"],
        "test_acc": test_m["acc"],
        "test_bpc": test_m["bpc"],
        "test_loss": test_m["loss"],
        "time_s": elapsed,
        "peak_vram_mb": peak_vram,
        "position_snapshots": position_snapshots,
        "final_positions": final_positions,
    }
    
    del model, optimizer
    cuda_cleanup(dev)
    return result


# ═══════════════════════════════════════════════════════════════════════════
# ANALYSIS
# ═══════════════════════════════════════════════════════════════════════════

def analyze_positions(final_positions, name):
    """Analyze expert positions on the RBY simplex."""
    if not final_positions:
        return {}
    
    analysis = {}
    for layer_idx, positions in enumerate(final_positions):
        pos = np.array(positions)  # (E, 3) — [R, B, Y]
        
        # Which region does each expert occupy?
        regions = []
        for e in range(pos.shape[0]):
            r, b, y = pos[e]
            if r > b and r > y:
                regions.append("Red (perception)")
            elif b > r and b > y:
                regions.append("Blue (cognition)")
            else:
                regions.append("Yellow (execution)")
        
        # Spread metric
        from itertools import combinations
        dists = []
        for i, j in combinations(range(pos.shape[0]), 2):
            # Aitchison distance
            log_p = np.log(pos + 1e-8)
            clr = log_p - log_p.mean(axis=1, keepdims=True)
            d = np.sqrt(((clr[i] - clr[j])**2).sum())
            dists.append(d)
        
        analysis[f"layer_{layer_idx}"] = {
            "positions_rby": pos.tolist(),
            "regions": regions,
            "region_counts": {
                "Red": regions.count("Red (perception)"),
                "Blue": regions.count("Blue (cognition)"),
                "Yellow": regions.count("Yellow (execution)"),
            },
            "mean_spread": float(np.mean(dists)),
            "min_spread": float(np.min(dists)),
            "max_spread": float(np.max(dists)),
        }
    
    return analysis


def print_results(results):
    """Print comparison table and analysis."""
    print(f"\n{'='*70}")
    print(f"RESULTS COMPARISON")
    print(f"{'='*70}")
    
    sorted_r = sorted(results, key=lambda r: r["test_ppl"])
    
    print(f"\n{'Rank':<5} {'Config':<25} {'Params':<10} {'Router':<8} "
          f"{'PPL':<8} {'Acc':<8} {'BPC':<8} {'Time(s)':<8}")
    print("-" * 85)
    for rank, r in enumerate(sorted_r, 1):
        print(f"{rank:<5} {r['name']:<25} {r['params']:<10,} {r['router_params']:<8,} "
              f"{r['test_ppl']:<8.2f} {r['test_acc']*100:<7.1f}% "
              f"{r['test_bpc']:<8.3f} {r['time_s']:<8.1f}")
    
    # Compare chromatic vs standard
    std = next((r for r in results if "Standard" in r["name"]), None)
    chrom = next((r for r in results if "Chromatic" in r["name"] and "Spread" not in r["name"]), None)
    chrom_spread = next((r for r in results if "Spread" in r["name"]), None)
    
    print(f"\n{'='*70}")
    print(f"KEY FINDINGS")
    print(f"{'='*70}")
    
    if std and chrom:
        diff = (1 - chrom["test_ppl"] / std["test_ppl"]) * 100
        print(f"\n  Chromatic vs Standard Router:")
        print(f"    Standard:  PPL={std['test_ppl']:.2f} ({std['router_params']:,} router params)")
        print(f"    Chromatic: PPL={chrom['test_ppl']:.2f} ({chrom['router_params']:,} router params)")
        param_saving = (1 - chrom["router_params"] / std["router_params"]) * 100
        print(f"    Router params saved: {param_saving:.0f}%")
        if diff > 0:
            print(f"    ★ Chromatic WINS by {diff:.1f}% — Aitchison routing is better!")
        elif diff > -1:
            print(f"    ≈ Competitive (within 1%) — interpretability is free!")
        else:
            print(f"    ⚠ Standard wins by {-diff:.1f}%")
    
    if chrom_spread and chrom:
        diff = (1 - chrom_spread["test_ppl"] / chrom["test_ppl"]) * 100
        print(f"\n  Spread Loss Impact (Gap M3 — Capacity Balancing):")
        print(f"    Without spread: PPL={chrom['test_ppl']:.2f}")
        print(f"    With spread:    PPL={chrom_spread['test_ppl']:.2f}")
        if diff > 0:
            print(f"    ★ Spread loss helps by {diff:.1f}% — geometric balancing works!")
        else:
            print(f"    Spread loss {'hurts' if diff < -1 else 'neutral'} by {abs(diff):.1f}%")
    
    # Expert position analysis
    for r in results:
        if r.get("final_positions"):
            pos_analysis = analyze_positions(r["final_positions"], r["name"])
            print(f"\n  Expert Position Map — {r['name']}:")
            for layer_key, la in pos_analysis.items():
                print(f"    {layer_key}:")
                rc = la["region_counts"]
                print(f"      R={rc['Red']} B={rc['Blue']} Y={rc['Yellow']}")
                print(f"      Spread: mean={la['mean_spread']:.3f} "
                      f"min={la['min_spread']:.3f} max={la['max_spread']:.3f}")
                # Show each expert's position
                for e, (pos, region) in enumerate(zip(la["positions_rby"], la["regions"])):
                    print(f"      Expert {e}: R={pos[0]:.3f} B={pos[1]:.3f} "
                          f"Y={pos[2]:.3f} → {region}")
    
    return sorted_r


# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    text = download_data()
    data = prepare_data(text)
    V = data["vocab_size"]
    print(f"Data: {len(text):,} chars, {V} vocab")
    print(f"Config: {N_LAYERS}L, {N_EXPERTS}E, ff{FF_DIM}, d_model={D_MODEL}, top-{TOP_K}")
    
    all_results = []
    
    # Alternate GPUs sequentially (Windows CUDA threading lesson from test_21)
    dev0 = "cuda:0" if N_GPUS > 0 else "cpu"
    dev1 = "cuda:1" if N_GPUS > 1 else dev0
    
    # 1. Standard Router (baseline)
    torch.manual_seed(BASE_SEED)
    model = NanoMoEStack(V, D_MODEL, N_HEADS, N_LAYERS, N_EXPERTS, FF_DIM,
                         TOP_K, router_type="standard")
    r1 = train_and_eval("Standard Router (3L)", model, data, dev0)
    all_results.append(r1)
    
    # 2. Chromatic K=1 (original single-channel)
    torch.manual_seed(BASE_SEED)
    model = NanoMoEStack(V, D_MODEL, N_HEADS, N_LAYERS, N_EXPERTS, FF_DIM,
                         TOP_K, router_type="chromatic", n_channels=1)
    r2 = train_and_eval("Chromatic K=1 (3L)", model, data, dev1)
    all_results.append(r2)
    
    # 3. Chromatic K=4 (multi-channel — 12 degrees of routing freedom)
    torch.manual_seed(BASE_SEED)
    model = NanoMoEStack(V, D_MODEL, N_HEADS, N_LAYERS, N_EXPERTS, FF_DIM,
                         TOP_K, router_type="chromatic", n_channels=4)
    r3 = train_and_eval("Chromatic K=4 (3L)", model, data, dev0)
    all_results.append(r3)
    
    # 4. Chromatic K=4 + Spread Loss (capacity balancing, Gap M3)
    torch.manual_seed(BASE_SEED)
    model = NanoMoEStack(V, D_MODEL, N_HEADS, N_LAYERS, N_EXPERTS, FF_DIM,
                         TOP_K, router_type="chromatic", spread_weight=SPREAD_WEIGHT,
                         n_channels=4)
    r4 = train_and_eval("Chromatic K=4+Spread", model, data, dev1)
    all_results.append(r4)
    
    # 5. Chromatic K=8 (maximal channels — 24 degrees of freedom)
    torch.manual_seed(BASE_SEED)
    model = NanoMoEStack(V, D_MODEL, N_HEADS, N_LAYERS, N_EXPERTS, FF_DIM,
                         TOP_K, router_type="chromatic", n_channels=8)
    r5 = train_and_eval("Chromatic K=8 (3L)", model, data, dev0)
    all_results.append(r5)
    
    # Analysis
    sorted_r = print_results(all_results)
    
    # Save
    output = {
        "test": "test_22_chromatic_router_v2",
        "date": time.strftime("%Y-%m-%d %H:%M:%S"),
        "config": {
            "n_layers": N_LAYERS, "n_experts": N_EXPERTS, "ff_dim": FF_DIM,
            "d_model": D_MODEL, "top_k": TOP_K, "train_steps": TRAIN_STEPS,
            "spread_weight": SPREAD_WEIGHT,
        },
        "results": all_results,
        "ranking": [r["name"] for r in sorted_r],
    }
    
    out_path = os.path.join(os.path.dirname(__file__), "test_22_results.json")
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2, default=str)
    print(f"\nResults saved to {out_path}")
    
    print(f"\n{'='*70}")
    print(f"TEST 22 COMPLETE")
    print(f"{'='*70}")
    print(f"{'='*70}")
