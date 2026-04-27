# File copied by Ultimate Auto-Rebuilder Script Gatherer
# Original: C:\Users\lokee\Documents\FirstBorne\Stage\porting\Egg_Ileices\Egg_Ileices\aios_enhanced_launcher.py
# Copy Date: 2025-06-13 02:25:30
# Original Size: 17256 bytes

#!/usr/bin/env python3
"""
AIOS IO Enhanced Launcher

This script applies all the necessary fixes to AIOS IO before launching
the system, ensuring lecture mode, testing functions, and dynamic responses
work correctly.
"""

import os
import sys
import importlib.util
import time

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def apply_all_fixes():
    """Apply all fixes to the AIOS IO system before launching."""
    print("\n╔════════════════════════════════════════════╗")
    print("║       AIOS IO ENHANCED SYSTEM LAUNCHER     ║")
    print("╚════════════════════════════════════════════╝")
    
    # Load the fix modules
    lecture_fix_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lecture_integration_fix.py")
    dynamic_fix_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dynamic_response_fix.py")
    
    # Create the fix files if they don't exist
    if not os.path.exists(lecture_fix_path):
        print("\n[1/4] Creating lecture mode integration fix...")
        with open(lecture_fix_path, "w") as f:
            f.write("""#!/usr/bin/env python3
\"\"\"
AIOS IO Lecture Mode Integration Fix

This script ensures proper integration between the Enhanced Lecture Mode
and the main AIOS IO system, fixing the issues with lecture functionality.
\"\"\"

import os
import sys
import importlib.util

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def fix_lecture_mode_integration():
    \"\"\"Fix the integration between lecture mode and sperm_ileices.py\"\"\"
    
    # First check if sperm_ileices and enhanced_lecture_mode are available
    sperm_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 
                             "Sperm Ileices", "sperm_ileices.py")
    lecture_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 
                               "Sperm Ileices", "enhanced_lecture_mode.py")
    
    if not (os.path.exists(sperm_path) and os.path.exists(lecture_path)):
        print("Error: Required modules not found in expected locations.")
        return False
    
    try:
        # Import sperm_ileices module
        spec = importlib.util.spec_from_file_location("sperm_ileices", sperm_path)
        sperm = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(sperm)
        
        # Import enhanced_lecture_mode module
        spec = importlib.util.spec_from_file_location("enhanced_lecture_mode", lecture_path)
        lecture_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(lecture_module)
        
        # Create instance of enhanced lecture mode
        lecture_mode = lecture_module.EnhancedLectureMode(sperm.memory)
        
        # Check if lecture_mode detection is properly integrated
        if not hasattr(sperm, 'detect_lecture_command'):
            print("Adding lecture mode detection to sperm_ileices.py...")
            
            # Define the new lecture command detection function
            def detect_lecture_command(user_input):
                \"\"\"Detect if input contains lecture mode commands.\"\"\"
                if hasattr(sperm, 'lecture_mode') and sperm.lecture_mode:
                    return sperm.lecture_mode.detect_lecture_command(user_input)
                return None
                
            # Add the function to the sperm module
            setattr(sperm, 'detect_lecture_command', detect_lecture_command)
        
        # Modify perceive_input to check for lecture commands
        original_perceive_input = sperm.perceive_input
        
        def enhanced_perceive_input(user_input):
            \"\"\"Enhanced version of perceive_input that checks for lecture commands.\"\"\"
            if self._is_lecture_command(user_input):
            lecture_command = None
            if hasattr(sperm, 'detect_lecture_command'):
                lecture_command = sperm.detect_lecture_command(user_input)
            
            if lecture_command and hasattr(sperm, 'lecture_mode') and sperm.lecture_mode:
                return self._process_lecture_command(user_input)
                response = sperm.lecture_mode.process_lecture_input(user_input, lecture_command)
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
        
        # Make sure lecture_mode is available to the sperm module
        setattr(sperm, 'lecture_mode', lecture_mode)
        
        print("✓ Successfully integrated Enhanced Lecture Mode")
        return True
        
    except Exception as e:
        print(f"Error fixing lecture mode integration: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("AIOS IO Lecture Mode Integration Fix")
    success = fix_lecture_mode_integration()
    print(f"Integration fix {'successful' if success else 'failed'}")
""")
    
    if not os.path.exists(dynamic_fix_path):
        print("\n[2/4] Creating dynamic response fix...")
        with open(dynamic_fix_path, "w") as f:
            f.write("""#!/usr/bin/env python3
\"\"\"
AIOS IO Dynamic Response Fix

This script enhances the response generation in sperm_ileices.py
to ensure responses are properly affected by excretions and evolve dynamically.
\"\"\"

import os
import sys
import importlib.util
import random
import json

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def fix_dynamic_responses():
    \"\"\"Fix the dynamic response generation in sperm_ileices.py\"\"\"
    
    # First check if sperm_ileices is available
    sperm_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 
                             "Sperm Ileices", "sperm_ileices.py")
    
    if not os.path.exists(sperm_path):
        print("Error: sperm_ileices.py not found in expected location.")
        return False
    
    try:
        # Import sperm_ileices module
        spec = importlib.util.spec_from_file_location("sperm_ileices", sperm_path)
        sperm = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(sperm)
        
        # Enhance the reabsorption function to improve learning
        original_reabsorb = sperm.reabsorb_excretions
        
        def enhanced_reabsorb_excretions(max_files=5, learning_boost=True):
            \"\"\"Enhanced version of reabsorb_excretions with improved learning capabilities\"\"\"
            # First call the original function
            result = original_reabsorb(max_files)
            
            # Now add additional learning from excretions
            if learning_boost:
                try:
                    # Process excretion files directly to extract patterns
                    excretion_dir = sperm.EXCRETION_DIR
                    if os.path.exists(excretion_dir):
                        excretion_files = [f for f in os.listdir(excretion_dir) 
                                         if f.endswith('.json') and f.startswith('excretion_')]
                        
                        # Take random sample of excretion files to learn from
                        sample_size = min(3, len(excretion_files))  # Law of Three
                        if sample_size > 0:
                            selected_files = random.sample(excretion_files, sample_size)
                            
                            for file_name in selected_files:
                                file_path = os.path.join(excretion_dir, file_name)
                                try:
                                    with open(file_path, 'r') as f:
                                        excretion_data = json.load(f)
                                    
                                    # Extract patterns from excretion
                                    if "yellow_patterns" in excretion_data:
                                        yellow_patterns = excretion_data["yellow_patterns"]
                                        # Extract response templates from the excretion
                                        templates = []
                                        for k, v in yellow_patterns.items():
                                            if "response" in v:
                                                templates.append(v["response"])
                                            if "response_templates" in v:
                                                templates.extend(v.get("response_templates", []))
                                        
                                        # Store unique templates for use in future responses
                                        if "learned_templates" not in sperm.memory:
                                            sperm.memory["learned_templates"] = []
                                        for template in templates:
                                            if template not in sperm.memory["learned_templates"]:
                                                sperm.memory["learned_templates"].append(template)
                                                
                                    # Extract important concepts
                                    if "concepts" in excretion_data:
                                        for concept, value in excretion_data.get("concepts", {}).items():
                                            if concept not in sperm.memory["concepts"]:
                                                sperm.memory["concepts"][concept] = value
                                except Exception as e:
                                    print(f"Error processing excretion file {file_name}: {e}")
                except Exception as e:
                    print(f"Error in enhanced learning: {e}")
                    
            return result
        
        # Replace the original function with our enhanced version
        setattr(sperm, 'reabsorb_excretions', enhanced_reabsorb_excretions)
        
        # Enhance the generate_response function to use learned templates
        original_generate = sperm.generate_response
        
        def enhanced_generate_response(processed_data):
            \"\"\"Enhanced version of generate_response that uses dynamically learned templates\"\"\"
            # First check if we have learned templates
            if "learned_templates" in sperm.memory and sperm.memory["learned_templates"] and random.random() > 0.5:
                # Use a learned template as base for response 50% of the time
                template = random.choice(sperm.memory["learned_templates"])
                
                # Now personalize it based on current input
                if processed_data and "source_perception_id" in processed_data:
                    # Find the original input that triggered this response
                    original_input = ""
                    for entry in sperm.memory["history"]:
                        if "perception" in entry and entry["perception"].get("perception_id") == processed_data["source_perception_id"]:
                            original_input = entry.get("input", "")
                            break
                    
                    # Extract key words from input to incorporate
                    input_words = original_input.split()
                    if len(input_words) > 2:
                        key_words = [word for word in input_words 
                                   if len(word) > 3 and word.lower() not in 
                                   ["what", "when", "where", "which", "this", "that", "with", "your"]]
                        
                        if key_words:
                            # Add contextual reference to the template
                            key_word = random.choice(key_words)
                            template += f" I find your mention of '{key_word}' particularly interesting."
                
                response = template
            else:
                # Fall back to original method
                response = original_generate(processed_data)
            
            return response
        
        # Replace the original function with our enhanced version
        setattr(sperm, 'generate_response', enhanced_generate_response)
        
        # Trigger an immediate reabsorption to learn from existing excretions
        enhanced_reabsorb_excretions(max_files=9)  # Law of Three squared
        
        print("✓ Successfully enhanced dynamic response generation")
        return True
        
    except Exception as e:
        print(f"Error fixing dynamic response generation: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("AIOS IO Dynamic Response Fix")
    success = fix_dynamic_responses()
    print(f"Dynamic response fix {'successful' if success else 'failed'}")
""")
    
    print("\n[3/4] Applying fixes...")
    try:
        # Import and run the lecture fix
        spec = importlib.util.spec_from_file_location("lecture_integration_fix", lecture_fix_path)
        lecture_fix = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(lecture_fix)
        
        # Apply lecture fix
        lecture_success = lecture_fix.fix_lecture_mode_integration()
        
        # Import and run the dynamic response fix
        spec = importlib.util.spec_from_file_location("dynamic_response_fix", dynamic_fix_path)
        dynamic_fix = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(dynamic_fix)
        
        # Apply dynamic response fix
        dynamic_success = dynamic_fix.fix_dynamic_responses()
        
        if lecture_success and dynamic_success:
            print("\n✓ All fixes applied successfully")
            return True
        else:
            print("\n✗ Some fixes failed to apply")
            return False
            
    except Exception as e:
        print(f"\n✗ Error applying fixes: {e}")
        import traceback
        traceback.print_exc()
        return False

def launch_aios_system():
    """Launch the AIOS IO system with all fixes applied."""
    print("\n[4/4] Launching AIOS IO system...")
    
    egg_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 
                          "Sperm Ileices", "egg_ileices.py")
    
    if not os.path.exists(egg_path):
        print(f"✗ Could not find egg_ileices.py at {egg_path}")
        return False
    
    try:
        # Import egg_ileices module
        spec = importlib.util.spec_from_file_location("egg_ileices", egg_path)
        egg = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(egg)
        
        # Create and run the egg system
        aios_egg = egg.AIOSEggSystem()
        aios_egg.run()
        
        return True
        
    except Exception as e:
        print(f"✗ Error launching AIOS IO: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = apply_all_fixes()
    if success:
        print("\nAll fixes applied successfully. Launching AIOS IO...")
        time.sleep(1)  # Brief pause for visibility
        launch_aios_system()
    else:
        print("\nSome fixes failed to apply. Please check the errors above.")

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

