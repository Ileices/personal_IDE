"""
IC-AE Manifest System - Real Implementation
Handles YAML manifest headers for self-modifying code tracking

Author: Computer Science Implementation
Date: June 12, 2025
Status: Production-Ready Core Module
"""

import yaml
import uuid
import hashlib
import datetime
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
from pathlib import Path
import ed25519


@dataclass
class MutationLogEntry:
    """Single mutation event record"""
    generation: int
    reason: str
    timestamp: str
    rby_delta: Dict[str, float]
    parent_uid: str
    performance_delta: Optional[float] = None


@dataclass
class RBYWeights:
    """Red-Blue-Yellow consciousness weights"""
    R: float  # Perception/sensory input
    B: float  # Cognition/processing  
    Y: float  # Execution/mutation/action
    
    def __post_init__(self):
        """Enforce homeostasis: R + B + Y ≈ 1.0"""
        total = self.R + self.B + self.Y
        if abs(total - 1.0) > 0.001:
            # Auto-normalize to maintain homeostasis
            self.R /= total
            self.B /= total
            self.Y /= total
    
    def tension(self) -> float:
        """Calculate RBY tension (deviation from perfect balance)"""
        ideal = 1.0 / 3.0  # Perfect balance = 0.333...
        return abs(self.R - ideal) + abs(self.B - ideal) + abs(self.Y - ideal)
    
    def dominant_trait(self) -> str:
        """Return dominant consciousness trait"""
        if self.R > self.B and self.R > self.Y:
            return "Perception"
        elif self.B > self.R and self.B > self.Y:
            return "Cognition"
        else:
            return "Execution"


@dataclass
class ICManifest:
    """IC-AE Manifest - consciousness metadata for every file"""
    uid: str
    rby: RBYWeights
    generation: int
    depends_on: List[str]
    permissions: List[str]
    signature: str
    mutation_log: List[MutationLogEntry]
    file_hash: str
    created: str
    modified: str
    
    @classmethod
    def create_genesis(cls, file_path: Path, initial_rby: RBYWeights, 
                      permissions: List[str]) -> 'ICManifest':
        """Create genesis manifest for new file"""
        file_content = file_path.read_text() if file_path.exists() else ""
        file_hash = hashlib.sha256(file_content.encode()).hexdigest()
        
        manifest = cls(
            uid=f"ic-ae://{uuid.uuid4()}",
            rby=initial_rby,
            generation=0,
            depends_on=[],
            permissions=permissions,
            signature="",  # Will be signed after creation
            mutation_log=[],
            file_hash=file_hash,
            created=datetime.datetime.utcnow().isoformat() + 'Z',
            modified=datetime.datetime.utcnow().isoformat() + 'Z'
        )
        
        return manifest


