# PERSONAL IDE — UNIFIED ARCHITECTURE MANIFESTO
### Synthesized from push_limit_1 through push_limit_5 • May 2026
### All previous assumptions audited, wrong ones vetoed, gaps filled, plan finalized.

---

## PART 0 — THE DREAM (What You Are Actually Building)

You are building a **three-layer autonomous software civilization**:

```
LAYER 1 — The God Factory          (Personal IDE, self-improving)
LAYER 2 — The Project Factory      (External project dev, feeds Layer 1)
LAYER 3 — AIOS IO Global HPC       (Distributed peer-to-peer compute mesh)
```

The simplest description of the end state:

> A user types "build me a game like Call of Duty." They go to sleep.
> When they wake up, the system has: scaffolded the project, assigned specialist agents to each domain (rendering, physics, audio, networking), detected that Unity/Unreal are not available and started building a minimal renderer, used computer vision models to evaluate what the visuals look like, iterated, tested, benchmarked, and written a self-critique with improvement jobs. It never stopped. It knew it was never done.

That is not science fiction. It is the design already embedded in this codebase. What is missing is the **pipeline connecting the 60–70% of built systems to each other**.

---

## PART 1 — WHAT HAS BEEN IMAGINED VS. WHAT HAS BEEN BUILT

### 1.1 — What You Imagined (From push_limit_1)

| Imagined Capability | Status |
|---|---|
| Crawlers that understand the codebase deeply | **30% built** — regex/SQL counters only; semantic layer missing |
| Memory that grows smarter over time | **40% built** — CRUD works, no scoring/pruning/embedding |
| Model routing based on what each model is actually good at | **60% built** — Employer Crawler derives roles from blame; loop doesn't use it |
| Agent that never stops improving unless you tell it to | **50% built** — continuous mode + runPersistence exist; no true 24/7 goal tracking |
| Toolbox that grows from every action the agent takes | **20% built** — OpenClaw scaffold exists, completely disconnected from agent loop |
| Distributed compute across multiple machines | **15% built** — NANO mesh designed in Python, zero TypeScript bridge |
| Computer vision evaluation of visual output | **5% built** — Ollama catalog has vision models; no analysis pipeline |
| Sub-agents as autonomous employees | **25% built** — SpawnAuthority governance is production-quality; ~13/15 named agents are stubs |
| Always searching for improvements even without prompting | **35% built** — IdleScanner + SubsystemScheduler run; but IdleScanner is just regex grep |
| God Factory understands external project quality as self-reflection | **0% built** — Project Factory memory feed to God Factory not connected |

### 1.2 — VETOES: Things Previous Passes Got Wrong

**VETOED: The 296-nano typed pipeline.**
Previous pass 1 treated `BaseNano` with 296 subclass types as the architecture. This is **completely dead**. The `DELIVERY_README.md` explicitly marks 11 of 13 architecture documents as 63–100% obsolete. The v2 architecture is a **single `Nano` class** organized into swarm layers with learned routing. The Python `NANO_train/nanos/` directory is legacy. Do not build on it.

**VETOED: "Employer Crawler doesn't exist" (Pass 1).**
It exists at `routes/employer.ts`. It reads blame records, derives model roles, and writes `employer_analysis`. The gap is not its absence — it's that the **enhanced agent loop never reads `employer_analysis`** to pick models. The learning signal exists; the consumer doesn't use it.

**VETOED: "Sub-agents are all missing" (Pass 2).**
Corrected in Pass 3: Six forensic sub-agents (Conflict, DeadTag, Regression, Diff, Integration, ContextWindow) **are fully implemented**. What is missing are the higher-order autonomous agents: skeptic_agent, builder_agent, command_agent, memory_crawler, etc. These are correctly missing.

**VETOED: "No dependency graph" (Pass 1).**
`RelationshipIndexService` (`services/analysis/relationshipIndex.ts`) IS a full dependency graph with symbol extraction across 10+ languages, cross-file import resolution, and conflict detection. It exists. It's just not auto-wired into God Factory's context.

**VETOED: "No smart chunking" (Pass 1).**
`services/llm/chunkingPipeline.ts` implements complete chunk-and-bridge processing with LLM-generated running summaries between chunks. The chunking system is built. What's missing is semantic clustering *before* chunking (related code clustered together before being sent to the model).

**VETOED: "Memory isn't connected to God Factory".**
Partially wrong — `contextAssembly.ts` pulls memory notes at priority level 5. Memory IS injected into the agent context. The real gap: memory has no embedding-based scoring, no pruning by quality, and the priority order (memory ranked lower than code content) means memory gets cut first when context is tight.

**VETOED: "Feature flags don't exist" (Pass 2).**
`routes/features.ts` IS the runtime toggle endpoint for web_search, meshEnabled, agentSpawnEnabled, nanoTrainingEnabled. What's wrong: flags are in-memory only (reset on server restart). Not a gap in existence, a gap in persistence.

**VETOED: "No crash recovery".**
`godFactory/runPersistence.ts` implements full crash recovery with heartbeat monitoring. When server restarts, stale runs are detected, marked 'crashed', and their jobs are requeued. This is production-quality durable operation.

**VETOED: "No rate limit handling".**
`services/llm/rateLimiter.ts` reads actual GitHub API response headers (`x-ratelimit-remaining`, `x-ratelimit-reset`) and enforces a safety margin at 10% remaining. Models that 404 are blacklisted with TTL. The fallback chain in `modelSwitcher.ts` auto-switches provider AND client when switching models.

