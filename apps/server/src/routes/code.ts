// ============================================
// Code Intelligence Routes
// Symbol-level query API backed by the
// HierarchicalCodeIndex. Lets the agent (and
// small/local models) query the codebase via
// HTTP instead of reading raw files.
//
// Endpoints:
//   POST /api/code/index        — build/rebuild index for a project
//   GET  /api/code/symbols      — search symbols in a project
//   GET  /api/code/file-symbols — all symbols in a single file
//   GET  /api/code/get-function — return a function body only
//   GET  /api/code/find         — find definition location of a symbol
//   GET  /api/code/stats        — index stats for a project
// ============================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import { HierarchicalCodeIndex } from '../services/agent/indexer/hierarchicalIndex.js';
import { MemoryService } from '../services/memory/index.js';

export async function codeRoutes(app: FastifyInstance) {
  const db = (app as any).db;
  const memory = new MemoryService(db);

  // One index instance per project root (lazy-built on first use)
  const indexCache = new Map<string, HierarchicalCodeIndex>();

  function getIndex(root: string): HierarchicalCodeIndex {
    if (!indexCache.has(root)) {
      const idx = new HierarchicalCodeIndex(db);
      // Build index if never done; this is fast for small projects.
      // For large projects use POST /api/code/index to trigger explicitly.
      try { idx.buildIndex(root); } catch { /* ignore first-time errors */ }
      indexCache.set(root, idx);
    }
    return indexCache.get(root)!;
  }

  // ── Helper: resolve & validate project root ──
  function resolveProject(projectId: string): string | null {
    const project = memory.getProject(projectId);
    return project?.rootPath || null;
  }

  // ── POST /api/code/index — build hierarchical index ──
  app.post('/index', async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = req.body as { projectId: string };
    if (!projectId) return reply.status(400).send({ error: 'projectId required' });

    const root = resolveProject(projectId);
    if (!root) return reply.status(404).send({ error: 'Project not found' });

    try {
      // Force rebuild by creating a fresh index
      const idx = new HierarchicalCodeIndex(db);
      const stats = idx.buildIndex(root);
      indexCache.set(root, idx);
      return { ok: true, stats };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── GET /api/code/symbols — semantic/name search ──
  app.get('/symbols', async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId, query, limit } = req.query as {
      projectId: string; query: string; limit?: string;
    };
    if (!projectId || !query) return reply.status(400).send({ error: 'projectId and query required' });

    const root = resolveProject(projectId);
    if (!root) return reply.status(404).send({ error: 'Project not found' });

    try {
      const results = getIndex(root).find(query, limit ? parseInt(limit) : 20);
      return { results };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── GET /api/code/file-symbols — all symbols in one file ──
  app.get('/file-symbols', async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId, filePath: relPath } = req.query as {
      projectId: string; filePath: string;
    };
    if (!projectId || !relPath) return reply.status(400).send({ error: 'projectId and filePath required' });

    const root = resolveProject(projectId);
    if (!root) return reply.status(404).send({ error: 'Project not found' });

    try {
      const results = getIndex(root).find(relPath, 100);
      const fileSymbols = results.filter(r => r.filePath?.includes(relPath.replace(/\\/g, '/')));
      return { symbols: fileSymbols };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── GET /api/code/get-function — return function body only ──
  // This is the key "token saver" — returns one function, not the whole file.
  app.get('/get-function', async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId, filePath: relPath, name } = req.query as {
      projectId: string; filePath: string; name: string;
    };
    if (!projectId || !relPath || !name) {
      return reply.status(400).send({ error: 'projectId, filePath and name required' });
    }

    const root = resolveProject(projectId);
    if (!root) return reply.status(404).send({ error: 'Project not found' });

    try {
      const absPath = path.resolve(root, relPath);
      if (!absPath.startsWith(path.resolve(root))) {
        return reply.status(400).send({ error: 'Path traversal denied' });
      }
      const results = getIndex(root).find(name, 50);
      const match = results.find(r =>
        r.label === name &&
        r.filePath &&
        (r.filePath.endsWith(relPath) || r.filePath.includes(relPath.replace(/\\/g, '/'))) &&
        r.lineStart != null && r.lineEnd != null
      );

      if (!match || match.lineStart == null || match.lineEnd == null) {
        return reply.status(404).send({ error: `Function '${name}' not found in '${relPath}'` });
      }

      const content = expandNodeContent(root, match.filePath!, match.lineStart, match.lineEnd);
      return {
        name,
        filePath: relPath,
        lineStart: match.lineStart,
        lineEnd: match.lineEnd,
        content,
        tokenEstimate: Math.ceil(content.length / 4),
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── GET /api/code/find — find where a symbol is defined ──
  app.get('/find', async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId, symbol } = req.query as { projectId: string; symbol: string };
    if (!projectId || !symbol) return reply.status(400).send({ error: 'projectId and symbol required' });

    const root = resolveProject(projectId);
    if (!root) return reply.status(404).send({ error: 'Project not found' });

    try {
      const results = getIndex(root).find(symbol, 10);
      const defs = results.filter(r =>
        ['function', 'method', 'class', 'interface', 'type'].includes(r.nodeType)
      );
      return { definitions: defs };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── GET /api/code/stats — index status ──
  app.get('/stats', async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = req.query as { projectId: string };
    if (!projectId) return reply.status(400).send({ error: 'projectId required' });

    const root = resolveProject(projectId);
    if (!root) return reply.status(404).send({ error: 'Project not found' });

    try {
      const stats = getIndex(root).getStats();
      return { stats };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── GET /api/code/tree — token-budget tree overview ──
  app.get('/tree', async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId, maxTokens } = req.query as { projectId: string; maxTokens?: string };
    if (!projectId) return reply.status(400).send({ error: 'projectId required' });

    const root = resolveProject(projectId);
    if (!root) return reply.status(404).send({ error: 'Project not found' });

    try {
      const budget = maxTokens ? parseInt(maxTokens) : 800;
      const tree = getIndex(root).formatAtDepth(budget);
      return { tree };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}

// ── Helper: read specific lines from a file ──
function expandNodeContent(
  root: string,
  filePath: string,
  lineStart: number,
  lineEnd: number,
): string {
  try {
    const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);
    const raw = fs.readFileSync(absPath, 'utf-8');
    const lines = raw.split('\n');
    return lines.slice(Math.max(0, lineStart - 1), lineEnd).join('\n');
  } catch {
    return '';
  }
}
