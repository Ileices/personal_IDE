"""
Category 3: SEMANTIC NANOS — Understanding Layer.
Natural Language (12) + Programming Language (8) + Domain-Specific (8) = 28 nanos.
"""
from .base import BaseNano, register_nano

# ═══════════════════════════════════════════════════════════════
# 3.1 NATURAL LANGUAGE NANOS
# ═══════════════════════════════════════════════════════════════

@register_nano
class SyntaxNano(BaseNano):
    NANO_TYPE = "SyntaxNano"
    DEFAULT_RBY = (0.2, 0.7, 0.1)
    DEFAULT_PTAIE = (0.7, 0.5, 0.9, 0.8, 0.4)

@register_nano
class MorphologyNano(BaseNano):
    NANO_TYPE = "MorphologyNano"
    DEFAULT_RBY = (0.3, 0.6, 0.1)
    DEFAULT_PTAIE = (0.6, 0.4, 0.8, 0.7, 0.3)
    DEFAULT_HIDDEN = 48

@register_nano
class PragmaticsNano(BaseNano):
    NANO_TYPE = "PragmaticsNano"
    DEFAULT_RBY = (0.6, 0.3, 0.1)
    DEFAULT_PTAIE = (0.8, 0.7, 0.9, 0.9, 0.6)

@register_nano
class DiscourseNano(BaseNano):
    NANO_TYPE = "DiscourseNano"
    DEFAULT_RBY = (0.5, 0.4, 0.1)
    DEFAULT_PTAIE = (0.7, 0.8, 0.9, 0.8, 0.5)

@register_nano
class IntentNano(BaseNano):
    NANO_TYPE = "IntentNano"
    DEFAULT_RBY = (0.6, 0.3, 0.1)
    DEFAULT_PTAIE = (0.9, 0.8, 0.9, 1.0, 0.5)
    DEFAULT_HIDDEN = 64
    # CRITICAL inference nano — determines what user wants (I=1.0)

@register_nano
class SentimentNano(BaseNano):
    NANO_TYPE = "SentimentNano"
    DEFAULT_RBY = (0.6, 0.3, 0.1)
    DEFAULT_PTAIE = (0.6, 0.7, 0.7, 0.7, 0.4)

@register_nano
class EntityNano(BaseNano):
    NANO_TYPE = "EntityNano"
    DEFAULT_RBY = (0.4, 0.5, 0.1)
    DEFAULT_PTAIE = (0.7, 0.6, 0.9, 0.8, 0.5)

@register_nano
class RelationNano(BaseNano):
    NANO_TYPE = "RelationNano"
    DEFAULT_RBY = (0.5, 0.4, 0.1)
    DEFAULT_PTAIE = (0.7, 0.6, 1.0, 0.8, 0.6)

@register_nano
class AnaphoraNano(BaseNano):
    NANO_TYPE = "AnaphoraNano"
    DEFAULT_RBY = (0.4, 0.5, 0.1)
    DEFAULT_PTAIE = (0.8, 0.8, 0.9, 0.8, 0.4)

@register_nano
class MetaphorNano(BaseNano):
    NANO_TYPE = "MetaphorNano"
    DEFAULT_RBY = (0.7, 0.2, 0.1)
    DEFAULT_PTAIE = (0.5, 0.5, 0.7, 0.6, 0.6)

@register_nano
class IdiomNano(BaseNano):
    NANO_TYPE = "IdiomNano"
    DEFAULT_RBY = (0.5, 0.4, 0.1)
    DEFAULT_PTAIE = (0.6, 0.4, 0.7, 0.6, 0.3)

@register_nano
class SlangNano(BaseNano):
    NANO_TYPE = "SlangNano"
    DEFAULT_RBY = (0.7, 0.2, 0.1)
    DEFAULT_PTAIE = (0.5, 0.9, 0.6, 0.5, 0.3)

# ═══════════════════════════════════════════════════════════════
# 3.2 PROGRAMMING LANGUAGE SEMANTIC NANOS
# ═══════════════════════════════════════════════════════════════

