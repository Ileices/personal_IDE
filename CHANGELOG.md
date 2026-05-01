# Changelog

All notable changes to Personal IDE are documented in this file.

Format: `[version/date] — summary`  
Entries are in reverse chronological order.

---

## [Unreleased / 2026-05-02] — Integration Hardening: Transactional Spawn, Stability Monitor, Context Budget, Nano Confidence

**12 integration cohesion patches applied. All builds clean. Spawn / agent / fleet lifecycle end-to-end verified.**

### Transactional Spawn Authority (Patch 1 — `spawnAuthority` service + route)

The old `POST /api/spawn/check` was a single-shot authorization check with no audit trail.
Replaced with a two-phase transactional confirmation model:

| Step | Endpoint | Result |
|---|---|---|
| 1. Request | `POST /api/spawn/request` | `{status:pending_confirmation, confirmationId, tier, agent_class}` |
| 2. Inspect | `GET /api/spawn/confirmation/:id` | `{status:pending_confirmation \| accepted \| rejected}` |
| 3. Approve | `POST /api/spawn/confirmation/:id/approve` | `{resolved:true, status:accepted}` |
| 4. Reject | `POST /api/spawn/confirmation/:id/reject` | `{resolved:true, status:rejected}` |
| 5. Execute | `POST /api/spawn/execute` | `{allowed:true}` on first call; `{allowed:false, reason:…}` on replay |

Idempotency: a consumed or rejected confirmation cannot be re-executed. Replay is denied with an explicit reason string. Old `check` / `violations` / `model-tier` / `chart` endpoints are preserved for backward compatibility.

`TheGodFactory.tsx` `spawn_authority_check` tool updated to route through the confirmation-aware flow.

### Stability Monitor with Auto-Rollback (Patch 2 — new `stabilityMonitor` service + `stability` route)

New `StabilityMonitor` class with rolling 10-cycle window:

- Persists `StabilitySnapshot` records to `stability_snapshots` table on every `record()` call
- Threshold checks after every record: 2 consecutive test failures, blame score drop >0.15 over 3 cycles, 2 consecutive loop detections, buildtag rejection spike >0.20
- On threshold breach: fires rollback `notification_queue` entry + creates forensic suggested job
- `healthStatus()` returns `'healthy' | 'degraded' | 'critical'`
- Wired into `suggestedJobsCrawler` — `record()` called on every crawler tick; rollback result gates pipeline continuation (rollback triggered → pipeline aborted for that tick)

New REST endpoints:
- `GET /api/stability/window` → `{health, snapshots[]}`
- `POST /api/stability/record` → snapshot + rollback result

### Context Window Manager Integration (Patch 3 — `contextWindowManager` + `contextAssembly` + `enhancedLoop`)

`ContextWindowManager.fitPrioritySlots()` integrated into the agent loop context assembly path:

- Priority order: `system_prompt > task_buildtags > devtags > history > memory > code_content`
- Tier ceilings: T1 2k, T2 6k, T3 16k, T4 80k, T5 160k tokens
- Truncation events logged to `notification_queue` for forensic inspection
- `contextAssembly.ts` uses shaped locals (never mutates incoming agent config)
- Legacy `contextWindow.ts` sub-agent aligned to canonical manager to eliminate behavioral drift

### Nano Confidence Threshold + Provider Fallback (Patch 4 — `config` + `streaming` + `chat` + `enhancedLoop`)

- `appConfig.nano.confidenceThreshold` added (default `0.65`)
- `streaming.ts` non-stream path now returns provider metadata including `confidence` in the call result
- `chat.ts` and `enhancedLoop.ts` check confidence against threshold; if below, reroute to next-highest-confidence provider before returning to the caller
- Prevents silent degraded-quality responses when the nano provider is under-trained

### Nano Liaison Telemetry Payload Alignment (Patch 5 — `trainer.py` + new `nanoLiaison` service)

`NANO_train/training/trainer.py` status payload now exposes per-nano `training_steps`, `best_loss`, and `last_loss` at the top level of each nano entry (previously nested under internal tracking fields), making them directly accessible to the liaison without post-processing.

