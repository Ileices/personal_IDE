# God Factory Additional Pass 17 - Disclaimer hardening + automated tests

## Objective
Close another deferred governance gap by converting outbound GitHub disclaimer handling from inline route logic into a reusable, test-covered utility.

## Changes Implemented

1. Centralized disclaimer logic:
- Added apps/server/src/services/github/disclaimer.ts
- Exposes:
  - PERSONAL_IDE_DISCLAIMER
  - hasPersonalIdeDisclaimer(text)
  - ensurePersonalIdeDisclaimer(body)

2. Route integration updates:
- Updated apps/server/src/routes/github.ts to import/use ensurePersonalIdeDisclaimer for:
  - discussion reply posting
  - discussion creation
  - issue report creation body
  - dev draft final reply posting
- Removed duplicated inline disclaimer helper/constants from route file.

3. Automated regression coverage:
- Added testing/e2e/githubDisclaimer.test.ts
- Covers:
  - append behavior when footer is missing
  - idempotency when footer exists
  - tolerant variant detection to avoid duplicate footer append

4. Help ledger update:
- Added v127 implemented update in apps/web/src/help/helpRegistry.ts documenting disclaimer utility hardening + test coverage.

## Validation

1. Server compile:
- pnpm --filter @personal-ide/server build
- Result: PASS

2. New disclaimer tests:
- pnpm --filter @personal-ide/testing test:e2e -- e2e/githubDisclaimer.test.ts
- Result: PASS (3/3)

3. Regression suite for God Factory loop contract:
- pnpm --filter @personal-ide/testing test:e2e -- e2e/godFactory.test.ts
- Result: PASS (5/5)

## Notes
- This pass does not require live GitHub authentication and is deterministic in local test runs.
- It preserves prior behavior while reducing contract drift risk by centralizing enforcement.
