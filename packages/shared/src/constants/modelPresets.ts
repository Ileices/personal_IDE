// ============================================
// Model Presets — Fallback chains, task assignments,
// per-model cooldowns for ban-free 24/7 operation
// ============================================

/** Task categories that models can be assigned to */
export type AgentTaskType = 'planning' | 'coding' | 'iteration' | 'review' | 'debugging' | 'general';

/** A complete model strategy preset */
export interface ModelPreset {
  id: string;
  name: string;
  description: string;
  /** Primary model to start with */
  primaryModel: string;
  /** Ordered fallback chain — tried in sequence when rate-limited */
  fallbackChain: string[];
  /** Which models are preferred for each task type (first = highest preference) */
  taskAssignments: Partial<Record<AgentTaskType, string[]>>;
  /** Per-model cooldown in ms — tuned to avoid rate-limit bans */
  cooldowns: Record<string, number>;
  /** Tags for filtering/display */
  tags: string[];
  /** Whether this preset is suitable for 24/7 continuous mode */
  continuousReady: boolean;
}

/**
 * Model capability research:
 *
 * openai/gpt-4.1       — Best overall coding model. Complex architecture, full-stack. 10rpm/50rpd.
 * openai/gpt-4.1-mini  — Fast iteration, simple changes, bulk operations. 15rpm/150rpd.
 * openai/gpt-4.1-nano  — Fastest. Summaries, simple completions, reads. 15rpm/150rpd.
 * openai/gpt-4o        — Multimodal flagship. Vision + code understanding. 10rpm/50rpd.
 * openai/gpt-4o-mini   — Fast general purpose, small code edits. 15rpm/150rpd.
 * openai/o3            — Deep reasoning. Architecture, complex logic, multi-step. 1rpm/8rpd.
 * openai/o4-mini       — Fast reasoning. Code review, analysis. 2rpm/12rpd.
 * meta/llama-4-scout   — Open-source, generous limits, solid coding. 15rpm/150rpd.
 * deepseek/DeepSeek-R1 — Strong reasoning + code gen. Limited rate. 1rpm/8rpd.
 * xai/grok-3           — Strong at coding + creative tasks. 1rpm/15rpd.
 * xai/grok-3-mini      — Quick tasks, generous limits. 2rpm/30rpd.
 */

// ── Helper: Compute safe cooldown from rate limits ──
// Formula: (60s / rpm) * 1.15 safety margin, minimum 3s
function safeCooldown(rpm: number): number {
  return Math.max(Math.ceil((60000 / rpm) * 1.15), 3000);
}

// ── Pre-computed cooldowns per model ──
const MODEL_COOLDOWNS: Record<string, number> = {
  'openai/gpt-4.1':       safeCooldown(10),  // ~6.9s → 7s
  'openai/gpt-4.1-mini':  safeCooldown(15),  // ~4.6s → 5s
  'openai/gpt-4.1-nano':  safeCooldown(15),  // ~4.6s → 5s
  'openai/gpt-4o':        safeCooldown(10),  // ~6.9s → 7s
  'openai/gpt-4o-mini':   safeCooldown(15),  // ~4.6s → 5s
  'openai/o3':            safeCooldown(1),   // ~69s → 69s
  'openai/o4-mini':       safeCooldown(2),   // ~34.5s → 35s
  'meta/llama-4-scout':   safeCooldown(15),  // ~4.6s → 5s
  'deepseek/DeepSeek-R1': safeCooldown(1),   // ~69s → 69s
  'xai/grok-3':           safeCooldown(1),   // ~69s → 69s
  'xai/grok-3-mini':      safeCooldown(2),   // ~34.5s → 35s
};

// ── Daily budget cooldowns (for 24/7 mode — spread RPD across 24h) ──
const DAILY_BUDGET_COOLDOWNS: Record<string, number> = {
  'openai/gpt-4.1':       Math.ceil(86400000 / 50 * 1.1),   // ~1900s → ~32min
  'openai/gpt-4.1-mini':  Math.ceil(86400000 / 150 * 1.1),  // ~634s → ~10.5min
  'openai/gpt-4.1-nano':  Math.ceil(86400000 / 150 * 1.1),
  'openai/gpt-4o':        Math.ceil(86400000 / 50 * 1.1),
  'openai/gpt-4o-mini':   Math.ceil(86400000 / 150 * 1.1),
  'openai/o3':            Math.ceil(86400000 / 8 * 1.1),     // ~11880s → ~3.3h
  'openai/o4-mini':       Math.ceil(86400000 / 12 * 1.1),    // ~7920s → ~2.2h
  'meta/llama-4-scout':   Math.ceil(86400000 / 150 * 1.1),
  'deepseek/DeepSeek-R1': Math.ceil(86400000 / 8 * 1.1),
  'xai/grok-3':           Math.ceil(86400000 / 15 * 1.1),    // ~6336s → ~1.76h
  'xai/grok-3-mini':      Math.ceil(86400000 / 30 * 1.1),    // ~3168s → ~53min
};

