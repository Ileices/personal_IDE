import { randomUUID } from 'crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { runSuggestedJobsCrawlerTick } from '../services/suggestedJobsCrawler/index.js';
import { assessToolPolicy, getToolPolicySnapshot } from '../services/godFactory/toolGatekeeper.js';
import { getSubsystemRuntimeStatus, startSubsystemScheduler, stopSubsystemScheduler } from '../services/subsystemScheduler.js';
import { getKv, loadSettings, setKv, type SubsystemId } from './subsystems.js';
import { JOB_STATUS, RUN_STATUS, STOP_REASON } from '../services/lifecycle/stateMachine.js';
import { resolveModelStrategy, inferTaskTypeFromText } from '../services/modelStrategy.js';
import { extractProviderFromModelId, type ProviderType } from '@personal-ide/shared';
import { getClientFromDb as getProviderClient } from '../services/llm/providers.js';
import { runEmployerAnalysisCycle } from './employer.js';

type Db = import('better-sqlite3').Database;

type IdleCategory =
  | 'trivial_enhancement'
  | 'feature_bridge'
  | 'performance_opportunity'
  | 'debt_warning'
  | 'regression_trend'
  | 'model_behavior_alert';

type IdleResponse = 'accepted' | 'rejected' | 'deferred';

const CONTROL_OWNER_LOGIN = 'Ileices';
const SESSION_FIELD_MAX_ITEMS = 500;
const SESSION_FIELD_MAX_BYTES = 256 * 1024;

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeParseJobPayload<T extends unknown[]>(
  raw: unknown,
  fieldName: string,
  fallback: T,
): { success: boolean; data?: T; error?: string } {
  if (raw === null || raw === undefined) {
    return { success: true, data: fallback };
  }

  if (raw === '') {
    return { success: true, data: fallback };
  }

  if (typeof raw !== 'string') {
    if (Array.isArray(raw)) {
      return { success: true, data: raw as T };
    }
    return { success: true, data: fallback };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return {
        success: false,
        error: `${fieldName} is not a JSON array (got ${typeof parsed})`,
      };
    }
    return { success: true, data: parsed as T };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Failed to parse ${fieldName}: ${errorMsg}`,
    };
  }
}

function archiveInteractiveSessionChunk(db: Db, sessionId: string, field: string, items: unknown[]): void {
  if (!items.length) return;

  try {
    const row = db.prepare(`
      SELECT COALESCE(MAX(chunk_index), -1) AS max_idx
      FROM interactive_session_chunks
      WHERE session_id = ? AND field_name = ?
    `).get(sessionId, field) as { max_idx?: number } | undefined;

    const nextIndex = (row?.max_idx ?? -1) + 1;
    db.prepare(`
      INSERT INTO interactive_session_chunks (id, session_id, field_name, chunk_index, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(randomUUID(), sessionId, field, nextIndex, JSON.stringify(items));
  } catch {
    // If chunk table is unavailable, we avoid failing the append path.
  }
}

function appendInteractiveSessionField(db: Db, sessionId: string, field: string, nextItem: unknown): void {
  const row = db.prepare(`SELECT ${field} FROM interactive_sessions WHERE session_id = ?`).get(sessionId) as Record<string, unknown> | undefined;
  const current = parseJson<unknown[]>(row?.[field], []);
  const next = [...current, nextItem];
  const archived: unknown[] = [];

  if (next.length > SESSION_FIELD_MAX_ITEMS) {
    const overflow = next.length - SESSION_FIELD_MAX_ITEMS;
    archived.push(...next.splice(0, overflow));
  }

  while (Buffer.byteLength(JSON.stringify(next), 'utf8') > SESSION_FIELD_MAX_BYTES && next.length > 1) {
    const oldest = next.shift();
    if (typeof oldest !== 'undefined') archived.push(oldest);
  }

  if (archived.length > 0) {
    archiveInteractiveSessionChunk(db, sessionId, field, archived);
  }

  db.prepare(`UPDATE interactive_sessions SET ${field} = ? WHERE session_id = ?`).run(JSON.stringify(next), sessionId);
}

function formatLoopError(err: unknown): { code: string; summary: string } {
  const summary = err instanceof Error ? (err.message || 'Unknown error') : String(err || 'Unknown error');
  const code = err instanceof Error && err.name ? err.name : 'LoopError';
  return {
    code,
    summary: summary.slice(0, 400),
  };
}

function recordLoopError(
  db: Db,
  payload: { phase: string; runId?: string | null; jobId?: string | null; err: unknown; fatal?: boolean },
): void {
  const { code, summary } = formatLoopError(payload.err);

  db.prepare(`
    UPDATE god_factory_loop_state
    SET last_error_code = ?,
        last_error_summary = ?,
        last_error_at = datetime('now')
    WHERE id = 'singleton'
  `).run(code, summary);

  logGodFactoryAction(db, {
    action_type: 'loop_error',
    target_id: payload.jobId ?? null,
    target_type: 'job',
    authority_invoked: 'god_factory_loop',
    justification_tags: [payload.phase, payload.fatal ? 'fatal' : 'recoverable', code],
    result: summary,
    cycle_id: payload.runId ?? null,
  });

  ensureNotification(db, {
    category: 'god_factory_loop_error',
    source_forensic_id: payload.jobId ?? payload.runId ?? undefined,
    severity: payload.fatal ? 'error' : 'warning',
    summary_tags: [payload.phase, code],
    natural_language_summary: `God Factory ${payload.phase} error: ${summary}`,
    cycle_id: payload.runId ?? undefined,
  });
}

