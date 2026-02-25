"""
Dataset Ingestion Layer for ATTACK Framework
Handles 1GB wiki shard processing, RBY codon tagging, and entropy validation
Production-ready with comprehensive error handling and performance monitoring
"""

import os
import json
import hashlib
import mmap
import threading
import time
import gzip
import sqlite3
from typing import Dict, List, Tuple, Any, Optional, Iterator, Generator
from dataclasses import dataclass, field
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import numpy as np
import torch
from collections import defaultdict, deque
import logging
import psutil
import warnings
from xml.etree import ElementTree as ET
import regex as re
from urllib.parse import urlparse
import tempfile
import shutil
import pickle

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class WikiShard:
    """Represents a processed Wikipedia shard with RBY encoding"""
    shard_id: str
    size_bytes: int
    article_count: int
    rby_histogram: Dict[str, int] = field(default_factory=dict)
    entropy_score: float = 0.0
    homeostasis_tension: float = 0.0
    processing_time_ms: float = 0.0
    checksum: str = ""
    
    def __post_init__(self):
        if not self.checksum:
            self.checksum = self._calculate_checksum()
    
    def _calculate_checksum(self) -> str:
        """Calculate SHA256 checksum for integrity verification"""
        content = f"{self.shard_id}{self.size_bytes}{self.article_count}"
        return hashlib.sha256(content.encode()).hexdigest()[:16]


@dataclass
class RBYCodon:
    """RBY codon with linguistic and semantic properties"""
    sequence: str  # 3-character RBY sequence like "RBY", "BBR", etc.
    frequency: int
    semantic_weight: float
    context_vector: np.ndarray = field(default_factory=lambda: np.zeros(64))
    linguistic_category: str = "unknown"  # verb, noun, adjective, etc.
    
    def __post_init__(self):
        if self.sequence:
            self._validate_sequence()
            self._calculate_semantic_weight()
    
    def _validate_sequence(self):
        """Ensure sequence contains only R, B, Y characters"""
        if not re.match(r'^[RBY]{3}$', self.sequence):
            raise ValueError(f"Invalid RBY codon sequence: {self.sequence}")
    
    def _calculate_semantic_weight(self):
        """Calculate semantic weight based on RBY balance"""
        r_count = self.sequence.count('R')
        b_count = self.sequence.count('B')
        y_count = self.sequence.count('Y')
        
        # Balanced sequences have higher semantic weight
        balance = 1.0 - abs(r_count - b_count) / 3.0 - abs(b_count - y_count) / 3.0
        self.semantic_weight = max(0.1, balance)


class EntropyAnalyzer:
    """Calculates information entropy and homeostasis tension for text data"""
    
    def __init__(self):
        self.rby_mapping = {
            # Vowels -> Yellow (consciousness/integration)
            'a': 'Y', 'e': 'Y', 'i': 'Y', 'o': 'Y', 'u': 'Y',
            # Consonants -> Red (action/change) or Blue (structure/logic)
            'b': 'B', 'c': 'B', 'd': 'R', 'f': 'B', 'g': 'R',
            'h': 'B', 'j': 'R', 'k': 'B', 'l': 'R', 'm': 'B',
            'n': 'R', 'p': 'B', 'q': 'B', 'r': 'R', 's': 'B',
            't': 'R', 'v': 'R', 'w': 'R', 'x': 'B', 'y': 'Y', 'z': 'R'
        }
    
    def text_to_rby(self, text: str) -> str:
        """Convert text to RBY sequence"""
        return ''.join(self.rby_mapping.get(c.lower(), '') for c in text if c.isalpha())
    
    def calculate_entropy(self, text: str) -> float:
        """Calculate Shannon entropy of text"""
        if not text:
            return 0.0
        
        # Calculate character frequencies
        char_counts = defaultdict(int)
        for char in text:
            char_counts[char] += 1
        
        # Calculate entropy
        total_chars = len(text)
        entropy = 0.0
        for count in char_counts.values():
            if count > 0:
                prob = count / total_chars
                entropy -= prob * np.log2(prob)
        
        return entropy
    
    def calculate_homeostasis_tension(self, rby_sequence: str) -> float:
        """Calculate homeostasis tension based on RBY balance"""
        if not rby_sequence:
            return 1.0
        
        r_count = rby_sequence.count('R')
        b_count = rby_sequence.count('B')
        y_count = rby_sequence.count('Y')
        total = len(rby_sequence)
        
        if total == 0:
            return 1.0
        
        # Ideal balance is 1/3 each
        ideal_ratio = 1/3
        r_ratio = r_count / total
        b_ratio = b_count / total
        y_ratio = y_count / total
        
        # Calculate deviation from ideal balance
        tension = (
            abs(r_ratio - ideal_ratio) +
            abs(b_ratio - ideal_ratio) +
            abs(y_ratio - ideal_ratio)
        ) / 2.0  # Normalize to [0, 1]
        
        return min(tension, 1.0)


