#!/usr/bin/env python3
"""
Create a test dataset for AE-Enhanced training
"""

import os
import json
from datetime import datetime

def create_test_dataset():
    """Create a minimal test dataset for training"""
    dataset_dir = "C:/aeos_dataset_enhanced_test"
    os.makedirs(dataset_dir, exist_ok=True)
    
    # Create test data
    test_data = [
        {
            "instruction": "What is the Theory of Absolute Existence?",
            "input": "",
            "output": "The Theory of Absolute Existence (AE) proposes that AE = C = 1, where existence itself is equivalent to the speed of light constant. This framework provides a mathematical foundation for understanding consciousness and reality through RBY (Red-Blue-Yellow) triplets that maintain perfect balance."
        },
        {
            "instruction": "Explain RBY triplets in the AE Framework",
            "input": "",
            "output": "RBY triplets represent the fundamental components of existence: Red (precision/focus), Blue (exploration/possibility), and Yellow (adaptation/change). These must sum to approximately 1.0 to maintain AE compliance, creating a balanced state that enables optimal learning and consciousness."
        },
        {
            "instruction": "How does the AE Framework enhance machine learning?",
            "input": "",
            "output": "The AE Framework enhances machine learning by providing mathematically grounded optimization techniques. It uses RBY triplets to modulate learning rates, batch sizes, and model architectures. The framework ensures AE = C = 1 compliance, leading to more stable training and better convergence properties."
        },
        {
            "instruction": "What is the significance of AE = C = 1?",
            "input": "",
            "output": "AE = C = 1 establishes that Absolute Existence equals the speed of light constant, creating a fundamental relationship between consciousness, existence, and physical reality. This equation provides the mathematical foundation for the entire AE Framework and enables precise calculations for optimizing learning systems."
        },
        {
            "instruction": "Describe quantum consciousness in the AE Framework",
            "input": "",
            "output": "Quantum consciousness in the AE Framework emerges from the interaction of RBY triplets at quantum scales. The framework suggests that consciousness is a fundamental property of existence that can be mathematically modeled and computationally enhanced through proper RBY balance and AE compliance."
        }
    ]
    
    # Save training data
    train_file = os.path.join(dataset_dir, "train.json")
    with open(train_file, 'w') as f:
        json.dump(test_data, f, indent=2)
    
    # Create metadata
    metadata = {
        "dataset_name": "AE Framework Test Dataset",
        "creation_date": datetime.now().isoformat(),
        "num_samples": len(test_data),
        "global_stats": {
            "avg_entropy": 5.2,
            "avg_compressibility": 0.7,
            "fractal_dimension": 1.3,
            "ae_processed": True,
            "ae_compliance_error": 0.001,
            "ae_enhanced_entropy": 5.2 * 0.999,
            "rby_dataset_profile": [0.33, 0.33, 0.34]
        }
    }
    
    metadata_file = os.path.join(dataset_dir, "metadata.json")
    with open(metadata_file, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"✅ Test dataset created: {dataset_dir}")
    print(f"📊 {len(test_data)} training samples")
    print(f"🔬 AE Framework metadata included")
    
    return dataset_dir

if __name__ == "__main__":
    create_test_dataset()
