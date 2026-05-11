// ============================================
// GitHubService — centralised GitHub API client
// All GitHub REST + GraphQL calls route through here.
// Token priority: active PAT from DB → env GITHUB_PAT
// ============================================
import type Database from 'better-sqlite3';
import { appConfig } from '../../config.js';
import { smartDecrypt } from '../crypto/index.js';

// ── Constants ─────────────────────────────────
export const REPO_OWNER = 'Ileices';
export const REPO_NAME  = 'personal_IDE';
export const REPO_ID    = 'R_kgDORS0FTw';
export const GRAPHQL_URL = 'https://api.github.com/graphql';
export const REST_BASE   = 'https://api.github.com';

// Category node IDs (fetched once via get_categories.py)
export const CATEGORY_IDS: Record<string, string> = {
  Announcements: 'DIC_kwDORS0FT84C77rw',
  General:       'DIC_kwDORS0FT84C77rx',
  Ideas:         'DIC_kwDORS0FT84C77rz',
  'Q&A':         'DIC_kwDORS0FT84C77ry',
  'Show and Tell': 'DIC_kwDORS0FT84C77r0',
  // Bug Reports category — fallback to General if not found
  'Bug Reports': 'DIC_kwDORS0FT84C77rx',
};

// Owner login — dev-only tools are gated behind this
export const OWNER_LOGIN = 'Ileices';

// ── Types ──────────────────────────────────────
export interface GitHubDiscussion {
  id: string;           // node ID
  number: number;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  answer?: { id: string; body: string; author: GHAuthor } | null;
  author: GHAuthor;
  category: { id: string; name: string; emoji?: string };
  labels: { nodes: Array<{ name: string; color: string }> };
  comments: { totalCount: number; pageInfo?: PageInfo; nodes?: GHComment[] };
  reactions: { totalCount: number; nodes?: GHReaction[] };
  upvoteCount: number;
  isAnswered: boolean;
  stateReason?: string;
}

export interface GHComment {
  id: string;
  databaseId: number;
  body: string;
  createdAt: string;
  author: GHAuthor;
  isAnswer: boolean;
  replies?: { nodes: GHComment[] };
  reactions?: { nodes: GHReaction[] };
}

export interface GHAuthor {
  login: string;
  avatarUrl: string;
  url: string;
}

export interface GHReaction {
  content: string;
  user?: { login: string };
}

export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string;
  endCursor?: string;
}

export interface GHIssue {
  number: number;
  title: string;
  body: string;
  state: string;
  html_url: string;
  created_at: string;
  labels: Array<{ name: string; color: string }>;
  reactions: Record<string, number>;
  comments: number;
  user: { login: string; avatar_url: string };
}

export interface ActiveGitHubAccount {
  github_user_id: number;
  github_login: string;
}

// C4-G: Discussion category type returned by getDiscussionCategories()
export interface DiscussionCategory {
  id: string;
  name: string;
  emoji: string;
  emojiHTML: string;
  description: string;
  isAnswerable: boolean;
}

function discussionRankingScore(discussion: GitHubDiscussion, mode: 'TOP' | 'TRENDING'): number {
  const reactionScore = discussion.reactions?.totalCount ?? 0;
  const commentScore = discussion.comments?.totalCount ?? 0;
  const upvoteScore = discussion.upvoteCount ?? 0;
  const ageMs = Date.now() - new Date(discussion.updatedAt || discussion.createdAt).getTime();
  const ageDays = Math.max(ageMs / 86_400_000, 0);

  if (mode === 'TOP') {
    return reactionScore * 3 + commentScore * 2 + upvoteScore;
  }

  const freshnessBoost = Math.max(14 - ageDays, 0);
  return commentScore * 4 + reactionScore * 3 + upvoteScore * 2 + freshnessBoost;
}

// ── GitHubService class ────────────────────────
export class GitHubService {
  private db: Database.Database;
  private readonly maxNetworkAttempts = 3;
  private readonly requestTimeoutMs = 15000;
  /** In-memory TTL cache for global ranking results (TOP/TRENDING). */
  private readonly _rankingCache = new Map<string, {
    nodes: GitHubDiscussion[];
    fetchedAt: number;
    totalCount: number;
  }>();

  constructor(db: Database.Database) {
    this.db = db;
  }

  private async wait(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
  }