---

## PART 2 — THE COMPLETE SYSTEM INVENTORY

### 2.1 — BUILT AND WORKING (Confirmed Across All 5 Passes)

**Core Agent Infrastructure:**
- `EnhancedAgentLoop` — plan→execute→evaluate with spec injection, exploration gate, loop detector
- `LoopDetector` — hash-based repetition detection with 20-iteration history
- `StabilityMonitor` — 5 rollback triggers (test failure, blame drop, loop detection, rejection spike, process death)
- `RunPersistence` — crash recovery with heartbeat monitoring, requeue on restart
- `AutoAnswers` — pattern-matches technical questions, prevents agent blocking, enables true 24/7 operation
- `ModelSwitcher` — multi-provider fallback with synchronized client recreation
- `ContextWindowManager` — 6-priority-level slot packer, 5 tier ceilings, forensic truncation logging
- `ContextAssembly` — pulls from 4+ analyzers simultaneously with 20s file cache
- `ToolPolicyGate` — 12 tools defined, 5 disabled by default, feature flags endpoint
- `ToolGatekeeper` — command-level risk scoring, blocked pattern list, requires_review threshold

**Codebase Understanding (Three Parallel Systems):**
- `ProjectStateCrawler` — regex-based drift detection, snapshot comparison, devtag writes
- `HierarchicalCodeIndex` — AST-based token-budget tree, `peek/expand/find` API
- `RelationshipIndexService` — full symbol graph, imports, conflict detection, `formatForLLM()` output

**Analysis Services:**
- `ConversationIndexer` — 70+ hotword patterns, decision extraction, file reference detection
- `ProjectTierEngine` — 4-tier classifier (Prototype→Global), domain-language routing
- `ModuleClustering` — Jaccard similarity clustering across import sets
- `DepGraph` — dependency graph for 12 languages, entry point detection, cycle detection
- `LogManager` — tiered retention with hot/warm/cold archival policies

**Memory:**
- `MemoryService` — SQLite CRUD, 10K note capacity, scope enforcement (Project Factory blocked from total scope)
- Corpus manifesto system — generates 512-token compressed project summary via LLM, stored as memory note

**Crawlers (What Runs on the Subsystem Scheduler Every 15 Seconds):**
- `ProjectStateCrawler` — structural drift
- `SuggestedJobsCrawler` — protocol cycling (11 protocols), blame-derived jobs
- `GapAnalysis` (5 sub-agents) — coverage analysis, pattern recognition, debt tracking, tag health, agent performance
- `IdleScanner` — regex linter (TODO/console.log/FIXME/async-without-catch)
- `EmployerCrawler` — blame→model role derivation, cooldown overrides, retirement decisions

**Sub-Agents (Implemented):**
- `ConflictSubAgent` — devtag claim registry, deadlock detection, parallel edit prevention
- `DeadTagSubAgent` — filesystem verification of all active devtags, retirement at 10 cycles
- `RegressionSubAgent` — plantag satisfaction verification after each buildtag commit
- `DiffSubAgent` — pre-write buildtag comparison vs. plantag requirements
- `IntegrationVerificationSubAgent` — post-write 16-relationship-type crawl
- `ContextWindowSubAgent` — context budget management

**Sub-Agents (Stub / Governance Only):**
- `skeptic_agent`, `builder_agent`, `command_agent`, `memory_crawler`, `project_description_crawler`, `waiting_sub_agent` — named in SpawnAuthority, not yet implemented

**Persistent Agents:**
- `RegressionAgent` — systemic regression pattern detection (3-in-5-cycle threshold)
- `VersionControlAgent` — build step commit recording, rollback index
- `ParallelCoordinatorAgent` — parallel-safe step partitioning, stall detection
- `NanoLiaisonAgent` — nano health monitoring, devtag:nano translation map

**LLM Infrastructure:**
- 11+ provider clients (GitHub, Anthropic, DeepSeek, OpenAI, Groq, HuggingFace, Cohere, Mistral, Gemini, Together, OpenRouter, Ollama, LM Studio, Nano Sea)
- `ChunkingPipeline` — recursive chunk+bridge processing with LLM-summarized continuity
- `RateLimiter` — header-based real limits, dead model blacklist, fallback suggestion
- Smart prompts — 3-part truncation-resistant structure (CRITICAL_FORMAT_HEADER + body + SCHEMA_REMINDER_FOOTER)
- Compressed prompt variant for 8K-cap models
- `DatasetBuilder` — every agent iteration captured as training pair (fires in every LLM call path)

**Lifecycle + Quality Gates:**
- `TagRegistry` — full devtag/plantag/buildtag lifecycle with 16 relationship types
- `LifecycleStateMachine` — canonical status contract, enforced FSM transitions
- `SeverityEscalation` — 6 auto-escalation conditions, warning→critical upgrade paths
- `MilestoneEmitter` — writes loop_milestones + quality_snapshots per iteration
- `CheckpointService` — git-based checkpoints triggered by StabilityMonitor
- `SpawnAuthority` — 15-agent-type governance chart, tier-gated confirmation, concurrency limits

**Tool Ecosystems:**
- `OpenClaw` — skills system with 8 built-in skills + Lobster Workflow chaining (completely disconnected from agent loop)
- `Terminal` — persistent pty terminals with session management
- `WebSearch` — web search tool (disabled by default, feature flag controlled)
- `Fleet` — 6-role parallel agent orchestration (lead/implementer/debugger/tester/reviewer/documenter)
- `SiliconFactory` — full parallel task lifecycle with IAP messaging, sync locks, state snapshots, crash recovery (orphaned from main pipeline)

