#!/usr/bin/env python3
"""
TEST 25 — TOUCH TENSOR: Deep Specialization Analysis (NOVEL)
==================================================================

ARCHITECTURE COMPLETION Phase 5 — Expert behavior analysis via Touch Tensor.

Previous results:
  test_21: 3L optimal (PPL 7.13)
  test_22: Chromatic K=4 competitive, standard router best
  test_23: Uniform experts optimal at this scale
  test_24: IC-AE gates increase (concept valid), mechanism too expensive

Now we train the best config (3L, 8E, standard router, uniform) with FULL
Touch Tensor logging and analyze:
  1. Expert profiles Φ_e — what does each expert specialize in?
  2. Co-selection matrix C — which expert pairs are chosen together?
  3. Token coverage — any tokens no expert handles well?
  4. Expert redundancy — any two experts doing the same thing?
  5. Routing entropy dynamics — how does load balance evolve?

This is the INTELLIGENCE layer — making the MoE system self-aware.

HARDWARE: Single GPU (analysis-heavy), both GPUs for parallel config.
DEPENDS ON: test_21-24 (best config identification)
"""

import os, sys, time, math, json, gc
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from collections import defaultdict

N_GPUS = torch.cuda.device_count() if torch.cuda.is_available() else 0
print(f"{'='*70}")
print(f"TEST 25 — TOUCH TENSOR: Deep Specialization Analysis")
print(f"{'='*70}")

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
    try:
        text = urllib.request.urlopen(url, timeout=30).read().decode('utf-8')
    except Exception:
        import random
        words = "the and to of a in that is was he for it with as his on be at by".split()
        text = "".join(" ".join(random.choices(words, k=random.randint(5, 20))) + ".\n" for _ in range(60000))[:1_100_000]
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
# TOUCH TENSOR — Full Implementation
# ═══════════════════════════════════════════════════════════════════════════

