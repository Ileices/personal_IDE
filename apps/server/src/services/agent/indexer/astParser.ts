// ============================================
// AST Parser — Regex-based symbol extraction
// that builds IMPORT_BLOCK, CLASS, METHOD,
// FUNCTION, INTERFACE, ENUM, TYPE_ALIAS child
// nodes under each FILE node.
//
// Uses proven regex patterns from codeIndexer.ts,
// enhanced with IMPORT_BLOCK and CONSTANT_BLOCK
// grouping, signature and docstring extraction.
//
// Future: swap in web-tree-sitter (WASM) for
// true AST accuracy without changing the output
// interface.
// ============================================
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuid } from 'uuid';
import type { IndexNode, NodeType } from './fsWalker.js';
import { estimateTokensFromText } from './tokenCounter.js';

// ── Public API ──

/**
 * Parse a FILE-level IndexNode and populate its children with
 * IMPORT_BLOCK, CONSTANT_BLOCK, CLASS, FUNCTION, INTERFACE, etc.
 * Modifies the node in place and returns it.
 */
export function parseFileNode(
  node: IndexNode,
  projectRoot: string,
): IndexNode {
  if (node.nodeType !== 'FILE' || !node.filePath) return node;

  const fullPath = path.isAbsolute(node.filePath)
    ? node.filePath
    : path.join(projectRoot, node.filePath);

  let content: string;
  try {
    content = fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return node;
  }

  const lang = node.language || 'unknown';
  const lines = content.split('\n');
  node.children = [];

  if (['typescript', 'javascript'].includes(lang)) {
    parseTSFile(node, lines, content);
  } else if (lang === 'python') {
    parsePyFile(node, lines, content);
  } else if (lang === 'rust') {
    parseRustFile(node, lines, content);
  } else if (lang === 'go') {
    parseGoFile(node, lines, content);
  } else {
    parseGenericFile(node, lines, content);
  }

  // Recompute file-level token count from children
  if (node.children.length > 0) {
    node.tokenCount = node.children.reduce((s, c) => s + c.tokenCount, 0);
  }

  return node;
}

/**
 * Parse all FILE nodes in a walk result.
 */
export function parseAllFileNodes(
  fileNodes: IndexNode[],
  projectRoot: string,
): void {
  for (const fnode of fileNodes) {
    parseFileNode(fnode, projectRoot);
  }
}

// ── TypeScript / JavaScript Parser ──

function parseTSFile(
  parent: IndexNode,
  lines: string[],
  content: string,
): void {
  const baseDepth = parent.depth + 1;

  // Group imports
  const importLines = findImportBlock(lines, 'ts');
  if (importLines.start >= 0) {
    const importText = lines.slice(importLines.start, importLines.end + 1).join('\n');
    parent.children.push(makeChildNode(parent, {
      nodeType: 'IMPORT_BLOCK',
      label: `imports (${importLines.end - importLines.start + 1} lines)`,
      depth: baseDepth,
      lineStart: importLines.start + 1,
      lineEnd: importLines.end + 1,
      byteStart: byteOffset(lines, importLines.start),
      byteEnd: byteOffset(lines, importLines.end + 1),
      tokenCount: estimateTokensFromText(importText),
    }));
  }

  // Group top-level constants (const/let/var at indent 0, not in a function)
  const constRanges = findConstantBlocks(lines, 'ts');
  if (constRanges.length > 0) {
    const first = constRanges[0];
    const last = constRanges[constRanges.length - 1];
    const constText = constRanges.map(r => lines.slice(r.start, r.end + 1).join('\n')).join('\n');
    parent.children.push(makeChildNode(parent, {
      nodeType: 'CONSTANT_BLOCK',
      label: `constants (${constRanges.length} declarations)`,
      depth: baseDepth,
      lineStart: first.start + 1,
      lineEnd: last.end + 1,
      byteStart: byteOffset(lines, first.start),
      byteEnd: byteOffset(lines, last.end + 1),
      tokenCount: estimateTokensFromText(constText),
    }));
  }

  // Parse classes, interfaces, enums, type aliases, functions
  parseTSSymbols(parent, lines, content, baseDepth);
}

