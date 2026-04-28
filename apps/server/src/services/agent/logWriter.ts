// ============================================
// Log Writer Service - Persistent event logging
// Dumps all agent events to .ide-logs/ with timestamps
// ============================================
import * as fs from 'fs';
import * as path from 'path';

export class LogWriter {
  private logDir: string;
  private currentLogFile: string;
  private pendingLines: string[] = [];
  private flushScheduled = false;

  constructor(projectRoot: string) {
    this.logDir = path.join(projectRoot, '.ide-logs');
    this.ensureLogDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    this.currentLogFile = path.join(this.logDir, `agent-run-${timestamp}.log`);
  }

  private ensureLogDir(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    // Add .gitignore if not present
    const gitignorePath = path.join(this.logDir, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, '# Auto-generated - IDE logs\n*\n!.gitignore\n');
    }
  }

  /** Log an event with full detail */
  logEvent(event: any): void {
    const timestamp = new Date().toISOString();
    const entry: LogEntry = {
      timestamp,
      type: event.type || 'unknown',
      data: event,
    };

    const line = JSON.stringify(entry) + '\n';
    this.enqueueLine(line);
  }

  /** Write a human-readable summary line */
  logSummary(message: string): void {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}\n`;
    this.enqueueLine(line);
  }

  /** Write the full LLM prompt and response for debugging */
  logLLMCall(data: {
    iteration: number;
    model: string;
    provider?: string;
    messages?: Array<{ role: string; content: string }>;
    response?: string;
    error?: string;
    tokensUsed?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    taskSnippet?: string;
    responseSnippet?: string;
    chunked?: boolean;
  }): void {
    const detailFile = path.join(
      this.logDir,
      `llm-call-${data.iteration}-${Date.now()}.json`
    );
    try {
      fs.writeFile(detailFile, JSON.stringify(data, null, 2), () => {});
    } catch { /* non-critical */ }
  }

  private enqueueLine(line: string): void {
    this.pendingLines.push(line);
    // Prevent unbounded memory growth if disk is unavailable.
    if (this.pendingLines.length > 5000) {
      this.pendingLines.splice(0, this.pendingLines.length - 5000);
    }
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    setImmediate(() => this.flushPending());
  }

  private flushPending(): void {
    this.flushScheduled = false;
    if (this.pendingLines.length === 0) return;

    const payload = this.pendingLines.join('');
    this.pendingLines = [];

    fs.appendFile(this.currentLogFile, payload, () => {
      // Best effort only — logging must never affect agent execution.
    });

    if (this.pendingLines.length > 0) {
      this.scheduleFlush();
    }
  }

  /** Get the path to the current log file */
  getLogPath(): string {
    return this.currentLogFile;
  }

  /** Get the log directory path */
  getLogDir(): string {
    return this.logDir;
  }

  /** List all log files */
  listLogs(): string[] {
    try {
      return fs.readdirSync(this.logDir)
        .filter(f => f.endsWith('.log') || f.endsWith('.json'))
        .sort()
        .reverse();
    } catch {
      return [];
    }
  }

  /** Read a specific log file */
  readLog(filename: string): string {
    const filePath = path.join(this.logDir, filename);
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf-8');
  }

  close(): void {
    if (this.pendingLines.length > 0) {
      try {
        const payload = this.pendingLines.join('');
        this.pendingLines = [];
        fs.appendFileSync(this.currentLogFile, payload);
      } catch {
        // Best effort flush.
      }
    }
  }
}

interface LogEntry {
  timestamp: string;
  type: string;
  data: any;
}
