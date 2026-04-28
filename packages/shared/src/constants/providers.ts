// ============================================
// AI Provider Registry - All free AI services
// with setup links and configuration
// ============================================
import type { ProviderConfig } from '../types/providers.js';

/** All supported providers with setup info */
export const PROVIDERS: ProviderConfig[] = [
  // ── GitHub Models (Copilot) ──
  {
    id: 'github',
    name: 'GitHub Copilot Models',
    description: 'All models available through your GitHub Copilot subscription. GPT-4.1, o3, o4-mini, Claude, Gemini, and more.',
    baseURL: 'https://models.github.ai/inference',
    requiresApiKey: true,
    isLocal: false,
    isFree: true,
    setupUrl: 'https://github.com/settings/tokens',
    notes: 'Use a PAT with models:read and read:user scopes. Free tier included with GitHub account.',
    enabled: true,
  },

  // ── Ollama (Local) ──
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    description: 'Run open-source models locally. No API key needed, no internet required. Supports Llama, Mistral, CodeLlama, DeepSeek, Qwen, and hundreds more.',
    baseURL: 'http://localhost:11434',
    requiresApiKey: false,
    isLocal: true,
    isFree: true,
    setupUrl: 'https://ollama.com/download',
    noSignupUrl: 'https://ollama.com/download',
    notes: 'Install Ollama, then run: ollama pull llama3.2 (or any model). No signup, no API key, unlimited usage.',
    enabled: true,
  },

  // ── Groq (Free tier) ──
  {
    id: 'groq',
    name: 'Groq Cloud',
    description: 'Ultra-fast inference on Llama, Mixtral, Gemma models. Generous free tier with high speed.',
    baseURL: 'https://api.groq.com/openai/v1',
    requiresApiKey: true,
    isLocal: false,
    isFree: true,
    setupUrl: 'https://console.groq.com/keys',
    notes: 'Free tier: 30 req/min for most models. Sign up at groq.com for a free API key.',
    enabled: false,
  },

  // ── HuggingFace Inference (Free tier) ──
  {
    id: 'huggingface',
    name: 'HuggingFace Inference',
    description: 'Access thousands of open models. Free tier with rate limits. Great for experimentation.',
    baseURL: 'https://api-inference.huggingface.co/v1',
    requiresApiKey: true,
    isLocal: false,
    isFree: true,
    setupUrl: 'https://huggingface.co/settings/tokens',
    notes: 'Free tier available. Create an account and generate an access token. Supports chat and text-generation models.',
    enabled: false,
  },

  // ── Cohere (Free tier) ──
  {
    id: 'cohere',
    name: 'Cohere',
    description: 'Command R+ and R models. Free tier for trial use. Good at code generation and RAG.',
    baseURL: 'https://api.cohere.ai/v1',
    requiresApiKey: true,
    isLocal: false,
    isFree: true,
    setupUrl: 'https://dashboard.cohere.com/api-keys',
    notes: 'Free trial API key available. Rate limited but usable for development.',
    enabled: false,
  },

  // ── Mistral (Free tier) ──
  {
    id: 'mistral',
    name: 'Mistral AI',
    description: 'Mistral, Mixtral, and Codestral models. Free tier for experimentation.',
    baseURL: 'https://api.mistral.ai/v1',
    requiresApiKey: true,
    isLocal: false,
    isFree: true,
    setupUrl: 'https://console.mistral.ai/api-keys',
    notes: 'Free tier with limited requests. Codestral is great for coding tasks.',
    enabled: false,
  },

  // ── Google Gemini (Free tier) ──
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Gemini 2.0 Flash, Pro, and more. Generous free tier with 1500 req/day.',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    requiresApiKey: true,
    isLocal: false,
    isFree: true,
    setupUrl: 'https://aistudio.google.com/apikey',
    noSignupUrl: 'https://aistudio.google.com/apikey',
    notes: 'Free tier: 1500 req/day for Flash, 50 req/day for Pro. Very generous! Google account required.',
    enabled: false,
  },

  // ── Together AI (Free tier) ──
  {
    id: 'together',
    name: 'Together AI',
    description: 'Run open-source models in the cloud. $5 free credits on signup.',
    baseURL: 'https://api.together.xyz/v1',
    requiresApiKey: true,
    isLocal: false,
    isFree: true,
    setupUrl: 'https://api.together.xyz/settings/api-keys',
    notes: '$5 free credits on signup. Supports Llama, Mixtral, Code Llama, DeepSeek, and many more.',
    enabled: false,
  },

  // ── OpenRouter (Free models available) ──
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Gateway to 100+ models from all providers. Some models are free to use.',
    baseURL: 'https://openrouter.ai/api/v1',
    requiresApiKey: true,
    isLocal: false,
    isFree: true,
    setupUrl: 'https://openrouter.ai/keys',
    notes: 'Some models are completely free (marked as :free). Aggregates OpenAI, Anthropic, Google, Meta, and more.',
    enabled: false,
  },

  // ── LM Studio (Local) ──
  {
    id: 'lmstudio',
    name: 'LM Studio (Local)',
    description: 'Run GGUF models locally with a GUI. OpenAI-compatible API. No signup.',
    baseURL: 'http://localhost:1234/v1',
    requiresApiKey: false,
    isLocal: true,
    isFree: true,
    setupUrl: 'https://lmstudio.ai/',
    noSignupUrl: 'https://lmstudio.ai/',
    notes: 'Download LM Studio, load any GGUF model, start the server. No API key needed.',
    enabled: false,
  },

  // ── Nano Sea (Local AI) ──
  {
    id: 'nano',
    name: 'Nano Sea (Local AI)',
    description: 'Sea of Nanos — a living ecosystem of ~230 micro-neural-networks that learn from your codebase. Fully local, no API key, no internet. Powered by AE/RBY/PTAIE.',
    baseURL: 'http://localhost:5100/v1',
    requiresApiKey: false,
    isLocal: true,
    isFree: true,
    setupUrl: 'https://github.com/Ileices/personal_IDE',
    noSignupUrl: 'https://github.com/Ileices/personal_IDE',
    notes: 'Run "python NANO_train/main.py" to start the Sea of Nanos. No API key needed. The nanos learn from your codebase over time.',
    enabled: false,
  },

  // ── Cerebras (Free tier — fastest inference) ──
  {
    id: 'cerebras',
    name: 'Cerebras Cloud',
    description: 'Fastest AI inference anywhere (~3000 tok/s). Free tier with Llama models on Wafer-Scale Engine hardware.',
    baseURL: 'https://api.cerebras.ai/v1',
    requiresApiKey: true,
    isLocal: false,
    isFree: true,
    setupUrl: 'https://cloud.cerebras.ai/',
    notes: 'Free tier available. Sign up at cloud.cerebras.ai for an API key. OpenAI-compatible API. ~3000 tokens/second.',
    enabled: false,
  },
  // — Anthropic —
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    description: 'Claude Opus 4.7, Sonnet 4.6, Haiku 4.5. World-class reasoning and coding. 1M context.',
    baseURL: 'https://api.anthropic.com/v1',
    requiresApiKey: true,
    isLocal: false,
    isFree: false,
    setupUrl: 'https://console.anthropic.com/settings/keys',
    notes: 'OpenAI-compatible mode via interoperability beta. $5/1M for Opus, $3/1M for Sonnet, $1/1M for Haiku.',
    enabled: false,
  },

  // — OpenAI Direct —
  {
    id: 'openai-direct',
    name: 'OpenAI (Direct)',
    description: 'Direct access to OpenAI GPT-4o, GPT-4.1, o3 series. Pay-per-token.',
    baseURL: 'https://api.openai.com/v1',
    requiresApiKey: true,
    isLocal: false,
    isFree: false,
    setupUrl: 'https://platform.openai.com/api-keys',
    notes: 'Use if GitHub Models has rate limit issues. Direct OpenAI billing.',
    enabled: false,
  },

  // — DeepSeek Direct —
  {
    id: 'deepseek-direct',
    name: 'DeepSeek API',
    description: 'DeepSeek V4 Flash and Pro. Thinking mode enabled. 1M context. Very affordable pricing.',
    baseURL: 'https://api.deepseek.com',
    requiresApiKey: true,
    isLocal: false,
    isFree: false,
    setupUrl: 'https://platform.deepseek.com/api_keys',
    notes: 'V4 Flash (deepseek-chat): $0.14/1M input. V4 Pro (deepseek-reasoner): $1.74/1M. OpenAI-compatible.',
    enabled: false,
  },

  // — Qwen / DashScope —
  {
    id: 'qwen',
    name: 'Alibaba Qwen (DashScope)',
    description: 'Qwen-Max, Qwen-Plus, Qwen-Turbo. Strong multilingual models with large context.',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    requiresApiKey: true,
    isLocal: false,
    isFree: false,
    setupUrl: 'https://dashscope.console.aliyun.com/apiKey',
    notes: 'OpenAI-compatible API. Qwen3-32B also available via Groq for free.',
    enabled: false,
  },

  // — ZhipuAI (GLM-4-Flash is FREE) —
  {
    id: 'zhipuai',
    name: 'ZhipuAI (GLM)',
    description: 'GLM-4 and GLM-4-Flash models. GLM-4-Flash is completely free with 128K context.',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    requiresApiKey: true,
    isLocal: false,
    isFree: true,
    setupUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    noSignupUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    notes: 'GLM-4-Flash is FREE with 128K context. Sign up at bigmodel.cn for API key.',
    enabled: false,
  },

  // — Moonshot AI —
  {
    id: 'moonshot',
    name: 'Moonshot AI (Kimi)',
    description: 'Kimi models with extremely long context windows (128K-1M). Strong at document tasks.',
    baseURL: 'https://api.moonshot.cn/v1',
    requiresApiKey: true,
    isLocal: false,
    isFree: false,
    setupUrl: 'https://platform.moonshot.cn/console/api-keys',
    notes: 'OpenAI-compatible. Moonshot-v1-128k and moonshot-v1-1m available.',
    enabled: false,
  },

  // — MiniMax —
  {
    id: 'minimax',
    name: 'MiniMax',
    description: 'MiniMax MoE models. Strong at Chinese and multilingual tasks.',
    baseURL: 'https://api.minimax.chat/v1',
    requiresApiKey: true,
    isLocal: false,
    isFree: false,
    setupUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    notes: 'OpenAI-compatible endpoint available.',
    enabled: false,
  },

  // — xAI —
  {
    id: 'xai',
    name: 'xAI (Grok)',
    description: 'Grok 3 and Grok 3 Mini. Real-time knowledge via X/Twitter data.',
    baseURL: 'https://api.x.ai/v1',
    requiresApiKey: true,
    isLocal: false,
    isFree: false,
    setupUrl: 'https://console.x.ai/',
    notes: 'OpenAI-compatible API. Also accessible via GitHub Models.',
    enabled: false,
  },

  // — Perplexity —
  {
    id: 'perplexity',
    name: 'Perplexity AI',
    description: 'Sonar models with real-time web search. Best for up-to-date information.',
    baseURL: 'https://api.perplexity.ai',
    requiresApiKey: true,
    isLocal: false,
    isFree: false,
    setupUrl: 'https://www.perplexity.ai/settings/api',
    notes: 'OpenAI-compatible. Great for research and current events queries.',
    enabled: false,
  },

  // — Fireworks AI —
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    description: 'Fast open-source model hosting. Llama, Mixtral, DeepSeek, Code Llama. $1 free credit.',
    baseURL: 'https://api.fireworks.ai/inference/v1',
    requiresApiKey: true,
    isLocal: false,
    isFree: true,
    setupUrl: 'https://fireworks.ai/account/api-keys',
    notes: '$1 free credit on signup. Fast inference for open models. OpenAI-compatible.',
    enabled: false,
  },

  // — SiliconFlow (many free open models) —
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    description: 'Free tier for open-source models: Qwen2.5-72B, DeepSeek-V3, and many more.',
    baseURL: 'https://api.siliconflow.cn/v1',
    requiresApiKey: true,
    isLocal: false,
    isFree: true,
    setupUrl: 'https://cloud.siliconflow.cn/account/ak',
    noSignupUrl: 'https://cloud.siliconflow.cn/account/ak',
    notes: 'Many open-source models are FREE with generous rate limits. Chinese-based provider.',
    enabled: false,
  },];

/** Get enabled providers */
export function getEnabledProviders(): ProviderConfig[] {
  return PROVIDERS.filter(p => p.enabled);
}

/** Get provider by ID */
export function getProvider(id: string): ProviderConfig | undefined {
  return PROVIDERS.find(p => p.id === id);
}

/** Providers that need no API key or signup */
export function getNoSetupProviders(): ProviderConfig[] {
  return PROVIDERS.filter(p => !p.requiresApiKey && p.isFree);
}

/** Providers with free tiers */
export function getFreeProviders(): ProviderConfig[] {
  return PROVIDERS.filter(p => p.isFree);
}
