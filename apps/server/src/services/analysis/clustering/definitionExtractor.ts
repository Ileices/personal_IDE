// ============================================
// Definition Extractor
// Ported from auto_rebuilder.py: extract_functions_and_classes
// 5-pass analysis: collect, classify, graph,
// risk-assess, and score for integration
// ============================================

export interface DefinitionInfo {
  name: string;
  type: 'function' | 'class' | 'interface' | 'type' | 'enum' | 'variable';
  isExported: boolean;
  domain: string;
  lineStart: number;
  lineEnd: number;
  dependencies: string[];      // names of other definitions used
  riskScore: number;           // 0-100, 100 = high risk
  compatibilityScore: number;  // 0-100, 100 = easy to integrate
  resources: string[];         // 'file' | 'network' | 'env' | 'database' | 'process'
}

export type IntegrationStrategy = 'direct' | 'adapter' | 'wrapper' | 'isolate';

export interface ExtractionResult {
  definitions: DefinitionInfo[];
  strategy: IntegrationStrategy;
  safeCount: number;
  riskyCount: number;
  totalTokens: number;
}

// Common names that get high collision risk
const COMMON_NAMES = new Set([
  'init', 'setup', 'config', 'main', 'run', 'start', 'stop',
  'get', 'set', 'create', 'update', 'delete', 'find', 'parse',
  'handle', 'process', 'build', 'load', 'save', 'render',
  'connect', 'close', 'open', 'read', 'write', 'format',
]);

// Domain classification keywords
const DOMAIN_TERMS: Record<string, string[]> = {
  io: ['read', 'write', 'file', 'stream', 'buffer', 'path', 'dir'],
  network: ['fetch', 'http', 'request', 'response', 'url', 'socket', 'api'],
  model: ['model', 'schema', 'entity', 'record', 'train', 'predict'],
  utility: ['util', 'helper', 'format', 'parse', 'validate', 'transform'],
  control: ['route', 'handler', 'controller', 'middleware', 'guard'],
  ui: ['component', 'render', 'view', 'panel', 'layout', 'style'],
};

