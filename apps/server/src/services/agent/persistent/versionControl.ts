// ============================================
// Version Control Agent (persistent)
// Records every committed build step as a version
// control commit. Maintains rollback index.
// Can revert any committed step on demand.
// ============================================
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import type { TagRegistryService } from '../../tagRegistry/index.js';

export interface VersionCommit {
  commit_id: string;
  buildtag_set: string[];
  devtag_state_before: Record<string, unknown>;
  devtag_state_after: Record<string, unknown>;
  plantags_satisfied: string[];
  agent_id: string;
  created_at: string;
  reverted: boolean;
  revert_timestamp?: string;
}

export class VersionControlAgent {
  constructor(
    private db: Database.Database,
    private tagRegistry: TagRegistryService
  ) {}

  /**
   * Record a committed build step as a version commit.
   * Returns the commit_id.
   */
  recordCommit(opts: {
    buildtag_ids: string[];
    modified_devtag_ids: string[];
    devtag_state_before: Record<string, unknown>;
    plantags_satisfied: string[];
    agent_id: string;
  }): string {
    const { buildtag_ids, modified_devtag_ids, devtag_state_before, plantags_satisfied, agent_id } = opts;
    const commit_id = uuid();

    // Capture current (post-commit) state for each modified devtag
    const devtag_state_after: Record<string, unknown> = {};
    for (const dt_id of modified_devtag_ids) {
      const dt = this.tagRegistry.getDevtagById(dt_id);
      if (dt) devtag_state_after[dt.tag_key] = dt;
    }

    // Write commit record
    this.db.prepare(`
      INSERT INTO version_commits (commit_id, buildtag_set, devtag_state_before, devtag_state_after, plantags_satisfied, agent_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      commit_id,
      JSON.stringify(buildtag_ids),
      JSON.stringify(devtag_state_before),
      JSON.stringify(devtag_state_after),
      JSON.stringify(plantags_satisfied),
      agent_id
    );

    // Tag each modified devtag with devtag:version:[commit_id]
    for (const dt_id of modified_devtag_ids) {
      this.tagRegistry.updateDevtag(dt_id, { last_commit_id: commit_id });
    }

    return commit_id;
  }

  /**
   * Revert a committed build step by commit_id.
   * Reconstructs the pre-commit devtag state.
   */
  revertToCommit(commit_id: string, invoking_agent_id: string): { success: boolean; error?: string } {
    const row = this.db.prepare('SELECT * FROM version_commits WHERE commit_id = ?').get(commit_id) as any;
    if (!row) return { success: false, error: 'commit not found' };
    if (row.reverted) return { success: false, error: 'already reverted' };

    try {
      const before = JSON.parse(row.devtag_state_before);
      const buildtag_ids: string[] = JSON.parse(row.buildtag_set);

      const tx = this.db.transaction(() => {
        // Restore pre-commit devtag states
        for (const [tag_key, state] of Object.entries(before)) {
          const devtag = this.tagRegistry.resolveDevtag(tag_key);
          if (devtag && typeof state === 'object' && state !== null) {
            const s = state as Record<string, unknown>;
            this.tagRegistry.updateDevtag(devtag.id, {
              status: (s['status'] as any) ?? 'active',
              file_path: (s['file_path'] as string) ?? undefined,
              line_start: (s['line_start'] as number) ?? undefined,
              line_end: (s['line_end'] as number) ?? undefined,
            });
          }
        }

        // Mark all buildtags in this commit as reverted
        for (const bt_id of buildtag_ids) {
          this.tagRegistry.updateBuildtagStatus(bt_id, 'reverted');
        }

        // Mark the commit as reverted
        this.db.prepare(`
          UPDATE version_commits SET reverted = 1, revert_timestamp = datetime('now') WHERE commit_id = ?
        `).run(commit_id);

        // Write revert to tag_mismatches for Blame Crawler
        this.db.prepare(`
          INSERT INTO tag_mismatches (entry_id, devtag, mismatch_type, severity, agent_id)
          VALUES (?, ?, 'revert', 'warning', ?)
        `).run(uuid(), `commit:${commit_id}`, invoking_agent_id);
      });

      tx();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * List commits in the rollback index.
   */
  listCommits(opts: { agent_id?: string; reverted?: boolean; limit?: number } = {}): VersionCommit[] {
    let query = 'SELECT * FROM version_commits WHERE 1=1';
    const params: any[] = [];
    if (opts.agent_id) { query += ' AND agent_id = ?'; params.push(opts.agent_id); }
    if (opts.reverted !== undefined) { query += ' AND reverted = ?'; params.push(opts.reverted ? 1 : 0); }
    query += ' ORDER BY created_at DESC';
    if (opts.limit) query += ` LIMIT ${opts.limit}`;

    return (this.db.prepare(query).all(...params) as any[]).map(r => ({
      ...r,
      buildtag_set: JSON.parse(r.buildtag_set),
      devtag_state_before: JSON.parse(r.devtag_state_before),
      devtag_state_after: JSON.parse(r.devtag_state_after),
      plantags_satisfied: JSON.parse(r.plantags_satisfied),
      reverted: Boolean(r.reverted),
    }));
  }

  getCommit(commit_id: string): VersionCommit | null {
    const row = this.db.prepare('SELECT * FROM version_commits WHERE commit_id = ?').get(commit_id) as any;
    if (!row) return null;
    return {
      ...row,
      buildtag_set: JSON.parse(row.buildtag_set),
      devtag_state_before: JSON.parse(row.devtag_state_before),
      devtag_state_after: JSON.parse(row.devtag_state_after),
      plantags_satisfied: JSON.parse(row.plantags_satisfied),
      reverted: Boolean(row.reverted),
    };
  }
}
