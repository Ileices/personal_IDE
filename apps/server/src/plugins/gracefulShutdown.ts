// ============================================
// Graceful Shutdown — clean exit on SIGINT / SIGTERM
//
// Responsibilities:
//   1. Close database connection (WAL checkpoint)
//   2. Destroy per-user rate limiter (clear intervals)
//   3. Close all WebSocket connections
//   4. Let Fastify drain in-flight requests
//   5. Catch uncaught exceptions / unhandled rejections
// ============================================
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { userRateLimiter } from '../services/llm/userRateLimiter.js';

const SHUTDOWN_TIMEOUT_MS = 10_000; // force-kill after 10s

export function registerGracefulShutdown(app: FastifyInstance): void {
  let shuttingDown = false;

  async function shutdown(signal: string) {
    if (shuttingDown) return; // prevent double-shutdown
    shuttingDown = true;

    console.log(`\n🛑 ${signal} received — shutting down gracefully…`);

    // 1. Stop accepting new connections
    const forceTimer = setTimeout(() => {
      console.error('⏰ Shutdown timeout — forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    try {
      // 2. Destroy rate limiter cleanup interval
      try {
        userRateLimiter.destroy();
        console.log('  ✓ Rate limiter cleaned up');
      } catch { /* already destroyed */ }

      // 3. Close WebSocket connections
      try {
        const wsServer = (app as any).websocketServer;
        if (wsServer?.clients) {
          for (const client of wsServer.clients) {
            client.close(1001, 'Server shutting down');
          }
          console.log(`  ✓ ${wsServer.clients.size} WebSocket connection(s) closed`);
        }
      } catch { /* ws not registered */ }

      // 4. Close Fastify (drains in-flight requests)
      await app.close();
      console.log('  ✓ Fastify server closed');

      // 5. Close database + WAL checkpoint
      try {
        const db: Database.Database = (app as any).db;
        if (db && typeof db.close === 'function') {
          db.pragma('wal_checkpoint(TRUNCATE)');
          db.close();
          console.log('  ✓ Database closed (WAL checkpointed)');
        }
      } catch { /* db not available */ }

      clearTimeout(forceTimer);
      console.log('👋 Shutdown complete');
      process.exit(0);
    } catch (err) {
      console.error('❌ Error during shutdown:', err);
      clearTimeout(forceTimer);
      process.exit(1);
    }
  }

  // ── Listen for termination signals ──
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // ── Catch uncaught exceptions — log and exit ──
  process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught exception:', err);
    shutdown('uncaughtException').catch(() => process.exit(1));
  });

  // ── Catch unhandled promise rejections ──
  process.on('unhandledRejection', (reason) => {
    console.error('💥 Unhandled rejection:', reason);
    // Don't force shutdown on rejections — just log
    // A single unhandled rejection shouldn't kill the server
  });
}
