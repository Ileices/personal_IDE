import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { dirname, extname, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

type Db = import('better-sqlite3').Database;

type FindingCategory =
  | 'trivial_enhancement'
  | 'feature_bridge'
  | 'performance_opportunity'
  | 'debt_warning'
  | 'regression_trend'
  | 'model_behavior_alert';

type Finding = {
  category: FindingCategory;
  summary: string;
  line: number;
};

const SCAN_POSITION_KEY = 'god_factory_idle_scan_position';
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.turbo', 'coverage']);
const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css', '.scss', '.md', '.txt', '.yml', '.yaml',
]);

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPS_ROOT = resolve(__dirname, '../../../../../');

function readKv(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM app_kv WHERE key = ?').get(key) as { value?: string } | undefined;
  return row?.value ?? null;
}

function writeKv(db: Db, key: string, value: string): void {
  db.prepare(
    `INSERT INTO app_kv (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(key, value);
}

async function collectFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    let entries: Awaited<ReturnType<typeof fs.readdir>>;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = resolve(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      const ext = extname(entry.name).toLowerCase();
      if (!TEXT_EXTENSIONS.has(ext)) continue;
      files.push(fullPath);
    }
  }

  await walk(rootDir);
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function findLineNumber(content: string, index: number): number {
  if (index <= 0) return 1;
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (content.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function firstMatch(content: string, regex: RegExp): { line: number; text: string } | null {
  const match = regex.exec(content);
  if (!match) return null;
  return {
    line: findLineNumber(content, match.index),
    text: match[0],
  };
}

function detectFinding(filePath: string, content: string): Finding | null {
  const rel = relative(APPS_ROOT, filePath).replace(/\\/g, '/');

  const todo = firstMatch(content, /\bTODO\b/i);
  if (todo) {
    return {
      category: 'debt_warning',
      summary: `TODO found in ${rel}. Consider resolving or converting it into tracked work.`,
      line: todo.line,
    };
  }

  const hardcoded = firstMatch(content, /(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?|(['"])\/api\/[^'"\s]+\4)/i);
  if (hardcoded) {
    return {
      category: 'trivial_enhancement',
      summary: `Potential hardcoded endpoint/value in ${rel}. Prefer centralized config/env wiring.`,
      line: hardcoded.line,
    };
  }

  const consoleLog = firstMatch(content, /\bconsole\.log\s*\(/);
  if (consoleLog) {
    return {
      category: 'debt_warning',
      summary: `console.log found in ${rel}. Consider structured logging or removal for production paths.`,
      line: consoleLog.line,
    };
  }

  const anyType = firstMatch(content, /:\s*any\b/);
  if (anyType) {
    return {
      category: 'debt_warning',
      summary: `TypeScript any type used in ${rel}. Consider a stricter typed interface.`,
      line: anyType.line,
    };
  }

  const lintDisable = firstMatch(content, /eslint-disable|ts-ignore|@ts-nocheck/i);
  if (lintDisable) {
    return {
      category: 'regression_trend',
      summary: `Lint/type-check suppression found in ${rel}. Review whether the bypass is still required.`,
      line: lintDisable.line,
    };
  }

  const hasAsyncWork = /\bawait\b|\bfetch\s*\(/.test(content);
  const hasTryCatch = /\btry\b[\s\S]*\bcatch\s*\(/.test(content);
  if (hasAsyncWork && !hasTryCatch) {
    return {
      category: 'feature_bridge',
      summary: `Potential missing error handling in ${rel}. Async work detected without obvious try/catch.`,
      line: 1,
    };
  }

  return null;
}

function insertSuggestion(db: Db, relativePath: string, finding: Finding): void {
  const existing = db.prepare(
    `SELECT suggestion_id
     FROM idle_suggestions
     WHERE category = ? AND natural_language_summary = ? AND user_response IS NULL
     LIMIT 1`
  ).get(finding.category, finding.summary) as { suggestion_id: string } | undefined;

  if (existing) return;

  db.prepare(
    `INSERT INTO idle_suggestions
      (suggestion_id, category, source_devtags, source_files, source_lines, source_forensic_ids,
       natural_language_summary, suggested_job_id, presented_to_user, user_response, cycle_id, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL, ?, datetime('now'))`
  ).run(
    randomUUID(),
    finding.category,
    JSON.stringify(['idle_scanner']),
    JSON.stringify([relativePath]),
    JSON.stringify([[finding.line, finding.line]]),
    JSON.stringify([]),
    finding.summary,
    'god_factory_idle_scan',
  );
}

export async function runGodFactoryIdleScanner(db: Db): Promise<void> {
  try {
    const root = APPS_ROOT;
    const files = await collectFiles(root);
    if (files.length === 0) {
      writeKv(db, SCAN_POSITION_KEY, '0');
      return;
    }

    const rawPos = Number(readKv(db, SCAN_POSITION_KEY) || '0');
    const safePos = Number.isFinite(rawPos) && rawPos >= 0 ? Math.floor(rawPos) : 0;
    const index = safePos % files.length;
    const nextIndex = (index + 1) % files.length;
    const targetFile = files[index];

    try {
      const content = await fs.readFile(targetFile, 'utf8');
      const finding = detectFinding(targetFile, content);
      if (finding) {
        const relPath = relative(APPS_ROOT, targetFile).replace(/\\/g, '/');
        insertSuggestion(db, relPath, finding);
      }
    } catch (readErr) {
      console.warn('God Factory idle scanner could not process file:', targetFile, readErr);
    } finally {
      writeKv(db, SCAN_POSITION_KEY, String(nextIndex));
    }
  } catch (err) {
    console.error('God Factory idle scanner failed:', err);
  }
}