New `NanoLiaisonAgent` (`services/nanoLiaison/index.ts`):
- Polls Python Nano Sea `/v1/training/status` every 15 s
- Diffs nano states between polls; creates `devtag` records for changed nanos
- Writes forensic entries for anomalies (loss spike, training stall)
- `startNanoLiaisonAgent(db)` singleton wired into server startup

### Suggested Jobs Crawler Rollback Gating (Patch 6 — `suggestedJobsCrawler`)

`StabilityMonitor.record()` is called on every crawler sandbox tick. If the returned rollback result indicates a rollback was triggered, the current crawl pipeline is aborted for that tick and a forensic note is written. This prevents the crawler from continuing to generate and queue jobs during an active stability regression.

### Additional New Services

- **`milestoneEmitter.ts`** (`services/agent/loop/`): `writeMilestone()`, `writeQualitySnapshot()`, `emitIterationMilestones()`, `inferQualityFromContext()` — structured loop progress written to `loop_milestones` + `loop_quality_snapshots` tables
- **`siliconFactory/index.ts`** + **`siliconFactory.ts`** route (1821 + 627 lines): task lifecycle, IAP messaging, sync locks, state snapshots, symbol graph, test indexing, embeddings

### Runtime Verification Results

All verification run against the live server after clean rebuild:

| Check | Result |
|---|---|
| `tsc` server build | ✅ clean (pre-existing chunk-size warnings only) |
| Vite web build | ✅ clean |
| `GET /api/health` | ✅ 200 |
| Spawn: request → pending | ✅ `{status:pending_confirmation}` |
| Spawn: approve → accepted | ✅ `{resolved:true, status:accepted}` |
| Spawn: execute ×1 | ✅ `{allowed:true}` |
| Spawn: execute ×2 (replay) | ✅ `{allowed:false, reason:Confirmation not approved…}` |
| Agent start/status/pause/resume/stop | ✅ all HTTP 200 |
| Fleet start/pause/resume/stop | ✅ all HTTP 200 |
| Chat SSE, conversation CRUD | ✅ all HTTP 200 |
| Ollama proxy routes | ✅ HTTP 200 |
| Nano payload routes (no Nano Sea) | ✅ graceful 200 |
| Migration 100 `forensic_composite_indexes` | ⚠️ FAILS — `agent_class` column missing in `blame_records`; non-blocking, schema version stays at v17 |
| `nanoTelemetryShape` check | ⚠️ expected fail — Nano Sea not running in this env |

### Known Issues

- **Migration 100 (`forensic_composite_indexes`)** — creates index on `blame_records.agent_class` but that column does not exist in the current schema. Non-blocking (server starts at v17). Fix: add `agent_class TEXT` column to `blame_records` in migration prior to 100.
- **`localhost` vs `127.0.0.1` on Windows** — on this machine, `localhost` resolves to `::1` (IPv6) while `127.0.0.1` (IPv4) is not bound. Use `localhost:3001` for all requests; `127.0.0.1:3001` will time out (HTTP 000).

---

## [Unreleased / 2026-05-01] — Unified Spec Full Implementation

**Largest single commit in project history. 64 files changed, 19,699 insertions.**

The entire Agentic IDE Unified System Specification (v1.0) — 2,662 lines — has been
implemented across backend, frontend, database, and agent services. This commit
supersedes all prior partial implementations of: memory_tab_spec,
memory_tab_spec_addendum, gap_analysis_system, project_state_crawler,
the_god_factory_agent, suggested_jobs_system, forensic_database_blame_crawler.

### New Backend Routes

