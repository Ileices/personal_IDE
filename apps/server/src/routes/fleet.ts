// ============================================
// Fleet Routes — Multi-agent orchestration API
// Start/stop/monitor a fleet of parallel agents
// ============================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AgentFleet, type FleetConfig, type FleetExecutionMode, type AgentRole } from '../services/agent/fleet.js';
import type { ProviderType } from '@personal-ide/shared';
import { getModel, extractProviderFromModelId, PROVIDERS } from '@personal-ide/shared';
import { appConfig } from '../config.js';
import { MemoryService } from '../services/memory/index.js';

let activeFleet: AgentFleet | null = null;

const LOCAL_PROVIDER_SET = new Set<ProviderType>(['ollama', 'lmstudio', 'nano']);
const FLEET_ROLES: AgentRole[] = ['lead', 'implementer', 'debugger', 'tester', 'reviewer', 'documenter'];

function normalizeModelPool(pool?: string[]): string[] {
  if (!pool?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const model of pool) {
    const trimmed = model.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function normalizeRoleOverrides(
  input?: Record<string, string>
): Partial<Record<AgentRole, string>> | undefined {
  if (!input) return undefined;

  const out: Partial<Record<AgentRole, string>> = {};
  const validRoles = new Set(FLEET_ROLES);
  for (const [role, model] of Object.entries(input)) {
    if (!validRoles.has(role as AgentRole)) continue;
    const trimmed = model.trim();
    if (!trimmed) continue;
    out[role as AgentRole] = trimmed;
  }

  return Object.keys(out).length ? out : undefined;
}

function inferExecutionMode(
  requested: FleetExecutionMode | undefined,
  defaultProvider: ProviderType,
  localModelPool: string[],
  cloudModelPool: string[]
): FleetExecutionMode {
  if (requested) return requested;

  const defaultIsLocal = LOCAL_PROVIDER_SET.has(defaultProvider);
  const hasLocal = localModelPool.length > 0 || defaultIsLocal;
  const hasCloud = cloudModelPool.length > 0 || !defaultIsLocal;
  if (hasLocal && hasCloud) return 'hybrid';
  return hasLocal ? 'local' : 'cloud';
}

export async function fleetRoutes(app: FastifyInstance) {
  const db = (app as any).db;
  const memory = new MemoryService(db);

  // --- POST /api/fleet/start — Launch a multi-agent fleet ---
  app.post('/start', async (req: FastifyRequest, reply: FastifyReply) => {
    if (activeFleet && activeFleet.getStatus().state === 'running') {
      return reply.status(409).send({ error: 'A fleet is already running. Stop it first.' });
    }

    const body = req.body as {
      projectId: string;
      task: string;
      model?: string;
      agentCount?: number;
      continuousMode?: boolean;
      cooldownMs?: number;
      bypassRateLimits?: boolean;
      enableSmartChunking?: boolean;
      provider?: ProviderType;
      executionMode?: FleetExecutionMode;
      localModelPool?: string[];
      cloudModelPool?: string[];
      roleModelOverrides?: Record<string, string>;
      contextWindow?: number;
      maxIterationsPerAgent?: number;
      enableSubAgents?: boolean;
    };

    if (!body.projectId || !body.task) {
      return reply.status(400).send({ error: 'projectId and task are required' });
    }

    const project = memory.getProject(body.projectId);
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const modelStr = body.model || 'openai/gpt-4.1';
    // Detect provider from model
    const provider: ProviderType = body.provider || (extractProviderFromModelId(modelStr) as ProviderType);
    const localModelPool = normalizeModelPool(body.localModelPool);
    const cloudModelPool = normalizeModelPool(body.cloudModelPool);
    const roleModelOverrides = normalizeRoleOverrides(body.roleModelOverrides);
    const executionMode = inferExecutionMode(body.executionMode, provider, localModelPool, cloudModelPool);

    // Auto-detect max agents if not specified
    const capacity = AgentFleet.detectCapacity();
    const maxAgents = capacity.maxAgents;
    const requestedAgents = body.agentCount || maxAgents;
    const agentCount = Math.min(requestedAgents, maxAgents);

    const fleetConfig: FleetConfig = {
      projectId: body.projectId,
      projectRoot: project.rootPath,
      masterTask: body.task,
      model: modelStr,
      provider,
      agentCount,
      continuousMode: body.continuousMode ?? true,
      cooldownMs: body.cooldownMs ?? 5000,
      bypassRateLimits: body.bypassRateLimits ?? (provider === 'ollama'),
      enableSmartChunking: body.enableSmartChunking ?? true,
      executionMode,
      localModelPool,
      cloudModelPool,
      roleModelOverrides,
      contextWindow: body.contextWindow || getModel(modelStr)?.maxInputTokens || appConfig.contextDefaults.unknownModelContext,
      maxIterationsPerAgent: body.maxIterationsPerAgent,
      enableSubAgents: body.enableSubAgents ?? false,
    };

    activeFleet = new AgentFleet(db, fleetConfig);

    // Start in background
    activeFleet.start().catch((err: any) => {
      console.error('Fleet error:', err);
    });

    return {
      success: true,
      fleetId: activeFleet.getStatus().fleetId,
      agentCount,
      executionMode,
      maxDetected: maxAgents,
      status: activeFleet.getStatus(),
    };
  });

  // --- POST /api/fleet/stop — Stop all agents ---
  app.post('/stop', async () => {
    if (activeFleet) {
      activeFleet.stop();
      return { success: true, status: activeFleet.getStatus() };
    }
    return { success: true, message: 'No active fleet' };
  });

  // --- POST /api/fleet/pause — Pause all agents ---
  app.post('/pause', async () => {
    if (activeFleet) {
      activeFleet.pauseAll();
      return { success: true, status: activeFleet.getStatus() };
    }
    return { success: false, message: 'No active fleet' };
  });

  // --- POST /api/fleet/resume — Resume all agents ---
  app.post('/resume', async () => {
    if (activeFleet) {
      activeFleet.resumeAll();
      return { success: true, status: activeFleet.getStatus() };
    }
    return { success: false, message: 'No active fleet' };
  });

  // --- GET /api/fleet/status — Get fleet status with all agent details ---
  app.get('/status', async () => {
    if (activeFleet) {
      return { active: true, ...activeFleet.getStatus() };
    }
    return { active: false, state: 'idle' };
  });

  // --- GET /api/fleet/max-agents — Detect max agents for this machine ---
  app.get('/max-agents', async () => {
    const capacity = AgentFleet.detectCapacity();
    return {
      maxAgents: capacity.maxAgents,
      cpuCount: capacity.cpuCount,
      totalMemoryGB: Math.round(capacity.totalMemoryGB),
      freeMemoryGB: Math.round(capacity.freeMemoryGB),
      gpuCount: capacity.gpuCount,
      recommendedLocalAgents: capacity.recommendedLocalAgents,
      recommendedHybridAgents: capacity.recommendedHybridAgents,
    };
  });

  // --- GET /api/fleet/capacity — Full capacity and provider readiness snapshot ---
  app.get('/capacity', async () => {
    const capacity = AgentFleet.detectCapacity();

    const enabledRows = db
      .prepare('SELECT provider_id, enabled, api_key_encrypted FROM provider_configs WHERE enabled = 1')
      .all() as Array<{ provider_id: string; enabled: number; api_key_encrypted: string | null }>;
    const enabledProviders = new Set(enabledRows.map(r => r.provider_id));

    const authRow = db.prepare('SELECT id FROM auth_tokens WHERE is_active = 1 LIMIT 1').get() as { id?: string } | undefined;
    if (authRow?.id) enabledProviders.add('github');

    const localProviders = PROVIDERS.filter(p => p.isLocal).map(p => p.id);
    const cloudProviders = PROVIDERS.filter(p => !p.isLocal).map(p => p.id);
    const configuredLocalProviders = localProviders.filter(p => enabledProviders.has(p));
    const configuredCloudProviders = cloudProviders.filter(p => enabledProviders.has(p));

    return {
      ...capacity,
      executionModes: {
        local: configuredLocalProviders.length > 0,
        cloud: configuredCloudProviders.length > 0,
        hybrid: configuredLocalProviders.length > 0 && configuredCloudProviders.length > 0,
      },
      configuredProviders: {
        local: configuredLocalProviders,
        cloud: configuredCloudProviders,
      },
    };
  });

  // --- POST /api/fleet/message — Send message to all or specific agent ---
  app.post('/message', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!activeFleet) {
      return reply.status(404).send({ error: 'No active fleet' });
    }

    const body = req.body as { message: string; agentId?: string; priority?: 'normal' | 'high' };
    if (!body.message?.trim()) {
      return reply.status(400).send({ error: 'message is required' });
    }

    activeFleet.broadcastMessage(body.message.trim(), body.agentId, body.priority || 'high');
    return { success: true };
  });

  // --- POST /api/fleet/agent/:agentId/pause ---
  app.post('/agent/:agentId/pause', async (req: FastifyRequest) => {
    if (!activeFleet) return { success: false, message: 'No active fleet' };
    const { agentId } = req.params as { agentId: string };
    activeFleet.pauseAgent(agentId);
    return { success: true };
  });

  // --- POST /api/fleet/agent/:agentId/resume ---
  app.post('/agent/:agentId/resume', async (req: FastifyRequest) => {
    if (!activeFleet) return { success: false, message: 'No active fleet' };
    const { agentId } = req.params as { agentId: string };
    activeFleet.resumeAgent(agentId);
    return { success: true };
  });

  // --- POST /api/fleet/agent/:agentId/stop ---
  app.post('/agent/:agentId/stop', async (req: FastifyRequest) => {
    if (!activeFleet) return { success: false, message: 'No active fleet' };
    const { agentId } = req.params as { agentId: string };
    activeFleet.stopAgent(agentId);
    return { success: true };
  });

  // --- GET /api/fleet/stream — SSE stream of all fleet events ---
  app.get('/stream', async (req: FastifyRequest, reply: FastifyReply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    if (!activeFleet) {
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', error: 'No active fleet' })}\n\n`);
      reply.raw.end();
      return;
    }

    const unsubscribe = activeFleet.onEvent((event: any) => {
      try {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        unsubscribe();
      }
    });

    req.raw.on('close', () => {
      unsubscribe();
    });
  });

  // --- GET /api/fleet/ws — WebSocket stream of all fleet events ---
  app.get('/ws', { websocket: true }, (socket: any, _req: FastifyRequest) => {
    const status = activeFleet ? { type: 'status', ...activeFleet.getStatus() } : { type: 'status', state: 'idle' };
    socket.send(JSON.stringify(status));

    const heartbeat = setInterval(() => {
      try { socket.send(JSON.stringify({ type: 'heartbeat', ts: Date.now() })); }
      catch { clearInterval(heartbeat); }
    }, 15_000);

    let unsubscribe: (() => void) | null = null;

    if (activeFleet) {
      unsubscribe = activeFleet.onEvent((event: any) => {
        try { socket.send(JSON.stringify(event)); }
        catch { unsubscribe?.(); }
      });
    }

    socket.on('message', (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'subscribe' && activeFleet && !unsubscribe) {
          unsubscribe = activeFleet.onEvent((event: any) => {
            try { socket.send(JSON.stringify(event)); }
            catch { unsubscribe?.(); }
          });
        }
      } catch { /* ignore bad messages */ }
    });

    socket.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe?.();
    });
  });
}
