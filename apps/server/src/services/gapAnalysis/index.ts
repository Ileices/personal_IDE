// ============================================
// Gap Analysis Agent (Orchestrator)
// Persistent agent that synthesizes all sub-agent
// outputs into unified gap reports delivered to
// The God Factory Self-Improvement Agent.
//
// Invariants enforced here:
// - Report every 10 build cycles
// - Any pattern at recurrence 10 → immediate flag
// - Coverage check after every committed build step
// ============================================
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import { CoverageAnalysisAgent } from './coverageAnalysis.js';
import { PatternRecognitionAgent } from './patternRecognition.js';
import { DebtTrackingAgent } from './debtTracking.js';
import { TagSystemAnalysisAgent } from './tagSystemAnalysis.js';
import { AgentPerformanceAnalysisAgent } from './agentPerformance.js';
import { GapAnalysisTools } from './tools.js';

export type GapCategory = 'coverage' | 'structural' | 'process' | 'tag_system' | 'agent_performance';
export type Severity = 'info' | 'warning' | 'error' | 'critical' | 'fatal';

export interface GapReport {
  report_id: string;
  cycle_range: [number, number];
  session_id: string;
  gap_category: GapCategory;
  affected_tags: string[];
  affected_agents: string[];
  affected_files: string[];
  severity: Severity;
  pattern_id: string | null;
  recommended_action_tags: string[];
  forensic_entry_ids: string[];
  flagged_to_god_factory: boolean;
  timestamp: string;
}

export interface FullGapAnalysisResult {
  session_id: string;
  cycle_range: [number, number];
  reports: GapReport[];
  coverage_summary: any;
  pattern_crawl: any;
  debt_summary: any;
  tag_analysis: any;
  performance_summary: any;
  flagged_to_god_factory: number;
  total_reports: number;
}

export class GapAnalysisAgent {
  private coverage: CoverageAnalysisAgent;
  private patterns: PatternRecognitionAgent;
  private debt: DebtTrackingAgent;
  private tagSystem: TagSystemAnalysisAgent;
  private agentPerf: AgentPerformanceAnalysisAgent;
  private tools: GapAnalysisTools;

  constructor(private db: Database.Database) {
    this.coverage = new CoverageAnalysisAgent(db);
    this.patterns = new PatternRecognitionAgent(db);
    this.debt = new DebtTrackingAgent(db);
    this.tagSystem = new TagSystemAnalysisAgent(db);
    this.agentPerf = new AgentPerformanceAnalysisAgent(db);
    this.tools = new GapAnalysisTools(db);
  }