function parseTSSymbols(
  parent: IndexNode,
  lines: string[],
  _content: string,
  baseDepth: number,
): void {
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    const lineNum = i + 1;

    // Skip empty/comment lines
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      i++;
      continue;
    }

    // Class or abstract class
    const classMatch = trimmed.match(/^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/);
    if (classMatch) {
      const endIdx = findBraceBlockEnd(lines, i);
      const classNode = makeChildNode(parent, {
        nodeType: 'CLASS',
        label: classMatch[1],
        depth: baseDepth,
        lineStart: lineNum,
        lineEnd: endIdx + 1,
        byteStart: byteOffset(lines, i),
        byteEnd: byteOffset(lines, endIdx + 1),
        tokenCount: estimateTokensFromText(lines.slice(i, endIdx + 1).join('\n')),
        signature: trimmed.slice(0, 100),
        docstring: extractJSDoc(lines, i),
      });
      // Parse methods inside the class
      parseTSMethods(classNode, lines, i + 1, endIdx, baseDepth + 1);
      parent.children.push(classNode);
      i = endIdx + 1;
      continue;
    }

    // Interface
    const ifaceMatch = trimmed.match(/^(?:export\s+)?(?:default\s+)?interface\s+(\w+)/);
    if (ifaceMatch) {
      const endIdx = findBraceBlockEnd(lines, i);
      parent.children.push(makeChildNode(parent, {
        nodeType: 'INTERFACE',
        label: ifaceMatch[1],
        depth: baseDepth,
        lineStart: lineNum,
        lineEnd: endIdx + 1,
        byteStart: byteOffset(lines, i),
        byteEnd: byteOffset(lines, endIdx + 1),
        tokenCount: estimateTokensFromText(lines.slice(i, endIdx + 1).join('\n')),
        signature: trimmed.slice(0, 100),
        docstring: extractJSDoc(lines, i),
      }));
      i = endIdx + 1;
      continue;
    }

    // Enum
    const enumMatch = trimmed.match(/^(?:export\s+)?(?:const\s+)?enum\s+(\w+)/);
    if (enumMatch) {
      const endIdx = findBraceBlockEnd(lines, i);
      parent.children.push(makeChildNode(parent, {
        nodeType: 'ENUM',
        label: enumMatch[1],
        depth: baseDepth,
        lineStart: lineNum,
        lineEnd: endIdx + 1,
        byteStart: byteOffset(lines, i),
        byteEnd: byteOffset(lines, endIdx + 1),
        tokenCount: estimateTokensFromText(lines.slice(i, endIdx + 1).join('\n')),
        signature: trimmed.slice(0, 80),
      }));
      i = endIdx + 1;
      continue;
    }

    // Type alias
    const typeMatch = trimmed.match(/^(?:export\s+)?type\s+(\w+)/);
    if (typeMatch && !trimmed.includes('import(')) {
      const endIdx = findTypeEnd(lines, i);
      parent.children.push(makeChildNode(parent, {
        nodeType: 'TYPE_ALIAS',
        label: typeMatch[1],
        depth: baseDepth,
        lineStart: lineNum,
        lineEnd: endIdx + 1,
        byteStart: byteOffset(lines, i),
        byteEnd: byteOffset(lines, endIdx + 1),
        tokenCount: estimateTokensFromText(lines.slice(i, endIdx + 1).join('\n')),
        signature: trimmed.slice(0, 100),
      }));
      i = endIdx + 1;
      continue;
    }

    // Top-level function (not a method)
    const funcMatch = trimmed.match(
      /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)/,
    );
    if (funcMatch) {
      const endIdx = findBraceBlockEnd(lines, i);
      parent.children.push(makeChildNode(parent, {
        nodeType: 'FUNCTION',
        label: funcMatch[1],
        depth: baseDepth,
        lineStart: lineNum,
        lineEnd: endIdx + 1,
        byteStart: byteOffset(lines, i),
        byteEnd: byteOffset(lines, endIdx + 1),
        tokenCount: estimateTokensFromText(lines.slice(i, endIdx + 1).join('\n')),
        signature: trimmed.slice(0, 120),
        docstring: extractJSDoc(lines, i),
      }));
      i = endIdx + 1;
      continue;
    }

    // Arrow function: export const X = ...
    const arrowMatch = trimmed.match(
      /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_]\w*)\s*(?::\s*[^=]+)?\s*=>/,
    );
    if (arrowMatch) {
      const endIdx = findBraceBlockEnd(lines, i);
      parent.children.push(makeChildNode(parent, {
        nodeType: 'FUNCTION',
        label: arrowMatch[1],
        depth: baseDepth,
        lineStart: lineNum,
        lineEnd: endIdx + 1,
        byteStart: byteOffset(lines, i),
        byteEnd: byteOffset(lines, endIdx + 1),
        tokenCount: estimateTokensFromText(lines.slice(i, endIdx + 1).join('\n')),
        signature: trimmed.slice(0, 120),
        docstring: extractJSDoc(lines, i),
      }));
      i = endIdx + 1;
      continue;
    }

    i++;
  }
}

