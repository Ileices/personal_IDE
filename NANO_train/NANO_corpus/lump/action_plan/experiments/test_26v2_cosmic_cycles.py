"""
TEST 26v2 — COSMIC CYCLES: Backbone-Persistent Expert Cycling
=============================================================
Fix from v1: BACKBONE (attention, embeddings) persists across cycles.
Only EXPERTS get cycled: bottom 50% die → deposit weights → replaced by new experts
(some from deposits, some random). Top 50% survive with their weights.

This matches the philosophy: the "universe" (backbone) persists, 
"organisms" (experts) cycle through birth, life, death, rebirth.

3 cosmic cycles of 2000 steps each vs control (6000 steps straight).
"""

import torch, torch.nn as nn, torch.nn.functional as F
import time, json, math, os, copy, numpy as np
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

# ── Model ──────────────────────────────────────────────────────────────
class Expert(nn.Module):
    def __init__(self, d_model, ff_dim):
        super().__init__()
        self.w1 = nn.Linear(d_model, ff_dim, bias=False)
        self.w2 = nn.Linear(ff_dim, d_model, bias=False)
    def forward(self, x):
        return self.w2(F.silu(self.w1(x)))

class MoEBlock(nn.Module):
    def __init__(self, d_model, n_experts, ff_dim, top_k=2):
        super().__init__()
        self.n_experts = n_experts
        self.top_k = top_k
        self.d_model = d_model
        self.ff_dim = ff_dim
        self.router = nn.Linear(d_model, n_experts, bias=False)
        self.experts = nn.ModuleList([Expert(d_model, ff_dim) for _ in range(n_experts)])
        self.norm = nn.LayerNorm(d_model)

    def forward(self, x, record_routing=False):
        residual = x
        x = self.norm(x)
        B, T, D = x.shape
        flat = x.reshape(B*T, D)
        logits = self.router(flat)
        weights, indices = torch.topk(F.softmax(logits, dim=-1), self.top_k, dim=-1)
        weights = weights / weights.sum(dim=-1, keepdim=True)

        routing_counts = None
        if record_routing:
            routing_counts = torch.zeros(self.n_experts, device=x.device)
            for k_i in range(self.top_k):
                idx = indices[:, k_i]
                routing_counts.scatter_add_(0, idx, torch.ones_like(idx, dtype=torch.float))

        out = torch.zeros_like(flat)
        for k_i in range(self.top_k):
            idx = indices[:, k_i]
            w = weights[:, k_i].unsqueeze(-1)
            for e_idx in range(self.n_experts):
                mask = (idx == e_idx)
                if mask.any():
                    out[mask] += w[mask] * self.experts[e_idx](flat[mask])

        return residual + out.reshape(B, T, D), routing_counts

    def replace_expert(self, expert_idx, new_weights=None):
        """Replace an expert. If new_weights provided, load them; else random init."""
        new_expert = Expert(self.d_model, self.ff_dim).to(next(self.parameters()).device)
        if new_weights is not None:
            new_expert.load_state_dict(new_weights)
        self.experts[expert_idx] = new_expert
        # Reset router weights for this expert to avoid bias toward old expert
        with torch.no_grad():
            self.router.weight.data[expert_idx] = torch.randn_like(self.router.weight.data[expert_idx]) * 0.02

class NanoMoECosmic(nn.Module):
    def __init__(self, vocab_size, d_model=64, n_heads=4, n_layers=3,
                 n_experts=8, ff_dim=85, top_k=2, block_size=128, device="cuda:0"):
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
            self.moe_layers.append(MoEBlock(d_model, n_experts, ff_dim, top_k))

        self.ln_f = nn.LayerNorm(d_model)
        self.head = nn.Linear(d_model, vocab_size, bias=False)
        self.to(device)
        self._device = device

    def forward(self, idx, record_routing=False):
        B, T = idx.shape
        h = self.tok_emb(idx) + self.pos_emb(torch.arange(T, device=idx.device))
        mask = nn.Transformer.generate_square_subsequent_mask(T, device=idx.device)

        all_routing = []
        for attn, moe in zip(self.attn_layers, self.moe_layers):
            h2, _ = attn(h, h, h, attn_mask=mask, is_causal=True)
            h = h + h2
            h, routing = moe(h, record_routing=record_routing)
            if routing is not None:
                all_routing.append(routing)

        return self.head(self.ln_f(h)), all_routing

    def count_params(self):
        return sum(p.numel() for p in self.parameters())


