"""
TEST 27 — CONTINUAL LEARNING: Deposit-Shielded vs Naive vs EWC
==============================================================
Proves that deposits protect against catastrophic forgetting.

Setup:
- Data A: Shakespeare (first half), Data B: Shakespeare (second half, treated as "different domain")
- 3 configs:
  1. Naive: Train A → Train B → Test A (expect catastrophic forgetting)
  2. EWC: Train A → Train B with EWC regularization → Test A
  3. Deposit-Shield: Train A → compress → deposit → Train B with deposit regularization → Test A
- All use same NanoMoE-3L architecture

Success: Deposit-Shield forgetting ≤ EWC forgetting < Naive forgetting
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
    return data, len(chars), stoi

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

class NanoMoE(nn.Module):
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


# ── EWC (Elastic Weight Consolidation) ─────────────────────────────────
class EWC:
    """Standard EWC: compute Fisher information after task A, regularize during task B."""
    def __init__(self, model, data, device, n_samples=200, block_size=128):
        self.params = {n: p.clone().detach() for n, p in model.named_parameters() if p.requires_grad}
        self.fisher = self._compute_fisher(model, data, device, n_samples, block_size)

    def _compute_fisher(self, model, data, device, n_samples, block_size):
        fisher = {n: torch.zeros_like(p) for n, p in model.named_parameters() if p.requires_grad}
        model.eval()
        for _ in range(n_samples):
            x, y = get_batch(data, block_size, 16, device)
            logits, _ = model(x)
            loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1))
            model.zero_grad()
            loss.backward()
            for n, p in model.named_parameters():
                if p.requires_grad and p.grad is not None:
                    fisher[n] += p.grad.data.pow(2) / n_samples
        model.train()
        return fisher

    def penalty(self, model):
        loss = 0.0
        for n, p in model.named_parameters():
            if n in self.fisher:
                loss += (self.fisher[n] * (p - self.params[n]).pow(2)).sum()
        return loss


# ── Deposit Shield ─────────────────────────────────────────────────────
class DepositShield:
    """
    Deposit-based regularization: after training on task A, 
    save deposits (expert weights + touch profiles).
    During task B training, regularize deposited experts to stay near deposits.
    Non-deposited experts are free to adapt to task B.
    """
    def __init__(self, model, touch_counts, survival_rate=0.5):
        """
        After task A: identify important experts (high utilization),
        save their weights as deposits. During task B, these experts
        are regularized to not drift too far.
        """
        self.deposits = {}  # (layer_idx, expert_idx) → saved state_dict
        self.importance = {}  # (layer_idx, expert_idx) → utilization score
        
        n_layers = len(model.moe_layers)
        n_experts = model.moe_layers[0].n_experts
        
        for layer_idx in range(n_layers):
            layer_counts = touch_counts[layer_idx]
            total = layer_counts.sum()
            if total == 0:
                continue
            util = layer_counts / total
            
            # Top survivors get deposited (high utilization = important for task A)
            n_protect = int(n_experts * survival_rate)
            _, sorted_idx = torch.sort(util, descending=True)
            
            for rank, e_idx in enumerate(sorted_idx[:n_protect].tolist()):
                expert = model.moe_layers[layer_idx].experts[e_idx]
                self.deposits[(layer_idx, e_idx)] = {
                    k: v.clone().detach() for k, v in expert.state_dict().items()
                }
                self.importance[(layer_idx, e_idx)] = util[e_idx].item()

        n_deposited = len(self.deposits)
        print(f"    DepositShield: {n_deposited} experts protected "
              f"({n_deposited}/{n_layers*n_experts} total)")

    def penalty(self, model):
        """Regularize deposited experts to stay near their task-A weights."""
        loss = 0.0
        for (layer_idx, e_idx), saved_state in self.deposits.items():
            expert = model.moe_layers[layer_idx].experts[e_idx]
            importance = self.importance[(layer_idx, e_idx)]
            for name, param in expert.named_parameters():
                key = f"w1.weight" if "w1" in name else f"w2.weight"
                if key in saved_state:
                    loss += importance * (param - saved_state[key]).pow(2).sum()
        return loss


# ── Training Functions ─────────────────────────────────────────────────
def train(model, data, steps, device, lr=3e-4, record_touch=False,
          ewc=None, deposit_shield=None, reg_lambda=100.0,
          log_interval=500, label=""):
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    touch_counts = torch.zeros(len(model.moe_layers), model.moe_layers[0].n_experts)
    ppl_history = []
    model.train()

    for step in range(1, steps + 1):
        x, y = get_batch(data, model.block_size, 64, device)
        logits, routing_list = model(x, record_routing=(record_touch and step % 10 == 0))
        
        loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1))
        
        # Regularization
        if ewc is not None:
            loss += reg_lambda * ewc.penalty(model)
        if deposit_shield is not None:
            loss += reg_lambda * deposit_shield.penalty(model)
        
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()

        if record_touch and step % 10 == 0 and routing_list:
            for li, rc in enumerate(routing_list):
                touch_counts[li] += rc.cpu()

        if step % log_interval == 0:
            ppl = math.exp(min(loss.item(), 10))  # clamp for stability
            ppl_history.append({"step": step, "ppl": ppl})
            print(f"      {label} Step {step:5d} | PPL={ppl:.3f}")

    return ppl_history, touch_counts


@torch.no_grad()
def evaluate(model, data, device, n_batches=30, label=""):
    model.eval()
    total_loss, count = 0.0, 0
    for _ in range(n_batches):
        x, y = get_batch(data, model.block_size, 64, device)
        logits, _ = model(x)
        loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1))
        total_loss += loss.item()
        count += 1
    ppl = math.exp(total_loss / count)
    model.train()
    return ppl


# ── Main Experiment ────────────────────────────────────────────────────
def main():
    print("=" * 70)
    print("TEST 27 — CONTINUAL LEARNING: Deposit-Shield vs Naive vs EWC")
    print("=" * 70)

    data, vocab_size, stoi = load_shakespeare()
    
    # Split into two "domains"
    split = len(data) // 2
    data_A = data[:split]
    data_B = data[split:]
    print(f"Data A: {len(data_A):,} chars | Data B: {len(data_B):,} chars | Vocab: {vocab_size}")

    TRAIN_STEPS_A = 3000
    TRAIN_STEPS_B = 3000
    REG_LAMBDA = 100.0
    
    results = {}
    configs = [
        ("Naive", DEVICE_A),
        ("EWC", DEVICE_B), 
        ("Deposit-Shield", DEVICE_A),
    ]

    for config_name, device in configs:
        print(f"\n{'─'*70}")
        print(f"CONFIG: {config_name}")
        print(f"{'─'*70}")
        t0 = time.time()

        # Phase 1: Train on Data A
        model = NanoMoE(vocab_size, device=device)
        print(f"  Params: {model.count_params():,} on {device}")
        print(f"  Phase 1: Training on Data A ({TRAIN_STEPS_A} steps)...")
        hist_A, touch_counts = train(
            model, data_A, TRAIN_STEPS_A, device,
            record_touch=(config_name == "Deposit-Shield"),
            log_interval=1000, label=f"{config_name}-A"
        )
        
        ppl_A_after_A = evaluate(model, data_A, device)
        ppl_B_after_A = evaluate(model, data_B, device)
        print(f"  After Phase 1: PPL_A={ppl_A_after_A:.4f}, PPL_B={ppl_B_after_A:.4f}")

        # Setup regularization
        ewc = None
        deposit_shield = None
        if config_name == "EWC":
            print(f"  Computing EWC Fisher information...")
            ewc = EWC(model, data_A, device, n_samples=200, block_size=model.block_size)
        elif config_name == "Deposit-Shield":
            print(f"  Creating deposits from task A experts...")
            deposit_shield = DepositShield(model, touch_counts, survival_rate=0.5)

        # Phase 2: Train on Data B
        print(f"  Phase 2: Training on Data B ({TRAIN_STEPS_B} steps)...")
        hist_B, _ = train(
            model, data_B, TRAIN_STEPS_B, device,
            ewc=ewc, deposit_shield=deposit_shield, reg_lambda=REG_LAMBDA,
            log_interval=1000, label=f"{config_name}-B"
        )

        ppl_A_after_B = evaluate(model, data_A, device)
        ppl_B_after_B = evaluate(model, data_B, device)
        elapsed = time.time() - t0

        forgetting = ppl_A_after_B - ppl_A_after_A
        forgetting_pct = (ppl_A_after_B - ppl_A_after_A) / ppl_A_after_A * 100

        print(f"  After Phase 2: PPL_A={ppl_A_after_B:.4f}, PPL_B={ppl_B_after_B:.4f}")
        print(f"  Forgetting: {forgetting:+.4f} ({forgetting_pct:+.1f}%) on Data A")
        print(f"  Time: {elapsed:.0f}s")

        results[config_name] = {
            "ppl_A_after_A": ppl_A_after_A,
            "ppl_B_after_A": ppl_B_after_A,
            "ppl_A_after_B": ppl_A_after_B,
            "ppl_B_after_B": ppl_B_after_B,
            "forgetting": forgetting,
            "forgetting_pct": forgetting_pct,
            "time": elapsed,
            "history_A": hist_A,
            "history_B": hist_B
        }

        del model
        if ewc: del ewc
        if deposit_shield: del deposit_shield
        torch.cuda.empty_cache()

    # ═══ ANALYSIS ═══
    print(f"\n{'='*70}")
    print("CONTINUAL LEARNING ANALYSIS")
    print(f"{'='*70}")

    print(f"\n  {'Method':<20s} {'PPL_A→A':>10s} {'PPL_A→AB':>10s} {'Forgetting':>12s} {'PPL_B→AB':>10s}")
    print(f"  {'─'*62}")
    for name, r in results.items():
        forg = f"{r['forgetting']:+.3f} ({r['forgetting_pct']:+.1f}%)"
        print(f"  {name:<20s} {r['ppl_A_after_A']:>10.4f} {r['ppl_A_after_B']:>10.4f} "
              f"{forg:>12s} {r['ppl_B_after_B']:>10.4f}")

    # Verdict
    naive_forg = results["Naive"]["forgetting"]
    ewc_forg = results["EWC"]["forgetting"]
    dep_forg = results["Deposit-Shield"]["forgetting"]

    print(f"\n  Verdicts:")
    print(f"    Naive forgetting:   {naive_forg:+.4f}")
    print(f"    EWC forgetting:     {ewc_forg:+.4f}", 
          "✓ better than Naive" if ewc_forg < naive_forg else "✗ worse than Naive")
    print(f"    Deposit forgetting: {dep_forg:+.4f}",
          "✓ better than Naive" if dep_forg < naive_forg else "✗ worse than Naive")
    print(f"    Deposit vs EWC:    ",
          "✓ Deposit ≤ EWC" if dep_forg <= ewc_forg else "✗ EWC < Deposit")

    # Check task B performance
    naive_B = results["Naive"]["ppl_B_after_B"]
    ewc_B = results["EWC"]["ppl_B_after_B"]
    dep_B = results["Deposit-Shield"]["ppl_B_after_B"]
    print(f"    Task B quality: Naive={naive_B:.3f}, EWC={ewc_B:.3f}, Deposit={dep_B:.3f}")
    print(f"    (All methods should learn task B well)")

    results["summary"] = {
        "naive_forgetting": naive_forg,
        "ewc_forgetting": ewc_forg,
        "deposit_forgetting": dep_forg,
        "deposit_beats_naive": dep_forg < naive_forg,
        "deposit_beats_ewc": dep_forg <= ewc_forg
    }

    out_path = Path(__file__).parent / "test_27_results.json"
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nResults saved to {out_path}")

    print(f"\n{'='*70}")
    print("TEST 27 COMPLETE")
    print(f"{'='*70}")

if __name__ == "__main__":
    main()
