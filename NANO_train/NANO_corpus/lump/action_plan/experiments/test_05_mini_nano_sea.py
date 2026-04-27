#!/usr/bin/env python3
"""
EXPERIMENT 05: Mini Nano Sea Cycle Test
=======================================
Runs a complete expansion→interaction→compression→mutation loop
using the ACTUAL bootstrap code logic (reimplemented cleanly),
and measures what happens across 20 cycles.

What we test:
  1. Does population decrease with the efficiency ratchet?
  2. Does the seed converge or wander?
  3. Are deposits actually useful for subsequent cycles?
  4. Does the compression triage produce meaningful stratification?
  5. Does fitness actually measure anything real (given dummy training)?
  6. All the magic numbers: do they produce sane behavior?
"""

import math
import sys
import random
import hashlib
import os
import time

try:
    import torch
    import torch.nn as nn
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False

SEPARATOR = "=" * 70


def sigmoid(x):
    return 1.0 / (1.0 + math.exp(-max(-500, min(500, x))))


class RBY:
    def __init__(self, r, b, y):
        s = r + b + y
        self.r = r / s if s > 0 else 0.3333
        self.b = b / s if s > 0 else 0.3333
        self.y = y / s if s > 0 else 0.3334
    
    def as_tuple(self):
        return (self.r, self.b, self.y)


class MiniNano:
    """Simulated nano (no actual neural network for speed)."""
    def __init__(self, gid, nano_type, rby, gen_depth=0, cycle_born=0):
        self.gid = gid
        self.nano_type = nano_type
        self.rby = rby
        self.gen_depth = gen_depth
        self.cycle_born = cycle_born
        self.usage_count = 0
        self.success_count = 0
        self.failure_count = 0
        self._quality = random.gauss(0.5, 0.2)  # Innate quality
    
    @property
    def fitness(self):
        if self.usage_count == 0:
            return 0.5
        sr = self.success_count / max(self.usage_count, 1)
        usage_factor = min(self.usage_count / 100, 1.0)
        rby_balance = 1.0 - abs(self.rby.r - self.rby.b) - abs(self.rby.b - self.rby.y)
        return sr * 0.4 + usage_factor * 0.3 + max(0, rby_balance) * 0.1 + 0.2
    
    def simulate_use(self, deposit_quality=0.0):
        """Simulate usage with success influenced by quality + deposits."""
        self.usage_count += 1
        # Success probability depends on innate quality + deposit bonus
        prob = min(0.95, max(0.05, self._quality + deposit_quality * 0.3))
        if random.random() < prob:
            self.success_count += 1
        else:
            self.failure_count += 1


def compute_uf_io(success_rate, error_rate, complexity):
    """UF/IO dynamics."""
    uf = sigmoid(6.0 * success_rate - 4.0 * error_rate + 0.5 * math.tanh(complexity))
    io = sigmoid(6.0 * error_rate + 6.0 * math.tanh(complexity) - 0.8 * success_rate)
    return uf, io


def update_rby(rby, uf, io, success, error, lr=0.05):
    """Update RBY seed."""
    tension = abs(uf - io)
    new_r = max(1e-4, rby.r + lr * tension * (-1.0))
    new_b = max(1e-4, rby.b + lr * tension * error)
    new_y = max(1e-4, rby.y + lr * tension * success)
    return RBY(new_r, new_b, new_y)


