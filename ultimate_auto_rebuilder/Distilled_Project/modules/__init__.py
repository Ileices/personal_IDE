"""
Modules Package
Ultimate Auto-Rebuilder Core Modules

This package contains all the core functionality modules:
- RBY Intelligence Core
- Recursive Intelligence Engine
- Code Processor
- Testing System  
- Script Gatherer
- Version Manager
"""

from .rby_intelligence_core import RBYIntelligenceCore
from .recursive_intelligence import RecursiveIntelligenceEngine
from .code_processor import CodeProcessor
from .testing_system import TestingSystem
from .script_gatherer import ScriptGatherer
from .version_manager import VersionManager

__all__ = [
    'RBYIntelligenceCore',
    'RecursiveIntelligenceEngine', 
    'CodeProcessor',
    'TestingSystem',
    'ScriptGatherer',
    'VersionManager'
]

__version__ = '1.0.0-ultimate'
