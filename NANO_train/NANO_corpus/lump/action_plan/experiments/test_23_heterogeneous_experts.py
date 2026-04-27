#!/usr/bin/env python3
"""
TEST 23 — HETEROGENEOUS EXPERT SIZES: Spectral Speciation (NOVEL)
==================================================================

ARCHITECTURE COMPLETION Phase 3 — Variable expert sizes.

test_21: 3 layers optimal (PPL 7.13)
test_22: Chromatic K=4 competitive (PPL 7.24 vs Standard 7.12)

Now we test: do DIFFERENT-SIZED experts beat UNIFORM experts at the
same total parameter budget?

PHILOSOPHY → MATH:
  "In the framework, stars have different sizes. Red giants are massive.
   Blue dwarfs are tiny. Yellow suns are medium."
  — ARCHITECTURE_COMPLETION.md

  But we FLIP IT for AI: Blue = cognition = BIGGER experts (deep thinking).
  Yellow = execution = SMALLER experts (quick output).
  Red = perception = MEDIUM experts (fast input processing).

WHAT WE TEST:
  1. Uniform: all experts ff_dim=85 (test_21 baseline)
  2. Heterogeneous Random: ff_dims vary randomly, same total params
  3. Heterogeneous RBY-Guided + Chromatic: Blue experts bigger, Yellow smaller
  4. Heterogeneous Gradient: graduated sizes (some big, some small)

Same total parameter budget for ALL configs.

HARDWARE: Dual GTX 1660 SUPER, sequential alternating.
DEPENDS ON: test_21 (3L optimal), test_22 (chromatic router)
"""

import os, sys, time, math, json, gc
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

# ═══════════════════════════════════════════════════════════════════════════
# HARDWARE
# ═══════════════════════════════════════════════════════════════════════════

N_GPUS = torch.cuda.device_count() if torch.cuda.is_available() else 0
DEVICES = [f"cuda:{i}" for i in range(N_GPUS)] if N_GPUS > 0 else ["cpu"]

print(f"{'='*70}")
print(f"TEST 23 — HETEROGENEOUS EXPERT SIZES: Spectral Speciation")
print(f"{'='*70}")
for i in range(N_GPUS):
    props = torch.cuda.get_device_properties(i)
    print(f"  GPU {i}: {props.name} ({props.total_memory // 1024**2} MB)")

# ═══════════════════════════════════════════════════════════════════════════
# CONFIG
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
N_LAYERS = 3
N_EXPERTS = 8
FF_DIM_UNIFORM = 85    # Baseline from test_21
TOP_K = 2

# Parameter budget for experts per layer:
# Per expert: W1(d_model×ff) + b1(ff) + W2(ff×d_model) + b2(d_model)
#           = 2×64×ff + ff + 64 = 129*ff + 64
# For 8 experts @ ff=85: sum = 8*(129*85+64) = 88,232 per layer
# So heterogeneous ff_dims must sum to 8*85 = 680 per layer

TARGET_FF_SUM = N_EXPERTS * FF_DIM_UNIFORM  # 680

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
# SHARED ATTENTION (proven from test_21/22)
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


# ═══════════════════════════════════════════════════════════════════════════
# UNIFORM EXPERTS (batch-parallel, proven)
# ═══════════════════════════════════════════════════════════════════════════

class BatchedNanoExperts(nn.Module):
    """All experts same size — batch GEMM for speed."""
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
        self.ff_dims = [ff_dim] * n_experts

    def forward(self, x):
        h = F.gelu(torch.bmm(x, self.W1) + self.b1)
        h = self.dropout(h)
        return torch.bmm(h, self.W2) + self.b2


# ═══════════════════════════════════════════════════════════════════════════
# HETEROGENEOUS EXPERTS — NOVEL: Different-sized FFN experts
# ═══════════════════════════════════════════════════════════════════════════

