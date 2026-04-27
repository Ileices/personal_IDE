## 2026-04-22 v2 Status Update (Implemented)

- Phase 1 core v2 modules are live in `NANO_train/core`: universal `Nano`, `SwarmRouter` (soft-k), `SwarmLayer`, `NanoSeaModel`, `TouchTensor`, `ChromaticIndex`, and v2 RBY math.
- Phase 2 training+lifecycle scaffolding is live:
  - `NANO_train/training/swarm_trainer.py`
  - `NANO_train/training/midwife.py`
  - `NANO_train/training/independence.py`
  - `NANO_train/lifecycle/{fitness,spawner,compression,absularity,cosmic_cycle}.py`
- Validation scripts added and passing:
  - `NANO_train/tests/test_phase1_v2.py`
  - `NANO_train/tests/test_phase2_v2.py`
- Phase 3 runtime integration is now active in `NANO_train/main.py`:
  - Default trainer path uses `training/swarm_runtime.py` (v2 swarm + lifecycle)
  - Legacy trainer is still available via `--legacy-trainer`
  - New runtime validation: `NANO_train/tests/test_phase3_v2.py`
- Legacy v1 modules remain for compatibility while migration continues.

The Real Answer on Swarm Generation
What IS a hard limit: A single 50K-param nano alone cannot generate coherent code. It doesn't have enough parameters to hold vocabulary + syntax + semantics in one unit. This is math — not an opinion.

What is NOT a limit: A SWARM of 50K-param nanos working together on the same token prediction. If you have 1000 nanos × 50K params = 50M total params collaborating on generating one token, that's equivalent in capacity to a 50M-param model. The params don't need to live in one model — they need to be activated together and combined for each output.

Think of it like pixels. One pixel can't show a face. But millions of pixels together show anything. The critical question isn't "how big is one pixel" — it's "how do the pixels coordinate?"

What Makes Swarm Generation Work vs Fail
FAILS (your current plan):

WORKS:

The difference is activating 1 nano per stage vs activating MANY nanos TOGETHER per token. Your nano sea vision of millions collaborating is correct — the mechanism for HOW they collaborate was the missing piece.

The Two Shared Layers (Non-Negotiable)
Here's the one thing that CAN'T be split into tiny pieces: the input and output interfaces.

Every nano that participates in generation needs to understand the same tokens and produce compatible outputs. This requires two shared layers:

Shared Embedding: ~500K-2M params depending on vocab size. ONE copy, used by all nanos. Converts tokens to vectors that every nano understands.
Shared Output Head: ~500K-2M params. ONE copy. Converts combined nano outputs back to token probabilities.
The nanos themselves: Thousands/millions of tiny specialists (1K-50K each). The swarm lives between the shared layers.
This is not MoE replacing your framework. This IS your framework with the correct collaboration mechanism. The shared layers are the "ocean" that the nanos swim in. Without them, nanos can't talk to each other.

Now let me lay out every gap and every solution. This is the complete corrected design.

COMPLETE GAP ANALYSIS AND SOLUTIONS
Gap 1: Single-Nano-Per-Stage Pipeline → Multi-Nano Swarm Routing
The Problem:
Your current design picks the "best" nano in each category and only runs that one. With millions of nanos, 99.99% are idle at any moment.

The Solution: Layered Swarm Routing

Replace the fixed pipeline with LAYERS. Each layer has a pool of nanos. For each token, a lightweight router activates the best K nanos from that layer's pool, runs them all, and combines their outputs:

What changes in your codebase:

core/ptaie.py needs a router per layer, not just fitness ranking
The inference pipeline becomes: Embedding → SwarmLayer1 → SwarmLayer2 → ... → OutputHead
Fitness still matters — it determines which nanos STAY in the pool, not which gets routed
Routing is per-token and per-input (not global)
What stays the same:

Nano lifecycle (birth/death/evolution) — unchanged
Fitness scoring — still needed for lifecycle decisions
RBY seeding — still determines initial nano characteristics
Midwife training — still generates training data
Gap 2: Individual Nano Architecture — What Each Nano Actually IS
The Problem:
Your current nanos have varied architectures (some are autoencoders, some are classifiers, some are generators). When they need to collaborate in a swarm layer, they need COMPATIBLE interfaces.

