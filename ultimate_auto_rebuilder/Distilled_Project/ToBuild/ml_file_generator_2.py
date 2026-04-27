# File copied by Ultimate Auto-Rebuilder Script Gatherer
# Original: C:\Users\lokee\Documents\FirstBorne\Stage\porting\Egg_Ileices\Egg_Ileices\Sperm_Ileices\Sperm_Ileices\ml_file_generator_2.py
# Copy Date: 2025-06-13 02:25:37
# Original Size: 10650 bytes

#!/usr/bin/env python3
"""
AIOS IO Machine Learning File Generator

This module generates the foundational ML files for AIOS IO:
- HDF5 files for perception (Red)
- ONNX files for processing (Blue)
- TFRecord files for generation (Yellow)

These files are used in the recursive intelligence cycle following the Law of Three.
"""

import os
import sys
import time
import json
import random
import uuid
import tempfile
from datetime import datetime

class MLFileGenerator:
    """
    Generates machine learning files in various formats for the AIOS IO
    recursive intelligence system following the Law of Three pattern.
    """
    
    def __init__(self, base_dir=None):
        """Initialize the ML file generator."""
        # Determine appropriate base directory
        if base_dir is None:
            self.base_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        else:
            self.base_dir = base_dir
            
        # Set up ML files directory structure
        self.ml_files_dir = os.path.join(self.base_dir, "ML_Files")
        self.red_dir = os.path.join(self.ml_files_dir, "Red")
        self.blue_dir = os.path.join(self.ml_files_dir, "Blue")
        self.yellow_dir = os.path.join(self.ml_files_dir, "Yellow")
        
        # Create all required directories
        for directory in [self.ml_files_dir, self.red_dir, self.blue_dir, self.yellow_dir]:
            os.makedirs(directory, exist_ok=True)
        
        # Initialize libraries if available
        self.h5py = self._import_h5py()
        self.onnx = self._import_onnx()
        self.tf = self._import_tensorflow()
        
        # Constants for the Law of Three
        self.TIER_ONE = 3    # First level
        self.TIER_TWO = 9    # Second level (3²)
        self.TIER_THREE = 27  # Third level (3³)
        
        # Metrics
        self.metrics = {
            "hdf5_files_generated": 0,
            "onnx_files_generated": 0,
            "tfrecord_files_generated": 0,
            "last_generation": None
        }
    
    def _import_h5py(self):
        """Import h5py if available, otherwise return None."""
        try:
            import h5py
            return h5py
        except ImportError:
            print("Warning: h5py not found, using JSON fallback for HDF5 files")
            return None
    
    def _import_onnx(self):
        """Import onnx if available, otherwise return None."""
        try:
            import onnx
            return onnx
        except ImportError:
            print("Warning: onnx not found, using JSON fallback for ONNX files")
            return None
    
    def _import_tensorflow(self):
        """Import tensorflow if available, otherwise return None."""
        try:
            import tensorflow as tf
            return tf
        except ImportError:
            print("Warning: tensorflow not found, using JSON fallback for TFRecord files")
            return None
    
    def generate_hdf5_file(self, component, data):
        """
        Generate an HDF5 file for the specified component (typically Red for perception).
        Falls back to JSON if h5py is not available.
        
        Args:
            component: The component generating the file (Red/Blue/Yellow)
            data: The data to store in the file
            
        Returns:
            str: Path to the generated file
        """
        # Ensure component is valid
        if component not in ["Red", "Blue", "Yellow"]:
            component = "Red"  # Default to Red
        
        # Generate unique filename with timestamp and UUID
        timestamp = int(time.time())
        file_id = str(uuid.uuid4())[:8]
        filename = f"{component.lower()}_{timestamp}_{file_id}"
        
        # Determine output directory based on component
        if component == "Red":
            output_dir = self.red_dir
        elif component == "Blue":
            output_dir = self.blue_dir
        else:  # Yellow
            output_dir = self.yellow_dir
        
        # Add metadata to data
        if isinstance(data, dict):
            data["file_metadata"] = {
                "component": component,
                "timestamp": timestamp,
                "file_id": file_id,
                "format": "HDF5" if self.h5py else "JSON",
                "generation_time": datetime.now().isoformat()
            }
        
        # Generate actual file
        if self.h5py:
            # Use HDF5 format
            file_path = os.path.join(output_dir, f"{filename}.hdf5")
            try:
                with self.h5py.File(file_path, 'w') as f:
                    self._dict_to_hdf5(f, data)
                self.metrics["hdf5_files_generated"] += 1
                return file_path
            except Exception as e:
                print(f"Error creating HDF5 file: {e}")
                # Fall back to JSON
        
        # Fallback to JSON
        file_path = os.path.join(output_dir, f"{filename}.json")
        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)
        
        self.metrics["hdf5_files_generated"] += 1
        return file_path
    
    def generate_onnx_file(self, component, data):
        """
        Generate an ONNX file for the specified component (typically Blue for processing).
        Falls back to JSON if onnx is not available.
        
        Args:
            component: The component generating the file (Red/Blue/Yellow)
            data: The data to store in the file
            
        Returns:
            str: Path to the generated file
        """
        # Ensure component is valid
        if component not in ["Red", "Blue", "Yellow"]:
            component = "Blue"  # Default to Blue
        
        # Generate unique filename with timestamp and UUID
        timestamp = int(time.time())
        file_id = str(uuid.uuid4())[:8]
        filename = f"{component.lower()}_{timestamp}_{file_id}"
        
        # Determine output directory based on component
        if component == "Red":
            output_dir = self.red_dir
        elif component == "Blue":
            output_dir = self.blue_dir
        else:  # Yellow
            output_dir = self.yellow_dir
        
        # Add metadata to data
        if isinstance(data, dict):
            data["file_metadata"] = {
                "component": component,
                "timestamp": timestamp,
                "file_id": file_id,
                "format": "ONNX" if self.onnx else "JSON",
                "generation_time": datetime.now().isoformat()
            }
        
        # Generate actual file
        if self.onnx:
            # Use ONNX format if the library is available
            file_path = os.path.join(output_dir, f"{filename}.onnx")
            try:
                # Create a simplified ONNX model
                self._dict_to_onnx(file_path, data)
                self.metrics["onnx_files_generated"] += 1
                return file_path
            except Exception as e:
                print(f"Error creating ONNX file: {e}")
                # Fall back to JSON
        
        # Fallback to JSON
        file_path = os.path.join(output_dir, f"{filename}.json")
        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)
        
        self.metrics["onnx_files_generated"] += 1
        return file_path
    
    def generate_tfrecord_file(self, component, data):
        """
        Generate a TFRecord file for the specified component (typically Yellow for generation).
        Falls back to JSON if tensorflow is not available.
        
        Args:
            component: The component generating the file (Red/Blue/Yellow)
            data: The data to store in the file
            
        Returns:
            str: Path to the generated file
        """
        # Ensure component is valid
        if component not in ["Red", "Blue", "Yellow"]:
            component = "Yellow"  # Default to Yellow
        
        # Generate unique filename with timestamp and UUID
        timestamp = int(time.time())
        file_id = str(uuid.uuid4())[:8]
        filename = f"{component.lower()}_{timestamp}_{file_id}"
        
        # Determine output directory based on component
        if component == "Red":
            output_dir = self.red_dir
        elif component == "Blue":
            output_dir = self.blue_dir
        else:  # Yellow
            output_dir = self.yellow_dir
        
        # Add metadata to data
        if isinstance(data, dict):
            data["file_metadata"] = {
                "component": component,
                "timestamp": timestamp,
                "file_id": file_id,
                "format": "TFRecord" if self.tf else "JSON",
                "generation_time": datetime.now().isoformat()
            }
        
        # Generate actual file
        if self.tf:
            # Use TFRecord format if the library is available
            file_path = os.path.join(output_dir, f"{filename}.tfrecord")
            try:
                self._dict_to_tfrecord(file_path, data)
                self.metrics["tfrecord_files_generated"] += 1
                return file_path
            except Exception as e:
                print(f"Error creating TFRecord file: {e}")
                # Fall back to JSON
        
        # Fallback to JSON
        file_path = os.path.join(output_dir, f"{filename}.json")
        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)
        
        self.metrics["tfrecord_files_generated"] += 1
        return file_path
    
    def _dict_to_hdf5(self, h5file, data, path='/'):
        """
        Recursively write a dictionary to an HDF5 file.
        
        Args:
            h5file: Open HDF5 file object
            data: Dictionary to write
            path: Current path in the HDF5 file
        """
        if not self.h5py:
            return
            
        # Iterate through each key-value pair in the dictionary
        for key, value in data.items():
            # Convert keys to strings
            key = str(key)
            
            # Get the path for the current key
            if path.endswith('/'):
                new_path = path + key
            else:
                new_path = path + '/' + key
            
            # Handle the value based on its type