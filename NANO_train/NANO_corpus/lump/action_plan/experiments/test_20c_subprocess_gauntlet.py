#!/usr/bin/env python3
"""
TEST 20c — Compound Handicaps + FLOP-matched (subprocess isolation)
Each experiment runs in its own subprocess for CUDA stability.
"""
import subprocess, sys, json, os

PYTHON = os.path.join(os.path.dirname(__file__), "..", "..", ".venv", "Scripts", "python.exe")
PYTHON = os.path.normpath(PYTHON)

# Dense baseline from Phase 1
DENSE_PPL = 6.88

EXPERIMENT_CODE = r'''
import os, sys, time, math, json, gc
import torch, torch.nn as nn, torch.nn.functional as F

device = "cuda:0" if torch.cuda.is_available() else "cpu"
SEQ_LEN = 128
BATCH = 64

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

def load_data():
    with open(os.path.join(DATA_DIR, "shakespeare.txt"), "r", encoding="utf-8") as f:
        text = f.read()
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

def get_batch(split, bs):
    ix = torch.randint(len(split) - SEQ_LEN - 1, (bs,))
    x = torch.stack([split[i:i+SEQ_LEN] for i in ix]).to(device)
    y = torch.stack([split[i+1:i+SEQ_LEN+1] for i in ix]).to(device)
    return x, y

class CausalSelfAttention(nn.Module):
    def __init__(self, d, nh, dropout=0.1):
        super().__init__()
        self.n_heads, self.head_dim = nh, d // nh
        self.qkv = nn.Linear(d, 3*d)
        self.proj = nn.Linear(d, d)
        self.attn_drop = nn.Dropout(dropout)
        self.proj_drop = nn.Dropout(dropout)
        self.register_buffer("mask", torch.tril(torch.ones(SEQ_LEN, SEQ_LEN)).unsqueeze(0).unsqueeze(0))
    def forward(self, x):
        B,T,C = x.shape
        qkv = self.qkv(x).reshape(B,T,3,self.n_heads,self.head_dim).permute(2,0,3,1,4)
        q,k,v = qkv[0],qkv[1],qkv[2]
        att = (q @ k.transpose(-2,-1)) * (self.head_dim**-0.5)
        att = att.masked_fill(self.mask[:,:,:T,:T]==0, float('-inf'))
        att = self.attn_drop(F.softmax(att, dim=-1))
        y = (att @ v).transpose(1,2).contiguous().reshape(B,T,C)
        return self.proj_drop(self.proj(y))

class TransformerBlock(nn.Module):
    def __init__(self, d, nh, ff, dropout=0.1):
        super().__init__()
        self.ln1 = nn.LayerNorm(d)
        self.attn = CausalSelfAttention(d, nh, dropout)
        self.ln2 = nn.LayerNorm(d)
        self.ff = nn.Sequential(nn.Linear(d,ff), nn.GELU(), nn.Dropout(dropout), nn.Linear(ff,d), nn.Dropout(dropout))
    def forward(self, x):
        x = x + self.attn(self.ln1(x))
        x = x + self.ff(self.ln2(x))
        return x

class DenseTransformer(nn.Module):
    def __init__(self, V, d=64, nh=4, nl=2, ff=256, dropout=0.1):
        super().__init__()
        self.tok = nn.Embedding(V, d); self.pos = nn.Embedding(SEQ_LEN, d)
        self.drop = nn.Dropout(dropout)
        self.blocks = nn.ModuleList([TransformerBlock(d, nh, ff, dropout) for _ in range(nl)])
        self.ln = nn.LayerNorm(d); self.head = nn.Linear(d, V)
    def forward(self, x):
        B,T=x.shape; x=self.drop(self.tok(x)+self.pos(torch.arange(T,device=x.device)))
        for b in self.blocks: x=b(x)
        return self.head(self.ln(x))

class BatchedExperts(nn.Module):
    def __init__(self, ne, d, ff, dropout=0.1):
        super().__init__()
        self.ne, self.d, self.ff_dim = ne, d, ff
        self.W1 = nn.Parameter(torch.randn(ne,d,ff)*(2/d)**0.5)
        self.b1 = nn.Parameter(torch.zeros(ne,1,ff))
        self.W2 = nn.Parameter(torch.randn(ne,ff,d)*(2/ff)**0.5)
        self.b2 = nn.Parameter(torch.zeros(ne,1,d))
        self.dropout = nn.Dropout(dropout)
    def forward(self, x):
        h = F.gelu(torch.bmm(x, self.W1)+self.b1); h = self.dropout(h)
        return torch.bmm(h, self.W2)+self.b2

class TopKRouter(nn.Module):
    def __init__(self, d, ne, tk=2, noise=0.1):
        super().__init__()
        self.ne, self.top_k = ne, min(tk,ne)
        self.gate = nn.Linear(d, ne, bias=False); self.noise = noise
    def forward(self, x):
        B,T,D=x.shape; logits=self.gate(x)
        if self.training and self.noise>0: logits=logits+torch.randn_like(logits)*self.noise
        tv,ti=logits.topk(self.top_k, dim=-1); w=F.softmax(tv, dim=-1)
        probs=F.softmax(logits, dim=-1); m=F.one_hot(ti[:,:,0],self.ne).float()
        aux=self.ne*(m.mean(dim=(0,1))*probs.mean(dim=(0,1))).sum()
        return w, ti, aux

class MoEBlock(nn.Module):
    def __init__(self, d, nh, ne, ff, tk=2, dropout=0.1):
        super().__init__()
        self.ln1=nn.LayerNorm(d); self.attn=CausalSelfAttention(d,nh,dropout)
        self.ln2=nn.LayerNorm(d); self.router=TopKRouter(d,ne,tk)
        self.experts=BatchedExperts(ne,d,ff,dropout); self.ne,self.d=ne,d
    def forward(self, x):
        B,T,D=x.shape; x=x+self.attn(self.ln1(x)); res=x; n=self.ln2(x)
        w,idx,aux=self.router(n)
        fl=n.reshape(B*T,D).unsqueeze(0).expand(self.ne,-1,-1)
        ao=self.experts(fl).permute(1,0,2).reshape(B,T,self.ne,D)
        sel=ao.gather(2, idx.unsqueeze(-1).expand(-1,-1,-1,D))
        return res+(sel*w.unsqueeze(-1)).sum(dim=2), aux

class NanoMoE(nn.Module):
    def __init__(self, V, d=64, nh=4, nl=2, ne=8, ff=256, tk=2, dropout=0.1):
        super().__init__()
        self.d, self.nl, self.ne, self.tk = d, nl, ne, tk
        self.tok=nn.Embedding(V,d); self.pos=nn.Embedding(SEQ_LEN,d)
        self.drop=nn.Dropout(dropout)
        self.blocks=nn.ModuleList([MoEBlock(d,nh,ne,ff,tk,dropout) for _ in range(nl)])
        self.ln=nn.LayerNorm(d); self.head=nn.Linear(d,V)
    def forward(self, x):
        B,T=x.shape; x=self.drop(self.tok(x)+self.pos(torch.arange(T,device=x.device)))
        aux_t=0.0
        for b in self.blocks: x,a=b(x); aux_t+=a
        return self.head(self.ln(x)), aux_t

@torch.no_grad()
def evaluate(model, split, moe=False, nb=30):
    model.eval(); tl=tc=tt=0
    for _ in range(nb):
        x,y = get_batch(split, BATCH)
        logits = model(x)[0] if moe else model(x)
        tl += F.cross_entropy(logits.reshape(-1,logits.shape[-1]),y.reshape(-1)).item()
        tc += (logits.argmax(-1)==y).sum().item(); tt += y.numel()
    l=tl/nb
    return {"loss":l, "ppl":math.exp(min(l,20)), "acc":tc/tt, "bpc":l/math.log(2)}

def train_eval(model, name, data, moe=False, steps=5000, lr=1e-3, aux_w=0.01):
    model.to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)
    warmup = min(200, steps//5)
    def lr_fn(s):
        if s<warmup: return s/max(warmup,1)
        return 0.5*(1+math.cos(math.pi*(s-warmup)/max(1,steps-warmup)))
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lr_fn)
    t0=time.time(); tot=0
    for s in range(1, steps+1):
        model.train(); x,y=get_batch(data["train"],BATCH)
        if moe:
            lo,aux=model(x); loss=F.cross_entropy(lo.reshape(-1,lo.shape[-1]),y.reshape(-1))+aux_w*aux
        else:
            lo=model(x); loss=F.cross_entropy(lo.reshape(-1,lo.shape[-1]),y.reshape(-1))
        opt.zero_grad(); loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(),1.0)
        opt.step(); sched.step(); tot+=BATCH*SEQ_LEN
        if s%1000==0 or s==steps:
            m=evaluate(model,data["val"],moe,10); elapsed=time.time()-t0
            print(f"  [{name}] Step {s:5d} | ppl={m['ppl']:.1f} acc={m['acc']*100:.1f}% | {tot/elapsed:.0f} tok/s")
    m=evaluate(model,data["test"],moe,30); elapsed=time.time()-t0
    return {"name":name, "params":sum(p.numel() for p in model.parameters()),
            "test_ppl":m["ppl"], "test_acc":m["acc"], "test_bpc":m["bpc"],
            "test_loss":m["loss"], "time_s":elapsed, "steps":steps}
'''

