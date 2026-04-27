# 03 — Nano Sea Lifecycle

## The Complete Expansion → Compression Cycle

This document specifies exactly what happens during one full cycle of the Nano Sea.

---

## Phase 1: SEED INITIALIZATION

Each cycle begins with a seed. The first cycle uses the primordial seed derived from 
AE=C=1. All subsequent cycles use a seed mutated by deposits from prior cycles.

```python
class CycleSeed:
    """The mathematical seed for an expansion cycle."""
    
    def __init__(self, rby: np.ndarray, cycle_number: int, 
                 deposits: List['Absoleice'], parent_seed_hash: str = ""):
        self.rby = rby                          # [R, B, Y] triplet, sums to 1
        self.cycle_number = cycle_number
        self.deposits = deposits                 # Absoleices from prior cycles
        self.parent_seed_hash = parent_seed_hash
        self.hash = self._compute_hash()
        
        # Derived parameters (seeded by RBY)
        self.spawn_rate = 0.3 + 0.4 * self.rby[2]      # Y-dominance → more spawning
        self.mutation_rate = 0.01 + 0.04 * self.rby[0]  # R-dominance → more variation
        self.depth_limit = max(3, int(10 * self.rby[1])) # B-dominance → deeper thinking
        self.compute_budget_per_nano = 1.0               # Adjusted by deposits
        
        # Apply deposit knowledge to bias parameters
        if deposits:
            avg_quality = np.mean([d.quality_score for d in deposits])
            self.compute_budget_per_nano *= (1.0 + avg_quality)
            self.mutation_rate *= max(0.5, 1.0 - avg_quality)  # less mutation if already good
    
    def _compute_hash(self) -> str:
        content = f"{self.rby.tobytes()}{self.cycle_number}{self.parent_seed_hash}"
        return hashlib.sha256(content.encode()).hexdigest()[:16]
```

---

## Phase 2: EXPANSION (The Big Bang)

From the seed, the system spawns nanos in layers. This is not random — the seed 
determines what gets spawned and in what order.

### Expansion Order

```
Layer 0: Primordial Nanos (always spawned first)
    ├── 3 Feature Nanos (text, code, structured-data perception)
    ├── 2 Pattern Nanos (sequence prediction, pattern matching)
    ├── 2 Action Nanos (text generation, code generation)
    ├── 2 Bridge Nanos (perception↔cognition, cognition↔execution)
    ├── 1 Router Nano (query routing)
    └── 1 Orchestrator Nano (response combination)
    Total: 11 nanos — the minimum viable sea

Layer 1: Data Ingestion Wave
    ├── Scanner reads AE (host files) and chunks them
    ├── Each chunk → PTAIE → RBY encoding → training data
    ├── Feature Nanos are trained on these chunks
    └── Each trained Feature Nano spawns 2-5 children with gradient variation

Layer 2: Pattern Discovery Wave
    ├── Feature Nano outputs become training data for Pattern Nanos
    ├── Pattern Nanos learn sequences and relationships
    ├── IC-AE begins: each trained nano "infects" nearby nanos
    └── Bridge Nanos connect emerging clusters

Layer 3..N: Fractal Deepening
    ├── Each IC-AE creates its own sub-expansion
    ├── Nanos beget nanos (generational spawning)
    ├── Router Nanos update their routing tables
    ├── Orchestrator Nanos learn to combine new clusters
    └── Density increases in frequently-used regions
```

### The Expansion Controller

