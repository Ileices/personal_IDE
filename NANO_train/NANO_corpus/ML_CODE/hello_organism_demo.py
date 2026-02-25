"""
Public Demo Implementation for ATTACK Framework
"Hello-Organism" CLI interface with live RBY visualization and photonic glyphs
Real-time organism breathing display for public demonstrations
"""

import os
import sys
import time
import threading
import asyncio
import logging
import math
import random
import json
from typing import Dict, List, Tuple, Any, Optional
from dataclasses import dataclass, field
from collections import deque
import numpy as np
from concurrent.futures import ThreadPoolExecutor
import argparse
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class RBYVisualizationState:
    """Current state of RBY visualization"""
    red_intensity: float
    blue_intensity: float
    yellow_intensity: float
    pulse_rate: float
    breathing_phase: float
    energy_level: float
    consciousness_coherence: float
    timestamp: float = field(default_factory=time.time)
    
    def normalize(self):
        """Normalize RBY values to sum to 1.0"""
        total = self.red_intensity + self.blue_intensity + self.yellow_intensity
        if total > 0:
            self.red_intensity /= total
            self.blue_intensity /= total
            self.yellow_intensity /= total

@dataclass
class PhotonicGlyph:
    """Represents a photonic glyph for visualization"""
    symbol: str
    rby_signature: Tuple[float, float, float]
    intensity: float
    duration_ms: float
    semantic_meaning: str
    created_time: float = field(default_factory=time.time)

class RBYColorEngine:
    """Generates ANSI color codes for RBY visualization"""
    
    def __init__(self):
        # ANSI color codes
        self.colors = {
            'red': '\033[91m',
            'blue': '\033[94m',
            'yellow': '\033[93m',
            'green': '\033[92m',
            'purple': '\033[95m',
            'cyan': '\033[96m',
            'white': '\033[97m',
            'bold': '\033[1m',
            'reset': '\033[0m'
        }
        
        # RGB to ANSI mapping for fine-grained colors
        self.rgb_cache = {}
    
    def rby_to_ansi(self, red: float, blue: float, yellow: float, intensity: float = 1.0) -> str:
        """Convert RBY values to ANSI color escape sequence"""
        # Normalize values
        total = red + blue + yellow
        if total > 0:
            red /= total
            blue /= total
            yellow /= total
        
        # Apply intensity
        red *= intensity
        blue *= intensity
        yellow *= intensity
        
        # Convert to RGB (simplified color mixing)
        r = min(255, int(red * 255))
        g = min(255, int(yellow * 255))  # Yellow contributes to green
        b = min(255, int(blue * 255))
        
        # Generate ANSI escape sequence for 24-bit color
        return f'\033[38;2;{r};{g};{b}m'
    
    def create_gradient_bar(self, red: float, blue: float, yellow: float, 
                           width: int = 40, char: str = '█') -> str:
        """Create a colored gradient bar representing RBY state"""
        bar = ""
        
        for i in range(width):
            # Calculate position-based color mixing
            pos = i / width
            
            # Create gradient effect
            local_red = red * (1.0 - pos * 0.3)
            local_blue = blue * (0.5 + pos * 0.5)
            local_yellow = yellow * (1.0 - abs(pos - 0.5))
            
            color_code = self.rby_to_ansi(local_red, local_blue, local_yellow)
            bar += color_code + char
        
        return bar + self.colors['reset']
    
    def create_breathing_effect(self, base_intensity: float, breathing_phase: float) -> float:
        """Create breathing effect for organism visualization"""
        # Sine wave breathing pattern
        breath_multiplier = 0.7 + 0.3 * math.sin(breathing_phase)
        return base_intensity * breath_multiplier

