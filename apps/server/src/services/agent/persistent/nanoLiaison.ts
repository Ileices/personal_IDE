// ============================================
// Nano Liaison Agent (persistent)
// Maintains bidirectional translation map between
// nano sea internal state and devtag:nano taxonomy.
// Monitors nano cycle outputs for structural anomalies.
// ============================================
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import type { TagRegistryService } from '../../tagRegistry/index.js';

export interface NanoTranslation {
  nano_key: string;      // Nano sea internal state key
  devtag_key: string;    // Corresponding devtag:nano:* key
  direction: 'nano_to_tag' | 'tag_to_nano' | 'bidirectional';
}

export interface NanoAnomalyReport {
  nano_devtag: string;
  anomaly_type: 'nan_weights' | 'inf_weights' | 'identical_generation' | 'rby_stall' | 'other';
  cycle_id: string;
  generation_id?: string;
  matrix_name?: string;
  detail: string;
}

export class NanoLiaisonAgent {
  private translationMap: Map<string, NanoTranslation> = new Map();

  constructor(
    private db: Database.Database,
    private tagRegistry: TagRegistryService
  ) {
    this.loadTranslationMap();
  }

  /**
   * Register a bidirectional translation between nano internal state and devtag.
   */
  registerTranslation(opts: NanoTranslation): void {
    this.translationMap.set(opts.nano_key, opts);

    // Ensure the devtag:nano tag exists in the registry
    const existing = this.tagRegistry.resolveDevtag(opts.devtag_key);
    if (!existing) {
      const parts = opts.devtag_key.split(':');
      const tag_type = parts.slice(1, -1).join(':'); // e.g. nano:module
      const name = parts[parts.length - 1];
      this.tagRegistry.registerDevtag({
        tag_key: opts.devtag_key,
        tag_type,
        name,
        metadata: { nano_key: opts.nano_key },
      });
    }
  }

  /**
   * Translate nano sea internal state to devtag:nano tags after a cycle completes.
   */
  translateNanoStateToDdevtags(nanoState: Record<string, unknown>): { registered: string[]; errors: string[] } {
    const registered: string[] = [];
    const errors: string[] = [];

    for (const [nano_key, value] of Object.entries(nanoState)) {
      const translation = this.translationMap.get(nano_key);
      if (!translation) continue;

      const devtag = this.tagRegistry.resolveDevtag(translation.devtag_key);
      if (devtag) {
        // Update existing devtag with new nano state
        this.tagRegistry.updateDevtag(devtag.id, {
          metadata: { ...devtag.metadata, nano_value: value, last_updated: new Date().toISOString() },
        });
      } else {
        // Register new devtag
        const parts = translation.devtag_key.split(':');
        const tag_type = parts.slice(1, -1).join(':');
        const name = parts[parts.length - 1];
        const result = this.tagRegistry.registerDevtag({
          tag_key: translation.devtag_key,
          tag_type,
          name,
          metadata: { nano_key, nano_value: value },
        });
        if (result.success) registered.push(translation.devtag_key);
        else errors.push(`Failed to register ${translation.devtag_key}: ${result.error}`);
      }
    }

    return { registered, errors };
  }

  /**
   * Translate devtag:nano buildtag set to nano sea internal state representations.
   */
  translateBuildtagsToNanoState(buildtag_ids: string[]): Record<string, unknown> {
    const nanoState: Record<string, unknown> = {};

    for (const bt_id of buildtag_ids) {
      const bt = this.tagRegistry.resolveBuildtag(bt_id);
      if (!bt?.target_devtag_id) continue;

      const devtag = this.tagRegistry.getDevtagById(bt.target_devtag_id);
      if (!devtag || !devtag.tag_key.startsWith('devtag:nano:')) continue;

      // Find the nano key for this devtag
      for (const [nano_key, translation] of this.translationMap.entries()) {
        if (translation.devtag_key === devtag.tag_key) {
          nanoState[nano_key] = {
            buildtag_type: bt.tag_type,
            buildtag_id: bt.id,
            agent_id: bt.agent_id,
            metadata: bt.metadata,
          };
        }
      }
    }

    return nanoState;
  }

