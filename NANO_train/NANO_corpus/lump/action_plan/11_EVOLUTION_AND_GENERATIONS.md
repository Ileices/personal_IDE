# 11 — Evolution and Generations

## Reproduction, Mutation, Fitness Pressure, and the Efficiency Ratchet

---

## Core Principle

> Nanos are not preserved because they are old. They are preserved because they are **useful**.
> The sea does not age — it **sharpens**. Each cycle requires **fewer nanos** to achieve
> what previously required more. The deposits from the dead become the wisdom of the living.

---

## Generational Model

```
Cycle 0 (Primordial):  SEED → [Nano₁, Nano₂, ... Nano_k]    (generation depth 0)
                                    ↓ IC-AE collisions
                               [Bridge_a, Bridge_b, ...]      (generation depth 1)
                                    ↓ further collisions
                               [Bridge_c, ...]                 (generation depth 2)
                                    ...
Absularity →  COMPRESS
              ├── Top 10%: SURVIVE to Cycle 1
              ├── Mid 70%: DEPOSIT extracted, nano destroyed
              └── Bot 20%: DESTROYED (no deposit)

Cycle 1:      MUTATED_SEED → [Nano₁', Nano₂', ... Nano_m]    (m < k if ratchet holds)
              + surviving nanos from Cycle 0
              + deposits guide new nano initialization
```

Every nano tracks its `generation_depth` — how many collision/spawn steps separate it
from a primordial (seed-spawned) nano.

---

## Fitness Function

Fitness is **not** a single number. It's a composite:

```python
@dataclass
class NanoFitness:
    """Multi-dimensional fitness assessment."""
    usage_count: int        # How often activated
    success_rate: float     # success_count / usage_count
    uniqueness: float       # How different from nearest neighbors (0-1)
    bridge_count: int       # How many bridges spawned from this nano
    deposit_value: float    # Estimated value of this nano's knowledge if compressed

    @property
    def composite(self) -> float:
        """
        Weighted composite fitness.
        Success rate is king, but uniqueness prevents monoculture.
        """
        if self.usage_count == 0:
            return 0.25  # Untested nanos get benefit of the doubt but not much

        w_success    = 0.40
        w_usage      = 0.20
        w_uniqueness = 0.25
        w_bridges    = 0.15

        # Normalize usage to 0-1 via sigmoid
        usage_score = 1.0 / (1.0 + math.exp(-0.1 * (self.usage_count - 10)))

        return (
            w_success    * self.success_rate
            + w_usage    * usage_score
            + w_uniqueness * self.uniqueness
            + w_bridges  * min(1.0, self.bridge_count / 5.0)
        )
```

### Uniqueness Score

Prevents the sea from converging to a monoculture of identical nanos:

```python
def compute_uniqueness(card: NanoCard, registry: NanoRegistry, k: int = 5) -> float:
    """
    How different is this nano from its k nearest neighbors?
    High uniqueness = covers territory no other nano covers.
    
    FIXED: Uses the registry's rby_grid spatial index instead of FAISS.
    The FAISS index uses 256-dim function embeddings, but uniqueness is about
    RBY-space coverage (3-dim). Querying a 256-dim index with a 3-dim vector
    would crash or produce garbage results.
    """
    # Get this nano's RBY grid cell and neighboring cells
    r_idx, b_idx, y_idx = int(card.rby.r * 10), int(card.rby.b * 10), int(card.rby.y * 10)
    
    # Collect neighbors from this cell and adjacent cells
    neighbors = []
    for dr in [-1, 0, 1]:
        for db in [-1, 0, 1]:
            for dy in [-1, 0, 1]:
                key = (min(9, max(0, r_idx + dr)), 
                       min(9, max(0, b_idx + db)), 
                       min(9, max(0, y_idx + dy)))
                for gid in registry.rby_grid.get(key, set()):
                    if gid != card.gid:
                        other = registry.cards.get(gid)
                        if other:
                            dist = card.rby.distance(other.rby)
                            neighbors.append(dist)
    
    if not neighbors:
        return 1.0  # Completely unique
    
    # Take k nearest
    neighbors.sort()
    nearest = neighbors[:k]
    avg_dist = sum(nearest) / len(nearest)
    
    # Normalize: distance of ~0.5 in RBY space = very different
    return min(1.0, avg_dist / 0.5)
```

