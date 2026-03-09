// ============================================
// Hierarchical Code Index — DB-backed service
// that owns the codebase tree. Provides:
//   peek(nodeId)     → child cost table
//   expand(nodeId)   → source content
//   find(query)      → symbol search
//   formatAtDepth()  → token-budget overview
//   buildIndex()     → full re-index
//   incrementalUpdate() → diff-based re-index
// ============================================
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import {
  walkProject,
  flattenNodes,
  buildEdges,
  type IndexNode,
  type WalkOptions,
} from './fsWalker.js';
import { parseAllFileNodes } from './astParser.js';
import {
  recomputeTokenCounts,
  computeDepthBudget,
  renderTreeAtDepth,
  countRangeTokens,
} from './tokenCounter.js';

// ── Types ──

export interface PeekResult {
  nodeId: string;
  label: string;
  nodeType: string;
  children: {
    id: string;
    label: string;
    nodeType: string;
    tokenCount: number;
    lineStart: number | null;
    lineEnd: number | null;
    childCount: number;
  }[];
  totalTokens: number;
}

export interface ExpandResult {
  nodeId: string;
  label: string;
  content: string;
  tokenCount: number;
  lineStart: number;
  lineEnd: number;
}

export interface FindResult {
  nodeId: string;
  label: string;
  nodeType: string;
  filePath: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  tokenCount: number;
  signature: string | null;
}

export interface IndexStats {
  totalNodes: number;
  totalFiles: number;
  totalDirs: number;
  totalTokens: number;
  maxDepth: number;
  lastIndexed: number;
}

// ── Service ──

export class HierarchicalCodeIndex {
  private db: Database.Database;
  // In-memory cache of the root node tree (built on index or loaded from DB)
  private rootNode: IndexNode | null = null;
  private projectRoot: string = '';

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Build a full hierarchical index for a project.
   * Walks the filesystem, parses AST for all code files,
   * persists to DB, and caches in memory.
   */
  buildIndex(projectRoot: string, options?: WalkOptions): IndexStats {
    this.projectRoot = projectRoot;
    const walkResult = walkProject(projectRoot, options);

    // Parse AST for all file nodes — adds CLASS/FUNCTION/METHOD children
    parseAllFileNodes(walkResult.fileNodes, projectRoot);

    // Recompute token counts bottom-up
    recomputeTokenCounts(walkResult.root);

    // Persist to DB
    this.persistTree(walkResult.root, projectRoot);

    // Cache in memory
    this.rootNode = walkResult.root;

    return {
      totalNodes: flattenNodes(walkResult.root).length,
      totalFiles: walkResult.totalFiles,
      totalDirs: walkResult.totalDirs,
      totalTokens: walkResult.root.tokenCount,
      maxDepth: this.computeMaxDepth(walkResult.root),
      lastIndexed: Date.now(),
    };
  }

