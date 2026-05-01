// ============================================
// Conflict Sub-Agent
// Maintains the devtag claim lock registry.
// Prevents parallel agents from claiming the same
// devtag simultaneously. Detects deadlocks.
// ============================================
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import type { TagRegistryService } from '../../tagRegistry/index.js';

export interface ConflictCheckResult {
  clear: boolean;
  conflicts: ConflictEntry[];
  deadlock_detected: boolean;
  deadlock_agents?: string[];
}

export interface ConflictEntry {
  devtag_id: string;
  devtag_key: string;
  claiming_agent_id: string;
  blocked_agent_id: string;
}

export class ConflictSubAgent {
  // Timeout threshold in cycles before escalating to Parallel Coordinator
  private static readonly TIMEOUT_CYCLES = 10;

  constructor(
    private db: Database.Database,
    private tagRegistry: TagRegistryService
  ) {}

  /**
   * Check whether the given buildtag set conflicts with any active devtag claims.
   * If clear, returns clear=true. If not, logs conflict and queues the step.
   */
  checkConflicts(opts: {
    buildtag_ids: string[];
    requesting_agent_id: string;
    cycle_id: string;
  }): ConflictCheckResult {
    const { buildtag_ids, requesting_agent_id, cycle_id } = opts;
    const conflicts: ConflictEntry[] = [];

    for (const bt_id of buildtag_ids) {
      const bt = this.tagRegistry.resolveBuildtag(bt_id);
      if (!bt?.target_devtag_id) continue;

      const devtag = this.tagRegistry.getDevtagById(bt.target_devtag_id);
      if (!devtag) continue;

      const activeClaims = this.tagRegistry.getActiveClaimsForDevtag(bt.target_devtag_id);
      for (const claim of activeClaims) {
        if (claim.agent_id !== requesting_agent_id) {
          conflicts.push({
            devtag_id: bt.target_devtag_id,
            devtag_key: devtag.tag_key,
            claiming_agent_id: claim.agent_id,
            blocked_agent_id: requesting_agent_id,
          });
        }
      }
    }

    if (conflicts.length === 0) {
      return { clear: true, conflicts: [], deadlock_detected: false };
    }

    // Log all conflicts to forensic DB
    for (const c of conflicts) {
      this.db.prepare(`
        INSERT INTO conflict_log (entry_id, devtag_claimed, claiming_agent_id, blocked_agent_id, resolution, wait_cycles)
        VALUES (?, ?, ?, ?, 'queued', 0)
      `).run(uuid(), c.devtag_key, c.claiming_agent_id, c.blocked_agent_id);
    }

    // Detect deadlock: A holds something B needs, B holds something A needs
    const deadlock = this.detectDeadlock(requesting_agent_id, conflicts.map(c => c.claiming_agent_id));

    if (deadlock.detected) {
      // Suspend both agents (mark in conflict log as deadlock)
      this.db.prepare(`
        UPDATE conflict_log SET resolution = 'deadlock' 
        WHERE devtag_claimed IN (${conflicts.map(() => '?').join(',')}) 
        AND blocked_agent_id = ?
      `).run(...conflicts.map(c => c.devtag_key), requesting_agent_id);

      return {
        clear: false,
        conflicts,
        deadlock_detected: true,
        deadlock_agents: deadlock.agents,
      };
    }

    return { clear: false, conflicts, deadlock_detected: false };
  }

  /**
   * Increment wait cycle counter for a blocked agent; escalate if threshold exceeded.
   */
  incrementWaitCycle(blocked_agent_id: string, devtag_claimed: string): { escalate: boolean } {
    const row = this.db.prepare(`
      SELECT entry_id, wait_cycles FROM conflict_log 
      WHERE blocked_agent_id = ? AND devtag_claimed = ? AND resolution = 'queued'
      ORDER BY created_at DESC LIMIT 1
    `).get(blocked_agent_id, devtag_claimed) as any;

    if (!row) return { escalate: false };

    const newCycles = (row.wait_cycles ?? 0) + 1;
    const escalate = newCycles >= ConflictSubAgent.TIMEOUT_CYCLES;

    this.db.prepare(`
      UPDATE conflict_log SET wait_cycles = ?, resolution = ? WHERE entry_id = ?
    `).run(newCycles, escalate ? 'escalated' : 'queued', row.entry_id);

    return { escalate };
  }

  /**
   * Release all claims held by an agent (called on agent completion/failure).
   */
  releaseAgentClaims(agent_id: string, cycle_id: string): void {
    const claims = this.tagRegistry.getActiveClaimsByAgent(agent_id);
    for (const claim of claims) {
      this.tagRegistry.releaseDevtagClaim(claim.devtag_id, agent_id, cycle_id);
      // Update conflict log: queued entries waiting on this agent can now proceed
      this.db.prepare(`
        UPDATE conflict_log SET resolution = 'released' WHERE claiming_agent_id = ? AND resolution = 'queued'
      `).run(agent_id);
    }
  }

  /**
   * Detect circular deadlock: does requesting_agent hold something any conflicting_agent needs?
   */
  private detectDeadlock(requesting_agent: string, conflicting_agents: string[]): { detected: boolean; agents: string[] } {
    const requesterClaims = this.tagRegistry.getActiveClaimsByAgent(requesting_agent);
    const requesterClaimedDevtags = new Set(requesterClaims.map((c: { devtag_id: string }) => c.devtag_id));

    for (const conflicting of conflicting_agents) {
      const theirClaims = this.tagRegistry.getActiveClaimsByAgent(conflicting);
      for (const claim of theirClaims) {
        if (requesterClaimedDevtags.has(claim.devtag_id)) {
          return { detected: true, agents: [requesting_agent, conflicting] };
        }
      }
    }
    return { detected: false, agents: [] };
  }

  /**
   * Get current conflict queue status.
   */
  getConflictQueue(): {
    entry_id: string;
    devtag_claimed: string;
    claiming_agent_id: string;
    blocked_agent_id: string;
    resolution: string;
    wait_cycles: number;
    created_at: string;
  }[] {
    return this.db.prepare('SELECT * FROM conflict_log ORDER BY created_at DESC LIMIT 200').all() as any[];
  }
}