function parseTSMethods(
  classNode: IndexNode,
  lines: string[],
  startIdx: number,
  endIdx: number,
  depth: number,
): void {
  for (let i = startIdx; i < endIdx; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

    // Method pattern: optional access modifier, optional async/static/get/set, name(...)
    const methodMatch = trimmed.match(
      /^(?:public|private|protected|readonly|override|abstract|static|async|get|set|\s)*\s*(\w+)\s*\([^)]*\)\s*(?::\s*\S[^{]*)?\s*\{/,
    );
    if (methodMatch && methodMatch[1] !== 'if' && methodMatch[1] !== 'for' && methodMatch[1] !== 'while') {
      const mEnd = findBraceBlockEnd(lines, i);
      classNode.children.push(makeChildNode(classNode, {
        nodeType: 'METHOD',
        label: methodMatch[1],
        depth,
        lineStart: i + 1,
        lineEnd: mEnd + 1,
        byteStart: byteOffset(lines, i),
        byteEnd: byteOffset(lines, mEnd + 1),
        tokenCount: estimateTokensFromText(lines.slice(i, mEnd + 1).join('\n')),
        signature: trimmed.slice(0, 100),
        docstring: extractJSDoc(lines, i),
      }));
      i = mEnd;
    }
  }
}

// ── Python Parser ──

function parsePyFile(
  parent: IndexNode,
  lines: string[],
  content: string,
): void {
  const baseDepth = parent.depth + 1;

  // Imports
  const importLines = findImportBlock(lines, 'py');
  if (importLines.start >= 0) {
    const importText = lines.slice(importLines.start, importLines.end + 1).join('\n');
    parent.children.push(makeChildNode(parent, {
      nodeType: 'IMPORT_BLOCK',
      label: `imports (${importLines.end - importLines.start + 1} lines)`,
      depth: baseDepth,
      lineStart: importLines.start + 1,
      lineEnd: importLines.end + 1,
      byteStart: byteOffset(lines, importLines.start),
      byteEnd: byteOffset(lines, importLines.end + 1),
      tokenCount: estimateTokensFromText(importText),
    }));
  }

  // Top-level classes and functions
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Only top-level (no leading whitespace)
    if (line[0] === ' ' || line[0] === '\t') continue;

    const classMatch = trimmed.match(/^class\s+(\w+)/);
    if (classMatch) {
      const endIdx = findPyBlockEnd(lines, i);
      const classNode = makeChildNode(parent, {
        nodeType: 'CLASS',
        label: classMatch[1],
        depth: baseDepth,
        lineStart: i + 1,
        lineEnd: endIdx,
        byteStart: byteOffset(lines, i),
        byteEnd: byteOffset(lines, endIdx),
        tokenCount: estimateTokensFromText(lines.slice(i, endIdx).join('\n')),
        signature: trimmed.slice(0, 100),
        docstring: extractPyDocstring(lines, i),
      });
      // Parse methods inside the class
      parsePyMethods(classNode, lines, i + 1, endIdx, baseDepth + 1);
      parent.children.push(classNode);
      i = endIdx - 1;
      continue;
    }

    const funcMatch = trimmed.match(/^(?:async\s+)?def\s+(\w+)/);
    if (funcMatch) {
      const endIdx = findPyBlockEnd(lines, i);
      parent.children.push(makeChildNode(parent, {
        nodeType: 'FUNCTION',
        label: funcMatch[1],
        depth: baseDepth,
        lineStart: i + 1,
        lineEnd: endIdx,
        byteStart: byteOffset(lines, i),
        byteEnd: byteOffset(lines, endIdx),
        tokenCount: estimateTokensFromText(lines.slice(i, endIdx).join('\n')),
        signature: trimmed.slice(0, 120),
        docstring: extractPyDocstring(lines, i),
      }));
      i = endIdx - 1;
      continue;
    }
  }
}

