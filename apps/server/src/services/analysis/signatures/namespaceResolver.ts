// ============================================
// Namespace Conflict Resolver
// Ported from auto_rebuilder.py: resolve_namespace_conflicts
// Detects symbol name collisions across files and
// applies resolution strategies: rename, prefix, or wrap
// ============================================

export interface SymbolInfo {
  name: string;
  file: string;
  type: 'function' | 'class' | 'variable' | 'type' | 'interface';
  isExported: boolean;
  lineNumber: number;
}

export interface ConflictGroup {
  symbolName: string;
  definitions: SymbolInfo[];
  strategy: 'rename' | 'prefix' | 'namespace_wrap';
  resolved: boolean;
}

export interface ResolutionResult {
  conflicts: ConflictGroup[];
  totalConflicts: number;
  resolvedCount: number;
  edits: SymbolEdit[];
}

export interface SymbolEdit {
  file: string;
  oldName: string;
  newName: string;
  line: number;
  reason: string;
}

/**
 * Scan multiple files for exported symbol collisions.
 * Returns conflict groups with resolution strategies.
 */
export function detectConflicts(
  fileSymbols: Map<string, SymbolInfo[]>,
): ConflictGroup[] {
  // Build symbol → definitions map
  const symbolDefs = new Map<string, SymbolInfo[]>();

  for (const [_file, symbols] of fileSymbols) {
    for (const sym of symbols) {
      if (!sym.isExported) continue;
      const existing = symbolDefs.get(sym.name) || [];
      existing.push(sym);
      symbolDefs.set(sym.name, existing);
    }
  }

  // Filter to only conflicts (>1 definition)
  const conflicts: ConflictGroup[] = [];
  for (const [name, defs] of symbolDefs) {
    if (defs.length <= 1) continue;

    // Choose strategy based on cluster cohesion
    const strategy = chooseStrategy(defs);
    conflicts.push({
      symbolName: name,
      definitions: defs,
      strategy,
      resolved: false,
    });
  }

  return conflicts;
}

/**
 * Generate rename edits to resolve all conflicts.
 */
export function resolveConflicts(conflicts: ConflictGroup[]): ResolutionResult {
  const edits: SymbolEdit[] = [];
  let resolvedCount = 0;

  for (const group of conflicts) {
    const generated = applyStrategy(group);
    edits.push(...generated);
    if (generated.length > 0) {
      group.resolved = true;
      resolvedCount++;
    }
  }

  return {
    conflicts,
    totalConflicts: conflicts.length,
    resolvedCount,
    edits,
  };
}

// ── Strategy Selection ──

function chooseStrategy(defs: SymbolInfo[]): 'rename' | 'prefix' | 'namespace_wrap' {
  // If few definitions and all are similar type → simple rename
  if (defs.length <= 3 && new Set(defs.map(d => d.type)).size === 1) {
    return 'rename';
  }
  // If moderate count → prefix with file module name
  if (defs.length <= 8) {
    return 'prefix';
  }
  // Many collisions → wrap in namespace
  return 'namespace_wrap';
}

// ── Strategy Application ──

function applyStrategy(group: ConflictGroup): SymbolEdit[] {
  const edits: SymbolEdit[] = [];

  switch (group.strategy) {
    case 'rename': {
      // Rename all but the first definition
      for (let i = 1; i < group.definitions.length; i++) {
        const def = group.definitions[i];
        const moduleSlug = fileToModuleSlug(def.file);
        const newName = `${group.symbolName}_${moduleSlug}`;
        edits.push({
          file: def.file,
          oldName: def.name,
          newName,
          line: def.lineNumber,
          reason: `Rename to avoid collision with ${group.definitions[0].file}`,
        });
      }
      break;
    }
    case 'prefix': {
      // Prefix ALL definitions with module name
      for (const def of group.definitions) {
        const moduleSlug = fileToModuleSlug(def.file);
        const newName = `${moduleSlug}_${group.symbolName}`;
        edits.push({
          file: def.file,
          oldName: def.name,
          newName,
          line: def.lineNumber,
          reason: `Prefix with module name to avoid ${group.definitions.length}-way collision`,
        });
      }
      break;
    }
    case 'namespace_wrap': {
      // Flag for manual wrapping (too complex for automated rename)
      for (const def of group.definitions) {
        const moduleSlug = fileToModuleSlug(def.file);
        edits.push({
          file: def.file,
          oldName: def.name,
          newName: `${capitalize(moduleSlug)}Namespace.${def.name}`,
          line: def.lineNumber,
          reason: `Wrap in namespace class to isolate ${group.definitions.length}-way collision`,
        });
      }
      break;
    }
  }

  return edits;
}

// ── Helpers ──

/** Convert a file path to a short module slug: 'src/services/auth.ts' → 'auth' */
function fileToModuleSlug(filePath: string): string {
  const base = filePath.split(/[/\\]/).pop() || filePath;
  return base.replace(/\.\w+$/, '').replace(/[^a-zA-Z0-9]/g, '_');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
