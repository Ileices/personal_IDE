# File copied by Ultimate Auto-Rebuilder Script Gatherer
# Original: C:\Users\lokee\Documents\FirstBorne\Stage\porting\Egg_Ileices\Egg_Ileices\lecture_egg_integration.py
# Copy Date: 2025-06-13 02:25:34
# Original Size: 14511 bytes

#!/usr/bin/env python3
"""
AIOS IO Lecture Mode - Egg Integration

This script ensures that the lecture mode is properly integrated with the
egg_ileices.py file when using any of our launch scripts.
"""

import os
import sys
import importlib.util

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def integrate_lecture_mode_with_egg():
    """Ensure lecture mode is properly integrated with egg_ileices.py"""
    
    # Check if required modules are available
    sperm_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 
                             "Sperm Ileices", "sperm_ileices.py")
    egg_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 
                           "Sperm Ileices", "egg_ileices.py")
    lecture_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 
                               "Sperm Ileices", "enhanced_lecture_mode.py")
    
    if not (os.path.exists(sperm_path) and os.path.exists(egg_path) and os.path.exists(lecture_path)):
        print("Error: Required modules not found in expected locations.")
        return False
    
    try:
        # Import sperm_ileices module
        spec = importlib.util.spec_from_file_location("sperm_ileices", sperm_path)
        sperm = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(sperm)
        
        # Import egg_ileices module
        spec = importlib.util.spec_from_file_location("egg_ileices", egg_path)
        egg = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(egg)
        
        # Import enhanced_lecture_mode module
        spec = importlib.util.spec_from_file_location("enhanced_lecture_mode", lecture_path)
        lecture_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(lecture_module)
        
        # Check if egg's _initialize_support_systems method is properly handling lecture mode
        if hasattr(egg.AIOSEggSystem, '_initialize_support_systems'):
            # The method exists, but we need to ensure it properly initializes lecture mode
            method_code = egg.AIOSEggSystem._initialize_support_systems.__code__
            
            # Check if the method has the necessary lecture mode functionality
            has_lecture_mode = "lecture_mode" in method_code.co_names and "detect_lecture_command" in method_code.co_names
            
            if not has_lecture_mode:
                print("✗ Egg system's support systems initialization needs lecture mode integration")
                print("  Please update the _initialize_support_systems method.")
                return False
        else:
            print("✗ Egg system is missing the _initialize_support_systems method")
            return False
            
        # Also check if egg's run method applies lecture mode enhancements
        if hasattr(egg.AIOSEggSystem, 'run'):
            method_code = egg.AIOSEggSystem.run.__code__
            
            # Check if the method looks for lecture mode enhancements
            has_enhancement = "lecture_mode_enhancement" in method_code.co_names or "enhance_lecture_mode" in method_code.co_names
            
            if not has_enhancement:
                print("✗ Egg system's run method needs to apply lecture mode enhancements")
                print("  Please update the run method to apply enhancements.")
                return False
        else:
            print("✗ Egg system is missing the run method")
            return False
            
        # Verify that sperm has the needed lecture mode methods
        if not hasattr(sperm, 'detect_lecture_command'):
            print("✗ Sperm module is missing the detect_lecture_command function")
            return False
            
        print("✓ Lecture mode is properly integrated with egg_ileices.py")
        return True
            
    except Exception as e:
        print(f"Error during integration verification: {e}")
        import traceback
        traceback.print_exc()
        return False

