"""
AE Attention Mechanisms - RBY-weighted transformer attention
Clean implementation for integration with PyTorch transformer models
"""
import logging
import math
from typing import Dict, List, Tuple, Any, Optional, Union
import json
from ae_core import RBYTriplet

logger = logging.getLogger(__name__)

# Use only Python standard library for tensor operations
# In production, replace with torch.Tensor operations

class AEAttentionWeights:
    """
    RBY-enhanced attention weights for transformer models
    Modifies attention patterns based on cognitive weights
    """
    
    def __init__(self, d_model: int = 512, num_heads: int = 8):
        self.d_model = d_model
        self.num_heads = num_heads
        self.d_k = d_model // num_heads
        
        # RBY influence parameters
        self.rby_influence = 0.1  # How much RBY affects attention
        self.cognitive_bias = {
            'red': 1.0,    # Perception bias
            'blue': 1.0,   # Cognition bias  
            'yellow': 1.0  # Execution bias
        }
    
    def compute_rby_attention_bias(self, 
                                   query_rby: List[Tuple[float, float, float]], 
                                   key_rby: List[Tuple[float, float, float]]) -> List[List[float]]:
        """
        Compute RBY-based attention bias matrix
        Higher bias = stronger attention between cognitively similar tokens
        """
        seq_len_q = len(query_rby)
        seq_len_k = len(key_rby)
        bias_matrix = []
        
        for i in range(seq_len_q):
            bias_row = []
            q_r, q_b, q_y = query_rby[i]
            
            for j in range(seq_len_k):
                k_r, k_b, k_y = key_rby[j]
                
                # Compute cognitive similarity
                red_similarity = 1.0 - abs(q_r - k_r)
                blue_similarity = 1.0 - abs(q_b - k_b)
                yellow_similarity = 1.0 - abs(q_y - k_y)
                
                # Weighted cognitive alignment
                cognitive_alignment = (
                    red_similarity * self.cognitive_bias['red'] +
                    blue_similarity * self.cognitive_bias['blue'] +
                    yellow_similarity * self.cognitive_bias['yellow']
                ) / 3.0
                
                # Convert to attention bias
                attention_bias = (cognitive_alignment - 0.5) * self.rby_influence
                bias_row.append(attention_bias)
            
            bias_matrix.append(bias_row)
        
        return bias_matrix
    
    def apply_rby_attention(self, 
                           attention_scores: List[List[float]], 
                           rby_bias: List[List[float]]) -> List[List[float]]:
        """Apply RBY bias to raw attention scores"""
        seq_len_q = len(attention_scores)
        seq_len_k = len(attention_scores[0]) if attention_scores else 0
        
        enhanced_scores = []
        for i in range(seq_len_q):
            enhanced_row = []
            for j in range(seq_len_k):
                # Add RBY bias to attention score
                enhanced_score = attention_scores[i][j] + rby_bias[i][j]
                enhanced_row.append(enhanced_score)
            enhanced_scores.append(enhanced_row)
        
        return enhanced_scores
    
    def softmax(self, scores: List[float]) -> List[float]:
        """Apply softmax normalization"""
        if not scores:
            return []
        
        # Prevent overflow
        max_score = max(scores)
        exp_scores = [math.exp(score - max_score) for score in scores]
        sum_exp = sum(exp_scores)
        
        if sum_exp == 0:
            return [1.0 / len(scores)] * len(scores)
        
        return [exp_score / sum_exp for exp_score in exp_scores]
    
    def compute_attention_weights(self, 
                                 query_rby: List[Tuple[float, float, float]], 
                                 key_rby: List[Tuple[float, float, float]],
                                 attention_scores: List[List[float]]) -> List[List[float]]:
        """
        Compute final attention weights with RBY enhancement
        """
        # Compute RBY bias
        rby_bias = self.compute_rby_attention_bias(query_rby, key_rby)
        
        # Apply RBY bias to attention scores
        enhanced_scores = self.apply_rby_attention(attention_scores, rby_bias)
        
        # Apply softmax to each query position
        attention_weights = []
        for enhanced_row in enhanced_scores:
            normalized_weights = self.softmax(enhanced_row)
            attention_weights.append(normalized_weights)
        
        return attention_weights
    
    def set_cognitive_focus(self, red_bias: float = 1.0, blue_bias: float = 1.0, yellow_bias: float = 1.0):
        """Set cognitive focus biases for different tasks"""
        self.cognitive_bias['red'] = red_bias      # Boost perception
        self.cognitive_bias['blue'] = blue_bias    # Boost cognition
        self.cognitive_bias['yellow'] = yellow_bias # Boost execution
        
        logger.info(f"Cognitive focus set to R:{red_bias}, B:{blue_bias}, Y:{yellow_bias}")

