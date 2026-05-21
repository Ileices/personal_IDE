// ============================================
// Subsystems Routes - unified control plane
// for project-state, suggested-jobs, and gap-analysis
// ============================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { relative, resolve } from 'path';
import { getPipelineCheckpoint, getSubsystemRuntimeStatus } from '../services/subsystemScheduler.js';
import { runGodFactoryIdleScanner } from '../services/godFactory/idleScanner.js';
import { runProjectStateCrawler } from '../services/projectStateCrawler/index.js';
import { runSuggestedJobsCrawlerTick } from '../services/suggestedJobsCrawler/index.js';
import { GapAnalysisAgent } from '../services/gapAnalysis/index.js';
import { readCodebaseIntelligence, runCrawlerCoordinatorTick } from '../services/crawlerCoordinator/index.js';

export type SubsystemId = 'ide_codebase_crawler' | 'project_state_crawler' | 'suggested_jobs_crawler' | 'gap_analysis' | 'god_factory_idle_scan';

export interface SubsystemConfig {
  enabled: boolean;
  idleEnabled: boolean;
  idleIntervalSec: number;
  maxDepth: number;
  manualOnly: boolean;
  includeHiddenDirs?: boolean;
  includeBackupDirs?: boolean;
}

export interface SubsystemsSettings {
  ide_codebase_crawler: SubsystemConfig;
  project_state_crawler: SubsystemConfig;
  suggested_jobs_crawler: SubsystemConfig;
  gap_analysis: SubsystemConfig;
  god_factory_idle_scan: SubsystemConfig;
}

export interface SubsystemRunRequest {
  subsystem: SubsystemId;
  projectRoot?: string;
  projectId?: string;
  projectName?: string;
  depth?: number;
  includeHiddenDirs?: boolean;
  includeBackupDirs?: boolean;
}

interface SubsystemCoverageRequest {
  filePaths: string[];
  projectRoot?: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const IDE_ROOT = resolve(__dirname, '../../../../');
const SETTINGS_KEY = 'subsystems:settings';
const HARD_SKIPPED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'target',
  'vendor',
  '__pycache__',
  '.venv',
  'venv',
  '.next',
  '.nuxt',
  'coverage',
  '.cache',
  '.turbo',
  '.svelte-kit',
  '.parcel-cache',
]);

export const DEFAULT_SETTINGS: SubsystemsSettings = {
  ide_codebase_crawler: { enabled: true, idleEnabled: true, idleIntervalSec: 60, maxDepth: 5, manualOnly: false },
  project_state_crawler: {
    enabled: true,
    idleEnabled: true,
    idleIntervalSec: 90,
    maxDepth: 5,
    manualOnly: false,
    includeHiddenDirs: false,
    includeBackupDirs: false,
  },
  suggested_jobs_crawler: { enabled: true, idleEnabled: true, idleIntervalSec: 120, maxDepth: 4, manualOnly: false },
  gap_analysis: { enabled: true, idleEnabled: true, idleIntervalSec: 180, maxDepth: 4, manualOnly: false },
  god_factory_idle_scan: { enabled: true, idleEnabled: true, idleIntervalSec: 600, maxDepth: 1, manualOnly: false },
};

function safeScanRoot(rootPath: string): string {
  const resolved = resolve(rootPath);
  let stats: ReturnType<typeof statSync>;
  try {
    stats = statSync(resolved);
  } catch {
    throw new Error(`scan root does not exist: ${resolved}`);
  }
  if (!stats.isDirectory()) {
    throw new Error(`scan root is not a directory: ${resolved}`);
  }
  return resolved;
}

type ProjectTarget = {
  id?: string;
  name?: string;
  rootPath: string;
};

function resolveProjectTarget(db: any, request: SubsystemRunRequest): ProjectTarget {
  if (request.projectId) {
    const byId = db.prepare('SELECT id, name, root_path FROM projects WHERE id = ?').get(request.projectId) as
      | { id: string; name: string; root_path: string }
      | undefined;
    if (byId) {
      return { id: byId.id, name: byId.name, rootPath: byId.root_path };
    }
    if (request.projectRoot) {
      return { id: request.projectId, name: request.projectName, rootPath: request.projectRoot };
    }
    throw new Error(`project not found for id: ${request.projectId}`);
  }

  if (request.projectRoot) {
    return { id: request.projectId, name: request.projectName, rootPath: request.projectRoot };
  }

  const latest = db.prepare(
    `SELECT id, name, root_path
     FROM projects
     ORDER BY datetime(last_accessed_at) DESC, datetime(created_at) DESC
     LIMIT 1`
  ).get() as { id: string; name: string; root_path: string } | undefined;

  if (!latest) {
    throw new Error('No saved projects found. Create/select a project first, or provide projectRoot.');
  }

  return { id: latest.id, name: latest.name, rootPath: latest.root_path };
}

