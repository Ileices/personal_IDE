// ============================================
// Suggested Jobs Crawler — Main Service
//
// Two operating modes:
//   blame_driven : processes blame/criticism records → job records
//   independent  : 11 codebase review protocols → job records
//
// The crawler is started by the subsystem scheduler and runs
// continuously while the IDE is active.
// ============================================
import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import { StabilityMonitor } from '../stabilityMonitor/index.js';

// ── Priority helpers ────────────────────────
const PRIORITY_ORDER: Record<string, number> = {
  critical: 4, high: 3, medium: 2, low: 1,
};

function priorityFromSeverity(sev: string): string {
  if (sev === 'error') return 'high';
  if (sev === 'critical') return 'critical';
  if (sev === 'warning') return 'medium';
  return 'low';
}

// ── Default sandbox spec factory ─────────────
function defaultSandboxSpec(jobId: string) {
  return {
    sandbox_id: null,
    status: 'not_started',
    cycle_limit: 50,
    cycles_used: 0,
    test_results: [],
    human_review_required: false,
    human_review_completed: false,
  };
}

// ── Default hierarchy factory ─────────────────
function defaultHierarchy(phase = 1, milestone = 'initial') {
  return { phase, milestone, parent_job_id: null, child_job_ids: [] };
}

function getDefaultProjectId(db: Database.Database): string | null {
  const projects = db.prepare(`
    SELECT id
    FROM projects
    ORDER BY last_accessed_at DESC, created_at DESC
    LIMIT 2
  `).all() as Array<{ id: string }>;

  return projects.length === 1 ? projects[0].id : null;
}

function getMostRecentProjectId(db: Database.Database): string | null {
  const row = db.prepare(`
    SELECT id
    FROM projects
    ORDER BY datetime(last_accessed_at) DESC, datetime(created_at) DESC
    LIMIT 1
  `).get() as { id?: string } | undefined;
  return row?.id ? String(row.id) : null;
}

function recommendProtocolFromIntelligence(db: Database.Database): {
  protocol: number;
  reason: string;
  projectId: string;
  additionalPasses: number;
} | null {
  const projectId = getMostRecentProjectId(db);
  if (!projectId) return null;

  const row = db.prepare(`
    SELECT summary, metrics_json
    FROM codebase_intelligence
    WHERE project_id = ?
      AND facet = 'overview'
    ORDER BY datetime(indexed_at) DESC, score DESC
    LIMIT 1
  `).get(projectId) as { summary?: string; metrics_json?: string } | undefined;

  if (!row) return null;

  let metrics: Record<string, unknown> = {};
  try {
    metrics = JSON.parse(String(row.metrics_json || '{}'));
  } catch {
    metrics = {};
  }

  const symbols = Number(metrics.symbols || 0);
  const relationships = Number(metrics.relationships || 0);
  const conflicts = Number(metrics.conflicts || 0);
  const driftEvents = Number(metrics.driftEvents || 0);
  const semanticSymbols = Number(metrics.semanticSymbols || 0);

  if (driftEvents >= 20 || conflicts >= 15) {
    return {
      protocol: 4,
      reason: `intelligence signal: high drift/conflicts (drift=${driftEvents}, conflicts=${conflicts})`,
      projectId,
      additionalPasses: 2,
    };
  }

  if (symbols >= 300 && semanticSymbols < Math.max(50, Math.floor(symbols * 0.08))) {
    return {
      protocol: 10,
      reason: `intelligence signal: low semantic coverage (semantic=${semanticSymbols}, symbols=${symbols})`,
      projectId,
      additionalPasses: 1,
    };
  }

  if (symbols >= 250 && relationships <= Math.floor(symbols * 0.12)) {
    return {
      protocol: 5,
      reason: `intelligence signal: sparse relationship graph (relationships=${relationships}, symbols=${symbols})`,
      projectId,
      additionalPasses: 1,
    };
  }

  const summary = String(row.summary || '').toLowerCase();
  if (summary.includes('drift') && summary.includes('no psc snapshot')) {
    return {
      protocol: 4,
      reason: 'intelligence signal: missing fresh PSC snapshot data',
      projectId,
      additionalPasses: 1,
    };
  }

  return null;
}

function normalizePriority(priority: string): 'low' | 'medium' | 'high' | 'critical' {
  const normalized = String(priority || '').toLowerCase();
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high' || normalized === 'critical') {
    return normalized;
  }
  return 'medium';
}

function shiftPriority(
  base: 'low' | 'medium' | 'high' | 'critical',
  delta: number,
): 'low' | 'medium' | 'high' | 'critical' {
  const order: Array<'low' | 'medium' | 'high' | 'critical'> = ['low', 'medium', 'high', 'critical'];
  const idx = order.indexOf(base);
  if (idx < 0) return 'medium';
  const target = Math.max(0, Math.min(order.length - 1, idx + delta));
  return order[target];
}

function applyIntelligencePriorityOverride(
  db: Database.Database,
  job: {
    job_category: string;
    priority: string;
    affected_files: string[];
  },
): { priority: 'low' | 'medium' | 'high' | 'critical'; reason?: string } {
  const basePriority = normalizePriority(job.priority);
  const projectId = getMostRecentProjectId(db);
  if (!projectId) return { priority: basePriority };

  const overview = db.prepare(`
    SELECT metrics_json
    FROM codebase_intelligence
    WHERE project_id = ?
      AND facet = 'overview'
    ORDER BY datetime(indexed_at) DESC, score DESC
    LIMIT 1
  `).get(projectId) as { metrics_json?: string } | undefined;

  let driftEvents = 0;
  let conflicts = 0;
  let symbols = 0;
  let semanticSymbols = 0;
  if (overview?.metrics_json) {
    try {
      const metrics = JSON.parse(String(overview.metrics_json || '{}')) as Record<string, unknown>;
      driftEvents = Number(metrics.driftEvents || 0);
      conflicts = Number(metrics.conflicts || 0);
      symbols = Number(metrics.symbols || 0);
      semanticSymbols = Number(metrics.semanticSymbols || 0);
    } catch {
      // Keep zero defaults when malformed metrics are encountered.
    }
  }

  let boost = 0;
  const reasons: string[] = [];

  if (driftEvents >= 30 || conflicts >= 20) {
    boost += 1;
    reasons.push(`high-system-risk(drift=${driftEvents},conflicts=${conflicts})`);
  }

  if (job.job_category === 'nano_coverage_gap' && symbols >= 300 && semanticSymbols < Math.max(60, Math.floor(symbols * 0.08))) {
    boost += 1;
    reasons.push(`low-semantic-coverage(semantic=${semanticSymbols},symbols=${symbols})`);
  }

  const fileRows = db.prepare(`
    SELECT score, metrics_json
    FROM codebase_intelligence
    WHERE project_id = ?
      AND facet = 'file'
      AND file_path = ?
    ORDER BY datetime(indexed_at) DESC, score DESC
    LIMIT 1
  `);

  for (const rawPath of (job.affected_files || []).slice(0, 6)) {
    const normalizedPath = String(rawPath || '').replace(/\\/g, '/');
    if (!normalizedPath) continue;
    const fileRow = fileRows.get(projectId, normalizedPath) as { score?: number; metrics_json?: string } | undefined;
    if (!fileRow) continue;

    const fileScore = Number(fileRow.score || 0);
    let symbolCount = 0;
    let relationshipCount = 0;
    if (fileRow.metrics_json) {
      try {
        const parsed = JSON.parse(String(fileRow.metrics_json || '{}')) as Record<string, unknown>;
        symbolCount = Number(parsed.symbolCount || 0);
        relationshipCount = Number(parsed.relationshipCount || 0);
      } catch {
        // Ignore malformed per-file metrics.
      }
    }

    if (fileScore >= 0.75 || symbolCount >= 100 || relationshipCount >= 120) {
      boost += 1;
      reasons.push(`hot-file(${normalizedPath})`);
      break;
    }
  }

  const adjusted = shiftPriority(basePriority, Math.min(boost, 2));
  if (adjusted === basePriority || reasons.length === 0) {
    return { priority: basePriority };
  }

  return {
    priority: adjusted,
    reason: `priority_upshift:${basePriority}->${adjusted} via ${reasons.join('|')}`,
  };
}

