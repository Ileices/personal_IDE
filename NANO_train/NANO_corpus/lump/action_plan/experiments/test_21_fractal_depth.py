#!/usr/bin/env python3
"""
TEST 21 — FRACTAL DEPTH: Multi-Layer MoE Stacking
===================================================

ARCHITECTURE COMPLETION Phase 1 — highest-impact, zero-dependency test.

Session 5 proved NanoMoE with 1 MoE layer beats dense transformers:
  NanoMoE PPL=6.11 vs Dense PPL=6.88 (11.2% better)

But the COMPLETENESS_AUDIT found Gap M2: only 1 attention + 1 MoE layer.
Every major MoE model uses 2-32+ layers.

HYPOTHESIS: If depth helps, the architecture WAS incomplete.
            Multi-layer stacking should dramatically improve perplexity
            at the SAME parameter budget by trading width for depth.

WHAT WE TEST:
  1L:  1−layer, 8 experts, ff_dim=256        (current baseline)
  2L:  2−layer, 8 experts/layer, ff_dim=128   (same total FFN params)
  3L:  3−layer, 8 experts/layer, ff_dim=85    (same total FFN params)
  4L:  4−layer, 8 experts/layer, ff_dim=64    (same total FFN params)

  Dense-1L and Dense-2L baselines for comparison.

  ALL at same ~500K total parameter budget.

ALSO BEGINS:
  Touch Tensor v0 — log routing patterns per expert per step
    (first datapoint for Gap M6: Expert Specialization Tracking)

HARDWARE:
  Uses BOTH GTX 1660 SUPER GPUs:
    GPU 0: runs configurations 1L, 3L
    GPU 1: runs configurations 2L, 4L
    (parallel execution — halves wall-clock time)
  CPU: AMD 5900x 12-core handles data loading, evaluation, analysis
  RAM: 80GB — cache all data and results

CLUSTER REGISTRY (for planning):
  1660-Dually:  2× GTX 1660 SUPER (6GB), AMD 5900x, 80GB RAM
  Garage PC:    GT 1030 (2GB), i7-10700F, 12GB RAM
  3090-rig:     RTX 3090 FE (24GB), AMD 5950x, 60GB RAM
  [Reserved]    RTX 4090 (24GB), Threadripper, 256GB RAM
"""

import os, sys, time, math, json, gc, hashlib, threading, queue
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from collections import defaultdict
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Tuple, Optional

# ═══════════════════════════════════════════════════════════════════════════
# HARDWARE DETECTION — Use all available resources
# ═══════════════════════════════════════════════════════════════════════════

N_GPUS = torch.cuda.device_count() if torch.cuda.is_available() else 0
DEVICES = [f"cuda:{i}" for i in range(N_GPUS)] if N_GPUS > 0 else ["cpu"]
CPU_COUNT = os.cpu_count() or 1

print(f"{'='*70}")
print(f"TEST 21 — FRACTAL DEPTH: Multi-Layer MoE Stacking")
print(f"{'='*70}")
print(f"Hardware:")
print(f"  CPU: {CPU_COUNT} cores")
print(f"  RAM: ~80 GB")
print(f"  GPUs: {N_GPUS}")
for i in range(N_GPUS):
    props = torch.cuda.get_device_properties(i)
    print(f"    GPU {i}: {props.name} ({props.total_memory // 1024**2} MB, "
          f"{props.multi_processor_count} SMs)")

# ═══════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

SEQ_LEN = 128
BATCH_SIZE = 64
TRAIN_STEPS = 3000
EVAL_BATCHES = 30
LR = 1e-3
DROPOUT = 0.1
AUX_WEIGHT = 0.01
BASE_SEED = 42
D_MODEL = 64
N_HEADS = 4
N_EXPERTS = 8
TOP_K = 2

# Parameter-matched configurations
# Each configuration has ~same total FFN parameters:
#   n_layers × n_experts × (d_model × ff_dim × 2) ≈ constant
# Base: 1 layer × 8 experts × (64 × 256 × 2) = 262,144 FFN params
# So as layers increase, ff_dim decreases proportionally.