---

## Generation Depth and Survival Curves

Deep-generation nanos (born from many layers of IC-AE collisions) become
increasingly specialized but fragile. Survival probability follows a decay curve:

```python
def generation_survival_modifier(depth: int) -> float:
    """
    Nanos at depth 0 (primordials) have no penalty.
    Nanos at depth 5 have ~60% of base survival chance.
    Nanos at depth 8 have ~30%.
    
    HARD CAP at depth 8: experiment test_04 showed RBY diversity collapses
    to monoculture beyond this depth. Nanos at depth 9+ are automatically
    assigned 0 survival (they MUST be compressed or destroyed).
    """
    MAX_DEPTH = 8
    if depth > MAX_DEPTH:
        return 0.0  # Hard cap: no survival beyond depth 8
    return math.exp(-0.12 * depth)
```

This creates a natural depth limit with a hard cap at depth 8. Nanos at depth 9+
get a survival modifier of 0.0 — they are automatically triaged into compress or
destroy. This prevents the monoculture problem (test_04 showed RBY diversity
collapses to 0.05 at depth 11). At depth 8, a nano needs ~2.6× the composite
fitness of a depth-0 nano to have the same survival probability.

```
Depth:     0     1     2     3     4     5     6     7     8     9+
Modifier: 1.00  0.89  0.79  0.70  0.62  0.55  0.49  0.43  0.38  0.00 (HARD CAP)
```

---

## Reproduction Mechanisms

Nanos don't reproduce sexually. They reproduce through **collision and infection** (IC-AE):

### 1. Bridge Spawning (Primary Reproduction)

When two nanos collide in IC-AE with compatibility in the sweet spot (0.2–0.8),
a BridgeNano child is spawned:

```python
def spawn_bridge_child(
    parent_a: NanoCard,
    parent_b: NanoCard,
    cycle: int,
    models_dir: str,
) -> Tuple[nn.Module, NanoCard]:
    """
    A bridge child inherits blended RBY from both parents.
    Its generation depth is max(parent_depths) + 1.
    """
    blend_r = (parent_a.rby.r + parent_b.rby.r) / 2.0
    blend_b = (parent_a.rby.b + parent_b.rby.b) / 2.0
    blend_y = (parent_a.rby.y + parent_b.rby.y) / 2.0

    # Add mutation noise — DEPTH-ADAPTIVE to prevent monoculture
    # Deeper bridges get more noise to maintain RBY diversity
    # (test_04 showed diversity collapses from 0.49 to 0.05 without this)
    noise_scale = 0.02 * (1 + 0.3 * child_depth)
    noise = np.random.normal(0, noise_scale, 3)
    child_rby = RBY(blend_r + noise[0], blend_b + noise[1], blend_y + noise[2])

    child_depth = max(parent_a.generation_depth, parent_b.generation_depth) + 1

    model, card = spawn_nano(
        "bridge", child_rby,
        specialization=f"bridge_{parent_a.specialization}×{parent_b.specialization}",
        cycle=cycle,
        parent_gid=parent_a.gid,  # Primary parent
        generation_depth=child_depth,
        models_dir=models_dir,
    )
    return model, card
```

### 2. Deposit-Guided Spawning (Rebirth)

When a new cycle expands, deposits from the dead guide how new nanos are initialized:

