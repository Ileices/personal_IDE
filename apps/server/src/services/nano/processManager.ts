// ============================================
// Nano Process Manager — Lifecycle, config,
// Python detection, spawn/kill, and log buffer
// Extracted from routes/nano.ts for modularity
// ============================================
import { spawn, ChildProcess, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ── Resolve paths relative to THIS file, not cwd ───────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// services/nano/ → 5 levels up → repo root
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
export const nanoDir = path.resolve(repoRoot, 'NANO_train');
const isWindows = process.platform === 'win32';

// ── State ───────────────────────────────────────────────────
let nanoProcess: ChildProcess | null = null;
let nanoLogs: string[] = [];
let pythonCmd: { bin: string; extraArgs: string[] } | null = null;
let lastError: string | null = null;
const MAX_LOG_LINES = 500;

export interface NanoConfig {
  meshEnabled: boolean;
  port: number;
  scanPaths: string[];
  donationPercent: number;
  permanentNode: boolean;
  idleTraining: boolean;
  username: string;
  peerDiscovery: boolean;
  sharingLevel: string;
}

let currentConfig: NanoConfig = {
  meshEnabled: true,
  port: 5100,
  scanPaths: ['.'],
  donationPercent: 25,
  permanentNode: false,
  idleTraining: true,
  username: 'Anonymous',
  peerDiscovery: false,
  sharingLevel: 'metadata',
};

// ── Public accessors ────────────────────────────────────────

export function getConfig(): NanoConfig { return currentConfig; }
export function setConfig(partial: Partial<NanoConfig>): NanoConfig {
  Object.assign(currentConfig, partial);
  return currentConfig;
}
export function getLastError(): string | null { return lastError; }
export function setLastError(err: string | null): void { lastError = err; }
export function getLogs(tail?: number): { lines: string[]; total: number } {
  const n = tail ?? 100;
  return { lines: nanoLogs.slice(-n), total: nanoLogs.length };
}
export function clearLogs(): void { nanoLogs = []; }
export function getProcess(): ChildProcess | null { return nanoProcess; }
export function setProcess(proc: ChildProcess | null): void { nanoProcess = proc; }

// ── Logging ─────────────────────────────────────────────────

export function appendLog(line: string): void {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  nanoLogs.push(`[${ts}] ${line}`);
  if (nanoLogs.length > MAX_LOG_LINES) {
    nanoLogs = nanoLogs.slice(-MAX_LOG_LINES);
  }
}

// ── Python detection ────────────────────────────────────────

export function detectPython(): { bin: string; extraArgs: string[] } | null {
  if (pythonCmd) return pythonCmd;

  const venvPython = isWindows
    ? path.join(nanoDir, '.venv', 'Scripts', 'python.exe')
    : path.join(nanoDir, '.venv', 'bin', 'python');

  const candidates: { bin: string; extraArgs: string[] }[] = [];

  if (fs.existsSync(venvPython)) {
    candidates.push({ bin: venvPython, extraArgs: [] });
  }

  if (isWindows) {
    candidates.push(
      { bin: 'python', extraArgs: [] as string[] },
      { bin: 'python3', extraArgs: [] as string[] },
      { bin: 'py', extraArgs: ['-3'] },
    );
  } else {
    candidates.push(
      { bin: 'python3', extraArgs: [] as string[] },
      { bin: 'python', extraArgs: [] as string[] },
    );
  }

  for (const c of candidates) {
    try {
      const testArgs = [...c.extraArgs, '--version'].join(' ');
      const result = execSync(`${c.bin} ${testArgs}`, {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000,
      });
      const version = result.toString().trim();
      if (version.toLowerCase().includes('python 3')) {
        pythonCmd = c;
        appendLog(`[IDE] Detected ${version} via "${c.bin}"`);
        return pythonCmd;
      }
    } catch {
      // candidate not found, try next
    }
  }
  return null;
}

// ── Cross-platform process kill ─────────────────────────────

export function killProcess(proc: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (!proc || !proc.pid) { resolve(); return; }

    if (isWindows) {
      try {
        execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' });
      } catch { /* may already be dead */ }
      setTimeout(resolve, 500);
    } else {
      proc.kill('SIGTERM');
      const timeout = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch {}
        resolve();
      }, 5000);
      proc.once('exit', () => { clearTimeout(timeout); resolve(); });
    }
  });
}

// ── Process status ──────────────────────────────────────────

export function isAlive(): boolean {
  if (!nanoProcess) return false;
  try {
    return nanoProcess.exitCode === null && !nanoProcess.killed;
  } catch {
    return false;
  }
}

// ── Spawn ───────────────────────────────────────────────────

export function spawnNano(py: { bin: string; extraArgs: string[] }): ChildProcess {
  const pyArgs = [...py.extraArgs, 'main.py'];
  if (currentConfig.meshEnabled) pyArgs.push('--mesh');
  pyArgs.push('--port', String(currentConfig.port));
  if (currentConfig.scanPaths.length) {
    pyArgs.push('--scan-paths', ...currentConfig.scanPaths);
  }

  appendLog(`[IDE] Command: ${py.bin} ${pyArgs.join(' ')}`);
  appendLog(`[IDE] Working dir: ${nanoDir}`);

  const proc = spawn(py.bin, pyArgs, {
    cwd: nanoDir,
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      NANO_PORT: String(currentConfig.port),
      NANO_MESH: currentConfig.meshEnabled ? '1' : '0',
      NANO_DONATION_PCT: String(currentConfig.donationPercent),
      NANO_PERMANENT_NODE: currentConfig.permanentNode ? '1' : '0',
      NANO_IDLE_TRAINING: currentConfig.idleTraining ? '1' : '0',
      NANO_USERNAME: currentConfig.username,
      NANO_PEER_DISCOVERY: currentConfig.peerDiscovery ? '1' : '0',
      NANO_SHARING_LEVEL: currentConfig.sharingLevel,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  proc.stdout?.on('data', (data: Buffer) => {
    data.toString().split('\n').filter(Boolean).forEach(l => appendLog(`[OUT] ${l}`));
  });
  proc.stderr?.on('data', (data: Buffer) => {
    data.toString().split('\n').filter(Boolean).forEach(l => appendLog(`[ERR] ${l}`));
  });
  proc.on('error', (err) => {
    lastError = `Spawn error: ${err.message}`;
    appendLog(`[IDE] SPAWN ERROR: ${err.message}`);
    nanoProcess = null;
  });
  proc.on('exit', (code, signal) => {
    appendLog(`[IDE] Nano Sea exited (code=${code}, signal=${signal})`);
    if (code !== 0 && code !== null) {
      lastError = `Process exited with code ${code}`;
    }
    nanoProcess = null;
  });

  appendLog(`[IDE] Process spawned — PID ${proc.pid}`);
  return proc;
}