**NANO Sea (TypeScript Side):**
- `ObservationTrainer` — fires on every LLM call, POSTs to NANO server (port 5100) with fire-and-forget
- `MidwifeService` — 9 task types, model assignment, parallel orchestration, rate limit rotation
- `ProcessManager` — Python NANO server start/stop/restart management
- NanoSeaControls UI + NanoLiaisonAgent (health monitoring)

**Community + GitHub:**
- `CommunityHubPanel` — full GitHub Discussions UI (Feed/Thread/Report/Dev Tools)
- `GitHubService` — Discussions API, Issues API, Comments, Reactions
- Dev Tools tab (owner-gated): analyzeDiscussion, draft management, close/answer tools

**UI Architecture:**
- 22 ActivityBar views, all fully wired to SidePanel
- `TheGodFactory.tsx` — new God Factory with enhanced loop, Intel Panel, tool approval dialogs
- `CopilotStudio.tsx` — old God Factory (still live, now legacy)
- `ProjectFactoryWizard` — 8 templates with 4 workflow modes including `scale_research` for distributed ML
- `FirstRunWizard` — 5-step onboarding (welcome → provider → ollama → strategy → done)
- `ModelCycleStrategyPanel` — live model probe with latency sorting, manual override of Employer Crawler
- `BrainstormPad` — user ideas → MemoryService notes → future agent context

### 2.2 — THE NANO SEA v2 SPECIFICATION (Architecture Only — Not Yet Built)

**What is proven (30 experiments, quantified):**
- `SharedEmbedding → [SwarmLayer × 3] → SharedOutputHead`
- Each SwarmLayer: ChromaticIndex KD-tree (50 candidates, O(log N)) → Soft-k Router (differentiable, reverse cumsum) → 8 active nanos per token → optional Crosstalk cross-attention (gate starts at 0) → weighted sum + residual
- PPL=4.977 proven on test_30v3. 3 layers optimal at ~500K total params.
- RBY simplex coordinates (r+b+y=1) used for ChromaticIndex routing (Aitchison distance metric)
- UF/IO dynamics govern exploration vs. stabilization
- Touch tensor logs nano activation per input — feeds lifetime fitness scoring
- Cosmic cycle: train → compress → deposit → rebuild (improves over time)

**What is NOT yet built (7 phases, all pending):**
Phase 1: Core swarm (SharedEmbedding, SwarmLayer, ChromaticIndex, Soft-k Router)
Phase 2: Routing (Crosstalk gates, load balancing)
Phase 3: Training (SwarmTrainer, ValidatedMidwife, IndependenceTracker)
Phase 4: Lifecycle (NanoSpawner, FitnessEvaluator, CompressionEngine, DepositStore, CosmicCycleManager, TouchTensor)
Phase 5: Memory (GPU↔CPU↔Disk tiering, LRU eviction, prefetch)
Phase 6: Mesh (mDNS peer discovery, federated averaging, trust scoring, replication)
Phase 7: Integration (HTTP FastAPI port 5100, replaces LLM calls in IDE agent)

**rby.py and ptaie.py are valid** — keep them. They implement exactly what v2 needs (Aitchison distance, UF/IO dynamics, PTAIE scheduling math). The rest of the Python NANO_train directory is legacy.

### 2.3 — THE THREE-PRODUCT ARCHITECTURE (AIOS IO)

```
┌─────────────────────────────────────────────────────────────────┐
│                        LAYER 1: GOD FACTORY                      │
│  Self-improving IDE agent. Develops Personal IDE itself.          │
│  Has: full crawlers, semantic memory, model routing, Intel Panel  │
│  Output: better agent → better Project Factory → better AIOS IO  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ memory feed (project quality data)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      LAYER 2: PROJECT FACTORY                     │
│  External project development agent. Same framework as GF.        │
│  Has: project-scoped memory, project-scoped crawlers              │
│  Feeds: quality data, failure patterns → God Factory              │
│  God Factory auto-criticizes based on external project outcomes   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ compute + training data
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      LAYER 3: AIOS IO GLOBAL HPC                  │
│  Peer-to-peer mesh of all Personal IDE instances.                 │
│  Heterogeneous hardware (Pi → 3090). Competes with Gensyn/BOINC.  │
│  Nanos train, compress, federate across all nodes.               │
│  No blockchain, verification via TouchTensor fingerprinting.      │
└─────────────────────────────────────────────────────────────────┘
```

---

## PART 3 — THE COMPLETE GAP MAP

### Gap Group A — The Semantic Intelligence Gap (Most Critical)

**A1: Devtags are name-only with no semantic content.**
Current devtags are structural symbols: function name + file path + line number. They have no description of what the function does, no quality score, no test coverage flag. Without semantic content, devtag-based retrieval is string matching, not intelligent context assembly.
**Fix:** Add `semantic_embedding` and `semantic_description` columns to devtags. Run a local embedding model (nomic-embed-text, already in Ollama catalog) over every devtag on the PSC scan cycle.

**A2: Three codebase analyzers with zero cross-talk.**
PSC, HierarchicalCodeIndex, and RelationshipIndexService each analyze the same codebase independently. None share data. `formatForLLM()` in RelationshipIndexService produces the best structured context — but it's never injected into the God Factory system context automatically.
**Fix:** Unified CrawlerCoordinator — single service that runs all three, merges results, writes to a unified `codebase_intelligence` table, auto-injects into contextAssembly.ts as a v3 context string slot.

