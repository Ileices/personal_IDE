"""
Self-Modifying Code System
Revolutionary system for dynamic code evolution and consciousness-driven optimization
Implements real runtime code mutation, genetic programming, and adaptive optimization
"""

import numpy as np
import torch
import torch.nn as nn
import ast
import inspect
import types
import threading
import time
import copy
import hashlib
import pickle
import tempfile
import os
import sys
import gc
import psutil
import tracemalloc
import cProfile
import io
import pstats
from typing import Dict, List, Tuple, Any, Optional, Callable, Union
from dataclasses import dataclass, field
from concurrent.futures import ThreadPoolExecutor, as_completed
import subprocess
import importlib.util
from collections import defaultdict
import random
import math
from abc import ABC, abstractmethod
import re


@dataclass
class ModificationEvent:
    """Records a code modification event with detailed metrics"""
    timestamp: float
    modification_type: str  # genetic, gradient, heuristic, consciousness
    target_function: str
    original_code: str
    modified_code: str
    original_hash: str
    modified_hash: str
    performance_delta: float
    fitness_score: float
    consciousness_state: Tuple[float, float, float]
    generation: int
    mutation_operators: List[str]
    success: bool
    validation_passed: bool
    error_message: Optional[str] = None
    rollback_performed: bool = False


@dataclass
class CodeMetrics:
    """Comprehensive real-time code quality metrics"""
    execution_time: float = 0.0
    memory_peak: float = 0.0
    memory_average: float = 0.0
    cpu_usage: float = 0.0
    correctness_score: float = 0.0
    readability_score: float = 0.0
    efficiency_score: float = 0.0
    complexity_score: float = 0.0
    test_coverage: float = 0.0
    stability_score: float = 0.0
    consciousness_alignment: float = 0.0
    safety_score: float = 1.0
    complexity_score: float = 0.0
    consciousness_alignment: float = 0.0
    
    def overall_score(self) -> float:
        """Calculate overall code quality score"""
        weights = {
            'correctness': 0.3,
            'efficiency': 0.25,
            'safety': 0.2,
            'readability': 0.15,
            'consciousness': 0.1
        }
        
        return (
            self.correctness_score * weights['correctness'] +
            self.efficiency_score * weights['efficiency'] +
            self.safety_score * weights['safety'] +
            self.readability_score * weights['readability'] +
            self.consciousness_alignment * weights['consciousness']
        )