class WikiShardProcessor:
    """Processes Wikipedia XML dumps into RBY-encoded shards"""
    
    def __init__(self, max_workers: int = 4, chunk_size_mb: int = 100):
        self.max_workers = max_workers
        self.chunk_size_mb = chunk_size_mb
        self.entropy_analyzer = EntropyAnalyzer()
        self.processing_stats = {
            'total_articles': 0,
            'total_bytes': 0,
            'processing_time': 0.0,
            'error_count': 0
        }
        self._setup_database()
    
    def _setup_database(self):
        """Initialize SQLite database for metadata storage"""
        self.db_path = "wiki_shard_metadata.db"
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS shards (
                    shard_id TEXT PRIMARY KEY,
                    size_bytes INTEGER,
                    article_count INTEGER,
                    entropy_score REAL,
                    homeostasis_tension REAL,
                    processing_time_ms REAL,
                    checksum TEXT,
                    rby_histogram TEXT
                )
            """)
            
            conn.execute("""
                CREATE TABLE IF NOT EXISTS codons (
                    sequence TEXT PRIMARY KEY,
                    frequency INTEGER,
                    semantic_weight REAL,
                    linguistic_category TEXT
                )
            """)
    
    def process_wiki_dump(self, dump_path: str, output_dir: str) -> List[WikiShard]:
        """Process Wikipedia XML dump into RBY shards"""
        start_time = time.time()
        output_path = Path(output_dir)
        output_path.mkdir(exist_ok=True)
        
        logger.info(f"Processing Wikipedia dump: {dump_path}")
        
        # Check if file is compressed
        is_compressed = dump_path.endswith('.gz') or dump_path.endswith('.bz2')
        
        try:
            shards = []
            
            if is_compressed and dump_path.endswith('.gz'):
                with gzip.open(dump_path, 'rt', encoding='utf-8') as f:
                    shards = self._process_xml_stream(f, output_path)
            else:
                with open(dump_path, 'r', encoding='utf-8') as f:
                    shards = self._process_xml_stream(f, output_path)
            
            processing_time = time.time() - start_time
            self.processing_stats['processing_time'] = processing_time
            
            logger.info(f"Processed {len(shards)} shards in {processing_time:.2f}s")
            return shards
            
        except Exception as e:
            logger.error(f"Error processing wiki dump: {e}")
            self.processing_stats['error_count'] += 1
            return []
    
    def _process_xml_stream(self, file_stream, output_path: Path) -> List[WikiShard]:
        """Process XML stream into shards"""
        shards = []
        current_shard_articles = []
        current_shard_size = 0
        shard_count = 0
        
        # Simple XML parsing for wiki dumps
        article_pattern = re.compile(r'<page>(.*?)</page>', re.DOTALL)
        title_pattern = re.compile(r'<title>(.*?)</title>')
        text_pattern = re.compile(r'<text[^>]*>(.*?)</text>', re.DOTALL)
        
        chunk_size = self.chunk_size_mb * 1024 * 1024
        buffer = ""
        
        for line in file_stream:
            buffer += line
            
            # Process complete articles
            while '<page>' in buffer and '</page>' in buffer:
                start_idx = buffer.find('<page>')
                end_idx = buffer.find('</page>') + 7
                
                if start_idx != -1 and end_idx > start_idx:
                    article_xml = buffer[start_idx:end_idx]
                    buffer = buffer[end_idx:]
                    
                    # Extract article data
                    title_match = title_pattern.search(article_xml)
                    text_match = text_pattern.search(article_xml)
                    
                    if title_match and text_match:
                        title = title_match.group(1)
                        text = text_match.group(1)
                        
                        # Clean wiki markup (basic)
                        text = re.sub(r'\{\{[^}]*\}\}', '', text)  # Remove templates
                        text = re.sub(r'\[\[[^\]]*\]\]', '', text)  # Remove links
                        text = re.sub(r'<[^>]*>', '', text)  # Remove HTML tags
                        
                        article_data = {
                            'title': title,
                            'text': text,
                            'size': len(text.encode('utf-8'))
                        }
                        
                        current_shard_articles.append(article_data)
                        current_shard_size += article_data['size']
                        
                        # Check if shard is ready
                        if current_shard_size >= chunk_size:
                            shard = self._create_shard(current_shard_articles, shard_count, output_path)
                            if shard:
                                shards.append(shard)
                            
                            current_shard_articles = []
                            current_shard_size = 0
                            shard_count += 1
        
        # Process remaining articles
        if current_shard_articles:
            shard = self._create_shard(current_shard_articles, shard_count, output_path)
            if shard:
                shards.append(shard)
        
        return shards
    
    def _create_shard(self, articles: List[Dict], shard_id: int, output_path: Path) -> Optional[WikiShard]:
        """Create a processed shard from articles"""
        if not articles:
            return None
        
        start_time = time.time()
        shard_name = f"shard_{shard_id:06d}"
        
        # Combine all article text
        combined_text = '\n'.join(article['text'] for article in articles)
        total_size = sum(article['size'] for article in articles)
        
        # Convert to RBY and analyze
        rby_sequence = self.entropy_analyzer.text_to_rby(combined_text)
        entropy_score = self.entropy_analyzer.calculate_entropy(combined_text)
        homeostasis_tension = self.entropy_analyzer.calculate_homeostasis_tension(rby_sequence)
        
        # Generate RBY codon histogram
        rby_histogram = self._generate_codon_histogram(rby_sequence)
        
        # Save shard data
        shard_file = output_path / f"{shard_name}.json"
        shard_data = {
            'shard_id': shard_name,
            'articles': articles,
            'rby_sequence': rby_sequence,
            'entropy_score': entropy_score,
            'homeostasis_tension': homeostasis_tension,
            'rby_histogram': rby_histogram
        }
        
        with open(shard_file, 'w', encoding='utf-8') as f:
            json.dump(shard_data, f, ensure_ascii=False, indent=2)
        
        processing_time = (time.time() - start_time) * 1000
        
        # Create shard object
        shard = WikiShard(
            shard_id=shard_name,
            size_bytes=total_size,
            article_count=len(articles),
            rby_histogram=rby_histogram,
            entropy_score=entropy_score,
            homeostasis_tension=homeostasis_tension,
            processing_time_ms=processing_time
        )
        
        # Store in database
        self._store_shard_metadata(shard)
        
        logger.info(f"Created shard {shard_name}: {len(articles)} articles, "
                   f"{total_size/1024/1024:.1f}MB, tension={homeostasis_tension:.3f}")
        
        return shard
    
    def _generate_codon_histogram(self, rby_sequence: str) -> Dict[str, int]:
        """Generate histogram of RBY codons"""
        histogram = defaultdict(int)
        
        # Extract 3-character codons
        for i in range(len(rby_sequence) - 2):
            codon = rby_sequence[i:i+3]
            if len(codon) == 3:
                histogram[codon] += 1
        
        return dict(histogram)
    
    def _store_shard_metadata(self, shard: WikiShard):
        """Store shard metadata in database"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("""
                    INSERT OR REPLACE INTO shards 
                    (shard_id, size_bytes, article_count, entropy_score, 
                     homeostasis_tension, processing_time_ms, checksum, rby_histogram)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    shard.shard_id,
                    shard.size_bytes,
                    shard.article_count,
                    shard.entropy_score,
                    shard.homeostasis_tension,
                    shard.processing_time_ms,
                    shard.checksum,
                    json.dumps(shard.rby_histogram)
                ))
        except Exception as e:
            logger.error(f"Error storing shard metadata: {e}")


