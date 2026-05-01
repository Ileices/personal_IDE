// ============================================
// Diff Sub-Agent
// Spawned by Builder Agent after tag validation passes
// and before a file system write executes.
// Predicts post-edit devtag state and authorizes/blocks writes.
// ============================================
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import type { TagRegistryService, Buildtag } from '../../tagRegistry/index.js';

export interface DiffResult {
  authorized: boolean;
  cycle_id: string;
  predicted_state: Record<string, unknown>;
  mismatch_detail?: string;
  pending_partition_id?: string;
}

export class DiffSubAgent {
  constructor(
    private db: Database.Database,
    private tagRegistry: TagRegistryService
  ) {}

  /**
   * Compute predicted post-edit devtag state from a buildtag set.
   * Compare against the plantag requirement.
   * Authorize or block the write.
   */
  async evaluate(opts: {
    buildtag_ids: string[];
    plantag_id: string;
    cycle_id: string;
    agent_id: string;
  }): Promise<DiffResult> {
    const { buildtag_ids, plantag_id, cycle_id, agent_id } = opts;

    // Load all buildtags
    const buildtags: Buildtag[] = [];
    for (const id of buildtag_ids) {
      const bt = this.tagRegistry.resolveBuildtag(id);
      if (bt) buildtags.push(bt);
    }

    // Load the plantag requirement
    const plantag = this.db.prepare('SELECT * FROM plantags WHERE id = ?').get(plantag_id) as any;
    if (!plantag) {
      return {
        authorized: false,
        cycle_id,
        predicted_state: {},
        mismatch_detail: `plantag ${plantag_id} not found`,
      };
    }

    // Build predicted state: apply buildtag operations to current registry
    const predictedState: Record<string, unknown> = {};
    const affectedDevtags: string[] = [];

    for (const bt of buildtags) {
      if (bt.target_devtag_id) {
        const devtag = this.tagRegistry.getDevtagById(bt.target_devtag_id);
        if (devtag) {
          affectedDevtags.push(devtag.tag_key);
          predictedState[devtag.tag_key] = this.applyBuildtagOperation(bt, devtag as unknown as Record<string, unknown>);
        }
      }
    }

    // Compare predicted state against plantag requirement
    const requiredPlantag = JSON.parse(plantag.metadata ?? '{}');
    const mismatch = this.compareStates(predictedState, requiredPlantag);

    if (mismatch) {
      // Log diff failure to forensic DB
      const entryId = uuid();
      this.db.prepare(`
        INSERT INTO diff_failures (entry_id, buildtag_set, predicted_devtag_state, required_plantag_state, mismatch_detail, agent_id, cycle_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        entryId,
        JSON.stringify(buildtag_ids),
        JSON.stringify(predictedState),
        JSON.stringify(requiredPlantag),
        mismatch,
        agent_id,
        cycle_id
      );

      return {
        authorized: false,
        cycle_id,
        predicted_state: predictedState,
        mismatch_detail: mismatch,
      };
    }

    // Write pending partition
    const pendingId = this.tagRegistry.writePendingState(cycle_id, buildtags[0]?.id ?? '', {
      predicted_state: predictedState,
      affected_devtags: affectedDevtags,
    });

    return {
      authorized: true,
      cycle_id,
      predicted_state: predictedState,
      pending_partition_id: pendingId,
    };
  }

  /**
   * Promote pending partition to active after successful write.
   */
  promotePartition(cycle_id: string): void {
    this.tagRegistry.promotePendingState(cycle_id);
  }

  /**
   * Discard pending partition on write failure or revert.
   */
  discardPartition(cycle_id: string): void {
    this.tagRegistry.discardPendingState(cycle_id);
  }

  private applyBuildtagOperation(bt: Buildtag, devtag: Record<string, unknown>): Record<string, unknown> {
    // Simulate the effect of a buildtag on a devtag's state
    const result = { ...devtag } as Record<string, unknown>;
    switch (bt.tag_type) {
      case 'register': result['status'] = 'active'; break;
      case 'retire': result['status'] = 'retired'; break;
      case 'lock': result['locked'] = true; result['locked_by'] = bt.agent_id; break;
      case 'unlock': result['locked'] = false; result['locked_by'] = null; break;
      case 'deprecate': result['deprecated'] = true; break;
      case 'annotate': result['annotations'] = [...((result['annotations'] as any[]) ?? []), bt.metadata]; break;
      default: result['last_modified_by'] = bt.agent_id; break;
    }
    return result;
  }

  private compareStates(predicted: Record<string, unknown>, required: Record<string, unknown>): string | null {
    // If required is empty, no constraint to check
    if (!required || Object.keys(required).length === 0) return null;

    const mismatches: string[] = [];
    for (const [key, requiredValue] of Object.entries(required)) {
      const predictedValue = predicted[key];
      if (JSON.stringify(predictedValue) !== JSON.stringify(requiredValue)) {
        mismatches.push(`${key}: expected ${JSON.stringify(requiredValue)}, predicted ${JSON.stringify(predictedValue)}`);
      }
    }

    return mismatches.length > 0 ? mismatches.join('; ') : null;
  }
}
