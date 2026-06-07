// ============================================================
// Model Rate Limit Learning Engine
//
// Learns over time how long rate limits last per model by:
// 1. Recording every rate-limit event with timestamp
// 2. Tracking consecutive successes / failures per model
// 3. Soft-probing cooled-down models to verify availability
// 4. Maintaining per-model cooldown state in SQLite
// 5. Building model pool assignments for crawlers
// ============================================================

import { randomUUID } from 'crypto';
import type { Database } from 'better-sqlite3';
import { MODELS } from '@personal-ide/shared';
import { FALLBACK_CHAINS } from '../llm/unifiedFallback.js';

// ── Interfaces ──────────────────────────────────────────────

interface CooldownRow {
  model_id: string;
  provider: string;
  is_rate_limited: number;
  rate_limited_at: string | null;
  estimated_reset_at: string | null;
  learned_cooldown_ms: number;
  consecutive_successes: number;
  consecutive_failures: number;
  last_probe_at: string | null;
  updated_at: string;
}

interface ModelPoolRow {
  service_id: string;
  model_id: string;
  priority: number;
}

// ── Helpers ─────────────────────────────────────────────────

function providerFromModelId(modelId: string): string {
  const prefix = modelId.split('/')[0];
  return prefix ?? 'unknown';
}

// Default cooldown windows by provider tier (milliseconds)
const DEFAULT_COOLDOWNS: Record<string, number> = {
  groq: 62_000,         // Groq: 1-minute RPM window + buffer
  gemini: 65_000,        // Gemini: 1-minute window
  openrouter: 61_000,
  siliconflow: 61_000,
  together: 61_000,
  cerebras: 30_000,      // Cerebras less strict
  mistral: 10_000,       // Mistral very permissive
  qwen: 61_000,
  'deepseek-direct': 61_000,
  xai: 61_000,
  anthropic: 61_000,
  perplexity: 61_000,
  fireworks: 61_000,
};

function defaultCooldown(modelId: string): number {
  const provider = providerFromModelId(modelId);
  return DEFAULT_COOLDOWNS[provider] ?? 61_000;
}

// ── Core Functions ───────────────────────────────────────────

/**
 * Call this when a model returns 429 / rate-limit error.
 * Updates the cooldown state and records the observation.
 */
export function recordRateLimit(
  db: Database,
  modelId: string,
  httpStatus: number,
  errorMessage?: string,
  requestsInWindow?: number,
): void {
  const provider = providerFromModelId(modelId);
  const now = new Date();

  // Get existing cooldown state to learn from history
  const existing = db
    .prepare('SELECT * FROM model_cooldown_state WHERE model_id = ?')
    .get(modelId) as CooldownRow | undefined;

  // Adapt the learned cooldown: if we're hitting limits frequently,
  // increase the backoff geometrically
  let learnedCooldown = existing?.learned_cooldown_ms ?? defaultCooldown(modelId);
  const failures = (existing?.consecutive_failures ?? 0) + 1;
  if (failures > 3) {
    // Geometric backoff: cap at 10 minutes
    learnedCooldown = Math.min(learnedCooldown * 1.5, 600_000);
  }

  const estimatedResetAt = new Date(now.getTime() + learnedCooldown);

  // Upsert cooldown state
  db.prepare(`
    INSERT INTO model_cooldown_state
      (model_id, provider, is_rate_limited, rate_limited_at, estimated_reset_at,
       learned_cooldown_ms, consecutive_successes, consecutive_failures, updated_at)
    VALUES (?, ?, 1, ?, ?, ?, 0, ?, datetime('now'))
    ON CONFLICT(model_id) DO UPDATE SET
      is_rate_limited      = 1,
      rate_limited_at      = excluded.rate_limited_at,
      estimated_reset_at   = excluded.estimated_reset_at,
      learned_cooldown_ms  = excluded.learned_cooldown_ms,
      consecutive_successes = 0,
      consecutive_failures = excluded.consecutive_failures,
      updated_at           = datetime('now')
  `).run(
    modelId, provider,
    now.toISOString(),
    estimatedResetAt.toISOString(),
    learnedCooldown,
    failures,
  );

  // Record the observation
  db.prepare(`
    INSERT INTO rate_limit_observations
      (id, model_id, provider, event_type, observed_at, cooldown_ms,
       requests_in_window, http_status, error_message)
    VALUES (?, ?, ?, 'rate_limited', datetime('now'), ?, ?, ?, ?)
  `).run(
    randomUUID(), modelId, provider,
    learnedCooldown, requestsInWindow ?? null, httpStatus, errorMessage ?? null,
  );
}

