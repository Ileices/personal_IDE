// ============================================
// Universal Model Picker
//
// THE single model selection component used everywhere:
// - THE GOD FACTORY (active model)
// - Agent Settings (model pools, role overrides)
// - Model Strategy Panel (fallback chains)
// - Midwife / Bird Feeder (task models)
// - Fleet (agent role models)
// - Top bar model switcher
//
// All of these must use this component so when
// new models are added they appear everywhere at once.
// ============================================
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { MODELS, type ModelDefinition, extractProviderFromModelId } from '@personal-ide/shared';
import { sortModelsByHealth, useModelStore } from '../stores/modelStore';
import {
  Search, ChevronDown, ChevronUp, Check, Plus, Trash2,
  Zap, Brain, Cpu, Globe, Code2, BookOpen, X, CheckSquare,
  Square as SquareIcon, LayoutList, Tag, Star,
} from 'lucide-react';import { API_BASE } from '../config';
import { OLLAMA_CATALOG } from './LocalModelCatalog';

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isFreeModel(m: ModelDefinition): boolean {
  return (
    m.tier.includes('free') ||
    m.tier.includes('gemini') ||
    m.tier.includes('cerebras') ||
    m.tier.includes('groq') ||
    m.tier.includes('qwen') ||
    m.tier.includes('fireworks') ||
    m.tier.includes('siliconflow') ||
    m.tier.includes('perplexity')
  );
}

/** Pass a routing provider key OR a full model ID (auto-extracts provider). */
export function getProviderLabel(idOrProvider: string): string {
  const p = idOrProvider.includes('/') ? extractProviderFromModelId(idOrProvider) : idOrProvider;
  const labels: Record<string, string> = {
    github: 'GitHub Models',
    'openai-direct': 'OpenAI (Direct)', 'deepseek-direct': 'DeepSeek (Direct)',
    anthropic: 'Anthropic', gemini: 'Gemini', groq: 'Groq', cerebras: 'Cerebras',
    deepseek: 'DeepSeek', qwen: 'Qwen', zhipuai: 'ZhipuAI', moonshot: 'Moonshot',
    minimax: 'MiniMax', xai: 'xAI/Grok', perplexity: 'Perplexity',
    fireworks: 'Fireworks', siliconflow: 'SiliconFlow', ollama: 'Ollama (local)',
    nano: 'Nano (local)', openrouter: 'OpenRouter', mistral: 'Mistral',
    together: 'Together AI', cohere: 'Cohere', huggingface: 'HuggingFace',
    lmstudio: 'LM Studio',
  };
  return labels[p] || p.charAt(0).toUpperCase() + p.slice(1);
}

export function groupByProvider(models: ModelDefinition[]): [string, ModelDefinition[]][] {
  const groups: Record<string, ModelDefinition[]> = {};
  for (const m of models) {
    // Use routing provider — openai/gpt-4.1 routes via GitHub Models, not OpenAI Direct
    const p = extractProviderFromModelId(m.id);
    if (!groups[p]) groups[p] = [];
    groups[p].push(m);
  }
  return Object.entries(groups).sort(([a], [b]) => {
    // GitHub Models first (PAT models), local last
    if (a === 'github') return -1;
    if (b === 'github') return 1;
    if (a === 'ollama' || a === 'nano') return 1;
    if (b === 'ollama' || b === 'nano') return -1;
    return a.localeCompare(b);
  });
}

function providerColor(idOrProvider: string): string {
  const p = idOrProvider.includes('/') ? extractProviderFromModelId(idOrProvider) : idOrProvider;
  const colors: Record<string, string> = {
    github: 'text-slate-300 bg-slate-500/10',
    'openai-direct': 'text-green-400 bg-green-500/10',
    anthropic: 'text-orange-400 bg-orange-500/10',
    gemini: 'text-blue-400 bg-blue-500/10',
    groq: 'text-purple-400 bg-purple-500/10',
    cerebras: 'text-pink-400 bg-pink-500/10',
    'deepseek-direct': 'text-cyan-400 bg-cyan-500/10',
    deepseek: 'text-cyan-400 bg-cyan-500/10',
    qwen: 'text-yellow-400 bg-yellow-500/10',
    xai: 'text-red-400 bg-red-500/10',
    fireworks: 'text-amber-400 bg-amber-500/10',
    siliconflow: 'text-teal-400 bg-teal-500/10',
    ollama: 'text-lime-400 bg-lime-500/10',
    nano: 'text-emerald-400 bg-emerald-500/10',
    openrouter: 'text-violet-400 bg-violet-500/10',
    mistral: 'text-indigo-400 bg-indigo-500/10',
  };
  return colors[p] || 'text-ide-text-dim bg-ide-panel';
}

