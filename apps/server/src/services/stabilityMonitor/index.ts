// ============================================================
// Stability Monitor
// Tracks build/test health across a rolling 10-cycle window
// and triggers auto-rollback when instability thresholds fire.
// ============================================================

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

// ── Types ─────────────────────────────────────────────────────

export interface StabilitySnapshot {
  cycle: number;
  timestamp: string;           // ISO
  processAlive: boolean;
  testsFailed: number;
  testsTotal: number;
  avgBlameScore: number;       // 0..1 (lower = healthier)
  loopDetected: boolean;
  buildtagRejectionRate: number; // 0..1
  rollbackTriggered: boolean;
}

export type RollbackReason =
  | 'process_dead'
  | 'consecutive_test_failures'
  | 'blame_score_drop'
  | 'loop_detection'
  | 'buildtag_rejection_spike';

export interface RollbackResult {
  triggered: boolean;
  reason?: RollbackReason;
  checkpointId?: string;
  notificationId: string;
}

// ── Constants ────────────────────────────────────────────────

const WINDOW_SIZE = 10;

const THRESHOLDS = {
  /** Two consecutive cycles with testsFailed > 0 → rollback */
  consecutiveTestFailures: 2,
  /** avgBlameScore drops by >0.15 over 3+ consecutive cycles → rollback */
  blameScoreDrop: 0.15,
  blameScoreDropWindow: 3,
  /** loopDetect fires twice consecutively → rollback */
  consecutiveLoops: 2,
  /** buildtagRejectionRate increases by >0.20 vs previous snapshot → rollback */
  buildtagRejectionSpike: 0.20,
};

// ── Service ──────────────────────────────────────────────────

export class StabilityMonitor {
  private window: StabilitySnapshot[] = [];

  constructor(private db: Database.Database) {
    this._loadWindowFromDb();
  }

  // ── Public API ────────────────────────────────────────────

  /**
   * Record a new stability snapshot and check whether any rollback
   * threshold has been breached.  Returns a RollbackResult that callers
   * can use to decide whether to stop the pipeline.
   */
  record(snapshot: Omit<StabilitySnapshot, 'rollbackTriggered'>): RollbackResult {
    const entry: StabilitySnapshot = { ...snapshot, rollbackTriggered: false };

