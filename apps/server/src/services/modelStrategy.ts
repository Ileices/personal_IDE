import { getDefaultPreset, getPreset } from '@personal-ide/shared';

export interface ModelStrategySettings {
  presetId: string;
  primaryModel: string;
  fallbackModels: string[];
  blockedModels: string[];
  cleanupFailedModels: boolean;
}

const SETTINGS_KEY = 'model_strategy:settings';
const DEFAULT_PRESET = getDefaultPreset();

const DEFAULT_SETTINGS: ModelStrategySettings = {
  presetId: DEFAULT_PRESET.id,
  primaryModel: DEFAULT_PRESET.primaryModel,
  fallbackModels: DEFAULT_PRESET.fallbackChain.filter(model => model !== DEFAULT_PRESET.primaryModel),
  blockedModels: [],
  cleanupFailedModels: true,
};

// ── Task type inference ──────────────────────────────────────
// Maps free-text task descriptions to the employer_analysis task_types vocabulary.
// These keywords correspond to the MidwifeTaskType values used in employer analysis.
const TASK_TYPE_KEYWORDS: Array<{ type: string; keywords: string[] }> = [
  { type: 'debugging',         keywords: ['fix', 'bug', 'error', 'broken', 'crash', 'debug', 'issue', 'fail'] },
  { type: 'test_generation',   keywords: ['test', 'spec', 'unit test', 'coverage', 'assert'] },
  { type: 'documentation',     keywords: ['document', 'docs', 'readme', 'comment', 'explain', 'jsdoc', 'docstring'] },
  { type: 'refactoring',       keywords: ['refactor', 'clean', 'extract', 'simplify', 'rename', 'reorganize'] },
  { type: 'security_review',   keywords: ['security', 'auth', 'inject', 'vuln', 'xss', 'csrf', 'owasp', 'exploit'] },
  { type: 'architecture',      keywords: ['architect', 'design', 'structure', 'plan', 'schema', 'model', 'system'] },
  { type: 'code_generation',   keywords: ['implement', 'create', 'add', 'build', 'write', 'generate', 'scaffold'] },
];

/**
 * Infer the MidwifeTaskType from a free-text task description.
 * Used to route model selection through employer_analysis preferences.
 * Returns the best-matching type or undefined if no match.
 */
export function inferTaskTypeFromText(task: string): string | undefined {
  if (!task) return undefined;
  const lower = task.toLowerCase();
  let bestType: string | undefined;
  let bestScore = 0;

  for (const { type, keywords } of TASK_TYPE_KEYWORDS) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  return bestScore > 0 ? bestType : undefined;
}

function getKv(db: any, key: string): string | null {
  const row = db.prepare('SELECT value FROM app_kv WHERE key = ?').get(key) as { value?: string } | undefined;
  return row?.value ?? null;
}

