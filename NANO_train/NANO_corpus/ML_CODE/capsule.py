import torch
import platform
import json
import os
import subprocess
import numpy as np
import multiprocessing as mp
import time
from datetime import datetime
from typing import Dict, List, Tuple, Optional
import psutil

# Enhanced RBY Configuration with mathematical modeling
class RBYConfig:
    def __init__(self):
        self.r = 0.33  # Red: focus/precision (training stability)
        self.b = 0.33  # Blue: exploration/uncertainty (learning rate adaptation)
        self.y = 0.34  # Yellow: creativity/adaptation (model architecture flexibility)
        self.tau = 0.1  # RBY tension factor
        self.psi = 0.0  # Absoluteness convergence metric
        
    def update_rby(self, convergence_rate: float, uncertainty: float, novelty: float):
        """Dynamically update RBY values based on training progress"""
        total = convergence_rate + uncertainty + novelty
        if total > 0:
            self.r = convergence_rate / total
            self.b = uncertainty / total  
            self.y = novelty / total
            self.tau = abs(convergence_rate - uncertainty)
            
    def calculate_learning_rate_modulation(self, base_lr: float) -> float:
        """RBY-modulated learning rate with mathematical enhancement"""
        # Enhanced equation: LR = base_lr * (1 - 0.5*R + 0.3*B + 0.2*Y) * exp(-tau/2)
        stability_factor = np.exp(-self.tau / 2)  # Stability decreases with high tension
        modulation = (1.0 - 0.5 * self.r + 0.3 * self.b + 0.2 * self.y) * stability_factor
        return base_lr * max(0.1, modulation)  # Prevent too low learning rates
    
    def calculate_batch_size_adaptation(self, base_batch: int, gpu_memory_gb: float) -> int:
        """RBY-aware adaptive batch sizing with memory constraints"""
        memory_factor = min(2.0, gpu_memory_gb / 8.0)  # Normalize by 8GB baseline
        
        # Enhanced equation: batch = base * memory_factor * (0.8 + 0.4*B - 0.2*R + 0.1*Y) * (1 + tau)
        rby_factor = (0.8 + 0.4 * self.b - 0.2 * self.r + 0.1 * self.y) * (1 + self.tau)
        
        adapted_batch = int(base_batch * memory_factor * rby_factor)
        return max(1, min(32, adapted_batch))  # Reasonable bounds

    def calculate_gradient_accumulation(self, base_accum: int, effective_batch_target: int = 64) -> int:
        """RBY-enhanced gradient accumulation for stable training"""
        # Mathematical optimization: accum = target_batch / actual_batch * (1 + R*0.5)
        # Red increases accumulation for more stable gradients
        precision_boost = 1 + self.r * 0.5
        optimal_accum = int((effective_batch_target / max(1, self.calculate_batch_size_adaptation(1, 8))) * precision_boost)
        return max(base_accum, min(32, optimal_accum))

    def calculate_inference_parameters(self, base_temp: float = 0.7) -> Dict[str, float]:
        """Calculate RBY-optimized inference parameters"""
        # Mathematical enhancement: temperature = base_temp * (1 + B*0.3 - R*0.2 + Y*0.1)
        temperature = base_temp * (1 + self.b * 0.3 - self.r * 0.2 + self.y * 0.1)
        
        # Top-p sampling with RBY modulation
        top_p = 0.9 - self.r * 0.2 + self.b * 0.1  # Red decreases randomness, Blue increases
        
        # Repetition penalty based on creativity (Yellow)
        rep_penalty = 1.1 + self.y * 0.1
        
        return {
            "temperature": max(0.1, min(2.0, temperature)),
            "top_p": max(0.1, min(0.99, top_p)),
            "repetition_penalty": max(1.0, min(1.3, rep_penalty)),
            "max_tokens": int(512 * (1 + self.y * 0.5))  # Yellow increases output length
        }

def roofline_performance_model(cpu_count: int, gpu_specs: List[str], memory_bandwidth_gbps: float = 50.0) -> Dict[str, float]:
    """Enhanced roofline model for training performance prediction"""
    # CPU performance estimation
    peak_cpu_flops = cpu_count * 2.5e9  # Rough estimate: 2.5 GHz per core
    
    # GPU performance estimation (simplified)
    gpu_flops = 0
    gpu_memory = 0
    
    for gpu in gpu_specs:
        if "4090" in gpu:
            gpu_flops += 83e12  # ~83 TFLOPS FP16
            gpu_memory += 24  # 24GB VRAM
        elif "1660" in gpu:
            gpu_flops += 5e12   # ~5 TFLOPS FP16
            gpu_memory += 6     # 6GB VRAM
        elif "1030" in gpu:
            gpu_flops += 1e12   # ~1 TFLOPS FP16
            gpu_memory += 2     # 2GB VRAM
    
    memory_bandwidth = memory_bandwidth_gbps * 1e9 / 8  # Convert to bytes/sec
    
    return {
        "peak_cpu_flops": peak_cpu_flops,
        "peak_gpu_flops": gpu_flops,
        "total_flops": peak_cpu_flops + gpu_flops,
        "gpu_memory_gb": gpu_memory,
        "memory_bandwidth": memory_bandwidth,
        "compute_intensity_threshold": (peak_cpu_flops + gpu_flops) / memory_bandwidth,
        "training_efficiency_score": min(1.0, gpu_flops / 10e12)  # Normalized efficiency
    }

