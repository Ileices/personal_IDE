import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import { MemoryService } from './memory/index.js';
import { runProjectStateCrawler } from './projectStateCrawler/index.js';
import { GapAnalysisAgent } from './gapAnalysis/index.js';
import { runSuggestedJobsCrawlerTick } from './suggestedJobsCrawler/index.js';
import { runGodFactoryIdleScanner } from './godFactory/idleScanner.js';
import { executeSubsystem, getKv, loadSettings, setKv, type SubsystemConfig, type SubsystemId } from '../routes/subsystems.js';
import { runModelPerfCrawlerTick } from './modelPerformanceCrawler/index.js';
import { runMistralPerfCrawlerTick } from './mistralPerformanceCrawler/index.js';
import { runSecurityCrawlerTick } from './securityCrawler/index.js';
import { runSoftProbes } from './modelRateLimitTracker/index.js';
import { runDependencyGraphCrawlerTick } from './dependencyGraphCrawler/index.js';
import { runSchemaDriftCrawlerTick } from './schemaDriftCrawler/index.js';
import { runCommunityCrawlerTick } from './communityCrawler/index.js';
import { runTestCoverageCrawlerTick } from './testCoverageCrawler/index.js';
import { runDocumentationGapCrawlerTick } from './documentationGapCrawler/index.js';
import * as path from 'path';

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

type SchedulerProjectTarget = {
  id: string;
  name: string;
  rootPath: string;
};

type PipelineCheckpointInput = {
  tickStartedAt: string;
  projectState?: {
    totalDevtags: number;
    driftEvents: number;
    snapshotId: string;
  };
  gap?: {
    totalReports: number;
    flaggedToGodFactory: number;
    sessionId: string;
  };
  suggested?: {
    mode: string;
    generated: number;
    protocol?: number;
  };
  idleScanRan: boolean;
};

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let schedulerRunning = false;
let lastTickAt: string | null = null;
let schedulerSaturationStreak = 0;
let schedulerDeferredUntilTs = 0;

type SchedulerBackpressurePolicy = {
  suggestedCount: number;
  highCriticalCount: number;
  intervalMultiplier: number;
  shouldDeferTick: boolean;
  deferMs: number;
  reason: string;
};

function getSchedulerBackpressurePolicy(db: Database.Database): SchedulerBackpressurePolicy {
  let suggestedCount = 0;
  let highCriticalCount = 0;

  try {
    suggestedCount = (db.prepare(`
      SELECT COUNT(*) AS c
      FROM job_records
      WHERE implementation_status = 'suggested'
    `).get() as { c?: number } | undefined)?.c || 0;

    highCriticalCount = (db.prepare(`
      SELECT COUNT(*) AS c
      FROM job_records
      WHERE implementation_status = 'suggested'
        AND priority IN ('high', 'critical')
    `).get() as { c?: number } | undefined)?.c || 0;
  } catch {
    return {
      suggestedCount: 0,
      highCriticalCount: 0,
      intervalMultiplier: 1,
      shouldDeferTick: false,
      deferMs: 0,
      reason: 'scheduler backpressure unavailable',
    };
  }

  if (suggestedCount >= 900) {
    schedulerSaturationStreak += 1;
  } else {
    schedulerSaturationStreak = 0;
  }

  if (suggestedCount >= 1800 && highCriticalCount < 120 && schedulerSaturationStreak >= 3) {
    return {
      suggestedCount,
      highCriticalCount,
      intervalMultiplier: 4,
      shouldDeferTick: true,
      deferMs: 60_000,
      reason: `severe saturation suggested=${suggestedCount} streak=${schedulerSaturationStreak}`,
    };
  }

  if (suggestedCount >= 1400) {
    return {
      suggestedCount,
      highCriticalCount,
      intervalMultiplier: 3,
      shouldDeferTick: false,
      deferMs: 0,
      reason: `high saturation suggested=${suggestedCount}`,
    };
  }

  if (suggestedCount >= 900) {
    return {
      suggestedCount,
      highCriticalCount,
      intervalMultiplier: 2,
      shouldDeferTick: false,
      deferMs: 0,
      reason: `moderate saturation suggested=${suggestedCount}`,
    };
  }

  return {
    suggestedCount,
    highCriticalCount,
    intervalMultiplier: 1,
    shouldDeferTick: false,
    deferMs: 0,
    reason: `queue healthy suggested=${suggestedCount}`,
  };
}

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

