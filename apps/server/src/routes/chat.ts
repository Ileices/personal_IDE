// ============================================
// Chat Routes - SSE streaming chat endpoint
// Includes: failsafe model fallback, systemPrompt override,
//           projectId fallback for God Factory mode
// ============================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ChatRequest, ProviderType } from '@personal-ide/shared';
import { getModel, extractProviderFromModelId } from '@personal-ide/shared';
import { getClientFromDb as getGitHubClient } from '../services/llm/client.js';
import { getClientFromDb as getProviderClient } from '../services/llm/providers.js';
import { streamChatResponse } from '../services/llm/streaming.js';
import { rateLimiter } from '../services/llm/rateLimiter.js';
import { userRateLimiter } from '../services/llm/userRateLimiter.js';
import { MemoryService } from '../services/memory/index.js';
import { SYSTEM_PROMPTS, parseStructuredOutput } from '../services/modes/prompts.js';
import { readFile } from '../services/filesystem/index.js';
import { appConfig } from '../config.js';

/** Get an LLM client for a model ID, returns null if not configured */
function getClientForModel(db: any, modelId: string): import('openai').default | null {
  const provider = extractProviderFromModelId(modelId) as ProviderType;
  return provider === 'github' ? getGitHubClient(db) : getProviderClient(db, provider);
}

/** Determine if an error is a retryable fallback condition (rate limit, auth, unavailable) */
function isFallbackError(err: any): boolean {
  const msg = String(err?.message || err || '').toLowerCase();
  const status = err?.status || err?.statusCode || 0;
  return (
    status === 429 || status === 401 || status === 403 ||
    status === 503 || status === 502 || status === 500 ||
    msg.includes('rate limit') || msg.includes('quota') ||
    msg.includes('unauthorized') || msg.includes('insufficient_quota') ||
    msg.includes('model_not_found') || msg.includes('overloaded') ||
    msg.includes('unavailable') || msg.includes('timeout')
  );
}