**A3: Memory search is keyword-only (`LIKE '%word%'` SQL).**
GitHub Copilot uses vector embeddings for semantic memory retrieval. Your memory is text-string search. A note about "authentication middleware" won't surface when querying "how does login work" unless the exact word appears.
**Fix:** Local embedding pass over every new memory note (nomic-embed-text, 512-token model, runs offline). Store vector in `memory_embeddings` table. Replace SQL search with cosine similarity search.

### Gap Group B — The Pipeline Disconnection Gap

**B1: Employer Crawler output never reaches the agent loop.**
Employer Crawler correctly derives `recommended_role`, `task_types`, `strengths`, `weaknesses` per model from blame data. The enhanced agent loop calls `resolveModelStrategy()` which reads `modelStrategy` settings, NOT `employer_analysis`. The learning signal is computed but never consumed by the agent.
**Fix:** Wire `resolveModelStrategy()` to query `employer_analysis` first; use `modelStrategy` settings as override layer only.

**B2: DatasetBuilder → Midwife → NANO training handoff is broken.**
DatasetBuilder writes JSONL training pairs to disk. Midwife has an independent queue. No file watcher bridges them. Training data accumulates but never reaches the nano swarm.
**Fix:** Midwife file watcher on `NANO_train/nano_data/training/agent_dataset/`. Process new JSONL files on arrival. Mark processed files to avoid re-ingestion.

**B3: OpenClaw skills unreachable from the agent loop.**
The entire OpenClaw skill ecosystem (8 built-in skills + Lobster Workflow) is manual-only. The agent cannot call `claw:security-scan`, `claw:test-gen`, or any skill as a tool action.
**Fix:** Register each OpenClaw skill as a ToolPolicyGate tool. Add `execute_skill(skillId, params)` as a named tool in the agent loop and God Factory tool context.

**B4: SiliconFactory is a parallel orphan.**
SiliconFactory has full task lifecycle, IAP messaging, sync locks, state snapshots, spec contracts — and connects to nothing. The God Factory and Fleet runner don't know it exists. There is one known connection (`reindexSiliconTests` called from fleet start) which proves the bridge was intended.
**Fix:** God Factory's high-complexity jobs (multi-file refactors, architectural changes) should route through SiliconFactory for coordinated execution with IAP messaging between sub-tasks. Merge or bridge the two orchestration systems.

**B5: StabilityMonitor data never reaches SuggestedJobsCrawler.**
StabilityMonitor detects system degradation (test failures, blame score drops, rejection spikes) and triggers rollback. But SuggestedJobsCrawler and GapAnalysis don't know the system was in a degraded state before generating new jobs. New jobs get created without knowing the system just rolled back.
**Fix:** StabilityMonitor writes a `system_health_event` to a new table. SuggestedJobsCrawler reads health events before each protocol cycle and adjusts job priorities (after a rollback, regression_hardening jobs get elevated priority).

**B6: Spec Contract validation is not in the quality gate.**
`setSpecContract` / `validateSpecContract` exist as routes. Nothing in `responseProcessing.ts` calls `validateSpecContract` before applying file changes. The behavioral contract system exists but is bypassed.
**Fix:** After every agent file write, `validateSpecContract` runs on the modified symbols. Violations are written as forensic entries and block the buildtag commit.

**B7: Feature flags reset on restart.**
Runtime feature flags (web_search, mesh, agent spawn, nano training) are in-memory. Server restart disables everything a user enabled.
**Fix:** Persist flags to `app_kv` table on every toggle. Read from `app_kv` on startup.

### Gap Group C — The Intelligence Gap (Crawlers Need LLM Brains)

**C1: IdleScanner is grep, not intelligence.**
Current: walks files looking for `TODO`, `console.log`, `// FIXME`, `async` without `catch`. Real AI behavior: understand architectural patterns, identify design smell, suggest refactors based on project context.
**Fix:** Add LLM-powered reflection pass after the regex pass. Feed each flagged file's context (from HierarchicalCodeIndex) to a fast model (3B local). Generate semantic improvement suggestions, not just lint warnings. Cost: ~0.1s per file with a local 3B model.

**C2: GapAnalysis sub-agents count things instead of reading code.**
All 5 GapAnalysis sub-agents are SQL aggregators. They count how many buildtags failed, how many tags went missing. They can't say "your auth.ts route has no input validation" because they never read auth.ts.
**Fix:** Each GapAnalysis sub-agent gets a code-reading tool. Coverage analysis reads the actual code files for the missing plantags. Pattern recognition runs the dependency graph. Gap scan returns actual code evidence, not just counts.

**C3: Memory priority order is wrong under context pressure.**
ContextWindowManager cuts memory at priority 5 (before code at priority 6). But for an agent that knows a codebase, project memory is MORE valuable than generic conversation history (priority 4). A decision recorded in memory 3 weeks ago is more relevant than a hello-world exchange from 2 days ago.
**Fix:** Reorder priorities: task_buildtags(1) → system_prompt(2) → high-importance_memory(3) → devtags(4) → history(5) → code_content(6) → low-importance_memory(7). Add `importance_score` column to memory_notes; high-importance notes survive context pressure.

**C4: CopilotStudio.tsx (old God Factory) is still live alongside the new one.**
Two "AI agent chat" components exist simultaneously. Users can see both. The old one uses localStorage and has no connection to the enhanced loop.
**Fix:** Deprecate CopilotStudio.tsx. Route its UI entry points to TheGodFactory.tsx. The legacy component becomes a read-only history viewer.