  /**
   * Incremental update — only re-index files modified since lastIndexed.
   * Falls back to full rebuild if > 30% of files changed.
   */
  incrementalUpdate(projectRoot: string): IndexStats {
    this.projectRoot = projectRoot;

    // Get last indexed timestamp from DB
    const row = this.db.prepare(
      'SELECT MAX(last_indexed) as ts FROM code_index_nodes WHERE project_root = ?',
    ).get(projectRoot) as any;
    const lastTs = row?.ts || 0;

    if (!lastTs) {
      return this.buildIndex(projectRoot);
    }

    // Walk and check modified files
    const walkResult = walkProject(projectRoot);
    let changedCount = 0;
    for (const fnode of walkResult.fileNodes) {
      if (!fnode.filePath) continue;
      const fullPath = path.isAbsolute(fnode.filePath)
        ? fnode.filePath
        : path.join(projectRoot, fnode.filePath);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs > lastTs) changedCount++;
      } catch { /* skip */ }
    }

    // If > 30% changed, do full rebuild
    if (changedCount > walkResult.totalFiles * 0.3) {
      return this.buildIndex(projectRoot);
    }

    // Otherwise, selectively re-parse changed files
    for (const fnode of walkResult.fileNodes) {
      if (!fnode.filePath) continue;
      const fullPath = path.isAbsolute(fnode.filePath)
        ? fnode.filePath
        : path.join(projectRoot, fnode.filePath);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs <= lastTs) continue;
      } catch { continue; }

      // Re-parse this file's AST
      parseAllFileNodes([fnode], projectRoot);
    }

    // Recompute and persist
    recomputeTokenCounts(walkResult.root);
    this.persistTree(walkResult.root, projectRoot);
    this.rootNode = walkResult.root;

    return {
      totalNodes: flattenNodes(walkResult.root).length,
      totalFiles: walkResult.totalFiles,
      totalDirs: walkResult.totalDirs,
      totalTokens: walkResult.root.tokenCount,
      maxDepth: this.computeMaxDepth(walkResult.root),
      lastIndexed: Date.now(),
    };
  }

  /**
   * Peek at a node's children with their cost table.
   */
  peek(nodeId: string): PeekResult | null {
    const node = this.findNodeById(nodeId);
    if (!node) return null;

    return {
      nodeId: node.id,
      label: node.label,
      nodeType: node.nodeType,
      children: node.children.map(c => ({
        id: c.id,
        label: c.label,
        nodeType: c.nodeType,
        tokenCount: c.tokenCount,
        lineStart: c.lineStart,
        lineEnd: c.lineEnd,
        childCount: c.children.length,
      })),
      totalTokens: node.tokenCount,
    };
  }

  /**
   * Expand a node — return its actual source content.
   * For FILE/CLASS/FUNCTION nodes with filePath and line ranges.
   */
  expand(nodeId: string): ExpandResult | null {
    const node = this.findNodeById(nodeId);
    if (!node || !node.filePath || !node.lineStart || !node.lineEnd) return null;

    const fullPath = path.isAbsolute(node.filePath)
      ? node.filePath
      : path.join(this.projectRoot, node.filePath);

    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');
      const start = Math.max(0, node.lineStart - 1);
      const end = Math.min(lines.length, node.lineEnd);
      const slice = lines.slice(start, end).join('\n');

      return {
        nodeId: node.id,
        label: node.label,
        content: slice,
        tokenCount: node.tokenCount,
        lineStart: node.lineStart,
        lineEnd: node.lineEnd,
      };
    } catch {
      return null;
    }
  }

  /**
   * Search for symbols matching a query string.
   * Returns matching nodes sorted by relevance.
   */
  find(query: string, maxResults = 20): FindResult[] {
    if (!this.rootNode) return [];

    const queryLower = query.toLowerCase();
    const results: (FindResult & { score: number })[] = [];

    function search(node: IndexNode): void {
      const labelLower = node.label.toLowerCase();
      const sigLower = (node.signature || '').toLowerCase();

      let score = 0;
      // Exact match
      if (labelLower === queryLower) score = 100;
      // Prefix match
      else if (labelLower.startsWith(queryLower)) score = 80;
      // Contains
      else if (labelLower.includes(queryLower)) score = 60;
      // Signature match
      else if (sigLower.includes(queryLower)) score = 40;

      if (score > 0 && node.nodeType !== 'ROOT' && node.nodeType !== 'DIR') {
        results.push({
          nodeId: node.id,
          label: node.label,
          nodeType: node.nodeType,
          filePath: node.filePath,
          lineStart: node.lineStart,
          lineEnd: node.lineEnd,
          tokenCount: node.tokenCount,
          signature: node.signature,
          score,
        });
      }

      for (const child of node.children) {
        search(child);
      }
    }

    search(this.rootNode);
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, maxResults).map(({ score, ...rest }) => rest);
  }

  /**
   * Format the index tree at a depth that fits within the token budget.
   * This is the primary method called by contextAssembly.
   */
  formatAtDepth(budget: number): string {
    if (!this.rootNode) return 'No index available. Run buildIndex() first.';

    const { maxDepth } = computeDepthBudget(this.rootNode, budget);

    let output = `=== HIERARCHICAL CODE INDEX (${this.getStats()?.totalFiles || 0} files, `;
    output += `~${this.rootNode.tokenCount}tok total) ===\n`;
    output += `Showing depth 0-${maxDepth} (deeper nodes collapsed with token counts)\n\n`;

    output += renderTreeAtDepth(this.rootNode, maxDepth);

    // Trim to budget if still too long
    const budgetChars = budget * 3.5;
    if (output.length > budgetChars) {
      output = output.slice(0, Math.floor(budgetChars)) + '\n... [truncated to fit token budget]\n';
    }

    return output;
  }

  /**
   * Get root node ID (for peek/expand API entry point).
   */
  getRootId(): string | null {
    return this.rootNode?.id || null;
  }

  /**
   * Check if index exists for a project.
   */
  hasIndex(projectRoot: string): boolean {
    const row = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM code_index_nodes WHERE project_root = ?',
    ).get(projectRoot) as any;
    return (row?.cnt || 0) > 0;
  }

  /**
   * Get index statistics.
   */
  getStats(): IndexStats | null {
    if (!this.rootNode) return null;
    return {
      totalNodes: flattenNodes(this.rootNode).length,
      totalFiles: this.countNodesByType('FILE'),
      totalDirs: this.countNodesByType('DIR'),
      totalTokens: this.rootNode.tokenCount,
      maxDepth: this.computeMaxDepth(this.rootNode),
      lastIndexed: this.rootNode.lastIndexed,
    };
  }

  /**
   * Load the index from DB into memory.
   */
  loadFromDb(projectRoot: string): boolean {
    this.projectRoot = projectRoot;

    const rows = this.db.prepare(
      'SELECT * FROM code_index_nodes WHERE project_root = ? ORDER BY depth ASC',
    ).all(projectRoot) as any[];

    if (rows.length === 0) return false;

    // Build in-memory tree from flat DB rows
    const nodeMap = new Map<string, IndexNode>();

    for (const row of rows) {
      const node: IndexNode = {
        id: row.id,
        projectRoot: row.project_root,
        parentId: row.parent_id,
        nodeType: row.node_type,
        label: row.label,
        depth: row.depth,
        filePath: row.file_path,
        lineStart: row.line_start,
        lineEnd: row.line_end,
        byteStart: row.byte_start,
        byteEnd: row.byte_end,
        tokenCount: row.token_count,
        signature: row.signature,
        docstring: row.docstring,
        collapsedSummary: row.collapsed_summary,
        language: row.language,
        lastIndexed: row.last_indexed,
        children: [],
      };
      nodeMap.set(node.id, node);
    }

    // Wire parent-child relationships using edges
    const edges = this.db.prepare(
      'SELECT * FROM code_index_edges WHERE parent_id IN (SELECT id FROM code_index_nodes WHERE project_root = ?) ORDER BY position ASC',
    ).all(projectRoot) as any[];

    for (const edge of edges) {
      const parent = nodeMap.get(edge.parent_id);
      const child = nodeMap.get(edge.child_id);
      if (parent && child) {
        parent.children.push(child);
      }
    }

    // Find root
    const rootRow = rows.find((r: any) => r.node_type === 'ROOT');
    if (rootRow) {
      this.rootNode = nodeMap.get(rootRow.id) || null;
    }

    return this.rootNode !== null;
  }

  /**
   * Clear all index data for a project from DB.
   */
  clearIndex(projectRoot: string): void {
    this.db.prepare(
      'DELETE FROM code_index_edges WHERE parent_id IN (SELECT id FROM code_index_nodes WHERE project_root = ?)',
    ).run(projectRoot);
    this.db.prepare(
      'DELETE FROM code_index_nodes WHERE project_root = ?',
    ).run(projectRoot);
    if (this.rootNode?.projectRoot === projectRoot) {
      this.rootNode = null;
    }
  }

  // ── Private Methods ──

  private persistTree(root: IndexNode, projectRoot: string): void {
    // Clear existing data for this project
    this.clearIndex(projectRoot);

    const allNodes = flattenNodes(root);
    const allEdges = buildEdges(root);

    // Batch insert nodes
    const insertNode = this.db.prepare(`
      INSERT INTO code_index_nodes
        (id, project_root, parent_id, node_type, label, depth, file_path,
         line_start, line_end, byte_start, byte_end, token_count,
         signature, docstring, collapsed_summary, language, last_indexed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertEdge = this.db.prepare(`
      INSERT INTO code_index_edges (parent_id, child_id, position)
      VALUES (?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      for (const node of allNodes) {
        insertNode.run(
          node.id, node.projectRoot, node.parentId, node.nodeType,
          node.label, node.depth, node.filePath,
          node.lineStart, node.lineEnd, node.byteStart, node.byteEnd,
          node.tokenCount, node.signature, node.docstring,
          node.collapsedSummary, node.language, node.lastIndexed,
        );
      }
      for (const edge of allEdges) {
        insertEdge.run(edge.parentId, edge.childId, edge.position);
      }
    });

    transaction();
  }

  private findNodeById(nodeId: string): IndexNode | null {
    if (!this.rootNode) return null;

    function search(node: IndexNode): IndexNode | null {
      if (node.id === nodeId) return node;
      for (const child of node.children) {
        const found = search(child);
        if (found) return found;
      }
      return null;
    }

    return search(this.rootNode);
  }

  private computeMaxDepth(node: IndexNode): number {
    if (node.children.length === 0) return node.depth;
    return Math.max(...node.children.map(c => this.computeMaxDepth(c)));
  }

  private countNodesByType(type: string): number {
    if (!this.rootNode) return 0;
    let count = 0;
    function walk(node: IndexNode): void {
      if (node.nodeType === type) count++;
      for (const child of node.children) walk(child);
    }
    walk(this.rootNode);
    return count;
  }
}