function setKv(db: any, key: string, value: string): void {
  db.prepare(
    `INSERT INTO app_kv (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(key, value);
}

function dedupeModels(models: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const model of models) {
    const trimmed = model.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function applyCooldownOverrides(db: any, models: string[]): string[] {
  if (!models.length) return models;
  try {
    const nowIso = new Date().toISOString();
    const rows = db.prepare(`
      SELECT model_id, override_type, cooldown_until, sleep_until, skip_next_cycles
      FROM model_cooldown_overrides
      WHERE active = 1
    `).all() as Array<{
      model_id: string;
      override_type: 'cooldown' | 'skip' | 'sleep';
      cooldown_until: string | null;
      sleep_until: string | null;
      skip_next_cycles: number;
    }>;

    const blocked = new Set<string>();

    for (const row of rows) {
      if (!row?.model_id) continue;

      if (row.override_type === 'cooldown') {
        if (row.cooldown_until && row.cooldown_until > nowIso) {
          blocked.add(row.model_id);
        } else {
          db.prepare(`UPDATE model_cooldown_overrides SET active = 0, updated_at = datetime('now') WHERE model_id = ?`).run(row.model_id);
        }
        continue;
      }

      if (row.override_type === 'sleep') {
        if (row.sleep_until && row.sleep_until > nowIso) {
          blocked.add(row.model_id);
        } else {
          db.prepare(`UPDATE model_cooldown_overrides SET active = 0, updated_at = datetime('now') WHERE model_id = ?`).run(row.model_id);
        }
        continue;
      }

      if ((row.skip_next_cycles || 0) > 0) {
        blocked.add(row.model_id);
        const nextCycles = (row.skip_next_cycles || 0) - 1;
        if (nextCycles <= 0) {
          db.prepare(`UPDATE model_cooldown_overrides SET active = 0, skip_next_cycles = 0, updated_at = datetime('now') WHERE model_id = ?`).run(row.model_id);
        } else {
          db.prepare(`UPDATE model_cooldown_overrides SET skip_next_cycles = ?, updated_at = datetime('now') WHERE model_id = ?`).run(nextCycles, row.model_id);
        }
      } else {
        db.prepare(`UPDATE model_cooldown_overrides SET active = 0, updated_at = datetime('now') WHERE model_id = ?`).run(row.model_id);
      }
    }

    return models.filter((m) => !blocked.has(m));
  } catch {
    return models;
  }
}

function normalizeStrategy(input?: Partial<ModelStrategySettings>): ModelStrategySettings {
  const preset = getPreset(input?.presetId || DEFAULT_SETTINGS.presetId) || DEFAULT_PRESET;
  const blockedModels = dedupeModels(input?.blockedModels || DEFAULT_SETTINGS.blockedModels);
  const primaryModel = (input?.primaryModel || preset.primaryModel || DEFAULT_SETTINGS.primaryModel).trim();
  const fallbackSeed = input?.fallbackModels?.length
    ? input.fallbackModels
    : preset.fallbackChain.filter(model => model !== primaryModel);

  return {
    presetId: preset.id,
    primaryModel,
    fallbackModels: dedupeModels(fallbackSeed).filter(model => model !== primaryModel && !blockedModels.includes(model)),
    blockedModels,
    cleanupFailedModels: input?.cleanupFailedModels ?? DEFAULT_SETTINGS.cleanupFailedModels,
  };
}

export function loadModelStrategy(db: any): ModelStrategySettings {
  try {
    const raw = getKv(db, SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return normalizeStrategy(JSON.parse(raw) as Partial<ModelStrategySettings>);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveModelStrategy(db: any, updates: Partial<ModelStrategySettings>): ModelStrategySettings {
  const current = loadModelStrategy(db);
  const merged = normalizeStrategy({
    ...current,
    ...updates,
    blockedModels: updates.blockedModels || current.blockedModels,
    fallbackModels: updates.fallbackModels || current.fallbackModels,
  });
  setKv(db, SETTINGS_KEY, JSON.stringify(merged));
  return merged;
}

function getFailedModels(db: any): string[] {
  try {
    const rows = db.prepare(
      `SELECT model_id, total_runs, success_rate, avg_quality, strategy_config
       FROM model_registry`
    ).all() as Array<{
      model_id: string;
      total_runs: number;
      success_rate: number;
      avg_quality: number;
      strategy_config?: string;
    }>;

    return rows
      .filter((row) => {
        let strategy: any = {};
        try { strategy = row.strategy_config ? JSON.parse(row.strategy_config) : {}; } catch {}
        const markedPersistentFailure = strategy?.recommended === false && strategy?.cleanupEligible !== false;
        return markedPersistentFailure
          || (row.total_runs >= 3 && row.success_rate <= 0.5 && strategy?.blockScope !== 'temporary')
          || (row.total_runs >= 3 && (row.avg_quality || 0) < 40 && strategy?.blockScope !== 'temporary');
      })
      .map((row) => row.model_id);
  } catch {
    return [];
  }
}

export function getModelStrategySnapshot(db: any): { settings: ModelStrategySettings; failedModels: string[] } {
  const settings = loadModelStrategy(db);
  return {
    settings,
    failedModels: getFailedModels(db),
  };
}

export function cleanupFailedStrategyModels(db: any): { settings: ModelStrategySettings; removedModelIds: string[] } {
  const current = loadModelStrategy(db);
  const failedModels = dedupeModels(getFailedModels(db));
  if (failedModels.length === 0) {
    return { settings: current, removedModelIds: [] };
  }

  const blockedModels = dedupeModels([...current.blockedModels, ...failedModels]);
  const fallbackModels = current.fallbackModels.filter((model) => !blockedModels.includes(model));
  let primaryModel = current.primaryModel;
  if (blockedModels.includes(primaryModel)) {
    primaryModel = fallbackModels[0] || DEFAULT_SETTINGS.primaryModel;
  }

  const settings = saveModelStrategy(db, {
    ...current,
    primaryModel,
    fallbackModels,
    blockedModels,
  });

  return { settings, removedModelIds: failedModels };
}

// ── Employer analysis row (subset of columns we need) ───────
interface EmployerAnalysisRow {
  model_id: string;
  recommended_role: string;
  role_confidence: number;
  task_types: string;        // JSON array
  avoid_task_types: string;  // JSON array
  retirement_recommended: number;
  avg_quality: number;
  success_rate: number;
}

/**
 * Load the most recent employer_analysis record for a given model.
 * Returns null if no record exists or if the employer_analysis table does not yet exist.
 */
function getEmployerAnalysis(db: any, modelId: string): EmployerAnalysisRow | null {
  try {
    const row = db.prepare(`
      SELECT model_id, recommended_role, role_confidence, task_types, avoid_task_types,
             retirement_recommended, avg_quality, success_rate
      FROM employer_analysis
      WHERE model_id = ?
      ORDER BY analyzed_at DESC
      LIMIT 1
    `).get(modelId) as EmployerAnalysisRow | undefined;
    return row ?? null;
  } catch {
    // Table may not exist yet (pre-migration); degrade gracefully
    return null;
  }
}

/**
 * Re-order candidates using employer_analysis data for the given task type.
 *
 * Strategy (no manual override is overridden — only unset preferences are adjusted):
 *   1. Remove retirement-recommended models unless they are the ONLY option.
 *   2. Models whose avoid_task_types includes taskType go to the END of the list.
 *   3. Models whose task_types includes taskType are moved toward the FRONT.
 *   4. Relative order within each bucket is preserved from the input.
 */
function applyEmployerPreferences(db: any, candidates: string[], taskType?: string): string[] {
  if (!candidates.length) return candidates;

  const analyses = new Map<string, EmployerAnalysisRow>();
  for (const m of candidates) {
    const ea = getEmployerAnalysis(db, m);
    if (ea) analyses.set(m, ea);
  }

  if (!analyses.size) return candidates;  // No analysis data yet — pass through unchanged

  // Separate retired models (soft block — moved to very end, not removed entirely)
  const retired: string[] = [];
  const active: string[] = [];
  for (const m of candidates) {
    const ea = analyses.get(m);
    if (ea && ea.retirement_recommended) {
      retired.push(m);
    } else {
      active.push(m);
    }
  }

  // If all candidates are retired, use them anyway (degraded mode)
  const working = active.length ? active : candidates;

  if (!taskType) {
    return [...working, ...retired];
  }

  // Bucket by task-type fit
  const boosted: string[] = [];    // task_types includes taskType
  const neutral: string[] = [];    // no opinion
  const avoided: string[] = [];    // avoid_task_types includes taskType

  for (const m of working) {
    const ea = analyses.get(m);
    if (!ea) { neutral.push(m); continue; }

    let taskTypes: string[] = [];
    let avoidTypes: string[] = [];
    try { taskTypes = JSON.parse(ea.task_types) as string[]; } catch {}
    try { avoidTypes = JSON.parse(ea.avoid_task_types) as string[]; } catch {}

    if (avoidTypes.includes(taskType)) {
      avoided.push(m);
    } else if (taskTypes.includes(taskType)) {
      boosted.push(m);
    } else {
      neutral.push(m);
    }
  }

  return [...boosted, ...neutral, ...avoided, ...retired];
}

export function resolveModelStrategy(
  db: any,
  preferredModel?: string,
  explicitFallbacks?: string[],
  taskType?: string,
): { settings: ModelStrategySettings; primaryModel: string; fallbackModels: string[] } {
  const settings = loadModelStrategy(db);
  const requestedPrimary = (preferredModel || settings.primaryModel || DEFAULT_SETTINGS.primaryModel).trim();
  const fallbackSource = explicitFallbacks?.length
    ? explicitFallbacks
    : [
        ...(requestedPrimary !== settings.primaryModel ? [settings.primaryModel] : []),
        ...settings.fallbackModels,
      ];
  const fallbackModels = dedupeModels(fallbackSource)
    .filter((model) => model !== requestedPrimary && !settings.blockedModels.includes(model));

  const orderedCandidates = dedupeModels([requestedPrimary, ...fallbackModels]);
  const cooledCandidates = applyCooldownOverrides(db, orderedCandidates);

  // Apply employer intelligence: re-order by task-type fit from employer_analysis
  const employerOrdered = applyEmployerPreferences(db, cooledCandidates, taskType);

  const primaryModel = employerOrdered[0] || requestedPrimary;
  const cooledFallbackModels = employerOrdered.filter((model) => model !== primaryModel);

  return { settings, primaryModel, fallbackModels: cooledFallbackModels };
}