# File copied by Ultimate Auto-Rebuilder Script Gatherer
# Original: C:\Users\lokee\Documents\FirstBorne\Stage\porting\Egg_Ileices\Egg_Ileices\command_integration.py
# Copy Date: 2025-06-13 02:25:31
# Original Size: 5312 bytes

#!/usr/bin/env python3
"""
AIOS IO Command Processor Integration

This script ensures that the command processor module is properly integrated
with sperm_ileices.py and available through all launch scripts.
"""

import os
import sys
import importlib.util

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def integrate_command_processor():
    """Integrate the command processor module with sperm_ileices.py"""
    
    # First check if required modules are available
    sperm_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 
                             "Sperm Ileices", "sperm_ileices.py")
    cmd_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 
                           "Sperm Ileices", "command_processor.py")
    
    if not (os.path.exists(sperm_path) and os.path.exists(cmd_path)):
        print("Error: Required modules not found in expected locations.")
        return False
    
    try:
        # Import sperm_ileices module
        spec = importlib.util.spec_from_file_location("sperm_ileices", sperm_path)
        sperm = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(sperm)
        
        # Import command_processor module
        spec = importlib.util.spec_from_file_location("command_processor", cmd_path)
        cmd_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cmd_module)
        
        # Call the integration function directly from command_processor
        if hasattr(cmd_module, 'integrate_command_processor'):
            integration_result = cmd_module.integrate_command_processor(sperm)
            if integration_result:
                print("✓ Command processor successfully integrated with sperm_ileices.py")
                return True
            else:
                print("✗ Command processor integration failed")
        else:
            print("✗ Command processor module missing integration function")
        
        return False
        
    except Exception as e:
        print(f"Error during command processor integration: {e}")
        import traceback
        traceback.print_exc()
        return False

def update_embryonic_launcher():
    """Update embryonic launcher to include command processor integration"""
    embryonic_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "embryonic_ileices.py")
    
    if not os.path.exists(embryonic_path):
        print("Warning: embryonic_ileices.py not found, cannot update")
        return False
    
    try:
        with open(embryonic_path, 'r') as f:
            content = f.read()
        
        # Check if command integration is already included
        if "command_integration.py" in content and "integrate_command_processor" in content:
            print("✓ Embryonic launcher already includes command processor integration")
            return True
            
        # Find a good insertion point in the apply_enhancements method
        insertion_point = content.find("def _apply_direct_fixes(self):")
        
        if insertion_point == -1:
            print("✗ Could not find insertion point in embryonic launcher")
            return False
            
        # Find the function body
        function_body = content.find("{", insertion_point)
        if (function_body == -1):
            function_body = content.find(":", insertion_point) + 1
            
        # Insert command integration code
        cmd_integration_code = """
        # Apply command processor integration
        if os.path.exists(os.path.join(FIXES_DIR, "command_integration.py")):
            cmd_integration = self.load_module(os.path.join(FIXES_DIR, "command_integration.py"), "cmd_integration")
            if cmd_integration and hasattr(cmd_integration, 'integrate_command_processor'):
                cmd_success = cmd_integration.integrate_command_processor()
                if not cmd_success:
                    fixes_applied = False
            else:
                fixes_applied = False
        """
        
        # Insert code after the opening brace/colon
        new_content = content[:function_body+1] + cmd_integration_code + content[function_body+1:]
        
        # Write updated content
        with open(embryonic_path, 'w') as f:
            f.write(new_content)
            
        print("✓ Updated embryonic launcher to include command processor integration")
        return True
        
    except Exception as e:
        print(f"Error updating embryonic launcher: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("AIOS IO Command Processor Integration")
    print("=" * 50)
    
    integration_result = integrate_command_processor()
    launcher_update = update_embryonic_launcher()
    
    if integration_result and launcher_update:
        print("\nCommand processor successfully integrated and launcher updated")
        print("The system will now recognize and properly process direct commands")
    else:
        print("\nSome integration steps failed. Please check the errors above")
