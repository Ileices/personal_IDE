// ============================================
// Models Routes - List available models + rate limits
// ============================================
import { FastifyInstance } from 'fastify';
import { MODELS, RATE_LIMITS } from '@personal-ide/shared';
import { rateLimiter } from '../services/llm/rateLimiter.js';
import { getAvailableModels } from '../services/llm/client.js';
import { createNanoClient, createOllamaClient, getClientFromDb } from '../services/llm/providers.js';
import type { ProviderType } from '@personal-ide/shared';

export async function modelsRoutes(app: FastifyInstance) {
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

    const classify = (message: string) => {
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
      return {
        success: true,
        modelId,
        classification: 'working',
        content,
        usage: response.usage || null,
      };
    } catch (err: any) {
      const message = err?.error?.message || err?.message || 'Unknown model test error';
      return reply.status(400).send({
        success: false,
        modelId,
        classification: classify(message),
        error: message,
      });
    }
  });
}
