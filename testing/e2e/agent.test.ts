// ============================================
// E2E: Agent Start/Stop/Pause Tests
// Tests agent lifecycle, Zod validation, status polling
// Requires: server running at localhost:3001
// ============================================
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { post, get, waitForServer } from './helpers';

describe('Agent Lifecycle', () => {
  let projectId: string;

  beforeAll(async () => {
    const up = await waitForServer();
    if (!up) throw new Error('Server not reachable');

    // Ensure guest user
    await post('/api/auth/guest', {});

    // Create a test project
    const { json } = await post('/api/memory/projects', {
      name: 'e2e-agent-test',
      rootPath: process.cwd(),
    });
    projectId = json.project?.id;
    expect(projectId).toBeDefined();
  });

  afterEach(async () => {
    // Always stop the agent after each test
    await post('/api/agent/stop');
    // Small delay for cleanup
    await new Promise(r => setTimeout(r, 500));
  });

  describe('POST /api/agent/start', () => {
    it('rejects missing projectId', async () => {
      const { status, json } = await post('/api/agent/start', { task: 'test task' });
      expect(status).toBe(400);
    });

    it('rejects missing task', async () => {
      const { status, json } = await post('/api/agent/start', { projectId });
      expect(status).toBe(400);
    });

    it('rejects empty task string', async () => {
      const { status } = await post('/api/agent/start', { projectId, task: '' });
      expect(status).toBe(400);
    });

    it('starts agent with valid params', async () => {
      const { status, json } = await post('/api/agent/start', {
        projectId,
        task: 'E2E test: do nothing and complete immediately',
        maxIterations: 1,
        stepDelayMs: 100,
      });
      expect(status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.status).toBeDefined();
    });

    it('returns 409 if agent already running', async () => {
      // Start first
      await post('/api/agent/start', {
        projectId,
        task: 'E2E double-start test',
        maxIterations: 1,
      });
      // Try to start again
      const { status } = await post('/api/agent/start', {
        projectId,
        task: 'Should fail',
        maxIterations: 1,
      });
      expect(status).toBe(409);
    });

    it('accepts all optional parameters', async () => {
      const { status, json } = await post('/api/agent/start', {
        projectId,
        task: 'Full params test',
        model: 'openai/gpt-4.1',
        maxIterations: 5,
        stepDelayMs: 500,
        autoApproveChanges: false,
        autoAnswerQuestions: false,
        continuousMode: false,
        cooldownMs: 1000,
        bypassRateLimits: false,
        enableSmartChunking: true,
        contextWindow: 64000,
        checkpointEvery: 3,
        autoFixErrors: true,
        autoRunTests: false,
        analyzeCodebase: false,
      });
      expect(status).toBe(200);
      expect(json.success).toBe(true);
    });
  });

  describe('POST /api/agent/stop', () => {
    it('stops a running agent', async () => {
      await post('/api/agent/start', {
        projectId,
        task: 'Stop test',
        maxIterations: 100,
      });

      const { status, json } = await post('/api/agent/stop');
      expect(status).toBe(200);
      expect(json.success).toBe(true);
    });

    it('returns success even with no active agent', async () => {
      const { status, json } = await post('/api/agent/stop');
      expect(status).toBe(200);
      expect(json.success).toBe(true);
    });
  });

  describe('POST /api/agent/pause + resume', () => {
    it('pauses and resumes a running agent', async () => {
      await post('/api/agent/start', {
        projectId,
        task: 'Pause test',
        maxIterations: 100,
        stepDelayMs: 5000,
      });

      // Pause
      const pause = await post('/api/agent/pause');
      expect(pause.status).toBe(200);
      expect(pause.json.success).toBe(true);

      // Check status
      const statusCheck = await get('/api/agent/status');
      expect(statusCheck.json.active).toBe(true);

      // Resume
      const resume = await post('/api/agent/resume');
      expect(resume.status).toBe(200);
      expect(resume.json.success).toBe(true);
    });
  });

  describe('GET /api/agent/status', () => {
    it('returns inactive when no agent running', async () => {
      const { status, json } = await get('/api/agent/status');
      expect(status).toBe(200);
      expect(json.active).toBe(false);
    });
  });

  describe('POST /api/agent/message', () => {
    it('rejects message when no agent running', async () => {
      const { status } = await post('/api/agent/message', { message: 'hello' });
      expect(status).toBe(404);
    });

    it('rejects empty message', async () => {
      await post('/api/agent/start', {
        projectId,
        task: 'Message test',
        maxIterations: 100,
        stepDelayMs: 5000,
      });

      const { status } = await post('/api/agent/message', { message: '' });
      expect(status).toBe(400);
    });

    it('queues message to running agent', async () => {
      await post('/api/agent/start', {
        projectId,
        task: 'Message queue test',
        maxIterations: 100,
        stepDelayMs: 5000,
      });

      const { status, json } = await post('/api/agent/message', {
        message: 'Please focus on the auth module',
        priority: 'high',
      });
      expect(status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.messageId).toBeDefined();
    });
  });
});
