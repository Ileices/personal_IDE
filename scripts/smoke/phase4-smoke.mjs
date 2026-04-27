#!/usr/bin/env node

function parseCliOptions(argv) {
  const options = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      continue;
    }

    const trimmed = arg.slice(2);
    const equalsIndex = trimmed.indexOf('=');

    if (equalsIndex >= 0) {
      const key = trimmed.slice(0, equalsIndex);
      const value = trimmed.slice(equalsIndex + 1);
      options[key] = value;
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      options[trimmed] = next;
      i += 1;
    } else {
      options[trimmed] = 'true';
    }
  }

  return options;
}

const cliOptions = parseCliOptions(process.argv.slice(2));

const baseUrlOption = cliOptions.baseUrl || cliOptions['base-url'];
const originOption = cliOptions.origin;
const modelOption = cliOptions.model;

const BASE_URL = (baseUrlOption || process.env.PHASE4_BASE_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '');
const ORIGIN = originOption || process.env.PHASE4_ORIGIN || 'http://localhost:5173';
const MODEL = modelOption || process.env.PHASE4_MODEL || 'ollama/llama3.2';

const requestHeaders = {
  Origin: ORIGIN,
  Referer: `${ORIGIN}/`,
};

function logStep(step) {
  console.error(`[phase4-smoke] ${step}`);
}

function extractFirstSseEvent(content) {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (!line.startsWith('data:')) {
      continue;
    }

    const raw = line.slice(5).trim();
    if (!raw) {
      continue;
    }

    try {
      return { parsed: JSON.parse(raw), raw };
    } catch {
      return { parsed: null, raw };
    }
  }
  return { parsed: null, raw: null };
}

