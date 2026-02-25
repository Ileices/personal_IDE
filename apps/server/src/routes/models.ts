// ============================================
// Models Routes - List available models + rate limits
// ============================================
import { FastifyInstance } from 'fastify';
import { MODELS, RATE_LIMITS } from '@personal-ide/shared';
import { rateLimiter } from '../services/llm/rateLimiter.js';
import { getAvailableModels } from '../services/llm/client.js';

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
}
