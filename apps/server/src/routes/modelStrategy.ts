import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  cleanupFailedStrategyModels,
  getModelStrategySnapshot,
  saveModelStrategy,
} from '../services/modelStrategy.js';

export async function modelStrategyRoutes(app: FastifyInstance) {
  const db = (app as any).db;

  app.get('/', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      return reply.send(getModelStrategySnapshot(db));
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const settings = saveModelStrategy(db, (req.body || {}) as any);
      return reply.send({ success: true, settings });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/cleanup-failed', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = cleanupFailedStrategyModels(db);
      return reply.send({ success: true, ...result });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}