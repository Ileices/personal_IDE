// ============================================
// Provider Management Routes
// List, enable/disable, configure AI providers
// ============================================
import type { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';
import { PROVIDERS } from '@personal-ide/shared';
import type { ProviderType } from '@personal-ide/shared';
import { fetchProviderModels, getClientFromDb, createOllamaClient, createNanoClient, createProviderClient } from '../services/llm/providers.js';
import { appConfig } from '../config.js';
import { encrypt } from '../services/crypto/index.js';

export async function providersRoutes(app: FastifyInstance): Promise<void> {
  const db = (app as any).db;

  const loadProviderConfigMap = () => {
    const saved = db.prepare('SELECT * FROM provider_configs').all() as any[];
    return new Map(saved.map((row: any) => [row.provider_id, row]));
  };

  /** GET /api/providers - List all providers with status */
  app.get('/', async () => {
    // Get saved configs from DB
    const savedMap = loadProviderConfigMap();

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
        apiKeyEncrypted = encrypt(apiKey, appConfig.security.encryptKey);
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
        // Special case: Nano Sea doesn't need DB config, try directly
        if (id === 'nano') {
          const nanoClient = createNanoClient();
          const models = await fetchProviderModels(nanoClient, 'nano');
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
    const providerConfigMap = loadProviderConfigMap();
    const isProviderEnabled = (providerId: string, defaultEnabled = false) => {
      const config = providerConfigMap.get(providerId);
      return config ? config.enabled === 1 : defaultEnabled;
    };

    // Always try GitHub models when any valid token source exists (auth_tokens or provider_configs).
    try {
      const ghClient = getClientFromDb(db, 'github');
      if (ghClient) {
        const models = await fetchProviderModels(ghClient, 'github');
        allModels.push(...models);
      } else {
        errors.push({ provider: 'github', error: 'No GitHub token configured. Go to Provider Settings → GitHub to add your PAT.' });
      }
    } catch (err: any) {
      errors.push({ provider: 'github', error: err.message });
    }

    // Try Ollama (no API key needed) when enabled in settings
    if (isProviderEnabled('ollama')) {
      try {
        const ollamaClient = createOllamaClient();
        const models = await fetchProviderModels(ollamaClient, 'ollama');
        allModels.push(...models);
      } catch (err: any) {
        errors.push({ provider: 'ollama', error: err.message });
      }
    }

    // Try Nano Sea (no API key needed) when enabled in settings
    if (isProviderEnabled('nano')) {
      try {
        const nanoClient = createNanoClient();
        const models = await fetchProviderModels(nanoClient, 'nano');
        allModels.push(...models);
      } catch (err: any) {
        errors.push({ provider: 'nano', error: err.message });
      }
    }

    // Try all other enabled providers
    const enabled = Array.from(providerConfigMap.values()).filter((config: any) => config.enabled === 1);
    for (const config of enabled) {
      if (config.provider_id === 'github' || config.provider_id === 'ollama' || config.provider_id === 'nano') continue;
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

  // ─── Ollama Management Endpoints ───────────────────────────────────────────

  /** GET /api/providers/ollama/models — list installed Ollama models */
  app.get('/ollama/models', async (_req, reply) => {
    try {
      const ollamaBaseUrl = (() => {
        const row = db.prepare("SELECT base_url FROM provider_configs WHERE provider_id = 'ollama'").get() as any;
        return (row?.base_url || appConfig.services.ollamaUrl).replace(/\/v1\/?$/, '');
      })();
      const res = await fetch(`${ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return reply.status(res.status).send({ error: 'Ollama not responding' });
      const data = await res.json();
      return {
        models: (data.models || []).map((m: any) => ({
          name: m.name,
          size: m.size,
          modifiedAt: m.modified_at,
          digest: m.digest?.slice(0, 12),
        })),
      };
    } catch (err: any) {
      return reply.status(503).send({ error: `Ollama unavailable: ${err.message}` });
    }
  });

  /** POST /api/providers/ollama/pull — pull/download a model (streams progress) */
  app.post<{ Body: { model: string } }>('/ollama/pull', async (request, reply) => {
    const { model } = request.body;
    if (!model || typeof model !== 'string' || model.trim().length === 0) {
      return reply.status(400).send({ error: 'model name is required' });
    }
    // Sanitize: only allow alphanumeric, colon, hyphen, dot, underscore, slash
    if (!/^[a-zA-Z0-9:.\-_/]+$/.test(model)) {
      return reply.status(400).send({ error: 'Invalid model name' });
    }

    const ollamaBaseUrl = (() => {
      const row = db.prepare("SELECT base_url FROM provider_configs WHERE provider_id = 'ollama'").get() as any;
      return (row?.base_url || appConfig.services.ollamaUrl).replace(/\/v1\/?$/, '');
    })();

    reply.raw.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    });

    try {
      const ollamaRes = await fetch(`${ollamaBaseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model, stream: true }),
        signal: AbortSignal.timeout(30 * 60_000), // 30 min for large models
      });

      if (!ollamaRes.ok) {
        const body = await ollamaRes.text();
        reply.raw.write(JSON.stringify({ error: body || 'Pull failed' }) + '\n');
        reply.raw.end();
        return;
      }

      const reader = ollamaRes.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          reply.raw.write(decoder.decode(value, { stream: true }));
        }
      }
    } catch (err: any) {
      reply.raw.write(JSON.stringify({ error: err.message }) + '\n');
    }

    reply.raw.end();
  });

  /** DELETE /api/providers/ollama/delete — delete a locally installed model */
  app.delete<{ Body: { model: string } }>('/ollama/delete', async (request, reply) => {
    const { model } = request.body;
    if (!model || typeof model !== 'string') {
      return reply.status(400).send({ error: 'model name is required' });
    }
    if (!/^[a-zA-Z0-9:.\-_/]+$/.test(model)) {
      return reply.status(400).send({ error: 'Invalid model name' });
    }

    const ollamaBaseUrl = (() => {
      const row = db.prepare("SELECT base_url FROM provider_configs WHERE provider_id = 'ollama'").get() as any;
      return (row?.base_url || appConfig.services.ollamaUrl).replace(/\/v1\/?$/, '');
    })();

    try {
      const res = await fetch(`${ollamaBaseUrl}/api/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Delete failed' }));
        return reply.status(400).send({ error: err.error || 'Delete failed' });
      }
      return { success: true };
    } catch (err: any) {
      return reply.status(503).send({ error: `Ollama unavailable: ${err.message}` });
    }
  });
}
