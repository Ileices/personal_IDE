// ============================================
// Subsystems Routes - unified control plane
// for project-state, suggested-jobs, and gap-analysis
// ============================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { resolve } from 'path';

type SubsystemId = 'project_state_crawler' | 'suggested_jobs_crawler' | 'gap_analysis';

interface SubsystemConfig {
  enabled: boolean;
  idleEnabled: boolean;
  idleIntervalSec: number;
  maxDepth: number;
  manualOnly: boolean;
}

interface SubsystemsSettings {
  project_state_crawler: SubsystemConfig;
  suggested_jobs_crawler: SubsystemConfig;
  gap_analysis: SubsystemConfig;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const IDE_ROOT = resolve(__dirname, '../../../../');
const ALLOWED_ROOT = resolve(IDE_ROOT, '..');
const SETTINGS_KEY = 'subsystems:settings';

const DEFAULT_SETTINGS: SubsystemsSettings = {
  project_state_crawler: { enabled: true, idleEnabled: true, idleIntervalSec: 90, maxDepth: 5, manualOnly: false },
  suggested_jobs_crawler: { enabled: true, idleEnabled: true, idleIntervalSec: 120, maxDepth: 4, manualOnly: false },
  gap_analysis: { enabled: true, idleEnabled: true, idleIntervalSec: 180, maxDepth: 4, manualOnly: false },
};

function safeScanRoot(rootPath?: string): string {
  const raw = rootPath && rootPath.trim() ? rootPath : IDE_ROOT;
  const resolved = resolve(raw);
  if (!resolved.startsWith(ALLOWED_ROOT)) {
    throw new Error(`scan root outside allowed workspace: ${resolved}`);
  }
  return resolved;
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

function loadSettings(db: any): SubsystemsSettings {
  try {
    const raw = getKv(db, SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<SubsystemsSettings>;
    return {
      project_state_crawler: { ...DEFAULT_SETTINGS.project_state_crawler, ...(parsed.project_state_crawler || {}) },
      suggested_jobs_crawler: { ...DEFAULT_SETTINGS.suggested_jobs_crawler, ...(parsed.suggested_jobs_crawler || {}) },
      gap_analysis: { ...DEFAULT_SETTINGS.gap_analysis, ...(parsed.gap_analysis || {}) },
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

export async function subsystemsRoutes(app: FastifyInstance) {
  const db = (app as any).db;

  app.get('/settings', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const settings = loadSettings(db);
      const status = {
        project_state_crawler: getKv(db, 'subsystems:last_run:project_state_crawler'),
        suggested_jobs_crawler: getKv(db, 'subsystems:last_run:suggested_jobs_crawler'),
        gap_analysis: getKv(db, 'subsystems:last_run:gap_analysis'),
      };
      return reply.send({ settings, status });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/settings', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const updates = req.body as Partial<SubsystemsSettings>;
      const current = loadSettings(db);
      const merged: SubsystemsSettings = {
        project_state_crawler: { ...current.project_state_crawler, ...(updates.project_state_crawler || {}) },
        suggested_jobs_crawler: { ...current.suggested_jobs_crawler, ...(updates.suggested_jobs_crawler || {}) },
        gap_analysis: { ...current.gap_analysis, ...(updates.gap_analysis || {}) },
      };
      setKv(db, SETTINGS_KEY, JSON.stringify(merged));
      return reply.send({ success: true, settings: merged });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/run', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { subsystem: SubsystemId; projectRoot?: string; depth?: number };
    if (!body?.subsystem) return reply.status(400).send({ error: 'subsystem is required' });

    try {
      const settings = loadSettings(db);
      const cfg = settings[body.subsystem];
      const depth = Math.max(1, Math.min(Number(body.depth || cfg.maxDepth || 4), 8));
      const startedAt = new Date().toISOString();
      let result: any = {};

      if (body.subsystem === 'project_state_crawler') {
        const root = safeScanRoot(body.projectRoot);
        const stats = countTree(root, depth);
        result = {
          root,
          depth,
          files: stats.files,
          dirs: stats.dirs,
          topExtensions: topExtensions(stats.byExt),
          summary: `Scanned ${stats.files} files across ${stats.dirs} directories (depth ${depth})`,
        };
      }

      if (body.subsystem === 'suggested_jobs_crawler') {
        const rows = db.prepare(
          `SELECT model_id, avg_quality, success_rate, total_runs, trend
           FROM model_registry ORDER BY total_runs DESC LIMIT 20`
        ).all() as Array<{ model_id: string; avg_quality: number; success_rate: number; total_runs: number; trend: string }>;

        const jobs = rows
          .filter(r => r.total_runs >= 3 && (r.avg_quality < 55 || r.success_rate < 0.65 || r.trend === 'down'))
          .slice(0, 12)
          .map((r, i) => ({
            id: `${Date.now()}-${i}`,
            title: `Harden ${r.model_id.split('/').pop()}`,
            category: 'model_tool_enhancement',
            priority: r.avg_quality < 40 || r.success_rate < 0.5 ? 'high' : 'medium',
            source: 'Suggested Jobs Crawler',
            description: `Quality ${Math.round(r.avg_quality || 0)}%, success ${Math.round((r.success_rate || 0) * 100)}%, trend ${r.trend}. Build route/tooling mitigation.`
          }));

        result = {
          scannedModels: rows.length,
          suggestedJobs: jobs,
          summary: `Produced ${jobs.length} job(s) from model registry signals`,
        };
      }

      if (body.subsystem === 'gap_analysis') {
        const total = db.prepare('SELECT COUNT(*) as c FROM blame_records').get() as { c: number };
        const recentFails = db.prepare(
          `SELECT model, COUNT(*) as fail_count
           FROM blame_records
           WHERE success = 0 AND datetime(created_at) >= datetime('now', '-3 days')
           GROUP BY model
           ORDER BY fail_count DESC
           LIMIT 10`
        ).all() as Array<{ model: string; fail_count: number }>;

        const gapReports = recentFails.map((r, i) => ({
          id: `${Date.now()}-gap-${i}`,
          category: 'agent_performance',
          severity: r.fail_count >= 5 ? 'critical' : r.fail_count >= 3 ? 'error' : 'warning',
          model: r.model,
          message: `${r.fail_count} recent failures from ${r.model}`,
        }));

        result = {
          blameRecords: total.c,
          recentFailureClusters: recentFails,
          gapReports,
          summary: `Generated ${gapReports.length} gap signal(s) from recent failures`,
        };
      }

      const payload = { subsystem: body.subsystem, startedAt, completedAt: new Date().toISOString(), result };
      setKv(db, `subsystems:last_run:${body.subsystem}`, JSON.stringify(payload));
      return reply.send({ success: true, ...payload });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
