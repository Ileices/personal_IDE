// ============================================
// Terminal Service — manages shell sessions for
// both user interaction and LLM command execution.
// Uses child_process (no node-pty dependency).
// ============================================
import { spawn, ChildProcess, execSync } from 'child_process';
import { platform } from 'os';
import { EventEmitter } from 'events';

export interface TerminalSession {
  id: string;
  label: string;
  cwd: string;
  shell: string;
  /** 'user' = interactive user terminal, 'agent' = LLM-controlled */
  owner: 'user' | 'agent';
  alive: boolean;
  createdAt: string;
}

export interface TerminalOutput {
  sessionId: string;
  data: string;
  stream: 'stdout' | 'stderr';
  timestamp: string;
}

interface ManagedSession extends TerminalSession {
  process: ChildProcess | null;
  buffer: string[];          // rolling output buffer (capped)
  emitter: EventEmitter;
}

const MAX_BUFFER_LINES = 2000;
const MAX_SESSIONS = 10;

/**
 * Detect the default shell for the current OS.
 */
function detectShell(): string {
  const os = platform();
  if (os === 'win32') {
    // Prefer PowerShell if available
    try {
      execSync('powershell -Command "echo ok"', { stdio: 'pipe' });
      return 'powershell.exe';
    } catch { /* fallback */ }
    return 'cmd.exe';
  }
  return process.env.SHELL || '/bin/bash';
}

export class TerminalService {
  private sessions: Map<string, ManagedSession> = new Map();
  private idCounter = 0;

  /** Create a new terminal session */
  createSession(opts: {
    label?: string;
    cwd?: string;
    owner?: 'user' | 'agent';
  } = {}): TerminalSession {
    if (this.sessions.size >= MAX_SESSIONS) {
      // Kill oldest idle session
      const oldest = [...this.sessions.values()]
        .filter(s => !s.alive)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (oldest) this.destroySession(oldest.id);
      else throw new Error(`Maximum ${MAX_SESSIONS} terminal sessions reached`);
    }

    const id = `term-${++this.idCounter}-${Date.now()}`;
    const shell = detectShell();
    const cwd = opts.cwd || process.cwd();

    const session: ManagedSession = {
      id,
      label: opts.label || `Terminal ${this.idCounter}`,
      cwd,
      shell,
      owner: opts.owner || 'user',
      alive: true,
      createdAt: new Date().toISOString(),
      process: null,
      buffer: [],
      emitter: new EventEmitter(),
    };

    // Spawn shell process
    const isWindows = platform() === 'win32';
    const args = isWindows
      ? (shell.includes('powershell') ? ['-NoLogo', '-NoProfile'] : ['/Q'])
      : ['--login'];

    const proc = spawn(shell, args, {
      cwd,
      env: { ...process.env, TERM: 'xterm-256color' },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    session.process = proc;

    proc.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      this.appendBuffer(session, text);
      session.emitter.emit('output', {
        sessionId: id, data: text, stream: 'stdout',
        timestamp: new Date().toISOString(),
      } as TerminalOutput);
    });

    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      this.appendBuffer(session, text);
      session.emitter.emit('output', {
        sessionId: id, data: text, stream: 'stderr',
        timestamp: new Date().toISOString(),
      } as TerminalOutput);
    });

    proc.on('exit', (code) => {
      session.alive = false;
      session.emitter.emit('exit', { code });
    });

    this.sessions.set(id, session);
    return this.toPublic(session);
  }

  /** Write input to a terminal session (user keystrokes or LLM commands) */
  writeToSession(sessionId: string, input: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session?.alive || !session.process?.stdin?.writable) return false;
    session.process.stdin.write(input);
    return true;
  }

  /** Execute a command in a session and wait for output (for LLM use) */
  async execInSession(
    sessionId: string,
    command: string,
    timeoutMs = 30000,
  ): Promise<{ output: string; exitHint: boolean }> {
    const session = this.sessions.get(sessionId);
    if (!session?.alive) throw new Error('Session not alive');

    // Use a sentinel to detect command completion
    const sentinel = `__DONE_${Date.now()}__`;
    const isPS = session.shell.includes('powershell');
    const fullCmd = isPS
      ? `${command}\nWrite-Host '${sentinel}'\n`
      : `${command}\necho '${sentinel}'\n`;

    return new Promise((resolve, reject) => {
      let output = '';
      let timer: ReturnType<typeof setTimeout>;

      const onOutput = (ev: TerminalOutput) => {
        output += ev.data;
        if (output.includes(sentinel)) {
          cleanup();
          // Strip sentinel from output
          output = output.replace(new RegExp(`.*${sentinel}.*\\n?`), '').trim();
          resolve({ output, exitHint: false });
        }
      };

      const cleanup = () => {
        session.emitter.off('output', onOutput);
        clearTimeout(timer);
      };

      timer = setTimeout(() => {
        cleanup();
        resolve({ output: output.trim(), exitHint: true });
      }, timeoutMs);

      session.emitter.on('output', onOutput);
      session.process!.stdin!.write(fullCmd);
    });
  }

  /** Get buffered output for a session */
  getBuffer(sessionId: string, lastN?: number): string[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    if (lastN) return session.buffer.slice(-lastN);
    return [...session.buffer];
  }

  /** List all sessions */
  listSessions(): TerminalSession[] {
    return [...this.sessions.values()].map(s => this.toPublic(s));
  }

  /** Resize terminal (placeholder for xterm integration) */
  resizeSession(sessionId: string, cols: number, rows: number): void {
    // When using node-pty, this would call pty.resize(cols, rows)
    // With child_process, this is a no-op but preserves the interface
  }

  /** Destroy a session */
  destroySession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (session.process && session.alive) {
      session.process.kill();
    }
    session.alive = false;
    session.emitter.removeAllListeners();
    this.sessions.delete(sessionId);
  }

  /** Subscribe to terminal output events */
  onOutput(sessionId: string, callback: (ev: TerminalOutput) => void): () => void {
    const session = this.sessions.get(sessionId);
    if (!session) return () => {};
    session.emitter.on('output', callback);
    return () => session.emitter.off('output', callback);
  }

  /** Destroy all sessions (cleanup) */
  destroyAll(): void {
    for (const id of this.sessions.keys()) {
      this.destroySession(id);
    }
  }

  // ── Private ──

  private appendBuffer(session: ManagedSession, text: string): void {
    const lines = text.split('\n');
    session.buffer.push(...lines);
    // Cap buffer size
    if (session.buffer.length > MAX_BUFFER_LINES) {
      session.buffer = session.buffer.slice(-MAX_BUFFER_LINES);
    }
  }

  private toPublic(s: ManagedSession): TerminalSession {
    return {
      id: s.id, label: s.label, cwd: s.cwd,
      shell: s.shell, owner: s.owner,
      alive: s.alive, createdAt: s.createdAt,
    };
  }
}
