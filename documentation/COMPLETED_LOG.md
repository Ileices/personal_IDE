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
---

## Session: Agent Loop Death Spiral Fix (commit bbf1648)

**Context**: User left the agent running for 8 hours in non-fleet mode. It burned 539 iterations, consumed the entire LLM budget, and produced **zero file changes**. Event log showed a repeating death spiral caused by 5 compounding bugs.

### Fix 24: Structured Output .slice() Crash Guard
**Problem**: `structured.summary.slice(0, 100)` crashes with `Cannot read properties of undefined (reading 'slice')` when the LLM returns JSON without all required fields. The crash was caught but silently swallowed, leaving the loop in a broken state.

**Fix** (enhancedLoop.ts):
- Changed `const structured` to `let structured` to allow field patching
- Added guard block after `parseStructuredOutput()`: ensures `summary`, `filesChanged`, `nextSteps`, `questionsForUser`, `done`, `confidence` all have fallback values
- `structured.summary = structured.summary || 'Step N completed'` prevents all downstream `.slice()` crashes

### Fix 25: Schema-Enforcing Fallback Prompt
**Problem**: When structured output parsing returned null, `currentTask` was set to `"Continue with the implementation. Remember to include the structured JSON output block."` — this context-free prompt caused the LLM to hallucinate random unrelated projects, creating an inescapable loop.

**Fix** (enhancedLoop.ts):
- Replaced useless fallback with comprehensive schema enforcement block
- Tracks `consecutiveErrors` for schema misses separately
- If file changes were parsed without structured output, counts as partial progress (resets error counter)
- Rebuilds `currentTask` with: explicit schema violation notice, full example of the required `\`\`\`json:structured_output` format, and the ORIGINAL `initialTask` content (not accumulated junk)
- After 8 consecutive schema misses → halts with clear error message suggesting a different/larger model

### Fix 26: Loop Detection With Teeth
**Problem**: Loop detection fired but only prepended a warning message to the prompt that the LLM ignored. It never reset its detection history, so breakout prompts accumulated junk. It used the corrupted `currentTask` instead of the original task.

**Fix** (enhancedLoop.ts):
- Added `loopBreakoutAttempts` counter, incremented each time loop is detected
- After 5 breakout attempts with zero `totalFilesChanged` → halts with clear error
- Calls `this.loopDetector.reset()` after each detection — gives breakout prompt a fresh start
- Uses `initialTask` (not accumulated `currentTask`) for the breakout prompt context
- Appends ABSOLUTE REQUIREMENT block with explicit file change format example AND structured JSON example

### Fix 27: consecutiveErrors Reset Placement
**Problem**: `this.consecutiveErrors = 0` was placed at the START of the "Process Response" section — BEFORE the structured output processing that could crash. This meant `maxConsecutiveErrors` (default 5) was never reached, because the counter reset to 0 every iteration before it could increment.

**Fix** (enhancedLoop.ts):
- Removed `this.consecutiveErrors = 0` from the "Process Response" section
- Moved it to INSIDE the `if (structured)` block, AFTER successful structured output processing
- Schema misses in the `else` block now properly increment `consecutiveErrors`
- `consecutiveErrors` is also reset when file changes are detected without structured output (partial progress path)

### Fix 28: No-Progress Detection
**Problem**: No mechanism to detect "N iterations with zero file changes." The agent could run indefinitely making zero progress as long as it didn't trigger the loop detector's hash-based detection (which requires identical responses, not just unproductive ones).

**Fix** (enhancedLoop.ts):
- Added `iterationsWithoutFileChanges` counter and `maxIterationsWithoutProgress = 15`
- After file changes applied: if changes > 0, reset both `iterationsWithoutFileChanges` and `loopBreakoutAttempts`
- If changes = 0, increment counter
- At 15 consecutive no-change iterations → halts with clear error message

### Fix 29: parseStructuredOutput Robustness
**Problem**: `parseStructuredOutput()` only looked for content between `\`\`\`json:structured_output` markers, with fallbacks for `<!-- STRUCTURED_OUTPUT_START -->` and generic `\`\`\`json` blocks. If the LLM returned valid JSON without any of these markers, parsing returned null even though usable output existed.

