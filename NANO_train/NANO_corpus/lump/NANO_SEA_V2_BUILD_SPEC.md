# NANO SEA v2 — Complete Build Specification

```
Status  : DEFINITIVE — this supersedes all prior specs (00-13), audits, and roadmaps
Author  : Roswan Lorinzo Miller (concept/vision) + Engineering Synthesis
Date    : 2026-04-05
Hardware: 1660-Dually (2× GTX 1660 SUPER 6GB, AMD 5900x, 80GB RAM)
```

---

# PART I: WHAT THE NANO SEA IS

## 1.1 One-Paragraph Summary

The Nano Sea is a swarm intelligence system where thousands to millions of tiny
neural networks ("nanos," 1K–50K parameters each) collaborate to perform any task
an LLM can do — code generation, search, reasoning, tool use — by activating the
RIGHT SUBSET of nanos for each input token and combining their outputs. An LLM
stores all knowledge in one monolithic model. The Nano Sea distributes knowledge
across a living ecosystem of specialists that grow, evolve, die, and improve
through cosmic cycles of expansion and compression. An LLM is fed by the Nano Sea's
"midwife" system — using the LLM to generate training data — until the sea is smart
enough to replace the LLM entirely, task by task.

## 1.2 Why It Beats LLMs (Eventually)

| Advantage | Mechanism |
|-----------|-----------|
| **Latency** | Active nanos on local GPU. No API round-trip. 10ms vs 500ms. |
| **Cost** | No per-token charges. Training is a one-time local cost. |
| **Personalization** | Nanos train on YOUR code, YOUR files, YOUR patterns. |
| **Specialization** | 1000 nanos each mastering one narrow pattern > 1 model trying everything. |
| **Evolution** | Continuous improvement from usage. LLMs are frozen snapshots. |
| **Privacy** | All data stays local. No code sent to cloud. |
| **Scaling** | Add hardware → add nanos → sea gets smarter. No retraining. |

## 1.3 Core Principle: Swarm Collaboration, Not Relay Race

**WRONG (old design):** One nano per pipeline stage, sequential relay.
```
TokenizeNano → EmbedNano → ParseNano → SearchNano → GenerateNano → output
  (1 nano)      (1 nano)     (1 nano)    (1 nano)       (1 nano)
  Total active: ~250K params. Result: garbage.
```

**RIGHT (v2 design):** Many nanos per layer, parallel activation, weighted combination.
```
SharedEmbedding → [SwarmLayer: 8 of 1000 nanos activated, weighted sum] ×3 → OutputHead
  Total active: 24 nanos × 50K = 1.2M + shared layers. Result: coherent output.
```

The key: nanos don't work ALONE. They work as a SWARM — many activated simultaneously
for each token, their outputs combined by learned routing weights.

---

# PART II: ARCHITECTURE

## 2.1 System Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                        NANO SEA v2                              │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  SHARED EMBEDDING (one copy, all nanos use it)           │  │
│  │  Standard: nn.Embedding(vocab_size, d_model)             │  │
│  │  Optional: SpectralEmbedding with PTAIE prior + residual │  │
│  └─────────────────────────┬────────────────────────────────┘  │
│                            │                                    │
│  ┌─────────────────────────▼────────────────────────────────┐  │
│  │  SWARM LAYER 1                                           │  │
│  │  ┌────────────────────────────┐                          │  │
│  │  │ LayerNorm + Multi-Head Attn│  (shared across layer)   │  │
│  │  └────────────┬───────────────┘                          │  │
│  │  ┌────────────▼───────────────┐                          │  │
│  │  │ LayerNorm                  │                          │  │
│  │  └────────────┬───────────────┘                          │  │
│  │  ┌────────────▼───────────────┐                          │  │
│  │  │ SWARM ROUTER               │                          │  │
│  │  │ Stage 1: ChromaticIndex    │  O(log N) KD-tree lookup │  │
│  │  │   → narrows to 50 cands   │                          │  │
│  │  │ Stage 2: Soft-k scoring    │  picks top-k, soft wts  │  │
│  │  │   → picks 8 active nanos  │                          │  │
│  │  └────────────┬───────────────┘                          │  │
│  │  ┌────────────▼───────────────┐                          │  │
│  │  │ ACTIVE NANOS (k of N)      │                          │  │
│  │  │ Each: d_model → hidden →   │  Run in parallel         │  │
│  │  │       d_model              │                          │  │
│  │  └────────────┬───────────────┘                          │  │
│  │  ┌────────────▼───────────────┐                          │  │
│  │  │ Optional: CROSSTALK        │  Cross-attn between      │  │
│  │  │ (learned gate, starts 0)   │  active nano outputs     │  │
│  │  └────────────┬───────────────┘                          │  │
│  │  ┌────────────▼───────────────┐                          │  │
│  │  │ Weighted sum + residual    │                          │  │
│  │  └────────────┬───────────────┘                          │  │
│  └───────────────┼──────────────────────────────────────────┘  │
│                  │                                              │
│  ┌───────────────▼──────────────────────────────────────────┐  │
│  │  SWARM LAYER 2 ... N  (same structure, own nano pools)   │  │
│  └───────────────┬──────────────────────────────────────────┘  │
│                  │                                              │
│  ┌───────────────▼──────────────────────────────────────────┐  │
│  │  SHARED OUTPUT HEAD                                       │  │
│  │  LayerNorm → nn.Linear(d_model, vocab_size)              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ═══════════════════════════════════════════════════════════   │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  LIFECYCLE ENGINE                                         │  │
│  │  NanoSpawner · FitnessEvaluator · CompressionEngine      │  │
│  │  DepositStore · CosmicCycleManager · TouchTensor          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  TRAINING ENGINE                                          │  │
│  │  SwarmTrainer (end-to-end) · ValidatedMidwife (LLM feed) │  │
│  │  LocalDataScanner · WebScraper · CurriculumPacer          │  │
│  │  IndependenceTracker                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  MEMORY MANAGER                                           │  │
│  │  GPU (hot) ↔ CPU RAM (warm) ↔ Disk (cold)               │  │
│  │  LRU eviction · Predictive prefetch from ChromaticIndex  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  MESH (distributed, optional)                             │  │
│  │  mDNS peer discovery · Federated nano averaging           │  │
│  │  Trust scoring · Nano replication                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  HTTP SERVER (FastAPI, :5100)                             │  │
│  │  /v1/generate · /v1/training/observe · /health            │  │
│  │  /v1/sea/status · /v1/sea/metrics                        │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

## 2.2 Hyperparameters (Default Configuration)

