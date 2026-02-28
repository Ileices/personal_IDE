// ============================================
// Zod Validation Plugin — Centralized request body schemas for all routes
// Validates POST/PUT/PATCH/DELETE bodies via preHandler hook
// ============================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import fp from 'fastify-plugin';

// ── Reusable schema fragments ─────────────────────
const projectIdStr = z.string().min(1, 'projectId is required');
const projectRootStr = z.string().min(1, 'projectRoot is required');
const providerType = z.enum(['github', 'openai', 'anthropic', 'google', 'groq', 'openrouter', 'ollama', 'custom']).optional();

// ── Route Schemas by prefix + method + path ────────
// Key format: "METHOD path" (relative to prefix)
// Value: z.ZodType for request body

// /api/agent
const agentSchemas: Record<string, z.ZodType> = {
  'POST /start': z.object({
    projectId: projectIdStr,
    task: z.string().min(1, 'task is required'),
    model: z.string().optional(),
    maxIterations: z.number().int().min(1).max(10000).optional(),
    stepDelayMs: z.number().int().min(0).optional(),
    autoApproveChanges: z.boolean().optional(),
    autoAnswerQuestions: z.boolean().optional(),
    continuousMode: z.boolean().optional(),
    cooldownMs: z.number().int().min(0).optional(),
    bypassRateLimits: z.boolean().optional(),
    enableSmartChunking: z.boolean().optional(),
    provider: providerType,
    contextWindow: z.number().int().positive().optional(),
    checkpointEvery: z.number().int().min(1).optional(),
    autoFixErrors: z.boolean().optional(),
    autoRunTests: z.boolean().optional(),
    analyzeCodebase: z.boolean().optional(),
  }),
  'POST /message': z.object({
    message: z.string().min(1),
    priority: z.enum(['normal', 'high']).optional(),
  }),
};

// /api/auth
const authSchemas: Record<string, z.ZodType> = {
  'POST /guest': z.object({
    displayName: z.string().max(100).optional(),
  }).optional().default({}),
  'POST /login': z.object({
    pat: z.string().min(1, 'Personal Access Token is required'),
  }),
  'POST /switch': z.object({
    githubUserId: z.number().int().positive(),
  }),
};

// /api/chat
const chatSchemas: Record<string, z.ZodType> = {
  'POST /send': z.object({
    conversationId: z.string().optional(),
    projectId: projectIdStr,
    message: z.string().min(1, 'message is required'),
    model: z.string().min(1, 'model is required'),
    mode: z.string().min(1, 'mode is required'),
    contextFiles: z.array(z.string()).optional(),
    contextMemoryIds: z.array(z.string()).optional(),
    autoInjectMemory: z.boolean().optional(),
  }),
};

// /api/files
const fileSchemas: Record<string, z.ZodType> = {
  'POST /write': z.object({
    root: z.string().min(1),
    path: z.string().min(1),
    content: z.string(),
    backup: z.boolean().optional(),
  }),
  'POST /create': z.object({
    root: z.string().min(1),
    path: z.string().min(1),
    content: z.string().optional(),
  }),
  'DELETE /delete': z.object({
    root: z.string().min(1),
    path: z.string().min(1),
  }),
  'POST /rename': z.object({
    root: z.string().min(1),
    oldPath: z.string().min(1),
    newPath: z.string().min(1),
  }),
};

// /api/memory
const memorySchemas: Record<string, z.ZodType> = {
  'POST /projects': z.object({
    name: z.string().min(1),
    rootPath: z.string().min(1),
    description: z.string().optional(),
  }),
  'POST /notes': z.object({
    projectId: projectIdStr,
    content: z.string().min(1),
    source: z.string().optional(),
    tags: z.array(z.string()).optional(),
    category: z.string().optional(),
    importance: z.number().min(0).max(1).optional(),
  }),
  'POST /notes/search': z.object({
    projectId: projectIdStr,
    query: z.string().min(1),
    sources: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    limit: z.number().int().positive().optional(),
  }),
  'PUT /notes/:noteId': z.object({
    content: z.string().optional(),
    tags: z.array(z.string()).optional(),
    category: z.string().optional(),
    importance: z.number().min(0).max(1).optional(),
  }),
  'POST /questions/:questionId/resolve': z.object({
    resolution: z.string().min(1),
    answer: z.string().optional(),
  }),
};

// /api/fleet
const fleetSchemas: Record<string, z.ZodType> = {
  'POST /start': z.object({
    projectId: projectIdStr,
    task: z.string().min(1, 'task is required'),
    model: z.string().optional(),
    agentCount: z.number().int().min(2).max(20).optional(),
    continuousMode: z.boolean().optional(),
    cooldownMs: z.number().int().min(0).optional(),
    bypassRateLimits: z.boolean().optional(),
    enableSmartChunking: z.boolean().optional(),
    provider: providerType,
    contextWindow: z.number().int().positive().optional(),
    maxIterationsPerAgent: z.number().int().min(1).optional(),
    enableSubAgents: z.boolean().optional(),
  }),
  'POST /message': z.object({
    message: z.string().min(1),
    agentId: z.string().optional(),
    priority: z.enum(['normal', 'high']).optional(),
  }),
};

