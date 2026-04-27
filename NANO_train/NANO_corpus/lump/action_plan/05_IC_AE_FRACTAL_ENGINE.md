# 05 — IC-AE Fractal Engine

## Recursive Sandbox Infection System

IC-AE (Infected Crystalized Absolute Existence) is the mechanism by which every 
piece of data or capability in the Nano Sea infects every other piece, creating 
an exponential web of cross-pollinated intelligence.

---

## The Core Concept

When a file/script/data enters C-AE (the active nano sandbox), it doesn't just 
sit there — it becomes a **singularity** that:

1. Gets infected with the current RBY seed
2. Creates its own sub-sandbox (IC-AE)
3. Pulls OTHER files/data into its sub-sandbox
4. Infects those files with ITS capabilities + the RBY seed
5. Each infected file creates ITS own sub-sandbox (IIC-AE)
6. This recurses until compute/storage limits are hit

The result: every script eventually "knows about" every other script. Every 
capability cross-pollinates with every other capability.

---

## Fractal Process Identity: Same Algorithm At Every Level

Per Axiom 4 (Fractal Self-Similarity) and the weirdEGYPT formulation, IC-AE
doesn't just *resemble* the outer cycle — it IS the outer cycle, running at a
smaller scale. Every IC-AE sub-sandbox executes the identical pseudocode:

```
# The Universal Process (runs identically at every fractal level)

state = 0                                # Empty sub-sandbox
self = 1                                 # IC-AE initialized from parent's capability
thought = parent_nano.forward(data)      # "What does this data mean?"
urge = similarity_to_unmet_need(thought) # "What should I do about it?"

test = state + self + thought + urge     # Composite activation
solution = collide(nano_a, nano_b)       # Bridge nano = (test)^(±2)

if solution.quality > threshold:         # expand
    knowledge += 1                       # New bridge registered
    recurse into IIC-AE                  # Next fractal level down
else:                                    # inspand
    time += 1                            # Record what failed, move on
    deposit collision_log entry

stack knowledge as absoleice
repeat as new state value
```

### The Levels

| Level     | "Self"              | "Imagination"                    | "Big Bang"                 | "Compression"              |
|-----------|---------------------|----------------------------------|----------------------------|----------------------------|
| **Sea**   | NanoSea instance    | Deposits from prior cycles       | Expansion from seed        | Absularity + triage        |
| **IC-AE** | A sub-sandbox       | Parent nano's capability         | Bridge spawning            | Depth budget exhausted     |
| **IIC-AE**| Sub-sub-sandbox     | Bridge nano's blended capability | Second-level bridge        | Diminishing returns cap    |
| **Nano**  | Single model        | Weight initialization            | Forward pass = "testing"   | Fitness < threshold → die  |
| **Query** | A single inference  | Shattered query fragments        | Nano activation = "bang"   | Response assembly          |

Each level's output becomes the next level's input — the imagination of the
previous level. A macro-cycle's deposits are the "big bang" of the next cycle.
An IC-AE's collision output is the "big bang" of the IIC-AE level below it.

---

## How It Works In The Nano Sea

In the nano paradigm, IC-AE is not about literal file copying. It's about 
**nano cross-training**:

```
1. Nano A (trained on Python list comprehensions) enters the collision space
2. Nano A's weights + training data are combined with Nano B's (English grammar)
3. A Bridge Nano is trained on the combination → it knows how to explain list comprehensions in English
4. This Bridge Nano enters its own IC-AE:
   - Combines with Nano C (error handling) → Bridge that explains error-handling list comprehensions
   - Combines with Nano D (JSON parsing) → Bridge that generates JSON-aware list comprehensions
   - Each new Bridge creates its own sub-combinations ...
5. Recursion continues until depth limit or compute budget is exhausted
```

---

## The IC-AE Engine

