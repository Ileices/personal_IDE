import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, Save, Sparkles } from 'lucide-react';
import { API_BASE } from '../../config.js';

interface ModelStrategySettings {
  presetId: string;
  primaryModel: string;
  fallbackModels: string[];
  blockedModels: string[];
  cleanupFailedModels: boolean;
}

interface ModelStrategySnapshot {
  settings: ModelStrategySettings;
  failedModels: string[];
}

interface ProbeResult {
  model: string;
  provider: string;
  classification: string;
  latencyMs?: number;
}

type RateLimitStatusMap = Record<string, {
  usage?: {
    serverRemaining?: number | null;
    serverLimit?: number | null;
    backoffMs?: number;
    consecutiveFailures?: number;
  };
  dead?: boolean;
}>;

function dedupeModels(models: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const model of models) {
    const trimmed = model.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function parseModelList(raw: string): string[] {
  return dedupeModels(raw.split(/[\n,]/g));
}

function stringifyModelList(models: string[]): string {
  return dedupeModels(models).join('\n');
}

function normalizeProbeResults(rawResults: unknown[]): ProbeResult[] {
  return rawResults
    .map((row) => {
      const r = row as Record<string, unknown>;
      const model = String(r.modelId ?? r.model ?? '');
      const provider = String(r.routingProvider ?? r.provider ?? '');
      const classification = String(r.classification ?? 'error');
      const success = Boolean(r.success ?? r.ok ?? classification === 'working');
      const latencyMs = typeof r.latencyMs === 'number' ? r.latencyMs : undefined;
      return {
        model,
        provider,
        classification,
        latencyMs,
        success,
      };
    })
    .filter((item) => item.model && item.success && item.classification === 'working')
    .sort((a, b) => (a.latencyMs ?? Number.MAX_SAFE_INTEGER) - (b.latencyMs ?? Number.MAX_SAFE_INTEGER))
    .map(({ model, provider, classification, latencyMs }) => ({ model, provider, classification, latencyMs }));
}

function statusLabelForModel(statusEntry: RateLimitStatusMap[string] | undefined): { label: string; tone: string } {
  if (!statusEntry) return { label: 'unknown', tone: 'text-ide-text-dim border-ide-border' };
  if (statusEntry.dead) return { label: 'dead', tone: 'text-red-300 border-red-500/50' };

  const usage = statusEntry.usage || {};
  if ((usage.consecutiveFailures || 0) > 0 || (usage.backoffMs || 0) > 0) {
    return { label: 'backoff', tone: 'text-yellow-300 border-yellow-500/50' };
  }

  if (usage.serverRemaining === 0) {
    return { label: 'exhausted', tone: 'text-red-300 border-red-500/50' };
  }

  if (typeof usage.serverRemaining === 'number' && typeof usage.serverLimit === 'number' && usage.serverLimit > 0) {
    const pct = Math.round((usage.serverRemaining / usage.serverLimit) * 100);
    if (pct <= 10) {
      return { label: `low ${pct}%`, tone: 'text-yellow-300 border-yellow-500/50' };
    }
  }

  return { label: 'ready', tone: 'text-emerald-300 border-emerald-500/50' };
}

const ModelCycleStrategyPanel: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [probing, setProbing] = useState(false);

  const [presetId, setPresetId] = useState('');
  const [primaryModel, setPrimaryModel] = useState('');
  const [fallbackInput, setFallbackInput] = useState('');
  const [blockedInput, setBlockedInput] = useState('');
  const [cleanupFailedModels, setCleanupFailedModels] = useState(true);
  const [failedModels, setFailedModels] = useState<string[]>([]);
  const [workingModels, setWorkingModels] = useState<ProbeResult[]>([]);
  const [statusMap, setStatusMap] = useState<RateLimitStatusMap>({});

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const applySnapshot = useCallback((snapshot: ModelStrategySnapshot) => {
    setPresetId(snapshot.settings.presetId || '');
    setPrimaryModel(snapshot.settings.primaryModel || '');
    setFallbackInput(stringifyModelList(snapshot.settings.fallbackModels || []));
    setBlockedInput(stringifyModelList(snapshot.settings.blockedModels || []));
    setCleanupFailedModels(Boolean(snapshot.settings.cleanupFailedModels));
    setFailedModels(Array.isArray(snapshot.failedModels) ? snapshot.failedModels : []);
  }, []);

  const loadStrategy = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/model-strategy`);
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok || !data || typeof data !== 'object' || !('settings' in data)) {
      const message = typeof data.error === 'string' ? data.error : 'Failed to load model strategy';
      throw new Error(message);
    }
    applySnapshot(data as ModelStrategySnapshot);
  }, [applySnapshot]);

  const loadRateStatus = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/models/status`);
    if (!res.ok) return;
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    const incoming = (data.status || {}) as RateLimitStatusMap;
    setStatusMap(incoming);
  }, []);

  const refreshAll = useCallback(async () => {
    setError(null);
    setNotice(null);
    try {
      await Promise.all([loadStrategy(), loadRateStatus()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh panel data');
    } finally {
      setLoading(false);
    }
  }, [loadRateStatus, loadStrategy]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const currentChain = useMemo(() => {
    return dedupeModels([primaryModel, ...parseModelList(fallbackInput)]);
  }, [fallbackInput, primaryModel]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        presetId: presetId.trim() || 'manual',
        primaryModel: primaryModel.trim(),
        fallbackModels: parseModelList(fallbackInput),
        blockedModels: parseModelList(blockedInput),
        cleanupFailedModels,
      };

      const res = await fetch(`${API_BASE}/api/model-strategy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({} as Record<string, unknown>));

      if (!res.ok || !data || typeof data !== 'object' || !('settings' in data)) {
        const message = typeof data.error === 'string' ? data.error : 'Failed to save model strategy';
        throw new Error(message);
      }

      applySnapshot({
        settings: data.settings as ModelStrategySettings,
        failedModels,
      });
      setNotice('Model strategy saved.');
      await loadRateStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save model strategy');
    } finally {
      setSaving(false);
    }
  }, [applySnapshot, blockedInput, cleanupFailedModels, failedModels, fallbackInput, loadRateStatus, presetId, primaryModel]);

  const handleCleanupFailed = useCallback(async () => {
    setCleaning(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`${API_BASE}/api/model-strategy/cleanup-failed`, { method: 'POST' });
      const data = await res.json().catch(() => ({} as Record<string, unknown>));

      if (!res.ok || !data || typeof data !== 'object' || !('settings' in data)) {
        const message = typeof data.error === 'string' ? data.error : 'Failed to clean failed models';
        throw new Error(message);
      }

      const removed = Array.isArray(data.removedModelIds) ? data.removedModelIds.length : 0;
      applySnapshot({
        settings: data.settings as ModelStrategySettings,
        failedModels,
      });
      setNotice(removed > 0 ? `Blocked ${removed} failed model(s).` : 'No failed models needed cleanup.');
      await loadStrategy();
      await loadRateStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clean failed models');
    } finally {
      setCleaning(false);
    }
  }, [applySnapshot, failedModels, loadRateStatus, loadStrategy]);

  const handleProbeModels = useCallback(async () => {
    setProbing(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`${API_BASE}/api/models/bulk-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'github', timeoutMs: 15000 }),
      });
      const data = await res.json().catch(() => ({} as Record<string, unknown>));

      if (!res.ok) {
        const message = typeof data.error === 'string' ? data.error : 'Bulk test failed';
        throw new Error(message);
      }

      const rawResults = Array.isArray(data.results) ? data.results : [];
      const working = normalizeProbeResults(rawResults);
      setWorkingModels(working);
      setNotice(
        working.length
          ? `Detected ${working.length} working model(s). Use Apply Suggestions to stage them.`
          : 'No working models detected from this probe.'
      );
      await loadRateStatus();
      await loadStrategy();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Model probe failed');
    } finally {
      setProbing(false);
    }
  }, [loadRateStatus, loadStrategy]);

  const handleApplySuggestions = useCallback(() => {
    if (!workingModels.length) return;

    const blockedSet = new Set(parseModelList(blockedInput));
    const available = workingModels
      .map((item) => item.model)
      .filter((model) => !blockedSet.has(model));

    if (!available.length) {
      setNotice('All probed models are currently blocked. Unblock at least one model first.');
      return;
    }

    setPrimaryModel(available[0]);
    setFallbackInput(stringifyModelList(available.slice(1, 9)));
    setNotice(`Applied ${Math.min(available.length, 9)} suggestion(s) into the editor. Save to persist.`);
  }, [blockedInput, workingModels]);

  return (
    <div className="rounded-lg border border-ide-border bg-ide-panel p-4 text-sm text-ide-text">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-blue-300">
          <Sparkles className="h-4 w-4" />
          <span className="font-semibold">Model Cycle Strategy</span>
        </div>
        <button
          type="button"
          onClick={() => void refreshAll()}
          className="rounded border border-ide-border px-2 py-1 text-xs text-ide-text-dim transition hover:text-ide-text"
          disabled={loading}
          title="Refresh strategy and status"
        >
          <span className="inline-flex items-center gap-1">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </span>
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded border border-red-500/40 bg-red-950/30 px-3 py-2 text-red-200">
          <div className="inline-flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {notice && (
        <div className="mb-3 rounded border border-emerald-500/40 bg-emerald-950/20 px-3 py-2 text-emerald-200">
          {notice}
        </div>
      )}

      <div className="grid gap-3">
        <label className="grid gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-ide-text-dim">Preset ID</span>
          <input
            className="rounded border border-ide-border bg-ide-bg px-2 py-1.5 text-sm"
            value={presetId}
            onChange={(e) => setPresetId(e.target.value)}
            placeholder="intel-auto-cycle"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-ide-text-dim">Primary Model</span>
          <input
            className="rounded border border-ide-border bg-ide-bg px-2 py-1.5 text-sm"
            value={primaryModel}
            onChange={(e) => setPrimaryModel(e.target.value)}
            placeholder="github/gpt-4.1"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-ide-text-dim">Fallback Models</span>
          <textarea
            className="min-h-[88px] rounded border border-ide-border bg-ide-bg px-2 py-1.5 text-sm"
            value={fallbackInput}
            onChange={(e) => setFallbackInput(e.target.value)}
            placeholder="One model per line or comma-separated"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-ide-text-dim">Blocked Models</span>
          <textarea
            className="min-h-[70px] rounded border border-ide-border bg-ide-bg px-2 py-1.5 text-sm"
            value={blockedInput}
            onChange={(e) => setBlockedInput(e.target.value)}
            placeholder="Models to skip when resolving strategy"
          />
        </label>

        <label className="inline-flex items-center gap-2 text-xs text-ide-text-dim">
          <input
            type="checkbox"
            checked={cleanupFailedModels}
            onChange={(e) => setCleanupFailedModels(e.target.checked)}
          />
          Auto-cleanup persistently failed models
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || loading || !primaryModel.trim()}
          className="rounded border border-emerald-500/60 bg-emerald-700/20 px-3 py-1.5 text-xs text-emerald-200 transition hover:bg-emerald-700/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="inline-flex items-center gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving...' : 'Save Strategy'}
          </span>
        </button>
        <button
          type="button"
          onClick={() => void handleCleanupFailed()}
          disabled={cleaning || loading}
          className="rounded border border-yellow-500/60 bg-yellow-700/20 px-3 py-1.5 text-xs text-yellow-200 transition hover:bg-yellow-700/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {cleaning ? 'Cleaning...' : 'Cleanup Failed'}
        </button>
        <button
          type="button"
          onClick={() => void handleProbeModels()}
          disabled={probing || loading}
          className="rounded border border-blue-500/60 bg-blue-700/20 px-3 py-1.5 text-xs text-blue-200 transition hover:bg-blue-700/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {probing ? 'Probing...' : 'Probe Working Models'}
        </button>
        <button
          type="button"
          onClick={handleApplySuggestions}
          disabled={!workingModels.length}
          className="rounded border border-violet-500/60 bg-violet-700/20 px-3 py-1.5 text-xs text-violet-200 transition hover:bg-violet-700/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Apply Suggestions
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded border border-ide-border bg-ide-bg/50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ide-text-dim">Current Chain Status</p>
          {currentChain.length === 0 ? (
            <p className="text-xs text-ide-text-dim">Add a primary model to build a strategy chain.</p>
          ) : (
            <ul className="space-y-1.5">
              {currentChain.map((modelId) => {
                const status = statusLabelForModel(statusMap[modelId]);
                return (
                  <li key={modelId} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-ide-text" title={modelId}>{modelId}</span>
                    <span className={`rounded border px-1.5 py-0.5 ${status.tone}`}>{status.label}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded border border-ide-border bg-ide-bg/50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ide-text-dim">Failed Model Candidates</p>
          {failedModels.length === 0 ? (
            <p className="text-xs text-ide-text-dim">No persistent-failure candidates reported.</p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-auto">
              {failedModels.map((model) => (
                <li key={model} className="truncate text-xs text-ide-text" title={model}>{model}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {workingModels.length > 0 && (
        <div className="mt-3 rounded border border-ide-border bg-ide-bg/50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ide-text-dim">Working Model Suggestions</p>
          <ul className="max-h-44 space-y-1 overflow-auto">
            {workingModels.map((item) => (
              <li key={`${item.model}-${item.provider}`} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate" title={item.model}>{item.model}</span>
                <span className="text-ide-text-dim">
                  {item.latencyMs ? `${item.latencyMs}ms` : item.classification}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ModelCycleStrategyPanel;