```python
def spawn_from_deposit(
    deposit: Dict,
    cycle: int,
    models_dir: str,
) -> Tuple[nn.Module, NanoCard]:
    """
    A new nano whose weights are initialized based on a deposit's statistics.
    Not a clone — a spiritual successor.
    """
    nano_type = deposit["nano_type"]
    rby = RBY(*deposit["rby"])

    model, card = spawn_nano(
        nano_type, rby,
        specialization=f"reborn_{deposit['specialization']}",
        cycle=cycle,
        parent_gid=deposit["source_gid"],
        generation_depth=0,  # Resets depth — this is a new life
        models_dir=models_dir,
    )

    # Initialize weights from deposit statistics (mean ± std)
    with torch.no_grad():
        for name, param in model.named_parameters():
            if name in deposit.get("weight_stats", {}):
                stats = deposit["weight_stats"][name]
                param.normal_(mean=stats["mean"], std=max(stats["std"], 0.01))

    # Re-save with guided weights
    torch.save(model.state_dict(), card.model_path)
    return model, card
```

### 3. Specialization Splitting

When a nano becomes extraordinarily fit (fitness > 0.9) and is handling diverse
query types, it can split into two more specialized children:

```python
def split_nano(
    parent_model: nn.Module,
    parent_card: NanoCard,
    cycle: int,
    models_dir: str,
) -> List[Tuple[nn.Module, NanoCard]]:
    """
    High-fitness nano splits into two children with shifted RBY.
    One inherits more Red (perception focus), one more Yellow (execution focus).
    The parent continues to exist (doesn't die from splitting).
    """
    children = []

    # Red-shifted child
    red_rby = RBY(parent_card.rby.r + 0.1, parent_card.rby.b, parent_card.rby.y - 0.05)
    model_r, card_r = spawn_nano(
        parent_card.nano_type, red_rby,
        specialization=f"{parent_card.specialization}_red_split",
        cycle=cycle,
        parent_gid=parent_card.gid,
        generation_depth=parent_card.generation_depth + 1,
        models_dir=models_dir,
    )
    # Inherit parent weights with noise
    model_r.load_state_dict(parent_model.state_dict())
    with torch.no_grad():
        for p in model_r.parameters():
            p.add_(torch.randn_like(p) * 0.01)
    torch.save(model_r.state_dict(), card_r.model_path)
    children.append((model_r, card_r))

    # Yellow-shifted child
    yellow_rby = RBY(parent_card.rby.r - 0.05, parent_card.rby.b, parent_card.rby.y + 0.1)
    model_y, card_y = spawn_nano(
        parent_card.nano_type, yellow_rby,
        specialization=f"{parent_card.specialization}_yellow_split",
        cycle=cycle,
        parent_gid=parent_card.gid,
        generation_depth=parent_card.generation_depth + 1,
        models_dir=models_dir,
    )
    model_y.load_state_dict(parent_model.state_dict())
    with torch.no_grad():
        for p in model_y.parameters():
            p.add_(torch.randn_like(p) * 0.01)
    torch.save(model_y.state_dict(), card_y.model_path)
    children.append((model_y, card_y))

    return children
```

---

## The Efficiency Ratchet

The most important evolutionary pressure: **each cycle must do the same work with
fewer nanos than the last**.

