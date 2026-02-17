// ============================================
// Ollama Diagnostic & Setup Routes
// Detect install, check hardware, recommend models,
// download models, repair connection
// ============================================
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { execSync, spawn } from 'child_process';
import { existsSync, statSync, readdirSync } from 'fs';
import { join } from 'path';
import os from 'os';

// ── Common Ollama install locations by platform ──
const WINDOWS_PATHS = [
  join(os.homedir(), 'AppData', 'Local', 'Programs', 'Ollama'),
  join(os.homedir(), 'AppData', 'Local', 'Ollama'),
  join(os.homedir(), '.ollama'),
  'C:\\Program Files\\Ollama',
  'C:\\Program Files (x86)\\Ollama',
  'C:\\Ollama',
];

const WINDOWS_MODEL_PATHS = [
  join(os.homedir(), '.ollama', 'models'),
  join(os.homedir(), 'AppData', 'Local', 'Ollama', 'models'),
];

const LINUX_PATHS = [
  '/usr/local/bin',
  '/usr/bin',
  join(os.homedir(), '.local', 'bin'),
  '/opt/ollama',
];

const LINUX_MODEL_PATHS = [
  join(os.homedir(), '.ollama', 'models'),
  '/usr/share/ollama/.ollama/models',
];

const MAC_PATHS = [
  '/usr/local/bin',
  '/opt/homebrew/bin',
  join(os.homedir(), '.ollama'),
  '/Applications/Ollama.app',
];

const MAC_MODEL_PATHS = [
  join(os.homedir(), '.ollama', 'models'),
];

interface HardwareInfo {
  platform: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  totalRamGB: number;
  freeRamGB: number;
  gpus: GpuInfo[];
}

interface GpuInfo {
  name: string;
  vramGB: number;
  driver: string;
}

interface ModelRecommendation {
  id: string;
  name: string;
  sizeGB: number;
  description: string;
  reason: string;
  priority: number; // 1 = best pick
}

function detectGPUs(): GpuInfo[] {
  const gpus: GpuInfo[] = [];
  const platform = os.platform();

  try {
    if (platform === 'win32') {
      // nvidia-smi for NVIDIA GPUs
      try {
        const nvOut = execSync('nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits', {
          timeout: 10000, encoding: 'utf-8', windowsHide: true,
        });
        for (const line of nvOut.trim().split('\n')) {
          const parts = line.split(',').map(s => s.trim());
          if (parts.length >= 3) {
            gpus.push({
              name: parts[0],
              vramGB: Math.round(parseInt(parts[1]) / 1024 * 10) / 10,
              driver: parts[2],
            });
          }
        }
      } catch { /* no nvidia-smi */ }

      // WMIC fallback for all GPUs
      if (gpus.length === 0) {
        try {
          const wmicOut = execSync('wmic path win32_VideoController get Name,AdapterRAM,DriverVersion /format:csv', {
            timeout: 10000, encoding: 'utf-8', windowsHide: true,
          });
          for (const line of wmicOut.trim().split('\n').slice(1)) {
            const parts = line.split(',').map(s => s.trim());
            if (parts.length >= 4 && parts[2]) {
              const adapterRam = parseInt(parts[1]) || 0;
              gpus.push({
                name: parts[2],
                vramGB: Math.round(adapterRam / (1024 * 1024 * 1024) * 10) / 10,
                driver: parts[3] || 'unknown',
              });
            }
          }
        } catch { /* no wmic */ }
      }
    } else if (platform === 'linux') {
      try {
        const nvOut = execSync('nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits', {
          timeout: 10000, encoding: 'utf-8',
        });
        for (const line of nvOut.trim().split('\n')) {
          const parts = line.split(',').map(s => s.trim());
          if (parts.length >= 3) {
            gpus.push({
              name: parts[0],
              vramGB: Math.round(parseInt(parts[1]) / 1024 * 10) / 10,
              driver: parts[2],
            });
          }
        }
      } catch { /* no nvidia-smi */ }
    } else if (platform === 'darwin') {
      try {
        const spOut = execSync('system_profiler SPDisplaysDataType 2>/dev/null', {
          timeout: 10000, encoding: 'utf-8',
        });
        const nameMatch = spOut.match(/Chipset Model:\s*(.+)/);
        const vramMatch = spOut.match(/VRAM.*?:\s*(\d+)\s*(MB|GB)/i);
        if (nameMatch) {
          let vramGB = 0;
          if (vramMatch) {
            vramGB = parseInt(vramMatch[1]);
            if (vramMatch[2].toLowerCase() === 'mb') vramGB /= 1024;
          }
          gpus.push({ name: nameMatch[1].trim(), vramGB, driver: 'macOS' });
        }
      } catch { /* no system_profiler */ }
    }
  } catch { /* silent */ }

  return gpus;
}

