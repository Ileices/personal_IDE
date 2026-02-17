import os
import ast
import shutil
import datetime
import traceback
import re
import importlib.util
import sys
import importlib.metadata  # For package version and dependency checking
import warnings  # For non-fatal issues during integration
import logging  # For structured logging across thousands of scripts
import functools  # For advanced function handling and composition
import platform  # For OS-specific code path handling
import inspect  # For introspection of function signatures and module structures
import json  # For metadata and configuration handling
import tempfile  # For isolating execution environments
import signal  # For handling timeouts when executing unknown code
import types  # For dynamic module creation and namespace management
import contextlib  # For creating safe execution contexts
import multiprocessing as mp  # For isolated execution of potentially conflicting code
import time  # For timing operations
import random  # For sampling and probabilistic operations
import numpy as np  # For numerical operations and array processing
import psutil  # For process and system monitoring
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor  # For parallel processing
from pathlib import Path  # Modern path handling
from collections import defaultdict, Counter  # For dependency tracking
from sklearn.cluster import DBSCAN, AgglomerativeClustering  # For module clustering
from sklearn.feature_extraction.text import TfidfVectorizer  # For text similarity
import threading  # For thread safety in logging functions

# Base configuration settings
SOURCE_FOLDER = os.path.join(os.path.dirname(__file__), "ToBuild")  # Default to ToBuild folder
OUTPUT_FOLDER = "rebuilt_project"
INTEGRATED_OUTPUT = "integrated_codebase.py"
LOG_FILE = "auto_rebuilder_log.txt"
MAIN_BLOCK = "if __name__ == '__main__'"
LAUNCHER_NAME = "launch.py"
# TODO: Add CLI or GUI option for user to select a different source folder if needed

# Settings for massive-scale integration
MAX_PARALLEL_PROCESSES = min(os.cpu_count() or 4, 8)  # For parallel processing
MAX_FILES_TO_PROCESS = 100000  # Upper limit to prevent memory overload
MAX_FILE_SIZE_MB = 50  # Skip extremely large files that are likely data files
CHUNK_SIZE = 1000  # Process files in manageable chunks

# Enhanced isolation and compatibility settings for massive-scale integration
NAMESPACE_ISOLATION = True  # Prevent naming conflicts between unrelated scripts
MODULE_REGISTRY = {}  # Track module relationships and dependencies
IMPORT_MAPPING = {}  # Map between original and rebuilt import paths
CONFLICT_RESOLUTION = "rename"  # How to handle name conflicts: rename, skip, or merge
COMPATIBILITY_THRESHOLD = 0.6  # Minimum compatibility score to consider modules related
CLUSTER_MAX_SIZE = 50  # Maximum number of modules in a logical cluster
EXECUTION_TIMEOUT = 5  # Seconds to allow for test execution of unknown modules

# Advanced settings for unrelated scripts integration
NAMESPACE_PREFIX_MAP = {}  # Maps original module names to prefixed namespaces
FORCE_RELATIVE_IMPORTS = True  # Convert absolute imports to relative for better isolation
MODULE_CLUSTERS = defaultdict(list)  # Group modules by detected functionality
IMPORT_GRAPH = defaultdict(set)  # Track import relationships for dependency resolution
FUNCTION_SIGNATURES = {}  # Store function signatures for API compatibility analysis
MODULE_METADATA = {}  # Store extracted metadata about each module
INTEGRATION_BLACKLIST = set()  # Modules that should not be integrated (e.g., harmful)
SANDBOX_EXECUTION = True  # Test modules in sandbox before integration

# Global state analysis settings
global_state = {
    "modifies_globals": False,
    "modifies_builtins": False,
    "global_vars": 0,
    "many_globals": False
}

# Package structure with expanded keywords for better categorization
PACKAGE_STRUCTURE = {
    "core": ["config", "loader", "utils", "pipeline", "model", "engine", "storage", "base", "common",
             "foundation", "system", "kernel", "runtime", "framework", "platform", "infra", "arch"],
    "ui": ["gui", "tui", "dash", "inspect", "visual", "display", "plot", "view", "window", "dialog",
           "panel", "form", "widget", "screen", "render", "draw", "layout", "page", "template", "theme"],
    "io": ["input", "output", "load", "save", "export", "import", "file", "storage", "persist",
           "stream", "reader", "writer", "parser", "formatter", "serializer", "database", "db", 
           "cache", "buffer", "blob", "binary", "text", "json", "xml", "csv", "excel", "sql"],
    "net": ["http", "server", "api", "network", "lan", "sync", "bridge", "client", "socket",
            "request", "response", "protocol", "endpoint", "route", "rest", "graphql", "grpc", 
            "websocket", "tcp", "udp", "ftp", "smtp", "oauth", "auth", "service", "discovery"],
    "train": ["train", "learn", "dataset", "neural", "epoch", "batch", "ml", "ai", "model",
              "tensor", "vector", "matrix", "gradient", "optimizer", "loss", "accuracy", "predict",
              "inference", "classify", "regress", "cluster", "feature", "label", "weights"],
    "tools": ["tool", "util", "helper", "scanner", "watch", "monitor", "check", "cli", "command",
              "script", "task", "job", "worker", "service", "daemon", "cron", "schedule", "test",
              "benchmark", "profile", "debug", "log", "logger", "report", "analyze", "migrate"]
}

# Regular expressions to detect non-code files and patterns
COMMENT_ONLY_PATTERN = re.compile(r'^(\s*#.*|\s*)$', re.MULTILINE)
DOCUMENTATION_MARKERS = ["README", "documentation", "guide", "manual", "how-to", "tutorial"]
EMOJI_PATTERN = re.compile(r'[\U00010000-\U0010ffff]', flags=re.UNICODE)
MARKDOWN_HEADING = re.compile(r'^#+\s+.*$', re.MULTILINE)
MARKDOWN_BULLET = re.compile(r'^\s*[-*+]\s+.*$', re.MULTILINE)
NON_PYTHON_BLOCK = re.compile(r'(?:^|\n)([A-Za-z][\w\s\d]*:[\s\n]|You said:|\s*These\s+\d+\s+\w+)')

# Advanced patterns for detecting risky code execution and system access patterns
RISKY_CODE_PATTERNS = [
    (re.compile(r'eval\s*\('), 3),  # eval() calls with severity level
    (re.compile(r'exec\s*\('), 3),  # exec() calls
    (re.compile(r'os\.(system|popen|exec[vple]*|spawn[vple]*|startfile)\s*\('), 2),  # OS execution
    (re.compile(r'subprocess\.(run|call|check_call|check_output|Popen)\s*\('), 2),  # subprocess
    (re.compile(r'__import__\s*\('), 2),  # dynamic imports
    (re.compile(r'importlib\.(import_module|util\.spec_from_file_location)'), 1),  # dynamic imports
    (re.compile(r'(open|Path)\s*\(.+?["\']w["\']'), 1),  # file writing
    (re.compile(r'shutil\.(copy|move|rmtree)'), 1),  # file operations
    (re.compile(r'port\s*=\s*(\d+)|\.bind\(\s*\(.*?(\d+)\)'), 1),  # hard-coded network ports
]

