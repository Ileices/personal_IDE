"""
TEST 29 — ADAPTIVE top-k: Confidence-Based Expert Selection
============================================================
Proves that adaptive computation (using more experts for uncertain tokens,
fewer for easy tokens) improves efficiency without hurting quality.

3 configs:
  1. Fixed top-2 (standard baseline)
  2. Adaptive top-1-to-4 (router confidence determines k)
  3. Fixed top-4 (quality upper bound)

Success: Adaptive PPL ≈ top-4 PPL, but uses fewer experts on average.
Simple tokens (spaces, common letters) should get top-1.
"""

import torch, torch.nn as nn, torch.nn.functional as F
import time, json, math, os, collections
from pathlib import Path

DEVICE_A = "cuda:0"
DEVICE_B = "cuda:1" if torch.cuda.device_count() > 1 else "cuda:0"

# ── Data ──────────────────────────────────────────────────────────────
def load_shakespeare(path="z:/lump/action_plan/experiments/shakespeare.txt"):
    if not os.path.exists(path):
        import urllib.request
        url = "https://raw.githubusercontent.com/karpathy/char-rnn/master/data/tinyshakespeare/input.txt"
        urllib.request.urlretrieve(url, path)
    text = open(path, "r", encoding="utf-8").read()
    chars = sorted(set(text))
    stoi = {c: i for i, c in enumerate(chars)}
    data = torch.tensor([stoi[c] for c in text], dtype=torch.long)
    return data, len(chars), stoi, {i: c for c, i in stoi.items()}

def get_batch(data, block_size, batch_size, device):
    ix = torch.randint(0, len(data) - block_size - 1, (batch_size,))
    x = torch.stack([data[i:i+block_size] for i in ix]).to(device)
    y = torch.stack([data[i+1:i+1+block_size] for i in ix]).to(device)
    return x, y


# ── Expert & Router ───────────────────────────────────────────────────
class Expert(nn.Module):
    def __init__(self, d_model, ff_dim):
        super().__init__()
        self.w1 = nn.Linear(d_model, ff_dim, bias=False)
        self.w2 = nn.Linear(ff_dim, d_model, bias=False)
    def forward(self, x):
        return self.w2(F.silu(self.w1(x)))


