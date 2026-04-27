"""
Critical Rebuilder Fixes Module
This module contains fixes for the critical issues that cause working code to break during rebuilding.

IDENTIFIED CRITICAL ISSUES:
1. Invalid import statements from filenames with spaces/special chars
2. Massive duplicated __all__ lists causing memory issues  
3. Circular import dependencies
4. Syntax errors in generated __init__.py files
5. Poor package structure generation

This module ensures the rebuilder IMPROVES rather than BREAKS working code.
"""

import os
import ast
import shutil
from typing import Dict, List, Set, Any, Optional, Tuple
from pathlib import Path

# Import the comprehensive enhancer
try:
    from .comprehensive_enhancer import ComprehensiveEnhancer
    ENHANCER_AVAILABLE = True
except ImportError:
    ENHANCER_AVAILABLE = False

# Import from same package - using try/except for flexible importing
try:
    from .filename_sanitizer import (
        sanitize_filename_for_python, 
        create_filename_mapping,
        generate_safe_imports,
        detect_circular_imports,
        generate_clean_all_list,
        fix_package_init_file
    )
except ImportError:
    try:
        from filename_sanitizer import (
            sanitize_filename_for_python, 
            create_filename_mapping,
            generate_safe_imports,
            detect_circular_imports,
            generate_clean_all_list,
            fix_package_init_file
        )
    except ImportError as e:
        print(f"Warning: Could not import filename_sanitizer: {e}")
        # Create dummy functions
        def sanitize_filename_for_python(filename):
            return filename.replace('.py', '').replace('-', '_').replace(' ', '_')
        def create_filename_mapping(file_list):
            return {f: sanitize_filename_for_python(f) for f in file_list}
        def generate_safe_imports(mapping, deps):
            return {}
        def detect_circular_imports(deps):
            return []
        def generate_clean_all_list(funcs, classes):
            return []
        def fix_package_init_file(path, mapping, imports, all_list):
            pass


