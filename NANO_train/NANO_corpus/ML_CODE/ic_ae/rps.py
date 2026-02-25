"""
IC-AE RPS Engine - Recursive Predictive Structuring
Entropy-free variation system for consciousness evolution

Author: Computer Science Implementation
Date: June 12, 2025
Status: Production-Ready Core Module
"""

import numpy as np
import hashlib
import json
import math
from typing import Dict, List, Any, Optional, Callable, Tuple
from dataclasses import dataclass, field
from abc import ABC, abstractmethod
from collections import deque
import threading
import time

from .rby import RBYVector, RBYPhysics


@dataclass
class PredictionState:
    """State captured for recursive prediction"""
    input_hash: str
    rby_state: RBYVector
    prediction: Any
    confidence: float
    timestamp: float
    generation: int
    parent_states: List[str] = field(default_factory=list)


@dataclass
class StructuralPattern:
    """Discovered structural pattern for prediction"""
    pattern_id: str
    pattern_type: str  # 'sequence', 'tree', 'graph', 'fractal'
    rby_signature: RBYVector
    prediction_accuracy: float
    usage_count: int
    structure_data: Dict[str, Any]


class PredictiveStructure(ABC):
    """Abstract base for predictive structures"""
    
    @abstractmethod
    def predict(self, input_data: Any, context: Dict[str, Any]) -> Tuple[Any, float]:
        """Make prediction and return confidence"""
        pass
    
    @abstractmethod
    def update(self, input_data: Any, expected_output: Any, actual_output: Any):
        """Update structure based on prediction accuracy"""
        pass
    
    @abstractmethod
    def get_rby_signature(self) -> RBYVector:
        """Get RBY signature of this structure"""
        pass


class SequentialStructure(PredictiveStructure):
    """Predicts based on sequential patterns"""
    
    def __init__(self, sequence_length: int = 5):
        self.sequence_length = sequence_length
        self.pattern_memory: Dict[str, Dict] = {}
        self.rby_weights = RBYVector(0.4, 0.3, 0.3)  # Perception-heavy
        
    def predict(self, input_data: Any, context: Dict[str, Any]) -> Tuple[Any, float]:
        """Predict next element in sequence"""
        if not isinstance(input_data, (list, tuple, str)):
            return None, 0.0
            
        # Get recent sequence
        if len(input_data) < self.sequence_length:
            sequence_key = str(input_data)
        else:
            sequence_key = str(input_data[-self.sequence_length:])
            
        pattern_hash = hashlib.md5(sequence_key.encode()).hexdigest()
        
        if pattern_hash in self.pattern_memory:
            pattern = self.pattern_memory[pattern_hash]
            return pattern['next_element'], pattern['confidence']
            
        return None, 0.0
    
    def update(self, input_data: Any, expected_output: Any, actual_output: Any):
        """Update sequential patterns"""
        if not isinstance(input_data, (list, tuple, str)):
            return
            
        if len(input_data) >= self.sequence_length:
            # Extract pattern
            sequence = input_data[-self.sequence_length:]
            next_element = expected_output if expected_output is not None else actual_output
            
            sequence_key = str(sequence)
            pattern_hash = hashlib.md5(sequence_key.encode()).hexdigest()
            
            if pattern_hash not in self.pattern_memory:
                self.pattern_memory[pattern_hash] = {
                    'next_element': next_element,
                    'confidence': 0.1,
                    'count': 1
                }
            else:
                pattern = self.pattern_memory[pattern_hash]
                if pattern['next_element'] == next_element:
                    pattern['confidence'] = min(0.99, pattern['confidence'] + 0.1)
                else:
                    pattern['confidence'] *= 0.9
                pattern['count'] += 1
    
    def get_rby_signature(self) -> RBYVector:
        return self.rby_weights


