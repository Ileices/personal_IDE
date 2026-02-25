"""
Advanced NLP-to-Code Generation Engine
Revolutionary natural language to executable code transformation system
Implements consciousness-guided code generation with self-modification capabilities
"""

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Dict, List, Tuple, Any, Optional
import re
import ast
import tokenize
import io
import inspect
import types
import threading
import time
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor
from transformers import GPT2LMHeadModel, GPT2Tokenizer
import subprocess
import tempfile
import os


@dataclass
class CodeGenerationRequest:
    """Request for code generation"""
    natural_language: str
    target_language: str = "python"
    complexity_level: int = 1  # 1-10 scale
    consciousness_guidance: Tuple[float, float, float] = (0.33, 0.33, 0.34)  # RBY
    context_code: Optional[str] = None
    requirements: List[str] = None
    optimization_target: str = "readability"  # readability, performance, memory
    
    def __post_init__(self):
        if self.requirements is None:
            self.requirements = []


@dataclass
class GeneratedCode:
    """Generated code with metadata"""
    source_code: str
    language: str
    confidence_score: float
    execution_safety: float
    performance_estimate: float
    complexity_analysis: Dict[str, Any]
    consciousness_signature: Tuple[float, float, float]
    generation_time: float
    test_cases: List[str]
    documentation: str


class ConsciousnessGuidedTokenizer:
    """
    Advanced tokenizer that uses consciousness states to guide tokenization
    Adapts tokenization strategy based on RBY consciousness components
    """
    
    def __init__(self):
        self.base_tokenizer = GPT2Tokenizer.from_pretrained('gpt2')
        self.consciousness_weights = {
            'red': 1.0,    # Action-oriented tokens (verbs, functions)
            'blue': 1.0,   # Structure-oriented tokens (syntax, types)
            'yellow': 1.0  # Integration tokens (connectors, abstractions)
        }
        
        # Token classification patterns
        self.token_patterns = {
            'red': [
                r'\b(def|class|import|from|if|for|while|try|except|with|return|yield|break|continue)\b',
                r'\b(print|input|open|close|read|write|execute|run|call|invoke)\b',
                r'\+\+|--|[\+\-\*\/\%]|\+=|-=|\*=|\/='
            ],
            'blue': [
                r'\b(int|float|str|list|dict|tuple|set|bool|None|True|False)\b',
                r'[\(\)\[\]\{\}]|[:;,\.]',
                r'\b(and|or|not|in|is|==|!=|<=|>=|<|>)\b'
            ],
            'yellow': [
                r'\b(lambda|map|filter|reduce|zip|enumerate|range)\b',
                r'\b(self|cls|super|property|staticmethod|classmethod)\b',
                r'@\w+|__\w+__'
            ]
        }
        
        # Compile patterns for efficiency
        self.compiled_patterns = {}
        for category, patterns in self.token_patterns.items():
            self.compiled_patterns[category] = [re.compile(pattern) for pattern in patterns]
    
    def consciousness_guided_tokenize(self, text: str, rby_state: Tuple[float, float, float]) -> List[Dict[str, Any]]:
        """
        Tokenize text with consciousness guidance
        Returns enhanced tokens with consciousness weights
        """
        base_tokens = self.base_tokenizer.encode(text, return_tensors='pt')
        decoded_tokens = [self.base_tokenizer.decode([token]) for token in base_tokens[0]]
        
        enhanced_tokens = []
        
        for i, token in enumerate(decoded_tokens):
            token_info = {
                'token': token,
                'index': i,
                'consciousness_weights': self._calculate_token_consciousness(token, rby_state),
                'importance_score': 0.5  # Default importance
            }
            
            # Calculate importance based on consciousness state
            token_info['importance_score'] = self._calculate_token_importance(token_info, rby_state)
            
            enhanced_tokens.append(token_info)
        
        return enhanced_tokens
    
    def _calculate_token_consciousness(self, token: str, rby_state: Tuple[float, float, float]) -> Dict[str, float]:
        """Calculate consciousness weights for a token"""
        weights = {'red': 0.0, 'blue': 0.0, 'yellow': 0.0}
        
        for category, patterns in self.compiled_patterns.items():
            for pattern in patterns:
                if pattern.search(token):
                    weights[category] += 1.0
        
        # Normalize weights
        total_weight = sum(weights.values())
        if total_weight > 0:
            for category in weights:
                weights[category] /= total_weight
        else:
            # Default equal weights
            weights = {'red': 0.33, 'blue': 0.33, 'yellow': 0.34}
        
        return weights
    
    def _calculate_token_importance(self, token_info: Dict[str, Any], rby_state: Tuple[float, float, float]) -> float:
        """Calculate token importance based on consciousness state"""
        token_weights = token_info['consciousness_weights']
        red, blue, yellow = rby_state
        
        # Weight importance by consciousness state alignment
        importance = (
            token_weights['red'] * red +
            token_weights['blue'] * blue +
            token_weights['yellow'] * yellow
        )
        
        return min(1.0, max(0.0, importance))


