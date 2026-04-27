# 02 — Nano Anatomy

## What A Nano Actually IS

A nano is a small, independently trained neural network with a narrow specialization.
It is NOT a function. It is NOT a rule. It has learned weights and performs inference.

---

## Physical Specification

| Property              | Value                        | Notes                                         |
|-----------------------|------------------------------|-----------------------------------------------|
| **Size on disk**      | 1 KB — 20 MB                | Modal average ~500 KB                         |
| **Architecture**      | Varies by type (see below)   | Always small: 1-4 layers                      |
| **Parameters**        | 100 — 5,000,000              | Most have < 100,000                           |
| **Input**             | Fixed-size tensor            | Typically 64-512 floats                       |
| **Output**            | Fixed-size tensor            | Typically 1-512 floats                        |
| **Training time**     | Seconds to minutes           | Per nano on CPU; population batch on GPU      |
| **Inference time**    | < 5 ms                       | Per nano, even on CPU                         |
| **Independence**      | Total                        | No backprop across nanos; each trains alone   |
| **GPU training mode** | Batched populations (20–500) | Single-nano GPU is slower than CPU (kernel overhead) |
| **NCU cost**          | 0.94 – 10.24 NCU/step       | 1 NCU = 1 FeatureNano training step @batch=64 |

---

## Nano Types

### Type 1: Feature Nano (Perception — Red Channel)

**Purpose**: Detect a specific pattern in input data.

```
Architecture: 2-layer MLP (Linear → ReLU → Linear → Sigmoid)
Input:        Embedding vector (128-512 dims)
Output:       Scalar confidence [0,1] or small feature vector
Size:         10 KB — 500 KB
```

**Examples**:
- Detects presence of English past tense
- Detects for-loop patterns in Python
- Detects image edge orientations
- Detects speaker gender from audio spectrogram slice

```python
class FeatureNano(nn.Module):
    def __init__(self, input_dim: int = 256, hidden_dim: int = 64, output_dim: int = 1):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, output_dim),
            nn.Sigmoid()
        )
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)
```

---

### Type 2: Pattern Nano (Cognition — Blue Channel)

**Purpose**: Process sequences and predict continuations.

```
Architecture: Tiny transformer (1-2 layers, 2-4 attention heads)
Input:        Sequence of token embeddings (max 64 tokens)
Output:       Next-token probability distribution
Size:         500 KB — 5 MB
```

**Examples**:
- Predicts next word in English sentences about cooking
- Predicts next AST node in Python function definitions
- Predicts next chord in a musical sequence

```python
class PatternNano(nn.Module):
    def __init__(self, vocab_size: int = 1024, d_model: int = 64, 
                 n_heads: int = 2, n_layers: int = 1, max_seq: int = 64):
        super().__init__()
        self.embed = nn.Embedding(vocab_size, d_model)
        self.pos = nn.Embedding(max_seq, d_model)
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model, nhead=n_heads, dim_feedforward=d_model * 4,
            batch_first=True
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=n_layers)
        self.head = nn.Linear(d_model, vocab_size)
    
    def forward(self, tokens: torch.Tensor) -> torch.Tensor:
        seq_len = tokens.size(1)
        pos_ids = torch.arange(seq_len, device=tokens.device)
        x = self.embed(tokens) + self.pos(pos_ids)
        x = self.transformer(x)
        return self.head(x[:, -1, :])  # predict from last position
```

---

### Type 3: Action Nano (Execution — Yellow Channel)

**Purpose**: Generate output tokens, code, or commands.

```
Architecture: Small decoder (1-2 layers, autoregressive)
Input:        Context embedding + task embedding
Output:       Generated token sequence
Size:         1 MB — 10 MB
```

**Examples**:
- Generates Python list comprehensions from description embeddings
- Generates English sentences summarizing a topic
- Generates shell commands from intent embeddings

```python
class ActionNano(nn.Module):
    def __init__(self, vocab_size: int = 2048, d_model: int = 128,
                 n_heads: int = 4, n_layers: int = 2, max_seq: int = 64):
        super().__init__()
        self.embed = nn.Embedding(vocab_size, d_model)
        self.pos = nn.Embedding(max_seq, d_model)
        decoder_layer = nn.TransformerDecoderLayer(
            d_model=d_model, nhead=n_heads, dim_feedforward=d_model * 4,
            batch_first=True
        )
        self.decoder = nn.TransformerDecoder(decoder_layer, num_layers=n_layers)
        self.head = nn.Linear(d_model, vocab_size)
    
    def forward(self, context: torch.Tensor, tokens: torch.Tensor) -> torch.Tensor:
        seq_len = tokens.size(1)
        pos_ids = torch.arange(seq_len, device=tokens.device)
        x = self.embed(tokens) + self.pos(pos_ids)
        
        # Causal mask for autoregressive generation
        mask = nn.Transformer.generate_square_subsequent_mask(seq_len).to(tokens.device)
        x = self.decoder(x, context.unsqueeze(1), tgt_mask=mask)
        return self.head(x)
```

