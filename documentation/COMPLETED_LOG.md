# Completed Fixes & Changes Log

This file tracks all completed work by session. The TODO_ROADMAP.md contains only forward-looking items.

---

## Session: February 2026 — Critical Bug Fixes & Foundation

### Fix 1: 8000 Token Limit Misattribution
**Problem**: GitHub free tier returns "max 8000 tokens" in error responses. The agent loop was blindly setting `contextWindow = 8000 * 0.95 = 7600`, crippling all agents regardless of model.

**Root Cause**: `isTokenLimitError()` in providers.ts extracts 8000 from the error, and `enhancedLoop.ts` treated it as the model's actual limit.

**Fix** (enhancedLoop.ts):
- Differentiate rate-limit caps from real model limits: if suggested limit < 25% of model's actual context window → it's a rate-limit cap
- Store per-request limits in `discoveredContextLimits` Map (for chunk sizing only)
- Keep the model's real `contextWindow` intact
- Added 16,000 token floor — never operate below this

### Fix 2: Stack Overflow in Chunking Pipeline
**Problem**: `Maximum call stack size exceeded` — ChunkingPipeline recursively creates sub-pipelines when chunks still exceed limits, with no depth limit.

**Fix** (chunkingPipeline.ts):
- Added `maxRecursionDepth: 3` and `_currentDepth` tracking to config
- Depth guard: stops with error message at max depth instead of infinite recursion
- Sub-pipelines inherit parent depth + 1

### Fix 3: Fallback Model Chain 404s
**Problem**: `meta/llama-4-maverick` returns 404 on GitHub Models — it doesn't exist on the platform.

**Fix**:
- Replaced `meta/llama-4-maverick` → `meta/llama-4-scout` in models.ts
- Added 404 auto-recovery handler in enhancedLoop.ts: switches to fallback model, ultimate fallback `openai/gpt-4.1-mini`

### Fix 4: Guest / Local Auth Mode
**Problem**: IDE required GitHub PAT to use — no way to use with local providers only.

**Fix**:
- Added `POST /api/auth/guest` endpoint in auth.ts (creates user with `github_user_id = -1`)
- Added `loginAsGuest()` to authStore.ts
- Added "Continue as Guest (Local Mode)" button to LoginPage.tsx with descriptive text

### Fix 5: Personal Info Audit & Scrubbing
**Problem**: Hardcoded encryption key in 5 source files, personal paths in corpus files, missing .gitignore entries.

**Fix**:
- Moved encryption key to `ENCRYPT_KEY` environment variable via `appConfig.security.encryptKey`
- Updated all 5 files (auth.ts, providers.ts ×2, client.ts, routes/providers.ts) to use config
- Expanded .gitignore: `*.db-shm`, `*.db-wal`, `.venv/`, `*.pt`, `NANO_train/checkpoints/`, `NANO_train/logs/`, `*.jsonl`
- Added `ENCRYPT_KEY` to .env.example

### Fix 6: Memory Panel Auto-Refresh
**Problem**: MemoryPanel only fetches notes once on project change, never auto-refreshes.

**Fix** (MemoryPanel.tsx): Added 15-second polling interval that runs when panel is expanded and a project is active.

### Fix 7: Nano Training Pipeline Stuck
**Problem**: Midwife disabled by default (never generates training data), only 6 of 12 pipeline nanos registered for training, inference returns raw tensors.

**Fix**:
- Changed midwife default `enabled: false` → `enabled: true`
- Added `autoStart()` method with 30s delay + Nano Sea health check
- Expanded priority nanos from 6 → 12 (added QueryExpander, QueryRouter, Rank, ContextAssembler, ResponseValidator, ResponseFormatter)
- Improved inference fallback: tries individual nano `generate_text()` before showing fallback message
- Fallback message now shows trained count

### Fix 8: Documentation Suite Created
Created 9-document documentation suite in `documentation/` directory.

### Fix 9: Nested Button HTML Error
**Problem**: `<button>` nested inside `<button>` in ProjectPanel.tsx — violates HTML spec, causes hydration errors.

**Fix** (ProjectPanel.tsx): Changed outer `<button>` to `<div role="button" tabIndex={0}>` with keyboard event handler. Inner delete button remains a proper `<button>`.

### Fix 10: Nano Sea Connection Spam
**Problem**: ProviderSettings.tsx directly fetches `http://localhost:5100/v1/health` and `/v1/mesh/info`, causing `ERR_CONNECTION_REFUSED` console spam when Nano Sea isn't running.