export async function chatRoutes(app: FastifyInstance) {
  const db = (app as any).db;
  const memory = new MemoryService(db);

  // --- POST /api/chat/send - Send a message (SSE stream) ---
  app.post('/send', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as ChatRequest;

    // Validate — projectId can be 'default' when no project is active (God Factory mode)
    if (!body.message || !body.model || !body.mode) {
      return reply.status(400).send({ error: 'Missing required fields: message, model, mode' });
    }
    // Use 'default' as fallback projectId for God Factory / non-project sessions
    if (!body.projectId) {
      body.projectId = 'default';
    }

    // Detect provider from model string
    const provider = extractProviderFromModelId(body.model) as ProviderType;

    // Get LLM client for the detected provider
    const client = getClientForModel(db, body.model);
    if (!client) {
      // If primary fails, try fallbacks before returning 401
      const fallbacks = body.fallbackModels || [];
      let fbClient = null;
      let fbModel = '';
      for (const fb of fallbacks) {
        const c = getClientForModel(db, fb);
        if (c) { fbClient = c; fbModel = fb; break; }
      }
      if (!fbClient) {
        return reply.status(401).send({
          error: provider === 'github'
            ? 'Not authenticated. Please log in with your GitHub PAT.'
            : `Provider '${provider}' is not configured. Add your API key in Provider Settings.`,
        });
      }
      // Rewrite body to use the first available fallback
      body.model = fbModel;
    }

    // ── Per-user rate limit (IP + optional user ID) ──
    const clientIp = req.ip || '127.0.0.1';
    const activeUser = db.prepare(
      'SELECT github_login FROM auth_tokens WHERE is_active = 1 LIMIT 1'
    ).get() as any;
    const userKey = activeUser?.github_login || undefined;
    const userCheck = userRateLimiter.acquire(clientIp, userKey);
    if (!userCheck.allowed) {
      return reply.status(429).send({
        error: userCheck.reason,
        retryAfterMs: userCheck.retryAfterMs,
      });
    }

    // Check model-level rate limits
    const canProceed = rateLimiter.canRequest(body.model);
    if (!canProceed.allowed) {
      return reply.status(429).send({
        error: canProceed.reason,
        retryAfterMs: canProceed.retryAfterMs,
        fallbackModel: rateLimiter.findFallback(body.model, body.mode),
      });
    }

    // Get or create conversation
    let conversationId = body.conversationId;
    if (!conversationId) {
      conversationId = memory.createConversation(
        body.projectId,
        body.message.slice(0, 50),
        body.mode,
        body.model
      );
    }

    // Save user message
    const userMessageId = memory.addMessage(conversationId, 'user', body.message, body.model, body.mode);

    // Build memory context
    let memoryContext = '';
    if (body.autoInjectMemory !== false) {
      memoryContext = memory.buildMemoryContext(body.projectId, body.message);
    }

    // Build system prompt based on mode
    const systemPromptFn = SYSTEM_PROMPTS[body.mode] || SYSTEM_PROMPTS.ask;
    // Allow caller to override system prompt (used by The God Factory)
    const systemPrompt = body.systemPrompt || systemPromptFn(memoryContext);

    // Build messages array
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Add file context if requested
    if (body.contextFiles && body.contextFiles.length > 0) {
      const project = memory.getProject(body.projectId);
      if (project) {
        for (const fp of body.contextFiles.slice(0, 10)) {
          try {
            const file = readFile(project.rootPath, fp);
            messages.push({
              role: 'system',
              content: `--- FILE: ${fp} ---\n${file.content}\n--- END FILE ---`,
            });
          } catch { /* skip unreadable files */ }
        }
      }
    }

    // Add conversation history
    const history = memory.getMessages(conversationId);
    const recentHistory = history.slice(-20);
    for (const msg of recentHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // Stream the response — with automatic fallback chain on failure
    // Build the ordered list of models to try: primary first, then fallbacks
    const modelsToTry = [body.model, ...(body.fallbackModels || []).filter(m => m !== body.model)];
    let lastError: any = null;
    let usedModel = body.model;

    for (let i = 0; i < modelsToTry.length; i++) {
      const modelId = modelsToTry[i];
      const modelClient = getClientForModel(db, modelId);
      if (!modelClient) continue; // provider not configured — skip

      // Skip rate-limited models
      const canProceed = rateLimiter.canRequest(modelId);
      if (!canProceed.allowed) continue;

      usedModel = modelId;
      const modelDef = getModel(modelId);

      try {
        rateLimiter.recordStart(modelId);

        // If we fell back to a different model, notify the client via SSE
        if (i > 0 && !reply.raw.writableEnded) {
          if (!reply.raw.headersSent) {
            reply.raw.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
              'X-Accel-Buffering': 'no',
            });
          }
          reply.raw.write(`data: ${JSON.stringify({
            type: 'model_fallback',
            from: modelsToTry[i - 1],
            to: modelId,
            reason: String(lastError?.message || 'previous model unavailable'),
          })}\n\n`);
        }

        await streamChatResponse(modelClient, modelId, messages, reply, {
          maxTokens: modelDef?.maxOutputTokens || 4096,
          temperature: body.mode === 'agent' ? 0.3 : 0.7,
          conversationId,
          messageId: userMessageId,
          onDone: (fullContent, usage) => {
            rateLimiter.recordEnd(modelId);

            // Track upstream 429s for abuse detection
            if (usage && (usage as any).statusCode === 429) {
              userRateLimiter.recordUpstream429(clientIp, userKey);
            }

            // Save assistant message (use actual model used, not body.model)
            const structured = parseStructuredOutput(fullContent);
            memory.addMessage(conversationId!, 'assistant', fullContent, modelId, body.mode, structured);

            // Auto-save summary if structured output found
            if (structured?.summary) {
              memory.addNote(body.projectId, {
                projectId: body.projectId,
                source: 'auto_summary',
                category: body.mode,
                title: `${body.mode}: ${structured.summary.slice(0, 100)}`,
                content: structured.summary,
                tags: [body.mode, modelId],
                relatedFiles: structured.filesChanged?.map((f: any) => f.path) || [],
                importance: 50,
                conversationId,
              });
            }

            // ── Bird-feed observation to Nano trainer (fire-and-forget) ──
            try {
              const nanoRow = db.prepare(
                "SELECT base_url FROM provider_configs WHERE provider_id = 'nano' AND enabled = 1"
              ).get() as any;
              const nanoBaseUrl = (nanoRow?.base_url || appConfig.services.nanoSeaUrl).replace(/\/v1\/?$/, '');
              fetch(nanoBaseUrl + '/v1/training/observe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  query: body.message.slice(0, 4000),
                  response: fullContent.slice(0, 8000),
                  source: 'chat',
                  quality: structured?.confidence ? structured.confidence / 100 : 0.7,
                }),
              }).catch(() => {}); // nano may not be running
            } catch { /* non-critical */ }
          },
        });

        // Success — stop trying fallbacks
        break;

      } catch (err: any) {
        lastError = err;
        rateLimiter.recordEnd(modelId);

        const isFallbackable = isFallbackError(err);
        if (!isFallbackable || i === modelsToTry.length - 1) {
          // Not retryable OR no more fallbacks — surface the error
          if (!reply.raw.writableEnded) {
            if (!reply.raw.headersSent) {
              reply.raw.writeHead(500, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
            }
            reply.raw.write(`data: ${JSON.stringify({ type: 'error', error: err.message || 'Model error' })}\n\n`);
            reply.raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
            reply.raw.end();
          }
          return;
        }
        // Continue to next fallback
      }
    }

    // If we exhausted all models without streaming anything
    if (!reply.raw.writableEnded) {
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(503, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      }
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', error: `All models unavailable. Tried: ${modelsToTry.slice(0, 3).join(', ')}` })}\n\n`);
      reply.raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      reply.raw.end();
    }
  });

  // --- GET /api/chat/conversations/:projectId ---
  app.get('/conversations', async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = req.query as { projectId?: string };
    if (!projectId) {
      return reply.status(400).send({ error: 'projectId is required' });
    }
    return { conversations: memory.getConversations(projectId) };
  });

  app.get('/conversations/:projectId', async (req: FastifyRequest) => {
    const { projectId } = req.params as { projectId: string };
    return { conversations: memory.getConversations(projectId) };
  });

  // --- DELETE /api/chat/conversations/:conversationId ---
  app.delete('/conversations/:conversationId', async (req: FastifyRequest) => {
    const { conversationId } = req.params as { conversationId: string };
    memory.deleteConversation(conversationId);
    return { success: true };
  });

  // --- PUT /api/chat/conversations/:conversationId ---
  app.put('/conversations/:conversationId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { conversationId } = req.params as { conversationId: string };
    const { title } = (req.body || {}) as { title?: string };
    const nextTitle = (title || '').trim();
    if (!nextTitle) {
      return reply.status(400).send({ error: 'title is required' });
    }
    memory.renameConversation(conversationId, nextTitle);
    return { success: true };
  });

  // --- Legacy compatibility endpoints ---
  app.get('/conversations/:conversationId/delete', async (req: FastifyRequest) => {
    const { conversationId } = req.params as { conversationId: string };
    memory.deleteConversation(conversationId);
    return { success: true };
  });

  app.get('/conversations/:conversationId/rename', async (req: FastifyRequest, reply: FastifyReply) => {
    const { conversationId } = req.params as { conversationId: string };
    const { title } = req.query as { title?: string };
    const nextTitle = (title || '').trim();
    if (!nextTitle) {
      return reply.status(400).send({ error: 'title is required' });
    }
    memory.renameConversation(conversationId, nextTitle);
    return { success: true };
  });

  // --- GET /api/chat/messages/:conversationId ---
  app.get('/messages/:conversationId', async (req: FastifyRequest) => {
    const { conversationId } = req.params as { conversationId: string };
    return { messages: memory.getMessages(conversationId) };
  });
}
