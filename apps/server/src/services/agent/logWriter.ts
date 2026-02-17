// ============================================
// Log Writer Service - Persistent event logging
// Dumps all agent events to .ide-logs/ with timestamps
// ============================================
import * as fs from 'fs';
import * as path from 'path';

export class LogWriter {
  private logDir: string;
  private currentLogFile: string;
  private writeStream: fs.WriteStream | null = null;

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

    try {
      fs.appendFileSync(this.currentLogFile, line);
    } catch {
      // If log write fails, don't crash the agent
    }
  }

  /** Write a human-readable summary line */
  logSummary(message: string): void {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}\n`;
    try {
      fs.appendFileSync(this.currentLogFile, line);
    } catch { /* non-critical */ }
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
      fs.writeFileSync(detailFile, JSON.stringify(data, null, 2));
    } catch { /* non-critical */ }
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
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
  }
}

interface LogEntry {
  timestamp: string;
  type: string;
  data: any;
}
