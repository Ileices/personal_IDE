"""
Core Refactor Module - Harvested from auto_rebuilder.py
Main file processing engine for massive-scale code integration.
"""

import ast
import os
import traceback
from typing import Dict, Any, Optional, List

# Import from same package - using try/except for flexible importing
try:
    from .dependency_extractor import extract_dependencies, extract_subprocess_calls
    from .code_sanitizer import (
        sanitize_python_code, 
        is_documentation_file, 
        determine_package_category,
        extract_main_block,
        has_main_function,
        remove_main_block,
        wrap_main_as_function,
        add_exception_guard
    )
except ImportError:
    # Fallback imports for when module is imported directly
    try:
        from dependency_extractor import extract_dependencies, extract_subprocess_calls
        from code_sanitizer import (
            sanitize_python_code, 
            is_documentation_file, 
            determine_package_category,
            extract_main_block,
            has_main_function,
            remove_main_block,
            wrap_main_as_function,
            add_exception_guard
        )
    except ImportError as e:
        print(f"Warning: Could not import dependency modules: {e}")
        # Create dummy functions to prevent crashes
        def extract_dependencies(tree, filename):
            return [], set(), {}
        def extract_subprocess_calls(tree):
            return []
        def sanitize_python_code(code, filename="unknown"):
            return code
        def is_documentation_file(code):
            return False
        def determine_package_category(filename, source_folder="ScriptsFound"):
            return "core"
        def extract_main_block(tree):
            return None
        def has_main_function(tree):
            return False
        def remove_main_block(tree):
            return tree
        def wrap_main_as_function(main_block):
            return None
        def add_exception_guard(tree):
            return tree


def refactor_file(filepath: str, output_folder: str = "rebuilt_project", 
                 source_folder: str = "ScriptsFound", logger=None) -> Optional[Dict[str, Any]]:
    """
    Refactor a single Python file for integration into a larger codebase.
    Enhanced for massive-scale processing of thousands of unrelated scripts.
    
    Args:
        filepath: Path to the file to process
        output_folder: Where to write the refactored output
        source_folder: Source folder containing the original scripts
        logger: Optional logger function
        
    Returns:
        Dictionary with processing results or None if failed
    """
    def log(message: str):
        if logger:
            logger(message)
        else:
            print(message)
    
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            code = f.read().strip()
            
        # Skip empty files
        if not code:
            log(f"⚠️ Skipping empty file: {filepath}")
            return None
            
        filename = os.path.basename(filepath)
        log(f"\n🔎 Processing: {filename}")
        
        # Check if this is probably documentation rather than code
        if is_documentation_file(code):
            log(f"ℹ️ Skipping documentation file: {filename}")
            return None
            
        # Sanitize the code to handle emojis and other non-Python syntax
        sanitized_code = sanitize_python_code(code, filename)
        
        # Determine which package this file belongs to
        package = determine_package_category(filename, source_folder)
            
        # Parse the code into an AST
        try:
            tree = ast.parse(sanitized_code)
        except Exception as e:
            log(f"❌ Failed to parse {filepath} after sanitizing: {e}")
            # Write sanitized version for inspection
            debug_path = os.path.join(output_folder, "debug", f"{filename}.sanitized")
            os.makedirs(os.path.dirname(debug_path), exist_ok=True)
            with open(debug_path, "w", encoding="utf-8") as df:
                df.write(sanitized_code)
            log(f"📝 Sanitized version saved to {debug_path} for inspection")
            return None
            
        # Extract dependencies
        imports, dependencies, import_metadata = extract_dependencies(tree, filename)
        
        # Get main block if exists
        main_block = extract_main_block(tree)
        main_exists = has_main_function(tree)
        
        subprocesses = extract_subprocess_calls(tree)
        if subprocesses:
            log(f"🔗 Found subprocess calls: {len(subprocesses)}")

        modified = False
        # If main block exists and no main() function already defined
        if main_block and not main_exists:
            log("🛠 Found '__main__' block - refactoring into main()")
            tree = remove_main_block(tree)
            main_func = wrap_main_as_function(main_block)
            tree.body.append(main_func)
            modified = True
        elif main_exists:
            log("ℹ️ File already has main() function")
            
        # Add exception handling
        tree = add_exception_guard(tree)
        
        # Fix line numbers and columns
        tree = ast.fix_missing_locations(tree)
        
        # Generate the code
        rebuilt_code = ast.unparse(tree)
        
        # Write output
        package_dir = os.path.join(output_folder, package)
        os.makedirs(package_dir, exist_ok=True)
        
        # Also write to flat structure for backward compatibility
        out_path = os.path.join(output_folder, filename)
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(rebuilt_code)
            
        # Write to package structure
        package_path = os.path.join(package_dir, filename)
        with open(package_path, "w", encoding="utf-8") as f:
            f.write(rebuilt_code)
            
        log(f"✅ Rewritten: {filename} ➜ {out_path} and {package_path}")
        return {
            "filename": filename,
            "package": package,
            "dependencies": dependencies,
            "has_main": main_exists or bool(main_block),
            "imports": imports,
            "import_metadata": import_metadata,
            "subprocesses": len(subprocesses) > 0,
            "subprocess_calls": subprocesses,
            "modified": modified,
            "output_path": out_path,
            "package_path": package_path
        }
    except Exception as e:
        log(f"❌ Failed to process {filepath}: {str(e)}")
        log(traceback.format_exc())
        return None


