"""
Utility Functions Module
Common utilities used across the Ultimate Auto-Rebuilder system

This module provides shared functionality:
- File and path operations
- Text processing and analysis
- Logging and error handling
- Configuration management
- Performance monitoring
- System information
"""

import os
import sys
import json
import time
import hashlib
import platform
import psutil
import threading
import tempfile
import shutil
import re
import ast
from pathlib import Path
from datetime import datetime
from collections import defaultdict
import logging


class FileUtils:
    """File and path utility functions"""
    
    @staticmethod
    def safe_read_file(file_path, encoding='utf-8', errors='ignore'):
        """Safely read a file with error handling"""
        try:
            with open(file_path, 'r', encoding=encoding, errors=errors) as f:
                return f.read()
        except Exception as e:
            print(f"⚠️  Error reading {file_path}: {e}")
            return None
    
    @staticmethod
    def safe_write_file(file_path, content, encoding='utf-8'):
        """Safely write a file with error handling"""
        try:
            # Ensure directory exists
            Path(file_path).parent.mkdir(parents=True, exist_ok=True)
            
            with open(file_path, 'w', encoding=encoding) as f:
                f.write(content)
            return True
        except Exception as e:
            print(f"⚠️  Error writing {file_path}: {e}")
            return False
    
    @staticmethod
    def calculate_file_hash(file_path, algorithm='md5'):
        """Calculate hash of a file"""
        try:
            hash_func = hashlib.new(algorithm)
            with open(file_path, 'rb') as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    hash_func.update(chunk)
            return hash_func.hexdigest()
        except Exception as e:
            print(f"⚠️  Error calculating hash for {file_path}: {e}")
            return None
    
    @staticmethod
    def get_file_info(file_path):
        """Get comprehensive file information"""
        try:
            path = Path(file_path)
            stat = path.stat()
            
            return {
                'name': path.name,
                'size': stat.st_size,
                'size_mb': stat.st_size / (1024 * 1024),
                'modified': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                'created': datetime.fromtimestamp(stat.st_ctime).isoformat(),
                'extension': path.suffix.lower(),
                'is_python': path.suffix.lower() in ['.py', '.pyw', '.py3', '.pyi'],
                'readable': os.access(path, os.R_OK),
                'writable': os.access(path, os.W_OK)
            }
        except Exception as e:
            print(f"⚠️  Error getting info for {file_path}: {e}")
            return None
    
    @staticmethod
    def find_files(directory, pattern="*.py", recursive=True):
        """Find files matching a pattern"""
        try:
            path = Path(directory)
            if recursive:
                return list(path.rglob(pattern))
            else:
                return list(path.glob(pattern))
        except Exception as e:
            print(f"⚠️  Error finding files in {directory}: {e}")
            return []
    
    @staticmethod
    def copy_with_backup(source, destination, backup_suffix='.backup'):
        """Copy file with automatic backup of destination"""
        try:
            dest_path = Path(destination)
            
            # Create backup if destination exists
            if dest_path.exists():
                backup_path = dest_path.with_suffix(dest_path.suffix + backup_suffix)
                shutil.copy2(dest_path, backup_path)
            
            # Copy source to destination
            shutil.copy2(source, destination)
            return True
            
        except Exception as e:
            print(f"⚠️  Error copying {source} to {destination}: {e}")
            return False
    
    @staticmethod
    def create_temp_directory(prefix="auto_rebuilder_"):
        """Create a temporary directory"""
        try:
            return tempfile.mkdtemp(prefix=prefix)
        except Exception as e:
            print(f"⚠️  Error creating temp directory: {e}")
            return None


