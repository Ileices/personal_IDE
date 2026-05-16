# God Factory Additional Pass 13 - Local Concurrency Planner Lane Budget

Date: 2026-05-16

## Scope

Close the gap between local-model fallback and actual machine envelope planning by introducing lane-budget based local concurrency planning in auto-intel.

## Implemented

1. Added new auto-intel settings:
   - `localBenchmarkPlannerEnabled`
   - `localLaneTokenBudget`
   - `localMaxParallelLanes`

2. Implemented local concurrency planner in God Factory route:
   - Estimates per-model token cost from `model_registry.context_window_tokens`.
   - Builds planned local candidates under lane count + token budget envelope.
   - Produces deferred local candidate list when capacity is exceeded.

3. Integrated planner into cloud-exhausted local fallback:
   - When local fallback is triggered and planner is enabled, active local candidate chain is constrained to planned candidates.

4. Added deduplicated concurrency-gap Suggested Job creation:
   - If planner cannot satisfy desired local parallel target, creates one actionable `model_tool_enhancement` job with marker `local_concurrency_gap:<project>`.

5. Added telemetry fields:
   - `local_parallel_deferred_candidates`
   - `local_parallel_token_budget`
   - `local_parallel_token_used`
   - `local_concurrency_gap_jobs_created`

6. Added Intel Panel controls for planner settings and persisted them to server settings payload.

7. Updated Help ledger with v124 entry.

## Validation

Diagnostics clean for touched files.

## Remaining related work

1. Replace token-cost heuristic with measured GPU/CPU/RAM benchmarks per model combination.
2. Execute true multi-lane local runs concurrently (current pass plans and constrains candidate selection; loop execution remains single-run path).
3. Surface planner telemetry in a dedicated Intel panel runtime card.