function parsePyMethods(
  classNode: IndexNode,
  lines: string[],
  startIdx: number,
  endIdx: number,
  depth: number,
): void {
  const classIndent = lines[startIdx - 1]?.search(/\S/) ?? 0;
  for (let i = startIdx; i < endIdx; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const indent = line.search(/\S/);
    if (indent <= classIndent) continue;

    const methodMatch = trimmed.match(/^(?:async\s+)?def\s+(\w+)/);
    if (methodMatch) {
      const mEnd = findPyBlockEnd(lines, i);
      classNode.children.push(makeChildNode(classNode, {
        nodeType: 'METHOD',
        label: methodMatch[1],
        depth,
        lineStart: i + 1,
        lineEnd: mEnd,
        byteStart: byteOffset(lines, i),
        byteEnd: byteOffset(lines, mEnd),
        tokenCount: estimateTokensFromText(lines.slice(i, mEnd).join('\n')),
        signature: trimmed.slice(0, 120),
        docstring: extractPyDocstring(lines, i),
      }));
      i = mEnd - 1;
    }
  }
}

// ── Rust Parser ──

function parseRustFile(
  parent: IndexNode,
  lines: string[],
  content: string,
): void {
  const baseDepth = parent.depth + 1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('//')) continue;

    // use statements (imports)
    // Grouped separately if needed

    // Struct
    const structMatch = trimmed.match(/^(?:pub\s+)?struct\s+(\w+)/);
    if (structMatch) {
      const endIdx = findBraceBlockEnd(lines, i);
      parent.children.push(makeChildNode(parent, {
        nodeType: 'CLASS',
        label: structMatch[1],
        depth: baseDepth,
        lineStart: i + 1,
        lineEnd: endIdx + 1,
        byteStart: byteOffset(lines, i),
        byteEnd: byteOffset(lines, endIdx + 1),
        tokenCount: estimateTokensFromText(lines.slice(i, endIdx + 1).join('\n')),
        signature: trimmed.slice(0, 100),
      }));
      i = endIdx;
      continue;
    }

    // Enum
    const enumMatch = trimmed.match(/^(?:pub\s+)?enum\s+(\w+)/);
    if (enumMatch) {
      const endIdx = findBraceBlockEnd(lines, i);
      parent.children.push(makeChildNode(parent, {
        nodeType: 'ENUM',
        label: enumMatch[1],
        depth: baseDepth,
        lineStart: i + 1,
        lineEnd: endIdx + 1,
        byteStart: byteOffset(lines, i),
        byteEnd: byteOffset(lines, endIdx + 1),
        tokenCount: estimateTokensFromText(lines.slice(i, endIdx + 1).join('\n')),
        signature: trimmed.slice(0, 100),
      }));
      i = endIdx;
      continue;
    }

    // Trait (→ interface)
    const traitMatch = trimmed.match(/^(?:pub\s+)?trait\s+(\w+)/);
    if (traitMatch) {
      const endIdx = findBraceBlockEnd(lines, i);
      parent.children.push(makeChildNode(parent, {
        nodeType: 'INTERFACE',
        label: traitMatch[1],
        depth: baseDepth,
        lineStart: i + 1,
        lineEnd: endIdx + 1,
        byteStart: byteOffset(lines, i),
        byteEnd: byteOffset(lines, endIdx + 1),
        tokenCount: estimateTokensFromText(lines.slice(i, endIdx + 1).join('\n')),
        signature: trimmed.slice(0, 100),
      }));
      i = endIdx;
      continue;
    }

    // fn
    const fnMatch = trimmed.match(/^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/);
    if (fnMatch) {
      const endIdx = findBraceBlockEnd(lines, i);
      parent.children.push(makeChildNode(parent, {
        nodeType: 'FUNCTION',
        label: fnMatch[1],
        depth: baseDepth,
        lineStart: i + 1,
        lineEnd: endIdx + 1,
        byteStart: byteOffset(lines, i),
        byteEnd: byteOffset(lines, endIdx + 1),
        tokenCount: estimateTokensFromText(lines.slice(i, endIdx + 1).join('\n')),
        signature: trimmed.slice(0, 120),
      }));
      i = endIdx;
      continue;
    }
  }
}

// ── Go Parser ──

