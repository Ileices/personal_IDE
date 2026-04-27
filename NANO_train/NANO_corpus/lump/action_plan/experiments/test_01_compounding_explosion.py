#!/usr/bin/env python3
"""
EXPERIMENT 01: Compounding Weight Explosion Test
=================================================
Tests whether the WEA formulas (W_P, W_A, T_B) produce bounded, usable values
or blow up to infinity/NaN under realistic operating conditions.

What we test:
  1. W_P(t) = w_p * (1+r) * ((1+r)^t - 1) / r   — personal weight over time
  2. W_A = G * phi * alpha                          — ancestral weight
  3. T_B = log((G*phi*alpha*r)/(w_p*(1+r)) + 1) / log(1+r)  — maturation threshold
  4. Deposit compounding: W_A_dep(age) = alpha * (1+r_dep)^age
  5. Ratio W_A / (W_A + W_P) over time — does the blend ratio stay sane?

EXPECTED FAILURE MODES:
  - W_P at t=500 with r=0.05 => (1.05)^500 ≈ 3.9e10 — catastrophic
  - Deposit W_A at age=200 with r=0.03 => 1.03^200 ≈ 370 — dominates everything
  - T_B for G=200 may exceed nano lifespan
"""

import math
import sys

SEPARATOR = "=" * 70

def wp(t, w_p=0.1, r=0.05):
    """Personal weight at time t (geometric series)."""
    if t == 0 or r == 0:
        return 0.0
    return w_p * (1 + r) * ((1 + r)**t - 1) / r

def wa_ancestral(G, phi, alpha):
    """Ancestral weight (constant for a given nano)."""
    return G * phi * alpha

def t_b(G, phi, alpha, w_p=0.1, r=0.05):
    """Maturation threshold: when W_P surpasses W_A."""
    W_A = wa_ancestral(G, phi, alpha)
    if r <= 0 or w_p <= 0 or W_A <= 0:
        return float('inf')
    inner = (W_A * r) / (w_p * (1 + r)) + 1
    if inner <= 0:
        return float('inf')
    return math.log(inner) / math.log(1 + r)

def deposit_weight(age, alpha=0.01, r_dep=0.03):
    """Deposit compounding weight."""
    return alpha * (1 + r_dep)**age

def ancestral_ratio(W_A, W_P):
    """Fraction of output from ancestral network."""
    total = W_A + W_P
    if total == 0:
        return 1.0
    return W_A / total


def test_wp_growth():
    """Test personal weight growth over many timesteps."""
    print(SEPARATOR)
    print("TEST 1: Personal Weight W_P Growth")
    print(SEPARATOR)
    
    configs = [
        {"w_p": 0.1, "r": 0.05, "label": "Default (w_p=0.1, r=0.05)"},
        {"w_p": 0.1, "r": 0.10, "label": "Aggressive (w_p=0.1, r=0.10)"},
        {"w_p": 0.01, "r": 0.03, "label": "Conservative (w_p=0.01, r=0.03)"},
        {"w_p": 0.5, "r": 0.05, "label": "High base (w_p=0.5, r=0.05)"},
    ]
    
    timesteps = [1, 5, 10, 25, 50, 100, 200, 500, 1000]
    
    for cfg in configs:
        print(f"\n  Config: {cfg['label']}")
        print(f"  {'t':>6} {'W_P':>20} {'log10(W_P)':>12} {'OVERFLOW?':>10}")
        print(f"  {'-'*6} {'-'*20} {'-'*12} {'-'*10}")
        
        for t in timesteps:
            try:
                val = wp(t, cfg["w_p"], cfg["r"])
                if val > 0:
                    log_val = math.log10(val)
                else:
                    log_val = float('-inf')
                overflow = "YES!!!" if val > 1e10 or math.isinf(val) else ("WARN" if val > 1e6 else "OK")
                print(f"  {t:>6} {val:>20.4f} {log_val:>12.2f} {overflow:>10}")
            except OverflowError:
                print(f"  {t:>6} {'OVERFLOW':>20} {'inf':>12} {'FATAL':>10}")
    
    # Verdict
    val_500 = wp(500, 0.1, 0.05)
    print(f"\n  VERDICT: W_P(500, r=0.05) = {val_500:.2e}")
    if val_500 > 1e6:
        print("  >>> CRITICAL: Personal weight EXPLODES. Need a cap or logarithmic growth.")
        return False
    return True


