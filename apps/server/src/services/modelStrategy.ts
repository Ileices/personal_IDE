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
  const primaryModel = (preferredModel || settings.primaryModel || DEFAULT_SETTINGS.primaryModel).trim();
  const fallbackSource = explicitFallbacks?.length ? explicitFallbacks : settings.fallbackModels;
  const fallbackModels = dedupeModels(fallbackSource)
    .filter((model) => model !== primaryModel && !settings.blockedModels.includes(model));

  return { settings, primaryModel, fallbackModels };
}