    // Persist snapshot
    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO stability_snapshots
          (cycle, timestamp, process_alive, tests_failed, tests_total,
           avg_blame_score, loop_detected, buildtag_rejection_rate, rollback_triggered)
        VALUES (?,?,?,?,?,?,?,?,0)
      `).run(
        entry.cycle,
        entry.timestamp,
        entry.processAlive ? 1 : 0,
        entry.testsFailed,
        entry.testsTotal,
        entry.avgBlameScore,
        entry.loopDetected ? 1 : 0,
        entry.buildtagRejectionRate,
      );
    } catch { /* table may not exist until migration runs */ }

    // Maintain in-memory rolling window
    this.window.push(entry);
    if (this.window.length > WINDOW_SIZE) {
      this.window.shift();
    }

    const rollbackReason = this._checkThresholds();
    if (rollbackReason) {
      entry.rollbackTriggered = true;
      const notif = this._notifyRollback(rollbackReason, entry.cycle);
      this._markSnapshotRollback(entry.cycle);
      return { triggered: true, reason: rollbackReason, notificationId: notif };
    }

    return { triggered: false, notificationId: '' };
  }

  /**
   * Return the last N snapshots (most recent last).
   */
  getWindow(n = WINDOW_SIZE): StabilitySnapshot[] {
    return this.window.slice(-n);
  }

  /**
   * Get overall health: 'healthy' | 'degraded' | 'critical'
   */
  healthStatus(): 'healthy' | 'degraded' | 'critical' {
    if (this.window.length === 0) return 'healthy';
    const recent = this.window.slice(-3);
    const anyDead = recent.some(s => !s.processAlive);
    if (anyDead) return 'critical';
    const failRate = recent.filter(s => s.testsFailed > 0).length / recent.length;
    if (failRate >= 0.67) return 'critical';
    if (failRate > 0) return 'degraded';
    return 'healthy';
  }

  // ── Private ───────────────────────────────────────────────

  private _checkThresholds(): RollbackReason | null {
    if (this.window.length < 2) return null;

    const w = this.window;
    const last = w[w.length - 1];

    // 1. process dead
    if (!last.processAlive) return 'process_dead';

    // 2. consecutive test failures (>= 2 in a row)
    const failStreak = this._trailingStreak(w, s => s.testsFailed > 0);
    if (failStreak >= THRESHOLDS.consecutiveTestFailures) return 'consecutive_test_failures';

    // 3. avgBlameScore drops >0.15 across the last 3 cycles
    if (w.length >= THRESHOLDS.blameScoreDropWindow) {
      const old = w[w.length - THRESHOLDS.blameScoreDropWindow].avgBlameScore;
      const drift = old - last.avgBlameScore; // positive = score dropped (worse)
      if (drift > THRESHOLDS.blameScoreDrop) return 'blame_score_drop';
    }

    // 4. loop detected 2+ consecutive
    const loopStreak = this._trailingStreak(w, s => s.loopDetected);
    if (loopStreak >= THRESHOLDS.consecutiveLoops) return 'loop_detection';

    // 5. buildtag rejection spike
    const prev = w[w.length - 2];
    if (last.buildtagRejectionRate - prev.buildtagRejectionRate > THRESHOLDS.buildtagRejectionSpike) {
      return 'buildtag_rejection_spike';
    }

    return null;
  }

  private _trailingStreak(
    w: StabilitySnapshot[],
    pred: (s: StabilitySnapshot) => boolean,
  ): number {
    let count = 0;
    for (let i = w.length - 1; i >= 0; i--) {
      if (pred(w[i])) count++;
      else break;
    }
    return count;
  }

  private _notifyRollback(reason: RollbackReason, cycle: number): string {
    const notificationId = randomUUID();
    const summary = `[StabilityMonitor] Auto-rollback triggered at cycle ${cycle} — reason: ${reason}. Review the last ${WINDOW_SIZE} stability snapshots and the most recent suggested job.`;
    try {
      this.db.prepare(`
        INSERT INTO notification_queue
          (notification_id, severity, category, natural_language_summary, summary_tags, presented_to_user, user_acknowledged, timestamp)
        VALUES (?, 'critical', 'stability_rollback', ?, ?, 0, 0, datetime('now'))
      `).run(
        notificationId,
        summary,
        JSON.stringify([`rollback:${reason}`, `cycle:${cycle}`]),
      );

      // Insert a diagnostic suggested job
      const jobId = randomUUID();
      this.db.prepare(`
        INSERT OR IGNORE INTO job_records
          (id, job_id, job_category, source, source_record_ids, evidence_summary,
           priority, title, affected_files, affected_devtags, affected_plantags,
           required_buildtags, blocking_jobs, blocked_by_jobs, hierarchy,
           atomic_steps, sandbox_spec, implementation_status,
           created_cycle, last_updated_cycle, timestamp, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))
      `).run(
        randomUUID(),
        jobId,
        'regression_hardening',
        'blame_crawler',
        JSON.stringify([`stability:${reason}:cycle${cycle}`]),
        `Auto-rollback at cycle ${cycle}: threshold '${reason}' breached. Inspect stability_snapshots and last checkpoint.`,
        'critical',
        `[Auto-rollback] Diagnose ${reason} at cycle ${cycle}`,
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify({ level: 1, milestone: 'stability_recovery', parent_job: null }),
        JSON.stringify([{
          step_id: randomUUID(),
          description: `Identify root cause of ${reason} and restore stable state`,
          input_devtags: [], output_devtags: ['pipeline:stable'],
          token_budget: 2000, model_tier_minimum: 4, can_parallelize: false,
        }]),
        JSON.stringify({ sandbox_id: jobId, sandbox_type: 'diagnostic', isolation: 'full', timeout_ms: 120000, resource_limits: { max_tokens_per_step: 2000, max_total_tokens: 10000, max_files_changed: 5, max_test_runs: 3 }, entry_conditions: [], exit_conditions: [] }),
        'suggested',
        cycle,
        cycle,
      );
    } catch { /* non-critical — log to stderr */ }
    return notificationId;
  }

  private _markSnapshotRollback(cycle: number): void {
    try {
      this.db.prepare(
        'UPDATE stability_snapshots SET rollback_triggered = 1 WHERE cycle = ?'
      ).run(cycle);
    } catch { /* ignore */ }
  }

  private _loadWindowFromDb(): void {
    try {
      const rows = this.db.prepare(`
        SELECT cycle, timestamp, process_alive, tests_failed, tests_total,
               avg_blame_score, loop_detected, buildtag_rejection_rate, rollback_triggered
        FROM stability_snapshots
        ORDER BY cycle DESC LIMIT ?
      `).all(WINDOW_SIZE) as any[];
      // newest-last
      this.window = rows.reverse().map(r => ({
        cycle: r.cycle,
        timestamp: r.timestamp,
        processAlive: !!r.process_alive,
        testsFailed: r.tests_failed,
        testsTotal: r.tests_total,
        avgBlameScore: r.avg_blame_score,
        loopDetected: !!r.loop_detected,
        buildtagRejectionRate: r.buildtag_rejection_rate,
        rollbackTriggered: !!r.rollback_triggered,
      }));
    } catch { /* table not yet created */ }
  }
}
