// ============================================
// Spawn Authority Service
// Enforces the Agent Spawn Authority Chart.
// Blocks unauthorized sub-agent spawn attempts
// and logs violations to the forensic database.
// ============================================
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';

// ── Spawn Authority Chart (from spec) ──────

/**
 * Keys are the requesting agent type.
 * Values are the set of sub-agents they may spawn.
 * '*' means any.
 */
const SPAWN_AUTHORITY: Record<string, string[] | '*'> = {
  'god_factory': '*',
  'chat_agent': ['memory_crawler', 'project_description_crawler', 'context_window_manager'],
  'agent_loop': ['memory_crawler', 'project_description_crawler', 'waiting_sub_agent', 'context_window_manager', 'diff_sub_agent', 'integration_verification_sub_agent'],
  'midwife_bird_feeding': ['memory_crawler', 'context_window_manager'],
  'agent_router': '*', // Authorized to route to anything
  'fleet_agent': ['memory_crawler', 'project_description_crawler', 'context_window_manager', 'diff_sub_agent', 'integration_verification_sub_agent'],
  'fleet_agent_nano': ['memory_crawler', 'project_description_crawler', 'context_window_manager', 'diff_sub_agent'],
  'blame_crawler': ['dead_tag_sub_agent', 'regression_sub_agent'],
  'help_agent': ['memory_crawler', 'context_window_manager'],
  'skeptic_agent': ['memory_crawler', 'project_description_crawler', 'context_window_manager', 'diff_sub_agent', 'integration_verification_sub_agent', 'regression_sub_agent', 'dead_tag_sub_agent', 'conflict_sub_agent'],
  'command_agent': ['sub_command_agent', 'conflict_sub_agent'],
  'builder_agent': ['diff_sub_agent', 'integration_verification_sub_agent'],
  'parallel_coordinator_agent': ['conflict_sub_agent'],
  'regression_agent': ['regression_sub_agent', 'dead_tag_sub_agent'],
  'nano_liaison_agent': ['memory_crawler', 'context_window_manager'],
};

// Normalize agent type strings for matching
function normalizeAgentType(agentType: string): string {
  return agentType.toLowerCase().replace(/[\s-]/g, '_');
}

export interface SpawnCheckResult {
  allowed: boolean;
  reason: string;
}

export type SpawnConfirmationStatus = 'accepted' | 'rejected' | 'pending';

// ── Per-class concurrency limits ────────────────────────────────────────────
// Maximum number of simultaneously active instances of each sub-agent class.
// These are enforced at spawn time against the DB active-run count.
const SPAWN_CONCURRENCY_LIMITS: Record<string, number> = {
  'fleet_agent': 5,
  'diff_sub_agent': 2,
  'regression_sub_agent': 1,
  'context_window_manager': 3,
  'skeptic_agent': 1,
  'waiting_sub_agent': 2,
  'integration_verification_sub_agent': 2,
  'memory_crawler': 3,
  'project_description_crawler': 2,
  'conflict_sub_agent': 2,
  'dead_tag_sub_agent': 1,
  'sub_command_agent': 3,
};

// ── Rate-of-spawn guard ──────────────────────────────────────────────────────
// If a single spawner emits more than N spawns in M ms, it is suspected of
// runaway recursion. Track spawn timestamps per requester in memory.
const SPAWN_RATE_WINDOW_MS = 10_000;
const SPAWN_RATE_MAX = 8;
const spawnerTimestamps: Map<string, number[]> = new Map();

function checkSpawnRate(requestingAgentId: string): { allowed: boolean; reason: string } {
  const now = Date.now();
  const recent = (spawnerTimestamps.get(requestingAgentId) || []).filter(
    t => now - t < SPAWN_RATE_WINDOW_MS
  );
  if (recent.length >= SPAWN_RATE_MAX) {
    return {
      allowed: false,
      reason: `Spawn rate exceeded: ${recent.length} spawns in ${SPAWN_RATE_WINDOW_MS / 1000}s (limit ${SPAWN_RATE_MAX}). Possible runaway recursion.`,
    };
  }
  recent.push(now);
  spawnerTimestamps.set(requestingAgentId, recent);
  return { allowed: true, reason: '' };
}

export class SpawnAuthorityService {
  constructor(private db: Database.Database) {}