```python
# Model dimensions
D_MODEL = 256            # Vector size all nanos share
VOCAB_SIZE = 8192        # BPE tokenizer vocabulary
MAX_SEQ_LEN = 512        # Context window (matches meta-agent design)
N_HEADS = 4              # Attention heads per swarm layer
N_LAYERS = 3             # Number of swarm layers (proven optimal at small scale)

# Nano configuration
DEFAULT_HIDDEN_DIM = 128  # Default FFN hidden dim per nano (~65K params each)
MIN_HIDDEN_DIM = 32       # Smallest possible nano (~16K params)
MAX_HIDDEN_DIM = 512      # Largest possible nano (~260K params)

# Routing
DEFAULT_TOP_K = 8         # Max nanos activated per token per layer
SOFT_K = True             # Use soft differentiable k (proven in test_30v3)
EFF_LAMBDA = 0.01         # Efficiency loss weight (penalizes activating too many)
CHROMATIC_CANDIDATES = 50  # ChromaticIndex returns this many candidates

# Lifecycle
FITNESS_DEATH_THRESHOLD = 0.2    # Nanos below this fitness die
FITNESS_CHECKPOINT_THRESHOLD = 0.5  # Only save nanos above this
COSMIC_CYCLE_STEPS = 5000       # Steps per cosmic cycle before absularity check
COMPRESSION_SURVIVAL_RATE = 0.5  # Half the nanos survive compression

# Memory paging
GPU_NANO_BUDGET_MB = 4000   # Max VRAM for nano pool (leave room for activations)
CPU_NANO_BUDGET_MB = 32000  # Max RAM for warm nanos
PREFETCH_BATCH = 50          # Prefetch this many nanos per batch

# Training
LEARNING_RATE = 1e-3
BATCH_SIZE = 32
SEQ_LEN = 256               # Training sequence length
MIDWIFE_INTERVAL_SEC = 60    # Midwife generates data every 60 seconds
MIDWIFE_TASKS_PER_ROUND = 5  # Examples per midwife round

# Server
SERVER_PORT = 5100
```

---

# PART III: COMPONENT SPECIFICATIONS

## 3.1 Universal Nano

Every nano is an instance of ONE class. No category hierarchy. Specialization is
LEARNED, not hardcoded.

```python
class Nano(nn.Module):
    """
    The fundamental unit of the Nano Sea.
    
    Interface: d_model → d_model (always, regardless of hidden_dim).
    Internal capacity varies by hidden_dim (set at birth, can change at rebirth).
    
    A nano is like a neuron with a personality — it has an identity (uuid),
    a position in concept space (rby), a reputation (fitness), and a history
    (touch_count, birth_cycle).
    """
    def __init__(self, d_model, hidden_dim, rby_seed=None):
        super().__init__()
        self.up = nn.Linear(d_model, hidden_dim)
        self.act = nn.GELU()
        self.down = nn.Linear(hidden_dim, d_model)
        
        # Identity
        self.nano_id: str = uuid4().hex[:12]
        self.hidden_dim: int = hidden_dim
        
        # Position in concept space (learned, initialized from seed)
        rby = rby_seed or [0.33, 0.33, 0.34]
        self.rby_position = nn.Parameter(torch.tensor(rby, dtype=torch.float32))
        
        # Metadata (NOT nn.Parameters — just tracking)
        self.fitness: float = 0.5       # 0.0–1.0, updated by FitnessEvaluator
        self.touch_count: int = 0       # how often activated by router
        self.birth_cycle: int = 0       # which cosmic cycle spawned this nano
        self.parent_deposit_id: str = None  # if warm-started from a deposit
    
    def forward(self, x):
        # x: (batch, seq_len, d_model) → same shape out
        return self.down(self.act(self.up(x)))
    
    @property
    def param_count(self):
        return sum(p.numel() for p in self.parameters())
```

**Why no categories:** In the old design, there were 17 hardcoded types
(TokenizationNano, EmbeddingNano, SearchNano, etc.). This was wrong because:
1. It capped the system at 296 nanos
2. It assumed humans can predict what specializations are needed
3. It prevented emergent specialization

In v2, nanos specialize through TRAINING. A nano that sees lots of Python syntax
during training naturally becomes a "Python syntax nano." A nano that sees lots of
natural language becomes a "language nano." The type emerges — it's not assigned.

The `rby_position` parameter IS the nano's identity in concept space. After training,
you can inspect it: nanos with high Red handle perception tasks, high Blue handle
reasoning, high Yellow handle generation. But this is DISCOVERED, not hardcoded.

---

## 3.2 Swarm Layer

Each swarm layer contains: shared attention, a pool of nanos, and a router that
selects which nanos activate per token.

```python
class SwarmLayer(nn.Module):
    """
    One layer of the Nano Sea.
    
    Contains:
    - Shared multi-head attention (all tokens see each other)
    - A pool of nanos (hundreds to thousands)
    - A router that picks the best k nanos per token
    - Optional crosstalk (cross-attention between active nano outputs)
    """
    def __init__(self, d_model, n_heads, nano_pool, top_k=8):
        super().__init__()
        # Shared attention
        self.ln1 = nn.LayerNorm(d_model)
        self.attn = nn.MultiheadAttention(d_model, n_heads, batch_first=True)
        
        # Nano swarm
        self.ln2 = nn.LayerNorm(d_model)
        self.nano_pool = nn.ModuleList(nano_pool)  # the nanos in this layer
        self.router = SwarmRouter(d_model, len(nano_pool))
        self.top_k = top_k
        
        # Optional crosstalk
        self.crosstalk = ExpertCrosstalk(d_model, n_heads=2)
        
        # Touch logging (not a parameter — just tracking)
        self.touch_events = []
    
    def forward(self, x, mask=None):
        # 1. Shared attention
        h = self.ln1(x)
        h, _ = self.attn(h, h, h, attn_mask=mask)
        x = x + h
        
        # 2. Nano swarm routing + execution
        h = self.ln2(x)
        h, touch = self._swarm_forward(h)
        x = x + h
        
        self.touch_events.append(touch)
        return x
    
    def _swarm_forward(self, x):
        B, S, D = x.shape
        
        # Router scores all nanos
        scores = self.router(x)  # (B, S, num_nanos)
        
        # Soft top-k selection (see reference_implementations.py for full math)
        top_scores, top_indices = scores.topk(self.top_k, dim=-1)
        weights = F.softmax(top_scores, dim=-1)  # (B, S, k)
        
        # Run selected nanos
        nano_outputs = []
        for i in range(self.top_k):
            # Gather which nano each token selected for slot i
            idx = top_indices[:, :, i]  # (B, S)
            # For simplicity, run each unique nano once on its tokens
            slot_output = self._run_nanos_for_slot(x, idx)
            nano_outputs.append(slot_output)
        
        nano_outputs = torch.stack(nano_outputs, dim=2)  # (B, S, k, D)
        
        # Optional crosstalk between active nanos
        output = self.crosstalk(nano_outputs, weights)
        
        # Log touch events
        touch = {'indices': top_indices.detach(), 'weights': weights.detach()}
        return output, touch
```

**Scaling note:** When the nano pool is small (< 100), the router can score all
nanos directly. When the pool is large (1000+), use the ChromaticIndex for
two-stage routing (see §3.3).

---

## 3.3 Swarm Router (Two-Stage for Scale)

