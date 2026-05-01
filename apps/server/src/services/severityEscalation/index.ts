// ============================================
// Severity Escalation Service
// Implements the 6 auto-escalation conditions from
// the Severity Escalation Chart in the addendum spec.
//
// Called whenever a forensic entry is written or
// a tag_mismatch is logged. Checks conditions and
// upgrades severity in-place if applicable.
// ============================================
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';

export type Severity = 'info' | 'warning' | 'error' | 'critical' | 'fatal';

const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3,
  fatal: 4,
};

function higherSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

export interface EscalationResult {
  original_severity: Severity;
  final_severity: Severity;
  escalated: boolean;
  reason?: string;
}

export class SeverityEscalationService {
  constructor(private db: Database.Database) {}

  /**
   * Evaluate all 6 Severity Escalation Chart conditions for a given forensic context.
   * Returns the potentially-upgraded severity and reason.
   *
   * Call this BEFORE inserting to tag_mismatches or logging any forensic entry.
   */
  evaluate(opts: {
    severity: Severity;
    devtag?: string;
    file?: string;
    cycle_id?: string;
    agent_id?: string;
    mismatch_type?: string;
    /** Number of consecutive retry attempts that each produced a different mismatch */
    retry_mismatch_count?: number;
  }): EscalationResult {
    let current: Severity = opts.severity;
    let reason: string | undefined;

    // ── Condition 1 ──────────────────────────────────────────────────────────
    // A warning in the same file occurring in 3+ consecutive build cycles → error
    if (current === 'warning' && opts.file) {
      const consecutiveWarnings = this.countConsecutiveFileSeverity(opts.file, 'warning');
      if (consecutiveWarnings >= 3) {
        current = higherSeverity(current, 'error');
        reason = `Warning in file ${opts.file} occurred in ${consecutiveWarnings} consecutive build cycles (escalated to error)`;
      }
    }

    // ── Condition 2 ──────────────────────────────────────────────────────────
    // An error that was previously logged as a warning → critical on second occurrence
    if (current === 'error' && opts.devtag) {
      const priorWarning = this.db.prepare(`
        SELECT COUNT(*) as cnt FROM tag_mismatches
        WHERE devtag = ? AND severity = 'warning' AND escalated = 0
      `).get(opts.devtag) as any;

      if ((priorWarning?.cnt ?? 0) > 0) {
        current = higherSeverity(current, 'critical');
        reason = `Error for ${opts.devtag} was previously logged as warning — escalated to critical`;
      }
    }

    // ── Condition 3 ──────────────────────────────────────────────────────────
    // Tag mismatch involving devtag:perf_critical or devtag:security_requirement → critical
    if (opts.devtag) {
      const isPerfCritical = this.devtagHasType(opts.devtag, 'perf_critical');
      const isSecurityReq = this.devtagHasType(opts.devtag, 'security_requirement');
      if (isPerfCritical || isSecurityReq) {
        current = higherSeverity(current, 'critical');
        reason = `Tag mismatch involves ${isPerfCritical ? 'devtag:perf_critical' : 'devtag:security_requirement'} component — auto-critical`;
      }
    }

    // ── Condition 4 ──────────────────────────────────────────────────────────
    // Circular dependency between two devtag:perf_critical components → fatal
    if (opts.mismatch_type === 'circular_dependency' && opts.devtag) {
      const isPerfCritical = this.devtagHasType(opts.devtag, 'perf_critical');
      if (isPerfCritical) {
        current = higherSeverity(current, 'fatal');
        reason = `Circular dependency detected between devtag:perf_critical components — auto-fatal`;
      }
    }

    // ── Condition 5 ──────────────────────────────────────────────────────────
    // Any forensic entry involving devtag:nano component tagged devtag:breaking_change → critical
    if (opts.devtag?.startsWith('devtag:nano:') || opts.devtag?.includes(':nano:')) {
      const hasBreakingChange = this.db.prepare(`
        SELECT 1 FROM devtags WHERE tag_type = 'breaking_change' AND project_id = (
          SELECT project_id FROM devtags WHERE tag_key = ? LIMIT 1
        ) LIMIT 1
      `).get(opts.devtag ?? '') as any;

      if (hasBreakingChange) {
        current = higherSeverity(current, 'critical');
        reason = `Nano component ${opts.devtag} is involved in a breaking_change — auto-critical`;
      }
    }

    // ── Condition 6 ──────────────────────────────────────────────────────────
    // Builder Agent retry that produces a different tag mismatch each attempt → critical
    if ((opts.retry_mismatch_count ?? 0) >= 2) {
      current = higherSeverity(current, 'critical');
      reason = `Builder Agent produced different tag mismatch on each of ${opts.retry_mismatch_count} retries (non-deterministic output) — auto-critical`;
    }

    return {
      original_severity: opts.severity,
      final_severity: current,
      escalated: current !== opts.severity,
      reason,
    };
  }

