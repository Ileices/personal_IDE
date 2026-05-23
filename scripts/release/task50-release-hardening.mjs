#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..', '..');
const SERVER_DIR = join(ROOT, 'apps', 'server');
const TESTING_DIR = join(ROOT, 'testing');
const LOG_DIR = join(ROOT, 'testing', '.ide-logs');
const DEFAULT_REPORT_PATH = join(LOG_DIR, 'task50-release-hardening-report.json');
const DEFAULT_DB_PATH = './data/task50-release-hardening.db';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;

    const keyValue = arg.slice(2);
    const eq = keyValue.indexOf('=');
    if (eq >= 0) {
      out[keyValue.slice(0, eq)] = keyValue.slice(eq + 1);
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[keyValue] = next;
      i += 1;
    } else {
      out[keyValue] = 'true';
    }
  }
  return out;
}

function parseIntBounded(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

const args = parseArgs(process.argv.slice(2));
const PORT = parseIntBounded(args.port || process.env.RELEASE_SERVER_PORT, 3041, 1024, 65535);
const STARTUP_TIMEOUT_MS = parseIntBounded(args.startupTimeoutMs || process.env.RELEASE_STARTUP_TIMEOUT_MS, 180000, 5000, 900000);
const HEALTH_POLL_MS = parseIntBounded(args.healthPollMs || process.env.RELEASE_HEALTH_POLL_MS, 500, 100, 5000);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const REPORT_PATH = resolve(ROOT, args.output || process.env.RELEASE_REPORT_PATH || DEFAULT_REPORT_PATH);
const DB_PATH = String(args.dbPath || process.env.RELEASE_DB_PATH || DEFAULT_DB_PATH);
const ABS_DB_PATH = DB_PATH.startsWith('.')
  ? resolve(SERVER_DIR, 'src', 'db', '../../..', DB_PATH)
  : resolve(ROOT, DB_PATH);

const e2eFiles = [
  'e2e/subsystems.test.ts',
  'e2e/godFactory.test.ts',
  'e2e/validation.test.ts',
];

function log(message) {
  process.stdout.write(`[task50] ${message}\n`);
}

function runCommand(command, cmdArgs, options = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(command, cmdArgs, {
      cwd: ROOT,
      shell: process.platform === 'win32',
      stdio: 'inherit',
      env: process.env,
      ...options,
    });

    child.on('close', (code, signal) => {
      resolveRun({ code: code ?? 1, signal: signal ?? null });
    });
  });
}

async function request(method, path, body) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Origin: 'http://localhost:5173',
        Referer: 'http://localhost:5173/',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      json,
      text,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - startedAt,
      json: null,
      text: String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForHealth(startedProcess) {
  const until = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < until) {
    if (startedProcess.exitCode !== null) return false;
    const health = await request('GET', '/api/health');
    if (health.ok) return true;
    await delay(HEALTH_POLL_MS);
  }
  return false;
}

function startServer() {
  return spawn('pnpm', ['-C', SERVER_DIR, 'exec', 'tsx', 'src/index.ts'], {
    cwd: ROOT,
    shell: process.platform === 'win32',
    stdio: 'inherit',
    env: {
      ...process.env,
      SERVER_HOST: '127.0.0.1',
      SERVER_PORT: String(PORT),
      DB_PATH,
    },
  });
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    await runCommand('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      shell: false,
      stdio: 'ignore',
    });
    return;
  }
  child.kill('SIGTERM');
  await delay(1000);
  if (child.exitCode === null) child.kill('SIGKILL');
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function verifyMigrations() {
  const health = await request('GET', '/api/health');
  assert(health.ok, 'health endpoint failed during migration check');

  const dbMeta = health.json?.database;
  assert(dbMeta && typeof dbMeta === 'object', 'missing database migration metadata in /api/health');
  assert(Number(dbMeta.pendingMigrations) === 0, `pending migrations detected: ${dbMeta.pendingMigrations}`);
  assert(Number(dbMeta.totalMigrations) > 0, 'total migrations must be > 0');

  const serverRequire = createRequire(resolve(SERVER_DIR, 'package.json'));
  const BetterSqlite3 = serverRequire('better-sqlite3');
  const db = new BetterSqlite3(ABS_DB_PATH);
  try {
    const countRow = db.prepare('SELECT COUNT(*) AS c FROM schema_version').get();
    const count = Number(countRow?.c || 0);
    assert(count === Number(dbMeta.totalMigrations), `schema_version count mismatch: ${count} != ${dbMeta.totalMigrations}`);
  } finally {
    db.close();
  }

  return {
    status: 'pass',
    schemaVersion: Number(dbMeta.schemaVersion || 0),
    totalMigrations: Number(dbMeta.totalMigrations || 0),
    pendingMigrations: Number(dbMeta.pendingMigrations || 0),
  };
}