// Resource usage indicators
const RESOURCE_PATTERNS: Record<string, RegExp[]> = {
  file: [/\bfs\./, /readFile/, /writeFile/, /\bpath\.join/, /createReadStream/],
  network: [/\bfetch\(/, /\baxios/, /\bhttp\./, /\.listen\(/, /\.connect\(/],
  env: [/process\.env/, /\bdotenv/, /\.env\b/],
  database: [/\.query\(/, /\.execute\(/, /\bsqlite/, /\bmongo/, /\bprisma/],
  process: [/child_process/, /\bspawn\(/, /\bexec\(/, /worker_threads/],
};

/**
 * Extract all definitions from a source file with integration analysis.
 */
export function extractDefinitions(source: string, filePath?: string): ExtractionResult {
  const lines = source.split('\n');
  const definitions: DefinitionInfo[] = [];

  // ── Pass 1: Collect all top-level definitions ──
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

    const def = matchDefinition(trimmed, i, lines);
    if (def) definitions.push(def);
  }

  // ── Pass 2: Classify domains ──
  for (const def of definitions) {
    const body = lines.slice(def.lineStart - 1, def.lineEnd).join('\n');
    def.domain = classifyDomain(def.name, body);
  }

  // ── Pass 3: Build dependency graph ──
  const allNames = new Set(definitions.map(d => d.name));
  for (const def of definitions) {
    const body = lines.slice(def.lineStart - 1, def.lineEnd).join('\n');
    def.dependencies = [...allNames].filter(name =>
      name !== def.name && new RegExp(`\\b${name}\\b`).test(body)
    );
  }

  // ── Pass 4: Risk assessment ──
  for (const def of definitions) {
    const body = lines.slice(def.lineStart - 1, def.lineEnd).join('\n');
    def.riskScore = assessRisk(def, body);
    def.resources = detectResources(body);
  }

  // ── Pass 5: Compatibility scoring ──
  for (const def of definitions) {
    const safety = 100 - def.riskScore;
    const depFactor = Math.max(0, 100 - def.dependencies.length * 15);
    const resourceFactor = Math.max(0, 100 - def.resources.length * 30);
    def.compatibilityScore = Math.round(safety * 0.5 + depFactor * 0.3 + resourceFactor * 0.2);
  }

  // Determine integration strategy
  const safeCount = definitions.filter(d => d.riskScore < 50).length;
  const riskyCount = definitions.filter(d => d.riskScore >= 50).length;
  const totalDefs = definitions.length || 1;

  let strategy: IntegrationStrategy;
  if (riskyCount / totalDefs > 0.5) strategy = 'isolate';
  else if (safeCount / totalDefs > 0.7) strategy = 'direct';
  else if (safeCount > 0) strategy = 'adapter';
  else strategy = 'wrapper';

  const totalTokens = Math.ceil(source.length / 3.5);

  return { definitions, strategy, safeCount, riskyCount, totalTokens };
}

// ── Helpers ──

function matchDefinition(trimmed: string, i: number, lines: string[]): DefinitionInfo | null {
  const isExported = trimmed.startsWith('export ');
  const clean = isExported ? trimmed.replace(/^export\s+(default\s+)?/, '') : trimmed;

  // Function
  const funcMatch = clean.match(/^(?:async\s+)?function\s+(\w+)/);
  if (funcMatch) return makeDef(funcMatch[1], 'function', isExported, i, lines);

  // Arrow function / const function
  const arrowMatch = clean.match(/^(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\(|<)/);
  if (arrowMatch) return makeDef(arrowMatch[1], 'function', isExported, i, lines);

  // Class
  const classMatch = clean.match(/^(?:abstract\s+)?class\s+(\w+)/);
  if (classMatch) return makeDef(classMatch[1], 'class', isExported, i, lines);

  // Interface
  const ifaceMatch = clean.match(/^interface\s+(\w+)/);
  if (ifaceMatch) return makeDef(ifaceMatch[1], 'interface', isExported, i, lines);

  // Type alias
  const typeMatch = clean.match(/^type\s+(\w+)\s*[<=]/);
  if (typeMatch) return makeDef(typeMatch[1], 'type', isExported, i, lines);

  // Enum
  const enumMatch = clean.match(/^(?:const\s+)?enum\s+(\w+)/);
  if (enumMatch) return makeDef(enumMatch[1], 'enum', isExported, i, lines);

  return null;
}

function makeDef(
  name: string, type: DefinitionInfo['type'],
  isExported: boolean, startIdx: number, lines: string[],
): DefinitionInfo {
  // Find end by brace counting
  let braceDepth = 0;
  let started = false;
  let endIdx = startIdx;
  for (let j = startIdx; j < lines.length; j++) {
    for (const ch of lines[j]) {
      if (ch === '{') { braceDepth++; started = true; }
      if (ch === '}') braceDepth--;
    }
    if (started && braceDepth <= 0) { endIdx = j; break; }
    // Single-line definitions (type aliases, etc.)
    if (!started && lines[j].includes(';')) { endIdx = j; break; }
    if (j === lines.length - 1) endIdx = j;
  }

  return {
    name, type, isExported,
    domain: 'general',
    lineStart: startIdx + 1,
    lineEnd: endIdx + 1,
    dependencies: [],
    riskScore: 0,
    compatibilityScore: 100,
    resources: [],
  };
}

function classifyDomain(name: string, body: string): string {
  const lower = (name + ' ' + body).toLowerCase();
  let best = 'general';
  let bestScore = 0;
  for (const [domain, terms] of Object.entries(DOMAIN_TERMS)) {
    const score = terms.filter(t => lower.includes(t)).length;
    if (score > bestScore) { bestScore = score; best = domain; }
  }
  return best;
}

function assessRisk(def: DefinitionInfo, body: string): number {
  let risk = 0;
  if (COMMON_NAMES.has(def.name.toLowerCase())) risk += 20;
  if (def.name.length <= 4) risk += 25;
  risk += def.dependencies.length * 15;
  risk = Math.min(100, risk);
  return risk;
}

function detectResources(body: string): string[] {
  const resources: string[] = [];
  for (const [resource, patterns] of Object.entries(RESOURCE_PATTERNS)) {
    for (const pat of patterns) {
      if (pat.test(body)) { resources.push(resource); break; }
    }
  }
  return resources;
}