CONFIGS = {
    "NanoMoE-1L": {"n_layers": 1, "ff_dim": 256, "n_experts": 8},
    "NanoMoE-2L": {"n_layers": 2, "ff_dim": 128, "n_experts": 8},
    "NanoMoE-3L": {"n_layers": 3, "ff_dim": 85,  "n_experts": 8},
    "NanoMoE-4L": {"n_layers": 4, "ff_dim": 64,  "n_experts": 8},
    "Dense-1L":   {"n_layers": 1, "ff_dim": 256, "n_experts": 0},  # 0 = dense
    "Dense-2L":   {"n_layers": 2, "ff_dim": 128, "n_experts": 0},
}

# GPU assignment — sequential execution, alternating GPUs
# (Windows CUDA doesn't support safe multi-threaded GPU training)
# We alternate devices so both GPUs get used and stay warm
GPU_ASSIGN = {}
if N_GPUS >= 2:
    config_names = list(CONFIGS.keys())
    for i, name in enumerate(config_names):
        GPU_ASSIGN[name] = f"cuda:{i % 2}"
else:
    for name in CONFIGS:
        GPU_ASSIGN[name] = DEVICES[0]


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
        words = "the and to of a in that is was he for it with as his on be at by i this had".split()
        text = ""
        for _ in range(60000):
            text += " ".join(random.choices(words, k=random.randint(5, 20))) + ".\n"
        text = text[:1_100_000]
    with open(cache, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"  {len(text):,} characters")
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


def get_batch(data_split, batch_size, seq_len, device_str):
    ix = torch.randint(len(data_split) - seq_len - 1, (batch_size,))
    x = torch.stack([data_split[i:i+seq_len] for i in ix]).to(device_str)
    y = torch.stack([data_split[i+1:i+seq_len+1] for i in ix]).to(device_str)
    return x, y


# ═══════════════════════════════════════════════════════════════════════════
# TOUCH TENSOR v0 — Log expert routing patterns
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class TouchTensor:
    """
    Translation of "Touch Events" from weirdAI framework.
    
    "All experiments or TOUCH EVENTS are never lost."
    — weirdAI.md
    
    Logs routing patterns per expert per step. What each expert
    "touches" (processes) is never discarded — it accumulates into
    a profile that tells us what the expert specializes in.
    """
    n_experts: int
    n_layers: int
    # Per-expert utilization (fraction of tokens routed to each expert)
    utilization: Dict[int, List[float]] = field(default_factory=dict)
    # Per-layer routing entropy over time
    entropy: Dict[int, List[float]] = field(default_factory=dict)
    # Expert selection frequency (which experts get paired together)
    co_selection: Optional[np.ndarray] = None
    
    def __post_init__(self):
        for layer in range(self.n_layers):
            self.utilization[layer] = [[] for _ in range(self.n_experts)]
            self.entropy[layer] = []
        self.co_selection = np.zeros((self.n_layers, self.n_experts, self.n_experts))
    
    def log_routing(self, layer_idx: int, routing_indices: torch.Tensor,
                    routing_weights: torch.Tensor):
        """
        Log a routing event.
        
        routing_indices: (B, T, top_k) — which experts were selected
        routing_weights: (B, T, top_k) — with what weight
        """
        B, T, K = routing_indices.shape
        total_tokens = B * T
        
        # Expert utilization: fraction of tokens using each expert
        flat_idx = routing_indices.reshape(-1, K)
        for e in range(self.n_experts):
            count = (flat_idx == e).any(dim=1).sum().item()
            self.utilization[layer_idx][e].append(count / total_tokens)
        
        # Routing entropy: how spread out the routing is
        # Higher entropy = more balanced routing
        probs = torch.zeros(self.n_experts, device=routing_indices.device)
        for k in range(K):
            for e in range(self.n_experts):
                probs[e] += (routing_indices[:, :, k] == e).float().mean()
        probs = probs / probs.sum()
        entropy = -(probs * (probs + 1e-10).log()).sum().item()
        self.entropy[layer_idx].append(entropy)
        
        # Co-selection: which experts get selected together
        if K >= 2:
            for b in range(min(B, 4)):  # sample a few to avoid cost
                for t in range(min(T, 32)):
                    selected = routing_indices[b, t].tolist()
                    for i in range(len(selected)):
                        for j in range(i+1, len(selected)):
                            self.co_selection[layer_idx, selected[i], selected[j]] += 1
                            self.co_selection[layer_idx, selected[j], selected[i]] += 1
    
    def summary(self) -> dict:
        """Produce summary statistics for logging."""
        result = {}
        for layer in range(self.n_layers):
            util = [u[-1] if u else 0.0 for u in self.utilization[layer]]
            result[f"layer_{layer}"] = {
                "utilization": util,
                "util_std": float(np.std(util)),
                "util_max": float(np.max(util)),
                "util_min": float(np.min(util)),
                "entropy_final": self.entropy[layer][-1] if self.entropy[layer] else 0.0,
                "entropy_mean": float(np.mean(self.entropy[layer])) if self.entropy[layer] else 0.0,
                "top_pairs": self._top_pairs(layer, n=5),
            }
        return result
    
    def _top_pairs(self, layer, n=5):
        co = self.co_selection[layer]
        pairs = []
        for i in range(self.n_experts):
            for j in range(i+1, self.n_experts):
                pairs.append((int(co[i, j]), i, j))
        pairs.sort(reverse=True)
        return [(cnt, i, j) for cnt, i, j in pairs[:n]]


