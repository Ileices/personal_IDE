// ============================================
// Unified Model Fallback Service
//
// Expands fallback beyond GitHub Models to include:
//   1. Local: Ollama, Nano Sea (lowest latency, no rate limits)
//   2. Mistral AI (primary cloud fallback — nearly unlimited free tier)
//   3. Groq (high-speed, generous free tier)
//   4. Gemini (1500 req/day free)
//   5. Cerebras (fastest inference)
//   6. GitHub Models (low rate limits — used when specific model needed)
//   7. Other cloud providers
//
// All crawlers should use callWithFallback() for LLM calls.
// Every call fires POST /v1/training/observe per CONSTITUTION Invariant 7.
// ============================================
import OpenAI from 'openai';
import { getClientFromDb } from './providers.js';
import type { ProviderType } from '@personal-ide/shared';
import { recordModelSelection } from '../modelSelection/index.js';
import { recordRateLimit, recordSuccess, isModelCoolingDown } from '../modelRateLimitTracker/index.js';

// ── Fallback Chain Configuration ──

/**
 * Priority-ordered fallback chain for different task types.
 * Mistral is primary cloud fallback per user requirement.
 */
export const FALLBACK_CHAINS: Record<string, string[]> = {
  // ─────────────────────────────────────────────────────────────────
  // General code generation / agentic tasks
  // Priority: local (unlimited) → Mistral (primary cloud) → Cerebras
  // (fastest) → Groq → SiliconFlow → Gemini → DeepSeek → others
  // ─────────────────────────────────────────────────────────────────
  default: [
    'ollama/deepseek-coder-v2',              // local — no rate limits
    'ollama/qwen2.5-coder:7b',               // local — fast coder
    'nano/code-completion',                   // NANO Sea local
    'mistral/mistral-small-latest',           // PRIMARY cloud fallback (~unlimited free)
    'mistral/codestral-latest',               // Mistral coding specialist
    'mistral/mistral-medium-latest',          // Mistral mid-tier
    'cerebras/llama-3.3-70b',                 // fastest cloud inference
    'cerebras/llama3.1-70b',                  // Cerebras Llama 3.1
    'groq/llama-3.3-70b-versatile',           // Groq fast (30 RPM free)
    'groq/llama-3.1-70b-versatile',           // Groq 3.1
    'groq/meta-llama/llama-4-scout-17b-16e-instruct',
    'siliconflow/Qwen/Qwen2.5-Coder-32B-Instruct', // SiliconFlow free
    'siliconflow/deepseek-ai/DeepSeek-V3',   // SiliconFlow DeepSeek
    'gemini/gemini-2.5-flash',               // 1500 req/day free
    'gemini/gemini-2.0-flash',               // Gemini 2.0 Flash
    'deepseek/deepseek-chat',                // DeepSeek V3 (very cheap)
    'qwen/qwen-plus',                        // Qwen free tier
    'fireworks/accounts/fireworks/models/llama-v3p3-70b-instruct',
    'together/meta-llama/Llama-3.3-70B-Instruct-Turbo',
    'openrouter/mistralai/mistral-small-3.1-24b:free',  // OpenRouter free
    'openrouter/meta-llama/llama-3.3-70b-instruct:free',
    'openai/gpt-4o-mini',                    // GitHub — low limits, last resort
    'openai/gpt-4.1-mini',
  ],

  // ─────────────────────────────────────────────────────────────────
  // Lightweight tasks: classification, extraction, summarization
  // ─────────────────────────────────────────────────────────────────
  lightweight: [
    'ollama/llama3.2',
    'ollama/qwen2.5:3b',
    'nano/token-generator',
    'mistral/mistral-small-latest',
    'cerebras/llama3.1-8b',
    'groq/llama-3.2-3b-preview',
    'groq/llama-3.1-8b-instant',
    'siliconflow/Qwen/Qwen2.5-7B-Instruct',
    'gemini/gemini-2.0-flash-lite',
    'groq/meta-llama/llama-4-scout-17b-16e-instruct',
    'qwen/qwen-turbo',
    'openrouter/google/gemma-3-4b-it:free',
    'openai/gpt-4.1-nano',                   // GitHub fallback
  ],

  // ─────────────────────────────────────────────────────────────────
  // Reasoning / planning tasks (deep chain of thought)
  // ─────────────────────────────────────────────────────────────────
  reasoning: [
    'ollama/deepseek-r1:7b',                  // local R1
    'mistral/codestral-latest',               // Mistral first cloud reasoning
    'mistral/mistral-large-latest',           // Mistral large
    'groq/qwen/qwen3-32b',                    // Qwen3 thinking
    'deepseek/deepseek-reasoner',             // DeepSeek R1 direct
    'siliconflow/deepseek-ai/DeepSeek-R1',   // SiliconFlow R1
    'gemini/gemini-2.5-pro',                  // Gemini 2.5 Pro
    'cerebras/llama-3.3-70b',                 // fast cloud reasoning
    'together/deepseek-ai/DeepSeek-R1',
    'fireworks/accounts/fireworks/models/deepseek-r1',
    'openrouter/deepseek/deepseek-r1:free',
    'openai/o4-mini',                         // GitHub — low limits
    'openai/o3',
    'deepseek/DeepSeek-R1',
  ],

  // ─────────────────────────────────────────────────────────────────
  // Embedding / semantic search
  // ─────────────────────────────────────────────────────────────────
  embedding: [
    'nano/embedding',                          // NANO Sea local first
    'ollama/nomic-embed-text',
    'ollama/mxbai-embed-large',
    'mistral/mistral-embed',                   // Mistral embeddings
    'gemini/text-embedding-004',
    'together/togethercomputer/m2-bert-80M-8k-retrieval',
  ],

  // ─────────────────────────────────────────────────────────────────
  // Crawler-specific: suggested jobs, gap analysis, community scanner
  // Needs reliable models that follow structured output instructions
  // ─────────────────────────────────────────────────────────────────
  crawler: [
    'ollama/deepseek-coder-v2',
    'mistral/codestral-latest',               // Mistral code specialist
    'mistral/mistral-small-latest',
    'cerebras/llama-3.3-70b',                 // ultra-fast for crawlers
    'groq/llama-3.3-70b-versatile',
    'siliconflow/Qwen/Qwen2.5-Coder-32B-Instruct',
    'gemini/gemini-2.5-flash',
    'deepseek/deepseek-chat',
    'qwen/qwen-plus',
    'openrouter/mistralai/mistral-small-3.1-24b:free',
    'openai/gpt-4.1-mini',                    // GitHub fallback
  ],

  // ─────────────────────────────────────────────────────────────────
  // Mistral-priority chain: when user selects "Mistral go-to"
  // ─────────────────────────────────────────────────────────────────
  mistral_priority: [
    'mistral/codestral-latest',
    'mistral/mistral-large-latest',
    'mistral/mistral-medium-latest',
    'mistral/mistral-small-latest',
    'mistral/open-mixtral-8x22b',
    'ollama/mistral',                          // local Mistral fallback
    'cerebras/llama-3.3-70b',                  // ultra-fast if all Mistral fail
    'groq/llama-3.3-70b-versatile',
    'gemini/gemini-2.5-flash',
  ],
};