class TouchTensor:
    """
    Records ALL routing decisions and expert interactions.
    
    Φ_e[expert, char] — how often expert e processes character c
    C[expert_i, expert_j] — how often experts i,j are co-selected
    H[step] — routing entropy over time
    """
    def __init__(self, n_experts, n_layers, vocab_size):
        self.n_experts = n_experts
        self.n_layers = n_layers
        self.vocab_size = vocab_size
        
        # Per-layer, per-expert, per-character touch counts
        self.phi = np.zeros((n_layers, n_experts, vocab_size), dtype=np.float64)
        
        # Per-layer co-selection counts
        self.C = np.zeros((n_layers, n_experts, n_experts), dtype=np.float64)
        
        # Per-layer routing probability history (sampled every N steps)
        self.routing_probs_history = []  # list of (step, layer, probs_array)
        
        # Entropy history
        self.entropy_history = []  # (step, [entropy_per_layer])
        
        # Per-expert loss contribution (how much each expert reduces loss)
        self.expert_loss_contribution = np.zeros((n_layers, n_experts), dtype=np.float64)
        self.expert_loss_count = np.zeros((n_layers, n_experts), dtype=np.float64)
    
    def record_routing(self, layer_idx, input_tokens, topk_indices, routing_probs, step):
        """
        Record a batch of routing decisions.
        
        input_tokens: (B, T) — character indices
        topk_indices: (B, T, K) — which experts were selected
        routing_probs: (B, T, E) — full routing probability distribution
        """
        B, T = input_tokens.shape
        K = topk_indices.shape[2]
        tokens_np = input_tokens.cpu().numpy()
        indices_np = topk_indices.cpu().numpy()
        
        # Update touch profiles
        for b in range(B):
            for t in range(T):
                char_id = tokens_np[b, t]
                for k in range(K):
                    expert_id = indices_np[b, t, k]
                    self.phi[layer_idx, expert_id, char_id] += 1
        
        # Update co-selection matrix
        for b in range(B):
            for t in range(T):
                selected = indices_np[b, t]
                for i in range(K):
                    for j in range(i+1, K):
                        self.C[layer_idx, selected[i], selected[j]] += 1
                        self.C[layer_idx, selected[j], selected[i]] += 1
        
        # Compute and store entropy
        probs_np = routing_probs.detach().cpu().numpy()
        layer_entropy = -(probs_np * np.log(probs_np + 1e-10)).sum(axis=-1).mean()
        return layer_entropy
    
    def record_entropy(self, step, entropies):
        self.entropy_history.append((step, entropies))
    
    def analyze(self, itos):
        """Full analysis of touch tensor data."""
        analysis = {}
        
        for layer in range(self.n_layers):
            layer_analysis = {}
            
            # 1. Expert profiles: which characters does each expert prefer?
            expert_profiles = []
            for e in range(self.n_experts):
                profile = self.phi[layer, e]
                total = profile.sum()
                if total == 0:
                    expert_profiles.append({"expert": e, "top_chars": [], "total_touches": 0})
                    continue
                
                # Normalize to probability
                normalized = profile / total
                # Top 10 characters
                top_indices = np.argsort(normalized)[::-1][:10]
                top_chars = [(itos[idx], float(normalized[idx]), int(profile[idx]))
                             for idx in top_indices]
                
                # Character TYPE breakdown
                char_types = defaultdict(float)
                for idx, prob in enumerate(normalized):
                    c = itos[idx]
                    if c.isalpha() and c.islower():
                        char_types["lowercase"] += prob
                    elif c.isalpha() and c.isupper():
                        char_types["uppercase"] += prob
                    elif c.isspace():
                        char_types["whitespace"] += prob
                    elif c in ".,;:!?'-":
                        char_types["punctuation"] += prob
                    elif c.isdigit():
                        char_types["digit"] += prob
                    else:
                        char_types["other"] += prob
                
                expert_profiles.append({
                    "expert": e,
                    "top_chars": top_chars,
                    "total_touches": int(total),
                    "char_types": dict(char_types),
                })
            
            layer_analysis["expert_profiles"] = expert_profiles
            
            # 2. Co-selection matrix analysis
            C = self.C[layer]
            if C.sum() > 0:
                C_norm = C / (C.sum() + 1e-10)
                # Find strongest pairs
                pairs = []
                for i in range(self.n_experts):
                    for j in range(i+1, self.n_experts):
                        pairs.append((i, j, float(C[i, j])))
                pairs.sort(key=lambda x: -x[2])
                layer_analysis["top_pairs"] = pairs[:5]
                layer_analysis["co_selection_matrix"] = C.tolist()
            
            # 3. Expert similarity (cosine similarity of touch profiles)
            norms = np.linalg.norm(self.phi[layer], axis=1, keepdims=True)
            norms = np.maximum(norms, 1e-10)
            normalized_phi = self.phi[layer] / norms
            similarity = normalized_phi @ normalized_phi.T
            
            # Find most redundant pairs (highest cosine sim)
            redundant_pairs = []
            for i in range(self.n_experts):
                for j in range(i+1, self.n_experts):
                    redundant_pairs.append((i, j, float(similarity[i, j])))
            redundant_pairs.sort(key=lambda x: -x[2])
            layer_analysis["redundant_pairs"] = redundant_pairs[:3]
            layer_analysis["similarity_matrix"] = similarity.tolist()
            
            # 4. Token coverage: which chars are POORLY covered?
            coverage = self.phi[layer].max(axis=0)  # best expert per char
            total_per_char = self.phi[layer].sum(axis=0)
            poorly_covered = []
            for idx in np.argsort(total_per_char)[:10]:
                poorly_covered.append((itos[idx], int(total_per_char[idx])))
            layer_analysis["poorly_covered_chars"] = poorly_covered
            
            analysis[f"layer_{layer}"] = layer_analysis
        
        # 5. Entropy evolution
        analysis["entropy_history"] = self.entropy_history
        
        return analysis