```python
class ExpansionController:
    """Manages the expansion of the nano sea from a seed."""
    
    def __init__(self, seed: CycleSeed, registry: NanoRegistry, 
                 storage_path: Path, ae_paths: List[Path]):
        self.seed = seed
        self.registry = registry
        self.storage = storage_path
        self.ae_paths = ae_paths          # Read-only AE sources
        self.spawner = NanoSpawner(seed)
        self.icae_engine = ICAEEngine(seed, registry)
        self.absularity_monitor = AbsularityMonitor(storage_path)
        
        self.current_layer = 0
        self.total_spawned = 0
        self.total_destroyed = 0
        self.absoleices_this_cycle: List[MicroAbsoleice] = []
    
    def expand(self):
        """Run the full expansion until Absularity."""
        
        # Layer 0: Primordial
        self._spawn_primordials()
        
        # Layer 1+: Continuous expansion
        while not self.absularity_monitor.reached():
            self.current_layer += 1
            
            # Scan AE for new data
            new_chunks = self._ingest_ae_data()
            
            # Train nanos on new data
            new_nanos = self._train_on_chunks(new_chunks)
            
            # IC-AE fractal infection
            self.icae_engine.infect(new_nanos)
            
            # Spawn children from successful nanos
            self._spawn_children()
            
            # Log micro-absoleices for every action
            self._record_micro_absoleices()
            
            # Apply deposit guidance ("light leaking in")
            self._apply_deposit_bias()
            
            # Update UF/IO and RBY
            self._update_dynamics()
            
            print(f"  Layer {self.current_layer}: "
                  f"{self.registry.population} nanos, "
                  f"{self.absularity_monitor.storage_ratio:.1%} storage")
        
        print(f"[ABSULARITY] Reached at layer {self.current_layer}")
        return self.absoleices_this_cycle
    
    def _spawn_primordials(self):
        """Create the 11 primordial nanos."""
        primordials = [
            self.spawner.spawn("feature", "text_perception"),
            self.spawner.spawn("feature", "code_perception"),
            self.spawner.spawn("feature", "data_perception"),
            self.spawner.spawn("pattern", "sequence_prediction"),
            self.spawner.spawn("pattern", "pattern_matching"),
            self.spawner.spawn("action", "text_generation"),
            self.spawner.spawn("action", "code_generation"),
            self.spawner.spawn("bridge", "perception_cognition"),
            self.spawner.spawn("bridge", "cognition_execution"),
            self.spawner.spawn("router", "query_routing"),
            self.spawner.spawn("orchestrator", "response_combination"),
        ]
        for nano in primordials:
            self.registry.register(nano.card, nano.function_embedding)
            self.total_spawned += 1
    
    def _ingest_ae_data(self) -> List[DataChunk]:
        """Read from AE sources, chunk, and encode via PTAIE."""
        chunks = []
        for ae_path in self.ae_paths:
            for file_path in ae_path.rglob("*"):
                if file_path.is_file() and not self._already_ingested(file_path):
                    file_chunks = self._chunk_file(file_path)
                    for chunk in file_chunks:
                        chunk.rby = ptaie_encode(chunk.data)  # PTAIE → RBY
                        chunks.append(chunk)
        return chunks
    
    def _train_on_chunks(self, chunks: List[DataChunk]) -> List[Nano]:
        """Train new nanos on data chunks."""
        new_nanos = []
        for chunk in chunks:
            # Determine what type of nano this chunk should train
            nano_type = self._classify_chunk(chunk)
            
            # Create and train a nano
            nano = self.spawner.spawn(nano_type, chunk.description)
            trainer = NanoTrainer(nano, [chunk])
            trainer.train(epochs=5, lr=0.001)
            
            # Register it
            self.registry.register(nano.card, nano.function_embedding)
            new_nanos.append(nano)
            self.total_spawned += 1
            
            # Record micro-absoleice
            self.absoleices_this_cycle.append(MicroAbsoleice(
                action="train",
                nano_gid=nano.card.gid,
                metrics=trainer.metrics,
                rby=nano.card.rby_tuple,
                timestamp=time.time()
            ))
        
        return new_nanos
    
    def _spawn_children(self):
        """High-fitness nanos reproduce."""
        candidates = sorted(
            self.registry.cards.values(), 
            key=lambda c: c.fitness, 
            reverse=True
        )[:int(self.registry.population * 0.1)]  # Top 10% reproduce
        
        for parent_card in candidates:
            if random.random() < self.seed.spawn_rate:
                # Spawn with gradient variation
                child = self.spawner.spawn_child(
                    parent_card, 
                    mutation_rate=self.seed.mutation_rate
                )
                self.registry.register(child.card, child.function_embedding)
                self.total_spawned += 1
    
    def _apply_deposit_bias(self):
        """Apply "light" from prior cycle deposits to guide current nanos."""
        if not self.seed.deposits:
            return
        
        for deposit in self.seed.deposits:
            # Find nanos in similar RBY regions to the deposit
            nearby = self.registry.query(
                deposit.centroid_embedding, 
                k=10
            )
            for card, distance in nearby:
                # Bias their weights slightly toward the deposit's learned direction
                nano = self._load_nano(card.gid)
                nano.apply_deposit_bias(deposit, strength=CONSCIOUSNESS_COUPLING)
                self._save_nano(nano)
```

