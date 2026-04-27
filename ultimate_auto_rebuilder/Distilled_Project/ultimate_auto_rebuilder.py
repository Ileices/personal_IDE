#!/usr/bin/env python3
"""
Ultimate Unified Auto-Rebuilder - Launch Orchestrator
Distilled from 9 enhancement scripts with all features integrated.

This is the main orchestration script that coordinates all modules.
Features harvested from all source scripts:
- RBY Intelligence Core (Red-Blue-Yellow classification)
- Recursive Intelligence (3, 9, 27 expansion pattern)
- 24/7 Continuous Processing
- Advanced Testing & Exploration
- Script Gathering & Collection
- Excretion/Reabsorption Learning
- Version Management with Quality Tracking
- Intelligent Import Resolution
- Namespace Conflict Resolution
- Module Clustering & Dependency Analysis
"""

import os
import sys
import json
import time
import threading
from pathlib import Path
from datetime import datetime

# Add all module paths
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'modules'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'utilities'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'init'))

class UltimateAutoRebuilder:
    """
    Ultimate Auto-Rebuilder that orchestrates all distilled capabilities
    """
    
    def __init__(self):
        self.base_dir = Path(__file__).parent
        self.config = self.load_configuration()
        self.initialize_system()
        
    def load_configuration(self):
        """Load or create master configuration"""
        config_file = self.base_dir / "config.json"
        default_config = {
            "version": "1.0.0-ultimate",
            "mode": "interactive",  # interactive, continuous, batch
            "source_folder": "ToBuild",
            "output_folder": "rebuilt_project",
            "enable_rby_intelligence": True,
            "enable_recursive_expansion": True,
            "enable_24_7_processing": False,
            "enable_excretion_system": True,
            "enable_version_management": True,
            "max_parallel_processes": 8,
            "intelligence_thresholds": {
                "tier_1_expansion": 3,
                "tier_2_expansion": 9,
                "tier_3_expansion": 27
            },
            "rby_weights": {
                "Red": {"Blue": 0.33, "Yellow": 0.33, "Self": 0.34},
                "Blue": {"Red": 0.33, "Yellow": 0.33, "Self": 0.34},
                "Yellow": {"Red": 0.33, "Blue": 0.33, "Self": 0.34}
            }
        }
        
        if config_file.exists():
            with open(config_file, 'r') as f:
                config = json.load(f)
                # Merge with defaults for any missing keys
                for key, value in default_config.items():
                    config.setdefault(key, value)
        else:
            config = default_config
            with open(config_file, 'w') as f:
                json.dump(config, f, indent=2)
                
        return config
    
    def initialize_system(self):
        """Initialize all system components"""
        print("🚀 Initializing Ultimate Auto-Rebuilder...")
        
        # Initialize core directories
        self.setup_directory_structure()
        
        # Load modules dynamically
        self.load_modules()
        
        print("✅ System initialization complete!")
    
    def setup_directory_structure(self):
        """Setup all required directories"""
        dirs_to_create = [
            "AIOS_IO/Excretions/Red_ML",
            "AIOS_IO/Excretions/Blue_ML", 
            "AIOS_IO/Excretions/Yellow_ML",
            "versions",
            "sandbox",
            "logs",
            "ScriptsFound",
            "rebuilt_project"
        ]
        
        for dir_path in dirs_to_create:
            full_path = self.base_dir / dir_path
            full_path.mkdir(parents=True, exist_ok=True)
    
    def load_modules(self):
        """Dynamically load all feature modules"""
        self.modules = {}
        modules_to_load = [
            ('rby_intelligence_core', 'RBYIntelligenceCore', 'rby'),
            ('recursive_intelligence', 'RecursiveIntelligenceEngine', 'recursive'),
            ('code_processor', 'CodeProcessor', 'processor'),
            ('testing_system', 'TestingSystem', 'testing'),
            ('script_gatherer', 'ScriptGatherer', 'gatherer'),
            ('version_manager', 'VersionManager', 'versions')
        ]
        
        loaded_count = 0
        for module_name, class_name, key in modules_to_load:
            try:
                module = __import__(module_name)
                cls = getattr(module, class_name)
                self.modules[key] = cls(self.config)
                loaded_count += 1
            except ImportError:
                print(f"⚠️  Module '{module_name}' not found - will create placeholder")
            except Exception as e:
                print(f"⚠️  Error loading '{module_name}': {e}")
        
        print(f"📦 Loaded {loaded_count}/{len(modules_to_load)} feature modules")
        
        if loaded_count < len(modules_to_load):
            print("Creating placeholder modules...")
            self.create_placeholder_modules()
    
    def create_placeholder_modules(self):
        """Create placeholder modules if they don't exist yet"""
        print("🔧 Creating module placeholders...")
        # This will be handled by the module creation process
        pass
    
    def run_interactive_mode(self):
        """Run in interactive mode with menu system"""
        while True:
            self.show_main_menu()
            choice = input("\nEnter your choice (1-9): ").strip()
            
            if choice == '1':
                self.run_code_rebuilding()
            elif choice == '2':
                self.run_script_gathering()
            elif choice == '3':
                self.run_testing_suite()
            elif choice == '4':
                self.manage_versions()
            elif choice == '5':
                self.show_intelligence_status()
            elif choice == '6':
                self.configure_system()
            elif choice == '7':
                self.toggle_continuous_mode()
            elif choice == '8':
                self.show_system_status()
            elif choice == '9':
                print("👋 Goodbye!")
                break
            else:
                print("❌ Invalid choice. Please try again.")
    
    def show_main_menu(self):
        """Display the main menu"""
        print("\n" + "="*60)
        print("🔥 ULTIMATE AUTO-REBUILDER - DISTILLED EDITION 🔥")
        print("="*60)
        print("1. 🏗️  Run Code Rebuilding")
        print("2. 📜 Gather Scripts")
        print("3. 🧪 Run Testing Suite")
        print("4. 📚 Manage Versions")
        print("5. 🧠 Intelligence Status")
        print("6. ⚙️  Configure System")
        print("7. ⏰ Toggle 24/7 Mode")
        print("8. 📊 System Status")
        print("9. 🚪 Exit")
        print("="*60)
    
    def run_code_rebuilding(self):
        """Run the main code rebuilding process"""
        print("\n🏗️  Starting Code Rebuilding Process...")
        
        if 'processor' in self.modules:
            self.modules['processor'].process_codebase()
        else:
            print("⚠️  Code processor module not available")
    
    def run_script_gathering(self):
        """Run script gathering process"""
        print("\n📜 Starting Script Gathering...")
        
        if 'gatherer' in self.modules:
            self.modules['gatherer'].gather_scripts()
        else:
            print("⚠️  Script gatherer module not available")
    
    def run_testing_suite(self):
        """Run comprehensive testing"""
        print("\n🧪 Starting Testing Suite...")
        
        if 'testing' in self.modules:
            self.modules['testing'].run_comprehensive_tests()
        else:
            print("⚠️  Testing system module not available")
    
    def manage_versions(self):
        """Manage version history"""
        print("\n📚 Version Management...")
        
        if 'versions' in self.modules:
            self.modules['versions'].show_version_menu()
        else:
            print("⚠️  Version manager module not available")
    
    def show_intelligence_status(self):
        """Show RBY intelligence status"""
        print("\n🧠 Intelligence System Status...")
        
        if 'rby' in self.modules:
            self.modules['rby'].show_status()
        else:
            print("⚠️  RBY intelligence module not available")    
    def configure_system(self):
        """Configure system settings"""
        print("\n⚙️  System Configuration...")
        # Implementation will be added
        pass
    
    def toggle_continuous_mode(self):
        """Toggle 24/7 continuous circular rebuild mode"""
        current_state = self.config.get('enable_24_7_processing', False)
        
        if not current_state:
            # Starting 24/7 mode
            print("🚀 Starting 24/7 Circular Rebuild Mode...")
            
            # Ask for configuration
            max_cycles = input("Max cycles (Enter for infinite): ").strip()
            max_cycles = int(max_cycles) if max_cycles.isdigit() else None
            
            threshold = input("Completion threshold % (default 60): ").strip()
            threshold = float(threshold) if threshold else 60.0
            
            delay = input("Delay between cycles in seconds (default 30): ").strip()
            delay = int(delay) if delay.isdigit() else 30
            
            self.start_continuous_processing(max_cycles, threshold, delay)
            self.config['enable_24_7_processing'] = True
        else:
            # Stopping 24/7 mode
            print("🛑 Stopping 24/7 Circular Rebuild Mode...")
            self.stop_continuous_processing()
            self.config['enable_24_7_processing'] = False
    
    def start_continuous_processing(self, max_cycles=None, threshold=60.0, delay=30):
        """Start continuous circular rebuild processing"""
        if not hasattr(self, 'circular_manager'):
            from modules.circular_build_manager import CircularBuildManager
            # Get the code processor from modules
            code_processor = self.modules.get('processor') if 'processor' in self.modules else None
            if not code_processor:
                print("❌ Code processor not available for circular builds")
                return
            
            self.circular_manager = CircularBuildManager(
                str(Path(__file__).parent), 
                code_processor
            )
            self.circular_manager.completion_threshold = threshold
            self.circular_manager.cycle_delay = delay
        
        self.circular_manager.start_circular_mode(max_cycles)
        print("✅ 24/7 Circular Rebuild Mode STARTED")
        print("   Press Ctrl+C during any menu to stop gracefully")
    
    def stop_continuous_processing(self):
        """Stop continuous circular rebuild processing"""
        if hasattr(self, 'circular_manager'):
            self.circular_manager.stop_circular_mode()
            print("✅ 24/7 Circular Rebuild Mode STOPPED")
        else:
            print("⚠️ Circular rebuild mode was not running")
    
    def show_system_status(self):
        """Show comprehensive system status"""
        print("\n📊 System Status:")
        print(f"   Version: {self.config['version']}")
        print(f"   Mode: {self.config['mode']}")
        print(f"   RBY Intelligence: {'✅' if self.config['enable_rby_intelligence'] else '❌'}")
        print(f"   Recursive Expansion: {'✅' if self.config['enable_recursive_expansion'] else '❌'}")
        print(f"   24/7 Processing: {'✅' if self.config['enable_24_7_processing'] else '❌'}")
        print(f"   Loaded Modules: {len(self.modules)}")
        
        # Show circular build status if available
        if hasattr(self, 'circular_manager'):
            status = self.circular_manager.get_status()
            print(f"\n🔄 Circular Build Status:")
            print(f"   Running: {'✅' if status['is_running'] else '❌'}")
            print(f"   Current Cycle: {status['current_cycle']}")
            print(f"   Progress: {status['progress']:.1f}%")
            print(f"   Current Build: {status.get('current_build', 'None')}")
            print(f"   Total Cycles: {status['stats']['total_cycles']}")
            print(f"   Successful: {status['stats']['successful_builds']}")
            print(f"   Failed: {status['stats']['failed_builds']}")
            print(f"   Deleted Incomplete: {status['stats']['deleted_incomplete']}")
        
        for module_name, module in self.modules.items():
            print(f"     - {module_name}: ✅")
    
    def run(self):
        """Main entry point"""
        mode = self.config.get('mode', 'interactive')
        
        if mode == 'interactive':
            self.run_interactive_mode()
        elif mode == 'continuous':
            self.start_continuous_processing()
        elif mode == 'batch':
            self.run_batch_mode()
        else:
            print(f"❌ Unknown mode: {mode}")

def main():
    """Main entry point"""
    try:
        rebuilder = UltimateAutoRebuilder()
        rebuilder.run()
    except KeyboardInterrupt:
        print("\n👋 Interrupted by user. Goodbye!")
    except Exception as e:
        print(f"❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
