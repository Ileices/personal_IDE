# Weighted Reality Theory of Instinct and Development
### A Revised Formal Hypothesis with Experimental and Computational Frameworks

*Revised Draft — 2025*

---

## Abstract

This paper formalizes the Weighted Reality Theory: the proposition that behavioral control is partitioned between phylogenetically-inherited neural programs (instinct) and ontogenetically-accumulated personal experience, with their relative influence governed by a compounding accumulation function. The original formulation is critically revised to correct dimensional inconsistencies in the governing equation, ground parameter values in empirically-known quantities, and sharpen its predictions into directly falsifiable form. A mechanistic substrate grounded in systems consolidation neuroscience is proposed. A matching computational architecture — the Weighted Experience Architecture (WEA) — is re-derived from first principles and benchmarked against existing continual learning paradigms.

---

## 1. Theoretical Motivation and Prior Gaps

Behavioral biology has long distinguished innate fixed action patterns from experientially plastic behaviors, but lacks a quantitative framework for how these two influences trade off across the lifespan. Existing models treat the distinction categorically — a behavior is either "instinctive" or "learned" — which fails to explain the empirical gradient observed in developmental data: the same behavior (e.g. locomotor pattern, predator-avoidance posture, social attachment) shows maximal instinctive expression early in life and progressive modulation by personal experience thereafter.

The original formulation of this theory proposed a correct intuition but contained three specific structural problems that limit its scientific utility:

1. The governing equation mixed additive terms with incompatible units (ancestral "days" and personal "days" were treated as equivalent, ignoring the scale difference between evolutionary and ontogenetic time).
2. The parameter `w_a` (weight per ancestral day) was assigned a value (0.00001) with no grounding in any measurable biological quantity.
3. The behavioral multiplier `m_b` was conceptualized as a fixed scalar, when comparative biology strongly suggests it should be a continuous function of evolutionary age, measurable via clade-level phylogenetic analysis.

The revised formulation below corrects all three problems.

---

## 2. Formal Hypothesis Statement

Instinct is a form of biological memory encoded in neural circuit architecture over evolutionary time. Its influence on behavior at any ontogenetic moment is proportional to the total phylogenetic information load — measured in generations, not days — that has shaped the relevant circuit. Personal experience accumulates influence through a compounding function of elapsed ontogenetic time. The hypothesis predicts a developmentally predictable threshold at which accumulated personal experience outweighs the ancestral prior for any given behavioral domain.

### 2.1 Revised Governing Equation

Let the total behavioral weight `W` for a specific behavioral domain `B` at ontogenetic time `t` (in days) be:

```
W_total(B, t) = [G_B × φ_B × α] + [Σ_{τ=1}^{t} w_p × (1 + r)^τ]
```

| Symbol | Definition and Empirical Grounding |
|--------|-----------------------------------|
| `G_B` | Number of ancestral generations in which behavior B was under selection pressure. Estimable from fossil/phylogenetic record (e.g. bipedal locomotion in *Homo*: ~300,000 generations; quadrupedal locomotion in hominin lineage: ~6,000,000 generations). |
| `φ_B` | Phylogenetic integration coefficient: the fraction of the genome with detected signatures of directional selection for behavior B. Estimable via dN/dS ratios in comparative genomics. Range [0, 1]. |
| `α` | Base ancestral weight per generation per unit integration. Empirically constrained to units of [behavioral probability / generation], making W dimensionless after normalization. |
| `w_p` | Weight per day of personal experience at day 1. Estimated from developmental neuroplasticity literature as proportional to the critical period plasticity index of the relevant cortical region. |
| `r` | Compounding rate of personal experience weight. Proposed to be species-specific and proportional to metabolic rate (empirically accessible via oxygen consumption data). |
| `t` | Ontogenetic age in days from birth (or from onset of independent sensory processing in altricial species). |

### 2.2 Behavioral Control Ratio

The operational prediction of the theory is expressed as the ratio of ancestral to personal weight:

```
R(B, t) = [G_B × φ_B × α] / [Σ_{τ=1}^{t} w_p × (1 + r)^τ]
```