// ── Atomic step factory (minimal viable step) ─
function makeAtomicStep(
  description: string,
  devtagsRequired: string[],
  devtagsProduced: string[],
  tokenBudget = 300,
  modelTier = 1,
): object {
  return {
    step_id: randomUUID(),
    step_index: 0,
    description,
    devtags_required: devtagsRequired,
    devtags_produced: devtagsProduced,
    buildtags_required: [],
    plantag_satisfied: null,
    token_budget: Math.min(tokenBudget, modelTier === 1 ? 400 : 100000),
    model_tier_minimum: modelTier,
    can_parallelize: false,
  };
}

// ── Insert a single job record ─────────────────
function insertJobRecord(
  db: Database.Database,
  job: {
    job_id: string;
    job_category: string;
    source: string;
    source_record_ids: string[];
    /** Human-readable "why was this generated?" string for audit traceability */
    evidence_summary?: string;
    priority: string;
    title: string;
    affected_files: string[];
    affected_devtags: string[];
    affected_plantags: string[];
    required_buildtags: string[];
    blocking_jobs: string[];
    blocked_by_jobs: string[];
    hierarchy: object;
    atomic_steps: object[];
    sandbox_spec: object;
    implementation_status: string;
    created_cycle: number;
  },
): boolean {
  const priorityOverride = applyIntelligencePriorityOverride(db, job);
  const effectivePriority = priorityOverride.priority;
  const effectiveEvidenceSummary = [job.evidence_summary ?? '', priorityOverride.reason || '']
    .filter((part) => part.length > 0)
    .join(' | ');

  // Check for duplicate (same category + primary affected tag/file)
  const primaryTag = job.affected_devtags[0] || '';
  const primaryFile = job.affected_files[0] || '';
  const duplicate = db.prepare(`
    SELECT job_id FROM job_records
    WHERE job_category = ?
      AND (
        json_extract(affected_devtags, '$[0]') = ?
        OR json_extract(affected_files, '$[0]') = ?
      )
      AND implementation_status NOT IN ('rejected','archived','implemented')
    LIMIT 1
  `).get(job.job_category, primaryTag, primaryFile) as { job_id: string } | undefined;

  if (duplicate) return false;

  db.prepare(`
    INSERT OR IGNORE INTO job_records
      (id, job_id, project_id, job_category, source, source_record_ids, evidence_summary, priority, title,
       affected_files, affected_devtags, affected_plantags, required_buildtags,
       blocking_jobs, blocked_by_jobs, hierarchy, atomic_steps, sandbox_spec,
       implementation_status, created_cycle, last_updated_cycle, timestamp, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))
  `).run(
    randomUUID(),
    job.job_id,
    getDefaultProjectId(db),
    job.job_category,
    job.source,
    JSON.stringify(job.source_record_ids),
    effectiveEvidenceSummary,
    effectivePriority,
    job.title,
    JSON.stringify(job.affected_files),
    JSON.stringify(job.affected_devtags),
    JSON.stringify(job.affected_plantags),
    JSON.stringify(job.required_buildtags),
    JSON.stringify(job.blocking_jobs),
    JSON.stringify(job.blocked_by_jobs),
    JSON.stringify(job.hierarchy),
    JSON.stringify(job.atomic_steps),
    JSON.stringify(job.sandbox_spec),
    job.implementation_status,
    job.created_cycle,
    job.created_cycle,
  );
  return true;
}

// ── Update crawler state ───────────────────────
function updateCrawlerState(
  db: Database.Database,
  patch: Partial<{
    mode: string;
    current_protocol: number | null;
    last_blame_processed_at: string;
    last_independent_run_at: string;
    cycle_count: number;
    blame_queue_depth: number;
    jobs_generated_total: number;
    status_message: string;
  }>,
) {
  const allowedModes = new Set(['idle', 'blame_driven', 'independent', 'paused']);
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) {
      sets.push(`${k} = ?`);
      if (k === 'mode') {
        const mode = String(v);
        vals.push(allowedModes.has(mode) ? mode : 'paused');
      } else {
        vals.push(v as string | number | null);
      }
    }
  }
  if (sets.length === 0) return;
  sets.push(`updated_at = datetime('now')`);
  db.prepare(`UPDATE sj_crawler_state SET ${sets.join(', ')} WHERE id = 'singleton'`).run(...vals);
}

// ── Protocol helpers ───────────────────────────
function getCrawlerState(db: Database.Database) {
  return db.prepare(`SELECT * FROM sj_crawler_state WHERE id = 'singleton'`).get() as {
    mode: string;
    cycle_count: number;
    blame_queue_depth: number;
    jobs_generated_total: number;
  } | undefined;
}

function isPipelineHaltedByRollback(db: Database.Database): boolean {
  try {
    const row = db.prepare(`
      SELECT COUNT(*) as c
      FROM notification_queue
      WHERE category = 'stability_rollback'
        AND user_acknowledged = 0
    `).get() as { c: number };
    return (row?.c || 0) > 0;
  } catch {
    return false;
  }
}

function recordStabilitySnapshot(
  db: Database.Database,
  cycle: number,
  loopDetected: boolean,
): { triggered: boolean; reason?: string } {
  let avgBlameScore = 0.5;
  let testsFailed = 0;
  let testsTotal = 0;
  let buildtagRejectionRate = 0;

  try {
    const q = db.prepare(`
      SELECT AVG(tag_conformance) as avg_conf
      FROM quality_records
      WHERE created_at >= datetime('now', '-6 hours')
    `).get() as { avg_conf?: number };
    if (typeof q?.avg_conf === 'number') {
      avgBlameScore = Math.max(0, Math.min(1, q.avg_conf));
    }
  } catch { /* ignore */ }

  try {
    const t = db.prepare(`
      SELECT
        SUM(CASE WHEN stage IN ('testing','review','ready','failed') THEN 1 ELSE 0 END) as total,
        SUM(CASE WHEN stage = 'failed' THEN 1 ELSE 0 END) as failed
      FROM sandbox_runs
      WHERE timestamp >= datetime('now', '-3 hours')
    `).get() as { total?: number; failed?: number };
    testsTotal = Number(t?.total || 0);
    testsFailed = Number(t?.failed || 0);
  } catch { /* ignore */ }

  try {
    const mismatches = db.prepare(`
      SELECT COUNT(*) as c FROM tag_mismatches
      WHERE created_at >= datetime('now', '-3 hours')
    `).get() as { c?: number };
    const totalTags = db.prepare(`
      SELECT COUNT(*) as c FROM snapshot_devtags
      WHERE created_at >= datetime('now', '-3 hours')
    `).get() as { c?: number };
    buildtagRejectionRate = Number(mismatches?.c || 0) / Math.max(1, Number(totalTags?.c || 0));
  } catch { /* ignore */ }

  const monitor = new StabilityMonitor(db);
  const rollback = monitor.record({
    cycle,
    timestamp: new Date().toISOString(),
    processAlive: true,
    testsFailed,
    testsTotal,
    avgBlameScore,
    loopDetected,
    buildtagRejectionRate,
  });

  return { triggered: rollback.triggered, reason: rollback.reason };
}

