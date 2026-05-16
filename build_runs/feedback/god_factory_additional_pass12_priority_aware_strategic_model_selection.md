# God Factory Additional Pass 12 - Priority-Aware Strategic Model Selection

Date: 2026-05-16

## Scope

Wire Employer strategic value outputs into auto-intel model selection so scarce/high-value models are preserved for high-priority jobs and abundant models cover routine throughput.

## Implemented

1. Added pending-job priority profile derivation in God Factory route:
   - counts by priority (critical/high/medium/low)
   - highest priority marker
   - high-priority-present boolean

2. Extended auto-intel model ranking query to consume latest Employer fields:
   - `allowance_tier`
   - `strategic_value_score`

3. Updated model scoring behavior:
   - High-priority pending jobs: boost strategic/high-value model candidates.
   - Non-high-priority contexts: penalize scarce models to preserve allowance and favor abundant/throughput roles.

4. Extended selection telemetry payload:
   - `pending_priority_profile`
   - `selection_reason`

5. Updated Help truth-ledger with v123 pass note.

## Why this closes a real gap

Previous passes computed strategic value but did not directly influence auto-intel model selection. This pass closes that loop and makes role/allowance intelligence operational in the 24/7 scheduler path.

## Remaining related work

1. Expose strategic value and selection reason directly in Intel panel cards.
2. Add provider-native real quota telemetry to replace static allowance estimates where available.
3. Add automated tests for priority-based scoring behavior across synthetic model pools.
