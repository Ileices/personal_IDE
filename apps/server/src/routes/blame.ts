// ============================================
// Blame Routes — model attribution + quality
// Endpoints:
//   GET  /api/blame/records     — paginated blame records + aggregated stats
//   POST /api/blame/record      — write a new blame record
//   GET  /api/blame/registry    — model registry (aggregated stats per model)
//   POST /api/blame/crawl       — run quality analysis crawler (SSE stream)
//   POST /api/blame/apply-config — apply updated model strategy configs
// ============================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';

export async function blameRoutes(app: FastifyInstance) {
  const db = (app as any).db;

  // ── GET /records ──────────────────────────
  app.get('/records', async (req: FastifyRequest, reply: FastifyReply) => {
    const { limit = 100, model, mode, projectId } = req.query as Record<string, string>;

    const lim = Math.min(Number(limit) || 100, 500);

    // Build WHERE clause
    const wheres: string[] = [];
    const params: any[] = [];
    if (model) { wheres.push('b.model LIKE ?'); params.push(`%${model}%`); }
    if (mode)  { wheres.push('b.mode = ?');    params.push(mode); }
    if (projectId) { wheres.push('b.project_id = ?'); params.push(projectId); }

    const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';

    let records: any[] = [];
    let stats: any[] = [];

    try {
      records = db.prepare(`
        SELECT b.*, q.tag_conformance, q.instruction_adherence,
               q.hallucination, q.structural_integrity, q.output_efficiency
        FROM blame_records b
        LEFT JOIN quality_records q ON q.blame_id = b.id
        ${where}
        ORDER BY b.created_at DESC
        LIMIT ?
      `).all(...params, lim);

      // Aggregate stats per model from model_registry if populated,
      // else fall back to blame_records aggregation
      const regRows: any[] = db.prepare('SELECT * FROM model_registry ORDER BY total_runs DESC').all();

      if (regRows.length > 0) {
        stats = regRows.map(r => ({
          model: r.model_id,
          totalRuns: r.total_runs,
          successRate: r.success_rate,
          avgQuality: r.avg_quality,
          avgLatencyMs: r.avg_latency_ms,
          totalTokens: r.total_tokens,
          lastUsed: r.last_run_at || r.updated_at,
          trend: r.trend,
          tagConformance: r.tag_conformance,
          instructionAdherence: r.instruction_adherence,
          hallucination: r.hallucination,
          structuralIntegrity: r.structural_integrity,
          outputEfficiency: r.output_efficiency,
        }));
      } else {
        // Fallback: aggregate live from blame_records
        const aggRows: any[] = db.prepare(`
          SELECT model,
                 COUNT(*) as total_runs,
                 AVG(CASE WHEN success = 1 THEN 1.0 ELSE 0.0 END) as success_rate,
                 AVG(COALESCE(quality, 0)) as avg_quality,
                 AVG(COALESCE(latency_ms, 0)) as avg_latency_ms,
                 SUM(COALESCE(token_count, 0)) as total_tokens,
                 MAX(created_at) as last_used
          FROM blame_records
          GROUP BY model
          ORDER BY total_runs DESC
        `).all();

        stats = aggRows.map(r => ({
          model: r.model,
          totalRuns: r.total_runs,
          successRate: r.success_rate,
          avgQuality: r.avg_quality,
          avgLatencyMs: r.avg_latency_ms,
          totalTokens: r.total_tokens,
          lastUsed: r.last_used,
          trend: 'flat',
        }));
      }
    } catch {
      // Tables may not exist yet (migration pending) — return empty
      return reply.send({ records: [], stats: [] });
    }

    // Normalize record field names (snake_case → camelCase for frontend)
    const normalized = records.map((r: any) => ({
      id: r.id,
      model: r.model,
      mode: r.mode,
      projectId: r.project_id,
      timestamp: r.created_at,
      quality: r.quality,
      tokenCount: r.token_count,
      taskType: r.task_type,
      success: r.success === 1,
      errorType: r.error_type,
      filePath: r.file_path,
      latencyMs: r.latency_ms,
    }));

    return reply.send({ records: normalized, stats });
  });

  // ── POST /record ──────────────────────────
  app.post('/record', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      model: string;
      mode?: string;
      projectId?: string;
      conversationId?: string;
      agentRunId?: string;
      taskType?: string;
      quality?: number;
      success?: boolean;
      errorType?: string;
      filePath?: string;
      latencyMs?: number;
      tokenCount?: number;
      promptTokens?: number;
      completionTokens?: number;
    };

    if (!body.model) {
      return reply.status(400).send({ error: 'model is required' });
    }

    const id = randomUUID();
    try {
      db.prepare(`
        INSERT INTO blame_records
          (id, model, mode, project_id, conversation_id, agent_run_id,
           task_type, quality, success, error_type, file_path,
           latency_ms, token_count, prompt_tokens, completion_tokens)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        body.model,
        body.mode ?? 'ask',
        body.projectId ?? null,
        body.conversationId ?? null,
        body.agentRunId ?? null,
        body.taskType ?? 'unknown',
        body.quality ?? null,
        body.success !== false ? 1 : 0,
        body.errorType ?? null,
        body.filePath ?? null,
        body.latencyMs ?? null,
        body.tokenCount ?? null,
        body.promptTokens ?? null,
        body.completionTokens ?? null,
      );

      // Update model_registry (upsert)
      _upsertModelRegistry(db, body.model, {
        success: body.success !== false,
        quality: body.quality,
        latencyMs: body.latencyMs,
        tokenCount: body.tokenCount,
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }

    return reply.status(201).send({ id });
  });

  // ── GET /registry ─────────────────────────
  app.get('/registry', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const rows = db.prepare('SELECT * FROM model_registry ORDER BY total_runs DESC').all();
      return reply.send({ models: rows });
    } catch {
      return reply.send({ models: [] });
    }
  });

  // ── POST /crawl ───────────────────────────
  // Streams SSE events as it analyzes blame data and builds config recommendations
  app.post('/crawl', async (req: FastifyRequest, reply: FastifyReply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const emit = (data: object) => reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);

    emit({ log: 'BLAME crawler starting...' });

    try {
      let blameRows: any[] = [];
      try {
        blameRows = db.prepare('SELECT * FROM blame_records ORDER BY created_at DESC LIMIT 500').all();
      } catch {
        emit({ log: 'No blame_records table yet — run agent loops to generate data' });
        reply.raw.end();
        return;
      }

      emit({ log: `Loaded ${blameRows.length} blame records` });

      // Group by model
      const byModel = new Map<string, any[]>();
      for (const r of blameRows) {
        if (!byModel.has(r.model)) byModel.set(r.model, []);
        byModel.get(r.model)!.push(r);
      }

      emit({ log: `Analyzing ${byModel.size} models...` });

      const configUpdates: Record<string, any> = {};

      for (const [model, rows] of byModel.entries()) {
        const successCount = rows.filter(r => r.success === 1).length;
        const successRate = successCount / rows.length;
        const avgQuality = rows.reduce((a, r) => a + (r.quality ?? 0), 0) / rows.length;
        const avgLatency = rows.reduce((a, r) => a + (r.latency_ms ?? 0), 0) / rows.length;
        const totalTokens = rows.reduce((a, r) => a + (r.token_count ?? 0), 0);

        // Determine trend: compare first half vs second half quality
        const half = Math.floor(rows.length / 2);
        const firstHalfQ = rows.slice(half).reduce((a, r) => a + (r.quality ?? 0), 0) / (half || 1);
        const secondHalfQ = rows.slice(0, half).reduce((a, r) => a + (r.quality ?? 0), 0) / (half || 1);
        const trend = secondHalfQ > firstHalfQ + 5 ? 'up' : secondHalfQ < firstHalfQ - 5 ? 'down' : 'flat';

        // Update model_registry
        try {
          db.prepare(`
            INSERT INTO model_registry (id, model_id, display_name, provider, total_runs, success_rate,
              avg_quality, avg_latency_ms, total_tokens, trend, last_run_at, last_crawled_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            ON CONFLICT(model_id) DO UPDATE SET
              total_runs = excluded.total_runs,
              success_rate = excluded.success_rate,
              avg_quality = excluded.avg_quality,
              avg_latency_ms = excluded.avg_latency_ms,
              total_tokens = excluded.total_tokens,
              trend = excluded.trend,
              last_crawled_at = datetime('now'),
              updated_at = datetime('now')
          `).run(
            randomUUID(), model,
            model.split('/').pop() ?? model,
            model.split('/')[0] ?? 'unknown',
            rows.length, successRate, avgQuality, avgLatency, totalTokens, trend,
            rows[0]?.created_at ?? null,
          );
        } catch { /* ignore registry upsert errors */ }

        emit({ log: `  ${model.split('/').pop()}: quality=${Math.round(avgQuality)}% success=${Math.round(successRate * 100)}% trend=${trend}` });

        // Generate strategy config recommendations
        if (successRate < 0.5 || avgQuality < 40) {
          configUpdates[model] = { recommended: false, reason: 'low_quality', successRate, avgQuality };
        } else if (successRate > 0.85 && avgQuality > 70) {
          configUpdates[model] = { recommended: true, tier: 'primary', successRate, avgQuality };
        }
      }

      emit({ log: `Crawl complete. ${Object.keys(configUpdates).length} model config update(s) ready.` });

      if (Object.keys(configUpdates).length > 0) {
        emit({ config: configUpdates });
      }
    } catch (err: any) {
      emit({ log: `Crawler error: ${err.message}` });
    }

    reply.raw.end();
  });

  // ── POST /apply-config ────────────────────
  app.post('/apply-config', async (req: FastifyRequest, reply: FastifyReply) => {
    const { config } = req.body as { config: Record<string, any> };
    if (!config || typeof config !== 'object') {
      return reply.status(400).send({ error: 'config object required' });
    }

    try {
      for (const [modelId, cfg] of Object.entries(config)) {
        db.prepare(`
          UPDATE model_registry SET strategy_config = ?, updated_at = datetime('now')
          WHERE model_id = ?
        `).run(JSON.stringify(cfg), modelId);
      }
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }

    return reply.send({ ok: true, updated: Object.keys(config).length });
  });
}

// ─────────────────────────────────────────────
// Internal: upsert model_registry row
// ─────────────────────────────────────────────
function _upsertModelRegistry(
  db: any,
  model: string,
  run: { success: boolean; quality?: number; latencyMs?: number; tokenCount?: number },
) {
  try {
    const existing = db.prepare('SELECT * FROM model_registry WHERE model_id = ?').get(model) as any;
    if (!existing) {
      db.prepare(`
        INSERT INTO model_registry
          (id, model_id, display_name, provider, total_runs, success_rate,
           avg_quality, avg_latency_ms, total_tokens, trend, last_run_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, 'flat', datetime('now'))
      `).run(
        randomUUID(), model,
        model.split('/').pop() ?? model,
        model.split('/')[0] ?? 'unknown',
        run.success ? 1.0 : 0.0,
        run.quality ?? 0,
        run.latencyMs ?? 0,
        run.tokenCount ?? 0,
      );
    } else {
      const n = existing.total_runs + 1;
      const newSuccessRate = (existing.success_rate * existing.total_runs + (run.success ? 1 : 0)) / n;
      const newQuality = (existing.avg_quality * existing.total_runs + (run.quality ?? 0)) / n;
      const newLatency = (existing.avg_latency_ms * existing.total_runs + (run.latencyMs ?? 0)) / n;
      const newTokens = existing.total_tokens + (run.tokenCount ?? 0);

      db.prepare(`
        UPDATE model_registry
        SET total_runs = ?, success_rate = ?, avg_quality = ?,
            avg_latency_ms = ?, total_tokens = ?,
            last_run_at = datetime('now'), updated_at = datetime('now')
        WHERE model_id = ?
      `).run(n, newSuccessRate, newQuality, newLatency, newTokens, model);
    }
  } catch { /* best-effort */ }
}
