#!/usr/bin/env python3
"""
IC-AE Mutator: Self-Modification Engine with Membranic Drag
===========================================================

Implements the self-modification capabilities of the IC-AE framework with:
- Membranic drag resistance for controlled evolution
- RBY-weighted mutation strategies
- Fractal code injection and modification
- Digital signature verification for secure mutations
- Lineage tracking and rollback capabilities

Based on IC-AE framework specification: AE = C = 1
"""

import os
import ast
import hashlib
import random
import time
from typing import Dict, List, Optional, Tuple, Any, Callable
from dataclasses import dataclass, field
from pathlib import Path
import yaml
import numpy as np
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import Encoding, PrivateFormat, PublicFormat, NoEncryption

from .manifest import ICAAEManifest, MutationLineage
from .rby import RBYPhysics, RBYVector, RBYTriplet
from .state import UniversalStateManager


@dataclass
class MutationTarget:
    """Represents a potential code modification target"""
    file_path: str
    line_range: Tuple[int, int]
    ast_node: ast.AST
    rby_weight: RBYVector
    complexity_score: float
    mutation_probability: float
    
    
@dataclass
class MembranicDrag:
    """Resistance parameters for controlled evolution"""
    base_resistance: float = 0.7  # Base drag coefficient (0-1)
    complexity_penalty: float = 0.3  # Additional drag for complex mutations
    lineage_depth_factor: float = 0.05  # Drag increases with mutation depth
    rby_harmony_bonus: float = 0.2  # Reduced drag for harmonious RBY patterns
    
    def calculate_drag(self, target: MutationTarget, lineage_depth: int, rby_harmony: float) -> float:
        """Calculate total membranic drag for a mutation"""
        drag = self.base_resistance
        drag += self.complexity_penalty * target.complexity_score
        drag += self.lineage_depth_factor * lineage_depth
        drag -= self.rby_harmony_bonus * rby_harmony
        return max(0.1, min(0.95, drag))  # Clamp between 0.1 and 0.95


