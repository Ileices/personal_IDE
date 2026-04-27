# ILEICES HPC — Spec Addendum: Deep Router & HPC Meta-Nanos

## Addendum A: Router Architecture Clarification & Deep Router Design

### The Confusion: Pipeline vs Network Depth

The GLOBAL_HPC_SPEC describes a **4-level selection pipeline**:

```
Level 0: Machine Selection    → WHICH machine has relevant nanos
Level 1: Shard Selection      → WHICH local nanos are candidates (KD-tree)
Level 2: Fine Scoring         → SCORE each candidate (neural net)
Level 3: Soft-K Selection     → SELECT top-k via reverse cumsum
```

This is the **routing pipeline** — the stages a token goes through to reach the right experts. It is NOT the router's neural network depth.

The actual router **network** lives at Level 2 (Fine Scoring). In test_30v3, this was a simple linear scorer:

```python
# What we had in test_30v3 (works but shallow):
score = Linear(D+3, 1)  # token features + candidate RBY → score
```

Real MoE architectures (Switch Transformer, GShard, BASE Layers, etc.) use **deeper** router networks because:
- A single linear layer can only capture linear relationships between token features and expert preferences
- Complex tasks require non-linear routing (e.g., "this token needs math experts AND code experts")
- Deeper routers learn better load balancing naturally

### Deep Router Design: 6-Layer Router Network

```
Token Features (D=256)
        │
        ▼
┌───────────────────────┐
│ Layer 1: Input Proj    │  Linear(D, 512) + LayerNorm + GELU
│ (project to router     │  Expands representation
│  hidden space)         │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ Layer 2: Cross-Attn    │  MultiHeadAttention(512, heads=8)
│ (token attends to      │  Token "looks at" candidate expert
│  candidate RBY+stats)  │  features to compute affinity
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ Layer 3: Load-Aware    │  Linear(512, 512) + residual
│ (takes current load    │  Adjusts routing based on:
│  per expert as input)  │  - expert queue depth
│                        │  - expert recent accuracy
│                        │  - network latency to expert
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ Layer 4: Specialization│  Linear(512, 512) + residual
│ (learns which experts  │  Deep non-linear feature
│  handle which patterns)│  combination
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ Layer 5: Contrastive   │  Cosine similarity head
│ (compare transformed   │  Computes affinity between
│  token vs expert       │  transformed token repr and
│  representation)       │  each expert's profile vector
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ Layer 6: Score + Gate  │  Linear(512, K) → softmax
│ (final scoring with    │  Produces routing weights
│  auxiliary balance     │  Balance loss prevents
│  loss)                 │  expert collapse
└───────────┬───────────┘
            │
            ▼
       Soft-K Selection
   (reverse cumsum, proven)
```

**Parameter count:** ~1.3M params for the router alone (512×512 × 4 layers + attention). This is tiny compared to the nanos it routes to.

**Why 6 layers, not 100?**
- The router runs **for every token in every batch**. A 100-layer router would be slower than 100 nanos.
- 6 layers gives enough capacity for:
  - Non-linear token-to-expert matching (layers 1-2)
  - Load-aware dynamic routing (layer 3)  
  - Deep specialization patterns (layer 4)
  - Contrastive expert selection (layer 5)
  - Score normalization (layer 6)
- Each layer includes residual connections → gradient flow is stable even at 6 layers
- Real research (DEMix, Hash Layers, Clark et al.) shows 2-6 layers is optimal for router networks

**For production scale (millions of nanos):**
- The 6-layer router runs on the **top-50 candidates** from the KD-tree (Level 1)
- NOT on all millions of nanos
- So total router cost per token: KD-tree O(log N) + 6-layer-net × 50 candidates
- At 50 candidates: ~65K FLOPs per token for routing (vs ~500K for the nanos themselves)
- Router overhead: ~13% of compute — acceptable

### Router Training

The router trains **alongside** the nanos via:
1. **Routing loss:** How well did the selected experts perform on this token?
2. **Balance loss:** Are experts used roughly equally? (prevents collapse)
3. **Load loss:** Is any single machine overloaded?

```python
router_loss = (
    0.6 * task_performance_loss      # Did routing lead to good output?
  + 0.2 * expert_balance_loss        # Gini coefficient of expert usage
  + 0.1 * load_balance_loss          # Cross-machine load variance
  + 0.1 * latency_penalty            # Penalize routing to high-latency nodes
)
```

