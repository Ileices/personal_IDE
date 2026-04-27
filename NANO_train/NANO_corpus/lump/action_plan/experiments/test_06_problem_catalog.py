#!/usr/bin/env python3
"""
EXPERIMENT 06: Comprehensive Problem Catalog & Magic Number Audit
================================================================
Validates every hardcoded constant in the spec and identifies
which ones are justified and which are arbitrary.

Also tests structural issues:
  1. FAISS function_embedding = `...` (broken)
  2. Fitness formula inconsistencies between files
  3. Missing backward() in bootstrap
  4. PTAIE produces 3 floats but nanos expect 256 dims
  5. SQLite thread safety with WAL mode
"""

import math
import sys

SEPARATOR = "=" * 70


def test_magic_numbers():
    """Audit every hardcoded constant for mathematical justification."""
    print(SEPARATOR)
    print("TEST 1: Magic Number Audit")
    print(SEPARATOR)
    
    numbers = [
        # (value, where, justification, severity)
        ("PRIMORDIAL_SEED", "(0.3535, 0.2500, 0.3965)", 
         "R=sqrt(0.5)/sum, B=0.5/sum, Y=sqrt(2/pi)/sum", 
         "JUSTIFIED — derives from AE=C=1 axiom via sqrt relationships"),
        
        ("THETA", "(6.0, 4.0, 0.5, 6.0, 6.0, 0.8)",
         "UF/IO sigmoid parameters",
         "UNJUSTIFIED — arbitrarily chosen. With values this large, sigmoid is "
         "near saturation for most inputs. Should be 1.0-3.0 for useful dynamic range."),
        
        ("SOFT_ABS", "0.85",
         "Disk usage threshold for soft absularity",
         "REASONABLE — standard for disk monitoring alerts"),
        
        ("HARD_ABS", "0.90", 
         "Disk usage threshold for hard absularity",
         "REASONABLE — standard for disk monitoring"),
        
        ("CRIT_ABS", "0.95",
         "Disk usage threshold for critical absularity",
         "REASONABLE — standard for emergency disk alerts"),
        
        ("SURVIVE_RATIO", "0.10",
         "Top 10% survive compression",
         "ARBITRARY — why not 5% or 15%? Should be configurable and cycle-adaptive"),
        
        ("COMPRESS_RATIO", "0.70",
         "Middle 70% compressed to deposits",
         "ARBITRARY — follows from SURVIVE + DESTROY but the split is unvalidated"),
        
        ("DESTROY_RATIO", "0.20",
         "Bottom 20% destroyed with no trace",
         "PROBLEMATIC — destroying 20% with NO deposit means losing information. "
         "Even bad nanos have negative-knowledge value (what NOT to do)."),
        
        ("CONSCIOUSNESS_COUPLING", "1e-6",
         "Bias term in every nano's forward pass",
         "COMPLETELY UNJUSTIFIED — where is this applied? What does it do mathematically? "
         "The spec mentions it but no code uses it. If applied as a literal bias of 1e-6, "
         "it's smaller than floating point noise and does nothing."),
        
        ("WEA r", "0.05",
         "Personal weight compounding rate",
         "UNJUSTIFIED — 5% compounding per step. After 100 steps, (1.05)^100 = 131x. "
         "After 200 steps, 17,293x. After 500 steps, 3.9 billion. DANGEROUS."),
        
        ("WEA w_p", "0.1",
         "Base personal weight per step",
         "ARBITRARY — ratio to W_A matters more than absolute value"),
        
        ("Deposit r_dep", "0.03",
         "Deposit compounding rate per cycle",
         "DANGEROUS — 3% per cycle means cycle 200 deposits dominate 370x. "
         "At cycle 500, oldest deposit has weight 2.6 million x base."),
        
        ("Deposit alpha", "0.01",
         "Base deposit weight",
         "OK as starting value but deposits at 1.03^500 make this moot"),
        
        ("Generation decay", "exp(-0.12 * depth)",
         "Survival modifier for deep nanos",
         "REASONABLE — produces smooth decay. depth 10 = 30% survival. "
         "The coefficient 0.12 could be tuned but shape is correct."),
        
        ("Fitness w_success", "0.40",
         "Weight for success rate in composite fitness",
         "REASONABLE — success rate should dominate"),
        
        ("Fitness w_usage", "0.20 or 0.30",
         "Weight for usage in composite fitness",
         "INCONSISTENT — 0.30 in bootstrap NanoCard, 0.20 in NanoFitness class. PICK ONE."),
        
        ("Fitness w_uniqueness", "0.25",
         "Weight for uniqueness in composite fitness (11_EVOLUTION only)",
         "MISSING from bootstrap and 02_NANO_ANATOMY fitness calculations"),
        
        ("UF/IO epsilon (equilibrium)", "0.05",
         "Threshold for |UF-IO| equilibrium absularity",
         "ARBITRARY — needs empirical tuning. With saturated sigmoid, |UF-IO| "
         "may rarely get below 0.05 even at true equilibrium."),
        
        ("RBY epsilon (convergence)", "1e-3",
         "Threshold for RBY convergence in equilibrium absularity",
         "REASONABLE for float64 but may need adjustment for actual convergence rates"),
        
        ("Seed mutation lr", "0.05 or 0.30",
         "Learning rate for seed mutation",
         "INCONSISTENT — 0.05 in update_rby, 0.30 in mutate_seed (30% deposit influence). "
         "These are different mechanisms but both called 'mutation'. Confusing."),
        
        ("Efficiency ratchet", "0.95 (multiplied per cycle)",
         "Population reduction rate: pop *= 0.95 each cycle",
         "JUSTIFIED — 5% reduction per cycle means after 20 cycles: 36% of original. "
         "After 50: 7.7%. After 100: 0.6%. This is aggressive but intentional."),
    ]
    
    justified = 0
    arbitrary = 0
    dangerous = 0
    inconsistent = 0
    
    for name, value, where, assessment in numbers:
        is_bad = any(w in assessment.upper() for w in ["UNJUSTIFIED", "ARBITRARY", "DANGEROUS", "INCONSISTENT", "PROBLEMATIC", "MISSING"])
        symbol = "!!!" if "DANGEROUS" in assessment.upper() else ("XX" if is_bad else "OK")
        
        print(f"\n  [{symbol}] {name} = {value}")
        print(f"       Used for: {where}")
        print(f"       Assessment: {assessment}")
        
        if "JUSTIFIED" in assessment.upper() or "REASONABLE" in assessment.upper():
            justified += 1
        elif "DANGEROUS" in assessment.upper():
            dangerous += 1
        elif "INCONSISTENT" in assessment.upper():
            inconsistent += 1
        else:
            arbitrary += 1
    
    print(f"\n  TOTALS: {justified} justified, {arbitrary} arbitrary, {dangerous} dangerous, {inconsistent} inconsistent")
    print(f"  Out of {len(numbers)} constants audited.")


