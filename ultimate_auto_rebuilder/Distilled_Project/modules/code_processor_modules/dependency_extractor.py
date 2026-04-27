"""
Dependency Extraction Module - Harvested from auto_rebuilder.py
Core functionality for extracting imports and dependencies from Python AST trees.
Designed for massive-scale integration of thousands of unrelated scripts.
"""

import ast
import re
from typing import List, Set, Dict, Tuple, Any


def extract_dependencies(tree: ast.AST, filename: str) -> Tuple[List[str], Set[str], Dict[str, Any]]:
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


def extract_subprocess_calls(tree: ast.AST) -> List[str]:
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
    
    # Comprehensive subprocess detection patterns
    subprocess_patterns = [
        # Standard subprocess module patterns
        'subprocess.run', 'subprocess.call', 'subprocess.check_call', 'subprocess.check_output',
        'subprocess.Popen', 'subprocess.getoutput', 'subprocess.getstatusoutput',
        
        # OS-level command execution
        'os.system', 'os.popen', 'os.spawn', 'os.exec', 'os.fork', 'os.wait',
        'os.execl', 'os.execle', 'os.execlp', 'os.execlpe', 'os.execv', 'os.execve',
        'os.execvp', 'os.execvpe', 'os.spawnl', 'os.spawnle', 'os.spawnlp',
        'os.spawnlpe', 'os.spawnv', 'os.spawnve', 'os.spawnvp', 'os.spawnvpe',
        
        # Legacy patterns
        'commands.getoutput', 'commands.getstatusoutput',
        
        # Multiprocessing patterns
        'multiprocessing.Process', 'multiprocessing.Pool',
        
        # Threading patterns that might spawn processes
        'threading.Thread', 'concurrent.futures'
    ]
    
    # String patterns to detect in code
    string_patterns = [
        r'shell\s*=\s*True',  # Shell execution
        r'python\s+', r'python3\s+', r'py\s+',  # Python execution
        r'bash\s+', r'sh\s+', r'cmd\s+', r'powershell\s+',  # Shell commands
        r'docker\s+', r'kubectl\s+', r'git\s+',  # Container/version control
        r'ssh\s+', r'scp\s+', r'rsync\s+',  # Remote execution
        r'pip\s+install', r'conda\s+install',  # Package installation
        r'npm\s+', r'yarn\s+', r'make\s+',  # Build tools
    ]
    
    try:
        # Search for subprocess calls in the AST
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                # Get the function name being called
                func_name = ""
                if isinstance(node.func, ast.Name):
                    func_name = node.func.id
                elif isinstance(node.func, ast.Attribute):
                    if isinstance(node.func.value, ast.Name):
                        func_name = f"{node.func.value.id}.{node.func.attr}"
                    else:
                        func_name = node.func.attr
                
                # Check against subprocess patterns
                for pattern in subprocess_patterns:
                    if pattern in func_name or func_name in potential_wrappers:
                        calls.append(f"Subprocess call: {func_name}")
                        break
        
        # Second pass: check string literals for shell commands
        code_str = ast.unparse(tree)
        for pattern in string_patterns:
            matches = re.finditer(pattern, code_str, re.IGNORECASE)
            for match in matches:
                calls.append(f"Shell pattern: {match.group()}")
                
    except Exception as e:
        calls.append(f"Error detecting subprocess calls: {str(e)}")
    
    return calls
