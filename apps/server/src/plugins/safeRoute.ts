// ============================================
// Route Error Wrapper — consistent error handling for all routes
//
// Wraps route handlers in try/catch to prevent:
//   - Raw 500s with stack traces leaking to clients
//   - Unformatted error responses
//   - Silent failures
//
// Usage:
//   app.get('/foo', safeRoute(async (req, reply) => { ... }));
// ============================================
import type { FastifyRequest, FastifyReply } from 'fastify';

type RouteHandler = (req: FastifyRequest, reply: FastifyReply) => Promise<any>;

/**
 * Wrap a route handler with standardized error handling.
 * Catches any thrown error and returns a structured JSON response.
 */
export function safeRoute(handler: RouteHandler): RouteHandler {
  return async (req, reply) => {
    try {
      return await handler(req, reply);
    } catch (err: any) {
      const statusCode = err.statusCode || err.status || 500;
      const message = err.message || 'Internal server error';

      req.log.error({ err, url: req.url, method: req.method }, 'Route handler error');

      return reply.status(statusCode).send({
        error: message,
        statusCode,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
      });
    }
  };
}