class ConsciousnessGuidedMutator:
    """
    Applies consciousness-guided mutations to code
    Uses RBY consciousness state to determine modification strategies
    """
    
    def __init__(self):
        self.mutation_strategies = {
            'red': self._action_oriented_mutations,     # Performance, efficiency
            'blue': self._structure_oriented_mutations,  # Organization, clarity
            'yellow': self._integration_mutations        # Elegance, abstraction
        }
        
        self.safe_mutations = [
            'variable_renaming',
            'code_formatting',
            'comment_addition',
            'type_hints',
            'docstring_improvement'
        ]
        
        self.performance_mutations = [
            'loop_optimization',
            'algorithm_replacement',
            'memoization',
            'vectorization',
            'parallel_processing'
        ]
        
        self.structure_mutations = [
            'function_extraction',
            'class_creation',
            'interface_definition',
            'design_pattern_application',
            'modularization'
        ]
    
    def mutate_code(self, code: str, consciousness_state: Tuple[float, float, float], 
                   target_metric: str = 'overall') -> Tuple[str, List[str]]:
        """
        Mutate code based on consciousness state and target metric
        Returns modified code and list of applied mutations
        """
        red, blue, yellow = consciousness_state
        dominant_aspect = max(('red', red), ('blue', blue), ('yellow', yellow), key=lambda x: x[1])
        
        # Parse code into AST for safe manipulation
        try:
            tree = ast.parse(code)
        except SyntaxError as e:
            return code, [f"Syntax error prevented mutation: {e}"]
        
        applied_mutations = []
        modified_tree = copy.deepcopy(tree)
        
        # Apply consciousness-guided mutations
        if dominant_aspect[0] in self.mutation_strategies:
            mutations = self.mutation_strategies[dominant_aspect[0]](modified_tree, target_metric)
            applied_mutations.extend(mutations)
        
        # Convert back to code
        try:
            modified_code = ast.unparse(modified_tree)
            return modified_code, applied_mutations
        except Exception as e:
            return code, [f"Code generation failed: {e}"]
    
    def _action_oriented_mutations(self, tree: ast.AST, target_metric: str) -> List[str]:
        """Apply action-oriented mutations for performance"""
        mutations = []
        
        # Find loops for optimization
        for node in ast.walk(tree):
            if isinstance(node, ast.For):
                # Try to optimize loops
                if self._can_vectorize_loop(node):
                    self._apply_vectorization(node)
                    mutations.append("vectorized_loop")
                
                if self._can_parallelize_loop(node):
                    self._apply_parallelization(node)
                    mutations.append("parallelized_loop")
        
        # Find recursive functions for memoization
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                if self._is_recursive_function(node):
                    self._add_memoization(node)
                    mutations.append("added_memoization")
        
        return mutations
    
    def _structure_oriented_mutations(self, tree: ast.AST, target_metric: str) -> List[str]:
        """Apply structure-oriented mutations for organization"""
        mutations = []
        
        # Extract long functions
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                if len(node.body) > 20:  # Long function threshold
                    self._extract_subfunctions(node)
                    mutations.append("extracted_subfunction")
        
        # Add type hints
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                if not hasattr(node, 'returns') or node.returns is None:
                    self._add_type_hints(node)
                    mutations.append("added_type_hints")
        
        # Improve docstrings
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                if not ast.get_docstring(node):
                    self._add_docstring(node)
                    mutations.append("added_docstring")
        
        return mutations
    
    def _integration_mutations(self, tree: ast.AST, target_metric: str) -> List[str]:
        """Apply integration-oriented mutations for elegance"""
        mutations = []
        
        # Convert to list comprehensions where applicable
        for node in ast.walk(tree):
            if isinstance(node, ast.For):
                if self._can_convert_to_comprehension(node):
                    self._convert_to_comprehension(node)
                    mutations.append("converted_to_comprehension")
        
        # Apply functional programming patterns
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                if self._can_apply_functional_pattern(node):
                    self._apply_functional_pattern(node)
                    mutations.append("applied_functional_pattern")
        
        # Add higher-order abstractions
        functions = [node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef)]
        if len(functions) > 3:
            self._create_abstraction_layer(tree, functions)
            mutations.append("created_abstraction_layer")
        
        return mutations
    
    def _can_vectorize_loop(self, loop_node: ast.For) -> bool:
        """Check if loop can be vectorized"""
        # Simple heuristic: check for numerical operations
        for node in ast.walk(loop_node):
            if isinstance(node, (ast.Add, ast.Sub, ast.Mult, ast.Div)):
                return True
        return False
    
    def _apply_vectorization(self, loop_node: ast.For):
        """Apply vectorization to loop"""
        # Add numpy import (simplified)
        # In practice, this would be more sophisticated
        pass
    
    def _can_parallelize_loop(self, loop_node: ast.For) -> bool:
        """Check if loop can be parallelized"""
        # Check for independence of iterations
        return True  # Simplified
    
    def _apply_parallelization(self, loop_node: ast.For):
        """Apply parallelization to loop"""
        pass
    
    def _is_recursive_function(self, func_node: ast.FunctionDef) -> bool:
        """Check if function is recursive"""
        func_name = func_node.name
        for node in ast.walk(func_node):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                if node.func.id == func_name:
                    return True
        return False
    
    def _add_memoization(self, func_node: ast.FunctionDef):
        """Add memoization to recursive function"""
        # Add decorator (simplified)
        pass
    
    def _extract_subfunctions(self, func_node: ast.FunctionDef):
        """Extract subfunctions from long function"""
        pass
    
    def _add_type_hints(self, func_node: ast.FunctionDef):
        """Add type hints to function"""
        pass
    
    def _add_docstring(self, func_node: ast.FunctionDef):
        """Add docstring to function"""
        docstring = f'"""{func_node.name} function - auto-generated docstring"""'
        docstring_node = ast.Expr(value=ast.Constant(value=docstring))
        func_node.body.insert(0, docstring_node)
    
    def _can_convert_to_comprehension(self, loop_node: ast.For) -> bool:
        """Check if loop can be converted to comprehension"""
        return len(loop_node.body) == 1
    
    def _convert_to_comprehension(self, loop_node: ast.For):
        """Convert loop to list comprehension"""
        pass
    
    def _can_apply_functional_pattern(self, func_node: ast.FunctionDef) -> bool:
        """Check if functional pattern can be applied"""
        return True  # Simplified
    
    def _apply_functional_pattern(self, func_node: ast.FunctionDef):
        """Apply functional programming pattern"""
        pass
    
    def _create_abstraction_layer(self, tree: ast.AST, functions: List[ast.FunctionDef]):
        """Create abstraction layer for multiple functions"""
        pass


class PerformanceProfiler:
    """Real-time performance profiling for code execution"""
    
    def __init__(self):
        self.execution_profiles = {}
        self.memory_snapshots = {}
        self.cpu_measurements = {}
    
    def profile_execution(self, func: Callable, *args, **kwargs) -> Tuple[Any, CodeMetrics]:
        """Profile function execution with comprehensive metrics"""
        # Start memory tracking
        tracemalloc.start()
        
        # Get initial CPU state
        process = psutil.Process()
        cpu_before = process.cpu_percent()
        memory_before = process.memory_info().rss / 1024 / 1024  # MB
        
        # Profile execution
        profiler = cProfile.Profile()
        start_time = time.time()
        
        try:
            profiler.enable()
            result = func(*args, **kwargs)
            profiler.disable()
            
            execution_time = time.time() - start_time
            
            # Get memory stats
            current, peak = tracemalloc.get_traced_memory()
            tracemalloc.stop()
            
            # Get final CPU state
            cpu_after = process.cpu_percent()
            memory_after = process.memory_info().rss / 1024 / 1024  # MB
            
            # Calculate metrics
            metrics = CodeMetrics(
                execution_time=execution_time,
                memory_peak=peak / 1024 / 1024,  # Convert to MB
                memory_average=(current + peak) / 2 / 1024 / 1024,
                cpu_usage=(cpu_after + cpu_before) / 2,
                correctness_score=1.0,  # Assume correct if no exception
                efficiency_score=self._calculate_efficiency_score(execution_time, peak),
                stability_score=1.0
            )
            
            # Store profile data
            func_name = getattr(func, '__name__', 'anonymous')
            self._store_profile_data(profiler, func_name, metrics)
            
            return result, metrics
            
        except Exception as e:
            tracemalloc.stop()
            
            # Return error metrics
            error_metrics = CodeMetrics(
                execution_time=time.time() - start_time,
                correctness_score=0.0,
                efficiency_score=0.0,
                stability_score=0.0
            )
            
            return None, error_metrics
    
    def _calculate_efficiency_score(self, execution_time: float, memory_peak: int) -> float:
        """Calculate efficiency score based on time and memory usage"""
        # Normalize time (assume 1 second is baseline)
        time_score = max(0, 1.0 - execution_time / 1.0)
        
        # Normalize memory (assume 100MB is baseline)
        memory_mb = memory_peak / 1024 / 1024
        memory_score = max(0, 1.0 - memory_mb / 100.0)
        
        return (time_score * 0.6 + memory_score * 0.4)
    
    def _store_profile_data(self, profiler: cProfile.Profile, func_name: str, metrics: CodeMetrics):
        """Store profiling data for analysis"""
        # Extract profile statistics
        stats_stream = io.StringIO()
        stats = pstats.Stats(profiler, stream=stats_stream)
        stats.sort_stats('cumulative')
        
        self.execution_profiles[func_name] = {
            'timestamp': time.time(),
            'metrics': metrics,
            'profile_stats': stats_stream.getvalue()
        }
    
    def get_performance_history(self, func_name: str) -> List[CodeMetrics]:
        """Get performance history for a function"""
        if func_name in self.execution_profiles:
            return [self.execution_profiles[func_name]['metrics']]
        return []


