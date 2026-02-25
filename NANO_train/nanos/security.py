"""
Category 14: SECURITY NANOS — Monitoring + access control + data safety.
Security Monitoring (4) + Access Control (5) + Data Safety (4) = 13 nanos.
"""
from .base import BaseNano, register_nano

# ═══════════════════════════════════════════════════════════════
# 14.1 SECURITY MONITORING
# ═══════════════════════════════════════════════════════════════

@register_nano
class AnomalyDetectorNano(BaseNano):
    NANO_TYPE = "AnomalyDetectorNano"
    DEFAULT_RBY = (0.5, 0.4, 0.1)
    DEFAULT_PTAIE = (0.9, 0.9, 0.9, 0.9, 0.5)
    # Detect unusual mesh traffic, resource spikes, behavioral anomalies

@register_nano
class IntrusionDetectorNano(BaseNano):
    NANO_TYPE = "IntrusionDetectorNano"
    DEFAULT_RBY = (0.4, 0.5, 0.1)
    DEFAULT_PTAIE = (1.0, 1.0, 1.0, 1.0, 0.4)
    # Signature + behavioral IDS for mesh connections

@register_nano
class ThreatClassifierNano(BaseNano):
    NANO_TYPE = "ThreatClassifierNano"
    DEFAULT_RBY = (0.5, 0.4, 0.1)
    DEFAULT_PTAIE = (0.9, 0.8, 0.9, 0.9, 0.6)
    # Classify threat level: info, warning, critical

@register_nano
class AuditLogNano(BaseNano):
    NANO_TYPE = "AuditLogNano"
    DEFAULT_RBY = (0.1, 0.8, 0.1)
    DEFAULT_PTAIE = (0.8, 0.9, 0.7, 0.8, 0.1)
    # Immutable append-only audit log with RBY signatures

# ═══════════════════════════════════════════════════════════════
# 14.2 ACCESS CONTROL
# ═══════════════════════════════════════════════════════════════

@register_nano
class AuthenticationNano(BaseNano):
    NANO_TYPE = "AuthenticationNano"
    DEFAULT_RBY = (0.2, 0.7, 0.1)
    DEFAULT_PTAIE = (1.0, 1.0, 1.0, 1.0, 0.2)
    # Ed25519 challenge-response for mesh peers

@register_nano
class AuthorizationNano(BaseNano):
    NANO_TYPE = "AuthorizationNano"
    DEFAULT_RBY = (0.2, 0.7, 0.1)
    DEFAULT_PTAIE = (1.0, 1.0, 1.0, 1.0, 0.2)
    # RESPECT-based permission tiers

@register_nano
class EncryptionNano(BaseNano):
    NANO_TYPE = "EncryptionNano"
    DEFAULT_RBY = (0.2, 0.7, 0.1)
    DEFAULT_PTAIE = (1.0, 1.0, 1.0, 1.0, 0.1)
    # AES-256-GCM for data-at-rest and in-transit

@register_nano
class KeyManagementNano(BaseNano):
    NANO_TYPE = "KeyManagementNano"
    DEFAULT_RBY = (0.1, 0.8, 0.1)
    DEFAULT_PTAIE = (1.0, 0.9, 0.9, 1.0, 0.1)
    # X25519 key exchange, rotation, revocation

@register_nano
class RateLimiterNano(BaseNano):
    NANO_TYPE = "RateLimiterNano"
    DEFAULT_RBY = (0.2, 0.6, 0.2)
    DEFAULT_PTAIE = (0.9, 0.9, 0.9, 0.9, 0.2)
    # Token bucket + sliding window for API/mesh endpoints

# ═══════════════════════════════════════════════════════════════
# 14.3 DATA SAFETY
# ═══════════════════════════════════════════════════════════════

@register_nano
class PIIDetectorNano(BaseNano):
    NANO_TYPE = "PIIDetectorNano"
    DEFAULT_RBY = (0.4, 0.5, 0.1)
    DEFAULT_PTAIE = (0.9, 0.8, 0.9, 0.9, 0.5)
    # Regex + ML detection of emails, phone, SSN, API keys

@register_nano
class DataSanitizerNano(BaseNano):
    NANO_TYPE = "DataSanitizerNano"
    DEFAULT_RBY = (0.2, 0.7, 0.1)
    DEFAULT_PTAIE = (0.9, 0.8, 0.9, 0.9, 0.3)
    # Redact PII before mesh sharing or training

@register_nano
class IntegrityVerifierNano(BaseNano):
    NANO_TYPE = "IntegrityVerifierNano"
    DEFAULT_RBY = (0.2, 0.7, 0.1)
    DEFAULT_PTAIE = (0.9, 0.8, 0.9, 0.9, 0.2)
    # SHA-256 + Ed25519 signature verification for VDN payloads

@register_nano
class BackupManagerNano(BaseNano):
    NANO_TYPE = "BackupManagerNano"
    DEFAULT_RBY = (0.1, 0.7, 0.2)
    DEFAULT_PTAIE = (0.7, 0.7, 0.6, 0.7, 0.2)
    # Incremental encrypted backups of nano weights + AE state
