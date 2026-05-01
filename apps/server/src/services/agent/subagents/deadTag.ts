// ============================================
// Dead Tag Sub-Agent
// Crawls the devtag registry and verifies each tag
// against the actual file system. Flags tags whose
// code structures no longer exist at their recorded
// file/line location. Triggers retirement chart
// after 10 cycles of unresolved dead tags.
// ============================================
import { v4 as uuid } from 'uuid';
import { existsSync, readFileSync } from 'fs';
import type Database from 'better-sqlite3';
import type { TagRegistryService } from '../../tagRegistry/index.js';

export interface DeadTagScanResult {
  scanned: number;
  dead_found: number;
  newly_flagged: string[];
  retirement_triggered: string[];
}

export class DeadTagSubAgent {
  private static readonly RETIREMENT_CYCLE_THRESHOLD = 10;

  constructor(
    private db: Database.Database,
    private tagRegistry: TagRegistryService
  ) {}

  /**
   * Run a full dead tag scan across all active devtags in the registry.
   * Optionally filter by project_id.
   */
  async scan(opts: { project_id?: string; current_cycle: number }): Promise<DeadTagScanResult> {
    const { project_id, current_cycle } = opts;
    const activeTags = this.tagRegistry.listDevtags({ project_id, status: 'active' });

    let scanned = 0;
    let dead_found = 0;
    const newly_flagged: string[] = [];
    const retirement_triggered: string[] = [];

    const tx = this.db.transaction(() => {
      for (const tag of activeTags) {
        if (!tag.file_path) continue; // Tags without file references are skipped
        scanned++;

        const isDead = this.isTagDead(tag);
        if (!isDead) continue;

        dead_found++;

        // Check if already in dead_tags table
        const existing = this.db.prepare('SELECT * FROM dead_tags WHERE devtag = ? AND resolved = 0').get(tag.tag_key) as any;

        if (!existing) {
          // First time flagged — mark devtag as dead and write to forensic table
          this.tagRegistry.updateDevtag(tag.id, { status: 'dead', metadata: { dead_detected_cycle: current_cycle } });

          this.db.prepare(`
            INSERT INTO dead_tags (entry_id, devtag, last_known_file, last_known_line, detected_cycle, retirement_scheduled_cycle, resolved)
            VALUES (?, ?, ?, ?, ?, ?, 0)
          `).run(
            uuid(), tag.tag_key, tag.file_path ?? '',
            tag.line_start ?? null, current_cycle,
            current_cycle + DeadTagSubAgent.RETIREMENT_CYCLE_THRESHOLD
          );

          newly_flagged.push(tag.tag_key);
        } else {
          // Already known dead — check if retirement cycle reached
          if (existing.retirement_scheduled_cycle && current_cycle >= existing.retirement_scheduled_cycle) {
            // Trigger Tag Retirement Chart
            this.tagRegistry.retireDevtag(tag.id, current_cycle);
            this.db.prepare('UPDATE dead_tags SET resolved = 1 WHERE entry_id = ?').run(existing.entry_id);
            retirement_triggered.push(tag.tag_key);
          }
        }
      }
    });

    tx();

    return { scanned, dead_found, newly_flagged, retirement_triggered };
  }

  /**
   * Mark a dead tag as resolved (e.g., the code was restored or tag was updated).
   */
  resolveDeadTag(devtag_key: string): boolean {
    const result = this.db.prepare(`
      UPDATE dead_tags SET resolved = 1 WHERE devtag = ? AND resolved = 0
    `).run(devtag_key);

    if (result.changes > 0) {
      // Restore devtag to active
      const tag = this.tagRegistry.resolveDevtag(devtag_key);
      if (tag) this.tagRegistry.updateDevtag(tag.id, { status: 'active' });
    }

    return result.changes > 0;
  }

  /**
   * Get all unresolved dead tags.
   */
  getDeadTags(opts: { resolved?: boolean } = {}): any[] {
    const query = opts.resolved !== undefined
      ? 'SELECT * FROM dead_tags WHERE resolved = ? ORDER BY detected_cycle DESC'
      : 'SELECT * FROM dead_tags ORDER BY detected_cycle DESC LIMIT 500';
    return opts.resolved !== undefined
      ? this.db.prepare(query).all(opts.resolved ? 1 : 0) as any[]
      : this.db.prepare(query).all() as any[];
  }

  /**
   * Check whether a devtag is dead by verifying the code structure at its file/line.
   */
  private isTagDead(tag: { file_path?: string; line_start?: number; name: string }): boolean {
    if (!tag.file_path) return false;

    try {
      if (!existsSync(tag.file_path)) return true;

      if (tag.line_start !== undefined && tag.line_start > 0) {
        const content = readFileSync(tag.file_path, 'utf-8');
        const lines = content.split('\n');
        const targetLine = lines[tag.line_start - 1] ?? '';
        // Check if the name of the symbol still appears near that line
        const searchWindow = lines.slice(Math.max(0, tag.line_start - 2), tag.line_start + 3).join('\n');
        if (!searchWindow.includes(tag.name)) return true;
      }

      return false;
    } catch {
      return true; // Any read error = treat as dead
    }
  }
}