**Fix** (prompts.ts):
- Added last-resort regex fallback: finds ANY JSON object containing a `"summary"` key anywhere in the LLM response content
- Catches cases where the LLM outputs valid JSON but without proper markers
- Extraction chain is now: primary markers → fallback markers → any json block → regex for JSON with "summary" key → null

---

## Files Modified (Death Spiral Fix Session)

| File | Changes |
|------|---------|
| `apps/server/src/services/agent/enhancedLoop.ts` | 5 fixes: field guards, schema-enforcing fallback, loop detection with reset/escalation/halt, consecutiveErrors placement, no-progress tracking |
| `apps/server/src/services/modes/prompts.ts` | Last-resort regex JSON extraction in parseStructuredOutput |

### New Constants & Thresholds
| Constant | Value | Purpose |
|----------|-------|---------|
| `maxIterationsWithoutProgress` | 15 | Halt after N iterations with zero file changes |
| Schema miss halt threshold | 8 | Halt after N consecutive structured output parse failures |
| Loop breakout halt threshold | 5 | Halt after N breakout attempts with zero total file changes |

---

## Session: Robust Agent Automation (commit 09130a2)

**Context**: After the death spiral halt fixes (Fixes 24-29), testing revealed the agent still burned 35 iterations before halting. The halts worked, but the underlying automation needed fundamental improvements to make the agent *actually produce code* instead of looping.

### Fix 30: Truncation-Resilient System Prompt
**Problem**: The system prompt from `buildAgentSystemPrompt` is ~8000+ tokens. For Ollama 4k context, `truncateToFit` preserves 60% head and 35% tail — but the critical output format instructions were in the middle and got cut. The LLM never saw the required format.

**Fix** (agentPrompts.ts):
- Added `CRITICAL_FORMAT_HEADER` constant (~300 tokens): placed at the VERY START of the system prompt. Contains: role definition, anti-refusal rules, compact file change format example, compact structured output example. Survives in the 60% head of any truncation.
- Added `SCHEMA_REMINDER_FOOTER` constant (~100 tokens): placed at the VERY END of the system prompt. Survives in the 35% tail of any truncation.
- Even a 4k model with 1200-token system budget now sees the format at both start and end.

### Fix 31: Anti-Refusal Instructions
**Problem**: Small LLMs responded with "I'm sorry for any confusion, but as an AI model developer" — breaking character and refusing to code. The "CRITICAL:" prefix in schema miss retries further triggered apology patterns.

**Fix** (agentPrompts.ts + enhancedLoop.ts):
- `CRITICAL_FORMAT_HEADER` includes explicit rules: NEVER say "I'm sorry", "I apologize", "As an AI", or "I cannot"
- All loop detector breakout prompts now end with "DO NOT apologize or explain — just write code"
- Schema miss handler reworded from "CRITICAL: Your previous response did NOT include..." to task-first framing with neutral language

### Fix 32: Conversation History Anti-Poisoning
**Problem**: Failed exchanges ("I'm sorry" responses + CRITICAL retry prompts) were stored in conversation memory and fed back as history context. The LLM saw its own apology patterns and repeated them.

**Fix** (enhancedLoop.ts):
- **History filtering**: Before building the message array, filters out:
  - Assistant messages containing "I'm sorry", "I apologize", "As an AI model"
  - Assistant messages with no file changes AND no structured output
  - User messages starting with "CRITICAL:" or containing "LOOP DETECTED:" or "previous output was missing"
- **Conditional memory storage**: Failed assistant responses (apologies without code) are NOT stored in `messages` table. Schema-miss retry prompts are NOT stored as user messages.
- **History condensation**: Long assistant messages (>800 chars) are condensed to just their summary + file list. Long user messages (>500 chars) are truncated. Dramatically reduces history token usage.

### Fix 33: Context-Aware Auto-Answers
**Problem**: When the LLM generated `questionsForUser`, the auto-answer was just "Proceeding with best practices" — which told the LLM nothing and was never injected back into the prompt. The LLM saw no answer and asked again, creating a question loop.

