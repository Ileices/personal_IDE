// ============================================
// Universal Model Picker
//
// THE single model selection component used everywhere:
// - The God Factory (active model)
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
import { MODELS, type ModelDefinition } from '@personal-ide/shared';
import { useModelStore } from '../stores/modelStore';
import {
  Search, ChevronDown, ChevronUp, Check, Plus, Trash2,
  Zap, Brain, Cpu, Globe, Code2, BookOpen, X, CheckSquare,
  Square as SquareIcon, LayoutList, Tag, Star,
} from 'lucide-react';

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

export function getProviderLabel(id: string): string {
  const p = id.split('/')[0];
  const labels: Record<string, string> = {
    openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini',
    groq: 'Groq', cerebras: 'Cerebras', deepseek: 'DeepSeek',
    'deepseek-direct': 'DeepSeek', qwen: 'Qwen', zhipuai: 'ZhipuAI',
    moonshot: 'Moonshot', minimax: 'MiniMax', xai: 'xAI/Grok',
    perplexity: 'Perplexity', fireworks: 'Fireworks', siliconflow: 'SiliconFlow',
    github: 'GitHub', ollama: 'Ollama (local)', nano: 'Nano (local)',
  };
  return labels[p] || p.charAt(0).toUpperCase() + p.slice(1);
}

export function groupByProvider(models: ModelDefinition[]): [string, ModelDefinition[]][] {
  const groups: Record<string, ModelDefinition[]> = {};
  for (const m of models) {
    const p = m.id.split('/')[0];
    if (!groups[p]) groups[p] = [];
    groups[p].push(m);
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
}

function providerColor(provider: string): string {
  const colors: Record<string, string> = {
    openai: 'text-green-400 bg-green-500/10',
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
  };
  return colors[provider] || 'text-ide-text-dim bg-ide-panel';
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
  const { allModels, isLoading, fetchModels } = useModelStore();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Trigger model fetch when dropdown opens
  useEffect(() => { if (open) fetchModels(); }, [open, fetchModels]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = useMemo(() => {
    if (!search) return allModels;
    const q = search.toLowerCase();
    return allModels.filter(m =>
      m.id.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      m.publisher.toLowerCase().includes(q)
    );
  }, [search, allModels]);

  const groups = useMemo(() => groupByProvider(filtered), [filtered]);
  const selected = allModels.find(m => m.id === value);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(v => !v)}
        disabled={disabled}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 bg-ide-bg border border-ide-border rounded text-xs hover:border-ide-accent/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {selected ? (
          <span className="flex items-center gap-1.5 min-w-0">
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${providerColor(selected.id.split('/')[0])}`}>
              {getProviderLabel(selected.id)}
            </span>
            <span className="text-ide-text truncate">{selected.name}</span>
            {isFreeModel(selected) && <span className="text-[9px] text-green-400 font-medium ml-auto">FREE</span>}
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
                    onClick={() => { onChange(m.id); setOpen(false); setSearch(''); }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 hover:bg-ide-accent/10 text-left transition-colors ${value === m.id ? 'bg-ide-accent/15' : ''}`}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs text-ide-text truncate">{m.name}</span>
                      <span className="block text-[9px] text-ide-text-dim">{(m.maxInputTokens / 1000).toFixed(0)}K ctx · {m.maxOutputTokens / 1000}K out</span>
                    </span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {isFreeModel(m) && <span className="text-[9px] px-1 py-0.5 bg-green-500/15 text-green-400 rounded">FREE</span>}
                      {m.supportsTools && <span className="text-[9px] text-purple-400" title="Tools">🔧</span>}
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
  const { allModels, fetchModels } = useModelStore();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filterFree, setFilterFree] = useState(false);

  useEffect(() => { if (pickerOpen) fetchModels(); }, [pickerOpen, fetchModels]);

  const filtered = useMemo(() => {
    let list = allModels;
    if (filterFree) list = list.filter(isFreeModel);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(m => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q));
    }
    return list;
  }, [search, filterFree, allModels]);

  const groups = useMemo(() => groupByProvider(filtered), [filtered]);

  const addModel = (id: string) => {
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
          const provider = id.split('/')[0];
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
