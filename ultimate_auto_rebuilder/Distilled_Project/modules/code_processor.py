"""
Code Processor Module
Harvested from auto_rebuilder.py and enhanced versions

This module handles the main code processing and rebuilding functionality:
- File discovery and analysis
- Code parsing and classification
- Import resolution and conflict handling
- Module clustering and organization
- Package structure generation
- Integration with RBY Intelligence
"""

import os
import ast
import shutil
import datetime
import traceback
import re
import importlib.util
import sys
import warnings
import logging
import functools
import platform
import inspect
import json
import tempfile
import signal
import types
import contextlib
import multiprocessing as mp
import time
import random
import threading
import psutil
from pathlib import Path
from collections import defaultdict, Counter
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor

# Import harvested modules from code_processor_modules
try:
    # Add modules directory to path if needed
    modules_dir = Path(__file__).parent
    if str(modules_dir) not in sys.path:
        sys.path.insert(0, str(modules_dir))
    
    from code_processor_modules.dependency_extractor import extract_dependencies, extract_subprocess_calls
    from code_processor_modules.code_sanitizer import (
        sanitize_python_code, 
        is_documentation_file, 
        determine_package_category,
        extract_main_block,
        has_main_function,
        remove_main_block,
        wrap_main_as_function,
        add_exception_guard
    )
    from code_processor_modules.core_refactor import refactor_file, batch_refactor_files, analyze_codebase_structure
    from code_processor_modules.critical_fixes import CriticalRebuilderFixer
    # Import stub generator if available
    from code_processor_modules.stub_generator import StubGenerator
    HARVESTED_MODULES_AVAILABLE = True
    print("✅ Critical fixes modules loaded successfully")
except ImportError as e:
    print(f"⚠️  Harvested modules not available: {e}")
    HARVESTED_MODULES_AVAILABLE = False

try:
    import numpy as np
    from sklearn.cluster import DBSCAN, AgglomerativeClustering
    from sklearn.feature_extraction.text import TfidfVectorizer
    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = False
    print("⚠️  ML libraries not available. Using basic clustering.")


