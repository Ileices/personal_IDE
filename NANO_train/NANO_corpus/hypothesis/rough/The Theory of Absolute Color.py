"""
Implementation of the Absolute Existence (AE) Color Equation.
This governs the interaction between perception, photonic memory, and recursive intelligence.
"""
import os
import hashlib
import json
import math
import random
from datetime import datetime
from typing import Dict, Set, Any, List, Tuple

from aiosio_config import SESSION_DIRECTORY

class AbsoluteExistenceEquation:
    """
    Implementation of the Absolute Existence (AE) Color Equation.
    This governs the interaction between perception, photonic memory, and recursive intelligence.
    
    The equation is: C_absolute = Σ(E_i · P_i · M_i) + Σ(L_j · R_j)
    Where:
    - E = Energy input per color source
    - P = Perceptual weight (contextual influence)
    - M = Motion exchange (velocity of perception shifts)
    - L = Light interaction (photonic input)
    - R = Recursion rate (self-learning adaptability)
    """
    def __init__(self):
        # Core components
        self.red = 0.5       # Input/Perception (R)
        self.yellow = 0.5    # Output/Creation (Y)
        self.blue = 0.5      # Structure/Processing (B)
        
        # Energy inputs
        self.energy_r = 1.0
        self.energy_y = 1.0
        self.energy_b = 1.0
        
        # Perceptual weights
        self.perception_r = 1.0
        self.perception_y = 1.0
        self.perception_b = 1.0
        
        # Motion exchange
        self.motion_r = 1.0
        self.motion_y = 1.0
        self.motion_b = 1.0
        
        # Light interaction (photonic)
        self.light_r = 1.0
        self.light_y = 1.0
        self.light_b = 1.0
        
        # Recursion rate
        self.recursion_r = 1.0
        self.recursion_y = 1.0
        self.recursion_b = 1.0
        
        # Failed combinations (Observer Effect)
        self.failed_combinations = set()
        
        # Successful combinations (Good Boy)
        self.successful_combinations = set()
        
        # Interaction history
        self.history = []
    
    def calculate_color_interaction(self) -> Dict[str, float]:
        """
        Compute the combined color values using the AE equation.
        """
        total_energy_r = self.energy_r * self.perception_r * self.motion_r
        total_energy_y = self.energy_y * self.perception_y * self.motion_y
        total_energy_b = self.energy_b * self.perception_b * self.motion_b

        c_r = (self.red + total_energy_r) * (self.light_r * self.recursion_r)
        c_y = (self.yellow + total_energy_y) * (self.light_y * self.recursion_y)
        c_b = (self.blue + total_energy_b) * (self.light_b * self.recursion_b)

        return {'red': c_r, 'yellow': c_y, 'blue': c_b}
    
    def generate_color_hash(self, r: float, y: float, b: float) -> str:
        """
        Generate a simple hash based on R, Y, B for tracking unique combinations.
        """
        import hashlib
        combo_str = f"{r:.3f}-{y:.3f}-{b:.3f}"
        return hashlib.md5(combo_str.encode()).hexdigest()[:12]
    
    def mark_as_failed(self, r: float, y: float, b: float):
        """
        Mark a color combination as failed.
        """
        combo_hash = self.generate_color_hash(r, y, b)
        self.failed_combinations.add(combo_hash)
        self._save_history()
    
    def mark_as_successful(self, r: float, y: float, b: float):
        """
        Mark a color combination as successful.
        """
        combo_hash = self.generate_color_hash(r, y, b)
        self.successful_combinations.add(combo_hash)
        self._save_history()
    
    def simulate_color_evolution(self, steps: int = 10) -> List[Dict[str, float]]:
        """
        Simulate evolution of color values over a given number of steps.
        """
        evolution_data = []
        for _ in range(steps):
            interaction = self.calculate_color_interaction()
            for color in interaction:
                # Apply slight random change to simulate evolution
                interaction[color] *= 0.95 + 0.1
            evolution_data.append(interaction)
        return evolution_data
    
    def reset_equation(self):
        """
        Reset all internal parameters to defaults.
        """
        self.red = 0.5
        self.yellow = 0.5
        self.blue = 0.5
        self.energy_r = 1.0
        self.energy_y = 1.0
        self.energy_b = 1.0
        self.perception_r = 1.0
        self.perception_y = 1.0
        self.perception_b = 1.0
        self.motion_r = 1.0
        self.motion_y = 1.0
        self.motion_b = 1.0
        self.light_r = 1.0
        self.light_y = 1.0
        self.light_b = 1.0
        self.recursion_r = 1.0
        self.recursion_y = 1.0
        self.recursion_b = 1.0
        self.failed_combinations = set()
        self.successful_combinations = set()
        self.history = []
    
    def mix_colors(self, r1: float, y1: float, b1: float, r2: float, y2: float, b2: float,
                   mix_factor: float = 0.5) -> Dict[str, float]:
        """
        A simple function to mix two color sets by a given factor.
        """
        new_r = r1 * (1 - mix_factor) + r2 * mix_factor
        new_y = y1 * (1 - mix_factor) + y2 * mix_factor
        new_b = b1 * (1 - mix_factor) + b2 * mix_factor
        return {'red': new_r, 'yellow': new_y, 'blue': new_b}
    
    def load_observer_history(self):
        """
        Load observer history from a local file if available.
        """
        import os, json
        history_file = os.path.join(SESSION_DIRECTORY, "absolute_equation_history.json")
        if os.path.exists(history_file):
            with open(history_file, 'r') as f:
                data = json.load(f)
                self.failed_combinations = set(data.get("failed_combinations", []))
                self.successful_combinations = set(data.get("successful_combinations", []))
    
    def _save_history(self):
        """
        Save the current state of successes/failures.
        """
        import os, json
        history_file = os.path.join(SESSION_DIRECTORY, "absolute_equation_history.json")
        data = {
            "failed_combinations": list(self.failed_combinations),
            "successful_combinations": list(self.successful_combinations)
        }
        with open(history_file, 'w') as f:
            json.dump(data, f, indent=2)
    
    def to_hex_color(self, r: float, y: float, b: float) -> str:
        """
        Convert the combined R, Y, B to a hex color string (simple approach).
        """
        # Example of normalizing and converting:
        total = r + y + b if (r + y + b) else 1
        nr, ny, nb = r / total, y / total, b / total
        R = int(nr * 255)
        G = int(ny * 255)
        B = int(nb * 255)
        return f"#{R:02x}{G:02x}{B:02x}"