#!/usr/bin/env python3
"""
Continuous Integration and Automated Testing Pipeline for ATTACK Framework
Implements GitHub Actions-style testing with multiple environments and configurations.
"""

import os
import sys
import subprocess
import json
import time
import platform
import tempfile
import shutil
from pathlib import Path
from typing import Dict, List, Any, Optional
import concurrent.futures
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class TestMatrix:
    """Test matrix configuration for different environments"""
    
    OPERATING_SYSTEMS = ['Windows', 'Linux', 'Darwin']  # Darwin = macOS
    PYTHON_VERSIONS = ['3.8', '3.9', '3.10', '3.11']
    COMPUTE_BACKENDS = ['cpu', 'cuda']
    BATCH_SIZES = [1, 2, 4, 8, 16, 32, 64, 128]
    
    @classmethod
    def get_current_environment(cls) -> Dict[str, str]:
        """Get current test environment details"""
        return {
            'os': platform.system(),
            'python_version': f"{sys.version_info.major}.{sys.version_info.minor}",
            'platform': platform.platform(),
            'architecture': platform.architecture()[0],
            'cpu_count': str(os.cpu_count()),
            'hostname': platform.node()
        }


class PerformanceBenchmark:
    """Performance benchmarking and regression detection"""
    
    def __init__(self, baseline_file: str = 'performance_baseline.json'):
        self.baseline_file = Path(baseline_file)
        self.current_results = {}
        self.load_baseline()
    
    def load_baseline(self):
        """Load performance baseline from file"""
        if self.baseline_file.exists():
            with open(self.baseline_file, 'r') as f:
                self.baseline = json.load(f)
        else:
            self.baseline = {
                'consciousness_cycle_time': 0.06,  # 60ms baseline
                'quantum_evolution_time': 0.02,    # 20ms baseline
                'rby_processing_time': 0.01,       # 10ms baseline
                'json_serialization_time': 0.001,  # 1ms baseline
                'thread_safety_overhead': 0.005    # 5ms baseline
            }
            self.save_baseline()
    
    def save_baseline(self):
        """Save performance baseline to file"""
        with open(self.baseline_file, 'w') as f:
            json.dump(self.baseline, f, indent=2)
    
    def measure_performance(self, test_name: str, func, *args, **kwargs):
        """Measure function performance and compare to baseline"""
        start_time = time.perf_counter()
        result = func(*args, **kwargs)
        execution_time = time.perf_counter() - start_time
        
        self.current_results[test_name] = execution_time
        
        # Check regression (30% tolerance)
        baseline_time = self.baseline.get(test_name, execution_time)
        regression_threshold = baseline_time * 1.30
        
        status = {
            'execution_time': execution_time,
            'baseline_time': baseline_time,
            'regression_threshold': regression_threshold,
            'is_regression': execution_time > regression_threshold,
            'improvement_pct': ((baseline_time - execution_time) / baseline_time) * 100
        }
        
        return result, status