class TreeStructure(PredictiveStructure):
    """Tree-based hierarchical prediction"""
    
    def __init__(self, max_depth: int = 8):
        self.max_depth = max_depth
        self.tree_nodes: Dict[str, Dict] = {}
        self.rby_weights = RBYVector(0.3, 0.4, 0.3)  # Cognition-heavy
        
    def predict(self, input_data: Any, context: Dict[str, Any]) -> Tuple[Any, float]:
        """Navigate tree structure for prediction"""
        path = self._data_to_path(input_data)
        current_node = "root"
        
        for step in path[:self.max_depth]:
            node_key = f"{current_node}->{step}"
            if node_key in self.tree_nodes:
                current_node = node_key
            else:
                break
                
        # Look for children of current node
        children = [k for k in self.tree_nodes.keys() if k.startswith(current_node + "->")]
        if children:
            # Return most confident child
            best_child = max(children, key=lambda x: self.tree_nodes[x].get('confidence', 0))
            child_data = self.tree_nodes[best_child]
            return child_data['prediction'], child_data['confidence']
            
        return None, 0.0
    
    def update(self, input_data: Any, expected_output: Any, actual_output: Any):
        """Update tree structure"""
        path = self._data_to_path(input_data)
        current_node = "root"
        
        # Build/update path through tree
        for i, step in enumerate(path[:self.max_depth]):
            node_key = f"{current_node}->{step}"
            
            if node_key not in self.tree_nodes:
                self.tree_nodes[node_key] = {
                    'prediction': expected_output if expected_output else actual_output,
                    'confidence': 0.1,
                    'depth': i + 1,
                    'visits': 1
                }
            else:
                node = self.tree_nodes[node_key]
                node['visits'] += 1
                
                # Update confidence based on accuracy
                if node['prediction'] == (expected_output if expected_output else actual_output):
                    node['confidence'] = min(0.99, node['confidence'] + 0.05)
                else:
                    node['confidence'] = max(0.01, node['confidence'] - 0.05)
                    
            current_node = node_key
    
    def _data_to_path(self, data: Any) -> List[str]:
        """Convert data to tree path"""
        if isinstance(data, str):
            return list(data)[:self.max_depth]
        elif isinstance(data, (list, tuple)):
            return [str(x) for x in data][:self.max_depth]
        else:
            return [str(data)]
    
    def get_rby_signature(self) -> RBYVector:
        return self.rby_weights


class FractalStructure(PredictiveStructure):
    """Fractal self-similar prediction patterns"""
    
    def __init__(self, fractal_depth: int = 4):
        self.fractal_depth = fractal_depth
        self.fractal_patterns: Dict[str, Dict] = {}
        self.rby_weights = RBYVector(0.2, 0.3, 0.5)  # Execution-heavy
        
    def predict(self, input_data: Any, context: Dict[str, Any]) -> Tuple[Any, float]:
        """Use fractal self-similarity for prediction"""
        # Find fractal patterns at different scales
        scales = [1, 2, 4, 8]
        best_prediction = None
        best_confidence = 0.0
        
        for scale in scales:
            pattern = self._extract_fractal_pattern(input_data, scale)
            pattern_hash = hashlib.md5(str(pattern).encode()).hexdigest()
            
            if pattern_hash in self.fractal_patterns:
                fractal_data = self.fractal_patterns[pattern_hash]
                if fractal_data['confidence'] > best_confidence:
                    best_prediction = fractal_data['prediction']
                    best_confidence = fractal_data['confidence']
                    
        return best_prediction, best_confidence
    
    def update(self, input_data: Any, expected_output: Any, actual_output: Any):
        """Update fractal patterns"""
        scales = [1, 2, 4, 8]
        target = expected_output if expected_output else actual_output
        
        for scale in scales:
            pattern = self._extract_fractal_pattern(input_data, scale)
            pattern_hash = hashlib.md5(str(pattern).encode()).hexdigest()
            
            if pattern_hash not in self.fractal_patterns:
                self.fractal_patterns[pattern_hash] = {
                    'prediction': target,
                    'confidence': 0.1,
                    'scale': scale,
                    'occurrences': 1
                }
            else:
                fractal_data = self.fractal_patterns[pattern_hash]
                fractal_data['occurrences'] += 1
                
                if fractal_data['prediction'] == target:
                    fractal_data['confidence'] = min(0.99, fractal_data['confidence'] + 0.1)
                else:
                    fractal_data['confidence'] *= 0.95
    
    def _extract_fractal_pattern(self, data: Any, scale: int) -> List:
        """Extract self-similar pattern at given scale"""
        if isinstance(data, str):
            data_list = list(data)
        elif isinstance(data, (list, tuple)):
            data_list = list(data)
        else:
            data_list = [str(data)]
            
        pattern = []
        for i in range(0, len(data_list), scale):
            chunk = data_list[i:i+scale]
            if len(chunk) == scale:
                pattern.append(tuple(chunk))
                
        return pattern
    
    def get_rby_signature(self) -> RBYVector:
        return self.rby_weights