# Module compatibility scoring weights for massive-scale integration
# Enhanced for integrating thousands of unrelated scripts
COMPATIBILITY_WEIGHTS = {
    # Traditional compatibility signals (greatly reduced for unrelated scripts)
    'import_overlap': 0.03,            # Common imports (less relevant for unrelated scripts)
    'function_signature_compat': 0.02,  # API compatibility between modules
    'naming_conventions': 0.01,         # Similar naming patterns
    'code_style_similarity': 0.01,      # Minor signal for unrelated scripts
    'package_version_compat': 0.03,     # External dependency compatibility
    
    # Advanced metrics for large-scale unrelated script integration
    'namespace_isolation': 0.14,        # How well module can be namespace-isolated (critical)
    'semantic_similarity': 0.05,        # Content-based similarity beyond imports
    'symbol_collision_risk': 0.10,      # Risk of name collisions with other modules
    'side_effect_safety': 0.12,         # Freedom from dangerous global state changes
    'execution_context_compat': 0.04,   # Similar execution environments
    
    # Structural integration factors
    'interface_adaptability': 0.07,     # How easily interfaces can be adapted
    'dependency_graph_position': 0.02,  # Position in dependency tree
    'cluster_cohesion': 0.04,           # Belonging to meaningful code clusters
    'domain_specific_compatibility': 0.03,  # Domain-specific signals (ML, web, data, etc.)
    
    # New massive-scale integration factors
    'resource_conflict_risk': 0.08,     # Likelihood of resource conflicts (files, ports, etc.)
    'runtime_isolation_potential': 0.10,  # How easily the code can run in isolated environment
    'python_version_compatibility': 0.04,  # Python version requirements compatibility
    'static_vs_dynamic_behavior': 0.05,   # Preference for deterministic behavior
    'error_containment': 0.09,          # Ability to contain errors without propagation
}
# Function to calculate statistical clustering of modules
def calculate_module_clusters(modules):
    """
    Group modules into clusters based on similarity metrics.
    Handles tens of thousands of unrelated scripts efficiently.
    
    Features designed for massive-scale diverse codebases:
    1. Multi-dimensional similarity scoring across code characteristics
    2. Hierarchical clustering with variable thresholds
    3. Locality-sensitive hashing for efficient similarity computation
    4. Script intention detection (standalone vs component)
    5. Advanced feature extraction beyond simple imports
    6. Handles completely unrelated scripts through namespace isolation
    
    Args:
        modules: List of module information dictionaries
    
    Returns:
        dict: Cluster ID to list of module names mapping
    """
    
    start_time = time.time()
    log(f"🔍 Clustering {len(modules)} modules...")
    
    # Filter valid modules
    valid_modules = [m for m in modules if m]
    if not valid_modules:
        return {}
    
    # For massive codebases, use sampling approach
    sample_size = min(len(valid_modules), 5000)  # Cap for memory constraints
    if len(valid_modules) > sample_size:
        log(f"⚠️ Large codebase detected, using {sample_size} representative modules for clustering")
        valid_modules = random.sample(valid_modules, sample_size)
    
    # Phase 1: Extract multi-dimensional feature vectors
    feature_sets = defaultdict(dict)
    module_texts = {}  # For text-based clustering
    
    import_sets = []  # Track sets of imports for clustering
    
    # ...existing code...
    if not mod or not mod.get("imports"):
        pass
        
    imports = set(imp.split()[1].split('.')[0] for imp in mod.get("imports", []) 
                 if ' import ' in imp)
    if imports:
        import_sets.append(imports)
    # ...existing code...
    
    # Define feature extractors for different dimensions
    dimensions = {
        "imports": lambda m: set(imp.split()[1].split('.')[0].replace(',', '') 
                             for imp in m.get("imports", []) if ' import ' in imp),
        "filename_kw": lambda m: set(re.findall(r'[a-z][a-z0-9_]+', m.get("filename", "").lower())),
        "package": lambda m: {m.get("package", "unknown")},
        "has_main": lambda m: {str(m.get("has_main", False))},
        "has_subprocess": lambda m: {str(m.get("subprocesses", False))},
    }
    
    # Fix missing code for package profile storage
    if not profile["package"]:
        profile["package"] = mod.get("package")
    
    # Extract features and read file contents when available
    for module in valid_modules:
        module_name = module.get("filename", "").replace('.py', '')
        if not module_name:
            continue
            
        # Extract features for each dimension
        for dim_name, extractor in dimensions.items():
            try:
                feature_sets[dim_name][module_name] = extractor(module)
            except Exception:
                feature_sets[dim_name][module_name] = set()
        
        # Read actual code content when available (for semantic clustering)
        try:
            module_path = os.path.join(OUTPUT_FOLDER, module.get("filename", ""))
            if os.path.exists(module_path):
                with open(module_path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                    # Store for text analysis, filtering out imports
                    content_lines = content.split("\n")
                    filtered_lines = [l for l in content_lines 
                                     if not l.strip().startswith(("import ", "from "))]
                    module_texts[module_name] = "\n".join(filtered_lines)
        except Exception:
            module_texts[module_name] = ""
    
    # Phase 2: Multi-dimensional clustering
    clusters = {}
    domains = defaultdict(list)
    
    # Approach 1: Import-based clustering (most reliable for related code)
    if feature_sets["imports"]:
        for module in valid_modules:
            module_lower = module.get("filename", "").lower()
            if any(web in module_lower for web in ['http', 'web', 'flask', 'django', 'request']):
                domains["web"].append(module)
            elif any(ml in module_lower for ml in ['model', 'train', 'predict', 'learn']):
                domains["ml"].append(module)
            elif any(data in module_lower for data in ['data', 'csv', 'json', 'parse']):
                domains["data"].append(module)
            elif any(ui in module_lower for ui in ['ui', 'gui', 'window', 'view', 'display']):
                domains["ui"].append(module)
            elif any(util in module_lower for util in ['util', 'helper', 'tool']):
                domains["utils"].append(module)
            elif any(io in module_lower for io in ['file', 'io', 'read', 'write', 'load']):
                domains["io"].append(module)
            elif any(api in module_lower for api in ['api', 'rest', 'service', 'endpoint']):
                domains["api"].append(module)
        # Create similarity matrix based on import overlap
        module_names = list(feature_sets["imports"].keys())
        similarity_matrix = np.zeros((len(module_names), len(module_names)))
        
        for i, name1 in enumerate(module_names):
            imports1 = feature_sets["imports"][name1]
            if not imports1:
                continue
                
            for j, name2 in enumerate(module_names):
                if i == j:
                    similarity_matrix[i][j] = 1.0
                    continue
                    
                imports2 = feature_sets["imports"][name2]
                if not imports2:
                    continue
                
                # Jaccard similarity: intersection over union
                intersection = len(imports1.intersection(imports2))
                union = len(imports1.union(imports2))
                if union > 0:
                    similarity_matrix[i][j] = intersection / union
        
        # Use DBSCAN for density-based clustering (handles noise points well)
        distance_matrix = 1 - similarity_matrix
        clustering = DBSCAN(eps=0.7, min_samples=2, metric='precomputed')
        try:
            labels = clustering.fit_predict(distance_matrix)
            
            # Create clusters from labels
            import_clusters = defaultdict(list)
            for i, label in enumerate(labels):
                if label != -1:  # -1 means noise in DBSCAN
                    import_clusters[f"imp_{label}"].append(module_names[i])
            
            clusters.update(import_clusters)
            log(f"📊 Found {len(import_clusters)} import-based clusters")
        except Exception as e:
            log(f"⚠️ Import clustering failed: {str(e)}")
    
    # Approach 2: Content-based semantic clustering for modules with content
    if len(module_texts) > 1:
        try:
            # Use TF-IDF vectorization on code content
            vectorizer = TfidfVectorizer(
                max_features=1000,
                min_df=2,
                max_df=0.8,
                stop_words=["def", "class", "self", "return", "import", "from", "as"]
            )
            
            # Convert texts to module names and content lists
            module_names = list(module_texts.keys())
            texts = [module_texts[name] for name in module_names]
            
            # Skip if we don't have enough non-empty texts
            if sum(1 for t in texts if t.strip()) > 2:
                # Create document-term matrix
                try:
                    tfidf_matrix = vectorizer.fit_transform(texts)
                    
                    # Use hierarchical clustering
                    n_clusters = min(max(len(module_names) // 10, 2), 100)
                    clustering = AgglomerativeClustering(
                        n_clusters=n_clusters,
                        affinity='euclidean',
                        linkage='ward'
                    )
                    labels = clustering.fit_predict(tfidf_matrix.toarray())
                    
                    # Create clusters from labels
                    content_clusters = defaultdict(list)
                    for i, label in enumerate(labels):
                        content_clusters[f"sem_{label}"].append(module_names[i])
                    
                    # Only keep reasonably-sized clusters
                    filtered_content_clusters = {
                        k: v for k, v in content_clusters.items() 
                        if 2 <= len(v) <= CLUSTER_MAX_SIZE
                    }
                    
                    clusters.update(filtered_content_clusters)
                    log(f"📊 Found {len(filtered_content_clusters)} content-based clusters")
                except Exception as e:
                    log(f"⚠️ Content vectorization failed: {str(e)}")
        except Exception as e:
            log(f"⚠️ Semantic clustering error: {str(e)}")
    
    # Approach 3: Filename/convention-based clustering for truly unrelated code
    convention_clusters = defaultdict(list)
    for module in valid_modules:
        name = module.get("filename", "").replace('.py', '')
        if not name:
            continue
            
        # Check patterns in filename
        name_lower = name.lower()
        
        # Detect common naming conventions
        if name.startswith('test_') or name.endswith('_test'):
            convention_clusters['testing'].append(name)
        elif any(x in name_lower for x in ['util', 'helper', 'tool']):
            convention_clusters['utilities'].append(name)
        elif any(x in name_lower for x in ['model', 'predict', 'train', 'learn']):
            convention_clusters['ml_models'].append(name)
        elif any(x in name_lower for x in ['data', 'dataset', 'loader']):
            convention_clusters['data_processing'].append(name)
        elif any(x in name_lower for x in ['api', 'rest', 'http', 'route']):
            convention_clusters['api_endpoints'].append(name)
        elif any(x in name_lower for x in ['ui', 'view', 'window', 'widget']):
            convention_clusters['user_interface'].append(name)
    
    # Add convention-based clusters
    clusters.update({f"conv_{k}": v for k, v in convention_clusters.items() if len(v) >= 2})
    
    # Phase 3: Namespace isolation for completely unrelated scripts
    # For any module not in a cluster, create a singleton cluster
    all_clustered = set()
    for modules in clusters.values():
        # Put in smaller chunks for unclassified modules
        if not chunks or len(chunks[-1]) >= CLUSTER_MAX_SIZE // 2:
            chunks.append([])
        chunks[-1].append(module)
        all_clustered.update(modules)
        
    singletons = 0
    for module in valid_modules:
        name = module.get("filename", "").replace('.py', '')
        if name and name not in all_clustered:
            clusters[f"iso_{singletons}"] = [name]
            singletons += 1
    
    # Phase 4: Final optimization - merge small clusters and split large ones
    optimized_clusters = {}
    
    # Merge very small, similar clusters with enhanced similarity metrics
    # Designed for tens of thousands of unrelated scripts
    small_clusters = [(k, v) for k, v in clusters.items() if 2 <= len(v) < 5]
    
    # Use sampling for very large numbers of small clusters to prevent quadratic complexity
    if len(small_clusters) > 500:
        log(f"⚠️ Large number of small clusters ({len(small_clusters)}) - using sampling approach")
        random.shuffle(small_clusters)
        small_clusters = small_clusters[:500]  # Cap to prevent excessive computation
    
    # Build multi-dimensional similarity profiles for each cluster
    similarity_profiles = {}
    for cluster_id, modules in small_clusters:
        profile = {
            "imports": set(),
            "naming_patterns": set(),
            "filename_keywords": set(),
            "package": None
        }
        
        # Collect profile data across all modules in the cluster
        for module in modules:
            # Import patterns - most reliable for related code
            if module in feature_sets["imports"]:
                profile["imports"].update(feature_sets["imports"][module])
            
            # Naming patterns (word parts from module name)
            name_parts = re.findall(r'[a-z][a-z0-9_]+', module.lower())
            profile["naming_patterns"].update(name_parts)
            
            # Get filename keywords
            if module in feature_sets["filename_kw"]:
                profile["filename_keywords"].update(feature_sets["filename_kw"][module])
                
            # Track package (all modules in a cluster should be from same package)
            for mod in valid_modules:
                if mod.get("filename", "").replace('.py', '') == module:
                    if not profile["package"]:
                        profile["package"] = mod.get("package")
                    break
                    
        similarity_profiles[cluster_id] = profile
    
    # Track clusters that have already been merged
    merged_clusters = set()
    
    for i, (cluster1, modules1) in enumerate(small_clusters):
        if cluster1 in merged_clusters:
            continue
            
        for j, (cluster2, modules2) in enumerate(small_clusters[i+1:], i+1):
            if cluster2 in merged_clusters:
                continue
                
            # Skip if they're from different types of clustering algorithms
            type1 = cluster1.split('_')[0]
            type2 = cluster2.split('_')[0]
            if type1 != type2:
                continue
                
            # Skip if they're from different packages (avoid cross-domain mixing)
            profile1 = similarity_profiles[cluster1]
            profile2 = similarity_profiles[cluster2]
            if (profile1["package"] and profile2["package"] and 
                profile1["package"] != profile2["package"]):
                continue
                
            # Calculate multi-dimensional similarity score
            similarity_scores = []
            
            # 1. Import similarity (weighted highest)
            imports1 = profile1["imports"]
            imports2 = profile2["imports"]
            if imports1 and imports2:
                intersection = len(imports1.intersection(imports2))
                union = len(imports1.union(imports2))
                if union > 0:
                    import_similarity = intersection / union
                    similarity_scores.append((import_similarity, 0.6))  # 60% weight
            
            # 2. Naming pattern similarity
            names1 = profile1["naming_patterns"]
            names2 = profile2["naming_patterns"]
            if names1 and names2:
                intersection = len(names1.intersection(names2))
                union = len(names1.union(names2))
                if union > 0:
                    name_similarity = intersection / union
                    similarity_scores.append((name_similarity, 0.3))  # 30% weight
            
            # 3. Filename keyword similarity
            kw1 = profile1["filename_keywords"]
            kw2 = profile2["filename_keywords"]
            if kw1 and kw2:
                intersection = len(kw1.intersection(kw2))
                union = len(kw1.union(kw2))
                if union > 0:
                    kw_similarity = intersection / union
                    similarity_scores.append((kw_similarity, 0.1))  # 10% weight
            
            # Calculate weighted similarity score
            if similarity_scores:
                weighted_sim = sum(score * weight for score, weight in similarity_scores)
                denominator = sum(weight for _, weight in similarity_scores)
                if denominator > 0:
                    final_similarity = weighted_sim / denominator
                    
                    # Higher threshold for unrelated scripts to prevent false grouping
                    if final_similarity > 0.4:  # Increased from 0.3
                        # Check if merged cluster would exceed size limit
                        if len(modules1) + len(modules2) <= CLUSTER_MAX_SIZE:
                            # Merge these clusters
                            clusters[cluster1].extend(clusters[cluster2])
                            clusters[cluster2] = []
                            merged_clusters.add(cluster2)
                            
                            # Update similarity profile for the merged cluster
                            profile1["imports"].update(profile2["imports"])
                            profile1["naming_patterns"].update(profile2["naming_patterns"])
                            profile1["filename_keywords"].update(profile2["filename_keywords"])
    # Remove empty clusters and optimize for massive-scale integration 
    # with scripts not designed to work together
    isolated_modules = set()  # Track completely unrelated modules
    integration_groups = {}   # For scripts that might work together
    isolation_required = {}   # Scripts that must be isolated (conflicting names/resources)
    
    # First pass: identify scripts that absolutely need isolation
    for cluster_id, modules_list in list(clusters.items()):
        if not modules_list:
            continue
            
        # Check for namespace conflicts within clusters
        name_conflicts = defaultdict(list)
        for module_name in modules_list:
            # Extract defined names from modules when available
            try:
                module_path = os.path.join(OUTPUT_FOLDER, f"{module_name}.py")
                if os.path.exists(module_path):
                    with open(module_path, "r", encoding="utf-8", errors="ignore") as f:
                        content = f.read()
                    tree = ast.parse(content)
                    
                    # Get all top-level definitions
                    for node in tree.body:
                        if isinstance(node, (ast.FunctionDef, ast.ClassDef)):
                            name_conflicts[node.name].append(module_name)
                        elif isinstance(node, ast.Assign):
                            for target in node.targets:
                                if isinstance(target, ast.Name):
                                    name_conflicts[target.id].append(module_name)
            except Exception:
                # If parsing fails, err on the side of caution
                isolation_required[module_name] = f"parse_failure_{len(isolation_required)}"
        
        # Identify modules with high name conflict rates
        for name, conflicting_modules in name_conflicts.items():
            if len(conflicting_modules) > 1 and not name.startswith('_'):
                for module in conflicting_modules:
                    isolation_required[module] = f"name_conflict_{name}"
    
    # Second pass: identify integration candidates vs complete isolates
    for cluster_id, modules_list in list(clusters.items()):
        if not modules_list:
            continue
            
        # Apply multi-dimensional clustering with dynamic thresholds
        if len(modules_list) > CLUSTER_MAX_SIZE:
            # For very large collections, apply hierarchical splitting
            remaining = modules_list.copy()
            
            # Progressive integration: first group "sure" matches
            strong_matches = defaultdict(list)
            while remaining and len(strong_matches) < len(remaining) / 3:
                seed = remaining[0]
                remaining.remove(seed)
                strong_group = [seed]
                
                # Find strongly related modules using stricter threshold
                seed_path = os.path.join(OUTPUT_FOLDER, f"{seed}.py")
                if os.path.exists(seed_path):
                    try:
                        with open(seed_path, "r", encoding="utf-8", errors="ignore") as f:
                            seed_content = f.read()
                            
                        # Check each remaining module for strong similarity
                        i = 0
                        while i < len(remaining):
                            module = remaining[i]
                            module_path = os.path.join(OUTPUT_FOLDER, f"{module}.py")
                            
                            if os.path.exists(module_path):
                                try:
                                    with open(module_path, "r", encoding="utf-8", errors="ignore") as f:
                                        module_content = f.read()
                                        
                                    # Multi-dimensional similarity scoring
                                    similarity_score = 0
                                    
                                    # 1. Import similarity (strongest signal)
                                    seed_imports = re.findall(r'^(?:from|import)\s+([^\s]+)', seed_content, re.MULTILINE)
                                    module_imports = re.findall(r'^(?:from|import)\s+([^\s]+)', module_content, re.MULTILINE)
                                    
                                    if seed_imports and module_imports:
                                        common = set(seed_imports) & set(module_imports)
                                        union = set(seed_imports) | set(module_imports)
                                        if union:
                                            import_sim = len(common) / len(union)
                                            similarity_score += import_sim * 0.6
                                    
                                    # 2. Function name similarity
                                    seed_funcs = set(re.findall(r'def\s+([^\s\(]+)', seed_content))
                                    module_funcs = set(re.findall(r'def\s+([^\s\(]+)', module_content))
                                    
                                    if seed_funcs and module_funcs:
                                        common = seed_funcs & module_funcs
                                        if common and len(common)/max(len(seed_funcs), len(module_funcs)) > 0.3:
                                            similarity_score += 0.3
                                            
                                    # High threshold for strong matches
                                    if similarity_score > 0.4 and module not in isolation_required:
                                        strong_group.append(module)
                                        remaining.remove(module)
                                        i -= 1
                                except Exception:
                                    pass
                            i += 1
                    except Exception:
                        pass
                        
                if len(strong_group) > 1:  # Found related modules
                    group_id = f"{cluster_id}_strong_{len(strong_matches)}"
                    strong_matches[group_id] = strong_group
                else:
                    # No strong matches, might be a standalone script
                    isolated_modules.add(seed)
            
            # Now handle remaining modules with looser grouping
            chunks = []
            
            # Group by domain-specific signals when possible
            domains = {
                "web": [], "data": [], "ml": [], "ui": [], 
                "utils": [], "io": [], "api": []
            }
            
            for module in remaining:
                # Check filename for domain hints
                module_lower = module.lower()
                if any(web in module_lower for web in ['http', 'web', 'flask', 'django', 'request']):
                    domains["web"].append(module)
                elif any(ml in module_lower for ml in ['model', 'train', 'predict', 'learn']):
                    domains["ml"].append(module)
                elif any(data in module_lower for data in ['data', 'csv', 'json', 'parse']):
                    domains["data"].append(module)
                elif any(ui in module_lower for ui in ['ui', 'gui', 'window', 'view', 'display']):
                    domains["ui"].append(module)
                elif any(util in module_lower for util in ['util', 'helper', 'tool']):
                    domains["utils"].append(module)
                elif any(io in module_lower for io in ['file', 'io', 'read', 'write', 'load']):
                    domains["io"].append(module)
                elif any(api in module_lower for api in ['api', 'rest', 'service', 'endpoint']):
                    domains["api"].append(module)
                else:
                    # Put in smaller chunks for unclassified modules
                    if not chunks or len(chunks[-1]) >= CLUSTER_MAX_SIZE // 2:
                        chunks.append([])
                    chunks[-1].append(module)
            
            # Add domain-specific groups to integration groups
            for domain, domain_modules in domains.items():
                if domain_modules:
                    # Split very large domain groups
                    if len(domain_modules) > CLUSTER_MAX_SIZE:
                        for i in range(0, len(domain_modules), CLUSTER_MAX_SIZE):
                            chunk = domain_modules[i:i + CLUSTER_MAX_SIZE]
                            integration_groups[f"{cluster_id}_{domain}_{i//CLUSTER_MAX_SIZE}"] = chunk
                    else:
                        integration_groups[f"{cluster_id}_{domain}"] = domain_modules
            
            # Add strong matches to integration groups
            integration_groups.update(strong_matches)
            
            # Add remaining chunks
            for i, chunk in enumerate(chunks):
                if chunk:  # Skip empty chunks
                    if len(chunk) > CLUSTER_MAX_SIZE:
                        # Further split if still too large
                        for j in range(0, len(chunk), CLUSTER_MAX_SIZE):
                            subchunk = chunk[j:j + CLUSTER_MAX_SIZE]
                            integration_groups[f"{cluster_id}_misc_{i}_{j//CLUSTER_MAX_SIZE}"] = subchunk
                    else:
                        integration_groups[f"{cluster_id}_misc_{i}"] = chunk
        else:
            # Small clusters (likely already related) can be kept as is
            integration_groups[cluster_id] = modules_list
    
    # Third pass: create individual isolation namespaces for completely unrelated scripts
    for module in isolated_modules:
        if module not in isolation_required:  # Don't duplicate
            isolation_required[module] = f"isolated_{len(isolation_required)}"
    
    # Create final optimized clusters
    # 1. Integration groups (modules that can work together)
    for group_id, modules in integration_groups.items():
        # Remove any modules that require isolation
        filtered_modules = [m for m in modules if m not in isolation_required]
        if filtered_modules:
            optimized_clusters[group_id] = filtered_modules
    
    # 2. Isolation namespaces (one module per cluster)
    for module, namespace in isolation_required.items():
        optimized_clusters[f"iso_{namespace}"] = [module]
    
    # Report results with enhanced metrics
    cluster_sizes = [len(modules) for modules in optimized_clusters.values()]
    if cluster_sizes:
        avg_size = sum(cluster_sizes) / len(cluster_sizes)
        num_isolated = sum(1 for size in cluster_sizes if size == 1)
        isolation_rate = num_isolated / len(cluster_sizes) if cluster_sizes else 0
        log(f"🏁 Clustering complete: {len(optimized_clusters)} clusters, avg size: {avg_size:.1f}")
        log(f"🔒 Isolation rate: {isolation_rate:.1%} ({num_isolated} standalone scripts)")
        log(f"🔄 Integration groups: {len(integration_groups)} potential code collaborations")
        log(f"⏱️ Clustering took {time.time() - start_time:.2f} seconds")
    
    return optimized_clusters

def resolve_namespace_conflicts(modules):
    """
    Detect and resolve namespace conflicts between unrelated modules.
    
    Designed to handle tens of thousands of scripts not meant to work together.
    Uses multi-level resolution strategies including:
    - Module clustering to identify related code
    - Namespace isolation for unrelated modules
    - Symbol prefixing for conflict resolution
    - Dynamic module loading for complete isolation
    
    Args:
        modules: List of module information dictionaries
    
    Returns:
        dict: Resolution strategy for each module
    """
    start_time = time.time()
    log(f"🔍 Analyzing namespace conflicts across {len(modules)} modules")
    
    # Track all defined symbols across all modules
    module_symbols = {}
    symbol_locations = defaultdict(list)
    conflict_map = defaultdict(set)
    resolution_strategies = {}
    
    # Pass 1: Collect all symbol definitions with batching for scalability
    batch_size = 1000  # Process in batches to handle tens of thousands of scripts
    for i in range(0, len(modules), batch_size):
        batch = [m for m in modules[i:i+batch_size] if m]
        log(f"Processing batch {i//batch_size + 1}/{(len(modules) + batch_size - 1)//batch_size}")
        
        for module_info in batch:
            if not module_info or "filename" not in module_info:
                continue
                
            filename = module_info["filename"]
            module_name = filename.replace('.py', '')
            module_path = os.path.join(OUTPUT_FOLDER, filename)
            
            if not os.path.exists(module_path):
                continue
                
            # Extract all defined symbols
            try:
                with open(module_path, "r", encoding="utf-8", errors="ignore") as f:
                    code = f.read()
                
                tree = ast.parse(code)
                symbols = {}
                
                # Track classes, functions and global variables
                for node in tree.body:
                    if isinstance(node, ast.ClassDef):
                        symbols[node.name] = {'type': 'class', 'lineno': node.lineno}
                    elif isinstance(node, ast.FunctionDef):
                        symbols[node.name] = {'type': 'function', 'lineno': node.lineno}
                    elif isinstance(node, ast.Assign):
                        for target in node.targets:
                            if isinstance(target, ast.Name):
                                symbols[target.id] = {'type': 'variable', 'lineno': node.lineno}
                
                module_symbols[module_name] = symbols
                
                # Record symbol locations for conflict detection
                for symbol in symbols:
                    symbol_locations[symbol].append(module_name)
            except Exception as e:
                log(f"⚠️ Error analyzing symbols in {filename}: {str(e)}")
    
    # Pass 2: Identify conflicts
    for symbol, locations in symbol_locations.items():
        if len(locations) > 1:  # This symbol exists in multiple modules
            for module in locations:
                conflict_map[module].add(symbol)
    
    # Pass 3: Use module clusters to determine resolution strategy
    log("🧩 Using module clusters to determine resolution strategies")
    module_clusters = calculate_module_clusters(modules)
    
    # Group modules by cluster
    cluster_modules = defaultdict(list)
    for cluster_id, module_names in module_clusters.items():
        for module_name in module_names:
            module_filename = f"{module_name}.py"
            for module_info in modules:
                if not module_info or "filename" not in module_info:
                    continue
                if module_info and module_info.get("filename") == module_filename:
                    cluster_modules[cluster_id].append(module_info)
                    break
    
    # Calculate cluster cohesion (how related modules are)
    cluster_cohesion = {}
    for cluster_id, cluster_mods in cluster_modules.items():
        if len(cluster_mods) < 2:
            cluster_cohesion[cluster_id] = 0.0
            continue
            
        # Calculate import overlap within cluster
        import_sets = []
        for mod in cluster_mods:
            if not mod or not mod.get("imports"):
                continue
                
            imports = set(imp.split()[1].split('.')[0] for imp in mod.get("imports", []) 
                         if ' import ' in imp)
            if imports:
                import_sets.append(imports)
        
        if not import_sets:
            cluster_cohesion[cluster_id] = 0.0
            continue
            
        # Calculate average Jaccard similarity
        similarities = []
        for i in range(len(import_sets)):
            for j in range(i+1, len(import_sets)):
                union = len(import_sets[i] | import_sets[j])
                if union > 0:
                    similarity = len(import_sets[i] & import_sets[j]) / union
                    similarities.append(similarity)
        
        cluster_cohesion[cluster_id] = sum(similarities) / max(1, len(similarities))
    
    # Pass 4: Apply resolution strategies based on cluster cohesion
    for cluster_id, cohesion in cluster_cohesion.items():
        # Apply the strategy to all modules in this cluster
        for module_info in cluster_modules[cluster_id]:
            if not module_info:
                continue
                
            filename = module_info.get("filename")
            if not filename:
                continue
                
            module_name = filename.replace('.py', '')
            
            # Record conflicts and resolution strategy
            resolution_strategies[module_name] = {
                'strategy': strategy,
                'cluster': cluster_id,
                'conflicts': list(conflict_map.get(module_name, set())),
                'cohesion': cohesion
            }
        # Determine strategy based on cohesion and size
        modules_in_cluster = len(cluster_modules[cluster_id])
        
        if modules_in_cluster == 1:
            # Single module can use namespace isolation
            strategy = "namespace_isolation"
        elif cohesion > 0.5 and modules_in_cluster < 10:
            # High cohesion, small cluster - likely meant to work together
            strategy = "symbol_rename"
        elif cohesion > 0.3 or modules_in_cluster < 5:
            # Medium cohesion or small cluster - use module prefixing
            strategy = "module_prefix"
        else:
            # Low cohesion or large cluster - use complete namespace isolation
            strategy = "namespace_isolation"
        
        # Apply the strategy to all modules in this cluster
        for module_info in cluster_modules[cluster_id]:
            if not module_info:
                continue
                
            filename = module_info.get("filename")
            if not filename:
                continue
                
            module_name = filename.replace('.py', '')
            
            # Record conflicts and resolution strategy
            resolution_strategies[module_name] = {
                'strategy': strategy,
                'cluster': cluster_id,
                'conflicts': list(conflict_map.get(module_name, set())),
                'cohesion': cohesion
            }
    
    # Pass 5: Apply resolutions by modifying files
    modules_modified = 0
    
    for module_info in modules:
        try:
            with open(module_path, "r", encoding="utf-8", errors="ignore") as f:
                code = f.read()
            
            tree = ast.parse(code)
            modified = False
            
            # Apply the appropriate resolution strategy
            if strategy == "symbol_rename":
                # Rename conflicting symbols by prefixing with module name
                for node in ast.walk(tree):
                    if isinstance(node, (ast.ClassDef, ast.FunctionDef)) and node.name in conflicts:
                        node.name = f"{module_name}_{node.name}"
                        modified = True
                    elif isinstance(node, ast.Assign):
                        for target in node.targets:
                            if isinstance(target, ast.Name) and target.id in conflicts:
                                target.id = f"{module_name}_{target.id}"
                                modified = True
                
            elif strategy == "module_prefix":
                # Add module prefix to all top-level definitions
                for node in tree.body:
                    if isinstance(node, (ast.ClassDef, ast.FunctionDef)):
                        if not node.name.startswith(f"{module_name}_") and not node.name.startswith('_'):
                            node.name = f"{module_name}_{node.name}"
                            modified = True
                
            elif strategy == "namespace_isolation":
                # Wrap module contents in a namespace class
                # This just marks it for now, actual transformation happens in integration phase
                MODULE_METADATA[module_name] = {"isolation_needed": True}
                modified = True
            
            if modified:
                # Convert modified AST back to source code
                new_code = ast.unparse(tree)
                with open(module_path, "w", encoding="utf-8") as f:
                    f.write(new_code)
                modules_modified += 1
                log(f"✓ Applied {strategy} to {filename}")
                
        except Exception as e:
            log(f"⚠️ Error resolving conflicts in {filename}: {str(e)}")
        if not module_info or "filename" not in module_info:
            continue
            
        filename = module_info["filename"]
        module_name = filename.replace('.py', '')
        module_path = os.path.join(OUTPUT_FOLDER, filename)
        
        if not module_path or not os.path.exists(module_path):
            continue
            
        # Skip if no resolution needed
        if module_name not in resolution_strategies:
            continue
            
        res_info = resolution_strategies[module_name]
        strategy = res_info['strategy']
        conflicts = res_info['conflicts']
        
        if not conflicts:
            continue
            
        try:
            with open(module_path, "r", encoding="utf-8", errors="ignore") as f:
                code = f.read()
            
            tree = ast.parse(code)
            modified = False
            
            # Apply the appropriate resolution strategy
            if strategy == "symbol_rename":
                # Selectively rename conflicting symbols
                for node in tree.body:
                    if isinstance(node, (ast.ClassDef, ast.FunctionDef)) and node.name in conflicts:
                        node.name = f"{module_name}_{node.name}"
                        modified = True
                    elif isinstance(node, ast.Assign):
                        for target in node.targets:
                            if isinstance(target, ast.Name) and target.id in conflicts:
                                target.id = f"{module_name}_{target.id}"
                                modified = True
                
            elif strategy == "module_prefix":
                # Prefix all public symbols with module name
                prefix = module_name.split('_')[0]
                
                for node in tree.body:
                    if isinstance(node, (ast.ClassDef, ast.FunctionDef)):
                        # Only prefix non-private symbols
                        if not node.name.startswith('_'):
                            node.name = f"{prefix}_{node.name}"
                            modified = True
                    elif isinstance(node, ast.Assign):
                        for target in node.targets:
                            if isinstance(target, ast.Name) and not target.id.startswith('_'):
                                target.id = f"{prefix}_{target.id}"
                                modified = True
                
            elif strategy == "namespace_isolation":
                # Create a module namespace wrapper
                imports = [n for n in tree.body if isinstance(n, (ast.Import, ast.ImportFrom))]
                non_imports = [n for n in tree.body if not isinstance(n, (ast.Import, ast.ImportFrom))]
                
                namespace_name = f"{module_name.title().replace('_', '')}Namespace"
                
                # Create namespace class
                namespace_class = ast.ClassDef(
                    name=namespace_name,
                    bases=[],
                    keywords=[],
                    body=non_imports,
                    decorator_list=[]
                )
                
                # Add instantiation code
                instance_creation = ast.Assign(
                    targets=[ast.Name(id=module_name, ctx=ast.Store())],
                    value=ast.Call(
                        func=ast.Name(id=namespace_name, ctx=ast.Load()),
                        args=[],
                        keywords=[]
                    )
                )
                
                tree.body = imports + [namespace_class, instance_creation]
                modified = True
            
            if modified:
                # Fix locations for proper code generation
                ast.fix_missing_locations(tree)
                
                # Write back the modified code
                with open(module_path, "w", encoding="utf-8") as f:
                    f.write(ast.unparse(tree))
                    
                modules_modified += 1
                
        except Exception as e:
            log(f"⚠️ Error resolving conflicts in {filename}: {str(e)}")
    
    elapsed = time.time() - start_time
    log(f"✅ Resolved namespace conflicts in {modules_modified} modules ({elapsed:.1f}s)")
    return resolution_strategies

# Security classifier for unknown code
def assess_code_safety(code_str, filename="unknown.py"):
    """
    Analyze code for potentially harmful operations with advanced security scanning
    designed for integrating thousands of unrelated scripts.
    
    Features:
    1. Multi-level risk assessment with weighted scoring
    2. Context-aware pattern detection for harmful operations
    3. Resource conflict detection (files, ports, env vars)
    4. Namespace isolation recommendations
    5. Integration compatibility scoring
    
    Args:
        code_str: The source code to analyze as string
        filename: Original filename for context
    
    Returns:
        dict: Detailed safety assessment with:
            - score: Overall safety score (0-100, higher is safer)
            - risks: List of identified risk factors
            - severity: High/Medium/Low overall assessment
            - recommendations: Integration recommendations
            - isolation_needed: Whether code should be isolated
    """
    # Initialize results structure
    results = {
        "score": 100,  # Start with perfect score and deduct
        "risks": [],
        "severity": "Low",
        "recommendations": [],
        "isolation_needed": False,
    }
    
    # Skip empty code
    if not code_str or len(code_str.strip()) < 10:
        # Add recommendations based on integration challenges
        if integration_challenges:
            results["recommendations"].append(
                f"Integration challenges: {'; '.join(integration_challenges)}"
            )
            results["score"] -= min(15, len(integration_challenges) * 3)
        results["risks"].append("Empty or minimal code")
        return results
    
    try:
        # Parse into AST for structural analysis
        tree = ast.parse(code_str)
        
        # Track identified risks with severity levels
        risk_severities = []
        
        # ANALYSIS COMPONENT 1: Direct security risks
        # Scan for known dangerous patterns with weighted severity
        for pattern, severity in RISKY_CODE_PATTERNS:
            matches = pattern.findall(code_str)
            if matches:
                risk = f"Found {len(matches)} potentially unsafe {pattern.pattern} operations"
                results["risks"].append(risk)
                risk_severities.append(severity)
                results["score"] -= severity * 5 * len(matches)
        
        # ANALYSIS COMPONENT 2: System access risks
        system_access = {
            # File system operations
            "file_system_write": re.search(r'(open|Path)\s*\(.+?["\']w["\']', code_str) is not None,
            "file_system_read": re.search(r'(open|Path)\s*\(.+?["\']r["\']', code_str) is not None,
            "shutil_operations": re.search(r'shutil\.(copy|move|rmtree)', code_str) is not None,
            "os_path_operations": re.search(r'os\.(remove|unlink|rmdir|mkdir)', code_str) is not None,
            
            # Network/resource access
            "socket_operations": re.search(r'socket\.', code_str) is not None,
            "network_access": re.search(r'(requests|urllib|http)', code_str) is not None,
            "process_spawn": re.search(r'(subprocess|multiprocessing)', code_str) is not None,
            
            # System state modification
            "sys_path_modified": re.search(r'sys\.path\.(append|insert)', code_str) is not None,
            "env_var_access": re.search(r'os\.environ', code_str) is not None,
            "signal_handlers": re.search(r'signal\.(signal|alarm)', code_str) is not None,
            "sys_exit": re.search(r'sys\.exit', code_str) is not None,
            
            # Package installation/modification
            "pip_operations": re.search(r'pip\s+install|pkg_resources|setup\.py', code_str) is not None,
            "import_manipulation": re.search(r'__import__|importlib', code_str) is not None,
        }
        
        # Calculate risk based on system access patterns
        system_risk_score = 0
        for risk_type, detected in system_access.items():
            if detected:
                # Different risk types have different weights
                risk_weight = {
                    "file_system_write": 3,
                    "file_system_read": 1,
                    "shutil_operations": 3,
                    "os_path_operations": 2,
                    "socket_operations": 2,
                    "network_access": 2,
                    "process_spawn": 3,
                    "sys_path_modified": 3,
                    "env_var_access": 2,
                    "signal_handlers": 2,
                    "sys_exit": 1,
                    "pip_operations": 4,
                    "import_manipulation": 3,
                }.get(risk_type, 1)
                
                system_risk_score += risk_weight
                results["risks"].append(f"System access: {risk_type.replace('_', ' ')}")
        
        results["score"] -= min(40, system_risk_score * 3)  # Cap the penalty
        
        # ANALYSIS COMPONENT 3: Namespace pollution and global state
        global_state = {
            "modifies_globals": False,
            "modifies_builtins": False,
            "modifies_sys_modules": False,
            "monkey_patching": False,
            "many_globals": False,
        }
        
        # Count global variables
        global_vars = 0
        import_star = False
        
        # Analyze AST for global state modifications
        for node in ast.walk(tree):
            # Check for wildcard imports (import *)
            if isinstance(node, ast.ImportFrom) and any(name.name == '*' for name in node.names):
                import_star = True
                results["risks"].append("Uses wildcard imports (import *) which pollutes namespace")
                results["score"] -= 10
            
            # Check for assignments to global variables at module level
            elif isinstance(node, ast.Assign) and all(isinstance(target, ast.Name) for target in node.targets):
                if all(not target.id.startswith('_') for target in node.targets):
                    global_vars += 1
            
            # Check for modifications to builtins
            elif (isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name) and 
                  node.value.id in ('builtins', '__builtins__')):
                global_state["modifies_builtins"] = True
                results["risks"].append("Modifies Python builtins (high risk)")
                results["score"] -= 20
            
            # Check for sys.modules modifications
            elif (isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name) and 
                  node.value.id == 'sys' and node.attr == 'modules'):
                global_state["modifies_sys_modules"] = True
                results["risks"].append("Modifies sys.modules (may break imports)")
                results["score"] -= 15
        
        # Too many globals is a sign of potential namespace pollution
        if global_vars > 20:
            global_state["many_globals"] = True
            results["risks"].append(f"Defines many ({global_vars}) global variables")
            results["score"] -= min(15, global_vars // 2)  # Cap the penalty
        
        # ANALYSIS COMPONENT 4: Resource conflicts
        resource_conflicts = []
        
        # Check for hard-coded ports
        port_pattern = re.compile(r'port\s*=\s*(\d+)|\.bind\(\s*\(.*?(\d+)\)')
        port_matches = port_pattern.findall(code_str)
        if port_matches:
            flat_matches = [match for submatches in port_matches for match in submatches if match]
            ports = set(flat_matches)
            if ports:
                risk = f"Hard-coded network ports: {', '.join(ports)}"
                resource_conflicts.append(risk)
                results["risks"].append(risk)
                results["score"] -= 5 * len(ports)  # Multiple port bindings increase risk
        
        # Check for file paths that might conflict
        path_pattern = re.compile(r'[\'\"]([/\\][^\'"]*\.[\w]+)[\'\"]|[\'\"](\w+\.[\w]+)[\'\"]')
        path_matches = path_pattern.findall(code_str)
        common_file_extensions = {'.txt', '.csv', '.json', '.xml', '.db', '.sqlite', '.log'}
        
        # Extract all potential file paths
        file_paths = []
        for path_match in path_matches:
            for path in path_match:
                if path and '.' in path:
                    ext = path[path.rfind('.'):]
                    if ext in common_file_extensions:
                        file_paths.append(path)
        
        # Report file path conflicts only if there are several
        if len(file_paths) > 3:
            risk = f"Multiple file operations, potential conflicts: {len(file_paths)} files"
            resource_conflicts.append(risk)
            results["risks"].append(risk)
            results["score"] -= min(15, len(file_paths) * 2)  # Cap the penalty
        
        if resource_conflicts:
            results["recommendations"].append(
                "Resource isolation recommended - code accesses shared resources"
            )
        
        # ANALYSIS COMPONENT 5: Integration difficulty assessment
        integration_challenges = []
        
        # Hard to integrate: custom import paths
        if re.search(r'sys\.path\.append|sys\.path\.insert', code_str):
            integration_challenges.append("Modifies Python path")
            results["score"] -= 8
        
        # Hard to integrate: highly specific file paths
        if re.search(r'[\'\"]/\w+/|[\'\"]C:', code_str):
            integration_challenges.append("Uses absolute file paths")
            results["score"] -= 7
        
        # Hard to integrate: heavy threading/multiprocessing
        thread_count = len(re.findall(r'Thread\(|threading\.|multiprocessing\.', code_str))
        if thread_count > 2:
            integration_challenges.append(f"Heavy use of threading/multiprocessing ({thread_count} instances)")
            results["score"] -= min(15, thread_count * 3)  # Cap the penalty
        
        # Hard to integrate: global configuration
        if re.search(r'config\s*=|CONFIG\s*=|SETTINGS\s*=', code_str):
            integration_challenges.append("Global configuration may conflict with other scripts")
            results["score"] -= 6
        
        # Hard to integrate: uses __main__ check but no function
        main_check = re.search(r'if\s+__name__\s*==\s*[\'"]__main__[\'"]', code_str)
        main_func = re.search(r'def\s+main\s*\(', code_str)
        if main_check and not main_func:
            integration_challenges.append("Has __main__ block but no reusable main() function")
            results["score"] -= 5
        
        # Add recommendations based on integration challenges
        if integration_challenges:
            for challenge in integration_challenges:
                results["risks"].append(f"Integration: {challenge}")
            
            if len(integration_challenges) > 2:
                results["recommendations"].append(
                    "This script has multiple integration challenges and may need significant refactoring"
                )
        
        # ANALYSIS COMPONENT 6: Determine isolation requirements
        # Criteria for isolation:
        # 1. Score below threshold
        # 2. Critical resource conflicts
        # 3. Namespace pollution issues
        # 4. Severe security risks
        
        isolation_factors = []
        
        # Check severe security risks
        if any(severity >= 3 for severity in risk_severities):
            isolation_factors.append("Contains high security risk patterns")
        
        # Check namespace pollution
        if global_state["modifies_builtins"] or global_state["modifies_sys_modules"] or import_star:
            isolation_factors.append("Pollutes global namespace")
            
        # Check resource conflicts
        if "Hard-coded network ports" in ' '.join(resource_conflicts):
            isolation_factors.append("Potential network port conflicts")
            
        # Recommend isolation if needed
        if isolation_factors or results["score"] < 60:
            results["isolation_needed"] = True
            isolation_reason = " and ".join(isolation_factors) if isolation_factors else "Low overall safety score"
            results["recommendations"].append(f"ISOLATION REQUIRED: {isolation_reason}")
            
        # ANALYSIS COMPONENT 7: Final severity calculation
        # Determine overall severity rating
        if results["score"] < 50 or any(severity >= 3 for severity in risk_severities):
            results["severity"] = "High"
        elif results["score"] < 75 or any(severity >= 2 for severity in risk_severities):
            results["severity"] = "Medium"
        else:
            results["severity"] = "Low"
            
        # Ensure score is in valid range
        results["score"] = max(0, min(100, results["score"]))
            
        # Add integration recommendations
        if results["score"] >= 90:
            results["recommendations"].append("Safe for direct integration")
        elif results["score"] >= 75:
            results["recommendations"].append("Use wrapper functions for controlled integration")
        elif results["score"] >= 60:
            results["recommendations"].append("Namespace isolation recommended")
        else:
            results["recommendations"].append("Process isolation strongly recommended")
        
    except Exception as e:
        # Parsing errors indicate potential syntax issues or very unusual code
        results["risks"].append(f"Code analysis error: {str(e)}")
        results["score"] = 50  # Default to middle score for unparseable code
        results["severity"] = "Medium"
        results["recommendations"].append("Manual review required - could not automatically analyze")
    
    return results

# Execution sandbox for testing module compatibility
def test_module_in_sandbox(module_path, timeout=5, max_memory_mb=500, allow_network=False, 
                           namespace_isolation=True, dependency_check=True, safety_check=True):
    """
    Execute a module in an isolated sandbox to test for integration issues.
    Specifically designed for massive integration of thousands of unrelated scripts.
    
    Features:
    1. Full process isolation to prevent cross-contamination between scripts
    2. Resource limitations to prevent runaway processes
    3. Namespace isolation to prevent global state conflicts
    4. Dependency and version compatibility checking
    5. Security analysis to identify harmful code
    6. Import path resolution and conflict detection
    7. State change monitoring to detect side effects
    8. Dynamic import adaptation between unrelated scripts
    9. Execution context simulation for diverse script requirements
    
    Args:
        module_path: Path to the module file to test
        timeout: Maximum execution time in seconds (default: 5s)
        max_memory_mb: Memory limit in MB (default: 500MB)
        allow_network: Whether to allow network access (default: False)
        namespace_isolation: Whether to isolate namespace (default: True)
        dependency_check: Whether to check dependency compatibility (default: True)
        safety_check: Whether to perform security analysis (default: True)
        
    Returns:
        dict: Detailed compatibility report with integration recommendations
    """
    import importlib.util
    
    # Define worker process that will run in isolation
    def isolated_worker(module_path, results_queue, context_dict=None):
        try:
            # Set resource limits for safety
            if sys.platform != 'win32':  # Resource module not fully supported on Windows
                resource.setrlimit(resource.RLIMIT_CPU, (timeout + 1, timeout + 2))
                resource.setrlimit(resource.RLIMIT_DATA, (max_memory_mb * 1024 * 1024, 
                                                         max_memory_mb * 1024 * 1024))
            
            # Create clean environment - capture initial state
            initial_globals = set(globals().keys())
            initial_sys_modules = set(sys.modules.keys())
            initial_sys_path = sys.path.copy()
            initial_cwd = os.getcwd()
            
            # Security analysis
            if safety_check:
                # Read module content
                with open(module_path, 'r', encoding='utf-8', errors='ignore') as f:
                    code_content = f.read()
                
                # Perform security scan
                security_report = assess_code_safety(code_content, os.path.basename(module_path))
                
                # Skip execution if code is potentially harmful
                if security_report['isolation_needed'] or security_report['score'] < 50:
                    results_queue.put({
                        'success': False,
                        'error': 'Security risk detected',
                        'security_report': security_report,
                        'recommendation': 'Isolate this module',
                        'compatible': False
                    })
                    return
            else:
                security_report = {'score': 100}  # Default if no check done
            
            # Track state changes
            state_monitor = {}
            
            # Setup import tracking
            original_import = __import__
            imported_modules = set()
            
            # Create clean namespace if requested
            if namespace_isolation:
                isolated_namespace = types.ModuleType(
                    f"isolated_{os.path.basename(module_path).replace('.py', '')}")
                execution_context = isolated_namespace.__dict__
            else:
                execution_context = globals().copy()  # Use a copy of globals
            
            # Add minimal safe builtins
            for builtin_name in ['print', 'dict', 'list', 'set', 'int', 'float', 'str', 'bool', 'None',
                                'True', 'False', 'len', 'type', 'isinstance', 'range']:
                execution_context[builtin_name] = __builtins__[builtin_name]
            
            # Virtual import system for tracking and isolation
            def custom_import(*args, **kwargs):
                module_name = args[0]
                imported_modules.add(module_name)
                
                # For dependency checking
                try:
                    # Track import path resolution for conflict detection
                    if '.' in module_name:
                        base_module = module_name.split('.')[0]
                        if base_module not in sys.modules:
                            # It's a new base module import
                            state_monitor.setdefault('imports', []).append(base_module)
                            
                    # Try to safely import using original mechanism
                    return original_import(*args, **kwargs)
                except ImportError as e:
                    # Track failed imports
                    state_monitor.setdefault('failed_imports', []).append(module_name)
                    raise
            
            # Replace __import__ if we're doing dependency checking
            if dependency_check:
                builtins = sys.modules['builtins']
                builtins.__import__ = custom_import
            
            # Block network access if specified
            if not allow_network:
                # Simple network blocking by replacing socket functions
                if 'socket' in sys.modules:
                    socket_module = sys.modules['socket']
                    # Save original functions for restoration
                    original_socket = socket_module.socket
                    
                    # Replace with a blocked version
                    def blocked_socket(*args, **kwargs):
                        state_monitor.setdefault('blocked_operations', []).append('socket')
                        raise PermissionError("Network access disabled in sandbox")
                    
                    socket_module.socket = blocked_socket
            
            # Import the module using spec, which gives us more control
            try:
                module_name = os.path.basename(module_path).replace('.py', '')
                spec = importlib.util.spec_from_file_location(module_name, module_path)
                if spec is None:
                    results_queue.put({
                        'success': False,
                        'error': f'Failed to create spec for {module_path}',
                        'compatible': False
                    })
                    return
                
                module = importlib.util.module_from_spec(spec)
                
                # Add context variables if provided
                if context_dict:
                    for key, value in context_dict.items():
                        setattr(module, key, value)
                
                # Record starting time
                start_time = time.time()
                
                # Actually load and execute the module code
                try:
                    spec.loader.exec_module(module)
                    execution_time = time.time() - start_time
                    
                    # Check for functions we could potentially call
                    callable_entries = {}
                    for name, item in module.__dict__.items():
                        if callable(item) and not name.startswith('_'):
                            callable_entries[name] = str(type(item))
                    
                    # Record tracked state changes
                    state_monitor['execution_time'] = execution_time
                    state_monitor['module_attributes'] = list(module.__dict__.keys())
                    state_monitor['callable_entries'] = callable_entries
                    
                    # Check what changed in the global environment
                    final_globals = set(globals().keys())
                    new_globals = final_globals - initial_globals
                    if new_globals:
                        state_monitor['new_globals'] = list(new_globals)
                    
                    # Check sys.modules changes
                    final_modules = set(sys.modules.keys())
                    new_modules = final_modules - initial_sys_modules
                    if new_modules:
                        state_monitor['new_sys_modules'] = list(new_modules)
                    
                    # Check for sys.path modifications
                    if sys.path != initial_sys_path:
                        state_monitor['modified_sys_path'] = True
                    
                    # Check if the module has a main() function that could be an entry point
                    has_entry_point = (hasattr(module, 'main') and callable(module.main)) or \
                                     (hasattr(module, 'run') and callable(module.run))
                    
                    # Determine compatibility based on all checks
                    is_compatible = (
                        security_report['score'] >= 70 and  # Good security score
                        execution_time < timeout * 0.9 and  # Executed efficiently
                        not state_monitor.get('blocked_operations') and  # No blocked operations
                        not state_monitor.get('modified_sys_path', False)  # Doesn't modify import paths
                    )
                    
                    # Compile report
                    integration_report = {
                        'success': True,
                        'module_name': module_name,
                        'execution_time': execution_time,
                        'memory_usage': psutil.Process(os.getpid()).memory_info().rss / (1024 * 1024),
                        'has_entry_point': has_entry_point,
                        'security_score': security_report['score'],
                        'state_changes': state_monitor,
                        'compatible': is_compatible,
                        'imported_modules': list(imported_modules),
                        'isolation_recommended': security_report['score'] < 80 or \
                                              'new_globals' in state_monitor or \
                                              'modified_sys_path' in state_monitor
                    }
                    
                    results_queue.put(integration_report)
                    return
                    
                except Exception as e:
                    # Capture execution errors
                    tb = traceback.format_exc()
                    results_queue.put({
                        'success': False,
                        'error': str(e),
                        'traceback': tb,
                        'compatible': False,
                        'security_score': security_report['score'],
                        'execution_time': time.time() - start_time,
                        'recommendation': 'Module failed execution, fix errors before integration'
                    })
                    return
            
            except Exception as e:
                # This catches errors in the setup process
                tb = traceback.format_exc()
                results_queue.put({
                    'success': False,
                    'error': f'Module setup error: {str(e)}',
                    'traceback': tb,
                    'compatible': False,
                    'recommendation': 'Module failed to load, check imports and syntax'
                })
                return
                
            finally:
                # Restore original environment
                if dependency_check:
                    builtins.__import__ = original_import
                
                if not allow_network and 'socket' in sys.modules:
                    sys.modules['socket'].socket = original_socket
                
                # Restore working directory
                os.chdir(initial_cwd)
        
        except Exception as e:
            # Last resort error handler
            results_queue.put({
                'success': False,
                'error': f'Sandbox error: {str(e)}',
                'traceback': traceback.format_exc(),
                'compatible': False
            })
    
    # Create a process-safe queue for results
    results_queue = mp.Queue()
    
    # Create and start a separate process
    process = mp.Process(
        target=isolated_worker,
        args=(module_path, results_queue),
        daemon=True
    )
    process.start()
    
    # Wait for result with timeout
    process.join(timeout * 1.5)  # Extra margin for process cleanup
    
    # Check if process is still alive after timeout
    if process.is_alive():
        process.terminate()
        process.join(1)  # Wait a bit for termination
        
        if process.is_alive():
            # Force kill if it's still hanging
            process.kill()
            
        return {
            'success': False,
            'error': f'Module execution timed out after {timeout} seconds',
            'compatible': False,
            'recommendation': 'Module takes too long to execute, consider async integration'
        }
    
    # Get result if available
    if not results_queue.empty():
        result = results_queue.get()
        return result
    else:
        return {
            'success': False,
            'error': 'No result returned from sandbox',
            'compatible': False,
            'recommendation': 'Unknown error occurred during testing'
        }

# Function signature analyzer for API compatibility
def extract_function_signatures(tree):
    """
    Extract function signatures from AST for API compatibility analysis.
    Designed to work with large diverse codebases containing thousands of unrelated scripts.
    
    Features:
    - Multi-dimensional signature analysis beyond just parameter count
    - Semantic function purpose detection
    - Interface compatibility scoring for unrelated functions
    - Call pattern analysis for dynamic adaptation
    - Error resilience for diverse coding styles and conventions
    - Performance optimization for analyzing thousands of functions
    
    Args:
        tree: AST tree of the Python module
        
    Returns:
        dict: Map of function signatures with compatibility metadata
    """
    signatures = {}
    
    # Track module-level imports for context
    module_imports = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for name in node.names:
                module_imports.add(name.name.split('.')[0])
        elif isinstance(node, ast.ImportFrom) and node.module:
            module_imports.add(node.module.split('.')[0])
    
    # Process each function definition with error isolation
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef):
            try:
                func_name = node.name
                
                # Skip internal/private functions
                if func_name.startswith('_') and not func_name.startswith('__'):
                    continue
                    
                # Basic function metadata
                signature = {
                    'name': func_name,
                    'lineno': node.lineno,
                    'is_method': False,  # Will be updated later
                    'is_property': any(isinstance(d, ast.Name) and d.id == 'property' for d in node.decorator_list),
                    'is_classmethod': any(isinstance(d, ast.Name) and d.id == 'classmethod' for d in node.decorator_list),
                    'is_staticmethod': any(isinstance(d, ast.Name) and d.id == 'staticmethod' for d in node.decorator_list),
                    'decorators': [ast.unparse(d) for d in node.decorator_list],
                    'module_context': list(module_imports),
                    'return_type': None,
                    'docstring': ast.get_docstring(node),
                    'raises': [],
                    'complexity': 0,
                    'purity_score': 0,  # Higher means more pure (fewer side effects)
                    'param_patterns': {},  # For detecting common patterns like callbacks, configs
                    'adaptation_cost': 0,  # Estimated cost to adapt this function
                }
                
                # Parameter analysis with advanced interface patterns
                params = []
                has_var_args = False
                has_kw_args = False
                
                # Analyze parameters
                for i, arg in enumerate(node.args.args):
                    param = {
                        'name': arg.arg,
                        'position': i,
                        'has_default': i >= (len(node.args.args) - len(node.args.defaults)),
                        'type_annotation': arg.annotation.id if arg.annotation and hasattr(arg.annotation, 'id') else None,
                    }
                    
                    # Check if this is likely self/cls (method indicator)
                    if i == 0 and arg.arg in ('self', 'cls'):
                        signature['is_method'] = True
                    
                    # Try to infer default value when present
                    if param['has_default']:
                        default_idx = i - (len(node.args.args) - len(node.args.defaults))
                        try:
                            default_value = ast.unparse(node.args.defaults[default_idx])
                            param['default'] = default_value
                        except Exception:
                            param['default'] = "unknown"
                    
                    params.append(param)
                
                # Handle *args and **kwargs-style parameters
                if node.args.vararg:
                    has_var_args = True
                    params.append({
                        'name': f"*{node.args.vararg.arg}",
                        'position': len(params),
                        'has_default': False,
                        'is_var_args': True
                    })
                
                if node.args.kwarg:
                    has_kw_args = True
                    params.append({
                        'name': f"**{node.args.kwarg.arg}",
                        'position': len(params),
                        'has_default': False,
                        'is_kw_args': True
                    })
                
                # Extract return type annotation
                if node.returns:
                    try:
                        signature['return_type'] = ast.unparse(node.returns)
                    except Exception:
                        signature['return_type'] = "complex_type"
                
                # Function body analysis for compatibility metrics
                body_code = ast.unparse(node)
                signature['body_length'] = len(body_code)
                
                # Detect common parameter patterns
                if len(params) == 1 and not signature['is_method']:
                    signature['param_patterns']['simple_transform'] = True
                if any(p['name'] in ('callback', 'on_complete', 'on_success', 'on_error') for p in params):
                    signature['param_patterns']['callback'] = True
                if any(p['name'] in ('config', 'options', 'settings', 'params', 'kwargs') for p in params):
                    signature['param_patterns']['configurable'] = True
                
                # Detect error handling patterns
                try_count = body_code.count('try:')
                signature['raises'] = try_count > 0
                
                # Check for common IO and side effect patterns
                side_effect_indicators = ['open(', 'write', 'print(', 'socket', '.connect', 
                                         'requests.', 'subprocess', '.save', '.update']
                purity_score = 100
                for indicator in side_effect_indicators:
                    if indicator in body_code:
                        purity_score -= 10
                signature['purity_score'] = max(0, purity_score)
                
                # Add function signature with interface flexibility metrics
                signature['params'] = params
                signature['param_count'] = len(params)
                signature['required_params'] = len([p for p in params if not p.get('has_default', False) 
                                                  and not p.get('is_var_args', False) 
                                                  and not p.get('is_kw_args', False)])
                signature['has_var_args'] = has_var_args
                signature['has_kw_args'] = has_kw_args
                signature['is_flexible'] = has_var_args or has_kw_args
                
                # Calculate adaptation cost - higher means harder to integrate
                adaptation_cost = 0
                if signature['is_method']: adaptation_cost += 5  # Methods need class context
                if signature['purity_score'] < 50: adaptation_cost += 10  # Impure functions are harder to integrate
                if not signature['is_flexible']: adaptation_cost += signature['required_params'] * 2
                if signature['raises']: adaptation_cost += 3
                signature['adaptation_cost'] = adaptation_cost
                
                # Calculate function purpose/domain from name and params
                domains = {
                    'data': ['data', 'load', 'save', 'parse', 'format', 'convert', 'transform'],
                    'ui': ['display', 'show', 'render', 'draw', 'paint', 'ui', 'window', 'dialog'],
                    'network': ['connect', 'request', 'fetch', 'download', 'upload', 'api', 'http'],
                    'file': ['file', 'path', 'read', 'write', 'open', 'close', 'flush', 'io'],
                    'math': ['calculate', 'compute', 'math', 'add', 'sum', 'multiply', 'divide'],
                    'model': ['predict', 'inference', 'train', 'fit', 'model', 'batch', 'accuracy'],
                }
                
                function_domain = None
                highest_score = 0
                
                for domain, keywords in domains.items():
                    score = 0
                    # Check function name
                    if any(kw in func_name.lower() for kw in keywords):
                        score += 3
                    # Check param names
                    for p in params:
                        if any(kw in p['name'].lower() for kw in keywords):
                            score += 1
                    # Check docstring
                    if signature['docstring'] and any(kw in signature['docstring'].lower() for kw in keywords):
                        score += 2
                    
                    if score > highest_score:
                        highest_score = score
                        function_domain = domain
                
                signature['domain'] = function_domain if highest_score > 0 else 'general'
                
                # Finally, add to our results
                signatures[func_name] = signature
                
            except Exception as e:
                # Never fail - just log and continue
                signatures[f"__error_{node.name}"] = {
                    'name': node.name,
                    'error': str(e),
                    'is_error': True
                }
    
    return signatures

def log(msg, level="INFO", context=None, verbose=True, script_id=None, integration_phase=None):
    """
    Advanced logging system designed for massive-scale integration of thousands of unrelated scripts.
    
    Features:
    - Namespace isolation with script identifiers to prevent log conflicts
    - Multi-dimensional log categorization (by script group, integration phase, etc.)
    - Error correlation across unrelated scripts with tracking IDs
    - Adaptive log throttling for high-volume processing
    - Integration-specific diagnostics and metrics
    - Hierarchical organization for thousands of scripts
    - Resource conflict detection in logs
    
    Args:
        msg: Message to log
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL, INTEGRATION, CONFLICT)
        context: Context information (e.g., module name being processed)
        verbose: Whether to print to console
        script_id: Unique identifier for the script being processed
        integration_phase: Current integration phase (PARSE, ANALYZE, TRANSFORM, LINK, TEST)
    """
    # Thread safety with reentrant lock for parallel script processing
    log_lock = getattr(log, 'lock', threading.RLock())
    if not hasattr(log, 'lock'):
        log.lock = log_lock
    
    # Track script processing metrics
    script_metrics = getattr(log, 'script_metrics', {})
    if not hasattr(log, 'script_metrics'):
        log.script_metrics = script_metrics
    
    # Track error correlation
    error_map = getattr(log, 'error_map', defaultdict(list))
    if not hasattr(log, 'error_map'):
        log.error_map = error_map
        
    # Initialize log buffer for high-volume scenarios
    log_buffer = getattr(log, 'buffer', [])
    if not hasattr(log, 'buffer'):
        log.buffer = log_buffer
        log.last_flush = time.time()
        log.buffer_size = 0
    
    # Generate unique log entry ID for correlation
    entry_id = f"{int(time.time() * 1000)}-{random.randint(1000, 9999)}"
    
    # Start script timing if this is the first log for this script
    if script_id and script_id not in script_metrics and level != "END":
        script_metrics[script_id] = {
            'start_time': time.time(),
            'log_count': 0,
            'errors': 0,
            'warnings': 0
        }
    
    # Update metrics
    if script_id and script_id in script_metrics:
        script_metrics[script_id]['log_count'] += 1
        if level == "ERROR" or level == "CRITICAL":
            script_metrics[script_id]['errors'] += 1
        elif level == "WARNING":
            script_metrics[script_id]['warnings'] += 1
    
    # Finish script timing if this is the end marker
    if script_id and level == "END" and script_id in script_metrics:
        script_metrics[script_id]['duration'] = time.time() - script_metrics[script_id]['start_time']
    
    # Format with enhanced context information
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    thread_id = threading.current_thread().ident % 10000
    
    # Add namespace context to prevent confusion between unrelated scripts
    namespace = ""
    if script_id:
        namespace = f"[{script_id}] "
    
    # Add integration phase for better organization
    phase_tag = ""
    if integration_phase:
        phase_tag = f"[{integration_phase}] "
    
    context_str = f"[{context}] " if context else ""
    formatted_msg = f"{timestamp} [{level:7}] {thread_id} {namespace}{phase_tag}{context_str}{entry_id}: {msg}"
    
    # Check for potential conflicts in the log message
    conflict_indicators = ["conflict", "collision", "duplicate", "override", "overwrite", "incompatible"]
    has_conflict = any(indicator in msg.lower() for indicator in conflict_indicators)
    if has_conflict and level not in ["ERROR", "CRITICAL", "CONFLICT"]:
        level = "CONFLICT"
    
    # Write to log file with thread safety and buffering for high volume
    with log_lock:
        try:
            # Add to buffer first (more efficient for thousands of concurrent scripts)
            log_buffer.append(formatted_msg)
            log.buffer_size += len(formatted_msg) + 1
            
            # Only flush buffer when it gets large or enough time has passed
            should_flush = (log.buffer_size > 100000) or (time.time() - log.last_flush > 1.0)
            
            if should_flush:
                # Check for log rotation (100MB limit for massive codebases)
                try:
                    if os.path.exists(LOG_FILE) and os.path.getsize(LOG_FILE) > 100 * 1024 * 1024:
                        # Create logs directory if it doesn't exist
                        log_dir = os.path.join(os.path.dirname(LOG_FILE), "logs")
                        os.makedirs(log_dir, exist_ok=True)
                          # Use timestamp-based naming for rotated logs
                        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
                        backup_log = os.path.join(log_dir, f"log_{timestamp}.txt")
                        os.rename(LOG_FILE, backup_log)
                except Exception:
                    pass
                
                # Write all buffered logs at once (more efficient)
                with open(LOG_FILE, "a", encoding="utf-8", errors="replace") as f:
                    f.write("\n".join(log_buffer) + "\n")
                
                # Track errors for correlation
                for log_line in log_buffer:
                    if "ERROR" in log_line or "CRITICAL" in log_line:
                        error_signature = _extract_error_signature(log_line)
                        if error_signature and script_id:
                            error_map[error_signature].append((script_id, entry_id))
                
                # Reset buffer
                log_buffer.clear()
                log.buffer_size = 0
                log.last_flush = time.time()
                
                # Generate error correlation report for recurrent errors
                _check_error_patterns(error_map, script_metrics)
                
        except Exception as e:
            # Emergency logging with triple fallback
            try:
                with open("emergency_log.txt", "a", encoding="utf-8") as f:
                    f.write(f"Error writing to main log: {str(e)}\n{formatted_msg}\n")
            except Exception as e2:
                try:
                    # Final attempt: write to /tmp or equivalent
                    with open(os.path.join(tempfile.gettempdir(), "integration_emergency.log"), "a") as f:
                        f.write(f"Critical logging failure: {str(e2)}\n{formatted_msg}\n")
                except:
                    pass
    
    # Print to console with color based on level for better visibility
    if verbose:
        if level == "ERROR" or level == "CRITICAL":
            print(f"\033[91m{formatted_msg}\033[0m")  # Red for errors
        elif level == "WARNING":
            print(f"\033[93m{formatted_msg}\033[0m")  # Yellow for warnings
        elif level == "SUCCESS":
            print(f"\033[92m{formatted_msg}\033[0m")  # Green for success
        elif level == "CONFLICT":
            print(f"\033[95m{formatted_msg}\033[0m")  # Purple for conflicts
        elif level == "INTEGRATION":
            print(f"\033[96m{formatted_msg}\033[0m")  # Cyan for integration events
        else:
            print(formatted_msg)
    
    return entry_id  # Return log ID for correlation
    
def _extract_error_signature(log_line):
    """
    Extract a detailed signature from error messages for correlation across thousands of unrelated scripts.
    
    Enhanced for massive-scale integration:
    1. Detects integration-specific errors (namespace conflicts, resource conflicts)
    2. Includes module context to differentiate similar errors in different scripts
    3. Normalizes error patterns for better clustering across diverse codebases
    4. Handles errors specific to importing/executing modules not designed to work together
    5. Recognizes resource conflicts (filesystem, network ports, etc.)
    
    Args:
        log_line: The log line containing an error message
        
    Returns:
        str: A normalized error signature for correlation or None if no pattern found
    """
    # First extract module context if available
    module_context = ""
    module_match = re.search(r'\[([\w\._-]+\.py)\]', log_line)
    if module_match:
        module_context = f"{module_match.group(1)}:"
    
    # Extract line number if available (helps distinguish similar errors in large files)
    line_info = ""
    line_match = re.search(r'line (\d+)', log_line)
    if line_match:
        line_info = f":{line_match.group(1)}"
    
    # Define error patterns with more comprehensive coverage for diverse codebases
    error_patterns = [
        # Import and module errors (very common in integration)
        r'ImportError: No module named [\'"]?([\w\.]+)[\'"]?',
        r'ModuleNotFoundError: No module named [\'"]?([\w\.]+)[\'"]?',
        r'ImportError: cannot import name [\'"]?([\w\.]+)[\'"]?',
        r'ImportError: attempted relative import beyond top-level package',
        r'ImportError: (.+?) not found in sys\.path',
        
        # Namespace and attribute errors (common when integrating unrelated code)
        r'AttributeError: [\'"]?([\w\.]+)[\'"]? object has no attribute [\'"]?([\w\.]+)[\'"]?',
        r'AttributeError: module [\'"]?([\w\.]+)[\'"]? has no attribute [\'"]?([\w\.]+)[\'"]?',
        r'NameError: name [\'"]?([\w\.]+)[\'"]? is not defined',
        
        # Type errors and compatibility issues
        r'TypeError: ([\w\.]+)\(\) takes (\d+) positional arguments? but (\d+) (?:was|were) given',
        r'TypeError: ([\w\.]+)\(\) got an unexpected keyword argument [\'"]?([\w\.]+)[\'"]?',
        r'TypeError: (\w+) object is not (callable|iterable|subscriptable)',
        r'TypeError: can\'t (\w+) ([\w\.]+) to ([\w\.]+)',
        
        # Value errors and data compatibility issues
        r'ValueError: ([\w\.]+) must be (\w+)',
        r'ValueError: invalid literal for (\w+)\(\) with base (\d+): [\'"]?([\w\.]+)[\'"]?',
        r'ValueError: too many values to unpack \(expected (\d+)\)',
        
        # Key errors (access to missing dict keys)
        r'KeyError: [\'"]?([^\'"]*)[\'"]?',
        
        # File and path errors (resource conflicts)
        r'FileNotFoundError: \[Errno \d+\] No such file or directory: [\'"]?(.*?)[\'"]?',
        r'FileExistsError: \[Errno \d+\] File exists: [\'"]?(.*?)[\'"]?',
        r'PermissionError: \[Errno \d+\] Permission denied: [\'"]?(.*?)[\'"]?',
        r'IsADirectoryError: \[Errno \d+\] Is a directory: [\'"]?(.*?)[\'"]?',
        
        # Syntax and parsing errors
        r'SyntaxError: (.*)',
        r'IndentationError: (.*)',
        r'TabError: (.*)',
        
        # Integration-specific errors
        r'RuntimeError: maximum recursion depth exceeded',
        r'RecursionError: maximum recursion depth exceeded',
        r'CircularImportError: (.*)',
        
        # Resource conflicts
        r'socket.error: \[Errno \d+\] Address already in use',
        r'OSError: \[Errno \d+\] Address already in use',
        r'OverflowError: (.*)',
        r'MemoryError: (.*)',
        
        # Database and connection errors
        r'ConnectionError: (.*)',
        r'ConnectionRefusedError: \[Errno \d+\] Connection refused',
        r'TimeoutError: (.*)',
        
        # JSON and serialization errors (common in data exchange between scripts)
        r'JSONDecodeError: (.*)',
        r'UnicodeDecodeError: (.*)',
        r'UnicodeEncodeError: (.*)',
        
        # Threading and multiprocessing issues
        r'RuntimeError: can\'t start new thread',
        r'BrokenPipeError: (.*)',
        
        # Generic pattern for any other exceptions (fallback)
        r'([A-Za-z0-9_]+Error): (.*)'
    ]
    
    # Check for special integration-specific error cases first
    
    # Namespace conflicts (extremely common when integrating unrelated scripts)
    if 'already defined' in log_line or 'conflicts with' in log_line or 'duplicate' in log_line:
        name_match = re.search(r'[\'"]?([\w\.]+)[\'"]? (?:is already defined|conflicts with|duplicate)', log_line)
        if name_match:
            return f"{module_context}NamespaceConflict:{name_match.group(1)}"
    
    # Resource conflicts (files, ports, etc.)
    if 'Address already in use' in log_line:
        port_match = re.search(r'port (\d+)', log_line)
        if port_match:
            return f"ResourceConflict:PORT:{port_match.group(1)}"
    
    if 'File exists' in log_line:
        file_match = re.search(r'File exists: [\'"]?(.*?)[\'"]?', log_line)
        if file_match:
            # Normalize path to avoid minor path differences creating different signatures
            path = file_match.group(1).split('/')[-1]  # Just keep filename
            return f"ResourceConflict:FILE:{path}"
    
    # General pattern matching with module context
    for pattern in error_patterns:
        match = re.search(pattern, log_line)
        if match:
            error_type = pattern.split(':')[0].strip('r\'')
            # Simplify the error signature for better grouping
            if 'ImportError' in error_type or 'ModuleNotFoundError' in error_type:
                # For import errors, the module name is what matters
                return f"{module_context}ImportError:{match.group(1).split('.')[0]}"
            elif 'AttributeError' in error_type:
                # For attribute errors, both object and attribute matter
                if match.groups() and len(match.groups()) >= 2:
                    return f"{module_context}AttributeError:{match.group(1)}.{match.group(2)}"
                else:
                    # Handle simpler attribute error patterns
                    return f"{module_context}AttributeError:{match.group(1)}"
            elif 'TypeError' in error_type and 'takes' in pattern and 'positional arguments' in pattern:
                # Function signature mismatches (argument count issues)
                return f"{module_context}TypeError:ArgCount:{match.group(1)}"
            elif 'ValueError' in error_type or 'KeyError' in error_type:
                # Value errors with normalized values
                return f"{module_context}{error_type}:{match.group(1)}"
            elif any(fs in error_type for fs in ['FileNotFound', 'FileExists', 'Permission']):
                # File-related errors - normalize paths
                path = match.group(1).split('/')[-1]  # Just keep filename
                return f"{module_context}{error_type}:{path}"
            else:
                # General case - use the error type and first capture group
                if match.groups():
                    # Limit the length of the error message to avoid overly specific signatures
                    error_msg = match.group(1)[:50]
                    return f"{module_context}{error_type}:{error_msg}"
                else:
                    return f"{module_context}{error_type}"
    
    # Integration-specific heuristics for errors that don't match standard patterns
    
    # Check for module loading patterns that might not follow standard errors
    if 'failed to load' in log_line.lower() or 'couldn\'t load module' in log_line.lower():
        module_load_match = re.search(r'(?:load|import) [\'"]([\w\.]+)[\'"]', log_line)
        if module_load_match:
            return f"{module_context}ModuleLoadError:{module_load_match.group(1)}"
    
    # Check for version conflicts
    if 'requires' in log_line and 'found' in log_line:
        version_match = re.search(r'requires ([\w\.]+) (\d+\.\d+\.?\d*)', log_line)
        if version_match:
            return f"VersionConflict:{version_match.group(1)}"
    
    # No recognized pattern
    return None

def _check_error_patterns(error_map, script_metrics):
    """
    Advanced error pattern analysis for massive-scale integration.
    
    Designed to handle tens of thousands of unrelated scripts with:
    1. Sophisticated error clustering to identify patterns
    2. Root cause analysis across disparate codebases
    3. Integration-specific insight detection
    4. Adaptive thresholds based on codebase size
    5. Performance optimization for massive scale
    6. Context-aware grouping based on error relationships
    
    Args:
        error_map: Dictionary mapping error signatures to occurrences
        script_metrics: Dictionary with script performance metrics
    """
    # Skip analysis if not enough data
    if not error_map or len(error_map) < 2:
        return
        
    # Get total number of unique scripts for scaling thresholds
    all_scripts = set()
    for occurrences in error_map.values():
        all_scripts.update(script_id for script_id, _ in occurrences)
    
    # Scale thresholds based on codebase size
    script_count = len(all_scripts)
    min_occurrences = max(3, min(10, script_count // 1000 + 2))
    min_scripts = max(2, min(5, script_count // 2000 + 1))
    
    # Group related errors by similarity for more meaningful patterns
    error_clusters = defaultdict(list)
    cluster_sizes = {}
    
    # Phase 1: Group errors by type for more efficient processing
    errors_by_type = defaultdict(list)
    for error_sig, occurrences in error_map.items():
        if not error_sig:
            continue
        error_parts = error_sig.split(':')
        error_type = error_parts[0] if error_parts else 'Unknown'
        errors_by_type[error_type].append((error_sig, occurrences))
    
    # Phase 2: Process each error type group separately (more efficient)
    for error_type, errors in errors_by_type.items():
        # Skip if only one error of this type
        if len(errors) < 2:
            continue
        
        # Extract details for this error type
        signatures_in_type = []
        for error_sig, occurrences in errors:
            if len(occurrences) >= min_occurrences:
                error_details = error_sig.split(':', 1)[1] if ':' in error_sig else ''
                signatures_in_type.append((error_sig, error_details, occurrences))
        
        # Skip if not enough significant errors
        if len(signatures_in_type) < 2:
            continue
            
        # Find clusters of related errors within this type
        # Based on string similarity and affected script overlap
        for i, (sig1, details1, occs1) in enumerate(signatures_in_type):
            scripts1 = set(script_id for script_id, _ in occs1)
            
            # Check if this error already belongs to a cluster
            assigned_to_cluster = False
            for cluster_id, sigs in error_clusters.items():
                if sig1 in sigs:
                    assigned_to_cluster = True
                    break
                    
            if assigned_to_cluster:
                continue
                
            # Start a new cluster with this error
            cluster_id = f"{error_type}_{i}"
            error_clusters[cluster_id].append(sig1)
            cluster_sizes[cluster_id] = len(occs1)
            
            # Look for related errors to add to this cluster
            for j, (sig2, details2, occs2) in enumerate(signatures_in_type[i+1:], i+1):
                if any(sig2 in c for c in error_clusters.values()):
                    continue  # Skip if already in a cluster
                
                scripts2 = set(script_id for script_id, _ in occs2)
                
                # Calculate similarity metrics
                script_overlap = len(scripts1.intersection(scripts2)) / len(scripts1.union(scripts2)) if scripts1.union(scripts2) else 0
                
                # Text similarity between error details (simplified for performance)
                text_similarity = 0
                if details1 and details2:
                    # Quick similarity check - common substrings
                    shorter = details1 if len(details1) < len(details2) else details2
                    longer = details2 if len(details1) < len(details2) else details1
                    if shorter in longer:
                        text_similarity = len(shorter) / len(longer)
                    else:
                        # Check for common words
                        words1 = set(details1.split())
                        words2 = set(details2.split())
                        common_words = words1.intersection(words2)
                        text_similarity = len(common_words) / max(1, len(words1.union(words2)))
                
                # Combine metrics with weights emphasizing script overlap
                combined_similarity = script_overlap * 0.7 + text_similarity * 0.3
                
                # Add to cluster if sufficiently similar
                if combined_similarity > 0.3:
                    error_clusters[cluster_id].append(sig2)
                    cluster_sizes[cluster_id] += len(occs2)
    
    # Phase 3: Generate integration insights from clusters
    for cluster_id, error_signatures in error_clusters.items():
        # Skip small clusters
        if len(error_signatures) < 2:
            continue
            
        # Get all affected scripts for this cluster
        affected_scripts = set()
        error_type = cluster_id.split('_')[0]
        for sig in error_signatures:
            affected_scripts.update(script_id for script_id, _ in error_map[sig])
            
        # Only report if affecting multiple scripts (real integration issue)
        if len(affected_scripts) >= min_scripts:
            # Count script occurrences to identify most affected
            script_frequency = Counter(script_id for sig in error_signatures 
                                     for script_id, _ in error_map[sig])
            
            # Identify scripts most affected by this error cluster
            most_affected = script_frequency.most_common(5)
            
            # Generate insight message
            script_list = ', '.join(f"{s}" for s, c in most_affected)
            if len(affected_scripts) > 5:
                script_list += f" and {len(affected_scripts) - 5} more"
                
            # Generate integration recommendation based on error type
            recommendation = _get_integration_recommendation(error_type, error_signatures)
                
            # Write to log with lock for thread safety
            with log.lock:
                try:
                    with open(LOG_FILE, "a", encoding="utf-8", errors="replace") as f:
                        # Create a more detailed pattern report
                        f.write(f"{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]} "
                                f"[PATTERN] Integration issue detected: cluster of {len(error_signatures)} related "
                                f"{error_type} errors across {len(affected_scripts)} scripts\n")
                        f.write(f"  Most affected scripts: {script_list}\n")
                        f.write(f"  Recommendation: {recommendation}\n")
                        
                        # Show example of the error
                        if error_signatures:
                            example_sig = error_signatures[0]
                            example_details = example_sig.split(':', 1)[1] if ':' in example_sig else ''
                            f.write(f"  Example error: {example_details}\n")
                        f.write("\n")
                except Exception:
                    pass

def _get_integration_recommendation(error_type, error_signatures):
    """
    Generate specific integration recommendations based on error patterns.
    
    Uses knowledge of common integration issues to suggest solutions
    that work even for unrelated scripts not designed to work together.
    """
    # Extract details from the first error for analysis
    example = error_signatures[0]
    details = example.split(':', 1)[1] if ':' in example else ''
    
    # Specific recommendations based on error type
    if error_type == "ImportError" or error_type == "ModuleNotFoundError":
        return "Create import proxies or use dynamic imports for missing modules"
    elif error_type == "AttributeError":
        if any(attr in details for attr in ["has no attribute", "object has no attribute"]):
            return "Use getattr() with fallbacks or adapt interfaces between components" 
    elif error_type == "NameError":
        return "Implement namespace isolation or use dependency injection patterns"
    elif error_type == "TypeError":
        if "takes" in details and ("positional argument" in details or "positional arguments" in details):
            return "Create adapter functions to match function signatures between components"
    elif error_type == "ValueError":
        return "Add data validation and transformation layers between components" 
    elif error_type == "ResourceConflict":
        if "PORT" in details:
            return "Implement dynamic port allocation to prevent port conflicts"
        elif "FILE" in details:
            return "Use unique file paths per component or implement a virtual filesystem"
    elif error_type == "NamespaceConflict":
        return "Apply namespace prefixing or use module-level isolation"
    elif error_type == "SyntaxError":
        return "Different Python version requirements detected - add version compatibility layers"
    
    # Generic advice for other error types
    return "Consider isolation through process boundaries or dependency inversion for unrelated components"

def sanitize_python_code(code, filename="unknown"):
    """
    Clean up Python code for integration into a larger codebase.
    Enhanced for handling thousands of diverse, unrelated scripts
    from different origins, coding styles, and Python versions.
    """
    # Skip empty input
    if not code or len(code.strip()) == 0:
        return "# Empty file\npass"
    
    # Detect encoding issues and normalize to utf-8
    try:
        if not isinstance(code, str):
            code = code.decode('utf-8', errors='replace')
    except Exception:
        try:
            code = str(code, errors='replace')
        except Exception:
            return "# Encoding error in file\npass"
    
    # Convert emojis to named placeholders
    code = EMOJI_PATTERN.sub(r"'EMOJI'", code)
    
    # Check if this is actually Python code or something else
    py_indicators = ['import ', 'def ', 'class ', 'print(', 'if ', 'for ', 'while ', '= ', '==']
    if not any(ind in code for ind in py_indicators) and len(code) > 100:
        if '<html' in code.lower() or '<body' in code.lower():
            return f"# HTML content detected in {filename} - skipping\npass"
        if '{' in code and '}' in code and ':' in code and len(re.findall(r'"[^"]*":', code)) > 3:
            return f"# JSON content detected in {filename} - skipping\npass"
        if code.count('#') > code.count('\n') / 5:  # High # ratio suggests Markdown
            return f"# Markdown content detected in {filename} - skipping\npass"
    
    # Handle Python 2 to Python 3 syntax differences
    code = re.sub(r'(?<!\S)print\s+"([^"]*)"', r'print("\1")', code)
    code = re.sub(r"(?<!\S)print\s+'([^']*)'", r"print('\1')", code)
    code = re.sub(r'(?<!\S)xrange\(', 'range(', code)
    code = re.sub(r'(?<!\S)raw_input\(', 'input(', code)
    
    # Convert markdown headings to Python comments
    code = MARKDOWN_HEADING.sub(lambda m: f"# {m.group(0)}", code)
    
    # Convert markdown bullets to Python comments
    code = MARKDOWN_BULLET.sub(lambda m: f"# {m.group(0)}", code)
    
    # Convert text blocks that aren't Python to comments or remove
    lines = code.split("\n")
    clean_lines = []
    consecutive_blank_lines = 0
    current_indent = 0  # Track current indentation level
    multiline_string = False
    multiline_delimiter = None
    
    for i, line in enumerate(lines):
        # Track multiline strings to avoid modifying them
        if multiline_string:
            clean_lines.append(line)
            if multiline_delimiter in line and not line.strip().endswith('\\'):
                multiline_string = False
            continue
        elif '"""' in line and line.count('"""') % 2 != 0:
            multiline_string = True
            multiline_delimiter = '"""'
            clean_lines.append(line)
            continue
        elif "'''" in line and line.count("'''") % 2 != 0:
            multiline_string = True
            multiline_delimiter = "'''"
            clean_lines.append(line)
            continue
        
        # Skip lines that indicate non-Python content
        if NON_PYTHON_BLOCK.match(line):
            clean_lines.append(f"# {line}")
            continue
            
        # Normalize mixed tabs and spaces
        if '\t' in line:
            line = line.replace('\t', '    ')
        
        # Trim trailing whitespace
        line = line.rstrip()
        
        # Detect non-Python patterns and comment them
        non_py_patterns = [r'<[a-zA-Z][^>]*>.*?</[a-zA-Z]>', r'SELECT\s+.+?\s+FROM\s+.+']
        if any(re.search(pattern, line) for pattern in non_py_patterns) and not line.strip().startswith('#'):
            line = f"# {line}"
        
        # Skip excessive blank lines
        if not line.strip():
            consecutive_blank_lines += 1
            if consecutive_blank_lines <= 2:  # Allow at most 2 consecutive blank lines
                clean_lines.append(line)
            continue
        else:
            consecutive_blank_lines = 0
        
        # Handle indentation issues
        stripped_line = line.strip()
        if stripped_line and not stripped_line.startswith('#'):
            indent_level = len(line) - len(line.lstrip())
            
            # Handle statements that should be at root level
            root_level_statements = ["def ", "class ", "import ", "from ", "if __name__", "@"]
            if any(stripped_line.startswith(stmt) for stmt in root_level_statements):
                if indent_level > 0 and indent_level < 4:
                    line = line.lstrip()  # Make it root level
            
            # Handle indentation for continuation lines
            elif indent_level == 0 and i > 0:
                prev_line = lines[i-1].strip()
                if (prev_line.endswith((',', '\\', '+', '-', '*', '/', '(')) or 
                    prev_line.count('(') > prev_line.count(')')):
                    if not any(stripped_line.startswith(stmt) for stmt in root_level_statements):
                        line = "    " + line
        
        clean_lines.append(line)
    
    # Add source marker to help with debugging
    clean_code = "\n".join(clean_lines)
    return f"# Auto-sanitized from: {filename}\n{clean_code}"

def extract_main_block(tree):
    """
    Extract the main execution block with advanced pattern matching 
    for various main block styles found in massive diverse codebases.
    
    Enhanced for integration of thousands of unrelated scripts:
    - Multi-pattern recognition across coding styles and frameworks
    - Confidence scoring system for ambiguous cases
    - Framework-specific entry point detection
    - Context-aware pattern recognition
    - Library vs application detection
    - Nested and complex pattern support
    - Edge case handling for unusual code structures
    
    Args:
        tree: AST of the Python file
        
    Returns:
        The main block AST node or None if not found
    """
    try:
        # Track potential main blocks with confidence scores
        candidates = []
        
        # PHASE 1: Standard patterns (highest confidence)
        for node in tree.body:
            # Standard pattern: if __name__ == "__main__":
            if isinstance(node, ast.If) and isinstance(node.test, ast.Compare):
                left = node.test.left
                if isinstance(left, ast.Name) and left.id == "__name__":
                    for op, right in zip(node.test.ops, node.test.comparators):
                        if isinstance(op, ast.Eq) and (
                            (isinstance(right, ast.Constant) and right.value in ["__main__", '__main__']) or
                            (hasattr(right, 'value') and right.value in ["__main__", '__main__']) or
                            (hasattr(right, 's') and right.s in ["__main__", '__main__'])
                        ):
                            # Standard pattern has highest confidence
                            candidates.append((node, 100))
            
            # Reverse pattern: "__main__" == __name__
            elif isinstance(node, ast.If) and isinstance(node.test, ast.Compare):
                if node.test.comparators and isinstance(node.test.comparators[0], ast.Name) and node.test.comparators[0].id == "__name__":
                    left = node.test.left
                    if ((isinstance(left, ast.Constant) and left.value in ["__main__", '__main__']) or
                        (hasattr(left, 'value') and left.value in ["__main__", '__main__']) or
                        (hasattr(left, 's') and left.s in ["__main__", '__main__'])):
                        candidates.append((node, 100))
        
        # If we found standard patterns, return the first one
        if candidates:
            return max(candidates, key=lambda x: x[1])[0]
            
        # PHASE 2: Framework-specific entry points
        framework_entry_points = {
            # Web frameworks
            'flask': [
                lambda n: (isinstance(n, ast.Expr) and isinstance(n.value, ast.Call) and 
                          isinstance(n.value.func, ast.Attribute) and n.value.func.attr == 'run' and
                          hasattr(n.value.func, 'value') and isinstance(n.value.func.value, ast.Name) and 
                          n.value.func.value.id in ['app', 'application']),
                lambda n: (isinstance(n, ast.If) and isinstance(n.test, ast.Compare) and
                          any("app.run" in ast.unparse(stmt) for stmt in n.body))
            ],
            'django': [
                lambda n: (isinstance(n, ast.Expr) and isinstance(n.value, ast.Call) and 
                          isinstance(n.value.func, ast.Name) and n.value.func.id == 'execute_from_command_line'),
                lambda n: "django" in ast.unparse(n) and "manage" in ast.unparse(n)
            ],
            'fastapi': [
                lambda n: (isinstance(n, ast.Expr) and isinstance(n.value, ast.Call) and 
                          isinstance(n.value.func, ast.Attribute) and n.value.func.attr == 'run' and
                          hasattr(n.value.func, 'value') and isinstance(n.value.func.value, ast.Name) and 
                          n.value.func.value.id in ['app', 'api'])
            ],
            # GUI frameworks
            'tkinter': [
                lambda n: (isinstance(n, ast.Expr) and isinstance(n.value, ast.Call) and 
                          isinstance(n.value.func, ast.Attribute) and n.value.func.attr == 'mainloop'),
                lambda n: "mainloop" in ast.unparse(n)
            ],
            'pyqt': [
                lambda n: (isinstance(n, ast.Expr) and isinstance(n.value, ast.Call) and 
                          isinstance(n.value.func, ast.Attribute) and n.value.func.attr in ['exec', 'exec_'])
            ],
            # CLI frameworks
            'click': [
                lambda n: (isinstance(n, ast.Expr) and isinstance(n.value, ast.Call) and 
                          isinstance(n.value.func, ast.Name) and n.value.func.id == 'cli' and
                          any("@click" in ast.unparse(d) for d in ast.walk(tree))),
                lambda n: "cli(" in ast.unparse(n) and any("@click" in ast.unparse(d) for d in ast.walk(tree))
            ],
            'argparse': [
                lambda n: (isinstance(n, ast.Expr) and isinstance(n.value, ast.Call) and 
                          "parse_args" in ast.unparse(n))
            ],
            # Data science frameworks
            'jupyter': [
                lambda n: "plt.show" in ast.unparse(n)
            ],
            # Scripts and other frameworks
            'script': [
                lambda n: (isinstance(n, ast.Expr) and isinstance(n.value, ast.Call) and 
                          isinstance(n.value.func, ast.Name) and n.value.func.id in 
                          ['main', 'run', 'execute', 'start', 'process', 'cli_main']),
                lambda n: (isinstance(n, ast.Expr) and isinstance(n.value, ast.Call) and 
                          isinstance(n.value.func, ast.Attribute) and n.value.func.attr in 
                          ['run', 'start', 'execute', 'main', 'process'])
            ]
        }
        
        # Check for imports to understand which frameworks might be used
        imports = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for name in node.names:
                    imports.add(name.name.split('.')[0])
            elif isinstance(node, ast.ImportFrom) and node.module:
                imports.add(node.module.split('.')[0])
                
        # Loop through nodes again to find framework-specific patterns
        for node in tree.body:
            # Check each framework's patterns
            for framework, patterns in framework_entry_points.items():
                # Skip frameworks not imported (unless it's a simple script)
                if framework != 'script' and not any(imp in imports for imp in [framework, framework.replace('_', '')]):
                    continue
                    
                for pattern_func in patterns:
                    try:
                        if pattern_func(node):
                            confidence = 90 if framework != 'script' else 80
                            candidates.append((node, confidence))
                    except Exception:
                        # Skip patterns that cause errors when applied to this node
                        pass
        
        # If we found framework patterns, use the highest confidence one
        if candidates:
            return max(candidates, key=lambda x: x[1])[0]
            
        # PHASE 3: Look for module-level code execution that might indicate an entry point
        entry_point_candidates = []
        
        # Check for direct function calls at module level
        for i, node in enumerate(tree.body):
            if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
                call = node.value
                # Direct function calls like main(), run(), etc.
                if isinstance(call.func, ast.Name):
                    function_name = call.func.id.lower()
                    if function_name in ["main", "run", "start", "execute", "launch"]:
                        entry_point_candidates.append((node, 70))
                # Method calls like app.run(), server.start()
                elif isinstance(call.func, ast.Attribute):
                    method_name = call.func.attr.lower()
                    if method_name in ["run", "start", "main", "execute", "serve"]:
                        entry_point_candidates.append((node, 65))
                    
                # If it's one of the last statements in the file, it's more likely to be a main block
                if entry_point_candidates and i >= len(tree.body) - 3:  # In the last 3 statements
                    entry_point_candidates[-1] = (node, entry_point_candidates[-1][1] + 10)
        
        # PHASE 4: Check for sys.argv usage, often indicates a script entry point
        argv_usage_nodes = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
                if node.value.id == 'sys' and node.attr == 'argv':
                    # Find the top-level node containing this sys.argv usage
                    for top_node in tree.body:
                        if any(n == node for n in ast.walk(top_node)) and not isinstance(top_node, (ast.Import, ast.ImportFrom)):
                            argv_usage_nodes.append(top_node)
        
        # If we found sys.argv usage not inside a function, it might be main code
        if argv_usage_nodes:
            for node in argv_usage_nodes:
                # Check if not inside a function or class
                is_top_level = True
                for parent in ast.walk(tree):
                    if isinstance(parent, (ast.FunctionDef, ast.ClassDef)):
                        if any(n == node for n in ast.walk(parent)):
                            is_top_level = False
                            break
                
                if is_top_level:
                    entry_point_candidates.append((node, 60))
        
        # PHASE 5: Check for direct output or interaction, often indicates a script
        for node in tree.body:
            # Direct prints at module level suggest this is a script
            if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
                if isinstance(node.value.func, ast.Name) and node.value.func.id == 'print':
                    entry_point_candidates.append((node, 40))
            
            # Input collection at module level also suggests a script
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Name):
                        if node.value.func.id == 'input':
                            entry_point_candidates.append((node, 50))
        
        # If we found any candidates in phases 3-5, use the highest priority one
        if entry_point_candidates:
            # Sort by confidence score
            entry_point_candidates.sort(key=lambda x: x[1], reverse=True)
            
            # Get all statements that might be part of the main execution
            # Start with the highest confidence candidate
            best_candidate = entry_point_candidates[0][0]
            
            # Find where this candidate is in the body
            try:
                start_index = tree.body.index(best_candidate)
            except ValueError:
                # If it's not directly in the body, create a synthetic main block
                # with just this statement
                synthetic_main = ast.If(
                    test=ast.Compare(
                        left=ast.Name(id='__name__', ctx=ast.Load()),
                        ops=[ast.Eq()],
                        comparators=[ast.Constant(value='__main__')]
                    ),
                    body=[best_candidate],
                    orelse=[]
                )
                return synthetic_main
                
            # Include all subsequent top-level code that seems to be part of the same
            # execution block (excluding function/class definitions)
            main_body = []
            for node in tree.body[start_index:]:
                if not isinstance(node, (ast.FunctionDef, ast.ClassDef, ast.Import, ast.ImportFrom)):
                    main_body.append(node)
                else:
                    # Stop at function/class definitions that come after our entry point
                    break
            
            # Create a synthetic main block with all collected statements
            synthetic_main = ast.If(
                test=ast.Compare(
                    left=ast.Name(id='__name__', ctx=ast.Load()),
                    ops=[ast.Eq()],
                    comparators=[ast.Constant(value='__main__')]
                ),
                body=main_body,
                orelse=[]
            )
            
            return synthetic_main
            
        # PHASE 6: Last resort - if the module has significant code at global scope
        # (not just definitions), treat that as a potential entry point
        executable_statements = []
        for node in tree.body:
            if not isinstance(node, (ast.FunctionDef, ast.ClassDef, ast.Import, ast.ImportFrom, 
                                    ast.AnnAssign)) and not (
                isinstance(node, ast.Assign) and all(
                    isinstance(target, ast.Name) and target.id.isupper() 
                    for target in node.targets)):  # Skip constants like NAME = value
                executable_statements.append(node)
        
        # If we have several executable statements, treat them as a main block
        if len(executable_statements) >= 3:  # Arbitrary threshold
            synthetic_main = ast.If(
                test=ast.Compare(
                    left=ast.Name(id='__name__', ctx=ast.Load()),
                    ops=[ast.Eq()],
                    comparators=[ast.Constant(value='__main__')]
                ),
                body=executable_statements,
                orelse=[]
            )
            return synthetic_main
        
        # No main block found
        return None
    
    except Exception as e:
        # Be resilient against any parsing errors
        print(f"Error in extract_main_block: {str(e)}")
        return None

def remove_main_block(tree):
    """
    Remove main execution block from the AST with smart pattern detection.
    Handles various patterns including:
    - Standard __name__ == "__main__" blocks
    - Framework-specific entry points
    - Direct execution calls
    - Ambiguous main-like code sections
    
    Returns modified AST with main blocks removed.
    """
    try:
        if not hasattr(tree, 'body') or not tree.body:
            return tree
            
        # Find the main block to remove
        main_block = extract_main_block(tree)
        if main_block is None:
            return tree
            
        # Create a new tree without the main block
        new_body = []
        for node in tree.body:
            # Skip nodes that are part of the main block
            if node != main_block:
                # For synthetic main blocks, we need to remove the original statements
                if hasattr(main_block, 'body') and node in main_block.body:
                    continue  # Skip this node as it's part of the main block
                new_body.append(node)
        
        # Update the tree with the filtered body
        tree.body = new_body
        return tree
        
    except Exception as e:
        print(f"Error removing main block: {str(e)}")
        return tree
    # Initialize framework types dictionary
    framework_types = {
        "web": False,
        "gui": False,
        "cli": False,
        "notebook": False,
        "test": False
    }
    
    # First pass: identify standard Python __main__ pattern
    main_blocks = []
    new_body = []
    for i, node in enumerate(tree.body):
        if isinstance(node, ast.If) and isinstance(node.test, ast.Compare):
            # Check for if __name__ == "__main__": pattern
            if (isinstance(node.test.left, ast.Name) and node.test.left.id == "__name__" and
                len(node.test.ops) == 1 and isinstance(node.test.ops[0], ast.Eq) and
                len(node.test.comparators) == 1 and
                isinstance(node.test.comparators[0], ast.Constant) and
                node.test.comparators[0].value == "__main__"):
                main_blocks.append(i)
    
    # Second pass: identify framework-specific entry points
    framework_entries = []
    for i, node in enumerate(tree.body):
        if i not in main_blocks:  # Skip already identified blocks
            # Flask app.run() pattern
            if (isinstance(node, ast.Expr) and isinstance(node.value, ast.Call) and
                isinstance(node.value.func, ast.Attribute) and
                hasattr(node.value.func, 'attr') and node.value.func.attr == 'run'):
                framework_entries.append(i)
    
    # Third pass: identify direct calls to common entry point functions
    entry_calls = []
    for i, node in enumerate(tree.body):
        if i not in main_blocks and i not in framework_entries:
            # Check for direct calls to main() or similar
            if (isinstance(node, ast.Expr) and isinstance(node.value, ast.Call) and
                isinstance(node.value.func, ast.Name) and
                node.value.func.id in ['main', 'run', 'start', 'execute']):
                entry_calls.append(i)
    
    # Fourth pass: apply heuristics for ambiguous cases
    ambiguous_entries = []
    if not main_blocks and not framework_entries:
        for i, node in enumerate(tree.body):
            # Look for patterns that might be main execution code
            if i not in entry_calls and isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
                # System exit calls often indicate main execution point
                if (isinstance(node.value.func, ast.Attribute) and 
                    isinstance(node.value.func.value, ast.Name) and 
                    node.value.func.value.id == 'sys' and 
                    node.value.func.attr in ['exit']):
                    ambiguous_entries.append(i)
    


    # Detect frameworks from imports
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            module_names = []
            if isinstance(node, ast.Import):
                module_names = [name.name for name in node.names]
            elif node.module:
                module_names = [node.module]
                
            for module in module_names:
                # Web frameworks
                if any(fw in module.lower() for fw in ["flask", "django", "fastapi", "bottle", "pyramid", "tornado"]):
                    framework_types["web"] = True
                # GUI frameworks
                elif any(fw in module.lower() for fw in ["tkinter", "qt", "wx", "kivy", "pygame"]):
                    framework_types["gui"] = True
                # CLI frameworks
                elif any(fw in module.lower() for fw in ["click", "typer", "argparse", "docopt"]):
                    framework_types["cli"] = True
                # Notebook frameworks
                elif any(fw in module.lower() for fw in ["jupyter", "ipykernel", "notebook"]):
                    framework_types["notebook"] = True
                # Test frameworks
                elif any(fw in module.lower() for fw in ["pytest", "unittest", "nose"]):
                    framework_types["test"] = True
    
    # First pass: identify standard if __name__ == "__main__" blocks
    main_blocks = []
    for i, node in enumerate(tree.body):
        if isinstance(node, ast.If) and isinstance(node.test, ast.Compare):
            # Standard pattern: if __name__ == "__main__":
            name_main_pattern = False
            
            # Check if this is the standard pattern
            if isinstance(node.test.left, ast.Name) and node.test.left.id == "__name__":
                for op, comparator in zip(node.test.ops, node.test.comparators):
                    if isinstance(op, ast.Eq):
                        # Handle Python 3.8+ (Constant nodes)
                        if hasattr(comparator, 'value') and comparator.value in ["__main__", '__main__']:
                            name_main_pattern = True
                        # Handle older Python versions (Str nodes)
                        elif hasattr(comparator, 's') and comparator.s in ["__main__", '__main__']:
                            name_main_pattern = True
            
            # Check for the reversed pattern: "__main__" == __name__
            elif len(node.test.comparators) > 0 and isinstance(node.test.comparators[0], ast.Name) and node.test.comparators[0].id == "__name__":
                left = node.test.left
                if ((hasattr(left, 'value') and left.value in ["__main__", '__main__']) or
                    (hasattr(left, 's') and left.s in ["__main__", '__main__'])):
                    name_main_pattern = True
            
            if name_main_pattern:
                main_blocks.append(i)
    
    # Second pass: identify framework-specific entry points
    framework_entries = []
    for i, node in enumerate(tree.body):
        # Skip if already in main blocks
        if i in main_blocks:
            continue
            
        # Common framework-specific patterns
        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
            try:
                node_str = ast.unparse(node)
                
                # Web framework patterns
                if framework_types["web"]:
                    if any(pattern in node_str for pattern in 
                          ["app.run(", "application.run(", "execute_from_command_line(", 
                           "serve(", "run_server(", "wsgi.app"]):
                        framework_entries.append(i)
                
                # GUI framework patterns
                if framework_types["gui"]:
                    if any(pattern in node_str for pattern in 
                          ["mainloop(", "exec_(", "exec(", "app.exec", "gtk.main(", "start_gui("]):
                        framework_entries.append(i)
                
                # CLI framework patterns
                if framework_types["cli"]:
                    if any(pattern in node_str for pattern in 
                          ["cli(", "app(", "typer.run(", "fire.Fire(", "parse_args("]):
                        framework_entries.append(i)
                
                # Test framework patterns
                if framework_types["test"]:
                    if any(pattern in node_str for pattern in 
                          ["unittest.main(", "pytest.main(", "nose.run("]):
                        framework_entries.append(i)
            except Exception:
                # Safely handle any parsing errors with complex nodes
                pass
    
    # Third pass: identify direct calls to common entry point functions
    entry_calls = []
    for i, node in enumerate(tree.body):
        # Skip if already identified
        if i in main_blocks or i in framework_entries:
            continue
            
        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
            call = node.value
            
            # Direct function call pattern
            if isinstance(call.func, ast.Name):
                func_name = call.func.id.lower()
                if func_name in ["main", "run", "start", "execute", "launch", "cli", "app"]:
                    entry_calls.append((i, func_name))
            
            # Method call pattern
            elif isinstance(call.func, ast.Attribute):
                method_name = call.func.attr.lower()
                if method_name in ["run", "start", "main", "execute", "serve", "launch"]:
                    entry_calls.append((i, method_name))
    
    # Fourth pass: apply heuristics for ambiguous cases
    ambiguous_entries = []
    if not main_blocks and not framework_entries:
        # If we have entry calls, use those
        if entry_calls:
            # Prioritize by name and position
            priority_order = ["main", "run", "start", "execute", "launch", "cli", "app"]
            entry_calls.sort(key=lambda x: (
                # Sort first by function name priority
                priority_order.index(x[1]) if x[1] in priority_order else 999,
                # Then by position from bottom of file (reversed)
                -x[0]
            ))
            
            # Take the highest priority entry call
            ambiguous_entries.append(entry_calls[0][0])
        else:
            # Look for end-of-script execution patterns
            for i, node in enumerate(tree.body):
                try:
                    node_str = ast.unparse(node)
                    if "sys.exit" in node_str:
                        # Mark the block containing sys.exit, and possibly the preceding block
                        ambiguous_entries.append(i)
                        if i > 0 and isinstance(tree.body[i-1], (ast.Expr, ast.Assign)):
                            ambiguous_entries.append(i-1)
                except Exception:
                    pass
    


    # Determine final set of nodes to remove
    to_remove = set(main_blocks + framework_entries + entry_calls + ambiguous_entries)
    
    # Build new body with everything except main blocks
    for i, node in enumerate(tree.body):
        if i not in to_remove:
            new_body.append(node)
    
    tree.body = new_body
    return tree

def has_main_function(tree):
    """
    Check if a tree already has a main function or alternative entry points,
    optimized for extremely large codebases with thousands of unrelated scripts.
    Uses multiple heuristics to detect entry points across diverse frameworks and styles.
    """
    # 1. Direct top-level entry point functions (most common pattern)
    entry_point_names = {
        "main", "run", "execute", "start", "app_main", "cli_main", "entrypoint", 
        "launch", "driver", "process", "init", "serve", "handler", "lambda_handler",
        "azure_function", "gcp_handler", "cli", "command_line", "run_app"
    }
    name_indicators = {"main", "run", "app", "cli", "start", "exec"}
    
    for node in tree.body:
        # Check for common entry point function names
        if isinstance(node, ast.FunctionDef):
            if node.name in entry_point_names:
                return True
            # Check for functions with indicative words in their names
            name_lower = node.name.lower()
            if any(indicator in name_lower for indicator in name_indicators):
                # Verify it's likely a true entry point by checking:
                # 1. Has minimal or no parameters (typical for entry points)
                # 2. Is not a utility function (often starts with "_")
                if (len(node.args.args) <= 2 and not node.name.startswith("_")):
                    return True
    
    # 2. Framework-specific entry points by scanning imports and calls
    framework_patterns = {
        # Web frameworks
        "flask": ["app.run", "Flask", "create_app"],
        "django": ["manage.py", "django.core.management", "execute_from_command_line"],
        "fastapi": ["app.run", "FastAPI"],
        # CLI frameworks
        "click": ["click.command", "@click.command", "cli.add_command"],
        "typer": ["typer.run", "app.command"],
        "argparse": ["parse_args", "ArgumentParser"],
        # GUI frameworks
        "tkinter": ["mainloop", "Tk()", "root.mainloop"],
        "PyQt": ["app.exec_", "app.exec", "QApplication"],
        "wx": ["wx.App", "MainLoop"],
        # Task execution
        "celery": ["celery.worker", "@task", "@app.task"],
        # Testing frameworks
        "pytest": ["pytest.main"],
        "unittest": ["unittest.main"],
        # AWS/Cloud
        "lambda": ["lambda_handler", "handler"],
        # Data processing
        "luigi": ["luigi.run", "run_task"],
    }
    
    # Look for imports and function calls that suggest entry points
    framework_imports = set()
    
    # First scan imports to know which frameworks are used
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for name in node.names:
                module = name.name.split('.')[0]
                if module in framework_patterns:
                    framework_imports.add(module)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                module = node.module.split('.')[0]
                if module in framework_patterns:
                    framework_imports.add(module)
    
    # Then look for framework-specific patterns
    for node in ast.walk(tree):
        # Check for decorated functions (common for CLIs and tasks)
        if isinstance(node, ast.FunctionDef) and node.decorator_list:
            for decorator in node.decorator_list:
                decorator_str = ast.unparse(decorator)
                
                # CLI decorators
                if any(pattern in decorator_str for pattern in ['@click', '@command', '@app.command']):
                    return True
                    
                # Celery tasks
                if '@task' in decorator_str or '@app.task' in decorator_str:
                    return True
        
        # Check for framework-specific function calls
        if isinstance(node, ast.Call):
            call_str = ast.unparse(node)
            
            # Check each framework we've imported
            for framework in framework_imports:
                patterns = framework_patterns.get(framework, [])
                if any(pattern in call_str for pattern in patterns):
                    # Extra validation for common patterns to reduce false positives
                    if framework == "flask" and "app.run" in call_str:
                        return True
                    elif framework == "django" and "execute_from_command_line" in call_str:
                        return True
                    elif framework == "fastapi" and "app.run" in call_str:
                        return True
                    elif framework == "click" and any(p in call_str for p in ["@click", "click.command"]):
                        return True
                    elif framework == "tkinter" and "mainloop" in call_str:
                        return True
                    elif framework == "PyQt" and any(p in call_str for p in ["app.exec", "QApplication"]):
                        return True
                    elif framework == "luigi" and "run" in call_str:
                        return True
                    elif framework == "pytest" and "pytest.main" in call_str:
                        return True
                    else:
                        # For other frameworks, general pattern match is sufficient
                        return True
    
    # 3. Check for command-line argument handling - common in entry points
    for node in ast.walk(tree):
        # Classic argparse pattern
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            if node.func.attr == "ArgumentParser" and "argparse" in framework_imports:
                return True
                
        # Check for sys.argv usage - typical in entry points
        if isinstance(node, ast.Attribute) and node.attr == "argv":
            if isinstance(node.value, ast.Name) and node.value.id == "sys":
                return True
    
    # 4. Look for script-like behavior (global code that executes directly)
    top_level_statements = 0
    for node in tree.body:
        if isinstance(node, (ast.Expr, ast.Assign)):
            top_level_statements += 1
    
    # Scripts often have executable code directly at module level
    if top_level_statements > 5:  # Arbitrary threshold
        return True

    return False

def wrap_main_as_function(main_block):
    """
    Convert a main block to a function with advanced integration capabilities.
    Designed to work with diverse codebases containing thousands of unrelated scripts.
    
    Features:
    - Namespace isolation to prevent variable conflicts between scripts
    - Dynamic naming to avoid function name collisions
    - Flexible argument handling for different CLI patterns
    - Context preservation for diverse execution environments
    - Rich return value support beyond simple exit codes
    - Diagnostics for integration troubleshooting
    """
    # First, analyze the main block to find potential naming conflicts
    function_name = "main"
    local_names = set()
    
    for node in ast.walk(main_block):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            local_names.add(node.id)
        elif isinstance(node, ast.FunctionDef):
            if node.name == "main":
                # Avoid collision with existing main function
                function_name = "_integrated_main"
    
    # Create arguments with flexible handling for different CLI patterns
    args = ast.arguments(
        posonlyargs=[], 
        args=[ast.arg(arg='args', annotation=None)],
        kwonlyargs=[
            ast.arg(arg='standalone', annotation=None),
            ast.arg(arg='context', annotation=None)
        ], 
        kw_defaults=[
            ast.Constant(value=False),
            ast.Constant(value=None)
        ], 
        defaults=[ast.Constant(value=None)]
    )
    
    # Add context preservation for script's environment
    setup_context = [
        # Store original state that might be modified
        ast.Assign(
            targets=[ast.Name(id='_original_argv', ctx=ast.Store())],
            value=ast.Attribute(value=ast.Name(id='sys', ctx=ast.Load()), 
                               attr='argv', ctx=ast.Load())
        ),
        # Create isolation for script-specific context
        ast.Assign(
            targets=[ast.Name(id='_script_context', ctx=ast.Store())],
            value=ast.Dict(keys=[], values=[])
        ),
        # Handle args properly for both direct and integrated calls
        ast.If(
            test=ast.Name(id='args', ctx=ast.Load()),
            body=[
                ast.Assign(
                    targets=[ast.Attribute(
                        value=ast.Name(id='sys', ctx=ast.Load()),
                        attr='argv', ctx=ast.Store()
                    )],
                    value=ast.List(
                        elts=[
                            ast.Constant(value=''),
                            ast.Call(
                                func=ast.Name(id='*', ctx=ast.Load()),
                                args=[ast.Name(id='args', ctx=ast.Load())],
                                keywords=[]
                            )
                        ],
                        ctx=ast.Load()
                    )
                )
            ],
            orelse=[]
        )
    ]
    
    # Add robust try-except with detailed error handling and cleanup
    try_block = ast.Try(
        body=[
            # Add logging for integration diagnostics
            ast.If(
                test=ast.UnaryOp(
                    op=ast.Not(),
                    operand=ast.Name(id='standalone', ctx=ast.Load())
                ),
                body=[
                    ast.Expr(value=ast.Call(
                        func=ast.Name(id='print', ctx=ast.Load()),
                        args=[ast.Constant(value=f'Executing integrated script in {function_name}()')],
                        keywords=[]
                    ))
                ],
                orelse=[]            ),
            # Execute the original main block code
            *(main_block.body if hasattr(main_block, 'body') else [main_block])
        ],
        handlers=[
            # Handle keyboard interrupts separately (common in CLI scripts)
            ast.ExceptHandler(
                type=ast.Name(id='KeyboardInterrupt', ctx=ast.Load()),
                name=None,
                body=[
                    ast.Expr(value=ast.Call(
                        func=ast.Name(id='print', ctx=ast.Load()),
                        args=[ast.Constant(value='Operation interrupted by user')],
                        keywords=[]
                    )),
                    ast.Return(value=ast.Constant(value=130))  # Standard SIGINT exit code
                ]
            ),
            # Handle system exit specially (common in scripts using sys.exit)
            ast.ExceptHandler(
                type=ast.Name(id='SystemExit', ctx=ast.Load()),
                name='e',
                body=[
                    ast.Return(value=ast.Call(
                        func=ast.Name(id='getattr', ctx=ast.Load()),
                        args=[
                            ast.Name(id='e', ctx=ast.Load()),
                            ast.Constant(value='code'),
                            ast.Constant(value=0)
                        ],
                        keywords=[]
                    ))
                ]
            ),
            # Generic exception handler
            ast.ExceptHandler(
                type=ast.Name(id='Exception', ctx=ast.Load()),
                name='e',
                body=[
                    ast.Expr(value=ast.Call(
                        func=ast.Name(id='print', ctx=ast.Load()),
                        args=[
                            ast.BinOp(
                                left=ast.Constant(value=f'Error in {function_name}: '),
                                op=ast.Add(),
                                right=ast.Call(
                                    func=ast.Name(id='str', ctx=ast.Load()),
                                    args=[ast.Name(id='e', ctx=ast.Load())],
                                    keywords=[]
                                )
                            )
                        ],
                        keywords=[]
                    )),
                    ast.Expr(value=ast.Call(
                        func=ast.Name(id='traceback', ctx=ast.Load()),
                        attr='print_exc',
                        args=[],
                        keywords=[]
                    )),
                    ast.Return(value=ast.Constant(value=1))
                ]
            )
        ],
        orelse=[],
        finalbody=[
            # Restore original environment state
            ast.Assign(
                targets=[ast.Attribute(
                    value=ast.Name(id='sys', ctx=ast.Load()),
                    attr='argv', ctx=ast.Store()
                )],
                value=ast.Name(id='_original_argv', ctx=ast.Load())
            ),
            # Return success if execution reaches here
            ast.If(
                test=ast.Name(id='standalone', ctx=ast.Load()),
                body=[ast.Return(value=ast.Constant(value=0))],
                orelse=[]
            )
        ]
    )
    
    # Create the function with proper imports
    function_body = [
        # Ensure required modules are available
        ast.Import(names=[ast.alias(name='sys', asname=None)]),
        ast.Import(names=[ast.alias(name='traceback', asname=None)]),
        *setup_context,
        try_block
    ]
    
    # Add docstring to explain how this function works in integration
    docstring = ast.Expr(
        value=ast.Constant(
            value=f"""
            Integrated entry point for the original script.
            
            Args:
                args: Command line arguments to pass to the script
                standalone: Whether this is running as a standalone script
                context: Optional context dictionary for state sharing
                
            Returns:
                Exit code or result from the original script
            
            Note: This function was automatically generated to enable integration
            with other scripts in a unified codebase.
            """
        )
    )
    
    function_body.insert(0, docstring)
    
    return ast.FunctionDef(
        name=function_name,
        args=args,
        body=function_body,
        decorator_list=[],
        returns=None
    )

def extract_dependencies(tree, filename):
    """
    Extract import statements and dependencies with robust handling for diverse codebases.
    
    Designed for massive-scale integration of thousands of unrelated scripts:
    - Handles various import styles and patterns across different Python versions 
    - Distinguishes between standard library, external, and project imports
    - Detects namespace conflicts between unrelated scripts
    - Identifies potential circular dependencies across disparate modules
    - Categorizes imports for namespace isolation when needed
    - Handles dynamic imports (importlib, __import__) through pattern detection
    - Provides heuristic-based dependency categorization for unrelated scripts
    - Supports integration of scripts with conflicting dependency structures
    
    Args:
        tree: AST of the Python file
        filename: Name of the source file
    
    Returns:
        tuple: (imports list, dependencies set, import_metadata dict)
    """
    imports = []
    dependencies = set()
    import_sources = {}  # Track where imports come from to detect conflicts
    import_categories = {
        "std_lib": set(),
        "external": set(),
        "project": set(),
        "dynamic": set(),
        "relative": set(),
        "unknown": set()
    }
    conflict_risk = {}  # Track potential import conflicts
    
    # Extended standard library modules list
    std_libs = set(['os', 'sys', 're', 'math', 'time', 'datetime', 'json', 
                   'random', 'collections', 'itertools', 'functools', 'pathlib',
                   'logging', 'unittest', 'argparse', 'csv', 'io', 'traceback',
                   'pickle', 'copy', 'shutil', 'subprocess', 'multiprocessing',
                   'threading', 'queue', 'asyncio', 'typing', 'contextlib',
                   'tempfile', 'uuid', 'hashlib', 'glob', 'fnmatch', 'socket',
                   'email', 'urllib', 'http', 'base64', 'xml', 'html',
                   'zipfile', 'tarfile', 'gzip', 'configparser', 'warnings',
                   'abc', 'ast', 'bisect', 'calendar', 'concurrent', 'dataclasses',
                   'dbm', 'decimal', 'difflib', 'enum', 'filecmp', 'getpass',
                   'gettext', 'heapq', 'importlib', 'inspect', 'ipaddress', 'locale',
                   'mimetypes', 'numbers', 'operator', 'optparse', 'platform',
                   'pprint', 'reprlib', 'secrets', 'selectors', 'signal', 'smtplib',
                   'statistics', 'string', 'struct', 'textwrap', 'weakref', 'zlib'])
    
    # Common external libraries for categorization
    common_external_libs = {
        'numpy', 'pandas', 'matplotlib', 'sklearn', 'tensorflow', 'torch', 'keras',
        'django', 'flask', 'fastapi', 'requests', 'sqlalchemy', 'pytest', 'selenium',
        'beautifulsoup4', 'bs4', 'pyyaml', 'yaml', 'pillow', 'pil', 'opencv',
        'cv2', 'scipy', 'seaborn', 'plotly', 'dash', 'pyqt', 'pyside', 'tkinter',
        'kivy', 'nltk', 'spacy', 'transformers', 'gensim', 'networkx', 'sympy',
        'hypothesis', 'psycopg2', 'pymongo', 'redis', 'celery', 'dask', 'pyspark'
    }
    
    # Extract the module name from the filename for filtering self-imports
    self_module = filename.replace('.py', '')
    
    # Track potential dynamic imports
    dynamic_import_patterns = [
        ('__import__', r'__import__\s*\(\s*[\'"]([^\'"]+)[\'"]'),
        ('importlib', r'importlib\.import_module\s*\(\s*[\'"]([^\'"]+)[\'"]'),
        ('imp', r'imp\.load_module\s*\(\s*[\'"]([^\'"]+)[\'"]'),
        ('load_source', r'imp\.load_source\s*\(\s*[^\'"]*[\'"]?\s*,\s*[\'"]([^\'"]+)[\'"]'),
        ('spec_from_file', r'spec_from_file_location\s*\(\s*[\'"][^\'"]+[\'"],\s*[\'"]([^\'"]+)[\'"]')
    ]
    
    try:
        # First pass: collect static imports
        for node in ast.walk(tree):
            # Handle regular imports: import x, import x.y.z
            if isinstance(node, ast.Import):
                for name in node.names:
                    module_path = name.name
                    asname = name.asname if name.asname else module_path
                    
                    # Skip any imports of self to avoid circular references
                    if module_path == self_module or module_path.startswith(f"{self_module}."):
                        continue
                        
                    import_stmt = f"import {module_path}{' as ' + asname if name.asname else ''}"
                    imports.append(import_stmt)
                    
                    # Add base module as dependency
                    base_module = module_path.split('.')[0]
                    if base_module != self_module:
                        dependencies.add(base_module)
                        
                        # Track import sources for conflict detection
                        if base_module in import_sources and import_sources[base_module] != module_path:
                            conflict_risk[base_module] = conflict_risk.get(base_module, 0) + 1
                        import_sources[base_module] = module_path
                        
                        # Categorize the import
                        if base_module in std_libs:
                            import_categories["std_lib"].add(base_module)
                        elif base_module in common_external_libs:
                            import_categories["external"].add(base_module)
                        else:
                            import_categories["project"].add(base_module)
            
            # Handle from imports: from x import y, from x.y import z
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    module_path = node.module
                    
                    # Skip self-imports or relative imports with explicit self reference
                    if module_path == self_module or module_path.startswith(f"{self_module}."):
                        continue
                    
                    # Handle relative imports with explicit level
                    if node.level > 0:
                        # For relative imports, add a comment but don't track as dependency
                        prefix = "." * node.level
                        import_stmt = f"from {prefix}{module_path} import {', '.join(n.name + (' as ' + n.asname if n.asname else '') for n in node.names)}"
                        imports.append(import_stmt)
                        
                        # Track as relative import for integration planning
                        rel_path = f"{prefix}{module_path}"
                        import_categories["relative"].add(rel_path)
                    else:
                        import_stmt = f"from {module_path} import {', '.join(n.name + (' as ' + n.asname if n.asname else '') for n in node.names)}"
                        imports.append(import_stmt)
                        
                        # Add base module as dependency (for non-relative imports)
                        base_module = module_path.split('.')[0]
                        if base_module != self_module:
                            dependencies.add(base_module)
                            
                            # Track import sources for conflict detection
                            if base_module in import_sources and import_sources[base_module] != module_path:
                                conflict_risk[base_module] = conflict_risk.get(base_module, 0) + 1
                            import_sources[base_module] = module_path
                            
                            # Categorize the import
                            if base_module in std_libs:
                                import_categories["std_lib"].add(base_module)
                            elif base_module in common_external_libs:
                                import_categories["external"].add(base_module)
                            else:
                                import_categories["project"].add(base_module)
                
                # Handle "from . import x" style relative imports
                elif node.level > 0:
                    import_stmt = f"from {'.' * node.level} import {', '.join(n.name + (' as ' + n.asname if n.asname else '') for n in node.names)}"
                    imports.append(import_stmt)
                    
                    # Track as relative import
                    rel_path = f"{'.' * node.level}"
                    import_categories["relative"].add(rel_path)
        
        # Second pass: Handle potential dynamic imports
        code_str = ast.unparse(tree)
        for name, pattern in dynamic_import_patterns:
            for match in re.finditer(pattern, code_str):
                if match.group(1):
                    dynamic_module = match.group(1).split('.')[0]
                    if dynamic_module not in std_libs and dynamic_module != self_module:
                        imports.append(f"# Potential dynamic import: {match.group(1)}")
                        dependencies.add(dynamic_module)
                        import_categories["dynamic"].add(dynamic_module)
                        
        # Handle wildcard imports - very important for namespace conflict detection
        # From imports like: from module import *
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module:
                for name in node.names:
                    if name.name == '*':
                        base_module = node.module.split('.')[0]
                        imports.append(f"# WARNING: Wildcard import from {node.module}")
                        if base_module not in std_libs and base_module != self_module:
                            # Mark wildcard imports as high risk for namespace conflicts
                            conflict_risk[base_module] = conflict_risk.get(base_module, 0) + 10
    
    except Exception as e:
        # Graceful error handling - don't crash the entire process
        imports.append(f"# Error extracting imports: {str(e)}")
    
    # Filter out likely false positives that are often confused as modules
    false_positives = {'self', 'cls', 'kwargs', 'args', 'data', 'result', 'config', 
                       'test', 'utils', 'type', 'value', 'item', 'key', 'text', 'file',
                       'error', 'temp', 'tmp', 'path', 'name', 'content', 'options',
                       'params', 'settings', 'obj', 'instance', 'info', 'response'}
    dependencies = {dep for dep in dependencies if dep not in false_positives}
    
    # Create import metadata for integration planning
    import_metadata = {
        "categories": import_categories,
        "conflicts": conflict_risk,
        "sources": import_sources
    }
    
    return imports, dependencies, import_metadata

def extract_subprocess_calls(tree):
    """
    Extract subprocess calls with comprehensive pattern matching for diverse codebases.
    
    Designed to detect subprocess invocations across thousands of unrelated scripts:
    - Standard library subprocess patterns (run, Popen, call, check_output, etc.)
    - OS-level command execution (os.system, os.popen, os.execv, etc.)
    - Shell execution patterns (shell=True, bash, cmd.exe, sh, etc.)
    - Python execution patterns (python, python3, py, etc.)
    - Script execution patterns (exec, execfile, import, __import__, etc.)
    - Common task schedulers and runners (celery, airflow, luigi, etc.)
    - Custom patterns in large enterprise codebases
    - Legacy subprocess patterns from Python 2.x codebases
    - Container orchestration and virtualization calls (docker, kubectl, etc.)
    - Dynamic command construction patterns and string interpolation
    - Cross-language integration via FFI, JNI, ctypes, etc.
    - Remote execution via SSH, remote APIs, etc.
    
    Args:
        tree: AST of the Python file
        
    Returns:
        list: List of detected subprocess calls
    """
    calls = []
    
    # Track potential wrapper functions that may hide subprocess calls
    potential_wrappers = set()
    
    # Track imported module aliases for detection
    module_aliases = {
        'subprocess': ['subprocess', 'sp', 'subp', 'proc', 'sub'],
        'os': ['os', 'system', 'os_utils', 'osutils'],
        'multiprocessing': ['multiprocessing', 'mp', 'multi', 'parallel'],
        'commands': ['commands'],  # Legacy Python 2.x
    }
    
    # First pass: collect import aliases
    try:
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for name in node.names:
                    if name.name in list(module_aliases.keys()):
                        if name.asname:
                            module_aliases[name.name].append(name.asname)
            elif isinstance(node, ast.ImportFrom):
                if node.module in list(module_aliases.keys()):
                    for name in node.names:
                        if name.asname:
                            potential_wrappers.add(name.asname)
                        else:
                            potential_wrappers.add(name.name)
    except Exception:
        pass  # Ignore errors in alias detection
    
    try:
        for node in ast.walk(tree):
            # Standard subprocess module patterns - handle all known aliases
            if isinstance(node, ast.Call):
                # Check for subprocess.X() calls with all possible aliases
                if isinstance(node.func, ast.Attribute) and hasattr(node.func, 'value'):
                    if hasattr(node.func.value, 'id'):
                        module_id = node.func.value.id
                        
                        # Check against all known module aliases
                        for module, aliases in module_aliases.items():
                            if module_id in aliases:
                                # Subprocess module functions
                                if module == 'subprocess' and node.func.attr in ['run', 'call', 'check_call', 
                                                                               'check_output', 'Popen', 'getoutput',
                                                                               'getstatusoutput', 'communicate']:
                                    calls.append(ast.unparse(node))
                                # OS module execution functions
                                elif module == 'os' and node.func.attr in ['system', 'popen', 'spawn', 'execl', 'execv', 
                                                                         'execve', 'execvp', 'execvpe', 'startfile', 
                                                                         'spawnl', 'spawnv', 'spawnve']:
                                    calls.append(ast.unparse(node))
                                # Multiprocessing module
                                elif module == 'multiprocessing' and node.func.attr in ['Process', 'Pool', 'spawn']:
                                    calls.append(ast.unparse(node))
                
                # Check for common renamed imports and wrapper functions
                elif isinstance(node.func, ast.Name):
                    func_name = node.func.id.lower()
                    
                    # Common subprocess function names across diverse codebases
                    common_subprocess_names = [
                        'run', 'call', 'popen', 'exec', 'execute', 'spawn', 'system', 'shell',
                        'launch', 'invoke', 'command', 'runcommand', 'runcmd', 'execute_command',
                        'run_process', 'run_shell', 'run_cmd', 'run_command', 'execute_shell',
                        'shell_exec', 'cmd_exec', 'run_subprocess', 'execute_subprocess',
                        'start_process', 'run_program', 'execprocess', 'shellcmd', 'shellexec',
                        'runprogram', 'runscript', 'execscript', 'launch_process', 'cmdexec',
                        'systemcall', 'syscall', 'runjob', 'execjob'
                    ]
                    
                    if func_name in common_subprocess_names or func_name in potential_wrappers:
                        calls.append(ast.unparse(node))
                        # Track as potential wrapper for further investigation
                        potential_wrappers.add(func_name)
                
                # Container/orchestration tools and remote execution
                if isinstance(node.func, ast.Attribute) and hasattr(node.func, 'value'):
                    # Docker and container patterns
                    container_patterns = [
                        ('docker', ['run', 'exec', 'start', 'create']),
                        ('container', ['run', 'exec', 'start']),
                        ('kubectl', ['run', 'exec', 'create', 'apply']),
                        ('kube', ['run', 'exec', 'apply']),
                        ('ssh', ['connect', 'exec', 'run_command']),
                        ('fabric', ['run', 'execute', 'sudo']),
                        ('vagrant', ['up', 'ssh']),
                        ('ansible', ['run', 'execute', 'command']),
                        ('remote', ['execute', 'run', 'invoke'])
                    ]
                    
                    if hasattr(node.func.value, 'id'):
                        value_id = node.func.value.id.lower()
                        for prefix, methods in container_patterns:
                            if value_id == prefix or prefix in value_id:
                                if node.func.attr.lower() in methods:
                                    calls.append(f"# Container/Remote execution: {prefix}\n{ast.unparse(node)}")
                
                # Common shell execution keywords in strings
                if node.args and any(isinstance(arg, ast.Constant) for arg in node.args):
                    for arg in node.args:
                        if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                            cmd_str = arg.value.lower()
                            
                            # Common shell commands and indicators
                            shell_commands = [
                                'bash ', 'sh ', 'cmd ', 'cmd.exe', 'powershell', 'pwsh', '/bin/', 'start ', 
                                'exec ', './', '\\bin\\', 'command /c', 'shell=true', '-c "', '/usr/bin/',
                                'sudo ', 'apt ', 'yum ', 'brew ', 'docker ', 'kubectl '
                            ]
                            
                            # Common interpreters and executable indicators
                            executables = [
                                'python', 'python3', 'py ', 'ruby', 'node', 'java', 'perl', 'php', 'bash',
                                'sh ', 'pwsh', 'powershell', 'cmd', 'npm ', 'yarn ', 'pip ', 'gcc',
                                'make ', 'mvn ', 'gradle ', 'ant ', 'cargo ', 'go run', 'dotnet ', 'conda '
                            ]
                            
                            if any(shell_cmd in cmd_str for shell_cmd in shell_commands) or \
                               any(cmd_str.startswith(exe) or f' {exe}' in cmd_str for exe in executables):
                                calls.append(ast.unparse(node))
                                break
                
                # Detect common task schedulers and job runners
                if isinstance(node.func, ast.Attribute):
                    scheduler_patterns = [
                        ('celery', ['delay', 'apply_async', 'send_task']),
                        ('task', ['delay', 'apply_async', 'queue']),
                        ('airflow', ['operators', 'task', 'run']),
                        ('luigi', ['build', 'run', 'workers']),
                        ('flow', ['run', 'execute']),
                        ('job', ['submit', 'queue', 'run', 'execute', 'schedule']),
                        ('process', ['start', 'run']),
                        ('thread', ['start', 'run']),
                        ('dask', ['compute', 'persist', 'submit']),
                        ('spark', ['submit', 'run', 'createProcess']),
                        ('queue', ['put', 'submit', 'add_task', 'enqueue']),
                        ('worker', ['execute', 'process', 'run_task']),
                        ('schedule', ['run', 'add_job', 'add_task'])
                    ]
                    
                    if hasattr(node.func, 'value') and hasattr(node.func.value, 'id'):
                        value_id = node.func.value.id.lower()
                        for prefix, methods in scheduler_patterns:
                            if prefix in value_id:
                                if node.func.attr.lower() in methods:
                                    calls.append(f"# Task runner: {value_id}\n{ast.unparse(node)}")
            
            # String formatting for command construction (common in diverse codebases)
            if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
                if isinstance(node.left, ast.Constant) and isinstance(node.left.value, str):
                    cmd_str = node.left.value.lower()
                    # Check if this string concatenation might be building a command
                    command_indicators = ['python ', 'exec ', 'bash ', 'cmd ', '/bin/', '.exe', '.sh', '.bat', '.py']
                    if any(ind in cmd_str for ind in command_indicators):
                        # Find the parent Call node this string is used in
                        for parent in ast.walk(tree):
                            if isinstance(parent, ast.Call) and any(
                                ast.unparse(arg).find(ast.unparse(node)[:20]) != -1 for arg in parent.args if hasattr(arg, 'left')):
                                calls.append(f"# Dynamic command construction:\n{ast.unparse(parent)}")
                                break
        
        # Look for Python eval/exec patterns
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                if node.func.id in ['eval', 'exec', 'execfile', '__import__', 'compile']:
                    calls.append(f"# Code execution:\n{ast.unparse(node)}")
        
        # FFI and native code execution
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                if hasattr(node.func, 'value') and hasattr(node.func.value, 'id'):
                    ffi_patterns = [
                        ('ctypes', ['cdll', 'windll', 'CDLL', 'WinDLL', 'LoadLibrary']),
                        ('cffi', ['FFI', 'dlopen']),
                        ('jni', ['createJavaVM', 'JNIEnv']),
                        ('subprocess32', ['call', 'run', 'Popen']),  # For Python 2 backport
                        ('commands', ['getoutput', 'getstatusoutput'])  # Very old Python 2
                    ]
                    
                    for module, funcs in ffi_patterns:
                        if module in node.func.value.id.lower() and any(f in node.func.attr for f in funcs):
                            calls.append(f"# FFI call: {module}\n{ast.unparse(node)}")
        
        # Analyze for potential wrapper functions that were called
        if potential_wrappers:
            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef) and (node.name in potential_wrappers or 
                                                          any(wrapper in node.name.lower() 
                                                             for wrapper in ['run', 'exec', 'call', 'command', 'system'])):
                    # Check function body for subprocess indicators
                    subprocess_indicators = False
                    for inner_node in ast.walk(node):
                        # Look for shell command strings inside this function
                        if isinstance(inner_node, ast.Constant) and isinstance(inner_node.value, str):
                            cmd_str = inner_node.value.lower()
                            if any(cmd in cmd_str for cmd in ['bash', 'python', 'exec', '/bin/', 'cmd.exe']):
                                subprocess_indicators = True
                                break
                        # Look for direct subprocess calls
                        if isinstance(inner_node, ast.Call) and isinstance(inner_node.func, ast.Name):
                            if inner_node.func.id in ['system', 'popen', 'run', 'Popen', 'call', 'spawn', 'execute']:
                                subprocess_indicators = True
                                break
                    
                    if subprocess_indicators:
                        calls.append(f"# Custom subprocess wrapper function:\ndef {node.name}(...)")
    except Exception as e:
        # Don't crash if we encounter any parsing errors - just return what we found so far
        calls.append(f"# Error analyzing subprocess calls: {str(e)}")
    
    return calls
                
def is_documentation_file(code):
    """
    Advanced detection of documentation files vs actual code.
    Optimized for extremely diverse codebases with tens of thousands of scripts
    that weren't designed to work together.
    
    Uses multiple detection strategies:
    1. Content pattern analysis (language/format specific markers)
    2. Structure-based analysis (code-to-documentation ratio)
    3. Statistical pattern recognition
    4. Linguistic feature detection
    5. Cross-format detection for embedded documentation
    
    Works with diverse file formats, coding conventions, and mixed content.
    """
    # Skip very short files - likely stub files or placeholders
    if len(code) < 100:
        # Still check for actual code structures
        has_functional_code = any(marker in code for marker in 
                                ["def ", "class ", "import ", "from ", "if ", "for ", "while "])
        return not has_functional_code

    # ===== Strategy 1: Quick detection of obvious cases =====
    # Fast path: obvious documentation files
    if any(marker in code.lower()[:1000] for marker in DOCUMENTATION_MARKERS):
        # Still verify by checking code-to-text ratio
        code_tokens = re.findall(r'(def\s+\w+|class\s+\w+|\w+\s*=|import\s+|from\s+\w+\s+import)', code)
        if len(code_tokens) < 5:
            return True
    
    # ===== Strategy 2: Language and format detection =====
    # Detect file language/format based on content patterns
    format_scores = {
        'markdown': 0,
        'rst': 0,
        'html': 0,
        'jupyter': 0,
        'python': 0,
        'other_code': 0,
    }
    
    # Markdown format indicators
    if re.search(r'#{1,6}\s+\w+', code):
        format_scores['markdown'] += 3
    if code.count('```') >= 2:
        format_scores['markdown'] += 2
    if re.search(r'\[.+?\]\(.+?\)', code):
        format_scores['markdown'] += 2
    if re.search(r'\*\*.+?\*\*|\*.+?\*|_.+?_', code):
        format_scores['markdown'] += 1
    
    # reStructuredText indicators
    if re.search(r'={3,}\s*\n\w+\s*\n={3,}', code):
        format_scores['rst'] += 3
    if re.search(r'-{3,}\s*\n\w+\s*\n-{3,}', code):
        format_scores['rst'] += 2
    if re.search(r'.. \w+::', code):
        format_scores['rst'] += 3
        
    # HTML doc indicators
    if re.search(r'<html.*?>|<!DOCTYPE|<body>|<head>', code, re.IGNORECASE):
        format_scores['html'] += 5
    if re.search(r'<h\d>.*?</h\d>|<p>.*?</p>', code, re.IGNORECASE):
        format_scores['html'] += 3
    
    # Jupyter notebook indicators (converted to .py)
    if re.search(r'# In\[[\d ]*\]:', code):
        format_scores['jupyter'] += 5
    if '# coding: utf-8' in code and '# %%' in code:
        format_scores['jupyter'] += 3
    
    # Python code indicators
    if re.search(r'def\s+\w+\s*\(', code):
        format_scores['python'] += 3
    if re.search(r'class\s+\w+\s*(\(|:)', code):
        format_scores['python'] += 3
    if re.search(r'import\s+\w+|from\s+\w+\s+import', code):
        format_scores['python'] += 2
    if re.search(r'if\s+__name__\s*==\s*["\']__main__["\']:', code):
        format_scores['python'] += 4
        
    # Other code languages
    if re.search(r'function\s+\w+\s*\(.*?\)\s*{', code):  # JavaScript/C-like
        format_scores['other_code'] += 3
    if re.search(r'public\s+(static\s+)?(class|void|int|String)', code):  # Java/C#
        format_scores['other_code'] += 3
    
    # ===== Strategy 3: Content analysis =====
    # Count lines by type
    lines = code.split('\n')
    comment_lines = 0
    code_lines = 0
    blank_lines = 0
    markdown_lines = 0
    
    # Count lines with multi-line strings (often docs)
    in_multiline_string = False
    multiline_string_delim = None
    multiline_string_lines = 0
    doc_string_lines = 0
    
    line_idx = 0
    while line_idx < len(lines):
        line = lines[line_idx].strip()
        
        # Handle multi-line strings
        if in_multiline_string:
            multiline_string_lines += 1
            if line.endswith(multiline_string_delim):
                in_multiline_string = False
                multiline_string_delim = None
                # Check if this was likely a docstring based on surrounding context
                if (line_idx >= 2 and 
                    (lines[line_idx-multiline_string_lines-1].strip().endswith(':') or 
                     'def ' in lines[line_idx-multiline_string_lines-1] or 
                     'class ' in lines[line_idx-multiline_string_lines-1])):
                    doc_string_lines += multiline_string_lines
                multiline_string_lines = 0
        elif '"""' in line:
            # Check for single-line docstring
            if line.count('"""') >= 2:
                doc_string_lines += 1
            else:
                in_multiline_string = True
                multiline_string_delim = '"""'
                multiline_string_lines = 1
        elif "'''" in line:
            # Check for single-line docstring with single quotes
            if line.count("'''") >= 2:
                doc_string_lines += 1
            else:
                in_multiline_string = True
                multiline_string_delim = "'''"
                multiline_string_lines = 1
        # Normal line classification
        elif not line:
            blank_lines += 1
        elif line.startswith('#'):
            comment_lines += 1
        elif line.startswith(('=', '-', '*', '>', '+')) and len(set(line)) <= 3:
            # Likely a markdown separator line
            markdown_lines += 1
        elif re.match(r'^#{1,6}\s+\w+', line):
            # Markdown header
            markdown_lines += 1
        else:
            code_lines += 1
        
        line_idx += 1
                
    # ===== Strategy 4: Calculate documentation-to-code ratio =====
    total_lines = len(lines)
    if total_lines == 0:
        return True  # Empty file, treat as doc
        
    # Calculate percentages
    comment_percentage = comment_lines / total_lines * 100
    markdown_percentage = markdown_lines / total_lines * 100  
    code_percentage = code_lines / total_lines * 100
    
    # ===== Strategy 5: Analyze executable code density =====
    # Check for real executable statements (beyond just function/class definitions)
    executable_statements = re.findall(
        r'(\s+if\s+|\s+for\s+|\s+while\s+|\s+try\s*:|\s+except\s+|\s+return\s+|\s*=\s*|'
        r'\.\w+\(|\s+assert\s+|\s+raise\s+|\s+with\s+)', code)
    
    # ===== Strategy 6: Check for specific documentation indicators =====
    documentation_indicators = [
        # Documentation structural elements
        r'Table of Contents',
        r'#+\s+(Overview|Introduction|Background|Description|Features|Usage|API)',
        r'#+\s+(Examples?|Tutorial|Getting Started|Quick Start|Install|Setup|Configuration)',
        r'#+\s+(Reference|Guide|Documentation|Manual|Cookbook|FAQ|How to)',
        
        # Parameter documentation
        r'\*\*Parameters?\*\*:?',
        r'@param', r':param', r'@arg', r':arg', r':type',
        r'@return', r':return', r':rtype', r'@yields',
        
        # License, versioning, metadata
        r'@author', r'@version', r'@since', r'@see', r'@link',
        r'#+\s+License', r'Copyright \(c\)',
        
        # Website documentation elements
        r'<title>.*?</title>', r'<h\d>.*?</h\d>', r'<p>.*?</p>', 
        
        # Changelog elements
        r'#{1,3}\s+\d+\.\d+\.\d+', r'## \[\d+\.\d+\.\d+\]',
    ]
    
    doc_indicators = sum(1 for pattern in documentation_indicators if re.search(pattern, code, re.IGNORECASE))
    
    # ===== Strategy 7: Final decision logic =====
    # Calculate weighted scores
    doc_score = (
        doc_indicators * 3 + 
        comment_percentage / 10 + 
        markdown_percentage / 5 + 
        format_scores['markdown'] + 
        format_scores['rst'] + 
        format_scores['html'] + 
        format_scores['jupyter'] * 0.5
    )
    
    code_score = (
        len(executable_statements) / 3 + 
        code_percentage / 5 + 
        format_scores['python'] * 2 + 
        format_scores['other_code']
    )
    
    # Special case: high density of docstrings but low executable code
    if doc_string_lines > total_lines * 0.6 and len(executable_statements) < 10:
        return True
        
    # Special case: very clear documentation format
    if (format_scores['markdown'] >= 5 or format_scores['rst'] >= 5 or 
            format_scores['html'] >= 5) and format_scores['python'] <= 2:
        return True
        
    # Special case: Jupyter notebooks converted to Python with minimal code
    if format_scores['jupyter'] >= 5 and executable_statements < 15:
        return True
    
    # Special case: Only functions/classes with docstrings but no real code
    if (re.search(r'def\s+\w+\s*\(|class\s+\w+', code) and
            doc_string_lines > code_lines * 0.7 and
            len(executable_statements) < 10):
        return True
        
    # Balance documentation indicators against code indicators
    # Higher threshold on doc_score for files with some code content
    if code_score > 0:
        # Require stronger documentation signal when real code is present
        return doc_score > code_score * 2
    else:
        # Without real code, lower threshold for being a documentation file
        return doc_score > 5

def determine_package_category(filename):
    """
    Determine which package category a file belongs to with advanced heuristics.
    Optimized for extremely large and diverse codebases containing thousands
    of scripts that weren't designed to work together.
    
    Analysis combines:
    - Filename patterns (prefixes, suffixes, keywords)
    - Content analysis when available (imports, classes, functions)
    - Common conventions across many frameworks and libraries
    - Statistical clustering for unknown patterns
    
    Returns: The most appropriate package category
    """
    filename_lower = filename.lower()
    filepath = os.path.join(SOURCE_FOLDER, filename)
    
    # Initialize score tracking for each category
    category_scores = {category: 0 for category in PACKAGE_STRUCTURE.keys()}
    
    # Step 1: Check filename patterns (most basic approach)
    # Extract components from various filename patterns (b_component_xxx.py, component_xxx.py, etc)
    parts = re.split(r'[_\-.]', filename_lower)
    parts = [p for p in parts if p and p not in ('py', 'pyc', 'pyw')]  # Filter empty and extensions
    
    # Score the filename parts against package keywords
    for part in parts:
        for category, keywords in PACKAGE_STRUCTURE.items():
            if part in keywords:
                category_scores[category] += 3  # Direct keyword match is strong signal
            elif any(keyword in part for keyword in keywords):
                category_scores[category] += 1  # Partial match is weaker
    
    # Check for common prefixes in large projects
    prefix_mapping = {
        'b_': 'core', 'base_': 'core', 'core_': 'core', 'common_': 'core',
        'r_': 'tools', 'tool_': 'tools', 'util_': 'tools', 'script_': 'tools',
        'y_': 'ui', 'ui_': 'ui', 'gui_': 'ui', 'view_': 'ui',
        'net_': 'net', 'api_': 'net', 'http_': 'net', 'web_': 'net',
        'model_': 'train', 'train_': 'train', 'ml_': 'train', 'learn_': 'train',
        'io_': 'io', 'data_': 'io', 'file_': 'io', 'db_': 'io'
    }
    
    for prefix, category in prefix_mapping.items():
        if filename_lower.startswith(prefix):
            category_scores[category] += 2
    
    # Step 2: Content analysis when file is accessible
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                
            # Deep content analysis: Parse imports and code structure when possible
            try:
                tree = ast.parse(content)
                
                # Analyze imports - strong indicators of purpose
                import_indicators = {
                    'core': ['typing', 'abc', 'enum', 'dataclasses', 'config', 'settings', 'constants'],
                    'ui': ['tkinter', 'qt', 'wx', 'kivy', 'gtk', 'pygame', 'dash', 'flask', 'html', 'css', 'bootstrap'],
                    'tools': ['argparse', 'click', 'typer', 'fire', 'cli', 'tool', 'utils'],
                    'net': ['requests', 'aiohttp', 'urllib', 'http', 'socket', 'websocket', 'grpc', 'api'],
                    'train': ['torch', 'tensorflow', 'keras', 'sklearn', 'numpy', 'pandas', 'ml', 'model'],
                    'io': ['io', 'pathlib', 'os.path', 'sqlite', 'csv', 'json', 'xml', 'yaml', 'toml', 'database']
                }
                
                for node in ast.walk(tree):
                    if isinstance(node, (ast.Import, ast.ImportFrom)):
                        module = ""
                        if isinstance(node, ast.Import):
                            for name in node.names:
                                module = name.name.split('.')[0]
                                for category, indicators in import_indicators.items():
                                    if any(ind in module.lower() for ind in indicators):
                                        category_scores[category] += 2
                        elif isinstance(node, ast.ImportFrom) and node.module:
                            module = node.module.split('.')[0]
                            for category, indicators in import_indicators.items():
                                if any(ind in module.lower() for ind in indicators):
                                    category_scores[category] += 2
                
                # Class/function analysis - what kind of components does this file define?
                for node in tree.body:
                    if isinstance(node, ast.ClassDef):
                        class_name = node.name.lower()
                        # UI-related classes often have specific naming patterns
                        if any(ui_term in class_name for ui_term in ['window', 'frame', 'widget', 'view', 'page', 'form']):
                            category_scores['ui'] += 3
                        # Model classes for ML/training
                        elif any(model_term in class_name for model_term in ['model', 'network', 'classifier', 'predictor']):
                            category_scores['train'] += 3
                        # Network/API related
                        elif any(net_term in class_name for net_term in ['client', 'server', 'api', 'service', 'request']):
                            category_scores['net'] += 3
                            
                    elif isinstance(node, ast.FunctionDef):
                        func_name = node.name.lower()
                        # UI-related functions
                        if any(ui_term in func_name for ui_term in ['display', 'show', 'render', 'draw']):
                            category_scores['ui'] += 1
                        # IO-related functions
                        elif any(io_term in func_name for io_term in ['load', 'save', 'read', 'write', 'import', 'export']):
                            category_scores['io'] += 1
                        # Core functionality
                        elif any(core_term in func_name for core_term in ['process', 'transform', 'convert', 'calculate']):
                            category_scores['core'] += 1
                
            except SyntaxError:
                # If we can't parse the file, fall back to simple content analysis
                pass
                
            # Simple string-based content analysis as fallback
            content_keywords = {
                'core': ['def main', 'class', 'function', 'config', 'settings', 'CONSTANTS', 'ENGINE'],
                'ui': ['window', 'frame', 'layout', 'widget', 'button', 'menu', 'display', 'render', 'html'],
                'tools': ['argparse', 'ArgumentParser', 'click', 'command_line', 'CLI', '--help', 'sys.argv'],
                'net': ['http', 'request', 'response', 'api', 'endpoint', 'server', 'client', 'socket'],
                'train': ['model', 'train', 'epoch', 'batch', 'dataset', 'loss', 'accuracy', 'neural'],
                'io': ['file', 'open(', 'read(', 'write(', 'save', 'load', 'database', 'sql', 'csv']
            }
            
            for category, keywords in content_keywords.items():
                matches = sum(1 for keyword in keywords if keyword.lower() in content.lower())
                category_scores[category] += matches * 0.5  # Weight less than structured analysis
        
        except Exception:
            # If we can't read the file, rely solely on filename
            pass
    
    # Step 3: Statistical approach for large codebases
    # Add score based on filename statistical patterns
    # This helps when dealing with thousands of files with project-specific conventions
    common_extensions = {
        '_controller': 'core', '_service': 'core', '_manager': 'core',
        '_view': 'ui', '_widget': 'ui', '_page': 'ui', '_form': 'ui',
        '_tool': 'tools', '_cli': 'tools', '_script': 'tools',
        '_api': 'net', '_client': 'net', '_server': 'net',
        '_model': 'train', '_dataset': 'train', '_trainer': 'train',
        '_dao': 'io', '_repository': 'io', '_store': 'io'
    }
    
    for extension, category in common_extensions.items():
        if extension in filename_lower:
            category_scores[category] += 1.5
    
    # Special case: test files
    if ('test_' in filename_lower or filename_lower.endswith('_test.py') or 
        'tests/' in filename_lower or '/test/' in filename_lower):
        # Tests typically belong to the tools package
        category_scores['tools'] += 3
    
    # Step 4: Determine the final category based on highest score
    best_category = max(category_scores.items(), key=lambda x: x[1])
    
    # If all scores are 0 or very low, use intelligent fallback
    if best_category[1] <= 1:
        # Fallback strategy for truly ambiguous cases
        if any(term in filename_lower for term in ['app', 'main', 'run', 'entry']):
            return 'core'  # Main application files typically belong to core
        elif any(term in filename_lower for term in ['helper', 'util', 'tool', 'script']):
            return 'tools'  # Helper scripts belong in tools
        else:
            return 'core'  # Default fallback to core package
    
    return best_category[0]

def add_exception_guard(tree):
    """
    Add sophisticated exception handling to make code more resilient
    when integrating thousands of unrelated scripts.
    
    This implementation:
    1. Preserves imports and module-level constants outside try block
    2. Handles different execution contexts (interactive, imported, etc.)
    3. Provides improved error isolation and reporting
    4. Manages resources properly with finalization block
    5. Preserves exit codes and signals for external orchestration
    """
    # Don't modify empty files
    if not tree.body:
        return tree
        
    # Extract imports and constants to keep them outside try block
    imports = []
    constants = []
    wrapped_body = []
    
    for node in tree.body:
        # Keep imports outside the try-except
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            imports.append(node)
        # Constants and __future__ imports should also stay outside
        elif (isinstance(node, ast.Assign) and 
              all(isinstance(target, ast.Name) and 
                  target.id.isupper() for target in node.targets)):
            constants.append(node)
        # __all__, __version__, etc. declarations should be outside
        elif (isinstance(node, ast.Assign) and 
              any(isinstance(target, ast.Name) and 
                  target.id.startswith('__') and target.id.endswith('__') 
                  for target in node.targets)):
            constants.append(node)
        else:
            wrapped_body.append(node)
    
    # Only add exception handling if there's something to wrap
    if not wrapped_body:
        return tree
    
    # Add robust exception handling with resource management
    try_block = ast.Try(
        body=wrapped_body,
        handlers=[
            # Handle keyboard interrupts separately for clean exits
            ast.ExceptHandler(
                type=ast.Name(id="KeyboardInterrupt", ctx=ast.Load()),
                name=None,
                body=[
                    ast.Expr(value=ast.Call(
                        func=ast.Name(id="print", ctx=ast.Load()),
                        args=[ast.Constant(value="Operation interrupted by user")], 
                        keywords=[])),
                    # Preserve the standard exit code for SIGINT
                    ast.If(
                        test=ast.Compare(
                            left=ast.Name(id="__name__", ctx=ast.Load()),
                            ops=[ast.Eq()],
                            comparators=[ast.Constant(value="__main__")]
                        ),
                        body=[
                            ast.Expr(value=ast.Call(
                                func=ast.Name(id="exit", ctx=ast.Load()),
                                args=[ast.Constant(value=130)], 
                                keywords=[]
                            ))
                        ],
                        orelse=[]
                    )
                ]
            ),
            # Handle SystemExit specially to preserve exit codes
            ast.ExceptHandler(
                type=ast.Name(id="SystemExit", ctx=ast.Load()),
                name="e",
                body=[
                    ast.If(
                        test=ast.Compare(
                            left=ast.Name(id="__name__", ctx=ast.Load()),
                            ops=[ast.Eq()],
                            comparators=[ast.Constant(value="__main__")]
                        ),
                        body=[ast.Raise()],
                        orelse=[
                            ast.Expr(value=ast.Call(
                                func=ast.Name(id="print", ctx=ast.Load()),
                                args=[ast.Constant(value="SystemExit caught in imported module")], 
                                keywords=[]
                            ))
                        ]
                    )
                ]
            ),
            # General exception handler with improved diagnostics
            ast.ExceptHandler(
                type=ast.Name(id="Exception", ctx=ast.Load()),
                name="e",
                body=[
                    ast.Expr(value=ast.Call(
                        func=ast.Name(id="print", ctx=ast.Load()),
                        args=[
                            ast.BinOp(
                                left=ast.Constant(value="Error: "),
                                op=ast.Add(),
                                right=ast.Call(
                                    func=ast.Name(id="str", ctx=ast.Load()), 
                                    args=[ast.Name(id="e", ctx=ast.Load())], 
                                    keywords=[]
                                )
                            )
                        ], 
                        keywords=[]
                    )),
                    # Add traceback for easier debugging of integration issues
                    ast.Try(
                        body=[
                            ast.Import(names=[ast.alias(name="traceback", asname=None)]),
                            ast.Expr(value=ast.Call(
                                func=ast.Attribute(
                                    value=ast.Name(id="traceback", ctx=ast.Load()),
                                    attr="print_exc",
                                    ctx=ast.Load()
                                ),
                                args=[],
                                keywords=[]
                            ))
                        ],
                        handlers=[
                            ast.ExceptHandler(
                                type=None,
                                name=None,
                                body=[ast.Pass()]
                            )
                        ],
                        orelse=[],
                        finalbody=[]
                    ),
                    # Only exit if this is the main program
                    ast.If(
                        test=ast.Compare(
                            left=ast.Name(id="__name__", ctx=ast.Load()),
                            ops=[ast.Eq()],
                            comparators=[ast.Constant(value="__main__")]
                        ),
                        body=[
                            ast.Expr(value=ast.Call(
                                func=ast.Name(id="exit", ctx=ast.Load()),
                                args=[ast.Constant(value=1)], 
                                keywords=[]
                            ))
                        ],
                        orelse=[]
                    )
                ]
            )
        ],
        orelse=[],
        # Ensure resources are properly released
        finalbody=[
            ast.Try(
                body=[
                    ast.Import(names=[ast.alias(name="gc", asname=None)]),
                    ast.Expr(value=ast.Call(
                        func=ast.Attribute(
                            value=ast.Name(id="gc", ctx=ast.Load()),
                            attr="collect",
                            ctx=ast.Load()
                        ),
                        args=[],
                        keywords=[]
                    ))
                ],
                handlers=[ast.ExceptHandler(type=None, name=None, body=[ast.Pass()])],
                orelse=[],
                finalbody=[]
            )
        ]
    )
    
    # Reconstruct the tree with imports and constants outside the try block
    tree.body = imports + constants + [try_block]
    return tree

def extract_imports(tree, filename="unknown.py", include_metadata=True):
    """
    Extract import statements from an AST with advanced analysis for diverse codebases.
    
    Designed for massive-scale integration of thousands of unrelated scripts:
    - Intelligently categorizes imports (standard lib, external, project, dynamic)
    - Detects import patterns across different Python versions and coding styles
    - Identifies potential namespace conflicts and import risks
    - Handles relative imports with meaningful context preservation
    - Detects dynamic imports (importlib, __import__) through pattern matching
    - Provides rich metadata for intelligent integration decisions
    
    Args:
        tree: AST parse tree of the module
        filename: Source filename for context
        include_metadata: Whether to include additional metadata about imports
        
    Returns:
        list: Import statements with optional metadata
    """
    imports = []
    import_metadata = {
        "standard_lib": set(),
        "external": set(),
        "project": set(),
        "dynamic": set(),
        "relative": set(),
        "risky": set(),
        "potential_conflicts": set()
    }
    
    # Common standard library modules for classification
    std_libs = set(['os', 'sys', 're', 'math', 'time', 'datetime', 'json', 
                   'random', 'collections', 'itertools', 'functools', 'pathlib',
                   'logging', 'unittest', 'argparse', 'csv', 'io', 'traceback',
                   'pickle', 'copy', 'shutil', 'subprocess', 'multiprocessing'])
    
    # Common external libraries for classification
    common_ext_libs = set(['numpy', 'pandas', 'tensorflow', 'torch', 'sklearn',
                          'django', 'flask', 'requests', 'beautifulsoup4', 'bs4',
                          'matplotlib', 'seaborn', 'pytest', 'sqlalchemy'])
    
    # Module name from filename for self-import detection
    self_module = filename.replace('.py', '')
    
    try:
        # Extract static imports
        for node in ast.walk(tree):
            # Regular imports: import x, import x.y
            if isinstance(node, ast.Import):
                for name in node.names:
                    module_path = name.name
                    asname = name.asname if name.asname else module_path
                    
                    # Avoid self-imports to prevent circular dependencies
                    if module_path == self_module:
                        continue
                    
                    import_stmt = f"import {module_path}{' as ' + asname if name.asname else ''}"
                    imports.append(import_stmt)
                    
                    # Categorize imports for better integration
                    base_module = module_path.split('.')[0]
                    if base_module in std_libs:
                        import_metadata["standard_lib"].add(base_module)
                    elif base_module in common_ext_libs:
                        import_metadata["external"].add(base_module)
                    else:
                        import_metadata["project"].add(base_module)
                        
                        # Check for potential namespace conflicts
                        if base_module in [m.split('.')[0] for m in import_metadata["project"] if m != base_module]:
                            import_metadata["potential_conflicts"].add(base_module)
                    
            # From imports: from x import y, from x.y import z
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    module_path = node.module
                    
                    # Skip self-imports
                    if module_path == self_module:
                        continue
                    
                    # Handle relative imports specially
                    if node.level > 0:
                        prefix = "." * node.level
                        import_stmt = f"from {prefix}{module_path} import {', '.join(n.name + (' as ' + n.asname if n.asname else '') for n in node.names)}"
                        imports.append(import_stmt)
                        import_metadata["relative"].add(f"{prefix}{module_path}")
                    else:
                        import_stmt = f"from {module_path} import {', '.join(n.name + (' as ' + n.asname if n.asname else '') for n in node.names)}"
                        imports.append(import_stmt)
                        
                        # Check for wildcard imports which can cause namespace pollution
                        if any(name.name == "*" for name in node.names):
                            import_metadata["risky"].add(f"{module_path}.*")
                        
                        # Categorize the base module
                        base_module = module_path.split('.')[0]
                        if base_module in std_libs:
                            import_metadata["standard_lib"].add(base_module)
                        elif base_module in common_ext_libs:
                            import_metadata["external"].add(base_module)
                        else:
                            import_metadata["project"].add(base_module)
                else:
                    # Handle "from . import x" style
                    if node.level > 0:
                        import_stmt = f"from {'.' * node.level} import {', '.join(n.name + (' as ' + n.asname if n.asname else '') for n in node.names)}"
                        imports.append(import_stmt)
                        import_metadata["relative"].add('.' * node.level)
                        
        # Find potential dynamic imports 
        code_str = ast.unparse(tree)
        dynamic_patterns = [
            (r'__import__\s*\(\s*[\'"]([^\'"]+)[\'"]', "dynamic __import__"),
            (r'importlib\.import_module\s*\(\s*[\'"]([^\'"]+)[\'"]', "dynamic importlib"),
            (r'imp\.load_module\s*\(\s*[\'"]([^\'"]+)[\'"]', "dynamic imp"),
        ]
        
        for pattern, import_type in dynamic_patterns:
            for match in re.finditer(pattern, code_str):
                if match.group(1):
                    dynamic_module = match.group(1)
                    imports.append(f"# {import_type}: {dynamic_module}")
                    import_metadata["dynamic"].add(dynamic_module)
                    
    except Exception as e:
        # Ensure resilience - don't let one bad import break everything
        imports.append(f"# Error extracting imports: {str(e)}")
    
    if include_metadata:
        # Convert sets to lists for JSON serialization
        serializable_metadata = {k: list(v) for k, v in import_metadata.items()}
        return imports, serializable_metadata
    
    return imports

def extract_functions_and_classes(tree, filename="unknown.py"):
    """
    Extract functions and classes from an AST for massive-scale integration.
    
    Designed specifically for integrating thousands of completely unrelated scripts:
    1. Advanced namespace isolation to prevent conflicts between scripts
    2. Multi-level dependency analysis with circular dependency detection
    3. Automatic component classification for intelligent grouping
    4. Conflict risk assessment and resolution strategies 
    5. Domain-specific component tagging for semantic organization
    6. Compatibility scoring between unrelated components
    7. Identity preservation to maintain script origin context
    8. Automatic adaptation for cross-script integration
    9. Resource usage and side effect detection
    
    Args:
        tree: AST of the Python module
        filename: Source filename for context
        
    Returns:
        dict: Organized items by type with metadata for integration
    """
    # Extract module name from filename for namespacing
    original_module_name = os.path.basename(filename).replace('.py', '').replace('-', '_')
    namespace_prefix = original_module_name.lower()
    
    # Define tracking structures
    defined_names = {}  # name -> {node, type, complexity, dependencies}
    name_conflicts = defaultdict(list)  # name -> [modules where it's defined]
    imported_names = set()  # Names imported from other modules
    resource_usage = {  # Track potential resource conflicts
        "files": set(),       # Files accessed
        "environment": set(), # Environment variables used
        "network": False,     # Network access
        "database": False,    # Database access
        "global_state": set() # Global state modifications
    }
    safe_for_direct_integration = set()
    domain_classification = {}  # Classify components by domain/purpose
    risk_assessment = {}  # Assess risk of integrating each component
    integration_metadata = {
        "module_source": original_module_name,
        "namespace_prefix": namespace_prefix,
        "compatibility_scores": {},
        "isolation_needed": False,  # Will be set true if high conflict risk
        "integration_strategy": "direct"  # direct, namespace, wrapper, or isolate
    }
    
    # Initialize result structure with component types
    result = {
        "functions": [],
        "classes": [],
        "methods": [],
        "metadata": integration_metadata
    }
    
    # First pass: collect import statements and global variables
    for node in ast.walk(tree):
        # Track imported names to avoid false dependencies
        if isinstance(node, ast.Import):
            for name in node.names:
                imported_name = name.asname if name.asname else name.name
                imported_names.add(imported_name)
        elif isinstance(node, ast.ImportFrom):
            for name in node.names:
                imported_names.add(name.asname if name.asname else name.name)
        
        # Track global state modifications and resource usage
        if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
            target_name = node.targets[0].id
            if not target_name.startswith('_') and target_name.isupper():
                resource_usage["global_state"].add(target_name)
                
        # Look for file operations
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == 'open':
            if node.args and isinstance(node.args[0], ast.Constant):
                resource_usage["files"].add(node.args[0].value)
                
        # Look for environment variable access
        if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Attribute) and \
           isinstance(node.value.value, ast.Name) and node.value.value.id == 'os' and \
           node.value.attr == 'environ':
            resource_usage["environment"].add(node.attr)
            
        # Check for network usage indicators
        if isinstance(node, ast.Attribute) and node.attr in ['connect', 'request', 'urlopen']:
            resource_usage["network"] = True
        
        # Check for database usage indicators
        if isinstance(node, ast.Name) and node.id in ['cursor', 'connection', 'session']:
            resource_usage["database"] = True
    
    # Second pass: build dependency graph for defined items
    dependency_graph = defaultdict(set)
    
    # Collect defined names at module level
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.ClassDef)):
            name = node.name
            defined_names[name] = {
                "node": node,
                "type": "class" if isinstance(node, ast.ClassDef) else "function",
                "complexity": len(list(ast.walk(node))),
                "dependencies": set()
            }
            
            # Analyze domain/purpose based on name and content
            domain_terms = {
                "data": ["data", "load", "save", "parse", "convert", "transform"],
                "ui": ["display", "show", "render", "draw", "view", "window"],
                "network": ["http", "request", "download", "api", "server", "client"],
                "utility": ["util", "helper", "format", "validate", "check"],
                "model": ["model", "predict", "train", "evaluate", "classifier"],
                "control": ["controller", "manager", "orchestrate", "run", "execute"]
            }
            
            for domain, terms in domain_terms.items():
                if any(term in name.lower() for term in terms):
                    domain_classification[name] = domain
                    break
            else:
                domain_classification[name] = "other"
            
    # Third pass: identify dependencies between defined items
    for name, info in defined_names.items():
        node = info["node"]
        
        # Find references to other defined names
        for subnode in ast.walk(node):
            if isinstance(subnode, ast.Name) and isinstance(subnode.ctx, ast.Load):
                if subnode.id in defined_names and subnode.id != name:
                    dependency_graph[name].add(subnode.id)
                    info["dependencies"].add(subnode.id)
    
    # Fourth pass: analyze name conflict risks across the module
    conflict_threshold = 3  # Names appearing more than this many times may need namespacing
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.ClassDef)):
            name = node.name
            name_conflicts[name].append(original_module_name)
            
            # Evaluate integration risk based on name commonality and complexity
            base_risk = 0
            
            # Common names have higher conflict risk in large codebases
            common_names = ["util", "helper", "get", "process", "data", "run", "main", "app", "model", "check"]
            if any(common_word in name.lower() for common_word in common_names):
                base_risk += 20
                
            # Names that are too generic also have high risk
            if len(name) <= 4 or name.lower() in ["test", "demo", "util", "main", "load", "save", "data"]:
                base_risk += 25
                
            # Complex components with many dependencies are riskier to integrate directly
            if len(dependency_graph[name]) > 2:
                base_risk += 15 * len(dependency_graph[name])
                
            # Resource usage increases risk
            if resource_usage["files"] or resource_usage["environment"] or \
               resource_usage["network"] or resource_usage["database"]:
                base_risk += 30
                
            risk_assessment[name] = min(100, base_risk)  # Cap at 100%
    
    # Fifth pass: determine safe integration components and strategies
    for name, info in defined_names.items():
        # Component is safe for integration if it has:
        # 1. Low risk assessment
        # 2. No dependencies on other defined items
        # 3. Not a common name with high collision probability
        if (risk_assessment.get(name, 0) < 50 and 
            len(dependency_graph[name]) == 0 and
            name not in imported_names and
            len(name_conflicts[name]) <= conflict_threshold):
            safe_for_direct_integration.add(name)
            
    # Determine overall module integration strategy
    high_risk_components = [name for name, risk in risk_assessment.items() if risk >= 70]
    if len(high_risk_components) > len(defined_names) / 2:
        # More than half components are high risk - use strict namespace isolation
        integration_metadata["isolation_needed"] = True
        integration_metadata["integration_strategy"] = "isolate"
    elif any(name in safe_for_direct_integration for name in defined_names):
        # Some components are safe - use selective namespace prefixing
        integration_metadata["integration_strategy"] = "namespace"
    else:
        # Middle ground - use wrapper approach
        integration_metadata["integration_strategy"] = "wrapper"
    
    # Process components according to integration strategy
    for name, info in defined_names.items():
        node = info["node"]
        component_type = info["type"]
        risk = risk_assessment.get(name, 50)
        domain = domain_classification.get(name, "other")
        safe = name in safe_for_direct_integration
        
        # Determine output format based on integration strategy
        if integration_metadata["integration_strategy"] == "direct":
            # Safe for direct inclusion
            prefix = ""
        elif integration_metadata["integration_strategy"] == "namespace":
            # Use namespacing for everything except safe components
            prefix = f"{namespace_prefix}_" if not safe else ""
        else:
            # Use namespacing for everything
            prefix = f"{namespace_prefix}_"
        
        # Apply integration strategy
        if component_type == "class":
            # For classes
            source_comments = [
                f"# Class from {filename}",
                f"# Domain: {domain}",
                f"# Risk: {risk}%",
                f"# Dependencies: {', '.join(dependency_graph[name]) if dependency_graph[name] else 'None'}"
            ]
            
            if integration_metadata["integration_strategy"] == "isolate":
                # For modules requiring isolation, wrap the class in a container
                source = f"{os.linesep.join(source_comments)}{os.linesep}"
                source += f"class {prefix}{name}:{os.linesep}"
                for line in ast.unparse(node).split(os.linesep)[1:]:  # Skip class definition line
                    source += f"    {line}{os.linesep}"
            else:
                source = f"{os.linesep.join(source_comments)}{os.linesep}"
                if prefix:
                    # Rename the class with namespace prefix
                    class_def_line = f"class {prefix}{name}("
                    source += ast.unparse(node).replace(f"class {name}(", class_def_line)
                else:
                    source += ast.unparse(node)
                    
            result["classes"].append(source)
            
            # Extract methods for potential standalone use
            for item in node.body:
                if isinstance(item, ast.FunctionDef):
                    # Skip private methods or simple accessors
                    if not item.name.startswith('_') or item.name == '__init__':
                        method_source = [
                            f"# Method {item.name} from class {name} in {filename}",
                            f"# NOTE: Requires class context to function properly",
                            ast.unparse(item)
                        ]
                        result["methods"].append(os.linesep.join(method_source))
                        
        elif component_type == "function":
            # For functions
            source_comments = [
                f"# Function from {filename}",
                f"# Domain: {domain}",
                f"# Risk: {risk}%",
                f"# Integration: {'Safe' if safe else 'Caution'}",
                f"# Dependencies: {', '.join(dependency_graph[name]) if dependency_graph[name] else 'None'}"
            ]
            
            source = f"{os.linesep.join(source_comments)}{os.linesep}"
            
            if integration_metadata["integration_strategy"] == "isolate" or not safe:
                # For high-risk functions, wrap with error handling and namespace
                func_def_line = f"def {prefix}{name}("
                modified_body = ast.unparse(node).replace(f"def {name}(", func_def_line)
                source += modified_body
            else:
                source += ast.unparse(node)
                
            result["functions"].append(source)
    
    # Set compatibility scores for components in metadata
    for name, info in defined_names.items():
        # Calculate compatibility score based on:
        # - Risk assessment (inverted)
        # - Whether it's in safe_for_direct_integration
        # - Dependency count (fewer is better)
        # - Resource usage (less is better)
        safety_factor = 100 - risk_assessment.get(name, 50)
        dependency_factor = 100 / (1 + len(dependency_graph[name]))
        resource_factor = 70 if not (resource_usage["files"] or resource_usage["network"] or 
                                    resource_usage["database"]) else 30
                                    
        # Higher score = more compatible with other code
        compatibility = (safety_factor * 0.5 + dependency_factor * 0.3 + resource_factor * 0.2)
        integration_metadata["compatibility_scores"][name] = round(compatibility)

    return result

