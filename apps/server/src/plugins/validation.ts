// ============================================
// Zod Validation Plugin — thin preHandler hook
// Schemas are defined in ./schemas/ and aggregated via schemas/index.ts
// ============================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import fp from 'fastify-plugin';
import { schemaMap } from './schemas/index.js';

// ── Build flat lookup: "METHOD /api/prefix/path" → schema ────
function buildRouteLookup(): Map<string, z.ZodType> {
  const lookup = new Map<string, z.ZodType>();
  for (const [prefix, routes] of Object.entries(schemaMap)) {
    for (const [methodPath, schema] of Object.entries(routes)) {
      const [method, path] = methodPath.split(' ');
      const fullPath = `${method} ${prefix}${path}`;
      lookup.set(fullPath, schema);
    }
  }
  return lookup;
}

// ── Fastify Plugin ────
async function validationPluginFn(app: FastifyInstance) {
  const routeLookup = buildRouteLookup();

  // Build a regex-ready lookup for parametric routes
  const paramRoutes: Array<{ pattern: RegExp; schema: z.ZodType }> = [];
  const staticRoutes = new Map<string, z.ZodType>();

  for (const [key, schema] of routeLookup) {
    if (key.includes(':')) {
      const regexStr = key.replace(/:[^/]+/g, '[^/]+');
      paramRoutes.push({ pattern: new RegExp(`^${regexStr}$`), schema });
    } else {
      staticRoutes.set(key, schema);
    }
  }

  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return;

    const lookupKey = `${req.method} ${req.url.split('?')[0]}`;

    let schema = staticRoutes.get(lookupKey);

    if (!schema) {
      for (const route of paramRoutes) {
        if (route.pattern.test(lookupKey)) {
          schema = route.schema;
          break;
        }
      }
    }

    if (!schema) return;

    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        details: result.error.issues.map(e => ({
          path: e.path.join('.'),
          message: e.message,
          code: e.code,
        })),
      });
    }

    (req as any).body = result.data;
  });
}

export const validationPlugin = fp(validationPluginFn, {
  name: 'validation',
  fastify: '5.x',
});
