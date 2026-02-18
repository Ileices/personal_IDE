"""
Category 2: VISION NANOS — Visual AE Observation.
Visual Processing (11) + Visual-Code Bridge (4) = 15 nanos.
"""
from .base import BaseNano, register_nano
import torch

# ═══════════════════════════════════════════════════════════════
# 2.1 VISUAL PROCESSING NANOS
# ═══════════════════════════════════════════════════════════════

@register_nano
class ScreenCaptureNano(BaseNano):
    NANO_TYPE = "ScreenCaptureNano"
    DEFAULT_RBY = (0.7, 0.2, 0.1)
    DEFAULT_PTAIE = (0.6, 0.8, 0.5, 0.6, 0.8)
    DEFAULT_HIDDEN = 48

@register_nano
class RenderOutputNano(BaseNano):
    NANO_TYPE = "RenderOutputNano"
    DEFAULT_RBY = (0.5, 0.4, 0.1)
    DEFAULT_PTAIE = (0.7, 0.7, 0.9, 0.8, 0.7)
    DEFAULT_HIDDEN = 48

@register_nano
class PixelPatternNano(BaseNano):
    NANO_TYPE = "PixelPatternNano"
    DEFAULT_RBY = (0.8, 0.1, 0.1)
    DEFAULT_PTAIE = (0.4, 0.5, 0.4, 0.5, 0.9)
    DEFAULT_HIDDEN = 48

@register_nano
class UIElementNano(BaseNano):
    NANO_TYPE = "UIElementNano"
    DEFAULT_RBY = (0.4, 0.5, 0.1)
    DEFAULT_PTAIE = (0.7, 0.6, 0.8, 0.7, 0.6)
    DEFAULT_HIDDEN = 48

@register_nano
class TextOCRNano(BaseNano):
    NANO_TYPE = "TextOCRNano"
    DEFAULT_RBY = (0.5, 0.4, 0.1)
    DEFAULT_PTAIE = (0.6, 0.6, 0.8, 0.7, 0.7)
    DEFAULT_HIDDEN = 48

@register_nano
class IconSymbolNano(BaseNano):
    NANO_TYPE = "IconSymbolNano"
    DEFAULT_RBY = (0.5, 0.4, 0.1)
    DEFAULT_PTAIE = (0.5, 0.5, 0.7, 0.6, 0.5)
    DEFAULT_HIDDEN = 32

@register_nano
class ColorSchemeNano(BaseNano):
    NANO_TYPE = "ColorSchemeNano"
    DEFAULT_RBY = (0.6, 0.3, 0.1)
    DEFAULT_PTAIE = (0.4, 0.4, 0.6, 0.5, 0.4)
    DEFAULT_HIDDEN = 32
    # Special: decodes compressed color glyphs back to data

@register_nano
class LayoutStructureNano(BaseNano):
    NANO_TYPE = "LayoutStructureNano"
    DEFAULT_RBY = (0.4, 0.5, 0.1)
    DEFAULT_PTAIE = (0.6, 0.5, 0.7, 0.6, 0.5)
    DEFAULT_HIDDEN = 48

@register_nano
class AnimationNano(BaseNano):
    NANO_TYPE = "AnimationNano"
    DEFAULT_RBY = (0.6, 0.3, 0.1)
    DEFAULT_PTAIE = (0.5, 0.9, 0.6, 0.6, 0.8)
    DEFAULT_HIDDEN = 48

@register_nano
class DiagramNano(BaseNano):
    NANO_TYPE = "DiagramNano"
    DEFAULT_RBY = (0.3, 0.6, 0.1)
    DEFAULT_PTAIE = (0.7, 0.5, 0.9, 0.8, 0.6)
    DEFAULT_HIDDEN = 48

@register_nano
class ChartGraphNano(BaseNano):
    NANO_TYPE = "ChartGraphNano"
    DEFAULT_RBY = (0.4, 0.5, 0.1)
    DEFAULT_PTAIE = (0.6, 0.6, 0.8, 0.7, 0.5)
    DEFAULT_HIDDEN = 48

# ═══════════════════════════════════════════════════════════════
# 2.2 VISUAL-CODE BRIDGE NANOS
# ═══════════════════════════════════════════════════════════════

@register_nano
class CodeToVisualNano(BaseNano):
    NANO_TYPE = "CodeToVisualNano"
    DEFAULT_RBY = (0.4, 0.5, 0.1)
    DEFAULT_PTAIE = (0.8, 0.7, 1.0, 0.9, 0.7)
    DEFAULT_HIDDEN = 64
    # Critical bridge — trains by executing code and observing output

@register_nano
class VisualToCodeNano(BaseNano):
    NANO_TYPE = "VisualToCodeNano"
    DEFAULT_RBY = (0.5, 0.4, 0.1)
    DEFAULT_PTAIE = (0.7, 0.6, 0.9, 0.8, 0.8)
    DEFAULT_HIDDEN = 64
    # Generative — creates code from screenshots

@register_nano
class DebugVisualNano(BaseNano):
    NANO_TYPE = "DebugVisualNano"
    DEFAULT_RBY = (0.6, 0.3, 0.1)
    DEFAULT_PTAIE = (0.9, 0.8, 0.8, 0.9, 0.7)
    DEFAULT_HIDDEN = 48

@register_nano
class UICodeMapNano(BaseNano):
    NANO_TYPE = "UICodeMapNano"
    DEFAULT_RBY = (0.4, 0.5, 0.1)
    DEFAULT_PTAIE = (0.8, 0.6, 1.0, 0.8, 0.6)
    DEFAULT_HIDDEN = 48