function detectHardware(): HardwareInfo {
  const cpus = os.cpus();
  return {
    platform: os.platform(),
    arch: os.arch(),
    cpuModel: cpus[0]?.model || 'unknown',
    cpuCores: cpus.length,
    totalRamGB: Math.round(os.totalmem() / (1024 ** 3) * 10) / 10,
    freeRamGB: Math.round(os.freemem() / (1024 ** 3) * 10) / 10,
    gpus: detectGPUs(),
  };
}

function recommendModels(hw: HardwareInfo): ModelRecommendation[] {
  const recs: ModelRecommendation[] = [];
  const bestGpu = hw.gpus.reduce((best, g) => g.vramGB > best.vramGB ? g : best, { name: '', vramGB: 0, driver: '' });
  const effectiveVram = bestGpu.vramGB;
  const effectiveRam = hw.totalRamGB;
  // Determine what fits: VRAM for GPU inference, RAM for CPU fallback
  const budget = effectiveVram >= 4 ? effectiveVram : effectiveRam;
  const isGpu = effectiveVram >= 4;

  // Coding-focused models, sorted by quality within size tiers
  if (budget >= 32) {
    recs.push({
      id: 'deepseek-coder-v2:33b', name: 'DeepSeek Coder V2 33B', sizeGB: 19,
      description: 'Best coding model for high-end hardware. Exceptional at complex projects.',
      reason: `${isGpu ? bestGpu.name + ' with ' + effectiveVram + 'GB VRAM' : effectiveRam + 'GB RAM'} can run 33B models comfortably`,
      priority: 1,
    });
    recs.push({
      id: 'codellama:34b', name: 'Code Llama 34B', sizeGB: 19,
      description: 'Meta\'s top coding model. Strong at code completion and generation.',
      reason: 'Fits within your memory budget with room for context',
      priority: 2,
    });
  }

  if (budget >= 16) {
    recs.push({
      id: 'deepseek-coder:33b', name: 'DeepSeek Coder 33B', sizeGB: 17.5,
      description: 'Excellent coding model. Great at multi-file edits and reasoning.',
      reason: `Fits in ${isGpu ? 'VRAM' : 'RAM'} (${budget}GB available)`,
      priority: budget >= 32 ? 3 : 1,
    });
  }

  if (budget >= 8) {
    recs.push({
      id: 'qwen2.5-coder:14b', name: 'Qwen 2.5 Coder 14B', sizeGB: 8.9,
      description: 'Alibaba\'s top-tier coding model. Excellent at code generation and understanding.',
      reason: `Strong coding model that fits your ${isGpu ? 'GPU' : 'system'} well`,
      priority: budget >= 16 ? 3 : 1,
    });
    recs.push({
      id: 'deepseek-coder:6.7b', name: 'DeepSeek Coder 6.7B', sizeGB: 3.8,
      description: 'Best small coding model. Fast responses, solid code quality.',
      reason: 'Fast + high quality for its size',
      priority: budget >= 16 ? 4 : 2,
    });
  }

  if (budget >= 4) {
    recs.push({
      id: 'qwen2.5-coder:7b', name: 'Qwen 2.5 Coder 7B', sizeGB: 4.7,
      description: 'Strong 7B coding model. Good balance of speed and quality.',
      reason: `Fits comfortably in ${budget}GB`,
      priority: budget >= 8 ? 4 : 1,
    });
    recs.push({
      id: 'codellama:7b', name: 'Code Llama 7B', sizeGB: 3.8,
      description: 'Meta\'s small coding model. Fast code completion.',
      reason: 'Lightweight, fast responses',
      priority: budget >= 8 ? 5 : 2,
    });
  }

  // Always recommend a tiny model as fallback
  recs.push({
    id: 'qwen2.5-coder:1.5b', name: 'Qwen 2.5 Coder 1.5B', sizeGB: 1.0,
    description: 'Ultra-light coding model. Works on any machine.',
    reason: 'Runs anywhere, good for quick completions',
    priority: recs.length > 0 ? recs.length + 1 : 1,
  });

  return recs.sort((a, b) => a.priority - b.priority);
}

