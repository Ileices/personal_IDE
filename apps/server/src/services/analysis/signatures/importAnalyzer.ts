// ============================================
// Import Analyzer (Enhanced)
// Ported from auto_rebuilder.py: extract_imports / enhanced_import_analysis
// Categorizes imports into: stdlib, external, project,
// relative, dynamic, and risky (wildcard/re-export)
// ============================================

export type ImportCategory =
  | 'standard_lib'
  | 'external'
  | 'project'
  | 'relative'
  | 'dynamic'
  | 'risky';

export interface ImportInfo {
  module: string;
  names: string[];          // imported symbols (or ['*'] for wildcard)
  category: ImportCategory;
  line: number;
  isTypeOnly: boolean;
  isDynamic: boolean;
}

export interface ImportAnalysis {
  imports: ImportInfo[];
  byCategory: Record<ImportCategory, ImportInfo[]>;
  potentialConflicts: string[];  // symbols imported from >1 module
  totalCount: number;
}

// Known Node.js standard lib modules
const NODE_STDLIB = new Set([
  'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
  'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'http2',
  'https', 'inspector', 'module', 'net', 'os', 'path', 'perf_hooks',
  'process', 'punycode', 'querystring', 'readline', 'repl', 'stream',
  'string_decoder', 'sys', 'timers', 'tls', 'trace_events', 'tty',
  'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
  // node: prefixed
  'node:fs', 'node:path', 'node:url', 'node:crypto', 'node:http',
  'node:https', 'node:stream', 'node:buffer', 'node:os', 'node:util',
  'node:events', 'node:child_process', 'node:worker_threads', 'node:net',
  'node:tls', 'node:dns', 'node:readline', 'node:vm', 'node:zlib',
  'node:timers', 'node:assert', 'node:cluster', 'node:dgram',
  'node:inspector', 'node:perf_hooks', 'node:trace_events', 'node:tty',
  'node:string_decoder', 'node:querystring', 'node:punycode',
]);

// Dynamic import patterns
const DYNAMIC_IMPORT_PATTERNS = [
  /\bimport\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  /\brequire\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  /\brequire\.resolve\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
];

/**
 * Analyze all imports in a TypeScript/JavaScript source file.
 */
export function analyzeImports(source: string, filePath?: string): ImportAnalysis {
  const lines = source.split('\n');
  const imports: ImportInfo[] = [];
  const importedNames = new Map<string, string[]>(); // name → modules

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNum = i + 1;

    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

    // Static imports: import { X } from 'Y'  /  import X from 'Y'  /  import * as X from 'Y'
    const staticMatch = trimmed.match(
      /^import\s+(type\s+)?(?:\{([^}]*)\}|(\*\s+as\s+\w+)|(\w+))\s+from\s+['"`]([^'"`]+)['"`]/
    );
    if (staticMatch) {
      const isTypeOnly = !!staticMatch[1];
      const namedImports = staticMatch[2]
        ? staticMatch[2].split(',').map(n => n.trim().split(/\s+as\s+/).pop()!.trim()).filter(Boolean)
        : staticMatch[3]
          ? [staticMatch[3].replace(/\*\s+as\s+/, '').trim()]
          : staticMatch[4]
            ? [staticMatch[4]]
            : [];
      const module = staticMatch[5];
      const category = categorizeModule(module);

      imports.push({ module, names: namedImports, category, line: lineNum, isTypeOnly, isDynamic: false });

      for (const name of namedImports) {
        const existing = importedNames.get(name) || [];
        existing.push(module);
        importedNames.set(name, existing);
      }
      continue;
    }

    // Side-effect imports: import 'module'
    const sideEffectMatch = trimmed.match(/^import\s+['"`]([^'"`]+)['"`]/);
    if (sideEffectMatch) {
      const module = sideEffectMatch[1];
      imports.push({
        module, names: [], category: categorizeModule(module),
        line: lineNum, isTypeOnly: false, isDynamic: false,
      });
      continue;
    }

    // Re-exports: export { X } from 'Y'  or  export * from 'Y'
    const reExportMatch = trimmed.match(/^export\s+(?:\{([^}]*)\}|\*)\s+from\s+['"`]([^'"`]+)['"`]/);
    if (reExportMatch) {
      const names = reExportMatch[1]
        ? reExportMatch[1].split(',').map(n => n.trim().split(/\s+as\s+/).pop()!.trim()).filter(Boolean)
        : ['*'];
      const module = reExportMatch[2];
      const isRisky = names.includes('*');
      imports.push({
        module, names,
        category: isRisky ? 'risky' : categorizeModule(module),
        line: lineNum, isTypeOnly: false, isDynamic: false,
      });
      continue;
    }
  }

  // Scan for dynamic imports
  for (const pattern of DYNAMIC_IMPORT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(source)) !== null) {
      const module = match[1];
      // Find line number
      const beforeMatch = source.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      imports.push({
        module, names: ['<dynamic>'],
        category: 'dynamic',
        line, isTypeOnly: false, isDynamic: true,
      });
    }
  }

  // Build by-category map
  const byCategory: Record<ImportCategory, ImportInfo[]> = {
    standard_lib: [], external: [], project: [],
    relative: [], dynamic: [], risky: [],
  };
  for (const imp of imports) {
    byCategory[imp.category].push(imp);
  }

  // Detect conflicts (same name from different modules)
  const potentialConflicts: string[] = [];
  for (const [name, modules] of importedNames) {
    if (modules.length > 1) potentialConflicts.push(name);
  }

  return { imports, byCategory, potentialConflicts, totalCount: imports.length };
}

function categorizeModule(module: string): ImportCategory {
  if (module.startsWith('.')) return 'relative';
  if (NODE_STDLIB.has(module)) return 'standard_lib';
  if (module.startsWith('@personal-ide/') || module.startsWith('./') || module.startsWith('../')) return 'project';
  return 'external';
}
