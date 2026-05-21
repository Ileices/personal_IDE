// testing/e2e/validation.test.ts
// ============================================
// E2E: Zod Validation Tests
// Tests that the validation plugin rejects bad input across routes
// Requires: server running at localhost:3001
// ============================================
import { describe, it, expect, beforeAll } from 'vitest';
import { post, put, del, get, waitForServer } from './helpers';
import { API } from './config';

const api = API;

describe('Zod Validation', () => {
  beforeAll(async () => {
    const up = await waitForServer();
    if (!up) throw new Error('Server not reachable');
  });

  describe('Files routes', () => {
    it('POST /api/files/write rejects missing root', async () => {
      const { status, json } = await post(api.filesWrite, { path: 'test.txt', content: 'hi' });
      expect(status).toBe(400);
      expect(json.error).toBe('Validation Error');
    });

    it('POST /api/files/rename rejects missing newPath', async () => {
      const { status } = await post(api.filesRename, { root: '/tmp', oldPath: 'a.txt' });
      expect(status).toBe(400);
    });
  });

  describe('Terminal routes', () => {
    it('POST /api/terminal/write rejects missing sessionId', async () => {
      const { status, json } = await post(api.terminalWrite, { input: 'ls' });
      expect(status).toBe(400);
      expect(json.error).toBe('Validation Error');
    });

    it('POST /api/terminal/exec rejects missing command', async () => {
      const { status } = await post(API.terminalExec, { sessionId: 'fake-id' });
      expect(status).toBe(400);
    });

    it('POST /api/terminal/resize rejects non-integer cols', async () => {
      const { status } = await post(API.terminalResize, { sessionId: 'fake', cols: 'wide', rows: 24 });
      expect(status).toBe(400);
    });
  });

  describe('Tier routes', () => {
    it('POST /api/tiers/detect rejects missing projectRoot', async () => {
      const { status } = await post(API.tiersDetect, { projectId: 'some-id' });
      expect(status).toBe(400);
    });

    it('POST /api/tiers/decide-language rejects empty taskDescription', async () => {
      const { status } = await post(API.tiersDecideLanguage, { taskDescription: '' });
      expect(status).toBe(400);
    });
  });

  describe('Errors routes', () => {
    it('POST /api/errors/check rejects missing projectRoot', async () => {
      const { status } = await post(API.errorsCheck, {});
      expect(status).toBe(400);
    });

    it('POST /api/errors/task-plan validates subtasks array', async () => {
      const { status } = await post(API.errorsTaskPlan, {
        projectId: 'test',
        title: 'plan',
        subtasks: [{ description: 'missing title field' }],
      });
      expect(status).toBe(400);
    });
  });

  describe('Preview routes', () => {
    it('POST /api/preview/run rejects missing command', async () => {
      const { status } = await post(API.previewRun, {});
      expect(status).toBe(400);
    });

    it('POST /api/preview/script validates language enum', async () => {
      const { status } = await post(API.previewScript, {
        language: 'brainfuck',
        code: 'print("hi")',
      });
      expect(status).toBe(400);
    });

    it('POST /api/preview/url rejects invalid URL', async () => {
      const { status } = await post(API.previewUrl, { url: 'not-a-url' });
      expect(status).toBe(400);
    });
  });

  describe('Health check', () => {
    it('GET /api/health returns ok', async () => {
      const { status, json } = await get(API.health);
      expect(status).toBe(200);
      expect(json.status).toBe('ok');
    });
  });
});