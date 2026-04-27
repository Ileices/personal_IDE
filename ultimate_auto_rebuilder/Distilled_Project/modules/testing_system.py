"""
Testing System Module
Harvested from test_exploration_fixed.py and test_exploration.py

This module provides comprehensive testing capabilities:
- Safe module imports and testing
- Component exploration and analysis
- Automated test generation
- Compatibility checking
- Performance benchmarking
- Error detection and reporting
"""

import sys
import os
import importlib.util
import importlib
import traceback
import time
import tempfile
import subprocess
import contextlib
import threading
import json
from pathlib import Path
from collections import defaultdict
import ast
import inspect
import warnings


class TestingSystem:
    """
    Comprehensive testing system for rebuilt projects
    """
    
    def __init__(self, config):
        self.config = config
        self.base_dir = Path(__file__).parent.parent
        
        # Testing configuration
        self.output_folder = config.get('output_folder', 'rebuilt_project')
        self.test_timeout = 30  # seconds
        self.max_test_modules = 100
        
        # Testing state
        self.test_results = {
            'import_tests': {},
            'function_tests': {},
            'class_tests': {},
            'integration_tests': {},
            'performance_tests': {},
            'errors': []
        }
        
        # Test statistics
        self.test_stats = {
            'total_tests': 0,
            'passed_tests': 0,
            'failed_tests': 0,
            'skipped_tests': 0,
            'start_time': None,
            'end_time': None
        }
        
        # Initialize testing environment
        self.setup_testing_environment()
    
    def setup_testing_environment(self):
        """
        Setup the testing environment
        """
        # Set UTF-8 encoding for output
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8')
        
        # Add rebuilt project to Python path
        rebuilt_project_path = self.base_dir / self.output_folder
        if rebuilt_project_path.exists():
            sys.path.insert(0, str(rebuilt_project_path))
    
    def run_comprehensive_tests(self):
        """
        Run comprehensive testing suite
        """
        print("\n🧪 Starting Comprehensive Testing Suite...")
        self.test_stats['start_time'] = time.time()
        
        try:
            # Test 1: Basic import tests
            self.run_import_tests()
            
            # Test 2: Component exploration
            self.run_component_exploration_tests()
            
            # Test 3: Function and class tests
            self.run_function_tests()
            self.run_class_tests()
            
            # Test 4: Integration tests
            self.run_integration_tests()
            
            # Test 5: Performance tests
            self.run_performance_tests()
            
            # Test 6: Error detection
            self.run_error_detection_tests()
            
        except Exception as e:
            print(f"❌ Error in comprehensive testing: {e}")
            traceback.print_exc()
        
        self.test_stats['end_time'] = time.time()
        self.show_test_summary()
    
    def run_import_tests(self):
        """
        Test basic package imports
        """
        print("\n📦 Testing Basic Package Imports...")
        
        packages_to_test = ['core', 'io', 'train', 'tools', 'ui', 'net']
        
        for package in packages_to_test:
            test_result = self.safe_import_test(package)
            self.test_results['import_tests'][package] = test_result
            
            if test_result['success']:
                print(f"[✅] Successfully imported package: {package}")
                if test_result.get('info'):
                    print(f"     {test_result['info']}")
            else:
                print(f"[❌] Failed to import package {package}: {test_result['error']}")
    
    def safe_import_test(self, package_name):
        """
        Safely test importing a package
        """
        try:
            module = importlib.import_module(package_name)
            
            # Get module information
            info_parts = []
            if hasattr(module, '__all__'):
                info_parts.append(f"Available items: {len(module.__all__)}")
            if hasattr(module, '__doc__') and module.__doc__:
                doc_preview = module.__doc__[:100].replace('\n', ' ')
                info_parts.append(f"Documentation: {doc_preview}...")
            
            self.test_stats['passed_tests'] += 1
            return {
                'success': True,
                'module': module,
                'info': ' | '.join(info_parts) if info_parts else None
            }
            
        except Exception as e:
            self.test_stats['failed_tests'] += 1
            return {
                'success': False,
                'error': str(e),
                'traceback': traceback.format_exc()
            }
        finally:
            self.test_stats['total_tests'] += 1
    
    def run_component_exploration_tests(self):
        """
        Run component exploration tests
        """
        print("\n🔍 Testing Component Exploration...")
        
        rebuilt_project_path = self.base_dir / self.output_folder
        
        # Test specific components
        test_components = [
            ("core", "ae_AEOS.py"),
            ("core", "all_fluid_ai_combat.py"),
            ("core", "games_georpg.py"),
            ("tools", "script_analysis.py"),
            ("ui", "dashboard.py")
        ]
        
        for package, filename in test_components:
            self.test_component(package, filename)
    
    def test_component(self, package, filename):
        """
        Test a specific component
        """
        component_path = self.base_dir / self.output_folder / package / filename
        
        if not component_path.exists():
            print(f"[⚠️ ] Component not found: {package}/{filename}")
            self.test_stats['skipped_tests'] += 1
            return
        
        try:
            # Safe import of the component
            module = self.safe_import_module(component_path, f"{package}_{filename[:-3]}")
            
            if module:
                # Analyze the component
                analysis = self.analyze_component(module, filename)
                self.test_results['function_tests'][f"{package}/{filename}"] = analysis
                
                print(f"[✅] Component {package}/{filename} analyzed successfully")
                print(f"     Classes: {len(analysis['classes'])}")
                print(f"     Functions: {len(analysis['functions'])}")
                
                self.test_stats['passed_tests'] += 1
            else:
                print(f"[❌] Failed to import component {package}/{filename}")
                self.test_stats['failed_tests'] += 1
                
        except Exception as e:
            print(f"[❌] Error testing component {package}/{filename}: {e}")
            self.test_stats['failed_tests'] += 1
        
        self.test_stats['total_tests'] += 1
    
    def safe_import_module(self, module_path, module_name):
        """
        Safely import a module from file path
        """
        try:
            spec = importlib.util.spec_from_file_location(module_name, module_path)
            if spec and spec.loader:
                module = importlib.util.module_from_spec(spec)
                
                # Set timeout for module execution
                with self.timeout_context(self.test_timeout):
                    spec.loader.exec_module(module)
                
                return module
                
        except Exception as e:
            print(f"[❌] Failed to import {module_name}: {e}")
            return None
    
    @contextlib.contextmanager
    def timeout_context(self, timeout):
        """
        Context manager for timeout handling
        """
        def timeout_handler():
            raise TimeoutError(f"Operation timed out after {timeout} seconds")
        
        timer = threading.Timer(timeout, timeout_handler)
        timer.start()
        try:
            yield
        finally:
            timer.cancel()
    
    def analyze_component(self, module, filename):
        """
        Analyze a component module
        """
        analysis = {
            'filename': filename,
            'classes': [],
            'functions': [],
            'variables': [],
            'imports': [],
            'errors': []
        }
        
        try:
            # Get classes
            for name, obj in inspect.getmembers(module, inspect.isclass):
                if not name.startswith('_'):
                    class_info = {
                        'name': name,
                        'methods': [method for method in dir(obj) if not method.startswith('_')],
                        'doc': inspect.getdoc(obj) or '',
                        'module': getattr(obj, '__module__', 'unknown')
                    }
                    analysis['classes'].append(class_info)
            
            # Get functions
            for name, obj in inspect.getmembers(module, inspect.isfunction):
                if not name.startswith('_'):
                    try:
                        sig = inspect.signature(obj)
                        func_info = {
                            'name': name,
                            'signature': str(sig),
                            'doc': inspect.getdoc(obj) or '',
                            'module': getattr(obj, '__module__', 'unknown')
                        }
                        analysis['functions'].append(func_info)
                    except Exception as e:
                        analysis['errors'].append(f"Error analyzing function {name}: {e}")
            
            # Get module-level variables
            for name, obj in inspect.getmembers(module):
                if not name.startswith('_') and not inspect.isfunction(obj) and not inspect.isclass(obj):
                    if not inspect.ismodule(obj):
                        analysis['variables'].append({
                            'name': name,
                            'type': type(obj).__name__,
                            'value': str(obj)[:100] if len(str(obj)) <= 100 else str(obj)[:97] + "..."
                        })
        
        except Exception as e:
            analysis['errors'].append(f"Error analyzing module: {e}")
        
        return analysis
    
    def run_function_tests(self):
        """
        Run function-specific tests
        """
        print("\n🔧 Testing Functions...")
        
        # Test functions from successfully imported modules
        for package_name, test_result in self.test_results['import_tests'].items():
            if test_result['success'] and 'module' in test_result:
                module = test_result['module']
                self.test_module_functions(module, package_name)
    
    def test_module_functions(self, module, package_name):
        """
        Test functions in a module
        """
        try:
            functions = [name for name, obj in inspect.getmembers(module, inspect.isfunction)
                        if not name.startswith('_')]
            
            if functions:
                print(f"     Testing {len(functions)} functions in {package_name}")
                
                for func_name in functions[:5]:  # Test first 5 functions
                    self.test_single_function(module, func_name, package_name)
        
        except Exception as e:
            print(f"[❌] Error testing functions in {package_name}: {e}")
    
    def test_single_function(self, module, func_name, package_name):
        """
        Test a single function
        """
        try:
            func = getattr(module, func_name)
            sig = inspect.signature(func)
            
            # Basic function analysis
            test_info = {
                'name': func_name,
                'signature': str(sig),
                'parameters': len(sig.parameters),
                'has_defaults': any(p.default != inspect.Parameter.empty for p in sig.parameters.values()),
                'doc': inspect.getdoc(func) or 'No documentation'
            }
            
            # Try to call with no arguments if possible
            if len(sig.parameters) == 0:
                try:
                    with self.timeout_context(5):
                        result = func()
                    test_info['callable'] = True
                    test_info['result_type'] = type(result).__name__
                except Exception as e:
                    test_info['callable'] = False
                    test_info['error'] = str(e)
            else:
                test_info['callable'] = 'requires_parameters'
            
            self.test_results['function_tests'][f"{package_name}.{func_name}"] = test_info
            
        except Exception as e:
            print(f"[❌] Error testing function {func_name}: {e}")
    
    def run_class_tests(self):
        """
        Run class-specific tests
        """
        print("\n🏗️  Testing Classes...")
        
        # Test classes from successfully imported modules
        for package_name, test_result in self.test_results['import_tests'].items():
            if test_result['success'] and 'module' in test_result:
                module = test_result['module']
                self.test_module_classes(module, package_name)
    
    def test_module_classes(self, module, package_name):
        """
        Test classes in a module
        """
        try:
            classes = [name for name, obj in inspect.getmembers(module, inspect.isclass)
                      if not name.startswith('_')]
            
            if classes:
                print(f"     Testing {len(classes)} classes in {package_name}")
                
                for class_name in classes[:3]:  # Test first 3 classes
                    self.test_single_class(module, class_name, package_name)
        
        except Exception as e:
            print(f"[❌] Error testing classes in {package_name}: {e}")
    
    def test_single_class(self, module, class_name, package_name):
        """
        Test a single class
        """
        try:
            cls = getattr(module, class_name)
            
            # Basic class analysis
            test_info = {
                'name': class_name,
                'bases': [base.__name__ for base in cls.__bases__],
                'methods': [method for method in dir(cls) if not method.startswith('_')],
                'doc': inspect.getdoc(cls) or 'No documentation',
                'instantiable': False
            }
            
            # Try to instantiate the class
            try:
                init_sig = inspect.signature(cls.__init__)
                init_params = list(init_sig.parameters.values())[1:]  # Skip 'self'
                
                if not init_params or all(p.default != inspect.Parameter.empty for p in init_params):
                    # Can instantiate with no arguments or all have defaults
                    with self.timeout_context(5):
                        instance = cls()
                    test_info['instantiable'] = True
                    test_info['instance_type'] = type(instance).__name__
                else:
                    test_info['instantiable'] = 'requires_parameters'
                    
            except Exception as e:
                test_info['instantiation_error'] = str(e)
            
            self.test_results['class_tests'][f"{package_name}.{class_name}"] = test_info
            
        except Exception as e:
            print(f"[❌] Error testing class {class_name}: {e}")
    
    def run_integration_tests(self):
        """
        Run integration tests between modules
        """
        print("\n🔗 Testing Integration...")
        
        # Test cross-package imports and interactions
        successful_packages = [
            name for name, result in self.test_results['import_tests'].items()
            if result['success']
        ]
        
        if len(successful_packages) > 1:
            print(f"     Testing integration between {len(successful_packages)} packages")
            
            # Test basic interactions
            for i, package1 in enumerate(successful_packages):
                for package2 in successful_packages[i+1:]:
                    self.test_package_integration(package1, package2)
    
    def test_package_integration(self, package1, package2):
        """
        Test integration between two packages
        """
        try:
            # Simple integration test: check if packages can coexist
            module1 = self.test_results['import_tests'][package1]['module']
            module2 = self.test_results['import_tests'][package2]['module']
            
            integration_info = {
                'package1': package1,
                'package2': package2,
                'can_coexist': True,
                'shared_names': []
            }
            
            # Check for naming conflicts
            names1 = set(dir(module1))
            names2 = set(dir(module2))
            shared_names = names1.intersection(names2)
            
            # Filter out common Python attributes
            common_attrs = {'__name__', '__doc__', '__file__', '__package__', '__path__'}
            shared_names = shared_names - common_attrs
            
            integration_info['shared_names'] = list(shared_names)
            
            self.test_results['integration_tests'][f"{package1}+{package2}"] = integration_info
            
        except Exception as e:
            print(f"[❌] Error testing integration {package1}+{package2}: {e}")
    
    def run_performance_tests(self):
        """
        Run performance tests
        """
        print("\n⚡ Testing Performance...")
        
        # Test import times
        for package_name in ['core', 'io', 'train', 'tools', 'ui', 'net']:
            self.test_import_performance(package_name)
    
    def test_import_performance(self, package_name):
        """
        Test import performance for a package
        """
        try:
            start_time = time.time()
            
            # Remove from cache if already imported
            if package_name in sys.modules:
                del sys.modules[package_name]
            
            # Time the import
            importlib.import_module(package_name)
            
            import_time = time.time() - start_time
            
            self.test_results['performance_tests'][package_name] = {
                'import_time': import_time,
                'status': 'fast' if import_time < 1.0 else 'slow' if import_time < 5.0 else 'very_slow'
            }
            
            print(f"     {package_name}: {import_time:.3f}s")
            
        except Exception as e:
            print(f"[❌] Performance test failed for {package_name}: {e}")
    
    def run_error_detection_tests(self):
        """
        Run error detection tests
        """
        print("\n🔍 Testing Error Detection...")
        
        # Check for common errors in the rebuilt project
        self.check_syntax_errors()
        self.check_import_errors()
        self.check_runtime_errors()
    
    def check_syntax_errors(self):
        """
        Check for syntax errors in all Python files
        """
        rebuilt_project_path = self.base_dir / self.output_folder
        
        syntax_errors = []
        
        for py_file in rebuilt_project_path.rglob("*.py"):
            try:
                with open(py_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                ast.parse(content)
                
            except SyntaxError as e:
                syntax_errors.append({
                    'file': str(py_file),
                    'line': e.lineno,
                    'error': str(e)
                })
            except Exception as e:
                syntax_errors.append({
                    'file': str(py_file),
                    'error': f"Read error: {e}"
                })
        
        if syntax_errors:
            print(f"[⚠️ ] Found {len(syntax_errors)} syntax errors")
            for error in syntax_errors[:5]:  # Show first 5
                print(f"     {error['file']}: {error['error']}")
        else:
            print("[✅] No syntax errors found")
        
        self.test_results['errors'].extend(syntax_errors)
    
    def check_import_errors(self):
        """
        Check for import errors
        """
        import_errors = []
        
        for package_name, result in self.test_results['import_tests'].items():
            if not result['success']:
                import_errors.append({
                    'package': package_name,
                    'error': result['error']
                })
        
        if import_errors:
            print(f"[⚠️ ] Found {len(import_errors)} import errors")
        else:
            print("[✅] No import errors found")
    
    def check_runtime_errors(self):
        """
        Check for runtime errors
        """
        runtime_errors = []
        
        # Check function test results
        for func_name, result in self.test_results['function_tests'].items():
            if isinstance(result, dict) and 'error' in result:
                runtime_errors.append({
                    'function': func_name,
                    'error': result['error']
                })
        
        # Check class test results
        for class_name, result in self.test_results['class_tests'].items():
            if isinstance(result, dict) and 'instantiation_error' in result:
                runtime_errors.append({
                    'class': class_name,
                    'error': result['instantiation_error']
                })
        
        if runtime_errors:
            print(f"[⚠️ ] Found {len(runtime_errors)} runtime errors")
        else:
            print("[✅] No runtime errors found")
    
    def show_test_summary(self):
        """
        Show comprehensive test summary
        """
        duration = self.test_stats['end_time'] - self.test_stats['start_time']
        
        print("\n" + "="*60)
        print("🧪 TESTING SUMMARY")
        print("="*60)
        print(f"Total Tests: {self.test_stats['total_tests']}")
        print(f"Passed: {self.test_stats['passed_tests']}")
        print(f"Failed: {self.test_stats['failed_tests']}")
        print(f"Skipped: {self.test_stats['skipped_tests']}")
        print(f"Testing Time: {duration:.2f} seconds")
        
        # Import test results
        print(f"\n📦 Import Tests:")
        for package, result in self.test_results['import_tests'].items():
            status = "✅" if result['success'] else "❌"
            print(f"   {status} {package}")
        
        # Performance results
        print(f"\n⚡ Performance Tests:")
        for package, result in self.test_results['performance_tests'].items():
            print(f"   {package}: {result['import_time']:.3f}s ({result['status']})")
        
        # Error summary
        total_errors = len(self.test_results['errors'])
        if total_errors > 0:
            print(f"\n⚠️  Errors Found: {total_errors}")
        else:
            print(f"\n✅ No Errors Found")
        
        # Success rate
        if self.test_stats['total_tests'] > 0:
            success_rate = (self.test_stats['passed_tests'] / self.test_stats['total_tests']) * 100
            print(f"\n🎯 Success Rate: {success_rate:.1f}%")
        
        print("="*60)
    
    def save_test_results(self):
        """
        Save test results to file
        """
        results_file = self.base_dir / "logs" / "test_results.json"
        results_file.parent.mkdir(exist_ok=True)
        
        # Prepare serializable results
        serializable_results = {
            'test_stats': self.test_stats,
            'import_tests': {k: {**v, 'module': str(v.get('module', ''))} for k, v in self.test_results['import_tests'].items()},
            'function_tests': self.test_results['function_tests'],
            'class_tests': self.test_results['class_tests'],
            'integration_tests': self.test_results['integration_tests'],
            'performance_tests': self.test_results['performance_tests'],
            'errors': self.test_results['errors']
        }
        
        with open(results_file, 'w') as f:
            json.dump(serializable_results, f, indent=2)
        
        print(f"📊 Test results saved to {results_file}")
    
    def generate_test_report(self):
        """
        Generate a detailed test report
        """
        report_file = self.base_dir / "logs" / "test_report.html"
        report_file.parent.mkdir(exist_ok=True)
        
        html_content = self.create_html_report()
        
        with open(report_file, 'w') as f:
            f.write(html_content)
        
        print(f"📄 Test report generated: {report_file}")
    
    def create_html_report(self):
        """
        Create HTML test report
        """
        html = f"""
<!DOCTYPE html>
<html>
<head>
    <title>Ultimate Auto-Rebuilder Test Report</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; }}
        .header {{ background: #f0f0f0; padding: 20px; border-radius: 5px; }}
        .section {{ margin: 20px 0; }}
        .success {{ color: green; }}
        .error {{ color: red; }}
        .warning {{ color: orange; }}
        table {{ border-collapse: collapse; width: 100%; }}
        th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
        th {{ background-color: #f2f2f2; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>🧪 Ultimate Auto-Rebuilder Test Report</h1>
        <p>Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}</p>
    </div>
    
    <div class="section">
        <h2>📊 Test Statistics</h2>
        <p>Total Tests: {self.test_stats.get('total_tests', 0)}</p>
        <p>Passed: <span class="success">{self.test_stats.get('passed_tests', 0)}</span></p>
        <p>Failed: <span class="error">{self.test_stats.get('failed_tests', 0)}</span></p>
        <p>Skipped: <span class="warning">{self.test_stats.get('skipped_tests', 0)}</span></p>
    </div>
    
    <div class="section">
        <h2>📦 Import Test Results</h2>
        <table>
            <tr><th>Package</th><th>Status</th><th>Details</th></tr>
        """
        
        for package, result in self.test_results['import_tests'].items():
            status = "✅ Success" if result['success'] else "❌ Failed"
            details = result.get('info', result.get('error', ''))
            html += f"<tr><td>{package}</td><td>{status}</td><td>{details}</td></tr>"
        
        html += """
        </table>
    </div>
    
    <div class="section">
        <h2>⚡ Performance Results</h2>
        <table>
            <tr><th>Package</th><th>Import Time</th><th>Status</th></tr>
        """
        
        for package, result in self.test_results['performance_tests'].items():
            html += f"<tr><td>{package}</td><td>{result['import_time']:.3f}s</td><td>{result['status']}</td></tr>"
        
        html += """
        </table>
    </div>
    
</body>
</html>
        """
        
        return html