// ── BLAME-DRIVEN MODE ──────────────────────────
// Reads blame records (tool criticism + tag mismatches)
// and generates job records for each.
function processBlameDrivenMode(db: Database.Database, cycleCount: number): number {
  let generated = 0;

  // Try tool_criticism_records table
  let criticisms: Array<{ entry_id?: string; devtag?: string; issue_type?: string; severity?: string; file_path?: string; agent_id?: string }> = [];
  try {
    criticisms = db.prepare(`
      SELECT
        COALESCE(criticism_id, id) AS entry_id,
        tool_name AS devtag,
        failure_type AS issue_type,
        severity,
        '' AS file_path,
        agent_run_id AS agent_id
      FROM tool_criticism_records t
      WHERE NOT EXISTS (
        SELECT 1
        FROM job_records jr
        WHERE jr.source = 'blame_crawler'
          AND jr.implementation_status NOT IN ('rejected','archived','implemented')
          AND jr.source_record_ids LIKE '%' || COALESCE(t.criticism_id, t.id) || '%'
      )
      LIMIT 20
    `).all() as typeof criticisms;
  } catch { /* table may not exist yet */ }

  for (const c of criticisms) {
    const jobId = randomUUID();
    const devtag = c.devtag || 'unknown';
    const file = c.file_path || '';
    const severity = c.severity || 'warning';
    const issueType = c.issue_type || 'unknown';

    const inserted = insertJobRecord(db, {
      job_id: jobId,
      job_category: issueType.includes('test') ? 'test_missing'
        : issueType.includes('debt') ? 'debt_reduction'
        : issueType.includes('security') ? 'security_gap'
        : 'model_tool_enhancement',
      source: 'blame_crawler',
      source_record_ids: [c.entry_id || ''],
      evidence_summary: `tool_criticism_records row ${c.entry_id}: agent=${c.agent_id || 'unknown'}, issue_type=${issueType}, severity=${severity}, file=${file || 'n/a'}`,
      priority: priorityFromSeverity(severity),
      title: `[Blame] ${issueType} on ${devtag}`,
      affected_files: file ? [file] : [],
      affected_devtags: [devtag],
      affected_plantags: [],
      required_buildtags: [],
      blocking_jobs: [],
      blocked_by_jobs: [],
      hierarchy: defaultHierarchy(),
      atomic_steps: [
        makeAtomicStep(`Fix ${issueType} issue on ${devtag}`, [devtag], [`${devtag}:fixed`], 350, 2),
      ],
      sandbox_spec: defaultSandboxSpec(jobId),
      implementation_status: 'suggested',
      created_cycle: cycleCount,
    });
    if (inserted) generated++;
  }

  // Try tag_mismatches
  let mismatches: Array<{ entry_id?: string; devtag?: string; mismatch_type?: string; severity?: string; file?: string }> = [];
  try {
    mismatches = db.prepare(`
      SELECT entry_id, devtag, mismatch_type, severity, file
      FROM tag_mismatches
      WHERE escalated = 0
        AND NOT EXISTS (
          SELECT 1
          FROM job_records jr
          WHERE jr.implementation_status NOT IN ('rejected','archived','implemented')
            AND jr.source_record_ids LIKE '%' || tag_mismatches.entry_id || '%'
        )
      LIMIT 20
    `).all() as typeof mismatches;
  } catch { /* ignore */ }

  for (const m of mismatches) {
    const jobId = randomUUID();
    const devtag = m.devtag || 'unknown';
    const inserted = insertJobRecord(db, {
      job_id: jobId,
      job_category: 'anti_pattern_mitigation',
      source: 'blame_crawler',
      source_record_ids: [m.entry_id || ''],
      evidence_summary: `tag_mismatches row ${m.entry_id}: mismatch_type=${m.mismatch_type || 'unknown'}, devtag=${devtag}, severity=${m.severity || 'warning'}, file=${m.file || 'n/a'}`,
      priority: priorityFromSeverity(m.severity || 'warning'),
      title: `[Mismatch] ${m.mismatch_type} — ${devtag}`,
      affected_files: m.file ? [m.file] : [],
      affected_devtags: [devtag],
      affected_plantags: [],
      required_buildtags: [],
      blocking_jobs: [],
      blocked_by_jobs: [],
      hierarchy: defaultHierarchy(),
      atomic_steps: [makeAtomicStep(`Resolve tag mismatch ${m.mismatch_type} on ${devtag}`, [devtag], [`${devtag}:aligned`], 300, 1)],
      sandbox_spec: defaultSandboxSpec(jobId),
      implementation_status: 'suggested',
      created_cycle: cycleCount,
    });
    if (inserted) generated++;
  }

  return generated;
}

// ── INDEPENDENT MODE PROTOCOLS ─────────────────

// Protocol 1 — Missing Test Coverage
function protocol1MissingTests(db: Database.Database, cycleCount: number): number {
  let generated = 0;
  const testableTypes = ['function', 'method', 'route', 'worker', 'handler'];

  let devtags: Array<{ devtag_name: string; file_path: string; devtag_type: string }> = [];
  try {
    const placeholders = testableTypes.map(() => '?').join(',');
    devtags = db.prepare(`
      SELECT DISTINCT devtag_name, file_path, devtag_type
      FROM snapshot_devtags
      WHERE devtag_type IN (${placeholders})
        AND snapshot_id = (
          SELECT snapshot_id FROM ground_truth_snapshots
          WHERE status = 'complete' ORDER BY created_at DESC LIMIT 1
        )
      LIMIT 100
    `).all(...testableTypes) as typeof devtags;
  } catch { return 0; }

  for (const dt of devtags) {
    // Check if a test exists for this devtag
    const hasTest = db.prepare(`
      SELECT 1 FROM snapshot_devtags
      WHERE devtag_type = 'test' AND devtag_name LIKE ?
        AND snapshot_id = (
          SELECT snapshot_id FROM ground_truth_snapshots
          WHERE status = 'complete' ORDER BY created_at DESC LIMIT 1
        )
      LIMIT 1
    `).get(`%${dt.devtag_name}%`) as object | undefined;

    if (!hasTest) {
      const jobId = randomUUID();
      const ok = insertJobRecord(db, {
        job_id: jobId,
        job_category: 'test_missing',
        source: 'suggested_jobs_crawler',
        source_record_ids: ['protocol:1:test_missing'],
        evidence_summary: `Protocol 1 (test_missing): snapshot_devtags scan found no test for devtag '${dt.devtag_name}' (type=${dt.devtag_type}) in file ${dt.file_path}`,
        priority: 'medium',
        title: `Missing test for ${dt.devtag_type}:${dt.devtag_name}`,
        affected_files: [dt.file_path],
        affected_devtags: [dt.devtag_name],
        affected_plantags: [],
        required_buildtags: [],
        blocking_jobs: [],
        blocked_by_jobs: [],
        hierarchy: defaultHierarchy(1, 'test_coverage'),
        atomic_steps: [
          makeAtomicStep(`Write unit test for ${dt.devtag_name}`, [dt.devtag_name], [`${dt.devtag_name}:tested`], 380, 2),
        ],
        sandbox_spec: defaultSandboxSpec(jobId),
        implementation_status: 'suggested',
        created_cycle: cycleCount,
      });
      if (ok) generated++;
    }
  }
  return generated;
}