class TextUtils:
    """Text processing utility functions"""
    
    @staticmethod
    def clean_text(text):
        """Clean and normalize text"""
        if not text:
            return ""
        
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text.strip())
        
        # Remove non-printable characters except newlines and tabs
        text = re.sub(r'[^\x20-\x7E\n\t]', '', text)
        
        return text
    
    @staticmethod
    def extract_python_elements(code):
        """Extract Python code elements (functions, classes, imports)"""
        elements = {
            'functions': [],
            'classes': [],
            'imports': [],
            'variables': [],
            'errors': []
        }
        
        try:
            tree = ast.parse(code)
            
            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef):
                    elements['functions'].append({
                        'name': node.name,
                        'line': node.lineno,
                        'args': [arg.arg for arg in node.args.args]
                    })
                elif isinstance(node, ast.ClassDef):
                    elements['classes'].append({
                        'name': node.name,
                        'line': node.lineno,
                        'bases': [TextUtils.get_node_name(base) for base in node.bases]
                    })
                elif isinstance(node, ast.Import):
                    for alias in node.names:
                        elements['imports'].append({
                            'type': 'import',
                            'module': alias.name,
                            'alias': alias.asname,
                            'line': node.lineno
                        })
                elif isinstance(node, ast.ImportFrom):
                    module = node.module or ''
                    for alias in node.names:
                        elements['imports'].append({
                            'type': 'from_import',
                            'module': module,
                            'name': alias.name,
                            'alias': alias.asname,
                            'line': node.lineno
                        })
                elif isinstance(node, ast.Assign):
                    for target in node.targets:
                        if isinstance(target, ast.Name):
                            elements['variables'].append({
                                'name': target.id,
                                'line': node.lineno
                            })
        
        except SyntaxError as e:
            elements['errors'].append(f"Syntax error: {e}")
        except Exception as e:
            elements['errors'].append(f"Parse error: {e}")
        
        return elements
    
    @staticmethod
    def get_node_name(node):
        """Get name from AST node"""
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Attribute):
            return f"{TextUtils.get_node_name(node.value)}.{node.attr}"
        else:
            return str(node)
    
    @staticmethod
    def count_lines(text):
        """Count different types of lines in code"""
        if not text:
            return {'total': 0, 'code': 0, 'comments': 0, 'blank': 0}
        
        lines = text.split('\n')
        counts = {'total': len(lines), 'code': 0, 'comments': 0, 'blank': 0}
        
        for line in lines:
            stripped = line.strip()
            if not stripped:
                counts['blank'] += 1
            elif stripped.startswith('#'):
                counts['comments'] += 1
            else:
                counts['code'] += 1
        
        return counts
    
    @staticmethod
    def extract_docstrings(code):
        """Extract docstrings from Python code"""
        docstrings = []
        
        try:
            tree = ast.parse(code)
            
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.ClassDef, ast.Module)):
                    docstring = ast.get_docstring(node)
                    if docstring:
                        docstrings.append({
                            'type': type(node).__name__,
                            'name': getattr(node, 'name', 'module'),
                            'docstring': docstring,
                            'line': getattr(node, 'lineno', 1)
                        })
        
        except Exception as e:
            print(f"⚠️  Error extracting docstrings: {e}")
        
        return docstrings
    
    @staticmethod
    def similarity_score(text1, text2):
        """Calculate similarity score between two texts"""
        if not text1 or not text2:
            return 0.0
        
        # Simple word-based similarity
        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())
        
        if not words1 and not words2:
            return 1.0
        if not words1 or not words2:
            return 0.0
        
        intersection = len(words1.intersection(words2))
        union = len(words1.union(words2))
        
        return intersection / union