// ── Provider health cache (soft-test results) ──

interface ProviderHealth {
  available: boolean;
  checkedAt: number;
  latencyMs: number | null;
  error?: string;
}

const providerHealth = new Map<string, ProviderHealth>();
const HEALTH_TTL_MS = 5 * 60_000; // 5 minutes

// ── Parse provider/model from composite ID ──

function splitModelId(modelId: string): { provider: ProviderType; providerModelId: string } {
  const slash = modelId.indexOf('/');
  if (slash < 0) return { provider: 'github' as ProviderType, providerModelId: modelId };
  return {
    provider: modelId.slice(0, slash) as ProviderType,
    providerModelId: modelId.slice(slash + 1),
  };
}

// ── Mistral performance learning ──

interface MistralPerformanceRecord {
  modelId: string;
  successes: number;
  failures: number;
  totalLatencyMs: number;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
}

const mistralPerf = new Map<string, MistralPerformanceRecord>();

function recordMistralCall(modelId: string, success: boolean, latencyMs: number): void {
  if (!modelId.startsWith('mistral/')) return;
  const existing = mistralPerf.get(modelId) || {
    modelId, successes: 0, failures: 0, totalLatencyMs: 0,
    lastSuccessAt: null, lastFailureAt: null,
  };
  if (success) {
    existing.successes++;
    existing.totalLatencyMs += latencyMs;
    existing.lastSuccessAt = Date.now();
  } else {
    existing.failures++;
    existing.lastFailureAt = Date.now();
  }
  mistralPerf.set(modelId, existing);
}

export function getMistralPerformanceSummary(): MistralPerformanceRecord[] {
  return Array.from(mistralPerf.values()).map(r => ({
    ...r,
    avgLatencyMs: r.successes > 0 ? Math.round(r.totalLatencyMs / r.successes) : null,
    successRate: (r.successes + r.failures) > 0
      ? r.successes / (r.successes + r.failures)
      : 0,
  } as any));
}

// ── Call LLM with multi-provider fallback ──

export interface FallbackCallOptions {
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  maxTokens?: number;
  temperature?: number;
  /** Which fallback chain to use. Defaults to 'default'. */
  chainKey?: keyof typeof FALLBACK_CHAINS;
  /** Override the full chain with a specific ordered list of modelIds */
  customChain?: string[];
  /** Task context string for Nano training observe */
  taskType?: string;
  /** Whether to stream (returns first non-streaming result) */
  db: any;
  nanoObserveUrl?: string;
  /** Session ID for model-selection-events tracking (powers God Factory thinking animation) */
  sessionId?: string;
  /** Message ID for per-message model selection tracking */
  messageId?: string;
}