// /api/providers
const providerSchemas: Record<string, z.ZodType> = {
  'POST /:id': z.object({
    apiKey: z.string().optional(),
    baseUrl: z.string().url().optional(),
    enabled: z.boolean().optional(),
  }),
};

// /api/checkpoints
const checkpointSchemas: Record<string, z.ZodType> = {
  'POST /:projectId/create': z.object({
    projectRoot: projectRootStr,
    description: z.string().optional(),
  }),
  'POST /:projectId/restore': z.object({
    checkpointId: z.string().min(1),
    projectRoot: projectRootStr,
  }),
};

// /api/errors
const errorSchemas: Record<string, z.ZodType> = {
  'POST /check': z.object({ projectRoot: projectRootStr }),
  'POST /test': z.object({ projectRoot: projectRootStr }),
  'POST /stack': z.object({ projectRoot: projectRootStr }),
  'POST /comprehensive': z.object({
    projectId: projectIdStr,
    projectRoot: projectRootStr,
    tokenBudget: z.number().int().positive().optional(),
  }),
  'POST /analysis/scan': z.object({ projectRoot: projectRootStr }),
  'POST /task-plan': z.object({
    projectId: projectIdStr,
    agentRunId: z.string().optional(),
    title: z.string().min(1),
    subtasks: z.array(z.object({
      title: z.string().min(1),
      description: z.string().min(1),
      targetFiles: z.array(z.string()).optional(),
      language: z.string().optional(),
      tokenBudget: z.number().int().positive().optional(),
    })),
  }),
  'PATCH /tasks/:taskId/subtasks/:subtaskIndex': z.object({
    status: z.string().optional(),
    result: z.string().optional(),
    errorOutput: z.string().optional(),
    tokensUsed: z.number().int().optional(),
  }),
};

// /api/knowledge
const knowledgeSchemas: Record<string, z.ZodType> = {
  'POST /scan': z.object({
    projectId: projectIdStr,
    projectRoot: projectRootStr,
  }),
};

// /api/tiers
const tierSchemas: Record<string, z.ZodType> = {
  'POST /detect': z.object({
    projectId: projectIdStr,
    projectRoot: projectRootStr,
  }),
  'POST /decide-language': z.object({
    taskDescription: z.string().min(1),
  }),
};

// /api/conversation-index
const conversationIndexSchemas: Record<string, z.ZodType> = {
  'POST /index': z.object({
    projectId: projectIdStr,
    conversationId: z.string().min(1),
  }),
};

// /api/ollama
const ollamaSchemas: Record<string, z.ZodType> = {
  'POST /test-connection': z.object({
    baseUrl: z.string().optional(),
  }).optional().default({}),
  'POST /pull': z.object({
    model: z.string().min(1),
  }),
  'POST /set-base-url': z.object({
    baseUrl: z.string().min(1),
  }),
};

// /api/nano
const nanoSchemas: Record<string, z.ZodType> = {
  'POST /start': z.object({
    port: z.number().int().positive().optional(),
    host: z.string().optional(),
    checkpointDir: z.string().optional(),
    enableMesh: z.boolean().optional(),
    meshPort: z.number().int().positive().optional(),
    enableGlobalPool: z.boolean().optional(),
    globalPoolUrl: z.string().optional(),
    nanoCategories: z.array(z.string()).optional(),
  }).optional().default({}),
  'POST /restart': z.object({
    port: z.number().int().positive().optional(),
    host: z.string().optional(),
    checkpointDir: z.string().optional(),
    enableMesh: z.boolean().optional(),
    meshPort: z.number().int().positive().optional(),
    enableGlobalPool: z.boolean().optional(),
    globalPoolUrl: z.string().optional(),
    nanoCategories: z.array(z.string()).optional(),
  }).optional().default({}),
  'PUT /config': z.object({
    port: z.number().int().positive().optional(),
    host: z.string().optional(),
    checkpointDir: z.string().optional(),
    enableMesh: z.boolean().optional(),
    meshPort: z.number().int().positive().optional(),
    enableGlobalPool: z.boolean().optional(),
    globalPoolUrl: z.string().optional(),
    nanoCategories: z.array(z.string()).optional(),
  }).optional().default({}),
};

// /api/midwife
const midwifeSchemas: Record<string, z.ZodType> = {
  'PUT /config': z.object({
    enabled: z.boolean().optional(),
    checkIntervalMs: z.number().int().positive().optional(),
    maxRetries: z.number().int().min(0).optional(),
    notifyOnRecovery: z.boolean().optional(),
  }),
  'PUT /tasks/:taskType': z.object({
    enabled: z.boolean().optional(),
    intervalMs: z.number().int().positive().optional(),
    config: z.record(z.any()).optional(),
  }),
};

