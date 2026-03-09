// ============================================
// Filesystem Walker — builds ROOT→DIR→SUBDIR→FILE
// hierarchy for the hierarchical code index.
// Respects .gitignore and IGNORED_DIRS.
// ============================================
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuid } from 'uuid';
import {
  IGNORED_DIRS as IGNORE_DIRS,
  CODE_EXTENSIONS,
} from '../../../constants/codeConstants.js';

// ── Types ──

export type NodeType =
  | 'ROOT' | 'DIR' | 'FILE'
  | 'IMPORT_BLOCK' | 'CONSTANT_BLOCK'
  | 'CLASS' | 'METHOD' | 'FUNCTION'
  | 'INTERFACE' | 'ENUM' | 'TYPE_ALIAS'
  | 'BLOCK' | 'STATEMENT';

export interface IndexNode {
  id: string;
  projectRoot: string;
  parentId: string | null;
  nodeType: NodeType;
  label: string;
  depth: number;
  filePath: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  byteStart: number | null;
  byteEnd: number | null;
  tokenCount: number;
  signature: string | null;
  docstring: string | null;
  collapsedSummary: string | null;
  language: string | null;
  lastIndexed: number;
  children: IndexNode[];
}

// Extensions that should never be indexed
const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.webp',
  '.mp3', '.mp4', '.wav', '.ogg', '.avi', '.mov', '.mkv',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.lock', '.map', '.min.js', '.min.css',
  '.pyc', '.pyo', '.class', '.o', '.obj',
]);

// Additional dirs to skip beyond IGNORE_DIRS
const EXTRA_SKIP_DIRS = new Set([
  '__pycache__', '.git', '.svn', '.hg',
  'coverage', '.nyc_output', '.next',
  '.turbo', '.cache', '.parcel-cache',
]);

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript',
  '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python', '.pyw': 'python',
  '.rs': 'rust', '.go': 'go',
  '.java': 'java', '.kt': 'kotlin',
  '.c': 'c', '.h': 'c',
  '.cpp': 'cpp', '.hpp': 'cpp', '.cc': 'cpp',
  '.cs': 'csharp', '.rb': 'ruby',
  '.swift': 'swift', '.dart': 'dart',
  '.lua': 'lua', '.r': 'r', '.R': 'r',
  '.sql': 'sql', '.sh': 'bash', '.bash': 'bash',
  '.ps1': 'powershell', '.psm1': 'powershell',
  '.md': 'markdown', '.json': 'json',
  '.yaml': 'yaml', '.yml': 'yaml',
  '.toml': 'toml', '.xml': 'xml',
  '.html': 'html', '.css': 'css', '.scss': 'scss',
  '.vue': 'vue', '.svelte': 'svelte',
  '.graphql': 'graphql', '.gql': 'graphql',
  '.proto': 'protobuf',
};

/**
 * Parse .gitignore file and return a set of ignore patterns (simplified).
 * Returns full dir names and glob-like patterns.
 */
function parseGitignore(projectRoot: string): Set<string> {
  const patterns = new Set<string>();
  const gitignorePath = path.join(projectRoot, '.gitignore');
  try {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      // Strip trailing slashes for directory patterns
      const cleaned = trimmed.replace(/\/+$/, '');
      patterns.add(cleaned);
    }
  } catch { /* no .gitignore or unreadable */ }
  return patterns;
}

function shouldSkipDir(name: string, gitignorePatterns: Set<string>): boolean {
  if (IGNORE_DIRS.has(name)) return true;
  if (EXTRA_SKIP_DIRS.has(name)) return true;
  if (name.startsWith('.') && name !== '.github') return true;
  if (gitignorePatterns.has(name)) return true;
  return false;
}

function shouldSkipFile(name: string, gitignorePatterns: Set<string>): boolean {
  const ext = path.extname(name).toLowerCase();
  if (SKIP_EXTENSIONS.has(ext)) return true;
  if (name.endsWith('.min.js') || name.endsWith('.min.css')) return true;
  if (gitignorePatterns.has(name)) return true;
  return false;
}

function getLanguage(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  return LANGUAGE_MAP[ext] || null;
}

export interface WalkOptions {
  /** Maximum directory depth to recurse (default: 20) */
  maxDepth?: number;
  /** Maximum number of files to index (default: 5000) */
  maxFiles?: number;
  /** Include non-code files like .md, .json, .yaml (default: true) */
  includeConfig?: boolean;
}

export interface WalkResult {
  root: IndexNode;
  totalFiles: number;
  totalDirs: number;
  /** Flat list of all FILE nodes for downstream processing */
  fileNodes: IndexNode[];
}

/**
 * Walk a project directory and build the ROOT→DIR→FILE hierarchy.
 * Does NOT parse file contents — that's astParser's job.
 */
