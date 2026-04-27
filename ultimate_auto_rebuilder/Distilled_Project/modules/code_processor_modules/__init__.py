"""
Code Processor Modules Package
Harvested functionality from auto_rebuilder.py with CRITICAL FIXES applied
"""

"""
Code Processor Modules Package
Harvested functionality from auto_rebuilder.py with CRITICAL FIXES applied
"""

from .dependency_extractor import extract_dependencies, extract_subprocess_calls
from .code_sanitizer import (
    sanitize_python_code,
    is_documentation_file,
    determine_package_category,
    extract_main_block,
    has_main_function,
    remove_main_block,
    wrap_main_as_function,
    add_exception_guard
)
from .core_refactor import refactor_file, batch_refactor_files, analyze_codebase_structure
from .critical_fixes import CriticalRebuilderFixer
from .filename_sanitizer import sanitize_filename_for_python, create_filename_mapping

# Comprehensive enhancement
try:
    from .comprehensive_enhancer import ComprehensiveEnhancer
    from .project_analyzer import ProjectAnalyzer
except ImportError:
    ComprehensiveEnhancer = None
    ProjectAnalyzer = None

__all__ = [
    'extract_dependencies',
    'extract_subprocess_calls',
    'sanitize_python_code',
    'is_documentation_file',
    'determine_package_category',
    'extract_main_block',
    'has_main_function',
    'remove_main_block',
    'wrap_main_as_function',
    'add_exception_guard',
    'refactor_file',
    'batch_refactor_files',
    'analyze_codebase_structure',
    'CriticalRebuilderFixer',
    'sanitize_filename_for_python',
    'create_filename_mapping',
    'ComprehensiveEnhancer',
    'ProjectAnalyzer'
]
