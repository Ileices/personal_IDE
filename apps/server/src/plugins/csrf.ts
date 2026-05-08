// ============================================
// CSRF Protection Plugin — Origin/Referer Check
// Lightweight CSRF guard for Fastify using the
// "Origin header" validation pattern. No tokens
// needed since the frontend is SPA (same-origin).
// ============================================
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { randomBytes } from 'crypto';

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
const CSRF_COOKIE_NAME = 'csrf_token';

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(value);
  }
  return out;
}

function ensureCsrfCookie(request: FastifyRequest, reply: FastifyReply): string {
  const cookies = parseCookies(request.headers.cookie);
  const existing = cookies[CSRF_COOKIE_NAME];
  if (existing) return existing;

  const token = randomBytes(24).toString('base64url');
  // JS-readable cookie (HttpOnly=false) for double-submit CSRF header.
  // SameSite=Lax prevents most cross-site sends while preserving normal SPA navigation.
  reply.header(
    'Set-Cookie',
    `${CSRF_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; SameSite=Lax`
  );
  return token;
}

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
    // Always ensure token cookie exists so frontend can mirror it via X-CSRF-Token.
    ensureCsrfCookie(request, reply);

    // Safe methods don't need CSRF protection
    if (!unsafeMethods.has(request.method)) return;

    // Exempt specific paths
    if (exemptPaths.has(request.url) || exemptPaths.has(request.routeOptions?.url || '')) return;

    const origin = request.headers.origin;
    const referer = request.headers.referer;
    const cookies = parseCookies(request.headers.cookie);
    const csrfCookie = cookies[CSRF_COOKIE_NAME] || '';
    const csrfHeader = (request.headers['x-csrf-token'] as string | undefined) || '';

    const verifyDoubleSubmit = (): FastifyReply | void => {
      if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
        return reply.status(403).send({
          error: 'CSRF validation failed',
          message: 'CSRF token missing or mismatch',
        });
      }
    };

    // If Origin header is present, it must match
    if (origin) {
      const cleanOrigin = origin.replace(/\/+$/, '');
      if (isAllowedOrigin(cleanOrigin)) {
        // Same-origin validation is sufficient here; token is additive hardening.
        // If a token header is supplied, it must match the CSRF cookie.
        if (csrfHeader) return verifyDoubleSubmit();
        return;
      }
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
        if (isAllowedOrigin(refOrigin)) {
          // Same-origin validation is sufficient here; token is additive hardening.
          // If a token header is supplied, it must match the CSRF cookie.
          if (csrfHeader) return verifyDoubleSubmit();
          return;
        }
      } catch { /* invalid referer URL */ }
      return reply.status(403).send({
        error: 'CSRF validation failed',
        message: 'Referer origin not allowed',
      });
    }

    // No Origin and no Referer on unsafe methods is rejected.
    // Smoke test (expected 403):
    //   curl -i -X POST http://127.0.0.1:3001/api/agent/start -H "Content-Type: application/json" -d '{}'
    return reply.status(403).send({
      error: 'CSRF validation failed',
      message: 'Origin/Referer required for unsafe request',
    });
  });
}

export default fp(csrfPlugin, {
  name: 'csrf-protection',
  fastify: '5.x',
});
