"""
Circular Recursive Build System
24/7 Mode: Continuously rebuilds projects in numbered sequence with smart completion tracking
"""

import os
import sys
import time
import threading
import shutil
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import json
import datetime


class CircularBuildManager:
    """
    Manages circular recursive building in 24/7 mode
    """
    
    def __init__(self, base_dir: str, code_processor):
        self.base_dir = Path(base_dir)
        self.code_processor = code_processor
        self.is_running = False
        self.current_cycle = 0
        self.build_thread = None
        self.progress = 0.0
        self.cycle_stats = {
            "total_cycles": 0,
            "successful_builds": 0,
            "failed_builds": 0,
            "deleted_incomplete": 0
        }
        
        # Configuration
        self.completion_threshold = 60.0  # 60% threshold for deletion vs completion
        self.max_cycles = None  # None = infinite, or set a number
        self.cycle_delay = 30  # seconds between cycles
        
        # Build tracking
        self.current_build_path = None
        self.build_start_time = None
        
    def start_circular_mode(self, max_cycles: Optional[int] = None):
        """
        Start the circular recursive build mode
        """
        if self.is_running:
            print("🔄 Circular build mode is already running!")
            return
        
        self.max_cycles = max_cycles
        self.is_running = True
        
        print("🚀 Starting Circular Recursive Build Mode...")
        print(f"📊 Completion threshold: {self.completion_threshold}%")
        print(f"🔄 Max cycles: {'Infinite' if max_cycles is None else max_cycles}")
        print(f"⏱️  Cycle delay: {self.cycle_delay}s")
        print()
        
        # Start the build thread
        self.build_thread = threading.Thread(target=self._circular_build_loop, daemon=True)
        self.build_thread.start()
        
        # Start the progress display thread
        self.display_thread = threading.Thread(target=self._progress_display_loop, daemon=True)
        self.display_thread.start()
    
    def stop_circular_mode(self):
        """
        Stop the circular recursive build mode with smart completion
        """
        if not self.is_running:
            print("⚠️ Circular build mode is not running!")
            return
        
        print("\n🛑 Stopping circular build mode...")
        
        # Check current build completion
        if self.current_build_path and self.progress > 0:
            if self.progress >= self.completion_threshold:
                print(f"⏳ Current build is {self.progress:.1f}% complete - finishing current cycle...")
                self._wait_for_current_cycle_completion()
            else:
                print(f"🗑️ Current build is only {self.progress:.1f}% complete - will be deleted")
        
        self.is_running = False
        
        if self.build_thread:
            self.build_thread.join(timeout=30)
        
        # Clean up incomplete build if necessary
        if self.current_build_path and self.progress < self.completion_threshold:
            self._cleanup_incomplete_build()
        
        print("✅ Circular build mode stopped")
        self._print_final_stats()
    
    def get_status(self) -> Dict[str, any]:
        """
        Get current status of circular build mode
        """
        return {
            "is_running": self.is_running,
            "current_cycle": self.current_cycle,
            "progress": self.progress,
            "current_build": str(self.current_build_path) if self.current_build_path else None,
            "stats": self.cycle_stats.copy()
        }
    
    def _circular_build_loop(self):
        """
        Main circular build loop
        """
        while self.is_running:
            try:
                if self.max_cycles and self.current_cycle >= self.max_cycles:
                    print(f"\n✅ Reached maximum cycles ({self.max_cycles})")
                    break
                
                self.current_cycle += 1
                self.cycle_stats["total_cycles"] += 1
                
                # Determine source and target
                source_dir, target_dir = self._get_cycle_directories()
                
                self.current_build_path = target_dir
                self.build_start_time = datetime.datetime.now()
                self.progress = 0.0
                
                # Perform the build
                success = self._perform_cycle_build(source_dir, target_dir)
                
                if success:
                    self.cycle_stats["successful_builds"] += 1
                    self.progress = 100.0
                else:
                    self.cycle_stats["failed_builds"] += 1
                    if self.progress < self.completion_threshold:
                        self._cleanup_incomplete_build()
                        self.cycle_stats["deleted_incomplete"] += 1
                
                # Wait before next cycle
                if self.is_running:
                    time.sleep(self.cycle_delay)
                
            except Exception as e:
                print(f"\n❌ Error in build cycle {self.current_cycle}: {e}")
                self.cycle_stats["failed_builds"] += 1
                time.sleep(self.cycle_delay)
        
        self.is_running = False
    
    def _get_cycle_directories(self) -> Tuple[Path, Path]:
        """
        Determine source and target directories for current cycle
        """
        # Find the highest numbered rebuilt project or use original
        rebuilt_projects = list(self.base_dir.glob("rebuilt_project*"))
        
        if not rebuilt_projects:
            # First cycle: original → rebuilt_project_1
            source_dir = self.base_dir / "ScriptsFound"
            target_dir = self.base_dir / "rebuilt_project_1"
        else:
            # Find highest numbered project
            highest_num = 0
            highest_project = None
            
            for project in rebuilt_projects:
                if project.name == "rebuilt_project":
                    # Original rebuilt_project counts as 0
                    if highest_num <= 0:
                        highest_num = 0
                        highest_project = project
                else:
                    # Extract number from rebuilt_project_N
                    try:
                        num_str = project.name.split("_")[-1]
                        num = int(num_str)
                        if num > highest_num:
                            highest_num = num
                            highest_project = project
                    except (ValueError, IndexError):
                        continue
            
            # Source is highest numbered project, target is next number
            source_dir = highest_project
            next_num = highest_num + 1
            target_dir = self.base_dir / f"rebuilt_project_{next_num}"
        
        return source_dir, target_dir
    
    def _perform_cycle_build(self, source_dir: Path, target_dir: Path) -> bool:
        """
        Perform a single build cycle
        """
        try:
            # Update source folder in code processor
            original_source = self.code_processor.source_folder
            self.code_processor.source_folder = source_dir.name
            
            # Simulate build progress
            self.progress = 10.0  # Started
            
            # Discover files
            files_to_process = self.code_processor.discover_files()
            if not files_to_process:
                return False
            
            self.progress = 30.0  # Discovery complete
            
            # Create target directory
            if target_dir.exists():
                shutil.rmtree(target_dir)
            target_dir.mkdir(parents=True, exist_ok=True)
            
            self.progress = 40.0  # Setup complete
            
            # Process with critical fixes
            if hasattr(self.code_processor, 'HARVESTED_MODULES_AVAILABLE') and self.code_processor.HARVESTED_MODULES_AVAILABLE:
                from .code_processor_modules.critical_fixes import CriticalRebuilderFixer
                
                fixer = CriticalRebuilderFixer(logger=lambda msg: None)  # Silent logger for background
                file_paths = [str(f) for f in files_to_process]
                
                self.progress = 50.0  # Processing started
                
                fixed_results = fixer.fix_file_processing(file_paths)
                
                self.progress = 70.0  # Processing complete
                
                fixer.build_fixed_output_project(fixed_results, str(target_dir))
                
                self.progress = 90.0  # Build complete
                
                # Run analysis and enhancements
                analysis_results = fixer.run_comprehensive_analysis(file_paths)
                enhancement_results = fixer.run_comprehensive_enhancements(str(target_dir), analysis_results)
                
                self.progress = 100.0  # All complete
                
            else:
                # Fallback method
                self.progress = 90.0
                # Use original methods here if needed
                self.progress = 100.0
            
            # Restore original source folder
            self.code_processor.source_folder = original_source
            
            return True
            
        except Exception as e:
            return False
    
    def _progress_display_loop(self):
        """
        Display live progress updates without spamming logs
        """
        while self.is_running:
            try:
                if self.current_build_path:
                    # Get existing rebuilt projects count
                    rebuilt_count = len(list(self.base_dir.glob("rebuilt_project*")))
                    
                    # Create single-line status display
                    status_line = (
                        f"\r🔄 Cycle {self.current_cycle} | "
                        f"Progress: {self.progress:5.1f}% | "
                        f"Projects: {rebuilt_count} | "
                        f"Success: {self.cycle_stats['successful_builds']} | "
                        f"Failed: {self.cycle_stats['failed_builds']} | "
                        f"Cleaned: {self.cycle_stats['deleted_incomplete']}"
                    )
                    
                    # Use \\r to overwrite the same line
                    print(status_line, end='', flush=True)
                
                time.sleep(1)  # Update every second
                
            except Exception:
                pass
    
    def _wait_for_current_cycle_completion(self):
        """
        Wait for current cycle to complete before stopping
        """
        timeout = 300  # 5 minutes max wait
        start_time = time.time()
        
        while self.progress < 100.0 and (time.time() - start_time) < timeout:
            time.sleep(1)
    
    def _cleanup_incomplete_build(self):
        """
        Clean up incomplete build that's below threshold
        """
        if self.current_build_path and self.current_build_path.exists():
            try:
                shutil.rmtree(self.current_build_path)
                print(f"\n🗑️ Cleaned up incomplete build: {self.current_build_path.name}")
            except Exception as e:
                print(f"\n⚠️ Failed to cleanup {self.current_build_path}: {e}")
    
    def _print_final_stats(self):
        """
        Print final statistics
        """
        print("\n" + "="*60)
        print("📊 CIRCULAR BUILD FINAL STATISTICS")
        print("="*60)
        print(f"Total Cycles: {self.cycle_stats['total_cycles']}")
        print(f"Successful Builds: {self.cycle_stats['successful_builds']}")
        print(f"Failed Builds: {self.cycle_stats['failed_builds']}")
        print(f"Incomplete Builds Cleaned: {self.cycle_stats['deleted_incomplete']}")
        
        if self.cycle_stats['total_cycles'] > 0:
            success_rate = (self.cycle_stats['successful_builds'] / self.cycle_stats['total_cycles']) * 100
            print(f"Success Rate: {success_rate:.1f}%")
        
        # List remaining projects
        rebuilt_projects = sorted(list(self.base_dir.glob("rebuilt_project*")))
        print(f"\\nRemaining Projects: {len(rebuilt_projects)}")
        for project in rebuilt_projects:
            print(f"  - {project.name}")
        
        print("="*60)