// /api/preview
const previewSchemas: Record<string, z.ZodType> = {
  'POST /run': z.object({
    command: z.string().min(1),
    cwd: z.string().optional(),
    timeoutMs: z.number().int().positive().max(300000).optional(),
    stdin: z.string().optional(),
  }),
  'POST /script': z.object({
    language: z.enum(['python', 'node', 'typescript', 'bash', 'powershell']),
    code: z.string().min(1),
    cwd: z.string().optional(),
    timeoutMs: z.number().int().positive().max(300000).optional(),
    args: z.array(z.string()).optional(),
  }),
  'POST /compile': z.object({
    language: z.enum(['cpp', 'c', 'rust', 'go', 'java']),
    sourceFile: z.string().min(1),
    cwd: z.string().optional(),
    timeoutMs: z.number().int().positive().max(300000).optional(),
    args: z.array(z.string()).optional(),
  }),
  'POST /url': z.object({
    url: z.string().url(),
    waitMs: z.number().int().positive().max(30000).optional(),
  }),
};

// /api/openclaw
const openclawSchemas: Record<string, z.ZodType> = {
  'POST /skills/install': z.object({
    source: z.string().min(1),
  }),
  'POST /skills/execute': z.object({
    skillId: z.string().min(1),
    input: z.record(z.any()).optional(),
  }),
  'POST /workflows': z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    steps: z.array(z.object({
      skillId: z.string(),
      input: z.record(z.any()).optional(),
    })),
  }),
  'POST /workflows/:id/execute': z.object({
    input: z.record(z.any()).optional(),
  }).optional().default({}),
};

// /api/terminal
const terminalSchemas: Record<string, z.ZodType> = {
  'POST /sessions': z.object({
    shell: z.string().optional(),
    cwd: z.string().optional(),
    cols: z.number().int().positive().optional(),
    rows: z.number().int().positive().optional(),
  }).optional().default({}),
  'POST /write': z.object({
    sessionId: z.string().min(1),
    input: z.string(),
  }),
  'POST /exec': z.object({
    sessionId: z.string().min(1),
    command: z.string().min(1),
    timeout: z.number().int().positive().optional(),
  }),
  'POST /resize': z.object({
    sessionId: z.string().min(1),
    cols: z.number().int().positive(),
    rows: z.number().int().positive(),
  }),
};

// ── Master schema map: prefix → { "METHOD path" → schema } ────
const schemaMap: Record<string, Record<string, z.ZodType>> = {
  '/api/agent': agentSchemas,
  '/api/auth': authSchemas,
  '/api/chat': chatSchemas,
  '/api/files': fileSchemas,
  '/api/memory': memorySchemas,
  '/api/fleet': fleetSchemas,
  '/api/providers': providerSchemas,
  '/api/checkpoints': checkpointSchemas,
  '/api/errors': errorSchemas,
  '/api/knowledge': knowledgeSchemas,
  '/api/tiers': tierSchemas,
  '/api/conversation-index': conversationIndexSchemas,
  '/api/ollama': ollamaSchemas,
  '/api/nano': nanoSchemas,
  '/api/midwife': midwifeSchemas,
  '/api/preview': previewSchemas,
  '/api/openclaw': openclawSchemas,
  '/api/terminal': terminalSchemas,
};

// ── Build flat lookup: "METHOD /api/prefix/path" → schema ────
function buildRouteLookup(): Map<string, z.ZodType> {
  const lookup = new Map<string, z.ZodType>();
  for (const [prefix, routes] of Object.entries(schemaMap)) {
    for (const [methodPath, schema] of Object.entries(routes)) {
      const [method, path] = methodPath.split(' ');
      // Convert parametric paths like /:id to /:id pattern
      const fullPath = `${method} ${prefix}${path}`;
      lookup.set(fullPath, schema);
    }
  }
  return lookup;
}

// ── Fastify Plugin ────
async function validationPluginFn(app: FastifyInstance) {
  const routeLookup = buildRouteLookup();

  // Build a regex-ready lookup for parametric routes
  const paramRoutes: Array<{ pattern: RegExp; schema: z.ZodType }> = [];
  const staticRoutes = new Map<string, z.ZodType>();

  for (const [key, schema] of routeLookup) {
    if (key.includes(':')) {
      // Convert :param to regex group
      const regexStr = key.replace(/:[^/]+/g, '[^/]+');
      paramRoutes.push({ pattern: new RegExp(`^${regexStr}$`), schema });
    } else {
      staticRoutes.set(key, schema);
    }
  }

  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    // Only validate methods that have bodies
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return;

    const lookupKey = `${req.method} ${req.url.split('?')[0]}`; // strip query params

    // Try static match first
    let schema = staticRoutes.get(lookupKey);

    // Try parametric match
    if (!schema) {
      for (const route of paramRoutes) {
        if (route.pattern.test(lookupKey)) {
          schema = route.schema;
          break;
        }
      }
    }

    // No schema found → skip validation (allow unschema'd routes through)
    if (!schema) return;

    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        details: result.error.issues.map(e => ({
          path: e.path.join('.'),
          message: e.message,
          code: e.code,
        })),
      });
    }

    // Replace body with parsed/coerced data
    (req as any).body = result.data;
  });
}

export const validationPlugin = fp(validationPluginFn, {
  name: 'validation',
  fastify: '5.x',
});
