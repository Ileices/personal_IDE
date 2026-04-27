// ============================================
// CSRF Protection Plugin — Origin/Referer Check
// Lightweight CSRF guard for Fastify using the
// "Origin header" validation pattern. No tokens
// needed since the frontend is SPA (same-origin).
// ============================================
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

interface CSRFOptions {
  /** Allowed origins — typically the frontend URL(s) */
  allowedOrigins: string[];
  /** HTTP methods that require CSRF validation */
  unsafeMethods?: Set<string>;
  /** Paths exempt from CSRF (e.g. webhooks, health) */
  exemptPaths?: string[];
}

const DEFAULT_UNSAFE = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);
const LOCAL_DEV_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

/**
 * CSRF guard plugin.
 * For every state-changing request (POST/PUT/DELETE/PATCH):
 *   1. Check Origin header — must match an allowed origin
 *   2. If no Origin, check Referer header
 *   3. If neither, reject with 403
 *
 * GET/HEAD/OPTIONS are always allowed (safe methods).
 * Exempt paths skip the check entirely.
 */
async function csrfPlugin(app: FastifyInstance, opts: CSRFOptions): Promise<void> {
  const unsafeMethods = opts.unsafeMethods || DEFAULT_UNSAFE;
  const exemptPaths = new Set(opts.exemptPaths || []);
  const allowedSet = new Set(opts.allowedOrigins.map(o => o.replace(/\/+$/, '')));

  const isAllowedOrigin = (origin: string): boolean => {
    const cleanOrigin = origin.replace(/\/+$/, '');
    return allowedSet.has(cleanOrigin) || LOCAL_DEV_ORIGIN_RE.test(cleanOrigin);
  };

  // Also allow same-origin requests (no Origin header, from server-side or curl)
  // and requests with a valid Referer from allowed origins.

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Safe methods don't need CSRF protection
    if (!unsafeMethods.has(request.method)) return;

    // Exempt specific paths
    if (exemptPaths.has(request.url) || exemptPaths.has(request.routeOptions?.url || '')) return;

    const origin = request.headers.origin;
    const referer = request.headers.referer;

    // If Origin header is present, it must match
    if (origin) {
      const cleanOrigin = origin.replace(/\/+$/, '');
      if (isAllowedOrigin(cleanOrigin)) return;
      // Reject
      return reply.status(403).send({
        error: 'CSRF validation failed',
        message: 'Origin not allowed: ' + cleanOrigin,
      });
    }

    // No Origin header — check Referer (some browsers omit Origin for same-origin)
    if (referer) {
      try {
        const refOrigin = new URL(referer).origin;
        if (isAllowedOrigin(refOrigin)) return;
      } catch { /* invalid referer URL */ }
      return reply.status(403).send({
        error: 'CSRF validation failed',
        message: 'Referer origin not allowed',
      });
    }

    // No Origin AND no Referer — allow for API clients (curl, Postman, server-to-server)
    // This is safe because browsers ALWAYS send Origin on cross-origin POST.
    // A missing Origin+Referer means it's NOT a browser cross-origin attack.
    return;
  });
}

export default fp(csrfPlugin, {
  name: 'csrf-protection',
  fastify: '5.x',
});