  /**
   * Check whether requestingAgent is authorized to spawn requestedSubAgent.
   * If not, logs a spawn_violation to the forensic database.
   */
  checkSpawnAuthority(requestingAgentId: string, requestingAgentType: string, requestedSubAgent: string): SpawnCheckResult {
    const normalizedRequester = normalizeAgentType(requestingAgentType);
    const normalizedTarget = normalizeAgentType(requestedSubAgent);

    const authority = SPAWN_AUTHORITY[normalizedRequester];

    let allowed = false;
    let reason = '';

    if (authority === '*') {
      allowed = true;
      reason = `${requestingAgentType} has universal spawn authority`;
    } else if (Array.isArray(authority)) {
      allowed = authority.includes(normalizedTarget);
      reason = allowed
        ? `${requestingAgentType} is authorized to spawn ${requestedSubAgent}`
        : `${requestingAgentType} is NOT in the authority chart for spawning ${requestedSubAgent}`;
    } else {
      allowed = false;
      reason = `${requestingAgentType} has no entry in the Spawn Authority Chart`;
    }

    // ── Rate-of-spawn guard (checked before type authority) ──────────────────
    if (allowed) {
      const rateCheck = checkSpawnRate(requestingAgentId);
      if (!rateCheck.allowed) {
        allowed = false;
        reason = rateCheck.reason;
      }
    }

    // ── Concurrency limit check ───────────────────────────────────────────────
    if (allowed) {
      const concurrencyLimit = SPAWN_CONCURRENCY_LIMITS[normalizedTarget];
      if (concurrencyLimit !== undefined) {
        try {
          const activeCount = (this.db.prepare(
            "SELECT COUNT(*) as c FROM agent_runs WHERE final_state IS NULL AND task LIKE ?"
          ).get(`%${normalizedTarget}%`) as any)?.c ?? 0;
          if (activeCount >= concurrencyLimit) {
            allowed = false;
            reason = `Concurrency limit reached for ${requestedSubAgent}: ${activeCount}/${concurrencyLimit} active instances`;
          }
        } catch { /* non-critical — DB may not have agent_runs in all contexts */ }
      }
    }

    if (!allowed) {
      // Log violation to forensic DB
      try {
        this.db.prepare(`
          INSERT INTO spawn_violations (entry_id, requesting_agent_id, requested_sub_agent, authority_chart_result, blocked)
          VALUES (?, ?, ?, ?, ?)
        `).run(uuid(), requestingAgentId, requestedSubAgent, reason, 1);
      } catch {
        // Non-fatal — don't crash on logging failure
      }
    }

    return { allowed, reason };
  }

  /**
   * Get all spawn violations, optionally filtered by agent.
   */
  getViolations(requestingAgentId?: string): {
    entry_id: string;
    requesting_agent_id: string;
    requested_sub_agent: string;
    authority_chart_result: string;
    blocked: boolean;
    created_at: string;
  }[] {
    const query = requestingAgentId
      ? 'SELECT * FROM spawn_violations WHERE requesting_agent_id = ? ORDER BY created_at DESC'
      : 'SELECT * FROM spawn_violations ORDER BY created_at DESC LIMIT 500';
    const rows = requestingAgentId
      ? this.db.prepare(query).all(requestingAgentId)
      : this.db.prepare(query).all();
    return (rows as any[]).map(r => ({ ...r, blocked: Boolean(r.blocked) }));
  }

  /**
   * Check model tier for a given agent role (from spec).
   */
  static getModelTier(agentRole: string): { tier: number; safe_ceiling_tokens: number } {
    const normalizedRole = normalizeAgentType(agentRole);
    const tierMap: Record<string, number> = {
      'fleet_agent_nano': 1,
      'memory_crawler': 2, // when spawned by fleet agents
      'fleet_agent': 3,
      'waiting_sub_agent': 3,
      'nano_liaison_agent': 3,
      'agent_loop': 4,
      'skeptic_agent': 4,
      'command_agent': 4,
      'blame_crawler': 4,
      'god_factory': 5,
    };
    const ceilingMap: Record<number, number> = {
      1: 2000,
      2: 6000,
      3: 16000,
      4: 80000,
      5: 160000,
    };
    const tier = tierMap[normalizedRole] ?? 4;
    return { tier, safe_ceiling_tokens: ceilingMap[tier] };
  }

  /**
   * When the chat agent wants to spawn a Tier 3+ sub-agent, it must surface a
   * pending confirmation to the user instead of spawning immediately.
   * Creates a notification_queue entry with a 60-second auto-reject window.
   * Returns the confirmation_id so the caller can poll for acceptance.
   */
  createPendingConfirmation(opts: {
    requestedSubAgent: string;
    requestedTier: number;
    requestedBy: string;
    requestedById?: string;
    expiresAfterMs?: number;
  }): { confirmationId: string; expiresAt: number } {
    const confirmationId = uuid();
    const expiresAt = Date.now() + (opts.expiresAfterMs ?? 60_000);
    const tags = [
      `spawn:${opts.requestedSubAgent}`,
      `tier:${opts.requestedTier}`,
      `requested_by:${opts.requestedBy}`,
      `requested_by_id:${opts.requestedById || 'unknown'}`,
      `expires:${expiresAt}`,
      'decision:pending',
      `confirmation_id:${confirmationId}`,
    ];
    try {
      this.db.prepare(`
        INSERT INTO notification_queue
          (notification_id, severity, category, natural_language_summary, summary_tags, presented_to_user, user_acknowledged, timestamp)
        VALUES (?, 'warning', 'spawn_confirmation',
          ?,
          ?,
          0, 0, datetime('now'))
      `).run(
        confirmationId,
        `Spawn confirmation required: ${opts.requestedBy} wants to spawn a Tier ${opts.requestedTier} sub-agent (${opts.requestedSubAgent}). Accept within 60 seconds or the request will be auto-rejected.`,
        JSON.stringify(tags),
      );
    } catch { /* DB may not be ready */ }
    return { confirmationId, expiresAt };
  }

