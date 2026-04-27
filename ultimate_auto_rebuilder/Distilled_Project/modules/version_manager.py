"""
Version Manager Module
Harvested from enhanced_auto_rebuilder_v2.py

This module provides comprehensive version management:
- Version tracking and history
- Quality assessment and scoring
- Automatic backup creation
- Version comparison and rollback
- Performance metrics tracking
- Storage optimization
"""

import os
import shutil
import json
import time
import hashlib
from datetime import datetime
from pathlib import Path
from collections import defaultdict
import zipfile
import tempfile


class VersionManager:
    """
    Comprehensive version management system for rebuilt projects
    """
    
    def __init__(self, config):
        self.config = config
        self.base_dir = Path(__file__).parent.parent
        
        # Version management configuration
        self.versions_dir = self.base_dir / "versions"
        self.output_folder = config.get('output_folder', 'rebuilt_project')
        self.max_versions = 50
        self.max_version_size_gb = 10
        self.version_quality_threshold = 0.1
        
        # Version tracking
        self.version_history = {}
        self.version_metrics = {}
        self.current_version = None
        
        # Initialize version system
        self.setup_version_system()
        self.load_version_history()
    
    def setup_version_system(self):
        """
        Setup the version management system
        """
        self.versions_dir.mkdir(parents=True, exist_ok=True)
        
        # Create version index file if it doesn't exist
        self.version_index_file = self.versions_dir / "version_index.json"
        if not self.version_index_file.exists():
            self.save_version_index()
    
    def load_version_history(self):
        """
        Load version history from disk
        """
        if self.version_index_file.exists():
            try:
                with open(self.version_index_file, 'r') as f:
                    data = json.load(f)
                    self.version_history = data.get('version_history', {})
                    self.version_metrics = data.get('version_metrics', {})
                    self.current_version = data.get('current_version')
            except Exception as e:
                print(f"⚠️  Error loading version history: {e}")
                self.version_history = {}
                self.version_metrics = {}
    
    def save_version_index(self):
        """
        Save version index to disk
        """
        index_data = {
            'version_history': self.version_history,
            'version_metrics': self.version_metrics,
            'current_version': self.current_version,
            'last_updated': datetime.now().isoformat(),
            'total_versions': len(self.version_history)
        }
        
        with open(self.version_index_file, 'w') as f:
            json.dump(index_data, f, indent=2)
    
    def create_version(self, description="Auto-generated version"):
        """
        Create a new version of the current project
        """
        print(f"\n📚 Creating new version...")
        
        # Check if output project exists
        output_path = self.base_dir / self.output_folder
        if not output_path.exists():
            print("❌ No rebuilt project found to version")
            return None
        
        # Generate version ID
        version_id = self.generate_version_id()
        version_path = self.versions_dir / version_id
        
        try:
            # Create version directory
            version_path.mkdir(parents=True, exist_ok=True)
            
            # Copy project to version directory
            project_copy_path = version_path / "project"
            shutil.copytree(output_path, project_copy_path)
            
            # Calculate version metrics
            metrics = self.calculate_version_metrics(project_copy_path)
            
            # Create version metadata
            version_data = {
                'id': version_id,
                'description': description,
                'created': datetime.now().isoformat(),
                'size_bytes': metrics['total_size'],
                'file_count': metrics['file_count'],
                'quality_score': metrics['quality_score'],
                'complexity_score': metrics['complexity_score'],
                'hash': metrics['content_hash'],
                'metrics': metrics
            }
            
            # Save version metadata
            metadata_file = version_path / "version_metadata.json"
            with open(metadata_file, 'w') as f:
                json.dump(version_data, f, indent=2)
            
            # Update version history
            self.version_history[version_id] = version_data
            self.version_metrics[version_id] = metrics
            self.current_version = version_id
            
            # Save index
            self.save_version_index()
            
            # Clean up old versions if needed
            self.cleanup_old_versions()
            
            print(f"✅ Version {version_id} created successfully")
            print(f"   Size: {metrics['total_size'] / (1024*1024):.1f} MB")
            print(f"   Files: {metrics['file_count']}")
            print(f"   Quality: {metrics['quality_score']:.3f}")
            
            return version_id
            
        except Exception as e:
            print(f"❌ Error creating version: {e}")
            # Clean up failed version
            if version_path.exists():
                shutil.rmtree(version_path)
            return None
    
    def generate_version_id(self):
        """
        Generate a unique version ID
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return f"v_{timestamp}"
    
    def calculate_version_metrics(self, project_path):
        """
        Calculate comprehensive metrics for a version
        """
        metrics = {
            'total_size': 0,
            'file_count': 0,
            'python_files': 0,
            'total_lines': 0,
            'code_lines': 0,
            'comment_lines': 0,
            'blank_lines': 0,
            'function_count': 0,
            'class_count': 0,
            'import_count': 0,
            'complexity_score': 0.0,
            'quality_score': 0.0,
            'content_hash': '',
            'file_types': defaultdict(int),
            'package_counts': defaultdict(int)
        }
        
        all_content = []
        
        try:
            for file_path in project_path.rglob("*"):
                if file_path.is_file():
                    metrics['file_count'] += 1
                    file_size = file_path.stat().st_size
                    metrics['total_size'] += file_size
                    
                    # Track file types
                    extension = file_path.suffix.lower()
                    metrics['file_types'][extension] += 1
                    
                    # Track packages
                    if file_path.parent.name != project_path.name:
                        metrics['package_counts'][file_path.parent.name] += 1
                    
                    # Analyze Python files
                    if extension == '.py':
                        metrics['python_files'] += 1
                        file_metrics = self.analyze_python_file(file_path)
                        
                        metrics['total_lines'] += file_metrics['total_lines']
                        metrics['code_lines'] += file_metrics['code_lines']
                        metrics['comment_lines'] += file_metrics['comment_lines']
                        metrics['blank_lines'] += file_metrics['blank_lines']
                        metrics['function_count'] += file_metrics['functions']
                        metrics['class_count'] += file_metrics['classes']
                        metrics['import_count'] += file_metrics['imports']
                        metrics['complexity_score'] += file_metrics['complexity']
                        
                        # Add content for hash calculation
                        try:
                            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                                all_content.append(f.read())
                        except:
                            pass
            
            # Calculate derived metrics
            if metrics['python_files'] > 0:
                metrics['avg_file_size'] = metrics['total_size'] / metrics['python_files']
                metrics['avg_lines_per_file'] = metrics['total_lines'] / metrics['python_files']
                metrics['code_ratio'] = metrics['code_lines'] / metrics['total_lines'] if metrics['total_lines'] > 0 else 0
                metrics['comment_ratio'] = metrics['comment_lines'] / metrics['total_lines'] if metrics['total_lines'] > 0 else 0
            
            # Calculate quality score
            metrics['quality_score'] = self.calculate_quality_score(metrics)
            
            # Calculate content hash
            if all_content:
                combined_content = '\n'.join(all_content)
                metrics['content_hash'] = hashlib.md5(combined_content.encode()).hexdigest()
            
        except Exception as e:
            print(f"⚠️  Error calculating metrics: {e}")
        
        return metrics
    
    def analyze_python_file(self, file_path):
        """
        Analyze a single Python file
        """
        file_metrics = {
            'total_lines': 0,
            'code_lines': 0,
            'comment_lines': 0,
            'blank_lines': 0,
            'functions': 0,
            'classes': 0,
            'imports': 0,
            'complexity': 0
        }
        
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
            
            file_metrics['total_lines'] = len(lines)
            
            for line in lines:
                stripped = line.strip()
                
                if not stripped:
                    file_metrics['blank_lines'] += 1
                elif stripped.startswith('#'):
                    file_metrics['comment_lines'] += 1
                else:
                    file_metrics['code_lines'] += 1
                    
                    # Count code constructs
                    if stripped.startswith('def '):
                        file_metrics['functions'] += 1
                        file_metrics['complexity'] += 1
                    elif stripped.startswith('class '):
                        file_metrics['classes'] += 1
                        file_metrics['complexity'] += 2
                    elif stripped.startswith('import ') or stripped.startswith('from '):
                        file_metrics['imports'] += 1
                    elif any(keyword in stripped for keyword in ['if ', 'elif ', 'for ', 'while ', 'try:', 'except']):
                        file_metrics['complexity'] += 1
        
        except Exception as e:
            print(f"⚠️  Error analyzing {file_path}: {e}")
        
        return file_metrics
    
    def calculate_quality_score(self, metrics):
        """
        Calculate a quality score based on various metrics
        """
        score = 0.0
        
        try:
            # Comment ratio score (0-25 points)
            comment_ratio = metrics.get('comment_ratio', 0)
            if 0.1 <= comment_ratio <= 0.3:  # Good comment ratio
                score += 25 * (comment_ratio / 0.3)
            elif comment_ratio > 0.3:
                score += 25 * (0.6 - comment_ratio)  # Too many comments
            
            # Code organization score (0-25 points)
            if metrics.get('function_count', 0) > 0:
                functions_per_file = metrics['function_count'] / max(metrics.get('python_files', 1), 1)
                if 1 <= functions_per_file <= 10:  # Good function distribution
                    score += 25
                elif functions_per_file > 10:
                    score += 25 * (20 - functions_per_file) / 10  # Too many functions per file
            
            # File size score (0-25 points)
            avg_file_size = metrics.get('avg_file_size', 0)
            if 1000 <= avg_file_size <= 50000:  # Good file size range
                score += 25
            elif avg_file_size > 50000:
                score += 25 * (100000 - avg_file_size) / 50000  # Too large files
            
            # Complexity score (0-25 points)
            if metrics.get('total_lines', 0) > 0:
                complexity_per_line = metrics.get('complexity_score', 0) / metrics['total_lines']
                if 0.01 <= complexity_per_line <= 0.1:  # Good complexity ratio
                    score += 25
                elif complexity_per_line > 0.1:
                    score += 25 * (0.2 - complexity_per_line) / 0.1  # Too complex
            
            # Normalize to 0-1 range
            score = max(0, min(100, score)) / 100
            
        except Exception as e:
            print(f"⚠️  Error calculating quality score: {e}")
            score = 0.0
        
        return score
    
    def cleanup_old_versions(self):
        """
        Clean up old versions based on storage limits
        """
        try:
            # Get all versions sorted by creation time
            versions = list(self.version_history.items())
            versions.sort(key=lambda x: x[1].get('created', ''), reverse=True)
            
            # Remove excess versions
            if len(versions) > self.max_versions:
                versions_to_remove = versions[self.max_versions:]
                
                for version_id, version_data in versions_to_remove:
                    print(f"🗑️  Removing old version: {version_id}")
                    self.delete_version(version_id, save_index=False)
            
            # Check total storage size
            total_size = sum(v.get('size_bytes', 0) for v in self.version_history.values())
            max_size_bytes = self.max_version_size_gb * 1024 * 1024 * 1024
            
            if total_size > max_size_bytes:
                print(f"⚠️  Version storage ({total_size / (1024**3):.1f} GB) exceeds limit")
                
                # Remove oldest versions until under limit
                versions = list(self.version_history.items())
                versions.sort(key=lambda x: x[1].get('created', ''))
                
                for version_id, version_data in versions:
                    if total_size <= max_size_bytes:
                        break
                    
                    print(f"🗑️  Removing version for storage: {version_id}")
                    total_size -= version_data.get('size_bytes', 0)
                    self.delete_version(version_id, save_index=False)
            
            # Save updated index
            self.save_version_index()
            
        except Exception as e:
            print(f"⚠️  Error in version cleanup: {e}")
    
    def delete_version(self, version_id, save_index=True):
        """
        Delete a specific version
        """
        try:
            version_path = self.versions_dir / version_id
            if version_path.exists():
                shutil.rmtree(version_path)
            
            # Remove from tracking
            if version_id in self.version_history:
                del self.version_history[version_id]
            if version_id in self.version_metrics:
                del self.version_metrics[version_id]
            
            # Update current version if needed
            if self.current_version == version_id:
                self.current_version = None
                if self.version_history:
                    # Set to most recent version
                    versions = list(self.version_history.items())
                    versions.sort(key=lambda x: x[1].get('created', ''), reverse=True)
                    self.current_version = versions[0][0]
            
            if save_index:
                self.save_version_index()
            
            return True
            
        except Exception as e:
            print(f"❌ Error deleting version {version_id}: {e}")
            return False
    
    def restore_version(self, version_id):
        """
        Restore a specific version as the current project
        """
        if version_id not in self.version_history:
            print(f"❌ Version {version_id} not found")
            return False
        
        print(f"🔄 Restoring version {version_id}...")
        
        try:
            version_path = self.versions_dir / version_id / "project"
            output_path = self.base_dir / self.output_folder
            
            if not version_path.exists():
                print(f"❌ Version data not found: {version_path}")
                return False
            
            # Backup current project if it exists
            if output_path.exists():
                backup_id = f"backup_before_restore_{int(time.time())}"
                self.create_version(f"Backup before restoring {version_id}")
            
            # Remove current project
            if output_path.exists():
                shutil.rmtree(output_path)
            
            # Copy version to output
            shutil.copytree(version_path, output_path)
            
            # Update current version
            self.current_version = version_id
            self.save_version_index()
            
            print(f"✅ Version {version_id} restored successfully")
            return True
            
        except Exception as e:
            print(f"❌ Error restoring version {version_id}: {e}")
            return False
    
    def compare_versions(self, version1_id, version2_id):
        """
        Compare two versions and show differences
        """
        if version1_id not in self.version_history or version2_id not in self.version_history:
            print("❌ One or both versions not found")
            return
        
        v1 = self.version_history[version1_id]
        v2 = self.version_history[version2_id]
        
        print(f"\n🔍 Comparing versions {version1_id} vs {version2_id}")
        print("=" * 60)
        
        # Basic comparison
        print(f"Created:       {v1.get('created', 'Unknown')} | {v2.get('created', 'Unknown')}")
        print(f"Size:          {v1.get('size_bytes', 0) / (1024*1024):.1f} MB | {v2.get('size_bytes', 0) / (1024*1024):.1f} MB")
        print(f"Files:         {v1.get('file_count', 0)} | {v2.get('file_count', 0)}")
        print(f"Quality:       {v1.get('quality_score', 0):.3f} | {v2.get('quality_score', 0):.3f}")
        
        # Detailed metrics comparison
        m1 = self.version_metrics.get(version1_id, {})
        m2 = self.version_metrics.get(version2_id, {})
        
        print(f"\nDetailed Metrics:")
        print(f"Python Files:  {m1.get('python_files', 0)} | {m2.get('python_files', 0)}")
        print(f"Total Lines:   {m1.get('total_lines', 0)} | {m2.get('total_lines', 0)}")
        print(f"Functions:     {m1.get('function_count', 0)} | {m2.get('function_count', 0)}")
        print(f"Classes:       {m1.get('class_count', 0)} | {m2.get('class_count', 0)}")
        print(f"Complexity:    {m1.get('complexity_score', 0):.1f} | {m2.get('complexity_score', 0):.1f}")
        
        # Show improvement/degradation
        size_diff = v2.get('size_bytes', 0) - v1.get('size_bytes', 0)
        quality_diff = v2.get('quality_score', 0) - v1.get('quality_score', 0)
        
        print(f"\nChanges:")
        print(f"Size Change:   {size_diff / (1024*1024):+.1f} MB")
        print(f"Quality Change: {quality_diff:+.3f}")
        
        if quality_diff > 0:
            print("📈 Version 2 has better quality")
        elif quality_diff < 0:
            print("📉 Version 2 has lower quality")
        else:
            print("⚖️  Quality unchanged")
    
    def show_version_menu(self):
        """
        Show interactive version management menu
        """
        while True:
            self.show_version_list()
            
            print("\n📚 Version Management Options:")
            print("1. Create new version")
            print("2. Restore version")
            print("3. Delete version")
            print("4. Compare versions")
            print("5. Export version")
            print("6. Import version")
            print("7. Clean up old versions")
            print("8. Return to main menu")
            
            choice = input("\nEnter your choice (1-8): ").strip()
            
            if choice == '1':
                description = input("Enter version description (optional): ").strip()
                if not description:
                    description = "Manual version creation"
                self.create_version(description)
                
            elif choice == '2':
                version_id = input("Enter version ID to restore: ").strip()
                self.restore_version(version_id)
                
            elif choice == '3':
                version_id = input("Enter version ID to delete: ").strip()
                if input(f"Confirm delete version {version_id}? (y/N): ").strip().lower() in ['y', 'yes']:
                    self.delete_version(version_id)
                
            elif choice == '4':
                version1 = input("Enter first version ID: ").strip()
                version2 = input("Enter second version ID: ").strip()
                self.compare_versions(version1, version2)
                
            elif choice == '5':
                version_id = input("Enter version ID to export: ").strip()
                self.export_version(version_id)
                
            elif choice == '6':
                file_path = input("Enter path to version file to import: ").strip()
                self.import_version(file_path)
                
            elif choice == '7':
                self.cleanup_old_versions()
                print("✅ Version cleanup completed")
                
            elif choice == '8':
                break
                
            else:
                print("❌ Invalid choice. Please try again.")
    
    def show_version_list(self):
        """
        Show list of all versions
        """
        print("\n📚 Available Versions:")
        print("=" * 80)
        
        if not self.version_history:
            print("No versions available")
            return
        
        # Sort versions by creation time
        versions = list(self.version_history.items())
        versions.sort(key=lambda x: x[1].get('created', ''), reverse=True)
        
        print(f"{'ID':<20} {'Created':<20} {'Size':<10} {'Files':<8} {'Quality':<8} {'Description'}")
        print("-" * 80)
        
        for version_id, version_data in versions:
            current_marker = " (CURRENT)" if version_id == self.current_version else ""
            created = version_data.get('created', 'Unknown')[:19]  # Remove microseconds
            size = f"{version_data.get('size_bytes', 0) / (1024*1024):.1f}MB"
            files = str(version_data.get('file_count', 0))
            quality = f"{version_data.get('quality_score', 0):.3f}"
            description = version_data.get('description', '')[:30]
            
            print(f"{version_id:<20} {created:<20} {size:<10} {files:<8} {quality:<8} {description}{current_marker}")
    
    def export_version(self, version_id):
        """
        Export a version to a zip file
        """
        if version_id not in self.version_history:
            print(f"❌ Version {version_id} not found")
            return
        
        try:
            version_path = self.versions_dir / version_id
            export_file = self.base_dir / f"{version_id}.zip"
            
            with zipfile.ZipFile(export_file, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for file_path in version_path.rglob("*"):
                    if file_path.is_file():
                        arcname = file_path.relative_to(version_path)
                        zipf.write(file_path, arcname)
            
            print(f"✅ Version {version_id} exported to {export_file}")
            
        except Exception as e:
            print(f"❌ Error exporting version: {e}")
    
    def import_version(self, zip_file_path):
        """
        Import a version from a zip file
        """
        zip_path = Path(zip_file_path)
        
        if not zip_path.exists():
            print(f"❌ File not found: {zip_path}")
            return
        
        try:
            # Generate new version ID
            version_id = f"imported_{int(time.time())}"
            version_path = self.versions_dir / version_id
            
            # Extract zip
            with zipfile.ZipFile(zip_path, 'r') as zipf:
                zipf.extractall(version_path)
            
            # Load metadata if available
            metadata_file = version_path / "version_metadata.json"
            if metadata_file.exists():
                with open(metadata_file, 'r') as f:
                    version_data = json.load(f)
                    version_data['id'] = version_id  # Update ID
            else:
                # Create basic metadata
                version_data = {
                    'id': version_id,
                    'description': f"Imported from {zip_path.name}",
                    'created': datetime.now().isoformat(),
                    'imported': True
                }
            
            # Add to version history
            self.version_history[version_id] = version_data
            self.save_version_index()
            
            print(f"✅ Version imported as {version_id}")
            
        except Exception as e:
            print(f"❌ Error importing version: {e}")
    
    def get_version_stats(self):
        """
        Get comprehensive version statistics
        """
        if not self.version_history:
            return {}
        
        versions = list(self.version_history.values())
        
        stats = {
            'total_versions': len(versions),
            'total_size_gb': sum(v.get('size_bytes', 0) for v in versions) / (1024**3),
            'avg_quality': sum(v.get('quality_score', 0) for v in versions) / len(versions),
            'best_version': None,
            'worst_version': None,
            'newest_version': None,
            'oldest_version': None
        }
        
        # Find best and worst versions by quality
        versions_by_quality = sorted(versions, key=lambda x: x.get('quality_score', 0), reverse=True)
        if versions_by_quality:
            stats['best_version'] = versions_by_quality[0]['id']
            stats['worst_version'] = versions_by_quality[-1]['id']
        
        # Find newest and oldest versions
        versions_by_date = sorted(versions, key=lambda x: x.get('created', ''), reverse=True)
        if versions_by_date:
            stats['newest_version'] = versions_by_date[0]['id']
            stats['oldest_version'] = versions_by_date[-1]['id']
        
        return stats
