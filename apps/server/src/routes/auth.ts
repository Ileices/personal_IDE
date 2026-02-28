// ============================================
// Auth Routes - GitHub Device Flow + PAT Login
// ============================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuid } from 'uuid';
import type { LoginRequest, DeviceFlowStartResponse, AuthResponse, GitHubUser } from '@personal-ide/shared';
import { appConfig } from '../config.js';
import { encrypt, smartDecrypt } from '../services/crypto/index.js';

// ── Cached user profile to avoid spamming GitHub API ──
// Cache user profile for 10 minutes to avoid repeated API calls
let _userCache: { token: string; user: GitHubUser; ts: number } | null = null;
const USER_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Fetch GitHub user profile with a token (uses cache to avoid rate limits) */
async function fetchGitHubUser(token: string, opts?: { skipCache?: boolean }): Promise<GitHubUser | null> {
  // Return cached user if token matches and cache is fresh
  if (!opts?.skipCache && _userCache && _userCache.token === token && Date.now() - _userCache.ts < USER_CACHE_TTL_MS) {
    return _userCache.user;
  }

  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) return null;
    const data = await res.json() as any;

    // Check Copilot access via lightweight endpoint only — NEVER fire a real inference call
    let hasCopilot = false;
    try {
      const copilotRes = await fetch('https://api.github.com/copilot_internal/v2/token', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      hasCopilot = copilotRes.ok;
    } catch {
      // If copilot token endpoint fails, assume copilot is available if
      // the user has a valid GitHub token — the model listing will confirm later.
      // Do NOT fall back to a real inference call, that wastes quota and risks rate limits.
      hasCopilot = true; // Optimistic — model fetch will correct if wrong
    }

    const user: GitHubUser = {
      id: data.id,
      login: data.login,
      name: data.name,
      email: data.email,
      avatarUrl: data.avatar_url,
      hasCopilot,
    };

    // Cache the result
    _userCache = { token, user, ts: Date.now() };

    return user;
  } catch {
    return null;
  }
}

