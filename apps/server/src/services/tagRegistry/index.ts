// ============================================
// Tag Registry Service
// Central registry for devtags, plantags, buildtags.
// Enforces tag relationship schema and retirement chart.
// ============================================
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';

// ── Types ──────────────────────────────────

export interface Devtag {
  id: string;
  tag_key: string;
  tag_type: string;
  name: string;
  parent_id?: string;
  file_path?: string;
  line_start?: number;
  line_end?: number;
  project_id?: string;
  status: 'active' | 'orphaned' | 'dead' | 'retired';
  dead_detected_cycle?: number;
  retirement_scheduled_cycle?: number;
  last_commit_id?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Plantag {
  id: string;
  tag_key: string;
  tag_type: string;
  name: string;
  project_id?: string;
  status: 'pending' | 'in_progress' | 'done' | 'blocked' | 'orphaned';
  blocking_reason?: string;
  linked_devtag_id?: string;
  cycle_id?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Buildtag {
  id: string;
  tag_key: string;
  tag_type: string;
  target_devtag_id?: string;
  agent_id: string;
  project_id?: string;
  cycle_id?: string;
  status: 'pending' | 'validated' | 'executing' | 'committed' | 'failed' | 'reverted' | 'orphaned';
  plantag_id?: string;
  commit_id?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ── Tag Registry Service ────────────────────

export class TagRegistryService {
  constructor(private db: Database.Database) {}

  // ── Devtag Operations ──

  registerDevtag(opts: {
    tag_key: string;
    tag_type: string;
    name: string;
    parent_id?: string;
    file_path?: string;
    line_start?: number;
    line_end?: number;
    project_id?: string;
    metadata?: Record<string, unknown>;
  }): { success: boolean; id?: string; error?: string } {
    // Validate relationship schema before inserting
    const validation = this.validateDevtagRelationship(opts.tag_type, opts.parent_id);
    if (!validation.valid) {
      return { success: false, error: validation.errors.join('; ') };
    }

    const id = uuid();
    try {
      this.db.prepare(`
        INSERT INTO devtags (id, tag_key, tag_type, name, parent_id, file_path, line_start, line_end, project_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, opts.tag_key, opts.tag_type, opts.name,
        opts.parent_id ?? null, opts.file_path ?? null,
        opts.line_start ?? null, opts.line_end ?? null,
        opts.project_id ?? null,
        JSON.stringify(opts.metadata ?? {})
      );
      return { success: true, id };
    } catch (err: any) {
      if (err.message?.includes('UNIQUE constraint')) {
        // Return existing ID
        const existing = this.db.prepare('SELECT id FROM devtags WHERE tag_key = ?').get(opts.tag_key) as any;
        return { success: true, id: existing?.id };
      }
      return { success: false, error: err.message };
    }
  }

  resolveDevtag(tag_key: string): Devtag | null {
    const row = this.db.prepare('SELECT * FROM devtags WHERE tag_key = ? AND status != ?').get(tag_key, 'retired') as any;
    if (!row) return null;
    return { ...row, metadata: JSON.parse(row.metadata ?? '{}') };
  }

  getDevtagById(id: string): Devtag | null {
    const row = this.db.prepare('SELECT * FROM devtags WHERE id = ?').get(id) as any;
    if (!row) return null;
    return { ...row, metadata: JSON.parse(row.metadata ?? '{}') };
  }

  listDevtags(opts: { project_id?: string; tag_type?: string; status?: string; file_path?: string } = {}): Devtag[] {
    let query = 'SELECT * FROM devtags WHERE 1=1';
    const params: any[] = [];
    if (opts.project_id) { query += ' AND project_id = ?'; params.push(opts.project_id); }
    if (opts.tag_type) { query += ' AND tag_type = ?'; params.push(opts.tag_type); }
    if (opts.status) { query += ' AND status = ?'; params.push(opts.status); }
    if (opts.file_path) { query += ' AND file_path = ?'; params.push(opts.file_path); }
    query += ' ORDER BY created_at DESC';
    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(r => ({ ...r, metadata: JSON.parse(r.metadata ?? '{}') }));
  }

  updateDevtag(id: string, updates: Partial<Pick<Devtag, 'status' | 'file_path' | 'line_start' | 'line_end' | 'last_commit_id' | 'metadata'>>): boolean {
    const sets: string[] = ['updated_at = datetime(\'now\')'];
    const params: any[] = [];
    if (updates.status !== undefined) { sets.push('status = ?'); params.push(updates.status); }
    if (updates.file_path !== undefined) { sets.push('file_path = ?'); params.push(updates.file_path); }
    if (updates.line_start !== undefined) { sets.push('line_start = ?'); params.push(updates.line_start); }
    if (updates.line_end !== undefined) { sets.push('line_end = ?'); params.push(updates.line_end); }
    if (updates.last_commit_id !== undefined) { sets.push('last_commit_id = ?'); params.push(updates.last_commit_id); }
    if (updates.metadata !== undefined) { sets.push('metadata = ?'); params.push(JSON.stringify(updates.metadata)); }
    params.push(id);
    const result = this.db.prepare(`UPDATE devtags SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    return result.changes > 0;
  }

  /**
   * Full Tag Retirement Chart (spec step 1-7)
   */
  retireDevtag(tag_id: string, current_cycle: number): { success: boolean; orphaned_buildtags: string[]; orphaned_plantags: string[]; orphaned_relationships: string[]; errors: string[] } {
    const devtag = this.getDevtagById(tag_id);
    if (!devtag) return { success: false, orphaned_buildtags: [], orphaned_plantags: [], orphaned_relationships: [], errors: ['devtag not found'] };

    const orphaned_buildtags: string[] = [];
    const orphaned_plantags: string[] = [];
    const orphaned_relationships: string[] = [];
    const errors: string[] = [];

    const retirement_cycle = current_cycle + 30;

    const tx = this.db.transaction(() => {
      // Step 2: Mark all buildtags referencing this devtag as orphaned
      const buildtagRows = this.db.prepare('SELECT id, tag_key FROM buildtags WHERE target_devtag_id = ? AND status != ?').all(tag_id, 'orphaned') as any[];
      for (const bt of buildtagRows) {
        this.db.prepare('UPDATE buildtags SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run('orphaned', bt.id);
        orphaned_buildtags.push(bt.tag_key);
      }

      // Step 3: Mark plantags referencing this devtag as blocked
      const plantagRows = this.db.prepare('SELECT id, tag_key FROM plantags WHERE linked_devtag_id = ? AND status NOT IN (?,?)').all(tag_id, 'blocked', 'orphaned') as any[];
      for (const pt of plantagRows) {
        this.db.prepare('UPDATE plantags SET status = ?, blocking_reason = ?, updated_at = datetime(\'now\') WHERE id = ?').run('blocked', tag_id, pt.id);
        orphaned_plantags.push(pt.tag_key);
      }

      // Step 4: Mark relationship devtags referencing this devtag as orphaned
      const relRows = this.db.prepare('SELECT id, tag_key FROM devtags WHERE (metadata LIKE ? OR metadata LIKE ?) AND status != ?').all(`%"caller":"${devtag.tag_key}"%`, `%"callee":"${devtag.tag_key}"%`, 'orphaned') as any[];
      for (const rel of relRows) {
        this.db.prepare('UPDATE devtags SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run('orphaned', rel.id);
        orphaned_relationships.push(rel.tag_key);
      }

      // Step 5: Write all orphaned entries to tag_mismatches with severity error
      const allOrphaned = [...orphaned_buildtags, ...orphaned_plantags, ...orphaned_relationships];
      for (const tag_key of allOrphaned) {
        this.db.prepare(`
          INSERT INTO tag_mismatches (entry_id, devtag, mismatch_type, severity, cycle_id) VALUES (?,?,?,?,?)
        `).run(uuid(), tag_key, 'orphaned_by_retirement', 'error', String(current_cycle));
      }

      // Step 7: Mark devtag as retired with scheduled deletion cycle
      this.db.prepare('UPDATE devtags SET status = ?, retirement_scheduled_cycle = ?, updated_at = datetime(\'now\') WHERE id = ?').run('retired', retirement_cycle, tag_id);

      // Step 6 signal is done via notifyBlameCrawler (caller responsibility)
    });

    try {
      tx();
      return { success: true, orphaned_buildtags, orphaned_plantags, orphaned_relationships, errors };
    } catch (err: any) {
      errors.push(err.message);
      return { success: false, orphaned_buildtags, orphaned_plantags, orphaned_relationships, errors };
    }
  }

  // ── Plantag Operations ──

  registerPlantag(opts: {
    tag_key: string;
    tag_type: string;
    name: string;
    project_id?: string;
    linked_devtag_id?: string;
    cycle_id?: string;
    metadata?: Record<string, unknown>;
  }): { success: boolean; id?: string; error?: string } {
    const id = uuid();
    try {
      this.db.prepare(`
        INSERT INTO plantags (id, tag_key, tag_type, name, project_id, linked_devtag_id, cycle_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, opts.tag_key, opts.tag_type, opts.name, opts.project_id ?? null, opts.linked_devtag_id ?? null, opts.cycle_id ?? null, JSON.stringify(opts.metadata ?? {}));
      return { success: true, id };
    } catch (err: any) {
      if (err.message?.includes('UNIQUE constraint')) {
        const existing = this.db.prepare('SELECT id FROM plantags WHERE tag_key = ?').get(opts.tag_key) as any;
        return { success: true, id: existing?.id };
      }
      return { success: false, error: err.message };
    }
  }

  resolvePlantag(tag_key: string): Plantag | null {
    const row = this.db.prepare('SELECT * FROM plantags WHERE tag_key = ?').get(tag_key) as any;
    if (!row) return null;
    return { ...row, metadata: JSON.parse(row.metadata ?? '{}') };
  }

  listPlantags(opts: { project_id?: string; status?: string } = {}): Plantag[] {
    let query = 'SELECT * FROM plantags WHERE 1=1';
    const params: any[] = [];
    if (opts.project_id) { query += ' AND project_id = ?'; params.push(opts.project_id); }
    if (opts.status) { query += ' AND status = ?'; params.push(opts.status); }
    query += ' ORDER BY created_at DESC';
    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(r => ({ ...r, metadata: JSON.parse(r.metadata ?? '{}') }));
  }

  updatePlantagStatus(id: string, status: Plantag['status'], blocking_reason?: string): boolean {
    const result = this.db.prepare(`
      UPDATE plantags SET status = ?, blocking_reason = ?, updated_at = datetime('now') WHERE id = ?
    `).run(status, blocking_reason ?? null, id);
    return result.changes > 0;
  }

  // ── Buildtag Operations ──

  /**
   * Validate that a buildtag references at least one existing (non-retired) devtag
   * AND at least one unfulfilled plantag before allowing registration.
   * This is the structural integrity guarantee: agents cannot emit buildtags
   * that float free of actual code structure or already-closed requirements.
   */
  validateBuildtag(opts: { target_devtag_id?: string; plantag_id?: string }): ValidationResult {
    const errors: string[] = [];

    // Rule 1: Must reference at least one existing, non-retired devtag
    if (!opts.target_devtag_id) {
      errors.push('buildtag must reference at least one devtag (target_devtag_id required)');
    } else {
      const devtag = this.db.prepare(
        "SELECT id, status FROM devtags WHERE id = ?"
      ).get(opts.target_devtag_id) as any;
      if (!devtag) {
        errors.push(`referenced devtag does not exist: ${opts.target_devtag_id}`);
      } else if (devtag.status === 'retired') {
        errors.push(`referenced devtag is retired and cannot be targeted: ${opts.target_devtag_id}`);
      }
    }

    // Rule 2: Must reference at least one unfulfilled plantag
    if (!opts.plantag_id) {
      errors.push('buildtag must reference at least one plantag (plantag_id required)');
    } else {
      const plantag = this.db.prepare(
        "SELECT id, status FROM plantags WHERE id = ?"
      ).get(opts.plantag_id) as any;
      if (!plantag) {
        errors.push(`referenced plantag does not exist: ${opts.plantag_id}`);
      } else if (plantag.status === 'done') {
        errors.push(`referenced plantag is already fulfilled: ${opts.plantag_id}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  registerBuildtag(opts: {
    tag_key: string;
    tag_type: string;
    target_devtag_id?: string;
    agent_id: string;
    project_id?: string;
    cycle_id?: string;
    plantag_id?: string;
    metadata?: Record<string, unknown>;
    /** Skip structural validation — only use in migration or test contexts */
    skipValidation?: boolean;
  }): { success: boolean; id?: string; error?: string; validationErrors?: string[] } {
    // Enforce structural integrity unless explicitly bypassed
    if (!opts.skipValidation) {
      const validation = this.validateBuildtag({
        target_devtag_id: opts.target_devtag_id,
        plantag_id: opts.plantag_id,
      });
      if (!validation.valid) {
        return { success: false, error: 'Buildtag validation failed', validationErrors: validation.errors };
      }
    }

    const id = uuid();
    try {
      this.db.prepare(`
        INSERT INTO buildtags (id, tag_key, tag_type, target_devtag_id, agent_id, project_id, cycle_id, plantag_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, opts.tag_key, opts.tag_type, opts.target_devtag_id ?? null, opts.agent_id, opts.project_id ?? null, opts.cycle_id ?? null, opts.plantag_id ?? null, JSON.stringify(opts.metadata ?? {}));
      return { success: true, id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  resolveBuildtag(id: string): Buildtag | null {
    const row = this.db.prepare('SELECT * FROM buildtags WHERE id = ?').get(id) as any;
    if (!row) return null;
    return { ...row, metadata: JSON.parse(row.metadata ?? '{}') };
  }

  listBuildtags(opts: { project_id?: string; agent_id?: string; cycle_id?: string; status?: string } = {}): Buildtag[] {
    let query = 'SELECT * FROM buildtags WHERE 1=1';
    const params: any[] = [];
    if (opts.project_id) { query += ' AND project_id = ?'; params.push(opts.project_id); }
    if (opts.agent_id) { query += ' AND agent_id = ?'; params.push(opts.agent_id); }
    if (opts.cycle_id) { query += ' AND cycle_id = ?'; params.push(opts.cycle_id); }
    if (opts.status) { query += ' AND status = ?'; params.push(opts.status); }
    query += ' ORDER BY created_at DESC';
    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(r => ({ ...r, metadata: JSON.parse(r.metadata ?? '{}') }));
  }

  updateBuildtagStatus(id: string, status: Buildtag['status'], commit_id?: string): boolean {
    const result = this.db.prepare(`
      UPDATE buildtags SET status = ?, commit_id = COALESCE(?,commit_id), updated_at = datetime('now') WHERE id = ?
    `).run(status, commit_id ?? null, id);
    return result.changes > 0;
  }

  // ── Claim Lock Operations (for Conflict Sub-Agent) ──

  claimDevtag(devtag_id: string, agent_id: string, cycle_id: string): boolean {
    try {
      this.db.prepare(`
        INSERT INTO devtag_claims (id, devtag_id, agent_id, cycle_id) VALUES (?,?,?,?)
      `).run(uuid(), devtag_id, agent_id, cycle_id);
      return true;
    } catch {
      return false; // Already claimed
    }
  }

  releaseDevtagClaim(devtag_id: string, agent_id: string, cycle_id: string): boolean {
    const result = this.db.prepare(`
      UPDATE devtag_claims SET released_at = datetime('now') WHERE devtag_id = ? AND agent_id = ? AND cycle_id = ? AND released_at IS NULL
    `).run(devtag_id, agent_id, cycle_id);
    return result.changes > 0;
  }

  getActiveClaimsForDevtag(devtag_id: string): { agent_id: string; cycle_id: string; claimed_at: string }[] {
    return this.db.prepare('SELECT agent_id, cycle_id, claimed_at FROM devtag_claims WHERE devtag_id = ? AND released_at IS NULL').all(devtag_id) as any[];
  }

  getActiveClaimsByAgent(agent_id: string): { devtag_id: string; cycle_id: string; claimed_at: string }[] {
    return this.db.prepare('SELECT devtag_id, cycle_id, claimed_at FROM devtag_claims WHERE agent_id = ? AND released_at IS NULL').all(agent_id) as any[];
  }

  // ── Pending Registry Partition ──

  writePendingState(cycle_id: string, buildtag_id: string, predicted_state: Record<string, unknown>): string {
    const id = uuid();
    this.db.prepare(`
      INSERT INTO devtag_pending (id, cycle_id, buildtag_id, predicted_state) VALUES (?,?,?,?)
    `).run(id, cycle_id, buildtag_id, JSON.stringify(predicted_state));
    return id;
  }

  promotePendingState(cycle_id: string): void {
    // Promote means the predicted states become actual — update devtags accordingly
    const pending = this.db.prepare('SELECT * FROM devtag_pending WHERE cycle_id = ?').all(cycle_id) as any[];
    const tx = this.db.transaction(() => {
      for (const p of pending) {
        const predicted = JSON.parse(p.predicted_state);
        if (predicted.tag_id && predicted.updates) {
          this.updateDevtag(predicted.tag_id, predicted.updates);
        }
      }
      this.db.prepare('DELETE FROM devtag_pending WHERE cycle_id = ?').run(cycle_id);
    });
    tx();
  }

  discardPendingState(cycle_id: string): void {
    this.db.prepare('DELETE FROM devtag_pending WHERE cycle_id = ?').run(cycle_id);
  }

  // ── Context Window Exclusion Log ──

  logExclusion(cycle_id: string, agent_id: string, excluded_tag_id: string, reason: string, rank_score: number): void {
    this.db.prepare(`
      INSERT INTO context_window_exclusions (id, cycle_id, agent_id, excluded_tag_id, exclusion_reason, rank_score) VALUES (?,?,?,?,?,?)
    `).run(uuid(), cycle_id, agent_id, excluded_tag_id, reason, rank_score);
  }

  getExcludedTags(cycle_id: string): { excluded_tag_id: string; exclusion_reason: string; rank_score: number }[] {
    return this.db.prepare('SELECT excluded_tag_id, exclusion_reason, rank_score FROM context_window_exclusions WHERE cycle_id = ? ORDER BY rank_score DESC').all(cycle_id) as any[];
  }

  // ── Relationship Validation ──

  validateDevtagRelationship(tag_type: string, parent_id?: string): ValidationResult {
    const errors: string[] = [];

    // Look up parent-child rules for this tag_type
    const rules = this.db.prepare('SELECT * FROM tag_relationship_rules WHERE child_tag_type = ? AND rule_type = ?').all(tag_type, 'parent_child') as any[];

    if (rules.length > 0 && !parent_id) {
      // Check if any rule is strict
      const strictRules = rules.filter((r: any) => r.strict);
      if (strictRules.length > 0) {
        const requiredParents = strictRules.map((r: any) => r.parent_tag_type).join(' or ');
        errors.push(`devtag:${tag_type} requires a parent of type ${requiredParents} but no parent_id was provided`);
      }
    }

    if (parent_id) {
      const parent = this.getDevtagById(parent_id);
      if (!parent) {
        errors.push(`Parent devtag with id ${parent_id} does not exist`);
      } else if (rules.length > 0) {
        const validParentTypes = rules.map((r: any) => r.parent_tag_type);
        if (!validParentTypes.includes(parent.tag_type) && !validParentTypes.includes('*')) {
          errors.push(`devtag:${tag_type} requires parent type in [${validParentTypes.join(',')}] but got ${parent.tag_type}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  validatePeerRelationship(tag_type: string, referenced_tag_keys: string[]): ValidationResult {
    const errors: string[] = [];
    const rules = this.db.prepare('SELECT * FROM tag_relationship_rules WHERE child_tag_type = ? AND rule_type = ?').all(tag_type, 'peer') as any[];

    for (const rule of rules as any[]) {
      for (const ref of referenced_tag_keys) {
        const existing = this.resolveDevtag(ref);
        if (!existing) {
          errors.push(`Peer relationship devtag:${tag_type} references ${ref} which does not exist in the registry`);
        } else if (rule.parent_tag_type !== '*' && existing.tag_type !== rule.parent_tag_type) {
          errors.push(`Peer relationship devtag:${tag_type} requires referenced tag type ${rule.parent_tag_type} but got ${existing.tag_type}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // ── Stats ──

  getStats(project_id?: string): {
    total_devtags: number;
    active_devtags: number;
    dead_devtags: number;
    retired_devtags: number;
    total_plantags: number;
    pending_plantags: number;
    done_plantags: number;
    blocked_plantags: number;
    total_buildtags: number;
    committed_buildtags: number;
    failed_buildtags: number;
  } {
    const pFilter = project_id ? ' AND project_id = ?' : '';
    const pArg = project_id ? [project_id] : [];

    const devtagStats = this.db.prepare(`SELECT status, COUNT(*) as cnt FROM devtags WHERE 1=1${pFilter} GROUP BY status`).all(...pArg) as any[];
    const plantagStats = this.db.prepare(`SELECT status, COUNT(*) as cnt FROM plantags WHERE 1=1${pFilter} GROUP BY status`).all(...pArg) as any[];
    const buildtagStats = this.db.prepare(`SELECT status, COUNT(*) as cnt FROM buildtags WHERE 1=1${pFilter} GROUP BY status`).all(...pArg) as any[];

    const dMap = Object.fromEntries(devtagStats.map((r: any) => [r.status, r.cnt]));
    const pMap = Object.fromEntries(plantagStats.map((r: any) => [r.status, r.cnt]));
    const bMap = Object.fromEntries(buildtagStats.map((r: any) => [r.status, r.cnt]));

    return {
      total_devtags: (Object.values(dMap) as number[]).reduce((a, b) => a + b, 0),
      active_devtags: (dMap['active'] as number) ?? 0,
      dead_devtags: (dMap['dead'] as number) ?? 0,
      retired_devtags: (dMap['retired'] as number) ?? 0,
      total_plantags: (Object.values(pMap) as number[]).reduce((a, b) => a + b, 0),
      pending_plantags: (pMap['pending'] as number) ?? 0,
      done_plantags: (pMap['done'] as number) ?? 0,
      blocked_plantags: (pMap['blocked'] as number) ?? 0,
      total_buildtags: (Object.values(bMap) as number[]).reduce((a, b) => a + b, 0),
      committed_buildtags: (bMap['committed'] as number) ?? 0,
      failed_buildtags: (bMap['failed'] as number) ?? 0,
    };
  }
}