---

## Phase 3: INTERACTION (The Universe Lives)

During expansion, nanos interact continuously:

### 3a. Nano-to-Nano Collision

When two nanos are in similar RBY space, they "collide" — their outputs are combined 
and the result becomes training data for a new Bridge Nano.

```python
class NanoCollision:
    """A collision between two nanos produces learning data."""
    
    def collide(self, nano_a: Nano, nano_b: Nano, test_input: torch.Tensor) -> CollisionResult:
        output_a = nano_a.forward(test_input)
        output_b = nano_b.forward(test_input)
        
        # Measure compatibility
        agreement = F.cosine_similarity(output_a.flatten(), output_b.flatten(), dim=0)
        
        # If they agree → reinforce both
        # If they disagree → create training data for a Bridge Nano
        # If one errors → create training data for a replacement
        
        result = CollisionResult(
            nano_a_gid=nano_a.card.gid,
            nano_b_gid=nano_b.card.gid,
            agreement=agreement.item(),
            combined_output=(output_a + output_b) / 2,
            divergence=torch.abs(output_a - output_b).mean().item()
        )
        
        if result.divergence > 0.3:
            # Significant disagreement → spawn gradient nanos between them
            self._spawn_gradient_nanos(nano_a, nano_b, n=3)
        
        return result
```

### 3b. User Interaction (Throwing the Stone)

When a user submits a query, it "shatters" into the nano sea:

```
1. Query text → tokenize → PTAIE encode → RBY coordinate
2. RBY coordinate → Router Nano → activation list
3. Activation list → parallel nano inference
4. Nano outputs → Orchestrator Nano → coherent response
5. Response + feedback → log → training data for new nanos
```

### 3c. Continuous Training

The system never stops training. Every interaction, every collision, every log entry 
becomes training data:

```python
class ContinuousTrainer:
    """Background thread that trains new nanos from accumulated data."""
    
    def __init__(self, data_buffer: Queue, spawner: NanoSpawner, registry: NanoRegistry):
        self.buffer = data_buffer
        self.spawner = spawner
        self.registry = registry
    
    def train_loop(self):
        while True:
            batch = self.buffer.get_batch(size=32, timeout=5.0)
            if batch is None:
                continue
            
            # Cluster the batch by RBY similarity
            clusters = self._cluster_by_rby(batch)
            
            for cluster in clusters:
                # Is there already a good nano for this cluster?
                existing = self.registry.query(cluster.centroid, k=1)
                
                if not existing or existing[0][1] < 0.7:  # No good match
                    # Train a new nano
                    nano = self.spawner.spawn_from_data(cluster.data)
                    self.registry.register(nano.card, nano.function_embedding)
                else:
                    # Fine-tune existing nano with new data
                    card, _ = existing[0]
                    nano = self._load_nano(card.gid)
                    self._fine_tune(nano, cluster.data)
                    self._save_nano(nano)
```

---

## Phase 4: SATURATION → COMPRESSION

When Absularity is reached (storage >= 85%, or UF≈IO equilibrium), compression begins.
See [07_ABSULARITY_AND_COMPRESSION.md](07_ABSULARITY_AND_COMPRESSION.md) for full details.

Short version:
1. Score every nano by fitness
2. Keep the top 5-15%
3. Compress the rest into absoleices (micro and macro)
4. Destroy the compressed nanos
5. Deposit absoleices to AE-side storage
6. Mutate the seed using deposit metrics
7. Begin next cycle

---

## Phase 5: DEPOSIT → SEED MUTATION → NEXT CYCLE

The deposits from compression become the "light" for the next cycle.

```python
class CycleTransition:
    """Transition between compression and next expansion."""
    
    def transition(self, current_seed: CycleSeed, deposits: List[Absoleice],
                   surviving_nanos: List[NanoCard]) -> CycleSeed:
        
        # Compute aggregate quality from deposits
        total_quality = sum(d.quality_score for d in deposits)
        avg_quality = total_quality / len(deposits) if deposits else 0
        
        # Compute success/error ratios from surviving nanos
        total_success = sum(n.success_count for n in surviving_nanos)
        total_failure = sum(n.failure_count for n in surviving_nanos)
        total = total_success + total_failure
        s = total_success / total if total > 0 else 0.5
        e = total_failure / total if total > 0 else 0.5
        c = len(surviving_nanos) / 1000  # complexity proxy
        
        # Compute UF and IO
        UF, IO = compute_uf_io(s, e, c)
        
        # Update RBY
        new_rby = update_rby(current_seed.rby, UF, IO, s, e)
        
        # Create next cycle seed
        next_seed = CycleSeed(
            rby=new_rby,
            cycle_number=current_seed.cycle_number + 1,
            deposits=deposits,
            parent_seed_hash=current_seed.hash
        )
        
        return next_seed
```