```python
class SwarmRouter(nn.Module):
    """
    Routes tokens to the best nanos.
    
    Small pools (< 100 nanos): direct linear scoring.
    Large pools (100+ nanos): two-stage chromatic routing.
    """
    def __init__(self, d_model, num_nanos):
        super().__init__()
        self.num_nanos = num_nanos
        
        if num_nanos < 100:
            # Direct scoring: project to score per nano
            self.scorer = nn.Linear(d_model, num_nanos)
        else:
            # Two-stage: project to RBY → KD-tree → fine score
            self.rby_projector = nn.Linear(d_model, 3)  # project to RBY simplex
            self.fine_scorer = nn.Linear(d_model, 50)    # score among candidates
            self.chromatic_index = None  # built externally from nano positions
    
    def forward(self, x):
        if self.num_nanos < 100:
            return self.scorer(x)
        else:
            return self._two_stage_route(x)
    
    def _two_stage_route(self, x):
        # Stage 1: Project to RBY simplex
        rby = F.softmax(self.rby_projector(x), dim=-1)  # (B, S, 3)
        
        # Stage 2: KD-tree lookup for nearest candidates
        # (done outside autograd — just index lookup)
        candidates = self.chromatic_index.query(rby, k=50)  # indices of 50 nearest
        
        # Stage 3: Fine-grained scoring among candidates
        # ... (see reference_implementations.py for full code)
```

### ChromaticIndex (KD-Tree on RBY Simplex)

```python
class ChromaticIndex:
    """
    Spatial index of nano positions in RBY space.
    Enables O(log N) lookup of nearest nanos for any input.
    
    Uses scipy.spatial.KDTree on the 3D RBY coordinates.
    Rebuilt periodically (every N training steps or on nano birth/death).
    """
    def __init__(self, nano_positions):
        # nano_positions: (N, 3) tensor of RBY positions
        from scipy.spatial import KDTree
        self.tree = KDTree(nano_positions.detach().cpu().numpy())
    
    def query(self, rby_batch, k=50):
        """Find k nearest nanos for each input position."""
        positions = rby_batch.detach().cpu().numpy().reshape(-1, 3)
        distances, indices = self.tree.query(positions, k=k)
        return torch.tensor(indices).reshape(rby_batch.shape[:-1] + (k,))
    
    def rebuild(self, nano_positions):
        """Call after nano births/deaths change the pool."""
        from scipy.spatial import KDTree
        self.tree = KDTree(nano_positions.detach().cpu().numpy())
```

---

## 3.4 Soft K-Selection (PROVEN — test_30v3)

This is the mathematically correct way to let the router learn HOW MANY nanos to
activate per token. Do NOT use argmax or hard top-k — those block gradients.

```python
def soft_k_selection(scores, k_predictor_output, top_k_max):
    """
    Soft differentiable k-selection via reverse cumsum.
    
    Proven in test_30v3: PPL 4.977 (-3.46% vs fixed top-2).
    
    scores: (B, S, num_nanos) — raw router scores
    k_predictor_output: (B, S, top_k_max) — soft slot inclusion probabilities
    
    Returns: weighted_scores where inactive slots are smoothly zeroed
    """
    # Get top-k scores and indices
    top_scores, top_indices = scores.topk(top_k_max, dim=-1)
    weights = F.softmax(top_scores, dim=-1)
    
    # Soft k: slot_weight[i] = P(at least i+1 nanos should be used)
    # Reverse cumsum: slot 0 always ≈ 1.0, later slots fade based on k_soft
    k_soft = torch.sigmoid(k_predictor_output)  # (B, S, top_k_max), each in [0,1]
    slot_weights = k_soft.flip(-1).cumsum(-1).flip(-1)
    # slot_weights[i] = product of sigmoid values from i to end
    # → naturally decays for higher slots
    
    # Apply soft mask
    effective_weights = weights * slot_weights
    effective_weights = effective_weights / (effective_weights.sum(-1, keepdim=True) + 1e-9)
    
    return effective_weights, top_indices
```

**Why this works:** The CE loss gradient flows through softmax AND through the slot
weights (both differentiable). If using 1 nano gives bad predictions, the gradient
pushes slot_weights[1] higher → activates nano 2. If nano 2 is useless noise, the
gradient pushes slot_weights[1] lower → deactivates it. The system finds its natural
operating point (~1.1 nanos at small scale, expected to rise with more nanos/data).

---

## 3.5 Expert Crosstalk (IC-AE Reborn)

From the original framework: "When two entities interact, they create something
neither could produce alone." This is realized as cross-attention between active
nanos within a layer.

```python
class ExpertCrosstalk(nn.Module):
    """
    Active nanos attend to each other's outputs before combining.
    
    A learned gate starts at 0 (pure standard MoE). If crosstalk helps,
    the gate learns to add it. If not, it stays near 0 — free lunch.
    
    Proven beneficial in test_24.
    """
    def __init__(self, d_model, n_heads=2):
        super().__init__()
        self.cross_attn = nn.MultiheadAttention(d_model, n_heads, batch_first=True)
        self.gate = nn.Parameter(torch.tensor(0.0))
    
    def forward(self, nano_outputs, weights):
        # nano_outputs: (B, S, k, D)
        # weights: (B, S, k)
        B, S, K, D = nano_outputs.shape
        
        # Standard path
        standard = (nano_outputs * weights.unsqueeze(-1)).sum(dim=2)
        
        # Crosstalk path: nanos attend to each other
        flat = nano_outputs.view(B * S, K, D)
        infected, _ = self.cross_attn(flat, flat, flat)
        infected = infected.view(B, S, K, D)
        infected_sum = (infected * weights.unsqueeze(-1)).sum(dim=2)
        
        # Gate
        alpha = torch.sigmoid(self.gate)
        return (1 - alpha) * standard + alpha * infected_sum
```

---

## 3.6 Touch Tensor (Interaction Logging)

Every time a nano is activated, log the event. This data drives lifecycle decisions.

```python
class TouchTensor:
    """
    Records which nanos activate for which inputs.
    
    Accumulates touch profiles (what each nano specializes in),
    cross-nano interaction patterns, and utilization statistics.
    
    Proven useful in test_25.
    """
    def __init__(self, num_nanos):
        self.profiles = torch.zeros(num_nanos, dtype=torch.float32)  # Φ_e
        self.cross_matrix = torch.zeros(num_nanos, num_nanos)        # C[e1,e2]
        self.touch_counts = torch.zeros(num_nanos, dtype=torch.long)
        self.ema_lambda = 0.01  # exponential moving average decay
    
    def update(self, touch_events):
        """Update from a batch of routing decisions."""
        indices = touch_events['indices']   # (B, S, k) — which nanos were activated
        weights = touch_events['weights']   # (B, S, k) — how strongly
        
        # Update touch counts
        flat_idx = indices.reshape(-1)
        self.touch_counts.scatter_add_(0, flat_idx, torch.ones_like(flat_idx, dtype=torch.long))
        
        # Update cross-matrix (which nanos co-activate)
        for b in range(indices.shape[0]):
            for s in range(indices.shape[1]):
                active = indices[b, s]  # k active nanos
                for i in range(len(active)):
                    for j in range(i + 1, len(active)):
                        self.cross_matrix[active[i], active[j]] += 1
                        self.cross_matrix[active[j], active[i]] += 1
    
    def utilization(self):
        """Fraction of total activations per nano."""
        total = self.touch_counts.sum().float()
        return self.touch_counts.float() / (total + 1e-9)
    
    def underutilized(self, threshold=0.001):
        """Nanos almost never activated — candidates for death or retraining."""
        return (self.utilization() < threshold).nonzero(as_tuple=True)[0]
    
    def overloaded(self, threshold=0.1):
        """Nanos activated too often — candidates for splitting."""
        return (self.utilization() > threshold).nonzero(as_tuple=True)[0]
```

