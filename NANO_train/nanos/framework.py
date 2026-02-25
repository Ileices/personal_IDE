"""
Category 19: SPECIAL FRAMEWORK NANOS — The meta-nanos that govern the sea itself.
NanoTaxonomyNano, AlternatorNano, RBYDecoderNano, AbsuleicrNano = 4 nanos.
These are the foundational self-referential nanos that make the system self-aware.
"""
from .base import BaseNano, register_nano

@register_nano
class NanoTaxonomyNano(BaseNano):
    """Maintains the complete registry and taxonomy of all nano types.
    Knows every nano, its category, RBY profile, capabilities, and relationships.
    This is the 'genome map' of the sea — the only nano that understands the whole."""
    NANO_TYPE = "NanoTaxonomyNano"
    DEFAULT_RBY = (0.3, 0.6, 0.1)
    DEFAULT_PTAIE = (0.9, 0.8, 0.9, 1.0, 0.3)
    # ALWAYS Hot — this IS the registry

@register_nano
class AlternatorNano(BaseNano):
    """The RBY alternator — maintains dynamic equilibrium across the entire sea.
    Monitors global RBY balance: if the sea drifts too Red (creative chaos),
    it promotes Blue nanos; if too Blue (rigid structure), it promotes Red.
    Y (execution) is the fulcrum. AE = C = 1 is the invariant."""
    NANO_TYPE = "AlternatorNano"
    DEFAULT_RBY = (0.33, 0.34, 0.33)  # Perfectly balanced — the mediator
    DEFAULT_PTAIE = (1.0, 0.9, 1.0, 1.0, 0.5)
    # Critical system nano — maintains homeostasis

@register_nano
class RBYDecoderNano(BaseNano):
    """Decodes RBY vectors into human-readable meaning.
    Maps (r, b, y) → interpretation like 'highly creative, low structure'.
    Used for debugging, logging, and the philosophical nanos."""
    NANO_TYPE = "RBYDecoderNano"
    DEFAULT_RBY = (0.4, 0.5, 0.1)
    DEFAULT_PTAIE = (0.7, 0.6, 0.7, 0.7, 0.4)

@register_nano
class AbsuleicrNano(BaseNano):
    """The Absularity detector — monitors for system-level phase transitions.
    When the sea reaches critical complexity (d²V/dt² → ∞, LP-MD collapse,
    holographic boundary saturation), this nano triggers the Absularity event:
    1. Snapshot entire sea state (Σ*)
    2. Compress via Twmrto L5
    3. Deposit into AE (read-only archive)
    4. Trigger rebirth cycle with new seed

    This is the most important lifecycle nano — the death-and-rebirth trigger."""
    NANO_TYPE = "AbsuleicrNano"
    DEFAULT_RBY = (0.5, 0.3, 0.2)
    DEFAULT_PTAIE = (1.0, 0.5, 1.0, 1.0, 0.8)
    # Highest priority + highest novelty — this nano IS the lifecycle boundary
