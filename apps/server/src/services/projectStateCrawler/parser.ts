// ============================================
// Project State Crawler — Deterministic Parser v2
// Full static analysis — no LLM, no inference.
// Extracts ALL spec devtag types per language.
//
// Devtag types produced:
//   file, directory, module, class, function, method,
//   import, export, interface, type, enum, constant,
//   route, schema, field, test, worker, job
//
// Relationship tags:
//   calls:<name>, depends_on:<module>, inherits:<class>,
//   implements:<interface>, decorator:<name>
// ============================================
import { createHash } from 'crypto';
import { readFileSync } from 'fs';

export interface DevTagRecord {
  devtagType: string;
  devtagName: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  parentDevtag: string | null;
  contentHash: string;
  language: string;
  relationshipTags: string[];
  skipped: boolean;
  skipReason?: string;
  /** Decorator/annotation names applied to this symbol. */
  attributes?: string[];
}

// ─── Internal rule shape ───────────────────────
interface ParseRule {
  devtagType: string;
  /** Pattern; name at group 1, optional secondary at group 2. */
  pattern: RegExp;
  /** If true, this tag can appear inside a class body and become devtagType:'method'. */
  canBeMethod?: boolean;
  /** If true, estimate end line from block structure. */
  estimateEnd?: boolean;
}

// ─── Language rules ────────────────────────────

