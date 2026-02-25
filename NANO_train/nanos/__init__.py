"""Sea of Nanos — All 296 nano types organized by 19 categories.

Import this package to register every nano type in NANO_REGISTRY.
Then use create_nano(type_name) to instantiate any nano.
"""
from .base import NANO_REGISTRY, create_nano, BaseNano, NanoMessage, NanoState

# Import all categories to trigger @register_nano decorators
from . import data                  # Cat 1:  16 Data Nanos
from . import vision                # Cat 2:  15 Vision Nanos
from . import semantic              # Cat 3:  28 Semantic Nanos
from . import memory                # Cat 4:  21 Memory Nanos
from . import indexing              # Cat 5:  19 Indexing Nanos
from . import orchestration         # Cat 6:  23 Orchestration Nanos
from . import training_nanos        # Cat 7:  24 Training Nanos
from . import inference             # Cat 8:  21 Inference Nanos
from . import hardware              # Cat 9:  16 Hardware Nanos
from . import os_nanos              # Cat 10: 13 OS Nanos
from . import user_behavior         # Cat 11: 12 User Behavior Nanos
from . import communication         # Cat 12: 10 Communication Nanos
from . import procedural            # Cat 13: 15 Procedural Generation Nanos
from . import security              # Cat 14: 13 Security Nanos
from . import meta_cognitive        # Cat 15: 13 Meta-Cognitive Nanos
from . import integration           # Cat 16: 10 Integration Nanos
from . import compression_expansion # Cat 17:  6 Compression/Expansion Nanos
from . import specialized           # Cat 18: 17 Specialized Domain Nanos
from . import framework             # Cat 19:  4 Special Framework Nanos

__all__ = ["NANO_REGISTRY", "create_nano", "BaseNano", "NanoMessage", "NanoState"]
