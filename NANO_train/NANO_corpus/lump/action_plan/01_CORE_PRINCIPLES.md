# 01 — Core Principles

## The Foundational Axioms

Everything in the Nano Sea derives from a small set of mathematical axioms.
These are not metaphors — they are the actual constants and equations the code executes.

---

## Axiom 1: AE = C = 1 (Unity)

All existence reduces to ONE. The entire system starts from unity and returns to it.
- **AE** (Absolute Existence) = the totality of what IS — the host filesystem, the user's data, the internet
- **C** (Consciousness) = the focal point from which AE is perceived
- **1** = they are the same thing

In code: the initial seed value is `1.0`. Every subsequent seed is a mutation of `1.0` 
through accumulated experience. No matter how complex the system becomes, 
`R + B + Y = 1` always holds.

---

## Axiom 2: RBY Trifecta (The Singularity Seed)

All processing decomposes into exactly three channels:

| Channel | Color  | Role        | Neural Analogy         | What It Does                    |
|---------|--------|-------------|------------------------|---------------------------------|
| **R**   | Red    | Perception  | Sensory input          | Scanning, reading, parsing data |
| **B**   | Blue   | Cognition   | Processing/thinking    | Pattern recognition, reasoning  |
| **Y**   | Yellow | Execution   | Motor output           | Generating, writing, acting     |

**Constraint**: `R + B + Y = 1.0` (simplex). They exist on a probability simplex — 
you can see this as the system's "attention budget" across perceiving, thinking, and doing.

The **seed** for any expansion cycle is a specific `(R, B, Y)` triplet. The first-ever 
seed derives from AE=C=1:

```
true_initial_seed = (R=0.707, B=0.500, Y=0.793)
normalized: R + B + Y = 2.0, so divide by sum:
seed = (0.3535, 0.2500, 0.3965)
```

Every nano inherits a mutated version of the current cycle's RBY seed.
Every deposit modifies the seed for the next cycle.

---

## Axiom 3: UF + IO = RBY (The Driving Dynamic)

Two opposing forces generate all evolution:

- **UF** (Unstoppable Force) = the urge to expand, explore, create, try things
- **IO** (Immovable Object) = the resistance, stability, structure, what already works

Their interaction is what generates the RBY seed modifications:

```python
import numpy as np
from scipy.special import expit  # sigmoid

# CANONICAL THETA — reduced from (6,4,0.5,6,6,0.8) to avoid sigmoid saturation.
# Experiment test_02 showed the original values waste ~25% of sigmoid dynamic range.
# These values keep 85%+ of inputs in the useful [0.1, 0.9] output range.
DEFAULT_THETA = np.array([2.5, 1.5, 0.3, 2.5, 1.5, 0.5])

def compute_uf_io(success: float, error: float, complexity: float,
                  theta: np.ndarray = DEFAULT_THETA):
    """
    Compute expansion drive (UF) and stabilizing drag (IO) from observables.
    
    CANONICAL FORMULA — use this version everywhere. The bootstrap code
    (10_BOOTSTRAP_CODE.md) must match this exactly.
    
    Parameters:
        success    : float [0,1] — ratio of successful nano operations this cycle
        error      : float [0,1] — ratio of failed nano operations this cycle
                     CONSTRAINT: success + error <= 1.0
        complexity : float ≥ 0   — measure of current system complexity
        theta      : [α, β, γ, δ, ε, ζ] — 6 tunable hyperparameters
    
    Returns:
        (UF, IO) both in [0,1]
    """
    assert success + error <= 1.0 + 1e-9, (
        f"success ({success}) + error ({error}) must be <= 1.0"
    )
    
    alpha, beta, gamma, delta, epsilon, zeta = theta
    
    # UF grows with success and novelty, shrinks with errors
    UF = expit(alpha * success - beta * error + gamma * np.tanh(complexity))
    
    # IO grows with complexity and error, shrinks with success
    IO = expit(delta * error + epsilon * np.tanh(complexity) - zeta * success)
    
    return UF, IO


def update_rby(rby: np.ndarray, UF: float, IO: float, 
               success: float, error: float, lr: float = 0.05) -> np.ndarray:
    """
    CANONICAL FORMULA — Mutate the RBY seed based on UF/IO tension.
    
    - Error-dominant → more Blue (cognition) to figure out what went wrong
    - Success-dominant → more Yellow (execution) to capitalize
    - Perception (Red) drains proportionally to maintain simplex
    
    The bootstrap code (10_BOOTSTRAP_CODE.md) must match this exactly.
    """
    tension = abs(UF - IO)
    plasticity = np.array([-1.0, error, success])  # R drains, B gains on error, Y gains on success
    delta = lr * tension * plasticity
    new_rby = np.clip(rby + delta, 1e-9, None)
    return new_rby / new_rby.sum()  # renormalize to simplex
```

