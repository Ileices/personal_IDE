import type Database from 'better-sqlite3';
import { MemoryService } from './memory/index.js';
import { executeSubsystem, getKv, loadSettings, setKv, type SubsystemConfig, type SubsystemId } from '../routes/subsystems.js';

const SCHEDULER_TICK_MS = 15_000;
const PROJECT_ROTATION_KEY = 'subsystems:project_rotation_index';

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