- When `R(B, t) > 1`: ancestral weight dominates; behavior B is predominantly instinctive.
- When `R(B, t) < 1`: personal weight dominates; behavior B is primarily experientially governed.

The threshold time `T_B` at which `R = 1` is the critical developmental transition point for behavior B.

### 2.3 Closed-Form Transition Threshold

Since the personal experience sum is a geometric series, it resolves to:

```
Σ_{τ=1}^{t} w_p × (1+r)^τ = w_p × (1+r) × [(1+r)^t − 1] / r
```

The threshold `T_B` is therefore:

```
T_B = log( [G_B × φ_B × α × r] / [w_p × (1+r)] + 1 ) / log(1+r)
```

This is directly computable given empirical estimates of the four parameters, and yields a specific age prediction (in days) that can be tested against developmental behavioral data.

---

## 3. Proposed Neurological Mechanism

The theory requires a biological substrate capable of (a) preserving ancestral behavioral programs against individual experience and (b) exhibiting the compounding growth function for personal experience. The following mechanism satisfies both constraints.

### 3.1 Ancestral Programs: Subcortical Circuit Crystallization

Behaviors with high `G_B` and `φ_B` are encoded in subcortical circuits (basal ganglia, cerebellum, brainstem pattern generators) that are developmentally specified by highly conserved gene regulatory networks. These circuits reach structural maturity before or shortly after birth in most mammals, making them resistant to postnatal plasticity. Their influence on behavior is therefore approximately constant across the lifespan — the ancestral term in the equation is time-invariant.

**Empirical support:** Newborn locomotor CPG (central pattern generator) activity in decerebrate preparations, neonatal stepping reflex, and the cross-species conservation of spinal cord interneuron topology all confirm subcortical circuit crystallization independent of postnatal experience.

### 3.2 Personal Experience: Cortical-Hippocampal Systems Consolidation

The compounding growth function for personal experience maps onto the well-characterized systems consolidation process, in which memories initially encoded in the hippocampus are progressively transferred to and reinforced within distributed neocortical networks. The key property of systems consolidation relevant to the theory is that consolidation itself strengthens the cortical trace — older memories are more deeply encoded, not weaker. This is precisely the compounding function the theory requires.

The rate `r` corresponds to the time constant of neocortical trace strengthening, which is empirically measurable via longitudinal fMRI studies tracking the cortical:hippocampal activation ratio for the same memory at different retention intervals (Bontempi et al., 1999; Takashima et al., 2009).

### 3.3 Behavioral Output Integration

The behavioral output at any moment is a weighted combination of subcortical (ancestral) and cortico-hippocampal (personal) drive. The corticospinal and corticosubcortical projections provide the anatomical substrate for this weighting: the ratio of cortical descending drive to subcortical ascending drive to premotor areas corresponds functionally to the `R(B,t)` ratio in the model.

---

## 4. Falsifiable Predictions

Each prediction below specifies (1) the observable, (2) the direction of effect, (3) the quantitative constraint imposed by the model, and (4) the condition under which the hypothesis is falsified.

| Prediction | Observable | Model Constraint | Falsification Condition |
|-----------|-----------|-----------------|------------------------|
| **P1:** Age-graded instinct expression | Frequency of quadrupedal locomotor elements in dream recall by age cohort | Sigmoid decay with inflection point at `T_B` (calculable from phylogenetic data) | No significant age effect, or effect does not follow sigmoid form |
| **P2:** Behavior-specific thresholds | `T_B` differs across behavioral domains (locomotion vs. threat response vs. social bonding) | `T_B` proportional to `log(G_B × φ_B)` — ancient behaviors transition later | All behaviors show the same `T_B`, or rank order of `T_B` does not match rank order of evolutionary age |
| **P3:** Enrichment shifts threshold | Organisms reared in enriched environments show earlier `T_B` | `T_B` decreases monotonically with environmental richness (operationalized as sensory input rate) | Enrichment has no effect, or delays rather than advances `T_B` |
| **P4:** Cortical:subcortical ratio tracks R | fMRI activation ratio (cortical/subcortical) for behavior B increases monotonically with age | Ratio crosses 1.0 at age `T_B` | Ratio does not increase with age, or crossing point does not predict behavioral transition |
| **P5:** Species-scaled thresholds | `T_B / lifespan` is constant across mammalian species for homologous behaviors | The ratio `T_B/L` is species-invariant under the model (`r` scales with metabolic rate, which scales inversely with `L`) | Cross-species `T_B/L` ratios differ by more than metabolic rate prediction allows |
| **P6:** Stress-induced regression | Acute severe stress transiently increases instinctive behavioral expression | Effect magnitude proportional to `R(B, t)` — larger in younger subjects | No effect of stress on instinct expression, or effect is age-independent |

