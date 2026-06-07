// ============================================
// Community Crawler — Sprint 4 (Discussion #112)
//
// Scans community sources (GitHub Discussions, Issues) for actionable
// signals: bug reports, feature requests, questions about missing features.
// Converts them into Suggested Jobs with source: 'community_crawler'.
//
// Per CONSTITUTION: community-sourced jobs REQUIRE human approval.
// The toolGatekeeper policy ensures this for Tier 3+ jobs.
//
// Runs every 6 hours via subsystemScheduler.
// Uses sanitizeExternalText() for ALL fetched content.
// ============================================
import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import { callWithFallback } from '../llm/unifiedFallback.js';
import { sanitizeExternalText } from '../toolOutputSanitizer.js';

// ── Signal type from community source ──

interface CommunitySignal {
  platform: 'github';
  externalId: string;
  title: string;
  body: string;
  url: string;
  labels: string[];
  signalType: 'bug_report' | 'feature_request' | 'question' | 'performance' | 'security' | 'unknown';
  priority: 'critical' | 'high' | 'medium' | 'low';
}

// ── Classify a community post using LLM ──

async function classifySignal(
  title: string,
  body: string,
  db: Database.Database,
): Promise<{ signalType: CommunitySignal['signalType']; priority: CommunitySignal['priority']; jobTitle: string; jobDescription: string } | null> {
  const truncatedBody = body.slice(0, 800);
  const prompt = `Analyze this GitHub discussion/issue and classify it as a software task.

Title: "${title}"
Body excerpt: "${truncatedBody}"

Respond ONLY with a JSON object:
{
  "signalType": "bug_report|feature_request|question|performance|security|unknown",
  "priority": "critical|high|medium|low",
  "jobTitle": "concise 1-line task title under 80 chars",
  "jobDescription": "2-3 sentence description of what needs to be done",
  "shouldCreateJob": true|false
}

Rules:
- bug_report with crashes → priority critical or high
- feature_request → priority medium or low  
- security issues → priority critical
- shouldCreateJob: false if it's just a question with no action required`;

  try {
    const result = await callWithFallback({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 300,
      temperature: 0,
      chainKey: 'crawler',
      db,
      taskType: 'community_signal_classification',
    });

    const text = result.content.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as {
      signalType?: string;
      priority?: string;
      jobTitle?: string;
      jobDescription?: string;
      shouldCreateJob?: boolean;
    };

    if (!parsed.shouldCreateJob) return null;

    const validSignalTypes = ['bug_report', 'feature_request', 'question', 'performance', 'security', 'unknown'] as const;
    const validPriorities = ['critical', 'high', 'medium', 'low'] as const;

    return {
      signalType: validSignalTypes.includes(parsed.signalType as typeof validSignalTypes[number])
        ? (parsed.signalType as CommunitySignal['signalType'])
        : 'unknown',
      priority: validPriorities.includes(parsed.priority as typeof validPriorities[number])
        ? (parsed.priority as CommunitySignal['priority'])
        : 'medium',
      jobTitle: String(parsed.jobTitle || title).slice(0, 120),
      jobDescription: String(parsed.jobDescription || '').slice(0, 1000),
    };
  } catch {
    return null;
  }
}

// ── Map signal type to job category ──

function signalTypeToCategory(signalType: CommunitySignal['signalType']): string {
  const map: Record<CommunitySignal['signalType'], string> = {
    bug_report: 'regression_hardening',
    feature_request: 'model_tool_enhancement',
    question: 'user_requested',
    performance: 'performance_test_missing',
    security: 'security_gap',
    unknown: 'user_requested',
  };
  return map[signalType] || 'user_requested';
}

// ── Fetch GitHub Discussions/Issues via stored PAT ──

async function fetchGitHubCommunityItems(
  db: Database.Database,
): Promise<CommunitySignal[]> {
  // Get GitHub token from DB
  const authRow = db.prepare(`SELECT token_encrypted FROM auth_tokens WHERE is_active = 1`).get() as { token_encrypted: string } | undefined;
  if (!authRow) return [];

  const { smartDecrypt } = await import('../crypto/index.js');
  const { appConfig } = await import('../../config.js');
  const token = smartDecrypt(authRow.token_encrypted, appConfig.security.encryptKey);
  if (!token) return [];

  const signals: CommunitySignal[] = [];

  try {
    // Fetch recent open issues from the IDE repo
    const issuesRes = await fetch(
      'https://api.github.com/repos/Ileices/personal_IDE/issues?state=open&per_page=20&sort=created&direction=desc',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'personal-ide-community-crawler/1.0',
        },
      },
    );

    if (issuesRes.ok) {
      const issues = await issuesRes.json() as Array<{
        number: number;
        title: string;
        body: string | null;
        html_url: string;
        labels: Array<{ name: string }>;
        pull_request?: unknown;
      }>;

      for (const issue of issues) {
        // Skip pull requests
        if (issue.pull_request) continue;

        // Sanitize ALL external content before use
        const safeTitle = sanitizeExternalText(issue.title || '', { source: 'github_issue', db }).sanitized;
        const safeBody = sanitizeExternalText(issue.body || '', { source: 'github_issue', db }).sanitized;

        signals.push({
          platform: 'github',
          externalId: String(issue.number),
          title: issue.title.slice(0, 200),   // original title for DB storage
          body: (issue.body || '').slice(0, 2000),
          url: issue.html_url,
          labels: issue.labels.map(l => l.name),
          signalType: 'unknown',  // will be classified by LLM
          priority: 'medium',
        });
      }
    }
  } catch {
    // Network errors are non-fatal — crawler will retry next cycle
  }

  return signals;
}

