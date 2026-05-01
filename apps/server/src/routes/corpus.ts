// ============================================
// Corpus Routes — Project corpus ingestion and
// manifesto generation for small/local models.
//
// The "corpus" is a large collection of files
// (e.g. a game design doc, an entire codebase,
// a product spec) that describe one big-picture
// goal. The agent needs a compressed "manifesto"
// that fits in a 512-token window so even tiny
// models can orient themselves.
//
// Endpoints:
//   POST /api/corpus/ingest    — ingest a folder as the project corpus
//   GET  /api/corpus/manifesto — get compressed manifesto for a project
//   POST /api/corpus/manifesto — generate/regenerate manifesto via LLM
//   GET  /api/corpus/stats     — corpus statistics
// ============================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import type Database from 'better-sqlite3';
import { MemoryService } from '../services/memory/index.js';
import { listAllFiles } from '../services/filesystem/index.js';

// ── Schema helpers ──
const TEXT_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.cpp', '.c',
  '.cs', '.swift', '.kt', '.rb', '.php', '.html', '.css', '.scss', '.md',
  '.txt', '.json', '.yaml', '.yml', '.toml', '.xml', '.sh', '.ps1', '.env.example',
]);

const IGNORE_DIRS = new Set(['node_modules', '.git', '__pycache__', '.venv', 'dist', 'build', '.next']);

function isTextFile(filePath: string): boolean {
  return TEXT_EXTS.has(path.extname(filePath).toLowerCase());
}

function safeReadLines(filePath: string, maxLines = 100): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    if (lines.length <= maxLines) return content;
    return lines.slice(0, maxLines).join('\n') + `\n... (${lines.length - maxLines} lines truncated)`;
  } catch {
    return '';
  }
}

