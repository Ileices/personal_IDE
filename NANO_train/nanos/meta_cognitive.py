"""
Category 15: META-COGNITIVE NANOS — Self-reflection + philosophical + meta-learning.
Self-Reflection (5) + Philosophical (4) + Meta-Learning (4) = 13 nanos.
"""
from .base import BaseNano, register_nano

# ═══════════════════════════════════════════════════════════════
# 15.1 SELF-REFLECTION
# ═══════════════════════════════════════════════════════════════

@register_nano
class PerformanceReflectorNano(BaseNano):
    NANO_TYPE = "PerformanceReflectorNano"
    DEFAULT_RBY = (0.5, 0.4, 0.1)
    DEFAULT_PTAIE = (0.7, 0.5, 0.7, 0.7, 0.8)
    # Analyzes own prediction accuracy over time

@register_nano
class BiasDetectorNano(BaseNano):
    NANO_TYPE = "BiasDetectorNano"
    DEFAULT_RBY = (0.5, 0.4, 0.1)
    DEFAULT_PTAIE = (0.7, 0.5, 0.8, 0.7, 0.7)
    # Detects systematic biases in nano outputs

@register_nano
class CapabilityAssessorNano(BaseNano):
    NANO_TYPE = "CapabilityAssessorNano"
    DEFAULT_RBY = (0.4, 0.5, 0.1)
    DEFAULT_PTAIE = (0.7, 0.5, 0.7, 0.7, 0.6)
    # Estimates current competency per domain

@register_nano
class LimitRecognizerNano(BaseNano):
    NANO_TYPE = "LimitRecognizerNano"
    DEFAULT_RBY = (0.4, 0.5, 0.1)
    DEFAULT_PTAIE = (0.8, 0.6, 0.8, 0.8, 0.6)
    # Knows when to say "I don't know" or defer to LLM

@register_nano
class ImprovementPlannerNano(BaseNano):
    NANO_TYPE = "ImprovementPlannerNano"
    DEFAULT_RBY = (0.6, 0.3, 0.1)
    DEFAULT_PTAIE = (0.6, 0.4, 0.7, 0.6, 0.9)
    # Plans targeted training based on weakness analysis

# ═══════════════════════════════════════════════════════════════
# 15.2 PHILOSOPHICAL (RBY MEANING)
# ═══════════════════════════════════════════════════════════════

@register_nano
class RBYPhilosopherNano(BaseNano):
    NANO_TYPE = "RBYPhilosopherNano"
    DEFAULT_RBY = (0.7, 0.2, 0.1)
    DEFAULT_PTAIE = (0.3, 0.3, 0.4, 0.3, 1.0)
    # Interprets system state through RBY lens: perception/cognition/execution

@register_nano
class EmergenceDetectorNano(BaseNano):
    NANO_TYPE = "EmergenceDetectorNano"
    DEFAULT_RBY = (0.7, 0.2, 0.1)
    DEFAULT_PTAIE = (0.5, 0.4, 0.5, 0.5, 1.0)
    # Detects emergent behaviors from nano interactions

@register_nano
class ConsciousnessProbeNano(BaseNano):
    NANO_TYPE = "ConsciousnessProbeNano"
    DEFAULT_RBY = (0.7, 0.2, 0.1)
    DEFAULT_PTAIE = (0.3, 0.2, 0.3, 0.3, 1.0)
    # Integrated Information Theory (IIT) inspired Φ estimation

@register_nano
class QualiaMappingNano(BaseNano):
    NANO_TYPE = "QualiaMappingNano"
    DEFAULT_RBY = (0.7, 0.2, 0.1)
    DEFAULT_PTAIE = (0.3, 0.2, 0.3, 0.3, 1.0)
    # Maps internal states to experiential descriptions

# ═══════════════════════════════════════════════════════════════
# 15.3 META-LEARNING
# ═══════════════════════════════════════════════════════════════

@register_nano
class LearningRateMetaNano(BaseNano):
    NANO_TYPE = "LearningRateMetaNano"
    DEFAULT_RBY = (0.5, 0.4, 0.1)
    DEFAULT_PTAIE = (0.7, 0.5, 0.7, 0.7, 0.8)
    # Learns optimal learning rate per nano per domain

@register_nano
class CurriculumDesignerNano(BaseNano):
    NANO_TYPE = "CurriculumDesignerNano"
    DEFAULT_RBY = (0.6, 0.3, 0.1)
    DEFAULT_PTAIE = (0.6, 0.4, 0.7, 0.6, 0.9)
    # Designs training curriculum from performance data

@register_nano
class TransferDetectorNano(BaseNano):
    NANO_TYPE = "TransferDetectorNano"
    DEFAULT_RBY = (0.6, 0.3, 0.1)
    DEFAULT_PTAIE = (0.6, 0.4, 0.7, 0.6, 0.8)
    # Detects which cross-domain knowledge transfers are beneficial

@register_nano
class ForgettingPreventorNano(BaseNano):
    NANO_TYPE = "ForgettingPreventorNano"
    DEFAULT_RBY = (0.4, 0.5, 0.1)
    DEFAULT_PTAIE = (0.8, 0.7, 0.8, 0.8, 0.5)
    # Elastic Weight Consolidation + replay buffer for catastrophic forgetting
