"""
Policy and Security Systems
Comprehensive security framework for consciousness processing systems
Implements permission management, audit logging, and security monitoring
"""

import os
import json
import hashlib
import hmac
import time
import threading
import sqlite3
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Any, Optional, Set, Callable
from dataclasses import dataclass, field
from enum import Enum
import logging
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import serialization
import base64
import secrets
import ipaddress
import re
import psutil
import subprocess


class SecurityLevel(Enum):
    """Security clearance levels"""
    PUBLIC = 0
    RESTRICTED = 1
    CONFIDENTIAL = 2
    SECRET = 3
    TOP_SECRET = 4


class PermissionType(Enum):
    """Types of permissions"""
    READ = "read"
    WRITE = "write"
    EXECUTE = "execute"
    ADMIN = "admin"
    CONSCIOUSNESS_ACCESS = "consciousness_access"
    SYSTEM_MODIFY = "system_modify"
    NETWORK_ACCESS = "network_access"
    DATA_EXPORT = "data_export"


@dataclass
class SecurityContext:
    """Security context for operations"""
    user_id: str
    session_id: str
    permissions: Set[PermissionType]
    security_level: SecurityLevel
    ip_address: str
    timestamp: datetime
    expires_at: datetime
    authenticated: bool = False
    multi_factor_verified: bool = False


@dataclass
class AuditLogEntry:
    """Audit log entry structure"""
    timestamp: datetime
    event_type: str
    user_id: str
    session_id: str
    resource: str
    action: str
    result: str  # SUCCESS, FAILURE, DENIED
    details: Dict[str, Any]
    security_level: SecurityLevel
    ip_address: str
    risk_score: float


class CryptographicManager:
    """Manages encryption, decryption, and key management"""
    
    def __init__(self, master_key: Optional[bytes] = None):
        if master_key:
            self.master_key = master_key
        else:
            self.master_key = Fernet.generate_key()
        
        self.cipher_suite = Fernet(self.master_key)
        self.rsa_key_pair = self._generate_rsa_keys()
        self.session_keys = {}
        
    def _generate_rsa_keys(self) -> Tuple[Any, Any]:
        """Generate RSA key pair for asymmetric encryption"""
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048
        )
        public_key = private_key.public_key()
        return private_key, public_key
    
    def encrypt_data(self, data: str, use_rsa: bool = False) -> str:
        """Encrypt data using Fernet or RSA"""
        if use_rsa:
            public_key = self.rsa_key_pair[1]
            encrypted = public_key.encrypt(
                data.encode(),
                padding.OAEP(
                    mgf=padding.MGF1(algorithm=hashes.SHA256()),
                    algorithm=hashes.SHA256(),
                    label=None
                )
            )
            return base64.b64encode(encrypted).decode()
        else:
            encrypted = self.cipher_suite.encrypt(data.encode())
            return base64.b64encode(encrypted).decode()
    
    def decrypt_data(self, encrypted_data: str, use_rsa: bool = False) -> str:
        """Decrypt data using Fernet or RSA"""
        try:
            encrypted_bytes = base64.b64decode(encrypted_data.encode())
            
            if use_rsa:
                private_key = self.rsa_key_pair[0]
                decrypted = private_key.decrypt(
                    encrypted_bytes,
                    padding.OAEP(
                        mgf=padding.MGF1(algorithm=hashes.SHA256()),
                        algorithm=hashes.SHA256(),
                        label=None
                    )
                )
                return decrypted.decode()
            else:
                decrypted = self.cipher_suite.decrypt(encrypted_bytes)
                return decrypted.decode()
                
        except Exception as e:
            raise ValueError(f"Decryption failed: {e}")
    
    def generate_session_key(self, session_id: str) -> str:
        """Generate session-specific encryption key"""
        session_key = Fernet.generate_key()
        self.session_keys[session_id] = session_key
        return base64.b64encode(session_key).decode()
    
    def hash_password(self, password: str, salt: Optional[bytes] = None) -> Tuple[str, str]:
        """Hash password with salt using PBKDF2"""
        if salt is None:
            salt = secrets.token_bytes(32)
        
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
        )
        key = kdf.derive(password.encode())
        
        return base64.b64encode(key).decode(), base64.b64encode(salt).decode()
    
    def verify_password(self, password: str, hashed_password: str, salt: str) -> bool:
        """Verify password against hash"""
        try:
            stored_hash = base64.b64decode(hashed_password.encode())
            salt_bytes = base64.b64decode(salt.encode())
            
            kdf = PBKDF2HMAC(
                algorithm=hashes.SHA256(),
                length=32,
                salt=salt_bytes,
                iterations=100000,
            )
            kdf.verify(password.encode(), stored_hash)
            return True
        except Exception:
            return False
    
    def generate_secure_token(self, length: int = 32) -> str:
        """Generate cryptographically secure random token"""
        return secrets.token_urlsafe(length)


