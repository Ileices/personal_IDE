"""
TEST 26 — COSMIC CYCLES: Expansion → Absularity → Compression → Deposit → Rebirth
==================================================================================
Proves the core lifecycle: train → saturate → prune weak experts → deposit their
knowledge → rebirth with deposited expertise + new random experts → repeat.

3 cosmic cycles of 2000 steps each vs control (6000 steps straight).
Success: Cycle 2 PPL < Cycle 0 PPL AND ≤ control PPL.
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

        # Record routing decisions for touch tensor
        routing_counts = None
        if record_routing:
            routing_counts = torch.zeros(self.n_experts, device=x.device)
            for k_i in range(self.top_k):
                idx = indices[:, k_i]
                routing_counts.scatter_add_(0, idx, torch.ones_like(idx, dtype=torch.float))

        # Batch GEMM
        out = torch.zeros_like(flat)
        for k_i in range(self.top_k):
            idx = indices[:, k_i]
            w = weights[:, k_i].unsqueeze(-1)
            for e_idx in range(self.n_experts):
                mask = (idx == e_idx)
                if mask.any():
                    out[mask] += w[mask] * self.experts[e_idx](flat[mask])

        return residual + out.reshape(B, T, D), routing_counts

class NanoMoECosmic(nn.Module):
    def __init__(self, vocab_size, d_model=64, n_heads=4, n_layers=3,
                 n_experts=8, ff_dim=85, top_k=2, block_size=128, device="cuda:0"):
        super().__init__()
        self.d_model = d_model
        self.block_size = block_size
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


# ── Touch Tensor (Lightweight) ────────────────────────────────────────
class TouchTracker:
    """Lightweight touch counting for compression decisions."""
    def __init__(self, n_layers, n_experts):
        self.n_layers = n_layers
        self.n_experts = n_experts
        self.counts = torch.zeros(n_layers, n_experts)

    def update(self, layer_idx, routing_counts):
        self.counts[layer_idx] += routing_counts.cpu()

    def utilization(self, layer_idx):
        """Per-expert utilization fraction within a layer."""
        total = self.counts[layer_idx].sum()
        if total == 0:
            return torch.ones(self.n_experts) / self.n_experts
        return self.counts[layer_idx] / total

    def reset(self):
        self.counts.zero_()


# ── Deposit ────────────────────────────────────────────────────────────
class Deposit:
    """Stored knowledge from a compressed expert."""
    def __init__(self, layer_idx, expert_idx, weights, utilization, cycle):
        self.layer_idx = layer_idx
        self.expert_idx = expert_idx
        self.weights = weights  # state_dict copy
        self.utilization = utilization
        self.cycle = cycle


# ── Ablation Score ─────────────────────────────────────────────────────
@torch.no_grad()
def ablation_score(model, layer_idx, expert_idx, data, device, n_batches=5):
    """Measure PPL increase when expert is zeroed out."""
    model.eval()

    # Baseline PPL
    total_loss, count = 0.0, 0
    for _ in range(n_batches):
        x, y = get_batch(data, model.block_size, 32, device)
        logits, _ = model(x)
        loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1))
        total_loss += loss.item()
        count += 1
    baseline_ppl = math.exp(total_loss / count)

    # Zero out the expert
    expert = model.moe_layers[layer_idx].experts[expert_idx]
    saved = {k: v.clone() for k, v in expert.state_dict().items()}
    for p in expert.parameters():
        p.zero_()

    # Ablated PPL
    total_loss, count = 0.0, 0
    for _ in range(n_batches):
        x, y = get_batch(data, model.block_size, 32, device)
        logits, _ = model(x)
        loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1))
        total_loss += loss.item()
        count += 1
    ablated_ppl = math.exp(total_loss / count)

    # Restore
    expert.load_state_dict(saved)
    model.train()

    return ablated_ppl - baseline_ppl  # contribution = how much PPL worsens


# ── Compression ────────────────────────────────────────────────────────
def compress_model(model, touch_tracker, data, device, survival_rate=0.5, cycle_num=0):
    """
    Score experts by utilization × contribution.
    Bottom 50% become deposits. Top 50% survive.
    Returns: survivors_mask (per layer), deposits list
    """
    n_layers = len(model.moe_layers)
    n_experts = model.moe_layers[0].n_experts
    deposits = []
    survivors_mask = []

    print(f"    Compression (cycle {cycle_num}):")
    for layer_idx in range(n_layers):
        util = touch_tracker.utilization(layer_idx)
        scores = torch.zeros(n_experts)

        for e_idx in range(n_experts):
            contribution = ablation_score(model, layer_idx, e_idx, data, device)
            scores[e_idx] = util[e_idx].item() * max(contribution, 0.01)

        # Triage
        n_survive = int(n_experts * survival_rate)
        _, sorted_idx = torch.sort(scores, descending=True)
        survive_set = set(sorted_idx[:n_survive].tolist())
        condemned_set = set(sorted_idx[n_survive:].tolist())

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
            deposits.append(dep)

        layer_mask = [e_idx in survive_set for e_idx in range(n_experts)]
        survivors_mask.append(layer_mask)
        survive_ids = [i for i, s in enumerate(layer_mask) if s]
        condemn_ids = [i for i, s in enumerate(layer_mask) if not s]
        print(f"      Layer {layer_idx}: survivors={survive_ids}, "
              f"condemned={condemn_ids}, scores={[f'{s:.4f}' for s in scores.tolist()]}")

    return survivors_mask, deposits


# ── Rebirth ────────────────────────────────────────────────────────────
def rebirth_model(vocab_size, deposits, device, d_model=64, n_heads=4,
                  n_layers=3, n_experts=8, ff_dim=85, top_k=2, block_size=128):
    """
    Create new model. Initialize half the experts from deposits,
    other half random. Shared attention layers start fresh.
    """
    model = NanoMoECosmic(vocab_size, d_model, n_heads, n_layers,
                          n_experts, ff_dim, top_k, block_size, device)

    # Group deposits by layer
    layer_deposits = {}
    for dep in deposits:
        layer_deposits.setdefault(dep.layer_idx, []).append(dep)

    init_count = 0
    for layer_idx in range(n_layers):
        layer_deps = layer_deposits.get(layer_idx, [])
        if not layer_deps:
            continue

        # Sort deposits by utilization (best deposits first)
        layer_deps.sort(key=lambda d: d.utilization, reverse=True)

        # Initialize first N experts from deposits
        n_to_init = min(len(layer_deps), n_experts // 2)
        for i in range(n_to_init):
            model.moe_layers[layer_idx].experts[i].load_state_dict(layer_deps[i].weights)
            init_count += 1

    print(f"    Rebirth: {init_count} experts initialized from deposits, "
          f"rest random. Total deposits available: {len(deposits)}")
    return model


# ── Training Loop ──────────────────────────────────────────────────────
def train_model(model, data, steps, device, lr=3e-4, record_touch=True,
                log_interval=500, label=""):
    """Train and return (final_ppl, touch_tracker, ppl_history)."""
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    touch_tracker = TouchTracker(len(model.moe_layers), model.moe_layers[0].n_experts)
    ppl_history = []
    model.train()

    for step in range(1, steps + 1):
        x, y = get_batch(data, model.block_size, 64, device)
        logits, routing_list = model(x, record_routing=(record_touch and step % 10 == 0))

        loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1))
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()

        if record_touch and step % 10 == 0 and routing_list:
            for li, rc in enumerate(routing_list):
                touch_tracker.update(li, rc)

        if step % log_interval == 0:
            ppl = math.exp(loss.item())
            ppl_history.append({"step": step, "ppl": ppl})
            print(f"      {label} Step {step:5d} | PPL={ppl:.3f}")

    # Final eval
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


# ── Main Experiment ────────────────────────────────────────────────────
def main():
    print("=" * 70)
    print("TEST 26 — COSMIC CYCLES: Expansion → Compression → Deposit → Rebirth")
    print("=" * 70)

    data, vocab_size, stoi, itos = load_shakespeare()
    print(f"Data: {len(data):,} chars, {vocab_size} vocab")

    STEPS_PER_CYCLE = 2000
    NUM_CYCLES = 3
    TOTAL_STEPS = STEPS_PER_CYCLE * NUM_CYCLES  # 6000

    results = {"cycles": [], "control": None}

    # ═══ CONTROL: Standard 6000-step training (no cycles) ═══
    print(f"\n{'─'*70}")
    print(f"CONTROL: Standard {TOTAL_STEPS}-step training (no cycles)")
    print(f"{'─'*70}")
    t0 = time.time()
    control_model = NanoMoECosmic(vocab_size, device=DEVICE_A)
    print(f"  Params: {control_model.count_params():,}")
    control_ppl, _, control_history = train_model(
        control_model, data, TOTAL_STEPS, DEVICE_A,
        log_interval=500, label="Control"
    )
    control_time = time.time() - t0
    print(f"  Control Final PPL: {control_ppl:.4f} ({control_time:.0f}s)")
    results["control"] = {
        "final_ppl": control_ppl,
        "time": control_time,
        "history": control_history,
        "params": control_model.count_params()
    }
    del control_model
    torch.cuda.empty_cache()

    # ═══ COSMIC CYCLES ═══
    print(f"\n{'─'*70}")
    print(f"COSMIC CYCLES: {NUM_CYCLES} cycles × {STEPS_PER_CYCLE} steps")
    print(f"{'─'*70}")

    all_deposits = []
    cycle_device = DEVICE_B  # Alternate GPU

    for cycle in range(NUM_CYCLES):
        t0 = time.time()
        print(f"\n  ═══ CYCLE {cycle} ═══")

        # EXPANSION: Create model (with deposits if available)
        if cycle == 0:
            model = NanoMoECosmic(vocab_size, device=cycle_device)
            print(f"    Expansion: Fresh model, {model.count_params():,} params")
        else:
            model = rebirth_model(vocab_size, all_deposits, cycle_device)
            print(f"    Expansion: Reborn model, {model.count_params():,} params")

        # TRAINING
        cycle_ppl, touch_tracker, history = train_model(
            model, data, STEPS_PER_CYCLE, cycle_device,
            log_interval=500, label=f"Cycle-{cycle}"
        )
        print(f"    Training complete: PPL={cycle_ppl:.4f}")

        # ABSULARITY detection (simplified: just check if entropy is stable)
        # In full system, would check multiple convergence signals

        # COMPRESSION: Score experts, deposit the weak ones
        survivors_mask, new_deposits = compress_model(
            model, touch_tracker, data, cycle_device, survival_rate=0.5, cycle_num=cycle
        )
        all_deposits.extend(new_deposits)

        cycle_time = time.time() - t0
        cycle_result = {
            "cycle": cycle,
            "ppl": cycle_ppl,
            "time": cycle_time,
            "history": history,
            "n_deposits_created": len(new_deposits),
            "total_deposits": len(all_deposits),
            "utilizations": touch_tracker.counts.tolist()
        }
        results["cycles"].append(cycle_result)
        print(f"    Cycle {cycle} complete: PPL={cycle_ppl:.4f}, "
              f"deposits: +{len(new_deposits)}={len(all_deposits)} total, {cycle_time:.0f}s")

        # Cleanup for next cycle
        del model
        torch.cuda.empty_cache()

        # Alternate GPU for next cycle
        cycle_device = DEVICE_A if cycle_device == DEVICE_B else DEVICE_B

    # ═══ ANALYSIS ═══
    print(f"\n{'='*70}")
    print("COSMIC CYCLES ANALYSIS")
    print(f"{'='*70}")

    c0_ppl = results["cycles"][0]["ppl"]
    c2_ppl = results["cycles"][-1]["ppl"]
    ctrl_ppl = results["control"]["final_ppl"]

    print(f"\n  {'Config':<25s} {'PPL':>8s} {'vs Control':>12s}")
    print(f"  {'─'*45}")
    print(f"  {'Control (6000 steps)':<25s} {ctrl_ppl:>8.4f} {'baseline':>12s}")
    for cr in results["cycles"]:
        vs = f"{((cr['ppl'] - ctrl_ppl) / ctrl_ppl * 100):+.2f}%"
        print(f"  {'Cycle ' + str(cr['cycle']) + ' (' + str(STEPS_PER_CYCLE) + ' steps)':<25s} "
              f"{cr['ppl']:>8.4f} {vs:>12s}")

    print(f"\n  Key Metrics:")
    improves = c2_ppl < c0_ppl
    beats_control = c2_ppl <= ctrl_ppl
    ppl_improvement = (c0_ppl - c2_ppl) / c0_ppl * 100
    print(f"    Cycle 2 PPL < Cycle 0 PPL? {improves} "
          f"({c2_ppl:.4f} vs {c0_ppl:.4f}, {ppl_improvement:+.2f}%)")
    print(f"    Cycle 2 PPL ≤ Control PPL? {beats_control} "
          f"({c2_ppl:.4f} vs {ctrl_ppl:.4f})")

    # Check convergence speed: compare Cycle 1 step-500 PPL vs Cycle 0 step-500 PPL
    if len(results["cycles"]) > 1:
        c0_early = results["cycles"][0]["history"][0]["ppl"] if results["cycles"][0]["history"] else None
        c1_early = results["cycles"][1]["history"][0]["ppl"] if results["cycles"][1]["history"] else None
        if c0_early and c1_early:
            faster = c1_early < c0_early
            print(f"    Deposits help early convergence? {faster} "
                  f"(Cycle 1 @500: {c1_early:.3f} vs Cycle 0 @500: {c0_early:.3f})")

    # Total deposits
    print(f"    Total deposits accumulated: {len(all_deposits)}")
    total_cycle_time = sum(cr["time"] for cr in results["cycles"])
    print(f"    Total cycle time: {total_cycle_time:.0f}s vs control: {results['control']['time']:.0f}s")

    results["summary"] = {
        "cycle_2_ppl": c2_ppl,
        "cycle_0_ppl": c0_ppl,
        "control_ppl": ctrl_ppl,
        "improves_across_cycles": improves,
        "beats_control": beats_control,
        "ppl_improvement_pct": ppl_improvement,
        "total_deposits": len(all_deposits)
    }

    # Save
    out_path = Path(__file__).parent / "test_26_results.json"
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nResults saved to {out_path}")

    print(f"\n{'='*70}")
    print("TEST 26 COMPLETE")
    print(f"{'='*70}")


if __name__ == "__main__":
    main()