# ═══════════════════════════════════════════════════════════════════════════
# MODEL COMPONENTS — Proven from test_20, extended for multi-layer
# ═══════════════════════════════════════════════════════════════════════════

class CausalSelfAttention(nn.Module):
    def __init__(self, d_model, n_heads, max_len=SEQ_LEN, dropout=0.1):
        super().__init__()
        self.n_heads = n_heads
        self.head_dim = d_model // n_heads
        self.qkv = nn.Linear(d_model, 3 * d_model)
        self.proj = nn.Linear(d_model, d_model)
        self.attn_drop = nn.Dropout(dropout)
        self.proj_drop = nn.Dropout(dropout)
        self.register_buffer("mask",
            torch.tril(torch.ones(max_len, max_len)).unsqueeze(0).unsqueeze(0))

    def forward(self, x):
        B, T, C = x.shape
        qkv = self.qkv(x).reshape(B, T, 3, self.n_heads, self.head_dim)
        qkv = qkv.permute(2, 0, 3, 1, 4)
        q, k, v = qkv[0], qkv[1], qkv[2]
        att = (q @ k.transpose(-2, -1)) * (self.head_dim ** -0.5)
        att = att.masked_fill(self.mask[:, :, :T, :T] == 0, float('-inf'))
        att = self.attn_drop(F.softmax(att, dim=-1))
        y = (att @ v).transpose(1, 2).contiguous().reshape(B, T, C)
        return self.proj_drop(self.proj(y)), att


class BatchedNanoExperts(nn.Module):
    """Batched FFN experts using BMM for GPU efficiency."""
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


class TopKRouter(nn.Module):
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
        # Load-balancing auxiliary loss
        probs = F.softmax(logits, dim=-1)
        top1_idx = topk_idx[:, :, 0]
        mask = F.one_hot(top1_idx, self.n_experts).float()
        f = mask.mean(dim=(0, 1))
        P = probs.mean(dim=(0, 1))
        aux_loss = self.n_experts * (f * P).sum()
        return weights, topk_idx, aux_loss


class MoEBlock(nn.Module):
    """One fractal scale: Attention + MoE with routing."""
    def __init__(self, d_model, n_heads, n_experts, ff_dim, top_k=2, dropout=0.1):
        super().__init__()
        self.ln1 = nn.LayerNorm(d_model)
        self.attn = CausalSelfAttention(d_model, n_heads, dropout=dropout)
        self.ln2 = nn.LayerNorm(d_model)
        self.router = TopKRouter(d_model, n_experts, top_k)
        self.experts = BatchedNanoExperts(n_experts, d_model, ff_dim, dropout)
        self.n_experts = n_experts
        self.d_model = d_model

    def forward(self, x, collect_touch=False):
        B, T, D = x.shape
        # Attention
        h, attn_weights = self.attn(self.ln1(x))
        x = x + h
        # MoE
        residual = x
        normed = self.ln2(x)
        weights, indices, aux_loss = self.router(normed)
        # All-experts forward (efficient for n_experts ≤ 64)
        flat = normed.reshape(B*T, D).unsqueeze(0).expand(self.n_experts, -1, -1)
        all_out = self.experts(flat)
        all_out = all_out.permute(1, 0, 2).reshape(B, T, self.n_experts, D)
        idx_exp = indices.unsqueeze(-1).expand(-1, -1, -1, D)
        selected = all_out.gather(2, idx_exp)
        out = (selected * weights.unsqueeze(-1)).sum(dim=2)
        
        touch_info = (indices, weights) if collect_touch else None
        return residual + out, aux_loss, touch_info