### Gap Group D — The NANO Build Gap

**D1: NANO v2 Phase 1 not started.**
The entire 7-phase NANO Sea v2 build plan is documentation only. `MidwifeService.feedToNanoTrainer` sends to port 5100 but nothing is listening. Every `observationTrainer.ts` call is silently discarded.
**Fix:** Phase 1 build: `nano_v2/model.py` (Nano class, SwarmLayer, SharedEmbedding, ChromaticIndex, Soft-k Router), `nano_v2/train.py` (SwarmTrainer), `nano_v2/server.py` (FastAPI port 5100 with `/v1/training/observe` endpoint). Then test_31.

**D2: ValidatedMidwife feedback loop (IndependenceTracker) not built.**
The TypeScript Midwife generates training data. But the mechanism for measuring "when can this nano replace the LLM for this task type?" (IndependenceTracker) is not built. Nanos train but nobody measures how good they've become.
**Fix:** Build IndependenceTracker as part of NANO v2 Phase 3. After each training batch, run the nano on held-out examples from that task type. When accuracy > threshold for N consecutive batches, mark that task type as `nano_capable`. Feed to TypeScript IDE layer as model routing option.

### Gap Group E — The Autonomy Cap Gap

**E1: The 60-second spawn confirmation window is too short for real async workflows.**
Tier 3+ spawns expire silently after 60 seconds. For a user who is asleep (the whole point), every high-complexity spawn fails without the user knowing.
**Fix:** Don't expire — queue pending confirmations indefinitely. Add a mobile notification hook (or email webhook) that pings the user when a spawn needs approval. Allow pre-authorization of spawn types ("always approve fleet_agent spawns for this project").

**E2: Suggested jobs have no goal-alignment check.**
The SuggestedJobsCrawler generates jobs from patterns in the database. But it doesn't check whether the jobs align with what the user said they wanted. A user who said "build a game" might get 20 "documentation gap" jobs when they want 20 "rendering pipeline" jobs.
**Fix:** Add UserIntentCrawler — reads conversation history, extracts the stated goal ("build a game like Call of Duty"), maintains a `current_intent` record. SuggestedJobsCrawler weights jobs by relevance to `current_intent`. Documentation gaps deprioritized when user is in build mode.

**E3: No real-time project health dashboard.**
The Intel Panel shows notifications and suggested jobs. It doesn't show a live health view: "3 tests failing, blame score trending down, 2 devtags drifting, last model switch was 4 hours ago."
**Fix:** HealthDashboard component in the Intel Panel. Polls `stability_snapshots`, `blame_records`, `devtag_drift_events`, `model_usage_stats`. Auto-refreshes every 30 seconds. Non-intrusive — shows as a collapsible section above the notification list.

**E4: No vision pipeline for visual output evaluation.**
User imagined: LLM evaluates what rendered output looks like. Ollama catalog has LLaVA, BakLLaVA, Moondream2. But there's no `analyze_image` tool, no screenshot-to-LLM pipeline, no visual quality feedback loop.
**Fix:** `analyze_visual_output` tool — runs the project's preview URL through a headless browser screenshot, sends to a vision model, returns structured feedback (composition score, UI element detection, error detection). Wired to the agent loop as a tool when the project has a running preview.

---

## PART 4 — THE EXECUTION ROADMAP

### Phase 1 — Connect What Exists (0 new systems, close 8 gaps)
**Goal:** Make the 60% built actually work together. No new features. Wire the pipes.

1. Wire Employer Crawler output → `resolveModelStrategy()` in enhanced loop
2. Persist feature flags to `app_kv` (survive restarts)
3. Add Midwife file watcher on DatasetBuilder output directory
4. Register OpenClaw skills as agent loop tool actions (`execute_skill`)
5. Add `validateSpecContract` call in `responseProcessing.ts` post-write
6. Wire StabilityMonitor health events → SuggestedJobsCrawler priority adjustment
7. Fix ContextWindowManager memory priority order (high-importance memory above history)
8. Deprecate CopilotStudio.tsx (redirect to TheGodFactory.tsx)

**Benchmark check:** After Phase 1, God Factory should pick better models automatically, never lose tool settings on restart, and route jobs around known-degraded system states.

### Phase 2 — Semantic Intelligence Layer (1 major addition)
**Goal:** Give the crawlers actual understanding instead of pattern-matching.

1. Add `semantic_embedding` + `semantic_description` to devtags (PSC scan feeds it)
2. Local embedding pass on every memory note (nomic-embed-text via Ollama)
3. Replace memory SQL search with cosine similarity search
4. Auto-inject RelationshipIndexService `formatForLLM()` output into contextAssembly v3 slot
5. Build unified `CrawlerCoordinator` service — merges PSC + HierarchicalIndex + RelationshipIndex into `codebase_intelligence` table
6. Add LLM-powered reflection pass to IdleScanner (local 3B model after regex pass)

**Benchmark check:** After Phase 2, the God Factory should be able to answer "what calls this function?" and "what would break if I changed this?" accurately without being told.

---

## PART 7 — COMPLETE DATA FLOW MAP

Every system connection in the fully-realized architecture. Arrows marked [BROKEN] are Phase 1 targets.