def test_theta_dynamic_range():
    """Show that theta=(6,4,0.5,6,6,0.8) wastes most of sigmoid's range."""
    print(f"\n{SEPARATOR}")
    print("TEST 2: Theta Dynamic Range Analysis")
    print(SEPARATOR)
    
    def sigmoid(x): 
        return 1.0 / (1.0 + math.exp(-max(-500, min(500, x))))
    
    theta = (6.0, 4.0, 0.5, 6.0, 6.0, 0.8)
    alpha, beta, gamma, delta, epsilon, zeta = theta
    
    # Sweep success from 0 to 1
    print(f"\n  UF response to success (error=0.3, complexity=0.5):")
    print(f"  {'Success':>8} {'sigmoid_input':>14} {'UF':>8} {'Saturated?':>12}")
    print(f"  {'-'*8} {'-'*14} {'-'*8} {'-'*12}")
    
    for s in [x/10 for x in range(11)]:
        input_val = alpha * s - beta * 0.3 + gamma * math.tanh(0.5)
        uf = sigmoid(input_val)
        saturated = "YES" if uf > 0.99 or uf < 0.01 else "NO"
        print(f"  {s:>8.1f} {input_val:>14.2f} {uf:>8.4f} {saturated:>12}")
    
    # Count how many points are in the useful [0.05, 0.95] range
    useful = 0
    total = 0
    for s in range(101):
        for e in range(101):
            total += 1
            s_val = s / 100
            e_val = e / 100
            input_val = alpha * s_val - beta * e_val + gamma * math.tanh(0.5)
            uf = sigmoid(input_val)
            if 0.05 < uf < 0.95:
                useful += 1
    
    print(f"\n  Of {total} (success, error) combinations:")
    print(f"  {useful} ({useful/total*100:.1f}%) produce UF in useful [0.05, 0.95] range")
    print(f"  {total - useful} ({(total-useful)/total*100:.1f}%) are in saturated tails")
    
    if useful / total < 0.3:
        print("\n  >>> PROBLEM: Over 70% of inputs produce saturated UF.")
        print("  >>> FIX: Reduce theta values to 1.0-3.0 for useful dynamic range.")
        print("  >>> Suggested: theta = (2.0, 1.5, 0.5, 2.0, 2.0, 0.5)")