function parseGoFile(
  parent: IndexNode,
  lines: string[],
  content: string,
): void {
  const baseDepth = parent.depth + 1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('//')) continue;

    // type X struct
    const structMatch = trimmed.match(/^type\s+(\w+)\s+struct/);
    if (structMatch) {
      const endIdx = findBraceBlockEnd(lines, i);
      parent.children.push(makeChildNode(parent, {
        nodeType: 'CLASS',
        label: structMatch[1],
        depth: baseDepth,
        lineStart: i + 1,
        lineEnd: endIdx + 1,
        byteStart: byteOffset(lines, i),
        byteEnd: byteOffset(lines, endIdx + 1),
        tokenCount: estimateTokensFromText(lines.slice(i, endIdx + 1).join('\n')),
        signature: trimmed.slice(0, 100),
      }));
      i = endIdx;
      continue;
    }

    // type X interface
    const ifaceMatch = trimmed.match(/^type\s+(\w+)\s+interface/);
    if (ifaceMatch) {
      const endIdx = findBraceBlockEnd(lines, i);
      parent.children.push(makeChildNode(parent, {
        nodeType: 'INTERFACE',
        label: ifaceMatch[1],
        depth: baseDepth,
        lineStart: i + 1,
        lineEnd: endIdx + 1,
        byteStart: byteOffset(lines, i),
        byteEnd: byteOffset(lines, endIdx + 1),
        tokenCount: estimateTokensFromText(lines.slice(i, endIdx + 1).join('\n')),
        signature: trimmed.slice(0, 100),
      }));
      i = endIdx;
      continue;
    }

    // func
    const funcMatch = trimmed.match(/^func\s+(?:\([^)]+\)\s+)?(\w+)/);
    if (funcMatch) {
      const endIdx = findBraceBlockEnd(lines, i);
      parent.children.push(makeChildNode(parent, {
        nodeType: 'FUNCTION',
        label: funcMatch[1],
        depth: baseDepth,
        lineStart: i + 1,
        lineEnd: endIdx + 1,
        byteStart: byteOffset(lines, i),
        byteEnd: byteOffset(lines, endIdx + 1),
        tokenCount: estimateTokensFromText(lines.slice(i, endIdx + 1).join('\n')),
        signature: trimmed.slice(0, 120),
      }));
      i = endIdx;
      continue;
    }
  }
}

// ── Generic Parser (C, C++, Java, etc.) ──

function parseGenericFile(
  parent: IndexNode,
  lines: string[],
  _content: string,
): void {
  const baseDepth = parent.depth + 1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    // Generic function patterns
    const funcMatch = trimmed.match(
      /^(?:pub\s+)?(?:static\s+)?(?:async\s+)?(?:fn|func|def|function|sub|proc|void|int|string|bool|float|double|char|auto)\s+(\w+)\s*\(/,
    );
    if (funcMatch) {
      const endIdx = findBraceBlockEnd(lines, i);
      parent.children.push(makeChildNode(parent, {
        nodeType: 'FUNCTION',
        label: funcMatch[1],
        depth: baseDepth,
        lineStart: i + 1,
        lineEnd: endIdx + 1,
        byteStart: byteOffset(lines, i),
        byteEnd: byteOffset(lines, endIdx + 1),
        tokenCount: estimateTokensFromText(lines.slice(i, endIdx + 1).join('\n')),
        signature: trimmed.slice(0, 120),
      }));
      i = endIdx;
      continue;
    }

    // Generic class/struct
    const classMatch = trimmed.match(
      /^(?:public\s+)?(?:abstract\s+)?(?:class|struct)\s+(\w+)/,
    );
    if (classMatch) {
      const endIdx = findBraceBlockEnd(lines, i);
      parent.children.push(makeChildNode(parent, {
        nodeType: 'CLASS',
        label: classMatch[1],
        depth: baseDepth,
        lineStart: i + 1,
        lineEnd: endIdx + 1,
        byteStart: byteOffset(lines, i),
        byteEnd: byteOffset(lines, endIdx + 1),
        tokenCount: estimateTokensFromText(lines.slice(i, endIdx + 1).join('\n')),
        signature: trimmed.slice(0, 100),
      }));
      i = endIdx;
      continue;
    }
  }
}

// ── Shared Helpers ──

function makeChildNode(parent: IndexNode, attrs: {
  nodeType: NodeType;
  label: string;
  depth: number;
  lineStart: number;
  lineEnd: number;
  byteStart: number;
  byteEnd: number;
  tokenCount: number;
  signature?: string | null;
  docstring?: string | null;
}): IndexNode {
  return {
    id: uuid(),
    projectRoot: parent.projectRoot,
    parentId: parent.id,
    nodeType: attrs.nodeType,
    label: attrs.label,
    depth: attrs.depth,
    filePath: parent.filePath,
    lineStart: attrs.lineStart,
    lineEnd: attrs.lineEnd,
    byteStart: attrs.byteStart,
    byteEnd: attrs.byteEnd,
    tokenCount: attrs.tokenCount,
    signature: attrs.signature || null,
    docstring: attrs.docstring || null,
    collapsedSummary: null,
    language: parent.language,
    lastIndexed: Date.now(),
    children: [],
  };
}

