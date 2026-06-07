// apps/server/src/services/llm/providers.ts
// Multi-Provider LLM Client
// Supports GitHub, Ollama, Groq, HuggingFace,
// Cohere, Mistral, Gemini, Together, OpenRouter, LM Studio,
// Cerebras, SiliconFlow, Fireworks, Anthropic, Perplexity, xAI, DeepSeek, Qwen
// ============================================
import OpenAI from 'openai';
import type { ProviderType, UnifiedModel, TokenLimitCheck } from '@personal-ide/shared';
import { MODELS, extractProviderFromModelId } from '@personal-ide/shared';
import { appConfig } from '../../config.js';
import { smartDecrypt } from '../crypto/index.js';
import type { DatabaseConnection, DbProviderRow, DbAuthRow, StandardLLMClient } from './types.js';

function decryptTokenOrPlain(value: string | null | undefined): string | null {
  if (!value) return null;
  const decrypted = smartDecrypt(value, appConfig.security.encryptKey);
  if (decrypted && decrypted.length > 0) return decrypted;
  // Backward compatibility for legacy/plaintext rows.
  return value.length > 10 ? value : null;
}

/** Create an OpenAI-compatible client for any provider */
export function createProviderClient(
  provider: ProviderType,
  baseURL: string,
  apiKey?: string
): StandardLLMClient {
  // Local providers (Ollama/LMStudio/Nano) get longer timeout since local inference can be slow
  const isLocal = ['ollama', 'lmstudio', 'nano'].includes(provider);
  const timeoutMs = isLocal ? 10 * 60_000 : 5 * 60_000; // 10min local, 5min cloud

  // Anthropic requires special interoperability headers for OpenAI-compatible mode
  if (provider === 'anthropic') {
    return new OpenAI({
      baseURL,
      apiKey: apiKey || '',
      dangerouslyAllowBrowser: false,
      timeout: timeoutMs,
      maxRetries: 1,
      defaultHeaders: {
        'x-api-key': apiKey || '',
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'interoperability-2025-04-14',
      },
    });
  }

  // DeepSeek direct requires special headers for OpenAI compatibility
  if (provider === 'deepseek-direct') {
    return new OpenAI({
      baseURL,
      apiKey: apiKey || '',
      dangerouslyAllowBrowser: false,
      timeout: timeoutMs,
      maxRetries: 1,
      defaultHeaders: {
        'x-api-key': apiKey || '',
        'deepseek-version': '2025-03-01',
      },
    });
  }

  // GitHub Models require special headers
  if (provider === 'github') {
    return new OpenAI({
      baseURL,
      apiKey: apiKey || '',
      dangerouslyAllowBrowser: false,
      timeout: timeoutMs,
      maxRetries: 1,
      defaultHeaders: {
        'x-github-token': apiKey || '',
        'x-github-api-version': '2023-07-07',
      },
    });
  }

  return new OpenAI({
    baseURL,
    apiKey: apiKey || 'ollama',  // Ollama/LMStudio don't need real keys
    dangerouslyAllowBrowser: false,
    timeout: timeoutMs,
    maxRetries: 1,  // Don't auto-retry — the agent loop handles retries itself
  });
}

/** Create a GitHub Models client */
export function createGitHubClient(token: string): StandardLLMClient {
  return createProviderClient('github', 'https://models.github.ai/inference', token);
}

/** Create an Ollama client */
export function createOllamaClient(baseURL: string = appConfig.services.ollamaUrl): StandardLLMClient {
  const cleanURL = baseURL.replace(/\/v1\/?$/, '');
  return createProviderClient('ollama', `${cleanURL}/v1`);
}

/** Create a Nano Sea client */
export function createNanoClient(baseURL: string = appConfig.services.nanoSeaUrl): StandardLLMClient {
  const cleanURL = baseURL.replace(/\/v1\/?$/, '');
  return createProviderClient('nano', `${cleanURL}/v1`, 'nano-local');
}

