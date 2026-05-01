// ============================================
// Tool Executor — Wires the TerminalService into
// the agent loop so the LLM can execute commands.
//
// Production-hardened:
// - Session resurrection on death
// - Dangerous command blocking (comprehensive)
// - Exit code inference from output content
// - Command sanitization & logging
// - Per-command & total output caps
// - Timeout enforcement with cleanup
// ============================================
import { TerminalService } from '../../terminal/index.js';

type EmitFn = (event: any) => void;

/** A command the agent wants to execute */
export interface AgentCommand {
  /** Shell command to run */
  command: string;
  /** Working directory (relative to project root) */
  cwd?: string;
  /** Purpose of this command */
  purpose: string;
  /** Timeout in ms (default 30000) */
  timeoutMs?: number;
}

/** Result of executing a command */
export interface CommandResult {
  command: string;
  purpose: string;
  output: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  success: boolean;
  blocked: boolean;
  blockReason?: string;
}

/** Maximum commands per iteration to prevent abuse */
const MAX_COMMANDS_PER_ITERATION = 5;
/** Maximum output per single command (chars) */
const MAX_OUTPUT_PER_COMMAND = 3000;
/** Maximum total output to feed back across all commands (chars) */
const MAX_TOTAL_OUTPUT_CHARS = 8000;
/** Maximum command length (chars) — prevent prompt injection via mega-commands */
const MAX_COMMAND_LENGTH = 2000;
/** Default timeout per command (ms) */
const DEFAULT_TIMEOUT_MS = 30_000;
/** Max timeout the LLM can request (ms) — 2 minutes */
const MAX_TIMEOUT_MS = 120_000;

/**
 * Patterns that indicate a dangerous command.
 * Checked case-insensitively against the full command string.
 */
