#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;

    const trimmed = arg.slice(2);
    const eq = trimmed.indexOf('=');
    if (eq >= 0) {
      out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[trimmed] = next;
      i += 1;
    } else {
      out[trimmed] = 'true';
    }
  }
  return out;
}

function parseIntBounded(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function nowIso() {
  return new Date().toISOString();
}

const args = parseArgs(process.argv.slice(2));
const BASE_URL = String(args.baseUrl || args['base-url'] || process.env.BENCH_BASE_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '');
const ORIGIN = String(args.origin || process.env.BENCH_ORIGIN || 'http://localhost:5173').trim();
const REQUEST_TIMEOUT_MS = parseIntBounded(args.timeoutMs || args['timeout-ms'] || process.env.BENCH_TIMEOUT_MS, 12000, 1000, 60000);
const RECOVERY_PASSES = parseIntBounded(args.recoveryPasses || args['recovery-passes'] || process.env.BENCH_RECOVERY_PASSES, 3, 1, 20);
const OUTPUT_PATH = String(args.output || process.env.BENCH_OUTPUT || '').trim();

async function request(method, path, body) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Origin: ORIGIN,
        Referer: `${ORIGIN.replace(/\/+$/, '')}/`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();

    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    return {
      ok: res.ok,
      status: res.status,
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

function summarizeCalls(calls) {
  const okCount = calls.filter((c) => c.ok).length;
  const latencies = calls.map((c) => c.latencyMs).filter((n) => Number.isFinite(n));
  const avgLatencyMs = latencies.length > 0
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : null;

  return {
    totalCalls: calls.length,
    okCount,
    errorCount: calls.length - okCount,
    avgLatencyMs,
  };
}

async function runLocalOnlyScenario() {
  const calls = [];

  const createdProject = await request('POST', '/api/memory/projects', {
    name: `Task49 Bench ${Date.now()}`,
    rootPath: process.cwd(),
    description: 'Task49 benchmark harness project seed',
  });
  calls.push(createdProject);

  const projectId = createdProject.json?.project?.id || null;

  calls.push(await request('GET', '/api/health'));
  calls.push(await request('GET', '/api/subsystems/settings'));
  calls.push(await request('POST', '/api/subsystems/run', {
    subsystem: 'suggested_jobs_crawler',
    projectId,
  }));

  const subsystemsRun = calls[3];
  return {
    mode: 'local_only',
    pass: calls.every((c) => c.ok),
    summary: summarizeCalls(calls),
      details: {
      suggestedJobs: subsystemsRun.json?.result ?? null,
        healthStatus: calls[1].json?.status || null,
        projectId,
        statuses: calls.map((c) => c.status),
    },
  };
}

async function runLanMeshScenario() {
  const calls = [];

  const safety = await request('GET', '/api/nano/mesh/safety');
  calls.push(safety);

  const meshInfo = await request('GET', '/api/nano/mesh/info');
  calls.push(meshInfo);

  const meshPeers = await request('GET', '/api/nano/mesh/peers');
  calls.push(meshPeers);

  // Intentionally low trust signal to verify safety envelope behavior.
  const guardedConnect = await request('POST', '/api/nano/discovery/connect', {
    peer: 'bench-peer-local',
    trustScore: 0.1,
  });
  calls.push(guardedConnect);

  const blockedByEnvelope = guardedConnect.status === 401 || guardedConnect.status === 403 || guardedConnect.status === 423;

  return {
    mode: 'lan_mesh',
    pass: safety.ok && meshInfo.status > 0 && meshPeers.status > 0 && blockedByEnvelope,
    summary: summarizeCalls(calls),
    details: {
      safety: safety.json ?? null,
      meshInfo: meshInfo.json ?? null,
      meshPeersCount: Array.isArray(meshPeers.json?.peers) ? meshPeers.json.peers.length : null,
      guardedConnectStatus: guardedConnect.status,
      guardedConnectBody: guardedConnect.json ?? guardedConnect.text,
      statuses: calls.map((c) => c.status),
    },
  };
}

async function runDegradedScenario() {
  const calls = [];

  const degradedRecord = await request('POST', '/api/stability/record', {
    cycle: Date.now(),
    processAlive: true,
    testsFailed: 8,
    testsTotal: 10,
    avgBlameScore: 0.2,
    loopDetected: true,
    buildtagRejectionRate: 0.5,
  });
  calls.push(degradedRecord);

  const stabilityWindow = await request('GET', '/api/stability/window');
  calls.push(stabilityWindow);

  const health = String(stabilityWindow.json?.health || '').toLowerCase();
  const isDegraded = health === 'degraded' || health === 'critical';

  return {
    mode: 'degraded_mode',
    pass: degradedRecord.ok && stabilityWindow.ok && isDegraded,
    summary: summarizeCalls(calls),
    details: {
      health,
      latestSnapshot: Array.isArray(stabilityWindow.json?.snapshots) ? stabilityWindow.json.snapshots[0] ?? null : null,
      statuses: calls.map((c) => c.status),
    },
  };
}

async function runRecoveryScenario() {
  const calls = [];

  for (let i = 0; i < RECOVERY_PASSES; i += 1) {
    calls.push(await request('POST', '/api/stability/record', {
      cycle: Date.now() + i,
      processAlive: true,
      testsFailed: 0,
      testsTotal: 10,
      avgBlameScore: 0.95,
      loopDetected: false,
      buildtagRejectionRate: 0,
    }));
  }

  const stabilityWindow = await request('GET', '/api/stability/window');
  calls.push(stabilityWindow);

  const recoveryLog = await request('GET', '/api/suggested-jobs/crash-recovery-log?limit=10');
  calls.push(recoveryLog);

  const health = String(stabilityWindow.json?.health || '').toLowerCase();
  const healthy = health === 'healthy';

  return {
    mode: 'recovery_mode',
    pass: stableCalls(calls, RECOVERY_PASSES) && stabilityWindow.ok && recoveryLog.ok && healthy,
    summary: summarizeCalls(calls),
    details: {
      health,
      recoveryLogCount: Array.isArray(recoveryLog.json?.log) ? recoveryLog.json.log.length : null,
      statuses: calls.map((c) => c.status),
    },
  };
}

function stableCalls(calls, expectedStableWrites) {
  const writes = calls.slice(0, expectedStableWrites);
  return writes.every((c) => c.ok);
}

function printReport(report) {
  const lines = [];
  lines.push('Task49 benchmark harness result');
  lines.push(`baseUrl: ${report.baseUrl}`);
  lines.push(`runAt: ${report.runAt}`);
  lines.push(`overallPass: ${report.overallPass}`);
  lines.push('scenarios:');
  for (const scenario of report.scenarios) {
    lines.push(`- ${scenario.mode}: ${scenario.pass ? 'PASS' : 'FAIL'} (ok=${scenario.summary.okCount}/${scenario.summary.totalCalls}, avgLatencyMs=${scenario.summary.avgLatencyMs ?? 'n/a'})`);
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

async function main() {
  const report = {
    task: 'task49-benchmark-harness',
    runAt: nowIso(),
    baseUrl: BASE_URL,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    recoveryPasses: RECOVERY_PASSES,
    scenarios: [],
    overallPass: false,
  };

  const localOnly = await runLocalOnlyScenario();
  report.scenarios.push(localOnly);

  const lanMesh = await runLanMeshScenario();
  report.scenarios.push(lanMesh);

  const degraded = await runDegradedScenario();
  report.scenarios.push(degraded);

  const recovery = await runRecoveryScenario();
  report.scenarios.push(recovery);

  report.overallPass = report.scenarios.every((s) => s.pass);

  printReport(report);

  if (OUTPUT_PATH) {
    const resolved = resolve(process.cwd(), OUTPUT_PATH);
    await writeFile(resolved, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    process.stdout.write(`wrote report: ${resolved}\n`);
  }

  if (!report.overallPass) {
    process.exitCode = 1;
  }
}

void main();
