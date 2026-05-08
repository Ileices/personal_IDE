// ============================================
// Feature Flags Route
// GET  /api/features  — current flag values
// PATCH /api/features — toggle flags at runtime
// ============================================
import type { FastifyInstance } from 'fastify';
import { enableTool, disableTool, type ToolName } from '../services/agent/toolPolicyGate.js';
import { appConfig } from '../config.js';

// Runtime state (in-memory; persisted via ToolPolicyGate enabledTools Set)
const runtimeFlags = {
  webSearchEnabled: appConfig.features.webSearchEnabled,
  meshEnabled: appConfig.features.meshEnabled,
  agentSpawnEnabled: appConfig.features.agentSpawnEnabled,
  nanoTrainingEnabled: appConfig.features.nanoTrainingEnabled,
};

// Sync initial env-driven flags into the ToolPolicyGate
if (runtimeFlags.webSearchEnabled) enableTool('web_search' as ToolName);
if (runtimeFlags.meshEnabled) enableTool('mesh_connect' as ToolName);
if (runtimeFlags.agentSpawnEnabled) enableTool('spawn_agent' as ToolName);

export async function featuresRoutes(app: FastifyInstance) {
  /** GET /api/features — return current feature flag state */
  app.get('/api/features', async () => {
    return { ...runtimeFlags };
  });

  /** PATCH /api/features — toggle one or more flags */
  app.patch<{
    Body: Partial<typeof runtimeFlags>;
  }>('/api/features', async (request, reply) => {
    const body = request.body ?? {};
    const allowed = ['webSearchEnabled', 'meshEnabled', 'agentSpawnEnabled', 'nanoTrainingEnabled'];

    for (const key of Object.keys(body)) {
      if (!allowed.includes(key)) {
        return reply.status(400).send({ error: `Unknown feature flag: ${key}` });
      }
      const value = (body as any)[key];
      if (typeof value !== 'boolean') {
        return reply.status(400).send({ error: `Flag ${key} must be boolean` });
      }
    }

    if (typeof body.webSearchEnabled === 'boolean') {
      runtimeFlags.webSearchEnabled = body.webSearchEnabled;
      body.webSearchEnabled ? enableTool('web_search') : disableTool('web_search');
    }
    if (typeof body.meshEnabled === 'boolean') {
      runtimeFlags.meshEnabled = body.meshEnabled;
      body.meshEnabled ? enableTool('mesh_connect') : disableTool('mesh_connect');
    }
    if (typeof body.agentSpawnEnabled === 'boolean') {
      runtimeFlags.agentSpawnEnabled = body.agentSpawnEnabled;
      body.agentSpawnEnabled ? enableTool('spawn_agent') : disableTool('spawn_agent');
    }
    if (typeof body.nanoTrainingEnabled === 'boolean') {
      runtimeFlags.nanoTrainingEnabled = body.nanoTrainingEnabled;
      // nanoTraining is not a ToolPolicyGate ToolName — handled in observationTrainer
    }

    return { ...runtimeFlags };
  });
}
