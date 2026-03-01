// ============================================
// Midwife Routes — Bird-feeding controls
// Model assignment, cooldowns, dataset generation
// ============================================
import { FastifyInstance } from 'fastify';
import { MidwifeService } from '../services/midwife/index.js';
import type { MidwifeTaskType } from '../services/midwife/index.js';
import { safeRoute } from '../plugins/safeRoute.js';

export async function midwifeRoutes(app: FastifyInstance) {
  const db = (app as any).db;
  const midwife = new MidwifeService(db);

  // Auto-start feeding 30 seconds after server boot (gives Nano Sea time to start)
  midwife.autoStart(30000);

  // ── Status ──
  app.get('/status', safeRoute(async () => midwife.getStatus()));

  // ── Config ──
  app.get('/config', safeRoute(async () => midwife.getConfig()));

  app.put('/config', safeRoute(async (req) => {
    const body = req.body as any;
    return { success: true, config: midwife.updateConfig(body) };
  }));

  // ── Tasks ──
  app.get('/tasks', safeRoute(async () => ({ tasks: midwife.getTasks() })));

  app.put('/tasks/:taskType', safeRoute(async (req) => {
    const { taskType } = req.params as { taskType: MidwifeTaskType };
    const body = req.body as any;
    const updated = midwife.updateTask(taskType, body);
    if (!updated) return { success: false, error: 'Task not found' };
    return { success: true, task: updated };
  }));

  // ── Start / Stop ──
  app.post('/start', safeRoute(async () => midwife.start()));
  app.post('/stop', safeRoute(async () => midwife.stop()));

  // ── History ──
  app.get('/history', safeRoute(async (req) => {
    const { limit } = req.query as { limit?: string };
    return { history: midwife.getHistory(limit ? parseInt(limit) : 50) };
  }));
}
