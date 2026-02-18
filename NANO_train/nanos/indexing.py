"""
Category 5: INDEXING NANOS — AEc Navigation.
Primary Index (8) + Index Structure (7) + Index Query (4) = 19 nanos.
"""
from .base import BaseNano, register_nano

# ═══════════════════════════════════════════════════════════════
# 5.1 PRIMARY INDEX NANOS (reindex at Λ)
# ═══════════════════════════════════════════════════════════════

@register_nano
class DataIndexNano(BaseNano):
    NANO_TYPE = "DataIndexNano"
    DEFAULT_RBY = (0.2, 0.7, 0.1)
    DEFAULT_PTAIE = (0.9, 0.7, 1.0, 1.0, 0.4)
    # O(log n) lookup, O(k log n) for k results

@register_nano
class VisionIndexNano(BaseNano):
    NANO_TYPE = "VisionIndexNano"
    DEFAULT_RBY = (0.3, 0.6, 0.1)
    DEFAULT_PTAIE = (0.8, 0.7, 0.9, 0.9, 0.6)

@register_nano
class SemanticIndexNano(BaseNano):
    NANO_TYPE = "SemanticIndexNano"
    DEFAULT_RBY = (0.3, 0.6, 0.1)
    DEFAULT_PTAIE = (0.9, 0.7, 1.0, 1.0, 0.5)
    DEFAULT_HIDDEN = 64
    # FAISS/Annoy vector databases; O(log n) ANN

@register_nano
class MemoryIndexNano(BaseNano):
    NANO_TYPE = "MemoryIndexNano"
    DEFAULT_RBY = (0.3, 0.6, 0.1)
    DEFAULT_PTAIE = (0.9, 0.9, 1.0, 1.0, 0.4)

@register_nano
class TrainingIndexNano(BaseNano):
    NANO_TYPE = "TrainingIndexNano"
    DEFAULT_RBY = (0.3, 0.6, 0.1)
    DEFAULT_PTAIE = (0.8, 0.6, 0.9, 0.9, 0.4)

@register_nano
class InferenceIndexNano(BaseNano):
    NANO_TYPE = "InferenceIndexNano"
    DEFAULT_RBY = (0.3, 0.6, 0.1)
    DEFAULT_PTAIE = (1.0, 0.9, 1.0, 1.0, 0.3)
    # ALWAYS Hot in RAM — fast routing tables + capability maps

@register_nano
class OrchestratorIndexNano(BaseNano):
    NANO_TYPE = "OrchestratorIndexNano"
    DEFAULT_RBY = (0.2, 0.7, 0.1)
    DEFAULT_PTAIE = (0.9, 0.7, 1.0, 0.9, 0.3)

@register_nano
class HardwareIndexNano(BaseNano):
    NANO_TYPE = "HardwareIndexNano"
    DEFAULT_RBY = (0.3, 0.6, 0.1)
    DEFAULT_PTAIE = (0.9, 0.8, 0.8, 0.9, 0.3)

# ═══════════════════════════════════════════════════════════════
# 5.2 INDEX STRUCTURE NANOS
# ═══════════════════════════════════════════════════════════════

@register_nano
class SpatialIndexNano(BaseNano):
    NANO_TYPE = "SpatialIndexNano"
    DEFAULT_RBY = (0.3, 0.6, 0.1)
    DEFAULT_PTAIE = (0.7, 0.6, 0.8, 0.7, 0.5)
    # R-tree, K-d tree, Quadtree

@register_nano
class TemporalIndexNano(BaseNano):
    NANO_TYPE = "TemporalIndexNano"
    DEFAULT_RBY = (0.3, 0.6, 0.1)
    DEFAULT_PTAIE = (0.8, 1.0, 0.9, 0.8, 0.3)

@register_nano
class HierarchicalIndexNano(BaseNano):
    NANO_TYPE = "HierarchicalIndexNano"
    DEFAULT_RBY = (0.2, 0.7, 0.1)
    DEFAULT_PTAIE = (0.8, 0.6, 0.9, 0.8, 0.4)
    # B-trees, B+ trees, Trie

@register_nano
class GraphIndexNano(BaseNano):
    NANO_TYPE = "GraphIndexNano"
    DEFAULT_RBY = (0.4, 0.5, 0.1)
    DEFAULT_PTAIE = (0.8, 0.6, 1.0, 0.9, 0.6)

@register_nano
class VectorIndexNano(BaseNano):
    NANO_TYPE = "VectorIndexNano"
    DEFAULT_RBY = (0.4, 0.5, 0.1)
    DEFAULT_PTAIE = (0.9, 0.7, 1.0, 1.0, 0.7)
    DEFAULT_HIDDEN = 64
    # HNSW, FAISS, Annoy; ANN queries

@register_nano
class HashIndexNano(BaseNano):
    NANO_TYPE = "HashIndexNano"
    DEFAULT_RBY = (0.2, 0.7, 0.1)
    DEFAULT_PTAIE = (0.8, 0.7, 0.8, 0.8, 0.2)
    # O(1) expected

@register_nano
class BloomFilterNano(BaseNano):
    NANO_TYPE = "BloomFilterNano"
    DEFAULT_RBY = (0.3, 0.6, 0.1)
    DEFAULT_PTAIE = (0.7, 0.7, 0.7, 0.7, 0.1)
    DEFAULT_HIDDEN = 32
    # Fast "definitely not" or "maybe"

# ═══════════════════════════════════════════════════════════════
# 5.3 INDEX QUERY NANOS
# ═══════════════════════════════════════════════════════════════

@register_nano
class SearchNano(BaseNano):
    NANO_TYPE = "SearchNano"
    DEFAULT_RBY = (0.4, 0.5, 0.1)
    DEFAULT_PTAIE = (0.9, 0.8, 1.0, 0.9, 0.5)
    # exact match, fuzzy, semantic, temporal

@register_nano
class FilterNano(BaseNano):
    NANO_TYPE = "FilterNano"
    DEFAULT_RBY = (0.3, 0.6, 0.1)
    DEFAULT_PTAIE = (0.8, 0.7, 0.9, 0.8, 0.3)
    # PTAIE thresholds, RBY constraints, temporal windows

@register_nano
class RankNano(BaseNano):
    NANO_TYPE = "RankNano"
    DEFAULT_RBY = (0.3, 0.6, 0.1)
    DEFAULT_PTAIE = (0.9, 0.8, 0.9, 0.9, 0.4)
    # combined_score = α×PTAIE + β×RBY_match + γ×semantic + δ×recency

@register_nano
class AggregationNano(BaseNano):
    NANO_TYPE = "AggregationNano"
    DEFAULT_RBY = (0.3, 0.6, 0.1)
    DEFAULT_PTAIE = (0.7, 0.6, 0.8, 0.7, 0.4)
