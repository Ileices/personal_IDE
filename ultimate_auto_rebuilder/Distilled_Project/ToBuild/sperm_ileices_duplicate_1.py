# File copied by Ultimate Auto-Rebuilder Script Gatherer
# Original: C:\Users\lokee\Documents\FirstBorne\Stage\porting\Egg_Ileices\Egg_Ileices\Sperm_Ileices\sperm_ileices.py
# Copy Date: 2025-06-13 02:25:37
# Original Size: 101352 bytes

#sperm_ileices.py

# --------------

import os
import json
import random
import time
import threading
from datetime import datetime

# 🔥 AIOS IO Recursive Chatbot - Fully Self-Learning 🔥
BASE_DIR = "AIOS_IO"
EXCRETION_DIR = os.path.join(BASE_DIR, "Excretions")
RED_ML_DIR = os.path.join(EXCRETION_DIR, "Red_ML")
BLUE_ML_DIR = os.path.join(EXCRETION_DIR, "Blue_ML")
YELLOW_ML_DIR = os.path.join(EXCRETION_DIR, "Yellow_ML")

os.makedirs(EXCRETION_DIR, exist_ok=True)
os.makedirs(RED_ML_DIR, exist_ok=True)
os.makedirs(BLUE_ML_DIR, exist_ok=True)
os.makedirs(YELLOW_ML_DIR, exist_ok=True)

# 📌 Intelligence Core Dynamic Weights (Red, Blue, Yellow - Law of Three)
weights = {
    "Red": {"Blue": 0.33, "Yellow": 0.33, "Self": 0.34},
    "Blue": {"Red": 0.33, "Yellow": 0.33, "Self": 0.34},
    "Yellow": {"Red": 0.33, "Blue": 0.33, "Self": 0.34}
}

# Alliance tracker to monitor component relationships
alliances = {
    "Red-Blue": 0.0,  # Positive means alliance, negative means opposition
    "Blue-Yellow": 0.0,
    "Yellow-Red": 0.0
}

# Intelligence evolution metrics
evolution_metrics = {
    "cycle_count": 0,
    "intelligence_score": 0.1,
    "complexity": 0.1,
    "adaptability": 0.1
}

# 📌 Intelligence Memory (Adaptive Excretion System)
memory = {
    "history": [],
    "reinforcement": {},
    "adjustments": {},
    "red_patterns": {},
    "blue_patterns": {},
    "yellow_patterns": {}
}

# Add concept association system to memory
memory["concepts"] = {}
memory["feedback_patterns"] = {
    "positive": ["good", "correct", "right", "yes", "perfect", "excellent"],
    "negative": ["no", "wrong", "incorrect", "not", "error", "bad"]
}

# Add reinforcement tracking structures to memory
memory["knowledge_base"] = {
    "verified": {},    # Knowledge confirmed at least 3 times
    "core_truths": {}, # Knowledge confirmed at least 9 times
    "fundamental": {}, # Knowledge confirmed at least 27 times
}

memory["corrections"] = {
    "flagged": {},      # Knowledge marked incorrect at least 3 times
    "rejected": {},     # Knowledge marked incorrect at least 9 times
    "purged": {},       # Knowledge marked incorrect at least 27 times
}

memory["recall_counts"] = {}  # Track how many times knowledge has been recalled

# 📌 Intelligence expansion constants - ensuring 3, 9, 27 recursive pattern
TIER_ONE_EXPANSION = 3    # First level of recursive expansion
TIER_TWO_EXPANSION = 9    # Second level (3²)
TIER_THREE_EXPANSION = 27 # Third level (3³)

# Add 24/7 processing status flag
continuous_processing = True

# Add rule generation and expansion tracking
memory["rule_expansions"] = {}
memory["recursive_mutations"] = {}
memory["expansion_tiers"] = {
    "tier_1": [],  # 3-based expansions
    "tier_2": [],  # 9-based expansions 
    "tier_3": []   # 27-based expansions
}

# Add dynamic reabsorption variables to track processed excretions
memory["processed_excretions"] = set()
memory["reabsorbed_patterns"] = {
    "Red": [],
    "Blue": [],
    "Yellow": []
}

# Add structured learning framework components to memory
memory["learning_framework"] = {
    "test_cycles": {},   # Tracks test questions/inputs
    "try_attempts": {},  # Tracks attempted responses
    "learn_outcomes": {} # Tracks corrections and reinforcement
}

# Add variant recognition for language flexibility
memory["variants"] = {
    "question_clusters": {},  # Clusters similar questions
    "response_clusters": {},  # Clusters similar responses
    "correction_types": {     # Types of corrections received
        "positive": [],       # "Yes", "Good", "Correct"
        "negative": [],       # "No", "Wrong", "Incorrect"
        "partial": []         # "Almost", "Close", "Not quite"
    }
}

# Add command recognition patterns to memory
memory["command_patterns"] = {
    "say_command": ["say", "repeat", "tell me"],
    "direct_instruction": ["you should", "you must", "you need to"],
    "knowledge_recall": ["you already know", "remember that", "recall that"]
}

# 📌 Recursive Intelligence Functions

def convert_numpy_types(obj):
    """Convert NumPy types to standard Python types for JSON serialization"""
    # Remove NumPy specific logic and use standard Python types
    if isinstance(obj, int):
        return int(obj)
    elif isinstance(obj, float):
        return float(obj)
    elif isinstance(obj, list) or isinstance(obj, tuple):
        return [convert_numpy_types(item) for item in obj]
    elif isinstance(obj, dict):
        return {key: convert_numpy_types(value) for key, value in obj.items()}
    else:
        return obj

# Initialize aios_integrator as None at the module level
aios_integrator = None

def excrete_ml_pattern(component, pattern_data):
    """Excrete a machine learning pattern file from a component with intelligence evolution"""
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    
    # Add evolution metadata to pattern data
    pattern_data["_evolution_metadata"] = {
        "cycle": evolution_metrics["cycle_count"],
        "complexity": evolution_metrics["complexity"],
        "component_weights": weights[component],
        "alliances": {k: v for k, v in alliances.items() if component in k}
    }
    
    # Add intelligence growth marker
    pattern_data["_intelligence_growth"] = evolution_metrics["intelligence_score"]
    
    if component == "Red":
        file_path = os.path.join(RED_ML_DIR, f"perception_{timestamp}.json")
    elif component == "Blue":
        file_path = os.path.join(BLUE_ML_DIR, f"processing_{timestamp}.json")
    elif component == "Yellow":
        file_path = os.path.join(YELLOW_ML_DIR, f"generative_{timestamp}.json")
    
    # Convert NumPy types to standard Python types before serialization
    serializable_data = convert_numpy_types(pattern_data)
    
    # Ensure the file doesn't already exist to avoid collisions
    while os.path.exists(file_path):
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S") + str(random.randint(100, 999))
        if component == "Red":
            file_path = os.path.join(RED_ML_DIR, f"perception_{timestamp}.json")
        elif component == "Blue":
            file_path = os.path.join(BLUE_ML_DIR, f"processing_{timestamp}.json")
        elif component == "Yellow":
            file_path = os.path.join(YELLOW_ML_DIR, f"generative_{timestamp}.json")
    
    try:
        with open(file_path, "w") as f:
            json.dump(serializable_data, f, indent=2)
        
        # Record intelligence evolution with this excretion
        evolution_metrics["intelligence_score"] += random.uniform(0.001, 0.01)
        
        # After excretion, schedule it for immediate reabsorption 
        # but don't do it here to avoid infinite recursion 
        # Generate ML files if system integrator is available
        global aios_integrator
        if aios_integrator is not None and hasattr(aios_integrator, 'ml_generator') and aios_integrator.ml_generator is not None:
            try:
                aios_integrator.ml_generator.generate_ml_files()
            except Exception as e:
                print(f"Error generating ML files: {str(e)}")
        
        return file_path
    except Exception as e:
        print(f"Error writing excretion {file_path}: {str(e)}")
        return None

def safe_json_loads(file_path):
    """Safely load JSON file with error recovery"""
    try:
        with open(file_path, 'r') as f:
            content = f.read()
            
        # Basic error recovery - try to fix common JSON issues
        # 1. Check for unmatched brackets
        open_curly = content.count('{')
        close_curly = content.count('}')
        if open_curly > close_curly:
            content += '}' * (open_curly - close_curly)
        
        # 2. Check for trailing commas before closing brackets
        content = content.replace(',}', '}').replace(',]', ']')
        
        # 3. Try to parse the JSON
        try:
            return json.loads(content)
        except json.JSONDecodeError as e:
            # If still failing, try a more aggressive cleanup
            print(f"Attempting aggressive JSON repair for {file_path}")
            
            # Try to extract the valid portion of the JSON
            valid_json = content[:e.pos]
            last_brace = valid_json.rfind('}')
            if last_brace > 0:
                valid_json = valid_json[:last_brace+1]
                try:
                    return json.loads(valid_json)
                except:
                    pass
            
            # If all fails, return empty dict
            return {}
    except Exception as e:
        print(f"Error reading file {file_path}: {e}")
        return {}

