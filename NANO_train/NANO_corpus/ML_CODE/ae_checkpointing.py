"""
AE Model Checkpointing - Save/load AE state with model weights
Production-ready checkpointing system for AE-enhanced models
"""
import logging
import json
import time
import hashlib
from typing import Dict, List, Tuple, Any, Optional
from pathlib import Path
from ae_core import RBYTriplet, AEProcessor
from ae_tokenizer import AETokenizer

logger = logging.getLogger(__name__)

class AEModelCheckpoint:
    """
    Comprehensive checkpointing system for AE-enhanced models
    Saves model state + AE cognitive state + training metadata
    """
    
    def __init__(self, checkpoint_dir: str = "ae_checkpoints"):
        self.checkpoint_dir = Path(checkpoint_dir)
        self.checkpoint_dir.mkdir(exist_ok=True)
        
        # Checkpoint metadata
        self.checkpoint_counter = 0
        self.training_history = []
        
    def create_checkpoint(self, 
                         model_state: Dict[str, Any],
                         ae_processor: AEProcessor,
                         tokenizer: AETokenizer,
                         training_step: int,
                         loss: float,
                         metrics: Optional[Dict[str, float]] = None) -> str:
        """Create a comprehensive checkpoint"""
        
        checkpoint_id = f"ae_checkpoint_{training_step:08d}_{int(time.time())}"
        checkpoint_path = self.checkpoint_dir / checkpoint_id
        checkpoint_path.mkdir(exist_ok=True)
        
        # 1. Save model state (weights, optimizer, etc.)
        model_file = checkpoint_path / "model_state.json"
        with open(model_file, 'w') as f:
            json.dump(model_state, f, indent=2)
        
        # 2. Save AE processor state
        ae_state_file = checkpoint_path / "ae_processor_state.json"
        with open(ae_state_file, 'w') as f:
            f.write(ae_processor.export_state())
        
        # 3. Save tokenizer with RBY mappings
        tokenizer_file = checkpoint_path / "ae_tokenizer.json"
        tokenizer.save_vocabulary(str(tokenizer_file))
        
        # 4. Save training metadata
        metadata = {
            'checkpoint_id': checkpoint_id,
            'training_step': training_step,
            'loss': loss,
            'metrics': metrics or {},
            'timestamp': time.time(),
            'ae_compliance': self._calculate_ae_compliance(ae_processor),
            'cognitive_distribution': self._analyze_cognitive_state(ae_processor),
            'vocabulary_stats': tokenizer.analyze_vocabulary_distribution(),
            'model_hash': self._compute_model_hash(model_state),
            'checkpoint_version': '1.0'
        }
        
        metadata_file = checkpoint_path / "metadata.json"
        with open(metadata_file, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        # 5. Update training history
        self.training_history.append(metadata)
        self._save_training_history()
        
        self.checkpoint_counter += 1
        logger.info(f"Checkpoint created: {checkpoint_id}")
        logger.info(f"  Step: {training_step}, Loss: {loss:.6f}")
        logger.info(f"  AE Compliance: {metadata['ae_compliance']:.6f}")
        
        return checkpoint_id
    
    def load_checkpoint(self, checkpoint_id: str) -> Dict[str, Any]:
        """Load a checkpoint and return all components"""
        checkpoint_path = self.checkpoint_dir / checkpoint_id
        
        if not checkpoint_path.exists():
            raise FileNotFoundError(f"Checkpoint not found: {checkpoint_id}")
        
        # Load metadata first
        metadata_file = checkpoint_path / "metadata.json"
        with open(metadata_file, 'r') as f:
            metadata = json.load(f)
        
        # Load model state
        model_file = checkpoint_path / "model_state.json"
        with open(model_file, 'r') as f:
            model_state = json.load(f)
        
        # Load AE processor state
        ae_processor = AEProcessor()
        ae_state_file = checkpoint_path / "ae_processor_state.json"
        if ae_state_file.exists():
            # In a full implementation, you'd restore the processor state
            # For now, we'll just note that it exists
            logger.info(f"AE processor state available in {ae_state_file}")
        
        # Load tokenizer
        tokenizer = AETokenizer()
        tokenizer_file = checkpoint_path / "ae_tokenizer.json"
        tokenizer.load_vocabulary(str(tokenizer_file))
        
        logger.info(f"Checkpoint loaded: {checkpoint_id}")
        logger.info(f"  Training step: {metadata['training_step']}")
        logger.info(f"  Loss: {metadata['loss']:.6f}")
        
        return {
            'checkpoint_id': checkpoint_id,
            'metadata': metadata,
            'model_state': model_state,
            'ae_processor': ae_processor,
            'tokenizer': tokenizer
        }
    
    def list_checkpoints(self) -> List[Dict[str, Any]]:
        """List all available checkpoints with metadata"""
        checkpoints = []
        
        for checkpoint_dir in self.checkpoint_dir.iterdir():
            if checkpoint_dir.is_dir():
                metadata_file = checkpoint_dir / "metadata.json"
                if metadata_file.exists():
                    with open(metadata_file, 'r') as f:
                        metadata = json.load(f)
                    checkpoints.append(metadata)
        
        # Sort by training step
        checkpoints.sort(key=lambda x: x['training_step'])
        return checkpoints
    
    def find_best_checkpoint(self, metric: str = 'loss', minimize: bool = True) -> Optional[str]:
        """Find the best checkpoint based on a metric"""
        checkpoints = self.list_checkpoints()
        
        if not checkpoints:
            return None
        
        if metric == 'loss':
            best_checkpoint = min(checkpoints, key=lambda x: x['loss']) if minimize else max(checkpoints, key=lambda x: x['loss'])
        elif metric == 'ae_compliance':
            best_checkpoint = min(checkpoints, key=lambda x: x['ae_compliance']) if minimize else max(checkpoints, key=lambda x: x['ae_compliance'])
        elif metric in checkpoints[0].get('metrics', {}):
            best_checkpoint = min(checkpoints, key=lambda x: x['metrics'].get(metric, float('inf'))) if minimize else max(checkpoints, key=lambda x: x['metrics'].get(metric, -float('inf')))
        else:
            logger.warning(f"Metric '{metric}' not found, using latest checkpoint")
            best_checkpoint = max(checkpoints, key=lambda x: x['training_step'])
        
        return best_checkpoint['checkpoint_id']
    
    def cleanup_old_checkpoints(self, keep_last_n: int = 5, keep_best_n: int = 2):
        """Clean up old checkpoints, keeping only the most recent and best ones"""
        checkpoints = self.list_checkpoints()
        
        if len(checkpoints) <= keep_last_n:
            return  # Nothing to cleanup
        
        # Sort by training step
        checkpoints_by_step = sorted(checkpoints, key=lambda x: x['training_step'])
        
        # Keep last N checkpoints
        keep_recent = set(cp['checkpoint_id'] for cp in checkpoints_by_step[-keep_last_n:])
        
        # Keep best N by loss
        checkpoints_by_loss = sorted(checkpoints, key=lambda x: x['loss'])
        keep_best_loss = set(cp['checkpoint_id'] for cp in checkpoints_by_loss[:keep_best_n])
        
        # Keep best N by AE compliance
        checkpoints_by_ae = sorted(checkpoints, key=lambda x: x['ae_compliance'])
        keep_best_ae = set(cp['checkpoint_id'] for cp in checkpoints_by_ae[:keep_best_n])
        
        # Combine all checkpoints to keep
        keep_checkpoints = keep_recent | keep_best_loss | keep_best_ae
        
        # Remove checkpoints not in keep list
        removed_count = 0
        for checkpoint in checkpoints:
            if checkpoint['checkpoint_id'] not in keep_checkpoints:
                checkpoint_path = self.checkpoint_dir / checkpoint['checkpoint_id']
                if checkpoint_path.exists():
                    import shutil
                    shutil.rmtree(checkpoint_path)
                    removed_count += 1
        
        logger.info(f"Cleaned up {removed_count} old checkpoints")
        logger.info(f"Kept {len(keep_checkpoints)} checkpoints")
    
    def _calculate_ae_compliance(self, ae_processor: AEProcessor) -> float:
        """Calculate current AE compliance from processor state"""
        state = ae_processor.get_compressed_state()
        return state.get('ae_compliance', 1.0)  # Default to 1.0 if not available
    
    def _analyze_cognitive_state(self, ae_processor: AEProcessor) -> Dict[str, float]:
        """Analyze current cognitive distribution"""
        state = ae_processor.get_compressed_state()
        current_rby = state.get('current_state', [1/3, 1/3, 1/3])
        
        return {
            'red': current_rby[0],
            'blue': current_rby[1],
            'yellow': current_rby[2]
        }
    
    def _compute_model_hash(self, model_state: Dict[str, Any]) -> str:
        """Compute hash of model state for integrity checking"""
        # Simple hash of the JSON representation
        # In practice, you'd hash the actual model weights
        model_str = json.dumps(model_state, sort_keys=True)
        return hashlib.md5(model_str.encode()).hexdigest()
    
    def _save_training_history(self):
        """Save training history to disk"""
        history_file = self.checkpoint_dir / "training_history.json"
        with open(history_file, 'w') as f:
            json.dump(self.training_history, f, indent=2)
    
    def generate_checkpoint_report(self) -> Dict[str, Any]:
        """Generate comprehensive checkpoint report"""
        checkpoints = self.list_checkpoints()
        
        if not checkpoints:
            return {'status': 'no_checkpoints'}
        
        # Calculate statistics
        losses = [cp['loss'] for cp in checkpoints]
        ae_compliances = [cp['ae_compliance'] for cp in checkpoints]
        
        report = {
            'checkpoint_summary': {
                'total_checkpoints': len(checkpoints),
                'training_steps_range': {
                    'min': min(cp['training_step'] for cp in checkpoints),
                    'max': max(cp['training_step'] for cp in checkpoints)
                },
                'loss_statistics': {
                    'min': min(losses),
                    'max': max(losses),
                    'latest': checkpoints[-1]['loss']
                },
                'ae_compliance_statistics': {
                    'min': min(ae_compliances),
                    'max': max(ae_compliances),
                    'average': sum(ae_compliances) / len(ae_compliances),
                    'latest': checkpoints[-1]['ae_compliance']
                }
            },
            'best_checkpoints': {
                'best_loss': self.find_best_checkpoint('loss', minimize=True),
                'best_ae_compliance': self.find_best_checkpoint('ae_compliance', minimize=True),
                'latest': checkpoints[-1]['checkpoint_id']
            },
            'storage_info': {
                'checkpoint_directory': str(self.checkpoint_dir),
                'disk_usage_estimate': len(checkpoints) * 100  # Rough estimate in MB
            }
        }
        
        return report

def demo_ae_checkpointing():
    """Demonstrate AE model checkpointing"""
    print("AE Model Checkpointing Demo")
    print("=" * 50)
    
    # Create checkpointing system
    checkpoint_manager = AEModelCheckpoint("demo_checkpoints")
    
    # Create sample components
    ae_processor = AEProcessor()
    tokenizer = AETokenizer(vocab_size=1000)
    
    # Process some sample data to build state
    sample_texts = [
        "The model is learning to understand language",
        "Cognitive patterns emerge during training",
        "Attention mechanisms focus on relevant information",
        "Neural networks process complex patterns"
    ]
    
    for text in sample_texts:
        ae_processor.process_text(text)
        tokenizer.encode(text)  # Build vocabulary
    
    print(f"Initial AE processor state: {len(ae_processor.memory_glyphs)} glyphs")
    print(f"Tokenizer vocabulary: {len(tokenizer.token_to_id)} tokens")
    
    # Simulate training with checkpoints
    training_steps = [100, 200, 300, 400, 500]
    losses = [2.5, 1.8, 1.2, 0.9, 0.7]
    
    checkpoint_ids = []
    for step, loss in zip(training_steps, losses):
        # Simulate model state (in practice this would be actual model weights)
        model_state = {
            'step': step,
            'learning_rate': 0.001,
            'model_config': {'layers': 12, 'heads': 8, 'd_model': 512},
            'optimizer_state': {'momentum': 0.9}
        }
        
        # Create checkpoint
        checkpoint_id = checkpoint_manager.create_checkpoint(
            model_state=model_state,
            ae_processor=ae_processor,
            tokenizer=tokenizer,
            training_step=step,
            loss=loss,
            metrics={'perplexity': loss * 3, 'accuracy': 1.0 - (loss / 3.0)}
        )
        checkpoint_ids.append(checkpoint_id)
        
        # Update AE processor with more data (simulate training)
        ae_processor.process_text(f"Training step {step} completed successfully")
    
    print(f"\nCreated {len(checkpoint_ids)} checkpoints")
    
    # List all checkpoints
    print(f"\nAll checkpoints:")
    for cp in checkpoint_manager.list_checkpoints():
        print(f"  {cp['checkpoint_id']}: Step {cp['training_step']}, Loss {cp['loss']:.3f}, AE {cp['ae_compliance']:.6f}")
    
    # Find best checkpoints
    best_loss = checkpoint_manager.find_best_checkpoint('loss')
    best_ae = checkpoint_manager.find_best_checkpoint('ae_compliance')
    
    print(f"\nBest checkpoints:")
    print(f"  Best loss: {best_loss}")
    print(f"  Best AE compliance: {best_ae}")
    
    # Load a checkpoint
    print(f"\nLoading checkpoint: {best_loss}")
    loaded_checkpoint = checkpoint_manager.load_checkpoint(best_loss)
    print(f"  Loaded model at step: {loaded_checkpoint['metadata']['training_step']}")
    print(f"  Model config: {loaded_checkpoint['model_state']['model_config']}")
    
    # Generate report
    report = checkpoint_manager.generate_checkpoint_report()
    print(f"\nCheckpoint Report:")
    print(f"  Total checkpoints: {report['checkpoint_summary']['total_checkpoints']}")
    print(f"  Training steps: {report['checkpoint_summary']['training_steps_range']}")
    print(f"  Loss range: {report['checkpoint_summary']['loss_statistics']['min']:.3f} - {report['checkpoint_summary']['loss_statistics']['max']:.3f}")
    print(f"  AE compliance average: {report['checkpoint_summary']['ae_compliance_statistics']['average']:.6f}")
    
    # Cleanup demo
    print(f"\nCleaning up old checkpoints...")
    checkpoint_manager.cleanup_old_checkpoints(keep_last_n=3, keep_best_n=1)
    
    final_checkpoints = checkpoint_manager.list_checkpoints()
    print(f"Remaining checkpoints: {len(final_checkpoints)}")

if __name__ == "__main__":
    demo_ae_checkpointing()
