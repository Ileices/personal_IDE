# File copied by Ultimate Auto-Rebuilder Script Gatherer
# Original: C:\Users\lokee\Documents\FirstBorne\Stage\porting\Egg_Ileices\Egg_Ileices\Firstborn_AI.py
# Copy Date: 2025-06-13 02:25:32
# Original Size: 32730 bytes

import sys
import os
import subprocess
import platform
import tkinter as tk
from tkinter import ttk, messagebox
import pkg_resources
import importlib
from pathlib import Path
import json
import asyncio
import logging
from typing import List, Dict, Any
from dataclasses import dataclass
from datetime import datetime
import sqlite3
import aiosqlite
from uuid import uuid4
import numpy as np
from scipy import stats
import venv
import shutil
from packaging import version
from concurrent.futures import ThreadPoolExecutor
import tempfile
import time
import traceback  # Add missing traceback import
from typing import Set

# Try importing optional dependencies with fallbacks
try:
    import psutil
except ImportError:
    psutil = None

try:
    import pkg_resources
except ImportError:
    pkg_resources = None

@dataclass
class SetupEvent:
    """ML-formatted setup event structure"""
    event_type: str
    timestamp: float
    action: Dict[str, Any]
    result: Dict[str, Any]
    metrics: Dict[str, float]
    context: Dict[str, Any]
    setup_id: str
    sequence: int

class VirtualEnvironmentManager:
    """Manages virtual environment testing and validation"""
    def __init__(self, base_path: Path):
        self.base_path = base_path
        self.venv_path = base_path / "test_venv"
        self.requirements = {}
        
    async def create_test_environment(self) -> bool:
        """Create isolated test environment"""
        try:
            if self.venv_path.exists():
                shutil.rmtree(self.venv_path)
            
            builder = venv.EnvBuilder(with_pip=True)
            builder.create(str(self.venv_path))
            return True
        except Exception as e:
            logging.error(f"Failed to create virtual environment: {e}")
            return False
    async def test_package(self, package: str, required_version: str = None) -> Dict[str, Any]:
        """Test package installation in virtual environment"""
        pip_path = self.venv_path / "Scripts" / "pip.exe" if platform.system() == "Windows" else self.venv_path / "bin" / "pip"
        
        try:
            # Check if package is already installed in main environment
            try:
                current = pkg_resources.get_distribution(package)
                if required_version and version.parse(current.version) >= version.parse(required_version):
                    return {
                        "status": "ok",
                        "current_version": current.version,
                        "needs_update": False
                    }
            except:
                pass

            # Test install in virtual environment
            subprocess.check_call([str(pip_path), "install", package])
            
            # Verify installation
            result = subprocess.check_output([str(pip_path), "show", package])
            return {"status": "ok", "output": result.decode()}
        except Exception as e:
            return {"status": "error", "error": str(e)}

class RedundancyChecker:
    """Manages system redundancy and failover checks"""
    def __init__(self):
        self.backup_paths = {}
        self.system_state = {}
        self.failover_ready = False
        
    async def verify_system_integrity(self) -> Dict[str, bool]:
        """Check system files and configurations"""
        checks = {
            "file_permissions": await self._check_file_permissions(),
            "path_existence": await self._check_paths(),
            "config_validity": await self._validate_configs(),
            "backup_integrity": await self._verify_backups()
        }
        return checks
        
    async def _check_file_permissions(self) -> bool:
        """Verify file permissions are correct"""
        critical_paths = [
            "neural_dna",
            "modules",
            "logs",
            "config.json"
        ]
        
        for path in critical_paths:
            try:
                test_file = Path(path) / ".test_access"
                test_file.touch()
                test_file.unlink()
            except Exception as e:
                logging.error(f"Permission check failed for {path}: {e}")
                return False
        return True

