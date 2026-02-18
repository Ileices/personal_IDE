"""
Category 12: COMMUNICATION NANOS — Inter-nano + external messaging.
Inter-Nano (4) + External Communication (6) = 10 nanos.
"""
from .base import BaseNano, register_nano

# ═══════════════════════════════════════════════════════════════
# 12.1 INTER-NANO COMMUNICATION
# ═══════════════════════════════════════════════════════════════

@register_nano
class RippleBroadcastNano(BaseNano):
    NANO_TYPE = "RippleBroadcastNano"
    DEFAULT_RBY = (0.3, 0.5, 0.2)
    DEFAULT_PTAIE = (1.0, 1.0, 1.0, 1.0, 0.3)
    # "Stone in pond" — propagates activation to ripple-connected nanos

@register_nano
class DirectMessageNano(BaseNano):
    NANO_TYPE = "DirectMessageNano"
    DEFAULT_RBY = (0.2, 0.6, 0.2)
    DEFAULT_PTAIE = (1.0, 1.0, 1.0, 1.0, 0.2)
    # Point-to-point nano messaging; typed NanoMessage

@register_nano
class PublishSubscribeNano(BaseNano):
    NANO_TYPE = "PublishSubscribeNano"
    DEFAULT_RBY = (0.3, 0.5, 0.2)
    DEFAULT_PTAIE = (0.9, 0.9, 0.9, 0.9, 0.3)
    # Topic-based pub/sub for category-wide events

@register_nano
class SharedStateNano(BaseNano):
    NANO_TYPE = "SharedStateNano"
    DEFAULT_RBY = (0.2, 0.6, 0.2)
    DEFAULT_PTAIE = (0.9, 0.9, 0.9, 0.9, 0.2)
    # Thread-safe shared tensor store for nano collaboration

# ═══════════════════════════════════════════════════════════════
# 12.2 EXTERNAL COMMUNICATION
# ═══════════════════════════════════════════════════════════════

@register_nano
class HTTPClientNano(BaseNano):
    NANO_TYPE = "HTTPClientNano"
    DEFAULT_RBY = (0.3, 0.5, 0.2)
    DEFAULT_PTAIE = (0.8, 0.8, 0.8, 0.8, 0.3)
    # httpx-based async HTTP for LLM API calls

@register_nano
class WebSocketClientNano(BaseNano):
    NANO_TYPE = "WebSocketClientNano"
    DEFAULT_RBY = (0.3, 0.5, 0.2)
    DEFAULT_PTAIE = (0.9, 0.9, 0.9, 0.9, 0.4)
    # Persistent WS connections for mesh communication

@register_nano
class WebSocketServerNano(BaseNano):
    NANO_TYPE = "WebSocketServerNano"
    DEFAULT_RBY = (0.3, 0.5, 0.2)
    DEFAULT_PTAIE = (0.9, 0.9, 0.9, 0.9, 0.3)
    # Accept incoming mesh connections

@register_nano
class MeshTransportNano(BaseNano):
    NANO_TYPE = "MeshTransportNano"
    DEFAULT_RBY = (0.4, 0.4, 0.2)
    DEFAULT_PTAIE = (0.9, 0.9, 1.0, 0.9, 0.5)
    # VDN-encrypted nano transport between mesh nodes

@register_nano
class APIGatewayNano(BaseNano):
    NANO_TYPE = "APIGatewayNano"
    DEFAULT_RBY = (0.2, 0.6, 0.2)
    DEFAULT_PTAIE = (1.0, 0.9, 1.0, 1.0, 0.3)
    # OpenAI-compatible API endpoint handler

@register_nano
class ProtocolAdapterNano(BaseNano):
    NANO_TYPE = "ProtocolAdapterNano"
    DEFAULT_RBY = (0.3, 0.5, 0.2)
    DEFAULT_PTAIE = (0.7, 0.7, 0.8, 0.7, 0.4)
    # HTTP↔WS↔TCP protocol bridging