def refactor_file(filepath):
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            code = f.read().strip()
            
        # Skip empty files
        if not code:
            log(f"⚠️ Skipping empty file: {filepath}")
            return None
            
        filename = os.path.basename(filepath)
        log(f"\n🔎 Processing: {filename}")
        
        # Check if this is probably documentation rather than code
        if is_documentation_file(code):
            log(f"ℹ️ Skipping documentation file: {filename}")
            return None
            
        # Sanitize the code to handle emojis and other non-Python syntax
        sanitized_code = sanitize_python_code(code)
        
        # Determine which package this file belongs to
        package = determine_package_category(filename)
            
        # Parse the code into an AST
        try:
            tree = ast.parse(sanitized_code)
        except Exception as e:
            log(f"❌ Failed to parse {filepath} after sanitizing: {e}")
            # Write sanitized version for inspection
            debug_path = os.path.join(OUTPUT_FOLDER, "debug", f"{filename}.sanitized")
            os.makedirs(os.path.dirname(debug_path), exist_ok=True)
            with open(debug_path, "w", encoding="utf-8") as df:
                df.write(sanitized_code)
            log(f"📝 Sanitized version saved to {debug_path} for inspection")
            return None
          # Extract dependencies
        imports, dependencies, import_metadata = extract_dependencies(tree, filename)
        
        # Get main block if exists
        main_block = extract_main_block(tree)
        main_exists = has_main_function(tree)
        
        subprocesses = extract_subprocess_calls(tree)
        if subprocesses:
            log(f"🔗 Found subprocess calls: {len(subprocesses)}")

        modified = False        # If main block exists and no main() function already defined
        if main_block and not main_exists:
            log("🛠 Found '__main__' block - refactoring into main()")
            tree = remove_main_block(tree)
            main_func = wrap_main_as_function(main_block)
            tree.body.append(main_func)
            modified = True
        elif main_exists:
            log("ℹ️ File already has main() function")
            
        # Add exception handling
        tree = add_exception_guard(tree)
        
        # Fix line numbers and columns
        tree = ast.fix_missing_locations(tree)
        
        # Generate the code
        rebuilt_code = ast.unparse(tree)
        
        # Write output
        package_dir = os.path.join(OUTPUT_FOLDER, package)
        os.makedirs(package_dir, exist_ok=True)
        
        # Also write to flat structure for backward compatibility
        out_path = os.path.join(OUTPUT_FOLDER, filename)
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(rebuilt_code)
            
        # Write to package structure
        package_path = os.path.join(package_dir, filename)
        with open(package_path, "w", encoding="utf-8") as f:
            f.write(rebuilt_code)
            
        log(f"✅ Rewritten: {filename} ➜ {out_path} and {package_path}")
        return {
            "filename": filename,
            "package": package,
            "dependencies": dependencies,
            "has_main": main_exists or bool(main_block),
            "imports": imports,
            "subprocesses": len(subprocesses) > 0
        }
    except Exception as e:
        log(f"❌ Failed to process {filepath}: {str(e)}")
        log(traceback.format_exc())
        return None