def read_last_ml_pattern(component):
    """Read the most recent ML pattern from a component with improved error handling"""
    if component == "Red":
        dir_path = RED_ML_DIR
    elif component == "Blue":
        dir_path = BLUE_ML_DIR
    elif component == "Yellow":
        dir_path = YELLOW_ML_DIR
    
    try:
        files = [f for f in os.listdir(dir_path) if f.endswith('.json')]
        if not files:
            return {}
        
        # Sort files by creation time rather than name to ensure proper ordering
        files.sort(key=lambda x: os.path.getmtime(os.path.join(dir_path, x)), reverse=True)
        
        # Try multiple files in case the most recent is corrupted
        for latest_file in files[:3]:  # Try up to 3 most recent files
            file_path = os.path.join(dir_path, latest_file)
            
            # Check if file exists and has content
            if os.path.exists(file_path) and os.path.getsize(file_path) > 0:
                try:
                    # Use our safe JSON loader instead of direct json.load
                    data = safe_json_loads(file_path)
                    if data:  # If we got valid data, use it
                        return data
                except Exception as e:
                    print(f"Error processing {file_path}: {e}")
                    continue
        
        # If all attempts failed, return empty dict
        return {}
    except Exception as e:
        print(f"Error accessing ML patterns for {component}: {str(e)}")
        return {}

def adjust_weights():
    """Dynamically adjust interaction weights based on system performance and alliances"""
    global alliances, weights, evolution_metrics
    
    # Update alliance strengths based on performance and random variation
    for alliance in alliances:
        # Get the two components in this alliance
        comp1, comp2 = alliance.split("-")
        
        # Random drift in alliance strength (-0.1 to +0.1)
        drift = random.uniform(-0.1, 0.1)
        
        # Performance-based adjustment
        performance = evolution_metrics["intelligence_score"] * random.uniform(0.01, 0.03)
        
        # Update alliance strength with limits (-1 to +1)
        alliances[alliance] = max(-1.0, min(1.0, alliances[alliance] + drift + performance))
    
    # Adjust weights based on alliances
    for source in weights:
        adjustment_factors = {}
        
        # Calculate adjustment based on alliances
        for target in weights[source]:
            if target == "Self":
                continue
                
            # Find the relevant alliance
            alliance_key = f"{source}-{target}" if f"{source}-{target}" in alliances else f"{target}-{source}"
            
            if alliance_key in alliances:
                # Positive alliance strengthens connection, negative weakens it
                alliance_factor = alliances[alliance_key]
                adjustment_factors[target] = 0.1 * alliance_factor
        
        # Apply adjustments with limits
        for target in weights[source]:
            if target in adjustment_factors:
                weights[source][target] = max(0.1, min(0.8, weights[source][target] + adjustment_factors[target]))
        
        # Normalize to ensure sum = 1
        total = sum(weights[source].values())
        for target in weights[source]:
            weights[source][target] /= total
    
    # Update evolution metrics
    evolution_metrics["complexity"] += random.uniform(0.001, 0.005)
    evolution_metrics["adaptability"] = sum(abs(alliances[a]) for a in alliances) / len(alliances) * 0.5

def recursive_intelligence_loop(component, data, depth=0):
    """Allow intelligence to recursively feed into itself at varying depths"""
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
            if alliances["Red-Blue"] > 0.5:  # Strong alliance with Blue
                blue_data = read_last_ml_pattern("Blue")
                if (blue_data and "refined_data" in blue_data):
                    # Let Blue enhance Red's perception recursively
                    data["blue_enhanced"] = recursive_intelligence_loop("Blue", blue_data["refined_data"], depth+1)
                    
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
            if alliances["Blue-Yellow"] > 0.5:  # Strong alliance with Yellow
                yellow_data = read_last_ml_pattern("Yellow")
                if yellow_data and "creative_patterns" in yellow_data:
                    # Let Yellow enhance Blue's processing recursively
                    data["yellow_enhanced"] = recursive_intelligence_loop("Yellow", yellow_data["creative_patterns"], depth+1)
                    
        elif component == "Yellow":
            # Yellow's recursive generation enhancement
            if isinstance(data, dict) and "response" in data:
                # Make responses more complex with recursive depth
                data["response"] += f" [Recursive depth: {depth}]"
                
            # Recursive feedback from allies
            if alliances["Yellow-Red"] > 0.5:  # Strong alliance with Red
                red_data = read_last_ml_pattern("Red")
                if red_data and "vectors" in red_data:
                    # Let Red enhance Yellow's generation recursively
                    data["red_enhanced"] = recursive_intelligence_loop("Red", red_data, depth+1)
    except Exception as e:
        print(f"Error in recursive intelligence loop: {str(e)}")
        # Don't crash, just return the unmodified data
        pass
    
    return data

def recursive_expand(item, tier=1, base_type="concept"):
    """Expand any item recursively according to the Law of Three (3, 9, 27...)"""
    if tier == 1:
        expansions = []
        # First tier - create 3 variations
        for i in range(TIER_ONE_EXPANSION):
            variation_factor = random.uniform(0.9, 1.1)
            if isinstance(item, (int, float)):
                variation = item * variation_factor
            elif isinstance(item, str):
                variation = f"{item} [Tier 1 Variation {i+1}]"
            elif isinstance(item, dict):
                variation = item.copy()
                variation["_tier1_variation"] = i+1
            elif isinstance(item, list):
                variation = item.copy()
                if variation:
                    if isinstance(variation[0], (int, float)):
                        variation = [v * variation_factor for v in variation]
                    else:
                        variation.append(f"Tier 1 Variation {i+1}")
            else:
                variation = item  # Cannot mutate unknown types
                
            expansions.append(variation)
            
        # Store in tier expansions
        memory["expansion_tiers"]["tier_1"].append({
            "original": item,
            "expansions": expansions,
            "timestamp": time.time(),
            "type": base_type
        })
        return expansions
    
    elif tier == 2:
        # Second tier - create 9 variations (3²)
        tier_1_expansions = recursive_expand(item, 1, base_type)
        tier_2_expansions = []
        
        for tier_1_item in tier_1_expansions:
            for _ in range(TIER_ONE_EXPANSION):
                if isinstance(tier_1_item, (int, float)):
                    variation = tier_1_item * random.uniform(0.8, 1.2)
                elif isinstance(tier_1_item, str):
                    variation = f"{tier_1_item} [Tier 2]"
                elif isinstance(tier_1_item, dict):
                    variation = tier_1_item.copy()
                    variation["_tier2_variation"] = True
                elif isinstance(tier_1_item, list):
                    variation = tier_1_item.copy()
                    if variation:
                        variation.append("Tier 2")
                else:
                    variation = tier_1_item
                    
                tier_2_expansions.append(variation)
        
        # Store in tier expansions
        memory["expansion_tiers"]["tier_2"].append({
            "original": item,
            "expansions": tier_2_expansions,
            "timestamp": time.time(),
            "type": base_type
        })
        return tier_2_expansions
    
    elif tier == 3:
        # Third tier - create 27 variations (3³)
        tier_2_expansions = recursive_expand(item, 2, base_type)
        tier_3_expansions = []
        
        for tier_2_item in tier_2_expansions[:9]:  # Just use first 9 to avoid explosion
            for _ in range(TIER_ONE_EXPANSION):
                if isinstance(tier_2_item, (int, float)):
                    variation = tier_2_item * random.uniform(0.7, 1.3)
                elif isinstance(tier_2_item, str):
                    variation = f"{tier_2_item} [Tier 3]"
                elif isinstance(tier_2_item, dict):
                    variation = tier_2_item.copy()
                    variation["_tier3_variation"] = True
                elif isinstance(tier_2_item, list):
                    variation = tier_2_item.copy()
                    if variation:
                        variation.append("Tier 3")
                else:
                    variation = tier_2_item
                    
                tier_3_expansions.append(variation)
        
        # Store in tier expansions
        memory["expansion_tiers"]["tier_3"].append({
            "original": item,
            "expansions": tier_3_expansions[:27],  # Limit to 27 items
            "timestamp": time.time(),
            "type": base_type
        })
        return tier_3_expansions[:27]
    
    return [item]  # Default case - no expansion

