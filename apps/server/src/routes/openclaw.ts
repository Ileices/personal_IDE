// ============================================
// OpenClaw Routes — skill browser, execution,
// workflow management, and agent integration
// ============================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { OpenClawService } from '../services/openclaw/index.js';

const clawService = new OpenClawService();

export async function openclawRoutes(app: FastifyInstance) {

  // --- GET /api/openclaw/skills ---
  app.get('/skills', async (req: FastifyRequest, reply: FastifyReply) => {
    const { category, query } = req.query as { category?: string; query?: string };
    if (query) return { skills: clawService.searchSkills(query) };
    return { skills: clawService.listSkills(category) };
  });

  // --- GET /api/openclaw/categories ---
  app.get('/categories', async () => {
    return { categories: clawService.getCategories() };
  });

  // --- POST /api/openclaw/skills/install ---
  app.post('/skills/install', async (req: FastifyRequest, reply: FastifyReply) => {
    const { source } = req.body as { source: string };
    if (!source) return reply.status(400).send({ error: 'source required' });
    const skill = await clawService.installSkill(source);
    return { skill };
  });

  // --- POST /api/openclaw/skills/execute ---
  app.post('/skills/execute', async (req: FastifyRequest, reply: FastifyReply) => {
    const { skillId, input } = req.body as { skillId: string; input?: Record<string, any> };
    if (!skillId) return reply.status(400).send({ error: 'skillId required' });
    const result = await clawService.executeSkill(skillId, input || {});
    return result;
  });

  // --- GET /api/openclaw/workflows ---
  app.get('/workflows', async () => {
    return { workflows: clawService.listWorkflows() };
  });

  // --- POST /api/openclaw/workflows ---
  app.post('/workflows', async (req: FastifyRequest, reply: FastifyReply) => {
    const { name, description, steps } = req.body as {
      name: string; description: string; steps: any[];
    };
    if (!name || !steps?.length) {
      return reply.status(400).send({ error: 'name and steps required' });
    }
    const workflow = clawService.createWorkflow(name, description || '', steps);
    return { workflow };
  });

  // --- POST /api/openclaw/workflows/:id/execute ---
  app.post('/workflows/:id/execute', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { input } = req.body as { input?: Record<string, any> };
    try {
      const results = await clawService.executeWorkflow(id, input || {});
      return { results };
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  // --- GET /api/openclaw/log ---
  app.get('/log', async (req: FastifyRequest) => {
    const { limit } = req.query as { limit?: string };
    return { log: clawService.getExecutionLog(limit ? parseInt(limit) : 50) };
  });

  // --- GET /api/openclaw/agent-context ---
  app.get('/agent-context', async () => {
    return { context: clawService.formatForAgent() };
  });
}