export function getKv(db: any, key: string): string | null {
  const row = db.prepare('SELECT value FROM app_kv WHERE key = ?').get(key) as { value?: string } | undefined;
  return row?.value ?? null;
}

export function setKv(db: any, key: string, value: string): void {
  db.prepare(
    `INSERT INTO app_kv (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(key, value);
}

export function loadSettings(db: any): SubsystemsSettings {
  try {
    const raw = getKv(db, SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<SubsystemsSettings>;
    return {
      ide_codebase_crawler: { ...DEFAULT_SETTINGS.ide_codebase_crawler, ...(parsed.ide_codebase_crawler || {}) },
      project_state_crawler: { ...DEFAULT_SETTINGS.project_state_crawler, ...(parsed.project_state_crawler || {}) },
      suggested_jobs_crawler: { ...DEFAULT_SETTINGS.suggested_jobs_crawler, ...(parsed.suggested_jobs_crawler || {}) },
      gap_analysis: { ...DEFAULT_SETTINGS.gap_analysis, ...(parsed.gap_analysis || {}) },
      god_factory_idle_scan: { ...DEFAULT_SETTINGS.god_factory_idle_scan, ...(parsed.god_factory_idle_scan || {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function countTree(rootPath: string, maxDepth: number): { files: number; dirs: number; byExt: Record<string, number> } {
  const ignored = new Set(['node_modules', '.git', '.ide-logs', 'dist', 'build', '.next']);
  const byExt: Record<string, number> = {};
  let files = 0;
  let dirs = 0;

  function walk(path: string, depth: number) {
    if (depth > maxDepth) return;
    const entries = readdirSync(path, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.env.example') continue;
      if (e.isDirectory()) {
        if (ignored.has(e.name)) continue;
        dirs += 1;
        walk(resolve(path, e.name), depth + 1);
      } else if (e.isFile()) {
        files += 1;
        const extIdx = e.name.lastIndexOf('.');
        const ext = extIdx > -1 ? e.name.slice(extIdx).toLowerCase() : 'none';
        byExt[ext] = (byExt[ext] || 0) + 1;
      }
    }
  }

  walk(rootPath, 0);
  return { files, dirs, byExt };
}

function topExtensions(byExt: Record<string, number>, limit: number = 6): Array<{ ext: string; count: number }> {
  return Object.entries(byExt)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([ext, count]) => ({ ext, count }));
}

function normalizePathLike(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '');
}

function evaluateProjectCrawlerCoverage(filePath: string, cfg: SubsystemConfig, projectRoot?: string) {
  const inputPath = String(filePath || '').trim();
  const normalizedInput = normalizePathLike(inputPath);
  let relativePath = normalizedInput;

  if (projectRoot) {
    try {
      const resolvedRoot = normalizePathLike(resolve(projectRoot));
      const resolvedFile = normalizePathLike(resolve(inputPath));
      if (resolvedFile.toLowerCase().startsWith(`${resolvedRoot.toLowerCase()}/`)) {
        relativePath = normalizePathLike(relative(resolve(projectRoot), resolve(inputPath)));
      }
    } catch {
      // Keep original-normalized path if resolution fails.
    }
  }

  const reasons: string[] = [];
  const requiredSettings = new Set<string>();
  const segments = relativePath.split('/').filter(Boolean);

  for (const segment of segments) {
    const isBackupSegment = segment === '.backups';
    const isHiddenSegment = segment.startsWith('.');

    if (isBackupSegment && cfg.includeBackupDirs !== true) {
      reasons.push('Path is under .backups while includeBackupDirs is disabled.');
      requiredSettings.add('includeBackupDirs');
      break;
    }

    if (HARD_SKIPPED_DIRS.has(segment) && !isBackupSegment) {
      reasons.push(`Crawler hard-skips directory segment: ${segment}.`);
      break;
    }

    if (isHiddenSegment && !isBackupSegment && cfg.includeHiddenDirs !== true) {
      reasons.push(`Path has hidden segment ${segment} while includeHiddenDirs is disabled.`);
      requiredSettings.add('includeHiddenDirs');
      break;
    }
  }

  return {
    inputPath,
    relativePath,
    coveredByCurrentSettings: reasons.length === 0,
    reasons,
    requiredSettings: Array.from(requiredSettings),
  };
}

export async function subsystemsRoutes(app: FastifyInstance) {
  const db = (app as any).db;

  app.get('/settings', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const settings = loadSettings(db);
      const runtime = getSubsystemRuntimeStatus(db);
      const pipelineCheckpoint = getPipelineCheckpoint(db);
      return reply.send({ settings, scheduler: runtime.scheduler, status: runtime.status, pipelineCheckpoint });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/settings', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const updates = req.body as Partial<SubsystemsSettings>;
      const current = loadSettings(db);
      const merged: SubsystemsSettings = {
        ide_codebase_crawler: { ...current.ide_codebase_crawler, ...(updates.ide_codebase_crawler || {}) },
        project_state_crawler: { ...current.project_state_crawler, ...(updates.project_state_crawler || {}) },
        suggested_jobs_crawler: { ...current.suggested_jobs_crawler, ...(updates.suggested_jobs_crawler || {}) },
        gap_analysis: { ...current.gap_analysis, ...(updates.gap_analysis || {}) },
        god_factory_idle_scan: { ...current.god_factory_idle_scan, ...(updates.god_factory_idle_scan || {}) },
      };
      setKv(db, SETTINGS_KEY, JSON.stringify(merged));
      return reply.send({ success: true, settings: merged });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/run', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as SubsystemRunRequest;
    if (!body?.subsystem) return reply.status(400).send({ error: 'subsystem is required' });

    try {
      const payload = await executeSubsystem(db, body);
      return reply.send({ success: true, ...payload });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/coverage', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = req.body as Partial<SubsystemCoverageRequest>;
      const filePaths = Array.isArray(body?.filePaths)
        ? body.filePaths.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : [];

      if (filePaths.length === 0) {
        return reply.status(400).send({ error: 'filePaths[] is required' });
      }

      const cfg = loadSettings(db).project_state_crawler;
      const results = filePaths.slice(0, 1000).map((filePath) =>
        evaluateProjectCrawlerCoverage(filePath, cfg, body.projectRoot),
      );

      return reply.send({
        subsystem: 'project_state_crawler',
        settings: {
          includeHiddenDirs: cfg.includeHiddenDirs === true,
          includeBackupDirs: cfg.includeBackupDirs === true,
        },
        results,
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.get('/intelligence/:projectId', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = req.params as { projectId?: string };
      const query = req.query as { facet?: 'overview' | 'file' | 'relationship' | 'drift' | 'semantic'; limit?: string };
      const projectId = String(params?.projectId || '').trim();
      if (!projectId) {
        return reply.status(400).send({ error: 'projectId is required' });
      }

      const parsedLimit = Number(query.limit || 200);
      const rows = readCodebaseIntelligence(db, projectId, query.facet, parsedLimit);
      return reply.send({
        projectId,
        facet: query.facet || null,
        count: rows.length,
        rows,
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}

export async function executeSubsystem(db: any, request: SubsystemRunRequest): Promise<{ subsystem: SubsystemId; startedAt: string; completedAt: string; projectId?: string; projectName?: string; projectRoot?: string; result: any }> {
  const settings = loadSettings(db);
  const cfg = settings[request.subsystem];
  const depth = Math.max(1, Math.min(Number(request.depth || cfg.maxDepth || 4), 8));
  const startedAt = new Date().toISOString();
  let result: any = {};

  if (request.subsystem === 'ide_codebase_crawler') {
    const target = resolveProjectTarget(db, request);
    const root = safeScanRoot(target.rootPath);
    const coordination = runCrawlerCoordinatorTick(db, {
      projectId: target.id || 'default',
      projectRoot: root,
      maxFiles: 10000,
    });
    const latestOverview = readCodebaseIntelligence(db, target.id || 'default', 'overview', 1)[0] || null;

    result = {
      root,
      projectId: target.id,
      projectName: target.name,
      depth,
      filesIndexed: coordination.filesIndexed,
      totalNodes: coordination.totalNodes,
      symbols: coordination.symbols,
      relationships: coordination.relationships,
      conflicts: coordination.conflicts,
      driftEvents: coordination.driftEvents,
      semanticSymbols: coordination.semanticSymbols,
      hotPaths: coordination.hotPaths.slice(0, 20),
      topFiles: coordination.topFiles.slice(0, 20),
      overview: latestOverview,
      summary: `CrawlerCoordinator merged PSC+HCI+RIS for ${target.name || root}: ${coordination.filesIndexed} files, ${coordination.symbols} symbols, ${coordination.relationships} relationships.`,
    };

    request.projectId = request.projectId ?? target.id;
    request.projectName = request.projectName ?? target.name;
    request.projectRoot = request.projectRoot ?? target.rootPath;
  }

  if (request.subsystem === 'project_state_crawler') {
    const target = resolveProjectTarget(db, request);
    const root = safeScanRoot(target.rootPath);
    const crawl = await runProjectStateCrawler(db, {
      projectRoot: root,
      triggeredBy: 'subsystem_manual_run',
      includeHiddenDirs: request.includeHiddenDirs ?? cfg.includeHiddenDirs ?? false,
      includeBackupDirs: request.includeBackupDirs ?? cfg.includeBackupDirs ?? false,
    });

    result = {
      root,
      projectId: target.id,
      projectName: target.name,
      depth,
      snapshotId: crawl.snapshotId,
      cycleId: crawl.cycleId,
      files: crawl.totalFiles,
      parsedFiles: crawl.parsedFiles,
      skippedFiles: crawl.skippedFiles,
      totalDevtags: crawl.totalDevtags,
      driftEvents: crawl.driftEvents,
      summary: `Full crawl complete for ${target.name || root}: ${crawl.parsedFiles}/${crawl.totalFiles} files parsed, ${crawl.driftEvents} drift event(s).`,
    };

    request.projectId = request.projectId ?? target.id;
    request.projectName = request.projectName ?? target.name;
    request.projectRoot = request.projectRoot ?? target.rootPath;
  }

  if (request.subsystem === 'suggested_jobs_crawler') {
    const tick = runSuggestedJobsCrawlerTick(db);

    const recentJobs = db.prepare(
      `SELECT
         job_id,
         title,
         job_category,
         priority,
         source,
         implementation_status,
         created_at
       FROM job_records
       ORDER BY datetime(created_at) DESC
       LIMIT 30`
    ).all() as Array<{
      job_id: string;
      title: string;
      job_category: string;
      priority: string;
      source: string;
      implementation_status: string;
      created_at: string;
    }>;

    result = {
      mode: tick.mode,
      generated: tick.generated,
      protocol: tick.protocol,
      recentJobs,
      summary: `Suggested Jobs crawler ran in ${tick.mode} mode and generated ${tick.generated} job(s).`,
    };
  }

  if (request.subsystem === 'gap_analysis') {
    let target: ProjectTarget | undefined;
    try {
      target = resolveProjectTarget(db, request);
      request.projectId = request.projectId ?? target.id;
      request.projectName = request.projectName ?? target.name;
      request.projectRoot = request.projectRoot ?? target.rootPath;
    } catch {
      target = undefined;
    }

    const sessionId = `subsystem_gap_${Date.now()}`;
    const gapAgent = new GapAnalysisAgent(db);
    const analysis = await gapAgent.runFullAnalysis({
      session_id: sessionId,
      cycle_range: [0, Date.now()],
      project_root: target?.rootPath,
    });

    result = {
      sessionId,
      totalReports: analysis.total_reports,
      flaggedToGodFactory: analysis.flagged_to_god_factory,
      coverageSummary: analysis.coverage_summary,
      summary: `Full gap analysis generated ${analysis.total_reports} report(s), ${analysis.flagged_to_god_factory} flagged for God Factory.`,
    };
  }

  if (request.subsystem === 'god_factory_idle_scan') {
    await runGodFactoryIdleScanner(db);

    result = {
      summary: 'God Factory idle scanner completed one pass (max 1 file this tick).',
      maxFilesPerTick: 1,
      root: 'apps/',
    };
  }

  const payload = {
    subsystem: request.subsystem,
    startedAt,
    completedAt: new Date().toISOString(),
    projectId: request.projectId,
    projectName: request.projectName,
    projectRoot: request.projectRoot,
    result,
  };
  setKv(db, `subsystems:last_run:${request.subsystem}`, JSON.stringify(payload));
  return payload;
}
