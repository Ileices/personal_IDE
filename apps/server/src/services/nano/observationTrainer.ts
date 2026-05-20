// ============================================
// Observation Training Hook
// Fire-and-forget: sends (prompt, response) pairs
// to the Nano Sea training endpoint after every LLM call.
// The Nano Sea cannot learn without this data pipe.
// ============================================
import { appConfig } from '../../config.js';

export interface ObservationPayload {
  prompt: string;
  response: string;
  source: 'agent_loop' | 'chat' | 'midwife' | 'fleet';
  timestamp: number;
  metadata?: {
    provider?: string;
    model?: string;
    projectId?: string;
    iterationIndex?: number;
    latencyMs?: number;
  };
}

/**
 * Send a (prompt, response) training pair to the Nano Sea.
 * This is fire-and-forget — the Nano Sea may be stopped while the IDE runs.
 * Errors are swallowed deliberately; training must never block the IDE.
 */
export function observationTrainingHook(payload: ObservationPayload): void {
  // Sanitize — strip secrets before sending to training
  const safePrompt = redactSecrets(payload.prompt);
  const safeResponse = redactSecrets(payload.response);

  const body = JSON.stringify({
    prompt: safePrompt,
    response: safeResponse,
    source: payload.source,
    timestamp: payload.timestamp,
    metadata: payload.metadata ?? {},
  });

  fetch(`${appConfig.services.nanoSeaUrl}/v1/training/observe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(3_000), // 3s max — don't stall on slow nano
  }).catch((err: Error) => {
    // Debug-level only — nano server may be off, that's fine
    console.debug('[nano-observe] skipped:', err.message);
  });
}

// ─── Secret Redaction ───────────────────────────────────────────────────────
// Strip common secret patterns before they hit the training corpus.
// This is a best-effort filter, not a guarantee.
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/ghp_[A-Za-z0-9]{36}/g, '[REDACTED_PAT]'],
  [/gho_[A-Za-z0-9]{36}/g, '[REDACTED_OAUTH]'],
  [/sk-[A-Za-z0-9]{32,64}/g, '[REDACTED_OPENAI_KEY]'],
  [/Bearer\s+[A-Za-z0-9\-_.]+/gi, 'Bearer [REDACTED]'],
  [/Authorization:\s*[^\s\n]+/gi, 'Authorization: [REDACTED]'],
  [/api[_-]?key[=:]\s*["']?[A-Za-z0-9\-_.]{16,}/gi, 'api_key=[REDACTED]'],
  [/password[=:]\s*["']?[^\s\n"']+/gi, 'password=[REDACTED]'],
  [/secret[=:]\s*["']?[^\s\n"']+/gi, 'secret=[REDACTED]'],
  // Common env var patterns
  [/([A-Z_]{5,}_KEY|[A-Z_]{5,}_TOKEN|[A-Z_]{5,}_SECRET)\s*=\s*["']?[^\s\n"']+/g, '$1=[REDACTED]'],
];

export function redactSecrets(text: string): string {
  let result = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}