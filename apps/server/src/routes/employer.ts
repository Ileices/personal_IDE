// ============================================
// Employer Crawler Routes
// Model stratification, role assignment, retirement, cooldown overrides
// prefix: /api/employer
// ============================================
// The Employer Crawler reads blame data to decide:
//   - What each model is best at (recommended_role, task_types)
//   - What tasks a model should be avoided for (avoid_task_types)
//   - Whether a model should be retired (too many failures)
//   - Manual cooldown overrides (inject/skip/sleep)
// ============================================
import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type Database from 'better-sqlite3';

// Context window size → tier label
function contextTier(tokens: number | null | undefined): string {
  const t = tokens ?? 0;
  if (t <= 0) return 'unknown';
  if (t <= 2048) return 'nano';
  if (t <= 8192) return 'small';
  if (t <= 32000) return 'medium';
  if (t <= 128000) return 'large';
  return 'xlarge';
}

function chooseRateLimitEstimate(modelId: string): number {
  const src = String(modelId || '').toLowerCase();
  if (src.includes('gpt-4.1') || src.includes('gpt-4o')) return 50;
  if (src.includes('claude-opus')) return 20;
  if (src.includes('claude-sonnet')) return 40;
  if (src.includes('claude-haiku')) return 100;
  if (src.includes('gemini-pro')) return 60;
  if (src.includes('gemini-flash')) return 120;
  if (src.includes('copilot')) return 50;
  return 60;
}

function allowanceTier(hourlyAllowanceEst: number): 'scarce' | 'balanced' | 'abundant' {
  if (hourlyAllowanceEst <= 25) return 'scarce';
  if (hourlyAllowanceEst >= 90) return 'abundant';
  return 'balanced';
}

// Derive recommended role from blame data
function deriveRole(
  successRate: number,
  avgQuality: number,
  avgTokens: number,
  contextWindow: number,
  hourlyAllowanceEst: number,
  allowanceUsagePct: number,
): { role: string; confidence: number; taskTypes: string[]; avoidTypes: string[]; strengths: string[]; weaknesses: string[] } {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const taskTypes: string[] = [];
  const avoidTypes: string[] = [];

  // Tier classification by context window
  const tier = contextTier(contextWindow);
  const isNano = tier === 'nano' || tier === 'small';
  const isLarge = tier === 'large' || tier === 'xlarge';
  const allowanceBand = allowanceTier(hourlyAllowanceEst);
  const lowAllowance = allowanceBand === 'scarce';
  const highAllowance = allowanceBand === 'abundant';

  if (lowAllowance) {
    strengths.push('scarce_allowance_high_value');
    avoidTypes.push('trivial_cleanup', 'bulk_low_value_iterations');
  }

  if (highAllowance) {
    strengths.push('abundant_allowance_cost_efficient');
  }

  if (allowanceUsagePct >= 85) {
    weaknesses.push('near_rate_ceiling');
  }

  if (successRate >= 0.85 && avgQuality >= 0.75) {
    strengths.push('high_reliability', 'quality_output');
    if (isLarge || lowAllowance) {
      taskTypes.push('architecture', 'complex_refactor', 'full_file_rewrite', 'multi_file_analysis');
      avoidTypes.push('micro_edit'); // over-engineering risk
      return { role: 'architect', confidence: 0.85, taskTypes, avoidTypes, strengths, weaknesses };
    }
    taskTypes.push('feature_implementation', 'code_review', 'debugging');
    return { role: 'senior_developer', confidence: 0.80, taskTypes, avoidTypes, strengths, weaknesses };
  }

  if (successRate >= 0.70 && isNano) {
    // Small model good at focused tasks
    strengths.push('fast_response', 'token_efficient');
    weaknesses.push('limited_context', 'complex_reasoning');
    taskTypes.push('micro_edit', 'logging_hardening', 'comment_cleanup', 'small_bug_fix', 'formatting');
    avoidTypes.push('architecture', 'multi_file_analysis', 'full_file_rewrite');
    return { role: 'micro_editor', confidence: 0.75, taskTypes, avoidTypes, strengths, weaknesses };
  }

  if (highAllowance && successRate >= 0.55) {
    strengths.push('high_throughput_budget');
    taskTypes.push('triage', 'lint_fix', 'small_bug_fix', 'logging_hardening', 'formatting');
    avoidTypes.push('deep_architecture');
    return { role: 'throughput_worker', confidence: 0.68, taskTypes, avoidTypes, strengths, weaknesses };
  }

  if (successRate >= 0.60 && avgTokens > 1000) {
    strengths.push('verbose_output');
    taskTypes.push('documentation', 'test_generation', 'comment_writing');
    avoidTypes.push('concise_fixes');
    return { role: 'documenter', confidence: 0.65, taskTypes, avoidTypes, strengths, weaknesses };
  }

  if (successRate < 0.40) {
    weaknesses.push('high_failure_rate');
    avoidTypes.push('production_tasks', 'autonomous_pipeline');
    return { role: 'unreliable', confidence: 0.90, taskTypes, avoidTypes, strengths, weaknesses };
  }

  taskTypes.push('general');
  return { role: 'general', confidence: 0.50, taskTypes, avoidTypes, strengths, weaknesses };
}