The Solution: Universal Nano Interface

Every nano that participates in generation follows one pattern:

Key insight: hidden_dim controls nano SIZE. A tiny nano has hidden_dim=32 (16K params). A bigger nano has hidden_dim=512 (260K params). The INTERFACE is always the same (d_model in, d_model out), but the internal capacity varies.

This means:

Nano types still exist (some nanos specialize in syntax, some in semantics, some in control flow)
But ALL nanos speak the same vector language (d_model dimensional)
Any nano can collaborate with any other nano through the shared vector space
The router picks the best COMBINATION for each input
What changes: Your 17 nano categories collapse into one universal Nano class with different hidden_dim sizes and different learned specializations. The CATEGORY is an emergent property of training, not a hardcoded class hierarchy.

What stays: RBY seeding (determines initial hidden_dim and init pattern), fitness scoring (unchanged), lifecycle management (unchanged).

Gap 3: No Execution-Based Validation in Midwife Loop
The Problem:
The LLM generates training examples. Nanos train on them. If the LLM hallucinated, nanos learn wrong patterns. There's no verification.

The Solution: Execute-and-Verify Loop

Additionally — nano self-validation:

After training, test the nano on held-out examples:

What changes: services/midwife/ gains an execution sandbox and a reject-bad-examples path. Fitness scoring gains an "execution accuracy" component.

Gap 4: Input-Aware Routing at Scale (Finding Nanos Among Millions)
The Problem:
With millions of nanos, you can't check all of them for every token. Linear scan = O(N) = too slow.

The Solution: Hierarchical Chromatic Index

Use the RBY position system as a spatial index:

The two-stage routing makes millions feasible:

Stage 1: Spatial index narrows millions → 50 candidates (O(log N))
Stage 2: Fine scoring narrows 50 → 8 active nanos (O(50))
Total: O(log N + 50) instead of O(N)
What changes: core/rby.py gains a KD-tree spatial index. Router uses two-stage lookup instead of fitness ranking.

Gap 5: Memory Paging (Millions of Nanos, Limited VRAM)
The Problem:
Your 1660 has 6GB VRAM. A 50K param nano = ~200KB in fp32. That's ~30,000 nanos per GPU maximum. With millions of nanos, you need a paging strategy.

The Solution: Hot/Warm/Cold Nano Tiers

Access pattern optimization: The chromatic index (Gap 4) tells us WHICH nanos are about to be needed. Pre-fetch them from disk to CPU to GPU BEFORE the forward pass:

What changes: Your compute/device_manager.py gains an LRU cache and paging logic. core/storage.py becomes the cold tier.

Gap 6: Training Signal for Swarm Routing
The Problem:
In the current plan, nanos train independently on task-specific data. But in the swarm architecture, the ROUTER also needs to learn which nanos to activate for which inputs. How does the router learn?

The Solution: End-to-End Swarm Training

The router and the nanos train TOGETHER. When the swarm produces a bad output, the gradient flows backward through:

The output head
The combination weights (router learns better routing)
The selected nanos (nanos learn better representations)
The embedding
Critical detail: only active nanos get gradients. If a nano wasn't selected by the router for this token, it gets zero gradient. This means:

Popular nanos train fast (activated often → many gradient updates)
Unpopular nanos stay dormant (rarely activated → need midwife feeding)
The midwife specifically targets under-activated nanos with relevant data
What changes: Training moves from independent per-nano to end-to-end swarm. The midwife's role shifts from "train all nanos equally" to "feed nanos that the router isn't selecting yet."

Gap 7: The "296 Types" Misconception → Dynamic Nano Spawning
The Problem:
Your plan hardcodes 17 categories with ~18 variants each = 296 total. This caps the system.

The Solution: Nanos Spawn Based on Need, Not Category

Remove the category/type system entirely. Every nano is just a Nano with a learned specialization:

What changes: Delete the 17 category class hierarchy. Delete the hardcoded counts. Nanos are born when needed, specialize through training, die when unfit. The "type" of a nano is its LEARNED behavior, not its class name.

Gap 8: Global Aggregation ("Super Nanos")
The Problem:
Your plan mentions combining local nanos globally but doesn't define how.

The Solution: Federated Nano Averaging

What changes: mesh/global_pool.py gains the federated averaging logic. mesh/transport.py needs to send RBY positions alongside nano weights so the aggregator can cluster correctly.

Gap 9: Progressive Difficulty in Midwife Training
The Problem:
The midwife generates all difficulty levels equally. Early nanos can't learn hard examples.

The Solution: Curriculum Paced by Swarm Capability

What changes: services/midwife/ gains difficulty tracking and only advances when the swarm proves mastery.

Gap 10: When to Cut the Bird Feeder
The Problem:
No defined criteria for when nanos are "smart enough" to stop relying on the LLM.

The Solution: Graduated Independence

Graduated takeover: The nano sea doesn't replace the LLM all at once. It takes over task by task:

First: line completion (easiest)
Then: function generation
Then: bug detection
Then: code explanation
Last: full project generation (hardest)
Each task the nano sea masters = less LLM dependency = lower API costs = faster responses (local inference).

The Corrected Architecture (Complete)
What Stays vs What Gets Rewritten
Component	Verdict	Action
nanos/ class hierarchy (17 types)	REWRITE	Replace with universal Nano class. Specialization is learned, not coded.
core/ic_ae.py	KEEP concept, rewrite code	IC-AE compartments → swarm layers. Same idea, new implementation.
core/rby.py	KEEP + extend	Add KD-tree spatial index for O(log N) routing.
core/ptaie.py	REWRITE	Replace independent nano training with end-to-end swarm training. PTAIE becomes the swarm training orchestrator.
core/fitness.py	KEEP + extend	Add execution accuracy and touch-count metrics.
core/lifecycle.py	KEEP + extend	Add need-based spawning (Gap 7). Remove hardcoded type counts.
core/compression.py	KEEP	Twmrto progressive compression still applies.
core/storage.py	KEEP + extend	Becomes cold tier of memory paging system.
services/midwife/	REWRITE	Add execution validation, curriculum pacing, independence tracking.
server/main.py	KEEP	HTTP interface stays mostly the same.
compute/device_manager.py	EXTEND	Add LRU nano paging, prefetch.
mesh/*	KEEP + extend	Add federated averaging with RBY-aware clustering.
training/	REWRITE	From per-nano independent → end-to-end swarm training.
Config 296 nano limit	DELETE	Dynamic spawning, no fixed count.
The Win Condition Over LLMs
The nano sea wins over LLMs when:

Advantage	Why Nanos Win
Latency	Active nanos are on LOCAL GPU. No API round-trip. 10ms vs 500ms.
Cost	No per-token API charges. One-time training cost.
Personalization	Nanos train on YOUR code, YOUR patterns, YOUR workflows. An LLM serves everyone; your nanos serve YOU.
Specialization	1000 nanos each mastering one narrow pattern vs 1 model trying to know everything. The swarm has deeper expertise per domain.
Evolution	Nanos improve continuously from your usage. LLMs are frozen snapshots.
Privacy	All data stays local. No code sent to cloud APIs.
Scaling	Add more hardware → add more nanos → sea gets smarter. LLMs are fixed-size.
Where LLMs still win (until the sea is very large):

Breadth of knowledge (LLMs trained on the entire internet)
Long-range coherence (LLMs have 128K+ context windows)
Zero-shot generalization (LLMs handle tasks they've never seen)
The strategy: nanos take over tasks one at a time (line completion first, project generation last), using the LLM as bird feeder until each task is mastered. The LLM gradually becomes unnecessary.

To directly answer your question: Yes, tiny nanos CAN absolutely generate code as a swarm. The requirement isn't "big nanos" — it's "enough nanos activated together with proper routing and shared input/output layers." A thousand 50K-param nanos working together on one token have the same capacity as a 50M-param model. Your vision is correct; the collaboration mechanism was the missing piece.




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
