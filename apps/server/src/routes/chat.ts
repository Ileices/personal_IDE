// ============================================
// Chat Routes - SSE streaming chat endpoint
// Includes: failsafe model fallback, systemPrompt override,
//           projectId fallback for THE GOD FACTORY mode
// ============================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ChatRequest, ProviderType } from '@personal-ide/shared';
import { getModel, extractProviderFromModelId, getDefaultPreset } from '@personal-ide/shared';
import { getClientFromDb as getGitHubClient } from '../services/llm/client.js';
import { getClientFromDb as getProviderClient } from '../services/llm/providers.js';
import { streamChatResponse, completeChatResponse } from '../services/llm/streaming.js';
import { rateLimiter } from '../services/llm/rateLimiter.js';
import { userRateLimiter } from '../services/llm/userRateLimiter.js';
import { MemoryService } from '../services/memory/index.js';
import { SYSTEM_PROMPTS, parseStructuredOutput } from '../services/modes/prompts.js';
import { readFile } from '../services/filesystem/index.js';
import { appConfig } from '../config.js';
import { resolveModelStrategy } from '../services/modelStrategy.js';
import { writeBlameRecord } from './blame.js';
import { observationTrainingHook } from '../services/nano/observationTrainer.js';

/** Get an LLM client for a model ID, returns null if not configured */
function getClientForModel(db: any, modelId: string): import('openai').default | null {
  const provider = extractProviderFromModelId(modelId) as ProviderType;
  return provider === 'github' ? getGitHubClient(db) : getProviderClient(db, provider);
}

/** Determine if an error is a retryable fallback condition (rate limit, auth, unavailable) */
function isFallbackError(err: any): boolean {
  const msg = String(err?.message || err || '').toLowerCase();
  // OpenAI library uses .status, some APIs use .statusCode, fallback to 0 if neither
  const status = err?.status ?? err?.statusCode ?? err?.response?.status ?? 0;
  
  const isRetryableStatus = (
    status === 400 || // Parameter errors from API (different param names for O1, etc.)
    status === 429 || status === 401 || status === 403 || status === 404 ||
    status === 503 || status === 502 || status === 500
  );
  
  const isRetryableMessage = (
    msg.includes('rate limit') || msg.includes('quota') ||
    msg.includes('unauthorized') || msg.includes('insufficient_quota') ||
    msg.includes('model_not_found') || msg.includes('unknown model') ||
    msg.includes('model not found') || msg.includes('overloaded') ||
    msg.includes('unavailable') || msg.includes('timeout') ||
    msg.includes('unsupported parameter') || msg.includes('not supported') ||
    msg.includes('503') || msg.includes('502') || msg.includes('500') || msg.includes('400')
  );
  
  return isRetryableStatus || isRetryableMessage;
}