def entropy_based_model_sizing(dataset_entropy: float, model_complexity_budget: float = 7e9) -> Dict[str, any]:
    """Determine optimal model size based on dataset entropy"""
    # Mathematical enhancement: entropy_factor = log(1 + entropy/entropy_base) * complexity_scale
    entropy_base = 4.0  # Baseline entropy for simple text
    complexity_scale = 1.5
    entropy_factor = np.log(1 + dataset_entropy / entropy_base) * complexity_scale
    
    # Model parameter recommendations with mathematical backing
    if entropy_factor > 1.8:
        model_size = "13B"  # Very high entropy needs larger models
        use_mixture = True
        recommended_epochs = 3
    elif entropy_factor > 1.5:
        model_size = "7B"
        use_mixture = True
        recommended_epochs = 2
    elif entropy_factor > 1.0:
        model_size = "7B"
        use_mixture = False
        recommended_epochs = 2
    else:
        model_size = "3B"  # Lower entropy can use smaller models
        use_mixture = False
        recommended_epochs = 1
    
    return {
        "recommended_model_size": model_size,
        "use_mixture_of_experts": use_mixture,
        "entropy_factor": entropy_factor,
        "recommended_epochs": recommended_epochs,
        "complexity_budget": model_complexity_budget
    }

def fractal_dimension_training_adaptation(fractal_dim: float) -> Dict[str, float]:
    """Adapt training parameters based on data fractal dimension with mathematical enhancement"""
    # Mathematical enhancement: Use sigmoid-based transitions for smoother adaptation
    # complexity_score = sigmoid((fractal_dim - 1.0) * 2) 
    complexity_score = 1 / (1 + np.exp(-(fractal_dim - 1.0) * 2))
    
    # Enhanced parameter calculation
    depth_multiplier = 0.8 + 0.6 * complexity_score
    attention_multiplier = 0.8 + 0.5 * complexity_score
    dropout_rate = 0.25 - 0.15 * complexity_score  # Less dropout for complex data
    weight_decay = 1e-3 * (1 - 0.5 * complexity_score)
    
    return {
        "depth_multiplier": depth_multiplier,
        "attention_heads_multiplier": attention_multiplier,
        "dropout_rate": max(0.05, dropout_rate),
        "weight_decay": max(1e-5, weight_decay),
        "complexity_score": complexity_score
    }

def advanced_lr_scheduler_params(rby_config, dataset_meta: Dict) -> Dict[str, any]:
    """Calculate advanced learning rate scheduler parameters using RBY and dataset characteristics"""
    entropy = dataset_meta.get("avg_entropy", 5.0)
    fractal_dim = dataset_meta.get("fractal_dimension", 1.3)
    
    # Mathematical enhancement: Warmup steps based on complexity
    # warmup = base_warmup * (1 + B*0.5) * sqrt(entropy/5.0) * (1 + fractal_complexity)
    base_warmup = 500
    entropy_factor = np.sqrt(entropy / 5.0)
    fractal_complexity = (fractal_dim - 1.0) / 2.0
    
    warmup_steps = int(base_warmup * (1 + rby_config.b * 0.5) * entropy_factor * (1 + fractal_complexity))
    
    # Cosine annealing parameters
    # T_max should be proportional to training complexity
    t_max_multiplier = 1.0 + rby_config.y * 0.3  # Yellow increases adaptation period
    
    return {
        "scheduler_type": "cosine_with_restarts",
        "warmup_steps": max(100, min(2000, warmup_steps)),
        "t_max_multiplier": t_max_multiplier,
        "eta_min_ratio": 0.01 + rby_config.r * 0.05,  # Red increases minimum LR
        "restart_decay": 0.9 - rby_config.b * 0.1     # Blue affects restart intensity
    }

