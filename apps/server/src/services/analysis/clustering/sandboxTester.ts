// ============================================
// Isolated Module Tester
// Ported from auto_rebuilder.py: test_module_in_sandbox
// Runs modules in child_process isolation with
// timeout, resource tracking, and safety scoring
// ============================================
import { fork, ChildProcess } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export interface SandboxConfig {
  timeout: number;           // ms, default 5000
  maxMemoryMb: number;       // default 500
  allowNetwork: boolean;     // default false
  safetyThreshold: number;   // 0-100, skip if below
}

export interface SandboxResult {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  memoryUsed: number;        // bytes
  importsUsed: string[];
  securityScore: number;
  compatible: boolean;
  error?: string;
}

const DEFAULT_CONFIG: SandboxConfig = {
  timeout: 5000,
  maxMemoryMb: 500,
  allowNetwork: false,
  safetyThreshold: 50,
};

/**
 * Test a module in an isolated child process.
 * Returns detailed compatibility report.
 */
export async function testInSandbox(
  modulePath: string,
  config: Partial<SandboxConfig> = {},
): Promise<SandboxResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();

  // Pre-safety check (fast fail)
  const safetyScore = quickSafetyCheck(modulePath);
  if (safetyScore < cfg.safetyThreshold) {
    return {
      success: false,
      exitCode: null,
      stdout: '',
      stderr: `Safety score ${safetyScore} below threshold ${cfg.safetyThreshold}`,
      durationMs: Date.now() - startTime,
      memoryUsed: 0,
      importsUsed: [],
      securityScore: safetyScore,
      compatible: false,
      error: 'Failed safety check',
    };
  }

  // Create a test wrapper script in temp directory
  const wrapperId = `sandbox_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const wrapperPath = join(tmpdir(), `${wrapperId}.mjs`);

  const wrapperCode = `
import { performance } from 'perf_hooks';
const start = performance.now();
const result = { imports: [], error: null, memory: 0 };

try {
  await import(${JSON.stringify('file://' + modulePath.replace(/\\/g, '/'))});
  result.memory = process.memoryUsage().heapUsed;
} catch (err) {
  result.error = err.message || String(err);
}

result.duration = performance.now() - start;
process.send?.(result);
process.exit(0);
`;

  writeFileSync(wrapperPath, wrapperCode, 'utf8');

  return new Promise<SandboxResult>((resolve) => {
    let stdout = '';
    let stderr = '';
    let resolved = false;

    const cleanup = () => {
      try { if (existsSync(wrapperPath)) unlinkSync(wrapperPath); } catch { /* ignore */ }
    };

    const finish = (result: SandboxResult) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(result);
    };

    try {
      const child: ChildProcess = fork(wrapperPath, [], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        execArgv: [`--max-old-space-size=${cfg.maxMemoryMb}`],
        timeout: cfg.timeout,
        silent: true,
      });

      child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

      child.on('message', (msg: any) => {
        const durationMs = Date.now() - startTime;
        finish({
          success: !msg.error,
          exitCode: 0,
          stdout, stderr,
          durationMs,
          memoryUsed: msg.memory || 0,
          importsUsed: msg.imports || [],
          securityScore: safetyScore,
          compatible: !msg.error && durationMs < cfg.timeout * 0.9,
          error: msg.error,
        });
      });

      child.on('error', (err) => {
        finish({
          success: false,
          exitCode: null,
          stdout, stderr,
          durationMs: Date.now() - startTime,
          memoryUsed: 0,
          importsUsed: [],
          securityScore: safetyScore,
          compatible: false,
          error: err.message,
        });
      });

      child.on('exit', (code) => {
        finish({
          success: code === 0,
          exitCode: code,
          stdout, stderr,
          durationMs: Date.now() - startTime,
          memoryUsed: 0,
          importsUsed: [],
          securityScore: safetyScore,
          compatible: code === 0,
        });
      });

      // Timeout kill
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* ignore */ }
        finish({
          success: false,
          exitCode: null,
          stdout, stderr,
          durationMs: cfg.timeout,
          memoryUsed: 0,
          importsUsed: [],
          securityScore: safetyScore,
          compatible: false,
          error: `Timeout after ${cfg.timeout}ms`,
        });
      }, cfg.timeout + 500);

    } catch (err: any) {
      cleanup();
      finish({
        success: false,
        exitCode: null,
        stdout: '', stderr: '',
        durationMs: Date.now() - startTime,
        memoryUsed: 0,
        importsUsed: [],
        securityScore: safetyScore,
        compatible: false,
        error: err.message,
      });
    }
  });
}

/**
 * Quick safety check without running the module.
 * Returns 0-100 score.
 */
function quickSafetyCheck(modulePath: string): number {
  try {
    const { readFileSync } = require('fs');
    const content = readFileSync(modulePath, 'utf8');
    let score = 100;

    const risky = [
      /\beval\s*\(/, /\bnew\s+Function\b/, /\bchild_process/,
      /\bprocess\.exit/, /\bfs\.\w*Sync.*unlink/i, /\brm\s+-rf/,
      /\bexec\(/, /\bspawn\(/, /require\(['"]child_process/,
    ];

    for (const pat of risky) {
      if (pat.test(content)) score -= 15;
    }

    return Math.max(0, score);
  } catch {
    return 0;
  }
}
