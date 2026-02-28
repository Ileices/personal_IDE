// ============================================
// System Command Detector
// Ported from auto_rebuilder.py: detect_system_commands
// Detects all forms of external process execution,
// container ops, task schedulers, FFI, and eval/exec
// ============================================

export interface SystemCommand {
  type: 'subprocess' | 'container' | 'scheduler' | 'ffi' | 'eval' | 'shell';
  pattern: string;
  line: number;
  severity: 'info' | 'warn' | 'critical';
  description: string;
}

// Subprocess patterns
const SUBPROCESS_PATTERNS = [
  /child_process\.(exec|spawn|fork|execFile|execSync|spawnSync)/,
  /\bexecSync\b/, /\bspawnSync\b/, /\bexec\(/, /\bspawn\(/,
  /\bshelljs\b/, /\bexeca\b/, /\bcross-spawn\b/,
  /new\s+Worker\(/, /worker_threads/,
];

// Container & remote execution patterns
const CONTAINER_PATTERNS = [
  /docker\s+(run|exec|build|compose|pull|push)/i,
  /kubectl\s+(apply|exec|run|delete|create)/i,
  /\bssh\b.*\bexec/, /\bfabric\b/, /\bvagrant\b/,
  /\bansible\b/, /\bterraform\b/, /\bpulumi\b/,
];

// Task scheduler patterns
const SCHEDULER_PATTERNS = [
  /\bcron\b/, /\bnode-schedule\b/, /\bbull\b/, /\bbullmq\b/,
  /\bagenda\b/, /\bnode-cron\b/, /\bbree\b/,
  /setInterval\s*\(.*\d{4,}/, // setInterval with >1s delay = likely scheduler
];

// FFI / native patterns
const FFI_PATTERNS = [
  /\bffi-napi\b/, /\bref-napi\b/, /\bnode-gyp\b/,
  /\bnapi\b/, /\bwasm\b/, /WebAssembly\./,
  /\.node['"]/, /\bbindings\b\(/,
];

// Eval / dynamic execution patterns
const EVAL_PATTERNS = [
  /\beval\s*\(/, /\bFunction\s*\(/, /\bnew\s+Function\b/,
  /\bvm\.runIn/, /\bvm\.createContext/,
  /\bvm2\b/, /\bisolated-vm\b/,
];

// Shell indicators in string literals
const SHELL_INDICATORS = [
  /['"`].*\b(bash|sh|zsh|powershell|cmd)\b.*['"`]/i,
  /['"`].*\/(bin|usr\/bin)\//,
  /['"`].*\bsudo\b/,
  /['"`].*\b(npm|npx|yarn|pnpm)\s+/,
  /['"`].*\b(pip|python|node|ruby|java|gcc|make|cargo)\b/,
];

/**
 * Scan source code for system command usage.
 * Returns categorized list of all detected commands.
 */
export function detectSystemCommands(source: string, filePath?: string): SystemCommand[] {
  const lines = source.split('\n');
  const results: SystemCommand[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Skip comments
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

    // Check subprocess patterns
    for (const pat of SUBPROCESS_PATTERNS) {
      if (pat.test(line)) {
        results.push({
          type: 'subprocess',
          pattern: pat.source,
          line: lineNum,
          severity: 'warn',
          description: `Process execution: ${extractMatch(line, pat)}`,
        });
      }
    }

    // Check container patterns
    for (const pat of CONTAINER_PATTERNS) {
      if (pat.test(line)) {
        results.push({
          type: 'container',
          pattern: pat.source,
          line: lineNum,
          severity: 'warn',
          description: `Container/remote execution: ${extractMatch(line, pat)}`,
        });
      }
    }

    // Check scheduler patterns
    for (const pat of SCHEDULER_PATTERNS) {
      if (pat.test(line)) {
        results.push({
          type: 'scheduler',
          pattern: pat.source,
          line: lineNum,
          severity: 'info',
          description: `Task scheduler: ${extractMatch(line, pat)}`,
        });
      }
    }

    // Check FFI patterns
    for (const pat of FFI_PATTERNS) {
      if (pat.test(line)) {
        results.push({
          type: 'ffi',
          pattern: pat.source,
          line: lineNum,
          severity: 'warn',
          description: `Native/FFI binding: ${extractMatch(line, pat)}`,
        });
      }
    }

    // Check eval patterns
    for (const pat of EVAL_PATTERNS) {
      if (pat.test(line)) {
        results.push({
          type: 'eval',
          pattern: pat.source,
          line: lineNum,
          severity: 'critical',
          description: `Dynamic code execution: ${extractMatch(line, pat)}`,
        });
      }
    }

    // Check shell indicators in strings
    for (const pat of SHELL_INDICATORS) {
      if (pat.test(line)) {
        results.push({
          type: 'shell',
          pattern: pat.source,
          line: lineNum,
          severity: 'info',
          description: `Shell command string: ${extractMatch(line, pat)}`,
        });
      }
    }
  }

  return results;
}

/** Summary of system command usage in a file */
export function summarizeCommands(commands: SystemCommand[]): string {
  if (commands.length === 0) return 'No system commands detected.';

  const byCat: Record<string, number> = {};
  for (const cmd of commands) {
    byCat[cmd.type] = (byCat[cmd.type] || 0) + 1;
  }
  const critical = commands.filter(c => c.severity === 'critical').length;

  let summary = `Found ${commands.length} system command(s): `;
  summary += Object.entries(byCat).map(([k, v]) => `${k}(${v})`).join(', ');
  if (critical > 0) summary += ` ⚠️ ${critical} CRITICAL`;
  return summary;
}

function extractMatch(line: string, pattern: RegExp): string {
  const m = line.match(pattern);
  return m ? m[0].slice(0, 60) : line.trim().slice(0, 60);
}