  /**
   * Run a full gap analysis pass across all five categories.
   * Called automatically every 10 cycles, or on-demand.
   */
  async runFullAnalysis(opts: {
    session_id: string;
    cycle_range: [number, number];
    project_root?: string;
  }): Promise<FullGapAnalysisResult> {
    const { session_id, cycle_range, project_root = process.cwd() } = opts;
    const cycle_id = String(cycle_range[1]);
    const reports: GapReport[] = [];

    // ── 1. Coverage Analysis ──────────────────────────────────────────────
    const coverageMatrix = this.coverage.run(cycle_id);
    const coverageGaps = [...coverageMatrix.plan, ...coverageMatrix.test, ...coverageMatrix.nano]
      .filter(r => r.coverage_state !== 'covered' && r.coverage_state !== 'not_required');

    if (coverageGaps.length > 0) {
      const severity = coverageGaps.some(r => r.coverage_percent === 0) ? 'error' : 'warning';
      const report = this.buildReport({
        session_id, cycle_range, gap_category: 'coverage', severity,
        affected_tags: coverageGaps.map(r => r.plantag_or_devtag),
        affected_agents: [],
        affected_files: [],
        forensic_entry_ids: coverageGaps.map(r => r.entry_id),
        recommended_action_tags: ['plantag:investigate:coverage_gap', 'buildtag:create:missing_devtag'],
      });
      reports.push(report);
    }

    // ── 2. Pattern Recognition ────────────────────────────────────────────
    const patternCrawl = this.patterns.crawl(cycle_range[1]);

    // Anti-patterns → structural gaps
    for (const ap of patternCrawl.anti_patterns) {
      if (ap.severity === 'error' || ap.severity === 'critical') {
        const report = this.buildReport({
          session_id, cycle_range, gap_category: 'structural',
          severity: ap.severity,
          affected_tags: ap.devtag ? [ap.devtag] : [],
          affected_agents: [],
          affected_files: [],
          forensic_entry_ids: [ap.pattern_id],
          recommended_action_tags: [`plantag:investigate:${ap.anti_pattern_type}`],
          pattern_id: ap.pattern_id,
        });
        reports.push(report);
      }
    }

    // Check for god-factory flagged patterns (recurrence 10+)
    const godPatterns = this.db.prepare(
      'SELECT * FROM patterns WHERE recurrence_count >= 10 AND flagged_to_god_factory = 0'
    ).all() as any[];
    for (const p of godPatterns) {
      this.db.prepare('UPDATE patterns SET flagged_to_god_factory = 1 WHERE pattern_id = ?').run(p.pattern_id);
      const report = this.buildReport({
        session_id, cycle_range, gap_category: 'process',
        severity: 'critical',
        affected_tags: [p.devtag_type],
        affected_agents: [p.agent_category],
        affected_files: [],
        forensic_entry_ids: JSON.parse(p.contributing_forensic_ids ?? '[]'),
        recommended_action_tags: ['plantag:escalate:god_factory', 'buildtag:investigate:systemic_failure'],
        pattern_id: p.pattern_id,
        flagged_to_god_factory: true,
      });
      reports.push(report);
    }

    // ── 3. Debt Analysis ──────────────────────────────────────────────────
    const debtSummary = this.debt.computeAll(cycle_id);

    if (debtSummary.health_warning) {
      const report = this.buildReport({
        session_id, cycle_range, gap_category: 'process',
        severity: 'warning',
        affected_tags: ['devtag:codebase_health'],
        affected_agents: [],
        affected_files: debtSummary.scores.filter(s => s.ceiling_exceeded).map(s => s.file_path),
        forensic_entry_ids: [],
        recommended_action_tags: ['plantag:address:technical_debt'],
        flagged_to_god_factory: debtSummary.total_normalized > 0.5,
      });
      reports.push(report);
    }

    // ── 4. Tag System Analysis ────────────────────────────────────────────
    const tagAnalysis = this.tagSystem.runAll(project_root, cycle_id);

    if (tagAnalysis.collisions.length > 0) {
      const report = this.buildReport({
        session_id, cycle_range, gap_category: 'tag_system',
        severity: 'warning',
        affected_tags: tagAnalysis.collisions.map(c => c.devtag_name),
        affected_agents: [],
        affected_files: [...new Set([
          ...tagAnalysis.collisions.map(c => c.file_a),
          ...tagAnalysis.collisions.map(c => c.file_b),
        ])],
        forensic_entry_ids: tagAnalysis.collisions.map(c => c.entry_id),
        recommended_action_tags: ['plantag:resolve:tag_collision'],
      });
      reports.push(report);
    }

    if (tagAnalysis.resolution_latency_flags.length > 0) {
      const report = this.buildReport({
        session_id, cycle_range, gap_category: 'tag_system',
        severity: 'info',
        affected_tags: tagAnalysis.resolution_latency_flags.map(r => r.tag_type),
        affected_agents: [],
        affected_files: [],
        forensic_entry_ids: [],
        recommended_action_tags: ['plantag:optimize:tag_resolution_index'],
      });
      reports.push(report);
    }

    // ── 5. Agent Performance Analysis ────────────────────────────────────
    const perfSummary = this.agentPerf.getPerformanceSummary(cycle_id);

    if (perfSummary.flagged_for_review.length > 0) {
      const report = this.buildReport({
        session_id, cycle_range, gap_category: 'agent_performance',
        severity: 'warning',
        affected_tags: [],
        affected_agents: perfSummary.flagged_for_review,
        affected_files: [],
        forensic_entry_ids: perfSummary.low_conformance.map(r => r.entry_id),
        recommended_action_tags: ['plantag:review:agent_performance', 'buildtag:reassign:model_tier'],
        flagged_to_god_factory: perfSummary.flagged_for_review.length > 3,
      });
      reports.push(report);
    }

    // ── Persist all gap reports ───────────────────────────────────────────
    this.persistReports(reports);

    return {
      session_id,
      cycle_range,
      reports,
      coverage_summary: coverageMatrix.summary,
      pattern_crawl: { ...patternCrawl, anti_patterns: patternCrawl.anti_patterns },
      debt_summary: {
        total_normalized: debtSummary.total_normalized,
        health_warning: debtSummary.health_warning,
        files_exceeding_ceiling: debtSummary.scores.filter(s => s.ceiling_exceeded).length,
      },
      tag_analysis: {
        vocabulary_gaps: tagAnalysis.vocabulary.length,
        collisions: tagAnalysis.collisions.length,
        utilization: tagAnalysis.utilization,
        slow_resolution_types: tagAnalysis.resolution_latency_flags.length,
      },
      performance_summary: {
        total_agents: perfSummary.total_agents,
        flagged: perfSummary.flagged_for_review,
        low_conformance_count: perfSummary.low_conformance.length,
        high_escalation_count: perfSummary.high_escalation.length,
      },
      flagged_to_god_factory: reports.filter(r => r.flagged_to_god_factory).length,
      total_reports: reports.length,
    };
  }

  /** Run coverage check after a committed build step */
  runPostCommitCoverageCheck(commit_id: string, affected_plantag_ids: string[]): {
    all_checked: boolean;
    results: ReturnType<CoverageAnalysisAgent['checkCoverage']>[];
  } {
    const results = affected_plantag_ids.map(id => this.coverage.checkCoverage(id));
    return {
      all_checked: results.length === affected_plantag_ids.length,
      results,
    };
  }