class PermissionManager:
    """Manages user permissions and access control"""
    
    def __init__(self, db_path: str = "permissions.db"):
        self.db_path = db_path
        self.crypto_manager = CryptographicManager()
        self._init_database()
        self.permission_cache = {}
        self.cache_timeout = 300  # 5 minutes
        
    def _init_database(self):
        """Initialize permission database"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Users table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    user_id TEXT PRIMARY KEY,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    salt TEXT NOT NULL,
                    security_level INTEGER NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_login TIMESTAMP,
                    is_active BOOLEAN DEFAULT 1,
                    failed_attempts INTEGER DEFAULT 0,
                    locked_until TIMESTAMP
                )
            ''')
            
            # Permissions table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS user_permissions (
                    user_id TEXT,
                    permission TEXT,
                    granted_by TEXT,
                    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP,
                    is_active BOOLEAN DEFAULT 1,
                    FOREIGN KEY (user_id) REFERENCES users (user_id)
                )
            ''')
            
            # Sessions table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id TEXT PRIMARY KEY,
                    user_id TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP,
                    ip_address TEXT,
                    user_agent TEXT,
                    is_active BOOLEAN DEFAULT 1,
                    FOREIGN KEY (user_id) REFERENCES users (user_id)
                )
            ''')
            
            # Consciousness access policies
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS consciousness_policies (
                    policy_id TEXT PRIMARY KEY,
                    resource_pattern TEXT NOT NULL,
                    required_level INTEGER NOT NULL,
                    required_permissions TEXT NOT NULL,
                    rate_limit_per_hour INTEGER DEFAULT 100,
                    monitoring_level TEXT DEFAULT 'standard',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            conn.commit()
    
    def create_user(self, username: str, password: str, security_level: SecurityLevel,
                   permissions: List[PermissionType], created_by: str) -> str:
        """Create new user with specified permissions"""
        user_id = self.crypto_manager.generate_secure_token()
        password_hash, salt = self.crypto_manager.hash_password(password)
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Create user
            cursor.execute('''
                INSERT INTO users (user_id, username, password_hash, salt, security_level)
                VALUES (?, ?, ?, ?, ?)
            ''', (user_id, username, password_hash, salt, security_level.value))
            
            # Grant permissions
            for permission in permissions:
                cursor.execute('''
                    INSERT INTO user_permissions (user_id, permission, granted_by)
                    VALUES (?, ?, ?)
                ''', (user_id, permission.value, created_by))
            
            conn.commit()
        
        return user_id
    
    def authenticate_user(self, username: str, password: str, ip_address: str) -> Optional[SecurityContext]:
        """Authenticate user and create security context"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Get user info
            cursor.execute('''
                SELECT user_id, password_hash, salt, security_level, is_active, 
                       failed_attempts, locked_until
                FROM users WHERE username = ?
            ''', (username,))
            
            user_data = cursor.fetchone()
            if not user_data:
                return None
            
            user_id, password_hash, salt, security_level, is_active, failed_attempts, locked_until = user_data
            
            # Check if account is locked
            if locked_until:
                lock_time = datetime.fromisoformat(locked_until)
                if datetime.now() < lock_time:
                    return None
            
            # Check if account is active
            if not is_active:
                return None
            
            # Verify password
            if not self.crypto_manager.verify_password(password, password_hash, salt):
                # Increment failed attempts
                failed_attempts += 1
                lock_until = None
                
                if failed_attempts >= 5:  # Lock after 5 failed attempts
                    lock_until = datetime.now() + timedelta(minutes=30)
                
                cursor.execute('''
                    UPDATE users SET failed_attempts = ?, locked_until = ?
                    WHERE user_id = ?
                ''', (failed_attempts, lock_until, user_id))
                conn.commit()
                
                return None
            
            # Reset failed attempts on successful login
            cursor.execute('''
                UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login = ?
                WHERE user_id = ?
            ''', (datetime.now(), user_id))
            
            # Get user permissions
            cursor.execute('''
                SELECT permission FROM user_permissions 
                WHERE user_id = ? AND is_active = 1 
                AND (expires_at IS NULL OR expires_at > ?)
            ''', (user_id, datetime.now()))
            
            permissions = {PermissionType(row[0]) for row in cursor.fetchall()}
            
            # Create session
            session_id = self.crypto_manager.generate_secure_token()
            expires_at = datetime.now() + timedelta(hours=8)  # 8-hour sessions
            
            cursor.execute('''
                INSERT INTO sessions (session_id, user_id, expires_at, ip_address)
                VALUES (?, ?, ?, ?)
            ''', (session_id, user_id, expires_at, ip_address))
            
            conn.commit()
            
            return SecurityContext(
                user_id=user_id,
                session_id=session_id,
                permissions=permissions,
                security_level=SecurityLevel(security_level),
                ip_address=ip_address,
                timestamp=datetime.now(),
                expires_at=expires_at,
                authenticated=True
            )
    
    def check_permission(self, context: SecurityContext, required_permission: PermissionType,
                        resource: str = None) -> bool:
        """Check if user has required permission for resource"""
        if not context.authenticated:
            return False
        
        if datetime.now() > context.expires_at:
            return False
        
        # Check basic permission
        if required_permission not in context.permissions:
            return False
        
        # Check consciousness-specific policies
        if resource and required_permission == PermissionType.CONSCIOUSNESS_ACCESS:
            return self._check_consciousness_policy(context, resource)
        
        return True
    
    def _check_consciousness_policy(self, context: SecurityContext, resource: str) -> bool:
        """Check consciousness-specific access policies"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Find matching policies
            cursor.execute('''
                SELECT required_level, required_permissions FROM consciousness_policies
                WHERE ? LIKE resource_pattern
            ''', (resource,))
            
            for required_level, required_perms in cursor.fetchall():
                if context.security_level.value < required_level:
                    return False
                
                required_permission_set = set(required_perms.split(','))
                user_permission_set = {p.value for p in context.permissions}
                
                if not required_permission_set.issubset(user_permission_set):
                    return False
        
        return True
    
    def revoke_session(self, session_id: str):
        """Revoke active session"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE sessions SET is_active = 0 WHERE session_id = ?
            ''', (session_id,))
            conn.commit()


class AuditLogger:
    """Comprehensive audit logging system"""
    
    def __init__(self, log_path: str = "audit.db", log_file: str = "audit.log"):
        self.log_path = log_path
        self.log_file = log_file
        self.crypto_manager = CryptographicManager()
        self._init_audit_database()
        self._setup_file_logger()
        self.risk_analyzer = SecurityRiskAnalyzer()
        
    def _init_audit_database(self):
        """Initialize audit database"""
        with sqlite3.connect(self.log_path) as conn:
            cursor = conn.cursor()
            
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS audit_logs (
                    log_id TEXT PRIMARY KEY,
                    timestamp TIMESTAMP NOT NULL,
                    event_type TEXT NOT NULL,
                    user_id TEXT,
                    session_id TEXT,
                    resource TEXT,
                    action TEXT NOT NULL,
                    result TEXT NOT NULL,
                    details_encrypted TEXT,
                    security_level INTEGER,
                    ip_address TEXT,
                    risk_score REAL,
                    hash_chain TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Integrity verification table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS audit_integrity (
                    day_date TEXT PRIMARY KEY,
                    record_count INTEGER,
                    daily_hash TEXT,
                    previous_hash TEXT
                )
            ''')
            
            conn.commit()
    
    def _setup_file_logger(self):
        """Setup file-based logging"""
        logging.basicConfig(
            filename=self.log_file,
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        self.file_logger = logging.getLogger('audit')
    
    def log_event(self, event_type: str, user_id: str, session_id: str,
                 resource: str, action: str, result: str, 
                 details: Dict[str, Any], security_level: SecurityLevel,
                 ip_address: str) -> str:
        """Log security event with integrity protection"""
        
        log_id = self.crypto_manager.generate_secure_token()
        timestamp = datetime.now()
        
        # Calculate risk score
        risk_score = self.risk_analyzer.calculate_risk_score(
            event_type, action, result, details, security_level, ip_address
        )
        
        # Encrypt sensitive details
        details_json = json.dumps(details)
        encrypted_details = self.crypto_manager.encrypt_data(details_json)
        
        # Get previous hash for chain integrity
        previous_hash = self._get_last_hash()
        
        # Create hash chain entry
        hash_data = f"{log_id}{timestamp}{event_type}{action}{result}{encrypted_details}"
        current_hash = hashlib.sha256((hash_data + previous_hash).encode()).hexdigest()
        
        # Store in database
        with sqlite3.connect(self.log_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO audit_logs 
                (log_id, timestamp, event_type, user_id, session_id, resource, 
                 action, result, details_encrypted, security_level, ip_address, 
                 risk_score, hash_chain)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (log_id, timestamp, event_type, user_id, session_id, resource,
                  action, result, encrypted_details, security_level.value,
                  ip_address, risk_score, current_hash))
            conn.commit()
        
        # Log to file as well
        log_message = f"Event: {event_type} | User: {user_id} | Action: {action} | Result: {result} | Risk: {risk_score:.2f}"
        
        if result == "FAILURE" or risk_score > 0.7:
            self.file_logger.error(log_message)
        elif risk_score > 0.4:
            self.file_logger.warning(log_message)
        else:
            self.file_logger.info(log_message)
        
        return log_id
    
    def _get_last_hash(self) -> str:
        """Get the last hash in the chain for integrity"""
        with sqlite3.connect(self.log_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT hash_chain FROM audit_logs 
                ORDER BY timestamp DESC LIMIT 1
            ''')
            result = cursor.fetchone()
            return result[0] if result else "genesis"
    
    def verify_integrity(self, start_date: datetime = None, end_date: datetime = None) -> bool:
        """Verify audit log integrity"""
        with sqlite3.connect(self.log_path) as conn:
            cursor = conn.cursor()
            
            query = '''
                SELECT log_id, timestamp, event_type, action, result, 
                       details_encrypted, hash_chain 
                FROM audit_logs ORDER BY timestamp
            '''
            
            if start_date and end_date:
                query += ' WHERE timestamp BETWEEN ? AND ?'
                cursor.execute(query, (start_date, end_date))
            else:
                cursor.execute(query)
            
            previous_hash = "genesis"
            
            for row in cursor.fetchall():
                log_id, timestamp, event_type, action, result, encrypted_details, stored_hash = row
                
                # Recalculate hash
                hash_data = f"{log_id}{timestamp}{event_type}{action}{result}{encrypted_details}"
                expected_hash = hashlib.sha256((hash_data + previous_hash).encode()).hexdigest()
                
                if expected_hash != stored_hash:
                    self.file_logger.error(f"Integrity violation detected at log_id: {log_id}")
                    return False
                
                previous_hash = stored_hash
        
        return True
    
    def get_security_report(self, days: int = 7) -> Dict[str, Any]:
        """Generate security report for specified period"""
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        
        with sqlite3.connect(self.log_path) as conn:
            cursor = conn.cursor()
            
            # Get event statistics
            cursor.execute('''
                SELECT event_type, result, COUNT(*), AVG(risk_score)
                FROM audit_logs 
                WHERE timestamp BETWEEN ? AND ?
                GROUP BY event_type, result
            ''', (start_date, end_date))
            
            event_stats = {}
            for event_type, result, count, avg_risk in cursor.fetchall():
                if event_type not in event_stats:
                    event_stats[event_type] = {}
                event_stats[event_type][result] = {
                    'count': count,
                    'average_risk': avg_risk or 0.0
                }
            
            # Get high-risk events
            cursor.execute('''
                SELECT timestamp, event_type, user_id, action, risk_score
                FROM audit_logs 
                WHERE timestamp BETWEEN ? AND ? AND risk_score > 0.7
                ORDER BY risk_score DESC
            ''', (start_date, end_date))
            
            high_risk_events = [
                {
                    'timestamp': row[0],
                    'event_type': row[1],
                    'user_id': row[2],
                    'action': row[3],
                    'risk_score': row[4]
                }
                for row in cursor.fetchall()
            ]
            
            # Get user activity
            cursor.execute('''
                SELECT user_id, COUNT(*), AVG(risk_score)
                FROM audit_logs 
                WHERE timestamp BETWEEN ? AND ? AND user_id IS NOT NULL
                GROUP BY user_id
                ORDER BY COUNT(*) DESC
            ''', (start_date, end_date))
            
            user_activity = [
                {
                    'user_id': row[0],
                    'event_count': row[1],
                    'average_risk': row[2] or 0.0
                }
                for row in cursor.fetchall()
            ]
        
        return {
            'report_period': {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat(),
                'days': days
            },
            'event_statistics': event_stats,
            'high_risk_events': high_risk_events,
            'user_activity': user_activity,
            'integrity_verified': self.verify_integrity(start_date, end_date)
        }


class SecurityRiskAnalyzer:
    """Analyzes security risks in real-time"""
    
    def __init__(self):
        self.risk_patterns = {
            'failed_authentication': 0.8,
            'permission_denied': 0.6,
            'consciousness_access': 0.4,
            'system_modification': 0.9,
            'data_export': 0.7,
            'unusual_ip': 0.5,
            'off_hours_access': 0.3
        }
        
        self.ip_whitelist = set(['127.0.0.1', '::1'])  # localhost
        self.business_hours = (9, 17)  # 9 AM to 5 PM
    
    def calculate_risk_score(self, event_type: str, action: str, result: str,
                           details: Dict[str, Any], security_level: SecurityLevel,
                           ip_address: str) -> float:
        """Calculate comprehensive risk score for an event"""
        base_risk = 0.1
        
        # Event type risk
        base_risk += self.risk_patterns.get(event_type, 0.2)
        
        # Result-based risk
        if result == "FAILURE":
            base_risk += 0.3
        elif result == "DENIED":
            base_risk += 0.4
        
        # Action-specific risk
        high_risk_actions = ['delete', 'modify', 'export', 'execute', 'admin']
        if any(risk_action in action.lower() for risk_action in high_risk_actions):
            base_risk += 0.2
        
        # IP address risk
        if not self._is_trusted_ip(ip_address):
            base_risk += 0.2
        
        # Time-based risk (off-hours access)
        current_hour = datetime.now().hour
        if not (self.business_hours[0] <= current_hour <= self.business_hours[1]):
            base_risk += 0.1
        
        # Security level adjustment
        if security_level == SecurityLevel.TOP_SECRET:
            base_risk += 0.2
        elif security_level == SecurityLevel.SECRET:
            base_risk += 0.1
        
        # Details-based risk
        if details.get('multiple_attempts', False):
            base_risk += 0.3
        
        if details.get('data_volume', 0) > 1000000:  # Large data operations
            base_risk += 0.2
        
        return min(1.0, base_risk)
    
    def _is_trusted_ip(self, ip_address: str) -> bool:
        """Check if IP address is in whitelist or private range"""
        if ip_address in self.ip_whitelist:
            return True
        
        try:
            ip = ipaddress.ip_address(ip_address)
            return ip.is_private
        except ValueError:
            return False


class SecurityPolicyEngine:
    """Manages and enforces security policies"""
    
    def __init__(self, permission_manager: PermissionManager, audit_logger: AuditLogger):
        self.permission_manager = permission_manager
        self.audit_logger = audit_logger
        self.active_sessions = {}
        self.rate_limiters = {}
        
    def enforce_access_control(self, context: SecurityContext, resource: str,
                             action: str, required_permission: PermissionType) -> bool:
        """Enforce access control with comprehensive checks"""
        
        # Basic permission check
        if not self.permission_manager.check_permission(context, required_permission, resource):
            self.audit_logger.log_event(
                event_type="access_control",
                user_id=context.user_id,
                session_id=context.session_id,
                resource=resource,
                action=action,
                result="DENIED",
                details={'reason': 'insufficient_permissions'},
                security_level=context.security_level,
                ip_address=context.ip_address
            )
            return False
        
        # Rate limiting
        if not self._check_rate_limit(context.user_id, resource):
            self.audit_logger.log_event(
                event_type="rate_limit",
                user_id=context.user_id,
                session_id=context.session_id,
                resource=resource,
                action=action,
                result="DENIED",
                details={'reason': 'rate_limit_exceeded'},
                security_level=context.security_level,
                ip_address=context.ip_address
            )
            return False
        
        # Log successful access
        self.audit_logger.log_event(
            event_type="access_control",
            user_id=context.user_id,
            session_id=context.session_id,
            resource=resource,
            action=action,
            result="SUCCESS",
            details={},
            security_level=context.security_level,
            ip_address=context.ip_address
        )
        
        return True
    
    def _check_rate_limit(self, user_id: str, resource: str, 
                         limit_per_hour: int = 100) -> bool:
        """Check rate limiting for user and resource"""
        key = f"{user_id}:{resource}"
        current_time = time.time()
        
        if key not in self.rate_limiters:
            self.rate_limiters[key] = []
        
        # Remove old entries (older than 1 hour)
        self.rate_limiters[key] = [
            timestamp for timestamp in self.rate_limiters[key]
            if current_time - timestamp < 3600
        ]
        
        # Check if limit exceeded
        if len(self.rate_limiters[key]) >= limit_per_hour:
            return False
        
        # Add current request
        self.rate_limiters[key].append(current_time)
        return True


def test_security_systems():
    """Test function for security systems"""
    print("Testing Policy and Security Systems...")
    
    # Initialize components
    permission_manager = PermissionManager(":memory:")  # In-memory database for testing
    audit_logger = AuditLogger(":memory:", "test_audit.log")
    policy_engine = SecurityPolicyEngine(permission_manager, audit_logger)
    
    # Create test user
    user_id = permission_manager.create_user(
        username="test_user",
        password="secure_password123",
        security_level=SecurityLevel.CONFIDENTIAL,
        permissions=[PermissionType.READ, PermissionType.CONSCIOUSNESS_ACCESS],
        created_by="system"
    )
    
    print(f"Created test user: {user_id}")
    
    # Test authentication
    context = permission_manager.authenticate_user(
        username="test_user",
        password="secure_password123",
        ip_address="127.0.0.1"
    )
    
    if context:
        print(f"Authentication successful. Session: {context.session_id}")
        print(f"Permissions: {[p.value for p in context.permissions]}")
        print(f"Security Level: {context.security_level.name}")
    else:
        print("Authentication failed")
        return
    
    # Test access control
    test_cases = [
        ("consciousness_data", "read", PermissionType.READ),
        ("consciousness_data", "write", PermissionType.WRITE),
        ("system_config", "modify", PermissionType.SYSTEM_MODIFY),
        ("consciousness_state", "access", PermissionType.CONSCIOUSNESS_ACCESS)
    ]
    
    print("\nTesting access control:")
    for resource, action, required_perm in test_cases:
        allowed = policy_engine.enforce_access_control(
            context, resource, action, required_perm
        )
        print(f"  {resource}:{action} -> {'ALLOWED' if allowed else 'DENIED'}")
    
    # Test failed authentication
    print("\nTesting failed authentication:")
    failed_context = permission_manager.authenticate_user(
        username="test_user",
        password="wrong_password",
        ip_address="127.0.0.1"
    )
    print(f"Failed auth result: {failed_context is None}")
    
    # Generate security report
    print("\nGenerating security report:")
    report = audit_logger.get_security_report(days=1)
    print(f"Events recorded: {len(report['event_statistics'])}")
    print(f"High-risk events: {len(report['high_risk_events'])}")
    print(f"Integrity verified: {report['integrity_verified']}")
    
    # Test integrity verification
    print(f"\nAudit log integrity: {'VERIFIED' if audit_logger.verify_integrity() else 'FAILED'}")
    
    print("\nPolicy and Security Systems test completed!")


if __name__ == "__main__":
    test_security_systems()
