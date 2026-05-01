// ============================================
// Ollama Setup Wizard
// Diagnose → Fix → Pick Model → Download → Connect
// ============================================
import React, { useState, useEffect } from 'react';
import {
  Cpu, HardDrive, Wifi, WifiOff, Download, Play, Search,
  CheckCircle2, XCircle, Loader2, ChevronRight, Monitor,
  AlertTriangle, RefreshCw, ExternalLink
} from 'lucide-react';
import { API_BASE } from '../config.js';

interface HardwareInfo {
  platform: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  totalRamGB: number;
  freeRamGB: number;
  gpus: { name: string; vramGB: number; driver: string }[];
}

interface ModelRecommendation {
  id: string;
  name: string;
  sizeGB: number;
  description: string;
  reason: string;
  priority: number;
}

interface DiagResult {
  hardware: HardwareInfo;
  install: { found: boolean; path: string | null; executable: string | null; version: string | null };
  models: { found: boolean; path: string | null; models: string[] };
  connection: { connected: boolean; version?: string; error?: string };
  recommendations: ModelRecommendation[];
  actions: string[];
}

interface SingleGpuVram {
  index: number;
  gpuName: string;
  totalMB: number;
  usedMB: number;
  freeMB: number;
  utilizationPercent: number;
}

interface GpuStatus {
  available: boolean;
  reason?: string;
  gpuName?: string;
  totalMB?: number;
  usedMB?: number;
  freeMB?: number;
  utilizationPercent?: number;
  critical?: boolean;
  allGpus?: SingleGpuVram[];
}

type Step = 'diagnose' | 'results' | 'pick_model' | 'downloading' | 'done';

