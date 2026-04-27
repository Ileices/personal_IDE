# File copied by Ultimate Auto-Rebuilder Script Gatherer
# Original: C:\Users\lokee\Documents\FirstBorne\Stage\porting\Egg_Ileices\Egg_Ileices\dynamic_response_fix.py
# Copy Date: 2025-06-13 02:25:32
# Original Size: 7969 bytes

#!/usr/bin/env python3
"""
AIOS IO Dynamic Response Fix

This script enhances the response generation in sperm_ileices.py
to ensure responses are properly affected by excretions and evolve dynamically.
"""

import os
import sys
import importlib.util
import random
import json

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def fix_dynamic_responses():
    """Fix the dynamic response generation in sperm_ileices.py"""
    
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
            """Enhanced version of reabsorb_excretions with improved learning capabilities"""
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
            """Enhanced version of generate_response that uses dynamically learned templates"""
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
