// ============================================
// Model Definitions & Rate Limits
// ============================================

/** Tier determines rate limits */
export type ModelTier = 'low' | 'high' | 'reasoning' | 'reasoning_mini' | 'deepseek' | 'grok' | 'grok_mini';

/** A model available through GitHub Models */
export interface ModelDefinition {
  id: string;
  name: string;
  publisher: string;
  tier: ModelTier;
  description: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsJsonMode: boolean;
  /** Whether this is a good default for each mode */
  recommendedFor: ('ask' | 'edit' | 'plan' | 'agent')[];
  /** Reasoning models (o3, o4-mini, DeepSeek-R1) need special parameter handling */
  isReasoning?: boolean;
  /** Some models reject the temperature parameter (o3, o4-mini, DeepSeek-R1) */
  supportsTemperature?: boolean;
  /** 'max_tokens' for most models, 'max_completion_tokens' for o-series reasoning */
  outputTokenParam?: 'max_tokens' | 'max_completion_tokens';
  /** Supports vision/image inputs */
  supportsVision?: boolean;
}

/** Rate limits per tier */
export interface RateLimits {
  requestsPerMinute: number;
  requestsPerDay: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxConcurrent: number;
}

/** All available models */
export const MODELS: ModelDefinition[] = [
  // --- OpenAI ---
  {
    id: 'openai/gpt-4.1',
    name: 'GPT-4.1',
    publisher: 'OpenAI',
    tier: 'high',
    description: 'Most capable general-purpose model. Great for complex coding tasks.',
    maxInputTokens: 8000,
    maxOutputTokens: 4000,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    recommendedFor: ['ask', 'edit', 'plan', 'agent'],
  },
  {
    id: 'openai/gpt-4.1-mini',
    name: 'GPT-4.1 Mini',
    publisher: 'OpenAI',
    tier: 'low',
    description: 'Fast and cost-effective. Good for simple tasks and high-volume use.',
    maxInputTokens: 8000,
    maxOutputTokens: 4000,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    recommendedFor: ['ask', 'edit'],
  },
  {
    id: 'openai/gpt-4.1-nano',
    name: 'GPT-4.1 Nano',
    publisher: 'OpenAI',
    tier: 'low',
    description: 'Fastest and cheapest. Good for simple completions and summaries.',
    maxInputTokens: 8000,
    maxOutputTokens: 4000,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    recommendedFor: ['ask'],
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    publisher: 'OpenAI',
    tier: 'high',
    description: 'Multimodal flagship model. Great for code, text, and image understanding.',
    maxInputTokens: 8000,
    maxOutputTokens: 4000,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    supportsVision: true,
    recommendedFor: ['ask', 'edit', 'plan'],
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    publisher: 'OpenAI',
    tier: 'low',
    description: 'Smaller, faster version of GPT-4o.',
    maxInputTokens: 8000,
    maxOutputTokens: 4000,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    supportsVision: true,
    recommendedFor: ['ask'],
  },
  {
    id: 'openai/o3',
    name: 'o3',
    publisher: 'OpenAI',
    tier: 'reasoning',
    description: 'Advanced reasoning model. Best for complex logic and multi-step problems.',
    maxInputTokens: 4000,
    maxOutputTokens: 4000,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    isReasoning: true,
    supportsTemperature: false,
    outputTokenParam: 'max_completion_tokens',
    recommendedFor: ['plan', 'agent'],
  },
  {
    id: 'openai/o4-mini',
    name: 'o4 Mini',
    publisher: 'OpenAI',
    tier: 'reasoning_mini',
    description: 'Fast reasoning model. Good balance of speed and reasoning depth.',
    maxInputTokens: 4000,
    maxOutputTokens: 4000,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    isReasoning: true,
    supportsTemperature: false,
    outputTokenParam: 'max_completion_tokens',
    recommendedFor: ['plan', 'agent'],
  },
  // --- Meta ---
  {
    id: 'meta/llama-4-maverick',
    name: 'Llama 4 Maverick',
    publisher: 'Meta',
    tier: 'low',
    description: 'Open-source powerhouse. Great for coding with generous rate limits.',
    maxInputTokens: 8000,
    maxOutputTokens: 4000,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    recommendedFor: ['ask', 'edit', 'agent'],
  },
  // --- DeepSeek ---
  {
    id: 'deepseek/DeepSeek-R1',
    name: 'DeepSeek R1',
    publisher: 'DeepSeek',
    tier: 'deepseek',
    description: 'Strong reasoning model. Excellent for code generation and analysis.',
    maxInputTokens: 4000,
    maxOutputTokens: 4000,
    supportsStreaming: true,
    supportsTools: false,
    supportsJsonMode: false,
    isReasoning: true,
    supportsTemperature: false,
    recommendedFor: ['ask', 'plan'],
  },
  // --- xAI ---
  {
    id: 'xai/grok-3',
    name: 'Grok 3',
    publisher: 'xAI',
    tier: 'grok',
    description: 'Latest Grok model. Strong at coding and creative tasks.',
    maxInputTokens: 4000,
    maxOutputTokens: 4000,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    recommendedFor: ['ask', 'edit'],
  },
  {
    id: 'xai/grok-3-mini',
    name: 'Grok 3 Mini',
    publisher: 'xAI',
    tier: 'grok_mini',
    description: 'Faster Grok model. Good for quick tasks with generous limits.',
    maxInputTokens: 4000,
    maxOutputTokens: 8000,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    recommendedFor: ['ask'],
  },
];

