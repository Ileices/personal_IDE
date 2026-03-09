// ============================================
// Tool Executor — Wires the TerminalService into
// the agent loop so the LLM can execute commands.
//
// Parses "commands" from structured output,
// executes them via TerminalService, captures
// output, and returns results for the next iteration.
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
  /** Whether to capture output for next iteration */
  captureOutput?: boolean;
}

/** Result of executing a command */
export interface CommandResult {
  command: string;
  purpose: string;
  output: string;
  timedOut: boolean;
  durationMs: number;
  success: boolean;
}

/** Maximum commands per iteration to prevent abuse */
const MAX_COMMANDS_PER_ITERATION = 5;
/** Maximum total output to feed back (prevent context bloat) */
const MAX_OUTPUT_CHARS = 4000;

export class ToolExecutor {
  private terminalService: TerminalService;
  private agentSessionId: string | null = null;
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.terminalService = new TerminalService();
    this.projectRoot = projectRoot;
  }

  /**
   * Execute a batch of commands from the agent's structured output.
   * Returns formatted results for injection into the next iteration.
   */
  async executeCommands(
    commands: AgentCommand[],
    emit: EmitFn,
  ): Promise<{ results: CommandResult[]; formattedForLLM: string }> {
    if (!commands || commands.length === 0) {
      return { results: [], formattedForLLM: '' };
    }

    // Limit commands per iteration
    const toExecute = commands.slice(0, MAX_COMMANDS_PER_ITERATION);
    if (commands.length > MAX_COMMANDS_PER_ITERATION) {
      emit({
        type: 'info',
        message: `Tool executor: Capped at ${MAX_COMMANDS_PER_ITERATION} commands (${commands.length} requested)`,
      });
    }

    // Ensure agent terminal session exists
    if (!this.agentSessionId) {
      try {
        const session = this.terminalService.createSession({
          label: 'Agent Tool Executor',
          cwd: this.projectRoot,
          owner: 'agent',
        });
        this.agentSessionId = session.id;
        emit({ type: 'info', message: 'Tool executor: Created agent terminal session' });
      } catch (err: any) {
        emit({ type: 'error', error: 'Tool executor: Failed to create terminal: ' + err.message });
        return { results: [], formattedForLLM: '' };
      }
    }

    const results: CommandResult[] = [];
    let totalOutputChars = 0;

    for (const cmd of toExecute) {
      // Safety check — block dangerous commands
      if (this.isDangerous(cmd.command)) {
        emit({
          type: 'info',
          message: `Tool executor: BLOCKED dangerous command: ${cmd.command.slice(0, 100)}`,
        });
        results.push({
          command: cmd.command,
          purpose: cmd.purpose,
          output: 'BLOCKED: This command was blocked for safety reasons.',
          timedOut: false,
          durationMs: 0,
          success: false,
        });
        continue;
      }

      emit({
        type: 'tool_executing',
        command: cmd.command.slice(0, 200),
        purpose: cmd.purpose,
      });

      const startTime = Date.now();
      try {
        const { output, exitHint } = await this.terminalService.execInSession(
          this.agentSessionId!,
          cmd.command,
          cmd.timeoutMs || 30000,
        );
        const durationMs = Date.now() - startTime;
        const truncatedOutput = output.slice(0, MAX_OUTPUT_CHARS - totalOutputChars);
        totalOutputChars += truncatedOutput.length;

        results.push({
          command: cmd.command,
          purpose: cmd.purpose,
          output: truncatedOutput,
          timedOut: exitHint,
          durationMs,
          success: !exitHint,
        });

        emit({
          type: 'tool_result',
          command: cmd.command.slice(0, 100),
          success: !exitHint,
          durationMs,
          outputSnippet: truncatedOutput.slice(0, 200),
        });
      } catch (err: any) {
        const durationMs = Date.now() - startTime;
        results.push({
          command: cmd.command,
          purpose: cmd.purpose,
          output: 'ERROR: ' + err.message,
          timedOut: false,
          durationMs,
          success: false,
        });
        emit({
          type: 'tool_result',
          command: cmd.command.slice(0, 100),
          success: false,
          durationMs,
          error: err.message,
        });
      }

      // Stop if we've accumulated too much output
      if (totalOutputChars >= MAX_OUTPUT_CHARS) break;
    }

    // Format results for LLM consumption
    const formattedForLLM = this.formatForLLM(results);
    return { results, formattedForLLM };
  }

  /** Format command results for injection into the next LLM iteration */
  private formatForLLM(results: CommandResult[]): string {
    if (results.length === 0) return '';

    let output = '\n--- COMMAND EXECUTION RESULTS ---\n';
    for (const r of results) {
      output += `\n> ${r.command}\n`;
      output += `Purpose: ${r.purpose}\n`;
      output += `Status: ${r.success ? '✅ Success' : r.timedOut ? '⏱️ Timed out' : '❌ Failed'} (${r.durationMs}ms)\n`;
      if (r.output) {
        output += `Output:\n${r.output}\n`;
      }
    }
    output += '--- END COMMAND RESULTS ---\n';
    return output;
  }

  /** Check if a command is dangerous */
  private isDangerous(command: string): boolean {
    const lower = command.toLowerCase().trim();
    const dangerous = [
      'rm -rf /', 'del /s /q c:', 'format c:',
      'mkfs', ':(){:|:&};:', 'dd if=/dev/',
      'chmod -r 777 /', 'shutdown', 'reboot',
      'taskkill /f /im', 'net stop', 'reg delete',
    ];
    return dangerous.some(d => lower.includes(d));
  }

  /** Clean up terminal resources */
  destroy(): void {
    if (this.agentSessionId) {
      try {
        this.terminalService.destroySession(this.agentSessionId);
      } catch { /* ignore */ }
    }
    this.terminalService.destroyAll();
  }

  /** Get the underlying terminal service for direct access */
  getTerminalService(): TerminalService {
    return this.terminalService;
  }
}
