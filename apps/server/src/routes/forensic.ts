// ============================================
// Forensic Routes
// Read-only access to all forensic tables.
// Used by the GUI Forensic Panel.
// ============================================
import { FastifyInstance, FastifyRequest } from 'fastify';
import { safeRoute } from '../plugins/safeRoute.js';
import { TagRegistryService } from '../services/tagRegistry/index.js';
import { RegressionSubAgent } from '../services/agent/subagents/regression.js';
import { DeadTagSubAgent } from '../services/agent/subagents/deadTag.js';
import { IntegrationVerificationSubAgent } from '../services/agent/subagents/integrationVerification.js';
import { DiffSubAgent } from '../services/agent/subagents/diff.js';
import { VersionControlAgent } from '../services/agent/persistent/versionControl.js';
import { RegressionAgent } from '../services/agent/persistent/regressionAgent.js';
import { NanoLiaisonAgent } from '../services/agent/persistent/nanoLiaison.js';
import { SeverityEscalationService } from '../services/severityEscalation/index.js';

export async function forensicRoutes(app: FastifyInstance) {
  const db = (app as any).db;
  const registry = new TagRegistryService(db);
  const regressionSubAgent = new RegressionSubAgent(db, registry);
  const deadTagSubAgent = new DeadTagSubAgent(db, registry);
  const integrationAgent = new IntegrationVerificationSubAgent(db, registry);
  const diffAgent = new DiffSubAgent(db, registry);
  const versionControl = new VersionControlAgent(db, registry);
  const regressionAgent = new RegressionAgent(db, registry);
  const nanoLiaison = new NanoLiaisonAgent(db, registry);
  const severityEscalation = new SeverityEscalationService(db);

  // ── regression_history ──────────────────

  app.get('/regressions', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    const entries = regressionSubAgent.getHistory({
      devtag: q.devtag,
      cycle_id: q.cycle_id,
      limit: q.limit ? parseInt(q.limit) : 100,
    });
    return { entries };
  }));

  // ── conflict_log ────────────────────────

  app.get('/conflicts', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    let query = 'SELECT * FROM conflict_log WHERE 1=1';
    const params: any[] = [];
    if (q.agent_id) { query += ' AND (claiming_agent_id = ? OR blocked_agent_id = ?)'; params.push(q.agent_id, q.agent_id); }
    if (q.resolution) { query += ' AND resolution = ?'; params.push(q.resolution); }
    query += ' ORDER BY created_at DESC LIMIT 200';
    const entries = db.prepare(query).all(...params);
    return { entries };
  }));

  // ── dead_tags ───────────────────────────

  app.get('/dead-tags', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    const resolved = q.resolved !== undefined ? q.resolved === 'true' : undefined;
    const entries = deadTagSubAgent.getDeadTags({ resolved });
    return { entries };
  }));

  app.post('/dead-tags/scan', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    const result = await deadTagSubAgent.scan({
      project_id: body.project_id,
      current_cycle: body.current_cycle ?? 0,
    });
    return result;
  }));

  app.post('/dead-tags/:devtag/resolve', safeRoute(async (req: FastifyRequest) => {
    const { devtag } = req.params as { devtag: string };
    const resolved = deadTagSubAgent.resolveDeadTag(decodeURIComponent(devtag));
    return { resolved };
  }));

  // ── diff_failures ───────────────────────

  app.get('/diff-failures', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    let query = 'SELECT * FROM diff_failures WHERE 1=1';
    const params: any[] = [];
    if (q.cycle_id) { query += ' AND cycle_id = ?'; params.push(q.cycle_id); }
    if (q.agent_id) { query += ' AND agent_id = ?'; params.push(q.agent_id); }
    query += ' ORDER BY created_at DESC LIMIT 100';
    const entries = db.prepare(query).all(...params);
    return { entries };
  }));

  // ── Diff Sub-Agent evaluate ──────────────

  app.post('/diff/evaluate', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    const result = await diffAgent.evaluate({
      buildtag_ids: body.buildtag_ids ?? [],
      plantag_id: body.plantag_id,
      cycle_id: body.cycle_id,
      agent_id: body.agent_id,
    });
    return result;
  }));

  app.post('/diff/promote', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    diffAgent.promotePartition(body.cycle_id);
    return { success: true };
  }));

  app.post('/diff/discard', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    diffAgent.discardPartition(body.cycle_id);
    return { success: true };
  }));

  // ── integration_failures ────────────────

  app.get('/integration-failures', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    const entries = integrationAgent.getFailures({
      cycle_id: q.cycle_id,
      severity: q.severity,
      limit: q.limit ? parseInt(q.limit) : 100,
    });
    return { entries };
  }));

  app.post('/integration/verify', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    const result = await integrationAgent.verify({
      modified_devtag_ids: body.modified_devtag_ids ?? [],
      cycle_id: body.cycle_id,
      agent_id: body.agent_id,
      build_step_id: body.build_step_id,
    });
    return result;
  }));

  // ── version_commits ─────────────────────

  app.get('/version-commits', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    const reverted = q.reverted !== undefined ? q.reverted === 'true' : undefined;
    const commits = versionControl.listCommits({
      agent_id: q.agent_id,
      reverted,
      limit: q.limit ? parseInt(q.limit) : 50,
    });
    return { commits };
  }));

  app.get('/version-commits/:commit_id', safeRoute(async (req: FastifyRequest) => {
    const { commit_id } = req.params as { commit_id: string };
    const commit = versionControl.getCommit(commit_id);
    return { commit };
  }));

  app.post('/version-commits', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    const commit_id = versionControl.recordCommit({
      buildtag_ids: body.buildtag_ids ?? [],
      modified_devtag_ids: body.modified_devtag_ids ?? [],
      devtag_state_before: body.devtag_state_before ?? {},
      plantags_satisfied: body.plantags_satisfied ?? [],
      agent_id: body.agent_id,
    });
    return { commit_id };
  }));

  app.post('/version-commits/:commit_id/revert', safeRoute(async (req: FastifyRequest) => {
    const { commit_id } = req.params as { commit_id: string };
    const body = req.body as any;
    const result = versionControl.revertToCommit(commit_id, body.invoking_agent_id ?? 'user');
    return result;
  }));

  // ── nano_anomalies ──────────────────────

  app.get('/nano-anomalies', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    const entries = nanoLiaison.getAnomalyHistory({
      cycle_id: q.cycle_id,
      anomaly_type: q.anomaly_type,
      limit: q.limit ? parseInt(q.limit) : 100,
    });
    return { entries };
  }));

  app.post('/nano/check-anomalies', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    const anomalies = nanoLiaison.checkForAnomalies({
      cycle_id: body.cycle_id,
      generation_id: body.generation_id,
      agent_id: body.agent_id,
      weights: body.weights,
      generation_output: body.generation_output,
      previous_generation_output: body.previous_generation_output,
      rby_phases: body.rby_phases,
    });
    return { anomalies };
  }));

  app.post('/nano/translate-state', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    const result = nanoLiaison.translateNanoStateToDdevtags(body.nano_state ?? {});
    return result;
  }));

  // ── spawn_violations ────────────────────

  app.get('/spawn-violations', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    const entries = db.prepare(
      q.agent_id
        ? 'SELECT * FROM spawn_violations WHERE requesting_agent_id = ? ORDER BY created_at DESC'
        : 'SELECT * FROM spawn_violations ORDER BY created_at DESC LIMIT 500'
    ).all(...(q.agent_id ? [q.agent_id] : []));
    return { entries };
  }));

  // ── systemic_regressions ────────────────

  app.get('/systemic-regressions', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    const flagged = q.flagged_to_god_factory !== undefined ? q.flagged_to_god_factory === 'true' : undefined;
    const reports = regressionAgent.getSystemicRegressions(flagged);
    return { reports };
  }));

  app.get('/regression-heatmap', safeRoute(async () => {
    const heatmap = regressionAgent.getRegressionHeatMap();
    return { heatmap };
  }));

  app.post('/regressions/analyze', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    const reports = regressionAgent.analyzePatterns(body.current_cycle ?? 0);
    return { reports };
  }));

  // ── tag_mismatches ──────────────────────

  app.get('/tag-mismatches', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    let query = 'SELECT * FROM tag_mismatches WHERE 1=1';
    const params: any[] = [];
    if (q.severity) { query += ' AND severity = ?'; params.push(q.severity); }
    if (q.devtag) { query += ' AND devtag = ?'; params.push(q.devtag); }
    query += ' ORDER BY created_at DESC LIMIT 200';
    const entries = db.prepare(query).all(...params);
    return { entries };
  }));
  // ── Severity Escalation Chart ────────────────────

  app.get('/severity-chart', safeRoute(async () => {
    return SeverityEscalationService.getChart();
  }));

  app.post('/severity-evaluate', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    const result = severityEscalation.evaluate({
      severity: body.severity,
      devtag: body.devtag,
      file: body.file,
      cycle_id: body.cycle_id,
      agent_id: body.agent_id,
      mismatch_type: body.mismatch_type,
      retry_mismatch_count: body.retry_mismatch_count,
    });
    return result;
  }));

  app.post('/severity-write', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    const result = severityEscalation.writeTagMismatch({
      devtag: body.devtag,
      mismatch_type: body.mismatch_type,
      severity: body.severity,
      cycle_id: body.cycle_id,
      file: body.file,
      agent_id: body.agent_id,
      retry_mismatch_count: body.retry_mismatch_count,
    });
    return result;
  }));

  // ── Failure Escalation Chart ────────────────────

  app.get('/failure-chart', safeRoute(async () => {
    return SeverityEscalationService.getFailureEscalationChart();
  }));

  app.get('/failure-escalations', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    let query = 'SELECT * FROM failure_escalation_log WHERE 1=1';
    const params: any[] = [];
    if (q.decision_cycle_id) { query += ' AND decision_cycle_id = ?'; params.push(q.decision_cycle_id); }
    if (q.level) { query += ' AND level = ?'; params.push(parseInt(q.level)); }
    if (q.agent_id) { query += ' AND agent_id = ?'; params.push(q.agent_id); }
    query += ' ORDER BY created_at DESC LIMIT 200';
    const entries = db.prepare(query).all(...params);
    return { entries };
  }));

  app.post('/failure-escalations', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    const { v4: uuidv4 } = await import('uuid');
    const entry_id = uuidv4();
    db.prepare(`
      INSERT INTO failure_escalation_log (entry_id, decision_cycle_id, step_id, level, fail_count, agent_id, action_taken, plantag_id, detail)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry_id,
      body.decision_cycle_id,
      body.step_id ?? null,
      body.level,
      body.fail_count ?? 1,
      body.agent_id,
      body.action_taken,
      body.plantag_id ?? null,
      JSON.stringify(body.detail ?? {})
    );
    return { entry_id };
  }));
  // ── Summary / overview ───────────────────────────

  app.get('/summary', safeRoute(async () => {
    const counts = {
      regression_history: (db.prepare('SELECT COUNT(*) as c FROM regression_history').get() as any)?.c ?? 0,
      conflict_log: (db.prepare('SELECT COUNT(*) as c FROM conflict_log').get() as any)?.c ?? 0,
      dead_tags: (db.prepare('SELECT COUNT(*) as c FROM dead_tags WHERE resolved = 0').get() as any)?.c ?? 0,
      diff_failures: (db.prepare('SELECT COUNT(*) as c FROM diff_failures').get() as any)?.c ?? 0,
      integration_failures: (db.prepare('SELECT COUNT(*) as c FROM integration_failures').get() as any)?.c ?? 0,
      version_commits: (db.prepare('SELECT COUNT(*) as c FROM version_commits').get() as any)?.c ?? 0,
      nano_anomalies: (db.prepare('SELECT COUNT(*) as c FROM nano_anomalies').get() as any)?.c ?? 0,
      spawn_violations: (db.prepare('SELECT COUNT(*) as c FROM spawn_violations').get() as any)?.c ?? 0,
      systemic_regressions: (db.prepare('SELECT COUNT(*) as c FROM systemic_regressions').get() as any)?.c ?? 0,
      tag_mismatches: (db.prepare('SELECT COUNT(*) as c FROM tag_mismatches').get() as any)?.c ?? 0,
    };
    return { counts };
  }));
}