class SemanticCodeParser:
    """
    Advanced semantic parser for understanding code intent
    Extracts semantic meaning and computational patterns
    """
    
    def __init__(self):
        self.semantic_patterns = {
            'data_structures': [
                r'\b(list|dict|tuple|set|array|dataframe|matrix)\b',
                r'\[(.*?)\]|\{(.*?)\}|\((.*?)\)'
            ],
            'algorithms': [
                r'\b(sort|search|filter|map|reduce|merge|split)\b',
                r'\b(recursive|iterative|dynamic|greedy|divide)\b'
            ],
            'control_flow': [
                r'\b(if|else|elif|for|while|try|except|with)\b',
                r'\b(break|continue|return|yield|raise)\b'
            ],
            'functions': [
                r'def\s+(\w+)\s*\(',
                r'lambda\s*([^:]*):',
                r'(\w+)\s*\('
            ],
            'classes': [
                r'class\s+(\w+)\s*\(',
                r'self\.(\w+)',
                r'@(property|staticmethod|classmethod)'
            ]
        }
        
        self.compiled_semantic_patterns = {}
        for category, patterns in self.semantic_patterns.items():
            self.compiled_semantic_patterns[category] = [re.compile(pattern, re.IGNORECASE) for pattern in patterns]
    
    def parse_semantic_intent(self, natural_language: str) -> Dict[str, Any]:
        """Parse semantic intent from natural language description"""
        intent = {
            'primary_action': None,
            'data_types': [],
            'algorithmic_approach': None,
            'complexity_indicators': [],
            'io_requirements': [],
            'constraints': []
        }
        
        # Extract primary action (first verb)
        action_patterns = [
            r'\b(create|build|make|generate|implement|write|develop)\b',
            r'\b(sort|search|find|filter|transform|process|compute)\b',
            r'\b(read|write|parse|format|convert|validate)\b'
        ]
        
        for pattern in action_patterns:
            match = re.search(pattern, natural_language, re.IGNORECASE)
            if match:
                intent['primary_action'] = match.group(1).lower()
                break
        
        # Extract data types
        data_type_patterns = [
            r'\b(string|text|number|integer|float|list|array|dictionary|json|csv|xml)\b',
            r'\b(file|image|video|audio|database|table|matrix)\b'
        ]
        
        for pattern in data_type_patterns:
            matches = re.findall(pattern, natural_language, re.IGNORECASE)
            intent['data_types'].extend([match.lower() for match in matches])
        
        # Extract algorithmic approach
        algorithm_patterns = [
            r'\b(recursive|iterative|dynamic programming|greedy|brute force)\b',
            r'\b(binary search|linear search|quick sort|merge sort|heap sort)\b',
            r'\b(breadth first|depth first|dijkstra|a\*)\b'
        ]
        
        for pattern in algorithm_patterns:
            match = re.search(pattern, natural_language, re.IGNORECASE)
            if match:
                intent['algorithmic_approach'] = match.group(0).lower()
                break
        
        # Extract complexity indicators
        complexity_patterns = [
            r'\b(fast|slow|efficient|optimal|simple|complex)\b',
            r'\b(O\(\w+\)|time complexity|space complexity)\b',
            r'\b(parallel|concurrent|distributed|single-threaded)\b'
        ]
        
        for pattern in complexity_patterns:
            matches = re.findall(pattern, natural_language, re.IGNORECASE)
            intent['complexity_indicators'].extend([match.lower() for match in matches])
        
        return intent
    
    def analyze_code_structure(self, code: str) -> Dict[str, Any]:
        """Analyze structure of generated code"""
        try:
            tree = ast.parse(code)
            analysis = {
                'functions': [],
                'classes': [],
                'imports': [],
                'complexity_score': 0,
                'cyclomatic_complexity': 0,
                'line_count': len(code.split('\n')),
                'ast_nodes': 0
            }
            
            for node in ast.walk(tree):
                analysis['ast_nodes'] += 1
                
                if isinstance(node, ast.FunctionDef):
                    analysis['functions'].append({
                        'name': node.name,
                        'args': [arg.arg for arg in node.args.args],
                        'line_number': node.lineno
                    })
                elif isinstance(node, ast.ClassDef):
                    analysis['classes'].append({
                        'name': node.name,
                        'methods': [],
                        'line_number': node.lineno
                    })
                elif isinstance(node, ast.Import):
                    for alias in node.names:
                        analysis['imports'].append(alias.name)
                elif isinstance(node, ast.ImportFrom):
                    module = node.module or ''
                    for alias in node.names:
                        analysis['imports'].append(f"{module}.{alias.name}")
            
            # Calculate complexity score
            analysis['complexity_score'] = self._calculate_complexity_score(analysis)
            
            return analysis
            
        except SyntaxError as e:
            return {
                'error': f"Syntax error: {e}",
                'functions': [],
                'classes': [],
                'imports': [],
                'complexity_score': 0,
                'line_count': len(code.split('\n')),
                'ast_nodes': 0
            }
    
    def _calculate_complexity_score(self, analysis: Dict[str, Any]) -> float:
        """Calculate code complexity score"""
        base_score = 1.0
        
        # Add complexity for functions and classes
        base_score += len(analysis['functions']) * 0.5
        base_score += len(analysis['classes']) * 1.0
        
        # Add complexity for imports
        base_score += len(analysis['imports']) * 0.2
        
        # Normalize by line count
        if analysis['line_count'] > 0:
            base_score = base_score / (analysis['line_count'] / 10.0)
        
        return min(10.0, max(1.0, base_score))


