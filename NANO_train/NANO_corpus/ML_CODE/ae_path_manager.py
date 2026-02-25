"""
AE Framework PATH Manager
Automatically detects and configures Python package paths for seamless operation
Integrates with the complete AE Framework for optimal performance
"""

import os
import sys
import subprocess
import platform
import winreg
from pathlib import Path
from typing import List, Dict, Any
import json
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class AEPathManager:
    """Intelligent PATH management for AE Framework components"""
    
    def __init__(self):
        self.python_paths = []
        self.package_paths = []
        self.detected_packages = {}
        self.current_path = os.environ.get('PATH', '')
        
    def detect_python_installations(self) -> List[str]:
        """Detect all Python installations on the system"""
        python_paths = []
        
        # Common Python installation locations
        common_locations = [
            f"C:\\Users\\{os.getenv('USERNAME')}\\AppData\\Roaming\\Python",
            f"C:\\Users\\{os.getenv('USERNAME')}\\AppData\\Local\\Programs\\Python",
            "C:\\Python39",
            "C:\\Python310", 
            "C:\\Python311",
            "C:\\Python312",
            "C:\\Program Files\\Python39",
            "C:\\Program Files\\Python310",
            "C:\\Program Files\\Python311",
            "C:\\Program Files\\Python312",
            "C:\\Program Files (x86)\\Python39",
            "C:\\Program Files (x86)\\Python310",
            "C:\\Program Files (x86)\\Python311",
            "C:\\Program Files (x86)\\Python312"
        ]
        
        # Check each location
        for location in common_locations:
            if os.path.exists(location):
                # Look for Python executables
                for root, dirs, files in os.walk(location):
                    if 'python.exe' in files:
                        python_paths.append(root)
                    if 'Scripts' in dirs:
                        scripts_path = os.path.join(root, 'Scripts')
                        if os.path.exists(scripts_path):
                            python_paths.append(scripts_path)
        
        # Add current Python path
        current_python = sys.executable
        if current_python:
            python_dir = os.path.dirname(current_python)
            python_paths.append(python_dir)
            scripts_dir = os.path.join(python_dir, 'Scripts')
            if os.path.exists(scripts_dir):
                python_paths.append(scripts_dir)
        
        # Remove duplicates and sort
        unique_paths = list(set(python_paths))
        self.python_paths = [p for p in unique_paths if os.path.exists(p)]
        
        return self.python_paths
    
    def detect_ae_packages(self) -> Dict[str, str]:
        """Detect AE Framework related packages and their locations"""
        packages_to_find = [
            'accelerate', 'transformers', 'torch', 'datasets', 
            'peft', 'bitsandbytes', 'tensorboard', 'wandb',
            'numpy', 'scipy', 'matplotlib', 'jupyter'
        ]
        
        detected = {}
        
        for python_path in self.python_paths:
            if 'Scripts' in python_path or python_path.endswith('Scripts'):
                # This is a Scripts directory
                for package in packages_to_find:
                    exe_path = os.path.join(python_path, f"{package}.exe")
                    if os.path.exists(exe_path):
                        detected[package] = exe_path
                    
                    # Also check for batch files
                    bat_path = os.path.join(python_path, f"{package}.bat")
                    if os.path.exists(bat_path):
                        detected[package] = bat_path
        
        self.detected_packages = detected
        return detected
    
    def check_current_path_status(self) -> Dict[str, Any]:
        """Check which paths are currently in PATH"""
        current_path_dirs = self.current_path.split(';')
        status = {
            'python_paths_in_path': [],
            'missing_python_paths': [],
            'packages_accessible': {},
            'packages_missing': []
        }
        
        # Check Python paths
        for path in self.python_paths:
            if path in current_path_dirs:
                status['python_paths_in_path'].append(path)
            else:
                status['missing_python_paths'].append(path)
        
        # Check package accessibility
        for package, exe_path in self.detected_packages.items():
            try:
                # Try to run the package
                result = subprocess.run([package, '--version'], 
                                     capture_output=True, text=True, timeout=10)
                status['packages_accessible'][package] = True
            except (subprocess.TimeoutExpired, FileNotFoundError, subprocess.CalledProcessError):
                status['packages_accessible'][package] = False
                status['packages_missing'].append(package)
        
        return status
    
    def create_ae_path_batch(self) -> str:
        """Create a batch file to set PATH for AE Framework"""
        batch_content = "@echo off\n"
        batch_content += "REM AE Framework PATH Configuration\n"
        batch_content += "REM Auto-generated by AE Path Manager\n\n"
        
        # Add all Python paths
        for path in self.python_paths:
            batch_content += f'set "PATH=%PATH%;{path}"\n'
        
        batch_content += "\nREM Verify AE Framework packages\n"
        for package in self.detected_packages.keys():
            batch_content += f'echo Checking {package}...\n'
            batch_content += f'{package} --version 2>nul && echo ✅ {package} OK || echo ❌ {package} MISSING\n'
        
        batch_content += '\necho.\necho 🚀 AE Framework PATH configured!\necho You can now run: accelerate, transformers, torch commands\n'
        batch_content += 'echo.\n'
        
        # Save batch file
        batch_path = "./corpus\\ae_setup_path.bat"
        with open(batch_path, 'w') as f:
            f.write(batch_content)
        
        return batch_path
    
    def update_system_path(self, paths_to_add: List[str]) -> bool:
        """Update system PATH (requires admin privileges)"""
        try:
            # Try to update user PATH (doesn't require admin)
            current_user_path = ""
            try:
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
                    current_user_path = winreg.QueryValueEx(key, "PATH")[0]
            except FileNotFoundError:
                current_user_path = ""
            
            # Add new paths
            new_paths = []
            existing_paths = current_user_path.split(';') if current_user_path else []
            
            for path in paths_to_add:
                if path not in existing_paths:
                    new_paths.append(path)
            
            if new_paths:
                updated_path = current_user_path
                for path in new_paths:
                    if updated_path:
                        updated_path += f";{path}"
                    else:
                        updated_path = path
                
                # Update registry
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment", 0, 
                                  winreg.KEY_SET_VALUE) as key:
                    winreg.SetValueEx(key, "PATH", 0, winreg.REG_EXPAND_SZ, updated_path)
                
                # Notify system of environment change
                import ctypes
                from ctypes import wintypes
                
                HWND_BROADCAST = 0xFFFF
                WM_SETTINGCHANGE = 0x001A
                SMTO_ABORTIFHUNG = 0x0002
                
                ctypes.windll.user32.SendMessageTimeoutW(
                    HWND_BROADCAST, WM_SETTINGCHANGE, 0, "Environment",
                    SMTO_ABORTIFHUNG, 10000, None
                )
                
                logger.info(f"✅ Added {len(new_paths)} paths to user PATH")
                return True
            else:
                logger.info("✅ All paths already in user PATH")
                return True
                
        except Exception as e:
            logger.error(f"❌ Failed to update PATH: {e}")
            return False
    
    def generate_ae_report(self) -> str:
        """Generate comprehensive AE Framework environment report"""
        report = "🌟 AE FRAMEWORK ENVIRONMENT ANALYSIS\n"
        report += "=" * 60 + "\n\n"
        
        # Python installations
        report += f"🐍 PYTHON INSTALLATIONS DETECTED: {len(self.python_paths)}\n"
        for i, path in enumerate(self.python_paths, 1):
            report += f"   {i}. {path}\n"
        
        report += f"\n📦 AE PACKAGES DETECTED: {len(self.detected_packages)}\n"
        for package, path in self.detected_packages.items():
            report += f"   ✅ {package}: {path}\n"
        
        # PATH status
        status = self.check_current_path_status()
        report += f"\n🛤️ PATH STATUS:\n"
        report += f"   Python paths in PATH: {len(status['python_paths_in_path'])}\n"
        report += f"   Missing Python paths: {len(status['missing_python_paths'])}\n"
        report += f"   Accessible packages: {sum(status['packages_accessible'].values())}\n"
        report += f"   Missing packages: {len(status['packages_missing'])}\n"
        
        if status['missing_python_paths']:
            report += f"\n❌ MISSING PATHS:\n"
            for path in status['missing_python_paths']:
                report += f"   - {path}\n"
        
        if status['packages_missing']:
            report += f"\n❌ INACCESSIBLE PACKAGES:\n"
            for package in status['packages_missing']:
                report += f"   - {package}\n"
        
        # Recommendations
        report += f"\n🎯 RECOMMENDATIONS:\n"
        if status['missing_python_paths']:
            report += "   1. Run PATH update to fix missing paths\n"
        if status['packages_missing']:
            report += "   2. Install missing packages with pip\n"
        if not status['missing_python_paths'] and not status['packages_missing']:
            report += "   ✅ Environment is properly configured!\n"
        
        return report
    
    def create_install_script(self) -> str:
        """Create script to install missing AE packages"""
        script_content = "@echo off\n"
        script_content += "REM AE Framework Package Installation\n"
        script_content += "echo 🚀 Installing AE Framework packages...\n\n"
        
        # Essential packages for AE Framework
        packages = [
            "accelerate",
            "transformers", 
            "datasets",
            "torch",
            "peft",
            "bitsandbytes",
            "tensorboard",
            "wandb",
            "scipy",
            "matplotlib",
            "jupyter",
            "notebook"
        ]
        
        script_content += "python -m pip install --upgrade pip\n"
        script_content += f"python -m pip install {' '.join(packages)}\n"
        script_content += "\necho.\necho ✅ AE Framework packages installed!\n"
        script_content += "echo Run ae_path_manager.py to configure PATH\n"
        script_content += "pause\n"
        
        script_path = "./corpus\\install_ae_packages.bat"
        with open(script_path, 'w') as f:
            f.write(script_content)
        
        return script_path