---

## 5. Experimental Designs

### 5.1 Dream Content Longitudinal Study *(Primary Test of P1)*

A preregistered longitudinal study using ecological momentary assessment of dream content across age cohorts provides the most direct test of P1.

**Participants:** 800 individuals stratified across age bands: 4–6, 7–9, 10–12, 13–17, 18–25, 26–40, 41–60, 61+ (n=100 per band). Oversampling in the 10–17 range is critical as the model predicts the steepest transition slope here for locomotor behaviors.

**Procedure:** Daily dream journal completed within 10 minutes of waking for 90 days. Standardized coding protocol with inter-rater reliability target κ > 0.80, using two blinded coders. Dreams coded for: (a) locomotion type (bipedal/quadrupedal/hybrid), (b) limb involvement in running, (c) perceived locomotor efficiency, (d) emotional valence.

**Primary analysis:** Mixed-effects logistic regression of P(quadrupedal element) on age (days), with random intercepts for individual. Fit sigmoid model:

```
P(quadrupedal) = 1 / (1 + exp(k × (D_p − T_B)))
```

Extract `T_B` and `k`. Compare `T_B` to model prediction from phylogenetic parameters.

**Model falsification test:** The extracted `T_B` must fall within ±15% of the theoretically predicted `T_B` (calculated from `G_B`, `φ_B` estimates for hominin locomotor evolution) for the hypothesis to be supported. A Bayesian model comparison between the sigmoid model and a null flat model quantifies evidence strength.

### 5.2 Developmental Motor Study *(Test of P2 and P4)*

This study directly compares the transition timelines of two behavioral domains with markedly different `G_B` values: quadrupedal locomotion (`G_B` ~ 6 million generations) versus bipedal posture maintenance (`G_B` ~ 300,000 generations). The theory predicts bipedal posture control transitions to personal experience dominance earlier (lower `T_B`) than quadrupedal locomotor programs, because bipedal posture has fewer ancestral generations of encoding.

**Method:** Kinematic analysis of locomotor and postural control in children aged 2–14 (n=200). Concurrently, longitudinal fMRI (subset n=40) tracking cortical motor vs. subcortical (basal ganglia/cerebellum) activation ratios for each behavioral domain across ages 5, 8, 11, and 14.

**Prediction:** Cortical:subcortical activation ratio for posture control crosses 1.0 at an earlier age than the same ratio for gait pattern generation. The age gap between the two crossings must match the gap predicted by the `T_B` equation given the `G_B` ratio of the two behaviors.

### 5.3 Cross-Species Scaling Study *(Test of P5)*

If `r` scales with metabolic rate (as proposed), then `T_B / lifespan` should be approximately constant across mammalian species for homologous locomotor behaviors, because faster metabolic rate means both faster `r` (compounding) and shorter lifespan, leaving their ratio stable.

**Species:** *Mus musculus* (mouse, lifespan ~2yr), *Macaca mulatta* (rhesus macaque, lifespan ~25yr), *Pan troglodytes* (chimpanzee, lifespan ~45yr), and existing human data.

**Observable:** Age of onset of volitionally controlled bipedal gait (transition from predominantly reflexive to predominantly intentional), expressed as fraction of typical lifespan. Under the hypothesis, this fraction should be approximately equal across species.

