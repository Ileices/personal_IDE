// ============================================
// Project State Crawler Routes
// REST + SSE endpoints for the PSC system
// ============================================
import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { runProjectStateCrawler } from '../services/projectStateCrawler/index.js';

// ── Helper ────────────────────────────────────
function getDb(app: FastifyInstance) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (app as any).db;
}

// ── Route registration ────────────────────────
export async function projectStateCrawlerRoutes(app: FastifyInstance) {

  // ── GET /snapshots ───────────────────────────
  // List recent crawl snapshots with drift summary
  app.get('/snapshots', async (_req: FastifyRequest, reply: FastifyReply) => {
    const db = getDb(app);
    const rows = db.prepare(`
      SELECT
        snapshot_id, cycle_id, project_path, status, triggered_by,
        total_files, skipped_files_count, total_devtags,
        registry_surplus_count, registry_deficit_count,
        content_drift_count, location_drift_count,
        systemic_drift_flagged, parse_duration_ms,
        timestamp, created_at, error_message
      FROM ground_truth_snapshots
      ORDER BY created_at DESC
      LIMIT 100
    `).all();
    return reply.send(rows);
  });

  // ── GET /snapshots/:id ───────────────────────
  // Full snapshot details
  app.get('/snapshots/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const db = getDb(app);
    const row = db.prepare(`
      SELECT * FROM ground_truth_snapshots WHERE snapshot_id = ?
    `).get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'Snapshot not found' });
    return reply.send(row);
  });

  // ── GET /snapshots/:id/devtags ───────────────
  // Paginated devtag list for a snapshot
  app.get('/snapshots/:id/devtags', async (
    req: FastifyRequest<{
      Params: { id: string };
      Querystring: { limit?: string; offset?: string; type?: string; language?: string; file?: string; name?: string };
    }>,
    reply: FastifyReply,
  ) => {
    const db = getDb(app);
    const limit = Math.min(parseInt(req.query.limit || '200', 10), 500);
    const offset = parseInt(req.query.offset || '0', 10);
    const { type, language, file, name } = req.query;

    const conditions: string[] = ['snapshot_id = ?'];
    const params: unknown[] = [req.params.id];

    if (type) { conditions.push('devtag_type = ?'); params.push(type); }
    if (language) { conditions.push('language = ?'); params.push(language); }
    if (file) { conditions.push('file_path LIKE ?'); params.push(`%${file}%`); }
    if (name) { conditions.push('devtag_name LIKE ?'); params.push(`%${name}%`); }

    const where = conditions.join(' AND ');

    const rows = db.prepare(`
      SELECT entry_id, devtag_type, devtag_name, file_path, line_start, line_end,
             parent_devtag, content_hash, language, relationship_tags, created_at
      FROM snapshot_devtags
      WHERE ${where}
      ORDER BY file_path, line_start
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const total = (db.prepare(`SELECT COUNT(*) as cnt FROM snapshot_devtags WHERE ${where}`).get(...params) as { cnt: number }).cnt;

    return reply.send({ rows, total, limit, offset });
  });

  // ── GET /drift-events ────────────────────────
  // List drift events with optional filters
  app.get('/drift-events', async (
    req: FastifyRequest<{
      Querystring: {
        snapshot_id?: string;
        drift_type?: string;
        severity?: string;
        resolved?: string;
        limit?: string;
        offset?: string;
      };
    }>,
    reply: FastifyReply,
  ) => {
    const db = getDb(app);
    const limit = Math.min(parseInt(req.query.limit || '200', 10), 500);
    const offset = parseInt(req.query.offset || '0', 10);

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (req.query.snapshot_id) { conditions.push('snapshot_id = ?'); params.push(req.query.snapshot_id); }
    if (req.query.drift_type) { conditions.push('drift_type = ?'); params.push(req.query.drift_type); }
    if (req.query.severity) { conditions.push('severity = ?'); params.push(req.query.severity); }
    if (req.query.resolved !== undefined) {
      conditions.push('resolved = ?');
      params.push(req.query.resolved === 'true' ? 1 : 0);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = db.prepare(`
      SELECT entry_id, snapshot_id, drift_type, devtag, devtag_type, file_path,
             line_start_registry, line_start_snapshot,
             content_hash_registry, content_hash_snapshot,
             severity, resolved, resolver_agent_id, resolved_at,
             systemic, timestamp, created_at
      FROM drift_events
      ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const total = (db.prepare(`SELECT COUNT(*) as cnt FROM drift_events ${where}`).get(...params) as { cnt: number }).cnt;

    return reply.send({ rows, total, limit, offset });
  });

  // ── PATCH /drift-events/:id/resolve ─────────
  app.patch('/drift-events/:id/resolve', async (
    req: FastifyRequest<{
      Params: { id: string };
      Body: { resolver_agent_id?: string };
    }>,
    reply: FastifyReply,
  ) => {
    const db = getDb(app);
    const info = db.prepare(`
      UPDATE drift_events
      SET resolved = 1, resolver_agent_id = ?, resolved_at = datetime('now')
      WHERE entry_id = ?
    `).run(req.body?.resolver_agent_id ?? 'user', req.params.id);
    if (info.changes === 0) return reply.code(404).send({ error: 'Drift event not found' });
    return reply.send({ ok: true });
  });

  // ── GET /skipped-files ───────────────────────
  app.get('/skipped-files', async (
    req: FastifyRequest<{ Querystring: { snapshot_id?: string; limit?: string; offset?: string } }>,
    reply: FastifyReply,
  ) => {
    const db = getDb(app);
    const limit = Math.min(parseInt(req.query.limit || '200', 10), 500);
    const offset = parseInt(req.query.offset || '0', 10);

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (req.query.snapshot_id) { conditions.push('snapshot_id = ?'); params.push(req.query.snapshot_id); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = db.prepare(`
      SELECT entry_id, snapshot_id, file_path, skip_reason, file_size_bytes, timestamp
      FROM psc_skipped_files
      ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const total = (db.prepare(`SELECT COUNT(*) as cnt FROM psc_skipped_files ${where}`).get(...params) as { cnt: number }).cnt;

    return reply.send({ rows, total, limit, offset });
  });

  // ── GET /language-registry ───────────────────
  app.get('/language-registry', async (_req: FastifyRequest, reply: FastifyReply) => {
    const db = getDb(app);
    const rows = db.prepare(`
      SELECT language_id, file_extension, grammar_name, grammar_version, registered_by, enabled, timestamp
      FROM language_registry
      ORDER BY file_extension ASC
    `).all();
    return reply.send(rows);
  });

  // ── POST /language-registry ──────────────────
  app.post('/language-registry', async (
    req: FastifyRequest<{
      Body: {
        file_extension: string;
        grammar_name: string;
        grammar_version?: string;
        registered_by?: string;
      };
    }>,
    reply: FastifyReply,
  ) => {
    const db = getDb(app);
    const { file_extension, grammar_name, grammar_version = '1.0.0', registered_by = 'user' } = req.body ?? {};
    if (!file_extension || !grammar_name) {
      return reply.code(400).send({ error: 'file_extension and grammar_name are required' });
    }
    const id = randomUUID();
    const langId = `${grammar_name}_${file_extension}`;
    db.prepare(`
      INSERT INTO language_registry
        (id, language_id, file_extension, grammar_name, grammar_version, registered_by)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(language_id) DO UPDATE SET
        grammar_name = excluded.grammar_name,
        grammar_version = excluded.grammar_version,
        registered_by = excluded.registered_by
    `).run(id, langId, file_extension, grammar_name, grammar_version, registered_by);
    return reply.code(201).send({ ok: true, language_id: langId });
  });

  // ── POST /run (SSE) ──────────────────────────
  // Run full project crawl with SSE progress stream
  app.post('/run', async (
    req: FastifyRequest<{ Body: { project_root?: string; triggered_by?: string } }>,
    reply: FastifyReply,
  ) => {
    const db = getDb(app);
    const projectRoot = req.body?.project_root || process.cwd();
    const triggeredBy = req.body?.triggered_by || 'manual';

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (data: object) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      await runProjectStateCrawler(db, {
        projectRoot,
        triggeredBy,
        onProgress: (ev) => send(ev),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      send({ type: 'error', message: msg });
    }

    reply.raw.write('data: [DONE]\n\n');
    reply.raw.end();
  });

  // ── POST /run-file ────────────────────────────
  // Re-parse a single file (Skeptic Agent on-demand)
  app.post('/run-file', async (
    req: FastifyRequest<{ Body: { file_path: string; snapshot_id?: string } }>,
    reply: FastifyReply,
  ) => {
    const { file_path, snapshot_id } = req.body ?? {};
    if (!file_path) return reply.code(400).send({ error: 'file_path is required' });

    const { parseFile } = await import('../services/projectStateCrawler/parser.js');
    const records = parseFile(file_path);
    return reply.send({ file_path, snapshot_id: snapshot_id ?? null, records, count: records.length });
  });

  // ── GET /memory ───────────────────────────────
  // PSC memory output — stats for latest snapshot
  app.get('/memory', async (_req: FastifyRequest, reply: FastifyReply) => {
    const db = getDb(app);

    const latest = db.prepare(`
      SELECT * FROM ground_truth_snapshots ORDER BY created_at DESC LIMIT 1
    `).get() as Record<string, unknown> | undefined;

    if (!latest) return reply.send({ message: 'No snapshots yet', latest: null, stats: null });

    const snapshotId = latest['snapshot_id'] as string;

    const typeBreakdown = db.prepare(`
      SELECT devtag_type, COUNT(*) as cnt
      FROM snapshot_devtags WHERE snapshot_id = ?
      GROUP BY devtag_type ORDER BY cnt DESC
    `).all(snapshotId) as Array<{ devtag_type: string; cnt: number }>;

    const langBreakdown = db.prepare(`
      SELECT language, COUNT(*) as cnt
      FROM snapshot_devtags WHERE snapshot_id = ?
      GROUP BY language ORDER BY cnt DESC
    `).all(snapshotId) as Array<{ language: string; cnt: number }>;

    const driftSummary = db.prepare(`
      SELECT drift_type, severity, COUNT(*) as cnt
      FROM drift_events WHERE snapshot_id = ?
      GROUP BY drift_type, severity
    `).all(snapshotId) as Array<{ drift_type: string; severity: string; cnt: number }>;

    const topDriftFiles = db.prepare(`
      SELECT file_path, COUNT(*) as drift_count
      FROM drift_events WHERE snapshot_id = ?
      GROUP BY file_path ORDER BY drift_count DESC LIMIT 10
    `).all(snapshotId) as Array<{ file_path: string; drift_count: number }>;

    return reply.send({
      latest,
      stats: {
        typeBreakdown,
        langBreakdown,
        driftSummary,
        topDriftFiles,
      },
    });
  });

  // ── GET /snapshots/:id/directory-stats ───────
  // Per-directory devtag breakdown for a snapshot
  app.get('/snapshots/:id/directory-stats', async (
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    const db = getDb(app);
    const rows = db.prepare(`
      SELECT directory_path, file_count, devtag_count, skipped_count,
             parse_duration_ms, sub_crawler_status, error_message, created_at
      FROM psc_directory_stats
      WHERE snapshot_id = ?
      ORDER BY devtag_count DESC
    `).all(req.params.id);
    return reply.send(rows);
  });

  // ── GET /whitelist ───────────────────────────
  app.get('/whitelist', async (_req: FastifyRequest, reply: FastifyReply) => {
    const db = getDb(app);
    const rows = db.prepare(`SELECT id, path_pattern, reason, added_by, force_parse, created_at FROM psc_whitelist ORDER BY created_at DESC`).all();
    return reply.send(rows);
  });

  // ── POST /whitelist ──────────────────────────
  app.post('/whitelist', async (
    req: FastifyRequest<{ Body: { path_pattern: string; reason?: string; added_by?: string } }>,
    reply: FastifyReply,
  ) => {
    const db = getDb(app);
    const { path_pattern, reason = 'manually_added', added_by = 'user' } = req.body || {};
    if (!path_pattern) return reply.code(400).send({ error: 'path_pattern is required' });
    const id = randomUUID();
    db.prepare(`
      INSERT INTO psc_whitelist (id, path_pattern, reason, added_by, force_parse, created_at)
      VALUES (?, ?, ?, ?, 1, datetime('now'))
    `).run(id, path_pattern, reason, added_by);
    return reply.code(201).send({ id, path_pattern, reason, added_by });
  });

  // ── DELETE /whitelist/:id ────────────────────
  app.delete('/whitelist/:id', async (
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    const db = getDb(app);
    const info = db.prepare(`DELETE FROM psc_whitelist WHERE id = ?`).run(req.params.id);
    if (info.changes === 0) return reply.code(404).send({ error: 'Whitelist entry not found' });
    return reply.send({ deleted: true });
  });

  // ── GET /vocabulary-gaps ─────────────────────
  app.get('/vocabulary-gaps', async (
    req: FastifyRequest<{ Querystring: { cycle_id?: string; resolved?: string; limit?: string } }>,
    reply: FastifyReply,
  ) => {
    const db = getDb(app);
    const limit = Math.min(parseInt(req.query.limit || '200', 10), 1000);
    const resolved = req.query.resolved !== undefined ? (req.query.resolved === '1' || req.query.resolved === 'true' ? 1 : 0) : null;
    const cycleId = req.query.cycle_id;

    let sql = `SELECT * FROM vocabulary_gaps WHERE 1=1`;
    const params: (string | number)[] = [];
    if (resolved !== null) { sql += ` AND resolved = ?`; params.push(resolved); }
    if (cycleId) { sql += ` AND first_detected_cycle = ?`; params.push(cycleId); }
    sql += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(sql).all(...params);
    return reply.send(rows);
  });

  // ── GET /tag-mismatches ──────────────────────
  app.get('/tag-mismatches', async (
    req: FastifyRequest<{ Querystring: { cycle_id?: string; severity?: string; mismatch_type?: string; limit?: string } }>,
    reply: FastifyReply,
  ) => {
    const db = getDb(app);
    const limit = Math.min(parseInt(req.query.limit || '200', 10), 1000);
    const { cycle_id, severity, mismatch_type } = req.query;

    let sql = `SELECT * FROM tag_mismatches WHERE agent_id = 'psc'`;
    const params: (string | number)[] = [];
    if (cycle_id) { sql += ` AND cycle_id = ?`; params.push(cycle_id); }
    if (severity) { sql += ` AND severity = ?`; params.push(severity); }
    if (mismatch_type) { sql += ` AND mismatch_type = ?`; params.push(mismatch_type); }
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(sql).all(...params);
    return reply.send(rows);
  });
}
