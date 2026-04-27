#!/usr/bin/env python3
"""
TEST 20b — HANDICAP GAUNTLET CONTINUATION
==========================================
Fresh process to avoid CUDA memory fragmentation from 12+ sequential training runs.
Runs: H6 (network tax), Phase 3 (compound handicaps), Phase 4 (FLOP-matched).

Dense baseline from Phase 1: PPL=6.88, BPC=2.783, Acc=42.5%
"""

import os, sys, time, math, json, gc
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

N_GPUS = torch.cuda.device_count() if torch.cuda.is_available() else 0
device = "cuda:0" if N_GPUS > 0 else "cpu"

print(f"Device: {device}")
for i in range(N_GPUS):
    props = torch.cuda.get_device_properties(i)
    print(f"  GPU {i}: {props.name} ({props.total_memory // 1024**2} MB)")

# ═══════════════════════════════════════════════════════════════════════════
# BASELINE FROM PART A (Phase 1 results — copied exactly)
# ═══════════════════════════════════════════════════════════════════════════

DENSE_BASELINE = {
    "test_ppl": 6.88,
    "test_bpc": 2.783,
    "test_acc": 0.425,
    "test_loss": 1.928,
}

SEQ_LEN = 128
BASE_SEED = 42
DEFAULT_D_MODEL = 64
DEFAULT_N_HEADS = 4
DEFAULT_N_LAYERS = 2
DEFAULT_FF_DIM = 256
DEFAULT_N_EXPERTS = 16
DEFAULT_TOP_K = 2
DEFAULT_STEPS = 5000
DEFAULT_BATCH = 64
DEFAULT_LR = 1e-3
DEFAULT_AUX_WEIGHT = 0.01

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)


def download_data():
    import urllib.request
    cache = os.path.join(DATA_DIR, "shakespeare.txt")
    if os.path.exists(cache):
        with open(cache, "r", encoding="utf-8") as f:
            return f.read()
    url = "https://raw.githubusercontent.com/karpathy/char-rnn/master/data/tinyshakespeare/input.txt"
    print("Downloading Shakespeare...")
    text = urllib.request.urlopen(url, timeout=30).read().decode('utf-8')
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


def get_batch(data_split, batch_size, seq_len=SEQ_LEN):
    ix = torch.randint(len(data_split) - seq_len - 1, (batch_size,))
    x = torch.stack([data_split[i:i+seq_len] for i in ix]).to(device)
    y = torch.stack([data_split[i+1:i+seq_len+1] for i in ix]).to(device)
    return x, y


def cuda_cleanup():
    gc.collect()
    if torch.cuda.is_available():
        for i in range(torch.cuda.device_count()):
            with torch.cuda.device(i):
                torch.cuda.synchronize()
                torch.cuda.empty_cache()
                torch.cuda.reset_peak_memory_stats()
        # Extra sync for safety
        time.sleep(0.5)
        gc.collect()
        torch.cuda.synchronize()


# ═══════════════════════════════════════════════════════════════════════════
# MODELS (identical to test_20 — copied for fresh-process isolation)
# ═══════════════════════════════════════════════════════════════════════════

class CausalSelfAttention(nn.Module):
    def __init__(self, d_model, n_heads, max_len=SEQ_LEN, dropout=0.1):
        super().__init__()
        self.n_heads = n_heads
        self.head_dim = d_model // n_heads
        self.qkv = nn.Linear(d_model, 3 * d_model)
        self.proj = nn.Linear(d_model, d_model)
        self.attn_drop = nn.Dropout(dropout)
        self.proj_drop = nn.Dropout(dropout)
        self.register_buffer("mask", torch.tril(torch.ones(max_len, max_len)).unsqueeze(0).unsqueeze(0))

    def forward(self, x):
        B, T, C = x.shape
        qkv = self.qkv(x).reshape(B, T, 3, self.n_heads, self.head_dim).permute(2, 0, 3, 1, 4)
        q, k, v = qkv[0], qkv[1], qkv[2]
        att = (q @ k.transpose(-2, -1)) * (self.head_dim ** -0.5)
        att = att.masked_fill(self.mask[:,:,:T,:T] == 0, float('-inf'))
        att = self.attn_drop(F.softmax(att, dim=-1))
        y = (att @ v).transpose(1, 2).contiguous().reshape(B, T, C)
        return self.proj_drop(self.proj(y))