// ── Main crawler tick ──────────────────────────

export interface CommunityCrawlerResult {
  fetched: number;
  classified: number;
  jobsCreated: number;
  duplicatesSkipped: number;
  errors: string[];
}

export async function runCommunityCrawlerTick(db: Database.Database): Promise<CommunityCrawlerResult> {
  const result: CommunityCrawlerResult = {
    fetched: 0,
    classified: 0,
    jobsCreated: 0,
    duplicatesSkipped: 0,
    errors: [],
  };

  let signals: CommunitySignal[] = [];
  try {
    signals = await fetchGitHubCommunityItems(db);
    result.fetched = signals.length;
  } catch (err) {
    result.errors.push(`Fetch error: ${String(err).slice(0, 100)}`);
    return result;
  }

  for (const signal of signals) {
    // Check for duplicate (same platform + external_id)
    const existing = db.prepare(`
      SELECT id FROM community_discussions
      WHERE source_platform = ? AND external_id = ?
    `).get(signal.platform, signal.externalId) as { id: string } | undefined;

    if (existing) {
      result.duplicatesSkipped++;
      continue;
    }

    // Classify signal using LLM
    const classification = await classifySignal(signal.title, signal.body, db);

    // Record community discussion regardless of classification
    const discussionId = randomUUID();
    db.prepare(`
      INSERT OR IGNORE INTO community_discussions
        (id, source_platform, external_id, title, body, url, labels, signals, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      discussionId,
      signal.platform,
      signal.externalId,
      signal.title.slice(0, 500),
      signal.body.slice(0, 2000),
      signal.url,
      JSON.stringify(signal.labels),
      JSON.stringify(classification || {}),
      classification ? 'classified' : 'pending',
    );

    if (!classification) continue;
    result.classified++;

    // Get default project for job assignment
    const projects = db.prepare(`
      SELECT id FROM projects ORDER BY last_accessed_at DESC, created_at DESC LIMIT 1
    `).all() as Array<{ id: string }>;
    const projectId = projects[0]?.id || null;

    // Create a Suggested Job (requires human approval — no auto-approve)
    const jobId = randomUUID();
    const now = db.prepare(`SELECT CAST(strftime('%s','now') AS INTEGER) as t`).get() as { t: number };
    const cycle = now.t;

    try {
      db.prepare(`
        INSERT INTO job_records (
          id, job_id, project_id, title, description, priority, job_category,
          source, implementation_status, created_cycle, last_updated_cycle,
          source_record_ids, affected_files, affected_devtags, affected_plantags,
          required_buildtags, blocking_jobs, blocked_by_jobs,
          hierarchy, atomic_steps, sandbox_spec
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'community_crawler', 'suggested', ?, ?,
          '[]', '[]', '[]', '[]', '[]', '[]', '[]',
          ?, '[]', ?)
      `).run(
        randomUUID(),
        jobId,
        projectId,
        classification.jobTitle,
        classification.jobDescription,
        classification.priority,
        signalTypeToCategory(classification.signalType),
        cycle,
        cycle,
        JSON.stringify({ phase: 1, milestone: 'community-sourced', parent_job_id: null, child_job_ids: [] }),
        JSON.stringify({
          sandbox_id: null, status: 'not_started', cycle_limit: 50, cycles_used: 0,
          test_results: [], human_review_required: true, human_review_completed: false,
        }),
      );

      // Link discussion to job
      db.prepare(`
        UPDATE community_discussions SET job_id_created = ?, status = 'job_created' WHERE id = ?
      `).run(jobId, discussionId);

      result.jobsCreated++;
    } catch (err) {
      result.errors.push(`Job creation error for ${signal.externalId}: ${String(err).slice(0, 80)}`);
    }
  }

  return result;
}

// ── Status query ───────────────────────────────

export function getCommunityCrawlerStatus(db: Database.Database) {
  const total = (db.prepare(`SELECT COUNT(*) as cnt FROM community_discussions`).get() as { cnt: number }).cnt;
  const pending = (db.prepare(`SELECT COUNT(*) as cnt FROM community_discussions WHERE status = 'pending'`).get() as { cnt: number }).cnt;
  const jobsCreated = (db.prepare(`SELECT COUNT(*) as cnt FROM community_discussions WHERE status = 'job_created'`).get() as { cnt: number }).cnt;
  const recent = db.prepare(`
    SELECT id, source_platform, title, status, processed_at FROM community_discussions
    ORDER BY processed_at DESC LIMIT 10
  `).all() as Array<Record<string, unknown>>;

  return { total, pending, jobsCreated, recent };
}