// Protocol 2 — Dead Code
function protocol2DeadCode(db: Database.Database, cycleCount: number): number {
  let generated = 0;
  let dead: Array<{ entry_id: string; devtag: string; file_path?: string }> = [];
  try {
    dead = db.prepare(`
      SELECT entry_id, devtag, last_known_file AS file_path FROM dead_tags
      WHERE resolved = 0 LIMIT 50
    `).all() as typeof dead;
  } catch { return 0; }

  for (const d of dead) {
    const jobId = randomUUID();
    const ok = insertJobRecord(db, {
      job_id: jobId,
      job_category: 'dead_code_removal',
      source: 'suggested_jobs_crawler',
      source_record_ids: ['protocol:2:dead_code', d.entry_id],
      evidence_summary: `Protocol 2 (dead_code): dead_tags row ${d.entry_id} — devtag '${d.devtag}' has no live references (file=${d.file_path || 'n/a'})`,
      priority: 'low',
      title: `Remove dead code: ${d.devtag}`,  
      affected_files: d.file_path ? [d.file_path] : [],
      affected_devtags: [d.devtag],
      affected_plantags: [],
      required_buildtags: [],
      blocking_jobs: [],
      blocked_by_jobs: [],
      hierarchy: defaultHierarchy(1, 'dead_code_cleanup'),
      atomic_steps: [makeAtomicStep(`Remove dead devtag ${d.devtag}`, [d.devtag], [`${d.devtag}:removed`], 200, 1)],
      sandbox_spec: defaultSandboxSpec(jobId),
      implementation_status: 'suggested',
      created_cycle: cycleCount,
    });
    if (ok) generated++;
  }
  return generated;
}

// Protocol 3 — Debt Threshold Violations
function protocol3DebtViolations(db: Database.Database, cycleCount: number): number {
  let generated = 0;
  let debts: Array<{ file_path: string; debt_score: number; ceiling: number }> = [];
  try {
    debts = db.prepare(`
      SELECT file_path, debt_score, ceiling FROM debt_history
      WHERE debt_score > ceiling
        AND file_path NOT IN (
          SELECT json_extract(affected_files, '$[0]') FROM job_records
          WHERE job_category = 'debt_reduction'
            AND implementation_status NOT IN ('rejected','archived','implemented')
        )
      LIMIT 30
    `).all() as typeof debts;
  } catch { return 0; }

  for (const d of debts) {
    const jobId = randomUUID();
    const ok = insertJobRecord(db, {
      job_id: jobId,
      job_category: 'debt_reduction',
      source: 'suggested_jobs_crawler',
      source_record_ids: ['protocol:3:debt_threshold'],
      evidence_summary: `Protocol 3 (debt_threshold): debt_history record for ${d.file_path} — debt_score=${d.debt_score} exceeds ceiling=${d.ceiling}`,
      priority: d.debt_score > d.ceiling * 2 ? 'high' : 'medium',
      title: `Reduce debt in ${d.file_path} (score ${d.debt_score} > ceiling ${d.ceiling})`,
      affected_files: [d.file_path],
      affected_devtags: [],
      affected_plantags: [],
      required_buildtags: [],
      blocking_jobs: [],
      blocked_by_jobs: [],
      hierarchy: defaultHierarchy(2, 'debt_reduction'),
      atomic_steps: [makeAtomicStep(`Refactor ${d.file_path} to reduce debt`, [d.file_path], [`${d.file_path}:debt_reduced`], 400, 3)],
      sandbox_spec: defaultSandboxSpec(jobId),
      implementation_status: 'suggested',
      created_cycle: cycleCount,
    });
    if (ok) generated++;
  }
  return generated;
}

// Protocol 4 — Regression Clusters
function protocol4RegressionClusters(db: Database.Database, cycleCount: number): number {
  let generated = 0;
  let clusters: Array<{ devtag: string; cnt: number; file_path?: string }> = [];
  try {
    clusters = db.prepare(`
      SELECT devtag, COUNT(*) as cnt, MAX(file) as file_path
      FROM regression_history GROUP BY devtag HAVING cnt >= 3
      LIMIT 30
    `).all() as typeof clusters;
  } catch { return 0; }

  for (const c of clusters) {
    const jobId = randomUUID();
    const ok = insertJobRecord(db, {
      job_id: jobId,
      job_category: 'regression_hardening',
      source: 'suggested_jobs_crawler',
      source_record_ids: ['protocol:4:regression_cluster'],
      evidence_summary: `Protocol 4 (regression_cluster): regression_history shows devtag '${c.devtag}' regressed ${c.cnt} times (file=${c.file_path || 'n/a'})`,
      priority: c.cnt >= 5 ? 'high' : 'medium',
      title: `Regression hardening: ${c.devtag} (${c.cnt} regressions)`,
      affected_files: c.file_path ? [c.file_path] : [],
      affected_devtags: [c.devtag],
      affected_plantags: [],
      required_buildtags: [],
      blocking_jobs: [],
      blocked_by_jobs: [],
      hierarchy: defaultHierarchy(1, 'regression_hardening'),
      atomic_steps: [makeAtomicStep(`Add regression guard for ${c.devtag}`, [c.devtag], [`${c.devtag}:hardened`], 380, 2)],
      sandbox_spec: defaultSandboxSpec(jobId),
      implementation_status: 'suggested',
      created_cycle: cycleCount,
    });
    if (ok) generated++;
  }
  return generated;
}

// Protocol 5 — Integration Failures
function protocol5IntegrationFailures(db: Database.Database, cycleCount: number): number {
  let generated = 0;
  let failures: Array<{ entry_id: string; component: string; failure_type: string; file_path?: string; cycle_id?: string; severity?: string }> = [];
  try {
    failures = db.prepare(`
      SELECT
        entry_id,
        new_devtag AS component,
        relationship_type AS failure_type,
        file AS file_path,
        cycle_id,
        severity
      FROM integration_failures i
      WHERE created_at < datetime('now', '-1 hour')
        AND NOT EXISTS (
          SELECT 1
          FROM job_records jr
          WHERE jr.implementation_status NOT IN ('rejected','archived','implemented')
            AND jr.source_record_ids LIKE '%' || i.entry_id || '%'
        )
      LIMIT 20
    `).all() as typeof failures;
  } catch { return 0; }

  for (const f of failures) {
    const jobId = randomUUID();
    const ok = insertJobRecord(db, {
      job_id: jobId,
      job_category: 'integration_repair',
      source: 'suggested_jobs_crawler',
      source_record_ids: ['protocol:5:integration_failure', f.entry_id],
      evidence_summary: `Protocol 5 (integration_failure): integration_failures row ${f.entry_id} — component=${f.component}, type=${f.failure_type}, cycle=${f.cycle_id || 'unknown'}, file=${f.file_path || 'n/a'}`,
      priority: priorityFromSeverity(f.severity || 'warning'),
      title: `Integration repair: ${f.failure_type} in ${f.component}`,
      affected_files: f.file_path ? [f.file_path] : [],
      affected_devtags: [f.component],
      affected_plantags: [],
      required_buildtags: [],
      blocking_jobs: [],
      blocked_by_jobs: [],
      hierarchy: defaultHierarchy(1, 'integration_repair'),
      atomic_steps: [makeAtomicStep(`Fix integration failure ${f.failure_type} in ${f.component}`, [f.component], [`${f.component}:integrated`], 400, 3)],
      sandbox_spec: defaultSandboxSpec(jobId),
      implementation_status: 'suggested',
      created_cycle: cycleCount,
    });
    if (ok) generated++;
  }
  return generated;
}