/** Get per-minute safe cooldown for a model */
export function getModelCooldown(modelId: string): number {
  return MODEL_COOLDOWNS[modelId] || 10000;
}

/** Get 24/7 daily-budget cooldown for a model */
export function getDailyBudgetCooldown(modelId: string): number {
  return DAILY_BUDGET_COOLDOWNS[modelId] || 60000;
}

// ============================================
// PRESETS
// ============================================

export const MODEL_PRESETS: ModelPreset[] = [
  // ── 1. All Models Balanced ──
  {
    id: 'all-models-balanced',
    name: 'All Models — Balanced Rotation',
    description: 'Uses all 11 models with smart rotation. Maximizes daily throughput by spreading requests across every available model. Best for 24/7 operation.',
    primaryModel: 'openai/gpt-4.1',
    fallbackChain: [
      'openai/gpt-4.1',
      'openai/gpt-4.1-mini',
      'meta/llama-4-scout',
      'openai/gpt-4o',
      'xai/grok-3-mini',
      'openai/gpt-4o-mini',
      'openai/gpt-4.1-nano',
      'xai/grok-3',
      'openai/o4-mini',
      'deepseek/DeepSeek-R1',
      'openai/o3',
    ],
    taskAssignments: {
      planning: ['openai/o3', 'deepseek/DeepSeek-R1', 'openai/gpt-4.1', 'openai/o4-mini'],
      coding: ['openai/gpt-4.1', 'xai/grok-3', 'meta/llama-4-scout', 'openai/gpt-4o'],
      iteration: ['openai/gpt-4.1-mini', 'openai/gpt-4o-mini', 'xai/grok-3-mini', 'meta/llama-4-scout', 'openai/gpt-4.1-nano'],
      review: ['openai/o4-mini', 'openai/gpt-4.1', 'deepseek/DeepSeek-R1', 'xai/grok-3'],
      debugging: ['openai/gpt-4.1', 'openai/o4-mini', 'openai/gpt-4o', 'xai/grok-3'],
      general: ['openai/gpt-4.1-mini', 'openai/gpt-4o-mini', 'meta/llama-4-scout'],
    },
    cooldowns: { ...MODEL_COOLDOWNS },
    tags: ['all', 'balanced', '24/7', 'recommended'],
    continuousReady: true,
  },

  // ── 2. Speed & Volume ──
  {
    id: 'speed-volume',
    name: 'Speed & Volume — Low-Tier Focus',
    description: 'Prioritizes fast, high-rate-limit models for maximum iteration speed. 150 RPD per model = 750+ total daily requests. Best for bulk file operations.',
    primaryModel: 'openai/gpt-4.1-mini',
    fallbackChain: [
      'openai/gpt-4.1-mini',
      'openai/gpt-4o-mini',
      'meta/llama-4-scout',
      'openai/gpt-4.1-nano',
      'xai/grok-3-mini',
      'openai/gpt-4.1',
      'openai/gpt-4o',
    ],
    taskAssignments: {
      planning: ['openai/gpt-4.1-mini', 'meta/llama-4-scout'],
      coding: ['openai/gpt-4.1-mini', 'openai/gpt-4o-mini', 'meta/llama-4-scout'],
      iteration: ['openai/gpt-4.1-nano', 'openai/gpt-4.1-mini', 'xai/grok-3-mini'],
      review: ['openai/gpt-4.1-mini', 'meta/llama-4-scout'],
      debugging: ['openai/gpt-4.1-mini', 'openai/gpt-4o-mini'],
      general: ['openai/gpt-4.1-nano', 'openai/gpt-4o-mini'],
    },
    cooldowns: { ...MODEL_COOLDOWNS },
    tags: ['speed', 'volume', 'bulk', '24/7'],
    continuousReady: true,
  },

  // ── 3. Reasoning Focus ──
  {
    id: 'reasoning-focus',
    name: 'Reasoning Focus — Deep Thinking',
    description: 'Prioritizes o3 and DeepSeek-R1 for complex architecture and logic. Falls back to high-tier for implementation. Best for greenfield projects with complex requirements.',
    primaryModel: 'openai/o3',
    fallbackChain: [
      'openai/o3',
      'openai/o4-mini',
      'deepseek/DeepSeek-R1',
      'openai/gpt-4.1',
      'xai/grok-3',
      'openai/gpt-4.1-mini',
      'meta/llama-4-scout',
    ],
    taskAssignments: {
      planning: ['openai/o3', 'deepseek/DeepSeek-R1', 'openai/o4-mini'],
      coding: ['openai/gpt-4.1', 'xai/grok-3', 'openai/o4-mini'],
      iteration: ['openai/gpt-4.1-mini', 'meta/llama-4-scout'],
      review: ['openai/o3', 'openai/o4-mini', 'deepseek/DeepSeek-R1'],
      debugging: ['openai/o4-mini', 'openai/gpt-4.1'],
      general: ['openai/o4-mini', 'openai/gpt-4.1-mini'],
    },
    cooldowns: { ...MODEL_COOLDOWNS },
    tags: ['reasoning', 'architecture', 'deep-thinking'],
    continuousReady: false, // Reasoning models have very low RPD
  },

  // ── 4. Conservative 24/7 ──
  {
    id: 'conservative-247',
    name: 'Conservative 24/7 — Ban-Free Marathon',
    description: 'Ultra-conservative cooldowns spread across all models using daily-budget pacing. Guaranteed ban-free for 24+ hour sessions. Slower but never stops.',
    primaryModel: 'openai/gpt-4.1-mini',
    fallbackChain: [
      'openai/gpt-4.1-mini',
      'meta/llama-4-scout',
      'openai/gpt-4o-mini',
      'openai/gpt-4.1-nano',
      'xai/grok-3-mini',
      'openai/gpt-4.1',
      'openai/gpt-4o',
      'xai/grok-3',
      'openai/o4-mini',
    ],
    taskAssignments: {
      planning: ['openai/gpt-4.1', 'openai/gpt-4.1-mini'],
      coding: ['openai/gpt-4.1-mini', 'meta/llama-4-scout', 'openai/gpt-4o-mini'],
      iteration: ['openai/gpt-4.1-nano', 'openai/gpt-4.1-mini', 'meta/llama-4-scout'],
      review: ['openai/gpt-4.1-mini', 'openai/gpt-4.1'],
      debugging: ['openai/gpt-4.1-mini', 'openai/gpt-4o-mini'],
      general: ['openai/gpt-4.1-nano', 'meta/llama-4-scout'],
    },
    cooldowns: { ...DAILY_BUDGET_COOLDOWNS },
    tags: ['conservative', '24/7', 'ban-free', 'marathon'],
    continuousReady: true,
  },

  // ── 5. Grok + GitHub Hybrid ──
  {
    id: 'grok-github-hybrid',
    name: 'Grok + GitHub Hybrid',
    description: 'Leverages Grok models alongside GitHub models for maximum diversity. Grok excels at creative coding and unconventional solutions.',
    primaryModel: 'xai/grok-3',
    fallbackChain: [
      'xai/grok-3',
      'openai/gpt-4.1',
      'xai/grok-3-mini',
      'openai/gpt-4.1-mini',
      'meta/llama-4-scout',
      'openai/gpt-4o-mini',
      'openai/o4-mini',
    ],
    taskAssignments: {
      planning: ['xai/grok-3', 'openai/gpt-4.1', 'openai/o4-mini'],
      coding: ['xai/grok-3', 'openai/gpt-4.1', 'meta/llama-4-scout'],
      iteration: ['xai/grok-3-mini', 'openai/gpt-4.1-mini', 'openai/gpt-4o-mini'],
      review: ['xai/grok-3', 'openai/gpt-4.1'],
      debugging: ['openai/gpt-4.1', 'xai/grok-3'],
      general: ['xai/grok-3-mini', 'openai/gpt-4.1-mini'],
    },
    cooldowns: { ...MODEL_COOLDOWNS },
    tags: ['grok', 'creative', 'hybrid'],
    continuousReady: true,
  },

  // ── 6. Local Only (Ollama) ──
  {
    id: 'local-only',
    name: 'Local Only — Ollama',
    description: 'Uses only locally-running Ollama models. No API rate limits. Requires Ollama with models installed. Speed depends on hardware (VRAM).',
    primaryModel: 'ollama/auto',
    fallbackChain: [
      'ollama/auto', // Auto-detects best available model
    ],
    taskAssignments: {
      planning: ['ollama/auto'],
      coding: ['ollama/auto'],
      iteration: ['ollama/auto'],
      review: ['ollama/auto'],
      debugging: ['ollama/auto'],
      general: ['ollama/auto'],
    },
    cooldowns: {
      'ollama/auto': 1000, // Local models have no API rate limits, just hardware throughput
    },
    tags: ['local', 'ollama', 'offline', 'unlimited'],
    continuousReady: true,
  },

  // ── 7. Meta Open-Source Focus ──
  {
    id: 'meta-opensource',
    name: 'Meta + Open-Source Focus',
    description: 'Prioritizes Llama and other open-source models. Generous rate limits. Falls back to OpenAI mini models when needed.',
    primaryModel: 'meta/llama-4-scout',
    fallbackChain: [
      'meta/llama-4-scout',
      'openai/gpt-4.1-mini',
      'openai/gpt-4o-mini',
      'openai/gpt-4.1-nano',
      'deepseek/DeepSeek-R1',
      'xai/grok-3-mini',
    ],
    taskAssignments: {
      planning: ['meta/llama-4-scout', 'deepseek/DeepSeek-R1'],
      coding: ['meta/llama-4-scout', 'openai/gpt-4.1-mini'],
      iteration: ['meta/llama-4-scout', 'openai/gpt-4.1-nano'],
      review: ['deepseek/DeepSeek-R1', 'meta/llama-4-scout'],
      debugging: ['meta/llama-4-scout', 'openai/gpt-4.1-mini'],
      general: ['meta/llama-4-scout', 'openai/gpt-4o-mini'],
    },
    cooldowns: { ...MODEL_COOLDOWNS },
    tags: ['open-source', 'meta', 'llama'],
    continuousReady: true,
  },
];

