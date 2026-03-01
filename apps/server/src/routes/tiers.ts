// ============================================
// Tier Routes
// Project tier detection, language decisions
// ============================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ProjectTierEngine } from '../services/analysis/projectTierEngine.js';
import { safeRoute } from '../plugins/safeRoute.js';

export async function tierRoutes(app: FastifyInstance) {
  const db = (app as any).db;
  const engine = new ProjectTierEngine(db);

  // Detect tier for a project
  app.post('/detect', safeRoute(async (req: FastifyRequest) => {
    const { projectId, projectRoot } = req.body as { projectId: string; projectRoot: string };
    if (!projectId || !projectRoot) {
      return { error: 'projectId and projectRoot are required' };
    }
    const config = engine.detectTier(projectId, projectRoot);
    return { config };
  }));

  // Get stored tier config
  app.get('/:projectId', safeRoute(async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = req.params as { projectId: string };
    const config = engine.getTierConfig(projectId);
    if (!config) return reply.status(404).send({ error: 'No tier config found. Run /detect first.' });
    return { config };
  }));

  // Decide language for a task
  app.post('/decide-language', safeRoute(async (req: FastifyRequest) => {
    const { taskDescription } = req.body as { taskDescription: string };
    if (!taskDescription) {
      return { error: 'taskDescription is required' };
    }
    const decision = engine.decideLanguageFromTask(taskDescription);
    return { decision };
  }));

  // Get formatted context for LLM
  app.get('/context/:projectId', safeRoute(async (req: FastifyRequest) => {
    const { projectId } = req.params as { projectId: string };
    const context = engine.formatForLLM(projectId);
    return { context };
  }));
}
