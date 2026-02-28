// ============================================
// Health Check Route — rich diagnostic endpoint
//
// Reports: server version, uptime, migration status,
// rate limiter summary, WebSocket connection count,
// memory usage, and DB size.
// ============================================
import type { FastifyInstance } from 'fastify';
import { getMigrationStatus } from '../db/index.js';
import { userRateLimiter } from '../services/llm/userRateLimiter.js';

const startedAt = Date.now();

export async function healthRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => {
    const db = (app as any).db;

    // ── Migration status ──
    let migration = null;
    try {
      migration = getMigrationStatus(db);
    } catch { /* db not available */ }

    // ── Rate limiter snapshot ──
    let rateLimiter = null;
    try {
      rateLimiter = userRateLimiter.getStatus();
    } catch { /* limiter not init */ }

    // ── WebSocket connections ──
    let wsConnections = 0;
    try {
      const wsServer = (app as any).websocketServer;
      if (wsServer?.clients) {
        wsConnections = wsServer.clients.size;
      }
    } catch { /* ws not registered */ }

    // ── Memory usage ──
    const mem = process.memoryUsage();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.2.0',
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      memory: {
        rssBytes: mem.rss,
        heapUsedBytes: mem.heapUsed,
        heapTotalBytes: mem.heapTotal,
      },
      database: migration
        ? {
            schemaVersion: migration.currentVersion,
            totalMigrations: migration.totalMigrations,
            pendingMigrations: migration.pendingMigrations,
          }
        : null,
      rateLimiter: rateLimiter
        ? {
            ipBuckets: rateLimiter.ipBucketCount,
            userBuckets: rateLimiter.userBucketCount,
            blockedIps: rateLimiter.blockedIps.length,
            blockedUsers: rateLimiter.blockedUsers.length,
          }
        : null,
      websocket: {
        activeConnections: wsConnections,
      },
    };
  });
}