| Route Module | Prefix | Endpoints |
|---|---|---|
| `godFactory.ts` | `/api/god-factory` | notifications, idle suggestions, brainstorm, background-status (per-sub-agent), implementation-pipeline/:job_id (6 stages), background-sub-agents tick, actions, sessions, model/sandbox controls |
| `tagRegistry.ts` | `/api/tags` | devtags CRUD + resolve, plantags CRUD, buildtags CRUD, relationship-rules, vocabulary-diff, orphan-scan, conflict-scan, resolution-latency, language-registry GET/POST |
| `gapAnalysis.ts` | `/api/gap` | scan, coverage, debt/scores, debt/heatmap, patterns, patterns/:id, performance, regressions |
| `forensic.ts` | `/api/forensic` | entries (all tables), regressions, conflicts, dead-tags, spawn-violations, tag-mismatches |
| `spawnAuthority.ts` | `/api/spawn` | check, violations, model-tier, chart |
| `suggestedJobs.ts` | `/api/suggested-jobs` | jobs CRUD, jobs/search, jobs/:id/sandbox, jobs/:id/implement, jobs/:id/archive |
| `projectStateCrawler.ts` | `/api/project-state-crawler` | crawl, snapshots/latest, drift-events, skipped-files, snapshots/:id |

### New Backend Services

- `services/tagRegistry/index.ts` — `TagRegistryService` class: devtag/plantag/buildtag lifecycle, relationship validation, retirement workflow (Tag Retirement Chart enforcement)
- `services/spawnAuthority/index.ts` — `SpawnAuthorityService`: deterministic spawn gate, authority chart enforcement, violation logging
- `services/gapAnalysis/` — 6 modules: `coverageAnalysis`, `debtTracking`, `patternRecognition`, `tagSystemAnalysis`, `agentPerformance`, `tools` (all 12 deterministic gap analysis tools)
- `services/projectStateCrawler/` — `index.ts` + `parser.ts`: deterministic file parsing, drift detection (Registry Surplus/Deficit/Content Drift/Location Drift)
- `services/suggestedJobsCrawler/index.ts` — 10 independent review protocols, blame-driven mode, external project mode
- `services/severityEscalation/index.ts` — full Severity Escalation Chart (info → warning → error → critical → fatal, automatic escalation conditions)
- `services/agent/persistent/` — 4 new persistent agent modules: `versionControl`, `regressionAgent`, `parallelCoordinator`, `nanoLiaison`
- `services/agent/subagents/` — 6 new sub-agent modules: `diff`, `conflict`, `regression`, `deadTag`, `contextWindow`, `integrationVerification`

### New Frontend Components

- `GodFactoryRightPanel.tsx` — updated with:
  - **Per-sub-agent monitor breakdown** in Background Scan section (6 monitors: Registry Monitor, Idle Scanner, Debt Monitor, Model Performance Monitor, Gap Report Monitor, Pattern Watch)
  - **External Projects panel** — dedicated section for `job_category=external_project` jobs
  - **Implementing Pipeline panel** — active jobs with 6-stage progress visualization (✓/▶/✗/○ markers, live spinners)
  - New interfaces: `BackgroundSubAgentStatus`, `ImplementationStage`, `ImplementingJob`
  - Auto-refresh for external jobs and implementing jobs (30s interval)
- `ForensicPanel.tsx` — full forensic table browser
- `GapAnalysisPanel.tsx` — coverage, debt, pattern analysis UI
- `ProjectStateCrawlerPanel.tsx` — snapshot viewer, drift event browser
- `SuggestedJobsPanel.tsx` — full job list with filtering, sandbox status, pipeline trigger
- `TagRegistryPanel.tsx` — devtag/plantag/buildtag registry browser
- `blame/CriticismsTab.tsx`, `blame/QualityTab.tsx`, `blame/JobsTab.tsx`, `blame/SuccessesTab.tsx` — modular BlamePanel tabs

### Chat Agent Tools — 11 New Tools Added to TheGodFactory.tsx

