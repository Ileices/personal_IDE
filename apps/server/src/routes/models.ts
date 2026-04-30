// ============================================
// Models Routes - List available models + rate limits
// ============================================
import { FastifyInstance } from 'fastify';
import { MODELS, RATE_LIMITS } from '@personal-ide/shared';
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

    const slashIdx = modelId.indexOf('/');
    const provider = (slashIdx > 0 ? modelId.slice(0, slashIdx) : 'github') as ProviderType;
    const providerModelId = slashIdx > 0 ? modelId.slice(slashIdx + 1) : modelId;

    const classify = (message: string): TestClassification => {
      const msg = message.toLowerCase();
      if (msg.includes('not configured') || msg.includes('no api key') || msg.includes('no github token')) return 'not_configured';
      if (msg.includes('not installed')) return 'not_installed';
      if (msg.includes('rate') && msg.includes('limit')) return 'rate_limited';
      if (msg.includes('quota') || msg.includes('insufficient') || msg.includes('billing') || msg.includes('credit')) return 'cost_blocked';
      if (msg.includes('not found') || msg.includes('does not exist') || msg.includes('404') || msg.includes('deprecated') || msg.includes('discontinued')) return 'discontinued';
      return 'error';
    };

    try {
      if (provider === 'ollama') {
        const client = createOllamaClient();
        const baseURL = ((client as any).baseURL || '').replace(/\/v1\/?$/, '');
        const tagsRes = await fetch(`${baseURL}/api/tags`, { signal: AbortSignal.timeout(8000) });
        if (!tagsRes.ok) throw new Error(`Ollama unavailable: HTTP ${tagsRes.status}`);
        const tagsData = await tagsRes.json() as any;
        const installedNames = new Set((tagsData.models || []).map((m: any) => String(m.name)));
        if (!installedNames.has(providerModelId)) {
          upsertModelRegistryFromTest(db, modelId, provider, false, 'not_installed', `Model ${providerModelId} is not installed in Ollama`);
          return reply.status(400).send({
            success: false,
            modelId,
            classification: 'not_installed',
            error: `Model ${providerModelId} is not installed in Ollama`,
          });
        }
      }

      const client = provider === 'ollama'
        ? createOllamaClient()
        : provider === 'nano'
        ? createNanoClient()
        : getClientFromDb((app as any).db, provider);

      if (!client) {
        upsertModelRegistryFromTest(db, modelId, provider, false, 'not_configured', `Provider ${provider} is not configured`);
        return reply.status(400).send({
          success: false,
          modelId,
          classification: 'not_configured',
          error: `Provider ${provider} is not configured`,
        });
      }

      const response = await client.chat.completions.create({
        model: providerModelId,
        messages: [{ role: 'user', content: 'Reply with exactly OK' }],
        max_tokens: 5,
        temperature: 0,
      });

      const content = response.choices?.[0]?.message?.content || '';
      upsertModelRegistryFromTest(db, modelId, provider, true, 'working');
      return {
        success: true,
        modelId,
        classification: 'working',
        content,
        usage: response.usage || null,
      };
    } catch (err: any) {
      const message = err?.error?.message || err?.message || 'Unknown model test error';
      const classification = classify(message);
      upsertModelRegistryFromTest(db, modelId, provider, false, classification, message);
      return reply.status(400).send({
        success: false,
        modelId,
        classification,
        error: message,
      });
    }
  });
}
