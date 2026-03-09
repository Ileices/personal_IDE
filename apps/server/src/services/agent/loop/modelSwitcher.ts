// ============================================
// Model Switcher — Extracted from enhancedLoop.ts
// Handles model switching with provider sync,
// context window updates, and rate limit fallback
// chain management.
// ============================================
import { getModel, extractProviderFromModelId } from '@personal-ide/shared';
import type { ProviderType } from '@personal-ide/shared';

type EmitFn = (event: any) => void;

export interface ModelSwitchResult {
  newModel: string;
  newProvider: ProviderType;
  newContextWindow: number;
}

/**
 * Switch to a different model, automatically syncing the provider if the model
 * belongs to a different provider (e.g., switching from openai/gpt-4.1 to gemini/gemini-2.5-flash
 * also switches provider from 'github' to 'gemini').
 * This prevents the critical bug where getClientFromDb() creates a client for the wrong provider.
 */
export function switchModel(
  currentModel: string,
  currentProvider: ProviderType,
  currentContextWindow: number,
  newModelId: string,
  reason: string,
  emit: EmitFn,
): ModelSwitchResult {
  const previousModel = currentModel;
  const previousProvider = currentProvider;

  // Sync provider from model ID prefix
  const newProvider = extractProviderFromModelId(newModelId) as ProviderType;
  if (newProvider !== currentProvider) {
    emit({
      type: 'provider_switch',
      from: previousProvider,
      to: newProvider,
      reason: 'Model ' + newModelId + ' requires provider ' + newProvider,
    });
  }

  // Sync context window
  const modelDef = getModel(newModelId);
  const newContextWindow = modelDef?.maxInputTokens || currentContextWindow;

  emit({
    type: 'model_switch',
    from: previousModel,
    to: newModelId,
    provider: newProvider,
    contextWindow: newContextWindow,
    reason,
  });

  return {
    newModel: newModelId,
    newProvider,
    newContextWindow,
  };
}

/**
 * Handle a 404 error — model not found. Blacklist and find a fallback.
 * Returns the fallback model ID or null if none available.
 */
export function handle404ModelNotFound(
  currentModel: string,
  fallbackModels: string[] | undefined,
  rateLimiter: {
    markDead: (m: string) => void;
    isDead: (m: string) => boolean;
    findFallback: (m: string, caller: string, chain?: string[]) => string | null;
  },
  emit: EmitFn,
): string | null {
  emit({
    type: 'info',
    message: '404: Model "' + currentModel + '" not found. Blacklisting and switching to fallback...',
  });

  // Mark this model as dead so it's never picked again during this session
  rateLimiter.markDead(currentModel);

  const fallback = rateLimiter.findFallback(currentModel, 'agent', fallbackModels);
  if (fallback) {
    emit({
      type: 'auto_answer',
      question: 'Model not found: ' + currentModel,
      answer: 'Switching to ' + fallback,
    });
    return fallback;
  }

  // Last resort: pick a guaranteed-working model
  const lastResort = 'openai/gpt-4.1-mini';
  if (!rateLimiter.isDead(lastResort)) {
    emit({ type: 'info', message: 'No fallback available. Last resort: ' + lastResort });
    return lastResort;
  }

  return null; // All models dead
}

/**
 * Handle a 429/403 rate limit error. Find a fallback or compute wait time.
 * Returns { fallback, waitMs } — one of them will be non-null.
 */
export function handleRateLimit(
  currentModel: string,
  statusCode: number,
  fallbackModels: string[] | undefined,
  rateLimiter: {
    canRequest: (m: string, caller?: string) => { allowed: boolean; reason?: string; retryAfterMs?: number; fallbackModel?: string | null };
    findFallback: (m: string, caller: string, chain?: string[]) => string | null;
  },
  emit: EmitFn,
): { fallback: string | null; waitMs: number } {
  const check = rateLimiter.canRequest(currentModel);
  emit({
    type: 'info',
    message: `Rate limited (${statusCode}): ${check.reason || 'backing off'}`,
  });

  const fallback = check.fallbackModel
    || rateLimiter.findFallback(currentModel, 'agent', fallbackModels);

  if (fallback) {
    emit({
      type: 'auto_answer',
      question: 'Rate limited on ' + currentModel,
      answer: 'Switching to ' + fallback,
    });
    return { fallback, waitMs: 0 };
  }

  return { fallback: null, waitMs: check.retryAfterMs || 30000 };
}

/**
 * Periodic check: try to switch back to the original model if rate limit has reset.
 * Returns true if a switch back should happen.
 */
export function shouldResetToOriginalModel(
  currentModel: string,
  originalModel: string,
  lastResetCheck: number,
  resetIntervalMs: number,
  rateLimiter: {
    canRequest: (m: string, caller?: string) => { allowed: boolean };
  },
): boolean {
  if (currentModel === originalModel) return false;
  if (Date.now() - lastResetCheck < resetIntervalMs) return false;

  const check = rateLimiter.canRequest(originalModel, 'agent');
  return check.allowed;
}
