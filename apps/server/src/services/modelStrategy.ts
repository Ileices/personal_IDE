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

export function resolveModelStrategy(
  db: any,
  preferredModel?: string,
  explicitFallbacks?: string[],
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
  const primaryModel = cooledCandidates[0] || requestedPrimary;
  const cooledFallbackModels = cooledCandidates.filter((model) => model !== primaryModel);

  return { settings, primaryModel, fallbackModels: cooledFallbackModels };
}