// ============================================
// Code Relationship Index
// Multi-language symbol extraction, cross-file
// reference resolution, dependency graph,
// namespace conflict detection
// Ported from auto_rebuilder.py concepts
// ============================================
import { v4 as uuid } from 'uuid';
import { readFileSync, existsSync } from 'fs';
import { extname, relative, join, dirname, basename } from 'path';
import type Database from 'better-sqlite3';
import type {
  CodeSymbol, CodeRelationship, CodeConflict,
  RelationshipScanResult, SymbolKind, RelationshipType, ConflictType,
} from '@personal-ide/shared';
import { LANG_EXTENSIONS, EXT_TO_LANG } from '../../constants/codeConstants.js';
import { getSymbolPatterns } from './symbolPatterns.js';
import { extractImports, type ImportInfo } from './importExtractors.js';
import { estimatePurityScore, detectDomain } from './codeAnalysis.js';

// ── Main Service ──

export class RelationshipIndexService {
  constructor(private db: Database.Database) {}

  /** Full scan: extract all symbols and relationships from project files */
  scanProject(projectId: string, rootPath: string, files: string[]): RelationshipScanResult {
    const startTime = Date.now();
    const allSymbols: Map<string, CodeSymbol> = new Map();
    const fileSymbolMap: Map<string, CodeSymbol[]> = new Map();
    const fileImportMap: Map<string, ImportInfo[]> = new Map();
    const languages = new Set<string>();

    // Phase 1: Extract symbols from all files
    for (const filePath of files) {
      try {
        const ext = extname(filePath).toLowerCase();
        const language = EXT_TO_LANG[ext];
        if (!language) continue;
        languages.add(language);

        const fullPath = join(rootPath, filePath);
        if (!existsSync(fullPath)) continue;
        const content = readFileSync(fullPath, 'utf8');
        if (content.length > 1_000_000) continue; // skip files > 1MB

        const symbols = this.extractSymbolsFromFile(projectId, filePath, content, language);
        fileSymbolMap.set(filePath, symbols);
        for (const sym of symbols) {
          allSymbols.set(sym.id, sym);
        }

        const imports = extractImports(content, language);
        fileImportMap.set(filePath, imports);
      } catch { /* skip unreadable files */ }
    }

    // Phase 2: Store symbols in DB (batch insert)
    this.clearProjectIndex(projectId);
    const insertSymbol = this.db.prepare(`
      INSERT INTO code_symbols (id, project_id, file_path, name, kind, signature, line_start, line_end, scope, language, purity_score, domain, exported, doc_comment, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    const insertBatch = this.db.transaction((symbols: CodeSymbol[]) => {
      for (const s of symbols) {
        insertSymbol.run(s.id, s.projectId, s.filePath, s.name, s.kind, s.signature, s.lineStart, s.lineEnd, s.scope, s.language, s.purityScore, s.domain, s.exported ? 1 : 0, s.docComment);
      }
    });
    insertBatch([...allSymbols.values()]);

    // Phase 3: Build relationships from imports
    const relationships: CodeRelationship[] = [];
    const symbolByName = new Map<string, CodeSymbol[]>();
    for (const sym of allSymbols.values()) {
      const existing = symbolByName.get(sym.name) || [];
      existing.push(sym);
      symbolByName.set(sym.name, existing);
    }

    for (const [filePath, imports] of fileImportMap.entries()) {
      const fileSymbols = fileSymbolMap.get(filePath) || [];
      for (const imp of imports) {
        // Resolve the import target
        const targetFile = this.resolveImportPath(rootPath, filePath, imp.modulePath);
        if (!targetFile) continue;

        const targetSymbols = fileSymbolMap.get(targetFile) || [];
        for (const importedName of imp.importedNames) {
          if (importedName === '*') continue;
          const source = fileSymbols.find(s => s.kind === 'import' || s.name === importedName);
          const target = targetSymbols.find(s => s.name === importedName && s.exported);

          if (target) {
            // Create an "imports" relationship from the file's usage to the target definition
            for (const fileSym of fileSymbols) {
              relationships.push({
                id: uuid(), projectId, sourceSymbolId: fileSym.id, targetSymbolId: target.id,
                relationshipType: 'imports', confidence: 0.9, createdAt: new Date().toISOString(),
              });
              break; // one relationship per import, not per file symbol
            }
          }
        }
      }
    }

    // Phase 3b: Detect extends/implements relationships
    for (const [filePath, symbols] of fileSymbolMap.entries()) {
      try {
        const fullPath = join(rootPath, filePath);
        const content = readFileSync(fullPath, 'utf8');
        const ext = extname(filePath).toLowerCase();
        const language = EXT_TO_LANG[ext] || 'unknown';

        for (const sym of symbols) {
          if (sym.kind === 'class' || sym.kind === 'struct') {
            // Check for extends/implements
            const patterns: RegExp[] = [];
            if (['typescript', 'javascript'].includes(language)) {
              patterns.push(new RegExp(`class\\s+${sym.name}\\s+extends\\s+(\\w+)`, 'g'));
              patterns.push(new RegExp(`class\\s+${sym.name}[^{]*implements\\s+([\\w,\\s]+)`, 'g'));
            } else if (language === 'java' || language === 'csharp' || language === 'kotlin') {
              patterns.push(new RegExp(`class\\s+${sym.name}\\s+extends\\s+(\\w+)`, 'g'));
              patterns.push(new RegExp(`class\\s+${sym.name}[^{]*implements\\s+([\\w,\\s]+)`, 'g'));
            } else if (language === 'rust') {
              patterns.push(new RegExp(`impl\\s+(\\w+)\\s+for\\s+${sym.name}`, 'g'));
            } else if (language === 'python') {
              patterns.push(new RegExp(`class\\s+${sym.name}\\s*\\(([^)]+)\\)`, 'g'));
            }

            for (const pat of patterns) {
              let m;
              while ((m = pat.exec(content)) !== null) {
                const parentNames = m[1].split(',').map(s => s.trim()).filter(Boolean);
                for (const parentName of parentNames) {
                  const parentSymbols = symbolByName.get(parentName);
                  if (parentSymbols) {
                    for (const parent of parentSymbols) {
                      const relType: RelationshipType = m[0].includes('implements') || m[0].includes('impl') ? 'implements' : 'extends';
                      relationships.push({
                        id: uuid(), projectId, sourceSymbolId: sym.id, targetSymbolId: parent.id,
                        relationshipType: relType, confidence: 0.95, createdAt: new Date().toISOString(),
                      });
                    }
                  }
                }
              }
            }
          }
        }
      } catch { /* skip */ }
    }

    // Phase 4: Store relationships
    const insertRel = this.db.prepare(`
      INSERT INTO code_relationships (id, project_id, source_symbol_id, target_symbol_id, relationship_type, confidence, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    const insertRelBatch = this.db.transaction((rels: CodeRelationship[]) => {
      for (const r of rels) {
        insertRel.run(r.id, r.projectId, r.sourceSymbolId, r.targetSymbolId, r.relationshipType, r.confidence);
      }
    });
    insertRelBatch(relationships);

    // Phase 5: Detect conflicts
    const conflicts = this.detectConflicts(projectId, allSymbols, relationships);
    const insertConflict = this.db.prepare(`
      INSERT INTO code_conflicts (id, project_id, symbol_a_id, symbol_b_id, conflict_type, severity, resolution_strategy, resolved, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
    `);
    const insertConflictBatch = this.db.transaction((confs: CodeConflict[]) => {
      for (const c of confs) {
        insertConflict.run(c.id, c.projectId, c.symbolAId, c.symbolBId, c.conflictType, c.severity, c.resolutionStrategy);
      }
    });
    insertConflictBatch(conflicts);

    // Phase 6: Find hot paths (most connected symbols)
    const connectionCount = new Map<string, number>();
    for (const rel of relationships) {
      connectionCount.set(rel.sourceSymbolId, (connectionCount.get(rel.sourceSymbolId) || 0) + 1);
      connectionCount.set(rel.targetSymbolId, (connectionCount.get(rel.targetSymbolId) || 0) + 1);
    }
    const hotPaths = [...connectionCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([id]) => allSymbols.get(id)?.name || id);

    // Phase 7: Find orphaned symbols
    const referencedIds = new Set<string>();
    for (const rel of relationships) {
      referencedIds.add(rel.sourceSymbolId);
      referencedIds.add(rel.targetSymbolId);
    }
    const orphanedSymbols = [...allSymbols.values()]
      .filter(s => !referencedIds.has(s.id) && s.exported)
      .slice(0, 50)
      .map(s => `${s.name} (${s.filePath})`);

    // Phase 8: Detect circular dependencies
    const circularDeps = this.detectCircularDeps(relationships, allSymbols);

    return {
      symbolCount: allSymbols.size,
      relationshipCount: relationships.length,
      conflictCount: conflicts.length,
      fileCount: fileSymbolMap.size,
      languages: [...languages],
      hotPaths,
      orphanedSymbols,
      circularDeps,
      scanDurationMs: Date.now() - startTime,
    };
  }

  /** Extract symbols from a single file */
  private extractSymbolsFromFile(projectId: string, filePath: string, content: string, language: string): CodeSymbol[] {
    const symbols: CodeSymbol[] = [];
    const patterns = getSymbolPatterns(language);
    const lines = content.split('\n');

    for (const pattern of patterns) {
      // Reset regex state
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(content)) !== null) {
        const name = match[pattern.nameGroup];
        if (!name || name.length < 2) continue;
        // Skip common noise words
        if (['if', 'for', 'while', 'switch', 'return', 'new', 'var', 'let', 'const', 'true', 'false', 'null', 'undefined', 'this', 'self'].includes(name)) continue;

        const lineNum = content.substring(0, match.index).split('\n').length;
        const matchLine = lines[lineNum - 1] || '';
        const isExported = pattern.exported ? pattern.exported(match, matchLine) : false;
        const signature = pattern.signatureCapture ? match[0].trim() : '';

        symbols.push({
          id: uuid(),
          projectId,
          filePath,
          name,
          kind: pattern.kind,
          signature,
          lineStart: lineNum,
          lineEnd: lineNum, // approximate; multi-line detection is costly
          scope: isExported ? 'module' : 'local',
          language,
          purityScore: pattern.kind === 'function' || pattern.kind === 'method'
            ? estimatePurityScore(content, name, language) : 0.5,
          domain: detectDomain(filePath, name),
          exported: isExported,
          docComment: this.extractDocComment(lines, lineNum - 1),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    return symbols;
  }

  /** Extract doc comment above a symbol */
  private extractDocComment(lines: string[], symbolLine: number): string {
    const comments: string[] = [];
    for (let i = symbolLine - 1; i >= 0 && i >= symbolLine - 10; i--) {
      const line = lines[i]?.trim() || '';
      if (line.startsWith('//') || line.startsWith('*') || line.startsWith('#') || line.startsWith('///') || line.startsWith('/**')) {
        comments.unshift(line.replace(/^\/\/\s*|^\*\s*|^#\s*|^\/\*\*?\s*|\*\/\s*$/g, '').trim());
      } else if (line === '' && comments.length === 0) {
        continue;
      } else {
        break;
      }
    }
    return comments.join(' ').slice(0, 500);
  }

  /** Resolve an import path to a relative file path */
  private resolveImportPath(rootPath: string, currentFile: string, importPath: string): string | null {
    // Skip node_modules/external packages
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
      return null; // external package
    }

    const currentDir = dirname(currentFile);
    const resolved = join(currentDir, importPath).replace(/\\/g, '/');

    // Try various extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.cs', ''];
    const indexFiles = ['index.ts', 'index.tsx', 'index.js', 'mod.rs', '__init__.py'];

    for (const ext of extensions) {
      const candidate = resolved + ext;
      if (existsSync(join(rootPath, candidate))) return candidate;
    }

    // Try as directory with index
    for (const idx of indexFiles) {
      const candidate = join(resolved, idx).replace(/\\/g, '/');
      if (existsSync(join(rootPath, candidate))) return candidate;
    }

    return null;
  }

  /** Detect naming conflicts, duplicate exports, etc. */
  private detectConflicts(projectId: string, allSymbols: Map<string, CodeSymbol>, relationships: CodeRelationship[]): CodeConflict[] {
    const conflicts: CodeConflict[] = [];
    const exportedByName = new Map<string, CodeSymbol[]>();

    // Group exported symbols by name
    for (const sym of allSymbols.values()) {
      if (!sym.exported) continue;
      const existing = exportedByName.get(sym.name) || [];
      existing.push(sym);
      exportedByName.set(sym.name, existing);
    }

    // Name collisions: same name exported from multiple files
    for (const [name, symbols] of exportedByName.entries()) {
      if (symbols.length <= 1) continue;

      for (let i = 0; i < symbols.length; i++) {
        for (let j = i + 1; j < symbols.length; j++) {
          const a = symbols[i];
          const b = symbols[j];
          if (a.filePath === b.filePath) continue;

          // Same kind = higher severity
          const severity = a.kind === b.kind ? 'warning' : 'info';
          const resolution = a.kind === b.kind
            ? `Rename one of: ${a.filePath}:${a.lineStart} or ${b.filePath}:${b.lineStart}`
            : `Different kinds (${a.kind} vs ${b.kind}) — may not conflict in practice`;

          conflicts.push({
            id: uuid(), projectId, symbolAId: a.id, symbolBId: b.id,
            conflictType: 'name_collision', severity,
            resolutionStrategy: resolution, resolved: false,
            createdAt: new Date().toISOString(),
          });
        }
      }
    }

    return conflicts;
  }

  /** Detect circular dependencies in the relationship graph */
  private detectCircularDeps(relationships: CodeRelationship[], allSymbols: Map<string, CodeSymbol>): string[][] {
    // Build adjacency by file, not by symbol (file-level circular deps)
    const fileGraph = new Map<string, Set<string>>();
    for (const rel of relationships) {
      if (rel.relationshipType !== 'imports') continue;
      const source = allSymbols.get(rel.sourceSymbolId);
      const target = allSymbols.get(rel.targetSymbolId);
      if (!source || !target || source.filePath === target.filePath) continue;

      if (!fileGraph.has(source.filePath)) fileGraph.set(source.filePath, new Set());
      fileGraph.get(source.filePath)!.add(target.filePath);
    }

    const cycles: string[][] = [];
    const visited = new Set<string>();
    const stack = new Set<string>();

    function dfs(node: string, path: string[]): void {
      if (stack.has(node)) {
        const cycleStart = path.indexOf(node);
        if (cycleStart >= 0 && cycles.length < 10) {
          cycles.push(path.slice(cycleStart));
        }
        return;
      }
      if (visited.has(node)) return;

      visited.add(node);
      stack.add(node);
      path.push(node);

      for (const neighbor of fileGraph.get(node) || []) {
        dfs(neighbor, [...path]);
      }

      stack.delete(node);
    }

    for (const file of fileGraph.keys()) {
      dfs(file, []);
    }

    return cycles;
  }

  /** Clear all index data for a project */
  clearProjectIndex(projectId: string): void {
    this.db.prepare('DELETE FROM code_conflicts WHERE project_id = ?').run(projectId);
    this.db.prepare('DELETE FROM code_relationships WHERE project_id = ?').run(projectId);
    this.db.prepare('DELETE FROM code_symbols WHERE project_id = ?').run(projectId);
  }

  /** Get all symbols for a file */
  getFileSymbols(projectId: string, filePath: string): CodeSymbol[] {
    const rows = this.db.prepare('SELECT * FROM code_symbols WHERE project_id = ? AND file_path = ?').all(projectId, filePath) as any[];
    return rows.map(mapSymbolRow);
  }

  /** Get all symbols for a project */
  getProjectSymbols(projectId: string): CodeSymbol[] {
    const rows = this.db.prepare('SELECT * FROM code_symbols WHERE project_id = ?').all(projectId) as any[];
    return rows.map(mapSymbolRow);
  }

  /** Get relationships for a symbol */
  getSymbolRelationships(symbolId: string): CodeRelationship[] {
    const rows = this.db.prepare(
      'SELECT * FROM code_relationships WHERE source_symbol_id = ? OR target_symbol_id = ?'
    ).all(symbolId, symbolId) as any[];
    return rows.map(mapRelationshipRow);
  }

  /** Get all conflicts for a project */
  getProjectConflicts(projectId: string): CodeConflict[] {
    const rows = this.db.prepare('SELECT * FROM code_conflicts WHERE project_id = ? AND resolved = 0').all(projectId) as any[];
    return rows.map(mapConflictRow);
  }

  /** Get symbol count by kind for a project */
  getSymbolStats(projectId: string): Record<string, number> {
    const rows = this.db.prepare('SELECT kind, COUNT(*) as count FROM code_symbols WHERE project_id = ? GROUP BY kind').all(projectId) as any[];
    const stats: Record<string, number> = {};
    for (const row of rows) stats[row.kind] = row.count;
    return stats;
  }

  /** Format relationship index for LLM context */
  formatForLLM(projectId: string, maxTokens: number): string {
    const stats = this.getSymbolStats(projectId);
    const conflicts = this.getProjectConflicts(projectId);
    const totalSymbols = Object.values(stats).reduce((a, b) => a + b, 0);
    const relCount = (this.db.prepare('SELECT COUNT(*) as c FROM code_relationships WHERE project_id = ?').get(projectId) as any)?.c || 0;

    const lines: string[] = [
      '## CODE KNOWLEDGE GRAPH',
      `Total symbols: ${totalSymbols} | Relationships: ${relCount} | Conflicts: ${conflicts.length}`,
      '',
      '### Symbol Distribution:',
      ...Object.entries(stats).sort((a, b) => b[1] - a[1]).map(([kind, count]) => `  - ${kind}: ${count}`),
    ];

    if (conflicts.length > 0) {
      lines.push('', '### ⚠️ Active Conflicts:');
      for (const c of conflicts.slice(0, 10)) {
        const symA = this.db.prepare('SELECT name, file_path FROM code_symbols WHERE id = ?').get(c.symbolAId) as any;
        const symB = this.db.prepare('SELECT name, file_path FROM code_symbols WHERE id = ?').get(c.symbolBId) as any;
        if (symA && symB) {
          lines.push(`  - ${c.conflictType}: ${symA.name} (${symA.file_path}) ↔ ${symB.name} (${symB.file_path})`);
        }
      }
    }

    // Hot symbols (most referenced)
    const hotSymbols = this.db.prepare(`
      SELECT cs.name, cs.file_path, cs.kind, COUNT(cr.id) as refs
      FROM code_symbols cs
      LEFT JOIN code_relationships cr ON cs.id = cr.target_symbol_id
      WHERE cs.project_id = ?
      GROUP BY cs.id
      ORDER BY refs DESC
      LIMIT 15
    `).all(projectId) as any[];

    if (hotSymbols.length > 0) {
      lines.push('', '### 🔥 Most Referenced Symbols:');
      for (const s of hotSymbols) {
        if (s.refs > 0) lines.push(`  - ${s.name} (${s.kind}, ${s.file_path}) — ${s.refs} references`);
      }
    }

    const result = lines.join('\n');
    return result.slice(0, maxTokens * 4); // rough char-to-token conversion
  }
}

// ── Row Mappers ──

function mapSymbolRow(row: any): CodeSymbol {
  return {
    id: row.id,
    projectId: row.project_id,
    filePath: row.file_path,
    name: row.name,
    kind: row.kind,
    signature: row.signature,
    lineStart: row.line_start,
    lineEnd: row.line_end,
    scope: row.scope,
    language: row.language,
    purityScore: row.purity_score,
    domain: row.domain,
    exported: !!row.exported,
    docComment: row.doc_comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRelationshipRow(row: any): CodeRelationship {
  return {
    id: row.id,
    projectId: row.project_id,
    sourceSymbolId: row.source_symbol_id,
    targetSymbolId: row.target_symbol_id,
    relationshipType: row.relationship_type,
    confidence: row.confidence,
    createdAt: row.created_at,
  };
}

function mapConflictRow(row: any): CodeConflict {
  return {
    id: row.id,
    projectId: row.project_id,
    symbolAId: row.symbol_a_id,
    symbolBId: row.symbol_b_id,
    conflictType: row.conflict_type,
    severity: row.severity,
    resolutionStrategy: row.resolution_strategy,
    resolved: !!row.resolved,
    createdAt: row.created_at,
  };
}
