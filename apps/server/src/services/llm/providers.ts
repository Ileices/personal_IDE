// ============================================
// Multi-Provider LLM Client
// Supports GitHub, Ollama, Groq, HuggingFace,
// Cohere, Mistral, Gemini, Together, OpenRouter, LM Studio
// ============================================
import OpenAI from 'openai';
import type { ProviderType, UnifiedModel, TokenLimitCheck } from '@personal-ide/shared';
import { MODELS } from '@personal-ide/shared';
import { appConfig } from '../../config.js';
import { smartDecrypt } from '../crypto/index.js';

/** Create an OpenAI-compatible client for any provider */
export function createProviderClient(
  provider: ProviderType,
  baseURL: string,
  apiKey?: string
): OpenAI {
  // Local providers (Ollama/LMStudio/Nano) get longer timeout since local inference can be slow
  // especially with multiple fleet agents queuing requests on a single GPU
  const isLocal = ['ollama', 'lmstudio', 'nano'].includes(provider);
  const timeoutMs = isLocal ? 10 * 60_000 : 5 * 60_000; // 10min local, 5min cloud

  return new OpenAI({
    baseURL,
    apiKey: apiKey || 'ollama',  // Ollama/LMStudio don't need real keys
    dangerouslyAllowBrowser: false,
    timeout: timeoutMs,
    maxRetries: 1,  // Don't auto-retry — the agent loop handles retries itself
  });
}

/** Create a GitHub Models client */
export function createGitHubClient(token: string): OpenAI {
  return createProviderClient('github', 'https://models.github.ai/inference', token);
}

/** Create an Ollama client */
export function createOllamaClient(baseURL: string = appConfig.services.ollamaUrl): OpenAI {
  const cleanURL = baseURL.replace(/\/v1\/?$/, '');
  return createProviderClient('ollama', `${cleanURL}/v1`);
}

/** Create a Nano Sea client */
export function createNanoClient(baseURL: string = appConfig.services.nanoSeaUrl): OpenAI {
  const cleanURL = baseURL.replace(/\/v1\/?$/, '');
  return createProviderClient('nano', `${cleanURL}/v1`, 'nano-local');
}

/** Get client from DB using stored encrypted token */
export function getClientFromDb(db: any, provider: ProviderType = 'github'): OpenAI | null {
  if (provider === 'ollama') {
    const row = db.prepare(
      "SELECT base_url FROM provider_configs WHERE provider_id = 'ollama' AND enabled = 1"
    ).get() as any;
    return createOllamaClient(row?.base_url || appConfig.services.ollamaUrl);
  }

  if (provider === 'nano') {
    const row = db.prepare(
      "SELECT base_url FROM provider_configs WHERE provider_id = 'nano' AND enabled = 1"
    ).get() as any;
    return createNanoClient(row?.base_url || appConfig.services.nanoSeaUrl);
  }

  if (provider === 'github') {
    const row = db.prepare('SELECT token_encrypted FROM auth_tokens WHERE is_active = 1').get() as any;
    if (!row || !row.token_encrypted) return null;
    const token = smartDecrypt(row.token_encrypted, appConfig.security.encryptKey);
    if (!token) return null;
    return createGitHubClient(token);
  }

  // Generic provider from DB
  const row = db.prepare(
    'SELECT base_url, api_key_encrypted FROM provider_configs WHERE provider_id = ? AND enabled = 1'
  ).get(provider) as any;
  if (!row) return null;

  let apiKey = '';
  if (row.api_key_encrypted) {
    apiKey = smartDecrypt(row.api_key_encrypted, appConfig.security.encryptKey) || '';
  }

  return createProviderClient(provider, row.base_url, apiKey);
}

/** Get client for ANY configured provider (tries provider_configs first, falls back to auth_tokens for github) */
export function getAnyClient(db: any, provider: ProviderType, model: string): OpenAI | null {
  return getClientFromDb(db, provider);
}

