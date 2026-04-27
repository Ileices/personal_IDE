"""
TEST 30 — FULL INTEGRATION: The Complete Organism
=================================================
Combines ALL proven components from tests 21-29:

PROVEN (include):
  ✅ 3-layer stacking (test_21: 5.6% gain)
  ✅ Standard linear router (test_22: best PPL, chromatic competitive but 1.7% gap)
  ✅ Uniform expert sizes + batch GEMM (test_23: hetero worse)
  ✅ Touch tensor logging (test_25: experts specialize, deeper=more specialized)
  ✅ Backbone-persistent cosmic cycles (test_26v2: 31.7% improvement across cycles)
  ✅ Adaptive top-k (test_29: same PPL as top-2, 45% fewer experts vs top-4)

MIXED (include carefully):
  ⚠ Chromatic router K=4 (test_22: 1.7% gap but interpretable positions)
  ⚠ Expert crosstalk concept (test_24: gates increase, but mechanism expensive)

NOT PROVEN (skip):
  ✗ Heterogeneous experts (test_23: uniform better)
  ✗ Spectral embedding (test_28: no benefit at char-level)
  ✗ Deposit shield for continual learning (test_27: no forgetting in Shakespeare split)

Comparison:
  (a) Full Integrated NanoMoE with cosmic cycles
  (b) Vanilla NanoMoE (standard top-2, no cycles)
  (c) Dense transformer at same FLOPs

Success: Full > Vanilla > Dense, gap widens vs test_20.
"""

import torch, torch.nn as nn, torch.nn.functional as F
import time, json, math, os, copy, collections
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


# ── Expert ─────────────────────────────────────────────────────────────
class Expert(nn.Module):
    def __init__(self, d_model, ff_dim):
        super().__init__()
        self.w1 = nn.Linear(d_model, ff_dim, bias=False)
        self.w2 = nn.Linear(ff_dim, d_model, bias=False)
    def forward(self, x):
        return self.w2(F.silu(self.w1(x)))