---

## 3.7 Fitness Evaluator

```python
class FitnessEvaluator:
    """
    Computes a 0.0–1.0 fitness score for each nano.
    
    Fitness = weighted combination of:
    - contribution: how much does removing this nano hurt output quality?
    - utilization: is the router selecting this nano?
    - efficiency: how fast is it relative to its contribution?
    
    Fitness determines: training priority, checkpoint worthiness,
    survival during compression, and death.
    """
    CONTRIBUTION_WEIGHT = 0.5
    UTILIZATION_WEIGHT = 0.3
    EFFICIENCY_WEIGHT = 0.2
    
    def evaluate(self, nano, swarm_model, val_data, touch_tensor):
        # Contribution: ablation score (remove nano, measure PPL increase)
        base_ppl = evaluate_ppl(swarm_model, val_data)
        ablated_ppl = evaluate_ppl_without_nano(swarm_model, nano, val_data)
        contribution = max(0, (ablated_ppl - base_ppl) / base_ppl)  # 0 = useless
        contribution = min(1.0, contribution * 10)  # scale to [0, 1]
        
        # Utilization: how often the router picks this nano
        utilization = touch_tensor.utilization()[nano.pool_index].item()
        utilization = min(1.0, utilization * 20)  # scale
        
        # Efficiency: params vs contribution
        efficiency = contribution / (nano.param_count / 100000)  # contribution per 100K params
        efficiency = min(1.0, efficiency)
        
        fitness = (
            self.CONTRIBUTION_WEIGHT * contribution +
            self.UTILIZATION_WEIGHT * utilization +
            self.EFFICIENCY_WEIGHT * efficiency
        )
        
        nano.fitness = fitness
        return fitness
```

---

## 3.8 Nano Spawner

```python
class NanoSpawner:
    """
    Creates new nanos when the sea needs them.
    
    Spawn triggers:
    1. High router entropy → no existing nano matches well → spawn in gap
    2. Overloaded nano → split into two specialists
    3. Midwife detects new domain → seed new nanos for it
    4. Cosmic expansion phase → periodic growth
    5. Deposit-guided → warm-start from compressed dead nano
    """
    def spawn(self, reason, d_model, deposit_store=None, parent=None, rby_seed=None):
        if reason == 'split' and parent is not None:
            # Clone parent + noise to break symmetry
            child = copy.deepcopy(parent)
            child.nano_id = uuid4().hex[:12]
            for p in child.parameters():
                if p.requires_grad:
                    p.data += 0.01 * torch.randn_like(p)
            # Slightly perturb RBY position
            child.rby_position.data += 0.05 * torch.randn(3)
            child.rby_position.data = F.softmax(child.rby_position.data, dim=0)
            return child
        
        elif reason == 'deposit' and deposit_store is not None:
            deposit = deposit_store.get_best_unused()
            if deposit:
                nano = Nano(d_model, deposit.hidden_dim, rby_seed=deposit.rby_position)
                nano.load_state_dict(deposit.weights, strict=False)
                nano.parent_deposit_id = deposit.deposit_id
                return nano
        
        # Default: random init with RBY seed
        hidden_dim = self._size_from_rby(rby_seed or [0.33, 0.33, 0.34])
        return Nano(d_model, hidden_dim, rby_seed=rby_seed)
    
    def _size_from_rby(self, rby):
        """Blue-heavy nanos get more params (deeper reasoning)."""
        r, b, y = rby
        # Range: MIN_HIDDEN_DIM to MAX_HIDDEN_DIM, biased by Blue component
        scale = 0.5 + b  # b ∈ [0,1], so scale ∈ [0.5, 1.5]
        hidden = int(DEFAULT_HIDDEN_DIM * scale)
        return max(MIN_HIDDEN_DIM, min(MAX_HIDDEN_DIM, hidden))
```

---

## 3.9 Compression & Deposit System

```python
class CompressionEngine:
    """
    Cosmic compression: prune weak nanos, extract deposits from the dying.
    
    Compression happens at Absularity (training saturation detected).
    Weak nanos die. Their knowledge is preserved as deposits.
    Deposits warm-start future nanos in the next cosmic cycle.
    
    Proven in test_26, test_27.
    """
    def compress(self, swarm_model, touch_tensor, fitness_evaluator, val_data,
                 survival_rate=COMPRESSION_SURVIVAL_RATE):
        
        # 1. Score all nanos
        scores = {}
        for layer in swarm_model.layers:
            for i, nano in enumerate(layer.nano_pool):
                fitness = fitness_evaluator.evaluate(nano, swarm_model, val_data, touch_tensor)
                scores[(layer, i)] = fitness
        
        # 2. Triage: top survival_rate% survive, rest die
        threshold = sorted(scores.values())[int(len(scores) * (1 - survival_rate))]
        survivors = {k for k, v in scores.items() if v >= threshold}
        condemned = {k for k, v in scores.items() if v < threshold}
        
        # 3. Create deposits from condemned nanos
        deposits = []
        for (layer, i) in condemned:
            nano = layer.nano_pool[i]
            deposit = self._create_deposit(nano, touch_tensor)
            deposits.append(deposit)
        
        return survivors, deposits
    
    def _create_deposit(self, nano, touch_tensor):
        """Progressive Twmrto compression — multiple fidelity levels."""
        return Deposit(
            deposit_id=uuid4().hex[:12],
            rby_position=nano.rby_position.detach().cpu().tolist(),
            hidden_dim=nano.hidden_dim,
            weights=nano.state_dict(),                              # Stage 0: full
            centroid=self._compute_centroid(nano),                   # Stage 2: mean
            touch_profile=touch_tensor.profiles[nano.pool_index],   # usage pattern
            fitness_at_death=nano.fitness,
            birth_cycle=nano.birth_cycle,
            death_cycle=self.current_cycle,
        )


class Deposit:
    """Knowledge extracted from a dead nano. Seeds future nanos."""
    def __init__(self, deposit_id, rby_position, hidden_dim, weights,
                 centroid, touch_profile, fitness_at_death, birth_cycle, death_cycle):
        self.deposit_id = deposit_id
        self.rby_position = rby_position
        self.hidden_dim = hidden_dim
        self.weights = weights                  # Full state_dict (Stage 0)
        self.centroid = centroid                 # Mean activation (Stage 2)
        self.touch_profile = touch_profile      # What it specialized in
        self.fitness_at_death = fitness_at_death
        self.birth_cycle = birth_cycle
        self.death_cycle = death_cycle
```

---

## 3.10 Absularity Detection

