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
import { callWithFallback } from '../llm/unifiedFallback.js';

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
  llm_enrichment?: {
    executiveSummary: string;
    topPriorities: string[];
    suggestedFiles: string[];
    modelUsed: string;
  } | null;
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

    // ── Crawler Supervisor: run all 5 sub-analyses concurrently with allSettled ──
    // Fault model:
    //   • Any individual failure → degrade gracefully, log warning, continue
    //   • No single crawler failure aborts the full analysis
    // The one exception (mirroring the WAITING state logic) is that if ALL
    // crawlers fail, we return an empty result rather than garbage.
    const TIMEOUT_MS = 30_000;
    const withTimeout = <T>(p: Promise<T>, label: string): Promise<T> => {
      return Promise.race([
        p,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`${label} timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
        ),
      ]);
    };

    const [coverageResult, patternResult, debtResult, tagResult, perfResult] = await Promise.allSettled([
      withTimeout(Promise.resolve().then(() => this.coverage.run(cycle_id)), 'CoverageAnalysis'),
      withTimeout(Promise.resolve().then(() => this.patterns.crawl(cycle_range[1])), 'PatternRecognition'),
      withTimeout(Promise.resolve().then(() => this.debt.computeAll(cycle_id)), 'DebtTracking'),
      withTimeout(Promise.resolve().then(() => this.tagSystem.runAll(project_root, cycle_id)), 'TagSystemAnalysis'),
      withTimeout(Promise.resolve().then(() => this.agentPerf.getPerformanceSummary(cycle_id)), 'AgentPerformance'),
    ]);

    const successCount = [coverageResult, patternResult, debtResult, tagResult, perfResult].filter(r => r.status === 'fulfilled').length;
    if (successCount === 0) {
      // All crawlers failed — return empty result rather than corrupt data
      return { session_id, cycle_range, reports: [], coverage_summary: null, pattern_crawl: null, debt_summary: null, tag_analysis: null, performance_summary: null, flagged_to_god_factory: 0, total_reports: 0 };
    }

    // Log degraded crawlers
    const crawlerNames = ['CoverageAnalysis', 'PatternRecognition', 'DebtTracking', 'TagSystemAnalysis', 'AgentPerformance'];
    [coverageResult, patternResult, debtResult, tagResult, perfResult].forEach((r, i) => {
      if (r.status === 'rejected') {
        try {
          this.db.prepare(
            "INSERT INTO notification_queue (notification_id, severity, category, natural_language_summary, timestamp) VALUES (?, 'warning', 'gap_analysis', ?, datetime('now'))"
          ).run(
            require('crypto').randomUUID(),
            `Gap Analysis: ${crawlerNames[i]} failed — ${(r as PromiseRejectedResult).reason?.message || 'unknown error'}. Analysis proceeding with degraded data.`
          );
        } catch { /* non-critical */ }
      }
    });

    const coverageMatrix = coverageResult.status === 'fulfilled' ? coverageResult.value : null;
    const patternCrawl  = patternResult.status  === 'fulfilled' ? patternResult.value  : null;
    const debtSummary   = debtResult.status     === 'fulfilled' ? debtResult.value     : null;
    const tagAnalysis   = tagResult.status      === 'fulfilled' ? tagResult.value      : null;
    const perfSummary   = perfResult.status     === 'fulfilled' ? perfResult.value     : null;

    // ── 1. Coverage Analysis ──────────────────────────────────────────────
    if (coverageMatrix) {
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
    }

    // ── 2. Pattern Recognition ────────────────────────────────────────────
    if (patternCrawl) {
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
    }

    // ── 3. Debt Analysis ──────────────────────────────────────────────────
    if (debtSummary?.health_warning) {
      const report = this.buildReport({
        session_id, cycle_range, gap_category: 'process',
        severity: 'warning',
        affected_tags: ['devtag:codebase_health'],
        affected_agents: [],
        affected_files: debtSummary.scores.filter((s: any) => s.ceiling_exceeded).map((s: any) => s.file_path),
        forensic_entry_ids: [],
        recommended_action_tags: ['plantag:address:technical_debt'],
        flagged_to_god_factory: debtSummary.total_normalized > 0.5,
      });
      reports.push(report);
    }

    // ── 4. Tag System Analysis ────────────────────────────────────────────
    if (tagAnalysis) {
      if (tagAnalysis.collisions.length > 0) {
        const report = this.buildReport({
          session_id, cycle_range, gap_category: 'tag_system',
          severity: 'warning',
          affected_tags: tagAnalysis.collisions.map((c: any) => c.devtag_name),
          affected_agents: [],
          affected_files: [...new Set([
            ...tagAnalysis.collisions.map((c: any) => c.file_a),
            ...tagAnalysis.collisions.map((c: any) => c.file_b),
          ])] as string[],
          forensic_entry_ids: tagAnalysis.collisions.map((c: any) => c.entry_id),
          recommended_action_tags: ['plantag:resolve:tag_collision'],
        });
        reports.push(report);
      }

      if (tagAnalysis.resolution_latency_flags.length > 0) {
        const report = this.buildReport({
          session_id, cycle_range, gap_category: 'tag_system',
          severity: 'info',
          affected_tags: tagAnalysis.resolution_latency_flags.map((r: any) => r.tag_type),
          affected_agents: [],
          affected_files: [],
          forensic_entry_ids: [],
          recommended_action_tags: ['plantag:optimize:tag_resolution_index'],
        });
        reports.push(report);
      }
    }

    // ── 5. Agent Performance Analysis ────────────────────────────────────
    if (perfSummary && (perfSummary.flagged_for_review?.length ?? 0) > 0) {
      const report = this.buildReport({
        session_id, cycle_range, gap_category: 'agent_performance',
        severity: 'warning',
        affected_tags: [],
        affected_agents: perfSummary.flagged_for_review,
        affected_files: [],
        forensic_entry_ids: (perfSummary.low_conformance ?? []).map((r: any) => r.entry_id),
        recommended_action_tags: ['plantag:review:agent_performance', 'buildtag:reassign:model_tier'],
        flagged_to_god_factory: (perfSummary.flagged_for_review?.length ?? 0) > 3,
      });
      reports.push(report);
    }

    // ── Persist all gap reports ───────────────────────────────────────────
    this.persistReports(reports);

    // ── LLM Semantic Enrichment ───────────────────────────────────────────
    // Use a real LLM to produce a ranked, actionable summary with rationale.
    // This upgrades the SQL-only sub-agents with semantic understanding.
    let llmEnrichment: {
      executiveSummary: string;
      topPriorities: string[];
      suggestedFiles: string[];
      modelUsed: string;
    } | null = null;

    if (reports.length > 0) {
      try {
        const reportSummary = reports.slice(0, 10).map(r =>
          `[${r.severity.toUpperCase()}] ${r.gap_category}: ${r.recommended_action_tags.join(', ')} — affects: ${[...r.affected_files, ...r.affected_tags].slice(0, 3).join(', ')}`
        ).join('\n');

        const llmResult = await callWithFallback({
          db: this.db,
          chainKey: 'crawler',
          taskType: 'gap_analysis_enrichment',
          maxTokens: 300,
          messages: [{
            role: 'system',
            content: 'You are a code quality analyst. Given gap analysis findings, produce a concise executive summary, top 3 priorities, and list of specific files/modules to address first.',
          }, {
            role: 'user',
            content: `Gap analysis findings for cycles ${cycle_range[0]}-${cycle_range[1]}:\n${reportSummary}\n\nRespond with JSON: {"executiveSummary": "...", "topPriorities": ["...", "...", "..."], "suggestedFiles": ["..."]}`,
          }],
        });

        const parsed = JSON.parse(llmResult.content.replace(/^```json\n?|\n?```$/g, '').trim());
        llmEnrichment = {
          executiveSummary: parsed.executiveSummary ?? '',
          topPriorities: parsed.topPriorities ?? [],
          suggestedFiles: parsed.suggestedFiles ?? [],
          modelUsed: llmResult.modelId,
        };

        // Store enrichment in app_kv
        this.db.prepare("INSERT OR REPLACE INTO app_kv (key, value, updated_at) VALUES ('gap_analysis:llm_enrichment', ?, datetime('now'))")
          .run(JSON.stringify({ ...llmEnrichment, session_id, cycle_range, timestamp: new Date().toISOString() }));
      } catch { /* LLM enrichment is non-critical — SQL analysis results are still valid */ }
    }

    return {
      session_id,
      cycle_range,
      reports,
      coverage_summary: coverageMatrix?.summary ?? null,
      pattern_crawl: patternCrawl ? { ...patternCrawl, anti_patterns: patternCrawl.anti_patterns } : null,
      debt_summary: debtSummary ? {
        total_normalized: debtSummary.total_normalized,
        health_warning: debtSummary.health_warning,
        files_exceeding_ceiling: debtSummary.scores.filter((s: any) => s.ceiling_exceeded).length,
      } : null,
      tag_analysis: tagAnalysis ? {
        vocabulary_gaps: tagAnalysis.vocabulary.length,
        collisions: tagAnalysis.collisions.length,
        utilization: tagAnalysis.utilization,
        slow_resolution_types: tagAnalysis.resolution_latency_flags.length,
      } : null,
      performance_summary: perfSummary ? {
        total_agents: perfSummary.total_agents,
        flagged: perfSummary.flagged_for_review,
        low_conformance_count: perfSummary.low_conformance.length,
        high_escalation_count: perfSummary.high_escalation.length,
      } : null,
      flagged_to_god_factory: reports.filter(r => r.flagged_to_god_factory).length,
      total_reports: reports.length,
      llm_enrichment: llmEnrichment,
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
