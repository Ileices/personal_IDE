import type Database from 'better-sqlite3';
import { MemoryService } from './memory/index.js';
import { executeSubsystem, getKv, loadSettings, setKv, type SubsystemConfig, type SubsystemId } from '../routes/subsystems.js';

const SCHEDULER_TICK_MS = 15_000;
const PROJECT_ROTATION_KEY = 'subsystems:project_rotation_index';
const AUTO_INTEL_SETTINGS_KEY = 'god_factory:auto_intel:settings';
const AUTO_INTEL_LAST_RUN_KEY = 'god_factory:auto_intel:last_run_at';
const AUTO_INTEL_LAST_ERROR_KEY = 'god_factory:auto_intel:last_error';
const AUTO_INTEL_MANAGED_BY_ROUTE_KEY = 'god_factory:auto_intel:managed_by_route';

type AutoIntelSettings = {
  enabled: boolean;
  intervalSec: number;
  executeJobs: boolean;
  analyzeEmployer: boolean;
  reflectExternalJobs: boolean;
  cooldownProfile: 'safe-exhaustive' | 'aggressive' | 'paced' | 'slow' | 'crawl';
  cooldownHorizonHours: number;
  projectId: string | null;
  model: string | null;
  maxIterations: number;
  jobMaxIterations: number;
  autoCooldownProfile: boolean;
};

const VALID_COOLDOWN_PROFILES = new Set<AutoIntelSettings['cooldownProfile']>([
  'safe-exhaustive',
  'aggressive',
  'paced',
  'slow',
  'crawl',
]);

const DEFAULT_AUTO_INTEL_SETTINGS: AutoIntelSettings = {
  enabled: false,
  intervalSec: 15 * 60,
  executeJobs: false,
  analyzeEmployer: true,
  reflectExternalJobs: true,
  cooldownProfile: 'safe-exhaustive',
  cooldownHorizonHours: 24,
  projectId: null,
  model: null,
  maxIterations: 0,
  jobMaxIterations: 50,
  autoCooldownProfile: true,
};

type SchedulerStatus = {
  running: boolean;
  tickMs: number;
  lastTickAt: string | null;
};

type ParsedRunPayload = {
  startedAt?: string;
  completedAt?: string;
  projectId?: string;
  projectName?: string;
  projectRoot?: string;
  result?: {
    root?: string;
  };
};

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let schedulerRunning = false;
let lastTickAt: string | null = null;

