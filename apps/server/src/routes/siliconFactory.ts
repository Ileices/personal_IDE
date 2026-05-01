import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  ackIapMessage,
  acquireSyncLock,
  appendBlackBoxRecord,
  assembleHandshakePrompt,
  buildSiliconTaskContext,
  computeSiliconContextDelta,
  compressDiagnostics,
  compressTestOutput,
  coldBootResume,
  createDeepStateSnapshot,
  createSiliconTask,
  detectAmbiguity,
  ensureSiliconFactoryDefaults,
  findTestsForFile,
  findTestsForSymbol,
  getProjectConfig,
  getSpecContract,
  getSiliconDashboard,
  getSiliconFactoryStatus,
  getSiliconTask,
  listDeepStateSnapshots,
  listIapMessages,
  listSyncLocks,
  listSiliconTasks,
  pauseSiliconFactorySupervisor,
  querySiliconSymbolGraph,
  readSiliconSymbol,
  rebuildSymbolEmbeddings,
  reindexSiliconTests,
  releaseSyncLock,
  resolveSiliconProjectContext,
  resumeSiliconFactorySupervisor,
  semanticFindSiliconWithEmbeddings,
  sendIapMessage,
  setSiliconProjectContext,
  setSpecContract,
  type SiliconTaskStatus,
  updateSiliconTaskStatus,
  upsertProjectConfig,
  validateSpecContract,
} from '../services/siliconFactory/index.js';

const VALID_STATUS: SiliconTaskStatus[] = ['PENDING', 'ACTIVE', 'COMPLETED', 'FAILED', 'ESCALATED'];

