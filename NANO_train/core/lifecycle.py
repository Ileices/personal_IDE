"""
Lifecycle Manager — 45-step state machine.
Birth(1-9) → Life(10-18) → Maturity(19-23) → Absularity(24-27) →
Compression(28-33) → Death/Rebirth(34-40) → Resurrection(41-45)
"""
from __future__ import annotations
import time
import logging
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any, Callable
from enum import Enum, auto

log = logging.getLogger("lifecycle")


class LifecycleState(Enum):
    # Birth (Expansion Phase)
    TRIGGER = auto()           # Step 1: New data enters AE
    SEED_CALC = auto()         # Step 2: SeedGenerator scans AE
    EXPANSION_START = auto()   # Step 3: Big Bang begins
    IC_AE_INFECTION = auto()   # Step 4: Data chunks spawn child IC-AEs
    NANO_CREATION = auto()     # Step 5: Specialized nanos created
    RBY_ASSIGNMENT = auto()    # Step 6: Each nano gets RBY weight
    PTAIE_TAGGING = auto()     # Step 7: PTAIE vectors assigned
    RIPPLE_ACTIVATION = auto() # Step 8: Nanos activate adjacent nanos
    VOLUME_TRACKING = auto()   # Step 9: V_AEc(t) monitored

    # Life (Active Phase)
    TRAINING = auto()          # Step 10: Nanos train on data chunks
    IC_AE_RECURSION = auto()   # Step 11: Recursive IC-AE spawning
    META_TRAINING = auto()     # Step 12: TrainingStrategyNano learns from training
    INFERENCE = auto()         # Step 13: Serve user queries via ripple
    MEMORY_FORMATION = auto()  # Step 14: Store successful patterns
    ASSOCIATION = auto()       # Step 15: Link related nanos
    FITNESS_TRACKING = auto()  # Step 16: Monitor nano performance
    ORCHESTRATION = auto()     # Step 17: Coordinate collaboration
    INDEX_UPDATES = auto()     # Step 18: Maintain fast lookups

    # Maturity (Peak Performance)
    SPECIALIZATION = auto()    # Step 19: Nanos become domain experts
    COLLABORATION = auto()     # Step 20: Seamless multi-nano work
    REDUNDANCY = auto()        # Step 21: Multiple nanos handle similar tasks
    EVOLUTION = auto()         # Step 22: Superior outcompete inferior
    GROWTH_PLATEAU = auto()    # Step 23: dV/dt approaches zero

    # Absularity Detection (Λ)
    DETECTOR_TRIGGERS = auto() # Step 24: dV/dt < -ε, d²V/dt² < 0, LP-MD ≤ -η
    ABSULARIS_SNAPSHOT = auto()# Step 25: Σ* captured
    EXPANSION_HALTS = auto()   # Step 26: No new nanos created
    COMPRESSION_BEGINS = auto()# Step 27: Enter compression phase

    # Compression Phase
    DEEP_LEARNING = auto()     # Step 28: Cross-analyze IC-AE hierarchies
    FITNESS_EVAL = auto()      # Step 29: FitnessNano ranks all nanos
    PRUNING = auto()           # Step 30: Inferior/redundant marked for deletion
    DISTILLATION = auto()      # Step 31: Knowledge extracted to neural maps
    COLOR_COMPRESSION = auto() # Step 32: Rarely-used → RBY color glyphs
    NEURAL_MAP_CREATE = auto() # Step 33: Compressed representations created

    # Death & Rebirth (Deposit & New Cycle)
    WRITE_LOCK_OPEN = auto()   # Step 34: AE write-lock lifted (Λ-gated)
    DEPOSIT = auto()           # Step 35: Neural maps/glyphs deposited into AE
    AE_COMPOSITION = auto()    # Step 36: Deposits alter AE data
    WRITE_LOCK_CLOSE = auto()  # Step 37: AE becomes read-only again
    SEED_RECALC = auto()       # Step 38: New seed from updated AE
    NEW_EXPANSION = auto()     # Step 39: Next Big Bang begins
    META_LEARN = auto()        # Step 40: New cycle benefits from deposits

    # Resurrection (Rehydration)
    RESURRECTION_TRIGGER = auto()  # Step 41: Need for old nano arises
    SEED_LOOKUP = auto()       # Step 42: Find Absularis from past cycle
    EXPANSION_REPLAY = auto()  # Step 43: Re-expand from historical seed
    GLYPH_DECODING = auto()    # Step 44: RBYDecoder reconstructs from glyph
    NANO_REACTIVATION = auto() # Step 45: Forgotten nano brought back

    # Meta-states
    IDLE = auto()              # System idle (between cycles or waiting)
    ERROR = auto()             # Error state