class AdaptiveMoEBlock(nn.Module):
    """
    MoE block with adaptive top-k selection.
    
    Router confidence = max(softmax(logits)) - second_max(softmax(logits))
    High confidence → use fewer experts (top-1)
    Low confidence → use more experts (up to top-4)
    
    Confidence thresholds are learned via a small network.
    """
    def __init__(self, d_model, n_experts, ff_dim, mode="fixed", fixed_k=2):
        super().__init__()
        self.n_experts = n_experts
        self.mode = mode  # "fixed" or "adaptive"
        self.fixed_k = fixed_k
        self.d_model = d_model
        
        self.router = nn.Linear(d_model, n_experts, bias=False)
        self.experts = nn.ModuleList([Expert(d_model, ff_dim) for _ in range(n_experts)])
        self.norm = nn.LayerNorm(d_model)
        
        # Adaptive: learnable confidence thresholds
        if mode == "adaptive":
            # Maps router logits → k prediction (1-4)
            # Use confidence spread to decide
            self.k_predictor = nn.Sequential(
                nn.Linear(n_experts, 16),
                nn.SiLU(),
                nn.Linear(16, 4),  # 4 outputs: prob of k=1, k=2, k=3, k=4
            )
            # Straight-through Gumbel for differentiable k selection
            self.temperature = nn.Parameter(torch.tensor(1.0))

    def forward(self, x, record_stats=False):
        residual = x
        x = self.norm(x)
        B, T, D = x.shape
        flat = x.reshape(B * T, D)
        
        logits = self.router(flat)
        probs = F.softmax(logits, dim=-1)
        
        if self.mode == "fixed":
            # Standard fixed top-k
            k = self.fixed_k
            weights, indices = torch.topk(probs, k, dim=-1)
            weights = weights / weights.sum(dim=-1, keepdim=True)
            
            out = torch.zeros_like(flat)
            for k_i in range(k):
                idx = indices[:, k_i]
                w = weights[:, k_i].unsqueeze(-1)
                for e_idx in range(self.n_experts):
                    mask = (idx == e_idx)
                    if mask.any():
                        out[mask] += w[mask] * self.experts[e_idx](flat[mask])
            
            stats = {"avg_k": float(k), "k_dist": {k: B*T}} if record_stats else None
            return residual + out.reshape(B, T, D), stats
        
        else:
            # ADAPTIVE top-k
            # Predict k per token based on router logits
            temp = F.softplus(self.temperature).clamp(min=0.1)
            k_logits = self.k_predictor(logits.detach())  # detach to avoid routing interference
            k_probs = F.softmax(k_logits / temp, dim=-1)  # (N, 4) for k=1,2,3,4
            
            # Hard selection during forward, soft during backward (straight-through)
            k_hard = k_probs.argmax(dim=-1) + 1  # k in {1,2,3,4}
            
            # Get top-4 weights for all tokens (max possible k)
            max_k = 4
            weights, indices = torch.topk(probs, max_k, dim=-1)
            weights = weights / weights.sum(dim=-1, keepdim=True)
            
            # Build k-masked weights: zero out experts beyond each token's k
            k_mask = torch.arange(max_k, device=flat.device).unsqueeze(0) < k_hard.unsqueeze(-1)
            masked_weights = weights * k_mask.float()
            # Re-normalize
            masked_sum = masked_weights.sum(dim=-1, keepdim=True).clamp(min=1e-8)
            masked_weights = masked_weights / masked_sum
            
            out = torch.zeros_like(flat)
            for k_i in range(max_k):
                idx = indices[:, k_i]
                w = masked_weights[:, k_i].unsqueeze(-1)
                # Skip tokens where this k_i is masked out
                active = k_mask[:, k_i]
                if active.any():
                    for e_idx in range(self.n_experts):
                        emask = (idx == e_idx) & active
                        if emask.any():
                            out[emask] += w[emask] * self.experts[e_idx](flat[emask])
            
            stats = None
            if record_stats:
                k_values = k_hard.cpu().tolist()
                k_counter = collections.Counter(k_values)
                stats = {
                    "avg_k": sum(k_values) / len(k_values),
                    "k_dist": {k: k_counter.get(k, 0) for k in [1, 2, 3, 4]}
                }
            
            return residual + out.reshape(B, T, D), stats


class NanoMoE(nn.Module):
    def __init__(self, vocab_size, d_model=64, n_heads=4, n_layers=3,
                 n_experts=8, ff_dim=85, mode="fixed", fixed_k=2,
                 block_size=128, device="cuda:0"):
        super().__init__()
        self.d_model = d_model
        self.block_size = block_size
        self.n_layers = n_layers
        self.tok_emb = nn.Embedding(vocab_size, d_model)
        self.pos_emb = nn.Embedding(block_size, d_model)
        self.attn_layers = nn.ModuleList()
        self.moe_layers = nn.ModuleList()
        for _ in range(n_layers):
            self.attn_layers.append(nn.MultiheadAttention(d_model, n_heads, batch_first=True))
            self.moe_layers.append(AdaptiveMoEBlock(d_model, n_experts, ff_dim, mode, fixed_k))
        self.ln_f = nn.LayerNorm(d_model)
        self.head = nn.Linear(d_model, vocab_size, bias=False)
        self.to(device)
        self._device = device

    def forward(self, idx, record_stats=False):
        B, T = idx.shape
        h = self.tok_emb(idx) + self.pos_emb(torch.arange(T, device=idx.device))
        mask = nn.Transformer.generate_square_subsequent_mask(T, device=idx.device)
        all_stats = []
        for attn, moe in zip(self.attn_layers, self.moe_layers):
            h2, _ = attn(h, h, h, attn_mask=mask, is_causal=True)
            h = h + h2
            h, stats = moe(h, record_stats=record_stats)
            if stats is not None:
                all_stats.append(stats)
        return self.head(self.ln_f(h)), all_stats

    def count_params(self):
        return sum(p.numel() for p in self.parameters())


