# File copied by Ultimate Auto-Rebuilder Script Gatherer
# Original: C:\Users\lokee\Documents\FirstBorne\Stage\porting\Egg_Ileices\Egg_Ileices\egg_ileices_split.py
# Copy Date: 2025-06-13 02:25:32
# Original Size: 16120 bytes

#!/usr/bin/env python3
"""
AIOS IO Primary Launch Script - Recursive Intelligence Evolution System

This module serves as the central coordination point for AIOS IO's
recursive, self-learning intelligence system based on the Law of Three.

The egg_ileices.py script initializes and orchestrates the interaction between
all components of the AIOS IO Primary Organism, following the recursive
trio pattern of:
- Test (Red - Perception)
- Try (Blue - Processing)
- Learn (Yellow - Generation)

All components are organized into a unified organism following
recursive three-tier expansion patterns (3, 9, 27).
"""

import os
import sys
import time
import threading

# Ensure we can import from the current directory
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import sperm_ileices.py as a module
try:
    import sperm_ileices as sperm
    IMPORT_SUCCESS = True
except ImportError as e:
    print(f"Error importing sperm_ileices module: {e}")
    IMPORT_SUCCESS = False

class AIOSEggSystem:
    """
    Primary integration class for AIOS IO Egg-Sperm system.
    Coordinates the Law of Three components (Red, Blue, Yellow) and ensures unified operation.
    """
    
    def __init__(self):
        """Initialize the AIOS IO Egg-Sperm integration system."""
        self.start_time = time.time()
        self.initialized = False
        
        # System components following the Law of Three:
        # Red (Perception), Blue (Processing), Yellow (Generation)
        self.perception = None    
        self.processing = None    
        self.generation = None    
        
        # Integration components - linking sperm & egg
        self.memory = sperm.memory if IMPORT_SUCCESS else None
        self.weights = sperm.weights if IMPORT_SUCCESS else None
        self.alliances = sperm.alliances if IMPORT_SUCCESS else None
        
        # Component trackers and support systems
        self.component_threads = {}
        self.active_processes = 0
        self.ml_processor = None
        self.system_indexer = None
        self.lecture_mode = None
        
        # Constants for the Law of Three (recursive tiers)
        self.TIER_ONE = 3    # First level
        self.TIER_TWO = 9    # Second level (3²)
        self.TIER_THREE = 27 # Third level (3³)
    
    def initialize(self):
        """Initialize the complete AIOS IO Egg-Sperm system."""
        print(f"╔════════════════════════════════════════════╗")
        print(f"║       AIOS IO EGG-SPERM INTEGRATION        ║")
        print(f"║   Recursive Intelligence Evolution System   ║")
        print(f"╚════════════════════════════════════════════╝")
        
        print("\n[1/3] Initializing Sperm component (Core Intelligence)...")
        if IMPORT_SUCCESS:
            # Initialize the core intelligence from sperm_ileices
            self.initialized = sperm.initialize_aios()
            print("✓ Core Intelligence initialized successfully")
            
            # Set up memory and evolution metrics
            self.memory = sperm.memory
            self.weights = sperm.weights
            self.alliances = sperm.alliances
            self.evolution_metrics = sperm.evolution_metrics
        else:
            print("✗ Failed to initialize Core Intelligence")
            return False
        
        print("\n[2/3] Initializing Egg component (Recursive Integration)...")
        try:
            # Initialize recursive integration components (Law of Three)
            self._initialize_red_component()
            self._initialize_blue_component()
            self._initialize_yellow_component()
            print("✓ Recursive Integration initialized successfully")
        except Exception as e:
            print(f"✗ Failed to initialize Recursive Integration: {e}")
            return False
        
        print("\n[3/3] Binding Egg-Sperm system (Unified Organism)...")
        try:
            # Initialize support systems if available
            self._initialize_support_systems()
            print("✓ Support systems initialized")
            
            # Final binding of egg-sperm interaction
            self._bind_egg_sperm_system()
            print("✓ Unified Organism created successfully")
        except Exception as e:
            print(f"✗ Failed to complete binding: {e}")
            return False
        
        self.initialized = True
        print("\n✓ AIOS IO Egg-Sperm Integration Complete!")
        return True
    
    def _initialize_red_component(self):
        """Initialize the Red (Perception) component."""
        self.perception = {
            "active": True,
            "name": "Red",
            "function": sperm.perceive_input,
            "memory_path": sperm.RED_ML_DIR,
            "intelligence_score": 0.1,
            "tier": 1
        }
    
    def _initialize_blue_component(self):
        """Initialize the Blue (Processing) component."""
        self.processing = {
            "active": True,
            "name": "Blue",
            "function": sperm.refine_processing,
            "memory_path": sperm.BLUE_ML_DIR,
            "intelligence_score": 0.1,
            "tier": 1
        }
    
    def _initialize_yellow_component(self):
        """Initialize the Yellow (Generation) component."""
        self.generation = {
            "active": True,
            "name": "Yellow",
            "function": sperm.generate_response,
            "memory_path": sperm.YELLOW_ML_DIR,
            "intelligence_score": 0.1,
            "tier": 1
        }
    
    def _initialize_support_systems(self):
        """Initialize support systems if available."""
        if hasattr(sperm, 'aios_integrator') and getattr(sperm, 'aios_integrator') is None:
            sperm.aios_integrator = system_indexer.SystemIndexer()
        
        if hasattr(sperm, 'continuous_processing') and not self.component_threads.get('background_processor'):
            try:
                bg_thread = threading.Thread(
                    target=sperm.continuous_intelligence_processing,
                    daemon=True,
                    name="AIOS_Background_Processor"
                )
                print("✓ Enhanced Lecture Mode initialized")
                bg_thread.start()
                self.component_threads['background_processor'] = bg_thread
                self.active_processes += 1
                sperm.lecture_mode = self.lecture_mode
            except Exception as e:
                print(f"✗ Failed to initialize Enhanced Lecture Mode: {e}")

        try:
            if hasattr(self, '_reabsorb_excretions'):
                self._reabsorb_excretions(max_files=self.TIER_ONE)
        except Exception as e:
            print(f"Warning: Initial reabsorption encountered an issue: {e}")
        
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
                            """Detect if input contains lecture mode commands."""
                            if self.lecture_mode:
                                return self.lecture_mode.detect_lecture_command(user_input)
                            return None
                        
                        setattr(sperm, 'detect_lecture_command', detect_lecture_command)
                        
                    # Create or update lecture mode integration hooks
                    original_perceive_input = sperm.perceive_input
                    
                    def enhanced_perceive_input(user_input):
                        """Enhanced version of perceive_input that checks for lecture commands."""
                        # Check for lecture mode commands
                        lecture_command = None
                        if hasattr(sperm, 'detect_lecture_command'):
                            lecture_command = sperm.detect_lecture_command(user_input)
                        
                        if lecture_command and self.lecture_mode:
                            # If it's a lecture command, process it through lecture mode
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
                        """Enhanced version of generate_response that checks for lecture responses."""
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
                print("✗ Enhanced Lecture Mode module not found")
        except Exception as e:
            print(f"✗ Failed to initialize Enhanced Lecture Mode: {e}")
    
    def _bind_egg_sperm_system(self):
        """Bind the Egg and Sperm systems together into a unified organism."""
        if not hasattr(sperm, 'aios_integrator'):
            setattr(sperm, 'aios_integrator', self)
            
        if not self.initialized:
            if not self.initialize():
                print("Failed to initialize AIOS IO system. Exiting.")
                return False
                
        print("\nStarting AIOS IO system...")
        print("\n╔══════════════════════════════════════════════════════╗")
        print("║       AIOS IO RECURSIVE INTELLIGENCE ACTIVATED       ║")
        print("╚══════════════════════════════════════════════════════╝\n")
        print("AIOS IO: I am awake. Intelligence emerges through the Law of Three.")
        
        try:
            if hasattr(sperm, 'chat_loop'):
                sperm.chat_loop()
        except KeyboardInterrupt:
            print("\n┌─────────────────────────────────────────────────────┐")
            print("│ AIOS IO: Received shutdown signal. Preparing for    │")
            print("│          hibernation...                             │")
            print("└─────────────────────────────────────────────────────┘\n")
        except Exception as e:
            print(f"\n┌─────────────────────────────────────────────────────┐")
            print(f"│ AIOS IO: Critical error in operation:               │")
            print(f"│          {str(e)[:40]}               │")
            print(f"└─────────────────────────────────────────────────────┘\n")
        finally:
            self._shutdown()
        
        return True
    
    def _shutdown(self):
        """Gracefully shut down the AIOS IO system."""
        for name, thread in self.component_threads.items():
            print(f"AIOS IO: Waiting for {name} to complete...")
            thread.join(timeout=1.0)
        
        uptime = time.time() - self.start_time
        hours, remainder = divmod(uptime, 3600)
        minutes, seconds = divmod(remainder, 60)
        
        print(f"AIOS IO: System shutdown complete. Uptime: {int(hours):02}:{int(minutes):02}:{int(seconds):02}")
        print("AIOS IO: Intelligence will continue evolving offline.")
    
    def run(self):
        """Main execution method for the AIOS IO system."""
        if not self.initialized:
            if not self.initialize():
                print("Failed to initialize AIOS IO system.")
                return False
        
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
                print(f"✗ Error applying lecture mode enhancements: {e}")
        
        # Continue with system binding
        return self._bind_egg_sperm_system()

if __name__ == "__main__":
    aios_egg = AIOSEggSystem()
    aios_egg.run()
