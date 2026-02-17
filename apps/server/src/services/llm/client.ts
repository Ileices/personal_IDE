// ============================================
// LLM Client - OpenAI SDK → GitHub Models API
// ============================================
import OpenAI from 'openai';

/** Create an OpenAI client pointed at GitHub Models */
export function createLLMClient(token: string): OpenAI {
  return new OpenAI({
    baseURL: 'https://models.github.ai/inference',
    apiKey: token,
  });
}

/** Get the active token's LLM client */
export function getClientFromDb(db: any): OpenAI | null {
  const row = db.prepare('SELECT token_encrypted FROM auth_tokens WHERE is_active = 1').get() as any;
  if (!row) return null;

  // Decrypt token (same XOR as auth routes)
  const key = 'personal-ide-local-key-2026';
  const buf = Buffer.from(row.token_encrypted, 'base64');
  const token = Array.from(buf).map((b: number, i: number) => String.fromCharCode(b ^ key.charCodeAt(i % key.length))).join('');

  return createLLMClient(token);
}

// Simple in-memory cache for available models to avoid frequent API calls
let _modelsCache: { ts: number; models: any[] } | null = null;
const MODELS_TTL_MS = 60 * 1000; // 60s cache

/**
 * Fetch available models from the LLM provider (GitHub Models API).
 * Falls back to throwing if no client is available.
 */
export async function getAvailableModels(db: any): Promise<any[]> {
  const now = Date.now();
  if (_modelsCache && now - _modelsCache.ts < MODELS_TTL_MS) return _modelsCache.models;

  const client = getClientFromDb(db);
  if (!client) throw new Error('No active LLM client/token available');

  try {
    // openai client models.list() should map to GitHub Models API when baseURL is overridden
    // The SDK may return an iterator or a response object depending on version; normalize.
    const res: any = await (client as any).models.list();
    // Normalize to array of model descriptors
    const models = Array.isArray(res?.data) ? res.data : (res?.models || res || []);
    _modelsCache = { ts: now, models };
    return models;
  } catch (err) {
    // Do not poison cache on error; rethrow to allow caller to fallback
    throw err;
  }
}