```python
class AbsularityDetector:
    """
    Detects when the system has fully explored its current configuration.
    
    Absularity = all of these simultaneously:
    1. Loss plateau (val loss stopped improving)
    2. Router stability (routing entropy is stable)
    3. Touch convergence (nano specializations stopped changing)
    4. RBY equilibrium (UF ≈ IO)
    
    When Absularity is detected → trigger compression → start next cosmic cycle.
    """
    def __init__(self, window_size=100, threshold=0.05):
        self.window_size = window_size
        self.threshold = threshold
        self.loss_history = []
        self.entropy_history = []
    
    def check(self, val_loss, router_entropy, touch_tensor, rby, uf, io):
        self.loss_history.append(val_loss)
        self.entropy_history.append(router_entropy)
        
        if len(self.loss_history) < self.window_size:
            return False
        
        window = self.loss_history[-self.window_size:]
        
        loss_plateau = (max(window) - min(window)) < self.threshold
        entropy_stable = torch.std(torch.tensor(self.entropy_history[-self.window_size:])) < self.threshold
        touch_stable = True  # check touch_tensor.profiles haven't changed much
        rby_equilibrium = abs(uf - io) < self.threshold
        
        return loss_plateau and entropy_stable and touch_stable and rby_equilibrium
```

---

## 3.11 Cosmic Cycle Manager

The meta-loop: expand → train → detect absularity → compress → deposit → mutate seed → repeat.

```python
class CosmicCycleManager:
    """
    Orchestrates the full lifecycle of the Nano Sea.
    
    Each cycle:
    1. SEED: Determine architecture from RBY seed + existing deposits
    2. EXPAND: Spawn nanos (from deposits + random)
    3. TRAIN: End-to-end swarm training until absularity
    4. COMPRESS: Kill weak nanos, create deposits
    5. DEPOSIT: Store deposits for next cycle
    6. MUTATE: Update RBY seed based on what was learned
    
    Proven to improve over cycles in test_26.
    """
    def __init__(self, d_model, n_layers, deposit_store, rby_seed):
        self.d_model = d_model
        self.n_layers = n_layers
        self.deposits = deposit_store
        self.rby = rby_seed  # (r, b, y) triplet
        self.cycle = 0
    
    def run_cycle(self, training_data, val_data):
        # 1. SEED → determine how many nanos per layer
        config = self._compute_config()
        
        # 2. EXPAND → build model with nano pools
        model = self._build_swarm(config)
        
        # 3. TRAIN → end-to-end until absularity
        trainer = SwarmTrainer(model)
        absularity_detector = AbsularityDetector()
        touch_tensor = TouchTensor(config['total_nanos'])
        
        step = 0
        while True:
            metrics = trainer.train_step(training_data)
            touch_tensor.update(metrics['touch_events'])
            
            if step % 100 == 0:
                val_loss = trainer.evaluate(val_data)
                if absularity_detector.check(val_loss, metrics['router_entropy'],
                                            touch_tensor, self.rby,
                                            metrics['uf'], metrics['io']):
                    break
            step += 1
        
        # 4. COMPRESS → prune weak nanos
        compressor = CompressionEngine()
        compressor.current_cycle = self.cycle
        survivors, new_deposits = compressor.compress(model, touch_tensor,
                                                       FitnessEvaluator(), val_data)
        
        # 5. DEPOSIT → store for next cycle
        for dep in new_deposits:
            self.deposits.add(dep)
        
        # 6. MUTATE → update RBY seed
        self._mutate_rby(metrics)
        
        self.cycle += 1
        return model, new_deposits
```

---

## 3.12 Training Engine

### End-to-End Swarm Training

```python
class SwarmTrainer:
    """
    Trains the entire swarm end-to-end with backpropagation.
    
    Key: only ACTIVE nanos get gradients. Inactive nanos get none.
    This is automatic — PyTorch only computes gradients for used parameters.
    
    The router learns WHICH nanos to pick (routing signal).
    The nanos learn WHAT to compute (task signal).
    Both learn simultaneously from the same loss.
    """
    def __init__(self, model, lr=LEARNING_RATE):
        self.model = model
        self.optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    
    def train_step(self, data_loader):
        self.model.train()
        batch = next(iter(data_loader))
        input_ids = batch['input_ids'].cuda()
        target_ids = batch['target_ids'].cuda()
        
        # Forward: embedding → swarm layers → output head
        logits, touch_events = self.model(input_ids)
        
        # Language modeling loss
        ce_loss = F.cross_entropy(logits.view(-1, VOCAB_SIZE), target_ids.view(-1))
        
        # Efficiency loss: penalize using too many nanos (soft-k regularization)
        eff_loss = self._efficiency_loss(touch_events)
        
        # Total loss
        loss = ce_loss + EFF_LAMBDA * eff_loss
        
        self.optimizer.zero_grad()
        loss.backward()
        self.optimizer.step()
        
        return {
            'loss': loss.item(),
            'ce_loss': ce_loss.item(),
            'eff_loss': eff_loss.item(),
            'touch_events': touch_events,
            'router_entropy': self._router_entropy(touch_events),
        }
```

### Validated Midwife (Bird Feeder)

```python
class ValidatedMidwife:
    """
    Uses an LLM to generate training examples for the Nano Sea.
    
    Key improvement over v1: VALIDATES examples by execution before using them.
    If the LLM hallucinates bad code, it's caught and discarded.
    
    Also implements curriculum pacing: generates examples matched to
    the swarm's current capability level.
    """
    def __init__(self, llm_adapter, difficulty_levels=None):
        self.llm = llm_adapter
        self.difficulty_levels = difficulty_levels or [
            {'level': 1, 'type': 'complete_line',     'max_tokens': 10},
            {'level': 2, 'type': 'complete_function',  'max_tokens': 50},
            {'level': 3, 'type': 'generate_class',     'max_tokens': 200},
            {'level': 4, 'type': 'generate_file',      'max_tokens': 1000},
            {'level': 5, 'type': 'generate_project',   'max_tokens': 5000},
        ]
        self.current_level = 1
    
    def generate_batch(self, batch_size=MIDWIFE_TASKS_PER_ROUND):
        level = self.difficulty_levels[self.current_level - 1]
        examples = []
        
        for _ in range(batch_size * 2):  # generate 2x, expect ~50% validation rate
            prompt = self._make_prompt(level)
            response = self.llm.call(prompt, max_tokens=level['max_tokens'])
            
            example = self._parse_response(response, level)
            if example and self._validate(example, level):
                examples.append(example)
            
            if len(examples) >= batch_size:
                break
        
        return examples
    
    def _validate(self, example, level):
        """Execute the code to check it works."""
        if level['type'] in ('complete_function', 'generate_class', 'generate_file'):
            try:
                import subprocess
                result = subprocess.run(
                    ['python', '-c', example['expected_output']],
                    capture_output=True, timeout=5, text=True
                )
                return result.returncode == 0
            except:
                return False
        return True  # non-code examples get structural validation only
    
    def advance_if_ready(self, swarm_accuracy_at_current_level):
        """Move to harder examples when swarm masters current level."""
        if swarm_accuracy_at_current_level > 0.7 and self.current_level < len(self.difficulty_levels):
            self.current_level += 1
```

### Local Data Scanner

