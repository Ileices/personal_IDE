"""
Category 4: MEMORY NANOS — AEc Temporal Tracking.
Short-Term (5) + Long-Term (5) + Management (6) + Temporal (5) = 21 nanos.
"""
from .base import BaseNano, register_nano

# ═══════════════════════════════════════════════════════════════
# 4.1 SHORT-TERM MEMORY NANOS (Hot RAM)
# ═══════════════════════════════════════════════════════════════

@register_nano
class ConversationBufferNano(BaseNano):
    NANO_TYPE = "ConversationBufferNano"
    DEFAULT_RBY = (0.5, 0.4, 0.1)
    DEFAULT_PTAIE = (1.0, 1.0, 0.9, 0.9, 0.2)
    # Compressed at conversation end

@register_nano
class WorkingMemoryNano(BaseNano):
    NANO_TYPE = "WorkingMemoryNano"
    DEFAULT_RBY = (0.4, 0.5, 0.1)
    DEFAULT_PTAIE = (1.0, 1.0, 0.8, 0.9, 0.2)
    # Persists until task completion

@register_nano
class ScratchpadNano(BaseNano):
    NANO_TYPE = "ScratchpadNano"
    DEFAULT_RBY = (0.6, 0.3, 0.1)
    DEFAULT_PTAIE = (0.8, 1.0, 0.5, 0.6, 0.3)
    # Cleared after use

@register_nano
class AttentionNano(BaseNano):
    NANO_TYPE = "AttentionNano"
    DEFAULT_RBY = (0.5, 0.4, 0.1)
    DEFAULT_PTAIE = (1.0, 1.0, 1.0, 1.0, 0.2)
    # Dynamically updated during inference (all P/T/A/I = 1.0)

@register_nano
class CacheNano(BaseNano):
    NANO_TYPE = "CacheNano"
    DEFAULT_RBY = (0.2, 0.7, 0.1)
    DEFAULT_PTAIE = (0.7, 0.8, 0.7, 0.7, 0.2)
    # LRU eviction policy — Hot RAM → Warm SSD

# ═══════════════════════════════════════════════════════════════
# 4.2 LONG-TERM MEMORY NANOS (Warm SSD → Cold HDD)
# ═══════════════════════════════════════════════════════════════

@register_nano
class EpisodicMemoryNano(BaseNano):
    NANO_TYPE = "EpisodicMemoryNano"
    DEFAULT_RBY = (0.6, 0.3, 0.1)
    DEFAULT_PTAIE = (0.6, 0.9, 0.7, 0.7, 0.4)
    # Compressed after Λ, stored with timestamp. Warm→Cold by age.

@register_nano
class SemanticMemoryNano(BaseNano):
    NANO_TYPE = "SemanticMemoryNano"
    DEFAULT_RBY = (0.3, 0.6, 0.1)
    DEFAULT_PTAIE = (0.7, 0.4, 0.9, 0.8, 0.3)
    # Persists across cycles

@register_nano
class ProceduralMemoryNano(BaseNano):
    NANO_TYPE = "ProceduralMemoryNano"
    DEFAULT_RBY = (0.2, 0.6, 0.2)
    DEFAULT_PTAIE = (0.8, 0.5, 0.8, 0.9, 0.7)
    # Refined with use — slightly elevated Y (execution)

@register_nano
class DeclarativeMemoryNano(BaseNano):
    NANO_TYPE = "DeclarativeMemoryNano"
    DEFAULT_RBY = (0.3, 0.6, 0.1)
    DEFAULT_PTAIE = (0.7, 0.5, 0.8, 0.8, 0.3)

@register_nano
class ImplicitMemoryNano(BaseNano):
    NANO_TYPE = "ImplicitMemoryNano"
    DEFAULT_RBY = (0.5, 0.4, 0.1)
    DEFAULT_PTAIE = (0.6, 0.6, 0.7, 0.7, 0.4)
    # Emerges from repeated exposure — distributed across nanos