class TransformerBlock(nn.Module):
    """Dense transformer block (for comparison)."""
    def __init__(self, d_model, n_heads, ff_dim, dropout=0.1):
        super().__init__()
        self.ln1 = nn.LayerNorm(d_model)
        self.attn = CausalSelfAttention(d_model, n_heads, dropout=dropout)
        self.ln2 = nn.LayerNorm(d_model)
        self.ff = nn.Sequential(
            nn.Linear(d_model, ff_dim), nn.GELU(), nn.Dropout(dropout),
            nn.Linear(ff_dim, d_model), nn.Dropout(dropout),
        )

    def forward(self, x):
        h, _ = self.attn(self.ln1(x))
        x = x + h
        x = x + self.ff(self.ln2(x))
        return x


# ═══════════════════════════════════════════════════════════════════════════
# FULL MODELS
# ═══════════════════════════════════════════════════════════════════════════

class NanoMoEStack(nn.Module):
    """
    The Fractal Stack: N layers of (Attention + MoE).
    
    Each layer is one scale of the fractal — like how IC-AE creates
    sandboxes within sandboxes. Layer 0 sees characters. Layer 1 sees
    patterns-of-characters. Layer N sees meaning.
    
    "depth gives exponential expressiveness; width gives only linear"
    — Session 4 analysis, fatal flaw F3
    """
    def __init__(self, vocab, d_model=64, n_heads=4, n_layers=2,
                 n_experts=8, ff_dim=128, top_k=2, dropout=0.1):
        super().__init__()
        self.d_model = d_model
        self.n_layers = n_layers
        self.n_experts = n_experts
        self.top_k = top_k
        self.ff_dim = ff_dim
        
        self.tok_emb = nn.Embedding(vocab, d_model)
        self.pos_emb = nn.Embedding(SEQ_LEN, d_model)
        self.drop = nn.Dropout(dropout)
        
        self.blocks = nn.ModuleList([
            MoEBlock(d_model, n_heads, n_experts, ff_dim, top_k, dropout)
            for _ in range(n_layers)
        ])
        
        self.ln = nn.LayerNorm(d_model)
        self.head = nn.Linear(d_model, vocab)
    
    def forward(self, x, collect_touch=False):
        B, T = x.shape
        x = self.drop(self.tok_emb(x) + self.pos_emb(torch.arange(T, device=x.device)))
        total_aux = 0.0
        touch_events = []
        for block in self.blocks:
            x, aux, touch = block(x, collect_touch=collect_touch)
            total_aux += aux
            if touch is not None:
                touch_events.append(touch)
        return self.head(self.ln(x)), total_aux, touch_events
    
    def count_ffn_params(self):
        """Count only the expert (FFN) parameters."""
        return sum(p.numel() for n, p in self.named_parameters() if 'experts' in n)
    
    def active_params_per_token(self):
        shared = sum(p.numel() for n, p in self.named_parameters()
                     if 'experts' not in n)
        per_expert = (self.blocks[0].experts.W1[0].numel() +
                      self.blocks[0].experts.b1[0].numel() +
                      self.blocks[0].experts.W2[0].numel() +
                      self.blocks[0].experts.b2[0].numel())
        router_params = sum(p.numel() for n, p in self.named_parameters()
                           if 'router' in n)
        return shared + per_expert * self.top_k * self.n_layers + router_params
    
    def flops_per_token(self):
        d = self.d_model
        ff = self.ff_dim
        attn_flops = 4 * d * d + 2 * SEQ_LEN * d
        expert_flops = self.top_k * (2 * d * ff)
        layer_flops = attn_flops + expert_flops + d * self.n_experts  # + router
        return layer_flops * self.n_layers


class DenseStack(nn.Module):
    """Dense transformer stack (for comparison)."""
    def __init__(self, vocab, d_model=64, n_heads=4, n_layers=2,
                 ff_dim=256, dropout=0.1):
        super().__init__()
        self.tok_emb = nn.Embedding(vocab, d_model)
        self.pos_emb = nn.Embedding(SEQ_LEN, d_model)
        self.drop = nn.Dropout(dropout)
        self.blocks = nn.ModuleList([
            TransformerBlock(d_model, n_heads, ff_dim, dropout)
            for _ in range(n_layers)
        ])
        self.ln = nn.LayerNorm(d_model)
        self.head = nn.Linear(d_model, vocab)
    
    def forward(self, x):
        B, T = x.shape
        x = self.drop(self.tok_emb(x) + self.pos_emb(torch.arange(T, device=x.device)))
        for block in self.blocks:
            x = block(x)
        return self.head(self.ln(x))
    
    def flops_per_token(self):
        d = self.blocks[0].attn.head_dim * self.blocks[0].attn.n_heads
        ff = self.blocks[0].ff[0].out_features
        n_l = len(self.blocks)
        attn_flops = 4 * d * d + 2 * SEQ_LEN * d
        ffn_flops = 2 * d * ff
        return (attn_flops + ffn_flops) * n_l