def test_wa_deposit_compounding():
    """Test deposit ancestral weight compounding."""
    print(f"\n{SEPARATOR}")
    print("TEST 2: Deposit Ancestral Weight Compounding")
    print(SEPARATOR)
    
    ages = [0, 1, 5, 10, 25, 50, 100, 200, 500, 1000]
    configs = [
        {"alpha": 0.01, "r": 0.03, "label": "Default (α=0.01, r=0.03)"},
        {"alpha": 0.01, "r": 0.05, "label": "Faster (α=0.01, r=0.05)"},
        {"alpha": 0.1,  "r": 0.03, "label": "Higher base (α=0.1, r=0.03)"},
    ]
    
    for cfg in configs:
        print(f"\n  Config: {cfg['label']}")
        print(f"  {'Age':>6} {'W_A':>20} {'Ratio to age=0':>16} {'STATUS':>10}")
        print(f"  {'-'*6} {'-'*20} {'-'*16} {'-'*10}")
        
        base = deposit_weight(0, cfg["alpha"], cfg["r"])
        for age in ages:
            val = deposit_weight(age, cfg["alpha"], cfg["r"])
            ratio = val / base if base > 0 else 0
            status = "OVERFLOW" if val > 1e6 else ("WARN" if val > 100 else "OK")
            print(f"  {age:>6} {val:>20.6f} {ratio:>16.2f}x {status:>10}")
    
    val_200 = deposit_weight(200, 0.01, 0.03)
    print(f"\n  VERDICT: Deposit W_A at age=200 = {val_200:.4f}")
    print(f"  That's {val_200/0.01:.0f}x the base weight.")
    if val_200 > 10:
        print("  >>> HIGH: Old deposits DOMINATE. Cycle 1 deposit has 370x influence of Cycle 199.")
        print("  >>> This means the ancestral network contribution is almost entirely from ancient data.")
        return False
    return True


def test_tb_maturation():
    """Test T_B under various conditions."""
    print(f"\n{SEPARATOR}")
    print("TEST 3: Maturation Threshold T_B")
    print(SEPARATOR)
    
    print("\n  How many experience steps before personal > ancestral?")
    print(f"  {'G':>5} {'φ':>5} {'α':>6} {'w_p':>5} {'r':>5} {'W_A':>10} {'T_B':>10} {'VERDICT':>12}")
    print(f"  {'-'*5} {'-'*5} {'-'*6} {'-'*5} {'-'*5} {'-'*10} {'-'*10} {'-'*12}")
    
    test_cases = [
        # G,   phi,  alpha, w_p,  r
        (1,    0.5,  0.01,  0.1,  0.05),  # Cycle 1: shallow deposits
        (5,    0.5,  0.01,  0.1,  0.05),  # Cycle 5
        (10,   0.7,  0.05,  0.1,  0.05),  # Cycle 10, enriched
        (50,   0.8,  0.10,  0.1,  0.05),  # Cycle 50, deep deposits
        (100,  0.9,  0.50,  0.1,  0.05),  # Cycle 100, massive
        (200,  0.95, 1.00,  0.1,  0.05),  # Cycle 200, extreme
        (500,  0.99, 2.00,  0.1,  0.05),  # Cycle 500, absurd
        # With higher w_p (faster learning)
        (100,  0.9,  0.50,  1.0,  0.05),  # High base personal weight
        (100,  0.9,  0.50,  0.1,  0.10),  # High compounding rate
        # Edge: very low personal weight
        (50,   0.8,  0.10,  0.01, 0.05),  # Slow learner
    ]
    
    any_exceeded = False
    for G, phi, alpha, w_p_val, r_val in test_cases:
        W_A = wa_ancestral(G, phi, alpha)
        T_B = t_b(G, phi, alpha, w_p_val, r_val)
        
        # Typical nano lifespan in steps (assume ~200 training batches per cycle)
        typical_lifespan = 200
        
        if math.isinf(T_B):
            verdict = "NEVER"
            any_exceeded = True
        elif T_B > typical_lifespan:
            verdict = "EXCEEDS LIFE"
            any_exceeded = True
        elif T_B > typical_lifespan * 0.8:
            verdict = "BARELY"
        else:
            verdict = "OK"
        
        print(f"  {G:>5} {phi:>5.2f} {alpha:>6.3f} {w_p_val:>5.2f} {r_val:>5.2f} {W_A:>10.4f} {T_B:>10.1f} {verdict:>12}")
    
    if any_exceeded:
        print("\n  >>> CRITICAL: Some nanos NEVER MATURE — they're permanently ancestral-dominated.")
        print("  >>> The nano never gets to use its own experience. It's a zombie running on instinct.")
        return False
    return True


