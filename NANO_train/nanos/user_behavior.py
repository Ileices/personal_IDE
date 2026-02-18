"""
Category 11: USER BEHAVIOR NANOS — Interaction learning + personalization.
Interaction Pattern (6) + User Profile (6) = 12 nanos.
"""
from .base import BaseNano, register_nano

# ═══════════════════════════════════════════════════════════════
# 11.1 INTERACTION PATTERN NANOS
# ═══════════════════════════════════════════════════════════════

@register_nano
class KeystrokeDynamicsNano(BaseNano):
    NANO_TYPE = "KeystrokeDynamicsNano"
    DEFAULT_RBY = (0.5, 0.3, 0.2)
    DEFAULT_PTAIE = (0.5, 0.6, 0.6, 0.5, 0.7)
    # Typing speed/rhythm patterns → predict next action

@register_nano
class NavigationPatternNano(BaseNano):
    NANO_TYPE = "NavigationPatternNano"
    DEFAULT_RBY = (0.4, 0.4, 0.2)
    DEFAULT_PTAIE = (0.6, 0.6, 0.7, 0.6, 0.6)
    # File open/close patterns, tab switching, search queries

@register_nano
class EditPatternNano(BaseNano):
    NANO_TYPE = "EditPatternNano"
    DEFAULT_RBY = (0.5, 0.3, 0.2)
    DEFAULT_PTAIE = (0.6, 0.6, 0.7, 0.6, 0.7)
    # Copy/paste frequency, refactor patterns, naming conventions

@register_nano
class SessionPatternNano(BaseNano):
    NANO_TYPE = "SessionPatternNano"
    DEFAULT_RBY = (0.4, 0.4, 0.2)
    DEFAULT_PTAIE = (0.5, 0.5, 0.6, 0.5, 0.6)
    # Work session length, break patterns, productivity cycles

@register_nano
class ErrorPatternNano(BaseNano):
    NANO_TYPE = "ErrorPatternNano"
    DEFAULT_RBY = (0.5, 0.4, 0.1)
    DEFAULT_PTAIE = (0.7, 0.6, 0.8, 0.7, 0.7)
    # Common error types, fix patterns, learning curves

@register_nano
class QueryPatternNano(BaseNano):
    NANO_TYPE = "QueryPatternNano"
    DEFAULT_RBY = (0.5, 0.3, 0.2)
    DEFAULT_PTAIE = (0.6, 0.6, 0.7, 0.6, 0.7)
    # AI prompt patterns, reformulation tendencies

# ═══════════════════════════════════════════════════════════════
# 11.2 USER PROFILE NANOS
# ═══════════════════════════════════════════════════════════════

@register_nano
class SkillLevelNano(BaseNano):
    NANO_TYPE = "SkillLevelNano"
    DEFAULT_RBY = (0.4, 0.4, 0.2)
    DEFAULT_PTAIE = (0.6, 0.5, 0.7, 0.6, 0.6)
    # Per-language proficiency estimation

@register_nano
class PreferenceNano(BaseNano):
    NANO_TYPE = "PreferenceNano"
    DEFAULT_RBY = (0.4, 0.4, 0.2)
    DEFAULT_PTAIE = (0.5, 0.5, 0.6, 0.5, 0.6)
    # Code style, framework preferences, verbosity

@register_nano
class WorkflowNano(BaseNano):
    NANO_TYPE = "WorkflowNano"
    DEFAULT_RBY = (0.4, 0.4, 0.2)
    DEFAULT_PTAIE = (0.6, 0.5, 0.7, 0.6, 0.5)
    # TDD vs prototype-first, branch strategy, review habits

@register_nano
class ContextSwitchNano(BaseNano):
    NANO_TYPE = "ContextSwitchNano"
    DEFAULT_RBY = (0.5, 0.3, 0.2)
    DEFAULT_PTAIE = (0.7, 0.7, 0.8, 0.7, 0.6)
    # Project switching, topic jumping, focus duration

@register_nano
class ProductivityNano(BaseNano):
    NANO_TYPE = "ProductivityNano"
    DEFAULT_RBY = (0.3, 0.5, 0.2)
    DEFAULT_PTAIE = (0.5, 0.5, 0.6, 0.5, 0.5)
    # Lines/hour, commits/day, code quality trends

@register_nano
class AdaptationNano(BaseNano):
    NANO_TYPE = "AdaptationNano"
    DEFAULT_RBY = (0.6, 0.2, 0.2)
    DEFAULT_PTAIE = (0.5, 0.4, 0.6, 0.5, 0.8)
    # Adjusts nano behavior based on aggregated user profile
