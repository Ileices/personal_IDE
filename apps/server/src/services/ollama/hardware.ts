// ─── Ollama Hardware Detection Service ───
// GPU detection, system hardware info, model recommendations
import { execSync } from 'child_process';
import os from 'os';

export interface GpuInfo {
  name: string;
  vramGB: number;
  driver: string;
}

export interface HardwareInfo {
  platform: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  totalRamGB: number;
  freeRamGB: number;
  gpus: GpuInfo[];
}

export interface ModelRecommendation {
  id: string;
  name: string;
  sizeGB: number;
  description: string;
  reason: string;
  priority: number;
}

export function detectGPUs(): GpuInfo[] {
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

export function detectHardware(): HardwareInfo {
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

export function recommendModels(hw: HardwareInfo): ModelRecommendation[] {
  const recs: ModelRecommendation[] = [];
  const bestGpu = hw.gpus.reduce((best, g) => g.vramGB > best.vramGB ? g : best, { name: '', vramGB: 0, driver: '' });
  const effectiveVram = bestGpu.vramGB;
  const effectiveRam = hw.totalRamGB;
  const budget = effectiveVram >= 4 ? effectiveVram : effectiveRam;
  const isGpu = effectiveVram >= 4;

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

  recs.push({
    id: 'qwen2.5-coder:1.5b', name: 'Qwen 2.5 Coder 1.5B', sizeGB: 1.0,
    description: 'Ultra-light coding model. Works on any machine.',
    reason: 'Runs anywhere, good for quick completions',
    priority: recs.length > 0 ? recs.length + 1 : 1,
  });

  return recs.sort((a, b) => a.priority - b.priority);
}