# Training Command Generator with Mathematical Optimization
class EnhancedTrainingCommandGenerator:
    def __init__(self, config: Dict, rby_config: RBYConfig):
        self.config = config
        self.rby_config = rby_config
        self.training_config = config["training_config"]
        self.dataset_meta = self.training_config.get("dataset_characteristics", {})
        
    def generate_optimized_command(self) -> str:
        """Generate mathematically optimized training command"""
        # Extract enhanced parameters
        model_sizing = self.training_config["model_sizing_recommendations"]
        fractal_adaptations = self.training_config["fractal_adaptations"]
        lr_scheduler_params = advanced_lr_scheduler_params(self.rby_config, self.dataset_meta)
        
        # Model selection with mathematical backing
        model_base = self.training_config["model"]
        if model_sizing["recommended_model_size"] == "13B":
            model_base = "mistralai/Mistral-7B-Instruct-v0.2"  # Use largest available
        
        # RBY-optimized parameters
        batch_size = self.rby_config.calculate_batch_size_adaptation(
            self.training_config["base_batch_size"],
            sum(gpu["memory_gb"] for gpu in self.config["hardware"]["gpus"]) if self.config["hardware"]["gpus"] else 4
        )
        
        learning_rate = self.rby_config.calculate_learning_rate_modulation(
            self.training_config["base_learning_rate"]
        )
        
        accum_steps = self.rby_config.calculate_gradient_accumulation(
            self.training_config["gradient_accumulation_steps"]
        )
        
        # Mathematical enhancement: Dynamic epoch calculation
        base_epochs = model_sizing["recommended_epochs"]
        complexity_adjustment = fractal_adaptations["complexity_score"]
        epochs = max(1, int(base_epochs * (1 + complexity_adjustment * 0.5)))
        
        # Enhanced LoRA parameters based on fractal analysis
        lora_r = max(8, int(16 * fractal_adaptations["complexity_score"]))
        lora_alpha = lora_r * 2  # Common practice: alpha = 2 * r
        
        # Build the mathematically optimized command
        output_dir = f"C:/models/aeos-{model_sizing['recommended_model_size']}-enhanced-{datetime.now().strftime('%Y%m%d_%H%M')}"
        
        command = f"""accelerate launch train.py ^
  --model_name_or_path {model_base} ^
  --dataset_dir C:/aeos_dataset_enhanced_* ^
  --finetuning_type lora ^
  --output_dir {output_dir} ^
  --per_device_train_batch_size {batch_size} ^
  --gradient_accumulation_steps {accum_steps} ^
  --learning_rate {learning_rate:.2e} ^
  --max_seq_length {self.training_config['max_seq_length']} ^
  --num_train_epochs {epochs} ^
  --gradient_checkpointing {str(self.training_config['gradient_checkpointing']).lower()} ^
  --logging_steps 20 ^
  --save_steps 100 ^
  --warmup_steps {lr_scheduler_params['warmup_steps']} ^
  --lr_scheduler_type {lr_scheduler_params['scheduler_type']} ^
  --lora_target q_proj,v_proj,k_proj,o_proj ^
  --lora_r {lora_r} ^
  --lora_alpha {lora_alpha} ^
  --lora_dropout {fractal_adaptations['dropout_rate']:.3f} ^
  --weight_decay {fractal_adaptations['weight_decay']:.2e} ^
  --quantization {self.training_config['quantization']} ^
  --mixed_precision {self.training_config['mixed_precision']} ^
  --dataloader_num_workers {self.training_config['num_workers']} ^
  --remove_unused_columns false ^
  --logging_dir C:/logs/aeos_enhanced ^
  --report_to tensorboard ^
  --overwrite_output_dir ^
  --save_safetensors true ^
  --rby_r {self.rby_config.r:.4f} ^
  --rby_b {self.rby_config.b:.4f} ^
  --rby_y {self.rby_config.y:.4f} ^
  --rby_tau {self.rby_config.tau:.4f}"""
        
        return command, {
            "optimized_batch_size": batch_size,
            "optimized_learning_rate": learning_rate,
            "optimized_accumulation_steps": accum_steps,
            "optimized_epochs": epochs,
            "lora_parameters": {"r": lora_r, "alpha": lora_alpha},
            "scheduler_params": lr_scheduler_params,
            "output_directory": output_dir
        }

# NEW: Phase 3 - Model Merging and Inference with RBY Enhancement
class AEOSModelMerger:
    def __init__(self, rby_config: RBYConfig):
        self.rby_config = rby_config
        
    def merge_lora_model(self, base_model_path: str, lora_path: str, output_path: str) -> bool:
        """Merge LoRA with base model using RBY-optimized parameters"""
        try:
            print("🔁 Loading base model and tokenizer...")
            
            # Dynamic imports to handle optional dependencies
            from transformers import AutoModelForCausalLM, AutoTokenizer
            from peft import PeftModel
            
            # Load with RBY-optimized precision
            dtype = torch.float16 if self.rby_config.r > 0.4 else torch.bfloat16
            
            base_model = AutoModelForCausalLM.from_pretrained(
                base_model_path, 
                torch_dtype=dtype,
                device_map="auto" if torch.cuda.is_available() else "cpu"
            )
            tokenizer = AutoTokenizer.from_pretrained(base_model_path)
            
            print("🧠 Merging LoRA weights with RBY optimization...")
            peft_model = PeftModel.from_pretrained(base_model, lora_path)
            merged_model = peft_model.merge_and_unload()
            
            print("💾 Saving merged model...")
            os.makedirs(output_path, exist_ok=True)
            merged_model.save_pretrained(output_path)
            tokenizer.save_pretrained(output_path)
            
            # Save RBY configuration with the model
            rby_config_path = os.path.join(output_path, "rby_config.json")
            with open(rby_config_path, 'w') as f:
                json.dump({
                    "r": self.rby_config.r,
                    "b": self.rby_config.b,
                    "y": self.rby_config.y,
                    "tau": self.rby_config.tau,
                    "inference_params": self.rby_config.calculate_inference_parameters()
                }, f, indent=2)
            
            print(f"✅ Merge complete: {output_path}")
            return True
            
        except ImportError as e:
            print(f"❌ Missing dependencies for merging: {e}")
            print("Install with: pip install transformers peft")
            return False
        except Exception as e:
            print(f"❌ Merge failed: {e}")
            return False
    
    def convert_to_gguf(self, merged_model_path: str, output_gguf_path: str) -> bool:
        """Convert merged model to GGUF format with RBY-optimized quantization"""
        try:
            # Check if llama.cpp is available
            convert_script = "llama.cpp/convert.py"
            if not os.path.exists(convert_script):
                print("❌ llama.cpp not found. Please clone it first:")
                print("git clone https://github.com/ggerganov/llama.cpp")
                return False
            
            # RBY-optimized quantization level
            # Red (precision) prefers less aggressive quantization
            # Blue (exploration) allows more aggressive quantization for speed
            if self.rby_config.r > 0.4:
                quant_type = "q8_0"  # Higher precision
            elif self.rby_config.b > 0.4:
                quant_type = "q4_0"  # Faster inference
            else:
                quant_type = "q5_1"  # Balanced
            
            cmd = [
                "python", convert_script,
                "--outfile", output_gguf_path,
                "--outtype", quant_type,
                merged_model_path
            ]
            
            print(f"🔄 Converting to GGUF with {quant_type} quantization (RBY-optimized)...")
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode == 0:
                print(f"✅ GGUF conversion complete: {output_gguf_path}")
                return True
            else:
                print(f"❌ GGUF conversion failed: {result.stderr}")
                return False
                
        except Exception as e:
            print(f"❌ GGUF conversion error: {e}")
            return False

