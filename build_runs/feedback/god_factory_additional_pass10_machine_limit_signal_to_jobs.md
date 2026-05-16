# God Factory Additional Pass 10 - Machine-Limit Signal to Jobs

Date: 2026-05-16

## Scope

Convert machine-limit telemetry for blocked local models into actionable Suggested Jobs so autonomous hardening can self-feed from local fallback failures.

## Implemented

1. Added `createMachineLimitReflectionJobs(...)` in server God Factory route.
2. Wired auto-intel cycle to create deduplicated `model_tool_enhancement` jobs when local candidates are blocked by machine-limit guard.
3. Added marker-based dedupe (`machine_limit_block:<model_id>`) to prevent repeated job spam while an active unresolved job exists.
4. Extended auto-intel model-selection summary with `machine_limit_jobs_created` for runtime observability.
5. Updated help truth-ledger with v121 implementation note.

## Why this matters

Previously, blocked local models were visible only as telemetry. This pass closes a pipeline gap by ensuring those events become trackable internal work items that can be implemented through the same Suggested Jobs lifecycle.

## Remaining related work

1. Attach benchmark outputs (CPU/GPU/RAM envelope) directly to machine-limit reflection jobs.
2. Implement true concurrent local execution lanes (currently planning+telemetry only).
3. Add Intel panel card for machine-limit reflection jobs and benchmark status.