export interface FallbackCallResult {
  content: string;
  modelId: string;
  provider: ProviderType;
  attemptCount: number;
  latencyMs: number;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
}

/**
 * Calls LLM with full fallback chain. Tries each model in order.
 * Fires POST /v1/training/observe per CONSTITUTION Invariant 7 on every call.
 */
export async function callWithFallback(opts: FallbackCallOptions): Promise<FallbackCallResult> {
  const chain = opts.customChain ?? FALLBACK_CHAINS[opts.chainKey ?? 'default'] ?? FALLBACK_CHAINS.default;
  const errors: string[] = [];
  let attemptCount = 0;

  for (const modelId of chain) {
    const { provider, providerModelId } = splitModelId(modelId);
    attemptCount++;

    // Skip models currently in cooldown (rate-limit learning)
    if (opts.db && isModelCoolingDown(opts.db, modelId)) {
      errors.push(`${modelId}: skipped (rate-limit cooldown active)`);
      continue;
    }

    try {
      // Get client for this provider
      const client = getClientFromDb(opts.db, provider);
      if (!client) {
        errors.push(`${modelId}: provider not configured`);
        continue;
      }

      const startMs = Date.now();
      const response = await client.chat.completions.create({
        model: providerModelId,
        messages: opts.messages,
        max_tokens: opts.maxTokens ?? 2048,
        temperature: opts.temperature ?? 0.7,
      });
      const latencyMs = Date.now() - startMs;

      const content = response.choices?.[0]?.message?.content ?? '';

      // Empty response detection — count as failure, try next
      if (!content.trim()) {
        errors.push(`${modelId}: empty response`);
        recordMistralCall(modelId, false, latencyMs);
        continue;
      }

      // Record success in rate limit tracker
      if (opts.db) recordSuccess(opts.db, modelId);

      // Record Mistral performance
      recordMistralCall(modelId, true, latencyMs);

      // CONSTITUTION Rule 7: fire training observe (fire-and-forget)
      const observeUrl = opts.nanoObserveUrl ?? 'http://localhost:5100/v1/training/observe';
      fetch(observeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_id: modelId,
          task_type: opts.taskType ?? 'llm_call',
          input: opts.messages.slice(-1)[0]?.content ?? '',
          output: content,
          latency_ms: latencyMs,
          success: true,
        }),
      }).catch(() => { /* fire-and-forget */ });

      // Record model selection event for God Factory thinking animation
      if (opts.sessionId) {
        recordModelSelection(opts.db, {
          sessionId: opts.sessionId,
          messageId: opts.messageId,
          modelChosen: modelId,
          modelsConsidered: chain.slice(0, attemptCount),
          reason: attemptCount > 1 ? `fallback after ${attemptCount - 1} failed attempt(s)` : 'primary choice',
          latencyMs,
          taskType: opts.taskType ?? opts.chainKey ?? 'default',
          success: true,
        });
      }

      return {
        content,
        modelId,
        provider,
        attemptCount,
        latencyMs,
        usage: response.usage ?? null,
      };
    } catch (err: any) {
      const msg = err?.error?.message || err?.message || 'unknown error';
      const httpStatus = err?.status ?? err?.statusCode ?? 0;
      errors.push(`${modelId}: ${msg}`);
      recordMistralCall(modelId, false, 0);

      // Record rate limit events for learning engine
      if (opts.db && (httpStatus === 429 || msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('rate_limit'))) {
        recordRateLimit(opts.db, modelId, httpStatus || 429, msg);
      }

      // Rate limit: continue to next immediately
      // Other errors: continue
    }
  }

  // All failed — throw with full error context
  throw new Error(`All ${chain.length} models failed. Errors: ${errors.join(' | ')}`);
}

/**
 * Test all providers in the fallback chain and return availability results.
 * Used by the model health dashboard.
 */
export async function testFallbackChain(db: any, chainKey: string = 'default'): Promise<Array<{
  modelId: string;
  available: boolean;
  latencyMs: number | null;
  error?: string;
}>> {
  const chain = FALLBACK_CHAINS[chainKey] ?? FALLBACK_CHAINS.default;
  const results = await Promise.allSettled(chain.map(async (modelId) => {
    const { provider, providerModelId } = splitModelId(modelId);
    try {
      const client = getClientFromDb(db, provider);
      if (!client) return { modelId, available: false, latencyMs: null, error: 'not configured' };

      const start = Date.now();
      const resp = await (client.chat.completions.create as any)({
        model: providerModelId,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 3,
      });
      const latencyMs = Date.now() - start;
      const ok = !!resp?.choices?.[0]?.message?.content;
      return { modelId, available: ok, latencyMs };
    } catch (err: any) {
      return { modelId, available: false, latencyMs: null, error: err?.message };
    }
  }));

  return results.map(r => r.status === 'fulfilled' ? r.value : {
    modelId: 'unknown', available: false, latencyMs: null, error: 'test error',
  });
}
