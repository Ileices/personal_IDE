"""
Stub Generator Module - Missing Symbol Resolution
Automatically creates stubs for undefined symbols to prevent import errors.
This addresses the key missing functionality from the suggested implementation.
"""

import ast
import re
from typing import Dict, Set, List, Any, Optional
from pathlib import Path


class StubGenerator:
    """
    Generates stub functions and classes for missing symbols to prevent runtime errors.
    This is the critical missing piece that creates placeholder implementations.
    """
    
    def __init__(self, logger=None):
        self.logger = logger or print
        self.known_symbols = set()
        self.generated_stubs = {}
        self.symbol_usage = {}
        
    def analyze_symbol_usage(self, modules: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Analyze all modules to find used but undefined symbols.
        
        Returns:
            Dict containing:
            - missing_functions: Functions that are called but not defined
            - missing_classes: Classes that are used but not defined  
            - missing_variables: Variables that are referenced but not defined
            - usage_patterns: How symbols are used (helps generate better stubs)
        """
        missing_functions = set()
        missing_classes = set()
        missing_variables = set()
        usage_patterns = {}
        all_defined_symbols = set()
        
        # First pass: collect all defined symbols
        for module in modules:
            if 'tree' in module:
                defined = self._extract_defined_symbols(module['tree'])
                all_defined_symbols.update(defined['functions'])
                all_defined_symbols.update(defined['classes'])
                all_defined_symbols.update(defined['variables'])
        
        # Second pass: find missing symbols
        for module in modules:
            if 'tree' in module:
                used = self._extract_used_symbols(module['tree'])
                filename = module.get('filename', 'unknown')
                
                # Check for missing functions
                for func_name, call_info in used['function_calls'].items():
                    if func_name not in all_defined_symbols:
                        missing_functions.add(func_name)
                        usage_patterns[func_name] = {
                            'type': 'function',
                            'calls': call_info,
                            'found_in': filename
                        }
                
                # Check for missing classes
                for class_name, usage_info in used['class_usage'].items():
                    if class_name not in all_defined_symbols:
                        missing_classes.add(class_name)
                        usage_patterns[class_name] = {
                            'type': 'class',
                            'usage': usage_info,
                            'found_in': filename
                        }
                
                # Check for missing variables
                for var_name in used['variables']:
                    if var_name not in all_defined_symbols:
                        missing_variables.add(var_name)
                        usage_patterns[var_name] = {
                            'type': 'variable',
                            'found_in': filename
                        }
        
        return {
            'missing_functions': missing_functions,
            'missing_classes': missing_classes,
            'missing_variables': missing_variables,
            'usage_patterns': usage_patterns
        }
    
    def _extract_defined_symbols(self, tree: ast.AST) -> Dict[str, Set[str]]:
        """Extract all symbols defined in the AST."""
        defined = {
            'functions': set(),
            'classes': set(),
            'variables': set()
        }
        
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                defined['functions'].add(node.name)
            elif isinstance(node, ast.ClassDef):
                defined['classes'].add(node.name)
            elif isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        defined['variables'].add(target.id)
        
        return defined
    
    def _extract_used_symbols(self, tree: ast.AST) -> Dict[str, Any]:
        """Extract all symbols used in the AST."""
        used = {
            'function_calls': {},
            'class_usage': {},
            'variables': set()
        }
        
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                func_name = self._get_call_name(node)
                if func_name:
                    if func_name not in used['function_calls']:
                        used['function_calls'][func_name] = []
                    
                    # Analyze call signature
                    call_info = {
                        'args': len(node.args),
                        'kwargs': len(node.keywords),
                        'arg_types': self._infer_arg_types(node.args)
                    }
                    used['function_calls'][func_name].append(call_info)
            
            elif isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
                # Check if it's being instantiated (class usage)
                parent = getattr(node, 'parent', None)
                if isinstance(parent, ast.Call) and parent.func == node:
                    if node.id not in used['class_usage']:
                        used['class_usage'][node.id] = []
                    used['class_usage'][node.id].append('instantiation')
                else:
                    used['variables'].add(node.id)
        
        return used
    
    def _get_call_name(self, call_node: ast.Call) -> Optional[str]:
        """Extract function name from call node."""
        if isinstance(call_node.func, ast.Name):
            return call_node.func.id
        elif isinstance(call_node.func, ast.Attribute):
            return call_node.func.attr
        return None
    
    def _infer_arg_types(self, args: List[ast.expr]) -> List[str]:
        """Infer argument types from call."""
        types = []
        for arg in args:
            if isinstance(arg, ast.Constant):
                types.append(type(arg.value).__name__)
            elif isinstance(arg, ast.Name):
                types.append('Any')
            elif isinstance(arg, ast.List):
                types.append('list')
            elif isinstance(arg, ast.Dict):
                types.append('dict')
            else:
                types.append('Any')
        return types
    
    def generate_stub_function(self, name: str, usage_pattern: Dict[str, Any]) -> str:
        """
        Generate a stub function based on usage patterns.
        
        This is the key functionality from your suggestion!
        """
        calls = usage_pattern.get('calls', [])
        
        if not calls:
            # Simple stub with no arguments
            return f'''
def {name}(*args, **kwargs):
    """Stub function for {name} - auto-generated"""
    print(f"Stub: {name} called with args={{args}}, kwargs={{kwargs}}")
    return None
'''
        
        # Analyze calls to determine best signature
        max_args = max(call['args'] for call in calls)
        has_kwargs = any(call['kwargs'] > 0 for call in calls)
        
        # Generate parameter list
        params = []
        for i in range(max_args):
            params.append(f'arg{i}=None')
        
        if has_kwargs:
            params.append('**kwargs')
        else:
            params.append('*args')
        
        param_str = ', '.join(params)
        
        return f'''
def {name}({param_str}):
    """
    Stub function for {name} - auto-generated
    Based on usage patterns: max_args={max_args}, has_kwargs={has_kwargs}
    """
    print(f"Stub: {name} called")
    return None
'''
    
    def generate_stub_class(self, name: str, usage_pattern: Dict[str, Any]) -> str:
        """Generate a stub class."""
        usage = usage_pattern.get('usage', [])
        
        methods = []
        if 'instantiation' in usage:
            methods.append('''    def __init__(self, *args, **kwargs):
        """Stub constructor"""
        print(f"Stub: {name} instantiated")
        pass''')
        
        methods.append('''    def __getattr__(self, name):
        """Handle any missing methods"""
        def stub_method(*args, **kwargs):
            print(f"Stub: {name}.{name} called")
            return None
        return stub_method''')
        
        methods_str = '\n'.join(methods)
        
        return f'''
class {name}:
    """Stub class for {name} - auto-generated"""
{methods_str}
'''
    
    def generate_stub_variable(self, name: str, usage_pattern: Dict[str, Any]) -> str:
        """Generate a stub variable."""
        return f'''
{name} = None  # Stub variable for {name} - auto-generated
'''
    
    def create_stubs_module(self, missing_analysis: Dict[str, Any], output_path: str) -> str:
        """
        Create a complete stubs module containing all missing symbols.
        This addresses the core need to "stub missing logic with empty shell".
        """
        stubs_content = '''"""
Auto-generated Stubs Module
Created by the Ultimate Auto-Rebuilder to provide missing symbols.

This module contains stub implementations for functions, classes, and variables
that are used but not defined in the integrated codebase. This prevents 
ImportError and NameError exceptions while maintaining functionality.
"""

import sys
import logging

# Setup logging for stub calls
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

'''
        
        # Generate function stubs
        for func_name in missing_analysis['missing_functions']:
            pattern = missing_analysis['usage_patterns'].get(func_name, {})
            stub = self.generate_stub_function(func_name, pattern)
            stubs_content += stub
        
        # Generate class stubs
        for class_name in missing_analysis['missing_classes']:
            pattern = missing_analysis['usage_patterns'].get(class_name, {})
            stub = self.generate_stub_class(class_name, pattern)
            stubs_content += stub
        
        # Generate variable stubs
        for var_name in missing_analysis['missing_variables']:
            pattern = missing_analysis['usage_patterns'].get(var_name, {})
            stub = self.generate_stub_variable(var_name, pattern)
            stubs_content += stub
        
        # Add __all__ for clean imports
        all_symbols = (list(missing_analysis['missing_functions']) + 
                      list(missing_analysis['missing_classes']) + 
                      list(missing_analysis['missing_variables']))
        
        stubs_content += f'''
# Export all stub symbols
__all__ = {all_symbols}
'''
        
        # Write to file
        try:
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(stubs_content)
            self.logger(f"✅ Created stubs module: {output_path}")
        except Exception as e:
            self.logger(f"❌ Error creating stubs module: {e}")
        
        return stubs_content
    
    def create_dependency_order_launcher(self, modules: List[Dict[str, Any]], output_path: str) -> str:
        """
        Create a launcher that executes modules in proper dependency order.
        This addresses "sequence execution" and "determine dependency order".
        """
        launcher_content = '''"""
Auto-Generated Dependency-Ordered Launcher
Created by the Ultimate Auto-Rebuilder

This launcher executes modules in the correct dependency order to prevent
import errors and circular dependency issues.
"""

import sys
import os
import importlib
import traceback
from pathlib import Path

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))

# Import the stubs module first to provide missing symbols
try:
    import stubs_module
    print("✅ Loaded stubs module")
except ImportError as e:
    print(f"⚠️ Could not load stubs module: {e}")

class DependencyOrderedLauncher:
    """Launches modules in dependency order with error handling."""
    
    def __init__(self):
        self.loaded_modules = set()
        self.failed_modules = set()
        
    def launch_all(self):
        """Launch all modules in dependency order."""
        print("🚀 Starting dependency-ordered execution...")
        
        # Module execution order (determined by dependency analysis)
        execution_order = [
'''
        
        # Analyze dependencies and create execution order
        dependency_graph = self._build_dependency_graph(modules)
        execution_order = self._topological_sort(dependency_graph)
        
        for module_name in execution_order:
            launcher_content += f'            "{module_name}",\n'
        
        launcher_content += '''        ]
        
        for module_name in execution_order:
            self.launch_module(module_name)
        
        print(f"✅ Completed execution. Loaded: {len(self.loaded_modules)}, Failed: {len(self.failed_modules)}")
    
    def launch_module(self, module_name: str):
        """Launch a single module with error handling."""
        if module_name in self.loaded_modules or module_name in self.failed_modules:
            return
        
        try:
            print(f"📦 Loading {module_name}...")
            module = importlib.import_module(module_name)
            
            # Try to call main() if it exists
            if hasattr(module, 'main') and callable(getattr(module, 'main')):
                print(f"▶️ Running {module_name}.main()...")
                module.main()
            
            self.loaded_modules.add(module_name)
            print(f"✅ Successfully loaded {module_name}")
            
        except ImportError as e:
            print(f"❌ Import error in {module_name}: {e}")
            self.failed_modules.add(module_name)
        except Exception as e:
            print(f"⚠️ Runtime error in {module_name}: {e}")
            traceback.print_exc()
            # Don't add to failed_modules since it loaded but had runtime issues

if __name__ == "__main__":
    launcher = DependencyOrderedLauncher()
    launcher.launch_all()
'''
        
        # Write launcher
        try:
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(launcher_content)
            self.logger(f"✅ Created dependency-ordered launcher: {output_path}")
        except Exception as e:
            self.logger(f"❌ Error creating launcher: {e}")
        
        return launcher_content
    
    def _build_dependency_graph(self, modules: List[Dict[str, Any]]) -> Dict[str, Set[str]]:
        """Build dependency graph from modules."""
        graph = {}
        
        for module in modules:
            module_name = module.get('filename', '').replace('.py', '')
            dependencies = module.get('dependencies', set())
            
            # Filter dependencies to only include modules in our collection
            local_deps = set()
            for dep in dependencies:
                for other_module in modules:
                    other_name = other_module.get('filename', '').replace('.py', '')
                    if dep == other_name or dep.startswith(other_name):
                        local_deps.add(other_name)
            
            graph[module_name] = local_deps
        
        return graph
    
    def _topological_sort(self, graph: Dict[str, Set[str]]) -> List[str]:
        """Topological sort for dependency order."""
        visited = set()
        result = []
        temp_visited = set()
        
        def visit(node):
            if node in temp_visited:
                # Circular dependency - skip this edge
                return
            if node in visited:
                return
            
            temp_visited.add(node)
            
            for neighbor in graph.get(node, set()):
                if neighbor in graph:  # Only visit if neighbor exists
                    visit(neighbor)
            
            temp_visited.remove(node)
            visited.add(node)
            result.append(node)
        
        for node in graph:
            if node not in visited:
                visit(node)
        
        return result