export function runEmployerAnalysisCycle(db: Database.Database): {
  cycle: number;
  analyzed: number;
  retirementCandidates: string[];
} {
  type CycleRow = { max_cycle: number | null };
  const cycleRow = db.prepare(`SELECT MAX(analysis_cycle) AS max_cycle FROM employer_analysis`).get() as CycleRow;
  const nextCycle = (cycleRow?.max_cycle ?? 0) + 1;

  type BlameAgg = {
    model_id: string;
    total: number;
    successes: number;
    avg_quality: number;
    avg_tokens: number;
  };
  const models = db.prepare(`
    SELECT
      COALESCE(b.attributed_source, b.model) AS model_id,
      COUNT(*) AS total,
      SUM(CASE WHEN b.success = 1 THEN 1 ELSE 0 END) AS successes,
      AVG(COALESCE(q.composite_quality_score, 0)) AS avg_quality,
      AVG(COALESCE(b.token_count, 0)) AS avg_tokens
    FROM blame_records b
    LEFT JOIN quality_records q ON q.blame_id = b.id
    GROUP BY COALESCE(b.attributed_source, b.model)
    HAVING COUNT(*) >= 3
  `).all() as BlameAgg[];

  const inserted: string[] = [];
  const retirementCandidates: string[] = [];

  const usageWindowSec = 24 * 3600;
  const usageCutoff = new Date(Date.now() - usageWindowSec * 1000).toISOString();
  const usageRows = db.prepare(`
    SELECT
      COALESCE(attributed_source, model) AS model_id,
      COUNT(*) AS cnt
    FROM blame_records
    WHERE created_at >= ?
    GROUP BY COALESCE(attributed_source, model)
  `).all(usageCutoff) as Array<{ model_id: string; cnt: number }>;
  const usageMap = new Map<string, number>(usageRows.map((r) => [String(r.model_id), Number(r.cnt || 0)]));

  for (const m of models) {
    if (!m.model_id) continue;

    type RegistryRow = { context_window_tokens: number | null };
    const reg = db.prepare(`SELECT context_window_tokens FROM model_registry WHERE model_id = ?`).get(m.model_id) as RegistryRow | undefined;
    const contextWindow = reg?.context_window_tokens ?? 0;
    const hourlyAllowanceEst = Math.max(1, chooseRateLimitEstimate(m.model_id));
    const usageCount = usageMap.get(m.model_id) ?? 0;
    const usageWindowHours = usageWindowSec / 3600;
    const allowanceWindowLimit = Math.max(1, Math.round(hourlyAllowanceEst * usageWindowHours));
    const allowanceUsagePct = Math.max(0, Math.min(100, Math.round((usageCount / allowanceWindowLimit) * 100)));
    const allowanceBand = allowanceTier(hourlyAllowanceEst);
    const strategicValueScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          (100 - Math.min(100, hourlyAllowanceEst)) * 0.4
          + Math.max(0, Math.min(100, m.avg_quality * 100)) * 0.35
          + Math.max(0, Math.min(100, (m.total > 0 ? (m.successes / m.total) : 0) * 100)) * 0.25,
        ),
      ),
    );

    const successRate = m.total > 0 ? m.successes / m.total : 0;
    const { role, confidence, taskTypes, avoidTypes, strengths, weaknesses } = deriveRole(
      successRate,
      m.avg_quality,
      m.avg_tokens,
      contextWindow,
      hourlyAllowanceEst,
      allowanceUsagePct,
    );

    const retirementRecommended = role === 'unreliable' ? 1 : 0;
    const retirementReason = retirementRecommended
      ? `Low success rate (${Math.round(successRate * 100)}%) over ${m.total} runs`
      : null;

    if (retirementRecommended) retirementCandidates.push(m.model_id);

    db.prepare(`
      INSERT INTO employer_analysis (
        id, model_id, analysis_cycle, recommended_role, role_confidence,
        task_types, avoid_task_types, strengths, weaknesses,
        retirement_recommended, retirement_reason, sample_count,
        avg_quality, success_rate, avg_tokens, context_window_tier,
        allowance_hourly_est, allowance_window_usage_pct, allowance_tier, strategic_value_score,
        analyzed_at, created_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        datetime('now'), datetime('now')
      )
    `).run(
      randomUUID(),
      m.model_id,
      nextCycle,
      role,
      confidence,
      JSON.stringify(taskTypes),
      JSON.stringify(avoidTypes),
      JSON.stringify(strengths),
      JSON.stringify(weaknesses),
      retirementRecommended,
      retirementReason,
      m.total,
      m.avg_quality,
      successRate,
      Math.round(m.avg_tokens),
      contextTier(contextWindow),
      hourlyAllowanceEst,
      allowanceUsagePct,
      allowanceBand,
      strategicValueScore,
    );

    inserted.push(m.model_id);
  }

  return {
    cycle: nextCycle,
    analyzed: inserted.length,
    retirementCandidates,
  };
}