```
USER INPUT
    │
    ▼
TheGodFactory.tsx ──POST──► EnhancedAgentLoop
                                │
                         runSetup.ts (init)
                                │
                      contextAssembly.ts ◄── PSC devtags
                                │         ◄── HierarchicalCodeIndex (Phase 2: via CrawlerCoordinator)
                                │         ◄── RelationshipIndexService (Phase 2: via CrawlerCoordinator)
                                │         ◄── CorpusManifesto
                                │         ◄── MemoryService (importance-ranked)
                                │
                      ContextWindowManager (priority packer)
                      Priority order (corrected Phase 1):
                        1. task_buildtags
                        2. system_prompt
                        3. high-importance memory (score > 0.7)
                        4. devtags + semantic descriptions
                        5. conversation history
                        6. code content
                        7. low-importance memory
                                │
                      ChunkingPipeline (if over limit)
                                │
                      LLM Client (11 providers via providers.ts)
                                │
                      responseProcessing.ts
                        ├── parse FILE_CHANGE_FORMAT
                        ├── validateSpecContract [BROKEN → Phase 1.5]
                        ├── apply file writes
                        └── TagRegistry (emit buildtag)
                                │
              ┌─────────────────┼──────────────────┐
              ▼                 ▼                  ▼
        DiffSubAgent    IntegrationVerif.    DatasetBuilder
        (pre-write)     (post-write crawl)   (JSONL to disk)
              │                 │                  │
              ▼                 ▼                  ▼
        CheckpointService   ForensicDB     NANO_train/nano_data/
        (git checkpoint)    (11 tabs)      training/agent_dataset/
                                                   │
                                           Midwife watcher [BROKEN → Phase 1.3]
                                                   │
                                           MidwifeService queue
                                                   │
                                           NANO Sea v2 server :5100
                                           POST /v1/training/observe
                                                   │
                                           SwarmTrainer → IndependenceTracker
                                                   │
                                           nano_capable task types
                                                   │ [Phase 5+]
                                           modelSwitcher.ts routes to NANO

PARALLEL BACKGROUND (SubsystemScheduler, 15s tick):
    ├── PSC scan → devtags → TagRegistry
    ├── SuggestedJobsCrawler → job_records → Intel Panel
    ├── EmployerCrawler → employer_analysis ──[BROKEN → Phase 1.1]──► resolveModelStrategy()
    ├── IdleScanner → exploration_suggestions
    ├── GapAnalysis → gap_reports
    └── StabilityMonitor → system_health_events ──[BROKEN → Phase 1.6]──► SuggestedJobsCrawler

Phase 2 adds:
    CrawlerCoordinator
        ├── merges PSC + HCI + RIS
        └── writes codebase_intelligence table
            └── contextAssembly v3 reads: depGraphContext, moduleClusterContext, explorationContext
```

---

## PART 8 — AGENT META-ARCHITECTURE CONTROL PLANE

**Core principle (from agent_meta_architecture_action_plan.json):** "The agent is a control plane, not a code writer — it generates Python automation scripts that generate code."

### Why This Matters

Traditional approach (current behavior): `LLM → writes code directly → file system`

Meta-architecture target: `LLM → generates automation script → script executes → code written`

The LLM never holds the full codebase in memory. It writes 20-line Python scripts that call templates. The code-writing step is deterministic and testable.

### Memory Fabric (4 Subdirectories)

```
.god_factory/
  indices/       keyword+embedding index of all project symbols
  domains/       domain-specific knowledge (auth, database, API, UI patterns)
  automation/    reusable Python scripts for code generation patterns
  cache/         recent context snapshots keyed by task_id
```

### Token-Aware Index Scoring

```
relevance = (0.60 × keyword_overlap_score)
          + (0.25 × recency_score)
          + (0.15 × access_frequency_score)
```

### Overflow Queue

When memories cannot fit the context budget:
1. Excluded memories → overflow_queue table
2. Next turn: agent processes overflow queue first
3. After 3 turns of overflow: auto-summarize into single compressed entry
4. Enables handling 100K+ line projects without losing context

### The automation/ Directory as Skill Repertoire

When the agent creates a new REST endpoint:
1. Agent finds nearest automation script: `automation/create_rest_endpoint.py`
2. Calls: `python create_rest_endpoint.py --name health --method GET --auth none`
3. Script creates route + handler + types + test — all consistently

For novel tasks with no existing script:
1. Agent creates a new automation script
2. Stores it in `automation/` for reuse
3. Runs it immediately

Each novel task adds a permanent capability. `automation/` becomes the agent's skill repertoire. This is how God Factory gets faster the longer it works on a project.

### Connection to OpenClaw

OpenClaw's 8 built-in skills ARE automation scripts in this model. Phase 3 adds dynamic skill creation: `command_agent` validates a new automation script → if tests pass → registers as new OpenClaw skill. God Factory has `n+1` skills permanently.

---

## PART 9 — NANO_TRAIN DIRECTORY TRANSITION GUIDE

### What Survives From Existing NANO_train/core/

| File | Status | Reason |
|------|--------|--------|
| rby.py | **KEEP** | aitchison_distance(), rby_to_unit_vector(), rby arithmetic all valid |
| ptaie.py | **KEEP** | PTAIE token encoding used as tokenizer in nano_v2 |
| lifecycle.py | **ADAPT** | CosmicCycleManager logic correct, update imports only |
| ae.py | ARCHIVE | v1 artifact (IC-AE collision system, dead) |
| compression.py | ARCHIVE | v1 artifact |
| ic_ae.py | ARCHIVE | v1 artifact (explicit instruction: do not use) |
| storage.py | EVALUATE | May be reusable for NanoMemoryManager disk tier |
| fitness.py | ADAPT | Fitness scoring logic may apply to IndependenceTracker |