/** TS/JS — TypeScript, TSX, JavaScript, JSX, MJS, CJS */
const JS_TS_RULES: ParseRule[] = [
  // Structural
  { devtagType: 'module',    pattern: /^(?:export\s+)?(?:namespace|module)\s+(\w[\w.]*)/, estimateEnd: true },
  { devtagType: 'class',     pattern: /^(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+(\w+)/, estimateEnd: true },
  { devtagType: 'interface', pattern: /^(?:export\s+)?interface\s+(\w+)/, estimateEnd: true },
  { devtagType: 'enum',      pattern: /^(?:export\s+)?(?:const\s+)?enum\s+(\w+)/, estimateEnd: true },
  { devtagType: 'type',      pattern: /^(?:export\s+)?type\s+(\w+)\s*[=<]/ },
  // Functions (module-scope)
  { devtagType: 'function',  pattern: /^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s*(\w+)/, canBeMethod: true, estimateEnd: true },
  // Arrow / assigned function: const foo = async () =>
  { devtagType: 'function',  pattern: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|\w+)\s*=>/, estimateEnd: true },
  // Assigned function expression: const foo = async function
  { devtagType: 'function',  pattern: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function/, estimateEnd: true },
  // Constants (UPPER_CASE)
  { devtagType: 'constant',  pattern: /^(?:export\s+)?const\s+([A-Z][A-Z0-9_]{2,})\s*=/ },
  // Imports
  { devtagType: 'import',    pattern: /^import\s+(?:type\s+)?(?:.*?\s+from\s+)?['"]([^'"]+)['"]/ },
  { devtagType: 'import',    pattern: /^(?:const|let|var)\s+(?:\{[^}]+\}|\w+)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/ },
  // Exports
  { devtagType: 'export',    pattern: /^export\s+\{([^}]+)\}(?:\s+from)?/ },
  // Routes (Express / Fastify)
  { devtagType: 'route',     pattern: /^(?:app|router|server)\.(get|post|put|delete|patch|use|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/ },
  { devtagType: 'route',     pattern: /url\s*:\s*['"`]([^'"`]+)['"`]/ },
  // Schemas
  { devtagType: 'schema',    pattern: /^(?:export\s+)?(?:const|let|var)\s+(\w+(?:Schema|Model|Entity|Validator|Shape))\s*=/, estimateEnd: true },
  // Tests
  { devtagType: 'test',      pattern: /^(?:it|test|describe)\s*\(\s*['"`]([^'"`]+)['"`]/, estimateEnd: true },
  // Workers / Jobs
  { devtagType: 'worker',    pattern: /^(?:export\s+)?(?:const|let|var|class)\s+(\w+(?:Worker|Processor))\b/, estimateEnd: true },
  { devtagType: 'job',       pattern: /^(?:export\s+)?(?:const|let|var|class)\s+(\w+(?:Job|Task|Cron))\b/, estimateEnd: true },
  { devtagType: 'job',       pattern: /^(?:queue|scheduler|agenda)\.(?:define|add|process)\s*\(\s*['"`]([^'"`]+)['"`]/ },
];

/** Python */
const PYTHON_RULES: ParseRule[] = [
  { devtagType: 'module',   pattern: /^# module:\s*(\S+)/ },
  { devtagType: 'class',    pattern: /^class\s+(\w+)/, estimateEnd: true },
  { devtagType: 'function', pattern: /^(?:async\s+)?def\s+(\w+)\s*\(/, canBeMethod: true, estimateEnd: true },
  { devtagType: 'import',   pattern: /^(?:import\s+([\w.]+)|from\s+([\w.]+)\s+import)/ },
  { devtagType: 'constant', pattern: /^([A-Z][A-Z0-9_]{2,})\s*=/ },
  { devtagType: 'test',     pattern: /^(?:async\s+)?def\s+(test_\w+)\s*\(/ },
  { devtagType: 'schema',   pattern: /^class\s+(\w+)\s*\((?:[^)]*(?:Model|Schema|Serializer|BaseModel|Resource)[^)]*)\)/, estimateEnd: true },
  { devtagType: 'route',    pattern: /^@(?:app|blueprint|router|api)\.(?:route|get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/ },
];

/** Rust */
const RUST_RULES: ParseRule[] = [
  { devtagType: 'module',   pattern: /^(?:pub\s+(?:\([^)]+\)\s+)?)?mod\s+(\w+)/ },
  { devtagType: 'function', pattern: /^(?:pub\s+(?:\([^)]+\)\s+)?)?(?:async\s+)?fn\s+(\w+)/, canBeMethod: true, estimateEnd: true },
  { devtagType: 'class',    pattern: /^(?:pub\s+(?:\([^)]+\)\s+)?)?struct\s+(\w+)/, estimateEnd: true },
  { devtagType: 'enum',     pattern: /^(?:pub\s+(?:\([^)]+\)\s+)?)?enum\s+(\w+)/, estimateEnd: true },
  { devtagType: 'type',     pattern: /^(?:pub\s+(?:\([^)]+\)\s+)?)?type\s+(\w+)\s*=/ },
  { devtagType: 'constant', pattern: /^(?:pub\s+(?:\([^)]+\)\s+)?)?const\s+([A-Z_][A-Z0-9_]*)\s*:/ },
  { devtagType: 'import',   pattern: /^use\s+([\w:]+)/ },
  { devtagType: 'test',     pattern: /^fn\s+(test_?\w+)\s*\(/ },
];

/** Go */
const GO_RULES: ParseRule[] = [
  { devtagType: 'module',   pattern: /^package\s+(\w+)/ },
  { devtagType: 'function', pattern: /^func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(/, canBeMethod: true, estimateEnd: true },
  { devtagType: 'type',     pattern: /^type\s+(\w+)\s+(?:struct|interface)/, estimateEnd: true },
  { devtagType: 'constant', pattern: /^const\s+([A-Z_][A-Z0-9_]*)\s*=/ },
  { devtagType: 'import',   pattern: /^import\s+"([\w./]+)"/ },
  { devtagType: 'test',     pattern: /^func\s+(Test\w+)\s*\(/ },
];

const GENERIC_RULES: ParseRule[] = [
  { devtagType: 'function', pattern: /^(?:func|fn|def|function|sub|procedure)\s+(\w+)/i, canBeMethod: true, estimateEnd: true },
  { devtagType: 'class',    pattern: /^(?:class|struct|type)\s+(\w+)/i, estimateEnd: true },
  { devtagType: 'import',   pattern: /^(?:import|use|require|include)\s+["']?([\w./]+)["']?/i },
];

const RULES_BY_LANG: Record<string, ParseRule[]> = {
  typescript: JS_TS_RULES,
  javascript: JS_TS_RULES,
  python: PYTHON_RULES,
  rust: RUST_RULES,
  go: GO_RULES,
  default: GENERIC_RULES,
};

// ─── Extension → Language map ──────────────────
const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  py: 'python', pyw: 'python',
  rs: 'rust', go: 'go',
  java: 'java', kt: 'kotlin', scala: 'scala',
  c: 'c', cpp: 'cpp', cc: 'cpp', h: 'c', hpp: 'cpp',
  rb: 'ruby', swift: 'swift',
  cs: 'csharp', php: 'php',
  sh: 'bash', bash: 'bash',
  json: 'json', yaml: 'yaml', yml: 'yaml',
  md: 'markdown', html: 'html', css: 'css',
  sql: 'sql', toml: 'toml', xml: 'xml',
};

function contentHash(lines: string[]): string {
  return createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 16);
}

export function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return EXT_TO_LANG[ext] || 'unknown';
}

function isBinary(content: Buffer): boolean {
  // Check first 512 bytes for null bytes
  const sample = content.slice(0, Math.min(512, content.length));
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) return true;
  }
  return false;
}

/** Estimate end line of a block via brace-counting or Python dedent. */
function estimateBlockEnd(lines: string[], startIdx: number, language: string): number {
  if (language === 'python') {
    const startLine = lines[startIdx];
    const baseIndent = startLine.length - startLine.trimStart().length;
    for (let i = startIdx + 1; i < lines.length; i++) {
      const l = lines[i];
      if (!l.trim()) continue;
      const ind = l.length - l.trimStart().length;
      if (ind <= baseIndent) return i;
    }
    return lines.length;
  }
  let depth = 0;
  let foundOpen = false;
  for (let i = startIdx; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') { depth++; foundOpen = true; }
      else if (ch === '}') { depth--; }
    }
    if (foundOpen && depth <= 0) return i + 1;
    if (i - startIdx > 500) return startIdx + 1;
  }
  return Math.min(startIdx + 80, lines.length);
}

/** Extract relationship tags from a code block. */
function extractRelationships(lines: string[], language: string, decorators: string[]): string[] {
  const rels: string[] = [];
  const seen = new Set<string>();

  for (const d of decorators) {
    const k = `decorator:${d}`;
    if (!seen.has(k)) { seen.add(k); rels.push(k); }
  }

  const text = lines.join('\n');

  // Inheritance: extends
  const extMatch = text.match(/\bextends\s+([\w,\s]+?)(?:\s+implements|\s*\{|\s*$)/);
  if (extMatch) {
    for (const p of extMatch[1].split(',')) {
      const cls = p.trim().split(/[\s<]/)[0];
      if (cls && !seen.has(`inherits:${cls}`)) { seen.add(`inherits:${cls}`); rels.push(`inherits:${cls}`); }
    }
  }

  // Python inheritance: class Foo(Bar, Baz)
  if (language === 'python') {
    const pyExt = text.match(/^class\s+\w+\s*\(([^)]+)\)/m);
    if (pyExt) {
      for (const p of pyExt[1].split(',')) {
        const cls = p.trim();
        if (cls && cls !== 'object' && !seen.has(`inherits:${cls}`)) {
          seen.add(`inherits:${cls}`); rels.push(`inherits:${cls}`);
        }
      }
    }
  }

  // Implements
  const implMatch = text.match(/\bimplements\s+([\w,\s<>]+?)(?:\s*\{|\s*$)/);
  if (implMatch) {
    for (const p of implMatch[1].split(',')) {
      const iface = p.trim().split(/[<\s]/)[0];
      if (iface && !seen.has(`implements:${iface}`)) { seen.add(`implements:${iface}`); rels.push(`implements:${iface}`); }
    }
  }

  // Function calls
  const callPat = /(?<!['"\/\*#])\b([\w$][\w$]*(?:\.[\w$]+)*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = callPat.exec(text)) !== null) {
    const name = m[1];
    const base = name.split('.')[0];
    if (name && name.length > 2 && !JS_KEYWORDS.has(base) && !seen.has(`calls:${name}`)) {
      seen.add(`calls:${name}`);
      rels.push(`calls:${name}`);
      if (rels.length >= 25) break;
    }
  }

  return rels;
}

/** Extract decorators applied on lines preceding lineIdx. */
function extractDecorators(lines: string[], lineIdx: number): string[] {
  const decorators: string[] = [];
  let i = lineIdx - 1;
  while (i >= 0) {
    const t = lines[i].trim();
    if (t.startsWith('@')) {
      const m = t.match(/^@([\w.]+)/);
      if (m) decorators.unshift(m[1]);
    } else if (t === '' || t.startsWith('//') || t.startsWith('#')) {
      // pass through blank/comment lines
    } else {
      break;
    }
    i--;
  }
  return decorators;
}

/** Detect a field/property declaration inside a class or schema body. */
function detectField(trimmed: string, language: string, classStack: Array<{ name: string; endLine: number }>): string | null {
  if (classStack.length === 0) return null;
  if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) return null;

  if (language === 'typescript' || language === 'javascript') {
    // TypeScript class property: [modifiers] name[?!]: Type
    const classProp = trimmed.match(/^(?:(?:public|private|protected|readonly|static|override|declare|abstract)\s+)*(\w+)\s*[?!]?\s*:/);
    if (classProp && !trimmed.includes('(') && !trimmed.match(/^\s*(?:if|for|while|return|const|let|var)\b/)) {
      return classProp[1];
    }
    // Zod field inside object literal: foo: z.string()
    const zodField = trimmed.match(/^(\w+)\s*:\s*z\./);
    if (zodField) return zodField[1];
  }

  if (language === 'python') {
    // Python dataclass / model field: name: Type
    const pyField = trimmed.match(/^(\w+)\s*:\s*(?!:)[\w\['"]/);
    if (pyField && !trimmed.startsWith('def') && !trimmed.startsWith('class') && !trimmed.startsWith('return')) {
      return pyField[1];
    }
    // ORM field: name = models.Field(...)
    const ormField = trimmed.match(/^(\w+)\s*=\s*(?:models|fields|Column|relationship|ForeignKey)\./);
    if (ormField) return ormField[1];
  }

  return null;
}

const JS_KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'return', 'const', 'let', 'var', 'function',
  'class', 'import', 'export', 'default', 'async', 'await', 'new', 'this',
  'try', 'catch', 'throw', 'typeof', 'instanceof', 'void', 'null', 'undefined',
  'true', 'false', 'switch', 'case', 'break', 'continue', 'do', 'in', 'of',
  'def', 'print', 'self', 'super', 'yield', 'pass', 'with', 'from', 'as',
  'console', 'process', 'require', 'module', 'exports', 'Object', 'Array',
  'String', 'Number', 'Boolean', 'Promise', 'Error', 'Date', 'Math',
  'it', 'describe', 'test', 'expect', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll',
]);

// ─── Main parseFile ────────────────────────────
export function parseFile(filePath: string, fileSizeCeiling = 500 * 1024): DevTagRecord[] {
  const records: DevTagRecord[] = [];
  const language = detectLanguage(filePath);
  const fileName = filePath.split(/[/\\]/).pop() || '';

  let raw: Buffer;
  try {
    raw = readFileSync(filePath);
  } catch {
    return records;
  }

  // Binary check
  if (isBinary(raw)) {
    records.push({
      devtagType: 'file', devtagName: fileName, filePath,
      lineStart: 0, lineEnd: 0, parentDevtag: null, contentHash: '',
      language: 'binary', relationshipTags: [], skipped: true, skipReason: 'binary_file',
    });
    return records;
  }

  // Size check
  if (raw.length > fileSizeCeiling) {
    records.push({
      devtagType: 'file', devtagName: fileName, filePath,
      lineStart: 0, lineEnd: 0, parentDevtag: null, contentHash: '',
      language, relationshipTags: [], skipped: true, skipReason: 'file_too_large',
    });
    return records;
  }

  const content = raw.toString('utf8');
  const lines = content.split('\n');
  const rules = RULES_BY_LANG[language] || GENERIC_RULES;

  // File-level tag
  records.push({
    devtagType: 'file', devtagName: fileName, filePath,
    lineStart: 1, lineEnd: lines.length, parentDevtag: null,
    contentHash: contentHash(lines), language, relationshipTags: [], skipped: false,
  });

  // Class context stack: tracks open class/schema blocks so methods get parent_devtag
  const classStack: Array<{ name: string; endLine: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    // Pop expired class scopes
    while (classStack.length > 0 && classStack[classStack.length - 1].endLine <= i) {
      classStack.pop();
    }

    const line = lines[i];
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;

    const currentIndent = line.length - trimmed.length;

    // ── Field detection (higher priority inside class body) ──
    const fieldName = detectField(trimmed, language, classStack);
    if (fieldName) {
      // Avoid duplicating a record already inserted for this line
      if (!records.find(r => r.lineStart === i + 1)) {
        records.push({
          devtagType: 'field',
          devtagName: fieldName,
          filePath,
          lineStart: i + 1,
          lineEnd: i + 1,
          parentDevtag: classStack.length > 0 ? classStack[classStack.length - 1].name : null,
          contentHash: contentHash([line]),
          language,
          relationshipTags: [],
          skipped: false,
        });
        continue;
      }
    }

    // ── Rule matching ──────────────────────────
    for (const rule of rules) {
      const m = trimmed.match(rule.pattern);
      if (!m) continue;

      // Extract name — prefer group 2 (secondary) for route method+path
      let rawName: string;
      if (rule.devtagType === 'route' && m[2]) {
        rawName = `${m[1].toUpperCase()} ${m[2]}`;
      } else if (language === 'python' && rule.devtagType === 'import') {
        rawName = (m[2] || m[1] || '').trim();
      } else {
        rawName = (m[1] || '').trim();
      }
      if (!rawName) continue;

      const lineEnd = rule.estimateEnd
        ? estimateBlockEnd(lines, i, language)
        : i + 1;

      const blockLines = lines.slice(i, lineEnd);
      const decorators = extractDecorators(lines, i);
      const rels = extractRelationships(blockLines, language, decorators);

      // Determine effective type and parent
      let devtagType = rule.devtagType;
      let parentDevtag: string | null = null;

      if (classStack.length > 0) {
        const parent = classStack[classStack.length - 1];
        parentDevtag = parent.name;
        // Promote function → method when it appears inside a class body
        if (rule.canBeMethod && currentIndent > 0) {
          devtagType = 'method';
        }
      }

      records.push({
        devtagType,
        devtagName: rawName,
        filePath,
        lineStart: i + 1,
        lineEnd,
        parentDevtag,
        contentHash: contentHash(blockLines),
        language,
        relationshipTags: rels,
        skipped: false,
        attributes: decorators.length > 0 ? decorators : undefined,
      });

      // Push class/schema onto stack for child method/field parenting
      if ((devtagType === 'class' || devtagType === 'schema') && lineEnd > i + 1) {
        if (!classStack.find(c => c.name === rawName)) {
          classStack.push({ name: rawName, endLine: lineEnd });
        }
      }

      break; // only one rule fires per line
    }
  }

  return records;
}
