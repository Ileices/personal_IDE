"""
Script Analyzer Module - Advanced Analysis for Auto-Rebuilder
Identifies missing scripts, placeholders, and unused functionality.
"""

import os
import ast
import re
from typing import Dict, List, Set, Any, Tuple
from pathlib import Path
from collections import defaultdict
import json


class ScriptAnalyzer:
    """
    Advanced script analyzer to identify:
    1. Scripts in source that weren't used in rebuilt project
    2. Placeholder code that needs completion
    3. Handwaved implementations
    4. Missing dependencies and features
    5. Cross-script intelligence opportunities
    """
    
    def __init__(self, source_dir: str, rebuilt_dir: str, logger=None):
        self.source_dir = Path(source_dir)
        self.rebuilt_dir = Path(rebuilt_dir)
        self.logger = logger or print
        
        # Analysis results
        self.missing_scripts = []
        self.placeholder_code = []
        self.handwaved_implementations = []
        self.cross_references = defaultdict(list)
        self.dependency_gaps = []
        self.unused_features = []
        
    def analyze_project_coverage(self) -> Dict[str, Any]:
        """
        Comprehensive analysis of what's missing from the rebuilt project.
        """
        self.logger("🔍 Analyzing project coverage...")
        
        # Get all source files
        source_files = self._get_source_files()
        rebuilt_files = self._get_rebuilt_files()
        
        # Identify missing scripts
        self.missing_scripts = self._find_missing_scripts(source_files, rebuilt_files)
        
        # Analyze placeholders in both source and rebuilt
        self.placeholder_code = self._find_placeholder_code(source_files + rebuilt_files)
        
        # Find handwaved implementations
        self.handwaved_implementations = self._find_handwaved_code(source_files + rebuilt_files)
        
        # Build cross-reference map
        self.cross_references = self._build_cross_reference_map(source_files)
        
        # Find dependency gaps
        self.dependency_gaps = self._find_dependency_gaps(rebuilt_files)
        
        # Identify unused features
        self.unused_features = self._find_unused_features(source_files, rebuilt_files)
        
        return self._compile_analysis_report()
    
    def _get_source_files(self) -> List[Dict[str, Any]]:
        """Get all Python files from source directory."""
        files = []
        for file_path in self.source_dir.glob("**/*.py"):
            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                files.append({
                    "path": str(file_path),
                    "name": file_path.name,
                    "content": content,
                    "size": len(content),
                    "location": "source"
                })
            except Exception as e:
                self.logger(f"⚠️ Error reading {file_path}: {e}")
        return files
    
    def _get_rebuilt_files(self) -> List[Dict[str, Any]]:
        """Get all Python files from rebuilt directory."""
        files = []
        for file_path in self.rebuilt_dir.glob("**/*.py"):
            if "__pycache__" in str(file_path) or file_path.name == "__init__.py":
                continue
            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                files.append({
                    "path": str(file_path),
                    "name": file_path.name,
                    "content": content,
                    "size": len(content),
                    "location": "rebuilt"
                })
            except Exception as e:
                self.logger(f"⚠️ Error reading {file_path}: {e}")
        return files
    
    def _find_missing_scripts(self, source_files: List[Dict], rebuilt_files: List[Dict]) -> List[Dict]:
        """Find scripts that exist in source but not in rebuilt project."""
        source_names = {f["name"] for f in source_files}
        rebuilt_names = {f["name"] for f in rebuilt_files}
        
        missing = []
        for source_file in source_files:
            if source_file["name"] not in rebuilt_names:
                # Analyze why it might be missing
                analysis = self._analyze_missing_script(source_file)
                missing.append({
                    **source_file,
                    "analysis": analysis
                })
        
        return missing
    
    def _analyze_missing_script(self, file_info: Dict) -> Dict[str, Any]:
        """Analyze why a script might be missing."""
        content = file_info["content"]
        analysis = {
            "size": file_info["size"],
            "has_classes": len(re.findall(r'^class\s+\w+', content, re.MULTILINE)) > 0,
            "has_functions": len(re.findall(r'^def\s+\w+', content, re.MULTILINE)) > 0,
            "has_main": "if __name__" in content,
            "imports": self._extract_imports(content),
            "complexity_score": self._calculate_complexity(content),
            "potential_category": self._guess_category(file_info["name"], content)
        }
        
        # Determine likely reason for exclusion
        if analysis["size"] < 100:
            analysis["likely_reason"] = "Too small/empty"
        elif not analysis["has_classes"] and not analysis["has_functions"]:
            analysis["likely_reason"] = "No executable code"
        elif analysis["complexity_score"] > 100:
            analysis["likely_reason"] = "Too complex/large"
        else:
            analysis["likely_reason"] = "Categorization issue"
            
        return analysis
    
    def _find_placeholder_code(self, files: List[Dict]) -> List[Dict]:
        """Find placeholder code patterns that need completion."""
        placeholders = []
        
        placeholder_patterns = [
            (r'#\s*TODO[:\s].*', "TODO comment"),
            (r'#\s*FIXME[:\s].*', "FIXME comment"), 
            (r'#\s*HACK[:\s].*', "HACK comment"),
            (r'#\s*XXX[:\s].*', "XXX comment"),
            (r'pass\s*#.*placeholder', "Pass placeholder"),
            (r'raise\s+NotImplementedError', "NotImplementedError"),
            (r'print\s*\(\s*["\'].*placeholder.*["\']\s*\)', "Placeholder print"),
            (r'print\s*\(\s*["\'].*TODO.*["\']\s*\)', "TODO print"),
            (r'return\s+None\s*#.*placeholder', "None return placeholder"),
            (r'\.\.\.', "Ellipsis placeholder"),
            (r'#\s*placeholder[:\s].*', "General placeholder comment"),
            (r'#\s*handwave[:\s].*', "Handwave comment"),
            (r'#\s*stub[:\s].*', "Stub comment"),
        ]
        
        for file_info in files:
            content = file_info["content"]
            for pattern, desc in placeholder_patterns:
                matches = list(re.finditer(pattern, content, re.IGNORECASE | re.MULTILINE))
                for match in matches:
                    line_num = content[:match.start()].count('\n') + 1
                    placeholders.append({
                        "file": file_info["name"],
                        "path": file_info["path"],
                        "location": file_info["location"],
                        "line": line_num,
                        "type": desc,
                        "code": match.group(0),
                        "context": self._get_code_context(content, match.start(), match.end())
                    })
        
        return placeholders
    
    def _find_handwaved_code(self, files: List[Dict]) -> List[Dict]:
        """Find handwaved implementations that need proper code."""
        handwaves = []
        
        handwave_patterns = [
            (r'def\s+\w+\([^)]*\):\s*pass', "Empty function"),
            (r'class\s+\w+[^:]*:\s*pass', "Empty class"),
            (r'except[^:]*:\s*pass', "Empty exception handler"),
            (r'if\s+[^:]+:\s*pass', "Empty if block"),
            (r'else:\s*pass', "Empty else block"),
            (r'for\s+[^:]+:\s*pass', "Empty for loop"),
            (r'while\s+[^:]+:\s*pass', "Empty while loop"),
            (r'return\s+\w+\(\)', "Return empty function call"),
        ]
        
        for file_info in files:
            content = file_info["content"]
            for pattern, desc in handwave_patterns:
                matches = list(re.finditer(pattern, content, re.MULTILINE | re.DOTALL))
                for match in matches:
                    line_num = content[:match.start()].count('\n') + 1
                    handwaves.append({
                        "file": file_info["name"],
                        "path": file_info["path"],
                        "location": file_info["location"],
                        "line": line_num,
                        "type": desc,
                        "code": match.group(0),
                        "context": self._get_code_context(content, match.start(), match.end())
                    })
        
        return handwaves
    
    def _build_cross_reference_map(self, files: List[Dict]) -> Dict[str, List[Dict]]:
        """Build map of cross-references between scripts."""
        cross_refs = defaultdict(list)
        
        # Extract all function and class definitions
        definitions = {}
        for file_info in files:
            try:
                tree = ast.parse(file_info["content"])
                for node in ast.walk(tree):
                    if isinstance(node, ast.FunctionDef):
                        definitions[node.name] = {
                            "type": "function",
                            "file": file_info["name"],
                            "path": file_info["path"]
                        }
                    elif isinstance(node, ast.ClassDef):
                        definitions[node.name] = {
                            "type": "class", 
                            "file": file_info["name"],
                            "path": file_info["path"]
                        }
            except:
                continue
        
        # Find references to these definitions
        for file_info in files:
            content = file_info["content"]
            for name, def_info in definitions.items():
                if def_info["file"] != file_info["name"] and name in content:
                    cross_refs[def_info["file"]].append({
                        "referenced_in": file_info["name"],
                        "referenced_item": name,
                        "item_type": def_info["type"]
                    })
        
        return cross_refs
    
    def _find_dependency_gaps(self, rebuilt_files: List[Dict]) -> List[Dict]:
        """Find missing dependencies in rebuilt files."""
        gaps = []
        
        for file_info in rebuilt_files:
            content = file_info["content"]
            
            # Find import errors from the content
            import_errors = re.findall(r'No module named [\'"]([^\'"]+)[\'"]', content)
            name_errors = re.findall(r'name [\'"]([^\'"]+)[\'"] is not defined', content)
            
            for module in import_errors:
                gaps.append({
                    "file": file_info["name"],
                    "type": "missing_module",
                    "missing": module,
                    "severity": "high"
                })
            
            for name in name_errors:
                gaps.append({
                    "file": file_info["name"],
                    "type": "missing_name",
                    "missing": name,
                    "severity": "medium"
                })
        
        return gaps
    
    def _find_unused_features(self, source_files: List[Dict], rebuilt_files: List[Dict]) -> List[Dict]:
        """Find features in source that aren't being used in rebuilt."""
        unused = []
        
        # Extract all features from source
        source_features = self._extract_features(source_files)
        rebuilt_features = self._extract_features(rebuilt_files)
        
        for feature in source_features:
            if not any(rf["name"] == feature["name"] for rf in rebuilt_features):
                unused.append(feature)
        
        return unused
    
    def _extract_features(self, files: List[Dict]) -> List[Dict]:
        """Extract functions and classes from files."""
        features = []
        for file_info in files:
            try:
                tree = ast.parse(file_info["content"])
                for node in ast.walk(tree):
                    if isinstance(node, (ast.FunctionDef, ast.ClassDef)):
                        features.append({
                            "name": node.name,
                            "type": "function" if isinstance(node, ast.FunctionDef) else "class",
                            "file": file_info["name"],
                            "path": file_info["path"],
                            "location": file_info["location"]
                        })
            except:
                continue
        return features
    
    def _extract_imports(self, content: str) -> List[str]:
        """Extract import statements from content."""
        imports = []
        try:
            tree = ast.parse(content)
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        imports.append(alias.name)
                elif isinstance(node, ast.ImportFrom):
                    module = node.module or ''
                    for alias in node.names:
                        imports.append(f"{module}.{alias.name}")
        except:
            pass
        return imports
    
    def _calculate_complexity(self, content: str) -> int:
        """Calculate rough complexity score."""
        lines = len(content.split('\n'))
        functions = len(re.findall(r'^def\s+\w+', content, re.MULTILINE))
        classes = len(re.findall(r'^class\s+\w+', content, re.MULTILINE))
        imports = len(re.findall(r'^import\s+|^from\s+.*import', content, re.MULTILINE))
        
        return lines + (functions * 5) + (classes * 10) + imports
    
    def _guess_category(self, filename: str, content: str) -> str:
        """Guess the category this file should be in."""
        name = filename.lower()
        content_lower = content.lower()
        
        if any(ui_word in name for ui_word in ["gui", "ui", "window", "dialog"]):
            return "ui"
        elif any(io_word in name for io_word in ["file", "io", "data", "aios", "system"]):
            return "io"
        elif any(ml_word in name for ml_word in ["ml", "ai", "neural", "train", "model"]):
            return "train"
        elif any(tool_word in name for tool_word in ["tool", "util", "command", "script"]):
            return "tools"
        elif any(net_word in name for net_word in ["api", "http", "server", "client", "net"]):
            return "net"
        else:
            return "core"
    
    def _get_code_context(self, content: str, start: int, end: int, context_lines: int = 3) -> str:
        """Get code context around a match."""
        lines = content.split('\n')
        match_line = content[:start].count('\n')
        
        start_line = max(0, match_line - context_lines)
        end_line = min(len(lines), match_line + context_lines + 1)
        
        context_lines_list = lines[start_line:end_line]
        return '\n'.join(f"{start_line + i + 1:4d}: {line}" for i, line in enumerate(context_lines_list))
    
    def _compile_analysis_report(self) -> Dict[str, Any]:
        """Compile comprehensive analysis report."""
        return {
            "missing_scripts": {
                "count": len(self.missing_scripts),
                "scripts": self.missing_scripts
            },
            "placeholder_code": {
                "count": len(self.placeholder_code),
                "by_type": self._group_by_type(self.placeholder_code),
                "items": self.placeholder_code
            },
            "handwaved_implementations": {
                "count": len(self.handwaved_implementations),
                "by_type": self._group_by_type(self.handwaved_implementations),
                "items": self.handwaved_implementations
            },
            "cross_references": dict(self.cross_references),
            "dependency_gaps": {
                "count": len(self.dependency_gaps),
                "by_severity": self._group_by_severity(self.dependency_gaps),
                "items": self.dependency_gaps
            },
            "unused_features": {
                "count": len(self.unused_features),
                "by_type": self._group_by_type(self.unused_features, key="type"),
                "items": self.unused_features
            },
            "summary": {
                "total_issues": len(self.missing_scripts) + len(self.placeholder_code) + 
                              len(self.handwaved_implementations) + len(self.dependency_gaps),
                "critical_issues": len([g for g in self.dependency_gaps if g.get("severity") == "high"]),
                "completion_opportunities": len(self.placeholder_code) + len(self.handwaved_implementations)
            }
        }
    
    def _group_by_type(self, items: List[Dict], key: str = "type") -> Dict[str, int]:
        """Group items by type and count them."""
        groups = defaultdict(int)
        for item in items:
            groups[item.get(key, "unknown")] += 1
        return dict(groups)
    
    def _group_by_severity(self, items: List[Dict]) -> Dict[str, int]:
        """Group items by severity."""
        groups = defaultdict(int)
        for item in items:
            groups[item.get("severity", "unknown")] += 1
        return dict(groups)
    
    def generate_llm_completion_requests(self) -> List[Dict[str, Any]]:
        """Generate requests for LLM to complete missing code."""
        requests = []
        
        # For each placeholder, create a completion request
        for placeholder in self.placeholder_code:
            request = {
                "type": "placeholder_completion",
                "file": placeholder["file"],
                "location": f"{placeholder['file']}:{placeholder['line']}",
                "placeholder_type": placeholder["type"],
                "context": placeholder["context"],
                "prompt": f"Complete the placeholder code in {placeholder['file']} at line {placeholder['line']}:\n\n{placeholder['context']}\n\nProvide the complete implementation:"
            }
            requests.append(request)
        
        # For each handwaved implementation
        for handwave in self.handwaved_implementations:
            request = {
                "type": "handwave_completion",
                "file": handwave["file"],
                "location": f"{handwave['file']}:{handwave['line']}",
                "handwave_type": handwave["type"],
                "context": handwave["context"],
                "prompt": f"Implement the handwaved code in {handwave['file']} at line {handwave['line']}:\n\n{handwave['context']}\n\nProvide a proper implementation:"
            }
            requests.append(request)
        
        return requests
    
    def save_analysis_report(self, output_path: str):
        """Save the analysis report to a file."""
        report = self._compile_analysis_report()
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2, default=str)
        
        self.logger(f"📊 Analysis report saved to: {output_path}")
        
        # Also create a human-readable summary
        summary_path = output_path.replace('.json', '_summary.md')
        self._create_markdown_summary(report, summary_path)
    
    def _create_markdown_summary(self, report: Dict[str, Any], output_path: str):
        """Create a human-readable markdown summary."""
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write("# Auto-Rebuilder Analysis Report\n\n")
            
            summary = report["summary"]
            f.write(f"## Summary\n")
            f.write(f"- **Total Issues**: {summary['total_issues']}\n")
            f.write(f"- **Critical Issues**: {summary['critical_issues']}\n")
            f.write(f"- **Completion Opportunities**: {summary['completion_opportunities']}\n\n")
            
            f.write(f"## Missing Scripts ({report['missing_scripts']['count']})\n")
            for script in report['missing_scripts']['scripts'][:10]:  # Top 10
                f.write(f"- **{script['name']}** ({script['analysis']['likely_reason']})\n")
            f.write("\n")
            
            f.write(f"## Placeholder Code ({report['placeholder_code']['count']})\n")
            for ptype, count in report['placeholder_code']['by_type'].items():
                f.write(f"- {ptype}: {count}\n")
            f.write("\n")
            
            f.write(f"## Handwaved Implementations ({report['handwaved_implementations']['count']})\n")
            for htype, count in report['handwaved_implementations']['by_type'].items():
                f.write(f"- {htype}: {count}\n")
            f.write("\n")
            
            f.write(f"## Dependency Gaps ({report['dependency_gaps']['count']})\n")
            for gap in report['dependency_gaps']['items'][:10]:  # Top 10
                f.write(f"- **{gap['file']}**: Missing {gap['missing']} ({gap['type']})\n")
            f.write("\n")
        
        self.logger(f"📄 Summary report saved to: {output_path}")