export async function employerRoutes(app: FastifyInstance) {
  const db = (app as unknown as { db: import('better-sqlite3').Database }).db;

  const resolveLatestProjectId = (): string | null => {
    type ProjectRow = { id: string };
    const row = db.prepare(`
      SELECT id
      FROM projects
      ORDER BY last_accessed_at DESC, created_at DESC
      LIMIT 1
    `).get() as ProjectRow | undefined;
    return row?.id ?? null;
  };

  // ── GET /status ──────────────────────────────────────────────────────────────
  // Returns last analysis cycle number and count of models analyzed
  app.get('/status', async (_req: FastifyRequest, reply: FastifyReply) => {
    type CycleRow = { max_cycle: number | null; model_count: number };
    const row = db.prepare(`
      SELECT MAX(analysis_cycle) AS max_cycle, COUNT(DISTINCT model_id) AS model_count
      FROM employer_analysis
    `).get() as CycleRow | undefined;

    type RetireRow = { pending_retirement: number };
    const retireRow = db.prepare(`
      SELECT COUNT(*) AS pending_retirement
      FROM employer_analysis
      WHERE retirement_recommended = 1 AND suggested_job_created = 0
    `).get() as RetireRow | undefined;

    type CooldownRow = { active_overrides: number };
    const cooldownRow = db.prepare(`
      SELECT COUNT(*) AS active_overrides
      FROM model_cooldown_overrides
      WHERE active = 1
    `).get() as CooldownRow | undefined;

    return reply.send({
      last_cycle: row?.max_cycle ?? 0,
      models_analyzed: row?.model_count ?? 0,
      pending_retirement: retireRow?.pending_retirement ?? 0,
      active_cooldown_overrides: cooldownRow?.active_overrides ?? 0,
    });
  });

  // ── GET /suggestions ─────────────────────────────────────────────────────────
  // Returns latest role assignment per model
  app.get('/suggestions', async (req: FastifyRequest, reply: FastifyReply) => {
    const q = req.query as Record<string, string>;
    const limit = Math.min(100, Math.max(1, parseInt(q.limit || '50', 10)));
    const role = q.role?.trim();

    let sql = `
      SELECT ea.*, mco.override_type AS cooldown_override_type,
             mco.cooldown_until, mco.sleep_until, mco.skip_next_cycles
      FROM employer_analysis ea
      LEFT JOIN model_cooldown_overrides mco ON mco.model_id = ea.model_id AND mco.active = 1
      WHERE ea.id IN (
        SELECT id FROM employer_analysis ea2
        WHERE ea2.model_id = ea.model_id
        ORDER BY ea2.analyzed_at DESC
        LIMIT 1
      )
    `;
    const params: (string | number)[] = [];
    if (role) {
      sql += ` AND ea.recommended_role = ?`;
      params.push(role);
    }
    sql += ` ORDER BY ea.role_confidence DESC LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(sql).all(...params);
    return reply.send({ suggestions: rows });
  });

  // ── POST /analyze ─────────────────────────────────────────────────────────────
  // Triggers a full employer analysis pass over all models in blame + registry
  app.post('/analyze', async (_req: FastifyRequest, reply: FastifyReply) => {
    const analysis = runEmployerAnalysisCycle(db);

    return reply.send({
      ok: true,
      cycle: analysis.cycle,
      analyzed: analysis.analyzed,
      retirement_candidates: analysis.retirementCandidates,
    });
  });

  // ── POST /retire/:modelId ─────────────────────────────────────────────────────
  // Marks a model for retirement and creates a suggested job to remove it
  app.post('/retire/:modelId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { modelId } = req.params as { modelId: string };
    const body = req.body as { reason?: string } | undefined;
    const reason = body?.reason?.trim() || 'Manually retired via Employer Crawler';

    // Check model exists in registry
    type RegCheck = { model_id: string; display_name: string };
    const reg = db.prepare(`SELECT model_id, display_name FROM model_registry WHERE model_id = ?`).get(modelId) as RegCheck | undefined;
    if (!reg) {
      return reply.status(404).send({ error: 'Model not found in registry' });
    }

    // Update model_registry touch timestamp (best-effort; schema may vary).
    try {
      db.prepare(`
        UPDATE model_registry SET updated_at = datetime('now') WHERE model_id = ?
      `).run(modelId);
    } catch {
      // non-blocking
    }

    // Create canonical suggested job so this retirement is actually actionable in the God Factory queue.
    const jobId = randomUUID();
    const projectId = resolveLatestProjectId();
    const nowIso = new Date().toISOString();

    try {
      db.prepare(`
        INSERT INTO job_records (
          id,
          job_id,
          project_id,
          job_category,
          source,
          source_record_ids,
          priority,
          title,
          description,
          implementation_status,
          created_cycle,
          last_updated_cycle,
          timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        jobId,
        projectId,
        'model_tool_enhancement',
        'god_factory_agent',
        JSON.stringify([modelId]),
        'high',
        `Retire model: ${reg.display_name || modelId}`,
        `Employer Crawler recommends retiring ${modelId}. Reason: ${reason}. Create migration/removal plan and salvage reusable tooling for other models.`,
        'suggested',
        0,
        0,
        nowIso,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown database error';
      return reply.status(500).send({
        error: `Failed to create retirement suggested job for ${modelId}`,
        details: message,
      });
    }

    // Mark in employer_analysis (best-effort if an analysis row exists)
    try {
      db.prepare(`
        UPDATE employer_analysis
        SET retirement_recommended = 1,
            retirement_reason = ?,
            retirement_job_id = ?,
            suggested_job_created = 1
        WHERE model_id = ?
        AND id = (SELECT id FROM employer_analysis WHERE model_id = ? ORDER BY analyzed_at DESC LIMIT 1)
      `).run(reason, jobId, modelId, modelId);
    } catch {
      // no analysis row yet — non-blocking
    }

    return reply.send({ ok: true, model_id: modelId, job_id: jobId, project_id: projectId, reason });
  });

  // ── GET /cooldowns ────────────────────────────────────────────────────────────
  // Returns all active cooldown overrides
  app.get('/cooldowns', async (_req: FastifyRequest, reply: FastifyReply) => {
    const rows = db.prepare(`
      SELECT * FROM model_cooldown_overrides WHERE active = 1 ORDER BY updated_at DESC
    `).all();
    return reply.send({ cooldowns: rows });
  });

  // ── POST /cooldowns ───────────────────────────────────────────────────────────
  // Set or clear a cooldown override for a model
  // Body: { model_id, type: 'cooldown'|'skip'|'sleep'|'clear', duration_sec?, skip_cycles?, reason? }
  app.post('/cooldowns', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      model_id: string;
      type: 'cooldown' | 'skip' | 'sleep' | 'clear';
      duration_sec?: number;
      skip_cycles?: number;
      reason?: string;
    };

    if (!body?.model_id || !body?.type) {
      return reply.status(400).send({ error: 'model_id and type required' });
    }

    const { model_id, type: overrideType, duration_sec = 3600, skip_cycles = 1, reason } = body;

    if (overrideType === 'clear') {
      db.prepare(`
        UPDATE model_cooldown_overrides SET active = 0, updated_at = datetime('now') WHERE model_id = ?
      `).run(model_id);
      return reply.send({ ok: true, model_id, cleared: true });
    }

    const now = Date.now();
    const cooldownUntil = overrideType === 'cooldown'
      ? new Date(now + duration_sec * 1000).toISOString()
      : null;
    const sleepUntil = overrideType === 'sleep'
      ? new Date(now + duration_sec * 1000).toISOString()
      : null;
    const skipCycles = overrideType === 'skip' ? skip_cycles : 0;

    db.prepare(`
      INSERT INTO model_cooldown_overrides (id, model_id, override_type, cooldown_until, skip_next_cycles, sleep_until, injected_by, reason, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'user', ?, 1, datetime('now'), datetime('now'))
      ON CONFLICT(model_id) DO UPDATE SET
        override_type = excluded.override_type,
        cooldown_until = excluded.cooldown_until,
        skip_next_cycles = excluded.skip_next_cycles,
        sleep_until = excluded.sleep_until,
        reason = excluded.reason,
        active = 1,
        updated_at = datetime('now')
    `).run(
      randomUUID(),
      model_id,
      overrideType,
      cooldownUntil,
      skipCycles,
      sleepUntil,
      reason ?? null,
    );

    return reply.send({ ok: true, model_id, override_type: overrideType, cooldown_until: cooldownUntil, sleep_until: sleepUntil, skip_next_cycles: skipCycles });
  });
}
