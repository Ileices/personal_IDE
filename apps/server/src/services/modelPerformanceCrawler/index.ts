// ============================================================
// Model Performance Crawler
//
// Reads blame_records, model_registry, and model_selection_events
// to build an adaptive per-task routing table.
//
// Schedule: every 30 minutes via SubsystemScheduler
// Output: app_kv key 'model_perf_crawler:routing_table' (JSON)
// ============================================================
import type { Database } from 'better-sqlite3';

export interface ModelRoutingEntry {
  model_id: string;
  task_types: string[];
  composite_score: number;
  avg_latency_ms: number;
  success_rate: number;
  recent_selections: number;
  recommended_chain: string;
}

export interface ModelPerfCrawlerResult {
  routing_table: ModelRoutingEntry[];
  analyzed_models: number;
  analyzed_events: number;
  generated_at: string;
}

function setKv(db: Database, key: string, value: string): void {
  try {
    db.prepare(`
      INSERT INTO app_kv (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `).run(key, value);
  } catch { /* ignore */ }
}

function getKv(db: Database, key: string): string | null {
  try {
    const row = db.prepare(`SELECT value FROM app_kv WHERE key = ?`).get(key) as { value?: string } | undefined;
    return row?.value ?? null;
  } catch { return null; }
}

/**
 * Build a per-task routing table by aggregating model_registry success data
 * with model_selection_events for recency weighting.
 */
export function runModelPerfCrawlerTick(db: Database): ModelPerfCrawlerResult {
  const generated_at = new Date().toISOString();
  let modelRows: any[] = [];

  try {
    modelRows = db.prepare(`
      SELECT model_id, provider, success_rate, avg_quality, total_runs, last_run_at
      FROM model_registry
      WHERE success_rate IS NOT NULL
      ORDER BY success_rate DESC, avg_quality DESC
    `).all() as any[];
  } catch { /* model_registry may not exist */ }

  // Get recent selection events to weight recency
  let selectionRows: any[] = [];
  try {
    selectionRows = db.prepare(`
      SELECT model_chosen, task_type, AVG(latency_ms) as avg_latency, COUNT(*) as cnt,
             SUM(success) as successes
      FROM model_selection_events
      WHERE created_at > datetime('now', '-7 days')
      GROUP BY model_chosen, task_type
    `).all() as any[];
  } catch { /* table may not exist yet */ }

  // Build selection index: model_id → { task_type → { cnt, avg_latency, successes } }
  const selectionIndex: Record<string, Record<string, { cnt: number; avg_latency: number; successes: number }>> = {};
  for (const row of selectionRows) {
    if (!selectionIndex[row.model_chosen]) selectionIndex[row.model_chosen] = {};
    selectionIndex[row.model_chosen][row.task_type] = {
      cnt: row.cnt,
      avg_latency: row.avg_latency ?? 0,
      successes: row.successes,
    };
  }

  const routingTable: ModelRoutingEntry[] = [];

  for (const model of modelRows) {
    const modelId: string = model.model_id;
    const baseScore = (Number(model.success_rate) * 0.6) + (Number(model.avg_quality ?? 0) * 0.4);

    // Best task types this model is good at (highest combined score)
    const myTasks = Object.entries(selectionIndex[modelId] ?? {}).map(([task_type, stats]) => ({
      task_type,
      score: stats.cnt > 0 ? stats.successes / stats.cnt : 0,
      avg_latency: stats.avg_latency,
      cnt: stats.cnt,
    })).sort((a, b) => b.score - a.score);

    const bestTasks = myTasks.slice(0, 3).map(t => t.task_type);
    const avgLatency = myTasks.reduce((acc, t) => acc + t.avg_latency, 0) / (myTasks.length || 1);

    // Determine which chain this model is best placed in
    let recommended_chain = 'default';
    if (modelId.includes('embed')) recommended_chain = 'embedding';
    else if (modelId.includes('reasoning') || modelId.includes('thinking') || modelId.includes('o1') || modelId.includes('r1')) recommended_chain = 'reasoning';
    else if (avgLatency < 500 && baseScore > 0.8) recommended_chain = 'lightweight';
    else if (baseScore > 0.7 && bestTasks.includes('crawler')) recommended_chain = 'crawler';

    routingTable.push({
      model_id: modelId,
      task_types: bestTasks.length > 0 ? bestTasks : ['default'],
      composite_score: Math.round(baseScore * 1000) / 1000,
      avg_latency_ms: Math.round(avgLatency),
      success_rate: Number(model.success_rate),
      recent_selections: myTasks.reduce((acc, t) => acc + t.cnt, 0),
      recommended_chain,
    });
  }

  // Sort by composite_score DESC
  routingTable.sort((a, b) => b.composite_score - a.composite_score);

  const result: ModelPerfCrawlerResult = {
    routing_table: routingTable,
    analyzed_models: modelRows.length,
    analyzed_events: selectionRows.length,
    generated_at,
  };

  // Persist to app_kv for the God Factory fallback to read
  setKv(db, 'model_perf_crawler:routing_table', JSON.stringify(routingTable.slice(0, 20)));
  setKv(db, 'model_perf_crawler:last_run', generated_at);
  setKv(db, 'model_perf_crawler:analyzed_models', String(modelRows.length));
  setKv(db, 'model_perf_crawler:analyzed_events', String(selectionRows.length));

  return result;
}

/**
 * Retrieve the cached routing table from app_kv.
 * Used by the God Factory to check which models perform best per task type.
 */
export function getCachedRoutingTable(db: Database): ModelRoutingEntry[] | null {
  const raw = getKv(db, 'model_perf_crawler:routing_table');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ModelRoutingEntry[];
  } catch { return null; }
}
