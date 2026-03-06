// ============================================
// Production Rate Limiter for GitHub Copilot Models
// Ported from prototypes/github_api_limit_prototype
//
// Implements:
// - Primary rate limits (per-minute, per-day) from response headers
// - Secondary rate limits (concurrent, points/min, content creation)
// - Exponential backoff with retry-after header support
// - Safety margin to avoid hitting hard limits
// - Acquire/release pattern for clean request lifecycle
// - Automatic model fallback when rate limited
// ============================================
import { MODELS, RATE_LIMITS, type ModelTier, type RateLimits } from '@personal-ide/shared';

// ── Primary Rate Limit State ──
// Tracks the per-model limits from API response headers + local counting

interface PrimaryLimitState {
  /** Server-reported limit (from x-ratelimit-limit) */
  serverLimit: number | null;
  /** Server-reported remaining (from x-ratelimit-remaining) */
  serverRemaining: number | null;
  /** Server-reported reset time (epoch seconds, from x-ratelimit-reset) */
  serverResetTime: number;
  /** Our local request counts as fallback */
  minuteCount: number;
  minuteReset: number;
  dailyCount: number;
  dailyReset: number;
  concurrent: number;
}

// ── Secondary Rate Limit State ──
// Protects against GitHub's secondary limits (abuse detection)

interface SecondaryLimitState {
  /** Exponential backoff (doubles on each 429/403, resets on success) */
  backoffMs: number;
  maxBackoffMs: number;
  consecutiveFailures: number;
  maxRetries: number;
  /** Retry-after value from response header */
  retryAfterUntil: number;
  /** Points consumed in the last 60 seconds (mutative = 5pts, read = 1pt) */
  pointsWindow: { time: number; points: number }[];
}

// ── Acquire Result ──

export interface AcquireResult {
  allowed: boolean;
  reason?: string;
  retryAfterMs?: number;
  /** If rate limited, suggested fallback model */
  fallbackModel?: string | null;
}

// ── Rate Limit Response Info ──
// Extracted from LLM API responses

export interface RateLimitResponseInfo {
  statusCode?: number;
  headers?: Record<string, string>;
  /** Was this a successful completion? */
  success?: boolean;
}

// ── Main Rate Limiter ──

class ProductionRateLimiter {
  private primary = new Map<string, PrimaryLimitState>();
  private secondary = new Map<string, SecondaryLimitState>();
  private globalConcurrent = 0;
  private maxGlobalConcurrent = 5;

  // Safety margin: stop when remaining falls to this % of limit
  private safetyMarginPercent = 10;

  // ────────────────────────────────────
  //  Public API  (backward-compatible)
  // ────────────────────────────────────

  /**
   * Check if a request can proceed. Does NOT consume quota.
   * Call recordStart() separately when actually making the request.
   */
  canRequest(modelId: string, mode?: string): AcquireResult {
    const limits = this.getLimitsForModel(modelId);
    if (!limits) {
      // Unknown model — allow but no tracking (Ollama, custom endpoints, etc.)
      return { allowed: true };
    }

    const p = this.getPrimary(modelId);
    const s = this.getSecondary(modelId);
    const now = Date.now();

    // 1. Retry-after from server (highest priority)
    if (s.retryAfterUntil > now) {
      const waitMs = s.retryAfterUntil - now;
      return {
        allowed: false,
        reason: `Server retry-after: wait ${Math.ceil(waitMs / 1000)}s`,
        retryAfterMs: waitMs,
        fallbackModel: this.findFallback(modelId, mode),
      };
    }

    // 2. Exponential backoff active — uses timestamp-based expiry so it
    //    naturally decays even without a successful call to reset it.
    if (s.consecutiveFailures > 0 && s.backoffMs > 0) {
      const backoffExpiry = s.retryAfterUntil || 0;
      // Only block if the backoff window hasn't expired yet
      if (backoffExpiry > now) {
        const waitMs = backoffExpiry - now;
        return {
          allowed: false,
          reason: `Backoff: ${s.consecutiveFailures} consecutive failures, wait ${Math.ceil(waitMs / 1000)}s`,
          retryAfterMs: waitMs,
          fallbackModel: this.findFallback(modelId, mode),
        };
      }
      // Backoff window expired — allow through (will be cleared on success by recordEnd)
    }

    // 3. Max retries exceeded — hard stop, wait for full cooldown
    if (s.consecutiveFailures >= s.maxRetries) {
      return {
        allowed: false,
        reason: `Max retries (${s.maxRetries}) exceeded — model is rate limited`,
        retryAfterMs: 60_000,
        fallbackModel: this.findFallback(modelId, mode),
      };
    }

    // 4. Server-reported remaining exhausted
    if (p.serverRemaining !== null && p.serverRemaining <= 0) {
      const resetWait = Math.max(0, p.serverResetTime * 1000 - now);
      if (resetWait > 0) {
        return {
          allowed: false,
          reason: `Server limit exhausted — resets in ${Math.ceil(resetWait / 1000)}s`,
          retryAfterMs: resetWait,
          fallbackModel: this.findFallback(modelId, mode),
        };
      }
    }

    // 5. Safety margin on server-reported limits
    if (p.serverLimit !== null && p.serverRemaining !== null) {
      const threshold = Math.ceil(p.serverLimit * this.safetyMarginPercent / 100);
      if (p.serverRemaining <= threshold) {
        const resetWait = Math.max(0, p.serverResetTime * 1000 - now);
        return {
          allowed: false,
          reason: `Safety margin: ${p.serverRemaining}/${p.serverLimit} remaining (threshold ${threshold})`,
          retryAfterMs: Math.min(resetWait || 30_000, 60_000),
          fallbackModel: this.findFallback(modelId, mode),
        };
      }
    }

    // 6. Local counting fallback (when no server headers available)
    this.resetWindowsIfNeeded(p, now);

    if (p.concurrent >= limits.maxConcurrent) {
      return { allowed: false, reason: `Max concurrent (${limits.maxConcurrent}) reached`, retryAfterMs: 5_000 };
    }
    if (p.minuteCount >= limits.requestsPerMinute) {
      return {
        allowed: false,
        reason: `Minute limit (${limits.requestsPerMinute}/min) reached`,
        retryAfterMs: Math.max(1000, p.minuteReset - now),
        fallbackModel: this.findFallback(modelId, mode),
      };
    }
    if (p.dailyCount >= limits.requestsPerDay) {
      return {
        allowed: false,
        reason: `Daily limit (${limits.requestsPerDay}/day) reached`,
        retryAfterMs: Math.max(1000, p.dailyReset - now),
        fallbackModel: this.findFallback(modelId, mode),
      };
    }

    // 7. Global concurrent
    if (this.globalConcurrent >= this.maxGlobalConcurrent) {
      return { allowed: false, reason: 'Global concurrent limit reached', retryAfterMs: 2_000 };
    }

    // 8. Secondary: points per minute (GitHub caps ~900)
    const pointsUsed = this.getPointsInLastMinute(s, now);
    if (pointsUsed >= 900) {
      return { allowed: false, reason: 'Points/minute limit (900) reached', retryAfterMs: 30_000 };
    }

    return { allowed: true };
  }

