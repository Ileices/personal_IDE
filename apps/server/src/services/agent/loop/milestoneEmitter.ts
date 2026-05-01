// ============================================
// Milestone Emitter — writes structured progress
// to loop_milestones and loop_quality_snapshots.
//
// Called from response-processing so every agent
// iteration produces a queryable audit trail:
//   "what did it work on?" and "did quality improve?"
//
// Design principles:
// - All writes are best-effort (never crash the loop)
// - Milestones are extracted from LLM summary text
// - Quality outcome is inferred from lint/test contexts
// ============================================
import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';

export type MilestoneStatus = 'pending' | 'in_progress' | 'complete' | 'failed' | 'skipped';
export type MilestoneSource = 'agent' | 'user' | 'system' | 'fleet';

export interface MilestoneRecord {
  id: string;
  projectId: string;
  runId: string;
  parentId?: string;
  title: string;
  detail?: string;
  status: MilestoneStatus;
  source: MilestoneSource;
  iteration: number;
  filesChanged: number;
}

// ── Write a single milestone ─────────────────────────────────────────────────
export function writeMilestone(
  db: Database.Database,
  record: MilestoneRecord,
): void {
  try {
    db.prepare(`
      INSERT INTO loop_milestones
        (id, project_id, run_id, parent_id, title, detail, status, source, iteration, files_changed, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        detail = excluded.detail,
        files_changed = excluded.files_changed,
        updated_at = datetime('now')
    `).run(
      record.id,
      record.projectId,
      record.runId,
      record.parentId ?? null,
      record.title.slice(0, 250),
      (record.detail ?? '').slice(0, 1000),
      record.status,
      record.source,
      record.iteration,
      record.filesChanged,
    );
  } catch {
    // best-effort only — never crash the loop
  }
}

// ── Update a milestone's status by ID ────────────────────────────────────────
export function updateMilestoneStatus(
  db: Database.Database,
  id: string,
  status: MilestoneStatus,
  detail?: string,
): void {
  try {
    if (detail !== undefined) {
      db.prepare(`
        UPDATE loop_milestones
        SET status = ?, detail = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(status, detail.slice(0, 1000), id);
    } else {
      db.prepare(`
        UPDATE loop_milestones
        SET status = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(status, id);
    }
  } catch { /* best-effort */ }
}

// ── Extract milestone titles from an LLM summary ─────────────────────────────
// Heuristic: numbered list items, bullet points, headings with verbs
// are strong signals of discrete work items.
export function extractMilestoneTitles(summary: string): string[] {
  const lines = summary.split('\n');
  const titles: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.length < 8 || line.length > 200) continue;

    // Numbered list: "1. Do X", "2) Implement Y"
    if (/^(\d+[.)]\s+)/.test(line)) {
      titles.push(line.replace(/^\d+[.)]\s+/, '').trim());
      continue;
    }
    // Bullet points: "- Fix X", "* Add Y", "• Update Z"
    if (/^[-*•]\s+/.test(line)) {
      titles.push(line.replace(/^[-*•]\s+/, '').trim());
      continue;
    }
    // Markdown headings: "## Implement X"
    if (/^#{1,3}\s+/.test(line)) {
      titles.push(line.replace(/^#{1,3}\s+/, '').trim());
      continue;
    }
    // Strong action verbs at start (common in agent summaries)
    if (/^(created|fixed|added|implemented|refactored|updated|removed|optimized|resolved|wrote|built|migrated|configured|deployed|tested|debugged)\s/i.test(line)) {
      titles.push(line.trim());
    }
  }

  return [...new Set(titles)].slice(0, 10);
}

// ── Emit a batch of milestones from an agent iteration ───────────────────────
export function emitIterationMilestones(
  db: Database.Database,
  projectId: string,
  runId: string,
  iteration: number,
  summary: string,
  filesChangedCount: number,
): void {
  const titles = extractMilestoneTitles(summary);

  if (titles.length === 0) {
    // Fallback: emit a single synthetic milestone from the summary
    const title = summary.slice(0, 120).trim() || `Iteration ${iteration} completed`;
    writeMilestone(db, {
      id: `${runId}:${iteration}:0`,
      projectId,
      runId,
      title,
      detail: summary.slice(0, 500),
      status: 'complete',
      source: 'agent',
      iteration,
      filesChanged: filesChangedCount,
    });
    return;
  }

  titles.forEach((title, idx) => {
    writeMilestone(db, {
      id: `${runId}:${iteration}:${idx}`,
      projectId,
      runId,
      title,
      status: 'complete',
      source: 'agent',
      iteration,
      filesChanged: idx === 0 ? filesChangedCount : 0,
    });
  });
}

// ── Quality Snapshot ──────────────────────────────────────────────────────────

export interface QualitySnapshotRecord {
  id: string;
  projectId: string;
  runId: string;
  iteration: number;
  buildOk: boolean;
  testsOk: boolean;
  lintOk: boolean;
  errorCount: number;
  testPassCount: number;
  testFailCount: number;
  filesChanged: number;
  tokensUsed: number;
  summary: string;
}

export function writeQualitySnapshot(
  db: Database.Database,
  record: QualitySnapshotRecord,
): void {
  try {
    db.prepare(`
      INSERT INTO loop_quality_snapshots
        (id, project_id, run_id, iteration,
         build_ok, tests_ok, lint_ok,
         error_count, test_pass_count, test_fail_count,
         files_changed, tokens_used, summary, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      record.id,
      record.projectId,
      record.runId,
      record.iteration,
      record.buildOk ? 1 : 0,
      record.testsOk ? 1 : 0,
      record.lintOk ? 1 : 0,
      record.errorCount,
      record.testPassCount,
      record.testFailCount,
      record.filesChanged,
      record.tokensUsed,
      record.summary.slice(0, 500),
    );
  } catch { /* best-effort */ }
}

// ── Infer quality state from existing error/test context strings ──────────────
// These context strings are produced by runAllLintChecks / runTests in
// responseProcessing.ts and are already in the loop as lastErrorContext /
// lastTestContext — we parse them to extract quality signal without re-running.
export function inferQualityFromContext(
  lastErrorContext: string,
  lastTestContext: string,
  lastBuildContext = '',
): { buildOk: boolean; lintOk: boolean; testsOk: boolean; errorCount: number; testPassCount: number; testFailCount: number } {
  // Build/lint ok if no error context present
  const lintOk = !lastErrorContext || lastErrorContext.trim().length === 0;
  const buildOk = !/build\s+fail|failed to compile|status:\s*build fail|exit=1/i.test(lastBuildContext) && lintOk;

  // Count errors in error context
  let errorCount = 0;
  if (lastErrorContext) {
    const errorMatches = lastErrorContext.match(/error[^\n]*/gi) ?? [];
    errorCount = Math.min(errorMatches.length, 99);
  }

  // Parse test context: look for "X passed", "Y failed" patterns
  let testPassCount = 0;
  let testFailCount = 0;
  if (lastTestContext) {
    const passMatch = lastTestContext.match(/(\d+)\s*(test[s]?)?\s*pass(ed)?/i);
    const failMatch = lastTestContext.match(/(\d+)\s*(test[s]?)?\s*fail(ed)?/i);
    if (passMatch) testPassCount = parseInt(passMatch[1], 10);
    if (failMatch) testFailCount = parseInt(failMatch[1], 10);
  }
  const testsOk = testFailCount === 0;

  return { buildOk, lintOk, testsOk, errorCount, testPassCount, testFailCount };
}