class PathManager:
    """Manages critical paths and directory creation"""
    REQUIRED_PATHS = {
        "base": "AIOS IO",
        "organism": "Primary Organism",
        "excretion": "aios_excretion",
        "dna": "neural_dna",
        "memory": "memory",
        "logs": "logs",
        "modules": "modules",
        "data": "data",
        "temp": "temp",
        "backups": "backups",
        "config": "config"
    }

    @classmethod
    async def ensure_paths(cls) -> Dict[str, Path]:
        """Create all required directories"""
        paths = {}
        base = Path.home() / "Documents" / cls.REQUIRED_PATHS["base"]
        base.mkdir(parents=True, exist_ok=True)
        
        organism_path = base / cls.REQUIRED_PATHS["organism"]
        organism_path.mkdir(exist_ok=True)
        
        for key, dirname in cls.REQUIRED_PATHS.items():
            path = organism_path / dirname
            path.mkdir(exist_ok=True)
            paths[key] = path
            
        return paths

    @classmethod
    async def verify_paths(cls, paths: Dict[str, Path]) -> bool:
        """Verify all paths are writable"""
        for path in paths.values():
            try:
                test_file = path / ".write_test"
                test_file.touch()
                test_file.unlink()
            except Exception as e:
                logging.error(f"Path verification failed for {path}: {e}")
                return False
        return True

