// ============================================
// Function Signature Analyzer
// Ported from auto_rebuilder.py: analyze_function_signatures
// Extracts rich metadata for every function:
// params, return types, decorators, purity, domain
// ============================================

export interface ParamInfo {
  name: string;
  type: string | null;
  hasDefault: boolean;
  defaultValue?: string;
  isRest: boolean;   // ...args
  isOptional: boolean;
}

export interface SignatureInfo {
  name: string;
  params: ParamInfo[];
  returnType: string | null;
  isAsync: boolean;
  isExported: boolean;
  isMethod: boolean;
  decorators: string[];
  docstring: string | null;
  purityScore: number;           // 0-100, 100 = pure
  domain: string;                // 'io' | 'network' | 'math' | 'model' | 'file' | 'general'
  adaptationCost: number;        // higher = harder to integrate
  paramPatterns: string[];       // 'simple_transform' | 'callback' | 'configurable'
  lineStart: number;
  lineEnd: number;
}

// Side-effect indicators that reduce purity
const IMPURE_PATTERNS = [
  /\bglobal\b/, /\bprocess\./, /\bfs\.\w+Sync/, /\bfs\.\w+\(/,
  /\.connect\(/, /\bfetch\(/, /\baxios\./, /\bchild_process/,
  /\.save\(/, /\.write\(/, /\bconsole\./, /\bprocess\.exit/,
  /\.exec\(/, /\.spawn\(/, /\bsetTimeout\(/, /\bsetInterval\(/,
  /\bwindow\./, /\bdocument\./, /\blocalStorage/,
];

// Domain keywords (name×3 + params×1 + docstring×2 weight)
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  io: ['read', 'write', 'file', 'stream', 'buffer', 'pipe', 'stdin', 'stdout'],
  network: ['fetch', 'http', 'request', 'response', 'url', 'socket', 'api', 'endpoint'],
  math: ['calculate', 'compute', 'sum', 'average', 'matrix', 'vector', 'transform', 'interpolat'],
  model: ['model', 'predict', 'train', 'inference', 'embed', 'tokenize', 'encode', 'decode'],
  file: ['path', 'directory', 'folder', 'rename', 'delete', 'copy', 'move', 'mkdir'],
  general: [],
};

/**
 * Analyze function signatures from TypeScript/JavaScript source text.
 * Uses regex-based analysis (no AST dependency) for portability.
 */
export function analyzeSignatures(source: string, filePath: string): SignatureInfo[] {
  const lines = source.split('\n');
  const results: SignatureInfo[] = [];

  // Regex to match function declarations, arrow functions, and class methods
  const funcRegex = /^(\s*)(export\s+)?(async\s+)?(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\(|<)|(\w+)\s*\()/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(funcRegex);
    if (!match) continue;

    const isExported = !!match[2];
    const isAsync = !!match[3];
    const name = match[4] || match[5] || match[6];
    if (!name) continue;

    // Skip if it's just a function call (no '{' or '=>' nearby)
    const contextWindow = lines.slice(i, Math.min(i + 5, lines.length)).join('\n');
    if (!contextWindow.includes('{') && !contextWindow.includes('=>')) continue;

    // Find function end (brace counting)
    let braceDepth = 0;
    let started = false;
    let endLine = i;
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') { braceDepth++; started = true; }
        if (ch === '}') braceDepth--;
      }
      if (started && braceDepth <= 0) { endLine = j; break; }
      if (j === lines.length - 1) endLine = j;
    }

    // Extract body for analysis
    const body = lines.slice(i, endLine + 1).join('\n');

    // Parse params from the signature line
    const paramMatch = contextWindow.match(/\(([^)]*)\)/);
    const params = parseParams(paramMatch?.[1] || '');

    // Extract return type
    const returnMatch = contextWindow.match(/\):\s*([^{=]+?)(?:\s*[{=]|$)/);
    const returnType = returnMatch?.[1]?.trim() || null;

    // Check for decorators (@ comments above)
    const decorators: string[] = [];
    for (let d = i - 1; d >= Math.max(0, i - 5); d--) {
      const dec = lines[d].trim();
      if (dec.startsWith('@')) decorators.push(dec);
      else if (dec === '' || dec.startsWith('//') || dec.startsWith('*')) continue;
      else break;
    }

    // Extract docstring (JSDoc above or first line comment)
    let docstring: string | null = null;
    for (let d = i - 1; d >= Math.max(0, i - 20); d--) {
      const trimmed = lines[d].trim();
      if (trimmed === '*/') {
        // Find matching /**
        for (let s = d - 1; s >= Math.max(0, d - 50); s--) {
          if (lines[s].trim().startsWith('/**')) {
            docstring = lines.slice(s, d + 1).join('\n');
            break;
          }
        }
        break;
      }
      if (trimmed.startsWith('//')) {
        docstring = trimmed.slice(2).trim();
        break;
      }
      if (trimmed === '' || trimmed.startsWith('@')) continue;
      break;
    }

    // Purity scoring
    let purityScore = 100;
    for (const pat of IMPURE_PATTERNS) {
      if (pat.test(body)) purityScore -= 10;
    }
    purityScore = Math.max(0, purityScore);

    // Domain classification
    const domain = classifyDomain(name, params, docstring || '');

    // Detect param patterns
    const paramPatterns: string[] = [];
    const nonThisParams = params.filter(p => p.name !== 'this');
    if (nonThisParams.length === 1 && !line.includes('class ')) paramPatterns.push('simple_transform');
    if (params.some(p => /callback|on[A-Z]|handler|listener/.test(p.name))) paramPatterns.push('callback');
    if (params.some(p => /config|options|opts|settings|params/.test(p.name))) paramPatterns.push('configurable');

    // Adaptation cost
    const isMethod = /^\s+\w/.test(line) && !isExported;
    let adaptationCost = 0;
    if (isMethod) adaptationCost += 5;
    if (purityScore < 50) adaptationCost += 10;
    const required = params.filter(p => !p.hasDefault && !p.isOptional && !p.isRest);
    if (required.length > 3) adaptationCost += required.length * 2;

    results.push({
      name, params, returnType, isAsync, isExported, isMethod,
      decorators, docstring, purityScore, domain,
      adaptationCost, paramPatterns,
      lineStart: i + 1, lineEnd: endLine + 1,
    });
  }

  return results;
}

function parseParams(raw: string): ParamInfo[] {
  if (!raw.trim()) return [];
  return raw.split(',').map(p => {
    const trimmed = p.trim();
    const isRest = trimmed.startsWith('...');
    const cleaned = isRest ? trimmed.slice(3) : trimmed;
    const hasDefault = cleaned.includes('=');
    const isOptional = cleaned.includes('?');
    const nameMatch = cleaned.match(/^(\w+)/);
    const typeMatch = cleaned.match(/:\s*([^=]+?)(?:\s*=|$)/);
    const defaultMatch = cleaned.match(/=\s*(.+)$/);
    return {
      name: nameMatch?.[1] || trimmed,
      type: typeMatch?.[1]?.trim() || null,
      hasDefault,
      defaultValue: defaultMatch?.[1]?.trim(),
      isRest,
      isOptional,
    };
  });
}

function classifyDomain(name: string, params: ParamInfo[], docstring: string): string {
  const scores: Record<string, number> = {};
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    let score = 0;
    const lower = name.toLowerCase();
    for (const kw of keywords) {
      if (lower.includes(kw)) score += 3;
      for (const p of params) {
        if (p.name.toLowerCase().includes(kw)) score += 1;
      }
      if (docstring.toLowerCase().includes(kw)) score += 2;
    }
    scores[domain] = score;
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : 'general';
}