/** Get a preset by ID */
export function getPreset(presetId: string): ModelPreset | undefined {
  return MODEL_PRESETS.find(p => p.id === presetId);
}

/** Get the default preset */
export function getDefaultPreset(): ModelPreset {
  return MODEL_PRESETS[0]; // all-models-balanced
}

/** Get presets suitable for 24/7 continuous mode */
export function getContinuousPresets(): ModelPreset[] {
  return MODEL_PRESETS.filter(p => p.continuousReady);
}

/** Get the best model for a specific task type from a preset */
export function getBestModelForTask(preset: ModelPreset, taskType: AgentTaskType): string {
  const assigned = preset.taskAssignments[taskType];
  return assigned?.[0] || preset.primaryModel;
}

/** Get all models used by a preset (unique, ordered) */
export function getPresetModels(preset: ModelPreset): string[] {
  const all = new Set<string>();
  all.add(preset.primaryModel);
  for (const m of preset.fallbackChain) all.add(m);
  for (const models of Object.values(preset.taskAssignments)) {
    for (const m of models || []) all.add(m);
  }
  return Array.from(all);
}

/**
 * Compute the effective iteration cooldown for a preset.
 * In rotation mode, we cycle through all low-tier models so the effective
 * cooldown is divided by the number of available fast models.
 */
export function getEffectiveIterationCooldown(preset: ModelPreset): number {
  // Find minimum cooldown in the chain — that's the bottleneck
  const chainCooldowns = preset.fallbackChain
    .map(m => preset.cooldowns[m] || MODEL_COOLDOWNS[m] || 10000);
  return Math.min(...chainCooldowns);
}

/**
 * Estimate total daily capacity for a preset (sum of all RPD across unique models).
 */
export function estimateDailyCapacity(preset: ModelPreset): number {
  const RPD: Record<string, number> = {
    'openai/gpt-4.1': 50,
    'openai/gpt-4.1-mini': 150,
    'openai/gpt-4.1-nano': 150,
    'openai/gpt-4o': 50,
    'openai/gpt-4o-mini': 150,
    'openai/o3': 8,
    'openai/o4-mini': 12,
    'meta/llama-4-scout': 150,
    'deepseek/DeepSeek-R1': 8,
    'xai/grok-3': 15,
    'xai/grok-3-mini': 30,
  };
  const models = getPresetModels(preset).filter(m => !m.startsWith('ollama/'));
  return models.reduce((sum, m) => sum + (RPD[m] || 0), 0);
}