_PL_RBY = (0.3, 0.6, 0.1)
_PL_PTAIE = (0.8, 0.6, 0.9, 0.9, 0.5)

@register_nano
class PythonSemanticNano(BaseNano):
    NANO_TYPE = "PythonSemanticNano"
    DEFAULT_RBY = _PL_RBY
    DEFAULT_PTAIE = _PL_PTAIE

@register_nano
class CppSemanticNano(BaseNano):
    NANO_TYPE = "CppSemanticNano"
    DEFAULT_RBY = _PL_RBY
    DEFAULT_PTAIE = _PL_PTAIE

@register_nano
class JavaScriptSemanticNano(BaseNano):
    NANO_TYPE = "JavaScriptSemanticNano"
    DEFAULT_RBY = _PL_RBY
    DEFAULT_PTAIE = _PL_PTAIE

@register_nano
class RustSemanticNano(BaseNano):
    NANO_TYPE = "RustSemanticNano"
    DEFAULT_RBY = _PL_RBY
    DEFAULT_PTAIE = _PL_PTAIE

@register_nano
class SQLSemanticNano(BaseNano):
    NANO_TYPE = "SQLSemanticNano"
    DEFAULT_RBY = _PL_RBY
    DEFAULT_PTAIE = _PL_PTAIE

@register_nano
class ShellSemanticNano(BaseNano):
    NANO_TYPE = "ShellSemanticNano"
    DEFAULT_RBY = _PL_RBY
    DEFAULT_PTAIE = _PL_PTAIE

@register_nano
class MarkupSemanticNano(BaseNano):
    NANO_TYPE = "MarkupSemanticNano"
    DEFAULT_RBY = _PL_RBY
    DEFAULT_PTAIE = _PL_PTAIE

@register_nano
class ConfigSemanticNano(BaseNano):
    NANO_TYPE = "ConfigSemanticNano"
    DEFAULT_RBY = _PL_RBY
    DEFAULT_PTAIE = _PL_PTAIE

# ═══════════════════════════════════════════════════════════════
# 3.3 DOMAIN-SPECIFIC SEMANTIC NANOS
# ═══════════════════════════════════════════════════════════════

_DS_RBY = (0.4, 0.5, 0.1)
_DS_PTAIE = (0.7, 0.5, 0.9, 0.8, 0.6)

@register_nano
class MathematicsSemanticNano(BaseNano):
    NANO_TYPE = "MathematicsSemanticNano"
    DEFAULT_RBY = _DS_RBY
    DEFAULT_PTAIE = _DS_PTAIE

@register_nano
class PhysicsSemanticNano(BaseNano):
    NANO_TYPE = "PhysicsSemanticNano"
    DEFAULT_RBY = _DS_RBY
    DEFAULT_PTAIE = _DS_PTAIE

@register_nano
class ChemistrySemanticNano(BaseNano):
    NANO_TYPE = "ChemistrySemanticNano"
    DEFAULT_RBY = _DS_RBY
    DEFAULT_PTAIE = _DS_PTAIE

@register_nano
class BiologySemanticNano(BaseNano):
    NANO_TYPE = "BiologySemanticNano"
    DEFAULT_RBY = _DS_RBY
    DEFAULT_PTAIE = _DS_PTAIE

@register_nano
class FinanceSemanticNano(BaseNano):
    NANO_TYPE = "FinanceSemanticNano"
    DEFAULT_RBY = _DS_RBY
    DEFAULT_PTAIE = _DS_PTAIE

@register_nano
class LegalSemanticNano(BaseNano):
    NANO_TYPE = "LegalSemanticNano"
    DEFAULT_RBY = _DS_RBY
    DEFAULT_PTAIE = _DS_PTAIE

@register_nano
class MedicalSemanticNano(BaseNano):
    NANO_TYPE = "MedicalSemanticNano"
    DEFAULT_RBY = _DS_RBY
    DEFAULT_PTAIE = _DS_PTAIE

@register_nano
class EngineeringSemanticNano(BaseNano):
    NANO_TYPE = "EngineeringSemanticNano"
    DEFAULT_RBY = _DS_RBY
    DEFAULT_PTAIE = _DS_PTAIE
