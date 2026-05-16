# God Factory Additional Pass 9 - Machine-Limit Guard and Local Planning

Date: 2026-05-16

## Scope

This pass focused on hardening unattended auto-intel local fallback behavior so oversized local models are filtered before autonomous loop start attempts.

## Implemented

1. Added machine-limit-aware local selection controls to auto-intel settings:
   - `localContextWindowCapEnabled`
   - `localContextWindowCapTokens`
   - `localParallelTarget`

2. Added backend local candidate filtering by model context-window metadata:
   - Uses `model_registry.context_window_tokens` when available.
   - Blocks local models whose context window exceeds the configured cap.
   - Keeps unknown-context models eligible to avoid false negatives.

3. Added run telemetry fields in `auto_model_selection`:
   - `blocked_by_machine_limit`
   - `local_candidate_raw_count`
   - `local_parallel_target`
   - `local_parallel_ready`
   - `local_parallel_candidates`

4. Added skip reason tracking for machine-limit scenarios:
   - `local_models_blocked_by_machine_limit`

5. Added Intel Panel controls to configure the above settings:
   - Toggle: block oversized locals
   - Numeric cap: local context tokens
   - Numeric target: local parallel candidate planning

6. Updated Help truth-ledger with v120 entry describing this shipped behavior.

## Notes

- `localParallelTarget` is currently used for planning/telemetry and candidate readiness visibility.
- This pass does not yet execute multiple local models concurrently in one cycle; that remains a future execution-layer upgrade.