---

### Type 4: Bridge Nano (Cross-Domain Connector)

**Purpose**: Map between two different nano types or modalities.

```
Architecture: Dual-encoder with shared projection space
Input:        Embedding from domain A + embedding from domain B
Output:       Similarity score [0,1] or aligned embedding
Size:         500 KB — 5 MB
```

**Examples**:
- Maps image patch embeddings to text description embeddings
- Maps Python function embeddings to English explanation embeddings
- Maps audio features to text transcription encodings

```python
class BridgeNano(nn.Module):
    def __init__(self, dim_a: int = 256, dim_b: int = 256, shared_dim: int = 128):
        super().__init__()
        self.proj_a = nn.Linear(dim_a, shared_dim)
        self.proj_b = nn.Linear(dim_b, shared_dim)
    
    def forward(self, embed_a: torch.Tensor, embed_b: torch.Tensor) -> torch.Tensor:
        a = F.normalize(self.proj_a(embed_a), dim=-1)
        b = F.normalize(self.proj_b(embed_b), dim=-1)
        return (a * b).sum(dim=-1)  # cosine similarity
```

---

### Type 5: Router Nano (Query → Nano Selector)

**Purpose**: Given a query, determine which nanos should activate.

```
Architecture: Small BERT-style encoder + classification head
Input:        Query embedding
Output:       Activation probabilities over nano clusters
Size:         5 MB — 50 MB
```

**Examples**:
- Routes "how do I sort a list in Python?" → Code-Python cluster + English-instruction cluster
- Routes "what does this image show?" → Vision cluster + English-description cluster

```python
class RouterNano(nn.Module):
    def __init__(self, embed_dim: int = 256, n_clusters: int = 256):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(embed_dim, embed_dim),
            nn.GELU(),
            nn.Linear(embed_dim, embed_dim),
            nn.LayerNorm(embed_dim),
        )
        self.classifier = nn.Linear(embed_dim, n_clusters)
    
    def forward(self, query_embed: torch.Tensor) -> torch.Tensor:
        x = self.encoder(query_embed)
        return torch.sigmoid(self.classifier(x))  # multi-label: multiple clusters can activate
```

---

### Type 6: Orchestrator Nano (Response Combiner)

**Purpose**: Take outputs from multiple activated nanos and produce a coherent combined response.

```
Architecture: Small transformer (2-4 layers) with cross-attention
Input:        Set of nano outputs + original query
Output:       Combined, deconflicted response
Size:         1 MB — 20 MB
```

```python
class OrchestratorNano(nn.Module):
    def __init__(self, d_model: int = 128, n_heads: int = 4, 
                 n_layers: int = 2, max_nanos: int = 64, vocab_size: int = 4096):
        super().__init__()
        self.nano_proj = nn.Linear(d_model, d_model)
        decoder_layer = nn.TransformerDecoderLayer(
            d_model=d_model, nhead=n_heads, dim_feedforward=d_model * 4,
            batch_first=True
        )
        self.decoder = nn.TransformerDecoder(decoder_layer, num_layers=n_layers)
        self.head = nn.Linear(d_model, vocab_size)
    
    def forward(self, nano_outputs: torch.Tensor, query: torch.Tensor) -> torch.Tensor:
        # nano_outputs: [batch, n_nanos, d_model]
        # query: [batch, seq_len, d_model]
        memory = self.nano_proj(nano_outputs)
        x = self.decoder(query, memory)
        return self.head(x)
```

---

## The Nano Identity Card

Every nano carries metadata that defines its identity and tracks its lifecycle:

