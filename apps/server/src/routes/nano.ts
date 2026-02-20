// ============================================
// Nano Sea Routes — Process lifecycle + pool + peers
//
// The IDE frontend controls the Python backend through
// these endpoints. Handles spawn, kill, config, logs,
// and proxies requests to the Python FastAPI server.
// ============================================
import { FastifyInstance } from 'fastify';
import { spawn, ChildProcess, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ── Resolve paths relative to THIS file, not cwd ───────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// apps/server/src/routes/ → 4 levels up → repo root
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const nanoDir = path.resolve(repoRoot, 'NANO_train');
const isWindows = process.platform === 'win32';

// ── State ───────────────────────────────────────────────────
let nanoProcess: ChildProcess | null = null;
let nanoLogs: string[] = [];
let pythonCmd: { bin: string; extraArgs: string[] } | null = null;
let lastError: string | null = null;
const MAX_LOG_LINES = 500;

interface NanoConfig {
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

function appendLog(line: string) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  nanoLogs.push(`[${ts}] ${line}`);
  if (nanoLogs.length > MAX_LOG_LINES) {
    nanoLogs = nanoLogs.slice(-MAX_LOG_LINES);
  }
}

// ── Python detection ────────────────────────────────────────
// Try multiple candidates and cache the first Python 3 found.
function detectPython(): { bin: string; extraArgs: string[] } | null {
  if (pythonCmd) return pythonCmd;

  const candidates = isWindows
    ? [
        { bin: 'python', extraArgs: [] as string[] },
        { bin: 'python3', extraArgs: [] as string[] },
        { bin: 'py', extraArgs: ['-3'] },
      ]
    : [
        { bin: 'python3', extraArgs: [] as string[] },
        { bin: 'python', extraArgs: [] as string[] },
      ];

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
// On Windows, SIGTERM doesn't propagate to child trees.
// Use taskkill /T to kill the entire process tree.
function killProcess(proc: ChildProcess): Promise<void> {
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

function isAlive(): boolean {
  if (!nanoProcess) return false;
  try {
    return nanoProcess.exitCode === null && !nanoProcess.killed;
  } catch {
    return false;
  }
}

function spawnNano(py: { bin: string; extraArgs: string[] }): ChildProcess {
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

// ═════════════════════════════════════════════════════════════
// Routes
// ═════════════════════════════════════════════════════════════
export async function nanoRoutes(app: FastifyInstance) {
  // Detect Python on startup
  detectPython();

  // ── GET /api/nano/check ─────────────────────────────────────
  // Pre-flight: is the environment ready?
  app.get('/check', async () => {
    const py = detectPython();
    const dirExists = fs.existsSync(nanoDir);
    const mainExists = dirExists && fs.existsSync(path.join(nanoDir, 'main.py'));
    const reqsExist = dirExists && fs.existsSync(path.join(nanoDir, 'requirements.txt'));

    return {
      ready: !!py && mainExists,
      python: py ? { bin: py.bin, extraArgs: py.extraArgs } : null,
      pythonFound: !!py,
      nanoDir,
      nanoDirExists: dirExists,
      mainPyExists: mainExists,
      requirementsExist: reqsExist,
      platform: process.platform,
      errors: [
        ...(!py ? ['Python 3 not found. Install Python 3.10+ and ensure it is on PATH.'] : []),
        ...(!dirExists ? [`NANO_train directory not found at: ${nanoDir}`] : []),
        ...(dirExists && !mainExists ? ['NANO_train/main.py not found.'] : []),
      ],
    };
  });

  // ── GET /api/nano/status ────────────────────────────────────
  app.get('/status', async () => {
    const running = isAlive();

    let apiStatus: any = null;
    if (running) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`http://localhost:${currentConfig.port}/v1/health`, {
          signal: controller.signal,
        });
        clearTimeout(t);
        apiStatus = await res.json();
      } catch {
        apiStatus = { status: 'starting' };
      }
    }

    return {
      running,
      pid: nanoProcess?.pid || null,
      port: currentConfig.port,
      config: currentConfig,
      api: apiStatus,
      logLines: nanoLogs.length,
      lastError,
      pythonFound: !!detectPython(),
      nanoDirExists: fs.existsSync(nanoDir),
    };
  });

  // ── POST /api/nano/start ────────────────────────────────────
  app.post('/start', async (req) => {
    if (isAlive()) {
      return { success: false, error: 'Nano Sea is already running', pid: nanoProcess!.pid };
    }

    const py = detectPython();
    if (!py) {
      const msg = 'Python 3 not found. Install Python 3.10+ and add it to PATH.';
      lastError = msg;
      appendLog(`[IDE] ERROR: ${msg}`);
      return { success: false, error: msg };
    }

    if (!fs.existsSync(nanoDir)) {
      const msg = `NANO_train directory not found at: ${nanoDir}`;
      lastError = msg;
      appendLog(`[IDE] ERROR: ${msg}`);
      return { success: false, error: msg };
    }

    if (!fs.existsSync(path.join(nanoDir, 'main.py'))) {
      const msg = 'NANO_train/main.py not found.';
      lastError = msg;
      appendLog(`[IDE] ERROR: ${msg}`);
      return { success: false, error: msg };
    }

    // Merge config from request body
    const body = (req.body as Partial<NanoConfig>) || {};
    Object.assign(currentConfig, body);
    lastError = null;

    nanoLogs = [];
    appendLog('[IDE] Starting Nano Sea...');

    try {
      nanoProcess = spawnNano(py);
      return { success: true, pid: nanoProcess.pid, port: currentConfig.port };
    } catch (err: any) {
      lastError = err.message;
      appendLog(`[IDE] Failed to start: ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  // ── POST /api/nano/stop ─────────────────────────────────────
  app.post('/stop', async () => {
    if (!isAlive()) {
      nanoProcess = null;
      return { success: true, message: 'Not running' };
    }

    appendLog('[IDE] Stopping Nano Sea...');
    try {
      await killProcess(nanoProcess!);
      appendLog('[IDE] Nano Sea stopped.');
    } catch (err: any) {
      appendLog(`[IDE] Error stopping: ${err.message}`);
    }
    nanoProcess = null;
    return { success: true };
  });

  // ── POST /api/nano/restart ──────────────────────────────────
  app.post('/restart', async (req) => {
    appendLog('[IDE] Restarting Nano Sea...');

    if (isAlive()) {
      await killProcess(nanoProcess!);
      nanoProcess = null;
      await new Promise(r => setTimeout(r, 500));
    }

    const body = (req.body as Partial<NanoConfig>) || {};
    Object.assign(currentConfig, body);

    const py = detectPython();
    if (!py) {
      const msg = 'Python 3 not found.';
      lastError = msg;
      return { success: false, error: msg };
    }

    nanoLogs = [];
    appendLog('[IDE] Restarting Nano Sea...');

    try {
      nanoProcess = spawnNano(py);
      return { success: true, pid: nanoProcess.pid };
    } catch (err: any) {
      lastError = err.message;
      appendLog(`[IDE] Failed to restart: ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  // ── GET /api/nano/logs ──────────────────────────────────────
  app.get('/logs', async (req) => {
    const query = req.query as { tail?: string };
    const tail = parseInt(query.tail || '100', 10);
    return {
      lines: nanoLogs.slice(-tail),
      total: nanoLogs.length,
    };
  });

  // ── PUT /api/nano/config ────────────────────────────────────
  app.put('/config', async (req) => {
    const body = req.body as Partial<NanoConfig>;
    Object.assign(currentConfig, body);
    return { success: true, config: currentConfig };
  });

  // ── GET /api/nano/config ────────────────────────────────────
  app.get('/config', async () => currentConfig);

  // ═══════════════════════════════════════════════════════════
  // Proxy routes → Python FastAPI backend
  // ═══════════════════════════════════════════════════════════
  const proxyGet = (route: string, backendPath: string) => {
    app.get(route, async () => {
      try {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 3000);
        const res = await fetch(`http://localhost:${currentConfig.port}${backendPath}`, {
          signal: c.signal,
        });
        clearTimeout(t);
        return await res.json();
      } catch {
        return { error: 'Nano Sea not reachable' };
      }
    });
  };

  const proxyPost = (route: string, backendPath: string) => {
    app.post(route, async (req) => {
      try {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 3000);
        const res = await fetch(`http://localhost:${currentConfig.port}${backendPath}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req.body),
          signal: c.signal,
        });
        clearTimeout(t);
        return await res.json();
      } catch {
        return { error: 'Nano Sea not reachable' };
      }
    });
  };

  const proxyPut = (route: string, backendPath: string) => {
    app.put(route, async (req) => {
      try {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 3000);
        const res = await fetch(`http://localhost:${currentConfig.port}${backendPath}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req.body),
          signal: c.signal,
        });
        clearTimeout(t);
        return await res.json();
      } catch {
        return { error: 'Nano Sea not reachable' };
      }
    });
  };

  // Mesh & pool
  proxyGet('/mesh/info', '/v1/mesh/info');
  proxyGet('/mesh/peers', '/v1/mesh/peers');
  proxyGet('/mesh/stats', '/v1/mesh/stats');
  proxyGet('/pool/stats', '/v1/pool/stats');
  proxyPut('/pool/donation', '/v1/pool/donation');
  proxyPut('/pool/idle-training', '/v1/pool/idle-training');
  proxyPost('/pool/permanent-node', '/v1/pool/permanent-node');

  // Discovery (full set)
  proxyGet('/discovery/peers', '/v1/discovery/peers');
  proxyGet('/discovery/status', '/v1/discovery/status');
  proxyGet('/discovery/groups', '/v1/discovery/groups');
  proxyPost('/discovery/connect', '/v1/discovery/connect');
  proxyPost('/discovery/disconnect', '/v1/discovery/disconnect');
  proxyPost('/discovery/opt-in', '/v1/discovery/opt-in');
  proxyPost('/discovery/accept', '/v1/discovery/accept');
  proxyPost('/discovery/block', '/v1/discovery/block');

  // Training + checkpoint endpoints
  proxyGet('/training/status', '/v1/training/status');
  proxyGet('/training/checkpoints', '/v1/training/checkpoints');
  proxyPost('/training/observe', '/v1/training/observe');

  // Inference
  proxyGet('/models', '/v1/models');
  proxyGet('/health', '/v1/health');

  // Log query endpoints
  proxyGet('/logs/query', '/v1/logs/query');
  proxyGet('/logs/stats', '/v1/logs/stats');

  // Compute/GPU status
  proxyGet('/compute/status', '/v1/compute/status');
}
