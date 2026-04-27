# File copied by Ultimate Auto-Rebuilder Script Gatherer
# Original: C:\Users\lokee\Documents\FirstBorne\Stage\porting\Egg_Ileices\Egg_Ileices\enhanced_lineage_check.py
# Copy Date: 2025-06-13 02:25:32
# Original Size: 1470 bytes

from lineage_verification import LineageVerifier
import os

def enhanced_verification():
    verifier = LineageVerifier("/c:/Users/lokee/Documents/AIOS IO/Primary Organism/tests/")
    results = verifier.scan_files()
    
    # Track files needing attention
    unconnected = []
    potentially_isolated = []
    
    for filepath, lineage in results.items():
        filename = os.path.basename(filepath)
        if lineage is None:
            unconnected.append(filename)
        elif not _verify_integration(filepath, lineage):
            potentially_isolated.append(filename)
            
    print("=== AIOS IO Integration Analysis ===")
    print("\nFiles Missing Lineage Declaration:")
    for file in sorted(unconnected):
        print(f"❌ {file}")
        
    print("\nFiles Potentially Isolated:")
    for file in sorted(potentially_isolated):
        print(f"⚠️ {file}")
        
def _verify_integration(filepath: str, lineage: str) -> bool:
    """Verify if file has proper integration points"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read().lower()
            # Check for import statements or references to other scripts
            has_imports = 'import' in content
            has_references = 'ileices' in content
            return has_imports or has_references
    except:
        return False

if __name__ == "__main__":
    enhanced_verification()
