// ============================================================
// Mistral Performance Crawler
//
// Dedicated Mistral AI activity analyzer. Reads model_selection_events
// and blame_records filtered to Mistral provider models, builds a
// granular performance profile to continuously improve Mistral routing.
//
// Schedule: every 15 minutes via SubsystemScheduler
// Output:
//   - app_kv 'mistral_crawler:performance_profile' (JSON)
//   - app_kv 'mistral_crawler:best_mistral_model' (model_id string)
//   - app_kv 'mistral_crawler:last_run' (ISO datetime)
// ============================================================
import type { Database } from 'better-sqlite3';
import { getMistralPerformanceSummary } from '../llm/unifiedFallback.js';

export interface MistralModelProfile {
  model_id: string;
  total_calls: number;
  success_calls: number;
  failure_calls: number;
  success_rate: number;
  avg_latency_ms: number;
  avg_quality: number;
  task_distribution: Record<string, number>;
  last_used?: string;
  recommendation: 'primary' | 'fallback' | 'avoid';
}

export interface MistralPerfCrawlerResult {
  profiles: MistralModelProfile[];
  best_model: string | null;
  total_mistral_calls: number;
  in_memory_summary: ReturnType<typeof getMistralPerformanceSummary>;
  generated_at: string;
}

const MISTRAL_MODEL_IDS = [
  'mistral/mistral-large-latest',
  'mistral/mistral-medium-latest',
  'mistral/mistral-small-latest',
  'mistral/open-mistral-nemo',
  'mistral/codestral-latest',
  'mistral/mistral-embed',
  'mistral/open-codestral-mamba',
  'mistral/mistral-7b-instruct',
  'mistral/mixtral-8x7b-instruct',
  'mistral/mixtral-8x22b-instruct',
];

function setKv(db: Database, key: string, value: string): void {
  try {
    db.prepare(`
      INSERT INTO app_kv (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `).run(key, value);
  } catch { /* ignore */ }
}

export function runMistralPerfCrawlerTick(db: Database): MistralPerfCrawlerResult {
  const generated_at = new Date().toISOString();
  const inMemory = getMistralPerformanceSummary();

  const profiles: MistralModelProfile[] = [];
  let totalMistralCalls = 0;

  // Aggregate model_selection_events for Mistral models
  let selectionRows: any[] = [];
  try {
    selectionRows = db.prepare(`
      SELECT model_chosen,
             COUNT(*) as total_calls,
             SUM(success) as success_calls,
             AVG(latency_ms) as avg_latency,
             task_type,
             MAX(created_at) as last_used
      FROM model_selection_events
      WHERE model_chosen LIKE 'mistral/%'
      GROUP BY model_chosen, task_type
    `).all() as any[];
  } catch { /* table not yet initialized */ }

  // Aggregate quality from model_registry
  let registryRows: any[] = [];
  try {
    registryRows = db.prepare(`
      SELECT model_id, success_rate, avg_quality
      FROM model_registry
      WHERE model_id LIKE 'mistral/%'
    `).all() as any[];
  } catch { /* ignore */ }

  const registryIndex: Record<string, { success_rate: number; avg_quality: number }> = {};
  for (const r of registryRows) {
    registryIndex[r.model_id] = {
      success_rate: Number(r.success_rate ?? 0),
      avg_quality: Number(r.avg_quality ?? 0),
    };
  }

  // Merge by model_id
  const modelAgg: Record<string, {
    total: number; success: number; failures: number; latencies: number[];
    tasks: Record<string, number>; last_used: string | undefined;
  }> = {};

  for (const row of selectionRows) {
    const mid: string = row.model_chosen;
    if (!modelAgg[mid]) {
      modelAgg[mid] = { total: 0, success: 0, failures: 0, latencies: [], tasks: {}, last_used: undefined };
    }
    const agg = modelAgg[mid];
    agg.total += Number(row.total_calls ?? 0);
    agg.success += Number(row.success_calls ?? 0);
    agg.failures += Number(row.total_calls ?? 0) - Number(row.success_calls ?? 0);
    if (row.avg_latency) agg.latencies.push(Number(row.avg_latency));
    if (row.task_type) agg.tasks[row.task_type] = (agg.tasks[row.task_type] ?? 0) + Number(row.total_calls ?? 0);
    if (row.last_used && (!agg.last_used || row.last_used > agg.last_used)) agg.last_used = row.last_used;
  }

  // Also merge in-memory Mistral stats
  for (const [mid, stats] of Object.entries(inMemory)) {
    if (!modelAgg[mid]) modelAgg[mid] = { total: 0, success: 0, failures: 0, latencies: [], tasks: {}, last_used: undefined };
    const agg = modelAgg[mid];
    agg.total += (stats as any).calls ?? 0;
    agg.success += (stats as any).successes ?? 0;
    agg.failures += (stats as any).failures ?? 0;
    if ((stats as any).avgLatencyMs) agg.latencies.push((stats as any).avgLatencyMs);
  }

  // Ensure all known Mistral models have at least an empty profile
  for (const mid of MISTRAL_MODEL_IDS) {
    if (!modelAgg[mid]) modelAgg[mid] = { total: 0, success: 0, failures: 0, latencies: [], tasks: {}, last_used: undefined };
  }

  for (const [model_id, agg] of Object.entries(modelAgg)) {
    const reg = registryIndex[model_id];
    const success_rate = agg.total > 0 ? agg.success / agg.total : (reg?.success_rate ?? 0.5);
    const avg_latency = agg.latencies.length > 0
      ? agg.latencies.reduce((a, b) => a + b, 0) / agg.latencies.length
      : 0;
    const avg_quality = reg?.avg_quality ?? 0.5;

    // Scoring — how to recommend this model
    let recommendation: 'primary' | 'fallback' | 'avoid' = 'fallback';
    if (success_rate >= 0.85 && avg_quality >= 0.7 && avg_latency < 5000) recommendation = 'primary';
    else if (success_rate < 0.4) recommendation = 'avoid';

    totalMistralCalls += agg.total;

    profiles.push({
      model_id,
      total_calls: agg.total,
      success_calls: agg.success,
      failure_calls: agg.failures,
      success_rate: Math.round(success_rate * 1000) / 1000,
      avg_latency_ms: Math.round(avg_latency),
      avg_quality: Math.round(avg_quality * 1000) / 1000,
      task_distribution: agg.tasks,
      last_used: agg.last_used,
      recommendation,
    });
  }

  profiles.sort((a, b) => b.success_rate - a.success_rate || a.avg_latency_ms - b.avg_latency_ms);

  const best_model = profiles.find(p => p.recommendation === 'primary')?.model_id
    ?? profiles[0]?.model_id
    ?? null;

  const result: MistralPerfCrawlerResult = {
    profiles,
    best_model,
    total_mistral_calls: totalMistralCalls,
    in_memory_summary: inMemory,
    generated_at,
  };

  setKv(db, 'mistral_crawler:performance_profile', JSON.stringify(profiles));
  setKv(db, 'mistral_crawler:best_mistral_model', best_model ?? '');
  setKv(db, 'mistral_crawler:last_run', generated_at);
  setKv(db, 'mistral_crawler:total_calls', String(totalMistralCalls));

  return result;
}
