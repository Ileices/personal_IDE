import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { get, post, waitForServer } from './helpers';

const serverRequire = createRequire(resolve(process.cwd(), '../apps/server/package.json'));
const Database = serverRequire('better-sqlite3') as any;
const DB_PATH = process.env.TEST_DB_PATH || resolve(process.cwd(), '../apps/data/personal-ide.db');
const PIPELINE_CHECKPOINT_KEY = 'subsystems:pipeline_checkpoint:last';
const SUBSYSTEM_SETTINGS_KEY = 'subsystems:settings';

function withDb<T>(fn: (db: any) => T): T {
  const db = new Database(DB_PATH);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function setKv(db: any, key: string, value: string): void {
  db.prepare(
    `INSERT INTO app_kv (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(key, value);
}

describe('Subsystems Manual Run Contract', () => {
  let sandboxRoot = '';
  let originalPipelineCheckpoint: string | null = null;
  let originalSubsystemSettings: string | null = null;
  const createdSnapshotIds = new Set<string>();

  beforeAll(async () => {
    const up = await waitForServer();
    if (!up) throw new Error('Server not reachable');

    sandboxRoot = mkdtempSync(join(tmpdir(), 'subsystems-e2e-'));
    writeFileSync(join(sandboxRoot, 'alpha.ts'), 'export const alpha = 1;\n');
    writeFileSync(join(sandboxRoot, 'README.md'), '# Subsystems E2E\n');

    originalPipelineCheckpoint = withDb((db) => {
      const row = db.prepare('SELECT value FROM app_kv WHERE key = ?').get(PIPELINE_CHECKPOINT_KEY) as { value?: string } | undefined;
      return row?.value ?? null;
    });

    originalSubsystemSettings = withDb((db) => {
      const row = db.prepare('SELECT value FROM app_kv WHERE key = ?').get(SUBSYSTEM_SETTINGS_KEY) as { value?: string } | undefined;
      return row?.value ?? null;
    });

    const seededCheckpoint = {
      tickStartedAt: '2026-05-20T00:00:00.000Z',
      recordedAt: '2026-05-20T00:00:01.000Z',
      projectState: { totalDevtags: 11, driftEvents: 1, snapshotId: 'seeded-snapshot' },
      suggested: { mode: 'balanced', generated: 2, protocol: 'seeded' },
      gap: { totalReports: 3, flaggedToGodFactory: 1, sessionId: 'seeded-session' },
      idleScanRan: true,
      pipelineHealth: {
        pendingFlaggedGapReports: 1,
        pendingSuggestedJobs: 2,
        latestSnapshotId: 'seeded-snapshot',
        anomaliesDetected: false,
      },
    };

    withDb((db) => {
      setKv(db, PIPELINE_CHECKPOINT_KEY, JSON.stringify(seededCheckpoint));
    });
  });

  afterAll(() => {
    withDb((db) => {
      for (const snapshotId of createdSnapshotIds) {
        try { db.prepare('DELETE FROM snapshot_devtags WHERE snapshot_id = ?').run(snapshotId); } catch {}
        try { db.prepare('DELETE FROM drift_events WHERE snapshot_id = ?').run(snapshotId); } catch {}
        try { db.prepare('DELETE FROM ground_truth_snapshots WHERE snapshot_id = ?').run(snapshotId); } catch {}
      }

      if (originalPipelineCheckpoint === null) {
        db.prepare('DELETE FROM app_kv WHERE key = ?').run(PIPELINE_CHECKPOINT_KEY);
      } else {
        setKv(db, PIPELINE_CHECKPOINT_KEY, originalPipelineCheckpoint);
      }

      if (originalSubsystemSettings === null) {
        db.prepare('DELETE FROM app_kv WHERE key = ?').run(SUBSYSTEM_SETTINGS_KEY);
      } else {
        setKv(db, SUBSYSTEM_SETTINGS_KEY, originalSubsystemSettings);
      }
    });

    if (sandboxRoot) {
      rmSync(sandboxRoot, { recursive: true, force: true });
    }
  });

  it('GET /api/subsystems/settings returns pipeline checkpoint telemetry', async () => {
    const response = await get('/api/subsystems/settings');

    expect(response.status).toBe(200);
    expect(response.json.pipelineCheckpoint).toBeTruthy();
    expect(response.json.pipelineCheckpoint.projectState?.snapshotId).toBe('seeded-snapshot');
    expect(typeof response.json.scheduler?.running).toBe('boolean');
    expect(typeof response.json.status).toBe('object');
  });

  it('POST /api/subsystems/run for project_state_crawler returns full crawl payload', async () => {
    const response = await post('/api/subsystems/run', {
      subsystem: 'project_state_crawler',
      projectRoot: sandboxRoot,
      projectName: `subsystems-e2e-${randomUUID()}`,
      includeHiddenDirs: true,
      includeBackupDirs: false,
      depth: 2,
    });

    expect(response.status).toBe(200);
    expect(response.json.success).toBe(true);
    expect(typeof response.json.result?.snapshotId).toBe('string');
    expect(typeof response.json.result?.cycleId).toBe('string');
    expect(typeof response.json.result?.parsedFiles).toBe('number');
    expect(typeof response.json.result?.driftEvents).toBe('number');
    expect(String(response.json.result?.summary || '')).toContain('Full crawl complete');

    createdSnapshotIds.add(response.json.result.snapshotId as string);

    const snapshotRow = withDb((db) =>
      db.prepare('SELECT snapshot_id FROM ground_truth_snapshots WHERE snapshot_id = ?').get(response.json.result.snapshotId) as
        | { snapshot_id: string }
        | undefined,
    );

    expect(snapshotRow?.snapshot_id).toBe(response.json.result.snapshotId);
  });

  it('POST /api/subsystems/run for suggested_jobs_crawler returns tick metadata', async () => {
    const response = await post('/api/subsystems/run', {
      subsystem: 'suggested_jobs_crawler',
      depth: 2,
    });

    expect(response.status).toBe(200);
    expect(response.json.success).toBe(true);
    expect(typeof response.json.result?.mode).toBe('string');
    expect(typeof response.json.result?.generated).toBe('number');
    expect(
      response.json.result?.protocol === undefined || typeof response.json.result?.protocol === 'number',
    ).toBe(true);
    expect(Array.isArray(response.json.result?.recentJobs)).toBe(true);
  });

  it('POST /api/subsystems/run for gap_analysis returns full analysis payload', async () => {
    const response = await post('/api/subsystems/run', {
      subsystem: 'gap_analysis',
      projectRoot: sandboxRoot,
      projectName: 'subsystems-e2e-gap',
      depth: 2,
    });

    expect(response.status).toBe(200);
    expect(response.json.success).toBe(true);
    expect(String(response.json.result?.sessionId || '')).toMatch(/^subsystem_gap_/);
    expect(typeof response.json.result?.totalReports).toBe('number');
    expect(typeof response.json.result?.flaggedToGodFactory).toBe('number');
    expect(response.json.result).toHaveProperty('coverageSummary');
  });

  it('POST /api/subsystems/coverage evaluates backup path inclusion settings', async () => {
    const backupPath = join(sandboxRoot, '.backups', 'apps', 'web', 'src', 'components', 'LegacyWidget.tsx');
    const activePath = join(sandboxRoot, 'apps', 'web', 'src', 'components', 'LiveWidget.tsx');

    const updateDisabled = await post('/api/subsystems/settings', {
      project_state_crawler: {
        includeHiddenDirs: false,
        includeBackupDirs: false,
      },
    });
    expect(updateDisabled.status).toBe(200);

    const disabledCoverage = await post('/api/subsystems/coverage', {
      projectRoot: sandboxRoot,
      filePaths: [backupPath, activePath],
    });

    expect(disabledCoverage.status).toBe(200);
    expect(disabledCoverage.json.subsystem).toBe('project_state_crawler');
    expect(Array.isArray(disabledCoverage.json.results)).toBe(true);

    const backupResultDisabled = (disabledCoverage.json.results as Array<any>).find((r) =>
      String(r.inputPath || '').endsWith('LegacyWidget.tsx'),
    );
    expect(backupResultDisabled?.coveredByCurrentSettings).toBe(false);
    expect(Array.isArray(backupResultDisabled?.requiredSettings)).toBe(true);
    expect((backupResultDisabled?.requiredSettings || [])).toContain('includeBackupDirs');

    const updateEnabled = await post('/api/subsystems/settings', {
      project_state_crawler: {
        includeHiddenDirs: true,
        includeBackupDirs: true,
      },
    });
    expect(updateEnabled.status).toBe(200);

    const enabledCoverage = await post('/api/subsystems/coverage', {
      projectRoot: sandboxRoot,
      filePaths: [backupPath],
    });

    expect(enabledCoverage.status).toBe(200);
    const backupResultEnabled = (enabledCoverage.json.results as Array<any>).find((r) =>
      String(r.inputPath || '').endsWith('LegacyWidget.tsx'),
    );
    expect(backupResultEnabled?.coveredByCurrentSettings).toBe(true);
    expect(Array.isArray(backupResultEnabled?.reasons)).toBe(true);
    expect((backupResultEnabled?.reasons || []).length).toBe(0);
  });
});
