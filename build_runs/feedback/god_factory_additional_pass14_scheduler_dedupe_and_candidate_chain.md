# God Factory Additional Pass 14 - Scheduler Dedupe and Candidate-Chain Hardening

## Goal
Reduce autonomous loop spam risk from duplicate schedulers, harden auto-intel loop-start safety when candidate pools collapse, and improve multi-model execution continuity through explicit candidate-chain propagation.

## Implemented Changes

1. Disabled legacy duplicate auto-intel execution path by default in subsystem scheduler:
   - File: apps/server/src/services/subsystemScheduler.ts
   - Added `god_factory:auto_intel:managed_by_route` compatibility flag.
   - Default behavior now assumes route-owned auto-intel scheduler is authoritative.
   - Legacy scheduler auto-intel execution only runs when that flag is explicitly set false/0/no.

2. Hardened auto-intel loop start candidate safety:
   - File: apps/server/src/routes/godFactory.ts
   - `runAutoIntelCycle` now computes `selectionPool` and **skips loop start safely** when no candidates remain after provider/local-machine-limit filtering.
   - Skip path now records explicit `auto_model_selection.selection_reason = no_available_candidates` telemetry instead of attempting a bad loop start.

3. Added candidate-chain propagation for auto-intel loop runs:
   - File: apps/server/src/routes/godFactory.ts
   - Auto-intel now builds an ordered `candidateChain` (`selected model + remaining pool`) and passes it into `/api/god-factory/loop/start`.
   - `/loop/start` now accepts optional `candidateChain` and, when provided, treats it as the authoritative model order after provider availability filtering.
   - Loop run now persists `god_factory:loop:last_candidate_chain` in KV for observability and debugging.

4. Wired run-time execution to use run-scoped candidate chain:
   - File: apps/server/src/routes/godFactory.ts
   - Per-job model selection inside active loop now uses run-scoped candidate chain (instead of recomputing strategy-only order), preserving intended rotation from auto-intel planning.

5. Added Intel Panel visibility for last auto-intel cycle result:
   - File: apps/web/src/components/godFactory/GodFactoryRightPanel.tsx
   - Auto-intel status runtime now reads `last_result` and renders key summary fields:
     - selected model
     - selection reason
     - machine-limit jobs created
     - concurrency-gap jobs created

6. Added e2e tests for this pass:
   - File: testing/e2e/godFactory.test.ts
   - New coverage includes:
     - candidate-chain persistence on loop start
     - external project signal reflection into internal god-factory-scan jobs
   - Existing assertions were updated to align with current runtime semantics (`jobMaxIterations` default and stop reason values).

## Validation

Executed:
- `pnpm vitest run e2e/godFactory.test.ts`

Result:
- 5/5 tests passed.

## Remaining Follow-Ups

1. True simultaneous local multi-lane execution is still planner-guided rather than independently concurrent loop workers.
2. If needed later, expose `last_candidate_chain` directly in loop status response for first-class UI rendering.
3. Consider retiring legacy auto-intel code path in `subsystemScheduler.ts` entirely once compatibility window closes.
