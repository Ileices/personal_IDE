# 04 — Deposit System

## How Compressed Intelligence Persists and Guides Future Cycles

Deposits are the "light and electricity" of the Nano Sea. They exist outside the 
active nano population and leak coherence into each new expansion.

---

## What Is A Deposit?

A deposit is NOT a nano. A deposit is a compressed mathematical artifact that 
encodes what a population of nanos learned during one cycle. It contains:

1. **Aggregated fitness landscape** — where in RBY space were the best nanos?
2. **Compressed weight statistics** — means and variances of successful nano weights
3. **Success/failure maps** — which approaches worked, which didn't
4. **Lineage records** — which spawning strategies produced the best offspring
5. **Absoleice glyphs** — RBY-color-encoded visual fingerprints (lossy summary, not reversible)

---

## Two Scales of Deposit

### Micro-Absoleice (Process-Level)

Emitted at every significant action during an expansion:

```python
@dataclass
class MicroAbsoleice:
    """The smallest unit of memory. One per action."""
    
    gid: str = field(default_factory=lambda: str(uuid.uuid4()))
    
    # What happened
    action: str              # "train", "infer", "collide", "spawn", "prune", "error"
    nano_gid: str            # Which nano performed/was-affected-by this action
    
    # Measurements
    metrics: Dict[str, float]  # {loss, accuracy, latency_ms, confidence, ...}
    success: bool              # True = success, False = failure
    benign: bool               # True = no-op/neutral result
    
    # RBY state at time of action
    rby: Tuple[float, float, float]
    
    # Lineage
    parent_icae: Optional[str]  # Which IC-AE context this occurred in
    infection_depth: int = 0    # How deep in the fractal
    
    # Timing
    timestamp: float = field(default_factory=time.time)
    
    # Artifact pointers
    input_hash: str = ""        # SHA256 of the input data
    output_hash: str = ""       # SHA256 of the output data
    
    def to_color(self) -> Tuple[int, int, int]:
        """Compress this absoleice to an RGB pixel."""
        r = int(self.rby[0] * 255)
        g = int(self.rby[2] * 255)  # Y maps to Green channel
        b = int(self.rby[1] * 255)
        # Modulate by success/failure
        if self.success:
            return (r, g, min(255, b + 30))    # blue boost for success
        elif not self.benign:
            return (min(255, r + 30), g, b)    # red boost for failure
        return (r, g, b)
```

### Macro-Absoleice (Cycle-Level)

Produced when an IC-AE or the full C-AE compresses:

```python
@dataclass 
class MacroAbsoleice:
    """Compressed knowledge from a full compression event."""
    
    gid: str = field(default_factory=lambda: str(uuid.uuid4()))
    cycle_number: int = 0
    compression_level: str = "icae"  # "icae" or "cae" (full cycle)
    
    # The compressed population statistics
    population_size_before: int = 0
    population_size_after: int = 0
    
    # RBY landscape: where were the good nanos?
    fitness_heatmap: np.ndarray = field(default=None)  # [10, 10, 10] discretized RBY grid
    # Each cell = average fitness of nanos in that RBY region
    
    # Weight statistics for top nanos (for initializing future nanos)
    weight_means: Dict[str, np.ndarray] = field(default_factory=dict)
    weight_stds: Dict[str, np.ndarray] = field(default_factory=dict)
    # Keyed by nano_type + architecture_hash
    
    # Anti-patterns: what NOT to do
    failed_lineages: List[str] = field(default_factory=list)
    # Hashes of spawning strategies that produced low-fitness offspring
    
    # Successful patterns: what TO do
    successful_lineages: List[str] = field(default_factory=list)
    
    # Aggregate metrics
    quality_score: float = 0.0       # 0-1, overall quality of this cycle
    total_activations: int = 0
    total_collisions: int = 0
    novel_discoveries: int = 0       # Things learned that weren't in prior deposits
    
    # The centroid embedding (for routing deposit influence)
    centroid_embedding: np.ndarray = field(default=None)
    
    # Glyph image (RBY-encoded visual summary)
    glyph_path: str = ""  # Path to PNG file
    
    # Micro-absoleice summary (aggregated)
    micro_summary: Dict[str, Any] = field(default_factory=dict)
    
    # Seed at beginning and end of this cycle
    seed_start: Tuple[float, float, float] = (0.333, 0.333, 0.333)
    seed_end: Tuple[float, float, float] = (0.333, 0.333, 0.333)
```