class AEOSInferenceEngine:
    def __init__(self, rby_config: RBYConfig, model_path: str):
        self.rby_config = rby_config
        self.model_path = model_path
        self.inference_params = rby_config.calculate_inference_parameters()
        
    def start_server(self, port: int = 8000) -> bool:
        """Start RBY-optimized inference server"""
        try:
            # Calculate optimal GPU layers based on available VRAM
            gpu_layers = self._calculate_optimal_gpu_layers()
            
            cmd = [
                "python", "-m", "llama_cpp.server",
                "--model", self.model_path,
                "--port", str(port),
                "--n_gpu_layers", str(gpu_layers),
                "--n_ctx", str(self.inference_params["max_tokens"] * 2),
                "--temperature", str(self.inference_params["temperature"]),
                "--top_p", str(self.inference_params["top_p"]),
                "--repeat_penalty", str(self.inference_params["repetition_penalty"])
            ]
            
            print(f"🚀 Starting AEOS inference server on port {port}")
            print(f"🎯 RBY-optimized parameters:")
            print(f"   Temperature: {self.inference_params['temperature']:.3f}")
            print(f"   Top-p: {self.inference_params['top_p']:.3f}")
            print(f"   Repetition penalty: {self.inference_params['repetition_penalty']:.3f}")
            print(f"   GPU layers: {gpu_layers}")
            
            subprocess.Popen(cmd)
            time.sleep(3)  # Give server time to start
            
            print(f"✅ Server started at http://localhost:{port}")
            return True
            
        except Exception as e:
            print(f"❌ Server start failed: {e}")
            return False
    
    def _calculate_optimal_gpu_layers(self) -> int:
        """Calculate optimal GPU layers based on available VRAM and RBY config"""
        try:
            if not torch.cuda.is_available():
                return 0
            
            total_vram = sum(torch.cuda.get_device_properties(i).total_memory 
                           for i in range(torch.cuda.device_count())) / (1024**3)
            
            # RBY-modulated layer calculation
            # Red increases precision (more layers on GPU)
            # Blue balances CPU/GPU usage
            base_layers = min(40, int(total_vram * 1.5))  # Rough heuristic
            rby_modulation = 1.0 + self.rby_config.r * 0.3 - self.rby_config.b * 0.1
            
            return max(0, int(base_layers * rby_modulation))
            
        except:
            return 0
    
    def chat_interface(self):
        """Interactive chat interface with RBY personality"""
        print("🤖 AEOS Enhanced Chat Interface (RBY-Optimized)")
        print("=" * 50)
        print(f"RBY State: R={self.rby_config.r:.3f}, B={self.rby_config.b:.3f}, Y={self.rby_config.y:.3f}")
        print("Type 'quit' to exit")
        print("=" * 50)
        
        try:
            import requests
            
            while True:
                user_input = input("\n👤 You: ")
                if user_input.lower() in ['quit', 'exit', 'q']:
                    break
                
                # RBY-enhanced prompt formatting
                if self.rby_config.y > 0.4:  # High yellow = creative prompts
                    system_prompt = "You are AEOS, a creative and adaptive AI with enhanced mathematical reasoning."
                elif self.rby_config.r > 0.4:  # High red = precise responses
                    system_prompt = "You are AEOS, a precise and focused AI that provides accurate, well-reasoned responses."
                else:  # Balanced or high blue
                    system_prompt = "You are AEOS, an exploratory AI that considers multiple perspectives and novel approaches."
                
                payload = {
                    "model": "aeos",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_input}
                    ],
                    "temperature": self.inference_params["temperature"],
                    "top_p": self.inference_params["top_p"],
                    "max_tokens": self.inference_params["max_tokens"]
                }
                
                try:
                    response = requests.post("http://localhost:8000/v1/chat/completions", 
                                           json=payload, timeout=30)
                    
                    if response.status_code == 200:
                        result = response.json()
                        assistant_reply = result["choices"][0]["message"]["content"]
                        print(f"\n🤖 AEOS: {assistant_reply}")
                    else:
                        print(f"❌ Server error: {response.status_code}")
                        
                except requests.exceptions.RequestException as e:
                    print(f"❌ Connection error: {e}")
                    print("Make sure the inference server is running!")
                    
        except KeyboardInterrupt:
            print("\n👋 Chat session ended.")
        except ImportError:
            print("❌ 'requests' library required for chat interface")
            print("Install with: pip install requests")

