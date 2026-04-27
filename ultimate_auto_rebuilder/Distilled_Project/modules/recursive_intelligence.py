"""
Recursive Intelligence Engine Module
Harvested from enhanced_auto_rebuilder_v2.py and sperm_ileices.py

This module implements recursive intelligence expansion following the Law of Three:
- Tier 1: 3-based expansions (basic patterns)
- Tier 2: 9-based expansions (complex patterns) 
- Tier 3: 27-based expansions (advanced patterns)

Features:
- Recursive pattern expansion
- Rule generation and mutation
- Tier-based intelligence scaling
- Pattern complexity analysis
- Adaptive learning through iterations
"""

import os
import json
import time
import random
import threading
from datetime import datetime
from pathlib import Path
from collections import defaultdict
import ast
import re
import copy


class RecursiveIntelligenceEngine:
    """
    Recursive Intelligence Engine implementing Law of Three expansion patterns
    """
    
    def __init__(self, config):
        self.config = config
        self.base_dir = Path(__file__).parent.parent
        
        # Expansion constants (Law of Three: 3, 9, 27)
        self.TIER_ONE_EXPANSION = config.get('intelligence_thresholds', {}).get('tier_1_expansion', 3)
        self.TIER_TWO_EXPANSION = config.get('intelligence_thresholds', {}).get('tier_2_expansion', 9)
        self.TIER_THREE_EXPANSION = config.get('intelligence_thresholds', {}).get('tier_3_expansion', 27)
        
        # Intelligence memory for recursive operations
        self.recursive_memory = {
            "rule_expansions": {},
            "recursive_mutations": {},
            "expansion_tiers": {
                "tier_1": [],  # 3-based expansions
                "tier_2": [],  # 9-based expansions
                "tier_3": []   # 27-based expansions
            },
            "pattern_complexity": {},
            "expansion_history": [],
            "success_metrics": {
                "tier_1_success": 0,
                "tier_2_success": 0,
                "tier_3_success": 0
            },
            "mutation_patterns": {},
            "adaptive_rules": {}
        }
        
        # Recursive processing control
        self.recursive_processing = False
        self.expansion_thread = None
        
        # Pattern templates for recursive expansion
        self.pattern_templates = {
            "function": {
                "base": "def {name}({args}): {body}",
                "expansions": ["def {name}_expanded({args}): {body}", 
                              "def {name}_optimized({args}): {body}",
                              "def {name}_recursive({args}): {body}"]
            },
            "class": {
                "base": "class {name}: {body}",
                "expansions": ["class Enhanced{name}({name}): {body}",
                              "class {name}Manager: {body}",
                              "class {name}Factory: {body}"]
            },
            "import": {
                "base": "import {module}",
                "expansions": ["from {module} import *",
                              "import {module} as {alias}",
                              "try: import {module}\\nexcept: pass"]
            }
        }
        
        # Initialize recursive state
        self.load_recursive_state()
    
    def recursive_expand(self, item, tier=1, base_type="code_pattern"):
        """
        Expand any item recursively according to the Law of Three
        """
        expansions = []
        
        if tier == 1:
            # Tier 1: Basic 3-expansion
            for i in range(self.TIER_ONE_EXPANSION):
                variation = self.create_variation(item, i, tier, base_type)
                expansions.append(variation)
                
        elif tier == 2:
            # Tier 2: Complex 9-expansion (3 x 3)
            base_expansions = self.recursive_expand(item, tier=1, base_type=base_type)
            for base_expansion in base_expansions:
                for i in range(self.TIER_ONE_EXPANSION):
                    variation = self.create_variation(base_expansion, i, tier, base_type)
                    expansions.append(variation)
                    
        elif tier == 3:
            # Tier 3: Advanced 27-expansion (9 x 3)  
            tier_2_expansions = self.recursive_expand(item, tier=2, base_type=base_type)
            for tier_2_expansion in tier_2_expansions:
                for i in range(self.TIER_ONE_EXPANSION):
                    variation = self.create_variation(tier_2_expansion, i, tier, base_type)
                    expansions.append(variation)
        
        # Track expansions
        expansion_id = f"{base_type}_{tier}_{time.time()}"
        self.recursive_memory["expansion_tiers"][f"tier_{tier}"].append({
            "id": expansion_id,
            "original": item,
            "expansions": expansions,
            "timestamp": datetime.now().isoformat(),
            "success_count": 0
        })
        
        return expansions
    
    def create_variation(self, item, variation_index, tier, base_type):
        """
        Create a specific variation of an item based on tier and index
        """
        if isinstance(item, str):
            return self.create_string_variation(item, variation_index, tier)
        elif isinstance(item, dict):
            return self.create_dict_variation(item, variation_index, tier)
        elif isinstance(item, list):
            return self.create_list_variation(item, variation_index, tier)
        else:
            return self.create_generic_variation(item, variation_index, tier, base_type)
    
    def create_string_variation(self, text, variation_index, tier):
        """
        Create variations of string content (code, patterns, etc.)
        """
        variations = []
        
        if tier == 1:
            # Basic string variations
            variations = [
                text,  # Original
                text.upper() if variation_index == 0 else text.lower(),  # Case variation
                f"enhanced_{text}" if variation_index == 1 else f"{text}_optimized",  # Prefix/suffix
                text.replace(" ", "_") if " " in text else text + "_variant"  # Structure variation
            ]
        elif tier == 2:
            # Complex string variations
            variations = [
                f"def process_{text}(): return {repr(text)}",  # Function wrapper
                f"class {text.title()}Handler: pass",  # Class wrapper
                f"# {text}\\n{text}\\n# End {text}",  # Documentation wrapper
                f"try:\\n    {text}\\nexcept:\\n    pass"  # Error handling wrapper
            ]
        elif tier == 3:
            # Advanced string variations with AI-like patterns
            variations = [
                self.generate_ai_pattern(text),
                self.generate_recursive_pattern(text),
                self.generate_meta_pattern(text),
                self.generate_adaptive_pattern(text)
            ]
        
        return variations[variation_index % len(variations)]
    
    def create_dict_variation(self, data, variation_index, tier):
        """
        Create variations of dictionary data
        """
        variations = []
        base_data = copy.deepcopy(data)
        
        if tier == 1:
            # Basic dict variations
            variations = [
                base_data,  # Original
                {f"enhanced_{k}": v for k, v in base_data.items()},  # Key prefixing
                {k: f"processed_{v}" if isinstance(v, str) else v for k, v in base_data.items()},  # Value processing
                {**base_data, "meta": {"tier": tier, "variation": variation_index}}  # Meta addition
            ]
        elif tier == 2:
            # Complex dict variations
            variations = [
                {"wrapper": base_data, "type": "wrapped"},
                {"data": base_data, "processor": f"tier_{tier}_processor", "index": variation_index},
                {f"tier_{tier}": {**base_data, "expanded": True}},
                base_data  # Fallback to original
            ]
        elif tier == 3:
            # Advanced dict variations
            variations = [
                self.generate_intelligent_dict(base_data, variation_index),
                self.generate_recursive_dict(base_data, tier),
                self.generate_adaptive_dict(base_data),
                self.generate_meta_dict(base_data, tier, variation_index)
            ]
        
        return variations[variation_index % len(variations)]
    
    def create_list_variation(self, items, variation_index, tier):
        """
        Create variations of list data
        """
        variations = []
        base_items = copy.deepcopy(items)
        
        if tier == 1:
            # Basic list variations  
            variations = [
                base_items,  # Original
                base_items[::-1],  # Reversed
                base_items + [f"expansion_{variation_index}"],  # Extended
                [f"processed_{item}" if isinstance(item, str) else item for item in base_items]  # Processed
            ]
        elif tier == 2:
            # Complex list variations
            variations = [
                [base_items, f"tier_{tier}_wrapper"],
                base_items * 2,  # Duplicated
                [item for item in base_items if item],  # Filtered
                base_items + [{"meta": f"tier_{tier}", "index": variation_index}]  # Meta extended
            ]
        elif tier == 3:
            # Advanced list variations
            variations = [
                self.generate_intelligent_list(base_items, variation_index),
                self.generate_recursive_list(base_items, tier),
                self.generate_adaptive_list(base_items),
                self.generate_pattern_list(base_items, tier, variation_index)
            ]
        
        return variations[variation_index % len(variations)]
    
    def create_generic_variation(self, item, variation_index, tier, base_type):
        """
        Create variations for generic objects
        """
        # Convert to string representation and vary that
        item_str = str(item)
        varied_str = self.create_string_variation(item_str, variation_index, tier)
        
        # Try to parse back to original type if possible
        if base_type == "code_pattern":
            return varied_str
        else:
            return {"original": item, "varied": varied_str, "tier": tier, "type": base_type}
    
    def generate_ai_pattern(self, text):
        """Generate AI-like pattern variations"""
        return f"""
class AI{text.title()}Processor:
    def __init__(self):
        self.pattern = \"{text}\"
        self.intelligence_level = 3
    
    def process(self, data):
        # AI processing for {text}
        return self.enhance_pattern(data)
    
    def enhance_pattern(self, data):
        return f\"enhanced_{{data}}_with_{text}\"
"""
    
    def generate_recursive_pattern(self, text):
        """Generate recursive pattern variations"""
        return f"""
def recursive_{text}_processor(data, depth=0):
    if depth >= 3:
        return data
    
    # Recursive processing for {text}
    processed = f\"{{data}}_level_{{depth}}\"
    return recursive_{text}_processor(processed, depth + 1)
"""
    
    def generate_meta_pattern(self, text):
        """Generate meta-pattern variations"""
        return f"""
META_PATTERN_{text.upper()} = {{
    \"pattern\": \"{text}\",
    \"tier\": 3,
    \"expansions\": [
        \"{text}_variant_1\",
        \"{text}_variant_2\", 
        \"{text}_variant_3\"
    ],
    \"processor\": lambda x: f\"meta_{{x}}_{text}\"
}}
"""
    
    def generate_adaptive_pattern(self, text):
        """Generate adaptive pattern variations"""
        return f"""
class Adaptive{text.title()}System:
    def __init__(self):
        self.adaptations = []
        self.pattern = \"{text}\"
    
    def adapt(self, input_data):
        adaptation = self.learn_from_input(input_data)
        self.adaptations.append(adaptation)
        return self.apply_adaptation(adaptation)
    
    def learn_from_input(self, data):
        return f\"learned_from_{{data}}_{text}\"
    
    def apply_adaptation(self, adaptation):
        return f\"applied_{{adaptation}}\"
"""
    
    def generate_intelligent_dict(self, data, variation_index):
        """Generate intelligent dictionary variations"""
        return {
            "intelligence": {
                "level": 3,
                "variation": variation_index,
                "original_data": data,
                "enhanced_keys": {f"smart_{k}": v for k, v in data.items()},
                "meta_info": {
                    "generation_time": datetime.now().isoformat(),
                    "complexity": len(str(data)),
                    "type": "intelligent_dict"
                }
            }
        }
    
    def generate_recursive_dict(self, data, tier):
        """Generate recursive dictionary variations"""
        return {
            f"tier_{tier}": {
                "data": data,
                "recursive_data": {
                    f"level_{i}": {**data, "recursion_level": i} 
                    for i in range(3)
                },
                "meta": {"tier": tier, "recursive": True}
            }
        }
    
    def generate_adaptive_dict(self, data):
        """Generate adaptive dictionary variations"""
        return {
            "adaptive_system": {
                "base_data": data,
                "adaptations": [
                    {f"adaptation_{i}": {**data, "adapted": True, "level": i}} 
                    for i in range(3)
                ],
                "learning_params": {
                    "adaptation_rate": 0.1,
                    "complexity_threshold": 0.8,
                    "evolution_enabled": True
                }
            }
        }
    
    def generate_meta_dict(self, data, tier, variation_index):
        """Generate meta-level dictionary variations"""
        return {
            "meta_intelligence": {
                "tier": tier,
                "variation": variation_index,
                "original": data,
                "meta_patterns": {
                    "pattern_1": self.extract_patterns(data),
                    "pattern_2": self.generate_meta_patterns(data),
                    "pattern_3": self.create_evolution_path(data)
                },
                "expansion_rules": {
                    "rule_1": "enhance_all_values",
                    "rule_2": "create_recursive_structure",
                    "rule_3": "generate_intelligent_variations"
                }
            }
        }
    
    def generate_intelligent_list(self, items, variation_index):
        """Generate intelligent list variations"""
        return [
            {"intelligence_wrapper": items},
            f"intelligent_processing_variation_{variation_index}",
            {"enhanced_items": [f"smart_{item}" for item in items]},
            {"meta": {"original_count": len(items), "intelligence_level": 3}}
        ]
    
    def generate_recursive_list(self, items, tier):
        """Generate recursive list variations"""
        recursive_items = []
        for i in range(3):
            recursive_items.append({
                f"recursion_level_{i}": items,
                "tier": tier,
                "depth": i
            })
        return recursive_items
    
    def generate_adaptive_list(self, items):
        """Generate adaptive list variations"""
        return [
            {"adaptive_base": items},
            {"adaptations": [f"adapted_{item}" for item in items]},
            {"learning_system": {"items": items, "can_adapt": True}},
            {"evolution_path": items + ["evolved_variant"]}
        ]
    
    def generate_pattern_list(self, items, tier, variation_index):
        """Generate pattern-based list variations"""
        return [
            f"pattern_tier_{tier}_item_{i}_{variation_index}" 
            for i in range(len(items) + 3)
        ] + items
    
    def extract_patterns(self, data):
        """Extract patterns from data for meta-analysis"""
        if isinstance(data, dict):
            return {
                "keys": list(data.keys()),
                "value_types": [type(v).__name__ for v in data.values()],
                "structure": "dictionary"
            }
        elif isinstance(data, list):
            return {
                "length": len(data),
                "item_types": [type(item).__name__ for item in data],
                "structure": "list"
            }
        else:
            return {
                "type": type(data).__name__,
                "string_repr": str(data),
                "structure": "primitive"
            }
    
    def generate_meta_patterns(self, data):
        """Generate meta-patterns for advanced intelligence"""
        return {
            "complexity_score": len(str(data)) / 100,
            "intelligence_potential": random.uniform(0.5, 1.0),
            "expansion_candidates": ["enhance", "optimize", "adapt"],
            "learning_opportunities": ["pattern_recognition", "adaptive_behavior", "recursive_improvement"]
        }
    
    def create_evolution_path(self, data):
        """Create evolution path for continuous improvement"""
        return {
            "current_state": data,
            "evolution_steps": [
                {"step": 1, "action": "analyze_patterns"},
                {"step": 2, "action": "generate_variations"},
                {"step": 3, "action": "test_and_adapt"}
            ],
            "target_improvements": ["intelligence", "adaptability", "efficiency"]
        }
    
    def apply_recursive_mutations(self, pattern_id, success_feedback):
        """
        Apply recursive mutations based on success feedback
        """
        if pattern_id not in self.recursive_memory["mutation_patterns"]:
            self.recursive_memory["mutation_patterns"][pattern_id] = {
                "mutations": [],
                "success_rate": 0.0,
                "mutation_count": 0
            }
        
        pattern_data = self.recursive_memory["mutation_patterns"][pattern_id]
        
        # Generate mutations based on tier and success
        if success_feedback > 0.8:
            # High success - create tier 3 mutations
            mutations = self.generate_tier_3_mutations(pattern_id)
        elif success_feedback > 0.5:
            # Medium success - create tier 2 mutations
            mutations = self.generate_tier_2_mutations(pattern_id)
        else:
            # Low success - create tier 1 mutations
            mutations = self.generate_tier_1_mutations(pattern_id)
        
        pattern_data["mutations"].extend(mutations)
        pattern_data["mutation_count"] += len(mutations)
        pattern_data["success_rate"] = (pattern_data["success_rate"] + success_feedback) / 2
        
        return mutations
    
    def generate_tier_1_mutations(self, pattern_id):
        """Generate basic tier 1 mutations"""
        return [
            f"{pattern_id}_mutation_1",
            f"{pattern_id}_mutation_2", 
            f"{pattern_id}_mutation_3"
        ]
    
    def generate_tier_2_mutations(self, pattern_id):
        """Generate complex tier 2 mutations"""
        base_mutations = self.generate_tier_1_mutations(pattern_id)
        tier_2_mutations = []
        
        for base in base_mutations:
            for i in range(3):
                tier_2_mutations.append(f"{base}_tier2_{i}")
        
        return tier_2_mutations
    
    def generate_tier_3_mutations(self, pattern_id):
        """Generate advanced tier 3 mutations"""
        tier_2_mutations = self.generate_tier_2_mutations(pattern_id)
        tier_3_mutations = []
        
        for tier_2 in tier_2_mutations:
            for i in range(3):
                tier_3_mutations.append(f"{tier_2}_tier3_{i}")
        
        return tier_3_mutations
    
    def evaluate_expansion_success(self, expansion_id, test_results):
        """
        Evaluate the success of a recursive expansion
        """
        for tier_name, expansions in self.recursive_memory["expansion_tiers"].items():
            for expansion in expansions:
                if expansion["id"] == expansion_id:
                    if test_results.get("success", False):
                        expansion["success_count"] += 1
                        tier_key = f"{tier_name}_success"
                        self.recursive_memory["success_metrics"][tier_key] += 1
                    break
    
    def get_best_expansions(self, tier=None, limit=10):
        """
        Get the most successful expansions
        """
        all_expansions = []
        
        tiers_to_check = [f"tier_{tier}"] if tier else ["tier_1", "tier_2", "tier_3"]
        
        for tier_name in tiers_to_check:
            if tier_name in self.recursive_memory["expansion_tiers"]:
                all_expansions.extend(self.recursive_memory["expansion_tiers"][tier_name])
        
        # Sort by success count
        sorted_expansions = sorted(all_expansions, key=lambda x: x["success_count"], reverse=True)
        
        return sorted_expansions[:limit]
    
    def show_recursive_status(self):
        """
        Display recursive intelligence status
        """
        print("\n🔄 Recursive Intelligence Engine Status")
        print("=" * 50)
        
        # Expansion tier counts
        print("📊 Expansion Tiers:")
        for tier_name, expansions in self.recursive_memory["expansion_tiers"].items():
            print(f"   {tier_name}: {len(expansions)} expansions")
        
        # Success metrics
        print("\n🎯 Success Metrics:")
        for metric, value in self.recursive_memory["success_metrics"].items():
            print(f"   {metric}: {value}")
        
        # Mutation patterns
        print(f"\n🧬 Mutation Patterns: {len(self.recursive_memory['mutation_patterns'])}")
        
        # Best expansions
        best_expansions = self.get_best_expansions(limit=5)
        print("\n🏆 Top Performing Expansions:")
        for i, expansion in enumerate(best_expansions[:5]):
            print(f"   {i+1}. ID: {expansion['id'][:20]}... Success: {expansion['success_count']}")
    
    def start_recursive_processing(self):
        """
        Start continuous recursive processing
        """
        if not self.recursive_processing:
            self.recursive_processing = True
            self.expansion_thread = threading.Thread(target=self._recursive_processing_loop)
            self.expansion_thread.daemon = True
            self.expansion_thread.start()
            print("🔄 Recursive processing started")
    
    def stop_recursive_processing(self):
        """
        Stop recursive processing
        """
        self.recursive_processing = False
        if self.expansion_thread:
            self.expansion_thread.join(timeout=1)
        print("⏸️  Recursive processing stopped")
    
    def _recursive_processing_loop(self):
        """
        Main recursive processing loop
        """
        while self.recursive_processing:
            try:
                # Process existing expansions for improvement
                self._process_expansions_for_improvement()
                
                # Generate new adaptive rules
                self._generate_adaptive_rules()
                
                # Clean up unsuccessful patterns
                self._cleanup_unsuccessful_patterns()
                
                time.sleep(180)  # 3 minutes between cycles
                
            except Exception as e:
                print(f"⚠️  Error in recursive processing: {e}")
                time.sleep(60)
    
    def _process_expansions_for_improvement(self):
        """
        Process existing expansions to find improvement opportunities
        """
        # Find low-performing expansions for re-processing
        for tier_name, expansions in self.recursive_memory["expansion_tiers"].items():
            for expansion in expansions[-10:]:  # Process last 10 expansions
                if expansion["success_count"] == 0:
                    # Try to improve unsuccessful expansion
                    improved_expansions = self.recursive_expand(
                        expansion["original"], 
                        tier=int(tier_name.split("_")[1]), 
                        base_type="improvement"
                    )
                    expansion["improved_versions"] = improved_expansions
    
    def _generate_adaptive_rules(self):
        """
        Generate new adaptive rules based on successful patterns
        """
        successful_patterns = [
            expansion for expansions in self.recursive_memory["expansion_tiers"].values()
            for expansion in expansions if expansion["success_count"] > 0
        ]
        
        if successful_patterns:
            # Extract common patterns from successful expansions
            for pattern in successful_patterns[-5:]:  # Process last 5 successful patterns
                rule_id = f"adaptive_rule_{len(self.recursive_memory['adaptive_rules'])}"
                self.recursive_memory["adaptive_rules"][rule_id] = {
                    "based_on": pattern["id"],
                    "rule": f"Apply pattern similar to {pattern['id'][:10]}...",
                    "confidence": pattern["success_count"] / 10.0,
                    "created": datetime.now().isoformat()
                }
    
    def _cleanup_unsuccessful_patterns(self):
        """
        Clean up patterns that haven't shown success
        """
        cutoff_time = time.time() - (24 * 3600)  # 24 hours ago
        
        for tier_name, expansions in self.recursive_memory["expansion_tiers"].items():
            # Remove old unsuccessful expansions
            self.recursive_memory["expansion_tiers"][tier_name] = [
                expansion for expansion in expansions
                if expansion["success_count"] > 0 or 
                   time.time() - float(expansion["id"].split("_")[-1]) < cutoff_time
            ]
    
    def save_recursive_state(self):
        """
        Save recursive intelligence state
        """
        state_file = self.base_dir / "recursive_intelligence_state.json"
        
        with open(state_file, 'w') as f:
            json.dump(self.recursive_memory, f, indent=2)
    
    def load_recursive_state(self):
        """
        Load recursive intelligence state
        """
        state_file = self.base_dir / "recursive_intelligence_state.json"
        
        if state_file.exists():
            with open(state_file, 'r') as f:
                saved_state = json.load(f)
                self.recursive_memory.update(saved_state)
