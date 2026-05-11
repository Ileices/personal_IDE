// ============================================
// Suggested Jobs System — REST API Routes
// prefix: /api/suggested-jobs
// ============================================
import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  runSuggestedJobsCrawlerTick,
  runSandboxTick,
  getCrawlerStatus,
} from '../services/suggestedJobsCrawler/index.js';

const VALID_STATUSES = ['suggested', 'sandbox_ready', 'implementing', 'implemented', 'rejected', 'archived'] as const;
const VALID_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
const VALID_CATEGORIES = [
  'test_missing', 'dead_code_removal', 'debt_reduction', 'regression_hardening',
  'integration_repair', 'anti_pattern_mitigation', 'tag_schema_extension',
  'performance_test_missing', 'security_gap', 'nano_coverage_gap',
  'model_tool_enhancement', 'model_config_promotion', 'external_project',
  'user_requested', 'god_factory_scan',
] as const;

// ── Helpers ─────────────────────────────────
function safeJson(val: unknown): unknown {
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return val; }
  }
  return val;
}

function hydrateJob(row: Record<string, unknown>) {
  return {
    ...row,
    source_record_ids: safeJson(row.source_record_ids),
    affected_files: safeJson(row.affected_files),
    affected_devtags: safeJson(row.affected_devtags),
    affected_plantags: safeJson(row.affected_plantags),
    required_buildtags: safeJson(row.required_buildtags),
    blocking_jobs: safeJson(row.blocking_jobs),
    blocked_by_jobs: safeJson(row.blocked_by_jobs),
    hierarchy: safeJson(row.hierarchy),
    atomic_steps: safeJson(row.atomic_steps),
    sandbox_spec: safeJson(row.sandbox_spec),
  };
}

function priorityOrder(priority: string): number {
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return order[priority] ?? 4;
}

