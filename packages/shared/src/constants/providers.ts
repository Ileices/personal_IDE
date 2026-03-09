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
];

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
