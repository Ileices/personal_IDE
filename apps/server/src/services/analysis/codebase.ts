// ============================================
// Codebase Analysis Engine
// Incremental file reading, chunked overviews
// within token limits, language-aware analysis
// ============================================
import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join, extname, relative, basename } from 'path';
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import type { CodebaseOverview, CodebaseChunk } from '@personal-ide/shared';
import { estimateTokens, chunkContent, truncateToFit } from '../llm/providers.js';
import { IGNORED_DIRS, CODE_EXTENSIONS, EXT_TO_LANG } from '../../constants/codeConstants.js';

interface FileInfo {
  path: string;
  relativePath: string;
  language: string;
  size: number;
  lines: number;
}

export class CodebaseAnalyzer {
  constructor(private db: Database.Database) {
    this.ensureTable();
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS codebase_chunks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        path TEXT NOT NULL,
        chunk_index INTEGER NOT NULL DEFAULT 0,
        total_chunks INTEGER NOT NULL DEFAULT 1,
        summary TEXT NOT NULL DEFAULT '',
        language TEXT DEFAULT '',
        symbols TEXT DEFAULT '[]',
        dependencies TEXT DEFAULT '[]',
        token_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_chunks_project ON codebase_chunks(project_id);

      CREATE TABLE IF NOT EXISTS codebase_overviews (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL UNIQUE,
        total_files INTEGER DEFAULT 0,
        total_lines INTEGER DEFAULT 0,
        languages TEXT DEFAULT '{}',
        entry_points TEXT DEFAULT '[]',
        dependencies TEXT DEFAULT '[]',
        architecture TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS task_tracker (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        agent_run_id TEXT,
        title TEXT NOT NULL,
        total_subtasks INTEGER DEFAULT 0,
        completed_subtasks INTEGER DEFAULT 0,
        current_subtask_index INTEGER DEFAULT 0,
        subtasks TEXT DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_project ON task_tracker(project_id);
    `);
  }

  /** Scan the project and build a file inventory */
  scanProject(rootPath: string): FileInfo[] {
    const files: FileInfo[] = [];
    this.walkDir(rootPath, rootPath, files);
    return files;
  }

  private walkDir(dir: string, rootPath: string, files: FileInfo[]): void {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!IGNORED_DIRS.has(entry.name)) {
            this.walkDir(fullPath, rootPath, files);
          }
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          if (CODE_EXTENSIONS.has(ext)) {
            try {
              const stat = statSync(fullPath);
              if (stat.size > 2_000_000) continue; // Skip files > 2MB
              const content = readFileSync(fullPath, 'utf8');
              files.push({
                path: fullPath,
                relativePath: relative(rootPath, fullPath).replace(/\\/g, '/'),
                language: EXT_TO_LANG[ext] || ext.slice(1),
                size: stat.size,
                lines: content.split('\n').length,
              });
            } catch { /* skip unreadable */ }
          }
        }
      }
    } catch { /* skip inaccessible dirs */ }
  }

  /** Get language distribution */
  getLanguageDistribution(files: FileInfo[]): Record<string, number> {
    const dist: Record<string, number> = {};
    for (const f of files) {
      dist[f.language] = (dist[f.language] || 0) + f.lines;
    }
    return dist;
  }

  /** Detect entry points */
  detectEntryPoints(rootPath: string, files: FileInfo[]): string[] {
    const entries: string[] = [];
    const names = files.map(f => f.relativePath);

    // Common entry point patterns
    const patterns = [
      'src/index.ts', 'src/index.js', 'src/main.ts', 'src/main.tsx', 'src/main.py',
      'src/app.ts', 'src/app.py', 'main.go', 'src/main.rs', 'src/lib.rs',
      'src/Main.java', 'Program.cs', 'index.html', 'app.py', 'manage.py',
      'server.ts', 'server.js', 'src/server.ts',
    ];

    for (const p of patterns) {
      if (names.includes(p)) entries.push(p);
    }

    // Check package.json for main/bin
    try {
      if (existsSync(join(rootPath, 'package.json'))) {
        const pkg = JSON.parse(readFileSync(join(rootPath, 'package.json'), 'utf8'));
        if (pkg.main) entries.push(pkg.main);
        if (pkg.bin) {
          const bins = typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin);
          entries.push(...(bins as string[]));
        }
      }
    } catch { /* ignore */ }

    return [...new Set(entries)];
  }

  /** Detect project dependencies */
  detectDependencies(rootPath: string): string[] {
    const deps: string[] = [];

    try {
      if (existsSync(join(rootPath, 'package.json'))) {
        const pkg = JSON.parse(readFileSync(join(rootPath, 'package.json'), 'utf8'));
        deps.push(...Object.keys(pkg.dependencies || {}));
        deps.push(...Object.keys(pkg.devDependencies || {}));
      }
    } catch { /* ignore */ }

    try {
      if (existsSync(join(rootPath, 'requirements.txt'))) {
        const reqs = readFileSync(join(rootPath, 'requirements.txt'), 'utf8');
        deps.push(...reqs.split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => l.split('=')[0].trim()));
      }
    } catch { /* ignore */ }

    try {
      if (existsSync(join(rootPath, 'Cargo.toml'))) {
        const cargo = readFileSync(join(rootPath, 'Cargo.toml'), 'utf8');
        const depSection = cargo.match(/\[dependencies\]([\s\S]*?)(?:\[|$)/);
        if (depSection) {
          const lines = depSection[1].split('\n').filter(l => l.includes('='));
          deps.push(...lines.map(l => l.split('=')[0].trim()));
        }
      }
    } catch { /* ignore */ }

    return deps;
  }

  /** Create incremental chunked overview of a file within token limits */
  chunkFile(filePath: string, rootPath: string, maxTokensPerChunk: number): CodebaseChunk[] {
    try {
      const content = readFileSync(filePath, 'utf8');
      const relPath = relative(rootPath, filePath).replace(/\\/g, '/');
      const ext = extname(filePath).toLowerCase();
      const language = EXT_TO_LANG[ext] || ext.slice(1);

      const chunks = chunkContent(content, maxTokensPerChunk);

      return chunks.map((chunk, i) => ({
        id: uuid(),
        projectId: '',  // Set by caller
        path: relPath,
        chunkIndex: i,
        totalChunks: chunks.length,
        summary: '',  // To be filled by LLM
        language,
        symbols: extractSymbols(chunk, language),
        dependencies: extractImports(chunk, language),
        tokenCount: estimateTokens(chunk),
        createdAt: new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  }

  /** Build a complete codebase overview */
  buildOverview(rootPath: string, projectId: string): CodebaseOverview {
    const files = this.scanProject(rootPath);
    const languages = this.getLanguageDistribution(files);
    const entryPoints = this.detectEntryPoints(rootPath, files);
    const dependencies = this.detectDependencies(rootPath);

    // Determine primary language
    const sortedLangs = Object.entries(languages).sort((a, b) => b[1] - a[1]);
    const primaryLang = sortedLangs[0]?.[0] || 'unknown';

    // Build architecture description
    const architecture = buildArchitectureDescription(rootPath, files, primaryLang, dependencies);

    const overview: CodebaseOverview = {
      projectId,
      totalFiles: files.length,
      totalLines: files.reduce((sum, f) => sum + f.lines, 0),
      languages,
      entryPoints,
      dependencies,
      architecture,
      chunks: [],
      createdAt: new Date().toISOString(),
    };

    // Store in DB
    this.db.prepare(`
      INSERT OR REPLACE INTO codebase_overviews
      (id, project_id, total_files, total_lines, languages, entry_points, dependencies, architecture)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid(), projectId, overview.totalFiles, overview.totalLines,
      JSON.stringify(languages), JSON.stringify(entryPoints),
      JSON.stringify(dependencies), architecture
    );

    return overview;
  }

  /** Get the overview for a project from DB */
  getOverview(projectId: string): CodebaseOverview | null {
    const row = this.db.prepare('SELECT * FROM codebase_overviews WHERE project_id = ?').get(projectId) as any;
    if (!row) return null;
    return {
      projectId: row.project_id,
      totalFiles: row.total_files,
      totalLines: row.total_lines,
      languages: JSON.parse(row.languages || '{}'),
      entryPoints: JSON.parse(row.entry_points || '[]'),
      dependencies: JSON.parse(row.dependencies || '[]'),
      architecture: row.architecture,
      chunks: [],
      createdAt: row.created_at,
    };
  }

  /** Format overview for LLM context (fits within token budget) */
  formatOverviewForLLM(overview: CodebaseOverview, maxTokens: number): string {
    const lines = [
      '## CODEBASE OVERVIEW',
      `Files: ${overview.totalFiles} | Lines: ${overview.totalLines.toLocaleString()}`,
      '',
      '### Languages (by lines of code):',
      ...Object.entries(overview.languages)
        .sort((a, b) => b[1] - a[1])
        .map(([lang, lines]) => `  - ${lang}: ${lines.toLocaleString()} lines`),
      '',
      '### Entry Points:',
      ...overview.entryPoints.map(e => `  - ${e}`),
      '',
      '### Dependencies:',
      ...overview.dependencies.slice(0, 30).map(d => `  - ${d}`),
      overview.dependencies.length > 30 ? `  ... and ${overview.dependencies.length - 30} more` : '',
      '',
      '### Architecture:',
      overview.architecture,
    ];

    const full = lines.join('\n');
    return truncateToFit(full, maxTokens);
  }

  // ── Task Tracker ──

  /** Create a new task tracker */
  createTaskTracker(
    projectId: string,
    agentRunId: string,
    title: string,
    subtasks: { title: string; description: string; targetFiles: string[]; language: string; tokenBudget: number }[]
  ): string {
    const id = uuid();
    const subs = subtasks.map((s, i) => ({
      id: uuid(),
      index: i,
      title: s.title,
      description: s.description,
      targetFiles: s.targetFiles,
      language: s.language,
      status: 'pending' as const,
      tokenBudget: s.tokenBudget,
      tokensUsed: 0,
    }));

    this.db.prepare(`
      INSERT INTO task_tracker (id, project_id, agent_run_id, title, total_subtasks, subtasks)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, projectId, agentRunId, title, subs.length, JSON.stringify(subs));

    return id;
  }

  /** Update subtask status */
  updateSubtask(
    taskId: string,
    subtaskIndex: number,
    updates: { status?: string; result?: string; errorOutput?: string; tokensUsed?: number }
  ): void {
    const row = this.db.prepare('SELECT subtasks, completed_subtasks FROM task_tracker WHERE id = ?').get(taskId) as any;
    if (!row) return;

    const subs = JSON.parse(row.subtasks);
    if (subs[subtaskIndex]) {
      Object.assign(subs[subtaskIndex], updates);
    }

    const completed = subs.filter((s: any) => s.status === 'completed').length;
    this.db.prepare(
      "UPDATE task_tracker SET subtasks = ?, completed_subtasks = ?, current_subtask_index = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(JSON.stringify(subs), completed, subtaskIndex, taskId);
  }

  /** Get task tracker */
  getTaskTracker(taskId: string): any {
    return this.db.prepare('SELECT * FROM task_tracker WHERE id = ?').get(taskId);
  }

  /** Get all tasks for a project */
  getProjectTasks(projectId: string): any[] {
    return this.db.prepare(
      'SELECT * FROM task_tracker WHERE project_id = ? ORDER BY created_at DESC'
    ).all(projectId);
  }
}

// ── Helper functions ──

/** Extract function/class/variable names from code */
function extractSymbols(code: string, language: string): string[] {
  const symbols: string[] = [];

  // TypeScript/JavaScript
  if (['typescript', 'javascript'].includes(language)) {
    const patterns = [
      /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
      /(?:export\s+)?class\s+(\w+)/g,
      /(?:export\s+)?interface\s+(\w+)/g,
      /(?:export\s+)?type\s+(\w+)/g,
      /(?:export\s+)?(?:const|let|var)\s+(\w+)/g,
      /(?:export\s+)?enum\s+(\w+)/g,
    ];
    for (const p of patterns) {
      let m;
      while ((m = p.exec(code)) !== null) symbols.push(m[1]);
    }
  }

  // Python
  if (language === 'python') {
    const patterns = [
      /(?:async\s+)?def\s+(\w+)/g,
      /class\s+(\w+)/g,
    ];
    for (const p of patterns) {
      let m;
      while ((m = p.exec(code)) !== null) symbols.push(m[1]);
    }
  }

  // Rust
  if (language === 'rust') {
    const patterns = [
      /(?:pub\s+)?fn\s+(\w+)/g,
      /(?:pub\s+)?struct\s+(\w+)/g,
      /(?:pub\s+)?enum\s+(\w+)/g,
      /(?:pub\s+)?trait\s+(\w+)/g,
      /(?:pub\s+)?mod\s+(\w+)/g,
    ];
    for (const p of patterns) {
      let m;
      while ((m = p.exec(code)) !== null) symbols.push(m[1]);
    }
  }

  // Go
  if (language === 'go') {
    const patterns = [
      /func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)/g,
      /type\s+(\w+)\s+struct/g,
      /type\s+(\w+)\s+interface/g,
    ];
    for (const p of patterns) {
      let m;
      while ((m = p.exec(code)) !== null) symbols.push(m[1]);
    }
  }

  return [...new Set(symbols)];
}

/** Extract import/dependency references */
function extractImports(code: string, language: string): string[] {
  const imports: string[] = [];

  if (['typescript', 'javascript'].includes(language)) {
    const patterns = [
      /import\s+.*?from\s+['"](.+?)['"]/g,
      /require\s*\(\s*['"](.+?)['"]\s*\)/g,
    ];
    for (const p of patterns) {
      let m;
      while ((m = p.exec(code)) !== null) imports.push(m[1]);
    }
  }

  if (language === 'python') {
    const patterns = [
      /^import\s+(\S+)/gm,
      /^from\s+(\S+)\s+import/gm,
    ];
    for (const p of patterns) {
      let m;
      while ((m = p.exec(code)) !== null) imports.push(m[1]);
    }
  }

  if (language === 'rust') {
    const p = /use\s+([\w:]+)/g;
    let m;
    while ((m = p.exec(code)) !== null) imports.push(m[1]);
  }

  if (language === 'go') {
    const p = /import\s+(?:\(\s*([\s\S]*?)\s*\)|"(.+?)")/g;
    let m;
    while ((m = p.exec(code)) !== null) {
      if (m[2]) imports.push(m[2]);
      else if (m[1]) {
        for (const line of m[1].split('\n')) {
          const imp = line.match(/"(.+?)"/);
          if (imp) imports.push(imp[1]);
        }
      }
    }
  }

  return [...new Set(imports)];
}

/** Build architecture description from project structure */
function buildArchitectureDescription(
  rootPath: string,
  files: FileInfo[],
  primaryLang: string,
  deps: string[]
): string {
  const parts: string[] = [];

  // Detect project type
  if (deps.includes('react') || deps.includes('next') || deps.includes('vue') || deps.includes('svelte')) {
    parts.push('Frontend web application');
    if (deps.includes('next')) parts.push('(Next.js framework)');
    if (deps.includes('vue')) parts.push('(Vue.js framework)');
    if (deps.includes('svelte')) parts.push('(Svelte framework)');
  }
  if (deps.includes('express') || deps.includes('fastify') || deps.includes('koa') || deps.includes('hono')) {
    parts.push('Node.js server');
  }
  if (deps.includes('django') || deps.includes('flask') || deps.includes('fastapi')) {
    parts.push('Python web server');
  }

  // Detect monorepo
  if (existsSync(join(rootPath, 'pnpm-workspace.yaml')) || existsSync(join(rootPath, 'lerna.json'))) {
    parts.push('Monorepo structure');
  }

  // Detect game project
  if (deps.some(d => /unity|godot|bevy|pygame|phaser|three|babylon/i.test(d))) {
    parts.push('Game project');
  }

  parts.push(`Primary language: ${primaryLang}`);

  // Directory structure summary
  try {
    const topDirs = readdirSync(rootPath, { withFileTypes: true })
      .filter(e => e.isDirectory() && !IGNORED_DIRS.has(e.name) && !e.name.startsWith('.'))
      .map(e => e.name);
    if (topDirs.length > 0) {
      parts.push(`Top-level directories: ${topDirs.join(', ')}`);
    }
  } catch { /* ignore */ }

  return parts.join('. ') + '.';
}