  /** Record that a request is starting. Call AFTER canRequest() returns allowed. */
  recordStart(modelId: string): void {
    const p = this.getPrimary(modelId);
    const s = this.getSecondary(modelId);
    const now = Date.now();

    this.resetWindowsIfNeeded(p, now);
    p.minuteCount++;
    p.dailyCount++;
    p.concurrent++;
    this.globalConcurrent++;

    // Record point (1 point for a read-like LLM call)
    s.pointsWindow.push({ time: now, points: 1 });
    // Prune old entries outside the window
    s.pointsWindow = s.pointsWindow.filter(e => now - e.time < 60_000);
  }

  /**
   * Record that a request completed. Updates state from response headers.
   * This is the KEY improvement — we read ACTUAL limits from GitHub's
   * response headers instead of guessing with local counters.
   */
  recordEnd(modelId: string, info?: RateLimitResponseInfo): void {
    const p = this.getPrimary(modelId);
    const s = this.getSecondary(modelId);

    p.concurrent = Math.max(0, p.concurrent - 1);
    this.globalConcurrent = Math.max(0, this.globalConcurrent - 1);

    if (!info) return;

    // ── Update from response headers (the prototype's core principle) ──
    if (info.headers) {
      const h = info.headers;

      // Primary limits from headers
      if (h['x-ratelimit-limit']) {
        p.serverLimit = parseInt(h['x-ratelimit-limit'], 10);
      }
      if (h['x-ratelimit-remaining']) {
        p.serverRemaining = parseInt(h['x-ratelimit-remaining'], 10);
      }
      if (h['x-ratelimit-reset']) {
        p.serverResetTime = parseFloat(h['x-ratelimit-reset']);
      }

      // Retry-after header (sent with 429 responses)
      if (h['retry-after']) {
        const retryAfter = parseInt(h['retry-after'], 10);
        if (!isNaN(retryAfter)) {
          s.retryAfterUntil = Date.now() + retryAfter * 1000;
        }
      }
    }

    // ── Handle error status codes ──
    if (info.statusCode === 429 || info.statusCode === 403) {
      // Rate limited — increase exponential backoff
      s.consecutiveFailures++;
      s.backoffMs = Math.min(
        Math.max(s.backoffMs * 2, 1000),   // start at 1s, doubling
        s.maxBackoffMs                      // capped at 5 min
      );

      // Always set a timestamp-based expiry so the backoff naturally decays
      const backoffExpiry = Date.now() + s.backoffMs;
      // Use the later of server retry-after or our calculated backoff
      if (s.retryAfterUntil <= Date.now()) {
        s.retryAfterUntil = backoffExpiry;
      } else {
        s.retryAfterUntil = Math.max(s.retryAfterUntil, backoffExpiry);
      }
    } else if (info.success || (info.statusCode && info.statusCode >= 200 && info.statusCode < 300)) {
      // Success — reset backoff state entirely
      s.consecutiveFailures = 0;
      s.backoffMs = 0;
    }
  }