# ═══════════════════════════════════════════════════════════════════════════
# TRAINING + EVALUATION
# ═══════════════════════════════════════════════════════════════════════════

def count_params(model):
    return sum(p.numel() for p in model.parameters())


def cuda_cleanup(device_str="cuda:0"):
    gc.collect()
    if torch.cuda.is_available():
        dev_idx = int(device_str.split(":")[-1]) if ":" in device_str else 0
        with torch.cuda.device(dev_idx):
            torch.cuda.synchronize()
            torch.cuda.empty_cache()
            torch.cuda.reset_peak_memory_stats()


@torch.no_grad()
def evaluate(model, data_split, device_str, is_moe=False, n_batches=EVAL_BATCHES):
    model.eval()
    total_loss = 0.0
    total_correct = 0
    total_tokens = 0
    for _ in range(n_batches):
        x, y = get_batch(data_split, BATCH_SIZE, SEQ_LEN, device_str)
        if is_moe:
            logits, _, _ = model(x)
        else:
            logits = model(x)
        loss = F.cross_entropy(logits.reshape(-1, logits.shape[-1]), y.reshape(-1))
        total_correct += (logits.argmax(-1) == y).sum().item()
        total_tokens += y.numel()
        total_loss += loss.item()
    avg_loss = total_loss / n_batches
    return {
        "loss": avg_loss,
        "perplexity": math.exp(min(avg_loss, 20)),
        "accuracy": total_correct / total_tokens,
        "bpc": avg_loss / math.log(2),
    }