  /**
   * Monitor nano cycle output for structural anomalies.
   * Logs any found anomalies to the forensic DB.
   */
  checkForAnomalies(opts: {
    cycle_id: string;
    generation_id?: string;
    agent_id: string;
    weights?: Record<string, number[][]>;
    generation_output?: unknown;
    previous_generation_output?: unknown;
    rby_phases?: { r: number; b: number; y: number };
  }): NanoAnomalyReport[] {
    const { cycle_id, generation_id, agent_id, weights, generation_output, previous_generation_output, rby_phases } = opts;
    const anomalies: NanoAnomalyReport[] = [];

    // Check for NaN/Inf weights
    if (weights) {
      for (const [matrix_name, matrix] of Object.entries(weights)) {
        for (const row of matrix) {
          for (const val of row) {
            if (isNaN(val)) {
              anomalies.push({ nano_devtag: `devtag:nano:weight:${matrix_name}`, anomaly_type: 'nan_weights', cycle_id, generation_id, matrix_name, detail: `NaN detected in weight matrix ${matrix_name}` });
              break;
            }
            if (!isFinite(val)) {
              anomalies.push({ nano_devtag: `devtag:nano:weight:${matrix_name}`, anomaly_type: 'inf_weights', cycle_id, generation_id, matrix_name, detail: `Inf detected in weight matrix ${matrix_name}` });
              break;
            }
          }
        }
      }
    }

    // Check for identical generation output
    if (generation_output !== undefined && previous_generation_output !== undefined) {
      if (JSON.stringify(generation_output) === JSON.stringify(previous_generation_output)) {
        anomalies.push({ nano_devtag: 'devtag:nano:generation:current', anomaly_type: 'identical_generation', cycle_id, generation_id, detail: 'Generation cycle produced identical output to prior generation' });
      }
    }

    // Check for RBY loop stall
    if (rby_phases) {
      const { r, b, y } = rby_phases;
      const maxPhase = Math.max(r, b, y);
      const minPhase = Math.min(r, b, y);
      if (maxPhase > 0 && minPhase === 0) {
        const stalledPhase = r === 0 ? 'r' : b === 0 ? 'b' : 'y';
        anomalies.push({ nano_devtag: `devtag:nano:rby:${stalledPhase}:stalled`, anomaly_type: 'rby_stall', cycle_id, generation_id, detail: `RBY loop stalled in phase ${stalledPhase} (count=0 while others are nonzero)` });
      }
    }

    // Log all anomalies to forensic DB
    for (const anomaly of anomalies) {
      this.db.prepare(`
        INSERT INTO nano_anomalies (entry_id, nano_devtag, anomaly_type, cycle_id, generation_id, matrix_name, detail, agent_id)
        VALUES (?,?,?,?,?,?,?,?)
      `).run(uuid(), anomaly.nano_devtag, anomaly.anomaly_type, anomaly.cycle_id, anomaly.generation_id ?? null, anomaly.matrix_name ?? null, anomaly.detail, agent_id);
    }

    return anomalies;
  }

  /**
   * Verify that every devtag:nano tag written by a Fleet Agents-Nano step
   * has a valid translation in nano sea internal state.
   */
  verifyNanoTagTranslations(devtag_ids: string[]): { valid: boolean; untranslated: string[] } {
    const untranslated: string[] = [];

    for (const dt_id of devtag_ids) {
      const dt = this.tagRegistry.getDevtagById(dt_id);
      if (!dt || !dt.tag_key.startsWith('devtag:nano:')) continue;

      let hasTranslation = false;
      for (const translation of this.translationMap.values()) {
        if (translation.devtag_key === dt.tag_key) {
          hasTranslation = true;
          break;
        }
      }

      if (!hasTranslation) untranslated.push(dt.tag_key);
    }

    return { valid: untranslated.length === 0, untranslated };
  }

  /**
   * Get nano anomaly history.
   */
  getAnomalyHistory(opts: { cycle_id?: string; anomaly_type?: string; limit?: number } = {}): any[] {
    let query = 'SELECT * FROM nano_anomalies WHERE 1=1';
    const params: any[] = [];
    if (opts.cycle_id) { query += ' AND cycle_id = ?'; params.push(opts.cycle_id); }
    if (opts.anomaly_type) { query += ' AND anomaly_type = ?'; params.push(opts.anomaly_type); }
    query += ' ORDER BY created_at DESC';
    if (opts.limit) query += ` LIMIT ${opts.limit}`;
    return this.db.prepare(query).all(...params) as any[];
  }

  private loadTranslationMap(): void {
    // Seed default translations for known nano sea components
    // These can be extended by registerTranslation() at runtime
    const defaults: NanoTranslation[] = [
      { nano_key: 'embedding_layer', devtag_key: 'devtag:nano:layer:embedding', direction: 'bidirectional' },
      { nano_key: 'attention_layer', devtag_key: 'devtag:nano:layer:attention', direction: 'bidirectional' },
      { nano_key: 'output_layer', devtag_key: 'devtag:nano:layer:output', direction: 'bidirectional' },
      { nano_key: 'frozen_weights', devtag_key: 'devtag:nano:weight:frozen:base', direction: 'bidirectional' },
      { nano_key: 'personal_weights', devtag_key: 'devtag:nano:weight:personal:user', direction: 'bidirectional' },
    ];
    for (const d of defaults) {
      this.translationMap.set(d.nano_key, d);
    }
  }
}