def run_experiment(label, code_body):
    """Run one experiment in a fresh subprocess, return result dict."""
    script = EXPERIMENT_CODE + "\n\n" + code_body
    tmp = os.path.join(os.path.dirname(__file__), f"_tmp_exp_{label}.py")
    with open(tmp, "w") as f:
        f.write(script)
    try:
        env = os.environ.copy()
        env["CUDA_LAUNCH_BLOCKING"] = "1"
        result = subprocess.run(
            [PYTHON, tmp], capture_output=True, text=True,
            timeout=600, env=env
        )
        print(result.stdout)
        if result.returncode != 0:
            print(f"  ERROR in {label}:")
            print(result.stderr[-500:] if len(result.stderr) > 500 else result.stderr)
            return None
        # Parse JSON from last line
        lines = result.stdout.strip().split("\n")
        for line in reversed(lines):
            line = line.strip()
            if line.startswith("{"):
                return json.loads(line)
        return None
    except subprocess.TimeoutExpired:
        print(f"  TIMEOUT in {label}")
        return None
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


if __name__ == "__main__":
    print("=" * 70)
    print("TEST 20c — HANDICAP GAUNTLET (subprocess isolation)")
    print(f"Dense baseline: PPL={DENSE_PPL:.2f}")
    print("=" * 70)

    all_results = {}

    # ── Compound 1: MILD (8exp, top-1, 2500 steps)
    print("\n── MILD compound: 8 experts, top-1, 2500 steps ──")
    r = run_experiment("mild", """
torch.manual_seed(42)
data = load_data()
V = data["vocab_size"]
m = NanoMoE(V, 64, 4, 2, 8, 256, 1)
r = train_eval(m, "MILD(8exp,top1,2500st)", data, moe=True, steps=2500)
r["handicap"] = "8exp + top1 + 2500 steps"
import json; print(json.dumps(r))
""")
    if r:
        all_results["compound_mild"] = r

    # ── Compound 2: MEDIUM (4exp, top-1, 1000 steps)
    print("\n── MED compound: 4 experts, top-1, 1000 steps ──")
    r = run_experiment("med", """
torch.manual_seed(42)
data = load_data()
V = data["vocab_size"]
m = NanoMoE(V, 64, 4, 2, 4, 256, 1)
r = train_eval(m, "MED(4exp,top1,1000st)", data, moe=True, steps=1000)
r["handicap"] = "4exp + top1 + 1000 steps"
import json; print(json.dumps(r))
""")
    if r:
        all_results["compound_med"] = r

    # ── Compound 3: SEVERE (2exp, top-1, 500 steps, d=48)
    print("\n── SEVERE compound: 2 experts, top-1, 500 steps, d=48 ──")
    r = run_experiment("severe", """
torch.manual_seed(42)
data = load_data()
V = data["vocab_size"]
m = NanoMoE(V, 48, 3, 2, 2, 256, 1)
r = train_eval(m, "SEVERE(2exp,top1,500st,d48)", data, moe=True, steps=500)
r["handicap"] = "2exp + top1 + 500 steps + d_model=48"
import json; print(json.dumps(r))
""")
    if r:
        all_results["compound_severe"] = r

    # ── Compound 4: BRUTAL (2exp, top-1, 250 steps, d=32, no balance)
    print("\n── BRUTAL compound: 2 experts, top-1, 250 steps, d=32, no balance ──")
    r = run_experiment("brutal", """
torch.manual_seed(42)
data = load_data()
V = data["vocab_size"]
m = NanoMoE(V, 32, 2, 2, 2, 256, 1)
r = train_eval(m, "BRUTAL(2exp,top1,250st,d32,noBal)", data, moe=True, steps=250, aux_w=0.0)
r["handicap"] = "2exp + top1 + 250 steps + d_model=32 + no balance"
import json; print(json.dumps(r))
""")
    if r:
        all_results["compound_brutal"] = r

    # ── FLOP-matched: give Dense a bigger ff_dim to match MoE compute
    print("\n── FLOP-MATCHED: Dense with bigger ff_dim vs standard NanoMoE ──")
    r = run_experiment("flop_dense", """
torch.manual_seed(42)
data = load_data(); V = data["vocab_size"]
# MoE FLOPs: attn(4*64*64 + 2*128*64)*2 = (16384+16384)*2 = 65536
# + expert: top2 * 2*64*256 * 2_layers = 2*32768*2 = 131072
# + router: 64*16*2 = 2048
# Total ~198656
# Dense FLOPs: (4*64*64 + 2*128*64 + 2*64*ff)*2
# Need ff such that (16384+16384+128*ff)*2 = 198656
# 32768+128*ff = 99328 → ff = (99328-32768)/128 = 520
ff_matched = 520
m = DenseTransformer(V, 64, 4, 2, ff_matched)
r = train_eval(m, f"Dense-ff{ff_matched}", data, moe=False, steps=5000)
r["ff_matched"] = ff_matched
import json; print(json.dumps(r))
""")
    if r:
        all_results["flop_dense"] = r

    r = run_experiment("flop_moe", """
torch.manual_seed(42)
data = load_data(); V = data["vocab_size"]
m = NanoMoE(V, 64, 4, 2, 16, 256, 2)
r = train_eval(m, "NanoMoE-16exp-top2", data, moe=True, steps=5000)
import json; print(json.dumps(r))
""")
    if r:
        all_results["flop_moe"] = r

    # ── SUMMARY ──
    print("\n" + "=" * 70)
    print("TEST 20c — RESULTS SUMMARY")
    print(f"Dense baseline: PPL={DENSE_PPL:.2f}")
    print("=" * 70)

    for key, r in all_results.items():
        if r:
            diff = r["test_ppl"] - DENSE_PPL
            marker = "★" if r["test_ppl"] < DENSE_PPL else "✗"
            hc = r.get("handicap", key)
            print(f"  {hc:<45s} PPL={r['test_ppl']:.2f}  ({diff:>+.2f}) {marker}")

    with open("test_20c_results.json", "w") as f:
        json.dump(all_results, f, indent=2, default=str)
    print(f"\nSaved to test_20c_results.json")