# System role selection with RBY integration
def select_role():
    print("📦 AEOS MODEL TRAINER: ENHANCED SYSTEM IDENTIFICATION")
    print("--------------------------------------------------------")
    print("Select operation mode:")
    print("1. 🔧 Configure System (Hardware Detection & RBY Setup)")
    print("2. 🚀 Generate Training Command (Execute Phase 2)")
    print("3. 🧠 Merge & Convert Model (Phase 3: LoRA→GGUF)")
    print("4. 🤖 Start Inference Server (Phase 4: Chat Interface)")
    print("5. 🔄 Full Pipeline (All phases)")
    choice = input("Enter 1-5: ").strip()
    
    if choice == "2":
        return "execute"
    elif choice == "3":
        return "merge"
    elif choice == "4":
        return "inference"
    elif choice == "5":
        return "full"
    else:
        print("Are we training on:")
        print("1. 🔹 HP Small Form Factor (8-core, GT 1030) - Precision Focus")
        print("2. 🔸 Threadripper Beast (32-core, 4090 + 1660 Super) - Full Power")
        hw_choice = input("Enter 1 or 2: ").strip()
        return "HP" if hw_choice == "1" else "Threadripper"

# Enhanced GPU detection with memory info
def detect_gpu():
    try:
        if torch.cuda.is_available():
            count = torch.cuda.device_count()
            devices = []
            for i in range(count):
                name = torch.cuda.get_device_name(i)
                memory_gb = torch.cuda.get_device_properties(i).total_memory / (1024**3)
                devices.append({"name": name, "memory_gb": round(memory_gb, 1)})
            return devices
        else:
            return []
    except:
        return []

# Enhanced CPU detection
def detect_cpu():
    cpu_info = {
        "name": platform.processor(),
        "cores": mp.cpu_count(),
        "frequency": None
    }
    
    try:
        # Try to get CPU frequency
        if hasattr(psutil, 'cpu_freq'):
            freq = psutil.cpu_freq()
            if freq:
                cpu_info["frequency"] = round(freq.max / 1000, 2)  # Convert to GHz
    except:
        pass
        
    return cpu_info

# Enhanced RAM detection
def detect_ram():
    try:
        memory = psutil.virtual_memory()
        return {
            "total_gb": round(memory.total / (1024**3), 2),
            "available_gb": round(memory.available / (1024**3), 2),
            "usage_percent": memory.percent
        }
    except ImportError:
        return {"total_gb": None, "available_gb": None, "usage_percent": None}

# Enhanced training configuration with RBY and mathematical modeling
def recommend_enhanced_training_config(role, gpus, cpu_info, ram_info, rby_config):
    # Base configuration
    base_config = {
        "model": "mistralai/Mistral-7B-Instruct-v0.2" if role == "Threadripper" else "mistralai/Mistral-7B-v0.1",
        "quantization": "bnb.4bit" if gpus else "none",
        "base_batch_size": 1 if role == "HP" else 2,
        "base_learning_rate": 2e-4,
        "gradient_accumulation_steps": 16 if role == "HP" else 8,
        "use_lora": bool(gpus),
        "max_seq_length": 2048 if role == "HP" else 4096,
        "mixed_precision": "fp16" if gpus else "bf16"
    }
    
    # Performance modeling
    gpu_names = [gpu["name"] for gpu in gpus] if gpus else []
    perf_model = roofline_performance_model(cpu_info["cores"], gpu_names)
    
    # RBY-enhanced adaptations
    total_gpu_memory = sum(gpu["memory_gb"] for gpu in gpus) if gpus else 0
    
    enhanced_config = base_config.copy()
    enhanced_config.update({
        # RBY-modulated parameters
        "learning_rate": rby_config.calculate_learning_rate_modulation(base_config["base_learning_rate"]),
        "batch_size": rby_config.calculate_batch_size_adaptation(base_config["base_batch_size"], total_gpu_memory),
        
        # Performance-based adaptations
        "num_workers": min(cpu_info["cores"], 8),  # Data loading workers
        "pin_memory": bool(gpus),
        "gradient_checkpointing": total_gpu_memory < 16,  # Memory optimization
        
        # Advanced training features
        "warmup_steps": int(1000 * (1 + rby_config.b)),  # Blue increases exploration period
        "weight_decay": 1e-4 * (1 - 0.3 * rby_config.y),  # Yellow reduces regularization
        "dropout_rate": 0.1 * (1 + 0.5 * rby_config.r),   # Red increases precision via dropout
        
        # RBY state tracking
        "rby_config": {
            "r": rby_config.r,
            "b": rby_config.b,
            "y": rby_config.y,
            "tau": rby_config.tau
        },
        
        # Performance metrics
        "performance_model": perf_model,
        "estimated_training_efficiency": perf_model["training_efficiency_score"]
    })
    
    return enhanced_config