```python
class ICAEEngine:
    """
    The fractal infection engine.
    
    Each "infection" creates a new Bridge Nano that combines two source nanos.
    Infections recurse: each Bridge can infect other nanos.
    Depth is bounded by compute budget and diminishing returns.
    """
    
    def __init__(self, seed: CycleSeed, registry: NanoRegistry):
        self.seed = seed
        self.registry = registry
        # Hard cap at 8: experiment test_04 showed RBY diversity collapses from
        # 0.49 to 0.05 by depth 11, creating monoculture. At depth 8, diversity
        # is still ~0.15 (manageable with increased mutation noise).
        MAX_ICAE_DEPTH = 8
        self.depth_limit = min(seed.depth_limit, MAX_ICAE_DEPTH)
        self.collision_log: List[CollisionRecord] = []
        self.total_infections = 0
    
    def infect(self, new_nanos: List[Nano], depth: int = 0):
        """
        Recursively infect: each new nano collides with existing nanos,
        producing Bridge Nanos that are themselves infected.
        """
        if depth >= self.depth_limit:
            return
        
        spawned_bridges = []
        
        for nano in new_nanos:
            # Find compatible collision partners
            partners = self._find_partners(nano, max_partners=5)
            
            for partner_card, similarity in partners:
                partner = self._load_nano(partner_card.gid)
                
                # Perform the collision
                bridge = self._collide(nano, partner, depth)
                
                if bridge is not None:
                    self.registry.register(bridge.card, bridge.function_embedding)
                    spawned_bridges.append(bridge)
                    self.total_infections += 1
                    
                    # Log the collision
                    self.collision_log.append(CollisionRecord(
                        nano_a=nano.card.gid,
                        nano_b=partner_card.gid,
                        bridge=bridge.card.gid,
                        depth=depth,
                        compatibility=similarity,
                        timestamp=time.time()
                    ))
        
        # Recurse: new bridges infect further
        if spawned_bridges:
            self.infect(spawned_bridges, depth + 1)
    
    def _find_partners(self, nano: Nano, max_partners: int) -> List[Tuple[NanoCard, float]]:
        """
        Find nanos that are different enough to be interesting but close enough
        to be compatible. The sweet spot is 0.3 < similarity < 0.7.
        """
        all_results = self.registry.query(nano.function_embedding, k=max_partners * 3)
        
        partners = []
        for card, similarity in all_results:
            if card.gid == nano.card.gid:
                continue  # Don't collide with self
            if 0.2 < similarity < 0.8:  # Sweet spot
                partners.append((card, similarity))
            if len(partners) >= max_partners:
                break
        
        return partners
    
    def _collide(self, nano_a: Nano, nano_b: Nano, depth: int) -> Optional[Nano]:
        """
        Create a Bridge Nano that combines the capabilities of two nanos.
        
        The bridge is trained on paired data:
        - Input: data that nano_a handles well
        - Label: what nano_b would produce from nano_a's output
        (and vice versa)
        """
        # Generate collision training data
        data_a = self._get_representative_data(nano_a, n=100)
        data_b = self._get_representative_data(nano_b, n=100)
        
        if not data_a or not data_b:
            return None
        
        # Create paired training examples
        pairs = []
        for da, db in zip(data_a, data_b):
            out_a = nano_a.forward(da)
            out_b = nano_b.forward(db)
            pairs.append((
                torch.cat([out_a.detach(), out_b.detach()]),
                torch.cat([out_b.detach(), out_a.detach()])
            ))
        
        # Train the bridge
        bridge = BridgeNano(
            dim_a=nano_a.output_dim,
            dim_b=nano_b.output_dim,
            shared_dim=min(nano_a.output_dim, nano_b.output_dim)
        )
        
        # The bridge's RBY is the average of its parents, shifted by depth
        bridge_rby = (
            np.array([nano_a.card.r, nano_a.card.b, nano_a.card.y]) +
            np.array([nano_b.card.r, nano_b.card.b, nano_b.card.y])
        ) / 2
        # Depth shifts toward Blue (cognition — deeper = more abstract)
        depth_shift = np.array([0, depth * 0.02, 0])
        bridge_rby = bridge_rby + depth_shift
        
        # Depth-adaptive mutation noise: prevents monoculture at deep levels
        # At depth 0: noise_scale = 0.02 (subtle mutation)
        # At depth 4: noise_scale = 0.044 (moderate exploration)
        # At depth 8: noise_scale = 0.068 (aggressive diversification)
        noise_scale = 0.02 * (1 + 0.3 * depth)
        bridge_rby += np.random.normal(0, noise_scale, 3)
        bridge_rby = np.clip(bridge_rby, 1e-9, None)
        
        bridge_rby = bridge_rby / bridge_rby.sum()
        
        bridge.card = NanoCard(
            gid=str(uuid.uuid4()),
            nano_type="bridge",
            specialization=f"{nano_a.card.specialization}+{nano_b.card.specialization}",
            r=bridge_rby[0],
            b=bridge_rby[1],
            y=bridge_rby[2],
            parent_gid=f"{nano_a.card.gid}:{nano_b.card.gid}",
            cycle_born=self.seed.cycle_number,
            generation_depth=depth,
            seed_at_birth=tuple(self.seed.rby),
        )
        
        trainer = NanoTrainer(bridge, pairs)
        metrics = trainer.train(epochs=3, lr=0.01)
        
        if metrics['final_loss'] > 0.5:
            return None  # Bad collision — discard
        
        return bridge
```

