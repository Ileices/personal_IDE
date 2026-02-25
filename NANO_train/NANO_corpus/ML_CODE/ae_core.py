"""
AE Core - Clean implementation of Absolute Existence mathematics
Modular, testable implementation without the cosmic bloat
"""
import logging
import time
from typing import Dict, List, Tuple, Any, Optional
from dataclasses import dataclass
from decimal import Decimal, getcontext
import json

# Set up proper logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Use Decimal for actual precision when needed
getcontext().prec = 50  # Reasonable precision, not cosmic 81 digits

@dataclass
class RBYTriplet:
    """Red-Blue-Yellow cognitive weights that sum to 1.0 (AE = C = 1)"""
    red: float    # Perception weight
    blue: float   # Cognition weight  
    yellow: float # Execution weight
    
    def __post_init__(self):
        """Normalize to maintain AE = C = 1 constraint"""
        total = self.red + self.blue + self.yellow
        if total > 0:
            self.red /= total
            self.blue /= total
            self.yellow /= total
        else:
            # Default balanced state
            self.red = self.blue = self.yellow = 1.0/3.0
    
    def sum(self) -> float:
        """Verify AE = C = 1 (should always be 1.0)"""
        return self.red + self.blue + self.yellow
    
    def to_tuple(self) -> Tuple[float, float, float]:
        """Convert to tuple for compatibility"""
        return (self.red, self.blue, self.yellow)
    
    def mutate(self, strength: float = 0.1) -> 'RBYTriplet':
        """Create mutated version with given strength"""
        import random
        new_r = max(0, self.red + random.uniform(-strength, strength))
        new_b = max(0, self.blue + random.uniform(-strength, strength))
        new_y = max(0, self.yellow + random.uniform(-strength, strength))
        return RBYTriplet(new_r, new_b, new_y)

class AETextMapper:
    """Maps text to RBY triplets using simple but consistent rules"""
    
    # Character-to-RBY mappings (simplified from the cosmic table)
    CHAR_MAPPINGS = {
        'a': (0.8, 0.1, 0.1), 'e': (0.7, 0.2, 0.1), 'i': (0.6, 0.3, 0.1),
        'o': (0.5, 0.4, 0.1), 'u': (0.4, 0.5, 0.1),
        'b': (0.1, 0.8, 0.1), 'c': (0.1, 0.7, 0.2), 'd': (0.1, 0.6, 0.3),
        'f': (0.1, 0.5, 0.4), 'g': (0.1, 0.4, 0.5),
        'h': (0.1, 0.1, 0.8), 'j': (0.2, 0.1, 0.7), 'k': (0.3, 0.1, 0.6),
        'l': (0.4, 0.1, 0.5), 'm': (0.5, 0.1, 0.4),
    }
    
    @classmethod
    def map_text_to_rby(cls, text: str) -> RBYTriplet:
        """Map text to RBY triplet using character analysis"""
        if not text:
            return RBYTriplet(1/3, 1/3, 1/3)
        
        total_r = total_b = total_y = 0.0
        char_count = 0
        
        for char in text.lower():
            if char in cls.CHAR_MAPPINGS:
                r, b, y = cls.CHAR_MAPPINGS[char]
                total_r += r
                total_b += b
                total_y += y
                char_count += 1
            else:
                # Default for unmapped characters
                total_r += 0.33
                total_b += 0.33
                total_y += 0.34
                char_count += 1
        
        if char_count == 0:
            return RBYTriplet(1/3, 1/3, 1/3)
        
        avg_r = total_r / char_count
        avg_b = total_b / char_count
        avg_y = total_y / char_count
        
        return RBYTriplet(avg_r, avg_b, avg_y)