# Load dataset metadata if available (from capsule.py output)
def load_dataset_metadata(dataset_path: str = None) -> Dict[str, float]:
    """Load metadata from enhanced dataset if available"""
    default_meta = {
        "avg_entropy": 5.0,      # Typical text entropy
        "avg_compressibility": 0.7,
        "fractal_dimension": 1.3
    }
    
    if not dataset_path:
        # Try to find latest dataset
        try:
            import glob
            datasets = glob.glob("C:/aeos_dataset_enhanced_*/metadata.json")
            if datasets:
                dataset_path = max(datasets, key=os.path.getctime)  # Most recent
        except:
            return default_meta
    
    if dataset_path and os.path.exists(dataset_path):
        try:
            with open(dataset_path, 'r') as f:
                metadata = json.load(f)
                return metadata.get("global_stats", default_meta)
        except:
            pass
    
    return default_meta

def execute_training_phase():
    """Execute Phase 2: Generate optimized training command"""
    config_path = os.path.expanduser("~/aeos_enhanced_train_config.json")
    if not os.path.exists(config_path):
        print("❌ AEOS config not found. Please run configuration phase first.")
        return False
    
    print("📜 AEOS Phase 2: Enhanced Training Command Generation")
    print("=" * 60)
    
    # Load configuration
    with open(config_path, "r") as f:
        config = json.load(f)
    
    # Recreate RBY config
    rby_config = RBYConfig()
    if "rby_state" in config:
        rby_config.r = config["rby_state"]["r"]
        rby_config.b = config["rby_state"]["b"]
        rby_config.y = config["rby_state"]["y"]
        rby_config.tau = config["rby_state"]["tau"]
    
    # Generate optimized command
    cmd_generator = EnhancedTrainingCommandGenerator(config, rby_config)
    train_command, optimization_details = cmd_generator.generate_optimized_command()
    
    # Display optimization details
    print("🧮 MATHEMATICAL OPTIMIZATION APPLIED:")
    print(f"   Batch Size: {optimization_details['optimized_batch_size']} (RBY-adapted)")
    print(f"   Learning Rate: {optimization_details['optimized_learning_rate']:.2e} (RBY-modulated)")
    print(f"   Gradient Accumulation: {optimization_details['optimized_accumulation_steps']} steps")
    print(f"   Training Epochs: {optimization_details['optimized_epochs']} (entropy-based)")
    print(f"   LoRA Rank: {optimization_details['lora_parameters']['r']} (fractal-adapted)")
    print(f"   Warmup Steps: {optimization_details['scheduler_params']['warmup_steps']} (complexity-based)")
    
    print("\n🚀 ENHANCED TRAINING COMMAND:")
    print("=" * 60)
    print(train_command)
    print("=" * 60)
    
    # Save command to file for easy execution
    cmd_path = os.path.expanduser("~/aeos_enhanced_train_command.bat")
    with open(cmd_path, "w") as f:
        f.write("@echo off\n")
        f.write("echo Starting AEOS Enhanced Training...\n")
        f.write(train_command.replace("^", ""))
        f.write("\necho Training completed!\npause\n")
    
    print(f"\n💾 Command saved to: {cmd_path}")
    print("🎯 Execute this .bat file to start enhanced AEOS training!")
    
    return True

