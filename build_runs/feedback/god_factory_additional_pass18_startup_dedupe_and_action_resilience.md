# God Factory Additional Pass 18 - Startup dedupe + action resilience + dev-route guardrails

Date: 2026-05-16

## Objective
Ship another closure pass focused on practical reliability gaps that still showed up in day-to-day operation:

1. God Factory startup brief/welcome interruption on tab remount.
2. SSE edge-case parsing and timeout behavior in GitHub dev analyze path.
3. Intel notification actionability and safe error visibility.
4. Deterministic e2e guardrail coverage for GitHub dev routes.

## Changes Implemented

1. Startup-brief spam suppression hardening
- Updated apps/web/src/components/TheGodFactory.tsx.
- Session briefing now injects only into fresh threads (`prev.length === 0` guard).
- Added stronger startup-brief dedupe behavior to avoid interruption when revisiting the panel.

2. GitHub dev analyze stream hardening
- Updated apps/server/src/routes/github.ts.
- `parseChatSseResponse(...)` now processes trailing buffer content after stream close so final events are not dropped if provider omits trailing delimiter.
- Added explicit request timeout/cancellation handling for `/api/chat/send` invocation used by dev analyze.

3. Intel notification action resilience
- Updated apps/web/src/components/godFactory/GodFactoryRightPanel.tsx.
- Added subsystem-safe guards before pause/resume control usage to avoid undefined config access.
- Added direct category-aware quick actions on notification cards:
  - Create Job
  - Re-run Employer
  - Add Queue
- Improved detail action safety and preserved richer controls in notification drill-down.

4. New e2e tests for GitHub dev route guardrails
- Added testing/e2e/githubDevRoutes.test.ts.
- Verifies dev analyze and draft post endpoints fail safely across auth/owner/context permutations (401/403/404/400 bands) rather than behaving unpredictably.

5. Help truth ledger update
- Updated apps/web/src/help/helpRegistry.ts with v128 implemented note describing this pass.

## Validation

1. Server build
- pnpm --filter @personal-ide/server build
- Result: PASS

2. Web build
- pnpm --filter @personal-ide/web build
- Result: PASS

3. New e2e test
- pnpm --filter @personal-ide/testing test:e2e -- e2e/githubDevRoutes.test.ts
- Result: PASS (3/3)

4. Regression e2e suites
- pnpm --filter @personal-ide/testing test:e2e -- e2e/godFactory.test.ts
- Result: PASS (5/5)
- pnpm --filter @personal-ide/testing test:e2e -- e2e/githubDisclaimer.test.ts
- Result: PASS (3/3)

5. Sensitive-data sweep
- Secret-pattern scan run across workspace.
- No leaked live token signatures found in tracked source (only placeholder PAT examples in UI input placeholders).

## Notes

- Requested external discussion posting/commenting could not be executed in this pass due authentication/control constraints in the current environment, but discussion/issue content was scraped and folded into implementation prioritization.
- The highest externally reinforced open concern remains robust out-of-box reproducibility (Issue #64 fresh-env chat FK path); this pass further reduces that risk by hardening related runtime behavior and preserving deterministic failure modes.