---

## The Deposit Store

Deposits live in AE-side storage (the "source" that persists across cycles):

```
{AE_ROOT}/deposits/
    ├── manifest.json           # Index of all deposits
    ├── cycle_001/
    │   ├── macro_absoleice.pkl # The full MacroAbsoleice object
    │   ├── glyph.png           # Visual RBY summary
    │   ├── weight_stats.npz    # Compressed weight statistics
    │   └── micro_summary.json  # Aggregated micro-absoleice metrics
    ├── cycle_002/
    │   ├── ...
    └── cycle_NNN/
        └── ...
```

### Deposit Storage Budget

Deposits are small compared to the nano sea they represent:

| Cycle Nanos | Deposit Size | Compression Ratio |
|-------------|-------------|-------------------|
| 10,000      | ~50 MB      | 200:1             |
| 100,000     | ~200 MB     | 500:1             |
| 1,000,000   | ~500 MB     | 2000:1            |
| 10,000,000  | ~1 GB       | 10000:1           |

The deposit captures the STRUCTURE of what was learned, not the full weights.

---

## How Deposits Guide Expansion ("Light Leaking In")

### 1. Seed Mutation

The most direct influence: deposits change the RBY seed.

```python
def mutate_seed_from_deposits(current_rby: np.ndarray, 
                               deposits: List[MacroAbsoleice]) -> np.ndarray:
    """
    Deposits shift the seed toward regions that were productive.
    """
    if not deposits:
        return current_rby
    
    # Weight recent deposits more heavily
    weights = np.array([1.0 / (i + 1) for i in range(len(deposits))])
    weights = weights[::-1]  # Most recent has highest weight
    weights /= weights.sum()
    
    # Compute weighted average of deposit end-seeds
    target_rby = np.zeros(3)
    for w, dep in zip(weights, deposits):
        target_rby += w * np.array(dep.seed_end)
    
    # Move current seed toward the target
    momentum = 0.1  # Don't jump too fast
    new_rby = current_rby * (1 - momentum) + target_rby * momentum
    return new_rby / new_rby.sum()
```

### 2. Spawning Bias

When spawning new nanos, deposits bias WHERE in RBY space nanos are created:

```python
def biased_spawn_location(seed_rby: np.ndarray, 
                           deposits: List[MacroAbsoleice]) -> np.ndarray:
    """
    Instead of spawning uniformly, spawn near regions that worked before.
    """
    if not deposits:
        # No deposits: uniform random on simplex
        return np.random.dirichlet([1, 1, 1])
    
    # Get fitness heatmap from most recent deposit
    latest = deposits[-1]
    if latest.fitness_heatmap is not None:
        # Sample from the heatmap (high-fitness regions more likely)
        flat = latest.fitness_heatmap.flatten()
        probs = flat / flat.sum()
        idx = np.random.choice(len(flat), p=probs)
        
        # Convert flat index back to RBY coordinates
        r_idx = idx // (10 * 10)
        b_idx = (idx // 10) % 10
        y_idx = idx % 10
        
        base = np.array([r_idx / 10, b_idx / 10, y_idx / 10])
        # Add noise
        noise = np.random.normal(0, seed_rby[0] * 0.05, size=3)  # R-scaled noise
        result = np.clip(base + noise, 0.01, 0.98)
        return result / result.sum()
    
    return seed_rby + np.random.normal(0, 0.05, size=3)
```

### 3. Weight Initialization

New nanos can be initialized from deposit weight statistics instead of random:

```python
def deposit_initialized_weights(nano_type: str, architecture_hash: str,
                                 deposits: List[MacroAbsoleice]) -> Optional[Dict]:
    """
    If a prior deposit has weight statistics for this nano type,
    initialize from those statistics instead of random.
    
    This is the "light leaking in" — prior knowledge pre-loads
    the nano so it converges faster.
    """
    for deposit in reversed(deposits):  # Most recent first
        key = f"{nano_type}_{architecture_hash}"
        if key in deposit.weight_means:
            means = deposit.weight_means[key]
            stds = deposit.weight_stds[key]
            
            # Sample weights from the learned distribution
            initialized = {}
            for param_name, mean in means.items():
                std = stds.get(param_name, np.ones_like(mean) * 0.01)
                initialized[param_name] = np.random.normal(mean, std * 0.5)
            
            return initialized
    
    return None  # No prior knowledge — random init
```

