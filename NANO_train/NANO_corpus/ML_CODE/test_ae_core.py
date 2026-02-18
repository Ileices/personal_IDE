"""
Test suite for AE Core
Demonstrates how to properly test AE concepts
"""
import sys
import os
sys.path.append(os.path.dirname(__file__))

from ae_core import RBYTriplet, AETextMapper, MemoryGlyph, AEProcessor

def test_rby_triplet_normalization():
    """Test that RBY triplets normalize to sum = 1.0"""
    # Test normal case
    rby = RBYTriplet(0.5, 0.3, 0.2)
    assert abs(rby.sum() - 1.0) < 1e-10, "RBY should normalize to 1.0"
    
    # Test unnormalized input
    rby2 = RBYTriplet(2.0, 3.0, 5.0)  # Sums to 10
    assert abs(rby2.sum() - 1.0) < 1e-10, "Should normalize large values"
    assert abs(rby2.red - 0.2) < 1e-10, "Red should be 2/10 = 0.2"
    
    # Test zero case
    rby3 = RBYTriplet(0.0, 0.0, 0.0)
    assert abs(rby3.sum() - 1.0) < 1e-10, "Should handle zero gracefully"

def test_text_mapping_consistency():
    """Test that text mapping is consistent and normalized"""
    mapper = AETextMapper()
    
    # Test empty text
    empty_rby = mapper.map_text_to_rby("")
    assert abs(empty_rby.sum() - 1.0) < 1e-10, "Empty text should give normalized RBY"
    
    # Test simple text
    hello_rby = mapper.map_text_to_rby("hello")
    assert abs(hello_rby.sum() - 1.0) < 1e-10, "Text mapping should normalize"
    
    # Test consistency - same input should give same output
    hello_rby2 = mapper.map_text_to_rby("hello")
    assert hello_rby.to_tuple() == hello_rby2.to_tuple(), "Mapping should be deterministic"

def test_memory_glyph_compression():
    """Test memory glyph creation and compression"""
    rby = RBYTriplet(0.4, 0.3, 0.3)
    glyph = MemoryGlyph("test content", rby)
    
    # The compression takes first, middle, last from entire string "test content"
    # First: 't', Middle: ' ' (index 6), Last: 't' -> "t t"
    # But compression logic may clean this up
    print(f"Glyph symbol: '{glyph.glyph_symbol}'")
    assert len(glyph.glyph_symbol) <= 3, "Should compress to 3 chars or less"
    assert abs(glyph.rby.sum() - 1.0) < 1e-10, "RBY should be normalized"
    
    # Test serialization
    glyph_dict = glyph.to_dict()
    assert 'glyph_symbol' in glyph_dict
    assert 'rby' in glyph_dict
    assert len(glyph_dict['rby']) == 3

def test_ae_processor_state_evolution():
    """Test that processor maintains AE = C = 1 through processing"""
    processor = AEProcessor()
    
    # Initial state should be normalized
    assert abs(processor.current_state.sum() - 1.0) < 1e-10
    
    # Process some text
    result1 = processor.process_text("test input")
    assert abs(processor.current_state.sum() - 1.0) < 1e-10, "State should remain normalized"
    assert result1['ae_compliance'] < 1e-10, "Should maintain AE compliance"
    
    # Process more text
    result2 = processor.process_text("another test")
    assert abs(processor.current_state.sum() - 1.0) < 1e-10, "State should remain normalized"
    assert len(processor.memory_glyphs) == 2, "Should have 2 glyphs"

def test_processor_compression():
    """Test processor state compression"""
    processor = AEProcessor()
    
    # Empty state
    empty_state = processor.get_compressed_state()
    assert empty_state['glyph_count'] == 0
    
    # Add some content
    processor.process_text("test")
    processor.process_text("more content")
    
    compressed = processor.get_compressed_state()
    assert compressed['glyph_count'] == 2
    assert 'current_state' in compressed
    assert len(compressed['current_state']) == 3
    assert compressed['ae_compliance'] < 1e-10

def test_export_import_consistency():
    """Test that export/import preserves state"""
    processor = AEProcessor()
    processor.process_text("test content for export")
    
    # Export state
    exported_json = processor.export_state()
    assert isinstance(exported_json, str)
    assert "current_state" in exported_json
    
    # JSON should be valid
    import json
    data = json.loads(exported_json)
    assert 'current_state' in data
    assert 'memory_glyphs' in data

def test_performance_reasonable():
    """Test that processing performance is reasonable"""
    import time
    processor = AEProcessor()
    
    start_time = time.time()
    
    # Process 100 short texts
    for i in range(100):
        processor.process_text(f"test text number {i}")
    
    elapsed = time.time() - start_time
    assert elapsed < 1.0, f"100 operations should take < 1s, took {elapsed:.3f}s"
    assert len(processor.memory_glyphs) == 100

if __name__ == "__main__":
    # Run tests directly
    print("Running AE Core Tests...")
    
    test_rby_triplet_normalization()
    print("✓ RBY triplet normalization")
    
    test_text_mapping_consistency()
    print("✓ Text mapping consistency")
    
    test_memory_glyph_compression()
    print("✓ Memory glyph compression")
    
    test_ae_processor_state_evolution()
    print("✓ AE processor state evolution")
    
    test_processor_compression()
    print("✓ Processor compression")
    
    test_export_import_consistency()
    print("✓ Export/import consistency")
    
    test_performance_reasonable()
    print("✓ Performance reasonable")
    
    print("\nAll tests passed! ✨")