class HeterogeneousExperts(nn.Module):
    """
    Each expert has its own ff_dim. Cannot use batch GEMM (different shapes),
    so we use individual forward passes and pad outputs.
    
    NOVEL: Expert size is not arbitrary — it's INFORMATION-THEORETIC.
    Big experts handle complex patterns, small experts handle simple ones.
    """
    def __init__(self, n_experts, d_model, ff_dims, dropout=0.1):
        super().__init__()
        self.n_experts = n_experts
        self.d_model = d_model
        self.ff_dims = ff_dims
        
        self.W1_list = nn.ParameterList()
        self.b1_list = nn.ParameterList()
        self.W2_list = nn.ParameterList()
        self.b2_list = nn.ParameterList()
        self.dropout = nn.Dropout(dropout)
        
        for ff in ff_dims:
            self.W1_list.append(nn.Parameter(
                torch.randn(d_model, ff) * (2/d_model)**0.5))
            self.b1_list.append(nn.Parameter(torch.zeros(ff)))
            self.W2_list.append(nn.Parameter(
                torch.randn(ff, d_model) * (2/ff)**0.5))
            self.b2_list.append(nn.Parameter(torch.zeros(d_model)))
    
    def forward(self, x):
        """
        x: (n_experts, tokens, d_model) — expanded input
        Returns: (n_experts, tokens, d_model)
        """
        results = []
        for e in range(self.n_experts):
            xe = x[e]  # (tokens, d_model)
            h = F.gelu(xe @ self.W1_list[e] + self.b1_list[e])
            h = self.dropout(h)
            out = h @ self.W2_list[e] + self.b2_list[e]
            results.append(out)
        return torch.stack(results)  # (n_experts, tokens, d_model)


# ═══════════════════════════════════════════════════════════════════════════
# ROUTERS
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
        probs = F.softmax(logits, dim=-1)
        top1_idx = topk_idx[:, :, 0]
        mask = F.one_hot(top1_idx, self.n_experts).float()
        f = mask.mean(dim=(0, 1))
        P = probs.mean(dim=(0, 1))
        aux_loss = self.n_experts * (f * P).sum()
        return weights, topk_idx, aux_loss


class ChromaticRouterK4(nn.Module):
    """Chromatic K=4 router (best from test_22)."""
    def __init__(self, d_model, n_experts, top_k=2, noise_std=0.1, n_channels=4, eps=1e-8):
        super().__init__()
        self.n_experts = n_experts
        self.top_k = min(top_k, n_experts)
        self.noise_std = noise_std
        self.n_channels = n_channels
        self.eps = eps
        
        self.W_c = nn.Linear(d_model, 3 * n_channels, bias=True)
        
        # Expert positions: K channels × E experts × 3 dims (log-space)
        all_pts = []
        for ch in range(n_channels):
            torch.manual_seed(42 + ch * 137)
            pts = torch.rand(n_experts, 3) + 0.1
            pts = pts / pts.sum(dim=1, keepdim=True)
            all_pts.append(pts.log())
        self.expert_log_positions = nn.Parameter(torch.stack(all_pts))
        self.expert_bias = nn.Parameter(torch.zeros(n_experts))
        self.log_temperature = nn.Parameter(torch.zeros(n_channels))
    
    def get_expert_positions(self):
        return F.softmax(self.expert_log_positions[0], dim=1)
    
    def get_all_positions(self):
        return F.softmax(self.expert_log_positions, dim=2)
    
    def forward(self, x):
        B, T, D = x.shape
        rby_logits = self.W_c(x).reshape(B, T, self.n_channels, 3)
        token_rby = F.softmax(rby_logits, dim=-1)
        all_pos = self.get_all_positions()
        
        flat_rby = token_rby.reshape(B * T, self.n_channels, 3)
        
        # Multi-channel Aitchison distances
        x_clr = flat_rby.clamp(min=self.eps).log()
        x_clr = x_clr - x_clr.mean(dim=-1, keepdim=True)
        y_clr = all_pos.clamp(min=self.eps).log()
        y_clr = y_clr - y_clr.mean(dim=-1, keepdim=True)
        
        diff = x_clr.unsqueeze(2) - y_clr.unsqueeze(0)
        per_ch_dist = diff.pow(2).sum(dim=-1).sqrt()
        temps = self.log_temperature.exp().clamp(min=0.1, max=10.0)
        scaled = per_ch_dist / temps.unsqueeze(0).unsqueeze(2)
        dists = scaled.sum(dim=1)
        
        scores = (-dists + self.expert_bias.unsqueeze(0)).reshape(B, T, self.n_experts)
        
        if self.training and self.noise_std > 0:
            scores = scores + torch.randn_like(scores) * self.noise_std
        
        topk_vals, topk_idx = scores.topk(self.top_k, dim=-1)
        weights = F.softmax(topk_vals, dim=-1)
        
        probs = F.softmax(scores, dim=-1)
        top1_idx = topk_idx[:, :, 0]
        mask_oh = F.one_hot(top1_idx, self.n_experts).float()
        f = mask_oh.mean(dim=(0, 1))
        P = probs.mean(dim=(0, 1))
        aux_loss = self.n_experts * (f * P).sum()
        
        return weights, topk_idx, aux_loss


