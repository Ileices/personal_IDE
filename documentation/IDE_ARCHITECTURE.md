# IDE Architecture — Complete Technical Reference

## 1. System Overview

The Personal IDE is a three-tier application:

| Layer | Technology | Port | Purpose |
|-------|-----------|------|---------|
| **Frontend** | React 19 + Vite 6 + TypeScript 5.7 | 5173 | IDE UI, Monaco editor, chat, agent controls |
| **Backend** | Fastify 5 + Node.js 20 + SQLite | 3001 | API server, LLM orchestration, file ops, memory |
| **Nano Sea** | Python 3.9+ + PyTorch 2.6 | 5100 | 296 micro-neural-networks, training pipeline |

Communication flow:
```
Browser ──HTTP/SSE──→ Fastify ──OpenAI SDK──→ GitHub Models / Ollama / Groq / etc.
                         │
                         ├──HTTP──→ Nano Sea (:5100)
                         └──SQLite──→ personal-ide.db
```

---

## 2. Frontend Architecture

### 2.1 Entry Point

`apps/web/src/App.tsx` — Root component with three-panel resizable layout.

**Auth gate**: If no user is authenticated, renders `<LoginPage />`. Supports:
- GitHub PAT login (full provider access)
- Guest mode (local providers only — Ollama, LM Studio, Nano Sea)

### 2.2 Component Map (15 components)

| Component | File | Description |
|-----------|------|-------------|
| `AgentControls` | AgentControls.tsx | Start/stop/configure autonomous agent loop. Fleet toggle, agent count slider, mega-prompt presets. |
| `ChatPanel` | ChatPanel.tsx | Main LLM chat interface. Supports streaming via SSE. Mode selector (ask/edit/plan/agent). |
| `CheckpointViewer` | CheckpointViewer.tsx | Browse and restore project snapshots created by the agent. |
| `CodeViewer` | CodeViewer.tsx | Monaco editor instance for viewing/editing code. Read-only by default, agent can write. |
| `ErrorPanel` | ErrorPanel.tsx | Displays compile/lint errors detected for the active project. |
| `FileBrowser` | FileBrowser.tsx | File tree navigator. Click to view, right-click for context actions. |
| `LoginPage` | LoginPage.tsx | GitHub PAT login + guest mode. Saved accounts with switch/remove. |
| `MemoryPanel` | MemoryPanel.tsx | View/search/create project memory notes. Auto-refreshes every 15 seconds. |
| `MidwifePanel` | MidwifePanel.tsx | Controls for the Midwife training data generator. Start/stop/configure tasks. |
| `NanoSeaControls` | NanoSeaControls.tsx | Monitor and control the Nano Sea Python backend. |
| `OllamaSetup` | OllamaSetup.tsx | Guided setup for Ollama local model installation. |
| `ProjectPanel` | ProjectPanel.tsx | Project list, create new, switch active, delete. |
| `ProviderSettings` | ProviderSettings.tsx | Enable/disable/configure all 11 AI providers. Test connections, manage API keys. |
| `RateLimitDashboard` | RateLimitDashboard.tsx | Live rate limit status for all GitHub Models tiers. |
| `TopBar` | TopBar.tsx | Title bar: mode selector (ask/edit/plan/agent), settings gear, user avatar. |

### 2.3 State Management (7 Zustand Stores)

| Store | File | Key State | Key Actions |
|-------|------|-----------|-------------|
| `authStore` | authStore.ts | `isAuthenticated`, `user`, `accounts` | `login()`, `loginAsGuest()`, `logout()`, `switchAccount()` |
| `chatStore` | chatStore.ts | `messages`, `mode`, `conversationId`, `isStreaming` | `sendMessage()`, `setMode()`, `clearChat()` |
| `projectStore` | projectStore.ts | `projects`, `activeProject`, `memoryNotes` | `loadProjects()`, `createProject()`, `loadNotes()` |
| `agentStore` | agentStore.ts | `agentStatus`, `isRunning`, `events` | `startAgent()`, `stopAgent()`, `pauseAgent()` |
| `fileStore` | fileStore.ts | `files`, `selectedFile`, `fileContent` | `loadFiles()`, `selectFile()`, `readFile()` |
| `fleetStore` | fleetStore.ts | `fleetStatus`, `agents`, `totalStats` | `startFleet()`, `stopFleet()`, `connectSSE()` |
| `midwifeStore` | midwifeStore.ts | `config`, `session`, `tasks` | `startFeeding()`, `stopFeeding()`, `updateConfig()` |