```python
class LocalDataScanner:
    """
    Scans user's local files for training data.
    
    This is what makes the nano sea PERSONAL. It learns from:
    - Your code files (Python, JS, C++, etc.)
    - Your documents (what topics you work on)
    - Your IDE history (what patterns you use)
    
    Also extracts keywords for web scraping to find related content.
    """
    def scan(self, paths, extensions=('.py', '.js', '.ts', '.cpp', '.md', '.txt')):
        training_pairs = []
        keywords = set()
        
        for path in paths:
            for ext in extensions:
                for file in Path(path).rglob(f'*{ext}'):
                    content = file.read_text(errors='ignore')
                    
                    # Extract training pairs (sliding window)
                    chunks = self._chunk(content, chunk_size=SEQ_LEN)
                    for i in range(len(chunks) - 1):
                        training_pairs.append({
                            'input': chunks[i],
                            'target': chunks[i + 1],
                            'source': str(file),
                            'language': ext,
                        })
                    
                    # Extract keywords for web scraping
                    keywords.update(self._extract_keywords(content))
        
        return training_pairs, keywords
```

### Independence Tracker

```python
class IndependenceTracker:
    """
    Tracks when the nano sea can replace the LLM for each task type.
    
    When the swarm's accuracy on a task type exceeds the threshold,
    the midwife stops generating examples for that task (the sea handles it).
    
    This is how the bird feeder is gradually disconnected.
    """
    THRESHOLDS = {
        'line_completion': 0.85,
        'function_generation': 0.80,
        'bug_detection': 0.75,
        'code_explanation': 0.70,
        'project_generation': 0.60,
    }
    
    def check(self, swarm, test_suites, llm):
        report = {}
        for task, threshold in self.THRESHOLDS.items():
            if task in test_suites:
                swarm_score = self._evaluate(swarm, test_suites[task])
                llm_score = self._evaluate_llm(llm, test_suites[task])
                ratio = swarm_score / (llm_score + 1e-9)
                report[task] = {
                    'swarm_score': swarm_score,
                    'llm_score': llm_score,
                    'ratio': ratio,
                    'independent': ratio >= threshold,
                }
        return report
```

---

## 3.13 Memory Manager (Nano Paging)

```python
class NanoMemoryManager:
    """
    Pages nanos between GPU (hot), CPU RAM (warm), and disk (cold).
    
    With millions of nanos, only a fraction fits on GPU at once.
    This manager handles transparent paging with LRU eviction
    and predictive prefetch.
    
    Budget: ~4GB GPU nano cache → ~20,000 nanos at 200KB each.
    """
    def __init__(self, gpu_budget_mb=GPU_NANO_BUDGET_MB,
                 cpu_budget_mb=CPU_NANO_BUDGET_MB,
                 checkpoint_dir='checkpoints'):
        self.gpu_cache = OrderedDict()  # nano_id → Nano on GPU
        self.cpu_cache = OrderedDict()  # nano_id → Nano on CPU
        self.checkpoint_dir = Path(checkpoint_dir)
        self.gpu_budget = gpu_budget_mb * 1024 * 1024  # bytes
        self.cpu_budget = cpu_budget_mb * 1024 * 1024
        self.gpu_used = 0
        self.cpu_used = 0
    
    def get(self, nano_id):
        """Get nano, promoting through tiers as needed."""
        if nano_id in self.gpu_cache:
            self.gpu_cache.move_to_end(nano_id)
            return self.gpu_cache[nano_id]
        
        if nano_id in self.cpu_cache:
            nano = self.cpu_cache.pop(nano_id)
            self.cpu_used -= self._nano_bytes(nano)
            nano = nano.cuda()
            self._gpu_put(nano_id, nano)
            return nano
        
        # Load from disk
        path = self.checkpoint_dir / f'{nano_id}.pt'
        if path.exists():
            nano = torch.load(path, map_location='cuda')
            self._gpu_put(nano_id, nano)
            return nano
        
        return None  # nano doesn't exist
    
    def _gpu_put(self, nano_id, nano):
        nano_bytes = self._nano_bytes(nano)
        while self.gpu_used + nano_bytes > self.gpu_budget and self.gpu_cache:
            self._evict_gpu_lru()
        self.gpu_cache[nano_id] = nano
        self.gpu_used += nano_bytes
    
    def _evict_gpu_lru(self):
        evicted_id, evicted_nano = self.gpu_cache.popitem(last=False)
        self.gpu_used -= self._nano_bytes(evicted_nano)
        evicted_nano = evicted_nano.cpu()
        self.cpu_cache[evicted_id] = evicted_nano
        self.cpu_used += self._nano_bytes(evicted_nano)
        # If CPU is also full, spill to disk
        while self.cpu_used > self.cpu_budget and self.cpu_cache:
            disk_id, disk_nano = self.cpu_cache.popitem(last=False)
            self.cpu_used -= self._nano_bytes(disk_nano)
            torch.save(disk_nano, self.checkpoint_dir / f'{disk_id}.pt')
    
    def prefetch(self, nano_ids):
        """Preload nanos that will be needed soon (from ChromaticIndex predictions)."""
        for nid in nano_ids:
            if nid not in self.gpu_cache:
                self.get(nid)
```

---

## 3.14 Federated Aggregation (Mesh)

```python
class FederatedAggregator:
    """
    Combines nanos from multiple machines into global "super nanos."
    
    Only averages nanos with similar RBY positions (similar specialization).
    Averaging a syntax nano with a semantics nano would destroy both.
    
    Uses fitness-weighted averaging: better nanos contribute more.
    """
    def aggregate(self, nanos_by_machine):
        # 1. Collect all nanos with their RBY positions
        all_nanos = []
        for machine_id, nanos in nanos_by_machine.items():
            for nano in nanos:
                all_nanos.append((machine_id, nano))
        
        # 2. Cluster by RBY position (only merge similar nanos)
        positions = torch.stack([n.rby_position.detach() for _, n in all_nanos])
        from sklearn.cluster import KMeans
        n_clusters = max(1, len(all_nanos) // 5)  # ~5 nanos per cluster
        labels = KMeans(n_clusters=n_clusters).fit_predict(positions.numpy())
        
        # 3. Weighted average within each cluster
        super_nanos = []
        for cluster_id in range(n_clusters):
            members = [(m, n) for (m, n), l in zip(all_nanos, labels) if l == cluster_id]
            if not members:
                continue
            
            total_fitness = sum(n.fitness for _, n in members)
            if total_fitness < 1e-9:
                continue
            
            # Create averaged nano
            template = members[0][1]
            super_nano = Nano(template.up.in_features, template.hidden_dim)
            
            with torch.no_grad():
                for name, param in super_nano.named_parameters():
                    param.zero_()
                    for _, member_nano in members:
                        weight = member_nano.fitness / total_fitness
                        member_param = dict(member_nano.named_parameters())[name]
                        param.add_(weight * member_param)
            
            super_nano.fitness = total_fitness / len(members)
            super_nanos.append(super_nano)
        
        return super_nanos
```

---

## 3.15 HTTP Server Interface

