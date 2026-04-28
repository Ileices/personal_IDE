// ============================================
// Model Definitions & Rate Limits
// ============================================

/** Tier determines rate limits */
export type ModelTier = 'low' | 'high' | 'reasoning' | 'reasoning_mini' | 'deepseek' | 'grok' | 'grok_mini' | 'gemini_free' | 'gemini_pro' | 'groq_free' | 'cerebras_free' | 'anthropic_opus' | 'anthropic_sonnet' | 'anthropic_haiku' | 'openai_direct' | 'deepseek_direct' | 'qwen_free' | 'xai_direct' | 'perplexity_free' | 'fireworks_free' | 'siliconflow_free' | 'mistral_free' | 'together_free' | 'openrouter_free' | 'ollama_local' | 'cohere_free';

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

  // ─────────────────────────────────────────────────────────────────
  // MORE GROQ FREE MODELS
  // ─────────────────────────────────────────────────────────────────
  { id: 'groq/llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant (Groq)', publisher: 'Groq', tier: 'groq_free', description: 'Ultra-fast Llama 3.1 8B. FREE, ~2000 tok/s, 131K context.', maxInputTokens: 131072, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit'] },
  { id: 'groq/llama-3.1-70b-versatile', name: 'Llama 3.1 70B Versatile (Groq)', publisher: 'Groq', tier: 'groq_free', description: 'Llama 3.1 70B on Groq. FREE, 131K context, great for complex tasks.', maxInputTokens: 131072, maxOutputTokens: 32768, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit', 'plan', 'agent'] },
  { id: 'groq/llama3-8b-8192', name: 'Llama 3 8B (Groq)', publisher: 'Groq', tier: 'groq_free', description: 'Meta Llama 3 8B on Groq. FREE, 8K context, very fast.', maxInputTokens: 8192, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask'] },
  { id: 'groq/llama3-70b-8192', name: 'Llama 3 70B (Groq)', publisher: 'Groq', tier: 'groq_free', description: 'Meta Llama 3 70B on Groq. FREE, 8K context, high quality.', maxInputTokens: 8192, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask', 'edit', 'plan'] },
  { id: 'groq/mixtral-8x7b-32768', name: 'Mixtral 8x7B (Groq)', publisher: 'Groq', tier: 'groq_free', description: 'Mistral Mixtral 8x7B MoE on Groq. FREE, 32K context.', maxInputTokens: 32768, maxOutputTokens: 32768, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit', 'agent'] },
  { id: 'groq/gemma2-9b-it', name: 'Gemma 2 9B (Groq)', publisher: 'Groq', tier: 'groq_free', description: 'Google Gemma 2 9B on Groq. FREE, 8K context, instruction tuned.', maxInputTokens: 8192, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask'] },
  { id: 'groq/llama-3.2-1b-preview', name: 'Llama 3.2 1B (Groq)', publisher: 'Groq', tier: 'groq_free', description: 'Tiny Llama 3.2 1B on Groq. FREE, 128K context, ~3000 tok/s.', maxInputTokens: 128000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask'] },
  { id: 'groq/llama-3.2-3b-preview', name: 'Llama 3.2 3B (Groq)', publisher: 'Groq', tier: 'groq_free', description: 'Llama 3.2 3B on Groq. FREE, 128K context, fast and efficient.', maxInputTokens: 128000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask'] },
  { id: 'groq/llama-3.2-11b-vision-preview', name: 'Llama 3.2 11B Vision (Groq)', publisher: 'Groq', tier: 'groq_free', description: 'Llama 3.2 11B with vision on Groq. FREE, 128K context, multimodal.', maxInputTokens: 128000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, supportsVision: true, recommendedFor: ['ask'] },
  { id: 'groq/llama-3.2-90b-vision-preview', name: 'Llama 3.2 90B Vision (Groq)', publisher: 'Groq', tier: 'groq_free', description: 'Llama 3.2 90B with vision on Groq. FREE, 128K context, top multimodal.', maxInputTokens: 128000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, supportsVision: true, recommendedFor: ['ask', 'edit'] },
  { id: 'groq/deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill Llama 70B (Groq)', publisher: 'Groq', tier: 'groq_free', description: 'DeepSeek R1 reasoning distilled into Llama 70B on Groq. FREE, 131K context.', maxInputTokens: 131072, maxOutputTokens: 32768, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, isReasoning: true, recommendedFor: ['ask', 'plan', 'agent'] },
  { id: 'groq/llama-3.3-70b-specdec', name: 'Llama 3.3 70B SpecDec (Groq)', publisher: 'Groq', tier: 'groq_free', description: 'Llama 3.3 70B with speculative decoding on Groq. FREE, blazing fast.', maxInputTokens: 8192, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit'] },
  { id: 'groq/meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick 17B (Groq)', publisher: 'Groq', tier: 'groq_free', description: 'Meta Llama 4 Maverick MoE on Groq. Preview, 131K context.', maxInputTokens: 131072, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit', 'agent'] },
  { id: 'groq/qwen/qwen3-8b', name: 'Qwen3 8B (Groq)', publisher: 'Groq', tier: 'groq_free', description: 'Alibaba Qwen3-8B on Groq. Preview, fast inference.', maxInputTokens: 131072, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit'] },
  { id: 'groq/mistral-saba-24b', name: 'Mistral Saba 24B (Groq)', publisher: 'Groq', tier: 'groq_free', description: 'Mistral Saba 24B on Groq. FREE tier. 32K context.', maxInputTokens: 32768, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit'] },

  // ─────────────────────────────────────────────────────────────────
  // MORE CEREBRAS FREE MODELS
  // ─────────────────────────────────────────────────────────────────
  { id: 'cerebras/llama-3.1-70b', name: 'Llama 3.1 70B (Cerebras)', publisher: 'Cerebras', tier: 'cerebras_free', description: 'Llama 3.1 70B on Cerebras. FREE, ~700 tok/s, 128K context.', maxInputTokens: 131072, maxOutputTokens: 32768, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit', 'agent'] },
  { id: 'cerebras/deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill 70B (Cerebras)', publisher: 'Cerebras', tier: 'cerebras_free', description: 'DeepSeek R1 distilled to Llama 70B on Cerebras. FREE, fast reasoning.', maxInputTokens: 131072, maxOutputTokens: 32768, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, isReasoning: true, recommendedFor: ['ask', 'plan', 'agent'] },
  { id: 'cerebras/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B (Cerebras)', publisher: 'Cerebras', tier: 'cerebras_free', description: 'Meta Llama 4 Scout on Cerebras. FREE, ~1500 tok/s.', maxInputTokens: 131072, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit', 'agent'] },

  // ─────────────────────────────────────────────────────────────────
  // MORE GEMINI MODELS
  // ─────────────────────────────────────────────────────────────────
  { id: 'gemini/gemini-2.0-flash', name: 'Gemini 2.0 Flash', publisher: 'Google', tier: 'gemini_free', description: 'Gemini 2.0 Flash. FREE, 1M context, multimodal, 15 RPM.', maxInputTokens: 1048576, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, supportsVision: true, recommendedFor: ['ask', 'edit', 'agent'] },
  { id: 'gemini/gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', publisher: 'Google', tier: 'gemini_free', description: 'Gemini 2.0 Flash Lite. FREE, ultra-fast, 30 RPM, 1M context.', maxInputTokens: 1048576, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit'] },
  { id: 'gemini/gemini-1.5-flash', name: 'Gemini 1.5 Flash', publisher: 'Google', tier: 'gemini_free', description: 'Gemini 1.5 Flash. FREE, 1M context, 15 RPM, 1500 RPD.', maxInputTokens: 1048576, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, supportsVision: true, recommendedFor: ['ask', 'edit'] },
  { id: 'gemini/gemini-1.5-pro', name: 'Gemini 1.5 Pro', publisher: 'Google', tier: 'gemini_pro', description: 'Gemini 1.5 Pro. FREE, 2M context, 2 RPM, 50 RPD.', maxInputTokens: 2097152, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, supportsVision: true, recommendedFor: ['plan', 'agent'] },
  { id: 'gemini/gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', publisher: 'Google', tier: 'gemini_free', description: 'Gemini 2.5 Flash Lite. FREE, fastest Gemini 2.5, 30 RPM.', maxInputTokens: 1048576, maxOutputTokens: 65536, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit'] },

  // ─────────────────────────────────────────────────────────────────
  // MORE SILICONFLOW FREE/PAID MODELS
  // ─────────────────────────────────────────────────────────────────
  { id: 'siliconflow/meta-llama/Meta-Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B (SiliconFlow)', publisher: 'SiliconFlow', tier: 'siliconflow_free', description: 'Meta Llama 3.1 8B via SiliconFlow. FREE, 128K context.', maxInputTokens: 128000, maxOutputTokens: 16384, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit'] },
  { id: 'siliconflow/meta-llama/Meta-Llama-3.1-70B-Instruct', name: 'Llama 3.1 70B (SiliconFlow)', publisher: 'SiliconFlow', tier: 'siliconflow_free', description: 'Meta Llama 3.1 70B via SiliconFlow. FREE tier. 128K context.', maxInputTokens: 128000, maxOutputTokens: 32768, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit', 'agent'] },
  { id: 'siliconflow/Qwen/Qwen2.5-7B-Instruct', name: 'Qwen2.5 7B (SiliconFlow)', publisher: 'SiliconFlow', tier: 'siliconflow_free', description: 'Qwen2.5 7B via SiliconFlow. FREE. 128K context.', maxInputTokens: 128000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit'] },
  { id: 'siliconflow/Qwen/Qwen2.5-14B-Instruct', name: 'Qwen2.5 14B (SiliconFlow)', publisher: 'SiliconFlow', tier: 'siliconflow_free', description: 'Qwen2.5 14B via SiliconFlow. FREE. 128K context.', maxInputTokens: 128000, maxOutputTokens: 16384, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit', 'agent'] },
  { id: 'siliconflow/Qwen/Qwen2.5-Coder-7B-Instruct', name: 'Qwen2.5 Coder 7B (SiliconFlow)', publisher: 'SiliconFlow', tier: 'siliconflow_free', description: 'Qwen2.5 Coder 7B via SiliconFlow. FREE, optimized for coding.', maxInputTokens: 128000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['edit', 'agent'] },
  { id: 'siliconflow/Qwen/Qwen2.5-Coder-32B-Instruct', name: 'Qwen2.5 Coder 32B (SiliconFlow)', publisher: 'SiliconFlow', tier: 'siliconflow_free', description: 'Qwen2.5 Coder 32B via SiliconFlow. FREE, top coding model.', maxInputTokens: 128000, maxOutputTokens: 32768, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['edit', 'agent'] },
  { id: 'siliconflow/mistralai/Mistral-7B-Instruct-v0.3', name: 'Mistral 7B (SiliconFlow)', publisher: 'SiliconFlow', tier: 'siliconflow_free', description: 'Mistral 7B v0.3 via SiliconFlow. FREE. 32K context.', maxInputTokens: 32768, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask', 'edit'] },
  { id: 'siliconflow/mistralai/Mixtral-8x7B-Instruct-v0.1', name: 'Mixtral 8x7B (SiliconFlow)', publisher: 'SiliconFlow', tier: 'siliconflow_free', description: 'Mistral Mixtral 8x7B MoE via SiliconFlow. FREE. 32K context.', maxInputTokens: 32768, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask', 'edit', 'agent'] },
  { id: 'siliconflow/google/gemma-2-9b-it', name: 'Gemma 2 9B (SiliconFlow)', publisher: 'SiliconFlow', tier: 'siliconflow_free', description: 'Google Gemma 2 9B via SiliconFlow. FREE. 8K context.', maxInputTokens: 8192, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask'] },
  { id: 'siliconflow/microsoft/Phi-3.5-mini-instruct', name: 'Phi-3.5 Mini (SiliconFlow)', publisher: 'SiliconFlow', tier: 'siliconflow_free', description: 'Microsoft Phi-3.5 mini via SiliconFlow. FREE. 128K context.', maxInputTokens: 128000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask'] },
  { id: 'siliconflow/THUDM/glm-4-9b-chat', name: 'GLM-4 9B (SiliconFlow)', publisher: 'SiliconFlow', tier: 'siliconflow_free', description: 'Zhipu GLM-4 9B chat via SiliconFlow. FREE. 128K context.', maxInputTokens: 128000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: false, recommendedFor: ['ask', 'edit'] },
  { id: 'siliconflow/deepseek-ai/DeepSeek-R1-Distill-Qwen-7B', name: 'DeepSeek R1 Distill Qwen 7B (SiliconFlow)', publisher: 'SiliconFlow', tier: 'siliconflow_free', description: 'DeepSeek R1 distilled to Qwen 7B. FREE via SiliconFlow.', maxInputTokens: 32768, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, isReasoning: true, recommendedFor: ['ask', 'plan'] },
  { id: 'siliconflow/deepseek-ai/DeepSeek-R1-Distill-Qwen-32B', name: 'DeepSeek R1 Distill Qwen 32B (SiliconFlow)', publisher: 'SiliconFlow', tier: 'siliconflow_free', description: 'DeepSeek R1 distilled to Qwen 32B. FREE via SiliconFlow.', maxInputTokens: 32768, maxOutputTokens: 16384, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, isReasoning: true, recommendedFor: ['ask', 'plan', 'agent'] },
  { id: 'siliconflow/Pro/Qwen/Qwen2.5-72B-Instruct', name: 'Qwen2.5 72B Pro (SiliconFlow)', publisher: 'SiliconFlow', tier: 'siliconflow_free', description: 'Qwen2.5 72B Pro tier via SiliconFlow. Paid credits, premium quality.', maxInputTokens: 128000, maxOutputTokens: 32768, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit', 'plan', 'agent'] },
  { id: 'siliconflow/meta-llama/Meta-Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B (SiliconFlow)', publisher: 'SiliconFlow', tier: 'siliconflow_free', description: 'Meta Llama 3.3 70B via SiliconFlow. FREE tier. 128K context.', maxInputTokens: 128000, maxOutputTokens: 32768, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit', 'plan', 'agent'] },

  // ─────────────────────────────────────────────────────────────────
  // QWEN (via Alibaba Dashscope)
  // ─────────────────────────────────────────────────────────────────
  { id: 'qwen/qwen-max', name: 'Qwen Max', publisher: 'Alibaba', tier: 'qwen_free', description: 'Qwen most capable model via Dashscope. 32K context.', maxInputTokens: 32768, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'plan', 'agent'] },
  { id: 'qwen/qwen-plus', name: 'Qwen Plus', publisher: 'Alibaba', tier: 'qwen_free', description: 'Qwen Plus via Dashscope. 128K context, good balance.', maxInputTokens: 131072, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit', 'agent'] },
  { id: 'qwen/qwen-turbo', name: 'Qwen Turbo', publisher: 'Alibaba', tier: 'qwen_free', description: 'Qwen Turbo via Dashscope. Fast and cost-effective. 1M context.', maxInputTokens: 1000000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit'] },
  { id: 'qwen/qwq-32b', name: 'QwQ 32B', publisher: 'Alibaba', tier: 'qwen_free', description: 'Alibaba QwQ-32B reasoning model via Dashscope. Deep thinking. 131K context.', maxInputTokens: 131072, maxOutputTokens: 32768, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, isReasoning: true, recommendedFor: ['plan', 'agent'] },
  { id: 'qwen/qwen2.5-72b-instruct', name: 'Qwen2.5 72B', publisher: 'Alibaba', tier: 'qwen_free', description: 'Qwen2.5 72B via Dashscope. 131K context, strong coding.', maxInputTokens: 131072, maxOutputTokens: 16384, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit', 'plan', 'agent'] },
  { id: 'qwen/qwen2.5-32b-instruct', name: 'Qwen2.5 32B', publisher: 'Alibaba', tier: 'qwen_free', description: 'Qwen2.5 32B via Dashscope. 131K context.', maxInputTokens: 131072, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit'] },
  { id: 'qwen/qwen2.5-coder-32b-instruct', name: 'Qwen2.5 Coder 32B', publisher: 'Alibaba', tier: 'qwen_free', description: 'Qwen2.5 Coder 32B via Dashscope. Best Chinese coding model. 131K context.', maxInputTokens: 131072, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['edit', 'agent'] },
  { id: 'qwen/qwen2.5-coder-7b-instruct', name: 'Qwen2.5 Coder 7B', publisher: 'Alibaba', tier: 'qwen_free', description: 'Qwen2.5 Coder 7B via Dashscope. Fast coding model.', maxInputTokens: 131072, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['edit'] },
  { id: 'qwen/qwen2.5-vl-72b-instruct', name: 'Qwen2.5-VL 72B', publisher: 'Alibaba', tier: 'qwen_free', description: 'Qwen2.5 Vision-Language 72B via Dashscope. Multimodal. 128K context.', maxInputTokens: 131072, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, supportsVision: true, recommendedFor: ['ask', 'plan'] },
  { id: 'qwen/qwen2.5-math-72b-instruct', name: 'Qwen2.5 Math 72B', publisher: 'Alibaba', tier: 'qwen_free', description: 'Qwen2.5 Math 72B. Best for mathematical reasoning and science.', maxInputTokens: 4096, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, isReasoning: true, recommendedFor: ['plan'] },

  // ─────────────────────────────────────────────────────────────────
  // MISTRAL API MODELS
  // ─────────────────────────────────────────────────────────────────
  { id: 'mistral/mistral-large-latest', name: 'Mistral Large', publisher: 'Mistral', tier: 'mistral_free', description: 'Most capable Mistral model. 131K context. $2/1M input.', maxInputTokens: 131072, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit', 'plan', 'agent'] },
  { id: 'mistral/mistral-medium-latest', name: 'Mistral Medium', publisher: 'Mistral', tier: 'mistral_free', description: 'Balanced Mistral model. Strong performance at lower cost.', maxInputTokens: 131072, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit', 'agent'] },
  { id: 'mistral/mistral-small-latest', name: 'Mistral Small', publisher: 'Mistral', tier: 'mistral_free', description: 'Cost-effective Mistral Small. Good for simple tasks.', maxInputTokens: 131072, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit'] },
  { id: 'mistral/codestral-latest', name: 'Codestral', publisher: 'Mistral', tier: 'mistral_free', description: 'Mistral code-specialized model. Best for code generation and completion.', maxInputTokens: 256000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['edit', 'agent'] },
  { id: 'mistral/open-mistral-nemo', name: 'Mistral Nemo', publisher: 'Mistral', tier: 'mistral_free', description: 'Open Mistral Nemo 12B. FREE, 128K context, multilingual.', maxInputTokens: 131072, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit'] },
  { id: 'mistral/ministral-8b-latest', name: 'Ministral 8B', publisher: 'Mistral', tier: 'mistral_free', description: 'Mistral edge model. 128K context, fast and efficient.', maxInputTokens: 131072, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit'] },
  { id: 'mistral/pixtral-large-latest', name: 'Pixtral Large', publisher: 'Mistral', tier: 'mistral_free', description: 'Mistral multimodal flagship. Vision + text, 131K context.', maxInputTokens: 131072, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, supportsVision: true, recommendedFor: ['ask', 'plan'] },

  // ─────────────────────────────────────────────────────────────────
  // OPENROUTER (routes to many providers — use openrouter/ prefix)
  // ─────────────────────────────────────────────────────────────────
  { id: 'openrouter/meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (OpenRouter FREE)', publisher: 'OpenRouter', tier: 'openrouter_free', description: 'Llama 3.3 70B via OpenRouter. FREE tier, rate limited.', maxInputTokens: 131072, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask', 'edit'] },
  { id: 'openrouter/deepseek/deepseek-r1:free', name: 'DeepSeek R1 (OpenRouter FREE)', publisher: 'OpenRouter', tier: 'openrouter_free', description: 'DeepSeek R1 via OpenRouter. FREE, rate limited. Strong reasoning.', maxInputTokens: 131072, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, isReasoning: true, recommendedFor: ['ask', 'plan'] },
  { id: 'openrouter/google/gemini-2.5-flash:free', name: 'Gemini 2.5 Flash (OpenRouter FREE)', publisher: 'OpenRouter', tier: 'openrouter_free', description: 'Gemini 2.5 Flash via OpenRouter. FREE tier.', maxInputTokens: 1048576, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask', 'edit'] },
  { id: 'openrouter/qwen/qwen3-235b-a22b:free', name: 'Qwen3 235B A22B (OpenRouter FREE)', publisher: 'OpenRouter', tier: 'openrouter_free', description: 'Alibaba Qwen3-235B MoE via OpenRouter. FREE, massive capacity.', maxInputTokens: 131072, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, isReasoning: true, recommendedFor: ['ask', 'plan'] },
  { id: 'openrouter/microsoft/phi-4:free', name: 'Phi-4 (OpenRouter FREE)', publisher: 'OpenRouter', tier: 'openrouter_free', description: 'Microsoft Phi-4 via OpenRouter. FREE, 16K context.', maxInputTokens: 16384, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask', 'edit'] },
  { id: 'openrouter/openai/gpt-4o', name: 'GPT-4o (OpenRouter)', publisher: 'OpenRouter', tier: 'openrouter_free', description: 'GPT-4o routed via OpenRouter. Requires credits.', maxInputTokens: 128000, maxOutputTokens: 16384, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, supportsVision: true, recommendedFor: ['ask', 'edit', 'plan'] },
  { id: 'openrouter/anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (OpenRouter)', publisher: 'OpenRouter', tier: 'openrouter_free', description: 'Claude 3.5 Sonnet via OpenRouter. Requires credits.', maxInputTokens: 200000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit', 'plan', 'agent'] },
  { id: 'openrouter/nousresearch/hermes-3-llama-3.1-405b:free', name: 'Hermes 3 405B (OpenRouter FREE)', publisher: 'OpenRouter', tier: 'openrouter_free', description: 'Nous Hermes 3 405B via OpenRouter. FREE, uncensored, strong reasoning.', maxInputTokens: 131072, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask', 'agent'] },
  { id: 'openrouter/mistralai/mistral-7b-instruct:free', name: 'Mistral 7B (OpenRouter FREE)', publisher: 'OpenRouter', tier: 'openrouter_free', description: 'Mistral 7B via OpenRouter. FREE, no censorship, 32K context.', maxInputTokens: 32768, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask', 'edit'] },
  { id: 'openrouter/openchat/openchat-7b:free', name: 'OpenChat 7B (OpenRouter FREE)', publisher: 'OpenRouter', tier: 'openrouter_free', description: 'OpenChat 7B via OpenRouter. FREE. Good for conversation.', maxInputTokens: 8192, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask'] },
  { id: 'openrouter/gryphe/mythomax-l2-13b:free', name: 'MythoMax 13B (OpenRouter FREE)', publisher: 'OpenRouter', tier: 'openrouter_free', description: 'MythoMax 13B via OpenRouter. FREE, creative writing, uncensored.', maxInputTokens: 4096, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask'] },

  // ─────────────────────────────────────────────────────────────────
  // TOGETHER.AI MODELS
  // ─────────────────────────────────────────────────────────────────
  { id: 'together/meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Turbo (Together)', publisher: 'Together', tier: 'together_free', description: 'Llama 3.3 70B via Together.ai. Fast inference, 131K context.', maxInputTokens: 131072, maxOutputTokens: 32768, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit', 'agent'] },
  { id: 'together/meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', name: 'Llama 3.1 8B Turbo (Together)', publisher: 'Together', tier: 'together_free', description: 'Llama 3.1 8B via Together.ai. Very fast, 128K context.', maxInputTokens: 131072, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask', 'edit'] },
  { id: 'together/Qwen/Qwen2.5-72B-Instruct-Turbo', name: 'Qwen2.5 72B Turbo (Together)', publisher: 'Together', tier: 'together_free', description: 'Qwen2.5 72B via Together.ai. Strong coding and reasoning.', maxInputTokens: 131072, maxOutputTokens: 32768, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask', 'edit', 'agent'] },
  { id: 'together/deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3 (Together)', publisher: 'Together', tier: 'together_free', description: 'DeepSeek V3 via Together.ai. 131K context.', maxInputTokens: 131072, maxOutputTokens: 16384, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask', 'edit', 'agent'] },
  { id: 'together/deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1 (Together)', publisher: 'Together', tier: 'together_free', description: 'DeepSeek R1 reasoning via Together.ai. 163K context.', maxInputTokens: 163840, maxOutputTokens: 32768, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, isReasoning: true, recommendedFor: ['plan', 'agent'] },
  { id: 'together/NovaSky-Berkeley/Sky-T1-32B-Preview', name: 'Sky-T1 32B (Together)', publisher: 'Together', tier: 'together_free', description: 'Berkeley Sky-T1 32B reasoning model via Together.ai.', maxInputTokens: 32768, maxOutputTokens: 16384, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, isReasoning: true, recommendedFor: ['plan', 'agent'] },

  // ─────────────────────────────────────────────────────────────────
  // MORE xAI MODELS
  // ─────────────────────────────────────────────────────────────────
  { id: 'xai/grok-3-fast', name: 'Grok 3 Fast', publisher: 'xAI', tier: 'xai_direct', description: 'Grok 3 Fast variant. Higher throughput, 131K context.', maxInputTokens: 131072, maxOutputTokens: 32768, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit'] },
  { id: 'xai/grok-3-mini-fast', name: 'Grok 3 Mini Fast', publisher: 'xAI', tier: 'xai_direct', description: 'Grok 3 Mini Fast. Ultra-fast inference, 131K context.', maxInputTokens: 131072, maxOutputTokens: 32768, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit'] },
  { id: 'xai/grok-2-1212', name: 'Grok 2', publisher: 'xAI', tier: 'xai_direct', description: 'Grok 2 (Dec 2024). 131K context, strong at coding and science.', maxInputTokens: 131072, maxOutputTokens: 16384, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit', 'plan'] },

  // ─────────────────────────────────────────────────────────────────
  // MORE ANTHROPIC MODELS
  // ─────────────────────────────────────────────────────────────────
  { id: 'anthropic/claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (Oct 2024)', publisher: 'Anthropic', tier: 'anthropic_sonnet', description: 'Claude 3.5 Sonnet October 2024 release. 200K context.', maxInputTokens: 200000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, supportsVision: true, recommendedFor: ['ask', 'edit', 'plan', 'agent'] },
  { id: 'anthropic/claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku (Oct 2024)', publisher: 'Anthropic', tier: 'anthropic_haiku', description: 'Claude 3.5 Haiku October 2024. Fast. 200K context. $0.25/1M input.', maxInputTokens: 200000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, supportsVision: true, recommendedFor: ['ask', 'edit'] },
  { id: 'anthropic/claude-3-opus-20240229', name: 'Claude 3 Opus', publisher: 'Anthropic', tier: 'anthropic_opus', description: 'Claude 3 Opus. Highest intelligence Claude 3 series. 200K context.', maxInputTokens: 200000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, supportsVision: true, recommendedFor: ['plan', 'agent'] },
  { id: 'anthropic/claude-3-haiku-20240307', name: 'Claude 3 Haiku', publisher: 'Anthropic', tier: 'anthropic_haiku', description: 'Claude 3 Haiku. Fastest Claude 3. 200K context. $0.25/1M input.', maxInputTokens: 200000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, supportsVision: true, recommendedFor: ['ask', 'edit'] },

  // ─────────────────────────────────────────────────────────────────
  // MORE DEEPSEEK DIRECT
  // ─────────────────────────────────────────────────────────────────
  { id: 'deepseek-direct/deepseek-chat', name: 'DeepSeek Chat V3', publisher: 'DeepSeek', tier: 'deepseek_direct', description: 'DeepSeek Chat V3 via DeepSeek API. 64K context, $0.14/1M input.', maxInputTokens: 65536, maxOutputTokens: 16384, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit', 'agent'] },
  { id: 'deepseek-direct/deepseek-reasoner', name: 'DeepSeek R1 (Direct)', publisher: 'DeepSeek', tier: 'deepseek_direct', description: 'DeepSeek R1 reasoning model via DeepSeek API. $0.14/1M input (cache).', maxInputTokens: 65536, maxOutputTokens: 32768, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, isReasoning: true, supportsTemperature: false, recommendedFor: ['plan', 'agent'] },
  { id: 'deepseek-direct/deepseek-coder', name: 'DeepSeek Coder V2', publisher: 'DeepSeek', tier: 'deepseek_direct', description: 'DeepSeek Coder V2 via DeepSeek API. Specialized for code. 128K context.', maxInputTokens: 131072, maxOutputTokens: 16384, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['edit', 'agent'] },

  // ─────────────────────────────────────────────────────────────────
  // MORE OPENAI DIRECT
  // ─────────────────────────────────────────────────────────────────
  { id: 'openai-direct/gpt-4o-mini', name: 'GPT-4o Mini (Direct)', publisher: 'OpenAI', tier: 'openai_direct', description: 'GPT-4o Mini via direct OpenAI API. 128K context.', maxInputTokens: 128000, maxOutputTokens: 16384, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, supportsVision: true, recommendedFor: ['ask', 'edit'] },
  { id: 'openai-direct/o3-mini', name: 'o3 Mini (Direct)', publisher: 'OpenAI', tier: 'openai_direct', description: 'o3-mini via direct OpenAI API. Fast reasoning. 200K context.', maxInputTokens: 200000, maxOutputTokens: 100000, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, isReasoning: true, supportsTemperature: false, outputTokenParam: 'max_completion_tokens', recommendedFor: ['plan', 'agent'] },
  { id: 'openai-direct/o1-mini', name: 'o1 Mini (Direct)', publisher: 'OpenAI', tier: 'openai_direct', description: 'o1-mini via direct OpenAI API. Cost-effective reasoning.', maxInputTokens: 128000, maxOutputTokens: 65536, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, isReasoning: true, supportsTemperature: false, outputTokenParam: 'max_completion_tokens', recommendedFor: ['plan'] },
  { id: 'openai-direct/gpt-4-turbo', name: 'GPT-4 Turbo (Direct)', publisher: 'OpenAI', tier: 'openai_direct', description: 'GPT-4 Turbo via direct OpenAI API. 128K context.', maxInputTokens: 128000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, supportsVision: true, recommendedFor: ['ask', 'edit', 'plan'] },

  // ─────────────────────────────────────────────────────────────────
  // MORE PERPLEXITY MODELS
  // ─────────────────────────────────────────────────────────────────
  { id: 'perplexity/sonar-reasoning', name: 'Perplexity Sonar Reasoning', publisher: 'Perplexity', tier: 'perplexity_free', description: 'Sonar Reasoning with web search and chain-of-thought. 127K context.', maxInputTokens: 127072, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, isReasoning: true, recommendedFor: ['ask', 'plan'] },
  { id: 'perplexity/sonar-reasoning-pro', name: 'Perplexity Sonar Reasoning Pro', publisher: 'Perplexity', tier: 'perplexity_free', description: 'Sonar Reasoning Pro. Deeper research + reasoning. 200K context.', maxInputTokens: 200000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, isReasoning: true, recommendedFor: ['ask', 'plan'] },

  // ─────────────────────────────────────────────────────────────────
  // MORE FIREWORKS MODELS
  // ─────────────────────────────────────────────────────────────────
  { id: 'fireworks/accounts/fireworks/models/deepseek-r1', name: 'DeepSeek R1 (Fireworks)', publisher: 'Fireworks', tier: 'fireworks_free', description: 'DeepSeek R1 reasoning via Fireworks AI. 163K context.', maxInputTokens: 163840, maxOutputTokens: 32768, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, isReasoning: true, recommendedFor: ['plan', 'agent'] },
  { id: 'fireworks/accounts/fireworks/models/qwen2p5-72b-instruct', name: 'Qwen2.5 72B (Fireworks)', publisher: 'Fireworks', tier: 'fireworks_free', description: 'Qwen2.5 72B via Fireworks AI. 131K context.', maxInputTokens: 131072, maxOutputTokens: 32768, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit', 'agent'] },
  { id: 'fireworks/accounts/fireworks/models/mixtral-8x22b-instruct', name: 'Mixtral 8x22B (Fireworks)', publisher: 'Fireworks', tier: 'fireworks_free', description: 'Mixtral 8x22B MoE via Fireworks. 65K context.', maxInputTokens: 65536, maxOutputTokens: 16384, supportsStreaming: true, supportsTools: true, supportsJsonMode: true, recommendedFor: ['ask', 'edit', 'agent'] },
  { id: 'fireworks/accounts/fireworks/models/phi-3-vision-128k-instruct', name: 'Phi-3 Vision (Fireworks)', publisher: 'Fireworks', tier: 'fireworks_free', description: 'Microsoft Phi-3 Vision 128K via Fireworks. Multimodal.', maxInputTokens: 128000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, supportsVision: true, recommendedFor: ['ask'] },

  // ─────────────────────────────────────────────────────────────────
  // COHERE MODELS
  // ─────────────────────────────────────────────────────────────────
  { id: 'cohere/command-r-plus', name: 'Command R+', publisher: 'Cohere', tier: 'cohere_free', description: 'Cohere Command R+ — best for RAG and enterprise tasks. 128K context.', maxInputTokens: 128000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsJsonMode: false, recommendedFor: ['ask', 'plan'] },
  { id: 'cohere/command-r', name: 'Command R', publisher: 'Cohere', tier: 'cohere_free', description: 'Cohere Command R. Strong at retrieval-augmented generation.', maxInputTokens: 128000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsJsonMode: false, recommendedFor: ['ask'] },
  { id: 'cohere/command-light', name: 'Command Light', publisher: 'Cohere', tier: 'cohere_free', description: 'Cohere Command Light. Fast and efficient for simple tasks.', maxInputTokens: 4096, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask'] },

  // ─────────────────────────────────────────────────────────────────
  // OLLAMA LOCAL MODELS (discoverable and downloadable)
  // ─────────────────────────────────────────────────────────────────
  { id: 'ollama/llama3.2:latest', name: 'Llama 3.2 (Ollama)', publisher: 'Meta/Ollama', tier: 'ollama_local', description: 'Meta Llama 3.2 running locally via Ollama. No API key needed.', maxInputTokens: 131072, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask', 'edit'] },
  { id: 'ollama/llama3.1:latest', name: 'Llama 3.1 8B (Ollama)', publisher: 'Meta/Ollama', tier: 'ollama_local', description: 'Meta Llama 3.1 8B running locally via Ollama. 128K context.', maxInputTokens: 131072, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask', 'edit'] },
  { id: 'ollama/codellama:latest', name: 'Code Llama (Ollama)', publisher: 'Meta/Ollama', tier: 'ollama_local', description: 'Meta Code Llama locally. Specialized for code generation.', maxInputTokens: 16384, maxOutputTokens: 16384, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['edit', 'agent'] },
  { id: 'ollama/qwen2.5-coder:latest', name: 'Qwen2.5 Coder (Ollama)', publisher: 'Alibaba/Ollama', tier: 'ollama_local', description: 'Qwen2.5 Coder locally via Ollama. Best local coding model.', maxInputTokens: 131072, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['edit', 'agent'] },
  { id: 'ollama/deepseek-r1:latest', name: 'DeepSeek R1 (Ollama)', publisher: 'DeepSeek/Ollama', tier: 'ollama_local', description: 'DeepSeek R1 reasoning model running locally via Ollama.', maxInputTokens: 65536, maxOutputTokens: 32768, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, isReasoning: true, recommendedFor: ['plan', 'agent'] },
  { id: 'ollama/phi4:latest', name: 'Phi-4 (Ollama)', publisher: 'Microsoft/Ollama', tier: 'ollama_local', description: 'Microsoft Phi-4 14B locally via Ollama. 16K context.', maxInputTokens: 16384, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask', 'edit'] },
  { id: 'ollama/gemma2:latest', name: 'Gemma 2 (Ollama)', publisher: 'Google/Ollama', tier: 'ollama_local', description: 'Google Gemma 2 9B locally via Ollama. 8K context.', maxInputTokens: 8192, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask'] },
  { id: 'ollama/mistral:latest', name: 'Mistral 7B (Ollama)', publisher: 'Mistral/Ollama', tier: 'ollama_local', description: 'Mistral 7B v0.3 locally via Ollama. 32K context.', maxInputTokens: 32768, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask', 'edit'] },
  { id: 'ollama/mixtral:latest', name: 'Mixtral 8x7B (Ollama)', publisher: 'Mistral/Ollama', tier: 'ollama_local', description: 'Mistral Mixtral 8x7B MoE locally via Ollama. 32K context.', maxInputTokens: 32768, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask', 'edit', 'agent'] },
  { id: 'ollama/starcoder2:latest', name: 'StarCoder 2 (Ollama)', publisher: 'BigCode/Ollama', tier: 'ollama_local', description: 'BigCode StarCoder 2 locally via Ollama. Specialized for code.', maxInputTokens: 16384, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['edit'] },
  { id: 'ollama/dolphin-mixtral:latest', name: 'Dolphin Mixtral (Ollama)', publisher: 'CognitiveComputations/Ollama', tier: 'ollama_local', description: 'Dolphin Mixtral — uncensored MoE model locally. No filters.', maxInputTokens: 32768, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask', 'agent'] },
  { id: 'ollama/nous-hermes2:latest', name: 'Nous Hermes 2 (Ollama)', publisher: 'NousResearch/Ollama', tier: 'ollama_local', description: 'Nous Hermes 2 locally via Ollama. Uncensored, strong at instruction following.', maxInputTokens: 32768, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask', 'agent'] },
  { id: 'ollama/openchat:latest', name: 'OpenChat (Ollama)', publisher: 'OpenChat/Ollama', tier: 'ollama_local', description: 'OpenChat 3.5 locally. Strong conversational model.', maxInputTokens: 8192, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask'] },
  { id: 'ollama/llava:latest', name: 'LLaVA (Ollama)', publisher: 'LLaVA/Ollama', tier: 'ollama_local', description: 'LLaVA multimodal model locally. Can understand images.', maxInputTokens: 4096, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, supportsVision: true, recommendedFor: ['ask'] },
  { id: 'ollama/orca-mini:latest', name: 'Orca Mini (Ollama)', publisher: 'Microsoft/Ollama', tier: 'ollama_local', description: 'Microsoft Orca Mini locally via Ollama. Good reasoning in small package.', maxInputTokens: 4096, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask'] },
  { id: 'ollama/neural-chat:latest', name: 'Neural Chat (Ollama)', publisher: 'Intel/Ollama', tier: 'ollama_local', description: 'Intel Neural Chat locally via Ollama. Fine-tuned Mistral.', maxInputTokens: 32768, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['ask'] },
  { id: 'ollama/wizardcoder:latest', name: 'WizardCoder (Ollama)', publisher: 'WizardLM/Ollama', tier: 'ollama_local', description: 'WizardCoder locally via Ollama. Code-specialized model.', maxInputTokens: 16384, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: false, supportsJsonMode: false, recommendedFor: ['edit'] },
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
  mistral_free:     { requestsPerMinute: 5,  requestsPerDay: 500,   maxInputTokens: 256000,  maxOutputTokens: 8192,   maxConcurrent: 3 },
  together_free:    { requestsPerMinute: 60, requestsPerDay: 5000,  maxInputTokens: 163840,  maxOutputTokens: 32768,  maxConcurrent: 10 },
  openrouter_free:  { requestsPerMinute: 20, requestsPerDay: 200,   maxInputTokens: 1048576, maxOutputTokens: 8192,   maxConcurrent: 3 },
  ollama_local:     { requestsPerMinute: 60, requestsPerDay: 99999, maxInputTokens: 131072,  maxOutputTokens: 32768,  maxConcurrent: 1 },
  cohere_free:      { requestsPerMinute: 5,  requestsPerDay: 1000,  maxInputTokens: 128000,  maxOutputTokens: 4096,   maxConcurrent: 3 },
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