/**
 * Call this when a model returns a successful response.
 * Reduces cooldown if model was previously rate-limited.
 */
export function recordSuccess(db: Database, modelId: string): void {
  const provider = providerFromModelId(modelId);
  const existing = db
    .prepare('SELECT * FROM model_cooldown_state WHERE model_id = ?')
    .get(modelId) as CooldownRow | undefined;

  const wasLimited = (existing?.is_rate_limited ?? 0) === 1;
  const successes = (existing?.consecutive_successes ?? 0) + 1;

  // Learn: if we succeed after a cooldown, shrink the learned cooldown slightly
  let learnedCooldown = existing?.learned_cooldown_ms ?? defaultCooldown(modelId);
  if (wasLimited && successes >= 2) {
    learnedCooldown = Math.max(learnedCooldown * 0.9, defaultCooldown(modelId));
  }

  db.prepare(`
    INSERT INTO model_cooldown_state
      (model_id, provider, is_rate_limited, learned_cooldown_ms,
       consecutive_successes, consecutive_failures, updated_at)
    VALUES (?, ?, 0, ?, ?, 0, datetime('now'))
    ON CONFLICT(model_id) DO UPDATE SET
      is_rate_limited       = 0,
      estimated_reset_at    = NULL,
      learned_cooldown_ms   = excluded.learned_cooldown_ms,
      consecutive_successes = excluded.consecutive_successes,
      consecutive_failures  = 0,
      updated_at            = datetime('now')
  `).run(modelId, provider, learnedCooldown, successes);

  if (wasLimited) {
    // Record that the soft probe / retry succeeded
    db.prepare(`
      INSERT INTO rate_limit_observations
        (id, model_id, provider, event_type, observed_at, cooldown_ms)
      VALUES (?, ?, ?, 'success_after_cooldown', datetime('now'), ?)
    `).run(randomUUID(), modelId, provider, learnedCooldown);
  }
}

/**
 * Check if a model is currently in cooldown (should be skipped).
 */
export function isModelCoolingDown(db: Database, modelId: string): boolean {
  const row = db
    .prepare('SELECT is_rate_limited, estimated_reset_at FROM model_cooldown_state WHERE model_id = ?')
    .get(modelId) as { is_rate_limited: number; estimated_reset_at: string | null } | undefined;

  if (!row || row.is_rate_limited === 0) return false;
  if (!row.estimated_reset_at) return false;

  const resetAt = new Date(row.estimated_reset_at).getTime();
  if (Date.now() >= resetAt) {
    // Cooldown has expired — mark as available (will be re-confirmed on next success)
    db.prepare(`
      UPDATE model_cooldown_state SET is_rate_limited = 0, updated_at = datetime('now')
      WHERE model_id = ?
    `).run(modelId);
    return false;
  }

  return true;
}

/**
 * Get available models for a given fallback chain key,
 * filtering out any that are currently rate-limited.
 */
export function getAvailableModels(
  db: Database,
  chainKey: 'default' | 'crawler' | 'reasoning' | 'lightweight' | 'embedding',
): string[] {
  const chain = FALLBACK_CHAINS[chainKey] ?? FALLBACK_CHAINS.default;
  return chain.filter((modelId: string) => !isModelCoolingDown(db, modelId));
}

/**
 * Assign N models to a crawler service, using quality scores and cooldown state.
 * Persists assignment to model_pool_assignments table.
 */
export function assignModelsToService(
  db: Database,
  serviceId: string,
  count = 10,
  chainKey: 'default' | 'crawler' | 'reasoning' | 'lightweight' | 'embedding' = 'crawler',
): string[] {
  const available = getAvailableModels(db, chainKey);
  const selected = available.slice(0, count);

  // Clear old assignments for this service
  db.prepare('DELETE FROM model_pool_assignments WHERE service_id = ?').run(serviceId);

  // Insert new assignments
  const insert = db.prepare(`
    INSERT OR REPLACE INTO model_pool_assignments (service_id, model_id, priority, assigned_at)
    VALUES (?, ?, ?, datetime('now'))
  `);
  selected.forEach((modelId, i) => insert.run(serviceId, modelId, selected.length - i));

  return selected;
}