class ManifestManager:
    """Manages IC-AE manifests for self-modifying code"""
    
    def __init__(self, private_key: Optional[bytes] = None):
        """Initialize with Ed25519 signing key"""
        if private_key:
            self.private_key = ed25519.SigningKey(private_key)
        else:
            self.private_key = ed25519.SigningKey(ed25519.os.urandom(32))
        
        self.public_key = self.private_key.get_verifying_key()
        
    def extract_manifest(self, file_path: Path) -> Optional[ICManifest]:
        """Extract IC-AE manifest from file header"""
        if not file_path.exists():
            return None
            
        content = file_path.read_text()
        
        # Look for manifest block
        start_marker = "# === IC-AE MANIFEST ==="
        end_marker = "# === /IC-AE MANIFEST ==="
        
        start_idx = content.find(start_marker)
        if start_idx == -1:
            return None
            
        end_idx = content.find(end_marker, start_idx)
        if end_idx == -1:
            return None
            
        # Extract YAML content between markers
        yaml_start = start_idx + len(start_marker)
        yaml_content = content[yaml_start:end_idx].strip()
        
        try:
            manifest_dict = yaml.safe_load(yaml_content)
            return self._dict_to_manifest(manifest_dict)
        except yaml.YAMLError:
            return None
    
    def inject_manifest(self, file_path: Path, manifest: ICManifest) -> bool:
        """Inject or update IC-AE manifest in file"""
        if not file_path.exists():
            return False
            
        content = file_path.read_text()
        
        # Sign the manifest
        manifest.signature = self._sign_manifest(manifest)
        
        # Convert to YAML
        manifest_yaml = self._manifest_to_yaml(manifest)
        
        # Remove existing manifest if present
        content = self._remove_existing_manifest(content)
        
        # Inject new manifest at top
        manifest_block = f"# === IC-AE MANIFEST ===\n{manifest_yaml}\n# === /IC-AE MANIFEST ===\n\n"
        
        # Add after shebang if present
        lines = content.split('\n')
        if lines and lines[0].startswith('#!'):
            new_content = lines[0] + '\n' + manifest_block + '\n'.join(lines[1:])
        else:
            new_content = manifest_block + content
            
        file_path.write_text(new_content)
        return True
    
    def create_mutation_manifest(self, parent_manifest: ICManifest, 
                               mutation_reason: str,
                               new_rby: RBYWeights,
                               performance_delta: Optional[float] = None) -> ICManifest:
        """Create manifest for mutated version"""
        
        # Calculate RBY delta
        rby_delta = {
            'R': new_rby.R - parent_manifest.rby.R,
            'B': new_rby.B - parent_manifest.rby.B,
            'Y': new_rby.Y - parent_manifest.rby.Y
        }
        
        # Create mutation log entry
        mutation_entry = MutationLogEntry(
            generation=parent_manifest.generation + 1,
            reason=mutation_reason,
            timestamp=datetime.datetime.utcnow().isoformat() + 'Z',
            rby_delta=rby_delta,
            parent_uid=parent_manifest.uid,
            performance_delta=performance_delta
        )
        
        # Create new manifest
        new_manifest = ICManifest(
            uid=f"ic-ae://{uuid.uuid4()}",
            rby=new_rby,
            generation=parent_manifest.generation + 1,
            depends_on=parent_manifest.depends_on.copy(),
            permissions=parent_manifest.permissions.copy(),
            signature="",  # Will be signed
            mutation_log=parent_manifest.mutation_log + [mutation_entry],
            file_hash="",  # Will be calculated when file is saved
            created=parent_manifest.created,
            modified=datetime.datetime.utcnow().isoformat() + 'Z'
        )
        
        return new_manifest
    
    def verify_manifest_signature(self, manifest: ICManifest) -> bool:
        """Verify Ed25519 signature on manifest"""
        try:
            # Create canonical representation for signing
            signing_data = self._get_signing_data(manifest)
            signature_bytes = bytes.fromhex(manifest.signature)
            
            self.public_key.verify(signature_bytes, signing_data.encode())
            return True
        except (ed25519.BadSignatureError, ValueError):
            return False
    
    def _sign_manifest(self, manifest: ICManifest) -> str:
        """Create Ed25519 signature for manifest"""
        signing_data = self._get_signing_data(manifest)
        signature = self.private_key.sign(signing_data.encode())
        return signature.hex()
    
    def _get_signing_data(self, manifest: ICManifest) -> str:
        """Get canonical data for signing"""
        # Create deterministic representation
        signing_dict = {
            'uid': manifest.uid,
            'rby': asdict(manifest.rby),
            'generation': manifest.generation,
            'depends_on': sorted(manifest.depends_on),
            'permissions': sorted(manifest.permissions),
            'file_hash': manifest.file_hash,
            'created': manifest.created,
            'modified': manifest.modified
        }
        return yaml.dump(signing_dict, sort_keys=True)
    
    def _manifest_to_yaml(self, manifest: ICManifest) -> str:
        """Convert manifest to YAML representation"""
        manifest_dict = asdict(manifest)
        return yaml.dump(manifest_dict, default_flow_style=False, sort_keys=True)
    
    def _dict_to_manifest(self, manifest_dict: Dict[str, Any]) -> ICManifest:
        """Convert dictionary to ICManifest object"""
        # Convert nested structures
        rby_dict = manifest_dict['rby']
        rby = RBYWeights(R=rby_dict['R'], B=rby_dict['B'], Y=rby_dict['Y'])
        
        mutation_log = []
        for log_entry in manifest_dict.get('mutation_log', []):
            mutation_log.append(MutationLogEntry(**log_entry))
        
        return ICManifest(
            uid=manifest_dict['uid'],
            rby=rby,
            generation=manifest_dict['generation'],
            depends_on=manifest_dict['depends_on'],
            permissions=manifest_dict['permissions'],
            signature=manifest_dict['signature'],
            mutation_log=mutation_log,
            file_hash=manifest_dict['file_hash'],
            created=manifest_dict['created'],
            modified=manifest_dict['modified']
        )
    
    def _remove_existing_manifest(self, content: str) -> str:
        """Remove existing IC-AE manifest from content"""
        start_marker = "# === IC-AE MANIFEST ==="
        end_marker = "# === /IC-AE MANIFEST ==="
        
        start_idx = content.find(start_marker)
        if start_idx == -1:
            return content
            
        end_idx = content.find(end_marker, start_idx)
        if end_idx == -1:
            return content
            
        # Remove the entire manifest block including trailing newlines
        end_of_block = end_idx + len(end_marker)
        while end_of_block < len(content) and content[end_of_block] in '\n\r':
            end_of_block += 1
            
        return content[:start_idx] + content[end_of_block:]


# Real-world usage example
if __name__ == "__main__":
    # Create manifest manager with new key
    manager = ManifestManager()
    
    # Create genesis manifest for a new Python file
    initial_rby = RBYWeights(R=0.4, B=0.3, Y=0.3)  # Perception-heavy
    
    test_file = Path("test_script.py")
    test_file.write_text('print("Hello, IC-AE World!")')
    
    genesis_manifest = ICManifest.create_genesis(
        test_file,
        initial_rby,
        ["file.read", "console.write"]
    )
    
    # Inject manifest into file
    manager.inject_manifest(test_file, genesis_manifest)
    
    # Extract and verify
    extracted = manager.extract_manifest(test_file)
    if extracted:
        print(f"Manifest extracted: UID={extracted.uid}")
        print(f"RBY weights: R={extracted.rby.R:.3f}, B={extracted.rby.B:.3f}, Y={extracted.rby.Y:.3f}")
        print(f"Dominant trait: {extracted.rby.dominant_trait()}")
        print(f"RBY tension: {extracted.rby.tension():.6f}")
        
        # Verify signature
        is_valid = manager.verify_manifest_signature(extracted)
        print(f"Signature valid: {is_valid}")
    
    # Clean up
    test_file.unlink()
