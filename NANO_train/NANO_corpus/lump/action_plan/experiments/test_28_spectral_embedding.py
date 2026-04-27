"""
TEST 28 — SPECTRAL EMBEDDING (PTAIE-based)
==========================================
Proves that PTAIE-structured embedding initialization provides faster
early convergence than random embedding.

2 configs: Standard (random) vs Spectral (PTAIE + learned residual with mixing weight).
Same architecture otherwise. Track PPL at 100, 500, 1000, 2000, 3000 steps.
Also track the mix weight trajectory (α: starts 0.5, learns).
"""

import torch, torch.nn as nn, torch.nn.functional as F
import time, json, math, os
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
    return data, len(chars), stoi, chars

def get_batch(data, block_size, batch_size, device):
    ix = torch.randint(0, len(data) - block_size - 1, (batch_size,))
    x = torch.stack([data[i:i+block_size] for i in ix]).to(device)
    y = torch.stack([data[i+1:i+1+block_size] for i in ix]).to(device)
    return x, y


# ── PTAIE Table ───────────────────────────────────────────────────────
def build_ptaie_table(chars):
    """
    Map each character to RBY simplex coordinates based on character identity.
    
    R = perception weight (how visually distinctive)
    B = cognition weight (how semantically loaded)
    Y = execution weight (how functionally important in text generation)
    
    Lowercase letters: smooth gradient through alphabet
    Uppercase: shifted from lowercase (more R — more distinctive)
    Digits: tight cluster in B-heavy region
    Whitespace: Y-heavy (execution/control)
    Punctuation: mixed R+Y (distinctive + functional)
    """
    table = {}
    for idx, c in enumerate(chars):
        if c.islower():
            # Lowercase: gradient through alphabet
            pos = (ord(c) - ord('a')) / 25.0
            r = 0.2 + 0.3 * pos           # grows with alphabet position
            b = 0.5 - 0.2 * pos           # decreases
            y = 0.3 - 0.1 * pos           # slight decrease
        elif c.isupper():
            # Uppercase: like lowercase but more R (distinctive)
            pos = (ord(c) - ord('A')) / 25.0
            r = 0.4 + 0.3 * pos
            b = 0.35 - 0.2 * pos
            y = 0.25 - 0.1 * pos
        elif c.isdigit():
            # Digits: B-heavy cluster
            pos = (ord(c) - ord('0')) / 9.0
            r = 0.15 + 0.1 * pos
            b = 0.65 - 0.1 * pos
            y = 0.20
        elif c in ' \t':
            # Whitespace: Y-heavy
            r = 0.10
            b = 0.15
            y = 0.75
        elif c == '\n':
            # Newline: strong Y
            r = 0.05
            b = 0.10
            y = 0.85
        elif c in '.,;:!?':
            # Sentence punctuation: R+Y balanced
            r = 0.40
            b = 0.15
            y = 0.45
        elif c in '"\'`':
            # Quotes: R-heavy
            r = 0.55
            b = 0.20
            y = 0.25
        elif c in '()[]{}':
            # Brackets: balanced
            r = 0.35
            b = 0.30
            y = 0.35
        elif c in '-_/\\':
            # Hyphens/slashes: Y-leaning
            r = 0.25
            b = 0.25
            y = 0.50
        else:
            # Other: byte-based fallback
            val = ord(c)
            r = ((val >> 5) & 0x07) / 7.0
            b = ((val >> 2) & 0x07) / 7.0
            y = (val & 0x03) / 3.0
        
        # Normalize to simplex
        total = r + b + y + 1e-9
        table[idx] = (r / total, b / total, y / total)
    
    return table