---

## Depth Budget & Combinatorial Control

Without limits, IC-AE is combinatorial explosion: N nanos at depth D produces 
O(N^D) bridges. This MUST be bounded.

### Budget Allocation

```python
class ICAEBudget:
    """Controls how much compute/storage IC-AE can consume."""
    
    def __init__(self, total_compute_seconds: float, total_storage_bytes: int):
        self.compute_remaining = total_compute_seconds
        self.storage_remaining = total_storage_bytes
        self.depth_limit = 5  # Hard cap
    
    def can_continue(self, depth: int) -> bool:
        """Should we continue infecting at this depth?"""
        if depth >= self.depth_limit:
            return False
        if self.compute_remaining <= 0:
            return False
        if self.storage_remaining <= 0:
            return False
        
        # Exponential decay: deeper levels get less budget
        depth_factor = 0.5 ** depth
        return random.random() < depth_factor
    
    def consume(self, compute_seconds: float, storage_bytes: int):
        self.compute_remaining -= compute_seconds
        self.storage_remaining -= storage_bytes
    
    @classmethod
    def from_system(cls, storage_path: Path) -> 'ICAEBudget':
        """Create budget from current system resources."""
        stat = shutil.disk_usage(storage_path)
        free_bytes = stat.free
        
        # IC-AE gets 30% of free storage
        ic_storage = int(free_bytes * 0.3)
        
        # Compute budget: 1 hour per expansion layer (adjustable)
        ic_compute = 3600.0
        
        return cls(ic_compute, ic_storage)
```

### Depth Limits By Scale

| System Scale          | Max Depth | Max Bridges/Layer | Total Bridges |
|-----------------------|-----------|-------------------|---------------|
| Laptop (16GB RAM)     | 3         | 100               | ~1,000        |
| Workstation (64GB)    | 5         | 500               | ~10,000       |
| Server (256GB)        | 7         | 2,000             | ~100,000      |
| Cluster (1TB+)        | 10        | 10,000            | ~1,000,000+   |

---

## What IC-AE Produces

After a full IC-AE infection cycle, the nano sea contains:

1. **Original nanos** — unchanged, but now contextually linked
2. **Bridge nanos** — cross-domain connectors at various depths
3. **Collision logs** — complete record of what was tried and what worked
4. **Training data** — every collision generates data for future nano training
5. **Depth-indexed clusters** — shallow bridges (general) vs deep bridges (specific)

The collision logs are critical for compression: they tell the system which 
cross-domain connections were valuable (high similarity, low loss) and which 
were noise (high loss, never activated).

---

## IC-AE and Absularity

IC-AE drives the system TOWARD Absularity:
- Each infection creates new nanos → storage increases
- Deep infections create specialized nanos → diminishing returns
- The system automatically detects diminishing returns via UF/IO equilibrium

When IC-AE at a given depth produces nanos that are all <0.1 fitness improvement 
over their parents, that depth is capped and resources redirect to shallower work.

```python
def should_cap_depth(collision_log: List[CollisionRecord], depth: int) -> bool:
    """Cap this depth level if it's producing diminishing returns."""
    recent = [c for c in collision_log if c.depth == depth]
    if len(recent) < 10:
        return False  # Not enough data
    
    avg_quality = np.mean([c.bridge_fitness for c in recent])
    parent_avg = np.mean([c.parent_fitness for c in recent])
    
    improvement = avg_quality - parent_avg
    return improvement < 0.01  # Less than 1% improvement → cap
```
