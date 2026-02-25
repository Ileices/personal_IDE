"""
AE File Scanner - Clean implementation of directory processing
Processes files using AE mathematics without metaphysical baggage
"""
import os
import logging
from pathlib import Path
from typing import Dict, List, Any, Optional
import time
from ae_core import AEProcessor, RBYTriplet

logger = logging.getLogger(__name__)

class FileProcessor:
    """Processes files using AE core without cosmic nonsense"""
    
    def __init__(self, base_path: str):
        self.base_path = Path(base_path)
        self.processor = AEProcessor()
        self.processed_files: List[Dict] = []
        self.file_extensions = {'.py', '.txt', '.md', '.json', '.yaml', '.yml'}
        
    def scan_directory(self, recursive: bool = True) -> Dict[str, Any]:
        """Scan directory and process all relevant files"""
        logger.info(f"Scanning directory: {self.base_path}")
        
        if not self.base_path.exists():
            logger.error(f"Directory does not exist: {self.base_path}")
            return {'error': 'Directory not found'}
        
        files_found = []
        if recursive:
            for file_path in self.base_path.rglob('*'):
                if file_path.is_file() and file_path.suffix in self.file_extensions:
                    files_found.append(file_path)
        else:
            for file_path in self.base_path.iterdir():
                if file_path.is_file() and file_path.suffix in self.file_extensions:
                    files_found.append(file_path)
        
        logger.info(f"Found {len(files_found)} files to process")
        
        # Process each file
        results = []
        for file_path in files_found:
            try:
                result = self.process_file(file_path)
                results.append(result)
                self.processed_files.append(result)
            except Exception as e:
                logger.error(f"Error processing {file_path}: {e}")
                results.append({
                    'file_path': str(file_path),
                    'error': str(e),
                    'status': 'failed'
                })
        
        return {
            'total_files': len(files_found),
            'processed_successfully': len([r for r in results if 'error' not in r]),
            'failed_files': len([r for r in results if 'error' in r]),
            'results': results,
            'final_state': self.processor.get_compressed_state()
        }
    
    def process_file(self, file_path: Path) -> Dict[str, Any]:
        """Process a single file"""
        logger.debug(f"Processing file: {file_path}")
        
        try:
            # Read file content
            content = file_path.read_text(encoding='utf-8', errors='ignore')
            
            # Process with AE core
            process_result = self.processor.process_text(
                content, 
                context=str(file_path.relative_to(self.base_path))
            )
            
            return {
                'file_path': str(file_path),
                'file_size': len(content),
                'file_type': file_path.suffix,
                'relative_path': str(file_path.relative_to(self.base_path)),
                'text_rby': process_result['text_rby'],
                'glyph_symbol': process_result['glyph']['glyph_symbol'],
                'ae_compliance': process_result['ae_compliance'],
                'status': 'success',
                'processed_at': time.time()
            }
            
        except Exception as e:
            return {
                'file_path': str(file_path),
                'error': str(e),
                'status': 'failed'
            }
    
    def get_summary_report(self) -> Dict[str, Any]:
        """Generate summary report of processing"""
        if not self.processed_files:
            return {'status': 'no_files_processed'}
        
        successful_files = [f for f in self.processed_files if f['status'] == 'success']
        
        if not successful_files:
            return {'status': 'no_successful_files'}
        
        # Calculate aggregate statistics
        total_size = sum(f['file_size'] for f in successful_files)
        avg_rby = [
            sum(f['text_rby'][0] for f in successful_files) / len(successful_files),
            sum(f['text_rby'][1] for f in successful_files) / len(successful_files),
            sum(f['text_rby'][2] for f in successful_files) / len(successful_files)
        ]
        avg_compliance = sum(f['ae_compliance'] for f in successful_files) / len(successful_files)
        
        # File type distribution
        file_types = {}
        for f in successful_files:
            ft = f['file_type']
            file_types[ft] = file_types.get(ft, 0) + 1
        
        return {
            'total_files_processed': len(successful_files),
            'total_content_size': total_size,
            'average_rby': avg_rby,
            'average_ae_compliance': avg_compliance,
            'file_type_distribution': file_types,
            'final_processor_state': self.processor.get_compressed_state(),
            'processing_quality': 'excellent' if avg_compliance < 1e-6 else 'good' if avg_compliance < 1e-3 else 'needs_improvement'
        }
    
    def save_results(self, output_path: str):
        """Save processing results to file"""
        output_data = {
            'scan_results': {
                'base_path': str(self.base_path),
                'processed_files': self.processed_files,
                'summary': self.get_summary_report()
            },
            'processor_export': self.processor.export_state()
        }
        
        import json
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2)
        
        logger.info(f"Results saved to: {output_path}")

def run_file_scanner_demo():
    """Demo the file scanner on the current directory"""
    print("AE File Scanner Demo")
    print("=" * 40)
    
    # Scan current directory
    current_dir = os.path.dirname(__file__)
    scanner = FileProcessor(current_dir)
    
    print(f"Scanning: {current_dir}")
    results = scanner.scan_directory(recursive=False)
    
    print(f"\nScan Results:")
    print(f"Total files: {results['total_files']}")
    print(f"Processed successfully: {results['processed_successfully']}")
    print(f"Failed files: {results['failed_files']}")
    
    if results['processed_successfully'] > 0:
        print(f"\nFinal AE State:")
        final_state = results['final_state']
        for key, value in final_state.items():
            print(f"  {key}: {value}")
        
        print(f"\nSummary Report:")
        summary = scanner.get_summary_report()
        for key, value in summary.items():
            if key != 'final_processor_state':  # Already shown above
                print(f"  {key}: {value}")
    
    # Save results
    output_file = "ae_scan_results.json"
    scanner.save_results(output_file)
    print(f"\nDetailed results saved to: {output_file}")

if __name__ == "__main__":
    run_file_scanner_demo()
