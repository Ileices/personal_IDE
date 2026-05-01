// ============================================
// Pattern Recognition Agent
// Crawls all forensic tables to identify recurring
// failure patterns and LLM-specific anti-patterns.
// Writes to the `patterns` forensic table.
// ============================================
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';

export type Severity = 'info' | 'warning' | 'error' | 'critical' | 'fatal';
const SEV_RANK: Record<Severity, number> = { info: 0, warning: 1, error: 2, critical: 3, fatal: 4 };
const SEV_UP: Severity[] = ['warning', 'error', 'critical', 'fatal', 'fatal'];

function escalate(s: Severity): Severity {
  return SEV_UP[SEV_RANK[s]] as Severity;
}

export interface PatternRecord {
  pattern_id: string;
  failure_type: string;
  devtag_type: string;
  agent_category: string;
  build_phase: string;
  first_occurrence: string;
  recurrence_count: number;
  severity: Severity;
  severity_trend: 'stable' | 'escalating' | 'de-escalating';
  contributing_forensic_ids: string[];
  flagged_to_god_factory: boolean;
  is_anti_pattern: boolean;
  anti_pattern_type?: string;
}

export interface CrawlResult {
  new_patterns: number;
  updated_patterns: number;
  systemic_patterns: number;
  god_factory_flags: number;
  anti_patterns: AntiPatternResult[];
}

export interface AntiPatternResult {
  pattern_id: string;
  anti_pattern_type: string;
  devtag?: string;
  detail: string;
  severity: Severity;
}

export class PatternRecognitionAgent {
  constructor(private db: Database.Database) {}

  crawl(current_cycle: number): CrawlResult {
    const t0 = Date.now();
    let newPatterns = 0;
    let updatedPatterns = 0;
    let systemicPatterns = 0;
    let godFactoryFlags = 0;

    // ── Crawl all forensic failure tables ────────────────────────────────────
    const failureSources = this.gatherFailures(current_cycle);

    // Group by structural signature (failure_type, devtag_type, agent_category, build_phase)
    const sigMap = new Map<string, { ids: string[]; severity: Severity; phase: string }>();
    for (const entry of failureSources) {
      const key = `${entry.failure_type}|${entry.devtag_type}|${entry.agent_category}|${entry.build_phase}`;
      if (!sigMap.has(key)) sigMap.set(key, { ids: [], severity: entry.severity, phase: entry.build_phase });
      sigMap.get(key)!.ids.push(entry.entry_id);
    }

    for (const [sig, data] of sigMap.entries()) {
      if (data.ids.length < 3) continue; // Must occur 3+ times

      const [failure_type, devtag_type, agent_category, build_phase] = sig.split('|');

      // Check existing pattern
      const existing = this.db.prepare(
        'SELECT * FROM patterns WHERE failure_type=? AND devtag_type=? AND agent_category=? AND build_phase=?'
      ).get(failure_type, devtag_type, agent_category, build_phase) as any;

      if (existing) {
        const prevIds: string[] = JSON.parse(existing.contributing_forensic_ids ?? '[]');
        const allIds = [...new Set([...prevIds, ...data.ids])];
        const newCount = existing.recurrence_count + data.ids.filter(id => !prevIds.includes(id)).length;

        // Determine trend
        const trend = newCount > existing.recurrence_count + 2 ? 'escalating'
          : newCount < existing.recurrence_count ? 'de-escalating'
          : 'stable';

        const flagged = existing.flagged_to_god_factory || newCount >= 10;

        this.db.prepare(`
          UPDATE patterns SET
            recurrence_count = ?, severity_trend = ?, contributing_forensic_ids = ?,
            flagged_to_god_factory = ?, timestamp = datetime('now')
          WHERE pattern_id = ?
        `).run(newCount, trend, JSON.stringify(allIds), flagged ? 1 : 0, existing.pattern_id);

        if (flagged && !existing.flagged_to_god_factory) godFactoryFlags++;
        if (newCount >= 5) systemicPatterns++;
        updatedPatterns++;
      } else {
        const pattern_id = uuid();
        const flagged = data.ids.length >= 10;
        this.db.prepare(`
          INSERT INTO patterns
            (pattern_id, failure_type, devtag_type, agent_category, build_phase,
             recurrence_count, severity, severity_trend, contributing_forensic_ids, flagged_to_god_factory)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'stable', ?, ?)
        `).run(
          pattern_id, failure_type, devtag_type, agent_category, build_phase,
          data.ids.length, data.severity, JSON.stringify(data.ids), flagged ? 1 : 0
        );
        if (flagged) godFactoryFlags++;
        if (data.ids.length >= 5) systemicPatterns++;
        newPatterns++;
      }
    }

    // ── Anti-pattern detection ─────────────────────────────────────────────
    const antiPatterns = this.detectAntiPatterns(current_cycle);

    this.logToolCall('pattern_recognition_crawl', 'pattern-recognition-agent',
      String(current_cycle), Date.now() - t0);

    return { new_patterns: newPatterns, updated_patterns: updatedPatterns,
      systemic_patterns: systemicPatterns, god_factory_flags: godFactoryFlags,
      anti_patterns: antiPatterns };
  }