def main():
    """Main AE Path Manager execution"""
    print("🌟 AE FRAMEWORK PATH MANAGER")
    print("🧮 Intelligent Environment Configuration")
    print("=" * 60)
    
    manager = AEPathManager()
    
    print("🔍 Detecting Python installations...")
    python_paths = manager.detect_python_installations()
    print(f"   Found {len(python_paths)} Python installations")
    
    print("🔍 Detecting AE packages...")
    packages = manager.detect_ae_packages()
    print(f"   Found {len(packages)} AE-related packages")
    
    print("🔍 Analyzing PATH status...")
    status = manager.check_current_path_status()
    
    # Generate and display report
    report = manager.generate_ae_report()
    print("\n" + report)
    
    # Offer to fix PATH if needed
    if status['missing_python_paths']:
        print("\n🔧 PATH CONFIGURATION REQUIRED")
        response = input("Add missing paths to user PATH? (y/N): ").strip().lower()
        
        if response in ['y', 'yes']:
            print("🛠️ Updating user PATH...")
            success = manager.update_system_path(status['missing_python_paths'])
            
            if success:
                print("✅ PATH updated successfully!")
                print("⚠️ You may need to restart your terminal/IDE")
                
                # Create batch file for immediate use
                batch_path = manager.create_ae_path_batch()
                print(f"📁 Created setup batch: {batch_path}")
                print("   Run this batch file to set PATH for current session")
            else:
                print("❌ PATH update failed")
                print("🔧 Creating batch file for manual setup...")
                batch_path = manager.create_ae_path_batch()
                print(f"📁 Created: {batch_path}")
                print("   Run as administrator to set PATH")
    
    # Offer to install missing packages
    if status['packages_missing']:
        print(f"\n📦 MISSING PACKAGES: {', '.join(status['packages_missing'])}")
        response = input("Create installation script? (y/N): ").strip().lower()
        
        if response in ['y', 'yes']:
            install_script = manager.create_install_script()
            print(f"📁 Created: {install_script}")
            print("   Run this script to install missing packages")
    
    # Save configuration
    config = {
        "python_paths": manager.python_paths,
        "detected_packages": manager.detected_packages,
        "status": status,
        "timestamp": str(datetime.now() if 'datetime' in globals() else "unknown")
    }
    
    config_path = "./corpus\\ae_path_config.json"
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)
    
    print(f"\n💾 Configuration saved: {config_path}")
    print("\n🎯 Next steps:")
    print("   1. Restart terminal/IDE if PATH was updated")
    print("   2. Run install script if packages are missing")
    print("   3. Test with: python capsule_ae_enhanced.py")


if __name__ == "__main__":
    from datetime import datetime
    main()
