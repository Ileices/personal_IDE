// ============================================
// Error Pattern Matcher — normalizes and clusters
// integration errors for root-cause analysis.
// Ported from auto_rebuilder.py
// parse_integration_errors() + match_error_patterns()
// + suggest_integration_fixes()
// ============================================

export interface NormalizedError {
  raw: string;
  type: string;         // e.g. 'ImportError', 'TypeError', 'SyntaxError'
  signature: string;    // canonical deduplication key
  module?: string;
  line?: number;
  suggestion: string;
}

export interface ErrorCluster {
  type: string;
  count: number;
  affectedFiles: string[];
  signature: string;
  suggestion: string;
}

const ERROR_PATTERNS: { regex: RegExp; type: string }[] = [
  { regex: /ModuleNotFoundError:\s*No module named '([^']+)'/i, type: 'ModuleNotFoundError' },
  { regex: /ImportError:\s*cannot import name '([^']+)'/i, type: 'ImportError' },
  { regex: /ImportError:\s*(.*)/i, type: 'ImportError' },
  { regex: /AttributeError:\s*'?(\w+)'?\s+object has no attribute '(\w+)'/i, type: 'AttributeError' },
  { regex: /NameError:\s*name '(\w+)' is not defined/i, type: 'NameError' },
  { regex: /TypeError:\s*(\w+)\(\)\s*(takes|missing|got)/i, type: 'TypeError' },
  { regex: /ValueError:\s*(.*)/i, type: 'ValueError' },
  { regex: /KeyError:\s*'?([^']+)'?/i, type: 'KeyError' },
  { regex: /FileNotFoundError:\s*(.*)/i, type: 'FileNotFoundError' },
  { regex: /PermissionError:\s*(.*)/i, type: 'PermissionError' },
  { regex: /SyntaxError:\s*(.*)/i, type: 'SyntaxError' },
  { regex: /RecursionError:\s*(.*)/i, type: 'RecursionError' },
  { regex: /OSError:.*Address already in use/i, type: 'ResourceConflict' },
  { regex: /ConnectionRefusedError/i, type: 'ConnectionError' },
  { regex: /Cannot find module '([^']+)'/i, type: 'ModuleNotFoundError' },
  { regex: /is not a function/i, type: 'TypeError' },
  { regex: /Cannot read propert(y|ies) of (undefined|null)/i, type: 'TypeError' },
  { regex: /ERR_MODULE_NOT_FOUND/i, type: 'ModuleNotFoundError' },
  { regex: /ENOENT:\s*no such file/i, type: 'FileNotFoundError' },
  { regex: /EACCES:\s*permission denied/i, type: 'PermissionError' },
  { regex: /EADDRINUSE/i, type: 'ResourceConflict' },
];

const FIX_SUGGESTIONS: Record<string, string> = {
  ModuleNotFoundError: 'Install missing dependency or create import proxy stub',
  ImportError: 'Check export names — use optional import with try/except fallback',
  AttributeError: 'Use hasattr() or optional chaining (?.) — interface may have changed',
  NameError: 'Add namespace isolation or explicit imports for referenced symbols',
  TypeError: 'Adapt function call signatures — check parameter count and types',
  ValueError: 'Add input validation layer before the failing call',
  KeyError: 'Use .get() with default or validate dict keys before access',
  FileNotFoundError: 'Check file paths — ensure relative paths resolve from project root',
  PermissionError: 'Run with correct permissions or sandbox file operations',
  SyntaxError: 'Check language version compatibility — may need transpilation',
  RecursionError: 'Add recursion depth guard or convert to iterative approach',
  ResourceConflict: 'Use dynamic port allocation or virtual filesystem',
  ConnectionError: 'Verify service is running — add retry with exponential backoff',
};

/**
 * Normalize a raw error string into a canonical typed error.
 */
export function parseError(raw: string): NormalizedError {
  for (const { regex, type } of ERROR_PATTERNS) {
    regex.lastIndex = 0;
    const m = regex.exec(raw);
    if (m) {
      // Extract module context if present
      const modMatch = raw.match(/File "([^"]+)", line (\d+)/);
      return {
        raw,
        type,
        signature: `${type}:${m[1] || m[0]}`,
        module: modMatch?.[1],
        line: modMatch ? parseInt(modMatch[2]) : undefined,
        suggestion: FIX_SUGGESTIONS[type] || 'Review error context and apply targeted fix',
      };
    }
  }
  return {
    raw,
    type: 'Unknown',
    signature: `Unknown:${raw.slice(0, 80)}`,
    suggestion: 'Review full stack trace for context',
  };
}

/**
 * Cluster a list of errors by type and deduplicate.
 */
export function clusterErrors(
  errors: { message: string; file?: string }[],
): ErrorCluster[] {
  const grouped = new Map<string, { count: number; files: Set<string>; type: string; suggestion: string }>();

  for (const err of errors) {
    const parsed = parseError(err.message);
    const existing = grouped.get(parsed.signature);
    if (existing) {
      existing.count++;
      if (err.file) existing.files.add(err.file);
    } else {
      grouped.set(parsed.signature, {
        count: 1,
        files: new Set(err.file ? [err.file] : []),
        type: parsed.type,
        suggestion: parsed.suggestion,
      });
    }
  }

  return [...grouped.entries()]
    .map(([sig, v]) => ({
      type: v.type,
      count: v.count,
      affectedFiles: [...v.files],
      signature: sig,
      suggestion: v.suggestion,
    }))
    .sort((a, b) => b.count - a.count);
}
