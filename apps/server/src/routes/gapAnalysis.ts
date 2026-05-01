// ============================================
// Gap Analysis Routes
// REST API for all gap analysis agents, tools,
// and forensic table reads.
// Registered at /api/gap
// ============================================
import { FastifyInstance, FastifyRequest } from 'fastify';
import { safeRoute } from '../plugins/safeRoute.js';
import { GapAnalysisAgent } from '../services/gapAnalysis/index.js';
import { CoverageAnalysisAgent } from '../services/gapAnalysis/coverageAnalysis.js';
import { PatternRecognitionAgent } from '../services/gapAnalysis/patternRecognition.js';
import { DebtTrackingAgent } from '../services/gapAnalysis/debtTracking.js';
import { TagSystemAnalysisAgent } from '../services/gapAnalysis/tagSystemAnalysis.js';
import { AgentPerformanceAnalysisAgent } from '../services/gapAnalysis/agentPerformance.js';
import { GapAnalysisTools } from '../services/gapAnalysis/tools.js';

export async function gapAnalysisRoutes(app: FastifyInstance) {
  const db = (app as any).db;
  const gapAgent = new GapAnalysisAgent(db);
  const coverage = new CoverageAnalysisAgent(db);
  const patterns = new PatternRecognitionAgent(db);
  const debt = new DebtTrackingAgent(db);
  const tagSystem = new TagSystemAnalysisAgent(db);
  const agentPerf = new AgentPerformanceAnalysisAgent(db);
  const tools = new GapAnalysisTools(db);

  // ── Summary ───────────────────────────────────────────────────────────────

  app.get('/summary', safeRoute(async () => {
    return gapAgent.getSummary();
  }));

  // ── Full Analysis Run ─────────────────────────────────────────────────────

  /**
   * POST /api/gap/run
   * Trigger a full gap analysis pass.
   * Body: { session_id, cycle_range: [start, end], project_root? }
   */
  app.post('/run', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    const session_id = body.session_id ?? `session_${Date.now()}`;
    const cycle_range: [number, number] = body.cycle_range ?? [0, 1];
    const project_root = body.project_root;
    return gapAgent.runFullAnalysis({ session_id, cycle_range, project_root });
  }));

  // ── Gap Reports ───────────────────────────────────────────────────────────

  app.get('/reports', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    const reports = gapAgent.getReports({
      session_id: q.session_id,
      gap_category: q.gap_category,
      flagged_only: q.flagged_only === 'true',
      limit: q.limit ? parseInt(q.limit) : 100,
    });
    return { reports };
  }));

  // ── Coverage Analysis ─────────────────────────────────────────────────────

  /**
   * POST /api/gap/coverage/run
   * Run coverage analysis for a cycle.
   * Body: { cycle_id }
   */
  app.post('/coverage/run', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    const cycle_id = body.cycle_id ?? String(Date.now());
    return coverage.run(cycle_id);
  }));

  /**
   * GET /api/gap/coverage
   * Query current coverage matrix.
   * ?scope=plan|test|nano|total
   */
  app.get('/coverage', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    const records = coverage.getMatrix(q.scope, q.phase_filter);
    const total = records.length;
    const covered = records.filter(r => r.coverage_state === 'covered').length;
    return {
      records,
      stats: {
        total,
        covered,
        partial: records.filter(r => r.coverage_state === 'partial').length,
        missing: records.filter(r => r.coverage_state === 'missing').length,
        pct: total > 0 ? Math.round((covered / total) * 1000) / 10 : 100,
      },
    };
  }));

  /**
   * GET /api/gap/coverage/check/:plantag_id
   * Coverage check for a single plantag.
   */
  app.get('/coverage/check/:plantag_id', safeRoute(async (req: FastifyRequest) => {
    const { plantag_id } = req.params as any;
    return coverage.checkCoverage(plantag_id);
  }));

  // ── Pattern Recognition ───────────────────────────────────────────────────

  /**
   * POST /api/gap/patterns/crawl
   * Run pattern recognition crawl.
   * Body: { current_cycle }
   */
  app.post('/patterns/crawl', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    const current_cycle = parseInt(body.current_cycle ?? '1');
    return patterns.crawl(current_cycle);
  }));

  /**
   * GET /api/gap/patterns
   * Query patterns with optional filters.
   */
  app.get('/patterns', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    const results = patterns.queryPatterns({
      failure_type: q.failure_type,
      devtag_type: q.devtag_type,
      agent_category: q.agent_category,
      build_phase: q.build_phase,
      min_recurrence: q.min_recurrence ? parseInt(q.min_recurrence) : undefined,
      anti_pattern_only: q.anti_pattern_only === 'true',
    });
    return { patterns: results, total: results.length };
  }));

  /**
   * GET /api/gap/patterns/:pattern_id/trend?cycle_window=N
   */
  app.get('/patterns/:pattern_id/trend', safeRoute(async (req: FastifyRequest) => {
    const { pattern_id } = req.params as any;
    const q = req.query as any;
    return patterns.getPatternTrend(pattern_id, parseInt(q.cycle_window ?? '10'));
  }));

  // ── Debt Tracking ─────────────────────────────────────────────────────────

  /**
   * POST /api/gap/debt/compute
   * Compute debt for all active files.
   * Body: { cycle_id? }
   */
  app.post('/debt/compute', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    const cycle_id = body.cycle_id ?? String(Date.now());
    return debt.computeAll(cycle_id);
  }));

  /**
   * GET /api/gap/debt/score?file_path=...
   */
  app.get('/debt/score', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    if (!q.file_path) return { error: 'file_path required' };
    return debt.computeDebtScore(q.file_path, q.cycle_id ?? String(Date.now()));
  }));

  /**
   * GET /api/gap/debt/heatmap?threshold=N
   */
  app.get('/debt/heatmap', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    const threshold = q.threshold ? parseFloat(q.threshold) : 15;
    return { files: debt.heatmap(threshold) };
  }));

  /**
   * GET /api/gap/debt/history?file_path=...
   */
  app.get('/debt/history', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    if (!q.file_path) return { error: 'file_path required' };
    return { history: debt.getHistory(q.file_path, q.limit ? parseInt(q.limit) : 20) };
  }));

  // ── Tag System Analysis ───────────────────────────────────────────────────

  /**
   * POST /api/gap/tag-system/run
   * Run all four tag system analyses.
   * Body: { project_root?, cycle_id? }
   */
  app.post('/tag-system/run', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    const project_root = body.project_root ?? process.cwd();
    const cycle_id = body.cycle_id ?? String(Date.now());
    return tagSystem.runAll(project_root, cycle_id);
  }));

  /**
   * GET /api/gap/tag-system/vocabulary-gaps?resolved=false
   */
  app.get('/tag-system/vocabulary-gaps', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    return { gaps: tagSystem.getVocabularyGaps(q.resolved === 'true') };
  }));

  /**
   * POST /api/gap/tag-system/vocabulary-gaps/:entry_id/resolve
   */
  app.post('/tag-system/vocabulary-gaps/:entry_id/resolve', safeRoute(async (req: FastifyRequest) => {
    const { entry_id } = req.params as any;
    tagSystem.resolveVocabularyGap(entry_id);
    return { ok: true };
  }));

  /**
   * GET /api/gap/tag-system/collisions?resolved=false
   */
  app.get('/tag-system/collisions', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    return { collisions: tagSystem.getCollisions(q.resolved === 'true') };
  }));

  /**
   * POST /api/gap/tag-system/collisions/:entry_id/resolve
   */
  app.post('/tag-system/collisions/:entry_id/resolve', safeRoute(async (req: FastifyRequest) => {
    const { entry_id } = req.params as any;
    tagSystem.resolveCollision(entry_id);
    return { ok: true };
  }));

  /**
   * GET /api/gap/tag-system/utilization
   */
  app.get('/tag-system/utilization', safeRoute(async () => {
    return tagSystem.analyzeUtilization();
  }));

  /**
   * GET /api/gap/tag-system/resolution-latency?tag_type=...&model_tier=...
   */
  app.get('/tag-system/resolution-latency', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    return tagSystem.getResolutionLatencyReport(q.tag_type ?? '*', q.model_tier ?? '*') ?? { message: 'No data' };
  }));

  /**
   * GET /api/gap/tag-system/slow-resolutions
   * Returns all tag types with average resolution > 200ms
   */
  app.get('/tag-system/slow-resolutions', safeRoute(async () => {
    return { flags: tagSystem.analyzeResolutionPerformance() };
  }));

  /**
   * GET /api/gap/tag-system/vocab-diff?cycle_a=...&cycle_b=...
   */
  app.get('/tag-system/vocab-diff', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    return tagSystem.vocabularyDiff(q.cycle_a ?? '', q.cycle_b ?? new Date().toISOString());
  }));

  // ── Agent Performance ─────────────────────────────────────────────────────

  /**
   * POST /api/gap/performance/compute
   * Compute metrics for all agents in a cycle.
   * Body: { cycle_id }
   */
  app.post('/performance/compute', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    const cycle_id = body.cycle_id ?? String(Date.now());
    const metrics = agentPerf.computeAllForCycle(cycle_id);
    return { metrics, cycle_id };
  }));

  /**
   * GET /api/gap/performance/summary?cycle_id=...
   */
  app.get('/performance/summary', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    return agentPerf.getPerformanceSummary(q.cycle_id);
  }));

  /**
   * GET /api/gap/performance/latest
   * Latest metrics for all agents.
   */
  app.get('/performance/latest', safeRoute(async () => {
    return { agents: agentPerf.getLatestAllAgents() };
  }));

  /**
   * GET /api/gap/performance/:agent_id/report?cycle_start=...&cycle_end=...
   */
  app.get('/performance/:agent_id/report', safeRoute(async (req: FastifyRequest) => {
    const { agent_id } = req.params as any;
    const q = req.query as any;
    return agentPerf.getConformanceReport(
      agent_id,
      q.cycle_start ?? '0',
      q.cycle_end ?? String(Date.now())
    );
  }));

  // ── Gap Analysis Tools (deterministic) ───────────────────────────────────

  /**
   * POST /api/gap/tools/gap-scan
   * Body: { scope, depth?, tag_filter? }
   */
  app.post('/tools/gap-scan', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    const results = tools.gap_scan(body.scope ?? 'total', body.depth ?? 1, body.tag_filter);
    return { gaps: results, total: results.length };
  }));

  /**
   * GET /api/gap/tools/coverage-check/:plantag_id
   */
  app.get('/tools/coverage-check/:plantag_id', safeRoute(async (req: FastifyRequest) => {
    const { plantag_id } = req.params as any;
    return tools.coverage_check(plantag_id);
  }));

  /**
   * GET /api/gap/tools/debt-score?file_path=...
   */
  app.get('/tools/debt-score', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    if (!q.file_path) return { error: 'file_path required' };
    return tools.debt_score(q.file_path, q.cycle_id);
  }));

  /**
   * POST /api/gap/tools/pattern-query
   * Body: { forensic_table, signature_filter, min_recurrence? }
   */
  app.post('/tools/pattern-query', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    return { patterns: tools.pattern_query(body.forensic_table, body.signature_filter ?? {}, body.min_recurrence ?? 3) };
  }));

  /**
   * GET /api/gap/tools/regression-index/:devtag
   */
  app.get('/tools/regression-index/:devtag', safeRoute(async (req: FastifyRequest) => {
    const { devtag } = req.params as any;
    return tools.regression_index(devtag);
  }));

  /**
   * GET /api/gap/tools/orphan-scan?scope=total
   */
  app.get('/tools/orphan-scan', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    return tools.orphan_scan(q.scope ?? 'total');
  }));

  /**
   * POST /api/gap/tools/conflict-scan
   * Body: { devtag_list: string[] }
   */
  app.post('/tools/conflict-scan', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    return { results: tools.conflict_scan(body.devtag_list ?? []) };
  }));

  /**
   * POST /api/gap/tools/gap-report
   * Body: { agent_id, cycle_range: [start, end], session_id? }
   */
  app.post('/tools/gap-report', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    return { reports: tools.gap_report(body.agent_id, body.cycle_range ?? [0, 1], body.session_id) };
  }));

  /**
   * GET /api/gap/tools/tag-vocab-diff?cycle_a=...&cycle_b=...
   */
  app.get('/tools/tag-vocab-diff', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    return tools.tag_vocabulary_diff(q.cycle_a ?? '', q.cycle_b ?? new Date().toISOString());
  }));

  /**
   * GET /api/gap/tools/coverage-matrix?scope=...&phase_filter=...
   */
  app.get('/tools/coverage-matrix', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    return { matrix: tools.coverage_matrix(q.scope ?? 'total', q.phase_filter) };
  }));

  /**
   * GET /api/gap/tools/debt-heatmap?threshold=N
   */
  app.get('/tools/debt-heatmap', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    return { heatmap: tools.debt_heatmap(q.threshold ? parseFloat(q.threshold) : 15) };
  }));

  /**
   * GET /api/gap/tools/pattern-trend/:pattern_id?cycle_window=N
   */
  app.get('/tools/pattern-trend/:pattern_id', safeRoute(async (req: FastifyRequest) => {
    const { pattern_id } = req.params as any;
    const q = req.query as any;
    return tools.pattern_trend(pattern_id, parseInt(q.cycle_window ?? '10'));
  }));

  /**
   * GET /api/gap/tools/conformance-report/:agent_id?cycle_start=...&cycle_end=...
   */
  app.get('/tools/conformance-report/:agent_id', safeRoute(async (req: FastifyRequest) => {
    const { agent_id } = req.params as any;
    const q = req.query as any;
    return tools.agent_conformance_report(
      agent_id,
      q.cycle_start ?? '0',
      q.cycle_end ?? String(Date.now())
    );
  }));

  /**
   * GET /api/gap/tools/resolution-latency?tag_type=...&model_tier=...
   */
  app.get('/tools/resolution-latency', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    return tools.resolution_latency_report(q.tag_type ?? '*', q.model_tier ?? '*') ?? { message: 'No data' };
  }));

  // ── Post-commit coverage hook ─────────────────────────────────────────────

  /**
   * POST /api/gap/post-commit-check
   * Body: { commit_id, affected_plantag_ids: string[] }
   */
  app.post('/post-commit-check', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    return gapAgent.runPostCommitCoverageCheck(
      body.commit_id ?? '',
      body.affected_plantag_ids ?? []
    );
  }));
}