/** Get client from DB using stored encrypted token */
export function getClientFromDb(db: DatabaseConnection, provider: ProviderType = 'github'): StandardLLMClient | null {
  if (provider === 'ollama') {
    const row = db.prepare(
      "SELECT base_url FROM provider_configs WHERE provider_id = 'ollama' AND enabled = 1"
    ).get() as DbProviderRow | null;
    return createOllamaClient(row?.base_url || appConfig.services.ollamaUrl);
  }

  if (provider === 'nano') {
    const row = db.prepare(
      "SELECT base_url FROM provider_configs WHERE provider_id = 'nano' AND enabled = 1"
    ).get() as DbProviderRow | null;
    return createNanoClient(row?.base_url || appConfig.services.nanoSeaUrl);
  }

  if (provider === 'github') {
    // Prefer active non-guest GitHub account
    const authRow = db.prepare(`
      SELECT token_encrypted
      FROM auth_tokens
      WHERE is_active = 1 AND github_user_id != -1
      ORDER BY updated_at DESC
      LIMIT 1
    `).get() as DbAuthRow | null;
    
    if (authRow?.token_encrypted) {
      const token = decryptTokenOrPlain(authRow.token_encrypted);
      if (token) return createGitHubClient(token);
    }

    // Fallback to most recent saved GitHub account
    const fallbackAuthRow = db.prepare(`
      SELECT token_encrypted
      FROM auth_tokens
      WHERE github_user_id != -1
      ORDER BY is_active DESC, updated_at DESC
      LIMIT 1
    `).get() as DbAuthRow | null;
    
    if (fallbackAuthRow?.token_encrypted) {
      const token = decryptTokenOrPlain(fallbackAuthRow.token_encrypted);
      if (token) return createGitHubClient(token);
    }

    // Fallback: support legacy/provider-configured GitHub API keys
    const cfgRow = db.prepare(
      "SELECT api_key_encrypted, base_url FROM provider_configs WHERE provider_id = 'github' AND enabled = 1"
    ).get() as DbProviderRow | null;
    
    if (!cfgRow?.api_key_encrypted) return null;
    const token = decryptTokenOrPlain(cfgRow.api_key_encrypted);
    if (!token) return null;
    const base = cfgRow.base_url || 'https://models.github.ai/inference';
    return createProviderClient('github', base, token);
  }

  // Generic provider from DB
  const row = db.prepare(
    'SELECT base_url, api_key_encrypted FROM provider_configs WHERE provider_id = ? AND enabled = 1'
  ).get(provider) as DbProviderRow | null;
  
  if (!row) return null;
  let apiKey = '';
  if (row.api_key_encrypted) {
    apiKey = smartDecrypt(row.api_key_encrypted, appConfig.security.encryptKey) || '';
  }
  return createProviderClient(provider, row.base_url, apiKey);
}

/** Get all enabled providers from DB */
export function getEnabledProviders(db: DatabaseConnection): ProviderType[] {
  const rows = db.prepare(
    'SELECT DISTINCT provider_id FROM provider_configs WHERE enabled = 1'
  ).all() as unknown as Array<{ provider_id: ProviderType }>;
  return rows.map(row => row.provider_id);
}

/** Get client for ANY configured provider (tries provider_configs first, falls back to auth_tokens for github) */
export function getAnyClient(db: DatabaseConnection, provider: ProviderType, model: string): StandardLLMClient | null {
  void model;
  return getClientFromDb(db, provider);
}

// -- Model Discovery --

let _modelsCache: Record<string, { ts: number; models: UnifiedModel[] }> = {};
const MODELS_TTL_MS = 5 * 60 * 1000; // 5 minutes -- avoid GitHub rate limits

