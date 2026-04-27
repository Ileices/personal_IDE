"""
File Name Sanitizer Module - Critical Fix for Invalid Python Module Names
This module fixes the critical bug where files with invalid Python names break imports.
"""

import re
import os
from typing import Dict, Set, List, Tuple


def sanitize_filename_for_python(filename: str) -> str:
    """
    Convert any filename to a valid Python module name.
    
    Critical fixes:
    - Remove file extensions
    - Convert spaces, hyphens, special chars to underscores
    - Ensure starts with letter or underscore
    - Handle duplicate names
    - Prevent Python keywords conflicts
    """
    # Remove file extension
    name = os.path.splitext(filename)[0]
    
    # Convert problematic characters to underscores
    name = re.sub(r'[^a-zA-Z0-9_]', '_', name)
    
    # Remove multiple consecutive underscores
    name = re.sub(r'_+', '_', name)
    
    # Remove leading/trailing underscores
    name = name.strip('_')
    
    # Ensure starts with letter or underscore (not digit)
    if name and name[0].isdigit():
        name = f'module_{name}'
    
    # Ensure not empty
    if not name:
        name = 'unnamed_module'
    
    # Check against Python keywords
    python_keywords = {
        'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
        'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
        'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
        'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try',
        'while', 'with', 'yield'
    }
    
    if name in python_keywords:
        name = f'{name}_module'
    
    return name


def create_filename_mapping(file_list: List[str]) -> Dict[str, str]:
    """
    Create a mapping from original file paths to sanitized Python module names.
    Extracts just the filename from full paths and handles duplicates by adding numeric suffixes.
    """
    mapping = {}
    used_names = set()
    
    for original_file in file_list:
        # Extract just the filename from the full path
        filename_only = os.path.basename(original_file)
        
        # Sanitize the filename for Python module import
        base_name = sanitize_filename_for_python(filename_only)
        
        # Handle duplicates
        if base_name in used_names:
            counter = 2
            while f"{base_name}_{counter}" in used_names:
                counter += 1
            base_name = f"{base_name}_{counter}"
        
        used_names.add(base_name)
        mapping[original_file] = base_name
    
    return mapping


def validate_import_statement(import_statement: str) -> bool:
    """
    Validate that an import statement is syntactically correct.
    """
    try:
        # Try to compile the import statement
        compile(import_statement, '<string>', 'exec')
        return True
    except SyntaxError:
        return False


def generate_safe_imports(module_mapping: Dict[str, str], 
                         dependency_graph: Dict[str, Set[str]]) -> Dict[str, List[str]]:
    """
    Generate syntactically correct import statements for each module.
    
    Args:
        module_mapping: Map from original filename to sanitized module name
        dependency_graph: Dependencies between modules
        
    Returns:
        Dict mapping each module to its safe import statements
    """
    safe_imports = {}
    
    for original_file, sanitized_name in module_mapping.items():
        imports = []
        
        # Get dependencies for this file
        deps = dependency_graph.get(original_file, set())
        
        for dep_file in deps:
            if dep_file in module_mapping:
                dep_module = module_mapping[dep_file]
                
                # Generate safe import statement
                import_stmt = f"from .{dep_module} import *"
                
                # Validate the import statement
                if validate_import_statement(import_stmt):
                    imports.append(import_stmt)
                else:
                    # Fallback to regular import if from import fails
                    alt_stmt = f"import {dep_module}"
                    if validate_import_statement(alt_stmt):
                        imports.append(alt_stmt)
        
        safe_imports[sanitized_name] = imports
    
    return safe_imports


def detect_circular_imports(dependency_graph: Dict[str, Set[str]]) -> List[List[str]]:
    """
    Detect circular import dependencies using depth-first search.
    
    Returns:
        List of circular dependency chains
    """
    def dfs(node: str, path: Set[str], visited: Set[str]) -> List[List[str]]:
        if node in path:
            # Found a cycle - extract the cycle
            path_list = list(path)
            cycle_start = path_list.index(node)
            cycle = path_list[cycle_start:] + [node]
            return [cycle]
        
        if node in visited:
            return []
        
        visited.add(node)
        path.add(node)
        
        cycles = []
        for neighbor in dependency_graph.get(node, set()):
            cycles.extend(dfs(neighbor, path.copy(), visited))
        
        return cycles
    
    all_cycles = []
    visited = set()
    
    for node in dependency_graph:
        if node not in visited:
            all_cycles.extend(dfs(node, set(), visited))
    
    return all_cycles


def generate_clean_all_list(module_functions: Dict[str, List[str]], 
                           module_classes: Dict[str, List[str]]) -> List[str]:
    """
    Generate a clean, deduplicated __all__ list for a package.
    
    Args:
        module_functions: Map of module to list of function names
        module_classes: Map of module to list of class names
        
    Returns:
        Clean, sorted __all__ list
    """
    all_names = set()
    
    # Collect all function and class names
    for functions in module_functions.values():
        all_names.update(functions)
    
    for classes in module_classes.values():
        all_names.update(classes)
    
    # Filter out private names and Python built-ins
    public_names = {
        name for name in all_names 
        if not name.startswith('_') or name.startswith('__') and name.endswith('__')
    }
    
    # Sort for consistency
    return sorted(public_names)


def fix_package_init_file(package_path: str, module_mapping: Dict[str, str], 
                         safe_imports: Dict[str, List[str]],
                         all_list: List[str]) -> None:
    """
    Create a properly formatted __init__.py file for a package.
    """
    content_lines = [
        f'"""',
        f'{os.path.basename(package_path).title()} Package',
        f'Auto-generated by Ultimate Auto-Rebuilder - FIXED VERSION',
        f'Contains {len(module_mapping)} modules with proper import handling.',
        f'"""',
        '',
        '# Safe imports with proper error handling'
    ]
    
    # Add safe imports
    for module_name, imports in safe_imports.items():
        if imports:
            content_lines.append(f'# Imports for {module_name}')
            content_lines.append('try:')
            for import_stmt in imports:
                content_lines.append(f'    {import_stmt}')
            content_lines.append('except ImportError as e:')
            content_lines.append(f'    print(f"Warning: Could not import from {module_name}: {{e}}")')
            content_lines.append('')
    
    # Add clean __all__ list
    if all_list:
        content_lines.append('# Public API')
        content_lines.append('__all__ = [')
        for name in all_list:
            content_lines.append(f'    "{name}",')
        content_lines.append(']')
    
    # Write the file
    with open(os.path.join(package_path, '__init__.py'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(content_lines))
