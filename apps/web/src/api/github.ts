// ============================================
// GitHub API Client — typed wrappers for
// all /api/github endpoints
// ============================================
import { apiGet, apiPost, apiFetch } from './client.js';

const BASE = '/api/github';

// ── Types ──────────────────────────────────────
export interface GHToolchainStatus {
  git:    { installed: boolean; version: string | null };
  gh:     { installed: boolean; version: string | null };
  auth:   { connected: boolean; status: string };
  ready:  boolean;
  isOwner: boolean;
}

export interface GHAuthor {
  login: string;
  avatarUrl: string;
  url: string;
}

export interface GHReaction { content: string; user?: { login: string } }

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

export interface GHDiscussion {
  id: string;
  number: number;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  isAnswered: boolean;
  upvoteCount: number;
  stateReason?: string;
  author: GHAuthor;
  category: { id: string; name: string; emoji?: string };
  labels: { nodes: Array<{ name: string; color: string }> };
  comments: { totalCount: number; nodes?: GHComment[] };
  reactions: { totalCount: number; nodes?: GHReaction[] };
  answer?: { id: string; body: string; author: GHAuthor } | null;
  postedFromApp?: boolean;
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

export interface PageInfo {
  hasNextPage: boolean;
  endCursor?: string;
}

export interface LocalReport {
  id: string;
  discussion_id: string | null;
  discussion_number: number | null;
  issue_number: number | null;
  title: string;
  body: string;
  category: string;
  labels: string[];
  report_type: string;
  discussion_url: string | null;
  issue_url: string | null;
  status: string;
  unreadReplies: number;
  created_at: string;
}

export interface LocalDraft {
  id: string;
  title: string;
  body: string;
  category: string;
  labels: string[];
  report_type: string;
  updated_at: string;
}

export interface GHNotification {
  id: string;
  report_id: string | null;
  type: string;
  actor_login: string;
  actor_avatar: string;
  preview: string;
  thread_url: string;
  read_at: string | null;
  created_at: string;
  report_title?: string;
  discussion_url?: string;
}

export interface DevDraft {
  id: string;
  discussion_id: string;
  discussion_number: number;
  discussion_title: string;
  analysis: string;
  draft_response: string;
  status: string;
  posted_url: string | null;
  created_at: string;
}

// ── API Functions ──────────────────────────────

export function getToolchainStatus() {
  return apiGet<GHToolchainStatus>(`${BASE}/status`);
}

// Feed
export function listDiscussions(params?: {
  sort?: 'NEWEST' | 'OLDEST' | 'UPDATED';
  categoryId?: string;
  after?: string;
  first?: number;
}) {
  const q = new URLSearchParams();
  if (params?.sort) q.set('sort', params.sort);
  if (params?.categoryId) q.set('categoryId', params.categoryId);
  if (params?.after) q.set('after', params.after);
  if (params?.first) q.set('first', String(params.first));
  const qs = q.toString();
  return apiGet<{ nodes: GHDiscussion[]; pageInfo: PageInfo; totalCount: number }>(
    `${BASE}/discussions${qs ? '?' + qs : ''}`
  );
}

export function getDiscussion(number: number) {
  return apiGet<{ discussion: GHDiscussion }>(`${BASE}/discussions/${number}`);
}

export function addComment(discussionId: string, body: string, replyToId?: string) {
  return apiPost<{ comment: { id: string; url: string } }>(`${BASE}/discussions/${discussionId}/comment`, { body, replyToId });
}

export function addReaction(id: string, content: string, remove = false) {
  return apiPost<{ ok: boolean }>(`${BASE}/discussions/${id}/react`, { content, remove });
}

// Reporting
export function createReport(data: {
  title: string;
  body: string;
  category: string;
  labels: string[];
  reportType: string;
  crossPostIssue?: boolean;
  draftId?: string;
}) {
  return apiPost<{ reportId: string; discussion: GHDiscussion; issue: GHIssue | null; draftId?: string }>(
    `${BASE}/report`, data
  );
}

// My Reports
export function getMyReports() {
  return apiGet<{ reports: LocalReport[] }>(`${BASE}/my-reports`);
}

// Drafts
export function getDrafts() {
  return apiGet<{ drafts: LocalDraft[] }>(`${BASE}/drafts`);
}

export function saveDraft(id: string, data: Partial<LocalDraft>) {
  return apiFetch<{ ok: boolean; id: string }>(`${BASE}/drafts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteDraft(id: string) {
  return apiFetch<{ ok: boolean }>(`${BASE}/drafts/${id}`, { method: 'DELETE' });
}

// Notifications
export function getNotifications() {
  return apiGet<{ notifications: GHNotification[]; unreadCount: number }>(`${BASE}/notifications`);
}

export function markNotificationRead(id: string) {
  return apiPost<{ ok: boolean }>(`${BASE}/notifications/${id}/read`, {});
}

export function markAllNotificationsRead() {
  return apiPost<{ ok: boolean }>(`${BASE}/notifications/all/read`, {});
}

export function pollNotifications() {
  return apiPost<{ checked: number; newNotifications: number }>(`${BASE}/poll`, {});
}

// Dev tools (owner-only)
export function getDevOpenDiscussions() {
  return apiGet<{ discussions: GHDiscussion[] }>(`${BASE}/dev/open-discussions`);
}

export function getDevOpenIssues() {
  return apiGet<{ issues: GHIssue[] }>(`${BASE}/dev/open-issues`);
}

export function analyzeDiscussion(data: {
  discussionId: string;
  discussionNumber: number;
  discussionTitle: string;
  discussionBody: string;
}) {
  return apiPost<{ draftId: string; analysis: string; draftResponse: string }>(
    `${BASE}/dev/analyze`, data
  );
}

export function getDevDrafts() {
  return apiGet<{ drafts: DevDraft[] }>(`${BASE}/dev/drafts`);
}

export function updateDevDraft(id: string, draftResponse: string) {
  return apiFetch<{ ok: boolean }>(`${BASE}/dev/drafts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ draftResponse }),
  });
}

export function postDevDraft(id: string) {
  return apiPost<{ ok: boolean; url: string }>(`${BASE}/dev/drafts/${id}/post`, {});
}

export function closeIssue(number: number, comment?: string) {
  return apiPost<{ ok: boolean }>(`${BASE}/dev/close-issue/${number}`, { comment });
}
