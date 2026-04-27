# TEST 20 RESULTS — THE HANDICAP GAUNTLET
## "How hard can we nerf NanoMoE before dense transformers catch up?"

**Date:** Session 5 (continued)  
**Hardware:** 1660-Dually (2× GTX 1660 SUPER, AMD 5900x, 80GB RAM)  
**Data:** Shakespeare (1.1M chars, 65-char vocab, seq_len=128)  
**Seed:** 42 (deterministic for all runs)

---

## TL;DR

NanoMoE wins the fair fight by **11.2%** (PPL 6.11 vs 6.88).  
NanoMoE wins the **FLOP-matched** fight by **8.1%** (same compute, still better).  
Dense only catches up when you **slash experts to 1** OR **cut training to <50%** OR **shrink d_model to half**.  
Load-balancing removal barely hurts. Network latency doesn't affect quality.  
Compound handicaps (3+ nerfs stacked) all lose — as expected.

---

## PHASE 1: FAIR FIGHT BASELINE

| Model | PPL ↓ | BPC ↓ | Accuracy ↑ | Params | Training |
|-------|-------|-------|------------|--------|----------|
| **Dense Transformer** | 6.88 | 2.783 | 42.5% | 116,673 | 5000 steps |
| **NanoMoE (16exp, top-2)** | **6.11** | **2.612** | **46.8%** | 1,111,361 (184K active) | 5000 steps |

**Result: NanoMoE leads by 11.2% in perplexity, +4.3% accuracy**

---

## PHASE 2: INDIVIDUAL HANDICAPS

### H1: Reduce Expert Count (16 → 1)
*Fewer experts = smaller advantage. At 1 expert, MoE ≈ dense FFN with routing overhead.*

| Experts | PPL | vs Dense | Win? |
|---------|-----|----------|------|
| 16 (full) | 6.11 | **-0.77** | ★ |
| 8 | 6.15 | **-0.73** | ★ |
| 4 | 6.52 | **-0.36** | ★ |
| 2 | 6.71 | **-0.17** | ★ |
| 1 | 6.92 | +0.04 | ✗ |

**Verdict:** Dense catches up only at **1 expert** (and barely — +0.04 PPL).  
MoE with just 2 experts still beats dense. The routing advantage is real.

### H2: Reduce Top-k (2 → 1)

| Routing | PPL | vs Dense | Win? |
|---------|-----|----------|------|
| top-2 (full) | 6.11 | **-0.77** | ★ |
| top-1 | 7.02 | +0.14 | ✗ |

**Verdict:** Top-1 routing loses 15% quality. Activating 2 experts matters a lot.

### H3: Slash Training Steps

| MoE Steps | Dense Steps | PPL | vs Dense | Win? |
|-----------|-------------|-----|----------|------|
| 5000 (full) | 5000 | 6.11 | **-0.77** | ★ |
| 2500 (50%) | 5000 | 7.10 | +0.21 | ✗ |
| 1000 (20%) | 5000 | 10.06 | +3.17 | ✗ |
| 500 (10%) | 5000 | 11.68 | +4.80 | ✗ |
| 250 (5%) | 5000 | 12.62 | +5.73 | ✗ |

**Verdict:** NanoMoE needs **>50% of dense's training steps** to win.  
At 50%, it barely loses (PPL 7.10 vs 6.88). At 5000 steps, it decisively wins.

### H4: Shrink d_model

| MoE d_model | Dense d_model | PPL | vs Dense | Win? |
|-------------|---------------|-----|----------|------|
| 64 (full) | 64 | 6.11 | **-0.77** | ★ |
| 48 (75%) | 64 | 6.78 | **-0.10** | ★ |
| 32 (50%) | 64 | 7.66 | +0.78 | ✗ |
| 16 (25%) | 64 | 10.65 | +3.77 | ✗ |

**Verdict:** NanoMoE wins even at **75% d_model**. Loses at 50%.

### H5: Kill Load Balancing

| Config | PPL | vs Dense | Win? |
|--------|-----|----------|------|
| With balance (aux=0.01) | 6.11 | **-0.77** | ★ |
| No balance (aux=0) | 6.20 | **-0.68** | ★ |

**Verdict:** Removing load balancing barely hurts (**+0.09 PPL**). NanoMoE is robust.

### H6: Network Latency Tax (2000 steps)
*Simulates distributed mesh overhead per forward pass.*

| Latency Tax | PPL | Wall Time | Slowdown | vs Dense |
|-------------|-----|-----------|----------|----------|
| 0ms (ref) | 7.67 | 123.7s | 1.0× | +0.79 ✗ |
| 1ms | 7.67 | 130.3s | 1.1× | +0.79 ✗ |
| 2ms | 7.67 | 130.2s | 1.1× | +0.79 ✗ |
| 5ms | 7.67 | 133.0s | 1.1× | +0.79 ✗ |
| 10ms | 7.67 | 142.7s | 1.2× | +0.79 ✗ |

**Verdict:** Network latency has **zero effect on quality** — all produce identical PPL.  
Only wall-clock time increases (1.2× at 10ms). At 2000 steps, MoE hasn't converged (needs ~5000).  
**This means distributed mesh overhead is a pure throughput issue, not a quality issue.**