```python
@dataclass
class NanoCard:
    # Identity
    gid: str                    # Globally unique ID (UUID4)
    nano_type: str              # "feature", "pattern", "action", "bridge", "router", "orchestrator"
    specialization: str         # Human-readable: "english_past_tense", "python_loops", etc.
    
    # RBY Signature (inherited from seed + mutation)
    r: float                    # Perception weight
    b: float                    # Cognition weight
    y: float                    # Execution weight
    
    # Lineage
    parent_gid: Optional[str]   # None for primordial nanos
    cycle_born: int             # Which expansion cycle created this nano
    generation_depth: int       # How many ancestors deep
    seed_at_birth: Tuple[float, float, float]  # The RBY seed when this nano was born
    
    # Weights
    model_path: str             # Path to .pt file
    size_bytes: int             # File size
    param_count: int            # Number of trainable parameters
    architecture_hash: str      # SHA256 of the architecture definition
    
    # Lifecycle Metrics
    creation_time: float        # Unix timestamp
    last_used: float            # Unix timestamp
    usage_count: int            # Total forward passes
    success_count: int          # Times output was used/accepted
    failure_count: int          # Times output was rejected/errored
    
    # Computed Properties
    @property
    def success_rate(self) -> float:
        total = self.success_count + self.failure_count
        return self.success_count / total if total > 0 else 0.5
    
    @property
    def fitness(self) -> float:
        """CANONICAL composite fitness score for pruning/compression decisions.
        
        This is the ONE fitness formula used everywhere. Must match
        11_EVOLUTION_AND_GENERATIONS.md NanoFitness.composite.
        """
        if self.usage_count == 0:
            return 0.25  # Untested nanos get low benefit of the doubt
        
        # Normalize usage to 0-1 via sigmoid
        usage_score = 1.0 / (1.0 + math.exp(-0.1 * (self.usage_count - 10)))
        
        # Uniqueness must be computed externally and injected (default 0.5)
        uniqueness = getattr(self, '_uniqueness', 0.5)
        # Bridge count must be injected (default 0)
        bridge_count = getattr(self, '_bridge_count', 0)
        
        return (
            0.40 * self.success_rate +
            0.20 * usage_score +
            0.25 * uniqueness +
            0.15 * min(1.0, bridge_count / 5.0)
        )
    
    @property 
    def function_embedding(self) -> np.ndarray:
        """A 256-dim vector that represents what this nano DOES, for FAISS routing.
        
        Deterministic: same nano identity always produces the same embedding.
        Uses cryptographic hash of identity fields projected to unit sphere.
        """
        import hashlib
        seed_str = (f"{self.nano_type}:{self.specialization}:"
                    f"{self.r:.4f}:{self.b:.4f}:{self.y:.4f}:"
                    f"{self.architecture_hash}")
        seed_int = int(hashlib.sha256(seed_str.encode()).hexdigest(), 16) % (2**32)
        rng = np.random.RandomState(seed_int)
        embedding = rng.randn(256).astype(np.float32)
        embedding /= np.linalg.norm(embedding)  # Unit normalize for cosine similarity
        return embedding
```

---

## Weighted Experience Architecture (WEA) — Dual-Network Nanos

Per Axiom 9 (Ancestral-Personal Weighting), every nano after Cycle 0 carries
**two** sub-networks: a frozen ancestral network initialized from deposits and
a plastic personal network trained on current-cycle data.

### Why This Matters

Without WEA, each new cycle's nanos start from scratch (or from loose statistical
priors). With WEA, each nano carries the **crystallized knowledge of its ancestors**
as a frozen backbone, and builds personal expertise on top. The older the deposit
lineage, the stronger the ancestral weight — old knowledge COMPOUNDS rather than
decays.

### Dual-Network Wrapper