// ── Model Discovery ──

let _modelsCache: Record<string, { ts: number; models: UnifiedModel[] }> = {};
const MODELS_TTL_MS = 5 * 60 * 1000; // 5 minutes — avoid GitHub rate limits

/** Fetch available models from a provider */
export async function fetchProviderModels(
  client: OpenAI,
  provider: ProviderType
): Promise<UnifiedModel[]> {
  const cacheKey = provider;
  const now = Date.now();
  if (_modelsCache[cacheKey] && now - _modelsCache[cacheKey].ts < MODELS_TTL_MS) {
    return _modelsCache[cacheKey].models;
  }

  try {
    if (provider === 'ollama') {
      return await fetchOllamaModels(client);
    }

    if (provider === 'nano') {
      return await fetchNanoModels(client);
    }

    // GitHub Models API does NOT have a /models listing endpoint — it returns 404.
    // Use the curated model list from shared constants instead.
    if (provider === 'github') {
      const models: UnifiedModel[] = MODELS.map(m => ({
        id: m.id,
        name: m.name,
        provider: 'github' as ProviderType,
        providerId: m.id,
        description: m.description,
        maxInputTokens: m.maxInputTokens,
        maxOutputTokens: m.maxOutputTokens,
        contextWindow: m.maxInputTokens,
        supportsStreaming: m.supportsStreaming,
        supportsTools: m.supportsTools,
        supportsJsonMode: m.supportsJsonMode,
        supportsVision: /4o|gemini|claude/.test(m.id),
        effectiveTokenLimit: Math.floor(m.maxInputTokens * 0.95),
        isFree: false,
        meta: m,
      }));
      _modelsCache[cacheKey] = { ts: now, models };
      return models;
    }

    // OpenAI-compatible /models endpoint (works for Groq, HuggingFace, Mistral, etc.)
    const res: any = await client.models.list();
    const rawModels = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);

    const models: UnifiedModel[] = rawModels.map((m: any) => {
      const contextWindow = m.context_length || m.context_window || m.max_model_len || appConfig.contextDefaults.unknownModelContext;
      return {
        id: `${provider}/${m.id}`,
        name: m.name || m.id,
        provider,
        providerId: m.id,
        description: m.description || `${m.id} via ${provider}`,
        maxInputTokens: m.max_input_tokens || contextWindow,
        maxOutputTokens: m.max_output_tokens || Math.min(contextWindow, 16_384),
        contextWindow,
        supportsStreaming: true,
        supportsTools: m.capabilities?.tools !== false,
        supportsJsonMode: m.capabilities?.json_mode !== false,
        supportsVision: m.capabilities?.vision === true || /vision|4o|gemini|claude/.test(m.id),
        effectiveTokenLimit: Math.floor(contextWindow * 0.95),
        isFree: true, // Non-GitHub providers reaching this branch are free-tier
        meta: m,
      };
    });

    _modelsCache[cacheKey] = { ts: now, models };
    return models;
  } catch (err) {
    throw err;
  }
}

/** Fetch models from Nano Sea's /v1/models endpoint */
async function fetchNanoModels(client: OpenAI): Promise<UnifiedModel[]> {
  const baseURL = (client as any).baseURL?.replace('/v1', '') || appConfig.services.nanoSeaUrl;

  try {
    const res = await fetch(`${baseURL}/v1/models`);
    if (!res.ok) throw new Error(`Nano Sea API error: ${res.status}`);
    const data = await res.json();
    const models = (data.data || []).map((m: any) => {
      return {
        id: `nano/${m.id}`,
        name: m.id || 'nano-sea',
        provider: 'nano' as ProviderType,
        providerId: m.id,
        description: `Nano Sea — ${m.description || 'Living ecosystem of micro-neural-networks'}`,
        maxInputTokens: m.context_window || 32_768,
        maxOutputTokens: m.max_output_tokens || 4_096,
        contextWindow: m.context_window || 32_768,
        supportsStreaming: true,
        supportsTools: false,
        supportsJsonMode: false,
        supportsVision: false,
        effectiveTokenLimit: Math.floor((m.context_window || 32_768) * 0.95),
        isFree: true,
        meta: m,
      };
    });

    _modelsCache['nano'] = { ts: Date.now(), models };
    return models;
  } catch (err: any) {
    if (err.message?.includes('fetch') || err.code === 'ECONNREFUSED') {
      throw new Error('Nano Sea is not running. Start it with: python NANO_train/main.py');
    }
    throw err;
  }
}

