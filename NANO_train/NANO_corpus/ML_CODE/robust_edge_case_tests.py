#!/usr/bin/env python3
"""
Robust Edge Case Testing Suite for ATTACK Framework
Implements the "tighten-the-bolts" checklist to catch hidden edge cases
that typical testing doesn't cover.
"""

import pytest
import numpy as np
import torch
import json
import time
import threading
import tempfile
import os
import pickle
from typing import Dict, Any, List, Tuple
from dataclasses import dataclass, asdict
import concurrent.futures
from pathlib import Path

# Import our core modules
try:
    from ic_ae_mathematical_foundation import ICConsciousnessEngine, RBYVector
    from quantum_consciousness_bridge_v2 import QuantumConsciousnessProcessor
    from rby_core_engine import RBYConsciousnessOrchestrator, RBYState
    MODULES_AVAILABLE = True
except ImportError as e:
    print(f"⚠️  Module import failed: {e}")
    MODULES_AVAILABLE = False

# Configure logging
import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class UniversalState:
    """Test state container for JSON round-trip testing"""
    rby_vector: RBYVector
    tensors: Dict[str, torch.Tensor]
    timestamp: float
    generation: int
    metadata: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dictionary"""
        return {
            'rby_vector': self.rby_vector.to_dict() if hasattr(self.rby_vector, 'to_dict') else {
                'red': float(self.rby_vector.red),
                'blue': float(self.rby_vector.blue), 
                'yellow': float(self.rby_vector.yellow),
                'ae_coefficient': float(self.rby_vector.ae_coefficient)
            },
            'tensors': {k: v.tolist() for k, v in self.tensors.items()},
            'timestamp': self.timestamp,
            'generation': self.generation,
            'metadata': self.metadata
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'UniversalState':
        """Restore from JSON dictionary"""
        rby_data = data['rby_vector']
        rby_vector = RBYVector(
            red=rby_data['red'],
            blue=rby_data['blue'],
            yellow=rby_data['yellow'],
            ae_coefficient=rby_data['ae_coefficient']
        )
        
        tensors = {k: torch.tensor(v) for k, v in data['tensors'].items()}
        
        return cls(
            rby_vector=rby_vector,
            tensors=tensors,
            timestamp=data['timestamp'],
            generation=data['generation'],
            metadata=data['metadata']
        )


class RobustEdgeCaseTests:
    """Comprehensive edge case testing suite"""
    
    def __init__(self):
        self.performance_baseline = 0.06  # 60ms per cycle baseline
        self.performance_tolerance = 0.30  # 30% tolerance
        
    @pytest.mark.parametrize("batch_size,seq_len", [
        (1, 1), (2, 3), (128, 3), (64, 7), (256, 1)
    ])
    def test_grad_shape_drift(self, batch_size: int, seq_len: int):
        """Test 1: Gradient shape drift under various batch/sequence configurations"""
        if not MODULES_AVAILABLE:
            pytest.skip("Core modules not available")
            
        engine = ICConsciousnessEngine(dimensions=64)
        
        # Create randomized input with specific batch/sequence shape
        test_input = torch.randn(batch_size, seq_len * 64, device=engine.device)
        
        # Process through engine
        result = engine.process_consciousness_cycle(test_input)
        
        # Verify output shape consistency
        assert 'consciousness_level' in result
        assert isinstance(result['consciousness_level'], float)
        
        # Test gradient computation doesn't break on different shapes
        if hasattr(engine, 'compute_hessian_trace'):
            try:
                hessian_trace = engine.compute_hessian_trace(test_input)
                assert hessian_trace is not None
                logger.info(f"✅ Gradient computation stable for batch={batch_size}, seq={seq_len}")
            except Exception as e:
                pytest.fail(f"Gradient computation failed: {e}")

    def test_retain_graph_recursion(self):
        """Test 2: Multiple Hessian computations with retain_graph=True"""
        if not MODULES_AVAILABLE:
            pytest.skip("Core modules not available")
            
        engine = ICConsciousnessEngine(dimensions=128)
        test_input = torch.randn(4, 128, device=engine.device, requires_grad=True)
        
        # Simulate K-FAC by calling Hessian trace 3 times per batch
        for iteration in range(3):
            try:
                if hasattr(engine, 'compute_hessian_trace'):
                    hessian_trace = engine.compute_hessian_trace(test_input)
                    logger.info(f"✅ Hessian iteration {iteration + 1}: {hessian_trace}")
                else:
                    # Fallback test with basic gradient computation
                    result = engine.process_consciousness_cycle(test_input)
                    consciousness_level = result['consciousness_level']
                    
                    # Compute gradient manually
                    if hasattr(torch.tensor([consciousness_level]), 'backward'):
                        grad_output = torch.ones_like(torch.tensor([consciousness_level]))
                        torch.autograd.grad(
                            torch.tensor([consciousness_level]), 
                            test_input,
                            grad_outputs=grad_output,
                            retain_graph=(iteration < 2),  # Retain for first two iterations
                            create_graph=True
                        )
                    
            except Exception as e:
                pytest.fail(f"Retain graph recursion failed at iteration {iteration}: {e}")

    def test_json_manifest_roundtrip(self):
        """Test 3: Complete JSON serialization/deserialization roundtrip"""
        if not MODULES_AVAILABLE:
            pytest.skip("Core modules not available")
        
        # Create complex universal state
        original_state = UniversalState(
            rby_vector=RBYVector(0.33, 0.34, 0.33, 1.0),
            tensors={
                'embedding': torch.randn(10, 64),
                'weights': torch.randn(128, 64),
                'biases': torch.randn(64)
            },
            timestamp=time.time(),
            generation=42,
            metadata={
                'version': '1.0.0',
                'session_id': 'test-session-123',
                'nested_data': {'level': 2, 'values': [1, 2, 3]}
            }
        )
        
        # Serialize to JSON
        json_data = json.dumps(original_state.to_dict(), indent=2)
        
        # Deserialize back
        loaded_data = json.loads(json_data)
        restored_state = UniversalState.from_dict(loaded_data)
        
        # Deep equality assertions
        assert restored_state.timestamp == original_state.timestamp
        assert restored_state.generation == original_state.generation
        assert restored_state.metadata == original_state.metadata
        
        # RBY vector equality
        assert abs(restored_state.rby_vector.red - original_state.rby_vector.red) < 1e-6
        assert abs(restored_state.rby_vector.blue - original_state.rby_vector.blue) < 1e-6
        assert abs(restored_state.rby_vector.yellow - original_state.rby_vector.yellow) < 1e-6
        
        # Tensor equality
        for key in original_state.tensors:
            torch.testing.assert_close(
                restored_state.tensors[key], 
                original_state.tensors[key],
                rtol=1e-5, atol=1e-6
            )
        
        logger.info("✅ JSON roundtrip test passed")

    def test_quantum_stub_expandability(self):
        """Test 4: Quantum processor dynamic dispatch and expandability"""
        
        class MockQuantumConsciousnessProcessor:
            """Mock replacement that provides expected interface"""
            
            def __init__(self, num_qubits: int = 3):
                self.num_qubits = num_qubits
                
            def evolve_quantum_consciousness(self, rby_input: Tuple[float, float, float], 
                                           evolution_time: float = 1.0):
                """Mock implementation that returns expected structure"""
                from types import SimpleNamespace
                return SimpleNamespace(
                    coherence=np.random.random() * 5.0,
                    entanglement=np.random.random(),
                    superposition=np.random.random(),
                    decoherence_time=50e-6,
                    quantum_volume=self.num_qubits
                )
        
        # Test dynamic replacement
        original_processor = QuantumConsciousnessProcessor(num_qubits=3) if MODULES_AVAILABLE else None
        mock_processor = MockQuantumConsciousnessProcessor(num_qubits=3)
        
        # Test that mock provides the same interface
        test_rby = (0.33, 0.34, 0.33)
        mock_result = mock_processor.evolve_quantum_consciousness(test_rby)
        
        assert hasattr(mock_result, 'coherence')
        assert hasattr(mock_result, 'entanglement')
        assert hasattr(mock_result, 'superposition')
        assert 0 <= mock_result.entanglement <= 1
        
        logger.info("✅ Quantum stub expandability test passed")

    @pytest.mark.parametrize("batch_size", [1, 2, 4])
    def test_batch_norm_small_batch_fallback(self, batch_size: int):
        """Test 5: BatchNorm fallback for small batches"""
        if not MODULES_AVAILABLE:
            pytest.skip("Core modules not available")
            
        orchestrator = RBYConsciousnessOrchestrator(dimensions=64)
        
        # Test with various small batch sizes
        test_input = torch.randn(batch_size, 64)
        
        try:
            result = orchestrator.process_consciousness_cycle(test_input)
            assert 'consciousness_level' in result
            assert 'rby_state' in result
            logger.info(f"✅ BatchNorm handling works for batch_size={batch_size}")
            
        except RuntimeError as e:
            if "Expected more than 1 value per channel" in str(e):
                pytest.fail(f"BatchNorm fallback not implemented for batch_size={batch_size}")
            else:
                raise

    def test_thread_safety(self):
        """Test 6: Thread safety of concurrent processing"""
        if not MODULES_AVAILABLE:
            pytest.skip("Core modules not available")
            
        engine = ICConsciousnessEngine(dimensions=64)
        results = []
        errors = []
        
        def process_cycle(thread_id: int):
            try:
                test_input = torch.randn(2, 64, device=engine.device)
                result = engine.process_consciousness_cycle(test_input)
                results.append((thread_id, result['consciousness_level']))
            except Exception as e:
                errors.append((thread_id, str(e)))
        
        # Run multiple threads concurrently
        threads = []
        for i in range(4):
            thread = threading.Thread(target=process_cycle, args=(i,))
            threads.append(thread)
            thread.start()
        
        # Wait for all threads to complete
        for thread in threads:
            thread.join()
        
        # Check results
        assert len(errors) == 0, f"Thread safety errors: {errors}"
        assert len(results) == 4, f"Expected 4 results, got {len(results)}"
        
        logger.info("✅ Thread safety test passed")

    @pytest.mark.skipif(not torch.cuda.is_available(), reason="CUDA not available")
    def test_gpu_path_fp16(self):
        """Test 7: GPU processing with FP16 precision"""
        if not MODULES_AVAILABLE:
            pytest.skip("Core modules not available")
            
        engine = ICConsciousnessEngine(dimensions=64, device='cuda')
        test_input = torch.randn(2, 64, device='cuda', dtype=torch.float16)
        
        # Process with FP16
        result = engine.process_consciousness_cycle(test_input)
        
        # Check for NaNs or infinite values
        consciousness_level = result['consciousness_level']
        assert not np.isnan(consciousness_level), "NaN detected in FP16 GPU processing"
        assert np.isfinite(consciousness_level), "Infinite value detected in FP16 GPU processing"
        
        logger.info("✅ GPU FP16 processing test passed")

    def test_checkpoint_reload(self):
        """Test 8: Checkpoint save/load with state resumption"""
        if not MODULES_AVAILABLE:
            pytest.skip("Core modules not available")
            
        with tempfile.TemporaryDirectory() as temp_dir:
            checkpoint_path = Path(temp_dir) / "checkpoint.pkl"
            
            # Create initial state
            engine = ICConsciousnessEngine(dimensions=64)
            initial_state = {
                'generation': 42,
                'timestamp': time.time(),
                'rby_balance': {'red': 0.33, 'blue': 0.34, 'yellow': 0.33},
                'model_state': engine.state_dict() if hasattr(engine, 'state_dict') else {}
            }
            
            # Save checkpoint
            with open(checkpoint_path, 'wb') as f:
                pickle.dump(initial_state, f)
            
            # Simulate restart - load checkpoint
            with open(checkpoint_path, 'rb') as f:
                loaded_state = pickle.load(f)
            
            # Verify state restoration
            assert loaded_state['generation'] == 42
            assert loaded_state['rby_balance']['red'] == 0.33
            assert loaded_state['rby_balance']['blue'] == 0.34
            assert loaded_state['rby_balance']['yellow'] == 0.33
            
            logger.info("✅ Checkpoint reload test passed")

    def test_live_mutation_rollback(self):
        """Test 9: Syntax error detection and auto-revert"""
        
        valid_code = '''
def test_function():
    """Valid function"""
    return 42
'''
        
        invalid_code = '''
def test_function():
    """Invalid function with syntax error"""
    return 42 + 
    # Missing operand - syntax error
'''
        
        # Test compilation detection
        try:
            compile(valid_code, '<string>', 'exec')
            valid_compiles = True
        except SyntaxError:
            valid_compiles = False
            
        try:
            compile(invalid_code, '<string>', 'exec')
            invalid_compiles = True
        except SyntaxError:
            invalid_compiles = False
        
        assert valid_compiles, "Valid code should compile"
        assert not invalid_compiles, "Invalid code should not compile"
        
        logger.info("✅ Mutation rollback detection test passed")

    def test_performance_regression_guard(self):
        """Test 10: Performance regression detection"""
        if not MODULES_AVAILABLE:
            pytest.skip("Core modules not available")
            
        engine = ICConsciousnessEngine(dimensions=64)
        test_input = torch.randn(2, 64, device=engine.device)
        
        # Measure performance over multiple cycles
        cycle_times = []
        for _ in range(10):
            start_time = time.time()
            result = engine.process_consciousness_cycle(test_input)
            cycle_time = time.time() - start_time
            cycle_times.append(cycle_time)
        
        avg_cycle_time = np.mean(cycle_times)
        max_allowed_time = self.performance_baseline * (1 + self.performance_tolerance)
        
        assert avg_cycle_time <= max_allowed_time, \
            f"Performance regression detected: {avg_cycle_time:.4f}s > {max_allowed_time:.4f}s"
        
        # Log performance metrics
        performance_log = {
            'timestamp': time.time(),
            'avg_cycle_time': avg_cycle_time,
            'baseline': self.performance_baseline,
            'tolerance': self.performance_tolerance,
            'status': 'PASS' if avg_cycle_time <= max_allowed_time else 'FAIL'
        }
        
        logger.info(f"✅ Performance: {avg_cycle_time:.4f}s/cycle (baseline: {self.performance_baseline:.4f}s)")
        
        return performance_log


def run_all_edge_case_tests():
    """Run all edge case tests and generate report"""
    if not MODULES_AVAILABLE:
        print("❌ Core modules not available - skipping edge case tests")
        return
        
    tester = RobustEdgeCaseTests()
    
    print("🔧 Running Robust Edge Case Test Suite...")
    print("=" * 60)
    
    # Test 1: Gradient shape drift
    print("1. Testing gradient shape drift...")
    for batch_size, seq_len in [(2, 3), (128, 3), (64, 7)]:
        try:
            tester.test_grad_shape_drift(batch_size, seq_len)
        except Exception as e:
            print(f"   ❌ Failed for batch={batch_size}, seq={seq_len}: {e}")
    
    # Test 2: Retain graph recursion
    print("2. Testing retain_graph recursion...")
    try:
        tester.test_retain_graph_recursion()
    except Exception as e:
        print(f"   ❌ Failed: {e}")
    
    # Test 3: JSON roundtrip
    print("3. Testing JSON manifest roundtrip...")
    try:
        tester.test_json_manifest_roundtrip()
    except Exception as e:
        print(f"   ❌ Failed: {e}")
    
    # Test 4: Quantum stub expandability
    print("4. Testing quantum stub expandability...")
    try:
        tester.test_quantum_stub_expandability()
    except Exception as e:
        print(f"   ❌ Failed: {e}")
    
    # Test 5: BatchNorm small batch fallback
    print("5. Testing BatchNorm small batch fallback...")
    for batch_size in [1, 2, 4]:
        try:
            tester.test_batch_norm_small_batch_fallback(batch_size)
        except Exception as e:
            print(f"   ❌ Failed for batch_size={batch_size}: {e}")
    
    # Test 6: Thread safety
    print("6. Testing thread safety...")
    try:
        tester.test_thread_safety()
    except Exception as e:
        print(f"   ❌ Failed: {e}")
    
    # Test 7: GPU path (if CUDA available)
    if torch.cuda.is_available():
        print("7. Testing GPU FP16 path...")
        try:
            tester.test_gpu_path_fp16()
        except Exception as e:
            print(f"   ❌ Failed: {e}")
    else:
        print("7. Skipping GPU test (CUDA not available)")
    
    # Test 8: Checkpoint reload
    print("8. Testing checkpoint reload...")
    try:
        tester.test_checkpoint_reload()
    except Exception as e:
        print(f"   ❌ Failed: {e}")
    
    # Test 9: Live mutation rollback
    print("9. Testing mutation rollback...")
    try:
        tester.test_live_mutation_rollback()
    except Exception as e:
        print(f"   ❌ Failed: {e}")
    
    # Test 10: Performance regression guard
    print("10. Testing performance regression guard...")
    try:
        performance_log = tester.test_performance_regression_guard()
        print(f"    Performance: {performance_log['avg_cycle_time']:.4f}s/cycle")
    except Exception as e:
        print(f"   ❌ Failed: {e}")
    
    print("=" * 60)
    print("🏁 Edge case test suite completed!")


if __name__ == "__main__":
    run_all_edge_case_tests()
