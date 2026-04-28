// ============================================
// Model Definitions & Rate Limits
// ============================================

/** Tier determines rate limits */
export type ModelTier = 'low' | 'high' | 'reasoning' | 'reasoning_mini' | 'deepseek' | 'grok' | 'grok_mini' | 'gemini_free' | 'gemini_pro' | 'groq_free' | 'cerebras_free' | 'anthropic_opus' | 'anthropic_sonnet' | 'anthropic_haiku' | 'openai_direct' | 'deepseek_direct' | 'qwen_free' | 'xai_direct' | 'perplexity_free' | 'fireworks_free' | 'siliconflow_free';

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
    maxInputTokens: 1047576,
    maxOutputTokens: 32768,
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
    maxInputTokens: 1047576,
    maxOutputTokens: 16384,
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
    maxInputTokens: 1047576,
    maxOutputTokens: 16384,
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
    maxInputTokens: 128000,
    maxOutputTokens: 16384,
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
    maxInputTokens: 128000,
    maxOutputTokens: 16384,
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
    maxInputTokens: 200000,
    maxOutputTokens: 100000,
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
    maxInputTokens: 200000,
    maxOutputTokens: 100000,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    isReasoning: true,
    supportsTemperature: false,
    outputTokenParam: 'max_completion_tokens',
    recommendedFor: ['plan', 'agent'],
  },
  // --- Meta ---
  // NOTE: Llama 4 Scout & Maverick REMOVED — both return 404 on GitHub Models.
  // Re-add when Meta models are available on the platform.

  // --- Google Gemini (via Gemini API — FREE tier) ---
  {
    id: 'gemini/gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    publisher: 'Google',
    tier: 'gemini_free',
    description: 'Ultra-fast Gemini model. FREE 1M context window, 15 RPM, 1500 RPD. Best free-tier value.',
    maxInputTokens: 1048576,
    maxOutputTokens: 65536,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    supportsVision: true,
    recommendedFor: ['ask', 'edit', 'plan', 'agent'],
  },
  {
    id: 'gemini/gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    publisher: 'Google',
    tier: 'gemini_pro',
    description: 'Most capable Gemini model. FREE 1M context, deep reasoning. 50 RPD limit.',
    maxInputTokens: 1048576,
    maxOutputTokens: 65536,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    supportsVision: true,
    isReasoning: true,
    recommendedFor: ['plan', 'agent'],
  },
  // --- Groq (via Groq API — FREE tier, ultra-fast inference) ---
  {
    id: 'groq/llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B (Groq)',
    publisher: 'Groq',
    tier: 'groq_free',
    description: 'Llama 3.3 70B on Groq hardware. FREE, 131K context, 30 RPM, ~280 tok/s.',
    maxInputTokens: 131072,
    maxOutputTokens: 32768,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    recommendedFor: ['ask', 'edit', 'agent'],
  },
  {
    id: 'groq/meta-llama/llama-4-scout-17b-16e-instruct',
    name: 'Llama 4 Scout 17B (Groq)',
    publisher: 'Groq',
    tier: 'groq_free',
    description: 'Meta Llama 4 Scout on Groq. Preview, 131K context, blazing fast ~750 tok/s.',
    maxInputTokens: 131072,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    recommendedFor: ['ask', 'edit', 'agent'],
  },
  {
    id: 'groq/qwen/qwen3-32b',
    name: 'Qwen3 32B (Groq)',
    publisher: 'Groq',
    tier: 'groq_free',
    description: 'Alibaba Qwen3-32B on Groq. Preview, 131K context, ~400 tok/s.',
    maxInputTokens: 131072,
    maxOutputTokens: 40960,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    isReasoning: true,
    recommendedFor: ['ask', 'plan', 'agent'],
  },
  // --- Cerebras (via Cerebras API — FREE tier, fastest inference anywhere) ---
  {
    id: 'cerebras/llama3.1-8b',
    name: 'Llama 3.1 8B (Cerebras)',
    publisher: 'Cerebras',
    tier: 'cerebras_free',
    description: 'Llama 3.1 8B on Cerebras Wafer-Scale Engine. FREE, ~2600 tok/s.',
    maxInputTokens: 8192,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    recommendedFor: ['ask', 'edit'],
  },
  {
    id: 'cerebras/llama-3.3-70b',
    name: 'Llama 3.3 70B (Cerebras)',
    publisher: 'Cerebras',
    tier: 'cerebras_free',
    description: 'Llama 3.3 70B on Cerebras. FREE, ~890 tok/s, 128K context.',
    maxInputTokens: 128000,
    maxOutputTokens: 32768,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    recommendedFor: ['ask', 'edit', 'agent'],
  },
  {
    id: 'cerebras/qwen-3-32b',
    name: 'Qwen3 32B (Cerebras)',
    publisher: 'Cerebras',
    tier: 'cerebras_free',
    description: 'Qwen3-32B on Cerebras. FREE, ~1000 tok/s, 32K context.',
    maxInputTokens: 32768,
    maxOutputTokens: 32768,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    isReasoning: true,
    recommendedFor: ['ask', 'plan', 'agent'],
  },
  // --- DeepSeek ---
  {
    id: 'deepseek/DeepSeek-R1',
    name: 'DeepSeek R1',
    publisher: 'DeepSeek',
    tier: 'deepseek',
    description: 'Strong reasoning model. Excellent for code generation and analysis.',
    maxInputTokens: 128000,
    maxOutputTokens: 32768,
    supportsStreaming: true,
    supportsTools: false,
    supportsJsonMode: false,
    isReasoning: true,
    supportsTemperature: false,
    recommendedFor: ['ask', 'plan'],
  },
  // --- DeepSeek Direct (via DeepSeek API) ---
  {
    id: 'deepseek-direct/deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    publisher: 'DeepSeek',
    tier: 'deepseek_direct',
    description: 'DeepSeek V4 Flash via DeepSeek API. Thinking mode. 1M context, $0.14/1M input.',
    maxInputTokens: 1000000,
    maxOutputTokens: 65536,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    isReasoning: true,
    recommendedFor: ['ask', 'plan', 'agent'],
  },
  {
    id: 'deepseek-direct/deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    publisher: 'DeepSeek',
    tier: 'deepseek_direct',
    description: 'DeepSeek V4 Pro via DeepSeek API. Most capable. 1M context.',
    maxInputTokens: 1000000,
    maxOutputTokens: 65536,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    isReasoning: true,
    recommendedFor: ['plan', 'agent'],
  },
  // --- Anthropic (via Anthropic API) ---
  {
    id: 'anthropic/claude-opus-4-7',
    name: 'Claude Opus 4.7',
    publisher: 'Anthropic',
    tier: 'anthropic_opus',
    description: 'Most capable Claude. Complex reasoning, agentic coding. 1M context. $5/1M input.',
    maxInputTokens: 1000000,
    maxOutputTokens: 128000,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    supportsVision: true,
    recommendedFor: ['plan', 'agent'],
  },
  {
    id: 'anthropic/claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    publisher: 'Anthropic',
    tier: 'anthropic_sonnet',
    description: 'Best speed/intelligence balance. 1M context. $3/1M input.',
    maxInputTokens: 1000000,
    maxOutputTokens: 64000,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    supportsVision: true,
    isReasoning: true,
    recommendedFor: ['ask', 'edit', 'plan', 'agent'],
  },
  {
    id: 'anthropic/claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    publisher: 'Anthropic',
    tier: 'anthropic_haiku',
    description: 'Fastest Claude. Near-frontier intelligence. 200K context. $1/1M input.',
    maxInputTokens: 200000,
    maxOutputTokens: 64000,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    supportsVision: true,
    isReasoning: true,
    recommendedFor: ['ask', 'edit'],
  },
  // --- OpenAI Direct (via OpenAI API) ---
  {
    id: 'openai-direct/gpt-4o',
    name: 'GPT-4o (Direct)',
    publisher: 'OpenAI',
    tier: 'openai_direct',
    description: 'GPT-4o via direct OpenAI API. Multimodal. 128K context.',
    maxInputTokens: 128000,
    maxOutputTokens: 16384,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    supportsVision: true,
    recommendedFor: ['ask', 'edit', 'plan'],
  },
  {
    id: 'openai-direct/gpt-4.1',
    name: 'GPT-4.1 (Direct)',
    publisher: 'OpenAI',
    tier: 'openai_direct',
    description: 'GPT-4.1 via direct OpenAI API. 1M context.',
    maxInputTokens: 1047576,
    maxOutputTokens: 32768,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    recommendedFor: ['ask', 'edit', 'plan', 'agent'],
  },
  // --- xAI ---
  {
    id: 'xai/grok-3',
    name: 'Grok 3',
    publisher: 'xAI',
    tier: 'grok',
    description: 'Latest Grok model. Strong at coding and creative tasks.',
    maxInputTokens: 131072,
    maxOutputTokens: 32768,
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
    maxInputTokens: 131072,
    maxOutputTokens: 32768,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    recommendedFor: ['ask'],
  },
  // --- Perplexity ---
  {
    id: 'perplexity/sonar',
    name: 'Perplexity Sonar',
    publisher: 'Perplexity',
    tier: 'perplexity_free',
    description: 'Perplexity Sonar with real-time web search. 127K context.',
    maxInputTokens: 127072,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsTools: false,
    supportsJsonMode: false,
    recommendedFor: ['ask'],
  },
  {
    id: 'perplexity/sonar-pro',
    name: 'Perplexity Sonar Pro',
    publisher: 'Perplexity',
    tier: 'perplexity_free',
    description: 'Advanced Perplexity model with web search. 200K context.',
    maxInputTokens: 200000,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsTools: false,
    supportsJsonMode: false,
    recommendedFor: ['ask', 'plan'],
  },
  // --- Fireworks ---
  {
    id: 'fireworks/accounts/fireworks/models/llama-v3p3-70b-instruct',
    name: 'Llama 3.3 70B (Fireworks)',
    publisher: 'Fireworks',
    tier: 'fireworks_free',
    description: 'Llama 3.3 70B via Fireworks AI. Fast cloud inference.',
    maxInputTokens: 131072,
    maxOutputTokens: 32768,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    recommendedFor: ['ask', 'edit', 'agent'],
  },
  // --- SiliconFlow (free open models) ---
  {
    id: 'siliconflow/Qwen/Qwen2.5-72B-Instruct',
    name: 'Qwen2.5 72B (SiliconFlow)',
    publisher: 'SiliconFlow',
    tier: 'siliconflow_free',
    description: 'Qwen2.5 72B via SiliconFlow. FREE tier available. 128K context.',
    maxInputTokens: 128000,
    maxOutputTokens: 32768,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    recommendedFor: ['ask', 'edit', 'agent'],
  },
  {
    id: 'siliconflow/deepseek-ai/DeepSeek-V3',
    name: 'DeepSeek V3 (SiliconFlow)',
    publisher: 'SiliconFlow',
    tier: 'siliconflow_free',
    description: 'DeepSeek V3 via SiliconFlow. FREE tier. 64K context.',
    maxInputTokens: 64000,
    maxOutputTokens: 16384,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonMode: true,
    recommendedFor: ['ask', 'edit', 'agent'],
  },
];