### 2.4 Build System

- **Vite 6** with React plugin
- **Tailwind CSS 3.4** with custom IDE theme colors (`ide-bg`, `ide-text`, `ide-accent`, etc.)
- **PostCSS** for Tailwind processing
- Dev server at `:5173`, proxies `/api` requests to `:3001`

---

## 3. Backend Architecture

### 3.1 Server Framework

Fastify 5.2 with:
- CORS (configured for frontend URL)
- JSON body parsing
- SQLite database (better-sqlite3)
- Modular route registration with prefix-based namespacing

### 3.2 Route Modules (17 files)

| Route File | Prefix | Endpoints | Description |
|-----------|--------|-----------|-------------|
| `agent.ts` | `/api/agent` | POST `/start`, `/stop`, `/pause`, `/resume`, `/message`; GET `/status`, `/stream` | Agent loop control + SSE event streaming |
| `auth.ts` | `/api/auth` | POST `/login`, `/guest`, `/logout`, `/switch`; GET `/me`, `/accounts`, `/token`; DELETE `/account/:id` | GitHub PAT + guest auth |
| `chat.ts` | `/api/chat` | POST `/send`; GET `/stream`; POST `/stop` | LLM chat with SSE streaming + nano confidence fallback |
| `checkpoints.ts` | `/api/checkpoints` | GET `/list`, `/diff`; POST `/create`, `/restore` | Git-based project snapshots |
| `conversationIndex.ts` | `/api/conversations` | GET, POST, DELETE | Conversation CRUD |
| `errors.ts` | `/api/errors` | POST `/scan` | Compile/lint error detection |
| `files.ts` | `/api/files` | GET `/tree`, `/read`; POST `/write`, `/create`; DELETE | Project file operations |
| `fleet.ts` | `/api/fleet` | POST `/start`, `/stop`, `/pause`, `/resume`, `/message`; GET `/status`, `/stream`, `/max-agents` | Multi-agent fleet orchestration |
| `knowledge.ts` | `/api/knowledge` | GET `/graph`, `/symbols` | Code relationship graph queries |
| `memory.ts` | `/api/memory` | POST `/projects`, `/notes`, `/notes/search`; GET `/notes/:id`, `/questions/:id` | Project memory CRUD |
| `midwife.ts` | `/api/midwife` | POST `/start`, `/stop`; GET `/status`, `/config`, `/tasks`, `/history`; PUT `/config`, `/tasks/:type` | Training data generation controls |
| `models.ts` | `/api/models` | GET `/list`, `/rate-limits` | Model definitions + rate limit status |
| `nano.ts` | `/api/nano` | Proxy to Nano Sea `:5100` | Nano Sea backend proxy |
| `ollama.ts` | `/api/ollama` | GET `/models`, `/status`; POST `/pull` | Ollama management |
| `preview.ts` | `/api/preview` | GET `/serve` | Project preview server |
| `providers.ts` | `/api/providers` | GET `/list`; POST `/configure`, `/test`; DELETE `/remove` | Provider management |
| `siliconFactory.ts` | `/api/silicon-factory` | Task lifecycle, IAP messaging, sync locks, state snapshots, symbol graph, test indexing, embeddings | Silicon Factory service layer |
| `spawnAuthority.ts` | `/api/spawn` | POST `/request`; GET `/confirmation/:id`; POST `/confirmation/:id/approve`, `/confirmation/:id/reject`; POST `/execute`; GET `/check`, `/violations`, `/model-tier`, `/chart` | **Transactional spawn gate** — request → pending → approve/reject → execute (one-time consume); replay denied |
| `stability.ts` | `/api/stability` | GET `/window`; POST `/record` | Rolling-window stability monitor; triggers auto-rollback on threshold breach |
| `tiers.ts` | `/api/tiers` | GET `/all` | Rate limit tier definitions |

