// ============================================
// Safety Scorer — rates code for security risk.
// Ported from auto_rebuilder.py assess_code_safety()
// Works on any language, focuses on patterns
// that indicate file/network/process access.
// ============================================

export interface SafetyReport {
  score: number;           // 0–100, higher = safer
  risks: SafetyRisk[];
  isolationNeeded: boolean;
  recommendations: string[];
}

export interface SafetyRisk {
  pattern: string;
  severity: number;  // 1-3
  line?: number;
  description: string;
}

interface RiskyPattern {
  regex: RegExp;
  severity: number;
  description: string;
}

const RISKY_PATTERNS: RiskyPattern[] = [
  // Process execution
  { regex: /\beval\s*\(/g, severity: 3, description: 'eval() call — arbitrary code execution' },
  { regex: /\bexec\s*\(/g, severity: 3, description: 'exec() call — arbitrary code execution' },
  { regex: /child_process|spawn|execSync|execFile/g, severity: 2, description: 'Child process spawning' },
  { regex: /os\.(system|popen|exec)/g, severity: 2, description: 'OS command execution' },
  { regex: /subprocess\.(run|call|Popen)/g, severity: 2, description: 'Subprocess execution' },
  { regex: /\bProcess\b.*\bkill\b/g, severity: 2, description: 'Process termination' },

  // File system
  { regex: /\b(rmSync|unlinkSync|rmdirSync|rimraf)\b/g, severity: 2, description: 'Destructive file deletion' },
  { regex: /shutil\.(rmtree|move|copy)/g, severity: 1, description: 'Bulk file operations' },
  { regex: /writeFileSync|fs\.write/g, severity: 1, description: 'File writing' },

  // Network
  { regex: /\bfetch\s*\(|http\.request|https\.request/g, severity: 1, description: 'Network request' },
  { regex: /\.listen\s*\(\s*\d+/g, severity: 1, description: 'Port binding' },
  { regex: /socket\.(connect|bind)/g, severity: 1, description: 'Raw socket usage' },

  // Dynamic loading
  { regex: /__import__\s*\(/g, severity: 2, description: 'Dynamic import' },
  { regex: /importlib\.(import_module|util)/g, severity: 1, description: 'Dynamic module loading' },
  { regex: /require\s*\(\s*[^'"]/g, severity: 2, description: 'Dynamic require — variable path' },

  // Environment
  { regex: /process\.env|os\.environ/g, severity: 1, description: 'Environment variable access' },
  { regex: /\.exit\s*\(/g, severity: 1, description: 'Process exit call' },
];

/**
 * Score a code string for security risk (0–100, higher = safer).
 * Does not execute the code — purely static pattern analysis.
 */
export function assessCodeSafety(code: string, filePath = ''): SafetyReport {
  const risks: SafetyRisk[] = [];
  let deductions = 0;
  const lines = code.split('\n');

  for (const rp of RISKY_PATTERNS) {
    // Reset regex state
    rp.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rp.regex.exec(code)) !== null) {
      // Find the line number
      const beforeMatch = code.slice(0, match.index);
      const lineNum = beforeMatch.split('\n').length;

      risks.push({
        pattern: match[0],
        severity: rp.severity,
        line: lineNum,
        description: rp.description,
      });
      deductions += rp.severity * 8;
    }
  }

  // Global state pollution check
  const globalCount = (code.match(/\bglobal\s+\w/g) || []).length;
  if (globalCount > 5) {
    risks.push({ pattern: 'many globals', severity: 1, description: `${globalCount} global declarations — state pollution risk` });
    deductions += 5;
  }

  // Wildcard import
  const wildcards = (code.match(/from\s+\S+\s+import\s+\*/g) || []).length;
  if (wildcards > 0) {
    risks.push({ pattern: 'import *', severity: 1, description: `${wildcards} wildcard imports — namespace pollution` });
    deductions += wildcards * 3;
  }

  const score = Math.max(0, Math.min(100, 100 - deductions));
  const isolationNeeded = score < 50 || risks.some(r => r.severity >= 3);

  const recommendations: string[] = [];
  if (isolationNeeded) recommendations.push('Run in sandboxed subprocess');
  if (risks.some(r => r.description.includes('exec'))) recommendations.push('Replace eval/exec with structured parsing');
  if (risks.some(r => r.description.includes('file'))) recommendations.push('Sandbox file operations to project root');
  if (risks.some(r => r.description.includes('Network'))) recommendations.push('Gate network requests behind user approval');

  return { score, risks, isolationNeeded, recommendations };
}