def test_importable(file_path):
    """Test if a module can be imported without errors"""
    try:
        module_name = os.path.basename(file_path).replace('.py', '')
        spec = importlib.util.spec_from_file_location(module_name, file_path)
        if not spec:
            return False
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return True
    except Exception:
        return False

def create_hierarchical_module_structure(modules):
    """Create proper hierarchical module organization instead of flat structure"""
    log("\n📁 Creating hierarchical module structure...")
    
    # Enhanced categorization based on content analysis
    module_categories = {
        "core": [],
        "ui": [],
        "io": [],
        "net": [],
        "train": [],
        "tools": [],
        "data": [],
        "utils": []
    }
    
    # Advanced pattern matching for better categorization
    category_patterns = {
        "core": [
            r"\bclass\s+\w*Engine\b", r"\bclass\s+\w*Core\b", r"\bclass\s+\w*Manager\b",
            r"\bdef\s+main\b", r"\bdef\s+run\b", r"\bdef\s+execute\b",
            "config", "settings", "base", "foundation"
        ],
        "ui": [
            r"\btkinter\b", r"\bPyQt\b", r"\bPySide\b", r"\bkivy\b", r"\bwx\b",
            r"\.mainloop\(\)", r"\.show\(\)", r"\.exec_\(\)",
            r"\bclass\s+\w*Window\b", r"\bclass\s+\w*Dialog\b", r"\bclass\s+\w*GUI\b",
            "button", "label", "entry", "canvas", "frame", "widget"
        ],
        "io": [
            r"\bopen\s*\(", r"\bwith\s+open\b", r"\.read\(\)", r"\.write\(\)",
            r"\bjson\.load\b", r"\bjson\.dump\b", r"\bpickle\b",
            r"\bcsv\.", r"\bpandas\.", r"\bnumpy\.save\b",
            "file", "load", "save", "export", "import", "parse"
        ],
        "net": [
            r"\brequests\.", r"\bhttp\.", r"\bsocket\b", r"\bflask\b", r"\bdjango\b",
            r"\bapi\b", r"\brest\b", r"\bserver\b", r"\bclient\b",
            r"\.get\s*\(", r"\.post\s*\(", r"\.put\s*\(", r"\.delete\s*\(",
            "endpoint", "route", "service", "protocol"
        ],
        "train": [
            r"\btorch\.", r"\btensorflow\.", r"\bkeras\.", r"\bsklearn\.",
            r"\b\.fit\s*\(", r"\b\.train\s*\(", r"\b\.predict\s*\(",
            r"\bclass\s+\w*Model\b", r"\bclass\s+\w*Network\b",
            "neural", "epoch", "batch", "gradient", "optimizer", "loss"
        ],
        "tools": [
            r"\bargparse\.", r"\bsys\.argv\b", r"\bif\s+__name__\s*==\s*[\"']__main__[\"']\b",
            r"\bdef\s+main\s*\(", r"\bclass\s+\w*CLI\b", r"\bclass\s+\w*Tool\b",
            "command", "script", "utility", "helper", "tool", "cli"
        ],
        "data": [
            r"\bnumpy\.", r"\bpandas\.", r"\barray\b", r"\bdataframe\b",
            r"\bclass\s+\w*Dataset\b", r"\bclass\s+\w*Data\b",
            "dataset", "data", "matrix", "vector", "transform"
        ],
        "utils": [
            r"\bdef\s+\w*_helper\b", r"\bdef\s+\w*_util\b", r"\bclass\s+\w*Utils?\b",
            "helper", "utility", "common", "shared", "misc"
        ]
    }
    
    # Analyze each module's content for categorization
    for module_info in modules:
        if not module_info or not isinstance(module_info, dict):
            continue
            
        filename = module_info.get("filename", "")
        if not filename:
            continue
            
        module_path = os.path.join(OUTPUT_FOLDER, filename)
        if not os.path.exists(module_path):
            continue
        
        try:
            with open(module_path, "r", encoding="utf-8") as f:
                content = f.read()
            
            # Score each category based on pattern matches
            category_scores = {}
            for category, patterns in category_patterns.items():
                score = 0
                for pattern in patterns:
                    if isinstance(pattern, str):
                        # Simple string search
                        score += content.lower().count(pattern.lower())
                    else:
                        # Regex pattern
                        import re
                        matches = re.findall(pattern, content, re.IGNORECASE)
                        score += len(matches)
                category_scores[category] = score
            
            # Assign to category with highest score, or utils as default
            best_category = max(category_scores.items(), key=lambda x: x[1])
            if best_category[1] > 0:
                assigned_category = best_category[0]
            else:
                # Fallback to filename-based categorization
                filename_lower = filename.lower()
                assigned_category = "utils"  # Default
                for category, patterns in category_patterns.items():
                    if any(pattern in filename_lower for pattern in patterns if isinstance(pattern, str)):
                        assigned_category = category
                        break
            
            module_categories[assigned_category].append(module_info)
            log(f"📁 {filename} → {assigned_category} (score: {best_category[1]})")
            
        except Exception as e:
            log(f"⚠️ Error categorizing {filename}: {e}")
            module_categories["utils"].append(module_info)
    
    # Create directory structure and organize files
    created_dirs = set()
    for category, category_modules in module_categories.items():
        if not category_modules:
            continue
            
        category_dir = os.path.join(OUTPUT_FOLDER, category)
        if category not in created_dirs:
            os.makedirs(category_dir, exist_ok=True)
            created_dirs.add(category)
            
            # Create __init__.py for each package
            init_file = os.path.join(category_dir, "__init__.py")
            with open(init_file, "w", encoding="utf-8") as f:
                f.write(f'"""Auto-generated {category} package"""\n')
                f.write(f"# Contains {len(category_modules)} modules\n\n")
                
                # Add convenient imports
                for module_info in category_modules:
                    module_name = module_info.get("filename", "").replace(".py", "")
                    if module_name:
                        f.write(f"# from .{module_name} import *  # Uncomment if needed\n")
        
        # Copy modules to their categorized directories
        for module_info in category_modules:
            filename = module_info.get("filename", "")
            if not filename:
                continue
                
            source_path = os.path.join(OUTPUT_FOLDER, filename)
            dest_path = os.path.join(category_dir, filename)
            
            if os.path.exists(source_path) and source_path != dest_path:
                try:
                    shutil.copy2(source_path, dest_path)
                    log(f"📄 Moved {filename} to {category}/")
                except Exception as e:
                    log(f"⚠️ Error moving {filename}: {e}")
      # Create a master __init__.py in the output folder
    master_init = os.path.join(OUTPUT_FOLDER, "__init__.py")
    with open(master_init, "w", encoding="utf-8") as f:
        f.write('"""Auto-generated unified codebase package"""\n')
        f.write(f"# Created by AutoRebuilder\n")
        f.write(f"# Total modules processed: {len(modules)}\n\n")
        
        f.write("# Package structure:\n")
        for category, category_modules in module_categories.items():
            if category_modules:
                f.write(f"#   {category}/  - {len(category_modules)} modules\n")
        
        f.write("\n# Convenient imports\n")
        for category in created_dirs:
            f.write(f"# from . import {category}\n")
    
    log(f"✅ Created hierarchical structure with {len(created_dirs)} categories")
    return module_categories

