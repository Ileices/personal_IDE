#!/usr/bin/env python3
"""
EXPERIMENT 02: UF/IO Dynamics Stability Test
=============================================
Tests whether the UF/IO → RBY update loop converges, oscillates, or diverges.

What we test:
  1. UF and IO trajectories over 500 simulated cycles
  2. RBY simplex maintenance (does R+B+Y drift from 1.0?)
  3. Fixed-point analysis: does the system converge?
  4. Sensitivity to theta parameters
  5. Bootstrap vs spec inconsistency (two different update_rby formulas!)

KEY CONCERN: The bootstrap code and spec file have DIFFERENT update_rby:
  - Spec (01_CORE_PRINCIPLES): delta = lr * tension * [-1, error, success]
  - Bootstrap (10_BOOTSTRAP_CODE): new_r = r + lr * tension * (1-r), etc.
  These will produce DIFFERENT trajectories!
"""

import math
import sys

SEPARATOR = "=" * 70

# --- Version 1: From 01_CORE_PRINCIPLES.md ---
def compute_uf_io_spec(success, error, complexity, 
                       theta=(6.0, 4.0, 0.5, 6.0, 6.0, 0.8)):
    """UF/IO as defined in the spec (01_CORE_PRINCIPLES)."""
    alpha, beta, gamma, delta, epsilon, zeta = theta
    def sigmoid(x): return 1.0 / (1.0 + math.exp(-max(-500, min(500, x))))
    
    UF = sigmoid(alpha * success - beta * error + gamma * math.tanh(complexity))
    IO = sigmoid(delta * error + epsilon * math.tanh(complexity) - zeta * success)
    return UF, IO


def update_rby_spec(rby, UF, IO, success, error, lr=0.05):
    """RBY update from 01_CORE_PRINCIPLES (uses success/error directly)."""
    tension = abs(UF - IO)
    plasticity = [-1.0, error, success]  # R drains, B gains on error, Y gains on success
    delta = [lr * tension * p for p in plasticity]
    new_rby = [max(1e-9, rby[i] + delta[i]) for i in range(3)]
    s = sum(new_rby)
    return [v / s for v in new_rby]


# --- Version 2: From 10_BOOTSTRAP_CODE.md ---
def compute_uf_io_bootstrap(success_rate, error_density, complexity,
                            theta=(6.0, 4.0, 0.5, 6.0, 6.0, 0.8)):
    """UF/IO as defined in bootstrap code (slightly different formula!)."""
    alpha, beta, gamma, delta, epsilon, zeta = theta
    def sigmoid(x): return 1.0 / (1.0 + math.exp(-max(-500, min(500, x))))
    
    # NOTE: bootstrap uses gamma directly (not gamma*tanh(complexity))
    # and epsilon*success instead of epsilon*tanh(complexity)
    uf = sigmoid(alpha * success_rate - beta * error_density + gamma)
    io = sigmoid(delta * error_density - epsilon * success_rate + zeta * complexity)
    return uf, io


def update_rby_bootstrap(r, b, y, uf, io, lr=0.05):
    """RBY update from bootstrap code (different formula!)."""
    tension = uf - io  # NOTE: signed, not abs()
    new_r = r + lr * tension * (1.0 - r)
    new_b = b + lr * (-tension) * (1.0 - b)
    new_y = y + lr * abs(tension) * (1.0 - y)
    # Renormalize
    new_r = max(0.01, new_r)
    new_b = max(0.01, new_b)
    new_y = max(0.01, new_y)
    s = new_r + new_b + new_y
    return new_r/s, new_b/s, new_y/s