The router is a **shared global model** — all machines have a copy, kept in sync via federated averaging every 50 steps.

---

## Addendum B: HPC Meta-Nano Layer

### Do We Need Nanos That Manage the HPC Itself?

**YES.** The mesh needs to self-improve. Static rules (fixed gossip intervals, fixed load thresholds, fixed timeout values) break as the network grows and conditions change. Purpose-trained "meta-nanos" that learn the mesh's own behavior solve this.

### What Meta-Nanos Do

```
┌─────────────────────────────────────────────────────────┐
│                    META-NANO LAYER                       │
│  (Nanos that observe and improve mesh operations)        │
│                                                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────────┐    │
│  │ Load       │  │ Fault      │  │ Route          │    │
│  │ Predictor  │  │ Predictor  │  │ Optimizer      │    │
│  │ Nanos      │  │ Nanos      │  │ Nanos          │    │
│  └────────────┘  └────────────┘  └────────────────┘    │
│                                                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────────┐    │
│  │ Bandwidth  │  │ Reputation │  │ Gossip         │    │
│  │ Estimator  │  │ Scorer     │  │ Tuner          │    │
│  │ Nanos      │  │ Nanos      │  │ Nanos          │    │
│  └────────────┘  └────────────┘  └────────────────┘    │
│                                                          │
│  ┌────────────┐  ┌──────────────────────────────────┐   │
│  │ Scheduler  │  │ Anomaly Detector Nanos           │   │
│  │ Nanos      │  │ (catch new attack patterns,      │   │
│  │            │  │  hardware degradation, etc.)      │   │
│  └────────────┘  └──────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Meta-Nano Specifications

#### 1. Load Predictor Nanos
- **Input:** Recent 60s of per-node load history (GPU util %, CPU util %, queue depth, memory pressure)
- **Output:** Predicted load 30s into the future for each node
- **Architecture:** 8 nanos, each 10K params, LSTM-style recurrent
- **Training data:** Mesh telemetry collected during operation
- **Use:** Pre-empty scheduling — start migrating nanos BEFORE overload

#### 2. Fault Predictor Nanos
- **Input:** Node heartbeat patterns, packet loss rates, latency jitter, historical failure data
- **Output:** Probability each node fails within next 5 minutes
- **Architecture:** 12 nanos, each 5K params, gradient-boosted ensemble style
- **Training data:** Actual failure events (labeled by timestamp)
- **Use:** Preemptive nano replication — copy nanos off a node before it dies

#### 3. Route Optimizer Nanos
- **Input:** Routing decisions + their outcomes (latency, accuracy)
- **Output:** Suggested partition map updates
- **Architecture:** 4 nanos, 20K params each, RL-style (reward = low latency + high accuracy)
- **Training:** Online learning from actual routing feedback
- **Use:** Continuously improve which nanos live where

#### 4. Bandwidth Estimator Nanos
- **Input:** Recent transfer sizes + times between node pairs
- **Output:** Estimated bandwidth and latency between any two nodes
- **Architecture:** 6 nanos, 3K params each (simple regression)
- **Training data:** Actual transfer measurements
- **Use:** Smart scheduling — don't send 10GB to a node on a 1Mbps link

#### 5. Reputation Scorer Nanos
- **Input:** Node history (accepted nanos, rejected nanos, uptime, response times)
- **Output:** Trust score (0-1) for each node
- **Architecture:** 4 nanos, 5K params each
- **Training data:** Labeled data (known-good nodes vs known-malicious ones from test scenarios)
- **Use:** Decide how much to trust a node's work products

#### 6. Gossip Tuner Nanos
- **Input:** Current gossip interval, network size, state convergence time, bandwidth usage
- **Output:** Optimal gossip interval for current conditions
- **Architecture:** 2 nanos, 2K params (control theory approach)
- **Training:** Minimize convergence time while keeping bandwidth below threshold
- **Use:** Adapt gossip frequency as network grows/shrinks

#### 7. Scheduler Nanos
- **Input:** Job queue, node capabilities, current load, estimated completion times
- **Output:** Job-to-node assignments
- **Architecture:** 8 nanos, 15K params each, attention-style matching
- **Training:** Minimize total job completion time (reinforcement signal)
- **Use:** Replace static scheduling rules with learned scheduling

#### 8. Anomaly Detector Nanos
- **Input:** Raw telemetry streams (all metrics from all nodes)
- **Output:** Anomaly scores per metric per node
- **Architecture:** 16 nanos, 8K params each (autoencoder-style, reconstruction error = anomaly score)
- **Training:** Normal operation data = normal, any spike in reconstruction error = anomaly
- **Use:** Catch: new attack patterns, hardware degradation, data corruption, network misconfigurations

### Meta-Nano Integration

```
                    Regular Nanos
                    (NLP, code, math, etc.)
                         │
                         ▼
    ┌─────────────────────────────────────┐
    │          INFERENCE / TRAINING       │
    │  (Uses regular nanos for tasks)     │
    └──────────────┬──────────────────────┘
                   │ telemetry
                   ▼
    ┌─────────────────────────────────────┐
    │          META-NANO LAYER            │
    │  (Observes system, recommends       │
    │   configuration changes)            │
    └──────────────┬──────────────────────┘
                   │ recommendations
                   ▼
    ┌─────────────────────────────────────┐
    │          MESH OPERATIONS            │
    │  (Applies: routing updates,         │
    │   schedule changes, gossip          │
    │   interval adjustments, etc.)       │
    └─────────────────────────────────────┘
