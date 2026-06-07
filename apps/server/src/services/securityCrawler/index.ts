// ============================================================
// Security OWASP Crawler
//
// Static analysis of TypeScript server source files looking for
// OWASP Top 10 risk patterns. Runs in-process with no exec().
//
// Output:
//   - security_findings table (if available) or app_kv
//   - app_kv 'security_crawler:last_run' (ISO datetime)
//   - app_kv 'security_crawler:open_findings' (count)
//
// IMPORTANT: This crawler only reads source files — it does NOT
// modify code. It surfaces issues for human review or the God Factory.
// ============================================================
import type { Database } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type OwaspCategory =
  | 'A01-BrokenAccessControl'
  | 'A02-CryptographicFailures'
  | 'A03-Injection'
  | 'A04-InsecureDesign'
  | 'A05-SecurityMisconfiguration'
  | 'A06-VulnerableComponents'
  | 'A07-AuthFailures'
  | 'A08-DataIntegrity'
  | 'A09-LoggingFailures'
  | 'A10-SSRF';

export interface SecurityFinding {
  id: string;
  file_path: string;
  line_number: number;
  owasp_category: OwaspCategory;
  severity: Severity;
  rule_id: string;
  description: string;
  snippet: string;
  suggested_fix?: string;
  status: 'open' | 'acknowledged' | 'fixed';
  found_at: string;
}

interface OWASPRule {
  id: string;
  pattern: RegExp;
  category: OwaspCategory;
  severity: Severity;
  description: string;
  fix?: string;
}