class CITestRunner:
    """Main CI test runner with comprehensive test execution"""
    
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.test_results = {}
        self.benchmark = PerformanceBenchmark()
        self.environment = TestMatrix.get_current_environment()
        
    def run_unit_tests(self) -> Dict[str, Any]:
        """Run unit tests with pytest"""
        logger.info("🧪 Running unit tests...")
        
        try:
            # Import test modules
            sys.path.insert(0, str(self.project_root))
            from robust_edge_case_tests import RobustEdgeCaseTests
            
            tester = RobustEdgeCaseTests()
            results = {}
            
            # Test 1: Gradient shape drift
            logger.info("  Testing gradient shape consistency...")
            try:
                for batch_size, seq_len in [(2, 3), (128, 3)]:
                    tester.test_grad_shape_drift(batch_size, seq_len)
                results['gradient_shape_drift'] = 'PASS'
            except Exception as e:
                results['gradient_shape_drift'] = f'FAIL: {e}'
            
            # Test 2: JSON serialization
            logger.info("  Testing JSON roundtrip...")
            try:
                tester.test_json_manifest_roundtrip()
                results['json_roundtrip'] = 'PASS'
            except Exception as e:
                results['json_roundtrip'] = f'FAIL: {e}'
            
            # Test 3: Thread safety
            logger.info("  Testing thread safety...")
            try:
                tester.test_thread_safety()
                results['thread_safety'] = 'PASS'
            except Exception as e:
                results['thread_safety'] = f'FAIL: {e}'
            
            # Test 4: Performance regression
            logger.info("  Testing performance regression...")
            try:
                performance_log = tester.test_performance_regression_guard()
                results['performance_regression'] = 'PASS'
                results['performance_data'] = performance_log
            except Exception as e:
                results['performance_regression'] = f'FAIL: {e}'
            
            return results
            
        except ImportError as e:
            logger.error(f"Failed to import test modules: {e}")
            return {'import_error': str(e)}
    
    def run_integration_tests(self) -> Dict[str, Any]:
        """Run integration tests"""
        logger.info("🔗 Running integration tests...")
        
        try:
            # Run the unified integration test
            result = subprocess.run([
                sys.executable, 'unified_integration_test.py'
            ], cwd=self.project_root, capture_output=True, text=True, timeout=300)
            
            return {
                'exit_code': result.returncode,
                'stdout': result.stdout,
                'stderr': result.stderr,
                'status': 'PASS' if result.returncode == 0 else 'FAIL'
            }
            
        except subprocess.TimeoutExpired:
            return {'status': 'TIMEOUT', 'message': 'Integration tests timed out after 5 minutes'}
        except Exception as e:
            return {'status': 'ERROR', 'message': str(e)}
    
    def run_performance_benchmarks(self) -> Dict[str, Any]:
        """Run performance benchmarks"""
        logger.info("⚡ Running performance benchmarks...")
        
        try:
            sys.path.insert(0, str(self.project_root))
            from enhanced_quantum_consciousness_bridge import EnhancedQuantumConsciousnessProcessor
            
            processor = EnhancedQuantumConsciousnessProcessor(num_qubits=4)
            results = {}
            
            # Benchmark 1: Quantum consciousness evolution
            def quantum_evolution():
                return processor.evolve_quantum_consciousness((0.33, 0.34, 0.33))
            
            result, perf_status = self.benchmark.measure_performance(
                'quantum_evolution_time', quantum_evolution
            )
            results['quantum_evolution'] = perf_status
            
            # Benchmark 2: JSON serialization
            def json_serialization():
                data = result.to_dict()
                return json.dumps(data)
            
            _, perf_status = self.benchmark.measure_performance(
                'json_serialization_time', json_serialization
            )
            results['json_serialization'] = perf_status
            
            # Benchmark 3: Thread safety overhead
            def thread_safety_test():
                import threading
                threads = []
                for _ in range(4):
                    thread = threading.Thread(target=quantum_evolution)
                    threads.append(thread)
                    thread.start()
                for thread in threads:
                    thread.join()
            
            _, perf_status = self.benchmark.measure_performance(
                'thread_safety_overhead', thread_safety_test
            )
            results['thread_safety_overhead'] = perf_status
            
            return results
            
        except ImportError as e:
            return {'import_error': str(e)}
        except Exception as e:
            return {'error': str(e)}
    
    def run_memory_leak_tests(self) -> Dict[str, Any]:
        """Test for memory leaks in long-running processes"""
        logger.info("🧠 Running memory leak tests...")
        
        try:
            import psutil
            import gc
            
            process = psutil.Process()
            initial_memory = process.memory_info().rss / 1024 / 1024  # MB
            
            # Run many cycles to detect memory leaks
            sys.path.insert(0, str(self.project_root))
            from enhanced_quantum_consciousness_bridge import EnhancedQuantumConsciousnessProcessor
            
            processor = EnhancedQuantumConsciousnessProcessor(num_qubits=3)
            
            for i in range(100):
                processor.evolve_quantum_consciousness((0.33, 0.34, 0.33))
                if i % 10 == 0:
                    gc.collect()  # Force garbage collection
            
            final_memory = process.memory_info().rss / 1024 / 1024  # MB
            memory_increase = final_memory - initial_memory
            
            # Memory increase should be less than 50MB for 100 cycles
            memory_leak_detected = memory_increase > 50
            
            return {
                'initial_memory_mb': initial_memory,
                'final_memory_mb': final_memory,
                'memory_increase_mb': memory_increase,
                'memory_leak_detected': memory_leak_detected,
                'status': 'FAIL' if memory_leak_detected else 'PASS'
            }
            
        except ImportError:
            return {'status': 'SKIP', 'reason': 'psutil not available'}
        except Exception as e:
            return {'status': 'ERROR', 'error': str(e)}
    
    def run_gpu_tests(self) -> Dict[str, Any]:
        """Run GPU-specific tests if CUDA is available"""
        logger.info("🚀 Running GPU tests...")
        
        try:
            import torch
            
            if not torch.cuda.is_available():
                return {'status': 'SKIP', 'reason': 'CUDA not available'}
            
            # Basic GPU functionality test
            device = torch.device('cuda')
            test_tensor = torch.randn(1024, 1024, device=device)
            result = torch.mm(test_tensor, test_tensor.t())
            
            # Check for NaN or Inf values
            has_nan = torch.isnan(result).any().item()
            has_inf = torch.isinf(result).any().item()
            
            # Memory test
            initial_memory = torch.cuda.memory_allocated()
            
            # FP16 test
            try:
                fp16_tensor = test_tensor.half()
                fp16_result = torch.mm(fp16_tensor, fp16_tensor.t())
                fp16_status = 'PASS'
            except Exception as e:
                fp16_status = f'FAIL: {e}'
            
            final_memory = torch.cuda.memory_allocated()
            
            return {
                'cuda_available': True,
                'device_name': torch.cuda.get_device_name(),
                'memory_total': torch.cuda.get_device_properties(0).total_memory,
                'has_nan': has_nan,
                'has_inf': has_inf,
                'fp16_support': fp16_status,
                'memory_allocated': final_memory - initial_memory,
                'status': 'PASS' if not (has_nan or has_inf) else 'FAIL'
            }
            
        except ImportError:
            return {'status': 'SKIP', 'reason': 'PyTorch not available'}
        except Exception as e:
            return {'status': 'ERROR', 'error': str(e)}
    
    def run_stress_tests(self) -> Dict[str, Any]:
        """Run stress tests with high load"""
        logger.info("💪 Running stress tests...")
        
        try:
            import concurrent.futures
            import random
            
            sys.path.insert(0, str(self.project_root))
            from enhanced_quantum_consciousness_bridge import EnhancedQuantumConsciousnessProcessor
            
            processor = EnhancedQuantumConsciousnessProcessor(num_qubits=3)
            
            def stress_worker(worker_id: int):
                """Single worker for stress testing"""
                results = []
                for i in range(10):
                    # Random RBY inputs
                    r = random.random()
                    b = random.random()
                    y = random.random()
                    
                    try:
                        result = processor.evolve_quantum_consciousness((r, b, y))
                        results.append({
                            'worker_id': worker_id,
                            'iteration': i,
                            'coherence': result.coherence,
                            'success': True
                        })
                    except Exception as e:
                        results.append({
                            'worker_id': worker_id,
                            'iteration': i,
                            'error': str(e),
                            'success': False
                        })
                
                return results
            
            # Run stress test with multiple workers
            start_time = time.time()
            with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
                futures = [executor.submit(stress_worker, i) for i in range(8)]
                all_results = []
                for future in concurrent.futures.as_completed(futures):
                    all_results.extend(future.result())
            
            total_time = time.time() - start_time
            
            # Analyze results
            total_operations = len(all_results)
            successful_operations = sum(1 for r in all_results if r['success'])
            success_rate = successful_operations / total_operations if total_operations > 0 else 0
            
            return {
                'total_operations': total_operations,
                'successful_operations': successful_operations,
                'success_rate': success_rate,
                'total_time': total_time,
                'operations_per_second': total_operations / total_time,
                'status': 'PASS' if success_rate >= 0.95 else 'FAIL',
                'detailed_results': all_results[:10]  # First 10 for debugging
            }
            
        except Exception as e:
            return {'status': 'ERROR', 'error': str(e)}
    
    def generate_ci_report(self, results: Dict[str, Any]) -> str:
        """Generate comprehensive CI report"""
        report = []
        report.append("# ATTACK Framework CI Test Report")
        report.append(f"Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}")
        report.append("")
        
        # Environment information
        report.append("## Environment")
        for key, value in self.environment.items():
            report.append(f"- **{key}**: {value}")
        report.append("")
        
        # Test results summary
        report.append("## Test Results Summary")
        total_tests = 0
        passed_tests = 0
        
        for category, category_results in results.items():
            if isinstance(category_results, dict) and 'status' in category_results:
                total_tests += 1
                if category_results['status'] == 'PASS':
                    passed_tests += 1
                
                status_emoji = "✅" if category_results['status'] == 'PASS' else "❌"
                report.append(f"- {status_emoji} **{category}**: {category_results['status']}")
        
        success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
        report.append(f"\n**Overall Success Rate**: {success_rate:.1f}% ({passed_tests}/{total_tests})")
        report.append("")
        
        # Detailed results
        report.append("## Detailed Results")
        for category, category_results in results.items():
            report.append(f"### {category}")
            if isinstance(category_results, dict):
                for key, value in category_results.items():
                    if key != 'detailed_results':  # Skip large data
                        report.append(f"- **{key}**: {value}")
            else:
                report.append(f"- {category_results}")
            report.append("")
        
        return "\n".join(report)
    
    def run_full_ci_pipeline(self) -> Dict[str, Any]:
        """Run the complete CI pipeline"""
        logger.info("🚀 Starting ATTACK Framework CI Pipeline")
        logger.info("=" * 60)
        
        pipeline_start = time.time()
        results = {}
        
        # Run all test categories
        test_categories = [
            ('unit_tests', self.run_unit_tests),
            ('integration_tests', self.run_integration_tests),
            ('performance_benchmarks', self.run_performance_benchmarks),
            ('memory_leak_tests', self.run_memory_leak_tests),
            ('gpu_tests', self.run_gpu_tests),
            ('stress_tests', self.run_stress_tests)
        ]
        
        for category_name, test_function in test_categories:
            try:
                logger.info(f"Running {category_name}...")
                results[category_name] = test_function()
                logger.info(f"  Status: {results[category_name].get('status', 'UNKNOWN')}")
            except Exception as e:
                logger.error(f"  Failed: {e}")
                results[category_name] = {'status': 'ERROR', 'error': str(e)}
        
        # Calculate overall pipeline status
        pipeline_time = time.time() - pipeline_start
        results['pipeline_metadata'] = {
            'total_time': pipeline_time,
            'environment': self.environment,
            'timestamp': time.time()
        }
        
        # Generate report
        report = self.generate_ci_report(results)
        
        # Save results
        results_file = self.project_root / 'ci_results.json'
        with open(results_file, 'w') as f:
            json.dump(results, f, indent=2)
        
        report_file = self.project_root / 'ci_report.md'
        with open(report_file, 'w') as f:
            f.write(report)
        
        logger.info("=" * 60)
        logger.info(f"🏁 CI Pipeline completed in {pipeline_time:.2f}s")
        logger.info(f"📊 Results saved to: {results_file}")
        logger.info(f"📝 Report saved to: {report_file}")
        
        return results