# ── Touch Tracker ─────────────────────────────────────────────────────
class TouchTracker:
    def __init__(self, n_layers, n_experts):
        self.n_layers = n_layers
        self.n_experts = n_experts
        self.counts = torch.zeros(n_layers, n_experts)

    def update(self, layer_idx, routing_counts):
        self.counts[layer_idx] += routing_counts.cpu()

    def utilization(self, layer_idx):
        total = self.counts[layer_idx].sum()
        if total == 0:
            return torch.ones(self.n_experts) / self.n_experts
        return self.counts[layer_idx] / total

    def reset(self):
        self.counts.zero_()


# ── Deposit ────────────────────────────────────────────────────────────
class Deposit:
    def __init__(self, layer_idx, expert_idx, weights, utilization, cycle):
        self.layer_idx = layer_idx
        self.expert_idx = expert_idx
        self.weights = weights
        self.utilization = utilization
        self.cycle = cycle


# ── Ablation Score ─────────────────────────────────────────────────────
@torch.no_grad()
def ablation_score(model, layer_idx, expert_idx, data, device, n_batches=5):
    model.eval()
    total_loss, count = 0.0, 0
    for _ in range(n_batches):
        x, y = get_batch(data, model.block_size, 32, device)
        logits, _ = model(x)
        loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1))
        total_loss += loss.item()
        count += 1
    baseline_ppl = math.exp(total_loss / count)

    expert = model.moe_layers[layer_idx].experts[expert_idx]
    saved = {k: v.clone() for k, v in expert.state_dict().items()}
    for p in expert.parameters():
        p.zero_()

    total_loss, count = 0.0, 0
    for _ in range(n_batches):
        x, y = get_batch(data, model.block_size, 32, device)
        logits, _ = model(x)
        loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1))
        total_loss += loss.item()
        count += 1
    ablated_ppl = math.exp(total_loss / count)

    expert.load_state_dict(saved)
    model.train()
    return ablated_ppl - baseline_ppl


# ── Cycle Expert Replacement ──────────────────────────────────────────
def cycle_experts(model, touch_tracker, data, device, all_deposits, 
                  survival_rate=0.5, cycle_num=0):
    """
    Score experts → bottom 50% die → create deposits → replace with 
    mix of deposit weights and random init. Backbone stays intact.
    """
    n_layers = model.n_layers
    n_experts = model.moe_layers[0].n_experts
    new_deposits = []

    print(f"    Expert Cycling (cycle {cycle_num}):")
    for layer_idx in range(n_layers):
        util = touch_tracker.utilization(layer_idx)
        scores = torch.zeros(n_experts)

        for e_idx in range(n_experts):
            contribution = ablation_score(model, layer_idx, e_idx, data, device)
            scores[e_idx] = util[e_idx].item() * max(contribution, 0.01)

        n_survive = int(n_experts * survival_rate)
        _, sorted_idx = torch.sort(scores, descending=True)
        survive_set = set(sorted_idx[:n_survive].tolist())
        condemned_set = list(sorted_idx[n_survive:].tolist())

        # Create deposits from condemned
        for e_idx in condemned_set:
            expert = model.moe_layers[layer_idx].experts[e_idx]
            dep = Deposit(
                layer_idx=layer_idx,
                expert_idx=e_idx,
                weights=copy.deepcopy(expert.state_dict()),
                utilization=util[e_idx].item(),
                cycle=cycle_num
            )
            new_deposits.append(dep)

        # Get available deposits for this layer (from ALL prior cycles)
        layer_deposits = [d for d in all_deposits if d.layer_idx == layer_idx]
        layer_deposits.sort(key=lambda d: d.utilization, reverse=True)

        # Replace condemned experts: alternate deposit/random
        for i, e_idx in enumerate(condemned_set):
            if i < len(layer_deposits):
                # Use deposit weights
                model.moe_layers[layer_idx].replace_expert(e_idx, layer_deposits[i].weights)
            else:
                # Random init
                model.moe_layers[layer_idx].replace_expert(e_idx, None)

        survive_ids = [i for i, _ in enumerate(range(n_experts)) if i in survive_set]
        print(f"      Layer {layer_idx}: survivors={list(survive_set)}, "
              f"replaced={condemned_set}, scores={[f'{s:.4f}' for s in scores.tolist()]}")

    return new_deposits


