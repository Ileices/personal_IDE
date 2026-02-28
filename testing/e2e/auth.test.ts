// ============================================
// E2E: Auth Flow Tests
// Tests guest login, PAT login validation, account switching, logout
// Requires: server running at localhost:3001
// ============================================
import { describe, it, expect, beforeAll } from 'vitest';
import { post, get, waitForServer } from './helpers';

describe('Auth Flow', () => {
  beforeAll(async () => {
    const up = await waitForServer();
    if (!up) throw new Error('Server not reachable — start it before running E2E tests');
  });

  describe('POST /api/auth/guest', () => {
    it('creates a guest account with default display name', async () => {
      const { status, json } = await post('/api/auth/guest', {});
      expect(status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.user).toBeDefined();
      expect(json.user.login).toMatch(/^guest_/);
    });

    it('creates a guest account with custom display name', async () => {
      const { status, json } = await post('/api/auth/guest', { displayName: 'TestUser' });
      expect(status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.user).toBeDefined();
    });
  });

  describe('POST /api/auth/login', () => {
    it('rejects empty PAT', async () => {
      const { status, json } = await post('/api/auth/login', { pat: '' });
      // Zod validation catches empty string
      expect(status).toBe(400);
    });

    it('rejects missing PAT', async () => {
      const { status } = await post('/api/auth/login', {});
      expect(status).toBe(400);
    });

    it('rejects invalid PAT with 401', async () => {
      const { status, json } = await post('/api/auth/login', { pat: 'ghp_invalidtoken123' });
      // Either GitHub rejects or our code returns 401
      expect([400, 401]).toContain(status);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns active user after guest login', async () => {
      // Create a guest first
      await post('/api/auth/guest', {});

      const { status, json } = await get('/api/auth/me');
      expect(status).toBe(200);
      expect(json.user).toBeDefined();
    });
  });

  describe('POST /api/auth/logout', () => {
    it('logs out successfully', async () => {
      // Ensure there is an active user
      await post('/api/auth/guest', {});

      const { status, json } = await post('/api/auth/logout');
      expect(status).toBe(200);
      expect(json.success).toBe(true);
    });

    it('after logout, /me returns no active user', async () => {
      await post('/api/auth/logout');
      const { json } = await get('/api/auth/me');
      expect(json.user).toBeFalsy();
    });
  });

  describe('Zod validation', () => {
    it('rejects /api/auth/switch with missing githubUserId', async () => {
      const { status, json } = await post('/api/auth/switch', {});
      expect(status).toBe(400);
      expect(json.error).toBe('Validation Error');
      expect(json.details).toBeDefined();
    });

    it('rejects /api/auth/switch with non-integer githubUserId', async () => {
      const { status } = await post('/api/auth/switch', { githubUserId: 'not-a-number' });
      expect(status).toBe(400);
    });
  });
});