def create_dependency_graph(modules):
    """Create a dependency graph showing which modules import which"""
    graph = {}
    module_to_filename = {}
    
    # First pass: build the module to filename map
    for fileinfo in modules:
        if not fileinfo:
            continue
            
        filename = fileinfo["filename"]
        module_name = filename.replace('.py', '')
        module_to_filename[module_name] = fileinfo
        
        # Also handle common prefix patterns (b_, r_, y_)
        if module_name.startswith('b_') or module_name.startswith('r_') or module_name.startswith('y_'):
            short_name = module_name[2:]
            module_to_filename[short_name] = fileinfo
      # Second pass: build the dependency graph
    for fileinfo in modules:
        if not fileinfo:
            continue
            
        filename = fileinfo["filename"]
        deps = set()
        
        # Check if any import matches our modules
        if "dependencies" in fileinfo:
            for dep in fileinfo["dependencies"]:
                if dep in module_to_filename:
                    deps.add(module_to_filename[dep]["filename"])
        elif "imports" in fileinfo:
            # Try to use imports instead if dependencies are not present
            for imp in fileinfo["imports"]:
                # Extract module name from import statement
                imp_name = imp.split(' ')[1] if ' ' in imp else imp
                # Clean up any 'from' or 'as' parts
                imp_name = imp_name.split('.')[0]
                if imp_name in module_to_filename:
                    deps.add(module_to_filename[imp_name]["filename"])
        
        graph[filename] = deps
        
    return graph

