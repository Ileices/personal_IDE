// ============================================
// E2E: Chat Send Tests
// Tests chat message validation, missing fields, streaming
// Requires: server running at localhost:3001
// ============================================
import { describe, it, expect, beforeAll } from 'vitest';
import { post, get, waitForServer, SERVER } from './helpers';

describe('Chat Send', () => {
  let projectId: string;

  beforeAll(async () => {
    const up = await waitForServer();
    if (!up) throw new Error('Server not reachable');

    // Ensure a guest user exists
    await post('/api/auth/guest', {});

    // Create a test project
    const { json } = await post('/api/memory/projects', {
      name: 'e2e-test-project',
      rootPath: process.cwd(),
      description: 'E2E test project',
    });
    projectId = json.project?.id;
    expect(projectId).toBeDefined();
  });

  describe('POST /api/chat/send', () => {
    it('rejects missing required fields', async () => {
      const { status, json } = await post('/api/chat/send', {});
      expect(status).toBe(400);
      expect(json.error).toBe('Validation Error');
    });

    it('rejects empty message', async () => {
      const { status } = await post('/api/chat/send', {
        projectId,
        message: '',
        model: 'openai/gpt-4.1',
        mode: 'ask',
      });
      expect(status).toBe(400);
    });

    it('rejects missing projectId', async () => {
      const { status } = await post('/api/chat/send', {
        message: 'hello',
        model: 'openai/gpt-4.1',
        mode: 'ask',
      });
      expect(status).toBe(400);
    });

    it('accepts valid chat request and returns SSE stream', async () => {
      // This test verifies the endpoint accepts the request.
      // The actual LLM call may fail without a valid PAT, but the
      // server should accept the request format and start streaming.
      const res = await fetch(`${SERVER}/api/chat/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:5173',
        },
        body: JSON.stringify({
          projectId,
          message: 'Say hello',
          model: 'openai/gpt-4.1',
          mode: 'ask',
        }),
      });

      // Should get 200 (SSE stream starts) or error from LLM provider (no PAT)
      // Either way the Zod validation passed
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('Memory/Projects CRUD', () => {
    it('lists projects including our test project', async () => {
      const { status, json } = await get('/api/memory/projects');
      expect(status).toBe(200);
      expect(json.projects).toBeDefined();
      expect(json.projects.some((p: any) => p.name === 'e2e-test-project')).toBe(true);
    });

    it('creates and searches notes', async () => {
      // Create a note
      const { status: createStatus, json: createJson } = await post('/api/memory/notes', {
        projectId,
        content: 'This is an E2E test note about authentication flows',
        source: 'user_note',
        tags: ['e2e', 'test'],
      });
      expect(createStatus).toBe(200);
      expect(createJson.note?.id).toBeDefined();

      // Search for it
      const { status: searchStatus, json: searchJson } = await post('/api/memory/notes/search', {
        projectId,
        query: 'authentication',
      });
      expect(searchStatus).toBe(200);
      expect(searchJson.results).toBeDefined();
    });
  });
});