def test_formula_inconsistency():
    """Show that the two versions produce different results."""
    print(SEPARATOR)
    print("TEST 1: Formula Inconsistency Between Spec and Bootstrap")
    print(SEPARATOR)
    
    test_inputs = [
        (0.8, 0.2, 0.5),  # High success
        (0.2, 0.8, 0.5),  # High error
        (0.5, 0.5, 2.0),  # Balanced, high complexity
        (0.1, 0.1, 0.1),  # Low everything
        (0.9, 0.9, 0.9),  # High everything (contradictory)
    ]
    
    print(f"\n  {'success':>8} {'error':>8} {'cmplx':>8} | {'UF_spec':>8} {'IO_spec':>8} | {'UF_boot':>8} {'IO_boot':>8} | {'UF_diff':>8} {'IO_diff':>8}")
    print(f"  {'-'*8} {'-'*8} {'-'*8} | {'-'*8} {'-'*8} | {'-'*8} {'-'*8} | {'-'*8} {'-'*8}")
    
    max_diff = 0
    for s, e, c in test_inputs:
        uf1, io1 = compute_uf_io_spec(s, e, c)
        uf2, io2 = compute_uf_io_bootstrap(s, e, c)
        diff_uf = abs(uf1 - uf2)
        diff_io = abs(io1 - io2)
        max_diff = max(max_diff, diff_uf, diff_io)
        print(f"  {s:>8.2f} {e:>8.2f} {c:>8.2f} | {uf1:>8.4f} {io1:>8.4f} | {uf2:>8.4f} {io2:>8.4f} | {diff_uf:>8.4f} {diff_io:>8.4f}")
    
    print(f"\n  Max difference: {max_diff:.4f}")
    if max_diff > 0.01:
        print("  >>> INCONSISTENCY CONFIRMED: Spec and Bootstrap compute DIFFERENT UF/IO values!")
        return False
    return True


def test_rby_update_inconsistency():
    """Show that the two update_rby formulas diverge."""
    print(f"\n{SEPARATOR}")
    print("TEST 2: RBY Update Formula Divergence")
    print(SEPARATOR)
    
    rby = [0.3535, 0.2500, 0.3965]  # Primordial seed
    uf, io = 0.75, 0.40  # Expansion-dominant
    success, error = 0.7, 0.3
    
    # Spec version
    rby_spec = update_rby_spec(rby, uf, io, success, error)
    
    # Bootstrap version
    rby_boot = update_rby_bootstrap(rby[0], rby[1], rby[2], uf, io)
    
    print(f"\n  Starting RBY: ({rby[0]:.4f}, {rby[1]:.4f}, {rby[2]:.4f})")
    print(f"  UF={uf}, IO={io}, success={success}, error={error}")
    print(f"\n  Spec update:      ({rby_spec[0]:.4f}, {rby_spec[1]:.4f}, {rby_spec[2]:.4f})  sum={sum(rby_spec):.6f}")
    print(f"  Bootstrap update: ({rby_boot[0]:.4f}, {rby_boot[1]:.4f}, {rby_boot[2]:.4f})  sum={rby_boot[0]+rby_boot[1]+rby_boot[2]:.6f}")
    
    diff = math.sqrt(sum((a-b)**2 for a,b in zip(rby_spec, rby_boot)))
    print(f"\n  Euclidean distance between results: {diff:.6f}")
    
    if diff > 0.01:
        print("  >>> INCONSISTENCY: The two update formulas produce meaningfully different seeds!")
        return False
    return True


def test_convergence_spec(num_steps=500):
    """Run the spec version of UF/IO + RBY update loop for many steps."""
    print(f"\n{SEPARATOR}")
    print(f"TEST 3: Convergence Test (Spec Formula, {num_steps} steps)")
    print(SEPARATOR)
    
    rby = [0.3535, 0.2500, 0.3965]
    
    print(f"\n  {'Step':>6} {'R':>8} {'B':>8} {'Y':>8} {'Sum':>8} {'UF':>8} {'IO':>8} {'|UF-IO|':>8}")
    print(f"  {'-'*6} {'-'*8} {'-'*8} {'-'*8} {'-'*8} {'-'*8} {'-'*8} {'-'*8}")
    
    trajectory = []
    for step in range(num_steps):
        # Simulate: success rate oscillates based on RBY balance
        # Higher Y = more execution = more success
        success = min(0.95, rby[2] * 1.5)
        error = 1.0 - success
        complexity = step / 100.0
        
        uf, io = compute_uf_io_spec(success, error, complexity)
        rby = update_rby_spec(rby, uf, io, success, error)
        s = sum(rby)
        trajectory.append((rby[:], uf, io))
        
        if step % 50 == 0 or step == num_steps - 1:
            print(f"  {step:>6} {rby[0]:>8.4f} {rby[1]:>8.4f} {rby[2]:>8.4f} {s:>8.6f} {uf:>8.4f} {io:>8.4f} {abs(uf-io):>8.4f}")
    
    # Check convergence: did RBY stabilize?
    last_50 = [t[0] for t in trajectory[-50:]]
    r_var = max(x[0] for x in last_50) - min(x[0] for x in last_50)
    b_var = max(x[1] for x in last_50) - min(x[1] for x in last_50)
    y_var = max(x[2] for x in last_50) - min(x[2] for x in last_50)
    
    print(f"\n  Last 50 steps — R range: {r_var:.6f}, B range: {b_var:.6f}, Y range: {y_var:.6f}")
    
    if max(r_var, b_var, y_var) < 1e-4:
        print("  CONVERGED: RBY reached a fixed point.")
        return True
    elif max(r_var, b_var, y_var) < 0.01:
        print("  NEAR-CONVERGED: RBY is still moving but slowly.")
        return True
    else:
        print("  >>> NOT CONVERGED: RBY is still drifting after 500 steps!")
        return False


