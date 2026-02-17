// ============================================
// Checkpoint & Versioning Routes
// ============================================
import type { FastifyInstance } from 'fastify';
import { CheckpointService } from '../services/checkpoint/index.js';

export async function checkpointRoutes(app: FastifyInstance): Promise<void> {
  const db = (app as any).db;
  const service = new CheckpointService(db);

  /** GET /api/checkpoints/:projectId - List checkpoints */
  app.get<{ Params: { projectId: string } }>('/:projectId', async (request) => {
    const { projectId } = request.params;
    return service.listCheckpoints(projectId);
  });

  /** POST /api/checkpoints/:projectId - Create a checkpoint */
  app.post<{ Params: { projectId: string }; Body: { projectRoot: string; description?: string } }>(
    '/:projectId',
    async (request) => {
      const { projectId } = request.params;
      const { projectRoot, description } = request.body;
      const checkpoint = service.createCheckpoint(
        projectRoot, projectId, '', 0, description || 'Manual checkpoint', ''
      );
      return checkpoint;
    }
  );

  /** POST /api/checkpoints/:projectId/rollback - Rollback to a checkpoint */
  app.post<{ Params: { projectId: string }; Body: { checkpointId: string; projectRoot: string } }>(
    '/:projectId/rollback',
    async (request, reply) => {
      const { projectId } = request.params;
      const { checkpointId, projectRoot } = request.body;
      const checkpoint = service.listCheckpoints(projectId).find(c => c.id === checkpointId);
      if (!checkpoint) {
        return reply.status(404).send({ error: 'Checkpoint not found' });
      }
      service.rollback(projectRoot, checkpointId);
      return { success: true, rolledBackTo: checkpoint.label };
    }
  );

  /** GET /api/checkpoints/:projectId/diff - Get diff between checkpoints */
  app.get<{ Params: { projectId: string }; Querystring: { from: string; to?: string; projectRoot: string } }>(
    '/:projectId/diff',
    async (request) => {
      const { projectId } = request.params;
      const { from, to, projectRoot } = request.query;
      return { diff: service.getDiff(projectRoot, from, to || 'HEAD') };
    }
  );
}
