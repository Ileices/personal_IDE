// ============================================
// Code Indexer - Auto-indexes code structure
// so LLM can read/edit sections without loading
// full files, preventing truncation issues
// ============================================
import * as fs from 'fs';
import * as path from 'path';
import {
  EXT_TO_LANG as LANGUAGE_MAP,
  IGNORED_DIRS as IGNORE_DIRS,
  IGNORE_EXTENSIONS,
} from '../../constants/codeConstants.js';

export interface CodeSymbol {
  name: string;
  type: 'class' | 'function' | 'method' | 'interface' | 'import' | 'variable' | 'export' | 'type' | 'enum' | 'block';
  startLine: number;
  endLine: number;
  lineCount: number;
  estimatedBytes: number;
  /** Approximate token count (bytes / 3.5 heuristic) */
  estimatedTokens: number;
  children?: CodeSymbol[];
  signature?: string;
}

export interface FileIndex {
  filePath: string;
  relativePath: string;
  language: string;
  totalLines: number;
  totalBytes: number;
  /** Approximate total token count for the file */
  totalTokens: number;
  symbols: CodeSymbol[];
  imports: string[];
  exports: string[];
}

export interface ProjectIndex {
  projectRoot: string;
  files: FileIndex[];
  totalFiles: number;
  indexedAt: string;
}

export class CodeIndexer {
  private index: ProjectIndex | null = null;

  /** Get the current index (null if not yet built) */
  getIndex(): ProjectIndex | null {
    return this.index;
  }

  /** Build a full project index */
  buildIndex(projectRoot: string): ProjectIndex {
    const files: FileIndex[] = [];
    this.walkDir(projectRoot, projectRoot, files);

    this.index = {
      projectRoot,
      files,
      totalFiles: files.length,
      indexedAt: new Date().toISOString(),
    };

    return this.index;
  }

  /** Get a collapsed view of a file - just symbol names and line ranges */
  getFileOutline(filePath: string): string {
    const fileIndex = this.index?.files.find(f => f.filePath === filePath || f.relativePath === filePath);
    if (!fileIndex) return `File not indexed: ${filePath}`;

    let output = `=== ${fileIndex.relativePath} (${fileIndex.language}, ${fileIndex.totalLines} lines, ${formatBytes(fileIndex.totalBytes)}, ~${fileIndex.totalTokens} tokens) ===\n`;

    if (fileIndex.imports.length > 0) {
      output += `\nIMPORTS (${fileIndex.imports.length}):\n`;
      for (const imp of fileIndex.imports) {
        output += `  ${imp}\n`;
      }
    }

    if (fileIndex.symbols.length > 0) {
      output += `\nSYMBOLS:\n`;
      for (const sym of fileIndex.symbols) {
        const sizeTag = sym.lineCount > 50 ? ' ⚠️LARGE' : '';
        output += `  [${sym.type}] ${sym.name} (L${sym.startLine}-L${sym.endLine}, ${sym.lineCount} lines, ~${sym.estimatedTokens} tok${sizeTag})`;
        if (sym.signature) output += ` — ${sym.signature}`;
        output += '\n';

        if (sym.children) {
          for (const child of sym.children) {
            output += `    [${child.type}] ${child.name} (L${child.startLine}-L${child.endLine}, ${child.lineCount} lines, ~${child.estimatedTokens} tok)\n`;
          }
        }
      }
    }

    if (fileIndex.exports.length > 0) {
      output += `\nEXPORTS: ${fileIndex.exports.join(', ')}\n`;
    }

    return output;
  }

