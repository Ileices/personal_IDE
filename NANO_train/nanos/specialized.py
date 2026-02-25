"""
Category 18: SPECIALIZED DOMAIN NANOS — Mathematics, Science, Creative, Game.
Mathematics (6) + Science (3) + Creative (4) + Game Understanding (4) = 17 nanos.
"""
from .base import BaseNano, register_nano

# ═══════════════════════════════════════════════════════════════
# 18.1 MATHEMATICS
# ═══════════════════════════════════════════════════════════════

@register_nano
class ArithmeticNano(BaseNano):
    NANO_TYPE = "ArithmeticNano"
    DEFAULT_RBY = (0.2, 0.7, 0.1)
    DEFAULT_PTAIE = (0.8, 0.7, 0.8, 0.8, 0.3)
    # Exact integer/float arithmetic, overflow detection

@register_nano
class AlgebraNano(BaseNano):
    NANO_TYPE = "AlgebraNano"
    DEFAULT_RBY = (0.3, 0.6, 0.1)
    DEFAULT_PTAIE = (0.7, 0.5, 0.7, 0.7, 0.5)
    # Symbolic manipulation, equation solving

@register_nano
class CalculusNano(BaseNano):
    NANO_TYPE = "CalculusNano"
    DEFAULT_RBY = (0.4, 0.5, 0.1)
    DEFAULT_PTAIE = (0.6, 0.4, 0.6, 0.6, 0.6)
    # Symbolic differentiation/integration, numerical methods

@register_nano
class LinearAlgebraNano(BaseNano):
    NANO_TYPE = "LinearAlgebraNano"
    DEFAULT_RBY = (0.3, 0.6, 0.1)
    DEFAULT_PTAIE = (0.8, 0.6, 0.8, 0.8, 0.4)
    # Matrix ops, eigenvalues, SVD — critical for nano training

@register_nano
class StatisticsNano(BaseNano):
    NANO_TYPE = "StatisticsNano"
    DEFAULT_RBY = (0.3, 0.6, 0.1)
    DEFAULT_PTAIE = (0.7, 0.5, 0.7, 0.7, 0.4)
    # Distributions, hypothesis testing, Bayesian inference

@register_nano
class GraphTheoryNano(BaseNano):
    NANO_TYPE = "GraphTheoryNano"
    DEFAULT_RBY = (0.4, 0.5, 0.1)
    DEFAULT_PTAIE = (0.6, 0.5, 0.7, 0.6, 0.6)
    # Shortest path, community detection — for nano topology

# ═══════════════════════════════════════════════════════════════
# 18.2 SCIENCE
# ═══════════════════════════════════════════════════════════════

@register_nano
class PhysicsSimNano(BaseNano):
    NANO_TYPE = "PhysicsSimNano"
    DEFAULT_RBY = (0.5, 0.4, 0.1)
    DEFAULT_PTAIE = (0.5, 0.4, 0.5, 0.5, 0.7)
    # Particle simulation for procedural generation

@register_nano
class ChemistryNano(BaseNano):
    NANO_TYPE = "ChemistryNano"
    DEFAULT_RBY = (0.4, 0.5, 0.1)
    DEFAULT_PTAIE = (0.4, 0.3, 0.4, 0.4, 0.6)
    # Molecular property prediction, SMILES parsing

@register_nano
class BiologyNano(BaseNano):
    NANO_TYPE = "BiologyNano"
    DEFAULT_RBY = (0.5, 0.4, 0.1)
    DEFAULT_PTAIE = (0.4, 0.3, 0.4, 0.4, 0.7)
    # Sequence alignment, protein structure concepts

# ═══════════════════════════════════════════════════════════════
# 18.3 CREATIVE
# ═══════════════════════════════════════════════════════════════

@register_nano
class MusicAnalysisNano(BaseNano):
    NANO_TYPE = "MusicAnalysisNano"
    DEFAULT_RBY = (0.6, 0.2, 0.2)
    DEFAULT_PTAIE = (0.4, 0.3, 0.5, 0.4, 0.9)
    # Audio feature extraction, rhythm/melody patterns

@register_nano
class VisualArtNano(BaseNano):
    NANO_TYPE = "VisualArtNano"
    DEFAULT_RBY = (0.7, 0.1, 0.2)
    DEFAULT_PTAIE = (0.3, 0.3, 0.4, 0.3, 1.0)
    # Color theory, composition analysis, style transfer concepts

@register_nano
class NarrativeNano(BaseNano):
    NANO_TYPE = "NarrativeNano"
    DEFAULT_RBY = (0.6, 0.2, 0.2)
    DEFAULT_PTAIE = (0.5, 0.4, 0.6, 0.5, 0.8)
    # Story structure, character arcs, plot coherence

@register_nano
class CreativeBlendNano(BaseNano):
    NANO_TYPE = "CreativeBlendNano"
    DEFAULT_RBY = (0.7, 0.1, 0.2)
    DEFAULT_PTAIE = (0.4, 0.3, 0.5, 0.4, 1.0)
    # Cross-modal creativity: code-as-art, data-as-music

# ═══════════════════════════════════════════════════════════════
# 18.4 GAME UNDERSTANDING
# ═══════════════════════════════════════════════════════════════

@register_nano
class GameStateNano(BaseNano):
    NANO_TYPE = "GameStateNano"
    DEFAULT_RBY = (0.4, 0.4, 0.2)
    DEFAULT_PTAIE = (0.6, 0.5, 0.7, 0.6, 0.7)
    # Game tree search, state evaluation

@register_nano
class StrategyNano(BaseNano):
    NANO_TYPE = "StrategyNano"
    DEFAULT_RBY = (0.5, 0.3, 0.2)
    DEFAULT_PTAIE = (0.6, 0.5, 0.7, 0.6, 0.8)
    # Minimax, MCTS, Nash equilibrium concepts

@register_nano
class SimulationNano(BaseNano):
    NANO_TYPE = "SimulationNano"
    DEFAULT_RBY = (0.5, 0.3, 0.2)
    DEFAULT_PTAIE = (0.5, 0.4, 0.6, 0.5, 0.7)
    # Monte Carlo simulation for decision making

@register_nano
class RewardModelNano(BaseNano):
    NANO_TYPE = "RewardModelNano"
    DEFAULT_RBY = (0.4, 0.4, 0.2)
    DEFAULT_PTAIE = (0.7, 0.5, 0.7, 0.7, 0.6)
    # Reward shaping, preference learning for RLHF-style training