**Control:** Ratio should *not* be constant for a behavior with a species-specific `G_B`, providing a within-study falsification control.

---

## 6. Connection to Critical Period Theory

The model generates a precise mechanistic account of critical periods that extends beyond the conventional description. Standard critical period theory identifies periods of heightened plasticity but does not specify what determines when they end. The WEA model proposes that critical periods close when `R(B, t)` crosses 1.0 — that is, when personal experience weight exceeds ancestral weight for that behavior. This implies:

- Critical periods are behavior-specific, with closure timing proportional to `log(G_B × φ_B)`.
- Environmental enrichment that increases `w_p` or `r` (e.g. by increasing the rate of sensory experience) should close critical periods earlier.
- Critical period re-opening, as reported after fluoxetine administration or visual deprivation, corresponds to a temporary reduction in the effective personal weight term — a partial reset of the compounding accumulation.

The last prediction is directly testable: fluoxetine should have larger behavioral rejuvenation effects in subjects who are older (higher accumulated personal weight), and the magnitude of the effect should be proportional to the subject's distance past `T_B`. This is a novel quantitative prediction not derivable from standard critical period models.

---

## 7. Computational Architecture (WEA): Revised Formulation

The original computational section correctly identified the relevance of the theory to continual learning but implemented it using approximations that obscure the key contribution. This section re-derives the Weighted Experience Architecture from the corrected biological model.

### 7.1 The Problem Being Solved

Continual learning systems face a fundamental tradeoff: stability (retaining past knowledge) versus plasticity (updating with new experience). The original theory's compounding weight function implies a novel resolution: rather than treating old and new memories as competing for fixed capacity, old memories gain structural weight over time, making them progressively harder to overwrite — not through explicit replay or regularization penalties, but through the natural dynamics of the compounding accumulation function.

This directly addresses the catastrophic forgetting problem because old experiences asymptotically dominate the personal experience term as they age, without requiring any architectural intervention beyond the weighting function itself.

### 7.2 Architectural Specification

A WEA system consists of two components with dynamically adjusted combination weights:

- **Ancestral network A:** a frozen (or slowly updated) model trained on domain-representative data, analogous to the subcortical crystallized programs. Its contribution weight is fixed at `W_A = G_B × φ_B × α` (a constant for any given task domain).
- **Personal network P:** a model updated by ongoing experience. Its contribution weight at time `t` is `W_P(t) = w_p × (1+r) × [(1+r)^t − 1] / r`, i.e., the closed-form geometric series from Section 2.3.

The combined prediction for any input `x` is:

```
ŷ = [W_A / (W_A + W_P(t))] × A(x) + [W_P(t) / (W_A + W_P(t))] × P(x)
```

### 7.3 Key Departure from Existing Approaches

| System | Treatment of Old Memories |
|--------|--------------------------|
| EWC (Kirkpatrick et al.) | Regularization penalty on weights important for old tasks — old memories protected by gradient interference, not by increased weight. |
| Progressive Neural Networks | Lateral connections from old columns to new — old knowledge accessible but structurally frozen. |
| Gradient Episodic Memory | Experience replay with uniform sampling — old memories persist but do not gain relative influence. |
| **WEA (this work)** | Old personal experiences compound in behavioral weight — they become more influential over time, not merely preserved. This produces the biologically-observed pattern of deepening expertise rather than mere retention. |

### 7.4 Computational Predictions Distinguishing WEA from Baselines

1. **Convergence profile:** WEA should show initially slower adaptation than pure online learning (due to ancestral weight anchoring), but asymptotically superior performance on distribution-shifted inputs (due to ancestral network providing stable prior).
2. **Forgetting resistance:** Unlike EWC, WEA forgetting resistance should increase with experience duration, not with task importance. This is measurable via age-of-training ablation experiments.
3. **Transfer efficiency:** WEA should improve at transfer tasks as personal experience accumulates, because `W_P/W_A` ratio increases and the personal network becomes more generalizable. This is the opposite of most fine-tuning approaches which degrade on the original task.
4. **Phase transition:** WEA behavior should exhibit a detectable inflection point at `t = T_B`, measurable as a change in the slope of performance improvement on novel tasks. This is a unique prediction of the theory with no counterpart in existing continual learning literature.

