// ============================================
// Per-User Rate Limiter — IP + User bucketed request throttling
//
// Layered on top of the model-level ProductionRateLimiter.
// This prevents a single user/IP from monopolizing shared capacity.
//
// Buckets:
//   - Per-IP: sliding window, max N requests / minute
//   - Per-User (github_user_id): sliding window, max M requests / minute
//   - Global abuse detection: flag IPs with repeated 429s
// ============================================

interface UserBucket {
  /** Timestamps of recent requests (sliding window) */
  timestamps: number[];
  /** Consecutive 429 failures from this bucket */
  abuseScore: number;
  /** If set, requests are blocked until this epoch ms */
  blockedUntil: number;
}

interface UserRateLimiterConfig {
  /** Max requests per IP per minute */
  ipRequestsPerMinute: number;
  /** Max requests per authenticated user per minute */
  userRequestsPerMinute: number;
  /** Max requests per IP per day */
  ipRequestsPerDay: number;
  /** Max requests per user per day */
  userRequestsPerDay: number;
  /** After this many rapid 429s, temporarily block the bucket */
  abuseThreshold: number;
  /** Duration (ms) to block an abusive bucket */
  abuseBlockMs: number;
  /** Sliding window duration for minute counts */
  windowMs: number;
  /** Sliding window duration for daily counts */
  dayWindowMs: number;
}

export interface UserAcquireResult {
  allowed: boolean;
  reason?: string;
  retryAfterMs?: number;
}

const DEFAULT_CONFIG: UserRateLimiterConfig = {
  ipRequestsPerMinute: 60,
  userRequestsPerMinute: 40,
  ipRequestsPerDay: 5000,
  userRequestsPerDay: 3000,
  abuseThreshold: 10,
  abuseBlockMs: 5 * 60_000, // 5 minutes
  windowMs: 60_000,
  dayWindowMs: 86_400_000,
};

class UserRateLimiter {
  private ipBuckets = new Map<string, UserBucket>();
  private userBuckets = new Map<string, UserBucket>();
  private config: UserRateLimiterConfig;
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(config: Partial<UserRateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    // Clean up old entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60_000);
  }

  /**
   * Check if a request from this IP / user is allowed.
   * @param ip — Client IP address (from req.ip or X-Forwarded-For)
   * @param userId — Optional authenticated user ID (e.g. github_user_id)
   */
  acquire(ip: string, userId?: string): UserAcquireResult {
    const now = Date.now();

    // ── 1. Check IP bucket ──
    const ipResult = this.checkBucket(
      this.getOrCreateBucket(this.ipBuckets, ip),
      this.config.ipRequestsPerMinute,
      this.config.ipRequestsPerDay,
      now,
    );
    if (!ipResult.allowed) {
      return { allowed: false, reason: `IP rate limit: ${ipResult.reason}`, retryAfterMs: ipResult.retryAfterMs };
    }

    // ── 2. Check user bucket (if authenticated) ──
    if (userId) {
      const userResult = this.checkBucket(
        this.getOrCreateBucket(this.userBuckets, userId),
        this.config.userRequestsPerMinute,
        this.config.userRequestsPerDay,
        now,
      );
      if (!userResult.allowed) {
        return { allowed: false, reason: `User rate limit: ${userResult.reason}`, retryAfterMs: userResult.retryAfterMs };
      }
    }

    // ── 3. Record the request ──
    this.recordRequest(this.ipBuckets, ip, now);
    if (userId) this.recordRequest(this.userBuckets, userId, now);

    return { allowed: true };
  }

  /** Record a 429 from the upstream LLM for abuse tracking */
  recordUpstream429(ip: string, userId?: string): void {
    const ipBucket = this.ipBuckets.get(ip);
    if (ipBucket) {
      ipBucket.abuseScore++;
      if (ipBucket.abuseScore >= this.config.abuseThreshold) {
        ipBucket.blockedUntil = Date.now() + this.config.abuseBlockMs;
        ipBucket.abuseScore = 0; // Reset after blocking
      }
    }
    if (userId) {
      const userBucket = this.userBuckets.get(userId);
      if (userBucket) {
        userBucket.abuseScore++;
        if (userBucket.abuseScore >= this.config.abuseThreshold) {
          userBucket.blockedUntil = Date.now() + this.config.abuseBlockMs;
          userBucket.abuseScore = 0;
        }
      }
    }
  }

  /** Get status for monitoring/dashboard */
  getStatus(): { ipBucketCount: number; userBucketCount: number; blockedIps: string[]; blockedUsers: string[] } {
    const now = Date.now();
    const blockedIps: string[] = [];
    const blockedUsers: string[] = [];
    for (const [ip, b] of this.ipBuckets) {
      if (b.blockedUntil > now) blockedIps.push(ip);
    }
    for (const [uid, b] of this.userBuckets) {
      if (b.blockedUntil > now) blockedUsers.push(uid);
    }
    return {
      ipBucketCount: this.ipBuckets.size,
      userBucketCount: this.userBuckets.size,
      blockedIps,
      blockedUsers,
    };
  }

  // ── Internal ──

  private checkBucket(
    bucket: UserBucket,
    perMinuteLimit: number,
    perDayLimit: number,
    now: number,
  ): UserAcquireResult {
    // Abuse block
    if (bucket.blockedUntil > now) {
      return {
        allowed: false,
        reason: `Temporarily blocked for abuse — unblocked in ${Math.ceil((bucket.blockedUntil - now) / 1000)}s`,
        retryAfterMs: bucket.blockedUntil - now,
      };
    }

    // Prune old timestamps
    const windowStart = now - this.config.windowMs;
    const dayStart = now - this.config.dayWindowMs;
    bucket.timestamps = bucket.timestamps.filter(t => t > dayStart);

    const minuteCount = bucket.timestamps.filter(t => t > windowStart).length;
    const dayCount = bucket.timestamps.length;

    if (minuteCount >= perMinuteLimit) {
      return {
        allowed: false,
        reason: `${minuteCount}/${perMinuteLimit} per minute`,
        retryAfterMs: this.config.windowMs - (now - (bucket.timestamps.find(t => t > windowStart) || now)),
      };
    }
    if (dayCount >= perDayLimit) {
      return {
        allowed: false,
        reason: `${dayCount}/${perDayLimit} per day`,
        retryAfterMs: 60_000,
      };
    }
    return { allowed: true };
  }

  private getOrCreateBucket(map: Map<string, UserBucket>, key: string): UserBucket {
    let b = map.get(key);
    if (!b) {
      b = { timestamps: [], abuseScore: 0, blockedUntil: 0 };
      map.set(key, b);
    }
    return b;
  }

  private recordRequest(map: Map<string, UserBucket>, key: string, now: number): void {
    const b = this.getOrCreateBucket(map, key);
    b.timestamps.push(now);
  }

  private cleanup(): void {
    const cutoff = Date.now() - this.config.dayWindowMs;
    for (const [key, bucket] of this.ipBuckets) {
      bucket.timestamps = bucket.timestamps.filter(t => t > cutoff);
      if (bucket.timestamps.length === 0 && bucket.blockedUntil < Date.now()) {
        this.ipBuckets.delete(key);
      }
    }
    for (const [key, bucket] of this.userBuckets) {
      bucket.timestamps = bucket.timestamps.filter(t => t > cutoff);
      if (bucket.timestamps.length === 0 && bucket.blockedUntil < Date.now()) {
        this.userBuckets.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}

/** Global per-user rate limiter singleton */
export const userRateLimiter = new UserRateLimiter();