# Function to patch egg_ileices.py if needed
def patch_egg_ileices():
    """Patch egg_ileices.py to properly integrate lecture mode if needed."""
    egg_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 
                           "Sperm Ileices", "egg_ileices.py")
    
    if not os.path.exists(egg_path):
        print("Error: egg_ileices.py not found.")
        return False
        
    # First check if patching is needed
    if integrate_lecture_mode_with_egg():
        print("No patching needed - lecture mode is already properly integrated.")
        return True
        
    try:
        # Read the current egg file
        with open(egg_path, 'r') as f:
            egg_code = f.read()
            
        # Create a backup
        backup_path = egg_path + ".backup"
        with open(backup_path, 'w') as f:
            f.write(egg_code)
            
        print(f"Created backup of egg_ileices.py at {backup_path}")
        
        # Get the new implementation
        patch_code = """
    # Properly initialize enhanced lecture mode
    try:
        lecture_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "enhanced_lecture_mode.py")
        if os.path.exists(lecture_path):
            # Import enhanced lecture mode properly
            spec = importlib.util.spec_from_file_location("enhanced_lecture_mode", lecture_path)
            lecture_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(lecture_module)
            
            # Create and initialize the lecture mode with memory
            self.lecture_mode = lecture_module.EnhancedLectureMode(self.memory)
            print("✓ Enhanced Lecture Mode initialized")
            
            # Make lecture_mode available to the sperm module
            if IMPORT_SUCCESS:
                sperm.lecture_mode = self.lecture_mode
                
                # Add lecture command detection if not present
                if not hasattr(sperm, 'detect_lecture_command'):
                    def detect_lecture_command(user_input):
                        \"\"\"Detect if input contains lecture mode commands.\"\"\"
                        if self.lecture_mode:
                            return self.lecture_mode.detect_lecture_command(user_input)
                        return None
                    
                    setattr(sperm, 'detect_lecture_command', detect_lecture_command)
                    
                # Create or update lecture mode integration hooks
                original_perceive_input = sperm.perceive_input
                
                def enhanced_perceive_input(user_input):
                    \"\"\"Enhanced version of perceive_input that checks for lecture commands.\"\"\"
                    if self._is_lecture_command(user_input):
                    lecture_command = None
                    if hasattr(sperm, 'detect_lecture_command'):
                        lecture_command = sperm.detect_lecture_command(user_input)
                    
                    if lecture_command and self.lecture_mode:
                        return self._process_lecture_command(user_input)
                        response = self.lecture_mode.process_lecture_input(user_input, lecture_command)
                        if response:
                            # Store the response for direct use in generate_response
                            sperm.memory["current_lecture_response"] = response
                    
                    # Continue with normal perception
                    return original_perceive_input(user_input)
                
                # Replace the original perceive_input with our enhanced version
                setattr(sperm, 'perceive_input', enhanced_perceive_input)
                
                # Now modify generate_response to check for lecture responses
                original_generate_response = sperm.generate_response
                
                def enhanced_generate_response(processed_data):
                    \"\"\"Enhanced version of generate_response that checks for lecture responses.\"\"\"
                    # Check if we have a lecture response to return
                    if "current_lecture_response" in sperm.memory:
                        response = sperm.memory["current_lecture_response"]
                        del sperm.memory["current_lecture_response"]  # Clear it after use
                        return response
                    
                    # Otherwise continue with normal response generation
                    return original_generate_response(processed_data)
                
                # Replace the original generate_response with our enhanced version
                setattr(sperm, 'generate_response', enhanced_generate_response)
        else:
            self._initialize_fallback_lecture_mode()
    except Exception as e:
        print(f"✗ Failed to initialize Enhanced Lecture Mode: {e}")"""
        
        # Find the _initialize_support_systems method
        import_line = "import importlib.util"
        if import_line not in egg_code:
            # Add importlib if it's not there
            egg_code = egg_code.replace("import threading", "import threading\nimport importlib.util")
        
        # Add the lecture mode code
        method_start = "def _initialize_support_systems(self)"
        method_end = "if hasattr(sperm, 'continuous_processing')"
        
        if method_start in egg_code and method_end in egg_code:
            start_idx = egg_code.find(method_start)
            if start_idx != -1:
                # Find a good insertion point before continuous_processing check
                insert_idx = egg_code.find(method_end, start_idx)
                if insert_idx != -1:
                    # Insert our patch code right before the continuous_processing check
                    new_egg_code = egg_code[:insert_idx] + patch_code + "\n\n    " + egg_code[insert_idx:]
                    
                    # Add the run method enhancement
                    run_method_patch = """
    # Apply lecture mode enhancement if required
    lecture_enhancement_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
                                          "lecture_mode_enhancement.py")
    
    if os.path.exists(lecture_enhancement_path):
        try:
            print("Applying lecture mode enhancements...")
            # Load the enhancement module
            spec = importlib.util.spec_from_file_location("lecture_enhancement", lecture_enhancement_path)
            lecture_enhancement = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(lecture_enhancement)
            
            # Apply the enhancements
            if hasattr(lecture_enhancement, 'enhance_lecture_mode'):
                enhancement_result = lecture_enhancement.enhance_lecture_mode()
                if enhancement_result:
                    print("✓ Lecture mode enhancements applied successfully")
                else:
                    print("✗ Failed to apply lecture mode enhancements")
        except Exception as e:
            print(f"✗ Error applying lecture mode enhancements: {e}")"""
                    
                    run_method_start = "def run(self):"
                    run_method_check = "if not self.initialized:"
                    run_method_end = "return self._bind_egg_sperm_system()"
                    
                    run_start_idx = new_egg_code.find(run_method_start)
                    if run_start_idx != -1:
                        run_check_idx = new_egg_code.find(run_method_check, run_start_idx)
                        run_end_idx = new_egg_code.find(run_method_end, run_start_idx)
                        
                        if run_check_idx != -1 and run_end_idx != -1:
                            # Find where to insert our code - after initialization check but before binding
                            # First find the end of the initialization block
                            init_block_end = new_egg_code.find("\n", new_egg_code.find("return", run_check_idx))
                            
                            if init_block_end != -1 and init_block_end < run_end_idx:
                                final_egg_code = (
                                    new_egg_code[:init_block_end+1] + 
                                    run_method_patch + 
                                    "\n    " + 
                                    new_egg_code[init_block_end+1:]
                                )
                                
                                # Write the patched file
                                with open(egg_path, 'w') as f:
                                    f.write(final_egg_code)
                                
                                print("Successfully patched egg_ileices.py to integrate lecture mode.")
                                return True
        
        print("Could not patch egg_ileices.py automatically. Please apply the changes manually.")
        return False
            
    except Exception as e:
        print(f"Error patching egg_ileices.py: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("AIOS IO Lecture Mode - Egg Integration")
    print("=" * 50)
    
    if not integrate_lecture_mode_with_egg():
        print("\nLecture mode is not properly integrated with egg_ileices.py")
        print("Attempting to patch egg_ileices.py...")
        
        if patch_egg_ileices():
            print("\nSuccessfully patched egg_ileices.py")
            print("Lecture mode should now work correctly with all launch scripts.")
        else:
            print("\nFailed to patch egg_ileices.py")
            print("Please apply the necessary changes manually.")
    else:
        print("\nLecture mode is already properly integrated with egg_ileices.py")
        print("No changes needed. All launch scripts should work correctly.")

    def _initialize_fallback_lecture_mode(self):
        """Initialize a basic fallback lecture mode when enhanced mode fails"""
        self.lecture_mode_active = False
        self.lecture_history = []
        print("🔄 Using fallback lecture mode")
        return True
    
    def _handle_lecture_mode_error(self, error):
        """Handle lecture mode initialization errors gracefully"""
        self.logger(f"Lecture mode error: {error}")
        return self._initialize_fallback_lecture_mode()
    
    def _is_lecture_command(self, user_input: str) -> bool:
        """Check if input is a lecture mode command"""
        lecture_triggers = ['lecture mode', 'enter lecture', 'start lecture', 'lecture']
        return any(trigger in user_input.lower() for trigger in lecture_triggers)
    
    def _process_lecture_command(self, user_input: str) -> str:
        """Process lecture mode commands"""
        if not hasattr(self, 'lecture_mode_active'):
            self._initialize_fallback_lecture_mode()
        
        if 'enter' in user_input.lower() or 'start' in user_input.lower():
            self.lecture_mode_active = True
            return "📚 Lecture mode activated. I'm ready to provide detailed explanations."
        elif 'exit' in user_input.lower() or 'stop' in user_input.lower():
            self.lecture_mode_active = False
            return "📚 Lecture mode deactivated."
        else:
            if self.lecture_mode_active:
                return self._generate_lecture_response(user_input)
            else:
                self.lecture_mode_active = True
                return "📚 Lecture mode activated. I'm ready to provide detailed explanations."
    
    def _generate_lecture_response(self, topic: str) -> str:
        """Generate a detailed lecture-style response"""
        return f"📚 [Lecture Mode] Detailed explanation of: {topic}\n\nThis is a comprehensive overview covering the key concepts, implementation details, and best practices related to your topic."

