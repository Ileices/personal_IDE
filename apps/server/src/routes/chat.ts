// ============================================
// Chat Routes - SSE streaming chat endpoint
// ============================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ChatRequest, ProviderType } from '@personal-ide/shared';
import { getClientFromDb as getGitHubClient } from '../services/llm/client.js';
import { getClientFromDb as getProviderClient } from '../services/llm/providers.js';
import { streamChatResponse } from '../services/llm/streaming.js';
import { rateLimiter } from '../services/llm/rateLimiter.js';
import { MemoryService } from '../services/memory/index.js';
import { SYSTEM_PROMPTS, parseStructuredOutput } from '../services/modes/prompts.js';
import { listAllFiles, readFile } from '../services/filesystem/index.js';

export async function chatRoutes(app: FastifyInstance) {
  const db = (app as any).db;
  const memory = new MemoryService(db);

  // --- POST /api/chat/send - Send a message (SSE stream) ---
  app.post('/send', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as ChatRequest;

    // Validate
    if (!body.message || !body.model || !body.mode || !body.projectId) {
      return reply.status(400).send({ error: 'Missing required fields: message, model, mode, projectId' });
    }

    // Detect provider from model string
    let provider: ProviderType = 'github';
    const modelStr = body.model;
    const slashIdx = modelStr.indexOf('/');
    if (slashIdx > 0) {
      const prefix = modelStr.substring(0, slashIdx).toLowerCase();
      const knownProviders: ProviderType[] = ['github', 'ollama', 'groq', 'huggingface', 'cohere', 'mistral', 'gemini', 'together', 'openrouter', 'lmstudio', 'nano'];
      if (knownProviders.includes(prefix as ProviderType)) {
        provider = prefix as ProviderType;
      }
    }

    // Get LLM client for the detected provider
    const client = provider === 'github' ? getGitHubClient(db) : getProviderClient(db, provider);
    if (!client) {
      return reply.status(401).send({ error: provider === 'github' ? 'Not authenticated. Please log in with your GitHub PAT.' : `Provider '${provider}' is not configured. Set it up in Settings.` });
    }

    // Check rate limits
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
    memory.addMessage(conversationId, 'user', body.message, body.model, body.mode);

    // Build memory context
    let memoryContext = '';
    if (body.autoInjectMemory !== false) {
      memoryContext = memory.buildMemoryContext(body.projectId, body.message);
    }

    // Build system prompt based on mode
    const systemPromptFn = SYSTEM_PROMPTS[body.mode] || SYSTEM_PROMPTS.ask;
    const systemPrompt = systemPromptFn(memoryContext);

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

    // Add current message
    messages.push({ role: 'user', content: body.message });

    // Stream the response
    rateLimiter.recordStart(body.model);

    await streamChatResponse(client, body.model, messages, reply, {
      maxTokens: 4096,
      temperature: body.mode === 'agent' ? 0.3 : 0.7,
      onDone: (fullContent, usage) => {
        rateLimiter.recordEnd(body.model);

        // Save assistant message
        const structured = parseStructuredOutput(fullContent);
        memory.addMessage(conversationId!, 'assistant', fullContent, body.model, body.mode, structured);

        // Auto-save summary if structured output found
        if (structured?.summary) {
          memory.addNote(body.projectId, {
            projectId: body.projectId,
            source: 'auto_summary',
            category: body.mode,
            title: `${body.mode}: ${structured.summary.slice(0, 100)}`,
            content: structured.summary,
            tags: [body.mode, body.model],
            relatedFiles: structured.filesChanged?.map((f: any) => f.path) || [],
            importance: 50,
            conversationId,
          });
        }
      },
    });
  });

  // --- GET /api/chat/conversations/:projectId ---
  app.get('/conversations/:projectId', async (req: FastifyRequest) => {
    const { projectId } = req.params as { projectId: string };
    return { conversations: memory.getConversations(projectId) };
  });

  // --- GET /api/chat/messages/:conversationId ---
  app.get('/messages/:conversationId', async (req: FastifyRequest) => {
    const { conversationId } = req.params as { conversationId: string };
    return { messages: memory.getMessages(conversationId) };
  });
}