def main():
    """Main entry point for CI pipeline"""
    import argparse
    
    parser = argparse.ArgumentParser(description='ATTACK Framework CI Pipeline')
    parser.add_argument('--project-root', default='.', help='Project root directory')
    parser.add_argument('--category', choices=[
        'unit', 'integration', 'performance', 'memory', 'gpu', 'stress', 'all'
    ], default='all', help='Test category to run')
    parser.add_argument('--output-format', choices=['json', 'markdown', 'both'], 
                       default='both', help='Output format')
    
    args = parser.parse_args()
    
    # Initialize CI runner
    ci_runner = CITestRunner(args.project_root)
    
    # Run specified test category
    if args.category == 'all':
        results = ci_runner.run_full_ci_pipeline()
    elif args.category == 'unit':
        results = {'unit_tests': ci_runner.run_unit_tests()}
    elif args.category == 'integration':
        results = {'integration_tests': ci_runner.run_integration_tests()}
    elif args.category == 'performance':
        results = {'performance_benchmarks': ci_runner.run_performance_benchmarks()}
    elif args.category == 'memory':
        results = {'memory_leak_tests': ci_runner.run_memory_leak_tests()}
    elif args.category == 'gpu':
        results = {'gpu_tests': ci_runner.run_gpu_tests()}
    elif args.category == 'stress':
        results = {'stress_tests': ci_runner.run_stress_tests()}
    
    # Output results
    if args.output_format in ['json', 'both']:
        print(json.dumps(results, indent=2))
    
    if args.output_format in ['markdown', 'both']:
        report = ci_runner.generate_ci_report(results)
        print("\n" + report)


if __name__ == "__main__":
    main()