function logGodFactoryAction(
  db: Db,
  payload: {
    action_type: string;
    target_id?: string | null;
    target_type?: string | null;
    authority_invoked?: string | null;
    justification_tags?: string[];
    result?: string;
    cycle_id?: string | null;
  },
): string {
  const actionId = randomUUID();
  db.prepare(`
    INSERT INTO god_factory_actions
      (action_id, action_type, target_id, target_type, authority_invoked, justification_tags, result, cycle_id, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    actionId,
    payload.action_type,
    payload.target_id ?? null,
    payload.target_type ?? null,
    payload.authority_invoked ?? null,
    JSON.stringify(payload.justification_tags ?? []),
    payload.result ?? 'recorded',
    payload.cycle_id ?? null,
  );
  return actionId;
}

function buildCodebaseHealth(db: Db) {
  const latestSnapshot = db.prepare(`
    SELECT snapshot_id, total_devtags, registry_surplus_count, registry_deficit_count,
           systemic_drift_flagged, content_drift_count, location_drift_count, parse_duration_ms, timestamp
    FROM ground_truth_snapshots
    WHERE status = 'complete'
    ORDER BY datetime(created_at) DESC
    LIMIT 1
  `).get() as Record<string, unknown> | undefined;

  const debtRows = db.prepare(`
    SELECT dh.file_path, dh.debt_score, dh.ceiling, dh.ceiling_exceeded, dh.score_breakdown
    FROM debt_history dh
    INNER JOIN (
      SELECT file_path, MAX(rowid) AS max_row
      FROM debt_history
      GROUP BY file_path
    ) latest ON dh.file_path = latest.file_path AND dh.rowid = latest.max_row
    ORDER BY dh.debt_score DESC
    LIMIT 8
  `).all() as Array<Record<string, unknown>>;

  const latestGapSummary = db.prepare(`
    SELECT COUNT(*) AS total, SUM(CASE WHEN flagged_to_god_factory = 1 THEN 1 ELSE 0 END) AS flagged
    FROM gap_reports
  `).get() as { total?: number; flagged?: number } | undefined;

  return {
    latest_snapshot: latestSnapshot ? {
      ...latestSnapshot,
      systemic_drift_flagged: !!latestSnapshot.systemic_drift_flagged,
    } : null,
    top_debt_files: debtRows.map((row) => ({
      ...row,
      ceiling_exceeded: !!row.ceiling_exceeded,
      score_breakdown: parseJson<Record<string, unknown>>(row.score_breakdown, {}),
    })),
    gap_summary: {
      total_reports: latestGapSummary?.total ?? 0,
      flagged_reports: latestGapSummary?.flagged ?? 0,
    },
  };
}

function getNotificationDetail(db: Db, notificationId: string) {
  const notification = db.prepare(`SELECT * FROM notification_queue WHERE notification_id = ?`).get(notificationId) as Record<string, unknown> | undefined;
  if (!notification) return null;

  const base = {
    ...notification,
    summary_tags: parseJson<string[]>(notification.summary_tags, []),
    presented_to_user: !!notification.presented_to_user,
    user_acknowledged: !!notification.user_acknowledged,
  };

  const sourceId = typeof notification.source_forensic_id === 'string' ? notification.source_forensic_id : null;
  let sourceDetail: Record<string, unknown> | null = null;

  if (sourceId && notification.category === 'gap_report') {
    const row = db.prepare('SELECT * FROM gap_reports WHERE report_id = ?').get(sourceId) as Record<string, unknown> | undefined;
    if (row) {
      sourceDetail = {
        ...row,
        affected_tags: parseJson<string[]>(row.affected_tags, []),
        affected_agents: parseJson<string[]>(row.affected_agents, []),
        affected_files: parseJson<string[]>(row.affected_files, []),
        recommended_action_tags: parseJson<string[]>(row.recommended_action_tags, []),
        forensic_entry_ids: parseJson<string[]>(row.forensic_entry_ids, []),
        flagged_to_god_factory: !!row.flagged_to_god_factory,
      };
    }
  } else if (sourceId && notification.category === 'pattern_watch') {
    const row = db.prepare('SELECT * FROM patterns WHERE pattern_id = ?').get(sourceId) as Record<string, unknown> | undefined;
    if (row) {
      sourceDetail = {
        ...row,
        contributing_forensic_ids: parseJson<string[]>(row.contributing_forensic_ids, []),
        flagged_to_god_factory: !!row.flagged_to_god_factory,
        is_anti_pattern: !!row.is_anti_pattern,
      };
    }
  } else if (sourceId && notification.category === 'brainstorm_record') {
    sourceDetail = db.prepare('SELECT * FROM brainstorm_records WHERE brainstorm_id = ?').get(sourceId) as Record<string, unknown> | null;
  } else if (sourceId && notification.category === 'debt_warning') {
    const row = db.prepare('SELECT * FROM debt_history WHERE entry_id = ?').get(sourceId) as Record<string, unknown> | undefined;
    if (row) {
      sourceDetail = {
        ...row,
        score_breakdown: parseJson<Record<string, unknown>>(row.score_breakdown, {}),
        ceiling_exceeded: !!row.ceiling_exceeded,
      };
    }
  } else if (sourceId && notification.category === 'model_behavior_alert') {
    sourceDetail = db.prepare('SELECT * FROM model_registry WHERE model_id = ?').get(sourceId) as Record<string, unknown> | null;
  }

  return {
    notification: base,
    source_detail: sourceDetail,
  };
}

function getModelHealthDetail(db: Db, modelId: string) {
  const model = db.prepare('SELECT * FROM model_registry WHERE model_id = ?').get(modelId) as Record<string, unknown> | undefined;
  if (!model) return null;

  const recentQuality = db.prepare(`
    SELECT q.*, b.interaction_type, b.model_name, b.model_id, b.created_at
    FROM quality_records q
    INNER JOIN blame_records b ON b.id = q.blame_id
    WHERE b.model_id = ?
    ORDER BY datetime(COALESCE(q.timestamp, q.crawled_at, b.created_at)) DESC
    LIMIT 8
  `).all(modelId) as Array<Record<string, unknown>>;

  const recentBlame = db.prepare(`
    SELECT b.*, q.composite_quality_score, q.failure_modes
    FROM blame_records b
    LEFT JOIN quality_records q ON q.blame_id = b.id
    WHERE b.model_id = ?
    ORDER BY datetime(b.created_at) DESC
    LIMIT 8
  `).all(modelId) as Array<Record<string, unknown>>;

  return {
    model: {
      ...model,
      strengths: parseJson<string[]>(model.strengths, []),
      weaknesses: parseJson<string[]>(model.weaknesses, []),
      recommended_interaction_types: parseJson<string[]>(model.recommended_interaction_types, []),
      avoided_interaction_types: parseJson<string[]>(model.avoided_interaction_types, []),
      tool_configs_generated: parseJson<string[]>(model.tool_configs_generated, []),
      strategy_config: parseJson<Record<string, unknown>>(model.strategy_config, {}),
    },
    recent_quality: recentQuality.map((row) => ({
      ...row,
      failure_modes: parseJson<string[]>(row.failure_modes, []),
    })),
    recent_blame: recentBlame.map((row) => ({
      ...row,
      failure_modes: parseJson<string[]>(row.failure_modes, []),
      success: !!row.success,
    })),
  };
}

function ensureNotification(
  db: Db,
  payload: {
    category: string;
    source_forensic_id?: string;
    severity: 'info' | 'warning' | 'error' | 'critical' | 'fatal';
    summary_tags?: string[];
    natural_language_summary: string;
    cycle_id?: string;
  },
): void {
  const existing = db.prepare(`
    SELECT notification_id
    FROM notification_queue
    WHERE category = ?
      AND IFNULL(source_forensic_id, '') = IFNULL(?, '')
      AND natural_language_summary = ?
      AND user_acknowledged = 0
    LIMIT 1
  `).get(payload.category, payload.source_forensic_id ?? null, payload.natural_language_summary) as { notification_id: string } | undefined;

  if (existing) return;

  db.prepare(`
    INSERT INTO notification_queue
      (notification_id, category, source_forensic_id, severity, summary_tags, natural_language_summary, cycle_id, presented_to_user, user_acknowledged, timestamp)
    VALUES (?,?,?,?,?,?,?,0,0,datetime('now'))
  `).run(
    randomUUID(),
    payload.category,
    payload.source_forensic_id ?? null,
    payload.severity,
    JSON.stringify(payload.summary_tags ?? []),
    payload.natural_language_summary,
    payload.cycle_id ?? null,
  );
}

function ensureIdleSuggestion(
  db: Db,
  payload: {
    category: IdleCategory;
    source_devtags?: string[];
    source_files?: string[];
    source_lines?: Array<[number, number]>;
    source_forensic_ids?: string[];
    natural_language_summary: string;
    cycle_id?: string;
  },
): void {
  // Suppress if an identical suggestion is pending OR was already responded to within 24 hours.
  // This prevents refreshGodFactorySignals from re-creating the same suggestion seconds after
  // the user accepts/rejects it (the underlying source record still exists).
  const existing = db.prepare(`
    SELECT suggestion_id
    FROM idle_suggestions
    WHERE category = ?
      AND natural_language_summary = ?
      AND (
        user_response IS NULL
        OR datetime(timestamp) > datetime('now', '-24 hours')
      )
    LIMIT 1
  `).get(payload.category, payload.natural_language_summary) as { suggestion_id: string } | undefined;

  if (existing) return;

  db.prepare(`
    INSERT INTO idle_suggestions
      (suggestion_id, category, source_devtags, source_files, source_lines, source_forensic_ids,
       natural_language_summary, suggested_job_id, presented_to_user, user_response, cycle_id, timestamp)
    VALUES (?,?,?,?,?,?,?,?,0,NULL,?,datetime('now'))
  `).run(
    randomUUID(),
    payload.category,
    JSON.stringify(payload.source_devtags ?? []),
    JSON.stringify(payload.source_files ?? []),
    JSON.stringify(payload.source_lines ?? []),
    JSON.stringify(payload.source_forensic_ids ?? []),
    payload.natural_language_summary,
    null,
    payload.cycle_id ?? null,
  );
}

/**
 * Intel Panel → God Factory pipeline wire.
 *
 * Reads gap_reports WHERE flagged_to_god_factory = 1 AND not yet acknowledged,
 * creates a job_records entry for each, marks the gap as acknowledged, and
 * writes a god_factory_actions audit entry.
 *
 * This closes the highest-priority wiring gap identified in Discussion #24:
 * the Gap Analysis crawler correctly writes flagged reports, but nothing was
 * converting them into actionable job_records until this function.
 *
 * Returns the count of new jobs created.
 */
function flushFlaggedGapReportsToJobs(db: Db): number {
  const flagged = db.prepare(`
    SELECT report_id, gap_category, severity, affected_files, affected_tags,
           recommended_action_tags, session_id
    FROM gap_reports
    WHERE flagged_to_god_factory = 1
      AND (acknowledged_at IS NULL OR acknowledged_at = '')
    ORDER BY
      CASE severity
        WHEN 'fatal'    THEN 0
        WHEN 'critical' THEN 1
        WHEN 'error'    THEN 2
        WHEN 'warning'  THEN 3
        ELSE 4
      END ASC,
      datetime(timestamp) DESC
    LIMIT 50
  `).all() as Array<{
    report_id: string;
    gap_category: string;
    severity: string;
    affected_files: string;
    affected_tags: string;
    recommended_action_tags: string;
    session_id: string;
  }>;

  if (flagged.length === 0) return 0;

  const defaultProjectId = (() => {
    const rows = db.prepare(`
      SELECT id FROM projects ORDER BY last_accessed_at DESC, created_at DESC LIMIT 1
    `).all() as Array<{ id: string }>;
    return rows.length > 0 ? rows[0].id : null;
  })();

  const sandboxSpec = JSON.stringify({
    sandbox_id: null,
    status: 'not_started',
    cycle_limit: 50,
    cycles_used: 0,
    test_results: [],
    human_review_required: false,
    human_review_completed: false,
  });

  const categoryMap: Record<string, string> = {
    coverage: 'nano_coverage_gap',
    structural: 'debt_reduction',
    process: 'regression_hardening',
    tag_system: 'tag_schema_extension',
    agent_performance: 'god_factory_scan',
  };

  const priorityMap: Record<string, string> = {
    fatal: 'critical',
    critical: 'critical',
    error: 'high',
    warning: 'medium',
    info: 'low',
  };

  let created = 0;

  for (const gap of flagged) {
    // Idempotency check: skip if a job already references this gap report
    const existing = db.prepare(
      `SELECT job_id FROM job_records WHERE source_report_id = ? LIMIT 1`
    ).get(gap.report_id) as { job_id: string } | undefined;
    if (existing) {
      // Mark acknowledged even if job already existed
      db.prepare(`UPDATE gap_reports SET acknowledged_at = datetime('now') WHERE report_id = ?`).run(gap.report_id);
      continue;
    }

    const jobId = randomUUID();
    const jobCategory = categoryMap[gap.gap_category] || 'god_factory_scan';
    const priority = priorityMap[gap.severity] || 'medium';
    const actionTags = parseJson<string[]>(gap.recommended_action_tags, []);
    const title = `Fix: ${gap.gap_category.replace(/_/g, ' ')} gap (${gap.severity})${actionTags.length > 0 ? ' — ' + actionTags.slice(0, 3).join(', ') : ''}`;
    const description = `Gap report ${gap.report_id} from session ${gap.session_id}. Severity: ${gap.severity}. Category: ${gap.gap_category}. Recommended actions: ${actionTags.join(', ') || 'see gap report'}.`;

    db.prepare(`
      INSERT INTO job_records
        (id, job_id, project_id, job_category, source, source_record_ids, source_report_id,
         priority, title, description,
         affected_files, affected_devtags, affected_plantags, required_buildtags,
         blocking_jobs, blocked_by_jobs, hierarchy, atomic_steps, sandbox_spec,
         implementation_status, created_cycle, last_updated_cycle,
         timestamp, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))
    `).run(
      randomUUID(),
      jobId,
      defaultProjectId,
      jobCategory,
      'god_factory_agent',
      JSON.stringify([gap.report_id]),
      gap.report_id,
      priority,
      title,
      description,
      gap.affected_files || '[]',
      gap.affected_tags || '[]',
      '[]',
      '[]',
      '[]',
      '[]',
      JSON.stringify({ phase: 1, milestone: 'gap_report_flush', parent_job_id: null, child_job_ids: [] }),
      JSON.stringify(actionTags.map((tag, i) => ({ step: i + 1, action: tag }))),
      sandboxSpec,
      JOB_STATUS.SUGGESTED,
      0,
      0,
    );

    db.prepare(`UPDATE gap_reports SET acknowledged_at = datetime('now') WHERE report_id = ?`).run(gap.report_id);

    logGodFactoryAction(db, {
      action_type: 'gap_to_job',
      target_id: jobId,
      target_type: 'job',
      authority_invoked: 'gap_analysis_flush',
      justification_tags: ['gap_fix', gap.gap_category, gap.severity],
      result: `Created job_record ${jobId} from gap_report ${gap.report_id}`,
    });

    created++;
  }

  return created;
}

/**
 * External project jobs should create internal improvement work for Personal IDE itself.
 *
 * For each active external_project job, generate a reflection job that focuses on
 * improving the IDE pipeline/tooling so future external builds succeed more often.
 */
function reflectExternalProjectsToInternalJobs(db: Db, options?: { projectId?: string | null; limit?: number }): number {
  const limit = Math.max(1, Math.min(200, Number(options?.limit || 40)));
  const scopedProjectId = options?.projectId ? String(options.projectId) : null;

  const externalJobs = db.prepare(`
    SELECT job_id, title, description, priority, source, affected_files, affected_devtags
    FROM job_records
    WHERE job_category = 'external_project'
      AND implementation_status NOT IN ('rejected', 'archived')
    ORDER BY
      CASE priority
        WHEN 'critical' THEN 0
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        ELSE 3
      END,
      datetime(created_at) DESC
    LIMIT ?
  `).all(limit) as Array<{
    job_id: string;
    title: string;
    description: string | null;
    priority: string;
    source: string | null;
    affected_files: string | null;
    affected_devtags: string | null;
  }>;

  if (externalJobs.length === 0) return 0;

  let created = 0;

  for (const ext of externalJobs) {
    const marker = `reflection_from_external_job:${ext.job_id}`;
    const existing = db.prepare(`
      SELECT job_id
      FROM job_records
      WHERE source = 'god_factory_agent'
        AND job_category = 'god_factory_scan'
        AND implementation_status NOT IN ('rejected', 'archived')
        AND description LIKE ?
      LIMIT 1
    `).get(`%${marker}%`) as { job_id?: string } | undefined;

    if (existing?.job_id) continue;

    const reflectionJobId = randomUUID();
    const extPriority = String(ext.priority || 'medium');
    const mappedPriority = extPriority === 'critical' || extPriority === 'high' ? 'high' : 'medium';
    const sourceIds = JSON.stringify([ext.job_id]);
    const affectedFiles = parseJson<string[]>(ext.affected_files, []);
    const affectedDevtags = parseJson<string[]>(ext.affected_devtags, []);
    const title = `Reflect external outcome: ${String(ext.title || 'External project issue').slice(0, 110)}`;
    const description = [
      'External project signal indicates a Personal IDE pipeline/tooling opportunity.',
      `Source external job: ${ext.job_id}`,
      `Source origin: ${ext.source || 'unknown'}`,
      marker,
      '',
      'Goal: improve Personal IDE generation quality for future external builds by implementing reusable internal fixes/tools.',
      ext.description ? `External description: ${ext.description.slice(0, 900)}` : null,
    ].filter(Boolean).join('\n');

    db.prepare(`
      INSERT INTO job_records
        (id, job_id, project_id, job_category, source, source_record_ids,
         priority, title, description, affected_files, affected_devtags,
         affected_plantags, required_buildtags, blocking_jobs, blocked_by_jobs,
         hierarchy, atomic_steps, sandbox_spec, implementation_status,
         created_cycle, last_updated_cycle, timestamp, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))
    `).run(
      randomUUID(),
      reflectionJobId,
      scopedProjectId,
      'god_factory_scan',
      'god_factory_agent',
      sourceIds,
      mappedPriority,
      title,
      description,
      JSON.stringify(affectedFiles),
      JSON.stringify(affectedDevtags),
      '[]',
      '[]',
      '[]',
      '[]',
      JSON.stringify({ phase: 1, milestone: 'external_reflection', parent_job_id: ext.job_id, child_job_ids: [] }),
      JSON.stringify([
        'Inspect external failure/success pattern and root-cause in Personal IDE pipeline',
        'Design internal tool/policy/runtime hardening to improve next external build',
        'Implement and verify with tests/telemetry, then document in help/discussion links',
      ]),
      JSON.stringify({ sandbox_id: null, status: 'not_started', cycle_limit: 50, cycles_used: 0, test_results: [], human_review_required: false, human_review_completed: false }),
      JOB_STATUS.SUGGESTED,
      0,
      0,
    );

    created += 1;
  }

  return created;
}

/**
 * When local models are excluded by machine-limit guards, create internal
 * improvement jobs so this signal feeds back into the autonomous pipeline.
 */
function createMachineLimitReflectionJobs(
  db: Db,
  blockedModels: string[],
  options?: { projectId?: string | null },
): number {
  if (!blockedModels.length) return 0;

  const scopedProjectId = options?.projectId ? String(options.projectId) : null;
  let created = 0;

  for (const blocked of blockedModels) {
    const modelId = String(blocked.split(':')[0] || '').trim();
    if (!modelId) continue;

    const marker = `machine_limit_block:${modelId}`;
    const existing = db.prepare(`
      SELECT job_id
      FROM job_records
      WHERE source = 'god_factory_agent'
        AND job_category = 'model_tool_enhancement'
        AND implementation_status NOT IN ('rejected', 'archived', 'implemented')
        AND description LIKE ?
      LIMIT 1
    `).get(`%${marker}%`) as { job_id?: string } | undefined;

    if (existing?.job_id) continue;

    const row = db.prepare(`
      SELECT context_window_tokens, provider, display_name
      FROM model_registry
      WHERE model_id = ?
      LIMIT 1
    `).get(modelId) as {
      context_window_tokens?: number | null;
      provider?: string | null;
      display_name?: string | null;
    } | undefined;

    const contextWindow = Number(row?.context_window_tokens || 0);
    const provider = String(row?.provider || extractProviderFromModelId(modelId));
    const displayName = String(row?.display_name || modelId);

    const jobId = randomUUID();
    const title = `Machine-limit reflection: ${displayName}`;
    const description = [
      'Auto-intel local fallback excluded a model due to machine-limit guard.',
      marker,
      `Model: ${modelId}`,
      `Provider: ${provider}`,
      contextWindow > 0 ? `Context window: ${contextWindow}` : null,
      'Required follow-up: benchmark local concurrency envelope, tune caps/tiers, and add safer fallback routing for this hardware profile.',
    ].filter(Boolean).join('\n');

    db.prepare(`
      INSERT INTO job_records
        (id, job_id, project_id, job_category, source, source_record_ids,
         priority, title, description, affected_files, affected_devtags,
         affected_plantags, required_buildtags, blocking_jobs, blocked_by_jobs,
         hierarchy, atomic_steps, sandbox_spec, implementation_status,
         created_cycle, last_updated_cycle, timestamp, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))
    `).run(
      randomUUID(),
      jobId,
      scopedProjectId,
      'model_tool_enhancement',
      'god_factory_agent',
      JSON.stringify([modelId]),
      'high',
      title,
      description,
      '[]',
      JSON.stringify([`devtag:model:${modelId}`]),
      '[]',
      '[]',
      '[]',
      '[]',
      JSON.stringify({ phase: 1, milestone: 'machine_limit_reflection', parent_job_id: null, child_job_ids: [] }),
      JSON.stringify([
        'Assess machine limit signal and validate local model capability envelope',
        'Tune model tier/cap/cooldown routing for stable autonomous execution',
        'Implement and verify fallback behavior with telemetry checks',
      ]),
      JSON.stringify({ sandbox_id: null, status: 'not_started', cycle_limit: 50, cycles_used: 0, test_results: [], human_review_required: false, human_review_completed: false }),
      JOB_STATUS.SUGGESTED,
      0,
      0,
    );

    created += 1;
  }

  return created;
}

function refreshGodFactorySignals(db: Db): void {
  // Wire gap reports to jobs — converts flagged gap_reports into job_records entries.
  // This closes the highest-priority wiring gap: gap analysis DOES write flagged records,
  // but nothing was reading them to create actionable jobs until this function.
  flushFlaggedGapReportsToJobs(db);

  const criticalGaps = db.prepare(`
    SELECT report_id, gap_category, severity, affected_files, affected_tags, timestamp
    FROM gap_reports
    WHERE flagged_to_god_factory = 1 OR severity IN ('critical','fatal')
    ORDER BY datetime(timestamp) DESC
    LIMIT 20
  `).all() as Array<{
    report_id: string;
    gap_category: string;
    severity: 'info' | 'warning' | 'error' | 'critical' | 'fatal';
    affected_files: string;
    affected_tags: string;
    timestamp: string;
  }>;

  for (const g of criticalGaps) {
    const files = parseJson<string[]>(g.affected_files, []);
    const tags = parseJson<string[]>(g.affected_tags, []);
    const summary = `${g.gap_category.replace(/_/g, ' ')} gap (${g.severity}) affecting ${files.length} file(s), ${tags.length} tag(s).`;
    ensureNotification(db, {
      category: 'gap_report',
      source_forensic_id: g.report_id,
      severity: g.severity,
      summary_tags: tags.slice(0, 8),
      natural_language_summary: summary,
    });
  }

  const lowModels = db.prepare(`
    SELECT model_id, avg_quality, success_rate, total_runs, trend
    FROM model_registry
    WHERE total_runs >= 5 AND (avg_quality < 60 OR success_rate < 0.60)
    ORDER BY avg_quality ASC, success_rate ASC
    LIMIT 20
  `).all() as Array<{
    model_id: string;
    avg_quality: number;
    success_rate: number;
    total_runs: number;
    trend: string;
  }>;

  for (const m of lowModels) {
    ensureNotification(db, {
      category: 'model_behavior_alert',
      source_forensic_id: m.model_id,
      severity: m.avg_quality < 45 || m.success_rate < 0.45 ? 'critical' : 'warning',
      summary_tags: ['model_quality_drop'],
      natural_language_summary: `${m.model_id} quality degraded: score ${Math.round(m.avg_quality)}%, success ${Math.round(m.success_rate * 100)}%, trend ${m.trend}.`,
    });

    ensureIdleSuggestion(db, {
      category: 'model_behavior_alert',
      source_forensic_ids: [m.model_id],
      natural_language_summary: `${m.model_id} has low rolling quality. Consider creating a Suggested Job for model-tool hardening.`,
    });
  }

  const debtRows = db.prepare(`
    WITH ranked AS (
      SELECT
        file_path,
        debt_score,
        ceiling,
        entry_id,
        timestamp,
        ROW_NUMBER() OVER (PARTITION BY file_path ORDER BY datetime(timestamp) DESC) AS rn
      FROM debt_history
    )
    SELECT
      cur.file_path,
      cur.debt_score AS current_score,
      prev.debt_score AS previous_score,
      cur.ceiling,
      cur.entry_id
    FROM ranked cur
    JOIN ranked prev ON prev.file_path = cur.file_path AND prev.rn = 2
    WHERE cur.rn = 1
      AND ABS(cur.debt_score - prev.debt_score) > 3
    ORDER BY ABS(cur.debt_score - prev.debt_score) DESC
    LIMIT 20
  `).all() as Array<{
    file_path: string;
    current_score: number;
    previous_score: number;
    ceiling: number;
    entry_id: string;
  }>;

  for (const d of debtRows) {
    const delta = d.current_score - d.previous_score;
    const summary = `${d.file_path} debt changed by ${delta.toFixed(1)} (now ${d.current_score.toFixed(1)} / ceiling ${d.ceiling.toFixed(1)}).`;

    ensureNotification(db, {
      category: 'debt_warning',
      source_forensic_id: d.entry_id,
      severity: d.current_score > d.ceiling ? 'error' : 'warning',
      summary_tags: ['debt_score_shift'],
      natural_language_summary: summary,
    });

    ensureIdleSuggestion(db, {
      category: 'debt_warning',
      source_files: [d.file_path],
      source_forensic_ids: [d.entry_id],
      natural_language_summary: summary,
    });
  }

  const recurrenceRows = db.prepare(`
    SELECT pattern_id, failure_type, recurrence_count, severity, devtag_type, contributing_forensic_ids
    FROM patterns
    WHERE recurrence_count >= 5
    ORDER BY recurrence_count DESC
    LIMIT 20
  `).all() as Array<{
    pattern_id: string;
    failure_type: string;
    recurrence_count: number;
    severity: 'info' | 'warning' | 'error' | 'critical' | 'fatal';
    devtag_type: string;
    contributing_forensic_ids: string;
  }>;

  for (const p of recurrenceRows) {
    const sev: 'info' | 'warning' | 'error' | 'critical' | 'fatal' =
      p.recurrence_count >= 10 ? 'critical' : (p.severity || 'warning');

    ensureNotification(db, {
      category: 'pattern_watch',
      source_forensic_id: p.pattern_id,
      severity: sev,
      summary_tags: [p.failure_type, p.devtag_type],
      natural_language_summary: `Pattern ${p.failure_type} hit recurrence ${p.recurrence_count} (${p.devtag_type}).`,
    });

    ensureIdleSuggestion(db, {
      category: 'regression_trend',
      source_devtags: [p.devtag_type],
      source_forensic_ids: parseJson<string[]>(p.contributing_forensic_ids, []).slice(0, 8),
      natural_language_summary: `Recurring ${p.failure_type} trend detected for ${p.devtag_type} (count ${p.recurrence_count}).`,
    });
  }
}

function createJobFromSuggestion(db: Db, suggestion: { suggestion_id: string; category: IdleCategory; natural_language_summary: string; source_files: string; source_devtags: string; project_id?: string | null }): string {
  const jobId = randomUUID();
  const categoryMap: Record<IdleCategory, string> = {
    trivial_enhancement: 'user_requested',
    feature_bridge: 'integration_repair',
    performance_opportunity: 'debt_reduction',
    debt_warning: 'debt_reduction',
    regression_trend: 'regression_hardening',
    model_behavior_alert: 'model_tool_enhancement',
  };

  const sandboxSpec = {
    sandbox_id: null,
    status: 'not_started',
    cycle_limit: 50,
    cycles_used: 0,
    test_results: [],
    human_review_required: false,
    human_review_completed: false,
  };

  db.prepare(`
    INSERT INTO job_records
      (id, job_id, project_id, job_category, source, source_record_ids, priority, title,
       affected_files, affected_devtags, affected_plantags, required_buildtags,
       blocking_jobs, blocked_by_jobs, hierarchy, atomic_steps, sandbox_spec,
       implementation_status, created_cycle, last_updated_cycle, timestamp, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))
  `).run(
    randomUUID(),
    jobId,
    suggestion.project_id ?? (() => {
      const projects = db.prepare(`
        SELECT id
        FROM projects
        ORDER BY last_accessed_at DESC, created_at DESC
        LIMIT 2
      `).all() as Array<{ id: string }>;
      return projects.length === 1 ? projects[0].id : null;
    })(),
    categoryMap[suggestion.category] || 'user_requested',
    'god_factory_agent',
    JSON.stringify([suggestion.suggestion_id]),
    'medium',
    `Idle Suggestion: ${suggestion.natural_language_summary.slice(0, 140)}`,
    suggestion.source_files,
    suggestion.source_devtags,
    '[]',
    '[]',
    '[]',
    '[]',
    JSON.stringify({ phase: 1, milestone: 'idle_suggestion', parent_job_id: null, child_job_ids: [] }),
    '[]',
    JSON.stringify(sandboxSpec),
    JOB_STATUS.SUGGESTED,
    0,
    0,
  );

  return jobId;
}

export async function godFactoryRoutes(app: FastifyInstance) {
  const db = (app as unknown as { db: Db }).db;
  const AUTO_INTEL_SETTINGS_KEY = 'god_factory:auto_intel:settings';
  const AUTO_INTEL_LAST_RUN_KEY = 'god_factory:auto_intel:last_run_at';
  const AUTO_INTEL_LAST_ERROR_KEY = 'god_factory:auto_intel:last_error';
  const AUTO_INTEL_LAST_RESULT_KEY = 'god_factory:auto_intel:last_result';
  const AUTO_INTEL_COUNTERS_KEY = 'god_factory:auto_intel:counters';

  type AutoIntelSettings = {
    enabled: boolean;
    intervalSec: number;
    executeJobs: boolean;
    analyzeEmployer: boolean;
    reflectExternalJobs: boolean;
    cooldownProfile: CooldownProfileId;
    cooldownHorizonHours: number;
    projectId: string | null;
    model: string | null;
    maxIterations: number;
    jobMaxIterations: number;
    autoCooldownProfile: boolean;
    preferLocalWhenCloudExhausted: boolean;
    cloudRequestCapEnabled: boolean;
    cloudRequestCapWindowHours: number;
    cloudRequestCapRequests: number;
    localContextWindowCapEnabled: boolean;
    localContextWindowCapTokens: number;
    localParallelTarget: number;
    localBenchmarkPlannerEnabled: boolean;
    localLaneTokenBudget: number;
    localMaxParallelLanes: number;
  };

  type AutoIntelCounters = {
    cycles_started: number;
    cycles_completed: number;
    cycles_failed: number;
    cycles_skipped: number;
    loop_start_attempts: number;
    loop_start_success: number;
    loop_start_failed: number;
    last_skip_reason: string | null;
    last_loop_start_error: string | null;
  };

  const DEFAULT_AUTO_INTEL_SETTINGS: AutoIntelSettings = {
    enabled: false,
    intervalSec: 15 * 60,
    executeJobs: false,
    analyzeEmployer: true,
    reflectExternalJobs: true,
    cooldownProfile: 'safe-exhaustive',
    cooldownHorizonHours: 24,
    projectId: null,
    model: null,
    maxIterations: 0,
    jobMaxIterations: 50,
    autoCooldownProfile: true,
    preferLocalWhenCloudExhausted: true,
    cloudRequestCapEnabled: false,
    cloudRequestCapWindowHours: 24,
    cloudRequestCapRequests: 250,
    localContextWindowCapEnabled: true,
    localContextWindowCapTokens: 32000,
    localParallelTarget: 2,
    localBenchmarkPlannerEnabled: true,
    localLaneTokenBudget: 64000,
    localMaxParallelLanes: 4,
  };

  const DEFAULT_AUTO_INTEL_COUNTERS: AutoIntelCounters = {
    cycles_started: 0,
    cycles_completed: 0,
    cycles_failed: 0,
    cycles_skipped: 0,
    loop_start_attempts: 0,
    loop_start_success: 0,
    loop_start_failed: 0,
    last_skip_reason: null,
    last_loop_start_error: null,
  };

  function loadAutoIntelSettings(): AutoIntelSettings {
    try {
      const raw = getKv(db, AUTO_INTEL_SETTINGS_KEY);
      if (!raw) return DEFAULT_AUTO_INTEL_SETTINGS;
      const parsed = JSON.parse(raw) as Partial<AutoIntelSettings>;
      const parsedCooldownProfile = String(parsed.cooldownProfile || DEFAULT_AUTO_INTEL_SETTINGS.cooldownProfile) as CooldownProfileId;
      return {
        enabled: !!parsed.enabled,
        intervalSec: Math.max(60, Math.min(7 * 24 * 3600, Number(parsed.intervalSec || DEFAULT_AUTO_INTEL_SETTINGS.intervalSec))),
        executeJobs: !!parsed.executeJobs,
        analyzeEmployer: parsed.analyzeEmployer ?? DEFAULT_AUTO_INTEL_SETTINGS.analyzeEmployer,
        reflectExternalJobs: parsed.reflectExternalJobs ?? DEFAULT_AUTO_INTEL_SETTINGS.reflectExternalJobs,
        cooldownProfile: COOLDOWN_PROFILES[parsedCooldownProfile] ? parsedCooldownProfile : DEFAULT_AUTO_INTEL_SETTINGS.cooldownProfile,
        cooldownHorizonHours: Math.max(1, Math.min(7 * 24, Number(parsed.cooldownHorizonHours || DEFAULT_AUTO_INTEL_SETTINGS.cooldownHorizonHours))),
        projectId: parsed.projectId ? String(parsed.projectId) : null,
        model: parsed.model ? String(parsed.model) : null,
        maxIterations: Number.isFinite(Number(parsed.maxIterations)) ? Number(parsed.maxIterations) : DEFAULT_AUTO_INTEL_SETTINGS.maxIterations,
        jobMaxIterations: Number.isFinite(Number(parsed.jobMaxIterations))
          ? Math.max(1, Math.min(5000, Number(parsed.jobMaxIterations)))
          : DEFAULT_AUTO_INTEL_SETTINGS.jobMaxIterations,
        autoCooldownProfile: parsed.autoCooldownProfile ?? DEFAULT_AUTO_INTEL_SETTINGS.autoCooldownProfile,
        preferLocalWhenCloudExhausted: parsed.preferLocalWhenCloudExhausted ?? DEFAULT_AUTO_INTEL_SETTINGS.preferLocalWhenCloudExhausted,
        cloudRequestCapEnabled: parsed.cloudRequestCapEnabled ?? DEFAULT_AUTO_INTEL_SETTINGS.cloudRequestCapEnabled,
        cloudRequestCapWindowHours: Number.isFinite(Number(parsed.cloudRequestCapWindowHours))
          ? Math.max(1, Math.min(24 * 30, Number(parsed.cloudRequestCapWindowHours)))
          : DEFAULT_AUTO_INTEL_SETTINGS.cloudRequestCapWindowHours,
        cloudRequestCapRequests: Number.isFinite(Number(parsed.cloudRequestCapRequests))
          ? Math.max(1, Math.min(1000000, Number(parsed.cloudRequestCapRequests)))
          : DEFAULT_AUTO_INTEL_SETTINGS.cloudRequestCapRequests,
        localContextWindowCapEnabled: parsed.localContextWindowCapEnabled ?? DEFAULT_AUTO_INTEL_SETTINGS.localContextWindowCapEnabled,
        localContextWindowCapTokens: Number.isFinite(Number(parsed.localContextWindowCapTokens))
          ? Math.max(1024, Math.min(500000, Number(parsed.localContextWindowCapTokens)))
          : DEFAULT_AUTO_INTEL_SETTINGS.localContextWindowCapTokens,
        localParallelTarget: Number.isFinite(Number(parsed.localParallelTarget))
          ? Math.max(1, Math.min(16, Number(parsed.localParallelTarget)))
          : DEFAULT_AUTO_INTEL_SETTINGS.localParallelTarget,
        localBenchmarkPlannerEnabled: parsed.localBenchmarkPlannerEnabled ?? DEFAULT_AUTO_INTEL_SETTINGS.localBenchmarkPlannerEnabled,
        localLaneTokenBudget: Number.isFinite(Number(parsed.localLaneTokenBudget))
          ? Math.max(4096, Math.min(2000000, Number(parsed.localLaneTokenBudget)))
          : DEFAULT_AUTO_INTEL_SETTINGS.localLaneTokenBudget,
        localMaxParallelLanes: Number.isFinite(Number(parsed.localMaxParallelLanes))
          ? Math.max(1, Math.min(32, Number(parsed.localMaxParallelLanes)))
          : DEFAULT_AUTO_INTEL_SETTINGS.localMaxParallelLanes,
      };
    } catch {
      return DEFAULT_AUTO_INTEL_SETTINGS;
    }
  }

  function saveAutoIntelSettings(patch: Partial<AutoIntelSettings>): AutoIntelSettings {
    const current = loadAutoIntelSettings();
    const next: AutoIntelSettings = {
      ...current,
      ...patch,
      cooldownProfile: (() => {
        const requested = String(patch.cooldownProfile ?? current.cooldownProfile) as CooldownProfileId;
        return COOLDOWN_PROFILES[requested] ? requested : current.cooldownProfile;
      })(),
      intervalSec: Math.max(60, Math.min(7 * 24 * 3600, Number(patch.intervalSec ?? current.intervalSec))),
      executeJobs: patch.executeJobs ?? current.executeJobs,
      analyzeEmployer: patch.analyzeEmployer ?? current.analyzeEmployer,
      reflectExternalJobs: patch.reflectExternalJobs ?? current.reflectExternalJobs,
      cooldownHorizonHours: Number.isFinite(Number(patch.cooldownHorizonHours ?? current.cooldownHorizonHours))
        ? Math.max(1, Math.min(7 * 24, Number(patch.cooldownHorizonHours ?? current.cooldownHorizonHours)))
        : current.cooldownHorizonHours,
      enabled: patch.enabled ?? current.enabled,
      projectId: patch.projectId === undefined ? current.projectId : (patch.projectId ? String(patch.projectId) : null),
      model: patch.model === undefined ? current.model : (patch.model ? String(patch.model) : null),
      maxIterations: Number.isFinite(Number(patch.maxIterations ?? current.maxIterations))
        ? Number(patch.maxIterations ?? current.maxIterations)
        : current.maxIterations,
      jobMaxIterations: Number.isFinite(Number(patch.jobMaxIterations ?? current.jobMaxIterations))
        ? Math.max(1, Math.min(5000, Number(patch.jobMaxIterations ?? current.jobMaxIterations)))
        : current.jobMaxIterations,
      autoCooldownProfile: patch.autoCooldownProfile ?? current.autoCooldownProfile,
      preferLocalWhenCloudExhausted: patch.preferLocalWhenCloudExhausted ?? current.preferLocalWhenCloudExhausted,
      cloudRequestCapEnabled: patch.cloudRequestCapEnabled ?? current.cloudRequestCapEnabled,
      cloudRequestCapWindowHours: Number.isFinite(Number(patch.cloudRequestCapWindowHours ?? current.cloudRequestCapWindowHours))
        ? Math.max(1, Math.min(24 * 30, Number(patch.cloudRequestCapWindowHours ?? current.cloudRequestCapWindowHours)))
        : current.cloudRequestCapWindowHours,
      cloudRequestCapRequests: Number.isFinite(Number(patch.cloudRequestCapRequests ?? current.cloudRequestCapRequests))
        ? Math.max(1, Math.min(1000000, Number(patch.cloudRequestCapRequests ?? current.cloudRequestCapRequests)))
        : current.cloudRequestCapRequests,
      localContextWindowCapEnabled: patch.localContextWindowCapEnabled ?? current.localContextWindowCapEnabled,
      localContextWindowCapTokens: Number.isFinite(Number(patch.localContextWindowCapTokens ?? current.localContextWindowCapTokens))
        ? Math.max(1024, Math.min(500000, Number(patch.localContextWindowCapTokens ?? current.localContextWindowCapTokens)))
        : current.localContextWindowCapTokens,
      localParallelTarget: Number.isFinite(Number(patch.localParallelTarget ?? current.localParallelTarget))
        ? Math.max(1, Math.min(16, Number(patch.localParallelTarget ?? current.localParallelTarget)))
        : current.localParallelTarget,
      localBenchmarkPlannerEnabled: patch.localBenchmarkPlannerEnabled ?? current.localBenchmarkPlannerEnabled,
      localLaneTokenBudget: Number.isFinite(Number(patch.localLaneTokenBudget ?? current.localLaneTokenBudget))
        ? Math.max(4096, Math.min(2000000, Number(patch.localLaneTokenBudget ?? current.localLaneTokenBudget)))
        : current.localLaneTokenBudget,
      localMaxParallelLanes: Number.isFinite(Number(patch.localMaxParallelLanes ?? current.localMaxParallelLanes))
        ? Math.max(1, Math.min(32, Number(patch.localMaxParallelLanes ?? current.localMaxParallelLanes)))
        : current.localMaxParallelLanes,
    };
    setKv(db, AUTO_INTEL_SETTINGS_KEY, JSON.stringify(next));
    return next;
  }

  function loadAutoIntelCounters(): AutoIntelCounters {
    const raw = getKv(db, AUTO_INTEL_COUNTERS_KEY);
    if (!raw) return { ...DEFAULT_AUTO_INTEL_COUNTERS };
    try {
      const parsed = JSON.parse(raw) as Partial<AutoIntelCounters>;
      return {
        cycles_started: Number(parsed.cycles_started || 0),
        cycles_completed: Number(parsed.cycles_completed || 0),
        cycles_failed: Number(parsed.cycles_failed || 0),
        cycles_skipped: Number(parsed.cycles_skipped || 0),
        loop_start_attempts: Number(parsed.loop_start_attempts || 0),
        loop_start_success: Number(parsed.loop_start_success || 0),
        loop_start_failed: Number(parsed.loop_start_failed || 0),
        last_skip_reason: parsed.last_skip_reason ? String(parsed.last_skip_reason) : null,
        last_loop_start_error: parsed.last_loop_start_error ? String(parsed.last_loop_start_error) : null,
      };
    } catch {
      return { ...DEFAULT_AUTO_INTEL_COUNTERS };
    }
  }

  function patchAutoIntelCounters(patch: Partial<AutoIntelCounters>): AutoIntelCounters {
    const next = { ...loadAutoIntelCounters(), ...patch };
    setKv(db, AUTO_INTEL_COUNTERS_KEY, JSON.stringify(next));
    return next;
  }

  function bumpAutoIntelCounter(
    key: 'cycles_started' | 'cycles_completed' | 'cycles_failed' | 'cycles_skipped' | 'loop_start_attempts' | 'loop_start_success' | 'loop_start_failed',
    delta = 1,
  ): void {
    const counters = loadAutoIntelCounters();
    patchAutoIntelCounters({ [key]: Math.max(0, Number(counters[key] || 0) + delta) } as Partial<AutoIntelCounters>);
  }

  function noteAutoIntelSkip(reason: string): void {
    bumpAutoIntelCounter('cycles_skipped', 1);
    patchAutoIntelCounters({ last_skip_reason: reason });
  }

  function parseDateMs(value: string | null | undefined): number {
    if (!value) return Number.NaN;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : Number.NaN;
  }

  function isLocalProvider(provider: string): boolean {
    return provider === 'ollama' || provider === 'lmstudio' || provider === 'nano';
  }

  function countRecentModelRuns(modelIds: string[], windowHours: number): number {
    if (!modelIds.length) return 0;
    const placeholders = modelIds.map(() => '?').join(', ');
    const windowExpr = `-${Math.max(1, Math.floor(windowHours))} hours`;
    const row = db.prepare(`
      SELECT COUNT(*) AS c
      FROM blame_records
      WHERE model IN (${placeholders})
        AND datetime(created_at) >= datetime('now', ?)
    `).get(...modelIds, windowExpr) as { c?: number } | undefined;
    return Number(row?.c || 0);
  }

  function resolveAutoIntelProjectId(settings: AutoIntelSettings): string | null {
    if (settings.projectId) {
      const row = db.prepare('SELECT id FROM projects WHERE id = ? LIMIT 1').get(settings.projectId) as { id?: string } | undefined;
      if (row?.id) return row.id;
    }

    const lastLoopProjectId = String(getKv(db, 'god_factory:loop:last_project_id') || '').trim();
    if (lastLoopProjectId) {
      const row = db.prepare('SELECT id FROM projects WHERE id = ? LIMIT 1').get(lastLoopProjectId) as { id?: string } | undefined;
      if (row?.id) return row.id;
    }

    const latest = db.prepare(`
      SELECT id
      FROM projects
      ORDER BY last_accessed_at DESC, created_at DESC
      LIMIT 1
    `).get() as { id?: string } | undefined;

    return latest?.id ?? null;
  }

  function filterLocalModelsByContextWindow(
    modelIds: string[],
    contextCapTokens: number,
  ): { allowed: string[]; blockedByMachineLimit: string[] } {
    if (!modelIds.length) {
      return { allowed: [], blockedByMachineLimit: [] };
    }

    const allowed: string[] = [];
    const blockedByMachineLimit: string[] = [];

    for (const modelId of modelIds) {
      const row = db.prepare(`
        SELECT context_window_tokens
        FROM model_registry
        WHERE model_id = ?
        LIMIT 1
      `).get(modelId) as { context_window_tokens?: number | null } | undefined;

      const contextWindowTokens = Number(row?.context_window_tokens || 0);
      // Unknown context windows stay eligible. Only known oversized locals are blocked.
      if (contextWindowTokens > 0 && contextWindowTokens > contextCapTokens) {
        blockedByMachineLimit.push(`${modelId}:context_window(${contextWindowTokens})`);
      } else {
        allowed.push(modelId);
      }
    }

    return { allowed, blockedByMachineLimit };
  }

  function estimateLocalParallelPlan(
    modelIds: string[],
    laneTokenBudget: number,
    maxLanes: number,
  ): {
    plannedCandidates: string[];
    deferredCandidates: string[];
    tokenBudget: number;
    tokenUsed: number;
    lanesReady: number;
  } {
    if (!modelIds.length) {
      return {
        plannedCandidates: [],
        deferredCandidates: [],
        tokenBudget: laneTokenBudget,
        tokenUsed: 0,
        lanesReady: 0,
      };
    }

    const ranked = modelIds.map((modelId) => {
      const row = db.prepare(`
        SELECT context_window_tokens
        FROM model_registry
        WHERE model_id = ?
        LIMIT 1
      `).get(modelId) as { context_window_tokens?: number | null } | undefined;

      const contextWindow = Number(row?.context_window_tokens || 0);
      // Unknown values use conservative default for planning.
      const tokenCost = contextWindow > 0 ? contextWindow : 8000;
      return { modelId, tokenCost };
    });

    ranked.sort((a, b) => a.tokenCost - b.tokenCost);

    const plannedCandidates: string[] = [];
    const deferredCandidates: string[] = [];
    let tokenUsed = 0;

    for (const candidate of ranked) {
      const laneFull = plannedCandidates.length >= maxLanes;
      const tokenFull = tokenUsed + candidate.tokenCost > laneTokenBudget;
      if (laneFull || tokenFull) {
        deferredCandidates.push(candidate.modelId);
        continue;
      }

      plannedCandidates.push(candidate.modelId);
      tokenUsed += candidate.tokenCost;
    }

    return {
      plannedCandidates,
      deferredCandidates,
      tokenBudget: laneTokenBudget,
      tokenUsed,
      lanesReady: plannedCandidates.length,
    };
  }

  function createLocalConcurrencyGapJobs(
    projectId: string | null,
    gapModelIds: string[],
    plan: { tokenBudget: number; tokenUsed: number; lanesReady: number },
  ): number {
    if (!gapModelIds.length) return 0;

    const marker = `local_concurrency_gap:${(projectId || 'none').toLowerCase()}`;
    const existing = db.prepare(`
      SELECT job_id
      FROM job_records
      WHERE source = 'god_factory_agent'
        AND job_category = 'model_tool_enhancement'
        AND implementation_status NOT IN ('rejected', 'archived', 'implemented')
        AND description LIKE ?
      LIMIT 1
    `).get(`%${marker}%`) as { job_id?: string } | undefined;

    if (existing?.job_id) return 0;

    const jobId = randomUUID();
    const title = 'Local concurrency planner gap hardening';
    const description = [
      'Auto-intel local concurrency planner could not satisfy desired local parallel target.',
      marker,
      `Deferred models: ${gapModelIds.join(', ')}`,
      `Planner token budget: ${plan.tokenBudget}`,
      `Planner token used: ${plan.tokenUsed}`,
      `Planner lanes ready: ${plan.lanesReady}`,
      'Follow-up: benchmark local model combinations, tune lane budget/max lanes, and improve fallback orchestration.',
    ].join('\n');

    db.prepare(`
      INSERT INTO job_records
        (id, job_id, project_id, job_category, source, source_record_ids,
         priority, title, description, affected_files, affected_devtags,
         affected_plantags, required_buildtags, blocking_jobs, blocked_by_jobs,
         hierarchy, atomic_steps, sandbox_spec, implementation_status,
         created_cycle, last_updated_cycle, timestamp, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))
    `).run(
      randomUUID(),
      jobId,
      projectId,
      'model_tool_enhancement',
      'god_factory_agent',
      JSON.stringify(gapModelIds),
      'high',
      title,
      description,
      '[]',
      JSON.stringify(gapModelIds.map((m) => `devtag:model:${m}`)),
      '[]',
      '[]',
      '[]',
      '[]',
      JSON.stringify({ phase: 1, milestone: 'local_parallel_planner_gap', parent_job_id: null, child_job_ids: [] }),
      JSON.stringify([
        'Capture local benchmark traces for deferred model combinations',
        'Tune planner lane budget and max lanes against observed machine limits',
        'Implement and verify safer multi-model local orchestration behavior',
      ]),
      JSON.stringify({ sandbox_id: null, status: 'not_started', cycle_limit: 50, cycles_used: 0, test_results: [], human_review_required: false, human_review_completed: false }),
      JOB_STATUS.SUGGESTED,
      0,
      0,
    );

    return 1;
  }

  type PendingJobPriorityProfile = {
    highestPriority: 'critical' | 'high' | 'medium' | 'low' | 'none';
    counts: Record<'critical' | 'high' | 'medium' | 'low', number>;
    highPriorityPresent: boolean;
  };

  function resolvePendingJobPriorityProfile(projectId: string): PendingJobPriorityProfile {
    const rows = db.prepare(`
      SELECT priority, COUNT(*) AS c
      FROM job_records
      WHERE implementation_status = ?
        AND project_id = ?
      GROUP BY priority
    `).all(JOB_STATUS.SUGGESTED, projectId) as Array<{ priority?: string; c?: number }>;

    const counts: Record<'critical' | 'high' | 'medium' | 'low', number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const row of rows) {
      const p = String(row.priority || '').toLowerCase();
      if (p === 'critical' || p === 'high' || p === 'medium' || p === 'low') {
        counts[p] = Number(row.c || 0);
      }
    }

    const highestPriority: PendingJobPriorityProfile['highestPriority'] =
      counts.critical > 0 ? 'critical'
      : counts.high > 0 ? 'high'
      : counts.medium > 0 ? 'medium'
      : counts.low > 0 ? 'low'
      : 'none';

    return {
      highestPriority,
      counts,
      highPriorityPresent: highestPriority === 'critical' || highestPriority === 'high',
    };
  }

  function pickAutoIntelModel(
    requestedModel: string | null,
    candidateChain: string[],
    pendingProfile?: PendingJobPriorityProfile,
  ): { selectedModel: string; blockedByOverride: string[]; selectedReason: string } {
    const nowMs = Date.now();
    const overrides = db.prepare(`
      SELECT model_id, override_type, cooldown_until, skip_next_cycles, sleep_until
      FROM model_cooldown_overrides
      WHERE active = 1
    `).all() as Array<{
      model_id: string;
      override_type: 'cooldown' | 'skip' | 'sleep';
      cooldown_until: string | null;
      skip_next_cycles: number;
      sleep_until: string | null;
    }>;

    const blockedByOverride: string[] = [];

    const available = candidateChain.filter((modelId) => {
      const override = overrides.find((row) => row.model_id === modelId);
      if (!override) return true;

      const cooldownUntilMs = parseDateMs(override.cooldown_until);
      const sleepUntilMs = parseDateMs(override.sleep_until);

      if (override.override_type === 'sleep' && Number.isFinite(sleepUntilMs) && sleepUntilMs > nowMs) {
        blockedByOverride.push(`${modelId}:sleep`);
        return false;
      }

      if (override.override_type === 'cooldown' && Number.isFinite(cooldownUntilMs) && cooldownUntilMs > nowMs) {
        blockedByOverride.push(`${modelId}:cooldown`);
        return false;
      }

      if (override.override_type === 'skip' && Number(override.skip_next_cycles || 0) > 0) {
        const nextSkip = Math.max(0, Number(override.skip_next_cycles || 0) - 1);
        db.prepare(`
          UPDATE model_cooldown_overrides
          SET skip_next_cycles = ?, active = CASE WHEN ? > 0 THEN 1 ELSE 0 END, updated_at = datetime('now')
          WHERE model_id = ?
        `).run(nextSkip, nextSkip, modelId);
        blockedByOverride.push(`${modelId}:skip(${nextSkip})`);
        return false;
      }

      return true;
    });

    const ranked = (available.length ? available : candidateChain).map((modelId) => {
      const row = db.prepare(`
        SELECT
          mr.avg_quality,
          mr.success_rate,
          mr.provider,
          ea.recommended_role,
          ea.role_confidence,
          ea.allowance_tier,
          ea.strategic_value_score
        FROM model_registry mr
        LEFT JOIN employer_analysis ea
          ON ea.id = (
            SELECT id
            FROM employer_analysis
            WHERE model_id = mr.model_id
            ORDER BY datetime(analyzed_at) DESC, datetime(created_at) DESC
            LIMIT 1
          )
        WHERE mr.model_id = ?
      `).get(modelId) as {
        avg_quality?: number;
        success_rate?: number;
        provider?: string;
        recommended_role?: string;
        role_confidence?: number;
        allowance_tier?: string;
        strategic_value_score?: number;
      } | undefined;

      const quality = Number(row?.avg_quality || 60);
      const successRate = Number(row?.success_rate || 0.6);
      const roleConfidence = Number(row?.role_confidence || 0.5);
      const role = String(row?.recommended_role || 'general').toLowerCase();
      const allowanceTier = String(row?.allowance_tier || 'balanced').toLowerCase();
      const strategicValueScore = Math.max(0, Math.min(100, Number(row?.strategic_value_score || 0)));
      const provider = String(row?.provider || extractProviderFromModelId(modelId));
      const isLocalProvider = provider === 'ollama' || provider === 'lmstudio' || provider === 'nano';

      let score = quality * 0.5 + successRate * 100 * 0.35 + roleConfidence * 100 * 0.15;
      score += isLocalProvider ? 3 : 8;
      if (requestedModel && modelId === requestedModel) score += 12;
      if (role === 'unreliable') score -= 30;

      const highPriority = !!pendingProfile?.highPriorityPresent;
      if (highPriority) {
        score += strategicValueScore * 0.18;
        if (allowanceTier === 'scarce') score += 8;
      } else {
        if (allowanceTier === 'scarce') score -= 10 + strategicValueScore * 0.08;
        if (allowanceTier === 'abundant') score += 12;
        if (role === 'throughput_worker') score += 8;
      }

      return { modelId, score };
    });

    ranked.sort((a, b) => b.score - a.score);

    return {
      selectedModel: ranked[0]?.modelId || candidateChain[0],
      blockedByOverride,
      selectedReason: pendingProfile?.highPriorityPresent
        ? 'high_priority_pending_jobs'
        : 'throughput_preservation_for_scarce_models',
    };
  }

  let _autoIntelTimer: NodeJS.Timeout | null = null;
  let _autoIntelTickRunning = false;

  function shouldRunAutoIntelNow(settings: AutoIntelSettings, nowMs: number): boolean {
    if (!settings.enabled) return false;
    const lastRunAt = getKv(db, AUTO_INTEL_LAST_RUN_KEY);
    if (!lastRunAt) return true;
    const lastMs = Date.parse(lastRunAt);
    if (!Number.isFinite(lastMs)) return true;
    return nowMs - lastMs >= Math.max(60, settings.intervalSec) * 1000;
  }

  async function runAutoIntelCycle(source: 'scheduler' | 'manual' | 'settings_update' = 'scheduler') {
    if (_autoIntelTickRunning) {
      noteAutoIntelSkip('tick_already_running');
      return { ok: true, skipped: true, reason: 'tick_already_running' };
    }

    const settings = loadAutoIntelSettings();
    const nowMs = Date.now();
    if (source === 'scheduler' && !shouldRunAutoIntelNow(settings, nowMs)) {
      noteAutoIntelSkip('interval_not_elapsed');
      return { ok: true, skipped: true, reason: 'interval_not_elapsed' };
    }
    if (!settings.enabled && source !== 'manual') {
      noteAutoIntelSkip('auto_intel_disabled');
      return { ok: true, skipped: true, reason: 'auto_intel_disabled' };
    }

    _autoIntelTickRunning = true;
    const startedAt = new Date().toISOString();
    bumpAutoIntelCounter('cycles_started', 1);

    try {
      const jobsFromGaps = flushFlaggedGapReportsToJobs(db);
      refreshGodFactorySignals(db);

      let employerAnalyzed = 0;
      if (settings.analyzeEmployer) {
        const analysis = runEmployerAnalysisCycle(db);
        employerAnalyzed = analysis.analyzed;
      }

      const resolvedProjectId = resolveAutoIntelProjectId(settings);
      const reflectedJobs = settings.reflectExternalJobs
        ? reflectExternalProjectsToInternalJobs(db, { projectId: resolvedProjectId, limit: 50 })
        : 0;

      let loopStartAttempted = false;
      let loopStarted = false;
      let autoModelSelection: Record<string, unknown> | null = null;
      let machineLimitJobsCreated = 0;
      let localConcurrencyGapJobsCreated = 0;

      if (settings.autoCooldownProfile) {
        applyCooldownProfile(
          settings.cooldownProfile,
          deriveCooldownCustomFromHorizon(settings.cooldownHorizonHours),
        );
      }

      if (settings.executeJobs && resolvedProjectId) {
        const state = db.prepare('SELECT state FROM god_factory_loop_state WHERE id = ?').get('singleton') as { state?: string } | undefined;
        const pending = db.prepare(`
          SELECT COUNT(*) AS c
          FROM job_records
          WHERE implementation_status = ?
            AND project_id = ?
        `).get(JOB_STATUS.SUGGESTED, resolvedProjectId) as { c?: number } | undefined;
        const pendingPriorityProfile = resolvePendingJobPriorityProfile(resolvedProjectId);

        const strategyAtStart = resolveModelStrategy(db, settings.model || undefined);
        const configuredCandidates = [strategyAtStart.primaryModel, ...strategyAtStart.fallbackModels].filter((m) => {
          const provider = extractProviderFromModelId(m) as ProviderType;
          return !!getProviderClient(db, provider);
        });

        if (state?.state !== 'running' && (pending?.c ?? 0) > 0 && configuredCandidates.length > 0) {
          const localCandidatesRaw = configuredCandidates.filter((modelId) => {
            const provider = String(extractProviderFromModelId(modelId));
            return isLocalProvider(provider);
          });
          const localFilter = settings.localContextWindowCapEnabled
            ? filterLocalModelsByContextWindow(localCandidatesRaw, settings.localContextWindowCapTokens)
            : { allowed: localCandidatesRaw, blockedByMachineLimit: [] as string[] };
          const localCandidates = localFilter.allowed;
          const blockedByMachineLimit = localFilter.blockedByMachineLimit;
          const localParallelPlan = settings.localBenchmarkPlannerEnabled
            ? estimateLocalParallelPlan(localCandidates, settings.localLaneTokenBudget, settings.localMaxParallelLanes)
            : {
              plannedCandidates: localCandidates,
              deferredCandidates: [] as string[],
              tokenBudget: settings.localLaneTokenBudget,
              tokenUsed: 0,
              lanesReady: localCandidates.length,
            };

          const cloudCandidates = configuredCandidates.filter((modelId) => {
            const provider = String(extractProviderFromModelId(modelId));
            return !isLocalProvider(provider);
          });

          const configuredFilteredCandidates = configuredCandidates.filter((modelId) => {
            const provider = String(extractProviderFromModelId(modelId));
            return !isLocalProvider(provider) || localCandidates.includes(modelId);
          });

          let cloudUsageCount = 0;
          let cloudBudgetExhausted = false;
          if (settings.cloudRequestCapEnabled && cloudCandidates.length > 0) {
            cloudUsageCount = countRecentModelRuns(cloudCandidates, settings.cloudRequestCapWindowHours);
            cloudBudgetExhausted = cloudUsageCount >= settings.cloudRequestCapRequests;
          }

          const activeCandidates = (settings.preferLocalWhenCloudExhausted && cloudBudgetExhausted && localCandidates.length > 0)
            ? (settings.localBenchmarkPlannerEnabled && localParallelPlan.plannedCandidates.length > 0
              ? localParallelPlan.plannedCandidates
              : localCandidates)
            : configuredFilteredCandidates;

          if (blockedByMachineLimit.length > 0) {
            machineLimitJobsCreated = createMachineLimitReflectionJobs(db, blockedByMachineLimit, { projectId: resolvedProjectId });
          }

          if (localParallelPlan.deferredCandidates.length > 0 && localParallelPlan.lanesReady < settings.localParallelTarget) {
            localConcurrencyGapJobsCreated = createLocalConcurrencyGapJobs(
              resolvedProjectId,
              localParallelPlan.deferredCandidates,
              {
                tokenBudget: localParallelPlan.tokenBudget,
                tokenUsed: localParallelPlan.tokenUsed,
                lanesReady: localParallelPlan.lanesReady,
              },
            );
          }

          if (settings.preferLocalWhenCloudExhausted && cloudBudgetExhausted && localCandidates.length === 0 && localCandidatesRaw.length > 0) {
            noteAutoIntelSkip('local_models_blocked_by_machine_limit');
          }

          const selectionPool = activeCandidates.length ? activeCandidates : configuredFilteredCandidates;
          if (!selectionPool.length) {
            noteAutoIntelSkip('no_available_candidates');
            autoModelSelection = {
              selected_model: null,
              cloud_usage_count: cloudUsageCount,
              cloud_budget_exhausted: cloudBudgetExhausted,
              active_candidate_count: activeCandidates.length,
              local_candidate_count: localCandidates.length,
              local_candidate_raw_count: localCandidatesRaw.length,
              cloud_candidate_count: cloudCandidates.length,
              blocked_by_machine_limit: blockedByMachineLimit,
              machine_limit_jobs_created: machineLimitJobsCreated,
              local_concurrency_gap_jobs_created: localConcurrencyGapJobsCreated,
              local_parallel_target: settings.localParallelTarget,
              local_parallel_ready: localParallelPlan.lanesReady,
              local_parallel_candidates: localParallelPlan.plannedCandidates,
              local_parallel_deferred_candidates: localParallelPlan.deferredCandidates,
              local_parallel_token_budget: localParallelPlan.tokenBudget,
              local_parallel_token_used: localParallelPlan.tokenUsed,
              pending_priority_profile: pendingPriorityProfile,
              selection_reason: 'no_available_candidates',
              blocked_by_override: [],
            };
          } else {
            const selection = pickAutoIntelModel(
              settings.model,
              selectionPool,
              pendingPriorityProfile,
            );
            const candidateChain = [selection.selectedModel, ...selectionPool.filter((m) => m !== selection.selectedModel)];
            loopStartAttempted = true;
            bumpAutoIntelCounter('loop_start_attempts', 1);

            const startPayload = {
              projectId: resolvedProjectId,
              model: selection.selectedModel,
              candidateChain,
              maxIterations: settings.maxIterations,
              jobMaxIterations: settings.jobMaxIterations,
              autoApproveChanges: false,
              autoAnswerQuestions: false,
              checkpointEvery: 5,
              cooldownProfile: settings.cooldownProfile,
              autoCooldownProfile: settings.autoCooldownProfile,
              cooldownHorizonHours: settings.cooldownHorizonHours,
            };

            // Reuse the authoritative loop start path instead of maintaining a second implementation.
            const res = await app.inject({
              method: 'POST',
              url: '/api/god-factory/loop/start',
              headers: {
                'x-gf-internal-scheduler': '1',
              },
              payload: startPayload,
            });
            loopStarted = res.statusCode >= 200 && res.statusCode < 300;

            const runSummary = {
              selected_model: selection.selectedModel,
              candidate_chain: candidateChain,
              cloud_usage_count: cloudUsageCount,
              cloud_budget_exhausted: cloudBudgetExhausted,
              active_candidate_count: activeCandidates.length,
              local_candidate_count: localCandidates.length,
              local_candidate_raw_count: localCandidatesRaw.length,
              cloud_candidate_count: cloudCandidates.length,
              blocked_by_machine_limit: blockedByMachineLimit,
              machine_limit_jobs_created: machineLimitJobsCreated,
              local_concurrency_gap_jobs_created: localConcurrencyGapJobsCreated,
              local_parallel_target: settings.localParallelTarget,
              local_parallel_ready: localParallelPlan.lanesReady,
              local_parallel_candidates: localParallelPlan.plannedCandidates,
              local_parallel_deferred_candidates: localParallelPlan.deferredCandidates,
              local_parallel_token_budget: localParallelPlan.tokenBudget,
              local_parallel_token_used: localParallelPlan.tokenUsed,
              pending_priority_profile: pendingPriorityProfile,
              selection_reason: selection.selectedReason,
              blocked_by_override: selection.blockedByOverride,
            };
            autoModelSelection = runSummary;

            if (loopStarted) {
              bumpAutoIntelCounter('loop_start_success', 1);
              patchAutoIntelCounters({ last_loop_start_error: null });
            } else {
              bumpAutoIntelCounter('loop_start_failed', 1);
              let errorMessage = `HTTP ${res.statusCode}`;
              try {
                const parsed = JSON.parse(String(res.body || '{}')) as { error?: string };
                if (typeof parsed.error === 'string' && parsed.error.trim()) {
                  errorMessage = parsed.error;
                }
              } catch {
                // Keep HTTP fallback when payload is empty or not JSON.
              }
              patchAutoIntelCounters({ last_loop_start_error: errorMessage });
            }
          }
        }
      }

      const result = {
        ok: true,
        source,
        started_at: startedAt,
        jobs_from_gaps: jobsFromGaps,
        employer_analyzed: employerAnalyzed,
        reflected_jobs: reflectedJobs,
        loop_start_attempted: loopStartAttempted,
        loop_started: loopStarted,
        resolved_project_id: resolvedProjectId,
        auto_model_selection: autoModelSelection,
      };

      setKv(db, AUTO_INTEL_LAST_RUN_KEY, startedAt);
      setKv(db, AUTO_INTEL_LAST_RESULT_KEY, JSON.stringify(result));
      setKv(db, AUTO_INTEL_LAST_ERROR_KEY, '');
      bumpAutoIntelCounter('cycles_completed', 1);
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err || 'Unknown auto-intel error');
      const stamped = `${new Date().toISOString()} ${source}: ${message}`;
      setKv(db, AUTO_INTEL_LAST_ERROR_KEY, stamped);
      bumpAutoIntelCounter('cycles_failed', 1);
      recordLoopError(db, {
        phase: 'auto_intel_cycle',
        runId: null,
        err,
        fatal: false,
      });
      return { ok: false, source, error: message };
    } finally {
      _autoIntelTickRunning = false;
    }
  }

  function startAutoIntelScheduler(): void {
    if (_autoIntelTimer) return;
    _autoIntelTimer = setInterval(() => {
      void runAutoIntelCycle('scheduler');
    }, 30_000);
  }

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

  function isControlOwner(): boolean {
    try {
      const activeRow = db
        .prepare(`SELECT github_login, github_user_id FROM auth_tokens WHERE is_active = 1 LIMIT 1`)
        .get() as { github_login: string; github_user_id: number } | undefined;

      // Mutating the IDE control plane must track the actively selected account only.
      // Falling back to any saved owner row would keep privileges alive after a guest
      // or different user becomes active, which turns "saved credential" into
      // "current authority" and silently bypasses the intended session boundary.
      return activeRow?.github_user_id !== -1 && activeRow?.github_login === CONTROL_OWNER_LOGIN;
    } catch {
      return false;
    }
  }

  function isInternalSchedulerCall(req: FastifyRequest): boolean {
    const marker = String(req.headers['x-gf-internal-scheduler'] || '').trim();
    if (marker !== '1') return false;
    const ip = String(req.ip || '');
    if (!ip) return true;
    return ip === '127.0.0.1' || ip === '::1' || ip.startsWith('::ffff:127.');
  }

  function requireControlOwner(reply: FastifyReply): boolean {
    if (!isControlOwner()) {
      reply.status(403).send({ error: 'Control-plane mutation endpoints require repository owner privileges.' });
      return false;
    }
    return true;
  }

  app.get('/queue', async (req: FastifyRequest, reply: FastifyReply) => {
    refreshGodFactorySignals(db);

    const q = req.query as Record<string, string>;
    const limit = Math.min(parseInt(q.limit || '30', 10), 200);
    const unackedOnly = q.unacked !== 'false';

    const rows = db.prepare(`
      SELECT *
      FROM notification_queue
      ${unackedOnly ? 'WHERE user_acknowledged = 0' : ''}
      ORDER BY
        CASE severity WHEN 'fatal' THEN 0 WHEN 'critical' THEN 1 WHEN 'error' THEN 2 WHEN 'warning' THEN 3 ELSE 4 END,
        datetime(timestamp) DESC
      LIMIT ?
    `).all(limit) as Array<Record<string, unknown> & { notification_id: string }>;

    const notifications = rows.map((r) => ({
      ...r,
      summary_tags: parseJson<string[]>(r.summary_tags, []),
      presented_to_user: !!r.presented_to_user,
      user_acknowledged: !!r.user_acknowledged,
    }));

    return reply.send({ notifications, total: notifications.length });
  });

  app.post('/queue/:id/present', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const result = db.prepare('UPDATE notification_queue SET presented_to_user = 1 WHERE notification_id = ?').run(id);
    if (result.changes === 0) return reply.status(404).send({ error: 'Notification not found' });
    return reply.send({ presented: true, notification_id: id });
  });

  app.post('/queue/:id/ack', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    db.prepare('UPDATE notification_queue SET user_acknowledged = 1, presented_to_user = 1 WHERE notification_id = ?').run(id);
    return reply.send({ acknowledged: true, notification_id: id });
  });

  // Alias: dismiss a notification (marks as acknowledged — no dismissed column in schema)
  app.post('/notifications/:id/dismiss', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const result = db.prepare('UPDATE notification_queue SET user_acknowledged = 1, presented_to_user = 1 WHERE notification_id = ?').run(id);
    if (result.changes === 0) return reply.status(404).send({ error: 'Notification not found' });
    return reply.send({ dismissed: true, notification_id: id });
  });

  app.get('/queue/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const detail = getNotificationDetail(db, id);
    if (!detail) return reply.status(404).send({ error: 'Notification not found' });
    return reply.send(detail);
  });

  app.get('/idle-suggestions', async (req: FastifyRequest, reply: FastifyReply) => {
    refreshGodFactorySignals(db);

    const q = req.query as Record<string, string>;
    const limit = Math.min(parseInt(q.limit || '20', 10), 100);
    const includeResponded = q.include_responded === 'true';

    const rows = db.prepare(`
      SELECT * FROM idle_suggestions
      ${includeResponded ? '' : 'WHERE user_response IS NULL'}
      ORDER BY datetime(timestamp) DESC
      LIMIT ?
    `).all(limit) as Array<Record<string, unknown> & { suggestion_id: string }>;

    const suggestions = rows.map((r) => ({
      ...r,
      source_devtags: parseJson<string[]>(r.source_devtags, []),
      source_files: parseJson<string[]>(r.source_files, []),
      source_lines: parseJson<Array<[number, number]>>(r.source_lines, []),
      source_forensic_ids: parseJson<string[]>(r.source_forensic_ids, []),
      presented_to_user: !!r.presented_to_user,
    }));

    return reply.send({ suggestions, total: suggestions.length });
  });

  app.post('/idle-suggestions/:id/present', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const result = db.prepare('UPDATE idle_suggestions SET presented_to_user = 1 WHERE suggestion_id = ?').run(id);
    if (result.changes === 0) return reply.status(404).send({ error: 'Suggestion not found' });
    return reply.send({ presented: true, suggestion_id: id });
  });

  app.post('/idle-suggestions/:id/respond', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireControlOwner(reply)) return;

    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    const response = String(body.response || '') as IdleResponse;
    const scopedProjectId = resolveScopedProjectId(body.project_id ?? body.projectId);
    if ((body.project_id ?? body.projectId) !== undefined && !scopedProjectId) {
      return reply.status(400).send({ error: 'project_id must reference an existing project.' });
    }

    if (!['accepted', 'rejected', 'deferred'].includes(response)) {
      return reply.status(400).send({ error: 'response must be accepted|rejected|deferred' });
    }

    const suggestion = db.prepare('SELECT * FROM idle_suggestions WHERE suggestion_id = ?').get(id) as Record<string, unknown> | undefined;
    if (!suggestion) return reply.status(404).send({ error: 'Suggestion not found' });

    let suggestedJobId: string | null = null;
    if (response === 'accepted') {
      suggestedJobId = createJobFromSuggestion(db, {
        suggestion_id: suggestion.suggestion_id as string,
        category: suggestion.category as IdleCategory,
        natural_language_summary: suggestion.natural_language_summary as string,
        source_files: suggestion.source_files as string,
        source_devtags: suggestion.source_devtags as string,
        project_id: scopedProjectId,
      });

      ensureNotification(db, {
        category: 'idle_suggestion_accepted',
        source_forensic_id: suggestion.suggestion_id as string,
        severity: 'info',
        summary_tags: ['job_created'],
        natural_language_summary: `Created Suggested Job ${suggestedJobId} from idle suggestion.`,
      });
    }

    db.prepare(`
      UPDATE idle_suggestions
      SET user_response = ?, suggested_job_id = COALESCE(?, suggested_job_id), presented_to_user = 1
      WHERE suggestion_id = ?
    `).run(response, suggestedJobId, id);

    return reply.send({ suggestion_id: id, user_response: response, suggested_job_id: suggestedJobId });
  });

  // Alias: action endpoint for idle suggestions ('accept'|'defer'|'reject' → mapped to stored values)
  app.post('/idle-suggestions/:id/action', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireControlOwner(reply)) return;

    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    const actionMap: Record<string, string> = { accept: 'accepted', defer: 'deferred', reject: 'rejected' };
    const action = String(body.action || '');
    const response = actionMap[action];
    const scopedProjectId = resolveScopedProjectId(body.project_id ?? body.projectId);

    if (!response) {
      return reply.status(400).send({ error: 'action must be accept|defer|reject' });
    }
    if ((body.project_id ?? body.projectId) !== undefined && !scopedProjectId) {
      return reply.status(400).send({ error: 'project_id must reference an existing project.' });
    }

    const suggestion = db.prepare('SELECT * FROM idle_suggestions WHERE suggestion_id = ?').get(id) as Record<string, unknown> | undefined;
    if (!suggestion) return reply.status(404).send({ error: 'Suggestion not found' });

    let suggestedJobId: string | null = null;
    if (response === 'accepted') {
      suggestedJobId = createJobFromSuggestion(db, {
        suggestion_id: suggestion.suggestion_id as string,
        category: suggestion.category as IdleCategory,
        natural_language_summary: suggestion.natural_language_summary as string,
        source_files: suggestion.source_files as string,
        source_devtags: suggestion.source_devtags as string,
        project_id: scopedProjectId,
      });

      ensureNotification(db, {
        category: 'idle_suggestion_accepted',
        source_forensic_id: suggestion.suggestion_id as string,
        severity: 'info',
        summary_tags: ['job_created'],
        natural_language_summary: `Created Suggested Job ${suggestedJobId} from idle suggestion.`,
      });
    }

    db.prepare(`
      UPDATE idle_suggestions
      SET user_response = ?, suggested_job_id = COALESCE(?, suggested_job_id), presented_to_user = 1
      WHERE suggestion_id = ?
    `).run(response, suggestedJobId, id);

    return reply.send({ suggestion_id: id, action, user_response: response, suggested_job_id: suggestedJobId });
  });

  app.get('/model-health', async (req: FastifyRequest, reply: FastifyReply) => {
    const q = req.query as Record<string, string>;
    const limit = Math.min(parseInt(q.limit || '20', 10), 100);

    const rows = db.prepare(`
      SELECT model_id, display_name, provider, avg_quality, success_rate, total_runs,
             tag_conformance, instruction_adherence, hallucination, trend
      FROM model_registry
      ORDER BY total_runs DESC, datetime(updated_at) DESC
      LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>;

    const models = rows.map((r) => {
      const avgQuality = Number(r.avg_quality || 0);
      const successRate = Number(r.success_rate || 0);
      const conformance = Number(r.tag_conformance || 0);
      const adherence = Number(r.instruction_adherence || 0);
      const hallucination = Number(r.hallucination || 0);
      const composite = (avgQuality / 100) * 0.5 + successRate * 0.2 + conformance * 0.15 + adherence * 0.15 - hallucination * 0.2;

      return {
        ...r,
        composite_quality_score: Math.max(0, Math.min(1, Number(composite.toFixed(4)))),
      };
    });

    return reply.send({ models, total: models.length });
  });

  app.get('/model-health/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const detail = getModelHealthDetail(db, id);
    if (!detail) return reply.status(404).send({ error: 'Model not found' });
    return reply.send(detail);
  });

  app.get('/codebase-health', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(buildCodebaseHealth(db));
  });

  app.get('/background-status', async (_req: FastifyRequest, reply: FastifyReply) => {
    const runtime = getSubsystemRuntimeStatus(db);
    const scanPosition = db.prepare(`SELECT value FROM app_kv WHERE key = 'god_factory:idle_scan_position'`).get() as { value?: string } | undefined;
    const lastMonitorRun = db.prepare(`SELECT value FROM app_kv WHERE key = 'god_factory:last_monitor_run'`).get() as { value?: string } | undefined;
    const sandboxPaused = getKv(db, 'god_factory:sandbox_paused') === '1';

    return reply.send({
      scheduler: runtime.scheduler,
      subsystemStatus: runtime.status,
      controls: {
        sandbox_paused: sandboxPaused,
      },
      idleScanner: {
        scan_position: scanPosition?.value ?? null,
        last_monitor_run: lastMonitorRun?.value ?? null,
      },
      backgroundSubAgents: {
        registry_monitor: {
          label: 'Registry Monitor',
          description: 'Every cycle: reads forensic DB for new critical/fatal entries',
          last_run_cycle: getKv(db, 'gf:registry_monitor:last_cycle') ?? null,
          last_run_at: getKv(db, 'gf:registry_monitor:last_run_at') ?? null,
          status: getKv(db, 'gf:registry_monitor:status') ?? 'idle',
        },
        idle_scanner: {
          label: 'Idle Scanner',
          description: 'Activates when idle 3+ cycles: processes one file per cycle',
          last_run_cycle: getKv(db, 'gf:idle_scanner:last_cycle') ?? null,
          last_run_at: getKv(db, 'gf:idle_scanner:last_run_at') ?? null,
          scan_position: scanPosition?.value ?? null,
          status: getKv(db, 'gf:idle_scanner:status') ?? 'idle',
        },
        debt_monitor: {
          label: 'Debt Monitor',
          description: 'Every 5 cycles: reads debt_history for files with 3+ point change',
          last_run_cycle: getKv(db, 'gf:debt_monitor:last_cycle') ?? null,
          last_run_at: getKv(db, 'gf:debt_monitor:last_run_at') ?? null,
          status: getKv(db, 'gf:debt_monitor:status') ?? 'idle',
        },
        model_performance_monitor: {
          label: 'Model Performance Monitor',
          description: 'Every 3 cycles: reads quality_records for rolling quality below 0.60',
          last_run_cycle: getKv(db, 'gf:model_monitor:last_cycle') ?? null,
          last_run_at: getKv(db, 'gf:model_monitor:last_run_at') ?? null,
          status: getKv(db, 'gf:model_monitor:status') ?? 'idle',
        },
        gap_report_monitor: {
          label: 'Gap Report Monitor',
          description: 'Every 10 cycles: reads gap_reports for unacknowledged entries',
          last_run_cycle: getKv(db, 'gf:gap_monitor:last_cycle') ?? null,
          last_run_at: getKv(db, 'gf:gap_monitor:last_run_at') ?? null,
          status: getKv(db, 'gf:gap_monitor:status') ?? 'idle',
        },
        pattern_watch: {
          label: 'Pattern Watch',
          description: 'Every 5 cycles: reads patterns for new recurrence_count >= 5 hits',
          last_run_cycle: getKv(db, 'gf:pattern_watch:last_cycle') ?? null,
          last_run_at: getKv(db, 'gf:pattern_watch:last_run_at') ?? null,
          status: getKv(db, 'gf:pattern_watch:status') ?? 'idle',
        },
      },
    });
  });

  app.post('/controls/background', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireControlOwner(reply)) return;

    const body = req.body as Record<string, unknown>;
    const control = String(body.control || '');
    const reason = String(body.reason || '').trim();
    const subsystemId = (body.subsystem_id ? String(body.subsystem_id) : null) as SubsystemId | null;

    if (!['pause_scheduler', 'resume_scheduler', 'pause_sandbox', 'resume_sandbox', 'pause_subsystem', 'resume_subsystem'].includes(control)) {
      return reply.status(400).send({ error: 'Invalid control action' });
    }

    if ((control === 'pause_subsystem' || control === 'resume_subsystem') && !subsystemId) {
      return reply.status(400).send({ error: 'subsystem_id is required for subsystem controls' });
    }

    let result = 'ok';
    if (control === 'pause_scheduler') {
      stopSubsystemScheduler();
      result = 'scheduler_paused';
    } else if (control === 'resume_scheduler') {
      startSubsystemScheduler(db);
      result = 'scheduler_resumed';
    } else if (control === 'pause_sandbox') {
      setKv(db, 'god_factory:sandbox_paused', '1');
      result = 'sandbox_paused';
    } else if (control === 'resume_sandbox') {
      setKv(db, 'god_factory:sandbox_paused', '0');
      result = 'sandbox_resumed';
    } else if (subsystemId) {
      const settings = loadSettings(db);
      const nextSettings = {
        ...settings,
        [subsystemId]: {
          ...settings[subsystemId],
          enabled: control === 'resume_subsystem',
        },
      };
      setKv(db, 'subsystems:settings', JSON.stringify(nextSettings));
      result = `${subsystemId}_${control === 'resume_subsystem' ? 'resumed' : 'paused'}`;
    }

    const actionId = logGodFactoryAction(db, {
      action_type: control,
      target_id: subsystemId,
      target_type: subsystemId ? 'subsystem' : control.includes('sandbox') ? 'sandbox' : 'scheduler',
      authority_invoked: 'pause_or_resume_systems',
      justification_tags: reason ? ['user_requested', 'runtime_control'] : ['runtime_control'],
      result,
    });

    ensureNotification(db, {
      category: 'god_factory_control',
      source_forensic_id: actionId,
      severity: 'info',
      summary_tags: ['runtime_control'],
      natural_language_summary: `God Factory ${control.replace(/_/g, ' ')} completed${subsystemId ? ` for ${subsystemId}` : ''}.`,
    });

    return reply.send({ ok: true, action_id: actionId, result });
  });

  app.get('/actions', async (req: FastifyRequest, reply: FastifyReply) => {
    const q = req.query as Record<string, string>;
    const limit = Math.min(parseInt(q.limit || '20', 10), 100);
    const rows = db.prepare(`
      SELECT *
      FROM god_factory_actions
      ORDER BY datetime(timestamp) DESC
      LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>;

    return reply.send({
      actions: rows.map((row) => ({
        ...row,
        justification_tags: parseJson<string[]>(row.justification_tags, []),
      })),
    });
  });

  app.get('/tools/policy', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ policy: getToolPolicySnapshot() });
  });

  app.post('/tools/assess', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as Record<string, unknown>;
    const toolName = String(body.toolName || '').trim();

    if (!toolName) {
      return reply.status(400).send({ error: 'toolName is required' });
    }

    const assessment = assessToolPolicy({
      toolName,
      actionType: body.actionType ? String(body.actionType) : undefined,
      command: body.command ? String(body.command) : undefined,
      targetPath: body.targetPath ? String(body.targetPath) : undefined,
      writeOperation: body.writeOperation === true,
      networkOperation: body.networkOperation === true,
    });

    const actionId = logGodFactoryAction(db, {
      action_type: 'tool_policy_assessment',
      target_id: toolName,
      target_type: 'tool_action',
      authority_invoked: 'tool_policy_gate',
      justification_tags: ['tool_policy', assessment.decision, assessment.normalized.actionType],
      result: `${assessment.decision}:${assessment.riskScore}`,
    });

    return reply.send({ action_id: actionId, assessment });
  });

  app.post('/tools/assess-batch', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as Record<string, unknown>;
    const actions = Array.isArray(body.actions) ? body.actions : [];

    if (actions.length === 0) {
      return reply.status(400).send({ error: 'actions[] is required' });
    }

    const assessments = actions.map((raw, index) => {
      const item = (raw ?? {}) as Record<string, unknown>;
      const toolName = String(item.toolName || '').trim();
      if (!toolName) {
        return {
          index,
          error: 'toolName is required',
        };
      }

      const assessment = assessToolPolicy({
        toolName,
        actionType: item.actionType ? String(item.actionType) : undefined,
        command: item.command ? String(item.command) : undefined,
        targetPath: item.targetPath ? String(item.targetPath) : undefined,
        writeOperation: item.writeOperation === true,
        networkOperation: item.networkOperation === true,
      });

      const actionId = logGodFactoryAction(db, {
        action_type: 'tool_policy_assessment',
        target_id: toolName,
        target_type: 'tool_action',
        authority_invoked: 'tool_policy_gate',
        justification_tags: ['tool_policy', assessment.decision, assessment.normalized.actionType],
        result: `${assessment.decision}:${assessment.riskScore}`,
      });

      return {
        index,
        action_id: actionId,
        assessment,
      };
    });

    return reply.send({ assessments });
  });

  app.post('/sessions/start', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as Record<string, unknown>;
    const sessionId = randomUUID();
    db.prepare(`
      INSERT INTO interactive_sessions
        (session_id, start_cycle, end_cycle, user_inputs, agent_responses, sub_agents_spawned, jobs_created, jobs_implemented, notifications_presented, timestamp)
      VALUES (?, ?, NULL, '[]', '[]', '[]', '[]', '[]', ?, datetime('now'))
    `).run(
      sessionId,
      String(body.start_cycle || Date.now()),
      JSON.stringify(Array.isArray(body.notifications_presented) ? body.notifications_presented : []),
    );

    return reply.status(201).send({ session_id: sessionId });
  });

  app.post('/sessions/:id/append', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    const exists = db.prepare('SELECT session_id FROM interactive_sessions WHERE session_id = ?').get(id) as { session_id?: string } | undefined;
    if (!exists) return reply.status(404).send({ error: 'Session not found' });

    if (body.user_input) appendInteractiveSessionField(db, id, 'user_inputs', body.user_input);
    if (body.agent_response) appendInteractiveSessionField(db, id, 'agent_responses', body.agent_response);
    if (body.sub_agent_spawned) appendInteractiveSessionField(db, id, 'sub_agents_spawned', body.sub_agent_spawned);
    if (body.job_created) appendInteractiveSessionField(db, id, 'jobs_created', body.job_created);
    if (body.job_implemented) appendInteractiveSessionField(db, id, 'jobs_implemented', body.job_implemented);
    if (body.notification_presented) appendInteractiveSessionField(db, id, 'notifications_presented', body.notification_presented);

    if (body.end_cycle) {
      db.prepare('UPDATE interactive_sessions SET end_cycle = ? WHERE session_id = ?').run(String(body.end_cycle), id);
    }

    return reply.send({ ok: true, session_id: id });
  });

  app.post('/brainstorm', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as Record<string, unknown>;
    const input = String(body.input || '').trim();
    if (!input) return reply.status(400).send({ error: 'input is required' });
    const scopedProjectId = resolveScopedProjectId(body.project_id ?? body.projectId);
    if ((body.project_id ?? body.projectId) !== undefined && !scopedProjectId) {
      return reply.status(400).send({ error: 'project_id must reference an existing project.' });
    }

    const brainstormId = randomUUID();
    const jobId = randomUUID();
    const title = input.split('\n')[0].slice(0, 140) || 'Brainstorm Request';

    const sandboxSpec = {
      sandbox_id: null,
      status: 'not_started',
      cycle_limit: 50,
      cycles_used: 0,
      test_results: [],
      human_review_required: false,
      human_review_completed: false,
    };

    db.prepare(`
      INSERT INTO brainstorm_records (brainstorm_id, user_input_raw, generated_job_id, processing_status, cycle_id, timestamp)
      VALUES (?, ?, ?, 'processed', ?, datetime('now'))
    `).run(brainstormId, input, jobId, null);

    db.prepare(`
      INSERT INTO job_records
        (id, job_id, project_id, job_category, source, source_record_ids, priority, title,
         affected_files, affected_devtags, affected_plantags, required_buildtags,
         blocking_jobs, blocked_by_jobs, hierarchy, atomic_steps, sandbox_spec,
         implementation_status, created_cycle, last_updated_cycle, timestamp, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))
    `).run(
      randomUUID(),
      jobId,
      scopedProjectId,
      'user_requested',
      'god_factory_agent',
      JSON.stringify([brainstormId]),
      'medium',
      title,
      '[]',
      '[]',
      '[]',
      '[]',
      '[]',
      '[]',
      JSON.stringify({ phase: 1, milestone: 'brainstorm', parent_job_id: null, child_job_ids: [] }),
      '[]',
      JSON.stringify(sandboxSpec),
      JOB_STATUS.SUGGESTED,
      0,
      0,
    );

    ensureNotification(db, {
      category: 'brainstorm_record',
      source_forensic_id: brainstormId,
      severity: 'info',
      summary_tags: ['brainstorm', 'job_created'],
      natural_language_summary: `Brainstorm captured and converted into Suggested Job ${jobId}.`,
    });

    try {
      runSuggestedJobsCrawlerTick(db);
    } catch (err: unknown) {
      recordLoopError(db, {
        phase: 'brainstorm_crawler_tick',
        runId: null,
        jobId,
        err,
        fatal: false,
      });
    }

    return reply.status(201).send({ brainstorm_id: brainstormId, generated_job_id: jobId });
  });

  // ── Gap Reports → Jobs Flush ────────────────────────────────────────────────
  // Manually triggers the gap-to-job pipeline: reads all unacknowledged
  // flagged gap_reports and converts them into job_records entries.
  // Also called automatically from refreshGodFactorySignals on every signal cycle.
  app.post('/gap-reports/flush-to-jobs', async (_req: FastifyRequest, reply: FastifyReply) => {
    const created = flushFlaggedGapReportsToJobs(db);
    return reply.status(200).send({
      jobs_created: created,
      message: created > 0
        ? `Flushed ${created} gap report(s) into job_records.`
        : 'No unacknowledged flagged gap reports found.',
    });
  });

  app.post('/external-jobs/reflect', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body || {}) as { projectId?: string | null; limit?: number };
    const created = reflectExternalProjectsToInternalJobs(db, {
      projectId: body.projectId ?? null,
      limit: body.limit,
    });

    return reply.status(200).send({
      jobs_created: created,
      message: created > 0
        ? `Created ${created} internal reflection job(s) from external_project records.`
        : 'No new external reflection jobs needed.',
    });
  });

  // GET /api/god-factory/signals
  // Forces a fresh signal synthesis pass and returns compact queue/suggestion summary.
  app.get('/signals', async (_req: FastifyRequest, reply: FastifyReply) => {
    refreshGodFactorySignals(db);

    const queueCounts = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN user_acknowledged = 0 THEN 1 ELSE 0 END) AS unacknowledged
      FROM notification_queue
    `).get() as { total?: number; unacknowledged?: number } | undefined;

    const suggestionCounts = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN user_response IS NULL THEN 1 ELSE 0 END) AS pending
      FROM idle_suggestions
    `).get() as { total?: number; pending?: number } | undefined;

    return reply.send({
      ok: true,
      refreshed_at: new Date().toISOString(),
      notifications: {
        total: queueCounts?.total ?? 0,
        unacknowledged: queueCounts?.unacknowledged ?? 0,
      },
      idle_suggestions: {
        total: suggestionCounts?.total ?? 0,
        pending: suggestionCounts?.pending ?? 0,
      },
    });
  });

  app.get('/auto-intel/settings', async (_req: FastifyRequest, reply: FastifyReply) => {
    const settings = loadAutoIntelSettings();
    const lastRunAt = getKv(db, AUTO_INTEL_LAST_RUN_KEY);
    const lastError = getKv(db, AUTO_INTEL_LAST_ERROR_KEY);
    return reply.send({
      settings,
      runtime: {
        last_run_at: lastRunAt || null,
        last_error: lastError || null,
      },
    });
  });

  app.post('/auto-intel/settings', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireControlOwner(reply)) return;
    const body = (req.body || {}) as Partial<AutoIntelSettings>;
    const settings = saveAutoIntelSettings(body);
    if (settings.enabled) {
      void runAutoIntelCycle('settings_update');
    }
    return reply.send({ ok: true, settings });
  });

  app.post('/auto-intel/run-once', async (_req: FastifyRequest, reply: FastifyReply) => {
    if (!requireControlOwner(reply)) return;
    const result = await runAutoIntelCycle('manual');
    return reply.send(result);
  });

  app.get('/auto-intel/status', async (_req: FastifyRequest, reply: FastifyReply) => {
    const lastRunAt = getKv(db, AUTO_INTEL_LAST_RUN_KEY);
    const lastError = getKv(db, AUTO_INTEL_LAST_ERROR_KEY);
    const lastResult = parseJson<Record<string, unknown> | null>(getKv(db, AUTO_INTEL_LAST_RESULT_KEY), null);
    const counters = loadAutoIntelCounters();
    return reply.send({
      settings: loadAutoIntelSettings(),
      runtime: {
        scheduler_active: !!_autoIntelTimer,
        tick_running: _autoIntelTickRunning,
        last_run_at: lastRunAt || null,
        last_error: lastError || null,
        last_result: lastResult,
        counters,
      },
    });
  });

  app.post('/actions', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as Record<string, unknown>;
    const actionId = logGodFactoryAction(db, {
      action_type: String(body.action_type || 'manual_action'),
      target_id: body.target_id ? String(body.target_id) : null,
      target_type: body.target_type ? String(body.target_type) : null,
      authority_invoked: body.authority_invoked ? String(body.authority_invoked) : null,
      justification_tags: Array.isArray(body.justification_tags) ? body.justification_tags.map(String) : [],
      result: String(body.result || 'recorded'),
      cycle_id: body.cycle_id ? String(body.cycle_id) : null,
    });
    return reply.status(201).send({ action_id: actionId });
  });

  // ── Implementation Pipeline Status ─────────────────────────────────────────
  // Returns staged pipeline progress for a job in 'implementing' status.
  // Includes Stages 1-6 from the spec: Pre-Implementation Scan, Backup,
  // Staged Rollout, Live Testing, Stability Check, Completion.

  app.get('/implementation-pipeline/:job_id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { job_id } = req.params as { job_id: string };

    const job = db.prepare(`
      SELECT job_id, title, implementation_status, job_category, priority, sandbox_spec, atomic_steps, affected_files, affected_devtags
      FROM job_records WHERE job_id = ?
    `).get(job_id) as Record<string, unknown> | undefined;

    if (!job) return reply.status(404).send({ error: 'Job not found' });

    // Read implementation log entries for this job, grouped by stage
    let logEntries: Array<Record<string, unknown>> = [];
    try {
      logEntries = db.prepare(`
        SELECT * FROM implementation_log WHERE job_id = ? ORDER BY timestamp ASC
      `).all(job_id) as typeof logEntries;
    } catch { /* table may not exist */ }

    // Crash recovery records
    let crashRecoveries: Array<Record<string, unknown>> = [];
    try {
      crashRecoveries = db.prepare(`
        SELECT * FROM crash_recovery_log WHERE job_id = ? ORDER BY timestamp DESC LIMIT 5
      `).all(job_id) as typeof crashRecoveries;
    } catch { /* not available */ }

    // Sandbox runs
    let sandboxRuns: Array<Record<string, unknown>> = [];
    try {
      sandboxRuns = db.prepare(`
        SELECT * FROM sandbox_runs WHERE job_id = ? ORDER BY cycle_number DESC LIMIT 10
      `).all(job_id) as typeof sandboxRuns;
    } catch { /* not available */ }

    // Map log entries to stage status
    const STAGES = [
      { stage: 1, name: 'Pre-Implementation Scan', key: 'pre_scan', description: 'Project State Crawler verifies ground truth snapshot matches sandbox state' },
      { stage: 2, name: 'Backup', key: 'backup', description: 'Version Control Agent creates rollback point tagged with job_id' },
      { stage: 3, name: 'Staged Rollout', key: 'staged_rollout', description: 'One atomic step at a time with full pre-edit protocol per step' },
      { stage: 4, name: 'Live Testing', key: 'live_testing', description: 'Full test suite against real IDE codebase including sandbox tests' },
      { stage: 5, name: 'Stability Check', key: 'stability_check', description: 'IDE monitored for 10 cycles; crash triggers auto rollback' },
      { stage: 6, name: 'Completion', key: 'completion', description: 'Job marked implemented; version commits tagged; plantags marked done' },
    ];

    const stageStatuses = STAGES.map(s => {
      const stageEntries = logEntries.filter(e => String(e.stage || '').toLowerCase().includes(s.key) || String(e.stage || '') === String(s.stage));
      const lastEntry = stageEntries[stageEntries.length - 1];
      const status = stageEntries.length === 0 ? 'pending'
        : lastEntry && String(lastEntry.validation_result || '') === 'pass' ? 'complete'
        : lastEntry && String(lastEntry.validation_result || '') === 'fail' ? 'failed'
        : 'in_progress';
      return {
        ...s,
        status,
        entries: stageEntries.length,
        last_entry_at: lastEntry?.timestamp ?? null,
        last_validation: lastEntry?.validation_result ?? null,
      };
    });

    const currentStage = stageStatuses.find(s => s.status === 'in_progress') ??
      stageStatuses.find(s => s.status === 'pending') ?? stageStatuses[stageStatuses.length - 1];

    return reply.send({
      job_id,
      title: String(job.title || ''),
      implementation_status: String(job.implementation_status || ''),
      current_stage: currentStage?.stage ?? null,
      stages: stageStatuses,
      log_entries: logEntries,
      crash_recoveries: crashRecoveries,
      sandbox_spec: parseJson<Record<string, unknown>>(job.sandbox_spec, {}),
      sandbox_runs: sandboxRuns,
    });
  });

  // ── Background Sub-Agent Cycle Tick ────────────────────────────────────────
  // Called by the scheduler to update per-sub-agent KV state.

  app.post('/background-sub-agents/:agent_key/tick', async (req: FastifyRequest, reply: FastifyReply) => {
    const { agent_key } = req.params as { agent_key: string };
    const VALID_KEYS = ['registry_monitor', 'idle_scanner', 'debt_monitor', 'model_monitor', 'gap_monitor', 'pattern_watch'];
    if (!VALID_KEYS.includes(agent_key)) return reply.status(400).send({ error: 'Invalid agent_key' });

    const body = req.body as Record<string, unknown>;
    const now = new Date().toISOString();
    const kvBase = `gf:${agent_key}`;

    setKv(db, `${kvBase}:last_cycle`, String(body.cycle_id || Date.now()));
    setKv(db, `${kvBase}:last_run_at`, now);
    setKv(db, `${kvBase}:status`, String(body.status || 'idle'));

    return reply.send({ ok: true, agent_key, recorded_at: now });
  });

  // ── God Factory Autonomous Loop ─────────────────────────────────────────────
  // The God Factory has its own 24/7 loop that continuously processes
  // suggested_jobs records — building IDE enhancements autonomously.
  //
  // The loop state is persisted in god_factory_loop_state (singleton row).
  // A single EnhancedAgentLoop is instantiated per start; stop() is idempotent.

  let _gfLoopInstance: { stop: () => void; isRunning: () => boolean } | null = null;

  function _ensureGfLoopState(db: Db) {
    const existing = db.prepare('SELECT id FROM god_factory_loop_state LIMIT 1').get();
    if (!existing) {
      db.prepare(`
        INSERT INTO god_factory_loop_state
          (id, state, jobs_completed, jobs_failed, jobs_skipped, started_at)
        VALUES ('singleton', 'idle', 0, 0, 0, NULL)
      `).run();
    }
  }

  function _updateGfLoopState(db: Db, patch: Record<string, unknown>) {
    if (Object.keys(patch).length === 0) return;
    const sets = Object.keys(patch).map(k => `${k} = ?`).join(', ');
    const vals = Object.values(patch);
    db.prepare(`UPDATE god_factory_loop_state SET ${sets} WHERE id = 'singleton'`).run(...vals);
  }

  function _recoverCrashedGfRuns(db: Db) {
    const running = db.prepare(`
      SELECT run_id, project_id
      FROM god_factory_runs
      WHERE status = '${RUN_STATUS.RUNNING}'
    `).all() as Array<{ run_id: string; project_id: string }>;

    if (!running.length) return;

    const tx = db.transaction(() => {
      const crashedProjectIds = [...new Set(running.map(r => r.project_id).filter(Boolean))];

      for (const r of running) {
        db.prepare(`
          UPDATE god_factory_runs
          SET status = '${RUN_STATUS.CRASHED}',
              stop_reason = '${STOP_REASON.CRASH_RECOVERY}',
              ended_at = datetime('now')
          WHERE run_id = ?
        `).run(r.run_id);
      }

      if (crashedProjectIds.length > 0) {
        const placeholders = crashedProjectIds.map(() => '?').join(', ');
        db.prepare(`
          UPDATE job_records
          SET implementation_status = '${JOB_STATUS.SUGGESTED}', timestamp = datetime('now')
          WHERE implementation_status = '${JOB_STATUS.IMPLEMENTING}'
            AND project_id IN (${placeholders})
        `).run(...crashedProjectIds);
      }

      _updateGfLoopState(db, {
        state: 'idle',
        current_job_id: null,
        current_run_id: null,
        last_active_at: null,
        stop_reason: STOP_REASON.RECOVERED,
      });
    });

    tx();
  }

  type CooldownProfileId = 'safe-exhaustive' | 'aggressive' | 'paced' | 'slow' | 'crawl';
  type CooldownProfile = {
    warningPct: number;
    criticalPct: number;
    cooldownSec: number;
    sleepSec: number;
    lowSuccessSkipCycles: number;
  };

  const COOLDOWN_PROFILES: Record<CooldownProfileId, CooldownProfile> = {
    'safe-exhaustive': { warningPct: 55, criticalPct: 85, cooldownSec: 1800, sleepSec: 7200, lowSuccessSkipCycles: 1 },
    aggressive: { warningPct: 45, criticalPct: 75, cooldownSec: 900, sleepSec: 3600, lowSuccessSkipCycles: 0 },
    paced: { warningPct: 60, criticalPct: 88, cooldownSec: 2400, sleepSec: 10_800, lowSuccessSkipCycles: 1 },
    slow: { warningPct: 70, criticalPct: 92, cooldownSec: 3600, sleepSec: 14_400, lowSuccessSkipCycles: 2 },
    crawl: { warningPct: 80, criticalPct: 95, cooldownSec: 5400, sleepSec: 21_600, lowSuccessSkipCycles: 3 },
  };

  function deriveCooldownCustomFromHorizon(horizonHours: number): Partial<CooldownProfile> {
    const h = Math.max(1, Math.min(7 * 24, Number(horizonHours || 24)));
    const horizonSec = h * 3600;

    // Stretch cooldown/sleep durations toward the desired exhaustion horizon.
    const cooldownSec = Math.max(300, Math.min(7 * 24 * 3600, Math.round(horizonSec * 0.08)));
    const sleepSec = Math.max(900, Math.min(7 * 24 * 3600, Math.round(horizonSec * 0.25)));

    // Longer horizons become more conservative sooner.
    const warningPct = Math.max(35, Math.min(88, Math.round(40 + h * 0.2)));
    const criticalPct = Math.max(65, Math.min(97, warningPct + 25));
    const lowSuccessSkipCycles = Math.max(0, Math.min(6, Math.round(h / 24)));

    return {
      warningPct,
      criticalPct,
      cooldownSec,
      sleepSec,
      lowSuccessSkipCycles,
    };
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

  function upsertCooldownOverride(modelId: string, overrideType: 'cooldown' | 'sleep' | 'skip', durationSec: number, skipCycles: number, reason: string) {
    const now = Date.now();
    const cooldownUntil = overrideType === 'cooldown' ? new Date(now + durationSec * 1000).toISOString() : null;
    const sleepUntil = overrideType === 'sleep' ? new Date(now + durationSec * 1000).toISOString() : null;
    const skipNextCycles = overrideType === 'skip' ? Math.max(1, skipCycles) : 0;

    db.prepare(`
      INSERT INTO model_cooldown_overrides (id, model_id, override_type, cooldown_until, skip_next_cycles, sleep_until, injected_by, reason, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'god_factory', ?, 1, datetime('now'), datetime('now'))
      ON CONFLICT(model_id) DO UPDATE SET
        override_type = excluded.override_type,
        cooldown_until = excluded.cooldown_until,
        skip_next_cycles = excluded.skip_next_cycles,
        sleep_until = excluded.sleep_until,
        reason = excluded.reason,
        active = 1,
        updated_at = datetime('now')
    `).run(randomUUID(), modelId, overrideType, cooldownUntil, skipNextCycles, sleepUntil, reason);
  }

  function applyCooldownProfile(profileId: CooldownProfileId, custom?: Partial<CooldownProfile>) {
    const base = COOLDOWN_PROFILES[profileId] || COOLDOWN_PROFILES['safe-exhaustive'];
    const profile: CooldownProfile = {
      warningPct: custom?.warningPct ?? base.warningPct,
      criticalPct: custom?.criticalPct ?? base.criticalPct,
      cooldownSec: custom?.cooldownSec ?? base.cooldownSec,
      sleepSec: custom?.sleepSec ?? base.sleepSec,
      lowSuccessSkipCycles: custom?.lowSuccessSkipCycles ?? base.lowSuccessSkipCycles,
    };

    const cutoff = new Date(Date.now() - 3600 * 1000).toISOString();
    const usageRows = db.prepare(`
      SELECT COALESCE(attributed_source, model) AS model_id, COUNT(*) AS cnt
      FROM blame_records
      WHERE created_at >= ?
      GROUP BY COALESCE(attributed_source, model)
    `).all(cutoff) as Array<{ model_id: string; cnt: number }>;
    const usage = new Map<string, number>(usageRows.map(r => [r.model_id, r.cnt]));

    const registryRows = db.prepare(`
      SELECT model_id, success_rate, total_runs
      FROM model_registry
      ORDER BY total_runs DESC
      LIMIT 200
    `).all() as Array<{ model_id: string; success_rate: number; total_runs: number }>;

    let applied = 0;
    let cleared = 0;

    for (const row of registryRows) {
      const modelId = String(row.model_id || '').trim();
      if (!modelId) continue;
      const limit = Math.max(1, chooseRateLimitEstimate(modelId));
      const count = usage.get(modelId) ?? 0;
      const usagePct = Math.min(100, Math.round((count / limit) * 100));

      if (usagePct >= profile.criticalPct) {
        upsertCooldownOverride(modelId, 'sleep', profile.sleepSec, 0, `cooldown-profile:${profileId}:critical:${usagePct}%`);
        applied++;
        continue;
      }

      if (usagePct >= profile.warningPct) {
        upsertCooldownOverride(modelId, 'cooldown', profile.cooldownSec, 0, `cooldown-profile:${profileId}:warning:${usagePct}%`);
        applied++;
        continue;
      }

      if (profile.lowSuccessSkipCycles > 0 && (row.total_runs || 0) >= 5 && (row.success_rate || 0) < 0.45) {
        upsertCooldownOverride(modelId, 'skip', 0, profile.lowSuccessSkipCycles, `cooldown-profile:${profileId}:low-success`);
        applied++;
        continue;
      }

      const clearResult = db.prepare(`
        UPDATE model_cooldown_overrides
        SET active = 0, updated_at = datetime('now')
        WHERE model_id = ? AND active = 1
      `).run(modelId);
      if ((clearResult.changes || 0) > 0) cleared += clearResult.changes || 0;
    }

    return { profileId, profile, applied, cleared, examined: registryRows.length };
  }

  app.get('/loop/cooldown-profiles', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      profiles: COOLDOWN_PROFILES,
      activeProfile: getKv(db, 'god_factory:loop:last_cooldown_profile') || 'safe-exhaustive',
      autoApply: getKv(db, 'god_factory:loop:last_auto_cooldown_profile') === '1',
      horizonHours: Number(getKv(db, 'god_factory:loop:last_cooldown_horizon_hours') || '24') || 24,
    });
  });

  app.post('/loop/cooldown-profile/apply', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireControlOwner(reply)) return;
    const body = (req.body || {}) as { profile?: CooldownProfileId; custom?: Partial<CooldownProfile>; autoApply?: boolean; horizonHours?: number };
    const profileId = (body.profile || 'safe-exhaustive') as CooldownProfileId;
    if (!COOLDOWN_PROFILES[profileId]) {
      return reply.status(400).send({ error: 'Unknown cooldown profile.' });
    }
    const horizonHours = Number.isFinite(Number(body.horizonHours))
      ? Math.max(1, Math.min(7 * 24, Number(body.horizonHours)))
      : Number(getKv(db, 'god_factory:loop:last_cooldown_horizon_hours') || '24') || 24;
    const horizonCustom = deriveCooldownCustomFromHorizon(horizonHours);
    const result = applyCooldownProfile(profileId, { ...horizonCustom, ...(body.custom || {}) });
    setKv(db, 'god_factory:loop:last_cooldown_profile', profileId);
    setKv(db, 'god_factory:loop:last_cooldown_horizon_hours', String(horizonHours));
    if (body.autoApply !== undefined) {
      setKv(db, 'god_factory:loop:last_auto_cooldown_profile', body.autoApply ? '1' : '0');
    }
    return reply.send({ ok: true, horizonHours, ...result });
  });

  _ensureGfLoopState(db);
  _recoverCrashedGfRuns(db);
  startAutoIntelScheduler();

  app.addHook('onClose', async () => {
    if (_autoIntelTimer) {
      clearInterval(_autoIntelTimer);
      _autoIntelTimer = null;
    }
  });

  // POST /api/god-factory/loop/start
  // Body: { projectId, model?, candidateChain?, maxIterations?, jobMaxIterations?, autoApproveChanges?, autoAnswerQuestions?, checkpointEvery?, cooldownProfile?, autoCooldownProfile?, cooldownHorizonHours? }
  app.post('/loop/start', async (req: FastifyRequest, reply: FastifyReply) => {
    const internalSchedulerCall = isInternalSchedulerCall(req);
    if (!internalSchedulerCall && !requireControlOwner(reply)) return;

    _ensureGfLoopState(db);
    const state = db.prepare('SELECT state FROM god_factory_loop_state WHERE id = \'singleton\'').get() as { state: string } | undefined;
    if (state?.state === 'running') {
      return reply.status(409).send({ error: 'God Factory loop is already running' });
    }

    const { projectId, model, candidateChain, maxIterations = 50, jobMaxIterations, autoApproveChanges, autoAnswerQuestions, checkpointEvery, cooldownProfile, autoCooldownProfile, cooldownHorizonHours } = req.body as {
      projectId?: string;
      model?: string;
      candidateChain?: string[];
      maxIterations?: number;
      jobMaxIterations?: number;
      autoApproveChanges?: boolean;
      autoAnswerQuestions?: boolean;
      checkpointEvery?: number;
      cooldownProfile?: CooldownProfileId;
      autoCooldownProfile?: boolean;
      cooldownHorizonHours?: number;
    };

    const normalizedProjectId = String(projectId || '').trim();
    if (!normalizedProjectId) {
      return reply.status(400).send({ error: 'projectId is required for scoped loop execution.' });
    }

    const requestedModel = String(model || '').trim();

    const parsedMaxIterations = Number(maxIterations);
    if (!Number.isFinite(parsedMaxIterations) || !Number.isInteger(parsedMaxIterations) || parsedMaxIterations < -1 || parsedMaxIterations > 100000) {
      return reply.status(400).send({ error: 'maxIterations must be an integer between -1 and 100000 (-1 = unlimited).' });
    }
    const isUnlimitedIterations = parsedMaxIterations <= 0;

    if (autoApproveChanges !== undefined && typeof autoApproveChanges !== 'boolean') {
      return reply.status(400).send({ error: 'autoApproveChanges must be a boolean when provided.' });
    }
    if (autoAnswerQuestions !== undefined && typeof autoAnswerQuestions !== 'boolean') {
      return reply.status(400).send({ error: 'autoAnswerQuestions must be a boolean when provided.' });
    }

    const parsedCheckpointEvery = checkpointEvery === undefined ? 5 : Number(checkpointEvery);
    if (!Number.isFinite(parsedCheckpointEvery) || !Number.isInteger(parsedCheckpointEvery) || parsedCheckpointEvery < 1 || parsedCheckpointEvery > 10) {
      return reply.status(400).send({ error: 'checkpointEvery must be an integer between 1 and 10.' });
    }

    const parsedJobMaxIterations = jobMaxIterations === undefined
      ? Number(getKv(db, 'god_factory:loop:last_job_max_iterations') || '50') || 50
      : Number(jobMaxIterations);
    if (!Number.isFinite(parsedJobMaxIterations) || !Number.isInteger(parsedJobMaxIterations) || parsedJobMaxIterations < 1 || parsedJobMaxIterations > 5000) {
      return reply.status(400).send({ error: 'jobMaxIterations must be an integer between 1 and 5000.' });
    }

    const selectedCooldownProfile = (cooldownProfile || (getKv(db, 'god_factory:loop:last_cooldown_profile') as CooldownProfileId) || 'safe-exhaustive') as CooldownProfileId;
    if (!COOLDOWN_PROFILES[selectedCooldownProfile]) {
      return reply.status(400).send({ error: 'Invalid cooldownProfile.' });
    }
    const autoCooldownEnabled = autoCooldownProfile ?? (getKv(db, 'god_factory:loop:last_auto_cooldown_profile') === '1');
    const selectedCooldownHorizonHours = Number.isFinite(Number(cooldownHorizonHours))
      ? Math.max(1, Math.min(7 * 24, Number(cooldownHorizonHours)))
      : Number(getKv(db, 'god_factory:loop:last_cooldown_horizon_hours') || '24') || 24;

    const requestedCandidateChain = Array.isArray(candidateChain)
      ? candidateChain
        .map((value) => String(value || '').trim())
        .filter((value) => value.includes('/'))
      : [];

    const preferredModel = requestedModel && requestedModel.includes('/') ? requestedModel : undefined;
    const strategyAtStart = resolveModelStrategy(db, preferredModel);
    const strategyCandidates = [strategyAtStart.primaryModel, ...strategyAtStart.fallbackModels].filter((m) => {
      const provider = extractProviderFromModelId(m) as ProviderType;
      return !!getProviderClient(db, provider);
    });

    const configuredCandidates = (requestedCandidateChain.length > 0 ? requestedCandidateChain : strategyCandidates).filter((m, index, arr) => {
      if (arr.indexOf(m) !== index) return false;
      const provider = extractProviderFromModelId(m) as ProviderType;
      return !!getProviderClient(db, provider);
    });

    if (configuredCandidates.length === 0) {
      return reply.status(400).send({ error: 'No configured models available in the current strategy chain.' });
    }
    const normalizedModel = configuredCandidates[0];
    const runCandidateChain = configuredCandidates;

    const normalizedAutoApproveChanges = autoApproveChanges ?? false;
    const normalizedAutoAnswerQuestions = autoAnswerQuestions ?? false;
    const jobLoopMaxIterations = parsedJobMaxIterations;

    if (isUnlimitedIterations && autoCooldownEnabled) {
      applyCooldownProfile(selectedCooldownProfile, deriveCooldownCustomFromHorizon(selectedCooldownHorizonHours));
    }

    // Pick the best available suggested job to work on
    function claimNextJob(projectId: string): { job_id: string; title: string; atomic_steps_raw: string; affected_files_raw: string } | null {
      const job = db.prepare(`
        UPDATE job_records
        SET implementation_status = '${JOB_STATUS.IMPLEMENTING}', timestamp = datetime('now')
        WHERE id = (
          SELECT id
          FROM job_records
          WHERE implementation_status = '${JOB_STATUS.SUGGESTED}'
            AND project_id = ?
          ORDER BY
            CASE priority
              WHEN 'critical' THEN 4
              WHEN 'high' THEN 3
              WHEN 'medium' THEN 2
              WHEN 'low' THEN 1
              ELSE 0
            END DESC,
            created_at ASC
          LIMIT 1
        )
        AND implementation_status = '${JOB_STATUS.SUGGESTED}'
        AND project_id = ?
        RETURNING job_id, title, atomic_steps AS atomic_steps_raw, affected_files AS affected_files_raw
      `).get(projectId, projectId) as { job_id: string; title: string; atomic_steps_raw: string | null; affected_files_raw: string | null } | undefined;

      if (!job) return null;
      return {
        job_id: job.job_id,
        title: job.title,
        atomic_steps_raw: job.atomic_steps_raw || '[]',
        affected_files_raw: job.affected_files_raw || '[]',
      };
    }

    const runId = randomUUID();
    setKv(db, 'god_factory:loop:last_model', normalizedModel);
    setKv(db, 'god_factory:loop:last_candidate_chain', JSON.stringify(runCandidateChain));
    setKv(db, 'god_factory:loop:last_project_id', normalizedProjectId);
    setKv(db, 'god_factory:loop:last_max_iterations', String(isUnlimitedIterations ? 0 : parsedMaxIterations));
    setKv(db, 'god_factory:loop:last_auto_approve_changes', normalizedAutoApproveChanges ? '1' : '0');
    setKv(db, 'god_factory:loop:last_auto_answer_questions', normalizedAutoAnswerQuestions ? '1' : '0');
    setKv(db, 'god_factory:loop:last_checkpoint_every', String(parsedCheckpointEvery));
    setKv(db, 'god_factory:loop:last_job_max_iterations', String(jobLoopMaxIterations));
    setKv(db, 'god_factory:loop:last_cooldown_profile', selectedCooldownProfile);
    setKv(db, 'god_factory:loop:last_auto_cooldown_profile', autoCooldownEnabled ? '1' : '0');
    setKv(db, 'god_factory:loop:last_cooldown_horizon_hours', String(selectedCooldownHorizonHours));

    _updateGfLoopState(db, {
      state: 'running',
      current_run_id: runId,
      started_at: new Date().toISOString(),
      last_active_at: new Date().toISOString(),
      jobs_completed: 0,
      jobs_failed: 0,
      stop_reason: null,
      last_error_code: null,
      last_error_summary: null,
      last_error_at: null,
    });

    db.prepare(`
      INSERT INTO god_factory_runs (
        run_id, project_id, model_id, max_iterations, iteration_count,
        jobs_completed, jobs_failed, status, stop_reason, started_at, last_active_at,
        auto_approve_changes, auto_answer_questions, checkpoint_every
      ) VALUES (?, ?, ?, ?, 0, 0, 0, '${RUN_STATUS.RUNNING}', NULL, datetime('now'), datetime('now'), ?, ?, ?)
    `).run(
      runId,
      normalizedProjectId,
      normalizedModel,
      parsedMaxIterations,
      normalizedAutoApproveChanges ? 1 : 0,
      normalizedAutoAnswerQuestions ? 1 : 0,
      parsedCheckpointEvery,
    );

    // Lazy-import to avoid circular deps at module load time
    let stopped = false;
    let iterationCount = 0;

    const tick = async () => {
      if (stopped || (!isUnlimitedIterations && iterationCount >= parsedMaxIterations)) {
        stopped = true;
        db.prepare(`
          UPDATE god_factory_runs
          SET status = '${RUN_STATUS.COMPLETED}',
              stop_reason = ?,
              iteration_count = ?,
              ended_at = datetime('now'),
              last_active_at = datetime('now')
          WHERE run_id = ?
        `).run((!isUnlimitedIterations && iterationCount >= parsedMaxIterations) ? STOP_REASON.MAX_ITERATIONS : STOP_REASON.MANUAL, iterationCount, runId);
        _updateGfLoopState(db, {
          state: 'idle',
          current_job_id: null,
          current_run_id: null,
          last_active_at: null,
          stop_reason: (!isUnlimitedIterations && iterationCount >= parsedMaxIterations) ? STOP_REASON.MAX_ITERATIONS : STOP_REASON.MANUAL,
        });
        _gfLoopInstance = null;
        return;
      }

      if (autoCooldownEnabled && iterationCount > 0 && iterationCount % 5 === 0) {
        applyCooldownProfile(selectedCooldownProfile);
      }

      const job = claimNextJob(normalizedProjectId);
      if (!job) {
        db.prepare(`
          UPDATE god_factory_runs
          SET status = '${RUN_STATUS.COMPLETED}',
              stop_reason = '${STOP_REASON.QUEUE_EMPTY}',
              iteration_count = ?,
              ended_at = datetime('now'),
              last_active_at = datetime('now')
          WHERE run_id = ?
        `).run(iterationCount, runId);
        _updateGfLoopState(db, {
          state: 'idle',
          current_job_id: null,
          current_run_id: null,
          last_active_at: null,
          stop_reason: STOP_REASON.QUEUE_EMPTY,
        });
        stopped = true;
        _gfLoopInstance = null;
        return;
      }

      _updateGfLoopState(db, { current_job_id: job.job_id, last_active_at: new Date().toISOString() });

      const stepsResult = safeParseJobPayload(job.atomic_steps_raw, 'atomic_steps', []);
      const filesResult = safeParseJobPayload(job.affected_files_raw, 'affected_files', []);

      if (!stepsResult.success || !filesResult.success) {
        const errorDetail = [stepsResult.error, filesResult.error].filter(Boolean).join('; ');
        db.prepare(`UPDATE job_records SET implementation_status = '${JOB_STATUS.REJECTED}', timestamp = datetime('now') WHERE job_id = ?`).run(job.job_id);
        db.prepare(`UPDATE god_factory_loop_state SET jobs_failed = jobs_failed + 1 WHERE id = 'singleton'`).run();
        db.prepare(`
          UPDATE god_factory_runs
          SET jobs_failed = jobs_failed + 1,
              iteration_count = ?,
              last_active_at = datetime('now')
          WHERE run_id = ?
        `).run(iterationCount + 1, runId);
        recordLoopError(db, {
          phase: 'job_payload_parse',
          runId,
          jobId: job.job_id,
          err: new Error(errorDetail),
          fatal: false,
        });
        iterationCount++;
        if (!stopped) {
          setTimeout(() => { tick().catch(() => {}); }, 2_000);
        }
        return;
      }

      const atomicSteps = stepsResult.data || [];
      const affectedFiles = filesResult.data || [];

      // Build task prompt from job details
      const stepsText = Array.isArray(atomicSteps)
        ? (atomicSteps as string[]).map((s, i) => `${i + 1}. ${s}`).join('\n')
        : String(atomicSteps);
      const filesText = Array.isArray(affectedFiles)
        ? (affectedFiles as string[]).slice(0, 10).join(', ')
        : String(affectedFiles);

      const taskPrompt = [
        `## God Factory Job: ${job.title}`,
        '',
        'You are implementing a specific IDE enhancement. Complete ALL steps below before stopping.',
        'Write real, working code. Do not leave TODOs.',
        '',
        '### Steps to implement:',
        stepsText,
        filesText ? `\n### Affected files:\n${filesText}` : '',
      ].filter(Boolean).join('\n');

      try {
        // Dynamically import to avoid loading agent runtime at route registration time
        const { EnhancedAgentLoop } = await import('../services/agent/enhancedLoop.js');
        const { appConfig } = await import('../config.js');
        const { getModel, extractProviderFromModelId } = await import('@personal-ide/shared');

        const chain = runCandidateChain;
        const chosenModel = chain.find((modelId) => {
          const canUse = getProviderClient(db, extractProviderFromModelId(modelId) as ProviderType);
          if (!canUse) return false;
          return true;
        }) || normalizedModel;
        const provider = extractProviderFromModelId(chosenModel) as any;
        const loopConfig = {
          maxIterations: jobLoopMaxIterations, // per job
          stepDelayMs: appConfig.agent.stepDelayMs,
          maxTokensPerStep: appConfig.agent.maxTokensPerStep,
          autoApproveChanges: normalizedAutoApproveChanges,
          autoAnswerQuestions: normalizedAutoAnswerQuestions,
          model: chosenModel,
          fallbackModels: chain.filter((m) => m !== chosenModel),
          projectRoot: (db.prepare('SELECT root_path FROM projects WHERE id = ?').get(normalizedProjectId) as { root_path?: string } | undefined)?.root_path ?? process.cwd(),
          continuousMode: false,
          cooldownMs: 2000,
          bypassRateLimits: false,
          enableSmartChunking: true,
          provider,
          contextWindow: getModel(chosenModel)?.maxInputTokens || appConfig.contextDefaults.unknownModelContext,
          checkpointEvery: parsedCheckpointEvery,
          autoFixErrors: true,
          autoRunTests: true,
          analyzeCodebase: false, // skip scan on GF jobs — already has context
        };

        const loop = new EnhancedAgentLoop(db, loopConfig);

        _gfLoopInstance = {
          stop: () => loop.stop(),
          isRunning: () => {
            const s = loop.getStatus().state;
            return s !== 'idle' && s !== 'complete' && s !== 'error';
          },
        };

        await loop.start(normalizedProjectId || 'god-factory', taskPrompt);

        // K: Analysis output contract (Cluster 5 finding K).
        // If the loop ran to completion without changing any files, this is a
        // traceable failed_no_output event — not a silent success. Token budget
        // exhaustion without artifacts must be recorded so the operator can investigate.
        const loopStatus = loop.getStatus();
        if ((loopStatus as any).totalFilesChanged === 0) {
          logGodFactoryAction(db, {
            action_type: 'job_no_output',
            target_id: job.job_id,
            target_type: 'job',
            authority_invoked: 'god_factory_loop',
            justification_tags: ['failed_no_output', 'zero_files_changed', 'analysis_contract_k'],
            result: JSON.stringify({
              status: 'failed_no_output',
              reason: 'Loop completed without any file changes',
              iterations: (loopStatus as any).currentIteration ?? 0,
              totalTokensUsed: (loopStatus as any).totalTokensUsed ?? 0,
            }),
            cycle_id: runId,
          });
        }

        // Mark complete if no errors thrown
        db.prepare(`UPDATE job_records SET implementation_status = '${JOB_STATUS.IMPLEMENTED}', timestamp = datetime('now') WHERE job_id = ?`).run(job.job_id);
        db.prepare(`UPDATE god_factory_loop_state SET jobs_completed = jobs_completed + 1 WHERE id = 'singleton'`).run();
        db.prepare(`
          UPDATE god_factory_runs
          SET jobs_completed = jobs_completed + 1,
              iteration_count = ?,
              last_active_at = datetime('now')
          WHERE run_id = ?
        `).run(iterationCount + 1, runId);
      } catch (err: unknown) {
        db.prepare(`UPDATE job_records SET implementation_status = '${JOB_STATUS.REJECTED}', timestamp = datetime('now') WHERE job_id = ?`).run(job.job_id);
        db.prepare(`UPDATE god_factory_loop_state SET jobs_failed = jobs_failed + 1 WHERE id = 'singleton'`).run();
        db.prepare(`
          UPDATE god_factory_runs
          SET jobs_failed = jobs_failed + 1,
              iteration_count = ?,
              last_active_at = datetime('now')
          WHERE run_id = ?
        `).run(iterationCount + 1, runId);
        recordLoopError(db, {
          phase: 'job_execution',
          runId,
          jobId: job.job_id,
          err,
          fatal: false,
        });
      }

      iterationCount++;
      _gfLoopInstance = null;

      // Brief pause between jobs, then process next
      if (!stopped) {
        setTimeout(() => {
          tick().catch((err: unknown) => {
            recordLoopError(db, {
              phase: 'tick_schedule',
              runId,
              err,
              fatal: true,
            });
            stopped = true;
            _gfLoopInstance = null;
            db.prepare(`
              UPDATE god_factory_runs
              SET status = '${RUN_STATUS.ERROR}',
                  stop_reason = '${STOP_REASON.ERROR}',
                  iteration_count = ?,
                  ended_at = datetime('now'),
                  last_active_at = datetime('now')
              WHERE run_id = ?
            `).run(iterationCount, runId);
            _updateGfLoopState(db, {
              state: 'idle',
              current_job_id: null,
              current_run_id: null,
              last_active_at: null,
              stop_reason: STOP_REASON.ERROR,
            });
          });
        }, 2_000);
      }
    };

    _gfLoopInstance = {
      stop: () => { stopped = true; },
      isRunning: () => !stopped,
    };

    // Start async — don't await
    tick().catch((err: unknown) => {
      recordLoopError(db, {
        phase: 'loop_start',
        runId,
        err,
        fatal: true,
      });
      db.prepare(`
        UPDATE god_factory_runs
        SET status = '${RUN_STATUS.ERROR}',
            stop_reason = '${STOP_REASON.ERROR}',
            iteration_count = ?,
            ended_at = datetime('now'),
            last_active_at = datetime('now')
        WHERE run_id = ?
      `).run(iterationCount, runId);
      _updateGfLoopState(db, {
        state: 'idle',
        current_job_id: null,
        current_run_id: null,
        last_active_at: null,
        stop_reason: STOP_REASON.ERROR,
      });
    });

    return reply.send({ ok: true, runId, message: 'God Factory loop started' });
  });

  // POST /api/god-factory/loop/stop
  app.post('/loop/stop', async (_req: FastifyRequest, reply: FastifyReply) => {
    if (!requireControlOwner(reply)) return;

    _ensureGfLoopState(db);
    const state = db.prepare('SELECT current_run_id FROM god_factory_loop_state WHERE id = ?').get('singleton') as { current_run_id?: string } | undefined;
    const activeRun = state?.current_run_id
      ? db.prepare('SELECT project_id FROM god_factory_runs WHERE run_id = ?').get(state.current_run_id) as { project_id?: string } | undefined
      : undefined;

    const restored = activeRun?.project_id
      ? db.prepare(`
          UPDATE job_records
          SET implementation_status = '${JOB_STATUS.SUGGESTED}', timestamp = datetime('now')
          WHERE implementation_status = '${JOB_STATUS.IMPLEMENTING}'
            AND project_id = ?
        `).run(activeRun.project_id)
      : { changes: 0 };

    if (_gfLoopInstance) {
      _gfLoopInstance.stop();
      _gfLoopInstance = null;
    }
    if (state?.current_run_id) {
      db.prepare(`
        UPDATE god_factory_runs
        SET status = '${RUN_STATUS.STOPPED}',
            stop_reason = '${STOP_REASON.MANUAL}',
            ended_at = datetime('now'),
            last_active_at = datetime('now')
        WHERE run_id = ?
      `).run(state.current_run_id);
    }
    _updateGfLoopState(db, {
      state: 'idle',
      current_job_id: null,
      current_run_id: null,
      last_active_at: null,
      stop_reason: STOP_REASON.MANUAL,
    });
    return reply.send({ ok: true, message: 'God Factory loop stopped', restored_jobs: restored.changes });
  });

  // GET /api/god-factory/loop/status
  app.get('/loop/status', async (_req: FastifyRequest, reply: FastifyReply) => {
    _ensureGfLoopState(db);
    const row = db.prepare('SELECT * FROM god_factory_loop_state WHERE id = \'singleton\'').get() as Record<string, unknown> | undefined;

    const config = {
      last_model: getKv(db, 'god_factory:loop:last_model') ?? null,
      last_project_id: getKv(db, 'god_factory:loop:last_project_id') ?? null,
      last_max_iterations: (() => {
        const raw = getKv(db, 'god_factory:loop:last_max_iterations');
        if (raw === null || raw === undefined || raw === '') return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
      })(),
      cooldown_profile: getKv(db, 'god_factory:loop:last_cooldown_profile') || 'safe-exhaustive',
      auto_cooldown_profile: getKv(db, 'god_factory:loop:last_auto_cooldown_profile') === '1',
      cooldown_horizon_hours: Number(getKv(db, 'god_factory:loop:last_cooldown_horizon_hours') || '24') || 24,
      governance: {
        autoApproveChanges: getKv(db, 'god_factory:loop:last_auto_approve_changes') === '1',
        autoAnswerQuestions: getKv(db, 'god_factory:loop:last_auto_answer_questions') === '1',
        checkpointEvery: Number(getKv(db, 'god_factory:loop:last_checkpoint_every') ?? '5') || 5,
        jobMaxIterations: Number(getKv(db, 'god_factory:loop:last_job_max_iterations') ?? '10') || 10,
        mode: getKv(db, 'god_factory:loop:last_auto_approve_changes') === '1'
          ? 'unsafe_override'
          : 'safe',
      },
      auto_intel: {
        settings: loadAutoIntelSettings(),
        last_run_at: getKv(db, AUTO_INTEL_LAST_RUN_KEY) || null,
        last_error: getKv(db, AUTO_INTEL_LAST_ERROR_KEY) || null,
      },
    };

    const scopedProjectId = String(row?.current_run_id ? '' : (config.last_project_id ?? ''));

    const activeRun = db.prepare(`
      SELECT run_id, project_id, model_id, max_iterations, iteration_count, jobs_completed, jobs_failed, status, stop_reason, started_at, last_active_at, ended_at,
             auto_approve_changes, auto_answer_questions, checkpoint_every
      FROM god_factory_runs
      WHERE run_id = ?
      LIMIT 1
    `).get((row?.current_run_id as string) || '') as Record<string, unknown> | undefined;

    const statusProjectId = String(activeRun?.project_id || scopedProjectId || '').trim();
    const pendingCount = statusProjectId
      ? (db.prepare(`SELECT COUNT(*) AS c FROM job_records WHERE implementation_status = '${JOB_STATUS.SUGGESTED}' AND project_id = ?`).get(statusProjectId) as { c: number }).c
      : (db.prepare(`SELECT COUNT(*) AS c FROM job_records WHERE implementation_status = '${JOB_STATUS.SUGGESTED}'`).get() as { c: number }).c;
    const inProgressCount = statusProjectId
      ? (db.prepare(`SELECT COUNT(*) AS c FROM job_records WHERE implementation_status = '${JOB_STATUS.IMPLEMENTING}' AND project_id = ?`).get(statusProjectId) as { c: number }).c
      : (db.prepare(`SELECT COUNT(*) AS c FROM job_records WHERE implementation_status = '${JOB_STATUS.IMPLEMENTING}'`).get() as { c: number }).c;

    let currentJob: unknown = null;
    if (row?.current_job_id) {
      currentJob = db.prepare('SELECT job_id, title, priority, project_id FROM job_records WHERE job_id = ?').get(row.current_job_id as string);
    }

    return reply.send({
      ...row,
      isRunning: _gfLoopInstance?.isRunning() ?? false,
      pendingJobs: pendingCount,
      inProgressJobs: inProgressCount,
      currentJob,
      config,
      activeRun: activeRun ?? null,
    });
  });
}