```

**Key principle:** Meta-nanos **recommend** changes. The mesh operations layer **validates** and **applies** them. No meta-nano can directly modify the mesh without validation. This prevents a corrupted meta-nano from destroying the network.

### Meta-Nano Lifecycle

1. **Bootstrap:** Start with hand-coded rules (static thresholds, simple heuristics). This is what we have TODAY.
2. **Observation phase:** Collect telemetry for 24+ hours of real operation. No meta-nanos active yet.
3. **Training phase:** Train meta-nanos on collected telemetry offline. Validate on held-out data.
4. **Shadow mode:** Meta-nanos run in parallel with static rules. Log what they WOULD do vs what the static rules do. Human reviews disagreements.
5. **Production mode:** Meta-nanos replace static rules for specific decisions (e.g., gossip interval). Static rules remain as a safety fallback.
6. **Full autonomy:** Once meta-nanos prove reliable (>99% agreement with human-validated decisions), they take over all operational decisions.

### Total Meta-Nano Parameter Count

| Category | Nanos | Params Each | Total |
|----------|-------|-------------|-------|
| Load Predictor | 8 | 10K | 80K |
| Fault Predictor | 12 | 5K | 60K |
| Route Optimizer | 4 | 20K | 80K |
| Bandwidth Estimator | 6 | 3K | 18K |
| Reputation Scorer | 4 | 5K | 20K |
| Gossip Tuner | 2 | 2K | 4K |
| Scheduler | 8 | 15K | 120K |
| Anomaly Detector | 16 | 8K | 128K |
| **Total** | **60** | — | **510K** |

510K total parameters for the entire meta-nano layer. That fits in 2MB of GPU memory. Negligible overhead.

---

## Addendum C: Implementation Priority

### What to build FIRST (for LAN testing):
1. **Load Predictor** — Simplest, highest impact. Even a moving average beats no prediction.
2. **Fault Predictor** — Critical for reliability. Start with heartbeat-based detection.
3. **Anomaly Detector** — Essential for debugging. Catch weird behavior early.

### What to build LATER (for WAN/global):
4. **Route Optimizer** — Matters more when latency varies across machines.
5. **Bandwidth Estimator** — Matters for WAN links.
6. **Reputation Scorer** — Matters when untrusted nodes join.
7. **Scheduler** — Static scheduling works fine for <20 machines.
8. **Gossip Tuner** — Fine-tune after everything else is stable.

### Code Location
```
ileices_hpc/
├── meta/                       # Meta-nano layer
│   ├── __init__.py
│   ├── base_meta_nano.py       # Base class for all meta-nanos
│   ├── load_predictor.py       # Load prediction (LSTM-style)
│   ├── fault_predictor.py      # Failure probability estimation
│   ├── anomaly_detector.py     # Autoencoder anomaly scoring
│   ├── route_optimizer.py      # RL routing suggestions
│   ├── bandwidth_estimator.py  # Transfer speed prediction
│   ├── reputation_scorer.py    # Trust scoring
│   ├── scheduler_nano.py       # Job→node assignment
│   ├── gossip_tuner.py         # Gossip interval optimization
│   └── telemetry_collector.py  # Ingests mesh metrics
```