| Tool | Endpoint | Purpose |
|---|---|---|
| `resolve_devtag` | `GET /api/tags/devtags/resolve?tag_key=` | Resolve devtag from registry by key |
| `tag_vocabulary_diff` | `GET /api/tags/vocabulary-diff` | Types in use vs proposed vs unused |
| `orphan_scan` | `GET /api/tags/orphan-scan` | Dead/orphaned devtags and buildtags |
| `conflict_scan` | `GET /api/tags/conflict-scan` | Active devtag claim conflicts |
| `gap_scan` | `GET /api/gap/scan` | Live gap analysis scan |
| `regression_index` | `GET /api/forensic/regressions` | Systemic regression history |
| `debt_heatmap` | `GET /api/gap/debt/heatmap` | Debt heatmap by file |
| `pattern_trend` | `GET /api/gap/patterns/:id` | Pattern recurrence trend data |
| `agent_conformance_report` | `GET /api/gap/performance` | Agent conformance metrics |
| `implementation_pipeline_status` | `GET /api/god-factory/implementation-pipeline/:id` | 6-stage pipeline progress |
| `spawn_authority_check` | `POST /api/spawn/check` | Validate sub-agent spawn authority |

`TOOL_DEFINITIONS_PROMPT` table and `formatToolSummary` function updated for all 11 new tools. Total tools: 31.

### Database Migrations

DB migrations v1–v13 + `ensureGodFactorySchemaBackfill()` runtime safety function. All 45 forensic tables now present:

**Core (7)**: failed_votes, tag_mismatches, spaghetti_index, under_engineered_regions, over_engineered_regions, missing_tests, circular_dependencies, incomplete_work

**Addendum (9)**: regression_history, conflict_log, dead_tags, diff_failures, integration_failures, version_commits, nano_anomalies, spawn_violations, systemic_regressions

**Blame Crawler (5)**: blame_records, quality_records, tool_criticism_records, blame_successes, model_registry

**Gap Analysis (8)**: coverage_matrix, patterns, debt_history, tag_collisions, agent_performance, tag_resolution_log, gap_reports, vocabulary_gaps

**Project State Crawler (5)**: ground_truth_snapshots, snapshot_devtags, drift_events, skipped_files, language_registry (seeded with common extensions)

**Suggested Jobs (6)**: job_records, sandbox_runs, test_results, debug_records, implementation_log, crash_recovery_log

**God Factory (5)**: notification_queue, idle_suggestions, brainstorm_records, god_factory_actions, interactive_sessions

---

## [2026-04-30] — God Factory naming + grounding improvements

- Standardized all UI labels, doc references, and panel headers to "THE GOD FACTORY"
- God Factory chat agent: grounded every suggestion in live system state (devtags, forensic entries)
- Model strategy reliability: improved fallback chain, fixed context window resolution hang
- Background scan sub-agents connected to subsystem scheduler
- Subsystem control plane exposed in GodFactoryRightPanel

---

## [2026-04-29] — God Factory subsystem control plane

- `subsystems.ts` route: unified control plane for crawlers (gap analysis, state crawlers, suggested jobs)
- `subsystemScheduler.ts` service: periodic orchestration, `startSubsystemScheduler`, `stopSubsystemScheduler`, `getSubsystemRuntimeStatus`
- GodFactoryRightPanel: Subsystem Controls section (enable/disable crawlers, manual run, depth, idle interval, idle ON/OFF, manual ONLY/AUTO)
- BlamePanel modularization: split into scoped tab components (Analysis, Quality, Criticisms, Jobs, Successes)
- GodFactory + AgentControls refactored into standalone modules
- Blame route: full blame records, model quality stats, blame attribution
- DB migration adding blame_records columns

---

## [2026-04-28] — The God Factory + universal model picker

- **THE GOD FACTORY** panel introduced: highest-authority agentic interface with full codebase access
- Universal model picker: all 100+ models (GitHub Models, OpenAI, Anthropic, local Ollama) available everywhere
- Safe codebase access tools: `patch_file`, `write_file`, `run_command` with user approval gate
- Agent loop: prompt history, checkpoint management
- Midwife controls: slider configuration, DB persistence
- Local Model Catalog: Ollama integration, 145+ models browsable in UI
- Help panel cleanup
- Model health workflow: monitoring, quality thresholds, notification triggers

---

## [2026-04-27] — Agent loop stabilization