```python
import math

class WEANano(nn.Module):
    """
    Wrap any nano type in the Weighted Experience Architecture.
    
    ancestral_net: Frozen weights from deposit initialization (the instinct)
    personal_net:  Plastic weights trained on live data (the experience)
    
    Output = weighted blend based on SOFT-CAPPED personal experience growth.
    
    IMPORTANT: The original geometric series W_P = w_p×(1+r)×[(1+r)^t−1]/r
    has been replaced with a soft-cap formula. Experiment test_01 showed the
    geometric series reaches 82 billion at t=500 and overflows float64 at t≈14159.
    The soft cap preserves the growth character while bounding W_P ∈ [0, W_P_max).
    """
    
    # Default soft-cap parameters (configurable per nano type)
    DEFAULT_W_P_MAX = 10.0   # Maximum personal weight
    DEFAULT_K = 0.05         # Growth rate constant
    
    def __init__(self, nano_cls, nano_kwargs: dict, deposit_state_dict: dict = None,
                 G: int = 1, phi: float = 0.5, alpha: float = 0.01,
                 W_P_max: float = DEFAULT_W_P_MAX, k: float = DEFAULT_K):
        super().__init__()
        
        # Ancestral network: initialized from deposits, then FROZEN
        self.ancestral_net = nano_cls(**nano_kwargs)
        if deposit_state_dict:
            self.ancestral_net.load_state_dict(deposit_state_dict)
        for p in self.ancestral_net.parameters():
            p.requires_grad = False  # Frozen — never trained
        
        # Personal network: initialized randomly, actively trained
        self.personal_net = nano_cls(**nano_kwargs)
        
        # WEA parameters (from the Weighted Reality Theory)
        self.W_A = G * phi * alpha            # Ancestral weight (constant)
        self.W_P_max = W_P_max                # Personal weight ceiling
        self.k = k                            # Growth rate constant
        self.t = 0                            # Experience steps (ontogenetic time)
        
        # Compute maturation threshold T_B (soft-cap version)
        # Solve W_P(T_B) = W_A:  W_P_max × (1 - e^(-k×T_B)) = W_A
        # → T_B = -ln(1 - W_A / W_P_max) / k
        if self.W_A > 0 and self.W_A < self.W_P_max and self.k > 0:
            self.T_B = -math.log(1 - self.W_A / self.W_P_max) / self.k
        else:
            # W_A >= W_P_max → nano never matures (stays deposit-guided)
            # W_A = 0 → nano is immediately personal (Cycle 0)
            self.T_B = float('inf') if self.W_A >= self.W_P_max else 0.0
    
    @property
    def W_P(self) -> float:
        """Personal experience weight at current time t (soft-capped).
        
        W_P(t) = W_P_max × (1 − e^(−k × t))
        
        Bounded ∈ [0, W_P_max). Preserves growth character of compounding
        while preventing numerical explosion.
        """
        if self.t == 0:
            return 0.0
        return self.W_P_max * (1 - math.exp(-self.k * self.t))
    
    @property
    def ancestral_ratio(self) -> float:
        """Fraction of output coming from ancestral network."""
        total = self.W_A + self.W_P
        return self.W_A / total if total > 0 else 1.0
    
    @property
    def is_mature(self) -> bool:
        """Has personal experience surpassed ancestral weight?"""
        return self.t >= self.T_B
    
    def forward(self, *args, **kwargs):
        """
        Weighted blend of ancestral and personal output.
        Before T_B: mostly ancestral (deposit-guided).
        After T_B: mostly personal (experience-guided).
        """
        with torch.no_grad():
            ancestral_out = self.ancestral_net(*args, **kwargs)
        personal_out = self.personal_net(*args, **kwargs)
        
        a_ratio = self.ancestral_ratio
        p_ratio = 1.0 - a_ratio
        
        return a_ratio * ancestral_out + p_ratio * personal_out
    
    def step_experience(self):
        """Call after each training batch to advance ontogenetic time."""
        self.t += 1
```

### WEA Per Nano Type

| Nano Type     | Ancestral Source                       | Personal Training                    | Expected T_B  |
|---------------|----------------------------------------|--------------------------------------|---------------|
| Feature       | Deposit weight stats for perception    | Live AE data features                | ~50 steps     |
| Pattern       | Deposit weight stats for cognition     | Live sequence patterns               | ~100 steps    |
| Action        | Deposit weight stats for execution     | Live generation feedback              | ~100 steps    |
| Bridge        | Both parent deposits blended           | Live cross-domain data                | ~75 steps     |
| Router        | Deposit routing success maps           | Live query routing outcomes           | ~30 steps     |
| Orchestrator  | Deposit combination strategies         | Live response quality feedback        | ~200 steps    |

### When WEA Activates

- **Cycle 0 (primordial):** No deposits exist. All nanos are pure personal networks 
  (W_A = 0). WEA wrapper is a no-op.
- **Cycle 1+:** Deposits from Cycle 0 provide ancestral initialization. Nanos start 
  deposit-guided and gradually transition to experience-guided.
- **Deep cycles (10+):** G accumulates across generations. Ancestral weight grows.
  Nanos take LONGER to mature — they respect increasingly deep deposit wisdom.
  
### Anti-Catastrophic-Forgetting

