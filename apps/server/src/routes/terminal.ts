// ============================================
// Terminal Routes — REST API for managing terminal
// sessions (user + agent). WebSocket upgrade for
// real-time I/O is handled via SSE fallback since
// Fastify raw WS requires extra plugin.
// ============================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TerminalService } from '../services/terminal/index.js';
import { appConfig } from '../config.js';

const termService = new TerminalService();
const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCAL_DEV_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

function isLoopbackIp(ip: string): boolean {
  return LOOPBACK_IPS.has(ip);
}

export async function terminalRoutes(app: FastifyInstance) {
  // Terminal endpoints can execute commands; expose them to local machine only.
  app.addHook('onRequest', async (req, reply) => {
    if (!isLoopbackIp(req.ip)) {
      return reply.status(403).send({ error: 'Terminal endpoints are only available from localhost' });
    }
  });

  // ── Session CRUD ──

  /** POST /api/terminal/sessions — create a new terminal session */
  app.post('/sessions', async (req: FastifyRequest, reply: FastifyReply) => {
    const { label, cwd, owner } = (req.body || {}) as {
      label?: string; cwd?: string; owner?: 'user' | 'agent';
    };
    try {
      const session = termService.createSession({ label, cwd, owner });
      return { session };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  /** GET /api/terminal/sessions — list all sessions */
  app.get('/sessions', async () => {
    return { sessions: termService.listSessions() };
  });

  /** DELETE /api/terminal/sessions/:id — destroy a session */
  app.delete('/sessions/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    termService.destroySession(id);
    return { ok: true };
  });

  // ── I/O ──

  /** POST /api/terminal/write — send raw input to a terminal */
  app.post('/write', async (req: FastifyRequest, reply: FastifyReply) => {
    const { sessionId, input } = req.body as { sessionId: string; input: string };
    if (!sessionId || input === undefined) {
      return reply.status(400).send({ error: 'sessionId and input required' });
    }
    const ok = termService.writeToSession(sessionId, input);
    if (!ok) return reply.status(410).send({ error: 'Session not writable' });
    return { ok: true };
  });

  /** POST /api/terminal/exec — run a command and wait for output (LLM use) */
  app.post('/exec', async (req: FastifyRequest, reply: FastifyReply) => {
    const { sessionId, command, timeout } = req.body as {
      sessionId: string; command: string; timeout?: number;
    };
    if (!sessionId || !command) {
      return reply.status(400).send({ error: 'sessionId and command required' });
    }
    try {
      const result = await termService.execInSession(sessionId, command, timeout);
      return result;
    } catch (err: any) {
      return reply.status(410).send({ error: err.message });
    }
  });

  /** GET /api/terminal/buffer/:id — get output buffer for a session */
  app.get('/buffer/:id', async (req: FastifyRequest) => {
    const { id } = req.params as { id: string };
    const { lastN } = req.query as { lastN?: string };
    const lines = termService.getBuffer(id, lastN ? parseInt(lastN) : undefined);
    return { lines };
  });

  /** POST /api/terminal/resize — resize terminal dimensions */
  app.post('/resize', async (req: FastifyRequest) => {
    const { sessionId, cols, rows } = req.body as {
      sessionId: string; cols: number; rows: number;
    };
    termService.resizeSession(sessionId, cols, rows);
    return { ok: true };
  });

  // ── SSE Stream — real-time output without WebSocket plugin ──

  /** GET /api/terminal/stream/:id — SSE stream of terminal output */
  app.get('/stream/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const sessions = termService.listSessions();
    const session = sessions.find(s => s.id === id);
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    const reqOrigin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
    const allowedOrigin = reqOrigin && LOCAL_DEV_ORIGIN_RE.test(reqOrigin)
      ? reqOrigin
      : appConfig.frontend.url;

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': allowedOrigin,
    });

    const cleanup = termService.onOutput(id, (ev) => {
      const data = JSON.stringify(ev);
      reply.raw.write(`data: ${data}\n\n`);
    });

    // Clean up on disconnect
    req.raw.on('close', () => {
      cleanup();
    });
  });

  // Cleanup hook — destroy all sessions when server shuts down
  app.addHook('onClose', async () => {
    termService.destroyAll();
  });
}
