#!/usr/bin/env python3
"""
Quick test of AE Framework integration - Fixed version
"""

import sys
import os

def test_ae_integration():
    """Test the AE Framework integration"""
    print("🚀 Testing AE Framework Integration...")
    
    # Test 1: Check if AE core files exist
    ae_files = [
        'ae_core.py',
        'ae_advanced_math.py', 
        'ae_hpc_math.py',
        'ae_advanced_optimizations.py',
        'capsule_ae_enhanced.py',
        'capsule_ultimate_ae_integration.py',
        'train.py'
    ]
    
    print("\n📁 Checking AE Framework files:")
    for file in ae_files:
        if os.path.exists(file):
            print(f"  ✅ {file}")
        else:
            print(f"  ❌ {file}")
    
    # Test 2: Try importing packages
    print("\n📦 Testing package imports:")
    packages = [
        ('torch', 'PyTorch'),
        ('transformers', 'Transformers'),
        ('accelerate', 'Accelerate'),
        ('peft', 'PEFT'),
        ('tensorboard', 'TensorBoard')
    ]
    
    for package, name in packages:
        try:
            __import__(package)
            print(f"  ✅ {name}")
        except ImportError:
            print(f"  ❌ {name} - Not installed")
    
    # Test 3: Try importing AE components
    print("\n🧠 Testing AE Framework components:")
    try:
        from ae_core import AEProcessor, RBYTriplet
        print("  ✅ AE Core")
    except Exception as e:
        print(f"  ❌ AE Core - {e}")
    
    try:
        from ae_advanced_math import RBYTransformer, AEMetaLearning, RBYEnhancedLinearAlgebra
        print("  ✅ AE Advanced Math")
    except Exception as e:
        print(f"  ❌ AE Advanced Math - {e}")
    
    try:
        from ae_hpc_math import HPCMatrix
        print("  ✅ AE HPC Math")
    except Exception as e:
        print(f"  ❌ AE HPC Math - {e}")
    
    try:
        from ae_advanced_optimizations import QuantumConsciousnessProcessor
        print("  ✅ AE Quantum Optimizations")
    except Exception as e:
        print(f"  ❌ AE Quantum Optimizations - {e}")
    
    # Test 4: Test RBY triplet creation
    print("\n🔴🔵🟡 Testing RBY Triplet:")
    try:
        from ae_core import RBYTriplet
        rby = RBYTriplet(0.8, 0.6, 0.9)
        print(f"  ✅ RBY Triplet created: R={rby.red:.3f}, B={rby.blue:.3f}, Y={rby.yellow:.3f}")
        print(f"  ✅ RBY Sum: {rby.sum():.6f} (normalized: {rby.sum() == 1.0})")
    except Exception as e:
        print(f"  ❌ RBY Triplet - {e}")
    
    # Test 5: Test AE processing
    print("\n⚡ Testing AE Processing:")
    try:
        from ae_core import AEProcessor, RBYTriplet
        rby = RBYTriplet(0.4, 0.3, 0.3)
        processor = AEProcessor(rby)
        result = processor.process_text("Test AE Framework integration")
        print(f"  ✅ AE Processing successful")
        print(f"  ✅ Result keys: {list(result.keys())}")
    except Exception as e:
        print(f"  ❌ AE Processing - {e}")
    
    print("\n🎯 AE Framework Integration Test Complete!")
    print("=" * 60)

if __name__ == "__main__":
    test_ae_integration()