### New nano_v2/ Structure

```
NANO_train/
  nano_v2/
    __init__.py       exports NanoSea, NanoSea.from_checkpoint()
    model.py          Nano (universal), SwarmLayer, ChromaticIndex, SoftKRouter, NanoSea
    train.py          SwarmTrainer, IndependenceTracker, compute_loss()
    midwife.py        ValidatedMidwife with execution validation
    lifecycle.py      NanoSpawner, FitnessEvaluator, CosmicCycleManager
    memory.py         NanoMemoryManager (GPU/CPU/Disk tiers)
    mesh.py           mDNS discovery, federated averaging
    server.py         FastAPI port 5100
    config.py         hyperparameters dataclass (D_MODEL=256, N_LAYERS=3, etc.)
    tests/
      test_30v3.py    MUST pass first — reproduces PPL=4.977 (the proving test)
      test_31.py      bird-feeder independence gate — required before Phase 6
```

### test_31 Independence Gate Design

1. Train NanoSea on bird-feeder maintenance corpus only (no LLM reference answers)
2. Run 50 queries: mix of diagnostic, ordering, and scheduling tasks
3. Evaluate: semantic similarity to ground truth > 0.65 average
4. PASS → IndependenceTracker marks `domain_task` as `nano_capable`
5. Only after PASS → `modelSwitcher.ts` routes domain_task requests to NANO server

---

## PART 10 — MISSING INFRASTRUCTURE CHECKLIST

### New Database Tables Required

```sql
-- Phase 1
ALTER TABLE memory_notes ADD COLUMN importance_score REAL DEFAULT 0.5;
CREATE TABLE system_health_events (
  id INTEGER PRIMARY KEY, event_type TEXT, severity TEXT,
  triggered_at INTEGER, reason TEXT, project_id TEXT
);

-- Phase 2
CREATE TABLE codebase_intelligence (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL,
  file_path TEXT NOT NULL, symbol_name TEXT NOT NULL,
  symbol_type TEXT DEFAULT 'unknown', semantic_description TEXT,
  embedding_vector BLOB, relationship_summary TEXT,
  devtag_id INTEGER REFERENCES devtags(id),
  last_indexed INTEGER DEFAULT (strftime('%s','now')),
  access_count INTEGER DEFAULT 0
);
CREATE INDEX idx_ci_symbol ON codebase_intelligence(project_id, symbol_name);
CREATE INDEX idx_ci_access ON codebase_intelligence(project_id, access_count DESC);

-- Phase 3
CREATE TABLE memory_notes_archived (
  -- same schema as memory_notes, plus archived_at INTEGER
);
CREATE TABLE automation_scripts (
  id INTEGER PRIMARY KEY, name TEXT UNIQUE, description TEXT,
  script_path TEXT, created_by TEXT, test_pass_rate REAL,
  usage_count INTEGER DEFAULT 0, openclaw_skill_id TEXT
);
CREATE TABLE domain_affinity (
  model_id TEXT, file_extension TEXT, task_type TEXT,
  success_rate REAL, sample_count INTEGER,
  PRIMARY KEY (model_id, file_extension, task_type)
);
```

### New Services to Create

| Phase | Service | File Path |
|-------|---------|-----------|
| 1 | Feature flag persistence | routes/features.ts (modify existing) |
| 1 | Midwife file watcher | services/midwife/index.ts (modify existing) |
| 2 | CrawlerCoordinator | services/crawlerCoordinator/index.ts |
| 3 | project_description_crawler | services/crawlers/projectDescriptionCrawler.ts |
| 3 | skeptic_agent | services/agents/skepticAgent.ts |
| 3 | memory_crawler | services/agents/memoryCrawler.ts |
| 3 | command_agent | services/agents/commandAgent.ts |
| 3 | HealthDashboard component | web/src/components/HealthDashboard.tsx |
| 4 | DomainAffinityMatrix | services/modelSwitcher/domainAffinity.ts |
| 5 | NANO v2 full build | NANO_train/nano_v2/ (all files) |
| 5 | NANO bridge in Node.js | services/nano/bridge.ts |
| 6 | Project Factory scoping | apps/projectFactory/ (new app) |
| 7 | Mesh coordinator | NANO_train/nano_v2/mesh.py |

### Phase 3 — Real Gap Analysis (Replace SQL aggregators with code-reading agents)
**Goal:** Make gap analysis actually read the code it's analyzing.