---

## Phase 5.5: NANO MATURATION — The T_B Threshold

Each nano born after Cycle 0 is wrapped in the WEA dual-network architecture (see
02_NANO_ANATOMY.md). During its lifecycle, every nano transitions through a
**maturation threshold T_B** — the point where personal experience outweighs
ancestral deposit knowledge.

### The Maturation Curve

```
Ancestral Weight ─────────────────────────────────────
                   \                                  (decays as fraction of total)
Output Blend        \        ────── T_B ──────
                     \      /
Personal Weight       ────/──────────────────────────
                         /
                        / (compounds with (1+r)^t)
                       /
───────────────────────────────────────────────────── time (training steps)
```

```python
def compute_nano_maturity(nano: WEANano) -> dict:
    """
    Report a nano's maturation status.
    
    Returns metrics useful for cycle management:
    - Before T_B: nano is deposit-guided (conservative, stable)
    - At T_B: inflection point (nano behavior changes character)
    - After T_B: nano is experience-guided (specialized, adaptive)
    """
    return {
        "t": nano.t,
        "T_B": nano.T_B,
        "is_mature": nano.is_mature,
        "ancestral_ratio": nano.ancestral_ratio,
        "personal_ratio": 1.0 - nano.ancestral_ratio,
        "maturity_progress": min(1.0, nano.t / nano.T_B) if nano.T_B > 0 else 1.0,
    }
```

### Why T_B Matters for Lifecycle Management

1. **Compression triage**: Immature nanos (t < T_B) that perform well are likely 
   succeeding because of their ancestral backbone — their deposits are good. Mature 
   nanos (t > T_B) that perform well have genuinely learned something new. **Mature 
   high-fitness nanos are the most valuable deposits when compressed**, because their 
   personal weights contain novel knowledge not already in the deposit chain.

2. **IC-AE collision priority**: Mature nanos make better collision partners because
   their personal networks contain unique learned features. Immature nanos are mostly
   echoing their deposits — colliding two immature nanos is like colliding the same
   deposit with itself.

3. **Efficiency ratchet calibration**: The ratchet should measure whether the SAME
   work can be done with fewer nanos. But nanos before T_B are doing "deposit work"
   (cheap) while nanos after T_B are doing "novel work" (expensive). The ratchet
   should weight mature nanos more heavily in its efficiency accounting.

4. **Critical periods close at T_B**: Analogous to biological critical periods, a
   nano's architecture is most plastic before T_B. After T_B, the compounding
   personal weight makes the nano increasingly resistant to large behavioral shifts.
   This is a FEATURE — it prevents catastrophic forgetting of specialized knowledge.

---

## The Efficiency Ratchet: Why Each Cycle Needs Fewer Nanos

This is the core claim: each cycle achieves MORE with LESS.

**Mechanism 1: Deposit-Guided Spawning**
Prior deposits tell the next cycle's spawner WHERE to focus. Instead of spawning 
uniformly across all of RBY space, it spawns densely in high-value regions and 
sparsely in already-understood regions.

**Mechanism 2: Pre-Trained Foundations**
Surviving nanos from the previous cycle carry forward. New nanos can be initialized 
from survivors' weights instead of from scratch. Transfer learning at nano scale.

**Mechanism 3: Compressed Knowledge as Bias**
The "light that leaks in" — deposits create a bias field that nudges all new nanos 
toward known-good solutions. Early in a new expansion, this bias is strong (nanos 
quickly converge). As the cycle matures, the bias weakens and exploration takes over.

**Mechanism 4: Lineage Pruning**
Dead-end lineages are recorded in deposits. The next cycle's spawner avoids 
re-exploring approaches that failed in prior cycles.

**Quantitative Target**: Cycle N+1 should achieve the same task accuracy as Cycle N 
with ≤80% of the nanos. This compounds: by Cycle 10, the system operates at ~10% of 
Cycle 1's nano count for the same task quality. The freed capacity goes to NEW capabilities.
