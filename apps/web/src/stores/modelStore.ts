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

  fetchModels: () => Promise<void>;
  markCooldown: (modelId: string, durationMs?: number) => void;
  clearCooldown: (modelId: string) => void;
  isOnCooldown: (modelId: string) => boolean;
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
}));