class SystemUtils:
    """System information and monitoring utilities"""
    
    @staticmethod
    def get_system_info():
        """Get comprehensive system information"""
        return {
            'platform': platform.system(),
            'platform_version': platform.version(),
            'architecture': platform.architecture()[0],
            'processor': platform.processor(),
            'python_version': sys.version,
            'cpu_count': os.cpu_count(),
            'memory_gb': psutil.virtual_memory().total / (1024**3),
            'disk_free_gb': psutil.disk_usage('.').free / (1024**3),
            'timestamp': datetime.now().isoformat()
        }
    
    @staticmethod
    def get_memory_usage():
        """Get current memory usage"""
        process = psutil.Process()
        memory_info = process.memory_info()
        
        return {
            'rss_mb': memory_info.rss / (1024 * 1024),
            'vms_mb': memory_info.vms / (1024 * 1024),
            'percent': process.memory_percent(),
            'available_mb': psutil.virtual_memory().available / (1024 * 1024)
        }
    
    @staticmethod
    def get_cpu_usage():
        """Get current CPU usage"""
        return {
            'percent': psutil.cpu_percent(interval=1),
            'count': psutil.cpu_count(),
            'load_avg': os.getloadavg() if hasattr(os, 'getloadavg') else None
        }
    
    @staticmethod
    def monitor_performance(func, *args, **kwargs):
        """Monitor function performance"""
        start_time = time.time()
        start_memory = SystemUtils.get_memory_usage()
        
        try:
            result = func(*args, **kwargs)
            success = True
            error = None
        except Exception as e:
            result = None
            success = False
            error = str(e)
        
        end_time = time.time()
        end_memory = SystemUtils.get_memory_usage()
        
        return {
            'result': result,
            'success': success,
            'error': error,
            'duration': end_time - start_time,
            'memory_start': start_memory,
            'memory_end': end_memory,
            'memory_delta': end_memory['rss_mb'] - start_memory['rss_mb']
        }


class ConfigUtils:
    """Configuration management utilities"""
    
    @staticmethod
    def load_config(config_file, default_config=None):
        """Load configuration from JSON file"""
        try:
            if Path(config_file).exists():
                with open(config_file, 'r') as f:
                    config = json.load(f)
                
                # Merge with defaults if provided
                if default_config:
                    ConfigUtils.merge_configs(config, default_config)
                
                return config
            else:
                return default_config or {}
                
        except Exception as e:
            print(f"⚠️  Error loading config from {config_file}: {e}")
            return default_config or {}
    
    @staticmethod
    def save_config(config, config_file):
        """Save configuration to JSON file"""
        try:
            Path(config_file).parent.mkdir(parents=True, exist_ok=True)
            
            with open(config_file, 'w') as f:
                json.dump(config, f, indent=2)
            return True
            
        except Exception as e:
            print(f"⚠️  Error saving config to {config_file}: {e}")
            return False
    
    @staticmethod
    def merge_configs(config, default_config):
        """Merge configuration with defaults"""
        for key, value in default_config.items():
            if key not in config:
                config[key] = value
            elif isinstance(value, dict) and isinstance(config[key], dict):
                ConfigUtils.merge_configs(config[key], value)


class LogUtils:
    """Logging utility functions"""
    
    @staticmethod
    def setup_logger(name, log_file=None, level=logging.INFO):
        """Setup a logger with file and console handlers"""
        logger = logging.getLogger(name)
        logger.setLevel(level)
        
        # Clear existing handlers
        logger.handlers = []
        
        # Create formatter
        formatter = logging.Formatter(
            '%(asctime)s [%(levelname)-7s] %(name)s:%(lineno)d - %(message)s'
        )
        
        # Console handler
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)
        
        # File handler
        if log_file:
            Path(log_file).parent.mkdir(parents=True, exist_ok=True)
            file_handler = logging.FileHandler(log_file, encoding='utf-8')
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)
        
        return logger
    
    @staticmethod
    def log_function_call(logger, func_name, args=None, kwargs=None, result=None, error=None, duration=None):
        """Log a function call with details"""
        log_data = {
            'function': func_name,
            'timestamp': datetime.now().isoformat(),
            'args_count': len(args) if args else 0,
            'kwargs_count': len(kwargs) if kwargs else 0,
            'success': error is None,
            'duration': duration
        }
        
        if error:
            logger.error(f"Function {func_name} failed: {error}")
        else:
            logger.info(f"Function {func_name} completed successfully")
        
        return log_data