class RPSLoader:
    """Entropy-free RPS (Random Pattern Sampling) loader for validation"""
    
    def __init__(self, validation_threshold: float = 0.05):
        self.validation_threshold = validation_threshold
        self.entropy_analyzer = EntropyAnalyzer()
    
    def validate_shard_integrity(self, shard_path: str) -> Dict[str, Any]:
        """Validate shard integrity and homeostasis tension"""
        try:
            with open(shard_path, 'r', encoding='utf-8') as f:
                shard_data = json.load(f)
            
            # Recalculate metrics for validation
            combined_text = '\n'.join(article['text'] for article in shard_data['articles'])
            rby_sequence = self.entropy_analyzer.text_to_rby(combined_text)
            
            calculated_entropy = self.entropy_analyzer.calculate_entropy(combined_text)
            calculated_tension = self.entropy_analyzer.calculate_homeostasis_tension(rby_sequence)
            
            # Compare with stored values
            stored_entropy = shard_data.get('entropy_score', 0.0)
            stored_tension = shard_data.get('homeostasis_tension', 0.0)
            
            entropy_diff = abs(calculated_entropy - stored_entropy)
            tension_diff = abs(calculated_tension - stored_tension)
            
            validation_result = {
                'shard_id': shard_data['shard_id'],
                'integrity_check': 'PASS' if tension_diff <= self.validation_threshold else 'FAIL',
                'homeostasis_tension': calculated_tension,
                'entropy_score': calculated_entropy,
                'tension_deviation': tension_diff,
                'entropy_deviation': entropy_diff,
                'article_count': len(shard_data['articles']),
                'passes_threshold': calculated_tension <= self.validation_threshold
            }
            
            return validation_result
            
        except Exception as e:
            logger.error(f"Error validating shard {shard_path}: {e}")
            return {
                'shard_id': 'unknown',
                'integrity_check': 'ERROR',
                'error': str(e)
            }
    
    def batch_validate_shards(self, shard_directory: str) -> List[Dict[str, Any]]:
        """Validate all shards in a directory"""
        shard_files = list(Path(shard_directory).glob("*.json"))
        results = []
        
        logger.info(f"Validating {len(shard_files)} shards...")
        
        with ThreadPoolExecutor(max_workers=4) as executor:
            future_to_file = {
                executor.submit(self.validate_shard_integrity, str(shard_file)): shard_file
                for shard_file in shard_files
            }
            
            for future in as_completed(future_to_file):
                result = future.result()
                results.append(result)
        
        # Summary statistics
        passed = sum(1 for r in results if r.get('integrity_check') == 'PASS')
        failed = sum(1 for r in results if r.get('integrity_check') == 'FAIL')
        errors = sum(1 for r in results if r.get('integrity_check') == 'ERROR')
        
        logger.info(f"Validation complete: {passed} passed, {failed} failed, {errors} errors")
        
        return results