### 3.3 Service Directories (9 domains)

#### `services/agent/` — Autonomous Agent Engine
| File | Lines | Purpose |
|------|-------|---------|
| `enhancedLoop.ts` | ~1100 | **Core engine**: plan→execute→evaluate cycle, 24/7 continuous mode, smart chunking, rate limit fallback, 404 recovery, loop detection, web search, platform detection |
| `fleet.ts` | ~700 | Multi-agent fleet orchestrator: role-based task decomposition, parallel execution, staggered launch |
| `codeIndexer.ts` | | Indexes codebase symbols for context injection |
| `logWriter.ts` | | Structured logging for agent runs |
| `loopDetector.ts` | | Detects repetitive agent behavior |
| `platformDetector.ts` | | OS/runtime detection for cross-platform instructions |
| `webSearch.ts` | | DuckDuckGo search + web page fetching |
| `loop.ts` | | Original (non-enhanced) agent loop |

#### `services/llm/` — LLM Client Abstraction
| File | Purpose |
|------|---------|
| `providers.ts` | Multi-provider client factory. Creates OpenAI-compatible clients for all 11 providers. Token encryption/decryption. Model discovery. |
| `streaming.ts` | `completeChatResponse()` and `streamChatResponse()` with timeout + abort signal support |
| `chunkingPipeline.ts` | Smart token chunking: splits oversized content, generates LLM bridge summaries between chunks |
| `rateLimiter.ts` | Production rate limiter with per-model tracking, exponential backoff, server header parsing, smart fallback |
| `client.ts` | Legacy GitHub-only client (backward compat) |

#### `services/analysis/` — Codebase Intelligence
| File | Purpose |
|------|---------|
| `codebase.ts` | Build project overview (file count, languages, structure) |
| `conversationIndexer.ts` | Index and search past conversations |
| `logManager.ts` | Log rotation, compaction, health monitoring |
| `projectTierEngine.ts` | Detect project complexity tier for quality gates |
| `relationshipIndex.ts` | Code symbol relationship graph (imports, calls, inheritance) |

#### Other Services
| Directory | Purpose |
|-----------|---------|
| `services/checkpoint/` | Git-based project snapshots |
| `services/contextWindowManager/` | Priority-ordered context budget enforcement; `fitPrioritySlots()` (priority: system_prompt > task_buildtags > devtags > history > memory > code_content); tier ceilings T1–T5; truncation logged to notification_queue |
| `services/errors/` | Compile/lint error detection |
| `services/filesystem/` | File tree listing, read/write operations |
| `services/memory/` | SQLite-backed project memory notes + search |
| `services/midwife/` | Training data generator ("bird-feeding") |
| `services/modes/` | System prompt templates for each mode |
| `services/nanoLiaison/` | Polls Nano Sea `/v1/training/status` every 15 s; diffs nano states; creates devtag records + forensic entries for anomalies |
| `services/siliconFactory/` | Task lifecycle, IAP messaging, sync locks, state snapshots, symbol graph, test indexing, embeddings |
| `services/spawnAuthority/` | **Transactional spawn gate**: `requestSpawn()` → UUID confirmation record; `resolveConfirmation()` → accepted/rejected; `executeSpawn()` → one-time consume; replay denied |
| `services/stabilityMonitor/` | Rolling 10-cycle window; thresholds: 2 consecutive test failures, blame score drop >0.15/3 cycles, 2 consecutive loops, buildtag rejection spike >0.20; breach triggers rollback notification + forensic job |

### 3.4 Database Schema

SQLite database at `./data/personal-ide.db`. Key tables:

| Table | Purpose |
|-------|---------|
| `auth_tokens` | Stored GitHub accounts (encrypted tokens) |
| `provider_configs` | Provider settings (base URL, encrypted API keys) |
| `projects` | Registered projects |
| `conversations` | Chat conversations |
| `messages` | Chat messages |
| `memory_notes` | Project memory entries |
| `file_summaries` | Cached file analysis |
| `question_logs` | Agent questions for user |
| `agent_runs` | Agent execution history |
| `checkpoints` | Project snapshot metadata |
| `code_symbols` | Indexed code symbols |
| `code_relationships` | Symbol relationships |
| `stability_snapshots` | Rolling stability window records (10-cycle); written by StabilityMonitor |
| `loop_milestones` | Per-iteration loop progress records; written by milestoneEmitter |
| `loop_quality_snapshots` | Per-iteration quality signals; written by milestoneEmitter |
| `notification_queue` | Async event bus: rollback triggers, truncation events, forensic notes |

---

## 4. Configuration

### 4.1 Environment Variables (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_PORT` | 3001 | Backend API port |
| `SERVER_HOST` | 0.0.0.0 | Bind address |
| `GITHUB_PAT` | — | GitHub Personal Access Token |
| `GITHUB_CLIENT_ID` | — | OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | — | OAuth app client secret |
| `FRONTEND_URL` | http://localhost:5173 | CORS origin |
| `DB_PATH` | ./data/personal-ide.db | SQLite database path |
| `DEFAULT_PROJECTS_DIR` | — | Default folder for new projects |
| `MAX_MEMORY_NOTES_PER_PROJECT` | 10000 | Memory note cap |
| `AGENT_MAX_ITERATIONS` | 50 | Default agent iteration limit |
| `AGENT_STEP_DELAY_MS` | 2000 | Delay between agent steps |
| `AGENT_MAX_TOKENS_PER_STEP` | 4096 | Max output tokens per step |
| `RATE_LIMIT_BUFFER_PERCENT` | 10 | Safety margin for rate limits |
| `ENABLE_PAID_USAGE` | false | Enable paid tier rate limits |
| `ENCRYPT_KEY` | (auto-generated) | XOR key for token encryption |

### 4.2 Config Object (apps/server/src/config.ts)

The `loadConfig()` function returns a typed `AppConfig` object with sections:
- `server` — port, host
- `github` — PAT, OAuth credentials
- `frontend` — URL
- `db` — path
- `projects` — default directory
- `memory` — limits
- `agent` — iteration limits, delays
- `rateLimit` — buffer, paid usage toggle
- `security` — encryption key
- `nano` — `confidenceThreshold` (default `0.65`): if nano provider response confidence falls below this value, `chat.ts` and `enhancedLoop.ts` automatically reroute to the next highest-confidence provider

---

## 5. Data Flow Diagrams

### 5.1 Chat Message Flow
```
User types message
  → ChatPanel.sendMessage()
  → POST /api/chat/send { model, messages, mode }
  → getClientFromDb(provider)
  → streamChatResponse(client, model, messages)
  → SSE events → ChatPanel renders tokens
  → Observation sent to Nano Sea /v1/training/observe
```

### 5.2 Agent Loop Flow
```
User clicks "Start Agent"
  → POST /api/agent/start { projectId, task, model, options }
  → new EnhancedAgentLoop(db, config)
  → Phase 0: Environment Analysis (platform, stack, codebase)
  → Phase 1: Build knowledge graph (symbols, relationships)
  → Main Loop (max N iterations):
      │
      ├─ Build context (memory, file list, history, platform)
      ├─ Build system prompt with all context
      ├─ Check token limits → truncate or chunk if needed
      ├─ Rate limit check → fallback model if limited
      ├─ LLM call → completeChatResponse()
      ├─ Parse structured JSON output
      ├─ Execute file operations (create/edit/delete)
      ├─ Auto-fix errors if enabled
      ├─ Auto-run tests if enabled
      ├─ Create checkpoint every N iterations
      ├─ Save memory notes
      ├─ Build next task from nextSteps
      └─ Loop or complete
```

### 5.3 Fleet Orchestration Flow
```
User clicks "Start Fleet"
  → POST /api/fleet/start { projectId, task, agentCount }
  → new AgentFleet(db, config)
  → Decompose task into roles (lead, implementer, debugger, tester, reviewer, documenter)
  → Assign files per role
  → Stagger-launch agents (3s gap for local providers)
  → Each agent runs independently via EnhancedAgentLoop
  → Fleet events broadcast via SSE
```