function parseLastRun(db: Database.Database, subsystem: SubsystemId): ParsedRunPayload | null {
  const raw = getKv(db, `subsystems:last_run:${subsystem}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ParsedRunPayload;
  } catch {
    return null;
  }
}

function getLastRunTs(db: Database.Database, subsystem: SubsystemId): number {
  const parsed = parseLastRun(db, subsystem);
  return new Date(parsed?.completedAt || parsed?.startedAt || 0).getTime() || 0;
}

function shouldRunNow(db: Database.Database, subsystem: SubsystemId, cfg: SubsystemConfig): boolean {
  if (!cfg.enabled || !cfg.idleEnabled || cfg.manualOnly) return false;
  const lastRunTs = getLastRunTs(db, subsystem);
  return Date.now() - lastRunTs >= cfg.idleIntervalSec * 1000;
}

function getRotationIndex(db: Database.Database): number {
  const raw = getKv(db, PROJECT_ROTATION_KEY);
  const parsed = Number(raw || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickRotatingProject(db: Database.Database, memory: MemoryService) {
  const projects = memory.listProjects();
  if (projects.length === 0) return null;
  const index = getRotationIndex(db) % projects.length;
  const project = projects[index];
  setKv(db, PROJECT_ROTATION_KEY, String((index + 1) % projects.length));
  return project;
}

function loadAutoIntelSettings(db: Database.Database): AutoIntelSettings {
  try {
    const raw = getKv(db, AUTO_INTEL_SETTINGS_KEY);
    if (!raw) return DEFAULT_AUTO_INTEL_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AutoIntelSettings>;
    const parsedCooldownProfile = String(parsed.cooldownProfile || DEFAULT_AUTO_INTEL_SETTINGS.cooldownProfile) as AutoIntelSettings['cooldownProfile'];
    return {
      enabled: !!parsed.enabled,
      intervalSec: Math.max(60, Math.min(7 * 24 * 3600, Number(parsed.intervalSec || DEFAULT_AUTO_INTEL_SETTINGS.intervalSec))),
      executeJobs: !!parsed.executeJobs,
      analyzeEmployer: parsed.analyzeEmployer ?? DEFAULT_AUTO_INTEL_SETTINGS.analyzeEmployer,
      reflectExternalJobs: parsed.reflectExternalJobs ?? DEFAULT_AUTO_INTEL_SETTINGS.reflectExternalJobs,
      cooldownProfile: VALID_COOLDOWN_PROFILES.has(parsedCooldownProfile)
        ? parsedCooldownProfile
        : DEFAULT_AUTO_INTEL_SETTINGS.cooldownProfile,
      cooldownHorizonHours: Math.max(1, Math.min(7 * 24, Number(parsed.cooldownHorizonHours || DEFAULT_AUTO_INTEL_SETTINGS.cooldownHorizonHours))),
      projectId: parsed.projectId ? String(parsed.projectId) : null,
      model: parsed.model ? String(parsed.model) : null,
      maxIterations: Number.isFinite(Number(parsed.maxIterations)) ? Number(parsed.maxIterations) : DEFAULT_AUTO_INTEL_SETTINGS.maxIterations,
      jobMaxIterations: Number.isFinite(Number(parsed.jobMaxIterations))
        ? Math.max(1, Math.min(5000, Number(parsed.jobMaxIterations)))
        : DEFAULT_AUTO_INTEL_SETTINGS.jobMaxIterations,
      autoCooldownProfile: parsed.autoCooldownProfile ?? DEFAULT_AUTO_INTEL_SETTINGS.autoCooldownProfile,
    };
  } catch {
    return DEFAULT_AUTO_INTEL_SETTINGS;
  }
}

function isAutoIntelManagedByRoute(db: Database.Database): boolean {
  const raw = String(getKv(db, AUTO_INTEL_MANAGED_BY_ROUTE_KEY) || '').trim().toLowerCase();
  if (!raw) return true;
  return raw !== '0' && raw !== 'false' && raw !== 'no';
}

function shouldRunAutoIntelNow(db: Database.Database, settings: AutoIntelSettings): boolean {
  if (!settings.enabled) return false;
  const lastRun = new Date(getKv(db, AUTO_INTEL_LAST_RUN_KEY) || 0).getTime() || 0;
  return Date.now() - lastRun >= settings.intervalSec * 1000;
}

async function runAutoIntelCycle(db: Database.Database, settings: AutoIntelSettings): Promise<void> {
  const serverPort = Number(process.env.SERVER_PORT || 3001);
  const baseUrl = `http://127.0.0.1:${serverPort}`;

  // Trigger the same God Factory signal-refresh path the Intel panel uses.
  const signalsRes = await fetch(`${baseUrl}/api/god-factory/signals`).catch(() => null);
  if (!signalsRes || !signalsRes.ok) {
    throw new Error('auto-intel signals refresh failed');
  }

  // Keep crawlers moving even when the browser UI is closed.
  executeSubsystem(db, { subsystem: 'suggested_jobs_crawler', depth: 4 });
  executeSubsystem(db, { subsystem: 'gap_analysis', depth: 4 });
  executeSubsystem(db, { subsystem: 'god_factory_idle_scan', depth: 1 });

  if (settings.analyzeEmployer) {
    await fetch(`${baseUrl}/api/employer/analyze`, { method: 'POST' }).catch(() => null);
  }

  if (settings.reflectExternalJobs) {
    const reflectRes = await fetch(`${baseUrl}/api/god-factory/external-jobs/reflect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: settings.projectId || null }),
    }).catch(() => null);

    if (!reflectRes || !reflectRes.ok) {
      throw new Error('auto-intel external reflection failed');
    }
  }

  if (!settings.executeJobs) return;

  const loopRow = db.prepare(`SELECT state FROM god_factory_loop_state WHERE id = 'singleton'`).get() as { state?: string } | undefined;
  if (loopRow?.state === 'running') return;

  const scopedProjectId = settings.projectId || (() => {
    const row = db.prepare(`
      SELECT id
      FROM projects
      ORDER BY datetime(last_accessed_at) DESC, datetime(created_at) DESC
      LIMIT 1
    `).get() as { id?: string } | undefined;
    return row?.id || null;
  })();

  if (!scopedProjectId) return;

  const pendingRow = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM job_records
    WHERE implementation_status = 'suggested'
      AND project_id = ?
  `).get(scopedProjectId) as { cnt?: number } | undefined;

  if ((pendingRow?.cnt || 0) <= 0) return;

  const selectedModel = settings.model || getKv(db, 'god_factory:loop:last_model') || null;

  await fetch(`${baseUrl}/api/god-factory/loop/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: scopedProjectId,
      model: selectedModel,
      maxIterations: settings.maxIterations,
      jobMaxIterations: settings.jobMaxIterations,
      autoApproveChanges: false,
      autoAnswerQuestions: false,
      checkpointEvery: 5,
      cooldownProfile: settings.cooldownProfile,
      autoCooldownProfile: settings.autoCooldownProfile,
      cooldownHorizonHours: settings.cooldownHorizonHours,
    }),
  }).catch(() => null);
}

export function getSubsystemSchedulerStatus(): SchedulerStatus {
  return {
    running: schedulerTimer !== null,
    tickMs: SCHEDULER_TICK_MS,
    lastTickAt,
  };
}

export function getSubsystemRuntimeStatus(db: Database.Database) {
  const settings = loadSettings(db);
  const scheduler = getSubsystemSchedulerStatus();
  const now = Date.now();

  const status = (Object.keys(settings) as SubsystemId[]).reduce((acc, subsystem) => {
    const cfg = settings[subsystem];
    const lastRun = parseLastRun(db, subsystem);
    const lastRunTs = getLastRunTs(db, subsystem);
    const nextRunAt = !cfg.enabled || !cfg.idleEnabled || cfg.manualOnly
      ? null
      : new Date((lastRunTs || now) + cfg.idleIntervalSec * 1000).toISOString();

    acc[subsystem] = {
      lastRun,
      nextRunAt,
      schedulerActive: cfg.enabled && cfg.idleEnabled && !cfg.manualOnly,
      targetRoot: lastRun?.projectRoot || lastRun?.result?.root || null,
      targetProjectId: lastRun?.projectId || null,
      targetProjectName: lastRun?.projectName || null,
    };
    return acc;
  }, {} as Record<SubsystemId, {
    lastRun: ParsedRunPayload | null;
    nextRunAt: string | null;
    schedulerActive: boolean;
    targetRoot: string | null;
    targetProjectId: string | null;
    targetProjectName: string | null;
  }>);

  return { scheduler, status };
}

async function tick(db: Database.Database): Promise<void> {
  if (schedulerRunning) return;
  schedulerRunning = true;
  lastTickAt = new Date().toISOString();
  try {
    const settings = loadSettings(db);
    const autoIntelSettings = loadAutoIntelSettings(db);
    const memory = new MemoryService(db);

    if (shouldRunNow(db, 'ide_codebase_crawler', settings.ide_codebase_crawler)) {
      executeSubsystem(db, { subsystem: 'ide_codebase_crawler', depth: settings.ide_codebase_crawler.maxDepth });
    }

    const rotatingProject = pickRotatingProject(db, memory);
    if (rotatingProject && shouldRunNow(db, 'project_state_crawler', settings.project_state_crawler)) {
      executeSubsystem(db, {
        subsystem: 'project_state_crawler',
        projectRoot: rotatingProject.rootPath,
        depth: settings.project_state_crawler.maxDepth,
        projectId: rotatingProject.id,
        projectName: rotatingProject.name,
      });
    }

    if (shouldRunNow(db, 'suggested_jobs_crawler', settings.suggested_jobs_crawler)) {
      executeSubsystem(db, { subsystem: 'suggested_jobs_crawler', depth: settings.suggested_jobs_crawler.maxDepth });
    }

    if (shouldRunNow(db, 'gap_analysis', settings.gap_analysis)) {
      executeSubsystem(db, { subsystem: 'gap_analysis', depth: settings.gap_analysis.maxDepth });
    }

    if (shouldRunNow(db, 'god_factory_idle_scan', settings.god_factory_idle_scan)) {
      executeSubsystem(db, { subsystem: 'god_factory_idle_scan', depth: settings.god_factory_idle_scan.maxDepth });
    }

    if (!isAutoIntelManagedByRoute(db) && shouldRunAutoIntelNow(db, autoIntelSettings)) {
      try {
        await runAutoIntelCycle(db, autoIntelSettings);
        setKv(db, AUTO_INTEL_LAST_RUN_KEY, new Date().toISOString());
        setKv(db, AUTO_INTEL_LAST_ERROR_KEY, '');
      } catch (err) {
        const summary = err instanceof Error ? err.message : String(err || 'unknown auto-intel error');
        setKv(db, AUTO_INTEL_LAST_ERROR_KEY, summary.slice(0, 400));
      }
    }
  } catch (err) {
    console.error('Subsystem scheduler tick failed:', err);
  } finally {
    schedulerRunning = false;
  }
}

export function startSubsystemScheduler(db: Database.Database): void {
  if (schedulerTimer) return;
  void tick(db);
  schedulerTimer = setInterval(() => {
    void tick(db);
  }, SCHEDULER_TICK_MS);
}

export function stopSubsystemScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}