export async function chatRoutes(app: FastifyInstance) {
  const db = (app as any).db;
  const memory = new MemoryService(db);

  // --- POST /api/chat/send - Send a message (SSE stream) ---
  app.post('/send', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as ChatRequest;

    // Validate — projectId can be 'default' when no project is active (THE GOD FACTORY mode)
    if (!body.message || !body.model || !body.mode) {
      return reply.status(400).send({ error: 'Missing required fields: message, model, mode' });
    }
    // Use 'default' as fallback projectId for THE GOD FACTORY / non-project sessions
    if (!body.projectId) {
      body.projectId = 'default';
    }

    console.log(`[chat] Request received: model=${body.model}, mode=${body.mode}, projectId=${body.projectId}, fallbackCount=${body.fallbackModels?.length || 0}`);

    const strategy = resolveModelStrategy(db, body.model, body.fallbackModels);
    console.log(`[chat] Strategy resolved: primaryModel=${strategy.primaryModel}, fallbackCount=${strategy.fallbackModels.length}`);
    body.model = strategy.primaryModel;

    const defaultPreset = getDefaultPreset();
    const guaranteedFallbacks = [
      ...(strategy.fallbackModels || []),
      strategy.settings.primaryModel,
      ...(strategy.settings.fallbackModels || []),
      defaultPreset.primaryModel,
      ...(defaultPreset.fallbackChain || []),
    ].filter((m, idx, arr) => !!m && m !== body.model && arr.indexOf(m) === idx);

    body.fallbackModels = guaranteedFallbacks;

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

    // Resolve the best project for memory/file-context when running in
    // default IDE mode (no explicit active project selected), and guarantee
    // a valid project id for persistence writes.
    let effectiveProjectId = body.projectId;
    const projects = memory.listProjects();
    if (!effectiveProjectId || effectiveProjectId === 'default') {
      if (projects.length > 0) {
        effectiveProjectId = projects[0].id;
      }
    }
    if (!effectiveProjectId || !memory.getProject(effectiveProjectId)) {
      if (projects.length > 0) {
        effectiveProjectId = projects[0].id;
      } else {
        const fallbackProject = memory.createProject(
          'Default Project',
          process.cwd(),
          'Auto-created fallback for global chat sessions'
        );
        effectiveProjectId = fallbackProject.id;
      }
    }

    // Get or create conversation
    let conversationId = body.conversationId;
    if (conversationId) {
      const existingConversation = db.prepare(
        'SELECT id FROM conversations WHERE id = ? LIMIT 1'
      ).get(conversationId) as any;
      if (!existingConversation) {
        conversationId = undefined;
      }
    }

    if (!conversationId) {
      conversationId = memory.createConversation(
        effectiveProjectId,
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
      memoryContext = memory.buildMemoryContext(effectiveProjectId, body.message);
    }

    // Build system prompt based on mode
    const systemPromptFn = SYSTEM_PROMPTS[body.mode] || SYSTEM_PROMPTS.ask;
    // Allow caller to override system prompt (used by THE GOD FACTORY)
    const systemPrompt = body.systemPrompt || systemPromptFn(memoryContext);

    // Build messages array
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Add file context if requested
    if (body.contextFiles && body.contextFiles.length > 0) {
      const project = memory.getProject(effectiveProjectId);
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
      const modelProvider = extractProviderFromModelId(modelId) as ProviderType;
      const modelClient = getClientForModel(db, modelId);
      if (!modelClient) {
        console.log(`[chat-fallback] Skipping ${modelId} — provider not configured`);
        continue;
      }

      // Skip rate-limited models
      const canProceed = rateLimiter.canRequest(modelId);
      if (!canProceed.allowed) {
        console.log(`[chat-fallback] Skipping ${modelId} — rate limited`);
        continue;
      }

      usedModel = modelId;
      const modelDef = getModel(modelId);
      const callStartMs = Date.now();

      console.log(`[chat-fallback] Attempting model ${i + 1}/${modelsToTry.length}: ${modelId}`);

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

        // Nano-specific path: call non-stream endpoint so we can read confidence
        // and route to fallback models when agreement is too low.
        if (modelProvider === 'nano') {
          const completion = await completeChatResponse(modelClient, modelId, messages, {
            temperature: body.mode === 'agent' ? 0.3 : 0.7,
            maxTokens: modelDef?.maxOutputTokens || 4096,
          });

          const threshold = appConfig.contextDefaults.nanoConfidenceThreshold;
          if (typeof completion.confidence === 'number' && completion.confidence < threshold && i < modelsToTry.length - 1) {
            lastError = new Error(
              `Low nano confidence (${completion.confidence.toFixed(3)} < ${threshold})`
            );
            continue;
          }

          // Emit synthetic SSE stream for non-stream completion path
          if (!reply.raw.headersSent) {
            reply.raw.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
              'X-Accel-Buffering': 'no',
            });
          }

          const fullContent = completion.content || '';
          // ── Observation Training Hook (nano path) ──────────────────────
          observationTrainingHook({
            prompt: messages[messages.length - 1]?.content as string ?? '',
            response: fullContent,
            source: 'chat',
            timestamp: Date.now(),
            metadata: { model: modelId, projectId: effectiveProjectId },
          });
          reply.raw.write(`data: ${JSON.stringify({
            type: 'message_start',
            conversationId,
            messageId: userMessageId,
          })}\n\n`);
          if (fullContent) {
            reply.raw.write(`data: ${JSON.stringify({ type: 'content_delta', delta: fullContent })}\n\n`);
          }
          reply.raw.write(`data: ${JSON.stringify({ type: 'content_done', fullContent })}\n\n`);
          reply.raw.write(`data: ${JSON.stringify({
            type: 'done',
            usage: completion.usage ? {
              promptTokens: completion.usage.prompt_tokens || 0,
              completionTokens: completion.usage.completion_tokens || 0,
              totalTokens: completion.usage.total_tokens || 0,
            } : undefined,
            confidence: completion.confidence,
            nanoCount: completion.nanoCount,
          })}\n\n`);

          rateLimiter.recordEnd(modelId);
          const latencyMs = Date.now() - callStartMs;
          const structured = parseStructuredOutput(fullContent);

          writeBlameRecord(db, {
            model: modelId,
            mode: body.mode,
            interactionType: body.mode,
            buildPhase: 'chat_response',
              projectId: effectiveProjectId,
            conversationId: conversationId || undefined,
            taskType: body.mode,
            quality: structured?.confidence ?? undefined,
            success: true,
            latencyMs,
            durationMs: latencyMs,
            tokenCount: completion.usage?.total_tokens,
            promptTokens: completion.usage?.prompt_tokens,
            completionTokens: completion.usage?.completion_tokens,
            contextWindowTokens: (modelDef as any)?.maxInputTokens,
            outputTokensAllowed: modelDef?.maxOutputTokens,
            outputText: fullContent,
            cycleId: new Date().toISOString().slice(0, 10),
            tagValidationResult: structured ? 'pass' : 'partial',
            tagValidationFailureCodes: structured ? [] : ['unstructured_output'],
          });

          memory.addMessage(conversationId!, 'assistant', fullContent, modelId, body.mode, structured);
          if (structured?.summary) {
            memory.addNote(effectiveProjectId, {
              projectId: effectiveProjectId,
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

          reply.raw.end();
          break;
        }

        console.log(`[chat-fallback] Calling streamChatResponse for model: ${modelId}, messageCount: ${messages.length}`);
        await streamChatResponse(modelClient, modelId, messages, reply, {
          maxTokens: modelDef?.maxOutputTokens || 4096,
          temperature: body.mode === 'agent' ? 0.3 : 0.7,
          deferStartUntilReady: true,
          conversationId,
          messageId: userMessageId,
          onDone: (fullContent, usage) => {
            console.log(`[chat-fallback] Model ${modelId} completed successfully`);
            rateLimiter.recordEnd(modelId);
            const latencyMs = Date.now() - callStartMs;

            // Track upstream 429s for abuse detection
            if (usage && (usage as any).statusCode === 429) {
              userRateLimiter.recordUpstream429(clientIp, userKey);
            }

            // Write BLAME record (fire-and-forget)
            const structured = parseStructuredOutput(fullContent);
            writeBlameRecord(db, {
              model: modelId,
              mode: body.mode,
              interactionType: body.mode,
              buildPhase: 'chat_response',
              projectId: effectiveProjectId,
              conversationId: conversationId || undefined,
              taskType: body.mode,
              quality: structured?.confidence ?? undefined,
              success: true,
              latencyMs,
              durationMs: latencyMs,
              tokenCount: usage?.totalTokens,
              promptTokens: usage?.promptTokens,
              completionTokens: usage?.completionTokens,
              contextWindowTokens: (modelDef as any)?.maxInputTokens,
              outputTokensAllowed: modelDef?.maxOutputTokens,
              outputText: fullContent,
              cycleId: new Date().toISOString().slice(0, 10),
              tagValidationResult: structured ? 'pass' : 'partial',
              tagValidationFailureCodes: structured ? [] : ['unstructured_output'],
              qualitySignals: {
                tagConformanceScore: structured ? Math.min(1, Math.max(0, (structured.confidence ?? 70) / 100)) : 0.65,
                instructionAdherenceScore: structured ? 0.9 : 0.65,
                structuralIntegrityScore: structured ? 0.9 : 0.7,
                hallucinationRate: 0.02,
              },
            });

            // Save assistant message (use actual model used, not body.model)
            memory.addMessage(conversationId!, 'assistant', fullContent, modelId, body.mode, structured);

            // Auto-save summary if structured output found
            if (structured?.summary) {
              memory.addNote(effectiveProjectId, {
                projectId: effectiveProjectId,
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
            // Uses observationTrainingHook for secret redaction + unified path
            observationTrainingHook({
              prompt: messages[messages.length - 1]?.content as string ?? body.message,
              response: fullContent,
              source: 'chat',
              timestamp: Date.now(),
              metadata: {
                model: modelId,
                projectId: effectiveProjectId,
              },
            });
          },
        });

        // Success — stop trying fallbacks
        break;

      } catch (err: any) {
        lastError = err;
        rateLimiter.recordEnd(modelId);

        const isFallbackable = isFallbackError(err);
        const errStatus = err?.status ?? err?.statusCode ?? err?.response?.status ?? 'unknown';
        const errMsg = err?.message || String(err);
        const isLastModel = i === modelsToTry.length - 1;
        
        console.log(
          `[chat-fallback] Model ${modelId} failed: status=${errStatus}, ` +
          `fallbackable=${isFallbackable}, isLast=${isLastModel}, error=${errMsg}`
        );

        // Write a failure BLAME record for this model attempt
        writeBlameRecord(db, {
          model: modelId,
          mode: body.mode,
          interactionType: body.mode,
          buildPhase: 'chat_response',
          projectId: effectiveProjectId,
          conversationId: conversationId || undefined,
          taskType: body.mode,
          success: false,
          errorType: errStatus === 429 ? 'rate_limited'
            : errStatus === 401 || errStatus === 403 ? 'auth_or_quota'
            : errStatus === 503 || errStatus === 502 ? 'provider_unreachable'
            : 'model_error',
          latencyMs: Date.now() - callStartMs,
          durationMs: Date.now() - callStartMs,
          contextWindowTokens: (modelDef as any)?.maxInputTokens,
          outputTokensAllowed: modelDef?.maxOutputTokens,
          cycleId: new Date().toISOString().slice(0, 10),
          tagValidationResult: 'fail',
          tagValidationFailureCodes: ['upstream_model_error'],
        });
        if (!isFallbackable || i === modelsToTry.length - 1) {
          // Not retryable OR no more fallbacks — surface the error
          console.log(`[chat-fallback] Terminating fallback chain: isFallbackable=${isFallbackable}, isLastModel=${isLastModel}`);
          if (!reply.raw.writableEnded) {
            if (!reply.raw.headersSent) {
              // SSE must always send 200; errors are conveyed in the stream
              reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
            }
            reply.raw.write(`data: ${JSON.stringify({ type: 'error', error: err.message || 'Model error' })}\n\n`);
            reply.raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
            reply.raw.end();
          }
          return;
        }
        // Continue to next fallback
        console.log(`[chat-fallback] Retrying with next model in fallback chain`);
      }
    }

    // If we exhausted all models without streaming anything
    if (!reply.raw.writableEnded) {
      console.log(`[chat-fallback] All ${modelsToTry.length} models exhausted. Last error: ${lastError?.message || 'unknown'}`);
      if (!reply.raw.headersSent) {
        // SSE must always send 200; errors are conveyed in the stream
        reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
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
