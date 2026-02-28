// ─── Ollama Client Service ───
// Locate Ollama install, discover models, test connection
import { execSync } from 'child_process';
import { existsSync, statSync, readdirSync } from 'fs';
import { join } from 'path';
import os from 'os';
import { appConfig } from '../../config.js';

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

export interface OllamaInstallResult {
  found: boolean;
  path: string | null;
  executable: string | null;
  version: string | null;
}

export interface OllamaModelsResult {
  found: boolean;
  path: string | null;
  models: string[];
}

export interface OllamaConnectionResult {
  connected: boolean;
  version?: string;
  error?: string;
}

export function findOllamaInstall(): OllamaInstallResult {
  const platform = os.platform();
  const paths = platform === 'win32' ? WINDOWS_PATHS : platform === 'darwin' ? MAC_PATHS : LINUX_PATHS;

  // 1. Try `ollama --version` directly (if on PATH)
  try {
    const version = execSync('ollama --version', { timeout: 5000, encoding: 'utf-8', windowsHide: true }).trim();
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

export function findOllamaModels(): OllamaModelsResult {
  const platform = os.platform();
  const modelPaths = platform === 'win32' ? WINDOWS_MODEL_PATHS : platform === 'darwin' ? MAC_MODEL_PATHS : LINUX_MODEL_PATHS;

  for (const modPath of modelPaths) {
    try {
      if (!existsSync(modPath)) continue;
      const manifests = join(modPath, 'manifests');
      if (existsSync(manifests)) {
        const models: string[] = [];
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

export async function testOllamaConnection(
  baseUrl: string = appConfig.services.ollamaUrl,
): Promise<OllamaConnectionResult> {
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

export function buildActions(
  install: OllamaInstallResult,
  models: OllamaModelsResult,
  connection: OllamaConnectionResult,
): string[] {
  const actions: string[] = [];

  if (!install.found) {
    actions.push('install');
  } else if (!connection.connected) {
    actions.push('start');
  }

  if (install.found && models.models.length === 0) {
    actions.push('pull_model');
  }

  if (connection.connected && models.models.length > 0) {
    actions.push('ready');
  }

  if (!install.found) {
    actions.push('search_drives');
  }

  return actions;
}
