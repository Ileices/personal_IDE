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
}