def test_fitness_inconsistency():
    """Show that fitness is computed differently in different files."""
    print(f"\n{SEPARATOR}")
    print("TEST 3: Fitness Formula Inconsistency")
    print(SEPARATOR)
    
    # Simulate a nano with known metrics
    usage = 50
    success = 35
    failure = 15
    success_rate = success / usage
    
    # Version 1: bootstrap NanoCard (simple)
    fitness_v1 = success / max(usage, 1)  # Just success rate!
    
    # Version 2: spec 02_NANO_ANATOMY NanoCard (composite)
    usage_factor = min(usage / 100, 1.0)
    recency = 1.0  # Assume just used
    rby_balance = 0.8  # Assume reasonably balanced
    fitness_v2 = (success_rate * 0.4 + usage_factor * 0.3 + recency * 0.2 + rby_balance * 0.1)
    
    # Version 3: spec 11_EVOLUTION NanoFitness (with uniqueness and bridges)
    uniqueness = 0.6
    bridge_count = 2
    usage_score_v3 = 1.0 / (1.0 + math.exp(-0.1 * (usage - 10)))
    fitness_v3 = (success_rate * 0.40 + usage_score_v3 * 0.20 + 
                  uniqueness * 0.25 + min(1.0, bridge_count / 5.0) * 0.15)
    
    print(f"\n  Same nano (usage={usage}, success={success}):")
    print(f"    Version 1 (bootstrap):     fitness = {fitness_v1:.4f}")
    print(f"    Version 2 (02_ANATOMY):    fitness = {fitness_v2:.4f}")
    print(f"    Version 3 (11_EVOLUTION):  fitness = {fitness_v3:.4f}")
    print(f"\n  Divergence: {max(fitness_v1, fitness_v2, fitness_v3) - min(fitness_v1, fitness_v2, fitness_v3):.4f}")
    print(f"  >>> INCONSISTENT: Three different fitness formulas across three files!")
    print(f"  >>> FIX: Define ONE canonical fitness function, import it everywhere.")