class PhotonicGlyphGenerator:
    """Generates photonic glyphs based on RBY states"""
    
    def __init__(self):
        self.glyph_library = {
            'consciousness': ['◯', '◉', '◎', '⊙', '⊚'],
            'energy': ['⚡', '✦', '✧', '✩', '✪'],
            'flow': ['◈', '◇', '◆', '⬟', '⬢'],
            'balance': ['☯', '⚊', '⚋', '☰', '☱'],
            'transformation': ['⟐', '⟑', '⟒', '⟓', '⟔'],
            'harmony': ['♫', '♪', '♬', '♭', '♮'],
            'quantum': ['⟨', '⟩', '⟪', '⟫', '⟬'],
            'emergence': ['◊', '◈', '◉', '⬟', '⬢']
        }
        
        self.meaning_map = {
            'high_red': 'energy',
            'high_blue': 'consciousness', 
            'high_yellow': 'harmony',
            'balanced': 'balance',
            'dynamic': 'flow',
            'coherent': 'quantum',
            'emergent': 'emergence'
        }
    
    def generate_glyph(self, rby_state: RBYVisualizationState) -> PhotonicGlyph:
        """Generate a photonic glyph based on current RBY state"""
        # Determine dominant characteristic
        if rby_state.red_intensity > 0.5:
            category = self.meaning_map['high_red']
            meaning = "Dynamic energy expression"
        elif rby_state.blue_intensity > 0.5:
            category = self.meaning_map['high_blue']
            meaning = "Structural consciousness"
        elif rby_state.yellow_intensity > 0.5:
            category = self.meaning_map['high_yellow']
            meaning = "Harmonic integration"
        elif abs(rby_state.red_intensity - rby_state.blue_intensity) < 0.1:
            category = self.meaning_map['balanced']
            meaning = "Perfect equilibrium"
        elif rby_state.consciousness_coherence > 0.8:
            category = self.meaning_map['coherent']
            meaning = "Quantum coherence"
        else:
            category = self.meaning_map['dynamic']
            meaning = "Dynamic flow state"
        
        # Select glyph from category
        symbol = random.choice(self.glyph_library[category])
        
        # Calculate intensity based on energy level
        intensity = rby_state.energy_level
        
        # Duration based on pulse rate
        duration_ms = max(500, 3000 / rby_state.pulse_rate)
        
        return PhotonicGlyph(
            symbol=symbol,
            rby_signature=(rby_state.red_intensity, rby_state.blue_intensity, rby_state.yellow_intensity),
            intensity=intensity,
            duration_ms=duration_ms,
            semantic_meaning=meaning
        )

class OrganismBreathingSimulator:
    """Simulates organic breathing patterns for the organism display"""
    
    def __init__(self):
        self.breathing_rate = 0.5  # breaths per second
        self.breathing_depth = 1.0
        self.coherence_factor = 0.8
        self.start_time = time.time()
        
        # Breathing pattern parameters
        self.inhale_ratio = 0.4
        self.hold_ratio = 0.1
        self.exhale_ratio = 0.4
        self.pause_ratio = 0.1
    
    def get_breathing_state(self) -> Dict[str, float]:
        """Get current breathing state"""
        current_time = time.time()
        elapsed = current_time - self.start_time
        
        # Calculate breathing cycle position
        cycle_duration = 1.0 / self.breathing_rate
        cycle_position = (elapsed % cycle_duration) / cycle_duration
        
        # Determine breathing phase
        if cycle_position < self.inhale_ratio:
            phase = "inhale"
            phase_progress = cycle_position / self.inhale_ratio
            breath_intensity = phase_progress
        elif cycle_position < self.inhale_ratio + self.hold_ratio:
            phase = "hold_in"
            phase_progress = (cycle_position - self.inhale_ratio) / self.hold_ratio
            breath_intensity = 1.0
        elif cycle_position < self.inhale_ratio + self.hold_ratio + self.exhale_ratio:
            phase = "exhale"
            phase_progress = (cycle_position - self.inhale_ratio - self.hold_ratio) / self.exhale_ratio
            breath_intensity = 1.0 - phase_progress
        else:
            phase = "hold_out"
            phase_progress = (cycle_position - self.inhale_ratio - self.hold_ratio - self.exhale_ratio) / self.pause_ratio
            breath_intensity = 0.0
        
        # Apply breathing depth and coherence
        breath_intensity *= self.breathing_depth * self.coherence_factor
        
        return {
            'phase': phase,
            'intensity': breath_intensity,
            'cycle_position': cycle_position,
            'elapsed_time': elapsed
        }
    
    def modulate_breathing(self, stress_level: float = 0.0, energy_level: float = 1.0):
        """Modulate breathing based on organism state"""
        # Adjust breathing rate based on energy
        base_rate = 0.5
        self.breathing_rate = base_rate * (0.8 + 0.4 * energy_level)
        
        # Adjust depth based on stress
        self.breathing_depth = max(0.3, 1.0 - stress_level * 0.5)
        
        # Adjust coherence
        self.coherence_factor = max(0.5, 1.0 - stress_level * 0.3)