// ── Token estimate ──
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function corpusRoutes(app: FastifyInstance) {
  const db = (app as any).db as Database.Database;
  const memory = new MemoryService(db);

  // Ensure corpus table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_corpus (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      manifesto TEXT,
      file_count INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      ingest_path TEXT,
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now'))
    )
  `);

  function resolveProject(projectId: string) {
    return memory.getProject(projectId);
  }

  // ── POST /api/corpus/ingest — scan a folder and build corpus index ──
  app.post('/ingest', async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId, folderPath, maxFilesPerDir = 50, filePaths = [], inlineDocs = [] } = req.body as {
      projectId: string;
      folderPath?: string;
      maxFilesPerDir?: number;
      filePaths?: string[];
      inlineDocs?: Array<{ name?: string; type?: string; content?: string }>;
    };

    if (!projectId) return reply.status(400).send({ error: 'projectId required' });

    const project = resolveProject(projectId);
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const scanRoot = folderPath
      ? path.resolve(folderPath)
      : project.rootPath;

    if (!fs.existsSync(scanRoot)) {
      return reply.status(400).send({ error: `Folder not found: ${scanRoot}` });
    }

    // Walk and collect text files
    const files: string[] = [];
    function walk(dir: string) {
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (e.isDirectory()) {
          if (!IGNORE_DIRS.has(e.name)) walk(path.join(dir, e.name));
        } else if (isTextFile(e.name)) {
          files.push(path.join(dir, e.name));
          if (files.length > 2000) return; // hard cap
        }
      }
    }
    walk(scanRoot);

    // Add explicit user file dumps (single files) on top of folder scan.
    // This allows "drop these docs" workflows without requiring whole-folder crawls.
    for (const raw of filePaths) {
      const resolved = path.resolve(String(raw || ''));
      if (!resolved || !fs.existsSync(resolved)) continue;
      try {
        const st = fs.statSync(resolved);
        if (!st.isFile()) continue;
        if (!isTextFile(resolved)) continue;
        files.push(resolved);
      } catch {
        // ignore invalid paths
      }
    }

    const uniqueFiles = [...new Set(files)].slice(0, 4000);

    // Build a compact structural summary (no full file content — just headers/signatures)
    const summaryLines: string[] = [`# Project Corpus: ${path.basename(scanRoot)}`];
    summaryLines.push(`Files: ${uniqueFiles.length}`);
    summaryLines.push(`Inline docs: ${inlineDocs.length}`);
    summaryLines.push('');

    // Group by directory
    const byDir = new Map<string, string[]>();
    for (const f of uniqueFiles) {
      const rel = path.relative(scanRoot, f);
      const dir = path.dirname(rel);
      if (!byDir.has(dir)) byDir.set(dir, []);
      byDir.get(dir)!.push(path.basename(f));
    }

    for (const [dir, fileNames] of byDir) {
      summaryLines.push(`## ${dir === '.' ? '(root)' : dir}`);
      for (const fn of fileNames.slice(0, maxFilesPerDir)) {
        summaryLines.push(`  - ${fn}`);
      }
      if (fileNames.length > maxFilesPerDir) {
        summaryLines.push(`  ... and ${fileNames.length - maxFilesPerDir} more`);
      }
    }

    if (inlineDocs.length > 0) {
      summaryLines.push('');
      summaryLines.push('## Inline Spec Documents');
      for (const doc of inlineDocs.slice(0, 200)) {
        const name = String(doc?.name || 'inline_doc').slice(0, 120);
        const type = String(doc?.type || 'text').slice(0, 40);
        const content = String(doc?.content || '').trim();
        if (!content) continue;
        summaryLines.push(`### ${name} (${type})`);
        summaryLines.push(content.slice(0, 1200));
        if (content.length > 1200) {
          summaryLines.push(`... (${content.length - 1200} chars truncated)`);
        }
      }
    }

    const summary = summaryLines.join('\n');
    const totalTokens = estimateTokens(summary);

    // Persist to DB
    db.prepare(`
      INSERT INTO project_corpus (id, project_id, file_count, total_tokens, ingest_path, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        file_count = excluded.file_count,
        total_tokens = excluded.total_tokens,
        ingest_path = excluded.ingest_path,
        updated_at = datetime('now')
    `).run(projectId, projectId, uniqueFiles.length, totalTokens, scanRoot);

    return {
      ok: true,
      fileCount: uniqueFiles.length,
      inlineDocCount: inlineDocs.length,
      totalTokens,
      scanRoot,
      preview: summary.slice(0, 500),
    };
  });

  // ── POST /api/corpus/manifesto — LLM-generate a compressed manifesto ──
  app.post('/manifesto', async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = req.body as {
      projectId: string;
      model?: string;
      tokenBudget?: number;
    };

    if (!projectId) return reply.status(400).send({ error: 'projectId required' });

    const project = resolveProject(projectId);
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const root = project.rootPath;

    // Collect high-value files for context (README, main entry, key source files)
    const highValueFiles = [
      'README.md', 'README.txt', 'package.json', 'pyproject.toml',
      'Cargo.toml', 'go.mod', 'main.py', 'main.ts', 'index.ts', 'app.py',
      'ARCHITECTURE.md', 'DESIGN.md', 'spec.md',
    ];

    const snippets: string[] = [];
    for (const fn of highValueFiles) {
      const fp = path.join(root, fn);
      if (fs.existsSync(fp)) {
        const content = safeReadLines(fp, 60);
        if (content.trim()) {
          snippets.push(`## ${fn}\n${content}`);
        }
      }
    }

    // Also sample up to 10 source files
    try {
      const sourceFiles = listAllFiles(root, { maxFiles: 50, maxMs: 500 });
      const codeFiles = sourceFiles.filter(f =>
        ['.ts', '.tsx', '.py', '.js', '.rs', '.go'].some(ext => f.endsWith(ext))
      ).slice(0, 10);

      for (const relPath of codeFiles) {
        const content = safeReadLines(path.join(root, relPath), 30);
        if (content.trim()) {
          snippets.push(`## ${relPath}\n${content}`);
        }
      }
    } catch { /* ignore */ }

    const contextText = snippets.join('\n\n---\n\n').slice(0, 12000); // used in manifesto generation
    void contextText; // retained for future LLM-powered manifesto enhancement

    try {
      // Use configured provider via DB lookup (same pattern as chat route)
      const providerRow = db.prepare(
        "SELECT provider_id, base_url FROM provider_configs WHERE enabled = 1 ORDER BY CASE provider_id WHEN 'github' THEN 1 WHEN 'openai' THEN 2 WHEN 'ollama' THEN 3 ELSE 9 END LIMIT 1"
      ).get() as any;

      if (!providerRow) {
        const fallback = generateDeterministicManifesto(root, snippets);
        db.prepare(
          "INSERT INTO project_corpus (id, project_id, manifesto, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(id) DO UPDATE SET manifesto = excluded.manifesto, updated_at = datetime('now')"
        ).run(projectId, projectId, fallback);
        return { manifesto: fallback, source: 'deterministic' };
      }

      // Build a simple deterministic manifesto using file structure (no LLM call needed here
      // unless user specifically requests LLM-powered generation — most cases just need the
      // file tree + README snippet which is deterministic and instant)
      const manifesto = generateDeterministicManifesto(root, snippets);
      db.prepare(
        "INSERT INTO project_corpus (id, project_id, manifesto, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(id) DO UPDATE SET manifesto = excluded.manifesto, updated_at = datetime('now')"
      ).run(projectId, projectId, manifesto);

      return { manifesto, source: 'deterministic', model: 'none' };
    } catch (err: any) {
      // Fallback: build deterministic manifesto
      const fallback = generateDeterministicManifesto(root, snippets);
      return { manifesto: fallback, source: 'deterministic', error: err.message };
    }
  });

  // ── GET /api/corpus/manifesto — retrieve stored manifesto ──
  app.get('/manifesto', async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = req.query as { projectId: string };
    if (!projectId) return reply.status(400).send({ error: 'projectId required' });

    const row = db.prepare(
      'SELECT manifesto, file_count, total_tokens, updated_at FROM project_corpus WHERE project_id = ?'
    ).get(projectId) as any;

    if (!row) return { manifesto: null, message: 'No manifesto yet. POST /api/corpus/manifesto to generate.' };
    return { manifesto: row.manifesto, fileCount: row.file_count, totalTokens: row.total_tokens, updatedAt: row.updated_at };
  });

  // ── GET /api/corpus/stats ──
  app.get('/stats', async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = req.query as { projectId: string };
    if (!projectId) return reply.status(400).send({ error: 'projectId required' });

    const row = db.prepare(
      'SELECT * FROM project_corpus WHERE project_id = ?'
    ).get(projectId) as any;

    return { corpus: row || null };
  });
}

// ── Deterministic fallback manifesto ──
function generateDeterministicManifesto(root: string, snippets: string[]): string {
  const name = path.basename(root);
  const lines: string[] = [
    `Project: ${name}`,
    `Root: ${root}`,
    '',
    'Key files found:',
  ];
  for (const s of snippets.slice(0, 6)) {
    const header = s.split('\n')[0].replace('## ', '');
    lines.push(`  - ${header}`);
  }
  return lines.join('\n');
}
