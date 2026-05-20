// ============================================
// Filesystem Service - Safe file operations
// ============================================
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, readdirSync, unlinkSync, renameSync, copyFileSync } from 'fs';
import { join, resolve, relative, extname, basename, dirname, sep, posix } from 'path';
import type { FileNode, FileContent, FileSearchResult } from '@personal-ide/shared';
import { EXT_TO_LANG_DISPLAY as EXT_TO_LANG, IGNORED_DIRS, IGNORED_FILES } from '../../constants/codeConstants.js';

/** Max file size we'll read (10MB) */
const MAX_READ_SIZE = 10 * 1024 * 1024;

/**
 * Validate and resolve a path within the project root.
 * Prevents directory traversal attacks.
 */
export function safePath(projectRoot: string, filePath: string): string {
  // Reject absolute paths passed in as filePath — they would silently escape the root
  if (filePath && (filePath.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(filePath))) {
    throw new Error(`Absolute path rejected: ${filePath}`);
  }
  const resolved = resolve(projectRoot, filePath);
  const normalizedRoot = resolve(projectRoot);

  if (!resolved.startsWith(normalizedRoot)) {
    throw new Error(`Path traversal denied: ${filePath}`);
  }
  return resolved;
}

/** Normalize a path to forward slashes for cross-platform consistency */
export function normalizePath(p: string): string {
  return p.split(sep).join(posix.sep);
}

function shouldSkipEntry(entry: { name: string; isDirectory(): boolean }): boolean {
  if (IGNORED_FILES.has(entry.name)) return true;
  if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) return true;
  if (entry.name.startsWith('.') && entry.name !== '.env.example') return true;
  return false;
}

/** Get file language from extension */
export function getLanguage(filePath: string): string {
  return EXT_TO_LANG[extname(filePath).toLowerCase()] || 'plaintext';
}

/** Build a file tree for a directory */
export function listFileTree(rootPath: string, maxDepth: number = 5): FileNode {
  function walk(dirPath: string, depth: number): FileNode {
    const name = basename(dirPath);
    const relPath = normalizePath(relative(rootPath, dirPath));

    const node: FileNode = {
      name: name || basename(rootPath),
      path: relPath || '.',
      type: 'directory',
      children: [],
    };

    if (depth > maxDepth) return node;

    try {
      const entries = readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (shouldSkipEntry(entry)) continue;

        const entryPath = join(dirPath, entry.name);

        if (entry.isDirectory()) {
          node.children!.push(walk(entryPath, depth + 1));
        } else {
          const stat = statSync(entryPath);
          node.children!.push({
            name: entry.name,
            path: normalizePath(relative(rootPath, entryPath)),
            type: 'file',
            size: stat.size,
            extension: extname(entry.name),
            modifiedAt: stat.mtime.toISOString(),
          });
        }
      }

      // Sort: directories first, then alphabetically
      node.children!.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    } catch (err) {
      // Permission denied or other error - return empty directory
    }

    return node;
  }

  return walk(rootPath, 0);
}