def run_mini_sea(num_cycles=20, initial_pop=100, verbose=True):
    """Run a simplified nano sea for multiple cycles."""
    
    seed_rby = RBY(0.3535, 0.2500, 0.3965)
    all_deposits = []
    deposit_quality = 0.0
    generation_pressure = 1.0
    
    history = []
    
    for cycle in range(num_cycles):
        # === EXPANSION ===
        pop_size = max(5, int(initial_pop * generation_pressure))
        nanos = []
        
        nano_types = ["feature"] * (pop_size // 3) + ["pattern"] * (pop_size // 3) + ["action"] * (pop_size - 2 * (pop_size // 3))
        
        for i, nt in enumerate(nano_types):
            noise_r = random.gauss(0, 0.05)
            noise_b = random.gauss(0, 0.05)
            noise_y = random.gauss(0, 0.05)
            
            nano_rby = RBY(
                seed_rby.r + noise_r + (0.1 if nt == "feature" else -0.05),
                seed_rby.b + noise_b + (0.1 if nt == "pattern" else -0.05),
                seed_rby.y + noise_y + (0.1 if nt == "action" else -0.05),
            )
            
            # Quality bonus from deposits (simulates deposit-guided init)
            quality_bonus = deposit_quality * 0.2
            
            nano = MiniNano(
                gid=hashlib.sha256(f"{cycle}_{i}".encode()).hexdigest()[:12],
                nano_type=nt,
                rby=nano_rby,
                gen_depth=0,
                cycle_born=cycle,
            )
            nano._quality = max(0.1, min(0.95, random.gauss(0.5 + quality_bonus, 0.15)))
            nanos.append(nano)
        
        # === INTERACTION ===
        for nano in nanos:
            uses = random.randint(5, 50)
            for _ in range(uses):
                nano.simulate_use(deposit_quality)
        
        # Compute metrics
        total_usage = sum(n.usage_count for n in nanos)
        total_success = sum(n.success_count for n in nanos)
        success_rate = total_success / max(total_usage, 1)
        error_rate = 1.0 - success_rate
        complexity = len(nanos) / 100.0
        
        uf, io = compute_uf_io(success_rate, error_rate, complexity)
        seed_rby = update_rby(seed_rby, uf, io, success_rate, error_rate)
        
        # === COMPRESSION ===
        nanos.sort(key=lambda n: n.fitness, reverse=True)
        n = len(nanos)
        n_survive = max(1, int(n * 0.10))
        n_compress = int(n * 0.70)
        
        survivors = nanos[:n_survive]
        compressed = nanos[n_survive:n_survive + n_compress]
        destroyed = nanos[n_survive + n_compress:]
        
        # Extract deposits
        cycle_deposits = []
        for nano in compressed:
            deposit = {
                "type": nano.nano_type,
                "rby": nano.rby.as_tuple(),
                "fitness": nano.fitness,
                "success_rate": nano.success_count / max(nano.usage_count, 1),
            }
            cycle_deposits.append(deposit)
        all_deposits.extend(cycle_deposits)
        
        # Update deposit quality (average fitness of compressed nanos)
        if cycle_deposits:
            deposit_quality = sum(d["fitness"] for d in cycle_deposits) / len(cycle_deposits)
        
        # === MUTATION ===
        generation_pressure *= 0.95  # Efficiency ratchet
        
        # Record
        fitnesses = [n.fitness for n in nanos]
        avg_fitness = sum(fitnesses) / len(fitnesses)
        
        record = {
            "cycle": cycle,
            "population": len(nanos),
            "survivors": len(survivors),
            "compressed": len(compressed),
            "destroyed": len(destroyed),
            "deposits_total": len(all_deposits),
            "avg_fitness": avg_fitness,
            "success_rate": success_rate,
            "uf": uf, "io": io,
            "seed_rby": seed_rby.as_tuple(),
            "generation_pressure": generation_pressure,
            "deposit_quality": deposit_quality,
        }
        history.append(record)
    
    return history


def test_efficiency_ratchet():
    """Test that population actually decreases."""
    print(SEPARATOR)
    print("TEST 1: Efficiency Ratchet — Does Population Decrease?")
    print(SEPARATOR)
    
    history = run_mini_sea(num_cycles=20, initial_pop=200)
    
    print(f"\n  {'Cycle':>6} {'Pop':>6} {'Surv':>6} {'Deps':>6} {'AvgFit':>8} {'Success':>8} {'UF':>6} {'IO':>6} {'Pressure':>9}")
    print(f"  {'-'*6} {'-'*6} {'-'*6} {'-'*6} {'-'*8} {'-'*8} {'-'*6} {'-'*6} {'-'*9}")
    
    for h in history:
        print(f"  {h['cycle']:>6} {h['population']:>6} {h['survivors']:>6} {h['deposits_total']:>6} "
              f"{h['avg_fitness']:>8.4f} {h['success_rate']:>8.4f} {h['uf']:>6.3f} {h['io']:>6.3f} {h['generation_pressure']:>9.4f}")
    
    # Check: did population decrease?
    first_pop = history[0]["population"]
    last_pop = history[-1]["population"]
    
    print(f"\n  Population: {first_pop} → {last_pop} ({last_pop/first_pop*100:.0f}% of original)")
    
    if last_pop < first_pop:
        print("  PASS: Population decreased (ratchet works)")
        return True
    else:
        print("  >>> FAIL: Population didn't decrease!")
        return False


def test_fitness_improvement():
    """Test that average fitness improves across cycles (deposit benefit)."""
    print(f"\n{SEPARATOR}")
    print("TEST 2: Fitness Improvement Across Cycles")
    print(SEPARATOR)
    
    history = run_mini_sea(num_cycles=20, initial_pop=200)
    
    early_fitness = sum(h["avg_fitness"] for h in history[:3]) / 3
    late_fitness = sum(h["avg_fitness"] for h in history[-3:]) / 3
    
    print(f"\n  Average fitness (first 3 cycles): {early_fitness:.4f}")
    print(f"  Average fitness (last 3 cycles):  {late_fitness:.4f}")
    print(f"  Improvement: {(late_fitness - early_fitness) / early_fitness * 100:.1f}%")
    
    if late_fitness > early_fitness:
        print("  PASS: Fitness improved (deposits help)")
        return True
    else:
        print("  >>> WARN: Fitness didn't improve (deposits may not be helping)")
        return False


def test_seed_trajectory():
    """Track how the RBY seed moves across cycles."""
    print(f"\n{SEPARATOR}")
    print("TEST 3: Seed RBY Trajectory")
    print(SEPARATOR)
    
    history = run_mini_sea(num_cycles=30, initial_pop=200)
    
    print(f"\n  {'Cycle':>6} {'R':>8} {'B':>8} {'Y':>8} {'Sum':>8} {'Delta':>8}")
    print(f"  {'-'*6} {'-'*8} {'-'*8} {'-'*8} {'-'*8} {'-'*8}")
    
    prev = None
    for h in history:
        r, b, y = h["seed_rby"]
        s = r + b + y
        if prev:
            delta = math.sqrt((r-prev[0])**2 + (b-prev[1])**2 + (y-prev[2])**2)
        else:
            delta = 0.0
        prev = (r, b, y)
        print(f"  {h['cycle']:>6} {r:>8.4f} {b:>8.4f} {y:>8.4f} {s:>8.6f} {delta:>8.6f}")
    
    # Check convergence
    last_5 = [h["seed_rby"] for h in history[-5:]]
    r_range = max(s[0] for s in last_5) - min(s[0] for s in last_5)
    b_range = max(s[1] for s in last_5) - min(s[1] for s in last_5)
    y_range = max(s[2] for s in last_5) - min(s[2] for s in last_5)
    
    print(f"\n  Last 5 cycles — R range: {r_range:.6f}, B range: {b_range:.6f}, Y range: {y_range:.6f}")
    
    total_range = r_range + b_range + y_range
    if total_range < 0.001:
        print("  CONVERGED: Seed reached a fixed point")
    elif total_range < 0.01:
        print("  NEAR-CONVERGED: Seed is stabilizing")
    else:
        print("  >>> WANDERING: Seed hasn't converged after 30 cycles")


def test_compression_stratification():
    """Test that compression triage produces meaningful groups."""
    print(f"\n{SEPARATOR}")
    print("TEST 4: Compression Triage Stratification")
    print(SEPARATOR)
    
    # Create a population with known fitness distribution
    nanos = []
    for i in range(100):
        nano = MiniNano(f"test_{i}", "feature", RBY(0.33, 0.33, 0.34))
        # Assign different usage patterns
        for _ in range(random.randint(1, 100)):
            nano.simulate_use(0.3)
        nanos.append(nano)
    
    nanos.sort(key=lambda n: n.fitness, reverse=True)
    
    n = len(nanos)
    survivors = nanos[:max(1, int(n * 0.10))]
    compressed = nanos[max(1, int(n * 0.10)):max(1, int(n * 0.10)) + int(n * 0.70)]
    destroyed = nanos[max(1, int(n * 0.10)) + int(n * 0.70):]
    
    def group_stats(group, name):
        if not group:
            return
        fits = [n.fitness for n in group]
        srs = [n.success_count / max(n.usage_count, 1) for n in group]
        print(f"\n  {name} ({len(group)} nanos):")
        print(f"    Fitness: min={min(fits):.4f}, max={max(fits):.4f}, avg={sum(fits)/len(fits):.4f}")
        print(f"    Success: min={min(srs):.4f}, max={max(srs):.4f}, avg={sum(srs)/len(srs):.4f}")
    
    group_stats(survivors, "SURVIVORS (top 10%)")
    group_stats(compressed, "COMPRESSED (mid 70%)")
    group_stats(destroyed, "DESTROYED (bot 20%)")
    
    # Check: survivors should be clearly better than destroyed
    surv_fit = sum(n.fitness for n in survivors) / len(survivors)
    dest_fit = sum(n.fitness for n in destroyed) / max(len(destroyed), 1)
    
    print(f"\n  Survivor avg fitness: {surv_fit:.4f}")
    print(f"  Destroyed avg fitness: {dest_fit:.4f}")
    print(f"  Separation: {surv_fit - dest_fit:.4f}")
    
    if surv_fit > dest_fit:
        print("  PASS: Triage produces meaningful stratification")
        return True
    else:
        print("  >>> FAIL: Triage doesn't separate quality from noise")
        return False


def test_deposit_value():
    """Test whether deposits from compressed nanos actually carry useful information."""
    print(f"\n{SEPARATOR}")
    print("TEST 5: Deposit Information Content")
    print(SEPARATOR)
    
    # Run with deposits (normal)
    random.seed(42)
    with_deposits = run_mini_sea(num_cycles=15, initial_pop=200)
    
    # Run without deposit influence
    random.seed(42)
    
    seed_rby = RBY(0.3535, 0.2500, 0.3965)
    no_deposit_history = []
    generation_pressure = 1.0
    
    for cycle in range(15):
        pop_size = max(5, int(200 * generation_pressure))
        nanos = []
        for i in range(pop_size):
            nt = ["feature", "pattern", "action"][i % 3]
            nano = MiniNano(f"nd_{cycle}_{i}", nt, 
                           RBY(seed_rby.r + random.gauss(0, 0.05),
                               seed_rby.b + random.gauss(0, 0.05),
                               seed_rby.y + random.gauss(0, 0.05)))
            nano._quality = max(0.1, min(0.95, random.gauss(0.5, 0.15)))  # NO deposit bonus
            nanos.append(nano)
        
        for nano in nanos:
            for _ in range(random.randint(5, 50)):
                nano.simulate_use(0.0)  # NO deposit influence
        
        total_usage = sum(n.usage_count for n in nanos)
        total_success = sum(n.success_count for n in nanos)
        success_rate = total_success / max(total_usage, 1)
        
        fitnesses = [n.fitness for n in nanos]
        avg_fitness = sum(fitnesses) / len(fitnesses)
        generation_pressure *= 0.95
        
        no_deposit_history.append({
            "cycle": cycle,
            "avg_fitness": avg_fitness,
            "success_rate": success_rate,
        })
    
    print(f"\n  {'Cycle':>6} {'Fit (w/ deposit)':>16} {'Fit (no deposit)':>17} {'Improvement':>12}")
    print(f"  {'-'*6} {'-'*16} {'-'*17} {'-'*12}")
    
    for wd, nd in zip(with_deposits, no_deposit_history):
        improvement = (wd["avg_fitness"] - nd["avg_fitness"]) / nd["avg_fitness"] * 100
        print(f"  {wd['cycle']:>6} {wd['avg_fitness']:>16.4f} {nd['avg_fitness']:>17.4f} {improvement:>11.1f}%")
    
    # Compare final fitness
    final_wd = with_deposits[-1]["avg_fitness"]
    final_nd = no_deposit_history[-1]["avg_fitness"]
    
    print(f"\n  Final fitness with deposits: {final_wd:.4f}")
    print(f"  Final fitness without:      {final_nd:.4f}")
    
    if final_wd > final_nd:
        print("  PASS: Deposits provide measurable benefit")
    else:
        print("  >>> WARN: Deposits don't clearly help (may need better deposit→init pipeline)")


def main():
    print("\n" + "=" * 70)
    print("  EXPERIMENT 05: MINI NANO SEA CYCLE TEST")
    print("=" * 70)
    
    random.seed(42)
    
    results = {}
    results["ratchet"] = test_efficiency_ratchet()
    
    random.seed(42)
    results["fitness_improvement"] = test_fitness_improvement()
    
    random.seed(42)
    test_seed_trajectory()
    
    random.seed(42)
    results["stratification"] = test_compression_stratification()
    
    test_deposit_value()
    
    print(f"\n{'=' * 70}")
    print("  EXPERIMENT 05: SUMMARY")
    print(f"{'=' * 70}")
    
    for name, passed in results.items():
        status = "PASS" if passed else "FAIL"
        print(f"  [{status}] {name}")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