function findOllamaInstall(): { found: boolean; path: string | null; executable: string | null; version: string | null } {
  const platform = os.platform();
  const paths = platform === 'win32' ? WINDOWS_PATHS : platform === 'darwin' ? MAC_PATHS : LINUX_PATHS;

  // 1. Try `ollama --version` directly (if on PATH)
  try {
    const version = execSync('ollama --version', { timeout: 5000, encoding: 'utf-8', windowsHide: true }).trim();
    // Find which path it's at
    let exePath: string | null = null;
    try {
      if (platform === 'win32') {
        exePath = execSync('where ollama', { timeout: 5000, encoding: 'utf-8', windowsHide: true }).trim().split('\n')[0];
      } else {
        exePath = execSync('which ollama', { timeout: 5000, encoding: 'utf-8' }).trim();
      }
    } catch { /* not on path cleanly */ }
    return { found: true, path: exePath, executable: exePath || 'ollama', version };
  } catch { /* not on PATH */ }

  // 2. Search common locations
  for (const basePath of paths) {
    try {
      if (!existsSync(basePath)) continue;
      const exeName = platform === 'win32' ? 'ollama.exe' : 'ollama';
      const fullPath = join(basePath, exeName);
      if (existsSync(fullPath)) {
        try {
          const version = execSync(`"${fullPath}" --version`, { timeout: 5000, encoding: 'utf-8', windowsHide: true }).trim();
          return { found: true, path: basePath, executable: fullPath, version };
        } catch {
          return { found: true, path: basePath, executable: fullPath, version: null };
        }
      }
    } catch { /* skip */ }
  }

  return { found: false, path: null, executable: null, version: null };
}

function findOllamaModels(): { found: boolean; path: string | null; models: string[] } {
  const platform = os.platform();
  const modelPaths = platform === 'win32' ? WINDOWS_MODEL_PATHS : platform === 'darwin' ? MAC_MODEL_PATHS : LINUX_MODEL_PATHS;

  for (const modPath of modelPaths) {
    try {
      if (!existsSync(modPath)) continue;
      const manifests = join(modPath, 'manifests');
      if (existsSync(manifests)) {
        const models: string[] = [];
        // manifests/registry.ollama.ai/library/<model>/<tag>
        const registryPath = join(manifests, 'registry.ollama.ai', 'library');
        if (existsSync(registryPath)) {
          for (const modelDir of readdirSync(registryPath)) {
            const modelPath = join(registryPath, modelDir);
            if (statSync(modelPath).isDirectory()) {
              for (const tag of readdirSync(modelPath)) {
                models.push(`${modelDir}:${tag}`);
              }
            }
          }
        }
        return { found: true, path: modPath, models };
      }
    } catch { /* skip */ }
  }

  return { found: false, path: null, models: [] };
}