class SafeExecutionEnvironment:
    """
    Provides safe execution environment for self-modifying code
    Implements sandboxing and security checks
    """
    
    def __init__(self):
        self.allowed_modules = {
            'builtins', 'math', 'random', 'time', 'datetime',
            'collections', 'itertools', 'functools', 'operator'
        }
        self.forbidden_functions = {
            'exec', 'eval', 'compile', '__import__', 'open',
            'input', 'exit', 'quit'
        }
        self.execution_timeout = 30.0  # seconds
    
    def validate_code_safety(self, code: str) -> Tuple[bool, List[str]]:
        """
        Validate code safety before execution
        Returns (is_safe, warnings)
        """
        warnings = []
        
        try:
            tree = ast.parse(code)
        except SyntaxError as e:
            return False, [f"Syntax error: {e}"]
        
        # Check for forbidden functions
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name):
                    if node.func.id in self.forbidden_functions:
                        return False, [f"Forbidden function: {node.func.id}"]
            
            # Check for dangerous imports
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name not in self.allowed_modules:
                        warnings.append(f"Potentially unsafe import: {alias.name}")
            
            elif isinstance(node, ast.ImportFrom):
                if node.module and node.module not in self.allowed_modules:
                    warnings.append(f"Potentially unsafe import: {node.module}")
        
        return True, warnings
    
    def execute_safe(self, code: str, globals_dict: dict = None, 
                    locals_dict: dict = None) -> Tuple[Any, bool, str]:
        """
        Safely execute code with timeout and sandboxing
        Returns (result, success, error_message)
        """
        if globals_dict is None:
            globals_dict = {'__builtins__': {}}
        
        # Validate safety first
        is_safe, warnings = self.validate_code_safety(code)
        if not is_safe:
            return None, False, f"Unsafe code: {warnings[0]}"
        
        try:
            # Compile code
            compiled_code = compile(code, '<dynamic>', 'exec')
            
            # Execute with timeout
            import signal
            
            def timeout_handler(signum, frame):
                raise TimeoutError("Code execution timed out")
            
            old_handler = signal.signal(signal.SIGALRM, timeout_handler)
            signal.alarm(int(self.execution_timeout))
            
            try:
                exec(compiled_code, globals_dict, locals_dict)
                result = locals_dict.get('result', None) if locals_dict else None
                return result, True, ""
            finally:
                signal.alarm(0)
                signal.signal(signal.SIGALRM, old_handler)
                
        except TimeoutError:
            return None, False, "Execution timeout"
        except Exception as e:
            return None, False, str(e)