  private async fetchWithRetry(url: string, init: RequestInit, context: string): Promise<Response> {
    let lastError: string | null = null;

    for (let attempt = 1; attempt <= this.maxNetworkAttempts; attempt++) {
      try {
        const signal = AbortSignal.timeout(this.requestTimeoutMs);
        const res = await fetch(url, { ...init, signal });

        // Retry upstream 5xxs; return all other responses to normal handlers.
        if (res.status >= 500 && attempt < this.maxNetworkAttempts) {
          await this.wait(attempt * 250);
          continue;
        }

        return res;
      } catch (err) {
        lastError = this.getErrorMessage(err);
        if (attempt < this.maxNetworkAttempts) {
          await this.wait(attempt * 250);
          continue;
        }
      }
    }

    throw new Error(`${context} failed after ${this.maxNetworkAttempts} attempts: ${lastError ?? 'unknown network error'}`);
  }

  private decryptToken(tokenValue: string | null | undefined): string | null {
    if (!tokenValue) return null;
    try {
      const decrypted = smartDecrypt(tokenValue, appConfig.security.encryptKey);
      if (decrypted && decrypted.length > 0) return decrypted;
    } catch {
      if (tokenValue.length > 10) return tokenValue;
    }
    return null;
  }

  /** Get the active GitHub PAT from DB → env fallback */
  getToken(): string | null {
    try {
      // Try the active account's token from auth_tokens table
      const row = this.db
        .prepare(`SELECT token_encrypted FROM auth_tokens WHERE is_active = 1 AND github_user_id != -1 ORDER BY updated_at DESC LIMIT 1`)
        .get() as { token_encrypted: string } | undefined;

      const activeToken = this.decryptToken(row?.token_encrypted);
      if (activeToken) {
        return activeToken;
      }

      // Fallback: if the current active profile is guest/local-only but a saved GitHub
      // account exists, reuse the most recently updated GitHub token so Community Hub
      // features remain single-sign-on across the app.
      const fallbackRow = this.db
        .prepare(`SELECT token_encrypted FROM auth_tokens WHERE github_user_id != -1 ORDER BY is_active DESC, updated_at DESC LIMIT 1`)
        .get() as { token_encrypted: string } | undefined;

      const fallbackToken = this.decryptToken(fallbackRow?.token_encrypted);
      if (fallbackToken) {
        return fallbackToken;
      }
    } catch {
      // DB read failed — fall through to env
    }
    // Fall back to env-configured PAT (server-side only — for owner operations)
    return appConfig.github.pat || null;
  }

  /** Check if the current user is the repo owner (active account only — no fallback).
   *  Using a saved owner row as fallback would keep privileges alive after a guest
   *  or different user becomes active, silently bypassing the intended session boundary.
   */
  isOwner(): boolean {
    try {
      const activeRow = this.db
        .prepare(`SELECT github_login, github_user_id FROM auth_tokens WHERE is_active = 1 LIMIT 1`)
        .get() as { github_login: string; github_user_id: number } | undefined;
      return activeRow?.github_user_id !== -1 && activeRow?.github_login === OWNER_LOGIN;
    } catch {
      return false;
    }
  }

  /** Active GitHub account context for route-level scoping */
  getActiveGitHubAccount(): ActiveGitHubAccount | null {
    try {
      const activeRow = this.db
        .prepare(`SELECT github_user_id, github_login FROM auth_tokens WHERE is_active = 1 LIMIT 1`)
        .get() as { github_user_id: number; github_login: string } | undefined;

      if (activeRow?.github_user_id !== -1 && activeRow?.github_login) {
        return activeRow;
      }

      const fallbackRow = this.db
        .prepare(`SELECT github_user_id, github_login FROM auth_tokens WHERE github_user_id != -1 ORDER BY is_active DESC, updated_at DESC LIMIT 1`)
        .get() as { github_user_id: number; github_login: string } | undefined;

      if (fallbackRow?.github_user_id !== -1 && fallbackRow?.github_login) {
        return fallbackRow;
      }

      return null;
    } catch {
      return null;
    }
  }

  getActiveGitHubUserId(): number {
    return this.getActiveGitHubAccount()?.github_user_id ?? -1;
  }