```python
class EfficiencyRatchet:
    """
    Tracks the ratio of (work done) / (nanos used) across cycles.
    If Cycle N used 100 nanos to process 500 queries at 70% accuracy,
    Cycle N+1 must achieve ≥70% accuracy on similar queries with ≤80 nanos.
    """

    def __init__(self, target_ratio: float = 0.80):
        self.target_ratio = target_ratio  # Must do same with 80% of prior nanos
        self.history: List[Dict] = []

    def record_cycle(self, cycle: int, nano_count: int, queries: int,
                     accuracy: float, total_compute: float):
        self.history.append({
            "cycle": cycle,
            "nano_count": nano_count,
            "queries": queries,
            "accuracy": accuracy,
            "total_compute": total_compute,
            "efficiency": accuracy / max(nano_count, 1) * 1000,  # Accuracy per 1000 nanos
        })

    def get_nano_budget(self) -> Optional[int]:
        """How many nanos should the next cycle be allowed?"""
        if not self.history:
            return None  # No constraint for first cycle
        last = self.history[-1]
        return int(last["nano_count"] * self.target_ratio)

    def is_improving(self) -> bool:
        """Is efficiency improving across cycles?"""
        if len(self.history) < 2:
            return True
        return self.history[-1]["efficiency"] >= self.history[-2]["efficiency"] * 0.95

    def report(self) -> str:
        lines = ["Efficiency Ratchet Report:"]
        for h in self.history:
            lines.append(
                f"  Cycle {h['cycle']}: {h['nano_count']} nanos, "
                f"{h['accuracy']:.1%} accuracy, "
                f"efficiency={h['efficiency']:.2f}"
            )
        if len(self.history) >= 2:
            improvement = (
                (self.history[-1]["efficiency"] - self.history[0]["efficiency"])
                / max(self.history[0]["efficiency"], 1e-9) * 100
            )
            lines.append(f"  Overall improvement: {improvement:+.1f}%")
        return "\n".join(lines)
```

### Why This Works

The deposits are the key. When a cycle compresses:
- **High-fitness nanos' weight statistics** are preserved as deposits
- Next cycle, new nanos can be **initialized near the deposit's weight distribution**
- This means new nanos start closer to good solutions → fewer nanos needed to cover the same territory
- Over time, the deposit layer accumulates statistical knowledge about what works
- The sea doesn't need to rediscover solutions — it **remembers through its deposits**

```
Cycle 0:  100 nanos, 60% accuracy,  efficiency = 6.0
Cycle 1:   80 nanos, 65% accuracy,  efficiency = 8.1   (+35%)
Cycle 2:   64 nanos, 68% accuracy,  efficiency = 10.6  (+31%)
Cycle 3:   51 nanos, 72% accuracy,  efficiency = 14.1  (+33%)
Cycle 4:   41 nanos, 75% accuracy,  efficiency = 18.3  (+30%)
...
```

---

## SwarmEvolution Class