async function request(method, path, body, timeoutMs = 15000) {
  const headers = { ...requestHeaders };
  const init = { method, headers };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  init.signal = controller.signal;

  try {
    const res = await fetch(`${BASE_URL}${path}`, init);
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
      json,
      text,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      json: null,
      text: String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendChat(projectId, message) {
  const url = `${BASE_URL}/api/chat/send`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        ...requestHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        projectId,
        message,
        mode: 'ask',
        model: MODEL,
      }),
      signal: controller.signal,
    });

    const status = res.status;
    const ok = res.ok;

    if (!res.body) {
      return {
        ok,
        status,
        firstType: null,
        conversationId: null,
        messageId: null,
        hasConversationId: false,
        hasMessageId: false,
        firstEventRaw: null,
      };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let firstEventRaw = null;
    let parsed = null;

    const firstEventDeadlineMs = 15000;
    const firstEventUntil = Date.now() + firstEventDeadlineMs;

    while (Date.now() < firstEventUntil) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data:')) {
          continue;
        }

        const raw = line.slice(5).trim();
        if (!raw) {
          continue;
        }

        firstEventRaw = raw;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = null;
        }
        break;
      }

      if (firstEventRaw) {
        break;
      }
    }

    try {
      await reader.cancel();
    } catch {
      // Ignore reader cancellation errors.
    }

    return {
      ok,
      status,
      firstType: parsed?.type ?? null,
      conversationId: parsed?.conversationId ?? null,
      messageId: parsed?.messageId ?? null,
      hasConversationId: Boolean(parsed?.conversationId),
      hasMessageId: Boolean(parsed?.messageId),
      firstEventRaw,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      firstType: null,
      conversationId: null,
      messageId: null,
      hasConversationId: false,
      hasMessageId: false,
      firstEventRaw: String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function hasHttpResponse(result) {
  return typeof result?.status === 'number' && result.status > 0;
}

function pick(result, keys) {
  const out = {};
  for (const key of keys) {
    out[key] = result?.[key] ?? null;
  }
  return out;
}

const report = {
  runAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  model: MODEL,
  projectId: null,
  checks: {},
  details: {},
};

logStep('health');
const health = await request('GET', '/api/health');
report.details.health = pick(health, ['ok', 'status']);
report.checks.health = health.ok;

logStep('reset orchestrators');
await request('POST', '/api/agent/stop', {});
await request('POST', '/api/fleet/stop', {});

logStep('create project');
const createProject = await request('POST', '/api/memory/projects', {
  name: `Phase4 Smoke ${Date.now()}`,
  rootPath: 'z:/personal_IDE-master/personal_IDE-master',
  description: 'Phase 4 CLI smoke validation',
});

report.details.projectCreate = {
  ...pick(createProject, ['ok', 'status']),
  success: createProject.json?.success ?? true,
};

const projectId = createProject.json?.project?.id ?? null;
report.projectId = projectId;

if (!projectId) {
  report.checks.projectCreate = false;
  report.checks.chatSseIds = false;
  report.checks.conversationCrud = false;
  report.checks.legacyConversationRoutes = false;
  report.checks.agentLifecycle = false;
  report.checks.fleetLifecycle = false;
  report.checks.ollamaRoutes = false;
  report.checks.nanoPayloadRoutes = false;
  report.checks.nanoTelemetryShape = false;
  report.checks.allPassed = false;

  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
  process.exit(0);
}

report.checks.projectCreate = true;

logStep('chat primary + legacy');
const chatPrimary = await sendChat(projectId, 'phase4 smoke primary message');
const chatLegacy = await sendChat(projectId, 'phase4 smoke legacy message');

report.details.chatPrimary = chatPrimary;
report.details.chatLegacy = chatLegacy;

report.checks.chatSseIds =
  chatPrimary.ok &&
  chatPrimary.firstType === 'message_start' &&
  chatPrimary.hasConversationId &&
  chatPrimary.hasMessageId;

logStep('conversation routes');
const queryList = await request('GET', `/api/chat/conversations?projectId=${encodeURIComponent(projectId)}`);
const pathList = await request('GET', `/api/chat/conversations/${encodeURIComponent(projectId)}`);

const modernConversationId = chatPrimary.conversationId;
const legacyConversationId = chatLegacy.conversationId || chatPrimary.conversationId;

let modernPut = { ok: false, status: 0, json: null };
let modernDelete = { ok: false, status: 0, json: null };
if (modernConversationId) {
  modernPut = await request('PUT', `/api/chat/conversations/${encodeURIComponent(modernConversationId)}`, {
    title: 'Phase4 Smoke Rename',
  });

  modernDelete = await request('DELETE', `/api/chat/conversations/${encodeURIComponent(modernConversationId)}`);
}

let legacyRename = { ok: false, status: 0, json: null };
let legacyDelete = { ok: false, status: 0, json: null };
if (legacyConversationId) {
  legacyRename = await request(
    'GET',
    `/api/chat/conversations/${encodeURIComponent(legacyConversationId)}/rename?title=${encodeURIComponent('Legacy Phase4 Rename')}`,
  );
  legacyDelete = await request('GET', `/api/chat/conversations/${encodeURIComponent(legacyConversationId)}/delete`);
}

report.details.conversations = {
  queryList: pick(queryList, ['ok', 'status']),
  pathList: pick(pathList, ['ok', 'status']),
  modernPut: {
    ...pick(modernPut, ['ok', 'status']),
    success: modernPut.json?.success ?? null,
  },
  modernDelete: {
    ...pick(modernDelete, ['ok', 'status']),
    success: modernDelete.json?.success ?? null,
  },
  legacyRename: {
    ...pick(legacyRename, ['ok', 'status']),
    success: legacyRename.json?.success ?? null,
  },
  legacyDelete: {
    ...pick(legacyDelete, ['ok', 'status']),
    success: legacyDelete.json?.success ?? null,
  },
};

report.checks.conversationCrud =
  queryList.ok &&
  pathList.ok &&
  modernPut.ok &&
  modernPut.json?.success === true &&
  modernDelete.ok &&
  modernDelete.json?.success === true;

report.checks.legacyConversationRoutes =
  legacyRename.ok &&
  legacyRename.json?.success === true &&
  legacyDelete.ok &&
  legacyDelete.json?.success === true;

logStep('agent lifecycle');
await request('POST', '/api/agent/stop', {});

const agentStart = await request('POST', '/api/agent/start', {
  projectId,
  task: 'phase4 agent smoke',
  model: MODEL,
  maxIterations: 1,
  stepDelayMs: 0,
});
const agentStatus = await request('GET', '/api/agent/status');
const agentPause = await request('POST', '/api/agent/pause', {});
const agentResume = await request('POST', '/api/agent/resume', {});
const agentStop = await request('POST', '/api/agent/stop', {});

report.details.agent = {
  start: {
    ...pick(agentStart, ['ok', 'status']),
    success: agentStart.json?.success ?? null,
  },
  status: {
    ...pick(agentStatus, ['ok', 'status']),
    active: agentStatus.json?.active ?? null,
    state: agentStatus.json?.state ?? null,
  },
  pause: {
    ...pick(agentPause, ['ok', 'status']),
    success: agentPause.json?.success ?? null,
  },
  resume: {
    ...pick(agentResume, ['ok', 'status']),
    success: agentResume.json?.success ?? null,
  },
  stop: {
    ...pick(agentStop, ['ok', 'status']),
    success: agentStop.json?.success ?? null,
  },
};

report.checks.agentLifecycle =
  agentStart.ok &&
  agentStart.json?.success === true &&
  agentStatus.ok &&
  agentPause.ok &&
  agentPause.json?.success === true &&
  agentResume.ok &&
  agentResume.json?.success === true &&
  agentStop.ok &&
  agentStop.json?.success === true;

logStep('fleet lifecycle');
await request('POST', '/api/fleet/stop', {});

const fleetStart = await request('POST', '/api/fleet/start', {
  projectId,
  task: 'phase4 fleet smoke',
  model: MODEL,
  agentCount: 2,
  maxIterationsPerAgent: 1,
  continuousMode: false,
});
const fleetStatus = await request('GET', '/api/fleet/status');
const fleetPause = await request('POST', '/api/fleet/pause', {});
const fleetResume = await request('POST', '/api/fleet/resume', {});
const fleetStop = await request('POST', '/api/fleet/stop', {});

report.details.fleet = {
  start: {
    ...pick(fleetStart, ['ok', 'status']),
    success: fleetStart.json?.success ?? null,
  },
  status: {
    ...pick(fleetStatus, ['ok', 'status']),
    active: fleetStatus.json?.active ?? null,
    state: fleetStatus.json?.state ?? null,
  },
  pause: {
    ...pick(fleetPause, ['ok', 'status']),
    success: fleetPause.json?.success ?? null,
  },
  resume: {
    ...pick(fleetResume, ['ok', 'status']),
    success: fleetResume.json?.success ?? null,
  },
  stop: {
    ...pick(fleetStop, ['ok', 'status']),
    success: fleetStop.json?.success ?? null,
  },
};

report.checks.fleetLifecycle =
  fleetStart.ok &&
  fleetStart.json?.success === true &&
  fleetStatus.ok &&
  fleetPause.ok &&
  fleetPause.json?.success === true &&
  fleetResume.ok &&
  fleetResume.json?.success === true &&
  fleetStop.ok &&
  fleetStop.json?.success === true;

logStep('ollama routes');
const ollamaDiagnose = await request('GET', '/api/ollama/diagnose');
const allModels = await request('GET', '/api/providers/all-models');

const allModelsText = allModels.text || '';
const hasAnyOllamaModel = allModelsText.includes('ollama/') || allModelsText.includes('"ollama"');

report.details.ollama = {
  diagnose: pick(ollamaDiagnose, ['ok', 'status']),
  allModels: {
    ...pick(allModels, ['ok', 'status']),
    hasAnyOllamaModel,
  },
};

report.checks.ollamaRoutes = ollamaDiagnose.ok && allModels.ok && hasAnyOllamaModel;

logStep('nano routes');
const nanoStatus = await request('GET', '/api/nano/status');
const nanoDonation = await request('PUT', '/api/nano/pool/donation', { percent: 25 });
const nanoIdleTraining = await request('PUT', '/api/nano/pool/idle-training', { enabled: true });
const nanoOptIn = await request('POST', '/api/nano/discovery/opt-in', {
  enabled: true,
  sharing_level: 'metadata',
});
const nanoTrainingStatus = await request('GET', '/api/nano/training/status');

report.details.nano = {
  status: pick(nanoStatus, ['ok', 'status']),
  donationRoute: {
    ...pick(nanoDonation, ['ok', 'status']),
    error: nanoDonation.json?.error ?? null,
  },
  idleTrainingRoute: {
    ...pick(nanoIdleTraining, ['ok', 'status']),
    error: nanoIdleTraining.json?.error ?? null,
  },
  optInRoute: {
    ...pick(nanoOptIn, ['ok', 'status']),
    error: nanoOptIn.json?.error ?? null,
  },
  trainingStatus: {
    ...pick(nanoTrainingStatus, ['ok', 'status']),
    hasCyclePhase: Object.prototype.hasOwnProperty.call(nanoTrainingStatus.json || {}, 'cycle_phase'),
    hasTotalNanos: Object.prototype.hasOwnProperty.call(nanoTrainingStatus.json || {}, 'total_nanos'),
    hasLastRouterEntropy: Object.prototype.hasOwnProperty.call(nanoTrainingStatus.json || {}, 'last_router_entropy'),
  },
};

report.checks.nanoPayloadRoutes =
  hasHttpResponse(nanoDonation) &&
  nanoDonation.status !== 404 &&
  nanoDonation.status !== 415 &&
  hasHttpResponse(nanoIdleTraining) &&
  nanoIdleTraining.status !== 404 &&
  nanoIdleTraining.status !== 415 &&
  hasHttpResponse(nanoOptIn) &&
  nanoOptIn.status !== 404 &&
  nanoOptIn.status !== 415;

report.checks.nanoTelemetryShape =
  report.details.nano.trainingStatus.hasCyclePhase &&
  report.details.nano.trainingStatus.hasTotalNanos &&
  report.details.nano.trainingStatus.hasLastRouterEntropy;

const criticalChecks = [
  report.checks.health,
  report.checks.projectCreate,
  report.checks.chatSseIds,
  report.checks.conversationCrud,
  report.checks.legacyConversationRoutes,
  report.checks.agentLifecycle,
  report.checks.fleetLifecycle,
  report.checks.ollamaRoutes,
  report.checks.nanoPayloadRoutes,
];

report.checks.allPassed = criticalChecks.every(Boolean);

logStep('complete');
console.log(JSON.stringify(report, null, 2));

if (!report.checks.allPassed) {
  process.exitCode = 1;
}