class TransformerBlock(nn.Module):
    def __init__(self, d_model, n_heads, ff_dim, dropout=0.1):
        super().__init__()
        self.ln1 = nn.LayerNorm(d_model)
        self.attn = CausalSelfAttention(d_model, n_heads, dropout=dropout)
        self.ln2 = nn.LayerNorm(d_model)
        self.ff = nn.Sequential(
            nn.Linear(d_model, ff_dim), nn.GELU(), nn.Dropout(dropout),
            nn.Linear(ff_dim, d_model), nn.Dropout(dropout),
        )

    def forward(self, x):
        x = x + self.attn(self.ln1(x))
        x = x + self.ff(self.ln2(x))
        return x


class DenseTransformerFlops(nn.Module):
    def __init__(self, vocab, d_model=64, n_heads=4, n_layers=2, ff_dim=256, dropout=0.1):
        super().__init__()
        self.tok_emb = nn.Embedding(vocab, d_model)
        self.pos_emb = nn.Embedding(SEQ_LEN, d_model)
        self.drop = nn.Dropout(dropout)
        self.blocks = nn.ModuleList([
            TransformerBlock(d_model, n_heads, ff_dim, dropout) for _ in range(n_layers)
        ])
        self.ln = nn.LayerNorm(d_model)
        self.head = nn.Linear(d_model, vocab)

    def forward(self, x):
        B, T = x.shape
        x = self.drop(self.tok_emb(x) + self.pos_emb(torch.arange(T, device=x.device)))
        for block in self.blocks:
            x = block(x)
        return self.head(self.ln(x))

    def flops_per_token(self):
        d = self.blocks[0].attn.head_dim * self.blocks[0].attn.n_heads
        ff = self.blocks[0].ff[0].out_features
        n_layers = len(self.blocks)
        attn_flops = 4 * d * d + 2 * SEQ_LEN * d
        ffn_flops = 2 * d * ff
        return (attn_flops + ffn_flops) * n_layers


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


class TopKRouter(nn.Module):
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


class MoEBlock(nn.Module):
    def __init__(self, d_model, n_heads, n_experts, ff_dim, top_k=2, dropout=0.1):
        super().__init__()
        self.ln1 = nn.LayerNorm(d_model)
        self.attn = CausalSelfAttention(d_model, n_heads, dropout=dropout)
        self.ln2 = nn.LayerNorm(d_model)
        self.router = TopKRouter(d_model, n_experts, top_k)
        self.experts = BatchedNanoExperts(n_experts, d_model, ff_dim, dropout)
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


