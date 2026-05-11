import { randomUUID } from 'crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { runSuggestedJobsCrawlerTick } from '../services/suggestedJobsCrawler/index.js';
import { assessToolPolicy, getToolPolicySnapshot } from '../services/godFactory/toolGatekeeper.js';
import { getSubsystemRuntimeStatus, startSubsystemScheduler, stopSubsystemScheduler } from '../services/subsystemScheduler.js';
import { getKv, loadSettings, setKv, type SubsystemId } from './subsystems.js';
import { JOB_STATUS, RUN_STATUS, STOP_REASON } from '../services/lifecycle/stateMachine.js';

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

  _ensureGfLoopState(db);
  _recoverCrashedGfRuns(db);

  // POST /api/god-factory/loop/start
  // Body: { projectId, model?, maxIterations?, autoApproveChanges?, autoAnswerQuestions?, checkpointEvery? }
  app.post('/loop/start', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireControlOwner(reply)) return;

    _ensureGfLoopState(db);
    const state = db.prepare('SELECT state FROM god_factory_loop_state WHERE id = \'singleton\'').get() as { state: string } | undefined;
    if (state?.state === 'running') {
      return reply.status(409).send({ error: 'God Factory loop is already running' });
    }

    const { projectId, model, maxIterations = 50, autoApproveChanges, autoAnswerQuestions, checkpointEvery } = req.body as {
      projectId?: string;
      model?: string;
      maxIterations?: number;
      autoApproveChanges?: boolean;
      autoAnswerQuestions?: boolean;
      checkpointEvery?: number;
    };

    const normalizedProjectId = String(projectId || '').trim();
    if (!normalizedProjectId) {
      return reply.status(400).send({ error: 'projectId is required for scoped loop execution.' });
    }

    const normalizedModel = String(model || '').trim();
    if (!normalizedModel || !normalizedModel.includes('/')) {
      return reply.status(400).send({ error: 'model is required and must be in provider/model format.' });
    }

    const parsedMaxIterations = Number(maxIterations);
    if (!Number.isFinite(parsedMaxIterations) || !Number.isInteger(parsedMaxIterations) || parsedMaxIterations < 1 || parsedMaxIterations > 500) {
      return reply.status(400).send({ error: 'maxIterations must be an integer between 1 and 500.' });
    }

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

    const normalizedAutoApproveChanges = autoApproveChanges ?? false;
    const normalizedAutoAnswerQuestions = autoAnswerQuestions ?? false;
    const jobLoopMaxIterations = 10;

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
    setKv(db, 'god_factory:loop:last_project_id', normalizedProjectId);
    setKv(db, 'god_factory:loop:last_max_iterations', String(parsedMaxIterations));
    setKv(db, 'god_factory:loop:last_auto_approve_changes', normalizedAutoApproveChanges ? '1' : '0');
    setKv(db, 'god_factory:loop:last_auto_answer_questions', normalizedAutoAnswerQuestions ? '1' : '0');
    setKv(db, 'god_factory:loop:last_checkpoint_every', String(parsedCheckpointEvery));
    setKv(db, 'god_factory:loop:last_job_max_iterations', String(jobLoopMaxIterations));

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
      if (stopped || iterationCount >= parsedMaxIterations) {
        stopped = true;
        db.prepare(`
          UPDATE god_factory_runs
          SET status = '${RUN_STATUS.COMPLETED}',
              stop_reason = ?,
              iteration_count = ?,
              ended_at = datetime('now'),
              last_active_at = datetime('now')
          WHERE run_id = ?
        `).run(iterationCount >= parsedMaxIterations ? STOP_REASON.MAX_ITERATIONS : STOP_REASON.MANUAL, iterationCount, runId);
        _updateGfLoopState(db, {
          state: 'idle',
          current_job_id: null,
          current_run_id: null,
          last_active_at: null,
          stop_reason: iterationCount >= parsedMaxIterations ? STOP_REASON.MAX_ITERATIONS : STOP_REASON.MANUAL,
        });
        _gfLoopInstance = null;
        return;
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

      let atomicSteps: unknown = [];
      let affectedFiles: unknown = [];
      try {
        atomicSteps = JSON.parse(job.atomic_steps_raw);
        affectedFiles = JSON.parse(job.affected_files_raw);
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
          phase: 'job_payload_parse',
          runId,
          jobId: job.job_id,
          err,
          fatal: false,
        });
        iterationCount++;
        if (!stopped) {
          setTimeout(() => { tick().catch(() => {}); }, 2_000);
        }
        return;
      }

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

        const chosenModel = normalizedModel;
        const provider = extractProviderFromModelId(chosenModel) as any;
        const loopConfig = {
          maxIterations: jobLoopMaxIterations, // per job
          stepDelayMs: appConfig.agent.stepDelayMs,
          maxTokensPerStep: appConfig.agent.maxTokensPerStep,
          autoApproveChanges: normalizedAutoApproveChanges,
          autoAnswerQuestions: normalizedAutoAnswerQuestions,
          model: chosenModel,
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
      last_max_iterations: Number(getKv(db, 'god_factory:loop:last_max_iterations') ?? '0') || null,
      governance: {
        autoApproveChanges: getKv(db, 'god_factory:loop:last_auto_approve_changes') === '1',
        autoAnswerQuestions: getKv(db, 'god_factory:loop:last_auto_answer_questions') === '1',
        checkpointEvery: Number(getKv(db, 'god_factory:loop:last_checkpoint_every') ?? '5') || 5,
        jobMaxIterations: Number(getKv(db, 'god_factory:loop:last_job_max_iterations') ?? '10') || 10,
        mode: getKv(db, 'god_factory:loop:last_auto_approve_changes') === '1'
          ? 'unsafe_override'
          : 'safe',
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
