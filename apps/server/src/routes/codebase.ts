// ============================================
// Codebase Routes - THE GOD FACTORY IDE Self-Access
//
// Read, search, diff, patch, write, and exec on
// the Personal IDE's own source code.
//
// Writes/patches/execs are approval-gated:
//   - Without { approved: true } → returns diff preview + requiresApproval: true
//   - With    { approved: true } → applies the change (with .bak backup)
//
// Safety: all paths are validated inside IDE_ROOT
//         (directory traversal → 403). Dangerous
//         command patterns are blocked at exec time.
// ============================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { resolve, dirname, join, relative, sep, posix } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import * as fsService from '../services/filesystem/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Monorepo root ─ routes→src→server→apps→root ─────────────────────────────
const IDE_ROOT = resolve(__dirname, '../../../../');
const DOCS_DIR = join(IDE_ROOT, 'documentation');
const FEEDBACK_DIR = resolve(IDE_ROOT, '../build_runs/feedback');

// ── Blocked command patterns (same as toolExecutor.ts) ──────────────────────
const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\//i,
  /rmdir\s+\/s/i,
  /format\s+[A-Z]:/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bpoweroff\b/i,
  /chmod\s+777\s+\//i,
  /curl[^|]*\|\s*bash/i,
  /wget[^|]*\|\s*bash/i,
  /\bxmrig\b|\bminerd\b/i,
  /git\s+push.*--force/i,
  /git\s+reset\s+--hard/i,
  /DROP\s+TABLE/i,
  /DROP\s+DATABASE/i,
  // Block reading secrets
  /\b\.env\b(?!\.[a-z])/i,
  /\b\.pem\b/i,
  /\bprivate[._-]key\b/i,
];

function isCommandSafe(cmd: string): { safe: boolean; reason?: string } {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(cmd)) {
      return { safe: false, reason: `Blocked pattern: ${pattern.toString()}` };
    }
  }
  return { safe: true };
}