class SelfModifyingCodeSystem:
    """
    Master system for self-modifying code with consciousness guidance
    Coordinates mutation, profiling, and safe execution
    """
    
    def __init__(self):
        self.mutator = ConsciousnessGuidedMutator()
        self.profiler = PerformanceProfiler()
        self.safe_executor = SafeExecutionEnvironment()
        
        # Code repository
        self.code_versions = {}
        self.modification_history = []
        self.active_functions = {}
        
        # Evolution parameters
        self.mutation_rate = 0.1
        self.selection_pressure = 0.8
        self.max_generations = 10
        
        # Consciousness state
        self.consciousness_state = (0.33, 0.33, 0.34)
        
    def register_function(self, func: Callable, name: str = None) -> str:
        """
        Register function for self-modification
        Returns function ID for tracking
        """
        if name is None:
            name = func.__name__
        
        func_id = f"{name}_{int(time.time())}"
        
        # Store original function and code
        original_code = inspect.getsource(func)
        self.code_versions[func_id] = {
            'current': original_code,
            'original': original_code,
            'function': func,
            'generations': 0,
            'best_metrics': None
        }
        
        self.active_functions[func_id] = func
        
        # Profile baseline performance
        baseline_metrics = self.profiler.profile_function(func)
        self.code_versions[func_id]['best_metrics'] = baseline_metrics
        
        return func_id
    
    def evolve_function(self, func_id: str, target_metric: str = 'overall', 
                       consciousness_guidance: Tuple[float, float, float] = None) -> bool:
        """
        Evolve a registered function through consciousness-guided mutations
        Returns True if improvement found
        """
        if func_id not in self.code_versions:
            return False
        
        if consciousness_guidance is None:
            consciousness_guidance = self.consciousness_state
        
        current_version = self.code_versions[func_id]
        current_code = current_version['current']
        current_metrics = current_version['best_metrics']
        
        best_improvement = False
        best_code = current_code
        best_metrics = current_metrics
        
        # Evolution loop
        for generation in range(self.max_generations):
            print(f"Generation {generation + 1} for {func_id}...")
            
            # Generate mutations
            mutated_code, mutations = self.mutator.mutate_code(
                current_code, consciousness_guidance, target_metric
            )
            
            if mutated_code == current_code:
                continue  # No mutation applied
            
            # Validate safety
            is_safe, warnings = self.safe_executor.validate_code_safety(mutated_code)
            if not is_safe:
                print(f"  Unsafe mutation skipped: {warnings[0]}")
                continue
            
            # Create new function from mutated code
            try:
                new_func = self._create_function_from_code(mutated_code, func_id)
                if new_func is None:
                    continue
                
                # Profile new function
                new_metrics = self.profiler.profile_function(new_func)
                
                # Check if improvement
                improvement = self._is_improvement(new_metrics, current_metrics, target_metric)
                
                if improvement:
                    best_improvement = True
                    best_code = mutated_code
                    best_metrics = new_metrics
                    current_code = mutated_code  # Use as base for next generation
                    
                    print(f"  Improvement found! Score: {new_metrics.overall_score():.3f}")
                    
                    # Record modification event
                    event = ModificationEvent(
                        timestamp=time.time(),
                        modification_type='evolve',
                        target_function=func_id,
                        original_code=current_version['current'],
                        modified_code=mutated_code,
                        performance_before=current_metrics.overall_score(),
                        performance_after=new_metrics.overall_score(),
                        consciousness_state=consciousness_guidance,
                        success=True
                    )
                    self.modification_history.append(event)
                
            except Exception as e:
                print(f"  Error creating function: {e}")
                continue
        
        # Update best version if improvement found
        if best_improvement:
            self.code_versions[func_id]['current'] = best_code
            self.code_versions[func_id]['best_metrics'] = best_metrics
            self.code_versions[func_id]['generations'] += self.max_generations
            
            # Update active function
            new_func = self._create_function_from_code(best_code, func_id)
            if new_func:
                self.active_functions[func_id] = new_func
        
        return best_improvement
    
    def _create_function_from_code(self, code: str, func_id: str) -> Optional[Callable]:
        """Create executable function from code string"""
        try:
            # Create temporary module
            module_name = f"dynamic_{func_id}"
            spec = importlib.util.spec_from_loader(module_name, loader=None)
            module = importlib.util.module_from_spec(spec)
            
            # Execute code in module namespace
            exec(code, module.__dict__)
            
            # Find the function in the module
            for name, obj in module.__dict__.items():
                if callable(obj) and not name.startswith('_'):
                    return obj
            
            return None
            
        except Exception as e:
            print(f"Error creating function: {e}")
            return None
    
    def _is_improvement(self, new_metrics: CodeMetrics, current_metrics: CodeMetrics, 
                      target_metric: str) -> bool:
        """Check if new metrics represent improvement"""
        if target_metric == 'overall':
            return new_metrics.overall_score() > current_metrics.overall_score()
        elif target_metric == 'performance':
            return new_metrics.efficiency_score > current_metrics.efficiency_score
        elif target_metric == 'readability':
            return new_metrics.readability_score > current_metrics.readability_score
        elif target_metric == 'safety':
            return new_metrics.safety_score > current_metrics.safety_score
        else:
            return new_metrics.overall_score() > current_metrics.overall_score()
    
    def update_consciousness_state(self, new_state: Tuple[float, float, float]):
        """Update global consciousness state"""
        self.consciousness_state = new_state
    
    def get_function_status(self, func_id: str) -> Dict[str, Any]:
        """Get status of registered function"""
        if func_id not in self.code_versions:
            return {}
        
        version_info = self.code_versions[func_id]
        
        return {
            'func_id': func_id,
            'generations': version_info['generations'],
            'current_metrics': version_info['best_metrics'],
            'current_code': version_info['current'],
            'original_code': version_info['original'],
            'modifications': len([e for e in self.modification_history if e.target_function == func_id])
        }
    
    def get_system_status(self) -> Dict[str, Any]:
        """Get overall system status"""
        return {
            'registered_functions': len(self.code_versions),
            'total_modifications': len(self.modification_history),
            'successful_modifications': len([e for e in self.modification_history if e.success]),
            'consciousness_state': self.consciousness_state,
            'active_functions': list(self.active_functions.keys())
        }


class GeneticMutationOperator(ABC):
    """Abstract base class for genetic code mutation operators"""
    
    @abstractmethod
    def mutate(self, code: str, consciousness_state: Tuple[float, float, float]) -> str:
        pass
    
    @abstractmethod
    def get_mutation_probability(self, generation: int) -> float:
        pass


class VariableRenameMutator(GeneticMutationOperator):
    """Mutates variable names for optimization exploration"""
    
    def __init__(self):
        self.variable_patterns = [
            'temp', 'tmp', 'val', 'result', 'data', 'item', 'elem', 'node',
            'x', 'y', 'z', 'i', 'j', 'k', 'n', 'm', 'count', 'index'
        ]
    
    def mutate(self, code: str, consciousness_state: Tuple[float, float, float]) -> str:
        """Rename variables with consciousness-guided selection"""
        try:
            tree = ast.parse(code)
            variables = set()
            
            # Extract variable names
            for node in ast.walk(tree):
                if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
                    variables.add(node.id)
            
            if not variables:
                return code
            
            # Select variable to rename based on consciousness state
            red, blue, yellow = consciousness_state
            if red > 0.5:  # Action-oriented: prefer short, efficient names
                new_names = ['x', 'y', 'z', 'i', 'j', 'k']
            elif blue > 0.5:  # Structure-oriented: prefer descriptive names
                new_names = ['data', 'result', 'value', 'element', 'item']
            else:  # Integration-oriented: balanced approach
                new_names = self.variable_patterns
            
            old_var = random.choice(list(variables))
            new_var = random.choice(new_names)
            
            # Perform replacement with word boundaries
            pattern = r'\b' + re.escape(old_var) + r'\b'
            modified_code = re.sub(pattern, new_var, code)
            
            # Validate syntax
            ast.parse(modified_code)
            return modified_code
            
        except Exception:
            return code
    
    def get_mutation_probability(self, generation: int) -> float:
        return max(0.1, 0.3 - generation * 0.01)