function findImportBlock(
  lines: string[],
  lang: 'ts' | 'py',
): { start: number; end: number } {
  let start = -1;
  let end = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;

    const isImport = lang === 'ts'
      ? trimmed.startsWith('import ')
      : (trimmed.startsWith('import ') || trimmed.startsWith('from '));

    if (isImport) {
      if (start < 0) start = i;
      end = i;
    } else if (start >= 0) {
      // Stop after first non-import line (allow blank lines between imports)
      if (trimmed.length > 0) break;
    }
  }

  return { start, end };
}

function findConstantBlocks(
  lines: string[],
  _lang: string,
): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    // Top-level const/let/var that is a simple declaration (not a function)
    if (/^(?:export\s+)?(?:const|let|var)\s+\w+\s*[:=]/.test(trimmed) &&
        !trimmed.includes('=>') && !trimmed.includes('function')) {
      const end = findStatementEnd(lines, i);
      ranges.push({ start: i, end });
      i = end;
    }
  }

  return ranges;
}

function findBraceBlockEnd(lines: string[], startIdx: number): number {
  let braceCount = 0;
  let foundFirst = false;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    // Skip string contents to avoid counting braces in strings
    for (const ch of line) {
      if (ch === '{') { braceCount++; foundFirst = true; }
      if (ch === '}') braceCount--;
    }
    if (foundFirst && braceCount <= 0) return i;
  }

  return Math.min(startIdx + 50, lines.length - 1);
}

function findPyBlockEnd(lines: string[], startIdx: number): number {
  const indent = lines[startIdx].search(/\S/);
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const lineIndent = line.search(/\S/);
    if (lineIndent <= indent) return i;
  }
  return lines.length;
}

function findTypeEnd(lines: string[], startIdx: number): number {
  // Type aliases can span multiple lines (e.g. union types)
  for (let i = startIdx; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.endsWith(';') || (i > startIdx && !trimmed.startsWith('|') && !trimmed.startsWith('&'))) {
      return i;
    }
  }
  return startIdx;
}

function findStatementEnd(lines: string[], startIdx: number): number {
  for (let i = startIdx; i < Math.min(startIdx + 20, lines.length); i++) {
    if (lines[i].trim().endsWith(';')) return i;
  }
  return startIdx;
}

function byteOffset(lines: string[], lineIdx: number): number {
  let bytes = 0;
  for (let i = 0; i < Math.min(lineIdx, lines.length); i++) {
    bytes += Buffer.byteLength(lines[i], 'utf-8') + 1; // +1 for newline
  }
  return bytes;
}

function extractJSDoc(lines: string[], lineIdx: number): string | null {
  // Look backwards for /** ... */ block
  let end = lineIdx - 1;
  while (end >= 0 && lines[end].trim() === '') end--;
  if (end < 0 || !lines[end].trim().endsWith('*/')) return null;

  let start = end;
  while (start > 0 && !lines[start].trim().startsWith('/**')) start--;
  if (!lines[start].trim().startsWith('/**')) return null;

  return lines.slice(start, end + 1)
    .map(l => l.trim().replace(/^\/?\*+\/?/, '').trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 200);
}

function extractPyDocstring(lines: string[], lineIdx: number): string | null {
  // Look for triple-quote on the line after the def/class
  const nextLine = lines[lineIdx + 1]?.trim();
  if (!nextLine || (!nextLine.startsWith('"""') && !nextLine.startsWith("'''"))) return null;

  const quote = nextLine.startsWith('"""') ? '"""' : "'''";
  // Single-line docstring
  if (nextLine.endsWith(quote) && nextLine.length > 6) {
    return nextLine.slice(3, -3).trim().slice(0, 200);
  }

  // Multi-line
  const parts: string[] = [nextLine.slice(3)];
  for (let i = lineIdx + 2; i < Math.min(lineIdx + 20, lines.length); i++) {
    const t = lines[i].trim();
    if (t.includes(quote)) {
      parts.push(t.replace(quote, ''));
      break;
    }
    parts.push(t);
  }
  return parts.join(' ').trim().slice(0, 200) || null;
}
