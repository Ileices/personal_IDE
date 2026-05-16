# God Factory Additional Pass 11 - Allowance-Aware Employer Stratification

Date: 2026-05-16

## Scope

Implement user-requested quota/value-aware model assignment behavior so Employer Crawler role decisions incorporate estimated allowance scarcity and rolling usage pressure.

## Implemented

1. Added allowance estimation logic to Employer analysis:
   - per-model hourly allowance estimate
   - rolling usage saturation percent over analysis window
   - allowance tier classification (`scarce`, `balanced`, `abundant`)

2. Updated role derivation to account for allowance pressure:
   - scarce allowance models are protected from trivial/low-value workloads
   - abundant allowance models can be routed to throughput-style repetitive tasks
   - near-ceiling usage contributes to weakness profiling

3. Added new persisted Employer analysis fields:
   - `allowance_hourly_est`
   - `allowance_window_usage_pct`
   - `allowance_tier`
   - `strategic_value_score`

4. Added DB migration `v116` for new Employer fields and index:
   - migration name: `employer_allowance_value_fields`

5. Updated Help truth ledger with v122 entry documenting this behavior.

## Validation

Diagnostics are clean for touched files.

## Remaining related work

1. Replace static allowance estimates with provider-native live quota telemetry where available.
2. Feed strategic value score directly into auto-intel model picker scoring.
3. Expose allowance tier/value in Intel panel Employer cards for operator visibility.