### 4. Anti-Pattern Avoidance

Deposits record which approaches failed. The spawner avoids them:

```python
def should_spawn(parent_card: NanoCard, mutation: str,
                  deposits: List[MacroAbsoleice]) -> bool:
    """
    Check if this spawning approach was already proven to fail.
    """
    spawn_signature = f"{parent_card.nano_type}_{parent_card.specialization}_{mutation}"
    spawn_hash = hashlib.sha256(spawn_signature.encode()).hexdigest()[:16]
    
    for deposit in deposits:
        if spawn_hash in deposit.failed_lineages:
            return False  # Don't repeat this mistake
    
    return True
```

---

## Deposit Lifecycle & Ancestral Compounding

### The Key Reversal: Old Deposits Gain Weight, Not Lose It

Per the Weighted Reality Theory (Axiom 9), ancestral knowledge does not decay —
it **compounds**. The current cycle's deposits start as the weakest influence.
As cycles pass and they survive validation, their weight GROWS:

```
Cycle deposited:     1    5    10   20   50   100
Ancestral weight:   0.01  0.05  0.11  0.26  0.87  4.43
                    (freshest)              (strongest)
```

This is the **soft-capped** compounding function:

```
W_A(age) = W_A_max × (1 − e^(−r_deposit × age))
```

Where:
- `age` = current_cycle − deposit_cycle
- `W_A_max` = maximum deposit weight ceiling (default 5.0)
- `r_deposit` = deposit growth rate constant (default 0.03 per cycle)

> **Why soft-cap?** The original formula `α × (1 + r)^age` produces a weight of 369× base
> at age=200 and 26,219× at age=500 (test_01_compounding_explosion.py). This means a
> Cycle-1 deposit would completely dominate all more recent deposits, preventing the
> system from adapting to new data distributions. The soft cap ensures old deposits
> are the *strongest* influence (correct intuition) but not *infinitely* stronger.

### Three-Tier Storage (But NOT Loss-Based)

Deposits still use tiered storage for I/O efficiency, but **no information is
stripped**. The tiers are about access speed, not data reduction:

```
HOT  (last 10 cycles):  Full deposits, loaded in RAM
                         Used for: WEA ancestral init, spawning bias, anti-patterns
                         Access: instant (in-memory)

WARM (cycles 11-100):   Full deposits, on fast SSD
                         Used for: WEA G parameter (generation count), weight stats
                         Access: ~10ms (disk read)

COLD (cycles 101+):     Full deposits, compressed on disk (gzip)
                         Used for: Deep ancestral weight (high G), lineage verification
                         Access: ~100ms (decompress + read)
```

The critical difference from naive archival: **cold deposits have the HIGHEST
ancestral weight** because they've compounded the longest. They are accessed less
frequently but their influence is the strongest when they ARE consulted.

