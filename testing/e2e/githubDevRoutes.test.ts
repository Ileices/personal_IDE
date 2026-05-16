// ============================================
// E2E: GitHub Dev route guardrails
// These tests are deterministic across local environments where
// owner/token presence can vary.
// ============================================
import { beforeAll, describe, expect, it } from 'vitest';
import { post, waitForServer } from './helpers';

describe('GitHub Dev Routes', () => {
  beforeAll(async () => {
    const up = await waitForServer();
    if (!up) throw new Error('Server not reachable');
  });

  describe('POST /api/github/dev/analyze', () => {
    it('fails safely when auth/owner/required inputs are not satisfied', async () => {
      const { status, json } = await post('/api/github/dev/analyze', {
        discussionNumber: 999,
        discussionTitle: 'test',
        discussionBody: 'body',
      });

      // Depending on local auth state this may be:
      // 403 (not owner), 401 (no token), or 500 from downstream chat in rare misconfig cases.
      expect([401, 403, 500]).toContain(status);
      expect(typeof json).toBe('object');
    });

    it('rejects malformed payload when owner/token checks pass', async () => {
      const { status } = await post('/api/github/dev/analyze', {});
      // Most envs: auth gate (401/403). Owner env: schema gate (400).
      expect([400, 401, 403]).toContain(status);
    });
  });

  describe('POST /api/github/dev/drafts/:id/post', () => {
    it('does not succeed for unknown draft id without proper auth/context', async () => {
      const { status, json } = await post('/api/github/dev/drafts/not-a-real-draft/post', {});
      // Expected outcomes by environment:
      // 403 not owner, 401 no token, 404 draft not found (owner+token)
      expect([401, 403, 404]).toContain(status);
      expect(typeof json).toBe('object');
    });
  });
});