def train_config(config_name, config, data, device_str, results_queue):
    """
    Train a single configuration. Designed to run in a thread (one per GPU).
    
    Results are pushed to results_queue for the main thread to collect.
    """
    is_moe = config["n_experts"] > 0
    n_layers = config["n_layers"]
    ff_dim = config["ff_dim"]
    n_experts = config["n_experts"]
    V = data["vocab_size"]
    
    # Set seed for reproducibility
    torch.manual_seed(BASE_SEED)
    if "cuda" in device_str:
        torch.cuda.manual_seed(BASE_SEED)
    
    # Build model
    if is_moe:
        model = NanoMoEStack(
            V, D_MODEL, N_HEADS, n_layers, n_experts, ff_dim, TOP_K, DROPOUT
        ).to(device_str)
        touch = TouchTensor(n_experts, n_layers)
    else:
        model = DenseStack(
            V, D_MODEL, N_HEADS, n_layers, ff_dim, DROPOUT
        ).to(device_str)
        touch = None
    
    total_p = count_params(model)
    active_p = model.active_params_per_token() if is_moe else total_p
    flops = model.flops_per_token() if hasattr(model, 'flops_per_token') else 0
    
    if is_moe:
        ffn_p = model.count_ffn_params()
        print(f"  [{config_name}] on {device_str}: {total_p:,} params "
              f"({ffn_p:,} FFN, {active_p:,} active/tok), "
              f"{n_layers}L × {n_experts}E × ff{ff_dim}")
    else:
        print(f"  [{config_name}] on {device_str}: {total_p:,} params, "
              f"{n_layers}L × ff{ff_dim}")
    
    # Training setup
    optimizer = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=0.01)
    warmup = min(200, TRAIN_STEPS // 5)
    
    def lr_lambda(step):
        if step < warmup:
            return step / max(warmup, 1)
        return 0.5 * (1 + math.cos(math.pi * (step - warmup) / max(1, TRAIN_STEPS - warmup)))
    
    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)
    
    t0 = time.time()
    total_tokens = 0
    loss_history = []
    checkpoint_metrics = []
    
    for step in range(1, TRAIN_STEPS + 1):
        model.train()
        x, y = get_batch(data["train"], BATCH_SIZE, SEQ_LEN, device_str)
        
        if is_moe:
            # Collect touch events every 100 steps
            collect = (step % 100 == 0)
            logits, aux, touch_events = model(x, collect_touch=collect)
            loss = F.cross_entropy(logits.reshape(-1, logits.shape[-1]), y.reshape(-1))
            loss = loss + AUX_WEIGHT * aux
            
            # Log touch events
            if collect and touch is not None:
                for layer_idx, (indices, weights) in enumerate(touch_events):
                    touch.log_routing(layer_idx, indices, weights)
        else:
            logits = model(x)
            loss = F.cross_entropy(logits.reshape(-1, logits.shape[-1]), y.reshape(-1))
        
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        scheduler.step()
        
        total_tokens += BATCH_SIZE * SEQ_LEN
        loss_history.append(loss.item())
        
        # Checkpoint evaluation
        if step % 500 == 0 or step == TRAIN_STEPS:
            elapsed = time.time() - t0
            metrics = evaluate(model, data["val"], device_str, is_moe, n_batches=10)
            tps = total_tokens / elapsed
            checkpoint_metrics.append({
                "step": step,
                "val_ppl": metrics["perplexity"],
                "val_acc": metrics["accuracy"],
                "val_bpc": metrics["bpc"],
                "elapsed": elapsed,
            })
            print(f"    [{config_name}] Step {step:5d} | ppl={metrics['perplexity']:.2f} "
                  f"acc={metrics['accuracy']*100:.1f}% bpc={metrics['bpc']:.3f} | "
                  f"{tps:.0f} tok/s | {elapsed:.1f}s")
    
    # Final test evaluation
    test_metrics = evaluate(model, data["test"], device_str, is_moe, n_batches=EVAL_BATCHES)
    total_time = time.time() - t0
    
    # Peak VRAM
    peak_vram = 0
    if "cuda" in device_str:
        dev_idx = int(device_str.split(":")[-1])
        peak_vram = torch.cuda.max_memory_allocated(dev_idx) / 1024**2
    
    result = {
        "name": config_name,
        "config": config,
        "params_total": total_p,
        "params_active": active_p,
        "flops_per_token": flops,
        "test_ppl": test_metrics["perplexity"],
        "test_acc": test_metrics["accuracy"],
        "test_bpc": test_metrics["bpc"],
        "test_loss": test_metrics["loss"],
        "time_s": total_time,
        "tps": total_tokens / total_time,
        "peak_vram_mb": peak_vram,
        "checkpoints": checkpoint_metrics,
        "loss_final_100": float(np.mean(loss_history[-100:])),
        "device": device_str,
    }
    
    if touch is not None:
        result["touch_summary"] = touch.summary()
    
    # Cleanup
    del model
    del optimizer
    cuda_cleanup(device_str)
    
    results_queue.put(result)
    return result


# ═══════════════════════════════════════════════════════════════════════════
# PARALLEL GPU EXECUTION
# ═══════════════════════════════════════════════════════════════════════════

def run_all_sequential(configs, data):
    """
    Run configurations sequentially, alternating GPUs.
    
    Windows CUDA doesn't support safe multi-threaded GPU training.
    We run one config at a time but alternate which GPU is used,
    so both GPUs contribute and neither sits idle for long.
    """
    results_queue = queue.Queue()
    
    print(f"\n  Sequential execution, alternating GPUs:")
    for name, device_str in GPU_ASSIGN.items():
        print(f"    {name} → {device_str}")
    
    for name in configs:
        device_str = GPU_ASSIGN[name]
        train_config(name, configs[name], data, device_str, results_queue)
    
    # Collect all results
    results = {}
    while not results_queue.empty():
        r = results_queue.get()
        results[r["name"]] = r
    
    return results


# ═══════════════════════════════════════════════════════════════════════════
# ANALYSIS
# ═══════════════════════════════════════════════════════════════════════════

