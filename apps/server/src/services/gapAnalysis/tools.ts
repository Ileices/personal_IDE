// ============================================
// Gap Analysis Tools
// Deterministic callable functions available to
// all gap analysis agents and sub-agents.
// All calls are logged to tag_resolution_log.
// ============================================
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import { CoverageAnalysisAgent } from './coverageAnalysis.js';
import { PatternRecognitionAgent } from './patternRecognition.js';
import { DebtTrackingAgent } from './debtTracking.js';
import { TagSystemAnalysisAgent } from './tagSystemAnalysis.js';
import { AgentPerformanceAnalysisAgent } from './agentPerformance.js';

export type Scope = 'file' | 'module' | 'phase' | 'total';
export type CoverageScope = 'plan' | 'test' | 'nano' | 'total';

export interface GapRecord {
  id: string;
  type: string;
  scope: string;
  affected: string;
  severity: string;
  detail: string;
  source_table: string;
}

export class GapAnalysisTools {
  private coverage: CoverageAnalysisAgent;
  private patterns: PatternRecognitionAgent;
  private debt: DebtTrackingAgent;
  private tagSystem: TagSystemAnalysisAgent;

  constructor(private db: Database.Database) {
    this.coverage = new CoverageAnalysisAgent(db);
    this.patterns = new PatternRecognitionAgent(db);
    this.debt = new DebtTrackingAgent(db);
    this.tagSystem = new TagSystemAnalysisAgent(db);
  }

  // ── gap_scan(scope, depth, tag_filter) ────────────────────────────────────
  gap_scan(scope: Scope, depth: number = 1, tag_filter?: string[]): GapRecord[] {
    const t0 = Date.now();
    const gaps: GapRecord[] = [];

    // 1. Coverage gaps
    const coverageRows = this.db.prepare(`
      SELECT * FROM coverage_matrix WHERE coverage_state IN ('missing','partial')
        ${scope === 'file' ? '' : ''}
      ORDER BY coverage_percent ASC LIMIT 100
    `).all() as any[];

    for (const r of coverageRows) {
      const missing = JSON.parse(r.missing_tags ?? '[]');
      if (tag_filter && !tag_filter.some(f => r.plantag_or_devtag.includes(f))) continue;
      gaps.push({
        id: r.entry_id,
        type: 'coverage_gap',
        scope: r.scope,
        affected: r.plantag_or_devtag,
        severity: r.coverage_percent === 0 ? 'error' : 'warning',
        detail: `Coverage: ${r.coverage_percent}%. Missing: ${missing.slice(0, 3).join(', ')}`,
        source_table: 'coverage_matrix',
      });
    }

    // 2. Dead/orphaned tag gaps
    const orphanedTags = this.db.prepare(`
      SELECT id, tag_key, tag_type, file_path, status FROM devtags
      WHERE status IN ('orphaned','dead')
      LIMIT 100
    `).all() as any[];

    for (const t of orphanedTags) {
      if (tag_filter && !tag_filter.includes(t.tag_type)) continue;
      gaps.push({
        id: t.id,
        type: 'orphaned_tag',
        scope: 'file',
        affected: t.tag_key,
        severity: t.status === 'dead' ? 'error' : 'warning',
        detail: `Tag ${t.tag_key} is ${t.status} in ${t.file_path ?? 'unknown'}`,
        source_table: 'devtags',
      });
    }

    // 3. Debt ceiling violations
    const debtViolations = this.db.prepare(`
      SELECT dh.file_path, dh.debt_score, dh.ceiling FROM debt_history dh
      INNER JOIN (SELECT file_path, MAX(rowid) as mr FROM debt_history GROUP BY file_path) l
        ON dh.file_path = l.file_path AND dh.rowid = l.mr
      WHERE dh.ceiling_exceeded = 1 LIMIT 50
    `).all() as any[];

    for (const dv of debtViolations) {
      gaps.push({
        id: uuid(),
        type: 'debt_violation',
        scope: 'file',
        affected: dv.file_path,
        severity: 'warning',
        detail: `Debt score ${dv.debt_score} exceeds ceiling ${dv.ceiling}`,
        source_table: 'debt_history',
      });
    }

    // 4. Systemic patterns
    const systemicPatterns = this.db.prepare(`
      SELECT * FROM patterns WHERE recurrence_count >= 5 ORDER BY recurrence_count DESC LIMIT 50
    `).all() as any[];

    for (const p of systemicPatterns) {
      gaps.push({
        id: p.pattern_id,
        type: 'systemic_pattern',
        scope: 'total',
        affected: `${p.failure_type}:${p.devtag_type}`,
        severity: p.severity ?? 'warning',
        detail: `Pattern ${p.failure_type} recurred ${p.recurrence_count} times (trend: ${p.severity_trend})`,
        source_table: 'patterns',
      });
    }

    // Sort by severity
    const SEV_ORDER = { fatal: 0, critical: 1, error: 2, warning: 3, info: 4 };
    gaps.sort((a, b) =>
      (SEV_ORDER[a.severity as keyof typeof SEV_ORDER] ?? 5) -
      (SEV_ORDER[b.severity as keyof typeof SEV_ORDER] ?? 5)
    );

    this.log('gap_scan', 'gap-analysis-tools', Date.now() - t0);
    return gaps;
  }