/** Fetch available models from a provider */
export async function fetchProviderModels(
  client: StandardLLMClient,
  provider: ProviderType
): Promise<UnifiedModel[]> {
  const cacheKey = provider;
  const now = Date.now();
  if (_modelsCache[cacheKey] && now - _modelsCache[cacheKey].ts < MODELS_TTL_MS) {
    return _modelsCache[cacheKey].models;
  }

  if (provider === 'ollama') {
    return fetchOllamaModels(client);
  }

  if (provider === 'nano') {
    return fetchNanoModels(client);
  }

  // GitHub Models API: only return models that actually route through the
  // GitHub Models inference endpoint (https://models.github.ai/inference).
  if (provider === 'github') {
    const githubCatalogModels = MODELS.filter(m => extractProviderFromModelId(m.id) === 'github');
    const models: UnifiedModel[] = githubCatalogModels.map(m => ({
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

  // OpenAI-compatible /models endpoint
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
      maxOutputTokens: m.max_output_tokens || Math.min(contextWindow, 16384),
      contextWindow,
      supportsStreaming: true,
      supportsTools: m.capabilities?.tools !== false,
      supportsJsonMode: m.capabilities?.json_mode !== false,
      supportsVision: m.capabilities?.vision === true || /vision|4o|gemini|claude/.test(m.id),
      effectiveTokenLimit: Math.floor(contextWindow * 0.95),
      isFree: true,
      meta: m,
    };
  });

  _modelsCache[cacheKey] = { ts: now, models };
  return models;
}

/** Fetch models from Nano Sea's /v1/models endpoint */
async function fetchNanoModels(client: StandardLLMClient): Promise<UnifiedModel[]> {
  const baseURL = (client as any).baseURL?.replace('/v1', '') || appConfig.services.nanoSeaUrl;

  try {
    const res = await fetch(`${baseURL}/v1/models`);
    if (!res.ok) throw new Error(`Nano Sea API error: ${res.status}`);
    const data = await res.json();
    const models: UnifiedModel[] = (data.data || []).map((m: any) => ({
      id: `nano/${m.id}`,
      name: m.id || 'nano-sea',
      provider: 'nano' as ProviderType,
      providerId: m.id,
      description: `Nano Sea - ${m.description || 'Living ecosystem of micro-neural-networks'}`,
      maxInputTokens: m.context_window || 32768,
      maxOutputTokens: m.max_output_tokens || 4096,
      contextWindow: m.context_window || 32768,
      supportsStreaming: true,
      supportsTools: false,
      supportsJsonMode: false,
      supportsVision: false,
      effectiveTokenLimit: Math.floor((m.context_window || 32768) * 0.95),
      isFree: true,
      meta: m,
    }));

    _modelsCache.nano = { ts: Date.now(), models };
    return models;
  } catch (err: any) {
    if (err.message?.includes('fetch') || err.code === 'ECONNREFUSED') {
      throw new Error('Nano Sea is not running. Start it with: python NANO_train/main.py');
    }
    throw err;
  }
}

/** Fetch models from Ollama's /api/tags endpoint */
async function fetchOllamaModels(client: StandardLLMClient): Promise<UnifiedModel[]> {
  const baseURL = (client as any).baseURL?.replace('/v1', '') || appConfig.services.ollamaUrl;

  try {
    const res = await fetch(`${baseURL}/api/tags`);
    if (!res.ok) throw new Error(`Ollama API error: ${res.status}`);
    const data = await res.json();
    const models: UnifiedModel[] = (data.models || []).map((m: any) => {
      const contextWindow = m.details?.context_length || appConfig.contextDefaults.unknownModelContext;
      const paramSize = m.details?.parameter_size || '';
      return {
        id: `ollama/${m.name}`,
        name: m.name,
        provider: 'ollama' as ProviderType,
        providerId: m.name,
        description: `${m.name} (${paramSize || 'local'}) - ${formatBytes(m.size || 0)}`,
        maxInputTokens: contextWindow,
        maxOutputTokens: Math.min(contextWindow, 32768),
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

    _modelsCache.ollama = { ts: Date.now(), models };
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

// -- Token Limit Management --

const TOKEN_SAFETY_FACTOR = 0.95;

/** Rough token estimation: ~4 chars per token for English, ~3 for code */
export function estimateTokens(text: string): number {
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

  return `${content.slice(0, targetChars)}\n\n... [truncated to fit ${maxTokens} token limit]`;
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

/** Detect body-too-large/token-limit errors and extract the limit */
export function isTokenLimitError(error: any): { isLimit: boolean; suggestedMax?: number } {
  const msg = (error?.message || error?.error?.message || String(error)).toLowerCase();
  const statusCode = error?.status || error?.statusCode || error?.error?.status;

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

  const isLimit = patterns.some((pattern) => pattern.test(msg));
  return { isLimit, suggestedMax: isLimit ? extractTokenLimit(msg) : undefined };
}

/** Extract the numeric token limit from an error message */
function extractTokenLimit(msg: string): number | undefined {
  const maxSizeMatch = msg.match(/max\s*size[:\s]+(\d[\d,]*)\s*tokens?/i);
  if (maxSizeMatch) return parseInt(maxSizeMatch[1].replace(/,/g, ''), 10);

  const ctxMatch = msg.match(/maximum\s*(?:context)?\s*(?:length|tokens?)?\s*(?:is|of|:)?\s*(\d[\d,]+)/i);
  if (ctxMatch) return parseInt(ctxMatch[1].replace(/,/g, ''), 10);

  const limitMatch = msg.match(/(\d[\d,]+)\s*tokens?\s*(?:limit|maximum|max|allowed)/i);
  if (limitMatch) return parseInt(limitMatch[1].replace(/,/g, ''), 10);

  const tokenCtxMatch = msg.match(/(\d[\d,]+)\s*token\s*(?:context|limit)/i);
  if (tokenCtxMatch) return parseInt(tokenCtxMatch[1].replace(/,/g, ''), 10);

  return undefined;
}

// Keep backward compatibility
export { createGitHubClient as createLLMClient };

/** Fetch available models (backward compat) */
export async function getAvailableModels(db: DatabaseConnection): Promise<UnifiedModel[]> {
  const client = getClientFromDb(db, 'github');
  if (!client) throw new Error('No active LLM client/token available');
  return fetchProviderModels(client, 'github');
}