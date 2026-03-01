// ============================================
// Nano Sea Routes — Process lifecycle + pool + peers
//
// Thin route layer — all process logic lives in
// services/nano/processManager.ts
// ============================================
import { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs';
import {
  nanoDir,
  type NanoConfig,
  getConfig, setConfig,
  getLastError, setLastError,
  getLogs, clearLogs,
  getProcess, setProcess,
  appendLog,
  detectPython,
  killProcess,
  isAlive,
  spawnNano,
} from '../services/nano/processManager.js';

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
    const config = getConfig();

    let apiStatus: any = null;
    if (running) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`http://localhost:${config.port}/v1/health`, {
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
      pid: getProcess()?.pid || null,
      port: config.port,
      config,
      api: apiStatus,
      logLines: getLogs().total,
      lastError: getLastError(),
      pythonFound: !!detectPython(),
      nanoDirExists: fs.existsSync(nanoDir),
    };
  });

  // ── POST /api/nano/start ────────────────────────────────────
  app.post('/start', async (req) => {
    if (isAlive()) {
      return { success: false, error: 'Nano Sea is already running', pid: getProcess()!.pid };
    }

    const py = detectPython();
    if (!py) {
      const msg = 'Python 3 not found. Install Python 3.10+ and add it to PATH.';
      setLastError(msg);
      appendLog(`[IDE] ERROR: ${msg}`);
      return { success: false, error: msg };
    }

    if (!fs.existsSync(nanoDir)) {
      const msg = `NANO_train directory not found at: ${nanoDir}`;
      setLastError(msg);
      appendLog(`[IDE] ERROR: ${msg}`);
      return { success: false, error: msg };
    }

    if (!fs.existsSync(path.join(nanoDir, 'main.py'))) {
      const msg = 'NANO_train/main.py not found.';
      setLastError(msg);
      appendLog(`[IDE] ERROR: ${msg}`);
      return { success: false, error: msg };
    }

    // Merge config from request body
    const body = (req.body as Partial<NanoConfig>) || {};
    setConfig(body);
    setLastError(null);

    clearLogs();
    appendLog('[IDE] Starting Nano Sea...');

    try {
      const proc = spawnNano(py);
      setProcess(proc);
      return { success: true, pid: proc.pid, port: getConfig().port };
    } catch (err: any) {
      setLastError(err.message);
      appendLog(`[IDE] Failed to start: ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  // ── POST /api/nano/stop ─────────────────────────────────────
  app.post('/stop', async () => {
    if (!isAlive()) {
      setProcess(null);
      return { success: true, message: 'Not running' };
    }

    appendLog('[IDE] Stopping Nano Sea...');
    try {
      await killProcess(getProcess()!);
      appendLog('[IDE] Nano Sea stopped.');
    } catch (err: any) {
      appendLog(`[IDE] Error stopping: ${err.message}`);
    }
    setProcess(null);
    return { success: true };
  });

  // ── POST /api/nano/restart ──────────────────────────────────
  app.post('/restart', async (req) => {
    appendLog('[IDE] Restarting Nano Sea...');

    if (isAlive()) {
      await killProcess(getProcess()!);
      setProcess(null);
      await new Promise(r => setTimeout(r, 500));
    }

    const body = (req.body as Partial<NanoConfig>) || {};
    setConfig(body);

    const py = detectPython();
    if (!py) {
      const msg = 'Python 3 not found.';
      setLastError(msg);
      return { success: false, error: msg };
    }

    clearLogs();
    appendLog('[IDE] Restarting Nano Sea...');

    try {
      const proc = spawnNano(py);
      setProcess(proc);
      return { success: true, pid: proc.pid };
    } catch (err: any) {
      setLastError(err.message);
      appendLog(`[IDE] Failed to restart: ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  // ── GET /api/nano/logs ──────────────────────────────────────
  app.get('/logs', async (req) => {
    const query = req.query as { tail?: string };
    const tail = parseInt(query.tail || '100', 10);
    return getLogs(tail);
  });

  // ── PUT /api/nano/config ────────────────────────────────────
  app.put('/config', async (req) => {
    const body = req.body as Partial<NanoConfig>;
    const config = setConfig(body);
    return { success: true, config };
  });

  // ── GET /api/nano/config ────────────────────────────────────
  app.get('/config', async () => getConfig());

  // ═══════════════════════════════════════════════════════════
  // Proxy routes → Python FastAPI backend
  // ═══════════════════════════════════════════════════════════
  const proxyGet = (route: string, backendPath: string) => {
    app.get(route, async () => {
      try {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 3000);
        const res = await fetch(`http://localhost:${getConfig().port}${backendPath}`, {
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
        const res = await fetch(`http://localhost:${getConfig().port}${backendPath}`, {
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
        const res = await fetch(`http://localhost:${getConfig().port}${backendPath}`, {
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