# ═══════════════════════════════════════════════════════════════════════════
# MoE BLOCK (supports both expert types)
# ═══════════════════════════════════════════════════════════════════════════

class MoEBlock(nn.Module):
    def __init__(self, d_model, n_heads, n_experts, ff_dims, top_k=2,
                 router_type="standard", dropout=0.1):
        """
        ff_dims: either int (uniform) or list of ints (heterogeneous)
        """
        super().__init__()
        self.ln1 = nn.LayerNorm(d_model)
        self.attn = CausalSelfAttention(d_model, n_heads, dropout)
        self.ln2 = nn.LayerNorm(d_model)
        
        if router_type == "chromatic":
            self.router = ChromaticRouterK4(d_model, n_experts, top_k)
        else:
            self.router = StandardRouter(d_model, n_experts, top_k)
        
        if isinstance(ff_dims, list):
            self.experts = HeterogeneousExperts(n_experts, d_model, ff_dims, dropout)
            self.is_heterogeneous = True
        else:
            self.experts = BatchedNanoExperts(n_experts, d_model, ff_dims, dropout)
            self.is_heterogeneous = False
        
        self.n_experts = n_experts
        self.d_model = d_model

    def forward(self, x):
        B, T, D = x.shape
        x = x + self.attn(self.ln1(x))
        residual = x
        normed = self.ln2(x)
        weights, indices, aux_loss = self.router(normed)
        
        flat = normed.reshape(B*T, D).unsqueeze(0).expand(self.n_experts, -1, -1)
        all_out = self.experts(flat)
        all_out = all_out.permute(1, 0, 2).reshape(B, T, self.n_experts, D)
        idx_exp = indices.unsqueeze(-1).expand(-1, -1, -1, D)
        selected = all_out.gather(2, idx_exp)
        out = (selected * weights.unsqueeze(-1)).sum(dim=2)
        return residual + out, aux_loss


class NanoMoEStack(nn.Module):
    def __init__(self, vocab, d_model, n_heads, n_layers, n_experts, ff_dims,
                 top_k=2, router_type="standard", dropout=0.1):
        super().__init__()
        self.d_model = d_model
        self.n_layers = n_layers
        self.n_experts = n_experts
        self.top_k = top_k
        self.router_type = router_type
        
        self.tok_emb = nn.Embedding(vocab, d_model)
        self.pos_emb = nn.Embedding(SEQ_LEN, d_model)
        self.drop = nn.Dropout(dropout)
        self.blocks = nn.ModuleList([
            MoEBlock(d_model, n_heads, n_experts, ff_dims, top_k, router_type, dropout)
            for _ in range(n_layers)
        ])
        self.ln = nn.LayerNorm(d_model)
        self.head = nn.Linear(d_model, vocab)
        
        # Store ff_dims info
        if isinstance(ff_dims, list):
            self.ff_dims_info = ff_dims
        else:
            self.ff_dims_info = [ff_dims] * n_experts
    
    def forward(self, x):
        B, T = x.shape
        x = self.drop(self.tok_emb(x) + self.pos_emb(torch.arange(T, device=x.device)))
        total_aux = 0.0
        for block in self.blocks:
            x, aux = block(x)
            total_aux += aux
        return self.head(self.ln(x)), total_aux


