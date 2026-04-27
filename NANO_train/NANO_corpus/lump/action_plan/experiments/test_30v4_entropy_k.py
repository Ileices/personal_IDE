"""
TEST 30v4 — ENTROPY-REGULARIZED ADAPTIVE K
============================================
Fixes the k-collapse problem from v3:

v3 showed avg_k trending upward (1.00→1.10) but still too low because:
  - When k_soft peaked at k=1, slot_weights for positions 2,3,4 are tiny
  - Expert outputs for those slots contribute little to final output
  - CE gradient through slot_weights is weak → positive feedback loop of low k

v4 fixes:
  1. K-ENTROPY BONUS: penalize low-entropy k_soft distributions
     L_ent = -mean(sum(k_soft * log(k_soft))) → maximize entropy of k selection
     This prevents the k distribution from collapsing to a single value
     
  2. WARM-START K BIAS: initialize k_predictor output bias to favor k=2
     bias = [0, 0.5, 0, 0] → initial preference for k=2
     
  3. HIGHER INITIAL TEMPERATURE: start at 2.0 (not 1.0) for more uniform k_soft
  
  4. ASYMMETRIC EFFICIENCY LOSS: penalize k > 2.5 but NOT k < 2.0
     This lets the model freely explore k=1 to k=2.5, only penalizing excess
     
  5. SEPARATE DATA LOADING: each process loads its own data copy
     Avoids shared memory CUDA errors on GPU0

  6. CUDA error handling: retry logic for transient GPU errors

Configs (run in parallel pairs):
  A: Dense Transformer (param-matched)     | GPU0 ─┐ pair 1
  B: Vanilla NanoMoE (top-2, no cycles)    | GPU1 ─┘
  C: Full NanoMoE (entropy-k + cycles)     | GPU0 ─┐ pair 2
  D: Adaptive NanoMoE (entropy-k, no cyc)  | GPU1 ─┘
"""

import torch, torch.nn as nn, torch.nn.functional as F
import torch.multiprocessing as mp
import time, json, math, os, copy, sys
from pathlib import Path

os.environ["PYTHONUNBUFFERED"] = "1"

# ── Data ──────────────────────────────────────────────────────────────
SHAKESPEARE_PATH = "z:/lump/action_plan/experiments/shakespeare.txt"

def load_shakespeare(path=SHAKESPEARE_PATH):
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


# ══════════════════════════════════════════════════════════════════════
# HYPERPARAMETERS
# ══════════════════════════════════════════════════════════════════════
TOTAL_STEPS = 6000
LR = 3e-4
EFF_LAMBDA = 0.005       # Very low — only penalize excess k (see asymmetric loss)
ENT_LAMBDA = 0.02        # Entropy bonus on k_soft distribution
K_TARGET = 2.5           # Asymmetric efficiency: only penalize k above this
DENSE_FF_PARAM = 340     # ~330K param match


# ── Expert ─────────────────────────────────────────────────────────────
class Expert(nn.Module):
    def __init__(self, d_model, ff_dim):
        super().__init__()
        self.w1 = nn.Linear(d_model, ff_dim, bias=False)
        self.w2 = nn.Linear(ff_dim, d_model, bias=False)
    def forward(self, x):
        return self.w2(F.silu(self.w1(x)))