**Fix** (enhancedLoop.ts):
- New `buildAutoAnswer(question, codebaseOverview, task)` method with intelligent pattern matching:
  - Language/framework questions → answers with actual `projectLanguages` and `tierContext`
  - Structure/architecture questions → answers with `codebaseOverview`
  - Component/section questions → "Analyze the codebase yourself" + overview
  - Implementation questions → "Implement everything in the task: [task context]"
  - Generic fallback → project languages + task excerpt
- Auto-answers are now **injected into the next task**: `"AUTO-ANSWERED (do NOT re-ask): Q: ... A: ... All questions answered. Continue coding."`
- The LLM actually sees the answers next iteration instead of silence

### Fix 34: Non-Adversarial Schema Miss Handler
**Problem**: The schema miss prompt started with "CRITICAL: Your previous response did NOT include..." — adversarial language that triggers small LLMs to apologize instead of code. The original task was buried after 15 lines of format instructions.

**Fix** (enhancedLoop.ts):
- Task-first framing: `initialTask.slice(0, 2000)` comes FIRST, format reminder after
- No "CRITICAL:" prefix, no scolding — just neutral "Your previous output was missing the required JSON block. Include it this time."
- Compact one-line JSON example instead of multi-line (saves tokens for small models)
- Partial progress now reduces `consecutiveErrors` by 2 instead of resetting to 0 (file changes without JSON slow escalation but don't fully reset)

### Fix 35: Schema Reminder on Every User Message
**Problem**: The structured output format was only in the system prompt (which may be truncated) and in schema miss retries (which are adversarial). Normal task messages had no format reminder.

**Fix** (enhancedLoop.ts):
- Every user message that doesn't already contain `json:structured_output` gets a compact suffix: `"REMINDER: End your response with ```json:structured_output { ... } ``` block. Include file changes with --- FILE: path --- markers."`
- This is the LAST thing the LLM sees before generating its response — maximum impact

### Fix 36: Loop Detector Breakout Strategy Improvements
**Problem**: Breakout prompts told the LLM to "review the entire codebase" and "identify the weakest feature area" — abstract meta-instructions that small LLMs couldn't follow. They had no format examples. The LLM responded with explanations instead of code.

**Fix** (loopDetector.ts):
- New `startMinimalPrompt` strategy: "Create exactly ONE file with code" — the simplest possible instruction. Includes the complete format example (file markers + JSON).
- New `formatSuffix` method: provides complete file change + structured output example, appended to ALL breakout strategies
- 4-strategy rotation: startMinimal → expansion → deepDive → architecture (simplest first)
- Anti-apology language added to all existing breakout prompts

### Fix 37: parseStructuredOutput Brace-Matching
**Problem**: The last-resort regex fallback for finding JSON with a "summary" key used `[^{}]*` patterns that couldn't handle nested objects (like `filesChanged` arrays containing objects).

**Fix** (prompts.ts):
- Replaced fragile regex with brace-matching algorithm: finds last `"summary"` in content, walks backward to find `{`, then walks forward counting `{`/`}` to find the matching close
- Correctly handles deeply nested JSON structures
- Extraction chain: primary markers → fallback markers → any JSON block → brace-matching for "summary" → null

---

## Files Modified (Agent Automation Session)

| File | Changes |
|------|---------|
| `apps/server/src/services/modes/agentPrompts.ts` | CRITICAL_FORMAT_HEADER + SCHEMA_REMINDER_FOOTER constants, wired into buildAgentSystemPrompt |
| `apps/server/src/services/agent/enhancedLoop.ts` | History filtering/condensation, conditional memory storage, schema reminder suffix, context-aware auto-answers with task injection, non-adversarial schema miss handler, buildAutoAnswer method |
| `apps/server/src/services/agent/loopDetector.ts` | startMinimalPrompt + formatSuffix methods, 4-strategy rotation, anti-apology language |
| `apps/server/src/services/modes/prompts.ts` | Brace-matching JSON extraction replaces regex fallback |