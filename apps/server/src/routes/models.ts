// ============================================
// Models Routes - List available models + rate limits
// ============================================
import { FastifyInstance } from 'fastify';
import { MODELS, RATE_LIMITS, extractProviderFromModelId } from '@personal-ide/shared';
import { randomUUID } from 'crypto';
import { rateLimiter } from '../services/llm/rateLimiter.js';
import { getAvailableModels } from '../services/llm/client.js';
import { createNanoClient, createOllamaClient, getClientFromDb } from '../services/llm/providers.js';
import type { ProviderType } from '@personal-ide/shared';

type TestClassification = 'working' | 'rate_limited' | 'cost_blocked' | 'not_configured' | 'not_installed' | 'discontinued' | 'error';

function classifyFailureScope(classification: TestClassification): { cleanupEligible: boolean; blockScope: 'temporary' | 'persistent'; dominantFailureKind?: string } {
  switch (classification) {
    case 'rate_limited':
      return { cleanupEligible: false, blockScope: 'temporary', dominantFailureKind: 'rate_limited' };
    case 'working':
      return { cleanupEligible: false, blockScope: 'temporary' };
    case 'not_configured':
      return { cleanupEligible: true, blockScope: 'persistent', dominantFailureKind: 'auth_or_quota' };
    case 'cost_blocked':
      return { cleanupEligible: true, blockScope: 'persistent', dominantFailureKind: 'auth_or_quota' };
    case 'not_installed':
      return { cleanupEligible: true, blockScope: 'persistent', dominantFailureKind: 'provider_unreachable' };
    case 'discontinued':
      return { cleanupEligible: true, blockScope: 'persistent', dominantFailureKind: 'provider_unreachable' };
    default:
      return { cleanupEligible: true, blockScope: 'persistent', dominantFailureKind: 'low_quality' };
  }
}

function upsertModelRegistryFromTest(db: any, modelId: string, provider: string, success: boolean, classification: TestClassification, errorMessage?: string): void {
  try {
    const row = db.prepare('SELECT * FROM model_registry WHERE model_id = ?').get(modelId) as any;
    const scope = classifyFailureScope(classification);
    const strategyConfig = success
      ? {
          recommended: true,
          action: 'keep',
          reason: 'working',
          cleanupEligible: false,
          blockScope: 'temporary',
          source: 'model_test',
          observedAt: new Date().toISOString(),
        }
      : {
          recommended: false,
          action: scope.cleanupEligible ? 'cleanup' : 'cooldown',
          reason: classification,
          cleanupEligible: scope.cleanupEligible,
          blockScope: scope.blockScope,
          dominantFailureKind: scope.dominantFailureKind,
          failureSummary: {
            providerFailures: scope.dominantFailureKind === 'provider_unreachable' ? 1 : 0,
            authFailures: scope.dominantFailureKind === 'auth_or_quota' ? 1 : 0,
            rateLimitFailures: scope.dominantFailureKind === 'rate_limited' ? 1 : 0,
          },
          source: 'model_test',
          observedAt: new Date().toISOString(),
          error: errorMessage || '',
        };

    if (!row) {
      db.prepare(`
        INSERT INTO model_registry
          (id, model_id, display_name, provider, total_runs, success_rate,
           avg_quality, avg_latency_ms, total_tokens, trend, strategy_config, last_run_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, 0, 0, 0, 'flat', ?, datetime('now'), datetime('now'))
      `).run(
        randomUUID(),
        modelId,
        modelId.split('/').pop() ?? modelId,
        provider || modelId.split('/')[0] || 'unknown',
        success ? 1 : 0,
        JSON.stringify(strategyConfig),
      );
      return;
    }

    const totalRuns = Number(row.total_runs || 0) + 1;
    const successRate = ((Number(row.success_rate || 0) * Number(row.total_runs || 0)) + (success ? 1 : 0)) / Math.max(1, totalRuns);
    db.prepare(`
      UPDATE model_registry
      SET total_runs = ?,
          success_rate = ?,
          strategy_config = ?,
          last_run_at = datetime('now'),
          updated_at = datetime('now')
      WHERE model_id = ?
    `).run(totalRuns, successRate, JSON.stringify(strategyConfig), modelId);
  } catch {
    // best-effort; model test should not fail due to telemetry persistence
  }
}

