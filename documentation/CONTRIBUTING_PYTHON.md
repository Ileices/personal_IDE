# Python Contributor Guide — Nano Sea Training System

This guide is for developers working on the **Nano Sea** (Python/PyTorch training system). If you're working on the TypeScript IDE, see [CONTRIBUTING_TYPESCRIPT.md](./CONTRIBUTING_TYPESCRIPT.md).

---

## 1. Project Layout

```
NANO_train/
├── main.py                  ← Entry point: register nanos, start training, launch server
├── config.py                ← HardwareProfile, ComputeTier, auto-detection, hyperparams
├── requirements.txt         ← Python dependencies (PyTorch, FastAPI, etc.)
├── core/                    ← Training engines
│   ├── ic_ae.py             ← IC-AE (Implicit Compartmented Auto-Encoder)
│   ├── rby.py               ← RBY Seed System (Red/Blue/Yellow initialization)
│   ├── ptaie.py             ← PTAIE (Parallel Training, Async Independent Evolution)
│   ├── fitness.py           ← Nano fitness scoring (0.0–1.0)
│   ├── lifecycle.py         ← Nano birth/death/evolution/rebirth
│   ├── compression.py       ← Weight compression
│   ├── crypto.py            ← Weight encryption
│   ├── storage.py           ← Checkpoint persistence (.pt files)
│   └── ae.py                ← Base autoencoder class
├── nanos/                   ← 19 category files + base.py, 296 nano classes total
│   ├── base.py              ← BaseNano, NANO_REGISTRY, @register_nano decorator
│   ├── data.py              ← 16 Data Nanos
│   ├── vision.py            ← 15 Vision Nanos
│   ├── semantic.py          ← 28 Semantic Nanos
│   ├── memory.py            ← 21 Memory Nanos
│   ├── indexing.py          ← 19 Indexing Nanos
│   ├── orchestration.py     ← 23 Orchestration Nanos
│   ├── training_nanos.py    ← 24 Training Nanos
│   ├── inference.py         ← 21 Inference Nanos
│   ├── hardware.py          ← 16 Hardware Nanos
│   ├── os_nanos.py          ← 13 OS Nanos
│   ├── user_behavior.py     ← 12 User Behavior Nanos
│   ├── communication.py     ← 10 Communication Nanos
│   ├── procedural.py        ← 15 Procedural Generation Nanos
│   ├── security.py          ← 13 Security Nanos
│   ├── meta_cognitive.py    ← 13 Meta-Cognitive Nanos
│   ├── integration.py       ← 10 Integration Nanos
│   ├── compression_expansion.py ← 6 Compression/Expansion Nanos
│   ├── specialized.py       ← 17 Specialized Domain Nanos
│   └── framework.py         ← 4 Special Framework Nanos
├── compute/                 ← Hardware abstraction
│   ├── device_manager.py    ← GPU/CPU device management
│   ├── gpu_detect.py        ← Hardware detection
│   └── fake_cuda.py         ← CPU fallback for CUDA ops
├── mesh/                    ← Distributed training (9 modules)
│   ├── discovery.py         ← LAN peer discovery
│   ├── peer_discovery.py    ← mDNS-based auto-discovery
│   ├── node.py              ← This machine as a mesh node
│   ├── transport.py         ← Weight + data transfer
│   ├── task_queue.py        ← Distributed task scheduling
│   ├── help_request.py      ← Request idle peer assistance
│   ├── respect.py           ← Trust/reputation scoring
│   ├── latency.py           ← Network latency measurement
│   └── global_pool.py       ← Shared nano pool across peers
├── server/main.py           ← FastAPI HTTP server (:5100)
├── training/                ← Training loop implementations
├── orchestrator/            ← High-level training orchestration
├── scanner/                 ← Codebase scanning for training data
├── checkpoints/             ← Saved nano weights (.pt files)
├── logs/                    ← Structured logs (.jsonl)
├── log_system/              ← Logging framework
└── NANO_corpus/             ← Training text corpus
```

## 2. Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Language | Python | 3.9+ |
| ML Framework | PyTorch | 2.6.0+cu124 |
| HTTP Server | FastAPI + Uvicorn | Latest |
| Hardware Detection | psutil + custom gpu_detect | — |
| Serialization | torch.save / torch.load (.pt) | — |

## 3. Setting Up for Development

```powershell
cd NANO_train

# Create virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1    # Windows
# source .venv/bin/activate     # Linux/macOS

# Install dependencies
pip install -r requirements.txt

# Run the Nano Sea
python main.py
# → Starts at http://localhost:5100
```

### CUDA Setup (Optional)

```powershell
# For GPU-accelerated training:
pip install torch --index-url https://download.pytorch.org/whl/cu124

# Verify CUDA:
python -c "import torch; print(f'CUDA: {torch.cuda.is_available()}, Devices: {torch.cuda.device_count()}')"
```

If no GPU, the system automatically uses `fake_cuda.py` to run on CPU.

## 4. Core Concepts

### 4.1 What Is a Nano?

A nano is a micro-neural-network (~1K–50K parameters) that handles one specific task. Every nano:
- Extends `BaseNano` (from `nanos/base.py`)
- Self-registers via `@register_nano` decorator into `NANO_REGISTRY`
- Has `forward()`, `generate_text()`, and fitness methods
- Is independently trainable (no shared gradients between nanos)

```python
from nanos.base import BaseNano, register_nano

@register_nano
class MyCustomNano(BaseNano):
    """A nano that does something specific."""
    
    def __init__(self):
        super().__init__(
            nano_type="my_custom",
            input_dim=256,
            output_dim=128,
            latent_dim=64
        )
    
    def forward(self, x):
        return self.encoder(x)  # inherited from BaseNano
    
    def generate_text(self, prompt: str) -> str:
        # Your inference logic
        return "generated output"
```