# ═══════════════════════════════════════════════════════════════════════════
# MODEL (proven NanoMoE-3L with routing logging)
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
        self.W1 = nn.Parameter(torch.randn(n_experts, d_model, ff_dim) * (2/d_model)**0.5)
        self.b1 = nn.Parameter(torch.zeros(n_experts, 1, ff_dim))
        self.W2 = nn.Parameter(torch.randn(n_experts, ff_dim, d_model) * (2/ff_dim)**0.5)
        self.b2 = nn.Parameter(torch.zeros(n_experts, 1, d_model))
        self.dropout = nn.Dropout(dropout)

    def forward(self, x):
        h = F.gelu(torch.bmm(x, self.W1) + self.b1)
        return torch.bmm(self.dropout(h), self.W2) + self.b2


class MoEBlockLogged(nn.Module):
    """MoE block with full routing logging for Touch Tensor."""
    def __init__(self, d_model, n_heads, n_experts, ff_dim, top_k=2, dropout=0.1):
        super().__init__()
        self.ln1 = nn.LayerNorm(d_model)
        self.attn = CausalSelfAttention(d_model, n_heads, dropout)
        self.ln2 = nn.LayerNorm(d_model)
        self.gate = nn.Linear(d_model, n_experts, bias=False)
        self.experts = BatchedNanoExperts(n_experts, d_model, ff_dim, dropout)
        self.n_experts = n_experts
        self.d_model = d_model
        self.top_k = top_k
        self.noise_std = 0.1
        
        # Cache for logging
        self._last_topk_idx = None
        self._last_probs = None
    
    def forward(self, x):
        B, T, D = x.shape
        x = x + self.attn(self.ln1(x))
        residual = x
        normed = self.ln2(x)
        
        logits = self.gate(normed)
        if self.training and self.noise_std > 0:
            logits = logits + torch.randn_like(logits) * self.noise_std
        
        probs = F.softmax(logits, dim=-1)
        topk_vals, topk_idx = logits.topk(self.top_k, dim=-1)
        weights = F.softmax(topk_vals, dim=-1)
        
        # Cache for touch tensor
        self._last_topk_idx = topk_idx.detach()
        self._last_probs = probs.detach()
        
        # Aux loss
        top1_idx = topk_idx[:, :, 0]
        mask = F.one_hot(top1_idx, self.n_experts).float()
        f = mask.mean(dim=(0, 1))
        P = probs.mean(dim=(0, 1))
        aux_loss = self.n_experts * (f * P).sum()
        
        flat = normed.reshape(B*T, D).unsqueeze(0).expand(self.n_experts, -1, -1)
        all_out = self.experts(flat)
        all_out = all_out.permute(1, 0, 2).reshape(B, T, self.n_experts, D)
        idx_exp = topk_idx.unsqueeze(-1).expand(-1, -1, -1, D)
        selected = all_out.gather(2, idx_exp)
        out = (selected * weights.unsqueeze(-1)).sum(dim=2)
        
        return residual + out, aux_loss