/** Rate limits by tier (GitHub free plan — from docs.github.com) */
export const RATE_LIMITS: Record<ModelTier, RateLimits> = {
  low:            { requestsPerMinute: 15, requestsPerDay: 150, maxInputTokens: 8000, maxOutputTokens: 4000, maxConcurrent: 5 },
  high:           { requestsPerMinute: 10, requestsPerDay: 50,  maxInputTokens: 8000, maxOutputTokens: 4000, maxConcurrent: 2 },
  reasoning:      { requestsPerMinute: 1,  requestsPerDay: 8,   maxInputTokens: 4000, maxOutputTokens: 4000, maxConcurrent: 1 },
  reasoning_mini: { requestsPerMinute: 2,  requestsPerDay: 12,  maxInputTokens: 4000, maxOutputTokens: 4000, maxConcurrent: 1 },
  deepseek:       { requestsPerMinute: 1,  requestsPerDay: 8,   maxInputTokens: 4000, maxOutputTokens: 4000, maxConcurrent: 1 },
  grok:           { requestsPerMinute: 1,  requestsPerDay: 15,  maxInputTokens: 4000, maxOutputTokens: 4000, maxConcurrent: 1 },
  grok_mini:      { requestsPerMinute: 2,  requestsPerDay: 30,  maxInputTokens: 4000, maxOutputTokens: 8000, maxConcurrent: 1 },
};

/** Default model ID */
export const DEFAULT_MODEL = 'openai/gpt-4.1';

/** Get the model definition by ID */
export function getModel(modelId: string): ModelDefinition | undefined {
  return MODELS.find(m => m.id === modelId);
}

/**
 * Build the correct LLM request parameters for any model.
 * Handles reasoning models (o3, o4-mini, DeepSeek-R1) that need
 * different parameter names and don't support temperature.
 */
export function buildModelParams(
  modelId: string,
  options: { temperature?: number; maxTokens?: number; jsonMode?: boolean }
): Record<string, any> {
  const model = getModel(modelId);
  const params: Record<string, any> = {};

  // Temperature — reasoning models reject it
  const supportsTemp = model?.supportsTemperature !== false;
  if (supportsTemp && options.temperature !== undefined) {
    params.temperature = options.temperature;
  }

  // Output tokens — reasoning models need max_completion_tokens
  const tokenParam = model?.outputTokenParam || 'max_tokens';
  if (options.maxTokens) {
    params[tokenParam] = options.maxTokens;
  } else {
    params[tokenParam] = model?.maxOutputTokens || 4096;
  }

  // JSON mode — only if model supports it
  const supportsJson = model?.supportsJsonMode !== false;
  if (options.jsonMode && supportsJson) {
    params.response_format = { type: 'json_object' };
  }

  return params;
}
export function getModelRateLimits(modelId: string): RateLimits | undefined {
  const model = getModel(modelId);
  return model ? RATE_LIMITS[model.tier] : undefined;
}

/** Get models recommended for a given mode */
export function getModelsForMode(mode: 'ask' | 'edit' | 'plan' | 'agent'): ModelDefinition[] {
  return MODELS.filter(m => m.recommendedFor.includes(mode));
}