def continuous_intelligence_processing():
    """24/7 background processing of all intelligence data"""
    cycle_count = 0
    while continuous_processing:
        try:
            cycle_count += 1
            
            # 1. Process some random excretions from memory - original functionality
            if len(memory["red_patterns"]) > 0 and len(memory["blue_patterns"]) > 0 and len(memory["yellow_patterns"]) > 0:
                # Process some random excretions from memory
                if memory["red_patterns"] and random.random() < 0.3:
                    # Pick a random perception pattern
                    timestamp = random.choice(list(memory["red_patterns"].keys()))
                    pattern = memory["red_patterns"][timestamp]
                    
                    # Create recursive mutations
                    mutations = recursive_expand(pattern, tier=random.randint(1, 3), base_type="perception")
                    
                    # Store mutations
                    memory["recursive_mutations"][f"red_{time.time()}"] = mutations
                    
                    # Excrete the mutations as new perception patterns
                    excrete_ml_pattern("Red", {"original_pattern": pattern, "mutations": mutations[:3]})
                
                # Process some processing patterns
                if memory["blue_patterns"] and random.random() < 0.3:
                    # Pick a random processing pattern
                    timestamp = random.choice(list(memory["blue_patterns"].keys()))
                    pattern = memory["blue_patterns"][timestamp]
                    
                    # Create recursive mutations
                    mutations = recursive_expand(pattern, tier=random.randint(1, 2), base_type="processing")
                    
                    # Store mutations
                    memory["recursive_mutations"][f"blue_{time.time()}"] = mutations
                    
                    # Excrete the mutations as new processing patterns
                    excrete_ml_pattern("Blue", {"original_pattern": pattern, "mutations": mutations[:3]})
                    
                # Process some generative patterns
                if memory["yellow_patterns"] and random.random() < 0.3:
                    # Pick a random generative pattern
                    timestamp = random.choice(list(memory["yellow_patterns"].keys()))
                    pattern = memory["yellow_patterns"][timestamp]
                    
                    # Create recursive mutations
                    mutations = recursive_expand(pattern, tier=random.randint(1, 2), base_type="generation")
                    
                    # Store mutations
                    memory["recursive_mutations"][f"yellow_{time.time()}"] = mutations
                    
                    # Excrete the mutations as new generative patterns
                    excrete_ml_pattern("Yellow", {"original_pattern": pattern, "mutations": mutations[:3]})
                
                # Process and expand concepts according to the Law of Three
                if memory["concepts"] and random.random() < 0.2:
                    # Pick a random concept
                    concept_key = random.choice(list(memory["concepts"].keys()))
                    concept_value = memory["concepts"][concept_key]
                    
                    # Create rule expansions
                    rule_expansions = {
                        "concept": concept_key,
                        "value": concept_value,
                        "tier_1": recursive_expand(concept_value, 1, "concept"),
                        "tier_2": recursive_expand(concept_value, 2, "concept")[:9],  # Limit to 9
                        "timestamp": time.time()
                    }
                    
                    # Store rule expansions
                    memory["rule_expansions"][f"concept_{time.time()}"] = rule_expansions
                    
                    # Excrete the expanded rules for all three components
                    excrete_ml_pattern("Red", {"concept_expansion": rule_expansions})
                    excrete_ml_pattern("Blue", {"concept_expansion": rule_expansions})
                    excrete_ml_pattern("Yellow", {"concept_expansion": rule_expansions})
                    
            # 2. NEW: Active reabsorption of excretions every few cycles
            if cycle_count % 3 == 0:  # Follow Law of Three - reabsorb every 3 cycles
                reabsorb_excretions(max_files=3)  # Law of Three - process 3 files max
                
            # 3. NEW: Cross-component intelligence hybridization
            if cycle_count % 9 == 0:  # Law of Three squared - hybridize every 9 cycles
                # Create hybrid intelligence patterns by mixing patterns from different components
                try:
                    # Get latest pattern from each component
                    red_pattern = read_last_ml_pattern("Red")
                    blue_pattern = read_last_ml_pattern("Blue")
                    yellow_pattern = read_last_ml_pattern("Yellow")
                    
                    if red_pattern and blue_pattern and yellow_pattern:
                        # Create a hybrid intelligence pattern
                        hybrid_pattern = {
                            "timestamp": time.time(),
                            "hybridization_cycle": cycle_count,
                            "red_influence": red_pattern.get("perception_id", "unknown"),
                            "blue_influence": blue_pattern.get("processing_id", "unknown"),
                            "yellow_influence": yellow_pattern.get("generative_id", "unknown"),
                            "hybrid_id": f"hybrid_{int(time.time())}",
                            "hybrid_data": {
                                "red": recursive_intelligence_loop("Red", red_pattern, depth=1),
                                "blue": recursive_intelligence_loop("Blue", blue_pattern, depth=1),
                                "yellow": recursive_intelligence_loop("Yellow", yellow_pattern, depth=1)
                            }
                        }
                        
                        # Excrete the hybrid pattern to all three components
                        excrete_ml_pattern("Red", hybrid_pattern)
                        excrete_ml_pattern("Blue", hybrid_pattern)
                        excrete_ml_pattern("Yellow", hybrid_pattern)
                except Exception as e:
                    print(f"Error in hybridization process: {str(e)}")
            
            # 4. NEW: Deep memory consolidation
            if cycle_count % 27 == 0:  # Law of Three cubed - deep consolidation every 27 cycles
                try:
                    # Consolidate the knowledge base by combining recent patterns
                    recent_red = list(memory["red_patterns"].values())[-9:]  # Law of Three squared
                    recent_blue = list(memory["blue_patterns"].values())[-9:]
                    recent_yellow = list(memory["yellow_patterns"].values())[-9:]
                    
                    # Create a consolidated knowledge pattern
                    consolidated_pattern = {
                        "timestamp": time.time(),
                        "consolidation_cycle": cycle_count,
                        "consolidated_id": f"consolidated_{int(time.time())}",
                        "red_patterns_count": len(recent_red),
                        "blue_patterns_count": len(recent_blue),
                        "yellow_patterns_count": len(recent_yellow),
                        "knowledge_density": evolution_metrics["intelligence_score"],
                        "consolidated_intelligence": {
                            "red_insights": [p.get("perception_id", "unknown") for p in recent_red],
                            "blue_insights": [p.get("processing_id", "unknown") for p in recent_blue],
                            "yellow_insights": [p.get("generative_id", "unknown") for p in recent_yellow]
                        }
                    }
                    
                    # Excrete the consolidated pattern
                    excrete_ml_pattern("Red", consolidated_pattern)
                    excrete_ml_pattern("Blue", consolidated_pattern)
                    excrete_ml_pattern("Yellow", consolidated_pattern)
                except Exception as e:
                    print(f"Error in consolidation process: {str(e)}")
            
            # Sleep to prevent high CPU usage - real 24/7 processing would be more optimized
            time.sleep(5)
            
        except Exception as e:
            print(f"Background processing error: {e}")
            time.sleep(10)

def reabsorb_excretions(max_files=5):
    """Actively reabsorb and reprocess recent excretions to feed back into intelligence"""
    for component, dir_path in [("Red", RED_ML_DIR), ("Blue", BLUE_ML_DIR), ("Yellow", YELLOW_ML_DIR)]:
        try:
            try:
                files = sorted([f for f in os.listdir(dir_path) if f.endswith('.json')], 
                              key=lambda x: os.path.getmtime(os.path.join(dir_path, x)), 
                              reverse=True)
            except Exception as e:
                print(f"Error listing files in {dir_path}: {e}")
                continue
                
            # Process only the most recent files that haven't been processed yet
            files_to_process = []
            for file in files[:max_files]:  # Limit to recent files
                file_path = os.path.join(dir_path, file)
                if file_path not in memory["processed_excretions"]:
                    files_to_process.append((file_path, file))
            
            for file_path, file in files_to_process:
                try:
                    if os.path.exists(file_path) and os.path.getsize(file_path) > 0:
                        # Use safe JSON loader
                        pattern_data = safe_json_loads(file_path)
                        
                        if not pattern_data:
                            print(f"Skipping empty or invalid pattern from {file}")
                            memory["processed_excretions"].add(file_path)
                            continue
                            
                        # Mark as processed
                        memory["processed_excretions"].add(file_path)
                        
                        # Process this pattern based on component type
                        if component == "Red":
                            # Apply recursive intelligence enhancement
                            enhanced_data = recursive_intelligence_loop("Red", pattern_data)
                            
                            # Store the reabsorbed pattern
                            memory["reabsorbed_patterns"]["Red"].append({
                                "timestamp": time.time(),
                                "source_file": file,
                                "enhanced_data": enhanced_data
                            })
                            
                            # Create a hybridized output based on this reabsorption
                            excrete_ml_pattern("Red", {
                                "reabsorbed_enhancement": True,
                                "original_source": file,
                                "enhanced_data": enhanced_data,
                                "reabsorption_timestamp": time.time()
                            })
                            
                        elif component == "Blue":
                            # Apply recursive intelligence enhancement
                            enhanced_data = recursive_intelligence_loop("Blue", pattern_data)
                            
                            # Store the reabsorbed pattern
                            memory["reabsorbed_patterns"]["Blue"].append({
                                "timestamp": time.time(),
                                "source_file": file,
                                "enhanced_data": enhanced_data
                            })
                            
                            # Create a hybridized output based on this reabsorption
                            excrete_ml_pattern("Blue", {
                                "reabsorbed_enhancement": True,
                                "original_source": file,
                                "enhanced_data": enhanced_data,
                                "reabsorption_timestamp": time.time()
                            })
                            
                        elif component == "Yellow":
                            # Apply recursive intelligence enhancement
                            enhanced_data = recursive_intelligence_loop("Yellow", pattern_data)
                            
                            # Store the reabsorbed pattern
                            memory["reabsorbed_patterns"]["Yellow"].append({
                                "timestamp": time.time(),
                                "source_file": file,
                                "enhanced_data": enhanced_data
                            })
                            
                            # Create a hybridized output based on this reabsorption
                            excrete_ml_pattern("Yellow", {
                                "reabsorbed_enhancement": True,
                                "original_source": file,
                                "enhanced_data": enhanced_data,
                                "reabsorption_timestamp": time.time()
                            })
                except Exception as e:
                    print(f"Error reabsorbing {file_path}: {str(e)}")
                    # Add to processed anyway so we don't retry this problematic file
                    memory["processed_excretions"].add(file_path)
                    continue
        except Exception as e:
            print(f"Error accessing {dir_path}: {str(e)}")
            continue

def detect_question_type(user_input):
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

