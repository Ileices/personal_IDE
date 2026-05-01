# Personal IDE — Agentic Development Environment

> An autonomous agentic IDE where agents never read raw code. Every structural
> element is a **devtag**. Every plan element is a **plantag**. Every edit
> operation is a **buildtag**. The system improves itself.

## What This Is

Personal IDE is a fully self-modifying, agent-driven development environment built on a unified tag language. It operates across two concurrent layers:

**Build Layer** — Runs build cycles: pre-edit crawls, Waiting state, Skeptic refinement, Command voting, Builder execution, post-commit validation.

**Meta Layer** — Runs persistently: the Blame Crawler attributes outputs to models, Gap Analysis identifies systemic failures, the Suggested Jobs system generates improvement work, and **THE GOD FACTORY Agent** synthesizes everything into a conversational self-improvement loop.

These two layers share one forensic database, one tag registry, and one agent authority system.

---

## Quick Start

### Prerequisites
| Tool | Version | Get it |
|------|---------|--------|
| **Node.js** | 20+ | [nodejs.org](https://nodejs.org/) |
| **pnpm** | 9+ | `npm install -g pnpm` |
| **Python** | 3.10+ *(optional — for Nano Sea)* | [python.org](https://www.python.org/downloads/) |
| **GitHub PAT** | — | [github.com/settings/tokens](https://github.com/settings/tokens) (scope: `models:read`) |

### Setup

**Windows (PowerShell):**
```powershell
git clone https://github.com/Ileices/personal_IDE.git
cd personal_IDE
.\setup.ps1
```

**Linux / macOS:**
```bash
git clone https://github.com/Ileices/personal_IDE.git
cd personal_IDE
chmod +x setup.sh && ./setup.sh
```

**Or manually:**
```bash
git clone https://github.com/Ileices/personal_IDE.git
cd personal_IDE
pnpm install              # install all dependencies
pnpm --filter @personal-ide/shared build   # build the shared types package
cp .env.example .env      # then edit .env and add your GITHUB_PAT
```

### Run

```bash
npm run dev
```

This starts:
- **Server** at `http://localhost:3001` (Fastify + API routes)
- **Frontend** at `http://localhost:5173` (React + Vite)

Open `http://localhost:5173` in your browser.

---

## Help System Coverage (Spec Alignment Pass)

The in-app Help menu now carries an expanded architecture map based on the unified specification set in `build_runs/feedback/*`.

What this pass includes:
- Expanded help coverage for Build Layer, Meta Layer, agent authority, memory surfaces, tag schema, Project State Crawler, Gap Analysis, Blame, Suggested Jobs, and Nano Sea v2 roadmap concepts.
- **Coming Soon** markers in Help for specification-defined behaviors not yet fully wired in UI/runtime.
- Section **tags** (pipeline tags) to show which subsystems work together and to support targeted implementation follow-up.
- Improved Help search indexing across section metadata and context (title, summary, details, tags, anchor IDs, control quick tips), not only section titles.

Companion architecture note for Nano Sea rework:
- `NANO_train/NANO_corpus/lump/NERDS_ASSEMBLE.txt`

---

## Architecture

```
personal_IDE/
├── apps/
│   ├── server/          # Fastify backend — chat, models, memory, agent, nano control
│   └── web/             # React frontend — Vite, Tailwind, Monaco editor
├── packages/
│   └── shared/          # Shared TypeScript types & constants (compiled to dist/)
├── NANO_train/          # Sea of Nanos — Python ML backend
│   ├── main.py          # Boot sequence (10 steps)
│   ├── core/            # Foundation nanos
│   ├── nanos/           # 296 specialized nanos (19 categories)
│   ├── mesh/            # P2P networking, global pool, peer discovery
│   ├── server/          # FastAPI backend (port 5100)
│   ├── training/        # Training pipeline
│   └── scanner/         # AE filesystem scanner
├── scripts/
│   └── setup.js         # Cross-platform setup script
├── setup.sh             # Unix setup wrapper
├── setup.ps1            # Windows setup wrapper
└── .env.example         # Environment template
```

### Key packages

| Package | Purpose |
|---------|---------|
| `@personal-ide/server` | Fastify 5 API server — 33 route modules, SQLite DB, 23 service modules |
| `@personal-ide/web` | React 19 + Vite 6 frontend — 22+ panel components, Monaco editor |
| `@personal-ide/shared` | Shared TypeScript types, model configs, constants *(must be built first)* |
| `NANO_train` | Python Sea of Nanos — 296 nanos, mesh networking, distributed training |

---

## The Tag System

Agents **never read raw code**. Every structural element is represented as a tag, resolved through a deterministic tool call.

### Three Tag Types

| Type | Purpose | Example |
|---|---|---|
| **devtag** | Describes existing code structure | `devtag:function:handleRequest` |
| **plantag** | Describes what needs to be built | `plantag:step:3:add-auth-middleware` |
| **buildtag** | Describes an edit operation | `buildtag:modify:devtag:function:handleRequest` |

A buildtag is **invalid** unless it references at least one existing devtag and at least one unfulfilled plantag.

### Tag Families

- **Base vocabulary** — module, class, function, method, import, route, schema, component, service, test, and 70+ more
- **Relationship tags** — calls, inherits, implements, composes, depends_on, subscribes_to, publishes, reads_from, writes_to
- **Nano Sea tags** — nano:module, nano:layer, nano:node, nano:weight:frozen, nano:weight:personal, nano:cycle
- **Attribution tags** — agent_generated, human_generated, last_modified_by, created_by, reviewed_by
- **Performance tags** — perf_critical, memory_bound, hot_path, latency_sensitive, cpu_bound
- **Versioning tags** — version, deprecated, breaking_change, stable, legacy, public_api
- **Status markers** — needs_rollback, needs_refactor, needs_test, dead_code, orphaned

### Tag Registry Service

```typescript
resolve_devtag(tag)   // → file, line range, parent, relationships, content hash
resolve_plantag(tag)  // → status, requires[], produces[], milestone, estimate
resolve_buildtag(tag) // → operation type, source devtag, target devtag, status
```

The full tag chart is a tool call, not a prompt. Zero context tokens consumed.

---

## The God Factory Screen

Primary interface. All panels are collapsible in the right sidebar.

| Panel | Content |
|---|---|
| **Chat Interface** | Conversational AI with 31 live tools wired to the system |
| **Notification Queue** | Severity-badged notifications from background monitors |
| **Idle Suggestions** | Accept → creates Suggested Job immediately |
| **Suggested Jobs** | Full job list (category, priority, status, sandbox state) |
| **External Projects** | Jobs from external codebase reviews |
| **Implementing** | Active pipeline with 6-stage progress view |
| **Codebase Health** | Debt heatmap, devtag counts, drift flags |
| **Model Health** | Quality scores, conformance rates per model |
| **Background Scan Status** | Scheduler state + 6 God Factory monitor statuses |
| **Subsystem Controls** | Enable/disable crawlers, manual triggers |
| **Brainstorm Pad** | Freeform input → Suggested Job |

### Chat Agent Tools (31 available)

The God Factory chat agent has direct access to every system API:

```
# Codebase tools
list_files, read_file, search_code, get_docs, patch_file, write_file, run_command

# God Factory system
get_notification_queue, get_idle_suggestions, create_brainstorm_job

# Suggested Jobs
find_suggested_jobs, get_job_detail, read_sandbox_status, implementation_pipeline_status

# Forensic tools
read_forensic_entries, read_blame_records, regression_index

# Live analysis
live_debt_check, live_coverage_check, live_pattern_query, debt_heatmap, pattern_trend

# Tag system
inspect_devtag, resolve_devtag, tag_vocabulary_diff, orphan_scan, conflict_scan

# Gap analysis
gap_scan, agent_conformance_report

# Authority
spawn_authority_check
```

---

## Build Pipeline

### Pre-Edit Protocol (mandatory before every edit)

Three sub-agents run concurrently. No edit begins until all three deliver outputs to WAITING state:

1. **Memory Crawler** — All accessible memory → compact devtag database
2. **Project Description Crawler** — All project files → plantag database
3. **Project State Crawler** — Actual files on disk → ground truth devtag snapshot + drift events

### State Machine

```
CRAWLING → TAG_GENERATION → REFINING → VOTING → SENT_TO_COMMAND
```

Skeptic Agent refinement: max 5 iterations. Tie votes → Command Agent at weight 1.5. God Factory holds absolute veto.

### Post-Commit Sequence (in order, mandatory)

1. Integration Verification Sub-Agent
2. Regression Sub-Agent
3. Version Control Agent
4. Coverage Analysis Agent
5. Blame Crawler *(async)*

### Implementation Pipeline (6 Stages)

1. **Pre-Implementation Scan** — Ground truth vs sandbox drift check
2. **Backup** — Version Control rollback point tagged with job_id
3. **Staged Rollout** — One atomic step at a time, full pre-edit protocol each
4. **Live Testing** — Full test suite against real codebase
5. **Stability Check** — 10-cycle monitoring window, auto rollback on crash
6. **Completion** — Job marked implemented, commits tagged, plantags done

---

## Blame Crawler

Every model output produces a blame record. No output is unattributed. The output capture layer introduces zero latency.

**Quality dimensions** (composite score = weighted average):

| Dimension | Weight |
|---|---|
| Tag Conformance | 0.30 |
| Hallucination Rate (inverted) | 0.20 |
| Instruction Adherence | 0.15 |
| Structural Integrity | 0.15 |
| Output Efficiency | 0.10 |
| Context Utilization | 0.05 |
| Regression Risk (inverted) | 0.05 |

Composite score < 0.65 for 3 consecutive outputs → Tool Criticism sub-agent activates, generates improvements forwarded to Suggested Jobs.

---

## Gap Analysis System

Persistent systemic analysis across all cycles, agents, forensic history, and sessions. Five gap categories: coverage, structural, process, tag system, agent performance.

### Debt Scoring (per file)

```
+1  needs_refactor    +2  needs_test       +1  dead_code
+3  circular_dep      +2  spaghetti_index  +5  regression (cause in this file)
-1  test coverage     -1  plantag:done
```

Files exceeding their debt ceiling are excluded from build step assignments. Override: God Factory Agent only.

---

## Forensic Database

45 forensic tables. **No entries may ever be deleted.**

| Group | Tables | Key Data |
|---|---|---|
| Core | 7 | Votes, tag mismatches, spaghetti, under/over-engineering |
| Addendum | 9 | Regressions, conflicts, dead tags, spawn violations |
| Blame Crawler | 5 | blame_records, quality_records, tool_criticism, model_registry |
| Gap Analysis | 8 | coverage_matrix, patterns, debt_history, agent_performance |
| Project State Crawler | 5 | ground_truth_snapshots, drift_events, language_registry |
| Suggested Jobs | 6 | job_records, sandbox_runs, implementation_log, crash_recovery_log |
| God Factory | 5 | notification_queue, idle_suggestions, god_factory_actions |

---

## Agent Registry

| Agent | Tier | Role |
|---|---|---|
| God Factory Self-Improvement Agent | 5 | Highest authority. Upgrades the IDE. User's partner. |
| Chat Agent | 4 | Powers Chat tab |
| Agent Agent-Loop | 4 | Powers Agent tab |
| Blame Crawler | 4 | Attributes every model output. Measures quality. |
| Skeptic Agent | 4 | Inspects for AI slop, spaghetti, structural errors |
| Command Agent | 4 | Voting and decided-step management |
| Waiting Sub-Agent | 3 | Synthesizes crawl outputs into completion state |
| Fleet Agents | 3 | Execute decided steps |
| Midwife Bird-Feeding | 3 | Produces nano training datasets |
| Nano Liaison Agent | 3 | Translates nano sea state ↔ devtag taxonomy |
| Fleet Agents-Nano | 1 | Modifies and trains the nano sea |

**Sub-agents**: Diff, Conflict, Regression, Dead Tag, Context Window Manager, Integration Verification

---

## Nano Sea

The Nano Sea is a distributed mesh of ultra-small ML models operating as a compute layer.

- 296 nano models trained for specialized sub-tasks
- Mesh networking, P2P peer discovery, global compute pool
- Training pipeline managed by Midwife Bird-Feeding agent
- Every nano operation represented in devtag:nano taxonomy

```bash
cd NANO_train && python main.py
```

---

## Model Tiers

| Tier | Models | Safe Context |
|---|---|---|
| 1 | Nano / small local | 2,000 tokens |
| 2 | Mid-range local (7B–13B) | 6,000 tokens |
| 3 | Large local (30B–70B) | 16,000 tokens |
| 4 | Large hosted (standard) | 80,000 tokens |
| 5 | Large hosted (extended) | 160,000 tokens |

---

## Routes (33 modules)

| Prefix | Module | Purpose |
|---|---|---|
| `/api/auth` | auth.ts | GitHub OAuth, session management |
| `/api/chat` | chat.ts | SSE streaming chat with blame attribution |
| `/api/files` | files.ts | File system read/write/browse |
| `/api/memory` | memory.ts | Project memory, notes, search |
| `/api/agent` | agent.ts | Agent loop control |
| `/api/models` | models.ts | Available models, context windows |
| `/api/codebase` | codebase.ts | IDE self-modification: read/search/patch/exec |
| `/api/blame` | blame.ts | Model quality forensics and attribution |
| `/api/subsystems` | subsystems.ts | Crawler control plane |
| `/api/tags` | tagRegistry.ts | Devtag/Plantag/Buildtag CRUD + relationship validation |
| `/api/forensic` | forensic.ts | All forensic table reads |
| `/api/spawn` | spawnAuthority.ts | Sub-agent spawn permission checks |
| `/api/gap` | gapAnalysis.ts | Coverage, debt, patterns, agent performance |
| `/api/project-state-crawler` | projectStateCrawler.ts | Ground truth snapshots and drift |
| `/api/suggested-jobs` | suggestedJobs.ts | Job list, sandbox, implementation pipeline |
| `/api/god-factory` | godFactory.ts | Notifications, idle suggestions, brainstorm, monitors |
| `/api/nano` | nano.ts | Nano Sea process lifecycle |
| `/api/fleet` | fleet.ts | Multi-agent orchestration |
| `/api/terminal` | terminal.ts | Terminal multiplexing |
| `/api/health` | health.ts | Rich diagnostic endpoint |

---

## Environment Variables

Copy `.env.example` to `.env`:


Copy `.env.example` to `.env` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_PAT` | **Yes** | GitHub token with `models:read` scope |
| `GITHUB_CLIENT_ID` | For OAuth | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | For OAuth | GitHub OAuth app secret |
| `SERVER_PORT` | No | Server port (default: 3001) |
| `FRONTEND_URL` | No | Frontend URL for CORS (default: http://localhost:5173) |
| `DEFAULT_PROJECTS_DIR` | No | Default projects directory |

---

## Troubleshooting

### `buildModelParams` export error
The shared package needs to be compiled. Run:
```bash
pnpm --filter @personal-ide/shared build
```

### Python not found by Nano Sea
The server auto-detects Python. It tries `python`, `python3`, and `py -3` (Windows).
Make sure Python 3.10+ is on your PATH.

### Port already in use
Kill the process on port 3001 or 5173, or change `SERVER_PORT` in `.env`.

---

## License

Private — All rights reserved.