  // ── coverage_check(plantag_id) ────────────────────────────────────────────
  coverage_check(plantag_id: string) {
    const t0 = Date.now();
    const result = this.coverage.checkCoverage(plantag_id);
    this.log('coverage_check', 'gap-analysis-tools', Date.now() - t0);
    return result;
  }

  // ── debt_score(file_path) ─────────────────────────────────────────────────
  debt_score(file_path: string, cycle_id = 'manual') {
    const t0 = Date.now();
    const result = this.debt.computeDebtScore(file_path, cycle_id);
    this.log('debt_score', 'gap-analysis-tools', Date.now() - t0);
    return result;
  }

  // ── pattern_query(forensic_table, signature_filter, min_recurrence) ────────
  pattern_query(
    forensic_table: string,
    signature_filter: {
      failure_type?: string;
      devtag_type?: string;
      agent_category?: string;
      build_phase?: string;
    },
    min_recurrence = 3
  ) {
    const t0 = Date.now();
    const result = this.patterns.queryPatterns({
      failure_type: signature_filter.failure_type,
      devtag_type: signature_filter.devtag_type,
      agent_category: signature_filter.agent_category,
      build_phase: signature_filter.build_phase,
      min_recurrence,
    });
    this.log('pattern_query', 'gap-analysis-tools', Date.now() - t0);
    return result;
  }

  // ── regression_index(devtag) ──────────────────────────────────────────────
  regression_index(devtag: string) {
    const t0 = Date.now();

    const history = this.db.prepare(`
      SELECT entry_id, devtag, file, cause_buildtag_id, cause_agent_id, cycle_id, build_phase, created_at
      FROM regression_history WHERE devtag = ? ORDER BY created_at DESC LIMIT 100
    `).all(devtag) as any[];

    const hasNeedsReview = !!this.db.prepare(
      `SELECT 1 FROM devtags WHERE tag_key = ? AND tag_type = 'needs_review' AND status = 'active' LIMIT 1`
    ).get(devtag);

    const hasRegressionGuard = !!this.db.prepare(
      `SELECT 1 FROM devtags WHERE tag_key = ? AND tag_type = 'regression_guard' AND status = 'active' LIMIT 1`
    ).get(devtag);

    this.log('regression_index', 'gap-analysis-tools', Date.now() - t0);
    return { devtag, history, has_needs_review: hasNeedsReview, has_regression_guard: hasRegressionGuard };
  }

  // ── orphan_scan(registry_scope) ───────────────────────────────────────────
  orphan_scan(registry_scope: string) {
    const t0 = Date.now();

    const rows = this.db.prepare(`
      SELECT id, tag_key, tag_type, file_path, status, dead_detected_cycle, retirement_scheduled_cycle
      FROM devtags
      WHERE status IN ('orphaned','dead')
        ${registry_scope === 'total' ? '' : 'AND file_path LIKE ?'}
      ORDER BY status DESC, dead_detected_cycle ASC LIMIT 200
    `).all(...(registry_scope === 'total' ? [] : [`%${registry_scope}%`])) as any[];

    this.log('orphan_scan', 'gap-analysis-tools', Date.now() - t0);
    return {
      scope: registry_scope,
      orphaned: rows.filter(r => r.status === 'orphaned'),
      dead: rows.filter(r => r.status === 'dead'),
      total_count: rows.length,
    };
  }

  // ── conflict_scan(devtag_list) ────────────────────────────────────────────
  conflict_scan(devtag_list: string[]) {
    const t0 = Date.now();
    const results: any[] = [];

    for (const devtag of devtag_list) {
      const claims = this.db.prepare(`
        SELECT dc.agent_id, dc.cycle_id, dc.claimed_at, dt.tag_key
        FROM devtag_claims dc
        INNER JOIN devtags dt ON dc.devtag_id = dt.id
        WHERE dt.tag_key = ? AND dc.released_at IS NULL
      `).all(devtag) as any[];

      if (claims.length > 0) {
        results.push({ devtag, claimed: true, claims });
      } else {
        results.push({ devtag, claimed: false, claims: [] });
      }
    }

    this.log('conflict_scan', 'gap-analysis-tools', Date.now() - t0);
    return results;
  }