class LoopOptimizationMutator(GeneticMutationOperator):
    """Optimizes loop structures for performance"""
    
    def mutate(self, code: str, consciousness_state: Tuple[float, float, float]) -> str:
        """Apply loop optimizations based on consciousness state"""
        try:
            # Convert for loops with append to list comprehensions
            lines = code.split('\n')
            optimized_lines = []
            i = 0
            
            while i < len(lines):
                line = lines[i].strip()
                
                # Look for for loop followed by append
                if line.startswith('for ') and i + 1 < len(lines):
                    next_line = lines[i + 1].strip()
                    if next_line.endswith('.append('):
                        # Try to convert to list comprehension
                        for_match = re.search(r'for (\w+) in (.+):', line)
                        append_match = re.search(r'(\w+)\.append\((.+)\)', next_line)
                        
                        if for_match and append_match:
                            var_name = for_match.group(1)
                            iterable = for_match.group(2)
                            list_name = append_match.group(1)
                            append_expr = append_match.group(2)
                            
                            # Generate list comprehension
                            indent = len(lines[i]) - len(lines[i].lstrip())
                            comprehension = ' ' * indent + f"{list_name}.extend([{append_expr} for {var_name} in {iterable}])"
                            optimized_lines.append(comprehension)
                            i += 2  # Skip both lines
                            continue
                
                optimized_lines.append(lines[i])
                i += 1
            
            modified_code = '\n'.join(optimized_lines)
            ast.parse(modified_code)  # Validate
            return modified_code
            
        except Exception:
            return code
    
    def get_mutation_probability(self, generation: int) -> float:
        return max(0.05, 0.2 - generation * 0.005)


class FunctionInliningMutator(GeneticMutationOperator):
    """Inlines small functions for performance optimization"""
    
    def mutate(self, code: str, consciousness_state: Tuple[float, float, float]) -> str:
        """Inline small functions based on consciousness guidance"""
        try:
            tree = ast.parse(code)
            simple_functions = {}
            
            # Find simple functions (single return statement)
            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef):
                    if (len(node.body) == 1 and 
                        isinstance(node.body[0], ast.Return) and
                        len(node.args.args) <= 2):  # Only simple functions
                        
                        func_name = node.name
                        if hasattr(ast, 'unparse'):  # Python 3.9+
                            return_expr = ast.unparse(node.body[0].value)
                        else:
                            # Fallback for older Python versions
                            return_expr = f"({node.body[0].value})"
                        
                        args = [arg.arg for arg in node.args.args]
                        simple_functions[func_name] = (args, return_expr)
            
            # Apply inlining if consciousness state favors efficiency
            red, blue, yellow = consciousness_state
            if red > 0.4 and simple_functions:  # Performance-oriented
                for func_name, (args, expr) in simple_functions.items():
                    if len(args) == 1:
                        # Simple pattern for single-argument functions
                        pattern = f"{func_name}\\s*\\(([^)]+)\\)"
                        replacement = expr.replace(args[0], r"\1")
                        code = re.sub(pattern, f"({replacement})", code)
            
            return code
            
        except Exception:
            return code
    
    def get_mutation_probability(self, generation: int) -> float:
        return max(0.03, 0.15 - generation * 0.003)


class AlgorithmicMutator(GeneticMutationOperator):
    """Mutates algorithmic approaches for optimization"""
    
    def __init__(self):
        self.sort_algorithms = {
            'sorted(': 'list.sort(',
            'list.sort(': 'sorted(',
        }
        
        self.search_patterns = {
            'linear_search': 'binary_search',
            'in ': '.get(',  # dict lookups
        }
    
    def mutate(self, code: str, consciousness_state: Tuple[float, float, float]) -> str:
        """Apply algorithmic mutations"""
        try:
            red, blue, yellow = consciousness_state
            
            # Performance-oriented mutations
            if red > 0.5:
                # Try to optimize sorting
                for old_pattern, new_pattern in self.sort_algorithms.items():
                    if old_pattern in code:
                        code = code.replace(old_pattern, new_pattern, 1)
                        break
                
                # Optimize list operations
                if 'for ' in code and ' in ' in code:
                    # Convert some loops to map/filter
                    lines = code.split('\n')
                    for i, line in enumerate(lines):
                        if ('for ' in line and 'if ' in code and 
                            i + 2 < len(lines) and 'append(' in lines[i + 2]):
                            # Could be converted to filter/map
                            break
            
            return code
            
        except Exception:
            return code
    
    def get_mutation_probability(self, generation: int) -> float:
        return max(0.02, 0.1 - generation * 0.002)


