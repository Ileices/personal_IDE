"""
AE Tokenizer Integration - Maps tokens to RBY triplets for LLM training
Clean implementation that integrates with standard tokenizers
"""
import logging
from typing import Dict, List, Tuple, Any, Optional, Union
import json
import time
from pathlib import Path
from ae_core import RBYTriplet, AETextMapper, AEProcessor

logger = logging.getLogger(__name__)

class AETokenizer:
    """
    AE-enhanced tokenizer that maps every token to RBY cognitive weights
    Compatible with HuggingFace tokenizers and training pipelines
    """
    
    def __init__(self, vocab_size: int = 50000, special_tokens: Optional[Dict[str, int]] = None):
        self.vocab_size = vocab_size
        self.token_to_id: Dict[str, int] = {}
        self.id_to_token: Dict[int, str] = {}
        self.token_to_rby: Dict[str, RBYTriplet] = {}
        self.id_to_rby: Dict[int, RBYTriplet] = {}
        
        # Special tokens
        self.special_tokens = special_tokens or {
            '<pad>': 0, '<unk>': 1, '<bos>': 2, '<eos>': 3
        }
        
        # Initialize special tokens
        for token, token_id in self.special_tokens.items():
            self.token_to_id[token] = token_id
            self.id_to_token[token_id] = token
            # Special tokens get balanced RBY
            self.token_to_rby[token] = RBYTriplet(1/3, 1/3, 1/3)
            self.id_to_rby[token_id] = self.token_to_rby[token]
        
        self.next_id = max(self.special_tokens.values()) + 1
        self.ae_mapper = AETextMapper()
        
    def add_token(self, token: str) -> int:
        """Add a token to vocabulary with AE mapping"""
        if token in self.token_to_id:
            return self.token_to_id[token]
        
        if self.next_id >= self.vocab_size:
            logger.warning(f"Vocabulary size limit reached: {self.vocab_size}")
            return self.special_tokens['<unk>']
        
        token_id = self.next_id
        self.token_to_id[token] = token_id
        self.id_to_token[token_id] = token
        
        # Map token to RBY using AE principles
        rby = self.ae_mapper.map_text_to_rby(token)
        self.token_to_rby[token] = rby
        self.id_to_rby[token_id] = rby
        
        self.next_id += 1
        return token_id
    
    def encode(self, text: str) -> List[int]:
        """Encode text to token IDs (simple word-based for demo)"""
        # Simple whitespace tokenization for demonstration
        # In production, use proper BPE/WordPiece
        words = text.lower().split()
        token_ids = []
        
        for word in words:
            # Clean punctuation (basic approach)
            clean_word = ''.join(c for c in word if c.isalnum())
            if clean_word:
                token_id = self.add_token(clean_word)
                token_ids.append(token_id)
        
        return token_ids
    
    def decode(self, token_ids: List[int]) -> str:
        """Decode token IDs back to text"""
        tokens = []
        for token_id in token_ids:
            if token_id in self.id_to_token:
                tokens.append(self.id_to_token[token_id])
            else:
                tokens.append('<unk>')
        return ' '.join(tokens)
    
    def get_token_rby(self, token: Union[str, int]) -> RBYTriplet:
        """Get RBY triplet for a token"""
        if isinstance(token, str):
            return self.token_to_rby.get(token, RBYTriplet(1/3, 1/3, 1/3))
        else:  # int (token_id)
            return self.id_to_rby.get(token, RBYTriplet(1/3, 1/3, 1/3))
    
    def get_sequence_rby_matrix(self, token_ids: List[int]) -> List[Tuple[float, float, float]]:
        """Get RBY matrix for a sequence of tokens"""
        return [self.get_token_rby(token_id).to_tuple() for token_id in token_ids]
    
    def analyze_vocabulary_distribution(self) -> Dict[str, Any]:
        """Analyze RBY distribution across vocabulary"""
        if not self.token_to_rby:
            return {'status': 'empty_vocabulary'}
        
        total_r = sum(rby.red for rby in self.token_to_rby.values())
        total_b = sum(rby.blue for rby in self.token_to_rby.values())
        total_y = sum(rby.yellow for rby in self.token_to_rby.values())
        count = len(self.token_to_rby)
        
        avg_rby = (total_r / count, total_b / count, total_y / count)
        
        # Find tokens with extreme RBY values
        red_heavy = sorted(self.token_to_rby.items(), key=lambda x: x[1].red, reverse=True)[:5]
        blue_heavy = sorted(self.token_to_rby.items(), key=lambda x: x[1].blue, reverse=True)[:5]
        yellow_heavy = sorted(self.token_to_rby.items(), key=lambda x: x[1].yellow, reverse=True)[:5]
        
        return {
            'vocab_size': count,
            'average_rby': avg_rby,
            'ae_compliance': abs(1.0 - sum(avg_rby)),
            'red_heavy_tokens': [(token, rby.to_tuple()) for token, rby in red_heavy],
            'blue_heavy_tokens': [(token, rby.to_tuple()) for token, rby in blue_heavy],
            'yellow_heavy_tokens': [(token, rby.to_tuple()) for token, rby in yellow_heavy]
        }
    
    def save_vocabulary(self, filepath: str):
        """Save vocabulary with RBY mappings"""
        vocab_data = {
            'vocab_size': self.vocab_size,
            'special_tokens': self.special_tokens,
            'token_to_id': self.token_to_id,
            'token_rby_mappings': {
                token: rby.to_tuple() for token, rby in self.token_to_rby.items()
            },
            'analysis': self.analyze_vocabulary_distribution()
        }
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(vocab_data, f, indent=2)
        
        logger.info(f"Vocabulary saved to: {filepath}")
    
    def load_vocabulary(self, filepath: str):
        """Load vocabulary with RBY mappings"""
        with open(filepath, 'r', encoding='utf-8') as f:
            vocab_data = json.load(f)
        
        self.vocab_size = vocab_data['vocab_size']
        self.special_tokens = vocab_data['special_tokens']
        self.token_to_id = vocab_data['token_to_id']
        
        # Rebuild reverse mappings
        self.id_to_token = {v: k for k, v in self.token_to_id.items()}
        
        # Rebuild RBY mappings
        for token, rby_tuple in vocab_data['token_rby_mappings'].items():
            rby = RBYTriplet(*rby_tuple)
            self.token_to_rby[token] = rby
            token_id = self.token_to_id[token]
            self.id_to_rby[token_id] = rby
        
        self.next_id = max(self.token_to_id.values()) + 1
        logger.info(f"Vocabulary loaded from: {filepath}")

