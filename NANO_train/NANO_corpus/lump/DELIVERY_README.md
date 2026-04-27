# NANO SEA v2 — Delivery Package for Development

## What This Is

You are building the **Nano Sea**: a swarm intelligence system where thousands to millions
of tiny neural networks ("nanos") collaborate to generate code, replacing LLMs over time.

This package contains:
1. **Research results** from 30 validated experiments (proof the math works)
2. **A complete build specification** (what to build, file by file)
3. **Reference implementations** (pre-solved PyTorch code for all hard algorithmic problems)
4. **Background theory** (the philosophical framework — helpful context, not required reading)

---

## FILES TO READ (In Order)

### MANDATORY (Read these before writing any code)

| Priority | File | What It Contains |
|----------|------|-----------------|
| **1** | `NANO_SEA_V2_BUILD_SPEC.md` | The DEFINITIVE build specification. Every component, every interface, every file, build order. START HERE. |
| **2** | `nano_sea_v2_reference.py` | Working PyTorch reference implementations for all hard problems. Copy/adapt these — do NOT re-derive the math. |
| **3** | `agent_meta_architecture_action_plan.json` | The META-AGENT shell (memory fabric, script executor, CLI). This wraps AROUND the nano sea. Build the nano sea first, then integrate. |

### CONTEXT (Read if you need background on WHY decisions were made)

| File | What It Contains | Read When |
|------|-----------------|-----------|
| `action_plan/ARCHITECTURE_COMPLETION.md` | Full mathematical translations of framework concepts → novel ML math. 1906 lines. | When you need the derivation behind chromatic routing, touch tensors, cosmic cycles, etc. |
| `action_plan/experiments/test_30_SUMMARY.md` | Results from the final integration test (4 versions). Proves soft-k routing works. | When you need to understand WHY v3 soft-k was chosen over alternatives. |
| `action_plan/TRANSITION_ROADMAP.md` | Strategic roadmap for going from research → production. | When planning multi-week development schedule. |
| `action_plan/01_CORE_PRINCIPLES.md` | RBY axioms, UF/IO dynamics, foundational math. 90% still valid. | When implementing RBY seed system or UF/IO tracking. |
| `action_plan/COMPLETENESS_AUDIT_SESSION5.md` | Forensic audit of what's proven vs dead vs missing. | When you're confused about whether a component in the old specs is current. |

### REFERENCE ONLY (Experiment scripts — don't read unless debugging specific math)

| Files | What They Are |
|-------|--------------|
| `action_plan/experiments/test_01_*.py` through `test_30*.py` | 30 test scripts that validated individual components. The RESULTS matter (captured in BUILD_SPEC), not the test code itself. |
| `action_plan/experiments/*_results.json` | Raw JSON results from each test. |

### DO NOT READ (Dead or superseded)

| Files | Why Skip |
|-------|----------|
| `action_plan/02_NANO_ANATOMY.md` | 80% references dead nano types (FeatureNano, PatternNano, etc.) |
| `action_plan/03_NANO_SEA_LIFECYCLE.md` | 84% references dead spawning/type system |
| `action_plan/04_DEPOSIT_SYSTEM.md` | 72% references dead nano types for deposit extraction |
| `action_plan/05_IC_AE_FRACTAL_ENGINE.md` | 100% dead — old "collision/bridge" system entirely replaced by expert crosstalk |
| `action_plan/06_RBY_SEED_AND_PTAIE.md` | 74% dead — per-nano RBY and old routing. Valid parts captured in BUILD_SPEC. |
| `action_plan/08_INFERENCE_AND_INTERACTION.md` | 70% dead — old Shatter→Ripple→Activate pipeline replaced by swarm layers |
| `action_plan/09_IMPLEMENTATION_ARCHITECTURE.md` | 63% dead — old module layout |
| `action_plan/10_BOOTSTRAP_CODE.md` | 69% dead — old bootstrap for dead nano types |
| `action_plan/13_ROADMAP.md` | 65% dead — sprint plan references bridges, IC-AE collisions, old types |
| `weirdAI*.md` files | Philosophical source material. Interesting but not needed for implementation. |
| `action_plan/ADVERSARIAL_AUDIT.md` | Red-team audit of old (pre-pivot) architecture |
| `action_plan/AUDIT_REPORT.md` | Old audit, superseded by Session 5 audit |

---

## THE ARCHITECTURE IN 30 SECONDS

