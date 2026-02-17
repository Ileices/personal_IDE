// ============================================
// Provider Management Routes
// List, enable/disable, configure AI providers
// ============================================
import type { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';
import { PROVIDERS } from '@personal-ide/shared';
import type { ProviderType } from '@personal-ide/shared';
import { fetchProviderModels, getClientFromDb, createOllamaClient, createProviderClient } from '../services/llm/providers.js';

export async function providersRoutes(app: FastifyInstance): Promise<void> {
  const db = (app as any).db;

  /** GET /api/providers - List all providers with status */
  app.get('/', async () => {
    // Get saved configs from DB
    const saved = db.prepare('SELECT * FROM provider_configs').all() as any[];
    const savedMap = new Map(saved.map((s: any) => [s.provider_id, s]));

    return PROVIDERS.map(p => {
      const config = savedMap.get(p.id);
      return {
        ...p,
        enabled: config?.enabled === 1 || false,
        hasApiKey: !!config?.api_key_encrypted,
        configuredAt: config?.updated_at || null,
      };
    });
  });

  /** POST /api/providers/:id/configure - Configure a provider */
  app.post<{ Params: { id: string }; Body: { apiKey?: string; baseUrl?: string; enabled?: boolean } }>(
    '/:id/configure',
    async (request, reply) => {
      const { id } = request.params;
      const { apiKey, baseUrl, enabled } = request.body;

      const provider = PROVIDERS.find(p => p.id === id);
      if (!provider) {
        return reply.status(404).send({ error: 'Provider not found' });
      }

      // Encrypt API key if provided
      let apiKeyEncrypted: string | null = null;
      if (apiKey) {
        const key = 'personal-ide-local-key-2026';
        const encrypted = Array.from(apiKey).map((c: string, i: number) =>
          c.charCodeAt(0) ^ key.charCodeAt(i % key.length)
        );
        apiKeyEncrypted = Buffer.from(encrypted).toString('base64');
      }

      // Upsert config
      const existing = db.prepare('SELECT id FROM provider_configs WHERE provider_id = ?').get(id);
      if (existing) {
        const updates: string[] = ['updated_at = datetime(\'now\')'];
        const values: any[] = [];

        if (apiKeyEncrypted !== null) {
          updates.push('api_key_encrypted = ?');
          values.push(apiKeyEncrypted);
        }
        if (baseUrl) {
          updates.push('base_url = ?');
          values.push(baseUrl);
        }
        if (enabled !== undefined) {
          updates.push('enabled = ?');
          values.push(enabled ? 1 : 0);
        }

        values.push(id);
        db.prepare(`UPDATE provider_configs SET ${updates.join(', ')} WHERE provider_id = ?`).run(...values);
      } else {
        db.prepare(
          'INSERT INTO provider_configs (id, provider_id, display_name, base_url, api_key_encrypted, enabled, requires_api_key, setup_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
          uuid(), id, provider.name,
          baseUrl || provider.baseURL,
          apiKeyEncrypted,
          enabled !== false ? 1 : 0,
          provider.requiresApiKey ? 1 : 0,
          provider.setupUrl
        );
      }

      return { success: true, providerId: id };
    }
  );

  /** POST /api/providers/:id/test - Test provider connection */
  app.post<{ Params: { id: string } }>('/:id/test', async (request, reply) => {
    const { id } = request.params;

    try {
      const client = getClientFromDb(db, id as ProviderType);
      if (!client) {
        return reply.status(400).send({ error: 'Provider not configured or no API key' });
      }

      const models = await fetchProviderModels(client, id as ProviderType);
      return {
        success: true,
        modelCount: models.length,
        models: models.slice(0, 10).map(m => ({ id: m.id, name: m.name })),
      };
    } catch (err: any) {
      return reply.status(400).send({
        success: false,
        error: err.message,
      });
    }
  });

  /** GET /api/providers/:id/models - List models for a provider */
  app.get<{ Params: { id: string } }>('/:id/models', async (request, reply) => {
    const { id } = request.params;

    try {
      const client = getClientFromDb(db, id as ProviderType);
      if (!client) {
        // Special case: Ollama doesn't need DB config, try directly
        if (id === 'ollama') {
          const ollamaClient = createOllamaClient();
          const models = await fetchProviderModels(ollamaClient, 'ollama');
          return { models };
        }
        return reply.status(400).send({ error: 'Provider not configured' });
      }

      const models = await fetchProviderModels(client, id as ProviderType);
      return { models };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  /** GET /api/providers/all-models - List all models from all enabled providers */
  app.get('/all-models', async () => {
    const allModels: any[] = [];
    const errors: any[] = [];

    // Only try GitHub if there's actually a valid token — don't waste API calls
    const authRow = db.prepare('SELECT token_encrypted FROM auth_tokens WHERE is_active = 1').get() as any;
    if (authRow?.token_encrypted) {
      try {
        const ghClient = getClientFromDb(db, 'github');
        if (ghClient) {
          const models = await fetchProviderModels(ghClient, 'github');
          allModels.push(...models);
        }
      } catch (err: any) {
        errors.push({ provider: 'github', error: err.message });
      }
    } else {
      errors.push({ provider: 'github', error: 'No GitHub token configured. Go to Provider Settings → GitHub to add your PAT.' });
    }

    // Try Ollama (no API key needed)
    try {
      const ollamaClient = createOllamaClient();
      const models = await fetchProviderModels(ollamaClient, 'ollama');
      allModels.push(...models);
    } catch (err: any) {
      errors.push({ provider: 'ollama', error: err.message });
    }

    // Try all other enabled providers
    const enabled = db.prepare('SELECT * FROM provider_configs WHERE enabled = 1').all() as any[];
    for (const config of enabled) {
      if (config.provider_id === 'github' || config.provider_id === 'ollama') continue;
      try {
        const client = getClientFromDb(db, config.provider_id as ProviderType);
        if (client) {
          const models = await fetchProviderModels(client, config.provider_id as ProviderType);
          allModels.push(...models);
        }
      } catch (err: any) {
        errors.push({ provider: config.provider_id, error: err.message });
      }
    }

    return { models: allModels, errors };
  });

  /** DELETE /api/providers/:id - Disable/remove a provider config */
  app.delete<{ Params: { id: string } }>('/:id', async (request) => {
    const { id } = request.params;
    db.prepare('DELETE FROM provider_configs WHERE provider_id = ?').run(id);
    return { success: true };
  });
}