- Phase 4 agent loop smoke tests
- Lifecycle check and fleet smoke validation
- Multiple checkpoint stabilization runs

---

## [2026-03-09] — Hierarchical codebase index

- Hierarchical codebase indexing with exploration gate
- Orphaned module wiring and connectivity fixes

---

## [2026-03-08] — Production hardening

- RateLimitDashboard crash fix on `_deadModels` meta-key from `getAllStatus()`
- Cross-provider fallback: unified fallback chain across GitHub Models, OpenAI, Anthropic, local
- Tool executor safety guards
- Preview PID tracking fixes
- 8-phase agent overhaul:
  - Death spiral detection and recovery
  - Free provider integration
  - Tool execution reliability
  - Self-reflection loop

---

## [2026-03-07] — Model infrastructure

- Model presets and prompt adapter
- Timing service
- Dataset builder
- Conversation sidebar with history
- Ollama health monitor

---

## [2026-03-06] — Rate limiting and chunking

- Cooldown spam prevention
- Chunking 413 response fix
- OpenClaw crash fix + safety warnings

---

## [2026-02-28] — Scalable modularization

- **Pass 2**: 10 new modules extracted from monoliths
- Critical fail-point hardening across all agent paths
- 4 monolith decompositions
- `enhancedLoop.ts` decomposed from central agent file
- Health and graceful shutdown improvements
- Terminal backend + frontend (terminal multiplexing)
- OpenClaw GUI integration
- 13 auto_rebuilder modules
- Token-aware code indexer
- E2E scaffolding setup
- NanoSea decomposition: mesh, pool, training pipeline separated
- Priority items 1–9 from architecture audit completed
- DO FIRST + HIGH PRIORITY items 2–8 completed

---

## [2026-02-27] — Config centralization

- Centralized `API_BASE` in frontend: eliminated all hardcoded `localhost:3001` references
- Centralized config module in server: eliminated hardcoded values
- `enhancedLoop.ts` decomposed into separate concern files

---

## [2026-02-25] — Agent loop death spiral fix

- **Root cause found**: 5 compounding bugs causing 539 consecutive zero-output iterations
- Schema enforcement: agent outputs validated before state transitions
- Anti-poisoning protection: context contamination detection
- Smart context management: relevance-ranked context windowing
- Fleet timeout cascade fix
- Prompt overflow guard
- Memory panel stale closure fix
- Form accessibility improvements

---

## [2026-02-25] — Initial commit

**Personal IDE — Sea of Nanos** initial public release.

- Fastify backend: chat, models, memory, agent loop
- React frontend: Monaco editor, chat panel, agent panel
- Sea of Nanos: 296 specialized nanos, P2P mesh networking, distributed training
- GitHub Models API integration (primary LLM provider)
- Project memory: notes, conversation history, search
- Agent loop: checkpoint/restore, multi-step execution
- Fleet agents: multi-agent orchestration

---

## Version History Summary

| Date | Build | Key Change |
|---|---|---|
| 2026-05-01 | Unified Spec | 64 files, 19,699 insertions — full agentic spec implemented |
| 2026-04-30 | God Factory v2 | Grounding, naming standardization, model strategy |
| 2026-04-29 | Subsystem Control | Crawler control plane, BlamePanel tabs, scheduler |
| 2026-04-28 | God Factory v1 | THE GOD FACTORY panel, universal model picker |
| 2026-04-27 | Stabilization | Agent loop smoke tests |
| 2026-03-09 | Index | Hierarchical codebase index |
| 2026-03-08 | Hardening | Production hardening, 8-phase agent overhaul |
| 2026-03-07 | Models | Presets, dataset builder, Ollama health |
| 2026-03-06 | Rate limits | Chunking fix, cooldown, OpenClaw |
| 2026-02-28 | Modularization | 10 modules, terminal, NanoSea decomp, E2E |
| 2026-02-27 | Config | API_BASE centralization |
| 2026-02-25 | Death spiral fix | 5 bugs, 539 zero-output iterations fixed |
| 2026-02-25 | Initial | Personal IDE + Sea of Nanos |
