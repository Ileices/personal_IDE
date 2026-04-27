# File copied by Ultimate Auto-Rebuilder Script Gatherer
# Original: C:\Users\lokee\Documents\FirstBorne\Stage\porting\Egg_Ileices\Egg_Ileices\command_integration_launcher.py
# Copy Date: 2025-06-13 02:25:31
# Original Size: 4128 bytes

#!/usr/bin/env python3
"""
AIOS IO Command Integration Launcher Update

This script updates the aios_enhanced_launcher.py file to include
the command processor integration.
"""

import os
import sys

def update_enhanced_launcher():
    """Update aios_enhanced_launcher.py to include command processor integration"""
    launcher_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "aios_enhanced_launcher.py")
    
    if not os.path.exists(launcher_path):
        print(f"Error: aios_enhanced_launcher.py not found at {launcher_path}")
        return False
        
    try:
        # Read the launcher file
        with open(launcher_path, 'r') as f:
            content = f.read()
            
        # Check if command integration is already included
        if "command_integration.py" in content:
            print("✓ Enhanced launcher already includes command processor integration")
            return True
            
        # Find the apply_all_fixes function
        apply_fixes_start = content.find("def apply_all_fixes():")
        if apply_fixes_start == -1:
            print("✗ Could not find apply_all_fixes function in enhanced launcher")
            return False
            
        # Find the part where it applies fixes
        apply_fixes_section = content.find("# Import and run the lecture fix", apply_fixes_start)
        if apply_fixes_section == -1:
            print("✗ Could not find the section to apply fixes in enhanced launcher")
            return False
            
        # Create our code to insert
        cmd_integration_code = """
        # Import and run the command processor integration
        cmd_integration_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "command_integration.py")
        if os.path.exists(cmd_integration_path):
            spec = importlib.util.spec_from_file_location("command_integration", cmd_integration_path)
            cmd_integration = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(cmd_integration)
            
            # Apply command processor integration
            cmd_success = cmd_integration.integrate_command_processor()
            if not cmd_success:
                print("⚠️ Warning: Command processor integration failed")
        """
        
        # Insert our code right before the success check
        success_check = content.find("if lecture_success and dynamic_success:", apply_fixes_section)
        if success_check == -1:
            print("✗ Could not find success check in enhanced launcher")
            return False
            
        # Update the success check to include command integration
        updated_success_check = "cmd_success = True  # Assume success unless set to False above\n        if lecture_success and dynamic_success and cmd_success"
        
        # Create the updated content
        new_content = (
            content[:apply_fixes_section] + 
            content[apply_fixes_section:success_check] +
            cmd_integration_code +
            "\n        " + 
            updated_success_check + 
            content[success_check + len("if lecture_success and dynamic_success:"):]
        )
        
        # Write updated content
        with open(launcher_path, 'w') as f:
            f.write(new_content)
            
        print("✓ Updated enhanced launcher to include command processor integration")
        return True
        
    except Exception as e:
        print(f"Error updating enhanced launcher: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("AIOS IO Command Integration Launcher Update")
    print("=" * 50)
    
    result = update_enhanced_launcher()
    
    if result:
        print("\nEnhanced launcher successfully updated")
        print("Command processor will be integrated during system launch")
    else:
        print("\nFailed to update enhanced launcher")
        print("Please apply the changes manually")