def demo_ae_tokenizer():
    """Demonstrate AE tokenizer capabilities"""
    print("AE Tokenizer Integration Demo")
    print("=" * 50)
    
    # Create tokenizer
    tokenizer = AETokenizer(vocab_size=1000)
    
    # Test texts
    test_texts = [
        "The quick brown fox jumps over the lazy dog",
        "Artificial intelligence processes cognitive patterns",
        "Red perception blue cognition yellow execution",
        "Mathematical models require systematic thinking"
    ]
    
    print("Encoding and analyzing texts:")
    for i, text in enumerate(test_texts):
        print(f"\n{i+1}. Text: {text}")
        
        # Encode
        token_ids = tokenizer.encode(text)
        print(f"   Token IDs: {token_ids}")
        
        # Decode (should match original)
        decoded = tokenizer.decode(token_ids)
        print(f"   Decoded: {decoded}")
        
        # Get RBY matrix
        rby_matrix = tokenizer.get_sequence_rby_matrix(token_ids)
        print(f"   RBY Matrix: {[f'({r:.2f},{b:.2f},{y:.2f})' for r,b,y in rby_matrix]}")
    
    # Analyze vocabulary
    print(f"\nVocabulary Analysis:")
    analysis = tokenizer.analyze_vocabulary_distribution()
    for key, value in analysis.items():
        if key != 'red_heavy_tokens' and key != 'blue_heavy_tokens' and key != 'yellow_heavy_tokens':
            print(f"  {key}: {value}")
    
    print(f"\nTop Red-heavy tokens:")
    for token, rby in analysis['red_heavy_tokens']:
        print(f"  {token}: {rby}")
    
    # Save vocabulary
    vocab_file = "ae_tokenizer_vocab.json"
    tokenizer.save_vocabulary(vocab_file)
    print(f"\nVocabulary saved to: {vocab_file}")
    
    return tokenizer

if __name__ == "__main__":
    demo_ae_tokenizer()
