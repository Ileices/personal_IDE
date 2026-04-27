"""
Initialization Package
Ultimate Auto-Rebuilder System Initialization

This package handles system startup and environment setup.
"""

from .system_initializer import SystemInitializer, initialize_ultimate_auto_rebuilder

__all__ = [
    'SystemInitializer',
    'initialize_ultimate_auto_rebuilder'
]

__version__ = '1.0.0-ultimate'