1. GapAnalysis CoverageAgent reads actual source files for missed plantags
2. GapAnalysis PatternAgent runs dependency graph on failure patterns
3. Add SecurityCrawler (OWASP static analysis: SQL injection, hardcoded secrets, missing auth checks)
4. Add PerformanceCrawler (cyclomatic complexity, O(n²) detection)
5. Add TestCoverageMapper (which functions have tests, which don't)
6. Add UserIntentCrawler (conversation history → current_intent → job relevance scoring)
7. Add HealthDashboard component to Intel Panel

**Benchmark check:** After Phase 3, GapAnalysis should report code-level evidence ("auth.ts line 47 has no input validation") not database row counts.

### Phase 4 — Model Routing Intelligence (Close the learning loop)
**Goal:** Every model learns its strengths; the system routes optimally based on real data.

1. Route all Employer Crawler scores into real-time task assignment (not just post-hoc analysis)
2. Add `DomainAffinityMatrix` — per-model per-file-type quality history (TypeScript auth files → model A, Python ML code → model B)
3. Add ModelPerformanceDashboard to Intel Panel (live matrix view)
4. Build the missing agents: `memory_crawler` (auto-scores memory notes by usage + recency), `project_description_crawler` (generates/maintains project description from structure)
5. Build `skeptic_agent` (reviews every committed change, writes criticism to blame records)
6. Extend `scale_research` mode in ProjectFactoryWizard to actually wire distributed compute scaffolding scripts

**Benchmark check:** After Phase 4, the model selection for any given task should have a documented reason backed by performance data.

### Phase 5 — NANO Sea v2 Build (The Big One)
**Goal:** Build the proven architecture. Replace first LLM tasks with nano inference.

1. Phase 1: Core (SharedEmbedding, SwarmLayer, ChromaticIndex, Soft-k Router) — `nano_v2/model.py`
2. Phase 2: Routing (Crosstalk gates)
3. Phase 3: Training (SwarmTrainer, ValidatedMidwife, IndependenceTracker)
4. Phase 4: Lifecycle (NanoSpawner, FitnessEvaluator, CompressionEngine, CosmicCycle, TouchTensor)
5. Phase 5: Memory (GPU↔CPU↔Disk tiering)
6. Phase 6: Mesh (mDNS peer discovery, federated averaging) — This is AIOS IO Layer 3 foundation
7. Phase 7: Integration (port 5100 FastAPI, first LLM calls replaced by nano routing)
8. Run test_31 (bird-feeder integration — LLM generates, nanos learn, IndependenceTracker validates)

### Phase 6 — The Project Factory (Apply God Factory Framework to External Projects)
**Goal:** Make the Project Factory as powerful as the God Factory is at Phase 5.

1. Copy God Factory framework (crawlers + memory + model routing + Intel Panel) into Project Factory
2. Project Factory maintains project-scoped memory (separate from God Factory memory)
3. Project Factory memory feed to God Factory: every external project outcome becomes a God Factory memory note
4. God Factory auto-generates improvement jobs when external project quality is poor
5. Enable vision pipeline: `analyze_visual_output` tool for projects with running previews
6. Enable `scale_research` mode end-to-end: distributed ML training coordinator, multi-machine orchestration scripts, scripts become OpenClaw tools

### Phase 7 — The AIOS IO Mesh (Global Compute, Full Vision)
**Goal:** Multiple Personal IDE instances cooperate as a distributed intelligence.

1. Enable `mesh_connect` tool (currently in ToolPolicyGate, disabled)
2. NANO Sea Phase 6 mesh deployment (mDNS discovery, federated nano averaging)
3. Trust scoring between nodes (TouchTensor verification)
4. Volunteer compute incentive layer (optional — not blockchain, reputation-based)
5. Global ChromaticIndex — queries route to best-suited node across the mesh
6. Community skill sharing: OpenClaw skills published to community, downloaded by other instances

---

## PART 5 — THE COMPLETE TAG TAXONOMY ANSWER

You imagined devtags/plantags/buildtags. Here is what the full taxonomy needs to be:

| Tag Type | What It Stores | Currently Exists |
|---|---|---|
| **devtag** | Named code symbol (function/class/route) + file + line | YES (name-only) |
| **devtag.semantic** | LLM-generated description of what the symbol does | NO — add Phase 2 |
| **devtag.quality** | Test coverage %, complexity score, last-failure-count | NO — add Phase 3 |
| **devtag.embedding** | Vector for semantic search | NO — add Phase 2 |
| **plantag** | Planned work item linked to code location | YES |
| **buildtag** | Execution record per agent commit | YES |
| **modeltag** | Which model last touched this symbol + quality score | NO — add Phase 4 |
| **contexttag** | What other symbols this one depends on (safe-edit map) | Partial (RelationshipIndex) |
| **intenttag** | User's stated goal that this symbol was created for | NO — add Phase 3 |
| **qualitytag** | Blame score history for this symbol | Partial (blame_records) |

The devtag/plantag/buildtag three-tier is correct. It needs four additions to be complete: semantic description, quality embedding, model attribution, and intent linkage.

---

## PART 6 — BENCHMARK TARGET (How Do We Know We Beat GitHub Copilot?)

| Metric | GitHub Copilot | Personal IDE Target |
|---|---|---|
| Context retrieval relevance | Embedding-based, all files | Embedding-based devtags (Phase 2) + relationship graph (Phase 3) |
| Autonomous iteration depth | 0 (user must prompt each step) | Unlimited with auto-answer + continuous mode |
| Model choice | Fixed (GPT-4 Turbo or Sonnet 3.5) | Dynamic per task-type from performance history (Phase 4) |
| Memory persistence | Session-only | Permanent project memory with scoring (Phase 2) |
| Quality feedback loop | None | Blame records → Employer Crawler → model routing (Phase 1 fix) |
| Runs without user present | No | Yes — crash recovery + auto-answer + 24/7 mode (already built) |
| External tool integration | MCP servers (manual config) | OpenClaw skills (auto-discoverable, agent-callable) (Phase 1 fix) |
| Distributed compute | None | AIOS IO mesh (Phase 7) |
| Learns from own outputs | No | DatasetBuilder → Midwife → NANO Sea (Phase 5) |

**The thesis:** GitHub Copilot is a code completion tool for humans in the loop. Personal IDE is a software civilization that happens to have a human available if needed.

---

*This document supersedes all assumptions in push_limit_1 through push_limit_5.*
*Last updated: May 2026.*
*Next action: Phase 1 implementation (8 connection tasks, no new systems).*
