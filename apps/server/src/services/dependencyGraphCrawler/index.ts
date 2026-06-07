// ============================================================
// Dependency Graph Crawler
//
// Walks TypeScript source files, extracts import statements,
// builds a dependency graph, and identifies:
// - Circular dependencies
// - High-impact modules (many dependents = high-risk change)
// - Isolated modules (no imports = dead code candidates)
// Stores results in app_kv for querying.
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import type { Database } from 'better-sqlite3';

interface DependencyNode {
  file: string;
  imports: string[];      // files this module imports
  importedBy: string[];   // files that import this module
}

interface CrawlResult {
  totalFiles: number;
  totalEdges: number;
  circularDependencies: string[][];
  highImpactFiles: Array<{ file: string; dependentCount: number }>;
  crawledAt: string;
}

// ── File Walking ─────────────────────────────────────────────

function walkTs(dir: string, exts = ['.ts', '.tsx']): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...walkTs(fullPath, exts));
      } else if (exts.some(e => entry.name.endsWith(e))) {
        files.push(fullPath);
      }
    }
  } catch { /* skip unreadable dirs */ }
  return files;
}

// ── Import Extraction ────────────────────────────────────────

const IMPORT_RE = /^(?:import|export)\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/gm;
const REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function extractImports(content: string): string[] {
  const imports: string[] = [];
  for (const re of [IMPORT_RE, REQUIRE_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const spec = m[1];
      if (spec && (spec.startsWith('.') || spec.startsWith('/'))) {
        imports.push(spec);
      }
    }
  }
  return [...new Set(imports)];
}

function resolveImport(fromFile: string, importPath: string, allFiles: string[]): string | null {
  const dir = path.dirname(fromFile);
  const candidates = [
    importPath,
    importPath + '.ts',
    importPath + '.tsx',
    importPath + '/index.ts',
    importPath + '/index.tsx',
  ].map(c => path.resolve(dir, c));

  for (const candidate of candidates) {
    if (allFiles.includes(candidate)) return candidate;
  }
  return null;
}

// ── Circular Detection ───────────────────────────────────────

function detectCycles(graph: Map<string, string[]>): string[][] {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const cycles: string[][] = [];

  function dfs(node: string, pathArr: string[]): void {
    if (stack.has(node)) {
      const cycleStart = pathArr.indexOf(node);
      if (cycleStart >= 0) cycles.push(pathArr.slice(cycleStart));
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    stack.add(node);
    for (const dep of graph.get(node) ?? []) {
      dfs(dep, [...pathArr, node]);
    }
    stack.delete(node);
  }

  for (const node of graph.keys()) dfs(node, []);

  // Deduplicate cycles (same cycle can be found from multiple entry points)
  const seen = new Set<string>();
  return cycles.filter(cycle => {
    const key = [...cycle].sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Main Crawler ─────────────────────────────────────────────

export function runDependencyGraphCrawlerTick(
  db: Database,
  opts: { srcRoot: string; maxFiles?: number } = { srcRoot: path.join(process.cwd(), 'src') },
): CrawlResult {
  const { srcRoot, maxFiles = 500 } = opts;
  const allFiles = walkTs(srcRoot).slice(0, maxFiles);

  // Build graph
  const forwardGraph = new Map<string, string[]>(); // file -> files it imports
  const reverseGraph = new Map<string, string[]>(); // file -> files that import it

  for (const file of allFiles) {
    forwardGraph.set(file, []);
    reverseGraph.set(file, []);
  }

  for (const file of allFiles) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const importSpecs = extractImports(content);
      const resolved = importSpecs
        .map(spec => resolveImport(file, spec, allFiles))
        .filter((r): r is string => r !== null);

      forwardGraph.set(file, resolved);
      for (const dep of resolved) {
        const existing = reverseGraph.get(dep) ?? [];
        existing.push(file);
        reverseGraph.set(dep, existing);
      }
    } catch { /* skip unreadable files */ }
  }

  // Detect circular dependencies
  const cycles = detectCycles(forwardGraph);

  // Find high-impact files (most dependents)
  const highImpact = Array.from(reverseGraph.entries())
    .map(([file, importedBy]) => ({ file, dependentCount: importedBy.length }))
    .filter(e => e.dependentCount > 0)
    .sort((a, b) => b.dependentCount - a.dependentCount)
    .slice(0, 20)
    .map(e => ({
      file: path.relative(srcRoot, e.file),
      dependentCount: e.dependentCount,
    }));

  const totalEdges = Array.from(forwardGraph.values()).reduce((sum, deps) => sum + deps.length, 0);

  const result: CrawlResult = {
    totalFiles: allFiles.length,
    totalEdges,
    circularDependencies: cycles.map(cycle => cycle.map(f => path.relative(srcRoot, f))),
    highImpactFiles: highImpact,
    crawledAt: new Date().toISOString(),
  };

  // Persist to app_kv
  try {
    db.prepare('INSERT OR REPLACE INTO app_kv (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))')
      .run('dependency_graph:result', JSON.stringify(result));
    db.prepare('INSERT OR REPLACE INTO app_kv (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))')
      .run('dependency_graph:last_run', new Date().toISOString());
  } catch { /* non-fatal */ }

  return result;
}
