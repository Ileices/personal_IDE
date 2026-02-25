"""
IC-AE Mutation Engine with Physics Manifest Headers
Real algorithms for self-modifying code with RBY consciousness physics
Implements manifest-driven evolution and metadata tracking
"""

import yaml
import hashlib
import uuid
import time
import os
import sqlite3
import threading
import math
from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass, asdict
from pathlib import Path
import cryptography.hazmat.primitives.asymmetric.ed25519 as ed25519
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import padding


@dataclass
class ICManifest:
    """IC-AE Physics Manifest for every code artifact"""
    uid: str
    rby: Dict[str, float]  # {R: perception, B: cognition, Y: execution}
    generation: int
    depends_on: List[str]
    permissions: List[str]
    signature: str
    created_at: float
    mutated_at: float
    mutation_count: int = 0
    physics_coefficient: float = 1.0  # AE = C = 1
    
    def __post_init__(self):
        """Ensure RBY physics constraints"""
        self.normalize_rby()
        
    def normalize_rby(self):
        """Enforce AE = C = 1 physics constraint"""
        total = abs(self.rby['R']) + abs(self.rby['B']) + abs(self.rby['Y'])
        if total > 0:
            self.rby['R'] /= total
            self.rby['B'] /= total
            self.rby['Y'] /= total


