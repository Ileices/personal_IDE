// ============================================
// Nano Sea Routes — Process lifecycle + pool + peers
// The IDE frontend controls the Python backend through these endpoints.
// ============================================
import { FastifyInstance } from 'fastify';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

let nanoProcess: ChildProcess | null = null;
let nanoLogs: string[] = [];
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

// Persisted in-memory (survives hot reload but not server restart — fine for dev)
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
  nanoLogs.push(line);
  if (nanoLogs.length > MAX_LOG_LINES) {
    nanoLogs = nanoLogs.slice(-MAX_LOG_LINES);
  }
}

export async function nanoRoutes(app: FastifyInstance) {
  const nanoDir = path.resolve(process.cwd(), '..', 'NANO_train');

  // ── GET /api/nano/status ────────────────────────────────────
  app.get('/status', async () => {
    const running = nanoProcess !== null && nanoProcess.exitCode === null;

    // Try to ping the FastAPI server
    let apiStatus: any = null;
    if (running) {
      try {
        const res = await fetch(`http://localhost:${currentConfig.port}/v1/health`);
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
    };
  });

  // ── POST /api/nano/start ────────────────────────────────────
  app.post('/start', async (req) => {
    if (nanoProcess && nanoProcess.exitCode === null) {
      return { success: false, error: 'Nano Sea is already running', pid: nanoProcess.pid };
    }

    const body = (req.body as Partial<NanoConfig>) || {};
    // Merge any passed config
    Object.assign(currentConfig, body);

    const args = ['main.py'];
    if (currentConfig.meshEnabled) args.push('--mesh');
    args.push('--port', String(currentConfig.port));
    if (currentConfig.scanPaths.length) {
      args.push('--scan', ...currentConfig.scanPaths);
    }

    nanoLogs = [];
    appendLog(`[IDE] Starting Nano Sea: python ${args.join(' ')}`);
    appendLog(`[IDE] Working directory: ${nanoDir}`);

    try {
      nanoProcess = spawn('python', args, {
        cwd: nanoDir,
        env: {
          ...process.env,
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

      nanoProcess.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean);
        lines.forEach(l => appendLog(`[OUT] ${l}`));
      });

      nanoProcess.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean);
        lines.forEach(l => appendLog(`[ERR] ${l}`));
      });

      nanoProcess.on('exit', (code) => {
        appendLog(`[IDE] Nano Sea exited with code ${code}`);
        nanoProcess = null;
      });

      return { success: true, pid: nanoProcess.pid, port: currentConfig.port };
    } catch (err: any) {
      appendLog(`[IDE] Failed to start: ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  // ── POST /api/nano/stop ─────────────────────────────────────
  app.post('/stop', async () => {
    if (!nanoProcess || nanoProcess.exitCode !== null) {
      nanoProcess = null;
      return { success: true, message: 'Not running' };
    }

    appendLog('[IDE] Stopping Nano Sea...');
    nanoProcess.kill('SIGTERM');

    // Give it 5s to shut down, then force kill
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (nanoProcess && nanoProcess.exitCode === null) {
          nanoProcess.kill('SIGKILL');
          appendLog('[IDE] Force killed Nano Sea');
        }
        resolve();
      }, 5000);

      nanoProcess?.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    nanoProcess = null;
    return { success: true };
  });

  // ── POST /api/nano/restart ──────────────────────────────────
  app.post('/restart', async (req) => {
    // Stop then start
    if (nanoProcess && nanoProcess.exitCode === null) {
      nanoProcess.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 3000);
        nanoProcess?.on('exit', () => { clearTimeout(timeout); resolve(); });
      });
      nanoProcess = null;
    }

    // Start fresh (delegates to the start logic)
    const body = (req.body as Partial<NanoConfig>) || {};
    Object.assign(currentConfig, body);

    const args = ['main.py'];
    if (currentConfig.meshEnabled) args.push('--mesh');
    args.push('--port', String(currentConfig.port));
    if (currentConfig.scanPaths.length) {
      args.push('--scan', ...currentConfig.scanPaths);
    }

    nanoLogs = [];
    appendLog(`[IDE] Restarting Nano Sea: python ${args.join(' ')}`);

    nanoProcess = spawn('python', args, {
      cwd: nanoDir,
      env: {
        ...process.env,
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

    nanoProcess.stdout?.on('data', (data: Buffer) => {
      data.toString().split('\n').filter(Boolean).forEach(l => appendLog(`[OUT] ${l}`));
    });
    nanoProcess.stderr?.on('data', (data: Buffer) => {
      data.toString().split('\n').filter(Boolean).forEach(l => appendLog(`[ERR] ${l}`));
    });
    nanoProcess.on('exit', (code) => {
      appendLog(`[IDE] Nano Sea exited with code ${code}`);
      nanoProcess = null;
    });

    return { success: true, pid: nanoProcess.pid };
  });

  // ── GET /api/nano/logs ──────────────────────────────────────
  app.get('/logs', async (req) => {
    const query = req.query as { tail?: string };
    const tail = parseInt(query.tail || '50', 10);
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
  app.get('/config', async () => {
    return currentConfig;
  });

  // ── Proxy to Nano FastAPI ───────────────────────────────────
  // Forward requests to the Python backend so the frontend
  // doesn't need to know about the Python port directly.

  app.get('/mesh/info', async () => {
    try {
      const res = await fetch(`http://localhost:${currentConfig.port}/v1/mesh/info`);
      return await res.json();
    } catch {
      return { error: 'Nano Sea not running' };
    }
  });

  app.get('/mesh/peers', async () => {
    try {
      const res = await fetch(`http://localhost:${currentConfig.port}/v1/mesh/peers`);
      return await res.json();
    } catch {
      return { peers: [] };
    }
  });

  app.get('/mesh/stats', async () => {
    try {
      const res = await fetch(`http://localhost:${currentConfig.port}/v1/mesh/stats`);
      return await res.json();
    } catch {
      return { error: 'Nano Sea not running' };
    }
  });

  app.get('/pool/stats', async () => {
    try {
      const res = await fetch(`http://localhost:${currentConfig.port}/v1/pool/stats`);
      return await res.json();
    } catch {
      return { error: 'Pool not available' };
    }
  });

  app.get('/discovery/peers', async () => {
    try {
      const res = await fetch(`http://localhost:${currentConfig.port}/v1/discovery/peers`);
      return await res.json();
    } catch {
      return { peers: [] };
    }
  });

  app.get('/discovery/status', async () => {
    try {
      const res = await fetch(`http://localhost:${currentConfig.port}/v1/discovery/status`);
      return await res.json();
    } catch {
      return { error: 'Discovery not available' };
    }
  });

  app.post('/discovery/connect', async (req) => {
    try {
      const res = await fetch(`http://localhost:${currentConfig.port}/v1/discovery/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      return await res.json();
    } catch {
      return { error: 'Discovery not available' };
    }
  });

  app.post('/discovery/disconnect', async (req) => {
    try {
      const res = await fetch(`http://localhost:${currentConfig.port}/v1/discovery/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      return await res.json();
    } catch {
      return { error: 'Discovery not available' };
    }
  });
}