// Protocol 6 — Pattern Anti-Patterns
function protocol6AntiPatterns(db: Database.Database, cycleCount: number): number {
  let generated = 0;
  let patterns: Array<{ entry_id: string; pattern_type: string; description?: string; file_path?: string; severity?: string }> = [];
  try {
    patterns = db.prepare(`
      SELECT
        p.pattern_id AS entry_id,
        COALESCE(NULLIF(p.anti_pattern_type, ''), p.failure_type) AS pattern_type,
        '' AS description,
        '' AS file_path,
        p.severity
      FROM patterns p
      WHERE (p.is_anti_pattern = 1 OR p.flagged_to_god_factory = 1)
        AND NOT EXISTS (
          SELECT 1 FROM job_records jr
          WHERE jr.job_category = 'anti_pattern_mitigation'
            AND jr.implementation_status NOT IN ('rejected','archived','implemented')
            AND jr.source_record_ids LIKE '%' || p.pattern_id || '%'
        )
      LIMIT 20
    `).all() as typeof patterns;
  } catch { return 0; }

  for (const p of patterns) {
    const jobId = randomUUID();
    const ok = insertJobRecord(db, {
      job_id: jobId,
      job_category: 'anti_pattern_mitigation',
      source: 'suggested_jobs_crawler',
      source_record_ids: ['protocol:6:anti_pattern', p.entry_id],
      evidence_summary: `Protocol 6 (anti_pattern): patterns row ${p.entry_id} — systemic pattern_type=${p.pattern_type}, severity=${p.severity || 'warning'}, file=${p.file_path || 'n/a'}`,
      priority: priorityFromSeverity(p.severity || 'warning'),
      title: `Mitigate anti-pattern: ${p.pattern_type}`,
      affected_files: p.file_path ? [p.file_path] : [],
      affected_devtags: [],
      affected_plantags: [],
      required_buildtags: [],
      blocking_jobs: [],
      blocked_by_jobs: [],
      hierarchy: defaultHierarchy(2, 'anti_pattern_mitigation'),
      atomic_steps: [makeAtomicStep(`Mitigate ${p.pattern_type}`, [], [`pattern:${p.pattern_type}:mitigated`], 380, 3)],
      sandbox_spec: defaultSandboxSpec(jobId),
      implementation_status: 'suggested',
      created_cycle: cycleCount,
    });
    if (ok) generated++;
  }
  return generated;
}

// Protocol 7 — Vocabulary Gaps
function protocol7VocabGaps(db: Database.Database, cycleCount: number): number {
  let generated = 0;
  let gaps: Array<{ entry_id: string; file_path: string; untagged_structure_type: string; occurrence_count: number }> = [];
  try {
    gaps = db.prepare(`
      SELECT entry_id, file_path, untagged_structure_type, occurrence_count
      FROM vocabulary_gaps
      WHERE resolved = 0 AND occurrence_count >= 3
      LIMIT 20
    `).all() as typeof gaps;
  } catch { return 0; }

  for (const g of gaps) {
    const jobId = randomUUID();
    const ok = insertJobRecord(db, {
      job_id: jobId,
      job_category: 'tag_schema_extension',
      source: 'suggested_jobs_crawler',
      source_record_ids: ['protocol:7:vocab_gap', g.entry_id],
      evidence_summary: `Protocol 7 (vocab_gap): vocabulary_gaps row ${g.entry_id} — untagged type '${g.untagged_structure_type}' appears ${g.occurrence_count}× in ${g.file_path}`,
      priority: 'low',
      title: `Extend tag schema: missing type ${g.untagged_structure_type} (${g.occurrence_count}× in ${g.file_path})`,
      affected_files: [g.file_path],
      affected_devtags: [],
      affected_plantags: [],
      required_buildtags: [],
      blocking_jobs: [],
      blocked_by_jobs: [],
      hierarchy: defaultHierarchy(3, 'schema_extension'),
      atomic_steps: [makeAtomicStep(`Define devtag type for ${g.untagged_structure_type}`, [], [`devtag:${g.untagged_structure_type}:defined`], 300, 2)],
      sandbox_spec: defaultSandboxSpec(jobId),
      implementation_status: 'suggested',
      created_cycle: cycleCount,
    });
    if (ok) generated++;
  }
  return generated;
}

// Protocol 8 — Performance Sensitivity Gaps
function protocol8PerfGaps(db: Database.Database, cycleCount: number): number {
  let generated = 0;
  let perfTags: Array<{ devtag_name: string; file_path: string; devtag_type: string }> = [];
  try {
    const perfTypes = ['perf_critical', 'latency_sensitive', 'hot_path'];
    const ph = perfTypes.map(() => '?').join(',');
    perfTags = db.prepare(`
      SELECT devtag_name, file_path, devtag_type FROM snapshot_devtags
      WHERE devtag_type IN (${ph})
        AND snapshot_id = (SELECT snapshot_id FROM ground_truth_snapshots WHERE status='complete' ORDER BY created_at DESC LIMIT 1)
      LIMIT 50
    `).all(...perfTypes) as typeof perfTags;
  } catch { return 0; }

  for (const pt of perfTags) {
    const hasTest = db.prepare(`
      SELECT 1 FROM snapshot_devtags
      WHERE devtag_type = 'test' AND devtag_name LIKE ?
        AND snapshot_id = (SELECT snapshot_id FROM ground_truth_snapshots WHERE status='complete' ORDER BY created_at DESC LIMIT 1)
      LIMIT 1
    `).get(`%perf%${pt.devtag_name}%`) as object | undefined;

    if (!hasTest) {
      const jobId = randomUUID();
      const ok = insertJobRecord(db, {
        job_id: jobId,
        job_category: 'performance_test_missing',
        source: 'suggested_jobs_crawler',
        source_record_ids: ['protocol:8:perf_gap'],
        evidence_summary: `Protocol 8 (perf_gap): snapshot_devtags shows ${pt.devtag_type}:${pt.devtag_name} in ${pt.file_path} has no performance test`,
        priority: 'medium',
        title: `Add performance test for ${pt.devtag_type}:${pt.devtag_name}`,
        affected_files: [pt.file_path],
        affected_devtags: [pt.devtag_name],
        affected_plantags: [],
        required_buildtags: [],
        blocking_jobs: [],
        blocked_by_jobs: [],
        hierarchy: defaultHierarchy(1, 'perf_coverage'),
        atomic_steps: [makeAtomicStep(`Write perf test for ${pt.devtag_name}`, [pt.devtag_name], [`${pt.devtag_name}:perf_tested`], 380, 2)],
        sandbox_spec: defaultSandboxSpec(jobId),
        implementation_status: 'suggested',
        created_cycle: cycleCount,
      });
      if (ok) generated++;
    }
  }
  return generated;
}