def test_convergence_bootstrap(num_steps=500):
    """Run the bootstrap version."""
    print(f"\n{SEPARATOR}")
    print(f"TEST 4: Convergence Test (Bootstrap Formula, {num_steps} steps)")
    print(SEPARATOR)
    
    r, b, y = 0.3535, 0.2500, 0.3965
    
    print(f"\n  {'Step':>6} {'R':>8} {'B':>8} {'Y':>8} {'Sum':>8} {'UF':>8} {'IO':>8}")
    print(f"  {'-'*6} {'-'*8} {'-'*8} {'-'*8} {'-'*8} {'-'*8} {'-'*8}")
    
    trajectory = []
    for step in range(num_steps):
        success = min(0.95, y * 1.5)
        error = 1.0 - success
        complexity = step / 100.0
        
        uf, io = compute_uf_io_bootstrap(success, error, complexity)
        r, b, y = update_rby_bootstrap(r, b, y, uf, io)
        trajectory.append(((r, b, y), uf, io))
        
        if step % 50 == 0 or step == num_steps - 1:
            print(f"  {step:>6} {r:>8.4f} {b:>8.4f} {y:>8.4f} {r+b+y:>8.6f} {uf:>8.4f} {io:>8.4f}")
    
    last_50 = [t[0] for t in trajectory[-50:]]
    r_var = max(x[0] for x in last_50) - min(x[0] for x in last_50)
    b_var = max(x[1] for x in last_50) - min(x[1] for x in last_50)
    y_var = max(x[2] for x in last_50) - min(x[2] for x in last_50)
    
    print(f"\n  Last 50 steps — R range: {r_var:.6f}, B range: {b_var:.6f}, Y range: {y_var:.6f}")
    converged = max(r_var, b_var, y_var) < 0.01
    print(f"  {'CONVERGED' if converged else '>>> NOT CONVERGED'}")
    return converged


def test_simplex_drift():
    """Test whether R+B+Y drifts from 1.0 over many iterations."""
    print(f"\n{SEPARATOR}")
    print("TEST 5: Simplex Maintenance (R+B+Y = 1.0)")
    print(SEPARATOR)
    
    rby = [0.3535, 0.2500, 0.3965]
    max_drift = 0.0
    
    for step in range(1000):
        success = min(0.95, rby[2] * 1.5)
        error = 1.0 - success
        complexity = step / 100.0
        uf, io = compute_uf_io_spec(success, error, complexity)
        rby = update_rby_spec(rby, uf, io, success, error)
        
        drift = abs(sum(rby) - 1.0)
        max_drift = max(max_drift, drift)
    
    print(f"\n  After 1000 iterations:")
    print(f"  Max drift from simplex: {max_drift:.2e}")
    print(f"  Final sum: {sum(rby):.15f}")
    
    if max_drift > 1e-10:
        print("  >>> Some drift detected (expected with float arithmetic)")
    else:
        print("  Simplex perfectly maintained")
    
    # Check for negative values
    if any(v < 0 for v in rby):
        print(f"  >>> CRITICAL: Negative RBY value! {rby}")
        return False
    return True


