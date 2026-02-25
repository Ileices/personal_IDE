#!/usr/bin/env python3
"""
AE Framework Enhanced Training Script - Clean Version
Production-ready LLM training with complete AE Framework integration
"""

import os
import json
import torch
import logging
import argparse
import numpy as np
from datetime import datetime
from typing import Dict, Any, Optional
from datasets import Dataset, load_from_disk
from transformers import (
    AutoModelForCausalLM, AutoTokenizer, 
    TrainingArguments, Trainer, DataCollatorForLanguageModeling
)
from peft import LoraConfig, get_peft_model, TaskType

# Import AE Framework
try:
    from ae_core import RBYTriplet, AEProcessor
    AE_AVAILABLE = True
except ImportError:
    print("⚠️ AE Framework not available - using fallback mode")
    AE_AVAILABLE = False
    class RBYTriplet:
        def __init__(self, r, b, y):
            self.red, self.blue, self.yellow = r, b, y

logging.basicConfig(level=logging.INFO, format='%(levelname)s:%(name)s:%(message)s')
logger = logging.getLogger(__name__)

class AEEnhancedTrainer:
    """AE Framework Enhanced Trainer - Clean Implementation"""
    
    def __init__(self, args):
        self.args = args
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        # Initialize AE Framework
        self.rby_triplet = RBYTriplet(
            getattr(args, 'ae_rby_r', 0.33),
            getattr(args, 'ae_rby_b', 0.33), 
            getattr(args, 'ae_rby_y', 0.34)
        )
        
        self.ae_processor = None
        if AE_AVAILABLE:
            try:
                self.ae_processor = AEProcessor(self.rby_triplet)
            except Exception as e:
                logger.warning(f"AE Processor initialization failed: {e}")
        
        self.tau = getattr(args, 'ae_tau', 0.1)
        self.psi = getattr(args, 'ae_psi', 0.0)
        self.ae_compliance_error = getattr(args, 'ae_compliance_error', 0.001)
        
        logger.info("🌟 AE Framework Enhanced Trainer initialized")
        logger.info(f"RBY State: R={self.rby_triplet.red:.4f}, B={self.rby_triplet.blue:.4f}, Y={self.rby_triplet.yellow:.4f}")
        logger.info(f"Device: {self.device}")
        
    def load_model_and_tokenizer(self):
        """Load model and tokenizer with AE optimization"""
        logger.info(f"🔮 Loading model: {self.args.model_name_or_path}")
        
        # Force float32 on CPU to avoid mixed dtype issues
        if torch.cuda.is_available():
            dtype = torch.float16
            logger.info("   🚀 GPU mode - using float16")
        else:
            dtype = torch.float32
            logger.info("   💻 CPU mode - using float32 for stability")
        
        # Load tokenizer
        self.tokenizer = AutoTokenizer.from_pretrained(
            self.args.model_name_or_path,
            trust_remote_code=True
        )
        
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token
        
        # Load model
        model_kwargs = {
            'torch_dtype': dtype,
            'device_map': "auto" if torch.cuda.is_available() else None,
            'low_cpu_mem_usage': True,
            'trust_remote_code': True
        }
        
        self.model = AutoModelForCausalLM.from_pretrained(
            self.args.model_name_or_path,
            **model_kwargs
        )
        
        # Force disable gradient checkpointing on CPU
        if not torch.cuda.is_available():
            if hasattr(self.model, 'gradient_checkpointing_disable'):
                self.model.gradient_checkpointing_disable()
            if hasattr(self.model.config, 'use_cache'):
                self.model.config.use_cache = True
        
        # Apply LoRA if requested
        if self.args.use_lora:
            self.apply_lora()
        
        logger.info(f"✅ Model loaded with {sum(p.numel() for p in self.model.parameters())} parameters")
        
    def apply_lora(self):
        """Apply LoRA with AE enhancement"""
        lora_config = LoraConfig(
            task_type=TaskType.CAUSAL_LM,
            r=self.args.lora_r,
            lora_alpha=self.args.lora_alpha,
            lora_dropout=self.args.lora_dropout,
            target_modules=self.args.lora_target.split(',') if hasattr(self.args, 'lora_target') else ["c_attn"],
            bias="none"
        )
        
        self.model = get_peft_model(self.model, lora_config)
        
        trainable_params = sum(p.numel() for p in self.model.parameters() if p.requires_grad)
        total_params = sum(p.numel() for p in self.model.parameters())
        
        logger.info(f"🧠 LoRA applied: {trainable_params:,} trainable / {total_params:,} total params")
        logger.info(f"   Trainable: {100 * trainable_params / total_params:.2f}%")
        
    def load_dataset(self):
        """Load and process dataset with AE enhancement"""
        logger.info(f"📚 Loading dataset from: {self.args.dataset_dir}")
        
        # Load dataset
        if os.path.isfile(os.path.join(self.args.dataset_dir, "train.json")):
            with open(os.path.join(self.args.dataset_dir, "train.json"), 'r') as f:
                data = json.load(f)
        else:
            raise FileNotFoundError(f"No train.json found in {self.args.dataset_dir}")
        
        # Process through AE Framework if available
        if self.ae_processor:
            for item in data:
                try:
                    text = f"{item.get('instruction', '')} {item.get('input', '')} {item.get('output', '')}"
                    result = self.ae_processor.process_text(text, "training_data")
                    # AE processing logged automatically
                except Exception as e:
                    logger.debug(f"AE processing failed for item: {e}")
        
        # Create dataset
        def preprocess_function(examples):
            # Combine instruction, input, and output
            texts = []
            for i in range(len(examples['instruction'])):
                instruction = examples['instruction'][i]
                input_text = examples.get('input', [''] * len(examples['instruction']))[i]
                output = examples['output'][i]
                
                if input_text:
                    text = f"Instruction: {instruction}\nInput: {input_text}\nResponse: {output}"
                else:
                    text = f"Instruction: {instruction}\nResponse: {output}"
                texts.append(text)
            
            # Tokenize
            tokenized = self.tokenizer(
                texts,
                truncation=True,
                padding=False,
                max_length=self.args.max_seq_length,
                return_overflowing_tokens=False,
            )
            
            # Set labels to input_ids for causal LM
            tokenized["labels"] = tokenized["input_ids"].copy()
            return tokenized
        
        # Convert to HuggingFace dataset and process
        dataset = Dataset.from_list(data)
        dataset = dataset.map(
            preprocess_function,
            batched=True,
            remove_columns=dataset.column_names,
            desc="Tokenizing dataset"
        )
        
        logger.info(f"✅ Dataset created: {len(dataset)} samples")
        return dataset
        
    def create_training_args(self):
        """Create training arguments with AE enhancement"""
        # AE-enhanced learning rate calculation
        base_lr = self.args.learning_rate
        
        # Apply AE enhancement
        stability_factor = np.exp(-self.tau / 2)
        base_modulation = (1.0 - 0.5 * self.rby_triplet.red + 
                          0.3 * self.rby_triplet.blue + 
                          0.2 * self.rby_triplet.yellow) * stability_factor
        
        ae_factor = 1.0 - self.ae_compliance_error
        meta_factor = 1.0 + (0.1 * (1.0 - abs(self.psi)))
        
        enhanced_lr = base_lr * base_modulation * ae_factor * meta_factor
        enhanced_lr = max(0.1 * base_lr, min(10.0 * base_lr, enhanced_lr))
        
        # Create output directory
        os.makedirs(self.args.output_dir, exist_ok=True)
        
        # Device-aware training arguments
        training_args = TrainingArguments(
            output_dir=self.args.output_dir,
            per_device_train_batch_size=self.args.per_device_train_batch_size,
            gradient_accumulation_steps=self.args.gradient_accumulation_steps,
            learning_rate=enhanced_lr,
            num_train_epochs=self.args.num_train_epochs,
            warmup_steps=self.args.warmup_steps,
            logging_steps=self.args.logging_steps,
            save_steps=self.args.save_steps,
            save_total_limit=3,
            prediction_loss_only=True,
            remove_unused_columns=False,
            dataloader_num_workers=0,  # Safer on CPU
            gradient_checkpointing=False,  # Disable to avoid dtype issues
            fp16=False,  # Disable mixed precision on CPU
            bf16=False,
            dataloader_pin_memory=False,
            report_to="none",  # Disable reporting for simplicity
            run_name=f"ae-enhanced-{datetime.now().strftime('%Y%m%d_%H%M')}",
            seed=42,
            data_seed=42,
            optim="adamw_torch",
            weight_decay=getattr(self.args, 'weight_decay', 0.01),
            lr_scheduler_type="cosine",
            save_safetensors=True,
            logging_dir=getattr(self.args, 'logging_dir', None)
        )
        
        logger.info(f"🎯 Enhanced learning rate: {enhanced_lr:.2e} (from {base_lr:.2e})")
        logger.info(f"📊 AE enhancement factor: {ae_factor:.4f}")
        
        return training_args
        
    def train(self):
        """Execute AE-enhanced training"""
        try:
            logger.info("🚀 Starting AE Framework Enhanced Training")
            
            # Load components
            self.load_model_and_tokenizer()
            dataset = self.load_dataset()
            training_args = self.create_training_args()
            
            # Create data collator
            data_collator = DataCollatorForLanguageModeling(
                tokenizer=self.tokenizer,
                mlm=False,  # Causal LM
                pad_to_multiple_of=8 if torch.cuda.is_available() else None
            )
            
            # Create trainer
            trainer = Trainer(
                model=self.model,
                args=training_args,
                train_dataset=dataset,
                data_collator=data_collator,
                tokenizer=self.tokenizer,
            )
            
            logger.info("🧮 Training with AE Framework monitoring...")
            
            # Train
            trainer.train()
            
            # Save model
            trainer.save_model()
            logger.info(f"✅ Training completed! Model saved to: {self.args.output_dir}")
            
            # Save AE configuration
            ae_config = {
                "rby_triplet": [self.rby_triplet.red, self.rby_triplet.blue, self.rby_triplet.yellow],
                "ae_compliance_error": self.ae_compliance_error,
                "tau": self.tau,
                "psi": self.psi,
                "training_timestamp": datetime.now().isoformat(),
                "ae_framework_version": "clean_v1.0"
            }
            
            with open(os.path.join(self.args.output_dir, "ae_config.json"), 'w') as f:
                json.dump(ae_config, f, indent=2)
            
            logger.info("🎊 AE Framework Enhanced Training Complete!")
            return True
            
        except Exception as e:
            logger.error(f"❌ Training failed: {e}")
            import traceback
            traceback.print_exc()
            return False