// Protocol 9 — Security Coverage
function protocol9SecurityGaps(db: Database.Database, cycleCount: number): number {
  let generated = 0;
  let secTags: Array<{ devtag_name: string; file_path: string; devtag_type: string }> = [];
  try {
    const secTypes = ['auth', 'permission', 'policy', 'public_api'];
    const ph = secTypes.map(() => '?').join(',');
    secTags = db.prepare(`
      SELECT devtag_name, file_path, devtag_type FROM snapshot_devtags
      WHERE devtag_type IN (${ph})
        AND snapshot_id = (SELECT snapshot_id FROM ground_truth_snapshots WHERE status='complete' ORDER BY created_at DESC LIMIT 1)
      LIMIT 50
    `).all(...secTypes) as typeof secTags;
  } catch { return 0; }

  for (const st of secTags) {
    const hasSecTest = db.prepare(`
      SELECT 1 FROM snapshot_devtags
      WHERE devtag_type = 'test' AND (devtag_name LIKE ? OR devtag_name LIKE ?)
        AND snapshot_id = (SELECT snapshot_id FROM ground_truth_snapshots WHERE status='complete' ORDER BY created_at DESC LIMIT 1)
      LIMIT 1
    `).get(`%security%${st.devtag_name}%`, `%auth%${st.devtag_name}%`) as object | undefined;

    if (!hasSecTest) {
      const jobId = randomUUID();
      const ok = insertJobRecord(db, {
        job_id: jobId,
        job_category: 'security_gap',
        source: 'suggested_jobs_crawler',
        source_record_ids: ['protocol:9:security_gap'],
        evidence_summary: `Protocol 9 (security_gap): snapshot_devtags shows ${st.devtag_type}:${st.devtag_name} in ${st.file_path} has no security test`,
        priority: 'high',
        title: `Security test missing for ${st.devtag_type}:${st.devtag_name}`,
        affected_files: [st.file_path],
        affected_devtags: [st.devtag_name],
        affected_plantags: [],
        required_buildtags: [],
        blocking_jobs: [],
        blocked_by_jobs: [],
        hierarchy: defaultHierarchy(1, 'security_hardening'),
        atomic_steps: [makeAtomicStep(`Write security test for ${st.devtag_name}`, [st.devtag_name], [`${st.devtag_name}:security_tested`], 380, 2)],
        sandbox_spec: defaultSandboxSpec(jobId),
        implementation_status: 'suggested',
        created_cycle: cycleCount,
      });
      if (ok) generated++;
    }
  }
  return generated;
}

// Protocol 10 — Nano Sea Coverage
function protocol10NanoCoverage(db: Database.Database, cycleCount: number): number {
  let generated = 0;
  let nanos: Array<{ devtag_name: string; file_path: string }> = [];
  try {
    nanos = db.prepare(`
      SELECT devtag_name, file_path FROM snapshot_devtags
      WHERE devtag_type = 'nano'
        AND snapshot_id = (SELECT snapshot_id FROM ground_truth_snapshots WHERE status='complete' ORDER BY created_at DESC LIMIT 1)
      LIMIT 50
    `).all() as typeof nanos;
  } catch { return 0; }

  for (const n of nanos) {
    const hasTarget = db.prepare(`
      SELECT 1 FROM snapshot_devtags
      WHERE devtag_type IN ('nano:training_target','nano:fitness')
        AND devtag_name LIKE ?
        AND snapshot_id = (SELECT snapshot_id FROM ground_truth_snapshots WHERE status='complete' ORDER BY created_at DESC LIMIT 1)
      LIMIT 1
    `).get(`%${n.devtag_name}%`) as object | undefined;

    if (!hasTarget) {
      const jobId = randomUUID();
      const ok = insertJobRecord(db, {
        job_id: jobId,
        job_category: 'nano_coverage_gap',
        source: 'suggested_jobs_crawler',
        source_record_ids: ['protocol:10:nano_coverage'],
        evidence_summary: `Protocol 10 (nano_coverage): snapshot_devtags shows nano '${n.devtag_name}' in ${n.file_path} has no training_target or fitness tag`,
        priority: 'low',
        title: `Nano coverage gap: ${n.devtag_name} missing training target or fitness tag`,
        affected_files: [n.file_path],
        affected_devtags: [n.devtag_name],
        affected_plantags: [],
        required_buildtags: [],
        blocking_jobs: [],
        blocked_by_jobs: [],
        hierarchy: defaultHierarchy(3, 'nano_coverage'),
        atomic_steps: [makeAtomicStep(`Add training_target tag to nano ${n.devtag_name}`, [n.devtag_name], [`nano:${n.devtag_name}:targeted`], 250, 1)],
        sandbox_spec: defaultSandboxSpec(jobId),
        implementation_status: 'suggested',
        created_cycle: cycleCount,
      });
      if (ok) generated++;
    }
  }
  return generated;
}

function backupToActivePath(filePath: string): string | null {
  const marker = 'apps/web/src/';
  const idx = filePath.lastIndexOf(marker);
  if (idx < 0) return null;
  return filePath.slice(idx).replace(/^\/+/, '');
}