**Fix** (ProviderSettings.tsx): Routed health checks through the API proxy at `${API_BASE}/api/nano/status` and `${API_BASE}/api/nano/mesh/info` instead of hitting port 5100 directly.

---

## Files Modified (All Sessions Combined)

| File | Changes |
|------|---------|
| `apps/server/src/services/agent/enhancedLoop.ts` | Rate-limit differentiation, per-request limits, 16K floor, 404 handler |
| `apps/server/src/services/llm/chunkingPipeline.ts` | maxRecursionDepth=3 guard |
| `packages/shared/src/constants/models.ts` | Replaced maverick → scout |
| `apps/server/src/routes/auth.ts` | Guest endpoint, env-var encryption key |
| `apps/web/src/stores/authStore.ts` | loginAsGuest() |
| `apps/web/src/components/LoginPage.tsx` | Guest mode button |
| `apps/server/src/config.ts` | security.encryptKey field |
| `apps/server/src/services/llm/providers.ts` | Config-based encryption key |
| `apps/server/src/services/llm/client.ts` | Config-based encryption key |
| `apps/server/src/routes/providers.ts` | Config-based encryption key |
| `.gitignore` | Expanded exclusions |
| `.env.example` | ENCRYPT_KEY field |
| `apps/web/src/components/MemoryPanel.tsx` | 15s auto-refresh |
| `apps/server/src/services/midwife/index.ts` | Auto-start, enabled by default |
| `apps/server/src/routes/midwife.ts` | autoStart(30000) call |
| `NANO_train/main.py` | 12 priority nanos (was 6) |
| `NANO_train/server/main.py` | Improved inference fallback |
| `apps/web/src/components/ProjectPanel.tsx` | Fixed nested button → div[role=button] |
| `apps/web/src/components/ProviderSettings.tsx` | Routed :5100 checks through API proxy |

---

## Session: Current — Connection Recovery, Fleet Stability, Documentation Accuracy

### Fix 11: Agent Connection Error Recovery
**Problem**: When a provider host is unreachable (ECONNREFUSED, ENOTFOUND, ETIMEDOUT), the agent burns all 3 retry attempts on the dead host before failing.

**Fix** (enhancedLoop.ts — outer catch block):
- Added connection error detection: checks for ECONNREFUSED, ENOTFOUND, ETIMEDOUT, ECONNRESET, `fetch failed`, `network error`
- On connection error: immediately calls `rateLimiter.findFallback()` to switch to a live provider
- Resets `consecutiveErrors` to 0 after successful provider switch
- Falls through to normal retry logic only if no fallback is available

### Fix 12: Fleet 429 Rate-Limit Stampede
**Problem**: When 6 fleet agents launch simultaneously, all fire first requests at once against cloud providers, causing immediate 429 rate limits.

**Fix** (fleet.ts):
- Changed agent launch staggering from "only local providers get delay" to ALL providers
- Cloud providers: 1.5s stagger between agent launches
- Local providers: 3.0s stagger between agent launches
- Prevents synchronized request bursts against rate-limited APIs

### Fix 13: Chunking Pipeline Rate-Limit Recursion
**Problem**: When a chunk processing request gets 429/403 rate-limited, `chunkingPipeline.ts` treats it as a token-limit error and recursively sub-divides the chunk, causing `Maximum call stack size exceeded`.

**Fix** (chunkingPipeline.ts):
- Added 429/403 status code detection BEFORE the token-limit check in the catch block
- Rate-limited errors now return `{ success: false, error: 'Rate limited...' }` immediately
- Caller handles backoff instead of recursive subdivision
- Prevents infinite recursion that was crashing the server

### Fix 14: Hardcoded localhost:5100 Bird-Feed URLs
**Problem**: `enhancedLoop.ts` and `chat.ts` both hardcoded `http://localhost:5100` for Nano Sea bird-feed observations. Breaks when Nano Sea runs on a different host/port.

**Fix** (enhancedLoop.ts + chat.ts):
- Replaced hardcoded URL with DB lookup: `db.prepare("SELECT base_url FROM provider_configs WHERE provider_id = 'nano'").get()`
- Falls back gracefully if nano provider not configured
- Works with any Nano Sea host/port

### Fix 15: Hardware-Specific Limits Removed
**Problem**: `config.py` contained a `KNOWN_HARDWARE` dict with 4 hardcoded machine profiles (garage-computer, 1660-dually, 3090-rig, 32-core) identified by hostname. Personal machine names leaked into the code.

