// ============================================================
// Stability Monitor Routes
// ============================================================
import { FastifyInstance, FastifyRequest } from 'fastify';
import { StabilityMonitor } from '../services/stabilityMonitor/index.js';
import { safeRoute } from '../plugins/safeRoute.js';

export async function stabilityRoutes(app: FastifyInstance) {
  const db = (app as any).db;
  const monitor = new StabilityMonitor(db);

  // GET /api/stability/window  — last 10 snapshots + health status
  app.get('/window', safeRoute(async () => {
    return {
      health: monitor.healthStatus(),
      snapshots: monitor.getWindow(),
    };
  }));

  // POST /api/stability/record  — record a new snapshot
  // Body: { cycle, processAlive, testsFailed, testsTotal, avgBlameScore, loopDetected, buildtagRejectionRate }
  app.post('/record', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    const result = monitor.record({
      cycle: body.cycle ?? 0,
      timestamp: new Date().toISOString(),
      processAlive: body.processAlive ?? true,
      testsFailed: body.testsFailed ?? 0,
      testsTotal: body.testsTotal ?? 0,
      avgBlameScore: body.avgBlameScore ?? 0,
      loopDetected: body.loopDetected ?? false,
      buildtagRejectionRate: body.buildtagRejectionRate ?? 0,
    });
    return result;
  }));
}