class DatasetIngestionController:
    """Main controller for dataset ingestion pipeline"""
    
    def __init__(self, output_base_dir: str = "processed_datasets"):
        self.output_base_dir = Path(output_base_dir)
        self.output_base_dir.mkdir(exist_ok=True)
        
        self.processor = WikiShardProcessor()
        self.validator = RPSLoader()
        self.performance_monitor = PerformanceMonitor()
        
    def ingest_wiki_dataset(self, dump_path: str, dataset_name: str) -> Dict[str, Any]:
        """Complete wiki dataset ingestion pipeline"""
        start_time = time.time()
        
        # Create dataset output directory
        dataset_dir = self.output_base_dir / dataset_name
        dataset_dir.mkdir(exist_ok=True)
        
        logger.info(f"Starting ingestion pipeline for {dataset_name}")
        
        # Monitor initial system state
        initial_memory = psutil.virtual_memory()
        initial_disk = psutil.disk_usage(str(dataset_dir))
        
        try:
            # Phase 1: Process wiki dump into shards
            logger.info("Phase 1: Processing wiki dump into shards...")
            shards = self.processor.process_wiki_dump(dump_path, str(dataset_dir))
            
            if not shards:
                raise RuntimeError("No shards were created from wiki dump")
            
            # Phase 2: Validate shard integrity
            logger.info("Phase 2: Validating shard integrity...")
            validation_results = self.validator.batch_validate_shards(str(dataset_dir))
            
            # Phase 3: Generate summary report
            processing_time = time.time() - start_time
            final_memory = psutil.virtual_memory()
            final_disk = psutil.disk_usage(str(dataset_dir))
            
            # Calculate statistics
            total_articles = sum(shard.article_count for shard in shards)
            total_size_mb = sum(shard.size_bytes for shard in shards) / (1024 * 1024)
            avg_homeostasis_tension = np.mean([shard.homeostasis_tension for shard in shards])
            
            passed_validation = sum(1 for r in validation_results if r.get('integrity_check') == 'PASS')
            validation_rate = passed_validation / len(validation_results) if validation_results else 0
            
            report = {
                'dataset_name': dataset_name,
                'processing_time_seconds': processing_time,
                'total_shards': len(shards),
                'total_articles': total_articles,
                'total_size_mb': total_size_mb,
                'avg_homeostasis_tension': avg_homeostasis_tension,
                'validation_pass_rate': validation_rate,
                'memory_usage_delta_mb': (final_memory.used - initial_memory.used) / (1024 * 1024),
                'disk_usage_delta_mb': (final_disk.used - initial_disk.used) / (1024 * 1024),
                'performance_metrics': self.performance_monitor.get_metrics(),
                'shards': [
                    {
                        'shard_id': shard.shard_id,
                        'size_bytes': shard.size_bytes,
                        'article_count': shard.article_count,
                        'homeostasis_tension': shard.homeostasis_tension,
                        'entropy_score': shard.entropy_score
                    }
                    for shard in shards
                ]
            }
            
            # Save report
            report_path = dataset_dir / "ingestion_report.json"
            with open(report_path, 'w') as f:
                json.dump(report, f, indent=2)
            
            logger.info(f"Ingestion complete: {len(shards)} shards, "
                       f"{total_articles} articles, {total_size_mb:.1f}MB")
            logger.info(f"Average homeostasis tension: {avg_homeostasis_tension:.3f}")
            logger.info(f"Validation pass rate: {validation_rate:.1%}")
            
            return report
            
        except Exception as e:
            logger.error(f"Ingestion pipeline failed: {e}")
            raise


