"""
Ultimate Auto-Rebuilder - Distilled Edition
The complete unified auto-rebuilder with all features harvested from 9 enhancement scripts.

This is the ultimate distillation of:
- RBY Intelligence Core (Red-Blue-Yellow classification system)
- Recursive Intelligence (3, 9, 27 expansion pattern)  
- 24/7 Continuous Processing
- Advanced Testing & Exploration
- Script Gathering & Collection
- Excretion/Reabsorption Learning
- Version Management with Quality Tracking
- Intelligent Import Resolution
- Namespace Conflict Resolution
- Module Clustering & Dependency Analysis

Features harvested from:
- auto_rebuilder.py (main code processing)
- sperm_ileices.py (RBY Intelligence System)
- enhanced_rby_rebuilder.py (RBY Intelligence Engine)
- enhanced_auto_rebuilder_v2.py (recursive intelligence)
- enhanced_auto_rebuilder.py (intelligence system)
- test_exploration_fixed.py (safe testing)
- test_exploration.py (component testing)
- script_gather.py (script collection)
- quick_test.py (dependency checking)

Created by harvesting ALL capabilities and unifying them into a modular,
computer science best practices architecture.
"""

__version__ = '1.0.0-ultimate-distilled'
__author__ = 'Ultimate Auto-Rebuilder'
__description__ = 'The ultimate unified auto-rebuilder with harvested intelligence from 9 scripts'

# Import main components
from .ultimate_auto_rebuilder import UltimateAutoRebuilder

# Import module packages
from . import modules
from . import utilities
from . import init

__all__ = [
    'UltimateAutoRebuilder',
    'modules',
    'utilities', 
    'init'
]

def main():
    """Main entry point for the Ultimate Auto-Rebuilder"""
    rebuilder = UltimateAutoRebuilder()
    rebuilder.run()

if __name__ == "__main__":
    main()
