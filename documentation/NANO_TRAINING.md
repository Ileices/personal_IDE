# Nano Sea Training System — Complete Technical Reference

## 1. Concept: Sea of Nanos

The Nano Sea is a collection of **296 micro-neural-networks** (nanos) organized into **19 functional categories**. Each nano is a tiny PyTorch model (~1K–50K parameters) that specializes in one specific task within the code intelligence pipeline.

The philosophy: instead of one massive model, train hundreds of specialized micro-models that collaborate.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   Nano Sea (:5100)                       │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │ Tokenize │→ │  Embed   │→ │  Parse   │             │
│  │  Nanos   │  │  Nanos   │  │  Nanos   │             │
│  └──────────┘  └──────────┘  └──────────┘             │
│       │              │              │                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │  Search  │→ │  Rank    │→ │ Context  │             │
│  │  Nanos   │  │  Nanos   │  │ Assembly │             │
│  └──────────┘  └──────────┘  └──────────┘             │
│       │              │              │                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │  Route   │→ │ Generate │→ │ Validate │             │
│  │  Nanos   │  │  Nanos   │  │  Nanos   │             │
│  └──────────┘  └──────────┘  └──────────┘             │
│                                                         │
│  ┌──────────────────────────────────────────────┐      │
│  │  Training Pipeline                            │      │
│  │  Midwife → Observe → Trainer → Checkpoints   │      │
│  └──────────────────────────────────────────────┘      │
│                                                         │
│  ┌──────────────────────────────────────────────┐      │
│  │  Core Engines                                 │      │
│  │  IC-AE · RBY Seeds · PTAIE · Fitness · Life  │      │
│  └──────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Nano Categories (17 types, ~296 total nanos)

| Category | Class Prefix | Count | Purpose |
|----------|-------------|-------|---------|
| **TokenizationNano** | `Tokenization` | ~18 | Convert raw text to token sequences |
| **EmbeddingNano** | `Embedding` | ~18 | Dense vector representations of code |
| **QueryParserNano** | `QueryParser` | ~18 | Parse user queries into structured intent |
| **QueryExpanderNano** | `QueryExpander` | ~18 | Expand queries with synonyms/related terms |
| **QueryRouterNano** | `QueryRouter` | ~18 | Route queries to appropriate handler nanos |
| **SearchNano** | `Search` | ~18 | Search code index for relevant snippets |
| **RankNano** | `Rank` | ~18 | Rank search results by relevance |
| **ContextAssemblerNano** | `ContextAssembler` | ~18 | Assemble ranked results into coherent context |
| **CodeCompletionNano** | `CodeCompletion` | ~18 | Generate code completions |
| **TokenGeneratorNano** | `TokenGenerator` | ~18 | Generate output tokens |
| **ResponseValidatorNano** | `ResponseValidator` | ~18 | Validate generated responses |
| **ResponseFormatterNano** | `ResponseFormatter` | ~18 | Format responses for presentation |
| **CompressionNano** | `Compression` | ~10 | Compress model weights and data |
| **CryptoNano** | `Crypto` | ~10 | Encrypt/decrypt model data |
| **FitnessNano** | `Fitness` | ~10 | Evaluate nano performance scores |
| **LifecycleNano** | `Lifecycle` | ~10 | Manage nano birth/death/evolution |
| **StorageNano** | `Storage` | ~10 | Persist and load nano states |

Each nano category has multiple variants (e.g., `TokenizationNano_v1` through `TokenizationNano_v18`), and nanos are spawned by scanning the `nanos/` directory for Python files with matching class names.

---

## 4. Core Engines

### 4.1 IC-AE (Implicit Compartmented Auto-Encoder)

File: `core/ic_ae.py`

The IC-AE is the foundational training architecture. It works like a standard autoencoder but with **implicit compartments** — sections of the latent space that naturally specialize through training.

Key parameters:
- `latent_dim`: 64 (default)
- `compartments`: 8
- Learning rate: adaptive per compartment
- Loss: reconstruction + compartment orthogonality + sparsity

### 4.2 RBY Seed System

File: `core/rby.py`

RBY (Red-Blue-Yellow) seeds are initialization patterns for nano weights:
- **Red**: Aggressive learning (high LR, wide init)
- **Blue**: Conservative learning (low LR, narrow init)
- **Yellow**: Balanced (medium LR, Xavier init)

Each nano type has a preferred seed color based on its task:
- Tokenization/Embedding → Blue (precision matters)
- Search/Rank → Red (exploration helps)
- Generation/Completion → Yellow (balance needed)

### 4.3 PTAIE (Parallel Training with Asynchronous Independent Evolution)

