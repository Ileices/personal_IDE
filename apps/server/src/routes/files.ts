// ============================================
// Files Routes - Filesystem REST API
// ============================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { existsSync } from 'fs';
import * as fs from '../services/filesystem/index.js';

export async function filesRoutes(app: FastifyInstance) {
  // --- GET /api/files/tree?root=PATH ---
  app.get('/tree', async (req: FastifyRequest, reply: FastifyReply) => {
    const { root, depth } = req.query as { root: string; depth?: string };
    if (!root) return reply.status(400).send({ error: 'root query param required' });
    if (!existsSync(root)) return reply.status(404).send({ error: 'Directory not found' });

    const tree = fs.listFileTree(root, depth ? parseInt(depth) : 5);
    return { tree };
  });

  // --- GET /api/files/read?root=PATH&path=FILE ---
  app.get('/read', async (req: FastifyRequest, reply: FastifyReply) => {
    const { root, path } = req.query as { root: string; path: string };
    if (!root || !path) return reply.status(400).send({ error: 'root and path required' });

    try {
      const content = fs.readFile(root, path);
      return content;
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  // --- POST /api/files/write ---
  app.post('/write', async (req: FastifyRequest, reply: FastifyReply) => {
    const { root, path, content, backup } = req.body as { root: string; path: string; content: string; backup?: boolean };
    if (!root || !path || content === undefined) {
      return reply.status(400).send({ error: 'root, path, and content required' });
    }

    try {
      fs.writeFile(root, path, content, backup !== false);
      return { success: true, path };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // --- POST /api/files/create ---
  app.post('/create', async (req: FastifyRequest, reply: FastifyReply) => {
    const { root, path, content } = req.body as { root: string; path: string; content?: string };
    if (!root || !path) return reply.status(400).send({ error: 'root and path required' });

    try {
      fs.createPath(root, path, content);
      return { success: true, path };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // --- DELETE /api/files/delete ---
  app.delete('/delete', async (req: FastifyRequest, reply: FastifyReply) => {
    const { root, path } = req.query as { root: string; path: string };
    if (!root || !path) return reply.status(400).send({ error: 'root and path required' });

    try {
      fs.deletePath(root, path);
      return { success: true };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // --- POST /api/files/rename ---
  app.post('/rename', async (req: FastifyRequest, reply: FastifyReply) => {
    const { root, oldPath, newPath } = req.body as { root: string; oldPath: string; newPath: string };
    if (!root || !oldPath || !newPath) {
      return reply.status(400).send({ error: 'root, oldPath, and newPath required' });
    }

    try {
      fs.renamePath(root, oldPath, newPath);
      return { success: true };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // --- GET /api/files/search?root=PATH&query=TEXT ---
  app.get('/search', async (req: FastifyRequest, reply: FastifyReply) => {
    const { root, query, maxResults } = req.query as { root: string; query: string; maxResults?: string };
    if (!root || !query) return reply.status(400).send({ error: 'root and query required' });

    const results = fs.searchFiles(root, query, {
      maxResults: maxResults ? parseInt(maxResults) : 100,
    });
    return { results };
  });

  // --- GET /api/files/list?root=PATH ---
  app.get('/list', async (req: FastifyRequest, reply: FastifyReply) => {
    const { root } = req.query as { root: string };
    if (!root) return reply.status(400).send({ error: 'root required' });
    if (!existsSync(root)) return reply.status(404).send({ error: 'Directory not found' });

    const files = fs.listAllFiles(root);
    return { files, count: files.length };
  });
}