def test_blend_ratio_over_time():
    """Test the ancestral/personal blend ratio across a nano's lifetime."""
    print(f"\n{SEPARATOR}")
    print("TEST 4: Blend Ratio W_A/(W_A+W_P) Over Time")
    print(SEPARATOR)
    
    scenarios = [
        {"G": 5, "phi": 0.5, "alpha": 0.01, "w_p": 0.1, "r": 0.05, "label": "Early cycle (G=5)"},
        {"G": 50, "phi": 0.8, "alpha": 0.10, "w_p": 0.1, "r": 0.05, "label": "Mid cycle (G=50)"},
        {"G": 200, "phi": 0.95, "alpha": 1.0, "w_p": 0.1, "r": 0.05, "label": "Deep cycle (G=200)"},
    ]
    
    for s in scenarios:
        W_A = wa_ancestral(s["G"], s["phi"], s["alpha"])
        T_B = t_b(s["G"], s["phi"], s["alpha"], s["w_p"], s["r"])
        
        print(f"\n  Scenario: {s['label']} — W_A={W_A:.4f}, T_B={T_B:.1f}")
        print(f"  {'t':>6} {'W_P':>15} {'Ancestral%':>12} {'Personal%':>12} {'Phase':>12}")
        print(f"  {'-'*6} {'-'*15} {'-'*12} {'-'*12} {'-'*12}")
        
        for t in [0, 1, 5, 10, 25, 50, 100, 200, 500]:
            W_P = wp(t, s["w_p"], s["r"])
            a_pct = ancestral_ratio(W_A, W_P) * 100
            p_pct = 100 - a_pct
            phase = "ANCESTRAL" if a_pct > 50 else ("PERSONAL" if a_pct < 50 else "CROSSOVER")
            if a_pct > 99.9:
                phase = "LOCKED"
            print(f"  {t:>6} {W_P:>15.4f} {a_pct:>11.2f}% {p_pct:>11.2f}% {phase:>12}")


def test_cumulative_deposit_weight():
    """Test what happens when you sum ALL deposit weights across 200 cycles."""
    print(f"\n{SEPARATOR}")
    print("TEST 5: Cumulative Deposit Weight (Sum of All Deposits)")
    print(SEPARATOR)
    
    r_dep = 0.03
    alpha = 0.01
    
    cycles_list = [10, 25, 50, 100, 200, 500]
    
    print(f"\n  How much total W_A weight does a nano born at cycle N inherit?")
    print(f"  (Sum of deposit_weight(age) for age=0 to N-1)")
    print(f"  Config: α={alpha}, r_dep={r_dep}")
    print(f"\n  {'Cycle':>6} {'Total W_A':>15} {'Max single dep':>15} {'% from oldest':>15}")
    print(f"  {'-'*6} {'-'*15} {'-'*15} {'-'*15}")
    
    for N in cycles_list:
        weights = [deposit_weight(age, alpha, r_dep) for age in range(N)]
        total = sum(weights)
        max_w = max(weights) if weights else 0
        oldest_pct = (weights[-1] / total * 100) if total > 0 and weights else 0
        print(f"  {N:>6} {total:>15.4f} {max_w:>15.6f} {oldest_pct:>14.1f}%")
    
    # The G*phi*alpha used in WEA should be this cumulative value
    total_200 = sum(deposit_weight(age, alpha, r_dep) for age in range(200))
    print(f"\n  Total ancestral weight at cycle 200: {total_200:.4f}")
    print(f"  The OLDEST deposit contributes {deposit_weight(199, alpha, r_dep):.4f}")
    print(f"  The NEWEST deposit contributes {deposit_weight(0, alpha, r_dep):.6f}")
    print(f"  Ratio oldest/newest: {deposit_weight(199, alpha, r_dep)/deposit_weight(0, alpha, r_dep):.1f}x")


