// ============================================
// Feature Flags Route
// GET  /api/features  — current flag values
// PATCH /api/features — toggle flags at runtime
//
// Flags are persisted to app_kv so they survive server restarts.
// Keys: feature_flag:webSearchEnabled, feature_flag:meshEnabled, etc.
// ============================================
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { enableTool, disableTool, type ToolName } from '../services/agent/toolPolicyGate.js';
import { appConfig } from '../config.js';

type FlagKey = 'webSearchEnabled' | 'meshEnabled' | 'agentSpawnEnabled' | 'nanoTrainingEnabled';

const FLAG_KEYS: FlagKey[] = ['webSearchEnabled', 'meshEnabled', 'agentSpawnEnabled', 'nanoTrainingEnabled'];

const KV_PREFIX = 'feature_flag:';

// Runtime state — initialized from app_kv (with env fallback) at route registration
const runtimeFlags: Record<FlagKey, boolean> = {
  webSearchEnabled: appConfig.features.webSearchEnabled,
  meshEnabled: appConfig.features.meshEnabled,
  agentSpawnEnabled: appConfig.features.agentSpawnEnabled,
  nanoTrainingEnabled: appConfig.features.nanoTrainingEnabled,
};

function loadFlagsFromDb(db: Database.Database): void {
  for (const flag of FLAG_KEYS) {
    try {
      const row = db.prepare('SELECT value FROM app_kv WHERE key = ?').get(`${KV_PREFIX}${flag}`) as { value?: string } | undefined;
      if (row?.value !== undefined) {
        runtimeFlags[flag] = row.value === 'true';
      }
    } catch {
      // app_kv table may not exist during early startup; keep env default
    }
  }
}

function persistFlagToDb(db: Database.Database, flag: FlagKey, value: boolean): void {
  try {
    db.prepare(
      `INSERT INTO app_kv (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    ).run(`${KV_PREFIX}${flag}`, value ? 'true' : 'false');
  } catch {
    // Degraded: persistence failed, in-memory state still updated
  }
}

function syncToolGateFromFlags(): void {
  runtimeFlags.webSearchEnabled ? enableTool('web_search' as ToolName) : disableTool('web_search' as ToolName);
  runtimeFlags.meshEnabled ? enableTool('mesh_connect' as ToolName) : disableTool('mesh_connect' as ToolName);
  runtimeFlags.agentSpawnEnabled ? enableTool('spawn_agent' as ToolName) : disableTool('spawn_agent' as ToolName);
}

export async function featuresRoutes(app: FastifyInstance) {
  const db = (app as any).db as Database.Database;

  // On registration: load persisted flags from app_kv (override env defaults)
  if (db) loadFlagsFromDb(db);
  syncToolGateFromFlags();

  /** GET /api/features — return current feature flag state */
  app.get('/api/features', async () => {
    return { ...runtimeFlags };
  });

  /** PATCH /api/features — toggle one or more flags */
  app.patch<{
    Body: Partial<Record<FlagKey, boolean>>;
  }>('/api/features', async (request, reply) => {
    const body = request.body ?? {};

    for (const key of Object.keys(body)) {
      if (!FLAG_KEYS.includes(key as FlagKey)) {
        return reply.status(400).send({ error: `Unknown feature flag: ${key}` });
      }
      const value = (body as any)[key];
      if (typeof value !== 'boolean') {
        return reply.status(400).send({ error: `Flag ${key} must be boolean` });
      }
    }

    const reqDb = (request.server as any).db as Database.Database | undefined;

    for (const flag of FLAG_KEYS) {
      if (typeof body[flag] === 'boolean') {
        runtimeFlags[flag] = body[flag]!;
        if (reqDb) persistFlagToDb(reqDb, flag, body[flag]!);
      }
    }

    // Sync ToolPolicyGate for tools it knows about
    runtimeFlags.webSearchEnabled ? enableTool('web_search') : disableTool('web_search');
    runtimeFlags.meshEnabled ? enableTool('mesh_connect') : disableTool('mesh_connect');
    runtimeFlags.agentSpawnEnabled ? enableTool('spawn_agent') : disableTool('spawn_agent');
    // nanoTrainingEnabled is not a ToolPolicyGate ToolName — observationTrainer reads it via HTTP

    return { ...runtimeFlags };
  });
}