  /** Get full status for all models (for the dashboard / status route) */
  getAllStatus(): Record<string, { usage: any; limits: RateLimits; tier: ModelTier }> {
    const result: Record<string, any> = {};
    for (const model of MODELS) {
      const p = this.getPrimary(model.id);
      const s = this.getSecondary(model.id);
      this.resetWindowsIfNeeded(p, Date.now());

      result[model.id] = {
        usage: {
          minuteCount: p.minuteCount,
          minuteReset: p.minuteReset,
          dailyCount: p.dailyCount,
          dailyReset: p.dailyReset,
          concurrent: p.concurrent,
          // Server-reported values (most accurate)
          serverRemaining: p.serverRemaining,
          serverLimit: p.serverLimit,
          serverResetTime: p.serverResetTime,
          // Backoff state
          backoffMs: s.backoffMs,
          consecutiveFailures: s.consecutiveFailures,
        },
        limits: RATE_LIMITS[model.tier],
        tier: model.tier,
      };
    }
    return result;
  }

  /** Find a fallback model that isn't rate limited — picks the model with
   *  the most remaining headroom so we naturally round-robin through capacity.
   *  If an ordered fallback chain is provided, prefer that order first. */
  findFallback(preferredModelId: string, mode?: string, orderedFallbacks?: string[]): string | null {
    const preferred = MODELS.find(m => m.id === preferredModelId);
    if (!preferred) return null;

    // If caller provides an explicit fallback chain (midwife / agent config), try those in order first
    if (orderedFallbacks?.length) {
      for (const fbId of orderedFallbacks) {
        if (fbId === preferredModelId) continue;
        const check = this.canRequest(fbId);
        if (check.allowed) return fbId;
      }
    }

    // Score each candidate by remaining capacity headroom
    const candidates = MODELS
      .filter(m => m.id !== preferredModelId && (!mode || m.recommendedFor.includes(mode as any)));

    const scored = candidates.map(m => {
      const p = this.primary.get(m.id);
      const limits = this.getLimitsForModel(m.id);
      let score = 0;

      if (p && limits) {
        // Remaining minute headroom (higher = better)
        const minuteUsed = p.serverRemaining != null
          ? (p.serverLimit || limits.requestsPerMinute) - p.serverRemaining
          : p.minuteCount;
        const minuteCapacity = limits.requestsPerMinute;
        score += (minuteCapacity - minuteUsed) * 10; // weight minute capacity highly

        // Remaining daily headroom
        const dailyCapacity = limits.requestsPerDay;
        score += (dailyCapacity - p.dailyCount);

        // Prefer same publisher (slight bonus)
        if (m.publisher === preferred.publisher) score += 5;
      } else {
        // No usage data yet — assume full capacity
        score = limits ? (limits.requestsPerMinute * 10 + limits.requestsPerDay) : 100;
        if (m.publisher === preferred.publisher) score += 5;
      }

      return { model: m, score };
    });

    // Sort by score descending (most headroom first)
    scored.sort((a, b) => b.score - a.score);

    for (const { model: candidate } of scored) {
      const check = this.canRequest(candidate.id);
      if (check.allowed) return candidate.id;
    }

    return null;
  }

  // ────────────────────────────────────
  //  Internal Helpers
  // ────────────────────────────────────

  private getLimitsForModel(modelId: string): RateLimits | null {
    const model = MODELS.find(m => m.id === modelId);
    if (!model) return null;
    return RATE_LIMITS[model.tier];
  }

  private getPrimary(modelId: string): PrimaryLimitState {
    let p = this.primary.get(modelId);
    if (!p) {
      const now = Date.now();
      p = {
        serverLimit: null,
        serverRemaining: null,
        serverResetTime: 0,
        minuteCount: 0,
        minuteReset: now + 60_000,
        dailyCount: 0,
        dailyReset: now + 86_400_000,
        concurrent: 0,
      };
      this.primary.set(modelId, p);
    }
    return p;
  }

  private getSecondary(modelId: string): SecondaryLimitState {
    let s = this.secondary.get(modelId);
    if (!s) {
      s = {
        backoffMs: 0,
        maxBackoffMs: 300_000,   // 5 minutes max backoff
        consecutiveFailures: 0,
        maxRetries: 5,
        retryAfterUntil: 0,
        pointsWindow: [],
      };
      this.secondary.set(modelId, s);
    }
    return s;
  }

  private resetWindowsIfNeeded(p: PrimaryLimitState, now: number): void {
    if (now > p.minuteReset) {
      p.minuteCount = 0;
      p.minuteReset = now + 60_000;
    }
    if (now > p.dailyReset) {
      p.dailyCount = 0;
      p.dailyReset = now + 86_400_000;
    }
  }

  private getPointsInLastMinute(s: SecondaryLimitState, now: number): number {
    return s.pointsWindow
      .filter(e => now - e.time < 60_000)
      .reduce((sum, e) => sum + e.points, 0);
  }
}

export const rateLimiter = new ProductionRateLimiter();