  // ── Anti-pattern Detection ────────────────────────────────────────────────

  private detectAntiPatterns(current_cycle: number): AntiPatternResult[] {
    const results: AntiPatternResult[] = [];
    results.push(...this.detectAISlop(current_cycle));
    results.push(...this.detectDrift(current_cycle));
    results.push(...this.detectSpaghettiGrowth(current_cycle));
    results.push(...this.detectHallucinationLoop(current_cycle));
    results.push(...this.detectContextLoss(current_cycle));
    return results;
  }

  /** AI Slop: Diff Sub-Agent repeatedly rejects buildtag predicted state */
  private detectAISlop(current_cycle: number): AntiPatternResult[] {
    const results: AntiPatternResult[] = [];
    const rows = this.db.prepare(`
      SELECT agent_id, COUNT(*) as cnt FROM diff_failures
      WHERE cycle_id >= ?
      GROUP BY agent_id HAVING cnt >= 3
    `).all(String(Math.max(0, current_cycle - 5))) as any[];

    for (const row of rows) {
      const pid = this.upsertAntiPattern('ai_slop', row.agent_id, String(current_cycle));
      results.push({
        pattern_id: pid,
        anti_pattern_type: 'ai_slop',
        detail: `Agent ${row.agent_id} produced ${row.cnt} diff-rejected buildtags in 5 cycles`,
        severity: 'warning',
      });
    }
    return results;
  }

  /** Drift: same devtag modified 3+ times without satisfying parent plantag */
  private detectDrift(current_cycle: number): AntiPatternResult[] {
    const results: AntiPatternResult[] = [];
    const rows = this.db.prepare(`
      SELECT devtag, COUNT(DISTINCT cause_buildtag_id) as modifications
      FROM regression_history WHERE cycle_id >= ?
      GROUP BY devtag HAVING modifications > 3
    `).all(String(Math.max(0, current_cycle - 5))) as any[];

    for (const row of rows) {
      const pid = this.upsertAntiPattern('drift', row.devtag, String(current_cycle));
      results.push({
        pattern_id: pid,
        anti_pattern_type: 'drift',
        devtag: row.devtag,
        detail: `${row.devtag} modified ${row.modifications} times without satisfying parent plantag`,
        severity: 'warning',
      });
    }
    return results;
  }

  /** Spaghetti Growth: relationship edges grow without test coverage */
  private detectSpaghettiGrowth(current_cycle: number): AntiPatternResult[] {
    const results: AntiPatternResult[] = [];
    const rows = this.db.prepare(`
      SELECT file_path, SUM(edge_count) as total_edges FROM spaghetti_index
      WHERE cycle_id >= ?
      GROUP BY file_path HAVING total_edges > 2
    `).all(String(Math.max(0, current_cycle - 1))) as any[];

    for (const row of rows) {
      const pid = this.upsertAntiPattern('spaghetti_growth', row.file_path, String(current_cycle));
      results.push({
        pattern_id: pid,
        anti_pattern_type: 'spaghetti_growth',
        detail: `${row.file_path} grew by ${row.total_edges} relationship edges in last cycle without test coverage growth`,
        severity: 'warning',
      });
    }
    return results;
  }