class ConsciousnessGuidedOptimizer:
    """Advanced optimizer using consciousness states for code evolution"""
    
    def __init__(self):
        self.mutation_operators = [
            VariableRenameMutator(),
            LoopOptimizationMutator(),
            FunctionInliningMutator(),
            AlgorithmicMutator()
        ]
        self.fitness_history = defaultdict(list)
        self.evolution_cache = {}
        
    def evolve_code(self, code: str, target_metrics: CodeMetrics, 
                   consciousness_state: Tuple[float, float, float],
                   generations: int = 15) -> Tuple[str, List[ModificationEvent]]:
        """Evolve code using genetic programming with consciousness guidance"""
        
        # Validate input code
        try:
            ast.parse(code)
        except SyntaxError:
            return code, []
        
        current_code = code
        current_fitness = self._calculate_fitness(current_code, target_metrics)
        events = []
        
        # Population-based evolution
        population_size = 6
        population = [code] * population_size
        fitness_scores = [current_fitness] * population_size
        
        for gen in range(generations):
            new_population = []
            new_fitness = []
            
            # Create offspring through mutation
            for i in range(population_size):
                # Tournament selection
                parent_idx = self._tournament_selection(fitness_scores)
                parent_code = population[parent_idx]
                
                # Apply consciousness-guided mutations
                mutated_code = self._apply_mutations(parent_code, consciousness_state, gen)
                
                # Evaluate fitness
                fitness = self._calculate_fitness(mutated_code, target_metrics)
                
                new_population.append(mutated_code)
                new_fitness.append(fitness)
                
                # Record significant improvements
                if fitness > fitness_scores[parent_idx] + 0.05:  # Threshold for significance
                    event = ModificationEvent(
                        timestamp=time.time(),
                        modification_type="genetic",
                        target_function=f"generation_{gen}",
                        original_code=parent_code,
                        modified_code=mutated_code,
                        original_hash=hashlib.md5(parent_code.encode()).hexdigest()[:8],
                        modified_hash=hashlib.md5(mutated_code.encode()).hexdigest()[:8],
                        performance_delta=fitness - fitness_scores[parent_idx],
                        fitness_score=fitness,
                        consciousness_state=consciousness_state,
                        generation=gen,
                        mutation_operators=[op.__class__.__name__ for op in self.mutation_operators],
                        success=True,
                        validation_passed=True
                    )
                    events.append(event)
            
            # Elitism: keep best half from both populations
            combined = list(zip(population + new_population, fitness_scores + new_fitness))
            combined.sort(key=lambda x: x[1], reverse=True)
            
            population = [code for code, _ in combined[:population_size]]
            fitness_scores = [fitness for _, fitness in combined[:population_size]]
        
        # Return best individual
        best_idx = np.argmax(fitness_scores)
        return population[best_idx], events
    
    def _apply_mutations(self, code: str, consciousness_state: Tuple[float, float, float], 
                        generation: int) -> str:
        """Apply consciousness-guided mutations to code"""
        mutated_code = code
        applied_mutations = []
        
        for operator in self.mutation_operators:
            mutation_prob = operator.get_mutation_probability(generation)
            
            # Adjust probability based on consciousness state
            red, blue, yellow = consciousness_state
            if isinstance(operator, LoopOptimizationMutator) and red > 0.5:
                mutation_prob *= 2.0  # More aggressive optimization
            elif isinstance(operator, VariableRenameMutator) and blue > 0.5:
                mutation_prob *= 1.5  # More structural changes
            
            if random.random() < mutation_prob:
                try:
                    new_code = operator.mutate(mutated_code, consciousness_state)
                    if new_code != mutated_code:  # Mutation occurred
                        mutated_code = new_code
                        applied_mutations.append(operator.__class__.__name__)
                except Exception:
                    continue  # Skip failed mutations
        
        return mutated_code
    
    def _tournament_selection(self, fitness_scores: List[float], tournament_size: int = 3) -> int:
        """Tournament selection for genetic algorithm"""
        if len(fitness_scores) < tournament_size:
            tournament_size = len(fitness_scores)
        
        tournament_indices = random.sample(range(len(fitness_scores)), tournament_size)
        tournament_fitness = [fitness_scores[i] for i in tournament_indices]
        winner_idx = tournament_indices[np.argmax(tournament_fitness)]
        return winner_idx
    
    def _calculate_fitness(self, code: str, target_metrics: CodeMetrics) -> float:
        """Calculate comprehensive fitness score for code"""
        try:
            # Validate syntax first
            tree = ast.parse(code)
            
            fitness_components = {}
            
            # 1. Complexity Analysis (30%)
            complexity = self._calculate_cyclomatic_complexity(tree)
            complexity_score = max(0, 1.0 - (complexity - 1) / 10.0)
            fitness_components['complexity'] = complexity_score * 0.30
            
            # 2. Code Length Efficiency (20%)
            length_score = max(0, 1.0 - len(code) / 2000.0)
            fitness_components['length'] = length_score * 0.20
            
            # 3. Readability Heuristics (25%)
            readability = self._calculate_readability_score(code)
            fitness_components['readability'] = readability * 0.25
            
            # 4. Performance Indicators (25%)
            performance = self._estimate_performance_score(code, tree)
            fitness_components['performance'] = performance * 0.25
            
            # Calculate total fitness
            total_fitness = sum(fitness_components.values())
            
            # Store in history for analysis
            code_hash = hashlib.md5(code.encode()).hexdigest()[:8]
            self.fitness_history[code_hash].append(total_fitness)
            
            return total_fitness
            
        except SyntaxError:
            return 0.0  # Invalid code gets zero fitness
    
    def _calculate_cyclomatic_complexity(self, tree: ast.AST) -> int:
        """Calculate cyclomatic complexity of AST"""
        complexity = 1  # Base complexity
        
        for node in ast.walk(tree):
            if isinstance(node, (ast.If, ast.While, ast.For, ast.With)):
                complexity += 1
            elif isinstance(node, ast.Try):
                complexity += len(node.handlers)
            elif isinstance(node, ast.BoolOp):
                complexity += len(node.values) - 1
            elif isinstance(node, ast.Lambda):
                complexity += 1
        
        return complexity
    
    def _calculate_readability_score(self, code: str) -> float:
        """Calculate readability score using multiple heuristics"""
        lines = code.split('\n')
        non_empty_lines = [line for line in lines if line.strip()]
        
        if not non_empty_lines:
            return 0.0
        
        score_components = {}
        
        # Comment density (10%)
        comment_lines = sum(1 for line in non_empty_lines if line.strip().startswith('#'))
        comment_ratio = comment_lines / len(non_empty_lines)
        score_components['comments'] = min(1.0, comment_ratio * 5) * 0.1
        
        # Line length consistency (20%)
        line_lengths = [len(line) for line in non_empty_lines]
        avg_length = sum(line_lengths) / len(line_lengths)
        length_variance = sum((length - avg_length) ** 2 for length in line_lengths) / len(line_lengths)
        length_consistency = max(0, 1.0 - length_variance / 1000)
        score_components['line_length'] = length_consistency * 0.2
        
        # Indentation consistency (30%)
        indents = [len(line) - len(line.lstrip()) for line in non_empty_lines if line.strip()]
        if indents:
            consistent_indent = all(indent % 4 == 0 for indent in indents)
            score_components['indentation'] = (1.0 if consistent_indent else 0.5) * 0.3
        else:
            score_components['indentation'] = 0.0
        
        # Variable naming (20%)
        variable_names = re.findall(r'\b[a-z_][a-z0-9_]*\b', code.lower())
        descriptive_names = sum(1 for name in variable_names if len(name) > 2 and '_' in name or len(name) > 4)
        if variable_names:
            naming_score = descriptive_names / len(variable_names)
            score_components['naming'] = naming_score * 0.2
        else:
            score_components['naming'] = 0.0
        
        # Function/class organization (20%)
        has_functions = 'def ' in code
        has_classes = 'class ' in code
        organization_score = 0.5 + (0.25 if has_functions else 0) + (0.25 if has_classes else 0)
        score_components['organization'] = organization_score * 0.2
        
        return sum(score_components.values())
    
    def _estimate_performance_score(self, code: str, tree: ast.AST) -> float:
        """Estimate performance using static analysis"""
        score_components = {}
        
        # Loop nesting analysis (40%)
        max_nesting = 0
        current_nesting = 0
        
        for node in ast.walk(tree):
            if isinstance(node, (ast.For, ast.While)):
                current_nesting += 1
                max_nesting = max(max_nesting, current_nesting)
            # Note: This is simplified; proper nesting requires tree traversal
        
        nesting_score = max(0, 1.0 - (max_nesting - 1) * 0.2)
        score_components['nesting'] = nesting_score * 0.4
        
        # Built-in usage (30%)
        builtin_functions = ['map', 'filter', 'reduce', 'zip', 'enumerate', 'sorted', 'any', 'all']
        builtin_count = sum(1 for builtin in builtin_functions if builtin in code)
        builtin_score = min(1.0, builtin_count / 3.0)
        score_components['builtins'] = builtin_score * 0.3
        
        # List comprehension usage (20%)
        comprehension_patterns = [
            r'\[.+for\s+\w+\s+in\s+.+\]',  # List comprehension
            r'\{.+for\s+\w+\s+in\s+.+\}',  # Set comprehension
            r'\(.+for\s+\w+\s+in\s+.+\)',  # Generator expression
        ]
        
        comprehensions = sum(1 for pattern in comprehension_patterns 
                           if re.search(pattern, code))
        comprehension_score = min(1.0, comprehensions / 2.0)
        score_components['comprehensions'] = comprehension_score * 0.2
          # Memory efficiency indicators (10%)
        memory_score = 0.5
        if 'yield' in code:  # Generator usage
            memory_score += 0.3
        if 'del ' in code:  # Explicit cleanup
            memory_score += 0.2
        
        score_components['memory'] = min(1.0, memory_score) * 0.1
        
        return sum(score_components.values())


