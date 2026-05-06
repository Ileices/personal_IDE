// ============================================
// Provider Settings Panel
// Configure AI providers, view setup links,
// manage API keys
// ============================================
import React, { useEffect, useState } from 'react';
import {
  Settings, ExternalLink, Check, X, RefreshCw,
  Loader2, Shield, Wifi, WifiOff, Key, Monitor, Zap, Globe,
  Download, GitMerge, AlertTriangle
} from 'lucide-react';
import { OllamaSetup } from './OllamaSetup';
import { API_BASE } from '../config.js';
import { useModelStore } from '../stores/modelStore';

interface ProviderInfo {
  id: string;
  name: string;
  baseURL: string;
  requiresApiKey: boolean;
  description: string;
  setupUrl: string;
  freeModelNames?: string[];
  enabled: boolean;
  hasApiKey: boolean;
  configuredAt: string | null;
}

export function ProviderSettings({ onClose }: { onClose: () => void }) {
  const {
    allModels, failedModels, bulkTestInProgress, bulkTestProgress,
    fetchModels: fetchAllModels, testAllModels, testModel, clearFailed, fetchInstalledLocalModels,
  } = useModelStore();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { success: boolean; message: string }>>({});
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [showOllamaSetup, setShowOllamaSetup] = useState(false);
  const [nanoStatus, setNanoStatus] = useState<{online: boolean; nanos: number; tier: string; uptime: string; meshPeers: number} | null>(null);
  const [nanoLoading, setNanoLoading] = useState(false);
  const [githubPat, setGithubPat] = useState('');
  const [updatingGithub, setUpdatingGithub] = useState(false);
  const [githubResult, setGithubResult] = useState<{ success: boolean; message: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'providers' | 'failed'>('providers');

  // App auto-update
  const [updateStatus, setUpdateStatus] = useState<{ branch?: string; behindCount?: number; recentCommits?: string } | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateResult, setUpdateResult] = useState<{ success: boolean; message: string; alreadyUpToDate?: boolean } | null>(null);

  useEffect(() => {
    fetchProviders();
    checkNanoStatus();
    fetchAllModels();
    fetchInstalledLocalModels();
    void fetchUpdateStatus();
  }, []);

  const failedEntries = Object.values(failedModels).sort((a, b) => b.lastTestedAt - a.lastTestedAt);

  function getFailureHelp(classification: string): string {
    switch (classification) {
      case 'not_configured': return 'Provider not configured. Add the API key or enable the provider, then retry.';
      case 'cost_blocked': return 'The provider rejected the call because billing, credits, or quota are missing.';
      case 'rate_limited': return 'The model hit a rate limit. It will be skipped for the current session and can be retried later.';
      case 'not_installed': return 'This is a local Ollama model that is not installed on disk yet.';
      case 'discontinued': return 'The provider no longer exposes this model. Remove it from chains and delete it if it is a stale local install.';
      default: return 'The test failed. Inspect the error and retry after correcting the provider or model setup.';
    }
  }

  async function deleteLocalModel(modelId: string) {
    const model = modelId.replace(/^ollama\//, '');
    await fetch(`${API_BASE}/api/providers/ollama/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    }).catch(() => {});
    clearFailed(modelId);
    fetchInstalledLocalModels();
    void fetchAllModels(true);
  }

  async function checkNanoStatus() {
    setNanoLoading(true);
    try {
      // Route through API proxy to avoid ERR_CONNECTION_REFUSED console spam
      const [healthRes, meshRes] = await Promise.all([
        fetch(`${API_BASE}/api/nano/status`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API_BASE}/api/nano/mesh/info`).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      const apiData = healthRes?.api || healthRes;
      if (apiData?.status === 'ok' || healthRes?.running) {
        setNanoStatus({
          online: true,
          nanos: apiData?.nano_count || 0,
          tier: meshRes?.tier != null ? `Tier ${meshRes.tier}` : 'Unknown',
          uptime: apiData?.uptime_s ? `${Math.floor(apiData.uptime_s / 60)}m` : '?',
          meshPeers: meshRes?.peers?.length || 0,
        });
      } else {
        setNanoStatus({ online: false, nanos: 0, tier: '-', uptime: '-', meshPeers: 0 });
      }
    } catch {
      setNanoStatus({ online: false, nanos: 0, tier: '-', uptime: '-', meshPeers: 0 });
    } finally {
      setNanoLoading(false);
    }
  }

  async function fetchProviders() {
    try {
      const res = await fetch(`${API_BASE}/api/providers`);
      const data = await res.json();
      setProviders(data);
    } catch (err) {
      console.error('Failed to fetch providers:', err);
    } finally {
      setLoading(false);
    }
  }

  async function toggleProvider(id: string, enable: boolean) {
    await fetch(`${API_BASE}/api/providers/${id}/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: enable }),
    });
    fetchProviders();
    void fetchAllModels(true);
  }

  async function saveApiKey(id: string) {
    const key = apiKeys[id];
    if (!key) return;
    await fetch(`${API_BASE}/api/providers/${id}/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key, enabled: true }),
    });
    setApiKeys(prev => ({ ...prev, [id]: '' }));
    fetchProviders();
    void fetchAllModels(true);
  }

  async function testProvider(id: string) {
    setTesting(id);
    try {
      const res = await fetch(`${API_BASE}/api/providers/${id}/test`, { method: 'POST' });
      const data = await res.json();
      setTestResult(prev => ({
        ...prev,
        [id]: {
          success: data.success,
          message: data.success ? `Found ${data.modelCount} models` : data.error,
        },
      }));
    } catch (err: any) {
      setTestResult(prev => ({
        ...prev,
        [id]: { success: false, message: err.message },
      }));
    } finally {
      setTesting(null);
    }
  }

  async function fetchUpdateStatus() {
    try {
      const res = await fetch(`${API_BASE}/api/app/update-status`);
      if (!res.ok) return;
      const data = await res.json();
      setUpdateStatus(data);
    } catch { /* best-effort */ }
  }

  async function runAppUpdate() {
    setUpdateBusy(true);
    setUpdateResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/app/update`, { method: 'POST' });
      const data = await res.json();
      setUpdateResult(data);
      if (data.success) {
        // Refresh status after update
        await fetchUpdateStatus();
      }
    } catch (err: any) {
      setUpdateResult({ success: false, message: err.message });
    } finally {
      setUpdateBusy(false);
    }
  }

  async function updateGithubPat() {
    setUpdatingGithub(true);
    setGithubResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pat: githubPat }),
      });
      const data = await res.json();
      if (data.success) {
        setGithubResult({ success: true, message: `Token updated for @${data.user.login}${data.user.hasCopilot ? ' (Copilot ✓)' : ''}` });
        setGithubPat('');
        void fetchAllModels(true);
      } else {
        setGithubResult({ success: false, message: data.error || 'Invalid token' });
      }
    } catch (err: any) {
      setGithubResult({ success: false, message: err.message });
    } finally {
      setUpdatingGithub(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[700px] max-h-[80vh] bg-ide-sidebar border border-ide-border rounded-xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-ide-border">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-ide-accent" />
            <h2 className="text-lg font-semibold">AI Provider Settings</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-ide-bg rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex items-center gap-2 border-b border-ide-border pb-3 mb-1">
            <button
              onClick={() => setActiveTab('providers')}
              className={`px-3 py-1.5 text-xs rounded border transition-colors ${activeTab === 'providers' ? 'border-ide-accent text-ide-accent bg-ide-accent/10' : 'border-ide-border text-ide-text-dim'}`}
            >
              Providers
            </button>
            <button
              onClick={() => setActiveTab('failed')}
              className={`px-3 py-1.5 text-xs rounded border transition-colors ${activeTab === 'failed' ? 'border-red-500/40 text-red-400 bg-red-500/10' : 'border-ide-border text-ide-text-dim'}`}
            >
              Failed Models ({failedEntries.length})
            </button>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => testAllModels(allModels.map(m => m.id))}
                disabled={bulkTestInProgress || allModels.length === 0}
                className="px-3 py-1.5 text-xs bg-ide-accent/20 text-ide-accent rounded hover:bg-ide-accent/30 disabled:opacity-50"
              >
                {bulkTestInProgress ? `Testing ${bulkTestProgress.completed}/${bulkTestProgress.total}` : `Bulk Cleanup: Test All ${allModels.length}`}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-ide-accent" />
            </div>
          ) : (
            <>
              {activeTab === 'providers' && (
                <>
              {/* ── App Update from GitHub ── */}
              <div className="border rounded-lg p-3 border-green-500/30 bg-green-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <GitMerge className="w-4 h-4 text-green-400" />
                  <span className="font-medium text-sm">Update App from GitHub</span>
                  {updateStatus?.behindCount != null && updateStatus.behindCount > 0 && (
                    <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded flex items-center gap-0.5 ml-auto">
                      <AlertTriangle className="w-2.5 h-2.5" /> {updateStatus.behindCount} commit{updateStatus.behindCount !== 1 ? 's' : ''} behind
                    </span>
                  )}
                  {updateStatus?.behindCount === 0 && (
                    <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded flex items-center gap-0.5 ml-auto">
                      <Check className="w-2.5 h-2.5" /> Up to date
                    </span>
                  )}
                </div>
                {updateStatus && (
                  <div className="mb-2 text-[10px] text-ide-text-dim space-y-0.5">
                    <div>Branch: <span className="text-ide-text">{updateStatus.branch}</span></div>
                    {updateStatus.recentCommits && (
                      <div className="font-mono bg-ide-bg/60 rounded p-1.5 text-[9px] whitespace-pre max-h-16 overflow-y-auto">
                        {updateStatus.recentCommits}
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-ide-text-dim mb-2">
                  Pulls the latest version from <span className="text-green-300">github.com/Ileices/personal_IDE</span> (origin/main). Requires git to be installed and the repo to have a clean working tree.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={runAppUpdate}
                    disabled={updateBusy}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-green-500/20 text-green-300 rounded hover:bg-green-500/30 disabled:opacity-40 border border-green-500/30"
                  >
                    {updateBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                    {updateBusy ? 'Updating…' : 'Pull Latest Update'}
                  </button>
                  <button
                    onClick={fetchUpdateStatus}
                    disabled={updateBusy}
                    className="px-3 py-1.5 text-xs text-ide-text-dim hover:text-ide-text border border-ide-border rounded hover:border-ide-accent/30 flex items-center gap-1"
                    title="Check for updates"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
                {updateResult && (
                  <div className={`mt-2 text-xs px-2 py-1.5 rounded whitespace-pre-wrap ${
                    updateResult.success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                  }`}>
                    {updateResult.success
                      ? <Check className="w-3 h-3 inline mr-1" />
                      : <X className="w-3 h-3 inline mr-1" />
                    }
                    {updateResult.message}
                    {updateResult.success && !updateResult.alreadyUpToDate && (
                      <div className="mt-1 text-[10px] text-yellow-300">⚡ Restart the server to apply changes (pnpm dev).</div>
                    )}
                  </div>
                )}
              </div>

              {/* ── GitHub Token Update ── */}
              <div className="border rounded-lg p-3 border-ide-accent/30 bg-ide-accent/5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium text-sm">GitHub Token (PAT)</span>
                  <span className="text-[10px] bg-ide-accent/20 text-ide-accent px-1.5 py-0.5 rounded">
                    Required for Copilot Models
                  </span>
                </div>
                <p className="text-xs text-ide-text-dim mb-2">
                  Update your GitHub Personal Access Token when it expires. Needs <code className="text-ide-accent">models:read</code> and <code className="text-ide-accent">read:user</code> scopes.
                </p>
                <div className="flex gap-1.5">
                  <input
                    id="github-pat"
                    name="github-pat"
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={githubPat}
                    onChange={e => setGithubPat(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && updateGithubPat()}
                    className="flex-1 text-xs bg-ide-bg border border-ide-border rounded px-2 py-1.5 focus:border-ide-accent focus:outline-none"
                  />
                  <button
                    onClick={updateGithubPat}
                    disabled={!githubPat.trim() || updatingGithub}
                    className="px-3 py-1 text-xs bg-ide-accent/20 text-ide-accent rounded hover:bg-ide-accent/30 disabled:opacity-40 flex items-center gap-1"
                  >
                    {updatingGithub ? <Loader2 className="w-3 h-3 animate-spin" /> : <Key className="w-3 h-3" />}
                    Update
                  </button>
                </div>
                {githubResult && (
                  <div className={`mt-2 text-xs px-2 py-1 rounded ${
                    githubResult.success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                  }`}>
                    {githubResult.success ? <Check className="w-3 h-3 inline mr-1" /> : <X className="w-3 h-3 inline mr-1" />}
                    {githubResult.message}
                  </div>
                )}
              </div>

              {/* ── Ollama Setup Button ── */}
              <button
                onClick={() => setShowOllamaSetup(true)}
                className="w-full border rounded-lg p-3 border-ide-border bg-ide-bg hover:border-ide-accent/30 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-ide-accent" />
                  <span className="font-medium text-sm">Ollama Setup Wizard</span>
                  <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded ml-auto">
                    Local AI
                  </span>
                </div>
                <p className="text-xs text-ide-text-dim mt-1">
                  Detect hardware, install Ollama, download the best coding model for your PC.
                </p>
              </button>

              {/* ── Nano Sea Status ── */}
              <div className="border rounded-lg p-3 border-ide-border bg-ide-bg">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-purple-400" />
                  <span className="font-medium text-sm">Nano Sea</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ml-auto flex items-center gap-1 ${
                    nanoStatus?.online ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {nanoStatus?.online ? <><Wifi className="w-2.5 h-2.5" /> Alive</> : <><WifiOff className="w-2.5 h-2.5" /> Offline</>}
                  </span>
                </div>
                {nanoStatus?.online ? (
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div className="bg-ide-bg border border-ide-border rounded p-1.5 text-center">
                      <div className="text-ide-accent font-bold">{nanoStatus.nanos}</div>
                      <div className="text-ide-text-dim text-[10px]">Nanos</div>
                    </div>
                    <div className="bg-ide-bg border border-ide-border rounded p-1.5 text-center">
                      <div className="text-purple-400 font-bold">{nanoStatus.tier}</div>
                      <div className="text-ide-text-dim text-[10px]">Compute</div>
                    </div>
                    <div className="bg-ide-bg border border-ide-border rounded p-1.5 text-center">
                      <div className="text-yellow-400 font-bold">{nanoStatus.uptime}</div>
                      <div className="text-ide-text-dim text-[10px]">Uptime</div>
                    </div>
                    <div className="bg-ide-bg border border-ide-border rounded p-1.5 text-center">
                      <div className="text-green-400 font-bold">{nanoStatus.meshPeers}</div>
                      <div className="text-ide-text-dim text-[10px]">Peers</div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-ide-text-dim">
                    Run <code className="text-purple-400">python NANO_train/main.py</code> to start the Sea of Nanos.
                    Enable it in the provider list below, then select <code className="text-purple-400">nano/nano-sea</code> as your model.
                  </p>
                )}
                <button
                  onClick={checkNanoStatus}
                  disabled={nanoLoading}
                  className="mt-2 w-full text-[10px] py-1 text-ide-text-dim hover:text-ide-text border border-ide-border rounded hover:border-ide-accent/30 flex items-center justify-center gap-1"
                >
                  {nanoLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Refresh Status
                </button>
              </div>

              {/* ── Other Providers ── */}
              {providers.map(p => (
              <div
                key={p.id}
                className={`border rounded-lg p-3 transition-colors ${
                  p.enabled ? 'border-ide-accent/30 bg-ide-accent/5' : 'border-ide-border bg-ide-bg'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{p.name}</span>
                      {!p.requiresApiKey && (
                        <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">
                          No API Key
                        </span>
                      )}
                      {p.enabled && (
                        <span className="text-[10px] bg-ide-accent/20 text-ide-accent px-1.5 py-0.5 rounded flex items-center gap-0.5">
                          <Wifi className="w-2.5 h-2.5" /> Enabled
                        </span>
                      )}
                      {p.hasApiKey && (
                        <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                          <Key className="w-2.5 h-2.5" /> Key Set
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ide-text-dim mt-1">{p.description}</p>
                    {p.freeModelNames && p.freeModelNames.length > 0 && (
                      <p className="text-[10px] text-ide-text-dim mt-1">
                        Free models: {p.freeModelNames.slice(0, 3).join(', ')}
                        {p.freeModelNames.length > 3 && ` +${p.freeModelNames.length - 3} more`}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Test */}
                    <button
                      onClick={() => testProvider(p.id)}
                      disabled={testing === p.id}
                      className="p-1.5 hover:bg-ide-border rounded text-ide-text-dim hover:text-ide-text"
                      title="Test connection"
                    >
                      {testing === p.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                    </button>

                    {/* Setup link */}
                    {p.setupUrl && (
                      <a
                        href={p.setupUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 hover:bg-ide-border rounded text-ide-text-dim hover:text-ide-text"
                        title="Setup guide"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}

                    {/* Toggle */}
                    <button
                      onClick={() => toggleProvider(p.id, !p.enabled)}
                      className={`w-10 h-5 rounded-full transition-colors flex items-center ${
                        p.enabled ? 'bg-ide-accent' : 'bg-ide-border'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${
                          p.enabled ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Test Result */}
                {testResult[p.id] && (
                  <div className={`mt-2 text-xs px-2 py-1 rounded ${
                    testResult[p.id].success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                  }`}>
                    {testResult[p.id].success ? <Check className="w-3 h-3 inline mr-1" /> : <X className="w-3 h-3 inline mr-1" />}
                    {testResult[p.id].message}
                  </div>
                )}

                {/* API Key Input (if required) */}
                {p.requiresApiKey && (
                  <div className="mt-2 flex gap-1.5">
                    <input
                      id={`api-key-${p.id}`}
                      name={`api-key-${p.id}`}
                      type="password"
                      placeholder={p.hasApiKey ? '••••••••• (key saved)' : 'Enter API key...'}
                      value={apiKeys[p.id] || ''}
                      onChange={e => setApiKeys(prev => ({ ...prev, [p.id]: e.target.value }))}
                      className="flex-1 text-xs bg-ide-bg border border-ide-border rounded px-2 py-1.5 focus:border-ide-accent focus:outline-none"
                    />
                    <button
                      onClick={() => saveApiKey(p.id)}
                      disabled={!apiKeys[p.id]}
                      className="px-2 py-1 text-xs bg-ide-accent/20 text-ide-accent rounded hover:bg-ide-accent/30 disabled:opacity-40"
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>
            ))}
                </>
              )}

              {activeTab === 'failed' && (
                <div className="space-y-3">
                  <div className="text-xs text-ide-text-dim">
                    Failed models are automatically pushed out of the main pickers when "hide failed models" is enabled. Retry them here, clear them manually, or delete stale local copies.
                  </div>
                  {failedEntries.length === 0 && (
                    <div className="text-xs text-ide-text-dim border border-dashed border-ide-border rounded-lg p-4 text-center">
                      No failed models recorded yet.
                    </div>
                  )}
                  {failedEntries.map(entry => (
                    <div key={entry.modelId} className="border rounded-lg p-3 border-ide-border bg-ide-bg space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-ide-text">{entry.modelId}</div>
                          <div className="text-[10px] text-ide-text-dim mt-1">{getFailureHelp(entry.classification)}</div>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400">{entry.classification.replace(/_/g, ' ')}</span>
                      </div>
                      <div className="text-[11px] text-ide-text-dim bg-ide-sidebar rounded p-2 break-words">{entry.error}</div>
                      <div className="text-[10px] text-ide-text-dim">Last tested: {new Date(entry.lastTestedAt).toLocaleString()}</div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => testModel(entry.modelId)}
                          className="px-2.5 py-1 text-[10px] bg-ide-accent/20 text-ide-accent rounded hover:bg-ide-accent/30"
                        >
                          Retry Test
                        </button>
                        <button
                          onClick={() => clearFailed(entry.modelId)}
                          className="px-2.5 py-1 text-[10px] border border-ide-border rounded text-ide-text-dim hover:text-ide-text"
                        >
                          Remove from Failed List
                        </button>
                        {entry.modelId.startsWith('ollama/') && (
                          <button
                            onClick={() => deleteLocalModel(entry.modelId)}
                            className="px-2.5 py-1 text-[10px] bg-red-500/10 text-red-400 rounded hover:bg-red-500/20"
                          >
                            Delete Local Copy
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-ide-border text-[10px] text-ide-text-dim">
          <Shield className="w-3 h-3 inline mr-1" />
          API keys are encrypted and stored locally. Never transmitted outside your machine except to the provider's API.
        </div>
      </div>

      {/* Ollama Setup Wizard (portal) */}
      {showOllamaSetup && (
        <OllamaSetup onClose={() => setShowOllamaSetup(false)} />
      )}
    </div>
  );
}