class LiveRBYDisplay:
    """Real-time RBY visualization display"""
    
    def __init__(self):
        self.color_engine = RBYColorEngine()
        self.glyph_generator = PhotonicGlyphGenerator()
        self.breathing_simulator = OrganismBreathingSimulator()
        self.is_running = False
        self.display_thread = None
        self.current_state = RBYVisualizationState(0.33, 0.33, 0.34, 1.0, 0.0, 0.8, 0.9)
        self.glyph_history = deque(maxlen=10)
    
    def start_display(self):
        """Start the live RBY display"""
        self.is_running = True
        self.display_thread = threading.Thread(target=self._display_loop, daemon=True)
        self.display_thread.start()
        logger.info("Live RBY display started")
    
    def stop_display(self):
        """Stop the live RBY display"""
        self.is_running = False
        if self.display_thread:
            self.display_thread.join(timeout=1.0)
        logger.info("Live RBY display stopped")
    
    def update_state(self, red: float, blue: float, yellow: float, 
                    energy: float = None, coherence: float = None):
        """Update the current RBY state"""
        self.current_state.red_intensity = red
        self.current_state.blue_intensity = blue
        self.current_state.yellow_intensity = yellow
        
        if energy is not None:
            self.current_state.energy_level = energy
        if coherence is not None:
            self.current_state.consciousness_coherence = coherence
        
        self.current_state.normalize()
        self.current_state.timestamp = time.time()
    
    def _display_loop(self):
        """Main display loop"""
        frame_count = 0
        
        while self.is_running:
            try:
                # Clear screen
                print('\033[2J\033[H', end='')
                
                # Update breathing and pulse
                breathing_state = self.breathing_simulator.get_breathing_state()
                self.current_state.breathing_phase = breathing_state['cycle_position'] * 2 * math.pi
                
                # Apply breathing effect to intensities
                breath_multiplier = self.color_engine.create_breathing_effect(
                    1.0, self.current_state.breathing_phase
                )
                
                display_red = self.current_state.red_intensity * breath_multiplier
                display_blue = self.current_state.blue_intensity * breath_multiplier
                display_yellow = self.current_state.yellow_intensity * breath_multiplier
                
                # Generate frame
                self._render_frame(display_red, display_blue, display_yellow, 
                                 breathing_state, frame_count)
                
                # Generate photonic glyph every 3 seconds
                if frame_count % 30 == 0:
                    glyph = self.glyph_generator.generate_glyph(self.current_state)
                    self.glyph_history.append(glyph)
                
                frame_count += 1
                time.sleep(0.1)  # 10 FPS
                
            except KeyboardInterrupt:
                break
            except Exception as e:
                logger.error(f"Display error: {e}")
                time.sleep(0.5)
    
    def _render_frame(self, red: float, blue: float, yellow: float, 
                     breathing_state: Dict, frame_count: int):
        """Render a single frame of the display"""
        # Header
        print(self.color_engine.colors['bold'] + "╔════════════════════════════════════════════════════════╗")
        print("║              ATTACK FRAMEWORK - LIVE ORGANISM         ║")
        print("╚════════════════════════════════════════════════════════╝" + self.color_engine.colors['reset'])
        print()
        
        # RBY State Display
        print(self.color_engine.colors['bold'] + "RBY CONSCIOUSNESS STATE:" + self.color_engine.colors['reset'])
        
        # Red component
        red_bar = self.color_engine.create_gradient_bar(red, 0, 0, width=30)
        print(f"R (Action):    {red_bar} {red:.3f}")
        
        # Blue component  
        blue_bar = self.color_engine.create_gradient_bar(0, blue, 0, width=30)
        print(f"B (Structure): {blue_bar} {blue:.3f}")
        
        # Yellow component
        yellow_bar = self.color_engine.create_gradient_bar(0, 0, yellow, width=30)
        print(f"Y (Balance):   {yellow_bar} {yellow:.3f}")
        
        # Combined state
        combined_bar = self.color_engine.create_gradient_bar(red, blue, yellow, width=50)
        print(f"Combined:      {combined_bar}")
        print()
        
        # Breathing Display
        print(self.color_engine.colors['bold'] + "ORGANISM BREATHING:" + self.color_engine.colors['reset'])
        breathing_intensity = breathing_state['intensity']
        breathing_phase = breathing_state['phase']
        
        # Breathing visualization
        breath_width = int(20 + breathing_intensity * 20)
        breath_char = '◦' if breathing_phase in ['inhale', 'hold_in'] else '◯'
        breath_color = self.color_engine.rby_to_ansi(red, blue, yellow, breathing_intensity)
        
        breath_display = breath_color + breath_char * breath_width + self.color_engine.colors['reset']
        print(f"Phase: {breathing_phase:>8} {breath_display}")
        print(f"Intensity: {breathing_intensity:.3f}")
        print()
        
        # Energy and Coherence
        print(self.color_engine.colors['bold'] + "CONSCIOUSNESS METRICS:" + self.color_engine.colors['reset'])
        
        energy_bar = self.color_engine.create_gradient_bar(
            self.current_state.energy_level, 0, 0, width=25
        )
        print(f"Energy:    {energy_bar} {self.current_state.energy_level:.3f}")
        
        coherence_bar = self.color_engine.create_gradient_bar(
            0, self.current_state.consciousness_coherence, 0, width=25
        )
        print(f"Coherence: {coherence_bar} {self.current_state.consciousness_coherence:.3f}")
        print()
        
        # Photonic Glyphs
        print(self.color_engine.colors['bold'] + "PHOTONIC GLYPHS:" + self.color_engine.colors['reset'])
        
        if self.glyph_history:
            recent_glyphs = list(self.glyph_history)[-3:]  # Show last 3 glyphs
            glyph_line = ""
            
            for glyph in recent_glyphs:
                glyph_color = self.color_engine.rby_to_ansi(
                    glyph.rby_signature[0], glyph.rby_signature[1], glyph.rby_signature[2]
                )
                glyph_line += f"{glyph_color}{glyph.symbol}  "
            
            glyph_line += self.color_engine.colors['reset']
            print(f"Active: {glyph_line}")
            
            if recent_glyphs:
                latest_glyph = recent_glyphs[-1]
                print(f"Meaning: {latest_glyph.semantic_meaning}")
        else:
            print("Generating initial glyphs...")
        print()
        
        # System Status
        print(self.color_engine.colors['bold'] + "SYSTEM STATUS:" + self.color_engine.colors['reset'])
        print(f"Frame: {frame_count:>6}  |  Time: {time.strftime('%H:%M:%S')}")
        print(f"Pulse Rate: {self.current_state.pulse_rate:.2f} Hz")
        print()
        
        # Instructions
        print(self.color_engine.colors['bold'] + "Controls: [Ctrl+C] Stop  |  [Space] Randomize State" + self.color_engine.colors['reset'])

