"""
Code Sanitization Module - Harvested from auto_rebuilder.py
Advanced code sanitization and package categorization for massive-scale integration.
"""

import ast
import os
import re
from typing import Dict, Any, List, Optional


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


def determine_package_category(filename: str, source_folder: str = "ScriptsFound") -> str:
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
    filepath = os.path.join(source_folder, filename)
    
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


def sanitize_python_code(code: str, filename: str = "unknown") -> str:
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
        
        clean_lines.append(line)
    
    # Join back into code string
    clean_code = '\n'.join(clean_lines)
    
    # Remove excessive newlines at start and end
    clean_code = clean_code.strip()
    
    # Ensure file ends with newline for proper syntax
    if clean_code and not clean_code.endswith('\n'):
        clean_code += '\n'
    
    return clean_code


def is_documentation_file(code: str) -> bool:
    """
    Determine if a file is primarily documentation rather than functional code.
    Enhanced to handle massive codebases with mixed content types.
    """
    # Skip very short files - they're likely not pure documentation
    if len(code) < 50:
        return False
    
    lines = code.split('\n')
    code_lines = [line for line in lines if line.strip() and not line.strip().startswith('#')]
    comment_lines = [line for line in lines if line.strip().startswith('#')]
    
    # Very few actual code lines suggests documentation
    if len(code_lines) < 5:
        return True
    
    # High ratio of comments to code suggests documentation
    if len(comment_lines) > len(code_lines) * 2:
        return True
    
    # Check for documentation patterns
    doc_patterns = [
        r'README', r'GUIDE', r'MANUAL', r'HOWTO', r'TUTORIAL',
        r'^\s*#\s*[A-Z][A-Z\s]+$',  # ALL CAPS HEADERS
        r'^\s*#\s*=+\s*$',  # Separator lines
        r'^\s*#\s*-+\s*$',  # Separator lines
    ]
    
    doc_score = 0
    for line in lines[:20]:  # Check first 20 lines
        for pattern in doc_patterns:
            if re.search(pattern, line, re.IGNORECASE):
                doc_score += 1
    
    # If lots of documentation patterns and few code patterns
    py_patterns = ['def ', 'class ', 'import ', 'from ', '= ', 'if ', 'for ', 'while ']
    py_score = sum(1 for line in lines[:20] for pattern in py_patterns if pattern in line)
    
    # Documentation if high doc score and low python score
    return doc_score > 3 and py_score < 3


def extract_main_block(tree: ast.AST) -> Optional[List[ast.stmt]]:
    """
    Extract the main block from an AST tree for refactoring into a main() function.
    """
    main_block = []
    
    for node in tree.body:
        if isinstance(node, ast.If):
            # Check if this is the __main__ guard
            if (isinstance(node.test, ast.Compare) and
                isinstance(node.test.left, ast.Name) and
                node.test.left.id == '__name__' and
                len(node.test.ops) == 1 and
                isinstance(node.test.ops[0], ast.Eq) and
                len(node.test.comparators) == 1 and
                isinstance(node.test.comparators[0], ast.Constant) and
                node.test.comparators[0].value == '__main__'):
                main_block.extend(node.body)
    
    return main_block if main_block else None


def has_main_function(tree: ast.AST) -> bool:
    """
    Check if the tree already has a main() function defined.
    """
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == 'main':
            return True
    return False


def remove_main_block(tree: ast.AST) -> ast.AST:
    """
    Remove the __main__ block from the AST tree.
    """
    new_body = []
    
    for node in tree.body:
        if isinstance(node, ast.If):
            # Check if this is the __main__ guard
            if (isinstance(node.test, ast.Compare) and
                isinstance(node.test.left, ast.Name) and
                node.test.left.id == '__name__' and
                len(node.test.ops) == 1 and
                isinstance(node.test.ops[0], ast.Eq) and
                len(node.test.comparators) == 1 and
                isinstance(node.test.comparators[0], ast.Constant) and
                node.test.comparators[0].value == '__main__'):
                # Skip this node (don't add to new_body)
                continue
        
        new_body.append(node)
    
    tree.body = new_body
    return tree


def wrap_main_as_function(main_block: List[ast.stmt]) -> ast.FunctionDef:
    """
    Wrap the main block statements in a main() function.
    """
    # Create the main function
    main_func = ast.FunctionDef(
        name='main',
        args=ast.arguments(
            posonlyargs=[],
            args=[],
            vararg=None,
            kwonlyargs=[],
            kw_defaults=[],
            kwarg=None,
            defaults=[]
        ),
        body=main_block,
        decorator_list=[],
        returns=None
    )
    
    return main_func


def add_exception_guard(tree: ast.AST) -> ast.AST:
    """
    Add sophisticated exception handling to make code more resilient
    when integrating thousands of unrelated scripts.
    """
    # Create a try-except wrapper for the entire module body (except imports)
    imports = []
    other_statements = []
    
    for node in tree.body:
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            imports.append(node)
        else:
            other_statements.append(node)
    
    if other_statements:
        # Create exception handler
        exception_handler = ast.ExceptHandler(
            type=ast.Name(id='Exception', ctx=ast.Load()),
            name='e',
            body=[
                ast.Expr(
                    value=ast.Call(
                        func=ast.Name(id='print', ctx=ast.Load()),
                        args=[
                            ast.JoinedStr(
                                values=[
                                    ast.Constant(value='Error in module: '),
                                    ast.FormattedValue(
                                        value=ast.Name(id='e', ctx=ast.Load()),
                                        conversion=-1,
                                        format_spec=None
                                    )
                                ]
                            )
                        ],
                        keywords=[]
                    )
                )
            ]
        )
        
        # Wrap other statements in try-except
        try_except = ast.Try(
            body=other_statements,
            handlers=[exception_handler],
            orelse=[],
            finalbody=[]
        )
        
        # Reconstruct the body with imports first, then try-except
        tree.body = imports + [try_except]
    
    return tree
