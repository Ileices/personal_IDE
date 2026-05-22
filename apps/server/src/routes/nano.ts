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
import { appConfig } from '../config.js';

type MeshSafetyPolicy = {
  enabled: boolean;
  killSwitch: boolean;
  minTrustScore: number;
  requiredAuthToken: string | null;
};

const MESH_SAFETY_KEY = 'nano:mesh:safety';
const DEFAULT_MESH_SAFETY_POLICY: MeshSafetyPolicy = {
  enabled: true,
  killSwitch: false,
  minTrustScore: 0.6,
  requiredAuthToken: null,
};

function parseAuthToken(headers: Record<string, unknown>): string {
  const meshHeader = headers['x-mesh-auth-token'];
  if (typeof meshHeader === 'string' && meshHeader.trim()) return meshHeader.trim();

  const authHeader = headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return '';
}

function clampTrust(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return DEFAULT_MESH_SAFETY_POLICY.minTrustScore;
  return Math.max(0, Math.min(1, num));
}

// ═════════════════════════════════════════════════════════════
// Routes
// ═════════════════════════════════════════════════════════════
export async function nanoRoutes(app: FastifyInstance) {
  const db = (app as any).db;

  const loadMeshSafetyPolicy = (): MeshSafetyPolicy => {
    let parsed: Partial<MeshSafetyPolicy> = {};
    try {
      const row = db.prepare('SELECT value FROM app_kv WHERE key = ?').get(MESH_SAFETY_KEY) as { value?: string } | undefined;
      parsed = row?.value ? JSON.parse(row.value) as Partial<MeshSafetyPolicy> : {};
    } catch {
      parsed = {};
    }

    const envToken = String(process.env.MESH_EXEC_AUTH_TOKEN || '').trim();
    const token = typeof parsed.requiredAuthToken === 'string' && parsed.requiredAuthToken.trim().length > 0
      ? parsed.requiredAuthToken.trim()
      : (envToken || null);

    return {
      enabled: parsed.enabled ?? DEFAULT_MESH_SAFETY_POLICY.enabled,
      killSwitch: parsed.killSwitch ?? DEFAULT_MESH_SAFETY_POLICY.killSwitch,
      minTrustScore: clampTrust(parsed.minTrustScore),
      requiredAuthToken: token,
    };
  };

  const saveMeshSafetyPolicy = (patch: Partial<MeshSafetyPolicy>): MeshSafetyPolicy => {
    const current = loadMeshSafetyPolicy();
    const next: MeshSafetyPolicy = {
      enabled: patch.enabled ?? current.enabled,
      killSwitch: patch.killSwitch ?? current.killSwitch,
      minTrustScore: patch.minTrustScore === undefined ? current.minTrustScore : clampTrust(patch.minTrustScore),
      requiredAuthToken: patch.requiredAuthToken === undefined
        ? current.requiredAuthToken
        : (String(patch.requiredAuthToken || '').trim() || null),
    };

    db.prepare(
      `INSERT INTO app_kv (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    ).run(MESH_SAFETY_KEY, JSON.stringify(next));
    return next;
  };

  const enforceMeshSafety = (headers: Record<string, unknown>, body: unknown) => {
    const policy = loadMeshSafetyPolicy();

    if (!appConfig.features.meshEnabled || !policy.enabled) {
      return {
        allowed: false,
        statusCode: 403,
        error: 'mesh execution is disabled by policy',
      };
    }

    if (policy.killSwitch) {
      return {
        allowed: false,
        statusCode: 423,
        error: 'mesh execution halted by kill-switch',
      };
    }

    if (policy.requiredAuthToken) {
      const token = parseAuthToken(headers);
      if (!token || token !== policy.requiredAuthToken) {
        return {
          allowed: false,
          statusCode: 401,
          error: 'mesh auth token missing or invalid',
        };
      }
    }

    const payload = body && typeof body === 'object' ? body as Record<string, unknown> : null;
    const trustSignal = payload?.peerTrustScore ?? payload?.trustScore ?? payload?.trust;
    if (trustSignal !== undefined) {
      const score = Number(trustSignal);
      if (!Number.isFinite(score) || score < policy.minTrustScore) {
        return {
          allowed: false,
          statusCode: 403,
          error: `peer trust score below threshold (${policy.minTrustScore})`,
        };
      }
    }

    return { allowed: true, statusCode: 200, error: '', policy };
  };

  // Detect Python on startup
  detectPython();

  app.get('/mesh/safety', async () => {
    const policy = loadMeshSafetyPolicy();
    return {
      ...policy,
      hasAuthToken: !!policy.requiredAuthToken,
      requiredAuthToken: policy.requiredAuthToken ? '***' : null,
      meshFeatureEnabled: appConfig.features.meshEnabled,
    };
  });

  app.put('/mesh/safety', async (req) => {
    const body = (req.body || {}) as Partial<MeshSafetyPolicy>;
    const next = saveMeshSafetyPolicy(body);
    return {
      success: true,
      policy: {
        ...next,
        hasAuthToken: !!next.requiredAuthToken,
        requiredAuthToken: next.requiredAuthToken ? '***' : null,
      },
    };
  });

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
    app.post(route, async (req, reply) => {
      if (route.startsWith('/mesh/') || route.startsWith('/discovery/') || route.startsWith('/pool/')) {
        const safety = enforceMeshSafety(req.headers as Record<string, unknown>, req.body);
        if (!safety.allowed) {
          return reply.status(safety.statusCode).send({ error: safety.error });
        }
      }

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
    app.put(route, async (req, reply) => {
      if (route.startsWith('/mesh/') || route.startsWith('/discovery/') || route.startsWith('/pool/')) {
        const safety = enforceMeshSafety(req.headers as Record<string, unknown>, req.body);
        if (!safety.allowed) {
          return reply.status(safety.statusCode).send({ error: safety.error });
        }
      }

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