export async function suggestedJobsRoutes(app: FastifyInstance) {
  const db = (app as unknown as { db: import('better-sqlite3').Database }).db;

  function resolveScopedProjectId(projectId: unknown): string | null {
    const normalized = String(projectId || '').trim();
    if (normalized) {
      const row = db.prepare('SELECT id FROM projects WHERE id = ?').get(normalized) as { id: string } | undefined;
      return row?.id ?? null;
    }

    const projects = db.prepare(`
      SELECT id
      FROM projects
      ORDER BY last_accessed_at DESC, created_at DESC
      LIMIT 2
    `).all() as Array<{ id: string }>;

    return projects.length === 1 ? projects[0].id : null;
  }

  // ── GET /jobs ─────────────────────────────────
  // Query: status?, priority?, category?, source?, limit?, offset?
  app.get('/jobs', async (req: FastifyRequest, reply: FastifyReply) => {
    const q = req.query as Record<string, string>;
    const limit = Math.min(parseInt(q.limit || '50', 10), 200);
    const offset = parseInt(q.offset || '0', 10);

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (q.status && VALID_STATUSES.includes(q.status as typeof VALID_STATUSES[number])) {
      conditions.push('implementation_status = ?');
      params.push(q.status);
    }
    if (q.priority && VALID_PRIORITIES.includes(q.priority as typeof VALID_PRIORITIES[number])) {
      conditions.push('priority = ?');
      params.push(q.priority);
    }
    if (q.category && VALID_CATEGORIES.includes(q.category as typeof VALID_CATEGORIES[number])) {
      conditions.push('job_category = ?');
      params.push(q.category);
    }
    if (q.source) {
      const validSources = ['blame_crawler', 'suggested_jobs_crawler', 'user', 'god_factory_agent'];
      if (validSources.includes(q.source)) {
        conditions.push('source = ?');
        params.push(q.source);
      }
    }
    if (q.search) {
      conditions.push("title LIKE ?");
      params.push(`%${q.search.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`);
    }
    if (q.project_id) {
      const scopedProjectId = resolveScopedProjectId(q.project_id);
      if (!scopedProjectId) return reply.status(400).send({ error: 'project_id must reference an existing project.' });
      conditions.push('project_id = ?');
      params.push(scopedProjectId);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const jobs = db.prepare(`
      SELECT * FROM job_records
      ${where}
      ORDER BY
        CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END ASC,
        created_cycle ASC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as Record<string, unknown>[];

    const total = (db.prepare(`SELECT COUNT(*) as cnt FROM job_records ${where}`).get(...params) as { cnt: number }).cnt;

    return reply.send({
      jobs: jobs.map(hydrateJob),
      total,
      limit,
      offset,
    });
  });

  // ── GET /jobs/stats ──────────────────────────
  app.get('/jobs/stats', async (req: FastifyRequest, reply: FastifyReply) => {
    const q = req.query as Record<string, string>;
    const scopedProjectId = q.project_id ? resolveScopedProjectId(q.project_id) : null;
    if (q.project_id && !scopedProjectId) {
      return reply.status(400).send({ error: 'project_id must reference an existing project.' });
    }
    const whereScoped = scopedProjectId ? ' AND project_id = ?' : '';
    const params = scopedProjectId ? [scopedProjectId] : [];

    const byStatus = db.prepare(`
      SELECT implementation_status as key, COUNT(*) as count FROM job_records
      WHERE implementation_status NOT IN ('rejected','archived')
      ${whereScoped}
      GROUP BY implementation_status
    `).all(...params) as { key: string; count: number }[];

    const byCategory = db.prepare(`
      SELECT job_category as key, COUNT(*) as count FROM job_records
      WHERE implementation_status NOT IN ('rejected','archived')
      ${whereScoped}
      GROUP BY job_category ORDER BY count DESC
    `).all(...params) as { key: string; count: number }[];

    const byPriority = db.prepare(`
      SELECT priority as key, COUNT(*) as count FROM job_records
      WHERE implementation_status NOT IN ('rejected','archived')
      ${whereScoped}
      GROUP BY priority
      ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
    `).all(...params) as { key: string; count: number }[];

    const bySource = db.prepare(`
      SELECT source as key, COUNT(*) as count FROM job_records ${scopedProjectId ? 'WHERE project_id = ?' : ''} GROUP BY source
    `).all(...params) as { key: string; count: number }[];

    const total = (db.prepare(`SELECT COUNT(*) as cnt FROM job_records ${scopedProjectId ? 'WHERE project_id = ?' : ''}`).get(...params) as { cnt: number }).cnt;
    const active = (db.prepare(`SELECT COUNT(*) as cnt FROM job_records WHERE implementation_status NOT IN ('rejected','archived','implemented')${whereScoped}`).get(...params) as { cnt: number }).cnt;

    return reply.send({ total, active, byStatus, byCategory, byPriority, bySource });
  });

  // ── GET /jobs/:id ────────────────────────────
  app.get('/jobs/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };

    const job = db.prepare(`SELECT * FROM job_records WHERE job_id = ? OR id = ?`).get(id, id) as Record<string, unknown> | undefined;
    if (!job) return reply.status(404).send({ error: 'Job not found' });

    const sandboxRuns = db.prepare(`
      SELECT * FROM sandbox_runs WHERE job_id = ? ORDER BY cycle_number DESC LIMIT 20
    `).all(job.job_id as string) as Record<string, unknown>[];

    const testResults = db.prepare(`
      SELECT * FROM sj_test_results WHERE job_id = ? ORDER BY timestamp DESC LIMIT 50
    `).all(job.job_id as string) as Record<string, unknown>[];

    const debugRecords = db.prepare(`
      SELECT * FROM sj_debug_records WHERE job_id = ? ORDER BY timestamp DESC LIMIT 20
    `).all(job.job_id as string) as Record<string, unknown>[];

    const implLog = db.prepare(`
      SELECT * FROM implementation_log WHERE job_id = ? ORDER BY timestamp ASC LIMIT 100
    `).all(job.job_id as string) as Record<string, unknown>[];

    return reply.send({
      job: hydrateJob(job),
      sandboxRuns: sandboxRuns.map(r => ({ ...r, test_results: safeJson(r.test_results), review_findings: safeJson(r.review_findings), debug_records: safeJson(r.debug_records) })),
      testResults: testResults.map(r => ({ ...r, failure_reason_tags: safeJson(r.failure_reason_tags) })),
      debugRecords,
      implementationLog: implLog.map(r => ({ ...r, test_result_ids: safeJson(r.test_result_ids) })),
    });
  });

  // ── POST /jobs ───────────────────────────────
  // Create a user-requested job
  app.post('/jobs', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as Record<string, unknown>;

    const title = (body.title as string || '').trim();
    if (!title) return reply.status(400).send({ error: 'title is required' });

    const category = (body.job_category as string) || 'user_requested';
    if (!VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number])) {
      return reply.status(400).send({ error: `Invalid job_category. Must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }

    const priority = (body.priority as string) || 'medium';
    if (!VALID_PRIORITIES.includes(priority as typeof VALID_PRIORITIES[number])) {
      return reply.status(400).send({ error: 'Invalid priority' });
    }

    const jobId = randomUUID();
    const sandboxSpec = {
      sandbox_id: null,
      status: 'not_started',
      cycle_limit: Math.min(parseInt(String(body.cycle_limit || 50), 10), 500),
      cycles_used: 0,
      test_results: [],
      human_review_required: false,
      human_review_completed: false,
    };

    const atomicSteps = Array.isArray(body.atomic_steps) ? body.atomic_steps : [];
    const affectedFiles = Array.isArray(body.affected_files) ? body.affected_files : [];
    const affectedDevtags = Array.isArray(body.affected_devtags) ? body.affected_devtags : [];
    const affectedPlantags = Array.isArray(body.affected_plantags) ? body.affected_plantags : [];
    const requiredBuildtags = Array.isArray(body.required_buildtags) ? body.required_buildtags : [];
    const scopedProjectId = resolveScopedProjectId(body.project_id ?? body.projectId);
    if ((body.project_id ?? body.projectId) !== undefined && !scopedProjectId) {
      return reply.status(400).send({ error: 'project_id must reference an existing project.' });
    }

    db.prepare(`
      INSERT INTO job_records
        (id, job_id, project_id, job_category, source, source_record_ids, priority, title,
         affected_files, affected_devtags, affected_plantags, required_buildtags,
         blocking_jobs, blocked_by_jobs, hierarchy, atomic_steps, sandbox_spec,
         implementation_status, created_cycle, last_updated_cycle, timestamp, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))
    `).run(
      randomUUID(), jobId, scopedProjectId, category, 'user', '[]', priority, title,
      JSON.stringify(affectedFiles), JSON.stringify(affectedDevtags),
      JSON.stringify(affectedPlantags), JSON.stringify(requiredBuildtags),
      '[]', '[]',
      JSON.stringify({ phase: 1, milestone: 'user_requested', parent_job_id: null, child_job_ids: [] }),
      JSON.stringify(atomicSteps),
      JSON.stringify(sandboxSpec),
      'suggested', 0, 0,
    );

    const created = db.prepare(`SELECT * FROM job_records WHERE job_id = ?`).get(jobId) as Record<string, unknown>;
    return reply.status(201).send({ job: hydrateJob(created) });
  });

  // ── PATCH /jobs/:id ──────────────────────────
  app.patch('/jobs/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;

    const job = db.prepare(`SELECT * FROM job_records WHERE job_id = ? OR id = ?`).get(id, id) as Record<string, unknown> | undefined;
    if (!job) return reply.status(404).send({ error: 'Job not found' });

    const sets: string[] = [];
    const vals: (string | number)[] = [];

    if (body.priority && VALID_PRIORITIES.includes(body.priority as typeof VALID_PRIORITIES[number])) {
      sets.push('priority = ?'); vals.push(body.priority as string);
    }
    if (body.title && typeof body.title === 'string') {
      sets.push('title = ?'); vals.push(body.title.trim());
    }
    if (body.cycle_limit !== undefined) {
      const cl = Math.min(parseInt(String(body.cycle_limit), 10), 500);
      if (!isNaN(cl)) {
        const spec = JSON.parse(job.sandbox_spec as string);
        spec.cycle_limit = cl;
        sets.push('sandbox_spec = ?'); vals.push(JSON.stringify(spec));
      }
    }
    if (body.atomic_steps !== undefined && Array.isArray(body.atomic_steps)) {
      sets.push('atomic_steps = ?'); vals.push(JSON.stringify(body.atomic_steps));
    }
    if (body.affected_files !== undefined && Array.isArray(body.affected_files)) {
      sets.push('affected_files = ?'); vals.push(JSON.stringify(body.affected_files));
    }
    if (body.affected_devtags !== undefined && Array.isArray(body.affected_devtags)) {
      sets.push('affected_devtags = ?'); vals.push(JSON.stringify(body.affected_devtags));
    }

    if (sets.length === 0) return reply.status(400).send({ error: 'No updatable fields provided' });
    sets.push(`last_updated_cycle = last_updated_cycle + 1`);

    db.prepare(`UPDATE job_records SET ${sets.join(', ')} WHERE job_id = ?`).run(...vals, job.job_id as string);
    const updated = db.prepare(`SELECT * FROM job_records WHERE job_id = ?`).get(job.job_id as string) as Record<string, unknown>;
    return reply.send({ job: hydrateJob(updated) });
  });

  // ── POST /jobs/:id/reject ─────────────────────
  app.post('/jobs/:id/reject', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const job = db.prepare(`SELECT job_id FROM job_records WHERE job_id = ? OR id = ?`).get(id, id) as { job_id: string } | undefined;
    if (!job) return reply.status(404).send({ error: 'Job not found' });
    db.prepare(`UPDATE job_records SET implementation_status = 'rejected', last_updated_cycle = last_updated_cycle + 1 WHERE job_id = ?`).run(job.job_id);
    return reply.send({ status: 'rejected', job_id: job.job_id });
  });

  // ── POST /jobs/:id/archive ────────────────────
  app.post('/jobs/:id/archive', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const job = db.prepare(`SELECT job_id FROM job_records WHERE job_id = ? OR id = ?`).get(id, id) as { job_id: string } | undefined;
    if (!job) return reply.status(404).send({ error: 'Job not found' });
    db.prepare(`UPDATE job_records SET implementation_status = 'archived', last_updated_cycle = last_updated_cycle + 1 WHERE job_id = ?`).run(job.job_id);
    return reply.send({ status: 'archived', job_id: job.job_id });
  });

  // ── POST /jobs/:id/implement ──────────────────
  // Transitions job to 'implementing'. Must be sandbox_ready or have override.
  app.post('/jobs/:id/implement', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    const job = db.prepare(`SELECT * FROM job_records WHERE job_id = ? OR id = ?`).get(id, id) as Record<string, unknown> | undefined;
    if (!job) return reply.status(404).send({ error: 'Job not found' });

    const currentStatus = job.implementation_status as string;
    if (currentStatus === 'implementing') return reply.status(409).send({ error: 'Job already implementing' });
    if (currentStatus === 'implemented') return reply.status(409).send({ error: 'Job already implemented' });
    if (!['sandbox_ready', 'suggested'].includes(currentStatus) && !body.override_sandbox) {
      return reply.status(409).send({ error: `Job is ${currentStatus}. Must be sandbox_ready or pass override_sandbox=true` });
    }

    // Log start
    db.prepare(`
      INSERT INTO implementation_log (id, log_id, job_id, stage, step_id, timestamp)
      VALUES (?,?,?,'start',null,datetime('now'))
    `).run(randomUUID(), randomUUID(), job.job_id as string);

    db.prepare(`UPDATE job_records SET implementation_status = 'implementing', last_updated_cycle = last_updated_cycle + 1 WHERE job_id = ?`).run(job.job_id as string);

    const updated = db.prepare(`SELECT * FROM job_records WHERE job_id = ?`).get(job.job_id as string) as Record<string, unknown>;
    return reply.send({ job: hydrateJob(updated) });
  });

  // ── POST /jobs/:id/sandbox/start ──────────────
  app.post('/jobs/:id/sandbox/start', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const job = db.prepare(`SELECT * FROM job_records WHERE job_id = ? OR id = ?`).get(id, id) as Record<string, unknown> | undefined;
    if (!job) return reply.status(404).send({ error: 'Job not found' });

    const spec = JSON.parse(job.sandbox_spec as string);
    const sandboxId = spec.sandbox_id || randomUUID();
    spec.sandbox_id = sandboxId;
    spec.status = 'building';
    spec.cycles_used = 0;

    db.prepare(`
      INSERT INTO sandbox_runs (id, run_id, job_id, cycle_number, stage, timestamp)
      VALUES (?,?,?,0,'building',datetime('now'))
    `).run(randomUUID(), randomUUID(), job.job_id as string);

    db.prepare(`UPDATE job_records SET sandbox_spec = ?, last_updated_cycle = last_updated_cycle + 1 WHERE job_id = ?`)
      .run(JSON.stringify(spec), job.job_id as string);

    return reply.send({ sandbox_id: sandboxId, status: 'building', job_id: job.job_id });
  });

  // ── POST /jobs/:id/sandbox/human-review-request ─
  app.post('/jobs/:id/sandbox/human-review-request', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const job = db.prepare(`SELECT * FROM job_records WHERE job_id = ? OR id = ?`).get(id, id) as Record<string, unknown> | undefined;
    if (!job) return reply.status(404).send({ error: 'Job not found' });

    const spec = JSON.parse(job.sandbox_spec as string);
    spec.human_review_required = true;
    spec.human_review_completed = false;

    db.prepare(`UPDATE job_records SET sandbox_spec = ?, last_updated_cycle = last_updated_cycle + 1 WHERE job_id = ?`)
      .run(JSON.stringify(spec), job.job_id as string);

    return reply.send({ status: 'human_review_requested', job_id: job.job_id });
  });

  // ── POST /jobs/:id/sandbox/abandon ────────────
  // Sets sandbox status to 'abandoned' — spec invariant: only user or God Factory agent
  app.post('/jobs/:id/sandbox/abandon', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const job = db.prepare(`SELECT * FROM job_records WHERE job_id = ? OR id = ?`).get(id, id) as Record<string, unknown> | undefined;
    if (!job) return reply.status(404).send({ error: 'Job not found' });

    const spec = JSON.parse(job.sandbox_spec as string);
    spec.status = 'abandoned';

    db.prepare(`UPDATE job_records SET sandbox_spec = ?, last_updated_cycle = last_updated_cycle + 1 WHERE job_id = ?`)
      .run(JSON.stringify(spec), job.job_id as string);

    return reply.send({ status: 'abandoned', job_id: job.job_id });
  });

  // ── POST /jobs/:id/sandbox/extend-cycle-limit ──
  // Extends cycle_limit. Per spec: ONLY user or God Factory Self-Improvement Agent may call this.
  app.post('/jobs/:id/sandbox/extend-cycle-limit', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    const job = db.prepare(`SELECT * FROM job_records WHERE job_id = ? OR id = ?`).get(id, id) as Record<string, unknown> | undefined;
    if (!job) return reply.status(404).send({ error: 'Job not found' });

    const extend = parseInt(String(body.extend_by || 50), 10);
    if (isNaN(extend) || extend <= 0) return reply.status(400).send({ error: 'extend_by must be a positive integer' });

    const spec = JSON.parse(job.sandbox_spec as string);
    const oldLimit = spec.cycle_limit || 50;
    spec.cycle_limit = Math.min(oldLimit + extend, 1000);  // cap at 1000

    db.prepare(`UPDATE job_records SET sandbox_spec = ?, last_updated_cycle = last_updated_cycle + 1 WHERE job_id = ?`)
      .run(JSON.stringify(spec), job.job_id as string);

    return reply.send({
      job_id: job.job_id,
      old_cycle_limit: oldLimit,
      new_cycle_limit: spec.cycle_limit,
      extended_by: spec.cycle_limit - oldLimit,
    });
  });

  // ── POST /jobs/:id/sandbox/human-review-complete ─
  app.post('/jobs/:id/sandbox/human-review-complete', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    const job = db.prepare(`SELECT * FROM job_records WHERE job_id = ? OR id = ?`).get(id, id) as Record<string, unknown> | undefined;
    if (!job) return reply.status(404).send({ error: 'Job not found' });

    const spec = JSON.parse(job.sandbox_spec as string);
    spec.human_review_completed = true;
    spec.human_review_notes = body.notes || null;

    db.prepare(`UPDATE job_records SET sandbox_spec = ?, last_updated_cycle = last_updated_cycle + 1 WHERE job_id = ?`)
      .run(JSON.stringify(spec), job.job_id as string);

    return reply.send({ status: 'human_review_completed', job_id: job.job_id });
  });

  // ── POST /jobs/merge ─────────────────────────
  // Merge job_b into job_a (combines affected devtags, marks job_b archived)
  app.post('/jobs/merge', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as Record<string, unknown>;
    const aId = body.job_a as string;
    const bId = body.job_b as string;
    if (!aId || !bId) return reply.status(400).send({ error: 'job_a and job_b are required' });

    const jobA = db.prepare(`SELECT * FROM job_records WHERE job_id = ? OR id = ?`).get(aId, aId) as Record<string, unknown> | undefined;
    const jobB = db.prepare(`SELECT * FROM job_records WHERE job_id = ? OR id = ?`).get(bId, bId) as Record<string, unknown> | undefined;
    if (!jobA || !jobB) return reply.status(404).send({ error: 'One or both jobs not found' });

    const mergedDevtags = Array.from(new Set([
      ...(safeJson(jobA.affected_devtags) as string[]),
      ...(safeJson(jobB.affected_devtags) as string[]),
    ]));
    const mergedFiles = Array.from(new Set([
      ...(safeJson(jobA.affected_files) as string[]),
      ...(safeJson(jobB.affected_files) as string[]),
    ]));
    const mergedSteps = [
      ...(safeJson(jobA.atomic_steps) as object[]),
      ...(safeJson(jobB.atomic_steps) as object[]),
    ];
    const mergedSrcIds = Array.from(new Set([
      ...(safeJson(jobA.source_record_ids) as string[]),
      ...(safeJson(jobB.source_record_ids) as string[]),
      jobB.job_id as string,
    ]));

    db.prepare(`
      UPDATE job_records SET
        affected_devtags = ?,
        affected_files = ?,
        atomic_steps = ?,
        source_record_ids = ?,
        last_updated_cycle = last_updated_cycle + 1
      WHERE job_id = ?
    `).run(
      JSON.stringify(mergedDevtags), JSON.stringify(mergedFiles),
      JSON.stringify(mergedSteps), JSON.stringify(mergedSrcIds),
      jobA.job_id as string,
    );

    db.prepare(`UPDATE job_records SET implementation_status = 'archived', last_updated_cycle = last_updated_cycle + 1 WHERE job_id = ?`)
      .run(jobB.job_id as string);

    const updated = db.prepare(`SELECT * FROM job_records WHERE job_id = ?`).get(jobA.job_id as string) as Record<string, unknown>;
    return reply.send({ merged_into: hydrateJob(updated), archived_job_id: jobB.job_id });
  });

  // ── GET /crawler/status ───────────────────────
  app.get('/crawler/status', async (_req: FastifyRequest, reply: FastifyReply) => {
    const status = getCrawlerStatus(db);
    return reply.send(status);
  });

  // ── POST /crawler/tick ────────────────────────
  // Manually trigger one crawler tick (for testing / on-demand)
  app.post('/crawler/tick', async (_req: FastifyRequest, reply: FastifyReply) => {
    const result = runSuggestedJobsCrawlerTick(db);
    return reply.send(result);
  });

  // ── GET /sandbox-runs ─────────────────────────
  // Get recent sandbox runs across all jobs
  app.get('/sandbox-runs', async (req: FastifyRequest, reply: FastifyReply) => {
    const q = req.query as Record<string, string>;
    const limit = Math.min(parseInt(q.limit || '50', 10), 200);
    const jobId = q.job_id;

    const where = jobId ? 'WHERE job_id = ?' : '';
    const params = jobId ? [jobId, limit] : [limit];

    const runs = db.prepare(`
      SELECT * FROM sandbox_runs ${where}
      ORDER BY timestamp DESC LIMIT ?
    `).all(...params) as Record<string, unknown>[];

    return reply.send({
      runs: runs.map(r => ({
        ...r,
        test_results: safeJson(r.test_results),
        review_findings: safeJson(r.review_findings),
        debug_records: safeJson(r.debug_records),
      })),
    });
  });

  // ── GET /test-results ─────────────────────────
  app.get('/test-results', async (req: FastifyRequest, reply: FastifyReply) => {
    const q = req.query as Record<string, string>;
    const limit = Math.min(parseInt(q.limit || '50', 10), 200);
    const jobId = q.job_id;

    const where = jobId ? 'WHERE job_id = ?' : '';
    const params = jobId ? [jobId, limit] : [limit];

    const results = db.prepare(`
      SELECT * FROM sj_test_results ${where}
      ORDER BY timestamp DESC LIMIT ?
    `).all(...params) as Record<string, unknown>[];

    return reply.send({
      results: results.map(r => ({ ...r, failure_reason_tags: safeJson(r.failure_reason_tags) })),
    });
  });

  // ── GET /implementation-log ───────────────────
  app.get('/implementation-log', async (req: FastifyRequest, reply: FastifyReply) => {
    const q = req.query as Record<string, string>;
    const limit = Math.min(parseInt(q.limit || '100', 10), 500);
    const jobId = q.job_id;

    const where = jobId ? 'WHERE job_id = ?' : '';
    const params = jobId ? [jobId, limit] : [limit];

    const log = db.prepare(`
      SELECT * FROM implementation_log ${where}
      ORDER BY timestamp DESC LIMIT ?
    `).all(...params) as Record<string, unknown>[];

    return reply.send({ log: log.map(r => ({ ...r, test_result_ids: safeJson(r.test_result_ids) })) });
  });

  // ── GET /crash-recovery-log ───────────────────
  app.get('/crash-recovery-log', async (req: FastifyRequest, reply: FastifyReply) => {
    const q = req.query as Record<string, string>;
    const limit = Math.min(parseInt(q.limit || '50', 10), 200);
    const log = db.prepare(`SELECT * FROM crash_recovery_log ORDER BY timestamp DESC LIMIT ?`).all(limit) as Record<string, unknown>[];
    return reply.send({ log });
  });
}
