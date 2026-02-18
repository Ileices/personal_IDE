"""
ic_ae : Minimal implementation of AE = C = 1 + Trifecta + RPS.
The Theory of Absolute Existence (AE = C = 1) with RBY triplet physics.
"""

from .manifest import load_manifest, save_manifest, default_manifest
from .rby import RBY, homeostasis
from .rps import rps_variation, push
from .state import UniversalState
from .mutator import mutate_self
from .scheduler import choose_node
from .agent import hw_probe, generate_profile, write_profile

__version__ = "1.0.0"
__all__ = [
    "load_manifest", "save_manifest", "default_manifest",
    "RBY", "homeostasis", 
    "rps_variation", "push",
    "UniversalState",
    "mutate_self",
    "choose_node",
    "hw_probe", "generate_profile", "write_profile"
]