class ProgressTracker:
    """Progress tracking utility"""
    
    def __init__(self, total_items, description="Processing"):
        self.total_items = total_items
        self.current_item = 0
        self.description = description
        self.start_time = time.time()
        self.last_update = 0
        
    def update(self, increment=1, message=None):
        """Update progress"""
        self.current_item += increment
        current_time = time.time()
        
        # Update every second or on completion
        if current_time - self.last_update >= 1.0 or self.current_item >= self.total_items:
            self.last_update = current_time
            
            if self.total_items > 0:
                percent = (self.current_item / self.total_items) * 100
                elapsed = current_time - self.start_time
                
                if self.current_item > 0:
                    eta = (elapsed / self.current_item) * (self.total_items - self.current_item)
                else:
                    eta = 0
                
                status = f"{self.description}: {self.current_item}/{self.total_items} ({percent:.1f}%) "
                status += f"ETA: {eta:.0f}s"
                
                if message:
                    status += f" - {message}"
                
                print(f"\r{status}", end="", flush=True)
                
                if self.current_item >= self.total_items:
                    print()  # New line on completion
    
    def finish(self, message=None):
        """Mark progress as finished"""
        self.current_item = self.total_items
        elapsed = time.time() - self.start_time
        
        final_message = f"{self.description}: Completed in {elapsed:.1f}s"
        if message:
            final_message += f" - {message}"
        
        print(final_message)


class ValidationUtils:
    """Validation utility functions"""
    
    @staticmethod
    def is_valid_python_file(file_path):
        """Check if file is a valid Python file"""
        try:
            path = Path(file_path)
            
            # Check extension
            if path.suffix.lower() not in ['.py', '.pyw', '.py3', '.pyi']:
                return False
            
            # Check if file exists and is readable
            if not path.exists() or not path.is_file():
                return False
            
            # Try to parse as Python
            content = FileUtils.safe_read_file(path)
            if content is None:
                return False
            
            ast.parse(content)
            return True
            
        except SyntaxError:
            return False
        except Exception:
            return False
    
    @staticmethod
    def validate_config(config, schema):
        """Validate configuration against schema"""
        errors = []
        
        for key, requirements in schema.items():
            if requirements.get('required', False) and key not in config:
                errors.append(f"Missing required config key: {key}")
                continue
            
            if key in config:
                value = config[key]
                expected_type = requirements.get('type')
                
                if expected_type and not isinstance(value, expected_type):
                    errors.append(f"Config key '{key}' should be {expected_type.__name__}, got {type(value).__name__}")
                
                min_val = requirements.get('min')
                max_val = requirements.get('max')
                
                if min_val is not None and hasattr(value, '__lt__') and value < min_val:
                    errors.append(f"Config key '{key}' should be >= {min_val}, got {value}")
                
                if max_val is not None and hasattr(value, '__gt__') and value > max_val:
                    errors.append(f"Config key '{key}' should be <= {max_val}, got {value}")
        
        return errors
    
    @staticmethod
    def sanitize_filename(filename):
        """Sanitize filename for cross-platform compatibility"""
        # Remove or replace invalid characters
        invalid_chars = '<>:"/\\|?*'
        sanitized = filename
        
        for char in invalid_chars:
            sanitized = sanitized.replace(char, '_')
        
        # Remove leading/trailing whitespace and dots
        sanitized = sanitized.strip(' .')
        
        # Ensure it's not empty
        if not sanitized:
            sanitized = "unnamed_file"
        
        # Limit length
        if len(sanitized) > 255:
            name, ext = os.path.splitext(sanitized)
            sanitized = name[:255-len(ext)] + ext
        
        return sanitized


# Global utility instances for easy access
file_utils = FileUtils()
text_utils = TextUtils()
system_utils = SystemUtils()
config_utils = ConfigUtils()
log_utils = LogUtils()
validation_utils = ValidationUtils()