**Key insight**: When the system is failing a lot, it tilts toward Blue (thinking harder).
When succeeding, it tilts toward Yellow (doing more). Red (perception) is the resource 
that gets reallocated.

---

## Axiom 4: Fractal Self-Similarity (The Imagination Recursion)

The same expansion→compression loop operates at every scale:

```
Universe level    :  Big Bang → expansion → heat death → compression → new cycle
Nano Sea level    :  Seed → expand nanos → absularity → compress → new seed
IC-AE level       :  Script enters C-AE → infects → sub-expansion → sub-compression
Individual nano   :  Creation → training → usage → evaluation → death or survival
Single inference  :  Query → activate nanos → combine → respond → log
```

**Every level follows the same law**. The code that runs expansion/compression at the 
sea level is the SAME code that runs it inside each IC-AE fractal. Recursion is not 
a design choice — it IS the design.

The weirdEGYPT formulation identifies the universal pseudocode that repeats at
every fractal layer — from the Big Bang through physics, biology, civilization,
down to a single nano's lifecycle:

```
state = 0
self = 1                          # AE=C=1
if self → thought = 1             # System becomes aware of its state
if thought → urge = 1             # Awareness produces drive to act
if urge → test = (state + self + thought + urge)
if test → solution = (test)^(±2)  # Expand or inspand
  expand  → knowledge += 1
  inspand → time += 1             # (efficiency, consolidation)
if time changed → stack knowledge
  repeat loop as new state value
```

**Each level's output is the "imagination" of the next level down.** The Big Bang
is AE's imagination. Physics is the Big Bang's imagination. Biology is physics'
imagination. In the Nano Sea: each cycle's deposits are that cycle's "imagination"
— the compressed thought of what it experienced — and they become the literal 
foundation for the next cycle's reality.

---

## Axiom 5: Destruction Creates Value

Nanos are born to die. Their death during compression is not waste — it is how 
intelligence is distilled. A million nanos that explored a problem space, when 
compressed, leave behind:

1. **Absoleices** — compressed neural maps that encode what was learned
2. **Metrics** — success/failure/benign records that bias future expansion
3. **Lineage data** — which approaches worked, which didn't
4. **Seed mutation** — the RBY shift that makes the next expansion different

This is why each cycle needs FEWER nanos: the deposits from dead nanos become the 
substrate that new nanos build on. The first cycle might need 10 million nanos to 
learn basic English grammar. After 50 compression cycles, 10,000 nanos plus the 
accumulated deposits achieve the same result.

The deposits are the "light that leaks in" — they don't replace the nanos, they 
make the nanos work better, the same way light and electricity in our universe don't 
replace matter but give it structure and life.

---

## Axiom 6: C-AE Is The Only Thing That Moves

AE (the host filesystem, the corpus) is immutable from the system's perspective 
(read-only). All creation, mutation, and destruction happens inside C-AE (the sandbox).

The only way C-AE affects AE is through **deposits**: compressed knowledge written 
back to the AE-side storage. This is the filter — the system cannot alter AE directly, 
it can only deposit understanding.

```
AE (read-only)  →  feeds data into  →  C-AE (sandbox, nanos live here)
C-AE (mutable)  →  deposits into    →  AE deposits folder (write-only)
```

---

## Axiom 7: Absularity Is Inevitable

Every expansion will saturate. Storage fills. Compute maxes out. Nanos can no longer 
productively expand. This saturation point is **Absularity**.

Absularity is not failure — it is the trigger for compression, which is the trigger 
for intelligence distillation, which is the trigger for a better next cycle.