**Fix** (config.py):
- Removed entire `KNOWN_HARDWARE` static dict
- `detect_local_hardware()` now always auto-detects via `psutil` + `torch` + `gpu_detect.py`
- No hostname-based lookup — works on any hardware without configuration
- Supports any compute tier from POTATO to DATACENTER

### Fix 16: Personal Info Scrubbed from Repository
**Problem**: Personal Windows paths (`C:\Users\lokee\...`), hostnames, and email in multiple files.

**Fix**:
- Git identity set to `dev@personal-ide.local` / `Personal IDE Dev`
- `.gitignore` expanded: `.env.*`, `*.pem`, `*.key`, `*.cert`, `id_rsa*`
- Bulk-replaced all `C:\Users\lokee\...` paths across NANO_corpus (JSON, Python, Markdown files)
- Replaced `lokee@Streaming-PC` email references with `dev@personal-ide.local`

### Fix 17: Documentation Accuracy Overhaul
**Problem**: Machine-generated docs contained fabricated category names, wrong counts, stale URLs, personal machine references, and fabricated keyboard shortcuts.

**Fixes**:
- **NANO_TRAINING.md**: Replaced 17 fabricated category names with the real 19 categories from `nanos/__init__.py` with accurate per-category counts. Removed "1660-DUALLY" hardware references. Replaced stale `HARDWARE_PROFILES` code block with auto-detection description.
- **SETUP_DEPLOYMENT.md**: Replaced "Reference machine (1660-DUALLY)" section with generic auto-detect description.
- **LLM_INTEGRATION.md**: Fixed stale GitHub Models URL from `models.inference.ai.azure.com` → `models.github.ai/inference` (matching actual code).
- **USER_MANUAL.md**: Replaced fabricated keyboard shortcuts (Ctrl+Shift+A, Ctrl+Shift+P, Ctrl+S, Escape) with the only actually-implemented shortcut (Enter to send, Shift+Enter for newline). Marked planned shortcuts as "planned".
- **SECURITY_AUTH.md**: Updated personal path audit status to reflect scrubbing is complete.
- **nanos/__init__.py**: Fixed stale comment "~230 nano types" → "296 nano types".

---

## Files Modified (This Session)

| File | Changes |
|------|---------|
| `apps/server/src/services/agent/enhancedLoop.ts` | Connection error detection + provider fallback, bird-feed URL from DB |
| `apps/server/src/services/agent/fleet.ts` | Stagger all provider launches (1.5s cloud, 3s local) |
| `apps/server/src/services/llm/chunkingPipeline.ts` | 429/403 rate-limit detection before token-limit check |
| `apps/server/src/routes/chat.ts` | Bird-feed URL from DB instead of hardcoded localhost |
| `NANO_train/config.py` | Removed KNOWN_HARDWARE dict, pure auto-detect |
| `NANO_train/nanos/__init__.py` | Fixed stale nano count comment |
| `.gitignore` | Added secret file patterns |
| `documentation/NANO_TRAINING.md` | 19 real categories, removed personal refs |
| `documentation/SETUP_DEPLOYMENT.md` | Removed personal machine reference |
| `documentation/LLM_INTEGRATION.md` | Fixed GitHub Models URL |
| `documentation/USER_MANUAL.md` | Fixed fabricated keyboard shortcuts |
| `documentation/SECURITY_AUTH.md` | Updated audit status |
| `documentation/TODO_ROADMAP.md` | Marked path scrubbing as complete |
| `NANO_train/NANO_corpus/ML_CODE/*` | Scrubbed personal paths from 8 files |
| `NANO_train/NANO_corpus/schemas_for_frontend_to_backend/*` | Scrubbed personal paths |

---

## Session 3 — Fleet/Agent Failure Fixes & Form Accessibility

### Fix 18: Timeout Cascade — All Fleet Agents Aborting at 3 Minutes
**Problem**: Every fleet agent request hit `AbortSignal.timeout(3 * 60_000)` in `completeChatResponse()`. Ollama processes requests sequentially, so with 6 agents queuing, each waited 3+ minutes → abort signal fired → "Request was aborted" → retry → same failure.

**Fixes**:
- `providers.ts`: Local provider timeout 5min → 10min, cloud 2min → 5min
- `streaming.ts`: Both `streamChatResponse` and `completeChatResponse` AbortSignal 3min → 10min
- `client.ts`: Legacy client timeout 2min → 5min