# State transition groups
BIRTH_STATES = {LifecycleState.TRIGGER, LifecycleState.SEED_CALC,
                LifecycleState.EXPANSION_START, LifecycleState.IC_AE_INFECTION,
                LifecycleState.NANO_CREATION, LifecycleState.RBY_ASSIGNMENT,
                LifecycleState.PTAIE_TAGGING, LifecycleState.RIPPLE_ACTIVATION,
                LifecycleState.VOLUME_TRACKING}

LIFE_STATES = {LifecycleState.TRAINING, LifecycleState.IC_AE_RECURSION,
               LifecycleState.META_TRAINING, LifecycleState.INFERENCE,
               LifecycleState.MEMORY_FORMATION, LifecycleState.ASSOCIATION,
               LifecycleState.FITNESS_TRACKING, LifecycleState.ORCHESTRATION,
               LifecycleState.INDEX_UPDATES}

MATURITY_STATES = {LifecycleState.SPECIALIZATION, LifecycleState.COLLABORATION,
                   LifecycleState.REDUNDANCY, LifecycleState.EVOLUTION,
                   LifecycleState.GROWTH_PLATEAU}

ABSULARITY_STATES = {LifecycleState.DETECTOR_TRIGGERS, LifecycleState.ABSULARIS_SNAPSHOT,
                     LifecycleState.EXPANSION_HALTS, LifecycleState.COMPRESSION_BEGINS}

COMPRESSION_STATES = {LifecycleState.DEEP_LEARNING, LifecycleState.FITNESS_EVAL,
                      LifecycleState.PRUNING, LifecycleState.DISTILLATION,
                      LifecycleState.COLOR_COMPRESSION, LifecycleState.NEURAL_MAP_CREATE}

DEATH_REBIRTH_STATES = {LifecycleState.WRITE_LOCK_OPEN, LifecycleState.DEPOSIT,
                        LifecycleState.AE_COMPOSITION, LifecycleState.WRITE_LOCK_CLOSE,
                        LifecycleState.SEED_RECALC, LifecycleState.NEW_EXPANSION,
                        LifecycleState.META_LEARN}

RESURRECTION_STATES = {LifecycleState.RESURRECTION_TRIGGER, LifecycleState.SEED_LOOKUP,
                       LifecycleState.EXPANSION_REPLAY, LifecycleState.GLYPH_DECODING,
                       LifecycleState.NANO_REACTIVATION}

# Ordered transitions (state → next state)
STATE_ORDER = list(LifecycleState)[:-2]  # Exclude IDLE and ERROR