export async function authRoutes(app: FastifyInstance) {
  const db = (app as any).db;

  // --- POST /api/auth/guest - Login as guest (no GitHub required) ---
  app.post('/guest', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { displayName?: string } || {};
    const guestName = body.displayName?.trim() || 'Local User';

    // Deactivate all existing accounts
    db.prepare('UPDATE auth_tokens SET is_active = 0').run();

    // Upsert guest account (github_user_id = -1 for guest)
    db.prepare(`
      INSERT INTO auth_tokens (id, github_user_id, github_login, github_name, github_email, avatar_url, token_encrypted, is_active, has_copilot, updated_at)
      VALUES (?, -1, 'guest', ?, NULL, '', '', 1, 0, datetime('now'))
      ON CONFLICT(github_user_id) DO UPDATE SET
        github_name = excluded.github_name,
        is_active = 1,
        updated_at = datetime('now')
    `).run(uuid(), guestName);

    const user: GitHubUser = {
      id: -1,
      login: 'guest',
      name: guestName,
      email: null,
      avatarUrl: '',
      hasCopilot: false,
    };

    return { success: true, user } satisfies AuthResponse;
  });

  // --- POST /api/auth/login - Login with PAT ---
  app.post('/login', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as LoginRequest;

    if (!body.pat) {
      return reply.status(400).send({ success: false, error: 'Personal Access Token is required' } satisfies AuthResponse);
    }

    const user = await fetchGitHubUser(body.pat);
    if (!user) {
      return reply.status(401).send({ success: false, error: 'Invalid token or GitHub API error' } satisfies AuthResponse);
    }

    // Deactivate all existing accounts
    db.prepare('UPDATE auth_tokens SET is_active = 0').run();

    // Upsert this account
    db.prepare(`
      INSERT INTO auth_tokens (id, github_user_id, github_login, github_name, github_email, avatar_url, token_encrypted, is_active, has_copilot, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'))
      ON CONFLICT(github_user_id) DO UPDATE SET
        token_encrypted = excluded.token_encrypted,
        github_name = excluded.github_name,
        github_email = excluded.github_email,
        avatar_url = excluded.avatar_url,
        is_active = 1,
        has_copilot = excluded.has_copilot,
        updated_at = datetime('now')
    `).run(uuid(), user.id, user.login, user.name, user.email, user.avatarUrl, encrypt(body.pat, appConfig.security.encryptKey), user.hasCopilot ? 1 : 0);

    return { success: true, user } satisfies AuthResponse;
  });

  // --- GET /api/auth/me - Get current user ---
  // This is called on every frontend page load — use DB cache to avoid GitHub API spam.
  app.get('/me', async (_req: FastifyRequest, reply: FastifyReply) => {
    const row = db.prepare('SELECT * FROM auth_tokens WHERE is_active = 1').get() as any;
    if (!row) {
      return reply.status(401).send({ success: false, error: 'Not logged in' } satisfies AuthResponse);
    }

    // Return DB-cached user info immediately — no GitHub API call needed.
    // The profile was verified at login time. If the token truly expired,
    // the next LLM call will fail and the user will see an error then.
    const user: GitHubUser = {
      id: row.github_user_id,
      login: row.github_login,
      name: row.github_name,
      email: row.github_email,
      avatarUrl: row.avatar_url,
      hasCopilot: !!row.has_copilot,
    };

    return { success: true, user } satisfies AuthResponse;
  });

  // --- POST /api/auth/logout - Logout current user ---
  app.post('/logout', async () => {
    db.prepare('UPDATE auth_tokens SET is_active = 0').run();
    return { success: true } satisfies AuthResponse;
  });

  // --- GET /api/auth/accounts - List all saved accounts ---
  app.get('/accounts', async () => {
    const rows = db.prepare('SELECT github_user_id, github_login, github_name, avatar_url, is_active, has_copilot FROM auth_tokens ORDER BY updated_at DESC').all() as any[];
    return {
      accounts: rows.map(r => ({
        id: r.github_user_id,
        login: r.github_login,
        name: r.github_name,
        avatarUrl: r.avatar_url,
        isActive: !!r.is_active,
        hasCopilot: !!r.has_copilot,
      })),
    };
  });

  // --- POST /api/auth/switch - Switch to a different saved account ---
  app.post('/switch', async (req: FastifyRequest, reply: FastifyReply) => {
    const { githubUserId } = req.body as { githubUserId: number };
    const row = db.prepare('SELECT * FROM auth_tokens WHERE github_user_id = ?').get(githubUserId) as any;
    if (!row) {
      return reply.status(404).send({ success: false, error: 'Account not found' } satisfies AuthResponse);
    }

    // Verify token still works
    const token = smartDecrypt(row.token_encrypted, appConfig.security.encryptKey);
    if (!token) {
      return reply.status(401).send({ success: false, error: 'Cannot decrypt stored token. Key may have changed.' } satisfies AuthResponse);
    }
    const user = await fetchGitHubUser(token);
    if (!user) {
      return reply.status(401).send({ success: false, error: 'Token expired. Please log in again with a new PAT.' } satisfies AuthResponse);
    }

    // Switch
    db.prepare('UPDATE auth_tokens SET is_active = 0').run();
    db.prepare('UPDATE auth_tokens SET is_active = 1, updated_at = datetime(\'now\') WHERE github_user_id = ?').run(githubUserId);

    return { success: true, user } satisfies AuthResponse;
  });

  // --- DELETE /api/auth/account/:id - Remove a saved account ---
  app.delete('/account/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    db.prepare('DELETE FROM auth_tokens WHERE github_user_id = ?').run(parseInt(id));
    return { success: true };
  });

  // --- GET /api/auth/token - Get active token (internal use) ---
  app.get('/token', async (_req: FastifyRequest, reply: FastifyReply) => {
    const row = db.prepare('SELECT token_encrypted FROM auth_tokens WHERE is_active = 1').get() as any;
    if (!row) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }
    return { token: smartDecrypt(row.token_encrypted, appConfig.security.encryptKey) || '' };
  });
}