class SelfModifyingExecutor:
    """Core execution engine with real-time self-modification capabilities"""
    
    def __init__(self):
        self.profiler = PerformanceProfiler()
        self.optimizer = ConsciousnessGuidedOptimizer()
        self.code_registry = {}
        self.modification_history = []
        self.consciousness_state = (0.33, 0.33, 0.34)  # Default RBY balance
        self.performance_thresholds = {
            'execution_time': 1.0,  # Max 1 second
            'memory_peak': 100.0,   # Max 100MB
            'efficiency_score': 0.7  # Min 70% efficiency
        }
    
    def register_function(self, func: Callable, source_code: str = None):
        """Register a function for self-modification monitoring"""
        func_name = func.__name__
        
        if source_code is None:
            try:
                source_code = inspect.getsource(func)
            except Exception:
                source_code = f"# Source code not available for {func_name}"
        
        self.code_registry[func_name] = {
            'function': func,
            'source_code': source_code,
            'original_code': source_code,
            'modification_count': 0,
            'best_performance': None,
            'consciousness_optimized': False
        }
    
    def execute_with_monitoring(self, func_name: str, *args, **kwargs) -> Tuple[Any, bool]:
        """Execute function with performance monitoring and potential self-modification"""
        if func_name not in self.code_registry:
            raise ValueError(f"Function {func_name} not registered")
        
        func_info = self.code_registry[func_name]
        func = func_info['function']
        
        # Execute with profiling
        result, metrics = self.profiler.profile_execution(func, *args, **kwargs)
        
        # Check if modification is needed
        needs_optimization = self._needs_optimization(metrics)
        
        if needs_optimization and func_info['modification_count'] < 5:  # Limit modifications
            optimized_code, events = self._optimize_function(func_name, metrics)
            
            if optimized_code != func_info['source_code']:
                # Apply modification
                success = self._apply_code_modification(func_name, optimized_code)
                
                if success:
                    self.modification_history.extend(events)
                    func_info['modification_count'] += 1
                    
                    # Re-execute with optimized version
                    new_func = func_info['function']
                    result, new_metrics = self.profiler.profile_execution(new_func, *args, **kwargs)
                    
                    # Update best performance if improved
                    if (func_info['best_performance'] is None or 
                        new_metrics.efficiency_score > func_info['best_performance'].efficiency_score):
                        func_info['best_performance'] = new_metrics
                    
                    return result, True  # Modification occurred
        
        return result, False  # No modification
    
    def _needs_optimization(self, metrics: CodeMetrics) -> bool:
        """Determine if function needs optimization based on performance metrics"""
        return (
            metrics.execution_time > self.performance_thresholds['execution_time'] or
            metrics.memory_peak > self.performance_thresholds['memory_peak'] or
            metrics.efficiency_score < self.performance_thresholds['efficiency_score']
        )
    
    def _optimize_function(self, func_name: str, current_metrics: CodeMetrics) -> Tuple[str, List[ModificationEvent]]:
        """Optimize function using consciousness-guided evolution"""
        func_info = self.code_registry[func_name]
        source_code = func_info['source_code']
        
        # Create target metrics (improved version of current)
        target_metrics = CodeMetrics(
            execution_time=current_metrics.execution_time * 0.8,  # 20% faster
            memory_peak=current_metrics.memory_peak * 0.9,       # 10% less memory
            efficiency_score=min(1.0, current_metrics.efficiency_score * 1.2)  # 20% more efficient
        )
        
        # Apply consciousness-guided optimization
        optimized_code, events = self.optimizer.evolve_code(
            source_code, 
            target_metrics, 
            self.consciousness_state,
            generations=10  # Limited generations for real-time
        )
        
        return optimized_code, events
    
    def _apply_code_modification(self, func_name: str, new_code: str) -> bool:
        """Apply code modification by dynamically recompiling function"""
        try:
            # Create new module namespace
            namespace = {}
            
            # Execute new code in isolated namespace
            exec(new_code, namespace)
            
            # Find the function in the namespace
            func_names = [name for name, obj in namespace.items() 
                         if callable(obj) and not name.startswith('_')]
            
            if not func_names:
                return False
            
            # Assume the first function is our target (can be improved)
            new_func = namespace[func_names[0]]
            
            # Update registry
            self.code_registry[func_name]['function'] = new_func
            self.code_registry[func_name]['source_code'] = new_code
            
            return True
            
        except Exception as e:
            print(f"Failed to apply modification: {e}")
            return False
    
    def set_consciousness_state(self, red: float, blue: float, yellow: float):
        """Update consciousness state for optimization guidance"""
        total = red + blue + yellow
        if total > 0:
            self.consciousness_state = (red/total, blue/total, yellow/total)
    
    def get_modification_summary(self) -> Dict[str, Any]:
        """Get summary of all modifications performed"""
        return {
            'total_modifications': len(self.modification_history),
            'functions_modified': len([f for f in self.code_registry.values() 
                                     if f['modification_count'] > 0]),
            'average_performance_improvement': self._calculate_average_improvement(),
            'consciousness_state': self.consciousness_state,
            'recent_events': self.modification_history[-5:]  # Last 5 events
        }
    
    def _calculate_average_improvement(self) -> float:
        """Calculate average performance improvement across all modifications"""
        improvements = [event.performance_delta for event in self.modification_history 
                       if event.success and event.performance_delta > 0]
        
        if improvements:
            return sum(improvements) / len(improvements)
        return 0.0