export async function siliconFactoryRoutes(app: FastifyInstance) {
  const db = (app as any).db;
  try {
    ensureSiliconFactoryDefaults(db);
  } catch (err) {
    // Tables may not exist yet if a migration is pending/failed — don't crash the server
    console.warn('[silicon-factory] Could not apply defaults (migration may be pending):', err instanceof Error ? err.message : err);
  }

  app.get('/status', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      return reply.send(getSiliconFactoryStatus(db));
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.get('/dashboard', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      return reply.send(getSiliconDashboard(db));
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/control', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body || {}) as { action?: 'pause' | 'resume' };
    if (!body.action || !['pause', 'resume'].includes(body.action)) {
      return reply.status(400).send({ error: 'action must be pause or resume' });
    }

    try {
      if (body.action === 'pause') {
        pauseSiliconFactorySupervisor();
      } else {
        resumeSiliconFactorySupervisor(db);
      }
      return reply.send({ success: true, action: body.action, status: getSiliconFactoryStatus(db) });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.get('/project-context', async (req: FastifyRequest, reply: FastifyReply) => {
    const q = (req.query || {}) as { project_id?: string; project_root?: string };
    try {
      const context = resolveSiliconProjectContext(db, {
        project_id: q.project_id,
        project_root: q.project_root,
      });
      return reply.send({ context });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/project-context', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body || {}) as { project_id?: string; project_root?: string };
    try {
      const context = setSiliconProjectContext(db, {
        project_id: body.project_id,
        project_root: body.project_root,
      });
      return reply.send({ success: true, context });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.get('/symbol-read', async (req: FastifyRequest, reply: FastifyReply) => {
    const q = (req.query || {}) as {
      symbol_name?: string;
      read_type?: 'function' | 'class_api' | 'struct' | 'signature';
      project_id?: string;
      project_root?: string;
      file_path?: string;
    };

    if (!q.symbol_name || !q.symbol_name.trim()) {
      return reply.status(400).send({ error: 'symbol_name is required' });
    }

    try {
      const result = readSiliconSymbol(db, {
        symbol_name: q.symbol_name,
        read_type: q.read_type,
        project_id: q.project_id,
        project_root: q.project_root,
        file_path: q.file_path,
      });
      if (!result) return reply.status(404).send({ error: 'symbol not found' });
      return reply.send(result);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.get('/graph-query', async (req: FastifyRequest, reply: FastifyReply) => {
    const q = (req.query || {}) as {
      mode?: 'find_callers' | 'find_callees' | 'find_definitions' | 'find_usages' | 'get_includes' | 'get_includers' | 'get_symbol_type';
      symbol?: string;
      file_path?: string;
      project_id?: string;
      limit?: string;
    };

    if (!q.mode) {
      return reply.status(400).send({ error: 'mode is required' });
    }

    try {
      const result = querySiliconSymbolGraph(db, {
        mode: q.mode,
        symbol: q.symbol,
        file_path: q.file_path,
        project_id: q.project_id,
        limit: Number(q.limit || 30),
      });
      return reply.send(result);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.get('/semantic-find', async (req: FastifyRequest, reply: FastifyReply) => {
    const q = (req.query || {}) as { query?: string; project_id?: string; limit?: string };
    if (!q.query || !q.query.trim()) {
      return reply.status(400).send({ error: 'query is required' });
    }

    try {
      const results = semanticFindSiliconWithEmbeddings(db, {
        query: q.query,
        project_id: q.project_id,
        limit: Number(q.limit || 8),
      });
      return reply.send({ results, total: results.length });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.get('/iap/messages', async (req: FastifyRequest, reply: FastifyReply) => {
    const q = (req.query || {}) as { to_agent?: string; status?: 'queued' | 'acked'; limit?: string };
    try {
      const messages = listIapMessages(db, {
        to_agent: q.to_agent,
        status: q.status,
        limit: Number(q.limit || 30),
      });
      return reply.send({ messages, total: messages.length });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/iap/messages', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body || {}) as {
      from_agent?: string;
      to_agent?: string;
      message_type?: string;
      payload?: Record<string, unknown>;
    };

    if (!body.from_agent || !body.to_agent || !body.message_type) {
      return reply.status(400).send({ error: 'from_agent, to_agent, and message_type are required' });
    }

    try {
      const message = sendIapMessage(db, {
        from_agent: body.from_agent,
        to_agent: body.to_agent,
        message_type: body.message_type,
        payload: body.payload || {},
      });
      return reply.send({ success: true, message });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/iap/messages/:id/ack', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    try {
      const acknowledged = ackIapMessage(db, id);
      return reply.send({ acknowledged, id });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.get('/locks', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const locks = listSyncLocks(db);
      return reply.send({ locks, total: locks.length });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/locks/acquire', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body || {}) as { lock_key?: string; owner_agent?: string; ttl_seconds?: number };
    if (!body.lock_key || !body.owner_agent) {
      return reply.status(400).send({ error: 'lock_key and owner_agent are required' });
    }
    try {
      return reply.send(acquireSyncLock(db, body as { lock_key: string; owner_agent: string; ttl_seconds?: number }));
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/locks/release', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body || {}) as { lock_key?: string; owner_agent?: string };
    if (!body.lock_key) {
      return reply.status(400).send({ error: 'lock_key is required' });
    }
    try {
      const released = releaseSyncLock(db, { lock_key: body.lock_key, owner_agent: body.owner_agent });
      return reply.send({ released });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.get('/tasks', async (req: FastifyRequest, reply: FastifyReply) => {
    const query = (req.query || {}) as { status?: SiliconTaskStatus; limit?: string };
    const limit = Number(query.limit || 25);

    try {
      const status = query.status && VALID_STATUS.includes(query.status) ? query.status : undefined;
      const tasks = listSiliconTasks(db, { status, limit });
      return reply.send({ tasks, total: tasks.length });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/tasks', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body || {}) as {
      instruction?: string;
      agent_type?: string;
      context_keys?: string[];
      next_step_hint?: string;
      previous_id?: string;
      parent_id?: string;
    };

    if (!body.instruction || !body.instruction.trim()) {
      return reply.status(400).send({ error: 'instruction is required' });
    }

    try {
      const ambiguity = detectAmbiguity(body.instruction);
      if (ambiguity.ambiguous) {
        return reply.status(422).send({
          error: 'instruction is ambiguous',
          ambiguity,
        });
      }

      const task = createSiliconTask(db, {
        instruction: body.instruction.trim(),
        agent_type: body.agent_type,
        context_keys: body.context_keys,
        next_step_hint: body.next_step_hint,
        previous_id: body.previous_id,
        parent_id: body.parent_id,
      });

      return reply.send({ success: true, task });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.get('/tasks/:taskId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { taskId } = req.params as { taskId: string };

    try {
      const task = getSiliconTask(db, taskId);
      if (!task) return reply.status(404).send({ error: 'task not found' });
      return reply.send(task);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/tasks/:taskId/status', async (req: FastifyRequest, reply: FastifyReply) => {
    const { taskId } = req.params as { taskId: string };
    const body = (req.body || {}) as {
      status?: SiliconTaskStatus;
      output_raw?: string;
      handshake_blob?: Record<string, unknown>;
      files_modified?: string[];
      token_count_in?: number;
      token_count_out?: number;
      thermal_at_run?: number;
      provenance_tags?: Record<string, [number, number]>;
    };

    if (!body.status || !VALID_STATUS.includes(body.status)) {
      return reply.status(400).send({ error: `status must be one of: ${VALID_STATUS.join(', ')}` });
    }

    try {
      const task = updateSiliconTaskStatus(db, taskId, {
        status: body.status,
        output_raw: body.output_raw,
        handshake_blob: body.handshake_blob,
        files_modified: body.files_modified,
        token_count_in: body.token_count_in,
        token_count_out: body.token_count_out,
        thermal_at_run: body.thermal_at_run,
        provenance_tags: body.provenance_tags,
      });

      if (body.output_raw || body.handshake_blob) {
        appendBlackBoxRecord(db, {
          task_id: taskId,
          agent_id: task.agent_type,
          prompt: task.instruction,
          response: body.output_raw || JSON.stringify(body.handshake_blob || {}),
          token_in: body.token_count_in ?? task.token_count_in,
          token_out: body.token_count_out ?? task.token_count_out,
        });
      }

      return reply.send({ success: true, task });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/assemble-handshake', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body || {}) as { task_id?: string };
    if (!body.task_id) return reply.status(400).send({ error: 'task_id is required' });

    try {
      const prompt = assembleHandshakePrompt(db, body.task_id);
      return reply.send(prompt);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/detect-ambiguity', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body || {}) as { instruction?: string };
    if (!body.instruction || !body.instruction.trim()) {
      return reply.status(400).send({ error: 'instruction is required' });
    }

    try {
      return reply.send(detectAmbiguity(body.instruction));
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/cold-boot-resume', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = coldBootResume(db);
      return reply.send({ success: true, ...result });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.get('/snapshots', async (req: FastifyRequest, reply: FastifyReply) => {
    const q = (req.query || {}) as { limit?: string };
    try {
      const snapshots = listDeepStateSnapshots(db, Number(q.limit || 20));
      return reply.send({ snapshots, total: snapshots.length });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/snapshots', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body || {}) as { reason?: string };
    try {
      const snapshot = createDeepStateSnapshot(db, body.reason || 'manual');
      return reply.send({ success: true, snapshot });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.get('/spec-contract', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      return reply.send({ contract: getSpecContract(db) });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/spec-contract', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body || {}) as { contract?: { requirements?: Array<{ id: string; rule: string; enforcer?: string }> } };
    if (!body.contract || !Array.isArray(body.contract.requirements)) {
      return reply.status(400).send({ error: 'contract.requirements array is required' });
    }
    try {
      setSpecContract(db, { requirements: body.contract.requirements });
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/validate-requirements', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body || {}) as {
      code?: string;
      task_id?: string;
      fail_task_on_violation?: boolean;
    };

    let code = body.code || '';
    if (!code && body.task_id) {
      const task = getSiliconTask(db, body.task_id);
      code = task?.output_raw || '';
    }

    if (!code) {
      return reply.status(400).send({ error: 'Provide code or task_id with output_raw' });
    }

    try {
      const result = validateSpecContract(db, {
        code,
        task_id: body.task_id,
        fail_task_on_violation: !!body.fail_task_on_violation,
      });
      return reply.send(result);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/task-context', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body || {}) as {
      task_id?: string;
      project_id?: string;
      project_root?: string;
      budget_tokens?: number;
      diagnostics_raw?: string;
    };

    if (!body.task_id) {
      return reply.status(400).send({ error: 'task_id is required' });
    }

    try {
      const context = buildSiliconTaskContext(db, {
        task_id: body.task_id,
        project_id: body.project_id,
        project_root: body.project_root,
        budget_tokens: body.budget_tokens,
        diagnostics_raw: body.diagnostics_raw,
      });
      return reply.send(context);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/context-delta', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body || {}) as {
      previous_sections?: Record<string, string>;
      current_sections?: Record<string, string>;
    };

    try {
      const delta = computeSiliconContextDelta(body.previous_sections || {}, body.current_sections || {});
      return reply.send(delta);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/compress-diagnostics', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body || {}) as { raw?: string; max_items?: number };
    try {
      const diagnostics = compressDiagnostics(body.raw || '', Number(body.max_items || 20));
      return reply.send({ diagnostics, total: diagnostics.length });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/compress-test-output', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body || {}) as { raw?: string; max_failures?: number };
    try {
      const summary = compressTestOutput(body.raw || '', Number(body.max_failures || 10));
      return reply.send(summary);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.get('/project-config', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      return reply.send({ config: getProjectConfig(db) });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/project-config', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body || {}) as { key?: string; value?: string };
    if (!body.key || body.value === undefined) {
      return reply.status(400).send({ error: 'key and value are required' });
    }

    try {
      upsertProjectConfig(db, body.key, String(body.value));
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Test Execution Mapping ──────────────────────────────────────────────

  app.get('/test-discovery', async (req: FastifyRequest, reply: FastifyReply) => {
    const q = (req.query || {}) as {
      symbol?: string;
      file_path?: string;
      project_id?: string;
      limit?: string;
    };

    if (!q.symbol && !q.file_path) {
      return reply.status(400).send({ error: 'symbol or file_path is required' });
    }

    try {
      if (q.symbol) {
        const results = findTestsForSymbol(db, {
          symbol_name: q.symbol,
          project_id: q.project_id,
          limit: Number(q.limit || 30),
        });
        return reply.send({ mode: 'symbol', symbol: q.symbol, results, total: results.length });
      } else {
        const results = findTestsForFile(db, {
          file_path: q.file_path!,
          project_id: q.project_id,
          limit: Number(q.limit || 50),
        });
        return reply.send({ mode: 'file', file_path: q.file_path, results, total: results.length });
      }
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/reindex-tests', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body || {}) as { project_id?: string; project_root?: string };
    try {
      const result = reindexSiliconTests(db, {
        project_id: body.project_id,
        project_root: body.project_root,
      });
      return reply.send({ success: true, ...result });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Symbol Embeddings ───────────────────────────────────────────────────

  app.post('/reindex-embeddings', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body || {}) as { project_id?: string };
    try {
      const result = rebuildSymbolEmbeddings(db, { project_id: body.project_id });
      return reply.send({ success: true, ...result });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