def test_structural_bugs():
    """Identify structural issues that prevent implementation."""
    print(f"\n{SEPARATOR}")
    print("TEST 4: Structural Implementation Bugs")
    print(SEPARATOR)
    
    bugs = [
        ("CRITICAL", "function_embedding = ...", "02_NANO_ANATOMY.md",
         "NanoCard.function_embedding is a Python Ellipsis literal. "
         "FAISS index.add() will crash because there's no actual embedding vector. "
         "Every routing, collision, and inference call depends on this. "
         "FIX: Implement embedding as hash of (nano_type + architecture + RBY + specialization) → 256-dim."),
        
        ("CRITICAL", "No backward() call", "10_BOOTSTRAP_CODE.md",
         "Bootstrap interact() calls model(x) but never calls loss.backward() or optimizer.step(). "
         "Nanos never actually learn. All fitness metrics are based on random initialization noise. "
         "FIX: Add optimizer per nano, compute real loss, call backward()."),
        
        ("CRITICAL", "No data pipeline", "All files",
         "PTAIE produces 3 floats (RBY). Nanos expect 256-dim input tensors. "
         "Nothing converts files/text/images into the tensor format nanos can process. "
         "FIX: Need a chunker/embedder that converts AE data → fixed-size tensors."),
        
        ("HIGH", "FAISS delete is a no-op", "02_NANO_ANATOMY.md",
         "NanoRegistry.remove() deletes from cards dict but cannot remove from FAISS index. "
         "Comment says 'periodic rebuild needed' but no rebuild code exists. "
         "After compression, the index contains dead entries. "
         "FIX: Use faiss.IndexIDMap wrapper or rebuild index after compression."),
        
        ("HIGH", "NanoRegistry.query() is O(N) per result", "02_NANO_ANATOMY.md",
         "After FAISS returns indices, the code does a linear scan of id_to_faiss dict "
         "to reverse-map FAISS indices to GIDs. With 10M nanos, this is N×k lookups. "
         "FIX: Maintain a reverse map faiss_to_gid: Dict[int, str]."),
        
        ("HIGH", "Deposit weight_stats stores scalars not arrays", "10_BOOTSTRAP_CODE.md",
         "compress_nano_to_deposit() stores mean/std as Python floats (float(np.mean(data))). "
         "But deposit_initialized_weights() in 04_DEPOSIT expects arrays (param.normal_(mean=stats['mean'])). "
         "These are incompatible: you can't initialize a [256, 64] weight matrix from a single float. "
         "FIX: Store mean/std per-element or at least per-shape."),
        
        ("HIGH", "SQLite thread safety", "10_BOOTSTRAP_CODE.md",
         "Uses check_same_thread=False with WAL mode. This allows multi-threaded access "
         "but SQLite WAL still has a single-writer limitation. With concurrent nano training "
         "threads all writing to the nanos table, this will cause SQLITE_BUSY errors. "
         "FIX: Use connection pool with retry logic, or batch writes."),
        
        ("MEDIUM", "Glyph 'exact rehydration' claim", "04_DEPOSIT_SYSTEM.md",
         "Claims a glyph pixel (167, 230, 45) can be 'exactly rehydrated' to full deposit data. "
         "An RGB pixel has 24 bits of information. A full deposit has megabytes. "
         "This is physically impossible — it would violate information theory. "
         "FIX: Remove 'exact rehydration' claim. Glyph is a visual hash, not a codec."),
        
        ("MEDIUM", "CONSCIOUSNESS_COUPLING = 1e-6", "01_CORE_PRINCIPLES.md",
         "Declared as a bias term in 'every nano's forward pass' but no nano code uses it. "
         "If it were applied, 1e-6 is below float32 precision for typical activations. "
         "FIX: Either implement it meaningfully or remove it. Current state is a no-op declaration."),
        
        ("MEDIUM", "compute_uniqueness uses 3-dim FAISS search", "11_EVOLUTION.md",
         "Creates a 3-float query vector from RBY coordinates, but NanoRegistry uses "
         "a 256-dim FAISS index. Dimension mismatch will crash. "
         "FIX: Either use a separate 3-dim FAISS index for RBY-space queries, "
         "or embed RBY into the 256-dim space."),
        
        ("LOW", "psutil dependency undeclared", "10_BOOTSTRAP_CODE.md",
         "get_resource_state() imports psutil but it's not in the dependency list. "
         "FIX: Add psutil to requirements."),
    ]
    
    for severity, what, where, description in bugs:
        print(f"\n  [{severity}] {what}")
        print(f"    File: {where}")
        print(f"    {description}")
    
    critical = sum(1 for s, _, _, _ in bugs if s == "CRITICAL")
    high = sum(1 for s, _, _, _ in bugs if s == "HIGH")
    medium = sum(1 for s, _, _, _ in bugs if s == "MEDIUM")
    low = sum(1 for s, _, _, _ in bugs if s == "LOW")
    
    print(f"\n  TOTAL BUGS: {len(bugs)} ({critical} critical, {high} high, {medium} medium, {low} low)")


def main():
    print("\n" + "=" * 70)
    print("  EXPERIMENT 06: PROBLEM CATALOG & MAGIC NUMBER AUDIT")
    print("=" * 70)
    
    test_magic_numbers()
    test_theta_dynamic_range()
    test_fitness_inconsistency()
    test_structural_bugs()
    
    print(f"\n{'=' * 70}")
    print("  EXPERIMENT 06: OVERALL VERDICT")
    print(f"{'=' * 70}")
    print("""
  The framework has a SOUND CORE ARCHITECTURE but is not implementable
  in its current state due to:
  
  1. THREE CRITICAL BLOCKERS:
     - No data pipeline (text → tensor)
     - No actual training (no backward() calls)
     - No nano embeddings (FAISS unusable)
  
  2. MATHEMATICAL EXPLOSIONS:
     - (1+r)^t compounding in WEA (W_P blows up)
     - (1+r)^age compounding in deposits (old deposits dominate absurdly)
     - Theta parameters saturate the sigmoid
  
  3. INCONSISTENCIES:
     - 3 different fitness formulas
     - 2 different UF/IO formulas  
     - 2 different update_rby formulas
     - 2 different seed mutation learning rates
  
  4. METAPHORS POSING AS ARCHITECTURE:
     - "Consciousness coupling" = undefined 1e-6 constant
     - "Light leaking in" = deposit-guided init (real, just rename)
     - "Exact rehydration from glyph" = information-theoretic impossibility
     - "Fractal process identity" = same pseudocode at every level (
       elegant but not automatically executable — needs concrete mapping)
  
  ALL OF THESE ARE FIXABLE. See the patch files for solutions.
""")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