# ═══════════════════════════════════════════════════════════════════════════
# EXPERT SIZE ALLOCATION STRATEGIES
# ═══════════════════════════════════════════════════════════════════════════

def allocate_uniform(n_experts, target_ff_sum):
    """All experts same size."""
    ff = target_ff_sum // n_experts
    return [ff] * n_experts


def allocate_random(n_experts, target_ff_sum, seed=42):
    """Random sizes, constrained to match total param budget."""
    rng = np.random.RandomState(seed)
    # Sample from a distribution and normalize
    raw = rng.dirichlet(np.ones(n_experts) * 2)
    ff_dims = (raw * target_ff_sum).astype(int)
    ff_dims = np.clip(ff_dims, 32, None)  # minimum 32
    # Adjust to hit target sum
    diff = target_ff_sum - ff_dims.sum()
    ff_dims[np.argmax(ff_dims)] += diff
    return ff_dims.tolist()


def allocate_rby_guided(n_experts, target_ff_sum, d_model=64):
    """
    NOVEL: Expert size determined by RBY position.
    Blue = cognition = BIGGER (deep reasoning needs capacity)
    Yellow = execution = SMALLER (quick output, less capacity needed)
    Red = perception = MEDIUM (moderate processing)
    
    Uses the initial positions of a chromatic router (pre-training).
    """
    # Initialize positions deterministically (same as ChromaticRouterK4 channel 0)
    torch.manual_seed(42)
    pts = torch.rand(n_experts, 3) + 0.1
    pts = pts / pts.sum(dim=1, keepdim=True)
    
    # Blue component determines size weight
    # Blue → bigger, Yellow → smaller, Red → medium
    blue = pts[:, 1].numpy()  # B channel
    yellow = pts[:, 2].numpy()  # Y channel
    
    # Size weight: high Blue = big, high Yellow = small
    size_weight = blue - 0.3 * yellow + 0.5  # shift so always positive
    size_weight = np.clip(size_weight, 0.3, 2.0)
    
    # Normalize to target total
    ff_dims = (size_weight / size_weight.sum() * target_ff_sum).astype(int)
    ff_dims = np.clip(ff_dims, 32, None)
    diff = target_ff_sum - ff_dims.sum()
    ff_dims[np.argmax(ff_dims)] += diff
    
    return ff_dims.tolist()


def allocate_gradient(n_experts, target_ff_sum):
    """
    Graduated sizes: 2 big, 2 medium-big, 2 medium-small, 2 small.
    Like a galaxy with different star sizes.
    """
    # Geometric progression
    ratios = np.array([2.0, 1.7, 1.4, 1.2, 0.9, 0.7, 0.5, 0.4])[:n_experts]
    ff_dims = (ratios / ratios.sum() * target_ff_sum).astype(int)
    ff_dims = np.clip(ff_dims, 32, None)
    diff = target_ff_sum - ff_dims.sum()
    ff_dims[np.argmax(ff_dims)] += diff
    return ff_dims.tolist()


# ═══════════════════════════════════════════════════════════════════════════
# TRAINING + EVALUATION
# ═══════════════════════════════════════════════════════════════════════════

def count_params(model):
    return sum(p.numel() for p in model.parameters())