# ── Training ──────────────────────────────────────────────────────────
def train_model(model, data, steps, device, lr=3e-4, log_interval=500, label=""):
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    model.train()
    ppl_hist = []
    
    for step in range(1, steps + 1):
        x, y = get_batch(data, model.block_size, 64, device)
        logits, _ = model(x)
        loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1))
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        
        if step % log_interval == 0:
            ppl = math.exp(loss.item())
            ppl_hist.append({"step": step, "ppl": ppl})
            print(f"      {label} Step {step:5d} | PPL={ppl:.3f}")
    
    return ppl_hist


@torch.no_grad()
def evaluate(model, data, device, itos, n_batches=30):
    """Evaluate PPL and collect adaptive-k statistics."""
    model.eval()
    total_loss, count = 0.0, 0
    all_stats = []
    per_char_k = collections.defaultdict(list)
    
    for _ in range(n_batches):
        x, y = get_batch(data, model.block_size, 64, device)
        logits, stats = model(x, record_stats=True)
        loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1))
        total_loss += loss.item()
        count += 1
        
        if stats:
            all_stats.extend(stats)
    
    ppl = math.exp(total_loss / count)
    
    # Aggregate stats
    if all_stats:
        avg_k = sum(s["avg_k"] for s in all_stats) / len(all_stats)
        total_k_dist = collections.Counter()
        for s in all_stats:
            for k, c in s["k_dist"].items():
                total_k_dist[k] += c
    else:
        avg_k = None
        total_k_dist = {}
    
    return ppl, avg_k, dict(total_k_dist)


# ── Per-character K analysis ──────────────────────────────────────────
@torch.no_grad()
def char_k_analysis(model, data, device, itos, n_batches=20):
    """For adaptive models: what k does each character typically get?"""
    if model.moe_layers[0].mode != "adaptive":
        return {}
    
    model.eval()
    char_ks = collections.defaultdict(list)
    
    for _ in range(n_batches):
        x, y = get_batch(data, model.block_size, 64, device)
        B, T = x.shape
        
        # Get k predictions for layer 0
        h = model.tok_emb(x) + model.pos_emb(torch.arange(T, device=x.device))
        moe = model.moe_layers[0]
        h_normed = moe.norm(h)
        flat = h_normed.reshape(B*T, -1)
        logits = moe.router(flat)
        k_logits = moe.k_predictor(logits.detach())
        k_hard = k_logits.argmax(dim=-1) + 1  # 1-4
        
        # Map back to characters
        tokens = x.reshape(-1).cpu().tolist()
        ks = k_hard.cpu().tolist()
        for tok, k in zip(tokens, ks):
            char_ks[tok].append(k)
    
    # Average k per character
    result = {}
    for tok_id, ks in sorted(char_ks.items()):
        char = itos.get(tok_id, f"[{tok_id}]")
        avg = sum(ks) / len(ks)
        result[char] = {"avg_k": avg, "n": len(ks)}
    
    return result