class LifecycleManager:
    """
    Manages the 45-step lifecycle of the AEc expansion/compression cycle.
    Detects Absularity (Λ) via volume derivatives and learning performance.
    """

    def __init__(self, epsilon: float = 0.01, eta: float = 0.05):
        self.epsilon = epsilon  # dV/dt threshold
        self.eta = eta          # LP-MD threshold
        self.state = LifecycleState.IDLE
        self.cycle_id = 0
        self._state_history: List[tuple] = []
        self._callbacks: Dict[LifecycleState, List[Callable]] = {}
        self._learning_performance: List[float] = []
        self._step_start_time = 0.0

    def get_phase_name(self) -> str:
        if self.state in BIRTH_STATES: return "Birth"
        if self.state in LIFE_STATES: return "Life"
        if self.state in MATURITY_STATES: return "Maturity"
        if self.state in ABSULARITY_STATES: return "Absularity"
        if self.state in COMPRESSION_STATES: return "Compression"
        if self.state in DEATH_REBIRTH_STATES: return "Death/Rebirth"
        if self.state in RESURRECTION_STATES: return "Resurrection"
        return "Idle"

    def on_state(self, state: LifecycleState, callback: Callable):
        """Register a callback for when a specific state is entered."""
        self._callbacks.setdefault(state, []).append(callback)

    def transition(self, new_state: LifecycleState, context: Optional[Dict] = None):
        """Transition to a new lifecycle state."""
        old_state = self.state
        self.state = new_state
        now = time.time()
        duration = now - self._step_start_time if self._step_start_time else 0
        self._step_start_time = now
        self._state_history.append((now, old_state, new_state, duration))

        log.info(f"Lifecycle: {old_state.name} → {new_state.name} "
                 f"[cycle {self.cycle_id}, {self.get_phase_name()}]")

        for cb in self._callbacks.get(new_state, []):
            try:
                cb(context or {})
            except Exception as e:
                log.error(f"Lifecycle callback error in {new_state.name}: {e}")

    def advance(self, context: Optional[Dict] = None):
        """Advance to the next state in the lifecycle sequence."""
        try:
            idx = STATE_ORDER.index(self.state)
            if idx + 1 < len(STATE_ORDER):
                self.transition(STATE_ORDER[idx + 1], context)
            else:
                # Cycle complete — restart
                self.cycle_id += 1
                self.transition(LifecycleState.TRIGGER, context)
        except ValueError:
            # Current state not in order (IDLE or ERROR) → start
            self.transition(LifecycleState.TRIGGER, context)

    def check_absularity(self, dv_dt: float, d2v_dt2: float,
                         learning_perf: Optional[float] = None) -> bool:
        """
        Check Absularity (Λ) detection criteria:
        1. dV/dt < -ε (volume growth goes negative)
        2. d²V/dt² < 0 (growth acceleration negative)
        3. LP-MD ≤ -η (learning performance drops)
        """
        if learning_perf is not None:
            self._learning_performance.append(learning_perf)

        crit1 = dv_dt < -self.epsilon
        crit2 = d2v_dt2 < 0
        crit3 = False
        if len(self._learning_performance) >= 10:
            recent = self._learning_performance[-5:]
            older = self._learning_performance[-10:-5]
            lp_md = (sum(recent) / len(recent)) - (sum(older) / len(older))
            crit3 = lp_md <= -self.eta

        is_absularity = crit1 and crit2
        if crit3:
            is_absularity = True  # LP-MD alone can trigger

        if is_absularity and self.state in LIFE_STATES | MATURITY_STATES:
            log.warning(f"ABSULARITY (Λ) DETECTED — dV/dt={dv_dt:.4f}, "
                        f"d²V/dt²={d2v_dt2:.4f}")
            self.transition(LifecycleState.DETECTOR_TRIGGERS)

        return is_absularity

    def begin_new_cycle(self, context: Optional[Dict] = None):
        """Start a new expansion cycle."""
        self.cycle_id += 1
        self._learning_performance.clear()
        self.transition(LifecycleState.TRIGGER, context)
        log.info(f"New expansion cycle {self.cycle_id} STARTED")

    def enter_resurrection(self, target_cycle_id: int):
        """Enter resurrection mode to recover nanos from a past cycle."""
        self.transition(LifecycleState.RESURRECTION_TRIGGER,
                        {"target_cycle": target_cycle_id})

    def get_history(self) -> List[tuple]:
        return list(self._state_history)

    def get_state_durations(self) -> Dict[str, float]:
        """Get total time spent in each state."""
        durations: Dict[str, float] = {}
        for _, _, state, dur in self._state_history:
            name = state.name
            durations[name] = durations.get(name, 0) + dur
        return durations
