// ============================================
// Ollama Health Monitor — VRAM monitoring,
// stall detection, auto-fallback triggers
// ============================================
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface OllamaHealthStatus {
  online: boolean;
  lastChecked: string;
  responseTimeMs: number;
  models: string[];
  vram: VRAMStatus | null;
  errors: string[];
}

export interface VRAMStatus {
  totalMB: number;
  usedMB: number;
  freeMB: number;
  utilizationPercent: number;
  /** True when VRAM usage exceeds 90% — risk of OOM */
  critical: boolean;
  gpuName: string;
}

export interface HealthEvent {
  type: 'ollama_online' | 'ollama_offline' | 'vram_critical' | 'vram_normal' | 'ollama_stall' | 'ollama_oom';
  details: string;
  timestamp: string;
}

type HealthCallback = (event: HealthEvent) => void;

/** Default Ollama API base URL */
const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

/** Health check interval */
const CHECK_INTERVAL_MS = 30_000; // 30 seconds

/** Response time threshold for stall detection */
const STALL_THRESHOLD_MS = 60_000; // 1 minute

/** VRAM critical threshold */
const VRAM_CRITICAL_PERCENT = 90;

export class OllamaHealthMonitor {
  private baseUrl: string;
  private status: OllamaHealthStatus;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private listeners: HealthCallback[] = [];
  private lastResponseTimes: number[] = [];
  private wasOnline = false;
  private wasCriticalVram = false;

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl || DEFAULT_OLLAMA_URL).replace(/\/$/, '');
    this.status = {
      online: false,
      lastChecked: new Date().toISOString(),
      responseTimeMs: 0,
      models: [],
      vram: null,
      errors: [],
    };
  }

  /**
   * Register a listener for health events.
   */
  onHealthChange(callback: HealthCallback): () => void {
    this.listeners.push(callback);
    return () => { this.listeners = this.listeners.filter(l => l !== callback); };
  }

  private emitEvent(event: HealthEvent): void {
    for (const listener of this.listeners) {
      try { listener(event); } catch { /* ignore */ }
    }
  }

  /**
   * Start periodic health monitoring.
   */
  startMonitoring(intervalMs: number = CHECK_INTERVAL_MS): void {
    if (this.intervalId) return;
    // Initial check
    this.checkHealth().catch(() => {});
    this.intervalId = setInterval(() => {
      this.checkHealth().catch(() => {});
    }, intervalMs);
  }

  /**
   * Stop monitoring.
   */
  stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Perform a full health check: ping Ollama, list models, check VRAM.
   */
  async checkHealth(): Promise<OllamaHealthStatus> {
    const errors: string[] = [];
    const startTime = Date.now();
    let online = false;
    let models: string[] = [];

    // 1. Ping Ollama API
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const resp = await fetch(this.baseUrl + '/api/tags', { signal: controller.signal });
      clearTimeout(timeout);

      if (resp.ok) {
        online = true;
        const data = await resp.json() as { models?: Array<{ name: string }> };
        models = (data.models || []).map(m => m.name);
      } else {
        errors.push('Ollama returned HTTP ' + resp.status);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        errors.push('Ollama health check timed out (10s)');
      } else {
        errors.push('Ollama unreachable: ' + (err.message || 'unknown error'));
      }
    }

    const responseTime = Date.now() - startTime;
    this.lastResponseTimes.push(responseTime);
    if (this.lastResponseTimes.length > 20) this.lastResponseTimes.shift();

    // 2. Check VRAM
    let vram: VRAMStatus | null = null;
    try {
      vram = await this.getVRAMStatus();
    } catch {
      // No GPU or nvidia-smi not available
    }

    // 3. Update status
    this.status = {
      online,
      lastChecked: new Date().toISOString(),
      responseTimeMs: responseTime,
      models,
      vram,
      errors,
    };

    // 4. Emit state change events
    if (online && !this.wasOnline) {
      this.emitEvent({ type: 'ollama_online', details: models.length + ' models available', timestamp: this.status.lastChecked });
    } else if (!online && this.wasOnline) {
      this.emitEvent({ type: 'ollama_offline', details: errors.join('; '), timestamp: this.status.lastChecked });
    }
    this.wasOnline = online;

    // VRAM state transitions
    if (vram) {
      if (vram.critical && !this.wasCriticalVram) {
        this.emitEvent({ type: 'vram_critical', details: `VRAM ${vram.utilizationPercent}% — ${vram.freeMB}MB free of ${vram.totalMB}MB`, timestamp: this.status.lastChecked });
      } else if (!vram.critical && this.wasCriticalVram) {
        this.emitEvent({ type: 'vram_normal', details: `VRAM ${vram.utilizationPercent}% — ${vram.freeMB}MB free`, timestamp: this.status.lastChecked });
      }
      this.wasCriticalVram = vram.critical;
    }

    // Stall detection
    if (responseTime > STALL_THRESHOLD_MS) {
      this.emitEvent({ type: 'ollama_stall', details: `Response took ${responseTime}ms`, timestamp: this.status.lastChecked });
    }

    return this.status;
  }

  /**
   * Get GPU VRAM status via nvidia-smi.
   */
  async getVRAMStatus(): Promise<VRAMStatus | null> {
    try {
      const { stdout } = await execAsync(
        'nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free,utilization.gpu --format=csv,noheader,nounits',
        { timeout: 5000 }
      );

      const lines = stdout.trim().split('\n');
      if (lines.length === 0) return null;

      const parts = lines[0].split(',').map(s => s.trim());
      if (parts.length < 5) return null;

      const totalMB = parseInt(parts[1]) || 0;
      const usedMB = parseInt(parts[2]) || 0;
      const freeMB = parseInt(parts[3]) || 0;
      const utilizationPercent = totalMB > 0 ? Math.round((usedMB / totalMB) * 100) : 0;

      return {
        gpuName: parts[0],
        totalMB,
        usedMB,
        freeMB,
        utilizationPercent,
        critical: utilizationPercent >= VRAM_CRITICAL_PERCENT,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get average response time (rolling).
   */
  getAverageResponseTime(): number {
    if (this.lastResponseTimes.length === 0) return 0;
    return Math.round(this.lastResponseTimes.reduce((a, b) => a + b, 0) / this.lastResponseTimes.length);
  }

  /**
   * Get the current health status.
   */
  getStatus(): OllamaHealthStatus {
    return { ...this.status };
  }

  /**
   * Check if Ollama is healthy enough to use.
   */
  isHealthy(): boolean {
    return this.status.online && !this.status.vram?.critical;
  }

  /**
   * Get recommended model based on available VRAM.
   * Based on hardware.ts VRAM budget tiers.
   */
  getRecommendedModel(): string | null {
    if (!this.status.online || this.status.models.length === 0) return null;

    const freeMB = this.status.vram?.freeMB || 0;

    // VRAM budget recommendations
    if (freeMB >= 24000) return this.findModel(['codestral', 'qwen2.5-coder:32b', 'deepseek-coder-v2']);
    if (freeMB >= 16000) return this.findModel(['qwen2.5-coder:14b', 'codellama:34b', 'deepseek-coder:33b']);
    if (freeMB >= 8000) return this.findModel(['qwen2.5-coder:7b', 'codellama:13b', 'deepseek-coder:6.7b']);
    if (freeMB >= 4000) return this.findModel(['qwen2.5-coder:3b', 'codellama:7b', 'phi3:mini']);
    if (freeMB >= 2000) return this.findModel(['qwen2.5-coder:1.5b', 'tinyllama', 'phi3:mini']);

    // Very low VRAM — use whatever is available
    return this.status.models[0] || null;
  }

  private findModel(preferences: string[]): string | null {
    for (const pref of preferences) {
      const found = this.status.models.find(m => m.toLowerCase().includes(pref.toLowerCase()));
      if (found) return found;
    }
    // Return first available if none match preferences
    return this.status.models[0] || null;
  }

  /**
   * Format status for event emission.
   */
  formatForEvent(): Record<string, any> {
    return {
      online: this.status.online,
      models: this.status.models.length,
      responseMs: this.status.responseTimeMs,
      vramPercent: this.status.vram?.utilizationPercent ?? null,
      vramFreeMB: this.status.vram?.freeMB ?? null,
      healthy: this.isHealthy(),
    };
  }

  /**
   * Destroy the monitor and clean up.
   */
  destroy(): void {
    this.stopMonitoring();
    this.listeners = [];
  }
}