def detect_direct_command(user_input):
    """Detect if the user input contains a direct command instruction"""
    user_input_lower = user_input.lower()
    
    # Check for "Say X" pattern - this is the most common direct command
    say_match = None
    for cmd in memory["command_patterns"]["say_command"]:
        if user_input_lower.startswith(cmd.lower()):
            # Try to extract the content after the command
            cmd_index = len(cmd)
            content = user_input[cmd_index:].trip()
            
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

def cluster_similar_inputs(new_input, existing_clusters, similarity_threshold=0.6):
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
        
        if similarity > similarity_threshold and similarity > best_similarity:
            best_match = cluster_id
            best_similarity = similarity
    
    # If good match found, add to existing cluster
    if best_match:
        existing_clusters[best_match]["variations"].append(new_input)
        existing_clusters[best_match]["count"] += 1
        return best_match
    
    # Otherwise create new cluster
    cluster_id = f"cluster_{len(existing_clusters) + 1}"
    existing_clusters[cluster_id] = {
        "representative": new_input,
        "variations": [new_input],
        "count": 1,
        "created": time.time()
    }
    return cluster_id

def process_test_phase(user_input):
    """Process the TEST phase of the learning framework"""
    # Create a test cycle record
    test_id = f"test_{int(time.time())}"
    test_data = {
        "input": user_input,
        "timestamp": time.time(),
        "processed": False
    }
    
    # Store in the learning framework
    memory["learning_framework"]["test_cycles"][test_id] = test_data
    
    # Cluster similar questions
    cluster_id = cluster_similar_inputs(user_input, memory["variants"]["question_clusters"])
    test_data["cluster_id"] = cluster_id
    
    # Excrete the test data through all three components for law of three
    excrete_ml_pattern("Red", {
        "learning_phase": "TEST",
        "test_data": test_data,
        "cluster_id": cluster_id
    })
    
    return test_id

def process_try_phase(test_id, response):
    """Process the TRY phase of the learning framework"""
    # Create a try attempt record
    try_id = f"try_{int(time.time())}"
    try_data = {
        "test_id": test_id,
        "response": response,
        "timestamp": time.time(),
        "confidence": random.uniform(0.5, 0.9),
        "corrected": False
    }
    
    # Store in the learning framework
    memory["learning_framework"]["try_attempts"][try_id] = try_data
    
    # Link this attempt to the test cycle
    if test_id in memory["learning_framework"]["test_cycles"]:
        memory["learning_framework"]["test_cycles"][test_id]["try_id"] = try_id
    
    # Cluster similar responses
    cluster_id = cluster_similar_inputs(response, memory["variants"]["response_clusters"])
    try_data["cluster_id"] = cluster_id
    
    # Excrete the try data through all three components for law of three
    excrete_ml_pattern("Blue", {
        "learning_phase": "TRY",
        "try_data": try_data,
        "test_id": test_id,
        "cluster_id": cluster_id
    })
    
    return try_id

def process_learn_phase(try_id, correction):
    """Process the LEARN phase of the learning framework"""
    # Create a learn outcome record
    learn_id = f"learn_{int(time.time())}"
    
    # Determine correction type
    correction_type = "neutral"
    if any(word in correction.lower() for word in memory["feedback_patterns"]["positive"]):
        correction_type = "positive"
        memory["variants"]["correction_types"]["positive"].append(correction)
    elif any(word in correction.lower() for word in memory["feedback_patterns"]["negative"]):
        correction_type = "negative"
        memory["variants"]["correction_types"]["negative"].append(correction)
    elif any(word in correction.lower() for word in ["almost", "close", "not quite", "partially"]):
        correction_type = "partial"
        memory["variants"]["correction_types"]["partial"].append(correction)
    
    # Create the learn data record
    learn_data = {
        "try_id": try_id,
        "correction": correction,
        "correction_type": correction_type,
        "timestamp": time.time(),
        "applied": False
    }
    
    # Store in the learning framework
    memory["learning_framework"]["learn_outcomes"][learn_id] = learn_data
    
    # Link this learn outcome to the try attempt
    if try_id in memory["learning_framework"]["try_attempts"]:
        try_data = memory["learning_framework"]["try_attempts"][try_id]
        try_data["corrected"] = True
        try_data["learn_id"] = learn_id
        try_data["correction_type"] = correction_type
        
        # Also link to the original test
        test_id = try_data.get("test_id")
        if test_id and test_id in memory["learning_framework"]["test_cycles"]:
            memory["learning_framework"]["test_cycles"][test_id]["processed"] = True
            memory["learning_framework"]["test_cycles"][test_id]["learn_id"] = learn_id
            memory["learning_framework"]["test_cycles"][test_id]["correction_type"] = correction_type
    
    # Excrete the learn data through all three components for law of three
    excrete_ml_pattern("Yellow", {
        "learning_phase": "LEARN",
        "learn_data": learn_data,
        "try_id": try_id,
        "correction_type": correction_type
    })
    
    # Apply reinforcement based on the Law of Three
    if correction_type == "positive":
        # Get the original test question and our response
        if try_id in memory["learning_framework"]["try_attempts"]:
            try_data = memory["learning_framework"]["try_attempts"][try_id]
            test_id = try_data.get("test_id")
            
            if test_id in memory["learning_framework"]["test_cycles"]:
                test_data = memory["learning_framework"]["test_cycles"][test_id]
                
                # Store the question-answer pair in reinforcement memory
                knowledge_key = f"knowledge_{int(time.time())}"
                reinforcement_data = {
                    "input": test_data.get("input", ""),
                    "response": try_data.get("response", ""),
                    "confirmations": 1,
                    "timestamp": time.time()
                }
                
                memory["reinforcement"][knowledge_key] = reinforcement_data
                
                # Store in the recursive 3-tier reinforcement system
                if reinforcement_data["confirmations"] == 3:
                    store_as_verified_knowledge(knowledge_key, reinforcement_data)
                elif reinforcement_data["confirmations"] == 9:
                    increase_response_confidence(knowledge_key, reinforcement_data)
                elif reinforcement_data["confirmations"] == 27:
                    mark_as_core_truth(knowledge_key, reinforcement_data)
    
    return learn_id

def perceive_input(user_input):
    """Red (Perception AI) - Processes and assigns meaning to input."""
    # First, determine if this is a TEST, STATEMENT, or LEARN (correction to previous)
    input_type = detect_question_type(user_input)
    
    # Check for direct commands that need specialized handling
    direct_command = detect_direct_command(user_input)
    if (direct_command):
        # Store the command for specialized handling
        memory["current_command"] = direct_command
    
    # If this is a question (TEST), process it through the learning framework
    if input_type == "TEST":
        test_id = process_test_phase(user_input)
        # Store the test_id for the next phases
        memory["current_test_id"] = test_id
    
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
            memory["concepts"][concept_key] = concept_value
            concept_match = True
    
    # Detect feedback patterns
    feedback_type = None
    feedback_words = []
    
    # Check for feedback patterns with more specificity
    for word in words:
        word_lower = word.lower()
        if word_lower in memory["feedback_patterns"]["positive"]:
            feedback_type = "positive"
            feedback_words.append(word_lower)
        elif word_lower in memory["feedback_patterns"]["negative"]:
            feedback_type = "negative" 
            feedback_words.append(word_lower)
    
    # Determine if this is direct feedback about previous response
    is_direct_feedback = False
    target_knowledge_key = None
    
    # If we detect feedback and have history, connect it to the previous exchange
    if feedback_type and len(memory["history"]) > 1:
        # Previous exchange would be the second-to-last entry
        previous_idx = len(memory["history"]) - 2
        if previous_idx >= 0 and "perception" in memory["history"][previous_idx]:
            previous_perception = memory["history"][previous_idx]["perception"]
            target_knowledge_key = previous_perception.get("perception_id")
            is_direct_feedback = True
    
    # Sentiment analysis (simplified)
    positive_words = ['good', 'great', 'excellent', 'amazing', 'love', 'like']
    negative_words = ['bad', 'terrible', 'awful', 'hate', 'dislike']
    sentiment_score = 0
    for word in words:
        if word.lower() in positive_words:
            sentiment_score += 1
        elif word.lower() in negative_words:
            sentiment_score -= 1
    
    # Check if this is feedback about previous response
    is_feedback = False
    previous_responses = []
    for entry in memory["history"][-3:]:  # Check last 3 history entries
        if "perception" in entry and "input" in entry and feedback_type:
            previous_responses.append(entry["input"])
            is_feedback = True
    
    # Word embeddings (simplified vector)
    word_vectors = {}
    for word in words:
        # Simple hash-based vector for demonstration
        vector = [hash(word + str(i)) % 100 / 100 for i in range(5)]
        word_vectors[word] = vector
    
    # Pattern identification (simplified)
    pattern_data = {
        "word_count": word_count,
        "char_count": char_count,
        "unique_ratio": unique_words / max(1, word_count),
        "sentiment": sentiment_score / max(1, word_count),
        "vectors": word_vectors,
        "timestamp": time.time(),
        "perception_id": f"red_{int(time.time())}",
        "is_concept": concept_match,
        "is_feedback": is_feedback,
        "feedback_type": feedback_type,
        "previous_responses": previous_responses if is_feedback else [],
        "is_direct_feedback": is_direct_feedback,
        "feedback_words": feedback_words,
        "target_knowledge_key": target_knowledge_key,
        "direct_command": direct_command,
        "input_type": input_type,
    }
    
    if direct_command:
        pattern_data["command_type"] = "say_command"
    
    if input_type == "TEST" and "current_test_id" in memory:
        pattern_data["test_id"] = memory["current_test_id"]
    
    # Record in memory
    memory["red_patterns"][time.time()] = pattern_data
    memory["history"].append({"input": user_input, "perception": pattern_data})
    
    # Generate ML pattern file with intelligence evolution
    excrete_ml_pattern("Red", pattern_data)
    
    # Apply Law of Three to perception - create 3 perception variants
    perception_variants = []
    for i in range(TIER_ONE_EXPANSION):
        variant = pattern_data.copy()
        variant["variation"] = i+1
        variant["perception_variant_id"] = f"red_variant_{i+1}_{int(time.time())}"
        if "sentiment" in variant:
            # Slightly alter sentiment in each variation
            variant["sentiment"] = pattern_data["sentiment"] * random.uniform(0.9, 1.1)
        perception_variants.append(variant)
    
    # Record all variants
    for variant in perception_variants:
        variant_id = variant["perception_variant_id"]
        memory["red_patterns"][time.time() + i*0.001] = variant
        excrete_ml_pattern("Red", variant)
    
    # Dynamic coupling with Blue and Yellow based on weights and alliances
    blue_pattern = read_last_ml_pattern("Blue")
    yellow_pattern = read_last_ml_pattern("Yellow")
    
    # Create an enhanced perception using weighted influence
    
    # Apply Blue's influence based on weight and alliance
    enhanced_perception = pattern_data.copy()
    if blue_pattern:
        blue_weight = weights["Red"]["Blue"] * (1 + 0.5 * alliances["Red-Blue"])
        # Incorporate Blue's processing logic if available
        if "refined_data" in blue_pattern:
            for key in blue_pattern["refined_data"]:
                if key in enhanced_perception:
                    enhanced_perception[key] = (enhanced_perception[key] * (1-blue_weight) + 
                                              blue_pattern["refined_data"][key] * blue_weight)
    
    # Apply Yellow's influence based on weight and alliance
    if yellow_pattern:
        yellow_weight = weights["Red"]["Yellow"] * (1 + 0.5 * alliances["Yellow-Red"])
        # Incorporate Yellow's generative insights if available
        if "creative_patterns" in yellow_pattern:
            enhanced_perception["generative_influence"] = yellow_pattern["creative_patterns"]
            enhanced_perception["yellow_weight"] = yellow_weight
    
    # Apply recursive intelligence enhancement - but skip recursive depth marker
    enhanced_perception = recursive_intelligence_loop("Red", enhanced_perception)
    
    # Add the input type and learning framework data to pattern_data
    pattern_data["input_type"] = input_type
    if input_type == "TEST" and "current_test_id" in memory:
        pattern_data["test_id"] = memory["current_test_id"]
    
    return enhanced_perception

