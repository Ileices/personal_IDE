# File copied by Ultimate Auto-Rebuilder Script Gatherer
# Original: C:\Users\lokee\Documents\FirstBorne\Stage\porting\Egg_Ileices\Egg_Ileices\Sperm_Ileices\Sperm_Ileices\ml_file_generator.py
# Copy Date: 2025-06-13 02:25:36
# Original Size: 16347 bytes

#!/usr/bin/env python3
"""
AIOS IO Machine Learning File Generator

This module creates machine learning files in various formats for the
recursive intelligence system's perception, processing, and generation components.
"""

import os
import json
import time
import datetime
import random
import struct
import logging
import sys

class MLFileGenerator:
    """
    Creates machine learning files for AIOS IO's recursive intelligence system
    using the three-tier architecture (Red/Blue/Yellow).
    """
    
    def __init__(self, base_dir="AIOS_IO"):
        """Initialize with base directory for output files."""
        # Set up directory structure
        self.base_dir = base_dir
        self.excretion_dir = os.path.join(base_dir, "Excretions")
        self.ml_files_dir = os.path.join(self.excretion_dir, "ML_Files")
        
        # Create component-specific directories
        self.red_dir = os.path.join(self.ml_files_dir, "Red")
        self.blue_dir = os.path.join(self.ml_files_dir, "Blue")
        self.yellow_dir = os.path.join(self.ml_files_dir, "Yellow")
        
        # Ensure all directories exist
        for directory in [self.excretion_dir, self.ml_files_dir, 
                          self.red_dir, self.blue_dir, self.yellow_dir]:
            os.makedirs(directory, exist_ok=True)
            
        # Configure logging
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.StreamHandler(sys.stdout)
            ]
        )
        self.logger = logging.getLogger("AIOS_ML_Generator")
        
        # Check feature availability
        self._check_features()
    
    def _check_features(self):
        """Check which ML file format features are available."""
        self.features = {
            "hdf5": self._check_feature("h5py"),
            "onnx": self._check_feature("onnx"),
            "tensorflow": self._check_feature("tensorflow")
        }
        
        for feature, available in self.features.items():
            status = "✓" if available else "✗"
            self.logger.info(f"{status} {feature.upper()} support: {'Available' if available else 'Not available'}")
    
    def _check_feature(self, module_name):
        """Check if a Python module is available."""
        try:
            __import__(module_name)
            return True
        except ImportError:
            return False
    
    def generate_hdf5_file(self, component, data):
        """Generate HDF5 file for Red component (perception data)."""
        timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
        filename = f"{component.lower()}_perception_{timestamp}.h5"
        filepath = os.path.join(self.red_dir, filename)
        
        try:
            if self.features["hdf5"]:
                # Use h5py for proper HDF5 files
                import h5py
                import numpy as np
                
                with h5py.File(filepath, 'w') as f:
                    # Add metadata
                    f.attrs['timestamp'] = timestamp
                    f.attrs['component'] = component
                    f.attrs['created'] = str(datetime.datetime.now())
                    
                    # Store the data recursively
                    self._store_in_hdf5(f, data)
                    
                self.logger.info(f"Created HDF5 file: {filepath}")
                return filepath
            else:
                # Create our own custom binary format that mimics HDF5 structure
                json_path = filepath.replace('.h5', '.json')
                
                # Convert data to serializable form
                serializable_data = self._prepare_for_serialization(data)
                
                # Add metadata
                serializable_data["__metadata__"] = {
                    "timestamp": timestamp,
                    "component": component,
                    "created": str(datetime.datetime.now()),
                    "format": "custom_binary"
                }
                
                # Write JSON version for compatibility
                with open(json_path, 'w') as f:
                    json.dump(serializable_data, f, indent=2)
                
                self.logger.info(f"Created JSON file (HDF5 substitute): {json_path}")
                return json_path
                
        except Exception as e:
            self.logger.error(f"Error creating HDF5 file: {str(e)}")
            # Fallback to simple JSON
            json_path = filepath.replace('.h5', '.json')
            with open(json_path, 'w') as f:
                json.dump({"data": str(data), "error": str(e)}, f)
            return json_path
    
    def generate_onnx_file(self, component, data):
        """Generate ONNX file for Blue component (processing data)."""
        timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
        filename = f"{component.lower()}_processing_{timestamp}.onnx"
        filepath = os.path.join(self.blue_dir, filename)
        
        try:
            if self.features["onnx"]:
                # Use ONNX for proper files
                import onnx
                from onnx import helper, TensorProto
                import numpy as np
                
                # Create a simple model with input -> layer1 -> output
                input_name = "input"
                output_name = "output"
                
                # Define the model structure
                node = helper.make_node(
                    'Identity',  # Simple identity operation
                    inputs=[input_name],
                    outputs=[output_name],
                    name='identity'
                )
                
                # Define input/output shapes
                input_shape = [1, 10]  # Default shape
                output_shape = [1, 10]
                
                # Create model with graph
                graph = helper.make_graph(
                    [node],
                    'simple_model',
                    [helper.make_tensor_value_info(input_name, TensorProto.FLOAT, input_shape)],
                    [helper.make_tensor_value_info(output_name, TensorProto.FLOAT, output_shape)]
                )
                
                model = helper.make_model(graph, producer_name='aios_io')
                
                # Save the model
                onnx.save(model, filepath)
                
                self.logger.info(f"Created ONNX file: {filepath}")
                return filepath
            else:
                # Create our own custom format that represents the model
                json_path = filepath.replace('.onnx', '.json')
                
                # Convert data to serializable form
                serializable_data = self._prepare_for_serialization(data)
                
                # Add model structure
                serializable_data["__model__"] = {
                    "inputs": [{"name": "input", "shape": [1, 10]}],
                    "outputs": [{"name": "output", "shape": [1, 10]}],
                    "operations": [{"type": "Identity", "inputs": ["input"], "outputs": ["output"]}]
                }
                
                # Add metadata
                serializable_data["__metadata__"] = {
                    "timestamp": timestamp,
                    "component": component,
                    "created": str(datetime.datetime.now()),
                    "format": "model_json"
                }
                
                # Write JSON version
                with open(json_path, 'w') as f:
                    json.dump(serializable_data, f, indent=2)
                
                self.logger.info(f"Created JSON file (ONNX substitute): {json_path}")
                return json_path
                
        except Exception as e:
            self.logger.error(f"Error creating ONNX file: {str(e)}")
            # Fallback to simple JSON
            json_path = filepath.replace('.onnx', '.json')
            with open(json_path, 'w') as f:
                json.dump({"data": str(data), "error": str(e)}, f)
            return json_path
    
    def generate_tfrecord_file(self, component, data):
        """Generate TFRecord file for Yellow component (generation data)."""
        timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
        filename = f"{component.lower()}_generation_{timestamp}.tfrecord"
        filepath = os.path.join(self.yellow_dir, filename)
        
        try:
            if self.features["tensorflow"]:
                # Use TensorFlow for proper TFRecord files
                import tensorflow as tf
                
                # Create a feature dictionary
                feature_dict = self._create_tf_features(data)
                
                # Create a TF Example
                example = tf.train.Example(features=tf.train.Features(feature=feature_dict))
                
                # Write the TFRecord file
                with tf.io.TFRecordWriter(filepath) as writer:
                    writer.write(example.SerializeToString())
                
                self.logger.info(f"Created TFRecord file: {filepath}")
                return filepath
            else:
                # Create our own custom binary format similar to TFRecord
                json_path = filepath.replace('.tfrecord', '.json')
                binary_path = filepath + ".bin"
                
                # Convert data to serializable form
                serializable_data = self._prepare_for_serialization(data)
                
                # Add metadata
                serializable_data["__metadata__"] = {
                    "timestamp": timestamp,
                    "component": component,
                    "created": str(datetime.datetime.now()),
                    "format": "custom_record"
                }
                
                # Write JSON version
                with open(json_path, 'w') as f:
                    json.dump(serializable_data, f, indent=2)
                    
                # Also create a simple binary representation
                self._create_binary_record(binary_path, serializable_data)
                
                self.logger.info(f"Created JSON file (TFRecord substitute): {json_path}")
                return json_path
                
        except Exception as e:
            self.logger.error(f"Error creating TFRecord file: {str(e)}")
            # Fallback to simple JSON
            json_path = filepath.replace('.tfrecord', '.json')
            with open(json_path, 'w') as f:
                json.dump({"data": str(data), "error": str(e)}, f)
            return json_path
    
    def _store_in_hdf5(self, group, data, path=''):
        """Recursively store data in HDF5 format."""
        import numpy as np
        
        if isinstance(data, dict):
            # Create subgroups for dictionaries
            for key, value in data.items():
                if key.startswith('__'):  # Skip metadata keys
                    continue
                    
                # Create a subgroup for this key
                subgroup = group.create_group(key)
                self._store_in_hdf5(subgroup, value, f"{path}/{key}")
                
        elif isinstance(data, list):
            # Convert list to numpy array if possible
            try:
                # Try to convert to numpy array
                arr = np.array(data)
                group.create_dataset("data", data=arr)
            except:
                # If not convertible to array, store as a string
                group.attrs["data"] = json.dumps(data)
                
        elif isinstance(data, (int, float, bool, str)):
            # Store simple types as attributes
            group.attrs["data"] = data
            
        else:
            # For other types, convert to string
            group.attrs["data"] = str(data)
            group.attrs["type"] = str(type(data).__name__)
    
    def _create_tf_features(self, data):
        """Create TensorFlow feature dictionary from data."""
        import tensorflow as tf
        
        features = {}
        
        def _bytes_feature(value):
            """Returns a bytes_list feature."""
            if isinstance(value, str):
                value = value.encode()
            return tf.train.Feature(bytes_list=tf.train.BytesList(value=[value]))
            
        def _float_feature(value):
            """Returns a float_list feature."""
            if isinstance(value, (list, tuple)):
                return tf.train.Feature(float_list=tf.train.FloatList(value=value))
            else:
                return tf.train.Feature(float_list=tf.train.FloatList(value=[value]))
                
        def _int64_feature(value):
            """Returns an int64_list feature."""
            if isinstance(value, (list, tuple)):
                return tf.train.Feature(int64_list=tf.train.Int64List(value=value))
            else:
                return tf.train.Feature(int64_list=tf.train.Int64List(value=[value]))
        
        # Process data recursively
        def _process_data(data, prefix=""):
            if isinstance(data, dict):
                for key, value in data.items():
                    _process_data(value, f"{prefix}/{key}" if prefix else key)
            elif isinstance(data, list):
                # Try to convert to float or int features if all elements are numeric
                if all(isinstance(x, (int)) for x in data):
                    features[prefix] = _int64_feature(data)
                elif all(isinstance(x, (float)) for x in data):
                    features[prefix] = _float_feature(data)
                else:
                    # Otherwise store as bytes
                    features[prefix] = _bytes_feature(json.dumps(data))
            elif isinstance(data, float):
                features[prefix] = _float_feature(data)
            elif isinstance(data, int):
                features[prefix] = _int64_feature(data)
            else:
                # Default to bytes feature
                features[prefix] = _bytes_feature(str(data))
        
        _process_data(data)
        return features
    
    def _prepare_for_serialization(self, data):
        """Prepare data structure for serialization by handling non-JSON types."""
        if isinstance(data, dict):
            return {k: self._prepare_for_serialization(v) for k, v in data.items()}
        elif isinstance(data, (list, tuple)):
            return [self._prepare_for_serialization(item) for item in data]
        elif isinstance(data, (int, float, bool, str, type(None))):
            return data
        else:
            # Convert other types to string representation
            return str(data)
    
    def _create_binary_record(self, filepath, data):
        """Create a simple binary representation of the data."""
        try:
            # Very simplified binary format:
            # - 4 bytes: length of JSON data
            # - N bytes: JSON data
            # - 4 bytes: random data for padding
            
            # Convert data to JSON string
            json_data = json.dumps(data).encode('utf-8')
            
            # Create a simple binary file
            with open(filepath, 'wb') as f:
                # Write length of JSON data as 4 bytes
                f.write(struct.pack('<I', len(json_data)))
                
                # Write JSON data
                f.write(json_data)
                
                # Write some random bytes as padding
                f.write(struct.pack('<I', random.randint(0, 2**32-1)))
                
            return True
        except Exception as e:
            self.logger.error(f"Error creating binary record: {str(e)}")
            return False