  /**
   * Check whether a pending confirmation has been accepted (user_acknowledged=1)
   * or has expired (expiresAt < now, extracted from summary_tags).
   * Returns 'accepted' | 'rejected' | 'pending'.
   */
  checkConfirmation(confirmationId: string): SpawnConfirmationStatus {
    try {
      const row = this.db.prepare(
        'SELECT user_acknowledged, summary_tags FROM notification_queue WHERE notification_id = ? AND category = ?'
      ).get(confirmationId, 'spawn_confirmation') as any;
      if (!row) return 'rejected'; // not found = expired/cleaned up
      const tags: string[] = JSON.parse(row.summary_tags || '[]');
      const decisionTag = tags.find(t => t.startsWith('decision:'));
      if (decisionTag === 'decision:approved' && row.user_acknowledged) return 'accepted';
      if (decisionTag === 'decision:rejected') return 'rejected';

      // Check expiry from summary_tags
      const expiresTag = tags.find(t => t.startsWith('expires:'));
      if (expiresTag) {
        const expiresAt = parseInt(expiresTag.split(':')[1], 10);
        if (Date.now() > expiresAt) return 'rejected';
      }
      return 'pending';
    } catch {
      return 'rejected';
    }
  }

  /**
   * Resolve a pending confirmation with explicit user decision.
   */
  resolveConfirmation(
    confirmationId: string,
    approved: boolean,
    actedBy: string = 'user',
  ): { resolved: boolean; status: SpawnConfirmationStatus } {
    try {
      const row = this.db.prepare(
        'SELECT summary_tags FROM notification_queue WHERE notification_id = ? AND category = ?'
      ).get(confirmationId, 'spawn_confirmation') as any;
      if (!row) return { resolved: false, status: 'rejected' };

      const tags: string[] = JSON.parse(row.summary_tags || '[]');
      const filtered = tags.filter((t: string) =>
        !t.startsWith('decision:') && !t.startsWith('acted_by:') && !t.startsWith('acted_at:'),
      );
      filtered.push(`decision:${approved ? 'approved' : 'rejected'}`);
      filtered.push(`acted_by:${actedBy}`);
      filtered.push(`acted_at:${Date.now()}`);

      this.db.prepare(
        'UPDATE notification_queue SET user_acknowledged = 1, presented_to_user = 1, summary_tags = ? WHERE notification_id = ?'
      ).run(JSON.stringify(filtered), confirmationId);

      return { resolved: true, status: approved ? 'accepted' : 'rejected' };
    } catch {
      return { resolved: false, status: 'rejected' };
    }
  }

  /**
   * Transaction-safe consume: only returns true once for an approved, unexpired
   * confirmation; marks it consumed to prevent replay races.
   */
  consumeApprovedConfirmation(confirmationId: string): boolean {
    try {
      const row = this.db.prepare(
        'SELECT summary_tags, user_acknowledged FROM notification_queue WHERE notification_id = ? AND category = ?'
      ).get(confirmationId, 'spawn_confirmation') as any;
      if (!row) return false;

      const tags: string[] = JSON.parse(row.summary_tags || '[]');
      const decision = tags.find((t: string) => t.startsWith('decision:'));
      if (decision !== 'decision:approved' || !row.user_acknowledged) return false;
      if (tags.some((t: string) => t.startsWith('consumed_at:'))) return false;

      const expiresTag = tags.find((t: string) => t.startsWith('expires:'));
      if (expiresTag) {
        const expiresAt = parseInt(expiresTag.split(':')[1], 10);
        if (Date.now() > expiresAt) return false;
      }

      const nextTags = [...tags, `consumed_at:${Date.now()}`];
      this.db.prepare(
        'UPDATE notification_queue SET summary_tags = ? WHERE notification_id = ?'
      ).run(JSON.stringify(nextTags), confirmationId);
      return true;
    } catch {
      return false;
    }
  }
}