// ── Minimal unified diff ─────────────────────────────────────────────────────
function unifiedDiff(oldText: string, newText: string, filePath: string): string {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const CONTEXT = 3;

  // Build lcs-based edit list (simple O(n^2) for moderate file sizes)
  const m = oldLines.length;
  const n = newLines.length;

  // For large files fall back to showing first N changed lines
  if (m > 2000 || n > 2000) {
    const added   = newLines.filter(l => !oldLines.includes(l)).length;
    const removed = oldLines.filter(l => !newLines.includes(l)).length;
    return `--- a/${filePath}\n+++ b/${filePath}\n@@ (large file) @@\n-${removed} lines removed, +${added} lines added`;
  }

  // Build DP table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = oldLines[i] === newLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  // Trace back edits
  type Edit = { type: ' ' | '+' | '-'; line: string };
  const edits: Edit[] = [];
  let i = 0, j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && oldLines[i] === newLines[j]) {
      edits.push({ type: ' ', line: oldLines[i] });
      i++; j++;
    } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
      edits.push({ type: '+', line: newLines[j] });
      j++;
    } else {
      edits.push({ type: '-', line: oldLines[i] });
      i++;
    }
  }

  // Build hunks with context
  const changed = edits.map((e, idx) => ({ idx, changed: e.type !== ' ' }));
  const changeIdxs = new Set(changed.filter(c => c.changed).map(c => c.idx));
  const inHunk = new Set<number>();
  changeIdxs.forEach(idx => {
    for (let k = Math.max(0, idx - CONTEXT); k <= Math.min(edits.length - 1, idx + CONTEXT); k++) {
      inHunk.add(k);
    }
  });

  const lines: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`];
  let hunkStart = -1;
  let hunkLines: string[] = [];
  let oldLine = 1, newLine = 1;

  function flushHunk() {
    if (hunkLines.length === 0) return;
    lines.push(`@@ -${hunkStart} +${hunkStart} @@`);
    lines.push(...hunkLines);
    hunkLines = [];
    hunkStart = -1;
  }

  edits.forEach((e, idx) => {
    if (inHunk.has(idx)) {
      if (hunkStart === -1) hunkStart = e.type === '-' ? oldLine : newLine;
      hunkLines.push(`${e.type}${e.line}`);
    } else {
      if (hunkLines.length > 0) flushHunk();
    }
    if (e.type !== '+') oldLine++;
    if (e.type !== '-') newLine++;
  });
  flushHunk();

  return lines.join('\n');
}

// ── Normalize path to forward slashes ────────────────────────────────────────
function normalizeSep(p: string) { return p.split(sep).join(posix.sep); }

// ── Safe listing of documentation files ──────────────────────────────────────
function listDocFiles(): string[] {
  if (!existsSync(DOCS_DIR)) return [];
  try {
    return readdirSync(DOCS_DIR, { withFileTypes: true })
      .filter(e => e.isFile() && e.name.endsWith('.md'))
      .map(e => e.name);
  } catch { return []; }
}

function listFeedbackFiles(): string[] {
  if (!existsSync(FEEDBACK_DIR)) return [];
  try {
    return readdirSync(FEEDBACK_DIR, { withFileTypes: true })
      .filter(e => e.isFile() && e.name.endsWith('.txt'))
      .map(e => e.name)
      .sort((a, b) => a.localeCompare(b));
  } catch { return []; }
}

// ── Route registration ────────────────────────────────────────────────────────
export async function codebaseRoutes(app: FastifyInstance) {

  // GET /api/codebase/root — IDE root path info
  app.get('/root', async () => ({
    root: IDE_ROOT,
    docsDir: DOCS_DIR,
    docSections: listDocFiles(),
  }));

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/codebase/tree?path=&depth=
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/tree', async (req: FastifyRequest, reply: FastifyReply) => {
    const { path: subPath = '.', depth = '4' } = req.query as { path?: string; depth?: string };
    try {
      const targetPath = subPath === '.' ? IDE_ROOT : fsService.safePath(IDE_ROOT, subPath);
      if (!existsSync(targetPath)) return reply.status(404).send({ error: 'Path not found' });
      const depthInt = Math.min(parseInt(depth) || 4, 8);
      const tree = fsService.listFileTree(targetPath, depthInt);
      return { root: IDE_ROOT, path: subPath, tree };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/codebase/read?path=&start=&end=
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/read', async (req: FastifyRequest, reply: FastifyReply) => {
    const { path: filePath, start, end } = req.query as { path: string; start?: string; end?: string };
    if (!filePath) return reply.status(400).send({ error: 'path required' });

    try {
      const resolved = fsService.safePath(IDE_ROOT, filePath);
      if (!existsSync(resolved)) return reply.status(404).send({ error: 'File not found' });

      const rawContent = readFileSync(resolved, 'utf-8');
      let content = rawContent;

      if (start || end) {
        const lines = rawContent.split('\n');
        const s = start ? Math.max(0, parseInt(start) - 1) : 0;
        const e = end   ? Math.min(lines.length, parseInt(end)) : lines.length;
        content = lines.slice(s, e).join('\n');
      }

      // Hard cap: 100KB per read
      const truncated = content.length > 102400;
      if (truncated) content = content.slice(0, 102400) + '\n... [truncated at 100KB]';

      return {
        path: filePath,
        content,
        totalLines: rawContent.split('\n').length,
        returnedLines: content.split('\n').length,
        truncated,
      };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/codebase/search?q=&maxResults=
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/search', async (req: FastifyRequest, reply: FastifyReply) => {
    const { q, maxResults = '50' } = req.query as { q: string; maxResults?: string };
    if (!q) return reply.status(400).send({ error: 'q required' });

    try {
      const results = fsService.searchFiles(IDE_ROOT, q, { maxResults: Math.min(parseInt(maxResults) || 50, 200) });
      return { query: q, results, count: results.length };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/codebase/docs?section=
  //   section: filename or keyword (e.g. "architecture", "llm", "security")
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/docs', async (req: FastifyRequest, reply: FastifyReply) => {
    const { section } = req.query as { section?: string };
    const files = listDocFiles();

    if (!section) {
      return { sections: files, tip: 'Add ?section=FILENAME to read a section' };
    }

    const match = files.find(f =>
      f.toLowerCase() === section.toLowerCase() ||
      f.toLowerCase().startsWith(section.toLowerCase()) ||
      f.toLowerCase().replace(/_/g, '-').includes(section.toLowerCase().replace(/_/g, '-'))
    );

    if (!match) return reply.status(404).send({ error: `Section "${section}" not found`, available: files });

    try {
      let content = readFileSync(join(DOCS_DIR, match), 'utf-8');
      if (content.length > 60000) content = content.slice(0, 60000) + '\n... [truncated]';
      return { section: match, content };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/codebase/feedback?section=
  //   section: filename or keyword (from ../build_runs/feedback)
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/feedback', async (req: FastifyRequest, reply: FastifyReply) => {
    const { section } = req.query as { section?: string };
    const files = listFeedbackFiles();

    if (!section) {
      return {
        root: FEEDBACK_DIR,
        sections: files,
        tip: 'Add ?section=FILENAME to read one feedback document',
      };
    }

    const match = files.find(f =>
      f.toLowerCase() === section.toLowerCase() ||
      f.toLowerCase().startsWith(section.toLowerCase()) ||
      f.toLowerCase().includes(section.toLowerCase())
    );

    if (!match) {
      return reply.status(404).send({
        error: `Feedback section "${section}" not found`,
        available: files,
      });
    }

    try {
      let content = readFileSync(join(FEEDBACK_DIR, match), 'utf-8');
      if (content.length > 120000) content = content.slice(0, 120000) + '\n... [truncated]';
      return { section: match, content };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/codebase/diff
  // { path, newContent } → returns unified diff string
  // ─────────────────────────────────────────────────────────────────────────
  app.post('/diff', async (req: FastifyRequest, reply: FastifyReply) => {
    const { path: filePath, newContent } = req.body as { path: string; newContent: string };
    if (!filePath || newContent === undefined) return reply.status(400).send({ error: 'path and newContent required' });

    try {
      const resolved = fsService.safePath(IDE_ROOT, filePath);
      const originalContent = existsSync(resolved) ? readFileSync(resolved, 'utf-8') : '';
      const diff = unifiedDiff(originalContent, newContent, normalizeSep(filePath));
      const linesAdded   = (diff.match(/^\+(?!\+\+)/gm) || []).length;
      const linesRemoved = (diff.match(/^-(?!--)/gm) || []).length;
      return { path: filePath, diff, linesAdded, linesRemoved, isNew: !existsSync(resolved) };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/codebase/patch
  // { path, oldString, newString, approved? }
  //   approved=false → preview (diff) + requiresApproval: true
  //   approved=true  → apply change (creates .bak first)
  // ─────────────────────────────────────────────────────────────────────────
  app.post('/patch', async (req: FastifyRequest, reply: FastifyReply) => {
    const { path: filePath, oldString, newString, approved = false } = req.body as {
      path: string; oldString: string; newString: string; approved?: boolean;
    };
    if (!filePath || oldString === undefined || newString === undefined) {
      return reply.status(400).send({ error: 'path, oldString, and newString required' });
    }

    try {
      const resolved = fsService.safePath(IDE_ROOT, filePath);
      if (!existsSync(resolved)) return reply.status(404).send({ error: 'File not found' });

      const originalContent = readFileSync(resolved, 'utf-8');
      const occurrences = originalContent.split(oldString).length - 1;

      if (occurrences === 0) return reply.status(400).send({ error: 'oldString not found in file — provide more context lines to match uniquely' });
      if (occurrences > 1)   return reply.status(400).send({ error: `oldString matched ${occurrences} times — must match exactly once` });

      const newContent = originalContent.replace(oldString, newString);
      const diff = unifiedDiff(originalContent, newContent, normalizeSep(filePath));

      if (!approved) {
        return { requiresApproval: true, path: filePath, diff, oldString, newString };
      }

      // Backup then write
      writeFileSync(resolved + '.bak', originalContent, 'utf-8');
      writeFileSync(resolved, newContent, 'utf-8');
      return { success: true, path: filePath, diff };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/codebase/write
  // { path, content, approved? }
  //   approved=false → preview (diff) + requiresApproval: true
  //   approved=true  → write file (creates dirs, creates .bak if exists)
  // ─────────────────────────────────────────────────────────────────────────
  app.post('/write', async (req: FastifyRequest, reply: FastifyReply) => {
    const { path: filePath, content, approved = false } = req.body as {
      path: string; content: string; approved?: boolean;
    };
    if (!filePath || content === undefined) return reply.status(400).send({ error: 'path and content required' });

    try {
      const resolved = fsService.safePath(IDE_ROOT, filePath);
      const isNew = !existsSync(resolved);
      const originalContent = isNew ? '' : readFileSync(resolved, 'utf-8');
      const diff = unifiedDiff(originalContent, content, normalizeSep(filePath));

      if (!approved) {
        return { requiresApproval: true, path: filePath, diff, isNew, linesWritten: content.split('\n').length };
      }

      mkdirSync(dirname(resolved), { recursive: true });
      if (!isNew) writeFileSync(resolved + '.bak', originalContent, 'utf-8');
      writeFileSync(resolved, content, 'utf-8');
      return { success: true, path: filePath, isNew, linesWritten: content.split('\n').length };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/codebase/exec
  // { command, explanation?, approved?, cwd? }
  //   approved=false → requiresApproval: true (never executes)
  //   approved=true  → runs command with 60s timeout
  //   Dangerous patterns always blocked regardless of approved.
  // ─────────────────────────────────────────────────────────────────────────
  app.post('/exec', async (req: FastifyRequest, reply: FastifyReply) => {
    const { command, explanation = '', approved = false, cwd } = req.body as {
      command: string; explanation?: string; approved?: boolean; cwd?: string;
    };
    if (!command?.trim()) return reply.status(400).send({ error: 'command required' });

    const safety = isCommandSafe(command);
    if (!safety.safe) return reply.status(403).send({ error: `Command blocked: ${safety.reason}` });

    if (!approved) {
      return { requiresApproval: true, command, explanation };
    }

    try {
      const execCwd = cwd ? fsService.safePath(IDE_ROOT, cwd) : IDE_ROOT;
      const output = execSync(command, {
        cwd: execCwd,
        encoding: 'utf-8',
        timeout: 60000,
        maxBuffer: 1024 * 1024 * 4,
      });
      return { success: true, output: (output || '').slice(0, 12000), command };
    } catch (err: any) {
      const stdout = err.stdout ? String(err.stdout).slice(0, 6000) : '';
      const stderr = err.stderr ? String(err.stderr).slice(0, 6000) : '';
      return {
        success: false,
        exitCode: err.status ?? 1,
        output: (stdout + stderr).trim() || err.message,
        command,
      };
    }
  });
}