class PerformanceMonitor:
    """Monitor performance metrics during ingestion"""
    
    def __init__(self):
        self.start_time = time.time()
        self.metrics = {
            'cpu_samples': [],
            'memory_samples': [],
            'disk_io_samples': [],
            'processing_rates': []
        }
        self.monitoring = True
        self.monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self.monitor_thread.start()
    
    def _monitor_loop(self):
        """Background monitoring loop"""
        while self.monitoring:
            try:
                cpu_percent = psutil.cpu_percent(interval=1)
                memory = psutil.virtual_memory()
                disk_io = psutil.disk_io_counters()
                
                self.metrics['cpu_samples'].append(cpu_percent)
                self.metrics['memory_samples'].append(memory.percent)
                
                if disk_io:
                    self.metrics['disk_io_samples'].append({
                        'read_bytes': disk_io.read_bytes,
                        'write_bytes': disk_io.write_bytes
                    })
                
                time.sleep(5)  # Sample every 5 seconds
                
            except Exception as e:
                logger.warning(f"Performance monitoring error: {e}")
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get current performance metrics"""
        return {
            'duration_seconds': time.time() - self.start_time,
            'avg_cpu_percent': np.mean(self.metrics['cpu_samples']) if self.metrics['cpu_samples'] else 0,
            'peak_cpu_percent': max(self.metrics['cpu_samples']) if self.metrics['cpu_samples'] else 0,
            'avg_memory_percent': np.mean(self.metrics['memory_samples']) if self.metrics['memory_samples'] else 0,
            'peak_memory_percent': max(self.metrics['memory_samples']) if self.metrics['memory_samples'] else 0,
            'sample_count': len(self.metrics['cpu_samples'])
        }
    
    def stop_monitoring(self):
        """Stop performance monitoring"""
        self.monitoring = False


def demo_dataset_ingestion():
    """Demonstration of the dataset ingestion pipeline"""
    print("=== ATTACK Framework Dataset Ingestion Demo ===")
    
    # Create test wiki content
    test_content = """<?xml version="1.0" encoding="UTF-8"?>
