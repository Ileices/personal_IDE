#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const SERVER_DIR = join(ROOT, 'apps', 'server');
const TESTING_DIR = join(ROOT, 'testing');
const HEALTH_URL = process.env.TEST_SERVER_URL || 'http://127.0.0.1:3001/api/health';
const pnpmCmd = 'pnpm';
const useShell = process.platform === 'win32';
const requestedTests = process.argv.slice(2);
const testFiles = requestedTests.length > 0 ? requestedTests : ['e2e/subsystems.test.ts'];

function readBoundedIntEnv(name, fallback, min, max) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

const SERVER_START_TIMEOUT_MS = readBoundedIntEnv('TEST_SERVER_STARTUP_TIMEOUT_MS', 240_000, 10_000, 900_000);
const SERVER_START_ATTEMPTS = readBoundedIntEnv('TEST_SERVER_STARTUP_ATTEMPTS', 2, 1, 5);
const SERVER_HEALTH_POLL_MS = readBoundedIntEnv('TEST_SERVER_HEALTH_POLL_MS', 500, 100, 5_000);

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
      shell: useShell,
      ...options,
    });

    child.on('close', (code, signal) => {
      resolveRun({ code: code ?? 1, signal: signal ?? null });
    });
  });
}

async function isServerHealthy() {
  try {
    const response = await fetch(HEALTH_URL, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(child, timeoutMs = SERVER_START_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isServerHealthy()) return true;
    if (child && child.exitCode !== null) {
      return false;
    }
    await delay(SERVER_HEALTH_POLL_MS);
  }
  return false;
}

function startServer() {
  const child = spawn(
    pnpmCmd,
    ['-C', SERVER_DIR, 'exec', 'tsx', 'src/index.ts'],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        SERVER_HOST: process.env.SERVER_HOST || '127.0.0.1',
        SERVER_PORT: process.env.SERVER_PORT || '3001',
      },
      stdio: 'inherit',
      shell: useShell,
    },
  );

  return child;
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;

  if (process.platform === 'win32') {
    await runCommand('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      shell: false,
    });
    return;
  }

  child.kill('SIGTERM');
  await delay(1000);
  if (child.exitCode === null) {
    child.kill('SIGKILL');
  }
}

async function main() {
  let spawnedServer = null;

  try {
    const alreadyRunning = await isServerHealthy();
    if (alreadyRunning) {
      log(`[subsystems-e2e] Reusing running server at ${HEALTH_URL}`);
    } else {
      let startupError = `Server did not become healthy at ${HEALTH_URL}`;
      for (let attempt = 1; attempt <= SERVER_START_ATTEMPTS; attempt += 1) {
        log(`[subsystems-e2e] Starting server (attempt ${attempt}/${SERVER_START_ATTEMPTS})...`);
        spawnedServer = startServer();
        const up = await waitForServer(spawnedServer);
        if (up) break;

        if (spawnedServer.exitCode !== null) {
          startupError = `Server process exited early with code ${spawnedServer.exitCode}`;
        } else {
          startupError = `Server did not become healthy at ${HEALTH_URL} within ${Math.round(SERVER_START_TIMEOUT_MS / 1000)}s`;
        }

        await stopServer(spawnedServer);
        spawnedServer = null;

        if (attempt < SERVER_START_ATTEMPTS) {
          log(`[subsystems-e2e] Startup attempt ${attempt} failed: ${startupError}. Retrying...`);
          await delay(1500);
        }
      }

      if (!spawnedServer || !(await isServerHealthy())) {
        throw new Error(startupError);
      }
    }

    log(`[subsystems-e2e] Running tests: ${testFiles.join(', ')}`);
    const testRun = await runCommand(pnpmCmd, ['-C', TESTING_DIR, 'exec', 'vitest', 'run', ...testFiles]);
    if (testRun.code !== 0) {
      process.exitCode = testRun.code;
      return;
    }

    log('[subsystems-e2e] Completed successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[subsystems-e2e] Failed: ${message}\n`);
    process.exitCode = 1;
  } finally {
    if (spawnedServer) {
      await stopServer(spawnedServer);
    }
  }
}

void main();