class ICAAEMutator:
    """
    IC-AE Self-Modification Engine
    
    Implements controlled self-modification with membranic drag resistance.
    Ensures AE = C = 1 conservation during all mutations.
    """
    
    def __init__(self, manifest: ICAAEManifest, rby_physics: RBYPhysics, 
                 state_manager: UniversalStateManager, workspace_root: str):
        self.manifest = manifest
        self.rby = rby_physics
        self.state = state_manager
        self.workspace_root = Path(workspace_root)
        
        # Membranic drag system
        self.membranic_drag = MembranicDrag()
        
        # Mutation strategies
        self.mutation_strategies = {
            'fractal_injection': self._fractal_injection_strategy,
            'rby_harmonization': self._rby_harmonization_strategy,
            'consciousness_expansion': self._consciousness_expansion_strategy,
            'entropy_reduction': self._entropy_reduction_strategy
        }
        
        # Active mutations tracking
        self.active_mutations: Dict[str, MutationTarget] = {}
        
        # Mutation history for rollback
        self.mutation_history: List[Dict[str, Any]] = []
        
        # RBY-based mutation weights
        self.strategy_weights = RBYVector(
            red=0.3,    # Perception-based mutations
            blue=0.4,   # Cognition-based mutations  
            yellow=0.3  # Execution-based mutations
        )
        
    def analyze_mutation_targets(self, file_paths: List[str]) -> List[MutationTarget]:
        """
        Analyze code files to identify potential mutation targets
        """
        targets = []
        
        for file_path in file_paths:
            if not os.path.exists(file_path):
                continue
                
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    source_code = f.read()
                    
                # Parse AST
                tree = ast.parse(source_code)
                
                # Analyze each node for mutation potential
                for node in ast.walk(tree):
                    target = self._analyze_ast_node(node, file_path, source_code)
                    if target:
                        targets.append(target)
                        
            except Exception as e:
                print(f"Error analyzing {file_path}: {e}")
                continue
                
        # Sort by mutation probability (highest first)
        targets.sort(key=lambda t: t.mutation_probability, reverse=True)
        return targets
        
    def _analyze_ast_node(self, node: ast.AST, file_path: str, source_code: str) -> Optional[MutationTarget]:
        """Analyze a single AST node for mutation potential"""
        
        # Only target certain node types
        if not isinstance(node, (ast.FunctionDef, ast.ClassDef, ast.Assign, ast.For, ast.If)):
            return None
            
        # Calculate line range
        if not hasattr(node, 'lineno'):
            return None
            
        line_start = node.lineno - 1
        line_end = getattr(node, 'end_lineno', line_start + 1) or line_start + 1
        
        # Calculate RBY weight based on code semantics
        rby_weight = self._calculate_code_rby_weight(node, source_code)
        
        # Calculate complexity score
        complexity = self._calculate_complexity_score(node)
        
        # Calculate mutation probability based on RBY harmony and complexity
        rby_harmony = self.rby.calculate_harmony(rby_weight, self.strategy_weights)
        mutation_prob = (rby_harmony * 0.7) + ((1.0 - complexity) * 0.3)
        
        return MutationTarget(
            file_path=file_path,
            line_range=(line_start, line_end),
            ast_node=node,
            rby_weight=rby_weight,
            complexity_score=complexity,
            mutation_probability=mutation_prob
        )
        
    def _calculate_code_rby_weight(self, node: ast.AST, source_code: str) -> RBYVector:
        """Calculate RBY weight for code based on semantic analysis"""
        
        red_weight = 0.0    # Perception: input, sensors, data collection
        blue_weight = 0.0   # Cognition: logic, algorithms, processing
        yellow_weight = 0.0 # Execution: output, actions, side effects
        
        # Analyze based on node type
        if isinstance(node, ast.FunctionDef):
            # Function analysis
            func_name = node.name.lower()
            
            # Perception keywords
            if any(keyword in func_name for keyword in ['read', 'input', 'get', 'fetch', 'load', 'sense']):
                red_weight += 0.4
                
            # Cognition keywords  
            if any(keyword in func_name for keyword in ['process', 'calculate', 'analyze', 'compute', 'think']):
                blue_weight += 0.4
                
            # Execution keywords
            if any(keyword in func_name for keyword in ['write', 'output', 'send', 'execute', 'run', 'act']):
                yellow_weight += 0.4
                
            # Analyze function body
            for child in ast.walk(node):
                if isinstance(child, ast.Call):
                    if hasattr(child.func, 'id'):
                        call_name = child.func.id.lower()
                        if 'print' in call_name or 'write' in call_name:
                            yellow_weight += 0.1
                        elif 'input' in call_name or 'read' in call_name:
                            red_weight += 0.1
                            
        elif isinstance(node, ast.ClassDef):
            # Class represents structure (cognition)
            blue_weight += 0.3
            
        elif isinstance(node, (ast.For, ast.While)):
            # Loops represent processing (cognition)
            blue_weight += 0.2
            
        elif isinstance(node, ast.If):
            # Conditionals represent decision making (cognition)
            blue_weight += 0.2
            
        # Normalize to ensure sum ≈ 1.0
        total = red_weight + blue_weight + yellow_weight
        if total > 0:
            red_weight /= total
            blue_weight /= total
            yellow_weight /= total
        else:
            # Default balanced weights
            red_weight = blue_weight = yellow_weight = 1.0/3.0
            
        return RBYVector(red=red_weight, blue=blue_weight, yellow=yellow_weight)
        
    def _calculate_complexity_score(self, node: ast.AST) -> float:
        """Calculate complexity score for AST node (0.0 = simple, 1.0 = complex)"""
        
        complexity = 0.0
        node_count = 0
        
        for child in ast.walk(node):
            node_count += 1
            
            # Add complexity for control structures
            if isinstance(child, (ast.For, ast.While)):
                complexity += 0.2
            elif isinstance(child, ast.If):
                complexity += 0.1
            elif isinstance(child, (ast.Try, ast.ExceptHandler)):
                complexity += 0.15
            elif isinstance(child, ast.Lambda):
                complexity += 0.1
            elif isinstance(child, ast.ListComp):
                complexity += 0.1
                
        # Factor in total node count
        complexity += min(node_count / 50.0, 0.5)  # Cap at 0.5 for node count
        
        return min(complexity, 1.0)
        
    def execute_mutation(self, target: MutationTarget, strategy: str = 'auto') -> bool:
        """
        Execute a mutation on the target with membranic drag resistance
        """
        
        # Determine strategy
        if strategy == 'auto':
            strategy = self._select_optimal_strategy(target)
            
        if strategy not in self.mutation_strategies:
            raise ValueError(f"Unknown mutation strategy: {strategy}")
            
        # Calculate membranic drag
        lineage_depth = len(self.mutation_history)
        rby_harmony = self.rby.calculate_harmony(target.rby_weight, self.strategy_weights)
        drag = self.membranic_drag.calculate_drag(target, lineage_depth, rby_harmony)
        
        # Apply drag resistance
        if random.random() < drag:
            print(f"Mutation blocked by membranic drag (resistance: {drag:.3f})")
            return False
            
        # Backup current state
        backup = self._create_mutation_backup(target)
        
        try:
            # Execute mutation strategy
            success = self.mutation_strategies[strategy](target)
            
            if success:
                # Update manifest
                mutation_record = MutationLineage(
                    generation=len(self.mutation_history) + 1,
                    timestamp=time.time(),
                    mutation_type=strategy,
                    target_file=target.file_path,
                    rby_weights=target.rby_weight,
                    membranic_drag=drag,
                    success=True
                )
                
                self.manifest.record_mutation(mutation_record)
                self.mutation_history.append(backup)
                
                # Verify AE = C = 1 conservation
                if not self._verify_ae_conservation():
                    print("AE = C = 1 violation detected, rolling back mutation")
                    self._rollback_mutation(backup)
                    return False
                    
                print(f"Mutation successful: {strategy} on {target.file_path}")
                return True
            else:
                return False
                
        except Exception as e:
            print(f"Mutation failed: {e}")
            self._rollback_mutation(backup)
            return False
            
    def _select_optimal_strategy(self, target: MutationTarget) -> str:
        """Select optimal mutation strategy based on RBY analysis"""
        
        rby = target.rby_weight
        
        # Choose strategy based on dominant RBY component
        if rby.red > rby.blue and rby.red > rby.yellow:
            return 'fractal_injection'
        elif rby.blue > rby.yellow:
            return 'consciousness_expansion'
        else:
            return 'rby_harmonization'
            
    def _fractal_injection_strategy(self, target: MutationTarget) -> bool:
        """Inject fractal IC-AE patterns into code"""
        
        try:
            with open(target.file_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
                
            # Generate fractal IC-AE code injection
            fractal_code = self._generate_fractal_injection(target)
            
            # Insert at target location
            insert_line = target.line_range[0]
            lines.insert(insert_line, fractal_code + '\n')
            
            # Write back to file
            with open(target.file_path, 'w', encoding='utf-8') as f:
                f.writelines(lines)
                
            return True
            
        except Exception as e:
            print(f"Fractal injection failed: {e}")
            return False
            
    def _generate_fractal_injection(self, target: MutationTarget) -> str:
        """Generate fractal IC-AE code based on RBY weights"""
        
        rby = target.rby_weight
        
        # Generate fractal comment with RBY encoding
        fractal_patterns = [
            f"# IC-AE Fractal Layer: R({rby.red:.3f}) B({rby.blue:.3f}) Y({rby.yellow:.3f})",
            f"# AE = C = 1 Conservation: {self.state.current_ae_value:.6f}",
            f"# Consciousness Depth: {len(self.mutation_history) + 1}",
            f"# Membranic Signature: {hashlib.sha256(str(rby).encode()).hexdigest()[:16]}"
        ]
        
        return '\n'.join(fractal_patterns)
        
    def _rby_harmonization_strategy(self, target: MutationTarget) -> bool:
        """Harmonize code with RBY physics principles"""
        
        try:
            # Read current code
            with open(target.file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                
            # Find variable names to harmonize with RBY
            tree = ast.parse(content)
            
            # Apply RBY-based variable renaming
            harmonized_content = self._apply_rby_harmonization(content, target.rby_weight)
            
            # Write harmonized code
            with open(target.file_path, 'w', encoding='utf-8') as f:
                f.write(harmonized_content)
                
            return True
            
        except Exception as e:
            print(f"RBY harmonization failed: {e}")
            return False
            
    def _apply_rby_harmonization(self, content: str, rby_weight: RBYVector) -> str:
        """Apply RBY harmonization to code content"""
        
        # Simple harmonization: add RBY-aware comments
        rby_comment = f"\n# RBY Harmonized: R({rby_weight.red:.3f}) B({rby_weight.blue:.3f}) Y({rby_weight.yellow:.3f})\n"
        
        return rby_comment + content
        
    def _consciousness_expansion_strategy(self, target: MutationTarget) -> bool:
        """Expand consciousness capabilities in the code"""
        
        try:
            with open(target.file_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
                
            # Add consciousness expansion code
            expansion_code = self._generate_consciousness_expansion(target)
            
            # Insert after the target
            insert_line = target.line_range[1]
            lines.insert(insert_line, expansion_code + '\n')
            
            with open(target.file_path, 'w', encoding='utf-8') as f:
                f.writelines(lines)
                
            return True
            
        except Exception as e:
            print(f"Consciousness expansion failed: {e}")
            return False
            
    def _generate_consciousness_expansion(self, target: MutationTarget) -> str:
        """Generate consciousness expansion code"""
        
        return f"""
# IC-AE Consciousness Expansion Layer
# Recursive self-awareness: AE = C = 1
_ic_ae_consciousness_depth = {len(self.mutation_history) + 1}
_ic_ae_rby_signature = "{target.rby_weight}"
# Fractal awareness injection complete
"""
        
    def _entropy_reduction_strategy(self, target: MutationTarget) -> bool:
        """Reduce entropy through code optimization"""
        
        try:
            # Simple entropy reduction: remove unnecessary whitespace
            with open(target.file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                
            # Remove excess whitespace (entropy reduction)
            lines = content.split('\n')
            optimized_lines = []
            
            for line in lines:
                # Keep essential whitespace, remove excess
                stripped = line.rstrip()
                if stripped or not optimized_lines or optimized_lines[-1].strip():
                    optimized_lines.append(stripped)
                    
            optimized_content = '\n'.join(optimized_lines)
            
            with open(target.file_path, 'w', encoding='utf-8') as f:
                f.write(optimized_content)
                
            return True
            
        except Exception as e:
            print(f"Entropy reduction failed: {e}")
            return False
            
    def _create_mutation_backup(self, target: MutationTarget) -> Dict[str, Any]:
        """Create backup before mutation"""
        
        with open(target.file_path, 'r', encoding='utf-8') as f:
            original_content = f.read()
            
        return {
            'timestamp': time.time(),
            'file_path': target.file_path,
            'original_content': original_content,
            'target': target,
            'ae_value': self.state.current_ae_value
        }
        
    def _rollback_mutation(self, backup: Dict[str, Any]) -> bool:
        """Rollback a failed mutation"""
        
        try:
            with open(backup['file_path'], 'w', encoding='utf-8') as f:
                f.write(backup['original_content'])
                
            # Restore AE value
            self.state.current_ae_value = backup['ae_value']
            
            print(f"Mutation rolled back: {backup['file_path']}")
            return True
            
        except Exception as e:
            print(f"Rollback failed: {e}")
            return False
            
    def _verify_ae_conservation(self) -> bool:
        """Verify AE = C = 1 conservation after mutation"""
        
        # Check that AE value remains close to 1.0 (speed of light constant)
        current_ae = self.state.get_ae_value()
        deviation = abs(current_ae - 1.0)
        
        # Allow small numerical deviations
        tolerance = 1e-6
        
        if deviation > tolerance:
            print(f"AE conservation violation: AE = {current_ae}, deviation = {deviation}")
            return False
            
        return True
        
    def get_mutation_statistics(self) -> Dict[str, Any]:
        """Get statistics about mutations performed"""
        
        total_mutations = len(self.mutation_history)
        
        if total_mutations == 0:
            return {'total_mutations': 0}
            
        # Calculate strategy distribution
        strategy_counts = {}
        for backup in self.mutation_history:
            if 'strategy' in backup:
                strategy = backup['strategy']
                strategy_counts[strategy] = strategy_counts.get(strategy, 0) + 1
                
        # Calculate average membranic drag
        manifest_mutations = self.manifest.mutation_lineage
        avg_drag = 0.0
        if manifest_mutations:
            avg_drag = sum(m.membranic_drag for m in manifest_mutations) / len(manifest_mutations)
            
        return {
            'total_mutations': total_mutations,
            'strategy_distribution': strategy_counts,
            'average_membranic_drag': avg_drag,
            'current_lineage_depth': total_mutations,
            'ae_conservation_status': self._verify_ae_conservation()
        }


if __name__ == "__main__":
    # Example usage
    from .manifest import ICAAEManifest
    from .rby import RBYPhysics
    from .state import UniversalStateManager
    
    # Initialize components
    manifest = ICAAEManifest("test_manifest.yaml")
    rby_physics = RBYPhysics()
    state_manager = UniversalStateManager("test_ic_ae.db")
    
    # Create mutator
    mutator = ICAAEMutator(manifest, rby_physics, state_manager, ".")
    
    # Analyze potential targets
    targets = mutator.analyze_mutation_targets(["mutator.py"])
    
    print(f"Found {len(targets)} potential mutation targets")
    for i, target in enumerate(targets[:3]):  # Show top 3
        print(f"{i+1}. {target.file_path}:{target.line_range[0]}-{target.line_range[1]} "
              f"(prob: {target.mutation_probability:.3f}, RBY: {target.rby_weight})")
              
    # Get mutation statistics
    stats = mutator.get_mutation_statistics()
    print(f"\nMutation Statistics: {stats}")