const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // Destructive filesystem operations
  { pattern: /rm\s+(-[a-z]*f[a-z]*\s+)?(-[a-z]*r[a-z]*\s+)?\//i, reason: 'Recursive delete from root' },
  { pattern: /rm\s+(-[a-z]*r[a-z]*\s+)?(-[a-z]*f[a-z]*\s+)?\//i, reason: 'Recursive delete from root' },
  { pattern: /del\s+\/s\s+\/q\s+[a-z]:\\/i, reason: 'Recursive delete of drive' },
  { pattern: /format\s+[a-z]:/i, reason: 'Format drive' },
  { pattern: /mkfs/i, reason: 'Format filesystem' },
  { pattern: /dd\s+if=\/dev\/(zero|random|urandom)/i, reason: 'Low-level disk write' },

  // Fork bombs & resource exhaustion
  { pattern: /:\(\)\{.*\|.*&\}.*;/i, reason: 'Fork bomb' },

  // System control
  { pattern: /\bshutdown\b/i, reason: 'System shutdown' },
  { pattern: /\breboot\b/i, reason: 'System reboot' },
  { pattern: /\binit\s+[06]\b/i, reason: 'System halt/reboot' },
  { pattern: /taskkill\s+\/f\s+\/im\s+(csrss|winlogon|lsass|system|svchost)/i, reason: 'Kill critical system process' },

  // Privilege escalation
  { pattern: /chmod\s+(-[a-z]*\s+)?[0-7]*777\s+\//i, reason: 'chmod 777 on root' },

  // Registry/system config
  { pattern: /reg\s+delete\s+hk(lm|cr|cu)\\.*\s+\/f/i, reason: 'Registry delete' },
  { pattern: /bcdedit/i, reason: 'Boot config edit' },

  // Network exfiltration / remote code execution
  { pattern: /curl\s+.*\|\s*(bash|sh|zsh|powershell)/i, reason: 'Remote code execution via curl pipe' },
  { pattern: /wget\s+.*\|\s*(bash|sh|zsh|powershell)/i, reason: 'Remote code execution via wget pipe' },
  { pattern: /curl\s+.*--data.*(\$\(|`)/i, reason: 'Data exfiltration via curl' },

  // Credential theft
  { pattern: /cat\s+.*\/(\.env|\.pem|\.key|credentials|shadow|passwd)\b/i, reason: 'Reading credential files' },

  // Crypto mining
  { pattern: /xmrig|minerd|cpuminer|ethminer/i, reason: 'Cryptocurrency mining' },
];

/**
 * Commands that are always safe and commonly requested by agents.
 * If a command starts with one of these, skip the dangerous check.
 */
const SAFE_PREFIXES = [
  'npm ', 'npx ', 'pnpm ', 'yarn ', 'bun ',
  'node ', 'ts-node ', 'tsx ',
  'python ', 'python3 ', 'pip ', 'pip3 ',
  'cargo ', 'go ', 'rustc ',
  'git status', 'git log', 'git diff', 'git branch', 'git add', 'git commit',
  'cat ', 'type ', 'head ', 'tail ',
  'ls ', 'dir ', 'find ', 'grep ', 'rg ',
  'echo ', 'printf ',
  'mkdir ', 'touch ', 'cp ', 'mv ',
  'cd ', 'pwd', 'which ', 'where ',
  'tsc ', 'eslint ', 'prettier ', 'vitest ', 'jest ', 'mocha ',
];

export class ToolExecutor {
  private terminalService: TerminalService;
  private agentSessionId: string | null = null;
  private projectRoot: string;
  private totalCommandsExecuted = 0;
  private totalCommandsBlocked = 0;

  constructor(projectRoot: string) {
    this.terminalService = new TerminalService();
    this.projectRoot = projectRoot;
  }

  /**
   * Execute a batch of commands from the agent's structured output.
   * Returns structured results + LLM-formatted output.
   */
  async executeCommands(
    commands: AgentCommand[],
    emit: EmitFn,
  ): Promise<{ results: CommandResult[]; formattedForLLM: string }> {
    if (!commands || commands.length === 0) {
      return { results: [], formattedForLLM: '' };
    }

    // Validate & limit commands
    const toExecute = commands.slice(0, MAX_COMMANDS_PER_ITERATION);
    if (commands.length > MAX_COMMANDS_PER_ITERATION) {
      emit({
        type: 'info',
        message: `Tool executor: Capped at ${MAX_COMMANDS_PER_ITERATION} commands (${commands.length} requested)`,
      });
    }

    // Ensure agent terminal session exists (with resurrection)
    await this.ensureSession(emit);
    if (!this.agentSessionId) {
      return {
        results: [this.errorResult(toExecute[0], Date.now(), 'Failed to create terminal session')],
        formattedForLLM: '--- COMMAND EXECUTION RESULTS ---\nERROR: Failed to create terminal session\n--- END COMMAND RESULTS ---\n',
      };
    }

    const results: CommandResult[] = [];
    let totalOutputChars = 0;

    for (const cmd of toExecute) {
      // Sanitize command
      const sanitized = this.sanitizeCommand(cmd.command);
      if (!sanitized) {
        results.push(this.blockedResult(cmd, 'Empty or invalid command'));
        continue;
      }

      // Length check
      if (sanitized.length > MAX_COMMAND_LENGTH) {
        results.push(this.blockedResult(cmd, `Command too long (${sanitized.length} > ${MAX_COMMAND_LENGTH} chars)`));
        continue;
      }

      // Safety check — block dangerous commands
      const dangerCheck = this.isDangerous(sanitized);
      if (dangerCheck) {
        this.totalCommandsBlocked++;
        emit({
          type: 'tool_blocked',
          command: sanitized.slice(0, 200),
          reason: dangerCheck,
        });
        results.push(this.blockedResult(cmd, dangerCheck));
        continue;
      }

      // Enforce timeout bounds
      const timeoutMs = Math.min(
        Math.max(cmd.timeoutMs || DEFAULT_TIMEOUT_MS, 1000),
        MAX_TIMEOUT_MS,
      );

      emit({
        type: 'tool_executing',
        command: sanitized.slice(0, 200),
        purpose: cmd.purpose,
        timeoutMs,
      });

      const startTime = Date.now();
      try {
        // Execute with session resurrection on failure
        let execResult: { output: string; exitHint: boolean };
        try {
          execResult = await this.terminalService.execInSession(
            this.agentSessionId!,
            sanitized,
            timeoutMs,
          );
        } catch (sessionErr: any) {
          // Session might have died — try to resurrect once
          if (sessionErr.message?.includes('not alive') || sessionErr.message?.includes('Session not')) {
            emit({ type: 'info', message: 'Tool executor: Session died, resurrecting...' });
            this.agentSessionId = null;
            await this.ensureSession(emit);
            if (!this.agentSessionId) {
              results.push(this.errorResult(cmd, startTime, 'Failed to resurrect terminal session'));
              continue;
            }
            execResult = await this.terminalService.execInSession(
              this.agentSessionId!,
              sanitized,
              timeoutMs,
            );
          } else {
            throw sessionErr;
          }
        }

        const durationMs = Date.now() - startTime;
        const outputBudget = Math.min(MAX_OUTPUT_PER_COMMAND, MAX_TOTAL_OUTPUT_CHARS - totalOutputChars);
        // Always keep at least 200 chars so error messages aren't lost
        let truncatedOutput = execResult.output.slice(0, Math.max(outputBudget, 200));
        totalOutputChars += truncatedOutput.length;

        // Infer exit code from output (sentinel approach doesn't give real $?)
        const exitCode = this.inferExitCode(truncatedOutput, execResult.exitHint);
        const success = !execResult.exitHint && exitCode === 0;

        this.totalCommandsExecuted++;

        // Preview-first feedback loop: if this looks like a dev/start command,
        // try to resolve a reachable localhost URL and emit it to the UI.
        if (success && this.looksLikeServerCommand(sanitized)) {
          const url = this.extractPreviewUrl(truncatedOutput) || await this.detectReachableLocalUrl();
          if (url) {
            emit({ type: 'server_started', url, command: sanitized.slice(0, 200) });
            emit({ type: 'preview_url', url, source: 'tool_executor' });
            try {
              const health = await this.checkPreviewHealth(url);
              emit({
                type: 'runtime_check',
                stage: 'preview',
                success: health.success,
                url,
                statusCode: health.statusCode,
                bodyLength: health.bodyLength,
              });
              truncatedOutput += `\n\n[preview-check] ${url} -> ${health.success ? 'OK' : 'FAIL'} (${health.statusCode ?? 'n/a'})`;
            } catch {
              // best-effort
            }
          }
        }

        results.push({
          command: sanitized,
          purpose: cmd.purpose,
          output: truncatedOutput,
          exitCode,
          timedOut: execResult.exitHint,
          durationMs,
          success,
          blocked: false,
        });

        emit({
          type: 'tool_result',
          command: sanitized.slice(0, 100),
          success,
          exitCode,
          timedOut: execResult.exitHint,
          durationMs,
          outputLength: truncatedOutput.length,
          outputSnippet: truncatedOutput.slice(0, 200),
        });

      } catch (err: any) {
        results.push(this.errorResult(cmd, startTime, err.message));
        emit({
          type: 'tool_result',
          command: sanitized.slice(0, 100),
          success: false,
          durationMs: Date.now() - startTime,
          error: err.message,
        });
      }

      // Stop if we've accumulated too much output
      if (totalOutputChars >= MAX_TOTAL_OUTPUT_CHARS) {
        emit({ type: 'info', message: 'Tool executor: Output cap reached, skipping remaining commands' });
        break;
      }
    }

    const formattedForLLM = this.formatForLLM(results);
    return { results, formattedForLLM };
  }

  /** Ensure an agent terminal session exists, creating or resurrecting if needed */
  private async ensureSession(emit: EmitFn): Promise<void> {
    // Check if existing session is still alive
    if (this.agentSessionId) {
      const sessions = this.terminalService.listSessions();
      const existing = sessions.find(s => s.id === this.agentSessionId);
      if (existing?.alive) return;
      emit({ type: 'info', message: 'Tool executor: Previous session died, creating new one' });
      this.agentSessionId = null;
    }

    try {
      const session = this.terminalService.createSession({
        label: 'Agent Tool Executor',
        cwd: this.projectRoot,
        owner: 'agent',
      });
      this.agentSessionId = session.id;
      emit({ type: 'info', message: 'Tool executor: Terminal session ready (' + session.id + ')' });
      // Give the shell a moment to initialize
      await new Promise(r => setTimeout(r, 500));
    } catch (err: any) {
      emit({ type: 'error', error: 'Tool executor: Failed to create terminal: ' + err.message });
      this.agentSessionId = null;
    }
  }

  /** Format command results for injection into the next LLM iteration */
  formatForLLM(results: CommandResult[]): string {
    if (results.length === 0) return '';

    let output = '\n--- COMMAND EXECUTION RESULTS ---\n';
    for (const r of results) {
      output += `\n> ${r.command}\n`;
      output += `Purpose: ${r.purpose}\n`;

      if (r.blocked) {
        output += `Status: 🚫 BLOCKED — ${r.blockReason}\n`;
      } else if (r.timedOut) {
        output += `Status: ⏱️ Timed out after ${r.durationMs}ms\n`;
      } else if (r.success) {
        output += `Status: ✅ Success (${r.durationMs}ms)\n`;
      } else {
        output += `Status: ❌ Failed (exit ${r.exitCode ?? '?'}, ${r.durationMs}ms)\n`;
      }

      if (r.output && !r.blocked) {
        output += `Output:\n${r.output}\n`;
      }
    }

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success && !r.blocked).length;
    const blocked = results.filter(r => r.blocked).length;
    output += `\nTotals: ${succeeded} succeeded, ${failed} failed, ${blocked} blocked`;
    output += '\n--- END COMMAND RESULTS ---\n';
    return output;
  }

  /** Sanitize a command string */
  private sanitizeCommand(command: string): string {
    if (!command || typeof command !== 'string') return '';
    return command
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // strip control chars (keep \n \r \t)
      .trim();
  }

  /**
   * Check if a command is dangerous. Returns reason string if blocked, null if safe.
   * Two-phase: safe prefix fast-path, then dangerous pattern scan.
   */
  isDangerous(command: string): string | null {
    const lower = command.toLowerCase().trim();

    // Phase 1: Safe prefix fast-path
    for (const prefix of SAFE_PREFIXES) {
      if (lower.startsWith(prefix)) return null;
    }

    // Phase 2: Dangerous patterns
    for (const { pattern, reason } of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        return reason;
      }
    }

    // Phase 3: Heuristic checks
    // Excessive path traversal
    const traversalCount = (command.match(/\.\.\//g) || []).length;
    if (traversalCount > 5) {
      return 'Excessive path traversal (../ x' + traversalCount + ')';
    }

    // Dynamic eval/exec with variable expansion
    if (/\beval\b.*\$[\({]/.test(command) || /\bexec\b.*\$[\({]/.test(command)) {
      return 'Dynamic eval/exec with variable expansion';
    }

    return null;
  }

  /** Infer exit code from output content since sentinel approach doesn't capture $? */
  private inferExitCode(output: string, timedOut: boolean): number | null {
    if (timedOut) return null;

    const lower = output.toLowerCase();
    const errorIndicators = [
      'error:', 'error ts', 'fatal:', 'enoent',
      'command not found', 'is not recognized',
      'cannot find module', 'failed to compile',
      'build failed', 'exited with code 1',
      'exit code 1', 'npm err!', 'errno',
      'permission denied', 'access denied',
      'segmentation fault', 'core dumped',
      'syntaxerror', 'referenceerror', 'typeerror',
    ];

    for (const indicator of errorIndicators) {
      if (lower.includes(indicator)) return 1;
    }

    return 0;
  }

  /** Identify commands likely to start a local app preview server. */
  private looksLikeServerCommand(command: string): boolean {
    const c = command.toLowerCase();
    return (
      /\b(npm|pnpm|yarn)\s+(run\s+)?(dev|start|serve)\b/.test(c) ||
      /\b(vite|next|nuxt|astro)\s+(dev|start|preview)\b/.test(c) ||
      /\buvicorn\b|\bflask\s+run\b|\bpython\s+.*main\.py\b/.test(c)
    );
  }

  /** Parse localhost URL from command output if present. */
  private extractPreviewUrl(output: string): string | null {
    const match = output.match(/https?:\/\/(localhost|127\.0\.0\.1):\d{2,5}/i);
    return match?.[0] || null;
  }

  /** Probe common local dev ports for a reachable preview URL. */
  private async detectReachableLocalUrl(): Promise<string | null> {
    const ports = [5173, 5174, 3000, 3001, 4173, 8080];
    for (const port of ports) {
      try {
        const url = `http://localhost:${port}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
        if (res.ok || (res.status >= 200 && res.status < 500)) return url;
      } catch {
        // try next port
      }
    }
    return null;
  }

  private async checkPreviewHealth(url: string): Promise<{ success: boolean; statusCode?: number; bodyLength: number }> {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    const text = await res.text();
    return {
      success: res.status >= 200 && res.status < 400,
      statusCode: res.status,
      bodyLength: text.length,
    };
  }

  /** Create a blocked result */
  private blockedResult(cmd: AgentCommand, reason: string): CommandResult {
    return {
      command: cmd.command.slice(0, 200),
      purpose: cmd.purpose,
      output: '',
      exitCode: null,
      timedOut: false,
      durationMs: 0,
      success: false,
      blocked: true,
      blockReason: reason,
    };
  }

  /** Create an error result */
  private errorResult(cmd: AgentCommand, startTime: number, errorMessage: string): CommandResult {
    return {
      command: cmd.command,
      purpose: cmd.purpose,
      output: 'ERROR: ' + errorMessage,
      exitCode: 1,
      timedOut: false,
      durationMs: Date.now() - startTime,
      success: false,
      blocked: false,
    };
  }

  /** Get execution stats */
  getStats(): { totalExecuted: number; totalBlocked: number; sessionAlive: boolean } {
    const sessions = this.terminalService.listSessions();
    const alive = this.agentSessionId
      ? sessions.some(s => s.id === this.agentSessionId && s.alive)
      : false;
    return {
      totalExecuted: this.totalCommandsExecuted,
      totalBlocked: this.totalCommandsBlocked,
      sessionAlive: alive,
    };
  }

  /** Clean up terminal resources */
  destroy(): void {
    if (this.agentSessionId) {
      try { this.terminalService.destroySession(this.agentSessionId); } catch { /* ignore */ }
      this.agentSessionId = null;
    }
    this.terminalService.destroyAll();
  }

  /** Get the underlying terminal service for direct access */
  getTerminalService(): TerminalService {
    return this.terminalService;
  }
}