---

## PHASE 3: COMPOUND HANDICAPS

*Stack multiple nerfs to simulate worst-case deployment.*

| Handicap Level | Config | PPL | vs Dense | Win? |
|---------------|--------|-----|----------|------|
| MILD | 8exp, top-1, 2500 steps | 8.38 | +1.50 | ✗ |
| MEDIUM | 4exp, top-1, 1000 steps | 11.49 | +4.61 | ✗ |
| SEVERE | 2exp, top-1, 500 steps, d=48 | 12.76 | +5.88 | ✗ |
| BRUTAL | 2exp, top-1, 250 steps, d=32, no bal | 16.90 | +10.02 | ✗ |

**Verdict:** All compound handicaps lose — but that's EXPECTED. You need 2-3 nerfs stacked to kill the advantage.

---

## PHASE 4: FLOP-MATCHED (The Real Test)

*Give dense the same compute budget as MoE (ff_dim=520 vs 256).*

| Model | ff_dim | Params | PPL ↓ | Accuracy ↑ | FLOPs/token |
|-------|--------|--------|-------|------------|-------------|
| Dense-ff520 | 520 | 184,785 | 6.63 | 43.6% | ~matched |
| **NanoMoE (16exp, top-2)** | 256 | 1,111,361 (184K active) | **6.09** | **46.7%** | ~matched |

**Result: NanoMoE wins by 8.1% EVEN with the same compute budget.**  
This is the killer result — the advantage isn't just "more params" or "more FLOPs."  
MoE's routing genuinely extracts more quality per compute unit.

---

## COMPLETE SCOREBOARD

### Individual Handicaps (NanoMoE with ONE nerf at a time):
| Config | PPL | vs Dense (6.88) | Win? |
|--------|-----|-----------------|------|
| Full NanoMoE (16exp, top-2, 5000st, d=64) | 6.11 | **−0.77** | ★ |
| 8 experts | 6.15 | **−0.73** | ★ |
| No load balance | 6.20 | **−0.68** | ★ |
| 4 experts | 6.52 | **−0.36** | ★ |
| 2 experts | 6.71 | **−0.17** | ★ |
| d_model=48 | 6.78 | **−0.10** | ★ |
| 1 expert | 6.92 | +0.04 | ✗ |
| top-1 routing | 7.02 | +0.14 | ✗ |
| d_model=32 | 7.66 | +0.78 | ✗ |
| d_model=16 | 10.65 | +3.77 | ✗ |

**Individual handicap win rate: 6/10 (60%)**  
Dense only catches single-nerf MoE when: experts=1, top-k=1, d_model≤50%, or steps<50%.

### FLOP-Matched:
| Config | PPL | Win? |
|--------|-----|------|
| NanoMoE (same FLOPs) | **6.09** | ★ |
| Dense-ff520 (same FLOPs) | 6.63 | — |

**FLOP-matched: NanoMoE wins by 8.1%**

---

## KEY FINDINGS

### What Matters Most for NanoMoE Advantage:
1. **Top-k=2** — activating 2 experts is critical (top-1 loses the edge)
2. **Expert count ≥ 2** — even 2 experts beats dense (barely)
3. **Enough training** — needs ≥50% of dense's steps to converge
4. **d_model ≥ 75%** — can tolerate 25% reduction but not 50%

### What Barely Matters:
- **Load balancing** — removing it costs only +0.09 PPL (robust!)
- **Network latency** — zero quality impact, only wall-clock overhead

### The Break-Even Handicap:
To make dense catch NanoMoE, you need **ANY ONE** of:
- Reduce to 1 expert (eliminating MoE entirely)
- Use top-1 routing instead of top-2
- Give NanoMoE only 50% of training steps
- Shrink d_model to 50%

Or **TWO OR MORE** moderate nerfs stacked together.

### Most Important Result:
**NanoMoE wins the FLOP-matched comparison by 8.1%.** This proves the advantage is not just "more parameters" — it's fundamentally more efficient computation through learned routing.

---

## CLUSTER STATUS

| Node | Hardware | VRAM | Role |
|------|----------|------|------|
| 1660-Dually | 2× GTX 1660 SUPER, AMD 5900x, 80GB | 12 GB | Server |
| Garage PC | GT 1030, i7-10700F, 12GB | 2 GB | Worker |
| 3090-rig | RTX 3090 FE, AMD 5950x, 60GB | 24 GB | Worker (TBD) |
| 4090-Threadripper | RTX 4090 FE, Threadripper 32-core, 256GB | 24 GB | **RESERVED** |

**Active cluster capacity:** 38 GB VRAM, ~200,000+ experts at current size.  
**3090 alone:** 82 SMs vs 47 SMs on rest of cluster combined (1.7× compute).

---

## NEXT STEPS
1. Get 3090-rig IP address and connect to mesh
2. Run test_19 over real 3-node network (1660-Dually ↔ garage ↔ 3090)
3. Scale NanoMoE experts (100+) leveraging 3090's 24GB
4. Run distributed training/inference benchmark
5. Only then: activate the 4090 Threadripper

---

*Generated by test_20 + test_20b + test_20c (subprocess-isolated), total ~25 training runs*