# ── Adaptive MoE Block ────────────────────────────────────────────────
class AdaptiveMoEBlock(nn.Module):
    """
    MoE with adaptive top-k and touch tracking.
    K-predictor learns per-token expert count from router confidence.
    """
    def __init__(self, d_model, n_experts, ff_dim, adaptive=False):
        super().__init__()
        self.n_experts = n_experts
        self.adaptive = adaptive
        self.d_model = d_model
        self.ff_dim = ff_dim

        self.router = nn.Linear(d_model, n_experts, bias=False)
        self.experts = nn.ModuleList([Expert(d_model, ff_dim) for _ in range(n_experts)])
        self.norm = nn.LayerNorm(d_model)

        if adaptive:
            self.k_predictor = nn.Sequential(
                nn.Linear(n_experts, 16), nn.SiLU(), nn.Linear(16, 4)
            )
            self.temperature = nn.Parameter(torch.tensor(1.0))

    def forward(self, x, record_touch=False):
        residual = x
        x = self.norm(x)
        B, T, D = x.shape
        flat = x.reshape(B*T, D)
        logits = self.router(flat)
        probs = F.softmax(logits, dim=-1)

        if self.adaptive:
            temp = F.softplus(self.temperature).clamp(min=0.1)
            k_logits = self.k_predictor(logits.detach())
            k_hard = k_logits.argmax(dim=-1) + 1  # 1-4
            max_k = 4
            weights, indices = torch.topk(probs, max_k, dim=-1)
            weights = weights / weights.sum(dim=-1, keepdim=True)
            k_mask = torch.arange(max_k, device=flat.device).unsqueeze(0) < k_hard.unsqueeze(-1)
            masked_w = weights * k_mask.float()
            masked_w = masked_w / masked_w.sum(dim=-1, keepdim=True).clamp(min=1e-8)

            out = torch.zeros_like(flat)
            for ki in range(max_k):
                idx = indices[:, ki]
                w = masked_w[:, ki].unsqueeze(-1)
                active = k_mask[:, ki]
                if active.any():
                    for e_idx in range(self.n_experts):
                        emask = (idx == e_idx) & active
                        if emask.any():
                            out[emask] += w[emask] * self.experts[e_idx](flat[emask])

            routing_counts = None
            if record_touch:
                routing_counts = torch.zeros(self.n_experts, device=flat.device)
                for ki in range(max_k):
                    active_idx = indices[:, ki][k_mask[:, ki]]
                    routing_counts.scatter_add_(0, active_idx,
                                                torch.ones_like(active_idx, dtype=torch.float))
            avg_k = k_hard.float().mean().item()
        else:
            # Fixed top-2
            top_k = 2
            weights, indices = torch.topk(probs, top_k, dim=-1)
            weights = weights / weights.sum(dim=-1, keepdim=True)
            out = torch.zeros_like(flat)
            for ki in range(top_k):
                idx = indices[:, ki]
                w = weights[:, ki].unsqueeze(-1)
                for e_idx in range(self.n_experts):
                    mask = (idx == e_idx)
                    if mask.any():
                        out[mask] += w[mask] * self.experts[e_idx](flat[mask])
            routing_counts = None
            if record_touch:
                routing_counts = torch.zeros(self.n_experts, device=flat.device)
                for ki in range(top_k):
                    routing_counts.scatter_add_(0, indices[:, ki],
                                                torch.ones_like(indices[:, ki], dtype=torch.float))
            avg_k = float(top_k)

        return residual + out.reshape(B, T, D), routing_counts, avg_k

    def replace_expert(self, expert_idx, new_weights=None):
        new_exp = Expert(self.d_model, self.ff_dim).to(next(self.parameters()).device)
        if new_weights is not None:
            new_exp.load_state_dict(new_weights)
        self.experts[expert_idx] = new_exp
        with torch.no_grad():
            self.router.weight.data[expert_idx] = torch.randn_like(
                self.router.weight.data[expert_idx]) * 0.02


# ── Dense Transformer (baseline) ──────────────────────────────────────
class DenseTransformer(nn.Module):
    def __init__(self, vocab_size, d_model=64, n_heads=4, n_layers=3,
                 ff_dim=256, block_size=128, device="cuda:0"):
        super().__init__()
        self.block_size = block_size
        self.tok_emb = nn.Embedding(vocab_size, d_model)
        self.pos_emb = nn.Embedding(block_size, d_model)
        self.layers = nn.ModuleList()
        for _ in range(n_layers):
            self.layers.append(nn.ModuleDict({
                'attn': nn.MultiheadAttention(d_model, n_heads, batch_first=True),
                'ff': nn.Sequential(
                    nn.LayerNorm(d_model),
                    nn.Linear(d_model, ff_dim), nn.SiLU(),
                    nn.Linear(ff_dim, d_model)
                ),
                'norm': nn.LayerNorm(d_model),
            }))
        self.ln_f = nn.LayerNorm(d_model)
        self.head = nn.Linear(d_model, vocab_size, bias=False)
        self.to(device)

    def forward(self, idx):
        B, T = idx.shape
        h = self.tok_emb(idx) + self.pos_emb(torch.arange(T, device=idx.device))
        mask = nn.Transformer.generate_square_subsequent_mask(T, device=idx.device)
        for layer in self.layers:
            h2, _ = layer['attn'](h, h, h, attn_mask=mask, is_causal=True)
            h = layer['norm'](h + h2)
            h = h + layer['ff'](h)
        return self.head(self.ln_f(h))

    def count_params(self):
        return sum(p.numel() for p in self.parameters())