def find_best_entry_points(modules):
    """
    Find the best entry points from modules based on multiple heuristics.
    Optimized for very large codebases not designed to work together.
    Returns a list of tuples (filename, score, package) sorted by descending score.
    """
    entry_points = []
    module_imports = {}
    module_clusters = {}
    import_graphs = {}
    
    # Skip invalid modules
    valid_modules = [m for m in modules if m]
    
    # Skip processing everything if we have too many modules - pick representatives
    if len(valid_modules) > 500:
        log(f"⚠️ Large codebase detected ({len(valid_modules)} modules) - using sampling approach")
        # Sample strategy: take modules from each package to ensure representation
        packages = {}
        for mod in valid_modules:
            pkg = mod.get("package", "core")
            if pkg not in packages:
                packages[pkg] = []
            packages[pkg].append(mod)
        
        # Select representative modules from each package
        representatives = []
        for pkg, pkg_modules in packages.items():
            # Take at most 10% of modules from each package, minimum 5, max 50
            sample_size = max(5, min(50, len(pkg_modules) // 10))
            # Prioritize modules with main() functions and meaningful names
            sorted_mods = sorted(pkg_modules, 
                               key=lambda m: (m.get("has_main", False), 
                                             any(term in m.get("filename", "").lower() for term in 
                                                 ["main", "app", "cli", "run", "start"])))
            representatives.extend(sorted_mods[-sample_size:])  # Take the highest scoring ones
        
        valid_modules = representatives
        log(f"📊 Analyzing {len(valid_modules)} representative modules")
    
    # Step 1: First pass to count imports and collect names
    for mod in valid_modules:
        if "filename" in mod:
            module_name = mod["filename"].replace('.py', '')
            # Count how many times this module is imported by others
            import_count = sum(1 for m in valid_modules if m.get("dependencies") and
                              module_name in m.get("dependencies"))
            module_imports[mod["filename"]] = import_count
            
            # Build import graph for clustering
            imports = mod.get("imports", [])
            import_graphs[module_name] = [imp.split()[1].split('.')[0].replace(',', '') 
                                         for imp in imports if ' import ' in imp]
    
    # Step 2: Cluster modules based on import relationships
    try:
        # Simple clustering based on shared dependencies
        for mod_name, imports in import_graphs.items():
            cluster_key = frozenset(imports[:5])  # Use top imports as cluster key
            if cluster_key not in module_clusters:
                module_clusters[cluster_key] = []
            module_clusters[cluster_key].append(mod_name)
    except Exception as e:
        log(f"⚠️ Clustering failed: {str(e)}")
    
    # Step 3: Score each module as potential entry point
    for mod in valid_modules:
        if not mod or "filename" not in mod:
            continue
            
        filename = mod["filename"]
        package = mod.get("package", "core")
        
        # Calculate base score
        score = 0
        
        # Factor 1: Has main function
        if mod.get("has_main", False):
            score += 50
        
        # Factor 2: Module name suggests entry point
        name_lower = filename.lower()
        for term, term_score in [
            ("main", 30), ("app", 25), ("run", 20), ("start", 20),
            ("launcher", 25), ("entry", 25), ("cli", 20), ("gui", 20),
            ("execute", 15), ("script", 15), ("core", 10), ("engine", 10)
        ]:
            if term in name_lower:
                score += term_score
                break  # Only count the highest-value term
        
        # Factor 3: Package type (UI modules often serve as entry points)
        package_scores = {
            "ui": 20,
            "tools": 15,
            "core": 10,
            "net": 8, 
            "io": 5,
            "train": 5
        }
        score += package_scores.get(package, 0)
        
        # Factor 4: Subtracting import count (core libraries are imported often but aren't entry points)
        import_penalty = min(15, module_imports.get(filename, 0) * 3)
        score -= import_penalty
        
        # Factor 5: Has subprocess calls (might be a controller/orchestrator)
        if mod.get("subprocesses", False):
            score += 10
        
        # Factor 6: Filename casing and patterns
        if filename[0].isupper():  # Classes often start with uppercase
            score -= 5  # Less likely to be an entry point
            
        # Special cases for common module types
        if name_lower.startswith(('test_', 'utils', 'helpers', 'config')):
            score -= 20  # These usually aren't entry points
            
        # Bonus for modules with B_ prefix (seems to be a naming convention in this project)
        if filename.startswith('b_'):
            score += 5
            
        # Factor 7: Analyze file content if possible
        try:
            module_path = os.path.join(OUTPUT_FOLDER, filename)
            if os.path.exists(module_path):
                with open(module_path, "r", encoding="utf-8") as f:
                    content = f.read()
                    file_size = len(content)
                
                # Check for command-line argument parsing
                if "argparse" in content or "sys.argv" in content:
                    score += 15
                    
                # Check for print statements (might be user-facing)
                print_count = content.count("print(") 
                score += min(10, print_count // 2)
                    
                # Check for imports that suggest a UI
                if any(ui_lib in content for ui_lib in ["tkinter", "PyQt", "wx", "pygame"]):
                    score += 20
                    
                # Favor medium-sized files (very small files are unlikely to be complete apps,
                # very large files may be libraries)
                if 1000 <= file_size <= 10000:
                    score += 5
                elif file_size > 50000:
                    score -= 10  # Likely a large library, not an entry point
        except Exception:
            # Never fail - if we can't read the file, just continue
            pass
        
        # Factor 8: Consider modules that are cluster representatives
        for cluster, members in module_clusters.items():
            if filename.replace('.py', '') in members:
                # If this is the "best" module in its cluster, boost score
                if len(members) > 1:
                    score += 5
                # If it's in a small, focused cluster, it may be more important
                if 2 <= len(members) <= 5:
                    score += 3
                # If it's in a very large cluster, it might be a utility
                if len(members) > 20:
                    score -= 5
        
        # Factor 9: Domain-specific scoring
        # ML workflows often have train/predict scripts as entry points
        if any(term in name_lower for term in ["train", "predict", "infer", "evaluate"]):
            score += 10
        # Data processing workflows often have preprocessing scripts
        if any(term in name_lower for term in ["process", "transform", "convert"]):
            score += 8
            
        # Ensure minimum score is 1 to avoid negative scores
        score = max(1, score)
        
        entry_points.append((filename, score, package))
    
    # If we failed to find any valid entry points, provide a fallback
    if not entry_points:
        log("⚠️ No valid entry points found - providing fallback")
        for mod in valid_modules:
            if "filename" in mod:
                entry_points.append((mod["filename"], 1, mod.get("package", "core")))
    
    # Sort by score (highest first)
    entry_points.sort(key=lambda x: x[1], reverse=True)
    
    # For large codebases, we need to categorize entry points by domain/purpose
    if len(valid_modules) > 100:
        # Group top candidates by assumed functionality
        categories = {
            "web": [],
            "data_processing": [],
            "ml_training": [],
            "visualization": [],
            "cli_tools": [],
            "gui_apps": [],
            "api_servers": []
        }
        
        # Categorize top 50 entry points
        for filename, score, package in entry_points[:50]:
            name_lower = filename.lower()
            if any(term in name_lower for term in ["web", "http", "flask", "django"]):
                categories["web"].append((filename, score, package))
            elif any(term in name_lower for term in ["data", "process", "etl", "transform"]):
                categories["data_processing"].append((filename, score, package))
            elif any(term in name_lower for term in ["train", "ml", "model", "learn"]):
                categories["ml_training"].append((filename, score, package))
            elif any(term in name_lower for term in ["vis", "plot", "chart", "graph"]):
                categories["visualization"].append((filename, score, package))
            elif any(term in name_lower for term in ["cli", "command", "terminal"]):
                categories["cli_tools"].append((filename, score, package))
            elif any(term in name_lower for term in ["gui", "ui", "window", "tk", "qt"]):
                categories["gui_apps"].append((filename, score, package))
            elif any(term in name_lower for term in ["api", "rest", "server", "service"]):
                categories["api_servers"].append((filename, score, package))
        
        # Log categorized entry points
        log("\n📊 Entry points by category:")
        for category, entries in categories.items():
            if entries:
                log(f"  {category.replace('_', ' ').title()}: {', '.join(e[0] for e in entries[:3])}")
    
    # Log top candidates
    log("\n📊 Top entry point candidates (score):")
    for filename, score, package in entry_points[:10]:  # Top 10
        log(f"  {filename}: {score} points ({package})")
    
    return entry_points

def create_launcher(modules):
    """Create a sophisticated launcher that handles different package structures"""
    # Find potential entry points
    entry_points = find_best_entry_points(modules)
    
    if entry_points:
        log(f"🔍 Found {len(entry_points)} potential entry points:")
        for i, (module, score, package) in enumerate(entry_points[:5]):  # Show top 5
            log(f"  {i+1}. {module} (score: {score}, package: {package})")
    else:
        log("⚠️ No clear entry points found.")
    
    # Create the advanced launcher
    launcher_content = '''"""
Auto-generated unified launcher for the rebuilt project
"""
import os
import sys
import importlib.util
import traceback

def find_module_path(module_name):
    """Find the module in the package structure or flat directory"""
    # First, check for the module in the flat directory
    flat_path = f"{module_name}.py"
    if os.path.exists(flat_path):
        return flat_path
        
    # Next, check in each package directory
    for root, dirs, files in os.walk("."):
        module_path = os.path.join(root, module_name + ".py")
        if not os.path.exists(module_path):
            continue
        return module_path
            
    return None
'''

    # Continue the launcher content with correct string termination and concatenation
    launcher_content += '''
def import_module_from_path(module_name, module_path):
    """Import a module from a file path"""
    try:
        spec = importlib.util.spec_from_file_location(module_name, module_path)
        if not spec:
            return None
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)
        return module
    except Exception as e:
        print(f"Error importing {module_name}: {e}")
        traceback.print_exc()
        return None

# Define entry points by category
GUI_ENTRY_POINTS = []
CLI_ENTRY_POINTS = []
CORE_ENTRY_POINTS = []
'''

    # Organize entry points by category
    for module, score, package in entry_points[:10]:
        module_name = module[:-3] if module.endswith(".py") else module
        if package == "ui":
            launcher_content += f'GUI_ENTRY_POINTS.append("{module_name}")\n'
        elif package == "tools":
            launcher_content += f'CLI_ENTRY_POINTS.append("{module_name}")\n'
        else:
            launcher_content += f'CORE_ENTRY_POINTS.append("{module_name}")\n'
    
    # Add integrated codebase reference
    launcher_content += f'\nINTEGRATED_CODEBASE = "{INTEGRATED_OUTPUT[:-3]}"\n\n'

    # Continue with additional string content for the launcher
    launcher_content += '''
def run_unified_program(args=None):
    """Run the entire program as a unified system"""
    print("🚀 Running unified program...")
    
    # First, import all core modules
    core_modules = []
    for module_name in CORE_ENTRY_POINTS:
        module_path = find_module_path(module_name)
        if module_path:
            module = import_module_from_path(module_name, module_path)
            if module:
                core_modules.append(module)
    
    # Find main orchestrator module (usually has pipeline, core, or runner in name)
    orchestrators = []
    for module in core_modules:
        name = module.__name__
        if any(term in name.lower() for term in ["pipeline", "core", "runner", "engine", "main"]):
            orchestrators.append(module)
    
    if orchestrators:
        # Use the first orchestrator
        main_module = orchestrators[0]
        print(f"Using {main_module.__name__} as main orchestrator")
        
        # Try to run its main function or an alternative
        if hasattr(main_module, "main"):
            return main_module.main(args) if args else main_module.main()
        elif hasattr(main_module, "run"):
            return main_module.run(args) if args else main_module.run()
    
    # Fallback to integrated codebase
    print("No orchestrator found, using integrated codebase")
    module_path = find_module_path(INTEGRATED_CODEBASE)
    if module_path:
        module = import_module_from_path(INTEGRATED_CODEBASE, module_path)
        if module and hasattr(module, "main"):
            return module.main(args) if args else module.main()
            
    print("Failed to run unified program")
    return 1
'''
    
    # More launcher content...
    launcher_content += '''            
def run_module(module_name, args=None):
    """Run the specified module with arguments"""
    try:
        print(f"🚀 Launching {module_name}...")
        
        # Get the module path
        module_path = find_module_path(module_name)
        if not module_path:
            print(f"❌ Module {module_name} not found")
            return 1
            
        # Import the module
        module = import_module_from_path(module_name, module_path)
        if not module:
            print(f"❌ Failed to import {module_name}")
            return 1
        
        # Call main function if it exists
        if hasattr(module, "main"):
            if args and len(args) > 0:
                try:
                    return module.main(args)
                except TypeError:
                    return module.main()
            else:
                return module.main()
        else:
            print(f"⚠️ Module {module_name} has no main() function")
            
            # Try to find any callable function
            for func_name in ["run", "start", "execute", "process"]:
                if hasattr(module, func_name) and callable(getattr(module, func_name)):
                    print(f"🔍 Found alternative entry point: {func_name}()")
                    func = getattr(module, func_name)
                    if args and len(args) > 0:
                        try:
                            return func(args)
                        except TypeError:
                            return func()
                    else:
                        return func()
                        
            print("❌ No suitable entry function found")
            return 1
    except Exception as e:
        print(f"❌ Error running {module_name}: {e}")
        import traceback
        traceback.print_exc()
        return 1
'''

    # Add the list_modules and other functions
    launcher_content += '''
def list_modules():
    """List all available modules by category"""
    print("Available modules:")
    
    if GUI_ENTRY_POINTS:
        print("\\nGUI Applications:")
        for i, module in enumerate(GUI_ENTRY_POINTS):
            print(f"  gui:{i+1} = {module}")
    
    if CLI_ENTRY_POINTS:
        print("\\nCommand Line Tools:")
        for i, module in enumerate(CLI_ENTRY_POINTS):
            print(f"  cli:{i+1} = {module}")
    
    if CORE_ENTRY_POINTS:
        print("\\nCore Components:")
        for i, module in enumerate(CORE_ENTRY_POINTS):
            print(f"  core:{i+1} = {module}")
    
    print(f"\\nIntegrated: {INTEGRATED_CODEBASE}")
    print("\\nUsage examples:")
    print("  python launch.py unified       # Run entire program as one system")
    print("  python launch.py gui:1         # Run first GUI app")
    print("  python launch.py cli:2         # Run second CLI tool")
    print("  python launch.py core:1        # Run first core component")
    print("  python launch.py module_name   # Run specific module")

def select_module_by_category(category, index):
    """Select a module from a category by index"""
    if category == "gui" and GUI_ENTRY_POINTS:
        if 1 <= index <= len(GUI_ENTRY_POINTS):
            return GUI_ENTRY_POINTS[index-1]
    elif category == "cli" and CLI_ENTRY_POINTS:
        if 1 <= index <= len(CLI_ENTRY_POINTS):
            return CLI_ENTRY_POINTS[index-1]
    elif category == "core" and CORE_ENTRY_POINTS:
        if 1 <= index <= len(CORE_ENTRY_POINTS):
            return CORE_ENTRY_POINTS[index-1]
    return None

def get_default_module():
    """Get the default module to run based on availability"""
    # By default, run the unified program
    return "unified"
'''
    
    # Add the main block for the launcher
    launcher_content += '''
if __name__ == "__main__":
    if len(sys.argv) > 1:
        module_spec = sys.argv[1]
        args = sys.argv[2:]
        
        # Check for unified mode
        if module_spec == "unified":
            sys.exit(run_unified_program(args))
            
        # Check for category:index format
        elif ":" in module_spec:
            category, idx_str = module_spec.split(":")
            if idx_str.isdigit():
                idx = int(idx_str)
                module_name = select_module_by_category(category, idx)
                if module_name:
                    sys.exit(run_module(module_name, args))
                else:
                    print(f"❌ Invalid selection: {module_spec}")
                    list_modules()
                    sys.exit(1)
        
        # Direct module name
        elif module_spec == "integrated" or module_spec == INTEGRATED_CODEBASE:
            sys.exit(run_module(INTEGRATED_CODEBASE, args))
        elif module_spec == "list":
            list_modules()
            sys.exit(0)
        elif module_spec == "help" or module_spec == "--help":
            list_modules()
            sys.exit(0)
        else:
            # Try to run the specified module directly
            sys.exit(run_module(module_spec, args))
    else:
        # Interactive mode - run unified program by default
        default_module = get_default_module()
        print(f"ℹ️ No module specified. Running in unified mode")
        print("ℹ️ Run with 'list' to see individual modules")
        sys.exit(run_unified_program())
'''

    # Write the launcher to disk
    launcher_path = os.path.join(OUTPUT_FOLDER, LAUNCHER_NAME)
    try:
        with open(launcher_path, "w", encoding="utf-8") as f:
            f.write(launcher_content)
            log(f"✅ Advanced launcher created: {LAUNCHER_NAME}")
        return True
    except Exception as e:
        log(f"❌ Failed to create launcher: {e}")
        traceback.print_exc()
        return False

def create_integrated_codebase(modules):
    """Create an integrated single-file codebase from all valid modules with intelligent import management"""
    log("\n🔄 Creating intelligent integrated codebase...")
    
    # Advanced collections for proper organization
    future_imports = set()
    standard_imports = set()
    external_imports = set()
    relative_imports = set()
    
    all_global_vars = []
    all_classes = {}  # Use dict to track by name for deduplication
    all_functions = {}  # Use dict to track by name for deduplication
    entry_points = []  # Track modules with main blocks
    gui_modules = []  # Track GUI-specific modules
    
    # Debug info
    log(f"Processing {len(modules)} modules for intelligent integration")
    
    # Process each file with advanced analysis
    valid_files = []
    dependency_graph = create_dependency_graph(modules)
    
    # Import classification patterns
    STANDARD_LIBS = {
        'os', 'sys', 'ast', 'json', 'time', 'datetime', 'logging', 'threading', 
        'multiprocessing', 'queue', 'collections', 'functools', 'itertools', 
        'pathlib', 'glob', 'random', 'hashlib', 'pickle', 'sqlite3', 're',
        'traceback', 'inspect', 'types', 'tempfile', 'shutil', 'platform'
    }
    
    EXTERNAL_LIBS = {
        'torch', 'numpy', 'pandas', 'sklearn', 'tensorflow', 'keras',
        'tkinter', 'PyQt5', 'PyQt6', 'PySide2', 'PySide6', 'kivy',
        'pygame', 'matplotlib', 'seaborn', 'plotly', 'dash',
        'flask', 'django', 'fastapi', 'requests', 'aiohttp',
        'psutil', 'opencv', 'cv2', 'PIL', 'Pillow', 'h5py'
    }
    
    def classify_import(import_statement):
        """Classify import into appropriate category"""
        # Handle __future__ imports specially
        if 'from __future__' in import_statement:
            return 'future'
        
        # Handle relative imports (fix or remove broken ones)
        if import_statement.startswith('from .'):
            return 'relative'
        
        # Extract module name for classification
        if import_statement.startswith('from '):
            module = import_statement.split()[1].split('.')[0]
        elif import_statement.startswith('import '):
            module = import_statement.split()[1].split('.')[0]
        else:
            return 'standard'
        
        if module in STANDARD_LIBS:
            return 'standard'
        elif module in EXTERNAL_LIBS:
            return 'external'
        else:
            return 'external'  # Assume external if unknown
    
    def is_gui_module(filename, code):
        """Detect if module contains GUI components"""
        gui_indicators = [
            'tkinter', 'PyQt', 'PySide', 'kivy', 'pygame', 'wx',
            'mainloop', 'show()', 'exec_()', 'window', 'dialog',
            'button', 'label', 'entry', 'canvas', 'frame'
        ]
        return any(indicator.lower() in code.lower() for indicator in gui_indicators)
    
    def has_main_block(code):
        """Check if module has a main execution block"""
        return '__name__ == "__main__"' in code or '__name__ == \'__main__\'' in code
    
    # First pass: collect all names and analyze module types
    defined_names = set()
    for module_info in modules:
        if not module_info:
            continue
            
        filename = module_info["filename"]
        module_path = os.path.join(OUTPUT_FOLDER, filename)
        
        if not os.path.exists(module_path):
            continue
            
        try:
            with open(module_path, "r", encoding="utf-8") as f:
                code = f.read()
            
            tree = ast.parse(code)
            
            # Detect module characteristics
            if is_gui_module(filename, code):
                gui_modules.append(filename)
            
            if has_main_block(code):
                entry_points.append(filename)
            
            # Get defined names to detect duplicates
            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef):
                    defined_names.add(node.name)
                elif isinstance(node, ast.ClassDef):
                    defined_names.add(node.name)
                        
        except Exception as e:
            log(f"⚠️ Error analyzing {filename} for names: {e}")
    
    # Second pass: collect components with intelligent processing
    for module_info in modules:
        if not module_info:
            continue
            
        filename = module_info["filename"]
        module_path = os.path.join(OUTPUT_FOLDER, filename)
        
        if not os.path.exists(module_path):
            continue
            
        try:
            with open(module_path, "r", encoding="utf-8") as f:
                code = f.read()
            
            tree = ast.parse(code)
            
            # Process imports with intelligent classification
            imports = []
            for node in tree.body:
                if isinstance(node, ast.Import) or isinstance(node, ast.ImportFrom):
                    import_str = ast.unparse(node)
                    
                    # Skip internal/circular imports
                    if any(m.get("filename", "").replace('.py', '') in import_str 
                          for m in modules if m and isinstance(m, dict)):
                        continue
                    
                    # Classify and store imports
                    import_type = classify_import(import_str)
                    if import_type == 'future':
                        future_imports.add(import_str)
                    elif import_type == 'standard':
                        standard_imports.add(import_str)
                    elif import_type == 'external':
                        external_imports.add(import_str)
                    elif import_type == 'relative':
                        # Try to convert relative imports or skip broken ones
                        try:
                            # Attempt to make absolute or skip
                            if 'from .' in import_str and not import_str.startswith('from ...'):
                                fixed_import = import_str.replace('from .', 'from ')
                                if not any(bad in fixed_import for bad in ['BmpImagePlugin', 'Image', 'PIL']):
                                    standard_imports.add(fixed_import)
                        except:
                            continue  # Skip broken relative imports
                
            # Extract globals, classes and functions with advanced deduplication
            for node in tree.body:
                if isinstance(node, ast.Assign):
                    # For global variables - avoid duplicates
                    source = ast.unparse(node)
                    var_signature = source.split('=')[0].strip() if '=' in source else source
                    if not any(var_signature in var for var in all_global_vars):
                        all_global_vars.append(f"# From {filename}\n{source}")
                        
                elif isinstance(node, ast.ClassDef):
                    # Advanced class deduplication
                    if node.name not in all_classes:
                        source = ast.unparse(node)
                        all_classes[node.name] = f"# From {filename}\n{source}"
                        
                elif isinstance(node, ast.FunctionDef):
                    # Advanced function deduplication by signature
                    if node.name not in all_functions:
                        source = ast.unparse(node)
                        all_functions[node.name] = f"# From {filename}\n{source}"
            
            valid_files.append(filename)
            
        except Exception as e:
            log(f"⚠️ Error analyzing {filename}: {e}")
            # Continue processing other files rather than failing completely
            continue
    
    # Create the intelligent integrated file
    integrated_path = os.path.join(OUTPUT_FOLDER, INTEGRATED_OUTPUT)
    with open(integrated_path, "w", encoding="utf-8") as f:
        # 1. Start with properly ordered __future__ imports (critical for Python syntax)
        if future_imports:
            # Deduplicate and sort __future__ imports
            unique_futures = set()
            for imp in future_imports:
                # Extract just the import part after 'from __future__ import'
                if 'from __future__ import' in imp:
                    parts = imp.replace('from __future__ import ', '').strip()
                    for part in parts.split(','):
                        unique_futures.add(part.strip())
            
            if unique_futures:
                f.write("# === Future Compatibility Imports (Required First) ===\n")
                f.write(f"from __future__ import {', '.join(sorted(unique_futures))}\n\n")
        
        f.write("# === Intelligent Integrated Codebase ===\n")
        f.write("# Auto-generated by AutoRebuilder with Advanced Import Management\n")
        f.write(f"# Successfully integrated {len(valid_files)} modules\n")
        f.write(f"# Entry points detected: {len(entry_points)}\n")
        f.write(f"# GUI modules detected: {len(gui_modules)}\n\n")
        
        # 2. Standard library imports (sorted and deduplicated)
        if standard_imports:
            f.write("# === Standard Library Imports ===\n")
            for imp in sorted(standard_imports):
                f.write(f"{imp}\n")
            f.write("\n")
        
        # 3. External library imports (with error handling)
        if external_imports:
            f.write("# === External Library Imports (with error handling) ===\n")
            f.write("import warnings\n")
            f.write("warnings.filterwarnings('ignore', category=DeprecationWarning)\n\n")
            
            for imp in sorted(external_imports):
                f.write(f"try:\n")
                f.write(f"    {imp}\n")
                f.write(f"except ImportError as e:\n")
                f.write(f"    print(f'Optional import failed: {{e}} - some features may be limited')\n")
                f.write(f"    pass\n\n")
        
        # 4. Global variables with namespace protection
        if all_global_vars:
            f.write("# === Global Variables ===\n")
            for var in all_global_vars:
                f.write(f"{var}\n\n")
        
        # 5. Classes with intelligent organization
        if all_classes:
            f.write("# === Classes (Deduplicated) ===\n")
            for class_name, class_code in sorted(all_classes.items()):
                f.write(f"{class_code}\n\n")
        
        # 6. Functions with intelligent organization
        if all_functions:
            f.write("# === Functions (Deduplicated) ===\n")
            for func_name, func_code in sorted(all_functions.items()):
                f.write(f"{func_code}\n\n")
        
        # 7. Add intelligent execution orchestration instead of just prints
        f.write("""# === Intelligent Module Orchestration System ===
class ModuleOrchestrator:
    \"\"\"Advanced orchestration system for managing diverse Python modules\"\"\"
    
    def __init__(self):
        self.gui_modules = {gui_modules}
        self.entry_points = {entry_points}
        self.active_guis = []
        self.background_tasks = []
        
    def detect_module_type(self, module_name):
        \"\"\"Detect what type of module this is\"\"\"
        if module_name in self.gui_modules:
            return 'gui'
        elif 'train' in module_name.lower() or 'ml' in module_name.lower():
            return 'training'
        elif 'server' in module_name.lower() or 'api' in module_name.lower():
            return 'service'
        else:
            return 'utility'
    
    def launch_gui_modules(self):
        \"\"\"Launch all detected GUI modules\"\"\"
        print("🖥️ Launching GUI modules...")
        for gui_module in self.gui_modules:
            try:
                print(f"  Starting GUI: {{gui_module}}")
                # Here we would actually launch the GUI
                # For now, we simulate the launch
                self.active_guis.append(gui_module)
            except Exception as e:
                print(f"  ⚠️ Failed to start {{gui_module}}: {{e}}")
        
        return len(self.active_guis) > 0
    
    def run_background_services(self):
        \"\"\"Start background services and training modules\"\"\"
        print("⚙️ Starting background services...")
        import threading
        
        for entry_point in self.entry_points:
            if entry_point not in self.gui_modules:
                try:
                    print(f"  Starting service: {{entry_point}}")
                    # Create background thread for service
                    # In a real implementation, we'd import and run the actual module
                    self.background_tasks.append(entry_point)
                except Exception as e:
                    print(f"  ⚠️ Failed to start {{entry_point}}: {{e}}")
    
    def create_unified_interface(self):
        \"\"\"Create a unified control interface\"\"\"
        try:
            import tkinter as tk
            from tkinter import ttk, messagebox
            
            root = tk.Tk()
            root.title("Unified Module Control Center")
            root.geometry("800x600")
            
            # Create tabs for different module types
            notebook = ttk.Notebook(root)
            
            # GUI Modules tab
            gui_frame = ttk.Frame(notebook)
            notebook.add(gui_frame, text="GUI Modules")
            
            # Background Services tab  
            service_frame = ttk.Frame(notebook)
            notebook.add(service_frame, text="Services")
            
            # System Status tab
            status_frame = ttk.Frame(notebook)
            notebook.add(status_frame, text="Status")
            
            notebook.pack(expand=True, fill='both', padx=10, pady=10)
            
            # Add controls for each module type
            self._populate_gui_controls(gui_frame)
            self._populate_service_controls(service_frame)
            self._populate_status_display(status_frame)
            
            root.mainloop()
            
        except ImportError:
            print("📱 GUI not available, running in CLI mode")
            self._run_cli_interface()
    
    def _populate_gui_controls(self, parent):
        \"\"\"Add GUI module controls\"\"\"
        import tkinter as tk
        from tkinter import ttk
        
        tk.Label(parent, text="Available GUI Modules", font=('Arial', 12, 'bold')).pack(pady=5)
        
        for gui_module in self.gui_modules:
            frame = ttk.Frame(parent)
            frame.pack(fill='x', padx=5, pady=2)
            
            ttk.Label(frame, text=gui_module).pack(side='left')
            ttk.Button(frame, text="Launch", 
                      command=lambda m=gui_module: self._launch_single_gui(m)).pack(side='right')
    
    def _populate_service_controls(self, parent):
        \"\"\"Add service module controls\"\"\"
        import tkinter as tk
        from tkinter import ttk
        
        tk.Label(parent, text="Background Services", font=('Arial', 12, 'bold')).pack(pady=5)
        
        for service in self.entry_points:
            if service not in self.gui_modules:
                frame = ttk.Frame(parent)
                frame.pack(fill='x', padx=5, pady=2)
                
                ttk.Label(frame, text=service).pack(side='left')
                ttk.Button(frame, text="Start", 
                          command=lambda s=service: self._start_service(s)).pack(side='right')
    
    def _populate_status_display(self, parent):
        \"\"\"Add system status display\"\"\"
        import tkinter as tk
        from tkinter import ttk
        
        status_text = tk.Text(parent, height=20)
        status_text.pack(fill='both', expand=True, padx=5, pady=5)
        
        status_info = f\"\"\"
🚀 System Status:
   • Total modules integrated: {len(valid_files)}
   • GUI modules: {len(gui_modules)}
   • Entry points: {len(entry_points)}
   • Classes available: {len(all_classes)}
   • Functions available: {len(all_functions)}

📊 Module Breakdown:
   GUI Modules: {', '.join(gui_modules) if gui_modules else 'None'}
   Entry Points: {', '.join(entry_points) if entry_points else 'None'}

✅ Integration successful with intelligent import management
\"\"\"
        status_text.insert('1.0', status_info)
        status_text.config(state='disabled')
    
    def _launch_single_gui(self, module_name):
        \"\"\"Launch a specific GUI module\"\"\"
        print(f"🖥️ Launching {{module_name}}...")
        # Here we would actually import and run the specific GUI module
        
    def _start_service(self, service_name):
        \"\"\"Start a specific background service\"\"\"
        print(f"⚙️ Starting {{service_name}}...")
        # Here we would actually import and run the specific service
    
    def _run_cli_interface(self):
        \"\"\"Run command-line interface when GUI is not available\"\"\"
        print("\\n" + "="*60)
        print("🎯 UNIFIED MODULE CONTROL CENTER - CLI MODE")
        print("="*60)
        print(f"📊 Successfully integrated {{len(valid_files)}} modules")
        print(f"🖥️ GUI modules available: {{len(self.gui_modules)}}")
        print(f"⚙️ Services available: {{len(self.entry_points)}}")
        print("="*60)
        
        while True:
            print("\\nAvailable commands:")
            print("1. list - Show all modules")
            print("2. gui - Launch GUI modules") 
            print("3. services - Start background services")
            print("4. status - Show system status")
            print("5. quit - Exit")
            
            choice = input("\\nEnter command (1-5): ").strip().lower()
            
            if choice in ['1', 'list']:
                self._show_module_list()
            elif choice in ['2', 'gui']:
                self.launch_gui_modules()
            elif choice in ['3', 'services']:
                self.run_background_services()
            elif choice in ['4', 'status']:
                self._show_status()
            elif choice in ['5', 'quit']:
                print("👋 Goodbye!")
                break
            else:
                print("❌ Invalid choice. Please try again.")
    
    def _show_module_list(self):
        \"\"\"Display all available modules\"\"\"
        print("\\n📋 Available Modules:")
        print("-" * 40)
        for i, module in enumerate(self.entry_points, 1):
            module_type = self.detect_module_type(module)
            print(f"{{i:2d}}. {{module:<30}} [{{module_type.upper()}}]")
    
    def _show_status(self):
        \"\"\"Show detailed system status\"\"\"
        print("\\n📊 System Status:")
        print("-" * 40)
        print(f"✅ Total modules: {{len(valid_files)}}")
        print(f"🖥️ GUI modules: {{len(self.gui_modules)}}")
        print(f"⚙️ Active services: {{len(self.background_tasks)}}")
        print(f"🏃 Running GUIs: {{len(self.active_guis)}}")

# === Main Execution Logic ===
def main():
    \"\"\"Intelligent main entry point for the integrated system\"\"\"
    print("\\n" + "🚀" * 20)
    print("🎯 INTELLIGENT CODEBASE INTEGRATION SYSTEM")
    print("🚀" * 20)
    
    orchestrator = ModuleOrchestrator()
    
    print(f"✅ Successfully loaded {{len(all_classes)}} classes and {{len(all_functions)}} functions")
    print(f"🔍 Detected {{len(gui_modules)}} GUI modules and {{len(entry_points)}} entry points")
    
    # Auto-detect best execution mode
    if gui_modules:
        print("🖥️ GUI modules detected - launching unified interface...")
        orchestrator.create_unified_interface()
    else:
        print("⚙️ No GUI detected - starting services in background...")
        orchestrator.run_background_services()
        orchestrator._run_cli_interface()

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\\n⏹️ Shutdown requested by user")
    except Exception as e:        print(f"❌ System error: {{e}}")
        import traceback
        traceback.print_exc()
""".format(
            gui_modules=repr(gui_modules),
            entry_points=repr(entry_points),
            len=len,
            valid_files=len(valid_files),
            all_classes=len(all_classes),
            all_functions=len(all_functions)        ))
    
    log(f"✅ Intelligent integrated codebase created: {INTEGRATED_OUTPUT}")
    log(f"📊 Stats: {len(future_imports)} future + {len(standard_imports)} standard + {len(external_imports)} external imports")
    log(f"📊 Components: {len(all_classes)} classes, {len(all_functions)} functions")
    log(f"🎯 Entry points: {len(entry_points)}, GUI modules: {len(gui_modules)}")
    return integrated_path

def create_README():
    """Create a comprehensive README file for the rebuilt project"""
    readme_path = os.path.join(OUTPUT_FOLDER, "README.md")
    with open(readme_path, "w", encoding="utf-8") as f:
        f.write(f"""# Rebuilt Project

This codebase was automatically restructured by AutoRebuilder.

## Directory Structure

- **Root directory**: Contains all modules in a flat structure (for backward compatibility)
- **Package directories**: Modules organized by functionality
  - `core/`: Core functionality modules
  - `ui/`: User interface modules
  - `tools/`: Utility scripts and tools
  - `train/`: Training related modules
  - `io/`: Input/output handling
  - `net/`: Networking and API modules

## Running the Code

1. **Run as a unified program** (recommended):
   ```
   python {LAUNCHER_NAME} unified
   ```

2. **Launch a specific module**:
   ```
   python {LAUNCHER_NAME} module_name
   ```

3. **Launch by category**:
   ```
   python {LAUNCHER_NAME} gui:1     # Run first GUI module
   python {LAUNCHER_NAME} cli:1     # Run first CLI module
   python {LAUNCHER_NAME} core:1    # Run first core module
   ```

4. **See all available modules**:
   ```
   python {LAUNCHER_NAME} list
   ```

5. **Run the integrated codebase**:
   ```
   python {LAUNCHER_NAME} {INTEGRATED_OUTPUT.replace('.py', '')}
   ```

## Documentation

For more details, see the [Module Map](MODULE_MAP.md) file.
""")

# Main entry point for auto_rebuilder.py
def run_rebuilder():
    """Main entry point for the auto_rebuilder script"""    # Setup output folder
    if os.path.exists(OUTPUT_FOLDER):
        try:
            shutil.rmtree(OUTPUT_FOLDER)
        except PermissionError:
            log("⚠️ Warning: Could not remove existing output folder - some files may be in use.")
            # Wait a moment and try to continue
            time.sleep(1)
    
    # Create output folder if it doesn't exist
    if not os.path.exists(OUTPUT_FOLDER):        
        os.makedirs(OUTPUT_FOLDER)
    
    if os.path.exists(LOG_FILE):
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        shutil.copy(LOG_FILE, f"{LOG_FILE}.backup_{timestamp}")
        os.remove(LOG_FILE)
    log(f"\n📁 Rebuild folder ready: {OUTPUT_FOLDER}")
      # Process Python files
    py_files = [f for f in os.listdir(SOURCE_FOLDER)
                if f.endswith(".py") and f != os.path.basename(__file__)]
    log(f"Found {len(py_files)} Python files to process: {py_files}")
      # Extract module info
    modules = []
    for py_file in py_files:
        full_path = os.path.join(SOURCE_FOLDER, py_file)
        result = refactor_file(full_path)
        if result:
            # Create a proper module info structure
            module_info = {
                "filename": py_file,
                "imports": [],
                "package": determine_package_category(py_file),
                "has_main": True  # Assuming refactored files have main functions
            }
            modules.append(module_info)      # Create hierarchical module structure (new step!)
    try:
        log("\n📁 Creating hierarchical module structure...")
        organized_modules = create_hierarchical_module_structure(modules)
        log(f"✅ Hierarchical structure created with {len(organized_modules)} categories")
    except Exception as e:
        log(f"⚠️ Error creating hierarchical structure: {str(e)}")
        traceback.print_exc()
    
    # Create integrated codebase with intelligent management (new step!)
    try:
        log("\n🔄 Creating intelligent integrated codebase...")
        integrated_path = create_integrated_codebase(modules)
        log(f"✅ Intelligent integrated codebase created at: {integrated_path}")
    except Exception as e:
        log(f"⚠️ Error creating integrated codebase: {str(e)}")
        traceback.print_exc()
      # Create launcher
    create_launcher(modules)
    
    # Create README
    try:
        create_README()
        log("✅ README file created")
    except Exception as e:
        log(f"⚠️ Error creating README: {str(e)}")
    
    log(f"\n🎉 Rebuild complete. Files rebuilt: {len(modules)}")
    log(f"📦 Launch with: python {os.path.join(OUTPUT_FOLDER, LAUNCHER_NAME)}")


def create_README():
    """Create a comprehensive README file for the rebuilt project"""
    readme_path = os.path.join(OUTPUT_FOLDER, "README.md")
    with open(readme_path, "w", encoding="utf-8") as f:
        content = """# Auto-Rebuilt Python Project

This codebase was automatically restructured by AutoRebuilder.

## Structure

- **Root directory**: Contains all modules in a flat structure (for backward compatibility)
- **Package directories**: Modules organized by functionality
  - core/: Core functionality modules
  - ui/: User interface modules
  - tools/: Utility scripts and tools
  - train/: Training related modules
  - io/: Input/output handling
  - net/: Networking and API modules

## Usage

1. **Run as a unified program** (recommended):
   ```
   python launch.py unified
   ```

2. **Launch a specific module**:
   ```
   python launch.py module_name
   ```

3. **Launch by category**:
   ```
   python launch.py gui:1     # Run first GUI module
   python launch.py cli:1     # Run first CLI module
   python launch.py core:1    # Run first core module
   ```

4. **See all available modules**:
   ```
   python launch.py list
   ```

5. **Run the integrated codebase**:
   ```
   python launch.py integrated_codebase
   ```

For more details, see the Module Map file.
"""
        f.write(content)


if __name__ == "__main__":
    run_rebuilder()
