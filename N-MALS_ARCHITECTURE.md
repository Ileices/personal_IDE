# N-MALS: Nano Model Architecture for Learning Systems
## Personal IDE — Production Architecture Specification

> **Last updated**: February 2026  
> **Status**: Active Development  
> **Codebase**: [github.com/Ileices/personal_IDE](https://github.com/Ileices/personal_IDE)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Arena/IDE Environment](#2-arenaide-environment)
3. [Nano Model Ecosystem](#3-nano-model-ecosystem)
4. [Absolute Existence Framework Integration](#4-absolute-existence-framework-integration)
5. [Interaction Flow & Recording](#5-interaction-flow--recording)
6. [Training Pipeline & Enhancement Loop](#6-training-pipeline--enhancement-loop)
7. [Inference & Ripple Activation](#7-inference--ripple-activation)
8. [Lifecycle Management & Compression Cycles](#8-lifecycle-management--compression-cycles)
9. [Mesh Networking & Multi-Device Compute](#9-mesh-networking--multi-device-compute)
10. [Data Indexing & Retrieval](#10-data-indexing--retrieval)
11. [System Evolution Metrics](#11-system-evolution-metrics)
12. [Implementation Status Matrix](#12-implementation-status-matrix)

---

## 1. System Overview

N-MALS (Nano Model Architecture for Learning Systems) is the architectural backbone of the Personal IDE project. It replaces the traditional monolithic LLM approach with a **sea of tiny, specialized neural networks** (nanos) that cooperatively handle code understanding, generation, memory, and reasoning.

### Architecture Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                        WEB UI (React 19 + Vite 6)               │
│  ChatPanel │ AgentControls │ NanoSeaControls │ MemoryPanel       │
└─────┬───────────────┬──────────────┬────────────────────────────┘
      │               │              │
      ▼               ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   FASTIFY 5 API SERVER (Node.js)                │
│  Chat │ Agent │ Files │ Memory │ Models │ Providers │ Nano Proxy│
└─────┬───────────────┬──────────────┬────────────────────────────┘
      │               │              │
      ▼               ▼              ▼
┌─────────────┐ ┌──────────────┐ ┌───────────────────────────────┐
│ Enhanced    │ │  LLM Router  │ │     NANO SEA (Python)         │
│ Agent Loop  │ │  (OpenRouter  │ │  ┌─────────────────────────┐  │
│  + Chunking │ │   Ollama,    │ │  │  296 Nanos × 19 Cats    │  │
│  + Context  │ │   local)     │ │  │  Ripple Engine           │  │
│  + Memory   │ │              │ │  │  Pipeline Executor       │  │
└─────────────┘ └──────────────┘ │  │  PTAIE Scheduler         │  │
                                  │  │  Message Bus             │  │
                                  │  │  Load Balancer           │  │
                                  │  └─────────────────────────┘  │
                                  │  ┌─────────────────────────┐  │
                                  │  │  AE Framework            │  │
                                  │  │  IC-AE Engine            │  │
                                  │  │  Lifecycle Manager       │  │
                                  │  │  Fitness Evaluator       │  │
                                  │  │  Tiered Storage          │  │
                                  │  │  Compression Engine      │  │
                                  │  └─────────────────────────┘  │
                                  │  ┌─────────────────────────┐  │
                                  │  │  Mesh Network            │  │
                                  │  │  RESPECT Scoring         │  │
                                  │  │  Global Compute Pool     │  │
                                  │  │  Peer Discovery          │  │
                                  │  └─────────────────────────┘  │
                                  │  ┌─────────────────────────┐  │
                                  │  │  Training System         │  │
                                  │  │  GPU Abstraction Layer   │  │
                                  │  │  Structured Log Dumper   │  │
                                  │  └─────────────────────────┘  │
                                  └───────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Location |
|-------|-----------|----------|
| Web UI | React 19, Vite 6, Tailwind CSS | `apps/web/` |
| API Server | Fastify 5.2, TypeScript, tsx watch | `apps/server/` |
| Shared Types | TypeScript package, pnpm workspace | `packages/shared/` |
| Nano Sea | Python 3.10+, PyTorch, FastAPI | `NANO_train/` |
| Agent System | Enhanced Loop, Chunking Pipeline | `apps/server/src/services/agent/` |
| Training Corpus | Sample code, datasets | `NANO_train/NANO_corpus/` |

---

## 2. Arena/IDE Environment

The IDE serves as both the user interface and the **AE (Absolute Existence)** — the immutable reality that nanos observe and learn from.

### Implemented Components

| Component | File | Status |
|-----------|------|--------|
| **Agent Orchestrator** | `apps/server/src/services/agent/enhancedLoop.ts` | ✅ Full — multi-step agent loop with context management, smart chunking, checkpointing, cooldown, error auto-fix |
| **Basic Agent Loop** | `apps/server/src/services/agent/loop.ts` | ✅ Full — simpler fallback loop |
| **Code Indexer** | `apps/server/src/services/knowledge/` | ✅ Codebase analysis, relationship indexing |
| **Memory System** | `apps/server/src/services/memory/` | ✅ Notes, search, project-scoped memory |
| **Model Router** | `packages/shared/src/constants/models.ts` | ✅ 20+ models across OpenAI, Anthropic, Meta, Google, DeepSeek, Ollama |
| **Provider Management** | `apps/server/src/services/providers/` | ✅ Multi-provider with rate limiting, key rotation |
| **File System** | `apps/server/src/routes/files.ts` | ✅ Read/write/tree operations |
| **Error Detection** | `apps/server/src/routes/errors.ts` | ✅ TypeScript/lint error monitoring |
| **Checkpoint System** | `apps/server/src/services/checkpoint/` | ✅ Git-based state snapshots with rollback |
| **Project Tier Engine** | `apps/server/src/services/tiers/` | ✅ Hardware-adaptive project scaling |
| **Conversation Index** | `apps/server/src/services/conversationIndex/` | ✅ Chat history indexing and search |

### UI Components

| Component | File | Status |
|-----------|------|--------|
| **Chat Panel** | `apps/web/src/components/ChatPanel.tsx` | ✅ Markdown rendering, code blocks, copy, streaming |
| **Agent Controls** | `apps/web/src/components/AgentControls.tsx` | ✅ Event feed, verbosity, copy/clear, model selection |
| **Nano Sea Controls** | `apps/web/src/components/NanoSeaControls.tsx` | ✅ ~980 lines: env check, start/stop, mesh toggle, live logs, node status |
| **Memory Panel** | `apps/web/src/components/MemoryPanel.tsx` | ✅ Notes CRUD, categories, importance, tags |
| **Project Panel** | `apps/web/src/components/ProjectPanel.tsx` | ✅ Project creation/selection/deletion |
| **File Browser** | `apps/web/src/components/FileBrowser.tsx` | ✅ Tree view with file operations |
| **Code Viewer** | `apps/web/src/components/CodeViewer.tsx` | ✅ Syntax highlighting |
| **Rate Limit Dashboard** | `apps/web/src/components/RateLimitDashboard.tsx` | ✅ Provider rate limit visualization |
| **Checkpoint Viewer** | `apps/web/src/components/CheckpointViewer.tsx` | ✅ Checkpoint history and rollback |

---

## 3. Nano Model Ecosystem

### 3.1 Architecture

Every nano is a tiny PyTorch `nn.Module` — a 3-layer MLP constrained to fit in L1/L2 cache (<50K parameters, trains in seconds):

```python
# BaseNano architecture (nanos/base.py)
nn.Sequential(
    nn.Linear(input_size, hidden_size),   # Default: 128 → 64
    nn.GELU(),
    nn.Linear(hidden_size, hidden_size),  # 64 → 64
    nn.GELU(),
    nn.Linear(hidden_size, output_size),  # 64 → 64
)
```

### 3.2 Taxonomy — 296 Nanos × 19 Categories

| # | Category | Count | File | Example Nanos |
|---|----------|-------|------|---------------|
| 1 | **Data** | 16 | `nanos/data.py` | FileSystemDataNano, TokenizationNano, EmbeddingNano |
| 2 | **Vision** | 15 | `nanos/vision.py` | ScreenCaptureNano, CodeToVisualNano, UIElementNano |
| 3 | **Semantic** | 28 | `nanos/semantic.py` | PythonSemanticNano, IntentNano, EntityNano |
| 4 | **Memory** | 21 | `nanos/memory.py` | ConversationBufferNano, EpisodicMemoryNano, DecayNano |
| 5 | **Indexing** | 19 | `nanos/indexing.py` | DataIndexNano, VectorIndexNano, SearchNano, RankNano |
| 6 | **Orchestration** | 23 | `nanos/orchestration.py` | QueryRouterNano, PipelineOrchestratorNano, LoadBalancerNano |
| 7 | **Training** | 24 | `nanos/training_nanos.py` | TrainingStrategyNano, ContrastiveLearningNano, BackpropagationNano |
| 8 | **Inference** | 21 | `nanos/inference.py` | IntentDetectionNano, CodeGenerationNano, DeductiveReasoningNano |
| 9 | **Hardware** | 16 | `nanos/hardware.py` | CPUMonitorNano, GPUOptimizationNano, BottleneckDetectionNano |
| 10 | **OS** | 13 | `nanos/os_nanos.py` | ProcessMonitorNano, SystemEventNano, FileHandleNano |
| 11 | **User Behavior** | 12 | `nanos/user_behavior.py` | KeystrokePatternNano, WorkflowNano, SkillLevelNano |
| 12 | **Communication** | 10 | `nanos/communication.py` | MessagePassingNano, WebSocketNano, EventBusNano |
| 13 | **Procedural** | 15 | `nanos/procedural.py` | ScaffoldGeneratorNano, TestGeneratorNano, RefactorNano |
| 14 | **Security** | 13 | `nanos/security.py` | ThreatDetectionNano, EncryptionNano, SandboxNano |
| 15 | **Meta-Cognitive** | 13 | `nanos/meta_cognitive.py` | PerformanceAnalysisNano, CuriosityNano, LearningToLearnNano |
| 16 | **Integration** | 10 | `nanos/integration.py` | OpenAIInterfaceNano, OllamaInterfaceNano, GitIntegrationNano |
| 17 | **Compression** | 6 | `nanos/compression_expansion.py` | ExpansionTriggerNano, DistillationNano, PruningNano |
| 18 | **Specialized** | 17 | `nanos/specialized.py` | ArithmeticNano, PhysicsSimulationNano, GameMechanicsNano |
| 19 | **Framework** | 4 | `nanos/framework.py` | NanoTaxonomyNano, AlternatorNano, RBYDecoderNano, AbsuleicrNano |

### 3.3 Nano State Machine

```
DORMANT → TRAINING → ACTIVE → INFERENCE → (back to ACTIVE)
                                    ↓
                              COMPRESSING → COMPRESSED → DEAD
```

All nanos carry:
- **RBY Color Vector**: Perception (R), Cognition (B), Execution (Y) — shifts during lifecycle
- **PTAIE Control Vector**: Priority, Temporal, Affinity, Importance, Execution cost
- **Fitness Score**: α×performance + β×efficiency + γ×(1/size) + δ×usage + ε×novelty
- **Connections**: Affinity-weighted links to other nanos for ripple activation

---

## 4. Absolute Existence Framework Integration

The AE Framework provides the philosophical and mathematical foundation for all nano operations.

### Core Laws (Implemented)

| Law | Implementation | File |
|-----|---------------|------|
| **AE = Immovable Object** | User's filesystem scanned read-only; Merkle root hash from file index; Λ-gated deposit windows | `core/ae.py` |
| **AEc = Crystallized/Moving** | Active nanos exist in AEc space; volume tracking with dV/dt | `core/ae.py` |
| **UF + IO = Creation** | Every nano born from urge (UF) meeting structure (IO) | Conceptual — nanos spawn from registry |
| **RBY Color Vectoring** | R=perception/novelty, B=cognition/structure, Y=execution; r+b+y=1; lifecycle shifting | `core/rby.py` |
| **PTAIE 5-Vector Tags** | scheduling_score, decay_rate, routing_weight, compute_budget, ranking_score | `core/ptaie.py` |
| **IC-AE Recursive Infection** | Sandbox creation, recursive infection with depth/children/total limits, hierarchy traversal | `core/ic_ae.py` |
| **Absularity (Λ) Detection** | dV/dt flattening, d²V/dt² near zero, LP-MD check; triggers compression cycle | `core/lifecycle.py` |
| **Color Memory Storage** | RBY glyphs for compressed nanos; zlib + hash; can be reconstructed | `core/compression.py` |

### AE Scan → Seed Generation

```
User's Filesystem → ae_scanner.py → Deterministic RBY Seed
                                          ↓
                                  Seed modulates initial nano weights
                                  (each installation is unique)
```

- Scanner: `scanner/ae_scanner.py` — async filesystem walker, generates hash-based RBY seed
- Seed applied in `main.py::_spawn_nanos()` — subtle weight modulation per nano

---

## 5. Interaction Flow & Recording

### Agent Loop Flow

```
User Task → Enhanced Agent Loop → LLM Call → Structured JSON Response
                    ↓                              ↓
            Context Management          Parse: summary, filesChanged,
            Smart Chunking              questionsForUser, nextSteps, done
            Token Budgeting                        ↓
                                        File Operations + Memory Notes
                                                   ↓
                                        Next Iteration (if !done)
```

### Recording Systems

| System | Implementation | Purpose |
|--------|---------------|---------|
| **Structured Log Dumper** | `log_system/log_dumper.py` (428 lines) | JSONL per-channel rotating files with gzip compression |
| **Memory Notes** | `apps/server/src/services/memory/` | Project-scoped notes: auto_summary, user_note, agent_log, file_summary |
| **Conversation Indexer** | `apps/server/src/services/conversationIndex/` | Full chat history with search |
| **Training Archive** | `training/trainer.py` | Query/response pairs stored as JSONL for nano training |
| **Agent Event Stream** | `apps/server/src/routes/agent.ts` → SSE | Real-time event feed to UI |

### Log Channels

| Channel | Content |
|---------|---------|
| `nano_system` | Boot sequence, spawning, shutdown |
| `nano_train` | Training epochs, losses, checkpoints |
| `nano_mesh` | Peer connections, task delegation |
| `nano_server` | API requests, inference results |
| `compute` | GPU detection, device allocation |
| `ide_output` | Agent actions, file operations |
| `ide_debug` | Error traces, debugging info |
| `ide_terminal` | Terminal command execution |

---

## 6. Training Pipeline & Enhancement Loop

### Training Architecture

```
LLM API Call → Observation → TrainingPair(input, target, quality)
                                    ↓
                            Training Archive (JSONL)
                                    ↓
                            NanoTrainer._training_loop()
                                    ↓
                    ┌───────────────────────────────┐
                    │  CharTokenizer.encode_input()  │
                    │  CharTokenizer.encode_target()  │
                    └───────────────┬───────────────┘
                                    ↓
                    ┌───────────────────────────────┐
                    │  nano.forward(input_tensor)    │
                    │  F.mse_loss(output, target)    │
                    │  loss.backward()               │
                    │  optimizer.step()              │
                    │  clip_grad_norm_(1.0)          │
                    └───────────────┬───────────────┘
                                    ↓
                    ┌───────────────────────────────┐
                    │  Checkpoint (every N epochs)   │
                    │  RBY lifecycle_shift            │
                    │  Fitness tracking              │
                    └───────────────────────────────┘
```

### Training Modes

| Mode | Status | Description |
|------|--------|-------------|
| **Observation** | ✅ Implemented | Watch LLM API calls, extract (input, output) training pairs |
| **Self-Supervised** | ⚠️ Described | Masked prediction on user's code (not yet implemented) |
| **Evolution** | ✅ Implemented | Tournament selection + weight perturbation (`trainer.evolve()`) |
| **Idle** | ⚠️ Partial | Architecture supports it via global pool idle training flag; no LLM-assisted data generation yet |

### Evolution (Survival of the Fittest)

```python
# trainer.py::evolve()
1. Clone parent nano N times (population_size=4)
2. Apply Gaussian weight perturbation to each clone
3. Evaluate fitness on available training data
4. Tournament: keep the best, replace the original
```

### Lifecycle Monitor Integration

The lifecycle monitor (`main.py::_lifecycle_loop()`) runs every 5 minutes:
1. **Fitness evaluation** — rank all nanos by composite score
2. **Evolution trigger** — evolve bottom-performing nanos every 10 minutes
3. **Absularity detection** — monitor dV/dt for expansion plateau
4. **Storage maintenance** — check if compression is needed

---

## 7. Inference & Ripple Activation

### Ripple Pattern

```
User Query → tokens hit specific data/semantic nanos (stones in pond)
                         ↓
            Adjacent nanos activate (ripples)
                         ↓
            Orchestrator determines ripple radius based on compute
                         ↓
            Multiple ripple intersections → inference result
```

### Implemented Infrastructure

| Component | File | Status |
|-----------|------|--------|
| **Ripple Engine** | `orchestrator/ripple.py` | ✅ Async BFS propagation, Hebbian learning (connections strengthen on co-fire), auto-wiring, refractory period, decay |
| **Inference Pipeline** | `orchestrator/pipeline.py` | ✅ DAG-based: parse→expand→route→search→rank→context→generate→validate→format |
| **Training Pipeline** | `orchestrator/pipeline.py` | ✅ DAG-based: observe→tokenize→embed→sample→train→validate→log |
| **PTAIE Scheduler** | `orchestrator/scheduler.py` | ✅ Priority heap, PTAIE urgency scoring, CPU/GPU semaphores, starvation prevention |
| **Message Bus** | `orchestrator/message_bus.py` | ✅ Async pub/sub, priority queue, dead letter queue |
| **Load Balancer** | `orchestrator/load_balancer.py` | ✅ Weighted scoring: capacity×0.3 + speed×0.25 + reliability×0.2 + respect×0.15 + locality×0.1 |

### Current Inference Path

Currently, inference for complex tasks uses LLM APIs via the agent loop. The nano inference pipeline is structurally complete but nanos need training data to produce meaningful output. The transition strategy:

1. **Phase 1** (Current): LLMs handle all inference; nanos observe and learn
2. **Phase 2**: Nanos assist LLMs on subtasks (embeddings, tokenization)
3. **Phase 3**: Competition mode — nanos vs LLMs on same tasks
4. **Phase 4**: Nanos win consistently, take over primary inference
5. **Phase 5**: LLMs become data generators for nano training

---

## 8. Lifecycle Management & Compression Cycles

### State Machine

```
                    ┌── BIRTH
                    ↓
              PRIMORDIAL_SOUP
                    ↓
              EARLY_EXPANSION → ... → MATURITY → PEAK → PLATEAU
                                                          ↓
                                                    ABSULARITY (Λ)
                                                          ↓
                                                    COMPRESSION
                                                          ↓
                                                DISTILLATION → DEPOSIT
                                                          ↓
                                                    DEATH / REBIRTH
                                                          ↓
                                                    NEW CYCLE
```

### Implementation

| Component | File | Status |
|-----------|------|--------|
| **Lifecycle States** | `core/lifecycle.py` | ✅ 45 states defined as enum, full state machine |
| **State Transitions** | `core/lifecycle.py` | ✅ `transition()`, `advance()`, callbacks |
| **Absularity Detection** | `core/lifecycle.py` | ✅ `check_absularity(dv_dt, d2v_dt2)` with configurable ε, η |
| **Compression Engine** | `core/compression.py` | ✅ Twmrto text compressor, RBYGlyph binary format, NeuralMapDistiller |
| **Crypto/Signing** | `core/crypto.py` | ✅ Ed25519, X25519, AES-256-GCM, VDN container format |
| **Tiered Storage** | `core/storage.py` | ✅ 5 tiers (Hot/Warm/Cold/Frozen/Compressed), LRU eviction, importance decay |
| **Fitness Evaluator** | `core/fitness.py` | ✅ Composite scoring, ranking, redundancy detection, pruning |
| **Lifecycle Monitor** | `main.py::_lifecycle_loop()` | ✅ Background task: fitness eval → evolution → absularity check → storage maintenance |

### Multi-Scale Existence (Tiered Storage)

| Tier | Medium | Access | Description |
|------|--------|--------|-------------|
| **Hot** | RAM | Immediate | Actively used nanos, in-memory |
| **Warm** | SSD | Fast | Recently used, quick retrieval |
| **Cold** | HDD | Slow | Infrequently used |
| **Frozen** | Cloud/Server | Very slow | Rarely used, remote storage |
| **Compressed** | Glyph | Requires expansion | Big Bang deposit, RBY color encoding |

---

## 9. Mesh Networking & Multi-Device Compute

### Architecture

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Node A  │◄───►│  Node B  │◄───►│  Node C  │
│ (1660 S) │     │  (4090)  │     │  (CPU)   │
│ Tier 3   │     │  Tier 5  │     │  Tier 1  │
└──────────┘     └──────────┘     └──────────┘
      ▲                ▲                ▲
      └────────┬───────┘                │
               ▼                        │
        ┌─────────────┐                 │
        │ Global Pool │◄────────────────┘
        │  (Tracker)  │
        └─────────────┘
```

### Implemented Components

| Component | File | Status |
|-----------|------|--------|
| **Mesh Node** | `mesh/node.py` | ✅ Ed25519 identity, hardware auto-detect, compute grade, tier |
| **RESPECT System** | `mesh/respect.py` | ✅ Composite: TaskPerf×0.4 + ResourceStability×0.3 + Conduct×0.2 + Community×0.1 |
| **Discovery** | `mesh/discovery.py` | ✅ Tracker, mDNS, subnet scan, manual peers |
| **Transport** | `mesh/transport.py` | ✅ Encrypted peer-to-peer messaging |
| **Latency Compensator** | `mesh/latency.py` | ✅ Network delay measurement and adjustment |
| **Task Queue** | `mesh/task_queue.py` | ✅ Distributed task scheduling with load balancer |
| **Help Requests** | `mesh/help_request.py` | ✅ Ask/offer compute help between peers |
| **Global Compute Pool** | `mesh/global_pool.py` | ✅ Shared compute with donation percentage, idle training |
| **Peer Discovery** | `mesh/peer_discovery.py` | ✅ Opt-in sharing levels (metadata/weights/full), announcements |

### Compute Grade Formula

```
Grade = (CPU_cores × 0.2) + (RAM_GB × 0.15) + (GPU_VRAM_GB × 0.4) + (CUDA × 0.25)
Tier = Grade-based: 1 (weak) → 5 (supercomputer)
```

---

## 10. Data Indexing & Retrieval

### Code Intelligence

| System | Location | Purpose |
|--------|----------|---------|
| **Codebase Analyzer** | `apps/server/src/services/knowledge/` | AST-level code understanding, symbol tracking |
| **Relationship Index** | `apps/server/src/services/knowledge/` | File→file, function→function dependency graphs |
| **Conversation Index** | `apps/server/src/services/conversationIndex/` | Searchable chat history |
| **Memory Service** | `apps/server/src/services/memory/` | Project-scoped notes with categories, tags, importance |

### Nano Indexing

| Nano Type | Category | Purpose |
|-----------|----------|---------|
| DataIndexNano | Indexing | Indexes all data nanos |
| VisionIndexNano | Indexing | Indexes all vision nanos |
| SemanticIndexNano | Indexing | Indexes semantic nanos |
| VectorIndexNano | Indexing | High-dimensional embedding index |
| SearchNano | Indexing | Query execution across indexes |
| RankNano | Indexing | Result ordering by relevance |

### AE Scanner

```
Filesystem → ae_scanner.py → File hashes → Deterministic RBY seed
                                    ↓
                            Cached for fast restart
                            Progressive refinement
                            Throttled (200 files/sec)
```

---

## 11. System Evolution Metrics

### Expansion Metrics

| Metric | Source | Description |
|--------|--------|-------------|
| **Nano Count** | `len(NanoSea)` | Total nanos alive in current cycle |
| **Total Parameters** | `sum(n.param_count)` | Combined neural network size |
| **IC-AE Depth** | `ic_ae.cross_analyze()` | Average recursion depth of infection sandboxes |
| **AE Coverage** | `ae_scanner.seed` | Percentage of filesystem indexed |
| **Volume Growth (dV/dt)** | `lifecycle_loop` | Rate of expansion toward absularity |

### Training Metrics

| Metric | Source | Description |
|--------|--------|-------------|
| **Epochs Completed** | `trainer._epochs_completed` | Total training cycles |
| **Average Loss** | `session.avg_loss` | Per-epoch average MSE loss |
| **Training Pairs** | `trainer._total_pairs_used` | Total observation pairs consumed |
| **Checkpoints** | `checkpoints/` directory | Saved model states |

### Fitness Metrics

| Metric | Source | Description |
|--------|--------|-------------|
| **Fitness Score** | `fitness.compute_fitness()` | α×perf + β×eff + γ×(1/size) + δ×usage + ε×novelty |
| **Accuracy** | `record.accuracy` | correct_inferences / total_inferences |
| **Usage Frequency** | `record.usage_frequency` | Inferences per second of lifetime |
| **Redundancy** | `fitness.identify_redundant()` | Nanos with >3 same-type and low fitness |

### Lifecycle Metrics

| Metric | Source | Description |
|--------|--------|-------------|
| **Current Phase** | `lifecycle.get_phase_name()` | Where in the expansion→compression cycle |
| **Cycle ID** | `lifecycle.cycle_id` | How many Big Bang cycles completed |
| **Absularity Detected** | `lifecycle.check_absularity()` | Whether expansion has plateaued |
| **Storage Tier Usage** | `storage.get_tier_stats()` | Hot/Warm/Cold/Frozen/Compressed utilization |

---

## 12. Implementation Status Matrix

### Legend
- ✅ **Complete** — Fully implemented and wired into the system
- ⚠️ **Partial** — Code exists but not fully connected or not producing real output
- ❌ **Not Started** — Described in architecture but no code exists

### Core Infrastructure

| Feature | Status | Notes |
|---------|--------|-------|
| BaseNano (nn.Module, 3-layer MLP) | ✅ | Universal parent with RBY, PTAIE, fitness, messaging |
| Nano Registry (296 types × 19 categories) | ✅ | All registered via `@register_nano` decorator |
| Nano Spawn (Big Bang boot) | ✅ | All nanos instantiated with AE seed modulation |
| Nano State Machine | ✅ | 7 states: DORMANT→TRAINING→ACTIVE→INFERENCE→COMPRESSING→COMPRESSED→DEAD |

### AE Framework

| Feature | Status | Notes |
|---------|--------|-------|
| AE (Immovable Object) | ✅ | Read-only filesystem, Merkle root, Λ-gated deposits |
| AEc (Crystallized/Moving) | ✅ | Volume tracking with dV/dt |
| RBY Color Vectoring | ✅ | Full: normalize, lifecycle_shift, distance, blend, from_text |
| PTAIE 5-Vector Tags | ✅ | Full: scheduling, decay, routing, compute budget, ranking |
| IC-AE Recursive Infection | ✅ | Engine complete; wired into boot as of latest update |
| Absularity Detection | ✅ | dV/dt + d²V/dt² + LP-MD; wired into lifecycle monitor |
| Compression Cycles | ⚠️ | Engine complete; automatic triggering not yet active |
| Color Memory Reconstruction | ⚠️ | Glyph format defined; no nano has been compressed yet |

### Orchestration

| Feature | Status | Notes |
|---------|--------|-------|
| Ripple Engine | ✅ | BFS propagation, Hebbian learning, auto-wiring |
| Pipeline Executor | ✅ | DAG execution with parallel stages |
| PTAIE Scheduler | ✅ | Priority heap with CPU/GPU semaphores |
| Message Bus | ✅ | Async pub/sub + direct + dead letter |
| Load Balancer | ✅ | Multi-factor weighted scoring |

### Training

| Feature | Status | Notes |
|---------|--------|-------|
| Observation Training | ✅ | LLM call → training pairs → MSE training |
| CharTokenizer | ✅ | Char-level encoding to float tensors |
| Checkpoint Save/Load | ✅ | PyTorch .pt + JSON metadata |
| Evolution | ✅ | Tournament selection + weight perturbation; wired into lifecycle monitor |
| Self-Supervised Training | ❌ | Masked prediction on user code not implemented |
| Autonomous Idle Training | ⚠️ | Flag exists in global pool; no LLM-assisted data generation |

### Mesh Network

| Feature | Status | Notes |
|---------|--------|-------|
| Mesh Node + Identity | ✅ | Ed25519 persistent identity, hardware detect |
| RESPECT Scoring | ✅ | 4-factor composite with tier system |
| Discovery (Tracker/mDNS/Subnet) | ✅ | Multiple discovery methods |
| Transport (Encrypted) | ✅ | Peer-to-peer messaging |
| Global Compute Pool | ✅ | Shared compute with donation |
| Peer Discovery | ✅ | Opt-in sharing levels |
| Task Queue | ✅ | Distributed with load balancer |

### Monitoring & Logging

| Feature | Status | Notes |
|---------|--------|-------|
| Structured Log Dumper | ✅ | JSONL, per-channel, rotating, gzip |
| GPU Abstraction Layer | ✅ | CUDA/ROCm/DirectML/Vulkan/OpenCL/MPS/CPU |
| FastAPI Server (50+ endpoints) | ✅ | Full CRUD + inference + training + mesh |
| NanoSeaControls UI | ✅ | ~980 lines: full management panel |

### Gaps to Fill (Roadmap)

| Feature | Priority | Description |
|---------|----------|-------------|
| **Nano Specialization** | High | Each nano type uses identical MLP — need domain-specific forward passes |
| **Self-Supervised Training** | High | Masked prediction on user's actual code files |
| **LLM-Assisted Data Gen** | Medium | Autonomous idle mode: ask LLMs to generate training data |
| **Nano-to-Nano Collaboration** | Medium | Nanos don't yet read each other's output to refine their own |
| **Compression Automation** | Medium | Trigger compression when absularity detected, deposit to AE |
| **NanoTaxonomyNano Evolution** | Low | Should read readme and suggest new nano types |
| **ML-Quality Logging** | Low | Logs are operational, not yet ML-training-quality with labeled params |

---

## Appendix: File Map

```
personal_IDE/
├── apps/
│   ├── server/                    # Fastify API (TypeScript)
│   │   └── src/
│   │       ├── routes/            # 14 route modules
│   │       ├── services/
│   │       │   ├── agent/         # Enhanced + basic agent loops
│   │       │   ├── memory/        # Note system
│   │       │   ├── knowledge/     # Code indexer + relationships
│   │       │   ├── checkpoint/    # Git-based snapshots
│   │       │   └── providers/     # LLM provider management
│   │       └── db/                # SQLite via better-sqlite3
│   └── web/                       # React 19 + Vite 6
│       └── src/
│           ├── components/        # 14 UI components
│           └── stores/            # Zustand state management
├── packages/
│   └── shared/                    # Types, constants, models, schema
├── NANO_train/                    # Python nano ecosystem
│   ├── core/                      # AE, RBY, PTAIE, IC-AE, lifecycle, fitness, compression, crypto, storage
│   ├── nanos/                     # 19 category files + base.py
│   ├── orchestrator/              # Ripple, pipeline, scheduler, bus, load balancer
│   ├── mesh/                      # Node, RESPECT, discovery, transport, pool, peers
│   ├── training/                  # Trainer with observation + evolution
│   ├── compute/                   # GPU detection, device manager
│   ├── scanner/                   # AE filesystem scanner
│   ├── server/                    # FastAPI (50+ endpoints)
│   ├── log_system/                # Structured JSONL log dumper
│   └── main.py                    # Big Bang boot sequence (12 steps)
└── N-MALS_ARCHITECTURE.md         # This document
```