# ── NanoMoE ────────────────────────────────────────────────────────────
class NanoMoEFull(nn.Module):
    def __init__(self, vocab_size, d_model=64, n_heads=4, n_layers=3,
                 n_experts=8, ff_dim=85, adaptive=False,
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
            self.moe_layers.append(AdaptiveMoEBlock(d_model, n_experts, ff_dim, adaptive))
        self.ln_f = nn.LayerNorm(d_model)
        self.head = nn.Linear(d_model, vocab_size, bias=False)
        self.to(device)
        self._device = device

    def forward(self, idx, record_touch=False):
        B, T = idx.shape
        h = self.tok_emb(idx) + self.pos_emb(torch.arange(T, device=idx.device))
        mask = nn.Transformer.generate_square_subsequent_mask(T, device=idx.device)
        all_routing = []
        avg_ks = []
        for attn, moe in zip(self.attn_layers, self.moe_layers):
            h2, _ = attn(h, h, h, attn_mask=mask, is_causal=True)
            h = h + h2
            h, rc, ak = moe(h, record_touch=record_touch)
            if rc is not None:
                all_routing.append(rc)
            avg_ks.append(ak)
        return self.head(self.ln_f(h)), all_routing, avg_ks

    def count_params(self):
        return sum(p.numel() for p in self.parameters())


# ── Touch Tracker ─────────────────────────────────────────────────────
class TouchTracker:
    def __init__(self, n_layers, n_experts):
        self.counts = torch.zeros(n_layers, n_experts)
    def update(self, layer_idx, routing_counts):
        self.counts[layer_idx] += routing_counts.cpu()
    def utilization(self, layer_idx):
        total = self.counts[layer_idx].sum()
        return self.counts[layer_idx] / max(total, 1) 
    def reset(self):
        self.counts.zero_()


# ── Ablation + Cycling ─────────────────────────────────────────────────
@torch.no_grad()
def ablation_score(model, layer_idx, expert_idx, data, device, n_batches=3):
    model.eval()
    total_loss, count = 0.0, 0
    for _ in range(n_batches):
        x, y = get_batch(data, model.block_size, 32, device)
        logits, _, _ = model(x)
        loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1))
        total_loss += loss.item()
        count += 1
    baseline = math.exp(total_loss / count)

    expert = model.moe_layers[layer_idx].experts[expert_idx]
    saved = {k: v.clone() for k, v in expert.state_dict().items()}
    for p in expert.parameters(): p.zero_()

    total_loss, count = 0.0, 0
    for _ in range(n_batches):
        x, y = get_batch(data, model.block_size, 32, device)
        logits, _, _ = model(x)
        loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1))
        total_loss += loss.item()
        count += 1
    ablated = math.exp(total_loss / count)
    expert.load_state_dict(saved)
    model.train()
    return ablated - baseline


def cycle_experts(model, touch, data, device, deposits):
    n_layers = model.n_layers
    n_experts = model.moe_layers[0].n_experts
    new_deps = []
    for li in range(n_layers):
        util = touch.utilization(li)
        scores = torch.zeros(n_experts)
        for ei in range(n_experts):
            c = ablation_score(model, li, ei, data, device)
            scores[ei] = util[ei].item() * max(c, 0.01)
        
        n_survive = n_experts // 2
        _, sorted_idx = torch.sort(scores, descending=True)
        condemned = sorted_idx[n_survive:].tolist()
        
        layer_deps = [d for d in deposits if d[0] == li]
        layer_deps.sort(key=lambda d: d[2], reverse=True)
        
        for i, eidx in enumerate(condemned):
            expert = model.moe_layers[li].experts[eidx]
            new_deps.append((li, copy.deepcopy(expert.state_dict()), util[eidx].item()))
            if i < len(layer_deps):
                model.moe_layers[li].replace_expert(eidx, layer_deps[i][1])
            else:
                model.moe_layers[li].replace_expert(eidx, None)
    
    return new_deps


