// ============================================
// Agent Routes - Start/stop/pause agent loop
// ============================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { EnhancedAgentLoop } from '../services/agent/enhancedLoop.js';
import type { AgentConfig, ProviderType } from '@personal-ide/shared';
import { getModel, extractProviderFromModelId } from '@personal-ide/shared';
import { appConfig } from '../config.js';
import { MemoryService } from '../services/memory/index.js';

// Active agent loop (singleton - one loop at a time)
let activeAgent: EnhancedAgentLoop | null = null;

/** Cleanup active agent's resources (called by graceful shutdown) */
export function destroyActiveAgent(): void {
  if (activeAgent) {
    activeAgent.stop();
    activeAgent = null;
  }
}

export async function agentRoutes(app: FastifyInstance) {
  const db = (app as any).db;
  const memory = new MemoryService(db);

  // --- POST /api/agent/start - Start agent loop ---
  app.post('/start', async (req: FastifyRequest, reply: FastifyReply) => {
    if (activeAgent && !['idle', 'complete', 'error'].includes(activeAgent.getStatus().state)) {
      return reply.status(409).send({ error: 'Agent is already running. Stop it first.' });
    }

    const body = req.body as {
      projectId: string;
      task: string;
      model?: string;
      maxIterations?: number;
      stepDelayMs?: number;
      autoApproveChanges?: boolean;
      autoAnswerQuestions?: boolean;
      // New options
      continuousMode?: boolean;
      cooldownMs?: number;
      bypassRateLimits?: boolean;
      enableSmartChunking?: boolean;
      provider?: ProviderType;
      contextWindow?: number;
      checkpointEvery?: number;
      autoFixErrors?: boolean;
      autoRunTests?: boolean;
      analyzeCodebase?: boolean;
    };

    if (!body.projectId || !body.task) {
      return reply.status(400).send({ error: 'projectId and task are required' });
    }

    const project = memory.getProject(body.projectId);
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const modelStr = body.model || 'openai/gpt-4.1';
    // Detect provider from model string (e.g. "nano/nano-sea" -> "nano")
    const provider: ProviderType = body.provider || (extractProviderFromModelId(modelStr) as ProviderType);

    const config = {
      maxIterations: body.maxIterations || appConfig.agent.maxIterations,
      stepDelayMs: body.stepDelayMs || appConfig.agent.stepDelayMs,
      maxTokensPerStep: appConfig.agent.maxTokensPerStep,
      autoApproveChanges: body.autoApproveChanges ?? true,
      autoAnswerQuestions: body.autoAnswerQuestions ?? true,
      model: modelStr,
      projectRoot: project.rootPath,
      // New options
      continuousMode: body.continuousMode ?? false,
      cooldownMs: body.cooldownMs ?? 0,
      bypassRateLimits: body.bypassRateLimits ?? false,
      enableSmartChunking: body.enableSmartChunking ?? true,
      // Enhanced options
      provider,
      contextWindow: body.contextWindow || getModel(modelStr)?.maxInputTokens || appConfig.contextDefaults.unknownModelContext,
      checkpointEvery: body.checkpointEvery ?? 5,
      autoFixErrors: body.autoFixErrors ?? true,
      autoRunTests: body.autoRunTests ?? true,
      analyzeCodebase: body.analyzeCodebase ?? true,
    };

    activeAgent = new EnhancedAgentLoop(db, config);

    // Start in background (don't await)
    activeAgent.start(body.projectId, body.task).catch((err: any) => {
      console.error('Agent loop error:', err);
    });

    return { success: true, status: activeAgent.getStatus() };
  });

  // --- POST /api/agent/stop ---
  app.post('/stop', async () => {
    if (activeAgent) {
      activeAgent.stop();
      return { success: true, status: activeAgent.getStatus() };
    }
    return { success: true, message: 'No active agent' };
  });

  // --- POST /api/agent/pause ---
  app.post('/pause', async () => {
    if (activeAgent) {
      activeAgent.pause();
      return { success: true, status: activeAgent.getStatus() };
    }
    return { success: false, message: 'No active agent' };
  });

  // --- POST /api/agent/resume ---
  app.post('/resume', async () => {
    if (activeAgent) {
      activeAgent.resume();
      return { success: true, status: activeAgent.getStatus() };
    }
    return { success: false, message: 'No active agent' };
  });

  // --- GET /api/agent/status ---
  app.get('/status', async () => {
    if (activeAgent) {
      return { active: true, status: activeAgent.getStatus() };
    }
    return { active: false };
  });

  // --- GET /api/agent/stream - SSE stream of agent events ---
  app.get('/stream', async (req: FastifyRequest, reply: FastifyReply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    if (!activeAgent) {
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', error: 'No active agent' })}\n\n`);
      reply.raw.end();
      return;
    }

    const unsubscribe = activeAgent.onEvent((event: any) => {
      try {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        unsubscribe();
      }
    });

    // Clean up on disconnect
    req.raw.on('close', () => {
      unsubscribe();
    });
  });

  // --- GET /api/agent/ws - WebSocket stream of agent events ---
  app.get('/ws', { websocket: true }, (socket: any, _req: FastifyRequest) => {
    // Send current status immediately
    const status = activeAgent ? { type: 'status', ...activeAgent.getStatus() } : { type: 'status', state: 'idle' };
    socket.send(JSON.stringify(status));

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      try { socket.send(JSON.stringify({ type: 'heartbeat', ts: Date.now() })); }
      catch { clearInterval(heartbeat); }
    }, 15_000);

    let unsubscribe: (() => void) | null = null;

    if (activeAgent) {
      unsubscribe = activeAgent.onEvent((event: any) => {
        try { socket.send(JSON.stringify(event)); }
        catch { unsubscribe?.(); }
      });
    }

    // Client can send JSON commands over the socket
    socket.on('message', (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'subscribe' && activeAgent && !unsubscribe) {
          unsubscribe = activeAgent.onEvent((event: any) => {
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

  // --- GET /api/agent/runs/:projectId - Get run history ---
  app.get('/runs/:projectId', async (req: FastifyRequest) => {
    const { projectId } = req.params as { projectId: string };
    const runs = db.prepare(
      'SELECT * FROM agent_runs WHERE project_id = ? ORDER BY started_at DESC LIMIT 50'
    ).all(projectId);
    return { runs };
  });

  // --- POST /api/agent/message - Queue a user message during an active run ---
  app.post('/message', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!activeAgent) {
      return reply.status(404).send({ error: 'No active agent. Start an agent first.' });
    }

    const status = activeAgent.getStatus();
    if (['idle', 'complete', 'error'].includes(status.state)) {
      return reply.status(409).send({ error: 'Agent is not running. Current state: ' + status.state });
    }

    const body = req.body as { message: string; priority?: 'normal' | 'high' };
    if (!body.message || !body.message.trim()) {
      return reply.status(400).send({ error: 'message is required' });
    }

    const msgId = activeAgent.queueMessage(body.message.trim(), body.priority || 'normal');
    return {
      success: true,
      messageId: msgId,
      queueSize: activeAgent.getQueueSize(),
    };
  });
}