  /** Get a section of a file by line range */
  readSection(filePath: string, startLine: number, endLine: number): string {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const start = Math.max(0, startLine - 1);
      const end = Math.min(lines.length, endLine);
      return lines.slice(start, end).join('\n');
    } catch {
      return `Error reading ${filePath}`;
    }
  }

  /** Read a specific symbol from a file */
  readSymbol(filePath: string, symbolName: string): string {
    const fileIndex = this.index?.files.find(f => f.filePath === filePath || f.relativePath === filePath);
    if (!fileIndex) return `File not indexed: ${filePath}`;

    const sym = this.findSymbol(fileIndex.symbols, symbolName);
    if (!sym) return `Symbol '${symbolName}' not found in ${filePath}`;

    return this.readSection(fileIndex.filePath, sym.startLine, sym.endLine);
  }

  /** Get the full project outline (collapsed view of all files) */
  getProjectOutline(maxFiles = 100): string {
    if (!this.index) return 'No project indexed yet. Call buildIndex() first.';

    const totalProjectTokens = this.index.files.reduce((sum, f) => sum + f.totalTokens, 0);
    let output = `=== PROJECT INDEX (${this.index.totalFiles} files, ~${totalProjectTokens} total tokens, indexed ${this.index.indexedAt}) ===\n\n`;

    const sorted = [...this.index.files].sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    for (const file of sorted.slice(0, maxFiles)) {
      const symbolCount = this.countSymbols(file.symbols);
      output += `📄 ${file.relativePath} [${file.language}] — ${file.totalLines} lines, ~${file.totalTokens} tok, ${symbolCount} symbols\n`;

      for (const sym of file.symbols) {
        const sizeTag = sym.lineCount > 100 ? ' ⚠️' : '';
        output += `   ${sym.type}: ${sym.name} (L${sym.startLine}-L${sym.endLine}, ~${sym.estimatedTokens} tok)${sizeTag}\n`;
      }
    }

    if (this.index.files.length > maxFiles) {
      output += `\n... and ${this.index.files.length - maxFiles} more files\n`;
    }

    return output;
  }

  /** Format index for LLM consumption within a token budget */
  formatForLLM(budget: number): string {
    const outline = this.getProjectOutline();
    if (outline.length <= budget * 4) return outline; // rough chars-to-tokens

    // Truncated version — show file-level summary with token counts
    const files = this.index?.files || [];
    const totalTokens = files.reduce((sum, f) => sum + f.totalTokens, 0);
    let output = `PROJECT: ${files.length} files, ~${totalTokens} total tokens\n\n`;

    for (const file of files) {
      const line = `${file.relativePath} [${file.language}] ${file.totalLines}L ${file.symbols.length} symbols\n`;
      if (output.length + line.length > budget * 3) break;
      output += line;
    }

    return output;
  }

  // ── Private methods ──

  private walkDir(dir: string, root: string, results: FileIndex[]): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env') continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) {
          this.walkDir(fullPath, root, results);
        }
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (IGNORE_EXTENSIONS.has(ext)) continue;

      const language = LANGUAGE_MAP[ext];
      if (!language) continue;

      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');
        const relativePath = path.relative(root, fullPath).replace(/\\/g, '/');

        const totalBytes = Buffer.byteLength(content);
        const symbols = this.parseSymbols(content, language);
        // Add token estimates to every symbol
        for (const sym of symbols) {
          sym.estimatedTokens = Math.ceil(sym.estimatedBytes / 3.5);
          if (sym.children) {
            for (const child of sym.children) {
              child.estimatedTokens = Math.ceil(child.estimatedBytes / 3.5);
            }
          }
        }

        const fileIndex: FileIndex = {
          filePath: fullPath,
          relativePath,
          language,
          totalLines: lines.length,
          totalBytes: totalBytes,
          totalTokens: Math.ceil(totalBytes / 3.5),
          symbols,
          imports: this.parseImports(content, language),
          exports: this.parseExports(content, language),
        };

        results.push(fileIndex);
      } catch { /* skip unreadable files */ }
    }
  }

  private parseSymbols(content: string, language: string): CodeSymbol[] {
    const lines = content.split('\n');
    const symbols: CodeSymbol[] = [];

    if (['typescript', 'javascript'].includes(language)) {
      this.parseTSSymbols(lines, symbols);
    } else if (language === 'python') {
      this.parsePySymbols(lines, symbols);
    } else {
      this.parseGenericSymbols(lines, symbols);
    }

    return symbols;
  }

  private parseTSSymbols(lines: string[], symbols: CodeSymbol[]): void {
    const braceStack: number[] = [];
    let currentSymbol: CodeSymbol | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const lineNum = i + 1;

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      // Class/interface/enum/type
      const classMatch = trimmed.match(/^(?:export\s+)?(?:abstract\s+)?(?:class|interface|enum|type)\s+(\w+)/);
      if (classMatch) {
        currentSymbol = {
          name: classMatch[1],
          type: trimmed.includes('class') ? 'class' :
                trimmed.includes('interface') ? 'interface' :
                trimmed.includes('enum') ? 'enum' : 'type',
          startLine: lineNum,
          endLine: lineNum,
          lineCount: 1,
          estimatedBytes: 0,
          estimatedTokens: 0,
          signature: trimmed.slice(0, 80),
          children: [],
        };
      }

      // Function/method
      const funcMatch = trimmed.match(
        /^(?:export\s+)?(?:async\s+)?(?:function\s+)(\w+)\s*\(/
      );
      const arrowMatch = trimmed.match(
        /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/
      );
      const methodMatch = trimmed.match(
        /^(?:public|private|protected|static|async|get|set|\s)*\s*(\w+)\s*\([^)]*\)\s*(?::\s*\S+)?\s*\{/
      );

      if (funcMatch && !currentSymbol) {
        const sym: CodeSymbol = {
          name: funcMatch[1],
          type: 'function',
          startLine: lineNum,
          endLine: lineNum,
          lineCount: 1,
          estimatedBytes: 0,
          estimatedTokens: 0,
          signature: trimmed.slice(0, 100),
        };
        symbols.push(sym);
        // Find end of function
        sym.endLine = this.findBlockEnd(lines, i);
        sym.lineCount = sym.endLine - sym.startLine + 1;
        sym.estimatedBytes = lines.slice(i, sym.endLine).join('\n').length;
        sym.estimatedTokens = Math.ceil(sym.estimatedBytes / 3.5);
      } else if (arrowMatch && !currentSymbol) {
        const sym: CodeSymbol = {
          name: arrowMatch[1],
          type: 'function',
          startLine: lineNum,
          endLine: lineNum,
          lineCount: 1,
          estimatedBytes: 0,
          estimatedTokens: 0,
          signature: trimmed.slice(0, 100),
        };
        symbols.push(sym);
        sym.endLine = this.findBlockEnd(lines, i);
        sym.lineCount = sym.endLine - sym.startLine + 1;
        sym.estimatedBytes = lines.slice(i, sym.endLine).join('\n').length;
        sym.estimatedTokens = Math.ceil(sym.estimatedBytes / 3.5);
      } else if (methodMatch && currentSymbol && currentSymbol.children) {
        const method: CodeSymbol = {
          name: methodMatch[1],
          type: 'method',
          startLine: lineNum,
          endLine: lineNum,
          lineCount: 1,
          estimatedBytes: 0,
          estimatedTokens: 0,
        };
        method.endLine = this.findBlockEnd(lines, i);
        method.lineCount = method.endLine - method.startLine + 1;
        method.estimatedBytes = lines.slice(i, method.endLine).join('\n').length;
        method.estimatedTokens = Math.ceil(method.estimatedBytes / 3.5);
        currentSymbol.children.push(method);
      }

      // Track class boundaries
      if (currentSymbol && !symbols.includes(currentSymbol)) {
        if (trimmed.includes('{')) {
          if (braceStack.length === 0) {
            symbols.push(currentSymbol);
          }
          braceStack.push(lineNum);
        }
        if (trimmed.includes('}')) {
          braceStack.pop();
          if (braceStack.length === 0 && currentSymbol) {
            currentSymbol.endLine = lineNum;
            currentSymbol.lineCount = currentSymbol.endLine - currentSymbol.startLine + 1;
            currentSymbol.estimatedBytes = lines.slice(currentSymbol.startLine - 1, currentSymbol.endLine).join('\n').length;
            currentSymbol.estimatedTokens = Math.ceil(currentSymbol.estimatedBytes / 3.5);
            currentSymbol = null;
          }
        }
      }
    }
  }

  private parsePySymbols(lines: string[], symbols: CodeSymbol[]): void {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const lineNum = i + 1;

      const classMatch = trimmed.match(/^class\s+(\w+)/);
      const funcMatch = trimmed.match(/^(?:async\s+)?def\s+(\w+)/);

      if (classMatch) {
        const endLine = this.findPyBlockEnd(lines, i);
        const eBytes = lines.slice(i, endLine).join('\n').length;
        symbols.push({
          name: classMatch[1],
          type: 'class',
          startLine: lineNum,
          endLine,
          lineCount: endLine - lineNum + 1,
          estimatedBytes: eBytes,
          estimatedTokens: Math.ceil(eBytes / 3.5),
          signature: trimmed.slice(0, 80),
        });
      } else if (funcMatch && !line.startsWith(' ') && !line.startsWith('\t')) {
        const endLine = this.findPyBlockEnd(lines, i);
        const eBytes = lines.slice(i, endLine).join('\n').length;
        symbols.push({
          name: funcMatch[1],
          type: 'function',
          startLine: lineNum,
          endLine,
          lineCount: endLine - lineNum + 1,
          estimatedBytes: eBytes,
          estimatedTokens: Math.ceil(eBytes / 3.5),
          signature: trimmed.slice(0, 80),
        });
      }
    }
  }

  private parseGenericSymbols(lines: string[], symbols: CodeSymbol[]): void {
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const lineNum = i + 1;

      const funcMatch = trimmed.match(/^(?:pub\s+)?(?:async\s+)?(?:fn|func|def|function|sub|proc)\s+(\w+)/);
      if (funcMatch) {
        const endLine = this.findBlockEnd(lines, i);
        const eBytes = lines.slice(i, endLine).join('\n').length;
        symbols.push({
          name: funcMatch[1],
          type: 'function',
          startLine: lineNum,
          endLine,
          lineCount: endLine - lineNum + 1,
          estimatedBytes: eBytes,
          estimatedTokens: Math.ceil(eBytes / 3.5),
        });
      }
    }
  }

  private parseImports(content: string, language: string): string[] {
    const imports: string[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      if (['typescript', 'javascript'].includes(language)) {
        if (trimmed.startsWith('import ')) {
          imports.push(trimmed.slice(0, 120));
        }
      } else if (language === 'python') {
        if (trimmed.startsWith('import ') || trimmed.startsWith('from ')) {
          imports.push(trimmed.slice(0, 120));
        }
      }
    }

    return imports;
  }

  private parseExports(content: string, language: string): string[] {
    const exports: string[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      if (['typescript', 'javascript'].includes(language)) {
        const expMatch = trimmed.match(/^export\s+(?:default\s+)?(?:class|function|interface|type|enum|const|let|var|async)\s+(\w+)/);
        if (expMatch) {
          exports.push(expMatch[1]);
        }
      }
    }

    return exports;
  }

  private findBlockEnd(lines: string[], startIdx: number): number {
    let braceCount = 0;
    let foundFirst = false;

    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i];
      for (const ch of line) {
        if (ch === '{') { braceCount++; foundFirst = true; }
        if (ch === '}') braceCount--;
      }
      if (foundFirst && braceCount <= 0) return i + 1;
    }

    return Math.min(startIdx + 50, lines.length);
  }

  private findPyBlockEnd(lines: string[], startIdx: number): number {
    const indent = lines[startIdx].search(/\S/);
    for (let i = startIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '') continue;
      const lineIndent = line.search(/\S/);
      if (lineIndent <= indent) return i;
    }
    return lines.length;
  }

  private findSymbol(symbols: CodeSymbol[], name: string): CodeSymbol | null {
    for (const sym of symbols) {
      if (sym.name === name) return sym;
      if (sym.children) {
        const child = this.findSymbol(sym.children, name);
        if (child) return child;
      }
    }
    return null;
  }

  private countSymbols(symbols: CodeSymbol[]): number {
    let count = symbols.length;
    for (const sym of symbols) {
      if (sym.children) count += sym.children.length;
    }
    return count;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}