# ── Training ──────────────────────────────────────────────────────────
def train_phase(model, data, steps, device, optimizer, lr=3e-4,
                log_interval=500, label="", global_step_offset=0):
    """Train for `steps` using existing optimizer. Returns (ppl, touch, history)."""
    touch_tracker = TouchTracker(model.n_layers, model.moe_layers[0].n_experts)
    ppl_history = []
    model.train()

    for step in range(1, steps + 1):
        x, y = get_batch(data, model.block_size, 64, device)
        logits, routing_list = model(x, record_routing=(step % 10 == 0))

        loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1))
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()

        if step % 10 == 0 and routing_list:
            for li, rc in enumerate(routing_list):
                touch_tracker.update(li, rc)

        if step % log_interval == 0:
            ppl = math.exp(loss.item())
            ppl_history.append({"step": global_step_offset + step, "ppl": ppl})
            print(f"      {label} Step {global_step_offset + step:5d} | PPL={ppl:.3f}")

    # Eval
    model.eval()
    total_loss, count = 0.0, 0
    with torch.no_grad():
        for _ in range(20):
            x, y = get_batch(data, model.block_size, 64, device)
            logits, _ = model(x)
            loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1))
            total_loss += loss.item()
            count += 1
    final_ppl = math.exp(total_loss / count)
    model.train()

    return final_ppl, touch_tracker, ppl_history