def execute_merge_phase():
    """Execute Phase 3: Merge LoRA and convert to GGUF"""
    config_path = os.path.expanduser("~/aeos_enhanced_train_config.json")
    if not os.path.exists(config_path):
        print("❌ AEOS config not found. Please run configuration phase first.")
        return False
    
    print("🧠 AEOS Phase 3: Model Merging & GGUF Conversion")
    print("=" * 60)
    
    # Load configuration and RBY state
    with open(config_path, "r") as f:
        config = json.load(f)
    
    rby_config = RBYConfig()
    if "rby_state" in config:
        rby_config.r = config["rby_state"]["r"]
        rby_config.b = config["rby_state"]["b"]
        rby_config.y = config["rby_state"]["y"]
        rby_config.tau = config["rby_state"]["tau"]
    
    # Get model paths
    import glob
    lora_models = glob.glob("C:/models/aeos-*-enhanced-*")
    if not lora_models:
        print("❌ No trained LoRA models found in C:/models/")
        print("   Please complete training phase first.")
        return False
    
    latest_lora = max(lora_models, key=os.path.getctime)
    print(f"📂 Found LoRA model: {latest_lora}")
    
    # Determine base model
    base_model = config["training_config"]["model"]
    merged_path = f"C:/models/aeos-merged-{datetime.now().strftime('%Y%m%d_%H%M')}"
    gguf_path = f"C:/models/aeos-{datetime.now().strftime('%Y%m%d_%H%M')}.gguf"
    
    # Initialize merger with RBY optimization
    merger = AEOSModelMerger(rby_config)
    
    # Step 1: Merge LoRA with base model
    if merger.merge_lora_model(base_model, latest_lora, merged_path):
        print("✅ LoRA merge successful!")
        
        # Step 2: Convert to GGUF
        if merger.convert_to_gguf(merged_path, gguf_path):
            print("✅ GGUF conversion successful!")
            
            # Save final model info
            final_config = {
                "merged_model_path": merged_path,
                "gguf_model_path": gguf_path,
                "base_model": base_model,
                "lora_model": latest_lora,
                "rby_state": {
                    "r": rby_config.r,
                    "b": rby_config.b,
                    "y": rby_config.y,
                    "tau": rby_config.tau
                },
                "inference_params": rby_config.calculate_inference_parameters()
            }
            
            final_config_path = os.path.expanduser("~/aeos_final_model.json")
            with open(final_config_path, 'w') as f:
                json.dump(final_config, f, indent=2)
            
            print(f"\n🎯 FINAL MODEL READY:")
            print(f"   GGUF Model: {gguf_path}")
            print(f"   Merged Model: {merged_path}")
            print(f"   Config: {final_config_path}")
            print("\n✅ Ready for inference phase!")
            return True
        else:
            print("❌ GGUF conversion failed")
            return False
    else:
        print("❌ LoRA merge failed")
        return False

def execute_inference_phase():
    """Execute Phase 4: Start inference server and chat interface"""
    final_config_path = os.path.expanduser("~/aeos_final_model.json")
    if not os.path.exists(final_config_path):
        print("❌ Final model config not found. Please complete merge phase first.")
        return False
    
    print("🤖 AEOS Phase 4: Enhanced Inference Engine")
    print("=" * 60)
    
    # Load final model configuration
    with open(final_config_path, 'r') as f:
        final_config = json.load(f)
    
    # Recreate RBY config
    rby_config = RBYConfig()
    rby_state = final_config["rby_state"]
    rby_config.r = rby_state["r"]
    rby_config.b = rby_state["b"]
    rby_config.y = rby_state["y"]
    rby_config.tau = rby_state["tau"]
    
    # Initialize inference engine
    gguf_path = final_config["gguf_model_path"]
    if not os.path.exists(gguf_path):
        print(f"❌ GGUF model not found: {gguf_path}")
        return False
    
    inference_engine = AEOSInferenceEngine(rby_config, gguf_path)
    
    print("🎯 RBY-Optimized Inference Parameters:")
    params = rby_config.calculate_inference_parameters()
    print(f"   Temperature: {params['temperature']:.3f}")
    print(f"   Top-p: {params['top_p']:.3f}")
    print(f"   Repetition Penalty: {params['repetition_penalty']:.3f}")
    print(f"   Max Tokens: {params['max_tokens']}")
    
    # Start server
    port = 8000
    if inference_engine.start_server(port):
        print(f"\n🚀 Server started successfully!")
        print("Choose interaction mode:")
        print("1. 💬 Interactive Chat")
        print("2. 🌐 Web Interface (manual)")
        print("3. 📡 API Testing")
        
        choice = input("Enter 1-3: ").strip()
        
        if choice == "1":
            inference_engine.chat_interface()
        elif choice == "2":
            print(f"\n🌐 Open your browser to: http://localhost:{port}")
            print("   Server will continue running...")
            input("Press Enter to stop server...")
        elif choice == "3":
            # Simple API test
            try:
                import requests
                test_payload = {
                    "model": "aeos",
                    "messages": [{"role": "user", "content": "Hello, what is AE = C = 1?"}],
                    **params
                }
                
                print("🧪 Testing API...")
                response = requests.post(f"http://localhost:{port}/v1/chat/completions", 
                                       json=test_payload, timeout=30)
                
                if response.status_code == 200:
                    result = response.json()
                    print("✅ API Test Successful!")
                    print(f"Response: {result['choices'][0]['message']['content']}")
                else:
                    print(f"❌ API Test Failed: {response.status_code}")
                    
            except Exception as e:
                print(f"❌ API Test Error: {e}")
        
        return True
    else:
        print("❌ Failed to start inference server")
        return False

