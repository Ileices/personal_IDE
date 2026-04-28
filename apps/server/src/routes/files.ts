// ============================================
// Files Routes - Filesystem REST API
// ============================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { existsSync, mkdirSync, cpSync, statSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
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

  // --- POST /api/files/reveal --- Reveal file in OS file explorer ---
  app.post('/reveal', async (req: FastifyRequest, reply: FastifyReply) => {
    const { path: filePath } = req.body as { path: string };
    if (!filePath) return reply.status(400).send({ error: 'path required' });

    const platform = process.platform;
    try {
      if (platform === 'win32') {
        // Use /select to highlight the file in Explorer
        execSync(`explorer /select,"${filePath.replace(/\//g, '\\')}"`, { timeout: 5000 });
      } else if (platform === 'darwin') {
        execSync(`open -R "${filePath}"`, { timeout: 5000 });
      } else {
        // Linux: open parent directory with xdg-open
        const parentDir = filePath.substring(0, filePath.lastIndexOf('/')) || '/';
        execSync(`xdg-open "${parentDir}"`, { timeout: 5000 });
      }
      return { ok: true };
    } catch (err: any) {
      // Best effort — don't error out to client
      return { ok: false, error: err.message };
    }
  });

  // --- POST /api/files/backup --- Timestamped backup of project root ---
  app.post('/backup', async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectRoot } = req.body as { projectRoot?: string };
    if (!projectRoot) return reply.status(400).send({ error: 'projectRoot required' });
    if (!existsSync(projectRoot)) return reply.status(404).send({ error: 'projectRoot not found' });

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
      const backupsDir = join(projectRoot, '.backups');
      const backupPath = join(backupsDir, `backup_${timestamp}`);
      mkdirSync(backupsDir, { recursive: true });
      // Only copy files tracked by git if possible; fall back to full copy
      try {
        const files = execSync('git ls-files --cached --others --exclude-standard', {
          cwd: projectRoot, timeout: 5000, encoding: 'utf8',
        }).trim().split('\n').filter(Boolean);
        mkdirSync(backupPath, { recursive: true });
        for (const f of files.slice(0, 2000)) {
          const src = join(projectRoot, f);
          const dest = join(backupPath, f);
          if (!existsSync(src)) continue;
          const stat = statSync(src);
          if (stat.isFile() && stat.size < 5 * 1024 * 1024) {
            mkdirSync(join(backupPath, f.split('/').slice(0, -1).join('/')), { recursive: true });
            cpSync(src, dest);
          }
        }
      } catch {
        // git not available or failed — skip backup gracefully
        return { backupPath: null, skipped: true, reason: 'git not available' };
      }
      return { backupPath, timestamp };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