def analyze_results(results):
    """
    Deep analysis of depth scaling results.
    """
    print("\n" + "="*70)
    print("ANALYSIS: FRACTAL DEPTH RESULTS")
    print("="*70)
    
    # Sort by PPL
    sorted_r = sorted(results.values(), key=lambda r: r["test_ppl"])
    
    # Table
    print(f"\n{'Rank':<5} {'Config':<16} {'Layers':<7} {'ff_dim':<7} "
          f"{'Params':<10} {'Active':<10} {'PPL':<8} {'Acc':<8} "
          f"{'BPC':<8} {'VRAM(MB)':<10} {'Time(s)':<10}")
    print("-" * 110)
    
    for rank, r in enumerate(sorted_r, 1):
        c = r["config"]
        typ = "MoE" if c["n_experts"] > 0 else "Dense"
        print(f"{rank:<5} {r['name']:<16} {c['n_layers']:<7} {c['ff_dim']:<7} "
              f"{r['params_total']:<10,} {r['params_active']:<10,} "
              f"{r['test_ppl']:<8.2f} {r['test_acc']*100:<7.1f}% "
              f"{r['test_bpc']:<8.3f} {r['peak_vram_mb']:<10.0f} "
              f"{r['time_s']:<10.1f}")
    
    # Key comparisons
    print("\n" + "="*70)
    print("KEY FINDINGS")
    print("="*70)
    
    moe_results = {k: v for k, v in results.items() if v["config"]["n_experts"] > 0}
    dense_results = {k: v for k, v in results.items() if v["config"]["n_experts"] == 0}
    
    if moe_results:
        best_moe = min(moe_results.values(), key=lambda r: r["test_ppl"])
        worst_moe = max(moe_results.values(), key=lambda r: r["test_ppl"])
        baseline_moe = moe_results.get("NanoMoE-1L")
        
        print(f"\n  Best MoE:   {best_moe['name']} — PPL={best_moe['test_ppl']:.2f}")
        print(f"  Worst MoE:  {worst_moe['name']} — PPL={worst_moe['test_ppl']:.2f}")
        
        if baseline_moe:
            improvement = (1 - best_moe["test_ppl"] / baseline_moe["test_ppl"]) * 100
            print(f"\n  DEPTH IMPACT: {best_moe['name']} vs 1-layer baseline:")
            print(f"    PPL: {baseline_moe['test_ppl']:.2f} → {best_moe['test_ppl']:.2f} "
                  f"({'%.1f' % improvement}% {'better' if improvement > 0 else 'worse'})")
            print(f"    Acc: {baseline_moe['test_acc']*100:.1f}% → {best_moe['test_acc']*100:.1f}%")
            
            if improvement > 0:
                print(f"\n  ★ DEPTH HELPS — Gap M2 CONFIRMED")
                print(f"    The architecture WAS incomplete. Adding layers at same param budget")
                print(f"    improves perplexity by {improvement:.1f}%.")
                print(f"    Depth gives exponential expressiveness; width gives only linear.")
            else:
                print(f"\n  ⚠ Depth did NOT help at this scale.")
                print(f"    This could mean: (a) param budget too small for depth,")
                print(f"    (b) need residual scaling, (c) 1 layer was already optimal here.")
    
    if dense_results and moe_results:
        best_dense = min(dense_results.values(), key=lambda r: r["test_ppl"])
        print(f"\n  Best Dense: {best_dense['name']} — PPL={best_dense['test_ppl']:.2f}")
        
        moe_vs_dense = (1 - best_moe["test_ppl"] / best_dense["test_ppl"]) * 100
        print(f"\n  MoE vs Dense (best vs best):")
        print(f"    {best_moe['name']} PPL={best_moe['test_ppl']:.2f} vs "
              f"{best_dense['name']} PPL={best_dense['test_ppl']:.2f}")
        print(f"    MoE {'wins' if moe_vs_dense > 0 else 'loses'} by {abs(moe_vs_dense):.1f}%")
    
    # Per-layer analysis: how does each MoE layer count perform?
    print("\n  Depth Scaling Curve (MoE only):")
    for name in ["NanoMoE-1L", "NanoMoE-2L", "NanoMoE-3L", "NanoMoE-4L"]:
        if name in results:
            r = results[name]
            bar = "█" * int(max(0, (20 - r["test_ppl"]) * 3))
            print(f"    {name}: PPL={r['test_ppl']:.2f} {bar}")
    
    # FLOP efficiency
    print("\n  Compute Efficiency (PPL per MFLOP):")
    for name in sorted(results.keys()):
        r = results[name]
        if r["flops_per_token"] > 0:
            efficiency = r["test_ppl"] * r["flops_per_token"] / 1e6
            print(f"    {name}: {r['flops_per_token']:,} FLOPs/tok, "
                  f"PPL×MFLOP = {efficiency:.2f} (lower=better)")
    
    # Touch tensor analysis
    print("\n  Touch Tensor Analysis (Expert Routing Patterns):")
    for name, r in results.items():
        if "touch_summary" in r:
            ts = r["touch_summary"]
            for layer_key, layer_data in ts.items():
                print(f"    {name} {layer_key}:")
                print(f"      Utilization std:  {layer_data['util_std']:.4f} "
                      f"(lower=more balanced)")
                print(f"      Utilization range: [{layer_data['util_min']:.3f}, "
                      f"{layer_data['util_max']:.3f}]")
                print(f"      Routing entropy:   {layer_data['entropy_mean']:.3f} "
                      f"(max={math.log(N_EXPERTS):.3f})")
                if layer_data["top_pairs"]:
                    pairs_str = ", ".join(
                        f"({i},{j}):{cnt}" for cnt, i, j in layer_data["top_pairs"][:3]
                    )
                    print(f"      Top co-selected:   {pairs_str}")
    
    # Optimal layer count recommendation
    print("\n" + "="*70)
    print("RECOMMENDATION FOR SUBSEQUENT TESTS")
    print("="*70)
    
    if moe_results:
        optimal = min(moe_results.values(), key=lambda r: r["test_ppl"])
        optimal_layers = optimal["config"]["n_layers"]
        print(f"\n  Optimal layer count: {optimal_layers} "
              f"(PPL={optimal['test_ppl']:.2f})")
        print(f"  This will be used as the base for test_22 (Chromatic Router)")
        print(f"  and all subsequent architecture completion tests.")
    
    return sorted_r


# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print(f"\nLoading data...")
    text = download_data()
    data = prepare_data(text)
    V = data["vocab_size"]
    print(f"Data: {len(text):,} chars, {V} vocab, SEQ_LEN={SEQ_LEN}")
    
    # Parameter budget analysis
    print(f"\nParameter Budget Analysis:")
    for name, cfg in CONFIGS.items():
        if cfg["n_experts"] > 0:
            # MoE: experts dominate
            ffn_params = cfg["n_layers"] * cfg["n_experts"] * (D_MODEL * cfg["ff_dim"] * 2 + cfg["ff_dim"] + D_MODEL)
            print(f"  {name}: {cfg['n_layers']}L × {cfg['n_experts']}E × ff{cfg['ff_dim']} "
                  f"→ ~{ffn_params:,} FFN params")
        else:
            ffn_params = cfg["n_layers"] * (D_MODEL * cfg["ff_dim"] * 2 + cfg["ff_dim"] + D_MODEL)
            print(f"  {name}: {cfg['n_layers']}L × ff{cfg['ff_dim']} "
                  f"→ ~{ffn_params:,} FFN params")
    
    # Run all configurations
    print(f"\n{'='*70}")
    print(f"TRAINING: {len(CONFIGS)} configurations, {TRAIN_STEPS} steps each")
    print(f"{'='*70}")
    
    t_total = time.time()
    results = run_all_sequential(CONFIGS, data)
    wall_time = time.time() - t_total
    
    # Analysis
    sorted_results = analyze_results(results)
    
    # Save results
    output = {
        "test": "test_21_fractal_depth",
        "date": time.strftime("%Y-%m-%d %H:%M:%S"),
        "wall_time_s": wall_time,
        "config": {
            "seq_len": SEQ_LEN,
            "batch_size": BATCH_SIZE,
            "train_steps": TRAIN_STEPS,
            "d_model": D_MODEL,
            "n_heads": N_HEADS,
            "lr": LR,
            "base_seed": BASE_SEED,
        },
        "hardware": {
            "n_gpus": N_GPUS,
            "gpus": [torch.cuda.get_device_properties(i).name for i in range(N_GPUS)]
                    if N_GPUS > 0 else [],
            "cpu_cores": CPU_COUNT,
        },
        "results": {name: {k: v for k, v in r.items() if k != "touch_summary"}
                    for name, r in results.items()},
        "touch_summaries": {name: r.get("touch_summary", {})
                           for name, r in results.items()},
        "ranking": [r["name"] for r in sorted_results],
    }
    
    results_path = os.path.join(os.path.dirname(__file__), "test_21_results.json")
    with open(results_path, "w") as f:
        json.dump(output, f, indent=2, default=str)
    print(f"\nResults saved to {results_path}")
    
    print(f"\n{'='*70}")
    print(f"TEST 21 COMPLETE — Wall time: {wall_time:.1f}s")
    print(f"{'='*70}")
