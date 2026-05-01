// ============================================
// Parallel Coordinator Agent (persistent)
// Preventive coordination for parallel Fleet Agents.
// Partitions action plans into parallel-safe and
// parallel-unsafe steps. Monitors agent progress.
// Handles stalled agents and deadlock prevention.
// ============================================
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import type { TagRegistryService } from '../../tagRegistry/index.js';
import type { ConflictSubAgent } from '../subagents/conflict.js';

export interface ActionStep {
  step_id: string;
  buildtag_ids: string[];
  plantag_id?: string;
  assigned_agent_id?: string;
  status: 'queued' | 'assigned' | 'complete' | 'failed';
  parallel_safe: boolean;
  cycle_started?: number;
}

export interface AssignmentResult {
  assigned: boolean;
  step_id?: string;
  conflict_reason?: string;
}

export class ParallelCoordinatorAgent {
  private static readonly STALL_CYCLE_THRESHOLD = 5;
  private static readonly STALL_RESPONSE_THRESHOLD = 2;

  private actionQueue: ActionStep[] = [];
  private agentLastActivity: Map<string, { cycle: number; status: string }> = new Map();

  constructor(
    private db: Database.Database,
    private tagRegistry: TagRegistryService,
    private conflictSubAgent: ConflictSubAgent
  ) {}

  /**
   * Receive a full action plan and partition into safe/unsafe steps.
   */
  loadActionPlan(steps: Omit<ActionStep, 'parallel_safe' | 'status'>[]): void {
    this.actionQueue = steps.map(step => ({
      ...step,
      status: 'queued' as const,
      parallel_safe: this.isParallelSafe(step.buildtag_ids),
    }));
  }

  /**
   * Assign the next available step to a fleet agent.
   * Checks conflict registry before assignment.
   */
  assignNextStep(agent_id: string, current_cycle: number): AssignmentResult {
    // INVARIANT #3: No Fleet Agent may begin a step while holding any devtag claim
    // from a prior step that has not been released.
    const priorClaims = this.tagRegistry.getActiveClaimsByAgent(agent_id);
    if (priorClaims.length > 0) {
      return {
        assigned: false,
        conflict_reason: `Agent ${agent_id} still holds ${priorClaims.length} unreleased devtag claim(s) from a prior step — must release before receiving a new assignment`,
      };
    }

    for (const step of this.actionQueue) {
      if (step.status !== 'queued') continue;

      // Check conflict registry
      const conflictCheck = this.conflictSubAgent.checkConflicts({
        buildtag_ids: step.buildtag_ids,
        requesting_agent_id: agent_id,
        cycle_id: String(current_cycle),
      });

      if (!conflictCheck.clear) {
        if (conflictCheck.deadlock_detected) {
          // Try to reorder — skip this step and find another
          continue;
        }
        // Conflict — skip to next step
        continue;
      }

      // Assign this step
      step.status = 'assigned';
      step.assigned_agent_id = agent_id;
      step.cycle_started = current_cycle;

      // Claim all devtags for this step
      for (const bt_id of step.buildtag_ids) {
        const bt = this.tagRegistry.resolveBuildtag(bt_id);
        if (bt?.target_devtag_id) {
          this.tagRegistry.claimDevtag(bt.target_devtag_id, agent_id, String(current_cycle));
        }
      }

      this.agentLastActivity.set(agent_id, { cycle: current_cycle, status: 'active' });

      return { assigned: true, step_id: step.step_id };
    }

    return { assigned: false, conflict_reason: 'No available steps or all steps blocked by conflicts' };
  }

  /**
   * Mark a step as complete and release devtag claims.
   */
  markStepComplete(step_id: string, agent_id: string, current_cycle: number): void {
    const step = this.actionQueue.find(s => s.step_id === step_id);
    if (!step) return;

    step.status = 'complete';

    // Release all devtag claims
    for (const bt_id of step.buildtag_ids) {
      const bt = this.tagRegistry.resolveBuildtag(bt_id);
      if (bt?.target_devtag_id) {
        this.tagRegistry.releaseDevtagClaim(bt.target_devtag_id, agent_id, String(current_cycle));
      }
    }

    this.agentLastActivity.set(agent_id, { cycle: current_cycle, status: 'idle' });
  }

  /**
   * Check all active agents for stalls. Returns list of stalled agents.
   */
  checkForStalls(current_cycle: number): string[] {
    const stalled: string[] = [];

    for (const [agent_id, activity] of this.agentLastActivity.entries()) {
      if (activity.status === 'active') {
        const cyclesSinceActivity = current_cycle - activity.cycle;
        if (cyclesSinceActivity >= ParallelCoordinatorAgent.STALL_CYCLE_THRESHOLD) {
          stalled.push(agent_id);
        }
      }
    }

    return stalled;
  }

  /**
   * Declare an agent as dead: release its claims and notify.
   */
  flagAgentDead(agent_id: string, current_cycle: number): void {
    // Release all active claims for this agent
    const claims = this.tagRegistry.getActiveClaimsByAgent(agent_id);
    for (const claim of claims) {
      this.tagRegistry.releaseDevtagClaim(claim.devtag_id, agent_id, String(current_cycle));
    }

    // Mark assigned steps as failed
    for (const step of this.actionQueue) {
      if (step.assigned_agent_id === agent_id && step.status === 'assigned') {
        step.status = 'failed';
      }
    }

    this.agentLastActivity.delete(agent_id);
  }

  /**
   * Get current queue status.
   */
  getQueueStatus(): {
    total: number;
    queued: number;
    assigned: number;
    complete: number;
    failed: number;
    parallel_safe: number;
    parallel_unsafe: number;
  } {
    const stats = { total: 0, queued: 0, assigned: 0, complete: 0, failed: 0, parallel_safe: 0, parallel_unsafe: 0 };
    for (const step of this.actionQueue) {
      stats.total++;
      stats[step.status]++;
      if (step.parallel_safe) stats.parallel_safe++;
      else stats.parallel_unsafe++;
    }
    return stats;
  }

  /**
   * Determine if a set of buildtags is parallel-safe.
   * Steps sharing devtag relationships are parallel-unsafe.
   */
  private isParallelSafe(buildtag_ids: string[]): boolean {
    const devtag_ids = new Set<string>();
    for (const bt_id of buildtag_ids) {
      const bt = this.tagRegistry.resolveBuildtag(bt_id);
      if (bt?.target_devtag_id) devtag_ids.add(bt.target_devtag_id);
    }

    // Check if any other assigned step uses the same devtags
    for (const step of this.actionQueue) {
      if (step.status !== 'assigned') continue;
      for (const bt_id of step.buildtag_ids) {
        const bt = this.tagRegistry.resolveBuildtag(bt_id);
        if (bt?.target_devtag_id && devtag_ids.has(bt.target_devtag_id)) {
          return false;
        }
      }
    }

    return true;
  }
}
