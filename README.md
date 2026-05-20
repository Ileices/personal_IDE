# Personal IDE — Agentic Development Environment

[![Security Audit](https://github.com/Ileices/personal_IDE/actions/workflows/security-audit.yml/badge.svg)](https://github.com/Ileices/personal_IDE/actions/workflows/security-audit.yml)
[![pnpm](https://img.shields.io/badge/pnpm-10%2B-orange)](https://pnpm.io/)
[![Node.js](https://img.shields.io/badge/node-20%2B-green)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub Discussions](https://img.shields.io/github/discussions/Ileices/personal_IDE)](https://github.com/Ileices/personal_IDE/discussions)
[![Security Advisories](https://img.shields.io/badge/Security-0%20open%20vulnerabilities-brightgreen)](https://github.com/Ileices/personal_IDE/security/dependabot)

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

### Portable Contract Test (Auto Server Lifecycle)

Run the subsystem contract suite with one command:

```bash
npm run test:subsystems:e2e
```

This command is cross-platform and will:
- reuse an already-running server if available, or start one automatically
- wait for `/api/health`
- run `testing/e2e/subsystems.test.ts`
- stop the server process it started

If you need faster bootstrap and want to skip full build/typecheck verification during setup, run:

```bash
SKIP_SETUP_VERIFY=1 node scripts/setup.js
```

```powershell
$env:SKIP_SETUP_VERIFY = '1'
node scripts/setup.js
```

---

## Help System and Feature Discovery

**The Help system is now an executable roadmap.**

### What's in the Help Section?

Accessible via the Help icon (Activity Bar, bottom left) or `?` keyboard shortcut:

| Coverage | Details |
|----------|---------|
| **Shell Navigation** | Activity Bar, Top Bar, Editor tabs, Terminal, Preview, Conversation Sidebar — quick tips on every major control |
| **Agent Architecture** | God Factory, Chat Agent, Agent Agent-Loop, Fleet, persistent crawlers — memory scopes, authority model, interaction types |
| **Build Layer Detail** | Pre-edit protocol, Memory/Project/State crawlers, WAITING state machine, Skeptic/Command/Builder agents, post-commit validation |
| **Meta Layer Detail** | Blame Crawler quality dimensions, tool criticism, Gap Analysis 5-agent system, Suggested Jobs 10-protocol suite, sandbox execution |
| **Memory System** | All 6 LLM interaction memory surfaces (Ask/Edit/Plan × Chat/Agent Loop) with scope enforcement (TOTAL/SELF/CUSTOM/PRESET) |
| **Project State Crawler** | Ground truth snapshots, drift event taxonomy (4 types), Tree-sitter parsing per language, reconciliation rules |
| **Nano Sea v2** | Swarm layer architecture, chromatic routing (RBY-simplex), soft-k routing (8-10% improvement proven), cosmic cycles (train→compress→deposit→rebuild), Fleet Agents-Nano |
| **Advanced Panels** | Tag Registry, Forensic Database, Gap Analysis, Project State Crawler, Suggested Jobs — all with detailed tab-by-tab guides |
| **Coming Soon Features** | 35+ specification-defined features marked as `coming_soon` to guide implementation priorities |

### Search and Tags

- **Full-Text Search**: Searches section titles, summaries, all detail content, tags, and quick tips — not just titles
- **Tag Navigation**: Sections tagged with feature names, pipeline membership (`build-layer`, `meta-layer`, `nano-sea-v2`), and status (`coming-soon`, `active`)
- **Cross-References**: Each section links to related panels and forensic database entries

### "Coming Soon" Features

The Help system marks unimplemented specification concepts with status `coming_soon`:

- **Build Layer**: WAITING state machine 5-state diagram, voting rules detail, tag validator 5-check spec, pre-edit protocol detail
- **Meta Layer**: Blame Record full schema (25+ fields), Model Registry capability profiles, quality dimensions 7-dimension scoring formulas, Tool Criticism 3-trigger rule, tool modification schema
- **God Factory**: Interactive state routing, 6 background scan sub-agents + schedules, 6 idle suggestion categories, 8 screen panels detail, complete authority boundary list (may/may not)
- **Gap Analysis**: 5 anti-patterns (AI Slop, Drift, Spaghetti Growth, Hallucination Loop, Context Loss), debt score formula (step-by-step), 15 deterministic callable tools, 7 agent performance metrics
- **Project State Crawler**: Tree-sitter parsing layer full mapping, sub-crawler architecture + skip rules, 4 drift types with escalation triggers, WAITING reconciliation rules
- **Suggested Jobs**: 10 codebase review protocols in sequence, full job record schema (20+ fields), sandbox 5-sub-agent loop, 6-stage implementation pipeline with crash recovery
- **Unified Spec**: Complete 80+ devtag base vocabulary, voting and command agent decision rules, output capture layer mechanism, unified spec integration points
- **Memory**: Six dedicated memory surfaces (Ask/Edit/Plan × Chat/Agent Loop) as first-class UI panels
- **Nano Sea v2**: Architecture map, swarm layer visualizer, cosmic cycle timeline, RBY-simplex navigator

These "coming soon" items serve two purposes:
1. **User expectations**: Users know what's planned and can navigate to related implemented features
2. **Implementation roadmap**: Engineers can use tags to identify features ready for surgical implementation

### Unified Spec Alignment (Fully Indexed)

All 12 specification documents in `build_runs/feedback/` are now fully covered by the Help system:
- `unifi_spec.txt` — Unified Build Layer + Meta Layer architecture
- `the_god_factory_agent.txt` — God Factory interactive + background scan states
- `memory_tab_spec.txt` — Six dedicated memory surfaces + 9 agents + scope enforcement
- `suggested_jobs_system.txt` — Blame-driven crawler + 10 protocols + sandbox pipeline
- `forensic_database_blame_crawler.txt` — Blame records, quality dimensions, tool criticism
- `gap_analysis_system.txt` — 5 gap agents, drift types, forensic outputs
- `project_state_crawler.txt` — Ground truth, drift detection, WAITING integration
- Plus 5 additional specification documents on nano sea, midwife, deployment, security, and training

### Nano Sea Engineer Guide

See `NANO_train/NANO_corpus/lump/NERDS_ASSEMBLE.txt` for the comprehensive Nano Sea v2 alignment document written for engineers:
- 30 validated experiments proving soft-k routing outperforms hard top-k by 8-10%
- Swarm layer mechanics and chromatic index routing (RBY-simplex) explanation
- Cosmic cycles and deposit-guided warm-start (+25% convergence improvement)
- Integration into agent query routing with blame feedback loop
- 6-phase build order and anti-patterns guide
- Q&A and vision statement for the future nano sea

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
Kill the process on port 3001, 5173, or 5174, or change `SERVER_PORT` in `.env`.

Windows PowerShell:
```powershell
Get-NetTCPConnection -LocalPort 3001,5173,5174 -ErrorAction SilentlyContinue |
	Select-Object -ExpandProperty OwningProcess -Unique |
	ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
```

Linux/macOS:
```bash
lsof -ti :3001 -ti :5173 -ti :5174 | xargs -r kill -9
```

---

## License

Private — All rights reserved.
