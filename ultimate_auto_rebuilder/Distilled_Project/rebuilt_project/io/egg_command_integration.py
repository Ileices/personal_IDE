# File copied by Ultimate Auto-Rebuilder Script Gatherer
# Original: C:\Users\lokee\Documents\FirstBorne\Stage\porting\Egg_Ileices\Egg_Ileices\egg_command_integration.py
# Copy Date: 2025-06-13 02:25:32
# Original Size: 8315 bytes

#!/usr/bin/env python3


"""
egg_command_integration.py
AIOS IO Command Processor - Egg Integration

This script ensures that the command processor module is properly integrated
with egg_ileices.py to provide command processing functionality throughout
the AIOS IO system.
"""

import os
import sys
import importlib.util

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def integrate_commands_with_egg():
    """Integrate command processor with egg_ileices.py"""
    
    # Check if required modules are available
    egg_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 
                           "Sperm Ileices", "egg_ileices.py")
    cmd_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 
                           "Sperm Ileices", "command_processor.py")
    
    if not (os.path.exists(egg_path) and os.path.exists(cmd_path)):
        print("Error: Required modules not found in expected locations.")
        return False
    
    try:
        # Import egg_ileices module
        spec = importlib.util.spec_from_file_location("egg_ileices", egg_path)
        egg = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(egg)
        
        # Import command_processor module
        spec = importlib.util.spec_from_file_location("command_processor", cmd_path)
        cmd = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cmd)
        
        # Check if AIOSEggSystem class exists and has a _bind_egg_sperm_system method
        if not hasattr(egg, 'AIOSEggSystem') or not hasattr(egg.AIOSEggSystem, '_bind_egg_sperm_system'):
            print("✗ egg_ileices.py does not contain the expected AIOSEggSystem class or binding method")
            return False
        
        # Modify the egg_ileices.py file to include command processing
        enhance_egg_command_processing(egg_path)
        
        print("✓ Command processor successfully integrated with egg_ileices.py")
        return True
        
    except Exception as e:
        print(f"Error during egg command integration: {e}")
        import traceback
        traceback.print_exc()
        return False

def enhance_egg_command_processing(egg_path):
    """Enhance egg_ileices.py with command processing capabilities"""
    try:
        with open(egg_path, 'r') as f:
            egg_code = f.read()
        
        # Create a backup
        backup_path = egg_path + ".backup"
        with open(backup_path, 'w') as f:
            f.write(egg_code)
        
        print(f"Created backup of egg_ileices.py at {backup_path}")
        
        # Check if command processing is already integrated
        if "command_processor" in egg_code and "process_system_commands" in egg_code:
            print("✓ Command processor already integrated with egg_ileices.py")
            return True
        
        # Find the _bind_egg_sperm_system method
        bind_method_start = egg_code.find("def _bind_egg_sperm_system(self):")
        if bind_method_start == -1:
            print("✗ Could not find _bind_egg_sperm_system method in egg_ileices.py")
            return False
        
        # Find the point where chat_loop is called
        chat_loop_call = egg_code.find("if hasattr(sperm, 'chat_loop'):", bind_method_start)
        if chat_loop_call == -1:
            print("✗ Could not find chat_loop call in _bind_egg_sperm_system method")
            return False
        
        # Create the code to insert for command processing
        cmd_processing_code = """
            # Integrate command processor if available
            command_processor_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "command_processor.py")
            if os.path.exists(command_processor_path):
                try:
                    spec = importlib.util.spec_from_file_location("command_processor", command_processor_path)
                    command_processor = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(command_processor)
                    
                    # Add command processing capabilities to sperm module
                    if hasattr(sperm, 'chat_loop') and not hasattr(sperm, 'original_process_input'):
                        # Check if sperm has a perceive_input function to enhance
                        if hasattr(sperm, 'perceive_input'):
                            # Save the original function
                            sperm.original_perceive_input = sperm.perceive_input
                            
                            # Define enhanced version that handles commands
                            def enhanced_perceive_input(user_input):
                                # Check if this is a command
                                cmd_response = None
                                if hasattr(command_processor, 'process_command'):
                                    cmd_response, was_command = command_processor.process_command(user_input, sperm.memory)
                                    if was_command and cmd_response:
                                        # Store the command response for use by generate_response
                                        sperm.memory["command_response"] = cmd_response
                                
                                # Process input normally if not a command
                                return sperm.original_perceive_input(user_input)
                            
                            # Replace with enhanced version
                            sperm.perceive_input = enhanced_perceive_input
                            
                            # Also enhance generate_response to use command responses
                            if hasattr(sperm, 'generate_response'):
                                sperm.original_generate_response = sperm.generate_response
                                
                                def enhanced_generate_response(processed_data):
                                    # Check if we have a command response to return
                                    if "command_response" in sperm.memory:
                                        response = sperm.memory["command_response"]
                                        del sperm.memory["command_response"]
                                        return response
                                    
                                    # Otherwise process normally
                                    return sperm.original_generate_response(processed_data)
                                
                                sperm.generate_response = enhanced_generate_response
                        
                        print("✓ Command processor successfully integrated with chat loop")
                    else:
                        print("ℹ️ Command processor already integrated or chat_loop not found")
                except Exception as e:
                    print(f"✗ Failed to integrate command processor: {e}")
        """
        
        # Insert the code before the chat loop call
        new_egg_code = egg_code[:chat_loop_call] + cmd_processing_code + egg_code[chat_loop_call:]
        
        # Write the updated file
        with open(egg_path, 'w') as f:
            f.write(new_egg_code)
        
        print("✓ Successfully enhanced egg_ileices.py with command processing")
        return True
        
    except Exception as e:
        print(f"Error enhancing egg_ileices.py: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("AIOS IO Command Processor - Egg Integration")
    print("=" * 50)
    
    result = integrate_commands_with_egg()
    
    if result:
        print("\nCommand processor successfully integrated with egg_ileices.py")
        print("The system will now handle commands properly in all contexts")
    else:
        print("\nFailed to integrate command processor with egg_ileices.py")
        print("Please apply the changes manually")
