// ============================================================
// Context Window Manager Routes
// ============================================================
import { FastifyInstance, FastifyRequest } from 'fastify';
import { ContextWindowManager } from '../services/contextWindowManager/index.js';
import { safeRoute } from '../plugins/safeRoute.js';

export async function contextWindowRoutes(app: FastifyInstance) {
  const db = (app as any).db;
  const mgr = new ContextWindowManager(db);

  // POST /api/context-window/assemble
  // Body: { slots: [{key, content, tokens?}], tier: number, agentId: string }
  app.post('/assemble', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    const result = mgr.assemble(
      body.slots ?? [],
      body.tier ?? 4,
      body.agentId ?? 'unknown',
    );
    return result;
  }));
}
