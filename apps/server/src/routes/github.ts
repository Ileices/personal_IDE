// ============================================
// GitHub Community Routes — /api/github
// Phases 1–5 + dev-mode tools (owner-only)
// ============================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { getGitHubService, CATEGORY_IDS, OWNER_LOGIN } from '../services/github/githubService.js';

// ── Fastify plugin ─────────────────────────────
export async function githubRoutes(app: FastifyInstance) {
  const db = (app as any).db;

  function gh() {
    return getGitHubService(db);
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
    const { execSync } = await import('child_process');

    const check = (cmd: string): string | null => {
      try {
        return execSync(cmd, { timeout: 3000, stdio: 'pipe' }).toString().trim();
      } catch {
        return null;
      }
    };

    const gitVersion = check('git --version');
    const ghVersion  = check('gh --version');
    const hasToken   = !!gh().getToken();
    const isOwner    = gh().isOwner();

    let authStatus = 'none';
    if (hasToken) authStatus = 'pat';

    reply.send({
      git:        { installed: !!gitVersion, version: gitVersion },
      gh:         { installed: !!ghVersion,  version: ghVersion  },
      auth:       { connected: hasToken, status: authStatus },
      ready:      !!gitVersion && !!ghVersion && hasToken,
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
    const sort       = (query.sort as string) || 'NEWEST';   // NEWEST | OLDEST | UPDATED
    const categoryId = (query.categoryId as string) || undefined;
    const cursor     = (query.after as string) || undefined;
    const first      = Math.min(parseInt(query.first || '20', 10), 50);

    try {
      const result = await gh().listDiscussions({ first, after: cursor, categoryId, orderBy: sort as any });

      // Augment with local "posted from this app" flag
      const localIds = new Set(
        (db.prepare('SELECT discussion_id FROM github_reports WHERE discussion_id IS NOT NULL').all() as any[])
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
    const { body, replyToId } = req.body as any;

    if (!body?.trim()) return reply.code(400).send({ error: 'Comment body is required.' });

    try {
      const comment = await gh().addDiscussionComment({ discussionId: id, body, replyToId });
      reply.send({ comment });
    } catch (err: any) {
      reply.code(500).send({ error: err.message || 'Failed to post comment.' });
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

  // ────────────────────────────────────────────────
  // PHASE 3 — Reporting Engine
  // ────────────────────────────────────────────────

  /** POST /api/github/report — Create a new report (Discussion + optional Issue) */
  app.post('/report', async (req: FastifyRequest, reply) => {
    if (!requireToken(reply)) return;

    const { title, body, category, labels, reportType, crossPostIssue, draftId } = req.body as any;

    if (!title?.trim() || !body?.trim()) {
      return reply.code(400).send({ error: 'Title and body are required.' });
    }

    const categoryId = CATEGORY_IDS[category] || CATEGORY_IDS['General'];

    try {
      // Create the Discussion
      const discussion = await gh().createDiscussion({ categoryId, title, body });

      // Bug reports also create a GitHub Issue for tracked resolution
      let issue: { number: number; html_url: string } | null = null;
      if (reportType === 'bug' || crossPostIssue) {
        issue = await gh().createIssue({
          title,
          body: `${body}\n\n---\n_Originally reported via [Discussion #${discussion.number}](${discussion.url})_`,
          labels: labels || ['bug'],
        });
      }

      // Store locally
      const reportId = randomUUID();
      db.prepare(`
        INSERT INTO github_reports (id, discussion_id, discussion_number, issue_number, title, body, category, labels, report_type, discussion_url, issue_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      );

      // Track for notification polling
      db.prepare(`
        INSERT OR REPLACE INTO github_tracked (discussion_node_id, report_id, known_comment_count, known_is_answered)
        VALUES (?, ?, 0, 0)
      `).run(discussion.id, reportId);

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
  app.get('/my-reports', async (_req, reply) => {
    try {
      const reports = db.prepare(`
        SELECT * FROM github_reports ORDER BY created_at DESC LIMIT 100
      `).all();

      // Attach any unread notification counts
      const notifCounts = db.prepare(`
        SELECT report_id, COUNT(*) as unread
        FROM github_notifications
        WHERE read_at IS NULL
        GROUP BY report_id
      `).all() as any[];

      const unreadMap = Object.fromEntries(notifCounts.map((r: any) => [r.report_id, r.unread]));

      reply.send({
        reports: (reports as any[]).map(r => ({
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
    const notifications = db.prepare(`
      SELECT n.*, r.title as report_title, r.discussion_url
      FROM github_notifications n
      LEFT JOIN github_reports r ON n.report_id = r.id
      ORDER BY n.created_at DESC
      LIMIT 50
    `).all();

    const unreadCount = (db.prepare(`
      SELECT COUNT(*) as c FROM github_notifications WHERE read_at IS NULL
    `).get() as any).c;

    reply.send({ notifications, unreadCount });
  });

  /** POST /api/github/notifications/:id/read — Mark a notification as read */
  app.post('/notifications/:id/read', async (req: FastifyRequest, reply) => {
    const { id } = req.params as any;
    if (id === 'all') {
      db.prepare("UPDATE github_notifications SET read_at = datetime('now') WHERE read_at IS NULL").run();
    } else {
      db.prepare("UPDATE github_notifications SET read_at = datetime('now') WHERE id = ?").run(id);
    }
    reply.send({ ok: true });
  });

  /** POST /api/github/poll — Background poll for new replies on tracked discussions */
  app.post('/poll', async (_req, reply) => {
    try {
      const tracked = db.prepare('SELECT * FROM github_tracked').all() as any[];
      if (tracked.length === 0) return reply.send({ checked: 0, newNotifications: 0 });

      const ids = tracked.map((t: any) => t.discussion_node_id);
      const results = await gh().pollTrackedDiscussions(ids);

      let newNotifications = 0;

      for (const result of results) {
        const trackedRow = tracked.find((t: any) => t.discussion_node_id === result.id);
        if (!trackedRow) continue;

        const newComments = result.commentCount - (trackedRow.known_comment_count || 0);
        const nowAnswered = result.isAnswered && !trackedRow.known_is_answered;

        if (newComments > 0) {
          // Create notification for new replies
          db.prepare(`
            INSERT INTO github_notifications (id, report_id, type, preview, thread_url)
            VALUES (?, ?, 'reply', ?, ?)
          `).run(randomUUID(), trackedRow.report_id, `${newComments} new comment${newComments > 1 ? 's' : ''}`, '');
          newNotifications++;
        }

        if (nowAnswered) {
          db.prepare(`
            INSERT INTO github_notifications (id, report_id, type, preview, thread_url)
            VALUES (?, ?, 'answered', 'Your discussion was marked as Answered!', '')
          `).run(randomUUID(), trackedRow.report_id);
          newNotifications++;
        }

        // Update tracked state
        db.prepare(`
          UPDATE github_tracked
          SET known_comment_count = ?, known_is_answered = ?, last_polled_at = datetime('now')
          WHERE discussion_node_id = ?
        `).run(result.commentCount, result.isAnswered ? 1 : 0, result.id);
      }

      reply.send({ checked: results.length, newNotifications });
    } catch (err: any) {
      reply.code(500).send({ error: err.message || 'Polling failed.' });
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

    // Call the app's own chat/agent endpoint
    try {
      const agentRes = await fetch(`http://127.0.0.1:${process.env['SERVER_PORT'] || 3001}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: analysisPrompt,
          model: null, // use default
          stream: false,
        }),
      });

      let analysis = '';
      let draftResponse = '';

      if (agentRes.ok) {
        const agentData = await agentRes.json() as any;
        const content = agentData.message || agentData.content || '';
        try {
          const parsed = JSON.parse(content.match(/\{[\s\S]+\}/)?.[0] || '{}');
          analysis = parsed.root_cause || parsed.solution || content;
          draftResponse = parsed.draft_comment || '';
        } catch {
          analysis = content;
          draftResponse = content;
        }
      } else {
        analysis = `(Agent unavailable — draft manually)\n\nDiscussion: ${discussionTitle}`;
        draftResponse = '';
      }

      // Store the dev draft
      const draftId = randomUUID();
      db.prepare(`
        INSERT INTO github_dev_drafts (id, discussion_id, discussion_number, discussion_title, analysis, draft_response)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(draftId, discussionId || '', discussionNumber, discussionTitle || '', analysis, draftResponse);

      reply.send({ draftId, analysis, draftResponse });
    } catch (err: any) {
      reply.code(500).send({ error: err.message || 'Analysis failed.' });
    }
  });

  /** GET /api/github/dev/drafts — List dev drafts awaiting approval */
  app.get('/dev/drafts', async (_req, reply) => {
    if (!requireOwner(reply)) return;

    const drafts = db.prepare(`
      SELECT * FROM github_dev_drafts ORDER BY created_at DESC LIMIT 50
    `).all();
    reply.send({ drafts });
  });

  /** PATCH /api/github/dev/drafts/:id — Update draft response text before posting */
  app.patch('/dev/drafts/:id', async (req: FastifyRequest, reply) => {
    if (!requireOwner(reply)) return;

    const { id } = req.params as any;
    const { draftResponse } = req.body as any;

    db.prepare('UPDATE github_dev_drafts SET draft_response = ? WHERE id = ?').run(draftResponse || '', id);
    reply.send({ ok: true });
  });

  /** POST /api/github/dev/drafts/:id/post — Approve and post a dev draft */
  app.post('/dev/drafts/:id/post', async (req: FastifyRequest, reply) => {
    if (!requireOwner(reply)) return;
    if (!requireToken(reply)) return;

    const { id } = req.params as any;
    const draft = db.prepare('SELECT * FROM github_dev_drafts WHERE id = ?').get(id) as any;

    if (!draft) return reply.code(404).send({ error: 'Draft not found.' });
    if (draft.status === 'posted') return reply.code(400).send({ error: 'Draft already posted.' });

    try {
      const comment = await gh().addDiscussionComment({
        discussionId: draft.discussion_id,
        body: draft.draft_response,
      });

      db.prepare(`
        UPDATE github_dev_drafts SET status = 'posted', posted_url = ? WHERE id = ?
      `).run(comment.url || '', id);

      reply.send({ ok: true, url: comment.url });
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
}