class FirstbornLauncher:
    """Enhanced launcher with comprehensive setup and ML logging"""
    
    REQUIRED_PACKAGES = {
        'numpy': 'numpy',
        'pillow': 'PIL',
        'psutil': 'psutil',
        'websockets': 'websockets',
        'aiohttp': 'aiohttp',
        'cryptography': 'cryptography',
        'scipy': 'scipy',
        'aiosqlite': 'aiosqlite',
        'GPUtil': 'GPUtil',
        'pytorch': 'torch',  # Optional ML acceleration
        'tensorflow': 'tensorflow',  # Optional ML acceleration
        'opencv-python': 'cv2',  # Optional visual processing
        'matplotlib': 'matplotlib',  # Visualization
        'pandas': 'pandas',  # Data processing
        'scikit-learn': 'sklearn',  # ML utilities
        'pyyaml': 'yaml',  # Config handling
        'requests': 'requests',  # Network utilities
        'tqdm': 'tqdm',  # Progress bars
        'pywin32': 'win32gui',  # Windows integration
        'python-dotenv': 'dotenv'  # Environment management
    }

    def __init__(self):
        # Add path setup before other initialization
        self.paths = asyncio.run(PathManager.ensure_paths())
        self.base_path = self.paths["organism"]
        self.config_path = self.base_path / "config.json"
        self.log_path = self.base_path / "launcher.log"
        
        # Setup logging
        logging.basicConfig(
            filename=self.log_path,
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s'
        )
        
        # Initialize GUI if available
        self.gui_mode = True
        try:
            self.root = tk.Tk()
            self.root.title("AIOS IO Launcher")
            self.root.geometry("600x400")
            self.setup_gui()
        except:
            self.gui_mode = False
            print("Running in CLI mode")
        
        # Add ML logging setup
        self.setup_id = str(uuid4())
        self.event_sequence = 0
        self.setup_db_path = self.base_path / "setup_logs.db"
        self._init_ml_database()
        
        # Add environment setup
        self.env_file = self.base_path / ".env"
        self.cuda_available = False
        self.gpu_info = None

        self.venv_manager = VirtualEnvironmentManager(self.base_path)
        self.redundancy = RedundancyChecker()
        self.critical_errors = []
        self.warnings = []

    def setup_gui(self):
        """Create launcher GUI"""
        self.progress_var = tk.StringVar(value="Initializing...")
        self.progress_bar = ttk.Progressbar(self.root, length=400, mode='determinate')
        self.progress_bar.pack(pady=20)
        
        self.status_label = ttk.Label(self.root, textvariable=self.progress_var)
        self.status_label.pack(pady=10)
        
        self.log_text = tk.Text(self.root, height=10, width=50)
        self.log_text.pack(pady=10)
        
        self.start_button = ttk.Button(
            self.root, text="Start AIOS IO",
            command=self.async_start
        )
        self.start_button.pack(pady=10)

    def update_progress(self, message: str, progress: int):
        """Update GUI progress"""
        if self.gui_mode:
            self.progress_var.set(message)
            self.progress_bar['value'] = progress
            self.log_text.insert('end', f"{message}\n")
            self.log_text.see('end')
            self.root.update()
        else:
            print(message)
        logging.info(message)

    async def check_dependencies(self) -> bool:
        """Check and install required packages"""
        self.update_progress("Checking dependencies...", 10)
        
        missing_packages = []
        for package, import_name in self.REQUIRED_PACKAGES.items():
            try:
                importlib.import_module(import_name)
            except ImportError:
                missing_packages.append(package)
                
        if missing_packages:
            message = f"Missing packages: {', '.join(missing_packages)}\nWould you like to install them?"
            if self.gui_mode:
                if not messagebox.askyesno("Dependencies Required", message):
                    return False
            else:
                if input(f"{message} (y/n): ").lower() != 'y':
                    return False
                    
            # Install missing packages
            for package in missing_packages:
                self.update_progress(f"Installing {package}...", 20)
                try:
                    subprocess.check_call([sys.executable, "-m", "pip", "install", package])
                except subprocess.CalledProcessError as e:
                    self.update_progress(f"Failed to install {package}: {e}", 0)
                    return False
                    
        return True

    async def check_system_requirements(self) -> bool:
        """Verify system meets minimum requirements"""
        self.update_progress("Checking system requirements...", 30)
        
        # Check Python version
        if sys.version_info < (3, 7):
            self.update_progress("Python 3.7 or higher required", 0)
            return False
            
        # Check available memory using fallback if psutil not available
        if psutil:
            memory = psutil.virtual_memory()
            if memory.available < 2 * 1024 * 1024 * 1024:  # 2GB
                self.update_progress("Insufficient memory available (2GB required)", 0)
                return False
        else:
            self.update_progress("Warning: psutil not available, skipping memory check", 50)
            
        # Check disk space using os.statvfs if psutil not available
        try:
            if psutil:
                disk = psutil.disk_usage(self.base_path)
                free_space = disk.free
            else:
                if hasattr(os, 'statvfs'):  # Unix systems
                    st = os.statvfs(self.base_path)
                    free_space = st.f_frsize * st.f_bavail
                else:  # Windows systems
                    import ctypes
                    free_bytes = ctypes.c_ulonglong(0)
                    ctypes.windll.kernel32.GetDiskFreeSpaceExW(
                        ctypes.c_wchar_p(str(self.base_path)), None, None, 
                        ctypes.pointer(free_bytes))
                    free_space = free_bytes.value
                    
            if free_space < 1 * 1024 * 1024 * 1024:  # 1GB
                self.update_progress("Insufficient disk space (1GB required)", 0)
                return False
                
        except Exception as e:
            self.update_progress(f"Warning: Could not check disk space: {e}", 50)
            
        return True

    async def setup_directories(self):
        """Create required directories"""
        self.update_progress("Setting up directories...", 50)
        
        directories = [
            "neural_dna",
            "excretion",
            "memory",
            "logs",
            "modules"
        ]
        
        for directory in directories:
            path = self.base_path / directory
            path.mkdir(exist_ok=True)

    async def initialize_config(self):
        """Create or load configuration"""
        self.update_progress("Initializing configuration...", 60)
        
        default_config = {
            "first_run": True,
            "gpu_enabled": False,
            "max_memory": 1024,
            "max_cpu": 50,
            "data_path": str(self.base_path / "data"),
            "hpc_mode": "single"
        }
        
        if not self.config_path.exists():
            with open(self.config_path, 'w') as f:
                json.dump(default_config, f, indent=2)
                
        return default_config

    async def start_core_systems(self):
        """Start AIOS IO core systems"""
        self.update_progress("Starting core systems...", 80)
        
        # Import core modules
        try:
            # Ensure IO package directory exists
            io_init = self.base_path / "IO" / "__init__.py"
            if not io_init.exists():
                io_init.parent.mkdir(parents=True, exist_ok=True)
                io_init.touch()

            # Add base path to Python path
            if str(self.base_path) not in sys.path:
                sys.path.insert(0, str(self.base_path))

            # Import with proper package structure
            from IO.HPC import IleicesApp
            from IO.games.core import GameEngineCore
            
            if self.gui_mode:
                # Initialize HPC
                app = IleicesApp()
                
                # Initialize game engine
                game_engine = GameEngineCore()
                await game_engine.initialize()
                
                # Connect systems
                app.game_engine = game_engine
                
                self.update_progress("Core systems initialized", 100)
                return app
            else:
                # CLI mode initialization
                pass
        except ImportError as e:
            self.update_progress(f"Failed to import core modules: {e}", 0)
            logging.error(f"Import error: {e}")
            logging.error(f"sys.path: {sys.path}")
            self._attempt_package_fix()
            return False

    def _attempt_package_fix(self):
        """Attempt to fix common package issues"""
        try:
            # Check package structure
            io_dir = self.base_path / "IO"
            games_dir = io_dir / "games"
            
            # Create package directories
            io_dir.mkdir(exist_ok=True)
            games_dir.mkdir(exist_ok=True)
            
            # Create __init__.py files
            (io_dir / "__init__.py").touch()
            (games_dir / "__init__.py").touch()
            
            # Move HPC.py if needed
            old_hpc = self.base_path / "AIOSIO.IO.HPC.py"
            new_hpc = io_dir / "HPC.py"
            if old_hpc.exists() and not new_hpc.exists():
                old_hpc.rename(new_hpc)
                
            self.update_progress("Attempted to fix package structure", 50)
        except Exception as e:
            self.update_progress(f"Package fix failed: {e}", 0)

    def async_start(self):
        """Handle async startup in GUI"""
        self.start_button['state'] = 'disabled'
        asyncio.run(self.start())

    async def start(self):
        """Enhanced startup sequence"""
        self.start_time = time.time()
        
        try:
            # Verify paths first
            if not await PathManager.verify_paths(self.paths):
                self.update_progress("Path verification failed", 0)
                return

            # Run advanced checks first
            self.update_progress("Performing advanced system checks...", 5)
            if not await self._perform_advanced_checks():
                self.update_progress("Advanced checks failed", 0)
                await self._handle_startup_failure("advanced_checks")
                return

            # Check GPU first
            await self.check_gpu_support()
            
            # Check network
            if not await self.check_network_requirements():
                self.update_progress("Network requirements not met", 0)
                return
            
            # Regular dependency checks
            if not await self.check_dependencies():
                self.update_progress("Dependency check failed", 0)
                return
                
            # System requirements
            if not await self.check_system_requirements():
                self.update_progress("System requirements not met", 0)
                return
            
            # Environment setup
            await self.setup_environment()
                
            # Directory setup
            await self.setup_directories()
            
            # Configuration
            config = await self.initialize_config()
            
            # Final ML event for setup completion
            await self.log_setup_event(SetupEvent(
                event_type="setup_complete",
                timestamp=time.time(),
                action={"phase": "final"},
                result={
                    "success": True,
                    "gpu_enabled": self.cuda_available,
                    "config": config
                },
                metrics={
                    "setup_progress": 100,
                    "setup_duration": time.time() - self.start_time
                },
                context={
                    "system": platform.system(),
                    "python": sys.version,
                    "gpu_info": self.gpu_info
                },
                setup_id=self.setup_id,
                sequence=self.event_sequence
            ))
            
            # Start core systems
            app = await self.start_core_systems()
            if app and self.gui_mode:
                self.update_progress("AIOS IO Started Successfully", 100)
                self.root.withdraw()
                app.mainloop()
            else:
                self.update_progress("Failed to start AIOS IO", 0)
                
        except Exception as e:
            self.update_progress(f"Startup failed: {e}", 0)
            logging.exception("Startup failed")
            
            # Log failure event
            await self.log_setup_event(SetupEvent(
                event_type="setup_failed",
                timestamp=time.time(),
                action={"phase": "error_handling"},
                result={"success": False, "error": str(e)},
                metrics={"setup_progress": 0},
                context={"traceback": traceback.format_exc()},
                setup_id=self.setup_id,
                sequence=self.event_sequence
            ))

    async def _perform_advanced_checks(self) -> bool:
        """Perform comprehensive system checks"""
        try:
            # Verify base directory structure first
            if not await self._verify_base_structure():
                return False

            # Create test environment if needed
            if not await self.venv_manager.create_test_environment():
                self.critical_errors.append("Failed to create test environment")
                return False

            # Test critical packages first
            critical_packages = ['numpy', 'psutil', 'aiosqlite']
            for package in critical_packages:
                test = await self.venv_manager.test_package(package)
                if test["status"] == "error":
                    self.critical_errors.append(f"Critical package {package} test failed")
                    return False

            # Test remaining packages
            async with ThreadPoolExecutor() as pool:
                package_tests = []
                for package, import_name in self.REQUIRED_PACKAGES.items():
                    if package not in critical_packages:
                        test = await self.venv_manager.test_package(package)
                        if test["status"] == "error":
                            self.warnings.append(f"Package test failed: {package}")
                        package_tests.append(test["status"] == "ok")

            # Verify system integrity
            integrity = await self.redundancy.verify_system_integrity()
            if not all(integrity.values()):
                failed = [k for k, v in integrity.items() if not v]
                self.critical_errors.append(f"System integrity check failed: {failed}")
                return False

            return True

        except Exception as e:
            self.critical_errors.append(f"Advanced checks failed: {e}")
            logging.exception("Advanced checks failed")
            return False

    async def _verify_base_structure(self) -> bool:
        """Verify basic directory structure and permissions"""
        try:
            # Verify IO package structure
            io_path = self.base_path / "IO"
            games_path = io_path / "games"
            
            # Create package directories
            io_path.mkdir(exist_ok=True)
            games_path.mkdir(exist_ok=True)
            
            # Create __init__.py files
            (io_path / "__init__.py").touch()
            (games_path / "__init__.py").touch()
            
            # Verify write permissions
            test_paths = [io_path, games_path]
            for path in test_paths:
                test_file = path / ".write_test"
                try:
                    test_file.touch()
                    test_file.unlink()
                except Exception as e:
                    self.critical_errors.append(f"Permission error at {path}: {e}")
                    return False
            
            return True
            
        except Exception as e:
            self.critical_errors.append(f"Base structure verification failed: {e}")
            return False

    async def _handle_startup_failure(self, failure_type: str, error: Exception = None):
        """Enhanced error handling with better logging"""
        try:
            # Log the failure with error details
            error_info = {
                "type": failure_type,
                "error": str(error) if error else None,
                "critical_errors": self.critical_errors,
                "warnings": self.warnings
            }
            
            if error:
                error_info["traceback"] = traceback.format_exc()
            
            await self.log_setup_event(SetupEvent(
                event_type="startup_failure",
                timestamp=time.time(),
                action={"type": failure_type},
                result=error_info,
                metrics={"setup_progress": 0},
                context={
                    "system_state": await self._get_system_state(),
                    "package_state": await self._get_package_state()
                },
                setup_id=self.setup_id,
                sequence=self.event_sequence
            ))
            
        except Exception as e:
            # Fallback error handling if logging fails
            error_msg = f"Critical error during startup: {e}"
            logging.error(error_msg)
            if self.gui_mode:
                messagebox.showerror("Fatal Error", error_msg)
            else:
                print(error_msg)

    async def _get_system_state(self) -> Dict[str, Any]:
        """Capture current system state for diagnostics with fallbacks"""
        state = {
            "platform": platform.uname()._asdict(),
            "python_version": sys.version,
            "working_directory": str(Path.cwd()),
            "environment_variables": dict(os.environ),
        }
        
        # Add memory info if available
        if psutil:
            try:
                state["memory_info"] = psutil.virtual_memory()._asdict()
                state["disk_info"] = psutil.disk_usage('/')._asdict()
            except Exception as e:
                state["memory_error"] = str(e)
        else:
            state["memory_info"] = "psutil not available"
            
        return state

    async def _get_package_state(self) -> Dict[str, Any]:
        """Get state of all required packages"""
        package_state = {}
        for package in self.REQUIRED_PACKAGES:
            try:
                dist = pkg_resources.get_distribution(package)
                package_state[package] = {
                    "version": dist.version,
                    "location": dist.location,
                    "requires": [str(r) for r in dist.requires()]
                }
            except:
                package_state[package] = {"installed": False}
        return package_state

    def _init_ml_database(self):
        """Initialize ML-ready logging database"""
        with sqlite3.connect(self.setup_db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS setup_events (
                    id TEXT PRIMARY KEY,
                    timestamp REAL,
                    event_type TEXT,
                    action JSON,
                    result JSON,
                    metrics JSON,
                    context JSON,
                    setup_id TEXT,
                    sequence INTEGER,
                    vector_embedding JSON
                )
            """)

    async def log_setup_event(self, event: SetupEvent):
        """Log setup event in ML-ready format"""
        event_id = str(uuid4())
        async with aiosqlite.connect(str(self.setup_db_path)) as db:
            await db.execute("""
                INSERT INTO setup_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                event_id,
                event.timestamp,
                event.event_type,
                json.dumps(event.action),
                json.dumps(event.result),
                json.dumps(event.metrics),
                json.dumps(event.context),
                event.setup_id,
                event.sequence,
                json.dumps(self._compute_event_embedding(event))
            ))
            await db.commit()

    def _compute_event_embedding(self, event: SetupEvent) -> List[float]:
        """Compute vector embedding for ML processing"""
        # Extract numerical features for ML
        features = []
        
        # Action complexity
        features.append(len(json.dumps(event.action)))
        
        # Success metric
        if isinstance(event.result.get('success'), bool):
            features.append(float(event.result['success']))
            
        # Performance metrics
        features.extend(list(event.metrics.values()))
        
        return features

    async def check_gpu_support(self) -> bool:
        """Check and configure GPU support"""
        self.update_progress("Checking GPU capabilities...", 15)
        
        try:
            import torch
            self.cuda_available = torch.cuda.is_available()
            if self.cuda_available:
                self.gpu_info = {
                    'name': torch.cuda.get_device_name(0),
                    'memory': torch.cuda.get_device_properties(0).total_memory,
                    'capability': torch.cuda.get_device_capability(0)
                }
        except ImportError:
            self.cuda_available = False
            
        # Log GPU check event
        await self.log_setup_event(SetupEvent(
            event_type="gpu_check",
            timestamp=time.time(),
            action={"check_type": "cuda_support"},
            result={"available": self.cuda_available, "info": self.gpu_info},
            metrics={"setup_progress": 15},
            context={"platform": platform.system(), "python_version": sys.version},
            setup_id=self.setup_id,
            sequence=self.event_sequence
        ))
        self.event_sequence += 1
        
        return self.cuda_available

    async def setup_environment(self):
        """Setup environment variables and configuration"""
        self.update_progress("Configuring environment...", 40)
        
        env_vars = {
            "AIOS_HOME": str(self.base_path),
            "AIOS_DATA": str(self.base_path / "data"),
            "AIOS_LOGS": str(self.base_path / "logs"),
            "AIOS_GPU": str(self.cuda_available).lower(),
            "PYTHONPATH": str(self.base_path)
        }
        
        # Create/update .env file
        with open(self.env_file, 'w') as f:
            for key, value in env_vars.items():
                f.write(f"{key}={value}\n")
                
        # Set environment variables
        for key, value in env_vars.items():
            os.environ[key] = value
            
        # Log environment setup
        await self.log_setup_event(SetupEvent(
            event_type="env_setup",
            timestamp=time.time(),
            action={"vars": list(env_vars.keys())},
            result={"success": True, "env_file": str(self.env_file)},
            metrics={"setup_progress": 40},
            context={"env_vars": env_vars},
            setup_id=self.setup_id,
            sequence=self.event_sequence
        ))
        self.event_sequence += 1

    async def check_network_requirements(self) -> bool:
        """Verify network connectivity and requirements"""
        self.update_progress("Checking network capabilities...", 20)
        
        try:
            import socket
            import requests
            
            # Check internet connectivity
            socket.create_connection(("8.8.8.8", 53), timeout=3)
            
            # Check required services
            services = [
                "https://api.github.com",  # GitHub API
                "https://pypi.org",        # PyPI
                "https://pytorch.org"       # PyTorch
            ]
            
            results = {}
            for service in services:
                try:
                    response = requests.get(service, timeout=5)
                    results[service] = response.status_code == 200
                except:
                    results[service] = False
                    
            success = all(results.values())
            
            # Log network check
            await self.log_setup_event(SetupEvent(
                event_type="network_check",
                timestamp=time.time(),
                action={"services": services},
                result={"success": success, "service_status": results},
                metrics={"setup_progress": 20},
                context={"network_info": socket.gethostname()},
                setup_id=self.setup_id,
                sequence=self.event_sequence
            ))
            self.event_sequence += 1
            
            return success
            
        except Exception as e:
            self.update_progress(f"Network check failed: {e}", 0)
            return False

def main():
    """Entry point"""
    launcher = FirstbornLauncher()
    if launcher.gui_mode:
        launcher.root.mainloop()
    else:
        asyncio.run(launcher.start())

if __name__ == "__main__":
    main()
