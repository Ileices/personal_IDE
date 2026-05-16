# God Factory Intel Panel Audit - Pass 2

Date: 2026-05-16
Scope: Intel Panel controls in GodFactoryRightPanel vs route coverage and runtime behavior.

## Summary

- Most Intel Panel actions are routed to existing backend endpoints.
- The largest functional gap was not missing routes, but silent UI failure handling and incorrect busy-state wiring.
- This pass hardened action feedback and deduped startup briefing spam.

## Endpoint Coverage (sample critical controls)

- GET /api/god-factory/queue -> exists in godFactory route.
- GET /api/god-factory/idle-suggestions -> exists.
- GET /api/god-factory/model-health -> exists.
- GET /api/god-factory/background-status -> exists.
- POST /api/god-factory/controls/background -> exists (owner-gated).
- POST /api/god-factory/gap-reports/flush-to-jobs -> exists.
- POST /api/god-factory/external-jobs/reflect -> exists.
- GET/POST /api/god-factory/auto-intel/settings -> exists.
- GET/POST loop status/start/stop -> exists.
- POST /api/employer/analyze -> exists.
- GET/POST /api/employer/cooldowns -> exists.
- POST /api/employer/retire/:modelId -> exists.
- GET/POST /api/model-strategy -> exists.
- GET/POST /api/subsystems/settings and POST /api/subsystems/run -> exists.

## Key Findings

1. "Dead GUI" perception mostly came from action handlers swallowing non-OK responses.
2. Background control endpoints are owner-gated, so non-owner runs return 403 and previously looked like no-op.
3. "Apply Intelligent Cycle" action used the wrong busy-state binding in notification detail.
4. Startup brief spam was still possible across remount/session transitions when session IDs changed.

## This Pass - Implemented Fixes

1. Added explicit success/error notifications for Intel actions.
2. Added HTTP non-OK parsing and visible error surfaces.
3. Fixed notification-detail "Apply Intelligent Cycle" button busy-state wiring.
4. Added global startup brief dedupe key and existing-brief detection.

## Remaining Work for Next Passes

1. Add structured owner-auth visibility in Intel panel (show explicit "owner required" state).
2. Add end-to-end tests for every notification action branch.
3. Wire richer telemetry for auto-intel step outcomes into UI history.
4. Add route-level audit command that auto-compares frontend fetch map vs backend route map.
5. Expand hardening for parallel local-model execution orchestration and hardware-aware auto-throttle.