  /** Hallucination Loop: agent references non-existent devtags multiple times */
  private detectHallucinationLoop(current_cycle: number): AntiPatternResult[] {
    const results: AntiPatternResult[] = [];
    const rows = this.db.prepare(`
      SELECT agent_id, COUNT(*) as cnt FROM diff_failures
      WHERE mismatch_detail LIKE '%not found in registry%' AND cycle_id >= ?
      GROUP BY agent_id HAVING cnt >= 2
    `).all(String(Math.max(0, current_cycle - 3))) as any[];

    for (const row of rows) {
      const pid = this.upsertAntiPattern('hallucination_loop', row.agent_id, String(current_cycle));
      results.push({
        pattern_id: pid,
        anti_pattern_type: 'hallucination_loop',
        detail: `Agent ${row.agent_id} referenced non-existent devtags ${row.cnt} times`,
        severity: 'error',
      });
    }
    return results;
  }

  /** Context Loss: needs_refactor/needs_review written repeatedly without action */
  private detectContextLoss(current_cycle: number): AntiPatternResult[] {
    const results: AntiPatternResult[] = [];
    const rows = this.db.prepare(`
      SELECT devtag, COUNT(DISTINCT cycle_id) as seen_cycles FROM tag_mismatches
      WHERE mismatch_type IN ('needs_refactor','needs_review') AND cycle_id >= ?
      GROUP BY devtag HAVING seen_cycles >= 3
    `).all(String(Math.max(0, current_cycle - 5))) as any[];

    for (const row of rows) {
      // Check if any buildtag addressed it
      const addressed = this.db.prepare(`
        SELECT 1 FROM buildtags
        WHERE target_devtag_id = (SELECT id FROM devtags WHERE tag_key = ? LIMIT 1)
          AND tag_type IN ('modify','replace') AND status = 'committed'
        LIMIT 1
      `).get(row.devtag);

      if (!addressed) {
        const pid = this.upsertAntiPattern('context_loss', row.devtag, String(current_cycle));
        results.push({
          pattern_id: pid,
          anti_pattern_type: 'context_loss',
          devtag: row.devtag,
          detail: `${row.devtag} flagged as needs_refactor/review in ${row.seen_cycles} cycles without any buildtag:modify addressing it`,
          severity: 'warning',
        });
      }
    }
    return results;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private upsertAntiPattern(type: string, subject: string, cycle_id: string): string {
    const existing = this.db.prepare(
      'SELECT pattern_id, recurrence_count FROM patterns WHERE anti_pattern_type = ? AND agent_category = ?'
    ).get(type, subject) as any;

    if (existing) {
      this.db.prepare(`
        UPDATE patterns SET recurrence_count = recurrence_count + 1, timestamp = datetime('now')
        WHERE pattern_id = ?
      `).run(existing.pattern_id);
      return existing.pattern_id;
    }

    const pattern_id = uuid();
    this.db.prepare(`
      INSERT INTO patterns
        (pattern_id, failure_type, devtag_type, agent_category, build_phase, recurrence_count,
         severity, is_anti_pattern, anti_pattern_type)
      VALUES (?, ?, ?, ?, '', 1, 'warning', 1, ?)
    `).run(pattern_id, type, type, subject, type);
    return pattern_id;
  }

  private gatherFailures(current_cycle: number): Array<{
    entry_id: string;
    failure_type: string;
    devtag_type: string;
    agent_category: string;
    build_phase: string;
    severity: Severity;
  }> {
    const failures: ReturnType<typeof this.gatherFailures> = [];
    const cycleFloor = String(Math.max(0, current_cycle - 5));

    // regression_history
    const regressions = this.db.prepare(`
      SELECT entry_id, devtag, cause_agent_id, build_phase FROM regression_history
      WHERE cycle_id >= ? LIMIT 500
    `).all(cycleFloor) as any[];
    for (const r of regressions) {
      failures.push({
        entry_id: r.entry_id,
        failure_type: 'regression',
        devtag_type: this.inferDevtagType(r.devtag),
        agent_category: this.agentCategory(r.cause_agent_id),
        build_phase: r.build_phase ?? '',
        severity: 'error',
      });
    }

    // integration_failures
    const integrations = this.db.prepare(`
      SELECT entry_id, new_devtag, agent_id, severity, cycle_id FROM integration_failures
      WHERE cycle_id >= ? LIMIT 500
    `).all(cycleFloor) as any[];
    for (const r of integrations) {
      failures.push({
        entry_id: r.entry_id,
        failure_type: 'integration',
        devtag_type: this.inferDevtagType(r.new_devtag),
        agent_category: this.agentCategory(r.agent_id),
        build_phase: '',
        severity: (r.severity ?? 'warning') as Severity,
      });
    }

    // diff_failures
    const diffs = this.db.prepare(`
      SELECT entry_id, agent_id, cycle_id FROM diff_failures
      WHERE cycle_id >= ? LIMIT 500
    `).all(cycleFloor) as any[];
    for (const r of diffs) {
      failures.push({
        entry_id: r.entry_id,
        failure_type: 'diff_failure',
        devtag_type: 'unknown',
        agent_category: this.agentCategory(r.agent_id),
        build_phase: '',
        severity: 'warning',
      });
    }

    // tag_mismatches
    const mismatches = this.db.prepare(`
      SELECT entry_id, devtag, agent_id, severity FROM tag_mismatches
      WHERE cycle_id >= ? LIMIT 500
    `).all(cycleFloor) as any[];
    for (const r of mismatches) {
      failures.push({
        entry_id: r.entry_id,
        failure_type: 'tag_mismatch',
        devtag_type: this.inferDevtagType(r.devtag),
        agent_category: this.agentCategory(r.agent_id),
        build_phase: '',
        severity: (r.severity ?? 'warning') as Severity,
      });
    }

    return failures;
  }

  private inferDevtagType(tag_key: string): string {
    if (!tag_key) return 'unknown';
    const parts = tag_key.split(':');
    return parts.length >= 2 ? parts[1] : 'unknown';
  }

  private agentCategory(agent_id: string): string {
    if (!agent_id) return 'unknown';
    if (agent_id.includes('builder')) return 'builder';
    if (agent_id.includes('command')) return 'command';
    if (agent_id.includes('skeptic')) return 'skeptic';
    if (agent_id.includes('fleet')) return 'fleet';
    if (agent_id.includes('god')) return 'god_factory';
    return 'other';
  }

  /** Query patterns from DB */
  queryPatterns(opts: {
    failure_type?: string;
    devtag_type?: string;
    agent_category?: string;
    build_phase?: string;
    min_recurrence?: number;
    anti_pattern_only?: boolean;
  }): PatternRecord[] {
    let query = 'SELECT * FROM patterns WHERE 1=1';
    const params: any[] = [];
    if (opts.failure_type) { query += ' AND failure_type = ?'; params.push(opts.failure_type); }
    if (opts.devtag_type) { query += ' AND devtag_type = ?'; params.push(opts.devtag_type); }
    if (opts.agent_category) { query += ' AND agent_category = ?'; params.push(opts.agent_category); }
    if (opts.build_phase) { query += ' AND build_phase = ?'; params.push(opts.build_phase); }
    if (opts.min_recurrence) { query += ' AND recurrence_count >= ?'; params.push(opts.min_recurrence); }
    if (opts.anti_pattern_only) { query += ' AND is_anti_pattern = 1'; }
    query += ' ORDER BY recurrence_count DESC LIMIT 200';
    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(r => ({
      ...r,
      contributing_forensic_ids: JSON.parse(r.contributing_forensic_ids ?? '[]'),
      flagged_to_god_factory: !!r.flagged_to_god_factory,
      is_anti_pattern: !!r.is_anti_pattern,
    }));
  }

  /** Trend for a specific pattern over a cycle window */
  getPatternTrend(pattern_id: string, cycle_window: number): {
    pattern_id: string;
    recurrence_count: number;
    recurrences_per_cycle: number;
    trend: 'stable' | 'escalating' | 'de-escalating';
  } {
    const row = this.db.prepare('SELECT * FROM patterns WHERE pattern_id = ?').get(pattern_id) as any;
    if (!row) return { pattern_id, recurrence_count: 0, recurrences_per_cycle: 0, trend: 'stable' };
    const rpc = cycle_window > 0 ? row.recurrence_count / cycle_window : 0;
    return {
      pattern_id,
      recurrence_count: row.recurrence_count,
      recurrences_per_cycle: Math.round(rpc * 100) / 100,
      trend: row.severity_trend ?? 'stable',
    };
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