```python
class SwarmEvolution:
    """
    Manages the evolutionary dynamics across cycles.
    Combines fitness assessment, triage, reproduction, and efficiency tracking.
    """

    def __init__(self, config: Dict = None):
        self.config = config or {}
        self.ratchet = EfficiencyRatchet(
            target_ratio=self.config.get("efficiency_target", 0.80)
        )
        self.lineage_tree: Dict[str, List[str]] = {}  # parent_gid → [child_gids]
        self.extinction_events: List[Dict] = []

    def assess_population(
        self,
        nanos: Dict[str, Tuple[nn.Module, NanoCard]],
        registry: "NanoRegistry",
    ) -> Dict[str, NanoFitness]:
        """Compute fitness for every nano in the population."""
        fitness_map = {}
        for gid, (model, card) in nanos.items():
            fitness = NanoFitness(
                usage_count=card.usage_count,
                success_rate=card.fitness,
                uniqueness=compute_uniqueness(card, registry),
                bridge_count=len(self.lineage_tree.get(gid, [])),
                deposit_value=estimate_deposit_value(model, card),
            )
            fitness_map[gid] = fitness
        return fitness_map

    def select_for_compression(
        self,
        fitness_map: Dict[str, NanoFitness],
        nanos: Dict[str, Tuple[nn.Module, NanoCard]],
    ) -> Tuple[List[str], List[str], List[str]]:
        """
        Triage with generation depth modifier.
        Returns (survive, compress, destroy) GID lists.
        """
        scored = []
        for gid, fitness in fitness_map.items():
            _, card = nanos[gid]
            modifier = generation_survival_modifier(card.generation_depth)
            effective_fitness = fitness.composite * modifier
            scored.append((gid, effective_fitness))

        scored.sort(key=lambda x: x[1], reverse=True)
        n = len(scored)
        n_survive = max(1, int(n * SURVIVE_RATIO))
        n_compress = int(n * COMPRESS_RATIO)

        survive  = [gid for gid, _ in scored[:n_survive]]
        compress = [gid for gid, _ in scored[n_survive:n_survive + n_compress]]
        destroy  = [gid for gid, _ in scored[n_survive + n_compress:]]
        return survive, compress, destroy

    def track_lineage(self, parent_gid: str, child_gid: str):
        """Record parent→child relationship."""
        if parent_gid not in self.lineage_tree:
            self.lineage_tree[parent_gid] = []
        self.lineage_tree[parent_gid].append(child_gid)

    def detect_stagnation(self, window: int = 5) -> bool:
        """
        Has the sea stopped improving?
        True if efficiency hasn't increased over the last `window` cycles.
        """
        if len(self.ratchet.history) < window:
            return False
        recent = self.ratchet.history[-window:]
        return recent[-1]["efficiency"] <= recent[0]["efficiency"] * 1.05

    def trigger_extinction_event(self, nanos: Dict, reason: str) -> Dict:
        """
        When stagnation is detected, kill 50% of nanos randomly
        (regardless of fitness) to create space for innovation.
        Like a mass extinction in nature.
        """
        gids = list(nanos.keys())
        np.random.shuffle(gids)
        kill_count = len(gids) // 2
        killed = gids[:kill_count]

        event = {
            "reason": reason,
            "killed_count": kill_count,
            "timestamp": time.time(),
        }
        self.extinction_events.append(event)
        log.warning(f"EXTINCTION EVENT: {reason} — killing {kill_count} nanos")
        return event


def estimate_deposit_value(model: nn.Module, card: NanoCard) -> float:
    """Estimate how valuable this nano's deposit would be if it were compressed."""
    # More parameters = more information to deposit
    param_score = min(1.0, card.param_count / 10000)
    # Higher fitness = better weight distributions to preserve
    fitness_score = card.fitness
    # More usage = more refined weights
    usage_score = min(1.0, card.usage_count / 50)
    return (param_score + fitness_score + usage_score) / 3.0
```

---

## Anti-Patterns the Evolution System Prevents

| Anti-Pattern          | Prevention Mechanism                                      |
|----------------------|-----------------------------------------------------------|
| Monoculture          | Uniqueness score in fitness (25% weight)                  |
| Infinite depth       | Generation survival modifier (exponential decay)          |
| Hoarding (nanos survive forever) | Every nano faces triage every cycle       |
| Stagnation           | Extinction events after 5 cycles without improvement      |
| Bloat (too many nanos) | Efficiency ratchet caps population at 80% of prior     |
| Catastrophic forgetting | Deposits preserve weight statistics across cycles      |
| Free riders           | Fitness requires actual usage (unused nanos score low)   |
| **IC-AE mode collapse** | **DiversityMonitor (Session 3 patch below)**          |
| **Efficiency ratchet death spiral** | **Floor/ceiling/stall-reset (Session 3, see 06_RBY_SEED_AND_PTAIE.md)** |

---

## Session 3 Patch — [DATE: 2025-07-XX]

### Experimental Findings: S-02 — DiversityMonitor for IC-AE Mode Collapse

**Source:** test_15 finding S-02. Cross-ref: [05_IC_AE_FRACTAL_ENGINE.md](05_IC_AE_FRACTAL_ENGINE.md).

**Problem — IC-AE Infection Causes Mode Collapse:**

The IC-AE fractal engine (see 05_IC_AE_FRACTAL_ENGINE.md) creates bridge nanos
by colliding existing nanos. Each bridge inherits a BLENDED RBY from both parents.
Over multiple infection rounds, this blending acts as an averaging filter:

```
Round 0:  Nanos have diverse RBY spread across the simplex
Round 5:  Bridges cluster toward the centroid
Round 10: Most bridges within 0.1 radius of mean RBY
Round 15: Diversity dropping fast (cosine distance < 0.1)
Round 20: Diversity = 0.07 — effective MONOCULTURE
```

Test_15 measured this directly: **IC-AE infection reduces population diversity
from 1.0 to 0.07 in just 20 rounds.** The uniqueness score in the fitness
function (25% weight) is insufficient to prevent this because:
- Uniqueness only affects triage (who survives compression)
- IC-AE runs DURING expansion, creating dozens of homogeneous bridges
  BEFORE triage can cull them
- By the time triage runs, the damage (wasted compute on identical bridges) is done

**Fix — DiversityMonitor:**

```python
import torch.nn.functional as F

class DiversityMonitor:
    """
    Monitors RBY diversity during IC-AE infection rounds and injects
    noise when diversity drops below threshold.
    
    Metric: Mean pairwise cosine distance of RBY vectors across population.
    Threshold: diversity < 0.05 triggers noise injection.
    
    Test_15 result: Without monitor, diversity → 0.07 in 20 rounds.
    With monitor + noise injection, diversity stabilizes at ~0.25.
    """
    
    DIVERSITY_FLOOR = 0.05   # Below this, inject noise
    NOISE_SCALE = 0.15       # Scale of RBY noise injection
    
    def __init__(self):
        self.diversity_history = []
    
    def measure_diversity(self, nanos: dict) -> float:
        """Mean pairwise cosine distance of RBY vectors."""
        rbys = []
        for gid, (model, card) in nanos.items():
            rbys.append(torch.tensor([card.rby.r, card.rby.b, card.rby.y]))
        if len(rbys) < 2:
            return 1.0
        
        rby_matrix = torch.stack(rbys)
        rby_norm = F.normalize(rby_matrix, dim=1)
        cosine_sim = torch.mm(rby_norm, rby_norm.t())
        # Mean of upper triangle (excluding diagonal)
        n = len(rbys)
        mask = torch.triu(torch.ones(n, n, dtype=torch.bool), diagonal=1)
        mean_distance = 1.0 - cosine_sim[mask].mean().item()
        
        self.diversity_history.append(mean_distance)
        return mean_distance
    
    def should_inject_noise(self) -> bool:
        if not self.diversity_history:
            return False
        return self.diversity_history[-1] < self.DIVERSITY_FLOOR
    
    def inject_noise(self, rby) -> 'RBY':
        """Add random noise to an RBY triplet to increase diversity."""
        import numpy as np
        noise = np.random.normal(0, self.NOISE_SCALE, 3)
        new_r = max(0.01, rby.r + noise[0])
        new_b = max(0.01, rby.b + noise[1])
        new_y = max(0.01, rby.y + noise[2])
        total = new_r + new_b + new_y
        return RBY(new_r / total, new_b / total, new_y / total)
```

**Integration with IC-AE Engine:**

```python
# In ICAEEngine.infect(), after each depth level:
diversity = self.diversity_monitor.measure_diversity(current_population)
if self.diversity_monitor.should_inject_noise():
    for bridge in spawned_bridges:
        bridge.card.rby = self.diversity_monitor.inject_noise(bridge.card.rby)
    log.warning(f"IC-AE depth {depth}: diversity={diversity:.3f} < 0.05, "
                f"injecting noise into {len(spawned_bridges)} bridges")
```

**Remaining risk:** Even with noise injection, diversity only stabilizes at ~0.25
(not the original 1.0). Further mitigation options:
- Increase `NOISE_SCALE` (risks creating non-viable bridges)
- Reduce IC-AE `max_depth` (already capped at 8)
- Add diversity as a HARD CONSTRAINT in bridge spawning (reject bridges that
  reduce population diversity below a threshold)

### Updated Anti-Pattern Table

The anti-pattern table above has been extended with two new entries for IC-AE
mode collapse and efficiency ratchet death spiral.