def test_overflow_boundary():
    """Find the exact values where things overflow float64."""
    print(f"\n{SEPARATOR}")
    print("TEST 6: Float64 Overflow Boundaries")
    print(SEPARATOR)
    
    # (1+r)^t: find t where float64 overflows for various r
    for r in [0.01, 0.03, 0.05, 0.10, 0.20]:
        max_t = 1
        while True:
            try:
                val = (1 + r)**max_t
                if math.isinf(val) or val > 1e300:
                    break
                max_t += 1
            except OverflowError:
                break
        print(f"  r={r:.2f}: (1+r)^t overflows float64 at t≈{max_t}")
        print(f"        At t={min(max_t-1, 10000)}: value = {(1+r)**min(max_t-1, 10000):.2e}")
    
    # W_P overflow
    print(f"\n  W_P(t) overflow boundaries:")
    for r in [0.03, 0.05, 0.10]:
        for w_p_val in [0.01, 0.1, 1.0]:
            t = 1
            while t < 100000:
                try:
                    val = wp(t, w_p_val, r)
                    if math.isinf(val) or val > 1e300:
                        break
                    t += 1
                except OverflowError:
                    break
            print(f"    w_p={w_p_val}, r={r}: W_P exceeds 1e300 at t≈{t}")


def main():
    print("\n" + "=" * 70)
    print("  EXPERIMENT 01: COMPOUNDING WEIGHT EXPLOSION TEST")
    print("=" * 70)
    
    results = {}
    results["wp_growth"] = test_wp_growth()
    results["deposit_compound"] = test_wa_deposit_compounding()
    results["tb_maturation"] = test_tb_maturation()
    test_blend_ratio_over_time()
    test_cumulative_deposit_weight()
    test_overflow_boundary()
    
    print(f"\n{'=' * 70}")
    print("  EXPERIMENT 01: SUMMARY")
    print(f"{'=' * 70}")
    
    failures = [k for k, v in results.items() if not v]
    if failures:
        print(f"\n  FAILURES: {', '.join(failures)}")
        print("\n  ROOT CAUSE ANALYSIS:")
        print("  The compounding formula (1+r)^t is EXPONENTIAL.")
        print("  Any r > 0 eventually produces infinity.")
        print("  ")
        print("  PROPOSED FIXES:")
        print("  1. CAP: W_P = min(w_p * (1+r)^t / r, W_MAX)  — hard ceiling")
        print("  2. LOG: W_P = w_p * log(1 + r*t)              — logarithmic growth")
        print("  3. SIGMOID: W_P = W_MAX * sigmoid(k*(t - t0))  — bounded S-curve")
        print("  4. SOFT CAP: W_P = W_MAX * (1 - exp(-k*t))    — exponential approach")
        print("  ")
        print("  RECOMMENDATION: Option 4 (soft cap) preserves the WEA intuition")
        print("  while guaranteeing W_P ∈ [0, W_MAX]. Set W_MAX = 10 * W_A_max.")
    else:
        print("\n  All tests PASSED (unexpected!)")
    
    return 0 if not failures else 1

if __name__ == "__main__":
    sys.exit(main())
