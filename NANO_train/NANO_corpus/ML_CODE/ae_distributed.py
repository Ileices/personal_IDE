"""
AE Distributed Training - Scale AE processing across GPUs/nodes
Production-ready distributed training framework for AE-enhanced models
"""
import logging
import json
import time
import threading
from typing import Dict, List, Tuple, Any, Optional, Callable
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
from ae_core import RBYTriplet, AEProcessor
from ae_tokenizer import AETokenizer

logger = logging.getLogger(__name__)

class AEDistributedTrainer:
    """
    Distributed training coordinator for AE-enhanced models
    Handles data sharding, model synchronization, and AE state aggregation
    """
    
    def __init__(self, 
                 num_workers: int = 4,
                 world_size: int = 1,
                 rank: int = 0):
        self.num_workers = num_workers
        self.world_size = world_size  # Total number of distributed nodes
        self.rank = rank              # Current node rank
        
        # Training components
        self.local_ae_processor = AEProcessor()
        self.tokenizer = AETokenizer(vocab_size=50000)
        
        # Distributed state
        self.worker_stats = {}
        self.global_ae_state = None
        self.synchronization_frequency = 100  # Steps between AE sync
        
        # Performance tracking
        self.training_metrics = {
            'total_steps': 0,
            'total_samples': 0,
            'ae_sync_count': 0,
            'worker_utilization': []
        }
        
    def shard_dataset(self, dataset: List[str]) -> List[str]:
        """Shard dataset for current node/rank"""
        # Simple round-robin sharding
        start_idx = self.rank
        sharded_data = []
        
        for i in range(start_idx, len(dataset), self.world_size):
            sharded_data.append(dataset[i])
        
        logger.info(f"Node {self.rank}: Sharded dataset to {len(sharded_data)} samples")
        return sharded_data
    
    def process_batch_worker(self, worker_id: int, batch: List[str]) -> Dict[str, Any]:
        """Process a batch of data on a single worker"""
        worker_start_time = time.time()
        
        # Create worker-specific AE processor
        worker_ae = AEProcessor()
        processed_samples = []
        
        for sample_id, text in enumerate(batch):
            # Tokenize
            token_ids = self.tokenizer.encode(text)
            
            # Process with AE
            ae_result = worker_ae.process_text(text, context=f"worker_{worker_id}_sample_{sample_id}")
            
            processed_sample = {
                'text': text,
                'token_ids': token_ids,
                'rby_matrix': self.tokenizer.get_sequence_rby_matrix(token_ids),
                'ae_compliance': ae_result['ae_compliance'],
                'worker_id': worker_id
            }
            processed_samples.append(processed_sample)
        
        # Worker statistics
        processing_time = time.time() - worker_start_time
        worker_state = worker_ae.get_compressed_state()
        
        return {
            'worker_id': worker_id,
            'processed_samples': processed_samples,
            'worker_ae_state': worker_state,
            'processing_time': processing_time,
            'samples_processed': len(processed_samples)
        }
    
    def train_step_distributed(self, batch_data: List[str]) -> Dict[str, Any]:
        """Execute a distributed training step"""
        step_start_time = time.time()
        
        # Shard batch across workers
        batch_size = len(batch_data)
        worker_batch_size = max(1, batch_size // self.num_workers)
        
        worker_batches = []
        for i in range(0, batch_size, worker_batch_size):
            worker_batch = batch_data[i:i + worker_batch_size]
            worker_batches.append((len(worker_batches), worker_batch))
        
        # Process batches in parallel
        with ThreadPoolExecutor(max_workers=self.num_workers) as executor:
            futures = [
                executor.submit(self.process_batch_worker, worker_id, batch)
                for worker_id, batch in worker_batches
            ]
            
            # Collect results
            worker_results = []
            for future in futures:
                try:
                    result = future.result(timeout=60)  # 60 second timeout
                    worker_results.append(result)
                except Exception as e:
                    logger.error(f"Worker failed: {e}")
                    continue
        
        # Aggregate results
        step_result = self._aggregate_worker_results(worker_results)
        step_result['step_time'] = time.time() - step_start_time
        step_result['samples_in_step'] = batch_size
        
        # Update metrics
        self.training_metrics['total_steps'] += 1
        self.training_metrics['total_samples'] += batch_size
        
        # Check if AE synchronization is needed
        if self.training_metrics['total_steps'] % self.synchronization_frequency == 0:
            self._synchronize_ae_state(worker_results)
        
        return step_result
    
    def _aggregate_worker_results(self, worker_results: List[Dict]) -> Dict[str, Any]:
        """Aggregate results from all workers"""
        if not worker_results:
            return {'status': 'no_worker_results'}
        
        # Aggregate samples
        all_samples = []
        total_processing_time = 0
        ae_compliances = []
        
        for result in worker_results:
            all_samples.extend(result['processed_samples'])
            total_processing_time += result['processing_time']
            
            for sample in result['processed_samples']:
                ae_compliances.append(sample['ae_compliance'])
        
        # Calculate aggregate statistics
        avg_ae_compliance = sum(ae_compliances) / len(ae_compliances) if ae_compliances else 0
        
        # Aggregate RBY distributions
        all_rby_matrices = [sample['rby_matrix'] for sample in all_samples if sample['rby_matrix']]
        aggregated_rby = self._aggregate_rby_distributions(all_rby_matrices)
        
        return {
            'total_samples': len(all_samples),
            'workers_used': len(worker_results),
            'total_processing_time': total_processing_time,
            'average_ae_compliance': avg_ae_compliance,
            'aggregated_rby_distribution': aggregated_rby,
            'worker_utilization': [r['samples_processed'] for r in worker_results]
        }
    
    def _aggregate_rby_distributions(self, rby_matrices: List[List[Tuple]]) -> Dict[str, float]:
        """Aggregate RBY distributions across all processed samples"""
        if not rby_matrices:
            return {'red': 1/3, 'blue': 1/3, 'yellow': 1/3}
        
        total_r = total_b = total_y = 0
        total_tokens = 0
        
        for matrix in rby_matrices:
            for r, b, y in matrix:
                total_r += r
                total_b += b
                total_y += y
                total_tokens += 1
        
        if total_tokens == 0:
            return {'red': 1/3, 'blue': 1/3, 'yellow': 1/3}
        
        return {
            'red': total_r / total_tokens,
            'blue': total_b / total_tokens,
            'yellow': total_y / total_tokens
        }
    
    def _synchronize_ae_state(self, worker_results: List[Dict]):
        """Synchronize AE state across distributed nodes"""
        sync_start_time = time.time()
        
        # Collect all worker AE states
        worker_states = [result['worker_ae_state'] for result in worker_results]
        
        # Aggregate AE states (simplified - in practice this would be more sophisticated)
        aggregated_state = self._aggregate_ae_states(worker_states)
        
        # Update global AE state
        self.global_ae_state = aggregated_state
        
        # In a real distributed system, this would involve network communication
        # to synchronize state across all nodes
        
        sync_time = time.time() - sync_start_time
        self.training_metrics['ae_sync_count'] += 1
        
        logger.info(f"AE state synchronized across {len(worker_results)} workers in {sync_time:.3f}s")
        logger.info(f"Global AE compliance: {aggregated_state.get('ae_compliance', 0):.6f}")
    
    def _aggregate_ae_states(self, worker_states: List[Dict]) -> Dict[str, Any]:
        """Aggregate AE states from multiple workers"""
        if not worker_states:
            return {}
        
        # Aggregate current states
        total_r = total_b = total_y = 0
        total_glyphs = 0
        total_processing_steps = 0
        ae_compliances = []
        
        for state in worker_states:
            if 'current_state' in state:
                r, b, y = state['current_state']
                total_r += r
                total_b += b
                total_y += y
            
            total_glyphs += state.get('glyph_count', 0)
            total_processing_steps += state.get('processing_steps', 0)
            ae_compliances.append(state.get('ae_compliance', 0))
        
        count = len(worker_states)
        avg_ae_compliance = sum(ae_compliances) / count if ae_compliances else 0
        
        return {
            'aggregated_current_state': (total_r / count, total_b / count, total_y / count),
            'total_glyphs': total_glyphs,
            'total_processing_steps': total_processing_steps,
            'ae_compliance': avg_ae_compliance,
            'workers_count': count,
            'sync_timestamp': time.time()
        }
    
    def get_training_status(self) -> Dict[str, Any]:
        """Get comprehensive training status"""
        return {
            'distributed_config': {
                'num_workers': self.num_workers,
                'world_size': self.world_size,
                'rank': self.rank
            },
            'training_progress': self.training_metrics,
            'global_ae_state': self.global_ae_state,
            'tokenizer_vocab_size': len(self.tokenizer.token_to_id),
            'last_sync_step': self.training_metrics['total_steps'] - (self.training_metrics['total_steps'] % self.synchronization_frequency)
        }
    
    def save_distributed_checkpoint(self, checkpoint_dir: str):
        """Save distributed training checkpoint"""
        checkpoint_path = Path(checkpoint_dir)
        checkpoint_path.mkdir(exist_ok=True)
        
        # Save node-specific state
        node_state = {
            'rank': self.rank,
            'training_metrics': self.training_metrics,
            'global_ae_state': self.global_ae_state,
            'local_ae_state': self.local_ae_processor.export_state()
        }
        
        node_file = checkpoint_path / f"node_{self.rank}_state.json"
        with open(node_file, 'w') as f:
            json.dump(node_state, f, indent=2)
        
        # Save tokenizer (shared across nodes)
        tokenizer_file = checkpoint_path / f"tokenizer_rank_{self.rank}.json"
        self.tokenizer.save_vocabulary(str(tokenizer_file))
        
        logger.info(f"Distributed checkpoint saved for rank {self.rank}")

def demo_distributed_training():
    """Demonstrate AE distributed training"""
    print("AE Distributed Training Demo")
    print("=" * 50)
    
    # Create distributed trainer (simulating single node with multiple workers)
    trainer = AEDistributedTrainer(num_workers=4, world_size=1, rank=0)
    
    # Sample training dataset
    training_data = [
        "The neural network processes input patterns efficiently",
        "Attention mechanisms focus computational resources selectively", 
        "Transformer models excel at sequence-to-sequence tasks",
        "Distributed training scales model training across hardware",
        "Gradient synchronization ensures model consistency",
        "Memory optimization reduces computational overhead",
        "Parallel processing accelerates model convergence",
        "Load balancing distributes work evenly across workers",
        "Checkpoint synchronization preserves training progress",
        "Performance metrics guide training optimization decisions",
        "Cognitive patterns emerge from neural network activations",
        "Language models learn statistical patterns in text",
        "Tokenization converts text into numerical representations",
        "Embedding layers map tokens to vector spaces",
        "Self-attention computes contextual relationships",
        "Feed-forward networks transform representation spaces"
    ]
    
    print(f"Training dataset: {len(training_data)} samples")
    print(f"Workers: {trainer.num_workers}")
    
    # Simulate training steps
    batch_size = 8
    num_steps = 5
    
    for step in range(num_steps):
        print(f"\n--- Training Step {step + 1} ---")
        
        # Create batch (in practice this would come from data loader)
        start_idx = step * batch_size
        batch = training_data[start_idx:start_idx + batch_size]
        
        print(f"Processing batch of {len(batch)} samples")
        
        # Execute distributed training step
        step_result = trainer.train_step_distributed(batch)
        
        print(f"Results:")
        print(f"  Samples processed: {step_result['total_samples']}")
        print(f"  Workers used: {step_result['workers_used']}")
        print(f"  Step time: {step_result['step_time']:.3f}s")
        print(f"  Average AE compliance: {step_result['average_ae_compliance']:.6f}")
        print(f"  RBY distribution: {step_result['aggregated_rby_distribution']}")
        print(f"  Worker utilization: {step_result['worker_utilization']}")
    
    # Get final training status
    print(f"\n--- Final Training Status ---")
    status = trainer.get_training_status()
    
    print(f"Total steps: {status['training_progress']['total_steps']}")
    print(f"Total samples: {status['training_progress']['total_samples']}")
    print(f"AE synchronizations: {status['training_progress']['ae_sync_count']}")
    print(f"Vocabulary size: {status['tokenizer_vocab_size']}")
    
    if status['global_ae_state']:
        print(f"Global AE state:")
        print(f"  Current state: {status['global_ae_state']['aggregated_current_state']}")
        print(f"  Total glyphs: {status['global_ae_state']['total_glyphs']}")
        print(f"  AE compliance: {status['global_ae_state']['ae_compliance']:.6f}")
    
    # Save checkpoint
    trainer.save_distributed_checkpoint("demo_distributed_checkpoint")
    print(f"\nDistributed checkpoint saved")

if __name__ == "__main__":
    demo_distributed_training()
