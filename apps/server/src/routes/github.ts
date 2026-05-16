// ============================================
// GitHub Community Routes — /api/github
// Phases 1–5 + dev-mode tools (owner-only)
// ============================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { getGitHubService, CATEGORY_IDS, OWNER_LOGIN, type DiscussionCategory } from '../services/github/githubService.js';
import { resolveModelStrategy } from '../services/modelStrategy.js';
import { ensurePersonalIdeDisclaimer } from '../services/github/disclaimer.js';

// ── Fastify plugin ─────────────────────────────
export async function githubRoutes(app: FastifyInstance) {
  const db = (app as any).db;
  const STATUS_CACHE_TTL_MS = 5 * 60 * 1000;
  const STATUS_PROBE_LOCK_MS = 20 * 1000;
  const POLL_COOLDOWN_MS = 60 * 1000;
  const POLL_LOCK_MS = 20 * 1000;

  function gh() {
    return getGitHubService(db);
  }

  function readKv(key: string): string | null {
    const row = db.prepare('SELECT value FROM app_kv WHERE key = ?').get(key) as { value?: string } | undefined;
    return row?.value ?? null;
  }

  function writeKv(key: string, value: string): void {
    db.prepare(`
      INSERT INTO app_kv (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `).run(key, value);
  }

  function deleteKv(key: string): void {
    db.prepare('DELETE FROM app_kv WHERE key = ?').run(key);
  }

  function currentUserId(): number {
    return gh().getActiveGitHubUserId();
  }

  function allowedDiscussionByPrefix(id: string): boolean {
    return id.startsWith('D_kwDORS0FT8') || id.startsWith('D_kwDOEfmk4M');
  }

  function isAllowedDiscussionTarget(discussionId: string): boolean {
    if (allowedDiscussionByPrefix(discussionId)) return true;

    const cfg = readKv('github:allowed_discussion_ids');
    if (cfg) {
      try {
        const ids = JSON.parse(cfg) as string[];
        if (Array.isArray(ids) && ids.includes(discussionId)) return true;
      } catch {
        // ignore malformed allowlist config
      }
    }

    const knownReport = db.prepare('SELECT 1 FROM github_reports WHERE discussion_id = ? LIMIT 1').get(discussionId) as { 1: number } | undefined;
    if (knownReport) return true;

    const knownDraft = db.prepare('SELECT 1 FROM github_dev_drafts WHERE discussion_id = ? LIMIT 1').get(discussionId) as { 1: number } | undefined;
    if (knownDraft) return true;

    return false;
  }

  function deriveReportStatus(isAnswered: boolean, stateReason?: string | null): 'open' | 'answered' | 'closed' {
    // stateReason is only set when the discussion is closed/resolved by GitHub state transitions.
    if (stateReason) return 'closed';
    if (isAnswered) return 'answered';
    return 'open';
  }

  function hasColumn(table: string, column: string): boolean {
    const info = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
    return info.some((row) => row.name === column);
  }

  function resolveLatestProjectId(): string | null {
    const row = db.prepare(`
      SELECT id
      FROM projects
      ORDER BY last_accessed_at DESC, created_at DESC
      LIMIT 1
    `).get() as { id?: string } | undefined;
    return row?.id ?? null;
  }

  function resolvePrimaryChatModel(): string | null {
    const strategy = resolveModelStrategy(db, undefined, undefined);
    const candidates = [strategy.primaryModel, ...strategy.fallbackModels].filter(Boolean);
    for (const modelId of candidates) {
      const row = db.prepare('SELECT 1 FROM model_registry WHERE model_id = ? LIMIT 1').get(modelId) as { 1?: number } | undefined;
      if (row) return modelId;
    }
    const first = db.prepare(`
      SELECT model_id
      FROM model_registry
      WHERE disabled = 0
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1
    `).get() as { model_id?: string } | undefined;
    return first?.model_id ?? null;
  }

  async function parseChatSseResponse(response: Response): Promise<string> {
    if (!response.body) {
      throw new Error('Chat stream did not return a body.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';

    const processRawEvent = (rawEvent: string) => {
      const dataLines = rawEvent
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .filter(Boolean);

      for (const payload of dataLines) {
        try {
          const event = JSON.parse(payload) as { type?: string; delta?: string; fullContent?: string; error?: string };
          if (event.type === 'content_delta' && typeof event.delta === 'string') {
            content += event.delta;
          } else if (event.type === 'content_done' && typeof event.fullContent === 'string') {
            content = event.fullContent;
          } else if (event.type === 'error') {
            throw new Error(event.error || 'Chat stream returned an error event.');
          }
        } catch (err) {
          throw err instanceof Error ? err : new Error(String(err));
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';

      for (const rawEvent of chunks) {
        processRawEvent(rawEvent);
      }
    }

    // Some providers terminate the stream without a trailing blank line.
    // Process any residual buffered event so the final response is not dropped.
    if (buffer.trim()) {
      processRawEvent(buffer);
    }

    return content.trim();
  }

  async function runDevAnalyzeViaChatSend(analysisPrompt: string): Promise<string> {
    const model = resolvePrimaryChatModel();
    const projectId = resolveLatestProjectId();

    if (!model || !projectId) {
      throw new Error('Cannot run dev analyze via chat/send: missing active model or project context.');
    }

    const serverPort = Number(process.env['SERVER_PORT'] || 3001);
    const timeoutMs = 90_000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(`http://127.0.0.1:${serverPort}/api/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          message: analysisPrompt,
          model,
          mode: 'ask',
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(`chat/send timed out after ${timeoutMs}ms`);
      }
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new Error(`chat/send failed with HTTP ${res.status}${msg ? `: ${msg.slice(0, 300)}` : ''}`);
    }

    return parseChatSseResponse(res);
  }

  function createCanonicalJobFromDevDraft(draft: any, commentUrl: string): string {
    const canonicalJobId = randomUUID();
    const rowId = randomUUID();
    const nowIso = new Date().toISOString();
    const latestProjectId = hasColumn('job_records', 'project_id') ? resolveLatestProjectId() : null;

    let rootCause = '';
    let solution = '';
    try {
      const parsed = JSON.parse(draft.analysis?.match(/\{[\s\S]+\}/)?.[0] || '{}');
      rootCause = parsed.root_cause || '';
      solution = parsed.solution || '';
    } catch {
      // leave extracted fields empty when analysis isn't valid JSON
    }

    const title = `Community Fix: #${draft.discussion_number} ${draft.discussion_title || ''}`.slice(0, 200);
    const description = [
      rootCause ? `Root Cause: ${rootCause}` : '',
      solution ? `Solution: ${solution}` : '',
      `Discussion: ${draft.discussion_number}`,
      `Posted Fix: ${commentUrl}`,
      draft.draft_response ? `\n---\n${String(draft.draft_response).slice(0, 1000)}` : '',
    ].filter(Boolean).join('\n').trim();

    const columns = [
      'id',
      'job_id',
      'job_category',
      'source',
      'source_record_ids',
      'priority',
      'title',
      'affected_files',
      'affected_devtags',
      'affected_plantags',
      'required_buildtags',
      'blocking_jobs',
      'blocked_by_jobs',
      'hierarchy',
      'atomic_steps',
      'sandbox_spec',
      'implementation_status',
      'created_cycle',
      'last_updated_cycle',
      'timestamp',
      'created_at',
    ];

    const values: unknown[] = [
      rowId,
      canonicalJobId,
      'user_requested',
      'god_factory_agent',
      JSON.stringify([String(draft.discussion_id || ''), String(draft.discussion_number || '')]),
      'high',
      title,
      '[]',
      '[]',
      '[]',
      '[]',
      '[]',
      '[]',
      JSON.stringify({ phase: 1, milestone: 'community_fix', parent_job_id: null, child_job_ids: [] }),
      JSON.stringify([
        'Review discussion context and draft analysis evidence',
        'Implement and validate the proposed fix in codebase',
        'Post verification update back to linked discussion threads',
      ]),
      JSON.stringify({ sandbox_id: null, status: 'not_started', cycle_limit: 50, cycles_used: 0, test_results: [], human_review_required: false, human_review_completed: false }),
      'suggested',
      0,
      0,
      nowIso,
      nowIso,
    ];

    if (hasColumn('job_records', 'project_id')) {
      columns.splice(2, 0, 'project_id');
      values.splice(2, 0, latestProjectId);
    }

    if (hasColumn('job_records', 'description')) {
      const titleIdx = columns.indexOf('title');
      columns.splice(titleIdx + 1, 0, 'description');
      values.splice(titleIdx + 1, 0, description || 'Community fix posted from GitHub Dev tools.');
    }

    const placeholders = columns.map(() => '?').join(', ');
    db.prepare(`INSERT INTO job_records (${columns.join(', ')}) VALUES (${placeholders})`).run(...values);

    return canonicalJobId;
  }

  // ── Helper: require GitHub token ───────────────
  function requireToken(reply: FastifyReply): boolean {
    const token = gh().getToken();
    if (!token) {
      reply.code(401).send({ error: 'No GitHub token configured. Go to Settings → Providers and add your GitHub PAT.' });
      return false;
    }
    return true;
  }

  // ── Helper: require owner (dev-only tools) ──────
  function requireOwner(reply: FastifyReply): boolean {
    if (!gh().isOwner()) {
      reply.code(403).send({ error: 'Dev-mode tools are only available to the repository owner.' });
      return false;
    }
    return true;
  }

  // ────────────────────────────────────────────────
  // PHASE 1 — Toolchain Detection
  // ────────────────────────────────────────────────

  /** GET /api/github/status — Check toolchain readiness */
  app.get('/status', async (_req, reply) => {
    const lockKey = 'github:status_probe_lock_until';
    const cacheKey = 'github:status_probe_cache';

    const runStatusProbe = async () => {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      const check = async (cmd: string): Promise<string | null> => {
        try {
          const { stdout } = await execAsync(cmd, { timeout: 3000, windowsHide: true });
          return stdout?.trim() || null;
        } catch {
          return null;
        }
      };

      const gitVersion = await check('git --version');
      const ghVersion = await check('gh --version');
      const payload = {
        gitVersion,
        ghVersion,
        checkedAt: Date.now(),
      };
      writeKv(cacheKey, JSON.stringify(payload));
    };

    const now = Date.now();
    const lockUntil = Number(readKv(lockKey) || '0');
    const cacheRaw = readKv(cacheKey);
    let cache: { gitVersion: string | null; ghVersion: string | null; checkedAt: number } | null = null;
    if (cacheRaw) {
      try {
        cache = JSON.parse(cacheRaw);
      } catch {
        cache = null;
      }
    }

    const isFresh = !!cache && Number(cache.checkedAt || 0) > now - STATUS_CACHE_TTL_MS;
    if (!isFresh && lockUntil < now) {
      writeKv(lockKey, String(now + STATUS_PROBE_LOCK_MS));
      void runStatusProbe()
        .catch(() => {})
        .finally(() => deleteKv(lockKey));
    }

    const gitVersion = cache?.gitVersion ?? null;
    const ghVersion = cache?.ghVersion ?? null;
    const hasToken   = !!gh().getToken();
    const isOwner    = gh().isOwner();
    const activeAccount = db.prepare(`
      SELECT github_login, github_name, github_user_id
      FROM auth_tokens
      WHERE is_active = 1
      LIMIT 1
    `).get() as { github_login: string; github_name: string | null; github_user_id: number } | undefined;
    const fallbackAccount = db.prepare(`
      SELECT github_login, github_name, github_user_id
      FROM auth_tokens
      WHERE github_user_id != -1
      ORDER BY is_active DESC, updated_at DESC
      LIMIT 1
    `).get() as { github_login: string; github_name: string | null; github_user_id: number } | undefined;
    const effectiveAccount = activeAccount && activeAccount.github_user_id !== -1
      ? activeAccount
      : fallbackAccount;
    const savedGitHubAccounts = (db.prepare(`
      SELECT COUNT(*) as count
      FROM auth_tokens
      WHERE github_user_id != -1
    `).get() as { count: number } | undefined)?.count ?? 0;

    let authStatus = 'none';
    if (hasToken) authStatus = 'pat';

    reply.send({
      git:        { installed: !!gitVersion, version: gitVersion },
      gh:         { installed: !!ghVersion,  version: ghVersion  },
      auth:       { connected: hasToken, status: authStatus },
      ready:      hasToken,
      canBrowse:  hasToken,
      canPost:    hasToken,
      cliReady:   !!gitVersion && !!ghVersion,
      setupMode:  hasToken ? 'token-ready' : 'token-required',
      statusCache: {
        stale: !isFresh,
        checkedAt: cache?.checkedAt ?? null,
      },
      activeAccount: effectiveAccount && effectiveAccount.github_user_id !== -1
        ? {
            login: effectiveAccount.github_login,
            name: effectiveAccount.github_name,
          }
        : null,
      savedGitHubAccounts,
      isOwner,
    });
  });

  // ────────────────────────────────────────────────
  // PHASE 4 — Community Feed
  // ────────────────────────────────────────────────

  /** GET /api/github/discussions — Paginated discussion list */
  app.get('/discussions', async (req: FastifyRequest, reply) => {
    if (!requireToken(reply)) return;

    const query = req.query as any;
    const sort       = (query.sort as string) || 'NEWEST';   // NEWEST | OLDEST | UPDATED | TOP | TRENDING
    const categoryId = (query.categoryId as string) || undefined;
    const cursor     = (query.after as string) || undefined;
    const first      = Math.min(parseInt(query.first || '20', 10), 50);

    try {
      const result = await gh().listDiscussions({ first, after: cursor, categoryId, orderBy: sort as any });

      // Augment with local "posted from this app" flag
      const githubUserId = currentUserId();
      const localIds = new Set(
        (db.prepare('SELECT discussion_id FROM github_reports WHERE discussion_id IS NOT NULL AND github_user_id = ?').all(githubUserId) as any[])
          .map((r: any) => r.discussion_id)
      );

      const nodes = result.nodes.map((d: any) => ({
        ...d,
        postedFromApp: localIds.has(d.id),
      }));

      reply.send({ nodes, pageInfo: result.pageInfo, totalCount: result.totalCount });
    } catch (err: any) {
      reply.code(500).send({ error: err.message || 'Failed to fetch discussions.' });
    }
  });

  /** GET /api/github/discussions/:number — Full thread */
  app.get('/discussions/:number', async (req: FastifyRequest, reply) => {
    if (!requireToken(reply)) return;

    const number = parseInt((req.params as any).number, 10);
    if (isNaN(number)) return reply.code(400).send({ error: 'Invalid discussion number.' });

    try {
      const discussion = await gh().getDiscussion(number);
      reply.send({ discussion });
    } catch (err: any) {
      reply.code(500).send({ error: err.message || 'Failed to fetch discussion.' });
    }
  });

  /** POST /api/github/discussions/:id/comment — Add a comment */
  app.post('/discussions/:id/comment', async (req: FastifyRequest, reply) => {
    if (!requireToken(reply)) return;

    const { id } = req.params as any;
    const payload = (req.body ?? {}) as Record<string, unknown>;
    const bodyText = typeof payload.body === 'string'
      ? payload.body
      : payload.body == null
        ? ''
        : String(payload.body);
    const replyToId = payload.replyToId ? String(payload.replyToId) : undefined;

    if (!isAllowedDiscussionTarget(String(id))) {
      return reply.code(403).send({
        error: 'Discussion target is outside the allowed posting scope. Add it to github:allowed_discussion_ids to permit posting.',
      });
    }

    if (!bodyText.trim()) return reply.code(400).send({ error: 'Comment body is required.' });

    try {
      const comment = await gh().addDiscussionComment({ discussionId: id, body: ensurePersonalIdeDisclaimer(bodyText), replyToId });
      reply.send({ comment });
    } catch (err: any) {
      reply.code(500).send({
        error: err?.message || 'Failed to post comment.',
        context: {
          route: 'POST /api/github/discussions/:id/comment',
          discussionId: String(id),
        },
      });
    }
  });

  /** POST /api/github/discussions/:id/react — Add/remove a reaction */
  app.post('/discussions/:id/react', async (req: FastifyRequest, reply) => {
    if (!requireToken(reply)) return;

    const { id } = req.params as any;
    const { content, remove } = req.body as any;

    const VALID_REACTIONS = ['THUMBS_UP', 'THUMBS_DOWN', 'LAUGH', 'HOORAY', 'CONFUSED', 'HEART', 'ROCKET', 'EYES'];
    if (!VALID_REACTIONS.includes(content)) {
      return reply.code(400).send({ error: `Invalid reaction. Must be one of: ${VALID_REACTIONS.join(', ')}` });
    }

    try {
      if (remove) {
        await gh().removeReaction(id, content);
      } else {
        await gh().addReaction(id, content);
      }
      reply.send({ ok: true });
    } catch (err: any) {
      reply.code(500).send({ error: err.message || 'Failed to update reaction.' });
    }
  });

  /**
   * POST /api/github/discussions/:id/mark-answer
   * Mark a comment as the accepted answer for a discussion.
   *
   * This route is accessible to any authenticated user (not just repo owners) because
   * GitHub's GraphQL markDiscussionCommentAsAnswer mutation already enforces that the
   * caller must be the discussion author or a collaborator with write access.
   * We do NOT require requireOwner() here — GitHub enforces authorization on its side
   * and will return a permission error if the caller lacks rights.
   *
   * Body: { commentId: string }
   *
   * CAUTION: The GitHub API only allows marking an answer on discussions in categories
   * that support answers (Q&A type). Attempting to mark an answer on a non-answerable
   * category (e.g. Announcements, Ideas) will fail with a GraphQL error — surface this
   * to the user rather than swallowing it.
   *
   * Source finding: D https://github.com/Ileices/personal_IDE/discussions/20#discussioncomment-16869230
   * Cluster: C5 https://github.com/orgs/community/discussions/195397#discussioncomment-16869608
   */
  app.post('/discussions/:id/mark-answer', async (req: FastifyRequest, reply) => {
    if (!requireToken(reply)) return;

    const { commentId } = req.body as any;
    if (!commentId || typeof commentId !== 'string' || !commentId.trim()) {
      return reply.code(400).send({ error: 'commentId is required.' });
    }

    try {
      await gh().markCommentAsAnswer(commentId.trim());
      reply.send({ ok: true });
    } catch (err: any) {
      // Surface specific GitHub authorization or category errors to the caller.
      // Do not swallow — the operator needs to know if marking an answer failed
      // so they can decide whether to retry or take action on GitHub.com.
      reply.code(500).send({
        error: err.message || 'Failed to mark comment as answer.',
        context: {
          route: 'POST /api/github/discussions/:id/mark-answer',
          commentId: String(commentId),
        },
      });
    }
  });

  /**
   * POST /api/github/discussions/:id/close
   * Close a discussion (sets GitHub discussion state to CLOSED).
   *
   * Accessible to any authenticated user — GitHub enforces authorization.
   * Only the discussion author or a collaborator with triage/write access can
   * close a discussion via the API; the server passes through the stored token
   * and GitHub returns an error if the caller lacks permission.
   *
   * Body: {} (empty — the discussionId is in the path param :id)
   *
   * CAUTION: Closing a discussion is visible to all GitHub users. Before calling
   * this from any automated path, ensure explicit user confirmation has been shown
   * in the UI (checklist rule: never take destructive actions without user confirm).
   *
   * Source finding: D https://github.com/Ileices/personal_IDE/discussions/20#discussioncomment-16869230
   * Cluster: C5 https://github.com/orgs/community/discussions/195397#discussioncomment-16869608
   */
  app.post('/discussions/:id/close', async (req: FastifyRequest, reply) => {
    if (!requireToken(reply)) return;

    const { id } = req.params as any;
    if (!id || typeof id !== 'string' || !id.trim()) {
      return reply.code(400).send({ error: 'Discussion ID (path param :id) is required.' });
    }

    try {
      await gh().closeDiscussion(id.trim());
      reply.send({ ok: true });
    } catch (err: any) {
      reply.code(500).send({
        error: err.message || 'Failed to close discussion.',
        context: {
          route: 'POST /api/github/discussions/:id/close',
          discussionId: String(id),
        },
      });
    }
  });

  // ────────────────────────────────────────────────
  // PHASE 3 — Reporting Engine
  // ────────────────────────────────────────────────

  /**
   * GET /api/github/discussion-categories
   * C4-G: Dynamic discussion category list from GitHub GraphQL.
   * Replaces hardcoded CATEGORY_IDS constant for category pickers in the UI.
   * Cached 30 min inside GitHubService.getDiscussionCategories().
   * Falls back to CATEGORY_IDS on error.
   */
  app.get('/discussion-categories', async (_req: FastifyRequest, reply) => {
    if (!requireToken(reply)) return;
    try {
      const cats = await gh().getDiscussionCategories();
      reply.send({ categories: cats });
    } catch (err: any) {
      // Degrade gracefully — return the static fallback so the UI doesn't break
      const fallback: DiscussionCategory[] = Object.entries(CATEGORY_IDS).map(([name, id]) => ({
        id,
        name,
        emoji: '',
        emojiHTML: '',
        description: '',
        isAnswerable: false,
      }));
      reply.send({ categories: fallback, fallback: true, error: err?.message });
    }
  });

  /** POST /api/github/report — Create a new report (Discussion + optional Issue) */
  app.post('/report', async (req: FastifyRequest, reply) => {
    if (!requireToken(reply)) return;

    const { title, body, category, labels, reportType, crossPostIssue, draftId } = req.body as any;

    if (!title?.trim() || !body?.trim()) {
      return reply.code(400).send({ error: 'Title and body are required.' });
    }

    const categoryId = await (async () => {
      // C4-G: try dynamic lookup first; fall back to hardcoded CATEGORY_IDS
      try {
        const cats = await gh().getDiscussionCategories();
        const match = cats.find(c => c.name === category);
        if (match) return match.id;
      } catch { /* ignore — use fallback */ }
      return CATEGORY_IDS[category] || CATEGORY_IDS['General'];
    })();

    const githubUserId = currentUserId();

    try {
      // Create the Discussion
      const discussion = await gh().createDiscussion({ categoryId, title, body: ensurePersonalIdeDisclaimer(body) });

      // Bug reports also create a GitHub Issue for tracked resolution
      let issue: { number: number; html_url: string } | null = null;
      if (reportType === 'bug' || crossPostIssue) {
        issue = await gh().createIssue({
          title,
          body: ensurePersonalIdeDisclaimer(`${body}\n\n---\n_Originally reported via [Discussion #${discussion.number}](${discussion.url})_`),
          labels: labels || ['bug'],
        });
      }

      // Store locally
      const reportId = randomUUID();
      db.prepare(`
        INSERT INTO github_reports (id, discussion_id, discussion_number, issue_number, title, body, category, labels, report_type, discussion_url, issue_url, github_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        reportId,
        discussion.id,
        discussion.number,
        issue?.number ?? null,
        title,
        body,
        category || 'General',
        JSON.stringify(labels || []),
        reportType || 'general',
        discussion.url,
        issue?.html_url ?? null,
        githubUserId,
      );

      // Track for notification polling
      db.prepare(`
        INSERT OR REPLACE INTO github_tracked (discussion_node_id, report_id, known_comment_count, known_is_answered, github_user_id)
        VALUES (?, ?, 0, 0, ?)
      `).run(discussion.id, reportId, githubUserId);

      // Delete draft if one was in progress
      if (draftId) {
        db.prepare('DELETE FROM github_drafts WHERE id = ?').run(draftId);
      }

      reply.send({ reportId, discussion, issue });
    } catch (err: any) {
      // Save as draft on failure so the user doesn't lose their work
      if (title && body) {
        const draftIdFallback = randomUUID();
        db.prepare(`
          INSERT OR REPLACE INTO github_drafts (id, title, body, category, labels, report_type, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(draftIdFallback, title, body, category || 'General', JSON.stringify(labels || []), reportType || 'general');
        return reply.code(500).send({
          error: `${err.message || 'GitHub request failed.'} Your report was saved as a draft (id: ${draftIdFallback}).`,
          draftId: draftIdFallback,
        });
      }
      reply.code(500).send({ error: err.message || 'Failed to create report.' });
    }
  });

  /** GET /api/github/my-reports — Reports posted from this instance */
  app.get('/my-reports', async (req: FastifyRequest, reply) => {
    try {
      const githubUserId = currentUserId();
      const sync = (req.query as { sync?: string | boolean } | undefined)?.sync;
      const shouldSync = sync === true || sync === '1' || sync === 'true';

      const reports = db.prepare(`
        SELECT * FROM github_reports WHERE github_user_id = ? ORDER BY created_at DESC LIMIT 100
      `).all(githubUserId);

      if (shouldSync && gh().getToken()) {
        const reportByDiscussionId = new Map<string, any>();
        for (const report of reports as any[]) {
          if (typeof report.discussion_id === 'string' && report.discussion_id.trim()) {
            reportByDiscussionId.set(report.discussion_id, report);
          }
        }

        const discussionIds = [...reportByDiscussionId.keys()];
        if (discussionIds.length > 0) {
          const snapshots = await gh().pollTrackedDiscussions(discussionIds);
          const updateReport = db.prepare(`
            UPDATE github_reports
            SET status = ?,
                comment_count = ?,
                last_comment_at = ?,
                discussion_url = COALESCE(?, discussion_url)
            WHERE id = ? AND github_user_id = ?
          `);

          const updateTracked = db.prepare(`
            UPDATE github_tracked
            SET known_comment_count = ?,
                known_is_answered = ?,
                last_polled_at = datetime('now')
            WHERE discussion_node_id = ? AND github_user_id = ?
          `);

          const tx = db.transaction((rows: Array<{ id: string; commentCount: number; isAnswered: boolean; stateReason: string | null; updatedAt: string | null; url: string | null }>) => {
            for (const row of rows) {
              const report = reportByDiscussionId.get(row.id);
              if (!report) continue;

              updateReport.run(
                deriveReportStatus(row.isAnswered, row.stateReason),
                row.commentCount,
                row.updatedAt,
                row.url,
                report.id,
                githubUserId,
              );

              updateTracked.run(
                row.commentCount,
                row.isAnswered ? 1 : 0,
                row.id,
                githubUserId,
              );
            }
          });

          tx(snapshots);
        }
      }

      const refreshedReports = db.prepare(`
        SELECT * FROM github_reports WHERE github_user_id = ? ORDER BY created_at DESC LIMIT 100
      `).all(githubUserId);

      // Attach any unread notification counts
      const notifCounts = db.prepare(`
        SELECT report_id, COUNT(*) as unread
        FROM github_notifications
        WHERE read_at IS NULL AND github_user_id = ?
        GROUP BY report_id
      `).all(githubUserId) as any[];

      const unreadMap = Object.fromEntries(notifCounts.map((r: any) => [r.report_id, r.unread]));

      reply.send({
        reports: (refreshedReports as any[]).map(r => ({
          ...r,
          labels: JSON.parse(r.labels || '[]'),
          unreadReplies: unreadMap[r.id] ?? 0,
        })),
      });
    } catch (err: any) {
      reply.code(500).send({ error: err.message || 'Failed to load reports.' });
    }
  });

  // ────────────────────────────────────────────────
  // Draft Management
  // ────────────────────────────────────────────────

  /** GET /api/github/drafts — List all saved drafts */
  app.get('/drafts', async (_req, reply) => {
    const drafts = db.prepare('SELECT * FROM github_drafts ORDER BY updated_at DESC').all();
    reply.send({ drafts: (drafts as any[]).map(d => ({ ...d, labels: JSON.parse(d.labels || '[]') })) });
  });

  /** PUT /api/github/drafts/:id — Create or update a draft */
  app.put('/drafts/:id', async (req: FastifyRequest, reply) => {
    const { id } = req.params as any;
    const { title, body, category, labels, reportType } = req.body as any;

    db.prepare(`
      INSERT OR REPLACE INTO github_drafts (id, title, body, category, labels, report_type, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(id, title || '', body || '', category || 'General', JSON.stringify(labels || []), reportType || 'general');

    reply.send({ ok: true, id });
  });

  /** DELETE /api/github/drafts/:id — Delete a draft */
  app.delete('/drafts/:id', async (req: FastifyRequest, reply) => {
    const { id } = req.params as any;
    db.prepare('DELETE FROM github_drafts WHERE id = ?').run(id);
    reply.send({ ok: true });
  });

  // ────────────────────────────────────────────────
  // PHASE 5 — Notifications
  // ────────────────────────────────────────────────

  /** GET /api/github/notifications — Unread notification list + count */
  app.get('/notifications', async (_req, reply) => {
    const githubUserId = currentUserId();
    const notifications = db.prepare(`
      SELECT n.*, r.title as report_title, r.discussion_url
      FROM github_notifications n
      LEFT JOIN github_reports r ON n.report_id = r.id
      WHERE n.github_user_id = ?
      ORDER BY n.created_at DESC
      LIMIT 50
    `).all(githubUserId);

    const unreadCount = (db.prepare(`
      SELECT COUNT(*) as c FROM github_notifications WHERE read_at IS NULL AND github_user_id = ?
    `).get(githubUserId) as any).c;

    reply.send({ notifications, unreadCount });
  });

  /** POST /api/github/notifications/:id/read — Mark a notification as read */
  app.post('/notifications/:id/read', async (req: FastifyRequest, reply) => {
    const { id } = req.params as any;
    const githubUserId = currentUserId();
    if (id === 'all') {
      db.prepare("UPDATE github_notifications SET read_at = datetime('now') WHERE read_at IS NULL AND github_user_id = ?").run(githubUserId);
    } else {
      db.prepare("UPDATE github_notifications SET read_at = datetime('now') WHERE id = ? AND github_user_id = ?").run(id, githubUserId);
    }
    reply.send({ ok: true });
  });

  /** POST /api/github/poll — Background poll for new replies on tracked discussions */
  app.post('/poll', async (_req, reply) => {
    if (!requireToken(reply)) return;
    const githubUserId = currentUserId();
    const lockKey = `github:poll:lock_until:${githubUserId}`;
    const lastKey = `github:poll:last_run:${githubUserId}`;
    const now = Date.now();

    const lockUntil = Number(readKv(lockKey) || '0');
    if (lockUntil > now) {
      return reply.code(409).send({ error: 'Poll already in progress. Try again shortly.' });
    }

    const lastRun = Number(readKv(lastKey) || '0');
    const elapsed = now - lastRun;
    if (elapsed < POLL_COOLDOWN_MS) {
      return reply.code(429).send({
        error: 'Poll cooldown active',
        retry_after_ms: POLL_COOLDOWN_MS - elapsed,
      });
    }

    writeKv(lockKey, String(now + POLL_LOCK_MS));

    try {
      const tracked = db.prepare('SELECT * FROM github_tracked WHERE github_user_id = ?').all(githubUserId) as any[];
      if (tracked.length === 0) {
        writeKv(lastKey, String(Date.now()));
        return reply.send({ checked: 0, newNotifications: 0 });
      }

      const ids = tracked.map((t: any) => t.discussion_node_id);
      const results = await gh().pollTrackedDiscussions(ids);

      let newNotifications = 0;

      for (const result of results) {
        const trackedRow = tracked.find((t: any) => t.discussion_node_id === result.id);
        if (!trackedRow) continue;

        const newComments = result.commentCount - (trackedRow.known_comment_count || 0);
        const nowAnswered = result.isAnswered && !trackedRow.known_is_answered;
        const nextStatus = deriveReportStatus(result.isAnswered, result.stateReason);

        db.prepare(`
          UPDATE github_reports
          SET status = ?,
              comment_count = ?,
              last_comment_at = ?,
              discussion_url = COALESCE(?, discussion_url)
          WHERE id = ? AND github_user_id = ?
        `).run(
          nextStatus,
          result.commentCount,
          result.updatedAt,
          result.url,
          trackedRow.report_id,
          githubUserId,
        );

        if (newComments > 0) {
          // Create notification for new replies
          db.prepare(`
            INSERT INTO github_notifications (id, report_id, type, preview, thread_url, github_user_id)
            VALUES (?, ?, 'reply', ?, ?, ?)
          `).run(randomUUID(), trackedRow.report_id, `${newComments} new comment${newComments > 1 ? 's' : ''}`, '', githubUserId);
          newNotifications++;
        }

        if (nowAnswered) {
          db.prepare(`
            INSERT INTO github_notifications (id, report_id, type, preview, thread_url, github_user_id)
            VALUES (?, ?, 'answered', 'Your discussion was marked as Answered!', '', ?)
          `).run(randomUUID(), trackedRow.report_id, githubUserId);
          newNotifications++;
        }

        // Update tracked state
        db.prepare(`
          UPDATE github_tracked
          SET known_comment_count = ?, known_is_answered = ?, last_polled_at = datetime('now')
          WHERE discussion_node_id = ? AND github_user_id = ?
        `).run(result.commentCount, result.isAnswered ? 1 : 0, result.id, githubUserId);
      }

      writeKv(lastKey, String(Date.now()));

      reply.send({ checked: results.length, newNotifications });
    } catch (err: any) {
      reply.code(500).send({ error: err.message || 'Polling failed.' });
    } finally {
      deleteKv(lockKey);
    }
  });

  // ────────────────────────────────────────────────
  // DEV-MODE TOOLS — Owner-only (login === 'Ileices')
  // ────────────────────────────────────────────────

  /** GET /api/github/dev/open-discussions — Top open discussions by priority score */
  app.get('/dev/open-discussions', async (_req, reply) => {
    if (!requireOwner(reply)) return;
    if (!requireToken(reply)) return;

    try {
      const discussions = await gh().getTopOpenDiscussions();
      reply.send({ discussions });
    } catch (err: any) {
      reply.code(500).send({ error: err.message || 'Failed to fetch open discussions.' });
    }
  });

  /** GET /api/github/dev/open-issues — Open issues sorted by reactions */
  app.get('/dev/open-issues', async (_req, reply) => {
    if (!requireOwner(reply)) return;
    if (!requireToken(reply)) return;

    try {
      const issues = await gh().listOpenIssues();
      reply.send({ issues });
    } catch (err: any) {
      reply.code(500).send({ error: err.message || 'Failed to fetch open issues.' });
    }
  });

  /** POST /api/github/dev/analyze — Feed a discussion into the agent to draft a fix */
  app.post('/dev/analyze', async (req: FastifyRequest, reply) => {
    if (!requireOwner(reply)) return;
    if (!requireToken(reply)) return;

    const { discussionId, discussionNumber, discussionTitle, discussionBody } = req.body as any;

    if (!discussionNumber || !discussionBody) {
      return reply.code(400).send({ error: 'discussionNumber and discussionBody are required.' });
    }

    // Build a structured prompt for the improvement agent
    const analysisPrompt = `You are a senior developer reviewing a GitHub Discussion from the personal_IDE repository.

Discussion #${discussionNumber}: ${discussionTitle || '(no title)'}

---
${discussionBody}
---

Your tasks:
1. Identify the root cause of the reported problem (or the core request if it's a feature/question).
2. Propose a concrete code fix or solution with specific file paths and changes.
3. Draft a clear, helpful GitHub Discussion comment response that:
   - Acknowledges the issue
   - Explains what the root cause / answer is
   - Describes the fix/solution
   - Thanks the community member

Format your response as JSON with these fields:
{
  "root_cause": "...",
  "solution": "...",
  "draft_comment": "..."
}`;

    // Call the app's chat/send SSE endpoint and parse structured output.
    // This avoids the stale /api/chat fallback path and keeps analysis contract aligned.
    try {
      let analysis = '';
      let draftResponse = '';

      const content = await runDevAnalyzeViaChatSend(analysisPrompt);
      try {
        const parsed = JSON.parse(content.match(/\{[\s\S]+\}/)?.[0] || '{}');
        analysis = parsed.root_cause || parsed.solution || content;
        draftResponse = parsed.draft_comment || '';
      } catch {
        analysis = content;
        draftResponse = content;
      }

      // Store the dev draft
      const draftId = randomUUID();
      const githubUserId = currentUserId();
      db.prepare(`
        INSERT INTO github_dev_drafts (id, discussion_id, discussion_number, discussion_title, analysis, draft_response, github_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(draftId, discussionId || '', discussionNumber, discussionTitle || '', analysis, draftResponse, githubUserId);

      reply.send({ draftId, analysis, draftResponse });
    } catch (err: any) {
      reply.code(500).send({ error: err.message || 'Analysis failed.' });
    }
  });

  /** GET /api/github/dev/drafts — List dev drafts awaiting approval */
  app.get('/dev/drafts', async (_req, reply) => {
    if (!requireOwner(reply)) return;
    const githubUserId = currentUserId();

    const drafts = db.prepare(`
      SELECT * FROM github_dev_drafts WHERE github_user_id = ? ORDER BY created_at DESC LIMIT 50
    `).all(githubUserId);
    reply.send({ drafts });
  });

  /** PATCH /api/github/dev/drafts/:id — Update draft response text before posting */
  app.patch('/dev/drafts/:id', async (req: FastifyRequest, reply) => {
    if (!requireOwner(reply)) return;

    const { id } = req.params as any;
    const { draftResponse } = req.body as any;
    const githubUserId = currentUserId();

    db.prepare('UPDATE github_dev_drafts SET draft_response = ? WHERE id = ? AND github_user_id = ?').run(draftResponse || '', id, githubUserId);
    reply.send({ ok: true });
  });

  /** POST /api/github/dev/drafts/:id/post — Approve and post a dev draft, then inject a Suggested Job */
  app.post('/dev/drafts/:id/post', async (req: FastifyRequest, reply) => {
    if (!requireOwner(reply)) return;
    if (!requireToken(reply)) return;

    const { id } = req.params as any;
    const githubUserId = currentUserId();
    const draft = db.prepare('SELECT * FROM github_dev_drafts WHERE id = ? AND github_user_id = ?').get(id, githubUserId) as any;

    if (!draft) return reply.code(404).send({ error: 'Draft not found.' });
    if (draft.status === 'posted') return reply.code(400).send({ error: 'Draft already posted.' });

    try {
      const comment = await gh().addDiscussionComment({
        discussionId: draft.discussion_id,
        body: ensurePersonalIdeDisclaimer(draft.draft_response),
      });

      db.prepare(`
        UPDATE github_dev_drafts SET status = 'posted', posted_url = ? WHERE id = ? AND github_user_id = ?
      `).run(comment.url || '', id, githubUserId);

      // Inject canonical job_records work so community fixes flow directly into God Factory queue.
      const canonicalJobId = createCanonicalJobFromDevDraft(draft, comment.url || '');
      reply.send({ ok: true, url: comment.url, jobId: canonicalJobId });
    } catch (err: any) {
      reply.code(500).send({ error: err.message || 'Failed to post draft.' });
    }
  });

  /** POST /api/github/dev/close-issue/:number — Close a GitHub Issue with an optional resolution comment */
  app.post('/dev/close-issue/:number', async (req: FastifyRequest, reply) => {
    if (!requireOwner(reply)) return;
    if (!requireToken(reply)) return;

    const number = parseInt((req.params as any).number, 10);
    if (isNaN(number)) return reply.code(400).send({ error: 'Invalid issue number.' });

    const { comment } = req.body as any;

    try {
      await gh().closeIssue(number, comment || undefined);
      reply.send({ ok: true });
    } catch (err: any) {
      reply.code(500).send({ error: err.message || 'Failed to close issue.' });
    }
  });

  /** POST /api/github/dev/mark-answer — Mark a discussion comment as the accepted answer */
  app.post('/dev/mark-answer', async (req: FastifyRequest, reply) => {
    if (!requireOwner(reply)) return;
    if (!requireToken(reply)) return;

    const { commentId } = req.body as any;
    if (!commentId) return reply.code(400).send({ error: 'commentId is required.' });

    try {
      await gh().markCommentAsAnswer(commentId);
      reply.send({ ok: true });
    } catch (err: any) {
      reply.code(500).send({ error: err.message || 'Failed to mark answer.' });
    }
  });

  /** POST /api/github/dev/close-discussion — Close a discussion (state: CLOSED) */
  app.post('/dev/close-discussion', async (req: FastifyRequest, reply) => {
    if (!requireOwner(reply)) return;
    if (!requireToken(reply)) return;

    const { discussionId } = req.body as any;
    if (!discussionId) return reply.code(400).send({ error: 'discussionId is required.' });

    try {
      await gh().closeDiscussion(discussionId);
      reply.send({ ok: true });
    } catch (err: any) {
      reply.code(500).send({ error: err.message || 'Failed to close discussion.' });
    }
  });
}