  /** Get all gap reports from DB */
  getReports(opts: {
    session_id?: string;
    gap_category?: GapCategory;
    flagged_only?: boolean;
    limit?: number;
  } = {}): GapReport[] {
    let q = 'SELECT * FROM gap_reports WHERE 1=1';
    const params: any[] = [];
    if (opts.session_id) { q += ' AND session_id = ?'; params.push(opts.session_id); }
    if (opts.gap_category) { q += ' AND gap_category = ?'; params.push(opts.gap_category); }
    if (opts.flagged_only) { q += ' AND flagged_to_god_factory = 1'; }
    q += ` ORDER BY timestamp DESC LIMIT ${opts.limit ?? 200}`;

    return (this.db.prepare(q).all(...params) as any[]).map(r => ({
      ...r,
      cycle_range: [r.cycle_range_start, r.cycle_range_end] as [number, number],
      affected_tags: JSON.parse(r.affected_tags ?? '[]'),
      affected_agents: JSON.parse(r.affected_agents ?? '[]'),
      affected_files: JSON.parse(r.affected_files ?? '[]'),
      recommended_action_tags: JSON.parse(r.recommended_action_tags ?? '[]'),
      forensic_entry_ids: JSON.parse(r.forensic_entry_ids ?? '[]'),
      flagged_to_god_factory: !!r.flagged_to_god_factory,
    }));
  }

  /** Get latest summary counts for each gap category */
  getSummary(): Record<string, number> & {
    god_factory_flags: number;
    total_reports: number;
    latest_coverage_pct: number;
    total_debt_score: number;
    pattern_count: number;
  } {
    const counts: any = {};
    for (const cat of ['coverage', 'structural', 'process', 'tag_system', 'agent_performance']) {
      counts[cat] = (this.db.prepare(
        `SELECT COUNT(*) as c FROM gap_reports WHERE gap_category = ?`
      ).get(cat) as any)?.c ?? 0;
    }

    counts.god_factory_flags = (this.db.prepare(
      `SELECT COUNT(*) as c FROM gap_reports WHERE flagged_to_god_factory = 1`
    ).get() as any)?.c ?? 0;

    counts.total_reports = (this.db.prepare(
      `SELECT COUNT(*) as c FROM gap_reports`
    ).get() as any)?.c ?? 0;

    counts.pattern_count = (this.db.prepare(
      `SELECT COUNT(*) as c FROM patterns`
    ).get() as any)?.c ?? 0;

    // Latest coverage percent
    const lastCoverage = this.db.prepare(
      `SELECT AVG(coverage_percent) as avg FROM coverage_matrix WHERE scope = 'total' ORDER BY timestamp DESC LIMIT 10`
    ).get() as any;
    counts.latest_coverage_pct = lastCoverage?.avg ? Math.round(lastCoverage.avg * 10) / 10 : 0;

    // Total debt score
    const debtRow = this.db.prepare(`
      SELECT SUM(dh.debt_score) as total FROM debt_history dh
      INNER JOIN (SELECT file_path, MAX(rowid) as mr FROM debt_history GROUP BY file_path) l
        ON dh.file_path = l.file_path AND dh.rowid = l.mr
    `).get() as any;
    counts.total_debt_score = debtRow?.total ?? 0;

    return counts;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private buildReport(opts: {
    session_id: string;
    cycle_range: [number, number];
    gap_category: GapCategory;
    severity: Severity;
    affected_tags: string[];
    affected_agents: string[];
    affected_files: string[];
    forensic_entry_ids: string[];
    recommended_action_tags: string[];
    pattern_id?: string | null;
    flagged_to_god_factory?: boolean;
  }): GapReport {
    const SEV_RANK = { info: 0, warning: 1, error: 2, critical: 3, fatal: 4 };
    const flagged = opts.flagged_to_god_factory ??
      (SEV_RANK[opts.severity] >= SEV_RANK['critical']);

    return {
      report_id: uuid(),
      cycle_range: opts.cycle_range,
      session_id: opts.session_id,
      gap_category: opts.gap_category,
      affected_tags: opts.affected_tags.slice(0, 50),
      affected_agents: opts.affected_agents.slice(0, 20),
      affected_files: opts.affected_files.slice(0, 20),
      severity: opts.severity,
      pattern_id: opts.pattern_id ?? null,
      recommended_action_tags: opts.recommended_action_tags,
      forensic_entry_ids: opts.forensic_entry_ids.slice(0, 100),
      flagged_to_god_factory: flagged,
      timestamp: new Date().toISOString(),
    };
  }

  private persistReports(reports: GapReport[]) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO gap_reports
        (report_id, cycle_range_start, cycle_range_end, session_id, gap_category,
         affected_tags, affected_agents, affected_files, severity, pattern_id,
         recommended_action_tags, forensic_entry_ids, flagged_to_god_factory)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const tx = this.db.transaction(() => {
      for (const r of reports) {
        stmt.run(
          r.report_id, r.cycle_range[0], r.cycle_range[1], r.session_id, r.gap_category,
          JSON.stringify(r.affected_tags), JSON.stringify(r.affected_agents),
          JSON.stringify(r.affected_files), r.severity, r.pattern_id,
          JSON.stringify(r.recommended_action_tags), JSON.stringify(r.forensic_entry_ids),
          r.flagged_to_god_factory ? 1 : 0
        );
      }
    });
    tx();
  }
}
