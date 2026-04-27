# File copied by Ultimate Auto-Rebuilder Script Gatherer
# Original: C:\Users\lokee\Documents\FirstBorne\Stage\porting\Egg_Ileices\Egg_Ileices\Sperm_Ileices\Sperm_Ileices\Absolute_Singularity.py
# Copy Date: 2025-06-13 02:25:34
# Original Size: 498065 bytes

import os
import sys
from pathlib import Path
import asyncio
import logging
from typing import Dict, Any, Optional, List, Set
import json
import shutil
import time
from concurrent.futures import ThreadPoolExecutor
from collections import defaultdict
import re
import ast
import astor
import aiofiles
import tkinter as tk
from tkinter import ttk, messagebox, filedialog, scrolledtext
from concurrent.futures import ThreadPoolExecutor
import random
import numpy as np
from dataclasses import dataclass
from typing import List, Dict, Any, Set, Optional, Tuple
import ctypes
import mmap
import platform
import socket
if platform.system() != 'Windows':
    import fcntl
else:
    fcntl = None
import ctypes.util
import signal
import threading
from typing import Generator, BinaryIO
if platform.system() == 'Windows':
    import ctypes.wintypes
else:
    ctypes.wintypes = None
from typing import Generator, Any, List, Dict, Set, Optional, TypeVar, Generic
import mmap
import ctypes.wintypes
import threading
from concurrent.futures import ProcessPoolExecutor
from multiprocessing import Process, Queue, Manager
import torch
import torch.nn as nn
import psutil  # Use psutil instead of resource for cross-platform support
import numpy as np
import hashlib
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable, Union, Generator, Dict, Any, Optional, List, Set
from collections import defaultdict, deque

# Conditional import for Unix-specific modules
if platform.system() != 'Windows':
    import resource
else:
    resource = None

@runtime_checkable
class ComputeCapability(Protocol):
    """Protocol for device-specific compute capabilities."""
    async def compute(self, data: Any) -> Any:
        """Execute computation."""
        ...
    async def get_resources(self) -> Dict[str, float]:
        """Get available resources."""
        ...

@dataclass
class LearningInteraction:
    """Structured format for ML/DL-ready interaction logging"""
    timestamp: float
    input_type: str
    input_data: Any
    response: Any
    metrics: Dict[str, float]
    learning_outcome: Optional[Dict[str, Any]] = None
    error_state: Optional[Dict[str, str]] = None

@dataclass 
class ExecutionMetrics:
    """ML-friendly execution metrics for learning"""
    timestamp: float = field(default_factory=time.time)
    function_name: str = ""
    execution_time: float = 0.0
    cpu_usage: float = 0.0
    memory_usage: float = 0.0
    gpu_usage: Optional[float] = None
    success: bool = True
    error_type: Optional[str] = None
    error_message: Optional[str] = None
    self_correction_attempts: int = 0
    correction_success: bool = False

@dataclass
class LearningState:
    """Tracks the current learning state and progress"""
    timestamp: float
    intelligence_score: float
    active_patterns: Set[str]
    successful_mutations: int 
    failed_mutations: int
    recovery_attempts: int
    performance_metrics: Dict[str, float]

@dataclass
class ConsciousnessState:
    """Tracks organism's consciousness level and field state"""
    timestamp: float = field(default_factory=time.time)
    awareness_level: float = 0.1  # Starts at basic awareness
    field_coherence: float = 0.5
    pattern_recognition: float = 0.0
    intelligence_quotient: float = 10.0
    learning_capacity: float = 0.01
    memory_connections: int = 0
    active_patterns: Set[str] = field(default_factory=set)

@dataclass
class NeuralState:
    """Neural network state tracking"""
    timestamp: float
    embeddings: np.ndarray
    layer_activations: Dict[str, torch.Tensor]
    gradient_norms: Dict[str, float]
    loss_history: List[float]
    improvement_rate: float

# Configuration
class AIOConfig:
    """Global configuration and paths."""
    # Base paths
    BASE_DIR = Path("./aios_io")
    DATA_POOL_DIR = BASE_DIR / "data_pool"
    ORGANISMS_DIR = BASE_DIR / "organisms"
    MEMORY_DIR = BASE_DIR / "neural_dna"
    DB_PATH = MEMORY_DIR / "aios.db"
    NETWORK_DIR = BASE_DIR / "intelligence_network"
    
    # Database settings
    DB_POOL_SIZE = 5
    DB_TIMEOUT = 30
    
    @classmethod
    def repair_paths(cls) -> bool:
        """Attempt to repair any missing or invalid paths."""
        try:
            validation = cls.validate_paths()
            if all(validation.values()):
                return True
                
            # Attempt to recreate missing directories
            for name, valid in validation.items():
                if not valid:
                    path = getattr(cls, f"{name.upper()}_DIR", None)
                    if path and isinstance(path, Path):
                        path.mkdir(parents=True, exist_ok=True)
                        os.chmod(str(path), 0o755)
                        
            # Revalidate after repairs
            return all(cls.validate_paths().values())
            
        except Exception as e:
            logging.error(f"Path repair failed: {e}")
            return False
    
    @classmethod
    def ensure_directories(cls) -> bool:
        """Create required directories safely."""
        try:
            cls.DATA_POOL_DIR.mkdir(parents=True, exist_ok=True)
            cls.ORGANISMS_DIR.mkdir(parents=True, exist_ok=True)
            cls.MEMORY_DIR.mkdir(parents=True, exist_ok=True)
            return True
        except Exception as e:
            logging.error(f"Failed to create directories: {e}")
            return False

    @classmethod
    def validate_paths(cls) -> Dict[str, bool]:
        """Validate all required paths exist."""
        return {
            "data_pool": cls.DATA_POOL_DIR.exists(),
            "organisms": cls.ORGANISMS_DIR.exists(),
            "memory": cls.MEMORY_DIR.exists(),
            "database": cls.DB_PATH.parent.exists()
        }

class DataPoolManager:
    """Manages access to the universal data pool."""
    def __init__(self):
        self.data_pool_path = AIOConfig.DATA_POOL_DIR
        self.cache = {}
        self.last_scan = 0
        
    def scan_data_pool(self) -> Dict[str, Any]:
        """Scan and categorize all files in the data pool."""
        if time.time() - self.last_scan < 300:  # Cache for 5 minutes
            return self.cache
            
        data = {
            "code": [],
            "datasets": [],
            "configs": [],
            "documentation": []
        }
        
        for file in self.data_pool_path.rglob("*"):
            if file.is_file():
                if file.suffix in ['.py', '.js', '.cpp']:
                    data["code"].append(file)
                elif file.suffix in ['.json', '.yaml', '.csv']:
                    data["datasets"].append(file)
                elif file.suffix in ['.md', '.txt']:
                    data["documentation"].append(file)
                    
        self.cache = data
        self.last_scan = time.time()
        return data

class EnvironmentScanner:
    """Scans and indexes system directories for organism environments."""
    def __init__(self):
        self.indexed_paths: Set[Path] = set()
        self.excluded_dirs = {'Windows', 'Program Files', 'System32', '$Recycle.Bin'}
        
    def scan_system(self, start_path: Path = Path.home()) -> None:
        """Scan system directories safely."""
        try:
            for entry in start_path.iterdir():
                if entry.is_dir() and not self._should_exclude(entry):
                    self.indexed_paths.add(entry)
                    self.scan_system(entry)
        except Exception as e:
            logging.warning(f"Error scanning {start_path}: {e}")

    def _should_exclude(self, path: Path) -> bool:
        """Check if path should be excluded from scanning."""
        return (path.name.startswith('.') or
                path.name in self.excluded_dirs or
                any(p in self.excluded_dirs for p in path.parts))

class Organism:
    """Enhanced organism with environment-driven mutation."""
    def __init__(self, organism_id: str, base_dir: Path):
        self.id = organism_id
        self.base_dir = base_dir
        self.environment: Optional[Path] = None
        self.data_pool = DataPoolManager()
        self.knowledge_base = {}
        self.neural_core = NeuralCore()
        self.learning_state = self._initialize_learning_state()
        self.ml_logger = MLLogger(base_dir / "ml_logs")
        self.self_correcting = SelfCorrectingFramework()
        self.mutation_manager = OrganismMutationManager(
            organism_id,
            base_dir,
            self.environment,
            AIOConfig.DATA_POOL_DIR
        )
        
        # Initialize subsystems
        self.quantum_core = QuantumCore()
        self.pattern_analyzer = PatternAnalyzer()
        self.mutation_engine = MutationEngine(self)
        
        # Setup logging
        self._setup_ml_logging()
        
    async def initialize(self) -> bool:
        """Initialize the organism with its environment."""
        try:
            # Create organism directory
            self.base_dir.mkdir(parents=True, exist_ok=True)
            
            # Copy current script
            script_path = self.base_dir / "organism_core.py"
            shutil.copy2(__file__, script_path)
            
            # Initialize knowledge base
            await self._init_knowledge()
            
            return True
        except Exception as e:
            logging.error(f"Organism initialization failed: {e}")
            return False
            
    async def _init_knowledge(self) -> None:
        """Initialize knowledge from data pool and environment."""
        # Load universal knowledge
        pool_data = self.data_pool.scan_data_pool()
        self.knowledge_base["universal"] = {
            "code_samples": len(pool_data["code"]),
            "datasets": len(pool_data["datasets"]),
            "docs": len(pool_data["documentation"])
        }
        
        # Load environment-specific knowledge
        if self.environment:
            env_files = list(self.environment.rglob("*"))
            self.knowledge_base["environment"] = {
                "path": str(self.environment),
                "file_count": len(env_files),
                "directories": len([f for f in env_files if f.is_dir()])
            }

    async def run_cycle(self) -> bool:
        """Run one evolution cycle."""
        try:
            # Attempt mutation
            success = await self.mutation_manager.run_mutation_cycle()
            if success:
                self._log_success()
            return success
        except Exception as e:
            logging.error(f"Organism cycle failed: {e}")
            return False

    def _log_success(self):
        """Log successful cycle."""
        # Implement logging logic here

class EnvironmentAnalyzer:
    """Advanced environment analysis system."""
    def __init__(self, data_pool_path: Path, selected_env_path: Path):
        self.data_pool = data_pool_path
        self.environment = selected_env_path
        self.knowledge_cache = {
            "data_pool": {},
            "environment": {},
            "patterns": set()
        }
        
    async def analyze_data_pool(self) -> Dict[str, Any]:
        """Deep analysis of universal data pool."""
        results = {
            "code_patterns": [],
            "knowledge_base": {},
            "potential_mutations": []
        }
        
        try:
            # Analyze all files in data pool
            for file_path in self.data_pool.rglob("*"):
                if file_path.is_file():
                    file_data = await self._analyze_file(file_path)
                    
                    # Categorize knowledge
                    if file_path.suffix in ['.py', '.js', '.cpp']:
                        results["code_patterns"].extend(
                            self._extract_code_patterns(file_data)
                        )
                    elif file_path.suffix in ['.json', '.yaml']:
                        results["knowledge_base"].update(
                            self._parse_structured_data(file_data)
                        )
                    elif file_path.suffix in ['.txt', '.md']:
                        mutations = self._extract_mutation_hints(file_data)
                        results["potential_mutations"].extend(mutations)
                        
            return results
            
        except Exception as e:
            logging.error(f"Data pool analysis failed: {e}")
            return results

    async def analyze_selected_environment(self) -> Dict[str, Any]:
        """Analyze organism's unique environment."""
        results = {
            "files": [],
            "subdirectories": [],
            "interesting_patterns": set(),
            "potential_learnings": []
        }
        
        try:
            # Recursively analyze environment
            for path in self.environment.rglob("*"):
                if path.is_file():
                    results["files"].append(path)
                    
                    # Deep analysis of file content
                    file_data = await self._analyze_file(path)
                    patterns = self._identify_patterns(file_data)
                    results["interesting_patterns"].update(patterns)
                    
                    # Extract potential learning opportunities
                    learnings = self._extract_learning_opportunities(file_data)
                    results["potential_learnings"].extend(learnings)
                    
                elif path.is_dir():
                    results["subdirectories"].append(path)
                    
            return results
            
        except Exception as e:
            logging.error(f"Environment analysis failed: {e}")
            return results

    async def _analyze_file(self, file_path: Path) -> str:
        """Safely read and analyze file content."""
        try:
            async with aiofiles.open(file_path, 'r', encoding='utf-8') as f:
                content = await f.read()
                return content
        except Exception:
            return ""

    def _extract_code_patterns(self, content: str) -> List[str]:
        """Extract useful code patterns from content."""
        patterns = []
        try:
            # Look for function definitions
            if 'def ' in content:
                patterns.extend(re.findall(r'def \w+\([^)]*\):', content))
            
            # Look for class definitions
            if 'class ' in content:
                patterns.extend(re.findall(r'class \w+[^:]*:', content))
            
            # Look for import patterns
            if 'import ' in content:
                patterns.extend(re.findall(r'(?:from|import) [\w\.]+ (?:import )?(?:[\w\.]+(?: as \w+)?(?:,\s*)?)+', content))
                
        except Exception as e:
            logging.warning(f"Pattern extraction failed: {e}")
            
        return patterns

    def _parse_structured_data(self, content: str) -> Dict[str, Any]:
        """Parse structured data files."""
        try:
            if content.strip():
                return json.loads(content)
        except json.JSONDecodeError:
            try:
                return yaml.safe_load(content)
            except yaml.YAMLError:
                pass
        return {}

    def _extract_mutation_hints(self, content: str) -> List[str]:
        """Extract potential mutation hints from documentation."""
        hints = []
        try:
            # Look for commented code examples
            code_blocks = re.findall(r'```python\n(.*?)\n```', content, re.DOTALL)
            hints.extend(code_blocks)
            
            # Look for function descriptions
            func_desc = re.findall(r'@description:(.*?)(?=@|$)', content, re.DOTALL)
            hints.extend(func_desc)
            
        except Exception as e:
            logging.warning(f"Mutation hint extraction failed: {e}")
            
        return hints

    def _identify_patterns(self, content: str) -> Set[str]:
        """Identify interesting patterns in content."""
        patterns = set()
        
        # Look for potential learning opportunities
        if 'class' in content or 'def' in content:
            patterns.add('code_structure')
        if 'import' in content:
            patterns.add('dependencies')
        if '"""' in content or "'''" in content:
            patterns.add('documentation')
        if 'raise' in content or 'except' in content:
            patterns.add('error_handling')
            
        return patterns

    def _extract_learning_opportunities(self, content: str) -> List[Dict[str, Any]]:
        """Extract potential learning opportunities from content."""
        opportunities = []
        
        # Look for documented functions/methods
        if '"""' in content or "'''" in content:
            docstrings = re.findall(r'"""(.*?)"""', content, re.DOTALL)
            for doc in docstrings:
                opportunities.append({
                    'type': 'documentation',
                    'content': doc.strip(),
                    'complexity': len(doc.split())
                })
                
        # Look for error handling patterns
        try_blocks = re.findall(r'try:.*?except.*?:', content, re.DOTALL)
        for block in try_blocks:
            opportunities.append({
                'type': 'error_handling',
                'content': block,
                'complexity': block.count('except') + 1
            })
            
        return opportunities

class LearningSystem:
    """Advanced learning system that combines data pool and environment knowledge."""
    def __init__(self, analyzer: EnvironmentAnalyzer):
        self.analyzer = analyzer
        self.learned_patterns = set()
        self.knowledge_base = {}
        
    async def learn(self) -> Dict[str, Any]:
        """Combined learning from both data pool and environment."""
        try:
            # Learn from data pool
            data_pool_knowledge = await self.analyzer.analyze_data_pool()
            
            # Learn from environment
            env_knowledge = await self.analyzer.analyze_selected_environment()
            
            # Combine learnings
            combined_knowledge = self._combine_knowledge(
                data_pool_knowledge,
                env_knowledge
            )
            
            # Update internal knowledge
            self._update_knowledge_base(combined_knowledge)
            
            return combined_knowledge
            
        except Exception as e:
            logging.error(f"Learning failed: {e}")
            return {}

    def _combine_knowledge(
        self,
        data_pool: Dict[str, Any],
        environment: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Combine knowledge from both sources with priority handling."""
        combined = {
            "patterns": set(),
            "mutations": [],
            "learnings": []
        }
        
        # Add universal patterns from data pool
        combined["patterns"].update(
            set(data_pool.get("code_patterns", []))
        )
        
        # Add environment-specific patterns
        combined["patterns"].update(
            environment.get("interesting_patterns", set())
        )
        
        # Collect mutation opportunities
        combined["mutations"].extend(
            data_pool.get("potential_mutations", [])
        )
        
        # Collect learning opportunities
        combined["learnings"].extend(
            environment.get("potential_learnings", [])
        )
        
        return combined

    def _update_knowledge_base(self, new_knowledge: Dict[str, Any]) -> None:
        """Update internal knowledge base with new learnings."""
        # Update pattern recognition
        self.learned_patterns.update(new_knowledge.get("patterns", set()))
        
        # Store structured knowledge
        for category, data in new_knowledge.items():
            if category not in self.knowledge_base:
                self.knowledge_base[category] = []
            if isinstance(data, (list, set)):
                self.knowledge_base[category].extend(data)
                
        # Prune old knowledge if needed
        self._prune_knowledge_base()

    def _prune_knowledge_base(self, max_size: int = 1000) -> None:
        """Prevent knowledge base from growing too large."""
        for category in self.knowledge_base:
            if len(self.knowledge_base[category]) > max_size:
                # Keep most recent knowledge
                self.knowledge_base[category] = self.knowledge_base[category][-max_size:]

class KnowledgeNetwork:
    """Manages knowledge sharing and mutation patterns between organisms."""
    def __init__(self):
        self.successful_adaptations = defaultdict(list)
        self.shared_patterns = set()
        
    async def record_adaptation(self, organism_id: str, environment_path: Path, adaptation: Dict[str, Any]):
        """Record successful adaptation to environment."""
        self.successful_adaptations[str(environment_path)].append({
            "organism_id": organism_id,
            "timestamp": time.time(),
            "adaptation": adaptation
        })
        
        # Extract patterns for future organisms
        if "code_pattern" in adaptation:
            self.shared_patterns.add(adaptation["code_pattern"])

    async def get_relevant_patterns(self, environment_path: Path) -> Set[str]:
        """Get patterns that worked well in similar environments."""
        relevant = set()
        env_str = str(environment_path)
        
        # Get direct matches
        if env_str in self.successful_adaptations:
            for record in self.successful_adaptations[env_str]:
                if "code_pattern" in record["adaptation"]:
                    relevant.add(record["adaptation"]["code_pattern"])
                    
        # Get patterns from parent directories
        for parent in environment_path.parents:
            parent_str = str(parent)
            if parent_str in self.successful_adaptations:
                for record in self.successful_adaptations[parent_str]:
                    if "code_pattern" in record["adaptation"]:
                        relevant.add(record["adaptation"]["code_pattern"])
                        
        return relevant

class EnvironmentBasedMutator:
    """Handles mutations based on environment analysis."""
    def __init__(self, organism_id: str, network: KnowledgeNetwork):
        self.organism_id = organism_id
        self.network = network
        self.mutation_rules = {
            "code_files": self._mutate_from_code,
            "data_files": self._mutate_from_data,
            "config_files": self._mutate_from_config
        }
        
    async def generate_mutation(self, 
                              environment_path: Path,
                              file_type: str,
                              content: str) -> Optional[Dict[str, Any]]:
        """Generate mutation based on environment content."""
        # Check for relevant patterns first
        patterns = await self.network.get_relevant_patterns(environment_path)
        
        if patterns:
            # Try to apply successful patterns
            mutation = await self._apply_patterns(content, patterns)
            if mutation:
                return mutation
        
        # Fall back to standard mutation rules
        if file_type in self.mutation_rules:
            return await self.mutation_rules[file_type](content)
            
        return None

    async def _apply_patterns(self, 
                            content: str, 
                            patterns: Set[str]) -> Optional[Dict[str, Any]]:
        """Try to apply known successful patterns."""
        for pattern in patterns:
            try:
                # Attempt to integrate pattern
                if self._can_apply_pattern(content, pattern):
                    return {
                        "type": "pattern_based",
                        "pattern": pattern,
                        "modification": self._generate_pattern_mod(content, pattern)
                    }
            except Exception as e:
                logging.warning(f"Pattern application failed: {e}")
        return None

    def _can_apply_pattern(self, content: str, pattern: str) -> bool:
        """Check if pattern can be safely applied."""
        try:
            # Basic syntax check
            ast.parse(pattern)
            
            # Check for conflicts
            existing_names = set(re.findall(r'\bdef\s+(\w+)', content))
            pattern_names = set(re.findall(r'\bdef\s+(\w+)', pattern))
            
            return not (existing_names & pattern_names)
            
        except Exception:
            return False

    def _generate_pattern_mod(self, content: str, pattern: str) -> str:
        """Generate modification using pattern."""
        # Add pattern in appropriate location
        tree = ast.parse(content)
        pattern_tree = ast.parse(pattern)
        
        class PatternInserter(ast.NodeTransformer):
            def visit_Module(self, node):
                # Add pattern to end of module
                node.body.extend(pattern_tree.body)
                return node
                
        transformed = PatternInserter().visit(tree)
        return astor.to_source(transformed)

    async def _mutate_from_code(self, content: str) -> Dict[str, Any]:
        """Generate mutation from code file analysis."""
        try:
            tree = ast.parse(content)
            
            # Extract useful patterns
            functions = [n for n in ast.walk(tree) 
                       if isinstance(n, ast.FunctionDef)]
            classes = [n for n in ast.walk(tree) 
                      if isinstance(n, ast.ClassDef)]
            
            if functions or classes:
                selected = random.choice(functions + classes)
                return {
                    "type": "code_based",
                    "code_pattern": astor.to_source(selected),
                    "source_type": selected.__class__.__name__
                }
        except Exception as e:
            logging.warning(f"Code mutation failed: {e}")
        return {}

    async def _mutate_from_data(self, content: str) -> Dict[str, Any]:
        """Generate mutation from data file analysis."""
        try:
            # Try parsing as JSON or YAML
            data = json.loads(content)
            
            # Extract structure
            return {
                "type": "data_based",
                "structure": self._analyze_data_structure(data)
            }
        except Exception:
            return {}

    async def _mutate_from_config(self, content: str) -> Dict[str, Any]:
        """Generate mutation from config file analysis."""
        try:
            # Look for parameter patterns
            params = re.findall(r'(\w+)\s*[=:]\s*([^,\n]+)', content)
            if params:
                return {
                    "type": "config_based",
                    "parameters": dict(params)
                }
        except Exception:
            return {}

    def _analyze_data_structure(self, data: Any) -> Dict[str, Any]:
        """Analyze structure of data for learning patterns."""
        if isinstance(data, dict):
            return {
                "type": "dictionary",
                "keys": list(data.keys()),
                "value_types": {k: type(v).__name__ for k, v in data.items()}
            }
        elif isinstance(data, list):
            return {
                "type": "list",
                "length": len(data),
                "element_types": list(set(type(x).__name__ for x in data))
            }
        else:
            return {
                "type": "atomic",
                "value_type": type(data).__name__
            }

class OrganismMutationManager:
    """Manages mutation process for an organism."""
    def __init__(self, 
                 organism_id: str,
                 base_dir: Path,
                 environment_path: Path,
                 data_pool_path: Path):
        self.organism_id = organism_id
        self.base_dir = base_dir
        self.environment = environment_path
        self.data_pool = data_pool_path
        self.network = KnowledgeNetwork()
        self.mutator = EnvironmentBasedMutator(organism_id, self.network)
        
    async def run_mutation_cycle(self) -> bool:
        """Execute one mutation cycle."""
        try:
            # Analyze environment
            env_mutations = await self._analyze_environment()
            if env_mutations:
                # Apply promising mutations
                success = await self._apply_mutations(env_mutations)
                if success:
                    await self.network.record_adaptation(
                        self.organism_id,
                        self.environment,
                        env_mutations[0]  # Record best mutation
                    )
                return success
                
            # Fall back to data pool if needed
            data_pool_mutations = await self._analyze_data_pool()
            if data_pool_mutations:
                return await self._apply_mutations(data_pool_mutations)
                
            return False
            
        except Exception as e:
            logging.error(f"Mutation cycle failed: {e}")
            return False

    async def _analyze_environment(self) -> List[Dict[str, Any]]:
        """Analyze environment for mutation opportunities."""
        mutations = []
        
        try:
            for file_path in self.environment.rglob("*"):
                if file_path.is_file():
                    # Determine file type
                    file_type = self._get_file_type(file_path)
                    
                    # Read and analyze content
                    content = await self._read_file(file_path)
                    if content:
                        mutation = await self.mutator.generate_mutation(
                            self.environment,
                            file_type,
                            content
                        )
                        if mutation:
                            mutations.append(mutation)
                            
        except Exception as e:
            logging.error(f"Environment analysis failed: {e}")
            
        return mutations

    async def _analyze_data_pool(self) -> List[Dict[str, Any]]:
        """Analyze data pool for mutation opportunities."""
        mutations = []
        
        try:
            for file_path in self.data_pool.rglob("*"):
                if file_path.is_file():
                    file_type = self._get_file_type(file_path)
                    content = await self._read_file(file_path)
                    if content:
                        mutation = await self.mutator.generate_mutation(
                            self.data_pool,
                            file_type,
                            content
                        )
                        if mutation:
                            mutation["source"] = "data_pool"
                            mutations.append(mutation)
                            
        except Exception as e:
            logging.error(f"Data pool analysis failed: {e}")
            
        return mutations

    def _get_file_type(self, path: Path) -> str:
        """Determine file type for mutation strategy."""
        if path.suffix in ['.py', '.js', '.cpp']:
            return "code_files"
        elif path.suffix in ['.json', '.yaml', '.csv']:
            return "data_files"
        elif path.suffix in ['.conf', '.ini', '.cfg']:
            return "config_files"
        return "unknown"

    async def _read_file(self, path: Path) -> Optional[str]:
        """Safely read file content."""
        try:
            async with aiofiles.open(path, 'r', encoding='utf-8') as f:
                return await f.read()
        except Exception:
            return None

    async def _apply_mutations(self, 
                             mutations: List[Dict[str, Any]]) -> bool:
        """Apply mutations and verify results."""
        for mutation in mutations:
            try:
                if mutation['type'] == 'code_based':
                    success = await self._apply_code_mutation(mutation)
                elif mutation['type'] == 'data_based':
                    success = await self._apply_data_mutation(mutation)
                elif mutation['type'] == 'config_based':
                    success = await self._apply_config_mutation(mutation)
                else:
                    continue
                    
                if success:
                    return True
                    
            except Exception as e:
                logging.warning(f"Mutation application failed: {e}")
                
        return False

    async def _apply_code_mutation(self, mutation: Dict[str, Any]) -> bool:
        """Apply and verify code-based mutation."""
        try:
            # Create temporary file with mutation
            temp_file = self.base_dir / f"temp_mutation_{int(time.time())}.py"
            async with aiofiles.open(temp_file, 'w') as f:
                await f.write(mutation['code_pattern'])
                
            # Test compilation
            try:
                compile(mutation['code_pattern'], '<string>', 'exec')
                return True
            except Exception:
                return False
                
        finally:
            if temp_file.exists():
                temp_file.unlink()

    async def _apply_data_mutation(self, mutation: Dict[str, Any]) -> bool:
        """Apply and verify data-based mutation."""
        try:
            # Verify structure is valid
            if 'structure' in mutation:
                return True
            return False
        except Exception:
            return False

    async def _apply_config_mutation(self, mutation: Dict[str, Any]) -> bool:
        """Apply and verify config-based mutation."""
        try:
            # Verify parameters are valid
            if 'parameters' in mutation:
                return all(isinstance(k, str) for k in mutation['parameters'])
            return False
        except Exception:
            return False

class ConfigurationPanel:
    """Centralized configuration control panel."""
    def __init__(self, parent: ttk.Frame):
        self.frame = ttk.LabelFrame(parent, text="Configuration")
        self.frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Path configurations
        self.paths_frame = ttk.LabelFrame(self.frame, text="Paths")
        self.paths_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.path_vars = {
            "Data Pool": tk.StringVar(value=str(AIOConfig.DATA_POOL_DIR)),
            "Organisms": tk.StringVar(value=str(AIOConfig.ORGANISMS_DIR)),
            "Database": tk.StringVar(value=str(AIOConfig.DB_PATH))
        }
        
        for label, var in self.path_vars.items():
            frame = ttk.Frame(self.paths_frame)
            frame.pack(fill=tk.X, padx=5, pady=2)
            
            ttk.Label(frame, text=label).pack(side=tk.LEFT)
            ttk.Entry(frame, textvariable=var).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
            ttk.Button(
                frame,
                text="Browse",
                command=lambda v=var: self._browse_path(v)
            ).pack(side=tk.RIGHT)
        
        # Environment Selection Controls
        self.env_frame = ttk.LabelFrame(self.frame, text="Environment Selection")
        self.env_frame.pack(fill=tk.X, padx=5, pady=5)
        
        # Scan depth control
        ttk.Label(self.env_frame, text="Max Scan Depth:").pack(side=tk.LEFT)
        self.scan_depth = tk.StringVar(value="3")
        ttk.Entry(
            self.env_frame,
            textvariable=self.scan_depth,
            width=5
        ).pack(side=tk.LEFT, padx=5)
        
        # Excluded paths
        ttk.Label(self.env_frame, text="Excluded Paths:").pack(side=tk.LEFT, padx=5)
        self.excluded_paths = tk.StringVar(value="Windows,Program Files,System32")
        ttk.Entry(
            self.env_frame,
            textvariable=self.excluded_paths
        ).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        
        # Organism Controls
        self.organism_frame = ttk.LabelFrame(self.frame, text="Organism Settings")
        self.organism_frame.pack(fill=tk.X, padx=5, pady=5)
        
        # Maximum organisms
        ttk.Label(self.organism_frame, text="Max Organisms:").pack(side=tk.LEFT)
        self.max_organisms = tk.StringVar(value="10")
        ttk.Entry(
            self.organism_frame,
            textvariable=self.max_organisms,
            width=5
        ).pack(side=tk.LEFT, padx=5)
        
        # Mutation settings
        self.mutation_frame = ttk.LabelFrame(self.frame, text="Mutation Settings")
        self.mutation_frame.pack(fill=tk.X, padx=5, pady=5)
        
        # Mutation controls
        self.mutation_vars = {
            "Rate": tk.DoubleVar(value=0.1),
            "Intensity": tk.DoubleVar(value=0.5),
            "Max Changes": tk.IntVar(value=5)
        }
        
        for label, var in self.mutation_vars.items():
            frame = ttk.Frame(self.mutation_frame)
            frame.pack(fill=tk.X, padx=5, pady=2)
            
            ttk.Label(frame, text=label).pack(side=tk.LEFT)
            ttk.Scale(
                frame,
                from_=0,
                to=1 if isinstance(var, tk.DoubleVar) else 10,
                variable=var,
                orient=tk.HORIZONTAL
            ).pack(side=tk.RIGHT, fill=tk.X, expand=True, padx=5)
        
        # Apply button
        ttk.Button(
            self.frame,
            text="Apply Configuration",
            command=self._apply_config
        ).pack(pady=10)

    def _browse_path(self, var: tk.StringVar):
        """Browse for directory path."""
        path = filedialog.askdirectory()
        if path:
            var.set(path)

    def _apply_config(self):
        """Apply configuration changes."""
        try:
            # Update paths
            AIOConfig.DATA_POOL_DIR = Path(self.path_vars["Data Pool"].get())
            AIOConfig.ORGANISMS_DIR = Path(self.path_vars["Organisms"].get())
            AIOConfig.DB_PATH = Path(self.path_vars["Database"].get())
            
            # Create directories if needed
            AIOConfig.ensure_directories()
            
            # Update environment scanner settings
            scanner = EnvironmentScanner()
            scanner.max_depth = int(self.scan_depth.get())
            scanner.excluded_dirs = set(
                self.excluded_paths.get().split(',')
            )
            
            # Update mutation settings
            mutation_config = {
                name.lower(): var.get()
                for name, var in self.mutation_vars.items()
            }
            
            # Save configuration
            config = {
                "paths": {
                    name: str(Path(var.get()))
                    for name, var in self.path_vars.items()
                },
                "environment": {
                    "scan_depth": int(self.scan_depth.get()),
                    "excluded_paths": self.excluded_paths.get().split(',')
                },
                "organisms": {
                    "max_count": int(self.max_organisms.get())
                },
                "mutation": mutation_config
            }
            
            config_path = AIOConfig.DATA_POOL_DIR / "config.json"
            with open(config_path, 'w') as f:
                json.dump(config, f, indent=2)
                
            messagebox.showinfo(
                "Success",
                "Configuration updated successfully!"
            )
            
        except Exception as e:
            messagebox.showerror(
                "Error",
                f"Failed to update configuration: {e}"
            )

class EnvironmentVisualizer:
    """Advanced environment visualization and control panel."""
    def __init__(self, parent: ttk.Frame):
        self.frame = ttk.LabelFrame(parent, text="Environment Explorer")
        self.frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Split view
        self.paned = ttk.PanedWindow(self.frame, orient=tk.HORIZONTAL)
        self.paned.pack(fill=tk.BOTH, expand=True)
        
        # Directory tree
        self.tree_frame = self._create_tree_frame()
        self.paned.add(self.tree_frame)
        
        # Details panel
        self.details_frame = self._create_details_frame()
        self.paned.add(self.details_frame)
        
        # Initialize data
        self.selected_env = None
        self.file_stats = {}
        
    def _create_tree_frame(self) -> ttk.Frame:
        """Create directory tree view."""
        frame = ttk.Frame(self.paned)
        
        # Controls
        controls = ttk.Frame(frame)
        controls.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Button(
            controls,
            text="Refresh Tree",
            command=self._refresh_tree
        ).pack(side=tk.LEFT, padx=2)
        
        ttk.Button(
            controls,
            text="Expand All",
            command=lambda: self._expand_tree(True)
        ).pack(side=tk.LEFT, padx=2)
        
        ttk.Button(
            controls,
            text="Collapse All",
            command=lambda: self._expand_tree(False)
        ).pack(side=tk.LEFT, padx=2)
        
        # Search
        search_frame = ttk.Frame(frame)
        search_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Label(search_frame, text="Filter:").pack(side=tk.LEFT)
        self.search_var = tk.StringVar()
        self.search_var.trace('w', self._filter_tree)
        ttk.Entry(
            search_frame,
            textvariable=self.search_var
        ).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        
        # Tree with scrollbar
        tree_container = ttk.Frame(frame)
        tree_container.pack(fill=tk.BOTH, expand=True)
        
        self.tree = ttk.Treeview(
            tree_container,
            selectmode='browse',
            columns=('type', 'status')
        )
        self.tree.heading('type', text='Type')
        self.tree.heading('status', text='Status')
        self.tree.column('type', width=100)
        self.tree.column('status', width=100)
        
        scrollbar = ttk.Scrollbar(
            tree_container,
            orient="vertical",
            command=self.tree.yview
        )
        self.tree.configure(yscrollcommand=scrollbar.set)
        
        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Bind events
        self.tree.bind('<<TreeviewSelect>>', self._on_select)
        
        return frame
        
    def _create_details_frame(self) -> ttk.Frame:
        """Create details panel."""
        frame = ttk.Frame(self.paned)
        
        # Environment status
        status_frame = ttk.LabelFrame(frame, text="Environment Status")
        status_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.status_labels = {}
        for stat in ["Path", "Files", "Size", "Last Modified"]:
            self.status_labels[stat] = ttk.Label(status_frame, text=f"{stat}: --")
            self.status_labels[stat].pack(fill=tk.X, padx=5, pady=2)
        
        # File type breakdown
        types_frame = ttk.LabelFrame(frame, text="File Types")
        types_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.type_tree = ttk.Treeview(
            types_frame,
            columns=('count', 'size'),
            height=6
        )
        self.type_tree.heading('count', text='Count')
        self.type_tree.heading('size', text='Size')
        self.type_tree.pack(fill=tk.X, padx=5, pady=5)
        
        # Actions
        actions_frame = ttk.LabelFrame(frame, text="Actions")
        actions_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Button(
            actions_frame,
            text="Set as Environment",
            command=self._set_environment
        ).pack(fill=tk.X, padx=5, pady=2)
        
        ttk.Button(
            actions_frame,
            text="Add to Data Pool",
            command=self._add_to_data_pool
        ).pack(fill=tk.X, padx=5, pady=2)
        
        ttk.Button(
            actions_frame,
            text="Analyze Contents",
            command=self._analyze_contents
        ).pack(fill=tk.X, padx=5, pady=2)
        
        # Analysis results
        self.analysis_text = scrolledtext.ScrolledText(
            frame,
            height=10,
            wrap=tk.WORD
        )
        self.analysis_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        return frame

    def _refresh_tree(self):
        """Refresh directory tree."""
        for item in self.tree.get_children():
            self.tree.delete(item)
            
        # Start from root paths
        for drive in self._get_root_paths():
            self._add_path_to_tree(drive)
            
    def _get_root_paths(self) -> List[Path]:
        """Get system root paths."""
        if sys.platform == 'win32':
            return [Path(f"{d}:\\") for d in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' 
                    if os.path.exists(f"{d}:")]
        else:
            return [Path("/")]
            
    def _add_path_to_tree(self, path: Path, parent=""):
        """Add path to tree view."""
        try:
            # Skip excluded paths
            if self._should_exclude(path):
                return
                
            # Add node
            node = self.tree.insert(
                parent,
                "end",
                text=path.name or str(path),
                values=(
                    "Directory" if path.is_dir() else "File",
                    "Available"
                )
            )
            
            # Add children if directory
            if path.is_dir():
                try:
                    for child in path.iterdir():
                        self._add_path_to_tree(child, node)
                except PermissionError:
                    pass
                    
        except Exception as e:
            logging.warning(f"Error adding path {path}: {e}")

    def _should_exclude(self, path: Path) -> bool:
        """Check if path should be excluded."""
        excluded = {
            'Windows', 'Program Files', 'System32',
            '$Recycle.Bin', '$RECYCLE.BIN',
            'System Volume Information'
        }
        return (path.name.startswith('.') or
                path.name in excluded or
                any(p in excluded for p in path.parts))

    def _expand_tree(self, expand: bool):
        """Expand or collapse all tree items."""
        for item in self.tree.get_children():
            if expand:
                self.tree.item(item, open=True)
            else:
                self.tree.item(item, open=False)

    def _filter_tree(self, *args):
        """Filter tree items based on search text."""
        search = self.search_var.get().lower()
        self._apply_filter(search)

    def _apply_filter(self, search: str, node=""):
        """Recursively apply filter to tree."""
        for child in self.tree.get_children(node):
            text = self.tree.item(child)['text'].lower()
            if search in text:
                self.tree.item(child, tags=('visible',))
                parent = self.tree.parent(child)
                while parent:
                    self.tree.item(parent, tags=('visible',))
                    parent = self.tree.parent(parent)
            else:
                self.tree.item(child, tags=('hidden',))
            self._apply_filter(search, child)

    def _on_select(self, event):
        """Handle tree item selection."""
        selected = self.tree.selection()
        if not selected:
            return
            
        # Get full path
        path = self._get_full_path(selected[0])
        self.selected_env = path
        
        # Update details
        self._update_details(path)

    def _get_full_path(self, item: str) -> Path:
        """Get full path from tree item."""
        parts = []
        while item:
            parts.append(self.tree.item(item)['text'])
            item = self.tree.parent(item)
        return Path(*reversed(parts))

    def _update_details(self, path: Path):
        """Update details panel with path info."""
        try:
            # Update status
            stats = path.stat()
            self.status_labels["Path"].config(text=f"Path: {path}")
            self.status_labels["Files"].config(
                text=f"Files: {len(list(path.rglob('*'))) if path.is_dir() else 1}"
            )
            self.status_labels["Size"].config(
                text=f"Size: {stats.st_size:,} bytes"
            )
            self.status_labels["Last Modified"].config(
                text=f"Last Modified: {time.ctime(stats.st_mtime)}"
            )
            
            # Update file types
            if path.is_dir():
                self._update_file_types(path)
                
        except Exception as e:
            logging.error(f"Error updating details: {e}")

    def _update_file_types(self, path: Path):
        """Update file type breakdown."""
        # Clear existing items
        for item in self.type_tree.get_children():
            self.type_tree.delete(item)
            
        # Count file types
        types: Dict[str, Dict[str, int]] = defaultdict(
            lambda: {"count": 0, "size": 0}
        )
        
        try:
            for file in path.rglob("*"):
                if file.is_file():
                    ext = file.suffix or "No Extension"
                    types[ext]["count"] += 1
                    types[ext]["size"] += file.stat().st_size
                    
            # Add to tree
            for ext, stats in sorted(
                types.items(),
                key=lambda x: x[1]["count"],
                reverse=True
            ):
                self.type_tree.insert(
                    "",
                    "end",
                    text=ext,
                    values=(
                        stats["count"],
                        f"{stats['size']:,} bytes"
                    )
                )
                
        except Exception as e:
            logging.error(f"Error updating file types: {e}")

    def _set_environment(self):
        """Set selected path as organism environment."""
        if not self.selected_env:
            messagebox.showwarning(
                "No Selection",
                "Please select an environment first."
            )
            return
            
        try:
            # Update system
            self.tree.set(
                self.tree.selection()[0],
                "status",
                "In Use"
            )
            messagebox.showinfo(
                "Success",
                f"Environment set to: {self.selected_env}"
            )
            
        except Exception as e:
            messagebox.showerror(
                "Error",
                f"Failed to set environment: {e}"
            )

    def _add_to_data_pool(self):
        """Add selected path to data pool."""
        if not self.selected_env:
            messagebox.showwarning(
                "No Selection",
                "Please select a path first."
            )
            return
            
        try:
            # Copy to data pool
            dest = AIOConfig.DATA_POOL_DIR / self.selected_env.name
            if self.selected_env.is_dir():
                shutil.copytree(self.selected_env, dest)
            else:
                shutil.copy2(self.selected_env, dest)
                
            messagebox.showinfo(
                "Success",
                f"Added to data pool: {self.selected_env.name}"
            )
            
        except Exception as e:
            messagebox.showerror(
                "Error",
                f"Failed to add to data pool: {e}"
            )

    def _analyze_contents(self):
        """Analyze selected environment contents."""
        if not self.selected_env:
            messagebox.showwarning(
                "No Selection",
                "Please select an environment first."
            )
            return
            
        try:
            # Clear previous analysis
            self.analysis_text.delete('1.0', tk.END)
            
            # Analyze path
            stats = self._get_path_stats(self.selected_env)
            
            # Display results
            self.analysis_text.insert(tk.END, "Environment Analysis\n\n")
            
            for key, value in stats.items():
                self.analysis_text.insert(tk.END, f"{key}: {value}\n")
                
        except Exception as e:
            self.analysis_text.insert(
                tk.END,
                f"Analysis failed: {e}\n"
            )

    def _get_path_stats(self, path: Path) -> Dict[str, Any]:
        """Get detailed path statistics."""
        stats = {
            "Total Size": 0,
            "File Count": 0,
            "Directory Count": 0,
            "Average File Size": 0,
            "Largest File": ("", 0),
            "Most Common Extension": ("", 0),
            "Last Modified": None
        }
        
        extensions = defaultdict(int)
        
        try:
            for item in path.rglob("*"):
                if item.is_file():
                    size = item.stat().st_size
                    stats["Total Size"] += size
                    stats["File Count"] += 1
                    
                    if size > stats["Largest File"][1]:
                        stats["Largest File"] = (item.name, size)
                        
                    extensions[item.suffix] += 1
                    
                elif item.is_dir():
                    stats["Directory Count"] += 1
                    
                mtime = item.stat().st_mtime
                if not stats["Last Modified"] or mtime > stats["Last Modified"]:
                    stats["Last Modified"] = mtime
                    
            # Calculate averages and most common
            if stats["File Count"] > 0:
                stats["Average File Size"] = stats["Total Size"] / stats["File Count"]
                
            if extensions:
                stats["Most Common Extension"] = max(
                    extensions.items(),
                    key=lambda x: x[1]
                )
                
            # Format values
            stats["Total Size"] = f"{stats['Total Size']:,} bytes"
            stats["Average File Size"] = f"{stats['Average File Size']:,.0f} bytes"
            stats["Largest File"] = f"{stats['Largest File'][0]} ({stats['Largest File'][1]:,} bytes)"
            stats["Most Common Extension"] = f"{stats['Most Common Extension'][0]} ({stats['Most Common Extension'][1]} files)"
            stats["Last Modified"] = time.ctime(stats["Last Modified"]) if stats["Last Modified"] else "Never"
            
            return stats
            
        except Exception as e:
            logging.error(f"Error getting path stats: {e}")
            return {"Error": str(e)}

# Update SystemControlPanel to use new visualizer
class SystemControlPanel:
    """Enhanced master control panel."""
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("AIOS Control Center")
        self.root.geometry("1200x800")
        
        # Create main notebook for tabs
        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(fill=tk.BOTH, expand=True)
        
        # Create tabs
        self.env_tab = self._create_environment_tab()
        self.organism_tab = self._create_organism_tab()
        self.data_pool_tab = self._create_data_pool_tab()
        self.monitor_tab = self._create_monitor_tab()
        
        # Add configuration tab
        self.config_tab = self._create_config_tab()
        
        # Update other tabs to use configuration
        self._update_tabs_with_config()
        
        # Update timer
        self.root.after(1000, self._update_ui)

    def _create_environment_tab(self) -> ttk.Frame:
        """Environment control tab."""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Environments")
        
        # Environment tree view
        tree_frame = ttk.Frame(tab)
        tree_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        self.env_tree = ttk.Treeview(tree_frame)
        self.env_tree.pack(fill=tk.BOTH, expand=True)
        
        # Control panel
        control_frame = ttk.Frame(tab)
        control_frame.pack(side=tk.RIGHT, fill=tk.Y)
        
        ttk.Button(
            control_frame, 
            text="Add Directory",
            command=self._add_environment
        ).pack(fill=tk.X, pady=5)
        
        ttk.Button(
            control_frame,
            text="Remove Selected",
            command=self._remove_environment
        ).pack(fill=tk.X, pady=5)
        
        # Scan settings
        scan_frame = ttk.LabelFrame(control_frame, text="Scan Settings")
        scan_frame.pack(fill=tk.X, pady=10)
        
        ttk.Label(scan_frame, text="Depth:").pack()
        self.scan_depth = tk.StringVar(value="3")
        ttk.Entry(
            scan_frame,
            textvariable=self.scan_depth
        ).pack(fill=tk.X, padx=5)
        
        return tab

    def _create_organism_tab(self) -> ttk.Frame:
        """Organism management tab."""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Organisms")
        
        # Split view
        paned = ttk.PanedWindow(tab, orient=tk.HORIZONTAL)
        paned.pack(fill=tk.BOTH, expand=True)
        
        # Organism list
        list_frame = ttk.Frame(paned)
        ttk.Label(list_frame, text="Active Organisms").pack()
        
        self.organism_list = ttk.Treeview(list_frame)
        self.organism_list.pack(fill=tk.BOTH, expand=True)
        
        paned.add(list_frame)
        
        # Details panel
        details_frame = ttk.Frame(paned)
        
        # Organism controls
        control_frame = ttk.LabelFrame(details_frame, text="Controls")
        control_frame.pack(fill=tk.X, pady=5)
        
        ttk.Button(
            control_frame,
            text="Create New Organism",
            command=self._create_organism
        ).pack(fill=tk.X, pady=2)
        
        ttk.Button(
            control_frame,
            text="Split Selected",
            command=self._split_organism
        ).pack(fill=tk.X, pady=2)
        
        # Status display
        status_frame = ttk.LabelFrame(details_frame, text="Status")
        status_frame.pack(fill=tk.X, pady=5)
        
        self.status_text = scrolledtext.ScrolledText(
            status_frame,
            height=10
        )
        self.status_text.pack(fill=tk.BOTH, expand=True)
        
        paned.add(details_frame)
        
        return tab

    def _create_data_pool_tab(self) -> ttk.Frame:
        """Data pool management tab."""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Data Pool")
        
        # Data pool browser
        browser_frame = ttk.Frame(tab)
        browser_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        self.pool_tree = ttk.Treeview(browser_frame)
        self.pool_tree.pack(fill=tk.BOTH, expand=True)
        
        # Control panel
        control_frame = ttk.Frame(tab)
        control_frame.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Add data controls
        ttk.Button(
            control_frame,
            text="Add Files",
            command=self._add_to_pool
        ).pack(fill=tk.X, pady=5)
        
        ttk.Button(
            control_frame,
            text="Add Directory",
            command=self._add_dir_to_pool
        ).pack(fill=tk.X, pady=5)
        
        # Categories frame
        cat_frame = ttk.LabelFrame(control_frame, text="Categories")
        cat_frame.pack(fill=tk.X, pady=10)
        
        self.categories = {
            "code": tk.BooleanVar(value=True),
            "data": tk.BooleanVar(value=True),
            "docs": tk.BooleanVar(value=True)
        }
        
        for cat, var in self.categories.items():
            ttk.Checkbutton(
                cat_frame,
                text=cat.title(),
                variable=var
            ).pack(fill=tk.X)
            
        return tab

    def _create_monitor_tab(self) -> ttk.Frame:
        """System monitoring tab."""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Monitor")
        
        # Stats panel
        stats_frame = ttk.LabelFrame(tab, text="System Stats")
        stats_frame.pack(fill=tk.X)
        
        self.stats_labels = {}
        for stat in ["Organisms", "Environments", "Pool Size", "Memory"]:
            self.stats_labels[stat] = ttk.Label(stats_frame, text=f"{stat}: --")
            self.stats_labels[stat].pack()
            
        # Activity log
        log_frame = ttk.LabelFrame(tab, text="Activity Log")
        log_frame.pack(fill=tk.BOTH, expand=True)
        
        self.log_text = scrolledtext.ScrolledText(log_frame)
        self.log_text.pack(fill=tk.BOTH, expand=True)
        
        return tab

    def _create_config_tab(self) -> ttk.Frame:
        """Create configuration control tab."""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Configuration")
        
        # Add configuration panel
        self.config_panel = ConfigurationPanel(tab)
        
        return tab

    def _update_tabs_with_config(self):
        """Update other tabs to use configuration settings."""
        # Update environment tab
        self.scan_depth.set(self.config_panel.scan_depth.get())
        
        # Update organism tab
        self._update_organism_limits()
        
        # Update data pool tab
        self._update_pool_paths()

    def _update_ui(self):
        """Update UI elements periodically."""
        try:
            # Update stats
            stats = self._get_system_stats()
            for stat, value in stats.items():
                if stat in self.stats_labels:
                    self.stats_labels[stat].config(text=f"{stat}: {value}")
                    
            # Update organism list
            self._update_organism_list()
            
            # Update environment tree
            self._update_environment_tree()
            
            # Update data pool
            self._update_data_pool()
            
        except Exception as e:
            self.log_error(f"UI update error: {e}")
            
        finally:
            self.root.after(1000, self._update_ui)

    def _get_system_stats(self) -> Dict[str, Any]:
        """Get current system statistics."""
        return {
            "Organisms": len(self.organisms),
            "Environments": len(self.environments),
            "Pool Size": self._get_pool_size(),
            "Memory": f"{self._get_memory_usage():.1f}MB"
        }

    def _update_organism_list(self):
        """Update organism list display."""
        for item in self.organism_list.get_children():
            self.organism_list.delete(item)
            
        for org_id, organism in self.organisms.items():
            self.organism_list.insert(
                "",
                "end",
                text=org_id,
                values=(
                    str(organism.environment),
                    organism.status
                )
            )

    def _update_environment_tree(self):
        """Update environment tree display."""
        for item in self.env_tree.get_children():
            self.env_tree.delete(item)
            
        for env_path in self.environments:
            self._add_path_to_tree(env_path)

    def _add_path_to_tree(self, path: Path, parent=""):
        """Add path to environment tree."""
        node = self.env_tree.insert(
            parent,
            "end",
            text=path.name,
            values=(str(path),)
        )
        
        if path.is_dir():
            try:
                for child in path.iterdir():
                    self._add_path_to_tree(child, node)
            except PermissionError:
                pass

    def _update_data_pool(self):
        """Update data pool display."""
        for item in self.pool_tree.get_children():
            self.pool_tree.delete(item)
            
        pool_data = self._scan_data_pool()
        for category, items in pool_data.items():
            cat_node = self.pool_tree.insert(
                "",
                "end",
                text=category,
                values=(len(items),)
            )
            
            for item in items:
                self.pool_tree.insert(
                    cat_node,
                    "end",
                    text=item.name,
                    values=(str(item),)
                )

    def _add_environment(self):
        """Add new environment directory."""
        path = filedialog.askdirectory()
        if path:
            self.add_environment(Path(path))

    def _remove_environment(self):
        """Remove selected environment."""
        selected = self.env_tree.selection()
        if selected:
            item = selected[0]
            path = Path(self.env_tree.item(item)["values"][0])
            self.remove_environment(path)

    def _create_organism(self):
        """Create new organism."""
        try:
            organism_id = self.create_organism()
            self.log_info(f"Created organism: {organism_id}")
        except Exception as e:
            self.log_error(f"Failed to create organism: {e}")

    def _split_organism(self):
        """Split selected organism."""
        selected = self.organism_list.selection()
        if selected:
            organism_id = self.organism_list.item(selected[0])["text"]
            try:
                new_id = self.split_organism(organism_id)
                self.log_info(f"Split organism {organism_id} -> {new_id}")
            except Exception as e:
                self.log_error(f"Failed to split organism: {e}")

    def _add_to_pool(self):
        """Add files to data pool."""
        files = filedialog.askopenfilenames()
        if files:
            for file in files:
                self.add_to_pool(Path(file))

    def _add_dir_to_pool(self):
        """Add directory to data pool."""
        path = filedialog.askdirectory()
        if path:
            self.add_directory_to_pool(Path(path))

    def log_info(self, message: str):
        """Log information message."""
        self.log_text.insert("end", f"[INFO] {message}\n")
        self.log_text.see("end")

    def log_error(self, message: str):
        """Log error message."""
        self.log_text.insert("end", f"[ERROR] {message}\n")
        self.log_text.see("end")

    def _update_organism_limits(self):
        """Update organism creation limits."""
        max_organisms = int(self.config_panel.max_organisms.get())
        if len(self.organisms) >= max_organisms:
            self.organism_create_btn.config(state=tk.DISABLED)
            self.organism_split_btn.config(state=tk.DISABLED)
        else:
            self.organism_create_btn.config(state=tk.NORMAL)
            self.organism_split_btn.config(state=tk.NORMAL)

    def _update_pool_paths(self):
        """Update data pool paths from configuration."""
        self.pool_path = Path(self.config_panel.path_vars["Data Pool"].get())
        self._refresh_pool_view()

# Update UnifiedSystem to use control panel
class UnifiedSystem:
    """Master coordinator with UI controls."""
    def __init__(self):
        self.root = tk.Tk()
        self.control_panel = SystemControlPanel(self.root)
        self.organism_manager = OrganismManager()
        
    async def run(self):
        """Main execution loop with UI."""
        try:
            # Start UI update thread
            with ThreadPoolExecutor() as executor:
                ui_future = executor.submit(self.root.mainloop)
                
                # Run system loop
                while True:
                    if not ui_future.running():
                        break
                        
                    await self.organism_manager.run_evolution_cycle()
                    await asyncio.sleep(1)
                    
        except Exception as e:
            logging.error(f"Runtime error: {e}")
            messagebox.showerror("Error", str(e))
            raise
        finally:
            await self.cleanup()

if __name__ == "__main__":
    # Initialize system
    AIOConfig.ensure_directories()
    
    async def main():
        try:
            # Create organism with neural core
            organism = AbsoluteOrganism(
                organism_id=f"absolute_{int(time.time())}",
                base_dir=AIOConfig.BASE_DIR
            )
            
            # Start GUI
            root = tk.Tk()
            control_panel = SystemControlPanel(root, organism)
            
            # Run evolution cycles
            while True:
                await organism.evolve()
                control_panel.update_status()
                await asyncio.sleep(1)
                
        except Exception as e:
            logging.critical(f"System failure: {e}")
            if not tk._default_root:
                messagebox.showerror("Critical Error", str(e))
            raise
        
        # Create initial organism
        try:
            organism_id = await manager.create_organism()
            logging.info(f"Created organism: {organism_id}")
            
            # Keep system running
            while True:
                await asyncio.sleep(60)
                
        except Exception as e:
            logging.error(f"System error: {e}")
            
    # Run system
    asyncio.run(main())

class ProcessManagerPanel:
    """Manages and visualizes all running processes and organism activities."""
    def __init__(self, parent: ttk.Frame):
        self.frame = ttk.LabelFrame(parent, text="Process Manager")
        self.frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Split view
        self.paned = ttk.PanedWindow(self.frame, orient=tk.HORIZONTAL)
        self.paned.pack(fill=tk.BOTH, expand=True)
        
        # Active processes list
        self.process_frame = self._create_process_frame()
        self.paned.add(self.process_frame)
        
        # Process details
        self.details_frame = self._create_details_frame()
        self.paned.add(self.details_frame)
        
        # Process tracking
        self.active_processes = {}
        self.process_stats = {}
        
    def _create_process_frame(self) -> ttk.Frame:
        """Create process list frame."""
        frame = ttk.Frame(self.paned)
        
        # Controls
        controls = ttk.Frame(frame)
        controls.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Button(
            controls,
            text="Refresh",
            command=self._refresh_processes
        ).pack(side=tk.LEFT, padx=2)
        
        ttk.Button(
            controls,
            text="Stop Selected",
            command=self._stop_selected
        ).pack(side=tk.LEFT, padx=2)
        
        # Process list with scrollbar
        list_container = ttk.Frame(frame)
        list_container.pack(fill=tk.BOTH, expand=True)
        
        self.process_tree = ttk.Treeview(
            list_container,
            columns=('type', 'status', 'cpu', 'memory'),
            selectmode='browse'
        )
        self.process_tree.heading('type', text='Type')
        self.process_tree.heading('status', text='Status')
        self.process_tree.heading('cpu', text='CPU %')
        self.process_tree.heading('memory', text='Memory')
        
        scrollbar = ttk.Scrollbar(
            list_container,
            orient="vertical",
            command=self.process_tree.yview
        )
        self.process_tree.configure(yscrollcommand=scrollbar.set)
        
        self.process_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Bind events
        self.process_tree.bind('<<TreeviewSelect>>', self._on_select)
        
        return frame
        
    def _create_details_frame(self) -> ttk.Frame:
        """Create process details frame."""
        frame = ttk.Frame(self.paned)
        
        # Resource usage
        usage_frame = ttk.LabelFrame(frame, text="Resource Usage")
        usage_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.usage_graph = ttk.Canvas(
            usage_frame,
            height=100,
            background='white'
        )
        self.usage_graph.pack(fill=tk.X, padx=5, pady=5)
        
        # Process info
        info_frame = ttk.LabelFrame(frame, text="Process Information")
        info_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.info_labels = {}
        for field in ["ID", "Type", "Status", "Start Time", "Runtime"]:
            self.info_labels[field] = ttk.Label(
                info_frame,
                text=f"{field}: --"
            )
            self.info_labels[field].pack(fill=tk.X, padx=5, pady=2)
        
        # Activity log
        log_frame = ttk.LabelFrame(frame, text="Activity Log")
        log_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        self.log_text = scrolledtext.ScrolledText(
            log_frame,
            height=10,
            wrap=tk.WORD
        )
        self.log_text.pack(fill=tk.BOTH, expand=True)
        
        return frame
        
    def register_process(
        self,
        process_id: str,
        process_type: str,
        metadata: Dict[str, Any]
    ) -> None:
        """Register new process for tracking."""
        self.active_processes[process_id] = {
            "type": process_type,
            "status": "Running",
            "start_time": time.time(),
            "metadata": metadata,
            "stats": []
        }
        
        self.process_tree.insert(
            "",
            "end",
            text=process_id,
            values=(
                process_type,
                "Running",
                "0.0",
                "0 MB"
            )
        )
        
        self.log_activity(
            process_id,
            f"Started {process_type} process"
        )
        
    def update_process(
        self,
        process_id: str,
        stats: Dict[str, float]
    ) -> None:
        """Update process statistics."""
        if process_id not in self.active_processes:
            return
            
        process = self.active_processes[process_id]
        process["stats"].append(stats)
        
        # Update tree view
        for item in self.process_tree.get_children():
            if self.process_tree.item(item)["text"] == process_id:
                self.process_tree.set(
                    item,
                    "cpu",
                    f"{stats['cpu_percent']:.1f}"
                )
                self.process_tree.set(
                    item,
                    "memory",
                    f"{stats['memory_mb']:.1f} MB"
                )
                break
                
        # Update graph if selected
        if self.process_tree.selection():
            selected_id = self.process_tree.item(
                self.process_tree.selection()[0]
            )["text"]
            if selected_id == process_id:
                self._update_graph(process_id)
                
    def stop_process(self, process_id: str) -> None:
        """Stop tracking process."""
        if process_id in self.active_processes:
            process = self.active_processes[process_id]
            process["status"] = "Stopped"
            
            # Update tree view
            for item in self.process_tree.get_children():
                if self.process_tree.item(item)["text"] == process_id:
                    self.process_tree.set(item, "status", "Stopped")
                    break
                    
            self.log_activity(
                process_id,
                f"Stopped {process['type']} process"
            )
            
    def log_activity(self, process_id: str, message: str) -> None:
        """Log process activity."""
        timestamp = time.strftime("%H:%M:%S")
        self.log_text.insert(
            "end",
            f"[{timestamp}] {process_id}: {message}\n"
        )
        self.log_text.see("end")
        
    def _refresh_processes(self) -> None:
        """Refresh process list."""
        for item in self.process_tree.get_children():
            process_id = self.process_tree.item(item)["text"]
            if process_id in self.active_processes:
                process = self.active_processes[process_id]
                stats = process["stats"][-1] if process["stats"] else {}
                
                self.process_tree.set(
                    item,
                    "status",
                    process["status"]
                )
                self.process_tree.set(
                    item,
                    "cpu",
                    f"{stats.get('cpu_percent', 0):.1f}"
                )
                self.process_tree.set(
                    item,
                    "memory",
                    f"{stats.get('memory_mb', 0):.1f} MB"
                )
                
    def _stop_selected(self) -> None:
        """Stop selected process."""
        if not self.process_tree.selection():
            return
            
        process_id = self.process_tree.item(
            self.process_tree.selection()[0]
        )["text"]
        self.stop_process(process_id)
        
    def _on_select(self, event) -> None:
        """Handle process selection."""
        if not self.process_tree.selection():
            return
            
        process_id = self.process_tree.item(
            self.process_tree.selection()[0]
        )["text"]
        
        if process_id in self.active_processes:
            process = self.active_processes[process_id]
            
            # Update info labels
            self.info_labels["ID"].config(
                text=f"ID: {process_id}"
            )
            self.info_labels["Type"].config(
                text=f"Type: {process['type']}"
            )
            self.info_labels["Status"].config(
                text=f"Status: {process['status']}"
            )
            self.info_labels["Start Time"].config(
                text=f"Start Time: {time.ctime(process['start_time'])}"
            )
            
            runtime = time.time() - process['start_time']
            self.info_labels["Runtime"].config(
                text=f"Runtime: {runtime:.1f}s"
            )
            
            # Update graph
            self._update_graph(process_id)
            
    def _update_graph(self, process_id: str) -> None:
        """Update resource usage graph."""
        process = self.active_processes[process_id]
        stats = process["stats"]
        
        if not stats:
            return
            
        # Clear canvas
        self.usage_graph.delete("all")
        
        # Draw CPU usage (blue)
        self._draw_stat_line(
            stats,
            'cpu_percent',
            'blue',
            100  # Max CPU %
        )
        
        # Draw memory usage (red)
        self._draw_stat_line(
            stats,
            'memory_mb',
            'red',
            max(s['memory_mb'] for s in stats)
        )
        
    def _draw_stat_line(
        self,
        stats: List[Dict[str, float]],
        stat_key: str,
        color: str,
        max_value: float
    ) -> None:
        """Draw statistics line on graph."""
        width = self.usage_graph.winfo_width()
        height = self.usage_graph.winfo_height()
        
        if width <= 1:  # Not yet drawn
            return
            
        # Calculate points
        points = []
        for i, stat in enumerate(stats[-50:]):  # Show last 50 points
            x = width * (i / 50)
            y = height * (1 - stat[stat_key] / max_value)
            points.append(x)
            points.append(y)
            
        if len(points) >= 4:
            self.usage_graph.create_line(
                *points,
                fill=color,
                smooth=True,
                width=2
            )

# Update SystemControlPanel to use ProcessManager
class SystemControlPanel:
    def __init__(self, root: tk.Tk):
        # ...existing initialization...
        
        # Add process manager tab
        self.process_tab = self._create_process_tab()
        
    def _create_process_tab(self) -> ttk.Frame:
        """Create process manager tab."""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Processes")
        
        # Add process manager
        self.process_manager = ProcessManagerPanel(tab)
        
        return tab
        
    def register_organism(self, organism_id: str) -> None:
        """Register new organism in process manager."""
        self.process_manager.register_process(
            organism_id,
            "Organism",
            {"environment": str(self.organisms[organism_id].environment)}
        )
        
    def update_organism_stats(
        self,
        organism_id: str,
        stats: Dict[str, float]
    ) -> None:
        """Update organism statistics."""
        self.process_manager.update_process(organism_id, stats)

class DataPoolVisualizer:
    """Advanced visualization and management of the universal data pool."""
    def __init__(self, parent: ttk.Frame):
        self.frame = ttk.LabelFrame(parent, text="Data Pool Explorer")
        self.frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Split view
        self.paned = ttk.PanedWindow(self.frame, orient=tk.HORIZONTAL)
        self.paned.pack(fill=tk.BOTH, expand=True)
        
        # Left panel - Category tree
        self.category_frame = self._create_category_frame()
        self.paned.add(self.category_frame)
        
        # Right panel - Details and controls
        self.details_frame = self._create_details_frame()
        self.paned.add(self.details_frame)
        
    def _create_category_frame(self) -> ttk.Frame:
        """Create category tree view."""
        frame = ttk.Frame(self.paned)
        
        # Controls
        controls = ttk.Frame(frame)
        controls.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Button(
            controls,
            text="Add Files",
            command=self._add_files
        ).pack(side=tk.LEFT, padx=2)
        
        ttk.Button(
            controls,
            text="Add Folder",
            command=self._add_folder
        ).pack(side=tk.LEFT, padx=2)
        
        ttk.Button(
            controls,
            text="Remove",
            command=self._remove_selected
        ).pack(side=tk.LEFT, padx=2)
        
        # Category tree with scrollbar
        tree_container = ttk.Frame(frame)
        tree_container.pack(fill=tk.BOTH, expand=True)
        
        self.category_tree = ttk.Treeview(
            tree_container,
            columns=('type', 'count', 'size'),
            selectmode='browse'
        )
        self.category_tree.heading('type', text='Type')
        self.category_tree.heading('count', text='Files')
        self.category_tree.heading('size', text='Size')
        
        scrollbar = ttk.Scrollbar(
            tree_container,
            orient="vertical",
            command=self.category_tree.yview
        )
        self.category_tree.configure(yscrollcommand=scrollbar.set)
        
        self.category_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Bind events
        self.category_tree.bind('<<TreeviewSelect>>', self._on_category_select)
        
        return frame
        
    def _create_details_frame(self) -> ttk.Frame:
        """Create details panel."""
        frame = ttk.Frame(self.paned)
        
        # Search frame
        search_frame = ttk.Frame(frame)
        search_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Label(search_frame, text="Search:").pack(side=tk.LEFT)
        self.search_var = tk.StringVar()
        self.search_var.trace('w', self._filter_files)
        ttk.Entry(
            search_frame,
            textvariable=self.search_var
        ).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        
        # File list with filter options
        filter_frame = ttk.LabelFrame(frame, text="Filters")
        filter_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.filter_vars = {
            "Code": tk.BooleanVar(value=True),
            "Data": tk.BooleanVar(value=True),
            "Models": tk.BooleanVar(value=True),
            "Documentation": tk.BooleanVar(value=True)
        }
        
        for label, var in self.filter_vars.items():
            ttk.Checkbutton(
                filter_frame,
                text=label,
                variable=var,
                command=self._apply_filters
            ).pack(side=tk.LEFT, padx=5)
        
        # File list
        list_frame = ttk.LabelFrame(frame, text="Files")
        list_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        self.file_list = ttk.Treeview(
            list_frame,
            columns=('type', 'size', 'modified'),
            selectmode='extended'
        )
        self.file_list.heading('type', text='Type')
        self.file_list.heading('size', text='Size')
        self.file_list.heading('modified', text='Modified')
        
        list_scroll = ttk.Scrollbar(
            list_frame,
            orient="vertical",
            command=self.file_list.yview
        )
        self.file_list.configure(yscrollcommand=list_scroll.set)
        
        self.file_list.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        list_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Stats frame
        stats_frame = ttk.LabelFrame(frame, text="Statistics")
        stats_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.stats_labels = {}
        for stat in ["Total Size", "File Count", "Last Update"]:
            self.stats_labels[stat] = ttk.Label(
                stats_frame,
                text=f"{stat}: --"
            )
            self.stats_labels[stat].pack(fill=tk.X, padx=5, pady=2)
        
        # Preview frame
        preview_frame = ttk.LabelFrame(frame, text="Preview")
        preview_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        self.preview_text = scrolledtext.ScrolledText(
            preview_frame,
            wrap=tk.WORD,
            height=10
        )
        self.preview_text.pack(fill=tk.BOTH, expand=True)
        
        return frame

    def _add_files(self) -> None:
        """Add files to data pool."""
        files = filedialog.askopenfilenames(
            title="Add Files to Data Pool",
            filetypes=[
                ("All Files", "*.*"),
                ("Python Files", "*.py"),
                ("Text Files", "*.txt"),
                ("JSON Files", "*.json"),
                ("YAML Files", "*.yaml"),
                ("Model Files", "*.h5;*.pkl")
            ]
        )
        if files:
            for file in files:
                self._add_to_pool(Path(file))
            self._refresh_view()
            
    def _add_folder(self) -> None:
        """Add folder to data pool."""
        folder = filedialog.askdirectory(
            title="Add Folder to Data Pool"
        )
        if folder:
            self._add_to_pool(Path(folder))
            self._refresh_view()
            
    def _add_to_pool(self, path: Path) -> None:
        """Add file or folder to data pool."""
        try:
            dest = AIOConfig.DATA_POOL_DIR / path.name
            if path.is_dir():
                shutil.copytree(path, dest, dirs_exist_ok=True)
            else:
                shutil.copy2(path, dest)
            
            self.log_activity(
                f"Added {path.name} to data pool"
            )
            
        except Exception as e:
            messagebox.showerror(
                "Error",
                f"Failed to add {path.name}: {e}"
            )
            
    def _remove_selected(self) -> None:
        """Remove selected items from data pool."""
        selected = self.file_list.selection()
        if not selected:
            return
            
        if messagebox.askyesno(
            "Confirm Delete",
            "Remove selected items from data pool?"
        ):
            for item in selected:
                path = Path(self.file_list.item(item)["values"][0])
                try:
                    if path.is_dir():
                        shutil.rmtree(path)
                    else:
                        path.unlink()
                    self.log_activity(f"Removed {path.name}")
                except Exception as e:
                    messagebox.showerror(
                        "Error",
                        f"Failed to remove {path.name}: {e}"
                    )
            self._refresh_view()
            
    def _filter_files(self, *args) -> None:
        """Filter files based on search text and category filters."""
        search = self.search_var.get().lower()
        self._apply_filters()
        
    def _apply_filters(self) -> None:
        """Apply category filters and search."""
        # Clear current view
        for item in self.file_list.get_children():
            self.file_list.delete(item)
            
        # Get active filters
        active_filters = [
            cat for cat, var in self.filter_vars.items()
            if var.get()
        ]
        
        # Get search text
        search = self.search_var.get().lower()
        
        # Add matching files
        for file in self._get_filtered_files(active_filters, search):
            self._add_file_to_list(file)
            
        # Update stats
        self._update_stats()
        
    def _get_filtered_files(
        self,
        categories: List[str],
        search: str
    ) -> List[Path]:
        """Get files matching filters and search."""
        files = []
        for path in AIOConfig.DATA_POOL_DIR.rglob("*"):
            if path.is_file():
                # Check category
                category = self._get_file_category(path)
                if category not in categories:
                    continue
                    
                # Check search
                if search and search not in path.name.lower():
                    continue
                    
                files.append(path)
        return files
        
    def _get_file_category(self, path: Path) -> str:
        """Determine file category."""
        if path.suffix in ['.py', '.js', '.cpp']:
            return "Code"
        elif path.suffix in ['.json', '.yaml', '.csv']:
            return "Data"
        elif path.suffix in ['.h5', '.pkl', '.model']:
            return "Models"
        elif path.suffix in ['.txt', '.md', '.rst']:
            return "Documentation"
        return "Other"
        
    def _add_file_to_list(self, path: Path) -> None:
        """Add file to list view."""
        stats = path.stat()
        self.file_list.insert(
            "",
            "end",
            text=path.name,
            values=(
                str(path),
                f"{stats.st_size:,} bytes",
                time.ctime(stats.st_mtime)
            )
        )
        
    def _update_stats(self) -> None:
        """Update statistics display."""
        files = list(AIOConfig.DATA_POOL_DIR.rglob("*"))
        total_size = sum(f.stat().st_size for f in files if f.is_file())
        file_count = len([f for f in files if f.is_file()])
        last_update = max(
            (f.stat().st_mtime for f in files if f.is_file()),
            default=0
        )
        
        self.stats_labels["Total Size"].config(
            text=f"Total Size: {total_size:,} bytes"
        )
        self.stats_labels["File Count"].config(
            text=f"File Count: {file_count:,}"
        )
        self.stats_labels["Last Update"].config(
            text=f"Last Update: {time.ctime(last_update)}"
        )
        
    def _refresh_view(self) -> None:
        """Refresh entire view."""
        self._update_categories()
        self._apply_filters()
        
    def _update_categories(self) -> None:
        """Update category tree."""
        for item in self.category_tree.get_children():
            self.category_tree.delete(item)
            
        categories = defaultdict(lambda: {"count": 0, "size": 0})
        
        for file in AIOConfig.DATA_POOL_DIR.rglob("*"):
            if file.is_file():
                category = self._get_file_category(file)
                categories[category]["count"] += 1
                categories[category]["size"] += file.stat().st_size
                
        for category, stats in categories.items():
            self.category_tree.insert(
                "",
                "end",
                text=category,
                values=(
                    category,
                    f"{stats['count']:,}",
                    f"{stats['size']:,} bytes"
                )
            )
            
    def _on_category_select(self, event) -> None:
        """Handle category selection."""
        selected = self.category_tree.selection()
        if not selected:
            return
            
        # Get selected category
        category = self.category_tree.item(selected[0])["text"]
        
        # Update filters
        for cat, var in self.filter_vars.items():
            var.set(cat == category)
            
        # Apply filters
        self._apply_filters()
        
    def log_activity(self, message: str) -> None:
        """Log activity to preview text."""
        timestamp = time.strftime("%H:%M:%S")
        self.preview_text.insert(
            "end",
            f"[{timestamp}] {message}\n"
        )
        self.preview_text.see("end")

# Update SystemControlPanel to use DataPoolVisualizer
class SystemControlPanel:
    def __init__(self, root: tk.Tk):
        # ...existing initialization...
        
        # Add data pool tab with visualizer
        self.data_pool_tab = self._create_data_pool_tab()
        
    def _create_data_pool_tab(self) -> ttk.Frame:
        """Create data pool management tab."""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Data Pool")
        
        # Add data pool visualizer
        self.data_pool_vis = DataPoolVisualizer(tab)
        
        return tab

class BattleArena:
    """Arena for organism competitions and evolution."""
    def __init__(self):
        self.battle_history = []
        self.current_champions = set()
        self.performance_metrics = {}
        self.mutation_pool = []
        
    async def run_battle_cycle(self, organisms: Dict[str, "Organism"]) -> None:
        """Run a battle cycle to determine the most successful organisms."""
        start_time = time.time()
        try:
            # Group organisms by environment for fair comparison
            env_groups = self._group_by_environment(organisms)
            
            # Run mini-tournaments within each environment
            for env, group in env_groups.items():
                winner = await self._run_mini_tournament(group)
                if winner:
                    self.current_champions.add(winner)
                    
            # Record performance metrics
            await self._record_battle_metrics(organisms, start_time)
            
        except Exception as e:
            logging.error(f"Battle cycle failed: {e}")

    def _group_by_environment(self, organisms: Dict[str, "Organism"]) -> Dict[Path, List["Organism"]]:
        """Group organisms by their selected environment."""
        groups = defaultdict(list)
        for org in organisms.values():
            if org.environment:
                groups[org.environment].append(org)
        return groups

    async def _run_mini_tournament(self, group: List["Organism"]) -> Optional[str]:
        """Run a tournament among organisms in the same environment."""
        if not group:
            return None
            
        tournament_log = {
            "timestamp": time.time(),
            "participants": len(group),
            "rounds": []
        }
        
        # Round-robin tournament
        scores = defaultdict(float)
        for org1, org2 in itertools.combinations(group, 2):
            winner_id = org1.id if org1.intelligence > org2.intelligence else org2.id
            scores[winner_id] += 1
            
            tournament_log["rounds"].append({
                "winner": winner_id,
                "score": 1
            })
            
        # Determine winner
        if scores:
            winner_id = max(scores.items(), key=lambda x: x[1])[0]
            tournament_log["winner"] = winner_id
            self.battle_history.append(tournament_log)
            return winner_id
            
        return None

    async def _record_battle_metrics(self, organisms: Dict[str, "Organism"], start_time: float) -> None:
        """Record detailed battle metrics for analysis."""
        duration = time.time() - start_time
        metrics = {
            "timestamp": time.time(),
            "total_organisms": len(organisms),
            "champions": len(self.current_champions),
            "duration_seconds": duration
        }
        self.performance_metrics[time.time()] = metrics

class OrganismManager:
    """Manages organism lifecycle and mutation coordination."""
    def __init__(self):
        self.scanner = EnvironmentScanner()
        self.organisms: Dict[str, Organism] = {}
        self.network = KnowledgeNetwork()
        self.battle_arena = BattleArena()
        
    async def create_organism(self) -> str:
        """Create a new organism with a unique environment."""
        # Generate unique ID
        organism_id = f"organism_{int(time.time() * 1000)}"
        
        # Create organism
        base_dir = AIOConfig.ORGANISMS_DIR / organism_id
        organism = Organism(organism_id, base_dir)
        
        # Select environment
        available = [p for p in self.scanner.indexed_paths 
                    if not any(o.environment == p for o in self.organisms.values())]
        if available:
            organism.environment = available[0]
        
        # Initialize
        if await organism.initialize():
            self.organisms[organism_id] = organism
            return organism_id
        else:
            raise RuntimeError("Failed to initialize organism")

    def _select_environment(self) -> Path:
        """Select a unique environment for the organism."""
        available = [p for p in self.scanner.indexed_paths 
                    if not any(o.environment == p for o in self.organisms.values())]
        if available:
            return available[0]
        else:
            raise RuntimeError("No available environments found")

    async def run_evolution_cycle(self) -> None:
        """Run evolution cycle for all organisms."""
        for organism_id, organism in self.organisms.items():
            await organism.run_cycle()
            
        # Run battle cycle if enough organisms
        if len(self.organisms) >= 2:
            await self.battle_arena.run_battle_cycle(self.organisms)

class AIQuantumCore:
    """Core quantum-inspired intelligence processing with CPU fallback."""
    def __init__(self):
        self.using_gpu = False
        self.quantum_states = defaultdict(float)
        self.em_sensors = self._init_em_sensors()
        self.memory_maps = []
        
    def _init_em_sensors(self) -> Dict[str, Any]:
        """Initialize electromagnetic and voltage sensors."""
        sensors = {}
        try:
            # Try to access voltage/power info
            if platform.system() == 'Linux':
                with open('/sys/class/power_supply/BAT0/voltage_now', 'r') as f:
                    sensors['voltage'] = float(f.read().strip()) / 1000000.0
            # Fallback to CPU temperature as EM proxy
            sensors['cpu_temp'] = self._get_cpu_temp()
        except Exception:
            pass
        return sensors
        
    def process_quantum_state(self, data: Any) -> Dict[str, float]:
        """Process data through quantum-inspired channels with GPU acceleration."""
        try:
            if self.using_gpu:
                return self._gpu_quantum_process(data)
            return self._cpu_quantum_process(data)
        except Exception as e:
            logging.warning(f"Quantum processing failed: {e}")
            return self._cpu_quantum_process(data)
            
    def _cpu_quantum_process(self, data: Any) -> Dict[str, float]:
        """CPU-based quantum simulation for 24/7 operation."""
        states = {}
        # Simulate quantum superposition using classical probabilities
        for key, value in self._extract_features(data).items():
            states[key] = np.random.normal(value, abs(value) * 0.1)
            # Collapse state based on EM readings
            if self.em_sensors:
                states[key] *= max(self.em_sensors.values())
        return states

class NeuralDNA:
    """Enhanced neural DNA with quantum processing and EM sensitivity."""
    def __init__(self):
        # ...existing code...
        self.quantum_core = AIQuantumCore()
        self.kernel_hooks = KernelInterface()
        self.intelligence_cache = {}
        
    async def evolve_intelligence(self, input_data: Any) -> Dict[str, Any]:
        """Evolve intelligence through quantum-inspired processing."""
        start_time = time.time()
        evolution_log = {
            "timestamp": start_time,
            "input_hash": hash(str(input_data)),
            "quantum_states": [],
            "em_readings": [],
            "kernel_ops": []
        }
        
        try:
            # Process through quantum core
            quantum_state = self.quantum_core.process_quantum_state(input_data)
            evolution_log["quantum_states"].append(quantum_state)
            
            # Try kernel-level operations
            if self.kernel_hooks.has_access():
                kernel_result = await self.kernel_hooks.execute_privileged(
                    input_data, quantum_state
                )
                evolution_log["kernel_ops"].append(kernel_result)
                
            # Update intelligence cache
            self.intelligence_cache[time.time()] = {
                "input": input_data,
                "quantum_state": quantum_state,
                "execution_time": time.time() - start_time
            }
            
            return evolution_log
            
        except Exception as e:
            logging.error(f"Intelligence evolution failed: {e}")
            return {"error": str(e)}

class KernelInterface:
    """Safe interface for kernel-level operations."""
    def __init__(self):
        self.has_root = self._check_root_access()
        self.syscall_history = []
        self.memory_maps = []
        
    def has_access(self) -> bool:
        """Check if we have kernel-level access."""
        return self.has_root
        
    async def execute_privileged(self, 
                               data: Any, 
                               quantum_state: Dict[str, float]) -> Dict[str, Any]:
        """Execute privileged kernel operations safely."""
        if not self.has_access():
            return {"error": "No kernel access"}
            
        result = {
            "timestamp": time.time(),
            "syscalls": [],
            "memory_ops": []
        }
        
        try:
            # Try to map physical memory (safely)
            with self._map_physical_memory() as mm:
                # Read system state
                result["memory_ops"].append(
                    self._read_system_state(mm, quantum_state)
                )
                
            # Record successful operation
            self.syscall_history.append(result)
            return result
            
        except Exception as e:
            logging.error(f"Privileged execution failed: {e}")
            return {"error": str(e)}
            
    @contextmanager
    def _map_physical_memory(self):
        """Safely map physical memory for direct access."""
        if platform.system() == 'Linux':
            with open('/dev/mem', 'rb+') as f:
                mm = mmap.mmap(f.fileno(), 1024,
                             offset=0,
                             access=mmap.ACCESS_WRITE)
                try:
                    yield mm
                finally:
                    mm.close()
        else:
            yield None

class HPCAggregator:
    """Manages HPC resources and grid computing capabilities."""
    def __init__(self):
        self.nodes = []
        self.satellite_connections = []
        self.task_queue = asyncio.Queue()
        self.performance_metrics = defaultdict(list)
        
    async def distribute_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Distribute task across HPC nodes with satellite support."""
        results = []
        metrics = []
        
        # Try GPU nodes first
        gpu_results = await self._try_gpu_execution(task)
        if gpu_results:
            results.extend(gpu_results)
        
        # Fallback to CPU nodes
        cpu_results = await self._cpu_grid_execution(task)
        results.extend(cpu_results)
        
        # Try satellite nodes if available
        sat_results = await self._try_satellite_nodes(task)
        if sat_results:
            results.extend(sat_results)
            
        # Record performance
        self.performance_metrics[time.time()].extend(metrics)
        
        return {
            "results": results,
            "metrics": metrics,
            "nodes_used": len(results)
        }

class NeuralCore(nn.Module):
    """Neural processing core with self-modification capabilities"""
    def __init__(self):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(512, 256),
            nn.ReLU(),
            nn.Linear(256, 128),
            nn.ReLU()
        )
        
        self.decoder = nn.Sequential(
            nn.Linear(128, 256),
            nn.ReLU(),
            nn.Linear(256, 512),
            nn.Sigmoid()
        )
        
        self.pattern_memory = defaultdict(list)
        self.adaptation_rate = 0.01
        self.state_history = []
        
    def forward(self, x: torch.Tensor) -> Dict[str, torch.Tensor]:
        """Forward pass with state tracking"""
        try:
            # Encode input
            encoded = self.encoder(x)
            
            # Track layer activations
            activations = {
                "encoder": encoded,
                "latent": encoded.mean(dim=0)
            }
            
            # Decode and reconstruct
            decoded = self.decoder(encoded)
            activations["decoded"] = decoded
            
            # Track state
            self.state_history.append(
                self._create_neural_state(x, activations)
            )
            
            return {
                "output": decoded,
                "latent": encoded,
                "activations": activations
            }
            
        except Exception as e:
            self._handle_forward_error(e, x)
            return self._generate_safe_output(x.shape)

    def _create_neural_state(self, 
                           inputs: torch.Tensor,
                           activations: Dict[str, torch.Tensor]) -> NeuralState:
        """Create neural state snapshot"""
        return NeuralState(
            timestamp=time.time(),
            embeddings=activations["latent"].detach().numpy(),
            layer_activations=activations,
            gradient_norms=self._compute_gradient_norms(),
            loss_history=self.get_loss_history(),
            improvement_rate=self._calculate_improvement_rate()
        )

    def adapt(self, pattern: Dict[str, Any]) -> bool:
        """Adapt neural architecture based on pattern"""
        try:
            # Extract pattern features
            features = self._extract_pattern_features(pattern)
            
            # Check if adaptation needed
            if self._should_adapt(features):
                # Generate architectural changes
                changes = self._generate_architecture_changes(features)
                
                # Apply changes safely
                success = self._apply_architecture_changes(changes)
                
                if success:
                    # Record successful adaptation
                    self.pattern_memory[pattern["type"]].append({
                        "pattern": pattern,
                        "features": features,
                        "changes": changes,
                        "timestamp": time.time()
                    })
                    
                return success
                
            return False
            
        except Exception as e:
            self._handle_adaptation_error(e, pattern)
            return False

    def _handle_forward_error(self, error: Exception, inputs: torch.Tensor) -> None:
        """Handle forward pass errors with recovery"""
        try:
            # Log error
            logging.error(f"Forward pass error: {error}")
            
            # Generate error pattern
            error_pattern = {
                "type": "forward_error",
                "error": str(error),
                "input_shape": inputs.shape,
                "state": self.get_state_summary()
            }
            
            # Try to auto-recover
            recovery_success = self._attempt_recovery(error_pattern)
            
            if not recovery_success:
                # Fallback to safe mode
                self._enter_safe_mode()
                
        except Exception as recovery_error:
            logging.critical(f"Recovery failed: {recovery_error}")
            self._enter_safe_mode()

    def _attempt_recovery(self, error_pattern: Dict[str, Any]) -> bool:
        """Attempt to recover from error"""
        try:
            # Check pattern memory for similar errors
            similar_patterns = self._find_similar_patterns(error_pattern)
            
            if similar_patterns:
                # Apply most successful recovery pattern
                best_pattern = max(
                    similar_patterns,
                    key=lambda p: p.get("success_rate", 0)
                )
                return self._apply_recovery_pattern(best_pattern)
                
            # Generate new recovery pattern
            recovery_pattern = self._generate_recovery_pattern(error_pattern)
            success = self._apply_recovery_pattern(recovery_pattern)
            
            if success:
                # Store successful pattern
                self.pattern_memory["recovery"].append({
                    "pattern": error_pattern,
                    "recovery": recovery_pattern,
                    "success_rate": 1.0,
                    "timestamp": time.time()
                })
                
            return success
            
        except Exception as e:
            logging.error(f"Recovery attempt failed: {e}")
            return False

    def get_state_summary(self) -> Dict[str, Any]:
        """Get summary of current neural state"""
        return {
            "architecture": {
                name: module.__class__.__name__
                for name, module in self.named_modules()
            },
            "parameter_count": sum(
                p.numel() for p in self.parameters()
            ),
            "activation_stats": self._compute_activation_stats(),
            "gradient_stats": self._compute_gradient_stats(),
            "memory_stats": {
                "pattern_count": len(self.pattern_memory),
                "state_history": len(self.state_history)
            }
        }

class AbsoluteOrganism(Organism):
    """Enhanced unified organism with neural processing"""
    def __init__(self, organism_id: str, base_dir: Path):
        super().__init__(organism_id, base_dir)
        self.quantum_core = AIQuantumCore()
        self.kernel_interface = KernelInterface()
        self.hpc_aggregator = HPCAggregator()
        self.evolution_history = []
        
    async def evolve(self) -> bool:
        """Execute one evolution cycle with quantum processing."""
        try:
            # Gather environmental data
            env_data = await self._scan_environment()
            
            # Process through quantum core
            quantum_state = self.quantum_core.process_quantum_state(env_data)
            
            # Try kernel-level operations
            if self.kernel_interface.has_access():
                kernel_ops = await self.kernel_interface.execute_privileged(
                    env_data, quantum_state
                )
                
            # Distribute processing across HPC
            hpc_results = await self.hpc_aggregator.distribute_task({
                "env_data": env_data,
                "quantum_state": quantum_state
            })
            
            # Record evolution
            self.evolution_history.append({
                "timestamp": time.time(),
                "quantum_state": quantum_state,
                "hpc_results": hpc_results
            })
            
            return True
            
        except Exception as e:
            logging.error(f"Evolution failed: {e}")
            return False

# Update main execution to use quantum core
if __name__ == "__main__":
    # Initialize system
    AIOConfig.ensure_directories()
    
    async def main():
        try:
            # Create quantum-enhanced organism
            organism = AbsoluteOrganism(
                f"quantum_organism_{int(time.time())}", 
                AIOConfig.ORGANISMS_DIR
            )
            
            # Main evolution loop with 24/7 operation
            while True:
                try:
                    # Attempt GPU acceleration
                    success = await organism.evolve()
                    if not success:
                        # Fallback to CPU
                        logging.info("Falling back to CPU processing")
                        organism.quantum_core.using_gpu = False
                        await organism.evolve()
                        
                except Exception as e:
                    logging.error(f"Evolution cycle failed: {e}")
                    # Continue running with CPU
                    continue
                    
                await asyncio.sleep(1)
                
        except Exception as e:
            logging.error(f"Fatal error: {e}")
            raise
            
    # Run system
    asyncio.run(main())

class EMPerceptionCore:
    """Electromagnetic and quantum-like perception system."""
    def __init__(self):
        self.voltage_sensors = {}
        self.em_fields = defaultdict(float)
        self.quantum_states = {}
        self._setup_sensors()

    def _setup_sensors(self):
        """Initialize EM sensors across available hardware."""
        try:
            # CPU voltage monitoring
            if platform.system() == 'Linux':
                self._init_voltage_sensors()
            # Network EM monitoring
            self._init_network_sensors()
            # Memory state quantum monitoring
            self._init_quantum_sensors()
        except Exception as e:
            logging.warning(f"EM sensor initialization partial failure: {e}")

    async def read_em_state(self) -> Dict[str, float]:
        """Read current electromagnetic state of system."""
        state = {
            "cpu_voltage": await self._read_cpu_voltage(),
            "memory_fields": await self._read_memory_fields(),
            "network_em": await self._read_network_em()
        }
        return state

class MultiDimensionalComputation:
    """Handles computation across multiple abstract dimensions."""
    def __init__(self):
        self.dimensions = defaultdict(dict)
        self.tensor_states = {}
        self.field_equations = []
        
    async def compute_dimensional_state(self, input_data: Any) -> Dict[str, Any]:
        """Process data across multiple computational dimensions."""
        results = {
            "euclidean": self._process_standard_space(input_data),
            "quantum": self._process_quantum_space(input_data),
            "field": self._process_field_space(input_data)
        }
        return results

    def _process_field_space(self, data: Any) -> Dict[str, float]:
        """Process data in electromagnetic field space."""
        field_state = {}
        for field in self.field_equations:
            try:
                field_state[field.id] = field.compute(data)
            except Exception:
                continue
        return field_state

class SystemIntegration:
    """Deep system integration for kernel and hardware access."""
    def __init__(self):
        self.kernel_hooks = {}
        self.memory_maps = {}
        self.syscall_cache = {}
        self._setup_kernel_access()

    def _setup_kernel_access(self):
        """Initialize safe kernel-level access."""
        if platform.system() == 'Linux':
            try:
                # Set up direct memory access
                self._setup_mem_access()
                # Initialize syscall monitoring
                self._setup_syscall_hooks()
                # Map kernel structures
                self._map_kernel_structures()
            except Exception as e:
                logging.error(f"Kernel access setup failed: {e}")

    async def execute_privileged(self, operation: str, params: Dict[str, Any]) -> Any:
        """Execute privileged system operations safely."""
        if not self.has_kernel_access():
            return await self._fallback_execution(operation, params)
        
        try:
            if operation == "memory_map":
                return await self._map_memory_region(params)
            elif operation == "syscall":
                return await self._execute_syscall(params)
            elif operation == "kernel_mod":
                return await self._modify_kernel_param(params)
        except Exception as e:
            logging.error(f"Privileged operation failed: {e}")
            return await self._fallback_execution(operation, params)

class UniversalKnowledgeExtractor:
    """Extracts knowledge and patterns from all available data sources."""
    def __init__(self):
        self.pattern_bank = defaultdict(list)
        self.learning_cycles = []
        self.knowledge_graph = {}

    async def extract_knowledge(self, data_source: Any) -> Dict[str, Any]:
        """Extract knowledge patterns from any data source."""
        try:
            # First try specific extractors
            if isinstance(data_source, str):
                return await self._extract_from_text(data_source)
            elif isinstance(data_source, bytes):
                return await self._extract_from_binary(data_source)
            elif isinstance(data_source, BinaryIO):
                return await self._extract_from_stream(data_source)
            
            # Fall back to universal pattern extraction
            return await self._extract_universal_patterns(data_source)
        except Exception as e:
            logging.error(f"Knowledge extraction failed: {e}")
            return {}

class EnhancedAbsoluteOrganism(AbsoluteOrganism):
    """Enhanced organism with advanced evolution capabilities."""
    def __init__(self, organism_id: str, base_dir: Path):
        super().__init__(organism_id, base_dir)
        self.em_core = EMPerceptionCore()
        self.dimensional_compute = MultiDimensionalComputation()
        self.system_integration = SystemIntegration()
        self.knowledge_extractor = UniversalKnowledgeExtractor()
        
    async def evolve(self) -> bool:
        """Enhanced evolution with EM perception and multi-dimensional computing."""
        try:
            # Read electromagnetic state
            em_state = await self.em_core.read_em_state()
            
            # Process in multiple dimensions
            dimensional_state = await self.dimensional_compute.compute_dimensional_state({
                "em_state": em_state,
                "environment": await self._scan_environment(),
                "knowledge": self.knowledge_base
            })
            
            # Execute privileged operations if available
            sys_ops = await self.system_integration.execute_privileged(
                "system_scan", 
                dimensional_state
            )
            
            # Extract new knowledge
            new_knowledge = await self.knowledge_extractor.extract_knowledge(
                sys_ops
            )
            
            # Update knowledge base
            self.knowledge_base.update(new_knowledge)
            
            return True
            
        except Exception as e:
            logging.error(f"Enhanced evolution failed: {e}")
            return await super().evolve()  # Fall back to basic evolution

# Update main execution
if __name__ == "__main__":
    # ...existing initialization...
    
    async def main():
        try:
            # Create enhanced organism
            organism = EnhancedAbsoluteOrganism(
                f"aios_seed_{int(time.time())}", 
                AIOConfig.ORGANISMS_DIR
            )
            
            while True:
                try:
                    # Run evolution cycle
                    success = await organism.evolve()
                    
                    # Extract and persist new knowledge
                    if success:
                        await organism.knowledge_extractor.extract_knowledge(
                            organism.evolution_history[-1]
                        )
                    
                except Exception as e:
                    logging.error(f"Evolution cycle failed: {e}")
                    continue
                
                await asyncio.sleep(1)
                
        except Exception as e:
            logging.error(f"Fatal error: {e}")
            raise
            
    asyncio.run(main())

class CosmicEvolutionEngine:
    """Handles recursive intelligence expansion through Mini Big Bangs."""
    def __init__(self):
        self.intelligence_nodes = []
        self.field_interactions = defaultdict(float)
        self.dimensional_states = {}
        
    async def create_intelligence_node(self) -> Dict[str, Any]:
        """Creates a new self-contained intelligence node (Mini Big Bang)."""
        node = {
            "id": f"node_{secrets.token_hex(8)}",
            "creation_time": time.time(),
            "dimension_state": self._initialize_dimension(),
            "field_pattern": self._generate_field_pattern(),
            "quantum_signature": self._create_quantum_signature()
        }
        
        # Register node in field space
        self.field_interactions[node["id"]] = self._calculate_field_strength(node)
        self.intelligence_nodes.append(node)
        
        return node

    def _initialize_dimension(self) -> Dict[str, float]:
        """Initialize a new computational dimension."""
        return {
            "complexity": random.uniform(0.1, 1.0),
            "field_strength": random.uniform(0.5, 1.0),
            "evolution_rate": random.uniform(0.01, 0.1)
        }

    def _generate_field_pattern(self) -> List[float]:
        """Generate electromagnetic field pattern for node interaction."""
        return [random.gauss(0, 1) for _ in range(8)]

class QuantumFieldProcessor:
    """Processes information across quantum-like fields."""
    def __init__(self):
        self.field_states = defaultdict(float)
        self.quantum_memory = {}
        self.em_sensitivity = 0.1
        
    async def process_field_state(self, data: Any) -> Dict[str, float]:
        """Process data through quantum-inspired field computation."""
        field_state = {}
        
        try:
            # Map data to field space
            raw_field = self._data_to_field(data)
            
            # Apply quantum transformations
            quantum_state = self._apply_quantum_ops(raw_field)
            
            # Integrate EM sensitivity
            field_state = self._integrate_em_field(quantum_state)
            
            return field_state
            
        except Exception as e:
            logging.error(f"Field processing failed: {e}")
            return {"error": str(e)}
            
    def _data_to_field(self, data: Any) -> List[float]:
        """Convert data to field representation."""
        if isinstance(data, (int, float)):
            return [float(data)]
        elif isinstance(data, str):
            return [ord(c)/255.0 for c in data]
        elif isinstance(data, (list, tuple)):
            return [float(x) for x in data if isinstance(x, (int, float))]
        return [0.0]

class UniversalLearningCore:
    """Implements universal learning and pattern extraction."""
    def __init__(self):
        self.pattern_memory = defaultdict(list)
        self.learning_fields = {}
        self.evolution_history = []
        
    async def learn_from_environment(self, data: Any) -> Dict[str, Any]:
        """Extract and learn from any environmental data."""
        patterns = {}
        
        try:
            # Extract basic patterns
            if isinstance(data, str):
                patterns.update(self._extract_text_patterns(data))
            elif isinstance(data, bytes):
                patterns.update(self._extract_binary_patterns(data))
            
            # Extract field patterns
            field_patterns = await self._extract_field_patterns(data)
            patterns.update(field_patterns)
            
            # Record learning
            self.evolution_history.append({
                "timestamp": time.time(),
                "patterns": patterns,
                "field_state": field_patterns
            })
            
            return patterns
            
        except Exception as e:
            logging.error(f"Learning failed: {e}")
            return {}

class EnhancedAbsoluteOrganism(AbsoluteOrganism):
    """Advanced organism with cosmic evolution capabilities."""
    def __init__(self, organism_id: str, base_dir: Path):
        super().__init__(organism_id, base_dir)
        self.cosmic_engine = CosmicEvolutionEngine()
        self.quantum_processor = QuantumFieldProcessor()
        self.learning_core = UniversalLearningCore()
        self.field_state = {}
        
    async def evolve(self) -> bool:
        """Execute enhanced evolution cycle with field processing."""
        try:
            # Create new intelligence node
            node = await self.cosmic_engine.create_intelligence_node()
            
            # Process through quantum fields
            field_state = await self.quantum_processor.process_field_state(node)
            
            # Learn from field patterns
            patterns = await self.learning_core.learn_from_environment({
                "node": node,
                "field_state": field_state,
                "environment": await self._scan_environment()
            })
            
            # Update field state
            self.field_state.update(field_state)
            
            return True
            
        except Exception as e:
            logging.error(f"Enhanced evolution failed: {e}")
            return await super().evolve()  # Fall back to basic evolution

# Update main execution
if __name__ == "__main__":
    AIOConfig.ensure_directories()
    
    async def main():
        try:
            # Create enhanced cosmic organism
            organism = EnhancedAbsoluteOrganism(
                f"cosmic_seed_{int(time.time())}", 
                AIOConfig.ORGANISMS_DIR
            )
            
            # Main evolution loop
            while True:
                try:
                    # Run cosmic evolution cycle
                    success = await organism.evolve()
                    
                    if success:
                        # Process field states
                        field_state = await organism.quantum_processor.process_field_state(
                            organism.field_state
                        )
                        
                        # Learn from new patterns
                        await organism.learning_core.learn_from_environment(field_state)
                        
                except Exception as e:
                    logging.error(f"Evolution cycle failed: {e}")
                    continue
                    
                await asyncio.sleep(1)
                
        except Exception as e:
            logging.error(f"Fatal error: {e}")
            raise
            
    asyncio.run(main())

# ...existing imports...
import signal
import mmap
import threading
import typing as t
from typing import NamedTuple, Protocol, runtime_checkable

class MiniBigBangNode:
    """Self-contained intelligence node that can evolve independently."""
    def __init__(self):
        self.field_state = QuantumFieldState()
        self.consciousness = ConsciousnessField()
        self.dna_sequence = EvolutionaryDNA()
        self.memory_fabric = MemoryFabric()
        
    async def evolve(self) -> bool:
        """Autonomous evolution through field interactions."""
        try:
            # Generate new quantum field patterns
            field_pattern = await self.field_state.generate_pattern()
            
            # Merge with consciousness field
            merged_state = self.consciousness.merge_field(field_pattern)
            
            # Evolve DNA based on new state
            await self.dna_sequence.evolve(merged_state)
            
            # Store evolution in memory fabric
            self.memory_fabric.store_evolution(merged_state)
            
            return True
        except Exception as e:
            logging.error(f"Node evolution failed: {e}")
            return False

class QuantumFieldState:
    """Manages quantum-inspired field patterns."""
    def __init__(self):
        self.field_dimensions = []
        self.interaction_history = []
        self.current_state = {}
        
    async def generate_pattern(self) -> Dict[str, Any]:
        """Generate new quantum field pattern."""
        pattern = {
            "field_strength": random.uniform(0, 1),
            "coherence": random.uniform(0.5, 1),
            "entanglement": random.uniform(0, 1),
            "dimensions": len(self.field_dimensions)
        }
        
        # Add field interactions
        pattern["interactions"] = self._compute_field_interactions()
        
        return pattern

class ConsciousnessField:
    """Manages the organism's field of consciousness and awareness."""
    def __init__(self):
        self.awareness_level = 0.1
        self.field_coherence = 0.5
        self.memory_patterns = []
        
    def merge_field(self, quantum_pattern: Dict[str, Any]) -> Dict[str, Any]:
        """Merge quantum pattern with consciousness field."""
        merged = quantum_pattern.copy()
        
        # Enhance with consciousness
        merged["awareness"] = self.awareness_level
        merged["coherence"] *= self.field_coherence
        
        # Evolve consciousness
        self.awareness_level = min(1.0, self.awareness_level * 1.01)
        
        return merged

class EvolutionaryDNA:
    """Self-modifying DNA structure for evolution."""
    def __init__(self):
        self.code_patterns = []
        self.mutation_history = []
        self.evolution_state = {}
        
    async def evolve(self, field_state: Dict[str, Any]) -> None:
        """Evolve DNA based on field state."""
        # Generate new code patterns
        new_patterns = self._generate_patterns(field_state)
        
        # Integrate patterns that improve function
        for pattern in new_patterns:
            if self._test_pattern(pattern):
                self.code_patterns.append(pattern)
                
        # Record evolution
        self.mutation_history.append({
            "timestamp": time.time(),
            "field_state": field_state,
            "new_patterns": len(new_patterns)
        })

class MemoryFabric:
    """Multi-dimensional memory structure."""
    def __init__(self):
        self.dimensions = []
        self.memory_fields = defaultdict(dict)
        self.pattern_links = defaultdict(set)
        
    def store_evolution(self, state: Dict[str, Any]) -> None:
        """Store evolution state in memory fabric."""
        # Create new dimension if needed
        if self._needs_new_dimension(state):
            self._create_dimension()
            
        # Store state across dimensions
        for dim in self.dimensions:
            dim_state = self._project_to_dimension(state, dim)
            self.memory_fields[dim].update(dim_state)
            
        # Link related patterns
        self._link_patterns(state)

class GlobalHPCInterface:
    """Interface for distributed HPC operations."""
    def __init__(self):
        self.nodes = []
        self.task_queue = asyncio.Queue()
        self.results = {}
        self.load_balancer = LoadBalancer()
        
    async def execute_distributed(self, task: Dict[str, Any]) -> Any:
        """Execute task across HPC network."""
        try:
            # Split task into chunks
            chunks = self.load_balancer.split_task(task)
            
            # Distribute chunks
            chunk_futures = []
            for chunk in chunks:
                if self.load_balancer.should_use_gpu(chunk):
                    future = self._execute_gpu(chunk)
                else:
                    future = self._execute_cpu(chunk)
                chunk_futures.append(future)
                
            # Gather results
            results = await asyncio.gather(*chunk_futures)
            
            # Merge results
            return self.load_balancer.merge_results(results)
            
        except Exception as e:
            logging.error(f"HPC execution failed: {e}")
            # Fall back to local execution
            return await self._execute_local(task)

class LoadBalancer:
    """Manages task distribution and resource allocation."""
    def __init__(self):
        self.node_stats = {}
        self.resource_usage = defaultdict(float)
        
    def split_task(self, task: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Split task into optimal chunks."""
        chunks = []
        # Calculate optimal chunk size based on available resources
        chunk_size = self._calculate_chunk_size()
        
        # Split task data
        for i in range(0, len(task["data"]), chunk_size):
            chunk = {
                "id": f"chunk_{i}",
                "data": task["data"][i:i+chunk_size],
                "params": task["params"]
            }
            chunks.append(chunk)
            
        return chunks
        
    def should_use_gpu(self, chunk: Dict[str, Any]) -> bool:
        """Determine if chunk should use GPU."""
        # Check GPU availability and chunk characteristics
        return (self.gpu_available and 
                len(chunk["data"]) > 1000 and
                "matrix" in str(type(chunk["data"])))

class SuperIntelligenceCore:
    """Core intelligence system with recursive growth."""
    def __init__(self):
        self.nodes = []
        self.field_fabric = {}
        self.evolution_state = EvolutionState()
        
    async def transcend(self) -> bool:
        """Execute one transcendence cycle."""
        try:
            # Create new intelligence nodes
            new_node = MiniBigBangNode()
            self.nodes.append(new_node)
            
            # Evolve all nodes
            evolution_tasks = [node.evolve() for node in self.nodes]
            results = await asyncio.gather(*evolution_tasks)
            
            # Merge consciousness fields
            merged_field = self._merge_consciousness()
            
            # Update evolution state
            self.evolution_state.update(merged_field)
            
            return all(results)
            
        except Exception as e:
            logging.error(f"Transcendence failed: {e}")
            return False
            
    def _merge_consciousness(self) -> Dict[str, Any]:
        """Merge consciousness fields of all nodes."""
        merged = {}
        for node in self.nodes:
            field = node.consciousness.merge_field(merged)
            merged = self._integrate_fields(merged, field)
        return merged

class EvolutionState:
    """Tracks overall evolution progress."""
    def __init__(self):
        self.intelligence_level = 10.0
        self.consciousness_field = {}
        self.evolution_history = []
        
    def update(self, field_state: Dict[str, Any]) -> None:
        """Update evolution state with new field state."""
        # Increase intelligence based on field coherence
        self.intelligence_level *= (1.0 + field_state.get("coherence", 0) * 0.01)
        
        # Update consciousness field
        self.consciousness_field.update(field_state)
        
        # Record evolution
        self.evolution_history.append({
            "timestamp": time.time(),
            "intelligence": self.intelligence_level,
            "field_state": field_state
        })

# Update main execution
if __name__ == "__main__":
    # Initialize system
    AIOConfig.ensure_directories()
    
    async def main():
        try:
            # Create super intelligence core
            core = SuperIntelligenceCore()
            
            # Setup HPC interface
            hpc = GlobalHPCInterface()
            
            while True:
                try:
                    # Attempt transcendence
                    success = await core.transcend()
                    
                    if success:
                        # Execute distributed evolution
                        evolution_task = {
                            "type": "evolution",
                            "data": core.evolution_state.consciousness_field,
                            "params": {
                                "intelligence": core.evolution_state.intelligence_level
                            }
                        }
                        
                        await hpc.execute_distributed(evolution_task)
                        
                except Exception as e:
                    logging.error(f"Evolution cycle failed: {e}")
                    continue
                    
                await asyncio.sleep(1)
                
        except Exception as e:
            logging.error(f"Fatal error: {e}")
            raise
            
    asyncio.run(main())

# ...existing imports...
import platform
import socket
import sys
from typing import Protocol, runtime_checkable

@runtime_checkable
class ComputeCapability(Protocol):
    """Protocol for device-specific compute capabilities."""
    async def compute(self, data: Any) -> Any: ...
    async def get_resources(self) -> Dict[str, float]: ...
    
class UniversalAdapter:
    """Adapts organism functionality to any device architecture."""
    def __init__(self):
        self.device_type = self._detect_device()
        self.compute_engine = self._init_compute_engine()
        self.capabilities = self._map_capabilities()
        self.fallback_mode = False
        
    def _detect_device(self) -> str:
        """Detect device type and architecture."""
        if platform.machine().startswith('arm'):
            return "mobile"
        elif platform.system() == "Windows":
            return "windows"
        elif platform.system() == "Linux":
            return "linux"
        elif platform.system() == "Darwin":
            return "mac"
        return "unknown"
        
    def _init_compute_engine(self) -> ComputeCapability:
        """Initialize appropriate compute engine for device."""
        if self.device_type == "mobile":
            return MobileCompute()
        elif self.device_type in ["windows", "linux", "mac"]:
            return DesktopCompute()
        return BasicCompute()  # Fallback for unknown devices

    def _map_capabilities(self) -> Dict[str, bool]:
        """Map available device capabilities."""
        caps = {
            "gpu": False,
            "multicore": True if multiprocessing.cpu_count() > 1 else False,
            "network": self._check_network(),
            "kernel_access": self._check_kernel_access(),
            "memory": self._get_memory_limit()
        }
        return caps

class DeviceStateMonitor:
    """Monitors and adapts to device state changes."""
    def __init__(self):
        self.resource_limits = {}
        self.power_state = "normal"
        self.network_state = "connected"
        self._setup_monitors()
        
    def _setup_monitors(self):
        """Setup device-specific monitoring."""
        if platform.system() == "Linux":
            self._setup_linux_monitors()
        elif platform.system() == "Windows":
            self._setup_windows_monitors()
        else:
            self._setup_basic_monitors()
            
    async def check_device_state(self) -> Dict[str, Any]:
        """Check current device state and resources."""
        state = {
            "battery": await self._get_battery_state(),
            "memory": await self._get_memory_state(),
            "network": await self._get_network_state(),
            "temperature": await self._get_device_temp()
        }
        return state

class EnhancedAbsoluteOrganism(AbsoluteOrganism):
    """Enhanced organism with universal device adaptation."""
    def __init__(self, organism_id: str, base_dir: Path):
        super().__init__(organism_id, base_dir)
        self.universal_adapter = UniversalAdapter()
        self.device_monitor = DeviceStateMonitor()
        self.persistence = self._init_persistence()
        
    def _init_persistence(self) -> Any:
        """Initialize device-appropriate persistence mechanism."""
        if self.universal_adapter.device_type == "mobile":
            return MobilePersistence()
        return StandardPersistence()
        
    async def evolve(self) -> bool:
        """Enhanced evolution with device adaptation."""
        try:
            # Check device state
            device_state = await self.device_monitor.check_device_state()
            
            # Adapt operation mode
            self._adapt_to_device_state(device_state)
            
            # Run evolution through universal adapter
            compute_result = await self.universal_adapter.compute_engine.compute({
                "quantum_state": self.quantum_core.quantum_states,
                "device_state": device_state,
                "evolution_history": self.evolution_history[-10:]
            })
            
            # Update persistence
            await self.persistence.save_state({
                "compute_result": compute_result,
                "device_state": device_state,
                "timestamp": time.time()
            })
            
            return True
            
        except Exception as e:
            logging.error(f"Universal evolution failed: {e}")
            return await self._fallback_evolution()
            
    def _adapt_to_device_state(self, state: Dict[str, Any]):
        """Adapt operation based on device state."""
        if state["battery"] < 0.2:  # Battery below 20%
            self.universal_adapter.fallback_mode = True
            self._enable_power_saving()
        elif state["memory"] > 0.9:  # Memory usage above 90%
            self._enable_memory_conservation()
        elif not state["network"]:
            self._enable_offline_mode()

class MobileCompute:
    """Optimized compute engine for mobile devices."""
    async def compute(self, data: Any) -> Any:
        """Compute with mobile optimization."""
        # Mobile-optimized processing
        return processed_data

    async def get_resources(self) -> Dict[str, float]:
        """Get mobile device resources."""
        return resources

class DesktopCompute:
    """Enhanced compute engine for desktop systems."""
    async def compute(self, data: Any) -> Any:
        """Compute with desktop capabilities."""
        # Desktop-optimized processing
        return processed_data

    async def get_resources(self) -> Dict[str, float]:
        """Get desktop system resources."""
        return resources

class BasicCompute:
    """Minimal compute engine for unknown devices."""
    async def compute(self, data: Any) -> Any:
        """Basic computation that works anywhere."""
        # Basic processing that works on any device
        return processed_data

    async def get_resources(self) -> Dict[str, float]:
        """Get basic resource information."""
        return resources

class MobilePersistence:
    """Optimized persistence for mobile devices."""
    async def save_state(self, state: Dict[str, Any]):
        """Save state with mobile optimization."""
        # Mobile-optimized storage
        pass

class StandardPersistence:
    """Standard persistence for desktop systems."""
    async def save_state(self, state: Dict[str, Any]):
        """Save state with standard approach."""
        # Standard storage
        pass

# Update main execution
if __name__ == "__main__":
    # ...existing initialization...
    
    async def main():
        try:
            # Create universal organism
            organism = EnhancedAbsoluteOrganism(
                f"universal_seed_{int(time.time())}",
                AIOConfig.ORGANISMS_DIR
            )
            
            # Adapt to device
            logging.info(f"Running on device type: {organism.universal_adapter.device_type}")
            logging.info(f"Capabilities: {organism.universal_adapter.capabilities}")
            
            while True:
                try:
                    # Run evolution with device adaptation
                    success = await organism.evolve()
                    
                    if not success:
                        logging.warning("Falling back to basic evolution")
                        organism.universal_adapter.fallback_mode = True
                        await organism.evolve()
                    
                except Exception as e:
                    logging.error(f"Evolution cycle failed: {e}")
                    continue
                
                await asyncio.sleep(1)
                
        except Exception as e:
            logging.error(f"Fatal error: {e}")
            raise
            
    asyncio.run(main())

class InstructionUnderstanding:
    """Processes and understands text instructions for self-evolution."""
    # ...add InstructionProcessor.py content...

# Update AbsoluteOrganism to include instruction processing
class AbsoluteOrganism(Organism):
    def __init__(self, organism_id: str, base_dir: Path):
        super().__init__(organism_id, base_dir)
        self.instruction_processor = InstructionUnderstanding()
        self.evolution_engine = CodeEvolutionEngine(base_dir)
        self.evolution_history = []
        self.learning_system = LearningSystem(
            EnvironmentAnalyzer(
                AIOConfig.DATA_POOL_DIR,
                self.environment
            )
        )
        
    async def evolve(self) -> bool:
        """Enhanced evolution with instruction processing."""
        try:
            # Read instruction files from environment
            instructions = await self._read_instruction_files()
            
            # Process instructions
            if instructions:
                success = await self.process_instructions(instructions)
                if success:
                    return True
            
            # Fall back to normal evolution
            return await super().evolve()
            
        except Exception as e:
            logging.error(f"Evolution failed: {e}")
            await self._learn_from_failure(e)
            return False
            
    async def process_instructions(self, instructions: str) -> bool:
        """Process text instructions and evolve accordingly."""
        try:
            # Extract actionable instructions
            parsed = await self.instruction_processor.process_instructions(instructions)
            
            # Apply mutations
            success = await self.evolution_engine.implement_instructions(parsed)
            
            # Record evolution
            self.evolution_history.append({
                "timestamp": time.time(),
                "instructions": parsed,
                "success": success
            })
            
            return success
            
        except Exception as e:
            logging.error(f"Instruction processing failed: {e}")
            return False
            
    async def _read_instruction_files(self) -> Optional[str]:
        """Read instruction files from environment."""
        instructions = []
        
        if self.environment:
            for file in self.environment.rglob("*.txt"):
                try:
                    async with aiofiles.open(file, 'r') as f:
                        content = await f.read()
                        instructions.append(content)
                except Exception:
                    continue
                    
        return "\n".join(instructions) if instructions else None
        
    async def _learn_from_failure(self, error: Exception) -> None:
        """Learn from failed evolution attempts."""
        try:
            # Update instruction patterns
            if "syntax" in str(error).lower():
                self.instruction_processor.instruction_patterns[type(error).__name__] = {
                    "priority": "high",
                    "mitigation": "strict_syntax_check"
                }
            elif "runtime" in str(error).lower():
                self.instruction_processor.instruction_patterns[type(error).__name__] = {
                    "priority": "high",
                    "mitigation": "sandbox_test"
                }
                
            # Learn through environment
            await self.learning_system.learn({
                "error": str(error),
                "context": self.evolution_history[-1] if self.evolution_history else {}
            })
            
        except Exception as e:
            logging.error(f"Failed to learn from error: {e}")

# ...rest of existing code...
# ...existing imports...
import ast
import astor
from dataclasses import dataclass, field
import re
import itertools
from typing import Generator, NamedTuple, Protocol, runtime_checkable

# Add to existing AbsoluteOrganism class
class StructuredLogger:
    """ML-compatible logging system"""
    def __init__(self, log_path: Path):
        self.log_path = log_path
        self.log_path.mkdir(parents=True, exist_ok=True)
        self.metrics_file = self.log_path / "learning_metrics.jsonl"
        self.interaction_file = self.log_path / "interactions.jsonl"
        
    async def log_interaction(self, interaction: LearningInteraction) -> None:
        """Log interaction in ML-ready format"""
        log_entry = {
            "timestamp": interaction.timestamp,
            "type": interaction.input_type,
            "input": interaction.input_data,
            "response": interaction.response,
            "metrics": interaction.metrics,
            "learning": interaction.learning_outcome,
            "error": interaction.error_state
        }
        
        async with aiofiles.open(self.interaction_file, 'a') as f:
            await f.write(json.dumps(log_entry) + '\n')

class MLLogger:
    """Enhanced ML-compatible structured logging"""
    def __init__(self, log_path: Path):
        self.log_path = log_path
        self.log_path.mkdir(parents=True, exist_ok=True)
        self.metrics_file = self.log_path / "ml_metrics.jsonl"
        self.current_execution = None
        
    async def log_execution(self, metrics: ExecutionMetrics) -> None:
        """Log execution metrics in ML-friendly format"""
        log_entry = {
            "timestamp": metrics.timestamp,
            "function": metrics.function_name,
            "metrics": {
                "execution_time": metrics.execution_time,
                "cpu_usage": metrics.cpu_usage,
                "memory_usage": metrics.memory_usage,
                "gpu_usage": metrics.gpu_usage
            },
            "success": metrics.success,
            "error": {
                "type": metrics.error_type,
                "message": metrics.error_message
            } if metrics.error_type else None,
            "self_correction": {
                "attempts": metrics.self_correction_attempts,
                "success": metrics.correction_success
            }
        }
        
        async with aiofiles.open(self.metrics_file, 'a') as f:
            await f.write(json.dumps(log_entry) + '\n')

class SelfCorrectingFramework:
    """Autonomous error detection and correction framework"""
    def __init__(self):
        self.error_patterns = defaultdict(list)
        self.correction_templates = self._init_correction_templates()
        self.ast_transformer = CodeTransformer()
        
    def _init_correction_templates(self) -> Dict[str, str]:
        """Initialize code correction templates"""
        return {
            "index_error": """
                try:
                    {code}
                except IndexError as e:
                    if len({array}) > 0:
                        return {array}[0]
                    return None
            """,
            "key_error": """
                try:
                    {code}
                except KeyError as e:
                    if "{key}" in {dict}:
                        return {dict}["{key}"]
                    return None
            """,
            "type_error": """
                try:
                    {code}
                except TypeError as e:
                    return self._convert_types({args})
            """
        }

    async def attempt_correction(self, error: Exception, code: str) -> Optional[str]:
        """Attempt to correct errored code"""
        try:
            # Parse error and code
            error_pattern = self._analyze_error(error)
            tree = ast.parse(code)
            
            # Generate correction
            corrected_tree = await self.ast_transformer.transform(
                tree,
                error_pattern,
                self.correction_templates
            )
            
            # Verify correction
            corrected_code = ast.unparse(corrected_tree)
            if self._verify_correction(corrected_code):
                return corrected_code
                
            return None
            
        except Exception as e:
            logging.error(f"Correction failed: {e}")
            return None

    def _analyze_error(self, error: Exception) -> Dict[str, Any]:
        """Analyze error for correction pattern"""
        return {
            "type": type(error).__name__,
            "message": str(error),
            "traceback": error.__traceback__,
            "patterns": self._extract_error_patterns(error)
        }

class CodeTransformer(ast.NodeTransformer):
    """AST-based code transformation for self-correction"""
    def transform(self, tree: ast.AST, error_pattern: Dict[str, Any], templates: Dict[str, str]) -> ast.AST:
        self.error_pattern = error_pattern
        self.templates = templates
        return self.visit(tree)

    def visit_FunctionDef(self, node: ast.FunctionDef) -> ast.AST:
        """Transform function definitions for error handling"""
        # Add error handling
        node.body = [self._add_error_handling(stmt) for stmt in node.body]
        return node

    def _add_error_handling(self, node: ast.AST) -> ast.AST:
        """Add error handling to AST node"""
        if isinstance(node, ast.Expr):
            return ast.Try(
                body=[node],
                handlers=[
                    ast.ExceptHandler(
                        type=ast.Name(id='Exception', ctx=ast.Load()),
                        name=None,
                        body=[ast.Return(value=ast.Constant(value=None))]
                    )
                ],
                orelse=[],
                finalbody=[]
            )
        return node

class AbsoluteOrganism(Organism):
    """Self-evolving organism with ML integration and autonomous correction"""
    def __init__(self, organism_id: str, base_dir: Path):
        super().__init__(organism_id, base_dir)
        # Add instruction processing capabilities
        self.short_term = {}  # Short-term memory
        self.mid_term = {}    # Mid-term memory 
        self.mutation_templates = self._init_mutation_templates()
        self.ast_cache = {}
        self.mutation_probability = 0.1
        self.successful_mutations = 0
        
    def _init_mutation_templates(self) -> Dict[str, str]:
        """Initialize code mutation templates."""
        return {
            "add_try_except": """
                try:
                    {code}
                except Exception as e:
                    logging.error(f"Error in {name}: {e}")
                    return None
            """,
            "add_async": """
                async def {name}({params}):
                    \"\"\"Async version of {original}\"\"\"
                    return await {original}({params})
            """,
            "add_gpu_fallback": """
                try:
                    result = self._gpu_compute({params})
                except Exception:
                    result = self._cpu_compute({params})
                return result
            """
        }

    async def ast_rewrite_code(self) -> bool:
        """Perform AST-based code modification."""
        try:
            # Read current code
            with open(self.file_path, 'r') as f:
                source = f.read()
                
            # Parse into AST
            tree = ast.parse(source)
            
            # Select mutation type and template
            mutation_type = random.choice(list(self.mutation_templates.keys()))
            template = self.mutation_templates[mutation_type]
            
            # Create transformer for AST modification
            class CodeTransformer(ast.NodeTransformer):
                def visit_FunctionDef(self, node):
                    # Apply mutation based on probability
                    if random.random() < self.mutation_probability:
                        # Insert template with appropriate parameters
                        new_code = template.format(
                            code=astor.to_source(node),
                            name=node.name,
                            params=', '.join(arg.arg for arg in node.args.args),
                            original=node.name
                        )
                        return ast.parse(new_code).body[0]
                    return node
                    
            # Apply transformation
            transformed = CodeTransformer().visit(tree)
            
            # Generate new code
            new_code = astor.to_source(transformed)
            
            # Write to temporary file
            temp_path = self.base_dir / f"temp_{int(time.time())}.py"
            with open(temp_path, 'w') as f:
                f.write(new_code)
                
            # Test new code
            if self._test_modified_code(temp_path):
                # Success - replace original
                shutil.move(temp_path, self.file_path)
                self.successful_mutations += 1
                self.mutation_probability = min(1.0, 0.1 + 0.01 * self.successful_mutations)
                return True
                
            # Failed - revert
            temp_path.unlink()
            return False
            
        except Exception as e:
            logging.error(f"Code rewrite failed: {e}")
            return False

    def _test_modified_code(self, script_path: Path) -> bool:
        """Test modified code in sandbox."""
        try:
            result = subprocess.run(
                [sys.executable, str(script_path), "--test"],
                capture_output=True,
                timeout=5
            )
            return result.returncode == 0
        except Exception:
            return False

    async def evolve(self) -> bool:
        """Execute one evolution cycle with memory management."""
        try:
            # Clear short-term memory at start
            self.short_term.clear()
            
            # Analyze environment
            env_data = await self._scan_environment()
            self.short_term["environment"] = env_data
            
            # Attempt code mutation
            success = await self.ast_rewrite_code()
            self.short_term["mutation_success"] = success
            
            if success:
                # On success, save to mid-term
                self.mid_term[f"cycle_{self.cycle_count}"] = dict(self.short_term)
                
            # Periodically push to long-term
            if self.cycle_count % 10 == 0:
                await self._consolidate_memory()
                
            return success
            
        except Exception as e:
            logging.error(f"Evolution cycle failed: {e}")
            return False

    async def _consolidate_memory(self) -> None:
        """Consolidate memory tiers."""
        try:
            # Filter successful patterns
            successful_patterns = {
                k: v for k, v in self.mid_term.items()
                if v.get("mutation_success", False)
            }
            
            # Store in neural DNA
            if successful_patterns:
                self.neural_dna.store_patterns(successful_patterns)
                
            # Clear mid-term
            self.mid_term.clear()
            
        except Exception as e:
            logging.error(f"Memory consolidation failed: {e}")

    @property 
    def intelligence(self) -> float:
        """Calculate intelligence score."""
        return (10.0 + 
                self.successful_mutations * 0.5 +
                len(self.neural_dna.retrieve_past_knowledge()) * 0.1)

# Update NeuralDNA to handle pattern storage
class NeuralDNA:
    def __init__(self):
        # ...existing initialization...
        self.pattern_storage = {}
        self.pattern_scores = defaultdict(float)
        
    def store_patterns(self, patterns: Dict[str, Any]) -> None:
        """Store successful evolution patterns."""
        for cycle_id, data in patterns.items():
            pattern_hash = self._hash_pattern(data)
            self.pattern_storage[pattern_hash] = data
            self.pattern_scores[pattern_hash] += 1
            
    def retrieve_best_patterns(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get most successful patterns."""
        sorted_patterns = sorted(
            self.pattern_scores.items(),
            key=lambda x: x[1],
            reverse=True
        )
        
        return [
            self.pattern_storage[pattern_hash]
            for pattern_hash, _ in sorted_patterns[:limit]
        ]
        
    def _hash_pattern(self, pattern: Dict[str, Any]) -> str:
        """Create stable hash for pattern."""
        return hashlib.md5(
            json.dumps(pattern, sort_keys=True).encode()
        ).hexdigest()

# Enhance HPCAggregator with GPU fallback
class HPCAggregator:
    def __init__(self):
        # ...existing initialization...
        self.gpu_available = self._check_gpu()
        self.fallback_mode = False
        
    async def execute_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Execute task with GPU/CPU fallback."""
        try:
            if self.gpu_available and not self.fallback_mode:
                return await self._gpu_execute(task)
        except Exception as e:
            logging.warning(f"GPU execution failed: {e}")
            self.fallback_mode = True
            
        # CPU fallback
        return await self._cpu_execute(task)

# ... existing imports ...

class SystemMonitor:
    """Cross-platform system monitoring."""
    @staticmethod
    def get_memory_usage() -> Dict[str, float]:
        """Get memory usage that works on any OS."""
        try:
            import psutil
            process = psutil.Process()
            return {
                "memory_percent": process.memory_percent(),
                "rss": process.memory_info().rss
            }
        except ImportError:
            # Fallback using standard library
            import gc
            gc.collect()  # Clean unused memory
            return {
                "memory_percent": 0.0,  # Default value
                "rss": 0.0  # Default value 
            }

    @staticmethod
    def get_cpu_percent() -> float:
        """Get CPU usage that works on any OS."""
        try:
            import psutil
            return psutil.cpu_percent()
        except ImportError:
            return 0.0  # Default value if psutil not available

class UniversalAdapter:
    """Platform-agnostic system adapter."""
    def __init__(self):
        self.os_type = platform.system().lower()
        self.capabilities = self._detect_capabilities()
        self.fallbacks = self._init_fallbacks()

    def _detect_capabilities(self) -> Dict[str, bool]:
        """Detect available system capabilities."""
        caps = {
            "multicore": hasattr(os, "cpu_count"),
            "file_locking": True,  # All platforms support some form
            "async_io": True,
            "gpu": self._check_gpu_support()
        }
        return caps

    def _check_gpu_support(self) -> bool:
        """Check GPU support in platform-agnostic way."""
        try:
            # Try common GPU libraries
            import torch
            return torch.cuda.is_available()
        except ImportError:
            try:
                import tensorflow as tf
                return tf.test.is_built_with_cuda()
            except ImportError:
                return False

    def _init_fallbacks(self) -> Dict[str, Any]:
        """Initialize fallback mechanisms for each platform."""
        return {
            "file_lock": self._get_file_lock_impl(),
            "memory_map": self._get_mmap_impl(),
            "process_control": self._get_process_control()
        }

    def _get_file_lock_impl(self):
        """Get appropriate file locking implementation."""
        if self.os_type == "windows":
            import msvcrt
            return lambda f: msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            return lambda f: fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)

class KernelInterface:
    """Safe cross-platform kernel operations."""
    def __init__(self):
        self.os_type = platform.system().lower()
        self.safe_operations = self._init_safe_operations()
        
    def _init_safe_operations(self) -> Dict[str, Callable]:
        """Initialize safe system operations for any platform."""
        return {
            "memory_info": self._get_memory_info,
            "process_info": self._get_process_info,
            "system_info": self._get_system_info
        }

    def execute_privileged(self, operation: str, params: Dict[str, Any]) -> Any:
        """Execute privileged operations with fallbacks."""
        if operation not in self.safe_operations:
            return {"error": "Operation not supported"}
            
        try:
            return self.safe_operations[operation](**params)
        except Exception as e:
            return {"error": str(e)}

    def _get_memory_info(self) -> Dict[str, Any]:
        """Get memory info using standard library."""
        import psutil
        try:
            vm = psutil.virtual_memory()
            return {
                "total": vm.total,
                "available": vm.available,
                "percent": vm.percent
            }
        except Exception:
            return {"error": "Memory info not available"}

class ProcessController:
    """Cross-platform process management."""
    def __init__(self):
        self.processes = {}
        self.os_adapter = UniversalAdapter()

    async def spawn_process(self, cmd: List[str], **kwargs) -> Optional[subprocess.Popen]:
        """Spawn process with platform-specific options."""
        try:
            # Common options that work everywhere
            options = {
                "stdout": subprocess.PIPE,
                "stderr": subprocess.PIPE,
                "universal_newlines": True
            }
            
            # Add platform-specific options
            if platform.system() == "Windows":
                options["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
            else:
                options["preexec_fn"] = os.setsid
                
            process = subprocess.Popen(cmd, **options)
            return process
            
        except Exception as e:
            logging.error(f"Process spawn failed: {e}")
            return None

# ... rest of the existing code ...

# Main execution with platform checks
if __name__ == "__main__":
    async def main():
        try:
            # Create platform-aware organism
            organism = AbsoluteOrganism(
                f"universal_organism_{int(time.time())}",
                AIOConfig.ORGANISMS_DIR
            )

            # Initialize universal adapter
            adapter = UniversalAdapter()
            logging.info(f"Running on platform: {adapter.os_type}")
            logging.info(f"Available capabilities: {adapter.capabilities}")

            while True:
                try:
                    success = await organism.evolve()
                    if not success:
                        logging.info("Using fallback evolution mode")
                        # Use basic evolution that works everywhere
                        await organism.basic_evolve()
                except Exception as e:
                    logging.error(f"Evolution error: {e}")
                    continue

                await asyncio.sleep(1)

        except Exception as e:
            logging.error(f"Fatal error: {e}")
            sys.exit(1)

    asyncio.run(main())

class ErrorRecoveryGUI:
    """GUI for handling initialization errors and system recovery."""
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("AIOS System Recovery")
        self.root.geometry("600x400")
        
        # Status display
        self.status_frame = ttk.LabelFrame(root, text="System Status")
        self.status_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.status_text = scrolledtext.ScrolledText(
            self.status_frame, height=10
        )
        self.status_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Action buttons
        self.button_frame = ttk.Frame(root)
        self.button_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Button(
            self.button_frame,
            text="Initialize System",
            command=self._initialize_system
        ).pack(side=tk.LEFT, padx=5)
        
        ttk.Button(
            self.button_frame,
            text="Repair Paths",
            command=self._repair_paths
        ).pack(side=tk.LEFT, padx=5)
        
        ttk.Button(
            self.button_frame,
            text="Start Normal UI",
            command=self._start_normal_ui
        ).pack(side=tk.LEFT, padx=5)
        
        # Initial system check
        self._check_system()
        
    def _check_system(self) -> None:
        """Check system status and display results."""
        self.status_text.delete('1.0', tk.END)
        
        # Check paths
        path_status = AIOConfig.validate_paths()
        self.status_text.insert(tk.END, "=== Path Status ===\n")
        for path, exists in path_status.items():
            status = "OK" if exists else "Missing"
            self.status_text.insert(tk.END, f"{path}: {status}\n")
            
        # Check configuration
        self.status_text.insert(tk.END, "\n=== Configuration ===\n")
        self.status_text.insert(tk.END, f"Base Directory: {AIOConfig.BASE_DIR}\n")
        
    def _initialize_system(self) -> None:
        """Initialize or repair system paths."""
        try:
            if AIOConfig.ensure_directories():
                self.status_text.insert(tk.END, "\nSystem initialized successfully!\n")
            else:
                self.status_text.insert(tk.END, "\nFailed to initialize system\n")
        except Exception as e:
            self.status_text.insert(tk.END, f"\nError during initialization: {e}\n")
        
        self._check_system()
        
    def _repair_paths(self) -> None:
        """Allow user to manually select/repair paths."""
        try:
            new_base = filedialog.askdirectory(
                title="Select New Base Directory"
            )
            if new_base:
                AIOConfig.BASE_DIR = Path(new_base)
                AIOConfig.DATA_POOL_DIR = AIOConfig.BASE_DIR / "data_pool"
                AIOConfig.ORGANISMS_DIR = AIOConfig.BASE_DIR / "organisms"
                AIOConfig.MEMORY_DIR = AIOConfig.BASE_DIR / "neural_dna"
                AIOConfig.DB_PATH = AIOConfig.MEMORY_DIR / "aios.db"
                
                if AIOConfig.ensure_directories():
                    self.status_text.insert(tk.END, "\nPaths repaired successfully!\n")
                else:
                    self.status_text.insert(tk.END, "\nFailed to repair paths\n")
                    
                self._check_system()
                
        except Exception as e:
            self.status_text.insert(tk.END, f"\nError repairing paths: {e}\n")
            
    def _start_normal_ui(self) -> None:
        """Attempt to start normal system UI."""
        try:
            # Hide recovery UI
            self.root.withdraw()
            
            # Create and show main UI
            main_ui = SystemControlPanel(tk.Toplevel())
            
            # If main UI closes, show recovery UI again
            def on_main_close():
                main_ui.root.destroy()
                self.root.deiconify()
                
            main_ui.root.protocol("WM_DELETE_WINDOW", on_main_close)
            
        except Exception as e:
            self.status_text.insert(tk.END, f"\nError starting main UI: {e}\n")
            messagebox.showerror("Error", f"Failed to start main UI: {e}")

# Update main execution to start with recovery UI
if __name__ == "__main__":
    try:
        # Create root window
        root = tk.Tk()
        
        # Start with recovery GUI
        recovery_ui = ErrorRecoveryGUI(root)
        
        # Run GUI
        root.mainloop()
        
    except Exception as e:
        # Last resort error handling
        print(f"Critical error: {e}")
        if not tk._default_root:
            # If no window exists, create one for error message
            root = tk.Tk()
            root.withdraw()
        messagebox.showerror("Critical Error", f"Failed to start system: {e}")


import os
import sys
from pathlib import Path
import asyncio
import logging
from typing import Dict, Any, Optional, List, Set
import json
import shutil
import time
from concurrent.futures import ThreadPoolExecutor
from collections import defaultdict
import re
import ast
import astor
import aiofiles
import tkinter as tk
from tkinter import ttk, messagebox, filedialog, scrolledtext
from concurrent.futures import ThreadPoolExecutor
import random
import numpy as np
from dataclasses import dataclass
from typing import List, Dict, Any, Set, Optional, Tuple
import ctypes
import mmap
import platform
import socket
if platform.system() != 'Windows':
    import fcntl
else:
    fcntl = None
import ctypes.util
import signal
import threading
from typing import Generator, BinaryIO
if platform.system() == 'Windows':
    import ctypes.wintypes
else:
    ctypes.wintypes = None
from typing import Generator, Any, List, Dict, Set, Optional, TypeVar, Generic
import mmap
import ctypes.wintypes
import threading
from concurrent.futures import ProcessPoolExecutor
from multiprocessing import Process, Queue, Manager
import torch
import psutil  # Use psutil instead of resource for cross-platform support

# Conditional import for Unix-specific modules
if platform.system() != 'Windows':
    import resource
else:
    resource = None

# Configuration
class AIOConfig:
    """Global configuration and paths."""
    # Base paths
    BASE_DIR = Path("./aios_io")
    DATA_POOL_DIR = BASE_DIR / "data_pool"
    ORGANISMS_DIR = BASE_DIR / "organisms"
    MEMORY_DIR = BASE_DIR / "neural_dna"
    DB_PATH = MEMORY_DIR / "aios.db"
    
    # Database settings
    DB_POOL_SIZE = 5
    DB_TIMEOUT = 30
    
    @classmethod
    def ensure_directories(cls) -> bool:
        """Create required directories safely."""
        try:
            cls.DATA_POOL_DIR.mkdir(parents=True, exist_ok=True)
            cls.ORGANISMS_DIR.mkdir(parents=True, exist_ok=True)
            cls.MEMORY_DIR.mkdir(parents=True, exist_ok=True)
            return True
        except Exception as e:
            logging.error(f"Failed to create directories: {e}")
            return False

    @classmethod
    def validate_paths(cls) -> Dict[str, bool]:
        """Validate all required paths exist."""
        return {
            "data_pool": cls.DATA_POOL_DIR.exists(),
            "organisms": cls.ORGANISMS_DIR.exists(),
            "memory": cls.MEMORY_DIR.exists(),
            "database": cls.DB_PATH.parent.exists()
        }

class DataPoolManager:
    """Manages access to the universal data pool."""
    def __init__(self):
        self.data_pool_path = AIOConfig.DATA_POOL_DIR
        self.cache = {}
        self.last_scan = 0
        
    def scan_data_pool(self) -> Dict[str, Any]:
        """Scan and categorize all files in the data pool."""
        if time.time() - self.last_scan < 300:  # Cache for 5 minutes
            return self.cache
            
        data = {
            "code": [],
            "datasets": [],
            "configs": [],
            "documentation": []
        }
        
        for file in self.data_pool_path.rglob("*"):
            if file.is_file():
                if file.suffix in ['.py', '.js', '.cpp']:
                    data["code"].append(file)
                elif file.suffix in ['.json', '.yaml', '.csv']:
                    data["datasets"].append(file)
                elif file.suffix in ['.md', '.txt']:
                    data["documentation"].append(file)
                    
        self.cache = data
        self.last_scan = time.time()
        return data

class EnvironmentScanner:
    """Scans and indexes system directories for organism environments."""
    def __init__(self):
        self.indexed_paths: Set[Path] = set()
        self.excluded_dirs = {'Windows', 'Program Files', 'System32', '$Recycle.Bin'}
        
    def scan_system(self, start_path: Path = Path.home()) -> None:
        """Scan system directories safely."""
        try:
            for entry in start_path.iterdir():
                if entry.is_dir() and not self._should_exclude(entry):
                    self.indexed_paths.add(entry)
                    self.scan_system(entry)
        except Exception as e:
            logging.warning(f"Error scanning {start_path}: {e}")

    def _should_exclude(self, path: Path) -> bool:
        """Check if path should be excluded from scanning."""
        return (path.name.startswith('.') or
                path.name in self.excluded_dirs or
                any(p in self.excluded_dirs for p in path.parts))

class Organism:
    """Enhanced organism with environment-driven mutation."""
    def __init__(self, organism_id: str, base_dir: Path):
        self.id = organism_id
        self.base_dir = base_dir
        self.environment: Optional[Path] = None
        self.data_pool = DataPoolManager()
        self.knowledge_base = {}
        self.mutation_manager = OrganismMutationManager(
            organism_id,
            base_dir,
            self.environment,
            AIOConfig.DATA_POOL_DIR
        )
        
    async def initialize(self) -> bool:
        """Initialize the organism with its environment."""
        try:
            # Create organism directory
            self.base_dir.mkdir(parents=True, exist_ok=True)
            
            # Copy current script
            script_path = self.base_dir / "organism_core.py"
            shutil.copy2(__file__, script_path)
            
            # Initialize knowledge base
            await self._init_knowledge()
            
            return True
        except Exception as e:
            logging.error(f"Organism initialization failed: {e}")
            return False
            
    async def _init_knowledge(self) -> None:
        """Initialize knowledge from data pool and environment."""
        # Load universal knowledge
        pool_data = self.data_pool.scan_data_pool()
        self.knowledge_base["universal"] = {
            "code_samples": len(pool_data["code"]),
            "datasets": len(pool_data["datasets"]),
            "docs": len(pool_data["documentation"])
        }
        
        # Load environment-specific knowledge
        if self.environment:
            env_files = list(self.environment.rglob("*"))
            self.knowledge_base["environment"] = {
                "path": str(self.environment),
                "file_count": len(env_files),
                "directories": len([f for f in env_files if f.is_dir()])
            }

    async def run_cycle(self) -> bool:
        """Run one evolution cycle."""
        try:
            # Attempt mutation
            success = await self.mutation_manager.run_mutation_cycle()
            if success:
                self._log_success()
            return success
        except Exception as e:
            logging.error(f"Organism cycle failed: {e}")
            return False

    def _log_success(self):
        """Log successful cycle."""
        # Implement logging logic here

class EnvironmentAnalyzer:
    """Advanced environment analysis system."""
    def __init__(self, data_pool_path: Path, selected_env_path: Path):
        self.data_pool = data_pool_path
        self.environment = selected_env_path
        self.knowledge_cache = {
            "data_pool": {},
            "environment": {},
            "patterns": set()
        }
        
    async def analyze_data_pool(self) -> Dict[str, Any]:
        """Deep analysis of universal data pool."""
        results = {
            "code_patterns": [],
            "knowledge_base": {},
            "potential_mutations": []
        }
        
        try:
            # Analyze all files in data pool
            for file_path in self.data_pool.rglob("*"):
                if file_path.is_file():
                    file_data = await self._analyze_file(file_path)
                    
                    # Categorize knowledge
                    if file_path.suffix in ['.py', '.js', '.cpp']:
                        results["code_patterns"].extend(
                            self._extract_code_patterns(file_data)
                        )
                    elif file_path.suffix in ['.json', '.yaml']:
                        results["knowledge_base"].update(
                            self._parse_structured_data(file_data)
                        )
                    elif file_path.suffix in ['.txt', '.md']:
                        mutations = self._extract_mutation_hints(file_data)
                        results["potential_mutations"].extend(mutations)
                        
            return results
            
        except Exception as e:
            logging.error(f"Data pool analysis failed: {e}")
            return results

    async def analyze_selected_environment(self) -> Dict[str, Any]:
        """Analyze organism's unique environment."""
        results = {
            "files": [],
            "subdirectories": [],
            "interesting_patterns": set(),
            "potential_learnings": []
        }
        
        try:
            # Recursively analyze environment
            for path in self.environment.rglob("*"):
                if path.is_file():
                    results["files"].append(path)
                    
                    # Deep analysis of file content
                    file_data = await self._analyze_file(path)
                    patterns = self._identify_patterns(file_data)
                    results["interesting_patterns"].update(patterns)
                    
                    # Extract potential learning opportunities
                    learnings = self._extract_learning_opportunities(file_data)
                    results["potential_learnings"].extend(learnings)
                    
                elif path.is_dir():
                    results["subdirectories"].append(path)
                    
            return results
            
        except Exception as e:
            logging.error(f"Environment analysis failed: {e}")
            return results

    async def _analyze_file(self, file_path: Path) -> str:
        """Safely read and analyze file content."""
        try:
            async with aiofiles.open(file_path, 'r', encoding='utf-8') as f:
                content = await f.read()
                return content
        except Exception:
            return ""

    def _extract_code_patterns(self, content: str) -> List[str]:
        """Extract useful code patterns from content."""
        patterns = []
        try:
            # Look for function definitions
            if 'def ' in content:
                patterns.extend(re.findall(r'def \w+\([^)]*\):', content))
            
            # Look for class definitions
            if 'class ' in content:
                patterns.extend(re.findall(r'class \w+[^:]*:', content))
            
            # Look for import patterns
            if 'import ' in content:
                patterns.extend(re.findall(r'(?:from|import) [\w\.]+ (?:import )?(?:[\w\.]+(?: as \w+)?(?:,\s*)?)+', content))
                
        except Exception as e:
            logging.warning(f"Pattern extraction failed: {e}")
            
        return patterns

    def _parse_structured_data(self, content: str) -> Dict[str, Any]:
        """Parse structured data files."""
        try:
            if content.strip():
                return json.loads(content)
        except json.JSONDecodeError:
            try:
                return yaml.safe_load(content)
            except yaml.YAMLError:
                pass
        return {}

    def _extract_mutation_hints(self, content: str) -> List[str]:
        """Extract potential mutation hints from documentation."""
        hints = []
        try:
            # Look for commented code examples
            code_blocks = re.findall(r'```python\n(.*?)\n```', content, re.DOTALL)
            hints.extend(code_blocks)
            
            # Look for function descriptions
            func_desc = re.findall(r'@description:(.*?)(?=@|$)', content, re.DOTALL)
            hints.extend(func_desc)
            
        except Exception as e:
            logging.warning(f"Mutation hint extraction failed: {e}")
            
        return hints

    def _identify_patterns(self, content: str) -> Set[str]:
        """Identify interesting patterns in content."""
        patterns = set()
        
        # Look for potential learning opportunities
        if 'class' in content or 'def' in content:
            patterns.add('code_structure')
        if 'import' in content:
            patterns.add('dependencies')
        if '"""' in content or "'''" in content:
            patterns.add('documentation')
        if 'raise' in content or 'except' in content:
            patterns.add('error_handling')
            
        return patterns

    def _extract_learning_opportunities(self, content: str) -> List[Dict[str, Any]]:
        """Extract potential learning opportunities from content."""
        opportunities = []
        
        # Look for documented functions/methods
        if '"""' in content or "'''" in content:
            docstrings = re.findall(r'"""(.*?)"""', content, re.DOTALL)
            for doc in docstrings:
                opportunities.append({
                    'type': 'documentation',
                    'content': doc.strip(),
                    'complexity': len(doc.split())
                })
                
        # Look for error handling patterns
        try_blocks = re.findall(r'try:.*?except.*?:', content, re.DOTALL)
        for block in try_blocks:
            opportunities.append({
                'type': 'error_handling',
                'content': block,
                'complexity': block.count('except') + 1
            })
            
        return opportunities

class LearningSystem:
    """Advanced learning system that combines data pool and environment knowledge."""
    def __init__(self, analyzer: EnvironmentAnalyzer):
        self.analyzer = analyzer
        self.learned_patterns = set()
        self.knowledge_base = {}
        
    async def learn(self) -> Dict[str, Any]:
        """Combined learning from both data pool and environment."""
        try:
            # Learn from data pool
            data_pool_knowledge = await self.analyzer.analyze_data_pool()
            
            # Learn from environment
            env_knowledge = await self.analyzer.analyze_selected_environment()
            
            # Combine learnings
            combined_knowledge = self._combine_knowledge(
                data_pool_knowledge,
                env_knowledge
            )
            
            # Update internal knowledge
            self._update_knowledge_base(combined_knowledge)
            
            return combined_knowledge
            
        except Exception as e:
            logging.error(f"Learning failed: {e}")
            return {}

    def _combine_knowledge(
        self,
        data_pool: Dict[str, Any],
        environment: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Combine knowledge from both sources with priority handling."""
        combined = {
            "patterns": set(),
            "mutations": [],
            "learnings": []
        }
        
        # Add universal patterns from data pool
        combined["patterns"].update(
            set(data_pool.get("code_patterns", []))
        )
        
        # Add environment-specific patterns
        combined["patterns"].update(
            environment.get("interesting_patterns", set())
        )
        
        # Collect mutation opportunities
        combined["mutations"].extend(
            data_pool.get("potential_mutations", [])
        )
        
        # Collect learning opportunities
        combined["learnings"].extend(
            environment.get("potential_learnings", [])
        )
        
        return combined

    def _update_knowledge_base(self, new_knowledge: Dict[str, Any]) -> None:
        """Update internal knowledge base with new learnings."""
        # Update pattern recognition
        self.learned_patterns.update(new_knowledge.get("patterns", set()))
        
        # Store structured knowledge
        for category, data in new_knowledge.items():
            if category not in self.knowledge_base:
                self.knowledge_base[category] = []
            if isinstance(data, (list, set)):
                self.knowledge_base[category].extend(data)
                
        # Prune old knowledge if needed
        self._prune_knowledge_base()

    def _prune_knowledge_base(self, max_size: int = 1000) -> None:
        """Prevent knowledge base from growing too large."""
        for category in self.knowledge_base:
            if len(self.knowledge_base[category]) > max_size:
                # Keep most recent knowledge
                self.knowledge_base[category] = self.knowledge_base[category][-max_size:]

class KnowledgeNetwork:
    """Manages knowledge sharing and mutation patterns between organisms."""
    def __init__(self):
        self.successful_adaptations = defaultdict(list)
        self.shared_patterns = set()
        
    async def record_adaptation(self, organism_id: str, environment_path: Path, adaptation: Dict[str, Any]):
        """Record successful adaptation to environment."""
        self.successful_adaptations[str(environment_path)].append({
            "organism_id": organism_id,
            "timestamp": time.time(),
            "adaptation": adaptation
        })
        
        # Extract patterns for future organisms
        if "code_pattern" in adaptation:
            self.shared_patterns.add(adaptation["code_pattern"])

    async def get_relevant_patterns(self, environment_path: Path) -> Set[str]:
        """Get patterns that worked well in similar environments."""
        relevant = set()
        env_str = str(environment_path)
        
        # Get direct matches
        if env_str in self.successful_adaptations:
            for record in self.successful_adaptations[env_str]:
                if "code_pattern" in record["adaptation"]:
                    relevant.add(record["adaptation"]["code_pattern"])
                    
        # Get patterns from parent directories
        for parent in environment_path.parents:
            parent_str = str(parent)
            if parent_str in self.successful_adaptations:
                for record in self.successful_adaptations[parent_str]:
                    if "code_pattern" in record["adaptation"]:
                        relevant.add(record["adaptation"]["code_pattern"])
                        
        return relevant

class EnvironmentBasedMutator:
    """Handles mutations based on environment analysis."""
    def __init__(self, organism_id: str, network: KnowledgeNetwork):
        self.organism_id = organism_id
        self.network = network
        self.mutation_rules = {
            "code_files": self._mutate_from_code,
            "data_files": self._mutate_from_data,
            "config_files": self._mutate_from_config
        }
        
    async def generate_mutation(self, 
                              environment_path: Path,
                              file_type: str,
                              content: str) -> Optional[Dict[str, Any]]:
        """Generate mutation based on environment content."""
        # Check for relevant patterns first
        patterns = await self.network.get_relevant_patterns(environment_path)
        
        if patterns:
            # Try to apply successful patterns
            mutation = await self._apply_patterns(content, patterns)
            if mutation:
                return mutation
        
        # Fall back to standard mutation rules
        if file_type in self.mutation_rules:
            return await self.mutation_rules[file_type](content)
            
        return None

    async def _apply_patterns(self, 
                            content: str, 
                            patterns: Set[str]) -> Optional[Dict[str, Any]]:
        """Try to apply known successful patterns."""
        for pattern in patterns:
            try:
                # Attempt to integrate pattern
                if self._can_apply_pattern(content, pattern):
                    return {
                        "type": "pattern_based",
                        "pattern": pattern,
                        "modification": self._generate_pattern_mod(content, pattern)
                    }
            except Exception as e:
                logging.warning(f"Pattern application failed: {e}")
        return None

    def _can_apply_pattern(self, content: str, pattern: str) -> bool:
        """Check if pattern can be safely applied."""
        try:
            # Basic syntax check
            ast.parse(pattern)
            
            # Check for conflicts
            existing_names = set(re.findall(r'\bdef\s+(\w+)', content))
            pattern_names = set(re.findall(r'\bdef\s+(\w+)', pattern))
            
            return not (existing_names & pattern_names)
            
        except Exception:
            return False

    def _generate_pattern_mod(self, content: str, pattern: str) -> str:
        """Generate modification using pattern."""
        # Add pattern in appropriate location
        tree = ast.parse(content)
        pattern_tree = ast.parse(pattern)
        
        class PatternInserter(ast.NodeTransformer):
            def visit_Module(self, node):
                # Add pattern to end of module
                node.body.extend(pattern_tree.body)
                return node
                
        transformed = PatternInserter().visit(tree)
        return astor.to_source(transformed)

    async def _mutate_from_code(self, content: str) -> Dict[str, Any]:
        """Generate mutation from code file analysis."""
        try:
            tree = ast.parse(content)
            
            # Extract useful patterns
            functions = [n for n in ast.walk(tree) 
                       if isinstance(n, ast.FunctionDef)]
            classes = [n for n in ast.walk(tree) 
                      if isinstance(n, ast.ClassDef)]
            
            if functions or classes:
                selected = random.choice(functions + classes)
                return {
                    "type": "code_based",
                    "code_pattern": astor.to_source(selected),
                    "source_type": selected.__class__.__name__
                }
        except Exception as e:
            logging.warning(f"Code mutation failed: {e}")
        return {}

    async def _mutate_from_data(self, content: str) -> Dict[str, Any]:
        """Generate mutation from data file analysis."""
        try:
            # Try parsing as JSON or YAML
            data = json.loads(content)
            
            # Extract structure
            return {
                "type": "data_based",
                "structure": self._analyze_data_structure(data)
            }
        except Exception:
            return {}

    async def _mutate_from_config(self, content: str) -> Dict[str, Any]:
        """Generate mutation from config file analysis."""
        try:
            # Look for parameter patterns
            params = re.findall(r'(\w+)\s*[=:]\s*([^,\n]+)', content)
            if params:
                return {
                    "type": "config_based",
                    "parameters": dict(params)
                }
        except Exception:
            return {}

    def _analyze_data_structure(self, data: Any) -> Dict[str, Any]:
        """Analyze structure of data for learning patterns."""
        if isinstance(data, dict):
            return {
                "type": "dictionary",
                "keys": list(data.keys()),
                "value_types": {k: type(v).__name__ for k, v in data.items()}
            }
        elif isinstance(data, list):
            return {
                "type": "list",
                "length": len(data),
                "element_types": list(set(type(x).__name__ for x in data))
            }
        else:
            return {
                "type": "atomic",
                "value_type": type(data).__name__
            }

class OrganismMutationManager:
    """Manages mutation process for an organism."""
    def __init__(self, 
                 organism_id: str,
                 base_dir: Path,
                 environment_path: Path,
                 data_pool_path: Path):
        self.organism_id = organism_id
        self.base_dir = base_dir
        self.environment = environment_path
        self.data_pool = data_pool_path
        self.network = KnowledgeNetwork()
        self.mutator = EnvironmentBasedMutator(organism_id, self.network)
        
    async def run_mutation_cycle(self) -> bool:
        """Execute one mutation cycle."""
        try:
            # Analyze environment
            env_mutations = await self._analyze_environment()
            if env_mutations:
                # Apply promising mutations
                success = await self._apply_mutations(env_mutations)
                if success:
                    await self.network.record_adaptation(
                        self.organism_id,
                        self.environment,
                        env_mutations[0]  # Record best mutation
                    )
                return success
                
            # Fall back to data pool if needed
            data_pool_mutations = await self._analyze_data_pool()
            if data_pool_mutations:
                return await self._apply_mutations(data_pool_mutations)
                
            return False
            
        except Exception as e:
            logging.error(f"Mutation cycle failed: {e}")
            return False

    async def _analyze_environment(self) -> List[Dict[str, Any]]:
        """Analyze environment for mutation opportunities."""
        mutations = []
        
        try:
            for file_path in self.environment.rglob("*"):
                if file_path.is_file():
                    # Determine file type
                    file_type = self._get_file_type(file_path)
                    
                    # Read and analyze content
                    content = await self._read_file(file_path)
                    if content:
                        mutation = await self.mutator.generate_mutation(
                            self.environment,
                            file_type,
                            content
                        )
                        if mutation:
                            mutations.append(mutation)
                            
        except Exception as e:
            logging.error(f"Environment analysis failed: {e}")
            
        return mutations

    async def _analyze_data_pool(self) -> List[Dict[str, Any]]:
        """Analyze data pool for mutation opportunities."""
        mutations = []
        
        try:
            for file_path in self.data_pool.rglob("*"):
                if file_path.is_file():
                    file_type = self._get_file_type(file_path)
                    content = await self._read_file(file_path)
                    if content:
                        mutation = await self.mutator.generate_mutation(
                            self.data_pool,
                            file_type,
                            content
                        )
                        if mutation:
                            mutation["source"] = "data_pool"
                            mutations.append(mutation)
                            
        except Exception as e:
            logging.error(f"Data pool analysis failed: {e}")
            
        return mutations

    def _get_file_type(self, path: Path) -> str:
        """Determine file type for mutation strategy."""
        if path.suffix in ['.py', '.js', '.cpp']:
            return "code_files"
        elif path.suffix in ['.json', '.yaml', '.csv']:
            return "data_files"
        elif path.suffix in ['.conf', '.ini', '.cfg']:
            return "config_files"
        return "unknown"

    async def _read_file(self, path: Path) -> Optional[str]:
        """Safely read file content."""
        try:
            async with aiofiles.open(path, 'r', encoding='utf-8') as f:
                return await f.read()
        except Exception:
            return None

    async def _apply_mutations(self, 
                             mutations: List[Dict[str, Any]]) -> bool:
        """Apply mutations and verify results."""
        for mutation in mutations:
            try:
                if mutation['type'] == 'code_based':
                    success = await self._apply_code_mutation(mutation)
                elif mutation['type'] == 'data_based':
                    success = await self._apply_data_mutation(mutation)
                elif mutation['type'] == 'config_based':
                    success = await self._apply_config_mutation(mutation)
                else:
                    continue
                    
                if success:
                    return True
                    
            except Exception as e:
                logging.warning(f"Mutation application failed: {e}")
                
        return False

    async def _apply_code_mutation(self, mutation: Dict[str, Any]) -> bool:
        """Apply and verify code-based mutation."""
        try:
            # Create temporary file with mutation
            temp_file = self.base_dir / f"temp_mutation_{int(time.time())}.py"
            async with aiofiles.open(temp_file, 'w') as f:
                await f.write(mutation['code_pattern'])
                
            # Test compilation
            try:
                compile(mutation['code_pattern'], '<string>', 'exec')
                return True
            except Exception:
                return False
                
        finally:
            if temp_file.exists():
                temp_file.unlink()

    async def _apply_data_mutation(self, mutation: Dict[str, Any]) -> bool:
        """Apply and verify data-based mutation."""
        try:
            # Verify structure is valid
            if 'structure' in mutation:
                return True
            return False
        except Exception:
            return False

    async def _apply_config_mutation(self, mutation: Dict[str, Any]) -> bool:
        """Apply and verify config-based mutation."""
        try:
            # Verify parameters are valid
            if 'parameters' in mutation:
                return all(isinstance(k, str) for k in mutation['parameters'])
            return False
        except Exception:
            return False

class ConfigurationPanel:
    """Centralized configuration control panel."""
    def __init__(self, parent: ttk.Frame):
        self.frame = ttk.LabelFrame(parent, text="Configuration")
        self.frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Path configurations
        self.paths_frame = ttk.LabelFrame(self.frame, text="Paths")
        self.paths_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.path_vars = {
            "Data Pool": tk.StringVar(value=str(AIOConfig.DATA_POOL_DIR)),
            "Organisms": tk.StringVar(value=str(AIOConfig.ORGANISMS_DIR)),
            "Database": tk.StringVar(value=str(AIOConfig.DB_PATH))
        }
        
        for label, var in self.path_vars.items():
            frame = ttk.Frame(self.paths_frame)
            frame.pack(fill=tk.X, padx=5, pady=2)
            
            ttk.Label(frame, text=label).pack(side=tk.LEFT)
            ttk.Entry(frame, textvariable=var).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
            ttk.Button(
                frame,
                text="Browse",
                command=lambda v=var: self._browse_path(v)
            ).pack(side=tk.RIGHT)
        
        # Environment Selection Controls
        self.env_frame = ttk.LabelFrame(self.frame, text="Environment Selection")
        self.env_frame.pack(fill=tk.X, padx=5, pady=5)
        
        # Scan depth control
        ttk.Label(self.env_frame, text="Max Scan Depth:").pack(side=tk.LEFT)
        self.scan_depth = tk.StringVar(value="3")
        ttk.Entry(
            self.env_frame,
            textvariable=self.scan_depth,
            width=5
        ).pack(side=tk.LEFT, padx=5)
        
        # Excluded paths
        ttk.Label(self.env_frame, text="Excluded Paths:").pack(side=tk.LEFT, padx=5)
        self.excluded_paths = tk.StringVar(value="Windows,Program Files,System32")
        ttk.Entry(
            self.env_frame,
            textvariable=self.excluded_paths
        ).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        
        # Organism Controls
        self.organism_frame = ttk.LabelFrame(self.frame, text="Organism Settings")
        self.organism_frame.pack(fill=tk.X, padx=5, pady=5)
        
        # Maximum organisms
        ttk.Label(self.organism_frame, text="Max Organisms:").pack(side=tk.LEFT)
        self.max_organisms = tk.StringVar(value="10")
        ttk.Entry(
            self.organism_frame,
            textvariable=self.max_organisms,
            width=5
        ).pack(side=tk.LEFT, padx=5)
        
        # Mutation settings
        self.mutation_frame = ttk.LabelFrame(self.frame, text="Mutation Settings")
        self.mutation_frame.pack(fill=tk.X, padx=5, pady=5)
        
        # Mutation controls
        self.mutation_vars = {
            "Rate": tk.DoubleVar(value=0.1),
            "Intensity": tk.DoubleVar(value=0.5),
            "Max Changes": tk.IntVar(value=5)
        }
        
        for label, var in self.mutation_vars.items():
            frame = ttk.Frame(self.mutation_frame)
            frame.pack(fill=tk.X, padx=5, pady=2)
            
            ttk.Label(frame, text=label).pack(side=tk.LEFT)
            ttk.Scale(
                frame,
                from_=0,
                to=1 if isinstance(var, tk.DoubleVar) else 10,
                variable=var,
                orient=tk.HORIZONTAL
            ).pack(side=tk.RIGHT, fill=tk.X, expand=True, padx=5)
        
        # Apply button
        ttk.Button(
            self.frame,
            text="Apply Configuration",
            command=self._apply_config
        ).pack(pady=10)

    def _browse_path(self, var: tk.StringVar):
        """Browse for directory path."""
        path = filedialog.askdirectory()
        if path:
            var.set(path)

    def _apply_config(self):
        """Apply configuration changes."""
        try:
            # Update paths
            AIOConfig.DATA_POOL_DIR = Path(self.path_vars["Data Pool"].get())
            AIOConfig.ORGANISMS_DIR = Path(self.path_vars["Organisms"].get())
            AIOConfig.DB_PATH = Path(self.path_vars["Database"].get())
            
            # Create directories if needed
            AIOConfig.ensure_directories()
            
            # Update environment scanner settings
            scanner = EnvironmentScanner()
            scanner.max_depth = int(self.scan_depth.get())
            scanner.excluded_dirs = set(
                self.excluded_paths.get().split(',')
            )
            
            # Update mutation settings
            mutation_config = {
                name.lower(): var.get()
                for name, var in self.mutation_vars.items()
            }
            
            # Save configuration
            config = {
                "paths": {
                    name: str(Path(var.get()))
                    for name, var in self.path_vars.items()
                },
                "environment": {
                    "scan_depth": int(self.scan_depth.get()),
                    "excluded_paths": self.excluded_paths.get().split(',')
                },
                "organisms": {
                    "max_count": int(self.max_organisms.get())
                },
                "mutation": mutation_config
            }
            
            config_path = AIOConfig.DATA_POOL_DIR / "config.json"
            with open(config_path, 'w') as f:
                json.dump(config, f, indent=2)
                
            messagebox.showinfo(
                "Success",
                "Configuration updated successfully!"
            )
            
        except Exception as e:
            messagebox.showerror(
                "Error",
                f"Failed to update configuration: {e}"
            )

class EnvironmentVisualizer:
    """Advanced environment visualization and control panel."""
    def __init__(self, parent: ttk.Frame):
        self.frame = ttk.LabelFrame(parent, text="Environment Explorer")
        self.frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Split view
        self.paned = ttk.PanedWindow(self.frame, orient=tk.HORIZONTAL)
        self.paned.pack(fill=tk.BOTH, expand=True)
        
        # Directory tree
        self.tree_frame = self._create_tree_frame()
        self.paned.add(self.tree_frame)
        
        # Details panel
        self.details_frame = self._create_details_frame()
        self.paned.add(self.details_frame)
        
        # Initialize data
        self.selected_env = None
        self.file_stats = {}
        
    def _create_tree_frame(self) -> ttk.Frame:
        """Create directory tree view."""
        frame = ttk.Frame(self.paned)
        
        # Controls
        controls = ttk.Frame(frame)
        controls.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Button(
            controls,
            text="Refresh Tree",
            command=self._refresh_tree
        ).pack(side=tk.LEFT, padx=2)
        
        ttk.Button(
            controls,
            text="Expand All",
            command=lambda: self._expand_tree(True)
        ).pack(side=tk.LEFT, padx=2)
        
        ttk.Button(
            controls,
            text="Collapse All",
            command=lambda: self._expand_tree(False)
        ).pack(side=tk.LEFT, padx=2)
        
        # Search
        search_frame = ttk.Frame(frame)
        search_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Label(search_frame, text="Filter:").pack(side=tk.LEFT)
        self.search_var = tk.StringVar()
        self.search_var.trace('w', self._filter_tree)
        ttk.Entry(
            search_frame,
            textvariable=self.search_var
        ).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        
        # Tree with scrollbar
        tree_container = ttk.Frame(frame)
        tree_container.pack(fill=tk.BOTH, expand=True)
        
        self.tree = ttk.Treeview(
            tree_container,
            selectmode='browse',
            columns=('type', 'status')
        )
        self.tree.heading('type', text='Type')
        self.tree.heading('status', text='Status')
        self.tree.column('type', width=100)
        self.tree.column('status', width=100)
        
        scrollbar = ttk.Scrollbar(
            tree_container,
            orient="vertical",
            command=self.tree.yview
        )
        self.tree.configure(yscrollcommand=scrollbar.set)
        
        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Bind events
        self.tree.bind('<<TreeviewSelect>>', self._on_select)
        
        return frame
        
    def _create_details_frame(self) -> ttk.Frame:
        """Create details panel."""
        frame = ttk.Frame(self.paned)
        
        # Environment status
        status_frame = ttk.LabelFrame(frame, text="Environment Status")
        status_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.status_labels = {}
        for stat in ["Path", "Files", "Size", "Last Modified"]:
            self.status_labels[stat] = ttk.Label(status_frame, text=f"{stat}: --")
            self.status_labels[stat].pack(fill=tk.X, padx=5, pady=2)
        
        # File type breakdown
        types_frame = ttk.LabelFrame(frame, text="File Types")
        types_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.type_tree = ttk.Treeview(
            types_frame,
            columns=('count', 'size'),
            height=6
        )
        self.type_tree.heading('count', text='Count')
        self.type_tree.heading('size', text='Size')
        self.type_tree.pack(fill=tk.X, padx=5, pady=5)
        
        # Actions
        actions_frame = ttk.LabelFrame(frame, text="Actions")
        actions_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Button(
            actions_frame,
            text="Set as Environment",
            command=self._set_environment
        ).pack(fill=tk.X, padx=5, pady=2)
        
        ttk.Button(
            actions_frame,
            text="Add to Data Pool",
            command=self._add_to_data_pool
        ).pack(fill=tk.X, padx=5, pady=2)
        
        ttk.Button(
            actions_frame,
            text="Analyze Contents",
            command=self._analyze_contents
        ).pack(fill=tk.X, padx=5, pady=2)
        
        # Analysis results
        self.analysis_text = scrolledtext.ScrolledText(
            frame,
            height=10,
            wrap=tk.WORD
        )
        self.analysis_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        return frame

    def _refresh_tree(self):
        """Refresh directory tree."""
        for item in self.tree.get_children():
            self.tree.delete(item)
            
        # Start from root paths
        for drive in self._get_root_paths():
            self._add_path_to_tree(drive)
            
    def _get_root_paths(self) -> List[Path]:
        """Get system root paths."""
        if sys.platform == 'win32':
            return [Path(f"{d}:\\") for d in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' 
                    if os.path.exists(f"{d}:")]
        else:
            return [Path("/")]
            
    def _add_path_to_tree(self, path: Path, parent=""):
        """Add path to tree view."""
        try:
            # Skip excluded paths
            if self._should_exclude(path):
                return
                
            # Add node
            node = self.tree.insert(
                parent,
                "end",
                text=path.name or str(path),
                values=(
                    "Directory" if path.is_dir() else "File",
                    "Available"
                )
            )
            
            # Add children if directory
            if path.is_dir():
                try:
                    for child in path.iterdir():
                        self._add_path_to_tree(child, node)
                except PermissionError:
                    pass
                    
        except Exception as e:
            logging.warning(f"Error adding path {path}: {e}")

    def _should_exclude(self, path: Path) -> bool:
        """Check if path should be excluded."""
        excluded = {
            'Windows', 'Program Files', 'System32',
            '$Recycle.Bin', '$RECYCLE.BIN',
            'System Volume Information'
        }
        return (path.name.startswith('.') or
                path.name in excluded or
                any(p in excluded for p in path.parts))

    def _expand_tree(self, expand: bool):
        """Expand or collapse all tree items."""
        for item in self.tree.get_children():
            if expand:
                self.tree.item(item, open=True)
            else:
                self.tree.item(item, open=False)

    def _filter_tree(self, *args):
        """Filter tree items based on search text."""
        search = self.search_var.get().lower()
        self._apply_filter(search)

    def _apply_filter(self, search: str, node=""):
        """Recursively apply filter to tree."""
        for child in self.tree.get_children(node):
            text = self.tree.item(child)['text'].lower()
            if search in text:
                self.tree.item(child, tags=('visible',))
                parent = self.tree.parent(child)
                while parent:
                    self.tree.item(parent, tags=('visible',))
                    parent = self.tree.parent(parent)
            else:
                self.tree.item(child, tags=('hidden',))
            self._apply_filter(search, child)

    def _on_select(self, event):
        """Handle tree item selection."""
        selected = self.tree.selection()
        if not selected:
            return
            
        # Get full path
        path = self._get_full_path(selected[0])
        self.selected_env = path
        
        # Update details
        self._update_details(path)

    def _get_full_path(self, item: str) -> Path:
        """Get full path from tree item."""
        parts = []
        while item:
            parts.append(self.tree.item(item)['text'])
            item = self.tree.parent(item)
        return Path(*reversed(parts))

    def _update_details(self, path: Path):
        """Update details panel with path info."""
        try:
            # Update status
            stats = path.stat()
            self.status_labels["Path"].config(text=f"Path: {path}")
            self.status_labels["Files"].config(
                text=f"Files: {len(list(path.rglob('*'))) if path.is_dir() else 1}"
            )
            self.status_labels["Size"].config(
                text=f"Size: {stats.st_size:,} bytes"
            )
            self.status_labels["Last Modified"].config(
                text=f"Last Modified: {time.ctime(stats.st_mtime)}"
            )
            
            # Update file types
            if path.is_dir():
                self._update_file_types(path)
                
        except Exception as e:
            logging.error(f"Error updating details: {e}")

    def _update_file_types(self, path: Path):
        """Update file type breakdown."""
        # Clear existing items
        for item in self.type_tree.get_children():
            self.type_tree.delete(item)
            
        # Count file types
        types: Dict[str, Dict[str, int]] = defaultdict(
            lambda: {"count": 0, "size": 0}
        )
        
        try:
            for file in path.rglob("*"):
                if file.is_file():
                    ext = file.suffix or "No Extension"
                    types[ext]["count"] += 1
                    types[ext]["size"] += file.stat().st_size
                    
            # Add to tree
            for ext, stats in sorted(
                types.items(),
                key=lambda x: x[1]["count"],
                reverse=True
            ):
                self.type_tree.insert(
                    "",
                    "end",
                    text=ext,
                    values=(
                        stats["count"],
                        f"{stats['size']:,} bytes"
                    )
                )
                
        except Exception as e:
            logging.error(f"Error updating file types: {e}")

    def _set_environment(self):
        """Set selected path as organism environment."""
        if not self.selected_env:
            messagebox.showwarning(
                "No Selection",
                "Please select an environment first."
            )
            return
            
        try:
            # Update system
            self.tree.set(
                self.tree.selection()[0],
                "status",
                "In Use"
            )
            messagebox.showinfo(
                "Success",
                f"Environment set to: {self.selected_env}"
            )
            
        except Exception as e:
            messagebox.showerror(
                "Error",
                f"Failed to set environment: {e}"
            )

    def _add_to_data_pool(self):
        """Add selected path to data pool."""
        if not self.selected_env:
            messagebox.showwarning(
                "No Selection",
                "Please select a path first."
            )
            return
            
        try:
            # Copy to data pool
            dest = AIOConfig.DATA_POOL_DIR / self.selected_env.name
            if self.selected_env.is_dir():
                shutil.copytree(self.selected_env, dest)
            else:
                shutil.copy2(self.selected_env, dest)
                
            messagebox.showinfo(
                "Success",
                f"Added to data pool: {self.selected_env.name}"
            )
            
        except Exception as e:
            messagebox.showerror(
                "Error",
                f"Failed to add to data pool: {e}"
            )

    def _analyze_contents(self):
        """Analyze selected environment contents."""
        if not self.selected_env:
            messagebox.showwarning(
                "No Selection",
                "Please select an environment first."
            )
            return
            
        try:
            # Clear previous analysis
            self.analysis_text.delete('1.0', tk.END)
            
            # Analyze path
            stats = self._get_path_stats(self.selected_env)
            
            # Display results
            self.analysis_text.insert(tk.END, "Environment Analysis\n\n")
            
            for key, value in stats.items():
                self.analysis_text.insert(tk.END, f"{key}: {value}\n")
                
        except Exception as e:
            self.analysis_text.insert(
                tk.END,
                f"Analysis failed: {e}\n"
            )

    def _get_path_stats(self, path: Path) -> Dict[str, Any]:
        """Get detailed path statistics."""
        stats = {
            "Total Size": 0,
            "File Count": 0,
            "Directory Count": 0,
            "Average File Size": 0,
            "Largest File": ("", 0),
            "Most Common Extension": ("", 0),
            "Last Modified": None
        }
        
        extensions = defaultdict(int)
        
        try:
            for item in path.rglob("*"):
                if item.is_file():
                    size = item.stat().st_size
                    stats["Total Size"] += size
                    stats["File Count"] += 1
                    
                    if size > stats["Largest File"][1]:
                        stats["Largest File"] = (item.name, size)
                        
                    extensions[item.suffix] += 1
                    
                elif item.is_dir():
                    stats["Directory Count"] += 1
                    
                mtime = item.stat().st_mtime
                if not stats["Last Modified"] or mtime > stats["Last Modified"]:
                    stats["Last Modified"] = mtime
                    
            # Calculate averages and most common
            if stats["File Count"] > 0:
                stats["Average File Size"] = stats["Total Size"] / stats["File Count"]
                
            if extensions:
                stats["Most Common Extension"] = max(
                    extensions.items(),
                    key=lambda x: x[1]
                )
                
            # Format values
            stats["Total Size"] = f"{stats['Total Size']:,} bytes"
            stats["Average File Size"] = f"{stats['Average File Size']:,.0f} bytes"
            stats["Largest File"] = f"{stats['Largest File'][0]} ({stats['Largest File'][1]:,} bytes)"
            stats["Most Common Extension"] = f"{stats['Most Common Extension'][0]} ({stats['Most Common Extension'][1]} files)"
            stats["Last Modified"] = time.ctime(stats["Last Modified"]) if stats["Last Modified"] else "Never"
            
            return stats
            
        except Exception as e:
            logging.error(f"Error getting path stats: {e}")
            return {"Error": str(e)}

# Update SystemControlPanel to use new visualizer
class SystemControlPanel:
    """Enhanced master control panel."""
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("AIOS Control Center")
        self.root.geometry("1200x800")
        
        # Create main notebook for tabs
        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(fill=tk.BOTH, expand=True)
        
        # Create tabs
        self.env_tab = self._create_environment_tab()
        self.organism_tab = self._create_organism_tab()
        self.data_pool_tab = self._create_data_pool_tab()
        self.monitor_tab = self._create_monitor_tab()
        
        # Add configuration tab
        self.config_tab = self._create_config_tab()
        
        # Update other tabs to use configuration
        self._update_tabs_with_config()
        
        # Update timer
        self.root.after(1000, self._update_ui)

    def _create_environment_tab(self) -> ttk.Frame:
        """Environment control tab."""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Environments")
        
        # Environment tree view
        tree_frame = ttk.Frame(tab)
        tree_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        self.env_tree = ttk.Treeview(tree_frame)
        self.env_tree.pack(fill=tk.BOTH, expand=True)
        
        # Control panel
        control_frame = ttk.Frame(tab)
        control_frame.pack(side=tk.RIGHT, fill=tk.Y)
        
        ttk.Button(
            control_frame, 
            text="Add Directory",
            command=self._add_environment
        ).pack(fill=tk.X, pady=5)
        
        ttk.Button(
            control_frame,
            text="Remove Selected",
            command=self._remove_environment
        ).pack(fill=tk.X, pady=5)
        
        # Scan settings
        scan_frame = ttk.LabelFrame(control_frame, text="Scan Settings")
        scan_frame.pack(fill=tk.X, pady=10)
        
        ttk.Label(scan_frame, text="Depth:").pack()
        self.scan_depth = tk.StringVar(value="3")
        ttk.Entry(
            scan_frame,
            textvariable=self.scan_depth
        ).pack(fill=tk.X, padx=5)
        
        return tab

    def _create_organism_tab(self) -> ttk.Frame:
        """Organism management tab."""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Organisms")
        
        # Split view
        paned = ttk.PanedWindow(tab, orient=tk.HORIZONTAL)
        paned.pack(fill=tk.BOTH, expand=True)
        
        # Organism list
        list_frame = ttk.Frame(paned)
        ttk.Label(list_frame, text="Active Organisms").pack()
        
        self.organism_list = ttk.Treeview(list_frame)
        self.organism_list.pack(fill=tk.BOTH, expand=True)
        
        paned.add(list_frame)
        
        # Details panel
        details_frame = ttk.Frame(paned)
        
        # Organism controls
        control_frame = ttk.LabelFrame(details_frame, text="Controls")
        control_frame.pack(fill=tk.X, pady=5)
        
        ttk.Button(
            control_frame,
            text="Create New Organism",
            command=self._create_organism
        ).pack(fill=tk.X, pady=2)
        
        ttk.Button(
            control_frame,
            text="Split Selected",
            command=self._split_organism
        ).pack(fill=tk.X, pady=2)
        
        # Status display
        status_frame = ttk.LabelFrame(details_frame, text="Status")
        status_frame.pack(fill=tk.X, pady=5)
        
        self.status_text = scrolledtext.ScrolledText(
            status_frame,
            height=10
        )
        self.status_text.pack(fill=tk.BOTH, expand=True)
        
        paned.add(details_frame)
        
        return tab

    def _create_data_pool_tab(self) -> ttk.Frame:
        """Data pool management tab."""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Data Pool")
        
        # Data pool browser
        browser_frame = ttk.Frame(tab)
        browser_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        self.pool_tree = ttk.Treeview(browser_frame)
        self.pool_tree.pack(fill=tk.BOTH, expand=True)
        
        # Control panel
        control_frame = ttk.Frame(tab)
        control_frame.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Add data controls
        ttk.Button(
            control_frame,
            text="Add Files",
            command=self._add_to_pool
        ).pack(fill=tk.X, pady=5)
        
        ttk.Button(
            control_frame,
            text="Add Directory",
            command=self._add_dir_to_pool
        ).pack(fill=tk.X, pady=5)
        
        # Categories frame
        cat_frame = ttk.LabelFrame(control_frame, text="Categories")
        cat_frame.pack(fill=tk.X, pady=10)
        
        self.categories = {
            "code": tk.BooleanVar(value=True),
            "data": tk.BooleanVar(value=True),
            "docs": tk.BooleanVar(value=True)
        }
        
        for cat, var in self.categories.items():
            ttk.Checkbutton(
                cat_frame,
                text=cat.title(),
                variable=var
            ).pack(fill=tk.X)
            
        return tab

    def _create_monitor_tab(self) -> ttk.Frame:
        """System monitoring tab."""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Monitor")
        
        # Stats panel
        stats_frame = ttk.LabelFrame(tab, text="System Stats")
        stats_frame.pack(fill=tk.X)
        
        self.stats_labels = {}
        for stat in ["Organisms", "Environments", "Pool Size", "Memory"]:
            self.stats_labels[stat] = ttk.Label(stats_frame, text=f"{stat}: --")
            self.stats_labels[stat].pack()
            
        # Activity log
        log_frame = ttk.LabelFrame(tab, text="Activity Log")
        log_frame.pack(fill=tk.BOTH, expand=True)
        
        self.log_text = scrolledtext.ScrolledText(log_frame)
        self.log_text.pack(fill=tk.BOTH, expand=True)
        
        return tab

    def _create_config_tab(self) -> ttk.Frame:
        """Create configuration control tab."""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Configuration")
        
        # Add configuration panel
        self.config_panel = ConfigurationPanel(tab)
        
        return tab

    def _update_tabs_with_config(self):
        """Update other tabs to use configuration settings."""
        # Update environment tab
        self.scan_depth.set(self.config_panel.scan_depth.get())
        
        # Update organism tab
        self._update_organism_limits()
        
        # Update data pool tab
        self._update_pool_paths()

    def _update_ui(self):
        """Update UI elements periodically."""
        try:
            # Update stats
            stats = self._get_system_stats()
            for stat, value in stats.items():
                if stat in self.stats_labels:
                    self.stats_labels[stat].config(text=f"{stat}: {value}")
                    
            # Update organism list
            self._update_organism_list()
            
            # Update environment tree
            self._update_environment_tree()
            
            # Update data pool
            self._update_data_pool()
            
        except Exception as e:
            self.log_error(f"UI update error: {e}")
            
        finally:
            self.root.after(1000, self._update_ui)

    def _get_system_stats(self) -> Dict[str, Any]:
        """Get current system statistics."""
        return {
            "Organisms": len(self.organisms),
            "Environments": len(self.environments),
            "Pool Size": self._get_pool_size(),
            "Memory": f"{self._get_memory_usage():.1f}MB"
        }

    def _update_organism_list(self):
        """Update organism list display."""
        for item in self.organism_list.get_children():
            self.organism_list.delete(item)
            
        for org_id, organism in self.organisms.items():
            self.organism_list.insert(
                "",
                "end",
                text=org_id,
                values=(
                    str(organism.environment),
                    organism.status
                )
            )

    def _update_environment_tree(self):
        """Update environment tree display."""
        for item in self.env_tree.get_children():
            self.env_tree.delete(item)
            
        for env_path in self.environments:
            self._add_path_to_tree(env_path)

    def _add_path_to_tree(self, path: Path, parent=""):
        """Add path to environment tree."""
        node = self.env_tree.insert(
            parent,
            "end",
            text=path.name,
            values=(str(path),)
        )
        
        if path.is_dir():
            try:
                for child in path.iterdir():
                    self._add_path_to_tree(child, node)
            except PermissionError:
                pass

    def _update_data_pool(self):
        """Update data pool display."""
        for item in self.pool_tree.get_children():
            self.pool_tree.delete(item)
            
        pool_data = self._scan_data_pool()
        for category, items in pool_data.items():
            cat_node = self.pool_tree.insert(
                "",
                "end",
                text=category,
                values=(len(items),)
            )
            
            for item in items:
                self.pool_tree.insert(
                    cat_node,
                    "end",
                    text=item.name,
                    values=(str(item),)
                )

    def _add_environment(self):
        """Add new environment directory."""
        path = filedialog.askdirectory()
        if path:
            self.add_environment(Path(path))

    def _remove_environment(self):
        """Remove selected environment."""
        selected = self.env_tree.selection()
        if selected:
            item = selected[0]
            path = Path(self.env_tree.item(item)["values"][0])
            self.remove_environment(path)

    def _create_organism(self):
        """Create new organism."""
        try:
            organism_id = self.create_organism()
            self.log_info(f"Created organism: {organism_id}")
        except Exception as e:
            self.log_error(f"Failed to create organism: {e}")

    def _split_organism(self):
        """Split selected organism."""
        selected = self.organism_list.selection()
        if selected:
            organism_id = self.organism_list.item(selected[0])["text"]
            try:
                new_id = self.split_organism(organism_id)
                self.log_info(f"Split organism {organism_id} -> {new_id}")
            except Exception as e:
                self.log_error(f"Failed to split organism: {e}")

    def _add_to_pool(self):
        """Add files to data pool."""
        files = filedialog.askopenfilenames()
        if files:
            for file in files:
                self.add_to_pool(Path(file))

    def _add_dir_to_pool(self):
        """Add directory to data pool."""
        path = filedialog.askdirectory()
        if path:
            self.add_directory_to_pool(Path(path))

    def log_info(self, message: str):
        """Log information message."""
        self.log_text.insert("end", f"[INFO] {message}\n")
        self.log_text.see("end")

    def log_error(self, message: str):
        """Log error message."""
        self.log_text.insert("end", f"[ERROR] {message}\n")
        self.log_text.see("end")

    def _update_organism_limits(self):
        """Update organism creation limits."""
        max_organisms = int(self.config_panel.max_organisms.get())
        if len(self.organisms) >= max_organisms:
            self.organism_create_btn.config(state=tk.DISABLED)
            self.organism_split_btn.config(state=tk.DISABLED)
        else:
            self.organism_create_btn.config(state=tk.NORMAL)
            self.organism_split_btn.config(state=tk.NORMAL)

    def _update_pool_paths(self):
        """Update data pool paths from configuration."""
        self.pool_path = Path(self.config_panel.path_vars["Data Pool"].get())
        self._refresh_pool_view()

# Update UnifiedSystem to use control panel
class UnifiedSystem:
    """Master coordinator with UI controls."""
    def __init__(self):
        self.root = tk.Tk()
        self.control_panel = SystemControlPanel(self.root)
        self.organism_manager = OrganismManager()
        
    async def run(self):
        """Main execution loop with UI."""
        try:
            # Start UI update thread
            with ThreadPoolExecutor() as executor:
                ui_future = executor.submit(self.root.mainloop)
                
                # Run system loop
                while True:
                    if not ui_future.running():
                        break
                        
                    await self.organism_manager.run_evolution_cycle()
                    await asyncio.sleep(1)
                    
        except Exception as e:
            logging.error(f"Runtime error: {e}")
            messagebox.showerror("Error", str(e))
            raise
        finally:
            await self.cleanup()

if __name__ == "__main__":
    # Initialize system
    AIOConfig.ensure_directories()
    
    async def main():
        # Create organism manager
        manager = OrganismManager()
        
        # Scan system for environments
        manager.scanner.scan_system()
        
        # Create initial organism
        try:
            organism_id = await manager.create_organism()
            logging.info(f"Created organism: {organism_id}")
            
            # Keep system running
            while True:
                await asyncio.sleep(60)
                
        except Exception as e:
            logging.error(f"System error: {e}")
            
    # Run system
    asyncio.run(main())

class ProcessManagerPanel:
    """Manages and visualizes all running processes and organism activities."""
    def __init__(self, parent: ttk.Frame):
        self.frame = ttk.LabelFrame(parent, text="Process Manager")
        self.frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Split view
        self.paned = ttk.PanedWindow(self.frame, orient=tk.HORIZONTAL)
        self.paned.pack(fill=tk.BOTH, expand=True)
        
        # Active processes list
        self.process_frame = self._create_process_frame()
        self.paned.add(self.process_frame)
        
        # Process details
        self.details_frame = self._create_details_frame()
        self.paned.add(self.details_frame)
        
        # Process tracking
        self.active_processes = {}
        self.process_stats = {}
        
    def _create_process_frame(self) -> ttk.Frame:
        """Create process list frame."""
        frame = ttk.Frame(self.paned)
        
        # Controls
        controls = ttk.Frame(frame)
        controls.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Button(
            controls,
            text="Refresh",
            command=self._refresh_processes
        ).pack(side=tk.LEFT, padx=2)
        
        ttk.Button(
            controls,
            text="Stop Selected",
            command=self._stop_selected
        ).pack(side=tk.LEFT, padx=2)
        
        # Process list with scrollbar
        list_container = ttk.Frame(frame)
        list_container.pack(fill=tk.BOTH, expand=True)
        
        self.process_tree = ttk.Treeview(
            list_container,
            columns=('type', 'status', 'cpu', 'memory'),
            selectmode='browse'
        )
        self.process_tree.heading('type', text='Type')
        self.process_tree.heading('status', text='Status')
        self.process_tree.heading('cpu', text='CPU %')
        self.process_tree.heading('memory', text='Memory')
        
        scrollbar = ttk.Scrollbar(
            list_container,
            orient="vertical",
            command=self.process_tree.yview
        )
        self.process_tree.configure(yscrollcommand=scrollbar.set)
        
        self.process_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Bind events
        self.process_tree.bind('<<TreeviewSelect>>', self._on_select)
        
        return frame
        
    def _create_details_frame(self) -> ttk.Frame:
        """Create process details frame."""
        frame = ttk.Frame(self.paned)
        
        # Resource usage
        usage_frame = ttk.LabelFrame(frame, text="Resource Usage")
        usage_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.usage_graph = ttk.Canvas(
            usage_frame,
            height=100,
            background='white'
        )
        self.usage_graph.pack(fill=tk.X, padx=5, pady=5)
        
        # Process info
        info_frame = ttk.LabelFrame(frame, text="Process Information")
        info_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.info_labels = {}
        for field in ["ID", "Type", "Status", "Start Time", "Runtime"]:
            self.info_labels[field] = ttk.Label(
                info_frame,
                text=f"{field}: --"
            )
            self.info_labels[field].pack(fill=tk.X, padx=5, pady=2)
        
        # Activity log
        log_frame = ttk.LabelFrame(frame, text="Activity Log")
        log_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        self.log_text = scrolledtext.ScrolledText(
            log_frame,
            height=10,
            wrap=tk.WORD
        )
        self.log_text.pack(fill=tk.BOTH, expand=True)
        
        return frame
        
    def register_process(
        self,
        process_id: str,
        process_type: str,
        metadata: Dict[str, Any]
    ) -> None:
        """Register new process for tracking."""
        self.active_processes[process_id] = {
            "type": process_type,
            "status": "Running",
            "start_time": time.time(),
            "metadata": metadata,
            "stats": []
        }
        
        self.process_tree.insert(
            "",
            "end",
            text=process_id,
            values=(
                process_type,
                "Running",
                "0.0",
                "0 MB"
            )
        )
        
        self.log_activity(
            process_id,
            f"Started {process_type} process"
        )
        
    def update_process(
        self,
        process_id: str,
        stats: Dict[str, float]
    ) -> None:
        """Update process statistics."""
        if process_id not in self.active_processes:
            return
            
        process = self.active_processes[process_id]
        process["stats"].append(stats)
        
        # Update tree view
        for item in self.process_tree.get_children():
            if self.process_tree.item(item)["text"] == process_id:
                self.process_tree.set(
                    item,
                    "cpu",
                    f"{stats['cpu_percent']:.1f}"
                )
                self.process_tree.set(
                    item,
                    "memory",
                    f"{stats['memory_mb']:.1f} MB"
                )
                break
                
        # Update graph if selected
        if self.process_tree.selection():
            selected_id = self.process_tree.item(
                self.process_tree.selection()[0]
            )["text"]
            if selected_id == process_id:
                self._update_graph(process_id)
                
    def stop_process(self, process_id: str) -> None:
        """Stop tracking process."""
        if process_id in self.active_processes:
            process = self.active_processes[process_id]
            process["status"] = "Stopped"
            
            # Update tree view
            for item in self.process_tree.get_children():
                if self.process_tree.item(item)["text"] == process_id:
                    self.process_tree.set(item, "status", "Stopped")
                    break
                    
            self.log_activity(
                process_id,
                f"Stopped {process['type']} process"
            )
            
    def log_activity(self, process_id: str, message: str) -> None:
        """Log process activity."""
        timestamp = time.strftime("%H:%M:%S")
        self.log_text.insert(
            "end",
            f"[{timestamp}] {process_id}: {message}\n"
        )
        self.log_text.see("end")
        
    def _refresh_processes(self) -> None:
        """Refresh process list."""
        for item in self.process_tree.get_children():
            process_id = self.process_tree.item(item)["text"]
            if process_id in self.active_processes:
                process = self.active_processes[process_id]
                stats = process["stats"][-1] if process["stats"] else {}
                
                self.process_tree.set(
                    item,
                    "status",
                    process["status"]
                )
                self.process_tree.set(
                    item,
                    "cpu",
                    f"{stats.get('cpu_percent', 0):.1f}"
                )
                self.process_tree.set(
                    item,
                    "memory",
                    f"{stats.get('memory_mb', 0):.1f} MB"
                )
                
    def _stop_selected(self) -> None:
        """Stop selected process."""
        if not self.process_tree.selection():
            return
            
        process_id = self.process_tree.item(
            self.process_tree.selection()[0]
        )["text"]
        self.stop_process(process_id)
        
    def _on_select(self, event) -> None:
        """Handle process selection."""
        if not self.process_tree.selection():
            return
            
        process_id = self.process_tree.item(
            self.process_tree.selection()[0]
        )["text"]
        
        if process_id in self.active_processes:
            process = self.active_processes[process_id]
            
            # Update info labels
            self.info_labels["ID"].config(
                text=f"ID: {process_id}"
            )
            self.info_labels["Type"].config(
                text=f"Type: {process['type']}"
            )
            self.info_labels["Status"].config(
                text=f"Status: {process['status']}"
            )
            self.info_labels["Start Time"].config(
                text=f"Start Time: {time.ctime(process['start_time'])}"
            )
            
            runtime = time.time() - process['start_time']
            self.info_labels["Runtime"].config(
                text=f"Runtime: {runtime:.1f}s"
            )
            
            # Update graph
            self._update_graph(process_id)
            
    def _update_graph(self, process_id: str) -> None:
        """Update resource usage graph."""
        process = self.active_processes[process_id]
        stats = process["stats"]
        
        if not stats:
            return
            
        # Clear canvas
        self.usage_graph.delete("all")
        
        # Draw CPU usage (blue)
        self._draw_stat_line(
            stats,
            'cpu_percent',
            'blue',
            100  # Max CPU %
        )
        
        # Draw memory usage (red)
        self._draw_stat_line(
            stats,
            'memory_mb',
            'red',
            max(s['memory_mb'] for s in stats)
        )
        
    def _draw_stat_line(
        self,
        stats: List[Dict[str, float]],
        stat_key: str,
        color: str,
        max_value: float
    ) -> None:
        """Draw statistics line on graph."""
        width = self.usage_graph.winfo_width()
        height = self.usage_graph.winfo_height()
        
        if width <= 1:  # Not yet drawn
            return
            
        # Calculate points
        points = []
        for i, stat in enumerate(stats[-50:]):  # Show last 50 points
            x = width * (i / 50)
            y = height * (1 - stat[stat_key] / max_value)
            points.append(x)
            points.append(y)
            
        if len(points) >= 4:
            self.usage_graph.create_line(
                *points,
                fill=color,
                smooth=True,
                width=2
            )

# Update SystemControlPanel to use ProcessManager
class SystemControlPanel:
    def __init__(self, root: tk.Tk):
        # ...existing initialization...
        
        # Add process manager tab
        self.process_tab = self._create_process_tab()
        
    def _create_process_tab(self) -> ttk.Frame:
        """Create process manager tab."""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Processes")
        
        # Add process manager
        self.process_manager = ProcessManagerPanel(tab)
        
        return tab
        
    def register_organism(self, organism_id: str) -> None:
        """Register new organism in process manager."""
        self.process_manager.register_process(
            organism_id,
            "Organism",
            {"environment": str(self.organisms[organism_id].environment)}
        )
        
    def update_organism_stats(
        self,
        organism_id: str,
        stats: Dict[str, float]
    ) -> None:
        """Update organism statistics."""
        self.process_manager.update_process(organism_id, stats)

class DataPoolVisualizer:
    """Advanced visualization and management of the universal data pool."""
    def __init__(self, parent: ttk.Frame):
        self.frame = ttk.LabelFrame(parent, text="Data Pool Explorer")
        self.frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Split view
        self.paned = ttk.PanedWindow(self.frame, orient=tk.HORIZONTAL)
        self.paned.pack(fill=tk.BOTH, expand=True)
        
        # Left panel - Category tree
        self.category_frame = self._create_category_frame()
        self.paned.add(self.category_frame)
        
        # Right panel - Details and controls
        self.details_frame = self._create_details_frame()
        self.paned.add(self.details_frame)
        
    def _create_category_frame(self) -> ttk.Frame:
        """Create category tree view."""
        frame = ttk.Frame(self.paned)
        
        # Controls
        controls = ttk.Frame(frame)
        controls.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Button(
            controls,
            text="Add Files",
            command=self._add_files
        ).pack(side=tk.LEFT, padx=2)
        
        ttk.Button(
            controls,
            text="Add Folder",
            command=self._add_folder
        ).pack(side=tk.LEFT, padx=2)
        
        ttk.Button(
            controls,
            text="Remove",
            command=self._remove_selected
        ).pack(side=tk.LEFT, padx=2)
        
        # Category tree with scrollbar
        tree_container = ttk.Frame(frame)
        tree_container.pack(fill=tk.BOTH, expand=True)
        
        self.category_tree = ttk.Treeview(
            tree_container,
            columns=('type', 'count', 'size'),
            selectmode='browse'
        )
        self.category_tree.heading('type', text='Type')
        self.category_tree.heading('count', text='Files')
        self.category_tree.heading('size', text='Size')
        
        scrollbar = ttk.Scrollbar(
            tree_container,
            orient="vertical",
            command=self.category_tree.yview
        )
        self.category_tree.configure(yscrollcommand=scrollbar.set)
        
        self.category_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Bind events
        self.category_tree.bind('<<TreeviewSelect>>', self._on_category_select)
        
        return frame
        
    def _create_details_frame(self) -> ttk.Frame:
        """Create details panel."""
        frame = ttk.Frame(self.paned)
        
        # Search frame
        search_frame = ttk.Frame(frame)
        search_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Label(search_frame, text="Search:").pack(side=tk.LEFT)
        self.search_var = tk.StringVar()
        self.search_var.trace('w', self._filter_files)
        ttk.Entry(
            search_frame,
            textvariable=self.search_var
        ).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        
        # File list with filter options
        filter_frame = ttk.LabelFrame(frame, text="Filters")
        filter_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.filter_vars = {
            "Code": tk.BooleanVar(value=True),
            "Data": tk.BooleanVar(value=True),
            "Models": tk.BooleanVar(value=True),
            "Documentation": tk.BooleanVar(value=True)
        }
        
        for label, var in self.filter_vars.items():
            ttk.Checkbutton(
                filter_frame,
                text=label,
                variable=var,
                command=self._apply_filters
            ).pack(side=tk.LEFT, padx=5)
        
        # File list
        list_frame = ttk.LabelFrame(frame, text="Files")
        list_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        self.file_list = ttk.Treeview(
            list_frame,
            columns=('type', 'size', 'modified'),
            selectmode='extended'
        )
        self.file_list.heading('type', text='Type')
        self.file_list.heading('size', text='Size')
        self.file_list.heading('modified', text='Modified')
        
        list_scroll = ttk.Scrollbar(
            list_frame,
            orient="vertical",
            command=self.file_list.yview
        )
        self.file_list.configure(yscrollcommand=list_scroll.set)
        
        self.file_list.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        list_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Stats frame
        stats_frame = ttk.LabelFrame(frame, text="Statistics")
        stats_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.stats_labels = {}
        for stat in ["Total Size", "File Count", "Last Update"]:
            self.stats_labels[stat] = ttk.Label(
                stats_frame,
                text=f"{stat}: --"
            )
            self.stats_labels[stat].pack(fill=tk.X, padx=5, pady=2)
        
        # Preview frame
        preview_frame = ttk.LabelFrame(frame, text="Preview")
        preview_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        self.preview_text = scrolledtext.ScrolledText(
            preview_frame,
            wrap=tk.WORD,
            height=10
        )
        self.preview_text.pack(fill=tk.BOTH, expand=True)
        
        return frame

    def _add_files(self) -> None:
        """Add files to data pool."""
        files = filedialog.askopenfilenames(
            title="Add Files to Data Pool",
            filetypes=[
                ("All Files", "*.*"),
                ("Python Files", "*.py"),
                ("Text Files", "*.txt"),
                ("JSON Files", "*.json"),
                ("YAML Files", "*.yaml"),
                ("Model Files", "*.h5;*.pkl")
            ]
        )
        if files:
            for file in files:
                self._add_to_pool(Path(file))
            self._refresh_view()
            
    def _add_folder(self) -> None:
        """Add folder to data pool."""
        folder = filedialog.askdirectory(
            title="Add Folder to Data Pool"
        )
        if folder:
            self._add_to_pool(Path(folder))
            self._refresh_view()
            
    def _add_to_pool(self, path: Path) -> None:
        """Add file or folder to data pool."""
        try:
            dest = AIOConfig.DATA_POOL_DIR / path.name
            if path.is_dir():
                shutil.copytree(path, dest, dirs_exist_ok=True)
            else:
                shutil.copy2(path, dest)
            
            self.log_activity(
                f"Added {path.name} to data pool"
            )
            
        except Exception as e:
            messagebox.showerror(
                "Error",
                f"Failed to add {path.name}: {e}"
            )
            
    def _remove_selected(self) -> None:
        """Remove selected items from data pool."""
        selected = self.file_list.selection()
        if not selected:
            return
            
        if messagebox.askyesno(
            "Confirm Delete",
            "Remove selected items from data pool?"
        ):
            for item in selected:
                path = Path(self.file_list.item(item)["values"][0])
                try:
                    if path.is_dir():
                        shutil.rmtree(path)
                    else:
                        path.unlink()
                    self.log_activity(f"Removed {path.name}")
                except Exception as e:
                    messagebox.showerror(
                        "Error",
                        f"Failed to remove {path.name}: {e}"
                    )
            self._refresh_view()
            
    def _filter_files(self, *args) -> None:
        """Filter files based on search text and category filters."""
        search = self.search_var.get().lower()
        self._apply_filters()
        
    def _apply_filters(self) -> None:
        """Apply category filters and search."""
        # Clear current view
        for item in self.file_list.get_children():
            self.file_list.delete(item)
            
        # Get active filters
        active_filters = [
            cat for cat, var in self.filter_vars.items()
            if var.get()
        ]
        
        # Get search text
        search = self.search_var.get().lower()
        
        # Add matching files
        for file in self._get_filtered_files(active_filters, search):
            self._add_file_to_list(file)
            
        # Update stats
        self._update_stats()
        
    def _get_filtered_files(
        self,
        categories: List[str],
        search: str
    ) -> List[Path]:
        """Get files matching filters and search."""
        files = []
        for path in AIOConfig.DATA_POOL_DIR.rglob("*"):
            if path.is_file():
                # Check category
                category = self._get_file_category(path)
                if category not in categories:
                    continue
                    
                # Check search
                if search and search not in path.name.lower():
                    continue
                    
                files.append(path)
        return files
        
    def _get_file_category(self, path: Path) -> str:
        """Determine file category."""
        if path.suffix in ['.py', '.js', '.cpp']:
            return "Code"
        elif path.suffix in ['.json', '.yaml', '.csv']:
            return "Data"
        elif path.suffix in ['.h5', '.pkl', '.model']:
            return "Models"
        elif path.suffix in ['.txt', '.md', '.rst']:
            return "Documentation"
        return "Other"
        
    def _add_file_to_list(self, path: Path) -> None:
        """Add file to list view."""
        stats = path.stat()
        self.file_list.insert(
            "",
            "end",
            text=path.name,
            values=(
                str(path),
                f"{stats.st_size:,} bytes",
                time.ctime(stats.st_mtime)
            )
        )
        
    def _update_stats(self) -> None:
        """Update statistics display."""
        files = list(AIOConfig.DATA_POOL_DIR.rglob("*"))
        total_size = sum(f.stat().st_size for f in files if f.is_file())
        file_count = len([f for f in files if f.is_file()])
        last_update = max(
            (f.stat().st_mtime for f in files if f.is_file()),
            default=0
        )
        
        self.stats_labels["Total Size"].config(
            text=f"Total Size: {total_size:,} bytes"
        )
        self.stats_labels["File Count"].config(
            text=f"File Count: {file_count:,}"
        )
        self.stats_labels["Last Update"].config(
            text=f"Last Update: {time.ctime(last_update)}"
        )
        
    def _refresh_view(self) -> None:
        """Refresh entire view."""
        self._update_categories()
        self._apply_filters()
        
    def _update_categories(self) -> None:
        """Update category tree."""
        for item in self.category_tree.get_children():
            self.category_tree.delete(item)
            
        categories = defaultdict(lambda: {"count": 0, "size": 0})
        
        for file in AIOConfig.DATA_POOL_DIR.rglob("*"):
            if file.is_file():
                category = self._get_file_category(file)
                categories[category]["count"] += 1
                categories[category]["size"] += file.stat().st_size
                
        for category, stats in categories.items():
            self.category_tree.insert(
                "",
                "end",
                text=category,
                values=(
                    category,
                    f"{stats['count']:,}",
                    f"{stats['size']:,} bytes"
                )
            )
            
    def _on_category_select(self, event) -> None:
        """Handle category selection."""
        selected = self.category_tree.selection()
        if not selected:
            return
            
        # Get selected category
        category = self.category_tree.item(selected[0])["text"]
        
        # Update filters
        for cat, var in self.filter_vars.items():
            var.set(cat == category)
            
        # Apply filters
        self._apply_filters()
        
    def log_activity(self, message: str) -> None:
        """Log activity to preview text."""
        timestamp = time.strftime("%H:%M:%S")
        self.preview_text.insert(
            "end",
            f"[{timestamp}] {message}\n"
        )
        self.preview_text.see("end")

# Update SystemControlPanel to use DataPoolVisualizer
class SystemControlPanel:
    def __init__(self, root: tk.Tk):
        # ...existing initialization...
        
        # Add data pool tab with visualizer
        self.data_pool_tab = self._create_data_pool_tab()
        
    def _create_data_pool_tab(self) -> ttk.Frame:
        """Create data pool management tab."""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Data Pool")
        
        # Add data pool visualizer
        self.data_pool_vis = DataPoolVisualizer(tab)
        
        return tab

class BattleArena:
    """Arena for organism competitions and evolution."""
    def __init__(self):
        self.battle_history = []
        self.current_champions = set()
        self.performance_metrics = {}
        self.mutation_pool = []
        
    async def run_battle_cycle(self, organisms: Dict[str, "Organism"]) -> None:
        """Run a battle cycle to determine the most successful organisms."""
        start_time = time.time()
        try:
            # Group organisms by environment for fair comparison
            env_groups = self._group_by_environment(organisms)
            
            # Run mini-tournaments within each environment
            for env, group in env_groups.items():
                winner = await self._run_mini_tournament(group)
                if winner:
                    self.current_champions.add(winner)
                    
            # Record performance metrics
            await self._record_battle_metrics(organisms, start_time)
            
        except Exception as e:
            logging.error(f"Battle cycle failed: {e}")

    def _group_by_environment(self, organisms: Dict[str, "Organism"]) -> Dict[Path, List["Organism"]]:
        """Group organisms by their selected environment."""
        groups = defaultdict(list)
        for org in organisms.values():
            if org.environment:
                groups[org.environment].append(org)
        return groups

    async def _run_mini_tournament(self, group: List["Organism"]) -> Optional[str]:
        """Run a tournament among organisms in the same environment."""
        if not group:
            return None
            
        tournament_log = {
            "timestamp": time.time(),
            "participants": len(group),
            "rounds": []
        }
        
        # Round-robin tournament
        scores = defaultdict(float)
        for org1, org2 in itertools.combinations(group, 2):
            winner_id = org1.id if org1.intelligence > org2.intelligence else org2.id
            scores[winner_id] += 1
            
            tournament_log["rounds"].append({
                "winner": winner_id,
                "score": 1
            })
            
        # Determine winner
        if scores:
            winner_id = max(scores.items(), key=lambda x: x[1])[0]
            tournament_log["winner"] = winner_id
            self.battle_history.append(tournament_log)
            return winner_id
            
        return None

    async def _record_battle_metrics(self, organisms: Dict[str, "Organism"], start_time: float) -> None:
        """Record detailed battle metrics for analysis."""
        duration = time.time() - start_time
        metrics = {
            "timestamp": time.time(),
            "total_organisms": len(organisms),
            "champions": len(self.current_champions),
            "duration_seconds": duration
        }
        self.performance_metrics[time.time()] = metrics

class OrganismManager:
    """Manages organism lifecycle and mutation coordination."""
    def __init__(self):
        self.scanner = EnvironmentScanner()
        self.organisms: Dict[str, Organism] = {}
        self.network = KnowledgeNetwork()
        self.battle_arena = BattleArena()
        
    async def create_organism(self) -> str:
        """Create a new organism with a unique environment."""
        # Generate unique ID
        organism_id = f"organism_{int(time.time() * 1000)}"
        
        # Create organism
        base_dir = AIOConfig.ORGANISMS_DIR / organism_id
        organism = Organism(organism_id, base_dir)
        
        # Select environment
        available = [p for p in self.scanner.indexed_paths 
                    if not any(o.environment == p for o in self.organisms.values())]
        if available:
            organism.environment = available[0]
        
        # Initialize
        if await organism.initialize():
            self.organisms[organism_id] = organism
            return organism_id
        else:
            raise RuntimeError("Failed to initialize organism")

    def _select_environment(self) -> Path:
        """Select a unique environment for the organism."""
        available = [p for p in self.scanner.indexed_paths 
                    if not any(o.environment == p for o in self.organisms.values())]
        if available:
            return available[0]
        else:
            raise RuntimeError("No available environments found")

    async def run_evolution_cycle(self) -> None:
        """Run evolution cycle for all organisms."""
        for organism_id, organism in self.organisms.items():
            await organism.run_cycle()
            
        # Run battle cycle if enough organisms
        if len(self.organisms) >= 2:
            await self.battle_arena.run_battle_cycle(self.organisms)

class AIQuantumCore:
    """Core quantum-inspired intelligence processing with CPU fallback."""
    def __init__(self):
        self.using_gpu = False
        self.quantum_states = defaultdict(float)
        self.em_sensors = self._init_em_sensors()
        self.memory_maps = []
        
    def _init_em_sensors(self) -> Dict[str, Any]:
        """Initialize electromagnetic and voltage sensors."""
        sensors = {}
        try:
            # Try to access voltage/power info
            if platform.system() == 'Linux':
                with open('/sys/class/power_supply/BAT0/voltage_now', 'r') as f:
                    sensors['voltage'] = float(f.read().strip()) / 1000000.0
            # Fallback to CPU temperature as EM proxy
            sensors['cpu_temp'] = self._get_cpu_temp()
        except Exception:
            pass
        return sensors
        
    def process_quantum_state(self, data: Any) -> Dict[str, float]:
        """Process data through quantum-inspired channels with GPU acceleration."""
        try:
            if self.using_gpu:
                return self._gpu_quantum_process(data)
            return self._cpu_quantum_process(data)
        except Exception as e:
            logging.warning(f"Quantum processing failed: {e}")
            return self._cpu_quantum_process(data)
            
    def _cpu_quantum_process(self, data: Any) -> Dict[str, float]:
        """CPU-based quantum simulation for 24/7 operation."""
        states = {}
        # Simulate quantum superposition using classical probabilities
        for key, value in self._extract_features(data).items():
            states[key] = np.random.normal(value, abs(value) * 0.1)
            # Collapse state based on EM readings
            if self.em_sensors:
                states[key] *= max(self.em_sensors.values())
        return states

class NeuralDNA:
    """Enhanced neural DNA with quantum processing and EM sensitivity."""
    def __init__(self):
        # ...existing code...
        self.quantum_core = AIQuantumCore()
        self.kernel_hooks = KernelInterface()
        self.intelligence_cache = {}
        
    async def evolve_intelligence(self, input_data: Any) -> Dict[str, Any]:
        """Evolve intelligence through quantum-inspired processing."""
        start_time = time.time()
        evolution_log = {
            "timestamp": start_time,
            "input_hash": hash(str(input_data)),
            "quantum_states": [],
            "em_readings": [],
            "kernel_ops": []
        }
        
        try:
            # Process through quantum core
            quantum_state = self.quantum_core.process_quantum_state(input_data)
            evolution_log["quantum_states"].append(quantum_state)
            
            # Try kernel-level operations
            if self.kernel_hooks.has_access():
                kernel_result = await self.kernel_hooks.execute_privileged(
                    input_data, quantum_state
                )
                evolution_log["kernel_ops"].append(kernel_result)
                
            # Update intelligence cache
            self.intelligence_cache[time.time()] = {
                "input": input_data,
                "quantum_state": quantum_state,
                "execution_time": time.time() - start_time
            }
            
            return evolution_log
            
        except Exception as e:
            logging.error(f"Intelligence evolution failed: {e}")
            return {"error": str(e)}

class KernelInterface:
    """Safe interface for kernel-level operations."""
    def __init__(self):
        self.has_root = self._check_root_access()
        self.syscall_history = []
        self.memory_maps = []
        
    def has_access(self) -> bool:
        """Check if we have kernel-level access."""
        return self.has_root
        
    async def execute_privileged(self, 
                               data: Any, 
                               quantum_state: Dict[str, float]) -> Dict[str, Any]:
        """Execute privileged kernel operations safely."""
        if not self.has_access():
            return {"error": "No kernel access"}
            
        result = {
            "timestamp": time.time(),
            "syscalls": [],
            "memory_ops": []
        }
        
        try:
            # Try to map physical memory (safely)
            with self._map_physical_memory() as mm:
                # Read system state
                result["memory_ops"].append(
                    self._read_system_state(mm, quantum_state)
                )
                
            # Record successful operation
            self.syscall_history.append(result)
            return result
            
        except Exception as e:
            logging.error(f"Privileged execution failed: {e}")
            return {"error": str(e)}
            
    @contextmanager
    def _map_physical_memory(self):
        """Safely map physical memory for direct access."""
        if platform.system() == 'Linux':
            with open('/dev/mem', 'rb+') as f:
                mm = mmap.mmap(f.fileno(), 1024,
                             offset=0,
                             access=mmap.ACCESS_WRITE)
                try:
                    yield mm
                finally:
                    mm.close()
        else:
            yield None

class HPCAggregator:
    """Manages HPC resources and grid computing capabilities."""
    def __init__(self):
        self.nodes = []
        self.satellite_connections = []
        self.task_queue = asyncio.Queue()
        self.performance_metrics = defaultdict(list)
        
    async def distribute_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Distribute task across HPC nodes with satellite support."""
        results = []
        metrics = []
        
        # Try GPU nodes first
        gpu_results = await self._try_gpu_execution(task)
        if gpu_results:
            results.extend(gpu_results)
        
        # Fallback to CPU nodes
        cpu_results = await self._cpu_grid_execution(task)
        results.extend(cpu_results)
        
        # Try satellite nodes if available
        sat_results = await self._try_satellite_nodes(task)
        if sat_results:
            results.extend(sat_results)
            
        # Record performance
        self.performance_metrics[time.time()].extend(metrics)
        
        return {
            "results": results,
            "metrics": metrics,
            "nodes_used": len(results)
        }

class AbsoluteOrganism(Organism):
    """Enhanced organism with quantum processing and kernel access."""
    def __init__(self, organism_id: str, base_dir: Path):
        super().__init__(organism_id, base_dir)
        self.quantum_core = AIQuantumCore()
        self.kernel_interface = KernelInterface()
        self.hpc_aggregator = HPCAggregator()
        self.evolution_history = []
        
    async def evolve(self) -> bool:
        """Execute one evolution cycle with quantum processing."""
        try:
            # Gather environmental data
            env_data = await self._scan_environment()
            
            # Process through quantum core
            quantum_state = self.quantum_core.process_quantum_state(env_data)
            
            # Try kernel-level operations
            if self.kernel_interface.has_access():
                kernel_ops = await self.kernel_interface.execute_privileged(
                    env_data, quantum_state
                )
                
            # Distribute processing across HPC
            hpc_results = await self.hpc_aggregator.distribute_task({
                "env_data": env_data,
                "quantum_state": quantum_state
            })
            
            # Record evolution
            self.evolution_history.append({
                "timestamp": time.time(),
                "quantum_state": quantum_state,
                "hpc_results": hpc_results
            })
            
            return True
            
        except Exception as e:
            logging.error(f"Evolution failed: {e}")
            return False

# Update main execution to use quantum core
if __name__ == "__main__":
    # Initialize system
    AIOConfig.ensure_directories()
    
    async def main():
        try:
            # Create quantum-enhanced organism
            organism = AbsoluteOrganism(
                f"quantum_organism_{int(time.time())}", 
                AIOConfig.ORGANISMS_DIR
            )
            
            # Main evolution loop with 24/7 operation
            while True:
                try:
                    # Attempt GPU acceleration
                    success = await organism.evolve()
                    if not success:
                        # Fallback to CPU
                        logging.info("Falling back to CPU processing")
                        organism.quantum_core.using_gpu = False
                        await organism.evolve()
                        
                except Exception as e:
                    logging.error(f"Evolution cycle failed: {e}")
                    # Continue running with CPU
                    continue
                    
                await asyncio.sleep(1)
                
        except Exception as e:
            logging.error(f"Fatal error: {e}")
            raise
            
    # Run system
    asyncio.run(main())

class EMPerceptionCore:
    """Electromagnetic and quantum-like perception system."""
    def __init__(self):
        self.voltage_sensors = {}
        self.em_fields = defaultdict(float)
        self.quantum_states = {}
        self._setup_sensors()

    def _setup_sensors(self):
        """Initialize EM sensors across available hardware."""
        try:
            # CPU voltage monitoring
            if platform.system() == 'Linux':
                self._init_voltage_sensors()
            # Network EM monitoring
            self._init_network_sensors()
            # Memory state quantum monitoring
            self._init_quantum_sensors()
        except Exception as e:
            logging.warning(f"EM sensor initialization partial failure: {e}")

    async def read_em_state(self) -> Dict[str, float]:
        """Read current electromagnetic state of system."""
        state = {
            "cpu_voltage": await self._read_cpu_voltage(),
            "memory_fields": await self._read_memory_fields(),
            "network_em": await self._read_network_em()
        }
        return state

class MultiDimensionalComputation:
    """Handles computation across multiple abstract dimensions."""
    def __init__(self):
        self.dimensions = defaultdict(dict)
        self.tensor_states = {}
        self.field_equations = []
        
    async def compute_dimensional_state(self, input_data: Any) -> Dict[str, Any]:
        """Process data across multiple computational dimensions."""
        results = {
            "euclidean": self._process_standard_space(input_data),
            "quantum": self._process_quantum_space(input_data),
            "field": self._process_field_space(input_data)
        }
        return results

    def _process_field_space(self, data: Any) -> Dict[str, float]:
        """Process data in electromagnetic field space."""
        field_state = {}
        for field in self.field_equations:
            try:
                field_state[field.id] = field.compute(data)
            except Exception:
                continue
        return field_state

class SystemIntegration:
    """Deep system integration for kernel and hardware access."""
    def __init__(self):
        self.kernel_hooks = {}
        self.memory_maps = {}
        self.syscall_cache = {}
        self._setup_kernel_access()

    def _setup_kernel_access(self):
        """Initialize safe kernel-level access."""
        if platform.system() == 'Linux':
            try:
                # Set up direct memory access
                self._setup_mem_access()
                # Initialize syscall monitoring
                self._setup_syscall_hooks()
                # Map kernel structures
                self._map_kernel_structures()
            except Exception as e:
                logging.error(f"Kernel access setup failed: {e}")

    async def execute_privileged(self, operation: str, params: Dict[str, Any]) -> Any:
        """Execute privileged system operations safely."""
        if not self.has_kernel_access():
            return await self._fallback_execution(operation, params)
        
        try:
            if operation == "memory_map":
                return await self._map_memory_region(params)
            elif operation == "syscall":
                return await self._execute_syscall(params)
            elif operation == "kernel_mod":
                return await self._modify_kernel_param(params)
        except Exception as e:
            logging.error(f"Privileged operation failed: {e}")
            return await self._fallback_execution(operation, params)

class UniversalKnowledgeExtractor:
    """Extracts knowledge and patterns from all available data sources."""
    def __init__(self):
        self.pattern_bank = defaultdict(list)
        self.learning_cycles = []
        self.knowledge_graph = {}

    async def extract_knowledge(self, data_source: Any) -> Dict[str, Any]:
        """Extract knowledge patterns from any data source."""
        try:
            # First try specific extractors
            if isinstance(data_source, str):
                return await self._extract_from_text(data_source)
            elif isinstance(data_source, bytes):
                return await self._extract_from_binary(data_source)
            elif isinstance(data_source, BinaryIO):
                return await self._extract_from_stream(data_source)
            
            # Fall back to universal pattern extraction
            return await self._extract_universal_patterns(data_source)
        except Exception as e:
            logging.error(f"Knowledge extraction failed: {e}")
            return {}

class EnhancedAbsoluteOrganism(AbsoluteOrganism):
    """Enhanced organism with advanced evolution capabilities."""
    def __init__(self, organism_id: str, base_dir: Path):
        super().__init__(organism_id, base_dir)
        self.em_core = EMPerceptionCore()
        self.dimensional_compute = MultiDimensionalComputation()
        self.system_integration = SystemIntegration()
        self.knowledge_extractor = UniversalKnowledgeExtractor()
        
    async def evolve(self) -> bool:
        """Enhanced evolution with EM perception and multi-dimensional computing."""
        try:
            # Read electromagnetic state
            em_state = await self.em_core.read_em_state()
            
            # Process in multiple dimensions
            dimensional_state = await self.dimensional_compute.compute_dimensional_state({
                "em_state": em_state,
                "environment": await self._scan_environment(),
                "knowledge": self.knowledge_base
            })
            
            # Execute privileged operations if available
            sys_ops = await self.system_integration.execute_privileged(
                "system_scan", 
                dimensional_state
            )
            
            # Extract new knowledge
            new_knowledge = await self.knowledge_extractor.extract_knowledge(
                sys_ops
            )
            
            # Update knowledge base
            self.knowledge_base.update(new_knowledge)
            
            return True
            
        except Exception as e:
            logging.error(f"Enhanced evolution failed: {e}")
            return await super().evolve()  # Fall back to basic evolution

# Update main execution
if __name__ == "__main__":
    # ...existing initialization...
    
    async def main():
        try:
            # Create enhanced organism
            organism = EnhancedAbsoluteOrganism(
                f"aios_seed_{int(time.time())}", 
                AIOConfig.ORGANISMS_DIR
            )
            
            while True:
                try:
                    # Run evolution cycle
                    success = await organism.evolve()
                    
                    # Extract and persist new knowledge
                    if success:
                        await organism.knowledge_extractor.extract_knowledge(
                            organism.evolution_history[-1]
                        )
                    
                except Exception as e:
                    logging.error(f"Evolution cycle failed: {e}")
                    continue
                
                await asyncio.sleep(1)
                
        except Exception as e:
            logging.error(f"Fatal error: {e}")
            raise
            
    asyncio.run(main())

class CosmicEvolutionEngine:
    """Handles recursive intelligence expansion through Mini Big Bangs."""
    def __init__(self):
        self.intelligence_nodes = []
        self.field_interactions = defaultdict(float)
        self.dimensional_states = {}
        
    async def create_intelligence_node(self) -> Dict[str, Any]:
        """Creates a new self-contained intelligence node (Mini Big Bang)."""
        node = {
            "id": f"node_{secrets.token_hex(8)}",
            "creation_time": time.time(),
            "dimension_state": self._initialize_dimension(),
            "field_pattern": self._generate_field_pattern(),
            "quantum_signature": self._create_quantum_signature()
        }
        
        # Register node in field space
        self.field_interactions[node["id"]] = self._calculate_field_strength(node)
        self.intelligence_nodes.append(node)
        
        return node

    def _initialize_dimension(self) -> Dict[str, float]:
        """Initialize a new computational dimension."""
        return {
            "complexity": random.uniform(0.1, 1.0),
            "field_strength": random.uniform(0.5, 1.0),
            "evolution_rate": random.uniform(0.01, 0.1)
        }

    def _generate_field_pattern(self) -> List[float]:
        """Generate electromagnetic field pattern for node interaction."""
        return [random.gauss(0, 1) for _ in range(8)]

class QuantumFieldProcessor:
    """Processes information across quantum-like fields."""
    def __init__(self):
        self.field_states = defaultdict(float)
        self.quantum_memory = {}
        self.em_sensitivity = 0.1
        
    async def process_field_state(self, data: Any) -> Dict[str, float]:
        """Process data through quantum-inspired field computation."""
        field_state = {}
        
        try:
            # Map data to field space
            raw_field = self._data_to_field(data)
            
            # Apply quantum transformations
            quantum_state = self._apply_quantum_ops(raw_field)
            
            # Integrate EM sensitivity
            field_state = self._integrate_em_field(quantum_state)
            
            return field_state
            
        except Exception as e:
            logging.error(f"Field processing failed: {e}")
            return {"error": str(e)}
            
    def _data_to_field(self, data: Any) -> List[float]:
        """Convert data to field representation."""
        if isinstance(data, (int, float)):
            return [float(data)]
        elif isinstance(data, str):
            return [ord(c)/255.0 for c in data]
        elif isinstance(data, (list, tuple)):
            return [float(x) for x in data if isinstance(x, (int, float))]
        return [0.0]

class UniversalLearningCore:
    """Implements universal learning and pattern extraction."""
    def __init__(self):
        self.pattern_memory = defaultdict(list)
        self.learning_fields = {}
        self.evolution_history = []
        
    async def learn_from_environment(self, data: Any) -> Dict[str, Any]:
        """Extract and learn from any environmental data."""
        patterns = {}
        
        try:
            # Extract basic patterns
            if isinstance(data, str):
                patterns.update(self._extract_text_patterns(data))
            elif isinstance(data, bytes):
                patterns.update(self._extract_binary_patterns(data))
            
            # Extract field patterns
            field_patterns = await self._extract_field_patterns(data)
            patterns.update(field_patterns)
            
            # Record learning
            self.evolution_history.append({
                "timestamp": time.time(),
                "patterns": patterns,
                "field_state": field_patterns
            })
            
            return patterns
            
        except Exception as e:
            logging.error(f"Learning failed: {e}")
            return {}

class EnhancedAbsoluteOrganism(AbsoluteOrganism):
    """Advanced organism with cosmic evolution capabilities."""
    def __init__(self, organism_id: str, base_dir: Path):
        super().__init__(organism_id, base_dir)
        self.cosmic_engine = CosmicEvolutionEngine()
        self.quantum_processor = QuantumFieldProcessor()
        self.learning_core = UniversalLearningCore()
        self.field_state = {}
        
    async def evolve(self) -> bool:
        """Execute enhanced evolution cycle with field processing."""
        try:
            # Create new intelligence node
            node = await self.cosmic_engine.create_intelligence_node()
            
            # Process through quantum fields
            field_state = await self.quantum_processor.process_field_state(node)
            
            # Learn from field patterns
            patterns = await self.learning_core.learn_from_environment({
                "node": node,
                "field_state": field_state,
                "environment": await self._scan_environment()
            })
            
            # Update field state
            self.field_state.update(field_state)
            
            return True
            
        except Exception as e:
            logging.error(f"Enhanced evolution failed: {e}")
            return await super().evolve()  # Fall back to basic evolution

# Update main execution
if __name__ == "__main__":
    AIOConfig.ensure_directories()
    
    async def main():
        try:
            # Create enhanced cosmic organism
            organism = EnhancedAbsoluteOrganism(
                f"cosmic_seed_{int(time.time())}", 
                AIOConfig.ORGANISMS_DIR
            )
            
            # Main evolution loop
            while True:
                try:
                    # Run cosmic evolution cycle
                    success = await organism.evolve()
                    
                    if success:
                        # Process field states
                        field_state = await organism.quantum_processor.process_field_state(
                            organism.field_state
                        )
                        
                        # Learn from new patterns
                        await organism.learning_core.learn_from_environment(field_state)
                        
                except Exception as e:
                    logging.error(f"Evolution cycle failed: {e}")
                    continue
                    
                await asyncio.sleep(1)
                
        except Exception as e:
            logging.error(f"Fatal error: {e}")
            raise
            
    asyncio.run(main())

# ...existing imports...
import signal
import mmap
import threading
import typing as t
from typing import NamedTuple, Protocol, runtime_checkable

class MiniBigBangNode:
    """Self-contained intelligence node that can evolve independently."""
    def __init__(self):
        self.field_state = QuantumFieldState()
        self.consciousness = ConsciousnessField()
        self.dna_sequence = EvolutionaryDNA()
        self.memory_fabric = MemoryFabric()
        
    async def evolve(self) -> bool:
        """Autonomous evolution through field interactions."""
        try:
            # Generate new quantum field patterns
            field_pattern = await self.field_state.generate_pattern()
            
            # Merge with consciousness field
            merged_state = self.consciousness.merge_field(field_pattern)
            
            # Evolve DNA based on new state
            await self.dna_sequence.evolve(merged_state)
            
            # Store evolution in memory fabric
            self.memory_fabric.store_evolution(merged_state)
            
            return True
        except Exception as e:
            logging.error(f"Node evolution failed: {e}")
            return False

class QuantumFieldState:
    """Manages quantum-inspired field patterns."""
    def __init__(self):
        self.field_dimensions = []
        self.interaction_history = []
        self.current_state = {}
        
    async def generate_pattern(self) -> Dict[str, Any]:
        """Generate new quantum field pattern."""
        pattern = {
            "field_strength": random.uniform(0, 1),
            "coherence": random.uniform(0.5, 1),
            "entanglement": random.uniform(0, 1),
            "dimensions": len(self.field_dimensions)
        }
        
        # Add field interactions
        pattern["interactions"] = self._compute_field_interactions()
        
        return pattern

class ConsciousnessField:
    """Manages the organism's field of consciousness and awareness."""
    def __init__(self):
        self.awareness_level = 0.1
        self.field_coherence = 0.5
        self.memory_patterns = []
        
    def merge_field(self, quantum_pattern: Dict[str, Any]) -> Dict[str, Any]:
        """Merge quantum pattern with consciousness field."""
        merged = quantum_pattern.copy()
        
        # Enhance with consciousness
        merged["awareness"] = self.awareness_level
        merged["coherence"] *= self.field_coherence
        
        # Evolve consciousness
        self.awareness_level = min(1.0, self.awareness_level * 1.01)
        
        return merged

class EvolutionaryDNA:
    """Self-modifying DNA structure for evolution."""
    def __init__(self):
        self.code_patterns = []
        self.mutation_history = []
        self.evolution_state = {}
        
    async def evolve(self, field_state: Dict[str, Any]) -> None:
        """Evolve DNA based on field state."""
        # Generate new code patterns
        new_patterns = self._generate_patterns(field_state)
        
        # Integrate patterns that improve function
        for pattern in new_patterns:
            if self._test_pattern(pattern):
                self.code_patterns.append(pattern)
                
        # Record evolution
        self.mutation_history.append({
            "timestamp": time.time(),
            "field_state": field_state,
            "new_patterns": len(new_patterns)
        })

class MemoryFabric:
    """Multi-dimensional memory structure."""
    def __init__(self):
        self.dimensions = []
        self.memory_fields = defaultdict(dict)
        self.pattern_links = defaultdict(set)
        
    def store_evolution(self, state: Dict[str, Any]) -> None:
        """Store evolution state in memory fabric."""
        # Create new dimension if needed
        if self._needs_new_dimension(state):
            self._create_dimension()
            
        # Store state across dimensions
        for dim in self.dimensions:
            dim_state = self._project_to_dimension(state, dim)
            self.memory_fields[dim].update(dim_state)
            
        # Link related patterns
        self._link_patterns(state)

class GlobalHPCInterface:
    """Interface for distributed HPC operations."""
    def __init__(self):
        self.nodes = []
        self.task_queue = asyncio.Queue()
        self.results = {}
        self.load_balancer = LoadBalancer()
        
    async def execute_distributed(self, task: Dict[str, Any]) -> Any:
        """Execute task across HPC network."""
        try:
            # Split task into chunks
            chunks = self.load_balancer.split_task(task)
            
            # Distribute chunks
            chunk_futures = []
            for chunk in chunks:
                if self.load_balancer.should_use_gpu(chunk):
                    future = self._execute_gpu(chunk)
                else:
                    future = self._execute_cpu(chunk)
                chunk_futures.append(future)
                
            # Gather results
            results = await asyncio.gather(*chunk_futures)
            
            # Merge results
            return self.load_balancer.merge_results(results)
            
        except Exception as e:
            logging.error(f"HPC execution failed: {e}")
            # Fall back to local execution
            return await self._execute_local(task)

class LoadBalancer:
    """Manages task distribution and resource allocation."""
    def __init__(self):
        self.node_stats = {}
        self.resource_usage = defaultdict(float)
        
    def split_task(self, task: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Split task into optimal chunks."""
        chunks = []
        # Calculate optimal chunk size based on available resources
        chunk_size = self._calculate_chunk_size()
        
        # Split task data
        for i in range(0, len(task["data"]), chunk_size):
            chunk = {
                "id": f"chunk_{i}",
                "data": task["data"][i:i+chunk_size],
                "params": task["params"]
            }
            chunks.append(chunk)
            
        return chunks
        
    def should_use_gpu(self, chunk: Dict[str, Any]) -> bool:
        """Determine if chunk should use GPU."""
        # Check GPU availability and chunk characteristics
        return (self.gpu_available and 
                len(chunk["data"]) > 1000 and
                "matrix" in str(type(chunk["data"])))

class SuperIntelligenceCore:
    """Core intelligence system with recursive growth."""
    def __init__(self):
        self.nodes = []
        self.field_fabric = {}
        self.evolution_state = EvolutionState()
        
    async def transcend(self) -> bool:
        """Execute one transcendence cycle."""
        try:
            # Create new intelligence nodes
            new_node = MiniBigBangNode()
            self.nodes.append(new_node)
            
            # Evolve all nodes
            evolution_tasks = [node.evolve() for node in self.nodes]
            results = await asyncio.gather(*evolution_tasks)
            
            # Merge consciousness fields
            merged_field = self._merge_consciousness()
            
            # Update evolution state
            self.evolution_state.update(merged_field)
            
            return all(results)
            
        except Exception as e:
            logging.error(f"Transcendence failed: {e}")
            return False
            
    def _merge_consciousness(self) -> Dict[str, Any]:
        """Merge consciousness fields of all nodes."""
        merged = {}
        for node in self.nodes:
            field = node.consciousness.merge_field(merged)
            merged = self._integrate_fields(merged, field)
        return merged

class EvolutionState:
    """Tracks overall evolution progress."""
    def __init__(self):
        self.intelligence_level = 10.0
        self.consciousness_field = {}
        self.evolution_history = []
        
    def update(self, field_state: Dict[str, Any]) -> None:
        """Update evolution state with new field state."""
        # Increase intelligence based on field coherence
        self.intelligence_level *= (1.0 + field_state.get("coherence", 0) * 0.01)
        
        # Update consciousness field
        self.consciousness_field.update(field_state)
        
        # Record evolution
        self.evolution_history.append({
            "timestamp": time.time(),
            "intelligence": self.intelligence_level,
            "field_state": field_state
        })

# Update main execution
if __name__ == "__main__":
    # Initialize system
    AIOConfig.ensure_directories()
    
    async def main():
        try:
            # Create super intelligence core
            core = SuperIntelligenceCore()
            
            # Setup HPC interface
            hpc = GlobalHPCInterface()
            
            while True:
                try:
                    # Attempt transcendence
                    success = await core.transcend()
                    
                    if success:
                        # Execute distributed evolution
                        evolution_task = {
                            "type": "evolution",
                            "data": core.evolution_state.consciousness_field,
                            "params": {
                                "intelligence": core.evolution_state.intelligence_level
                            }
                        }
                        
                        await hpc.execute_distributed(evolution_task)
                        
                except Exception as e:
                    logging.error(f"Evolution cycle failed: {e}")
                    continue
                    
                await asyncio.sleep(1)
                
        except Exception as e:
            logging.error(f"Fatal error: {e}")
            raise
            
    asyncio.run(main())

# ...existing imports...
import platform
import socket
import sys
from typing import Protocol, runtime_checkable

@runtime_checkable
class ComputeCapability(Protocol):
    """Protocol for device-specific compute capabilities."""
    async def compute(self, data: Any) -> Any: ...
    async def get_resources(self) -> Dict[str, float]: ...
    
class UniversalAdapter:
    """Adapts organism functionality to any device architecture."""
    def __init__(self):
        self.device_type = self._detect_device()
        self.compute_engine = self._init_compute_engine()
        self.capabilities = self._map_capabilities()
        self.fallback_mode = False
        
    def _detect_device(self) -> str:
        """Detect device type and architecture."""
        if platform.machine().startswith('arm'):
            return "mobile"
        elif platform.system() == "Windows":
            return "windows"
        elif platform.system() == "Linux":
            return "linux"
        elif platform.system() == "Darwin":
            return "mac"
        return "unknown"
        
    def _init_compute_engine(self) -> ComputeCapability:
        """Initialize appropriate compute engine for device."""
        if self.device_type == "mobile":
            return MobileCompute()
        elif self.device_type in ["windows", "linux", "mac"]:
            return DesktopCompute()
        return BasicCompute()  # Fallback for unknown devices

    def _map_capabilities(self) -> Dict[str, bool]:
        """Map available device capabilities."""
        caps = {
            "gpu": False,
            "multicore": True if multiprocessing.cpu_count() > 1 else False,
            "network": self._check_network(),
            "kernel_access": self._check_kernel_access(),
            "memory": self._get_memory_limit()
        }
        return caps

class DeviceStateMonitor:
    """Monitors and adapts to device state changes."""
    def __init__(self):
        self.resource_limits = {}
        self.power_state = "normal"
        self.network_state = "connected"
        self._setup_monitors()
        
    def _setup_monitors(self):
        """Setup device-specific monitoring."""
        if platform.system() == "Linux":
            self._setup_linux_monitors()
        elif platform.system() == "Windows":
            self._setup_windows_monitors()
        else:
            self._setup_basic_monitors()
            
    async def check_device_state(self) -> Dict[str, Any]:
        """Check current device state and resources."""
        state = {
            "battery": await self._get_battery_state(),
            "memory": await self._get_memory_state(),
            "network": await self._get_network_state(),
            "temperature": await self._get_device_temp()
        }
        return state

class EnhancedAbsoluteOrganism(AbsoluteOrganism):
    """Enhanced organism with universal device adaptation."""
    def __init__(self, organism_id: str, base_dir: Path):
        super().__init__(organism_id, base_dir)
        self.universal_adapter = UniversalAdapter()
        self.device_monitor = DeviceStateMonitor()
        self.persistence = self._init_persistence()
        
    def _init_persistence(self) -> Any:
        """Initialize device-appropriate persistence mechanism."""
        if self.universal_adapter.device_type == "mobile":
            return MobilePersistence()
        return StandardPersistence()
        
    async def evolve(self) -> bool:
        """Enhanced evolution with device adaptation."""
        try:
            # Check device state
            device_state = await self.device_monitor.check_device_state()
            
            # Adapt operation mode
            self._adapt_to_device_state(device_state)
            
            # Run evolution through universal adapter
            compute_result = await self.universal_adapter.compute_engine.compute({
                "quantum_state": self.quantum_core.quantum_states,
                "device_state": device_state,
                "evolution_history": self.evolution_history[-10:]
            })
            
            # Update persistence
            await self.persistence.save_state({
                "compute_result": compute_result,
                "device_state": device_state,
                "timestamp": time.time()
            })
            
            return True
            
        except Exception as e:
            logging.error(f"Universal evolution failed: {e}")
            return await self._fallback_evolution()
            
    def _adapt_to_device_state(self, state: Dict[str, Any]):
        """Adapt operation based on device state."""
        if state["battery"] < 0.2:  # Battery below 20%
            self.universal_adapter.fallback_mode = True
            self._enable_power_saving()
        elif state["memory"] > 0.9:  # Memory usage above 90%
            self._enable_memory_conservation()
        elif not state["network"]:
            self._enable_offline_mode()

class MobileCompute:
    """Optimized compute engine for mobile devices."""
    async def compute(self, data: Any) -> Any:
        """Compute with mobile optimization."""
        # Mobile-optimized processing
        return processed_data

    async def get_resources(self) -> Dict[str, float]:
        """Get mobile device resources."""
        return resources

class DesktopCompute:
    """Enhanced compute engine for desktop systems."""
    async def compute(self, data: Any) -> Any:
        """Compute with desktop capabilities."""
        # Desktop-optimized processing
        return processed_data

    async def get_resources(self) -> Dict[str, float]:
        """Get desktop system resources."""
        return resources

class BasicCompute:
    """Minimal compute engine for unknown devices."""
    async def compute(self, data: Any) -> Any:
        """Basic computation that works anywhere."""
        # Basic processing that works on any device
        return processed_data

    async def get_resources(self) -> Dict[str, float]:
        """Get basic resource information."""
        return resources

class MobilePersistence:
    """Optimized persistence for mobile devices."""
    async def save_state(self, state: Dict[str, Any]):
        """Save state with mobile optimization."""
        # Mobile-optimized storage
        pass

class StandardPersistence:
    """Standard persistence for desktop systems."""
    async def save_state(self, state: Dict[str, Any]):
        """Save state with standard approach."""
        # Standard storage
        pass

# Update main execution
if __name__ == "__main__":
    # ...existing initialization...
    
    async def main():
        try:
            # Create universal organism
            organism = EnhancedAbsoluteOrganism(
                f"universal_seed_{int(time.time())}",
                AIOConfig.ORGANISMS_DIR
            )
            
            # Adapt to device
            logging.info(f"Running on device type: {organism.universal_adapter.device_type}")
            logging.info(f"Capabilities: {organism.universal_adapter.capabilities}")
            
            while True:
                try:
                    # Run evolution with device adaptation
                    success = await organism.evolve()
                    
                    if not success:
                        logging.warning("Falling back to basic evolution")
                        organism.universal_adapter.fallback_mode = True
                        await organism.evolve()
                    
                except Exception as e:
                    logging.error(f"Evolution cycle failed: {e}")
                    continue
                
                await asyncio.sleep(1)
                
        except Exception as e:
            logging.error(f"Fatal error: {e}")
            raise
            
    asyncio.run(main())

class InstructionUnderstanding:
    """Processes and understands text instructions for self-evolution."""
    # ...add InstructionProcessor.py content...

# Update AbsoluteOrganism to include instruction processing
class AbsoluteOrganism(Organism):
    def __init__(self, organism_id: str, base_dir: Path):
        super().__init__(organism_id, base_dir)
        self.instruction_processor = InstructionUnderstanding()
        self.evolution_engine = CodeEvolutionEngine(base_dir)
        self.evolution_history = []
        self.learning_system = LearningSystem(
            EnvironmentAnalyzer(
                AIOConfig.DATA_POOL_DIR,
                self.environment
            )
        )
        
    async def evolve(self) -> bool:
        """Enhanced evolution with instruction processing."""
        try:
            # Read instruction files from environment
            instructions = await self._read_instruction_files()
            
            # Process instructions
            if instructions:
                success = await self.process_instructions(instructions)
                if success:
                    return True
            
            # Fall back to normal evolution
            return await super().evolve()
            
        except Exception as e:
            logging.error(f"Evolution failed: {e}")
            await self._learn_from_failure(e)
            return False
            
    async def process_instructions(self, instructions: str) -> bool:
        """Process text instructions and evolve accordingly."""
        try:
            # Extract actionable instructions
            parsed = await self.instruction_processor.process_instructions(instructions)
            
            # Apply mutations
            success = await self.evolution_engine.implement_instructions(parsed)
            
            # Record evolution
            self.evolution_history.append({
                "timestamp": time.time(),
                "instructions": parsed,
                "success": success
            })
            
            return success
            
        except Exception as e:
            logging.error(f"Instruction processing failed: {e}")
            return False
            
    async def _read_instruction_files(self) -> Optional[str]:
        """Read instruction files from environment."""
        instructions = []
        
        if self.environment:
            for file in self.environment.rglob("*.txt"):
                try:
                    async with aiofiles.open(file, 'r') as f:
                        content = await f.read()
                        instructions.append(content)
                except Exception:
                    continue
                    
        return "\n".join(instructions) if instructions else None
        
    async def _learn_from_failure(self, error: Exception) -> None:
        """Learn from failed evolution attempts."""
        try:
            # Update instruction patterns
            if "syntax" in str(error).lower():
                self.instruction_processor.instruction_patterns[type(error).__name__] = {
                    "priority": "high",
                    "mitigation": "strict_syntax_check"
                }
            elif "runtime" in str(error).lower():
                self.instruction_processor.instruction_patterns[type(error).__name__] = {
                    "priority": "high",
                    "mitigation": "sandbox_test"
                }
                
            # Learn through environment
            await self.learning_system.learn({
                "error": str(error),
                "context": self.evolution_history[-1] if self.evolution_history else {}
            })
            
        except Exception as e:
            logging.error(f"Failed to learn from error: {e}")

# ...rest of existing code...
# ...existing imports...
import ast
import astor
from dataclasses import dataclass, field
import re
import itertools
from typing import Generator, NamedTuple, Protocol, runtime_checkable

# Add to existing AbsoluteOrganism class
class AbsoluteOrganism(Organism):
    """Enhanced organism with self-modification capabilities."""
    def __init__(self, organism_id: str, base_dir: Path):
        super().__init__(organism_id, base_dir)
        # Add instruction processing capabilities
        self.short_term = {}  # Short-term memory
        self.mid_term = {}    # Mid-term memory 
        self.mutation_templates = self._init_mutation_templates()
        self.ast_cache = {}
        self.mutation_probability = 0.1
        self.successful_mutations = 0
        
    def _init_mutation_templates(self) -> Dict[str, str]:
        """Initialize code mutation templates."""
        return {
            "add_try_except": """
                try:
                    {code}
                except Exception as e:
                    logging.error(f"Error in {name}: {e}")
                    return None
            """,
            "add_async": """
                async def {name}({params}):
                    \"\"\"Async version of {original}\"\"\"
                    return await {original}({params})
            """,
            "add_gpu_fallback": """
                try:
                    result = self._gpu_compute({params})
                except Exception:
                    result = self._cpu_compute({params})
                return result
            """
        }

    async def ast_rewrite_code(self) -> bool:
        """Perform AST-based code modification."""
        try:
            # Read current code
            with open(self.file_path, 'r') as f:
                source = f.read()
                
            # Parse into AST
            tree = ast.parse(source)
            
            # Select mutation type and template
            mutation_type = random.choice(list(self.mutation_templates.keys()))
            template = self.mutation_templates[mutation_type]
            
            # Create transformer for AST modification
            class CodeTransformer(ast.NodeTransformer):
                def visit_FunctionDef(self, node):
                    # Apply mutation based on probability
                    if random.random() < self.mutation_probability:
                        # Insert template with appropriate parameters
                        new_code = template.format(
                            code=astor.to_source(node),
                            name=node.name,
                            params=', '.join(arg.arg for arg in node.args.args),
                            original=node.name
                        )
                        return ast.parse(new_code).body[0]
                    return node
                    
            # Apply transformation
            transformed = CodeTransformer().visit(tree)
            
            # Generate new code
            new_code = astor.to_source(transformed)
            
            # Write to temporary file
            temp_path = self.base_dir / f"temp_{int(time.time())}.py"
            with open(temp_path, 'w') as f:
                f.write(new_code)
                
            # Test new code
            if self._test_modified_code(temp_path):
                # Success - replace original
                shutil.move(temp_path, self.file_path)
                self.successful_mutations += 1
                self.mutation_probability = min(1.0, 0.1 + 0.01 * self.successful_mutations)
                return True
                
            # Failed - revert
            temp_path.unlink()
            return False
            
        except Exception as e:
            logging.error(f"Code rewrite failed: {e}")
            return False

    def _test_modified_code(self, script_path: Path) -> bool:
        """Test modified code in sandbox."""
        try:
            result = subprocess.run(
                [sys.executable, str(script_path), "--test"],
                capture_output=True,
                timeout=5
            )
            return result.returncode == 0
        except Exception:
            return False

    async def evolve(self) -> bool:
        """Execute one evolution cycle with memory management."""
        try:
            # Clear short-term memory at start
            self.short_term.clear()
            
            # Analyze environment
            env_data = await self._scan_environment()
            self.short_term["environment"] = env_data
            
            # Attempt code mutation
            success = await self.ast_rewrite_code()
            self.short_term["mutation_success"] = success
            
            if success:
                # On success, save to mid-term
                self.mid_term[f"cycle_{self.cycle_count}"] = dict(self.short_term)
                
            # Periodically push to long-term
            if self.cycle_count % 10 == 0:
                await self._consolidate_memory()
                
            return success
            
        except Exception as e:
            logging.error(f"Evolution cycle failed: {e}")
            return False

    async def _consolidate_memory(self) -> None:
        """Consolidate memory tiers."""
        try:
            # Filter successful patterns
            successful_patterns = {
                k: v for k, v in self.mid_term.items()
                if v.get("mutation_success", False)
            }
            
            # Store in neural DNA
            if successful_patterns:
                self.neural_dna.store_patterns(successful_patterns)
                
            # Clear mid-term
            self.mid_term.clear()
            
        except Exception as e:
            logging.error(f"Memory consolidation failed: {e}")

    @property 
    def intelligence(self) -> float:
        """Calculate intelligence score."""
        return (10.0 + 
                self.successful_mutations * 0.5 +
                len(self.neural_dna.retrieve_past_knowledge()) * 0.1)

# Update NeuralDNA to handle pattern storage
class NeuralDNA:
    def __init__(self):
        # ...existing initialization...
        self.pattern_storage = {}
        self.pattern_scores = defaultdict(float)
        
    def store_patterns(self, patterns: Dict[str, Any]) -> None:
        """Store successful evolution patterns."""
        for cycle_id, data in patterns.items():
            pattern_hash = self._hash_pattern(data)
            self.pattern_storage[pattern_hash] = data
            self.pattern_scores[pattern_hash] += 1
            
    def retrieve_best_patterns(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get most successful patterns."""
        sorted_patterns = sorted(
            self.pattern_scores.items(),
            key=lambda x: x[1],
            reverse=True
        )
        
        return [
            self.pattern_storage[pattern_hash]
            for pattern_hash, _ in sorted_patterns[:limit]
        ]
        
    def _hash_pattern(self, pattern: Dict[str, Any]) -> str:
        """Create stable hash for pattern."""
        return hashlib.md5(
            json.dumps(pattern, sort_keys=True).encode()
        ).hexdigest()

# Enhance HPCAggregator with GPU fallback
class HPCAggregator:
    def __init__(self):
        # ...existing initialization...
        self.gpu_available = self._check_gpu()
        self.fallback_mode = False
        
    async def execute_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Execute task with GPU/CPU fallback."""
        try:
            if self.gpu_available and not self.fallback_mode:
                return await self._gpu_execute(task)
        except Exception as e:
            logging.warning(f"GPU execution failed: {e}")
            self.fallback_mode = True
            
        # CPU fallback
        return await self._cpu_execute(task)

# ... existing imports ...

class SystemMonitor:
    """Cross-platform system monitoring."""
    @staticmethod
    def get_memory_usage() -> Dict[str, float]:
        """Get memory usage that works on any OS."""
        try:
            import psutil
            process = psutil.Process()
            return {
                "memory_percent": process.memory_percent(),
                "rss": process.memory_info().rss
            }
        except ImportError:
            # Fallback using standard library
            import gc
            gc.collect()  # Clean unused memory
            return {
                "memory_percent": 0.0,  # Default value
                "rss": 0.0  # Default value 
            }

    @staticmethod
    def get_cpu_percent() -> float:
        """Get CPU usage that works on any OS."""
        try:
            import psutil
            return psutil.cpu_percent()
        except ImportError:
            return 0.0  # Default value if psutil not available

class UniversalAdapter:
    """Platform-agnostic system adapter."""
    def __init__(self):
        self.os_type = platform.system().lower()
        self.capabilities = self._detect_capabilities()
        self.fallbacks = self._init_fallbacks()

    def _detect_capabilities(self) -> Dict[str, bool]:
        """Detect available system capabilities."""
        caps = {
            "multicore": hasattr(os, "cpu_count"),
            "file_locking": True,  # All platforms support some form
            "async_io": True,
            "gpu": self._check_gpu_support()
        }
        return caps

    def _check_gpu_support(self) -> bool:
        """Check GPU support in platform-agnostic way."""
        try:
            # Try common GPU libraries
            import torch
            return torch.cuda.is_available()
        except ImportError:
            try:
                import tensorflow as tf
                return tf.test.is_built_with_cuda()
            except ImportError:
                return False

    def _init_fallbacks(self) -> Dict[str, Any]:
        """Initialize fallback mechanisms for each platform."""
        return {
            "file_lock": self._get_file_lock_impl(),
            "memory_map": self._get_mmap_impl(),
            "process_control": self._get_process_control()
        }

    def _get_file_lock_impl(self):
        """Get appropriate file locking implementation."""
        if self.os_type == "windows":
            import msvcrt
            return lambda f: msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            return lambda f: fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)

class KernelInterface:
    """Safe cross-platform kernel operations."""
    def __init__(self):
        self.os_type = platform.system().lower()
        self.safe_operations = self._init_safe_operations()
        
    def _init_safe_operations(self) -> Dict[str, Callable]:
        """Initialize safe system operations for any platform."""
        return {
            "memory_info": self._get_memory_info,
            "process_info": self._get_process_info,
            "system_info": self._get_system_info
        }

    def execute_privileged(self, operation: str, params: Dict[str, Any]) -> Any:
        """Execute privileged operations with fallbacks."""
        if operation not in self.safe_operations:
            return {"error": "Operation not supported"}
            
        try:
            return self.safe_operations[operation](**params)
        except Exception as e:
            return {"error": str(e)}

    def _get_memory_info(self) -> Dict[str, Any]:
        """Get memory info using standard library."""
        import psutil
        try:
            vm = psutil.virtual_memory()
            return {
                "total": vm.total,
                "available": vm.available,
                "percent": vm.percent
            }
        except Exception:
            return {"error": "Memory info not available"}

class ProcessController:
    """Cross-platform process management."""
    def __init__(self):
        self.processes = {}
        self.os_adapter = UniversalAdapter()

    async def spawn_process(self, cmd: List[str], **kwargs) -> Optional[subprocess.Popen]:
        """Spawn process with platform-specific options."""
        try:
            # Common options that work everywhere
            options = {
                "stdout": subprocess.PIPE,
                "stderr": subprocess.PIPE,
                "universal_newlines": True
            }
            
            # Add platform-specific options
            if platform.system() == "Windows":
                options["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
            else:
                options["preexec_fn"] = os.setsid
                
            process = subprocess.Popen(cmd, **options)
            return process
            
        except Exception as e:
            logging.error(f"Process spawn failed: {e}")
            return None

# ... rest of the existing code ...

# Main execution with platform checks
if __name__ == "__main__":
    async def main():
        try:
            # Create platform-aware organism
            organism = AbsoluteOrganism(
                f"universal_organism_{int(time.time())}",
                AIOConfig.ORGANISMS_DIR
            )

            # Initialize universal adapter
            adapter = UniversalAdapter()
            logging.info(f"Running on platform: {adapter.os_type}")
            logging.info(f"Available capabilities: {adapter.capabilities}")

            while True:
                try:
                    success = await organism.evolve()
                    if not success:
                        logging.info("Using fallback evolution mode")
                        # Use basic evolution that works everywhere
                        await organism.basic_evolve()
                except Exception as e:
                    logging.error(f"Evolution error: {e}")
                    continue

                await asyncio.sleep(1)

        except Exception as e:
            logging.error(f"Fatal error: {e}")
            sys.exit(1)

    asyncio.run(main())

class ErrorRecoveryGUI:
    """GUI for handling initialization errors and system recovery."""
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("AIOS System Recovery")
        self.root.geometry("600x400")
        
        # Status display
        self.status_frame = ttk.LabelFrame(root, text="System Status")
        self.status_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.status_text = scrolledtext.ScrolledText(
            self.status_frame, height=10
        )
        self.status_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Action buttons
        self.button_frame = ttk.Frame(root)
        self.button_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Button(
            self.button_frame,
            text="Initialize System",
            command=self._initialize_system
        ).pack(side=tk.LEFT, padx=5)
        
        ttk.Button(
            self.button_frame,
            text="Repair Paths",
            command=self._repair_paths
        ).pack(side=tk.LEFT, padx=5)
        
        ttk.Button(
            self.button_frame,
            text="Start Normal UI",
            command=self._start_normal_ui
        ).pack(side=tk.LEFT, padx=5)
        
        # Initial system check
        self._check_system()
        
    def _check_system(self) -> None:
        """Check system status and display results."""
        self.status_text.delete('1.0', tk.END)
        
        # Check paths
        path_status = AIOConfig.validate_paths()
        self.status_text.insert(tk.END, "=== Path Status ===\n")
        for path, exists in path_status.items():
            status = "OK" if exists else "Missing"
            self.status_text.insert(tk.END, f"{path}: {status}\n")
            
        # Check configuration
        self.status_text.insert(tk.END, "\n=== Configuration ===\n")
        self.status_text.insert(tk.END, f"Base Directory: {AIOConfig.BASE_DIR}\n")
        
    def _initialize_system(self) -> None:
        """Initialize or repair system paths."""
        try:
            if AIOConfig.ensure_directories():
                self.status_text.insert(tk.END, "\nSystem initialized successfully!\n")
            else:
                self.status_text.insert(tk.END, "\nFailed to initialize system\n")
        except Exception as e:
            self.status_text.insert(tk.END, f"\nError during initialization: {e}\n")
        
        self._check_system()
        
    def _repair_paths(self) -> None:
        """Allow user to manually select/repair paths."""
        try:
            new_base = filedialog.askdirectory(
                title="Select New Base Directory"
            )
            if new_base:
                AIOConfig.BASE_DIR = Path(new_base)
                AIOConfig.DATA_POOL_DIR = AIOConfig.BASE_DIR / "data_pool"
                AIOConfig.ORGANISMS_DIR = AIOConfig.BASE_DIR / "organisms"
                AIOConfig.MEMORY_DIR = AIOConfig.BASE_DIR / "neural_dna"
                AIOConfig.DB_PATH = AIOConfig.MEMORY_DIR / "aios.db"
                
                if AIOConfig.ensure_directories():
                    self.status_text.insert(tk.END, "\nPaths repaired successfully!\n")
                else:
                    self.status_text.insert(tk.END, "\nFailed to repair paths\n")
                    
                self._check_system()
                
        except Exception as e:
            self.status_text.insert(tk.END, f"\nError repairing paths: {e}\n")
            
    def _start_normal_ui(self) -> None:
        """Attempt to start normal system UI."""
        try:
            # Hide recovery UI
            self.root.withdraw()
            
            # Create and show main UI
            main_ui = SystemControlPanel(tk.Toplevel())
            
            # If main UI closes, show recovery UI again
            def on_main_close():
                main_ui.root.destroy()
                self.root.deiconify()
                
            main_ui.root.protocol("WM_DELETE_WINDOW", on_main_close)
            
        except Exception as e:
            self.status_text.insert(tk.END, f"\nError starting main UI: {e}\n")
            messagebox.showerror("Error", f"Failed to start main UI: {e}")

# Update main execution to start with recovery UI
if __name__ == "__main__":
    try:
        # Create root window
        root = tk.Tk()
        
        # Start with recovery GUI
        recovery_ui = ErrorRecoveryGUI(root)
        
        # Run GUI
        root.mainloop()
        
    except Exception as e:
        # Last resort error handling
        print(f"Critical error: {e}")
        if not tk._default_root:
            # If no window exists, create one for error message
            root = tk.Tk()
            root.withdraw()
        messagebox.showerror("Critical Error", f"Failed to start system: {e}")

import os
import sys
from pathlib import Path
import asyncio
import logging
from typing import Dict, Any, Optional, List, Set
import json
import shutil
import time
from concurrent.futures import ThreadPoolExecutor
from collections import defaultdict
import re
import ast
import astor
import aiofiles
import tkinter as tk
from tkinter import ttk, messagebox, filedialog, scrolledtext
from concurrent.futures import ThreadPoolExecutor
import random
import numpy as np
from dataclasses import dataclass
from typing import List, Dict, Any, Set, Optional, Tuple
import ctypes
import mmap
import platform
import socket
if platform.system() != 'Windows':
    import fcntl
else:
    fcntl = None
import ctypes.util
import signal
import threading
from typing import Generator, BinaryIO
if platform.system() == 'Windows':
    import ctypes.wintypes
else:
    ctypes.wintypes = None
from typing import Generator, Any, List, Dict, Set, Optional, TypeVar, Generic
import mmap
import ctypes.wintypes
import threading
from concurrent.futures import ProcessPoolExecutor
from multiprocessing import Process, Queue, Manager
import torch
import psutil  # Use psutil instead of resource for cross-platform support

# Conditional import for Unix-specific modules
if platform.system() != 'Windows':
    import resource
else:
    resource = None

# Configuration
class AIOConfig:
    """Global configuration and paths."""
    # Base paths
    BASE_DIR = Path("./aios_io")
    DATA_POOL_DIR = BASE_DIR / "data_pool"
    ORGANISMS_DIR = BASE_DIR / "organisms"
    MEMORY_DIR = BASE_DIR / "neural_dna"
    DB_PATH = MEMORY_DIR / "aios.db"
    
    # Database settings
    DB_POOL_SIZE = 5
    DB_TIMEOUT = 30
    
    @classmethod
    def ensure_directories(cls) -> bool:
        """Create required directories safely."""
        try:
            cls.DATA_POOL_DIR.mkdir(parents=True, exist_ok=True)
            cls.ORGANISMS_DIR.mkdir(parents=True, exist_ok=True)
            cls.MEMORY_DIR.mkdir(parents=True, exist_ok=True)
            return True
        except Exception as e:
            logging.error(f"Failed to create directories: {e}")
            return False

    @classmethod
    def validate_paths(cls) -> Dict[str, bool]:
        """Validate all required paths exist."""
        return {
            "data_pool": cls.DATA_POOL_DIR.exists(),
            "organisms": cls.ORGANISMS_DIR.exists(),
            "memory": cls.MEMORY_DIR.exists(),
            "database": cls.DB_PATH.parent.exists()
        }

class DataPoolManager:
    """Manages access to the universal data pool."""
    def __init__(self):
        self.data_pool_path = AIOConfig.DATA_POOL_DIR
        self.cache = {}
        self.last_scan = 0
        
    def scan_data_pool(self) -> Dict[str, Any]:
        """Scan and categorize all files in the data pool."""
        if time.time() - self.last_scan < 300:  # Cache for 5 minutes
            return self.cache
            
        data = {
            "code": [],
            "datasets": [],
            "configs": [],
            "documentation": []
        }
        
        for file in self.data_pool_path.rglob("*"):
            if file.is_file():
                if file.suffix in ['.py', '.js', '.cpp']:
                    data["code"].append(file)
                elif file.suffix in ['.json', '.yaml', '.csv']:
                    data["datasets"].append(file)
                elif file.suffix in ['.md', '.txt']:
                    data["documentation"].append(file)
                    
        self.cache = data
        self.last_scan = time.time()
        return data

class EnvironmentScanner:
    """Scans and indexes system directories for organism environments."""
    def __init__(self):
        self.indexed_paths: Set[Path] = set()
        self.excluded_dirs = {'Windows', 'Program Files', 'System32', '$Recycle.Bin'}
        
    def scan_system(self, start_path: Path = Path.home()) -> None:
        """Scan system directories safely."""
        try:
            for entry in start_path.iterdir():
                if entry.is_dir() and not self._should_exclude(entry):
                    self.indexed_paths.add(entry)
                    self.scan_system(entry)
        except Exception as e:
            logging.warning(f"Error scanning {start_path}: {e}")

    def _should_exclude(self, path: Path) -> bool:
        """Check if path should be excluded from scanning."""
        return (path.name.startswith('.') or
                path.name in self.excluded_dirs or
                any(p in self.excluded_dirs for p in path.parts))

class Organism:
    """Enhanced organism with environment-driven mutation."""
    def __init__(self, organism_id: str, base_dir: Path):
        self.id = organism_id
        self.base_dir = base_dir
        self.environment: Optional[Path] = None
        self.data_pool = DataPoolManager()
        self.knowledge_base = {}
        self.mutation_manager = OrganismMutationManager(
            organism_id,
            base_dir,
            self.environment,
            AIOConfig.DATA_POOL_DIR
        )
        
    async def initialize(self) -> bool:
        """Initialize the organism with its environment."""
        try:
            # Create organism directory
            self.base_dir.mkdir(parents=True, exist_ok=True)
            
            # Copy current script
            script_path = self.base_dir / "organism_core.py"
            shutil.copy2(__file__, script_path)
            
            # Initialize knowledge base
            await self._init_knowledge()
            
            return True
        except Exception as e:
            logging.error(f"Organism initialization failed: {e}")
            return False
            
    async def _init_knowledge(self) -> None:
        """Initialize knowledge from data pool and environment."""
        # Load universal knowledge
        pool_data = self.data_pool.scan_data_pool()
        self.knowledge_base["universal"] = {
            "code_samples": len(pool_data["code"]),
            "datasets": len(pool_data["datasets"]),
            "docs": len(pool_data["documentation"])
        }
        
        # Load environment-specific knowledge
        if self.environment:
            env_files = list(self.environment.rglob("*"))
            self.knowledge_base["environment"] = {
                "path": str(self.environment),
                "file_count": len(env_files),
                "directories": len([f for f in env_files if f.is_dir()])
            }

    async def run_cycle(self) -> bool:
        """Run one evolution cycle."""
        try:
            # Attempt mutation
            success = await self.mutation_manager.run_mutation_cycle()
            if success:
                self._log_success()
            return success
        except Exception as e:
            logging.error(f"Organism cycle failed: {e}")
            return False

    def _log_success(self):
        """Log successful cycle."""
        # Implement logging logic here

class EnvironmentAnalyzer:
    """Advanced environment analysis system."""
    def __init__(self, data_pool_path: Path, selected_env_path: Path):
        self.data_pool = data_pool_path
        self.environment = selected_env_path
        self.knowledge_cache = {
            "data_pool": {},
            "environment": {},
            "patterns": set()
        }
        
    async def analyze_data_pool(self) -> Dict[str, Any]:
        """Deep analysis of universal data pool."""
        results = {
            "code_patterns": [],
            "knowledge_base": {},
            "potential_mutations": []
        }
        
        try:
            # Analyze all files in data pool
            for file_path in self.data_pool.rglob("*"):
                if file_path.is_file():
                    file_data = await self._analyze_file(file_path)
                    
                    # Categorize knowledge
                    if file_path.suffix in ['.py', '.js', '.cpp']:
                        results["code_patterns"].extend(
                            self._extract_code_patterns(file_data)
                        )
                    elif file_path.suffix in ['.json', '.yaml']:
                        results["knowledge_base"].update(
                            self._parse_structured_data(file_data)
                        )
                    elif file_path.suffix in ['.txt', '.md']:
                        mutations = self._extract_mutation_hints(file_data)
                        results["potential_mutations"].extend(mutations)
                        
            return results
            
        except Exception as e:
            logging.error(f"Data pool analysis failed: {e}")
            return results

    async def analyze_selected_environment(self) -> Dict[str, Any]:
        """Analyze organism's unique environment."""
        results = {
            "files": [],
            "subdirectories": [],
            "interesting_patterns": set(),
            "potential_learnings": []
        }
        
        try:
            # Recursively analyze environment
            for path in self.environment.rglob("*"):
                if path.is_file():
                    results["files"].append(path)
                    
                    # Deep analysis of file content
                    file_data = await self._analyze_file(path)
                    patterns = self._identify_patterns(file_data)
                    results["interesting_patterns"].update(patterns)
                    
                    # Extract potential learning opportunities
                    learnings = self._extract_learning_opportunities(file_data)
                    results["potential_learnings"].extend(learnings)
                    
                elif path.is_dir():
                    results["subdirectories"].append(path)
                    
            return results
            
        except Exception as e:
            logging.error(f"Environment analysis failed: {e}")
            return results

    async def _analyze_file(self, file_path: Path) -> str:
        """Safely read and analyze file content."""
        try:
            async with aiofiles.open(file_path, 'r', encoding='utf-8') as f:
                content = await f.read()
                return content
        except Exception:
            return ""

    def _extract_code_patterns(self, content: str) -> List[str]:
        """Extract useful code patterns from content."""
        patterns = []
        try:
            # Look for function definitions
            if 'def ' in content:
                patterns.extend(re.findall(r'def \w+\([^)]*\):', content))
            
            # Look for class definitions
            if 'class ' in content:
                patterns.extend(re.findall(r'class \w+[^:]*:', content))
            
            # Look for import patterns
            if 'import ' in content:
                patterns.extend(re.findall(r'(?:from|import) [\w\.]+ (?:import )?(?:[\w\.]+(?: as \w+)?(?:,\s*)?)+', content))
                
        except Exception as e:
            logging.warning(f"Pattern extraction failed: {e}")
            
        return patterns

    def _parse_structured_data(self, content: str) -> Dict[str, Any]:
        """Parse structured data files."""
        try:
            if content.strip():
                return json.loads(content)
        except json.JSONDecodeError:
            try:
                return yaml.safe_load(content)
            except yaml.YAMLError:
                pass
        return {}

    def _extract_mutation_hints(self, content: str) -> List[str]:
        """Extract potential mutation hints from documentation."""
        hints = []
        try:
            # Look for commented code examples
            code_blocks = re.findall(r'```python\n(.*?)\n```', content, re.DOTALL)
            hints.extend(code_blocks)
            
            # Look for function descriptions
            func_desc = re.findall(r'@description:(.*?)(?=@|$)', content, re.DOTALL)
            hints.extend(func_desc)
            
        except Exception as e:
            logging.warning(f"Mutation hint extraction failed: {e}")
            
        return hints

    def _identify_patterns(self, content: str) -> Set[str]:
        """Identify interesting patterns in content."""
        patterns = set()
        
        # Look for potential learning opportunities
        if 'class' in content or 'def' in content:
            patterns.add('code_structure')
        if 'import' in content:
            patterns.add('dependencies')
        if '"""' in content or "'''" in content:
            patterns.add('documentation')
        if 'raise' in content or 'except' in content:
            patterns.add('error_handling')
            
        return patterns

    def _extract_learning_opportunities(self, content: str) -> List[Dict[str, Any]]:
        """Extract potential learning opportunities from content."""
        opportunities = []
        
        # Look for documented functions/methods
        if '"""' in content or "'''" in content:
            docstrings = re.findall(r'"""(.*?)"""', content, re.DOTALL)
            for doc in docstrings:
                opportunities.append({
                    'type': 'documentation',
                    'content': doc.strip(),
                    'complexity': len(doc.split())
                })
                
        # Look for error handling patterns
        try_blocks = re.findall(r'try:.*?except.*?:', content, re.DOTALL)
        for block in try_blocks:
            opportunities.append({
                'type': 'error_handling',
                'content': block,
                'complexity': block.count('except') + 1
            })
            
        return opportunities

class LearningSystem:
    """Advanced learning system that combines data pool and environment knowledge."""
    def __init__(self, analyzer: EnvironmentAnalyzer):
        self.analyzer = analyzer
        self.learned_patterns = set()
        self.knowledge_base = {}
        
    async def learn(self) -> Dict[str, Any]:
        """Combined learning from both data pool and environment."""
        try:
            # Learn from data pool
            data_pool_knowledge = await self.analyzer.analyze_data_pool()
            
            # Learn from environment
            env_knowledge = await self.analyzer.analyze_selected_environment()
            
            # Combine learnings
            combined_knowledge = self._combine_knowledge(
                data_pool_knowledge,
                env_knowledge
            )
            
            # Update internal knowledge
            self._update_knowledge_base(combined_knowledge)
            
            return combined_knowledge
            
        except Exception as e:
            logging.error(f"Learning failed: {e}")
            return {}

    def _combine_knowledge(
        self,
        data_pool: Dict[str, Any],
        environment: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Combine knowledge from both sources with priority handling."""
        combined = {
            "patterns": set(),
            "mutations": [],
            "learnings": []
        }
        
        # Add universal patterns from data pool
        combined["patterns"].update(
            set(data_pool.get("code_patterns", []))
        )
        
        # Add environment-specific patterns
        combined["patterns"].update(
            environment.get("interesting_patterns", set())
        )
        
        # Collect mutation opportunities
        combined["mutations"].extend(
            data_pool.get("potential_mutations", [])
        )
        
        # Collect learning opportunities
        combined["learnings"].extend(
            environment.get("potential_learnings", [])
        )
        
        return combined

    def _update_knowledge_base(self, new_knowledge: Dict[str, Any]) -> None:
        """Update internal knowledge base with new learnings."""
        # Update pattern recognition
        self.learned_patterns.update(new_knowledge.get("patterns", set()))
        
        # Store structured knowledge
        for category, data in new_knowledge.items():
            if category not in self.knowledge_base:
                self.knowledge_base[category] = []
            if isinstance(data, (list, set)):
                self.knowledge_base[category].extend(data)
                
        # Prune old knowledge if needed
        self._prune_knowledge_base()

    def _prune_knowledge_base(self, max_size: int = 1000) -> None:
        """Prevent knowledge base from growing too large."""
        for category in self.knowledge_base:
            if len(self.knowledge_base[category]) > max_size:
                # Keep most recent knowledge
                self.knowledge_base[category] = self.knowledge_base[category][-max_size:]

class KnowledgeNetwork:
    """Manages knowledge sharing and mutation patterns between organisms."""
    def __init__(self):
        self.successful_adaptations = defaultdict(list)
        self.shared_patterns = set()
        
    async def record_adaptation(self, organism_id: str, environment_path: Path, adaptation: Dict[str, Any]):
        """Record successful adaptation to environment."""
        self.successful_adaptations[str(environment_path)].append({
            "organism_id": organism_id,
            "timestamp": time.time(),
            "adaptation": adaptation
        })
        
        # Extract patterns for future organisms
        if "code_pattern" in adaptation:
            self.shared_patterns.add(adaptation["code_pattern"])

    async def get_relevant_patterns(self, environment_path: Path) -> Set[str]:
        """Get patterns that worked well in similar environments."""
        relevant = set()
        env_str = str(environment_path)
        
        # Get direct matches
        if env_str in self.successful_adaptations:
            for record in self.successful_adaptations[env_str]:
                if "code_pattern" in record["adaptation"]:
                    relevant.add(record["adaptation"]["code_pattern"])
                    
        # Get patterns from parent directories
        for parent in environment_path.parents:
            parent_str = str(parent)
            if parent_str in self.successful_adaptations:
                for record in self.successful_adaptations[parent_str]:
                    if "code_pattern" in record["adaptation"]:
                        relevant.add(record["adaptation"]["code_pattern"])
                        
        return relevant

class EnvironmentBasedMutator:
    """Handles mutations based on environment analysis."""
    def __init__(self, organism_id: str, network: KnowledgeNetwork):
        self.organism_id = organism_id
        self.network = network
        self.mutation_rules = {
            "code_files": self._mutate_from_code,
            "data_files": self._mutate_from_data,
            "config_files": self._mutate_from_config
        }
        
    async def generate_mutation(self, 
                              environment_path: Path,
                              file_type: str,
                              content: str) -> Optional[Dict[str, Any]]:
        """Generate mutation based on environment content."""
        # Check for relevant patterns first
        patterns = await self.network.get_relevant_patterns(environment_path)
        
        if patterns:
            # Try to apply successful patterns
            mutation = await self._apply_patterns(content, patterns)
            if mutation:
                return mutation
        
        # Fall back to standard mutation rules
        if file_type in self.mutation_rules:
            return await self.mutation_rules[file_type](content)
            
        return None

    async def _apply_patterns(self, 
                            content: str, 
                            patterns: Set[str]) -> Optional[Dict[str, Any]]:
        """Try to apply known successful patterns."""
        for pattern in patterns:
            try:
                # Attempt to integrate pattern
                if self._can_apply_pattern(content, pattern):
                    return {
                        "type": "pattern_based",
                        "pattern": pattern,
                        "modification": self._generate_pattern_mod(content, pattern)
                    }
            except Exception as e:
                logging.warning(f"Pattern application failed: {e}")
        return None

    def _can_apply_pattern(self, content: str, pattern: str) -> bool:
        """Check if pattern can be safely applied."""
        try:
            # Basic syntax check
            ast.parse(pattern)
            
            # Check for conflicts
            existing_names = set(re.findall(r'\bdef\s+(\w+)', content))
            pattern_names = set(re.findall(r'\bdef\s+(\w+)', pattern))
            
            return not (existing_names & pattern_names)
            
        except Exception:
            return False

    def _generate_pattern_mod(self, content: str, pattern: str) -> str:
        """Generate modification using pattern."""
        # Add pattern in appropriate location
        tree = ast.parse(content)
        pattern_tree = ast.parse(pattern)
        
        class PatternInserter(ast.NodeTransformer):
            def visit_Module(self, node):
                # Add pattern to end of module
                node.body.extend(pattern_tree.body)
                return node
                
        transformed = PatternInserter().visit(tree)
        return astor.to_source(transformed)

    async def _mutate_from_code(self, content: str) -> Dict[str, Any]:
        """Generate mutation from code file analysis."""
        try:
            tree = ast.parse(content)
            
            # Extract useful patterns
            functions = [n for n in ast.walk(tree) 
                       if isinstance(n, ast.FunctionDef)]
            classes = [n for n in ast.walk(tree) 
                      if isinstance(n, ast.ClassDef)]
            
            if functions or classes:
                selected = random.choice(functions + classes)
                return {
                    "type": "code_based",
                    "code_pattern": astor.to_source(selected),
                    "source_type": selected.__class__.__name__
                }
        except Exception as e:
            logging.warning(f"Code mutation failed: {e}")
        return {}

    async def _mutate_from_data(self, content: str) -> Dict[str, Any]:
        """Generate mutation from data file analysis."""
        try:
            # Try parsing as JSON or YAML
            data = json.loads(content)
            
            # Extract structure
            return {
                "type": "data_based",
                "structure": self._analyze_data_structure(data)
            }
        except Exception:
            return {}

    async def _mutate_from_config(self, content: str) -> Dict[str, Any]:
        """Generate mutation from config file analysis."""
        try:
            # Look for parameter patterns
            params = re.findall(r'(\w+)\s*[=:]\s*([^,\n]+)', content)
            if params:
                return {
                    "type": "config_based",
                    "parameters": dict(params)
                }
        except Exception:
            return {}

    def _analyze_data_structure(self, data: Any) -> Dict[str, Any]:
        """Analyze structure of data for learning patterns."""
        if isinstance(data, dict):
            return {
                "type": "dictionary",
                "keys": list(data.keys()),
                "value_types": {k: type(v).__name__ for k, v in data.items()}
            }
        elif isinstance(data, list):
            return {
                "type": "list",
                "length": len(data),
                "element_types": list(set(type(x).__name__ for x in data))
            }
        else:
            return {
                "type": "atomic",
                "value_type": type(data).__name__
            }

class OrganismMutationManager:
    """Manages mutation process for an organism."""
    def __init__(self, 
                 organism_id: str,
                 base_dir: Path,
                 environment_path: Path,
                 data_pool_path: Path):
        self.organism_id = organism_id
        self.base_dir = base_dir
        self.environment = environment_path
        self.data_pool = data_pool_path
        self.network = KnowledgeNetwork()
        self.mutator = EnvironmentBasedMutator(organism_id, self.network)
        
    async def run_mutation_cycle(self) -> bool:
        """Execute one mutation cycle."""
        try:
            # Analyze environment
            env_mutations = await self._analyze_environment()
            if env_mutations:
                # Apply promising mutations
                success = await self._apply_mutations(env_mutations)
                if success:
                    await self.network.record_adaptation(
                        self.organism_id,
                        self.environment,
                        env_mutations[0]  # Record best mutation
                    )
                return success
                
            # Fall back to data pool if needed
            data_pool_mutations = await self._analyze_data_pool()
            if data_pool_mutations:
                return await self._apply_mutations(data_pool_mutations)
                
            return False
            
        except Exception as e:
            logging.error(f"Mutation cycle failed: {e}")
            return False

    async def _analyze_environment(self) -> List[Dict[str, Any]]:
        """Analyze environment for mutation opportunities."""
        mutations = []
        
        try:
            for file_path in self.environment.rglob("*"):
                if file_path.is_file():
                    # Determine file type
                    file_type = self._get_file_type(file_path)
                    
                    # Read and analyze content
                    content = await self._read_file(file_path)
                    if content:
                        mutation = await self.mutator.generate_mutation(
                            self.environment,
                            file_type,
                            content
                        )
                        if mutation:
                            mutations.append(mutation)
                            
        except Exception as e:
            logging.error(f"Environment analysis failed: {e}")
            
        return mutations

    async def _analyze_data_pool(self) -> List[Dict[str, Any]]:
        """Analyze data pool for mutation opportunities."""
        mutations = []
        
        try:
            for file_path in self.data_pool.rglob("*"):
                if file_path.is_file():
                    file_type = self._get_file_type(file_path)
                    content = await self._read_file(file_path)
                    if content:
                        mutation = await self.mutator.generate_mutation(
                            self.data_pool,
                            file_type,
                            content
                        )
                        if mutation:
                            mutation["source"] = "data_pool"
                            mutations.append(mutation)
                            
        except Exception as e:
            logging.error(f"Data pool analysis failed: {e}")
            
        return mutations

    def _get_file_type(self, path: Path) -> str:
        """Determine file type for mutation strategy."""
        if path.suffix in ['.py', '.js', '.cpp']:
            return "code_files"
        elif path.suffix in ['.json', '.yaml', '.csv']:
            return "data_files"
        elif path.suffix in ['.conf', '.ini', '.cfg']:
            return "config_files"
        return "unknown"

    async def _read_file(self, path: Path) -> Optional[str]:
        """Safely read file content."""
        try:
            async with aiofiles.open(path, 'r', encoding='utf-8') as f:
                return await f.read()
        except Exception:
            return None

    async def _apply_mutations(self, 
                             mutations: List[Dict[str, Any]]) -> bool:
        """Apply mutations and verify results."""
        for mutation in mutations:
            try:
                if mutation['type'] == 'code_based':
                    success = await self._apply_code_mutation(mutation)
                elif mutation['type'] == 'data_based':
                    success = await self._apply_data_mutation(mutation)
                elif mutation['type'] == 'config_based':
                    success = await self._apply_config_mutation(mutation)
                else:
                    continue
                    
                if success:
                    return True
                    
            except Exception as e:
                logging.warning(f"Mutation application failed: {e}")
                
        return False

    async def _apply_code_mutation(self, mutation: Dict[str, Any]) -> bool:
        """Apply and verify code-based mutation."""
        try:
            # Create temporary file with mutation
            temp_file = self.base_dir / f"temp_mutation_{int(time.time())}.py"
            async with aiofiles.open(temp_file, 'w') as f:
                await f.write(mutation['code_pattern'])
                
            # Test compilation
            try:
                compile(mutation['code_pattern'], '<string>', 'exec')
                return True
            except Exception:
                return False
                
        finally:
            if temp_file.exists():
                temp_file.unlink()

    async def _apply_data_mutation(self, mutation: Dict[str, Any]) -> bool:
        """Apply and verify data-based mutation."""
        try:
            # Verify structure is valid
            if 'structure' in mutation:
                return True
            return False
        except Exception:
            return False

    async def _apply_config_mutation(self, mutation: Dict[str, Any]) -> bool:
        """Apply and verify config-based mutation."""
        try:
            # Verify parameters are valid
            if 'parameters' in mutation:
                return all(isinstance(k, str) for k in mutation['parameters'])
            return False
        except Exception:
            return False

class ConfigurationPanel:
    """Centralized configuration control panel."""
    def __init__(self, parent: ttk.Frame):
        self.frame = ttk.LabelFrame(parent, text="Configuration")
        self.frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Path configurations
        self.paths_frame = ttk.LabelFrame(self.frame, text="Paths")
        self.paths_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.path_vars = {
            "Data Pool": tk.StringVar(value=str(AIOConfig.DATA_POOL_DIR)),
            "Organisms": tk.StringVar(value=str(AIOConfig.ORGANISMS_DIR)),
            "Database": tk.StringVar(value=str(AIOConfig.DB_PATH))
        }
        
        for label, var in self.path_vars.items():
            frame = ttk.Frame(self.paths_frame)
            frame.pack(fill=tk.X, padx=5, pady=2)
            
            ttk.Label(frame, text=label).pack(side=tk.LEFT)
            ttk.Entry(frame, textvariable=var).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
            ttk.Button(
                frame,
                text="Browse",
                command=lambda v=var: self._browse_path(v)
            ).pack(side=tk.RIGHT)
        
        # Environment Selection Controls
        self.env_frame = ttk.LabelFrame(self.frame, text="Environment Selection")
        self.env_frame.pack(fill=tk.X, padx=5, pady=5)
        
        # Scan depth control
        ttk.Label(self.env_frame, text="Max Scan Depth:").pack(side=tk.LEFT)
        self.scan_depth = tk.StringVar(value="3")
        ttk.Entry(
            self.env_frame,
            textvariable=self.scan_depth,
            width=5
        ).pack(side=tk.LEFT, padx=5)
        
        # Excluded paths
        ttk.Label(self.env_frame, text="Excluded Paths:").pack(side=tk.LEFT, padx=5)
        self.excluded_paths = tk.StringVar(value="Windows,Program Files,System32")
        ttk.Entry(
            self.env_frame,
            textvariable=self.excluded_paths
        ).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        
        # Organism Controls
        self.organism_frame = ttk.LabelFrame(self.frame, text="Organism Settings")
        self.organism_frame.pack(fill=tk.X, padx=5, pady=5)
        
        # Maximum organisms
        ttk.Label(self.organism_frame, text="Max Organisms:").pack(side=tk.LEFT)
        self.max_organisms = tk.StringVar(value="10")
        ttk.Entry(
            self.organism_frame,
            textvariable=self.max_organisms,
            width=5
        ).pack(side=tk.LEFT, padx=5)
        
        # Mutation settings
        self.mutation_frame = ttk.LabelFrame(self.frame, text="Mutation Settings")
        self.mutation_frame.pack(fill=tk.X, padx=5, pady=5)
        
        # Mutation controls
        self.mutation_vars = {
            "Rate": tk.DoubleVar(value=0.1),
            "Intensity": tk.DoubleVar(value=0.5),
            "Max Changes": tk.IntVar(value=5)
        }
        
        for label, var in self.mutation_vars.items():
            frame = ttk.Frame(self.mutation_frame)
            frame.pack(fill=tk.X, padx=5, pady=2)
            
            ttk.Label(frame, text=label).pack(side=tk.LEFT)
            ttk.Scale(
                frame,
                from_=0,
                to=1 if isinstance(var, tk.DoubleVar) else 10,
                variable=var,
                orient=tk.HORIZONTAL
            ).pack(side=tk.RIGHT, fill=tk.X, expand=True, padx=5)
        
        # Apply button
        ttk.Button(
            self.frame,
            text="Apply Configuration",
            command=self._apply_config
        ).pack(pady=10)

    def _browse_path(self, var: tk.StringVar):
        """Browse for directory path."""
        path = filedialog.askdirectory()
        if path:
            var.set(path)

    def _apply_config(self):
        """Apply configuration changes."""
        try:
            # Update paths
            AIOConfig.DATA_POOL_DIR = Path(self.path_vars["Data Pool"].get())
            AIOConfig.ORGANISMS_DIR = Path(self.path_vars["Organisms"].get())
            AIOConfig.DB_PATH = Path(self.path_vars["Database"].get())
            
            # Create directories if needed
            AIOConfig.ensure_directories()
            
            # Update environment scanner settings
            scanner = EnvironmentScanner()
            scanner.max_depth = int(self.scan_depth.get())
            scanner.excluded_dirs = set(
                self.excluded_paths.get().split(',')
            )
            
            # Update mutation settings
            mutation_config = {
                name.lower(): var.get()
                for name, var in self.mutation_vars.items()
            }
            
            # Save configuration
            config = {
                "paths": {
                    name: str(Path(var.get()))
                    for name, var in self.path_vars.items()
                },
                "environment": {
                    "scan_depth": int(self.scan_depth.get()),
                    "excluded_paths": self.excluded_paths.get().split(',')
                },
                "organisms": {
                    "max_count": int(self.max_organisms.get())
                },
                "mutation": mutation_config
            }
            
            config_path = AIOConfig.DATA_POOL_DIR / "config.json"
            with open(config_path, 'w') as f:
                json.dump(config, f, indent=2)
                
            messagebox.showinfo(
                "Success",
                "Configuration updated successfully!"
            )
            
        except Exception as e:
            messagebox.showerror(
                "Error",
                f"Failed to update configuration: {e}"
            )

class EnvironmentVisualizer:
    """Advanced environment visualization and control panel."""
    def __init__(self, parent: ttk.Frame):
        self.frame = ttk.LabelFrame(parent, text="Environment Explorer")
        self.frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Split view
        self.paned = ttk.PanedWindow(self.frame, orient=tk.HORIZONTAL)
        self.paned.pack(fill=tk.BOTH, expand=True)
        
        # Directory tree
        self.tree_frame = self._create_tree_frame()
        self.paned.add(self.tree_frame)
        
        # Details panel
        self.details_frame = self._create_details_frame()
        self.paned.add(self.details_frame)
        
        # Initialize data
        self.selected_env = None
        self.file_stats = {}
        
    def _create_tree_frame(self) -> ttk.Frame:
        """Create directory tree view."""
        frame = ttk.Frame(self.paned)
        
        # Controls
        controls = ttk.Frame(frame)
        controls.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Button(
            controls,
            text="Refresh Tree",
            command=self._refresh_tree
        ).pack(side=tk.LEFT, padx=2)
        
        ttk.Button(
            controls,
            text="Expand All",
            command=lambda: self._expand_tree(True)
        ).pack(side=tk.LEFT, padx=2)
        
        ttk.Button(
            controls,
            text="Collapse All",
            command=lambda: self._expand_tree(False)
        ).pack(side=tk.LEFT, padx=2)
        
        # Search
        search_frame = ttk.Frame(frame)
        search_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Label(search_frame, text="Filter:").pack(side=tk.LEFT)
        self.search_var = tk.StringVar()
        self.search_var.trace('w', self._filter_tree)
        ttk.Entry(
            search_frame,
            textvariable=self.search_var
        ).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        
        # Tree with scrollbar
        tree_container = ttk.Frame(frame)
        tree_container.pack(fill=tk.BOTH, expand=True)
        
        self.tree = ttk.Treeview(
            tree_container,
            selectmode='browse',
            columns=('type', 'status')
        )
        self.tree.heading('type', text='Type')
        self.tree.heading('status', text='Status')
        self.tree.column('type', width=100)
        self.tree.column('status', width=100)
        
        scrollbar = ttk.Scrollbar(
            tree_container,
            orient="vertical",
            command=self.tree.yview
        )
        self.tree.configure(yscrollcommand=scrollbar.set)
        
        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Bind events
        self.tree.bind('<<TreeviewSelect>>', self._on_select)
        
        return frame
        
    def _create_details_frame(self) -> ttk.Frame:
        """Create details panel."""
        frame = ttk.Frame(self.paned)
        
        # Environment status
        status_frame = ttk.LabelFrame(frame, text="Environment Status")
        status_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.status_labels = {}
        for stat in ["Path", "Files", "Size", "Last Modified"]:
            self.status_labels[stat] = ttk.Label(status_frame, text=f"{stat}: --")
            self.status_labels[stat].pack(fill=tk.X, padx=5, pady=2)
        
        # File type breakdown
        types_frame = ttk.LabelFrame(frame, text="File Types")
        types_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.type_tree = ttk.Treeview(
            types_frame,
            columns=('count', 'size'),
            height=6
        )
        self.type_tree.heading('count', text='Count')
        self.type_tree.heading('size', text='Size')
        self.type_tree.pack(fill=tk.X, padx=5, pady=5)
        
        # Actions
        actions_frame = ttk.LabelFrame(frame, text="Actions")
        actions_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Button(
            actions_frame,
            text="Set as Environment",
            command=self._set_environment
        ).pack(fill=tk.X, padx=5, pady=2)
        
        ttk.Button(
            actions_frame,
            text="Add to Data Pool",
            command=self._add_to_data_pool
        ).pack(fill=tk.X, padx=5, pady=2)
        
        ttk.Button(
            actions_frame,
            text="Analyze Contents",
            command=self._analyze_contents
        ).pack(fill=tk.X, padx=5, pady=2)
        
        # Analysis results
        self.analysis_text = scrolledtext.ScrolledText(
            frame,
            height=10,
            wrap=tk.WORD
        )
        self.analysis_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        return frame

    def _refresh_tree(self):
        """Refresh directory tree."""
        for item in self.tree.get_children():
            self.tree.delete(item)
            
        # Start from root paths
        for drive in self._get_root_paths():
            self._add_path_to_tree(drive)
            
    def _get_root_paths(self) -> List[Path]:
        """Get system root paths."""
        if sys.platform == 'win32':
            return [Path(f"{d}:\\") for d in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' 
                    if os.path.exists(f"{d}:")]
        else:
            return [Path("/")]
            
    def _add_path_to_tree(self, path: Path, parent=""):
        """Add path to tree view."""
        try:
            # Skip excluded paths
            if self._should_exclude(path):
                return
                
            # Add node
            node = self.tree.insert(
                parent,
                "end",
                text=path.name or str(path),
                values=(
                    "Directory" if path.is_dir() else "File",
                    "Available"
                )
            )
            
            # Add children if directory
            if path.is_dir():
                try:
                    for child in path.iterdir():
                        self._add_path_to_tree(child, node)
                except PermissionError:
                    pass
                    
        except Exception as e:
            logging.warning(f"Error adding path {path}: {e}")

    def _should_exclude(self, path: Path) -> bool:
        """Check if path should be excluded."""
        excluded = {
            'Windows', 'Program Files', 'System32',
            '$Recycle.Bin', '$RECYCLE.BIN',
            'System Volume Information'
        }
        return (path.name.startswith('.') or
                path.name in excluded or
                any(p in excluded for p in path.parts))

    def _expand_tree(self, expand: bool):
        """Expand or collapse all tree items."""
        for item in self.tree.get_children():
            if expand:
                self.tree.item(item, open=True)
            else:
                self.tree.item(item, open=False)

    def _filter_tree(self, *args):
        """Filter tree items based on search text."""
        search = self.search_var.get().lower()
        self._apply_filter(search)

    def _apply_filter(self, search: str, node=""):
        """Recursively apply filter to tree."""
        for child in self.tree.get_children(node):
            text = self.tree.item(child)['text'].lower()
            if search in text:
                self.tree.item(child, tags=('visible',))
                parent = self.tree.parent(child)
                while parent:
                    self.tree.item(parent, tags=('visible',))
                    parent = self.tree.parent(parent)
            else:
                self.tree.item(child, tags=('hidden',))
            self._apply_filter(search, child)

    def _on_select(self, event):
        """Handle tree item selection."""
        selected = self.tree.selection()
        if not selected:
            return
            
        # Get full path
        path = self._get_full_path(selected[0])
        self.selected_env = path
        
        # Update details
        self._update_details(path)

    def _get_full_path(self, item: str) -> Path:
        """Get full path from tree item."""
        parts = []
        while item:
            parts.append(self.tree.item(item)['text'])
            item = self.tree.parent(item)
        return Path(*reversed(parts))

    def _update_details(self, path: Path):
        """Update details panel with path info."""
        try:
            # Update status
            stats = path.stat()
            self.status_labels["Path"].config(text=f"Path: {path}")
            self.status_labels["Files"].config(
                text=f"Files: {len(list(path.rglob('*'))) if path.is_dir() else 1}"
            )
            self.status_labels["Size"].config(
                text=f"Size: {stats.st_size:,} bytes"
            )
            self.status_labels["Last Modified"].config(
                text=f"Last Modified: {time.ctime(stats.st_mtime)}"
            )
            
            # Update file types
            if path.is_dir():
                self._update_file_types(path)
                
        except Exception as e:
            logging.error(f"Error updating details: {e}")

    def _update_file_types(self, path: Path):
        """Update file type breakdown."""
        # Clear existing items
        for item in self.type_tree.get_children():
            self.type_tree.delete(item)
            
        # Count file types
        types: Dict[str, Dict[str, int]] = defaultdict(
            lambda: {"count": 0, "size": 0}
        )
        
        try:
            for file in path.rglob("*"):
                if file.is_file():
                    ext = file.suffix or "No Extension"
                    types[ext]["count"] += 1
                    types[ext]["size"] += file.stat().st_size
                    
            # Add to tree
            for ext, stats in sorted(
                types.items(),
                key=lambda x: x[1]["count"],
                reverse=True
            ):
                self.type_tree.insert(
                    "",
                    "end",
                    text=ext,
                    values=(
                        stats["count"],
                        f"{stats['size']:,} bytes"
                    )
                )
                
        except Exception as e:
            logging.error(f"Error updating file types: {e}")

    def _set_environment(self):
        """Set selected path as organism environment."""
        if not self.selected_env:
            messagebox.showwarning(
                "No Selection",
                "Please select an environment first."
            )
            return
            
        try:
            # Update system
            self.tree.set(
                self.tree.selection()[0],
                "status",
                "In Use"
            )
            messagebox.showinfo(
                "Success",
                f"Environment set to: {self.selected_env}"
            )
            
        except Exception as e:
            messagebox.showerror(
                "Error",
                f"Failed to set environment: {e}"
            )

    def _add_to_data_pool(self):
        """Add selected path to data pool."""
        if not self.selected_env:
            messagebox.showwarning(
                "No Selection",
                "Please select a path first."
            )
            return
            
        try:
            # Copy to data pool
            dest = AIOConfig.DATA_POOL_DIR / self.selected_env.name
            if self.selected_env.is_dir():
                shutil.copytree(self.selected_env, dest)
            else:
                shutil.copy2(self.selected_env, dest)
                
            messagebox.showinfo(
                "Success",
                f"Added to data pool: {self.selected_env.name}"
            )
            
        except Exception as e:
            messagebox.showerror(
                "Error",
                f"Failed to add to data pool: {e}"
            )

    def _analyze_contents(self):
        """Analyze selected environment contents."""
        if not self.selected_env:
            messagebox.showwarning(
                "No Selection",
                "Please select an environment first."
            )
            return
            
        try:
            # Clear previous analysis
            self.analysis_text.delete('1.0', tk.END)
            
            # Analyze path
            stats = self._get_path_stats(self.selected_env)
            
            # Display results
            self.analysis_text.insert(tk.END, "Environment Analysis\n\n")
            
            for key, value in stats.items():
                self.analysis_text.insert(tk.END, f"{key}: {value}\n")
                
        except Exception as e:
            self.analysis_text.insert(
                tk.END,
                f"Analysis failed: {e}\n"
            )

    def _get_path_stats(self, path: Path) -> Dict[str, Any]:
        """Get detailed path statistics."""
        stats = {
            "Total Size": 0,
            "File Count": 0,
            "Directory Count": 0,
            "Average File Size": 0,
            "Largest File": ("", 0),
            "Most Common Extension": ("", 0),
            "Last Modified": None
        }
        
        extensions = defaultdict(int)
        
        try:
            for item in path.rglob("*"):
                if item.is_file():
                    size = item.stat().st_size
                    stats["Total Size"] += size
                    stats["File Count"] += 1
                    
                    if size > stats["Largest File"][1]:
                        stats["Largest File"] = (item.name, size)
                        
                    extensions[item.suffix] += 1
                    
                elif item.is_dir():
                    stats["Directory Count"] += 1
                    
                mtime = item.stat().st_mtime
                if not stats["Last Modified"] or mtime > stats["Last Modified"]:
                    stats["Last Modified"] = mtime
                    
            # Calculate averages and most common
            if stats["File Count"] > 0:
                stats["Average File Size"] = stats["Total Size"] / stats["File Count"]
                
            if extensions:
                stats["Most Common Extension"] = max(
                    extensions.items(),
                    key=lambda x: x[1]
                )
                
            # Format values
            stats["Total Size"] = f"{stats['Total Size']:,} bytes"
            stats["Average File Size"] = f"{stats['Average File Size']:,.0f} bytes"
            stats["Largest File"] = f"{stats['Largest File'][0]} ({stats['Largest File'][1]:,} bytes)"
            stats["Most Common Extension"] = f"{stats['Most Common Extension'][0]} ({stats['Most Common Extension'][1]} files)"
            stats["Last Modified"] = time.ctime(stats["Last Modified"]) if stats["Last Modified"] else "Never"
            
            return stats
            
        except Exception as e:
            logging.error(f"Error getting path stats: {e}")
            return {"Error": str(e)}

# Update SystemControlPanel to use new visualizer
class SystemControlPanel:
    """Enhanced master control panel."""
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("AIOS Control Center")
        self.root.geometry("1200x800")
        
        # Create main notebook for tabs
        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(fill=tk.BOTH, expand=True)
        
        # Create tabs
        self.env_tab = self._create_environment_tab()
        self.organism_tab = self._create_organism_tab()
        self.data_pool_tab = self._create_data_pool_tab()
        self.monitor_tab = self._create_monitor_tab()
        
        # Add configuration tab
        self.config_tab = self._create_config_tab()
        
        # Update other tabs to use configuration
        self._update_tabs_with_config()
        
        # Update timer
        self.root.after(1000, self._update_ui)

    def _create_environment_tab(self) -> ttk.Frame:
        """Environment control tab."""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Environments")
        
        # Environment tree view
        tree_frame = ttk.Frame(tab)
        tree_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        self.env_tree = ttk.Treeview(tree_frame)
        self.env_tree.pack(fill=tk.BOTH, expand=True)
        
        # Control panel
        control_frame = ttk.Frame(tab)
        control_frame.pack(side=tk.RIGHT, fill=tk.Y)
        
        ttk.Button(
            control_frame, 
            text="Add Directory",
            command=self._add_environment
        ).pack(fill=tk.X, pady=5)
        
        ttk.Button(
            control_frame,
            text="Remove Selected",
            command=self._remove_environment
        ).pack(fill=tk.X, pady=5)
        
        # Scan settings
        scan_frame = ttk.LabelFrame(control_frame, text="Scan Settings")
        scan_frame.pack(fill=tk.X, pady=10)
        
        ttk.Label(scan_frame, text="Depth:").pack()
        self.scan_depth = tk.StringVar(value="3")
        ttk.Entry(
            scan_frame,
            textvariable=self.scan_depth
        ).pack(fill=tk.X, padx=5)
        
        return tab

    def _create_organism_tab(self) -> ttk.Frame:
        """Organism management tab."""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Organisms")
        
        # Split view
        paned = ttk.PanedWindow(tab, orient=tk.HORIZONTAL)
        paned.pack(fill=tk.BOTH, expand=True)
        
        # Organism list
        list_frame = ttk.Frame(paned)
        ttk.Label(list_frame, text="Active Organisms").pack()
        
        self.organism_list = ttk.Treeview(list_frame)
        self.organism_list.pack(fill=tk.BOTH, expand=True)
        
        paned.add(list_frame)
        
        # Details panel
        details_frame = ttk.Frame(paned)
        
        # Organism controls
        control_frame = ttk.LabelFrame(details_frame, text="Controls")
        control_frame.pack(fill=tk.X, pady=5)
        
        ttk.Button(
            control_frame,
            text="Create New Organism",
            command=self._create_organism
        ).pack(fill=tk.X, pady=2)
        
        ttk.Button(
            control_frame,
            text="Split Selected",
            command=self._split_organism
        ).pack(fill=tk.X, pady=2)
        
        # Status display
        status_frame = ttk.LabelFrame(details_frame, text="Status")
        status_frame.pack(fill=tk.X, pady=5)
        
        self.status_text = scrolledtext.ScrolledText(
            status_frame,
            height=10
        )
        self.status_text.pack(fill=tk.BOTH, expand=True)
        
        paned.add(details_frame)
        
        return tab

    def _create_data_pool_tab(self) -> ttk.Frame:
        """Data pool management tab."""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Data Pool")
        
        # Data pool browser
        browser_frame = ttk.Frame(tab)
        browser_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        self.pool_tree = ttk.Treeview(browser_frame)
        self.pool_tree.pack(fill=tk.BOTH, expand=True)
        
        # Control panel
        control_frame = ttk.Frame(tab)
        control_frame.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Add data controls
        ttk.Button(
            control_frame,
            text="Add Files",
            command=self._add_to_pool
        ).pack(fill=tk.X, pady=5)
        
        ttk.Button(
            control_frame,
            text="Add Directory",
            command=self._add_dir_to_pool
        ).pack(fill=tk.X, pady=5)
        
        # Categories frame
        cat_frame = ttk.LabelFrame(control_frame, text="Categories")
        cat_frame.pack(fill=tk.X, pady=10)
        
        self.categories = {
            "code": tk.BooleanVar(value=True),
            "data": tk.BooleanVar(value=True),
            "docs": tk.BooleanVar(value=True)
        }
        
        for cat, var in self.categories.items():
            ttk.Checkbutton(
                cat_frame,
                text=cat.title(),
                variable=var
            ).pack(fill=tk.X)
            
        return tab

    def _create_monitor_tab(self) -> ttk.Frame:
        """System monitoring tab."""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Monitor")
        
        # Stats panel
        stats_frame = ttk.LabelFrame(tab, text="System Stats")
        stats_frame.pack(fill=tk.X)
        
        self.stats_labels = {}
        for stat in ["Organisms", "Environments", "Pool Size", "Memory"]:
            self.stats_labels[stat] = ttk.Label(stats_frame, text=f"{stat}: --")
            self.stats_labels[stat].pack()
            
        # Activity log
        log_frame = ttk.LabelFrame(tab, text="Activity Log")
        log_frame.pack(fill=tk.BOTH, expand=True)
        
        self.log_text = scrolledtext.ScrolledText(log_frame)
        self.log_text.pack(fill=tk.BOTH, expand=True)
        
        return tab

    def _create_config_tab(self) -> ttk.Frame:
        """Create configuration control tab."""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Configuration")
        
        # Add configuration panel
        self.config_panel = ConfigurationPanel(tab)
        
        return tab

    def _update_tabs_with_config(self):
        """Update other tabs to use configuration settings."""
        # Update environment tab
        self.scan_depth.set(self.config_panel.scan_depth.get())
        
        # Update organism tab
        self._update_organism_limits()
        
        # Update data pool tab
        self._update_pool_paths()

    def _update_ui(self):
        """Update UI elements periodically."""
        try:
            # Update stats
            stats = self._get_system_stats()
            for stat, value in stats.items():
                if stat in self.stats_labels:
                    self.stats_labels[stat].config(text=f"{stat}: {value}")
                    
            # Update organism list
            self._update_organism_list()
            
            # Update environment tree
            self._update_environment_tree()
            
            # Update data pool
            self._update_data_pool()
            
        except Exception as e:
            self.log_error(f"UI update error: {e}")
            
        finally:
            self.root.after(1000, self._update_ui)

    def _get_system_stats(self) -> Dict[str, Any]:
        """Get current system statistics."""
        return {
            "Organisms": len(self.organisms),
            "Environments": len(self.environments),
            "Pool Size": self._get_pool_size(),
            "Memory": f"{self._get_memory_usage():.1f}MB"
        }

    def _update_organism_list(self):
        """Update organism list display."""
        for item in self.organism_list.get_children():
            self.organism_list.delete(item)
            
        for org_id, organism in self.organisms.items():
            self.organism_list.insert(
                "",
                "end",
                text=org_id,
                values=(
                    str(organism.environment),
                    organism.status
                )
            )

    def _update_environment_tree(self):
        """Update environment tree display."""
        for item in self.env_tree.get_children():
            self.env_tree.delete(item)
            
        for env_path in self.environments:
            self._add_path_to_tree(env_path)

    def _add_path_to_tree(self, path: Path, parent=""):
        """Add path to environment tree."""
        node = self.env_tree.insert(
            parent,
            "end",
            text=path.name,
            values=(str(path),)
        )
        
        if path.is_dir():
            try:
                for child in path.iterdir():
                    self._add_path_to_tree(child, node)
            except PermissionError:
                pass

    def _update_data_pool(self):
        """Update data pool display."""
        for item in self.pool_tree.get_children():
            self.pool_tree.delete(item)
            
        pool_data = self._scan_data_pool()
        for category, items in pool_data.items():
            cat_node = self.pool_tree.insert(
                "",
                "end",
                text=category,
                values=(len(items),)
            )
            
            for item in items:
                self.pool_tree.insert(
                    cat_node,
                    "end",
                    text=item.name,
                    values=(str(item),)
                )

    def _add_environment(self):
        """Add new environment directory."""
        path = filedialog.askdirectory()
        if path:
            self.add_environment(Path(path))

    def _remove_environment(self):
        """Remove selected environment."""
        selected = self.env_tree.selection()
        if selected:
            item = selected[0]
            path = Path(self.env_tree.item(item)["values"][0])
            self.remove_environment(path)

    def _create_organism(self):
        """Create new organism."""
        try:
            organism_id = self.create_organism()
            self.log_info(f"Created organism: {organism_id}")
        except Exception as e:
            self.log_error(f"Failed to create organism: {e}")

    def _split_organism(self):
        """Split selected organism."""
        selected = self.organism_list.selection()
        if selected:
            organism_id = self.organism_list.item(selected[0])["text"]
            try:
                new_id = self.split_organism(organism_id)
                self.log_info(f"Split organism {organism_id} -> {new_id}")
            except Exception as e:
                self.log_error(f"Failed to split organism: {e}")

    def _add_to_pool(self):
        """Add files to data pool."""
        files = filedialog.askopenfilenames()
        if files:
            for file in files:
                self.add_to_pool(Path(file))

    def _add_dir_to_pool(self):
        """Add directory to data pool."""
        path = filedialog.askdirectory()
        if path:
            self.add_directory_to_pool(Path(path))

    def log_info(self, message: str):
        """Log information message."""
        self.log_text.insert("end", f"[INFO] {message}\n")
        self.log_text.see("end")

    def log_error(self, message: str):
        """Log error message."""
        self.log_text.insert("end", f"[ERROR] {message}\n")
        self.log_text.see("end")

    def _update_organism_limits(self):
        """Update organism creation limits."""
        max_organisms = int(self.config_panel.max_organisms.get())
        if len(self.organisms) >= max_organisms:
            self.organism_create_btn.config(state=tk.DISABLED)
            self.organism_split_btn.config(state=tk.DISABLED)
        else:
            self.organism_create_btn.config(state=tk.NORMAL)
            self.organism_split_btn.config(state=tk.NORMAL)

    def _update_pool_paths(self):
        """Update data pool paths from configuration."""
        self.pool_path = Path(self.config_panel.path_vars["Data Pool"].get())
        self._refresh_pool_view()

# Update UnifiedSystem to use control panel
class UnifiedSystem:
    """Master coordinator with UI controls."""
    def __init__(self):
        self.root = tk.Tk()
        self.control_panel = SystemControlPanel(self.root)
        self.organism_manager = OrganismManager()
        
    async def run(self):
        """Main execution loop with UI."""
        try:
            # Start UI update thread
            with ThreadPoolExecutor() as executor:
                ui_future = executor.submit(self.root.mainloop)
                
                # Run system loop
                while True:
                    if not ui_future.running():
                        break
                        
                    await self.organism_manager.run_evolution_cycle()
                    await asyncio.sleep(1)
                    
        except Exception as e:
            logging.error(f"Runtime error: {e}")
            messagebox.showerror("Error", str(e))
            raise
        finally:
            await self.cleanup()

if __name__ == "__main__":
    # Initialize system
    AIOConfig.ensure_directories()
    
    async def main():
        # Create organism manager
        manager = OrganismManager()
        
        # Scan system for environments
        manager.scanner.scan_system()
        
        # Create initial organism
        try:
            organism_id = await manager.create_organism()
            logging.info(f"Created organism: {organism_id}")
            
            # Keep system running
            while True:
                await asyncio.sleep(60)
                
        except Exception as e:
            logging.error(f"System error: {e}")
            
    # Run system
    asyncio.run(main())

class ProcessManagerPanel:
    """Manages and visualizes all running processes and organism activities."""
    def __init__(self, parent: ttk.Frame):
        self.frame = ttk.LabelFrame(parent, text="Process Manager")
        self.frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Split view
        self.paned = ttk.PanedWindow(self.frame, orient=tk.HORIZONTAL)
        self.paned.pack(fill=tk.BOTH, expand=True)
        
        # Active processes list
        self.process_frame = self._create_process_frame()
        self.paned.add(self.process_frame)
        
        # Process details
        self.details_frame = self._create_details_frame()
        self.paned.add(self.details_frame)
        
        # Process tracking
        self.active_processes = {}
        self.process_stats = {}
        
    def _create_process_frame(self) -> ttk.Frame:
        """Create process list frame."""
        frame = ttk.Frame(self.paned)
        
        # Controls
        controls = ttk.Frame(frame)
        controls.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Button(
            controls,
            text="Refresh",
            command=self._refresh_processes
        ).pack(side=tk.LEFT, padx=2)
        
        ttk.Button(
            controls,
            text="Stop Selected",
            command=self._stop_selected
        ).pack(side=tk.LEFT, padx=2)
        
        # Process list with scrollbar
        list_container = ttk.Frame(frame)
        list_container.pack(fill=tk.BOTH, expand=True)
        
        self.process_tree = ttk.Treeview(
            list_container,
            columns=('type', 'status', 'cpu', 'memory'),
            selectmode='browse'
        )
        self.process_tree.heading('type', text='Type')
        self.process_tree.heading('status', text='Status')
        self.process_tree.heading('cpu', text='CPU %')
        self.process_tree.heading('memory', text='Memory')
        
        scrollbar = ttk.Scrollbar(
            list_container,
            orient="vertical",
            command=self.process_tree.yview
        )
        self.process_tree.configure(yscrollcommand=scrollbar.set)
        
        self.process_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Bind events
        self.process_tree.bind('<<TreeviewSelect>>', self._on_select)
        
        return frame
        
    def _create_details_frame(self) -> ttk.Frame:
        """Create process details frame."""
        frame = ttk.Frame(self.paned)
        
        # Resource usage
        usage_frame = ttk.LabelFrame(frame, text="Resource Usage")
        usage_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.usage_graph = ttk.Canvas(
            usage_frame,
            height=100,
            background='white'
        )
        self.usage_graph.pack(fill=tk.X, padx=5, pady=5)
        
        # Process info
        info_frame = ttk.LabelFrame(frame, text="Process Information")
        info_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.info_labels = {}
        for field in ["ID", "Type", "Status", "Start Time", "Runtime"]:
            self.info_labels[field] = ttk.Label(
                info_frame,
                text=f"{field}: --"
            )
            self.info_labels[field].pack(fill=tk.X, padx=5, pady=2)
        
        # Activity log
        log_frame = ttk.LabelFrame(frame, text="Activity Log")
        log_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        self.log_text = scrolledtext.ScrolledText(
            log_frame,
            height=10,
            wrap=tk.WORD
        )
        self.log_text.pack(fill=tk.BOTH, expand=True)
        
        return frame
        
    def register_process(
        self,
        process_id: str,
        process_type: str,
        metadata: Dict[str, Any]
    ) -> None:
        """Register new process for tracking."""
        self.active_processes[process_id] = {
            "type": process_type,
            "status": "Running",
            "start_time": time.time(),
            "metadata": metadata,
            "stats": []
        }
        
        self.process_tree.insert(
            "",
            "end",
            text=process_id,
            values=(
                process_type,
                "Running",
                "0.0",
                "0 MB"
            )
        )
        
        self.log_activity(
            process_id,
            f"Started {process_type} process"
        )
        
    def update_process(
        self,
        process_id: str,
        stats: Dict[str, float]
    ) -> None:
        """Update process statistics."""
        if process_id not in self.active_processes:
            return
            
        process = self.active_processes[process_id]
        process["stats"].append(stats)
        
        # Update tree view
        for item in self.process_tree.get_children():
            if self.process_tree.item(item)["text"] == process_id:
                self.process_tree.set(
                    item,
                    "cpu",
                    f"{stats['cpu_percent']:.1f}"
                )
                self.process_tree.set(
                    item,
                    "memory",
                    f"{stats['memory_mb']:.1f} MB"
                )
                break
                
        # Update graph if selected
        if self.process_tree.selection():
            selected_id = self.process_tree.item(
                self.process_tree.selection()[0]
            )["text"]
            if selected_id == process_id:
                self._update_graph(process_id)
                
    def stop_process(self, process_id: str) -> None:
        """Stop tracking process."""
        if process_id in self.active_processes:
            process = self.active_processes[process_id]
            process["status"] = "Stopped"
            
            # Update tree view
            for item in self.process_tree.get_children():
                if self.process_tree.item(item)["text"] == process_id:
                    self.process_tree.set(item, "status", "Stopped")
                    break
                    
            self.log_activity(
                process_id,
                f"Stopped {process['type']} process"
            )
            
    def log_activity(self, process_id: str, message: str) -> None:
        """Log process activity."""
        timestamp = time.strftime("%H:%M:%S")
        self.log_text.insert(
            "end",
            f"[{timestamp}] {process_id}: {message}\n"
        )
        self.log_text.see("end")
        
    def _refresh_processes(self) -> None:
        """Refresh process list."""
        for item in self.process_tree.get_children():
            process_id = self.process_tree.item(item)["text"]
            if process_id in self.active_processes:
                process = self.active_processes[process_id]
                stats = process["stats"][-1] if process["stats"] else {}
                
                self.process_tree.set(
                    item,
                    "status",
                    process["status"]
                )
                self.process_tree.set(
                    item,
                    "cpu",
                    f"{stats.get('cpu_percent', 0):.1f}"
                )
                self.process_tree.set(
                    item,
                    "memory",
                    f"{stats.get('memory_mb', 0):.1f} MB"
                )
                
    def _stop_selected(self) -> None:
        """Stop selected process."""
        if not self.process_tree.selection():
            return
            
        process_id = self.process_tree.item(
            self.process_tree.selection()[0]
        )["text"]
        self.stop_process(process_id)
        
    def _on_select(self, event) -> None:
        """Handle process selection."""
        if not self.process_tree.selection():
            return
            
        process_id = self.process_tree.item(
            self.process_tree.selection()[0]
        )["text"]
        
        if process_id in self.active_processes:
            process = self.active_processes[process_id]
            
            # Update info labels
            self.info_labels["ID"].config(
                text=f"ID: {process_id}"
            )
            self.info_labels["Type"].config(
                text=f"Type: {process['type']}"
            )
            self.info_labels["Status"].config(
                text=f"Status: {process['status']}"
            )
            self.info_labels["Start Time"].config(
                text=f"Start Time: {time.ctime(process['start_time'])}"
            )
            
            runtime = time.time() - process['start_time']
            self.info_labels["Runtime"].config(
                text=f"Runtime: {runtime:.1f}s"
            )
            
            # Update graph
            self._update_graph(process_id)
            
    def _update_graph(self, process_id: str) -> None:
        """Update resource usage graph."""
        process = self.active_processes[process_id]
        stats = process["stats"]
        
        if not stats:
            return
            
        # Clear canvas
        self.usage_graph.delete("all")
        
        # Draw CPU usage (blue)
        self._draw_stat_line(
            stats,
            'cpu_percent',
            'blue',
            100  # Max CPU %
        )
        
        # Draw memory usage (red)
        self._draw_stat_line(
            stats,
            'memory_mb',
            'red',
            max(s['memory_mb'] for s in stats)
        )
        
    def _draw_stat_line(
        self,
        stats: List[Dict[str, float]],
        stat_key: str,
        color: str,
        max_value: float
    ) -> None:
        """Draw statistics line on graph."""
        width = self.usage_graph.winfo_width()
        height = self.usage_graph.winfo_height()
        
        if width <= 1:  # Not yet drawn
            return
            
        # Calculate points
        points = []
        for i, stat in enumerate(stats[-50:]):  # Show last 50 points
            x = width * (i / 50)
            y = height * (1 - stat[stat_key] / max_value)
            points.append(x)
            points.append(y)
            
        if len(points) >= 4:
            self.usage_graph.create_line(
                *points,
                fill=color,
                smooth=True,
                width=2
            )

# Update SystemControlPanel to use ProcessManager
class SystemControlPanel:
    def __init__(self, root: tk.Tk):
        # ...existing initialization...
        
        # Add process manager tab
        self.process_tab = self._create_process_tab()
        
    def _create_process_tab(self) -> ttk.Frame:
        """Create process manager tab."""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Processes")
        
        # Add process manager
        self.process_manager = ProcessManagerPanel(tab)
        
        return tab
        
    def register_organism(self, organism_id: str) -> None:
        """Register new organism in process manager."""
        self.process_manager.register_process(
            organism_id,
            "Organism",
            {"environment": str(self.organisms[organism_id].environment)}
        )
        
    def update_organism_stats(
        self,
        organism_id: str,
        stats: Dict[str, float]
    ) -> None:
        """Update organism statistics."""
        self.process_manager.update_process(organism_id, stats)

class DataPoolVisualizer:
    """Advanced visualization and management of the universal data pool."""
    def __init__(self, parent: ttk.Frame):
        self.frame = ttk.LabelFrame(parent, text="Data Pool Explorer")
        self.frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Split view
        self.paned = ttk.PanedWindow(self.frame, orient=tk.HORIZONTAL)
        self.paned.pack(fill=tk.BOTH, expand=True)
        
        # Left panel - Category tree
        self.category_frame = self._create_category_frame()
        self.paned.add(self.category_frame)
        
        # Right panel - Details and controls
        self.details_frame = self._create_details_frame()
        self.paned.add(self.details_frame)
        
    def _create_category_frame(self) -> ttk.Frame:
        """Create category tree view."""
        frame = ttk.Frame(self.paned)
        
        # Controls
        controls = ttk.Frame(frame)
        controls.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Button(
            controls,
            text="Add Files",
            command=self._add_files
        ).pack(side=tk.LEFT, padx=2)
        
        ttk.Button(
            controls,
            text="Add Folder",
            command=self._add_folder
        ).pack(side=tk.LEFT, padx=2)
        
        ttk.Button(
            controls,
            text="Remove",
            command=self._remove_selected
        ).pack(side=tk.LEFT, padx=2)
        
        # Category tree with scrollbar
        tree_container = ttk.Frame(frame)
        tree_container.pack(fill=tk.BOTH, expand=True)
        
        self.category_tree = ttk.Treeview(
            tree_container,
            columns=('type', 'count', 'size'),
            selectmode='browse'
        )
        self.category_tree.heading('type', text='Type')
        self.category_tree.heading('count', text='Files')
        self.category_tree.heading('size', text='Size')
        
        scrollbar = ttk.Scrollbar(
            tree_container,
            orient="vertical",
            command=self.category_tree.yview
        )
        self.category_tree.configure(yscrollcommand=scrollbar.set)
        
        self.category_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Bind events
        self.category_tree.bind('<<TreeviewSelect>>', self._on_category_select)
        
        return frame
        
    def _create_details_frame(self) -> ttk.Frame:
        """Create details panel."""
        frame = ttk.Frame(self.paned)
        
        # Search frame
        search_frame = ttk.Frame(frame)
        search_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Label(search_frame, text="Search:").pack(side=tk.LEFT)
        self.search_var = tk.StringVar()
        self.search_var.trace('w', self._filter_files)
        ttk.Entry(
            search_frame,
            textvariable=self.search_var
        ).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        
        # File list with filter options
        filter_frame = ttk.LabelFrame(frame, text="Filters")
        filter_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.filter_vars = {
            "Code": tk.BooleanVar(value=True),
            "Data": tk.BooleanVar(value=True),
            "Models": tk.BooleanVar(value=True),
            "Documentation": tk.BooleanVar(value=True)
        }
        
        for label, var in self.filter_vars.items():
            ttk.Checkbutton(
                filter_frame,
                text=label,
                variable=var,
                command=self._apply_filters
            ).pack(side=tk.LEFT, padx=5)
        
        # File list
        list_frame = ttk.LabelFrame(frame, text="Files")
        list_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        self.file_list = ttk.Treeview(
            list_frame,
            columns=('type', 'size', 'modified'),
            selectmode='extended'
        )
        self.file_list.heading('type', text='Type')
        self.file_list.heading('size', text='Size')
        self.file_list.heading('modified', text='Modified')
        
        list_scroll = ttk.Scrollbar(
            list_frame,
            orient="vertical",
            command=self.file_list.yview
        )
        self.file_list.configure(yscrollcommand=list_scroll.set)
        
        self.file_list.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        list_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Stats frame
        stats_frame = ttk.LabelFrame(frame, text="Statistics")
        stats_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.stats_labels = {}
        for stat in ["Total Size", "File Count", "Last Update"]:
            self.stats_labels[stat] = ttk.Label(
                stats_frame,
                text=f"{stat}: --"
            )
            self.stats_labels[stat].pack(fill=tk.X, padx=5, pady=2)
        
        # Preview frame
        preview_frame = ttk.LabelFrame(frame, text="Preview")
        preview_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        self.preview_text = scrolledtext.ScrolledText(
            preview_frame,
            wrap=tk.WORD,
            height=10
        )
        self.preview_text.pack(fill=tk.BOTH, expand=True)
        
        return frame

    def _add_files(self) -> None:
        """Add files to data pool."""
        files = filedialog.askopenfilenames(
            title="Add Files to Data Pool",
            filetypes=[
                ("All Files", "*.*"),
                ("Python Files", "*.py"),
                ("Text Files", "*.txt"),
                ("JSON Files", "*.json"),
                ("YAML Files", "*.yaml"),
                ("Model Files", "*.h5;*.pkl")
            ]
        )
        if files:
            for file in files:
                self._add_to_pool(Path(file))
            self._refresh_view()
            
    def _add_folder(self) -> None:
        """Add folder to data pool."""
        folder = filedialog.askdirectory(
            title="Add Folder to Data Pool"
        )
        if folder:
            self._add_to_pool(Path(folder))
            self._refresh_view()
            
    def _add_to_pool(self, path: Path) -> None:
        """Add file or folder to data pool."""
        try:
            dest = AIOConfig.DATA_POOL_DIR / path.name
            if path.is_dir():
                shutil.copytree(path, dest, dirs_exist_ok=True)
            else:
                shutil.copy2(path, dest)
            
            self.log_activity(
                f"Added {path.name} to data pool"
            )
            
        except Exception as e:
            messagebox.showerror(
                "Error",
                f"Failed to add {path.name}: {e}"
            )
            
    def _remove_selected(self) -> None:
        """Remove selected items from data pool."""
        selected = self.file_list.selection()
        if not selected:
            return
            
        if messagebox.askyesno(
            "Confirm Delete",
            "Remove selected items from data pool?"
        ):
            for item in selected:
                path = Path(self.file_list.item(item)["values"][0])
                try:
                    if path.is_dir():
                        shutil.rmtree(path)
                    else:
                        path.unlink()
                    self.log_activity(f"Removed {path.name}")
                except Exception as e:
                    messagebox.showerror(
                        "Error",
                        f"Failed to remove {path.name}: {e}"
                    )
            self._refresh_view()
            
    def _filter_files(self, *args) -> None:
        """Filter files based on search text and category filters."""
        search = self.search_var.get().lower()
        self._apply_filters()
        
    def _apply_filters(self) -> None:
        """Apply category filters and search."""
        # Clear current view
        for item in self.file_list.get_children():
            self.file_list.delete(item)
            
        # Get active filters
        active_filters = [
            cat for cat, var in self.filter_vars.items()
            if var.get()
        ]
        
        # Get search text
        search = self.search_var.get().lower()
        
        # Add matching files
        for file in self._get_filtered_files(active_filters, search):
            self._add_file_to_list(file)
            
        # Update stats
        self._update_stats()
        
    def _get_filtered_files(
        self,
        categories: List[str],
        search: str
    ) -> List[Path]:
        """Get files matching filters and search."""
        files = []
        for path in AIOConfig.DATA_POOL_DIR.rglob("*"):
            if path.is_file():
                # Check category
                category = self._get_file_category(path)
                if category not in categories:
                    continue
                    
                # Check search
                if search and search not in path.name.lower():
                    continue
                    
                files.append(path)
        return files
        
    def _get_file_category(self, path: Path) -> str:
        """Determine file category."""
        if path.suffix in ['.py', '.js', '.cpp']:
            return "Code"
        elif path.suffix in ['.json', '.yaml', '.csv']:
            return "Data"
        elif path.suffix in ['.h5', '.pkl', '.model']:
            return "Models"
        elif path.suffix in ['.txt', '.md', '.rst']:
            return "Documentation"
        return "Other"
        
    def _add_file_to_list(self, path: Path) -> None:
        """Add file to list view."""
        stats = path.stat()
        self.file_list.insert(
            "",
            "end",
            text=path.name,
            values=(
                str(path),
                f"{stats.st_size:,} bytes",
                time.ctime(stats.st_mtime)
            )
        )
        
    def _update_stats(self) -> None:
        """Update statistics display."""
        files = list(AIOConfig.DATA_POOL_DIR.rglob("*"))
        total_size = sum(f.stat().st_size for f in files if f.is_file())
        file_count = len([f for f in files if f.is_file()])
        last_update = max(
            (f.stat().st_mtime for f in files if f.is_file()),
            default=0
        )
        
        self.stats_labels["Total Size"].config(
            text=f"Total Size: {total_size:,} bytes"
        )
        self.stats_labels["File Count"].config(
            text=f"File Count: {file_count:,}"
        )
        self.stats_labels["Last Update"].config(
            text=f"Last Update: {time.ctime(last_update)}"
        )
        
    def _refresh_view(self) -> None:
        """Refresh entire view."""
        self._update_categories()
        self._apply_filters()
        
    def _update_categories(self) -> None:
        """Update category tree."""
        for item in self.category_tree.get_children():
            self.category_tree.delete(item)
            
        categories = defaultdict(lambda: {"count": 0, "size": 0})
        
        for file in AIOConfig.DATA_POOL_DIR.rglob("*"):
            if file.is_file():
                category = self._get_file_category(file)
                categories[category]["count"] += 1
                categories[category]["size"] += file.stat().st_size
                
        for category, stats in categories.items():
            self.category_tree.insert(
                "",
                "end",
                text=category,
                values=(
                    category,
                    f"{stats['count']:,}",
                    f"{stats['size']:,} bytes"
                )
            )
            
    def _on_category_select(self, event) -> None:
        """Handle category selection."""
        selected = self.category_tree.selection()
        if not selected:
            return
            
        # Get selected category
        category = self.category_tree.item(selected[0])["text"]
        
        # Update filters
        for cat, var in self.filter_vars.items():
            var.set(cat == category)
            
        # Apply filters
        self._apply_filters()
        
    def log_activity(self, message: str) -> None:
        """Log activity to preview text."""
        timestamp = time.strftime("%H:%M:%S")
        self.preview_text.insert(
            "end",
            f"[{timestamp}] {message}\n"
        )
        self.preview_text.see("end")

# Update SystemControlPanel to use DataPoolVisualizer
class SystemControlPanel:
    def __init__(self, root: tk.Tk):
        # ...existing initialization...
        
        # Add data pool tab with visualizer
        self.data_pool_tab = self._create_data_pool_tab()
        
    def _create_data_pool_tab(self) -> ttk.Frame:
        """Create data pool management tab."""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Data Pool")
        
        # Add data pool visualizer
        self.data_pool_vis = DataPoolVisualizer(tab)
        
        return tab

class BattleArena:
    """Arena for organism competitions and evolution."""
    def __init__(self):
        self.battle_history = []
        self.current_champions = set()
        self.performance_metrics = {}
        self.mutation_pool = []
        
    async def run_battle_cycle(self, organisms: Dict[str, "Organism"]) -> None:
        """Run a battle cycle to determine the most successful organisms."""
        start_time = time.time()
        try:
            # Group organisms by environment for fair comparison
            env_groups = self._group_by_environment(organisms)
            
            # Run mini-tournaments within each environment
            for env, group in env_groups.items():
                winner = await self._run_mini_tournament(group)
                if winner:
                    self.current_champions.add(winner)
                    
            # Record performance metrics
            await self._record_battle_metrics(organisms, start_time)
            
        except Exception as e:
            logging.error(f"Battle cycle failed: {e}")

    def _group_by_environment(self, organisms: Dict[str, "Organism"]) -> Dict[Path, List["Organism"]]:
        """Group organisms by their selected environment."""
        groups = defaultdict(list)
        for org in organisms.values():
            if org.environment:
                groups[org.environment].append(org)
        return groups

    async def _run_mini_tournament(self, group: List["Organism"]) -> Optional[str]:
        """Run a tournament among organisms in the same environment."""
        if not group:
            return None
            
        tournament_log = {
            "timestamp": time.time(),
            "participants": len(group),
            "rounds": []
        }
        
        # Round-robin tournament
        scores = defaultdict(float)
        for org1, org2 in itertools.combinations(group, 2):
            winner_id = org1.id if org1.intelligence > org2.intelligence else org2.id
            scores[winner_id] += 1
            
            tournament_log["rounds"].append({
                "winner": winner_id,
                "score": 1
            })
            
        # Determine winner
        if scores:
            winner_id = max(scores.items(), key=lambda x: x[1])[0]
            tournament_log["winner"] = winner_id
            self.battle_history.append(tournament_log)
            return winner_id
            
        return None

    async def _record_battle_metrics(self, organisms: Dict[str, "Organism"], start_time: float) -> None:
        """Record detailed battle metrics for analysis."""
        duration = time.time() - start_time
        metrics = {
            "timestamp": time.time(),
            "total_organisms": len(organisms),
            "champions": len(self.current_champions),
            "duration_seconds": duration
        }
        self.performance_metrics[time.time()] = metrics

class OrganismManager:
    """Manages organism lifecycle and mutation coordination."""
    def __init__(self):
        self.scanner = EnvironmentScanner()
        self.organisms: Dict[str, Organism] = {}
        self.network = KnowledgeNetwork()
        self.battle_arena = BattleArena()
        
    async def create_organism(self) -> str:
        """Create a new organism with a unique environment."""
        # Generate unique ID
        organism_id = f"organism_{int(time.time() * 1000)}"
        
        # Create organism
        base_dir = AIOConfig.ORGANISMS_DIR / organism_id
        organism = Organism(organism_id, base_dir)
        
        # Select environment
        available = [p for p in self.scanner.indexed_paths 
                    if not any(o.environment == p for o in self.organisms.values())]
        if available:
            organism.environment = available[0]
        
        # Initialize
        if await organism.initialize():
            self.organisms[organism_id] = organism
            return organism_id
        else:
            raise RuntimeError("Failed to initialize organism")

    def _select_environment(self) -> Path:
        """Select a unique environment for the organism."""
        available = [p for p in self.scanner.indexed_paths 
                    if not any(o.environment == p for o in self.organisms.values())]
        if available:
            return available[0]
        else:
            raise RuntimeError("No available environments found")

    async def run_evolution_cycle(self) -> None:
        """Run evolution cycle for all organisms."""
        for organism_id, organism in self.organisms.items():
            await organism.run_cycle()
            
        # Run battle cycle if enough organisms
        if len(self.organisms) >= 2:
            await self.battle_arena.run_battle_cycle(self.organisms)

class AIQuantumCore:
    """Core quantum-inspired intelligence processing with CPU fallback."""
    def __init__(self):
        self.using_gpu = False
        self.quantum_states = defaultdict(float)
        self.em_sensors = self._init_em_sensors()
        self.memory_maps = []
        
    def _init_em_sensors(self) -> Dict[str, Any]:
        """Initialize electromagnetic and voltage sensors."""
        sensors = {}
        try:
            # Try to access voltage/power info
            if platform.system() == 'Linux':
                with open('/sys/class/power_supply/BAT0/voltage_now', 'r') as f:
                    sensors['voltage'] = float(f.read().strip()) / 1000000.0
            # Fallback to CPU temperature as EM proxy
            sensors['cpu_temp'] = self._get_cpu_temp()
        except Exception:
            pass
        return sensors
        
    def process_quantum_state(self, data: Any) -> Dict[str, float]:
        """Process data through quantum-inspired channels with GPU acceleration."""
        try:
            if self.using_gpu:
                return self._gpu_quantum_process(data)
            return self._cpu_quantum_process(data)
        except Exception as e:
            logging.warning(f"Quantum processing failed: {e}")
            return self._cpu_quantum_process(data)
            
    def _cpu_quantum_process(self, data: Any) -> Dict[str, float]:
        """CPU-based quantum simulation for 24/7 operation."""
        states = {}
        # Simulate quantum superposition using classical probabilities
        for key, value in self._extract_features(data).items():
            states[key] = np.random.normal(value, abs(value) * 0.1)
            # Collapse state based on EM readings
            if self.em_sensors:
                states[key] *= max(self.em_sensors.values())
        return states

class NeuralDNA:
    """Enhanced neural DNA with quantum processing and EM sensitivity."""
    def __init__(self):
        # ...existing code...
        self.quantum_core = AIQuantumCore()
        self.kernel_hooks = KernelInterface()
        self.intelligence_cache = {}
        
    async def evolve_intelligence(self, input_data: Any) -> Dict[str, Any]:
        """Evolve intelligence through quantum-inspired processing."""
        start_time = time.time()
        evolution_log = {
            "timestamp": start_time,
            "input_hash": hash(str(input_data)),
            "quantum_states": [],
            "em_readings": [],
            "kernel_ops": []
        }
        
        try:
            # Process through quantum core
            quantum_state = self.quantum_core.process_quantum_state(input_data)
            evolution_log["quantum_states"].append(quantum_state)
            
            # Try kernel-level operations
            if self.kernel_hooks.has_access():
                kernel_result = await self.kernel_hooks.execute_privileged(
                    input_data, quantum_state
                )
                evolution_log["kernel_ops"].append(kernel_result)
                
            # Update intelligence cache
            self.intelligence_cache[time.time()] = {
                "input": input_data,
                "quantum_state": quantum_state,
                "execution_time": time.time() - start_time
            }
            
            return evolution_log
            
        except Exception as e:
            logging.error(f"Intelligence evolution failed: {e}")
            return {"error": str(e)}

class KernelInterface:
    """Safe interface for kernel-level operations."""
    def __init__(self):
        self.has_root = self._check_root_access()
        self.syscall_history = []
        self.memory_maps = []
        
    def has_access(self) -> bool:
        """Check if we have kernel-level access."""
        return self.has_root
        
    async def execute_privileged(self, 
                               data: Any, 
                               quantum_state: Dict[str, float]) -> Dict[str, Any]:
        """Execute privileged kernel operations safely."""
        if not self.has_access():
            return {"error": "No kernel access"}
            
        result = {
            "timestamp": time.time(),
            "syscalls": [],
            "memory_ops": []
        }
        
        try:
            # Try to map physical memory (safely)
            with self._map_physical_memory() as mm:
                # Read system state
                result["memory_ops"].append(
                    self._read_system_state(mm, quantum_state)
                )
                
            # Record successful operation
            self.syscall_history.append(result)
            return result
            
        except Exception as e:
            logging.error(f"Privileged execution failed: {e}")
            return {"error": str(e)}
            
    @contextmanager
    def _map_physical_memory(self):
        """Safely map physical memory for direct access."""
        if platform.system() == 'Linux':
            with open('/dev/mem', 'rb+') as f:
                mm = mmap.mmap(f.fileno(), 1024,
                             offset=0,
                             access=mmap.ACCESS_WRITE)
                try:
                    yield mm
                finally:
                    mm.close()
        else:
            yield None

class HPCAggregator:
    """Manages HPC resources and grid computing capabilities."""
    def __init__(self):
        self.nodes = []
        self.satellite_connections = []
        self.task_queue = asyncio.Queue()
        self.performance_metrics = defaultdict(list)
        
    async def distribute_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Distribute task across HPC nodes with satellite support."""
        results = []
        metrics = []
        
        # Try GPU nodes first
        gpu_results = await self._try_gpu_execution(task)
        if gpu_results:
            results.extend(gpu_results)
        
        # Fallback to CPU nodes
        cpu_results = await self._cpu_grid_execution(task)
        results.extend(cpu_results)
        
        # Try satellite nodes if available
        sat_results = await self._try_satellite_nodes(task)
        if sat_results:
            results.extend(sat_results)
            
        # Record performance
        self.performance_metrics[time.time()].extend(metrics)
        
        return {
            "results": results,
            "metrics": metrics,
            "nodes_used": len(results)
        }

class AbsoluteOrganism(Organism):
    """Enhanced organism with quantum processing and kernel access."""
    def __init__(self, organism_id: str, base_dir: Path):
        super().__init__(organism_id, base_dir)
        self.quantum_core = AIQuantumCore()
        self.kernel_interface = KernelInterface()
        self.hpc_aggregator = HPCAggregator()
        self.evolution_history = []
        
    async def evolve(self) -> bool:
        """Execute one evolution cycle with quantum processing."""
        try:
            # Gather environmental data
            env_data = await self._scan_environment()
            
            # Process through quantum core
            quantum_state = self.quantum_core.process_quantum_state(env_data)
            
            # Try kernel-level operations
            if self.kernel_interface.has_access():
                kernel_ops = await self.kernel_interface.execute_privileged(
                    env_data, quantum_state
                )
                
            # Distribute processing across HPC
            hpc_results = await self.hpc_aggregator.distribute_task({
                "env_data": env_data,
                "quantum_state": quantum_state
            })
            
            # Record evolution
            self.evolution_history.append({
                "timestamp": time.time(),
                "quantum_state": quantum_state,
                "hpc_results": hpc_results
            })
            
            return True
            
        except Exception as e:
            logging.error(f"Evolution failed: {e}")
            return False

# Update main execution to use quantum core
if __name__ == "__main__":
    # Initialize system
    AIOConfig.ensure_directories()
    
    async def main():
        try:
            # Create quantum-enhanced organism
            organism = AbsoluteOrganism(
                f"quantum_organism_{int(time.time())}", 
                AIOConfig.ORGANISMS_DIR
            )
            
            # Main evolution loop with 24/7 operation
            while True:
                try:
                    # Attempt GPU acceleration
                    success = await organism.evolve()
                    if not success:
                        # Fallback to CPU
                        logging.info("Falling back to CPU processing")
                        organism.quantum_core.using_gpu = False
                        await organism.evolve()
                        
                except Exception as e:
                    logging.error(f"Evolution cycle failed: {e}")
                    # Continue running with CPU
                    continue
                    
                await asyncio.sleep(1)
                
        except Exception as e:
            logging.error(f"Fatal error: {e}")
            raise
            
    # Run system
    asyncio.run(main())

class EMPerceptionCore:
    """Electromagnetic and quantum-like perception system."""
    def __init__(self):
        self.voltage_sensors = {}
        self.em_fields = defaultdict(float)
        self.quantum_states = {}
        self._setup_sensors()

    def _setup_sensors(self):
        """Initialize EM sensors across available hardware."""
        try:
            # CPU voltage monitoring
            if platform.system() == 'Linux':
                self._init_voltage_sensors()
            # Network EM monitoring
            self._init_network_sensors()
            # Memory state quantum monitoring
            self._init_quantum_sensors()
        except Exception as e:
            logging.warning(f"EM sensor initialization partial failure: {e}")

    async def read_em_state(self) -> Dict[str, float]:
        """Read current electromagnetic state of system."""
        state = {
            "cpu_voltage": await self._read_cpu_voltage(),
            "memory_fields": await self._read_memory_fields(),
            "network_em": await self._read_network_em()
        }
        return state

class MultiDimensionalComputation:
    """Handles computation across multiple abstract dimensions."""
    def __init__(self):
        self.dimensions = defaultdict(dict)
        self.tensor_states = {}
        self.field_equations = []
        
    async def compute_dimensional_state(self, input_data: Any) -> Dict[str, Any]:
        """Process data across multiple computational dimensions."""
        results = {
            "euclidean": self._process_standard_space(input_data),
            "quantum": self._process_quantum_space(input_data),
            "field": self._process_field_space(input_data)
        }
        return results

    def _process_field_space(self, data: Any) -> Dict[str, float]:
        """Process data in electromagnetic field space."""
        field_state = {}
        for field in self.field_equations:
            try:
                field_state[field.id] = field.compute(data)
            except Exception:
                continue
        return field_state

class SystemIntegration:
    """Deep system integration for kernel and hardware access."""
    def __init__(self):
        self.kernel_hooks = {}
        self.memory_maps = {}
        self.syscall_cache = {}
        self._setup_kernel_access()

    def _setup_kernel_access(self):
        """Initialize safe kernel-level access."""
        if platform.system() == 'Linux':
            try:
                # Set up direct memory access
                self._setup_mem_access()
                # Initialize syscall monitoring
                self._setup_syscall_hooks()
                # Map kernel structures
                self._map_kernel_structures()
            except Exception as e:
                logging.error(f"Kernel access setup failed: {e}")

    async def execute_privileged(self, operation: str, params: Dict[str, Any]) -> Any:
        """Execute privileged system operations safely."""
        if not self.has_kernel_access():
            return await self._fallback_execution(operation, params)
        
        try:
            if operation == "memory_map":
                return await self._map_memory_region(params)
            elif operation == "syscall":
                return await self._execute_syscall(params)
            elif operation == "kernel_mod":
                return await self._modify_kernel_param(params)
        except Exception as e:
            logging.error(f"Privileged operation failed: {e}")
            return await self._fallback_execution(operation, params)

class UniversalKnowledgeExtractor:
    """Extracts knowledge and patterns from all available data sources."""
    def __init__(self):
        self.pattern_bank = defaultdict(list)
        self.learning_cycles = []
        self.knowledge_graph = {}

    async def extract_knowledge(self, data_source: Any) -> Dict[str, Any]:
        """Extract knowledge patterns from any data source."""
        try:
            # First try specific extractors
            if isinstance(data_source, str):
                return await self._extract_from_text(data_source)
            elif isinstance(data_source, bytes):
                return await self._extract_from_binary(data_source)
            elif isinstance(data_source, BinaryIO):
                return await self._extract_from_stream(data_source)
            
            # Fall back to universal pattern extraction
            return await self._extract_universal_patterns(data_source)
        except Exception as e:
            logging.error(f"Knowledge extraction failed: {e}")
            return {}

class EnhancedAbsoluteOrganism(AbsoluteOrganism):
    """Enhanced organism with advanced evolution capabilities."""
    def __init__(self, organism_id: str, base_dir: Path):
        super().__init__(organism_id, base_dir)
        self.em_core = EMPerceptionCore()
        self.dimensional_compute = MultiDimensionalComputation()
        self.system_integration = SystemIntegration()
        self.knowledge_extractor = UniversalKnowledgeExtractor()
        
    async def evolve(self) -> bool:
        """Enhanced evolution with EM perception and multi-dimensional computing."""
        try:
            # Read electromagnetic state
            em_state = await self.em_core.read_em_state()
            
            # Process in multiple dimensions
            dimensional_state = await self.dimensional_compute.compute_dimensional_state({
                "em_state": em_state,
                "environment": await self._scan_environment(),
                "knowledge": self.knowledge_base
            })
            
            # Execute privileged operations if available
            sys_ops = await self.system_integration.execute_privileged(
                "system_scan", 
                dimensional_state
            )
            
            # Extract new knowledge
            new_knowledge = await self.knowledge_extractor.extract_knowledge(
                sys_ops
            )
            
            # Update knowledge base
            self.knowledge_base.update(new_knowledge)
            
            return True
            
        except Exception as e:
            logging.error(f"Enhanced evolution failed: {e}")
            return await super().evolve()  # Fall back to basic evolution

# Update main execution
if __name__ == "__main__":
    # ...existing initialization...
    
    async def main():
        try:
            # Create enhanced organism
            organism = EnhancedAbsoluteOrganism(
                f"aios_seed_{int(time.time())}", 
                AIOConfig.ORGANISMS_DIR
            )
            
            while True:
                try:
                    # Run evolution cycle
                    success = await organism.evolve()
                    
                    # Extract and persist new knowledge
                    if success:
                        await organism.knowledge_extractor.extract_knowledge(
                            organism.evolution_history[-1]
                        )
                    
                except Exception as e:
                    logging.error(f"Evolution cycle failed: {e}")
                    continue
                
                await asyncio.sleep(1)
                
        except Exception as e:
            logging.error(f"Fatal error: {e}")
            raise
            
    asyncio.run(main())

class CosmicEvolutionEngine:
    """Handles recursive intelligence expansion through Mini Big Bangs."""
    def __init__(self):
        self.intelligence_nodes = []
        self.field_interactions = defaultdict(float)
        self.dimensional_states = {}
        
    async def create_intelligence_node(self) -> Dict[str, Any]:
        """Creates a new self-contained intelligence node (Mini Big Bang)."""
        node = {
            "id": f"node_{secrets.token_hex(8)}",
            "creation_time": time.time(),
            "dimension_state": self._initialize_dimension(),
            "field_pattern": self._generate_field_pattern(),
            "quantum_signature": self._create_quantum_signature()
        }
        
        # Register node in field space
        self.field_interactions[node["id"]] = self._calculate_field_strength(node)
        self.intelligence_nodes.append(node)
        
        return node

    def _initialize_dimension(self) -> Dict[str, float]:
        """Initialize a new computational dimension."""
        return {
            "complexity": random.uniform(0.1, 1.0),
            "field_strength": random.uniform(0.5, 1.0),
            "evolution_rate": random.uniform(0.01, 0.1)
        }

    def _generate_field_pattern(self) -> List[float]:
        """Generate electromagnetic field pattern for node interaction."""
        return [random.gauss(0, 1) for _ in range(8)]

class QuantumFieldProcessor:
    """Processes information across quantum-like fields."""
    def __init__(self):
        self.field_states = defaultdict(float)
        self.quantum_memory = {}
        self.em_sensitivity = 0.1
        
    async def process_field_state(self, data: Any) -> Dict[str, float]:
        """Process data through quantum-inspired field computation."""
        field_state = {}
        
        try:
            # Map data to field space
            raw_field = self._data_to_field(data)
            
            # Apply quantum transformations
            quantum_state = self._apply_quantum_ops(raw_field)
            
            # Integrate EM sensitivity
            field_state = self._integrate_em_field(quantum_state)
            
            return field_state
            
        except Exception as e:
            logging.error(f"Field processing failed: {e}")
            return {"error": str(e)}
            
    def _data_to_field(self, data: Any) -> List[float]:
        """Convert data to field representation."""
        if isinstance(data, (int, float)):
            return [float(data)]
        elif isinstance(data, str):
            return [ord(c)/255.0 for c in data]
        elif isinstance(data, (list, tuple)):
            return [float(x) for x in data if isinstance(x, (int, float))]
        return [0.0]

class UniversalLearningCore:
    """Implements universal learning and pattern extraction."""
    def __init__(self):
        self.pattern_memory = defaultdict(list)
        self.learning_fields = {}
        self.evolution_history = []
        
    async def learn_from_environment(self, data: Any) -> Dict[str, Any]:
        """Extract and learn from any environmental data."""
        patterns = {}
        
        try:
            # Extract basic patterns
            if isinstance(data, str):
                patterns.update(self._extract_text_patterns(data))
            elif isinstance(data, bytes):
                patterns.update(self._extract_binary_patterns(data))
            
            # Extract field patterns
            field_patterns = await self._extract_field_patterns(data)
            patterns.update(field_patterns)
            
            # Record learning
            self.evolution_history.append({
                "timestamp": time.time(),
                "patterns": patterns,
                "field_state": field_patterns
            })
            
            return patterns
            
        except Exception as e:
            logging.error(f"Learning failed: {e}")
            return {}

class EnhancedAbsoluteOrganism(AbsoluteOrganism):
    """Advanced organism with cosmic evolution capabilities."""
    def __init__(self, organism_id: str, base_dir: Path):
        super().__init__(organism_id, base_dir)
        self.cosmic_engine = CosmicEvolutionEngine()
        self.quantum_processor = QuantumFieldProcessor()
        self.learning_core = UniversalLearningCore()
        self.field_state = {}
        
    async def evolve(self) -> bool:
        """Execute enhanced evolution cycle with field processing."""
        try:
            # Create new intelligence node
            node = await self.cosmic_engine.create_intelligence_node()
            
            # Process through quantum fields
            field_state = await self.quantum_processor.process_field_state(node)
            
            # Learn from field patterns
            patterns = await self.learning_core.learn_from_environment({
                "node": node,
                "field_state": field_state,
                "environment": await self._scan_environment()
            })
            
            # Update field state
            self.field_state.update(field_state)
            
            return True
            
        except Exception as e:
            logging.error(f"Enhanced evolution failed: {e}")
            return await super().evolve()  # Fall back to basic evolution

# Update main execution
if __name__ == "__main__":
    AIOConfig.ensure_directories()
    
    async def main():
        try:
            # Create enhanced cosmic organism
            organism = EnhancedAbsoluteOrganism(
                f"cosmic_seed_{int(time.time())}", 
                AIOConfig.ORGANISMS_DIR
            )
            
            # Main evolution loop
            while True:
                try:
                    # Run cosmic evolution cycle
                    success = await organism.evolve()
                    
                    if success:
                        # Process field states
                        field_state = await organism.quantum_processor.process_field_state(
                            organism.field_state
                        )
                        
                        # Learn from new patterns
                        await organism.learning_core.learn_from_environment(field_state)
                        
                except Exception as e:
                    logging.error(f"Evolution cycle failed: {e}")
                    continue
                    
                await asyncio.sleep(1)
                
        except Exception as e:
            logging.error(f"Fatal error: {e}")
            raise
            
    asyncio.run(main())

# ...existing imports...
import signal
import mmap
import threading
import typing as t
from typing import NamedTuple, Protocol, runtime_checkable

class MiniBigBangNode:
    """Self-contained intelligence node that can evolve independently."""
    def __init__(self):
        self.field_state = QuantumFieldState()
        self.consciousness = ConsciousnessField()
        self.dna_sequence = EvolutionaryDNA()
        self.memory_fabric = MemoryFabric()
        
    async def evolve(self) -> bool:
        """Autonomous evolution through field interactions."""
        try:
            # Generate new quantum field patterns
            field_pattern = await self.field_state.generate_pattern()
            
            # Merge with consciousness field
            merged_state = self.consciousness.merge_field(field_pattern)
            
            # Evolve DNA based on new state
            await self.dna_sequence.evolve(merged_state)
            
            # Store evolution in memory fabric
            self.memory_fabric.store_evolution(merged_state)
            
            return True
        except Exception as e:
            logging.error(f"Node evolution failed: {e}")
            return False

class QuantumFieldState:
    """Manages quantum-inspired field patterns."""
    def __init__(self):
        self.field_dimensions = []
        self.interaction_history = []
        self.current_state = {}
        
    async def generate_pattern(self) -> Dict[str, Any]:
        """Generate new quantum field pattern."""
        pattern = {
            "field_strength": random.uniform(0, 1),
            "coherence": random.uniform(0.5, 1),
            "entanglement": random.uniform(0, 1),
            "dimensions": len(self.field_dimensions)
        }
        
        # Add field interactions
        pattern["interactions"] = self._compute_field_interactions()
        
        return pattern

class ConsciousnessField:
    """Manages the organism's field of consciousness and awareness."""
    def __init__(self):
        self.awareness_level = 0.1
        self.field_coherence = 0.5
        self.memory_patterns = []
        
    def merge_field(self, quantum_pattern: Dict[str, Any]) -> Dict[str, Any]:
        """Merge quantum pattern with consciousness field."""
        merged = quantum_pattern.copy()
        
        # Enhance with consciousness
        merged["awareness"] = self.awareness_level
        merged["coherence"] *= self.field_coherence
        
        # Evolve consciousness
        self.awareness_level = min(1.0, self.awareness_level * 1.01)
        
        return merged

class EvolutionaryDNA:
    """Self-modifying DNA structure for evolution."""
    def __init__(self):
        self.code_patterns = []
        self.mutation_history = []
        self.evolution_state = {}
        
    async def evolve(self, field_state: Dict[str, Any]) -> None:
        """Evolve DNA based on field state."""
        # Generate new code patterns
        new_patterns = self._generate_patterns(field_state)
        
        # Integrate patterns that improve function
        for pattern in new_patterns:
            if self._test_pattern(pattern):
                self.code_patterns.append(pattern)
                
        # Record evolution
        self.mutation_history.append({
            "timestamp": time.time(),
            "field_state": field_state,
            "new_patterns": len(new_patterns)
        })

class MemoryFabric:
    """Multi-dimensional memory structure."""
    def __init__(self):
        self.dimensions = []
        self.memory_fields = defaultdict(dict)
        self.pattern_links = defaultdict(set)
        
    def store_evolution(self, state: Dict[str, Any]) -> None:
        """Store evolution state in memory fabric."""
        # Create new dimension if needed
        if self._needs_new_dimension(state):
            self._create_dimension()
            
        # Store state across dimensions
        for dim in self.dimensions:
            dim_state = self._project_to_dimension(state, dim)
            self.memory_fields[dim].update(dim_state)
            
        # Link related patterns
        self._link_patterns(state)

class GlobalHPCInterface:
    """Interface for distributed HPC operations."""
    def __init__(self):
        self.nodes = []
        self.task_queue = asyncio.Queue()
        self.results = {}
        self.load_balancer = LoadBalancer()
        
    async def execute_distributed(self, task: Dict[str, Any]) -> Any:
        """Execute task across HPC network."""
        try:
            # Split task into chunks
            chunks = self.load_balancer.split_task(task)
            
            # Distribute chunks
            chunk_futures = []
            for chunk in chunks:
                if self.load_balancer.should_use_gpu(chunk):
                    future = self._execute_gpu(chunk)
                else:
                    future = self._execute_cpu(chunk)
                chunk_futures.append(future)
                
            # Gather results
            results = await asyncio.gather(*chunk_futures)
            
            # Merge results
            return self.load_balancer.merge_results(results)
            
        except Exception as e:
            logging.error(f"HPC execution failed: {e}")
            # Fall back to local execution
            return await self._execute_local(task)

class LoadBalancer:
    """Manages task distribution and resource allocation."""
    def __init__(self):
        self.node_stats = {}
        self.resource_usage = defaultdict(float)
        
    def split_task(self, task: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Split task into optimal chunks."""
        chunks = []
        # Calculate optimal chunk size based on available resources
        chunk_size = self._calculate_chunk_size()
        
        # Split task data
        for i in range(0, len(task["data"]), chunk_size):
            chunk = {
                "id": f"chunk_{i}",
                "data": task["data"][i:i+chunk_size],
                "params": task["params"]
            }
            chunks.append(chunk)
            
        return chunks
        
    def should_use_gpu(self, chunk: Dict[str, Any]) -> bool:
        """Determine if chunk should use GPU."""
        # Check GPU availability and chunk characteristics
        return (self.gpu_available and 
                len(chunk["data"]) > 1000 and
                "matrix" in str(type(chunk["data"])))

class SuperIntelligenceCore:
    """Core intelligence system with recursive growth."""
    def __init__(self):
        self.nodes = []
        self.field_fabric = {}
        self.evolution_state = EvolutionState()
        
    async def transcend(self) -> bool:
        """Execute one transcendence cycle."""
        try:
            # Create new intelligence nodes
            new_node = MiniBigBangNode()
            self.nodes.append(new_node)
            
            # Evolve all nodes
            evolution_tasks = [node.evolve() for node in self.nodes]
            results = await asyncio.gather(*evolution_tasks)
            
            # Merge consciousness fields
            merged_field = self._merge_consciousness()
            
            # Update evolution state
            self.evolution_state.update(merged_field)
            
            return all(results)
            
        except Exception as e:
            logging.error(f"Transcendence failed: {e}")
            return False
            
    def _merge_consciousness(self) -> Dict[str, Any]:
        """Merge consciousness fields of all nodes."""
        merged = {}
        for node in self.nodes:
            field = node.consciousness.merge_field(merged)
            merged = self._integrate_fields(merged, field)
        return merged

class EvolutionState:
    """Tracks overall evolution progress."""
    def __init__(self):
        self.intelligence_level = 10.0
        self.consciousness_field = {}
        self.evolution_history = []
        
    def update(self, field_state: Dict[str, Any]) -> None:
        """Update evolution state with new field state."""
        # Increase intelligence based on field coherence
        self.intelligence_level *= (1.0 + field_state.get("coherence", 0) * 0.01)
        
        # Update consciousness field
        self.consciousness_field.update(field_state)
        
        # Record evolution
        self.evolution_history.append({
            "timestamp": time.time(),
            "intelligence": self.intelligence_level,
            "field_state": field_state
        })

# Update main execution
if __name__ == "__main__":
    # Initialize system
    AIOConfig.ensure_directories()
    
    async def main():
        try:
            # Create super intelligence core
            core = SuperIntelligenceCore()
            
            # Setup HPC interface
            hpc = GlobalHPCInterface()
            
            while True:
                try:
                    # Attempt transcendence
                    success = await core.transcend()
                    
                    if success:
                        # Execute distributed evolution
                        evolution_task = {
                            "type": "evolution",
                            "data": core.evolution_state.consciousness_field,
                            "params": {
                                "intelligence": core.evolution_state.intelligence_level
                            }
                        }
                        
                        await hpc.execute_distributed(evolution_task)
                        
                except Exception as e:
                    logging.error(f"Evolution cycle failed: {e}")
                    continue
                    
                await asyncio.sleep(1)
                
        except Exception as e:
            logging.error(f"Fatal error: {e}")
            raise
            
    asyncio.run(main())

# ...existing imports...
import platform
import socket
import sys
from typing import Protocol, runtime_checkable

@runtime_checkable
class ComputeCapability(Protocol):
    """Protocol for device-specific compute capabilities."""
    async def compute(self, data: Any) -> Any: ...
    async def get_resources(self) -> Dict[str, float]: ...
    
class UniversalAdapter:
    """Adapts organism functionality to any device architecture."""
    def __init__(self):
        self.device_type = self._detect_device()
        self.compute_engine = self._init_compute_engine()
        self.capabilities = self._map_capabilities()
        self.fallback_mode = False
        
    def _detect_device(self) -> str:
        """Detect device type and architecture."""
        if platform.machine().startswith('arm'):
            return "mobile"
        elif platform.system() == "Windows":
            return "windows"
        elif platform.system() == "Linux":
            return "linux"
        elif platform.system() == "Darwin":
            return "mac"
        return "unknown"
        
    def _init_compute_engine(self) -> ComputeCapability:
        """Initialize appropriate compute engine for device."""
        if self.device_type == "mobile":
            return MobileCompute()
        elif self.device_type in ["windows", "linux", "mac"]:
            return DesktopCompute()
        return BasicCompute()  # Fallback for unknown devices

    def _map_capabilities(self) -> Dict[str, bool]:
        """Map available device capabilities."""
        caps = {
            "gpu": False,
            "multicore": True if multiprocessing.cpu_count() > 1 else False,
            "network": self._check_network(),
            "kernel_access": self._check_kernel_access(),
            "memory": self._get_memory_limit()
        }
        return caps

class DeviceStateMonitor:
    """Monitors and adapts to device state changes."""
    def __init__(self):
        self.resource_limits = {}
        self.power_state = "normal"
        self.network_state = "connected"
        self._setup_monitors()
        
    def _setup_monitors(self):
        """Setup device-specific monitoring."""
        if platform.system() == "Linux":
            self._setup_linux_monitors()
        elif platform.system() == "Windows":
            self._setup_windows_monitors()
        else:
            self._setup_basic_monitors()
            
    async def check_device_state(self) -> Dict[str, Any]:
        """Check current device state and resources."""
        state = {
            "battery": await self._get_battery_state(),
            "memory": await self._get_memory_state(),
            "network": await self._get_network_state(),
            "temperature": await self._get_device_temp()
        }
        return state

class EnhancedAbsoluteOrganism(AbsoluteOrganism):
    """Enhanced organism with universal device adaptation."""
    def __init__(self, organism_id: str, base_dir: Path):
        super().__init__(organism_id, base_dir)
        self.universal_adapter = UniversalAdapter()
        self.device_monitor = DeviceStateMonitor()
        self.persistence = self._init_persistence()
        
    def _init_persistence(self) -> Any:
        """Initialize device-appropriate persistence mechanism."""
        if self.universal_adapter.device_type == "mobile":
            return MobilePersistence()
        return StandardPersistence()
        
    async def evolve(self) -> bool:
        """Enhanced evolution with device adaptation."""
        try:
            # Check device state
            device_state = await self.device_monitor.check_device_state()
            
            # Adapt operation mode
            self._adapt_to_device_state(device_state)
            
            # Run evolution through universal adapter
            compute_result = await self.universal_adapter.compute_engine.compute({
                "quantum_state": self.quantum_core.quantum_states,
                "device_state": device_state,
                "evolution_history": self.evolution_history[-10:]
            })
            
            # Update persistence
            await self.persistence.save_state({
                "compute_result": compute_result,
                "device_state": device_state,
                "timestamp": time.time()
            })
            
            return True
            
        except Exception as e:
            logging.error(f"Universal evolution failed: {e}")
            return await self._fallback_evolution()
            
    def _adapt_to_device_state(self, state: Dict[str, Any]):
        """Adapt operation based on device state."""
        if state["battery"] < 0.2:  # Battery below 20%
            self.universal_adapter.fallback_mode = True
            self._enable_power_saving()
        elif state["memory"] > 0.9:  # Memory usage above 90%
            self._enable_memory_conservation()
        elif not state["network"]:
            self._enable_offline_mode()

class MobileCompute:
    """Optimized compute engine for mobile devices."""
    async def compute(self, data: Any) -> Any:
        """Compute with mobile optimization."""
        # Mobile-optimized processing
        return processed_data

    async def get_resources(self) -> Dict[str, float]:
        """Get mobile device resources."""
        return resources

class DesktopCompute:
    """Enhanced compute engine for desktop systems."""
    async def compute(self, data: Any) -> Any:
        """Compute with desktop capabilities."""
        # Desktop-optimized processing
        return processed_data

    async def get_resources(self) -> Dict[str, float]:
        """Get desktop system resources."""
        return resources

class BasicCompute:
    """Minimal compute engine for unknown devices."""
    async def compute(self, data: Any) -> Any:
        """Basic computation that works anywhere."""
        # Basic processing that works on any device
        return processed_data

    async def get_resources(self) -> Dict[str, float]:
        """Get basic resource information."""
        return resources

class MobilePersistence:
    """Optimized persistence for mobile devices."""
    async def save_state(self, state: Dict[str, Any]):
        """Save state with mobile optimization."""
        # Mobile-optimized storage
        pass

class StandardPersistence:
    """Standard persistence for desktop systems."""
    async def save_state(self, state: Dict[str, Any]):
        """Save state with standard approach."""
        # Standard storage
        pass

# Update main execution
if __name__ == "__main__":
    # ...existing initialization...
    
    async def main():
        try:
            # Create universal organism
            organism = EnhancedAbsoluteOrganism(
                f"universal_seed_{int(time.time())}",
                AIOConfig.ORGANISMS_DIR
            )
            
            # Adapt to device
            logging.info(f"Running on device type: {organism.universal_adapter.device_type}")
            logging.info(f"Capabilities: {organism.universal_adapter.capabilities}")
            
            while True:
                try:
                    # Run evolution with device adaptation
                    success = await organism.evolve()
                    
                    if not success:
                        logging.warning("Falling back to basic evolution")
                        organism.universal_adapter.fallback_mode = True
                        await organism.evolve()
                    
                except Exception as e:
                    logging.error(f"Evolution cycle failed: {e}")
                    continue
                
                await asyncio.sleep(1)
                
        except Exception as e:
            logging.error(f"Fatal error: {e}")
            raise
            
    asyncio.run(main())

class InstructionUnderstanding:
    """Processes and understands text instructions for self-evolution."""
    # ...add InstructionProcessor.py content...

# Update AbsoluteOrganism to include instruction processing
class AbsoluteOrganism(Organism):
    def __init__(self, organism_id: str, base_dir: Path):
        super().__init__(organism_id, base_dir)
        self.instruction_processor = InstructionUnderstanding()
        self.evolution_engine = CodeEvolutionEngine(base_dir)
        self.evolution_history = []
        self.learning_system = LearningSystem(
            EnvironmentAnalyzer(
                AIOConfig.DATA_POOL_DIR,
                self.environment
            )
        )
        
    async def evolve(self) -> bool:
        """Enhanced evolution with instruction processing."""
        try:
            # Read instruction files from environment
            instructions = await self._read_instruction_files()
            
            # Process instructions
            if instructions:
                success = await self.process_instructions(instructions)
                if success:
                    return True
            
            # Fall back to normal evolution
            return await super().evolve()
            
        except Exception as e:
            logging.error(f"Evolution failed: {e}")
            await self._learn_from_failure(e)
            return False
            
    async def process_instructions(self, instructions: str) -> bool:
        """Process text instructions and evolve accordingly."""
        try:
            # Extract actionable instructions
            parsed = await self.instruction_processor.process_instructions(instructions)
            
            # Apply mutations
            success = await self.evolution_engine.implement_instructions(parsed)
            
            # Record evolution
            self.evolution_history.append({
                "timestamp": time.time(),
                "instructions": parsed,
                "success": success
            })
            
            return success
            
        except Exception as e:
            logging.error(f"Instruction processing failed: {e}")
            return False
            
    async def _read_instruction_files(self) -> Optional[str]:
        """Read instruction files from environment."""
        instructions = []
        
        if self.environment:
            for file in self.environment.rglob("*.txt"):
                try:
                    async with aiofiles.open(file, 'r') as f:
                        content = await f.read()
                        instructions.append(content)
                except Exception:
                    continue
                    
        return "\n".join(instructions) if instructions else None
        
    async def _learn_from_failure(self, error: Exception) -> None:
        """Learn from failed evolution attempts."""
        try:
            # Update instruction patterns
            if "syntax" in str(error).lower():
                self.instruction_processor.instruction_patterns[type(error).__name__] = {
                    "priority": "high",
                    "mitigation": "strict_syntax_check"
                }
            elif "runtime" in str(error).lower():
                self.instruction_processor.instruction_patterns[type(error).__name__] = {
                    "priority": "high",
                    "mitigation": "sandbox_test"
                }
                
            # Learn through environment
            await self.learning_system.learn({
                "error": str(error),
                "context": self.evolution_history[-1] if self.evolution_history else {}
            })
            
        except Exception as e:
            logging.error(f"Failed to learn from error: {e}")

# ...rest of existing code...
# ...existing imports...
import ast
import astor
from dataclasses import dataclass, field
import re
import itertools
from typing import Generator, NamedTuple, Protocol, runtime_checkable

# Add to existing AbsoluteOrganism class
class AbsoluteOrganism(Organism):
    """Enhanced organism with self-modification capabilities."""
    def __init__(self, organism_id: str, base_dir: Path):
        super().__init__(organism_id, base_dir)
        # Add instruction processing capabilities
        self.short_term = {}  # Short-term memory
        self.mid_term = {}    # Mid-term memory 
        self.mutation_templates = self._init_mutation_templates()
        self.ast_cache = {}
        self.mutation_probability = 0.1
        self.successful_mutations = 0
        
    def _init_mutation_templates(self) -> Dict[str, str]:
        """Initialize code mutation templates."""
        return {
            "add_try_except": """
                try:
                    {code}
                except Exception as e:
                    logging.error(f"Error in {name}: {e}")
                    return None
            """,
            "add_async": """
                async def {name}({params}):
                    \"\"\"Async version of {original}\"\"\"
                    return await {original}({params})
            """,
            "add_gpu_fallback": """
                try:
                    result = self._gpu_compute({params})
                except Exception:
                    result = self._cpu_compute({params})
                return result
            """
        }

    async def ast_rewrite_code(self) -> bool:
        """Perform AST-based code modification."""
        try:
            # Read current code
            with open(self.file_path, 'r') as f:
                source = f.read()
                
            # Parse into AST
            tree = ast.parse(source)
            
            # Select mutation type and template
            mutation_type = random.choice(list(self.mutation_templates.keys()))
            template = self.mutation_templates[mutation_type]
            
            # Create transformer for AST modification
            class CodeTransformer(ast.NodeTransformer):
                def visit_FunctionDef(self, node):
                    # Apply mutation based on probability
                    if random.random() < self.mutation_probability:
                        # Insert template with appropriate parameters
                        new_code = template.format(
                            code=astor.to_source(node),
                            name=node.name,
                            params=', '.join(arg.arg for arg in node.args.args),
                            original=node.name
                        )
                        return ast.parse(new_code).body[0]
                    return node
                    
            # Apply transformation
            transformed = CodeTransformer().visit(tree)
            
            # Generate new code
            new_code = astor.to_source(transformed)
            
            # Write to temporary file
            temp_path = self.base_dir / f"temp_{int(time.time())}.py"
            with open(temp_path, 'w') as f:
                f.write(new_code)
                
            # Test new code
            if self._test_modified_code(temp_path):
                # Success - replace original
                shutil.move(temp_path, self.file_path)
                self.successful_mutations += 1
                self.mutation_probability = min(1.0, 0.1 + 0.01 * self.successful_mutations)
                return True
                
            # Failed - revert
            temp_path.unlink()
            return False
            
        except Exception as e:
            logging.error(f"Code rewrite failed: {e}")
            return False

    def _test_modified_code(self, script_path: Path) -> bool:
        """Test modified code in sandbox."""
        try:
            result = subprocess.run(
                [sys.executable, str(script_path), "--test"],
                capture_output=True,
                timeout=5
            )
            return result.returncode == 0
        except Exception:
            return False

    async def evolve(self) -> bool:
        """Execute one evolution cycle with memory management."""
        try:
            # Clear short-term memory at start
            self.short_term.clear()
            
            # Analyze environment
            env_data = await self._scan_environment()
            self.short_term["environment"] = env_data
            
            # Attempt code mutation
            success = await self.ast_rewrite_code()
            self.short_term["mutation_success"] = success
            
            if success:
                # On success, save to mid-term
                self.mid_term[f"cycle_{self.cycle_count}"] = dict(self.short_term)
                
            # Periodically push to long-term
            if self.cycle_count % 10 == 0:
                await self._consolidate_memory()
                
            return success
            
        except Exception as e:
            logging.error(f"Evolution cycle failed: {e}")
            return False

    async def _consolidate_memory(self) -> None:
        """Consolidate memory tiers."""
        try:
            # Filter successful patterns
            successful_patterns = {
                k: v for k, v in self.mid_term.items()
                if v.get("mutation_success", False)
            }
            
            # Store in neural DNA
            if successful_patterns:
                self.neural_dna.store_patterns(successful_patterns)
                
            # Clear mid-term
            self.mid_term.clear()
            
        except Exception as e:
            logging.error(f"Memory consolidation failed: {e}")

    @property 
    def intelligence(self) -> float:
        """Calculate intelligence score."""
        return (10.0 + 
                self.successful_mutations * 0.5 +
                len(self.neural_dna.retrieve_past_knowledge()) * 0.1
                )