```python
# FastAPI server at :5100
# Endpoints:

# POST /v1/generate
# Input: {"prompt": "def fibonacci(", "max_tokens": 100}
# Output: {"text": "def fibonacci(n):\n    ...", "nano_count": 24, "latency_ms": 15}

# POST /v1/training/observe
# Input: {"type": "code_completion", "input": "...", "expected_output": "..."}
# Output: {"accepted": true, "queued_for": ["swarm_layer_1", "swarm_layer_2"]}

# GET /health
# Output: {"status": "ok", "nanos_total": 5000, "nanos_gpu": 200, "cycle": 3}

# GET /v1/sea/status
# Output: {"cycle": 3, "nanos_total": 5000, "fitness_avg": 0.62, "rby": [0.35, 0.30, 0.35]}

# GET /v1/sea/metrics
# Output: {"ppl": 12.3, "avg_k": 2.1, "router_entropy": 1.8, "touch_coverage": 0.85}

# POST /v1/midwife/trigger
# Input: {"rounds": 5}
# Output: {"generated": 25, "validated": 18, "rejected": 7}
```

---

# PART IV: FILE STRUCTURE & BUILD ORDER

## 4.1 Directory Layout

```
nano_sea_v2/
├── main.py                     ← Entry point: init sea, start server, begin training
├── config.py                   ← All hyperparameters from §2.2
├── requirements.txt            ← torch, fastapi, uvicorn, scipy, scikit-learn
│
├── core/
│   ├── nano.py                 ← Nano class (§3.1)
│   ├── swarm_layer.py          ← SwarmLayer class (§3.2)
│   ├── swarm_model.py          ← NanoSeaModel (embedding + layers + head)
│   ├── router.py               ← SwarmRouter + soft_k_selection (§3.3, §3.4)
│   ├── crosstalk.py            ← ExpertCrosstalk (§3.5)
│   ├── chromatic_index.py      ← ChromaticIndex KD-tree (§3.3)
│   ├── touch_tensor.py         ← TouchTensor (§3.6)
│   └── rby.py                  ← RBY math, UF/IO formulas, seed mutation
│
├── lifecycle/
│   ├── fitness.py              ← FitnessEvaluator (§3.7)
│   ├── spawner.py              ← NanoSpawner (§3.8)
│   ├── compression.py          ← CompressionEngine + Deposit (§3.9)
│   ├── absularity.py           ← AbsularityDetector (§3.10)
│   ├── cosmic_cycle.py         ← CosmicCycleManager (§3.11)
│   └── deposit_store.py        ← Deposit persistence (save/load/query)
│
├── training/
│   ├── swarm_trainer.py        ← SwarmTrainer end-to-end (§3.12)
│   ├── midwife.py              ← ValidatedMidwife (§3.12)
│   ├── local_scanner.py        ← LocalDataScanner (§3.12)
│   ├── web_scraper.py          ← Keyword-driven web scraping for training data
│   ├── curriculum.py           ← CurriculumPacer (difficulty progression)
│   ├── independence.py         ← IndependenceTracker (§3.12)
│   └── data_loader.py          ← DataLoader for training batches
│
├── memory/
│   ├── paging.py               ← NanoMemoryManager (§3.13)
│   └── prefetch.py             ← Predictive prefetch from ChromaticIndex
│
├── compute/
│   ├── device_manager.py       ← GPU/CPU detection, multi-GPU distribution
│   └── gpu_detect.py           ← Hardware detection
│
├── mesh/
│   ├── discovery.py            ← mDNS peer discovery
│   ├── transport.py            ← Send/receive nano weights
│   ├── federated.py            ← FederatedAggregator (§3.14)
│   ├── trust.py                ← Trust/reputation scoring
│   └── node.py                 ← This machine as a mesh node
│
├── server/
│   ├── main.py                 ← FastAPI app (§3.15)
│   └── routes.py               ← API route handlers
│
├── tokenizer/
│   ├── bpe.py                  ← BPE tokenizer training + encode/decode
│   └── ptaie.py                ← PTAIE spectral mapping (optional prior)
│
├── checkpoints/                ← Saved nano weights (.pt files)
├── deposits/                   ← Deposit JSON + weight files
├── logs/                       ← Training logs (.jsonl)
└── data/                       ← Training corpus + local scan cache
```

## 4.2 Build Order (Phases)

### Phase 1: Core Model (Can generate text with random nanos)

Build these files first. When done, you can run: `model = NanoSeaModel(...)`,
`output = model(input_ids)`, and get (terrible) predictions.

```
1. config.py
2. core/nano.py
3. core/router.py           (start with simple linear scorer, not two-stage)
4. core/crosstalk.py
5. core/swarm_layer.py
6. core/swarm_model.py      (embedding + N SwarmLayers + output head)
7. core/rby.py              (RBY math, UF/IO formulas)
```

**Test:** Create model with 8 nanos per layer × 3 layers = 24 nanos.
Feed random token IDs. Get logits out. Verify shapes.

### Phase 2: Training (Nanos actually learn)

```
8. tokenizer/bpe.py          (or use existing tokenizer)
9. training/data_loader.py
10. training/swarm_trainer.py
11. core/touch_tensor.py
```

**Test:** Train on Shakespeare (same as research tests).
Verify loss decreases. Verify touch_tensor shows specialization.

### Phase 3: Lifecycle (The sea evolves)

```
12. lifecycle/fitness.py
13. lifecycle/spawner.py
14. lifecycle/compression.py
15. lifecycle/deposit_store.py
16. lifecycle/absularity.py
17. lifecycle/cosmic_cycle.py
```

**Test:** Run 3 cosmic cycles. Verify Cycle 2 PPL < Cycle 0 PPL.

### Phase 4: Bird Feeder (LLM generates training data)

```
18. training/midwife.py
19. training/local_scanner.py
20. training/curriculum.py
21. training/independence.py
22. training/web_scraper.py
```

**Test:** Midwife generates 100 examples. ≥50% pass validation.
Feed to swarm. Verify loss improves.

### Phase 5: Memory Paging (Scale to thousands of nanos)

```
23. memory/paging.py
24. memory/prefetch.py
25. core/chromatic_index.py   (upgrade router to two-stage)
26. core/router.py            (update to use ChromaticIndex)
```

**Test:** Create 10,000 nanos. Verify only ~200 on GPU at once.
Verify prefetch loads correct nanos before forward pass.

### Phase 6: Server & API

```
27. server/main.py
28. server/routes.py
29. main.py                   (entry point wiring everything together)
```

**Test:** `curl localhost:5100/v1/generate -d '{"prompt":"def hello"}'`

### Phase 7: Mesh (Multi-machine)

```
30. mesh/discovery.py
31. mesh/transport.py
32. mesh/federated.py
33. mesh/trust.py
34. mesh/node.py
```

**Test:** Two machines discover each other. Nanos federated-averaged.

### Phase 8: Integration with Meta-Agent

Wire the nano sea into the meta-agent shell from
`agent_meta_architecture_action_plan.json`:

```
35. NanoSeaAdapter in llm_adapter.py  (drop-in replacement for Ollama/Anthropic)
36. Update meta_agent_controller.py to use NanoSeaAdapter
```

---

# PART V: MATHEMATICAL PROOFS & CONSTRAINTS

These are PROVEN results from 30 experiments. Treat as constraints, not suggestions.

## 5.1 Soft K-Selection is Required

**DO NOT** use `argmax` or hard `topk` for selecting how many nanos to activate.
`argmax` has zero gradient → the model can't learn how many nanos to use.