  /**
   * Write a tag_mismatch entry, running escalation evaluation first.
   * Returns the entry_id and final severity used.
   */
  writeTagMismatch(opts: {
    devtag: string;
    mismatch_type: string;
    severity: Severity;
    cycle_id?: string;
    file?: string;
    agent_id?: string;
    retry_mismatch_count?: number;
  }): { entry_id: string; severity: Severity; escalated: boolean; reason?: string } {
    const escalation = this.evaluate({
      severity: opts.severity,
      devtag: opts.devtag,
      file: opts.file,
      cycle_id: opts.cycle_id,
      agent_id: opts.agent_id,
      mismatch_type: opts.mismatch_type,
      retry_mismatch_count: opts.retry_mismatch_count,
    });

    const entry_id = uuid();
    const previousOccurrences = (this.db.prepare(
      'SELECT COUNT(*) as cnt FROM tag_mismatches WHERE devtag = ?'
    ).get(opts.devtag) as any)?.cnt ?? 0;

    this.db.prepare(`
      INSERT INTO tag_mismatches (entry_id, devtag, mismatch_type, severity, previous_occurrences, cycle_id, file, agent_id, escalated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry_id,
      opts.devtag,
      opts.mismatch_type,
      escalation.final_severity,
      previousOccurrences,
      opts.cycle_id ?? null,
      opts.file ?? null,
      opts.agent_id ?? null,
      escalation.escalated ? 1 : 0
    );

    return { entry_id, severity: escalation.final_severity, escalated: escalation.escalated, reason: escalation.reason };
  }

  /**
   * Return the full Severity Escalation Chart as structured data.
   */
  static getChart(): {
    conditions: { id: number; trigger: string; from: Severity | null; to: Severity }[];
  } {
    return {
      conditions: [
        { id: 1, trigger: 'Warning in same file for 3+ consecutive build cycles', from: 'warning', to: 'error' },
        { id: 2, trigger: 'Error that was previously logged as a warning (second occurrence)', from: 'error', to: 'critical' },
        { id: 3, trigger: 'Tag mismatch involving devtag:perf_critical or devtag:security_requirement', from: null, to: 'critical' },
        { id: 4, trigger: 'Circular dependency between two devtag:perf_critical components', from: null, to: 'fatal' },
        { id: 5, trigger: 'Forensic entry involving devtag:nano component tagged devtag:breaking_change', from: null, to: 'critical' },
        { id: 6, trigger: 'Builder Agent retry produces different tag mismatch each attempt (non-deterministic)', from: null, to: 'critical' },
      ],
    };
  }

  /**
   * Return the Failure Escalation Chart as structured data.
   */
  static getFailureEscalationChart(): {
    levels: { level: number; trigger: string; action: string }[];
    severity_actions: { severity: Severity; action: string }[];
  } {
    return {
      levels: [
        { level: 1, trigger: 'Builder Agent fails 1 or 2 times', action: 'Builder Agent retries the same decided step' },
        { level: 2, trigger: 'Builder Agent fails 3 times', action: 'Step returned to Command Agent as failed. Logged to forensic database. Skeptic Agent cycle restarts with the failure as additional input.' },
        { level: 3, trigger: 'Command Agent receives same step failed twice', action: 'Command Agent decomposes the step into smaller sub-steps and restarts voting on the first sub-step.' },
        { level: 4, trigger: 'Command Agent receives decomposed sub-steps failing 3+ times', action: 'Entire action plan for this decision cycle is suspended. Flagged to The God Factory with full forensic context.' },
        { level: 5, trigger: 'The God Factory cannot resolve the flagged plan within one of its own cycles', action: 'Affected plantag is marked plantag:status:blocked. User is notified through the memory tab with the blocking devtag chain.' },
      ],
      severity_actions: [
        { severity: 'info', action: 'Logged only, no action triggered' },
        { severity: 'warning', action: 'Blame Crawler notified at next scheduled crawl' },
        { severity: 'error', action: 'Blame Crawler notified immediately, Skeptic Agent flagged' },
        { severity: 'critical', action: 'Current cycle halted, Command Agent notified, Skeptic Agent spawned immediately' },
        { severity: 'fatal', action: 'Current cycle halted, The God Factory invoked, user notified' },
      ],
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private countConsecutiveFileSeverity(file: string, severity: Severity): number {
    // Count distinct cycles in which warnings appeared for this file
    const rows = this.db.prepare(`
      SELECT DISTINCT cycle_id FROM tag_mismatches
      WHERE file = ? AND severity = ?
      ORDER BY created_at DESC LIMIT 10
    `).all(file, severity) as any[];
    return rows.length;
  }

  private devtagHasType(tag_key: string, tag_type: string): boolean {
    const row = this.db.prepare(
      'SELECT 1 FROM devtags WHERE tag_key = ? AND tag_type = ? AND status = ? LIMIT 1'
    ).get(tag_key, tag_type, 'active') as any;
    if (row) return true;
    // Also check if a devtag of this type exists in the same project
    const projectRow = this.db.prepare(`
      SELECT project_id FROM devtags WHERE tag_key = ? LIMIT 1
    `).get(tag_key) as any;
    if (!projectRow?.project_id) return false;
    const typeRow = this.db.prepare(
      'SELECT 1 FROM devtags WHERE project_id = ? AND tag_type = ? AND status = ? LIMIT 1'
    ).get(projectRow.project_id, tag_type, 'active') as any;
    return !!typeRow;
  }
}
