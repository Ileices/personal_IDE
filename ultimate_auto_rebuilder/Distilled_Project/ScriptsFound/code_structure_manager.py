# File copied by Ultimate Auto-Rebuilder Script Gatherer
# Original: C:\Users\lokee\Documents\FirstBorne\Stage\porting\Egg_Ileices\Egg_Ileices\Sperm_Ileices\Sperm_Ileices\code_structure_manager.py
# Copy Date: 2025-06-13 02:25:36
# Original Size: 15811 bytes

#!/usr/bin/env python3
"""
AIOS IO Code Structure Manager

This module helps organize and manage the distributed code architecture 
of the AIOS IO system, ensuring that enhancements are placed in the correct
files and that modules stay under the 1300-line limit.

It provides utilities to:
1. Analyze code structure and line counts
2. Recommend where new code should be placed
3. Implement hooks for cross-module integration
4. Generate new module templates when modules approach size limits
"""

import os
import sys
from datetime import datetime

class CodeStructureManager:
    """
    Manages the code structure of the AIOS IO system, ensuring proper
    organization and compliance with architectural guidelines.
    """
    
    def __init__(self, base_dir=None):
        """Initialize the code structure manager."""
        if base_dir is None:
            # Default to the parent directory of this file
            self.base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        else:
            self.base_dir = base_dir
        
        self.tests_dir = os.path.join(self.base_dir, "tests")
        self.sperm_ileices_dir = os.path.join(self.tests_dir, "Sperm Ileices")
        
        # Critical modules to track
        self.critical_modules = {
            "sperm_ileices": os.path.join(self.sperm_ileices_dir, "sperm_ileices.py"),
            "egg_ileices": os.path.join(self.sperm_ileices_dir, "egg_ileices.py"),
            "aios_enhanced_launcher": os.path.join(self.tests_dir, "aios_enhanced_launcher.py"),
            "embryonic_ileices": os.path.join(self.tests_dir, "embryonic_ileices.py")
        }
        
        # Line count limits
        self.LINE_LIMIT = 1300
        
        # Module version tracking - keeps track of when modules reach their size limit
        self.module_versions = {}
        self.version_file = os.path.join(self.tests_dir, "module_versions.json")
        self._load_module_versions()
    
    def analyze_code_structure(self):
        """Analyze the current code structure and report on module sizes."""
        results = {}
        
        for module_name, module_path in self.critical_modules.items():
            if os.path.exists(module_path):
                try:
                    with open(module_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    with open(module_path, 'r', encoding='utf-8') as f:
                        all_lines = f.read().splitlines()
                        
                        # Count lines, excluding blank lines and comments
                        code_lines = [line for line in all_lines if line.strip() and not line.strip().startswith("#")]
                    results[module_name] = {
                        "total_lines": len(all_lines),
                        "code_lines": len(code_lines),
                        "path": module_path,
                        "approaching_limit": len(all_lines) > self.LINE_LIMIT * 0.8,
                        "exceeded_limit": len(all_lines) > self.LINE_LIMIT
                    }
                    
                except Exception as e:
                    results[module_name] = {
                        "error": str(e),
                        "path": module_path
                    }
            else:
                results[module_name] = {
                    "error": "File not found",
                    "path": module_path
                }
        
        return results
    
    def recommend_enhancement_location(self, enhancement_type):
        """
        Recommend where a new enhancement should be placed based on 
        current module sizes and the type of enhancement.
        """
        analysis = self.analyze_code_structure()
        
        # First check if aios_enhanced_launcher is still under the limit
        if "aios_enhanced_launcher" in analysis:
            launcher_info = analysis["aios_enhanced_launcher"]
            if not launcher_info.get("exceeded_limit", False):
                return "aios_enhanced_launcher", launcher_info.get("path")
        
        # If launcher is over limit or unavailable, check if this should go in a specialized module
        specialized_modules = self._find_specialized_modules()
        for module_name, module_info in specialized_modules.items():
            if enhancement_type.lower() in module_name.lower() and not module_info.get("exceeded_limit", False):
                return module_name, module_info.get("path")
        
        # If no suitable specialized module exists, recommend creating one or using embryonic_ileices
        if "embryonic_ileices" in analysis:
            embryo_info = analysis["embryonic_ileices"]
            if not embryo_info.get("exceeded_limit", False):
                return "embryonic_ileices", embryo_info.get("path")
        
        # Recommend creating a new specialized module
        new_module_name = f"{enhancement_type.lower().replace(' ', '_')}_module.py"
        new_module_path = os.path.join(self.tests_dir, new_module_name)
        return f"new_specialized_module", new_module_path
    
    def create_specialized_module(self, module_name, description, functionality=None):
        """Create a new specialized module with proper header and structure."""
        # Ensure the module name has proper formatting
        if not module_name.endswith('.py'):
            module_name += '.py'
        
        module_path = os.path.join(self.tests_dir, module_name)
        
        # Don't overwrite existing modules
        if os.path.exists(module_path):
            version = 2
            while os.path.exists(os.path.join(self.tests_dir, f"{module_name[:-3]}_{version}.py")):
                version += 1
            module_name = f"{module_name[:-3]}_{version}.py"
            module_path = os.path.join(self.tests_dir, module_name)
        
        # Create module content
        header = f"""#!/usr/bin/env python3
\"\"\"
AIOS IO {description}

This module handles specialized functionality for {description.lower()},
following the Law of Three organizational principles.

Created: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
\"\"\"

import os
import sys
import time

# Ensure we can import from parent directory
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

class {module_name[:-3].title().replace('_', '')}:
    \"\"\"
    Specialized handler for {description.lower()}.
class {module_name[:-3].title().replace('_', '')}:
    \"\"\"
    Specialized handler for {description.lower()}.
    \"\"\"
    
    def __init__(self):
        \"\"\"Initialize the {description.lower()} handler.\"\"\"
        self.initialized = False
        self.components = dict()
        
        # Constants for the Law of Three
        self.TIER_ONE = 3    # First level
        self.TIER_TWO = 9    # Second level (3²)
        self.TIER_THREE = 27 # Third level (3³)
        self.initialized = True
        return True
"""
        
        # Add requested functionality if provided
        if functionality:
            header += f"\n{functionality}\n"
        
        # Add main section
        header += """
# Main execution function - can be imported by launcher scripts
def initialize_module():
    \"\"\"Initialize and return the module handler.\"\"\"
    handler = {0}()
    success = handler.initialize()
    return handler if success else None

if __name__ == "__main__":
    print(f"AIOS IO {1}")
    handler = initialize_module()
    if handler:
        print(f"✓ {1} initialized successfully")
    else:
        print(f"✗ {1} initialization failed")
""".format(module_name[:-3].title().replace('_', ''), description)
        
        # Write the file
        with open(module_path, 'w', encoding='utf-8') as f:
            f.write(header)
        
        return module_path
    
    def check_module_needs_splitting(self, module_name):
        """Check if a module needs to be split into a new version due to size."""
        if module_name not in self.critical_modules:
            return False, None
            
        module_path = self.critical_modules[module_name]
        if not os.path.exists(module_path):
            return False, None
        
        try:
            with open(module_path, 'r', encoding='utf-8') as f:
                line_count = len(f.readlines())
            
            if line_count > self.LINE_LIMIT:
                # Calculate the next version number
                current_version = self.module_versions.get(module_name, {}).get("version", 1)
                next_version = current_version + 1
                
                # Generate the new module name
                if '_v' in module_name:
                    base_name = module_name.split('_v')[0]
                else:
                    base_name = module_name
                
                new_module_name = f"{base_name}_v{next_version}"
                
                return True, new_module_name
        except Exception:
            pass
            
        return False, None
    
    def create_module_next_version(self, module_name):
        """Create the next version of a module that has reached its size limit."""
        if module_name not in self.critical_modules:
            return None
            
        current_path = self.critical_modules[module_name]
        if not os.path.exists(current_path):
            return None
            
        needs_splitting, new_name = self.check_module_needs_splitting(module_name)
        if not needs_splitting:
            return None
        needs_splitting, _ = self.check_module_needs_splitting(module_name)
        if not needs_splitting:
            return None
            base_name = os.path.basename(current_path).split('_v')[0]
            version = int(os.path.basename(current_path).split('_v')[1].split('.')[0]) + 1
            new_file_name = f"{base_name}_v{version}.py"
        else:
            base_name = os.path.basename(current_path).split('.')[0]
            version = 2
            new_file_name = f"{base_name}_v{version}.py"
            
        new_path = os.path.join(os.path.dirname(current_path), new_file_name)
        
        try:
            # Read the original file
            with open(current_path, 'r', encoding='utf-8') as f:
                content = f.read()
                
            # Create header for the new file indicating it's a continuation
            header = f"""#!/usr/bin/env python3
\"\"\"
AIOS IO {base_name} - Version {version}

This module is a continuation of {os.path.basename(current_path)} which reached
the 1300 line limit. It contains extended functionality while maintaining
compatibility with the original module.

Created: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
\"\"\"

import os
import sys
import time

# Import the original module
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import {module_name}

# Original module reference for accessing shared components
original_module = {module_name}

# Version tracking
MODULE_VERSION = {version}
ORIGINAL_MODULE = "{module_name}"

"""
            
            # Write the new file
            with open(new_path, 'w', encoding='utf-8') as f:
                f.write(header)
                
            # Update version tracking
            self.module_versions[module_name] = {
                "version": version,
                "original_path": current_path,
                "new_path": new_path,
                "created": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
            self._save_module_versions()
                
            return new_path
                
        except Exception as e:
            print(f"Error creating next version of {module_name}: {e}")
            return None
    
    def _find_specialized_modules(self):
        """Find all specialized modules in the tests directory."""
        specialized_modules = {}
        
        # Skip these modules as they're already tracked
        skip_modules = set(os.path.basename(path) for path in self.critical_modules.values())
        
        for file in os.listdir(self.tests_dir):
            if file.endswith('.py') and file not in skip_modules:
                file_path = os.path.join(self.tests_dir, file)
                
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        
                    # Check if this appears to be a specialized module
                    if "AIOS IO" in content and "class" in content:
                        # Count lines
                        line_count = len(content.split('\n'))
                        
                        specialized_modules[file[:-3]] = {
                            "total_lines": line_count,
                            "path": file_path,
                            "approaching_limit": line_count > self.LINE_LIMIT * 0.8,
                            "exceeded_limit": line_count > self.LINE_LIMIT
                        }
                except Exception:
                    pass
                    
        return specialized_modules
    
    def _load_module_versions(self):
        """Load module version tracking information."""
        if os.path.exists(self.version_file):
            try:
                import json
                with open(self.version_file, 'r') as f:
                    self.module_versions = json.load(f)
            except Exception:
                self.module_versions = {}
        else:
            self.module_versions = {}
    
    def _save_module_versions(self):
        """Save module version tracking information."""
        try:
            import json
            with open(self.version_file, 'w') as f:
                json.dump(self.module_versions, f, indent=2)
        except Exception as e:
            print(f"Error saving module versions: {e}")

# Function to get a structure manager instance
def get_manager(base_dir=None):
    """Get a code structure manager instance."""
    return CodeStructureManager(base_dir)

# Main execution - run analysis when script is executed directly
if __name__ == "__main__":
    manager = CodeStructureManager()
    
    print("AIOS IO Code Structure Analysis")
    print("=" * 50)
    
    # Analyze current structure
    results = manager.analyze_code_structure()
    
    print("\nModule Size Analysis:")
    for module, info in results.items():
        status = "✓ OK"
        if info.get("approaching_limit", False):
            status = "⚠️ APPROACHING LIMIT"
        if info.get("exceeded_limit", False):
            status = "❌ OVER LIMIT"
            
        if "error" in info:
            print(f"{module}: ERROR - {info['error']}")
        else:
            print(f"{module}: {info.get('total_lines', 0)} lines {status}")
    
    print("\nRecommendations:")
    for enhancement_type in ["Focus", "Perception", "Memory", "Learning"]:
        location, path = manager.recommend_enhancement_location(enhancement_type)
        print(f"{enhancement_type} enhancements should go in: {location}")
        
    # Check if any modules need splitting
    for module in results:
        needs_split, new_name = manager.check_module_needs_splitting(module)
        if needs_split:
            print(f"\n⚠️ {module} needs to be split into {new_name}")