function getMostRecentProject(db: Database.Database): SchedulerProjectTarget | null {
  const row = db.prepare(`
    SELECT id, name, root_path
    FROM projects
    ORDER BY datetime(last_accessed_at) DESC, datetime(created_at) DESC
    LIMIT 1
  `).get() as { id: string; name: string; root_path: string } | undefined;

  if (!row?.root_path) return null;
  return { id: row.id, name: row.name, rootPath: row.root_path };
}

function getProjectById(db: Database.Database, projectId: string): SchedulerProjectTarget | null {
  const row = db.prepare('SELECT id, name, root_path FROM projects WHERE id = ? LIMIT 1')
    .get(projectId) as { id: string; name: string; root_path: string } | undefined;

  if (!row?.root_path) return null;
  return { id: row.id, name: row.name, rootPath: row.root_path };
}

function persistSubsystemRun(
  db: Database.Database,
  payload: {
    subsystem: SubsystemId;
    startedAt: string;
    completedAt: string;
    projectId?: string | null;
    projectName?: string | null;
    projectRoot?: string | null;
    result: Record<string, unknown>;
  },
): void {
  setKv(
    db,
    `subsystems:last_run:${payload.subsystem}`,
    JSON.stringify({
      subsystem: payload.subsystem,
      startedAt: payload.startedAt,
      completedAt: payload.completedAt,
      projectId: payload.projectId ?? undefined,
      projectName: payload.projectName ?? undefined,
      projectRoot: payload.projectRoot ?? undefined,
      result: payload.result,
    }),
  );
}

async function runProjectStateCrawlerSubsystem(
  db: Database.Database,
  cfg: SubsystemConfig,
  target: SchedulerProjectTarget,
  trigger: 'scheduler' | 'auto_intel',
) {
  const startedAt = new Date().toISOString();
  try {
    const crawl = await runProjectStateCrawler(db, {
      projectRoot: target.rootPath,
      triggeredBy: trigger,
      includeHiddenDirs: cfg.includeHiddenDirs === true,
      includeBackupDirs: cfg.includeBackupDirs === true,
    });

    persistSubsystemRun(db, {
      subsystem: 'project_state_crawler',
      startedAt,
      completedAt: new Date().toISOString(),
      projectId: target.id,
      projectName: target.name,
      projectRoot: target.rootPath,
      result: {
        root: target.rootPath,
        snapshotId: crawl.snapshotId,
        cycleId: crawl.cycleId,
        totalFiles: crawl.totalFiles,
        parsedFiles: crawl.parsedFiles,
        skippedFiles: crawl.skippedFiles,
        totalDevtags: crawl.totalDevtags,
        driftEvents: crawl.driftEvents,
        registrySurplus: crawl.registrySurplus,
        registryDeficit: crawl.registryDeficit,
        contentDrift: crawl.contentDrift,
        locationDrift: crawl.locationDrift,
        systemicDrift: crawl.systemicDrift,
        parseDurationMs: crawl.parseDurationMs,
        errors: crawl.errors,
        summary: `Full PSC run parsed ${crawl.parsedFiles}/${crawl.totalFiles} files and found ${crawl.driftEvents} drift event(s).`,
      },
    });

    return crawl;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    persistSubsystemRun(db, {
      subsystem: 'project_state_crawler',
      startedAt,
      completedAt: new Date().toISOString(),
      projectId: target.id,
      projectName: target.name,
      projectRoot: target.rootPath,
      result: {
        root: target.rootPath,
        error: message,
        summary: `Full PSC run failed: ${message}`,
      },
    });
    throw error;
  }
}

