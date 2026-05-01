// ============================================
// Regression Agent (persistent)
// Maintains complete regression history across all
// cycles and sessions. Detects systemic patterns.
// Reports to The God Factory when thresholds exceeded.
// ============================================
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import type { TagRegistryService } from '../../tagRegistry/index.js';

export interface SystemicRegressionReport {
  dimension: 'devtag' | 'file' | 'agent_id' | 'build_phase';
  dimension_value: string;
  regression_count: number;
  cycle_window: number;
  affected_devtags: string[];
  suggested_guard_tags: string[];
  flagged_to_god_factory: boolean;
}

export class RegressionAgent {
  private static readonly THRESHOLD_COUNT = 3;
  private static readonly THRESHOLD_CYCLE_WINDOW = 5;

  constructor(
    private db: Database.Database,
    private tagRegistry: TagRegistryService
  ) {}

  /**
   * Analyze all regression history entries for systemic patterns.
   * Called at start of each session and after each Regression Sub-Agent report.
   */
  analyzePatterns(current_cycle: number): SystemicRegressionReport[] {
    const windowStart = current_cycle - RegressionAgent.THRESHOLD_CYCLE_WINDOW;
    const reports: SystemicRegressionReport[] = [];

    // Analyze per dimension
    const dimensions: Array<'devtag' | 'file' | 'agent_id' | 'build_phase'> = ['devtag', 'file', 'agent_id', 'build_phase'];

    for (const dimension of dimensions) {
      const column = dimension === 'agent_id' ? 'cause_agent_id' : dimension;

      const rows = this.db.prepare(`
        SELECT ${column} as dim_value, COUNT(*) as cnt, GROUP_CONCAT(devtag) as devtags
        FROM regression_history
        WHERE CAST(cycle_id AS INTEGER) >= ?
        GROUP BY ${column}
        HAVING cnt >= ?
      `).all(windowStart, RegressionAgent.THRESHOLD_COUNT) as any[];

      for (const row of rows) {
        const affected = (row.devtags ?? '').split(',').filter(Boolean);
        const suggested = affected.map((dt: string) => `plantag:regression_guard:${dt}`);

        const flagged = true; // Always flag to God Factory when threshold exceeded

        reports.push({
          dimension,
          dimension_value: row.dim_value,
          regression_count: row.cnt,
          cycle_window: RegressionAgent.THRESHOLD_CYCLE_WINDOW,
          affected_devtags: affected,
          suggested_guard_tags: suggested,
          flagged_to_god_factory: flagged,
        });

        // Write to forensic DB if not already recorded for this cycle window
        const existing = this.db.prepare(`
          SELECT entry_id FROM systemic_regressions 
          WHERE dimension = ? AND dimension_value = ? AND cycle_window = ?
        `).get(dimension, row.dim_value, RegressionAgent.THRESHOLD_CYCLE_WINDOW);

        if (!existing) {
          this.db.prepare(`
            INSERT INTO systemic_regressions (entry_id, dimension, dimension_value, regression_count, cycle_window, affected_devtags, suggested_guard_tags, flagged_to_god_factory)
            VALUES (?,?,?,?,?,?,?,?)
          `).run(
            uuid(), dimension, row.dim_value, row.cnt,
            RegressionAgent.THRESHOLD_CYCLE_WINDOW,
            JSON.stringify(affected),
            JSON.stringify(suggested),
            1
          );

          // Mark affected devtags as needs_review
          for (const dt_key of affected) {
            const dt = this.tagRegistry.resolveDevtag(dt_key);
            if (dt) {
              const meta = { ...dt.metadata, needs_review: true, regression_density: row.cnt };
              this.tagRegistry.updateDevtag(dt.id, { metadata: meta });
            }
          }
        }
      }
    }

    return reports;
  }

  /**
   * Get the regression heat map: tag-density score per file.
   */
  getRegressionHeatMap(): { file: string; regression_count: number; devtags: string[] }[] {
    const rows = this.db.prepare(`
      SELECT file, COUNT(*) as regression_count, GROUP_CONCAT(devtag) as devtags
      FROM regression_history
      GROUP BY file
      ORDER BY regression_count DESC
      LIMIT 100
    `).all() as any[];

    return rows.map(r => ({
      file: r.file,
      regression_count: r.regression_count,
      devtags: (r.devtags ?? '').split(',').filter(Boolean),
    }));
  }

  /**
   * Get all systemic regression reports.
   */
  getSystemicRegressions(flagged_to_god_factory?: boolean): any[] {
    const query = flagged_to_god_factory !== undefined
      ? 'SELECT * FROM systemic_regressions WHERE flagged_to_god_factory = ? ORDER BY created_at DESC'
      : 'SELECT * FROM systemic_regressions ORDER BY created_at DESC LIMIT 200';

    const rows = flagged_to_god_factory !== undefined
      ? this.db.prepare(query).all(flagged_to_god_factory ? 1 : 0)
      : this.db.prepare(query).all();

    return (rows as any[]).map(r => ({
      ...r,
      affected_devtags: JSON.parse(r.affected_devtags ?? '[]'),
      suggested_guard_tags: JSON.parse(r.suggested_guard_tags ?? '[]'),
      flagged_to_god_factory: Boolean(r.flagged_to_god_factory),
    }));
  }
}