File: `core/ptaie.py`

PTAIE manages parallel training of all 296 nanos:
- Each nano trains independently (no global gradient)
- Fitness scores determine resource allocation
- Top performers get more training steps
- Low performers get reinitialized with new seeds
- Cross-pollination: best-performing weights are shared as initialization hints

### 4.4 Fitness Evaluation

File: `core/fitness.py`

Each nano gets a fitness score (0.0 – 1.0) based on:
- **Loss convergence**: Is the loss decreasing?
- **Inference speed**: How fast does it process input?
- **Memory usage**: How much GPU/CPU memory does it consume?
- **Task accuracy**: For nanos with testable outputs, how correct are they?

Fitness determines:
- Training priority (more steps for high-fitness nanos)
- Pruning candidates (lowest fitness get replaced)
- Checkpoint worthiness (only save nanos above 0.5 fitness)

### 4.5 Lifecycle Management

File: `core/lifecycle.py`

Manages the full nano lifecycle:
1. **Birth**: Create nano with appropriate seed (RBY)
2. **Training**: Feed training data, compute gradients
3. **Evaluation**: Score fitness
4. **Evolution**: Mutate weights of successful nanos
5. **Death**: Remove consistently low-performing nanos
6. **Rebirth**: Respawn with new seed, inheriting some parent weights

---

## 5. Training Pipeline

### 5.1 Data Flow

```
User interaction in IDE
  → Backend records observation → POST /v1/training/observe
  → Nano Sea stores observation in training buffer
  → Trainer picks observations from buffer
  → Converts to training pairs (input → expected output)
  → Distributes to relevant nano categories
  → Each nano trains on its task-specific data
  → Fitness evaluation after each batch
  → Checkpoint saved when fitness improves
```

### 5.2 Midwife System (Bird-Feeding)

The Midwife (in the Fastify backend, `services/midwife/`) generates synthetic training data for nanos. It "feeds" the nanos like a mother bird feeds chicks.

**How it works**:
1. Midwife picks a task type (code completion, search, parsing, etc.)
2. Generates synthetic examples using the LLM (GitHub Models)
3. Sends examples to Nano Sea as training observations
4. Nano Sea distributes to relevant nano categories

**Configuration**:
- `enabled`: true (auto-starts 30s after server boot)
- `tasksPerRound`: 5
- `roundIntervalMs`: 60000 (1 minute between rounds)
- `taskTypes`: 12 types covering all pipeline nanos

**Auto-Start**: On server boot, the midwife waits 30 seconds, then checks if the Nano Sea is healthy (GET /health). If healthy, begins a feeding session automatically.

### 5.3 Priority Nanos (12 pipeline-critical)

These nanos form the core inference pipeline and receive training priority:

1. `TokenizationNano` — Text to tokens
2. `EmbeddingNano` — Token to vector
3. `QueryParserNano` — Query structure
4. `SearchNano` — Code search
5. `CodeCompletionNano` — Code generation
6. `TokenGeneratorNano` — Token output
7. `QueryExpanderNano` — Query expansion
8. `QueryRouterNano` — Query routing
9. `RankNano` — Result ranking
10. `ContextAssemblerNano` — Context building
11. `ResponseValidatorNano` — Output validation
12. `ResponseFormatterNano` — Output formatting

### 5.4 Training Observations

Observations are sent via `POST /v1/training/observe` with this format:
```json
{
  "type": "code_completion",
  "input": "def fibonacci(",
  "expected_output": "def fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)",
  "metadata": {
    "language": "python",
    "source": "midwife",
    "task_type": "completion"
  }
}
```

---

## 6. Inference Pipeline

When a user query goes through the Nano Sea instead of an external LLM:

```
1. Tokenization   → Convert text to token IDs
2. Embedding      → Create dense vector representation
3. Query Parsing  → Extract intent, entities, constraints
4. Query Expansion → Add synonyms and related terms
5. Query Routing  → Determine which nanos should handle
6. Search         → Find relevant code snippets
7. Ranking        → Score and sort results
8. Context Assembly → Build coherent context from results
9. Code Generation → Generate completion/response
```

Each stage is handled by the nano category of that name. Within a category, the highest-fitness nano handles the request.

### 6.1 Inference Fallback

If the full pipeline fails (common early in training):
1. Try individual `CodeCompletionNano.generate_text(prompt)` directly
2. Try individual `TokenGeneratorNano.generate_text(prompt)` directly
3. Return informative message: "Nano Sea has {N}/{total} trained nanos. Training in progress."

---

## 7. Compute Infrastructure