class RPSEngine:
    """Recursive Predictive Structuring - Main Engine"""
    
    def __init__(self, max_states: int = 10000):
        self.max_states = max_states
        self.prediction_states: deque = deque(maxlen=max_states)
        self.state_lookup: Dict[str, PredictionState] = {}
        
        # Initialize predictive structures
        self.structures: List[PredictiveStructure] = [
            SequentialStructure(),
            TreeStructure(),
            FractalStructure()
        ]
        
        # Performance tracking
        self.performance_history: Dict[str, List[float]] = {}
        self.global_performance: List[float] = []
        
        # Threading for concurrent processing
        self.processing_lock = threading.Lock()
        
    def predict(self, input_data: Any, context: Optional[Dict[str, Any]] = None) -> Tuple[Any, float, str]:
        """Make prediction using all structures and return best result"""
        if context is None:
            context = {}
            
        predictions = []
        
        # Get predictions from all structures
        for i, structure in enumerate(self.structures):
            try:
                prediction, confidence = structure.predict(input_data, context)
                if prediction is not None and confidence > 0:
                    predictions.append({
                        'prediction': prediction,
                        'confidence': confidence,
                        'structure_id': i,
                        'structure_type': type(structure).__name__,
                        'rby_signature': structure.get_rby_signature()
                    })
            except Exception as e:
                print(f"Structure {type(structure).__name__} prediction error: {e}")
                continue
        
        if not predictions:
            return None, 0.0, "no_prediction"
            
        # Select best prediction based on confidence and RBY balance
        best_prediction = max(predictions, key=lambda x: x['confidence'])
        
        # Create prediction state
        input_hash = hashlib.sha256(str(input_data).encode()).hexdigest()
        
        with self.processing_lock:
            prediction_state = PredictionState(
                input_hash=input_hash,
                rby_state=best_prediction['rby_signature'],
                prediction=best_prediction['prediction'],
                confidence=best_prediction['confidence'],
                timestamp=time.time(),
                generation=self._get_next_generation()
            )
            
            self.prediction_states.append(prediction_state)
            self.state_lookup[input_hash] = prediction_state
        
        return (best_prediction['prediction'], 
                best_prediction['confidence'],
                best_prediction['structure_type'])
    
    def update_from_feedback(self, input_data: Any, expected_output: Any, 
                           actual_output: Any) -> float:
        """Update all structures based on feedback"""
        accuracy_scores = []
        
        for structure in self.structures:
            try:
                structure.update(input_data, expected_output, actual_output)
                
                # Calculate accuracy for this structure
                prediction, confidence = structure.predict(input_data, {})
                if prediction is not None:
                    accuracy = self._calculate_accuracy(prediction, expected_output)
                    accuracy_scores.append(accuracy)
                    
                    # Track performance by structure type
                    struct_name = type(structure).__name__
                    if struct_name not in self.performance_history:
                        self.performance_history[struct_name] = []
                    self.performance_history[struct_name].append(accuracy)
                    
            except Exception as e:
                print(f"Structure {type(structure).__name__} update error: {e}")
                continue
        
        # Calculate global performance
        if accuracy_scores:
            avg_accuracy = np.mean(accuracy_scores)
            self.global_performance.append(avg_accuracy)
            return avg_accuracy
            
        return 0.0
    
    def evolve_structures(self, evolution_pressure: float = 0.1):
        """Evolve structures based on performance"""
        for structure in self.structures:
            struct_name = type(structure).__name__
            
            if struct_name in self.performance_history:
                performance_history = self.performance_history[struct_name]
                
                if len(performance_history) > 10:
                    # Calculate evolution direction
                    recent_performance = np.mean(performance_history[-5:])
                    historical_performance = np.mean(performance_history[:-5])
                    
                    performance_delta = recent_performance - historical_performance
                    
                    # Apply RBY evolution
                    current_rby = structure.get_rby_signature()
                    evolution_vector = RBYPhysics.calculate_evolution_pressure(
                        performance_history, current_rby
                    )
                    
                    # Apply mutation based on evolution pressure
                    if abs(performance_delta) > evolution_pressure:
                        mutated_rby = RBYPhysics.mutate_rby(
                            current_rby + evolution_vector,
                            mutation_strength=evolution_pressure
                        )
                        structure.rby_weights = mutated_rby
    
    def get_recursive_prediction(self, input_data: Any, recursion_depth: int = 3) -> List[Dict]:
        """Generate recursive predictions by feeding output back as input"""
        predictions = []
        current_input = input_data
        
        for depth in range(recursion_depth):
            prediction, confidence, structure_type = self.predict(current_input)
            
            if prediction is None or confidence < 0.1:
                break
                
            predictions.append({
                'depth': depth,
                'input': current_input,
                'prediction': prediction,
                'confidence': confidence,
                'structure_type': structure_type,
                'timestamp': time.time()
            })
            
            # Use prediction as next input for recursion
            current_input = prediction
            
        return predictions
    
    def compress_states(self, compression_ratio: float = 0.5):
        """Compress prediction states to RBY color values"""
        if len(self.prediction_states) < self.max_states * 0.8:
            return  # Not enough states to compress
            
        # Sort states by importance (confidence * recency)
        current_time = time.time()
        scored_states = []
        
        for state in self.prediction_states:
            recency_score = 1.0 / (1.0 + (current_time - state.timestamp) / 3600)  # Decay over hours
            importance = state.confidence * recency_score
            scored_states.append((importance, state))
            
        scored_states.sort(key=lambda x: x[0], reverse=True)
        
        # Keep top states, compress the rest
        keep_count = int(len(scored_states) * (1.0 - compression_ratio))
        states_to_compress = scored_states[keep_count:]
        
        # Compress states to RBY color glyphs
        compressed_glyphs = []
        for importance, state in states_to_compress:
            glyph = self._state_to_glyph(state)
            compressed_glyphs.append(glyph)
            
            # Remove from lookup
            if state.input_hash in self.state_lookup:
                del self.state_lookup[state.input_hash]
        
        # Update deque
        self.prediction_states = deque([state for _, state in scored_states[:keep_count]], 
                                     maxlen=self.max_states)
        
        return compressed_glyphs
    
    def _get_next_generation(self) -> int:
        """Get next generation number"""
        if not self.prediction_states:
            return 0
        return max(state.generation for state in self.prediction_states) + 1
    
    def _calculate_accuracy(self, prediction: Any, expected: Any) -> float:
        """Calculate prediction accuracy"""
        if prediction == expected:
            return 1.0
        elif isinstance(prediction, (int, float)) and isinstance(expected, (int, float)):
            try:
                error = abs(prediction - expected) / max(abs(expected), 1.0)
                return max(0.0, 1.0 - error)
            except (ZeroDivisionError, TypeError):
                return 0.0
        elif isinstance(prediction, str) and isinstance(expected, str):
            # String similarity (simplified)
            common = len(set(prediction) & set(expected))
            total = len(set(prediction) | set(expected))
            return common / max(total, 1)
        else:
            return 0.0
    
    def _state_to_glyph(self, state: PredictionState) -> Dict[str, Any]:
        """Convert prediction state to compressed glyph"""
        # Convert state to RBY color
        rgb = RBYPhysics.rby_to_rgb(state.rby_state)
        
        glyph = {
            'type': 'rps_state_glyph',
            'rgb': rgb,
            'confidence': state.confidence,
            'generation': state.generation,
            'timestamp': state.timestamp,
            'prediction_hash': hashlib.md5(str(state.prediction).encode()).hexdigest()[:16]
        }
        
        return glyph
    
    def get_system_stats(self) -> Dict[str, Any]:
        """Get comprehensive system statistics"""
        stats = {
            'total_states': len(self.prediction_states),
            'active_structures': len(self.structures),
            'global_performance': {
                'current': self.global_performance[-1] if self.global_performance else 0.0,
                'average': np.mean(self.global_performance) if self.global_performance else 0.0,
                'trend': 'improving' if len(self.global_performance) > 1 and 
                        self.global_performance[-1] > self.global_performance[-2] else 'stable'
            },
            'structure_performance': {}
        }
        
        for struct_name, performance in self.performance_history.items():
            if performance:
                stats['structure_performance'][struct_name] = {
                    'current': performance[-1],
                    'average': np.mean(performance),
                    'sample_count': len(performance)
                }
                
        return stats