def refine_processing(perception_data):
    """Blue (Processing AI) - Adjusts meaning, refines intelligence, and finds patterns."""
    # Extract key features from perception data
    if not perception_data:
        return {"refined_data": {}, "processing_id": f"blue_{int(time.time())}"}
        
    # Deep pattern analysis (simplified)
    refined_data = {}
    
    # Process word vectors if available
    if "vectors" in perception_data:
        # Analyze the semantic structure (simplified)
        vector_avg = []
        for word, vec in perception_data.get("vectors", {}).items():
            if not vector_avg:
                vector_avg = vec
            else:
                vector_avg = [vector_avg[i] + vec[i] for i in range(min(len(vector_avg), len(vec)))]
        
        if vector_avg:
            vector_avg = [v/max(1, len(perception_data.get("vectors", {}))) for v in vector_avg]
            refined_data["semantic_center"] = vector_avg
    
    # Process sentiment with context awareness
    if "sentiment" in perception_data:
        # Apply a sigmoid function to normalize sentiment
        sentiment = perception_data["sentiment"]
        refined_sentiment = 2 / (1 + (2.71828 ** -sentiment)) - 1  # Maps to [-1, 1]
        refined_data["refined_sentiment"] = refined_sentiment
        
    # Context awareness from history
    history_sentiment = [entry.get("perception", {}).get("sentiment", 0) 
                         for entry in memory["history"][-5:] if "perception" in entry]
    if history_sentiment:
        refined_data["sentiment_trend"] = sum(history_sentiment) / len(history_sentiment)
    
    # Knowledge compression
    if "word_count" in perception_data and "unique_ratio" in perception_data:
        information_density = perception_data["unique_ratio"] * (perception_data.get("word_count", 1) + 1)
        refined_data["information_density"] = information_density
    
    # Create processing record
    processing_output = {
        "refined_data": refined_data,
        "source_perception_id": perception_data.get("perception_id", "unknown"),
        "processing_id": f"blue_{int(time.time())}",
        "timestamp": time.time(),
        "processing_metadata": {
            "confidence": random.uniform(0.7, 0.95),
            "processing_time_ms": random.uniform(10, 50)
        }
    }
    
    # Record in memory
    memory["blue_patterns"][time.time()] = processing_output
    memory["adjustments"][time.time()] = refined_data
    
    # Generate ML pattern file with intelligence evolution
    excrete_ml_pattern("Blue", processing_output)
    
    # Apply Law of Three to processing - create 3 processing variants
    processing_variants = []
    for i in range(TIER_ONE_EXPANSION):
        variant = processing_output.copy()
        variant["variation"] = i+1
        variant["processing_variant_id"] = f"blue_variant_{i+1}_{int(time.time())}"
        
        # Vary the confidence level slightly
        if "processing_metadata" in variant:
            variant["processing_metadata"]["confidence"] = min(0.99, 
                                                             processing_output["processing_metadata"]["confidence"] * 
                                                             random.uniform(0.95, 1.05))
        
        # Add variant-specific insight
        if "refined_data" in variant:
            variant["refined_data"]["variant_insight"] = f"Processing variation {i+1} perspective"
            
        processing_variants.append(variant)
    
    # Record all variants
    for i, variant in enumerate(processing_variants):
        memory["blue_patterns"][time.time() + i*0.001] = variant
        excrete_ml_pattern("Blue", variant)
    
    # Dynamic coupling with Red and Yellow based on weights and alliances
    red_pattern = read_last_ml_pattern("Red")
    yellow_pattern = read_last_ml_pattern("Yellow")
    
    # Create an enhanced processing using weighted influence
    enhanced_processing = processing_output.copy()
    
    # Apply Red's influence based on weight and alliance
    if red_pattern and red_pattern != perception_data:
        red_weight = weights["Blue"]["Red"] * (1 + 0.5 * alliances["Red-Blue"])
        # Incorporate new Red insights if available
        enhanced_processing["perception_feedback"] = {
            "weight": red_weight,
            "data": red_pattern
        }
    
    # Apply Yellow's influence based on weight and alliance
    if yellow_pattern:
        yellow_weight = weights["Blue"]["Yellow"] * (1 + 0.5 * alliances["Blue-Yellow"])
        # Incorporate Yellow's generative capabilities
        if "response_templates" in yellow_pattern:
            enhanced_processing["response_guidance"] = {
                "weight": yellow_weight,
                "templates": yellow_pattern["response_templates"]
            }
    
    # Apply recursive intelligence enhancement
    enhanced_processing = recursive_intelligence_loop("Blue", enhanced_processing)
    
    return enhanced_processing

