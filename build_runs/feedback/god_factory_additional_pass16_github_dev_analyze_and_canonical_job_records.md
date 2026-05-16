# God Factory Additional Pass 16 - GitHub Dev Analyze + Canonical JobRecords Injection

Date: 2026-05-16

## Scope

Close two deferred GitHub integration gaps from the forensic checklist:

1. Dev Analyze endpoint should use the actual chat/send contract.
2. Dev draft posting should feed canonical God Factory queue state (`job_records`) instead of legacy `suggested_jobs`.

## Implemented

1. Updated `POST /api/github/dev/analyze` in `apps/server/src/routes/github.ts`:
   - now calls `/api/chat/send` via local HTTP on server port,
   - uses a new SSE parser to extract streamed response content deterministically,
   - removes stale `/api/chat` call path.

2. Added schema-aware canonical job insertion helper in `apps/server/src/routes/github.ts`:
   - `createCanonicalJobFromDevDraft(...)` writes `user_requested` jobs directly into `job_records`,
   - includes optional `project_id` and `description` columns when present,
   - keeps output compatible across migration states.

3. Updated `POST /api/github/dev/drafts/:id/post`:
   - after posting discussion comment, now creates canonical `job_records` item,
   - response returns canonical job id as `jobId`.

4. Updated Help truth ledger in `apps/web/src/help/helpRegistry.ts` with v126 implementation note.

## Validation

1. `pnpm --filter @personal-ide/server build` -> pass
2. `pnpm --filter @personal-ide/web build` -> pass
3. `pnpm --filter @personal-ide/testing test:e2e -- e2e/godFactory.test.ts` -> pass (5/5)

## Why this matters

These changes remove two high-impact split-brain risks in community-driven improvement flow:

1. Dev Analyze now uses the same live chat execution contract as the main app.
2. Community fixes now enter the same canonical queue consumed by God Factory automation.

This directly improves 24/7 autonomous loop closure from GitHub discussion feedback to implementable internal jobs.
