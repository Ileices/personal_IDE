# 07 — Absularity and Compression

## When and How the Sea Compresses

Absularity is the saturation point — the moment the expansion can no longer 
productively continue. It triggers compression, which distills the nano sea 
into deposits and prepares the seed for the next cycle.

---

## Absularity Detection

Three independent triggers, any one is sufficient:

### Trigger 1: Storage Saturation

```python
def check_storage_absularity(storage_paths: List[Path]) -> Tuple[bool, str]:
    """Check if any storage path has reached saturation."""
    for path in storage_paths:
        stat = shutil.disk_usage(path)
        ratio = stat.used / stat.total
        
        if ratio >= 0.95:
            return True, f"CRITICAL: {path} at {ratio:.1%} — emergency compression"
        elif ratio >= 0.90:
            return True, f"HARD: {path} at {ratio:.1%} — forced compression"
        elif ratio >= 0.85:
            return True, f"SOFT: {path} at {ratio:.1%} — begin compression"
    
    return False, "OK"
```

### Trigger 2: UF/IO Equilibrium

When the system has explored everything it can with the current seed:

```python
def check_equilibrium_absularity(UF: float, IO: float, 
                                  rby: np.ndarray, prev_rby: np.ndarray,
                                  epsilon: float = 1e-3) -> bool:
    """
    The system is in equilibrium when:
    - UF and IO are approximately equal (no net drive to expand or contract)
    - RBY has stopped changing (the seed has converged)
    """
    uf_io_balanced = abs(UF - IO) < 0.05
    rby_stable = np.linalg.norm(rby - prev_rby) < epsilon
    return uf_io_balanced and rby_stable
```

### Trigger 3: Diminishing Returns

When new nanos stop improving over existing ones:

```python
def check_diminishing_returns(recent_spawns: List[NanoCard], 
                                existing_average_fitness: float,
                                window: int = 100) -> bool:
    """
    If the last N spawned nanos have lower average fitness than existing nanos,
    the expansion is producing waste.
    """
    if len(recent_spawns) < window:
        return False
    
    recent_fitness = np.mean([n.fitness for n in recent_spawns[-window:]])
    return recent_fitness < existing_average_fitness * 0.95  # 5% threshold
```

### Combined Absularity Monitor

```python
class AbsularityMonitor:
    """Monitors all absularity triggers and signals when compression should begin."""
    
    def __init__(self, storage_paths: List[Path]):
        self.storage_paths = storage_paths
        self.prev_rby = None
        self.recent_spawns: List[NanoCard] = []
        self.existing_avg_fitness = 0.5
        self.triggered = False
        self.trigger_reason = ""
    
    def update(self, rby: np.ndarray, UF: float, IO: float,
               new_spawns: List[NanoCard], all_cards: Dict[str, NanoCard]):
        """Call this every expansion step."""
        
        # Update tracking
        self.recent_spawns.extend(new_spawns)
        if all_cards:
            self.existing_avg_fitness = np.mean([c.fitness for c in all_cards.values()])
        
        # Check triggers
        storage_hit, storage_msg = check_storage_absularity(self.storage_paths)
        if storage_hit:
            self.triggered = True
            self.trigger_reason = storage_msg
            return
        
        if self.prev_rby is not None:
            if check_equilibrium_absularity(UF, IO, rby, self.prev_rby):
                self.triggered = True
                self.trigger_reason = "EQUILIBRIUM: UF≈IO and RBY stable"
                return
        
        if check_diminishing_returns(self.recent_spawns, self.existing_avg_fitness):
            self.triggered = True
            self.trigger_reason = "DIMINISHING: New nanos not improving"
            return
        
        self.prev_rby = rby.copy()
    
    def reached(self) -> bool:
        return self.triggered
    
    @property
    def storage_ratio(self) -> float:
        """Current highest storage usage ratio."""
        ratios = []
        for path in self.storage_paths:
            stat = shutil.disk_usage(path)
            ratios.append(stat.used / stat.total)
        return max(ratios) if ratios else 0.0
```

---

## The Compression Process

When Absularity triggers, compression runs in 6 phases:

### Phase 1: Census and Scoring

Score every nano by composite fitness:

```python
def score_all_nanos(registry: NanoRegistry) -> List[Tuple[str, float]]:
    """Score every nano by fitness. Returns sorted list (gid, score)."""
    scores = []
    for gid, card in registry.cards.items():
        score = card.fitness  # composite of success_rate, usage, recency, RBY balance
        scores.append((gid, score))
    
    scores.sort(key=lambda x: x[1], reverse=True)
    return scores
```

### Phase 2: Triage — Survive, Compress, or Destroy