Use the reverse cumsum method (proven in test_30v3):
```
slot_weights = sigmoid(k_logits).flip(-1).cumsum(-1).flip(-1)
```
This gives each slot a "probability of being active" that's fully differentiable.
CE loss gradient flows through, enabling the model to learn the optimal k.

## 5.2 Efficiency Loss is Required But Gentle

Without efficiency loss, the router activates ALL nanos (k = max). Waste of compute.
With too much efficiency loss (λ > 0.05), k collapses to 1. Not enough capacity.

**Proven optimal:** `EFF_LAMBDA = 0.01`

## 5.3 The Model Prefers Low k at Small Scale

At ~330K total params, the system naturally settles at avg_k ≈ 1.1.
**This is correct behavior, not a bug.** Don't force higher k.
As the sea grows (more nanos, more data), k will naturally increase.

## 5.4 Crosstalk Gate Must Start at 0

Initialize `ExpertCrosstalk.gate = 0.0` (sigmoid → 0.5, but the parameter = 0).
This means the system starts as standard MoE and LEARNS whether crosstalk helps.
If you initialize at 0.5, training is unstable.

## 5.5 Aitchison Distance for RBY Space

When measuring distance between two RBY positions (points on the simplex),
use Aitchison distance, NOT Euclidean. Euclidean distorts the simplex edges.

```python
def aitchison_distance(x, z, eps=1e-8):
    x, z = x.clamp(min=eps), z.clamp(min=eps)
    g_x, g_z = x.prod().pow(1/3), z.prod().pow(1/3)
    return ((x/g_x).log() - (z/g_z).log()).norm()
```

## 5.6 Parallel GPU: Use spawn, Not fork

For multi-GPU on Windows, `torch.multiprocessing.set_start_method('spawn')`.
Each worker MUST load its own data copy. Sharing across CUDA contexts crashes.

## 5.7 Optimizer State Must Be Handled Carefully

When nanos die and are removed from the pool, clean up optimizer state:
```python
for p in dead_nano.parameters():
    optimizer.state.pop(p, None)
```
Do NOT use `id(p)` as key — optimizer state uses tensor references directly.

---

# PART VI: UF/IO AND RBY FORMULAS (Canonical)

These are proven in test_02 and are the "nervous system" of the nano sea.

```python
import math

def compute_uf_io(success, error, complexity):
    """
    UF = expansion drive, IO = stability drag.
    
    success: 0-1, how well the sea is performing
    error: 0-1, how much is going wrong
    complexity: 0-1, how complex the current configuration is
    """
    UF = success * (1 - math.tanh(complexity))
    IO = error * math.tanh(complexity)
    return UF, IO

def update_rby(rby, UF, IO, success, error, plasticity=(0.1, 0.05, 0.08)):
    """
    Update the RBY seed based on current dynamics.
    
    rby: current (r, b, y) triplet on simplex
    plasticity: how much each channel can change per step
    """
    r, b, y = rby
    pr, pb, py = plasticity
    
    # R (perception) increases with error (need to observe more)
    r_new = r + pr * (error - r) * UF
    
    # B (cognition) increases with complexity (need to think more)
    b_new = b + pb * (math.tanh(success) - b) * IO
    
    # Y (execution) is the remainder (simplex constraint)
    total = r_new + b_new
    if total >= 1.0:
        r_new = r_new / (total + 0.01) * 0.99
        b_new = b_new / (total + 0.01) * 0.99
    y_new = 1.0 - r_new - b_new
    
    return (max(0.01, r_new), max(0.01, b_new), max(0.01, y_new))
```

---

# PART VII: KNOWN CONSTRAINTS & EDGE CASES

## Hardware Limits on 1660-Dually

| Resource | Budget | Implication |
|----------|--------|-------------|
| GPU VRAM (each) | 6GB | ~20,000 nanos at 200KB each, minus activation memory |
| GPU VRAM (practical) | 4GB for nanos | Reserve 2GB for activations, optimizer, batch data |
| CPU RAM | 80GB | ~400,000 warm nanos at 200KB each |
| Disk | Unlimited | Cold storage for all nanos |
| Both GPUs | Yes | Use spawn multiprocessing. GPU0 has Windows overhead (~1.9GB). |

## Tokenizer Choice

Character-level won't work at production scale (too slow, too many steps per word).
Options:
- Train BPE on your code corpus (4096–16384 vocab). RECOMMENDED.
- Use an existing code tokenizer (StarCoder, CodeLlama vocab).
- SentencePiece for multilingual support.

If using PTAIE spectral embedding: map BPE token IDs to RBY via the token's
constituent bytes' PTAIE positions (average the byte-level RBY values).

## Midwife LLM Requirements

The midwife needs an LLM to generate training data. Options:
- **Ollama** (local): Mistral, CodeLlama, DeepSeek-Coder — free, private, slower
- **API** (cloud): Claude, GPT-4o-mini — faster, costs money, sends code to cloud
- **Recommendation:** Start with Ollama locally. Use API for hard examples only.

The midwife adapter wraps ANY LLM via the same `LLMAdapter.call(prompt)` interface
from the meta-agent's `llm_adapter.py`.

---

# APPENDIX A: GLOSSARY

| Term | Definition |
|------|-----------|
| Nano | A tiny neural network (1K–50K params) that specializes in one pattern |
| Nano Sea | The collective of all nanos + routing + lifecycle |
| Swarm Layer | One layer of the model: attention + routed nano pool |
| RBY | Red-Blue-Yellow simplex. R=perception, B=cognition, Y=execution. R+B+Y=1. |
| UF | Unstoppable Force — expansion drive |
| IO | Immovable Object — stability resistance |
| Absularity | Point where the system has fully explored its current config (saturation) |
| Deposit | Compressed knowledge from a dead nano that seeds future nanos |
| Cosmic Cycle | One full expand→train→compress→deposit→mutate loop |
| Touch Tensor | Log of which nanos activate for which inputs |
| Chromatic Router | Routes inputs by projecting to RBY space and finding nearest nanos |
| Aitchison Distance | The correct distance metric for points on the RBY simplex |
| Soft k | Differentiable selection of how many nanos activate (reverse cumsum method) |
| Crosstalk | Cross-attention between active nanos — IC-AE reborn |
| Midwife | System that uses an LLM to generate training data for nanos |
| Bird Feeder | Same as midwife — "feeding" the nano sea until it can feed itself |
| Independence | When the nano sea replaces the LLM for a specific task type |
| Twmrto | Progressive lossy compression (full → SVD → centroid → RBY position only) |

---

# APPENDIX B: WHAT THIS IS NOT

- **This is NOT MoE.** MoE has a fixed number of fixed-size experts decided at init time. The Nano Sea has a dynamic, evolving ecosystem of nanos that are born, trained, killed, and reborn. MoE gave us the routing MATH. The Nano Sea is the ORGANISM.

- **This is NOT a wrapper around an LLM.** The LLM is a temporary training data source (bird feeder). The goal is to REPLACE it entirely.

- **This is NOT 296 nanos.** That was a misunderstanding. The sea grows without limit. The "17 types" are also gone — replaced by universal nanos with emergent specialization.

- **This is NOT hardcoded.** Nano specialization, count, size, activation patterns — all LEARNED, not assigned.
