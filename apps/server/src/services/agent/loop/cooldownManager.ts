// ============================================
// Cooldown & Rate-Limit Manager
// Extracted to subfolder for <1000 LOC compliance.
//
// Centralizes: inter-iteration cooldowns, model
// rotation with original-model restoration,
// provider-aware retry delays, and fleet-safe
// per-user throttling integration.
//
// Inspired by Anthropic's claude-code agent
// architecture: structured retry with
// timestamp-based backoff expiry, original model
// restoration after rate-limit windows reset.
// ============================================
import { getModel } from '@personal-ide/shared';
import { rateLimiter, type AcquireResult } from '../../llm/rateLimiter.js';

type EmitFn = (event: any) => void;

/** Result of a pre-call rate-limit check */
export interface CooldownCheckResult {
  /** Can we proceed with the LLM call? */
  proceed: boolean;
  /** Did we switch models? */
  modelSwitched: boolean;
  /** The model to use (may differ from input if fallback was needed) */
  activeModel: string;
  /** Updated context window for the active model */
  contextWindow: number;
  /** If we can't proceed, how long to wait (ms) */
  waitMs?: number;
  /** Human-readable reason for cooldown */
  reason?: string;
}

/**
 * Check rate limits and manage model fallback before an LLM call.
 *
 * Key improvements over the inline logic:
 * - Periodically attempts to restore the original (preferred) model
 * - Updates contextWindow when switching models
 * - Emits structured events for the frontend dashboard
 */
export function checkRateLimitAndFallback(
  currentModel: string,
  originalModel: string,
  currentContextWindow: number,
  lastModelResetCheck: number,
  fallbackModels: string[] | undefined,
  continuousMode: boolean,
  emit: EmitFn,
): CooldownCheckResult & { lastModelResetCheck: number } {
  const now = Date.now();
  let activeModel = currentModel;
  let contextWindow = currentContextWindow;
  let modelSwitched = false;
  let updatedResetCheck = lastModelResetCheck;

  // ── Try to restore original model every 2 minutes ──
  if (activeModel !== originalModel && now - lastModelResetCheck > 120_000) {
    updatedResetCheck = now;
    const originalCheck = rateLimiter.canRequest(originalModel, 'agent');
    if (originalCheck.allowed) {
      emit({ type: 'info', message: 'Rate limit window reset — restoring primary model: ' + originalModel });
      activeModel = originalModel;
      const origDef = getModel(originalModel);
      if (origDef) contextWindow = origDef.maxInputTokens;
      modelSwitched = true;
    }
  }

  // ── Standard rate-limit check ──
  const canProceed = rateLimiter.canRequest(activeModel, 'agent');
  if (canProceed.allowed) {
    return {
      proceed: true,
      modelSwitched,
      activeModel,
      contextWindow,
      lastModelResetCheck: updatedResetCheck,
    };
  }

  // ── Rate limited — try fallback ──
  const fallback = canProceed.fallbackModel
    || rateLimiter.findFallback(activeModel, 'agent', fallbackModels);

  if (fallback) {
    emit({
      type: 'auto_answer',
      question: 'Rate limited on ' + activeModel,
      answer: 'Switching to ' + fallback,
    });
    activeModel = fallback;
    const fbDef = getModel(fallback);
    if (fbDef) contextWindow = fbDef.maxInputTokens;
    return {
      proceed: true,
      modelSwitched: true,
      activeModel,
      contextWindow,
      lastModelResetCheck: updatedResetCheck,
    };
  }

  // ── No fallback — must wait ──
  const waitMs = canProceed.retryAfterMs || (continuousMode ? 60_000 : 30_000);
  return {
    proceed: false,
    modelSwitched: false,
    activeModel,
    contextWindow,
    waitMs,
    reason: canProceed.reason || 'Rate limited, no fallback available',
    lastModelResetCheck: updatedResetCheck,
  };
}

/**
 * Calculate the appropriate delay between iterations.
 * Uses adaptive cooldown: increases delay when rate-limited,
 * decreases back to configured minimum on successful calls.
 */
export function calculateAdaptiveCooldown(
  configuredCooldownMs: number,
  consecutiveRateLimits: number,
): number {
  if (consecutiveRateLimits === 0) return configuredCooldownMs;
  // Exponential increase capped at 5 minutes
  const adaptive = Math.min(
    configuredCooldownMs * Math.pow(1.5, consecutiveRateLimits),
    300_000,
  );
  return Math.max(configuredCooldownMs, adaptive);
}

/**
 * Extract rate-limit headers from an OpenAI SDK error response.
 * The SDK attaches headers differently depending on the error type.
 */
export function extractErrorHeaders(err: any): Record<string, string> | undefined {
  const errorHeaders = err?.headers || err?.error?.headers || err?.response?.headers;
  if (!errorHeaders) return undefined;

  const parsed: Record<string, string> = {};
  const keys = ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'retry-after'];
  for (const key of keys) {
    const val = typeof errorHeaders.get === 'function' ? errorHeaders.get(key) : errorHeaders[key];
    if (val) parsed[key] = String(val);
  }
  return Object.keys(parsed).length > 0 ? parsed : undefined;
}
