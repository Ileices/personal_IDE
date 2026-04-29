// ============================================
// Model Store — Single source of truth for ALL available models
//
// Merges:
//   1. Static MODELS from @personal-ide/shared (always available, 150+)
//   2. Dynamic models fetched from /api/providers/all-models (live, from
//      any enabled provider like Ollama, GitHub, Groq, etc.)
//
// All components (UniversalModelPicker, TheGodFactory, TopBar, etc.)
// should use this store so new models appear everywhere at once.
// ============================================
import { create } from 'zustand';
import { MODELS, type ModelDefinition } from '@personal-ide/shared';
import { API_BASE } from '../config';

const WORKING_MODELS_KEY = 'personal_ide_working_models';
const FAILED_MODELS_KEY = 'personal_ide_failed_models';

export interface FailedModelRecord {
  modelId: string;
  provider: string;
  classification: 'rate_limited' | 'cost_blocked' | 'not_configured' | 'not_installed' | 'discontinued' | 'error';
  error: string;
  lastTestedAt: number;
  skippedForSession: boolean;
}

function loadWorkingModels(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(WORKING_MODELS_KEY) || '[]');
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

function loadFailedModels(): Record<string, FailedModelRecord> {
  try {
    const raw = JSON.parse(localStorage.getItem(FAILED_MODELS_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function saveWorkingModels(set: Set<string>) {
  try { localStorage.setItem(WORKING_MODELS_KEY, JSON.stringify(Array.from(set))); } catch {}
}

function saveFailedModels(records: Record<string, FailedModelRecord>) {
  try { localStorage.setItem(FAILED_MODELS_KEY, JSON.stringify(records)); } catch {}
}

export function sortModelsByHealth(models: ModelDefinition[], workingModels: Set<string>, failedModels: Record<string, FailedModelRecord>): ModelDefinition[] {
  return [...models].sort((a, b) => {
    const aWorking = workingModels.has(a.id) ? 1 : 0;
    const bWorking = workingModels.has(b.id) ? 1 : 0;
    if (aWorking !== bWorking) return bWorking - aWorking;

    const aFailed = failedModels[a.id] ? 1 : 0;
    const bFailed = failedModels[b.id] ? 1 : 0;
    if (aFailed !== bFailed) return aFailed - bFailed;

    const aLocal = a.id.startsWith('ollama/') ? 1 : 0;
    const bLocal = b.id.startsWith('ollama/') ? 1 : 0;
    if (aLocal !== bLocal) return bLocal - aLocal;

    return a.name.localeCompare(b.name);
  });
}

export interface DynamicModel {
  id: string;
  name: string;
  provider: string;
  description: string;
  contextWindow: number;
  isFree?: boolean;
}

interface ProviderError {
  provider: string;
  error: string;
}

interface ModelStore {
  /** All models from all sources — static + dynamic */
  allModels: ModelDefinition[];
  /** Provider errors from last fetch (for diagnostics) */
  providerErrors: ProviderError[];
  /** Whether a fetch is in progress */
  isLoading: boolean;
  /** When the last successful fetch occurred */
  lastFetchAt: number | null;
  /** Models currently known to be in cooldown (rate-limited) */
  cooldownModels: Set<string>;
  /** Locally installed Ollama model ids, normalized to ollama/<name> */
  installedLocalModels: Set<string>;
  /** Models the user has tested successfully */
  workingModels: Set<string>;
  /** Models that failed a validation/test and should be deprioritized or hidden */
  failedModels: Record<string, FailedModelRecord>;
  /** Whether pickers should automatically put working models first */
  preferTestedModelsFirst: boolean;
  /** Whether pickers should hide failed models from the main lists by default */
  hideFailedModels: boolean;
  /** Bulk test progress for cleanup/testing operations */
  bulkTestInProgress: boolean;
  bulkTestProgress: { completed: number; total: number };

  fetchModels: () => Promise<void>;
  fetchInstalledLocalModels: () => Promise<void>;
  markCooldown: (modelId: string, durationMs?: number) => void;
  clearCooldown: (modelId: string) => void;
  isOnCooldown: (modelId: string) => boolean;
  isLocalModelInstalled: (modelId: string) => boolean;
  markWorking: (modelId: string) => void;
  markFailed: (modelId: string, record: Omit<FailedModelRecord, 'modelId' | 'lastTestedAt' | 'skippedForSession'>) => void;
  clearFailed: (modelId: string) => void;
  clearSessionSkips: () => void;
  setPreferTestedModelsFirst: (value: boolean) => void;
  setHideFailedModels: (value: boolean) => void;
  testModel: (modelId: string) => Promise<{ success: boolean; classification: string; error?: string }>;
  testAllModels: (modelIds?: string[]) => Promise<void>;
}

/** Convert dynamic API model to our ModelDefinition shape */
function dynamicToDefinition(d: DynamicModel): ModelDefinition {
  const provider = d.provider?.toLowerCase() || d.id.split('/')[0] || 'unknown';
  return {
    id: d.id,
    name: d.name || d.id,
    publisher: d.provider || provider,
    tier: inferTier(provider),
    description: d.description || '',
    maxInputTokens: d.contextWindow || 128000,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsTools: false,
    supportsJsonMode: false,
    recommendedFor: ['ask', 'edit'],
    supportsTemperature: true,
  };
}

function inferTier(provider: string): ModelDefinition['tier'] {
  const p = provider.toLowerCase();
  if (p.includes('groq')) return 'groq_free';
  if (p.includes('cerebras')) return 'cerebras_free';
  if (p.includes('gemini') || p.includes('google')) return 'gemini_free';
  if (p.includes('ollama')) return 'ollama_local';
  if (p.includes('anthropic') || p.includes('claude')) return 'anthropic_sonnet';
  if (p.includes('openai') || p.includes('gpt')) return 'openai_direct';
  if (p.includes('deepseek')) return 'deepseek_direct';
  if (p.includes('qwen') || p.includes('alibaba') || p.includes('dashscope')) return 'qwen_free';
  if (p.includes('mistral')) return 'mistral_free';
  if (p.includes('together')) return 'together_free';
  if (p.includes('openrouter')) return 'openrouter_free';
  if (p.includes('fireworks')) return 'fireworks_free';
  if (p.includes('siliconflow')) return 'siliconflow_free';
  if (p.includes('perplexity')) return 'perplexity_free';
  if (p.includes('xai') || p.includes('grok')) return 'xai_direct';
  if (p.includes('cohere')) return 'cohere_free';
  return 'low';
}

/** Cache live dynamic models so we don't lose them across store resets */
let _dynamicCache: DynamicModel[] = [];

export const useModelStore = create<ModelStore>((set, get) => ({
  allModels: [...MODELS], // start with static models immediately
  providerErrors: [],
  isLoading: false,
  lastFetchAt: null,
  cooldownModels: new Set(),
  installedLocalModels: new Set(),
  workingModels: loadWorkingModels(),
  failedModels: loadFailedModels(),
  preferTestedModelsFirst: true,
  hideFailedModels: true,
  bulkTestInProgress: false,
  bulkTestProgress: { completed: 0, total: 0 },

  fetchModels: async () => {
    // Don't re-fetch within 5 minutes unless forced
    const { lastFetchAt, isLoading } = get();
    if (isLoading) return;
    if (lastFetchAt && Date.now() - lastFetchAt < 5 * 60_000) return;

    set({ isLoading: true });

    try {
      const res = await fetch(`${API_BASE}/api/providers/all-models`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const dynamic: DynamicModel[] = data.models || [];
      _dynamicCache = dynamic;

      // Build merged model list: start with static, then add dynamic-only IDs
      const staticIds = new Set(MODELS.map(m => m.id));
      const extraFromDynamic = dynamic
        .filter(d => !staticIds.has(d.id))
        .map(dynamicToDefinition);

      // Also update static models that appear in dynamic (mark them as confirmed available)
      const merged = [...MODELS, ...extraFromDynamic];

      set({
        allModels: merged,
        providerErrors: data.errors || [],
        isLoading: false,
        lastFetchAt: Date.now(),
      });
      void get().fetchInstalledLocalModels();
    } catch (err) {
      // Fall back to static + cached dynamic
      const staticIds = new Set(MODELS.map(m => m.id));
      const extra = _dynamicCache
        .filter(d => !staticIds.has(d.id))
        .map(dynamicToDefinition);
      set({
        allModels: [...MODELS, ...extra],
        isLoading: false,
        providerErrors: [{ provider: 'all', error: String(err) }],
      });
      void get().fetchInstalledLocalModels();
    }
  },

  fetchInstalledLocalModels: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/providers/ollama/models`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const installed = new Set<string>((data.models || []).map((m: any) => `ollama/${m.name}`));
      set({ installedLocalModels: installed });
    } catch {
      set({ installedLocalModels: new Set() });
    }
  },

  markCooldown: (modelId: string, durationMs = 60_000) => {
    const { cooldownModels } = get();
    const updated = new Set(cooldownModels);
    updated.add(modelId);
    set({ cooldownModels: updated });
    // Auto-clear after duration
    setTimeout(() => {
      const s = get().cooldownModels;
      const cleared = new Set(s);
      cleared.delete(modelId);
      set({ cooldownModels: cleared });
    }, durationMs);
  },

  clearCooldown: (modelId: string) => {
    const { cooldownModels } = get();
    const updated = new Set(cooldownModels);
    updated.delete(modelId);
    set({ cooldownModels: updated });
  },

  isOnCooldown: (modelId: string) => {
    return get().cooldownModels.has(modelId);
  },

  isLocalModelInstalled: (modelId: string) => {
    if (!modelId.startsWith('ollama/')) return true;
    return get().installedLocalModels.has(modelId);
  },

  markWorking: (modelId: string) => {
    const nextWorking = new Set(get().workingModels);
    nextWorking.add(modelId);
    const nextFailed = { ...get().failedModels };
    delete nextFailed[modelId];
    saveWorkingModels(nextWorking);
    saveFailedModels(nextFailed);
    set({ workingModels: nextWorking, failedModels: nextFailed });
  },

  markFailed: (modelId: string, record) => {
    const nextWorking = new Set(get().workingModels);
    nextWorking.delete(modelId);
    const nextFailed = {
      ...get().failedModels,
      [modelId]: {
        modelId,
        provider: record.provider,
        classification: record.classification,
        error: record.error,
        lastTestedAt: Date.now(),
        skippedForSession: true,
      },
    };
    saveWorkingModels(nextWorking);
    saveFailedModels(nextFailed);
    set({ workingModels: nextWorking, failedModels: nextFailed });
  },

  clearFailed: (modelId: string) => {
    const nextFailed = { ...get().failedModels };
    delete nextFailed[modelId];
    saveFailedModels(nextFailed);
    set({ failedModels: nextFailed });
  },

  clearSessionSkips: () => {
    const nextFailed = { ...get().failedModels };
    Object.keys(nextFailed).forEach(modelId => {
      nextFailed[modelId] = { ...nextFailed[modelId], skippedForSession: false };
    });
    saveFailedModels(nextFailed);
    set({ failedModels: nextFailed });
  },

  setPreferTestedModelsFirst: (value) => set({ preferTestedModelsFirst: value }),
  setHideFailedModels: (value) => set({ hideFailedModels: value }),

  testModel: async (modelId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/models/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        get().markWorking(modelId);
        return { success: true, classification: 'working' };
      }
      get().markFailed(modelId, {
        provider: modelId.split('/')[0] || 'unknown',
        classification: data.classification || 'error',
        error: data.error || 'Model test failed',
      });
      return { success: false, classification: data.classification || 'error', error: data.error || 'Model test failed' };
    } catch (err: any) {
      get().markFailed(modelId, {
        provider: modelId.split('/')[0] || 'unknown',
        classification: 'error',
        error: err.message || 'Model test failed',
      });
      return { success: false, classification: 'error', error: err.message || 'Model test failed' };
    }
  },

  testAllModels: async (modelIds?: string[]) => {
    const ids = modelIds && modelIds.length > 0 ? modelIds : get().allModels.map(m => m.id);
    set({ bulkTestInProgress: true, bulkTestProgress: { completed: 0, total: ids.length } });
    for (let idx = 0; idx < ids.length; idx++) {
      await get().testModel(ids[idx]);
      set({ bulkTestProgress: { completed: idx + 1, total: ids.length } });
    }
    set({ bulkTestInProgress: false });
  },
}));
