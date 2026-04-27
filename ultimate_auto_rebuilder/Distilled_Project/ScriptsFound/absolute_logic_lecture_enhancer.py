# File copied by Ultimate Auto-Rebuilder Script Gatherer
# Original: C:\Users\lokee\Documents\FirstBorne\Stage\porting\Egg_Ileices\Egg_Ileices\Sperm_Ileices\Sperm_Ileices\absolute_logic_lecture_enhancer.py
# Copy Date: 2025-06-13 02:25:34
# Original Size: 35484 bytes

#!/usr/bin/env python3
"""
AIOS IO Absolute Logic Lecture Mode Enhancer

This module transforms the basic lecture mode into a comprehensive
Absolute Logic learning system following the Law of Three principles:
1. Understanding - Knowledge introduction as absolute or opinion
2. Application - Knowledge testing and reinforcement
3. Recursive Improvement - Self-correction and intelligent adaptation

The enhanced lecture mode maintains separate memory structures from casual
conversation, enforces structured learning through Test-Try-Learn cycles,
and ensures knowledge is properly integrated into the core excretion system.
"""

import os
import sys
import re
import json
import time
import shutil
from datetime import datetime

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

class AbsoluteLogicLectureEnhancer:
    """
    Enhances AIOS IO's lecture mode with Absolute Logic principles
    and the Law of Three learning framework.
    """
    
    def __init__(self):
        """Initialize the enhancer."""
        self.sperm_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 
                                "Sperm Ileices", "sperm_ileices.py")
        self.lecture_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 
                                "Sperm Ileices", "enhanced_lecture_mode.py")
        self.egg_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 
                             "Sperm Ileices", "egg_ileices.py")
                             
        # Get original module content
        self.sperm_content = self._read_file(self.sperm_path)
        self.lecture_content = self._read_file(self.lecture_path)
        self.egg_content = self._read_file(self.egg_path)
        
        # Define the Law of Three constants
        self.TIER_ONE = 3     # First level of understanding (Verified Knowledge)
        self.TIER_TWO = 9     # Second level (Core Truth) - 3²
        self.TIER_THREE = 27  # Third level (Absolute Knowledge) - 3³

    def _read_file(self, path):
        """Read file content safely."""
        if not os.path.exists(path):
            print(f"Error: File not found: {path}")
            return None
            
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception as e:
            print(f"Error reading file {path}: {e}")
            return None
    
    def _write_file(self, path, content):
        """Write content to file safely."""
        # Create backup first
        backup_path = f"{path}.{datetime.now().strftime('%Y%m%d%H%M%S')}.bak"
        if os.path.exists(path):
            try:
                shutil.copy2(path, backup_path)
                print(f"Created backup of {os.path.basename(path)} at {backup_path}")
            except Exception as e:
                print(f"Warning: Failed to create backup: {e}")
                
        # Now write the new content
        try:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        except Exception as e:
            print(f"Error writing to file {path}: {e}")
            return False

    def enhance_all(self):
        """Apply all lecture mode enhancements."""
        if not self.sperm_content or not self.lecture_content:
            print("Error: Cannot proceed without valid source files.")
            return False
        
        # 1. Update the EnhancedLectureMode class with Absolute Logic framework
        print("[1/4] Enhancing lecture mode with Absolute Logic framework...")
        if not self._enhance_lecture_mode():
            return False
            
        # 2. Integrate the enhanced lecture mode with core processing
        print("[2/4] Integrating lecture mode with core processing...")
        if not self._integrate_with_core():
            return False
            
        # 3. Add recursive memory structure and excretion integration
        print("[3/4] Adding recursive memory structures and excretion integration...")
        if not self._add_recursive_memory():
            return False
            
        # 4. Enable multi-session awareness and continuous learning
        print("[4/4] Enabling multi-session awareness and continuous learning...")
        if not self._enable_continuous_learning():
            return False
        
        print("\n✓ Absolute Logic Lecture Mode enhancements successfully applied!")
        print("  The system now follows the Law of Three principles for recursive learning.")
        return True

    def _enhance_lecture_mode(self):
        """
        Enhance the lecture mode class with Absolute Logic principles,
        including the three-tiered learning structure.
        """
        # Check if already implemented
        if "def _absolute_logic_test_mode" in self.lecture_content:
            print("✓ Absolute Logic framework already implemented in lecture mode.")
            return True
        
        # Find insertion point - at the end of the EnhancedLectureMode class
        insertion_point = self.lecture_content.rfind("}")
        if insertion_point == -1:
            print("Error: Could not find the end of the EnhancedLectureMode class.")
            return False
        
        # Create the Absolute Logic framework code
        absolute_logic_code = """
    # Absolute Logic Framework - Law of Three Implementation
    
    def _absolute_logic_test_mode(self, user_input):
        \"\"\"
        TEST MODE - First phase of the Absolute Logic Learning Framework.
        This phase handles knowledge introduction - facts or opinions.
        
        Args:
            user_input: The user's input text to process
            
        Returns:
            tuple: (handled, response) where handled is a boolean indicating
                  if the input was processed by this mode
        \"\"\"
        # Initialize absolute logic memory structures if needed
        if "absolute_logic" not in self.memory:
            self.memory["absolute_logic"] = {
                "knowledge_base": {
                    "facts": {},       # Verified knowledge
                    "core_truths": {}, # Core truths (higher confidence)
                    "absolute": {}     # Absolute knowledge (highest confidence)
                },
                "opinions": {},
                "learning_cycles": [],
                "active_lessons": {},
                "current_phase": "test", # test, try, or learn
                "session_stats": {
                    "facts_introduced": 0,
                    "opinions_shared": 0,
                    "tests_performed": 0,
                    "corrections_made": 0
                }
            }
            
        # Detect if this is a fact introduction
        fact_patterns = [
            r"(.+?)\s+is\s+(.+)",     # "The sky is blue"
            r"(.+?)\s+are\s+(.+)",    # "Cats are mammals"
            r"(.+?)\s+=\s+(.+)",      # "2+2 = 4"
        ]
        
        for pattern in fact_patterns:
            match = re.match(pattern, user_input, re.IGNORECASE)
            if match:
                subject = match.group(1).strip()
                predicate = match.group(2).strip()
                
                # Check if this is an opinion or a fact
                is_opinion = False
                opinion_indicators = ["in my opinion", "i believe", "i think", "i feel", "i consider"]
                for indicator in opinion_indicators:
                    if indicator in user_input.lower():
                        is_opinion = True
                        break
                
                # Store in the appropriate memory structure
                if is_opinion:
                    self.memory["absolute_logic"]["opinions"][subject] = {
                        "value": predicate,
                        "first_seen": datetime.now().isoformat(),
                        "last_seen": datetime.now().isoformat(),
                        "occurrences": 1
                    }
                    
                    response = f"I understand your opinion that {subject} is {predicate}. I've noted this as your perspective."
                    self.memory["absolute_logic"]["session_stats"]["opinions_shared"] += 1
                    
                else:
                    # Check if we already know this fact
                    if subject in self.memory["absolute_logic"]["knowledge_base"]["facts"]:
                        fact = self.memory["absolute_logic"]["knowledge_base"]["facts"][subject]
                        fact["occurrences"] += 1
                        fact["last_seen"] = datetime.now().isoformat()
                        
                        # Check for conflicts with existing knowledge
                        if fact["value"] != predicate:
                            # Contradiction detected
                            return True, f"This conflicts with my existing knowledge that {subject} is {fact['value']}. Would you like me to update my understanding?"
                            
                        # No conflict, update confidence based on Law of Three
                        if fact["occurrences"] >= self.TIER_THREE:  # 27
                            # Move to absolute knowledge
                            self.memory["absolute_logic"]["knowledge_base"]["absolute"][subject] = fact
                            response = f"I already know that {subject} is {predicate}. This is now absolute knowledge."
                        elif fact["occurrences"] >= self.TIER_TWO:  # 9
                            # Move to core truths
                            self.memory["absolute_logic"]["knowledge_base"]["core_truths"][subject] = fact
                            response = f"I already know that {subject} is {predicate}. This is becoming core knowledge."
                        else:
                            response = f"I already know that {subject} is {predicate}. Reinforcing my understanding."
                    else:
                        # New fact
                        self.memory["absolute_logic"]["knowledge_base"]["facts"][subject] = {
                            "value": predicate,
                            "first_seen": datetime.now().isoformat(),
                            "last_seen": datetime.now().isoformat(),
                            "occurrences": 1,
                            "corrections": 0,
                            "confidence": "initial"
                        }
                        
                        # Also store in general concepts
                        if "concepts" not in self.memory:
                            self.memory["concepts"] = {}
                        self.memory["concepts"][subject] = predicate
                        
                        response = f"Thank you for teaching me that {subject} is {predicate}. I've stored this fact."
                        self.memory["absolute_logic"]["session_stats"]["facts_introduced"] += 1
                
                # Add to the lesson tracking
                if "current_lesson" not in self.memory["absolute_logic"]["active_lessons"]:
                    self.memory["absolute_logic"]["active_lessons"]["current_lesson"] = {
                        "topics": {},
                        "start_time": datetime.now().isoformat(),
                        "facts": [],
                        "opinions": [],
                        "tests": [],
                        "corrections": []
                    }
                    
                if is_opinion:
                    self.memory["absolute_logic"]["active_lessons"]["current_lesson"]["opinions"].append({
                        "subject": subject,
                        "value": predicate,
                        "timestamp": datetime.now().isoformat()
                    })
                else:
                    self.memory["absolute_logic"]["active_lessons"]["current_lesson"]["facts"].append({
                        "subject": subject,
                        "value": predicate,
                        "timestamp": datetime.now().isoformat()
                    })
                
                # Switch to try mode after several facts have been introduced
                facts_count = len(self.memory["absolute_logic"]["active_lessons"]["current_lesson"]["facts"])
                if facts_count % 3 == 0 and facts_count > 0:  # After every 3 facts (Law of Three)
                    # Suggest entering try mode
                    self.memory["absolute_logic"]["current_phase"] = "try"
                    response += "\\n\\nWould you like to test my understanding of these concepts?"
                
                return True, response
                
        # Not handled by test mode
        return False, None
        
    def _absolute_logic_try_mode(self, user_input):
        \"\"\"
        TRY MODE - Second phase of the Absolute Logic Framework.
        This phase handles knowledge application through questions/tests.
        
        Args:
            user_input: The user's input text to process
            
        Returns:
            tuple: (handled, response) where handled is a boolean indicating
                  if the input was processed by this mode
        \"\"\"
        # Check if this is a question
        if not user_input.strip().endswith("?"):
            return False, None
            
        # This is a question, attempt to answer based on learned knowledge
        question_patterns = [
            r"what\s+is\s+(.+)(?:\?)?",   # "What is the capital of France?"
            r"who\s+is\s+(.+)(?:\?)?",    # "Who is Albert Einstein?"
            r"where\s+is\s+(.+)(?:\?)?",  # "Where is Tokyo?"
            r"when\s+is\s+(.+)(?:\?)?",   # "When is Christmas?"
            r"how\s+is\s+(.+)(?:\?)?",    # "How is bread made?"
            r"why\s+is\s+(.+)(?:\?)?",    # "Why is the sky blue?"
            r"does\s+(.+?)(?:\s+exist)?(?:\?)?",  # "Does gravity exist?"
            r"are\s+(.+)(?:\?)?",         # "Are cats mammals?"
            r"is\s+(.+)(?:\?)?",          # "Is water wet?"
            r"can\s+(.+)(?:\?)?",         # "Can birds fly?"
        ]
        
        for pattern in question_patterns:
            match = re.match(pattern, user_input, re.IGNORECASE)
            if match:
                subject = match.group(1).strip().rstrip('?')
                
                # Look for the subject in our knowledge base, starting with absolute
                if subject in self.memory["absolute_logic"]["knowledge_base"]["absolute"]:
                    fact = self.memory["absolute_logic"]["knowledge_base"]["absolute"][subject]
                    response = f"{subject} is {fact['value']}. I am absolutely certain of this."
                    
                elif subject in self.memory["absolute_logic"]["knowledge_base"]["core_truths"]:
                    fact = self.memory["absolute_logic"]["knowledge_base"]["core_truths"][subject]
                    response = f"{subject} is {fact['value']}. This is core knowledge for me."
                    
                elif subject in self.memory["absolute_logic"]["knowledge_base"]["facts"]:
                    fact = self.memory["absolute_logic"]["knowledge_base"]["facts"][subject]
                    response = f"{subject} is {fact['value']}. This is my current understanding."
                    
                elif subject in self.memory["absolute_logic"]["opinions"]:
                    opinion = self.memory["absolute_logic"]["opinions"][subject]
                    response = f"In my understanding, {subject} is considered to be {opinion['value']}, but this is an opinion rather than a verified fact."
                
                else:
                    # Check concepts as fallback
                    if "concepts" in self.memory and subject in self.memory["concepts"]:
                        response = f"{subject} is {self.memory['concepts'][subject]}."
                    else:
                        # We don't know
                        response = f"I am unsure about {subject}. Could you teach me about this?"
                    
                # Record this test in the current lesson
                if "current_lesson" in self.memory["absolute_logic"]["active_lessons"]:
                    self.memory["absolute_logic"]["active_lessons"]["current_lesson"]["tests"].append({
                        "subject": subject,
                        "question": user_input,
                        "response": response,
                        "timestamp": datetime.now().isoformat()
                    })
                    
                self.memory["absolute_logic"]["session_stats"]["tests_performed"] += 1
                
                # Switch to learn mode after the question
                self.memory["absolute_logic"]["current_phase"] = "learn"
                
                return True, response
                
        # Not handled by try mode
        return False, None
        
    def _absolute_logic_learn_mode(self, user_input):
        \"\"\"
        LEARN MODE - Third phase of the Absolute Logic Framework.
        This phase handles feedback on answers and recursive self-improvement.
        
        Args:
            user_input: The user's input text to process
            
        Returns:
            tuple: (handled, response) where handled is a boolean indicating
                  if the input was processed by this mode
        \"\"\"
        # Look for correction or confirmation patterns
        correction_patterns = [
            r"no,?\s+(.+)",           # "No, the capital of France is Paris."
            r"incorrect,?\s+(.+)",    # "Incorrect, the answer is 42."
            r"that's wrong,?\s+(.+)", # "That's wrong, 2+2=4."
            r"actually,?\s+(.+)"      # "Actually, water is wet."
        ]
        
        confirmation_patterns = [
            r"yes,?\s+that's correct",   # "Yes, that's correct"
            r"that's right",             # "That's right"
            r"correct",                  # "Correct"
            r"you( are|'re) right",      # "You're right"
            r"good",                     # "Good"
            r"well done",                # "Well done"
            r"perfect",                  # "Perfect"
        ]
        
        # First check for confirmations (simpler case)
        for pattern in confirmation_patterns:
            if re.match(pattern, user_input, re.IGNORECASE):
                if "current_lesson" in self.memory["absolute_logic"]["active_lessons"]:
                    # Get the last test performed
                    if self.memory["absolute_logic"]["active_lessons"]["current_lesson"]["tests"]:
                        last_test = self.memory["absolute_logic"]["active_lessons"]["current_lesson"]["tests"][-1]
                        subject = last_test["subject"]
                        
                        # Reinforce this knowledge
                        if subject in self.memory["absolute_logic"]["knowledge_base"]["facts"]:
                            fact = self.memory["absolute_logic"]["knowledge_base"]["facts"][subject]
                            fact["occurrences"] += 1
                            fact["last_seen"] = datetime.now().isoformat()
                            
                            # Update confidence based on Law of Three
                            if fact["occurrences"] >= self.TIER_THREE:  # 27
                                fact["confidence"] = "absolute"
                                # Move to absolute knowledge
                                self.memory["absolute_logic"]["knowledge_base"]["absolute"][subject] = fact
                                response = f"Thank you. I now consider my knowledge about '{subject}' to be absolute."
                            elif fact["occurrences"] >= self.TIER_TWO:  # 9
                                fact["confidence"] = "core"
                                # Move to core truths
                                self.memory["absolute_logic"]["knowledge_base"]["core_truths"][subject] = fact
                                response = f"Thank you. My knowledge about '{subject}' is now core to my understanding."
                            elif fact["occurrences"] >= self.TIER_ONE:  # 3
                                fact["confidence"] = "verified"
                                response = f"Thank you. My knowledge about '{subject}' is now verified."
                            else:
                                response = f"Thank you for confirming my answer about '{subject}'."
                        else:
                            response = "Thank you for confirming my answer."
                            
                        # Return to test mode for the next fact
                        self.memory["absolute_logic"]["current_phase"] = "test"
                        return True, response
                
                return True, "Thank you for confirming my answer."
        
        # Now check for corrections
        for pattern in correction_patterns:
            match = re.match(pattern, user_input, re.IGNORECASE)
            if match:
                correction = match.group(1).strip()
                
                if "current_lesson" in self.memory["absolute_logic"]["active_lessons"]:
                    # Get the last test performed
                    if self.memory["absolute_logic"]["active_lessons"]["current_lesson"]["tests"]:
                        last_test = self.memory["absolute_logic"]["active_lessons"]["current_lesson"]["tests"][-1]
                        subject = last_test["subject"]
                        
                        # Update our knowledge with the correction
                        correction_fact_patterns = [
                            r"(.+?)\s+is\s+(.+)",     # "The capital of France is Paris"
                            r"the answer is\s+(.+)",  # "The answer is Paris"
                            r"it'?s\s+(.+)"           # "It's Paris"
                        ]
                        
                        # Extract the corrected value
                        corrected_value = None
                        for fact_pattern in correction_fact_patterns:
                            fact_match = re.match(fact_pattern, correction, re.IGNORECASE)
                            if fact_match:
                                if fact_match.groups() and len(fact_match.groups()) > 1:
                                    corrected_subject = fact_match.group(1).strip()
                                    corrected_value = fact_match.group(2).strip()
                                    # If the subject is provided explicitly, use it
                                    if corrected_subject and corrected_subject != "the answer":
                                        subject = corrected_subject
                                else:
                                    corrected_value = fact_match.group(1).strip()
                                break
                                
                        if corrected_value is None:
                            # If no specific pattern matched, use the whole correction
                            corrected_value = correction
                        
                        # Record the correction
                        self.memory["absolute_logic"]["active_lessons"]["current_lesson"]["corrections"].append({
                            "subject": subject,
                            "original_response": last_test["response"],
                            "correction": correction,
                            "corrected_value": corrected_value,
                            "timestamp": datetime.now().isoformat()
                        })
                        
                        # Update the knowledge base
                        if subject in self.memory["absolute_logic"]["knowledge_base"]["facts"]:
                            # Update existing fact
                            fact = self.memory["absolute_logic"]["knowledge_base"]["facts"][subject]
                            fact["value"] = corrected_value
                            fact["corrections"] += 1
                            fact["last_seen"] = datetime.now().isoformat()
                        else:
                            # Add as a new fact
                            self.memory["absolute_logic"]["knowledge_base"]["facts"][subject] = {
                                "value": corrected_value,
                                "first_seen": datetime.now().isoformat(),
                                "last_seen": datetime.now().isoformat(),
                                "occurrences": 1,
                                "corrections": 0,
                                "confidence": "initial"
                            }
                            
                        # Also update concepts
                        if "concepts" not in self.memory:
                            self.memory["concepts"] = {}
                        self.memory["concepts"][subject] = corrected_value
                        
                        self.memory["absolute_logic"]["session_stats"]["corrections_made"] += 1
                        
                        # Return to test mode for the next fact
                        self.memory["absolute_logic"]["current_phase"] = "test"
                        
                        response = f"Thank you for the correction. I will now remember that {subject} is {corrected_value}."
                        return True, response
                        
                return True, f"Thank you for the correction: {correction}. I've updated my understanding."
        
        # Check for suggestion to move to Try mode
        try_patterns = [
            r"(let'?s|let\s+us)\s+(test|try|check|assess|evaluate|quiz|practice)",  # "Let's test your knowledge"
            r"(can|could|do)\s+(you|i)\s+(answer|respond|tell)",   # "Can you answer a question"
            r"(time|ready)\s+for\s+(a\s+)?(test|quiz|questions)",  # "Time for a test"
            r"I'?ll\s+(test|quiz|assess)\s+you"                   # "I'll test you now"
        ]
        
        for pattern in try_patterns:
            if re.search(pattern, user_input, re.IGNORECASE):
                self.memory["absolute_logic"]["current_phase"] = "try"
                return True, "I'm ready for you to test my knowledge. Please ask me a question about what I've learned."
        
        # Not handled by learn mode
        return False, None
        
    def process_absolute_logic_input(self, user_input):
        \"\"\"
        Process input through the Absolute Logic framework.
        
        Args:
            user_input: The user's input text
            
        Returns:
            str or None: The response if handled, None otherwise
        \"\"\"
        # Initialize memory structures if needed
        if "absolute_logic" not in self.memory:
            self._absolute_logic_test_mode("")  # This will initialize the structures
            
        # Determine which phase of the framework to use
        current_phase = self.memory["absolute_logic"].get("current_phase", "test")
        
        # First check for mode transitions
        if "enter lecture mode" in user_input.lower() or "begin lesson" in user_input.lower() or "i am teaching you now" in user_input.lower():
            self.active = True
            self.lecture_memory["active"] = True
            self.memory["absolute_logic"]["current_phase"] = "test"
            
            # Initialize a new lesson if not already active
            if "current_lesson" not in self.memory["absolute_logic"]["active_lessons"]:
                self.memory["absolute_logic"]["active_lessons"]["current_lesson"] = {
                    "topics": {},
                    "start_time": datetime.now().isoformat(),
                    "facts": [],
                    "opinions": [],
                    "tests": [],
                    "corrections": []
                }
                
            return '''
┌─────────────────────────────────────────────────────┐
│ ABSOLUTE LOGIC LECTURE MODE ACTIVATED │ 
│ I am ready to learn through the Law of Three: │ 
│ Understanding → Application → Recursive Improvement │
└─────────────────────────────────────────────────────┘

Please introduce facts (e.g., "Water is a liquid") or mark opinions (e.g., "In my opinion...")
I will track everything I learn and improve recursively.
'''

        if "exit lecture mode" in user_input.lower() or "end lesson" in user_input.lower() or "end of lecture" in user_input.lower():
            self.active = False
            self.lecture_memory["active"] = False
            
            # Summarize the current lesson
            lesson_summary = ""
            if "current_lesson" in self.memory["absolute_logic"]["active_lessons"]:
                lesson = self.memory["absolute_logic"]["active_lessons"]["current_lesson"]
                facts_count = len(lesson["facts"])
                opinions_count = len(lesson["opinions"])
                tests_count = len(lesson["tests"])
                corrections_count = len(lesson["corrections"])
                
                # Calculate Level achieved based on Law of Three
                total_interactions = facts_count + opinions_count + tests_count + corrections_count
                if total_interactions >= self.TIER_THREE:  # 27
                    level = "Advanced Recursive Understanding"
                elif total_interactions >= self.TIER_TWO:  # 9
                    level = "Intermediate Knowledge Application"
                elif total_interactions >= self.TIER_ONE:  # 3
                    level = "Basic Comprehension"
                else:
                    level = "Initial Exploration"
                
                # Archive this lesson
                timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
                self.memory["absolute_logic"]["active_lessons"][f"lesson_{timestamp}"] = lesson
                del self.memory["absolute_logic"]["active_lessons"]["current_lesson"]
                
                lesson_summary = f'''
┌─────────────────────────────────────────────────────┐
│ ABSOLUTE LOGIC SESSION COMPLETE │ 
│ Level achieved: {level} │ 
│ Facts learned: {facts_count} │ 
│ Opinions processed: {opinions_count} │ 
│ Tests performed: {tests_count} │ 
│ Corrections received: {corrections_count} │
└─────────────────────────────────────────────────────┘

Knowledge has been stored according to the Law of Three.
Facts confirmed {self.TIER_ONE}+ times are now Verified Knowledge.
Facts confirmed {self.TIER_TWO}+ times are now Core Truths.
Facts confirmed {self.TIER_THREE}+ times are now Absolute Knowledge.
'''
                
            else:
                lesson_summary = "Lecture mode ended. No active lesson was in progress."
                
            return lesson_summary
            
        # Process based on the current phase
        if current_phase == "test":
            handled, response = self._absolute_logic_test_mode(user_input)
        elif current_phase == "try":
            handled, response = self._absolute_logic_try_mode(user_input)
        elif current_phase == "learn":
            handled, response = self._absolute_logic_learn_mode(user_input)
        else:
            handled, response = False, None
            
        # Return the response if handled
        if handled:
            return response
            
        # If not handled by any phase, try to detect the appropriate phase
        if user_input.strip().endswith("?"):
            # Questions typically belong in try mode
            handled, response = self._absolute_logic_try_mode(user_input)
            if handled:
                return response
                
        # Check for fact-like statements
        if " is " in user_input or " are " in user_input or "=" in user_input:
            handled, response = self._absolute_logic_test_mode(user_input)
            if handled:
                return response
                
        # Not handled by absolute logic framework
        return None
"""
        
        # Insert the code before the last closing brace of the class
        updated_lecture_content = (
            self.lecture_content[:insertion_point] +
            absolute_logic_code +
            self.lecture_content[insertion_point:]
        )
        
        # Write the updated content back to the file
        if not self._write_file(self.lecture_path, updated_lecture_content):
            return False
            
        # Update our local copy
        self.lecture_content = updated_lecture_content
        print("✓ Added Absolute Logic framework to lecture mode.")
        
        # Now also update the process_lecture_input method to call the absolute logic functions
        self._update_process_lecture_input()
        
        return True

    def _update_process_lecture_input(self):
        """Update the process_lecture_input method to use the Absolute Logic framework."""
        # Find the process_lecture_input method
        pattern = re.compile(r'def\s+process_lecture_input.*?return\s+response', re.DOTALL)
        match = pattern.search(self.lecture_content)
        
        if not match:
            print("⚠ Could not find the process_lecture_input method. Skipping update.")
            return True
            
        # Get the full method code
        method_code = match.group(0)
        
        # Check if it already has absolute logic integration
        if "absolute_logic_response" in method_code:
            print("✓ process_lecture_input already integrates with Absolute Logic.")
            return True
            
        # Find the start of the method body (after the first line)
        method_lines = method_code.split('\n')
        
        if len(method_lines) < 2:
            print("⚠ Could not parse the process_lecture_input method. Skipping update.")
            return True
                