```python
class CompressionTriage:
    """Decide which nanos survive, which get compressed, which get destroyed.
    
    Ratios are configurable and can adapt across cycles. Early cycles may
    destroy less aggressively (more exploration needed). Later cycles can
    be more aggressive (deposits carry the knowledge).
    """
    
    DEFAULT_SURVIVE_RATIO = 0.10     # Top 10% survive intact
    DEFAULT_COMPRESS_RATIO = 0.70    # Next 70% get compressed into absoleices
    DEFAULT_DESTROY_RATIO = 0.20     # Bottom 20% are destroyed
    
    def __init__(self, survive_ratio: float = None, compress_ratio: float = None,
                 destroy_ratio: float = None):
        self.survive_ratio = survive_ratio or self.DEFAULT_SURVIVE_RATIO
        self.compress_ratio = compress_ratio or self.DEFAULT_COMPRESS_RATIO
        self.destroy_ratio = destroy_ratio or self.DEFAULT_DESTROY_RATIO
        assert abs(self.survive_ratio + self.compress_ratio + self.destroy_ratio - 1.0) < 1e-6
    
    @classmethod
    def for_cycle(cls, cycle_number: int) -> 'CompressionTriage':
        """Cycle-adaptive triage ratios.
        
        Early cycles (0-5): Destroy less, compress more (still exploring).
        Middle cycles (6-20): Default ratios.
        Later cycles (20+): Destroy more, survive less (deposits carry knowledge).
        """
        if cycle_number <= 5:
            return cls(survive_ratio=0.15, compress_ratio=0.75, destroy_ratio=0.10)
        elif cycle_number <= 20:
            return cls()  # defaults
        else:
            return cls(survive_ratio=0.08, compress_ratio=0.67, destroy_ratio=0.25)
    
    def triage(self, scored: List[Tuple[str, float]]) -> Dict[str, str]:
        """Returns {gid: 'survive' | 'compress' | 'destroy'}."""
        n = len(scored)
        survive_cutoff = int(n * self.survive_ratio)
        compress_cutoff = int(n * (self.survive_ratio + self.compress_ratio))
        
        decisions = {}
        for i, (gid, score) in enumerate(scored):
            if i < survive_cutoff:
                decisions[gid] = 'survive'
            elif i < compress_cutoff:
                decisions[gid] = 'compress'
            else:
                decisions[gid] = 'destroy'
        
        return decisions
```

### Phase 3: Compress to Absoleices

The "compress" group gets distilled into macro-absoleices:

```python
class NanoCompressor:
    """Compress a group of nanos into a MacroAbsoleice."""
    
    def compress(self, nano_cards: List[NanoCard], 
                 nano_loader: Callable) -> MacroAbsoleice:
        """
        Distill a population of nanos into compressed knowledge.
        
        This extracts:
        1. Fitness heatmap (where in RBY space were they?)
        2. Weight statistics (mean/std of successful nanos' weights)
        3. Success/failure patterns
        4. Lineage data
        """
        absoleice = MacroAbsoleice()
        absoleice.population_size_before = len(nano_cards)
        
        # 1. Build fitness heatmap
        heatmap = np.zeros((10, 10, 10))
        counts = np.zeros((10, 10, 10))
        for card in nano_cards:
            r_idx = min(9, int(card.r * 10))
            b_idx = min(9, int(card.b * 10))
            y_idx = min(9, int(card.y * 10))
            heatmap[r_idx, b_idx, y_idx] += card.fitness
            counts[r_idx, b_idx, y_idx] += 1
        
        # Average fitness per cell
        mask = counts > 0
        heatmap[mask] /= counts[mask]
        absoleice.fitness_heatmap = heatmap
        
        # 2. Extract weight statistics from top performers
        top_cards = sorted(nano_cards, key=lambda c: c.fitness, reverse=True)
        top_cards = top_cards[:max(1, len(top_cards) // 5)]  # Top 20% of the compress group
        
        weight_collections: Dict[str, List[Dict[str, np.ndarray]]] = defaultdict(list)
        for card in top_cards:
            try:
                nano = nano_loader(card.gid)
                key = f"{card.nano_type}_{card.architecture_hash}"
                weights = {name: param.detach().numpy() 
                          for name, param in nano.model.named_parameters()}
                weight_collections[key].append(weights)
            except:
                continue
        
        for key, weight_list in weight_collections.items():
            if not weight_list:
                continue
            # Compute mean and std across all nanos of this type
            all_params = {}
            for weights in weight_list:
                for name, arr in weights.items():
                    if name not in all_params:
                        all_params[name] = []
                    all_params[name].append(arr)
            
            absoleice.weight_means[key] = {
                name: np.mean(arrs, axis=0) for name, arrs in all_params.items()
            }
            absoleice.weight_stds[key] = {
                name: np.std(arrs, axis=0) for name, arrs in all_params.items()
            }
        
        # 3. Record lineage patterns
        for card in nano_cards:
            if card.fitness > 0.7:
                sig = f"{card.nano_type}_{card.specialization}_{card.generation_depth}"
                absoleice.successful_lineages.append(
                    hashlib.sha256(sig.encode()).hexdigest()[:16]
                )
            elif card.fitness < 0.2:
                sig = f"{card.nano_type}_{card.specialization}_{card.generation_depth}"
                absoleice.failed_lineages.append(
                    hashlib.sha256(sig.encode()).hexdigest()[:16]
                )
        
        # 4. Compute aggregate quality score
        absoleice.quality_score = np.mean([c.fitness for c in nano_cards])
        absoleice.total_activations = sum(c.usage_count for c in nano_cards)
        
        # 5. Generate glyph image
        rby_values = [(c.r, c.b, c.y) for c in nano_cards]
        glyph_image = layout_pixels(rby_values, bucket_size(len(rby_values)))
        absoleice.glyph_path = self._save_glyph(glyph_image, absoleice.gid)
        
        return absoleice
```

