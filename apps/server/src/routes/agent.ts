// ============================================
// Agent Routes - Start/stop/pause agent loop
// ============================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { EnhancedAgentLoop } from '../services/agent/enhancedLoop.js';
import type { AgentConfig, ProviderType } from '@personal-ide/shared';
import { getModel, extractProviderFromModelId } from '@personal-ide/shared';
import { appConfig } from '../config.js';
import { MemoryService } from '../services/memory/index.js';
import { resolveModelStrategy } from '../services/modelStrategy.js';
import { rebuildSymbolEmbeddings, reindexSiliconTests } from '../services/siliconFactory/index.js';
import { listAllFiles } from '../services/filesystem/index.js';
import { rateLimiter } from '../services/llm/rateLimiter.js';

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

  type AgentProjectSettings = {
    useCorpusManifesto: boolean;
    autoIngestCorpus: boolean;
    autoProjectIntel: boolean;
    corpusPath: string;
    strategyTemplate: string;
    workflowMode: 'build_new' | 'import_refactor' | 'code_review' | 'scale_research';
    strictQualityGate: boolean;
  };

  const DEFAULT_PROJECT_SETTINGS: AgentProjectSettings = {
    useCorpusManifesto: true,
    autoIngestCorpus: true,
    autoProjectIntel: true,
    corpusPath: '',
    strategyTemplate: 'fullstack-balanced',
    workflowMode: 'build_new',
    strictQualityGate: true,
  };

  const getSettingsKey = (projectId: string) => `agent_loop:project_settings:${projectId}`;

  const loadProjectSettings = (projectId: string): AgentProjectSettings => {
    try {
      const row = db.prepare('SELECT value FROM app_kv WHERE key = ?').get(getSettingsKey(projectId)) as { value?: string } | undefined;
      if (!row?.value) return DEFAULT_PROJECT_SETTINGS;
      const parsed = JSON.parse(row.value) as Partial<AgentProjectSettings>;
      return {
        ...DEFAULT_PROJECT_SETTINGS,
        ...parsed,
      };
    } catch {
      return DEFAULT_PROJECT_SETTINGS;
    }
  };

  const saveProjectSettings = (projectId: string, patch: Partial<AgentProjectSettings>): AgentProjectSettings => {
    const current = loadProjectSettings(projectId);
    const next: AgentProjectSettings = {
      ...current,
      ...patch,
      corpusPath: String(patch.corpusPath ?? current.corpusPath ?? ''),
      workflowMode: (patch.workflowMode || current.workflowMode || 'build_new') as AgentProjectSettings['workflowMode'],
      strictQualityGate: patch.strictQualityGate ?? current.strictQualityGate,
    };
    db.prepare(
      `INSERT INTO app_kv (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    ).run(getSettingsKey(projectId), JSON.stringify(next));
    return next;
  };

  app.get('/project-settings/:projectId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = req.params as { projectId: string };
    const project = memory.getProject(projectId);
    if (!project) return reply.status(404).send({ error: 'Project not found' });
    return reply.send({ settings: loadProjectSettings(projectId) });
  });

  app.post('/project-settings/:projectId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = req.params as { projectId: string };
    const project = memory.getProject(projectId);
    if (!project) return reply.status(404).send({ error: 'Project not found' });
    const body = (req.body || {}) as Partial<AgentProjectSettings>;
    const settings = saveProjectSettings(projectId, body);
    return reply.send({ success: true, settings });
  });

  app.get('/project-intel/:projectId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = req.params as { projectId: string };
    const project = memory.getProject(projectId);
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const corpus = db.prepare(
      'SELECT file_count, total_tokens, updated_at, ingest_path FROM project_corpus WHERE project_id = ?'
    ).get(projectId) as { file_count?: number; total_tokens?: number; updated_at?: string; ingest_path?: string } | undefined;

    const runStateRows = db.prepare(
      'SELECT final_state, COUNT(*) AS c FROM agent_runs WHERE project_id = ? GROUP BY final_state'
    ).all(projectId) as Array<{ final_state: string; c: number }>;

    const runSummary = {
      total: 0,
      complete: 0,
      error: 0,
      runningLike: 0,
    };
    for (const row of runStateRows) {
      runSummary.total += Number(row.c || 0);
      if (row.final_state === 'complete') runSummary.complete += Number(row.c || 0);
      else if (row.final_state === 'error') runSummary.error += Number(row.c || 0);
      else runSummary.runningLike += Number(row.c || 0);
    }

    let suggestedJobs = { suggested: 0, implementing: 0, implemented: 0 };
    try {
      const rows = db.prepare(
        `SELECT implementation_status, COUNT(*) AS c
         FROM job_records
         GROUP BY implementation_status`
      ).all() as Array<{ implementation_status: string; c: number }>;
      for (const row of rows) {
        if (row.implementation_status === 'suggested') suggestedJobs.suggested = Number(row.c || 0);
        if (row.implementation_status === 'implementing') suggestedJobs.implementing = Number(row.c || 0);
        if (row.implementation_status === 'implemented') suggestedJobs.implemented = Number(row.c || 0);
      }
    } catch {
      // no-op if table is unavailable
    }

    let recentBlame = { failures24h: 0, successes24h: 0 };
    try {
      const fail = db.prepare(
        `SELECT COUNT(*) AS c
         FROM blame_records
         WHERE success = 0
           AND datetime(timestamp) >= datetime('now', '-1 day')`
      ).get() as { c: number };
      const ok = db.prepare(
        `SELECT COUNT(*) AS c
         FROM blame_records
         WHERE success = 1
           AND datetime(timestamp) >= datetime('now', '-1 day')`
      ).get() as { c: number };
      recentBlame = { failures24h: Number(fail?.c || 0), successes24h: Number(ok?.c || 0) };
    } catch {
      // no-op if table/columns unavailable
    }

    return reply.send({
      projectId,
      settings: loadProjectSettings(projectId),
      corpus: corpus || null,
      runs: runSummary,
      suggestedJobs,
      blame: recentBlame,
    });
  });

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
      fallbackModels?: string[];
      useCorpusManifesto?: boolean;
      autoProjectIntel?: boolean;
      autoIngestCorpus?: boolean;
      workflowMode?: AgentProjectSettings['workflowMode'];
      strictQualityGate?: boolean;
    };

    if (!body.projectId || !body.task) {
      return reply.status(400).send({ error: 'projectId and task are required' });
    }

    const project = memory.getProject(body.projectId);
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const savedSettings = loadProjectSettings(body.projectId);
    const useCorpusManifesto = body.useCorpusManifesto ?? savedSettings.useCorpusManifesto;
    const autoIngestCorpus = body.autoIngestCorpus ?? savedSettings.autoIngestCorpus;
    const autoProjectIntel = body.autoProjectIntel ?? savedSettings.autoProjectIntel;
    const workflowMode = body.workflowMode ?? savedSettings.workflowMode;
    const strictQualityGate = body.strictQualityGate ?? savedSettings.strictQualityGate;

    // Persist run-time toggles for future launches
    saveProjectSettings(body.projectId, {
      useCorpusManifesto,
      autoIngestCorpus,
      autoProjectIntel,
      workflowMode,
      strictQualityGate,
    });

    const modelStr = body.model || 'openai/gpt-4.1';
    const strategy = resolveModelStrategy(db, modelStr, body.fallbackModels);
    // Detect provider from model string (e.g. "nano/nano-sea" -> "nano")
    const provider: ProviderType = body.provider || (extractProviderFromModelId(strategy.primaryModel) as ProviderType);

    const config = {
      maxIterations: body.maxIterations || appConfig.agent.maxIterations,
      stepDelayMs: body.stepDelayMs || appConfig.agent.stepDelayMs,
      maxTokensPerStep: appConfig.agent.maxTokensPerStep,
      autoApproveChanges: body.autoApproveChanges ?? true,
      autoAnswerQuestions: body.autoAnswerQuestions ?? true,
      model: strategy.primaryModel,
      projectRoot: project.rootPath,
      fallbackModels: strategy.fallbackModels,
      // New options
      continuousMode: body.continuousMode ?? false,
      cooldownMs: body.cooldownMs ?? 0,
      bypassRateLimits: body.bypassRateLimits ?? false,
      enableSmartChunking: body.enableSmartChunking ?? true,
      // Enhanced options
      provider,
      contextWindow: body.contextWindow || getModel(strategy.primaryModel)?.maxInputTokens || appConfig.contextDefaults.unknownModelContext,
      checkpointEvery: body.checkpointEvery ?? 0,
      autoFixErrors: body.autoFixErrors ?? true,
      autoRunTests: body.autoRunTests ?? true,
      analyzeCodebase: body.analyzeCodebase ?? true,
    };

    let startTask = body.task;

    if (autoIngestCorpus) {
      try {
        const existing = db.prepare('SELECT manifesto FROM project_corpus WHERE project_id = ?').get(body.projectId) as { manifesto?: string } | undefined;
        const hasManifesto = String(existing?.manifesto || '').trim().length > 0;
        if (!hasManifesto) {
          const scanRoot = savedSettings.corpusPath?.trim() ? savedSettings.corpusPath.trim() : project.rootPath;
          const relFiles = listAllFiles(scanRoot, { maxFiles: 2500, maxMs: 3000 });
          const summary = [
            `Project: ${project.name}`,
            `Root: ${scanRoot}`,
            `Discovered files: ${relFiles.length}`,
            '',
            'Top-level file sample:',
            ...relFiles.slice(0, 120).map(f => `- ${f}`),
          ].join('\n');
          db.prepare(
            `INSERT INTO project_corpus (id, project_id, manifesto, file_count, total_tokens, ingest_path, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
             ON CONFLICT(id) DO UPDATE SET manifesto = excluded.manifesto, file_count = excluded.file_count, total_tokens = excluded.total_tokens, ingest_path = excluded.ingest_path, updated_at = datetime('now')`
          ).run(body.projectId, body.projectId, summary, relFiles.length, Math.ceil(summary.length / 4), scanRoot);
        }
      } catch {
        // best-effort bootstrap only
      }
    }

    if (useCorpusManifesto) {
      const row = db.prepare('SELECT manifesto FROM project_corpus WHERE project_id = ?').get(body.projectId) as { manifesto?: string } | undefined;
      const manifesto = String(row?.manifesto || '').trim();
      if (manifesto) {
        startTask = `${startTask}\n\n--- PROJECT CORPUS MANIFESTO ---\n${manifesto}\n--- END PROJECT CORPUS MANIFESTO ---\n\nUse this manifesto as the source-of-truth planning corpus and execute full build/test/run cycles.`;
      }
    }

    if (workflowMode === 'import_refactor') {
      startTask += '\n\nWORKFLOW MODE: IMPORT_REFACTOR_AND_EXPAND\nTreat this as an imported codebase migration/refactor. First map architecture, run diagnostics/tests, then fix, harden, and expand features without regressing behavior.';
    } else if (workflowMode === 'code_review') {
      startTask += '\n\nWORKFLOW MODE: CODE_REVIEW\nPrioritize bug/risk/regression discovery, then apply fixes with tests. Produce strict review findings before implementation.';
    } else if (workflowMode === 'scale_research') {
      startTask += '\n\nWORKFLOW MODE: SCALE_RESEARCH\nPrioritize architecture scalability, distributed execution, observability, and reproducible experiment pipelines.';
    }

    if (strictQualityGate) {
      startTask += '\n\nQUALITY GATE (STRICT): A change is not complete until build passes, relevant tests pass, and high-severity diagnostics are addressed. Avoid speculative/sloppy code.';
    }

    if (autoProjectIntel) {
      try {
        reindexSiliconTests(db, {
          project_id: body.projectId,
          project_root: project.rootPath,
        });
      } catch {
        // preflight best-effort
      }
      try {
        rebuildSymbolEmbeddings(db, {
          project_id: body.projectId,
        });
      } catch {
        // preflight best-effort
      }
    }

    activeAgent = new EnhancedAgentLoop(db, config);

    // Start in background (don't await)
    activeAgent.start(body.projectId, startTask).catch((err: any) => {
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

  // --- GET /api/agent/telemetry ---
  // Query: ?projectId=...&model=...
  app.get('/telemetry', async (req: FastifyRequest) => {
    const { projectId, model } = (req.query || {}) as { projectId?: string; model?: string };

    const limiterAll = rateLimiter.getAllStatus();
    const selectedModel = model || (activeAgent ? (activeAgent.getStatus() as any).model : undefined);
    const selectedModelLimiter = selectedModel ? (limiterAll as any)[selectedModel] : null;

    let quality: any = null;
    if (projectId) {
      try {
        const latestRun = db.prepare(
          'SELECT id FROM agent_runs WHERE project_id = ? ORDER BY started_at DESC LIMIT 1'
        ).get(projectId) as { id?: string } | undefined;
        const runId = latestRun?.id;
        if (runId) {
          const rows = db.prepare(`
            SELECT iteration, build_ok, tests_ok, lint_ok, error_count, files_changed, created_at
            FROM loop_quality_snapshots
            WHERE project_id = ? AND run_id = ?
            ORDER BY iteration DESC
            LIMIT 20
          `).all(projectId, runId) as any[];

          const reversed = [...rows].reverse();
          const total = reversed.length;
          const buildPassRate = total > 0 ? reversed.filter(r => Number(r.build_ok) === 1).length / total : 0;
          const testPassRate = total > 0 ? reversed.filter(r => Number(r.tests_ok) === 1).length / total : 0;
          const avgErrors = total > 0 ? reversed.reduce((acc, r) => acc + Number(r.error_count || 0), 0) / total : 0;
          const recentFailures = reversed.slice(-5).filter(r => Number(r.build_ok) !== 1 || Number(r.tests_ok) !== 1).length;

          const recommendedCooldownMs = (() => {
            if (recentFailures >= 4 || avgErrors >= 8) return 12000;
            if (recentFailures >= 2 || avgErrors >= 4) return 7000;
            if (buildPassRate > 0.85 && testPassRate > 0.85) return 1500;
            return 4000;
          })();

          quality = {
            runId,
            snapshots: reversed,
            stats: {
              total,
              buildPassRate,
              testPassRate,
              avgErrors,
              recentFailures,
            },
            recommendedCooldownMs,
          };
        }
      } catch {
        quality = null;
      }
    }

    const deadModels = (limiterAll as any)._deadModels || { count: 0, models: [] };

    return {
      active: !!activeAgent,
      status: activeAgent ? activeAgent.getStatus() : null,
      selectedModel,
      rateLimiter: {
        selectedModel: selectedModelLimiter,
        deadModels,
      },
      quality,
      timestamp: new Date().toISOString(),
    };
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