<mediawiki>
    <page>
        <title>Artificial Intelligence</title>
        <text>Artificial intelligence (AI) is intelligence demonstrated by machines, 
        in contrast to the natural intelligence displayed by humans and animals. 
        Leading AI textbooks define the field as the study of "intelligent agents": 
        any device that perceives its environment and takes actions that maximize 
        its chance of successfully achieving its goals.</text>
    </page>
    <page>
        <title>Machine Learning</title>
        <text>Machine learning (ML) is a subset of artificial intelligence that 
        focuses on algorithms and statistical models that computer systems use 
        to perform a specific task without using explicit instructions, relying 
        on patterns and inference instead.</text>
    </page>
    <page>
        <title>Neural Networks</title>
        <text>A neural network is a network or circuit of neurons, or in a modern 
        sense, an artificial neural network, composed of artificial neurons or nodes. 
        Neural networks are used to estimate or approximate functions that can 
        depend on a large number of inputs and are generally unknown.</text>
    </page>
</mediawiki>"""
    
    # Save test content
    test_file = "test_wiki_dump.xml"
    with open(test_file, 'w', encoding='utf-8') as f:
        f.write(test_content)
    
    try:
        # Initialize ingestion controller
        controller = DatasetIngestionController("test_output")
        
        # Run ingestion pipeline
        report = controller.ingest_wiki_dataset(test_file, "test_dataset")
        
        print(f"\nIngestion Report:")
        print(f"Dataset: {report['dataset_name']}")
        print(f"Processing Time: {report['processing_time_seconds']:.2f}s")
        print(f"Total Shards: {report['total_shards']}")
        print(f"Total Articles: {report['total_articles']}")
        print(f"Average Homeostasis Tension: {report['avg_homeostasis_tension']:.3f}")
        print(f"Validation Pass Rate: {report['validation_pass_rate']:.1%}")
        
        # Check homeostasis threshold
        if report['avg_homeostasis_tension'] <= 0.05:
            print("✅ PASS: Homeostasis tension within acceptable threshold (≤ 0.05)")
        else:
            print("❌ FAIL: Homeostasis tension exceeds threshold")
        
    finally:
        # Cleanup
        if os.path.exists(test_file):
            os.remove(test_file)
        if os.path.exists("test_output"):
            shutil.rmtree("test_output")
        if os.path.exists("wiki_shard_metadata.db"):
            os.remove("wiki_shard_metadata.db")


if __name__ == "__main__":
    demo_dataset_ingestion()