### Phase 4: Destroy and Reclaim

```python
def destroy_nanos(registry: NanoRegistry, gids_to_destroy: List[str],
                  storage_path: Path) -> List[str]:
    """Remove nanos from registry and delete their weight files.
    
    Returns list of lineage hashes for destroyed nanos, so their failure
    can be recorded in the deposit (even though their weights are gone).
    """
    destroyed_lineage_hashes = []
    for gid in gids_to_destroy:
        card = registry.cards.get(gid)
        if card:
            # Record lineage hash BEFORE destroying
            sig = f"{card.nano_type}_{card.specialization}_{card.generation_depth}"
            lineage_hash = hashlib.sha256(sig.encode()).hexdigest()[:16]
            destroyed_lineage_hashes.append(lineage_hash)
            
            # Delete weight file
            weight_path = storage_path / "nanos" / f"{gid}.pt"
            if weight_path.exists():
                weight_path.unlink()
            
            # Remove from registry
            registry.remove(gid)
    
    # Rebuild FAISS index (since we can't efficiently delete from it)
    registry.rebuild_index()
    return destroyed_lineage_hashes
```

### Phase 5: Deposit to AE

```python
def deposit_to_ae(absoleice: MacroAbsoleice, ae_deposit_path: Path):
    """Write the compressed absoleice to AE-side storage."""
    cycle_dir = ae_deposit_path / f"cycle_{absoleice.cycle_number:05d}"
    cycle_dir.mkdir(parents=True, exist_ok=True)
    
    # Save the full absoleice
    with open(cycle_dir / "macro_absoleice.pkl", 'wb') as f:
        pickle.dump(absoleice, f)
    
    # Save the glyph image
    if absoleice.glyph_path and Path(absoleice.glyph_path).exists():
        shutil.copy(absoleice.glyph_path, cycle_dir / "glyph.png")
    
    # Save weight stats as compressed numpy
    if absoleice.weight_means:
        np.savez_compressed(
            cycle_dir / "weight_stats.npz",
            **{f"mean_{k}_{p}": v for k, means in absoleice.weight_means.items() 
               for p, v in means.items()},
            **{f"std_{k}_{p}": v for k, stds in absoleice.weight_stds.items() 
               for p, v in stds.items()}
        )
    
    # Save human-readable summary
    summary = {
        'cycle': absoleice.cycle_number,
        'quality': absoleice.quality_score,
        'population_before': absoleice.population_size_before,
        'total_activations': absoleice.total_activations,
        'successful_lineage_count': len(absoleice.successful_lineages),
        'failed_lineage_count': len(absoleice.failed_lineages),
        'seed_start': list(absoleice.seed_start),
        'seed_end': list(absoleice.seed_end),
    }
    with open(cycle_dir / "summary.json", 'w') as f:
        json.dump(summary, f, indent=2)
```

### Phase 6: Seed Mutation

```python
def mutate_seed(current_seed: CycleSeed, absoleice: MacroAbsoleice,
                surviving_cards: List[NanoCard]) -> CycleSeed:
    """Create the seed for the next expansion cycle."""
    
    # Compute observables from the cycle
    total = sum(c.success_count + c.failure_count for c in surviving_cards)
    s = sum(c.success_count for c in surviving_cards) / total if total > 0 else 0.5
    e = sum(c.failure_count for c in surviving_cards) / total if total > 0 else 0.5
    c_val = len(surviving_cards) / 1000  # complexity proxy
    
    # UF/IO
    UF, IO = compute_uf_io(s, e, c_val)
    
    # Update RBY
    new_rby = update_rby(current_seed.rby, UF, IO, s, e)
    
    # Apply deposit guidance
    all_deposits = load_all_deposits()
    all_deposits.append(absoleice)
    new_rby = mutate_seed_from_deposits(new_rby, all_deposits)
    
    return CycleSeed(
        rby=new_rby,
        cycle_number=current_seed.cycle_number + 1,
        deposits=all_deposits[-10:],  # Keep 10 most recent in hot memory
        parent_seed_hash=current_seed.hash
    )
```

---

## Compression Timeline

A typical compression cycle:

```
T+0s   : Absularity detected (storage at 87%)
T+1s   : Census begins — scoring 500,000 nanos
T+5s   : Triage complete — 50K survive, 350K compress, 100K destroy
T+10s  : Destruction begins — reclaiming disk space from 100K nanos
T+30s  : Compression begins — distilling 350K nanos into absoleices
T+120s : Weight statistics computed for top performers
T+150s : Glyph image generated
T+155s : Deposit written to AE storage
T+160s : Seed mutated for next cycle
T+161s : Next expansion begins with 50K surviving nanos + new seed
```

Total downtime: ~3 minutes. During this time, the surviving 50K nanos can still 
handle inference (degraded but functional).