class CriticalRebuilderFixer:
    """
    Fixes critical issues in the rebuilding process to ensure working code stays working.
    """
    
    def __init__(self, logger=None):
        self.logger = logger or print
        self.filename_mapping = {}
        self.dependency_graph = {}
        self.circular_dependencies = []
        self.package_structure = {}
        self.module_metadata = {}
    
    def fix_file_processing(self, files_to_process: List[str]) -> Dict[str, Any]:
        """
        Process files with critical fixes to prevent breaking working code.
        
        Returns:
            Fixed processing results with proper error handling
        """
        self.logger("🔧 Applying critical fixes to file processing...")
        
        # Step 1: Create safe filename mapping
        self.filename_mapping = create_filename_mapping(files_to_process)
        self.logger(f"📝 Created safe names for {len(self.filename_mapping)} files")
        
        # Step 2: Analyze dependencies safely
        self.dependency_graph = self._build_safe_dependency_graph(files_to_process)
        
        # Step 3: Detect and resolve circular imports
        self.circular_dependencies = detect_circular_imports(self.dependency_graph)
        if self.circular_dependencies:
            self.logger(f"⚠️ Found {len(self.circular_dependencies)} circular dependencies - fixing...")
            self._resolve_circular_dependencies()
        
        # Step 4: Process files with safe handling
        processed_files = self._safe_process_files(files_to_process)
        
        # Step 5: Generate fixed package structure
        fixed_packages = self._generate_fixed_packages(processed_files)
        
        return {
            "processed_files": processed_files,
            "packages": fixed_packages,
            "filename_mapping": self.filename_mapping,
            "circular_dependencies": self.circular_dependencies,
            "success": True
        }
    
    def _build_safe_dependency_graph(self, files_to_process: List[str]) -> Dict[str, Set[str]]:
        """
        Build a dependency graph with safe error handling to prevent crashes.
        """
        dependency_graph = {}
        
        for file_path in files_to_process:
            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                
                # Parse safely
                try:
                    tree = ast.parse(content)
                    deps = self._extract_safe_dependencies(tree, file_path)
                    dependency_graph[file_path] = deps
                except SyntaxError:
                    # If file has syntax errors, treat as having no dependencies
                    dependency_graph[file_path] = set()
                    
            except Exception as e:
                self.logger(f"⚠️ Could not read {file_path}: {e}")
                dependency_graph[file_path] = set()
        
        return dependency_graph
    
    def _extract_safe_dependencies(self, tree: ast.AST, file_path: str) -> Set[str]:
        """
        Safely extract dependencies without causing unpacking errors.
        """
        dependencies = set()
        
        try:
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        # Only track local dependencies (files in our processing list)
                        dep_name = alias.name.split('.')[0]
                        dependencies.add(dep_name)
                        
                elif isinstance(node, ast.ImportFrom):
                    if node.module:
                        dep_name = node.module.split('.')[0]
                        dependencies.add(dep_name)
        
        except Exception as e:
            self.logger(f"⚠️ Error extracting dependencies from {file_path}: {e}")
        
        return dependencies
    
    def _resolve_circular_dependencies(self):
        """
        Resolve circular dependencies by breaking cycles at the least critical points.
        """
        for cycle in self.circular_dependencies:
            self.logger(f"🔄 Resolving circular dependency: {' -> '.join(cycle)}")
            
            # Break the cycle by removing the dependency with the least impact
            if len(cycle) > 1:
                # Remove the last dependency in the cycle
                from_module = cycle[-2]
                to_module = cycle[-1]
                
                if from_module in self.dependency_graph:
                    self.dependency_graph[from_module].discard(to_module)
                    self.logger(f"  ✂️ Broke cycle by removing {from_module} -> {to_module}")
    
    def _safe_process_files(self, files_to_process: List[str]) -> List[Dict[str, Any]]:
        """
        Process files with comprehensive error handling and validation.
        """
        processed_files = []
        
        for file_path in files_to_process:
            try:
                result = self._process_single_file_safely(file_path)
                if result:
                    processed_files.append(result)
            except Exception as e:
                self.logger(f"❌ Failed to process {file_path}: {e}")
                # Create a minimal result to prevent complete failure
                processed_files.append({
                    "original_path": file_path,
                    "safe_name": self.filename_mapping.get(file_path, "unknown"),
                    "status": "failed",
                    "error": str(e)
                })
        
        return processed_files
    
    def _process_single_file_safely(self, file_path: str) -> Optional[Dict[str, Any]]:
        """
        Process a single file with safe error handling.
        """
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            # Get safe filename
            safe_name = self.filename_mapping.get(file_path, "unknown")
            
            # Basic validation
            if not content.strip():
                return None
            
            # Try to parse - if it fails, treat as data file
            try:
                tree = ast.parse(content)
                functions = self._extract_functions_safely(tree)
                classes = self._extract_classes_safely(tree)
                file_type = "python"
            except SyntaxError:
                functions = []
                classes = []
                file_type = "data"
            
            # Fix missing imports
            content = self._fix_missing_imports(content)
            
            return {
                "original_path": file_path,
                "safe_name": safe_name,
                "content": content,
                "functions": functions,
                "classes": classes,
                "file_type": file_type,
                "status": "success"
            }
            
        except Exception as e:
            self.logger(f"⚠️ Error processing {file_path}: {e}")
            return None
    
    def _extract_functions_safely(self, tree: ast.AST) -> List[str]:
        """
        Safely extract function names from AST.
        """
        functions = []
        try:
            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef):
                    functions.append(node.name)
        except Exception:
            pass
        return functions
    
    def _extract_classes_safely(self, tree: ast.AST) -> List[str]:
        """
        Safely extract class names from AST.
        """
        classes = []
        try:
            for node in ast.walk(tree):
                if isinstance(node, ast.ClassDef):
                    classes.append(node.name)
        except Exception:
            pass
        return classes
    
    def _generate_fixed_packages(self, processed_files: List[Dict[str, Any]]) -> Dict[str, List[str]]:
        """
        Generate a clean package structure with proper categorization.
        """
        packages = {
            "core": [],
            "ui": [],
            "io": [],
            "net": [],
            "train": [],
            "tools": []
        }
        
        for file_info in processed_files:
            if file_info["status"] != "success":
                continue
                  # Categorize based on content analysis
            category = self._categorize_file_safely(file_info)
            packages[category].append(file_info["safe_name"])
        
        # Ensure all expected packages exist, even if empty
        required_packages = ["core", "io", "train", "tools", "ui", "net"]
        for package_name in required_packages:
            if package_name not in packages:
                packages[package_name] = []
        
        return packages
    
    def _categorize_file_safely(self, file_info: Dict[str, Any]) -> str:
        """
        Safely categorize a file based on its content.
        Enhanced to ensure better distribution across packages.
        """
        safe_name = file_info["safe_name"].lower()
        functions = file_info.get("functions", [])
        classes = file_info.get("classes", [])
        content = file_info.get("content", "").lower()
        
        # UI indicators (more comprehensive)
        ui_indicators = ["gui", "ui", "window", "frame", "widget", "tkinter", "qt", "dialog", "panel", "view", "display"]
        if any(indicator in safe_name for indicator in ui_indicators):
            return "ui"
        if any(indicator in content[:1000] for indicator in ["tkinter", "import tk", "from tkinter"]):
            return "ui"
        
        # Training/ML indicators (check early to catch ML files)
        train_indicators = ["train", "ml", "model", "neural", "ai", "learn", "firstborn", "seed", "intelligence"]
        if any(indicator in safe_name for indicator in train_indicators):
            return "train"
        if any(indicator in content[:1000] for indicator in ["torch", "tensorflow", "sklearn", "neural", "machine learning"]):
            return "train"
        
        # IO indicators (more comprehensive)
        io_indicators = ["file", "data", "io", "read", "write", "save", "load", "aios", "system", "launcher", "integration"]
        if any(indicator in safe_name for indicator in io_indicators):
            return "io"
        if any(indicator in content[:1000] for indicator in ["aiofiles", "file handling", "data processing"]):
            return "io"
        
        # Tool indicators (more comprehensive) 
        tool_indicators = ["tool", "util", "helper", "test", "script", "cli", "command", "processor", "manager", "structure", "egg", "enhancement"]
        if any(indicator in safe_name for indicator in tool_indicators):
            return "tools"
        if any(indicator in content[:1000] for indicator in ["command line", "script", "utility"]):
            return "tools"
        
        # Network indicators (more comprehensive)
        net_indicators = ["api", "http", "server", "client", "net", "web", "socket", "protocol", "request"]
        if any(indicator in safe_name for indicator in net_indicators):
            return "net"
        if any(indicator in content[:1000] for indicator in ["import socket", "http", "api", "network"]):
            return "net"
        
        # Core indicators (anything fundamental/abstract)
        core_indicators = ["absolute", "core", "singularity", "existence", "logic", "fundamental", "base"]
        if any(indicator in safe_name for indicator in core_indicators):
            return "core"
        
        # Default fallback based on content size or complexity
        if len(content) > 50000:  # Large files likely core
            return "core"
        elif len(functions) > 10:  # Function-heavy files are tools
            return "tools"
        elif len(classes) > 5:  # Class-heavy files are core
            return "core"
        
        # Final fallback
        return "core"
    
    def build_fixed_output_project(self, fixed_results: Dict[str, Any], output_path: str):
        """
        Build the output project with all critical fixes applied.
        """
        self.logger("🏗️ Building fixed output project...")
        
        # Clean output directory safely
        if os.path.exists(output_path):
            try:
                shutil.rmtree(output_path)
            except PermissionError:
                self.logger("⚠️ Could not remove existing output - creating new timestamped version")
                import datetime
                timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                output_path = f"{output_path}_{timestamp}"
        
        os.makedirs(output_path, exist_ok=True)
        
        # Process each package
        packages = fixed_results["packages"]
        processed_files = fixed_results["processed_files"]
        
        for package_name, file_list in packages.items():
            package_path = os.path.join(output_path, package_name)
            os.makedirs(package_path, exist_ok=True)
            
            # Copy files with safe names
            for safe_name in file_list:
                # Find original file
                original_file = None
                for file_info in processed_files:
                    if file_info.get("safe_name") == safe_name:
                        original_file = file_info
                        break
                
                if original_file and original_file["status"] == "success":
                    # Write file with safe name
                    safe_filename = f"{safe_name}.py"
                    safe_path = os.path.join(package_path, safe_filename)
                    
                    with open(safe_path, 'w', encoding='utf-8') as f:
                        f.write(original_file["content"])
            
            # Create safe __init__.py
            self._create_safe_init_file(package_path, package_name, file_list, processed_files)
        
        self.logger(f"✅ Fixed output project created at: {output_path}")
    
    def _create_safe_init_file(self, package_path: str, package_name: str, 
                              file_list: List[str], processed_files: List[Dict[str, Any]]):
        """
        Create a safe __init__.py file without the critical errors.
        """
        content = [
            f'"""',
            f'{package_name.title()} Package',
            f'Auto-generated by Ultimate Auto-Rebuilder - FIXED VERSION',
            f'This package has been processed with critical fixes applied.',
            f'"""',
            '',
            '# Safe imports with proper error handling',
        ]
        
        all_names = []
        
        for safe_name in file_list:
            # Find the file info
            file_info = None
            for info in processed_files:
                if info.get("safe_name") == safe_name:
                    file_info = info
                    break
            
            if file_info and file_info["status"] == "success":
                # Add safe import
                content.append(f'try:')
                content.append(f'    from .{safe_name} import *')
                content.append(f'except ImportError as e:')
                content.append(f'    print(f"Warning: Could not import {safe_name}: {{e}}")')
                content.append('')
                
                # Collect function and class names for __all__
                all_names.extend(file_info.get("functions", []))
                all_names.extend(file_info.get("classes", []))
        
        # Create clean __all__ list
        if all_names:
            clean_all = sorted(set(name for name in all_names if not name.startswith('_')))
            content.append('# Public API')
            content.append('__all__ = [')
            for name in clean_all:
                content.append(f'    "{name}",')
            content.append(']')
        
        # Write the file
        init_path = os.path.join(package_path, '__init__.py')
        with open(init_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(content))
    
    def _fix_missing_imports(self, content: str) -> str:
        """
        Automatically detect and fix missing imports based on usage patterns.
        This is a critical fix for imports that break working code.
        """        # Common missing import patterns
        missing_imports = {
            'contextmanager': 'from contextlib import contextmanager',
            'contextlib': 'import contextlib',
            'subprocess': 'import subprocess',
            'dataclass': 'from dataclasses import dataclass',
            'field': 'from dataclasses import field',
            'partial': 'from functools import partial',
            'lru_cache': 'from functools import lru_cache',
            'wraps': 'from functools import wraps',
            'defaultdict': 'from collections import defaultdict',
            'Counter': 'from collections import Counter',
            'deque': 'from collections import deque',
            'OrderedDict': 'from collections import OrderedDict',
            'namedtuple': 'from collections import namedtuple',
            'datetime': 'import datetime',
            'timedelta': 'from datetime import timedelta',
            'timezone': 'from datetime import timezone',
            'abc': 'import abc',
            'ABC': 'from abc import ABC',
            'abstractmethod': 'from abc import abstractmethod',
            'Enum': 'from enum import Enum',
            'IntEnum': 'from enum import IntEnum',
            'Union': 'from typing import Union',
            'Optional': 'from typing import Optional',
            'List': 'from typing import List',
            'Dict': 'from typing import Dict',
            'Set': 'from typing import Set',
            'Tuple': 'from typing import Tuple',
            'Callable': 'from typing import Callable',
            'Iterator': 'from typing import Iterator',
            'Generator': 'from typing import Generator',
            'Any': 'from typing import Any',
            'Type': 'from typing import Type',
            'ClassVar': 'from typing import ClassVar',
            'Final': 'from typing import Final',
            'Literal': 'from typing import Literal',
            'TypeVar': 'from typing import TypeVar',
            'Generic': 'from typing import Generic',
            'Protocol': 'from typing import Protocol',
            'runtime_checkable': 'from typing import runtime_checkable'
        }
        
        # Check what imports are already present
        existing_imports = set()
        try:
            tree = ast.parse(content)
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        existing_imports.add(alias.name)
                elif isinstance(node, ast.ImportFrom):
                    module = node.module or ''
                    for alias in node.names:
                        existing_imports.add(f"{module}.{alias.name}")
                        existing_imports.add(alias.name)  # Also add just the name
        except:
            pass  # If we can't parse, skip import detection
          # Find what imports we need to add
        imports_to_add = []
        for symbol, import_stmt in missing_imports.items():
            # Check if symbol is used but not imported
            # Enhanced patterns for type annotations, decorators, and function calls
            patterns_to_check = [
                f"@{symbol}",          # Decorator usage
                f" {symbol}(",         # Function call
                f".{symbol}",          # Method call
                f": {symbol}",         # Type annotation
                f"[{symbol}",          # Generic type
                f"-> {symbol}",        # Return type annotation
                f", {symbol}",         # Parameter type
                f"({symbol}",          # Parenthesized type
                f"Union[{symbol}",     # Union type
                f"Optional[{symbol}",  # Optional type
                f"List[{symbol}",      # List type
                f"Dict[{symbol}",      # Dict type
                f"Set[{symbol}",       # Set type
                f"Tuple[{symbol}",     # Tuple type
            ]
            
            if (symbol not in existing_imports and 
                any(pattern in content for pattern in patterns_to_check)):
                imports_to_add.append(import_stmt)
        
        # Add missing imports at the top
        if imports_to_add:
            lines = content.split('\n')
            
            # Find where to insert imports (after existing imports or at top)
            insert_line = 0
            for i, line in enumerate(lines):
                if line.strip().startswith(('#', '"""', "'''")):
                    continue
                if line.strip().startswith(('import ', 'from ')):
                    insert_line = i + 1
                elif line.strip() and not line.strip().startswith('#'):
                    break
            
            # Insert the missing imports
            for import_stmt in imports_to_add:
                lines.insert(insert_line, import_stmt)
                insert_line += 1
            
            return '\n'.join(lines)
        
        return content
    
    def run_comprehensive_analysis(self, files_to_process: List[str]) -> Dict[str, Any]:
        """
        Run comprehensive analysis to identify missing scripts, placeholders, and completion opportunities.
        This is the advanced intelligence feature for identifying what the auto-rebuilder missed.
        """
        from .script_analyzer import ScriptAnalyzer
        
        self.logger("🧠 Running comprehensive script analysis...")
        
        # Initialize analyzer
        analyzer = ScriptAnalyzer(
            source_dir=str(Path(__file__).parent.parent.parent / "ScriptsFound"),
            rebuilt_dir=str(Path(__file__).parent.parent.parent / "rebuilt_project"),
            logger=self.logger
        )
        
        # Run full analysis
        analysis_report = analyzer.analyze_project_coverage()
        
        # Save detailed report
        report_path = str(Path(__file__).parent.parent.parent / "analysis_report.json")
        analyzer.save_analysis_report(report_path)
        
        # Generate LLM completion requests
        completion_requests = analyzer.generate_llm_completion_requests()
        
        # Save completion requests for LLM feeding
        llm_requests_path = str(Path(__file__).parent.parent.parent / "llm_completion_requests.json")
        with open(llm_requests_path, 'w', encoding='utf-8') as f:
            import json
            json.dump(completion_requests, f, indent=2)
        
        self.logger(f"📊 Analysis complete. Found {analysis_report['summary']['total_issues']} issues.")
        self.logger(f"📄 Reports saved: {report_path} and {llm_requests_path}")
        
        return {
            "analysis_report": analysis_report,
            "completion_requests": completion_requests,
            "report_path": report_path,
            "llm_requests_path": llm_requests_path
        }
    
    def run_comprehensive_enhancements(self, output_path: str, analysis_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Run comprehensive enhancements after basic fixes are applied.
        This converts the chaotic codebase into proper best practices.
        """
        if not ENHANCER_AVAILABLE:
            self.logger("⚠️ Comprehensive enhancer not available")
            return {}
        
        self.logger("🚀 Starting comprehensive enhancement sequence...")
        
        enhancer = ComprehensiveEnhancer(
            base_dir=str(Path(output_path).parent),
            logger=self.logger
        )
        
        enhancement_results = enhancer.enhance_all(output_path, analysis_data)
        
        self.logger("✅ Comprehensive enhancement complete!")
        return enhancement_results