class CircularBuildCLI:
    """
    CLI interface for circular build management
    """
    
    def __init__(self, build_manager: CircularBuildManager):
        self.build_manager = build_manager
    
    def show_status(self):
        """Show current status"""
        status = self.build_manager.get_status()
        
        print("\\n" + "="*50)
        print("🔄 CIRCULAR BUILD STATUS")
        print("="*50)
        print(f"Running: {'✅ Yes' if status['is_running'] else '❌ No'}")
        print(f"Current Cycle: {status['current_cycle']}")
        print(f"Progress: {status['progress']:.1f}%")
        print(f"Current Build: {status['current_build'] or 'None'}")
        print("\\nStatistics:")
        for key, value in status['stats'].items():
            print(f"  {key.replace('_', ' ').title()}: {value}")
        print("="*50)
    
    def configure_settings(self):
        """Configure circular build settings"""
        print("\\n⚙️ Configure Circular Build Settings:")
        print(f"Current completion threshold: {self.build_manager.completion_threshold}%")
        print(f"Current cycle delay: {self.build_manager.cycle_delay}s")
        
        try:
            new_threshold = input("Enter new completion threshold (60-99%): ").strip()
            if new_threshold:
                threshold = float(new_threshold)
                if 60 <= threshold <= 99:
                    self.build_manager.completion_threshold = threshold
                    print(f"✅ Threshold updated to {threshold}%")
                else:
                    print("❌ Threshold must be between 60-99%")
            
            new_delay = input("Enter new cycle delay (seconds): ").strip()
            if new_delay:
                delay = int(new_delay)
                if delay >= 5:
                    self.build_manager.cycle_delay = delay
                    print(f"✅ Delay updated to {delay}s")
                else:
                    print("❌ Delay must be at least 5 seconds")
        
        except ValueError:
            print("❌ Invalid input")
    
    def list_projects(self):
        """List all rebuilt projects"""
        projects = sorted(list(self.build_manager.base_dir.glob("rebuilt_project*")))
        
        print("\\n📁 REBUILT PROJECTS:")
        print("="*40)
        if not projects:
            print("No rebuilt projects found")
        else:
            for i, project in enumerate(projects, 1):
                size = self._get_directory_size(project)
                print(f"{i:2d}. {project.name:<20} ({size})")
        print("="*40)
    
    def _get_directory_size(self, path: Path) -> str:
        """Get directory size in human readable format"""
        try:
            total_size = sum(f.stat().st_size for f in path.rglob('*') if f.is_file())
            if total_size < 1024:
                return f"{total_size} B"
            elif total_size < 1024*1024:
                return f"{total_size/1024:.1f} KB"
            else:
                return f"{total_size/(1024*1024):.1f} MB"
        except:
            return "Unknown"