# ═══════════════════════════════════════════════════════════════
# 4.3 MEMORY MANAGEMENT NANOS
# ═══════════════════════════════════════════════════════════════

@register_nano
class DecayNano(BaseNano):
    NANO_TYPE = "DecayNano"
    DEFAULT_RBY = (0.3, 0.6, 0.1)
    DEFAULT_PTAIE = (0.7, 0.9, 0.8, 0.8, 0.3)
    # Continuous: importance(t) = importance(0) × e^(-λt) × (1 + access_freq)

@register_nano
class ConsolidationNano(BaseNano):
    NANO_TYPE = "ConsolidationNano"
    DEFAULT_RBY = (0.3, 0.6, 0.1)
    DEFAULT_PTAIE = (0.8, 0.7, 0.9, 0.9, 0.5)
    # Triggered at micro-Λ (conversation end) and macro-Λ (cycle end)

@register_nano
class RetrievalNano(BaseNano):
    NANO_TYPE = "RetrievalNano"
    DEFAULT_RBY = (0.4, 0.5, 0.1)
    DEFAULT_PTAIE = (0.9, 0.8, 1.0, 0.9, 0.6)
    DEFAULT_HIDDEN = 64
    # Multi-hop semantic search + temporal filtering + PTAIE weighting

@register_nano
class ForgetNano(BaseNano):
    NANO_TYPE = "ForgetNano"
    DEFAULT_RBY = (0.3, 0.6, 0.1)
    DEFAULT_PTAIE = (0.6, 0.5, 0.7, 0.7, 0.4)
    # Triggered at 85-90% storage. Before deletion: convert to RBY glyph!

@register_nano
class ReinforcementNano(BaseNano):
    NANO_TYPE = "ReinforcementNano"
    DEFAULT_RBY = (0.3, 0.6, 0.1)
    DEFAULT_PTAIE = (0.7, 0.7, 0.8, 0.8, 0.3)
    # importance += α × usage_count × recency

@register_nano
class AssociationNano(BaseNano):
    NANO_TYPE = "AssociationNano"
    DEFAULT_RBY = (0.5, 0.4, 0.1)
    DEFAULT_PTAIE = (0.8, 0.6, 1.0, 0.9, 0.5)
    DEFAULT_HIDDEN = 64
    # Builds graph via temporal co-occurrence + semantic similarity + causal links

# ═══════════════════════════════════════════════════════════════
# 4.4 TEMPORAL MEMORY NANOS
# ═══════════════════════════════════════════════════════════════

@register_nano
class TimestampNano(BaseNano):
    NANO_TYPE = "TimestampNano"
    DEFAULT_RBY = (0.2, 0.7, 0.1)
    DEFAULT_PTAIE = (0.8, 1.0, 0.8, 0.8, 0.2)

@register_nano
class ChronologyNano(BaseNano):
    NANO_TYPE = "ChronologyNano"
    DEFAULT_RBY = (0.3, 0.6, 0.1)
    DEFAULT_PTAIE = (0.7, 0.9, 0.9, 0.8, 0.3)

@register_nano
class DurationNano(BaseNano):
    NANO_TYPE = "DurationNano"
    DEFAULT_RBY = (0.3, 0.6, 0.1)
    DEFAULT_PTAIE = (0.6, 0.8, 0.7, 0.7, 0.2)

@register_nano
class RecencyNano(BaseNano):
    NANO_TYPE = "RecencyNano"
    DEFAULT_RBY = (0.4, 0.5, 0.1)
    DEFAULT_PTAIE = (0.8, 1.0, 0.8, 0.8, 0.2)
    # Score: 1 / (1 + log(time_since_access))

@register_nano
class PeriodicityNano(BaseNano):
    NANO_TYPE = "PeriodicityNano"
    DEFAULT_RBY = (0.5, 0.4, 0.1)
    DEFAULT_PTAIE = (0.6, 0.8, 0.7, 0.7, 0.5)
    # FFT + autocorrelation on access patterns