The compounding personal weight means old personal experiences asymptotically 
dominate the personal term as they age. Combined with the frozen ancestral network,
this provides two layers of stability:
1. **Ancestral stability**: deposit knowledge is literally frozen (no gradient)
2. **Personal stability**: early personal experiences compound, resisting overwrite
   by later contradictory data

---

## The Nano Registry

All nanos are indexed in a vector database for fast retrieval:

```python
class NanoRegistry:
    """The index of all living nanos. Backed by FAISS for fast similarity search."""
    
    def __init__(self, embedding_dim: int = 256):
        self.embedding_dim = embedding_dim
        # Use IndexIDMap to support deletion without full rebuild
        self.index = faiss.IndexIDMap(faiss.IndexFlatIP(embedding_dim))
        self.cards: Dict[str, NanoCard] = {}            # gid → NanoCard
        self.gid_to_faiss: Dict[str, int] = {}          # gid → FAISS ID
        self.faiss_to_gid: Dict[int, str] = {}          # FAISS ID → gid (reverse map)
        self._next_faiss_id: int = 0                    # Monotonic FAISS ID counter
        
        # Cluster index for fast type-based lookup
        self.type_index: Dict[str, Set[str]] = defaultdict(set)
        # RBY spatial index (discretized)
        self.rby_grid: Dict[Tuple[int,int,int], Set[str]] = defaultdict(set)
    
    def register(self, card: NanoCard, embedding: np.ndarray):
        """Add a nano to the registry."""
        faiss_id = self._next_faiss_id
        self._next_faiss_id += 1
        
        # FAISS IndexIDMap requires explicit IDs
        ids = np.array([faiss_id], dtype=np.int64)
        self.index.add_with_ids(embedding.reshape(1, -1), ids)
        
        self.cards[card.gid] = card
        self.gid_to_faiss[card.gid] = faiss_id
        self.faiss_to_gid[faiss_id] = card.gid  # O(1) reverse lookup
        self.type_index[card.nano_type].add(card.gid)
        rby_key = (int(card.r * 10), int(card.b * 10), int(card.y * 10))
        self.rby_grid[rby_key].add(card.gid)
    
    def query(self, query_embedding: np.ndarray, k: int = 50,
              type_filter: Optional[str] = None) -> List[Tuple[NanoCard, float]]:
        """Find the k most relevant nanos for a query. O(1) reverse lookup."""
        distances, indices = self.index.search(query_embedding.reshape(1, -1), k * 2)
        
        results = []
        for dist, idx in zip(distances[0], indices[0]):
            if idx < 0:
                continue
            gid = self.faiss_to_gid.get(int(idx))
            if gid is None:
                continue  # Stale FAISS entry (deleted nano)
            card = self.cards.get(gid)
            if card is None:
                continue
            if type_filter is None or card.nano_type == type_filter:
                results.append((card, float(dist)))
            if len(results) >= k:
                break
        
        return results
    
    def remove(self, gid: str):
        """Remove a nano from the registry. Uses IndexIDMap for O(1) deletion."""
        if gid in self.cards:
            card = self.cards[gid]
            self.type_index[card.nano_type].discard(gid)
            rby_key = (int(card.r * 10), int(card.b * 10), int(card.y * 10))
            self.rby_grid[rby_key].discard(gid)
            
            # Remove from FAISS using IndexIDMap
            faiss_id = self.gid_to_faiss.get(gid)
            if faiss_id is not None:
                self.index.remove_ids(np.array([faiss_id], dtype=np.int64))
                del self.faiss_to_gid[faiss_id]
                del self.gid_to_faiss[gid]
            
            del self.cards[gid]
    
    def rebuild_index(self):
        """Full FAISS rebuild. Call periodically after many deletions."""
        new_index = faiss.IndexIDMap(faiss.IndexFlatIP(self.embedding_dim))
        for gid, card in self.cards.items():
            embedding = card.function_embedding
            faiss_id = self.gid_to_faiss[gid]
            ids = np.array([faiss_id], dtype=np.int64)
            new_index.add_with_ids(embedding.reshape(1, -1), ids)
        self.index = new_index
    
    @property
    def population(self) -> int:
        return len(self.cards)
```

---

## GPU Population Training (Batched Execution)

**KEY FINDING (Experiment 08–09):** Individual nanos are too small to utilize GPU
efficiently. Kernel launch overhead dominates. The solution: **batch populations
of same-architecture nanos into a single GPU kernel launch.**

