// ============================================
// Debt Tracking Agent
// Computes a deterministic debt score per file
// using tag density ratios from the forensic DB.
// Writes to debt_history table.
// ============================================
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';

export interface DebtScore {
  file_path: string;
  debt_score: number;
  ceiling: number;
  ceiling_exceeded: boolean;
  score_breakdown: {
    needs_refactor: number;
    needs_test: number;
    dead_code: number;
    circular_dependency: number;
    spaghetti: number;
    under_engineered: number;
    over_engineered: number;
    regression_history: number;
    integration_failures: number;
    test_coverage_bonus: number;
    done_plantag_bonus: number;
    raw_total: number;
  };
  cycle_id: string;
}

export interface DebtHeatmapEntry {
  file_path: string;
  debt_score: number;
  ceiling: number;
  ceiling_exceeded: boolean;
  excluded_from_assignment: boolean;
  score_breakdown: DebtScore['score_breakdown'];
}

export class DebtTrackingAgent {
  private readonly DEFAULT_CEILING = 15;
  private readonly CODEBASE_HEALTH_THRESHOLD = 0.3;

  constructor(private db: Database.Database) {}

  /** Compute and persist debt score for a single file */
  computeDebtScore(file_path: string, cycle_id: string): DebtScore {
    const t0 = Date.now();
    const breakdown = this.buildBreakdown(file_path);
    const raw = breakdown.raw_total;
    const ceiling = this.getFileCeiling(file_path);
    const exceeded = raw > ceiling;

    // Persist to debt_history
    const entry_id = uuid();
    this.db.prepare(`
      INSERT INTO debt_history (entry_id, file_path, debt_score, score_breakdown, ceiling, ceiling_exceeded, cycle_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(entry_id, file_path, raw, JSON.stringify(breakdown), ceiling, exceeded ? 1 : 0, cycle_id);

    // If ceiling exceeded, mark file with devtag:needs_review
    if (exceeded) {
      this.flagFileForReview(file_path);
    }

    this.logToolCall('debt_score', 'debt-tracking-agent', cycle_id, Date.now() - t0);

    return { file_path, debt_score: raw, ceiling, ceiling_exceeded: exceeded, score_breakdown: breakdown, cycle_id };
  }

  /** Compute debt for all files that have any devtags */
  computeAll(cycle_id: string): { scores: DebtScore[]; total_normalized: number; health_warning: boolean } {
    const files = this.db.prepare(
      'SELECT DISTINCT file_path FROM devtags WHERE file_path IS NOT NULL AND file_path != "" AND status = "active"'
    ).all() as any[];

    const scores: DebtScore[] = [];
    for (const row of files) {
      scores.push(this.computeDebtScore(row.file_path, cycle_id));
    }

    const totalDevtags = (this.db.prepare('SELECT COUNT(*) as cnt FROM devtags WHERE status = "active"').get() as any)?.cnt ?? 1;
    const totalDebt = scores.reduce((s, r) => s + r.debt_score, 0);
    const normalized = totalDebt / Math.max(totalDevtags, 1);
    const healthWarning = normalized > this.CODEBASE_HEALTH_THRESHOLD;

    return { scores, total_normalized: Math.round(normalized * 1000) / 1000, health_warning: healthWarning };
  }

  /** Return all files above threshold sorted by debt desc */
  heatmap(threshold: number = this.DEFAULT_CEILING): DebtHeatmapEntry[] {
    const rows = this.db.prepare(`
      SELECT dh.file_path, dh.debt_score, dh.ceiling, dh.ceiling_exceeded, dh.score_breakdown
      FROM debt_history dh
      INNER JOIN (
        SELECT file_path, MAX(rowid) as max_row FROM debt_history GROUP BY file_path
      ) latest ON dh.file_path = latest.file_path AND dh.rowid = latest.max_row
      WHERE dh.debt_score >= ?
      ORDER BY dh.debt_score DESC LIMIT 200
    `).all(threshold) as any[];

    return rows.map(r => {
      const bd = JSON.parse(r.score_breakdown ?? '{}');
      const isExcluded = this.isFileExcluded(r.file_path);
      return {
        file_path: r.file_path,
        debt_score: r.debt_score,
        ceiling: r.ceiling,
        ceiling_exceeded: !!r.ceiling_exceeded,
        excluded_from_assignment: isExcluded,
        score_breakdown: bd,
      };
    });
  }

  /** Get debt history for a single file */
  getHistory(file_path: string, limit = 20): any[] {
    return this.db.prepare(`
      SELECT * FROM debt_history WHERE file_path = ? ORDER BY timestamp DESC LIMIT ?
    `).all(file_path, limit) as any[];
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private buildBreakdown(file_path: string): DebtScore['score_breakdown'] {
    const needs_refactor = (this.db.prepare(
      `SELECT COUNT(*) as c FROM devtags WHERE file_path=? AND tag_type='needs_refactor' AND status='active'`
    ).get(file_path) as any)?.c ?? 0;

    const needs_test = (this.db.prepare(
      `SELECT COUNT(*) as c FROM devtags WHERE file_path=? AND tag_type='needs_test' AND status='active'`
    ).get(file_path) as any)?.c ?? 0;

    const dead_code = (this.db.prepare(
      `SELECT COUNT(*) as c FROM devtags WHERE file_path=? AND tag_type='dead_code' AND status='active'`
    ).get(file_path) as any)?.c ?? 0;

    const circular_dependency = (this.db.prepare(
      `SELECT COUNT(*) as c FROM devtags WHERE file_path=? AND tag_type='circular_dependency' AND status='active'`
    ).get(file_path) as any)?.c ?? 0;

    const spaghetti = (this.db.prepare(
      `SELECT COUNT(*) as c FROM spaghetti_index WHERE file_path=?`
    ).get(file_path) as any)?.c ?? 0;

    const under_engineered = (this.db.prepare(
      `SELECT COUNT(*) as c FROM under_engineered_regions WHERE file_path=?`
    ).get(file_path) as any)?.c ?? 0;

    const over_engineered = (this.db.prepare(
      `SELECT COUNT(*) as c FROM over_engineered_regions WHERE file_path=?`
    ).get(file_path) as any)?.c ?? 0;

    // regression_history: find buildtags associated with this file
    const regression_history = (this.db.prepare(`
      SELECT COUNT(*) as c FROM regression_history rh
      WHERE rh.file = ?
    `).get(file_path) as any)?.c ?? 0;

    const integration_failures = (this.db.prepare(
      `SELECT COUNT(*) as c FROM integration_failures WHERE file=?`
    ).get(file_path) as any)?.c ?? 0;

    // Bonuses (negative)
    const test_coverage_bonus = (this.db.prepare(
      `SELECT COUNT(*) as c FROM devtags WHERE file_path=? AND tag_type='test' AND status='active'`
    ).get(file_path) as any)?.c ?? 0;

    const done_plantag_bonus = (this.db.prepare(`
      SELECT COUNT(*) as c FROM plantags pt
      INNER JOIN devtags dt ON pt.linked_devtag_id = dt.id
      WHERE dt.file_path = ? AND pt.status = 'done'
    `).get(file_path) as any)?.c ?? 0;

    const raw_total = Math.max(0,
      needs_refactor * 1 +
      needs_test * 2 +
      dead_code * 1 +
      circular_dependency * 3 +
      spaghetti * 2 +
      under_engineered * 1 +
      over_engineered * 1 +
      regression_history * 5 +
      integration_failures * 3 -
      test_coverage_bonus * 1 -
      done_plantag_bonus * 1
    );

    return {
      needs_refactor, needs_test, dead_code, circular_dependency,
      spaghetti, under_engineered, over_engineered,
      regression_history, integration_failures,
      test_coverage_bonus: -test_coverage_bonus,
      done_plantag_bonus: -done_plantag_bonus,
      raw_total,
    };
  }

  private getFileCeiling(file_path: string): number {
    // Check if any active plantag covering this file specifies a debt_ceiling
    const row = this.db.prepare(`
      SELECT pt.metadata FROM plantags pt
      INNER JOIN devtags dt ON pt.linked_devtag_id = dt.id
      WHERE dt.file_path = ? AND pt.status NOT IN ('done','orphaned')
      LIMIT 1
    `).get(file_path) as any;

    if (row) {
      try {
        const meta = JSON.parse(row.metadata ?? '{}');
        if (typeof meta.debt_ceiling === 'number') return meta.debt_ceiling;
      } catch { /* ignore */ }
    }
    return this.DEFAULT_CEILING;
  }

  private flagFileForReview(file_path: string) {
    // Mark existing active devtags in this file, or insert a review marker
    const existing = this.db.prepare(
      `SELECT 1 FROM devtags WHERE file_path = ? AND tag_type = 'needs_review' AND status = 'active' LIMIT 1`
    ).get(file_path);
    if (!existing) {
      this.db.prepare(`
        INSERT OR IGNORE INTO devtags (id, tag_key, tag_type, name, status, file_path, metadata)
        VALUES (?, ?, 'needs_review', 'Needs Review (debt ceiling exceeded)', 'active', ?,
          '{"reason":"debt_ceiling_exceeded","source":"debt_tracking_agent"}')
      `).run(uuid(), `devtag:needs_review:${file_path.replace(/[^a-zA-Z0-9]/g, '_')}`, file_path);
    }
  }

  private isFileExcluded(file_path: string): boolean {
    const row = this.db.prepare(
      `SELECT 1 FROM devtags WHERE file_path=? AND tag_type='needs_review' AND status='active' LIMIT 1`
    ).get(file_path);
    return !!row;
  }

  private logToolCall(tag_type: string, agent_id: string, cycle_id: string, ms: number) {
    try {
      this.db.prepare(`
        INSERT INTO tag_resolution_log (entry_id, tag_type, agent_id, cycle_id, resolution_time_ms)
        VALUES (?, ?, ?, ?, ?)
      `).run(uuid(), tag_type, agent_id, cycle_id, ms);
    } catch { /* non-blocking */ }
  }
}