// ── OWASP Top 10 Static Pattern Rules ───────────────────────
const RULES: OWASPRule[] = [
  // A03 — Injection
  {
    id: 'A03-SQL-CONCAT',
    pattern: /prepare\s*\(`[^`]*\$\{[^}]+\}[^`]*`\)|exec\s*\(`[^`]*\$\{[^}]+\}[^`]*`\)/,
    category: 'A03-Injection',
    severity: 'critical',
    description: 'Possible SQL injection via template literal in prepare/exec. Use parameterized queries with ? placeholders.',
    fix: 'Replace ${variable} in SQL strings with ? placeholders and pass values as arguments.',
  },
  {
    id: 'A03-EVAL',
    pattern: /\beval\s*\(/,
    category: 'A03-Injection',
    severity: 'critical',
    description: 'eval() is dangerous and can execute arbitrary code.',
    fix: 'Remove eval(). Use JSON.parse() for data, or import() for dynamic modules.',
  },
  {
    id: 'A03-CHILD-PROCESS-EXEC',
    pattern: /\bexec\s*\(\s*(?!db\.)(?!`SELECT|`INSERT|`UPDATE|`DELETE|`CREATE|`DROP|`ALTER|`PRAGMA)[^,)\n]+[+`]/,
    category: 'A03-Injection',
    severity: 'high',
    description: 'Shell command execution with dynamic string. Possible command injection.',
    fix: 'Use execFile() with an argument array, or use spawn() with explicit args.',
  },
  // A02 — Cryptographic Failures
  {
    id: 'A02-HARDCODED-SECRET',
    pattern: /(?:api_key|apikey|secret|password|token|credential)\s*[:=]\s*['"`][a-zA-Z0-9+/=_\-]{12,}['"`]/i,
    category: 'A02-CryptographicFailures',
    severity: 'critical',
    description: 'Possible hardcoded credential found. Credentials must come from environment variables.',
    fix: 'Move to environment variable: process.env.MY_SECRET. Never hardcode credentials.',
  },
  {
    id: 'A02-MD5-SHA1',
    pattern: /createHash\s*\(\s*['"`](md5|sha1)['"`]\s*\)/i,
    category: 'A02-CryptographicFailures',
    severity: 'high',
    description: 'MD5/SHA1 are cryptographically broken. Use SHA-256 or better for security hashing.',
    fix: 'Replace with createHash("sha256") or use bcrypt/argon2 for passwords.',
  },
  {
    id: 'A02-HTTP-CLEARTEXT',
    pattern: /(?:fetch|axios\.get|axios\.post|http\.request)\s*\(\s*['"`]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)/,
    category: 'A02-CryptographicFailures',
    severity: 'medium',
    description: 'Cleartext HTTP request to external host. Use HTTPS.',
    fix: 'Replace http:// with https://.',
  },
  // A05 — Security Misconfiguration
  {
    id: 'A05-DEBUG-EXPOSED',
    pattern: /debug\s*:\s*true|NODE_ENV\s*!==\s*['"`]production['"`]\s*&&.*(?:stack|debug)/i,
    category: 'A05-SecurityMisconfiguration',
    severity: 'medium',
    description: 'Debug mode or stack traces may be exposed in production.',
    fix: 'Gate debug output with process.env.NODE_ENV === "development" checks.',
  },
  {
    id: 'A05-CORS-WILDCARD',
    pattern: /origin\s*:\s*['"`]\*['"`]|cors\s*\(\s*\)/,
    category: 'A05-SecurityMisconfiguration',
    severity: 'medium',
    description: 'CORS wildcard (*) allows any origin. Restrict to known domains.',
    fix: 'Set origin to an allowlist: cors({ origin: ["https://myapp.com"] })',
  },
  // A07 — Identification and Authentication Failures
  {
    id: 'A07-JWT-NONE',
    pattern: /algorithm\s*:\s*['"`]none['"`]/i,
    category: 'A07-AuthFailures',
    severity: 'critical',
    description: 'JWT "none" algorithm allows unsigned tokens — trivial to forge.',
    fix: 'Use a strong algorithm like HS256 or RS256. Never allow "none".',
  },
  // A10 — SSRF
  {
    id: 'A10-SSRF-USER-URL',
    pattern: /fetch\s*\(\s*(?:req\.body|req\.query|req\.params)/,
    category: 'A10-SSRF',
    severity: 'high',
    description: 'Potential SSRF: fetching a URL directly from user input.',
    fix: 'Validate URL against an allowlist before making requests.',
  },
  // A09 — Logging
  {
    id: 'A09-LOGGING-SECRETS',
    pattern: /console\.(?:log|info|error|warn)\s*\([^)]*(?:password|secret|token|apiKey)/i,
    category: 'A09-LoggingFailures',
    severity: 'medium',
    description: 'Possible credential or secret being logged to console.',
    fix: 'Redact or remove credential logging. Use [REDACTED] placeholders.',
  },
];

function setKv(db: Database, key: string, value: string): void {
  try {
    db.prepare(`
      INSERT INTO app_kv (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `).run(key, value);
  } catch { /* ignore */ }
}

function collectTsFiles(dir: string, results: string[] = []): string[] {
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.git', 'coverage', '__snapshots__'].includes(entry.name)) continue;
      collectTsFiles(fullPath, results);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Scan server TypeScript source for OWASP Top 10 patterns.
 * Returns a list of findings and persists to app_kv.
 */
export function runSecurityCrawlerTick(
  db: Database,
  opts: { srcRoot?: string; maxFilesPerRun?: number } = {},
): { findings: SecurityFinding[]; files_scanned: number; open_findings: number; generated_at: string } {
  const generated_at = new Date().toISOString();
  const srcRoot = opts.srcRoot ?? path.join(process.cwd(), 'src');
  const maxFiles = opts.maxFilesPerRun ?? 100;

  const allFiles = collectTsFiles(srcRoot).slice(0, maxFiles);
  const findings: SecurityFinding[] = [];

  for (const filePath of allFiles) {
    let content: string;
    try { content = fs.readFileSync(filePath, 'utf-8'); } catch { continue; }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comment-only lines
      if (/^\s*\/\/|^\s*\*/.test(line)) continue;

      for (const rule of RULES) {
        if (rule.pattern.test(line)) {
          findings.push({
            id: randomUUID(),
            file_path: filePath,
            line_number: i + 1,
            owasp_category: rule.category,
            severity: rule.severity,
            rule_id: rule.id,
            description: rule.description,
            snippet: line.trim().slice(0, 200),
            suggested_fix: rule.fix,
            status: 'open',
            found_at: generated_at,
          });
          break; // One finding per line to avoid noise
        }
      }
    }
  }

  // Store findings in security_findings table if it exists, else just KV
  try {
    for (const f of findings) {
      db.prepare(`
        INSERT OR IGNORE INTO security_findings
          (id, file_path, line_number, owasp_category, severity, rule_id, description, snippet, suggested_fix, status, found_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(f.id, f.file_path, f.line_number, f.owasp_category, f.severity, f.rule_id,
             f.description, f.snippet, f.suggested_fix ?? null, f.status, f.found_at);
    }
  } catch { /* table doesn't exist yet — findings returned in-memory */ }

  const open_findings = findings.filter(f => f.status === 'open').length;

  setKv(db, 'security_crawler:last_run', generated_at);
  setKv(db, 'security_crawler:open_findings', String(open_findings));
  setKv(db, 'security_crawler:files_scanned', String(allFiles.length));
  setKv(db, 'security_crawler:critical_count',
    String(findings.filter(f => f.severity === 'critical').length));
  setKv(db, 'security_crawler:high_count',
    String(findings.filter(f => f.severity === 'high').length));

  // Store top findings summary in KV for dashboard
  const topFindings = findings
    .filter(f => f.severity === 'critical' || f.severity === 'high')
    .slice(0, 10)
    .map(f => ({ file: path.relative(srcRoot, f.file_path), line: f.line_number, rule: f.rule_id, severity: f.severity }));
  setKv(db, 'security_crawler:top_findings', JSON.stringify(topFindings));

  return { findings, files_scanned: allFiles.length, open_findings, generated_at };
}