| Metric | Sequential (1 nano) | Batched (100 nanos) | Batched (500 nanos) |
|--------|---------------------|---------------------|---------------------|
| GPU vs CPU speedup | 0.7x (GPU *slower*) | 3.4x GPU wins | 4.6x GPU wins |
| GPU throughput | 805 nanos/s | 61,712 nanos/s | 59,862 nanos/s |
| GPU crossover | N/A | N ≥ 20 nanos | Saturates ~500 |

```python
class NanoPopulation(nn.Module):
    """A POPULATION of nanos trained as one batched module.
    
    The GPU's SIMD architecture maps naturally to nano populations:
    each CUDA core processes one nano in parallel. The scheduler's
    job is to pack populations to fill GPU wavefronts.
    
    Experimentally validated on 2x GTX 1660 SUPER (6GB VRAM each):
      - Pop=100: 71,869 nanos/s on GPU vs 15,417 on CPU (4.7x)
      - Pop=500: 67,360 nanos/s on GPU vs 11,270 on CPU (6.0x)
      - Multi-GPU (1000 split 2x): 170,718 nanos/s (2.5x over single)
    """
    def __init__(self, n_nanos: int, input_dim=256, hidden_dim=64, output_dim=32):
        super().__init__()
        self.n = n_nanos
        # All N nanos' weights in single tensors → ONE bmm kernel launch
        self.W1 = nn.Parameter(torch.randn(n_nanos, hidden_dim, input_dim) * math.sqrt(2.0/input_dim))
        self.b1 = nn.Parameter(torch.zeros(n_nanos, 1, hidden_dim))
        self.W2 = nn.Parameter(torch.randn(n_nanos, output_dim, hidden_dim) * math.sqrt(2.0/hidden_dim))
        self.b2 = nn.Parameter(torch.zeros(n_nanos, 1, output_dim))
        
        # Per-nano metadata (not trained)
        self.register_buffer('deposits', torch.zeros(n_nanos))
        self.register_buffer('fitness', torch.zeros(n_nanos))
        self.register_buffer('generations', torch.zeros(n_nanos, dtype=torch.long))
    
    def forward(self, x):
        """x: [N, batch, input_dim] → [N, batch, output_dim]
        Each nano gets its own data batch in a single matmul."""
        h = torch.bmm(x, self.W1.transpose(1, 2)) + self.b1   # [N, batch, hidden]
        h = F.gelu(h)
        return torch.bmm(h, self.W2.transpose(1, 2)) + self.b2  # [N, batch, output]
    
    def extract_nano(self, idx: int) -> Dict:
        """Extract single nano's weights (for mesh sharing)."""
        return {
            'W1': self.W1[idx].detach().cpu(),
            'b1': self.b1[idx].detach().cpu(),
            'W2': self.W2[idx].detach().cpu(),
            'b2': self.b2[idx].detach().cpu(),
            'deposit': self.deposits[idx].item(),
            'fitness': self.fitness[idx].item(),
        }
    
    def inject_nano(self, idx: int, weights: Dict):
        """Inject a nano received from the mesh."""
        with torch.no_grad():
            self.W1[idx] = weights['W1'].to(self.W1.device)
            self.b1[idx] = weights['b1'].to(self.b1.device)
            self.W2[idx] = weights['W2'].to(self.W2.device)
            self.b2[idx] = weights['b2'].to(self.b2.device)
            self.deposits[idx] = weights.get('deposit', 0)
            self.fitness[idx] = weights.get('fitness', 0)
```

### Nano Compute Unit (NCU)

The **NCU** is the universal currency for measuring compute across heterogeneous
hardware. Every device in the mesh is rated in NCU/s.

**Definition:** 1 NCU = 1 training step of a standard FeatureNano(256→64→32)
on batch_size=64.

| Device | NCU/s (batched, N=100) | VRAM | Max simultaneous nanos |
|--------|------------------------|------|------------------------|
| GTX 1050 (2GB) | ~8,600 | 2 GB | ~3,000 |
| GTX 1660 Super (6GB) | 18,931 (measured) | 6 GB | ~11,000 |
| RTX 3060 (12GB) | ~48,200 | 12 GB | ~22,000 |
| RTX 3090 (24GB) | ~141,000 | 24 GB | ~45,000 |
| RTX 4090 (24GB) | ~220,000 | 24 GB | ~50,000 |
| CPU 8-core | ~14,000 | RAM | ~50,000 |
| Apple M2 GPU | ~5,700 | 8 GB | ~15,000 |

### NCU Cost Per Nano Type