```
Input tokens
    │
    ▼
┌─────────────────────────┐
│  SHARED EMBEDDING       │  ← One copy. All nanos share this vocabulary.
│  (vocab × d_model)      │     Includes optional PTAIE spectral prior.
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  SWARM LAYER 1          │  ← Pool of thousands of nanos.
│  ChromaticIndex picks   │     Router selects top-k per token.
│  8 best nanos per token │     Weighted combination of outputs.
│  from among thousands   │     SOFT routing (differentiable).
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  SWARM LAYER 2 ...N     │  ← More layers = more abstraction.
│  (same structure)       │     Each layer has its OWN nano pool.
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  SHARED OUTPUT HEAD     │  ← One copy. Converts combined signal → tokens.
│  (d_model → vocab)      │
└─────────────────────────┘
    │
    ▼
Output tokens
```

**Key insight:** Individual nanos are tiny (1K-50K params). But 8 nanos activated
together per token × 3 layers = 24 nano activations per token = enough combined
capacity for coherent generation. With thousands of nanos total, the system has
massive capacity — it just activates a small subset per token.

---

## PROVEN RESEARCH RESULTS (From 30 Tests)

These are facts, not assumptions. The coding LLM should treat these as constraints:

| Finding | Test | Implication |
|---------|------|-------------|
| MoE (multiple experts) beats Dense (one big model) by 8-10% at same params | test_20c, test_30 | The swarm approach is fundamentally sound |
| Soft differentiable k-selection (reverse cumsum) is the best routing method | test_30v3 | Use this exact routing math — do NOT use argmax or hard top-k |
| Forcing high k wastes compute at small scale; let the model find natural k | test_30v4 | Don't hardcode top-k count. Let the router learn it. |
| Chromatic routing (Aitchison distance on RBY simplex) works and gives interpretable expert positions | test_22 | Use this for the ChromaticIndex spatial lookup |
| Expert crosstalk (cross-attention within layer) improves results; learned gate starts at 0 | test_24 | Include crosstalk module in swarm layers |
| Touch tensor (logging which nanos activate for which inputs) provides useful lifecycle signal | test_25 | Log touch events for fitness/death decisions |
| Cosmic cycles (train → compress → deposit → rebuild) improve models over successive cycles | test_26 | The lifecycle engine should run cosmic cycles |
| Deposit-guided initialization beats random init | test_27 | New nanos should warm-start from deposits when available |
| PTAIE spectral embedding helps early convergence but learned embedding dominates eventually | test_28 | Include PTAIE as optional prior with learned residual |
| Multi-layer stacking helps; 3 layers optimal at ~500K total params | test_21 | Use 3 swarm layers as default |
| Parallel GPU works with torch.multiprocessing spawn method, 1.6x speedup on 2 GPUs | test_30 | Use spawn for multi-GPU, each worker loads own data |

---

## WHAT TO BUILD FIRST

See `NANO_SEA_V2_BUILD_SPEC.md` for the complete phased build plan. Quick summary:

```
Phase 1: Core (Shared Embedding + Universal Nano + SwarmLayer + Output Head)
         → Can generate text (badly) with random-init nanos

Phase 2: Routing (ChromaticIndex + Soft-k Router + RBY projection)
         → Correct nanos activate for correct inputs

Phase 3: Training (End-to-end swarm training + Validated Midwife)
         → Nanos actually learn from data

Phase 4: Lifecycle (Spawner + Fitness + Compression + Deposits + Cosmic Cycles)
         → The sea grows, evolves, and improves over time

Phase 5: Memory (Paging GPU↔CPU↔Disk + Prefetch)
         → Scale to millions of nanos

Phase 6: Mesh (Peer discovery + Federated averaging + Trust)
         → Distributed across machines

Phase 7: Integration (Meta-agent shell + IDE connection)
         → The nano sea replaces LLM calls in the IDE agent
```

---

## HARDWARE

The primary development/test machine:

- **GPU:** 2× GTX 1660 SUPER (6GB VRAM each)
- **CPU:** AMD Ryzen 5900x (12 cores / 24 threads)
- **RAM:** 80GB DDR4
- **Storage:** NVMe primary
- **OS:** Windows
- **Python:** 3.13+ with PyTorch CUDA
- **Codename:** 1660-Dually

A 3090 (24GB VRAM) is available for scaling tests.

All Phase 1-5 code must fit in 6GB VRAM. Design for the 1660, run on anything bigger as a bonus.
