// ============================================
// Token Counter — pluggable tokenizer for
// hierarchical index nodes. Wraps the existing
// estimateTokens utility and supports bottom-up
// aggregation (leaves → parents).
// ============================================
import * as fs from 'fs';
import * as path from 'path';
import type { IndexNode } from './fsWalker.js';

/**
 * Estimate token count for a string using the ~3.5 chars/token heuristic.
 * This matches the existing estimateTokens from providers.ts.
 */
export function estimateTokensFromText(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Estimate token count from byte size.
 */
export function estimateTokensFromBytes(bytes: number): number {
  return Math.ceil(bytes / 3.5);
}

/**
 * Count exact tokens for a file on disk.
 * Returns { tokens, lines, bytes } or null if unreadable.
 */
export function countFileTokens(
  projectRoot: string,
  relativePath: string,
): { tokens: number; lines: number; bytes: number } | null {
  try {
    const fullPath = path.isAbsolute(relativePath)
      ? relativePath
      : path.join(projectRoot, relativePath);
    const content = fs.readFileSync(fullPath, 'utf-8');
    return {
      tokens: estimateTokensFromText(content),
      lines: content.split('\n').length,
      bytes: Buffer.byteLength(content, 'utf-8'),
    };
  } catch {
    return null;
  }
}

/**
 * Count tokens for a specific line range within a file.
 */
export function countRangeTokens(
  projectRoot: string,
  relativePath: string,
  startLine: number,
  endLine: number,
): number {
  try {
    const fullPath = path.isAbsolute(relativePath)
      ? relativePath
      : path.join(projectRoot, relativePath);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    const start = Math.max(0, startLine - 1);
    const end = Math.min(lines.length, endLine);
    const slice = lines.slice(start, end).join('\n');
    return estimateTokensFromText(slice);
  } catch {
    return 0;
  }
}

/**
 * Recompute token counts bottom-up: leaf nodes get their own count,
 * parent nodes sum their children. Modifies nodes in place.
 */
export function recomputeTokenCounts(node: IndexNode): number {
  if (node.children.length === 0) {
    // Leaf node — token count already set by fsWalker or astParser
    return node.tokenCount;
  }

  let childTotal = 0;
  for (const child of node.children) {
    childTotal += recomputeTokenCounts(child);
  }
  node.tokenCount = childTotal;
  return childTotal;
}

/**
 * Given a token budget, determine how many levels of the tree we can
 * render before exceeding the budget.
 *
 * Returns the maximum depth that fits within the budget,
 * plus token cost at each depth.
 */
export function computeDepthBudget(
  root: IndexNode,
  budget: number,
): { maxDepth: number; costPerDepth: Map<number, number> } {
  const costPerDepth = new Map<number, number>();

  function accumulate(node: IndexNode): void {
    const d = node.depth;
    const headerCost = estimateTokensFromText(formatNodeHeader(node));
    costPerDepth.set(d, (costPerDepth.get(d) || 0) + headerCost);
    for (const child of node.children) {
      accumulate(child);
    }
  }

  accumulate(root);

  let total = 0;
  let maxDepth = 0;
  const sortedDepths = [...costPerDepth.keys()].sort((a, b) => a - b);
  for (const depth of sortedDepths) {
    total += costPerDepth.get(depth)!;
    if (total > budget) break;
    maxDepth = depth;
  }

  return { maxDepth, costPerDepth };
}

/**
 * Format a single node's header line for cost estimation.
 */
function formatNodeHeader(node: IndexNode): string {
  const indent = '  '.repeat(node.depth);
  const tokenTag = `~${node.tokenCount}tok`;
  switch (node.nodeType) {
    case 'ROOT':
      return `${node.label} [${tokenTag}]\n`;
    case 'DIR':
      return `${indent}📁 ${node.label} [${tokenTag}]\n`;
    case 'FILE':
      return `${indent}📄 ${node.label} [${node.language || '?'}] L${node.lineStart}-${node.lineEnd} ${tokenTag}\n`;
    case 'CLASS':
    case 'INTERFACE':
    case 'ENUM':
    case 'TYPE_ALIAS':
      return `${indent}🔷 ${node.nodeType.toLowerCase()} ${node.label}${node.signature ? ` — ${node.signature.slice(0, 60)}` : ''} L${node.lineStart}-${node.lineEnd} ${tokenTag}\n`;
    case 'FUNCTION':
    case 'METHOD':
      return `${indent}⚡ ${node.nodeType.toLowerCase()} ${node.label}${node.signature ? `(${node.signature.slice(0, 50)})` : '()'} L${node.lineStart}-${node.lineEnd} ${tokenTag}\n`;
    case 'IMPORT_BLOCK':
      return `${indent}📥 imports [${tokenTag}]\n`;
    case 'CONSTANT_BLOCK':
      return `${indent}📌 constants [${tokenTag}]\n`;
    default:
      return `${indent}${node.label} [${tokenTag}]\n`;
  }
}

/**
 * Render a tree at a specific max depth with token annotations.
 * Nodes deeper than maxDepth are collapsed to a single "... N children, ~Xtok" line.
 */
export function renderTreeAtDepth(
  node: IndexNode,
  maxDepth: number,
  currentDepth = 0,
): string {
  const indent = '  '.repeat(currentDepth);
  let output = '';

  const header = formatNodeHeader({ ...node, depth: currentDepth });
  output += header;

  if (currentDepth >= maxDepth && node.children.length > 0) {
    // Collapsed: show child count + total token cost
    const childCount = countAllDescendants(node);
    output += `${indent}  └─ [${childCount} items collapsed, ~${node.tokenCount}tok]\n`;
    return output;
  }

  for (const child of node.children) {
    output += renderTreeAtDepth(child, maxDepth, currentDepth + 1);
  }

  return output;
}

function countAllDescendants(node: IndexNode): number {
  let count = node.children.length;
  for (const child of node.children) {
    count += countAllDescendants(child);
  }
  return count;
}