| Nano Type | Steps/s (GPU) | NCU Cost | Meaning |
|-----------|---------------|----------|---------|
| FeatureNano | 748 | 1.00 | Reference unit |
| PatternNano | 261 | 2.86 | 1 step = 2.9 FeatureNano steps |
| ActionNano | 782 | 0.96 | Slightly cheaper than Feature |
| BridgeNano | 798 | 0.94 | Cheapest nano type |
| RouterNano | 750 | 1.00 | Same as Feature |
| BigPattern (4-layer) | 73 | 10.24 | 10x a Feature step |
| HugeAction (5M params) | 177 | 4.23 | Expensive but GPU-efficient |

---

## Session 3 Patch — [DATE: 2025-07-XX]

### Experimental Findings: D-03, S-01, S-05

#### D-03 FIX — Canonical Fitness Function Confirmed

**Source:** ADVERSARIAL_AUDIT.md finding D-03, validated by test_15.

The fitness function existed in inconsistent forms across specs. The **CANONICAL
version** is now confirmed as the composite formula with usage warmup and bridge
bonus, already present in this file's `NanoCard.fitness` property:

```python
# CANONICAL FITNESS — D-03 FIX (test_15 validated)
# This is THE fitness function. All other files must match.
fitness = (
    0.40 * task_score * usage_modifier   # Performance weighted by experience
  + 0.25 * efficiency                    # Resource efficiency
  + 0.20 * uniqueness                    # RBY-space coverage (anti-monoculture)
  + 0.15 * bridge_bonus                  # Cross-domain connectivity reward
)

# Where:
#   task_score    = success_count / max(usage_count, 1)
#   usage_modifier = sigmoid(-0.1 * (usage_count - 10))  # warmup: untested nanos penalized
#   efficiency    = task_score / max(param_count / 10000, 0.1)  # accuracy per parameter
#   uniqueness    = avg cosine distance to k=5 nearest neighbors in RBY space
#   bridge_bonus  = min(1.0, bridge_count / 5.0)
#   Untested nanos (usage_count=0): fitness = 0.25 (benefit of the doubt)
```

**Note:** The version in this file uses `success_rate` directly rather than
`task_score * usage_modifier`. Both converge to the same behavior for nanos with
>10 uses. The key constraint is that the **weight vector (0.40, 0.25, 0.20, 0.15)**
is canonical and must not be changed without re-running the fitness calibration.

#### S-01 FIX — HysteresisScheduler for GPU/CPU Transitions

**Source:** test_15 finding S-01.

**Problem:** The GPU scheduling rules (see §GPU Population Training above) use a
hard threshold of N≥20 to route to GPU. In practice, populations fluctuate around
the threshold, causing rapid GPU↔CPU device switches that waste time on memory
transfers.

**Fix — HysteresisScheduler:**

```python
class HysteresisScheduler:
    """
    GPU/CPU routing with hysteresis to prevent device thrashing.
    
    GPU_UP_THRESHOLD   = 25  # Switch TO GPU when population reaches 25
    GPU_DOWN_THRESHOLD = 15  # Switch FROM GPU only when population drops to 15
    MIN_SWITCH_INTERVAL = 10 # seconds — minimum time between device changes
    
    Result: 56% fewer device switches in test_15 benchmark.
    """
    GPU_UP   = 25
    GPU_DOWN = 15
    MIN_INTERVAL = 10.0  # seconds
    
    def __init__(self):
        self.on_gpu = False
        self.last_switch = 0.0
    
    def should_use_gpu(self, population_size: int, now: float) -> bool:
        if now - self.last_switch < self.MIN_INTERVAL:
            return self.on_gpu  # Too soon to switch
        if self.on_gpu and population_size < self.GPU_DOWN:
            self.on_gpu = False
            self.last_switch = now
        elif not self.on_gpu and population_size >= self.GPU_UP:
            self.on_gpu = True
            self.last_switch = now
        return self.on_gpu
```

**Integration:** Replace the hard `n >= 20` check in NanoPopulation scheduling
with `HysteresisScheduler.should_use_gpu()`. The scheduler state persists across
cycles.

#### S-05 FIX — Deposit Schema Versioning

**Source:** test_15 finding S-05.

**Problem:** Deposit JSON format has no version field. If the schema changes
(e.g., adding new fields to `compress_nano_to_deposit()`), old deposits become
unreadable or silently produce wrong values.

**Fix — DepositMigrator:**