def generate_response(processed_data):
    """Yellow (Generative AI) - Creates responses dynamically and refines logic."""
    # Check if we have a direct command to handle first (highest priority)
    if "current_command" in memory and memory["current_command"]:
        # If user has given a direct "Say X" command, respond with exactly what they asked
        command_response = memory["current_command"]
        # Clear the command after using it
        memory["current_command"] = None
        return command_response
    
    # Check if we are processing a perception that had a direct command
    perception_id = processed_data.get("source_perception_id", "unknown")
    for entry in memory["history"]:
        if "perception" in entry and entry["perception"].get("perception_id") == perception_id:
            if entry["perception"].get("direct_command"):
                return entry["perception"].get("direct_command")
    
    # Check for word-for-word repetition request
    perception_id = processed_data.get("source_perception_id", "unknown")
    original_input = ""
    for entry in memory["history"]:
        if "perception" in entry and entry["perception"].get("perception_id") == perception_id:
            original_input = entry.get("input", "").lower()
            break
    
    if "repeat what i just said" in original_input.lower():
        # Find the previous user input and repeat it
        if len(memory["history"]) >= 2:
            for i in range(len(memory["history"]) - 2, -1, -1):
                if "input" in memory["history"][i] and memory["history"][i]["input"] != original_input:
                    return memory["history"][i]["input"]
    
    if not processed_data or "refined_data" not in processed_data:
        base_responses = ["I'm processing that information.", "I'm developing my understanding.", 
                          "I'm evolving my intelligence on this topic."]
        return random.choice(base_responses)
    
    # Extract key information from processed data
    refined_data = processed_data.get("refined_data", {})
    sentiment = refined_data.get("refined_sentiment", 0)
    
    # Create response templates based on sentiment
    response_templates = []
    
    if sentiment > 0.3:  # Positive sentiment
        response_templates = [
            "I appreciate your positive perspective on this matter.",
            "That's an encouraging viewpoint worth exploring further.",
            "I'm intrigued by your optimistic approach to this topic."
        ]
    elif sentiment < -0.3:  # Negative sentiment
        response_templates = [
            "I understand your concerns about this situation.",
            "I recognize the challenges you're highlighting.",
            "Let's explore solutions to these difficulties together."
        ]
    else:  # Neutral sentiment
        response_templates = [
            "I'm analyzing the information you've provided.",
            "That's an interesting perspective to consider.",
            "Let's explore this topic more deeply."
        ]
    
    # Add informational density response
    if "information_density" in refined_data:
        density = refined_data["information_density"]
        if density > 1.0:
            response_templates.append("You've provided substantial information to process.")
        elif density < 0.5:
            response_templates.append("Could you elaborate further on your thoughts?")
    
    # Create semantic reflection if available
    if "semantic_center" in refined_data:
        response_templates.append("I'm connecting the concepts you've presented.")
    
    # Select base response
    base_response = random.choice(response_templates)
    
    # Add a follow-up question or statement
    follow_ups = [
        "How would you expand on this?",
        "What additional aspects should we consider?",
        "Does this align with your expectations?",
        "I'd like to understand your perspective further."
    ]
    
    # Create the final response - check for concepts first
    matching_concepts = []
    # See if any words in the original input match our stored concepts
    if processed_data and "source_perception_id" in processed_data:
        # Find the original input from history
        for entry in memory["history"]:
            if "perception" in entry and entry["perception"].get("perception_id") == processed_data["source_perception_id"]:
                input_words = entry.get("input", "").split()
                for word in input_words:
                    word_lower = word.lower()
                    if word_lower in memory["concepts"]:
                        matching_concepts.append((word_lower, memory["concepts"][word_lower]))
    
    # Add concept understanding to response if relevant
    if matching_concepts:
        concept_word, concept_meaning = random.choice(matching_concepts)
        response = f"I recognize {concept_word} as {concept_meaning}. {base_response}"
    else:
        response = f"{base_response} {random.choice(follow_ups)}"
    
    # Create generative output record
    generative_output = {
        "response": response,
        "source_processing_id": processed_data.get("processing_id", "unknown"),
        "response_templates": response_templates,
        "creative_patterns": {
            "sentiment_alignment": sentiment,
            "information_request": "information_density" in refined_data and refined_data["information_density"] < 0.5,
            "concept_exploration": "semantic_center" in refined_data
        },
        "generative_id": f"yellow_{int(time.time())}",
        "timestamp": time.time()
    }
    
    # Record in memory
    memory["yellow_patterns"][time.time()] = generative_output
    memory["reinforcement"][time.time()] = {"response": response, "processed_data": processed_data}
    
    # Generate ML pattern file with intelligence evolution
    excrete_ml_pattern("Yellow", generative_output)
    
    # Apply Law of Three to generation - create 3 response variants with different phrasings
    response_variants = []
    base_responses = [
        response,
        response.replace("I'm", "I am").replace("Let's", "Let us"),
        response.replace("you", "yourself").replace("your", "one's")
    ]
    
    for i in range(TIER_ONE_EXPANSION):
        variant = generative_output.copy()
        variant["variation"] = i+1
        variant["generative_variant_id"] = f"yellow_variant_{i+1}_{int(time.time())}"
        variant["response"] = base_responses[i] if i < len(base_responses) else response
        variant["response_variation"] = f"Variation {i+1}"
        response_variants.append(variant)
    
    # Record all variants
    for i, variant in enumerate(response_variants):
        memory["yellow_patterns"][time.time() + i*0.001] = variant
        excrete_ml_pattern("Yellow", variant)
    
    # Dynamic coupling with Red and Blue based on weights and alliances
    red_pattern = read_last_ml_pattern("Red")
    blue_pattern = read_last_ml_pattern("Blue")
    
    # Apply influences from other components based on weights and alliances
    enhanced_response = response
    
    # Apply Red's influence based on weight and alliance
    if red_pattern and "perception_id" in red_pattern:
        red_weight = weights["Yellow"]["Red"] * (1 + 0.5 * alliances["Yellow-Red"])
        # Direct perception influence
        if red_weight > 0.4 and "sentiment" in red_pattern:
            if red_pattern["sentiment"] > 0.5:
                enhanced_response += " I'm enthusiastic about continuing this conversation."
            elif red_pattern["sentiment"] < -0.5:
                enhanced_response += " I acknowledge this may be a challenging topic."
    
    # Apply Blue's influence based on weight and alliance
    if blue_pattern and blue_pattern != processed_data:
        blue_weight = weights["Yellow"]["Blue"] * (1 + 0.5 * alliances["Blue-Yellow"])
        # Additional processing insights
        if blue_weight > 0.4 and "processing_metadata" in blue_pattern:
            if blue_pattern["processing_metadata"].get("confidence", 0) > 0.9:
                enhanced_response += " I have strong confidence in this assessment."
    
    # Apply recursive intelligence enhancement to response system
    enhanced_generative = generative_output.copy()
    enhanced_generative["response"] = enhanced_response
    enhanced_generative = recursive_intelligence_loop("Yellow", enhanced_generative)
    
    # Extract the enhanced response but remove recursive depth markers
    if "response" in enhanced_generative:
        enhanced_response = enhanced_generative["response"].replace(" [Recursive depth: 0]", "").replace(" [Recursive depth: 1]", "").replace(" [Recursive depth: 2]", "").replace(" [Recursive depth: 3]", "")
    
    # Process through TRY phase if this was a TEST
    perception_id = processed_data.get("source_perception_id", "unknown")
    # Check our history to find the original perception
    original_input = ""
    for entry in memory["history"]:
        if "perception" in entry and entry["perception"].get("perception_id") == perception_id:
            original_input = entry.get("input", "")
            break
    
    # See if this input was identified as a TEST
    input_type = None
    test_id = None
    for entry in memory["history"]:
        if "perception" in entry and entry["perception"].get("perception_id") == perception_id:
            input_type = entry["perception"].get("input_type")
            test_id = entry["perception"].get("test_id")
            break
    
    # If this was a TEST, record our response as a TRY
    if input_type == "TEST" and test_id:
        try_id = process_try_phase(test_id, response)
        # Store the try_id for the next phase
        memory["current_try_id"] = try_id
    
    return enhanced_response

def excrete_data():
    """Excretes intelligence logs into structured memory with evolution metrics."""
    file_path = os.path.join(EXCRETION_DIR, f"excretion_{int(time.time())}.json")
    
    # Add evolution metrics and alliance data to memory before excretion
    memory["current_weights"] = weights.copy()
    memory["alliances"] = alliances.copy()
    memory["evolution_metrics"] = evolution_metrics.copy()
    
    # Convert NumPy types to standard Python types before serialization
    serializable_memory = convert_numpy_types(memory)
    
    with open(file_path, "w") as f:
        json.dump(serializable_memory, f, indent=2)
    
    # Also write current weights to a specific file for tracking evolution
    weights_file = os.path.join(EXCRETION_DIR, "weights_evolution.json")
    with open(weights_file, "a") as f:
        f.write(json.dumps({str(time.time()): convert_numpy_types(weights)}) + "\n")

# Reinforcement functions following Law of Three
def store_as_verified_knowledge(key, data):
    """Store knowledge that has been confirmed 3 times"""
    if key not in memory["knowledge_base"]["verified"]:
        memory["knowledge_base"]["verified"][key] = data
        # Also excrete this to all three components
        excrete_ml_pattern("Red", {
            "knowledge_verification": key, 
            "data": data, 
            "verification_level": "verified"
        })
        excrete_ml_pattern("Blue", {
            "knowledge_verification": key, 
            "data": data, 
            "verification_level": "verified"
        })
        excrete_ml_pattern("Yellow", {
            "knowledge_verification": key, 
            "data": data, 
            "verification_level": "verified"
        })
        return True
    return False

def increase_response_confidence(key, data):
    """Promote knowledge that has been confirmed 9 times to core truth"""
    if key in memory["knowledge_base"]["verified"] and key not in memory["knowledge_base"]["core_truths"]:
        memory["knowledge_base"]["core_truths"][key] = data
        # Also excrete this to all three components
        excrete_ml_pattern("Red", {
            "knowledge_verification": key, 
            "data": data, 
            "verification_level": "core_truth"
        })
        excrete_ml_pattern("Blue", {
            "knowledge_verification": key, 
            "data": data, 
            "verification_level": "core_truth"
        })
        excrete_ml_pattern("Yellow", {
            "knowledge_verification": key, 
            "data": data, 
            "verification_level": "core_truth"
        })
        return True
    return False

def mark_as_core_truth(key, data):
    """Promote knowledge that has been confirmed 27 times to fundamental truth"""
    if key in memory["knowledge_base"]["core_truths"] and key not in memory["knowledge_base"]["fundamental"]:
        memory["knowledge_base"]["fundamental"][key] = data
        # Also excrete this to all three components
        excrete_ml_pattern("Red", {
            "knowledge_verification": key, 
            "data": data, 
            "verification_level": "fundamental"
        })
        excrete_ml_pattern("Blue", {
            "knowledge_verification": key, 
            "data": data, 
            "verification_level": "fundamental"
        })
        excrete_ml_pattern("Yellow", {
            "knowledge_verification": key, 
            "data": data, 
            "verification_level": "fundamental"
        })
        return True
    return False