class NanoMoELogged(nn.Module):
    def __init__(self, vocab, d_model, n_heads, n_layers, n_experts, ff_dim, top_k=2, dropout=0.1):
        super().__init__()
        self.tok_emb = nn.Embedding(vocab, d_model)
        self.pos_emb = nn.Embedding(SEQ_LEN, d_model)
        self.drop = nn.Dropout(dropout)
        self.blocks = nn.ModuleList([
            MoEBlockLogged(d_model, n_heads, n_experts, ff_dim, top_k, dropout)
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


# ═══════════════════════════════════════════════════════════════════════════
# TRAINING WITH FULL TOUCH LOGGING
# ═══════════════════════════════════════════════════════════════════════════

def train_with_touch(model, data, dev, touch, itos, steps=TRAIN_STEPS):
    model.to(dev)
    params = sum(p.numel() for p in model.parameters())
    print(f"  Model: {params:,} params on {dev}")
    
    optimizer = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=0.01)
    warmup = min(200, steps // 5)
    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer,
        lambda s: s/max(warmup,1) if s < warmup else 0.5*(1+math.cos(math.pi*(s-warmup)/max(1,steps-warmup))))
    
    t0 = time.time()
    log_interval = 100  # Log touch every N steps
    
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
        
        # Record touch events periodically
        if step % log_interval == 0:
            entropies = []
            for layer_idx, block in enumerate(model.blocks):
                if block._last_topk_idx is not None:
                    ent = touch.record_routing(
                        layer_idx, x, block._last_topk_idx, block._last_probs, step
                    )
                    entropies.append(float(ent))
            if entropies:
                touch.record_entropy(step, entropies)
        
        if step % 500 == 0 or step == steps:
            elapsed = time.time() - t0
            model.eval()
            with torch.no_grad():
                vx, vy = get_batch(data["val"], BATCH_SIZE, dev)
                vlogits, _ = model(vx)
                vloss = F.cross_entropy(vlogits.reshape(-1, vlogits.shape[-1]), vy.reshape(-1))
                ppl = math.exp(min(vloss.item(), 20))
                acc = (vlogits.argmax(-1) == vy).float().mean().item()
            print(f"    Step {step:5d} | ppl={ppl:.2f} acc={acc*100:.1f}% | "
                  f"entropy={entropies if entropies else 'N/A'}")
    
    # Final evaluation
    model.eval()
    total_loss = 0.0
    total_correct = 0
    total_tokens = 0
    with torch.no_grad():
        for _ in range(EVAL_BATCHES):
            x, y = get_batch(data["test"], BATCH_SIZE, dev)
            logits, _ = model(x)
            loss = F.cross_entropy(logits.reshape(-1, logits.shape[-1]), y.reshape(-1))
            total_correct += (logits.argmax(-1) == y).sum().item()
            total_tokens += y.numel()
            total_loss += loss.item()
    
    avg_loss = total_loss / EVAL_BATCHES
    return {
        "ppl": math.exp(min(avg_loss, 20)),
        "acc": total_correct / total_tokens,
        "bpc": avg_loss / math.log(2),
        "time_s": time.time() - t0,
    }


# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    text = download_data()
    data = prepare_data(text)
    V = data["vocab_size"]
    itos = data["itos"]
    print(f"Data: {len(text):,} chars, {V} vocab")
    
    dev = "cuda:0" if N_GPUS > 0 else "cpu"
    
    # Create Touch Tensor
    touch = TouchTensor(N_EXPERTS, N_LAYERS, V)
    
    # Train with full logging
    torch.manual_seed(BASE_SEED)
    model = NanoMoELogged(V, D_MODEL, N_HEADS, N_LAYERS, N_EXPERTS, FF_DIM, TOP_K)
    metrics = train_with_touch(model, data, dev, touch, itos)
    
    print(f"\n  Test: PPL={metrics['ppl']:.2f} Acc={metrics['acc']*100:.1f}% "
          f"BPC={metrics['bpc']:.3f} Time={metrics['time_s']:.0f}s")
    
    # Full Touch Tensor Analysis
    analysis = touch.analyze(itos)
    
    print(f"\n{'='*70}")
    print(f"TOUCH TENSOR ANALYSIS")
    print(f"{'='*70}")
    
    for layer_key, la in analysis.items():
        if layer_key == "entropy_history":
            continue
        
        print(f"\n  ═══ {layer_key.upper()} ═══")
        
        # Expert profiles
        print(f"\n  Expert Specialization Profiles:")
        for ep in la["expert_profiles"]:
            e = ep["expert"]
            tc = ep["total_touches"]
            ct = ep.get("char_types", {})
            top = ep["top_chars"][:5]
            top_str = " ".join([f"'{c}':{p:.3f}" for c, p, cnt in top])
            type_str = " ".join([f"{k}:{v:.2f}" for k, v in sorted(ct.items(), key=lambda x: -x[1])[:3]])
            print(f"    Expert {e} [{tc:,} touches] → {type_str}")
            print(f"      Top: {top_str}")
        
        # Co-selection pairs
        if "top_pairs" in la:
            print(f"\n  Top Co-Selected Expert Pairs:")
            for i, j, cnt in la["top_pairs"]:
                print(f"    Experts ({i},{j}): {cnt:,.0f} co-selections")
        
        # Redundancy
        if "redundant_pairs" in la:
            print(f"\n  Most Similar Expert Pairs (potential redundancy):")
            for i, j, sim in la["redundant_pairs"]:
                tag = "★ REDUNDANT" if sim > 0.95 else ("⚠ SIMILAR" if sim > 0.9 else "OK")
                print(f"    Experts ({i},{j}): cosine_sim={sim:.4f} {tag}")
        
        # Coverage gaps
        if "poorly_covered_chars" in la:
            print(f"\n  Least-Covered Characters:")
            for c, cnt in la["poorly_covered_chars"][:5]:
                c_repr = repr(c)
                print(f"    {c_repr:10} → {cnt:,} total touches")
    
    # Entropy evolution
    if analysis.get("entropy_history"):
        print(f"\n  ═══ ROUTING ENTROPY EVOLUTION ═══")
        hist = analysis["entropy_history"]
        max_ent = math.log(N_EXPERTS)
        for step, ents in [hist[0], hist[len(hist)//4], hist[len(hist)//2], hist[-1]]:
            ent_str = " ".join([f"L{i}:{e:.3f}/{max_ent:.3f}" for i, e in enumerate(ents)])
            print(f"    Step {step:5d}: {ent_str}")
    
    # Summary statistics
    print(f"\n{'='*70}")
    print(f"SUMMARY")
    print(f"{'='*70}")
    
    # Check specialization: is the variance of touch profiles high?
    for layer in range(N_LAYERS):
        phi_norm = touch.phi[layer] / (touch.phi[layer].sum(axis=1, keepdims=True) + 1e-10)
        # KL divergence between each expert's profile and uniform
        uniform = np.ones(V) / V
        kl_divs = []
        for e in range(N_EXPERTS):
            p = phi_norm[e] + 1e-10
            kl = (p * np.log(p / uniform)).sum()
            kl_divs.append(kl)
        print(f"  Layer {layer} — Expert KL-from-uniform:")
        for e, kl in enumerate(kl_divs):
            bar = "█" * int(kl * 20)
            print(f"    Expert {e}: KL={kl:.4f} {bar}")
        avg_kl = np.mean(kl_divs)
        specialization = "★ SPECIALIZED" if avg_kl > 0.1 else ("⚠ MODERATE" if avg_kl > 0.05 else "✗ UNIFORM")
        print(f"    Average KL: {avg_kl:.4f} → {specialization}")
    
    # Co-selection entropy
    for layer in range(N_LAYERS):
        C_flat = touch.C[layer][np.triu_indices(N_EXPERTS, k=1)]
        if C_flat.sum() > 0:
            C_prob = C_flat / C_flat.sum()
            co_ent = -(C_prob * np.log(C_prob + 1e-10)).sum()
            max_co_ent = math.log(len(C_flat))
            print(f"  Layer {layer} — Co-selection entropy: {co_ent:.3f}/{max_co_ent:.3f} "
                  f"({'balanced' if co_ent > 0.8*max_co_ent else 'clustered'})")
    
    # Save full results
    output = {
        "test": "test_25_touch_tensor",
        "date": time.strftime("%Y-%m-%d %H:%M:%S"),
        "metrics": metrics,
        "config": {"n_layers": N_LAYERS, "n_experts": N_EXPERTS, "ff_dim": FF_DIM,
                   "d_model": D_MODEL, "top_k": TOP_K, "train_steps": TRAIN_STEPS},
        "touch_analysis": {k: v for k, v in analysis.items() if k != "entropy_history"},
        "entropy_history_sample": analysis.get("entropy_history", [])[-5:],
    }
    
    out_path = os.path.join(os.path.dirname(__file__), "test_25_results.json")
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2, default=str)
    print(f"\nResults saved to {out_path}")
    
    print(f"\n{'='*70}")
    print(f"TEST 25 COMPLETE")
    print(f"{'='*70}")