```python
class DepositMigrator:
    """Auto-migrate deposits across schema versions."""
    CURRENT_VERSION = 2
    
    @staticmethod
    def migrate(deposit: dict) -> dict:
        v = deposit.get('schema_version', 1)
        if v < 2:
            # v1 → v2: add 'schema_version', normalize RBY tuple format
            deposit['schema_version'] = 2
            if isinstance(deposit.get('rby'), list):
                deposit['rby'] = tuple(deposit['rby'])
            deposit.setdefault('efficiency_score', 0.0)
            deposit.setdefault('bridge_count', 0)
        return deposit
```

All deposit reads must pass through `DepositMigrator.migrate()` before use.
All deposit writes must include `'schema_version': DepositMigrator.CURRENT_VERSION`.

---

## SESSION 4 ARCHITECTURAL PIVOT (test_16 + test_17)

> **The entire nano definition above is SUPERSEDED.** Nanos are no longer independent
> predictors. They are expert FFN blocks within a shared attention backbone.

### New Nano Definition

A nano is a **specialist feedforward expert** — a single FFN block that processes
tokens routed to it by a learned router. It does NOT perform inference alone.
It does NOT have its own embedding or output head. It exists within the NanoMoE
architecture.

### New Physical Specification

| Property              | Value                          | Notes                                           |
|-----------------------|--------------------------------|-------------------------------------------------|
| **Architecture**      | 2-layer FFN (up-project → down-project) | `d_model → ff_dim → d_model`          |
| **Parameters**        | W1(d_model, ff_dim), b1, W2(ff_dim, d_model), b2 | With GELU activation between layers |
| **Size on disk**      | Determined by d_model × ff_dim | E.g., d_model=64, ff_dim=128 → ~33 KB          |
| **Independence**      | **NONE** — requires shared attention + router | Cannot infer alone                  |
| **Training**          | End-to-end backprop through full NanoMoE stack | NOT evolutionary, NOT isolated      |
| **Batching**          | All experts batched via `torch.bmm` | Parallel expert execution on GPU         |
| **Activation**        | Only on tokens routed by top-k router | Sparse activation, not all-experts      |

### New Nano Implementation

```python
class NanoExpert(nn.Module):
    """A single nano expert — a specialist FFN block."""
    def __init__(self, d_model: int, ff_dim: int):
        super().__init__()
        self.W1 = nn.Parameter(torch.randn(d_model, ff_dim) * 0.02)
        self.b1 = nn.Parameter(torch.zeros(ff_dim))
        self.W2 = nn.Parameter(torch.randn(ff_dim, d_model) * 0.02)
        self.b2 = nn.Parameter(torch.zeros(d_model))
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x shape: (batch, d_model)
        h = F.gelu(x @ self.W1 + self.b1)
        return h @ self.W2 + self.b2
```

### Batched Expert Execution

All experts execute simultaneously via batched matrix multiplication:

```python
# Stack all expert weights: (num_experts, d_model, ff_dim)
W1_all = torch.stack([e.W1 for e in experts])
# Batched forward: (num_experts, tokens_per_expert, ff_dim)
h = F.gelu(torch.bmm(x_routed, W1_all) + b1_all)
output = torch.bmm(h, W2_all) + b2_all
```

### Router Mechanism

A learned linear layer scores each token against each expert. Top-k experts
are selected per token, with softmax-normalized gating weights:

```python
class Router(nn.Module):
    def __init__(self, d_model: int, num_experts: int, top_k: int = 2):
        super().__init__()
        self.gate = nn.Linear(d_model, num_experts, bias=False)
        self.top_k = top_k
    
    def forward(self, x: torch.Tensor):
        scores = self.gate(x)            # (batch, seq, num_experts)
        topk_val, topk_idx = scores.topk(self.top_k, dim=-1)
        weights = F.softmax(topk_val, dim=-1)
        return weights, topk_idx
```

### What Survives From the Old Spec

- **Nano = small** — experts are still tiny (kilobytes each)
- **Specialization** — each expert learns different patterns
- **Population dynamics** — experts can be spawned, pruned, or migrated
- **Deposits** — compressed knowledge from expert pruning still applies

### What Is Dead

- Independent nano inference (nanos CANNOT work alone)
- Feature/Pattern/Bridge/Action type taxonomy (all experts are FFN blocks)
- RBY color encoding per nano (router replaces manual typing)
- Evolutionary training of individual nanos (end-to-end backprop only)
- Static position pooling (shared attention replaces this)