# ── Train ──────────────────────────────────────────────────────────────
def train_moe(model, data, steps, device, lr=3e-4, record_touch=True, label="", log_interval=500):
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    touch = TouchTracker(model.n_layers, model.moe_layers[0].n_experts)
    model.train()
    hist = []
    
    for step in range(1, steps + 1):
        x, y = get_batch(data, model.block_size, 64, device)
        logits, routing, avg_ks = model(x, record_touch=(record_touch and step % 10 == 0))
        loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1))
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        
        if record_touch and step % 10 == 0 and routing:
            for li, rc in enumerate(routing):
                touch.update(li, rc)
        
        if step % log_interval == 0:
            ppl = math.exp(loss.item())
            k_str = f" avg_k={sum(avg_ks)/len(avg_ks):.2f}" if avg_ks else ""
            hist.append({"step": step, "ppl": ppl})
            print(f"      {label} Step {step:5d} | PPL={ppl:.3f}{k_str}")
    
    return touch, hist


def train_dense(model, data, steps, device, lr=3e-4, label="", log_interval=500):
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    model.train()
    hist = []
    for step in range(1, steps + 1):
        x, y = get_batch(data, model.block_size, 64, device)
        logits = model(x)
        loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1))
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        if step % log_interval == 0:
            ppl = math.exp(loss.item())
            hist.append({"step": step, "ppl": ppl})
            print(f"      {label} Step {step:5d} | PPL={ppl:.3f}")
    return hist


@torch.no_grad()
def eval_moe(model, data, device, n_batches=30):
    model.eval()
    total_loss, count = 0.0, 0
    total_k = []
    for _ in range(n_batches):
        x, y = get_batch(data, model.block_size, 64, device)
        logits, _, avg_ks = model(x)
        loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1))
        total_loss += loss.item()
        count += 1
        total_k.extend(avg_ks)
    return math.exp(total_loss / count), sum(total_k) / len(total_k) if total_k else 0

@torch.no_grad()
def eval_dense(model, data, device, n_batches=30):
    model.eval()
    total_loss, count = 0.0, 0
    for _ in range(n_batches):
        x, y = get_batch(data, model.block_size, 64, device)
        logits = model(x)
        loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1))
        total_loss += loss.item()
        count += 1
    return math.exp(total_loss / count)