export async function modelsRoutes(app: FastifyInstance) {
  const db = (app as any).db;
  // --- GET /api/models - List all models ---
  app.get('/', async () => {
    // Try to fetch live models from the provider when a token is available.
    try {
      const live = await getAvailableModels(app.db);
      // Normalize returned shape if necessary. We return the raw provider list
      // but keep the legacy RATE_LIMITS for client-side display.
      return {
        models: live,
        rateLimits: RATE_LIMITS,
        source: 'live',
      };
    } catch (err) {
      // Fall back to the bundled MODELS if live fetch fails (no token or API error)
      return {
        models: MODELS,
        rateLimits: RATE_LIMITS,
        source: 'fallback',
        error: (err as Error).message,
      };
    }
  });

  // --- GET /api/models/status - Rate limit status for all models ---
  app.get('/status', async () => {
    return { status: rateLimiter.getAllStatus() };
  });

  // --- POST /api/models/test - Test a specific model and classify failures ---
  app.post<{ Body: { modelId: string } }>('/test', async (request, reply) => {
    const { modelId } = request.body || {};
    if (!modelId) return reply.status(400).send({ success: false, error: 'modelId is required' });

    // Use the routing provider (e.g. openai/gpt-4.1 routes via 'github', not 'openai')
    const routingProvider = extractProviderFromModelId(modelId) as ProviderType;
    // The model ID the provider's API actually expects (strip the prefix for github-routed models)
    const providerModelId = (() => {
      const slashIdx = modelId.indexOf('/');
      if (routingProvider === 'github') return slashIdx > 0 ? modelId.slice(slashIdx + 1) : modelId;
      return slashIdx > 0 ? modelId.slice(slashIdx + 1) : modelId;
    })();

    const classify = (message: string): TestClassification => {
      const msg = message.toLowerCase();
      if (msg.includes('not configured') || msg.includes('no api key') || msg.includes('no github token') || msg.includes('unauthorized') || msg.includes('401')) return 'not_configured';
      if (msg.includes('not installed')) return 'not_installed';
      if (msg.includes('rate') && (msg.includes('limit') || msg.includes('exceeded'))) return 'rate_limited';
      if (msg.includes('429')) return 'rate_limited';
      if (msg.includes('quota') || msg.includes('insufficient') || msg.includes('billing') || msg.includes('credit') || msg.includes('payment')) return 'cost_blocked';
      if (msg.includes('not found') || msg.includes('does not exist') || msg.includes('404') || msg.includes('deprecated') || msg.includes('discontinued') || msg.includes('no longer available')) return 'discontinued';
      if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('abort')) return 'error';
      return 'error';
    };

    try {
      if (routingProvider === 'ollama') {
        const client = createOllamaClient();
        const baseURL = ((client as any).baseURL || '').replace(/\/v1\/?$/, '');
        const tagsRes = await fetch(`${baseURL}/api/tags`, { signal: AbortSignal.timeout(8000) });
        if (!tagsRes.ok) throw new Error(`Ollama unavailable: HTTP ${tagsRes.status}`);
        const tagsData = await tagsRes.json() as any;
        const installedNames = new Set((tagsData.models || []).map((m: any) => String(m.name)));
        if (!installedNames.has(providerModelId)) {
          upsertModelRegistryFromTest(db, modelId, routingProvider, false, 'not_installed', `Model ${providerModelId} is not installed in Ollama`);
          return reply.status(400).send({
            success: false, modelId, classification: 'not_installed',
            error: `Model ${providerModelId} is not installed in Ollama`,
          });
        }
      }

      // For github-routed models, verify the model is in the catalog before wasting an API call
      if (routingProvider === 'github') {
        const inCatalog = MODELS.some(m => m.id === modelId && extractProviderFromModelId(m.id) === 'github');
        if (!inCatalog) {
          upsertModelRegistryFromTest(db, modelId, routingProvider, false, 'discontinued', `${modelId} is not in the GitHub Models catalog`);
          return reply.status(400).send({
            success: false, modelId, classification: 'discontinued',
            error: `${modelId} is not in the GitHub Models catalog. It may have been removed or you may need to update the app.`,
          });
        }
      }

      const client = routingProvider === 'ollama'
        ? createOllamaClient()
        : routingProvider === 'nano'
        ? createNanoClient()
        : getClientFromDb(db, routingProvider);

      if (!client) {
        const errMsg = routingProvider === 'github'
          ? 'No GitHub PAT configured. Add your token in Provider Settings → GitHub Token (PAT).'
          : `Provider ${routingProvider} is not configured`;
        upsertModelRegistryFromTest(db, modelId, routingProvider, false, 'not_configured', errMsg);
        return reply.status(400).send({ success: false, modelId, classification: 'not_configured', error: errMsg });
      }

      // Short 10-second timeout for test probes — don't wait 5 minutes for a dead model
      const response = await client.chat.completions.create(
        { model: providerModelId, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], max_tokens: 8, temperature: 0 },
        { timeout: 10_000 },
      );

      const content = response.choices?.[0]?.message?.content || '';
      upsertModelRegistryFromTest(db, modelId, routingProvider, true, 'working');
      return { success: true, modelId, classification: 'working', content, usage: response.usage || null };
    } catch (err: any) {
      const message = err?.error?.message || err?.message || 'Unknown model test error';
      const classification = classify(message);
      upsertModelRegistryFromTest(db, modelId, routingProvider, false, classification, message);
      return reply.status(400).send({ success: false, modelId, classification, error: message });
    }
  });

  // --- POST /api/models/bulk-test - Test all (or a subset of) models end-to-end ---
  // Returns a full health report and writes results to model_registry + blame_records.
  app.post<{ Body: { modelIds?: string[]; provider?: string; timeoutMs?: number } }>('/bulk-test', async (request, reply) => {
    const { modelIds, provider, timeoutMs = 10_000 } = request.body || {};

    // Determine candidate model IDs
    let candidates: string[] = [];
    if (modelIds && modelIds.length > 0) {
      candidates = modelIds;
    } else if (provider) {
      candidates = MODELS.filter(m => extractProviderFromModelId(m.id) === provider).map(m => m.id);
    } else {
      candidates = MODELS.map(m => m.id);
    }

    const sessionId = randomUUID();
    const startedAt = Date.now();

    const results: Array<{
      modelId: string;
      routingProvider: string;
      success: boolean;
      classification: TestClassification;
      error?: string;
      latencyMs?: number;
      content?: string;
    }> = [];

    const classifyMsg = (message: string): TestClassification => {
      const msg = message.toLowerCase();
      if (msg.includes('unauthorized') || msg.includes('401') || msg.includes('no api key') || msg.includes('no github token') || msg.includes('not configured')) return 'not_configured';
      if (msg.includes('rate') && (msg.includes('limit') || msg.includes('exceeded'))) return 'rate_limited';
      if (msg.includes('429')) return 'rate_limited';
      if (msg.includes('quota') || msg.includes('billing') || msg.includes('credit') || msg.includes('payment')) return 'cost_blocked';
      if (msg.includes('not found') || msg.includes('404') || msg.includes('deprecated') || msg.includes('discontinued') || msg.includes('no longer available')) return 'discontinued';
      return 'error';
    };

    // Group by routing provider so we create each client once and detect misconfigured providers early
    const byProvider = new Map<string, string[]>();
    for (const modelId of candidates) {
      const rp = extractProviderFromModelId(modelId);
      if (!byProvider.has(rp)) byProvider.set(rp, []);
      byProvider.get(rp)!.push(modelId);
    }

    for (const [rp, ids] of byProvider) {
      const client = (rp === 'ollama') ? createOllamaClient()
        : (rp === 'nano') ? createNanoClient()
        : getClientFromDb(db, rp as ProviderType);

      if (!client) {
        // All models for this provider fail with not_configured immediately
        for (const modelId of ids) {
          const errMsg = rp === 'github'
            ? 'No GitHub PAT configured. Add your token in Provider Settings → GitHub Token (PAT).'
            : `Provider ${rp} is not configured`;
          upsertModelRegistryFromTest(db, modelId, rp, false, 'not_configured', errMsg);
          results.push({ modelId, routingProvider: rp, success: false, classification: 'not_configured', error: errMsg });
        }
        continue;
      }

      // For ollama: check installed list once before testing any models
      let ollamaInstalled: Set<string> | null = null;
      if (rp === 'ollama') {
        try {
          const baseURL = ((client as any).baseURL || '').replace(/\/v1\/?$/, '');
          const tagsRes = await fetch(`${baseURL}/api/tags`, { signal: AbortSignal.timeout(5000) });
          if (tagsRes.ok) {
            const tagsData = await tagsRes.json() as any;
            ollamaInstalled = new Set((tagsData.models || []).map((m: any) => String(m.name)));
          }
        } catch { /* ollama not running */ }
      }

      for (const modelId of ids) {
        const slashIdx = modelId.indexOf('/');
        const providerModelId = slashIdx > 0 ? modelId.slice(slashIdx + 1) : modelId;
        const probeStart = Date.now();

        try {
          // Ollama: check installed first
          if (rp === 'ollama') {
            if (!ollamaInstalled || !ollamaInstalled.has(providerModelId)) {
              upsertModelRegistryFromTest(db, modelId, rp, false, 'not_installed', `${providerModelId} is not installed in Ollama`);
              results.push({ modelId, routingProvider: rp, success: false, classification: 'not_installed', error: `${providerModelId} not installed`, latencyMs: 0 });
              continue;
            }
          }

          const response = await client.chat.completions.create(
            { model: providerModelId, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], max_tokens: 8, temperature: 0 },
            { timeout: timeoutMs },
          );
          const content = response.choices?.[0]?.message?.content || '';
          const latencyMs = Date.now() - probeStart;
          upsertModelRegistryFromTest(db, modelId, rp, true, 'working');
          results.push({ modelId, routingProvider: rp, success: true, classification: 'working', latencyMs, content });
        } catch (err: any) {
          const message = err?.error?.message || err?.message || 'Test failed';
          const classification = classifyMsg(message);
          const latencyMs = Date.now() - probeStart;
          upsertModelRegistryFromTest(db, modelId, rp, false, classification, message);
          results.push({ modelId, routingProvider: rp, success: false, classification, error: message, latencyMs });
        }
      }
    }

    // Build health summary
    const summary = {
      sessionId,
      testedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      total: results.length,
      working: results.filter(r => r.classification === 'working').length,
      rateLimited: results.filter(r => r.classification === 'rate_limited').length,
      notConfigured: results.filter(r => r.classification === 'not_configured').length,
      costBlocked: results.filter(r => r.classification === 'cost_blocked').length,
      discontinued: results.filter(r => r.classification === 'discontinued').length,
      notInstalled: results.filter(r => r.classification === 'not_installed').length,
      errors: results.filter(r => r.classification === 'error').length,
    };

    // Write bulk-test session to blame_records so the blame crawler can attribute failures
    try {
      const blameId = randomUUID();
      const failingSummary = results
        .filter(r => !r.success)
        .reduce((acc: Record<string, string[]>, r) => {
          if (!acc[r.classification]) acc[r.classification] = [];
          acc[r.classification].push(r.modelId);
          return acc;
        }, {});

      db.prepare(`
        INSERT OR IGNORE INTO blame_records
          (id, blame_id, interaction_type, session_id, model_id, model_provider,
           retry_count, escalation_level, duration_ms, timestamp, tag_validation_result)
        VALUES (?, ?, 'bulk_model_test', ?, 'system', 'system', 0, 0, ?, datetime('now'), ?)
      `).run(
        randomUUID(), blameId, sessionId,
        summary.durationMs,
        JSON.stringify({ summary, failingByClass: failingSummary }),
      );
    } catch {
      // blame table may not exist yet — non-fatal
    }

    return { summary, results };
  });

  // --- GET /api/models/registry - Model health registry (for blame crawler consumption) ---
  app.get('/registry', async () => {
    try {
      const rows = db.prepare(`
        SELECT model_id, display_name, provider, total_runs, success_rate,
               avg_latency_ms, strategy_config, last_run_at
        FROM model_registry
        ORDER BY last_run_at DESC
      `).all() as any[];

      return {
        models: rows.map((r: any) => ({
          modelId: r.model_id,
          displayName: r.display_name,
          provider: r.provider,
          totalRuns: r.total_runs,
          successRate: r.success_rate,
          avgLatencyMs: r.avg_latency_ms,
          strategyConfig: (() => { try { return JSON.parse(r.strategy_config || '{}'); } catch { return {}; } })(),
          lastRunAt: r.last_run_at,
        })),
        count: rows.length,
      };
    } catch {
      return { models: [], count: 0 };
    }
  });
}