### 7.1 Device Manager (`compute/device_manager.py`)

Detects and manages compute devices:
- Scans for CUDA GPUs via `torch.cuda`
- Falls back to CPU if no GPU available
- On multi-GPU systems: distributes nanos across GPUs evenly
- Supports any CUDA, ROCm, DirectML, Vulkan, OpenCL, or MPS device

### 7.2 GPU Detection (`compute/gpu_detect.py`)

```python
# Detects:
# - GPU model name
# - VRAM total/free
# - CUDA compute capability
# - Driver version
# Returns list of DeviceInfo objects
```

### 7.3 Fake CUDA (`compute/fake_cuda.py`)

For development without a GPU, provides mock CUDA operations that execute on CPU. Enabled automatically when `torch.cuda.is_available()` returns False.

---

## 8. Mesh Networking

The mesh system enables distributed training across multiple machines.

### 8.1 Components

| File | Purpose |
|------|---------|
| `mesh/discovery.py` | Find other Nano Sea instances on the LAN |
| `mesh/peer_discovery.py` | mDNS-based automatic peer finding |
| `mesh/node.py` | Represent this machine as a mesh node |
| `mesh/transport.py` | Send/receive nano weights and training data |
| `mesh/task_queue.py` | Distributed task scheduling |
| `mesh/help_request.py` | Request help from idle peers |
| `mesh/respect.py` | Trust/reputation scoring for peers |
| `mesh/latency.py` | Network latency measurement |
| `mesh/global_pool.py` | Shared nano pool across all peers |

### 8.2 Distributed Training

When multiple machines run Nano Sea:
1. Each machine discovers peers via mDNS
2. Nanos are distributed across machines based on GPU capacity
3. Training data is shared via the mesh transport
4. Best-performing nanos are replicated to other nodes
5. Global pool maintains a combined view of all nanos

---

## 9. File Structure

```
NANO_train/
├── main.py              ← Entry point: register nanos, start training, launch server
├── config.py            ← Hardware profiles, hyperparameters, paths
├── requirements.txt     ← Python dependencies
├── server/main.py       ← FastAPI HTTP server (:5100)
├── core/
│   ├── ic_ae.py         ← IC-AE autoencoder engine
│   ├── rby.py           ← RBY seed initialization
│   ├── ptaie.py         ← Parallel training orchestrator
│   ├── fitness.py       ← Nano fitness scoring
│   ├── lifecycle.py     ← Nano birth/death/evolution
│   ├── compression.py   ← Weight compression
│   ├── crypto.py        ← Weight encryption
│   ├── storage.py       ← Checkpoint persistence
│   └── ae.py            ← Base autoencoder class
├── compute/
│   ├── device_manager.py ← GPU/CPU device management
│   ├── gpu_detect.py     ← Hardware detection
│   └── fake_cuda.py      ← CPU fallback for CUDA ops
├── mesh/                 ← Distributed training networking
├── nanos/                ← Nano class definitions (Python files)
├── training/             ← Training loop implementations
├── orchestrator/         ← High-level training orchestration
├── scanner/              ← Codebase scanning for training data
├── checkpoints/          ← Saved nano weights (.pt files)
├── logs/                 ← Training logs (.jsonl files)
├── log_system/           ← Structured logging
└── NANO_corpus/          ← Training text corpus
```

---

## 10. Configuration (`config.py`)

Key configuration sections:

### 10.1 Hardware Auto-Detection

Hardware is detected automatically at startup — no static profiles. The `detect_local_hardware()` function in `config.py` uses `psutil`, `torch`, and `gpu_detect.py` to build a `HardwareProfile`:

```python
# Auto-detected at runtime:
#   cpu_cores, ram_gb, gpu_count, gpu_models, vram_per_gpu
#   compute_tier (POTATO → DATACENTER, 10 tiers)
#   precision (fp32 / fp16 / bf16 based on GPU capability)
#   batch_size (scaled to available VRAM)
```

The system adapts to any hardware — from a Raspberry Pi (CPU-only, fp32, batch_size=1) to a multi-GPU datacenter node (bf16, batch_size=256+).
```

### 10.2 Training Hyperparameters

```python
TRAINING = {
    "learning_rate": 0.001,
    "batch_size": 32,
    "epochs_per_round": 5,
    "checkpoint_interval": 100,  # steps
    "fitness_threshold": 0.5,    # min to keep
    "pruning_interval": 1000,    # steps
    "evolution_rate": 0.1        # mutation strength
}
```

### 10.3 Server Configuration

```python
SERVER = {
    "host": "0.0.0.0",
    "port": 5100,
    "workers": 1
}
```
