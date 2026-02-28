// ============================================
// Fleet Routes — Multi-agent orchestration API
// Start/stop/monitor a fleet of parallel agents
// ============================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AgentFleet, type FleetConfig } from '../services/agent/fleet.js';
import type { ProviderType } from '@personal-ide/shared';
import { getModel } from '@personal-ide/shared';
import { appConfig } from '../config.js';
import { MemoryService } from '../services/memory/index.js';

let activeFleet: AgentFleet | null = null;

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

    // Detect provider from model
    let provider: ProviderType = body.provider || 'github';
    const modelStr = body.model || 'openai/gpt-4.1';
    const slashIdx = modelStr.indexOf('/');
    if (slashIdx > 0 && !body.provider) {
      const prefix = modelStr.substring(0, slashIdx);
      const knownProviders: ProviderType[] = ['github', 'ollama', 'groq', 'huggingface', 'cohere', 'mistral', 'gemini', 'together', 'openrouter', 'lmstudio'];
      if (knownProviders.includes(prefix as ProviderType)) {
        provider = prefix as ProviderType;
      }
    }

    // Auto-detect max agents if not specified
    const maxAgents = AgentFleet.detectMaxAgents();
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
    const maxAgents = AgentFleet.detectMaxAgents();
    const os = await import('os');
    return {
      maxAgents,
      cpuCount: os.cpus().length,
      totalMemoryGB: Math.round(os.totalmem() / (1024 ** 3)),
      freeMemoryGB: Math.round(os.freemem() / (1024 ** 3)),
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
