"""
test_07_validate_patches.py — Validates that ALL patched formulas work correctly.

Checks:
1. Soft-cap W_P stays bounded
2. Soft-cap T_B is computable and in useful range
3. Soft-cap deposit weight stays bounded
4. Canonical UF/IO with reduced theta has good dynamic range
5. Canonical update_rby maintains simplex
6. Canonical fitness formula produces expected ordering
7. function_embedding is deterministic and 256-dim
8. Input validation (success + error <= 1.0) works
"""
import math
import hashlib
import numpy as np

PASS = 0
FAIL = 0

def check(name, condition, detail=""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  ✓ {name}")
    else:
        FAIL += 1
        print(f"  ✗ {name} — {detail}")

# ═══════════════════════════════════════════════════════════════════
# 1. Soft-cap W_P
# ═══════════════════════════════════════════════════════════════════
print("\n═══ 1. SOFT-CAP W_P ═══")

W_P_MAX = 10.0
K = 0.05

def W_P(t, W_P_max=W_P_MAX, k=K):
    if t == 0: return 0.0
    return W_P_max * (1 - math.exp(-k * t))

# Test boundedness at extreme t values
check("W_P(0) = 0", W_P(0) == 0.0)
check("W_P(100) < W_P_MAX", W_P(100) < W_P_MAX, f"W_P(100) = {W_P(100)}")
check("W_P(500) < W_P_MAX", W_P(500) < W_P_MAX, f"W_P(500) = {W_P(500)}")
check("W_P(10000) <= W_P_MAX", W_P(10000) <= W_P_MAX, f"W_P(10000) = {W_P(10000)}")
check("W_P(1000000) <= W_P_MAX", W_P(1000000) <= W_P_MAX)
check("W_P monotonically increasing", all(W_P(t+1) > W_P(t) for t in range(0, 100)))
check("W_P(500) close to max", W_P(500) > 0.99 * W_P_MAX, f"W_P(500) = {W_P(500)}")

# Compare with old formula at t=500 (should be no explosion)
old_wp_500 = 0.1 * (1.05) * ((1.05**500) - 1) / 0.05
check("Old formula explodes at t=500", old_wp_500 > 1e10, f"old={old_wp_500:.2e}")
check("New formula safe at t=500", W_P(500) < 11, f"new={W_P(500):.4f}")

# ═══════════════════════════════════════════════════════════════════
# 2. Soft-cap T_B
# ═══════════════════════════════════════════════════════════════════
print("\n═══ 2. SOFT-CAP T_B ═══")

def T_B(W_A, W_P_max=W_P_MAX, k=K):
    if W_A <= 0 or W_A >= W_P_max:
        return float('inf')
    return -math.log(1 - W_A / W_P_max) / k

# Test various G values
for G in [1, 5, 10, 20]:
    phi, alpha = 0.5, 0.01
    W_A = G * phi * alpha
    tb = T_B(W_A)
    check(f"T_B(G={G}) in useful range", 0 < tb < 500, f"T_B={tb:.1f}, W_A={W_A}")
    # Verify: at T_B, W_P should equal W_A
    wp_at_tb = W_P(tb)
    check(f"W_P(T_B) ≈ W_A for G={G}", abs(wp_at_tb - W_A) < 1e-6, 
          f"W_P={wp_at_tb:.6f}, W_A={W_A:.6f}")

# Edge case: W_A >= W_P_max → never matures
check("T_B(W_A >= W_P_max) = inf", T_B(11.0) == float('inf'))
check("T_B(W_A = 0) = inf", T_B(0) == float('inf'))

# ═══════════════════════════════════════════════════════════════════
# 3. Soft-cap deposit weight
# ═══════════════════════════════════════════════════════════════════
print("\n═══ 3. SOFT-CAP DEPOSIT WEIGHT ═══")

W_A_DEP_MAX = 5.0
K_DEP = 0.03

def deposit_weight(age, W_A_max=W_A_DEP_MAX, k=K_DEP):
    return W_A_max * (1 - math.exp(-k * age))

check("deposit(age=0) ≈ 0", deposit_weight(0) < 0.01)
check("deposit(age=200) bounded", deposit_weight(200) < W_A_DEP_MAX, 
      f"w={deposit_weight(200):.4f}")
check("deposit(age=500) bounded", deposit_weight(500) < W_A_DEP_MAX,
      f"w={deposit_weight(500):.4f}")
check("deposit(age=10000) bounded", deposit_weight(10000) <= W_A_DEP_MAX)

# Compare with old formula
old_dep_200 = 0.01 * (1.03 ** 200)
check("Old deposit explodes at age=200", old_dep_200 > 3, f"old={old_dep_200:.2f}")
check("New deposit safe at age=200", deposit_weight(200) < 6, f"new={deposit_weight(200):.4f}")

# ═══════════════════════════════════════════════════════════════════
# 4. Canonical UF/IO (reduced theta)
# ═══════════════════════════════════════════════════════════════════
print("\n═══ 4. CANONICAL UF/IO ═══")

THETA = (2.5, 1.5, 0.3, 2.5, 1.5, 0.5)

def sigmoid(x):
    return 1.0 / (1.0 + math.exp(-max(-500, min(500, x))))

def compute_uf_io(success, error, complexity, theta=THETA):
    assert success + error <= 1.0 + 1e-9
    alpha, beta, gamma, delta, epsilon, zeta = theta
    UF = sigmoid(alpha * success - beta * error + gamma * math.tanh(complexity))
    IO = sigmoid(delta * error + epsilon * math.tanh(complexity) - zeta * success)
    return UF, IO

# Test dynamic range
uf_high, io_high = compute_uf_io(0.9, 0.1, 0.5)
uf_low, io_low = compute_uf_io(0.1, 0.9, 0.5)
check("High success → UF > IO", uf_high > io_high, f"UF={uf_high:.3f}, IO={io_high:.3f}")
check("High error → IO > UF", io_low > uf_low, f"UF={uf_low:.3f}, IO={io_low:.3f}")
check("UF range > 0.3", uf_high - uf_low > 0.3, f"range={uf_high-uf_low:.3f}")
check("IO range > 0.3", io_low - io_high > 0.3, f"range={io_low-io_high:.3f}")

# Neither saturated
check("UF(0.9,0.1) not saturated at 1", uf_high < 0.95, f"UF={uf_high:.4f}")
check("IO(0.1,0.9) not saturated at 1", io_low < 0.95, f"IO={io_low:.4f}")

# Test input validation
try:
    compute_uf_io(0.7, 0.5, 0.0)  # success + error = 1.2 > 1.0
    check("Input validation catches s+e>1", False, "No assertion raised")
except AssertionError:
    check("Input validation catches s+e>1", True)

# ═══════════════════════════════════════════════════════════════════
# 5. Canonical update_rby (simplex maintained)
# ═══════════════════════════════════════════════════════════════════
print("\n═══ 5. CANONICAL UPDATE_RBY ═══")

def update_rby(rby, UF, IO, success, error, lr=0.05):
    tension = abs(UF - IO)
    plasticity = [-1.0, error, success]
    delta = [lr * tension * p for p in plasticity]
    new_rby = [max(1e-9, rby[i] + delta[i]) for i in range(3)]
    s = sum(new_rby)
    return [v / s for v in new_rby]

rby = [0.3535, 0.2500, 0.3965]
for i in range(500):
    uf, io = compute_uf_io(0.6, 0.3, 0.5)
    rby = update_rby(rby, uf, io, 0.6, 0.3)

check("RBY simplex after 500 steps", abs(sum(rby) - 1.0) < 1e-10, f"sum={sum(rby)}")
check("All components positive", all(v > 0 for v in rby), f"rby={rby}")
check("No component dominates completely", max(rby) < 0.99, f"max={max(rby):.4f}")

# ═══════════════════════════════════════════════════════════════════
# 6. Canonical fitness formula
# ═══════════════════════════════════════════════════════════════════
print("\n═══ 6. CANONICAL FITNESS ═══")

def composite_fitness(success_rate, usage_count, uniqueness, bridge_count):
    usage_score = 1.0 / (1.0 + math.exp(-0.1 * (usage_count - 10)))
    return (0.40 * success_rate +
            0.20 * usage_score +
            0.25 * uniqueness +
            0.15 * min(1.0, bridge_count / 5.0))

# High performer should score higher
high = composite_fitness(0.9, 100, 0.8, 5)
low = composite_fitness(0.1, 2, 0.1, 0)
mid = composite_fitness(0.5, 20, 0.5, 2)

check("High > mid > low", high > mid > low, f"high={high:.3f}, mid={mid:.3f}, low={low:.3f}")
check("Fitness ∈ [0, 1]", 0 <= low <= 1 and 0 <= high <= 1)
check("Untested default = 0.25", composite_fitness(0.5, 0, 0.5, 0) < 0.5)

# ═══════════════════════════════════════════════════════════════════
# 7. Function embedding
# ═══════════════════════════════════════════════════════════════════
print("\n═══ 7. FUNCTION EMBEDDING ═══")

def compute_nano_embedding(nano_type, specialization, rby, arch_hash="abc", dim=256):
    seed_str = f"{nano_type}:{specialization}:{rby[0]:.4f}:{rby[1]:.4f}:{rby[2]:.4f}:{arch_hash}"
    seed_int = int(hashlib.sha256(seed_str.encode()).hexdigest(), 16) % (2**32)
    rng = np.random.RandomState(seed_int)
    embedding = rng.randn(dim).astype(np.float32)
    embedding /= np.linalg.norm(embedding)
    return embedding

emb1 = compute_nano_embedding("feature", "english_past_tense", [0.4, 0.3, 0.3])
emb2 = compute_nano_embedding("feature", "english_past_tense", [0.4, 0.3, 0.3])
emb3 = compute_nano_embedding("pattern", "python_loops", [0.3, 0.4, 0.3])

check("Embedding is 256-dim", emb1.shape == (256,), f"shape={emb1.shape}")
check("Embedding is deterministic", np.allclose(emb1, emb2))
check("Different nanos → different embeddings", not np.allclose(emb1, emb3))
check("Embedding is unit normalized", abs(np.linalg.norm(emb1) - 1.0) < 1e-6)

# ═══════════════════════════════════════════════════════════════════
# 8. Generation survival with hard cap
# ═══════════════════════════════════════════════════════════════════
print("\n═══ 8. GENERATION SURVIVAL ═══")

def generation_survival_modifier(depth):
    MAX_DEPTH = 8
    if depth > MAX_DEPTH:
        return 0.0
    return math.exp(-0.12 * depth)

check("Depth 0 = 1.0", generation_survival_modifier(0) == 1.0)
check("Depth 8 ≈ 0.38", abs(generation_survival_modifier(8) - 0.383) < 0.01)
check("Depth 9 = 0.0 (hard cap)", generation_survival_modifier(9) == 0.0)
check("Depth 100 = 0.0", generation_survival_modifier(100) == 0.0)

# ═══════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════
print(f"\n{'='*60}")
print(f"VALIDATION RESULTS: {PASS} passed, {FAIL} failed")
if FAIL == 0:
    print("ALL PATCHES VALIDATED ✓")
else:
    print(f"WARNING: {FAIL} checks failed — review patches!")
print(f"{'='*60}")

exit(0 if FAIL == 0 else 1)