  // ── gap_report(agent_id, cycle_range) ─────────────────────────────────────
  gap_report(agent_id: string, cycle_range: [number, number], session_id = 'manual') {
    const t0 = Date.now();
    const [start, end] = cycle_range;
    const reports: any[] = [];

    // Regressions for this agent
    const regressions = this.db.prepare(`
      SELECT entry_id, devtag, file, cause_agent_id FROM regression_history
      WHERE cause_agent_id = ? AND CAST(cycle_id AS INTEGER) BETWEEN ? AND ?
    `).all(agent_id, start, end) as any[];

    if (regressions.length > 0) {
      reports.push({
        report_id: uuid(),
        cycle_range_start: start,
        cycle_range_end: end,
        session_id,
        gap_category: 'process',
        affected_tags: regressions.map(r => r.devtag),
        affected_agents: [agent_id],
        affected_files: [...new Set(regressions.map(r => r.file).filter(Boolean))],
        severity: 'error',
        pattern_id: null,
        recommended_action_tags: ['plantag:investigate:regression', 'buildtag:review:process'],
        forensic_entry_ids: regressions.map(r => r.entry_id),
        flagged_to_god_factory: false,
      });
    }

    // Tag mismatches for this agent
    const mismatches = this.db.prepare(`
      SELECT entry_id, devtag, severity FROM tag_mismatches
      WHERE agent_id = ? AND CAST(cycle_id AS INTEGER) BETWEEN ? AND ?
    `).all(agent_id, start, end) as any[];

    if (mismatches.length > 0) {
      const hasCritical = mismatches.some(m => m.severity === 'critical' || m.severity === 'fatal');
      reports.push({
        report_id: uuid(),
        cycle_range_start: start,
        cycle_range_end: end,
        session_id,
        gap_category: 'structural',
        affected_tags: mismatches.map(m => m.devtag),
        affected_agents: [agent_id],
        affected_files: [],
        severity: hasCritical ? 'critical' : 'warning',
        pattern_id: null,
        recommended_action_tags: ['plantag:review:tag_schema'],
        forensic_entry_ids: mismatches.map(m => m.entry_id),
        flagged_to_god_factory: hasCritical,
      });
    }

    // Persist gap reports
    const stmt = this.db.prepare(`
      INSERT INTO gap_reports
        (report_id, cycle_range_start, cycle_range_end, session_id, gap_category,
         affected_tags, affected_agents, affected_files, severity, recommended_action_tags,
         forensic_entry_ids, flagged_to_god_factory)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const r of reports) {
      stmt.run(
        r.report_id, r.cycle_range_start, r.cycle_range_end, r.session_id, r.gap_category,
        JSON.stringify(r.affected_tags), JSON.stringify(r.affected_agents),
        JSON.stringify(r.affected_files), r.severity,
        JSON.stringify(r.recommended_action_tags), JSON.stringify(r.forensic_entry_ids),
        r.flagged_to_god_factory ? 1 : 0
      );
    }

    this.log('gap_report', 'gap-analysis-tools', Date.now() - t0);
    return reports;
  }

  // ── tag_vocabulary_diff ───────────────────────────────────────────────────
  tag_vocabulary_diff(schema_version_a: string, schema_version_b: string) {
    const t0 = Date.now();
    const result = this.tagSystem.vocabularyDiff(schema_version_a, schema_version_b);
    this.log('tag_vocabulary_diff', 'gap-analysis-tools', Date.now() - t0);
    return result;
  }

  // ── coverage_matrix(scope, phase_filter) ─────────────────────────────────
  coverage_matrix(scope: CoverageScope, phase_filter?: string) {
    const t0 = Date.now();
    const result = this.coverage.getMatrix(scope === 'total' ? undefined : scope, phase_filter);
    this.log('coverage_matrix', 'gap-analysis-tools', Date.now() - t0);
    return result;
  }

  // ── debt_heatmap(threshold) ───────────────────────────────────────────────
  debt_heatmap(threshold = 15) {
    const t0 = Date.now();
    const result = this.debt.heatmap(threshold);
    this.log('debt_heatmap', 'gap-analysis-tools', Date.now() - t0);
    return result;
  }

  // ── pattern_trend(pattern_id, cycle_window) ───────────────────────────────
  pattern_trend(pattern_id: string, cycle_window: number) {
    const t0 = Date.now();
    const result = this.patterns.getPatternTrend(pattern_id, cycle_window);
    this.log('pattern_trend', 'gap-analysis-tools', Date.now() - t0);
    return result;
  }

  // ── agent_conformance_report(agent_id, cycle_range) ──────────────────────
  agent_conformance_report(agent_id: string, cycle_range_start: string, cycle_range_end: string) {
    const t0 = Date.now();
    const agent = new AgentPerformanceAnalysisAgent(this.db);
    const result = agent.getConformanceReport(agent_id, cycle_range_start, cycle_range_end);
    this.log('agent_conformance_report', 'gap-analysis-tools', Date.now() - t0);
    return result;
  }

  // ── resolution_latency_report(tag_type, model_tier) ──────────────────────
  resolution_latency_report(tag_type: string, model_tier: string) {
    const t0 = Date.now();
    const result = this.tagSystem.getResolutionLatencyReport(tag_type, model_tier);
    this.log('resolution_latency_report', 'gap-analysis-tools', Date.now() - t0);
    return result;
  }

  private log(tag_type: string, agent_id: string, ms: number) {
    try {
      this.db.prepare(`
        INSERT INTO tag_resolution_log (entry_id, tag_type, agent_id, model_tier, cycle_id, resolution_time_ms)
        VALUES (?, ?, ?, 'tools', 'gap_tools', ?)
      `).run(uuid(), tag_type, agent_id, ms);
    } catch { /* non-blocking */ }
  }
}