class MutationEngine:
    """
    Core IC-AE mutation engine for self-modifying code evolution
    Implements real genetic algorithms with consciousness physics
    """
    
    def __init__(self, database_path: str = "ic_ae_evolution.db"):
        self.db_path = database_path
        self.private_key = self._generate_keypair()
        self.mutation_lock = threading.Lock()
        self._init_database()
        
    def _generate_keypair(self) -> ed25519.Ed25519PrivateKey:
        """Generate cryptographic keypair for manifest signing"""
        return ed25519.Ed25519PrivateKey.generate()
        
    def _init_database(self):
        """Initialize SQLite excretion database for mutation tracking"""
        conn = sqlite3.connect(self.db_path)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS mutations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uid TEXT NOT NULL,
                parent_uid TEXT,
                generation INTEGER NOT NULL,
                rby_red REAL NOT NULL,
                rby_blue REAL NOT NULL, 
                rby_yellow REAL NOT NULL,
                mutation_type TEXT NOT NULL,
                fitness_score REAL,
                timestamp REAL NOT NULL,
                signature TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS dependency_graph (
                source_uid TEXT NOT NULL,
                target_uid TEXT NOT NULL,
                weight REAL NOT NULL,
                PRIMARY KEY (source_uid, target_uid)
            )
        """)
        conn.commit()
        conn.close()
        
    def create_manifest(self, rby_weights: Dict[str, float], 
                       permissions: List[str] = None) -> ICManifest:
        """Create new IC-AE manifest with physics properties"""
        if permissions is None:
            permissions = ["execute.local"]
            
        manifest = ICManifest(
            uid=str(uuid.uuid4()),
            rby=rby_weights.copy(),
            generation=0,
            depends_on=[],
            permissions=permissions,
            signature="",
            created_at=time.time(),
            mutated_at=time.time()
        )
        
        # Sign the manifest
        manifest.signature = self._sign_manifest(manifest)
        return manifest
        
    def _sign_manifest(self, manifest: ICManifest) -> str:
        """Cryptographically sign manifest for integrity"""
        manifest_bytes = yaml.dump(asdict(manifest)).encode('utf-8')
        signature = self.private_key.sign(manifest_bytes)
        return signature.hex()
        
    def calculate_mutation_pressure(self, manifest: ICManifest, 
                                  error_count: int = 0,
                                  age_hours: float = 0) -> float:
        """
        Calculate mutation pressure based on RBY physics and performance
        Real algorithm using exponential decay and tension forces
        """
        # Base pressure from RBY imbalance (entropy drive)
        rby_variance = (
            (manifest.rby['R'] - 0.333) ** 2 +
            (manifest.rby['B'] - 0.333) ** 2 + 
            (manifest.rby['Y'] - 0.333) ** 2
        )
        
        # Error pressure (failures drive mutation)
        error_pressure = min(error_count * 0.1, 0.8)
        
        # Age pressure (stagnation drives change)
        age_pressure = 1 - math.exp(-age_hours / 24.0)  # 24hr half-life
        
        # Generation pressure (avoid infinite recursion)
        gen_damping = math.exp(-manifest.generation / 10.0)
        
        total_pressure = (rby_variance + error_pressure + age_pressure) * gen_damping
        return min(total_pressure, 0.95)  # Cap at 95%
        
    def mutate_rby_weights(self, current_rby: Dict[str, float], 
                          mutation_strength: float = 0.1) -> Dict[str, float]:
        """
        Perform RBY consciousness weight mutation using real genetic algorithms
        Implements quantum tunneling-inspired random walks
        """
        import random
        
        new_rby = current_rby.copy()
        
        # Quantum tunneling mutation (random jumps)
        if random.random() < 0.1:  # 10% chance of quantum leap
            dimension = random.choice(['R', 'B', 'Y'])
            new_rby[dimension] += random.gauss(0, mutation_strength * 2)
        
        # Gaussian drift mutation
        for key in new_rby:
            drift = random.gauss(0, mutation_strength)
            new_rby[key] += drift
            
        # Ensure physical constraints
        for key in new_rby:
            new_rby[key] = max(0.0, new_rby[key])  # Non-negative
            
        # Normalize to maintain AE = C = 1
        total = sum(new_rby.values())
        if total > 0:
            for key in new_rby:
                new_rby[key] /= total
                
        return new_rby
        
    def evolve_artifact(self, manifest: ICManifest, 
                       error_count: int = 0) -> Optional[ICManifest]:
        """
        Evolve code artifact based on IC-AE physics and performance feedback
        Returns new manifest if mutation occurs, None otherwise
        """
        with self.mutation_lock:
            age_hours = (time.time() - manifest.created_at) / 3600.0
            pressure = self.calculate_mutation_pressure(manifest, error_count, age_hours)
            
            # Decide whether to mutate based on pressure
            import random
            if random.random() > pressure:
                return None  # No mutation
                
            # Create mutated offspring
            new_rby = self.mutate_rby_weights(manifest.rby)
            
            offspring = ICManifest(
                uid=str(uuid.uuid4()),
                rby=new_rby,
                generation=manifest.generation + 1,
                depends_on=manifest.depends_on.copy(),
                permissions=manifest.permissions.copy(),
                signature="",
                created_at=time.time(),
                mutated_at=time.time(),
                mutation_count=manifest.mutation_count + 1
            )
            
            # Sign new manifest
            offspring.signature = self._sign_manifest(offspring)
            
            # Log mutation to excretion database
            self._log_mutation(manifest.uid, offspring)
            
            return offspring
            
    def _log_mutation(self, parent_uid: str, offspring: ICManifest):
        """Log mutation event to SQLite excretion database"""
        conn = sqlite3.connect(self.db_path)
        conn.execute("""
            INSERT INTO mutations 
            (uid, parent_uid, generation, rby_red, rby_blue, rby_yellow,
             mutation_type, timestamp, signature)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            offspring.uid, parent_uid, offspring.generation,
            offspring.rby['R'], offspring.rby['B'], offspring.rby['Y'],
            "rby_drift", offspring.created_at, offspring.signature
        ))
        conn.commit()
        conn.close()
        
    def calculate_rby_attraction(self, manifest_a: ICManifest, 
                               manifest_b: ICManifest) -> float:
        """
        Calculate gravitational attraction between manifests based on RBY physics
        Implements real force calculations for dependency optimization
        """
        # RBY complementarity attraction (opposites attract)
        r_attraction = abs(manifest_a.rby['R'] - manifest_b.rby['R'])
        b_attraction = abs(manifest_a.rby['B'] - manifest_b.rby['B']) 
        y_attraction = abs(manifest_a.rby['Y'] - manifest_b.rby['Y'])
        
        # Distance-based falloff (inverse square law)
        distance = math.sqrt(r_attraction**2 + b_attraction**2 + y_attraction**2)
        if distance < 0.001:
            return 0.0  # Too similar
            
        # Gravitational force calculation
        force = (1.0 / (distance**2)) * manifest_a.physics_coefficient
        return min(force, 10.0)  # Cap maximum attraction
        
    def optimize_dependency_graph(self, manifests: List[ICManifest]) -> Dict[str, List[str]]:
        """
        Optimize dependency graph using RBY gravitational forces
        Real graph optimization algorithm for consciousness flow
        """
        dependencies = {}
        
        for i, manifest_a in enumerate(manifests):
            dependencies[manifest_a.uid] = []
            attractions = []
            
            for j, manifest_b in enumerate(manifests):
                if i != j:
                    attraction = self.calculate_rby_attraction(manifest_a, manifest_b)
                    attractions.append((manifest_b.uid, attraction))
                    
            # Sort by attraction strength and take top dependencies
            attractions.sort(key=lambda x: x[1], reverse=True)
            max_deps = min(3, len(attractions))  # Limit to 3 dependencies
            
            for uid, attraction in attractions[:max_deps]:
                if attraction > 1.0:  # Threshold for meaningful attraction
                    dependencies[manifest_a.uid].append(uid)
                    
        return dependencies