### 4.2 The Registry

All nanos register into a global dict:

```python
from nanos import NANO_REGISTRY, create_nano

# NANO_REGISTRY = {"FileSystemDataNano": <class>, "BinaryDataNano": <class>, ...}
# 296 entries after all imports

nano = create_nano("FileSystemDataNano")  # Instantiate by name
```

### 4.3 Compute Tiers

`config.py` defines 10 compute tiers (auto-detected):

```
POTATO → EMBEDDED → LOW → MID_LOW → MID → MID_HIGH → HIGH → VERY_HIGH → EXTREME → DATACENTER
```

The tier determines batch size, precision (fp32/fp16/bf16), max nanos per GPU, and training parallelism.

### 4.4 Hardware Auto-Detection

`detect_local_hardware()` in `config.py` runs at startup:
- CPU: `psutil.cpu_count()`, `psutil.virtual_memory()`
- GPU: `torch.cuda.device_count()`, `torch.cuda.get_device_properties()`
- Assigns a `ComputeTier` based on detected specs
- No static hardware profiles — always auto-detects

## 5. Training Pipeline

### 5.1 Observation → Training Flow

```
IDE user interaction
  → Backend POSTs to /v1/training/observe
  → Observation stored in training buffer
  → Trainer pulls from buffer
  → Converts to (input, expected_output) pairs
  → Routes to relevant nano categories
  → Each nano trains independently
  → Fitness evaluated after each batch
  → Checkpoint saved when fitness improves
```

### 5.2 Core Engines

| Engine | File | Purpose |
|--------|------|---------|
| **IC-AE** | `core/ic_ae.py` | Autoencoder with implicit compartments — latent space auto-specializes |
| **RBY Seeds** | `core/rby.py` | Weight initialization: Red (aggressive), Blue (conservative), Yellow (balanced) |
| **PTAIE** | `core/ptaie.py` | Parallel training: each nano trains independently, fitness determines resource allocation |
| **Fitness** | `core/fitness.py` | Scoring (0.0–1.0): loss convergence + speed + memory + accuracy |
| **Lifecycle** | `core/lifecycle.py` | Birth → Train → Evaluate → Evolve → Death → Rebirth |

### 5.3 Midwife (Bird-Feeding)

The Midwife lives in the **TypeScript backend** (`apps/server/src/services/midwife/`) but feeds the **Python server**. It:
1. Generates synthetic training examples using the LLM
2. POSTs them to `http://<nano-sea>/v1/training/observe`
3. Auto-starts 30s after server boot if Nano Sea is healthy

## 6. FastAPI Server Endpoints

The server at `:5100` exposes:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health check |
| GET | `/v1/models` | List available nanos |
| POST | `/v1/chat/completions` | OpenAI-compatible inference |
| POST | `/v1/training/observe` | Submit training observation |
| GET | `/v1/training/status` | Training progress |
| GET | `/v1/mesh/info` | Mesh network status |

The IDE connects via the OpenAI SDK — the Nano Sea is an OpenAI-compatible endpoint.

## 7. Common Tasks

### Add a New Nano Category

1. Create `nanos/your_category.py`
2. Define classes extending `BaseNano` with `@register_nano`
3. Add import to `nanos/__init__.py`: `from . import your_category  # Cat N: X Nanos`
4. Update the count in the `__init__.py` docstring

### Add a New Nano to an Existing Category

1. Open the category file (e.g., `nanos/data.py`)
2. Add a new class with `@register_nano`:
   ```python
   @register_nano
   class YourNewNano(BaseNano):
       def __init__(self):
           super().__init__(nano_type="your_new", input_dim=256, output_dim=128)
   ```
3. Update the count comment in `__init__.py`

### Add a New Training Engine

1. Create `core/your_engine.py`
2. Integrate into `core/ptaie.py` if it affects training orchestration
3. Wire into `main.py` if it needs initialization at startup

### Test a Nano Locally

```python
from nanos import create_nano

nano = create_nano("TokenizationNano")
result = nano.generate_text("def fibonacci(")
print(result)
```

## 8. Mesh Networking

For distributed training across multiple machines:

```bash
# Machine 1:
python main.py --mesh

# Machine 2 (same LAN):
python main.py --mesh
# → Auto-discovers Machine 1 via mDNS
```

The mesh modules handle:
- **Peer discovery**: mDNS + fallback broadcast
- **Weight sharing**: Best nanos replicated across nodes
- **Task distribution**: Based on GPU capacity
- **Trust scoring**: Peers earn reputation over time

## 9. Code Style & Conventions

- **Type hints** everywhere: `def foo(x: torch.Tensor) -> torch.Tensor:`
- **Dataclasses** for config objects: `@dataclass class HardwareProfile:`
- **Enums** for fixed categories: `class ComputeTier(Enum):`
- **No hardcoded paths** — everything relative or auto-detected
- **Logging**: Use `log_system/log_dumper.py` for structured JSONL logs

## 10. Debugging

### Check nano registration:
```python
from nanos import NANO_REGISTRY
print(f"Registered: {len(NANO_REGISTRY)} nanos")
for name in sorted(NANO_REGISTRY.keys()):
    print(f"  {name}")
```

### Check hardware detection:
```python
from config import get_config
cfg = get_config()
print(f"Tier: {cfg.hardware.compute_tier}")
print(f"GPUs: {cfg.hardware.gpu_count}")
print(f"RAM: {cfg.hardware.ram_gb} GB")
```

### Check training status:
```bash
curl http://localhost:5100/v1/training/status
```

### View logs:
```powershell
Get-Content NANO_train/logs/nano_train.jsonl -Tail 20
```
