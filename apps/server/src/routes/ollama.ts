// ============================================
// Ollama Diagnostic & Setup Routes (thin route layer)
// Business logic lives in services/ollama/
// ============================================
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { execSync, spawn } from 'child_process';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import os from 'os';
import { appConfig } from '../config.js';
import {
  detectHardware, recommendModels,
  findOllamaInstall, findOllamaModels, testOllamaConnection, buildActions,
} from '../services/ollama/index.js';
import { OllamaHealthMonitor } from '../services/ollama/healthMonitor.js';

export async function ollamaRoutes(app: FastifyInstance): Promise<void> {

  /** GET /api/ollama/drives - Discover drives and free space */
  app.get('/drives', async () => {
    const platform = os.platform();

    if (platform === 'win32') {
      try {
        const ps = execSync(
          'powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,FreeSpace,Size | ConvertTo-Json -Compress"',
          { timeout: 15000, encoding: 'utf-8', windowsHide: true }
        ).trim();
        const parsed = JSON.parse(ps || '[]');
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        return {
          drives: rows
            .filter((r: any) => !!r?.DeviceID)
            .map((r: any) => ({
              path: r.DeviceID,
              freeBytes: Number(r.FreeSpace || 0),
              totalBytes: Number(r.Size || 0),
              hasOllamaModelsDir: existsSync(join(r.DeviceID, '\\', '.ollama', 'models')),
            })),
        };
      } catch {
        return { drives: [] };
      }
    }

    try {
      const out = execSync('df -k', { timeout: 10000, encoding: 'utf-8' }).trim();
      const lines = out.split('\n').slice(1);
      return {
        drives: lines.map(line => {
          const parts = line.trim().split(/\s+/);
          const mount = parts[parts.length - 1] || '/';
          const totalKb = Number(parts[1] || 0);
          const freeKb = Number(parts[3] || 0);
          return {
            path: mount,
            freeBytes: freeKb * 1024,
            totalBytes: totalKb * 1024,
            hasOllamaModelsDir: existsSync(join(mount, '.ollama', 'models')),
          };
        }),
      };
    } catch {
      return { drives: [] };
    }
  });

  /** POST /api/ollama/check-path - Check a custom directory for an Ollama model */
  app.post('/check-path', async (req: FastifyRequest, reply: FastifyReply) => {
    const { directory, model } = (req.body as any) || {};
    if (!directory || !model) return reply.status(400).send({ error: 'directory and model are required' });

    try {
      const manifestsDir = join(directory, 'manifests', 'registry.ollama.ai', 'library');
      const [baseName, tag = 'latest'] = String(model).split(':');
      const modelDir = join(manifestsDir, baseName);
      const found = existsSync(modelDir) && readdirSync(modelDir).some(entry => entry === tag);
      return { found, directory, model };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  /** GET /api/ollama/diagnose - Full diagnostic scan */
  app.get('/diagnose', async () => {
    const hardware = detectHardware();
    const install = findOllamaInstall();
    const models = findOllamaModels();
    const connection = await testOllamaConnection();
    const recommendations = recommendModels(hardware);

    return {
      hardware, install, models, connection, recommendations,
      actions: buildActions(install, models, connection),
    };
  });

  /** POST /api/ollama/test-connection */
  app.post('/test-connection', async (req: FastifyRequest) => {
    const { baseUrl } = (req.body as any) || {};
    return testOllamaConnection(baseUrl || appConfig.services.ollamaUrl);
  });

  /** POST /api/ollama/start - Attempt to start Ollama service */
  app.post('/start', async () => {
    const install = findOllamaInstall();
    if (!install.found || !install.executable) {
      return { success: false, error: 'Ollama not found. Please install from https://ollama.com/download' };
    }

    try {
      const child = spawn(install.executable, ['serve'], {
        detached: true, stdio: 'ignore', windowsHide: true,
      });
      child.unref();

      await new Promise(r => setTimeout(r, 3000));
      const test = await testOllamaConnection();
      return { success: test.connected, ...test };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  /** POST /api/ollama/pull - Download a model */
  app.post('/pull', async (req: FastifyRequest, reply: FastifyReply) => {
    const { model } = req.body as { model: string };
    if (!model) return reply.status(400).send({ error: 'model is required' });

    try {
      const ollamaUrl = appConfig.services.ollamaUrl;
      const res = await fetch(`${ollamaUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model, stream: false }),
      });

      if (!res.ok) {
        const err = await res.text();
        return { success: false, error: `Pull failed: ${err}` };
      }

      const data = await res.json();
      return { success: true, status: (data as any).status || 'completed' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  /** POST /api/ollama/search-drives */
  app.post('/search-drives', async () => {
    const platform = os.platform();
    const results: { ollamaExe: string | null; modelDirs: string[] } = { ollamaExe: null, modelDirs: [] };

    if (platform === 'win32') {
      try {
        const drivesOut = execSync('wmic logicaldisk get name', { timeout: 10000, encoding: 'utf-8', windowsHide: true });
        const drives = drivesOut.split('\n').map(l => l.trim()).filter(l => /^[A-Z]:$/.test(l));

        for (const drive of drives) {
          try {
            const found = execSync(`where /R ${drive}\\ ollama.exe 2>nul`, {
              timeout: 60000, encoding: 'utf-8', windowsHide: true,
            }).trim();
            if (found && !results.ollamaExe) {
              results.ollamaExe = found.split('\n')[0];
            }
          } catch { /* not found on this drive */ }

          const modelCheck = join(drive, '\\', '.ollama', 'models');
          if (existsSync(modelCheck)) {
            results.modelDirs.push(modelCheck);
          }
        }
      } catch { /* wmic failed */ }
    } else {
      try {
        const found = execSync('find / -name "ollama" -type f -perm /111 2>/dev/null | head -5', {
          timeout: 60000, encoding: 'utf-8',
        }).trim();
        if (found) results.ollamaExe = found.split('\n')[0];
      } catch { /* not found */ }

      try {
        const modelDirs = execSync('find / -path "*/ollama/models/manifests" -type d 2>/dev/null | head -5', {
          timeout: 60000, encoding: 'utf-8',
        }).trim();
        if (modelDirs) {
          results.modelDirs = modelDirs.split('\n').map(d => d.replace('/manifests', ''));
        }
      } catch { /* not found */ }
    }

    return results;
  });

  /** GET /api/ollama/hardware */
  app.get('/hardware', async () => detectHardware());

  /** GET /api/ollama/gpu-status — per-GPU VRAM across all detected GPUs */
  app.get('/gpu-status', async () => {
    const monitor = new OllamaHealthMonitor();
    const vram = await monitor.getVRAMStatus();
    if (!vram) {
      return { available: false, reason: 'nvidia-smi not found or no NVIDIA GPU detected' };
    }
    return {
      available: true,
      gpuName: vram.gpuName,
      totalMB: vram.totalMB,
      usedMB: vram.usedMB,
      freeMB: vram.freeMB,
      utilizationPercent: vram.utilizationPercent,
      critical: vram.critical,
      allGpus: vram.allGpus,
    };
  });

  /** GET /api/ollama/recommend */
  app.get('/recommend', async () => {
    const hw = detectHardware();
    return { hardware: hw, recommendations: recommendModels(hw) };
  });

  /** POST /api/ollama/set-base-url */
  app.post('/set-base-url', async (req: FastifyRequest) => {
    const db = (app as any).db;
    const { baseUrl } = req.body as { baseUrl: string };
    const test = await testOllamaConnection(baseUrl);
    if (!test.connected) {
      return { success: false, error: `Cannot connect to ${baseUrl}: ${test.error}` };
    }
    const existing = db.prepare("SELECT id FROM provider_configs WHERE provider_id = 'ollama'").get();
    if (existing) {
      db.prepare("UPDATE provider_configs SET base_url = ?, enabled = 1, updated_at = datetime('now') WHERE provider_id = 'ollama'").run(baseUrl);
    } else {
      const { v4: uuid } = await import('uuid');
      db.prepare(
        "INSERT INTO provider_configs (id, provider_id, display_name, base_url, enabled, requires_api_key) VALUES (?, 'ollama', 'Ollama', ?, 1, 0)"
      ).run(uuid(), baseUrl);
    }
    return { success: true, baseUrl };
  });
}
