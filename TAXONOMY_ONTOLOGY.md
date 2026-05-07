# Personal IDE — Full Taxonomy, Ontology & Schematic Pipeline

> Generated from codebase analysis of `Ileices/personal_IDE`.  
> All file paths are relative to the repository root.

---

## Table of Contents

1. [Top-Level Ontology](#1-top-level-ontology)
2. [Container Taxonomy (All Nodes)](#2-container-taxonomy-all-nodes)
3. [Child-Parent Relationship Map](#3-child-parent-relationship-map)
4. [Decision Tree / Pipeline Schematics](#4-decision-tree--pipeline-schematics)
   - [4A Chat Request Pipeline](#4a-chat-request-pipeline)
   - [4B Agent Loop Pipeline](#4b-agent-loop-pipeline)
   - [4C Nano Sea Boot Pipeline (Big Bang)](#4c-nano-sea-boot-pipeline-big-bang--12-steps)
   - [4D Inference Ripple Pipeline](#4d-inference-ripple-pipeline)
   - [4E Training Data Pipeline (Midwife → Nano)](#4e-training-data-pipeline-midwife--nano)
   - [4F Lifecycle / Compression Cycle](#4f-lifecycle--compression-cycle)
5. [Tooling Calls Per Node](#5-tooling-calls-per-node)
6. [Summary Ontology Graph](#6-summary-ontology-graph)
7. [Key Cross-Cutting Wires (Gaps)](#7-key-cross-cutting-wires-gaps)

---

## 1. Top-Level Ontology

```
ROOT: personal_IDE
│
├── RUNTIME LAYER A — Node.js / TypeScript Stack
│   ├── Container: apps/server          (Fastify 5 API, port 3001)
│   └── Container: apps/web             (React 19 + Vite, port 5173)
│
├── RUNTIME LAYER B — Python Stack
│   └── Container: NANO_train           (FastAPI, port 5100)
│
└── SHARED LAYER
    └── Container: packages/shared      (TypeScript types, model config, constants)
```

**Cross-layer communication:**

| Link | Protocol |
|---|---|
| Web → Server | HTTP REST + SSE (EventSource streaming) |
| Server → NANO_train | HTTP proxy via `nano.ts` routes → Python FastAPI on `:5100` |
| Server → LLM Providers | OpenAI-compatible HTTP (GitHub Models, Ollama, Groq, etc.) |
| NANO_train peer ↔ peer | TCP encrypted mesh (Ed25519 identity, AES-256-GCM transport) |

---

## 2. Container Taxonomy (All Nodes)

```
personal_IDE/
│
├── [C1] apps/server/                    ← Fastify API Server
│   └── src/
│       ├── index.ts                     Boot: DB init, route registration, CORS
│       ├── config.ts                    Env vars, ports, paths
│       ├── db/index.ts                  SQLite (better-sqlite3) init + schema
│       │
│       ├── routes/                      HTTP Route Modules (parent: Fastify app)
│       │   ├── auth.ts                  /api/auth
│       │   ├── chat.ts                  /api/chat
│       │   ├── agent.ts                 /api/agent
│       │   ├── files.ts                 /api/files
│       │   ├── memory.ts                /api/memory
│       │   ├── models.ts                /api/models
│       │   ├── providers.ts             /api/providers
│       │   ├── checkpoints.ts           /api/checkpoints
│       │   ├── errors.ts                /api/errors
│       │   ├── knowledge.ts             /api/knowledge
│       │   ├── tiers.ts                 /api/tiers
│       │   ├── conversationIndex.ts     /api/conversation-index
│       │   ├── ollama.ts                /api/ollama
│       │   ├── nano.ts                  /api/nano
│       │   ├── midwife.ts               /api/midwife
│       │   └── preview.ts               /api/preview
│       │
│       └── services/                    Business Logic (child of routes)
│           ├── llm/
│           │   ├── client.ts            GitHub PAT client factory
│           │   ├── providers.ts         Multi-provider client factory
│           │   ├── streaming.ts         SSE streaming wrapper
│           │   ├── rateLimiter.ts       Token bucket + fallback logic
│           │   └── chunkingPipeline.ts  Context-window chunking
│           │
│           ├── agent/
│           │   ├── enhancedLoop.ts      EnhancedAgentLoop class (v3)
│           │   ├── loop.ts              BasicAgentLoop (fallback)
│           │   ├── logWriter.ts         Persistent per-run event log
│           │   ├── loopDetector.ts      Repetition / infinite-loop guard
│           │   ├── webSearch.ts         Web search integration
│           │   ├── codeIndexer.ts       In-loop code symbol indexer
│           │   └── platformDetector.ts  OS/runtime detection
│           │
│           ├── memory/
│           │   └── index.ts             MemoryService: projects, notes, conversations
│           │
│           ├── analysis/
│           │   ├── codebase.ts          CodebaseAnalyzer: AST/symbol analysis
│           │   ├── relationshipIndex.ts File→file, fn→fn dependency graph
│           │   ├── logManager.ts        LogBloatManager: prune/summarize logs
│           │   ├── projectTierEngine.ts Hardware-adaptive project scaling
│           │   └── conversationIndexer.ts Searchable chat history
│           │
│           ├── checkpoint/
│           │   └── index.ts             CheckpointService: git-based snapshots + rollback
│           │
│           ├── errors/
│           │   └── detector.ts          Stack detection, lint, tests, error formatting
│           │
│           ├── filesystem/
│           │   └── index.ts             read / write / listAllFiles
│           │
│           ├── modes/
│           │   ├── prompts.ts           SYSTEM_PROMPTS, parseStructuredOutput
│           │   └── agentPrompts.ts      buildAgentSystemPrompt
│           │
│           └── midwife/                 Nano training-dataset generator
│
├── [C2] apps/web/                       ← React Frontend
│   └── src/
│       ├── main.tsx                     Vite entry point
│       ├── App.tsx                      Root layout
│       ├── api/                         Typed API client wrappers
│       │
│       ├── stores/                      Zustand global state (parent: App)
│       │   ├── agentStore.ts
│       │   ├── authStore.ts
│       │   ├── chatStore.ts
│       │   ├── fileStore.ts
│       │   ├── midwifeStore.ts
│       │   └── projectStore.ts
│       │
│       └── components/                  UI Panels (child of App)
│           ├── TopBar.tsx               Auth, model selector, project selector
│           ├── ChatPanel.tsx            SSE chat stream, markdown, code blocks
│           ├── AgentControls.tsx        Start/stop/pause loop, event feed
│           ├── NanoSeaControls.tsx      Nano start/stop/mesh/logs (~980 lines)
│           ├── MemoryPanel.tsx          Notes CRUD, categories, tags
│           ├── ProjectPanel.tsx         Project lifecycle
│           ├── FileBrowser.tsx          Tree view, file operations
│           ├── CodeViewer.tsx           Syntax-highlighted read-only view
│           ├── CheckpointViewer.tsx     History + rollback
│           ├── RateLimitDashboard.tsx   Provider rate-limit visualization
│           ├── ErrorPanel.tsx           Lint/TS errors
│           ├── MidwifePanel.tsx         Training data generation UI
│           ├── OllamaSetup.tsx          Local model management
│           ├── ProviderSettings.tsx     API key & provider config
│           └── LoginPage.tsx            GitHub PAT entry
│
├── [C3] packages/shared/                ← Shared TypeScript (compiled to dist/)
│   └── src/
│       ├── index.ts
│       ├── types/
│       │   ├── agent.ts                 AgentConfig, AgentState, AgentRunStatus
│       │   ├── auth.ts                  AuthToken, session
│       │   ├── chat.ts                  ChatRequest, Message
│       │   ├── files.ts                 FileTree, FileNode
│       │   ├── knowledge.ts             CodeSymbol, RelationshipEdge
│       │   ├── memory.ts                Note, Project, Conversation
│       │   └── providers.ts             ProviderType, UnifiedModel
│       └── constants/
│           ├── models.ts                20+ model definitions (context windows, tiers)
│           ├── providers.ts             Provider endpoint map
│           └── schema.ts               DB schema constants
│
└── [C4] NANO_train/                     ← Python Nano Sea (FastAPI, port 5100)
    ├── main.py                          NanoSea class — Big Bang boot (12 steps)
    ├── config.py                        Python config
    │
    ├── core/                            AE Framework (parent: NanoSea)
    │   ├── ae.py                        AE immovable object, Merkle root, Λ-gates
    │   ├── rby.py                       RBYVector: R+B+Y=1, lifecycle_shift, blend
    │   ├── ptaie.py                     PTAIEVector: 5-dim control tag
    │   ├── ic_ae.py                     IC-AE recursive infection engine
    │   ├── lifecycle.py                 45-state machine, absularity detection
    │   ├── fitness.py                   Composite fitness scoring + pruning
    │   ├── compression.py               Twmrto compressor, RBYGlyph, NeuralMapDistiller
    │   ├── crypto.py                    Ed25519, X25519, AES-256-GCM, VDN container
    │   └── storage.py                   5-tier storage (Hot/Warm/Cold/Frozen/Compressed)
    │
    ├── nanos/                           296 Nano Definitions (children of BaseNano)
    │   ├── base.py                      BaseNano: nn.Module 3-layer MLP + RBY + PTAIE
    │   ├── data.py                      16 nanos
    │   ├── vision.py                    15 nanos
    │   ├── semantic.py                  28 nanos
    │   ├── memory.py                    21 nanos
    │   ├── indexing.py                  19 nanos
    │   ├── orchestration.py             23 nanos
    │   ├── training_nanos.py            24 nanos
    │   ├── inference.py                 21 nanos
    │   ├── hardware.py                  16 nanos
    │   ├── os_nanos.py                  13 nanos
    │   ├── user_behavior.py             12 nanos
    │   ├── communication.py             10 nanos
    │   ├── procedural.py                15 nanos
    │   ├── security.py                  13 nanos
    │   ├── meta_cognitive.py            13 nanos
    │   ├── integration.py               10 nanos
    │   ├── compression_expansion.py      6 nanos
    │   ├── specialized.py               17 nanos
    │   └── framework.py                  4 nanos: Taxonomy, Alternator, RBYDecoder, Absuleicr
    │
    ├── orchestrator/                    Runtime Coordination (parent: NanoSea)
    │   ├── ripple.py                    RippleEngine: async BFS + Hebbian wiring
    │   ├── pipeline.py                  DAG executor (inference + training pipelines)
    │   ├── scheduler.py                 PTAIEScheduler: priority heap + semaphores
    │   ├── message_bus.py               Async pub/sub + direct + dead-letter queue
    │   └── load_balancer.py             Weighted scoring (5 factors)
    │
    ├── mesh/                            P2P Networking (parent: NanoSea)
    │   ├── node.py                      MeshNode: Ed25519 identity, compute grade
    │   ├── respect.py                   RESPECT scoring (4-factor composite)
    │   ├── discovery.py                 Tracker + mDNS + subnet scan + manual
    │   ├── transport.py                 Encrypted peer-to-peer messaging
    │   ├── latency.py                   Network delay measurement
    │   ├── task_queue.py                Distributed task scheduling
    │   ├── help_request.py              Compute help ask/offer
    │   ├── global_pool.py               Shared compute pool + donation %
    │   └── peer_discovery.py            Opt-in sharing: metadata/weights/full
    │
    ├── training/
    │   └── trainer.py                   NanoTrainer: observation + evolution (tournament)
    │
    ├── compute/                         GPU abstraction (CUDA/ROCm/DirectML/Vulkan/MPS/CPU)
    ├── scanner/ae_scanner.py            Async filesystem walker → deterministic RBY seed
    ├── server/main.py                   FastAPI app: 50+ endpoints
    └── log_system/log_dumper.py         JSONL rotating log (per-channel, gzip)
```

---

## 3. Child-Parent Relationship Map

### 3.1 Node.js Stack

```
Fastify App  (apps/server/src/index.ts)
│
├── PARENT of all route modules:
│   ├── auth.ts            → calls: MemoryService, crypto
│   ├── chat.ts            → calls: LLM providers, MemoryService, rateLimiter, SSE stream
│   ├── agent.ts           → calls: EnhancedAgentLoop, MemoryService
│   ├── files.ts           → calls: filesystem/index.ts
│   ├── memory.ts          → calls: MemoryService
│   ├── models.ts          → calls: shared MODELS constant
│   ├── providers.ts       → calls: DB provider_configs table
│   ├── checkpoints.ts     → calls: CheckpointService
│   ├── errors.ts          → calls: errors/detector.ts
│   ├── knowledge.ts       → calls: CodebaseAnalyzer, RelationshipIndexService
│   ├── tiers.ts           → calls: ProjectTierEngine
│   ├── conversationIndex  → calls: ConversationIndexer
│   ├── ollama.ts          → calls: Ollama HTTP proxy
│   ├── nano.ts            → spawns Python child_process, proxies to :5100
│   ├── midwife.ts         → calls: midwife service
│   └── preview.ts         → calls: filesystem service
│
└── PARENT of shared singleton services:
    ├── SQLite DB           (better-sqlite3, single instance per process)
    └── app config          (appConfig from config.ts)


EnhancedAgentLoop  (services/agent/enhancedLoop.ts)
│
├── PARENT: agent.ts route (creates and owns the singleton instance)
│
└── OWNS / CALLS (instantiated in constructor):
    ├── MemoryService           projects, notes, conversations
    ├── CheckpointService       git snapshots
    ├── CodebaseAnalyzer        AST symbols (optional via analyzeCodebase flag)
    ├── RelationshipIndexService dependency graph
    ├── LogBloatManager         prune/summarize logs
    ├── ProjectTierEngine       hardware-adaptive scaling
    ├── ConversationIndexer     searchable history
    ├── LogWriter               persistent event log (per run)
    ├── LoopDetector            repetition guard
    ├── CodeIndexer             in-loop symbol indexer
    ├── ChunkingPipeline        context-window splitting (optional)
    ├── webSearch()             live web queries
    ├── detectPlatform()        OS/runtime detection
    ├── LLM providers           createProviderClient() / createGitHubClient()
    ├── rateLimiter             token-bucket + fallback model selection
    ├── filesystem service      readFile / writeFile / listAllFiles
    ├── errors/detector         runAllLintChecks / runTests / formatErrorsForLLM
    ├── prompts/agentPrompts    buildAgentSystemPrompt
    └── SSE event emitter       emit() → listeners → /api/agent/events
```

### 3.2 Python Stack

```
NanoSea  (NANO_train/main.py)
│
├── SPAWNED BY: nano.ts route (Node.js child_process)
│
└── OWNS (instantiated in boot() sequence):
    │
    ├── core/
    │   ├── ae.py               AE — immovable object + Merkle root + Λ-gates
    │   ├── rby.py              RBYVector  (R=perception, B=cognition, Y=execution; R+B+Y=1)
    │   ├── ptaie.py            PTAIEVector  (Priority, Temporal, Affinity, Importance, Execution)
    │   ├── ic_ae.py            IC-AE  recursive infection sandboxes
    │   ├── lifecycle.py        45-state machine  + absularity detection
    │   ├── fitness.py          composite scoring  α×perf + β×eff + γ×(1/size) + δ×usage + ε×novelty
    │   ├── compression.py      Twmrto compressor + RBYGlyph binary format + NeuralMapDistiller
    │   ├── crypto.py           Ed25519 / X25519 / AES-256-GCM / VDN container
    │   └── storage.py          5-tier LRU eviction (Hot→Warm→Cold→Frozen→Compressed)
    │
    ├── nanos/  [296 BaseNano subclasses across 19 files]
    │   └── base.py             BaseNano (nn.Module): 3-layer MLP + RBY + PTAIE
    │       └── PARENT of all 296 nano subclasses:
    │           ├── Data (16)            FileSystemDataNano, TokenizationNano, EmbeddingNano …
    │           ├── Vision (15)          ScreenCaptureNano, CodeToVisualNano, UIElementNano …
    │           ├── Semantic (28)        PythonSemanticNano, IntentNano, EntityNano …
    │           ├── Memory (21)          ConversationBufferNano, EpisodicMemoryNano, DecayNano …
    │           ├── Indexing (19)        DataIndexNano, VectorIndexNano, SearchNano, RankNano …
    │           ├── Orchestration (23)   QueryRouterNano, PipelineOrchestratorNano, LoadBalancerNano …
    │           ├── Training (24)        TrainingStrategyNano, ContrastiveLearningNano, BackpropagationNano …
    │           ├── Inference (21)       IntentDetectionNano, CodeGenerationNano, DeductiveReasoningNano …
    │           ├── Hardware (16)        CPUMonitorNano, GPUOptimizationNano, BottleneckDetectionNano …
    │           ├── OS (13)              ProcessMonitorNano, SystemEventNano, FileHandleNano …
    │           ├── User Behavior (12)   KeystrokePatternNano, WorkflowNano, SkillLevelNano …
    │           ├── Communication (10)   MessagePassingNano, WebSocketNano, EventBusNano …
    │           ├── Procedural (15)      ScaffoldGeneratorNano, TestGeneratorNano, RefactorNano …
    │           ├── Security (13)        ThreatDetectionNano, EncryptionNano, SandboxNano …
    │           ├── Meta-Cognitive (13)  PerformanceAnalysisNano, CuriosityNano, LearningToLearnNano …
    │           ├── Integration (10)     OpenAIInterfaceNano, OllamaInterfaceNano, GitIntegrationNano …
    │           ├── Compression (6)      ExpansionTriggerNano, DistillationNano, PruningNano …
    │           ├── Specialized (17)     ArithmeticNano, PhysicsSimulationNano, GameMechanicsNano …
    │           └── Framework (4)        NanoTaxonomyNano, AlternatorNano, RBYDecoderNano, AbsuleicrNano
    │
    ├── orchestrator/
    │   ├── ripple.py           RippleEngine — async BFS + Hebbian weight updates
    │   ├── pipeline.py         DAG executor (parse→expand→route→search→rank→context→generate→validate→format)
    │   ├── scheduler.py        PTAIEScheduler — priority heap + CPU/GPU semaphores
    │   ├── message_bus.py      async pub/sub + direct + dead-letter queue
    │   └── load_balancer.py    weighted scoring: capacity×0.3 + speed×0.25 + reliability×0.2 + respect×0.15 + locality×0.1
    │
    ├── mesh/
    │   ├── node.py             MeshNode  — Ed25519 identity, hardware auto-detect, compute grade
    │   ├── respect.py          RESPECT   — TaskPerf×0.4 + ResourceStability×0.3 + Conduct×0.2 + Community×0.1
    │   ├── discovery.py        Tracker + mDNS + subnet scan + manual peers
    │   ├── transport.py        Encrypted P2P messaging
    │   ├── latency.py          Network delay measurement
    │   ├── task_queue.py       Distributed task scheduling
    │   ├── help_request.py     Compute help ask/offer
    │   ├── global_pool.py      Shared compute pool with donation percentage
    │   └── peer_discovery.py   Opt-in sharing levels (metadata / weights / full)
    │
    ├── training/trainer.py     NanoTrainer: observation loop + evolution (tournament selection)
    ├── compute/                GPU abstraction layer (CUDA/ROCm/DirectML/Vulkan/OpenCL/MPS/CPU)
    ├── scanner/ae_scanner.py   Async filesystem walker → hashes → deterministic RBY seed
    ├── server/main.py          FastAPI application (50+ endpoints, OpenAI-compat /v1)
    └── log_system/log_dumper.py JSONL rotating log (per-channel, gzip, 10 MB max per file)
```

---

## 4. Decision Tree / Pipeline Schematics

### 4A. Chat Request Pipeline

```
Browser (ChatPanel.tsx)
  │
  │  POST /api/chat/send  {message, model, mode, projectId}
  ▼
chat.ts (route)
  │
  ├─ Parse provider from model prefix (github / ollama / groq / …)
  │
  ├─ getClientFromDb()  ──►  OpenAI-compat client
  │         │
  │         └─ NULL?  ──►  401 "Not authenticated"
  │
  ├─ rateLimiter.canRequest(model)
  │         ├─ denied  ──►  429 + retryAfterMs + fallbackModel
  │         └─ allowed  ↓
  │
  ├─ memory.createConversation()  or  resume existing
  │
  ├─ Build messages array:
  │     [system_prompt, memory_context, history, user_message]
  │
  ├─ streamChatResponse(client, messages)
  │     └─ chunk-by-chunk  ──►  SSE  ──►  ChatPanel EventSource
  │
  └─ On complete:  memory.saveNote(auto_summary)
```

---

### 4B. Agent Loop Pipeline

```
Browser (AgentControls.tsx)
  │
  │  POST /api/agent/start  {projectId, task, model, options}
  ▼
agent.ts (route)
  │
  ├─ Validate: projectId required, task required, no agent already running
  ├─ new EnhancedAgentLoop(db, config)
  └─ agent.start()  — async; events stream via GET /api/agent/events (SSE)

════════════════════ EnhancedAgentLoop.run() ════════════════════

  [INIT PHASE]
  ├─ detectPlatform()                      OS / runtime fingerprint
  ├─ analyzer.analyzeCodebase()            (if analyzeCodebase=true)
  ├─ relationshipIndex.getContext()        dependency graph snapshot
  ├─ tierEngine.getProjectTier()           hardware-adaptive config
  └─ checkpoint.create()                   initial git snapshot

  [ITERATION LOOP]  ──  repeats until done=true | maxIterations | abort
  │
  ├─ Drain messageQueue  (high-priority first)
  │
  ├─ Build system prompt
  │     buildAgentSystemPrompt(platform, tier, relationships, logs, history)
  │
  ├─ Assemble context block:
  │     tierContext + relationshipContext + logHealthContext + conversationIndexContext
  │
  ├─ [smartChunking = true?]
  │   └─ ChunkingPipeline.process(messages)
  │         └─ split into sub-tasks  ──►  multiple LLM calls  ──►  merged output
  │
  ├─ [smartChunking = false]
  │   └─ completeChatResponse(provider, messages)
  │
  ├─ parseStructuredOutput(response)
  │     ──►  { summary, filesChanged[], questionsForUser[], nextSteps[], done }
  │
  ├─ Apply file changes:  writeFile() for each changed file
  │
  ├─ [autoFixErrors = true]
  │   └─ runAllLintChecks()  ──►  formatErrorsForLLM()  ──►  inject + retry
  │
  ├─ [autoRunTests = true]
  │   └─ runTests()  ──►  formatTestsForLLM()  ──►  inject into next iteration
  │
  ├─ loopDetector.check()
  │     └─ repetition detected?  ──►  abort with LOOP_DETECTED event
  │
  ├─ [iteration % checkpointEvery = 0]
  │   └─ checkpoint.create()
  │
  ├─ memory.saveNote(agent_log)
  ├─ conversationIndexer.index()
  └─ emit(events)  ──►  SSE  ──►  AgentControls.tsx

  [TERMINATION]
  ├─ done = true        ──►  state = 'complete'
  ├─ maxIterations hit  ──►  state = 'complete'
  └─ consecutiveErrors ≥ 3  ──►  state = 'error'  (with exponential backoff)
```

---

### 4C. Nano Sea Boot Pipeline — Big Bang (12 Steps)

```
nano.ts route:  POST /api/nano/start
  └─ child_process.spawn('python main.py', nanoDir)
       ▼
NanoSea.__init__()  +  NanoSea.boot()
│
├─ STEP 1  Hardware Detection
│   compute/gpu_abstraction.py
│   ──►  Grade = (CPU_cores×0.2) + (RAM_GB×0.15) + (GPU_VRAM_GB×0.4) + (CUDA×0.25)
│   ──►  Tier = 1 (weak CPU) … 5 (supercomputer)
│
├─ STEP 2  AE Scan  (background task)
│   scanner/ae_scanner.py
│   ──►  async filesystem walk (200 files/sec, throttled)
│   ──►  file hashes  ──►  Merkle root  ──►  deterministic RBY seed
│
├─ STEP 3  Spawn ALL ~296 Nanos
│   for each type in NANO_REGISTRY (@register_nano decorated classes):
│     BaseNano(input=128, hidden=64, output=64)   [3-layer MLP, <50K params]
│     apply AE seed weight modulation             (each install is unique)
│     assign RBYVector + PTAIEVector
│     state = DORMANT
│
├─ STEP 4  Wire Ripple Connections  (nervous system)
│   orchestrator/ripple.py::auto_wire()
│   ──►  affinity-weighted directed edges between nanos
│   ──►  Hebbian learning: connections strengthen on co-activation
│
├─ STEP 5  Start Message Bus + Scheduler
│   orchestrator/message_bus.py::start()   async pub/sub, dead-letter queue
│   orchestrator/scheduler.py::start()     PTAIE priority heap, CPU/GPU semaphores
│
├─ STEP 6  Start Mesh Node  (if meshEnabled)
│   mesh/node.py::start()         generate/load Ed25519 identity
│   mesh/discovery.py::start()    tracker + mDNS + subnet scan
│   mesh/transport.py::start()    encrypted TCP connections
│   mesh/respect.py               initialize RESPECT score tracking
│
├─ STEP 7  Start FastAPI Server
│   server/main.py  ──►  uvicorn on port 5100
│   50+ endpoints including /v1/chat/completions (OpenAI-compat)
│
├─ STEP 8  Start Background Training Loop
│   training/trainer.py::_training_loop()
│   ──►  observe LLM API calls  ──►  TrainingPair(input, target, quality)
│   ──►  CharTokenizer.encode  ──►  nano.forward()  ──►  MSE loss  ──►  backprop
│   ──►  checkpoint every N epochs + RBY lifecycle_shift + fitness update
│
├─ STEP 9  Start Lifecycle Monitor  (every 5 min)
│   main.py::_lifecycle_loop()
│   ──►  fitness.compute_fitness() for all nanos
│   ──►  evolve() bottom performers  (tournament, every 10 min)
│   ──►  lifecycle.check_absularity(dV/dt, d²V/dt²)
│   ──►  storage.maintain_tiers()   (evict Cold→Frozen as needed)
│
└─ "The sea is alive."
```

---

### 4D. Inference Ripple Pipeline

```
POST /infer  (FastAPI, port 5100)
  ▼
orchestrator/pipeline.py  [DAG — sequential + parallel stages]
  │
  ├─ parse       ──►  semantic/data nanos tokenize the query
  ├─ expand      ──►  IntentNano + EntityNano activate  (RBY: Perception phase)
  ├─ route       ──►  QueryRouterNano  selects nano cluster
  ├─ search      ──►  SearchNano  ──►  VectorIndexNano  (embedding lookup)
  ├─ rank        ──►  RankNano  (PTAIE-scored results)
  ├─ context     ──►  memory nanos inject episodic context
  ├─ generate    ──►  CodeGenerationNano / DeductiveReasoningNano
  ├─ validate    ──►  SandboxNano + ThreatDetectionNano
  └─ format      ──►  output nanos  ──►  response payload

Ripple propagation  (runs in parallel with pipeline):
  Query tokens
    ──►  hit specific nanos  (like stones in a pond)
    ──►  RippleEngine.propagate()  [async BFS]
             ├─  adjacent nanos activate  (affinity-weighted edges)
             ├─  refractory period prevents re-fire within same query
             ├─  activation decays over hop distance
             └─  intersecting ripples  =  inference signal strength
```

---

### 4E. Training Data Pipeline (Midwife → Nano)

```
Browser (MidwifePanel.tsx)
  │
  │  POST /api/midwife/generate  {topic, type}
  ▼
midwife.ts route  ──►  midwife service
  ├─ Ask LLM for structured training examples
  ├─ Format as  TrainingPair { input, target, quality, category }
  └─ Save to NANO_train/NANO_corpus/  (JSONL)
       ▼
training/trainer.py  (background loop polling NANO_corpus/)
  │
  ├─ CharTokenizer.encode_input()    ──►  float tensor
  ├─ CharTokenizer.encode_target()   ──►  float tensor
  ├─ target_nano.forward(input_tensor)
  ├─ F.mse_loss(output, target)
  ├─ loss.backward()
  ├─ torch.nn.utils.clip_grad_norm_(params, 1.0)
  └─ optimizer.step()

  Every N epochs:
  ├─ checkpoint save  (PyTorch .pt + JSON metadata)
  ├─ RBY lifecycle_shift  (R↓ B↑ as nano matures)
  └─ fitness update  (accuracy + usage_frequency tracked)

Evolution (every 10 min via lifecycle monitor):
  trainer.evolve(nano, population_size=4)
  ├─ clone parent nano × 4
  ├─ apply Gaussian weight perturbation to each clone
  ├─ evaluate fitness on available training data
  └─ tournament: keep the best, replace the original
```

---

### 4F. Lifecycle / Compression Cycle

```
Nano State Machine:

  DORMANT
    │  (boot / first training data arrives)
    ▼
  TRAINING  ──────────────────────────────────────────────┐
    │  (training_loss < threshold)                        │
    ▼                                                     │
  ACTIVE                                                  │
    │  (inference request routed to this nano)            │
    ▼                                                     │
  INFERENCE                                               │
    │                                                     │
    ├─ [fitness OK]  ──►  back to ACTIVE ────────────────┘
    │
    └─ [fitness low]  ──►  evolve()  (tournament)
           │
           ├─ [evolved nano wins]  ──►  ACTIVE
           └─ [absularity detected]
                  │
                  │  lifecycle.check_absularity(dV/dt, d²V/dt²)
                  │  condition:  dV/dt ≈ 0  AND  d²V/dt² ≈ 0
                  ▼
              COMPRESSING
                  │
                  ├─ compression.py::Twmrto  text compression
                  ├─ compression.py::RBYGlyph  binary encode (zlib + hash)
                  └─ compression.py::NeuralMapDistiller
                  ▼
              DISTILLATION  ──►  DEPOSIT  (into AE Λ-gated store)
                  ▼
              DEAD  or  REBIRTH  (new cycle, new RBY seed, increment cycle_id)

Tiered Storage eviction (storage.py):

  HOT  (RAM, immediate)
    │  [LRU / importance decay]
    ▼
  WARM  (SSD, fast)
    │
    ▼
  COLD  (HDD, slow)
    │
    ▼
  FROZEN  (cloud/remote, very slow)
    │
    ▼
  COMPRESSED  (RBYGlyph — requires expansion to use)
```

---

## 5. Tooling Calls Per Node

| Node | Tooling Calls / API Surface |
|---|---|
| **ChatPanel.tsx** | `POST /api/chat/send` (SSE), `GET /api/models/list`, `GET /api/memory/notes` |
| **AgentControls.tsx** | `POST /api/agent/start`, `GET /api/agent/events` (SSE), `POST /api/agent/stop`, `POST /api/agent/pause`, `POST /api/agent/queue-message` |
| **NanoSeaControls.tsx** | `POST /api/nano/start`, `POST /api/nano/stop`, `GET /api/nano/status`, `GET /api/nano/logs`, `PUT /api/nano/config`, `POST /api/nano/env-check` |
| **MemoryPanel.tsx** | `GET/POST/PUT/DELETE /api/memory/notes`, `GET /api/memory/projects`, `GET /api/memory/search` |
| **FileBrowser.tsx** | `GET /api/files/tree`, `GET /api/files/read`, `POST /api/files/write`, `DELETE /api/files/delete` |
| **CheckpointViewer.tsx** | `GET /api/checkpoints/list`, `POST /api/checkpoints/create`, `POST /api/checkpoints/rollback` |
| **RateLimitDashboard.tsx** | `GET /api/providers/rate-limits` |
| **MidwifePanel.tsx** | `POST /api/midwife/generate`, `GET /api/midwife/status` |
| **ProviderSettings.tsx** | `GET/POST /api/providers`, `POST /api/providers/test` |
| **chat.ts route** | `streamChatResponse()`, `rateLimiter.canRequest()`, `memory.createConversation()`, `memory.saveNote()` |
| **agent.ts route** | `new EnhancedAgentLoop()`, `agent.start()`, `agent.stop()`, `agent.getStatus()`, `agent.queueMessage()` |
| **nano.ts route** | `child_process.spawn('python main.py')`, proxy `GET/POST http://localhost:5100/*` |
| **EnhancedAgentLoop** | `detectPlatform()`, `analyzer.analyzeCodebase()`, `checkpoint.create()`, `rateLimiter.canRequest()`, `completeChatResponse()`, `ChunkingPipeline.process()`, `writeFile()`, `readFile()`, `listAllFiles()`, `runAllLintChecks()`, `runTests()`, `loopDetector.check()`, `webSearch()`, `memory.saveNote()`, `conversationIndexer.index()`, `emit(SSE events)` |
| **NanoSea (Python)** | `ae_scanner.scan()`, `spawn_nanos()`, `ripple.auto_wire()`, `message_bus.start()`, `scheduler.start()`, `mesh_node.start()`, `uvicorn.run(fastapi_app)`, `trainer.observe()`, `lifecycle_loop()` |
| **RippleEngine** | `propagate(query_tokens)`, `hebbian_update(co_fired_pairs)`, `set_refractory(nano_id)` |
| **PTAIEScheduler** | `schedule(task, ptaie_vector)`, `urgency_score()`, `acquire_semaphore(cpu\|gpu)` |
| **NanoTrainer** | `observe(llm_input, llm_output)`, `_training_loop()`, `evolve(nano, population_size=4)`, `checkpoint_save()` |
| **MeshNode** | `generate_identity()`, `detect_hardware()`, `connect(peer)`, `send_encrypted(msg)`, `donate_compute(pct)` |
| **RESPECT system** | `score = TaskPerf×0.4 + ResourceStability×0.3 + Conduct×0.2 + Community×0.1` |
| **LoadBalancer** | `score = capacity×0.3 + speed×0.25 + reliability×0.2 + respect×0.15 + locality×0.1` |
| **FastAPI server (port 5100)** | `/v1/chat/completions` (OpenAI-compat), `/infer`, `/train`, `/status`, `/nanos`, `/mesh-status`, `/pool-status`, `/peers`, `/checkpoints` |

---

## 6. Summary Ontology Graph

```
personal_IDE
│
├── PRESENTATION LAYER
│   └── Web  (React 19 + Vite, port 5173)
│       ├── State: Zustand stores (auth, chat, agent, file, project, midwife)
│       └── Components  ──HTTP/SSE──►  Application Layer
│
├── APPLICATION LAYER
│   └── Server  (Fastify 5 + SQLite, port 3001)
│       ├── Routes  (HTTP surface, 16 modules)
│       │     └── delegate to ──►  Services
│       ├── Services/LLM         ──►  external LLM providers  (OpenAI-compat HTTP)
│       ├── Services/Agent       ──►  EnhancedAgentLoop  (orchestrates all services)
│       ├── Services/Memory      ──►  SQLite notes / projects / conversations
│       ├── Services/Analysis    ──►  codebase, relationships, tiers, logs, conversations
│       ├── Services/Checkpoint  ──►  git snapshots
│       ├── Services/Errors      ──►  lint + test runner
│       └── Services/Midwife     ──►  training data generator
│
├── ML RUNTIME LAYER
│   └── Nano Sea  (Python + FastAPI, port 5100)
│       ├── AE Framework         ──►  physics / math foundation for all nano ops
│       ├── 296 Nanos (19 categories)  ──►  specialized 3-layer MLPs (<50K params each)
│       ├── Orchestrator         ──►  ripple BFS, pipeline DAG, scheduler, bus, balancer
│       ├── Mesh Network         ──►  P2P encrypted compute sharing
│       ├── Trainer              ──►  observe LLM calls → MSE backprop → tournament evolution
│       ├── Lifecycle Monitor    ──►  fitness eval → absularity → compression → rebirth
│       └── FastAPI              ──►  OpenAI-compat /v1/chat/completions endpoint
│
└── SHARED LAYER
    └── packages/shared  (TypeScript types + model config)
        ├── consumed by: Server (type safety, model definitions)
        └── consumed by: Web    (type safety, provider constants)
```

---

## 7. Key Cross-Cutting Wires (Gaps)

These are the **currently unconnected or partially connected joints** visible in the codebase:

| Wire | From | To | Status |
|---|---|---|---|
| **Nano inference → Chat** | FastAPI `/v1/chat/completions` | `providers.ts::createNanoClient()` | ⚠️ Client exists; nano models untrained so output is noise |
| **Midwife → Nano corpus** | `midwife.ts` generates JSONL | `training/trainer.py` polls `NANO_corpus/` | ⚠️ Paths must align between server and Python process |
| **Compression trigger** | `lifecycle.check_absularity()` returns true | `compression.py` engine | ⚠️ Engine complete; automatic triggering not yet active |
| **Self-supervised training** | Architecture spec | `training/trainer.py` | ❌ Masked prediction on user code — not implemented |
| **Autonomous idle training** | `global_pool.py` idle flag | LLM-assisted data generation | ⚠️ Flag exists; no LLM data-gen loop yet |
| **Nano specialization** | 296 registered nano types | Identical MLP forward pass in all | ⚠️ Domain-specific forward passes not yet written |
| **Nano-to-nano collaboration** | One nano's output | Adjacent nano's input | ❌ Nanos do not yet read each other's output |
| **Tag registry routes** | `devtag/plantag/buildtag` (spec) | `apps/server/src/routes/` | ❌ No `/api/tags` route registered in `index.ts` |
| **God Factory agent** | Tier-5 meta-agent (spec) | Any route or service | ❌ Architecture only; no code |
| **Color memory reconstruction** | RBYGlyph binary format | Nano weight restoration | ⚠️ Format defined; no nano has been compressed yet |
