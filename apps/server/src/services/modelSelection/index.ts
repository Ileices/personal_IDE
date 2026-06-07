// ============================================================
// Model Selection Tracker — records per-message model choices
// to feed the God Factory "thinking animation" UI and audit trail
// ============================================================
import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';

export interface ModelSelectionEvent {
  id: string;
  message_id?: string;
  session_id: string;
  model_chosen: string;
  models_considered: string[]; // ordered list of models tried
  reason?: string;             // why this model was chosen / fallback reason
  latency_ms?: number;
  task_type?: string;          // 'default' | 'crawler' | 'reasoning' | 'lightweight' | 'embedding'
  success: boolean;
  created_at: string;
}

export interface RecentSelectionsResult {
  events: ModelSelectionEvent[];
  mostUsed: { model: string; count: number }[];
  totalFallbacks: number;
}

/**
 * Record a model selection event. Called by `callWithFallback()` and any
 * direct LLM call site so the God Factory UI can show per-message routing.
 */
export function recordModelSelection(
  db: Database,
  opts: {
    sessionId: string;
    messageId?: string;
    modelChosen: string;
    modelsConsidered?: string[];
    reason?: string;
    latencyMs?: number;
    taskType?: string;
    success?: boolean;
  },
): string {
  const id = randomUUID();
  try {
    db.prepare(`
      INSERT INTO model_selection_events
        (id, message_id, session_id, model_chosen, models_considered, reason, latency_ms, task_type, success)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      opts.messageId ?? null,
      opts.sessionId,
      opts.modelChosen,
      JSON.stringify(opts.modelsConsidered ?? [opts.modelChosen]),
      opts.reason ?? null,
      opts.latencyMs ?? null,
      opts.taskType ?? 'default',
      opts.success !== false ? 1 : 0,
    );
  } catch { /* table may not exist in older DB — ignore gracefully */ }
  return id;
}

/**
 * Retrieve recent model selection events for a session,
 * with summary stats for the UI thinking animation.
 */
export function getRecentSelections(
  db: Database,
  opts: { sessionId?: string; limit?: number; taskType?: string },
): RecentSelectionsResult {
  const limit = Math.min(opts.limit ?? 50, 500);

  let whereClause = '1=1';
  const args: (string | number)[] = [];

  if (opts.sessionId) {
    whereClause += ' AND session_id = ?';
    args.push(opts.sessionId);
  }
  if (opts.taskType) {
    whereClause += ' AND task_type = ?';
    args.push(opts.taskType);
  }

  args.push(limit);

  let rawEvents: any[] = [];
  try {
    rawEvents = db.prepare(`
      SELECT * FROM model_selection_events
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ?
    `).all(...args) as any[];
  } catch { return { events: [], mostUsed: [], totalFallbacks: 0 }; }

  const events: ModelSelectionEvent[] = rawEvents.map((r: any) => ({
    id: r.id,
    message_id: r.message_id ?? undefined,
    session_id: r.session_id,
    model_chosen: r.model_chosen,
    models_considered: (() => { try { return JSON.parse(r.models_considered); } catch { return [r.model_chosen]; } })(),
    reason: r.reason ?? undefined,
    latency_ms: r.latency_ms ?? undefined,
    task_type: r.task_type ?? 'default',
    success: r.success === 1,
    created_at: r.created_at,
  }));

  // Aggregate most-used models
  const counts: Record<string, number> = {};
  let totalFallbacks = 0;
  for (const e of events) {
    counts[e.model_chosen] = (counts[e.model_chosen] ?? 0) + 1;
    if ((e.models_considered?.length ?? 0) > 1) totalFallbacks++;
  }

  const mostUsed = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([model, count]) => ({ model, count }));

  return { events, mostUsed, totalFallbacks };
}