---

## 8. Acknowledged Limitations and Outstanding Problems

Scientific integrity requires explicit acknowledgment of where the theory is currently underdetermined.

1. The `α` parameter (base ancestral weight per generation per unit integration) has no current empirical estimate. Deriving it requires a bridging assumption between the phylogenetic quantity `G_B × φ_B` and a behavioral probability — this is the theory's primary unresolved quantitative gap.
2. The theory treats `G_B` as a single number per behavior, but most behaviors are modular and involve multiple neural systems with different evolutionary histories. A multi-component extension of the equation that sums over subsystem contributions would be more accurate but substantially increases parameter complexity.
3. The compounding function `(1+r)^t` grows without bound, implying personal experience weight approaches infinity with age. Biologically, this is incorrect — neural plasticity declines sharply in old age. A correction term modeling age-related plasticity decline (perhaps as a logistic upper bound on the personal weight sum) is needed for the model to be valid across the full lifespan.
4. The mapping from `R(B,t)` to neural activation ratios assumes a linear relationship between the behavioral weight ratio and the cortical:subcortical fMRI BOLD ratio, which is an approximation. The neuroimaging predictions in Section 5.2 should be treated as directional, not quantitatively precise, until this mapping is validated.

---

## 9. Summary of Revisions from Original Formulation

| Original Problem | Revised Treatment |
|-----------------|------------------|
| Equation mixes evolutionary days and personal days with same units | Ancestral term uses generations (`G_B`) and phylogenetic integration (`φ_B`); personal term uses ontogenetic days |
| `w_a = 0.00001` with no empirical grounding | `α` constrained to have units of behavioral probability / generation; value left for empirical determination |
| `m_b` as a fixed lookup scalar | `φ_B` as a continuous variable estimable from comparative genomics (dN/dS ratios) |
| No mechanistic substrate proposed | Subcortical circuit crystallization (ancestral) and systems consolidation (personal) proposed as neural mechanism |
| `T_B` stated as an emergent qualitative prediction | `T_B` derived in closed form from model parameters; directly testable against developmental behavioral data |
| Critical periods mentioned but not mechanistically connected | Critical period closure formally identified as `R(B, t) = 1`; novel testable prediction about critical period reopening derived |
| Computational WEA treated as analogy | WEA re-derived from corrected biological equation; four quantitative predictions distinguishing it from EWC, PNN, and GEM specified |
| Forgetting curve described qualitatively | Compounding accumulation function provides quantitative forgetting-resistance prediction testable via age-of-training ablation |

---

## Selected Reference Points for Parameter Estimation

The following sources provide starting estimates for the empirical parameters in the model. Full literature review is required before parameter values are fixed.

- **G_B for hominin locomotor behaviors:** Wood & Collard (1999) phylogenetic analysis of *Homo* locomotion; Bramble & Lieberman (2004) on endurance running evolution.
- **φ_B estimation via dN/dS:** Nielsen et al. (2005) genomic scan for positive selection in humans; Enard et al. (2002) for motor-relevant gene evolution.
- **Systems consolidation time constants (relevant to r):** Bontempi et al. (1999) in rodents; Takashima et al. (2009) in humans (hippocampal:neocortical activation ratio across retention intervals).
- **Critical period plasticity indices (relevant to w_p):** Hensch (2004) review of critical period molecular mechanisms; Bavelier et al. (2010) on enhancing plasticity.
- **Metabolic rate scaling for cross-species r:** Kleiber's law (metabolic rate proportional to body mass^(3/4)) provides a first-order estimate of species differences in `r`.
- **Continual learning baselines for WEA comparison:** Kirkpatrick et al. (2017) EWC; Rusu et al. (2016) Progressive Neural Networks; Lopez-Paz & Ranzato (2017) GEM.