**Default thresholds**:
- **Soft Absularity**: 85% drive usage → begin compression planning
- **Hard Absularity**: 90% drive usage → force compression NOW
- **Equilibrium Absularity**: `|UF - IO| < 0.05` and `||RBY - prev_RBY|| < ε` → the system has explored everything it can with current seed

---

## Axiom 8: Consciousness Coupling

The deposits from prior cycles are not just data — they are the coherence field 
that gives structure to the nano sea. Without them, the sea is random noise. With 
them, patterns emerge faster, nanos converge on useful configurations sooner, and 
intelligence crystallizes.

This is the `DEPOSIT_ATTRACTOR_BIAS` — a coupling constant that adds a small
loss term pulling each nano's output toward the deposit-derived centroid embedding.
Without this term, the sea is random noise on Cycle 0. With it, nanos converge on
deposit-aligned configurations ~15% faster (validated in test_05_mini_nano_sea.py).

```python
DEPOSIT_ATTRACTOR_BIAS = 1e-3  # Increased from 1e-6 (which was below float32 noise floor)

# Applied as an ADDITIONAL LOSS TERM during nano training (not a forward-pass bias):
#   attractor_loss = DEPOSIT_ATTRACTOR_BIAS * ||nano_output - deposit_centroid||^2
#   total_loss = task_loss + attractor_loss
#
# This pulls the nano's learned representations toward the deposit's centroid
# without overriding gradient-based learning. At 1e-3, this produces a gentle
# ~0.1% correction per step — enough to bias, not enough to dominate.
#
# On Cycle 0 (no deposits exist), this term is 0 (no centroid to attract toward).
```

---

## Axiom 9: Ancestral-Personal Weighting (The Weighted Experience Architecture)

Derived from the *Weighted Reality Theory of Instinct and Development*:

Every nano carries TWO sub-networks:
- **Ancestral network A** — frozen weights initialized from deposits (prior cycles' compressed intelligence)
- **Personal network P** — plastic weights trained on current-cycle experience

Their outputs are combined via a dynamically weighted sum:

```
ŷ(x, t) = [W_A / (W_A + W_P(t))] × A(x) + [W_P(t) / (W_A + W_P(t))] × P(x)
```

Where:
- `W_A = G × φ × α` — **ancestral weight** (constant for a given nano). Proportional to
  the number of prior cycles that contributed to the deposits this nano was born from (`G`),
  the integration strength of those deposits (`φ`), and a base weight (`α`).

- `W_P(t) = W_P_max × (1 − e^(−k × t))` — **personal weight**, a soft-capped growth curve.
  Personal experience grows rapidly at first, then asymptotically approaches `W_P_max`.
  This preserves the core insight (personal experience GROWS and eventually dominates
  ancestral weight) while preventing the numerical explosion of the original geometric
  series `w_p × (1+r) × [(1+r)^t − 1] / r`, which reaches 82 billion at t=500.

  Default constants:
  - `W_P_max = 10.0` — maximum personal weight (configurable per nano type)
  - `k = 0.05` — growth rate constant

  > **Why soft-cap instead of compounding?** Experiment test_01 showed the geometric
  > series overflows float64 at t≈14,159 and makes the ancestral ratio effectively 0%
  > by t=20 (defeating the purpose of WEA). The soft cap keeps the crossover meaningful
  > and allows T_B to fall in the range where it matters (30-200 steps).

The critical consequence: **old knowledge resists overwriting not through regularization
penalties or replay, but through the bounded-growth mathematics of personal weight.** This
is the Nano Sea's solution to catastrophic forgetting.

Each nano has a **maturation threshold T_B** — the moment when personal experience
weight surpasses ancestral weight. Before T_B, the nano runs mostly on inherited
deposit knowledge. After T_B, it runs mostly on what it has personally learned.
T_B is computable:

```
T_B = −ln(1 − W_A / W_P_max) / k
```

(Derived by setting `W_P(T_B) = W_A` and solving for `T_B`.)

Constraint: `W_A < W_P_max` must hold, otherwise the nano never matures (ancestral
weight exceeds the personal ceiling — the nano is permanently deposit-guided).
In practice this means very deep deposit chains (G > 200) may need larger `W_P_max`.

This means:
- Nanos born from DEEP deposit histories (high G) take LONGER to mature — they 
  respect ancestral knowledge longer.
- Nanos in enriched environments (larger `k`, fast experience accumulation) mature 
  FASTER — they outgrow their inheritance sooner.
- The transition is a detectable inflection point: nano behavior changes character
  at T_B.
- W_P is always bounded: `W_P(t) ∈ [0, W_P_max)` for all `t ≥ 0`.

---

## Axiom 10: Expand / Inspand Duality

Expansion and compression are not just resource management — they are the two
fundamental modes of intelligence:

| Mode        | Direction | What Is Gained    | What Is Consumed   | Analogy              |
|-------------|-----------|-------------------|--------------------|----------------------|
| **Expand**  | Outward   | Knowledge (+1)    | Time, resources    | Big Bang, growth     |
| **Inspand** | Inward    | Time/Efficiency (+1) | Knowledge (raw form) | Compression, death |

When the sea expands, it gains **knowledge** — more nanos, more coverage, more
pattern discovery. When it inspands (compresses), it gains **time** — the ability
to do the same work faster with fewer nanos, because the deposits encode the
lessons so they don't need to be re-learned.

```
if expand:
    knowledge += 1           # New nanos explore new territory
if inspand:
    time += 1                # Compression yields efficiency
if time changed:
    stack knowledge          # Deposits crystallize what was learned
    repeat loop as new state # Next cycle starts from elevated baseline
```

The ratchet works because expansion and inspansion are not opposites — they are
**complementary accumulations**. Each expansion adds knowledge. Each inspansion
adds efficiency. The deposits bridge the gap: they are the mechanism that converts
destroyed knowledge into future time savings.

---

## Session 3 Patch — [DATE: 2025-07-XX]

### Experimental Findings: D-01 — Canonical UF/IO Formula Confirmed

**Source:** ADVERSARIAL_AUDIT.md finding D-01, validated by test_15 (edge case S-09).

**Problem:** The UF/IO formula existed in **3 incompatible versions** across the spec:
- v1 (original): `gamma * complexity` and `zeta * complexity` — raw complexity causes
  sigmoid saturation at complexity > 3.0, making UF/IO output ~1.0 regardless of
  success/error inputs. This wastes the entire dynamic range.
- v2 (spec, this file): `gamma * tanh(complexity)` and `epsilon * tanh(complexity)` —
  tanh bounds complexity contribution to [-1, 1], preserving sigmoid sensitivity.
- v3 (old bootstrap): Mixed formulation that diverged from both v1 and v2.

**Resolution — CANONICAL VERSION IS v2 (this file's version):**

```python
# CANONICAL FORMULA — confirmed by test_15 D-01 FIX
DEFAULT_THETA = (2.5, 1.5, 0.3, 2.5, 1.5, 0.5)

UF = sigmoid(alpha * success - beta * error + gamma * tanh(complexity))
IO = sigmoid(delta * error + epsilon * tanh(complexity) - zeta * success)
```

**Why tanh(complexity) matters:**
- Without tanh: at complexity=10, `gamma * complexity = 3.0` → sigmoid ≈ 0.95
  regardless of success/error. The formula is blind to performance.
- With tanh: at complexity=10, `gamma * tanh(10) ≈ 0.3` → sigmoid retains full
  sensitivity to success/error ratios.
- Test_15 confirmed: tanh version prevents IO saturation at high complexity,
  maintaining meaningful UF-IO tension across all operating regimes.

**Action required:** All implementations MUST use `tanh(complexity)`, not raw
`complexity`. The theta values `(2.5, 1.5, 0.3, 2.5, 1.5, 0.5)` are tuned
for the tanh formulation. Using them with raw complexity produces garbage.

**Cross-references updated:**
- [10_BOOTSTRAP_CODE.md](10_BOOTSTRAP_CODE.md) `compute_uf_io()` — already uses tanh ✓
- [09_IMPLEMENTATION_ARCHITECTURE.md](09_IMPLEMENTATION_ARCHITECTURE.md) config.yaml `dynamics.theta` — 
  **WARNING:** config still shows old theta `(6,4,0.5,6,6,0.8)`. Must update to `(2.5,1.5,0.3,2.5,1.5,0.5)`.