export function walkProject(
  projectRoot: string,
  options: WalkOptions = {},
): WalkResult {
  const maxDepth = options.maxDepth ?? 20;
  const maxFiles = options.maxFiles ?? 5000;
  const includeConfig = options.includeConfig ?? true;

  const now = Date.now();
  const gitignorePatterns = parseGitignore(projectRoot);
  const fileNodes: IndexNode[] = [];
  let totalDirs = 0;

  const rootNode: IndexNode = {
    id: uuid(),
    projectRoot,
    parentId: null,
    nodeType: 'ROOT',
    label: path.basename(projectRoot),
    depth: 0,
    filePath: null,
    lineStart: null,
    lineEnd: null,
    byteStart: null,
    byteEnd: null,
    tokenCount: 0,
    signature: null,
    docstring: null,
    collapsedSummary: null,
    language: null,
    lastIndexed: now,
    children: [],
  };

  function walkDir(dirPath: string, parentNode: IndexNode, currentDepth: number): void {
    if (currentDepth > maxDepth) return;
    if (fileNodes.length >= maxFiles) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    // Sort: directories first, then files, alphabetically
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    let position = 0;
    for (const entry of entries) {
      if (fileNodes.length >= maxFiles) break;

      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name, gitignorePatterns)) continue;

        totalDirs++;
        const dirNode: IndexNode = {
          id: uuid(),
          projectRoot,
          parentId: parentNode.id,
          nodeType: 'DIR',
          label: entry.name + '/',
          depth: currentDepth,
          filePath: path.join(dirPath, entry.name),
          lineStart: null,
          lineEnd: null,
          byteStart: null,
          byteEnd: null,
          tokenCount: 0,
          signature: null,
          docstring: null,
          collapsedSummary: null,
          language: null,
          lastIndexed: now,
          children: [],
        };
        parentNode.children.push(dirNode);
        walkDir(path.join(dirPath, entry.name), dirNode, currentDepth + 1);
        // Roll up token count from children
        dirNode.tokenCount = dirNode.children.reduce((s, c) => s + c.tokenCount, 0);
      } else {
        if (shouldSkipFile(entry.name, gitignorePatterns)) continue;

        const lang = getLanguage(entry.name);
        // Skip non-code files unless config files are included
        if (!lang && !includeConfig) continue;
        // Even with includeConfig, skip truly binary extensions
        const ext = path.extname(entry.name).toLowerCase();
        if (SKIP_EXTENSIONS.has(ext)) continue;

        const fullPath = path.join(dirPath, entry.name);
        let fileSize = 0;
        let lineCount = 0;
        try {
          const stat = fs.statSync(fullPath);
          fileSize = stat.size;
          // Skip files > 2MB — likely generated/binary
          if (fileSize > 2 * 1024 * 1024) continue;
          // Estimate lines for token count (reading just the line count, not parsing)
          const content = fs.readFileSync(fullPath, 'utf-8');
          lineCount = content.split('\n').length;
        } catch {
          continue;
        }

        const estimatedTokens = Math.ceil(fileSize / 3.5);
        const relativePath = path.relative(projectRoot, fullPath).replace(/\\/g, '/');

        const fileNode: IndexNode = {
          id: uuid(),
          projectRoot,
          parentId: parentNode.id,
          nodeType: 'FILE',
          label: entry.name,
          depth: currentDepth,
          filePath: relativePath,
          lineStart: 1,
          lineEnd: lineCount,
          byteStart: 0,
          byteEnd: fileSize,
          tokenCount: estimatedTokens,
          signature: null,
          docstring: null,
          collapsedSummary: null,
          language: lang,
          lastIndexed: now,
          children: [],
        };
        parentNode.children.push(fileNode);
        fileNodes.push(fileNode);
      }

      position++;
    }
  }

  walkDir(projectRoot, rootNode, 1);

  // Roll up root token count
  rootNode.tokenCount = rootNode.children.reduce((s, c) => s + c.tokenCount, 0);

  return {
    root: rootNode,
    totalFiles: fileNodes.length,
    totalDirs,
    fileNodes,
  };
}

/**
 * Flatten a node tree into an array for DB insertion.
 */
export function flattenNodes(node: IndexNode): IndexNode[] {
  const result: IndexNode[] = [node];
  for (const child of node.children) {
    result.push(...flattenNodes(child));
  }
  return result;
}

/**
 * Build edge list (parent→child with position) for DB insertion.
 */
export function buildEdges(node: IndexNode): { parentId: string; childId: string; position: number }[] {
  const edges: { parentId: string; childId: string; position: number }[] = [];
  for (let i = 0; i < node.children.length; i++) {
    edges.push({ parentId: node.id, childId: node.children[i].id, position: i });
    edges.push(...buildEdges(node.children[i]));
  }
  return edges;
}
