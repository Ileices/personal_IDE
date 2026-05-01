// ============================================
// Regression Sub-Agent
// After each committed buildtag set, crawls all
// plantag:status:done entries and verifies their
// devtags still exist in the expected state.
// Detects and records regressions only (no repair).
// ============================================
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import type { TagRegistryService } from '../../tagRegistry/index.js';

export interface RegressionReport {
  checked: number;
  regressions: RegressionEntry[];
}

export interface RegressionEntry {
  devtag: string;
  file: string;
  cause_buildtag_id: string;
  cause_agent_id: string;
  prior_plantag_status: string;
  cycle_id: string;
}

export class RegressionSubAgent {
  constructor(
    private db: Database.Database,
    private tagRegistry: TagRegistryService
  ) {}

  /**
   * Check all done plantags after a committed build step.
   * Revert any that have lost their corresponding devtag to blocked status.
   */
  async runCheck(opts: {
    cause_buildtag_id: string;
    cause_agent_id: string;
    cycle_id: string;
  }): Promise<RegressionReport> {
    const { cause_buildtag_id, cause_agent_id, cycle_id } = opts;

    const donePlantags = this.db.prepare(`
      SELECT p.*, d.tag_key as devtag_key, d.file_path, d.status as devtag_status, d.tag_type
      FROM plantags p
      LEFT JOIN devtags d ON p.linked_devtag_id = d.id
      WHERE p.status = 'done'
    `).all() as any[];

    const regressions: RegressionEntry[] = [];
    let checked = 0;

    const tx = this.db.transaction(() => {
      for (const pt of donePlantags) {
        checked++;

        let regressed = false;
        let reason = '';

        if (!pt.linked_devtag_id) {
          // Plantag has no devtag link — skip
          continue;
        }

        if (!pt.devtag_key) {
          // Devtag deleted entirely
          regressed = true;
          reason = 'linked devtag no longer exists in registry';
        } else if (pt.devtag_status !== 'active') {
          // Devtag exists but is in wrong state
          regressed = true;
          reason = `linked devtag status changed to ${pt.devtag_status}`;
        }

        if (regressed) {
          // Revert plantag to blocked
          this.db.prepare(`
            UPDATE plantags SET status = 'blocked', blocking_reason = ?, updated_at = datetime('now') WHERE id = ?
          `).run(reason, pt.id);

          const entry: RegressionEntry = {
            devtag: pt.devtag_key ?? pt.linked_devtag_id,
            file: pt.file_path ?? '',
            cause_buildtag_id,
            cause_agent_id,
            prior_plantag_status: 'done',
            cycle_id,
          };

          regressions.push(entry);

          // Write to regression_history forensic table
          this.db.prepare(`
            INSERT INTO regression_history (entry_id, devtag, file, line_start, line_end, cause_buildtag_id, cause_agent_id, prior_plantag_status, cycle_id)
            VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?)
          `).run(uuid(), entry.devtag, entry.file, cause_buildtag_id, cause_agent_id, 'done', cycle_id);
        }
      }
    });

    tx();

    return { checked, regressions };
  }

  /**
   * Get all regression history entries.
   */
  getHistory(opts: { devtag?: string; cycle_id?: string; limit?: number } = {}): any[] {
    let query = 'SELECT * FROM regression_history WHERE 1=1';
    const params: any[] = [];
    if (opts.devtag) { query += ' AND devtag = ?'; params.push(opts.devtag); }
    if (opts.cycle_id) { query += ' AND cycle_id = ?'; params.push(opts.cycle_id); }
    query += ' ORDER BY created_at DESC';
    if (opts.limit) { query += ` LIMIT ${opts.limit}`; }
    return this.db.prepare(query).all(...params) as any[];
  }
}