/**
 * Get current model pool assignment for a service.
 */
export function getModelPool(db: Database, serviceId: string): string[] {
  const rows = db
    .prepare('SELECT model_id FROM model_pool_assignments WHERE service_id = ? ORDER BY priority DESC')
    .all(serviceId) as ModelPoolRow[];
  return rows.map(r => r.model_id);
}

/**
 * Run soft probes: for each model that's past its estimated reset time,
 * try a minimal call to confirm availability. Called by subsystem scheduler.
 */
export async function runSoftProbes(db: Database): Promise<void> {
  const now = new Date().toISOString();

  // Find models whose cooldown has likely expired
  const candidates = db.prepare(`
    SELECT model_id, provider, estimated_reset_at, learned_cooldown_ms
    FROM model_cooldown_state
    WHERE is_rate_limited = 1
      AND estimated_reset_at <= ?
    ORDER BY estimated_reset_at ASC
    LIMIT 10
  `).all(now) as { model_id: string; provider: string; estimated_reset_at: string; learned_cooldown_ms: number }[];

  for (const candidate of candidates) {
    // Mark as "probing" to avoid parallel probes
    db.prepare(`
      UPDATE model_cooldown_state SET last_probe_at = datetime('now'), updated_at = datetime('now')
      WHERE model_id = ?
    `).run(candidate.model_id);

    try {
      // Soft probe: tiny call to check if model is available
      const { callWithFallback } = await import('../llm/unifiedFallback.js');
      const result = await callWithFallback({
        db,
        customChain: [candidate.model_id],
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 1,
        taskType: 'probe',
      });

      if (result) {
        recordSuccess(db, candidate.model_id);
        db.prepare(`
          INSERT INTO rate_limit_observations
            (id, model_id, provider, event_type, observed_at, cooldown_ms)
          VALUES (?, ?, ?, 'soft_probe_success', datetime('now'), ?)
        `).run(randomUUID(), candidate.model_id, candidate.provider, candidate.learned_cooldown_ms);
      }
    } catch (err) {
      // Still rate limited
      const errMsg = err instanceof Error ? err.message : String(err);
      db.prepare(`
        INSERT INTO rate_limit_observations
          (id, model_id, provider, event_type, observed_at, error_message)
        VALUES (?, ?, ?, 'soft_probe_fail', datetime('now'), ?)
      `).run(randomUUID(), candidate.model_id, candidate.provider, errMsg);

      // Extend cooldown by 50%
      db.prepare(`
        UPDATE model_cooldown_state
        SET estimated_reset_at = datetime('now', '+' || CAST(ROUND(learned_cooldown_ms * 1.5 / 1000) AS TEXT) || ' seconds'),
            updated_at = datetime('now')
        WHERE model_id = ?
      `).run(candidate.model_id);
    }
  }
}

/**
 * Get rate limit stats for the dashboard.
 */
export function getRateLimitStats(db: Database): {
  rateLimitedModels: Array<{ model_id: string; estimated_reset_at: string; learned_cooldown_ms: number }>;
  totalObservations: number;
  topOffenders: Array<{ model_id: string; count: number }>;
} {
  const rateLimitedModels = db.prepare(`
    SELECT model_id, estimated_reset_at, learned_cooldown_ms
    FROM model_cooldown_state
    WHERE is_rate_limited = 1
    ORDER BY estimated_reset_at ASC
  `).all() as Array<{ model_id: string; estimated_reset_at: string; learned_cooldown_ms: number }>;

  const totalRow = db.prepare('SELECT COUNT(*) as cnt FROM rate_limit_observations WHERE event_type = ?').get('rate_limited') as { cnt: number };

  const topOffenders = db.prepare(`
    SELECT model_id, COUNT(*) as count
    FROM rate_limit_observations
    WHERE event_type = 'rate_limited'
      AND observed_at >= datetime('now', '-7 days')
    GROUP BY model_id
    ORDER BY count DESC
    LIMIT 10
  `).all() as Array<{ model_id: string; count: number }>;

  return {
    rateLimitedModels,
    totalObservations: totalRow.cnt,
    topOffenders,
  };
}
