"""
System Initializer
Ultimate Auto-Rebuilder System Initialization

This module handles system startup, environment setup, and component initialization.
"""

import os
import sys
import json
import time
from pathlib import Path
from datetime import datetime


class SystemInitializer:
    """
    Handles system initialization and environment setup
    """
    
    def __init__(self, base_dir):
        self.base_dir = Path(base_dir)
        self.initialization_log = []
        self.start_time = time.time()
        
    def initialize_system(self):
        """
        Initialize the complete Ultimate Auto-Rebuilder system
        """
        print("🚀 Initializing Ultimate Auto-Rebuilder System...")
        
        try:
            # Step 1: Check system requirements
            self.check_system_requirements()
            
            # Step 2: Create directory structure
            self.create_directory_structure()
            
            # Step 3: Initialize configuration
            self.initialize_configuration()
            
            # Step 4: Setup logging
            self.setup_logging_system()
            
            # Step 5: Validate environment
            self.validate_environment()
            
            # Step 6: Initialize modules
            self.initialize_modules()
            
            # Step 7: Create initialization report
            self.create_initialization_report()
            
            duration = time.time() - self.start_time
            print(f"✅ System initialization completed in {duration:.2f} seconds")
            
            return True
            
        except Exception as e:
            print(f"❌ System initialization failed: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def check_system_requirements(self):
        """
        Check system requirements
        """
        print("🔍 Checking system requirements...")
        
        # Check Python version
        python_version = sys.version_info
        if python_version.major < 3 or (python_version.major == 3 and python_version.minor < 7):
            raise Exception(f"Python 3.7+ required, found {python_version.major}.{python_version.minor}")
        
        self.log_step("✅ Python version check passed")
        
        # Check required modules
        required_modules = ['json', 'pathlib', 'threading', 'multiprocessing', 'ast', 'importlib']
        missing_modules = []
        
        for module in required_modules:
            try:
                __import__(module)
            except ImportError:
                missing_modules.append(module)
        
        if missing_modules:
            raise Exception(f"Missing required modules: {missing_modules}")
        
        self.log_step("✅ Required modules check passed")
        
        # Check optional modules
        optional_modules = ['numpy', 'sklearn', 'psutil']
        available_optional = []
        
        for module in optional_modules:
            try:
                __import__(module)
                available_optional.append(module)
            except ImportError:
                pass
        
        if available_optional:
            self.log_step(f"📦 Optional modules available: {available_optional}")
        else:
            self.log_step("⚠️  No optional modules found (functionality will be limited)")
        
        # Check disk space
        try:
            import shutil
            total, used, free = shutil.disk_usage(self.base_dir)
            free_gb = free / (1024**3)
            
            if free_gb < 1:
                raise Exception(f"Insufficient disk space: {free_gb:.1f}GB available, 1GB+ recommended")
            
            self.log_step(f"✅ Disk space check passed ({free_gb:.1f}GB available)")
            
        except Exception as e:
            self.log_step(f"⚠️  Could not check disk space: {e}")
    
    def create_directory_structure(self):
        """
        Create the required directory structure
        """
        print("📁 Creating directory structure...")
        
        directories = [
            "AIOS_IO/Excretions/Red_ML",
            "AIOS_IO/Excretions/Blue_ML",
            "AIOS_IO/Excretions/Yellow_ML",
            "versions",
            "sandbox", 
            "logs",
            "ScriptsFound",
            "rebuilt_project",
            "ToBuild"
        ]
        
        created_count = 0
        
        for directory in directories:
            dir_path = self.base_dir / directory
            try:
                dir_path.mkdir(parents=True, exist_ok=True)
                created_count += 1
            except Exception as e:
                self.log_step(f"⚠️  Could not create {directory}: {e}")
        
        self.log_step(f"✅ Created {created_count}/{len(directories)} directories")
    
    def initialize_configuration(self):
        """
        Initialize system configuration
        """
        print("⚙️  Initializing configuration...")
        
        config_file = self.base_dir / "config.json"
        
        default_config = {
            "version": "1.0.0-ultimate",
            "initialized": datetime.now().isoformat(),
            "mode": "interactive",
            "source_folder": "ToBuild", 
            "output_folder": "rebuilt_project",
            "enable_rby_intelligence": True,
            "enable_recursive_expansion": True,
            "enable_24_7_processing": False,
            "enable_excretion_system": True,
            "enable_version_management": True,
            "max_parallel_processes": min(os.cpu_count() or 4, 8),
            "intelligence_thresholds": {
                "tier_1_expansion": 3,
                "tier_2_expansion": 9,
                "tier_3_expansion": 27
            },
            "rby_weights": {
                "Red": {"Blue": 0.33, "Yellow": 0.33, "Self": 0.34},
                "Blue": {"Red": 0.33, "Yellow": 0.33, "Self": 0.34},
                "Yellow": {"Red": 0.33, "Blue": 0.33, "Self": 0.34}
            },
            "processing_limits": {
                "max_file_size_mb": 50,
                "max_files_to_process": 100000,
                "execution_timeout": 5
            },
            "logging": {
                "level": "INFO",
                "file_logging": True,
                "console_logging": True
            }
        }
        
        try:
            if config_file.exists():
                # Load existing config and merge with defaults
                with open(config_file, 'r') as f:
                    existing_config = json.load(f)
                
                # Update with any new default values
                for key, value in default_config.items():
                    existing_config.setdefault(key, value)
                
                config = existing_config
            else:
                config = default_config
            
            # Save configuration
            with open(config_file, 'w') as f:
                json.dump(config, f, indent=2)
            
            self.log_step("✅ Configuration initialized")
            
        except Exception as e:
            self.log_step(f"⚠️  Configuration initialization failed: {e}")
            raise
    
    def setup_logging_system(self):
        """
        Setup the logging system
        """
        print("📝 Setting up logging system...")
        
        try:
            logs_dir = self.base_dir / "logs"
            logs_dir.mkdir(exist_ok=True)
            
            # Create log files
            log_files = [
                "system.log",
                "rby_intelligence.log", 
                "recursive_intelligence.log",
                "code_processor.log",
                "testing_system.log",
                "script_gatherer.log",
                "version_manager.log"
            ]
            
            for log_file in log_files:
                log_path = logs_dir / log_file
                if not log_path.exists():
                    log_path.touch()
            
            self.log_step(f"✅ Logging system setup ({len(log_files)} log files)")
            
        except Exception as e:
            self.log_step(f"⚠️  Logging setup failed: {e}")
    
    def validate_environment(self):
        """
        Validate the environment is ready
        """
        print("🔬 Validating environment...")
        
        validations = []
        
        # Check if modules directory exists and has content
        modules_dir = self.base_dir / "modules"
        if modules_dir.exists() and any(modules_dir.iterdir()):
            validations.append("✅ Modules directory found")
        else:
            validations.append("⚠️  Modules directory empty or missing")
        
        # Check if utilities directory exists
        utilities_dir = self.base_dir / "utilities"
        if utilities_dir.exists() and any(utilities_dir.iterdir()):
            validations.append("✅ Utilities directory found")
        else:
            validations.append("⚠️  Utilities directory empty or missing")
        
        # Check if main script exists
        main_script = self.base_dir / "ultimate_auto_rebuilder.py"
        if main_script.exists():
            validations.append("✅ Main script found")
        else:
            validations.append("⚠️  Main script missing")
        
        # Check ToBuild directory
        tobuild_dir = self.base_dir / "ToBuild"
        if tobuild_dir.exists():
            py_files = list(tobuild_dir.rglob("*.py"))
            if py_files:
                validations.append(f"✅ ToBuild directory has {len(py_files)} Python files")
            else:
                validations.append("⚠️  ToBuild directory is empty")
        else:
            validations.append("⚠️  ToBuild directory missing")
        
        for validation in validations:
            self.log_step(validation)
    
    def initialize_modules(self):
        """
        Initialize system modules
        """
        print("🧩 Initializing modules...")
        
        try:
            # Add modules to path
            modules_path = self.base_dir / "modules"
            if str(modules_path) not in sys.path:
                sys.path.insert(0, str(modules_path))
            
            # Add utilities to path
            utilities_path = self.base_dir / "utilities"
            if str(utilities_path) not in sys.path:
                sys.path.insert(0, str(utilities_path))
            
            # Test module imports
            modules_to_test = [
                "rby_intelligence_core",
                "recursive_intelligence", 
                "code_processor",
                "testing_system",
                "script_gatherer",
                "version_manager"
            ]
            
            successful_imports = 0
            
            for module_name in modules_to_test:
                try:
                    __import__(module_name)
                    successful_imports += 1
                    self.log_step(f"✅ Module {module_name} imported successfully")
                except ImportError as e:
                    self.log_step(f"⚠️  Module {module_name} import failed: {e}")
                except Exception as e:
                    self.log_step(f"❌ Module {module_name} error: {e}")
            
            self.log_step(f"📊 Module initialization: {successful_imports}/{len(modules_to_test)} successful")
            
        except Exception as e:
            self.log_step(f"❌ Module initialization failed: {e}")
    
    def create_initialization_report(self):
        """
        Create an initialization report
        """
        report_file = self.base_dir / "logs" / "initialization_report.txt"
        
        duration = time.time() - self.start_time
        
        report_content = f"""
=== ULTIMATE AUTO-REBUILDER INITIALIZATION REPORT ===
Generated: {datetime.now().isoformat()}
Duration: {duration:.2f} seconds

INITIALIZATION STEPS:
"""
        
        for i, step in enumerate(self.initialization_log, 1):
            report_content += f"{i:2d}. {step}\n"
        
        report_content += f"""
SYSTEM SUMMARY:
- Base Directory: {self.base_dir}
- Python Version: {sys.version}
- Platform: {sys.platform}
- Total Steps: {len(self.initialization_log)}

STATUS: {'SUCCESS' if not any('❌' in step for step in self.initialization_log) else 'WITH WARNINGS'}
"""
        
        try:
            with open(report_file, 'w', encoding='utf-8') as f:
                f.write(report_content)
            
            print(f"📄 Initialization report saved: {report_file}")
            
        except Exception as e:
            print(f"⚠️  Could not save initialization report: {e}")
    
    def log_step(self, message):
        """
        Log an initialization step
        """
        timestamp = datetime.now().strftime("%H:%M:%S")
        log_message = f"[{timestamp}] {message}"
        self.initialization_log.append(log_message)
        print(f"   {message}")


def initialize_ultimate_auto_rebuilder(base_dir):
    """
    Main initialization function
    """
    initializer = SystemInitializer(base_dir)
    return initializer.initialize_system()


if __name__ == "__main__":
    # Can be run standalone for initialization
    base_dir = Path(__file__).parent.parent
    success = initialize_ultimate_auto_rebuilder(base_dir)
    
    if success:
        print("\n🎉 Ultimate Auto-Rebuilder is ready to use!")
        print("Run 'python ultimate_auto_rebuilder.py' to start the system.")
    else:
        print("\n❌ Initialization failed. Please check the logs for details.")
        sys.exit(1)