class MemoryGlyph:
    """Compressed memory representation with RBY encoding"""
    
    def __init__(self, content: str, rby: RBYTriplet, usage_count: int = 1):
        self.original_content = content
        self.rby = rby
        self.usage_count = usage_count
        self.glyph_symbol = self._compress_to_symbol(content)
        self.created_at = time.time()
    
    def _compress_to_symbol(self, content: str) -> str:
        """Compress content to a representative symbol"""
        if len(content) <= 3:
            return content
        
        # Simple compression: first + middle + last character
        if len(content) >= 3:
            return f"{content[0]}{content[len(content)//2]}{content[-1]}"
        return content
    
    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary"""
        return {
            'glyph_symbol': self.glyph_symbol,
            'rby': self.rby.to_tuple(),
            'usage_count': self.usage_count,
            'content_length': len(self.original_content),
            'created_at': self.created_at
        }

class AEProcessor:
    """Main processor for AE computations without the cosmic bloat"""
    
    def __init__(self, initial_rby: Optional[RBYTriplet] = None):
        self.current_state = initial_rby or RBYTriplet(0.33, 0.33, 0.34)
        self.memory_glyphs: List[MemoryGlyph] = []
        self.processing_history: List[Dict] = []
        
    def process_text(self, text: str, context: str = "general") -> Dict[str, Any]:
        """Process text and update internal state"""
        logger.info(f"Processing text: {text[:50]}...")
        
        # Map text to RBY
        text_rby = AETextMapper.map_text_to_rby(text)
        
        # Update current state (simple weighted average)
        weight = 0.1  # How much new text influences state
        new_r = (1 - weight) * self.current_state.red + weight * text_rby.red
        new_b = (1 - weight) * self.current_state.blue + weight * text_rby.blue
        new_y = (1 - weight) * self.current_state.yellow + weight * text_rby.yellow
        
        self.current_state = RBYTriplet(new_r, new_b, new_y)
        
        # Create memory glyph
        glyph = MemoryGlyph(text, text_rby)
        self.memory_glyphs.append(glyph)
        
        # Record processing step
        result = {
            'text_rby': text_rby.to_tuple(),
            'new_state': self.current_state.to_tuple(),
            'glyph': glyph.to_dict(),
            'context': context,
            'ae_compliance': abs(1.0 - self.current_state.sum()),  # Should be near 0
            'timestamp': time.time()
        }
        
        self.processing_history.append(result)
        logger.info(f"AE compliance: {result['ae_compliance']:.6f}")
        
        return result
    
    def get_compressed_state(self) -> Dict[str, Any]:
        """Get compressed representation of current state"""
        if not self.memory_glyphs:
            return {'state': 'empty', 'glyph_count': 0}
        
        # Aggregate glyph statistics
        total_usage = sum(g.usage_count for g in self.memory_glyphs)
        avg_rby = [
            sum(g.rby.red for g in self.memory_glyphs) / len(self.memory_glyphs),
            sum(g.rby.blue for g in self.memory_glyphs) / len(self.memory_glyphs),
            sum(g.rby.yellow for g in self.memory_glyphs) / len(self.memory_glyphs)
        ]
        
        return {
            'current_state': self.current_state.to_tuple(),
            'glyph_count': len(self.memory_glyphs),
            'total_usage': total_usage,
            'average_rby': avg_rby,
            'ae_compliance': abs(1.0 - self.current_state.sum()),
            'processing_steps': len(self.processing_history)
        }
    
    def export_state(self) -> str:
        """Export state as JSON for persistence"""
        export_data = {
            'current_state': self.current_state.to_tuple(),
            'memory_glyphs': [g.to_dict() for g in self.memory_glyphs],
            'processing_history': self.processing_history,
            'export_timestamp': time.time()
        }
        return json.dumps(export_data, indent=2)

def run_ae_demo():
    """Demonstrate clean AE processing"""
    print("AE Core - Clean Implementation Demo")
    print("=" * 50)
    
    processor = AEProcessor()
    
    # Test texts
    test_texts = [
        "Hello world, this is a test of perception",
        "Mathematical cognition requires blue thinking", 
        "Execute yellow action commands now",
        "Balance all three aspects for consciousness"
    ]
    
    for i, text in enumerate(test_texts):
        result = processor.process_text(text, f"test_{i}")
        print(f"\nProcessed: {text}")
        print(f"Text RBY: {result['text_rby']}")
        print(f"New State: {result['new_state']}")
        print(f"AE Compliance: {result['ae_compliance']:.6f}")
    
    # Show compressed state
    print(f"\nFinal Compressed State:")
    final_state = processor.get_compressed_state()
    for key, value in final_state.items():
        print(f"{key}: {value}")
    
    print(f"\nExport available via processor.export_state()")

if __name__ == "__main__":
    run_ae_demo()