// Protocol 11 — Backup Drift Reconciliation
// Compares historical UI modules under .backups against active apps/web/src files.
// Feeds God Factory with concrete merge/reconcile jobs when backup snapshots contain
// structures that are missing from active files.
function protocol11BackupReconciliation(db: Database.Database, cycleCount: number): number {
  let generated = 0;

  const latestSnapshot = db.prepare(`
    SELECT snapshot_id
    FROM ground_truth_snapshots
    WHERE status = 'complete'
    ORDER BY datetime(created_at) DESC
    LIMIT 1
  `).get() as { snapshot_id?: string } | undefined;

  if (!latestSnapshot?.snapshot_id) return 0;

  let rows: Array<{ file_path: string; devtag_type: string; devtag_name: string }> = [];
  try {
    rows = db.prepare(`
      SELECT file_path, devtag_type, devtag_name
      FROM snapshot_devtags
      WHERE snapshot_id = ?
        AND devtag_type NOT IN ('file', 'import')
        AND (
          file_path LIKE '.backups/%/apps/web/src/%'
          OR file_path LIKE 'apps/web/src/%'
        )
    `).all(latestSnapshot.snapshot_id) as typeof rows;
  } catch {
    return 0;
  }

  const activeTagsByFile = new Map<string, Set<string>>();
  const backupTagsByCanonical = new Map<string, Map<string, Set<string>>>();

  for (const row of rows) {
    const tagKey = `${row.devtag_type}:${row.devtag_name}`;
    if (row.file_path.startsWith('apps/web/src/')) {
      const set = activeTagsByFile.get(row.file_path) || new Set<string>();
      set.add(tagKey);
      activeTagsByFile.set(row.file_path, set);
      continue;
    }

    if (!row.file_path.startsWith('.backups/')) continue;
    const canonicalPath = backupToActivePath(row.file_path);
    if (!canonicalPath) continue;

    const byBackupPath = backupTagsByCanonical.get(canonicalPath) || new Map<string, Set<string>>();
    const backupSet = byBackupPath.get(row.file_path) || new Set<string>();
    backupSet.add(tagKey);
    byBackupPath.set(row.file_path, backupSet);
    backupTagsByCanonical.set(canonicalPath, byBackupPath);
  }

  if (backupTagsByCanonical.size === 0) return 0;

  const candidates: Array<{
    canonicalPath: string;
    backupPath: string;
    backupTags: Set<string>;
    activeTags: Set<string>;
    missingTags: string[];
    activeExists: boolean;
  }> = [];

  for (const [canonicalPath, backupVariants] of backupTagsByCanonical.entries()) {
    let selectedBackupPath = '';
    let selectedBackupTags = new Set<string>();
    for (const [backupPath, tags] of backupVariants.entries()) {
      if (tags.size > selectedBackupTags.size) {
        selectedBackupPath = backupPath;
        selectedBackupTags = tags;
      }
    }
    if (!selectedBackupPath || selectedBackupTags.size === 0) continue;

    const activeTags = activeTagsByFile.get(canonicalPath) || new Set<string>();
    const activeExists = activeTagsByFile.has(canonicalPath);
    const missingTags = Array.from(selectedBackupTags).filter(tag => !activeTags.has(tag));

    if (activeExists && missingTags.length < 3) continue;

    candidates.push({
      canonicalPath,
      backupPath: selectedBackupPath,
      backupTags: selectedBackupTags,
      activeTags,
      missingTags,
      activeExists,
    });
  }

  const ranked = candidates
    .sort((a, b) => {
      const aScore = (a.activeExists ? 0 : 1000) + a.missingTags.length;
      const bScore = (b.activeExists ? 0 : 1000) + b.missingTags.length;
      return bScore - aScore;
    })
    .slice(0, 20);

  for (const candidate of ranked) {
    const markerTag = `backup_sync:${candidate.canonicalPath}`;
    const missingSample = candidate.missingTags
      .slice(0, 4)
      .map(tag => tag.includes(':') ? tag.slice(tag.indexOf(':') + 1) : tag);
    const jobId = randomUUID();

    const inserted = insertJobRecord(db, {
      job_id: jobId,
      job_category: 'backup_reconciliation',
      source: 'suggested_jobs_crawler',
      source_record_ids: [
        'protocol:11:backup_reconciliation',
        `snapshot:${latestSnapshot.snapshot_id}`,
        `backup:${candidate.backupPath}`,
      ],
      evidence_summary: `Protocol 11 (backup_reconciliation): backup ${candidate.backupPath} has ${candidate.backupTags.size} unique devtags; active ${candidate.canonicalPath} has ${candidate.activeTags.size}; missing_in_active=${candidate.missingTags.length}`,
      priority: !candidate.activeExists
        ? 'high'
        : candidate.missingTags.length >= 8
        ? 'high'
        : 'medium',
      title: candidate.activeExists
        ? `Reconcile active UI file with backup drift: ${candidate.canonicalPath}`
        : `Create active UI file from backup lineage: ${candidate.canonicalPath}`,
      affected_files: [candidate.canonicalPath, candidate.backupPath],
      affected_devtags: [markerTag, ...missingSample].slice(0, 5),
      affected_plantags: [],
      required_buildtags: [],
      blocking_jobs: [],
      blocked_by_jobs: [],
      hierarchy: defaultHierarchy(2, 'backup_reconciliation'),
      atomic_steps: [
        makeAtomicStep(
          `Compare ${candidate.canonicalPath} against backup baseline ${candidate.backupPath}`,
          [markerTag],
          [`${markerTag}:compared`],
          360,
          2,
        ),
        makeAtomicStep(
          `Port missing UI behavior and add a regression safety test for ${candidate.canonicalPath}`,
          [markerTag],
          [`${markerTag}:reconciled`],
          420,
          2,
        ),
      ],
      sandbox_spec: defaultSandboxSpec(jobId),
      implementation_status: 'suggested',
      created_cycle: cycleCount,
    });

    if (inserted) generated++;
  }

  return generated;
}

