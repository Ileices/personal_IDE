// ============================================
// Filesystem Service - Safe file operations
// ============================================
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, readdirSync, unlinkSync, renameSync, copyFileSync } from 'fs';
import { join, resolve, relative, extname, basename, dirname, sep, posix } from 'path';
import type { FileNode, FileContent, FileSearchResult } from '@personal-ide/shared';

/** Directories and files to skip when listing */
const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', '__pycache__',
  '.next', '.nuxt', 'dist', 'build', 'out', '.cache',
  'coverage', '.tox', '.mypy_cache', '.pytest_cache',
  'venv', '.venv', 'env', '.env',
]);

const IGNORED_FILES = new Set([
  '.DS_Store', 'Thumbs.db', 'desktop.ini',
]);

/** Max file size we'll read (10MB) */
const MAX_READ_SIZE = 10 * 1024 * 1024;

/** Language detection by extension */
const EXT_TO_LANG: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescriptreact', '.js': 'javascript', '.jsx': 'javascriptreact',
  '.py': 'python', '.rs': 'rust', '.go': 'go', '.java': 'java', '.c': 'c', '.cpp': 'cpp',
  '.h': 'c', '.hpp': 'cpp', '.cs': 'csharp', '.rb': 'ruby', '.php': 'php',
  '.html': 'html', '.css': 'css', '.scss': 'scss', '.less': 'less',
  '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
  '.xml': 'xml', '.md': 'markdown', '.txt': 'plaintext',
  '.sql': 'sql', '.sh': 'shellscript', '.bash': 'shellscript',
  '.ps1': 'powershell', '.bat': 'bat', '.cmd': 'bat',
  '.dockerfile': 'dockerfile', '.graphql': 'graphql',
  '.svelte': 'svelte', '.vue': 'vue', '.swift': 'swift', '.kt': 'kotlin',
};

/**
 * Validate and resolve a path within the project root.
 * Prevents directory traversal attacks.
 */
export function safePath(projectRoot: string, filePath: string): string {
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
        if (IGNORED_DIRS.has(entry.name) && entry.isDirectory()) continue;
        if (IGNORED_FILES.has(entry.name)) continue;
        if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;

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

/** Write a file with optional backup */
export function writeFile(projectRoot: string, filePath: string, content: string, backup: boolean = true): void {
  const fullPath = safePath(projectRoot, filePath);
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
        if (IGNORED_DIRS.has(entry.name) && entry.isDirectory()) continue;
        if (IGNORED_FILES.has(entry.name)) continue;

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
export function listAllFiles(projectRoot: string): string[] {
  const files: string[] = [];

  function walk(dirPath: string) {
    try {
      const entries = readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (IGNORED_DIRS.has(entry.name) && entry.isDirectory()) continue;
        if (IGNORED_FILES.has(entry.name)) continue;
        const fullPath = join(dirPath, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else {
          files.push(normalizePath(relative(projectRoot, fullPath)));
        }
      }
    } catch {
      // Skip
    }
  }

  walk(projectRoot);
  return files;
}