export function OllamaSetup({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>('diagnose');
  const [diag, setDiag] = useState<DiagResult | null>(null);
  const [gpuStatus, setGpuStatus] = useState<GpuStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [pullStatus, setPullStatus] = useState('');
  const [searching, setSearching] = useState(false);
  const [customUrl, setCustomUrl] = useState('http://localhost:11434');

  useEffect(() => {
    runDiagnostic();
  }, []);

  async function runDiagnostic() {
    setLoading(true);
    setError('');
    try {
      const [diagRes, gpuRes] = await Promise.all([
        fetch(`${API_BASE}/api/ollama/diagnose`),
        fetch(`${API_BASE}/api/ollama/gpu-status`).catch(() => null),
      ]);
      const data: DiagResult = await diagRes.json();
      setDiag(data);
      setStep('results');

      if (gpuRes?.ok) {
        const gs: GpuStatus = await gpuRes.json();
        setGpuStatus(gs);
      }

      // Auto-select best model
      if (data.recommendations.length > 0) {
        setSelectedModel(data.recommendations[0].id);
      }
    } catch (err: any) {
      setError('Failed to run diagnostic: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function startOllama() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/ollama/start`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await runDiagnostic();
      } else {
        setError(data.error || 'Failed to start Ollama');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function pullModel() {
    if (!selectedModel) return;
    setStep('downloading');
    setPullStatus('Starting download...');
    try {
      const res = await fetch(`${API_BASE}/api/ollama/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel }),
      });
      const data = await res.json();
      if (data.success) {
        setPullStatus('Download complete!');
        setStep('done');
      } else {
        setPullStatus('');
        setError(data.error || 'Download failed');
        setStep('pick_model');
      }
    } catch (err: any) {
      setPullStatus('');
      setError(err.message);
      setStep('pick_model');
    }
  }

  async function searchAllDrives() {
    setSearching(true);
    try {
      const res = await fetch(`${API_BASE}/api/ollama/search-drives`, { method: 'POST' });
      const data = await res.json();
      if (data.ollamaExe) {
        setError('');
        await runDiagnostic();
      } else {
        setError('Ollama not found on any drive. Please install from https://ollama.com/download');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  async function testCustomUrl() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/ollama/set-base-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: customUrl }),
      });
      const data = await res.json();
      if (data.success) {
        await runDiagnostic();
      } else {
        setError(data.error || 'Connection failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[650px] max-h-[85vh] bg-ide-sidebar border border-ide-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-ide-border shrink-0">
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-ide-accent" />
            <h2 className="text-lg font-semibold">Ollama Setup Wizard</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-ide-bg rounded">
            <XCircle className="w-5 h-5 text-ide-text-dim" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Loading state */}
          {loading && step === 'diagnose' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-ide-accent mb-3" />
              <p className="text-sm text-ide-text-dim">Scanning hardware & Ollama installation...</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            </div>
          )}

          {/* Results */}
          {step === 'results' && diag && (
            <div className="space-y-4">
              {/* Hardware */}
              <div className="p-3 bg-ide-bg rounded-lg border border-ide-border">
                <div className="flex items-center gap-2 mb-2">
                  <Cpu className="w-4 h-4 text-ide-accent" />
                  <span className="text-sm font-medium">Hardware</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-ide-text-dim">
                  <div>CPU: <span className="text-ide-text">{diag.hardware.cpuModel}</span></div>
                  <div>Cores: <span className="text-ide-text">{diag.hardware.cpuCores}</span></div>
                  <div>RAM: <span className="text-ide-text">{diag.hardware.totalRamGB}GB</span> (free: {diag.hardware.freeRamGB}GB)</div>
                  <div>Platform: <span className="text-ide-text">{diag.hardware.platform}/{diag.hardware.arch}</span></div>
                  {diag.hardware.gpus.length > 0 ? (
                    diag.hardware.gpus.map((g, i) => {
                      const liveGpu = gpuStatus?.allGpus?.[i];
                      return (
                        <div key={i} className="col-span-2">
                          <span className="text-ide-text-dim">GPU{i}: </span>
                          <span className="text-ide-text">{g.name}</span>
                          <span className="text-ide-text-dim"> ({g.vramGB}GB VRAM</span>
                          {liveGpu && (
                            <span className={liveGpu.utilizationPercent >= 90 ? 'text-red-400' : 'text-green-400'}>
                              {' — '}{liveGpu.utilizationPercent}% used, {Math.round(liveGpu.freeMB / 1024 * 10) / 10}GB free
                            </span>
                          )}
                          <span className="text-ide-text-dim">)</span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="col-span-2 text-yellow-400">No dedicated GPU detected — will use CPU inference</div>
                  )}
                </div>
              </div>

              {/* Ollama Install */}
              <div className="p-3 bg-ide-bg rounded-lg border border-ide-border">
                <div className="flex items-center gap-2 mb-2">
                  <HardDrive className="w-4 h-4 text-ide-accent" />
                  <span className="text-sm font-medium">Ollama Installation</span>
                  {diag.install.found ? (
                    <CheckCircle2 className="w-4 h-4 text-green-400 ml-auto" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400 ml-auto" />
                  )}
                </div>
                {diag.install.found ? (
                  <div className="text-xs text-ide-text-dim space-y-1">
                    <div>Path: <span className="text-ide-text">{diag.install.path || diag.install.executable}</span></div>
                    {diag.install.version && <div>Version: <span className="text-ide-text">{diag.install.version}</span></div>}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-red-400">Ollama not found in standard locations.</p>
                    <div className="flex gap-2">
                      <a
                        href="https://ollama.com/download"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-3 py-1.5 text-xs bg-ide-accent/20 text-ide-accent rounded hover:bg-ide-accent/30"
                      >
                        <Download className="w-3 h-3" /> Install Ollama
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <button
                        onClick={searchAllDrives}
                        disabled={searching}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs bg-ide-bg border border-ide-border rounded hover:bg-ide-border disabled:opacity-50"
                      >
                        {searching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                        Search all drives
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Connection */}
              <div className="p-3 bg-ide-bg rounded-lg border border-ide-border">
                <div className="flex items-center gap-2 mb-2">
                  {diag.connection.connected ? <Wifi className="w-4 h-4 text-green-400" /> : <WifiOff className="w-4 h-4 text-red-400" />}
                  <span className="text-sm font-medium">Connection</span>
                  {diag.connection.connected ? (
                    <span className="text-xs text-green-400 ml-auto">Connected (v{diag.connection.version})</span>
                  ) : (
                    <span className="text-xs text-red-400 ml-auto">{diag.connection.error}</span>
                  )}
                </div>
                {!diag.connection.connected && diag.install.found && (
                  <div className="space-y-2">
                    <button
                      onClick={startOllama}
                      disabled={loading}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                      Start Ollama
                    </button>
                    <div className="flex items-center gap-1.5 mt-2">
                      <input
                        id="ollama-url"
                        name="ollama-url"
                        value={customUrl}
                        onChange={e => setCustomUrl(e.target.value)}
                        placeholder="http://localhost:11434"
                        className="flex-1 text-xs bg-ide-sidebar border border-ide-border rounded px-2 py-1 focus:outline-none focus:border-ide-accent"
                      />
                      <button
                        onClick={testCustomUrl}
                        className="px-2 py-1 text-xs bg-ide-accent/20 text-ide-accent rounded hover:bg-ide-accent/30"
                      >
                        Test
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Local Models */}
              <div className="p-3 bg-ide-bg rounded-lg border border-ide-border">
                <div className="flex items-center gap-2 mb-2">
                  <HardDrive className="w-4 h-4 text-ide-accent" />
                  <span className="text-sm font-medium">Local Models ({diag.models.models.length})</span>
                </div>
                {diag.models.models.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {diag.models.models.map(m => (
                      <span key={m} className="text-[10px] bg-ide-accent/10 text-ide-accent px-2 py-0.5 rounded">{m}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-ide-text-dim">No models downloaded yet. Pick one below.</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={runDiagnostic}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-ide-bg border border-ide-border rounded hover:bg-ide-border"
                >
                  <RefreshCw className="w-3 h-3" /> Re-scan
                </button>
                {diag.connection.connected && (
                  <button
                    onClick={() => setStep('pick_model')}
                    className="flex items-center gap-1 px-4 py-1.5 text-xs bg-ide-accent text-white rounded hover:bg-ide-accent/80"
                  >
                    Pick a model <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Model Picker */}
          {step === 'pick_model' && diag && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Recommended Models for Your Hardware</h3>
              <p className="text-xs text-ide-text-dim">
                {diag.hardware.gpus.length > 0
                  ? `Based on your ${diag.hardware.gpus[0].name} (${diag.hardware.gpus[0].vramGB}GB VRAM)`
                  : `Based on ${diag.hardware.totalRamGB}GB RAM (CPU inference)`
                }
              </p>

              <div className="space-y-2">
                {diag.recommendations.map(rec => {
                  const alreadyInstalled = diag.models.models.some(m => m.startsWith(rec.id.split(':')[0]));
                  return (
                    <button
                      key={rec.id}
                      onClick={() => setSelectedModel(rec.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedModel === rec.id
                          ? 'border-ide-accent bg-ide-accent/10'
                          : 'border-ide-border bg-ide-bg hover:border-ide-accent/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{rec.name}</span>
                          {rec.priority === 1 && (
                            <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">BEST PICK</span>
                          )}
                          {alreadyInstalled && (
                            <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">INSTALLED</span>
                          )}
                        </div>
                        <span className="text-xs text-ide-text-dim">{rec.sizeGB}GB</span>
                      </div>
                      <p className="text-xs text-ide-text-dim mt-1">{rec.description}</p>
                      <p className="text-[10px] text-ide-accent mt-0.5">{rec.reason}</p>
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setStep('results')}
                  className="px-3 py-1.5 text-xs bg-ide-bg border border-ide-border rounded hover:bg-ide-border"
                >
                  Back
                </button>
                <button
                  onClick={pullModel}
                  disabled={!selectedModel}
                  className="flex items-center gap-1 px-4 py-1.5 text-xs bg-ide-accent text-white rounded hover:bg-ide-accent/80 disabled:opacity-50"
                >
                  <Download className="w-3 h-3" /> Download {selectedModel}
                </button>
              </div>
            </div>
          )}

          {/* Downloading */}
          {step === 'downloading' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-10 h-10 animate-spin text-ide-accent mb-4" />
              <p className="text-sm font-medium">Downloading {selectedModel}...</p>
              <p className="text-xs text-ide-text-dim mt-2">{pullStatus}</p>
              <p className="text-[10px] text-ide-text-dim mt-4">This may take several minutes depending on your internet speed.</p>
            </div>
          )}

          {/* Done */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-12">
              <CheckCircle2 className="w-12 h-12 text-green-400 mb-4" />
              <h3 className="text-lg font-semibold">Ollama is Ready!</h3>
              <p className="text-sm text-ide-text-dim mt-2">{selectedModel} has been downloaded and is ready to use.</p>
              <p className="text-xs text-ide-text-dim mt-1">Select it from the model dropdown in the top bar.</p>
              <button
                onClick={onClose}
                className="mt-6 px-6 py-2 text-sm bg-ide-accent text-white rounded hover:bg-ide-accent/80"
              >
                Close & Start Using
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
