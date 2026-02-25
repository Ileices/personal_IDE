# Agent Fleet System — Complete Technical Reference

## 1. Overview

The Agent Fleet is a multi-agent orchestration system that decomposes complex tasks into role-based subtasks, each handled by a specialized autonomous agent. All agents share the same `EnhancedAgentLoop` engine but receive different system prompts, file scopes, and objectives.

---

## 2. EnhancedAgentLoop — The Core Engine

File: `apps/server/src/services/agent/enhancedLoop.ts` (~1,100 lines)

### 2.1 Integrated Services (14)

The agent loop integrates these services into every iteration:

| # | Service | Purpose |
|---|---------|---------|
| 1 | **LLM Client** | Multi-provider chat completions |
| 2 | **Rate Limiter** | Per-model token/request tracking |
| 3 | **Chunking Pipeline** | Smart content splitting for oversized prompts |
| 4 | **Code Indexer** | Symbol/relationship graph for codebase navigation |
| 5 | **Memory Service** | Project memory notes for cross-session context |
| 6 | **File System** | Read/write/create/delete project files |
| 7 | **Error Scanner** | Detect compile/lint errors after file changes |
| 8 | **Checkpoint Service** | Git-based snapshots for rollback |
| 9 | **Log Writer** | Structured JSONL logging of all events |
| 10 | **Loop Detector** | Identify repetitive behavior patterns |
| 11 | **Platform Detector** | OS/runtime for cross-platform instructions |
| 12 | **Web Search** | DuckDuckGo search for external knowledge |
| 13 | **Conversation Indexer** | Search past conversations for relevant context |
| 14 | **Nano Sea Client** | Forward observations for nano training |

### 2.2 Execution Phases

```
Phase 0: Environment Analysis
├─ Detect OS, runtime, package manager
├─ Scan codebase structure
├─ Build file tree
└─ Identify project type and stack

Phase 1: Knowledge Graph
├─ Index code symbols (functions, classes, variables)
├─ Map relationships (imports, calls, inheritance)
├─ Load relevant memory notes
└─ Search past conversations for context

Phase 2: Main Loop (up to maxIterations)
├─ Build context object
│  ├─ System prompt (mode-specific)
│  ├─ Platform context (OS, runtime)
│  ├─ Codebase summary (files, symbols)
│  ├─ Memory notes (relevant to task)
│  ├─ Conversation history (last N turns)
│  ├─ Error state (current compile errors)
│  └─ Task description + progress
│
├─ Token management
│  ├─ Estimate total tokens
│  ├─ Check against model context window
│  ├─ If over: activate chunking pipeline
│  └─ Apply per-request limits if rate-limited
│
├─ Rate limit check
│  ├─ canMakeRequest(model)?
│  ├─ If no: select fallback model
│  └─ If all limited: wait with backoff
│
├─ LLM call
│  ├─ completeChatResponse(model, messages)
│  ├─ Parse structured JSON output
│  └─ Handle errors (404, 429, 500, timeout)
│
├─ Execute actions
│  ├─ Create files
│  ├─ Edit files (with diff application)
│  ├─ Delete files
│  ├─ Run terminal commands
│  └─ Search web for information
│
├─ Post-action
│  ├─ Scan for new errors
│  ├─ Auto-fix if enabled and errors found
│  ├─ Run tests if enabled
│  ├─ Save memory notes
│  ├─ Create checkpoint (every N iterations)
│  └─ Send observations to Nano Sea
│
└─ Evaluate
   ├─ Is task complete?
   ├─ Loop detection (same actions repeated?)
   ├─ Build next task from nextSteps
   └─ Continue or finish
```

### 2.3 Error Recovery

| Error Type | Response |
|-----------|----------|
| **HTTP 404** | Model unavailable — switch to fallback model, ultimate fallback: `gpt-4.1-mini` |
| **HTTP 429/403** | Rate limited — parse limit, store per-request cap, switch to fallback model |
| **Token overflow** | Content too large — activate chunking pipeline |
| **Timeout** | Request took >120s — retry once, then switch model |
| **Invalid JSON** | LLM returned malformed output — retry with "please respond in valid JSON" |
| **Loop detected** | Agent repeating actions — inject "you are in a loop" message, change approach |
| **Compile error** | New errors after edit — auto-fix cycle (up to 3 attempts) |

### 2.4 Rate Limit Intelligence

The rate limit handler distinguishes two scenarios:

**Scenario A — Real model limit**: Error says "max 32K tokens" for a model with 32K context
- Set `contextWindow = 32000 * 0.95`
- This is the model's actual limit