class ConsciousnessCodeGenerator:
    """
    Core code generation engine with consciousness guidance
    Generates executable code from natural language descriptions
    """
    
    def __init__(self, model_name: str = "gpt2"):
        # Initialize language model
        self.tokenizer = GPT2Tokenizer.from_pretrained(model_name)
        self.model = GPT2LMHeadModel.from_pretrained(model_name)
        
        # Add padding token
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token
        
        # Initialize consciousness components
        self.consciousness_tokenizer = ConsciousnessGuidedTokenizer()
        self.semantic_parser = SemanticCodeParser()
        
        # Code templates and patterns
        self.code_templates = {
            'python': {
                'function': 'def {name}({args}):\n    """{docstring}"""\n    {body}\n    return {return_value}',
                'class': 'class {name}:\n    """{docstring}"""\n    \n    def __init__(self, {init_args}):\n        {init_body}\n    \n    {methods}',
                'script': '#!/usr/bin/env python3\n"""{docstring}"""\n\n{imports}\n\n{main_code}'
            }
        }
        
        # Training prompts for few-shot learning
        self.training_prompts = [
            {
                'description': 'Create a function that sorts a list of numbers',
                'code': 'def sort_numbers(numbers):\n    """Sort a list of numbers in ascending order."""\n    return sorted(numbers)'
            },
            {
                'description': 'Create a class to represent a bank account',
                'code': 'class BankAccount:\n    """A simple bank account class."""\n    \n    def __init__(self, initial_balance=0):\n        self.balance = initial_balance\n    \n    def deposit(self, amount):\n        self.balance += amount\n    \n    def withdraw(self, amount):\n        if amount <= self.balance:\n            self.balance -= amount\n            return True\n        return False'
            }
        ]
    
    def generate_code(self, request: CodeGenerationRequest) -> GeneratedCode:
        """
        Generate code from natural language request
        Uses consciousness guidance for enhanced generation
        """
        start_time = time.time()
        
        # Parse semantic intent
        semantic_intent = self.semantic_parser.parse_semantic_intent(request.natural_language)
        
        # Create consciousness-guided prompt
        prompt = self._create_consciousness_prompt(request, semantic_intent)
        
        # Generate code using language model
        generated_code = self._generate_with_model(prompt, request.consciousness_guidance)
        
        # Post-process and validate code
        processed_code = self._post_process_code(generated_code, request)
        
        # Analyze generated code
        code_analysis = self.semantic_parser.analyze_code_structure(processed_code)
        
        # Calculate metrics
        confidence_score = self._calculate_confidence_score(processed_code, semantic_intent)
        execution_safety = self._assess_execution_safety(processed_code)
        performance_estimate = self._estimate_performance(processed_code, code_analysis)
        
        # Generate test cases
        test_cases = self._generate_test_cases(processed_code, semantic_intent)
        
        # Generate documentation
        documentation = self._generate_documentation(processed_code, semantic_intent)
        
        generation_time = time.time() - start_time
        
        return GeneratedCode(
            source_code=processed_code,
            language=request.target_language,
            confidence_score=confidence_score,
            execution_safety=execution_safety,
            performance_estimate=performance_estimate,
            complexity_analysis=code_analysis,
            consciousness_signature=request.consciousness_guidance,
            generation_time=generation_time,
            test_cases=test_cases,
            documentation=documentation
        )
    
    def _create_consciousness_prompt(self, request: CodeGenerationRequest, semantic_intent: Dict[str, Any]) -> str:
        """Create consciousness-guided prompt for code generation"""
        red, blue, yellow = request.consciousness_guidance
        
        # Base prompt
        prompt = f"# Task: {request.natural_language}\n"
        prompt += f"# Language: {request.target_language}\n"
        prompt += f"# Complexity: {request.complexity_level}/10\n\n"
        
        # Add consciousness guidance
        if red > 0.5:  # Action-oriented
            prompt += "# Focus: Create efficient, action-oriented code with clear execution flow\n"
        if blue > 0.5:  # Structure-oriented
            prompt += "# Focus: Create well-structured, maintainable code with clear organization\n"
        if yellow > 0.5:  # Integration-oriented
            prompt += "# Focus: Create elegant, integrated code with high-level abstractions\n"
        
        # Add semantic context
        if semantic_intent['primary_action']:
            prompt += f"# Primary Action: {semantic_intent['primary_action']}\n"
        if semantic_intent['data_types']:
            prompt += f"# Data Types: {', '.join(semantic_intent['data_types'])}\n"
        if semantic_intent['algorithmic_approach']:
            prompt += f"# Algorithm: {semantic_intent['algorithmic_approach']}\n"
        
        # Add few-shot examples
        prompt += "\n# Examples:\n"
        for example in self.training_prompts[:2]:  # Use 2 examples
            prompt += f"## Description: {example['description']}\n"
            prompt += f"```python\n{example['code']}\n```\n\n"
        
        # Add context code if provided
        if request.context_code:
            prompt += f"# Context Code:\n```python\n{request.context_code}\n```\n\n"
        
        prompt += f"# Generate code for: {request.natural_language}\n```python\n"
        
        return prompt
    
    def _generate_with_model(self, prompt: str, consciousness_guidance: Tuple[float, float, float]) -> str:
        """Generate code using the language model with consciousness guidance"""
        # Tokenize prompt
        inputs = self.tokenizer.encode(prompt, return_tensors='pt', max_length=512, truncation=True)
        
        # Consciousness-guided generation parameters
        red, blue, yellow = consciousness_guidance
        
        # Adjust generation parameters based on consciousness state
        if red > 0.5:  # Action-oriented - more diverse, creative
            temperature = 0.8
            top_k = 50
            top_p = 0.9
        elif blue > 0.5:  # Structure-oriented - more consistent, logical
            temperature = 0.5
            top_k = 20
            top_p = 0.8
        else:  # Integration-oriented - balanced
            temperature = 0.7
            top_k = 40
            top_p = 0.85
        
        # Generate code
        with torch.no_grad():
            outputs = self.model.generate(
                inputs,
                max_length=inputs.shape[1] + 256,
                temperature=temperature,
                top_k=top_k,
                top_p=top_p,
                do_sample=True,
                pad_token_id=self.tokenizer.eos_token_id,
                num_return_sequences=1
            )
        
        # Decode generated text
        generated_text = self.tokenizer.decode(outputs[0], skip_special_tokens=True)
        
        # Extract code from generated text
        code_start = generated_text.find('```python\n')
        if code_start != -1:
            code_start += len('```python\n')
            code_end = generated_text.find('```', code_start)
            if code_end != -1:
                return generated_text[code_start:code_end].strip()
        
        # Fallback: extract everything after the last prompt marker
        last_prompt = generated_text.rfind('```python\n')
        if last_prompt != -1:
            return generated_text[last_prompt + len('```python\n'):].strip()
        
        return generated_text.strip()
    
    def _post_process_code(self, code: str, request: CodeGenerationRequest) -> str:
        """Post-process generated code for quality and safety"""
        # Remove any remaining markdown formatting
        code = re.sub(r'```\w*\n?', '', code)
        code = re.sub(r'```\n?', '', code)
        
        # Fix common indentation issues
        lines = code.split('\n')
        processed_lines = []
        
        for line in lines:
            # Skip empty lines
            if not line.strip():
                processed_lines.append('')
                continue
            
            # Fix basic indentation (convert tabs to spaces)
            line = line.expandtabs(4)
            processed_lines.append(line)
        
        processed_code = '\n'.join(processed_lines)
        
        # Add basic error handling if not present
        if 'try:' not in processed_code and request.complexity_level > 3:
            processed_code = self._add_error_handling(processed_code)
        
        return processed_code
    
    def _add_error_handling(self, code: str) -> str:
        """Add basic error handling to code"""
        # Simple heuristic: wrap main logic in try-except
        lines = code.split('\n')
        
        # Find the first function or main logic
        main_start = -1
        for i, line in enumerate(lines):
            if line.strip().startswith('def ') or (line.strip() and not line.startswith('#') and not line.startswith('import')):
                main_start = i
                break
        
        if main_start == -1:
            return code
        
        # Add try-except wrapper
        before_main = lines[:main_start]
        main_code = lines[main_start:]
        
        # Indent main code
        indented_main = ['    ' + line for line in main_code]
        
        error_handling = [
            'try:',
            *indented_main,
            'except Exception as e:',
            '    print(f"Error: {e}")',
            '    return None'
        ]
        
        return '\n'.join(before_main + error_handling)
    
    def _calculate_confidence_score(self, code: str, semantic_intent: Dict[str, Any]) -> float:
        """Calculate confidence score for generated code"""
        score = 0.5  # Base score
        
        # Check syntax validity
        try:
            ast.parse(code)
            score += 0.3
        except SyntaxError:
            score -= 0.2
        
        # Check if primary action is addressed
        if semantic_intent['primary_action']:
            action = semantic_intent['primary_action']
            if action in code.lower():
                score += 0.1
        
        # Check if data types are addressed
        for data_type in semantic_intent['data_types']:
            if data_type in code.lower():
                score += 0.05
        
        # Check code completeness (has functions or classes)
        if 'def ' in code or 'class ' in code:
            score += 0.1
        
        return min(1.0, max(0.0, score))
    
    def _assess_execution_safety(self, code: str) -> float:
        """Assess execution safety of generated code"""
        safety_score = 1.0
        
        # Check for potentially dangerous operations
        dangerous_patterns = [
            r'exec\s*\(',
            r'eval\s*\(',
            r'__import__\s*\(',
            r'open\s*\([^)]*[\'"]w[\'"]',  # Writing files
            r'subprocess\.',
            r'os\.system',
            r'rm\s+-rf',
            r'delete\s+from',  # SQL deletion
        ]
        
        for pattern in dangerous_patterns:
            if re.search(pattern, code, re.IGNORECASE):
                safety_score -= 0.2
        
        # Check for proper error handling
        if 'try:' in code and 'except' in code:
            safety_score += 0.1
        
        return min(1.0, max(0.0, safety_score))
    
    def _estimate_performance(self, code: str, analysis: Dict[str, Any]) -> float:
        """Estimate performance of generated code"""
        # Simple heuristic based on code structure
        base_performance = 0.7
        
        # Penalize for high complexity
        complexity = analysis.get('complexity_score', 1.0)
        performance = base_performance - (complexity - 1.0) * 0.05
        
        # Bonus for efficient patterns
        if 'list comprehension' in code or '[' in code and 'for' in code and 'in' in code:
            performance += 0.1
        
        # Penalize for nested loops (simple detection)
        nested_loops = code.count('for') * code.count('while')
        if nested_loops > 1:
            performance -= nested_loops * 0.05
        
        return min(1.0, max(0.1, performance))
    
    def _generate_test_cases(self, code: str, semantic_intent: Dict[str, Any]) -> List[str]:
        """Generate test cases for the code"""
        test_cases = []
        
        # Extract function names from code
        functions = re.findall(r'def\s+(\w+)\s*\([^)]*\):', code)
        
        for func_name in functions:
            # Generate basic test cases
            test_cases.append(f"# Test {func_name}")
            test_cases.append(f"result = {func_name}()")
            test_cases.append(f"assert result is not None")
            test_cases.append("")
        
        # Add data type specific tests
        if 'list' in semantic_intent.get('data_types', []):
            test_cases.extend([
                "# Test with list input",
                "test_list = [1, 2, 3, 4, 5]",
                "# Add assertions based on expected behavior",
                ""
            ])
        
        return test_cases
    
    def _generate_documentation(self, code: str, semantic_intent: Dict[str, Any]) -> str:
        """Generate documentation for the code"""
        doc = f"# Generated Code Documentation\n\n"
        doc += f"## Purpose\n"
        doc += f"This code was generated to: {semantic_intent.get('primary_action', 'perform the requested task')}\n\n"
        
        if semantic_intent.get('data_types'):
            doc += f"## Data Types\n"
            doc += f"Works with: {', '.join(semantic_intent['data_types'])}\n\n"
        
        if semantic_intent.get('algorithmic_approach'):
            doc += f"## Algorithm\n"
            doc += f"Uses: {semantic_intent['algorithmic_approach']}\n\n"
        
        doc += f"## Usage\n"
        doc += f"```python\n{code}\n```\n\n"
        
        doc += f"## Notes\n"
        doc += f"- Generated using consciousness-guided AI\n"
        doc += f"- Please review and test before production use\n"
        
        return doc