/** Read a file's content */
export function readFile(projectRoot: string, filePath: string): FileContent {
  const fullPath = safePath(projectRoot, filePath);

  // Block reads of sensitive files to prevent secret leakage into LLM context
  if (isSensitiveFile(fullPath)) {
    throw new Error(`Read denied: ${filePath} matches sensitive file denylist`);
  }

  if (!existsSync(fullPath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stat = statSync(fullPath);
  if (stat.size > MAX_READ_SIZE) {
    throw new Error(`File too large: ${(stat.size / 1024 / 1024).toFixed(1)}MB (max ${MAX_READ_SIZE / 1024 / 1024}MB)`);
  }

  const content = readFileSync(fullPath, 'utf-8');
  return {
    path: filePath,
    content,
    language: getLanguage(filePath),
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    encoding: 'utf-8',
  };
}

// ── Sensitive file denylist ──────────────────────────────────────────────────
// Any agent write/delete targeting these patterns is rejected.
// Read access is also blocked to prevent accidental leakage into LLM context.
const SENSITIVE_FILENAME_PATTERNS: RegExp[] = [
  /^\.env$/i,
  /^\.env\.(local|production|staging|dev)$/i,
  /^\.npmrc$/i,
  /^\.netrc$/i,
  /^\.git-credentials$/i,
  /^id_rsa$/i,
  /^id_ed25519$/i,
  /^id_ecdsa$/i,
  /^id_dsa$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.pfx$/i,
  /\.p12$/i,
  /credentials\.json$/i,
  /provider_configs\.json$/i,
  /secrets\.json$/i,
  /auth\.json$/i,
];

const SENSITIVE_DIR_SEGMENTS: string[] = ['.ssh', '.gnupg', '.aws', '.azure', '.kube'];

function isSensitiveFile(resolvedPath: string): boolean {
  const parts = resolvedPath.replace(/\\/g, '/').split('/');
  const filename = parts[parts.length - 1];
  // Check filename patterns
  if (SENSITIVE_FILENAME_PATTERNS.some(p => p.test(filename))) return true;
  // Check if inside a sensitive directory
  if (SENSITIVE_DIR_SEGMENTS.some(seg => parts.includes(seg))) return true;
  return false;
}

/** Write a file with optional backup */
// ── Constitutional protection list ──────────────────────────────────────────
// Files that must never be modified by any automated agent.
// Any write attempt is rejected with an explanatory error.
const CONSTITUTIONAL_PROTECTED_PATHS = new Set([
  'CONSTITUTION.md',
  'apps/server/src/routes/godFactory.ts',
  'apps/web/src/components/TheGodFactory.tsx',
  'apps/server/src/services/spawnAuthority/index.ts',
  'apps/server/src/db/index.ts',
]);

function isConstitutionallyProtected(filePath: string): boolean {
  // Normalize to forward slashes for comparison
  const normalized = filePath.replace(/\\/g, '/').replace(/^\//, '');
  for (const protected_ of CONSTITUTIONAL_PROTECTED_PATHS) {
    if (normalized === protected_ || normalized.endsWith('/' + protected_)) return true;
  }
  return false;
}

export function writeFile(projectRoot: string, filePath: string, content: string, backup: boolean = true): void {
  if (isConstitutionallyProtected(filePath)) {
    throw new Error(
      `Constitutional protection: '${filePath}' is in the immutable layer and cannot be modified by agents. ` +
      `See CONSTITUTION.md for invariants.`
    );
  }
  const fullPath = safePath(projectRoot, filePath);
  if (isSensitiveFile(fullPath)) {
    throw new Error(
      `Security: write denied for '${filePath}' — matches sensitive file denylist (credentials, keys, .env, etc.)`
    );
  }
  const dir = dirname(fullPath);

  // Create directory if needed
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Create backup if file exists
  if (backup && existsSync(fullPath)) {
    const backupPath = fullPath + '.bak';
    copyFileSync(fullPath, backupPath);
  }

  writeFileSync(fullPath, content, 'utf-8');
}

/** Create a new file or directory */
export function createPath(projectRoot: string, filePath: string, content?: string): void {
  const fullPath = safePath(projectRoot, filePath);

  if (existsSync(fullPath)) {
    throw new Error(`Already exists: ${filePath}`);
  }

  if (filePath.endsWith('/') || filePath.endsWith('\\')) {
    mkdirSync(fullPath, { recursive: true });
  } else {
    const dir = dirname(fullPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(fullPath, content || '', 'utf-8');
  }
}

/** Delete a file */
export function deletePath(projectRoot: string, filePath: string): void {
  const fullPath = safePath(projectRoot, filePath);
  if (!existsSync(fullPath)) {
    throw new Error(`Not found: ${filePath}`);
  }
  unlinkSync(fullPath);
}

/** Rename / move a file */
export function renamePath(projectRoot: string, oldPath: string, newPath: string): void {
  const fullOld = safePath(projectRoot, oldPath);
  const fullNew = safePath(projectRoot, newPath);

  if (!existsSync(fullOld)) {
    throw new Error(`Not found: ${oldPath}`);
  }

  const dir = dirname(fullNew);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  renameSync(fullOld, fullNew);
}

/** Search for text in files */
export function searchFiles(
  projectRoot: string,
  query: string,
  options?: { maxResults?: number; includePattern?: string }
): FileSearchResult[] {
  const results: FileSearchResult[] = [];
  const maxResults = options?.maxResults || 100;
  const queryLower = query.toLowerCase();

  function walk(dirPath: string) {
    if (results.length >= maxResults) return;

    try {
      const entries = readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (results.length >= maxResults) return;
        if (shouldSkipEntry(entry)) continue;

        const fullPath = join(dirPath, entry.name);

        if (entry.isDirectory()) {
          walk(fullPath);
        } else {
          // Skip binary files
          const ext = extname(entry.name).toLowerCase();
          if (!EXT_TO_LANG[ext]) continue;

          try {
            const stat = statSync(fullPath);
            if (stat.size > MAX_READ_SIZE) continue;

            const content = readFileSync(fullPath, 'utf-8');
            const lines = content.split('\n');

            for (let i = 0; i < lines.length; i++) {
              if (results.length >= maxResults) return;
              const line = lines[i];
              const idx = line.toLowerCase().indexOf(queryLower);
              if (idx !== -1) {
                results.push({
                  path: normalizePath(relative(projectRoot, fullPath)),
                  line: i + 1,
                  column: idx + 1,
                  match: line.trim(),
                  context: lines.slice(Math.max(0, i - 1), i + 2).join('\n'),
                });
              }
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  walk(projectRoot);
  return results;
}

/** List all file paths in a project (for codebase overview) */
export function listAllFiles(
  projectRoot: string,
  options?: { maxFiles?: number; maxMs?: number }
): string[] {
  const files: string[] = [];
  const startedAt = Date.now();
  const maxFiles = options?.maxFiles && options.maxFiles > 0 ? options.maxFiles : Number.POSITIVE_INFINITY;
  const maxMs = options?.maxMs && options.maxMs > 0 ? options.maxMs : Number.POSITIVE_INFINITY;

  function shouldStop(): boolean {
    if (files.length >= maxFiles) return true;
    if (Date.now() - startedAt >= maxMs) return true;
    return false;
  }

  function walk(dirPath: string) {
    if (shouldStop()) return;

    try {
      const entries = readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (shouldStop()) break;
        if (shouldSkipEntry(entry)) continue;
        const fullPath = join(dirPath, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else {
          // Exclude sensitive files from directory listings sent to LLM
          if (!isSensitiveFile(fullPath)) {
            files.push(normalizePath(relative(projectRoot, fullPath)));
          }
        }
      }
    } catch {
      // Skip
    }
  }

  walk(projectRoot);
  return files;
}