**Scenario B — GitHub free tier cap**: Error says "max 8K tokens" for a model with 128K context
- Detected when: `8000 < 128000 * 0.25` → rate-limit cap
- Store 8000 in `discoveredContextLimits` map (per-request sizing)
- Keep `contextWindow = 128000` (model's real limit)
- Enforce 16,000 token floor: `max(rateLimitMax, 16000)`

---

## 3. Fleet Orchestrator

File: `apps/server/src/services/agent/fleet.ts` (~700 lines)

### 3.1 Roles (6 specialized)

| Role | System Prompt Focus | File Scope | Notes |
|------|-------------------|------------|-------|
| **Lead** | Architecture, planning, delegation | All files | Runs first, creates the plan |
| **Implementer** | Code writing, feature implementation | Assigned source files | Gets specific files from lead's plan |
| **Debugger** | Error finding, fix application | Error-related files | Monitors compile errors |
| **Tester** | Test writing, test running | Test files + source | Creates test files alongside source |
| **Reviewer** | Code review, quality gates | All files (read-only) | Reviews implementer output |
| **Documenter** | Documentation, comments, READMEs | Doc files + source | Creates docs from source |

### 3.2 Fleet Startup Sequence

```
1. User sends: POST /api/fleet/start { task, agentCount: 6, model }

2. Fleet decomposes task:
   ├─ Analyze project structure
   ├─ Identify affected files
   ├─ Break task into role-appropriate subtasks
   └─ Assign files to each role

3. Staggered launch:
   ├─ T+0s:  Launch Lead agent
   ├─ T+3s:  Launch Implementer #1
   ├─ T+6s:  Launch Implementer #2
   ├─ T+9s:  Launch Debugger
   ├─ T+12s: Launch Tester
   └─ T+15s: Launch Reviewer
   
   (3s gap prevents rate-limit storms on shared providers)

4. Parallel execution:
   ├─ All agents run independently
   ├─ Each uses EnhancedAgentLoop
   ├─ Fleet monitors progress via events
   └─ Events broadcast to frontend via SSE

5. Completion:
   ├─ When all agents report done
   ├─ Or when max iterations reached
   ├─ Or when user clicks "Stop Fleet"
   └─ Final summary generated
```

### 3.3 Inter-Agent Communication

Agents don't communicate directly. Instead:
- **Shared file system**: Changes by one agent are visible to others
- **Shared memory**: Memory notes are accessible to all agents in the fleet
- **Event bus**: Fleet events are broadcast (task started, task completed, error found)
- **Lead directives**: The lead agent's plan is injected into other agents' context

### 3.4 Fleet Events (SSE)

```
data: {"type":"fleet:agent-started","role":"implementer","agentId":"abc123"}
data: {"type":"fleet:agent-status","role":"implementer","status":"executing","detail":"Writing utils.ts"}
data: {"type":"fleet:agent-completed","role":"implementer","summary":"Implemented 3 functions"}
data: {"type":"fleet:progress","completed":4,"total":6,"elapsed":"2m 30s"}
data: {"type":"fleet:error","role":"debugger","error":"Rate limited on gpt-4o"}
data: {"type":"fleet:done","summary":"All agents completed","totalChanges":12}
```

---

## 4. Continuous (24/7) Mode

When `continuous: true` is set in agent options:

```
Loop:
  1. Complete current task
  2. Evaluate project state
  3. Generate next task automatically:
     - "Fix remaining compile errors"
     - "Add tests for untested functions"
     - "Improve documentation"
     - "Refactor flagged code smells"
  4. Start next task
  5. Repeat until user stops
```

The agent monitors:
- Compile error count → fix if > 0
- Test coverage → write tests if < threshold
- TODO comments → implement if found
- Performance → profile and optimize

### 4.1 Safeguards

- Max 50 iterations per task (configurable)
- Max 100 total iterations per session
- Loop detector intervenes after 3 identical actions
- Auto-checkpoint every 10 iterations
- User can pause/resume/stop at any time

---

## 5. Mega-Prompt Presets

Pre-configured system prompt templates for common tasks:

| Preset | Purpose | Key Instructions |
|--------|---------|-----------------|
| `default` | General coding assistance | Balanced approach, ask questions when unsure |
| `aggressive` | Fast implementation | Fewer questions, make assumptions, ship fast |
| `careful` | High-quality output | Ask before every change, explain reasoning |
| `refactor` | Code improvement | Focus on readability, performance, patterns |
| `debug` | Bug hunting | Systematic diagnosis, add logging, test fixes |
| `document` | Documentation focus | Write docs, comments, READMEs, examples |

---

## 6. Supporting Services

### 6.1 Code Indexer (`codeIndexer.ts`)

Builds a searchable index of:
- Function signatures and bodies
- Class definitions and methods
- Variable declarations and types
- Import relationships
- Call graphs

Used to inject relevant code context into agent prompts.

### 6.2 Loop Detector (`loopDetector.ts`)

Tracks the last N agent actions. Detects:
- **Exact loop**: Same file edited with same content
- **Oscillation**: File edited, then reverted, then edited again
- **Stall**: Agent producing no file changes for 5+ iterations

On detection: injects a warning into the next prompt:
> "WARNING: You appear to be stuck in a loop. Try a different approach."

### 6.3 Platform Detector (`platformDetector.ts`)

Detects and reports:
- OS (Windows/macOS/Linux)
- Shell (PowerShell/Bash/Zsh)
- Package manager (npm/pnpm/yarn)
- Runtime versions (Node, Python)
- Available tools (git, docker, etc.)

Injected into every agent prompt so it generates platform-appropriate commands.

### 6.4 Web Search (`webSearch.ts`)

Uses DuckDuckGo HTML search:
1. Agent decides to search: `{ "action": "search", "query": "..." }`
2. Backend calls DuckDuckGo
3. Parses HTML results
4. Returns top 5 results with titles, URLs, snippets
5. Agent can request page content for any result

### 6.5 Log Writer (`logWriter.ts`)

Writes structured JSONL logs to `NANO_train/logs/`:
- `ide_output.jsonl` — Agent output events
- `ide_debug.jsonl` — Debug/diagnostic events
- `ide_terminal.jsonl` — Terminal command events
- `nano_system.jsonl` — Nano Sea system events