/** Fetch models from Ollama's /api/tags endpoint */
async function fetchOllamaModels(client: OpenAI): Promise<UnifiedModel[]> {
  const baseURL = (client as any).baseURL?.replace('/v1', '') || appConfig.services.ollamaUrl;

  try {
    const res = await fetch(`${baseURL}/api/tags`);
    if (!res.ok) throw new Error(`Ollama API error: ${res.status}`);
    const data = await res.json();
    const models = (data.models || []).map((m: any) => {
      // Ollama context sizes: default to model-specific or 128K
      const contextWindow = m.details?.context_length || appConfig.contextDefaults.unknownModelContext;
      const paramSize = m.details?.parameter_size || '';
      return {
        id: `ollama/${m.name}`,
        name: m.name,
        provider: 'ollama' as ProviderType,
        providerId: m.name,
        description: `${m.name} (${paramSize || 'local'}) — ${formatBytes(m.size || 0)}`,
        maxInputTokens: contextWindow,
        maxOutputTokens: Math.min(contextWindow, 32_768),
        contextWindow,
        supportsStreaming: true,
        supportsTools: true,
        supportsJsonMode: true,
        supportsVision: /llava|vision|moondream|bakllava/.test(m.name),
        effectiveTokenLimit: Math.floor(contextWindow * 0.95),
        isFree: true,
        meta: m,
      };
    });

    _modelsCache['ollama'] = { ts: Date.now(), models };
    return models;
  } catch (err: any) {
    if (err.message?.includes('fetch') || err.code === 'ECONNREFUSED') {
      throw new Error('Ollama is not running. Start it with: ollama serve');
    }
    throw err;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ── Token Limit Management ──

const TOKEN_SAFETY_FACTOR = 0.95;

/** Rough token estimation: ~4 chars per token for English, ~3 for code */
export function estimateTokens(text: string): number {
  // Heuristic: code averages ~3.5 chars/token, prose ~4 chars/token
  const codeRatio = (text.match(/[{}();=<>[\]]/g)?.length || 0) / Math.max(text.length, 1);
  const charsPerToken = codeRatio > 0.02 ? 3.5 : 4;
  return Math.ceil(text.length / charsPerToken);
}

/** Check if content fits within model token limits */
export function checkTokenLimit(
  content: string,
  modelContextWindow: number,
  reserveForOutput: number = 4096
): TokenLimitCheck {
  const estimated = estimateTokens(content);
  const effectiveLimit = Math.floor(modelContextWindow * TOKEN_SAFETY_FACTOR);
  const maxAllowed = effectiveLimit - reserveForOutput;

  return {
    withinLimit: estimated <= maxAllowed,
    estimatedTokens: estimated,
    maxAllowed,
    effectiveLimit,
    reductionNeeded: Math.max(0, estimated - maxAllowed),
    suggestion: estimated > maxAllowed
      ? `Content is ~${estimated} tokens but limit is ${maxAllowed}. Reduce by ${estimated - maxAllowed} tokens (~${Math.ceil((estimated - maxAllowed) * 3.5)} chars).`
      : 'Content fits within limits.',
  };
}

/** Truncate content to fit within token limit, preserving structure */
export function truncateToFit(
  content: string,
  maxTokens: number,
  preserveEnds: boolean = true
): string {
  const estimated = estimateTokens(content);
  if (estimated <= maxTokens) return content;

  const targetChars = Math.floor(maxTokens * 3.5);

  if (preserveEnds) {
    const headSize = Math.floor(targetChars * 0.6);
    const tailSize = Math.floor(targetChars * 0.35);
    const head = content.slice(0, headSize);
    const tail = content.slice(-tailSize);
    return `${head}\n\n... [${estimated - maxTokens} tokens truncated to fit ${maxTokens} token limit] ...\n\n${tail}`;
  }

  return content.slice(0, targetChars) + `\n\n... [truncated to fit ${maxTokens} token limit]`;
}

/** Split content into chunks that each fit within token limits */
export function chunkContent(
  content: string,
  maxTokensPerChunk: number
): string[] {
  const targetCharsPerChunk = Math.floor(maxTokensPerChunk * 3.5);
  const lines = content.split('\n');
  const chunks: string[] = [];
  let current = '';

  for (const line of lines) {
    if (current.length + line.length + 1 > targetCharsPerChunk && current.length > 0) {
      chunks.push(current);
      current = line;
    } else {
      current += (current ? '\n' : '') + line;
    }
  }
  if (current) chunks.push(current);

  return chunks;
}

/** Detect "body too large" / token limit errors and extract the limit */
export function isTokenLimitError(error: any): { isLimit: boolean; suggestedMax?: number } {
  const msg = (error?.message || error?.error?.message || String(error)).toLowerCase();
  const statusCode = error?.status || error?.statusCode || error?.error?.status;

  // Status code 413 is always a body-too-large error
  if (statusCode === 413) {
    const suggestedMax = extractTokenLimit(msg);
    return { isLimit: true, suggestedMax };
  }

  const patterns = [
    /body too large/i,
    /request too large/i,
    /maximum context length/i,
    /token limit/i,
    /max.?tokens?\s*(?:exceeded|limit)/i,
    /context.?length.?exceeded/i,
    /input.?too.?long/i,
    /payload.?too.?large/i,
    /model.?maximum.?context/i,
    /max size/i,
  ];

  const isLimit = patterns.some(p => p.test(msg));

  return { isLimit, suggestedMax: isLimit ? extractTokenLimit(msg) : undefined };
}

/** Extract the numeric token limit from an error message */
function extractTokenLimit(msg: string): number | undefined {
  // "Max size: 8000 tokens" — GitHub Models format
  const maxSizeMatch = msg.match(/max\s*size[:\s]+(\d[\d,]*)\s*tokens?/i);
  if (maxSizeMatch) return parseInt(maxSizeMatch[1].replace(/,/g, ''), 10);

  // "maximum context length is 8000 tokens"
  const ctxMatch = msg.match(/maximum\s*(?:context)?\s*(?:length|tokens?)?\s*(?:is|of|:)?\s*(\d[\d,]+)/i);
  if (ctxMatch) return parseInt(ctxMatch[1].replace(/,/g, ''), 10);

  // "8000 tokens limit"
  const limitMatch = msg.match(/(\d[\d,]+)\s*tokens?\s*(?:limit|maximum|max|allowed)/i);
  if (limitMatch) return parseInt(limitMatch[1].replace(/,/g, ''), 10);

  // "8000 token context"
  const tokenCtxMatch = msg.match(/(\d[\d,]+)\s*token\s*(?:context|limit)/i);
  if (tokenCtxMatch) return parseInt(tokenCtxMatch[1].replace(/,/g, ''), 10);

  return undefined;
}

// Keep backward compatibility
export { createGitHubClient as createLLMClient };

/** Fetch available models (backward compat) */
export async function getAvailableModels(db: any): Promise<any[]> {
  const client = getClientFromDb(db, 'github');
  if (!client) throw new Error('No active LLM client/token available');
  return fetchProviderModels(client, 'github');
}