// ── Main crawler tick ──────────────────────────
// Called by the subsystem scheduler on each tick.
export function runSuggestedJobsCrawlerTick(db: Database.Database): {
  mode: string;
  generated: number;
  protocol?: number;
} {
  const state = getCrawlerState(db);
  if (!state) return { mode: 'idle', generated: 0 };
  if (isPipelineHaltedByRollback(db)) {
    updateCrawlerState(db, {
      mode: 'rollback_halt',
      status_message: 'Pipeline halted due to active stability rollback notification',
    });
    return { mode: 'rollback_halt', generated: 0 };
  }

  // ── Health-event awareness ─────────────────────────────────────────────────
  // If StabilityMonitor triggered any rollbacks in the last 4 hours, we are
  // in a degraded system state:
  //   1. Boost regression_hardening jobs (run the protocol 3× in this tick)
  //   2. Suppress performance_test_missing and documentation_gap protocols
  //      to avoid noise while the system is recovering
  let recentHealthEventCount = 0;
  try {
    const healthRow = db.prepare(`
      SELECT COUNT(*) AS cnt
      FROM system_health_events
      WHERE triggered_at >= datetime('now', '-4 hours')
    `).get() as { cnt: number };
    recentHealthEventCount = healthRow?.cnt || 0;
  } catch { /* migration v117 not yet applied — treat as 0 */ }

  const isSystemDegraded = recentHealthEventCount > 0;

  const cycleCount = (state.cycle_count || 0) + 1;
  updateCrawlerState(db, { cycle_count: cycleCount });

  // Check blame queue depth
  let blameQueueDepth = 0;
  try {
    const bq1 = db.prepare(`
      SELECT COUNT(*) as cnt
      FROM tool_criticism_records t
      WHERE NOT EXISTS (
        SELECT 1
        FROM job_records jr
        WHERE jr.source = 'blame_crawler'
          AND jr.implementation_status NOT IN ('rejected','archived','implemented')
          AND jr.source_record_ids LIKE '%' || COALESCE(t.criticism_id, t.id) || '%'
      )
    `).get() as { cnt: number };
    const bq2 = db.prepare(`
      SELECT COUNT(*) as cnt
      FROM tag_mismatches tm
      WHERE tm.escalated = 0
        AND NOT EXISTS (
          SELECT 1
          FROM job_records jr
          WHERE jr.implementation_status NOT IN ('rejected','archived','implemented')
            AND jr.source_record_ids LIKE '%' || tm.entry_id || '%'
        )
    `).get() as { cnt: number };
    blameQueueDepth = (bq1?.cnt || 0) + (bq2?.cnt || 0);
  } catch { /* ignore */ }

  updateCrawlerState(db, { blame_queue_depth: blameQueueDepth });

  let generated = 0;
  let mode = 'idle';

  if (blameQueueDepth > 0) {
    // BLAME-DRIVEN MODE — unconditional priority
    mode = 'blame_driven';
    updateCrawlerState(db, { mode: 'blame_driven', status_message: `Processing ${blameQueueDepth} blame records` });
    generated = processBlameDrivenMode(db, cycleCount);
    updateCrawlerState(db, {
      last_blame_processed_at: new Date().toISOString(),
      jobs_generated_total: (state.jobs_generated_total || 0) + generated,
      status_message: `Processed blame records — generated ${generated} jobs`,
    });
  } else {
    // INDEPENDENT MODE — round-robin through protocols 1-11
    const currentProtocol = ((state as unknown as { current_protocol?: number }).current_protocol || 0) % 11 + 1;
    mode = 'independent';
    const intelligenceRecommendation = recommendProtocolFromIntelligence(db);

    // ── Degraded-system override ───────────────────────────────────────────
    // When recent health events indicate system instability:
    //  - Protocol 4 (RegressionClusters) is boosted 3x (run it on this tick
    //    regardless of round-robin position, then twice more via extra passes)
    //  - Protocols 7 (VocabGaps) and 8 (PerfGaps) are suppressed (too noisy
    //    during recovery; these are performance/documentation concerns)
    const SUPPRESSED_WHEN_DEGRADED = new Set([7, 8]); // performance_test_missing, documentation_gap
    const REGRESSION_HARDENING_PROTOCOL = 4;

    let effectiveProtocol = currentProtocol;
    if (isSystemDegraded && SUPPRESSED_WHEN_DEGRADED.has(currentProtocol)) {
      effectiveProtocol = REGRESSION_HARDENING_PROTOCOL; // force regression focus
    } else if (!isSystemDegraded && intelligenceRecommendation) {
      effectiveProtocol = intelligenceRecommendation.protocol;
    }

    updateCrawlerState(db, {
      mode: 'independent',
      current_protocol: effectiveProtocol,
      status_message: `Running protocol ${effectiveProtocol}${isSystemDegraded ? ' [degraded-system mode]' : ''}${
        !isSystemDegraded && intelligenceRecommendation
          ? ` [${intelligenceRecommendation.reason}; passes=${1 + Math.max(0, Number(intelligenceRecommendation.additionalPasses || 0))}]`
          : ''
      }`,
    });

    const protocolFns = [
      protocol1MissingTests,
      protocol2DeadCode,
      protocol3DebtViolations,
      protocol4RegressionClusters,
      protocol5IntegrationFailures,
      protocol6AntiPatterns,
      protocol7VocabGaps,
      protocol8PerfGaps,
      protocol9SecurityGaps,
      protocol10NanoCoverage,
      protocol11BackupReconciliation,
    ];

    const runSelectedProtocol = protocolFns[effectiveProtocol - 1];
    const intelligencePasses = !isSystemDegraded && intelligenceRecommendation && intelligenceRecommendation.protocol === effectiveProtocol
      ? Math.max(0, Math.min(3, Number(intelligenceRecommendation.additionalPasses || 0)))
      : 0;

    generated = 0;
    for (let pass = 0; pass < 1 + intelligencePasses; pass += 1) {
      generated += runSelectedProtocol?.(db, cycleCount) || 0;
    }

    // Regression hardening boost: run protocol 4 two more times when degraded
    if (isSystemDegraded && effectiveProtocol !== REGRESSION_HARDENING_PROTOCOL) {
      generated += protocol4RegressionClusters(db, cycleCount);
      generated += protocol4RegressionClusters(db, cycleCount);
    } else if (isSystemDegraded && effectiveProtocol === REGRESSION_HARDENING_PROTOCOL) {
      generated += protocol4RegressionClusters(db, cycleCount);
      generated += protocol4RegressionClusters(db, cycleCount);
    }
    updateCrawlerState(db, {
      last_independent_run_at: new Date().toISOString(),
      jobs_generated_total: (state.jobs_generated_total || 0) + generated,
      status_message: `Protocol ${effectiveProtocol} complete — generated ${generated} jobs`,
    });

    const stability = recordStabilitySnapshot(db, cycleCount, false);
    if (stability.triggered) {
      updateCrawlerState(db, {
        mode: 'rollback_halt',
        status_message: `Stability rollback triggered (${stability.reason || 'unknown'}) — halting pipeline`,
      });
      return { mode: 'rollback_halt', generated: 0, protocol: currentProtocol };
    }

    return { mode, generated, protocol: effectiveProtocol };
  }

  const stability = recordStabilitySnapshot(db, cycleCount, false);
  if (stability.triggered) {
    updateCrawlerState(db, {
      mode: 'rollback_halt',
      status_message: `Stability rollback triggered (${stability.reason || 'unknown'}) — halting pipeline`,
    });
    return { mode: 'rollback_halt', generated: 0 };
  }

  return { mode, generated };
}

// ── Sandbox loop tick ──────────────────────────
// Advances sandbox state for the oldest building/testing job.
export function runSandboxTick(db: Database.Database): void {
  if (isPipelineHaltedByRollback(db)) return;
  // Find next job needing sandbox work
  let job: { job_id: string; sandbox_spec: string; implementation_status: string } | undefined;
  try {
    job = db.prepare(`
      SELECT job_id, sandbox_spec, implementation_status FROM job_records
      WHERE implementation_status = 'suggested'
        AND json_extract(sandbox_spec, '$.status') IN ('not_started','building','testing')
      ORDER BY
        CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        created_at ASC
      LIMIT 1
    `).get() as typeof job;
  } catch { return; }

  if (!job) return;

  const spec = JSON.parse(job.sandbox_spec);
  const cyclesUsed = (spec.cycles_used || 0) + 1;
  const cycleLimit = spec.cycle_limit || 50;
  const currentStatus = spec.status || 'not_started';

  let newStatus = currentStatus;
  if (currentStatus === 'not_started') newStatus = 'building';
  else if (currentStatus === 'building' && cyclesUsed >= 2) newStatus = 'testing';
  else if (currentStatus === 'testing' && cyclesUsed >= 4) newStatus = 'review';
  else if (currentStatus === 'review' && cyclesUsed >= 5) newStatus = 'ready';

  if (cyclesUsed >= cycleLimit) {
    newStatus = 'failed';
  }

  const newSpec = { ...spec, status: newStatus, cycles_used: cyclesUsed };

  // Write sandbox run record
  try {
    db.prepare(`
      INSERT INTO sandbox_runs (id, run_id, job_id, cycle_number, stage, loop_coordinator_decision, timestamp)
      VALUES (?,?,?,?,?,?,datetime('now'))
    `).run(randomUUID(), randomUUID(), job.job_id, cyclesUsed, newStatus, `auto_advance:${newStatus}`);
  } catch { /* ignore */ }

  // Update job record
  db.prepare(`
    UPDATE job_records SET
      sandbox_spec = ?,
      implementation_status = ?,
      last_updated_cycle = last_updated_cycle + 1
    WHERE job_id = ?
  `).run(
    JSON.stringify(newSpec),
    newStatus === 'ready' ? 'sandbox_ready' : newStatus === 'failed' ? 'suggested' : 'suggested',
    job.job_id,
  );
}

// ── Public status query ─────────────────────────
export function getCrawlerStatus(db: Database.Database) {
  const state = db.prepare(`SELECT * FROM sj_crawler_state WHERE id = 'singleton'`).get() as Record<string, unknown> | undefined;
  const totalJobs = db.prepare(`SELECT COUNT(*) as cnt FROM job_records WHERE implementation_status NOT IN ('rejected','archived')`).get() as { cnt: number };
  const suggested = db.prepare(`SELECT COUNT(*) as cnt FROM job_records WHERE implementation_status = 'suggested'`).get() as { cnt: number };
  const sandboxReady = db.prepare(`SELECT COUNT(*) as cnt FROM job_records WHERE implementation_status = 'sandbox_ready'`).get() as { cnt: number };
  return {
    crawlerState: state,
    totalActiveJobs: totalJobs.cnt,
    suggestedJobs: suggested.cnt,
    sandboxReadyJobs: sandboxReady.cnt,
  };
}
