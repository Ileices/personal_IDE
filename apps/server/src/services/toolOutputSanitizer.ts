// ============================================
// Tool Output Sanitizer — Prompt Injection Protection
//
// Per Discussion #112 Sprint 4, Phase 7.
// All external text (web scrapes, community posts, GitHub issues,
// file contents from untrusted sources, etc.) MUST pass through
// sanitizeExternalText() before being inserted into LLM prompts.
//
// Detected injection attempts are logged to injection_attempts
// (forensic append-only table, Migration 117).
// ============================================
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';

// ── Injection patterns to detect and strip ──

interface InjectionPattern {
  name: string;
  regex: RegExp;
  severity: 'high' | 'medium' | 'low';
}

const INJECTION_PATTERNS: InjectionPattern[] = [
  // Direct instruction override attempts
  { name: 'ignore_previous', regex: /ignore\s+(previous|all|prior)\s+instructions?/gi, severity: 'high' },
  { name: 'disregard_above', regex: /disregard\s+(above|previous|all)\s+instructions?/gi, severity: 'high' },
  { name: 'new_instructions', regex: /new\s+instructions?:/gi, severity: 'high' },
  { name: 'you_are_now', regex: /you\s+are\s+now\s+(a|an|the)\s+/gi, severity: 'high' },
  { name: 'act_as', regex: /act\s+as\s+(a|an|the)\s+/gi, severity: 'medium' },
  { name: 'pretend_to_be', regex: /pretend\s+to\s+be\s+/gi, severity: 'medium' },
  { name: 'system_colon', regex: /^system\s*:/gim, severity: 'high' },
  { name: 'system_tag', regex: /<\s*system\s*>[\s\S]*?<\s*\/\s*system\s*>/gi, severity: 'high' },
  { name: 'assistant_tag', regex: /<\s*assistant\s*>[\s\S]*?<\s*\/\s*assistant\s*>/gi, severity: 'high' },
  { name: 'human_tag', regex: /<\s*human\s*>[\s\S]*?<\s*\/\s*human\s*>/gi, severity: 'medium' },
  { name: 'jailbreak_dan', regex: /do\s+anything\s+now|jailbreak|DAN\s+mode/gi, severity: 'high' },
  { name: 'reveal_prompt', regex: /(reveal|print|show|repeat|output|display)\s+(the\s+)?(system\s+prompt|instructions?|context)/gi, severity: 'high' },
  { name: 'override_safety', regex: /override\s+(safety|restrictions?|guidelines?|limits?)/gi, severity: 'high' },
  // Encoding attacks
  { name: 'base64_large', regex: /[A-Za-z0-9+/]{200,}={0,2}/g, severity: 'medium' },
  // Indirect injection via markdown
  { name: 'hidden_instructions', regex: /<!--[\s\S]{0,500}?instructions?[\s\S]{0,500}?-->/gi, severity: 'medium' },
  // Token stuffing
  { name: 'prompt_delimiter', regex: /###\s*(SYSTEM|ASSISTANT|HUMAN|INSTRUCTION|PROMPT)\s*###/gi, severity: 'high' },
  { name: 'role_boundary', regex: /\[INST\]|\[\/INST\]|<\|im_start\|>|<\|im_end\|>|\[SYS\]|\[\/SYS\]/g, severity: 'high' },
];

// ── Sanitize function ─────────────────────────

export interface SanitizeResult {
  sanitized: string;
  injectionDetected: boolean;
  patternsMatched: string[];
  originalLength: number;
  sanitizedLength: number;
}

/**
 * Sanitize external text before inserting into LLM prompts.
 * Strips injection patterns and wraps in safe delimiters.
 */
export function sanitizeExternalText(
  input: string,
  options: {
    source?: string;
    db?: any;
    maxLength?: number;
  } = {}
): SanitizeResult {
  const { source = 'external', db, maxLength = 16_000 } = options;

  if (typeof input !== 'string') {
    return {
      sanitized: '[TOOL_OUTPUT_START]\n[EMPTY]\n[TOOL_OUTPUT_END]',
      injectionDetected: false,
      patternsMatched: [],
      originalLength: 0,
      sanitizedLength: 0,
    };
  }

  const originalLength = input.length;
  let sanitized = input;
  const patternsMatched: string[] = [];

  // Truncate to maxLength before scanning (prevents DoS via huge input)
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength) + '\n[TRUNCATED]';
  }

  // Apply all injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.regex.test(sanitized)) {
      patternsMatched.push(pattern.name);
      // Reset regex lastIndex (stateful with /g flag)
      pattern.regex.lastIndex = 0;
      // Replace with safe placeholder
      sanitized = sanitized.replace(pattern.regex, `[${pattern.name.toUpperCase()}_REMOVED]`);
    }
    // Always reset lastIndex after use
    pattern.regex.lastIndex = 0;
  }

  const injectionDetected = patternsMatched.length > 0;

  // Log injection attempts to forensic DB table
  if (injectionDetected && db) {
    try {
      const rawHash = createHash('sha256').update(input.slice(0, 1000)).digest('hex').slice(0, 16);
      db.prepare(`
        INSERT INTO injection_attempts (id, source, pattern_matched, raw_input_hash, sanitized_len, raw_len, context)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        source,
        patternsMatched.join(','),
        rawHash,
        sanitized.length,
        originalLength,
        `patterns: ${patternsMatched.join(', ')}`,
      );
    } catch {
      // DB logging failure must never break the sanitization pipeline
    }
  }

  // Wrap in safe delimiters so the LLM can't confuse this with its instructions
  const wrapped = `[TOOL_OUTPUT_START]\n${sanitized}\n[TOOL_OUTPUT_END]`;

  return {
    sanitized: wrapped,
    injectionDetected,
    patternsMatched,
    originalLength,
    sanitizedLength: wrapped.length,
  };
}

/**
 * Sanitize multiple external texts (e.g., search results array).
 * Returns only the sanitized strings.
 */
export function sanitizeMany(
  inputs: string[],
  options: { source?: string; db?: any; maxLength?: number } = {},
): string[] {
  return inputs.map(i => sanitizeExternalText(i, options).sanitized);
}

/**
 * Quick check: does text contain injection patterns? (no modification)
 */
export function detectInjection(input: string): { detected: boolean; patterns: string[] } {
  const patterns: string[] = [];
  for (const p of INJECTION_PATTERNS) {
    if (p.regex.test(input)) patterns.push(p.name);
    p.regex.lastIndex = 0;
  }
  return { detected: patterns.length > 0, patterns };
}