def count_expert_params(model):
    return sum(p.numel() for n, p in model.named_parameters() if 'expert' in n.lower() or 'W1' in n or 'W2' in n)

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
        logits, _ = model(x)
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
    expert_p = count_expert_params(model)
    ff_info = model.ff_dims_info
    print(f"\n  [{name}] {total_p:,} params ({expert_p:,} expert) on {dev}")
    print(f"    ff_dims: {ff_info} (sum={sum(ff_info)}, mean={np.mean(ff_info):.0f})")
    
    optimizer = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=0.01)
    warmup = min(200, steps // 5)
    
    def lr_lambda(step):
        if step < warmup:
            return step / max(warmup, 1)
        return 0.5 * (1 + math.cos(math.pi * (step - warmup) / max(1, steps - warmup)))
    
    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)
    t0 = time.time()
    total_tokens = 0
    
    for step in range(1, steps + 1):
        model.train()
        x, y = get_batch(data["train"], BATCH_SIZE, dev)
        logits, aux = model(x)
        loss = F.cross_entropy(logits.reshape(-1, logits.shape[-1]), y.reshape(-1))
        loss = loss + AUX_WEIGHT * aux
        
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        scheduler.step()
        total_tokens += BATCH_SIZE * SEQ_LEN
        
        if step % 500 == 0 or step == steps:
            elapsed = time.time() - t0
            m = evaluate(model, data["val"], dev, n_batches=10)
            print(f"    [{name}] Step {step:5d} | ppl={m['ppl']:.2f} "
                  f"acc={m['acc']*100:.1f}% bpc={m['bpc']:.3f} | "
                  f"{total_tokens/elapsed:.0f} tok/s")
    
    test_m = evaluate(model, data["test"], dev)
    elapsed = time.time() - t0
    
    peak_vram = 0
    if "cuda" in dev:
        peak_vram = torch.cuda.max_memory_allocated(int(dev.split(":")[1])) / 1024**2
    
    result = {
        "name": name,
        "params": total_p,
        "expert_params": expert_p,
        "ff_dims": ff_info,
        "ff_dim_std": float(np.std(ff_info)),
        "test_ppl": test_m["ppl"],
        "test_acc": test_m["acc"],
        "test_bpc": test_m["bpc"],
        "test_loss": test_m["loss"],
        "time_s": elapsed,
        "peak_vram_mb": peak_vram,
    }
    
    del model, optimizer
    cuda_cleanup(dev)
    return result


# ═══════════════════════════════════════════════════════════════════════════
# ANALYSIS
# ═══════════════════════════════════════════════════════════════════════════

def print_results(results):
    print(f"\n{'='*70}")
    print(f"RESULTS COMPARISON")
    print(f"{'='*70}")
    
    sorted_r = sorted(results, key=lambda r: r["test_ppl"])
    
    print(f"\n{'Rank':<5} {'Config':<30} {'Params':<10} {'PPL':<8} {'Acc':<8} "
          f"{'BPC':<8} {'FFdim σ':<8} {'Time(s)':<8}")
    print("-" * 90)
    for rank, r in enumerate(sorted_r, 1):
        print(f"{rank:<5} {r['name']:<30} {r['params']:<10,} "
              f"{r['test_ppl']:<8.2f} {r['test_acc']*100:<7.1f}% "
              f"{r['test_bpc']:<8.3f} {r['ff_dim_std']:<8.1f} {r['time_s']:<8.1f}")
    
    # Compare heterogeneous vs uniform
    uniform = next((r for r in results if "Uniform" in r["name"]), None)
    
    print(f"\n{'='*70}")
    print(f"KEY FINDINGS")
    print(f"{'='*70}")
    
    for r in results:
        if r == uniform:
            continue
        if uniform:
            diff = (1 - r["test_ppl"] / uniform["test_ppl"]) * 100
            tag = "★ BETTER" if diff > 0 else ("≈ TIE" if abs(diff) < 1 else "✗ WORSE")
            print(f"\n  {r['name']} vs Uniform:")
            print(f"    Uniform:       PPL={uniform['test_ppl']:.2f}")
            print(f"    {r['name'][:15]+'...':18} PPL={r['test_ppl']:.2f}")
            print(f"    FFdim variance: σ={r['ff_dim_std']:.1f}")
            print(f"    {tag} ({diff:+.1f}%)")
            print(f"    ff_dims: {r['ff_dims']}")
    
    # Speed comparison
    print(f"\n  Speed Impact:")
    for r in results:
        tok_s = BATCH_SIZE * SEQ_LEN * TRAIN_STEPS / r["time_s"]
        print(f"    {r['name'][:25]:<25} {tok_s:,.0f} tok/s  ({r['time_s']:.0f}s)")
    
    return sorted_r


# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    text = download_data()
    data = prepare_data(text)
    V = data["vocab_size"]
    print(f"Data: {len(text):,} chars, {V} vocab")
    print(f"Config: {N_LAYERS}L, {N_EXPERTS}E, d_model={D_MODEL}, top-{TOP_K}")
    print(f"Target ff_dim sum per layer: {TARGET_FF_SUM}")
    
    # Pre-compute all allocations
    ff_uniform = allocate_uniform(N_EXPERTS, TARGET_FF_SUM)
    ff_random = allocate_random(N_EXPERTS, TARGET_FF_SUM)
    ff_rby = allocate_rby_guided(N_EXPERTS, TARGET_FF_SUM, D_MODEL)
    ff_gradient = allocate_gradient(N_EXPERTS, TARGET_FF_SUM)
    
    print(f"\n  Allocation strategies:")
    print(f"    Uniform:     {ff_uniform} (sum={sum(ff_uniform)})")
    print(f"    Random:      {ff_random} (sum={sum(ff_random)})")
    print(f"    RBY-Guided:  {ff_rby} (sum={sum(ff_rby)})")
    print(f"    Gradient:    {ff_gradient} (sum={sum(ff_gradient)})")
    
    all_results = []
    dev0 = "cuda:0" if N_GPUS > 0 else "cpu"
    dev1 = "cuda:1" if N_GPUS > 1 else dev0
    
    # 1. Uniform (batched — fast baseline)
    torch.manual_seed(BASE_SEED)
    model = NanoMoEStack(V, D_MODEL, N_HEADS, N_LAYERS, N_EXPERTS,
                         FF_DIM_UNIFORM, TOP_K, router_type="standard")
    r1 = train_and_eval("Uniform (std router)", model, data, dev0)
    all_results.append(r1)
    
    # 2. Heterogeneous Random
    torch.manual_seed(BASE_SEED)
    model = NanoMoEStack(V, D_MODEL, N_HEADS, N_LAYERS, N_EXPERTS,
                         ff_random, TOP_K, router_type="standard")
    r2 = train_and_eval("Hetero-Random (std)", model, data, dev1)
    all_results.append(r2)
    
    # 3. Heterogeneous Gradient  
    torch.manual_seed(BASE_SEED)
    model = NanoMoEStack(V, D_MODEL, N_HEADS, N_LAYERS, N_EXPERTS,
                         ff_gradient, TOP_K, router_type="standard")
    r3 = train_and_eval("Hetero-Gradient (std)", model, data, dev0)
    all_results.append(r3)
    
    # 4. Heterogeneous RBY-Guided + Chromatic Router (the NOVEL combo)
    torch.manual_seed(BASE_SEED)
    model = NanoMoEStack(V, D_MODEL, N_HEADS, N_LAYERS, N_EXPERTS,
                         ff_rby, TOP_K, router_type="chromatic")
    r4 = train_and_eval("Hetero-RBY (chromatic)", model, data, dev1)
    all_results.append(r4)
    
    # 5. Uniform + Chromatic (to isolate router effect from size effect)
    torch.manual_seed(BASE_SEED)
    model = NanoMoEStack(V, D_MODEL, N_HEADS, N_LAYERS, N_EXPERTS,
                         FF_DIM_UNIFORM, TOP_K, router_type="chromatic")
    r5 = train_and_eval("Uniform (chromatic)", model, data, dev0)
    all_results.append(r5)
    
    # Analysis
    sorted_r = print_results(all_results)
    
    # Save
    output = {
        "test": "test_23_heterogeneous_experts",
        "date": time.strftime("%Y-%m-%d %H:%M:%S"),
        "config": {
            "n_layers": N_LAYERS, "n_experts": N_EXPERTS,
            "d_model": D_MODEL, "top_k": TOP_K, "train_steps": TRAIN_STEPS,
            "target_ff_sum": TARGET_FF_SUM,
        },
        "allocations": {
            "uniform": ff_uniform,
            "random": ff_random,
            "rby_guided": ff_rby,
            "gradient": ff_gradient,
        },
        "results": all_results,
        "ranking": [r["name"] for r in sorted_r],
    }
    
    out_path = os.path.join(os.path.dirname(__file__), "test_23_results.json")
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2, default=str)
    print(f"\nResults saved to {out_path}")
    
    print(f"\n{'='*70}")
    print(f"TEST 23 COMPLETE")
    print(f"{'='*70}")