class NanoMoEModel(nn.Module):
    def __init__(self, vocab, d_model=64, n_heads=4, n_layers=2, n_experts=8,
                 ff_dim=256, top_k=2, dropout=0.1):
        super().__init__()
        self.d_model = d_model
        self.n_layers = n_layers
        self.n_experts = n_experts
        self.top_k = top_k
        self.tok_emb = nn.Embedding(vocab, d_model)
        self.pos_emb = nn.Embedding(SEQ_LEN, d_model)
        self.drop = nn.Dropout(dropout)
        self.blocks = nn.ModuleList([
            MoEBlock(d_model, n_heads, n_experts, ff_dim, top_k, dropout)
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

    def active_params_per_token(self):
        shared = sum(p.numel() for n, p in self.named_parameters()
                     if 'experts' not in n and 'router' not in n)
        per_expert = (self.blocks[0].experts.W1[0].numel() +
                      self.blocks[0].experts.b1[0].numel() +
                      self.blocks[0].experts.W2[0].numel() +
                      self.blocks[0].experts.b2[0].numel())
        return shared + per_expert * self.top_k * self.n_layers + \
               sum(p.numel() for n, p in self.named_parameters() if 'router' in n)

    def flops_per_token(self):
        d = self.d_model
        ff = self.blocks[0].experts.ff_dim
        attn_flops = 4 * d * d + 2 * SEQ_LEN * d
        expert_flops = self.top_k * (2 * d * ff) * self.n_layers
        total = attn_flops * self.n_layers + expert_flops
        total += d * self.n_experts * self.n_layers
        return total


def count_params(model):
    return sum(p.numel() for p in model.parameters())


@torch.no_grad()
def evaluate(model, data_split, is_moe=False, n_batches=30):
    model.eval()
    total_loss = 0.0
    total_correct = 0
    total_tokens = 0
    for _ in range(n_batches):
        x, y = get_batch(data_split, DEFAULT_BATCH)
        if is_moe:
            logits, _ = model(x)
        else:
            logits = model(x)
        loss = F.cross_entropy(logits.reshape(-1, logits.shape[-1]), y.reshape(-1))
        total_correct += (logits.argmax(-1) == y).sum().item()
        total_tokens += y.numel()
        total_loss += loss.item()
    avg_loss = total_loss / n_batches
    return {
        "loss": avg_loss,
        "perplexity": math.exp(min(avg_loss, 20)),
        "accuracy": total_correct / total_tokens,
        "bpc": avg_loss / math.log(2),
    }


def train_and_eval(model, name, data, is_moe=False, steps=DEFAULT_STEPS,
                   lr=DEFAULT_LR, aux_weight=DEFAULT_AUX_WEIGHT,
                   network_tax_ms=0.0):
    model.to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)
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
        x, y = get_batch(data["train"], DEFAULT_BATCH)

        if is_moe:
            logits, aux = model(x)
            loss = F.cross_entropy(logits.reshape(-1, logits.shape[-1]), y.reshape(-1))
            loss = loss + aux_weight * aux
        else:
            logits = model(x)
            loss = F.cross_entropy(logits.reshape(-1, logits.shape[-1]), y.reshape(-1))

        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        scheduler.step()
        total_tokens += DEFAULT_BATCH * SEQ_LEN

        if network_tax_ms > 0:
            time.sleep(network_tax_ms / 1000)

        if step % 500 == 0 or step == steps:
            elapsed = time.time() - t0
            metrics = evaluate(model, data["val"], is_moe, n_batches=10)
            tps = total_tokens / elapsed
            print(f"    [{name}] Step {step:5d} | ppl={metrics['perplexity']:.1f} "
                  f"acc={metrics['accuracy']*100:.1f}% bpc={metrics['bpc']:.3f} | "
                  f"{tps:.0f} tok/s | {elapsed:.1f}s")

    test_m = evaluate(model, data["test"], is_moe, n_batches=30)
    elapsed = time.time() - t0

    result = {
        "name": name,
        "params": count_params(model),
        "test_ppl": test_m["perplexity"],
        "test_acc": test_m["accuracy"],
        "test_bpc": test_m["bpc"],
        "test_loss": test_m["loss"],
        "time_s": elapsed,
        "tps": total_tokens / elapsed,
        "steps": steps,
    }

    if is_moe and hasattr(model, 'active_params_per_token'):
        result["active_params"] = model.active_params_per_token()
    if hasattr(model, 'flops_per_token'):
        result["flops_per_token"] = model.flops_per_token()

    return result


# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("\n" + "=" * 70)
    print("TEST 20b — HANDICAP GAUNTLET (CONTINUATION)")
    print("Fresh process for H6 + Phase 3 + Phase 4")
    print("=" * 70)

    text = download_data()
    data = prepare_data(text)
    V = data["vocab_size"]
    dense_ppl = DENSE_BASELINE["test_ppl"]
    print(f"Data: {len(text):,} chars, {V} vocab")
    print(f"Dense baseline: PPL={dense_ppl:.2f}")

    all_results = {}

    # ═══════════════════════════════════════════════════════════════════════
    # H6: Network latency tax (capped at 2000 steps for wall-clock sanity)
    # ═══════════════════════════════════════════════════════════════════════

    print("\n" + "=" * 70)
    print("H6: Network latency tax per training step")
    print("=" * 70)

    # First train a MoE reference at 2000 steps with NO tax for fair comparison
    cuda_cleanup()
    torch.manual_seed(BASE_SEED)
    print("\n  --- MoE reference (2000 steps, no tax) ---")
    m = NanoMoEModel(V, DEFAULT_D_MODEL, DEFAULT_N_HEADS, DEFAULT_N_LAYERS,
                     DEFAULT_N_EXPERTS, DEFAULT_FF_DIM, DEFAULT_TOP_K)
    r_ref2k = train_and_eval(m, "MoE-ref-2k", data, is_moe=True, steps=2000)
    del m; cuda_cleanup()

    h6 = [{"name": "MoE-0ms (ref)", "test_ppl": r_ref2k["test_ppl"],
            "time_s": r_ref2k["time_s"], "tax_ms": 0}]

    for tax_ms in [1, 2, 5, 10]:
        cuda_cleanup()
        torch.manual_seed(BASE_SEED)
        label = f"MoE+{tax_ms}ms"
        print(f"\n  --- {label} (2000 steps) ---")
        m = NanoMoEModel(V, DEFAULT_D_MODEL, DEFAULT_N_HEADS, DEFAULT_N_LAYERS,
                         DEFAULT_N_EXPERTS, DEFAULT_FF_DIM, DEFAULT_TOP_K)
        r = train_and_eval(m, label, data, is_moe=True, steps=2000,
                           network_tax_ms=tax_ms)
        r["tax_ms"] = tax_ms
        h6.append(r)
        del m; cuda_cleanup()

    all_results["H6_network_tax"] = h6

    print(f"\n  H6 RESULTS (2000 steps, Dense PPL={dense_ppl:.2f}):")
    print(f"  {'Tax':>6s} {'PPL':>8s} {'Time':>8s} {'Slowdown':>10s} {'vs Dense':>10s}")
    print(f"  " + "-" * 46)
    ref_time = h6[0]["time_s"]
    for r in h6:
        diff = r["test_ppl"] - dense_ppl
        marker = "★" if r["test_ppl"] < dense_ppl else "✗"
        slowdown = r["time_s"] / ref_time if ref_time > 0 else 0
        print(f"  {r.get('tax_ms',0):>5d}ms {r['test_ppl']:>7.2f} {r['time_s']:>7.1f}s "
              f"{slowdown:>9.1f}× {diff:>+9.2f} {marker}")

    # ═══════════════════════════════════════════════════════════════════════
    # PHASE 3: COMPOUND HANDICAPS
    # ═══════════════════════════════════════════════════════════════════════

    print("\n" + "=" * 70)
    print("PHASE 3: COMPOUND HANDICAPS — Stack multiple nerfs")
    print("=" * 70)

    compound = []

    # Mild: 8 experts, top-1, 2500 steps
    cuda_cleanup()
    torch.manual_seed(BASE_SEED)
    label = "MILD(8exp,top1,2500st)"
    print(f"\n  --- {label} ---")
    m = NanoMoEModel(V, DEFAULT_D_MODEL, DEFAULT_N_HEADS, DEFAULT_N_LAYERS, 8, DEFAULT_FF_DIM, 1)
    r = train_and_eval(m, label, data, is_moe=True, steps=2500)
    r["handicap"] = label
    compound.append(r)
    del m; cuda_cleanup()

    # Medium: 4 experts, top-1, 1000 steps
    cuda_cleanup()
    torch.manual_seed(BASE_SEED)
    label = "MED(4exp,top1,1000st)"
    print(f"\n  --- {label} ---")
    m = NanoMoEModel(V, DEFAULT_D_MODEL, DEFAULT_N_HEADS, DEFAULT_N_LAYERS, 4, DEFAULT_FF_DIM, 1)
    r = train_and_eval(m, label, data, is_moe=True, steps=1000)
    r["handicap"] = label
    compound.append(r)
    del m; cuda_cleanup()

    # Severe: 2 experts, top-1, 500 steps, d=48
    cuda_cleanup()
    torch.manual_seed(BASE_SEED)
    label = "SEVERE(2exp,top1,500st,d48)"
    print(f"\n  --- {label} ---")
    m = NanoMoEModel(V, 48, 3, DEFAULT_N_LAYERS, 2, DEFAULT_FF_DIM, 1)
    r = train_and_eval(m, label, data, is_moe=True, steps=500)
    r["handicap"] = label
    compound.append(r)
    del m; cuda_cleanup()

    # Brutal: 2 experts, top-1, 250 steps, d=32, no load balance
    cuda_cleanup()
    torch.manual_seed(BASE_SEED)
    label = "BRUTAL(2exp,top1,250st,d32,noBal)"
    print(f"\n  --- {label} ---")
    m = NanoMoEModel(V, 32, 2, DEFAULT_N_LAYERS, 2, DEFAULT_FF_DIM, 1)
    r = train_and_eval(m, label, data, is_moe=True, steps=250, aux_weight=0.0)
    r["handicap"] = label
    compound.append(r)
    del m; cuda_cleanup()

    all_results["phase3_compound"] = compound

    print(f"\n  COMPOUND RESULTS (Dense PPL={dense_ppl:.2f}):")
    print(f"  {'Handicap':<38s} {'PPL':>8s} {'vs Dense':>10s}")
    print(f"  " + "-" * 58)
    for r in compound:
        diff = r["test_ppl"] - dense_ppl
        marker = "★" if r["test_ppl"] < dense_ppl else "✗"
        print(f"  {r['handicap']:<38s} {r['test_ppl']:>7.2f} {diff:>+9.2f} {marker}")

    # ═══════════════════════════════════════════════════════════════════════
    # PHASE 4: FLOP-MATCHED
    # ═══════════════════════════════════════════════════════════════════════

    print("\n" + "=" * 70)
    print("PHASE 4: FLOP-MATCHED — Same compute budget, who wins?")
    print("=" * 70)

    cuda_cleanup()
    torch.manual_seed(BASE_SEED)

    # Calculate FLOP-matched ff_dim
    moe_ref = NanoMoEModel(V, DEFAULT_D_MODEL, DEFAULT_N_HEADS, DEFAULT_N_LAYERS,
                            DEFAULT_N_EXPERTS, DEFAULT_FF_DIM, DEFAULT_TOP_K)
    moe_flops = moe_ref.flops_per_token()
    del moe_ref; cuda_cleanup()

    dense_ref = DenseTransformerFlops(V, DEFAULT_D_MODEL, DEFAULT_N_HEADS,
                                      DEFAULT_N_LAYERS, DEFAULT_FF_DIM)
    dense_flops = dense_ref.flops_per_token()
    del dense_ref; cuda_cleanup()

    print(f"  NanoMoE FLOPs/token: {moe_flops:,}")
    print(f"  Dense FLOPs/token:   {dense_flops:,}")

    d = DEFAULT_D_MODEL
    target_per_layer = moe_flops / DEFAULT_N_LAYERS
    ff_matched = int((target_per_layer - 4*d*d - 2*SEQ_LEN*d) / (2*d))
    ff_matched = max(ff_matched, d)
    print(f"  → Dense needs ff_dim={ff_matched} to match MoE FLOPs")

    # FLOP-matched dense
    cuda_cleanup()
    torch.manual_seed(BASE_SEED)
    print(f"\n  --- Dense-FLOPmatched (ff={ff_matched}) ---")
    dense_fm = DenseTransformerFlops(V, DEFAULT_D_MODEL, DEFAULT_N_HEADS,
                                     DEFAULT_N_LAYERS, ff_matched)
    print(f"    Params: {count_params(dense_fm):,}")
    print(f"    FLOPs/token: {dense_fm.flops_per_token():,}")
    r_flop_dense = train_and_eval(dense_fm, f"Dense-ff{ff_matched}", data, is_moe=False)
    del dense_fm; cuda_cleanup()

    # Standard MoE
    cuda_cleanup()
    torch.manual_seed(BASE_SEED)
    print(f"\n  --- NanoMoE (same FLOPs comparison) ---")
    moe_fm = NanoMoEModel(V, DEFAULT_D_MODEL, DEFAULT_N_HEADS, DEFAULT_N_LAYERS,
                           DEFAULT_N_EXPERTS, DEFAULT_FF_DIM, DEFAULT_TOP_K)
    print(f"    Params: {count_params(moe_fm):,}")
    print(f"    FLOPs/token: {moe_fm.flops_per_token():,}")
    r_flop_moe = train_and_eval(moe_fm, "NanoMoE-ref", data, is_moe=True)
    del moe_fm; cuda_cleanup()

    all_results["phase4_flop_matched"] = {
        "dense_flops": dense_flops,
        "moe_flops": moe_flops,
        "ff_matched": ff_matched,
        "dense_result": r_flop_dense,
        "moe_result": r_flop_moe,
    }

    print(f"\n  FLOP-MATCHED RESULTS:")
    print(f"    Dense (ff={ff_matched}): PPL={r_flop_dense['test_ppl']:.2f}  "
          f"acc={r_flop_dense['test_acc']*100:.1f}%  params={r_flop_dense['params']:,}")
    print(f"    NanoMoE (16exp,top2):  PPL={r_flop_moe['test_ppl']:.2f}  "
          f"acc={r_flop_moe['test_acc']*100:.1f}%  params={r_flop_moe['params']:,}")

    if r_flop_moe["test_ppl"] < r_flop_dense["test_ppl"]:
        adv = (1 - r_flop_moe["test_ppl"] / r_flop_dense["test_ppl"]) * 100
        print(f"    ★ NanoMoE wins EVEN when dense gets same compute budget! ({adv:.1f}% better)")
    else:
        print(f"    Dense wins when given same FLOPs")

    # ═══════════════════════════════════════════════════════════════════════
    # SAVE
    # ═══════════════════════════════════════════════════════════════════════

    with open("test_20b_results.json", "w") as f:
        json.dump(all_results, f, indent=2, default=str)
    print(f"\nResults saved to test_20b_results.json")

    # ═══════════════════════════════════════════════════════════════════════
    # COMBINED SUMMARY
    # ═══════════════════════════════════════════════════════════════════════

    print("\n" + "=" * 70)
    print("CONTINUATION SUMMARY")
    print("=" * 70)
    print(f"Dense baseline: PPL={dense_ppl:.2f}")
    print(f"\nH6 (network tax, 2000 steps):")
    for r in h6:
        diff = r["test_ppl"] - dense_ppl
        marker = "★" if r["test_ppl"] < dense_ppl else "✗"
        print(f"  +{r.get('tax_ms',0):>2d}ms: PPL={r['test_ppl']:.2f} ({diff:>+.2f}) {marker}")
    print(f"\nPhase 3 (compound handicaps):")
    for r in compound:
        diff = r["test_ppl"] - dense_ppl
        marker = "★" if r["test_ppl"] < dense_ppl else "✗"
        print(f"  {r['handicap']}: PPL={r['test_ppl']:.2f} ({diff:>+.2f}) {marker}")
    print(f"\nPhase 4 (FLOP-matched):")
    print(f"  Dense-ff{ff_matched}: PPL={r_flop_dense['test_ppl']:.2f}")
    print(f"  NanoMoE:    PPL={r_flop_moe['test_ppl']:.2f}")
