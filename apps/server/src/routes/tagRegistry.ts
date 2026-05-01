// ============================================
// Tag Registry Routes
// CRUD for devtags, plantags, buildtags.
// Validation, relationship schema checks,
// retirement chart, claim locks.
// ============================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TagRegistryService } from '../services/tagRegistry/index.js';
import { safeRoute } from '../plugins/safeRoute.js';

export async function tagRegistryRoutes(app: FastifyInstance) {
  const db = (app as any).db;
  const registry = new TagRegistryService(db);

  // ── Devtags ──────────────────────────────

  app.post('/devtags', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    const result = registry.registerDevtag({
      tag_key: body.tag_key,
      tag_type: body.tag_type,
      name: body.name,
      parent_id: body.parent_id,
      file_path: body.file_path,
      line_start: body.line_start,
      line_end: body.line_end,
      project_id: body.project_id,
      metadata: body.metadata ?? {},
    });
    return result;
  }));

  app.get('/devtags', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    const tags = registry.listDevtags({
      project_id: q.project_id,
      tag_type: q.tag_type,
      status: q.status,
      file_path: q.file_path,
    });
    return { tags };
  }));

  app.get('/devtags/resolve', safeRoute(async (req: FastifyRequest, reply: FastifyReply) => {
    const { tag_key } = req.query as { tag_key: string };
    if (!tag_key) return reply.status(400).send({ error: 'tag_key required' });
    const tag = registry.resolveDevtag(tag_key);
    if (!tag) return reply.status(404).send({ error: 'devtag not found' });
    return { tag };
  }));

  app.get('/devtags/:id', safeRoute(async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const tag = registry.getDevtagById(id);
    if (!tag) return reply.status(404).send({ error: 'devtag not found' });
    return { tag };
  }));

  app.patch('/devtags/:id', safeRoute(async (req: FastifyRequest) => {
    const { id } = req.params as { id: string };
    const body = req.body as any;
    const updated = registry.updateDevtag(id, body);
    return { updated };
  }));

  app.post('/devtags/:id/retire', safeRoute(async (req: FastifyRequest) => {
    const { id } = req.params as { id: string };
    const body = req.body as any;
    const result = registry.retireDevtag(id, body.current_cycle ?? 0);
    return result;
  }));

  // Claim / release locks
  app.post('/devtags/:id/claim', safeRoute(async (req: FastifyRequest) => {
    const { id } = req.params as { id: string };
    const body = req.body as any;
    const claimed = registry.claimDevtag(id, body.agent_id, body.cycle_id);
    return { claimed };
  }));

  app.post('/devtags/:id/release', safeRoute(async (req: FastifyRequest) => {
    const { id } = req.params as { id: string };
    const body = req.body as any;
    const released = registry.releaseDevtagClaim(id, body.agent_id, body.cycle_id);
    return { released };
  }));

  app.get('/devtags/:id/claims', safeRoute(async (req: FastifyRequest) => {
    const { id } = req.params as { id: string };
    const claims = registry.getActiveClaimsForDevtag(id);
    return { claims };
  }));

  // Validate relationship
  app.post('/devtags/validate', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    const result = registry.validateDevtagRelationship(body.tag_type, body.parent_id);
    return result;
  }));

  // ── Plantags ─────────────────────────────

  app.post('/plantags', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    const result = registry.registerPlantag({
      tag_key: body.tag_key,
      tag_type: body.tag_type,
      name: body.name,
      project_id: body.project_id,
      linked_devtag_id: body.linked_devtag_id,
      cycle_id: body.cycle_id,
      metadata: body.metadata ?? {},
    });
    return result;
  }));

  app.get('/plantags', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    const tags = registry.listPlantags({ project_id: q.project_id, status: q.status });
    return { tags };
  }));

  app.get('/plantags/resolve', safeRoute(async (req: FastifyRequest, reply: FastifyReply) => {
    const { tag_key } = req.query as { tag_key: string };
    if (!tag_key) return reply.status(400).send({ error: 'tag_key required' });
    const tag = registry.resolvePlantag(tag_key);
    if (!tag) return reply.status(404).send({ error: 'plantag not found' });
    return { tag };
  }));

  app.patch('/plantags/:id/status', safeRoute(async (req: FastifyRequest) => {
    const { id } = req.params as { id: string };
    const body = req.body as any;
    const updated = registry.updatePlantagStatus(id, body.status, body.blocking_reason);
    return { updated };
  }));

  // ── Buildtags ─────────────────────────────

  app.post('/buildtags', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    const result = registry.registerBuildtag({
      tag_key: body.tag_key,
      tag_type: body.tag_type,
      target_devtag_id: body.target_devtag_id,
      agent_id: body.agent_id,
      project_id: body.project_id,
      cycle_id: body.cycle_id,
      plantag_id: body.plantag_id,
      metadata: body.metadata ?? {},
    });
    return result;
  }));

  app.get('/buildtags', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as any;
    const tags = registry.listBuildtags({
      project_id: q.project_id,
      agent_id: q.agent_id,
      cycle_id: q.cycle_id,
      status: q.status,
    });
    return { tags };
  }));

  app.get('/buildtags/:id', safeRoute(async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const tag = registry.resolveBuildtag(id);
    if (!tag) return reply.status(404).send({ error: 'buildtag not found' });
    return { tag };
  }));

  app.patch('/buildtags/:id/status', safeRoute(async (req: FastifyRequest) => {
    const { id } = req.params as { id: string };
    const body = req.body as any;
    const updated = registry.updateBuildtagStatus(id, body.status, body.commit_id);
    return { updated };
  }));

  // ── Stats ─────────────────────────────────

  app.get('/stats', safeRoute(async (req: FastifyRequest) => {
    const { project_id } = req.query as { project_id?: string };
    return registry.getStats(project_id);
  }));

  // ── Context Window Exclusions ─────────────

  app.get('/excluded-tags/:cycle_id', safeRoute(async (req: FastifyRequest) => {
    const { cycle_id } = req.params as { cycle_id: string };
    const excluded = registry.getExcludedTags(cycle_id);
    return { excluded };
  }));

  // ── Tag Relationship Rules ─────────────────

  app.get('/relationship-rules', safeRoute(async () => {
    const rules = db.prepare('SELECT * FROM tag_relationship_rules ORDER BY rule_type, child_tag_type').all();
    return { rules };
  }));

  // ── Tag Vocabulary Diff ─────────────────
  // tag_vocabulary_diff(schema_version_a, schema_version_b)
  // Returns all tag types added, removed, or modified between two schema versions.
  // Used by God Factory to verify no registry entries are broken before schema changes.

  app.get('/vocabulary-diff', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as { version_a?: string; version_b?: string; project_id?: string };
    const projectId = q.project_id;

    // Collect all unique tag_types currently in registry
    const devtagTypes = (db.prepare('SELECT DISTINCT tag_type FROM devtags').all() as Array<{ tag_type: string }>).map(r => r.tag_type);
    const plantagTypes = (db.prepare('SELECT DISTINCT tag_type FROM plantags').all() as Array<{ tag_type: string }>).map(r => r.tag_type);
    const buildtagTypes = (db.prepare('SELECT DISTINCT tag_type FROM buildtags').all() as Array<{ tag_type: string }>).map(r => r.tag_type);

    // Check vocabulary_gaps for proposed new types
    let proposedTypes: Array<{ proposed_tag_type: string; occurrence_count: number; file_path: string }> = [];
    try {
      proposedTypes = db.prepare(`
        SELECT proposed_tag_type, SUM(occurrence_count) as occurrence_count, file_path
        FROM vocabulary_gaps
        WHERE resolved = 0 AND proposed_tag_type IS NOT NULL
        GROUP BY proposed_tag_type
        ORDER BY occurrence_count DESC
      `).all() as typeof proposedTypes;
    } catch { /* table may not exist */ }

    // Unused types: in schema but never written to any registry
    const unusedDevtagTypes = ['devtag:needs_rollback', 'devtag:needs_refactor', 'devtag:needs_test', 'devtag:dead_code', 'devtag:orphaned']
      .filter(t => !devtagTypes.includes(t));

    return {
      version_a: q.version_a ?? 'current',
      version_b: q.version_b ?? 'latest',
      devtag_types_in_use: devtagTypes,
      plantag_types_in_use: plantagTypes,
      buildtag_types_in_use: buildtagTypes,
      proposed_new_types: proposedTypes,
      unused_status_marker_types: unusedDevtagTypes,
      total_registered: devtagTypes.length + plantagTypes.length + buildtagTypes.length,
    };
  }));

  // ── Orphan Scan ─────────────────────────────
  // orphan_scan(registry_scope) — returns all orphaned or dead devtags in scope

  app.get('/orphan-scan', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as { project_id?: string; file_path?: string; limit?: string };
    const limit = Math.min(Math.max(Number(q.limit || 50), 1), 200);

    // Dead tags from forensic table
    let deadTags: Array<Record<string, unknown>> = [];
    try {
      deadTags = db.prepare(`
        SELECT dt.*, d.tag_key, d.tag_type, d.file_path as registry_file_path, d.status
        FROM dead_tags dt
        LEFT JOIN devtags d ON d.id = dt.devtag_id
        WHERE dt.resolved = 0
        ORDER BY dt.detected_cycle DESC
        LIMIT ?
      `).all(limit) as typeof deadTags;
    } catch {
      try {
        deadTags = db.prepare(`
          SELECT * FROM dead_tags WHERE resolved = 0 ORDER BY rowid DESC LIMIT ?
        `).all(limit) as typeof deadTags;
      } catch { /* table may not have expected shape */ }
    }

    // Registry entries with status = 'retired' or 'orphaned'
    const orphanedDevtags = db.prepare(`
      SELECT id, tag_key, tag_type, file_path, line_start, status, project_id, updated_at
      FROM devtags
      WHERE status IN ('retired', 'orphaned', 'dead')
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>;

    // Buildtags with no corresponding active devtag
    const orphanedBuildtags = db.prepare(`
      SELECT b.id, b.tag_key, b.tag_type, b.status, b.target_devtag_id, b.created_at
      FROM buildtags b
      LEFT JOIN devtags d ON d.id = b.target_devtag_id
      WHERE d.id IS NULL OR d.status IN ('retired', 'orphaned', 'dead')
      LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>;

    return {
      dead_tags: deadTags,
      orphaned_devtags: orphanedDevtags,
      orphaned_buildtags: orphanedBuildtags,
      total_orphaned: orphanedDevtags.length + deadTags.length,
    };
  }));

  // ── Conflict Scan ─────────────────────────────
  // conflict_scan(devtag_list) — returns active lock registry claims

  app.get('/conflict-scan', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as { devtag_ids?: string; project_id?: string; cycle_id?: string };
    const devtagIds = q.devtag_ids ? q.devtag_ids.split(',').map(s => s.trim()).filter(Boolean) : [];

    let activeClaims: Array<Record<string, unknown>> = [];
    try {
      if (devtagIds.length > 0) {
        const placeholders = devtagIds.map(() => '?').join(',');
        activeClaims = db.prepare(`
          SELECT c.*, d.tag_key, d.tag_type, d.file_path
          FROM devtag_claims c
          JOIN devtags d ON d.id = c.devtag_id
          WHERE c.released_at IS NULL AND c.devtag_id IN (${placeholders})
          ORDER BY c.claimed_at DESC
        `).all(...devtagIds) as typeof activeClaims;
      } else {
        const cycleFilter = q.cycle_id ? ' AND c.cycle_id = ?' : '';
        const args = q.cycle_id ? [q.cycle_id] : [];
        activeClaims = db.prepare(`
          SELECT c.*, d.tag_key, d.tag_type, d.file_path
          FROM devtag_claims c
          JOIN devtags d ON d.id = c.devtag_id
          WHERE c.released_at IS NULL${cycleFilter}
          ORDER BY c.claimed_at DESC
          LIMIT 100
        `).all(...args) as typeof activeClaims;
      }
    } catch {
      activeClaims = [];
    }

    // Also check conflict_log from forensic DB
    let conflictLog: Array<Record<string, unknown>> = [];
    try {
      conflictLog = db.prepare(`
        SELECT * FROM conflict_log
        ORDER BY timestamp DESC
        LIMIT 50
      `).all() as typeof conflictLog;
    } catch { /* not available */ }

    return {
      active_claims: activeClaims,
      recent_conflicts: conflictLog,
      total_active_claims: activeClaims.length,
    };
  }));

  // ── Resolution Latency Report ─────────────────────────────
  // resolution_latency_report(tag_type, model_tier)

  app.get('/resolution-latency', safeRoute(async (req: FastifyRequest) => {
    const q = req.query as { tag_type?: string; model_tier?: string };
    const filterTag = q.tag_type ?? null;
    const filterTier = q.model_tier ? Number(q.model_tier) : null;

    let rows: Array<Record<string, unknown>> = [];
    try {
      let sql = `
        SELECT tag_type, model_tier,
               COUNT(*) as total_calls,
               AVG(resolution_time_ms) as avg_ms,
               MIN(resolution_time_ms) as min_ms,
               MAX(resolution_time_ms) as max_ms,
               SUM(CASE WHEN cache_hit = 1 THEN 1 ELSE 0 END) as cache_hits
        FROM tag_resolution_log
        WHERE 1=1
      `;
      const args: unknown[] = [];
      if (filterTag) { sql += ' AND tag_type = ?'; args.push(filterTag); }
      if (filterTier !== null) { sql += ' AND model_tier = ?'; args.push(filterTier); }
      sql += ' GROUP BY tag_type, model_tier ORDER BY avg_ms DESC LIMIT 50';
      rows = db.prepare(sql).all(...args) as typeof rows;
    } catch { /* table may not exist */ }

    return {
      report: rows,
      filter: { tag_type: filterTag, model_tier: filterTier },
      flagged: rows.filter(r => Number(r.avg_ms || 0) > 200),
    };
  }));

  // ── Language Registry ────────────────────────
  app.get('/language-registry', safeRoute(async () => {
    let langs: Array<Record<string, unknown>> = [];
    try {
      langs = db.prepare('SELECT * FROM language_registry ORDER BY file_extension').all() as typeof langs;
    } catch { /* not available */ }
    return { languages: langs };
  }));

  app.post('/language-registry', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as {
      file_extension: string;
      grammar_name: string;
      grammar_version?: string;
      registered_by?: string;
    };
    if (!body.file_extension || !body.grammar_name) {
      return { error: 'file_extension and grammar_name are required' };
    }
    const id = `lang-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      db.prepare(`
        INSERT INTO language_registry (id, language_id, file_extension, grammar_name, grammar_version, registered_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        id,
        body.file_extension.replace(/^\./, ''),
        body.file_extension,
        body.grammar_name,
        body.grammar_version ?? 'unknown',
        body.registered_by ?? 'god_factory',
      );
      return { success: true, id };
    } catch (err: any) {
      return { error: err.message };
    }
  }));
}