async function testOllamaConnection(baseUrl: string = 'http://localhost:11434'): Promise<{
  connected: boolean; version?: string; error?: string;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${baseUrl}/api/version`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json() as any;
      return { connected: true, version: data.version };
    }
    return { connected: false, error: `HTTP ${res.status}` };
  } catch (err: any) {
    return { connected: false, error: err.code === 'ECONNREFUSED' ? 'Ollama is not running' : err.message };
  }
}

export async function ollamaRoutes(app: FastifyInstance): Promise<void> {

  /** GET /api/ollama/diagnose - Full diagnostic scan */
  app.get('/diagnose', async () => {
    const hardware = detectHardware();
    const install = findOllamaInstall();
    const models = findOllamaModels();
    const connection = await testOllamaConnection();
    const recommendations = recommendModels(hardware);

    return {
      hardware,
      install,
      models,
      connection,
      recommendations,
      actions: buildActions(install, models, connection),
    };
  });

  /** POST /api/ollama/test-connection - Test connection to Ollama */
  app.post('/test-connection', async (req: FastifyRequest) => {
    const { baseUrl } = (req.body as any) || {};
    return testOllamaConnection(baseUrl || 'http://localhost:11434');
  });

  /** POST /api/ollama/start - Attempt to start Ollama service */
  app.post('/start', async () => {
    const install = findOllamaInstall();
    if (!install.found || !install.executable) {
      return { success: false, error: 'Ollama not found. Please install from https://ollama.com/download' };
    }

    try {
      // Try starting Ollama serve in background
      const child = spawn(install.executable, ['serve'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();

      // Wait a bit and test connection
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
      const res = await fetch('http://localhost:11434/api/pull', {
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

  /** POST /api/ollama/search-drives - Search all drives for Ollama (user-initiated) */
  app.post('/search-drives', async () => {
    const platform = os.platform();
    const results: { ollamaExe: string | null; modelDirs: string[] } = { ollamaExe: null, modelDirs: [] };

    if (platform === 'win32') {
      // Get drive letters
      try {
        const drivesOut = execSync('wmic logicaldisk get name', { timeout: 10000, encoding: 'utf-8', windowsHide: true });
        const drives = drivesOut.split('\n').map(l => l.trim()).filter(l => /^[A-Z]:$/.test(l));

        for (const drive of drives) {
          // Search for ollama.exe (limited depth to avoid taking forever)
          try {
            const found = execSync(`where /R ${drive}\\ ollama.exe 2>nul`, {
              timeout: 60000, encoding: 'utf-8', windowsHide: true,
            }).trim();
            if (found && !results.ollamaExe) {
              results.ollamaExe = found.split('\n')[0];
            }
          } catch { /* not found on this drive */ }

          // Search for models directory
          const modelCheck = join(drive, '\\', '.ollama', 'models');
          if (existsSync(modelCheck)) {
            results.modelDirs.push(modelCheck);
          }
        }
      } catch { /* wmic failed */ }
    } else {
      // Linux/Mac: use find (limited)
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

  /** GET /api/ollama/hardware - Just hardware info */
  app.get('/hardware', async () => {
    return detectHardware();
  });

  /** GET /api/ollama/recommend - Model recommendations based on hardware */
  app.get('/recommend', async () => {
    const hw = detectHardware();
    return { hardware: hw, recommendations: recommendModels(hw) };
  });

  /** POST /api/ollama/set-base-url - Update Ollama base URL in provider config */
  app.post('/set-base-url', async (req: FastifyRequest) => {
    const db = (app as any).db;
    const { baseUrl } = req.body as { baseUrl: string };
    const test = await testOllamaConnection(baseUrl);
    if (!test.connected) {
      return { success: false, error: `Cannot connect to ${baseUrl}: ${test.error}` };
    }
    // Update or insert provider config
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

function buildActions(
  install: ReturnType<typeof findOllamaInstall>,
  models: ReturnType<typeof findOllamaModels>,
  connection: Awaited<ReturnType<typeof testOllamaConnection>>
): string[] {
  const actions: string[] = [];

  if (!install.found) {
    actions.push('install'); // Need to install Ollama
  } else if (!connection.connected) {
    actions.push('start'); // Ollama installed but not running
  }

  if (install.found && models.models.length === 0) {
    actions.push('pull_model'); // No models downloaded
  }

  if (connection.connected && models.models.length > 0) {
    actions.push('ready'); // All good
  }

  if (!install.found) {
    actions.push('search_drives'); // Offer to search all drives
  }

  return actions;
}