# ── Spectral Embedding ─────────────────────────────────────────────────
class SpectralEmbedding(nn.Module):
    """
    Embedding = PTAIE spectral prior + learned residual, with mixing weight α.
    α starts at 0.5 and is learned — training can shift from structured→free.
    """
    def __init__(self, vocab_size, d_model, ptaie_table):
        super().__init__()
        # Build PTAIE feature tensor
        rby = torch.zeros(vocab_size, 3)
        for idx in range(vocab_size):
            if idx in ptaie_table:
                rby[idx] = torch.tensor(ptaie_table[idx])
            else:
                rby[idx] = torch.tensor([1/3, 1/3, 1/3])
        
        self.register_buffer('ptaie_base', rby)
        self.ptaie_proj = nn.Linear(3, d_model, bias=False)  # 3→d_model
        
        # Learned free embedding
        self.residual = nn.Embedding(vocab_size, d_model)
        
        # Mixing weight (learned)
        self.mix = nn.Parameter(torch.tensor(0.0))  # sigmoid(0)=0.5
    
    def forward(self, token_ids):
        ptaie = self.ptaie_proj(self.ptaie_base[token_ids])
        learned = self.residual(token_ids)
        alpha = torch.sigmoid(self.mix)
        return alpha * ptaie + (1 - alpha) * learned
    
    def get_alpha(self):
        return torch.sigmoid(self.mix).item()


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

    def forward(self, x):
        residual = x
        x = self.norm(x)
        B, T, D = x.shape
        flat = x.reshape(B*T, D)
        logits = self.router(flat)
        weights, indices = torch.topk(F.softmax(logits, dim=-1), self.top_k, dim=-1)
        weights = weights / weights.sum(dim=-1, keepdim=True)

        out = torch.zeros_like(flat)
        for k_i in range(self.top_k):
            idx = indices[:, k_i]
            w = weights[:, k_i].unsqueeze(-1)
            for e_idx in range(self.n_experts):
                mask = (idx == e_idx)
                if mask.any():
                    out[mask] += w[mask] * self.experts[e_idx](flat[mask])

        return residual + out.reshape(B, T, D)


class NanoMoE(nn.Module):
    def __init__(self, vocab_size, d_model=64, n_heads=4, n_layers=3,
                 n_experts=8, ff_dim=85, top_k=2, block_size=128,
                 spectral=False, ptaie_table=None, device="cuda:0"):
        super().__init__()
        self.d_model = d_model
        self.block_size = block_size
        self.spectral = spectral
        
        if spectral and ptaie_table is not None:
            self.tok_emb = SpectralEmbedding(vocab_size, d_model, ptaie_table)
        else:
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

    def forward(self, idx):
        B, T = idx.shape
        h = self.tok_emb(idx) + self.pos_emb(torch.arange(T, device=idx.device))
        mask = nn.Transformer.generate_square_subsequent_mask(T, device=idx.device)
        for attn, moe in zip(self.attn_layers, self.moe_layers):
            h2, _ = attn(h, h, h, attn_mask=mask, is_causal=True)
            h = h + h2
            h = moe(h)
        return self.head(self.ln_f(h))

    def count_params(self):
        return sum(p.numel() for p in self.parameters())


# ── Training ──────────────────────────────────────────────────────────
def train_and_track(model, data, steps, device, lr=3e-4, label="",
                    checkpoints=[100, 250, 500, 1000, 1500, 2000, 2500, 3000]):
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    model.train()
    
    ppl_at_checkpoint = {}
    alpha_trajectory = []
    
    for step in range(1, steps + 1):
        x, y = get_batch(data, model.block_size, 64, device)
        logits = model(x)
        loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1))
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        
        if step in checkpoints:
            # Eval PPL
            model.eval()
            total_loss, count = 0.0, 0
            with torch.no_grad():
                for _ in range(15):
                    xv, yv = get_batch(data, model.block_size, 64, device)
                    logits_v = model(xv)
                    lv = F.cross_entropy(logits_v.view(-1, logits_v.size(-1)), yv.view(-1))
                    total_loss += lv.item()
                    count += 1
            ppl = math.exp(total_loss / count)
            ppl_at_checkpoint[step] = ppl
            model.train()
            
            # Track alpha
            alpha = None
            if model.spectral and hasattr(model.tok_emb, 'get_alpha'):
                alpha = model.tok_emb.get_alpha()
                alpha_trajectory.append({"step": step, "alpha": alpha})
            
            alpha_str = f" α={alpha:.4f}" if alpha is not None else ""
            print(f"      {label} Step {step:5d} | PPL={ppl:.3f}{alpha_str}")
    
    # Final eval
    model.eval()
    total_loss, count = 0.0, 0
    with torch.no_grad():
        for _ in range(20):
            xv, yv = get_batch(data, model.block_size, 64, device)
            logits_v = model(xv)
            lv = F.cross_entropy(logits_v.view(-1, logits_v.size(-1)), yv.view(-1))
            total_loss += lv.item()
            count += 1
    final_ppl = math.exp(total_loss / count)
    
    return final_ppl, ppl_at_checkpoint, alpha_trajectory