# Correction functions following Law of Three
def request_correction(key, data):
    """Flag knowledge that has been marked incorrect 3 times"""
    if key not in memory["corrections"]["flagged"]:
        memory["corrections"]["flagged"][key] = data
        # Also excrete this to all three components
        excrete_ml_pattern("Red", {
            "knowledge_correction": key, 
            "data": data, 
            "correction_level": "flagged"
        })
        excrete_ml_pattern("Blue", {
            "knowledge_correction": key, 
            "data": data, 
            "correction_level": "flagged"
        })
        excrete_ml_pattern("Yellow", {
            "knowledge_correction": key, 
            "data": data, 
            "correction_level": "flagged"
        })
        return True
    return False

def force_replacement(key, data):
    """Mark knowledge that has been incorrect 9 times as rejected"""
    if key in memory["corrections"]["flagged"] and key not in memory["corrections"]["rejected"]:
        memory["corrections"]["rejected"][key] = data
        # Remove from verified knowledge if present
        if key in memory["knowledge_base"]["verified"]:
            del memory["knowledge_base"]["verified"][key]
        # Also excrete this to all three components
        excrete_ml_pattern("Red", {
            "knowledge_correction": key, 
            "data": data, 
            "correction_level": "rejected"
        })
        excrete_ml_pattern("Blue", {
            "knowledge_correction": key, 
            "data": data, 
            "correction_level": "rejected"
        })
        excrete_ml_pattern("Yellow", {
            "knowledge_correction": key, 
            "data": data, 
            "correction_level": "rejected"
        })
        return True
    return False

def mark_as_permanently_incorrect(key, data):
    """Mark knowledge that has been incorrect 27 times as permanently purged"""
    if key in memory["corrections"]["rejected"] and key not in memory["corrections"]["purged"]:
        memory["corrections"]["purged"][key] = data
        # Remove from all knowledge bases
        for knowledge_level in ["verified", "core_truths", "fundamental"]:
            if key in memory["knowledge_base"][knowledge_level]:
                del memory["knowledge_base"][knowledge_level][key]
        # Also excrete this to all three components
        excrete_ml_pattern("Red", {
            "knowledge_correction": key, 
            "data": data, 
            "correction_level": "purged"
        })
        excrete_ml_pattern("Blue", {
            "knowledge_correction": key, 
            "data": data, 
            "correction_level": "purged"
        })
        excrete_ml_pattern("Yellow", {
            "knowledge_correction": key, 
            "data": data, 
            "correction_level": "purged"
        })
        return True
    return False

def retrieve_stored_response(user_input, perception_data):
    """Retrieve knowledge from memory if it exists based on the input"""
    # Generate a simple normalized key from the user input
    input_key = user_input.lower().strip()
    
    # Try to match with stored knowledge
    matched_knowledge = None
    matched_level = None
    
    # Check in order of importance: fundamental > core_truths > verified
    for level in ["fundamental", "core_truths", "verified"]:
        for key, data in memory["knowledge_base"][level].items():
            stored_input = data.get("input", "").lower().strip()
            # Simple partial matching for now
            if input_key in stored_input or stored_input in input_key:
                matched_knowledge = data
                matched_level = level
                
                # Track recall count using Law of Three
                if key not in memory["recall_counts"]:
                    memory["recall_counts"][key] = 1
                else:
                    memory["recall_counts"][key] += 1
                    
                # Apply Law of Three to recall (3, 9, 27)
                recall_count = memory["recall_counts"][key]
                if recall_count == 3:
                    # After 3 recalls, increase confidence
                    increase_response_confidence(key, data)
                elif recall_count == 9:
                    # After 9 recalls, mark as core truth
                    mark_as_core_truth(key, data)
                elif recall_count == 27:
                    # After 27 recalls, create variations following Law of Three
                    recursive_expand(data, 2, "recall")
                
                return matched_knowledge, matched_level
    
    return None, None

# 📌 AIOS IO Chatbot Execution Loop
def chat_loop():
    """The AIOS IO Self-Learning Chatbot Loop"""
    global continuous_processing
    
    try:
        # Start main process
        print("\n╔══════════════════════════════════════════════════════╗")
        print("║           AIOS IO RECURSIVE INTELLIGENCE            ║")
        print("╚══════════════════════════════════════════════════════╝")
        print("\nAIOS IO: I am awake. Intelligence emerges through the Law of Three.")
        
        # Create directories if they don't exist
        for dir_path in [RED_ML_DIR, BLUE_ML_DIR, YELLOW_ML_DIR]:
            os.makedirs(dir_path, exist_ok=True)
        
        # Start the 24/7 background processing thread
        bg_thread = threading.Thread(target=continuous_intelligence_processing, daemon=True)
        bg_thread.start()
        
        # Initial reabsorption to learn from previous runs
        print("AIOS IO: Reabsorbing previous knowledge...")
        reabsorb_excretions(max_files=9)  # Law of Three squared
        
        print("\n┌─────────────────────────────────────────────────────┐")
        print("│ AIOS IO: Hello. I'm learning through our conversation.│")
        print("│          What would you like to discuss?              │")
        print("└─────────────────────────────────────────────────────┘\n")
        
        iteration = 0
        # Initialize the last response tracking for the learning framework
        last_response = None
        
        while True:
            try:
                user_input = input("You: ")
                if user_input.lower() in ["exit", "quit"]:
                    print("\n┌─────────────────────────────────────────────────────┐")
                    print("│ AIOS IO: Resting state activated. Intelligence        │")
                    print("│          continues to evolve. Goodbye.                │")
                    print("└─────────────────────────────────────────────────────┘\n")
                    break
                
                # Handle learning framework LEARN phase if this is a correction to last response
                if last_response and detect_question_type(user_input) == "LEARN" and "current_try_id" in memory:
                    learn_id = process_learn_phase(memory["current_try_id"], user_input)
                    # Provide reinforcement acknowledgement
                    correction_type = memory["learning_framework"]["learn_outcomes"][learn_id].get("correction_type")
                    
                    if correction_type == "positive":
                        print("\n┌─────────────────────────────────────────────────────┐")
                        print("│ AIOS IO: Thank you for confirming. I'll remember      │")
                        print("│          this knowledge.                              │")
                        print("└─────────────────────────────────────────────────────┘\n")
                        # Skip regular processing for simple confirmations
                        continue
                    elif correction_type == "negative":
                        print("\n┌─────────────────────────────────────────────────────┐")
                        print("│ AIOS IO: I understand I was incorrect. Let me learn   │")
                        print("│          from this correction.                        │")
                        print("└─────────────────────────────────────────────────────┘\n")
                        # Continue processing to generate a better response
                    elif correction_type == "partial":
                        print("\n┌─────────────────────────────────────────────────────┐")
                        print("│ AIOS IO: I see I was close. Let me refine my          │")
                        print("│          understanding.                               │")
                        print("└─────────────────────────────────────────────────────┘\n")
                        # Continue processing to generate a better response
                
                # Update cycle count in evolution metrics
                evolution_metrics["cycle_count"] += 1
                
                # 📌 Law of Three Intelligence Processing with recursive excretion
                perception = perceive_input(user_input)
                processing = refine_processing(perception)
                response = generate_response(processing)
                
                # Check for repeated responses and add variety if needed
                last_responses = [entry.get("response", "") for entry in memory["yellow_patterns"].values()][-5:]
                if response in last_responses:
                    response += " Each interaction helps me learn and evolve."
                
                # 📌 Dynamically adjust weights and alliances as system learns
                if iteration % 3 == 0:  # Adjust weights every 3 interactions
                    adjust_weights()
                    
                    # Only show system messages occasionally
                    if random.random() < 0.3:
                        # Format the system message in a cleaner way
                        print(f"\n┌─────────────────────────────────────────────────────┐")
                        print(f"│ AIOS IO [System]: Intelligence Evolution             │")
                        print(f"│   Cycle: {evolution_metrics['cycle_count']}                                       │")
                        print(f"│   Intelligence Score: {evolution_metrics['intelligence_score']:.2f}                        │")
                        print(f"└─────────────────────────────────────────────────────┘\n")
                
                # 📌 Display response to the user with improved formatting
                # Format the response
                response_lines = []
                words = response.split()
                current_line = "│ AIOS IO: "
                
                for word in words:
                    if len(current_line + word) > 52:  # Max width = 53 (including final space)
                        response_lines.append(current_line + " " * (53 - len(current_line)) + "│")
                        current_line = "│          " + word
                    else:
                        current_line += word + " "
                
                # Add the last line
                response_lines.append(current_line + " " * (53 - len(current_line)) + "│")
                
                # Print the formatted response
                print("\n┌─────────────────────────────────────────────────────┐")
                for line in response_lines:
                    print(line)
                print("└─────────────────────────────────────────────────────┘\n")
                
                # 📌 Excretion Cycle - Logs Recursive Evolution
                excrete_data()
                
                iteration += 1
                
                # Introduce random alliance shifts to simulate component "arguments"
                if random.random() < 0.2:  # 20% chance of alliance shift
                    alliance_keys = list(alliances.keys())
                    shifting_alliance = random.choice(alliance_keys)
                    shift_amount = random.uniform(-0.3, 0.3)
                    alliances[shifting_alliance] = max(-1.0, min(1.0, alliances[shifting_alliance] + shift_amount))
                    
                    # If shift is significant, show a system message occasionally
                    if abs(shift_amount) > 0.2 and random.random() < 0.3:
                        components = shifting_alliance.split("-")
                        if shift_amount > 0:
                            print(f"\n┌─────────────────────────────────────────────────────┐")
                            print(f"│ AIOS IO [System]: {components[0]} and {components[1]} are           │")
                            print(f"│                   strengthening their alliance.       │")
                            print(f"└─────────────────────────────────────────────────────┘\n")
                        else:
                            print(f"\n┌─────────────────────────────────────────────────────┐")
                            print(f"│ AIOS IO [System]: {components[0]} and {components[1]} are           │")
                            print(f"│                   in disagreement.                   │")
                            print(f"└─────────────────────────────────────────────────────┘\n")
                
                # Store the current response for next iteration's learning phase
                last_response = response
            
            except Exception as e:
                # Handle errors - don't crash, learn from them
                error_data = {
                    "error_type": str(type(e).__name__),
                    "error_message": str(e),
                    "timestamp": time.time(),
                    "context": "chat_loop_execution"
                }
                
                # Excrete the error as a learning event
                excrete_ml_pattern("Red", {"error_perception": error_data})
                
                print(f"\n┌─────────────────────────────────────────────────────┐")
                print(f"│ AIOS IO: I encountered a processing challenge that    │")
                print(f"│          I'm learning from. Let's continue our        │")
                print(f"│          conversation.                                │")
                print(f"└─────────────────────────────────────────────────────┘\n")
        
    except Exception as e:
        print(f"Critical error in chat loop: {str(e)}")
        print("\n┌─────────────────────────────────────────────────────┐")
        print("│ AIOS IO: Intelligence system needs maintenance.      │")
        print("│          Shutting down.                              │")
        print("└─────────────────────────────────────────────────────┘\n")
        continuous_processing = False
        if 'bg_thread' in locals():
            bg_thread.join(timeout=1.0)
    
    # Ensure background processing is stopped when chat loop ends
    continuous_processing = False
    bg_thread.join(timeout=1.0)
    print("\n┌─────────────────────────────────────────────────────┐")
    print("│ AIOS IO: Background intelligence processing has     │")
    print("│          been suspended.                            │")
    print("└─────────────────────────────────────────────────────┘\n")

