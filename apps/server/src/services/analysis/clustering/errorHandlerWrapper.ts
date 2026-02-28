// ============================================
// Error Handler Wrapper
// Ported from auto_rebuilder.py: add_error_handling
// Wraps module entry points with structured
// try/catch/finally for graceful error recovery
// ============================================

export interface ErrorHandlerConfig {
  /** Catch and log unhandled errors vs re-throw */
  catchAll: boolean;
  /** Add resource cleanup in finally block */
  addFinally: boolean;
  /** Exit process on fatal errors (main scripts only) */
  exitOnFatal: boolean;
  /** Custom error handler function name */
  handlerName?: string;
}

const DEFAULT_CONFIG: ErrorHandlerConfig = {
  catchAll: true,
  addFinally: true,
  exitOnFatal: false,
};

/**
 * Wrap a function body with structured error handling.
 * Returns the wrapped source code as a string.
 */
export function wrapWithErrorHandling(
  source: string,
  functionName: string,
  config: Partial<ErrorHandlerConfig> = {},
): string {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const lines = source.split('\n');
  const funcRegex = new RegExp(
    `^(\\s*)(export\\s+)?(async\\s+)?(?:function\\s+${functionName}|(?:const|let)\\s+${functionName}\\s*=)`
  );

  let funcStart = -1;
  let funcEnd = -1;
  let indent = '';

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(funcRegex);
    if (match) {
      funcStart = i;
      indent = match[1] || '';

      // Find function end via brace counting
      let depth = 0;
      let started = false;
      for (let j = i; j < lines.length; j++) {
        for (const ch of lines[j]) {
          if (ch === '{') { depth++; started = true; }
          if (ch === '}') depth--;
        }
        if (started && depth <= 0) { funcEnd = j; break; }
      }
      break;
    }
  }

  if (funcStart === -1 || funcEnd === -1) {
    return source; // Function not found, return unchanged
  }

  // Extract the function body (between first { and last })
  const headerLines = [];
  const bodyLines = [];
  let inBody = false;
  let braceCount = 0;

  for (let i = funcStart; i <= funcEnd; i++) {
    if (!inBody) {
      headerLines.push(lines[i]);
      for (const ch of lines[i]) {
        if (ch === '{') { braceCount++; inBody = true; }
      }
    } else {
      bodyLines.push(lines[i]);
    }
  }

  // Remove last closing brace from bodyLines
  if (bodyLines.length > 0) {
    const last = bodyLines[bodyLines.length - 1];
    const lastBrace = last.lastIndexOf('}');
    if (lastBrace >= 0) {
      bodyLines[bodyLines.length - 1] = last.slice(0, lastBrace);
    }
  }

  const innerIndent = indent + '  ';
  const bodyIndent = innerIndent + '  ';

  // Build wrapped body
  const wrapped: string[] = [];
  wrapped.push(...headerLines);

  // Try block
  wrapped.push(`${innerIndent}try {`);
  for (const line of bodyLines) {
    if (line.trim()) {
      wrapped.push(`${bodyIndent}${line.trimStart()}`);
    }
  }

  // Catch blocks
  if (cfg.catchAll) {
    wrapped.push(`${innerIndent}} catch (error: unknown) {`);
    wrapped.push(`${bodyIndent}const err = error instanceof Error ? error : new Error(String(error));`);
    wrapped.push(`${bodyIndent}console.error(\`[${functionName}] Error: \${err.message}\`);`);
    wrapped.push(`${bodyIndent}console.error(err.stack || '');`);

    if (cfg.exitOnFatal) {
      wrapped.push(`${bodyIndent}if (err.message.includes('FATAL') || err.message.includes('ENOMEM')) {`);
      wrapped.push(`${bodyIndent}  process.exit(1);`);
      wrapped.push(`${bodyIndent}}`);
    }

    wrapped.push(`${bodyIndent}throw err; // re-throw after logging`);
  }

  // Finally block
  if (cfg.addFinally) {
    wrapped.push(`${innerIndent}} finally {`);
    wrapped.push(`${bodyIndent}// Resource cleanup`);
    wrapped.push(`${bodyIndent}if (typeof globalThis.gc === 'function') {`);
    wrapped.push(`${bodyIndent}  try { globalThis.gc(); } catch { /* ignore */ }`);
    wrapped.push(`${bodyIndent}}`);
    wrapped.push(`${innerIndent}}`);
  } else {
    wrapped.push(`${innerIndent}}`);
  }

  wrapped.push(`${indent}}`);

  // Reconstruct file
  const before = lines.slice(0, funcStart);
  const after = lines.slice(funcEnd + 1);

  return [...before, ...wrapped, ...after].join('\n');
}

/**
 * Detect functions that lack error handling.
 * Returns names of functions with no try/catch in their body.
 */
export function findUnguardedFunctions(source: string): string[] {
  const lines = source.split('\n');
  const unguarded: string[] = [];

  const funcRegex = /^\s*(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?(?:\(|<))/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(funcRegex);
    if (!match) continue;
    const name = match[1] || match[2];
    if (!name) continue;

    // Scan function body for try/catch
    let depth = 0;
    let started = false;
    let hasTryCatch = false;
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') { depth++; started = true; }
        if (ch === '}') depth--;
      }
      if (lines[j].trim().startsWith('try')) hasTryCatch = true;
      if (started && depth <= 0) break;
    }

    if (!hasTryCatch) unguarded.push(name);
  }

  return unguarded;
}
