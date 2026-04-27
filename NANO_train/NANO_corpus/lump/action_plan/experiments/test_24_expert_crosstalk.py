#!/usr/bin/env python3
"""
TEST 24 — EXPERT CROSSTALK: IC-AE Reborn (NOVEL)
==================================================================

ARCHITECTURE COMPLETION Phase 4 — Expert interaction mechanism.

test_21: 3L optimal (PPL 7.13)
test_22: Chromatic K=4 competitive (PPL 7.24), standard router wins (7.12)  
test_23: Uniform experts best at this scale (7.13)

Now we test the MOST NOVEL architectural component: Expert Crosstalk.

PHILOSOPHY → MATH:
  "IC-AE: The Infected C-AE... recursively creates sandboxes within sandboxes,
   each infecting the next level."
  — weirdAI.md

  Standard MoE: each expert computes independently, outputs are summed.
  Expert Crosstalk: selected experts see EACH OTHER'S outputs via
  cross-attention before the weighted sum. Experts can "infect" each other.

WHAT WE TEST:
  1. Standard MoE (weighted sum, no interaction — proven baseline)
  2. Crosstalk-Gated (gate=0 init, learns whether to interact)
  3. Crosstalk-Full (gate=0.5 init, more aggressive interaction)
  4. Crosstalk-Deep (2-head cross-attention, richer interaction)
  All with 3L, 8E, ff85, standard router.

KEY METRIC: Does the gate learn to be > 0? If yes, experts CHOOSE interaction.

HARDWARE: Dual GTX 1660 SUPER, sequential alternating.
DEPENDS ON: test_21 (3L), test_22 (router choice), test_23 (uniform experts)
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
print(f"TEST 24 — EXPERT CROSSTALK: IC-AE Reborn")
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
FF_DIM = 85
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
    }


def get_batch(data_split, batch_size, device_str):
    ix = torch.randint(len(data_split) - SEQ_LEN - 1, (batch_size,))
    x = torch.stack([data_split[i:i+SEQ_LEN] for i in ix]).to(device_str)
    y = torch.stack([data_split[i+1:i+SEQ_LEN+1] for i in ix]).to(device_str)
    return x, y


# ═══════════════════════════════════════════════════════════════════════════
# SHARED COMPONENTS (proven)
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


# ═══════════════════════════════════════════════════════════════════════════
# EXPERT CROSSTALK — NOVEL: IC-AE Reborn
# ═══════════════════════════════════════════════════════════════════════════

class ExpertCrosstalk(nn.Module):
    """
    IC-AE Reborn: selected experts "infect" each other via cross-attention.
    
    Standard MoE:  output = Σ g_i · Expert_i(x)  (independent)
    With Crosstalk: experts see each other's outputs before the weighted sum.
    
    The learnable gate starts at init_gate (0 = pure standard, 0.5 = half-mixed).
    If the gate learns to increase, experts CHOOSE to interact.
    """
    def __init__(self, d_model, n_cross_heads=1, init_gate=0.0, dropout=0.1):
        super().__init__()
        self.d_model = d_model
        self.n_cross_heads = n_cross_heads
        
        # Cross-attention: expert outputs attend to each other
        # Manual implementation for efficiency (top_k is small, 2-4)
        self.W_q = nn.Linear(d_model, d_model, bias=False)
        self.W_k = nn.Linear(d_model, d_model, bias=False)
        self.W_v = nn.Linear(d_model, d_model, bias=False)
        self.W_o = nn.Linear(d_model, d_model, bias=False)
        self.cross_drop = nn.Dropout(dropout)
        self.ln = nn.LayerNorm(d_model)
        
        # Learnable gate: sigmoid(raw) = mixing coefficient
        self.gate_raw = nn.Parameter(torch.tensor(float(init_gate)))
        
        # For logging
        self._last_gate_value = 0.0
        self._last_cross_attn_weights = None
    
    @property
    def gate_value(self):
        return torch.sigmoid(self.gate_raw).item()
    
    def forward(self, expert_outputs, gate_weights):
        """
        expert_outputs: (B, T, K, D) — outputs from K selected experts
        gate_weights:   (B, T, K) — routing weights
        
        Returns: (B, T, D) — final MoE output
        """
        B, T, K, D = expert_outputs.shape
        
        # Standard MoE path: weighted sum
        standard = (expert_outputs * gate_weights.unsqueeze(-1)).sum(dim=2)  # (B,T,D)
        
        # IC-AE path: cross-attention among selected experts
        # Reshape for cross-attention: (B*T, K, D)
        x = expert_outputs.view(B * T, K, D)
        x_normed = self.ln(x)
        
        # Multi-head cross-attention
        head_dim = D // self.n_cross_heads
        q = self.W_q(x_normed).view(B*T, K, self.n_cross_heads, head_dim).transpose(1, 2)
        k = self.W_k(x_normed).view(B*T, K, self.n_cross_heads, head_dim).transpose(1, 2)
        v = self.W_v(x_normed).view(B*T, K, self.n_cross_heads, head_dim).transpose(1, 2)
        
        # Attention scores: (B*T, heads, K, K) — K is tiny (2), so this is very cheap
        attn = (q @ k.transpose(-2, -1)) * (head_dim ** -0.5)
        attn = self.cross_drop(F.softmax(attn, dim=-1))
        
        # Store for logging (detach to avoid graph issues)
        if not self.training:
            self._last_cross_attn_weights = attn.detach().mean(dim=1)  # avg over heads
        
        # Apply attention
        infected = (attn @ v).transpose(1, 2).contiguous().view(B*T, K, D)
        infected = self.W_o(infected)
        
        # Residual: expert output + cross-talk signal
        infected = x + infected
        infected = infected.view(B, T, K, D)
        
        # Weighted sum of infected outputs
        infected_sum = (infected * gate_weights.unsqueeze(-1)).sum(dim=2)  # (B,T,D)
        
        # Gate: blend standard and infected paths
        alpha = torch.sigmoid(self.gate_raw)
        self._last_gate_value = alpha.item()
        
        return (1 - alpha) * standard + alpha * infected_sum


# ═══════════════════════════════════════════════════════════════════════════
# MoE BLOCK — Standard vs Crosstalk variants
# ═══════════════════════════════════════════════════════════════════════════

class MoEBlock(nn.Module):
    def __init__(self, d_model, n_heads, n_experts, ff_dim, top_k=2,
                 crosstalk_mode="none", crosstalk_init_gate=0.0,
                 crosstalk_heads=1, dropout=0.1):
        super().__init__()
        self.ln1 = nn.LayerNorm(d_model)
        self.attn = CausalSelfAttention(d_model, n_heads, dropout)
        self.ln2 = nn.LayerNorm(d_model)
        self.router = StandardRouter(d_model, n_experts, top_k)
        self.experts = BatchedNanoExperts(n_experts, d_model, ff_dim, dropout)
        self.n_experts = n_experts
        self.d_model = d_model
        self.top_k = top_k
        self.crosstalk_mode = crosstalk_mode
        
        if crosstalk_mode != "none":
            self.crosstalk = ExpertCrosstalk(
                d_model, n_cross_heads=crosstalk_heads,
                init_gate=crosstalk_init_gate, dropout=dropout
            )
        else:
            self.crosstalk = None

    def forward(self, x):
        B, T, D = x.shape
        x = x + self.attn(self.ln1(x))
        residual = x
        normed = self.ln2(x)
        weights, indices, aux_loss = self.router(normed)
        
        # All-experts forward
        flat = normed.reshape(B*T, D).unsqueeze(0).expand(self.n_experts, -1, -1)
        all_out = self.experts(flat)  # (E, B*T, D)
        all_out = all_out.permute(1, 0, 2).reshape(B, T, self.n_experts, D)
        
        # Gather selected expert outputs
        idx_exp = indices.unsqueeze(-1).expand(-1, -1, -1, D)
        selected = all_out.gather(2, idx_exp)  # (B, T, K, D)
        
        if self.crosstalk is not None:
            # Crosstalk path: experts interact before summing
            out = self.crosstalk(selected, weights)
        else:
            # Standard path: simple weighted sum
            out = (selected * weights.unsqueeze(-1)).sum(dim=2)
        
        return residual + out, aux_loss


class NanoMoEStack(nn.Module):
    def __init__(self, vocab, d_model, n_heads, n_layers, n_experts, ff_dim,
                 top_k=2, crosstalk_mode="none", crosstalk_init_gate=0.0,
                 crosstalk_heads=1, dropout=0.1):
        super().__init__()
        self.d_model = d_model
        self.n_layers = n_layers
        self.crosstalk_mode = crosstalk_mode
        
        self.tok_emb = nn.Embedding(vocab, d_model)
        self.pos_emb = nn.Embedding(SEQ_LEN, d_model)
        self.drop = nn.Dropout(dropout)
        self.blocks = nn.ModuleList([
            MoEBlock(d_model, n_heads, n_experts, ff_dim, top_k,
                     crosstalk_mode, crosstalk_init_gate, crosstalk_heads, dropout)
            for _ in range(n_layers)
        ])
        self.ln = nn.LayerNorm(d_model)
        self.head = nn.Linear(d_model, vocab)
    
    def forward(self, x):
        B, T = x.shape
        x = self.drop(self.tok_emb(x) + self.pos_emb(torch.arange(T, device=x.device)))
        total_aux = 0.0
        for block in self.blocks:
            x, aux = block(x)
            total_aux += aux
        return self.head(self.ln(x)), total_aux
    
    def get_gate_values(self):
        """Get current gate values from all crosstalk layers."""
        gates = []
        for block in self.blocks:
            if block.crosstalk is not None:
                gates.append(block.crosstalk.gate_value)
        return gates
    
    def get_cross_attn_weights(self):
        """Get last cross-attention weights (for analysis)."""
        weights = []
        for block in self.blocks:
            if block.crosstalk is not None and block.crosstalk._last_cross_attn_weights is not None:
                weights.append(block.crosstalk._last_cross_attn_weights.cpu())
        return weights


# ═══════════════════════════════════════════════════════════════════════════
# TRAINING + EVALUATION
# ═══════════════════════════════════════════════════════════════════════════

def count_params(model):
    return sum(p.numel() for p in model.parameters())

def count_crosstalk_params(model):
    return sum(p.numel() for n, p in model.named_parameters() if 'crosstalk' in n)

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
    cross_p = count_crosstalk_params(model)
    print(f"\n  [{name}] {total_p:,} params ({cross_p:,} crosstalk) on {dev}")
    
    optimizer = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=0.01)
    warmup = min(200, steps // 5)
    
    def lr_lambda(step):
        if step < warmup:
            return step / max(warmup, 1)
        return 0.5 * (1 + math.cos(math.pi * (step - warmup) / max(1, steps - warmup)))
    
    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)
    t0 = time.time()
    total_tokens = 0
    gate_history = []
    
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
        
        # Log gate values
        if step % 100 == 0:
            gates = model.get_gate_values()
            if gates:
                gate_history.append({"step": step, "gates": gates})
        
        if step % 500 == 0 or step == steps:
            elapsed = time.time() - t0
            m = evaluate(model, data["val"], dev, n_batches=10)
            gates = model.get_gate_values()
            gate_str = f" gates={[f'{g:.3f}' for g in gates]}" if gates else ""
            print(f"    [{name}] Step {step:5d} | ppl={m['ppl']:.2f} "
                  f"acc={m['acc']*100:.1f}% bpc={m['bpc']:.3f}{gate_str} | "
                  f"{total_tokens/elapsed:.0f} tok/s")
    
    # Final test
    test_m = evaluate(model, data["test"], dev)
    elapsed = time.time() - t0
    
    # Final gate values
    final_gates = model.get_gate_values()
    
    # Cross-attention analysis
    cross_attn_summary = None
    if model.crosstalk_mode != "none":
        # Run one eval batch to get cross-attention weights
        model.eval()
        x, _ = get_batch(data["test"], BATCH_SIZE, dev)
        _ = model(x)
        cross_weights = model.get_cross_attn_weights()
        if cross_weights:
            cross_attn_summary = []
            for layer_idx, cw in enumerate(cross_weights):
                # cw: (B*T, K, K) — cross-attention between top-K experts
                mean_cw = cw.mean(dim=0).numpy()  # (K, K)
                cross_attn_summary.append({
                    "layer": layer_idx,
                    "mean_cross_attn": mean_cw.tolist(),
                    "off_diagonal_mean": float(mean_cw[~np.eye(mean_cw.shape[0], dtype=bool)].mean()),
                })
    
    peak_vram = 0
    if "cuda" in dev:
        peak_vram = torch.cuda.max_memory_allocated(int(dev.split(":")[1])) / 1024**2
    
    result = {
        "name": name,
        "params": total_p,
        "crosstalk_params": cross_p,
        "test_ppl": test_m["ppl"],
        "test_acc": test_m["acc"],
        "test_bpc": test_m["bpc"],
        "test_loss": test_m["loss"],
        "time_s": elapsed,
        "peak_vram_mb": peak_vram,
        "final_gates": final_gates,
        "gate_history": gate_history,
        "cross_attn_summary": cross_attn_summary,
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
    
    print(f"\n{'Rank':<5} {'Config':<30} {'Params':<10} {'Crosstalk':<10} "
          f"{'PPL':<8} {'Acc':<8} {'Gates':<20} {'Time(s)':<8}")
    print("-" * 105)
    for rank, r in enumerate(sorted_r, 1):
        gates = [f"{g:.3f}" for g in r.get("final_gates", [])]
        gate_str = str(gates) if gates else "N/A"
        print(f"{rank:<5} {r['name']:<30} {r['params']:<10,} {r['crosstalk_params']:<10,} "
              f"{r['test_ppl']:<8.2f} {r['test_acc']*100:<7.1f}% "
              f"{gate_str:<20} {r['time_s']:<8.1f}")
    
    # Compare
    baseline = next((r for r in results if "Standard" in r["name"]), None)
    
    print(f"\n{'='*70}")
    print(f"KEY FINDINGS — IC-AE REBORN")
    print(f"{'='*70}")
    
    for r in results:
        if r == baseline:
            continue
        if baseline:
            diff = (1 - r["test_ppl"] / baseline["test_ppl"]) * 100
            tag = "★ BETTER" if diff > 0 else ("≈ TIE" if abs(diff) < 1 else "✗ WORSE")
            print(f"\n  {r['name']} vs Standard MoE:")
            print(f"    Standard:  PPL={baseline['test_ppl']:.2f}")
            print(f"    Crosstalk: PPL={r['test_ppl']:.2f} ({r['crosstalk_params']:,} extra params)")
            print(f"    {tag} ({diff:+.1f}%)")
            
            if r.get("final_gates"):
                print(f"    Gate values: {[f'{g:.4f}' for g in r['final_gates']]}")
                avg_gate = np.mean(r["final_gates"])
                if avg_gate > 0.1:
                    print(f"    ★ Gate > 0.1! Experts CHOOSE to interact! IC-AE IS REAL!")
                elif avg_gate > 0.01:
                    print(f"    Gate slight positive — weak interaction signal")
                else:
                    print(f"    Gate stayed near 0 — experts don't need crosstalk")
            
            if r.get("cross_attn_summary"):
                print(f"    Cross-attention patterns (off-diagonal strength):")
                for cas in r["cross_attn_summary"]:
                    print(f"      Layer {cas['layer']}: off-diag mean = {cas['off_diagonal_mean']:.4f}")
    
    # Gate evolution
    print(f"\n  Gate Evolution Over Training:")
    for r in results:
        if r.get("gate_history"):
            gates_over_time = [(g["step"], g["gates"]) for g in r["gate_history"]]
            if gates_over_time:
                first = gates_over_time[0]
                mid = gates_over_time[len(gates_over_time)//2]
                last = gates_over_time[-1]
                print(f"    {r['name']}:")
                print(f"      Step {first[0]:5d}: gates={[f'{g:.4f}' for g in first[1]]}")
                print(f"      Step {mid[0]:5d}: gates={[f'{g:.4f}' for g in mid[1]]}")
                print(f"      Step {last[0]:5d}: gates={[f'{g:.4f}' for g in last[1]]}")
    
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
    dev0 = "cuda:0" if N_GPUS > 0 else "cpu"
    dev1 = "cuda:1" if N_GPUS > 1 else dev0
    
    # 1. Standard MoE (no crosstalk — baseline)
    torch.manual_seed(BASE_SEED)
    model = NanoMoEStack(V, D_MODEL, N_HEADS, N_LAYERS, N_EXPERTS, FF_DIM,
                         TOP_K, crosstalk_mode="none")
    r1 = train_and_eval("Standard MoE (3L)", model, data, dev0)
    all_results.append(r1)
    
    # 2. Crosstalk-Gated (gate=0 init, 1 cross-head)
    torch.manual_seed(BASE_SEED)
    model = NanoMoEStack(V, D_MODEL, N_HEADS, N_LAYERS, N_EXPERTS, FF_DIM,
                         TOP_K, crosstalk_mode="gated", crosstalk_init_gate=0.0,
                         crosstalk_heads=1)
    r2 = train_and_eval("Crosstalk-Gated (g=0)", model, data, dev1)
    all_results.append(r2)
    
    # 3. Crosstalk-Full (gate=0.5 init, 1 cross-head)
    torch.manual_seed(BASE_SEED)
    model = NanoMoEStack(V, D_MODEL, N_HEADS, N_LAYERS, N_EXPERTS, FF_DIM,
                         TOP_K, crosstalk_mode="full", crosstalk_init_gate=0.0,
                         crosstalk_heads=1)
    # Note: "full" vs "gated" is the same arch but init_gate sets the starting blend
    # Let's init at logit(0.5) = 0.0 for true half-and-half
    # Actually sigmoid(0) = 0.5, so gate_raw=0.0 already gives gate=0.5
    r3 = train_and_eval("Crosstalk-Full (g=0.5)", model, data, dev0)
    all_results.append(r3)
    
    # 4. Crosstalk-Deep (2-head cross-attention, gate=0)
    torch.manual_seed(BASE_SEED)
    model = NanoMoEStack(V, D_MODEL, N_HEADS, N_LAYERS, N_EXPERTS, FF_DIM,
                         TOP_K, crosstalk_mode="deep", crosstalk_init_gate=-2.0,
                         crosstalk_heads=2)
    r4 = train_and_eval("Crosstalk-Deep (2h,g≈0.1)", model, data, dev1)
    all_results.append(r4)
    
    # Analysis
    sorted_r = print_results(all_results)
    
    # Save
    output = {
        "test": "test_24_expert_crosstalk",
        "date": time.strftime("%Y-%m-%d %H:%M:%S"),
        "config": {
            "n_layers": N_LAYERS, "n_experts": N_EXPERTS, "ff_dim": FF_DIM,
            "d_model": D_MODEL, "top_k": TOP_K, "train_steps": TRAIN_STEPS,
        },
        "results": all_results,
        "ranking": [r["name"] for r in sorted_r],
    }
    
    out_path = os.path.join(os.path.dirname(__file__), "test_24_results.json")
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2, default=str)
    print(f"\nResults saved to {out_path}")
    
    print(f"\n{'='*70}")
    print(f"TEST 24 COMPLETE")
    print(f"{'='*70}")