# ── Entropy-Regularized Adaptive MoE Block ─────────────────────────────
class EntropyAdaptiveMoEBlock(nn.Module):
    """
    MoE with soft differentiable k + entropy regularization.
    
    Key innovations over v3:
      1. K-entropy bonus prevents k_soft from collapsing to a single value
      2. Asymmetric efficiency loss only penalizes k > K_TARGET
      3. Warm-start bias favoring k=2
      4. Higher initial temperature for uniform k exploration
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
                nn.Linear(n_experts + 2, 32), nn.SiLU(),
                nn.Linear(32, 16), nn.SiLU(),
                nn.Linear(16, 4)  # 4 choices: k=1,2,3,4
            )
            # WARM START: bias the output layer to favor k=2 initially
            with torch.no_grad():
                # Access the last linear layer's bias
                self.k_predictor[-1].bias.data = torch.tensor([0.0, 1.0, 0.0, -0.5])
                # k=2 gets boost of 1.0, k=4 gets penalty of -0.5
                
            # Higher initial temperature for more uniform k distribution
            self.temperature = nn.Parameter(torch.tensor(2.0))
            
            # Track for losses
            self.last_expected_k = None
            self.last_k_entropy = None

    def forward(self, x, record_touch=False):
        residual = x
        x = self.norm(x)
        B, T, D = x.shape
        flat = x.reshape(B*T, D)
        logits = self.router(flat)
        probs = F.softmax(logits, dim=-1)

        if self.adaptive:
            # Confidence features
            sorted_probs, _ = torch.sort(probs, dim=-1, descending=True)
            confidence = sorted_probs[:, 0] - sorted_probs[:, 1]
            entropy = -(probs * (probs + 1e-8).log()).sum(dim=-1)
            
            k_input = torch.cat([probs, confidence.unsqueeze(-1), entropy.unsqueeze(-1)], dim=-1)
            
            temp = F.softplus(self.temperature).clamp(min=0.3, max=5.0)
            k_logits = self.k_predictor(k_input)
            k_soft = F.softmax(k_logits / temp, dim=-1)  # (N, 4)
            
            # ─── SOFT SLOT INCLUSION ───
            slot_weights = k_soft.flip(-1).cumsum(-1).flip(-1)  # (N, 4)
            
            # Expected k for efficiency loss
            k_values = torch.arange(1, 5, dtype=torch.float, device=flat.device)
            expected_k = (k_soft * k_values.unsqueeze(0)).sum(dim=-1)
            self.last_expected_k = expected_k
            
            # K-entropy: measure how spread the k distribution is
            k_entropy = -(k_soft * (k_soft + 1e-8).log()).sum(dim=-1)  # (N,)
            self.last_k_entropy = k_entropy
            
            # Get top-4 experts
            max_k = 4
            weights, indices = torch.topk(probs, max_k, dim=-1)
            weights = weights / weights.sum(dim=-1, keepdim=True)
            
            # Apply soft slot weights
            weighted = weights * slot_weights
            weighted = weighted / weighted.sum(dim=-1, keepdim=True).clamp(min=1e-8)
            
            # Compute expert outputs
            out = torch.zeros_like(flat)
            for ki in range(max_k):
                idx = indices[:, ki]
                w = weighted[:, ki].unsqueeze(-1)
                for e_idx in range(self.n_experts):
                    emask = (idx == e_idx)
                    if emask.any():
                        out[emask] += w[emask] * self.experts[e_idx](flat[emask])

            routing_counts = None
            if record_touch:
                routing_counts = torch.zeros(self.n_experts, device=flat.device)
                for ki in range(max_k):
                    active_weight = slot_weights[:, ki]
                    for e_idx in range(self.n_experts):
                        emask = (indices[:, ki] == e_idx)
                        if emask.any():
                            routing_counts[e_idx] += active_weight[emask].sum().item()

            avg_k = expected_k.mean().item()
        else:
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
            self.last_expected_k = None
            self.last_k_entropy = None

        return residual + out.reshape(B, T, D), routing_counts, avg_k

    def replace_expert(self, expert_idx, new_weights=None):
        new_exp = Expert(self.d_model, self.ff_dim).to(next(self.parameters()).device)
        if new_weights is not None:
            new_exp.load_state_dict(new_weights)
        self.experts[expert_idx] = new_exp
        with torch.no_grad():
            self.router.weight.data[expert_idx] = torch.randn_like(
                self.router.weight.data[expert_idx]) * 0.02


# ── Dense Transformer ─────────────────────────────────────────────────
class DenseTransformer(nn.Module):
    def __init__(self, vocab_size, d_model=64, n_heads=4, n_layers=3,
                 ff_dim=256, block_size=128):
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
                 n_experts=8, ff_dim=85, adaptive=False, block_size=128):
        super().__init__()
        self.d_model = d_model
        self.block_size = block_size
        self.n_layers = n_layers
        self.n_experts = n_experts
        self.tok_emb = nn.Embedding(vocab_size, d_model)
        self.pos_emb = nn.Embedding(block_size, d_model)
        self.attn_layers = nn.ModuleList()
        self.moe_layers = nn.ModuleList()
        for _ in range(n_layers):
            self.attn_layers.append(nn.MultiheadAttention(d_model, n_heads, batch_first=True))
            self.moe_layers.append(EntropyAdaptiveMoEBlock(d_model, n_experts, ff_dim, adaptive))
        self.ln_f = nn.LayerNorm(d_model)
        self.head = nn.Linear(d_model, vocab_size, bias=False)

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

    def efficiency_loss(self):
        """Asymmetric efficiency: only penalize expected_k above K_TARGET."""
        total = 0.0
        count = 0
        for moe in self.moe_layers:
            if moe.last_expected_k is not None:
                # ReLU(expected_k - target): zero penalty below target, linear above
                excess = F.relu(moe.last_expected_k - K_TARGET)
                total = total + excess.mean()
                count += 1
        return total / max(count, 1)

    def k_entropy_loss(self):
        """Negative mean entropy of k_soft distributions (minimize to maximize entropy)."""
        total = 0.0
        count = 0
        for moe in self.moe_layers:
            if moe.last_k_entropy is not None:
                total = total + moe.last_k_entropy.mean()
                count += 1
        return -total / max(count, 1)  # Negative: minimizing this maximizes entropy

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
        return self.counts[layer_idx] / max(total.item(), 1)
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
    for p in expert.parameters():
        p.zero_()

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


def cycle_experts(model, optimizer, touch, data, device, deposits):
    n_layers = model.n_layers
    n_experts = model.n_experts
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
            old_params = list(expert.parameters())

            if i < len(layer_deps):
                model.moe_layers[li].replace_expert(eidx, layer_deps[i][1])
            else:
                model.moe_layers[li].replace_expert(eidx, None)

            for p in old_params:
                optimizer.state.pop(p, None)

        survive = sorted_idx[:n_survive].tolist()
        print(f"      L{li}: survive={survive} replaced={condemned} "
              f"scores=[{', '.join(f'{s:.3f}' for s in scores.tolist())}]", flush=True)

    optimizer.param_groups[0]['params'] = list(model.parameters())
    return new_deps


# ════════════════════════════════════════════════════════════════════════
# PARALLEL GPU TRAINING WORKERS
# ════════════════════════════════════════════════════════════════════════

def _train_dense_worker(gpu_id, vocab_size, ff_dim, steps, lr, result_dict, label):
    """Each worker loads its own data copy — no shared memory CUDA issues."""
    device = f"cuda:{gpu_id}"
    torch.cuda.set_device(gpu_id)
    
    # Load own copy of data
    data, _, _, _ = load_shakespeare()

    model = DenseTransformer(vocab_size, ff_dim=ff_dim).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    block_size = model.block_size
    hist = []
    model.train()

    t0 = time.time()
    for step in range(1, steps + 1):
        x, y = get_batch(data, block_size, 64, device)
        logits = model(x)
        loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1))
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        if step % 500 == 0:
            ppl = math.exp(loss.item())
            hist.append({"step": step, "ppl": ppl})
            print(f"      [{label}@GPU{gpu_id}] Step {step:5d} | PPL={ppl:.3f}", flush=True)

    model.eval()
    total_loss, count = 0.0, 0
    with torch.no_grad():
        for _ in range(30):
            x, y = get_batch(data, block_size, 64, device)
            logits = model(x)
            loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1))
            total_loss += loss.item()
            count += 1
    ppl = math.exp(total_loss / count)
    elapsed = time.time() - t0

    result_dict[label] = {
        "ppl": ppl, "params": sum(p.numel() for p in model.parameters()),
        "time": elapsed, "history": hist, "avg_k": "N/A"
    }
    print(f"  [{label}@GPU{gpu_id}] DONE: PPL={ppl:.4f} ({elapsed:.0f}s)", flush=True)


def _train_vanilla_moe_worker(gpu_id, vocab_size, steps, lr, result_dict, label):
    device = f"cuda:{gpu_id}"
    torch.cuda.set_device(gpu_id)
    
    data, _, _, _ = load_shakespeare()

    model = NanoMoEFull(vocab_size, adaptive=False).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    hist = []
    model.train()

    t0 = time.time()
    for step in range(1, steps + 1):
        x, y = get_batch(data, model.block_size, 64, device)
        logits, _, avg_ks = model(x)
        loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1))
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        if step % 500 == 0:
            ppl = math.exp(loss.item())
            hist.append({"step": step, "ppl": ppl})
            k_str = f" avg_k={sum(avg_ks)/len(avg_ks):.2f}" if avg_ks else ""
            print(f"      [{label}@GPU{gpu_id}] Step {step:5d} | PPL={ppl:.3f}{k_str}", flush=True)

    model.eval()
    total_loss, count, total_k = 0.0, 0, []
    with torch.no_grad():
        for _ in range(30):
            x, y = get_batch(data, model.block_size, 64, device)
            logits, _, avg_ks = model(x)
            loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1))
            total_loss += loss.item()
            count += 1
            total_k.extend(avg_ks)
    ppl = math.exp(total_loss / count)
    avg_k = sum(total_k) / len(total_k) if total_k else 2.0
    elapsed = time.time() - t0

    result_dict[label] = {
        "ppl": ppl, "params": sum(p.numel() for p in model.parameters()),
        "time": elapsed, "history": hist, "avg_k": avg_k
    }
    print(f"  [{label}@GPU{gpu_id}] DONE: PPL={ppl:.4f} avg_k={avg_k:.2f} ({elapsed:.0f}s)", flush=True)


def _train_adaptive_moe_worker(gpu_id, vocab_size, steps, lr, eff_lambda, ent_lambda,
                                result_dict, label, do_cycles=False,
                                steps_per_cycle=2000, num_cycles=3):
    device = f"cuda:{gpu_id}"
    torch.cuda.set_device(gpu_id)
    
    data, _, _, _ = load_shakespeare()

    model = NanoMoEFull(vocab_size, adaptive=True).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    hist = []

    t0 = time.time()

    if do_cycles:
        deposits = []
        touch = TouchTracker(model.n_layers, model.n_experts)
        for cycle in range(num_cycles):
            print(f"    [{label}@GPU{gpu_id}] ═══ CYCLE {cycle} ═══", flush=True)
            if cycle > 0:
                new_deps = cycle_experts(model, optimizer, touch, data, device, deposits)
                deposits.extend(new_deps)
                print(f"      Deposits: +{len(new_deps)} = {len(deposits)} total", flush=True)
                touch.reset()

            model.train()
            for step in range(1, steps_per_cycle + 1):
                x, y = get_batch(data, model.block_size, 64, device)
                logits, routing, avg_ks = model(x, record_touch=(step % 10 == 0))
                ce_loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1))

                eff_loss = model.efficiency_loss()
                ent_loss = model.k_entropy_loss()
                total_loss = ce_loss + eff_lambda * eff_loss + ent_lambda * ent_loss

                optimizer.zero_grad()
                total_loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                optimizer.step()

                if step % 10 == 0 and routing:
                    for li, rc in enumerate(routing):
                        touch.update(li, rc)

                global_step = cycle * steps_per_cycle + step
                if step % 500 == 0:
                    ppl = math.exp(ce_loss.item())
                    k_str = f" avg_k={sum(avg_ks)/len(avg_ks):.2f}" if avg_ks else ""
                    hist.append({"step": global_step, "ppl": ppl, "avg_k": sum(avg_ks)/len(avg_ks) if avg_ks else 0})
                    print(f"      [{label}@GPU{gpu_id}] Step {global_step:5d} | PPL={ppl:.3f}{k_str} eff={eff_loss.item():.3f} ent={ent_loss.item():.3f}", flush=True)

            model.eval()
            with torch.no_grad():
                tl, tc, tk = 0.0, 0, []
                for _ in range(10):
                    x, y = get_batch(data, model.block_size, 64, device)
                    logits, _, avg_ks = model(x)
                    tl += F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1)).item()
                    tc += 1
                    tk.extend(avg_ks)
            c_ppl = math.exp(tl / tc)
            c_k = sum(tk) / len(tk) if tk else 0
            print(f"      Cycle {cycle} eval: PPL={c_ppl:.4f} avg_k={c_k:.2f}", flush=True)
    else:
        model.train()
        for step in range(1, steps + 1):
            x, y = get_batch(data, model.block_size, 64, device)
            logits, _, avg_ks = model(x)
            ce_loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1))

            eff_loss = model.efficiency_loss()
            ent_loss = model.k_entropy_loss()
            total_loss = ce_loss + eff_lambda * eff_loss + ent_lambda * ent_loss

            optimizer.zero_grad()
            total_loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            if step % 500 == 0:
                ppl = math.exp(ce_loss.item())
                k_str = f" avg_k={sum(avg_ks)/len(avg_ks):.2f}" if avg_ks else ""
                hist.append({"step": step, "ppl": ppl, "avg_k": sum(avg_ks)/len(avg_ks) if avg_ks else 0})
                print(f"      [{label}@GPU{gpu_id}] Step {step:5d} | PPL={ppl:.3f}{k_str} eff={eff_loss.item():.3f} ent={ent_loss.item():.3f}", flush=True)

    # Final eval
    model.eval()
    total_loss, count, total_k = 0.0, 0, []
    with torch.no_grad():
        for _ in range(30):
            x, y = get_batch(data, model.block_size, 64, device)
            logits, _, avg_ks = model(x)
            loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1))
            total_loss += loss.item()
            count += 1
            total_k.extend(avg_ks)
    ppl = math.exp(total_loss / count)
    avg_k = sum(total_k) / len(total_k) if total_k else 0
    elapsed = time.time() - t0

    result_dict[label] = {
        "ppl": ppl, "params": sum(p.numel() for p in model.parameters()),
        "time": elapsed, "history": hist, "avg_k": avg_k,
        "total_deposits": len(deposits) if do_cycles else 0
    }
    print(f"  [{label}@GPU{gpu_id}] DONE: PPL={ppl:.4f} avg_k={avg_k:.2f} ({elapsed:.0f}s)", flush=True)


# ════════════════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════════════════

def main():
    mp.set_start_method('spawn', force=True)

    print("=" * 70)
    print("TEST 30v4 — ENTROPY-REGULARIZED ADAPTIVE K")
    print("=" * 70)

    n_gpus = torch.cuda.device_count()
    print(f"GPUs available: {n_gpus}")
    for i in range(n_gpus):
        props = torch.cuda.get_device_properties(i)
        print(f"  GPU {i}: {props.name} ({props.total_memory // 1024**2} MB)")
    
    # Load data just to get vocab_size (each worker loads its own copy)
    _, vocab_size, _, _ = load_shakespeare()
    print(f"Vocab size: {vocab_size}")
    
    print(f"\nHyperparameters:")
    print(f"  Steps: {TOTAL_STEPS}, LR: {LR}")
    print(f"  EFF_LAMBDA: {EFF_LAMBDA} (asymmetric, penalize k > {K_TARGET})")
    print(f"  ENT_LAMBDA: {ENT_LAMBDA} (entropy bonus on k distribution)")
    print(f"  K warm-start bias: [0, 1.0, 0, -0.5] (favor k=2)")
    print(f"  Initial temperature: 2.0")

    manager = mp.Manager()
    results = manager.dict()

    # ═══ PAIR 1: Dense (GPU0) ∥ Vanilla MoE (GPU1) ═══
    print(f"\n{'═'*70}")
    print("PAIR 1: Dense (GPU0) || Vanilla MoE (GPU1) — PARALLEL")
    print(f"{'═'*70}", flush=True)

    t0_pair1 = time.time()

    if n_gpus >= 2:
        p_dense = mp.Process(target=_train_dense_worker,
                             args=(0, vocab_size, DENSE_FF_PARAM, TOTAL_STEPS, LR, results, "Dense"))
        p_vanilla = mp.Process(target=_train_vanilla_moe_worker,
                               args=(1, vocab_size, TOTAL_STEPS, LR, results, "Vanilla-MoE"))
        p_dense.start()
        p_vanilla.start()
        p_dense.join()
        p_vanilla.join()
    else:
        _train_dense_worker(0, vocab_size, DENSE_FF_PARAM, TOTAL_STEPS, LR, results, "Dense")
        _train_vanilla_moe_worker(0, vocab_size, TOTAL_STEPS, LR, results, "Vanilla-MoE")

    pair1_time = time.time() - t0_pair1
    dense_time = results.get("Dense", {}).get("time", 0)
    vanilla_time = results.get("Vanilla-MoE", {}).get("time", 0)
    print(f"\n  PAIR 1 wall time: {pair1_time:.0f}s (vs sequential: ~{dense_time + vanilla_time:.0f}s)", flush=True)

    # ═══ PAIR 2: Full Integrated (GPU0) ∥ Adaptive-Only (GPU1) ═══
    print(f"\n{'═'*70}")
    print("PAIR 2: Full Integrated (GPU0) || Adaptive-Only (GPU1) — PARALLEL")
    print(f"{'═'*70}", flush=True)

    t0_pair2 = time.time()

    if n_gpus >= 2:
        p_full = mp.Process(target=_train_adaptive_moe_worker,
                            args=(0, vocab_size, TOTAL_STEPS, LR, EFF_LAMBDA, ENT_LAMBDA,
                                  results, "Full-Integrated"),
                            kwargs={"do_cycles": True, "steps_per_cycle": 2000, "num_cycles": 3})
        p_adapt = mp.Process(target=_train_adaptive_moe_worker,
                             args=(1, vocab_size, TOTAL_STEPS, LR, EFF_LAMBDA, ENT_LAMBDA,
                                   results, "Adaptive-NoCycles"),
                             kwargs={"do_cycles": False})
        p_full.start()
        p_adapt.start()
        p_full.join()
        p_adapt.join()
    else:
        _train_adaptive_moe_worker(0, vocab_size, TOTAL_STEPS, LR, EFF_LAMBDA, ENT_LAMBDA,
                                   results, "Full-Integrated",
                                   do_cycles=True, steps_per_cycle=2000, num_cycles=3)
        _train_adaptive_moe_worker(0, vocab_size, TOTAL_STEPS, LR, EFF_LAMBDA, ENT_LAMBDA,
                                   results, "Adaptive-NoCycles", do_cycles=False)

    pair2_time = time.time() - t0_pair2
    print(f"\n  PAIR 2 wall time: {pair2_time:.0f}s", flush=True)

    # ═══ FINAL ANALYSIS ═══
    print(f"\n{'='*70}")
    print("FULL INTEGRATION ANALYSIS (v4 — Entropy-Regularized Adaptive K)")
    print(f"{'='*70}")

    results = dict(results)
    dense_ppl = results.get("Dense", {}).get("ppl", 999)

    print(f"\n  {'Config':<25s} {'PPL':>8s} {'Params':>10s} {'Avg K':>8s} {'Time':>8s} {'vs Dense':>10s}")
    print(f"  {'─'*69}")
    for name in ["Dense", "Vanilla-MoE", "Adaptive-NoCycles", "Full-Integrated"]:
        r = results.get(name, {})
        if not r:
            continue
        vs = f"{((r['ppl'] - dense_ppl) / dense_ppl * 100):+.2f}%" if name != "Dense" else "baseline"
        k_val = r.get('avg_k', 'N/A')
        k_str = f"{k_val:>8.2f}" if isinstance(k_val, (int, float)) and k_val != "N/A" else f"{'N/A':>8}"
        print(f"  {name:<25s} {r['ppl']:>8.4f} {r['params']:>10,} {k_str} {r['time']:>7.0f}s {vs:>10s}")

    print(f"\n  Key Comparisons:")
    if "Vanilla-MoE" in results:
        v = (results["Vanilla-MoE"]["ppl"] - dense_ppl) / dense_ppl * 100
        print(f"    Vanilla MoE vs Dense: {v:+.2f}%")
    if "Full-Integrated" in results:
        v = (results["Full-Integrated"]["ppl"] - dense_ppl) / dense_ppl * 100
        print(f"    Full Integrated vs Dense: {v:+.2f}%")
    if "Full-Integrated" in results and "Vanilla-MoE" in results:
        v = (results["Full-Integrated"]["ppl"] - results["Vanilla-MoE"]["ppl"]) / results["Vanilla-MoE"]["ppl"] * 100
        print(f"    Full Integrated vs Vanilla MoE: {v:+.2f}%")
    if "Adaptive-NoCycles" in results and "Vanilla-MoE" in results:
        v = (results["Adaptive-NoCycles"]["ppl"] - results["Vanilla-MoE"]["ppl"]) / results["Vanilla-MoE"]["ppl"] * 100
        print(f"    Adaptive-Only vs Vanilla MoE: {v:+.2f}%")

    total_sequential = sum(r.get("time", 0) for r in results.values() if isinstance(r, dict) and "time" in r)
    total_parallel = pair1_time + pair2_time
    print(f"\n  Parallelism:")
    print(f"    Total sequential time: {total_sequential:.0f}s")
    print(f"    Total parallel time:   {total_parallel:.0f}s")
    if total_sequential > 0:
        print(f"    Speedup: {total_sequential / total_parallel:.2f}x")

    print(f"\n  Verdicts:")
    vanilla_ppl = results.get("Vanilla-MoE", {}).get("ppl", 999)
    full_ppl = results.get("Full-Integrated", {}).get("ppl", 999)
    adapt_ppl = results.get("Adaptive-NoCycles", {}).get("ppl", 999)
    print(f"    MoE > Dense?            {'YES' if vanilla_ppl < dense_ppl else 'NO'} (Vanilla {vanilla_ppl:.4f} vs Dense {dense_ppl:.4f})")
    print(f"    Soft-k > Vanilla?       {'YES' if adapt_ppl < vanilla_ppl else 'NO'} (Adaptive {adapt_ppl:.4f} vs Vanilla {vanilla_ppl:.4f})")
    print(f"    Full > Vanilla?         {'YES' if full_ppl < vanilla_ppl else 'NO'} (Full {full_ppl:.4f} vs Vanilla {vanilla_ppl:.4f})")
    print(f"    Full > Dense?           {'YES' if full_ppl < dense_ppl else 'NO'} (Full {full_ppl:.4f} vs Dense {dense_ppl:.4f})")

    for name in ["Adaptive-NoCycles", "Full-Integrated"]:
        r = results.get(name, {})
        if isinstance(r.get("avg_k"), (int, float)):
            print(f"    {name} avg_k: {r['avg_k']:.2f} (target range: 1.5-2.5)")

    # K trajectory from training history
    print(f"\n  K Evolution:")
    for name in ["Adaptive-NoCycles", "Full-Integrated"]:
        r = results.get(name, {})
        hist = r.get("history", [])
        k_points = [(h["step"], h.get("avg_k", 0)) for h in hist if "avg_k" in h]
        if k_points:
            trajectory = " → ".join(f"{k:.2f}@{s}" for s, k in k_points[::2])  # every other
            print(f"    {name}: {trajectory}")

    # Version comparison
    print(f"\n  Adaptive K Evolution Across Versions:")
    print(f"    v1: avg_k=3.16 (no gradient → defaulted HIGH)")
    print(f"    v2: avg_k=1.00 (eff-only gradient → collapsed LOW)")
    print(f"    v3: avg_k≈1.10 (soft routing, weak upward gradient)")
    for name in ["Adaptive-NoCycles", "Full-Integrated"]:
        r = results.get(name, {})
        if isinstance(r.get("avg_k"), (int, float)):
            print(f"    v4 {name}: avg_k={r['avg_k']:.2f} (entropy + warm-start + asymmetric)")

    results["summary"] = {
        "dense_ppl": dense_ppl,
        "vanilla_ppl": vanilla_ppl,
        "full_ppl": full_ppl,
        "adaptive_ppl": adapt_ppl,
        "parallel_speedup": total_sequential / max(total_parallel, 1),
        "pair1_wall_time": pair1_time,
        "pair2_wall_time": pair2_time,
        "version": "v4_entropy_k",
        "eff_lambda": EFF_LAMBDA,
        "ent_lambda": ENT_LAMBDA,
        "k_target": K_TARGET,
        "fix": "k_entropy_bonus + warm_start + asymmetric_eff",
    }

    out_path = Path(__file__).parent / "test_30v4_results.json"
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nResults saved to {out_path}")

    print(f"\n{'='*70}")
    print("TEST 30v4 COMPLETE")
    print(f"{'='*70}")


if __name__ == "__main__":
    main()