# ── Main ──────────────────────────────────────────────────────────────
def main():
    print("=" * 70)
    print("TEST 30 — FULL INTEGRATION: The Complete Organism")
    print("=" * 70)

    data, vocab_size, stoi, itos = load_shakespeare()
    print(f"Data: {len(data):,} chars, {vocab_size} vocab")

    TOTAL_STEPS = 6000
    STEPS_PER_CYCLE = 2000
    NUM_CYCLES = 3
    results = {}

    # ═══ CONFIG A: Dense Transformer (FLOP-matched baseline) ═══
    print(f"\n{'─'*70}")
    print("CONFIG A: Dense Transformer (FLOP-matched)")
    print(f"{'─'*70}")
    t0 = time.time()
    # ff_dim=170 gives ~330K params to match MoE
    dense = DenseTransformer(vocab_size, ff_dim=170, device=DEVICE_A)
    print(f"  Params: {dense.count_params():,} on {DEVICE_A}")
    dense_hist = train_dense(dense, data, TOTAL_STEPS, DEVICE_A, label="Dense")
    dense_ppl = eval_dense(dense, data, DEVICE_A)
    dense_time = time.time() - t0
    print(f"  Dense Final PPL: {dense_ppl:.4f} ({dense_time:.0f}s)")
    results["Dense"] = {"ppl": dense_ppl, "params": dense.count_params(),
                         "time": dense_time, "history": dense_hist}
    del dense
    torch.cuda.empty_cache()

    # ═══ CONFIG B: Vanilla NanoMoE (standard top-2, no cycles) ═══
    print(f"\n{'─'*70}")
    print("CONFIG B: Vanilla NanoMoE (standard top-2, 6000 continuous)")
    print(f"{'─'*70}")
    t0 = time.time()
    vanilla = NanoMoEFull(vocab_size, adaptive=False, device=DEVICE_B)
    print(f"  Params: {vanilla.count_params():,} on {DEVICE_B}")
    _, vanilla_hist = train_moe(vanilla, data, TOTAL_STEPS, DEVICE_B,
                                record_touch=False, label="Vanilla")
    vanilla_ppl, vanilla_k = eval_moe(vanilla, data, DEVICE_B)
    vanilla_time = time.time() - t0
    print(f"  Vanilla Final PPL: {vanilla_ppl:.4f} avg_k={vanilla_k:.2f} ({vanilla_time:.0f}s)")
    results["Vanilla-MoE"] = {"ppl": vanilla_ppl, "params": vanilla.count_params(),
                               "avg_k": vanilla_k, "time": vanilla_time, "history": vanilla_hist}
    del vanilla
    torch.cuda.empty_cache()

    # ═══ CONFIG C: Full Integrated NanoMoE (adaptive + cosmic cycles) ═══
    print(f"\n{'─'*70}")
    print("CONFIG C: Full Integrated NanoMoE (adaptive top-k + cosmic cycles)")
    print(f"{'─'*70}")
    t0 = time.time()
    full = NanoMoEFull(vocab_size, adaptive=True, device=DEVICE_A)
    print(f"  Params: {full.count_params():,} on {DEVICE_A}")

    deposits = []
    full_hist = []

    for cycle in range(NUM_CYCLES):
        print(f"\n  ═══ CYCLE {cycle} ═══")

        if cycle > 0:
            new_deps = cycle_experts(full, touch, data, DEVICE_A, deposits)
            deposits.extend(new_deps)
            print(f"    Expert cycling: +{len(new_deps)} deposits = {len(deposits)} total")

        touch, hist = train_moe(
            full, data, STEPS_PER_CYCLE, DEVICE_A,
            record_touch=True, label=f"Full-C{cycle}",
            log_interval=500
        )
        # Adjust step numbers
        for h in hist:
            h["step"] += cycle * STEPS_PER_CYCLE
        full_hist.extend(hist)

        c_ppl, c_k = eval_moe(full, data, DEVICE_A)
        print(f"    Cycle {cycle} PPL: {c_ppl:.4f} avg_k={c_k:.2f}")

    full_ppl, full_k = eval_moe(full, data, DEVICE_A)
    full_time = time.time() - t0
    print(f"  Full Final PPL: {full_ppl:.4f} avg_k={full_k:.2f} ({full_time:.0f}s)")
    results["Full-Integrated"] = {
        "ppl": full_ppl, "params": full.count_params(),
        "avg_k": full_k, "time": full_time, "history": full_hist,
        "total_deposits": len(deposits)
    }
    del full
    torch.cuda.empty_cache()

    # ═══ CONFIG D: NanoMoE with adaptive but NO cycles ═══
    print(f"\n{'─'*70}")
    print("CONFIG D: Adaptive NanoMoE (no cycles, 6000 continuous)")
    print(f"{'─'*70}")
    t0 = time.time()
    adapt_only = NanoMoEFull(vocab_size, adaptive=True, device=DEVICE_B)
    print(f"  Params: {adapt_only.count_params():,} on {DEVICE_B}")
    _, adapt_hist = train_moe(adapt_only, data, TOTAL_STEPS, DEVICE_B,
                              record_touch=False, label="Adaptive-Only")
    adapt_ppl, adapt_k = eval_moe(adapt_only, data, DEVICE_B)
    adapt_time = time.time() - t0
    print(f"  Adaptive-Only Final PPL: {adapt_ppl:.4f} avg_k={adapt_k:.2f} ({adapt_time:.0f}s)")
    results["Adaptive-NoCycles"] = {
        "ppl": adapt_ppl, "params": adapt_only.count_params(),
        "avg_k": adapt_k, "time": adapt_time, "history": adapt_hist
    }
    del adapt_only
    torch.cuda.empty_cache()

    # ═══ FINAL ANALYSIS ═══
    print(f"\n{'='*70}")
    print("FULL INTEGRATION ANALYSIS")
    print(f"{'='*70}")

    print(f"\n  {'Config':<25s} {'PPL':>8s} {'Params':>10s} {'Avg K':>8s} {'Time':>8s} {'vs Dense':>10s}")
    print(f"  {'─'*69}")
    dense_ppl_val = results["Dense"]["ppl"]
    for name, r in results.items():
        vs = f"{((r['ppl'] - dense_ppl_val) / dense_ppl_val * 100):+.2f}%" if name != "Dense" else "baseline"
        k_str = f"{r.get('avg_k', 'N/A'):>8}" if isinstance(r.get('avg_k'), float) else f"{'N/A':>8}"
        print(f"  {name:<25s} {r['ppl']:>8.4f} {r['params']:>10,} {k_str} {r['time']:>7.0f}s {vs:>10s}")

    print(f"\n  Key Comparisons:")
    
    moe_vs_dense = (results["Vanilla-MoE"]["ppl"] - dense_ppl_val) / dense_ppl_val * 100
    print(f"    Vanilla MoE vs Dense: {moe_vs_dense:+.2f}%")
    
    full_vs_dense = (results["Full-Integrated"]["ppl"] - dense_ppl_val) / dense_ppl_val * 100
    print(f"    Full Integrated vs Dense: {full_vs_dense:+.2f}%")
    
    full_vs_vanilla = (results["Full-Integrated"]["ppl"] - results["Vanilla-MoE"]["ppl"]) / results["Vanilla-MoE"]["ppl"] * 100
    print(f"    Full Integrated vs Vanilla MoE: {full_vs_vanilla:+.2f}%")
    
    adapt_vs_vanilla = (results["Adaptive-NoCycles"]["ppl"] - results["Vanilla-MoE"]["ppl"]) / results["Vanilla-MoE"]["ppl"] * 100
    print(f"    Adaptive-Only vs Vanilla MoE: {adapt_vs_vanilla:+.2f}%")

    if results["Full-Integrated"].get("avg_k"):
        expert_savings = (1 - results["Full-Integrated"]["avg_k"] / 4.0) * 100
        print(f"    Full system expert efficiency: avg_k={results['Full-Integrated']['avg_k']:.2f} "
              f"({expert_savings:.0f}% fewer experts than top-4)")

    print(f"\n  Verdicts:")
    print(f"    MoE > Dense? {'✓ YES' if results['Vanilla-MoE']['ppl'] < dense_ppl_val else '✗ NO'}")
    print(f"    Full > Vanilla? {'✓ YES' if results['Full-Integrated']['ppl'] < results['Vanilla-MoE']['ppl'] else '✗ NO'}")
    print(f"    Full > Dense? {'✓ YES' if results['Full-Integrated']['ppl'] < dense_ppl_val else '✗ NO'}")

    results["summary"] = {
        "dense_ppl": dense_ppl_val,
        "vanilla_ppl": results["Vanilla-MoE"]["ppl"],
        "full_ppl": results["Full-Integrated"]["ppl"],
        "adaptive_ppl": results["Adaptive-NoCycles"]["ppl"],
        "moe_vs_dense_pct": moe_vs_dense,
        "full_vs_dense_pct": full_vs_dense,
        "full_vs_vanilla_pct": full_vs_vanilla,
    }

    out_path = Path(__file__).parent / "test_30_results.json"
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nResults saved to {out_path}")

    print(f"\n{'='*70}")
    print("TEST 30 COMPLETE — ALL TESTS FINISHED")
    print(f"{'='*70}")


if __name__ == "__main__":
    main()
