// ============================================
// Midwife Routes — Bird-feeding controls
// Model assignment, cooldowns, dataset generation
// ============================================
import { FastifyInstance } from 'fastify';
import { MidwifeService } from '../services/midwife/index.js';
import type { MidwifeTaskType } from '../services/midwife/index.js';

export async function midwifeRoutes(app: FastifyInstance) {
  const db = (app as any).db;
  const midwife = new MidwifeService(db);

  // ── Status ──
  app.get('/status', async () => midwife.getStatus());

  // ── Config ──
  app.get('/config', async () => midwife.getConfig());

  app.put('/config', async (req) => {
    const body = req.body as any;
    return { success: true, config: midwife.updateConfig(body) };
  });

  // ── Tasks ──
  app.get('/tasks', async () => ({ tasks: midwife.getTasks() }));

  app.put('/tasks/:taskType', async (req) => {
    const { taskType } = req.params as { taskType: MidwifeTaskType };
    const body = req.body as any;
    const updated = midwife.updateTask(taskType, body);
    if (!updated) return { success: false, error: 'Task not found' };
    return { success: true, task: updated };
  });

  // ── Start / Stop ──
  app.post('/start', async () => midwife.start());
  app.post('/stop', async () => midwife.stop());

  // ── History ──
  app.get('/history', async (req) => {
    const { limit } = req.query as { limit?: string };
    return { history: midwife.getHistory(limit ? parseInt(limit) : 50) };
  });
}