```python
class DepositManager:
    """Manages deposits with compounding ancestral weight."""
    
    HOT_CYCLES = 10
    WARM_CYCLES = 100
    DEPOSIT_COMPOUND_RATE = 0.03  # growth rate constant (not compounding rate)
    BASE_WEIGHT = 0.01
    MAX_DEPOSIT_WEIGHT = 5.0       # Soft cap ceiling
    
    def __init__(self, deposit_dir: str, current_cycle: int = 0):
        self.deposit_dir = deposit_dir
        self.current_cycle = current_cycle
        self.hot_deposits: List[MacroAbsoleice] = []
        self.warm_index: Dict[int, str] = {}   # cycle → file path
        self.cold_index: Dict[int, str] = {}   # cycle → file path
    
    def ancestral_weight(self, deposit_cycle: int) -> float:
        """
        Compute the SOFT-CAPPED ancestral weight of a deposit.
        Older deposits have HIGHER weight — they are the bedrock —
        but weight is bounded by MAX_DEPOSIT_WEIGHT.
        
        W_A(age) = W_A_max × (1 − e^(−r × age))
        """
        age = self.current_cycle - deposit_cycle
        return self.MAX_DEPOSIT_WEIGHT * (1 - math.exp(-self.DEPOSIT_COMPOUND_RATE * age))
    
    def get_wea_parameters(self, nano_type: str) -> dict:
        """
        Compute WEA initialization parameters for a new nano.
        
        G = number of prior cycles that contributed deposits for this nano type
        phi = fraction of those deposits that had above-average quality
        W_A = sum of compounding weights across all relevant deposits
        """
        relevant_deposits = self._find_deposits_for_type(nano_type)
        
        G = len(relevant_deposits)
        if G == 0:
            return {"G": 0, "phi": 0.0, "alpha": self.BASE_WEIGHT}
        
        phi = sum(1 for d in relevant_deposits if d["quality_score"] > 0.5) / G
        total_W_A = sum(
            self.ancestral_weight(d["cycle_number"]) 
            for d in relevant_deposits
        )
        
        return {
            "G": G,
            "phi": phi,
            "alpha": total_W_A / G,  # Average compounded weight
            "deposit_state_dict": self._blend_weight_stats(relevant_deposits),
        }
    
    def _blend_weight_stats(self, deposits: list) -> dict:
        """
        Blend weight statistics from multiple deposits, weighted by
        their compounding ancestral weight.
        
        Older deposits contribute MORE to the blend, not less.
        """
        if not deposits:
            return {}
        
        blended = {}
        total_weight = 0.0
        
        for dep in deposits:
            w = self.ancestral_weight(dep["cycle_number"])
            total_weight += w
            
            for param_name, stats in dep.get("weight_stats", {}).items():
                if param_name not in blended:
                    blended[param_name] = {"mean": 0.0, "std": 0.0}
                blended[param_name]["mean"] += w * stats["mean"]
                blended[param_name]["std"] += w * stats["std"]
        
        # Normalize by total weight
        for param_name in blended:
            blended[param_name]["mean"] /= total_weight
            blended[param_name]["std"] /= total_weight
        
        return blended
    
    def compact_storage(self, all_deposits: List[MacroAbsoleice]):
        """
        Move deposits between tiers based on age.
        NO information is destroyed — only access tier changes.
        """
        for dep in all_deposits:
            age = self.current_cycle - dep.cycle_number
            
            if age <= self.HOT_CYCLES:
                self.hot_deposits.append(dep)
            elif age <= self.WARM_CYCLES:
                path = self._write_to_disk(dep, compressed=False)
                self.warm_index[dep.cycle_number] = path
            else:
                path = self._write_to_disk(dep, compressed=True)  # gzip
                self.cold_index[dep.cycle_number] = path
```

### Why This Works: The Bedrock Effect

Think of it like geological strata:

```
Surface (hot):     Fresh deposits — weak individual weight, high detail access
                   Used for immediate guidance (spawning, anti-patterns)

Middle (warm):     Proven deposits — moderate compounded weight
                   Used for WEA ancestral initialization

Bedrock (cold):    Ancient deposits — STRONGEST compounded weight
                   Used for deep ancestral backbone in WEA nanos
                   These are the "instinct" — the crystallized wisdom
                   that took hundreds of cycles to build
```

A nano born in Cycle 200 with deposits going back to Cycle 1 has an ancestral
network initialized from a blend where Cycle 1's deposit contributes the
strongest weight (approaching W_A_max = 5.0) while Cycle 199's deposit
contributes only ~0.15 (`5.0 × (1-e^(-0.03×1)) ≈ 0.15`). The ancient deposits
ARE the instinct. The recent deposits are the "personal experience of the species."
Critically, the soft cap ensures no single ancient deposit dominates infinitely —
all deposits asymptote to the same ceiling.

---

## TWMRTO Compression (Memory Decay for Deposits)

Following the framework's memory decay technique, deposits themselves compress:

```
Cycle 1 deposit: Full statistical portrait of 10M nanos
  → "Feature nanos in R=0.7 region had 95% success rate on English text"
  → "Pattern nanos deeper than depth 5 all failed on code"
  → ... (thousands of statistics)

After TWMRTO compression:
  → "R0.7 English good. Deep code bad."
  → Then: "R7 E+ Dcode-"
  → Then: glyph pixel (167, 230, 45)

The glyph is the final compressed form. It serves as a **visual fingerprint** —
a recognizable signature of the deposit's RBY distribution — but it is NOT
losslessly reversible. A 24-bit RGB pixel cannot encode megabytes of weight
statistics. The full deposit data is always preserved in the tiered storage;
the glyph is a human-readable summary and quick-lookup hash.

> **Engineering note**: "Exact rehydration" from an earlier draft was
> information-theoretically impossible (24 bits cannot reconstruct megabytes).
> The glyph is now defined as a lossy visual hash, not a compression format.
```