def test_theta_sensitivity():
    """Test how sensitive UF/IO are to theta parameters."""
    print(f"\n{SEPARATOR}")
    print("TEST 6: Theta Parameter Sensitivity")
    print(SEPARATOR)
    
    base_theta = (6.0, 4.0, 0.5, 6.0, 6.0, 0.8)
    param_names = ["alpha(UF_success)", "beta(UF_error)", "gamma(UF_complexity)",
                   "delta(IO_error)", "epsilon(IO_complexity)", "zeta(IO_success)"]
    
    s, e, c = 0.6, 0.3, 1.0
    base_uf, base_io = compute_uf_io_spec(s, e, c, base_theta)
    
    print(f"\n  Base: UF={base_uf:.4f}, IO={base_io:.4f}")
    print(f"  Testing ±50% perturbation of each theta parameter:")
    print(f"\n  {'Parameter':>25} {'UF_low':>8} {'UF_base':>8} {'UF_high':>8} {'IO_low':>8} {'IO_base':>8} {'IO_high':>8}")
    print(f"  {'-'*25} {'-'*8} {'-'*8} {'-'*8} {'-'*8} {'-'*8} {'-'*8}")
    
    for i, name in enumerate(param_names):
        theta_low = list(base_theta)
        theta_high = list(base_theta)
        theta_low[i] *= 0.5
        theta_high[i] *= 1.5
        
        uf_low, io_low = compute_uf_io_spec(s, e, c, theta_low)
        uf_high, io_high = compute_uf_io_spec(s, e, c, theta_high)
        
        print(f"  {name:>25} {uf_low:>8.4f} {base_uf:>8.4f} {uf_high:>8.4f} {io_low:>8.4f} {base_io:>8.4f} {io_high:>8.4f}")
    
    print(f"\n  Note: Sigmoid squashes everything to [0,1].")
    print(f"  With theta values this large (6.0), the sigmoid is near saturation.")
    print(f"  Most of the sigmoid's dynamic range is wasted.")


def test_edge_cases():
    """Test UF/IO with extreme inputs."""
    print(f"\n{SEPARATOR}")
    print("TEST 7: Edge Case Inputs")
    print(SEPARATOR)
    
    cases = [
        (0.0, 0.0, 0.0, "All zeros"),
        (1.0, 0.0, 0.0, "Perfect success, no error"),
        (0.0, 1.0, 0.0, "Total failure"),
        (1.0, 1.0, 0.0, "Contradictory: 100% success AND 100% error"),
        (0.5, 0.5, 100.0, "Extreme complexity"),
        (0.5, 0.5, -1.0, "Negative complexity (invalid)"),
    ]
    
    print(f"\n  {'Scenario':>45} {'UF':>8} {'IO':>8} {'UF+IO':>8} {'Comment':>20}")
    print(f"  {'-'*45} {'-'*8} {'-'*8} {'-'*8} {'-'*20}")
    
    for s, e, c, label in cases:
        uf, io = compute_uf_io_spec(s, e, c)
        total = uf + io
        
        comment = ""
        if total > 1.5:
            comment = "Both high!"
        elif total < 0.5:
            comment = "Both low!"
        elif abs(uf - io) < 0.05:
            comment = "Equilibrium"
        else:
            comment = "OK"
        
        print(f"  {label:>45} {uf:>8.4f} {io:>8.4f} {total:>8.4f} {comment:>20}")
    
    # The contradictory case is important
    uf_contra, io_contra = compute_uf_io_spec(1.0, 1.0, 0.0)
    print(f"\n  >>> Note: success=1.0, error=1.0 is physically impossible")
    print(f"  >>> but the formula doesn't prevent it. UF={uf_contra:.4f}, IO={io_contra:.4f}")
    print(f"  >>> Need input validation: success + error <= 1.0")


def main():
    print("\n" + "=" * 70)
    print("  EXPERIMENT 02: UF/IO DYNAMICS STABILITY TEST")
    print("=" * 70)
    
    results = {}
    results["formula_consistency"] = test_formula_inconsistency()
    results["rby_update_consistency"] = test_rby_update_inconsistency()
    results["convergence_spec"] = test_convergence_spec()
    results["convergence_bootstrap"] = test_convergence_bootstrap()
    results["simplex_drift"] = test_simplex_drift()
    test_theta_sensitivity()
    test_edge_cases()
    
    print(f"\n{'=' * 70}")
    print("  EXPERIMENT 02: SUMMARY")
    print(f"{'=' * 70}")
    
    failures = [k for k, v in results.items() if not v]
    if failures:
        print(f"\n  FAILURES: {', '.join(failures)}")
        print("\n  REQUIRED FIXES:")
        if "formula_consistency" in failures or "rby_update_consistency" in failures:
            print("  1. CANONICALIZE: Pick ONE UF/IO formula and ONE update_rby formula.")
            print("     Use it in ALL files. Delete the other version.")
        if "convergence_spec" in failures or "convergence_bootstrap" in failures:
            print("  2. CONVERGENCE: Add damping or use adaptive lr to ensure convergence.")
        if "simplex_drift" in failures:
            print("  3. SIMPLEX: Force renormalization after every update.")
    else:
        print("\n  All tests PASSED.")
    
    return 0 if not failures else 1

if __name__ == "__main__":
    sys.exit(main())
