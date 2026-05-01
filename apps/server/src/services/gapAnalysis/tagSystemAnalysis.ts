// ============================================
// Tag System Analysis Agent
// Four analyses: vocabulary coverage, utilization,
// collision detection, resolution performance.
// ============================================
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';

export interface VocabularyGap {
  entry_id: string;
  file_path: string;
  untagged_structure_type: string;
  occurrence_count: number;
  first_detected_cycle: string;
  resolved: boolean;
  proposed_tag_type?: string;
}

export interface TagCollision {
  entry_id: string;
  devtag_name: string;
  file_a: string;
  parent_a?: string;
  file_b: string;
  parent_b?: string;
  detected_cycle: string;
  resolved: boolean;
}

export interface UtilizationReport {
  total_types: number;
  never_used_types: string[];
  god_factory_only_types: string[];
  well_used_types: { tag_type: string; count: number }[];
}

export interface ResolutionLatencyReport {
  tag_type: string;
  model_tier: string;
  average_ms: number;
  median_ms: number;
  p95_ms: number;
  slow_count: number;
  total_entries: number;
}

// Known structural patterns in TypeScript/JavaScript code that might be untagged
const UNTAGGED_PATTERNS = [
  { pattern: /export\s+(default\s+)?function\s+\w+/, type: 'function' },
  { pattern: /export\s+(default\s+)?class\s+\w+/, type: 'class' },
  { pattern: /export\s+(default\s+)?interface\s+\w+/, type: 'interface' },
  { pattern: /export\s+(default\s+)?type\s+\w+\s*=/, type: 'type_alias' },
  { pattern: /export\s+(default\s+)?enum\s+\w+/, type: 'enum' },
  { pattern: /export\s+const\s+\w+\s*=/, type: 'exported_const' },
  { pattern: /app\.(get|post|put|patch|delete)\(/, type: 'route' },
  { pattern: /addEventListener\(|\.on\(/, type: 'event_handler' },
  { pattern: /import\s+.*\s+from\s+['"]/, type: 'import' },
  { pattern: /useEffect\(|useState\(|useCallback\(|useMemo\(/, type: 'react_hook' },
  { pattern: /test\(|it\(|describe\(|expect\(/, type: 'test_block' },
];

export class TagSystemAnalysisAgent {
  constructor(private db: Database.Database) {}

  /** Run all four analyses */
  runAll(project_root: string, cycle_id: string): {
    vocabulary: VocabularyGap[];
    collisions: TagCollision[];
    utilization: UtilizationReport;
    resolution_latency_flags: ResolutionLatencyReport[];
  } {
    return {
      vocabulary: this.analyzeVocabulary(project_root, cycle_id),
      collisions: this.analyzeCollisions(cycle_id),
      utilization: this.analyzeUtilization(),
      resolution_latency_flags: this.analyzeResolutionPerformance(),
    };
  }

  // ── 1. Vocabulary Coverage Analysis ─────────────────────────────────────
  analyzeVocabulary(project_root: string, cycle_id: string): VocabularyGap[] {
    const t0 = Date.now();
    const gaps: VocabularyGap[] = [];

    // Get all files that have devtags registered
    const taggedFiles = new Set<string>(
      (this.db.prepare('SELECT DISTINCT file_path FROM devtags WHERE file_path IS NOT NULL').all() as any[])
        .map(r => r.file_path)
    );

    // Get all devtag types in registry for known files
    const knownTypes = new Map<string, Set<string>>();
    const registryEntries = this.db.prepare(
      'SELECT file_path, tag_type FROM devtags WHERE status = "active"'
    ).all() as any[];
    for (const r of registryEntries) {
      if (!knownTypes.has(r.file_path)) knownTypes.set(r.file_path, new Set());
      knownTypes.get(r.file_path)!.add(r.tag_type);
    }

    // For each tagged file, check if any common patterns exist without corresponding devtag types
    for (const filePath of taggedFiles) {
      const fileTypes = knownTypes.get(filePath) ?? new Set<string>();
      const untaggedInFile: Map<string, number> = new Map();

      // Check which standard structural patterns the file likely has based on its extension
      const isTS = filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js');
      if (!isTS) continue;

      for (const { type } of UNTAGGED_PATTERNS) {
        // If file doesn't have this type tagged but likely should (heuristic: function/class expected for .ts files)
        if (!fileTypes.has(type) && (type === 'function' || type === 'class' || type === 'route' || type === 'interface')) {
          untaggedInFile.set(type, (untaggedInFile.get(type) ?? 0) + 1);
        }
      }

      for (const [structType, count] of untaggedInFile) {
        // Check if this gap is already recorded
        const existing = this.db.prepare(
          'SELECT entry_id, occurrence_count FROM vocabulary_gaps WHERE file_path = ? AND untagged_structure_type = ? AND resolved = 0 LIMIT 1'
        ).get(filePath, structType) as any;

        if (existing) {
          this.db.prepare(
            'UPDATE vocabulary_gaps SET occurrence_count = ? WHERE entry_id = ?'
          ).run(existing.occurrence_count + count, existing.entry_id);
          gaps.push({
            entry_id: existing.entry_id,
            file_path: filePath,
            untagged_structure_type: structType,
            occurrence_count: existing.occurrence_count + count,
            first_detected_cycle: cycle_id,
            resolved: false,
            proposed_tag_type: `devtag:${structType}`,
          });
        } else {
          const entry_id = uuid();
          this.db.prepare(`
            INSERT INTO vocabulary_gaps (entry_id, file_path, untagged_structure_type, occurrence_count, first_detected_cycle, proposed_tag_type)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(entry_id, filePath, structType, count, cycle_id, `devtag:${structType}`);
          gaps.push({
            entry_id,
            file_path: filePath,
            untagged_structure_type: structType,
            occurrence_count: count,
            first_detected_cycle: cycle_id,
            resolved: false,
            proposed_tag_type: `devtag:${structType}`,
          });
        }
      }
    }

    this.logToolCall('vocabulary_analysis', 'tag-system-agent', cycle_id, Date.now() - t0);
    return gaps;
  }

  resolveVocabularyGap(entry_id: string): void {
    this.db.prepare('UPDATE vocabulary_gaps SET resolved = 1 WHERE entry_id = ?').run(entry_id);
  }

  getVocabularyGaps(resolved = false): VocabularyGap[] {
    const rows = this.db.prepare(
      'SELECT * FROM vocabulary_gaps WHERE resolved = ? ORDER BY occurrence_count DESC LIMIT 200'
    ).all(resolved ? 1 : 0) as any[];
    return rows.map(r => ({ ...r, resolved: !!r.resolved }));
  }

  // ── 2. Utilization Analysis ──────────────────────────────────────────────
  analyzeUtilization(): UtilizationReport {
    // All distinct tag types in the schema (from registry + known types)
    const allRegisteredTypes = (this.db.prepare(
      'SELECT DISTINCT tag_type, COUNT(*) as cnt FROM devtags GROUP BY tag_type ORDER BY cnt DESC'
    ).all() as any[]);

    const neverUsed: string[] = allRegisteredTypes
      .filter(r => r.cnt === 0)
      .map(r => r.tag_type);

    const wellUsed = allRegisteredTypes
      .filter(r => r.cnt >= 3)
      .slice(0, 20)
      .map(r => ({ tag_type: r.tag_type, count: r.cnt }));

    // God Factory only: tag types only used by agent with 'god' in ID
    // (heuristic: check buildtags with god_factory agent_id)
    const godOnlyRows = this.db.prepare(`
      SELECT DISTINCT bt.tag_type FROM buildtags bt
      WHERE bt.agent_id LIKE '%god%'
        AND bt.tag_type NOT IN (
          SELECT DISTINCT tag_type FROM buildtags WHERE agent_id NOT LIKE '%god%'
        )
    `).all() as any[];
    const godFactoryOnly = godOnlyRows.map(r => r.tag_type);

    return {
      total_types: allRegisteredTypes.length,
      never_used_types: neverUsed,
      god_factory_only_types: godFactoryOnly,
      well_used_types: wellUsed,
    };
  }

  // ── 3. Collision Analysis ────────────────────────────────────────────────
  analyzeCollisions(cycle_id: string): TagCollision[] {
    const collisions: TagCollision[] = [];

    // Find devtags with same name but different files or different parent
    const rows = this.db.prepare(`
      SELECT a.id as a_id, a.name as devtag_name, a.file_path as file_a, a.parent_id as parent_a_id,
             b.id as b_id, b.file_path as file_b, b.parent_id as parent_b_id
      FROM devtags a
      INNER JOIN devtags b ON a.name = b.name AND a.id < b.id
      WHERE (a.file_path != b.file_path OR a.parent_id != b.parent_id)
        AND a.status = 'active' AND b.status = 'active'
      LIMIT 200
    `).all() as any[];

    for (const row of rows) {
      // Check if collision already recorded
      const existing = this.db.prepare(
        `SELECT entry_id FROM tag_collisions WHERE devtag_name = ? AND file_a = ? AND file_b = ? AND resolved = 0 LIMIT 1`
      ).get(row.devtag_name, row.file_a ?? '', row.file_b ?? '') as any;

      if (!existing) {
        const entry_id = uuid();
        const parentA = row.parent_a_id ? (this.db.prepare('SELECT tag_key FROM devtags WHERE id = ?').get(row.parent_a_id) as any)?.tag_key : null;
        const parentB = row.parent_b_id ? (this.db.prepare('SELECT tag_key FROM devtags WHERE id = ?').get(row.parent_b_id) as any)?.tag_key : null;

        this.db.prepare(`
          INSERT INTO tag_collisions (entry_id, devtag_name, file_a, parent_a, file_b, parent_b, detected_cycle)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(entry_id, row.devtag_name, row.file_a ?? '', parentA ?? null, row.file_b ?? '', parentB ?? null, cycle_id);

        collisions.push({
          entry_id,
          devtag_name: row.devtag_name,
          file_a: row.file_a ?? '',
          parent_a: parentA,
          file_b: row.file_b ?? '',
          parent_b: parentB,
          detected_cycle: cycle_id,
          resolved: false,
        });
      }
    }

    return collisions;
  }

  getCollisions(resolved = false): TagCollision[] {
    return this.db.prepare(
      'SELECT * FROM tag_collisions WHERE resolved = ? ORDER BY timestamp DESC LIMIT 100'
    ).all(resolved ? 1 : 0) as any[];
  }

  resolveCollision(entry_id: string): void {
    this.db.prepare('UPDATE tag_collisions SET resolved = 1 WHERE entry_id = ?').run(entry_id);
  }

  // ── 4. Resolution Performance Analysis ──────────────────────────────────
  analyzeResolutionPerformance(): ResolutionLatencyReport[] {
    const SLOW_THRESHOLD_MS = 200;
    const rows = this.db.prepare(`
      SELECT tag_type, model_tier,
        AVG(resolution_time_ms) as avg_ms,
        COUNT(*) as total
      FROM tag_resolution_log
      GROUP BY tag_type, model_tier
      HAVING avg_ms > ?
      ORDER BY avg_ms DESC LIMIT 50
    `).all(SLOW_THRESHOLD_MS) as any[];

    return rows.map(r => {
      // Get all values for this type+tier for median/p95
      const vals = (this.db.prepare(
        'SELECT resolution_time_ms FROM tag_resolution_log WHERE tag_type = ? AND model_tier = ? ORDER BY resolution_time_ms'
      ).all(r.tag_type, r.model_tier) as any[]).map(v => v.resolution_time_ms);

      const median = vals.length > 0 ? vals[Math.floor(vals.length / 2)] : 0;
      const p95 = vals.length > 0 ? vals[Math.floor(vals.length * 0.95)] : 0;
      const slowCount = vals.filter(v => v > SLOW_THRESHOLD_MS).length;

      return {
        tag_type: r.tag_type,
        model_tier: r.model_tier,
        average_ms: Math.round(r.avg_ms),
        median_ms: median,
        p95_ms: p95,
        slow_count: slowCount,
        total_entries: r.total,
      };
    });
  }

  getResolutionLatencyReport(tag_type: string, model_tier: string): ResolutionLatencyReport | null {
    const vals = (this.db.prepare(
      'SELECT resolution_time_ms FROM tag_resolution_log WHERE tag_type = ? AND model_tier LIKE ? ORDER BY resolution_time_ms'
    ).all(tag_type, model_tier === '*' ? '%' : model_tier) as any[]).map(v => v.resolution_time_ms);

    if (vals.length === 0) return null;

    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    const median = vals[Math.floor(vals.length / 2)];
    const p95 = vals[Math.floor(vals.length * 0.95)];
    const slowCount = vals.filter(v => v > 200).length;

    return {
      tag_type,
      model_tier,
      average_ms: Math.round(avg),
      median_ms: median,
      p95_ms: p95,
      slow_count: slowCount,
      total_entries: vals.length,
    };
  }

  /** Tag vocabulary diff between two schema versions (tracked via devtag metadata) */
  vocabularyDiff(cycle_a: string, cycle_b: string): {
    added: string[];
    removed: string[];
    modified: string[];
  } {
    const typesAtA = new Set<string>(
      (this.db.prepare(
        `SELECT DISTINCT tag_type FROM devtags WHERE created_at <= ? AND status != 'dead'`
      ).all(cycle_a) as any[]).map(r => r.tag_type)
    );
    const typesAtB = new Set<string>(
      (this.db.prepare(
        `SELECT DISTINCT tag_type FROM devtags WHERE created_at <= ? AND status != 'dead'`
      ).all(cycle_b) as any[]).map(r => r.tag_type)
    );

    const added = [...typesAtB].filter(t => !typesAtA.has(t));
    const removed = [...typesAtA].filter(t => !typesAtB.has(t));
    // Modified: same type but different definition (approximated by changed count)
    const modified: string[] = [];

    return { added, removed, modified };
  }

  private logToolCall(tag_type: string, agent_id: string, cycle_id: string, ms: number) {
    try {
      this.db.prepare(`
        INSERT INTO tag_resolution_log (entry_id, tag_type, agent_id, cycle_id, resolution_time_ms)
        VALUES (?, ?, ?, ?, ?)
      `).run(uuid(), tag_type, agent_id, cycle_id, ms);
    } catch { /* non-blocking */ }
  }
}