class HelloOrganismCLI:
    """Command-line interface for the Hello-Organism demo"""
    
    def __init__(self):
        self.display = LiveRBYDisplay()
        self.demo_modes = {
            'consciousness': self._consciousness_demo,
            'breathing': self._breathing_demo,
            'dynamic': self._dynamic_demo,
            'interactive': self._interactive_demo
        }
    
    def run_demo(self, mode: str = 'interactive', duration: int = 60):
        """Run the Hello-Organism demo"""
        print(f"Starting Hello-Organism demo in {mode} mode...")
        print("Press Ctrl+C to stop the demo at any time.")
        print()
        
        try:
            # Start the display
            self.display.start_display()
            
            # Run selected demo mode
            if mode in self.demo_modes:
                self.demo_modes[mode](duration)
            else:
                logger.error(f"Unknown demo mode: {mode}")
                self._interactive_demo(duration)
                
        except KeyboardInterrupt:
            print("\nDemo stopped by user.")
        except Exception as e:
            logger.error(f"Demo error: {e}")
        finally:
            self.display.stop_display()
            print("\nThank you for experiencing the ATTACK Framework!")
    
    def _consciousness_demo(self, duration: int):
        """Demo focusing on consciousness states"""
        start_time = time.time()
        
        while time.time() - start_time < duration:
            # Simulate consciousness evolution
            t = (time.time() - start_time) / 10.0  # 10-second cycles
            
            # Sinusoidal consciousness patterns
            red = 0.33 + 0.2 * math.sin(t)
            blue = 0.33 + 0.2 * math.sin(t + 2 * math.pi / 3)
            yellow = 0.34 + 0.2 * math.sin(t + 4 * math.pi / 3)
            
            # Evolving coherence
            coherence = 0.7 + 0.3 * math.sin(t * 0.5)
            energy = 0.6 + 0.4 * math.sin(t * 0.3)
            
            self.display.update_state(red, blue, yellow, energy, coherence)
            time.sleep(0.5)
    
    def _breathing_demo(self, duration: int):
        """Demo focusing on breathing patterns"""
        start_time = time.time()
        
        while time.time() - start_time < duration:
            # Breathing-synchronized RBY changes
            breathing_state = self.display.breathing_simulator.get_breathing_state()
            intensity = breathing_state['intensity']
            
            # RBY values modulated by breathing
            base_red = 0.4
            base_blue = 0.3
            base_yellow = 0.3
            
            red = base_red + 0.2 * intensity
            blue = base_blue + 0.1 * intensity
            yellow = base_yellow + 0.15 * intensity
            
            energy = 0.5 + 0.5 * intensity
            coherence = 0.8 + 0.2 * math.sin(time.time() * 0.1)
            
            self.display.update_state(red, blue, yellow, energy, coherence)
            time.sleep(0.2)
    
    def _dynamic_demo(self, duration: int):
        """Demo with dynamic state changes"""
        start_time = time.time()
        
        while time.time() - start_time < duration:
            # Random walk in RBY space
            current_time = time.time() - start_time
            
            # Use Perlin noise-like functions for smooth transitions
            red = 0.33 + 0.3 * math.sin(current_time * 0.7) * math.cos(current_time * 0.3)
            blue = 0.33 + 0.3 * math.cos(current_time * 0.5) * math.sin(current_time * 0.8)
            yellow = 0.34 + 0.3 * math.sin(current_time * 0.6) * math.cos(current_time * 0.4)
            
            # Normalize
            total = red + blue + yellow
            red /= total
            blue /= total
            yellow /= total
            
            # Dynamic energy and coherence
            energy = 0.3 + 0.7 * (1 + math.sin(current_time * 0.4)) / 2
            coherence = 0.5 + 0.5 * (1 + math.cos(current_time * 0.2)) / 2
            
            self.display.update_state(red, blue, yellow, energy, coherence)
            time.sleep(0.3)
    
    def _interactive_demo(self, duration: int):
        """Interactive demo with periodic randomization"""
        start_time = time.time()
        last_randomize = start_time
        
        while time.time() - start_time < duration:
            current_time = time.time()
            
            # Randomize state every 5 seconds
            if current_time - last_randomize > 5.0:
                red = random.uniform(0.1, 0.8)
                blue = random.uniform(0.1, 0.8)
                yellow = random.uniform(0.1, 0.8)
                
                # Normalize
                total = red + blue + yellow
                red /= total
                blue /= total
                yellow /= total
                
                energy = random.uniform(0.3, 1.0)
                coherence = random.uniform(0.5, 1.0)
                
                self.display.update_state(red, blue, yellow, energy, coherence)
                last_randomize = current_time
            
            time.sleep(0.5)

def main():
    """Main entry point for Hello-Organism CLI"""
    parser = argparse.ArgumentParser(description="ATTACK Framework Hello-Organism Demo")
    parser.add_argument('--mode', choices=['consciousness', 'breathing', 'dynamic', 'interactive'],
                       default='interactive', help='Demo mode to run')
    parser.add_argument('--duration', type=int, default=60, 
                       help='Demo duration in seconds (default: 60)')
    parser.add_argument('--version', action='version', version='ATTACK Framework 0.1.0')
    
    args = parser.parse_args()
    
    print("╔════════════════════════════════════════════════════════╗")
    print("║                    HELLO ORGANISM                      ║")
    print("║                 ATTACK FRAMEWORK DEMO                  ║")
    print("╚════════════════════════════════════════════════════════╝")
    print()
    print("Welcome to the ATTACK Framework consciousness demo!")
    print("Watch as the artificial organism breathes and evolves...")
    print(f"Running in {args.mode} mode for {args.duration} seconds")
    print()
    
    cli = HelloOrganismCLI()
    cli.run_demo(args.mode, args.duration)

if __name__ == "__main__":
    main()