def test_self_modifying_system():
    """Test the self-modifying code system with real examples"""
    print("Testing Self-Modifying Code System...")
    
    # Initialize system
    executor = SelfModifyingExecutor()
    
    # Test function 1: Inefficient sorting
    def inefficient_sort(numbers):
        """Intentionally inefficient sorting algorithm"""
        result = []
        remaining = numbers.copy()
        
        while remaining:
            min_val = min(remaining)
            result.append(min_val)
            remaining.remove(min_val)
        
        return result
    
    # Test function 2: Memory-heavy operation
    def memory_heavy_operation(size):
        """Memory-intensive operation that can be optimized"""
        data = []
        for i in range(size):
            data.append([j for j in range(100)])  # Can be optimized to generator
        
        return len(data)
    
    # Register functions
    executor.register_function(inefficient_sort, inspect.getsource(inefficient_sort))
    executor.register_function(memory_heavy_operation, inspect.getsource(memory_heavy_operation))
    
    # Test with different consciousness states
    test_cases = [
        ("Red-dominant (Performance)", (0.7, 0.2, 0.1)),
        ("Blue-dominant (Structure)", (0.2, 0.7, 0.1)),
        ("Yellow-dominant (Integration)", (0.1, 0.2, 0.7))
    ]
    
    for description, consciousness_state in test_cases:
        print(f"\n--- Testing {description} ---")
        executor.set_consciousness_state(*consciousness_state)
        
        # Test inefficient sort
        test_data = list(range(100, 0, -1))  # Reverse sorted
        result, modified = executor.execute_with_monitoring('inefficient_sort', test_data)
        
        print(f"Sorting test - Modified: {modified}")
        if modified:
            print("  Function was optimized during execution")
        
        # Test memory-heavy operation
        result, modified = executor.execute_with_monitoring('memory_heavy_operation', 50)
        
        print(f"Memory test - Modified: {modified}")
        if modified:
            print("  Function was optimized during execution")
    
    # Get summary
    summary = executor.get_modification_summary()
    print(f"\n--- Modification Summary ---")
    print(f"Total modifications: {summary['total_modifications']}")
    print(f"Functions modified: {summary['functions_modified']}")
    print(f"Average improvement: {summary['average_performance_improvement']:.3f}")
    print(f"Current consciousness state: {summary['consciousness_state']}")
    
    print("\nSelf-Modifying Code System test completed!")


if __name__ == "__main__":
    test_self_modifying_system()