def batch_refactor_files(file_list: List[str], output_folder: str = "rebuilt_project",
                        source_folder: str = "ScriptsFound", logger=None) -> Dict[str, Any]:
    """
    Process multiple files in batch with comprehensive error handling and reporting.
    
    Args:
        file_list: List of file paths to process
        output_folder: Where to write refactored files
        source_folder: Source folder containing original scripts
        logger: Optional logger function
        
    Returns:
        Dictionary with batch processing results
    """
    def log(message: str):
        if logger:
            logger(message)
        else:
            print(message)
    
    results = {
        "processed": [],
        "failed": [],
        "skipped": [],
        "packages": {},
        "dependencies": set(),
        "total_files": len(file_list),
        "success_count": 0,
        "error_count": 0,
        "skip_count": 0
    }
    
    log(f"🔄 Starting batch processing of {len(file_list)} files...")
    
    for i, filepath in enumerate(file_list, 1):
        log(f"📋 Processing {i}/{len(file_list)}: {os.path.basename(filepath)}")
        
        result = refactor_file(filepath, output_folder, source_folder, logger)
        
        if result is None:
            results["failed"].append(filepath)
            results["error_count"] += 1
        elif result == "skipped":
            results["skipped"].append(filepath)
            results["skip_count"] += 1
        else:
            results["processed"].append(result)
            results["success_count"] += 1
            
            # Track packages
            package = result["package"]
            if package not in results["packages"]:
                results["packages"][package] = []
            results["packages"][package].append(result["filename"])
            
            # Collect dependencies
            results["dependencies"].update(result["dependencies"])
    
    # Convert dependencies set to list for JSON serialization
    results["dependencies"] = list(results["dependencies"])
    
    log(f"""
🎯 Batch Processing Complete!
✅ Processed: {results['success_count']}
❌ Failed: {results['error_count']}
⏭️ Skipped: {results['skip_count']}
📦 Packages: {len(results['packages'])}
🔗 Dependencies: {len(results['dependencies'])}
""")
    
    return results


def analyze_codebase_structure(results: Dict[str, Any], logger=None) -> Dict[str, Any]:
    """
    Analyze the structure of the processed codebase for integration insights.
    
    Args:
        results: Results from batch_refactor_files
        logger: Optional logger function
        
    Returns:
        Dictionary with structural analysis
    """
    def log(message: str):
        if logger:
            logger(message)
        else:
            print(message)
    
    analysis = {
        "package_distribution": {},
        "dependency_analysis": {},
        "integration_complexity": "low",
        "namespace_conflicts": [],
        "recommended_actions": []
    }
    
    # Analyze package distribution
    for package, files in results["packages"].items():
        analysis["package_distribution"][package] = len(files)
    
    # Analyze dependencies for conflicts and patterns
    dependency_counts = {}
    for result in results["processed"]:
        for dep in result["dependencies"]:
            dependency_counts[dep] = dependency_counts.get(dep, 0) + 1
    
    # Find most common dependencies
    common_deps = sorted(dependency_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    analysis["dependency_analysis"]["most_common"] = common_deps
    
    # Determine integration complexity
    total_files = len(results["processed"])
    unique_deps = len(results["dependencies"])
    
    if unique_deps > total_files * 0.8:
        analysis["integration_complexity"] = "high"
        analysis["recommended_actions"].append("Consider dependency consolidation")
    elif unique_deps > total_files * 0.5:
        analysis["integration_complexity"] = "medium"
        analysis["recommended_actions"].append("Review dependency overlaps")
    
    # Check for potential namespace conflicts
    import_conflicts = {}
    for result in results["processed"]:
        if "import_metadata" in result:
            conflicts = result["import_metadata"].get("conflicts", {})
            for module, risk in conflicts.items():
                if risk > 0:
                    if module not in import_conflicts:
                        import_conflicts[module] = 0
                    import_conflicts[module] += risk
    
    analysis["namespace_conflicts"] = list(import_conflicts.keys())
    
    if import_conflicts:
        analysis["recommended_actions"].append("Implement namespace isolation for conflicting modules")
    
    log(f"📊 Codebase Analysis Complete - Complexity: {analysis['integration_complexity']}")
    
    return analysis
