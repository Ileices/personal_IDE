// ============================================
// Dependency Graph Builder — builds file-level
// dependency DAGs from import analysis.
// Ported from auto_rebuilder.py build_dependency_graph()
// ============================================
import { readFileSync } from 'fs';
import { extname, basename } from 'path';

export interface DepNode {
  file: string;        // relative path
  language: string;
  imports: string[];    // raw import strings
  dependsOn: string[]; // resolved relative paths
}

export interface DepGraph {
  nodes: Map<string, DepNode>;
  /** files with no dependents — potential entry points */
  roots: string[];
  /** files with circular dependencies */
  cycles: string[][];
}

const EXT_LANG: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
  '.py': 'python', '.rs': 'rust', '.go': 'go', '.java': 'java',
  '.c': 'c', '.cpp': 'cpp', '.cs': 'csharp', '.rb': 'ruby',
};

/**
 * Build a file-level dependency graph from a set of file analyses.
 */
export function buildDepGraph(
  files: { relativePath: string; imports: string[] }[],
): DepGraph {
  const nodes = new Map<string, DepNode>();

  // Index by filename / module name for resolution
  const nameIndex = new Map<string, string>(); // baseName → relativePath
  for (const f of files) {
    const lang = EXT_LANG[extname(f.relativePath)] || 'unknown';
    nodes.set(f.relativePath, {
      file: f.relativePath,
      language: lang,
      imports: f.imports,
      dependsOn: [],
    });
    // Register short names for resolution
    const base = basename(f.relativePath).replace(/\.\w+$/, '');
    nameIndex.set(base, f.relativePath);
    nameIndex.set(f.relativePath, f.relativePath);
  }

  // Resolve imports to file paths
  for (const [, node] of nodes) {
    for (const imp of node.imports) {
      const resolved = resolveImport(imp, node.language, nameIndex);
      if (resolved && resolved !== node.file) {
        node.dependsOn.push(resolved);
      }
    }
  }

  // Find roots (no one depends on them) — potential entry points
  const depTargets = new Set<string>();
  for (const [, node] of nodes) {
    for (const dep of node.dependsOn) depTargets.add(dep);
  }
  const roots = [...nodes.keys()].filter(f => !depTargets.has(f));

  // Detect cycles (DFS)
  const cycles = detectCycles(nodes);

  return { nodes, roots, cycles };
}

function resolveImport(
  imp: string, language: string, index: Map<string, string>,
): string | null {
  // TS/JS: import { X } from './foo'  or  import X from '../bar/baz'
  const tsMatch = imp.match(/from\s+['"]([^'"]+)['"]/);
  if (tsMatch) {
    const target = tsMatch[1].replace(/^\.\//, '').replace(/\.\w+$/, '');
    return index.get(target) || index.get(basename(target)) || null;
  }
  // Python: from foo.bar import X  or  import foo
  const pyFromMatch = imp.match(/from\s+(\S+)\s+import/);
  if (pyFromMatch) {
    const mod = pyFromMatch[1].replace(/\./g, '/');
    return index.get(mod) || index.get(basename(mod)) || null;
  }
  const pyImportMatch = imp.match(/^import\s+(\S+)/);
  if (pyImportMatch) {
    const mod = pyImportMatch[1].replace(/\./g, '/');
    return index.get(mod) || index.get(basename(mod)) || null;
  }
  return null;
}

function detectCycles(nodes: Map<string, DepNode>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];

  function dfs(file: string): void {
    if (stack.has(file)) {
      const cycleStart = path.indexOf(file);
      if (cycleStart >= 0) cycles.push(path.slice(cycleStart));
      return;
    }
    if (visited.has(file)) return;
    visited.add(file);
    stack.add(file);
    path.push(file);

    const node = nodes.get(file);
    if (node) {
      for (const dep of node.dependsOn) dfs(dep);
    }

    path.pop();
    stack.delete(file);
  }

  for (const file of nodes.keys()) dfs(file);
  return cycles;
}
