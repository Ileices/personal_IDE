import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { get, post, waitForServer } from './helpers';

const serverRequire = createRequire(resolve(process.cwd(), '../apps/server/package.json'));
const Database = serverRequire('better-sqlite3') as any;
const DB_PATH = process.env.TEST_DB_PATH || resolve(process.cwd(), '../apps/data/personal-ide.db');
const REPO_ROOT = resolve(process.cwd(), '..');
const CONTROL_OWNER_LOGIN = 'Ileices';
const LOOP_KV_KEYS = [
  'god_factory:loop:last_model',
  'god_factory:loop:last_project_id',
  'god_factory:loop:last_max_iterations',
  'god_factory:loop:last_auto_approve_changes',
  'god_factory:loop:last_auto_answer_questions',
  'god_factory:loop:last_checkpoint_every',
  'god_factory:loop:last_job_max_iterations',
];

function withDb<T>(fn: (db: any) => T): T {
  const db = new Database(DB_PATH);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function restoreRows(db: any, table: string, rows: Array<Record<string, unknown>>) {
  db.prepare(`DELETE FROM ${table}`).run();
  for (const row of rows) {
    const keys = Object.keys(row);
    const placeholders = keys.map(() => '?').join(', ');
    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
    db.prepare(sql).run(...keys.map((key) => row[key]));
  }
}

function activateControlOwner() {
  withDb((db) => {
    db.prepare('UPDATE auth_tokens SET is_active = 0').run();

    // Keep the owner gate testable without depending on a live GitHub login.
    // If this contract changes elsewhere, update the route gate and this seed path together.
    db.prepare(`
      INSERT INTO auth_tokens (
        id, github_user_id, github_login, github_name, github_email,
        avatar_url, token_encrypted, is_active, has_copilot, updated_at
      ) VALUES (?, ?, ?, ?, ?, '', 'e2e-owner-token', 1, 1, datetime('now'))
      ON CONFLICT(github_user_id) DO UPDATE SET
        github_login = excluded.github_login,
        github_name = excluded.github_name,
        github_email = excluded.github_email,
        token_encrypted = excluded.token_encrypted,
        is_active = 1,
        has_copilot = 1,
        updated_at = datetime('now')
    `).run(randomUUID(), 999999999, CONTROL_OWNER_LOGIN, 'E2E Control Owner', 'e2e@example.invalid');
  });
}

function insertMalformedSuggestedJob(projectId: string) {
  const jobId = `gf-e2e-${randomUUID()}`;

  withDb((db) => {
    db.prepare(`
      INSERT INTO job_records (
        id, job_id, project_id, job_category, source, source_record_ids, priority, title,
        affected_files, affected_devtags, affected_plantags, required_buildtags,
        blocking_jobs, blocked_by_jobs, hierarchy, atomic_steps, sandbox_spec,
        implementation_status, created_cycle, last_updated_cycle, timestamp, created_at
      ) VALUES (?, ?, ?, 'user_requested', 'god_factory_agent', '[]', 'high', ?,
                ?, '[]', '[]', '[]', '[]', '[]', '{}', ?, '{}',
                'suggested', 0, 0, datetime('now'), datetime('now'))
    `).run(
      randomUUID(),
      jobId,
      projectId,
      'E2E malformed God Factory payload',
      '["src/bad.ts"',
      '["step-one"',
    );
  });

  return jobId;
}

async function waitFor(condition: () => Promise<boolean>, timeoutMs = 5_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await condition()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error('Timed out waiting for condition');
}

describe('God Factory Loop Contract', () => {
  let projectId: string;
  let authSnapshot: Array<Record<string, unknown>> = [];
  let loopStateSnapshot: Record<string, unknown> | null = null;
  let loopKvSnapshot: Array<Record<string, unknown>> = [];

  beforeAll(async () => {
    const up = await waitForServer();
    if (!up) throw new Error('Server not reachable');

    ({ authSnapshot, loopStateSnapshot, loopKvSnapshot } = withDb((db) => {
      const placeholders = LOOP_KV_KEYS.map(() => '?').join(', ');
      return {
        authSnapshot: db.prepare('SELECT * FROM auth_tokens ORDER BY github_user_id').all(),
        loopStateSnapshot: db.prepare("SELECT * FROM god_factory_loop_state WHERE id = 'singleton'").get() ?? null,
        loopKvSnapshot: db.prepare(`SELECT * FROM app_kv WHERE key IN (${placeholders}) ORDER BY key`).all(...LOOP_KV_KEYS),
      };
    }));

    await post('/api/auth/guest', { displayName: 'GodFactoryE2E' });

    const project = await post('/api/memory/projects', {
      name: `god-factory-e2e-${Date.now()}`,
      rootPath: REPO_ROOT,
    });
    projectId = project.json.project?.id;
    expect([200, 201]).toContain(project.status);
    expect(projectId).toBeDefined();

    activateControlOwner();
  });

  afterAll(async () => {
    await post('/api/god-factory/loop/stop');

    withDb((db) => {
      if (projectId) {
        db.prepare('DELETE FROM god_factory_runs WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM job_records WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
      }

      const placeholders = LOOP_KV_KEYS.map(() => '?').join(', ');
      db.prepare(`DELETE FROM app_kv WHERE key IN (${placeholders})`).run(...LOOP_KV_KEYS);
      for (const row of loopKvSnapshot) {
        db.prepare('INSERT INTO app_kv (key, value, updated_at) VALUES (?, ?, ?)').run(row.key, row.value, row.updated_at);
      }

      if (loopStateSnapshot) {
        db.prepare("DELETE FROM god_factory_loop_state WHERE id = 'singleton'").run();
        const keys = Object.keys(loopStateSnapshot);
        const sql = `INSERT INTO god_factory_loop_state (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
        db.prepare(sql).run(...keys.map((key) => loopStateSnapshot?.[key]));
      }

      restoreRows(db, 'auth_tokens', authSnapshot);
    });
  });

  afterEach(async () => {
    activateControlOwner();
    await post('/api/god-factory/loop/stop');
  });

  it('rejects loop start when the active account is not the control owner', async () => {
    await post('/api/auth/guest', { displayName: 'GuestUser' });

    const start = await post('/api/god-factory/loop/start', {
      projectId,
      model: 'openai/gpt-4.1',
      maxIterations: 2,
    });

    expect(start.status).toBe(403);
    expect(start.json.error).toContain('repository owner privileges');

    activateControlOwner();
  });

  it('persists explicit governance settings into loop status', async () => {
    const start = await post('/api/god-factory/loop/start', {
      projectId,
      model: 'openai/gpt-4.1',
      maxIterations: 3,
      autoApproveChanges: false,
      autoAnswerQuestions: false,
      checkpointEvery: 4,
    });

    expect(start.status).toBe(200);
    expect(start.json.ok).toBe(true);

    const status = await get('/api/god-factory/loop/status');
    expect(status.status).toBe(200);
    expect(status.json.config.last_project_id).toBe(projectId);
    expect(status.json.config.last_model).toBe('openai/gpt-4.1');
    expect(status.json.config.last_max_iterations).toBe(3);
    expect(status.json.config.governance).toMatchObject({
      autoApproveChanges: false,
      autoAnswerQuestions: false,
      checkpointEvery: 4,
      jobMaxIterations: 10,
      mode: 'safe',
    });
  });

  it('reclaims stop-path control after a malformed job payload is rejected', async () => {
    const jobId = insertMalformedSuggestedJob(projectId);

    const start = await post('/api/god-factory/loop/start', {
      projectId,
      model: 'openai/gpt-4.1',
      maxIterations: 5,
      checkpointEvery: 2,
    });

    expect(start.status).toBe(200);

    await waitFor(async () => {
      const status = await get('/api/god-factory/loop/status');
      return Boolean(status.json.activeRun?.run_id || status.json.current_run_id);
    }, 2_000);

    const stop = await post('/api/god-factory/loop/stop');
    expect(stop.status).toBe(200);
    expect(stop.json.ok).toBe(true);

    await waitFor(async () => {
      const status = await get('/api/god-factory/loop/status');
      return status.json.state === 'idle' && status.json.current_run_id === null;
    });

    const dbState = withDb((db) => ({
      job: db.prepare('SELECT implementation_status FROM job_records WHERE job_id = ?').get(jobId),
      run: db.prepare(`
        SELECT status, stop_reason
        FROM god_factory_runs
        WHERE project_id = ?
        ORDER BY started_at DESC
        LIMIT 1
      `).get(projectId),
    }));

    // Keep malformed payloads isolated: one bad record may be rejected, but it must not strand the loop in implementing/running forever.
    expect(dbState.job?.implementation_status).toBe('rejected');
    expect(dbState.run?.status).toBe('stopped');
    expect(dbState.run?.stop_reason).toBe('manual_stop');
  });
});