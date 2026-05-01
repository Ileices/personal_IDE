// ============================================
// Coverage Analysis Agent
// Maps current devtag coverage against active plantags.
// Three dimensions: plan, test, nano.
// Writes results to coverage_matrix table.
// ============================================
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';

export interface CoverageRecord {
  entry_id: string;
  scope: 'plan' | 'test' | 'nano' | 'total';
  plantag_or_devtag: string;
  coverage_state: 'covered' | 'partial' | 'missing' | 'not_required';
  coverage_percent: number;
  missing_tags: string[];
  cycle_id: string;
}

export interface CoverageMatrix {
  plan: CoverageRecord[];
  test: CoverageRecord[];
  nano: CoverageRecord[];
  summary: {
    plan_percent: number;
    test_percent: number;
    nano_percent: number;
    total_percent: number;
  };
  cycle_id: string;
}

export class CoverageAnalysisAgent {
  constructor(private db: Database.Database) {}

  run(cycle_id: string): CoverageMatrix {
    const t0 = Date.now();
    const plan = this.analyzePlanCoverage(cycle_id);
    const test = this.analyzeTestCoverage(cycle_id);
    const nano = this.analyzeNanoCoverage(cycle_id);

    // Persist all records
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO coverage_matrix
        (entry_id, scope, plantag_or_devtag, coverage_state, coverage_percent, missing_tags, cycle_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertAll = this.db.transaction((records: CoverageRecord[]) => {
      for (const r of records) {
        stmt.run(r.entry_id, r.scope, r.plantag_or_devtag, r.coverage_state, r.coverage_percent,
          JSON.stringify(r.missing_tags), r.cycle_id);
      }
    });
    insertAll([...plan, ...test, ...nano]);

    // Log tool call
    this.logToolCall('coverage_analysis_run', 'coverage-analysis-agent', cycle_id, Date.now() - t0);

    const avg = (arr: CoverageRecord[]) =>
      arr.length === 0 ? 100 : arr.reduce((s, r) => s + r.coverage_percent, 0) / arr.length;

    const planPct = avg(plan);
    const testPct = avg(test);
    const nanoPct = avg(nano);
    const totalPct = (planPct + testPct + nanoPct) / 3;

    return {
      plan,
      test,
      nano,
      summary: {
        plan_percent: Math.round(planPct * 10) / 10,
        test_percent: Math.round(testPct * 10) / 10,
        nano_percent: Math.round(nanoPct * 10) / 10,
        total_percent: Math.round(totalPct * 10) / 10,
      },
      cycle_id,
    };
  }

  // ── Plan Coverage ─────────────────────────────────────────────────────────
  private analyzePlanCoverage(cycle_id: string): CoverageRecord[] {
    const records: CoverageRecord[] = [];

    // Get all active plantags with their requires/produces metadata
    const plantags = this.db.prepare(`
      SELECT id, tag_key, metadata FROM plantags
      WHERE status NOT IN ('done','orphaned')
    `).all() as any[];

    for (const plantag of plantags) {
      let meta: any = {};
      try { meta = JSON.parse(plantag.metadata ?? '{}'); } catch { /* ignore */ }

      const requires: string[] = Array.isArray(meta.requires) ? meta.requires : [];
      const produces: string[] = Array.isArray(meta.produces) ? meta.produces : [];
      const allExpected = [...requires, ...produces];

      if (allExpected.length === 0) {
        records.push({
          entry_id: uuid(),
          scope: 'plan',
          plantag_or_devtag: plantag.tag_key,
          coverage_state: 'not_required',
          coverage_percent: 100,
          missing_tags: [],
          cycle_id,
        });
        continue;
      }

      const missing: string[] = [];
      for (const tagKey of allExpected) {
        const exists = this.db.prepare(
          `SELECT 1 FROM devtags WHERE tag_key = ? AND status = 'active' LIMIT 1`
        ).get(tagKey);
        if (!exists) missing.push(tagKey);
      }

      const pct = ((allExpected.length - missing.length) / allExpected.length) * 100;
      records.push({
        entry_id: uuid(),
        scope: 'plan',
        plantag_or_devtag: plantag.tag_key,
        coverage_state: missing.length === 0 ? 'covered' : pct > 0 ? 'partial' : 'missing',
        coverage_percent: Math.round(pct * 10) / 10,
        missing_tags: missing,
        cycle_id,
      });
    }

    return records;
  }

  // ── Test Coverage ─────────────────────────────────────────────────────────
  private analyzeTestCoverage(cycle_id: string): CoverageRecord[] {
    const records: CoverageRecord[] = [];
    const testableTypes = ['function', 'method', 'handler', 'route', 'worker'];

    const components = this.db.prepare(`
      SELECT id, tag_key, tag_type, metadata FROM devtags
      WHERE tag_type IN (${testableTypes.map(() => '?').join(',')}) AND status = 'active'
    `).all(...testableTypes) as any[];

    for (const comp of components) {
      // Look for a devtag:test associated with this component
      const testExists = this.db.prepare(`
        SELECT 1 FROM devtags
        WHERE tag_type = 'test' AND status = 'active'
          AND (
            parent_id = ?
            OR tag_key LIKE ?
            OR metadata LIKE ?
          )
        LIMIT 1
      `).get(comp.id, `%:test:${comp.tag_key.split(':').pop()}%`, `%"covers":"${comp.tag_key}"%`);

      let meta: any = {};
      try { meta = JSON.parse(comp.metadata ?? '{}'); } catch { /* ignore */ }
      const testRequired = meta.test_required === true;

      if (testExists) {
        records.push({
          entry_id: uuid(),
          scope: 'test',
          plantag_or_devtag: comp.tag_key,
          coverage_state: 'covered',
          coverage_percent: 100,
          missing_tags: [],
          cycle_id,
        });
      } else {
        records.push({
          entry_id: uuid(),
          scope: 'test',
          plantag_or_devtag: comp.tag_key,
          coverage_state: 'missing',
          coverage_percent: 0,
          missing_tags: [`devtag:test:${comp.tag_key}` + (testRequired ? ' [REQUIRED]' : '')],
          cycle_id,
        });
      }
    }

    return records;
  }

  // ── Nano Coverage ─────────────────────────────────────────────────────────
  private analyzeNanoCoverage(cycle_id: string): CoverageRecord[] {
    const records: CoverageRecord[] = [];

    const nanoComponents = this.db.prepare(`
      SELECT id, tag_key, tag_type FROM devtags
      WHERE tag_type LIKE 'nano:%' AND status = 'active'
        AND tag_type NOT LIKE 'nano:training_target%'
        AND tag_type NOT LIKE 'nano:fitness%'
        AND tag_type NOT LIKE 'nano:replay%'
    `).all() as any[];

    for (const nano of nanoComponents) {
      const baseName = nano.tag_key;
      const missing: string[] = [];

      const hasTrainingTarget = this.db.prepare(`
        SELECT 1 FROM devtags WHERE tag_type = 'nano:training_target' AND status = 'active'
          AND (parent_id = ? OR metadata LIKE ?) LIMIT 1
      `).get(nano.id, `%"nano_component":"${baseName}"%`);
      if (!hasTrainingTarget) missing.push(`devtag:nano:training_target for ${baseName}`);

      const hasFitness = this.db.prepare(`
        SELECT 1 FROM devtags WHERE tag_type = 'nano:fitness' AND status = 'active'
          AND (parent_id = ? OR metadata LIKE ?) LIMIT 1
      `).get(nano.id, `%"nano_component":"${baseName}"%`);
      if (!hasFitness) missing.push(`devtag:nano:fitness for ${baseName}`);

      const pct = missing.length === 0 ? 100 : missing.length === 2 ? 0 : 50;
      records.push({
        entry_id: uuid(),
        scope: 'nano',
        plantag_or_devtag: baseName,
        coverage_state: pct === 100 ? 'covered' : pct === 0 ? 'missing' : 'partial',
        coverage_percent: pct,
        missing_tags: missing,
        cycle_id,
      });
    }

    return records;
  }

  /** Query current coverage matrix from DB */
  getMatrix(scope?: string, phase_filter?: string): CoverageRecord[] {
    let query = 'SELECT * FROM coverage_matrix WHERE 1=1';
    const params: any[] = [];
    if (scope) { query += ' AND scope = ?'; params.push(scope); }
    query += ' ORDER BY coverage_percent ASC LIMIT 500';
    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(r => ({ ...r, missing_tags: JSON.parse(r.missing_tags ?? '[]') }));
  }

  /** Single plantag coverage check (used by gap tools) */
  checkCoverage(plantag_id: string): {
    tag_key: string;
    requires: string[];
    requires_present: string[];
    requires_missing: string[];
    produces: string[];
    produces_created: string[];
    produces_missing: string[];
    coverage_percent: number;
  } {
    const plantag = this.db.prepare(
      'SELECT tag_key, metadata FROM plantags WHERE id = ? OR tag_key = ?'
    ).get(plantag_id, plantag_id) as any;

    if (!plantag) return {
      tag_key: plantag_id, requires: [], requires_present: [], requires_missing: [],
      produces: [], produces_created: [], produces_missing: [], coverage_percent: 0,
    };

    let meta: any = {};
    try { meta = JSON.parse(plantag.metadata ?? '{}'); } catch { /* ignore */ }

    const requires: string[] = Array.isArray(meta.requires) ? meta.requires : [];
    const produces: string[] = Array.isArray(meta.produces) ? meta.produces : [];
    const requiresPresent: string[] = [];
    const requiresMissing: string[] = [];
    const producesCreated: string[] = [];
    const producesMissing: string[] = [];

    for (const t of requires) {
      const found = this.db.prepare(`SELECT 1 FROM devtags WHERE tag_key = ? AND status = 'active' LIMIT 1`).get(t);
      (found ? requiresPresent : requiresMissing).push(t);
    }
    for (const t of produces) {
      const found = this.db.prepare(`SELECT 1 FROM devtags WHERE tag_key = ? AND status = 'active' LIMIT 1`).get(t);
      (found ? producesCreated : producesMissing).push(t);
    }

    const total = requires.length + produces.length;
    const found = requiresPresent.length + producesCreated.length;
    const pct = total === 0 ? 100 : (found / total) * 100;

    return {
      tag_key: plantag.tag_key,
      requires,
      requires_present: requiresPresent,
      requires_missing: requiresMissing,
      produces,
      produces_created: producesCreated,
      produces_missing: producesMissing,
      coverage_percent: Math.round(pct * 10) / 10,
    };
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
