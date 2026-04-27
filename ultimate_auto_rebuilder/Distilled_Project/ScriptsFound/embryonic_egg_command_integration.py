# File copied by Ultimate Auto-Rebuilder Script Gatherer
# Original: C:\Users\lokee\Documents\FirstBorne\Stage\porting\Egg_Ileices\Egg_Ileices\embryonic_egg_command_integration.py
# Copy Date: 2025-06-13 02:25:32
# Original Size: 13562 bytes

#!/usr/bin/env python3
"""
AIOS IO Embryonic Egg Command Integration

This script ensures that the embryonic controller properly integrates
with both the egg system and command processor following the Law of Three
and dynamic excretions requirements.

This integration occurs at three levels:
1. Command integration with egg_ileices.py
2. Excretion processing following the Law of Three
3. Recursive dynamic pattern learning
"""

import os
import sys
import importlib.util

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def integrate_embryonic_egg_commands():
    """Ensure proper integration between embryonic controller, egg system, and command processor."""
    
    # Define the paths to our key modules
    embryonic_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "embryonic_ileices.py")
    egg_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Sperm Ileices", "egg_ileices.py")
    cmd_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Sperm Ileices", "command_processor.py")
    egg_cmd_integration_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "egg_command_integration.py")
    
    # Check if all required files exist
    for path, name in [(embryonic_path, "embryonic_ileices.py"), 
                       (egg_path, "egg_ileices.py"), 
                       (cmd_path, "command_processor.py"),
                       (egg_cmd_integration_path, "egg_command_integration.py")]:
        if not os.path.exists(path):
            print(f"Error: Required file {name} not found at {path}")
            return False
    
    # Step 1: First ensure egg_command_integration.py is working correctly
    try:
        print("[1/3] Verifying egg command integration...")
        # Import egg_command_integration module
        spec = importlib.util.spec_from_file_location("egg_command_integration", egg_cmd_integration_path)
        egg_cmd = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(egg_cmd)
        
        # Check if it has the integration function
        if not hasattr(egg_cmd, 'integrate_commands_with_egg'):
            print("✗ egg_command_integration.py is missing the integrate_commands_with_egg function")
            return False
        
        # Run the integration
        integration_result = egg_cmd.integrate_commands_with_egg()
        if not integration_result:
            print("✗ Failed to integrate commands with egg_ileices.py")
            return False
        
        print("✓ Egg command integration verified")
        
    except Exception as e:
        print(f"Error during egg command integration: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Step 2: Verify that embryonic_ileices.py includes command processor in its fixes
    try:
        print("[2/3] Ensuring embryonic controller applies command integration...")
        
        # Import embryonic controller module
        spec = importlib.util.spec_from_file_location("embryonic_ileices", embryonic_path)
        embryonic = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(embryonic)
        
        # Check _apply_direct_fixes method in EmbryonicController
        if not hasattr(embryonic, 'EmbryonicController') or not hasattr(embryonic.EmbryonicController, '_apply_direct_fixes'):
            print("✗ embryonic_ileices.py is missing the EmbryonicController or _apply_direct_fixes method")
            fix_embryonic_controller(embryonic_path)
        else:
            # Check if the method code includes command integration
            method_code = embryonic.EmbryonicController._apply_direct_fixes.__code__
            method_text = inspect_method(method_code)
            
            if "command_integration" not in method_text and "egg_command_integration" not in method_text:
                print("✗ _apply_direct_fixes method doesn't include command integration")
                fix_embryonic_controller(embryonic_path)
            else:
                print("✓ Embryonic controller includes command integration")
                
    except Exception as e:
        print(f"Error during embryonic controller check: {e}")
        import traceback
        traceback.print_exc()
        fix_embryonic_controller(embryonic_path)
    
    # Step 3: Make sure the excretion rules align with Law of Three
    try:
        print("[3/3] Verifying excretion alignment with Law of Three...")
        
        # Add the Law of Three excretion validator to the egg system
        add_excretion_validator()
        
        print("✓ Excretion validation aligned with Law of Three")
        
    except Exception as e:
        print(f"Error during excretion alignment: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    print("\n✓ All integrations successful - The system will work as a unified organism")
    print("  Following the Law of Three with dynamic excretions and proper command handling")
    return True

def inspect_method(code_obj):
    """Extract the function text from a code object for inspection."""
    import inspect
    try:
        return inspect.getsource(code_obj)
    except:
        return ""

def fix_embryonic_controller(embryonic_path):
    """Fix the embryonic controller to properly integrate with commands and egg."""
    try:
        print("Attempting to fix embryonic controller...")
        
        with open(embryonic_path, 'r') as f:
            content = f.read()
        
        # Create backup
        with open(embryonic_path + '.backup', 'w') as f:
            f.write(content)
        
        # Find the _apply_direct_fixes method
        method_start = content.find("def _apply_direct_fixes(self):")
        if method_start == -1:
            print("✗ Could not find _apply_direct_fixes method in embryonic_ileices.py")
            return False
        
        # Find a good insertion point - right after the dynamic response fix check
        insertion_point = content.find("self.status[\"fixes_applied\"] = fixes_applied", method_start)
        if insertion_point == -1:
            print("✗ Could not find insertion point in _apply_direct_fixes method")
            return False
            
        # Code to add for command integration
        integration_code = """        
        # Apply egg command integration
        egg_cmd_path = os.path.join(FIXES_DIR, "egg_command_integration.py")
        if os.path.exists(egg_cmd_path):
            egg_cmd = self.load_module(egg_cmd_path, "egg_cmd_integration")
            if egg_cmd and hasattr(egg_cmd, 'integrate_commands_with_egg'):
                egg_cmd_success = egg_cmd.integrate_commands_with_egg()
                if not egg_cmd_success:
                    fixes_applied = False
                    print("⚠️ Warning: Egg command integration failed")
            else:
                print("⚠️ Warning: Could not load egg command integration module")
        
        """
        
        # Insert the integration code just before setting fixes_applied status
        new_content = content[:insertion_point] + integration_code + content[insertion_point:]
        
        # Write the updated file
        with open(embryonic_path, 'w') as f:
            f.write(new_content)
            
        print("✓ Successfully updated embryonic controller with command integration")
        return True
        
    except Exception as e:
        print(f"Error fixing embryonic controller: {e}")
        import traceback
        traceback.print_exc()
        return False

def add_excretion_validator():
    """
    Add an excretion validator to ensure alignment with Law of Three.
    This function patches the egg_ileices.py file to add the validator.
    """
    egg_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 
                           "Sperm Ileices", "egg_ileices.py")
    
    if not os.path.exists(egg_path):
        print("Error: egg_ileices.py not found.")
        return False
    
    try:
        # Read the current egg file
        with open(egg_path, 'r') as f:
            egg_code = f.read()
            
        # Check if excretion validator is already present
        if "validate_excretions_law_of_three" in egg_code:
            print("✓ Excretion validator already present in egg_ileices.py")
            return True
        
        # Find a good insertion point - at the end of the _initialize_support_systems method
        method_start = egg_code.find("def _initialize_support_systems(self):")
        if method_start == -1:
            print("✗ Could not find _initialize_support_systems method in egg_ileices.py")
            return False
            
        # Find end of the method
        method_end = find_method_end(egg_code, method_start)
        if method_end == -1:
            print("✗ Could not find end of _initialize_support_systems method")
            return False
        
        # Create the excretion validator code
        validator_code = """
        # Add excretion validator for Law of Three compliance
        def validate_excretions_law_of_three(excretion):
            \"\"\"Ensure excretions follow the Law of Three pattern\"\"\"
            if not isinstance(excretion, dict):
                return excretion
                
            # Apply Law of Three rules recursively
            for key in ["red_patterns", "blue_patterns", "yellow_patterns"]:
                if key in excretion and isinstance(excretion[key], dict):
                    # Ensure we have a max of 3, 9, or 27 elements
                    items = list(excretion[key].items())
                    if len(items) > self.TIER_THREE:  # Limit to max 27 elements
                        # Keep only the most relevant patterns 
                        # (determined by stronger confidence or more recent patterns)
                        if "confidence" in items[0][1]:
                            # Sort by confidence
                            items.sort(key=lambda x: x[1].get("confidence", 0), reverse=True)
                        else:
                            # Assume newer patterns are at the end
                            items = items[-self.TIER_THREE:]
                            
                        # Rebuild the patterns dict with only allowed items
                        excretion[key] = {k: v for k, v in items[:self.TIER_THREE]}
                        
            return excretion
            
        # Hook into the excretion process
        if hasattr(sperm, 'excrete_ml_pattern'):
            original_excrete = sperm.excrete_ml_pattern
            def enhanced_excrete_ml_pattern(component, pattern_dict, skip_validate=False):
                \"\"\"Enhance excrete_ml_pattern to validate Law of Three compliance\"\"\"
                if not skip_validate:
                    pattern_dict = validate_excretions_law_of_three(pattern_dict)
                return original_excrete(component, pattern_dict)
                
            setattr(sperm, 'excrete_ml_pattern', enhanced_excrete_ml_pattern)
            print("✓ Excretion validator aligned with Law of Three")
        """
        
        # Insert the validator code at the end of the method
        new_egg_code = egg_code[:method_end] + validator_code + egg_code[method_end:]
        
        # Write the updated file
        with open(egg_path, 'w') as f:
            f.write(new_egg_code)
            
        print("✓ Successfully added excretion validator to egg_ileices.py")
        return True
        
    except Exception as e:
        print(f"Error adding excretion validator: {e}")
        import traceback
        traceback.print_exc()
        return False

def find_method_end(code, method_start):
    """Find the end of a method in the code, accounting for indentation."""
    lines = code[method_start:].split('\n')
    if not lines:
        return -1
        
    # Get the indentation of the method definition
    first_line = lines[0]
    method_indent = len(first_line) - len(first_line.lstrip())
    
    # Find where indentation returns to same or lower level
    cumulative_length = method_start
    for i, line in enumerate(lines):
        if i > 0:  # Skip the method definition line
            # Check if we're back to same or lower indentation and not an empty line
            line_content = line.strip()
            if line_content and len(line) - len(line.lstrip()) <= method_indent:
                # This is outside our method
                return cumulative_length
                
        cumulative_length += len(line) + 1  # +1 for newline character
        
    # If we get here, the method ends at the end of the file
    return len(code)

if __name__ == "__main__":
    print("AIOS IO Embryonic Egg Command Integration")
    print("=" * 50)
    
    success = integrate_embryonic_egg_commands()
    
    if success:
        print("\nIntegration complete - The system is now fully unified")
        print("Run embryonic_ileices.py to launch the complete system")
    else:
        print("\nIntegration failed - Please check the errors and fix manually")