# ── Main ──────────────────────────────────────────────────────────────
def main():
    print("=" * 70)
    print("TEST 26v2 — COSMIC CYCLES: Backbone-Persistent Expert Cycling")
    print("=" * 70)

    data, vocab_size, stoi, itos = load_shakespeare()
    print(f"Data: {len(data):,} chars, {vocab_size} vocab")

    STEPS_PER_CYCLE = 2000
    NUM_CYCLES = 3
    TOTAL_STEPS = STEPS_PER_CYCLE * NUM_CYCLES

    results = {"cycles": [], "control": None}

    # ═══ CONTROL ═══
    print(f"\n{'─'*70}")
    print(f"CONTROL: Standard {TOTAL_STEPS}-step continuous training")
    print(f"{'─'*70}")
    t0 = time.time()
    control = NanoMoECosmic(vocab_size, device=DEVICE_A)
    print(f"  Params: {control.count_params():,}")
    ctrl_opt = torch.optim.AdamW(control.parameters(), lr=3e-4)
    ctrl_ppl, _, ctrl_history = train_phase(
        control, data, TOTAL_STEPS, DEVICE_A, ctrl_opt,
        log_interval=500, label="Control"
    )
    ctrl_time = time.time() - t0
    print(f"  Control Final PPL: {ctrl_ppl:.4f} ({ctrl_time:.0f}s)")
    results["control"] = {"final_ppl": ctrl_ppl, "time": ctrl_time,
                          "history": ctrl_history, "params": control.count_params()}
    del control, ctrl_opt
    torch.cuda.empty_cache()

    # ═══ COSMIC CYCLES (Backbone-Persistent) ═══
    print(f"\n{'─'*70}")
    print(f"COSMIC CYCLES (backbone persists, experts cycle)")
    print(f"{'─'*70}")

    # Create model ONCE — never destroy
    model = NanoMoECosmic(vocab_size, device=DEVICE_B)
    print(f"  Model: {model.count_params():,} params on {DEVICE_B}")

    all_deposits = []
    total_t0 = time.time()

    for cycle in range(NUM_CYCLES):
        t0 = time.time()
        print(f"\n  ═══ CYCLE {cycle} ═══")

        if cycle > 0:
            # CYCLE EXPERTS: Replace bottom 50% with deposit/random
            new_deps = cycle_experts(
                model, touch_tracker, data, DEVICE_B,
                all_deposits, survival_rate=0.5, cycle_num=cycle-1
            )
            all_deposits.extend(new_deps)
            print(f"    Deposits: +{len(new_deps)} = {len(all_deposits)} total")

        # Fresh optimizer for this cycle (reset momentum for replaced experts)
        optimizer = torch.optim.AdamW(model.parameters(), lr=3e-4)

        # TRAIN
        cycle_ppl, touch_tracker, history = train_phase(
            model, data, STEPS_PER_CYCLE, DEVICE_B, optimizer,
            log_interval=500, label=f"Cycle-{cycle}",
            global_step_offset=cycle * STEPS_PER_CYCLE
        )
        cycle_time = time.time() - t0
        print(f"    Cycle {cycle} PPL: {cycle_ppl:.4f} ({cycle_time:.0f}s)")

        results["cycles"].append({
            "cycle": cycle, "ppl": cycle_ppl, "time": cycle_time,
            "history": history, "n_deposits": len(all_deposits)
        })

    # Final compression for last cycle 
    new_deps = cycle_experts(
        model, touch_tracker, data, DEVICE_B,
        all_deposits, survival_rate=0.5, cycle_num=NUM_CYCLES-1
    )
    all_deposits.extend(new_deps)

    total_time = time.time() - total_t0

    # ═══ ANALYSIS ═══
    print(f"\n{'='*70}")
    print("ANALYSIS")
    print(f"{'='*70}")

    c0_ppl = results["cycles"][0]["ppl"]
    c2_ppl = results["cycles"][-1]["ppl"]

    print(f"\n  {'Config':<30s} {'PPL':>8s} {'vs Control':>12s}")
    print(f"  {'─'*50}")
    print(f"  {'Control (6000 continuous)':<30s} {ctrl_ppl:>8.4f} {'baseline':>12s}")
    for cr in results["cycles"]:
        vs = f"{((cr['ppl'] - ctrl_ppl) / ctrl_ppl * 100):+.2f}%"
        accum_steps = (cr['cycle'] + 1) * STEPS_PER_CYCLE
        label = f"After Cycle {cr['cycle']} ({accum_steps} steps)"
        print(f"  {label:<30s} {cr['ppl']:>8.4f} {vs:>12s}")

    print(f"\n  Key Metrics:")
    improves = c2_ppl < c0_ppl
    beats_ctrl = c2_ppl <= ctrl_ppl
    improvement = (c0_ppl - c2_ppl) / c0_ppl * 100
    print(f"    Cycle 2 < Cycle 0? {improves} ({c2_ppl:.4f} vs {c0_ppl:.4f}, {improvement:+.1f}%)")
    print(f"    Cycle 2 ≤ Control? {beats_ctrl} ({c2_ppl:.4f} vs {ctrl_ppl:.4f})")

    # Compare control at 2000 steps vs cycle 0 at 2000 steps
    ctrl_at_2k = [h for h in results["control"]["history"] if h["step"] == 2000]
    cyc0_at_2k = [h for h in results["cycles"][0]["history"] if h["step"] == 2000]
    if ctrl_at_2k and cyc0_at_2k:
        print(f"    @ 2000 steps: Control={ctrl_at_2k[0]['ppl']:.3f}, Cycle-0={cyc0_at_2k[0]['ppl']:.3f}")

    # Check if cycle 1 converges faster than cycle 0 (deposits help?)
    if len(results["cycles"]) > 1:
        c0_step500 = [h for h in results["cycles"][0]["history"] if h["step"] == 500]
        c1_step500 = [h for h in results["cycles"][1]["history"] if h["step"] == 2500]
        if c0_step500 and c1_step500:
            faster = c1_step500[0]["ppl"] < c0_step500[0]["ppl"]
            print(f"    Cycle 1 starts better than Cycle 0? {faster} "
                  f"(C1@500: {c1_step500[0]['ppl']:.3f} vs C0@500: {c0_step500[0]['ppl']:.3f})")

    print(f"    Total deposits: {len(all_deposits)}")
    print(f"    Cycle time: {total_time:.0f}s, Control time: {results['control']['time']:.0f}s")

    results["summary"] = {
        "cycle_0_ppl": c0_ppl, "cycle_2_ppl": c2_ppl, "control_ppl": ctrl_ppl,
        "improves": improves, "beats_control": beats_ctrl,
        "improvement_pct": improvement, "total_deposits": len(all_deposits)
    }

    out_path = Path(__file__).parent / "test_26v2_results.json"
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nResults saved to {out_path}")

    print(f"\n{'='*70}")
    print("TEST 26v2 COMPLETE")
    print(f"{'='*70}")

if __name__ == "__main__":
    main()