def main():
    # Enhanced argument parser
    parser = argparse.ArgumentParser(description="AE Framework Enhanced Training")
    
    # Model arguments
    parser.add_argument("--model_name_or_path", type=str, required=True)
    parser.add_argument("--output_dir", type=str, required=True)
    parser.add_argument("--dataset_dir", type=str, required=True)
    
    # Training arguments
    parser.add_argument("--max_seq_length", type=int, default=512)
    parser.add_argument("--per_device_train_batch_size", type=int, default=1)
    parser.add_argument("--gradient_accumulation_steps", type=int, default=4)
    parser.add_argument("--learning_rate", type=float, default=2e-4)
    parser.add_argument("--num_train_epochs", type=int, default=1)
    parser.add_argument("--warmup_steps", type=int, default=100)
    parser.add_argument("--weight_decay", type=float, default=0.01)
    
    # LoRA arguments
    parser.add_argument("--use_lora", action="store_true")
    parser.add_argument("--lora_r", type=int, default=8)
    parser.add_argument("--lora_alpha", type=int, default=16)
    parser.add_argument("--lora_dropout", type=float, default=0.1)
    parser.add_argument("--lora_target", type=str, default="c_attn")
    
    # Logging arguments
    parser.add_argument("--logging_steps", type=int, default=10)
    parser.add_argument("--save_steps", type=int, default=500)
    parser.add_argument("--logging_dir", type=str, default=None)
    
    # AE Framework arguments
    parser.add_argument("--ae_rby_r", type=float, default=0.33)
    parser.add_argument("--ae_rby_b", type=float, default=0.33) 
    parser.add_argument("--ae_rby_y", type=float, default=0.34)
    parser.add_argument("--ae_tau", type=float, default=0.1)
    parser.add_argument("--ae_psi", type=float, default=0.0)
    parser.add_argument("--ae_compliance_error", type=float, default=0.001)
    
    args = parser.parse_args()
    
    print("🌟 AE FRAMEWORK ENHANCED TRAINING")
    print("🧮 Production-Ready LLM Training with Complete AE Integration")
    print("=" * 80)
    print("🔬 AE FRAMEWORK CONFIGURATION:")
    print(f"   RBY Triplet: R={args.ae_rby_r:.4f}, B={args.ae_rby_b:.4f}, Y={args.ae_rby_y:.4f}")
    print(f"   Tension τ: {args.ae_tau:.4f}")
    print(f"   Convergence Ψ: {args.ae_psi:.4f}")
    print(f"   Compliance Error: {args.ae_compliance_error:.2e}")
    print()
    print("🎯 TRAINING CONFIGURATION:")
    print(f"   Model: {args.model_name_or_path}")
    print(f"   Output: {args.output_dir}")
    print(f"   Epochs: {args.num_train_epochs}")
    print(f"   Batch Size: {args.per_device_train_batch_size}")
    print(f"   Learning Rate: {args.learning_rate:.2e}")
    print(f"   LoRA Rank: {args.lora_r}")
    print()
    
    # Initialize and run trainer
    trainer = AEEnhancedTrainer(args)
    success = trainer.train()
    
    if success:
        print("🎉 AE Framework Enhanced Training Completed Successfully!")
    else:
        print("❌ Training failed - check logs for details")

if __name__ == "__main__":
    main()