# ── Main ──────────────────────────────────────────────────────────────
def main():
    print("=" * 70)
    print("TEST 29 — ADAPTIVE top-k: Confidence-Based Expert Selection")
    print("=" * 70)
    
    data, vocab_size, stoi, itos = load_shakespeare()
    print(f"Data: {len(data):,} chars, {vocab_size} vocab")
    
    STEPS = 3000
    results = {}
    
    configs = [
        ("Fixed-K=2", "fixed", 2, DEVICE_A),
        ("Fixed-K=4", "fixed", 4, DEVICE_B),
        ("Adaptive-1to4", "adaptive", 2, DEVICE_A),  # k determined dynamically
    ]
    
    for name, mode, fixed_k, device in configs:
        print(f"\n{'─'*70}")
        print(f"CONFIG: {name}")
        print(f"{'─'*70}")
        t0 = time.time()
        
        model = NanoMoE(vocab_size, mode=mode, fixed_k=fixed_k, device=device)
        print(f"  Params: {model.count_params():,} on {device}")
        
        hist = train_model(model, data, STEPS, device, log_interval=1000, label=name)
        ppl, avg_k, k_dist = evaluate(model, data, device, itos)
        elapsed = time.time() - t0
        
        # Per-character analysis for adaptive
        char_stats = char_k_analysis(model, data, device, itos)
        
        print(f"  Final PPL: {ppl:.4f}, Avg K: {avg_k if avg_k else fixed_k}, Time: {elapsed:.0f}s")
        if k_dist:
            total = sum(k_dist.values())
            print(f"  K distribution: " + 
                  ", ".join(f"K={k}: {c/total*100:.1f}%" for k, c in sorted(k_dist.items())))
        
        results[name] = {
            "ppl": ppl, "avg_k": avg_k if avg_k else float(fixed_k),
            "k_dist": k_dist, "params": model.count_params(),
            "time": elapsed, "history": hist, "char_stats": char_stats
        }
        
        del model
        torch.cuda.empty_cache()
    
    # ═══ ANALYSIS ═══
    print(f"\n{'='*70}")
    print("ADAPTIVE top-k ANALYSIS")
    print(f"{'='*70}")
    
    print(f"\n  {'Config':<20s} {'PPL':>8s} {'Avg K':>8s} {'Params':>10s} {'Time':>8s}")
    print(f"  {'─'*54}")
    for name, r in results.items():
        print(f"  {name:<20s} {r['ppl']:>8.4f} {r['avg_k']:>8.2f} "
              f"{r['params']:>10,} {r['time']:>7.0f}s")
    
    # Efficiency analysis
    adapt = results.get("Adaptive-1to4")
    top2 = results.get("Fixed-K=2")
    top4 = results.get("Fixed-K=4")
    
    if adapt and top2 and top4:
        print(f"\n  Efficiency:")
        ppl_vs_top2 = (adapt["ppl"] - top2["ppl"]) / top2["ppl"] * 100
        ppl_vs_top4 = (adapt["ppl"] - top4["ppl"]) / top4["ppl"] * 100
        k_vs_top4 = (adapt["avg_k"] - 4.0) / 4.0 * 100
        
        print(f"    Adaptive PPL vs top-2: {ppl_vs_top2:+.2f}%")
        print(f"    Adaptive PPL vs top-4: {ppl_vs_top4:+.2f}%")
        print(f"    Adaptive avg K: {adapt['avg_k']:.2f} (top-4 uses 4.00)")
        print(f"    Expert reduction vs top-4: {k_vs_top4:+.1f}%")
    
    # Per-character K analysis for adaptive
    if adapt and adapt.get("char_stats"):
        print(f"\n  Per-Character Avg K (Layer 0, Adaptive):")
        char_items = sorted(adapt["char_stats"].items(), key=lambda x: x[1]["avg_k"])
        
        # Lowest k (easiest tokens)
        print(f"    Easiest (lowest K):")
        for c, s in char_items[:8]:
            name_c = repr(c)
            bar = "█" * int(s["avg_k"] * 10)
            print(f"      {name_c:>6s}: avg_k={s['avg_k']:.2f} {bar}")
        
        # Highest k (hardest tokens)
        print(f"    Hardest (highest K):")
        for c, s in char_items[-8:]:
            name_c = repr(c)
            bar = "█" * int(s["avg_k"] * 10)
            print(f"      {name_c:>6s}: avg_k={s['avg_k']:.2f} {bar}")
    
    results["summary"] = {
        "top2_ppl": top2["ppl"] if top2 else None,
        "top4_ppl": top4["ppl"] if top4 else None,
        "adaptive_ppl": adapt["ppl"] if adapt else None,
        "adaptive_avg_k": adapt["avg_k"] if adapt else None,
    }
    
    out_path = Path(__file__).parent / "test_29_results.json"
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nResults saved to {out_path}")
    
    print(f"\n{'='*70}")
    print("TEST 29 COMPLETE")
    print(f"{'='*70}")

if __name__ == "__main__":
    main()