async function runGapAnalysisSubsystem(
  db: Database.Database,
  target: SchedulerProjectTarget | null,
  trigger: 'scheduler' | 'auto_intel',
) {
  const startedAt = new Date().toISOString();
  const sessionId = `${trigger}_gap_${Date.now()}`;
  try {
    const agent = new GapAnalysisAgent(db);
    const result = await agent.runFullAnalysis({
      session_id: sessionId,
      cycle_range: [0, Date.now()],
      project_root: target?.rootPath,
    });

    persistSubsystemRun(db, {
      subsystem: 'gap_analysis',
      startedAt,
      completedAt: new Date().toISOString(),
      projectId: target?.id,
      projectName: target?.name,
      projectRoot: target?.rootPath,
      result: {
        sessionId,
        totalReports: result.total_reports,
        flaggedToGodFactory: result.flagged_to_god_factory,
        coverage: result.coverage_summary,
        summary: `Full gap analysis generated ${result.total_reports} report(s), ${result.flagged_to_god_factory} flagged for God Factory.`,
      },
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    persistSubsystemRun(db, {
      subsystem: 'gap_analysis',
      startedAt,
      completedAt: new Date().toISOString(),
      projectId: target?.id,
      projectName: target?.name,
      projectRoot: target?.rootPath,
      result: {
        sessionId,
        error: message,
        summary: `Full gap analysis failed: ${message}`,
      },
    });
    throw error;
  }
}

function runSuggestedJobsSubsystem(db: Database.Database, trigger: 'scheduler' | 'auto_intel') {
  const startedAt = new Date().toISOString();
  try {
    const result = runSuggestedJobsCrawlerTick(db);
    persistSubsystemRun(db, {
      subsystem: 'suggested_jobs_crawler',
      startedAt,
      completedAt: new Date().toISOString(),
      result: {
        trigger,
        ...result,
        summary: `Suggested Jobs crawler ran in ${result.mode} mode and generated ${result.generated} job(s).`,
      },
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    persistSubsystemRun(db, {
      subsystem: 'suggested_jobs_crawler',
      startedAt,
      completedAt: new Date().toISOString(),
      result: {
        trigger,
        error: message,
        summary: `Suggested Jobs crawler failed: ${message}`,
      },
    });
    throw error;
  }
}

async function runIdleScanSubsystem(db: Database.Database, trigger: 'scheduler' | 'auto_intel'): Promise<void> {
  const startedAt = new Date().toISOString();
  try {
    await runGodFactoryIdleScanner(db);
    persistSubsystemRun(db, {
      subsystem: 'god_factory_idle_scan',
      startedAt,
      completedAt: new Date().toISOString(),
      result: {
        trigger,
        maxFilesPerTick: 1,
        summary: 'God Factory idle scanner completed one tick.',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    persistSubsystemRun(db, {
      subsystem: 'god_factory_idle_scan',
      startedAt,
      completedAt: new Date().toISOString(),
      result: {
        trigger,
        error: message,
        summary: `God Factory idle scanner failed: ${message}`,
      },
    });
    throw error;
  }
}

function recordPipelineCheckpoint(db: Database.Database, input: PipelineCheckpointInput): void {
  const latestSnapshot = db.prepare(`
    SELECT snapshot_id, total_devtags, created_at
    FROM ground_truth_snapshots
    ORDER BY datetime(created_at) DESC
    LIMIT 1
  `).get() as { snapshot_id?: string; total_devtags?: number; created_at?: string } | undefined;

  const pendingFlagged = (db.prepare(`
    SELECT COUNT(*) AS c
    FROM gap_reports
    WHERE flagged_to_god_factory = 1
      AND (acknowledged_at IS NULL OR acknowledged_at = '')
  `).get() as { c?: number } | undefined)?.c || 0;

  const pendingSuggested = (db.prepare(`
    SELECT COUNT(*) AS c
    FROM job_records
    WHERE implementation_status = 'suggested'
  `).get() as { c?: number } | undefined)?.c || 0;

  const checkpoint = {
    tickStartedAt: input.tickStartedAt,
    recordedAt: new Date().toISOString(),
    projectState: input.projectState ?? null,
    gap: input.gap ?? null,
    suggested: input.suggested ?? null,
    idleScanRan: input.idleScanRan,
    pipelineHealth: {
      latestSnapshotId: latestSnapshot?.snapshot_id || null,
      latestSnapshotDevtags: latestSnapshot?.total_devtags ?? 0,
      pendingFlaggedGapReports: pendingFlagged,
      pendingSuggestedJobs: pendingSuggested,
    },
  };

  setKv(db, 'subsystems:pipeline_checkpoint:last', JSON.stringify(checkpoint));

  const anomalies: string[] = [];
  if (input.projectState && input.projectState.totalDevtags <= 0) {
    anomalies.push('Project State Crawler produced zero devtags.');
  }
  if (input.gap && input.gap.totalReports <= 0) {
    anomalies.push('Gap analysis produced zero reports.');
  }
  if (pendingFlagged > 0 && pendingSuggested <= 0) {
    anomalies.push('Flagged gap reports exist but suggested job queue is empty.');
  }

  if (anomalies.length === 0) return;

  const summary = `Pipeline checkpoint warning: ${anomalies.join(' ')}`;
  const recent = db.prepare(`
    SELECT notification_id
    FROM notification_queue
    WHERE category = 'pipeline_checkpoint'
      AND natural_language_summary = ?
      AND datetime(timestamp) >= datetime('now', '-30 minutes')
    LIMIT 1
  `).get(summary) as { notification_id?: string } | undefined;

  if (recent?.notification_id) return;

  db.prepare(`
    INSERT INTO notification_queue
      (notification_id, category, source_forensic_id, severity, summary_tags, natural_language_summary, cycle_id, presented_to_user, user_acknowledged, timestamp)
    VALUES (?,?,?,?,?,?,?,0,0,datetime('now'))
  `).run(
    randomUUID(),
    'pipeline_checkpoint',
    latestSnapshot?.snapshot_id || null,
    'warning',
    JSON.stringify(['pipeline', 'checkpoint']),
    summary,
    null,
  );
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
  const subsystemSettings = loadSettings(db);
  const scopedProject = settings.projectId
    ? getProjectById(db, settings.projectId)
    : getMostRecentProject(db);

  if (
    scopedProject &&
    subsystemSettings.project_state_crawler.enabled &&
    !subsystemSettings.project_state_crawler.manualOnly
  ) {
    await runProjectStateCrawlerSubsystem(db, subsystemSettings.project_state_crawler, scopedProject, 'auto_intel');
  }

  runSuggestedJobsSubsystem(db, 'auto_intel');
  await runGapAnalysisSubsystem(db, scopedProject, 'auto_intel');
  await runIdleScanSubsystem(db, 'auto_intel');

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

export function getPipelineCheckpoint(db: Database.Database): Record<string, unknown> | null {
  const raw = getKv(db, 'subsystems:pipeline_checkpoint:last');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
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
  if (Date.now() < schedulerDeferredUntilTs) return;
  schedulerRunning = true;
  lastTickAt = new Date().toISOString();
  try {
    const settings = loadSettings(db);
    const autoIntelSettings = loadAutoIntelSettings(db);
    const schedulerBackpressure = getSchedulerBackpressurePolicy(db);
    const memory = new MemoryService(db);
    const checkpointInput: PipelineCheckpointInput = {
      tickStartedAt: lastTickAt || new Date().toISOString(),
      idleScanRan: false,
    };

    if (schedulerBackpressure.shouldDeferTick) {
      schedulerDeferredUntilTs = Date.now() + schedulerBackpressure.deferMs;
      setKv(db, 'subsystems:scheduler:backpressure', JSON.stringify({
        deferredUntil: new Date(schedulerDeferredUntilTs).toISOString(),
        reason: schedulerBackpressure.reason,
        suggestedCount: schedulerBackpressure.suggestedCount,
        highCriticalCount: schedulerBackpressure.highCriticalCount,
        streak: schedulerSaturationStreak,
        recordedAt: new Date().toISOString(),
      }));
      return;
    }

    const shouldRunHeavy = (subsystem: SubsystemId, cfg: SubsystemConfig): boolean => {
      if (!cfg.enabled || !cfg.idleEnabled || cfg.manualOnly) return false;
      const lastRunTs = getLastRunTs(db, subsystem);
      const adjustedIntervalSec = cfg.idleIntervalSec * schedulerBackpressure.intervalMultiplier;
      return Date.now() - lastRunTs >= adjustedIntervalSec * 1000;
    };

    if (shouldRunHeavy('ide_codebase_crawler', settings.ide_codebase_crawler)) {
      try {
        await executeSubsystem(db, { subsystem: 'ide_codebase_crawler', depth: settings.ide_codebase_crawler.maxDepth });
      } catch (error) {
        console.error('ide_codebase_crawler scheduler execution failed:', error);
      }
    }

    const rotatingProject = (pickRotatingProject(db, memory) as SchedulerProjectTarget | null) ?? null;
    const fallbackProject = getMostRecentProject(db);
    const targetProject = rotatingProject ?? fallbackProject;

    if (targetProject && shouldRunHeavy('project_state_crawler', settings.project_state_crawler)) {
      try {
        const crawl = await runProjectStateCrawlerSubsystem(db, settings.project_state_crawler, targetProject, 'scheduler');
        checkpointInput.projectState = {
          totalDevtags: crawl.totalDevtags,
          driftEvents: crawl.driftEvents,
          snapshotId: crawl.snapshotId,
        };
      } catch (error) {
        console.error('project_state_crawler scheduler execution failed:', error);
      }
    }

    if (shouldRunNow(db, 'suggested_jobs_crawler', settings.suggested_jobs_crawler)) {
      try {
        const suggested = runSuggestedJobsSubsystem(db, 'scheduler');
        checkpointInput.suggested = {
          mode: suggested.mode,
          generated: suggested.generated,
          protocol: suggested.protocol,
        };
      } catch (error) {
        console.error('suggested_jobs_crawler scheduler execution failed:', error);
      }
    }

    if (shouldRunHeavy('gap_analysis', settings.gap_analysis)) {
      try {
        const gap = await runGapAnalysisSubsystem(db, targetProject, 'scheduler');
        checkpointInput.gap = {
          totalReports: gap.total_reports,
          flaggedToGodFactory: gap.flagged_to_god_factory,
          sessionId: gap.session_id,
        };
      } catch (error) {
        console.error('gap_analysis scheduler execution failed:', error);
      }
    }

    if (shouldRunNow(db, 'god_factory_idle_scan', settings.god_factory_idle_scan)) {
      try {
        await runIdleScanSubsystem(db, 'scheduler');
        checkpointInput.idleScanRan = true;
      } catch (error) {
        console.error('god_factory_idle_scan scheduler execution failed:', error);
      }
    }

    if (checkpointInput.projectState || checkpointInput.gap || checkpointInput.suggested || checkpointInput.idleScanRan) {
      recordPipelineCheckpoint(db, checkpointInput);
    }

    setKv(db, 'subsystems:scheduler:backpressure', JSON.stringify({
      deferredUntil: null,
      reason: schedulerBackpressure.reason,
      suggestedCount: schedulerBackpressure.suggestedCount,
      highCriticalCount: schedulerBackpressure.highCriticalCount,
      intervalMultiplier: schedulerBackpressure.intervalMultiplier,
      streak: schedulerSaturationStreak,
      recordedAt: new Date().toISOString(),
    }));

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

    // ── New Crawlers ────────────────────────────────────────────────────
    // These use their own app_kv-based interval tracking (not SubsystemConfig)
    // since they don't map to a SubsystemId in the current schema.

    // Model Performance Crawler — every 30 minutes
    const modelPerfLastRun = new Date(getKv(db, 'model_perf_crawler:last_run') ?? 0).getTime() || 0;
    if (Date.now() - modelPerfLastRun >= 30 * 60 * 1000) {
      try { runModelPerfCrawlerTick(db); } catch { /* non-fatal */ }
    }

    // Mistral Performance Crawler — every 15 minutes
    const mistralLastRun = new Date(getKv(db, 'mistral_crawler:last_run') ?? 0).getTime() || 0;
    if (Date.now() - mistralLastRun >= 15 * 60 * 1000) {
      try { runMistralPerfCrawlerTick(db); } catch { /* non-fatal */ }
    }

    // Security OWASP Crawler — every 60 minutes
    const securityLastRun = new Date(getKv(db, 'security_crawler:last_run') ?? 0).getTime() || 0;
    if (Date.now() - securityLastRun >= 60 * 60 * 1000) {
      try {
        const srcRoot = path.join(process.cwd(), 'src');
        runSecurityCrawlerTick(db, { srcRoot, maxFilesPerRun: 100 });
      } catch { /* non-fatal */ }
    }

    // Rate Limit Soft Probes — every 2 minutes
    // Checks if rate-limited models are available again
    const softProbeLastRun = new Date(getKv(db, 'rate_limit:soft_probe_last_run') ?? 0).getTime() || 0;
    if (Date.now() - softProbeLastRun >= 2 * 60 * 1000) {
      setKv(db, 'rate_limit:soft_probe_last_run', new Date().toISOString());
      runSoftProbes(db).catch(() => { /* non-fatal */ });
    }

    // Dependency Graph Crawler — every 4 hours
    const depGraphLastRun = new Date(getKv(db, 'dependency_graph:last_run') ?? 0).getTime() || 0;
    if (Date.now() - depGraphLastRun >= 4 * 60 * 60 * 1000) {
      try {
        const srcRoot = path.join(process.cwd(), 'src');
        runDependencyGraphCrawlerTick(db, { srcRoot });
      } catch { /* non-fatal */ }
    }

    // Schema Drift Crawler — every 30 minutes
    const schemaDriftLastRun = new Date(getKv(db, 'schema_drift:last_run') ?? 0).getTime() || 0;
    if (Date.now() - schemaDriftLastRun >= 30 * 60 * 1000) {
      try {
        runSchemaDriftCrawlerTick(db);
      } catch { /* non-fatal */ }
    }

    // Community Crawler — every 6 hours
    // Scans GitHub Discussions/Issues → creates human-approval-required jobs
    const communityLastRun = new Date(getKv(db, 'community_crawler:last_run') ?? 0).getTime() || 0;
    if (Date.now() - communityLastRun >= 6 * 60 * 60 * 1000) {
      setKv(db, 'community_crawler:last_run', new Date().toISOString());
      runCommunityCrawlerTick(db).catch(() => { /* non-fatal */ });
    }

    // Test Coverage Crawler — every 2 hours
    // Finds source files with no tests → creates test_missing jobs
    const testCoverageLastRun = new Date(getKv(db, 'test_coverage:last_run') ?? 0).getTime() || 0;
    if (Date.now() - testCoverageLastRun >= 2 * 60 * 60 * 1000) {
      setKv(db, 'test_coverage:last_run', new Date().toISOString());
      runTestCoverageCrawlerTick(db).catch(() => { /* non-fatal */ });
    }

    // Documentation Gap Crawler — every 4 hours
    // Finds exported symbols with no JSDoc → creates documentation jobs
    const docGapLastRun = new Date(getKv(db, 'doc_gap:last_run') ?? 0).getTime() || 0;
    if (Date.now() - docGapLastRun >= 4 * 60 * 60 * 1000) {
      setKv(db, 'doc_gap:last_run', new Date().toISOString());
      runDocumentationGapCrawlerTick(db).catch(() => { /* non-fatal */ });
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