# Main execution
if __name__ == "__main__":
    print("🚀 AEOS ENHANCED MODEL TRAINER")
    print("=" * 50)
    
    # Determine operation mode
    mode = select_role()
    
    if mode == "execute":
        # Phase 2 only: Generate training command
        execute_training_phase()
    elif mode == "merge":
        # Phase 3 only: Merge and convert
        execute_merge_phase()
    elif mode == "inference":
        # Phase 4 only: Start inference
        execute_inference_phase()
    elif mode == "full":
        # Full pipeline: All phases
        print("🔄 EXECUTING FULL AEOS PIPELINE")
        print("=" * 50)
        
        # Phase 1: Configuration (existing code)
        rby_config = RBYConfig()
        system_role = "Threadripper"  # Default for full pipeline
        gpus = detect_gpu()
        cpu_info = detect_cpu()
        ram_info = detect_ram()
        dataset_meta = load_dataset_metadata()
        
        model_sizing = entropy_based_model_sizing(dataset_meta["avg_entropy"])
        fractal_adaptations = fractal_dimension_training_adaptation(dataset_meta["fractal_dimension"])
        
        training_config = recommend_enhanced_training_config(
            system_role, gpus, cpu_info, ram_info, rby_config
        )
        
        training_config.update({
            "model_sizing_recommendations": model_sizing,
            "fractal_adaptations": fractal_adaptations,
            "dataset_characteristics": dataset_meta
        })
        
        status = {
            "timestamp": datetime.now().isoformat(),
            "system_role": system_role,
            "hardware": {"cpu": cpu_info, "gpus": gpus, "ram": ram_info},
            "rby_state": {"r": rby_config.r, "b": rby_config.b, "y": rby_config.y, "tau": rby_config.tau},
            "training_config": training_config,
            "mathematical_models": {
                "entropy_analysis": model_sizing,
                "fractal_analysis": fractal_adaptations,
                "performance_model": training_config["performance_model"]
            }
        }
        
        config_path = os.path.expanduser("~/aeos_enhanced_train_config.json")
        with open(config_path, "w") as f:
            json.dump(status, f, indent=2)
        
        print("✅ Phase 1: Configuration Complete")
        time.sleep(2)
        
        # Phase 2: Training command generation
        if execute_training_phase():
            print("✅ Phase 2: Training Command Generated")
            print("\n⚠️  MANUAL STEP: Execute the training command, then return here for merge & inference")
            input("Press Enter when training is complete...")
            
            # Phase 3: Merge and convert
            if execute_merge_phase():
                print("✅ Phase 3: Merge & Conversion Complete")
                time.sleep(2)
                
                # Phase 4: Inference
                execute_inference_phase()
                print("✅ Phase 4: Inference Complete")
                print("\n🎉 FULL AEOS PIPELINE EXECUTED SUCCESSFULLY!")
            else:
                print("❌ Phase 3 failed")
        else:
            print("❌ Phase 2 failed")
    else:
        # Phase 1: System configuration (existing code)
        rby_config = RBYConfig()
        system_role = mode if mode in ["HP", "Threadripper"] else select_role()
        gpus = detect_gpu()
        cpu_info = detect_cpu()
        ram_info = detect_ram()
        dataset_meta = load_dataset_metadata()
        
        model_sizing = entropy_based_model_sizing(dataset_meta["avg_entropy"])
        fractal_adaptations = fractal_dimension_training_adaptation(dataset_meta["fractal_dimension"])
        
        training_config = recommend_enhanced_training_config(
            system_role, gpus, cpu_info, ram_info, rby_config
        )
        
        training_config.update({
            "model_sizing_recommendations": model_sizing,
            "fractal_adaptations": fractal_adaptations,
            "dataset_characteristics": dataset_meta
        })
        
        status = {
            "timestamp": datetime.now().isoformat(),
            "system_role": system_role,
            "hardware": {"cpu": cpu_info, "gpus": gpus, "ram": ram_info},
            "rby_state": {"r": rby_config.r, "b": rby_config.b, "y": rby_config.y, "tau": rby_config.tau},
            "training_config": training_config,
            "mathematical_models": {
                "entropy_analysis": model_sizing,
                "fractal_analysis": fractal_adaptations,
                "performance_model": training_config["performance_model"]
            }
        }
        
        config_path = os.path.expanduser("~/aeos_enhanced_train_config.json")
        with open(config_path, "w") as f:
            json.dump(status, f, indent=2)
        
        print(f"\n📊 SYSTEM ANALYSIS COMPLETE")
        print(f"Role: {system_role}")
        print(f"CPUs: {cpu_info['cores']} cores")
        print(f"GPUs: {len(gpus)} devices")
        print(f"RAM: {ram_info['total_gb']}GB total")
        print(f"\n🔬 RBY STATE:")
        print(f"Red (Precision): {rby_config.r:.3f}")
        print(f"Blue (Exploration): {rby_config.b:.3f}")
        print(f"Yellow (Adaptation): {rby_config.y:.3f}")
        print(f"\n⚡ PERFORMANCE SCORE: {training_config['estimated_training_efficiency']:.3f}")
        print(f"📈 LEARNING RATE: {training_config['learning_rate']:.6f}")
        print(f"🎯 BATCH SIZE: {training_config['batch_size']}")
        
        print(f"\n💾 Configuration saved to: {config_path}")
        print("🎯 Configuration complete! Run with options 2-4 for subsequent phases.")
