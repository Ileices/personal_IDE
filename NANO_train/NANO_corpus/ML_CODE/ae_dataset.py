"""
AE Dataset Processing - Apply AE principles to LLM training data
Processes datasets with RBY cognitive analysis and AE compliance
"""
import logging
import os
import json
import time
from typing import Dict, List, Tuple, Any, Optional, Iterator
from pathlib import Path
from ae_core import RBYTriplet, AEProcessor
from ae_tokenizer import AETokenizer

logger = logging.getLogger(__name__)

class AEDatasetProcessor:
    """
    Processes training datasets with AE cognitive analysis
    Ensures AE = C = 1 compliance across training data
    """
    
    def __init__(self, output_dir: str = "ae_processed_data"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        
        self.ae_processor = AEProcessor()
        self.tokenizer = AETokenizer(vocab_size=50000)
        
        # Processing statistics
        self.stats = {
            'total_documents': 0,
            'total_tokens': 0,
            'cognitive_distribution': {'red': 0.0, 'blue': 0.0, 'yellow': 0.0},
            'ae_compliance_scores': [],
            'processing_time': 0.0
        }
        
        # Quality filters
        self.min_document_length = 50    # Min tokens per document
        self.max_document_length = 2048  # Max tokens per document
        self.min_cognitive_diversity = 0.1  # Min RBY variance required
        
    def process_text_document(self, text: str, doc_id: str) -> Optional[Dict[str, Any]]:
        """Process a single text document with AE analysis"""
        if not text or len(text.strip()) < 10:
            return None
        
        # Tokenize
        token_ids = self.tokenizer.encode(text)
        
        # Apply length filters
        if len(token_ids) < self.min_document_length or len(token_ids) > self.max_document_length:
            return None
        
        # Get RBY matrix for the document
        rby_matrix = self.tokenizer.get_sequence_rby_matrix(token_ids)
        
        # Compute document-level cognitive statistics
        if not rby_matrix:
            return None
        
        avg_red = sum(rby[0] for rby in rby_matrix) / len(rby_matrix)
        avg_blue = sum(rby[1] for rby in rby_matrix) / len(rby_matrix)
        avg_yellow = sum(rby[2] for rby in rby_matrix) / len(rby_matrix)
        
        doc_rby = RBYTriplet(avg_red, avg_blue, avg_yellow)
        
        # Check cognitive diversity
        rby_variance = max(doc_rby.to_tuple()) - min(doc_rby.to_tuple())
        if rby_variance < self.min_cognitive_diversity:
            return None  # Skip cognitively homogeneous documents
        
        # Process with AE core
        ae_result = self.ae_processor.process_text(text, context=f"doc_{doc_id}")
        
        # Create processed document
        processed_doc = {
            'doc_id': doc_id,
            'original_text': text,
            'token_ids': token_ids,
            'rby_matrix': rby_matrix,
            'document_rby': doc_rby.to_tuple(),
            'cognitive_diversity': rby_variance,
            'ae_compliance': ae_result['ae_compliance'],
            'token_count': len(token_ids),
            'processing_timestamp': time.time()
        }
        
        # Update statistics
        self.stats['total_documents'] += 1
        self.stats['total_tokens'] += len(token_ids)
        self.stats['cognitive_distribution']['red'] += avg_red
        self.stats['cognitive_distribution']['blue'] += avg_blue
        self.stats['cognitive_distribution']['yellow'] += avg_yellow
        self.stats['ae_compliance_scores'].append(ae_result['ae_compliance'])
        
        return processed_doc
    
    def process_dataset_files(self, input_files: List[str], batch_size: int = 100) -> Iterator[List[Dict]]:
        """Process multiple dataset files in batches"""
        start_time = time.time()
        batch = []
        doc_counter = 0
        
        for file_path in input_files:
            logger.info(f"Processing file: {file_path}")
            
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    # Assume each line is a document (common format)
                    for line_num, line in enumerate(f):
                        line = line.strip()
                        if not line:
                            continue
                        
                        doc_id = f"{Path(file_path).stem}_{line_num}"
                        processed_doc = self.process_text_document(line, doc_id)
                        
                        if processed_doc:
                            batch.append(processed_doc)
                            doc_counter += 1
                            
                            if len(batch) >= batch_size:
                                yield batch
                                batch = []
                        
                        # Progress logging
                        if doc_counter % 1000 == 0:
                            logger.info(f"Processed {doc_counter} documents")
            
            except Exception as e:
                logger.error(f"Error processing {file_path}: {e}")
                continue
        
        # Yield remaining batch
        if batch:
            yield batch
        
        self.stats['processing_time'] = time.time() - start_time
        logger.info(f"Dataset processing completed in {self.stats['processing_time']:.2f} seconds")
    
    def save_processed_batch(self, batch: List[Dict], batch_num: int):
        """Save a processed batch to disk"""
        batch_file = self.output_dir / f"ae_batch_{batch_num:06d}.jsonl"
        
        with open(batch_file, 'w', encoding='utf-8') as f:
            for doc in batch:
                f.write(json.dumps(doc) + '\n')
        
        logger.debug(f"Saved batch {batch_num} to {batch_file}")
    
    def create_training_splits(self, train_ratio: float = 0.8, val_ratio: float = 0.1):
        """Create train/validation/test splits from processed data"""
        # Collect all processed files
        batch_files = list(self.output_dir.glob("ae_batch_*.jsonl"))
        
        if not batch_files:
            logger.warning("No processed batches found")
            return
        
        # Load all documents
        all_docs = []
        for batch_file in batch_files:
            with open(batch_file, 'r', encoding='utf-8') as f:
                for line in f:
                    all_docs.append(json.loads(line))
        
        # Shuffle and split
        import random
        random.shuffle(all_docs)
        
        total_docs = len(all_docs)
        train_end = int(total_docs * train_ratio)
        val_end = train_end + int(total_docs * val_ratio)
        
        train_docs = all_docs[:train_end]
        val_docs = all_docs[train_end:val_end]
        test_docs = all_docs[val_end:]
        
        # Save splits
        splits = [
            ('train', train_docs),
            ('validation', val_docs),
            ('test', test_docs)
        ]
        
        for split_name, docs in splits:
            split_file = self.output_dir / f"ae_{split_name}.jsonl"
            with open(split_file, 'w', encoding='utf-8') as f:
                for doc in docs:
                    f.write(json.dumps(doc) + '\n')
            
            logger.info(f"Created {split_name} split: {len(docs)} documents -> {split_file}")
    
    def generate_processing_report(self) -> Dict[str, Any]:
        """Generate comprehensive processing report"""
        if self.stats['total_documents'] == 0:
            return {'status': 'no_documents_processed'}
        
        # Compute averages
        avg_cognitive_dist = {
            'red': self.stats['cognitive_distribution']['red'] / self.stats['total_documents'],
            'blue': self.stats['cognitive_distribution']['blue'] / self.stats['total_documents'],
            'yellow': self.stats['cognitive_distribution']['yellow'] / self.stats['total_documents']
        }
        
        avg_ae_compliance = sum(self.stats['ae_compliance_scores']) / len(self.stats['ae_compliance_scores'])
        
        # Vocabulary analysis
        vocab_analysis = self.tokenizer.analyze_vocabulary_distribution()
        
        report = {
            'processing_summary': {
                'total_documents': self.stats['total_documents'],
                'total_tokens': self.stats['total_tokens'],
                'avg_tokens_per_doc': self.stats['total_tokens'] / self.stats['total_documents'],
                'processing_time_seconds': self.stats['processing_time']
            },
            'cognitive_analysis': {
                'average_rby_distribution': avg_cognitive_dist,
                'ae_compliance': {
                    'average': avg_ae_compliance,
                    'min': min(self.stats['ae_compliance_scores']),
                    'max': max(self.stats['ae_compliance_scores'])
                }
            },
            'vocabulary_analysis': vocab_analysis,
            'quality_metrics': {
                'documents_processed': self.stats['total_documents'],
                'cognitive_diversity_threshold': self.min_cognitive_diversity,
                'length_constraints': {
                    'min_tokens': self.min_document_length,
                    'max_tokens': self.max_document_length
                }
            }
        }
        
        return report
    
    def save_processing_report(self):
        """Save processing report to disk"""
        report = self.generate_processing_report()
        report_file = self.output_dir / "ae_processing_report.json"
        
        with open(report_file, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2)
        
        # Also save tokenizer vocabulary
        vocab_file = self.output_dir / "ae_vocabulary.json"
        self.tokenizer.save_vocabulary(str(vocab_file))
        
        logger.info(f"Processing report saved to: {report_file}")
        logger.info(f"Vocabulary saved to: {vocab_file}")

def demo_dataset_processing():
    """Demonstrate AE dataset processing"""
    print("AE Dataset Processing Demo")
    print("=" * 50)
    
    # Create sample dataset
    sample_data = [
        "The quick brown fox jumps over the lazy dog in the forest.",
        "Mathematical reasoning requires systematic analysis of complex problems.",
        "Execute the following commands to process the data efficiently.",
        "Perception involves gathering information from multiple sensory channels.",
        "Cognitive patterns emerge from the interaction of neural networks.",
        "Action-oriented thinking leads to practical problem-solving approaches.",
        "Understanding consciousness requires integrating perception, cognition, and execution.",
        "Machine learning models process patterns in high-dimensional data spaces.",
        "Natural language processing combines linguistic knowledge with statistical methods.",
        "Artificial intelligence systems demonstrate emergent cognitive capabilities."
    ]
    
    # Create temporary dataset file
    dataset_file = "sample_dataset.txt"
    with open(dataset_file, 'w', encoding='utf-8') as f:
        for text in sample_data:
            f.write(text + '\n')
    
    # Process dataset
    processor = AEDatasetProcessor(output_dir="demo_ae_data")
    
    print(f"Processing {len(sample_data)} sample documents...")
    
    batch_num = 0
    for batch in processor.process_dataset_files([dataset_file], batch_size=5):
        processor.save_processed_batch(batch, batch_num)
        print(f"Processed batch {batch_num}: {len(batch)} documents")
        batch_num += 1
    
    # Create splits
    processor.create_training_splits(train_ratio=0.7, val_ratio=0.2)
    
    # Generate report
    processor.save_processing_report()
    report = processor.generate_processing_report()
    
    print(f"\nProcessing Results:")
    print(f"Total documents: {report['processing_summary']['total_documents']}")
    print(f"Total tokens: {report['processing_summary']['total_tokens']}")
    print(f"Average AE compliance: {report['cognitive_analysis']['ae_compliance']['average']:.6f}")
    print(f"RBY distribution: {report['cognitive_analysis']['average_rby_distribution']}")
    print(f"Vocabulary size: {report['vocabulary_analysis']['vocab_size']}")
    
    # Cleanup
    os.remove(dataset_file)
    print(f"\nProcessed data saved to: demo_ae_data/")

if __name__ == "__main__":
    demo_dataset_processing()
