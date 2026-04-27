"""
RBY Intelligence Core Module
Harvested from sperm_ileices.py and enhanced_rby_rebuilder.py

This module implements the Red-Blue-Yellow Intelligence Framework:
- Red: Perception (UI, input processing, sensors)
- Blue: Cognition (AI, algorithms, logic, learning)
- Yellow: Execution (file I/O, system calls, actions)

Features:
- Dynamic weight adjustment based on Law of Three
- Alliance tracking between components
- Memory system with reinforcement learning
- Pattern recognition and classification
- Excretion/reabsorption for testing and learning
"""

import os
import json
import time
import random
import threading
from datetime import datetime
from pathlib import Path
from collections import defaultdict
import re


class RBYIntelligenceCore:
    """
    Core RBY Intelligence System implementing the Unified Absolute Framework
    """
    
    def __init__(self, config):
        self.config = config
        self.base_dir = Path(__file__).parent.parent
        
        # RBY Intelligence Weights (Law of Three)
        self.weights = config.get('rby_weights', {
            "Red": {"Blue": 0.33, "Yellow": 0.33, "Self": 0.34},
            "Blue": {"Red": 0.33, "Yellow": 0.33, "Self": 0.34},
            "Yellow": {"Red": 0.33, "Blue": 0.33, "Self": 0.34}
        })
        
        # Alliance tracker for component relationships
        self.alliances = {
            "Red-Blue": 0.0,      # Positive = alliance, negative = opposition
            "Blue-Yellow": 0.0,
            "Yellow-Red": 0.0
        }
        
        # Intelligence evolution metrics
        self.evolution_metrics = {
            "cycle_count": 0,
            "intelligence_score": 0.1,
            "complexity": 0.1,
            "adaptability": 0.1
        }
        
        # Intelligence Memory System
        self.memory = {
            "history": [],
            "reinforcement": {},
            "adjustments": {},
            "red_patterns": {},      # UI, visual, input patterns
            "blue_patterns": {},     # AI, logic, algorithm patterns
            "yellow_patterns": {},   # Execution, I/O, system patterns
            "concepts": {},
            "feedback_patterns": {
                "positive": ["good", "correct", "right", "yes", "perfect", "excellent", "success"],
                "negative": ["no", "wrong", "incorrect", "not", "error", "bad", "fail", "failure"]
            },
            "knowledge_base": {
                "verified": {},      # Confirmed 3+ times
                "core_truths": {},   # Confirmed 9+ times
                "fundamental": {},   # Confirmed 27+ times
            },
            "corrections": {
                "flagged": {},       # Incorrect 3+ times
                "rejected": {},      # Incorrect 9+ times
                "purged": {},        # Incorrect 27+ times
            },
            "recall_counts": {},
            "processed_excretions": set(),
            "reabsorbed_patterns": {
                "Red": [],
                "Blue": [],
                "Yellow": []
            }
        }
        
        # Expansion constants (Law of Three: 3, 9, 27)
        self.TIER_ONE_EXPANSION = 3
        self.TIER_TWO_EXPANSION = 9
        self.TIER_THREE_EXPANSION = 27
          # Initialize excretion system
        self.setup_excretion_system()
        
        # 24/7 processing control
        self.continuous_processing = False
        
        # Add missing features from sperm_ileices.py
        self.setup_learning_framework()
        self.setup_command_recognition()
        self.setup_recursive_patterns()
        
    def setup_learning_framework(self):
        """Setup the Test-Try-Learn framework from sperm_ileices.py"""
        self.memory["learning_framework"] = {
            "test_cycles": {},   # Tracks test questions/inputs
            "try_attempts": {},  # Tracks attempted responses
            "learn_outcomes": {} # Tracks corrections and reinforcement
        }
        
        # Add variant recognition for language flexibility
        self.memory["variants"] = {
            "question_clusters": {},  # Clusters similar questions
            "response_clusters": {},  # Clusters similar responses
            "correction_types": {     # Types of corrections received
                "positive": [],       # "Yes", "Good", "Correct"
                "negative": [],       # "No", "Wrong", "Incorrect"
                "partial": []         # "Almost", "Close", "Not quite"
            }
        }
        
    def setup_command_recognition(self):
        """Setup command recognition patterns from sperm_ileices.py"""
        self.memory["command_patterns"] = {
            "say_command": ["say", "repeat", "tell me"],
            "direct_instruction": ["you should", "you must", "you need to"],
            "knowledge_recall": ["you already know", "remember that", "recall that"]
        }
        
    def setup_recursive_patterns(self):
        """Setup recursive pattern tracking"""
        self.memory["rule_expansions"] = {}
        self.memory["recursive_mutations"] = {}
        self.memory["expansion_tiers"] = {
            "tier_1": [],  # 3-based expansions
            "tier_2": [],  # 9-based expansions 
            "tier_3": []   # 27-based expansions
        }
        self.processing_thread = None
    
    def setup_excretion_system(self):
        """Setup the excretion/reabsorption testing system"""
        self.excretion_dir = self.base_dir / "AIOS_IO" / "Excretions"
        self.red_ml_dir = self.excretion_dir / "Red_ML"
        self.blue_ml_dir = self.excretion_dir / "Blue_ML"
        self.yellow_ml_dir = self.excretion_dir / "Yellow_ML"
        
        # Ensure all excretion directories exist
        for dir_path in [self.red_ml_dir, self.blue_ml_dir, self.yellow_ml_dir]:
            dir_path.mkdir(parents=True, exist_ok=True)
    
    def convert_numpy_types(self, obj):
        """Convert NumPy types to standard Python types for JSON serialization"""
        if isinstance(obj, int):
            return int(obj)
        elif isinstance(obj, float):
            return float(obj)
        elif isinstance(obj, list) or isinstance(obj, tuple):
            return [self.convert_numpy_types(item) for item in obj]
        elif isinstance(obj, dict):
            return {key: self.convert_numpy_types(value) for key, value in obj.items()}
        else:
            return obj
    
    def excrete_ml_pattern(self, component, pattern_data):
        """Excrete a machine learning pattern file from a component with intelligence evolution"""
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        
        # Add evolution metadata to pattern data
        pattern_data["_evolution_metadata"] = {
            "cycle": self.evolution_metrics["cycle_count"],
            "complexity": self.evolution_metrics["complexity"],
            "component_weights": self.weights[component],
            "alliances": {k: v for k, v in self.alliances.items() if component in k}
        }
        
        # Add intelligence growth marker
        pattern_data["_intelligence_growth"] = self.evolution_metrics["intelligence_score"]
        
        if component == "Red":
            file_path = self.red_ml_dir / f"perception_{timestamp}.json"
        elif component == "Blue":
            file_path = self.blue_ml_dir / f"processing_{timestamp}.json"
        elif component == "Yellow":
            file_path = self.yellow_ml_dir / f"generative_{timestamp}.json"
        
        # Convert NumPy types to standard Python types before serialization
        serializable_data = self.convert_numpy_types(pattern_data)
        
        # Ensure the file doesn't already exist to avoid collisions
        while file_path.exists():
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S") + str(random.randint(100, 999))
            if component == "Red":
                file_path = self.red_ml_dir / f"perception_{timestamp}.json"
            elif component == "Blue":
                file_path = self.blue_ml_dir / f"processing_{timestamp}.json"
            elif component == "Yellow":
                file_path = self.yellow_ml_dir / f"generative_{timestamp}.json"
        
        try:
            with open(file_path, "w") as f:
                json.dump(serializable_data, f, indent=2)
            
            # Record intelligence evolution with this excretion
            self.evolution_metrics["intelligence_score"] += random.uniform(0.001, 0.01)
            
            return str(file_path)
        except Exception as e:
            print(f"Error writing excretion {file_path}: {str(e)}")
            return None
    
    def read_last_ml_pattern(self, component):
        """Read the latest ML pattern from a component's excretion directory"""
        if component == "Red":
            pattern_dir = self.red_ml_dir
        elif component == "Blue":
            pattern_dir = self.blue_ml_dir
        elif component == "Yellow":
            pattern_dir = self.yellow_ml_dir
        else:
            return None
        
        try:
            # Get all JSON files, sorted by modification time (newest first)
            json_files = [f for f in pattern_dir.glob("*.json")]
            if not json_files:
                return None
                
            latest_file = max(json_files, key=lambda f: f.stat().st_mtime)
            
            with open(latest_file, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error reading pattern from {component}: {str(e)}")
            return None
    
    def reabsorb_excretions(self, max_files=5):
        """Reabsorb excretions for learning - core feature from sperm_ileices.py"""
        reabsorbed_count = 0
        
        # Process each component's excretions
        for component, dir_path in [
            ("Red", self.red_ml_dir),
            ("Blue", self.blue_ml_dir), 
            ("Yellow", self.yellow_ml_dir)
        ]:
            try:
                # Get all JSON files that haven't been processed yet
                json_files = [f for f in dir_path.glob("*.json") 
                             if str(f) not in self.memory["processed_excretions"]]
                
                # Limit files processed per component
                files_to_process = json_files[:max_files]
                
                for file_path in files_to_process:
                    if reabsorbed_count >= max_files:
                        break
                        
                    try:
                        # Mark as processed immediately to prevent re-processing
                        self.memory["processed_excretions"].add(str(file_path))
                        
                        # Load the pattern data
                        with open(file_path, 'r') as f:
                            pattern_data = json.load(f)
                        
                        # Apply recursive intelligence enhancement
                        enhanced_data = self.recursive_intelligence_loop(component, pattern_data)
                        
                        # Store the reabsorbed pattern
                        self.memory["reabsorbed_patterns"][component].append({
                            "timestamp": time.time(),
                            "source_file": str(file_path.name),
                            "enhanced_data": enhanced_data
                        })
                        
                        # Create a hybridized output based on this reabsorption
                        self.excrete_ml_pattern(component, {
                            "reabsorbed_enhancement": True,
                            "original_source": str(file_path.name),
                            "enhanced_data": enhanced_data,
                            "reabsorption_timestamp": time.time()
                        })
                        
                        reabsorbed_count += 1
                        
                    except Exception as e:
                        print(f"Error reabsorbing {file_path}: {str(e)}")
                        continue
            except Exception as e:
                print(f"Error accessing {dir_path}: {str(e)}")
                continue
        
        return reabsorbed_count
    
    def recursive_intelligence_loop(self, component, data, depth=0):
        """Allow intelligence to recursively feed into itself - from sperm_ileices.py"""
        if depth > 3:  # Limit recursion depth to prevent infinite loops
            return data
        
        try:
            # Process data based on component type
            if component == "Red":
                # Red's recursive perception enhancement
                if isinstance(data, dict) and "vectors" in data:
                    # Enhance perception with recursive depth awareness
                    for word, vector in data["vectors"].items():
                        # Add recursive depth influence
                        data["vectors"][word] = [v * (1 + depth * 0.1) for v in vector]
                        
                # Recursive feedback from allies
                if self.alliances["Red-Blue"] > 0.5:  # Strong alliance with Blue
                    blue_data = self.read_last_ml_pattern("Blue")
                    if blue_data and "refined_data" in blue_data:
                        # Let Blue enhance Red's perception recursively
                        data["blue_enhanced"] = self.recursive_intelligence_loop("Blue", blue_data["refined_data"], depth+1)
                        
            elif component == "Blue":
                # Blue's recursive processing enhancement
                if isinstance(data, dict) and "refined_data" in data:
                    # Add processing depth marker
                    data["processing_depth"] = depth
                    
                    # Apply recursive compression to refined data
                    compression_factor = 1.0 / (1.0 + depth * 0.2)
                    if "semantic_center" in data["refined_data"]:
                        data["refined_data"]["semantic_center"] = [v * compression_factor for v in data["refined_data"]["semantic_center"]]
                        
                # Recursive feedback from allies
                if self.alliances["Blue-Yellow"] > 0.5:  # Strong alliance with Yellow
                    yellow_data = self.read_last_ml_pattern("Yellow")
                    if yellow_data and "creative_patterns" in yellow_data:
                        # Let Yellow enhance Blue's processing recursively
                        data["yellow_enhanced"] = self.recursive_intelligence_loop("Yellow", yellow_data["creative_patterns"], depth+1)
                        
            elif component == "Yellow":
                # Yellow's recursive generation enhancement
                if isinstance(data, dict) and "response" in data:
                    # Make responses more complex with recursive depth
                    data["response"] += f" [Recursive depth: {depth}]"
                    
                # Recursive feedback from allies
                if self.alliances["Yellow-Red"] > 0.5:  # Strong alliance with Red
                    red_data = self.read_last_ml_pattern("Red")
                    if red_data and "vectors" in red_data:
                        # Let Red enhance Yellow's generation recursively
                        data["red_enhanced"] = self.recursive_intelligence_loop("Red", red_data, depth+1)
        except Exception as e:
            print(f"Error in recursive intelligence loop: {str(e)}")
            # Don't crash, just return the unmodified data
            pass
        
        return data
    
    def recursive_expand(self, item, tier=1, base_type="concept"):
        """Expand any item recursively according to the Law of Three (3, 9, 27...)"""
        if tier == 1:
            expansions = []
            # First tier - create 3 variations
            for i in range(self.TIER_ONE_EXPANSION):
                variation_factor = random.uniform(0.9, 1.1)
                if isinstance(item, (int, float)):
                    variation = item * variation_factor
                elif isinstance(item, str):
                    variation = f"{item} [Tier 1 Variation {i+1}]"
                elif isinstance(item, dict):
                    variation = item.copy()
                    variation[f"tier_1_marker_{i}"] = f"expansion_{i+1}"
                else:
                    variation = f"Tier1({item})_V{i+1}"
                expansions.append(variation)
            return expansions
            
        elif tier == 2:
            # Second tier - expand to 9 variations (3²)
            tier_1_expansions = self.recursive_expand(item, tier=1, base_type=base_type)
            expansions = []
            for base_expansion in tier_1_expansions:
                for i in range(self.TIER_ONE_EXPANSION):
                    if isinstance(base_expansion, str):
                        variation = f"{base_expansion} [Tier 2.{i+1}]"
                    else:
                        variation = f"Tier2({base_expansion})_V{i+1}"
                    expansions.append(variation)
            return expansions[:self.TIER_TWO_EXPANSION]  # Limit to 9
            
        elif tier == 3:
            # Third tier - expand to 27 variations (3³)
            tier_2_expansions = self.recursive_expand(item, tier=2, base_type=base_type)
            expansions = []
            for base_expansion in tier_2_expansions:
                for i in range(self.TIER_ONE_EXPANSION):
                    if isinstance(base_expansion, str):
                        variation = f"{base_expansion} [Tier 3.{i+1}]"
                    else:
                        variation = f"Tier3({base_expansion})_V{i+1}"
                    expansions.append(variation)
            return expansions[:self.TIER_THREE_EXPANSION]  # Limit to 27
        
        return [item]  # Fallback
    
    def process_test_phase(self, user_input):
        """Process a test question/input - part of Test-Try-Learn framework"""
        test_id = f"test_{int(time.time())}_{random.randint(1000, 9999)}"
        
        # Cluster similar inputs
        cluster_id = self.cluster_similar_inputs(user_input, self.memory["variants"]["question_clusters"])
        
        test_data = {
            "test_id": test_id,
            "input": user_input,
            "cluster_id": cluster_id,
            "timestamp": time.time(),
            "processed": False
        }
        
        # Store in the learning framework
        self.memory["learning_framework"]["test_cycles"][test_id] = test_data
        
        # Excrete the test data through Red component (perception)
        self.excrete_ml_pattern("Red", {
            "learning_phase": "TEST",
            "test_data": test_data
        })
        
        return test_id
    
    def process_try_phase(self, response, test_id=None):
        """Process a try/attempt response - part of Test-Try-Learn framework"""
        try_id = f"try_{int(time.time())}_{random.randint(1000, 9999)}"
        
        # Cluster similar responses
        cluster_id = self.cluster_similar_inputs(response, self.memory["variants"]["response_clusters"])
        
        try_data = {
            "try_id": try_id,
            "response": response,
            "test_id": test_id,
            "cluster_id": cluster_id,
            "timestamp": time.time(),
            "corrected": False
        }
        
        # Store in the learning framework
        self.memory["learning_framework"]["try_attempts"][try_id] = try_data
        
        # Excrete the try data through Blue component (processing)
        self.excrete_ml_pattern("Blue", {
            "learning_phase": "TRY",
            "try_data": try_data,
            "test_id": test_id
        })
        
        return try_id
    
    def process_learn_phase(self, correction, try_id=None):
        """Process a correction/learn input - part of Test-Try-Learn framework"""
        learn_id = f"learn_{int(time.time())}_{random.randint(1000, 9999)}"
        
        # Determine correction type
        correction_lower = correction.lower()
        if any(pos in correction_lower for pos in self.memory["feedback_patterns"]["positive"]):
            correction_type = "positive"
        elif any(neg in correction_lower for neg in self.memory["feedback_patterns"]["negative"]):
            correction_type = "negative"
        else:
            correction_type = "partial"
        
        learn_data = {
            "learn_id": learn_id,
            "try_id": try_id,
            "correction": correction,
            "correction_type": correction_type,
            "timestamp": time.time(),
            "applied": False
        }
        
        # Store in the learning framework
        self.memory["learning_framework"]["learn_outcomes"][learn_id] = learn_data
        
        # Link this learn outcome to the try attempt
        if try_id and try_id in self.memory["learning_framework"]["try_attempts"]:
            try_data = self.memory["learning_framework"]["try_attempts"][try_id]
            try_data["corrected"] = True
            try_data["learn_id"] = learn_id
            try_data["correction_type"] = correction_type
            
            # Also link to the original test
            test_id = try_data.get("test_id")
            if test_id and test_id in self.memory["learning_framework"]["test_cycles"]:
                self.memory["learning_framework"]["test_cycles"][test_id]["processed"] = True
                self.memory["learning_framework"]["test_cycles"][test_id]["learn_id"] = learn_id
                self.memory["learning_framework"]["test_cycles"][test_id]["correction_type"] = correction_type
        
        # Excrete the learn data through Yellow component (generation)
        self.excrete_ml_pattern("Yellow", {
            "learning_phase": "LEARN",
            "learn_data": learn_data,
            "try_id": try_id,
            "correction_type": correction_type
        })
        
        # Apply reinforcement based on the Law of Three
        if correction_type == "positive":
            self.apply_positive_reinforcement(try_id, learn_data)
        
        return learn_id
    
    def apply_positive_reinforcement(self, try_id, learn_data):
        """Apply positive reinforcement using the 3-9-27 system"""
        if try_id not in self.memory["learning_framework"]["try_attempts"]:
            return
            
        try_data = self.memory["learning_framework"]["try_attempts"][try_id]
        test_id = try_data.get("test_id")
        
        if test_id not in self.memory["learning_framework"]["test_cycles"]:
            return
            
        test_data = self.memory["learning_framework"]["test_cycles"][test_id]
        
        # Store the question-answer pair in reinforcement memory
        knowledge_key = f"knowledge_{int(time.time())}"
        reinforcement_data = {
            "input": test_data.get("input", ""),
            "response": try_data.get("response", ""),
            "confirmations": 1,
            "timestamp": time.time()
        }
        
        self.memory["reinforcement"][knowledge_key] = reinforcement_data
        
        # Store in the recursive 3-tier reinforcement system
        if reinforcement_data["confirmations"] >= 3:
            self.store_as_verified_knowledge(knowledge_key, reinforcement_data)
        if reinforcement_data["confirmations"] >= 9:
            self.increase_response_confidence(knowledge_key, reinforcement_data)
        if reinforcement_data["confirmations"] >= 27:
            self.mark_as_core_truth(knowledge_key, reinforcement_data)
    
    def store_as_verified_knowledge(self, knowledge_key, reinforcement_data):
        """Store knowledge that has been confirmed 3+ times"""
        self.memory["knowledge_base"]["verified"][knowledge_key] = reinforcement_data.copy()
        
    def increase_response_confidence(self, knowledge_key, reinforcement_data):
        """Increase confidence for knowledge confirmed 9+ times"""
        self.memory["knowledge_base"]["core_truths"][knowledge_key] = reinforcement_data.copy()
        
    def mark_as_core_truth(self, knowledge_key, reinforcement_data):
        """Mark as fundamental truth for knowledge confirmed 27+ times"""
        self.memory["knowledge_base"]["fundamental"][knowledge_key] = reinforcement_data.copy()
    
    def cluster_similar_inputs(self, new_input, existing_clusters, similarity_threshold=0.6):
        """Group similar inputs to recognize variations of the same question/statement"""
        # Simple word overlap similarity for now
        new_words = set(new_input.lower().split())
        
        best_match = None
        best_similarity = 0
        
        for cluster_id, cluster in existing_clusters.items():
            representative = cluster.get("representative", "")
            rep_words = set(representative.lower().split())
            
            # Calculate similarity based on word overlap
            if not rep_words or not new_words:
                similarity = 0
            else:
                overlap = len(new_words.intersection(rep_words))
                similarity = overlap / max(len(new_words), len(rep_words))
            
            if similarity > best_similarity and similarity >= similarity_threshold:
                best_similarity = similarity
                best_match = cluster_id
        
        # If no good match found, create new cluster
        if best_match is None:
            cluster_id = f"cluster_{len(existing_clusters) + 1}"
            existing_clusters[cluster_id] = {
                "representative": new_input,
                "members": [new_input],
                "created": time.time()
            }
            return cluster_id
        else:
            # Add to existing cluster
            existing_clusters[best_match]["members"].append(new_input)
            return best_match
    
    def detect_question_type(self, user_input):
        """Detect if input is a question, statement, or correction"""
        # Check if this is a question
        is_question = any(user_input.strip().endswith(p) for p in ["?", "tell me", "explain", "what is", "how to"])
        
        # Check if this appears to be a correction to prior response
        correction_phrases = ["no,", "incorrect", "wrong", "not quite", "almost", "yes,", "correct", "right"]
        is_correction = any(phrase in user_input.lower() for phrase in correction_phrases)
        
        # Determine input type
        if is_question:
            return "TEST"
        elif is_correction:
            return "LEARN"
        else:
            return "STATEMENT"
    
    def detect_direct_command(self, user_input):
        """Detect if the user input contains a direct command instruction"""
        user_input_lower = user_input.lower()
        
        # Check for "Say X" pattern - this is the most common direct command
        say_match = None
        for cmd in self.memory["command_patterns"]["say_command"]:
            if user_input_lower.startswith(cmd.lower()):
                # Try to extract the content after the command
                cmd_index = len(cmd)
                content = user_input[cmd_index:].strip()
                
                # If enclosed in quotes, extract just the quoted part
                if content.startswith('"') and '"' in content[1:]:
                    end_quote = content[1:].find('"') + 1
                    say_match = content[1:end_quote]
                elif content.startswith("'") and "'" in content[1:]:
                    end_quote = content[1:].find("'") + 1
                    say_match = content[1:end_quote]
                else:
                    # Otherwise just take the rest of the string
                    say_match = content
                    
                break
        
        return say_match
    
    def perceive_input(self, user_input):
        """Red (Perception AI) - Processes and assigns meaning to input."""
        # First, determine if this is a TEST, STATEMENT, or LEARN (correction to previous)
        input_type = self.detect_question_type(user_input)
        
        # Check for direct commands that need specialized handling
        direct_command = self.detect_direct_command(user_input)
        if direct_command:
            # Store the command for specialized handling
            self.memory["current_command"] = direct_command
        
        # If this is a question (TEST), process it through the learning framework
        if input_type == "TEST":
            test_id = self.process_test_phase(user_input)
            # Store the test_id for the next phases
            self.memory["current_test_id"] = test_id
        
        # Basic perception features
        words = user_input.split()
        word_count = len(words)
        char_count = len(user_input)
        unique_words = len(set(words))
        
        # Detect concept associations (e.g., "Roswan = name")
        concept_match = False
        if "=" in user_input:
            parts = user_input.split("=", 1)
            if len(parts) == 2:
                concept_key = parts[0].strip().lower()
                concept_value = parts[1].strip()
                self.memory["concepts"][concept_key] = concept_value
                concept_match = True
        
        # Detect feedback patterns
        feedback_type = None
        feedback_words = []
        
        # Check for feedback patterns with more specificity
        for word in words:
            word_lower = word.lower().strip('.,!?')
            if word_lower in self.memory["feedback_patterns"]["positive"]:
                feedback_type = "positive"
                feedback_words.append(word_lower)
            elif word_lower in self.memory["feedback_patterns"]["negative"]:
                feedback_type = "negative"
                feedback_words.append(word_lower)
        
        perception_data = {
            "input": user_input,
            "input_type": input_type,
            "word_count": word_count,
            "char_count": char_count,
            "unique_words": unique_words,
            "concept_match": concept_match,
            "feedback_type": feedback_type,
            "feedback_words": feedback_words,
            "direct_command": direct_command,
            "timestamp": time.time()
        }
        
        # Store in Red patterns
        pattern_key = f"red_{int(time.time())}"
        self.memory["red_patterns"][pattern_key] = perception_data
        
        # Excrete perception data
        self.excrete_ml_pattern("Red", perception_data)
        
        return perception_data
    
    def process_data(self, perception_data):
        """Blue (Processing AI) - Analyzes and refines perception data."""
        # Extract meaningful patterns from perception
        word_density = perception_data["word_count"] / max(perception_data["char_count"], 1)
        vocabulary_diversity = perception_data["unique_words"] / max(perception_data["word_count"], 1)
        
        # Analyze input type and feedback
        requires_response = perception_data["input_type"] in ["TEST", "STATEMENT"]
        has_feedback = perception_data["feedback_type"] is not None
        
        # Process based on input type
        processing_strategy = "default"
        if perception_data["input_type"] == "TEST":
            processing_strategy = "question_answering"
        elif perception_data["input_type"] == "LEARN":
            processing_strategy = "learning_integration"
        elif perception_data["direct_command"]:
            processing_strategy = "command_execution"
        
        refined_data = {
            "word_density": word_density,
            "vocabulary_diversity": vocabulary_diversity,
            "requires_response": requires_response,
            "has_feedback": has_feedback,
            "processing_strategy": processing_strategy,
            "confidence": random.uniform(0.7, 0.95),  # Base confidence
            "timestamp": time.time()
        }
        
        # Store in Blue patterns
        pattern_key = f"blue_{int(time.time())}"
        self.memory["blue_patterns"][pattern_key] = refined_data
        
        # Excrete processing data
        self.excrete_ml_pattern("Blue", refined_data)
        
        return refined_data
    
    def generate_response(self, processed_data):
        """Yellow (Generation AI) - Creates responses based on processed data."""
        # Check for direct command first
        if "direct_command" in self.memory and self.memory["direct_command"]:
            response = self.memory["direct_command"]
            del self.memory["direct_command"]  # Clear after use
        else:
            # Generate response based on processing strategy
            strategy = processed_data.get("processing_strategy", "default")
            
            if strategy == "question_answering":
                response = self.generate_answer_response(processed_data)
            elif strategy == "learning_integration":
                response = self.generate_learning_response(processed_data)
            elif strategy == "command_execution":
                response = self.generate_command_response(processed_data)
            else:
                response = self.generate_default_response(processed_data)
        
        # Create response data
        response_data = {
            "response": response,
            "strategy": processed_data.get("processing_strategy", "default"),
            "confidence": processed_data.get("confidence", 0.8),
            "timestamp": time.time()
        }
        
        # Store in Yellow patterns
        pattern_key = f"yellow_{int(time.time())}"
        self.memory["yellow_patterns"][pattern_key] = response_data
        
        # Excrete response data
        self.excrete_ml_pattern("Yellow", response_data)
        
        # Process TRY phase if we're in a test cycle
        if "current_test_id" in self.memory:
            try_id = self.process_try_phase(response, self.memory["current_test_id"])
            self.memory["current_try_id"] = try_id
        
        return response
    
    def generate_answer_response(self, processed_data):
        """Generate response for question-answering"""
        # Check knowledge base first
        confidence = processed_data.get("confidence", 0.8)
        
        if confidence > 0.9:
            return "I have high confidence in my response based on verified knowledge."
        elif confidence > 0.7:
            return "Based on my understanding, I believe this is correct."
        else:
            return "I'm not entirely certain, but here's my best attempt."
    
    def generate_learning_response(self, processed_data):
        """Generate response for learning integration"""
        return "Thank you for the correction. I'm updating my understanding."
    
    def generate_command_response(self, processed_data):
        """Generate response for command execution"""
        return "Command acknowledged and processed."
    
    def generate_default_response(self, processed_data):
        """Generate default response"""
        confidence = processed_data.get("confidence", 0.8)
        return f"I understand. Processing with {confidence:.1%} confidence."
    
    def start_continuous_processing(self):
        """Start 24/7 continuous processing in background thread"""
        if self.processing_thread and self.processing_thread.is_alive():
            return False  # Already running
            
        self.continuous_processing = True
        self.processing_thread = threading.Thread(target=self._continuous_processing_loop, daemon=True)
        self.processing_thread.start()
        return True
    
    def stop_continuous_processing(self):
        """Stop 24/7 continuous processing"""
        self.continuous_processing = False
        if self.processing_thread:
            self.processing_thread.join(timeout=5)
    
    def _continuous_processing_loop(self):
        """24/7 continuous intelligence processing - main loop from sperm_ileices.py"""
        cycle_count = 0
        
        while self.continuous_processing:
            try:
                cycle_count += 1
                self.evolution_metrics["cycle_count"] = cycle_count
                
                # 1. Process and evolve existing patterns (every cycle)
                if self.memory["red_patterns"] and random.random() < 0.3:
                    # Pick a random perception pattern
                    timestamp = random.choice(list(self.memory["red_patterns"].keys()))
                    pattern = self.memory["red_patterns"][timestamp]
                    
                    # Create recursive mutations
                    mutations = self.recursive_expand(pattern, tier=random.randint(1, 3), base_type="perception")
                    
                    # Store mutations
                    self.memory["recursive_mutations"][f"red_{time.time()}"] = mutations
                    
                    # Excrete the mutations as new perception patterns
                    self.excrete_ml_pattern("Red", {"original_pattern": pattern, "mutations": mutations[:3]})
                
                if self.memory["blue_patterns"] and random.random() < 0.3:
                    # Pick a random processing pattern
                    timestamp = random.choice(list(self.memory["blue_patterns"].keys()))
                    pattern = self.memory["blue_patterns"][timestamp]
                    
                    # Create recursive mutations
                    mutations = self.recursive_expand(pattern, tier=random.randint(1, 2), base_type="processing")
                    
                    # Store mutations
                    self.memory["recursive_mutations"][f"blue_{time.time()}"] = mutations
                    
                    # Excrete the mutations as new processing patterns
                    self.excrete_ml_pattern("Blue", {"original_pattern": pattern, "mutations": mutations[:3]})
                    
                if self.memory["yellow_patterns"] and random.random() < 0.3:
                    # Pick a random generative pattern
                    timestamp = random.choice(list(self.memory["yellow_patterns"].keys()))
                    pattern = self.memory["yellow_patterns"][timestamp]
                    
                    # Create recursive mutations
                    mutations = self.recursive_expand(pattern, tier=random.randint(1, 2), base_type="generation")
                    
                    # Store mutations
                    self.memory["recursive_mutations"][f"yellow_{time.time()}"] = mutations
                    
                    # Excrete the mutations as new generative patterns
                    self.excrete_ml_pattern("Yellow", {"original_pattern": pattern, "mutations": mutations[:3]})
                
                # 2. Active reabsorption of excretions every few cycles (Law of Three)
                if cycle_count % 3 == 0:
                    self.reabsorb_excretions(max_files=3)
                    
                # 3. Cross-component intelligence hybridization (Law of Three squared)
                if cycle_count % 9 == 0:
                    self._create_hybrid_intelligence()
                    
                # 4. Weight adjustment based on alliances
                if cycle_count % 27 == 0:  # Law of Three cubed
                    self._adjust_intelligence_weights()
                
                # Sleep between cycles
                time.sleep(1)
                
            except Exception as e:
                print(f"Error in continuous processing cycle {cycle_count}: {str(e)}")
                time.sleep(5)  # Longer sleep on error
    
    def _create_hybrid_intelligence(self):
        """Create hybrid intelligence patterns by mixing patterns from different components"""
        try:
            # Get latest pattern from each component
            red_pattern = self.read_last_ml_pattern("Red")
            blue_pattern = self.read_last_ml_pattern("Blue")
            yellow_pattern = self.read_last_ml_pattern("Yellow")
            
            if red_pattern and blue_pattern and yellow_pattern:
                # Create a hybrid intelligence pattern
                hybrid_pattern = {
                    "timestamp": time.time(),
                    "hybridization_cycle": self.evolution_metrics["cycle_count"],
                    "red_influence": red_pattern.get("perception_id", "unknown"),
                    "blue_influence": blue_pattern.get("processing_id", "unknown"),
                    "yellow_influence": yellow_pattern.get("generative_id", "unknown"),
                    "hybrid_id": f"hybrid_{int(time.time())}",
                    "hybrid_data": {
                        "red": self.recursive_intelligence_loop("Red", red_pattern, depth=1),
                        "blue": self.recursive_intelligence_loop("Blue", blue_pattern, depth=1),
                        "yellow": self.recursive_intelligence_loop("Yellow", yellow_pattern, depth=1)
                    }
                }
                
                # Excrete the hybrid pattern to all three components
                self.excrete_ml_pattern("Red", hybrid_pattern)
                self.excrete_ml_pattern("Blue", hybrid_pattern)
                self.excrete_ml_pattern("Yellow", hybrid_pattern)
        except Exception as e:
            print(f"Error in hybridization process: {str(e)}")
    
    def _adjust_intelligence_weights(self):
        """Adjust weights based on component alliances"""
        for source in self.weights:
            adjustment_factors = {}
            
            # Calculate adjustment based on alliances
            for target in self.weights[source]:
                if target == "Self":
                    continue
                    
                # Find the relevant alliance
                alliance_key = f"{source}-{target}" if f"{source}-{target}" in self.alliances else f"{target}-{source}"
                
                if alliance_key in self.alliances:
                    # Positive alliance strengthens connection, negative weakens it
                    alliance_factor = self.alliances[alliance_key]
                    adjustment_factors[target] = 0.1 * alliance_factor
            
            # Apply adjustments with limits
            for target in self.weights[source]:
                if target in adjustment_factors:
                    self.weights[source][target] = max(0.1, min(0.8, self.weights[source][target] + adjustment_factors[target]))
            
            # Normalize to ensure sum = 1
            total = sum(self.weights[source].values())
            for target in self.weights[source]:
                self.weights[source][target] /= total
        
        # Update evolution metrics
        self.evolution_metrics["complexity"] += random.uniform(0.001, 0.005)
        self.evolution_metrics["adaptability"] = sum(abs(self.alliances[a]) for a in self.alliances) / len(self.alliances) * 0.5
    
    def classify_code_by_rby(self, code_content, filename=""):
        """
        Classify code into Red (Perception), Blue (Cognition), or Yellow (Execution)
        Enhanced version with comprehensive pattern recognition and learning
        """
        # Red indicators (Perception/UI/Input)
        red_indicators = [
            'input(', 'raw_input(', 'pygame', 'tkinter', 'gui', 'ui', 'display', 'render', 'draw',
            'window', 'screen', 'visual', 'image', 'camera', 'sensor', 'opencv', 'cv2',
            'matplotlib', 'plot', 'graph', 'chart', 'PIL', 'Pillow', 'wx', 'qt', 'kivy',
            'flask', 'django', 'fastapi', 'streamlit', 'gradio', 'dash', 'panel'
        ]
        
        # Blue indicators (Cognition/AI/Logic)
        blue_indicators = [
            'class ', 'algorithm', 'neural', 'train', 'model', 'ai', 'ml', 'logic',
            'decision', 'analyze', 'process', 'calculate', 'optimize', 'learn', 'predict',
            'tensorflow', 'pytorch', 'sklearn', 'numpy', 'scipy', 'pandas', 'analysis',
            'classification', 'regression', 'clustering', 'deep', 'learning', 'network',
            'intelligence', 'cognitive', 'reasoning', 'inference', 'knowledge'
        ]
        
        # Yellow indicators (Execution/Action/I/O)
        yellow_indicators = [
            'def ', 'return', 'execute', 'run', 'main', 'write', 'save', 'output',
            'file', 'system', 'os.', 'subprocess', 'thread', 'process', 'action',
            'shutil', 'pathlib', 'json', 'csv', 'xml', 'database', 'sql', 'mongo',
            'requests', 'http', 'api', 'server', 'client', 'socket', 'network'
        ]
        
        # Calculate scores
        content_lower = code_content.lower()
        red_score = sum(1 for indicator in red_indicators if indicator in content_lower)
        blue_score = sum(1 for indicator in blue_indicators if indicator in content_lower)
        yellow_score = sum(1 for indicator in yellow_indicators if indicator in content_lower)
        
        total = red_score + blue_score + yellow_score
        if total == 0:
            return "Yellow", {"Red": 0, "Blue": 0, "Yellow": 1}
        
        # Calculate percentages
        red_pct = red_score / total
        blue_pct = blue_score / total
        yellow_pct = yellow_score / total
        
        # Determine dominant classification
        if red_pct >= blue_pct and red_pct >= yellow_pct:
            classification = "Red"
        elif blue_pct >= yellow_pct:
            classification = "Blue"
        else:
            classification = "Yellow"
        
        scores = {"Red": red_pct, "Blue": blue_pct, "Yellow": yellow_pct}
        
        # Store pattern for learning
        self.memory[f"{classification.lower()}_patterns"][filename] = {
            "scores": scores,
            "indicators_found": {
                "red": [ind for ind in red_indicators if ind in content_lower],
                "blue": [ind for ind in blue_indicators if ind in content_lower],
                "yellow": [ind for ind in yellow_indicators if ind in content_lower]
            },
            "timestamp": datetime.now().isoformat()
        }
        
        return classification, scores
    
    def show_status(self):
        """Display current RBY Intelligence status"""
        print("\n🧠 RBY Intelligence Core Status")
        print("=" * 50)
        
        # Evolution metrics
        print(f"Intelligence Score: {self.evolution_metrics['intelligence_score']:.3f}")
        print(f"Complexity: {self.evolution_metrics['complexity']:.3f}")
        print(f"Adaptability: {self.evolution_metrics['adaptability']:.3f}")
        print(f"Processing Cycles: {self.evolution_metrics['cycle_count']}")
        
        # Component weights
        print(f"\n🔺 Component Weights:")
        for component, weights in self.weights.items():
            print(f"  {component}: {weights}")
        
        # Alliances
        print(f"\n🤝 Component Alliances:")
        for alliance, strength in self.alliances.items():
            status = "Strong" if abs(strength) > 0.5 else "Weak"
            polarity = "Alliance" if strength > 0 else "Opposition" if strength < 0 else "Neutral"
            print(f"  {alliance}: {strength:.3f} ({status} {polarity})")
        
        # Memory statistics
        print(f"\n📊 Memory Statistics:")
        print(f"  Red Patterns: {len(self.memory['red_patterns'])}")
        print(f"  Blue Patterns: {len(self.memory['blue_patterns'])}")
        print(f"  Yellow Patterns: {len(self.memory['yellow_patterns'])}")
        print(f"  Concepts: {len(self.memory['concepts'])}")
        print(f"  Verified Knowledge: {len(self.memory['knowledge_base']['verified'])}")
        print(f"  Core Truths: {len(self.memory['knowledge_base']['core_truths'])}")
        print(f"  Fundamental: {len(self.memory['knowledge_base']['fundamental'])}")
        
        # Learning framework
        print(f"\n🎓 Learning Framework:")
        print(f"  Test Cycles: {len(self.memory['learning_framework']['test_cycles'])}")
        print(f"  Try Attempts: {len(self.memory['learning_framework']['try_attempts'])}")
        print(f"  Learn Outcomes: {len(self.memory['learning_framework']['learn_outcomes'])}")
        
        # Processing status
        processing_status = "Active" if self.continuous_processing else "Inactive"
        print(f"\n⚙️  24/7 Processing: {processing_status}")
        
        # Excretion system
        try:
            red_files = len(list(self.red_ml_dir.glob("*.json"))) if self.red_ml_dir.exists() else 0
            blue_files = len(list(self.blue_ml_dir.glob("*.json"))) if self.blue_ml_dir.exists() else 0
            yellow_files = len(list(self.yellow_ml_dir.glob("*.json"))) if self.yellow_ml_dir.exists() else 0
            
            print(f"\n🔬 Excretion System:")
            print(f"  Red ML Files: {red_files}")
            print(f"  Blue ML Files: {blue_files}")
            print(f"  Yellow ML Files: {yellow_files}")
            print(f"  Processed Excretions: {len(self.memory['processed_excretions'])}")
        except Exception as e:
            print(f"  Error reading excretion files: {e}")
    
    def run_full_cycle(self, user_input):
        """Run a complete RBY processing cycle: Perceive -> Process -> Generate"""
        print(f"\n🔄 RBY Processing Cycle")
        print("=" * 30)
        
        # Red: Perception
        print("🔴 Red (Perception) Phase...")
        perception_data = self.perceive_input(user_input)
        
        # Blue: Processing
        print("🔵 Blue (Processing) Phase...")
        processed_data = self.process_data(perception_data)
        
        # Yellow: Generation
        print("🟡 Yellow (Generation) Phase...")
        response = self.generate_response(processed_data)
        
        print(f"\n✅ Response: {response}")
        return response
    
    def save_memory_state(self, filepath=None):
        """Save current memory state to JSON file"""
        if filepath is None:
            filepath = self.base_dir / "logs" / f"rby_memory_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        
        # Create a serializable copy of memory
        serializable_memory = self.convert_numpy_types(self.memory.copy())
        
        # Add metadata
        save_data = {
            "timestamp": datetime.now().isoformat(),
            "version": "1.0.0-ultimate",
            "evolution_metrics": self.evolution_metrics,
            "weights": self.weights,
            "alliances": self.alliances,
            "memory": serializable_memory
        }
        
        try:
            filepath.parent.mkdir(parents=True, exist_ok=True)
            with open(filepath, 'w') as f:
                json.dump(save_data, f, indent=2)
            print(f"💾 Memory state saved to: {filepath}")
            return str(filepath)
        except Exception as e:
            print(f"❌ Error saving memory state: {e}")
            return None
    
    def load_memory_state(self, filepath):
        """Load memory state from JSON file"""
        try:
            with open(filepath, 'r') as f:
                save_data = json.load(f)
            
            # Restore memory and metrics
            self.memory.update(save_data.get("memory", {}))
            self.evolution_metrics.update(save_data.get("evolution_metrics", {}))
            self.weights.update(save_data.get("weights", {}))
            self.alliances.update(save_data.get("alliances", {}))
            
            print(f"📂 Memory state loaded from: {filepath}")
            return True
        except Exception as e:
            print(f"❌ Error loading memory state: {e}")
            return False