async function runE2EChecks() {
  const env = {
    ...process.env,
    TEST_SERVER_URL: BASE_URL,
    TEST_DB_PATH: ABS_DB_PATH,
  };

  const runs = [];
  for (const file of e2eFiles) {
    const run = await runCommand('pnpm', ['-C', TESTING_DIR, 'exec', 'vitest', 'run', file], { env });
    runs.push({ file, exitCode: run.code });
    if (run.code !== 0) {
      return {
        status: 'fail',
        tests: e2eFiles,
        runs,
      };
    }
  }

  return {
    status: 'pass',
    tests: e2eFiles,
    runs,
  };
}

async function runRollbackDrill() {
  const degraded = await request('POST', '/api/stability/record', {
    cycle: Date.now(),
    timestamp: new Date().toISOString(),
    processAlive: true,
    testsFailed: 9,
    testsTotal: 10,
    avgBlameScore: 0.1,
    loopDetected: true,
    buildtagRejectionRate: 0.6,
  });
  assert(degraded.ok, `failed to record degraded stability snapshot (${degraded.status})`);

  const windowAfterDegraded = await request('GET', '/api/stability/window');
  assert(windowAfterDegraded.ok, 'failed to fetch stability window after degraded record');
  const degradedHealth = String(windowAfterDegraded.json?.health || '').toLowerCase();
  assert(degradedHealth === 'degraded' || degradedHealth === 'critical', `expected degraded/critical health, got ${degradedHealth || 'empty'}`);

  for (let i = 0; i < 3; i += 1) {
    const healthy = await request('POST', '/api/stability/record', {
      cycle: Date.now() + i + 1,
      timestamp: new Date().toISOString(),
      processAlive: true,
      testsFailed: 0,
      testsTotal: 10,
      avgBlameScore: 0.95,
      loopDetected: false,
      buildtagRejectionRate: 0,
    });
    assert(healthy.ok, `failed to record recovery stability snapshot (${healthy.status})`);
  }

  const windowAfterRecovery = await request('GET', '/api/stability/window');
  assert(windowAfterRecovery.ok, 'failed to fetch stability window after recovery');
  const recoveredHealth = String(windowAfterRecovery.json?.health || '').toLowerCase();
  assert(recoveredHealth === 'healthy', `expected healthy status after recovery drill, got ${recoveredHealth || 'empty'}`);

  const recoveryLog = await request('GET', '/api/suggested-jobs/crash-recovery-log?limit=10');
  assert(recoveryLog.ok, `failed to query crash recovery log (${recoveryLog.status})`);

  return {
    status: 'pass',
    degradedHealth,
    recoveredHealth,
    recoveryLogEntries: Array.isArray(recoveryLog.json?.log) ? recoveryLog.json.log.length : 0,
  };
}

async function ensureCleanDbPath() {
  if (existsSync(ABS_DB_PATH)) {
    await rm(ABS_DB_PATH, { force: true });
  }
  const shm = `${ABS_DB_PATH}-shm`;
  const wal = `${ABS_DB_PATH}-wal`;
  if (existsSync(shm)) await rm(shm, { force: true });
  if (existsSync(wal)) await rm(wal, { force: true });
}

async function main() {
  const report = {
    task: 'task50-release-hardening',
    runAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    dbPath: ABS_DB_PATH,
    checks: {
      migrations: { status: 'pending' },
      e2e: { status: 'pending' },
      rollbackDrill: { status: 'pending' },
    },
    overallStatus: 'pending',
  };

  let server = null;

  try {
    await mkdir(LOG_DIR, { recursive: true });
    await ensureCleanDbPath();

    log(`starting server on ${BASE_URL} with isolated DB`);
    server = startServer();
    const healthy = await waitForHealth(server);
    assert(healthy, 'server did not become healthy in time');

    log('running migration verification');
    report.checks.migrations = await verifyMigrations();

    log('running end-to-end release tests');
    report.checks.e2e = await runE2EChecks();
    assert(report.checks.e2e.status === 'pass', 'e2e checks failed');

    log('running rollback drill');
    report.checks.rollbackDrill = await runRollbackDrill();

    report.overallStatus = 'pass';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report.overallStatus = 'fail';
    report.error = message;
    process.exitCode = 1;
  } finally {
    if (server) {
      await stopServer(server);
    }

    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    log(`report written: ${REPORT_PATH}`);
    log(`overall status: ${report.overallStatus}`);
  }
}

void main();