class CodeProcessor:
    """
    Main code processing engine that handles codebase rebuilding
    """
    
    def __init__(self, config):
        self.config = config
        self.base_dir = Path(__file__).parent.parent        # Processing configuration 
        # Fix: Use ScriptsFound instead of ToBuild as that's where script_gatherer places files
        self.source_folder = self.base_dir / config.get('source_folder', 'ScriptsFound')
        self.output_folder = self.base_dir / config.get('output_folder', 'rebuilt_project')
        self.max_parallel_processes = config.get('max_parallel_processes', 8)
        
        # Processing limits
        self.MAX_FILES_TO_PROCESS = 100000
        self.MAX_FILE_SIZE_MB = 50
        self.CHUNK_SIZE = 1000
        self.EXECUTION_TIMEOUT = 5
        
        # Package structure configuration
        self.PACKAGE_STRUCTURE = {
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
        
        # Processing state
        self.processing_stats = {
            'files_processed': 0,
            'files_skipped': 0,
            'errors': 0,
            'total_size': 0,
            'start_time': None,
            'end_time': None
        }
        
        # Module registry for tracking
        self.module_registry = {}
        self.import_mapping = {}
        self.conflict_resolution = "rename"
        self.namespace_prefix_map = {}
        self.module_clusters = defaultdict(list)
        self.import_graph = defaultdict(set)
        self.function_signatures = {}
        self.module_metadata = {}
        self.integration_blacklist = set()
        
        # Initialize logging
        self.setup_logging()
        
        # Load RBY intelligence if available
        self.rby_intelligence = None
        self.load_rby_intelligence()
    
    def setup_logging(self):
        """Setup logging for code processing"""
        log_file = self.base_dir / "logs" / "code_processor.log"
        log_file.parent.mkdir(exist_ok=True)
        
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s [%(levelname)-7s] %(funcName)s:%(lineno)d - %(message)s',
            handlers=[
                logging.FileHandler(log_file, encoding='utf-8'),
                logging.StreamHandler(sys.stdout)
            ]        )
        self.logger = logging.getLogger(__name__)
    
    def load_rby_intelligence(self):
        """Load RBY intelligence for code classification"""
        try:
            from rby_intelligence_core import RBYIntelligenceCore
            self.rby_intelligence = RBYIntelligenceCore(self.config)
            self.logger.info("RBY Intelligence loaded successfully")
        except ImportError:
            self.logger.warning("RBY Intelligence not available")
    
    def process_codebase(self):
        """
        Main entry point for processing the codebase - ENHANCED WITH CRITICAL FIXES
        """
        self.logger.info("🏗️  Starting codebase processing...")
        self.processing_stats['start_time'] = datetime.datetime.now()
        
        try:
            # Step 1: Discover and analyze files
            files_to_process = self.discover_files()
            if not files_to_process:
                self.logger.warning("No files found to process")
                return
            
            # Step 2: Apply CRITICAL FIXES to prevent breaking working code
            if HARVESTED_MODULES_AVAILABLE:
                self.logger.info("🔥 Using CRITICAL FIXES to prevent breaking working code...")
                
                # Initialize the critical fixer
                fixer = CriticalRebuilderFixer(logger=self.logger.info)
                
                # Convert paths to strings for the fixer
                file_paths = [str(f) for f in files_to_process]
                
                # Apply critical fixes during processing
                fixed_results = fixer.fix_file_processing(file_paths)
                
                # Build the fixed output project
                output_path = str(self.base_dir / "rebuilt_project")
                fixer.build_fixed_output_project(fixed_results, output_path)
                  # 🧠 RUN COMPREHENSIVE ANALYSIS to identify missing scripts and completion opportunities
                self.logger.info("🔍 Running comprehensive analysis to identify missing features...")
                analysis_results = fixer.run_comprehensive_analysis(file_paths)
                
                # 🚀 RUN COMPREHENSIVE ENHANCEMENTS to fix all identified issues
                self.logger.info("🚀 Running comprehensive enhancements...")
                enhancement_results = fixer.run_comprehensive_enhancements(output_path, analysis_results)
                
                # Log analysis summary
                summary = analysis_results["analysis_report"]["summary"]
                self.logger.info(f"📊 Analysis Results:")
                self.logger.info(f"  - Missing Scripts: {analysis_results['analysis_report']['missing_scripts']['count']}")
                self.logger.info(f"  - Placeholder Code: {analysis_results['analysis_report']['placeholder_code']['count']}")
                self.logger.info(f"  - Handwaved Implementations: {analysis_results['analysis_report']['handwaved_implementations']['count']}")
                self.logger.info(f"  - Dependency Gaps: {analysis_results['analysis_report']['dependency_gaps']['count']}")
                self.logger.info(f"  - Unused Features: {analysis_results['analysis_report']['unused_features']['count']}")
                self.logger.info(f"  - LLM Completion Requests Generated: {len(analysis_results['completion_requests'])}")
                
                # Log enhancement results
                if enhancement_results:
                    self.logger.info(f"🔧 Enhancement Results:")
                    self.logger.info(f"  - Lecture Mode Fixes: {len(enhancement_results.get('lecture_mode_fixes', []))}")
                    self.logger.info(f"  - Dependency Restructures: {len(enhancement_results.get('dependency_restructure', {}))}")
                    self.logger.info(f"  - Completed Implementations: {len(enhancement_results.get('completed_implementations', []))}")
                    self.logger.info(f"  - Architecture Improvements: {len(enhancement_results.get('architecture_improvements', []))}")
                
                # Update processing stats
                self.processing_stats['files_processed'] = len(fixed_results['processed_files'])
                self.processing_stats['errors'] = sum(1 for f in fixed_results['processed_files'] if f.get('status') == 'failed')
                self.processing_stats['analysis_results'] = analysis_results
                self.processing_stats['enhancement_results'] = enhancement_results
                
                self.logger.info(f"✅ CRITICAL FIXES applied successfully!")
                self.logger.info(f"📦 Created {len(fixed_results['packages'])} packages")
                self.logger.info(f"🔄 Fixed {len(fixed_results['circular_dependencies'])} circular dependencies")
                
                # Store results for summary
                self.processing_results = fixed_results
                
            else:
                # Fallback to original method if critical fixes not available
                self.logger.warning("Critical fixes not available, using fallback method - MAY BREAK WORKING CODE!")
                parsed_files = self.parse_and_classify_files(files_to_process)
                resolved_files = self.resolve_imports_and_dependencies(parsed_files)
                clustered_modules = self.cluster_modules(resolved_files)
                package_structure = self.generate_package_structure(clustered_modules)
                self.build_output_project(package_structure)
              # Step 3: Create launch script
            self.create_launch_script()
            
            # Step 4: Perform dry run validation
            self.logger.info("🧪 Performing final validation...")
            dry_run_success = self.perform_dry_run_test()
            self.processing_stats['dry_run_success'] = dry_run_success
            
            if dry_run_success:
                self.logger.info("✅ Rebuilt project passed dry run validation!")
            else:
                self.logger.warning("⚠️  Rebuilt project had issues in dry run validation")
            
            self.processing_stats['end_time'] = datetime.datetime.now()
            self.show_processing_summary()
            
        except Exception as e:
            self.logger.error(f"Error in codebase processing: {e}")
            traceback.print_exc()
    
    def discover_files(self):
        """
        Discover Python files in the source folder - FIXED TO USE ScriptsFound
        """
        # CRITICAL BUG FIX: Use ScriptsFound instead of ToBuild
        self.source_folder = "ScriptsFound"
        self.logger.info(f"Discovering files in {self.source_folder}...")
        
        source_path = self.base_dir / self.source_folder
        if not source_path.exists():
            self.logger.error(f"Source folder not found: {source_path}")
            return []
        
        files_to_process = []
        
        for file_path in source_path.rglob("*.py"):
            if self.should_process_file(file_path):
                files_to_process.append(file_path)
                
                if len(files_to_process) >= self.MAX_FILES_TO_PROCESS:
                    self.logger.warning(f"Reached maximum file limit: {self.MAX_FILES_TO_PROCESS}")
                    break
        
        self.logger.info(f"Found {len(files_to_process)} files to process")
        return files_to_process
    
    def should_process_file(self, file_path):
        """
        Determine if a file should be processed
        """
        # Check file size
        try:
            file_size_mb = file_path.stat().st_size / (1024 * 1024)
            if file_size_mb > self.MAX_FILE_SIZE_MB:
                self.logger.info(f"Skipping large file: {file_path} ({file_size_mb:.1f}MB)")
                return False
        except:
            return False
        
        # Skip certain directories
        skip_dirs = {'__pycache__', '.git', '.svn', 'node_modules', 'venv', 'env'}
        if any(skip_dir in str(file_path) for skip_dir in skip_dirs):
            return False
        
        # Skip certain files
        if file_path.name.startswith('.') or file_path.name.endswith('.pyc'):
            return False
        
        return True
    
    def parse_and_classify_files(self, files_to_process):
        """
        Parse and classify files using AST and RBY intelligence
        """
        self.logger.info("Parsing and classifying files...")
        
        parsed_files = []
        
        with ThreadPoolExecutor(max_workers=self.max_parallel_processes) as executor:
            future_to_file = {
                executor.submit(self.parse_single_file, file_path): file_path 
                for file_path in files_to_process
            }
            
            for future in future_to_file:
                try:
                    result = future.result(timeout=30)
                    if result:
                        parsed_files.append(result)
                        self.processing_stats['files_processed'] += 1
                except Exception as e:
                    file_path = future_to_file[future]
                    self.logger.error(f"Error parsing {file_path}: {e}")
                    self.processing_stats['errors'] += 1
        
        self.logger.info(f"Successfully parsed {len(parsed_files)} files")
        return parsed_files
    
    def parse_single_file(self, file_path):
        """
        Parse a single Python file
        """
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            # Parse AST
            try:
                tree = ast.parse(content)
            except SyntaxError as e:
                self.logger.warning(f"Syntax error in {file_path}: {e}")
                return None
            
            # Extract information
            file_info = {
                'path': file_path,
                'content': content,
                'ast': tree,
                'imports': self.extract_imports(tree),
                'functions': self.extract_functions(tree),
                'classes': self.extract_classes(tree),
                'variables': self.extract_variables(tree),
                'size': len(content),
                'complexity': self.calculate_complexity(tree)
            }
            
            # RBY classification
            if self.rby_intelligence:
                classification, scores = self.rby_intelligence.classify_code_by_rby(content, str(file_path))
                file_info['rby_classification'] = classification
                file_info['rby_scores'] = scores
            else:
                file_info['rby_classification'] = self.basic_classify_file(file_path, content)
                file_info['rby_scores'] = {"Red": 0, "Blue": 0, "Yellow": 1}
            
            # Store metadata
            self.module_metadata[str(file_path)] = file_info
            
            return file_info
            
        except Exception as e:
            self.logger.error(f"Error parsing file {file_path}: {e}")
            return None
    
    def extract_imports(self, tree):
        """Extract import statements from AST"""
        imports = []
        
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.append({
                        'type': 'import',
                        'module': alias.name,
                        'alias': alias.asname
                    })
            elif isinstance(node, ast.ImportFrom):
                module = node.module or ''
                for alias in node.names:
                    imports.append({
                        'type': 'from_import',
                        'module': module,
                        'name': alias.name,
                        'alias': alias.asname
                    })
        
        return imports
    
    def extract_functions(self, tree):
        """Extract function definitions from AST"""
        functions = []
        
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                functions.append({
                    'name': node.name,
                    'args': [arg.arg for arg in node.args.args],
                    'docstring': ast.get_docstring(node),
                    'is_async': isinstance(node, ast.AsyncFunctionDef),
                    'line_number': node.lineno
                })
        
        return functions
    
    def extract_classes(self, tree):
        """Extract class definitions from AST"""
        classes = []
        
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                classes.append({
                    'name': node.name,
                    'bases': [self.get_node_name(base) for base in node.bases],
                    'methods': [n.name for n in node.body if isinstance(n, ast.FunctionDef)],
                    'docstring': ast.get_docstring(node),
                    'line_number': node.lineno
                })
        
        return classes
    
    def extract_variables(self, tree):
        """Extract variable assignments from AST"""
        variables = []
        
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        variables.append({
                            'name': target.id,
                            'line_number': node.lineno
                        })
        
        return variables
    
    def get_node_name(self, node):
        """Get name from AST node"""
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Attribute):
            return f"{self.get_node_name(node.value)}.{node.attr}"
        else:
            return str(node)
    
    def calculate_complexity(self, tree):
        """Calculate basic complexity score for the code"""
        complexity = 0
        
        for node in ast.walk(tree):
            if isinstance(node, (ast.If, ast.While, ast.For, ast.Try, ast.With)):
                complexity += 1
            elif isinstance(node, ast.FunctionDef):
                complexity += 2
            elif isinstance(node, ast.ClassDef):
                complexity += 3
        
        return complexity
    
    def basic_classify_file(self, file_path, content):
        """Basic file classification without RBY intelligence"""
        path_str = str(file_path).lower()
        content_lower = content.lower()
        
        # UI/GUI indicators
        if any(indicator in content_lower for indicator in ['tkinter', 'pygame', 'gui', 'qt', 'wx']):
            return "Red"
        
        # AI/ML indicators
        if any(indicator in content_lower for indicator in ['tensorflow', 'pytorch', 'sklearn', 'neural']):
            return "Blue"
        
        # Default to execution
        return "Yellow"
    
    def resolve_imports_and_dependencies(self, parsed_files):
        """
        Resolve imports and build dependency graph
        """
        self.logger.info("Resolving imports and dependencies...")
        
        # Build module name mapping
        module_map = {}
        for file_info in parsed_files:
            module_name = self.get_module_name(file_info['path'])
            module_map[module_name] = file_info
            self.module_registry[module_name] = file_info
        
        # Resolve imports
        for file_info in parsed_files:
            resolved_imports = []
            module_name = self.get_module_name(file_info['path'])
            
            for import_info in file_info['imports']:
                if import_info['type'] == 'import':
                    target_module = import_info['module']
                elif import_info['type'] == 'from_import':
                    target_module = import_info['module']
                else:
                    continue
                
                # Check if it's an internal import
                if target_module in module_map:
                    self.import_graph[module_name].add(target_module)
                    resolved_imports.append({
                        **import_info,
                        'resolved': True,
                        'internal': True
                    })
                else:
                    resolved_imports.append({
                        **import_info,
                        'resolved': False,
                        'internal': False
                    })
            
            file_info['resolved_imports'] = resolved_imports
        
        return parsed_files
    
    def get_module_name(self, file_path):
        """Convert file path to module name"""
        # Remove base directory and extension
        relative_path = file_path.relative_to(self.base_dir / self.source_folder)
        module_name = str(relative_path.with_suffix(''))
        
        # Replace path separators with dots
        module_name = module_name.replace(os.sep, '.')
        
        return module_name
    
    def cluster_modules(self, parsed_files):
        """
        Cluster modules by functionality using package structure
        """
        self.logger.info("Clustering modules by functionality...")
        
        clustered_modules = defaultdict(list)
        
        for file_info in parsed_files:
            # Determine cluster based on filename and content
            cluster = self.determine_cluster(file_info)
            clustered_modules[cluster].append(file_info)
            self.module_clusters[cluster].append(file_info)
        
        # Use ML clustering if available
        if ML_AVAILABLE and len(parsed_files) > 10:
            ml_clusters = self.ml_cluster_modules(parsed_files)
            # Merge ML results with keyword-based clustering
            clustered_modules = self.merge_clustering_results(clustered_modules, ml_clusters)
        
        self.logger.info(f"Created {len(clustered_modules)} module clusters")
        return clustered_modules
    
    def determine_cluster(self, file_info):
        """
        Determine which cluster a file belongs to based on keywords
        """
        file_path = str(file_info['path']).lower()
        content = file_info['content'].lower()
        
        # Score each package type
        package_scores = {}
        
        for package_type, keywords in self.PACKAGE_STRUCTURE.items():
            score = 0
            
            # Check filename
            for keyword in keywords:
                if keyword in file_path:
                    score += 2
                if keyword in content:
                    score += 1
            
            package_scores[package_type] = score
        
        # Return the package with highest score, or 'core' as default
        if package_scores:
            return max(package_scores, key=package_scores.get)
        else:
            return 'core'
    
    def ml_cluster_modules(self, parsed_files):
        """
        Use machine learning to cluster modules (if libraries available)
        """
        try:
            # Create feature vectors from code content
            texts = [file_info['content'] for file_info in parsed_files]
            
            # Use TF-IDF vectorization
            vectorizer = TfidfVectorizer(max_features=1000, stop_words='english')
            features = vectorizer.fit_transform(texts)
            
            # Apply clustering
            clustering = DBSCAN(eps=0.5, min_samples=2)
            cluster_labels = clustering.fit_predict(features.toarray())
            
            # Group files by cluster
            ml_clusters = defaultdict(list)
            for i, label in enumerate(cluster_labels):
                cluster_name = f"ml_cluster_{label}" if label != -1 else "ml_outliers"
                ml_clusters[cluster_name].append(parsed_files[i])
            
            return ml_clusters
            
        except Exception as e:
            self.logger.warning(f"ML clustering failed: {e}")
            return {}
    
    def merge_clustering_results(self, keyword_clusters, ml_clusters):
        """
        Merge keyword-based and ML-based clustering results
        """
        # For now, prioritize keyword-based clustering
        # Future enhancement: use ML to refine keyword clustering
        return keyword_clusters
    
    def generate_package_structure(self, clustered_modules):
        """
        Generate the final package structure
        """
        self.logger.info("Generating package structure...")
        
        package_structure = {}
        
        for cluster_name, files in clustered_modules.items():
            package_structure[cluster_name] = {
                'files': files,
                'init_content': self.generate_init_file(cluster_name, files),
                'dependencies': self.get_cluster_dependencies(files)
            }
        
        return package_structure
    
    def generate_init_file(self, cluster_name, files):
        """
        Generate __init__.py content for a package
        """
        init_content = f'"""\n{cluster_name.title()} Package\nAuto-generated by Ultimate Auto-Rebuilder\n"""\n\n'
        
        # Add imports for all modules in the package
        for file_info in files:
            module_name = self.get_module_name(file_info['path']).split('.')[-1]
            if module_name != '__init__':
                init_content += f"from .{module_name} import *\n"
        
        # Add __all__ declaration
        all_names = []
        for file_info in files:
            for func in file_info['functions']:
                all_names.append(func['name'])
            for cls in file_info['classes']:
                all_names.append(cls['name'])
        
        if all_names:
            init_content += f"\n__all__ = {all_names}\n"
        
        return init_content
    
    def get_cluster_dependencies(self, files):
        """
        Get dependencies for a cluster of files
        """
        dependencies = set()
        
        for file_info in files:
            for import_info in file_info.get('resolved_imports', []):
                if not import_info.get('internal', False):
                    if import_info['type'] == 'import':
                        dependencies.add(import_info['module'])
                    elif import_info['type'] == 'from_import':
                        dependencies.add(import_info['module'])
        
        return list(dependencies)
    
    def build_output_project(self, package_structure):
        """
        Build the output project structure
        """
        self.logger.info("Building output project...")
        
        output_path = self.base_dir / self.output_folder
        
        # Clean output directory
        if output_path.exists():
            shutil.rmtree(output_path)
        output_path.mkdir(parents=True)
        
        # Create packages
        for package_name, package_info in package_structure.items():
            package_path = output_path / package_name
            package_path.mkdir(parents=True)
            
            # Create __init__.py
            init_file = package_path / "__init__.py"
            with open(init_file, 'w', encoding='utf-8') as f:
                f.write(package_info['init_content'])
            
            # Copy module files
            for file_info in package_info['files']:
                original_path = file_info['path']
                module_name = self.get_module_name(original_path).split('.')[-1]
                
                if module_name == '__init__':
                    continue
                
                target_path = package_path / f"{module_name}.py"
                
                # Copy and potentially modify the file
                modified_content = self.modify_file_content(file_info)
                with open(target_path, 'w', encoding='utf-8') as f:
                    f.write(modified_content)
        
        # Create main __init__.py
        main_init = output_path / "__init__.py"
        with open(main_init, 'w', encoding='utf-8') as f:
            f.write(self.generate_main_init(package_structure))
        
        self.logger.info(f"Built output project in {output_path}")
    
    def modify_file_content(self, file_info):
        """
        Modify file content to fix imports and resolve conflicts
        """
        content = file_info['content']
        
        # Fix relative imports
        for import_info in file_info.get('resolved_imports', []):
            if import_info.get('internal', False):
                # Convert to relative import
                old_import = self.reconstruct_import_statement(import_info)
                new_import = self.create_relative_import(import_info)
                content = content.replace(old_import, new_import)
        
        return content
    
    def reconstruct_import_statement(self, import_info):
        """
        Reconstruct the original import statement
        """
        if import_info['type'] == 'import':
            if import_info['alias']:
                return f"import {import_info['module']} as {import_info['alias']}"
            else:
                return f"import {import_info['module']}"
        elif import_info['type'] == 'from_import':
            if import_info['alias']:
                return f"from {import_info['module']} import {import_info['name']} as {import_info['alias']}"
            else:
                return f"from {import_info['module']} import {import_info['name']}"
        
        return ""
    
    def create_relative_import(self, import_info):
        """
        Create a relative import statement
        """
        if import_info['type'] == 'import':
            # Convert absolute import to relative
            return f"from . import {import_info['module'].split('.')[-1]}"
        elif import_info['type'] == 'from_import':
            # Convert to relative from import
            return f"from .{import_info['module'].split('.')[-1]} import {import_info['name']}"
        
        return self.reconstruct_import_statement(import_info)
    
    def generate_main_init(self, package_structure):
        """
        Generate the main __init__.py file
        """
        content = '"""\nRebuilt Project - Ultimate Auto-Rebuilder\n"""\n\n'
        
        # Import all packages
        for package_name in package_structure.keys():
            content += f"from . import {package_name}\n"
        
        # Add version info
        content += f"\n__version__ = '1.0.0-rebuilt-{datetime.datetime.now().strftime('%Y%m%d')}'\n"
        
        return content
    
    def create_launch_script(self):
        """
        Create a launch script for the rebuilt project
        """
        output_path = self.base_dir / self.output_folder
        launch_script = output_path / "launch.py"
        
        launch_content = '''#!/usr/bin/env python3
"""
Launch Script for Rebuilt Project
Auto-generated by Ultimate Auto-Rebuilder
"""

import sys
import os
from pathlib import Path

# Add the current directory to Python path
sys.path.insert(0, str(Path(__file__).parent))

def main():
    """Main entry point for the rebuilt project"""
    print("🚀 Launching rebuilt project...")
    
    # Import all packages to test
    try:
        import core
        print("✅ Core package loaded")
    except ImportError as e:
        print(f"⚠️  Core package error: {e}")
    
    try:
        import ui
        print("✅ UI package loaded")
    except ImportError as e:
        print(f"⚠️  UI package error: {e}")
    
    try:
        import io
        print("✅ IO package loaded")  
    except ImportError as e:
        print(f"⚠️  IO package error: {e}")
    
    try:
        import net
        print("✅ Net package loaded")
    except ImportError as e:
        print(f"⚠️  Net package error: {e}")
    
    try:
        import train
        print("✅ Train package loaded")
    except ImportError as e:
        print(f"⚠️  Train package error: {e}")
    
    try:
        import tools
        print("✅ Tools package loaded")
    except ImportError as e:
        print(f"⚠️  Tools package error: {e}")
    
    print("🎉 Project launch complete!")

if __name__ == "__main__":
    main()
'''
        
        with open(launch_script, 'w', encoding='utf-8') as f:
            f.write(launch_content)
          # Make executable on Unix systems
        if platform.system() != 'Windows':
            os.chmod(launch_script, 0o755)
        
        self.logger.info(f"Created launch script: {launch_script}")
    
    def show_processing_summary(self):
        """
        Show summary of processing results - ENHANCED FOR HARVESTED FUNCTIONALITY
        """
        duration = self.processing_stats['end_time'] - self.processing_stats['start_time']
        
        print("\n" + "="*60)
        print("🏗️  CODE PROCESSING SUMMARY")
        print("="*60)
        print(f"Files Processed: {self.processing_stats['files_processed']}")
        print(f"Files Skipped: {self.processing_stats.get('files_skipped', 0)}")
        print(f"Errors: {self.processing_stats['errors']}")
        print(f"Processing Time: {duration}")
        print(f"Output Location: {self.base_dir / self.output_folder}")
        
        # Show harvested results if available
        if hasattr(self, 'processing_results'):
            results = self.processing_results
            print(f"\n🔥 HARVESTED FUNCTIONALITY RESULTS:")
            print(f"Success Rate: {(results['success_count'] / results['total_files'] * 100):.1f}%")
            print(f"Packages Created: {len(results['packages'])}")
            print(f"Dependencies Found: {len(results['dependencies'])}")
            
            # Show package distribution
            print(f"\n📦 Package Distribution:")
            for package, files in results['packages'].items():
                print(f"  {package}: {len(files)} files")
        
        # Show structure analysis if available
        if hasattr(self, 'structure_analysis'):
            analysis = self.structure_analysis
            print(f"\n📊 Structure Analysis:")
            print(f"Integration Complexity: {analysis['integration_complexity']}")
            if analysis['namespace_conflicts']:
                print(f"Namespace Conflicts: {len(analysis['namespace_conflicts'])}")
            if analysis['recommended_actions']:
                print(f"Recommendations:")
                for action in analysis['recommended_actions']:
                    print(f"  • {action}")
          # Show cluster information (fallback)
        if hasattr(self, 'module_clusters') and self.module_clusters:
            print(f"\nPackage Clusters Created: {len(self.module_clusters)}")
            for cluster_name, files in self.module_clusters.items():
                print(f"  {cluster_name}: {len(files)} files")
        
        print("="*60)

    def perform_dry_run_test(self):
        """
        🧪 Perform dry run test of the rebuilt project
        Try to import all modules and run basic validation
        """
        try:
            self.logger.info("🧪 Starting dry run validation of rebuilt project...")
            
            rebuilt_path = self.base_dir / "rebuilt_project"
            if not rebuilt_path.exists():
                self.logger.error("❌ Rebuilt project directory not found!")
                return False
            
            # Add rebuilt project to Python path
            sys.path.insert(0, str(rebuilt_path))
            
            test_results = {
                'importable_modules': [],
                'failed_imports': [],
                'syntax_errors': [],
                'runtime_errors': []
            }
            
            # Test all Python files in rebuilt project
            for py_file in rebuilt_path.rglob("*.py"):
                if py_file.name == "__init__.py":
                    continue
                    
                try:
                    # Check syntax first
                    with open(py_file, 'r', encoding='utf-8') as f:
                        source = f.read()
                    
                    ast.parse(source)
                    
                    # Try to import the module
                    rel_path = py_file.relative_to(rebuilt_path)
                    module_name = str(rel_path.with_suffix(''))
                    module_name = module_name.replace(os.sep, '.')
                    
                    spec = importlib.util.spec_from_file_location(module_name, py_file)
                    if spec and spec.loader:
                        module = importlib.util.module_from_spec(spec)
                        spec.loader.exec_module(module)
                        test_results['importable_modules'].append(str(rel_path))
                        
                except SyntaxError as e:
                    test_results['syntax_errors'].append(f"{rel_path}: {e}")
                    self.logger.error(f"❌ Syntax error in {rel_path}: {e}")
                    
                except ImportError as e:
                    test_results['failed_imports'].append(f"{rel_path}: {e}")
                    self.logger.warning(f"⚠️  Import error in {rel_path}: {e}")
                    
                except Exception as e:
                    test_results['runtime_errors'].append(f"{rel_path}: {e}")
                    self.logger.warning(f"⚠️  Runtime error in {rel_path}: {e}")
            
            # Test launcher.py if it exists
            launcher_path = rebuilt_path / "launcher.py"
            if launcher_path.exists():
                try:
                    self.logger.info("🚀 Testing launcher.py...")
                    import subprocess
                    result = subprocess.run([
                        sys.executable, str(launcher_path)
                    ], capture_output=True, text=True, timeout=30, cwd=str(rebuilt_path))
                    
                    if result.returncode == 0:
                        self.logger.info("✅ Launcher executed successfully!")
                    else:
                        self.logger.warning(f"⚠️  Launcher had issues: {result.stderr}")
                        test_results['runtime_errors'].append(f"launcher.py: {result.stderr}")
                        
                except subprocess.TimeoutExpired:
                    self.logger.warning("⚠️  Launcher timed out (30s)")
                    test_results['runtime_errors'].append("launcher.py: Execution timeout")
                    
                except Exception as e:
                    self.logger.error(f"❌ Launcher test failed: {e}")
                    test_results['runtime_errors'].append(f"launcher.py: {e}")
            
            # Generate dry run report
            total_files = len(test_results['importable_modules']) + len(test_results['failed_imports']) + len(test_results['syntax_errors'])
            success_rate = len(test_results['importable_modules']) / max(total_files, 1) * 100 if total_files > 0 else 0
            
            self.logger.info(f"🧪 Dry Run Results:")
            self.logger.info(f"  ✅ Successfully imported: {len(test_results['importable_modules'])} modules")
            self.logger.info(f"  ❌ Failed imports: {len(test_results['failed_imports'])}")
            self.logger.info(f"  🔧 Syntax errors: {len(test_results['syntax_errors'])}")
            self.logger.info(f"  ⚠️  Runtime errors: {len(test_results['runtime_errors'])}")
            self.logger.info(f"  📊 Success rate: {success_rate:.1f}%")
            
            # Save detailed report
            report_path = self.base_dir / "dry_run_report.json"
            with open(report_path, 'w') as f:
                json.dump(test_results, f, indent=2)
            
            self.logger.info(f"📋 Detailed report saved to: {report_path}")
            
            # Clean up Python path
            if str(rebuilt_path) in sys.path:
                sys.path.remove(str(rebuilt_path))
                
            return success_rate >= 80.0  # Consider 80%+ success rate as passing
            
        except Exception as e:
            self.logger.error(f"❌ Dry run test failed: {e}")
            self.logger.error(traceback.format_exc())
            return False