/** Rate limits by tier (GitHub free plan — from docs.github.com) */
export const RATE_LIMITS: Record<ModelTier, RateLimits> = {
  // GitHub Models tiers (8K per-request cap)
  low:              { requestsPerMinute: 15, requestsPerDay: 150,  maxInputTokens: 8000,    maxOutputTokens: 4000,  maxConcurrent: 5 },
  high:             { requestsPerMinute: 10, requestsPerDay: 50,   maxInputTokens: 8000,    maxOutputTokens: 4000,  maxConcurrent: 2 },
  reasoning:        { requestsPerMinute: 1,  requestsPerDay: 8,    maxInputTokens: 4000,    maxOutputTokens: 4000,  maxConcurrent: 1 },
  reasoning_mini:   { requestsPerMinute: 2,  requestsPerDay: 12,   maxInputTokens: 4000,    maxOutputTokens: 4000,  maxConcurrent: 1 },
  deepseek:         { requestsPerMinute: 1,  requestsPerDay: 8,    maxInputTokens: 4000,    maxOutputTokens: 4000,  maxConcurrent: 1 },
  grok:             { requestsPerMinute: 1,  requestsPerDay: 15,   maxInputTokens: 4000,    maxOutputTokens: 4000,  maxConcurrent: 1 },
  grok_mini:        { requestsPerMinute: 2,  requestsPerDay: 30,   maxInputTokens: 4000,    maxOutputTokens: 8000,  maxConcurrent: 1 },
  // External free-tier providers (NO per-request token cap!)
  gemini_free:      { requestsPerMinute: 15, requestsPerDay: 1500, maxInputTokens: 1048576, maxOutputTokens: 65536, maxConcurrent: 5 },
  gemini_pro:       { requestsPerMinute: 2,  requestsPerDay: 50,   maxInputTokens: 1048576, maxOutputTokens: 65536, maxConcurrent: 1 },
  groq_free:        { requestsPerMinute: 30, requestsPerDay: 1000, maxInputTokens: 131072,  maxOutputTokens: 32768, maxConcurrent: 5 },
  cerebras_free:    { requestsPerMinute: 30, requestsPerDay: 1000, maxInputTokens: 131072,  maxOutputTokens: 32768, maxConcurrent: 5 },
  // Paid direct API providers
  anthropic_opus:   { requestsPerMinute: 50, requestsPerDay: 5000,  maxInputTokens: 1000000, maxOutputTokens: 128000, maxConcurrent: 5 },
  anthropic_sonnet: { requestsPerMinute: 50, requestsPerDay: 5000,  maxInputTokens: 1000000, maxOutputTokens: 64000,  maxConcurrent: 5 },
  anthropic_haiku:  { requestsPerMinute: 50, requestsPerDay: 10000, maxInputTokens: 200000,  maxOutputTokens: 64000,  maxConcurrent: 10 },
  openai_direct:    { requestsPerMinute: 60, requestsPerDay: 10000, maxInputTokens: 1047576, maxOutputTokens: 32768,  maxConcurrent: 10 },
  deepseek_direct:  { requestsPerMinute: 60, requestsPerDay: 10000, maxInputTokens: 1000000, maxOutputTokens: 65536,  maxConcurrent: 10 },
  qwen_free:        { requestsPerMinute: 30, requestsPerDay: 1000,  maxInputTokens: 131072,  maxOutputTokens: 32768,  maxConcurrent: 5 },
  xai_direct:       { requestsPerMinute: 60, requestsPerDay: 5000,  maxInputTokens: 131072,  maxOutputTokens: 32768,  maxConcurrent: 5 },
  perplexity_free:  { requestsPerMinute: 20, requestsPerDay: 1000,  maxInputTokens: 200000,  maxOutputTokens: 8192,   maxConcurrent: 3 },
  fireworks_free:   { requestsPerMinute: 30, requestsPerDay: 1000,  maxInputTokens: 131072,  maxOutputTokens: 32768,  maxConcurrent: 5 },
  siliconflow_free: { requestsPerMinute: 20, requestsPerDay: 1000,  maxInputTokens: 128000,  maxOutputTokens: 32768,  maxConcurrent: 5 },
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

/** All known provider prefixes used in model IDs */
const KNOWN_PROVIDER_PREFIXES = [
  'ollama', 'groq', 'gemini', 'cerebras', 'huggingface',
  'cohere', 'mistral', 'together', 'openrouter', 'lmstudio', 'nano',
  'anthropic', 'openai-direct', 'deepseek-direct', 'qwen', 'zhipuai',
  'moonshot', 'minimax', 'xai', 'perplexity', 'fireworks', 'siliconflow',
];

/**
 * Extract the provider ID from a model ID string.
 * e.g., 'openai/gpt-4.1' -> 'github' (OpenAI models go through GitHub)
 *       'gemini/gemini-2.5-flash' -> 'gemini'
 *       'groq/llama-3.3-70b-versatile' -> 'groq'
 *       'groq/meta-llama/llama-4-scout-17b-16e-instruct' -> 'groq'
 *       'cerebras/llama3.1-8b' -> 'cerebras'
 *       'anthropic/claude-sonnet-4-6' -> 'anthropic'
 *       'openai-direct/gpt-4.1' -> 'openai-direct'
 *       'ollama/codestral' -> 'ollama'
 *       'nano/some-model' -> 'nano'
 */
export function extractProviderFromModelId(modelId: string): string {
  const slashIdx = modelId.indexOf('/');
  if (slashIdx <= 0) return 'github'; // No prefix = GitHub Models

  const prefix = modelId.substring(0, slashIdx).toLowerCase();

  if (KNOWN_PROVIDER_PREFIXES.includes(prefix)) return prefix;

  // OpenAI / Meta / Microsoft / xAI / DeepSeek models go through GitHub Models API
  return 'github';
}