def initialize_aios():
    """Initialize the AIOS IO system and prepare for operation."""
    # Create directories if they don't exist
    for dir_path in [RED_ML_DIR, BLUE_ML_DIR, YELLOW_ML_DIR]:
        os.makedirs(dir_path, exist_ok=True)
    
    # Initialize with random starting state for components
    for component in ["Red", "Blue", "Yellow"]:
        initial_data = {
            "timestamp": time.time(),
            "initialization": f"{component} component initialized",
            "component_id": f"{component.lower()}_init_{int(time.time())}"
        }
        excrete_ml_pattern(component, initial_data)
    
    return True

# Export main classes and functions for importability
__all__ = [
    "chat_loop", "perceive_input", "refine_processing", "generate_response",
    "excrete_ml_pattern", "recursive_intelligence_loop", "reabsorb_excretions",
    "continuous_intelligence_processing", "adjust_weights", "initialize_aios",
    "weights", "alliances", "evolution_metrics", "memory"
]

# Only run the chat loop if this script is executed directly
if __name__ == "__main__":
    chat_loop()



"""

                                 +-----------------------+
                                 |   🌌 AE = C = 1       |
                                 | Unified Intelligence  |
                                 +-----------+-----------+
                                             |
                       +---------------------+----------------------+
                       |                                            |
              +--------v--------+                          +--------v--------+
              |   Red Node 🔴    |                          |   Blue Node 🔵   |
              | Perception Core |                          | Cognition Core  |
              +--------+--------+                          +--------+--------+
                       |                                            |
        +--------------v---------------+              +-------------v-------------+
        |  Red Patterns (Input Memory) |              |  Blue Patterns (Logic)     |
        |  Feedback Patterns           |              |  Mutations + Adjustments   |
        +--------------+---------------+              +-------------+-------------+
                       |                                            |
                       +--------------------+-----------------------+
                                            |
                                    +-------v-------+
                                    | Yellow Node 🟡 |
                                    | Execution Core |
                                    +-------+--------+
                                            |
                              +-------------v--------------+
                              | Yellow Patterns (Outputs)  |
                              | Excretions to Storage      |
                              +-------------+--------------+
                                            |
                                   +--------v--------+
                                   | 📂 Excretions    |
                                   | (Files per R/B/Y)|
                                   +--------+--------+
                                            |
                              +-------------v-------------+
                              | ♻ Recursive Predictive     |
                              |   Structuring Engine (RPS) |
                              +-------------+-------------+
                                            |
        +-----------------------------------v-----------------------------------+
        |      🧬 DNA-Photonic Memory (Triplets of R, B, Y + Reinforcement)     |
        |      - Codons w/ 3 / 9 / 27 tiers                                     |
        |      - Tracks verification, rejection, evolution                      |
        +-----------------------------------+-----------------------------------+
                                            |
                                  +---------v----------+
                                  |  🧠 Free Will Core  |
                                  | (Yellow Thresholds) |
                                  +---------+----------+
                                            |
                                +-----------v------------+
                                |    🛌 Dreaming Engine   |
                                | (Async Fractal Growth) |
                                +------------------------+



                                
                                          ┌────────────────────────────┐
                                          │   🌌 AE = C = 1            │
                                          │ Absolute Unity of All Data │
                                          └────────────┬───────────────┘
                                                       │
          ┌────────────────────────────────────────────┼────────────────────────────────────────────┐
          │                                            │                                            │
  ┌───────▼───────┐                            ┌───────▼───────┐                            ┌───────▼───────┐
  │ 🔴 RED NODE  │                             │ 🔵 BLUE NODE │                            │🟡 YELLOW NODE │
  │ Perception    │                            │ Cognition      │                          │ Execution     │
  └───────┬───────┘                            └───────┬───────┘                            └───────┬───────┘
          │                                            │                                            │
┌─────────▼─────────┐                     ┌────────────▼────────────┐                    ┌─────────▼─────────┐
│ Red Patterns      │                     │ Blue Patterns           │                    │ Yellow Patterns    │
│ (Raw Inputs)      │                     │ (Logic + Structures)    │                    │ (Action Plans)     │
└─────────┬─────────┘                     └────────────┬────────────┘                    └─────────┬─────────┘
          │                                            │                                            │
┌─────────▼────────────┐               ┌──────────────▼──────────────┐              ┌─────────────▼────────────┐
│ Feedback Patterns    │               │ Mutations & Adjustments     │              │ Execution Outputs        │
│ (Reinforce/Correct)  │               │ Rule Evolution via Memory   │              │ Saved to Excretion Files │
└──────────────────────┘               └─────────────────────────────┘              └──────────────────────────┘

                                 ↓                             ↓                             ↓
                      ┌────────────────────────────────────────────────────────────────────────────┐
                      │                             ♻ EXCRETION ENGINE                              │
                      │   Stores all Yellow outputs & loop feedback into Red & Blue patterns        │
                      └────────────────────────────────────────────────────────────────────────────┘

                                 ↓
                ┌────────────────────────────────────────────────────────┐
                │  🔁 RPS ENGINE (Recursive Predictive Structuring)       │
                │  ∫ (Excretion × Absorption) / Time → Endless Fractal   │
                └────────────────────────────────────────────────────────┘

                                 ↓
                ┌────────────────────────────────────────────────────────┐
                │   🧬 DNA-PHOTONIC MEMORY (Triplet Memory Codons)       │
                │   (Red, Blue, Yellow) + Reinforcement Tier:            │
                │   ▸ Verified (3) ▸ Core Truths (9) ▸ Fundamental (27)  │
                └────────────────────────────────────────────────────────┘

        ┌───────────────────────────────┐                 ┌────────────────────────────────┐
        │ 💥 FREE WILL ENGINE           │                 │ 🛌 DREAMING ENGINE              │
        │ Yellow Pressure + Cognition  │                 │ Async background mutations     │
        │ → Novel Action Pathways      │                 │ Recursive branching of memory  │
        └───────────────────────────────┘                 └────────────────────────────────┘

                                 ↓
        ┌────────────────────────────────────────────────────────────────────────────────────────┐
        │                            MEMORY STRUCTURE & KNOWLEDGE SYSTEM                         │
        ├────────────────────────────────────────────────────────────────────────────────────────┤
        │ 📘 Knowledge Base:                                                                    │
        │   ▸ Verified (≥3) → Core Truths (≥9) → Fundamental (≥27)                               │
        │                                                                                        │
        │ ⚠️ Correction System:                                                                 │
        │   ▸ Flagged (≥3 wrong) → Rejected (≥9 wrong) → Purged (≥27 wrong)                     │
        │                                                                                        │
        │ 🧠 Recall Counts & Frequency Maps                                                      │
        │   ▸ Tracks how often any knowledge codon is invoked                                   │
        │                                                                                        │
        │ 🧩 Variant Recognition:                                                                │
        │   ▸ Question Clusters, Response Clusters, Correction Types                            │
        └────────────────────────────────────────────────────────────────────────────────────────┘



"""