function getLocalCatalogEntry(modelId: string) {
  const name = modelId.replace(/^ollama\//, '');
  return OLLAMA_CATALOG.find(m => m.name === name);
}

function failureBadge(classification?: string): string {
  switch (classification) {
    case 'rate_limited': return 'RATE LIMIT';
    case 'cost_blocked': return 'COST';
    case 'not_configured': return 'SETUP';
    case 'not_installed': return 'NOT INSTALLED';
    case 'discontinued': return 'DISCONTINUED';
    default: return 'FAILED';
  }
}

function MissingLocalModelModal({
  model,
  onClose,
  onReady,
}: {
  model: ModelDefinition;
  onClose: () => void;
  onReady: () => void;
}) {
  const { fetchInstalledLocalModels } = useModelStore();
  const [drives, setDrives] = useState<Array<{ path: string; freeBytes: number; totalBytes: number; hasOllamaModelsDir: boolean }>>([]);
  const [loadingDrives, setLoadingDrives] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [customPath, setCustomPath] = useState('');
  const [customStatus, setCustomStatus] = useState<string | null>(null);
  const catalogEntry = getLocalCatalogEntry(model.id);

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE}/api/ollama/drives`)
      .then(r => r.json())
      .then(data => { if (active) setDrives(data.drives || []); })
      .catch(() => {})
      .finally(() => { if (active) setLoadingDrives(false); });
    return () => { active = false; };
  }, []);

  const installModel = async () => {
    setInstalling(true);
    setCustomStatus(null);
    try {
      const res = await fetch(`${API_BASE}/api/providers/ollama/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model.id.replace(/^ollama\//, '') }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(data.error || `Install failed: HTTP ${res.status}`);
      }
      await fetchInstalledLocalModels();
      onReady();
    } catch (err: any) {
      setCustomStatus(err.message || 'Install failed');
    } finally {
      setInstalling(false);
    }
  };

  const checkCustomPath = async () => {
    if (!customPath.trim()) return;
    setCustomStatus('Checking custom destination...');
    try {
      const res = await fetch(`${API_BASE}/api/ollama/check-path`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: customPath.trim(), model: model.id.replace(/^ollama\//, '') }),
      });
      const data = await res.json();
      if (data.found) {
        setCustomStatus(`Found ${model.name} in ${customPath}`);
        onReady();
        return;
      }
      setCustomStatus(`Model not found in ${customPath}. You can install it to your active Ollama models directory instead.`);
    } catch (err: any) {
      setCustomStatus(err.message || 'Could not check custom destination');
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[640px] max-w-[95vw] bg-ide-panel border border-ide-border rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-ide-border">
          <div>
            <div className="text-sm font-semibold text-ide-text">Local model not installed</div>
            <div className="text-[11px] text-ide-text-dim mt-0.5">{model.name} is not currently available in your Ollama install.</div>
          </div>
          <button onClick={onClose} className="text-ide-text-dim hover:text-ide-text"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div className="rounded-lg border border-ide-border bg-ide-bg/50 p-3 text-xs text-ide-text-dim space-y-1">
            <div><span className="text-ide-text">Model:</span> {model.name}</div>
            {catalogEntry && <div><span className="text-ide-text">Approx size:</span> {catalogEntry.sizeGB.toFixed(1)} GB</div>}
            <div><span className="text-ide-text">Action:</span> Install now, or point the app at a custom models directory to check whether it already exists there.</div>
          </div>

          <div>
            <div className="text-xs font-medium text-ide-text mb-2">Detected drives</div>
            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
              {loadingDrives && <div className="text-xs text-ide-text-dim">Checking drives...</div>}
              {!loadingDrives && drives.length === 0 && <div className="text-xs text-ide-text-dim">No drive information available.</div>}
              {drives.map(drive => (
                <div key={drive.path} className="rounded border border-ide-border bg-ide-bg px-3 py-2 text-[11px]">
                  <div className="font-medium text-ide-text">{drive.path}</div>
                  <div className="text-ide-text-dim">Free: {(drive.freeBytes / (1024 ** 3)).toFixed(1)} GB</div>
                  <div className="text-ide-text-dim">Total: {(drive.totalBytes / (1024 ** 3)).toFixed(1)} GB</div>
                  {drive.hasOllamaModelsDir && <div className="text-green-400 mt-1">Detected Ollama models directory</div>}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-ide-text">Custom destination check</div>
            <div className="flex gap-2">
              <input
                value={customPath}
                onChange={e => setCustomPath(e.target.value)}
                placeholder="Custom Ollama models directory, e.g. D:\\OllamaModels"
                className="flex-1 bg-ide-bg border border-ide-border rounded px-2 py-1.5 text-xs focus:outline-none focus:border-ide-accent"
              />
              <button onClick={checkCustomPath} className="px-3 py-1.5 text-xs bg-ide-accent/20 text-ide-accent rounded hover:bg-ide-accent/30">
                Check Path
              </button>
            </div>
            {customStatus && <div className="text-[11px] text-ide-text-dim">{customStatus}</div>}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-ide-border bg-ide-bg/30">
          <button onClick={onClose} className="px-3 py-1.5 text-xs border border-ide-border rounded text-ide-text-dim hover:text-ide-text">Cancel</button>
          <button onClick={installModel} disabled={installing} className="px-3 py-1.5 text-xs bg-green-600/20 text-green-400 rounded hover:bg-green-600/30 disabled:opacity-50">
            {installing ? 'Installing...' : 'Auto Install to Active Ollama Path'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Single Model Dropdown ────────────────────────────────────────────────────
// Replaces every <select> / text input for picking ONE model

export function ModelDropdown({
  value,
  onChange,
  placeholder = 'Select model…',
  className = '',
  disabled = false,
}: {
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const {
    allModels, isLoading, fetchModels, fetchInstalledLocalModels,
    installedLocalModels, workingModels, failedModels,
    preferTestedModelsFirst, hideFailedModels,
    favoritedModels, toggleFavorite,
  } = useModelStore();
  type ModelFilter = 'all' | 'favorites' | 'working' | 'failed' | 'rate_limited' | 'cost_blocked' | 'discontinued' | 'not_tested';
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<ModelFilter>('all');
  const [pendingInstallModel, setPendingInstallModel] = useState<ModelDefinition | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Trigger model fetch when dropdown opens
  useEffect(() => {
    if (open) {
      fetchModels();
      fetchInstalledLocalModels();
    }
  }, [open, fetchModels, fetchInstalledLocalModels]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = useMemo(() => {
    let list = allModels;
    // Apply status filter
    switch (activeFilter) {
      case 'favorites': list = list.filter(m => favoritedModels.has(m.id)); break;
      case 'working':   list = list.filter(m => workingModels.has(m.id)); break;
      case 'not_tested': list = list.filter(m => !workingModels.has(m.id) && !failedModels[m.id]); break;
      case 'failed':    list = list.filter(m => !!failedModels[m.id]); break;
      case 'rate_limited': list = list.filter(m => failedModels[m.id]?.classification === 'rate_limited'); break;
      case 'cost_blocked': list = list.filter(m => failedModels[m.id]?.classification === 'cost_blocked'); break;
      case 'discontinued': list = list.filter(m => failedModels[m.id]?.classification === 'discontinued'); break;
      default:
        // 'all' — hide failed if the global setting is on, but always show the current selection
        if (hideFailedModels) list = list.filter(m => !failedModels[m.id] || m.id === value);
        break;
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(m =>
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.publisher.toLowerCase().includes(q)
      );
    }
    return preferTestedModelsFirst ? sortModelsByHealth(list, workingModels, failedModels) : list;
  }, [search, allModels, hideFailedModels, failedModels, preferTestedModelsFirst, workingModels, value, activeFilter, favoritedModels]);

  const groups = useMemo(() => groupByProvider(filtered), [filtered]);
  const selected = allModels.find(m => m.id === value);

  const handleSelect = (model: ModelDefinition) => {
    if (model.id.startsWith('ollama/') && !installedLocalModels.has(model.id)) {
      setPendingInstallModel(model);
      return;
    }
    onChange(model.id);
    setOpen(false);
    setSearch('');
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      {pendingInstallModel && (
        <MissingLocalModelModal
          model={pendingInstallModel}
          onClose={() => setPendingInstallModel(null)}
          onReady={() => {
            onChange(pendingInstallModel.id);
            setPendingInstallModel(null);
            setOpen(false);
            setSearch('');
          }}
        />
      )}
      <button
        type="button"
        onClick={() => !disabled && setOpen(v => !v)}
        disabled={disabled}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 bg-ide-bg border border-ide-border rounded text-xs hover:border-ide-accent/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {selected ? (
          <span className="flex items-center gap-1.5 min-w-0">
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${providerColor(selected.id)}`}>
              {getProviderLabel(selected.id)}
            </span>
            <span className="text-ide-text truncate">{selected.name}</span>
            {favoritedModels.has(selected.id) && <Star className="w-2.5 h-2.5 fill-yellow-400 text-yellow-400 flex-shrink-0" />}
            {isFreeModel(selected) && <span className="text-[9px] text-green-400 font-medium ml-auto">FREE</span>}
              {workingModels.has(selected.id) && <span className="text-[9px] text-green-400">TESTED</span>}
              {failedModels[selected.id] && <span className="text-[9px] text-red-400">{failureBadge(failedModels[selected.id].classification)}</span>}
              {selected.id.startsWith('ollama/') && !installedLocalModels.has(selected.id) && <span className="text-[9px] text-yellow-400">NOT INSTALLED</span>}
          </span>
        ) : (
          <span className="text-ide-text-dim">{placeholder}</span>
        )}
        {open ? <ChevronUp className="w-3 h-3 text-ide-text-dim flex-shrink-0" /> : <ChevronDown className="w-3 h-3 text-ide-text-dim flex-shrink-0" />}
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-ide-panel border border-ide-border rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-ide-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ide-text-dim" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={`Search ${allModels.length} models${isLoading ? ' (loading…)' : ''}…`}
                className="w-full pl-6 pr-2 py-1 bg-ide-bg border border-ide-border rounded text-xs focus:outline-none focus:border-ide-accent"
              />
            </div>
            {/* Filter chips — browse by model status */}
            <div className="mt-1.5 flex flex-wrap gap-1">
              {([
                { key: 'all' as const, label: `All (${allModels.length})` },
                { key: 'favorites' as const, label: `⭐ Fav${favoritedModels.size > 0 ? ` (${favoritedModels.size})` : ''}`, cls: 'yellow' },
                { key: 'working' as const, label: `✅ Working${workingModels.size > 0 ? ` (${workingModels.size})` : ''}`, cls: 'green' },
                { key: 'not_tested' as const, label: '❓ Not Tested', cls: 'slate' },
                { key: 'failed' as const, label: '❌ Failed', cls: 'red' },
                { key: 'rate_limited' as const, label: '🚦 Rate Limit', cls: 'orange' },
                { key: 'cost_blocked' as const, label: '💰 Cost', cls: 'amber' },
                { key: 'discontinued' as const, label: '🚫 Dead', cls: 'gray' },
              ]).map(({ key, label, cls }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveFilter(key)}
                  className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                    activeFilter === key
                      ? cls === 'yellow' ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
                        : cls === 'green' ? 'bg-green-500/20 text-green-300 border-green-500/30'
                        : cls === 'red' ? 'bg-red-500/20 text-red-300 border-red-500/30'
                        : cls === 'orange' ? 'bg-orange-500/20 text-orange-300 border-orange-500/30'
                        : cls === 'amber' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        : 'bg-ide-accent/20 text-ide-accent border-ide-accent/30'
                      : 'bg-ide-bg text-ide-text-dim border-ide-border hover:border-ide-accent/40'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {groups.map(([provider, models]) => (
              <div key={provider}>
                <div className={`px-2 py-1 text-[9px] font-semibold uppercase tracking-wider sticky top-0 ${providerColor(provider)} border-b border-ide-border/30`}>
                  {getProviderLabel(provider)} · {models.length} models
                </div>
                {models.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleSelect(m)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 hover:bg-ide-accent/10 text-left transition-colors ${value === m.id ? 'bg-ide-accent/15' : ''}`}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs text-ide-text truncate">{m.name}</span>
                      <span className="block text-[9px] text-ide-text-dim">{(m.maxInputTokens / 1000).toFixed(0)}K ctx · {m.maxOutputTokens / 1000}K out</span>
                    </span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {isFreeModel(m) && <span className="text-[9px] px-1 py-0.5 bg-green-500/15 text-green-400 rounded">FREE</span>}
                      {workingModels.has(m.id) && <span className="text-[9px] px-1 py-0.5 bg-green-500/15 text-green-300 rounded">TESTED</span>}
                      {failedModels[m.id] && <span className="text-[9px] px-1 py-0.5 bg-red-500/15 text-red-300 rounded">{failureBadge(failedModels[m.id].classification)}</span>}
                      {m.id.startsWith('ollama/') && !installedLocalModels.has(m.id) && <span className="text-[9px] px-1 py-0.5 bg-yellow-500/15 text-yellow-300 rounded">NOT INSTALLED</span>}
                      {m.supportsTools && <span className="text-[9px] text-purple-400" title="Tools">🔧</span>}
                      {/* Star / favorite button */}
                      <button
                        type="button"
                        title={favoritedModels.has(m.id) ? 'Remove from favorites' : 'Add to favorites'}
                        onClick={e => { e.stopPropagation(); toggleFavorite(m.id); }}
                        className={`p-0.5 rounded hover:bg-ide-border transition-colors ${favoritedModels.has(m.id) ? 'text-yellow-400' : 'text-ide-text-dim/40 hover:text-yellow-400'}`}
                      >
                        <Star className={`w-3 h-3 ${favoritedModels.has(m.id) ? 'fill-yellow-400' : ''}`} />
                      </button>
                      {value === m.id && <Check className="w-3 h-3 text-ide-accent" />}
                    </div>
                  </button>
                ))}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-ide-text-dim">No models found for "{search}"</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Model Pool Editor ────────────────────────────────────────────────────────
// For editing an ORDERED LIST of models (fallback chain, fleet pool, etc.)
// Replaces the old comma-separated text input

export function ModelPoolEditor({
  title,
  description,
  models,         // currently selected model IDs
  onChange,
  disabled = false,
  showBulkActions = true,
}: {
  title: string;
  description?: string;
  models: string[];
  onChange: (models: string[]) => void;
  disabled?: boolean;
  showBulkActions?: boolean;
}) {
  const {
    allModels, fetchModels, fetchInstalledLocalModels,
    installedLocalModels, workingModels, failedModels,
    preferTestedModelsFirst, hideFailedModels,
  } = useModelStore();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filterFree, setFilterFree] = useState(false);
  const [pendingInstallModel, setPendingInstallModel] = useState<ModelDefinition | null>(null);

  useEffect(() => {
    if (pickerOpen) {
      fetchModels();
      fetchInstalledLocalModels();
    }
  }, [pickerOpen, fetchModels, fetchInstalledLocalModels]);

  const filtered = useMemo(() => {
    let list = allModels;
    if (hideFailedModels) list = list.filter(m => !failedModels[m.id]);
    if (filterFree) list = list.filter(isFreeModel);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(m => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q));
    }
    return preferTestedModelsFirst ? sortModelsByHealth(list, workingModels, failedModels) : list;
  }, [search, filterFree, allModels, hideFailedModels, failedModels, preferTestedModelsFirst, workingModels]);

  const groups = useMemo(() => groupByProvider(filtered), [filtered]);

  const addModel = (id: string) => {
    const def = allModels.find(m => m.id === id);
    if (!def) return;
    if (def.id.startsWith('ollama/') && !installedLocalModels.has(def.id)) {
      setPendingInstallModel(def);
      return;
    }
    if (!models.includes(id)) onChange([...models, id]);
  };

  const removeModel = (id: string) => {
    onChange(models.filter(m => m !== id));
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const next = [...models];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    onChange(next);
  };

  const moveDown = (idx: number) => {
    if (idx === models.length - 1) return;
    const next = [...models];
    [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
    onChange(next);
  };

  const addAllFree = () => {
    const freeIds = allModels.filter(isFreeModel).map(m => m.id);
    const combined = [...models, ...freeIds.filter(id => !models.includes(id))];
    onChange(combined);
  };

  const addAll = () => {
    const allIds = allModels.map(m => m.id);
    const combined = [...models, ...allIds.filter(id => !models.includes(id))];
    onChange(combined);
  };

  const clearAll = () => onChange([]);

  return (
    <div className="space-y-2">
      {pendingInstallModel && (
        <MissingLocalModelModal
          model={pendingInstallModel}
          onClose={() => setPendingInstallModel(null)}
          onReady={() => {
            if (!models.includes(pendingInstallModel.id)) onChange([...models, pendingInstallModel.id]);
            setPendingInstallModel(null);
          }}
        />
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-medium text-ide-text">{title}</div>
          {description && <div className="text-[10px] text-ide-text-dim">{description}</div>}
        </div>
        <div className="flex items-center gap-1 text-[9px] text-ide-text-dim">
          <span className="px-1.5 py-0.5 bg-ide-bg border border-ide-border rounded">{models.length} models</span>
        </div>
      </div>

      {/* Current chain */}
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {models.length === 0 && (
          <div className="px-2 py-3 text-center text-[10px] text-ide-text-dim border border-dashed border-ide-border rounded">
            No models in chain — click + to add
          </div>
        )}
        {models.map((id, idx) => {
          const def = allModels.find(m => m.id === id);
          const provider = extractProviderFromModelId(id);
          return (
            <div key={id} className="flex items-center gap-1.5 px-2 py-1 bg-ide-bg border border-ide-border rounded group">
              <span className="text-[9px] text-ide-text-dim font-mono w-4 text-right">{idx + 1}</span>
              <span className={`text-[9px] px-1 rounded font-medium ${providerColor(provider)}`}>
                {getProviderLabel(provider).slice(0, 6)}
              </span>
              <span className="flex-1 text-xs text-ide-text truncate">{def?.name || id.split('/')[1] || id}</span>
              {def && isFreeModel(def) && (
                <span className="text-[9px] text-green-400">FREE</span>
              )}
              {workingModels.has(id) && <span className="text-[9px] text-green-400">TESTED</span>}
              {failedModels[id] && <span className="text-[9px] text-red-400">{failureBadge(failedModels[id].classification)}</span>}
              {id.startsWith('ollama/') && !installedLocalModels.has(id) && <span className="text-[9px] text-yellow-400">NOT INSTALLED</span>}
              {!disabled && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => moveUp(idx)} disabled={idx === 0} className="p-0.5 text-ide-text-dim hover:text-ide-text disabled:opacity-30">▲</button>
                  <button onClick={() => moveDown(idx)} disabled={idx === models.length - 1} className="p-0.5 text-ide-text-dim hover:text-ide-text disabled:opacity-30">▼</button>
                  <button onClick={() => removeModel(id)} className="p-0.5 text-red-400/60 hover:text-red-400">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bulk actions */}
      {showBulkActions && !disabled && (
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setPickerOpen(v => !v)}
            className="flex items-center gap-1 text-[10px] px-2 py-1 bg-ide-accent/15 text-ide-accent rounded hover:bg-ide-accent/25 transition-colors"
          >
            <Plus className="w-3 h-3" /> Add Model
          </button>
          <button
            onClick={addAllFree}
            className="flex items-center gap-1 text-[10px] px-2 py-1 bg-green-500/10 text-green-400 rounded hover:bg-green-500/20 transition-colors"
          >
            <CheckSquare className="w-3 h-3" /> All Free
          </button>
          <button
            onClick={addAll}
            className="flex items-center gap-1 text-[10px] px-2 py-1 bg-blue-500/10 text-blue-400 rounded hover:bg-blue-500/20 transition-colors"
          >
            <LayoutList className="w-3 h-3" /> All {allModels.length}
          </button>
          <button
            onClick={clearAll}
            className="flex items-center gap-1 text-[10px] px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition-colors"
          >
            <Trash2 className="w-3 h-3" /> Clear
          </button>
        </div>
      )}

      {/* Inline picker */}
      {pickerOpen && !disabled && (
        <div className="border border-ide-accent/30 rounded-lg bg-ide-panel overflow-hidden">
          <div className="flex items-center gap-2 p-2 border-b border-ide-border">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ide-text-dim" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={`Search ${allModels.length} models…`}
                className="w-full pl-6 pr-2 py-1 bg-ide-bg border border-ide-border rounded text-xs focus:outline-none focus:border-ide-accent"
              />
            </div>
            <button
              onClick={() => setFilterFree(v => !v)}
              className={`text-[10px] px-2 py-1 rounded border transition-colors ${filterFree ? 'border-green-500/40 text-green-400 bg-green-500/10' : 'border-ide-border text-ide-text-dim'}`}
            >
              Free only
            </button>
            <span className="text-[10px] text-ide-text-dim whitespace-nowrap">
              {preferTestedModelsFirst ? 'Tested models first' : 'Default order'}
            </span>
            <button onClick={() => setPickerOpen(false)} className="text-ide-text-dim hover:text-ide-text">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {groups.map(([provider, pmodels]) => (
              <div key={provider}>
                <div className={`px-2 py-1 text-[9px] font-semibold sticky top-0 ${providerColor(provider)} border-b border-ide-border/30`}>
                  {getProviderLabel(provider)}
                </div>
                {pmodels.map(m => {
                  const already = models.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => already ? removeModel(m.id) : addModel(m.id)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 hover:bg-ide-accent/10 text-left transition-colors ${already ? 'bg-ide-accent/5' : ''}`}
                    >
                      <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${already ? 'bg-ide-accent border-ide-accent' : 'border-ide-border'}`}>
                        {already && <Check className="w-2.5 h-2.5 text-ide-panel" />}
                      </div>
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs text-ide-text truncate">{m.name}</span>
                        <span className="block text-[9px] text-ide-text-dim">{(m.maxInputTokens / 1000).toFixed(0)}K ctx</span>
                      </span>
                      {isFreeModel(m) && <span className="text-[9px] text-green-400 flex-shrink-0">FREE</span>}
                      {workingModels.has(m.id) && <span className="text-[9px] text-green-300 flex-shrink-0">TESTED</span>}
                      {failedModels[m.id] && <span className="text-[9px] text-red-300 flex-shrink-0">{failureBadge(failedModels[m.id].classification)}</span>}
                      {m.id.startsWith('ollama/') && !installedLocalModels.has(m.id) && <span className="text-[9px] text-yellow-300 flex-shrink-0">NOT INSTALLED</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="p-2 border-t border-ide-border text-[9px] text-ide-text-dim text-center">
            {models.length} selected · Click to toggle
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Role Model Picker ────────────────────────────────────────────────────────
// For Fleet role assignments - shows role name + model dropdown

export const FLEET_ROLE_LABELS: Record<string, string> = {
  lead: '🧭 Lead Architect',
  implementer: '⚙️ Implementer',
  debugger: '🐛 Debugger',
  tester: '🧪 Tester',
  reviewer: '🔍 Reviewer',
  documenter: '📝 Documenter',
};

export function RoleModelPicker({
  role,
  value,
  onChange,
  disabled = false,
  showRecommended = true,
}: {
  role: string;
  value: string;
  onChange: (model: string) => void;
  disabled?: boolean;
  showRecommended?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-32 flex-shrink-0">
        <div className="text-[10px] font-medium text-ide-text">{FLEET_ROLE_LABELS[role] || role}</div>
        {showRecommended && (
          <div className="text-[9px] text-ide-text-dim">
            {role === 'lead' ? 'Best reasoning' :
             role === 'implementer' ? 'Best coding' :
             role === 'debugger' ? 'Tool use' :
             role === 'tester' ? 'Fast+cheap' :
             role === 'reviewer' ? 'High quality' : 'Any model'}
          </div>
        )}
      </div>
      <div className="flex-1">
        <ModelDropdown
          value={value}
          onChange={onChange}
          placeholder="Inherit from pool"
          disabled={disabled}
        />
      </div>
    </div>
  );
}
