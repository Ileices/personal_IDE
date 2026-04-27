"""
Script Gatherer Module
Harvested from script_gather.py

This module provides comprehensive script collection capabilities:
- Recursive directory traversal
- Duplicate detection and intelligent renaming
- Progress tracking for large collections
- Cross-platform compatibility
- Size and count statistics
- Detailed logging of operations
"""

import os
import shutil
import sys
from pathlib import Path
import time
from collections import defaultdict
import json
import threading
import hashlib


class ScriptGatherer:
    """
    Comprehensive script collection system for large-scale Python codebase aggregation
    """
    
    def __init__(self, config):
        self.config = config
        self.base_dir = Path(__file__).parent.parent
        
        # Configuration
        self.scripts_found_dir = self.base_dir / "ScriptsFound"
        self.max_file_size_mb = 50
        self.chunk_size = 100
        
        # Statistics
        self.stats = {
            'total_found': 0,
            'total_copied': 0,
            'duplicates': 0,
            'errors': 0,
            'total_size': 0,
            'directories_scanned': 0,
            'start_time': None,
            'end_time': None
        }
        
        # Tracking
        self.duplicate_counter = defaultdict(int)
        self.error_log = []
        self.file_hashes = {}  # For duplicate detection
        self.processing_queue = []
        
        # Python file extensions to search for
        self.python_extensions = {'.py', '.pyw', '.py3', '.pyi'}
        
        # Files to skip
        self.skip_files = {
            '__pycache__',
            '.pyc',
            '.pyo',
            '.pyd'
        }
        
        # Directories to skip
        self.skip_dirs = {
            '__pycache__',
            '.git',
            '.svn', 
            'node_modules',
            'venv',
            'env',
            '.venv',
            'site-packages'
        }
    
    def gather_scripts(self):
        """
        Main entry point for script gathering
        """
        print("\n📜 Starting Script Gathering Process...")
        self.stats['start_time'] = time.time()
        
        try:
            # Step 1: Setup ScriptsFound directory
            self.create_scripts_folder()
            
            # Step 2: Get search paths from user
            search_paths = self.get_search_paths()
            
            # Step 3: Scan for scripts
            self.scan_for_scripts(search_paths)
            
            # Step 4: Process and copy scripts
            self.process_scripts()
            
            # Step 5: Generate summary
            self.generate_summary()
            
        except Exception as e:
            print(f"❌ Error in script gathering: {e}")
            import traceback
            traceback.print_exc()
        
        self.stats['end_time'] = time.time()
        self.show_gathering_summary()
    
    def create_scripts_folder(self):
        """
        Create the ScriptsFound directory with proper error handling
        """
        try:
            if self.scripts_found_dir.exists():
                print(f"📁 ScriptsFound folder already exists at: {self.scripts_found_dir}")
                response = input("Would you like to clear it and start fresh? (y/N): ").strip().lower()
                if response in ['y', 'yes']:
                    shutil.rmtree(self.scripts_found_dir)
                    print("🗑️  Cleared existing ScriptsFound folder")
                else:
                    print("📂 Will add new files to existing folder")
            
            self.scripts_found_dir.mkdir(parents=True, exist_ok=True)
            print(f"✅ ScriptsFound folder ready at: {self.scripts_found_dir}")
            
        except Exception as e:
            print(f"❌ Error creating ScriptsFound folder: {e}")
            raise
    
    def get_search_paths(self):
        """
        Get search paths from user input or configuration
        """
        print("\n🔍 Script Search Configuration")
        print("Enter directories to search for Python scripts.")
        print("Leave empty and press Enter to finish.")
        
        search_paths = []
        
        # Add default paths
        default_paths = [
            self.base_dir / "ToBuild",
            self.base_dir / "sandbox",
            Path.home() / "Documents",
            Path.home() / "Desktop"
        ]
        
        print("\nSuggested paths:")
        for i, path in enumerate(default_paths, 1):
            if path.exists():
                print(f"  {i}. {path}")
        
        print("\nYou can:")
        print("  - Enter a number to select a suggested path")
        print("  - Enter a custom path")
        print("  - Press Enter with no input to start searching")
        
        while True:
            user_input = input("\nEnter path or number: ").strip()
            
            if not user_input:
                break
            
            try:
                # Check if it's a number (selecting from suggestions)
                if user_input.isdigit():
                    index = int(user_input) - 1
                    if 0 <= index < len(default_paths):
                        path = default_paths[index]
                        if path.exists():
                            search_paths.append(path)
                            print(f"✅ Added: {path}")
                        else:
                            print(f"❌ Path doesn't exist: {path}")
                    else:
                        print("❌ Invalid number")
                else:
                    # Custom path
                    path = Path(user_input)
                    if path.exists():
                        search_paths.append(path)
                        print(f"✅ Added: {path}")
                    else:
                        print(f"❌ Path doesn't exist: {path}")
                        
            except Exception as e:
                print(f"❌ Error processing path: {e}")
        
        # If no paths selected, use ToBuild as default
        if not search_paths:
            default_path = self.base_dir / "ToBuild"
            if default_path.exists():
                search_paths.append(default_path)
                print(f"🔄 Using default path: {default_path}")
            else:
                print("⚠️  No valid paths to search")
                return []
        
        print(f"\n📋 Will search {len(search_paths)} directories:")
        for path in search_paths:
            print(f"   - {path}")
        
        return search_paths
    
    def scan_for_scripts(self, search_paths):
        """
        Scan directories for Python scripts
        """
        print("\n🔎 Scanning for Python scripts...")
        
        for search_path in search_paths:
            print(f"Scanning: {search_path}")
            self.scan_directory(search_path)
        
        print(f"📊 Found {len(self.processing_queue)} Python files to process")
    
    def scan_directory(self, directory):
        """
        Recursively scan a directory for Python files
        """
        try:
            self.stats['directories_scanned'] += 1
            
            for item in directory.iterdir():
                if item.is_file():
                    if self.should_process_file(item):
                        self.processing_queue.append(item)
                        self.stats['total_found'] += 1
                        
                elif item.is_dir():
                    if not self.should_skip_directory(item):
                        self.scan_directory(item)
                        
        except PermissionError:
            error_msg = f"Permission denied accessing: {directory}"
            print(f"⚠️  {error_msg}")
            self.error_log.append(error_msg)
            self.stats['errors'] += 1
            
        except Exception as e:
            error_msg = f"Error scanning {directory}: {e}"
            print(f"❌ {error_msg}")
            self.error_log.append(error_msg)
            self.stats['errors'] += 1
    
    def should_process_file(self, file_path):
        """
        Determine if a file should be processed
        """
        # Check extension
        if file_path.suffix.lower() not in self.python_extensions:
            return False
        
        # Check if in skip list
        if any(skip in file_path.name.lower() for skip in self.skip_files):
            return False
        
        # Check file size
        try:
            file_size_mb = file_path.stat().st_size / (1024 * 1024)
            if file_size_mb > self.max_file_size_mb:
                print(f"⚠️  Skipping large file: {file_path.name} ({file_size_mb:.1f}MB)")
                return False
        except:
            return False
        
        return True
    
    def should_skip_directory(self, dir_path):
        """
        Determine if a directory should be skipped
        """
        dir_name = dir_path.name.lower()
        return any(skip_dir in dir_name for skip_dir in self.skip_dirs)
    
    def process_scripts(self):
        """
        Process and copy scripts to ScriptsFound folder
        """
        print(f"\n📋 Processing {len(self.processing_queue)} scripts...")
        
        # Process in chunks for better performance
        for i in range(0, len(self.processing_queue), self.chunk_size):
            chunk = self.processing_queue[i:i + self.chunk_size]
            
            print(f"Processing batch {i // self.chunk_size + 1}/{(len(self.processing_queue) - 1) // self.chunk_size + 1}")
            
            for file_path in chunk:
                self.process_single_script(file_path)
    
    def process_single_script(self, file_path):
        """
        Process a single script file
        """
        try:
            # Calculate file hash for duplicate detection
            file_hash = self.calculate_file_hash(file_path)
            
            # Check for duplicates
            if file_hash in self.file_hashes:
                self.stats['duplicates'] += 1
                original_file = self.file_hashes[file_hash]
                print(f"🔄 Duplicate found: {file_path.name} (same as {original_file.name})")
                
                # Create duplicate with modified name
                target_name = self.generate_duplicate_name(file_path.name)
            else:
                # New file
                self.file_hashes[file_hash] = file_path
                target_name = file_path.name
            
            # Copy file
            target_path = self.scripts_found_dir / target_name
            shutil.copy2(file_path, target_path)
            
            # Update statistics
            self.stats['total_copied'] += 1
            self.stats['total_size'] += file_path.stat().st_size
            
            # Add metadata
            self.add_file_metadata(target_path, file_path)
            
        except Exception as e:
            error_msg = f"Error processing {file_path}: {e}"
            print(f"❌ {error_msg}")
            self.error_log.append(error_msg)
            self.stats['errors'] += 1
    
    def calculate_file_hash(self, file_path):
        """
        Calculate MD5 hash of file content for duplicate detection
        """
        try:
            with open(file_path, 'rb') as f:
                content = f.read()
            return hashlib.md5(content).hexdigest()
        except:
            # If we can't read the file, use path + size as pseudo-hash
            return f"{file_path}_{file_path.stat().st_size}"
    
    def generate_duplicate_name(self, original_name):
        """
        Generate a unique name for duplicate files
        """
        base_name = original_name.rsplit('.', 1)[0]
        extension = original_name.rsplit('.', 1)[1] if '.' in original_name else ''
        
        self.duplicate_counter[base_name] += 1
        counter = self.duplicate_counter[base_name]
        
        if extension:
            return f"{base_name}_duplicate_{counter}.{extension}"
        else:
            return f"{base_name}_duplicate_{counter}"
    
    def add_file_metadata(self, target_path, source_path):
        """
        Add metadata to copied file
        """
        try:
            metadata = {
                'original_path': str(source_path),
                'original_size': source_path.stat().st_size,
                'copy_time': time.time(),
                'copy_date': time.strftime('%Y-%m-%d %H:%M:%S')
            }
            
            # Add metadata as comment at the top of the file
            with open(target_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            metadata_comment = f"""# File copied by Ultimate Auto-Rebuilder Script Gatherer
# Original: {metadata['original_path']}
# Copy Date: {metadata['copy_date']}
# Original Size: {metadata['original_size']} bytes

"""
            
            with open(target_path, 'w', encoding='utf-8') as f:
                f.write(metadata_comment + content)
                
        except Exception as e:
            # If metadata addition fails, just log it
            print(f"⚠️  Could not add metadata to {target_path.name}: {e}")
    
    def generate_summary(self):
        """
        Generate a summary report
        """
        summary_file = self.scripts_found_dir / "gathering_summary.json"
        
        summary_data = {
            'statistics': self.stats,
            'search_completed': time.strftime('%Y-%m-%d %H:%M:%S'),
            'files_by_extension': self.get_files_by_extension(),
            'largest_files': self.get_largest_files(),
            'error_log': self.error_log
        }
        
        with open(summary_file, 'w') as f:
            json.dump(summary_data, f, indent=2)
        
        # Also create a human-readable summary
        self.create_text_summary()
    
    def get_files_by_extension(self):
        """
        Get count of files by extension
        """
        extension_counts = defaultdict(int)
        
        for file_path in self.scripts_found_dir.glob("*"):
            if file_path.is_file() and file_path.suffix:
                extension_counts[file_path.suffix.lower()] += 1
        
        return dict(extension_counts)
    
    def get_largest_files(self, limit=10):
        """
        Get list of largest files
        """
        files_with_sizes = []
        
        for file_path in self.scripts_found_dir.glob("*.py"):
            if file_path.is_file():
                try:
                    size = file_path.stat().st_size
                    files_with_sizes.append({
                        'name': file_path.name,
                        'size': size,
                        'size_mb': size / (1024 * 1024)
                    })
                except:
                    continue
        
        # Sort by size and return top N
        files_with_sizes.sort(key=lambda x: x['size'], reverse=True)
        return files_with_sizes[:limit]
    
    def create_text_summary(self):
        """
        Create a human-readable text summary
        """
        summary_file = self.scripts_found_dir / "gathering_summary.txt"
        
        duration = self.stats['end_time'] - self.stats['start_time']
        
        summary_text = f"""
=== ULTIMATE AUTO-REBUILDER SCRIPT GATHERING SUMMARY ===
Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}

STATISTICS:
- Files Found: {self.stats['total_found']}
- Files Copied: {self.stats['total_copied']}
- Duplicates: {self.stats['duplicates']}
- Errors: {self.stats['errors']}
- Directories Scanned: {self.stats['directories_scanned']}
- Total Size: {self.stats['total_size'] / (1024 * 1024):.1f} MB
- Processing Time: {duration:.2f} seconds

FILES BY EXTENSION:
"""
        
        for ext, count in self.get_files_by_extension().items():
            summary_text += f"- {ext}: {count} files\n"
        
        summary_text += "\nLARGEST FILES:\n"
        for file_info in self.get_largest_files():
            summary_text += f"- {file_info['name']}: {file_info['size_mb']:.1f} MB\n"
        
        if self.error_log:
            summary_text += f"\nERRORS ({len(self.error_log)}):\n"
            for error in self.error_log[:10]:  # Show first 10 errors
                summary_text += f"- {error}\n"
            
            if len(self.error_log) > 10:
                summary_text += f"... and {len(self.error_log) - 10} more errors\n"
        
        with open(summary_file, 'w', encoding='utf-8') as f:
            f.write(summary_text)
        
        print(f"📄 Summary saved to: {summary_file}")
    
    def show_gathering_summary(self):
        """
        Display gathering summary
        """
        duration = self.stats['end_time'] - self.stats['start_time']
        
        print("\n" + "="*60)
        print("📜 SCRIPT GATHERING SUMMARY")
        print("="*60)
        print(f"Files Found: {self.stats['total_found']}")
        print(f"Files Copied: {self.stats['total_copied']}")
        print(f"Duplicates Found: {self.stats['duplicates']}")
        print(f"Errors: {self.stats['errors']}")
        print(f"Directories Scanned: {self.stats['directories_scanned']}")
        print(f"Total Size: {self.stats['total_size'] / (1024 * 1024):.1f} MB")
        print(f"Processing Time: {duration:.2f} seconds")
        print(f"Output Location: {self.scripts_found_dir}")
        
        # Show success rate
        if self.stats['total_found'] > 0:
            success_rate = (self.stats['total_copied'] / self.stats['total_found']) * 100
            print(f"Success Rate: {success_rate:.1f}%")
        
        print("="*60)
    
    def clean_scripts_folder(self):
        """
        Clean the ScriptsFound folder
        """
        if self.scripts_found_dir.exists():
            file_count = len(list(self.scripts_found_dir.glob("*")))
            response = input(f"Delete {file_count} files from ScriptsFound folder? (y/N): ").strip().lower()
            
            if response in ['y', 'yes']:
                shutil.rmtree(self.scripts_found_dir)
                self.scripts_found_dir.mkdir(parents=True)
                print("🗑️  ScriptsFound folder cleaned")
            else:
                print("❌ Cleaning cancelled")
        else:
            print("📁 ScriptsFound folder doesn't exist")
    
    def show_scripts_info(self):
        """
        Show information about collected scripts
        """
        if not self.scripts_found_dir.exists():
            print("📁 ScriptsFound folder doesn't exist")
            return
        
        files = list(self.scripts_found_dir.glob("*.py"))
        
        print(f"\n📊 ScriptsFound Information:")
        print(f"Total Python files: {len(files)}")
        
        if files:
            total_size = sum(f.stat().st_size for f in files)
            print(f"Total size: {total_size / (1024 * 1024):.1f} MB")
            print(f"Average size: {total_size / len(files) / 1024:.1f} KB")
            
            # Show largest files
            files_with_sizes = [(f, f.stat().st_size) for f in files]
            files_with_sizes.sort(key=lambda x: x[1], reverse=True)
            
            print("\nLargest files:")
            for file_path, size in files_with_sizes[:5]:
                print(f"  {file_path.name}: {size / 1024:.1f} KB")
    
    def search_scripts(self, search_term):
        """
        Search for scripts containing specific terms
        """
        print(f"\n🔍 Searching for '{search_term}' in collected scripts...")
        
        if not self.scripts_found_dir.exists():
            print("📁 ScriptsFound folder doesn't exist")
            return
        
        matches = []
        
        for file_path in self.scripts_found_dir.glob("*.py"):
            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read().lower()
                
                if search_term.lower() in content:
                    matches.append(file_path)
                    
            except Exception as e:
                print(f"⚠️  Error searching {file_path.name}: {e}")
        
        print(f"📊 Found {len(matches)} files containing '{search_term}':")
        for match in matches[:10]:  # Show first 10 matches
            print(f"  - {match.name}")
        
        if len(matches) > 10:
            print(f"  ... and {len(matches) - 10} more matches")
        
        return matches
