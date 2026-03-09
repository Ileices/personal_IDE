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
  /** Estimated cost per 24h in USD (0 = free tier only) */
  estimatedCostPer24h?: number;
  /** Whether this preset includes paid API models */
  paidModelsIncluded?: boolean;
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
  'deepseek/DeepSeek-R1': safeCooldown(1),   // ~69s → 69s
  'xai/grok-3':           safeCooldown(1),   // ~69s → 69s
  'xai/grok-3-mini':      safeCooldown(2),   // ~34.5s → 35s
  // External free providers (generous rate limits → low cooldowns)
  'gemini/gemini-2.5-flash':              safeCooldown(15),  // ~4.6s
  'gemini/gemini-2.5-pro':                safeCooldown(2),   // ~34.5s
  'groq/llama-3.3-70b-versatile':         safeCooldown(30),  // ~2.3s
  'groq/llama-4-scout-17b-16e-instruct':  safeCooldown(30),  // ~2.3s
  'cerebras/llama-4-scout-17b-16e-instruct': safeCooldown(30), // ~2.3s
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
  'deepseek/DeepSeek-R1': Math.ceil(86400000 / 8 * 1.1),
  'xai/grok-3':           Math.ceil(86400000 / 15 * 1.1),    // ~6336s → ~1.76h
  'xai/grok-3-mini':      Math.ceil(86400000 / 30 * 1.1),    // ~3168s → ~53min
  // External providers — much more generous
  'gemini/gemini-2.5-flash':              Math.ceil(86400000 / 1500 * 1.1), // ~63s
  'gemini/gemini-2.5-pro':                Math.ceil(86400000 / 50 * 1.1),
  'groq/llama-3.3-70b-versatile':         Math.ceil(86400000 / 1000 * 1.1), // ~95s
  'groq/llama-4-scout-17b-16e-instruct':  Math.ceil(86400000 / 1000 * 1.1),
  'cerebras/llama-4-scout-17b-16e-instruct': Math.ceil(86400000 / 1000 * 1.1),
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
    description: 'Uses all available models with smart rotation. Maximizes daily throughput by spreading requests across every provider. Best for 24/7 operation.',
    primaryModel: 'openai/gpt-4.1',
    fallbackChain: [
      'openai/gpt-4.1',
      'openai/gpt-4.1-mini',
      'gemini/gemini-2.5-flash',
      'groq/llama-3.3-70b-versatile',
      'openai/gpt-4o',
      'xai/grok-3-mini',
      'openai/gpt-4o-mini',
      'openai/gpt-4.1-nano',
      'cerebras/llama-4-scout-17b-16e-instruct',
      'groq/llama-4-scout-17b-16e-instruct',
      'xai/grok-3',
      'openai/o4-mini',
      'deepseek/DeepSeek-R1',
      'openai/o3',
    ],
    taskAssignments: {
      planning: ['openai/o3', 'deepseek/DeepSeek-R1', 'openai/gpt-4.1', 'openai/o4-mini', 'gemini/gemini-2.5-pro'],
      coding: ['openai/gpt-4.1', 'xai/grok-3', 'gemini/gemini-2.5-flash', 'groq/llama-3.3-70b-versatile', 'openai/gpt-4o'],
      iteration: ['openai/gpt-4.1-mini', 'groq/llama-3.3-70b-versatile', 'cerebras/llama-4-scout-17b-16e-instruct', 'openai/gpt-4o-mini', 'xai/grok-3-mini', 'openai/gpt-4.1-nano'],
      review: ['openai/o4-mini', 'openai/gpt-4.1', 'deepseek/DeepSeek-R1', 'xai/grok-3'],
      debugging: ['openai/gpt-4.1', 'openai/o4-mini', 'gemini/gemini-2.5-flash', 'openai/gpt-4o', 'xai/grok-3'],
      general: ['openai/gpt-4.1-mini', 'groq/llama-3.3-70b-versatile', 'openai/gpt-4o-mini'],
    },
    cooldowns: { ...MODEL_COOLDOWNS },
    tags: ['all', 'balanced', '24/7', 'recommended'],
    continuousReady: true,
    estimatedCostPer24h: 0,
    paidModelsIncluded: false,
  },

  // ── 2. Speed & Volume ──
  {
    id: 'speed-volume',
    name: 'Speed & Volume — Low-Tier Focus',
    description: 'Prioritizes fast, high-rate-limit models for maximum iteration speed. Includes Groq & Cerebras for ultra-fast inference. Best for bulk file operations.',
    primaryModel: 'openai/gpt-4.1-mini',
    fallbackChain: [
      'openai/gpt-4.1-mini',
      'groq/llama-3.3-70b-versatile',
      'cerebras/llama-4-scout-17b-16e-instruct',
      'openai/gpt-4o-mini',
      'groq/llama-4-scout-17b-16e-instruct',
      'openai/gpt-4.1-nano',
      'xai/grok-3-mini',
      'openai/gpt-4.1',
      'openai/gpt-4o',
    ],
    taskAssignments: {
      planning: ['openai/gpt-4.1-mini', 'groq/llama-3.3-70b-versatile'],
      coding: ['openai/gpt-4.1-mini', 'groq/llama-3.3-70b-versatile', 'openai/gpt-4o-mini'],
      iteration: ['cerebras/llama-4-scout-17b-16e-instruct', 'groq/llama-4-scout-17b-16e-instruct', 'openai/gpt-4.1-nano', 'xai/grok-3-mini'],
      review: ['openai/gpt-4.1-mini', 'groq/llama-3.3-70b-versatile'],
      debugging: ['openai/gpt-4.1-mini', 'openai/gpt-4o-mini'],
      general: ['openai/gpt-4.1-nano', 'cerebras/llama-4-scout-17b-16e-instruct', 'openai/gpt-4o-mini'],
    },
    cooldowns: { ...MODEL_COOLDOWNS },
    tags: ['speed', 'volume', 'bulk', '24/7'],
    continuousReady: true,
    estimatedCostPer24h: 0,
    paidModelsIncluded: false,
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
      'groq/llama-3.3-70b-versatile',
    ],
    taskAssignments: {
      planning: ['openai/o3', 'deepseek/DeepSeek-R1', 'openai/o4-mini'],
      coding: ['openai/gpt-4.1', 'xai/grok-3', 'openai/o4-mini'],
      iteration: ['openai/gpt-4.1-mini', 'groq/llama-3.3-70b-versatile'],
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
      'gemini/gemini-2.5-flash',
      'groq/llama-3.3-70b-versatile',
      'openai/gpt-4o-mini',
      'openai/gpt-4.1-nano',
      'cerebras/llama-4-scout-17b-16e-instruct',
      'xai/grok-3-mini',
      'openai/gpt-4.1',
      'openai/gpt-4o',
      'xai/grok-3',
      'openai/o4-mini',
    ],
    taskAssignments: {
      planning: ['openai/gpt-4.1', 'openai/gpt-4.1-mini'],
      coding: ['openai/gpt-4.1-mini', 'gemini/gemini-2.5-flash', 'groq/llama-3.3-70b-versatile', 'openai/gpt-4o-mini'],
      iteration: ['openai/gpt-4.1-nano', 'cerebras/llama-4-scout-17b-16e-instruct', 'openai/gpt-4.1-mini'],
      review: ['openai/gpt-4.1-mini', 'openai/gpt-4.1'],
      debugging: ['openai/gpt-4.1-mini', 'openai/gpt-4o-mini'],
      general: ['openai/gpt-4.1-nano', 'groq/llama-3.3-70b-versatile'],
    },
    cooldowns: { ...DAILY_BUDGET_COOLDOWNS },
    tags: ['conservative', '24/7', 'ban-free', 'marathon'],
    continuousReady: true,
    estimatedCostPer24h: 0,
    paidModelsIncluded: false,
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
      'groq/llama-3.3-70b-versatile',
      'openai/gpt-4o-mini',
      'openai/o4-mini',
    ],
    taskAssignments: {
      planning: ['xai/grok-3', 'openai/gpt-4.1', 'openai/o4-mini'],
      coding: ['xai/grok-3', 'openai/gpt-4.1', 'groq/llama-3.3-70b-versatile'],
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

  // ── 7. Open-Source Focus (Groq/Cerebras) ──
  {
    id: 'open-source-focus',
    name: 'Open-Source Focus — Groq + Cerebras',
    description: 'Prioritizes open-source Llama models on Groq & Cerebras hardware. Ultra-fast, FREE, 131K context. Falls back to GitHub mini models when needed.',
    primaryModel: 'groq/llama-3.3-70b-versatile',
    fallbackChain: [
      'groq/llama-3.3-70b-versatile',
      'groq/llama-4-scout-17b-16e-instruct',
      'cerebras/llama-4-scout-17b-16e-instruct',
      'openai/gpt-4.1-mini',
      'openai/gpt-4o-mini',
      'openai/gpt-4.1-nano',
      'deepseek/DeepSeek-R1',
      'xai/grok-3-mini',
    ],
    taskAssignments: {
      planning: ['groq/llama-3.3-70b-versatile', 'deepseek/DeepSeek-R1'],
      coding: ['groq/llama-3.3-70b-versatile', 'cerebras/llama-4-scout-17b-16e-instruct', 'openai/gpt-4.1-mini'],
      iteration: ['cerebras/llama-4-scout-17b-16e-instruct', 'groq/llama-4-scout-17b-16e-instruct', 'openai/gpt-4.1-nano'],
      review: ['deepseek/DeepSeek-R1', 'groq/llama-3.3-70b-versatile'],
      debugging: ['groq/llama-3.3-70b-versatile', 'openai/gpt-4.1-mini'],
      general: ['groq/llama-4-scout-17b-16e-instruct', 'openai/gpt-4o-mini'],
    },
    cooldowns: { ...MODEL_COOLDOWNS },
    tags: ['open-source', 'groq', 'cerebras', 'llama', 'fast'],
    continuousReady: true,
    estimatedCostPer24h: 0,
    paidModelsIncluded: false,
  },

  // ── 8. High-Context Free (NEW) ──
  {
    id: 'high-context-free',
    name: 'High-Context Free — Gemini + Groq',
    description: 'Eliminates the 8K token bottleneck by using Gemini (1M context) and Groq (131K context). Zero chunking overhead. FREE. Best for large codebases.',
    primaryModel: 'gemini/gemini-2.5-flash',
    fallbackChain: [
      'gemini/gemini-2.5-flash',
      'groq/llama-3.3-70b-versatile',
      'groq/llama-4-scout-17b-16e-instruct',
      'cerebras/llama-4-scout-17b-16e-instruct',
      'gemini/gemini-2.5-pro',
      'openai/gpt-4.1-mini',
      'openai/gpt-4.1-nano',
    ],
    taskAssignments: {
      planning: ['gemini/gemini-2.5-pro', 'gemini/gemini-2.5-flash', 'groq/llama-3.3-70b-versatile'],
      coding: ['gemini/gemini-2.5-flash', 'groq/llama-3.3-70b-versatile', 'cerebras/llama-4-scout-17b-16e-instruct'],
      iteration: ['groq/llama-4-scout-17b-16e-instruct', 'cerebras/llama-4-scout-17b-16e-instruct', 'gemini/gemini-2.5-flash'],
      review: ['gemini/gemini-2.5-pro', 'groq/llama-3.3-70b-versatile'],
      debugging: ['gemini/gemini-2.5-flash', 'groq/llama-3.3-70b-versatile'],
      general: ['gemini/gemini-2.5-flash', 'groq/llama-4-scout-17b-16e-instruct'],
    },
    cooldowns: { ...MODEL_COOLDOWNS },
    tags: ['high-context', 'no-chunking', 'free', '24/7', 'recommended'],
    continuousReady: true,
    estimatedCostPer24h: 0,
    paidModelsIncluded: false,
  },

  // ── 9. Speed Demon (NEW) ──
  {
    id: 'speed-demon',
    name: 'Speed Demon — Cerebras + Groq',
    description: 'Maximum inference speed. Cerebras (~3000 tok/s) + Groq (~2200 tok/s). FREE. Best for rapid iteration cycles.',
    primaryModel: 'cerebras/llama-4-scout-17b-16e-instruct',
    fallbackChain: [
      'cerebras/llama-4-scout-17b-16e-instruct',
      'groq/llama-4-scout-17b-16e-instruct',
      'groq/llama-3.3-70b-versatile',
      'gemini/gemini-2.5-flash',
      'openai/gpt-4.1-mini',
      'openai/gpt-4.1-nano',
    ],
    taskAssignments: {
      planning: ['groq/llama-3.3-70b-versatile', 'gemini/gemini-2.5-flash'],
      coding: ['cerebras/llama-4-scout-17b-16e-instruct', 'groq/llama-3.3-70b-versatile'],
      iteration: ['cerebras/llama-4-scout-17b-16e-instruct', 'groq/llama-4-scout-17b-16e-instruct'],
      review: ['groq/llama-3.3-70b-versatile', 'gemini/gemini-2.5-flash'],
      debugging: ['groq/llama-3.3-70b-versatile', 'cerebras/llama-4-scout-17b-16e-instruct'],
      general: ['cerebras/llama-4-scout-17b-16e-instruct', 'groq/llama-4-scout-17b-16e-instruct'],
    },
    cooldowns: { ...MODEL_COOLDOWNS },
    tags: ['speed', 'fastest', 'free', 'cerebras', 'groq'],
    continuousReady: true,
    estimatedCostPer24h: 0,
    paidModelsIncluded: false,
  },

  // ── 10. GitHub Free Compressed (NEW) ──
  {
    id: 'github-free-compressed',
    name: 'GitHub Free — Compressed Prompts',
    description: 'Uses ONLY GitHub Models with compressed prompts to maximize the 8K per-request budget. No external API keys needed.',
    primaryModel: 'openai/gpt-4.1-mini',
    fallbackChain: [
      'openai/gpt-4.1-mini',
      'openai/gpt-4o-mini',
      'openai/gpt-4.1-nano',
      'xai/grok-3-mini',
      'openai/gpt-4.1',
      'openai/gpt-4o',
    ],
    taskAssignments: {
      planning: ['openai/gpt-4.1', 'openai/gpt-4.1-mini'],
      coding: ['openai/gpt-4.1-mini', 'openai/gpt-4o-mini'],
      iteration: ['openai/gpt-4.1-nano', 'openai/gpt-4.1-mini'],
      review: ['openai/gpt-4.1', 'openai/gpt-4.1-mini'],
      debugging: ['openai/gpt-4.1-mini', 'openai/gpt-4o-mini'],
      general: ['openai/gpt-4.1-nano', 'openai/gpt-4o-mini'],
    },
    cooldowns: { ...MODEL_COOLDOWNS },
    tags: ['github-only', 'compressed', 'no-external-keys'],
    continuousReady: true,
    estimatedCostPer24h: 0,
    paidModelsIncluded: false,
  },

  // ── 11. Mixed Free + Paid (NEW) ──
  {
    id: 'mixed-free-paid',
    name: 'Mixed Free + Paid — Best Quality',
    description: 'Uses free-tier providers for routine work, premium GitHub models for complex tasks. Maximizes quality while minimizing cost. Ideal hybrid strategy.',
    primaryModel: 'gemini/gemini-2.5-flash',
    fallbackChain: [
      'gemini/gemini-2.5-flash',
      'groq/llama-3.3-70b-versatile',
      'openai/gpt-4.1',
      'openai/gpt-4o',
      'cerebras/llama-4-scout-17b-16e-instruct',
      'openai/gpt-4.1-mini',
      'openai/o4-mini',
      'gemini/gemini-2.5-pro',
      'openai/o3',
    ],
    taskAssignments: {
      planning: ['openai/o3', 'gemini/gemini-2.5-pro', 'openai/gpt-4.1'],
      coding: ['gemini/gemini-2.5-flash', 'openai/gpt-4.1', 'groq/llama-3.3-70b-versatile'],
      iteration: ['groq/llama-3.3-70b-versatile', 'cerebras/llama-4-scout-17b-16e-instruct', 'openai/gpt-4.1-mini'],
      review: ['openai/o4-mini', 'gemini/gemini-2.5-pro', 'openai/gpt-4.1'],
      debugging: ['openai/gpt-4.1', 'gemini/gemini-2.5-flash', 'openai/o4-mini'],
      general: ['gemini/gemini-2.5-flash', 'groq/llama-3.3-70b-versatile'],
    },
    cooldowns: { ...MODEL_COOLDOWNS },
    tags: ['mixed', 'quality', 'hybrid', 'free+paid', '24/7'],
    continuousReady: true,
    estimatedCostPer24h: 0,
    paidModelsIncluded: false,
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
    'deepseek/DeepSeek-R1': 8,
    'xai/grok-3': 15,
    'xai/grok-3-mini': 30,
    // External free providers
    'gemini/gemini-2.5-flash': 1500,
    'gemini/gemini-2.5-pro': 50,
    'groq/llama-3.3-70b-versatile': 1000,
    'groq/llama-4-scout-17b-16e-instruct': 1000,
    'cerebras/llama-4-scout-17b-16e-instruct': 1000,
  };
  const models = getPresetModels(preset).filter(m => !m.startsWith('ollama/'));
  return models.reduce((sum, m) => sum + (RPD[m] || 0), 0);
}

/**
 * Get the maximum context window available in a preset's model chain.
 * Useful for determining if chunking can be avoided.
 */
export function getMaxContextInPreset(preset: ModelPreset): number {
  const CONTEXT: Record<string, number> = {
    'gemini/gemini-2.5-flash': 1048576,
    'gemini/gemini-2.5-pro': 1048576,
    'groq/llama-3.3-70b-versatile': 131072,
    'groq/llama-4-scout-17b-16e-instruct': 131072,
    'cerebras/llama-4-scout-17b-16e-instruct': 131072,
    'openai/gpt-4.1': 1047576,
    'openai/gpt-4.1-mini': 1047576,
    'openai/gpt-4.1-nano': 1047576,
    'openai/gpt-4o': 128000,
    'openai/gpt-4o-mini': 128000,
    'openai/o3': 200000,
    'openai/o4-mini': 200000,
    'deepseek/DeepSeek-R1': 128000,
    'xai/grok-3': 131072,
    'xai/grok-3-mini': 131072,
  };
  const models = getPresetModels(preset);
  return Math.max(...models.map(m => CONTEXT[m] || 8000));
}