# ── Main ──────────────────────────────────────────────────────────────
def main():
    print("=" * 70)
    print("TEST 28 — SPECTRAL EMBEDDING (PTAIE-based)")
    print("=" * 70)
    
    data, vocab_size, stoi, chars = load_shakespeare()
    print(f"Data: {len(data):,} chars, {vocab_size} vocab")
    
    ptaie_table = build_ptaie_table(chars)
    
    # Show PTAIE mapping for key characters
    print("\n  PTAIE Mappings (sample):")
    sample_chars = ['a', 'e', 'i', 'o', 'u', 'A', 'Z', ' ', '\n', ',', '.', '0']
    for c in sample_chars:
        if c in stoi:
            idx = stoi[c]
            r, b, y = ptaie_table[idx]
            name = repr(c)
            print(f"    {name:>6s} (idx={idx:2d}) → R={r:.3f} B={b:.3f} Y={y:.3f}")
    
    STEPS = 3000
    CHECKPOINTS = [100, 250, 500, 1000, 1500, 2000, 2500, 3000]
    
    results = {}
    configs = [
        ("Standard", DEVICE_A, False),
        ("Spectral", DEVICE_B, True),
    ]
    
    for name, device, spectral in configs:
        print(f"\n{'─'*70}")
        print(f"CONFIG: {name} Embedding")
        print(f"{'─'*70}")
        t0 = time.time()
        
        model = NanoMoE(vocab_size, spectral=spectral, ptaie_table=ptaie_table, device=device)
        print(f"  Params: {model.count_params():,} on {device}")
        
        final_ppl, checkpt_ppls, alpha_traj = train_and_track(
            model, data, STEPS, device, label=name, checkpoints=CHECKPOINTS
        )
        elapsed = time.time() - t0
        
        print(f"  Final PPL: {final_ppl:.4f} ({elapsed:.0f}s)")
        
        results[name] = {
            "final_ppl": final_ppl,
            "checkpoints": {str(k): v for k, v in checkpt_ppls.items()},
            "alpha_trajectory": alpha_traj,
            "time": elapsed,
            "params": model.count_params()
        }
        
        del model
        torch.cuda.empty_cache()
    
    # ═══ ANALYSIS ═══
    print(f"\n{'='*70}")
    print("SPECTRAL EMBEDDING ANALYSIS")
    print(f"{'='*70}")
    
    std = results["Standard"]
    spc = results["Spectral"]
    
    print(f"\n  {'Step':<8s} {'Standard':>10s} {'Spectral':>10s} {'Δ%':>8s} {'Winner':>10s}")
    print(f"  {'─'*46}")
    for step in CHECKPOINTS:
        s_key = str(step)
        std_ppl = std["checkpoints"].get(s_key, float('nan'))
        spc_ppl = spc["checkpoints"].get(s_key, float('nan'))
        delta = (spc_ppl - std_ppl) / std_ppl * 100
        winner = "Spectral" if spc_ppl < std_ppl else "Standard"
        print(f"  {step:<8d} {std_ppl:>10.3f} {spc_ppl:>10.3f} {delta:>+7.1f}% {winner:>10s}")
    
    print(f"\n  Final: Standard={std['final_ppl']:.4f}, Spectral={spc['final_ppl']:.4f}")
    
    # Convergence speed: when does each first reach PPL < 10?
    for threshold in [15, 12, 10, 8]:
        std_step = None
        spc_step = None
        for step in CHECKPOINTS:
            if std_step is None and std["checkpoints"].get(str(step), 999) < threshold:
                std_step = step
            if spc_step is None and spc["checkpoints"].get(str(step), 999) < threshold:
                spc_step = step
        if std_step or spc_step:
            print(f"  First to PPL<{threshold}: Standard@{std_step}, Spectral@{spc_step}")
    
    # Alpha trajectory
    if spc["alpha_trajectory"]:
        print(f"\n  Alpha trajectory (Spectral):")
        for pt in spc["alpha_trajectory"]:
            bar = "█" * int(pt["alpha"] * 40)
            print(f"    Step {pt['step']:5d}: α={pt['alpha']:.4f} {bar}")
        final_alpha = spc["alpha_trajectory"][-1]["alpha"]
        print(f"  Final α={final_alpha:.4f} → "
              f"{'PTAIE-dominant' if final_alpha > 0.5 else 'Learned-dominant'}")
    
    # Early advantage
    early_steps = [100, 250, 500]
    spectral_wins_early = sum(
        1 for s in early_steps 
        if spc["checkpoints"].get(str(s), 999) < std["checkpoints"].get(str(s), 999)
    )
    print(f"\n  Spectral wins early ({early_steps}): {spectral_wins_early}/{len(early_steps)}")
    
    results["summary"] = {
        "standard_final": std["final_ppl"],
        "spectral_final": spc["final_ppl"],
        "spectral_wins_early": spectral_wins_early,
        "spectral_better_final": spc["final_ppl"] < std["final_ppl"]
    }
    
    out_path = Path(__file__).parent / "test_28_results.json"
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nResults saved to {out_path}")
    
    print(f"\n{'='*70}")
    print("TEST 28 COMPLETE")
    print(f"{'='*70}")

if __name__ == "__main__":
    main()