### Fix 19: Fleet Stagger Too Short — 6 Agents Overwhelming Ollama Queue
**Problem**: 3-second local stagger meant all 6 agents fired within 15s. Ollama serializes requests, so agents pile up and timeout.

**Fixes**:
- `fleet.ts`: Agent launch stagger 3s → 15s local, 1.5s → 3s cloud
- `fleet.ts`: Step delay per agent `max(5000, 3000*count)` → `max(10000, 10000*count)`

### Fix 20: Prompt Overflow — 12K Tokens Sent to 4K Context Model
**Problem**: Agent loop built system prompt + file list + history + task without checking total against model's actual context window. Ollama truncated to 4096, causing garbage responses.

**Fixes**:
- `enhancedLoop.ts`: Added ~40-line EARLY BUDGET ENFORCEMENT block before LLM call
- Enforces: system prompt ≤ 40% of budget, drops PROJECT FILES message, drops oldest history, truncates task — in priority order
- History budget reduced from 20% → 15% of context window

### Fix 21: Connection Error Detection Gaps
**Problem**: "Request was aborted", "timeout", "socket hang up" errors weren't recognized as connection errors, so agents didn't trigger provider fallback.

**Fixes**:
- `enhancedLoop.ts`: Added 5 new patterns to connection error detection: "request was aborted", "aborterror", "the operation was aborted", "timeout", "socket hang up"

### Fix 22: Memory Panel Stale Closure Bug
**Problem**: `useEffect` auto-refresh called `fetchNotes()` via `setInterval`, but `fetchNotes` captured `activeProject` from the render closure. When project changed, the interval still referenced old closure → fetched wrong project or failed silently.

**Fixes**:
- `MemoryPanel.tsx`: Extracted `const projectId = activeProject?.id` for stable reference
- Replaced `fetchNotes()` with `fetchNotesForProject(pid)` that takes explicit project ID
- Auto-refresh `useEffect` now uses `[projectId, expanded]` deps and closure-safe callback
- Added `error` state with error display and retry button
- Added HTTP status checking on all fetch calls

### Fix 23: Form Field Accessibility — Missing id/name/label Associations
**Problem**: 24+ inputs across 8 components missing `id` and `name` attributes. 15+ labels missing `htmlFor` attribute. Browser console warned about inaccessible form fields.

**Fixes** (8 files):
- `LoginPage.tsx`: PAT input + label association
- `ProviderSettings.tsx`: GitHub PAT input + dynamic API key inputs
- `ChatPanel.tsx`: Chat textarea
- `OllamaSetup.tsx`: Custom URL input
- `AgentControls.tsx`: 6 inputs (agent count, cooldown, max iterations, step delay, auto-approve, auto-answer) + 6 labels
- `ProjectPanel.tsx`: 3 inputs (name, path, description)
- `MemoryPanel.tsx`: 7 inputs (search, title, content, tags, priority, edit title, edit content) + 1 label
- `MidwifePanel.tsx`: 4 inputs (bulk cooldown, task cooldown, global cooldown, nano port) + 3 labels

---

## Files Modified (Session 3)

| File | Changes |
|------|---------|
| `apps/server/src/services/llm/providers.ts` | Timeout 5→10min local, 2→5min cloud |
| `apps/server/src/services/llm/streaming.ts` | AbortSignal 3→10min in both functions |
| `apps/server/src/services/llm/client.ts` | Timeout 2→5min |
| `apps/server/src/services/agent/fleet.ts` | Stagger 3→15s local, step delay 3→10s/agent |
| `apps/server/src/services/agent/enhancedLoop.ts` | Early budget enforcement, history 20→15%, +5 error patterns |
| `apps/web/src/components/MemoryPanel.tsx` | Stale closure fix, error state, id/name attrs |
| `apps/web/src/components/AgentControls.tsx` | 6 inputs + 6 labels: id/name/htmlFor |
| `apps/web/src/components/MidwifePanel.tsx` | 4 inputs + 3 labels: id/name/htmlFor |
| `apps/web/src/components/LoginPage.tsx` | PAT input: id/name/htmlFor |
| `apps/web/src/components/ProviderSettings.tsx` | 2 inputs: id/name |
| `apps/web/src/components/ChatPanel.tsx` | Textarea: id/name |
| `apps/web/src/components/OllamaSetup.tsx` | URL input: id/name |
| `apps/web/src/components/ProjectPanel.tsx` | 3 inputs: id/name |
