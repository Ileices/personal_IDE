// ============================================
// Suggested Jobs Crawler — Main Service
//
// Two operating modes:
//   blame_driven : processes blame/criticism records → job records
//   independent  : 10 codebase review protocols → job records
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
  // Check for duplicate (same category + primary affected tag/file)
  const existingKey = `${job.job_category}::${job.affected_devtags[0] || job.affected_files[0] || ''}`;
  const duplicate = db.prepare(`
    SELECT job_id FROM job_records
    WHERE job_category = ? AND json_extract(affected_devtags, '$[0]') = ?
      AND implementation_status NOT IN ('rejected','archived','implemented')
    LIMIT 1
  `).get(job.job_category, job.affected_devtags[0] || '') as { job_id: string } | undefined;

  if (duplicate) return false;

  db.prepare(`
    INSERT OR IGNORE INTO job_records
      (id, job_id, job_category, source, source_record_ids, evidence_summary, priority, title,
       affected_files, affected_devtags, affected_plantags, required_buildtags,
       blocking_jobs, blocked_by_jobs, hierarchy, atomic_steps, sandbox_spec,
       implementation_status, created_cycle, last_updated_cycle, timestamp, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))
  `).run(
    randomUUID(),
    job.job_id,
    job.job_category,
    job.source,
    JSON.stringify(job.source_record_ids),
    job.evidence_summary ?? '',
    job.priority,
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
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) { sets.push(`${k} = ?`); vals.push(v as string | number | null); }
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
// Reads unprocessed blame records (tool_criticisms + model_performance)
// and generates job records for each.
function processBlameDrivenMode(db: Database.Database, cycleCount: number): number {
  let generated = 0;

  // Try tool_criticisms table
  let criticisms: Array<{ id?: string; entry_id?: string; devtag?: string; issue_type?: string; severity?: string; file_path?: string; agent_id?: string }> = [];
  try {
    criticisms = db.prepare(`
      SELECT entry_id, devtag, issue_type, severity, file_path, agent_id
      FROM tool_criticisms
      WHERE sj_processed IS NULL OR sj_processed = 0
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
      evidence_summary: `tool_criticisms row ${c.entry_id}: agent=${c.agent_id || 'unknown'}, issue_type=${issueType}, severity=${severity}, file=${file || 'n/a'}`,
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

    if (inserted) {
      generated++;
      // Mark as processed
      try {
        db.prepare(`UPDATE tool_criticisms SET sj_processed = 1 WHERE entry_id = ?`).run(c.entry_id);
      } catch { /* ignore */ }
    }
  }

  // Try tag_mismatches
  let mismatches: Array<{ entry_id?: string; devtag?: string; mismatch_type?: string; severity?: string; file?: string }> = [];
  try {
    mismatches = db.prepare(`
      SELECT entry_id, devtag, mismatch_type, severity, file
      FROM tag_mismatches
      WHERE escalated = 0 AND (sj_processed IS NULL OR sj_processed = 0)
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
    if (inserted) {
      generated++;
      try {
        db.prepare(`UPDATE tag_mismatches SET sj_processed = 1 WHERE entry_id = ?`).run(m.entry_id);
      } catch { /* ignore */ }
    }
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
      SELECT entry_id, devtag, file_path FROM dead_tag_records
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
      evidence_summary: `Protocol 2 (dead_code): dead_tag_records row ${d.entry_id} — devtag '${d.devtag}' has no live references (file=${d.file_path || 'n/a'})`,
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
      SELECT devtag, COUNT(*) as cnt, MAX(file_path) as file_path
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
  let failures: Array<{ entry_id: string; component: string; failure_type: string; file_path?: string; cycle_id?: string }> = [];
  try {
    failures = db.prepare(`
      SELECT entry_id, component, failure_type, file_path, cycle_id
      FROM integration_failures
      WHERE resolved = 0 AND created_at < datetime('now', '-1 hour')
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
      priority: 'high',
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
      SELECT p.entry_id, p.pattern_type, p.description, p.file_path, p.severity
      FROM patterns p
      WHERE p.systemic = 1
        AND NOT EXISTS (
          SELECT 1 FROM job_records jr
          WHERE jr.job_category = 'anti_pattern_mitigation'
            AND jr.implementation_status NOT IN ('rejected','archived','implemented')
            AND json_extract(jr.source_record_ids, '$[1]') = p.entry_id
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

  const cycleCount = (state.cycle_count || 0) + 1;
  updateCrawlerState(db, { cycle_count: cycleCount });

  // Check blame queue depth
  let blameQueueDepth = 0;
  try {
    const bq1 = db.prepare(`SELECT COUNT(*) as cnt FROM tool_criticisms WHERE sj_processed IS NULL OR sj_processed = 0`).get() as { cnt: number };
    const bq2 = db.prepare(`SELECT COUNT(*) as cnt FROM tag_mismatches WHERE escalated = 0 AND (sj_processed IS NULL OR sj_processed = 0)`).get() as { cnt: number };
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
    // INDEPENDENT MODE — round-robin through protocols 1-10
    const currentProtocol = ((state as unknown as { current_protocol?: number }).current_protocol || 0) % 10 + 1;
    mode = 'independent';
    updateCrawlerState(db, { mode: 'independent', current_protocol: currentProtocol, status_message: `Running protocol ${currentProtocol}` });

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
    ];

    generated = protocolFns[currentProtocol - 1]?.(db, cycleCount) || 0;
    updateCrawlerState(db, {
      last_independent_run_at: new Date().toISOString(),
      jobs_generated_total: (state.jobs_generated_total || 0) + generated,
      status_message: `Protocol ${currentProtocol} complete — generated ${generated} jobs`,
    });

    const stability = recordStabilitySnapshot(db, cycleCount, false);
    if (stability.triggered) {
      updateCrawlerState(db, {
        mode: 'rollback_halt',
        status_message: `Stability rollback triggered (${stability.reason || 'unknown'}) — halting pipeline`,
      });
      return { mode: 'rollback_halt', generated: 0, protocol: currentProtocol };
    }

    return { mode, generated, protocol: currentProtocol };
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