  /** Execute a GitHub GraphQL query */
  async graphql<T = any>(query: string, variables: Record<string, any> = {}): Promise<T> {
    const token = this.getToken();
    if (!token) throw new Error('No GitHub token configured. Go to Settings → Providers to add your PAT.');

    const res = await this.fetchWithRetry(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'personal-ide',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ query, variables }),
    }, 'GitHub GraphQL request');

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      const truncated = bodyText.slice(0, 300);
      throw new Error(`GitHub GraphQL HTTP ${res.status}${truncated ? `: ${truncated}` : ''}`);
    }

    const data = await res.json() as any;
    if (data.errors?.length) {
      const detail = data.errors
        .map((e: any) => `${e.message}${e.type ? ` [${e.type}]` : ''}`)
        .join('; ');
      throw new Error(`GitHub GraphQL responded with errors: ${detail}`);
    }
    return data.data as T;
  }

  /** Execute a GitHub REST API call */
  async rest<T = any>(method: string, path: string, body?: any): Promise<T> {
    const token = this.getToken();
    if (!token) throw new Error('No GitHub token configured.');

    const res = await this.fetchWithRetry(`${REST_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'personal-ide',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: body ? JSON.stringify(body) : undefined,
    }, `GitHub REST ${method} ${path}`);

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any;
      throw new Error(err.message || `GitHub REST ${res.status} for ${method} ${path}`);
    }
    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  }

  // ── Discussion methods ─────────────────────────

  /** List repo discussions with optional sort + cursor (pagination) */
  async listDiscussions(opts: {
    first?: number;
    after?: string;
    categoryId?: string;
    orderBy?: 'NEWEST' | 'OLDEST' | 'UPDATED' | 'TOP' | 'TRENDING';
  } = {}): Promise<{ nodes: GitHubDiscussion[]; pageInfo: PageInfo; totalCount: number }> {
    const { first = 20, after, categoryId, orderBy = 'NEWEST' } = opts;

    const rankingMode = orderBy === 'TOP' || orderBy === 'TRENDING' ? orderBy : null;
    const orderField = rankingMode ? 'UPDATED_AT' : (orderBy === 'UPDATED' ? 'UPDATED_AT' : 'CREATED_AT');
    const orderDir   = orderBy === 'OLDEST' ? 'ASC' : 'DESC';

    // For TOP/TRENDING, accumulate all pages and rank globally (C5 finding S fix).
    // Cap at 10 pages × 100 items = 1000 discussions to respect rate limits.
    // Results are TTL-cached at 10 minutes per (mode, categoryId) key.
    if (rankingMode) {
      const cacheKey = `ranking:${rankingMode}:${categoryId ?? ''}`;
      const cached = this._rankingCache.get(cacheKey);
      if (cached && Date.now() - cached.fetchedAt < 10 * 60 * 1000) {
        const sliced = cached.nodes.slice(0, first);
        return {
          nodes: sliced,
          pageInfo: { hasNextPage: cached.nodes.length > first, hasPreviousPage: false },
          totalCount: cached.totalCount,
        };
      }

      const accumulated: GitHubDiscussion[] = [];
      let cursor: string | null = null;
      let totalCount = 0;
      const maxPages = 10;
      const pageSize = 100;

      for (let page = 0; page < maxPages; page++) {
        const data: { repository: { discussions: { totalCount: number; pageInfo: { hasNextPage: boolean; endCursor?: string }; nodes: GitHubDiscussion[] } } } = await this.graphql(`
          query ListDiscussionsPaged($owner: String!, $name: String!, $first: Int!, $after: String, $categoryId: ID, $orderField: DiscussionOrderField!, $orderDir: OrderDirection!) {
            repository(owner: $owner, name: $name) {
              discussions(
                first: $first
                after: $after
                categoryId: $categoryId
                orderBy: { field: $orderField, direction: $orderDir }
              ) {
                totalCount
                pageInfo { hasNextPage endCursor }
                nodes {
                  id number title body createdAt updatedAt url isAnswered upvoteCount
                  stateReason
                  author { login avatarUrl url }
                  category { id name emoji: emojiHTML }
                  labels(first: 5) { nodes { name color } }
                  comments { totalCount }
                  reactions(first: 6) { totalCount nodes { content user { login } } }
                  answer { id body author { login avatarUrl url } }
                }
              }
            }
          }
        `, { owner: REPO_OWNER, name: REPO_NAME, first: pageSize, after: cursor, categoryId: categoryId ?? null, orderField, orderDir });

        const page_data = data.repository.discussions;
        totalCount = page_data.totalCount;
        accumulated.push(...page_data.nodes);

        if (!page_data.pageInfo.hasNextPage) break;
        cursor = page_data.pageInfo.endCursor ?? null;
        if (!cursor) break;

        // Brief pause between pages to be gentle on rate limits
        await this.wait(150);
      }

      const ranked = [...accumulated].sort(
        (left, right) => discussionRankingScore(right, rankingMode) - discussionRankingScore(left, rankingMode)
      );

      this._rankingCache.set(cacheKey, { nodes: ranked, fetchedAt: Date.now(), totalCount });

      const sliced = ranked.slice(0, first);
      return {
        nodes: sliced,
        pageInfo: { hasNextPage: ranked.length > first, hasPreviousPage: false },
        totalCount,
      };
    }

    // Non-ranking modes: single page fetch (original behaviour)
    const data = await this.graphql(`
      query ListDiscussions($owner: String!, $name: String!, $first: Int!, $after: String, $categoryId: ID, $orderField: DiscussionOrderField!, $orderDir: OrderDirection!) {
        repository(owner: $owner, name: $name) {
          discussions(
            first: $first
            after: $after
            categoryId: $categoryId
            orderBy: { field: $orderField, direction: $orderDir }
          ) {
            totalCount
            pageInfo { hasNextPage endCursor hasPreviousPage startCursor }
            nodes {
              id number title body createdAt updatedAt url isAnswered upvoteCount
              stateReason
              author { login avatarUrl url }
              category { id name emoji: emojiHTML }
              labels(first: 5) { nodes { name color } }
              comments { totalCount }
              reactions(first: 6) { totalCount nodes { content user { login } } }
              answer { id body author { login avatarUrl url } }
            }
          }
        }
      }
    `, { owner: REPO_OWNER, name: REPO_NAME, first, after: after ?? null, categoryId: categoryId ?? null, orderField, orderDir });

    return data.repository.discussions;
  }

  /** Get a single discussion with all comments */
  async getDiscussion(number: number): Promise<GitHubDiscussion> {
    const data = await this.graphql(`
      query GetDiscussion($owner: String!, $name: String!, $number: Int!) {
        repository(owner: $owner, name: $name) {
          discussion(number: $number) {
            id number title body createdAt updatedAt url isAnswered upvoteCount stateReason
            author { login avatarUrl url }
            category { id name emoji: emojiHTML }
            labels(first: 10) { nodes { name color } }
            reactions(first: 20) { totalCount nodes { content user { login } } }
            answer { id body author { login avatarUrl url } }
            comments(first: 50) {
              totalCount
              pageInfo { hasNextPage endCursor }
              nodes {
                id databaseId body createdAt isAnswer
                author { login avatarUrl url }
                reactions(first: 10) { nodes { content user { login } } }
                replies(first: 10) {
                  nodes {
                    id databaseId body createdAt
                    author { login avatarUrl url }
                    reactions(first: 6) { nodes { content } }
                  }
                }
              }
            }
          }
        }
      }
    `, { owner: REPO_OWNER, name: REPO_NAME, number });

    return data.repository.discussion;
  }

  /** Create a new discussion */
  async createDiscussion(opts: {
    categoryId: string;
    title: string;
    body: string;
  }): Promise<{ id: string; number: number; url: string }> {
    const data = await this.graphql(`
      mutation CreateDiscussion($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
        createDiscussion(input: {
          repositoryId: $repositoryId
          categoryId: $categoryId
          title: $title
          body: $body
        }) {
          discussion { id number url }
        }
      }
    `, { repositoryId: REPO_ID, ...opts });

    return data.createDiscussion.discussion;
  }

  /** Add a comment to a discussion */
  async addDiscussionComment(opts: {
    discussionId: string;
    body: string;
    replyToId?: string;
  }): Promise<{ id: string; url: string }> {
    const data = await this.graphql(`
      mutation AddComment($discussionId: ID!, $body: String!, $replyToId: ID) {
        addDiscussionComment(input: {
          discussionId: $discussionId
          body: $body
          replyToId: $replyToId
        }) {
          comment { id url }
        }
      }
    `, { discussionId: opts.discussionId, body: opts.body, replyToId: opts.replyToId ?? null });

    return data.addDiscussionComment.comment;
  }

  /** Add a reaction to a discussion or comment */
  async addReaction(subjectId: string, content: string): Promise<void> {
    await this.graphql(`
      mutation AddReaction($subjectId: ID!, $content: ReactionContent!) {
        addReaction(input: { subjectId: $subjectId, content: $content }) {
          reaction { content }
        }
      }
    `, { subjectId, content });
  }

  /** Remove a reaction from a discussion or comment */
  async removeReaction(subjectId: string, content: string): Promise<void> {
    await this.graphql(`
      mutation RemoveReaction($subjectId: ID!, $content: ReactionContent!) {
        removeReaction(input: { subjectId: $subjectId, content: $content }) {
          reaction { content }
        }
      }
    `, { subjectId, content });
  }

  // ── Issue methods ──────────────────────────────

  /** Create a GitHub Issue */
  async createIssue(opts: { title: string; body: string; labels?: string[] }): Promise<GHIssue> {
    return this.rest<GHIssue>('POST', `/repos/${REPO_OWNER}/${REPO_NAME}/issues`, {
      title: opts.title,
      body: opts.body,
      labels: opts.labels ?? [],
    });
  }

  /** Close a GitHub Issue (dev-only) */
  async closeIssue(number: number, comment?: string): Promise<void> {
    if (comment) {
      await this.rest('POST', `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${number}/comments`, {
        body: comment,
      });
    }
    await this.rest('PATCH', `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${number}`, {
      state: 'closed',
      state_reason: 'completed',
    });
  }

  /** List open issues (dev-only) */
  async listOpenIssues(): Promise<GHIssue[]> {
    return this.rest<GHIssue[]>('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/issues?state=open&per_page=30&sort=reactions`);
  }

  /** Get open discussions sorted by reactions (dev-only) */
  async getTopOpenDiscussions(): Promise<GitHubDiscussion[]> {
    const result = await this.listDiscussions({ first: 50, orderBy: 'UPDATED' });
    // Filter to unanswered/open and sort by reaction count + comment count
    return result.nodes
      .filter(d => !d.isAnswered)
      .sort((a, b) =>
        (b.reactions.totalCount + b.comments.totalCount * 2 + b.upvoteCount) -
        (a.reactions.totalCount + a.comments.totalCount * 2 + a.upvoteCount)
      )
      .slice(0, 20);
  }

  /** Get recent comments on tracked discussion IDs to detect new replies */
  async pollTrackedDiscussions(nodeIds: string[]): Promise<Array<{ id: string; commentCount: number; isAnswered: boolean; stateReason: string | null; updatedAt: string | null; url: string | null }>> {
    if (nodeIds.length === 0) return [];

    // GraphQL nodes query for multiple node IDs
    const query = `
      query PollDiscussions($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Discussion {
            id
            isAnswered
            stateReason
            updatedAt
            url
            comments { totalCount }
          }
        }
      }
    `;
    const data = await this.graphql(query, { ids: nodeIds });
    return (data.nodes as any[]).filter(Boolean).map((n: any) => ({
      id: n.id,
      commentCount: n.comments?.totalCount ?? 0,
      isAnswered: n.isAnswered ?? false,
      stateReason: n.stateReason ?? null,
      updatedAt: n.updatedAt ?? null,
      url: n.url ?? null,
    }));
  }

  /**
   * Mark a Discussion comment as the accepted answer.
   * GitHub GraphQL: markDiscussionCommentAsAnswer mutation.
   * Requires the node ID of the *comment* (not the discussion).
   */
  async markCommentAsAnswer(commentId: string): Promise<void> {
    await this.graphql(`
      mutation MarkAnswer($commentId: ID!) {
        markDiscussionCommentAsAnswer(input: { id: $commentId }) {
          clientMutationId
        }
      }
    `, { commentId });
  }

  /**
   * Close a Discussion via GraphQL (state: CLOSED).
   * Used after a dev draft fix is posted and verified.
   */
  async closeDiscussion(discussionId: string): Promise<void> {
    await this.graphql(`
      mutation CloseDiscussion($discussionId: ID!) {
        closeDiscussion(input: { discussionId: $discussionId }) {
          discussion { id state }
        }
      }
    `, { discussionId });
  }

  // C4-G: Dynamic discussion categories — replaces hardcoded CATEGORY_IDS map.
  // Cached for 30 minutes to avoid hammering the API on every call.
  private _categoriesCache: { nodes: DiscussionCategory[]; fetchedAt: number } | null = null;
  private readonly _categoriesTTL = 30 * 60 * 1000; // 30 min

  async getDiscussionCategories(): Promise<DiscussionCategory[]> {
    const now = Date.now();
    if (this._categoriesCache && (now - this._categoriesCache.fetchedAt) < this._categoriesTTL) {
      return this._categoriesCache.nodes;
    }
    const data = await this.graphql<{ repository: { discussionCategories: { nodes: DiscussionCategory[] } } }>(`
      query GetDiscussionCategories($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          discussionCategories(first: 25) {
            nodes {
              id
              name
              emoji
              emojiHTML
              description
              isAnswerable
            }
          }
        }
      }
    `, { owner: REPO_OWNER, name: REPO_NAME });
    const nodes = data?.repository?.discussionCategories?.nodes ?? [];
    this._categoriesCache = { nodes, fetchedAt: now };
    return nodes;
  }
}

// ── Singleton factory ──────────────────────────
let _instance: GitHubService | null = null;

export function getGitHubService(db: Database.Database): GitHubService {
  if (!_instance) _instance = new GitHubService(db);
  return _instance;
}