# Real-world usage example
if __name__ == "__main__":
    # Initialize RPS Engine
    rps = RPSEngine()
    
    # Test with sequence data
    print("Testing RPS Engine with sequence prediction...")
    
    # Train on sequence patterns
    sequences = [
        [1, 2, 3, 4, 5],
        [2, 4, 6, 8, 10],
        [1, 1, 2, 3, 5],  # Fibonacci start
        [3, 6, 9, 12, 15]
    ]
    
    for seq in sequences:
        for i in range(1, len(seq)):
            input_seq = seq[:i]
            expected_next = seq[i]
            
            # Make prediction
            prediction, confidence, structure = rps.predict(input_seq)
            print(f"Input: {input_seq} -> Predicted: {prediction} (confidence: {confidence:.2f}, structure: {structure})")
            
            # Update with feedback
            accuracy = rps.update_from_feedback(input_seq, expected_next, prediction)
            
    # Test recursive prediction
    print("\nTesting recursive prediction...")
    recursive_preds = rps.get_recursive_prediction([1, 2, 3], recursion_depth=5)
    for pred in recursive_preds:
        print(f"Depth {pred['depth']}: {pred['input']} -> {pred['prediction']} (confidence: {pred['confidence']:.2f})")
    
    # Get system statistics
    stats = rps.get_system_stats()
    print(f"\nSystem Statistics:")
    print(f"Total states: {stats['total_states']}")
    print(f"Global performance: {stats['global_performance']}")
    print(f"Structure performance: {stats['structure_performance']}")
    
    print("RPS Engine test completed successfully!")