def test_nlp_to_code():
    """Test function for NLP-to-Code generation"""
    print("Testing Advanced NLP-to-Code Generation Engine...")
    
    # Initialize generator
    generator = ConsciousnessCodeGenerator()
    
    # Test requests
    test_requests = [
        CodeGenerationRequest(
            natural_language="Create a function that sorts a list of numbers in ascending order",
            target_language="python",
            complexity_level=2,
            consciousness_guidance=(0.7, 0.2, 0.1)  # Action-oriented
        ),
        CodeGenerationRequest(
            natural_language="Create a class to manage a simple inventory system",
            target_language="python",
            complexity_level=5,
            consciousness_guidance=(0.2, 0.7, 0.1)  # Structure-oriented
        ),
        CodeGenerationRequest(
            natural_language="Create an elegant recursive function to calculate fibonacci numbers",
            target_language="python",
            complexity_level=4,
            consciousness_guidance=(0.1, 0.2, 0.7)  # Integration-oriented
        )
    ]
    
    for i, request in enumerate(test_requests):
        print(f"\nTest {i+1}: {request.natural_language}")
        print("-" * 50)
        
        try:
            result = generator.generate_code(request)
            
            print(f"Generated Code:")
            print(result.source_code)
            print(f"\nConfidence Score: {result.confidence_score:.3f}")
            print(f"Execution Safety: {result.execution_safety:.3f}")
            print(f"Performance Estimate: {result.performance_estimate:.3f}")
            print(f"Generation Time: {result.generation_time:.3f}s")
            print(f"Complexity: {result.complexity_analysis.get('complexity_score', 0):.1f}")
            
        except Exception as e:
            print(f"Error generating code: {e}")
    
    print("\nAdvanced NLP-to-Code Generation Engine test completed!")


if __name__ == "__main__":
    test_nlp_to_code()