class AETransformerLayer:
    """
    Simplified transformer layer with AE attention
    For demonstration - in production use torch.nn.TransformerEncoderLayer
    """
    
    def __init__(self, d_model: int = 512, num_heads: int = 8):
        self.d_model = d_model
        self.num_heads = num_heads
        self.ae_attention = AEAttentionWeights(d_model, num_heads)
        
    def forward_pass_demo(self, 
                         input_embeddings: List[List[float]], 
                         rby_matrix: List[Tuple[float, float, float]]) -> Dict[str, Any]:
        """
        Demonstrate forward pass with AE attention
        Returns analysis instead of actual computation for clarity
        """
        seq_len = len(input_embeddings)
        
        # Simulate attention score computation (Q @ K^T / sqrt(d_k))
        # In practice this would be actual matrix operations
        simulated_attention_scores = []
        for i in range(seq_len):
            score_row = []
            for j in range(seq_len):
                # Simulate dot product attention
                base_score = 0.5 + (0.1 * (i - j) ** 2) / seq_len  # Simple simulation
                score_row.append(base_score)
            simulated_attention_scores.append(score_row)
        
        # Apply AE attention enhancement
        ae_attention_weights = self.ae_attention.compute_attention_weights(
            query_rby=rby_matrix,
            key_rby=rby_matrix, 
            attention_scores=simulated_attention_scores
        )
        
        # Analyze attention patterns
        attention_entropy = []
        for weights in ae_attention_weights:
            # Compute entropy of attention distribution
            entropy = -sum(w * math.log(w + 1e-10) for w in weights if w > 0)
            attention_entropy.append(entropy)
        
        return {
            'input_sequence_length': seq_len,
            'rby_enhanced_attention': ae_attention_weights,
            'attention_entropy': attention_entropy,
            'cognitive_bias_applied': self.ae_attention.cognitive_bias.copy(),
            'average_attention_entropy': sum(attention_entropy) / len(attention_entropy) if attention_entropy else 0
        }

def demo_ae_attention():
    """Demonstrate AE attention mechanisms"""
    print("AE Attention Mechanisms Demo")
    print("=" * 50)
    
    # Create attention layer
    ae_layer = AETransformerLayer(d_model=512, num_heads=8)
    
    # Sample sequence with different cognitive patterns
    sequence_data = [
        ("see", (0.8, 0.1, 0.1)),     # Perception-heavy
        ("think", (0.2, 0.7, 0.1)),   # Cognition-heavy  
        ("about", (0.3, 0.4, 0.3)),   # Balanced
        ("this", (0.4, 0.3, 0.3)),    # Slightly perception
        ("problem", (0.2, 0.6, 0.2)), # Cognition-heavy
        ("and", (0.3, 0.3, 0.4)),     # Slightly execution
        ("solve", (0.1, 0.3, 0.6)),   # Execution-heavy
        ("it", (0.3, 0.3, 0.4))       # Balanced
    ]
    
    tokens = [item[0] for item in sequence_data]
    rby_matrix = [item[1] for item in sequence_data]
    
    # Simulate embeddings (in practice these would be learned)
    embeddings = [[0.1 * i + 0.05 * j for j in range(512)] for i in range(len(tokens))]
    
    print(f"Input sequence: {' '.join(tokens)}")
    print(f"RBY patterns: {rby_matrix}")
    
    # Test different cognitive focuses
    focus_scenarios = [
        ("Balanced", 1.0, 1.0, 1.0),
        ("Perception Focus", 2.0, 1.0, 1.0),
        ("Cognition Focus", 1.0, 2.0, 1.0), 
        ("Execution Focus", 1.0, 1.0, 2.0)
    ]
    
    for scenario_name, red_bias, blue_bias, yellow_bias in focus_scenarios:
        print(f"\n--- {scenario_name} ---")
        
        # Set cognitive focus
        ae_layer.ae_attention.set_cognitive_focus(red_bias, blue_bias, yellow_bias)
        
        # Forward pass
        results = ae_layer.forward_pass_demo(embeddings, rby_matrix)
        
        print(f"Average attention entropy: {results['average_attention_entropy']:.3f}")
        print(f"Cognitive bias applied: {results['cognitive_bias_applied']}")
        
        # Show attention weights for first token
        first_token_attention = results['rby_enhanced_attention'][0]
        print(f"'{tokens[0]}' attention to others:")
        for j, (target_token, attention_weight) in enumerate(zip(tokens, first_token_attention)):
            print(f"  -> '{target_token}': {attention_weight:.3f}")
    
    # Save attention analysis
    analysis_file = "ae_attention_analysis.json"
    with open(analysis_file, 'w') as f:
        json.dump({
            'sequence': tokens,
            'rby_matrix': rby_matrix,
            'scenarios_tested': len(focus_scenarios),
            'demo_timestamp': 'production_demo'
        }, f, indent=2)
    
    print(f"\nAttention analysis saved to: {analysis_file}")

if __name__ == "__main__":
    demo_ae_attention()
