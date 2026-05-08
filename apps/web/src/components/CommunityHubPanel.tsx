// ============================================
// Community Hub Panel
// 4 tabs: Feed | Thread | Report | Dev Tools
// Dev Tools tab only shown to repo owner
// ============================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  MessageSquare, Bug, Sparkles, RefreshCw, ChevronDown,
  ThumbsUp, Heart, Rocket, Eye, Laugh, SmilePlus, HelpCircle,
  Star, Send, AlertTriangle, CheckCircle, Bell, BellOff, Users,
  TerminalSquare, ChevronRight, PlusCircle, Loader, X, Edit,
} from 'lucide-react';
import {
  listDiscussions, getDiscussion, addComment, addReaction,
  createReport, getMyReports, getDrafts, saveDraft, deleteDraft,
  getNotifications, markNotificationRead, markAllNotificationsRead,
  pollNotifications, getDevOpenDiscussions, getDevOpenIssues,
  analyzeDiscussion, getDevDrafts, updateDevDraft, postDevDraft,
  closeIssue, markCommentAsAnswer, closeDiscussion, getToolchainStatus,
  type GHDiscussion, type LocalReport, type LocalDraft,
  type GHNotification, type DevDraft, type GHIssue,
} from '../api/github.js';
import { CATEGORY_IDS } from './github/constants.js';

// ── Category colour mapping ────────────────────
const CATEGORY_COLOURS: Record<string, string> = {
  'General':       'bg-blue-500/20 text-blue-300',
  'Bug Reports':   'bg-red-500/20 text-red-300',
  'Ideas':         'bg-purple-500/20 text-purple-300',
  'Q&A':           'bg-yellow-500/20 text-yellow-300',
  'Show and Tell': 'bg-green-500/20 text-green-300',
  'Announcements': 'bg-orange-500/20 text-orange-300',
};

const REACTION_MAP: Record<string, string> = {
  THUMBS_UP: '👍', THUMBS_DOWN: '👎', LAUGH: '😄', HOORAY: '🎉',
  CONFUSED: '😕', HEART: '❤️', ROCKET: '🚀', EYES: '👀',
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// ── Main Panel ────────────────────────────────
type Tab = 'feed' | 'thread' | 'report' | 'my-reports' | 'notifications' | 'dev';

interface CommunityHubPanelProps {
  isOwner?: boolean;
}

export function CommunityHubPanel({ isOwner: isOwnerProp }: CommunityHubPanelProps) {
  const [tab, setTab] = useState<Tab>('feed');
  const [isOwner, setIsOwner] = useState(isOwnerProp ?? false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [ready, setReady] = useState<boolean | null>(null);

  // Check toolchain status + owner status
  useEffect(() => {
    getToolchainStatus()
      .then(s => {
        setReady(s.ready);
        setIsOwner(s.isOwner);
      })
      .catch(() => setReady(false));
  }, []);

  // Poll notifications every 5 minutes
  useEffect(() => {
    const fetchUnread = () => {
      getNotifications().then(r => setUnreadCount(r.unreadCount)).catch(() => {});
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center h-9 px-3 border-b border-ide-border flex-shrink-0">
        <Users size={14} className="mr-2 text-ide-accent" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ide-text-dim flex-1">
          Community Hub
        </span>
        {ready === false && (
          <span className="text-[10px] text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded">
            Setup Required
          </span>
        )}
        {ready === true && (
          <span className="text-[10px] text-green-400 bg-green-400/10 px-2 py-0.5 rounded">
            GitHub: Ready ✓
          </span>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-ide-border flex-shrink-0">
        {[
          { id: 'feed' as Tab, label: 'Feed' },
          { id: 'report' as Tab, label: 'Report' },
          { id: 'my-reports' as Tab, label: 'Mine' },
          { id: 'notifications' as Tab, label: `Inbox${unreadCount > 0 ? ` (${unreadCount})` : ''}` },
          ...(isOwner ? [{ id: 'dev' as Tab, label: '⚙ Dev' }] : []),
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-[11px] font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-ide-accent text-ide-accent'
                : 'border-transparent text-ide-text-dim hover:text-ide-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'feed'          && <DiscussionFeed onOpenThread={() => setTab('thread')} setThreadNumber={() => {}} />}
        {tab === 'report'        && <ReportCompose />}
        {tab === 'my-reports'    && <MyReports />}
        {tab === 'notifications' && <NotificationsPanel onRead={() => setUnreadCount(0)} />}
        {tab === 'dev' && isOwner && <DevToolsPanel />}
      </div>
    </div>
  );
}

// ── Discussion Feed ────────────────────────────
function DiscussionFeed({ onOpenThread, setThreadNumber }: { onOpenThread: () => void; setThreadNumber: (n: number) => void }) {
  const [discussions, setDiscussions] = useState<GHDiscussion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<'NEWEST' | 'UPDATED'>('NEWEST');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [openThreadNumber, setOpenThreadNumber] = useState<number | null>(null);

  const load = useCallback(async (reset = true) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listDiscussions({
        sort,
        categoryId: categoryFilter || undefined,
        after: reset ? undefined : cursor,
        first: 20,
      });
      setDiscussions(prev => reset ? res.nodes : [...prev, ...res.nodes]);
      setHasMore(res.pageInfo.hasNextPage);
      setCursor(res.pageInfo.endCursor);
    } catch (e: any) {
      setError(e.message || 'Failed to load discussions.');
    } finally {
      setLoading(false);
    }
  }, [sort, categoryFilter, cursor]);

  useEffect(() => { load(true); }, [sort, categoryFilter]);

  if (openThreadNumber !== null) {
    return (
      <DiscussionThread
        number={openThreadNumber}
        onBack={() => setOpenThreadNumber(null)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-ide-border flex-shrink-0">
        <select
          value={sort}
          onChange={e => setSort(e.target.value as any)}
          className="text-[11px] bg-ide-bg border border-ide-border rounded px-1.5 py-0.5 text-ide-text"
        >
          <option value="NEWEST">Newest</option>
          <option value="UPDATED">Recently Updated</option>
        </select>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="text-[11px] bg-ide-bg border border-ide-border rounded px-1.5 py-0.5 text-ide-text flex-1"
        >
          <option value="">All Categories</option>
          {Object.keys(CATEGORY_IDS).map(c => (
            <option key={c} value={CATEGORY_IDS[c]}>{c}</option>
          ))}
        </select>
        <button
          onClick={() => load(true)}
          className="text-ide-text-dim hover:text-ide-accent p-1 rounded"
          title="Refresh"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="m-3 p-3 bg-red-900/20 border border-red-500/30 rounded text-[11px] text-red-300">
            {error}
          </div>
        )}

        {!error && discussions.length === 0 && !loading && (
          <div className="p-6 text-center text-ide-text-dim text-[12px]">
            No discussions found.
          </div>
        )}

        {discussions.map(d => (
          <button
            key={d.id}
            className="w-full text-left px-3 py-2.5 border-b border-ide-border hover:bg-ide-bg/50 transition-colors"
            onClick={() => setOpenThreadNumber(d.number)}
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                  <span className={`text-[10px] px-1.5 py-0 rounded font-medium ${CATEGORY_COLOURS[d.category?.name] || 'bg-gray-500/20 text-gray-300'}`}>
                    {d.category?.name || 'General'}
                  </span>
                  {d.isAnswered && (
                    <span className="text-[10px] px-1.5 py-0 rounded bg-green-500/20 text-green-300">
                      ✓ Answered
                    </span>
                  )}
                  {d.postedFromApp && (
                    <span className="text-[10px] px-1 py-0 rounded bg-ide-accent/20 text-ide-accent">
                      ★ You
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-ide-text font-medium leading-snug truncate">
                  {d.title}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[10px] text-ide-text-dim">
                  <span>@{d.author?.login}</span>
                  <span>{relativeTime(d.createdAt)}</span>
                  <span>💬 {d.comments?.totalCount}</span>
                  {d.reactions?.totalCount > 0 && (
                    <span>👍 {d.reactions.totalCount}</span>
                  )}
                  {d.upvoteCount > 0 && <span>▲ {d.upvoteCount}</span>}
                </div>
              </div>
              <ChevronRight size={13} className="text-ide-text-dim flex-shrink-0 mt-1" />
            </div>
          </button>
        ))}

        {loading && (
          <div className="flex justify-center py-4">
            <Loader size={16} className="animate-spin text-ide-text-dim" />
          </div>
        )}

        {hasMore && !loading && (
          <button
            onClick={() => load(false)}
            className="w-full py-2 text-[11px] text-ide-accent hover:bg-ide-accent/10 transition-colors"
          >
            Load More
          </button>
        )}
      </div>
    </div>
  );
}

// ── Discussion Thread ──────────────────────────
function DiscussionThread({ number, onBack }: { number: number; onBack: () => void }) {
  const [discussion, setDiscussion] = useState<GHDiscussion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getDiscussion(number)
      .then(r => setDiscussion(r.discussion))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [number]);

  const handleReply = async () => {
    if (!discussion || !replyBody.trim()) return;
    setReplying(true);
    setReplyError(null);
    try {
      await addComment(discussion.id, replyBody);
      setReplyBody('');
      // Refresh
      const fresh = await getDiscussion(number);
      setDiscussion(fresh.discussion);
    } catch (e: any) {
      setReplyError(e.message || 'Failed to post reply.');
    } finally {
      setReplying(false);
    }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader size={20} className="animate-spin text-ide-text-dim" /></div>;
  if (error) return (
    <div className="p-4">
      <button onClick={onBack} className="text-[11px] text-ide-accent mb-3 flex items-center gap-1">
        ← Back
      </button>
      <div className="p-3 bg-red-900/20 border border-red-500/30 rounded text-[11px] text-red-300">{error}</div>
    </div>
  );
  if (!discussion) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-ide-border flex-shrink-0">
        <button onClick={onBack} className="text-[11px] text-ide-accent hover:underline flex items-center gap-1">
          ← Back
        </button>
        <span className="text-[11px] text-ide-text-dim truncate flex-1">#{discussion.number}</span>
        <a
          href={discussion.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-ide-text-dim hover:text-ide-accent"
        >
          GitHub ↗
        </a>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {/* Post */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <img src={discussion.author?.avatarUrl} alt="" className="w-5 h-5 rounded-full" />
            <span className="text-[11px] text-ide-text font-medium">@{discussion.author?.login}</span>
            <span className="text-[10px] text-ide-text-dim">{relativeTime(discussion.createdAt)}</span>
            <span className={`text-[10px] px-1.5 py-0 rounded ${CATEGORY_COLOURS[discussion.category?.name] || 'bg-gray-500/20 text-gray-300'}`}>
              {discussion.category?.name}
            </span>
            {discussion.isAnswered && (
              <span className="text-[10px] px-1.5 py-0 rounded bg-green-500/20 text-green-300">✓ Answered</span>
            )}
          </div>

          <h3 className="text-[13px] font-semibold text-ide-text mb-2">{discussion.title}</h3>

          <div className="text-[12px] text-ide-text whitespace-pre-wrap leading-relaxed bg-ide-bg/30 rounded p-2.5 border border-ide-border">
            {discussion.body}
          </div>

          {/* Reactions */}
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {Object.entries(REACTION_MAP).map(([key, emoji]) => {
              const count = discussion.reactions?.nodes?.filter(r => r.content === key).length || 0;
              return (
                <button
                  key={key}
                  onClick={() => addReaction(discussion.id, key)}
                  className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                    count > 0
                      ? 'border-ide-accent/40 bg-ide-accent/10 text-ide-text'
                      : 'border-ide-border text-ide-text-dim hover:border-ide-accent/40'
                  }`}
                  title={`React with ${emoji}`}
                >
                  {emoji} {count > 0 ? count : ''}
                </button>
              );
            })}
          </div>
        </div>

        {/* Comments */}
        {discussion.comments?.nodes && discussion.comments.nodes.length > 0 && (
          <div className="space-y-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ide-text-dim border-b border-ide-border pb-1">
              {discussion.comments.totalCount} Comment{discussion.comments.totalCount !== 1 ? 's' : ''}
            </div>
            {discussion.comments.nodes.map(comment => (
              <div key={comment.id} className={`rounded p-2.5 border ${comment.isAnswer ? 'border-green-500/40 bg-green-900/10' : 'border-ide-border bg-ide-bg/20'}`}>
                {comment.isAnswer && (
                  <div className="text-[10px] text-green-400 font-semibold mb-1">✓ Accepted Answer</div>
                )}
                <div className="flex items-center gap-1.5 mb-1">
                  <img src={comment.author?.avatarUrl} alt="" className="w-4 h-4 rounded-full" />
                  <span className="text-[11px] text-ide-text font-medium">@{comment.author?.login}</span>
                  <span className="text-[10px] text-ide-text-dim">{relativeTime(comment.createdAt)}</span>
                </div>
                <div className="text-[12px] text-ide-text whitespace-pre-wrap leading-relaxed">
                  {comment.body}
                </div>
                {/* Comment reactions */}
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {Object.entries(REACTION_MAP).slice(0, 4).map(([key, emoji]) => {
                    const count = comment.reactions?.nodes?.filter(r => r.content === key).length || 0;
                    if (count === 0) return null;
                    return (
                      <span key={key} className="text-[10px] px-1.5 py-0 rounded bg-ide-bg/50 border border-ide-border text-ide-text-dim">
                        {emoji} {count}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Reply box */}
        <div className="border-t border-ide-border pt-3">
          <div className="text-[11px] text-ide-text-dim mb-1.5">Post a Reply</div>
          <textarea
            value={replyBody}
            onChange={e => setReplyBody(e.target.value)}
            placeholder="Write your reply in Markdown..."
            rows={4}
            className="w-full text-[12px] bg-ide-bg border border-ide-border rounded p-2 text-ide-text placeholder:text-ide-text-dim resize-none focus:outline-none focus:border-ide-accent"
          />
          {replyError && (
            <div className="text-[11px] text-red-300 mt-1">{replyError}</div>
          )}
          <button
            onClick={handleReply}
            disabled={!replyBody.trim() || replying}
            className="mt-1.5 flex items-center gap-1.5 px-3 py-1.5 bg-ide-accent text-white text-[11px] rounded hover:bg-ide-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {replying ? <Loader size={12} className="animate-spin" /> : <Send size={12} />}
            {replying ? 'Posting…' : 'Post Reply'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Report Compose ─────────────────────────────
const CATEGORIES = ['General', 'Bug Reports', 'Ideas', 'Q&A', 'Show and Tell'];
const BUG_LABELS  = ['bug', 'needs-triage', 'regression'];
const WIN_LABELS  = ['showcase', 'success-story'];

function ReportCompose() {
  const [reportType, setReportType] = useState<'bug' | 'showcase' | 'general'>('bug');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('Bug Reports');
  const [labels, setLabels] = useState<string[]>(['bug']);
  const [draftId, setDraftId] = useState<string>(() => crypto.randomUUID());
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ url: string } | null>(null);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [showDrafts, setShowDrafts] = useState(false);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load drafts
  useEffect(() => {
    getDrafts().then(r => setDrafts(r.drafts)).catch(() => {});
  }, []);

  // Auto-save every 30 seconds
  useEffect(() => {
    if (!title && !body) return;
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      saveDraft(draftId, { title, body, category, labels, report_type: reportType }).catch(() => {});
    }, 30000);
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current); };
  }, [title, body, category, labels, reportType, draftId]);

  const handleTypeChange = (type: 'bug' | 'showcase' | 'general') => {
    setReportType(type);
    if (type === 'bug') {
      setCategory('Bug Reports');
      setLabels(['bug']);
      setTitle(title || '[Bug] ');
    } else if (type === 'showcase') {
      setCategory('Show and Tell');
      setLabels(['showcase']);
      setTitle(title || '[Showcase] ');
    } else {
      setCategory('General');
      setLabels([]);
    }
  };

  const handlePost = async () => {
    if (!title.trim() || !body.trim()) {
      setError('Please fill in both the title and body.');
      return;
    }
    setPosting(true);
    setError(null);
    try {
      const result = await createReport({ title, body, category, labels, reportType, crossPostIssue: reportType === 'bug', draftId });
      setSuccess({ url: result.discussion.url });
      // Clear form
      setTitle('');
      setBody('');
      setDraftId(crypto.randomUUID());
    } catch (e: any) {
      setError(e.message || 'Failed to post report. Your draft was saved.');
    } finally {
      setPosting(false);
    }
  };

  if (success) {
    return (
      <div className="p-4 text-center">
        <CheckCircle size={32} className="text-green-400 mx-auto mb-3" />
        <div className="text-[13px] font-semibold text-ide-text mb-1">Report Posted!</div>
        <a
          href={success.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[12px] text-ide-accent hover:underline"
        >
          View on GitHub ↗
        </a>
        <button
          onClick={() => setSuccess(null)}
          className="block mx-auto mt-4 text-[11px] text-ide-text-dim hover:text-ide-text"
        >
          Write Another
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-3 gap-3">
      {/* Type selector */}
      <div className="flex gap-2">
        {[
          { key: 'bug', label: '🐛 Bug', desc: 'Report a Problem' },
          { key: 'showcase', label: '🎉 Win', desc: 'Share a Win' },
          { key: 'general', label: '💬 Other', desc: 'General Post' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => handleTypeChange(t.key as any)}
            className={`flex-1 text-[11px] py-1.5 rounded border transition-colors ${
              reportType === t.key
                ? 'border-ide-accent bg-ide-accent/10 text-ide-accent'
                : 'border-ide-border text-ide-text-dim hover:border-ide-border'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Drafts restore */}
      {drafts.length > 0 && (
        <button
          onClick={() => setShowDrafts(!showDrafts)}
          className="text-[11px] text-ide-text-dim hover:text-ide-accent flex items-center gap-1"
        >
          <ChevronDown size={11} />
          Saved Drafts ({drafts.length})
        </button>
      )}
      {showDrafts && (
        <div className="border border-ide-border rounded overflow-hidden">
          {drafts.map(d => (
            <div key={d.id} className="flex items-center px-2 py-1.5 border-b last:border-0 border-ide-border hover:bg-ide-bg/50">
              <span className="flex-1 text-[11px] text-ide-text truncate">{d.title || '(untitled draft)'}</span>
              <button
                onClick={() => {
                  setTitle(d.title);
                  setBody(d.body);
                  setCategory(d.category);
                  setLabels(d.labels);
                  setReportType(d.report_type);
                  setDraftId(d.id);
                  setShowDrafts(false);
                }}
                className="text-[10px] text-ide-accent px-2"
              >
                Restore
              </button>
              <button
                onClick={() => deleteDraft(d.id).then(() => setDrafts(prev => prev.filter(x => x.id !== d.id)))}
                className="text-[10px] text-red-400 px-1"
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Title */}
      <input
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Title..."
        className="text-[12px] bg-ide-bg border border-ide-border rounded px-2.5 py-1.5 text-ide-text placeholder:text-ide-text-dim focus:outline-none focus:border-ide-accent"
      />

      {/* Category + labels */}
      <div className="flex gap-2">
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="text-[11px] bg-ide-bg border border-ide-border rounded px-1.5 py-1 text-ide-text"
        >
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {/* Write / Preview tabs */}
      <div className="flex border-b border-ide-border">
        {(['write', 'preview'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1 text-[11px] border-b-2 transition-colors ${
              tab === t ? 'border-ide-accent text-ide-accent' : 'border-transparent text-ide-text-dim'
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'write' && (
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Describe the problem or win in Markdown...&#10;&#10;**What happened?**&#10;&#10;**Expected behavior?**&#10;&#10;**Steps to reproduce?**"
          className="flex-1 min-h-0 text-[12px] bg-ide-bg border border-ide-border rounded p-2.5 text-ide-text placeholder:text-ide-text-dim resize-none focus:outline-none focus:border-ide-accent font-mono"
        />
      )}

      {tab === 'preview' && (
        <div className="flex-1 min-h-0 overflow-y-auto text-[12px] text-ide-text whitespace-pre-wrap leading-relaxed bg-ide-bg/30 border border-ide-border rounded p-2.5">
          {body || <span className="text-ide-text-dim italic">Nothing to preview yet.</span>}
        </div>
      )}

      {error && (
        <div className="text-[11px] text-red-300 bg-red-900/20 border border-red-500/30 rounded p-2">
          {error}
        </div>
      )}

      <button
        onClick={handlePost}
        disabled={posting || !title.trim() || !body.trim()}
        className="flex items-center justify-center gap-2 py-2 bg-ide-accent text-white text-[12px] rounded hover:bg-ide-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {posting ? <Loader size={13} className="animate-spin" /> : <Send size={13} />}
        {posting ? 'Posting to GitHub…' : 'Post to GitHub'}
      </button>

      <div className="text-[10px] text-ide-text-dim text-center">
        Auto-saves every 30 seconds · Nothing posts without your confirmation
      </div>
    </div>
  );
}

// ── My Reports ─────────────────────────────────
function MyReports() {
  const [reports, setReports] = useState<LocalReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyReports()
      .then(r => setReports(r.reports))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-8"><Loader size={16} className="animate-spin text-ide-text-dim" /></div>;

  if (reports.length === 0) return (
    <div className="p-6 text-center text-ide-text-dim text-[12px]">
      No reports posted from this app yet.
      <div className="mt-1 text-[11px]">Use the Report tab to share bugs or wins.</div>
    </div>
  );

  return (
    <div className="divide-y divide-ide-border">
      {reports.map(r => (
        <div key={r.id} className="px-3 py-2.5">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-medium text-ide-text truncate">{r.title}</div>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-ide-text-dim flex-wrap">
                <span className={`px-1.5 py-0 rounded ${r.status === 'open' ? 'bg-green-500/20 text-green-300' : 'bg-gray-500/20 text-gray-300'}`}>
                  {r.status}
                </span>
                <span>{r.category}</span>
                <span>{relativeTime(r.created_at)}</span>
                {r.unreadReplies > 0 && (
                  <span className="bg-ide-accent/20 text-ide-accent px-1.5 py-0 rounded">
                    {r.unreadReplies} new
                  </span>
                )}
              </div>
            </div>
            {r.discussion_url && (
              <a
                href={r.discussion_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-ide-accent shrink-0 hover:underline"
              >
                View ↗
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Notifications Panel ────────────────────────
function NotificationsPanel({ onRead }: { onRead: () => void }) {
  const [notifications, setNotifications] = useState<GHNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    getNotifications()
      .then(r => {
        setNotifications(r.notifications);
        setUnreadCount(r.unreadCount);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleMarkAll = async () => {
    await markAllNotificationsRead();
    setNotifications(prev => prev.map(n => ({ ...n, read_at: new Date().toISOString() })));
    setUnreadCount(0);
    onRead();
  };

  if (loading) return <div className="flex justify-center py-8"><Loader size={16} className="animate-spin text-ide-text-dim" /></div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center px-3 py-2 border-b border-ide-border">
        <span className="flex-1 text-[11px] text-ide-text-dim">
          {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
        </span>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAll}
            className="text-[10px] text-ide-accent hover:underline"
          >
            Mark All Read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="p-6 text-center text-ide-text-dim text-[12px]">
          No notifications yet.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-ide-border">
          {notifications.map(n => (
            <div
              key={n.id}
              className={`px-3 py-2 ${!n.read_at ? 'bg-ide-accent/5' : ''}`}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-ide-text">{n.preview || `New ${n.type} on your report`}</div>
                  {n.report_title && (
                    <div className="text-[10px] text-ide-text-dim truncate mt-0.5">{n.report_title}</div>
                  )}
                  <div className="text-[10px] text-ide-text-dim mt-0.5">{relativeTime(n.created_at)}</div>
                </div>
                {!n.read_at && (
                  <button
                    onClick={() => {
                      markNotificationRead(n.id);
                      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x));
                      setUnreadCount(c => Math.max(0, c - 1));
                    }}
                    className="text-[10px] text-ide-text-dim hover:text-ide-accent shrink-0"
                  >
                    ✓
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Dev Tools Panel (owner-only) ───────────────
function DevToolsPanel() {
  const [devTab, setDevTab] = useState<'discussions' | 'issues' | 'drafts'>('discussions');
  const [discussions, setDiscussions] = useState<GHDiscussion[]>([]);
  const [issues, setIssues] = useState<GHIssue[]>([]);
  const [devDrafts, setDevDrafts] = useState<DevDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<string | null>(null);
  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({});
  // Track per-draft: postedJobId and pending close/answer actions
  const [postResults, setPostResults] = useState<Record<string, { url: string; jobId?: string }>>({});
  const [closingDiscussion, setClosingDiscussion] = useState<string | null>(null);

  const loadData = async (tab: 'discussions' | 'issues' | 'drafts') => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'discussions') {
        const r = await getDevOpenDiscussions();
        setDiscussions(r.discussions);
      } else if (tab === 'issues') {
        const r = await getDevOpenIssues();
        setIssues(r.issues);
      } else {
        const r = await getDevDrafts();
        setDevDrafts(r.drafts);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(devTab); }, [devTab]);

  const handleAnalyze = async (d: GHDiscussion) => {
    setAnalyzing(d.id);
    try {
      await analyzeDiscussion({
        discussionId: d.id,
        discussionNumber: d.number,
        discussionTitle: d.title,
        discussionBody: d.body,
      });
      setDevTab('drafts');
      await loadData('drafts');
    } catch (e: any) {
      setError(e.message || 'Analysis failed.');
    } finally {
      setAnalyzing(null);
    }
  };

  const handlePost = async (draft: DevDraft) => {
    try {
      const editedText = draftEdits[draft.id];
      if (editedText !== undefined && editedText !== draft.draft_response) {
        await updateDevDraft(draft.id, editedText);
      }
      const result = await postDevDraft(draft.id);
      setPostResults(prev => ({ ...prev, [draft.id]: { url: result.url, jobId: result.jobId } }));
      await loadData('drafts');
    } catch (e: any) {
      setError(e.message || 'Failed to post.');
    }
  };

  const handleCloseIssue = async (number: number) => {
    try {
      await closeIssue(number, '_Resolved by the development team. See linked discussion for details._');
      await loadData('issues');
    } catch (e: any) {
      setError(e.message || 'Failed to close issue.');
    }
  };

  const handleCloseDiscussion = async (draft: DevDraft) => {
    if (!draft.discussion_id) return;
    setClosingDiscussion(draft.id);
    try {
      await closeDiscussion(draft.discussion_id);
      await loadData('drafts');
    } catch (e: any) {
      setError(e.message || 'Failed to close discussion.');
    } finally {
      setClosingDiscussion(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Warning banner */}
      <div className="px-3 py-2 bg-yellow-900/20 border-b border-yellow-500/20 text-[10px] text-yellow-300">
        ⚙ Dev Tools — Owner-Only. Changes post directly to GitHub.
      </div>

      {/* Sub-tabs */}
      <div className="flex border-b border-ide-border">
        {(['discussions', 'issues', 'drafts'] as const).map(t => (
          <button
            key={t}
            onClick={() => setDevTab(t)}
            className={`px-3 py-1.5 text-[11px] border-b-2 capitalize transition-colors ${
              devTab === t ? 'border-yellow-400 text-yellow-300' : 'border-transparent text-ide-text-dim'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {error && (
        <div className="mx-3 mt-2 p-2 bg-red-900/20 border border-red-500/30 rounded text-[11px] text-red-300">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex justify-center py-8"><Loader size={16} className="animate-spin text-ide-text-dim" /></div>
        )}

        {/* Open Discussions */}
        {!loading && devTab === 'discussions' && (
          <div className="divide-y divide-ide-border">
            {discussions.length === 0 ? (
              <div className="p-4 text-center text-ide-text-dim text-[12px]">No open discussions.</div>
            ) : discussions.map(d => (
              <div key={d.id} className="px-3 py-2.5">
                <div className="text-[12px] font-medium text-ide-text mb-0.5">#{d.number} {d.title}</div>
                <div className="text-[10px] text-ide-text-dim mb-1.5">
                  @{d.author?.login} · 👍{d.reactions?.totalCount} · 💬{d.comments?.totalCount}
                </div>
                <button
                  onClick={() => handleAnalyze(d)}
                  disabled={analyzing === d.id}
                  className="flex items-center gap-1 text-[11px] px-2.5 py-1 bg-yellow-500/20 text-yellow-300 rounded hover:bg-yellow-500/30 disabled:opacity-50 transition-colors"
                >
                  {analyzing === d.id ? <Loader size={11} className="animate-spin" /> : <TerminalSquare size={11} />}
                  {analyzing === d.id ? 'Analyzing…' : 'Analyze & Draft Fix'}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Open Issues */}
        {!loading && devTab === 'issues' && (
          <div className="divide-y divide-ide-border">
            {issues.length === 0 ? (
              <div className="p-4 text-center text-ide-text-dim text-[12px]">No open issues.</div>
            ) : issues.map(issue => (
              <div key={issue.number} className="px-3 py-2.5">
                <div className="text-[12px] font-medium text-ide-text mb-0.5">#{issue.number} {issue.title}</div>
                <div className="text-[10px] text-ide-text-dim mb-1.5">
                  @{issue.user?.login} · 💬{issue.comments}
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={issue.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-ide-accent hover:underline"
                  >
                    View ↗
                  </a>
                  <button
                    onClick={() => handleCloseIssue(issue.number)}
                    className="text-[10px] px-2 py-0.5 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30 transition-colors"
                  >
                    Close Issue
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Dev Drafts */}
        {!loading && devTab === 'drafts' && (
          <div className="divide-y divide-ide-border">
            {devDrafts.length === 0 ? (
              <div className="p-4 text-center text-ide-text-dim text-[12px]">
                No drafts yet. Analyze a discussion to generate one.
              </div>
            ) : devDrafts.map(draft => (
              <div key={draft.id} className="px-3 py-3">
                <div className="flex items-start gap-2 mb-2">
                  <div className="flex-1">
                    <div className="text-[12px] font-medium text-ide-text">
                      #{draft.discussion_number} {draft.discussion_title}
                    </div>
                    <span className={`text-[10px] px-1.5 py-0 rounded ${draft.status === 'posted' ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                      {draft.status}
                    </span>
                  </div>
                </div>

                {draft.analysis && (
                  <details className="mb-2">
                    <summary className="text-[10px] text-ide-text-dim cursor-pointer hover:text-ide-text">
                      Agent Analysis
                    </summary>
                    <div className="mt-1 text-[11px] text-ide-text whitespace-pre-wrap bg-ide-bg/30 border border-ide-border rounded p-2">
                      {draft.analysis}
                    </div>
                  </details>
                )}

                <div className="text-[10px] text-ide-text-dim mb-1">Draft Response:</div>
                {editingDraft === draft.id ? (
                  <textarea
                    value={draftEdits[draft.id] ?? draft.draft_response}
                    onChange={e => setDraftEdits(prev => ({ ...prev, [draft.id]: e.target.value }))}
                    rows={6}
                    className="w-full text-[11px] bg-ide-bg border border-ide-border rounded p-2 text-ide-text resize-none font-mono focus:outline-none focus:border-ide-accent"
                  />
                ) : (
                  <div className="text-[11px] text-ide-text whitespace-pre-wrap bg-ide-bg/20 border border-ide-border rounded p-2 max-h-40 overflow-y-auto">
                    {draftEdits[draft.id] ?? draft.draft_response || '(empty — edit before posting)'}
                  </div>
                )}

                {draft.status !== 'posted' && (
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => setEditingDraft(editingDraft === draft.id ? null : draft.id)}
                      className="flex items-center gap-1 text-[11px] px-2 py-1 border border-ide-border rounded text-ide-text-dim hover:text-ide-text transition-colors"
                    >
                      <Edit size={11} /> {editingDraft === draft.id ? 'Done Editing' : 'Edit'}
                    </button>
                    <button
                      onClick={() => handlePost(draft)}
                      className="flex items-center gap-1 text-[11px] px-2.5 py-1 bg-green-500/20 text-green-300 rounded hover:bg-green-500/30 transition-colors"
                    >
                      <Send size={11} /> Approve & Post
                    </button>
                  </div>
                )}

                {/* Post-approval actions: close the discussion loop */}
                {draft.status === 'posted' && (
                  <div className="mt-2 space-y-1.5">
                    {postResults[draft.id]?.jobId && (
                      <div className="text-[10px] text-green-300 bg-green-900/20 border border-green-500/20 rounded px-2 py-1">
                        ✓ Suggested Job created — fix queued in God Factory pipeline
                      </div>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => handleCloseDiscussion(draft)}
                        disabled={closingDiscussion === draft.id}
                        className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-red-500/10 text-red-300 border border-red-500/30 rounded hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                        title="Mark discussion as Closed on GitHub"
                      >
                        {closingDiscussion === draft.id ? <Loader size={10} className="animate-spin" /> : <X size={10} />}
                        Close Discussion
                      </button>
                    </div>
                  </div>
                )}

                {draft.posted_url && (
                  <a
                    href={draft.posted_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block mt-1 text-[10px] text-ide-accent hover:underline"
                  >
                    View Posted Response ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
  const [devTab, setDevTab] = useState<'discussions' | 'issues' | 'drafts'>('discussions');
  const [discussions, setDiscussions] = useState<GHDiscussion[]>([]);
  const [issues, setIssues] = useState<GHIssue[]>([]);
  const [devDrafts, setDevDrafts] = useState<DevDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<string | null>(null);
  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({});

  const loadData = async (tab: 'discussions' | 'issues' | 'drafts') => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'discussions') {
        const r = await getDevOpenDiscussions();
        setDiscussions(r.discussions);
      } else if (tab === 'issues') {
        const r = await getDevOpenIssues();
        setIssues(r.issues);
      } else {
        const r = await getDevDrafts();
        setDevDrafts(r.drafts);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(devTab); }, [devTab]);

  const handleAnalyze = async (d: GHDiscussion) => {
    setAnalyzing(d.id);
    try {
      await analyzeDiscussion({
        discussionId: d.id,
        discussionNumber: d.number,
        discussionTitle: d.title,
        discussionBody: d.body,
      });
      setDevTab('drafts');
      await loadData('drafts');
    } catch (e: any) {
      setError(e.message || 'Analysis failed.');
    } finally {
      setAnalyzing(null);
    }
  };

  const handlePost = async (draft: DevDraft) => {
    try {
      const editedText = draftEdits[draft.id];
      if (editedText !== undefined && editedText !== draft.draft_response) {
        await updateDevDraft(draft.id, editedText);
      }
      await postDevDraft(draft.id);
      await loadData('drafts');
    } catch (e: any) {
      setError(e.message || 'Failed to post.');
    }
  };

  const handleCloseIssue = async (number: number) => {
    try {
      await closeIssue(number, '_Resolved by the development team. See linked discussion for details._');
      await loadData('issues');
    } catch (e: any) {
      setError(e.message || 'Failed to close issue.');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Warning banner */}
      <div className="px-3 py-2 bg-yellow-900/20 border-b border-yellow-500/20 text-[10px] text-yellow-300">
        ⚙ Dev Tools — Owner-Only. Changes post directly to GitHub.
      </div>

      {/* Sub-tabs */}
      <div className="flex border-b border-ide-border">
        {(['discussions', 'issues', 'drafts'] as const).map(t => (
          <button
            key={t}
            onClick={() => setDevTab(t)}
            className={`px-3 py-1.5 text-[11px] border-b-2 capitalize transition-colors ${
              devTab === t ? 'border-yellow-400 text-yellow-300' : 'border-transparent text-ide-text-dim'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {error && (
        <div className="mx-3 mt-2 p-2 bg-red-900/20 border border-red-500/30 rounded text-[11px] text-red-300">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex justify-center py-8"><Loader size={16} className="animate-spin text-ide-text-dim" /></div>
        )}

        {/* Open Discussions */}
        {!loading && devTab === 'discussions' && (
          <div className="divide-y divide-ide-border">
            {discussions.length === 0 ? (
              <div className="p-4 text-center text-ide-text-dim text-[12px]">No open discussions.</div>
            ) : discussions.map(d => (
              <div key={d.id} className="px-3 py-2.5">
                <div className="text-[12px] font-medium text-ide-text mb-0.5">#{d.number} {d.title}</div>
                <div className="text-[10px] text-ide-text-dim mb-1.5">
                  @{d.author?.login} · 👍{d.reactions?.totalCount} · 💬{d.comments?.totalCount}
                </div>
                <button
                  onClick={() => handleAnalyze(d)}
                  disabled={analyzing === d.id}
                  className="flex items-center gap-1 text-[11px] px-2.5 py-1 bg-yellow-500/20 text-yellow-300 rounded hover:bg-yellow-500/30 disabled:opacity-50 transition-colors"
                >
                  {analyzing === d.id ? <Loader size={11} className="animate-spin" /> : <TerminalSquare size={11} />}
                  {analyzing === d.id ? 'Analyzing…' : 'Analyze & Draft Fix'}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Open Issues */}
        {!loading && devTab === 'issues' && (
          <div className="divide-y divide-ide-border">
            {issues.length === 0 ? (
              <div className="p-4 text-center text-ide-text-dim text-[12px]">No open issues.</div>
            ) : issues.map(issue => (
              <div key={issue.number} className="px-3 py-2.5">
                <div className="text-[12px] font-medium text-ide-text mb-0.5">#{issue.number} {issue.title}</div>
                <div className="text-[10px] text-ide-text-dim mb-1.5">
                  @{issue.user?.login} · 💬{issue.comments}
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={issue.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-ide-accent hover:underline"
                  >
                    View ↗
                  </a>
                  <button
                    onClick={() => handleCloseIssue(issue.number)}
                    className="text-[10px] px-2 py-0.5 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30 transition-colors"
                  >
                    Close Issue
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Dev Drafts */}
        {!loading && devTab === 'drafts' && (
          <div className="divide-y divide-ide-border">
            {devDrafts.length === 0 ? (
              <div className="p-4 text-center text-ide-text-dim text-[12px]">
                No drafts yet. Analyze a discussion to generate one.
              </div>
            ) : devDrafts.map(draft => (
              <div key={draft.id} className="px-3 py-3">
                <div className="flex items-start gap-2 mb-2">
                  <div className="flex-1">
                    <div className="text-[12px] font-medium text-ide-text">
                      #{draft.discussion_number} {draft.discussion_title}
                    </div>
                    <span className={`text-[10px] px-1.5 py-0 rounded ${draft.status === 'posted' ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                      {draft.status}
                    </span>
                  </div>
                </div>

                {draft.analysis && (
                  <details className="mb-2">
                    <summary className="text-[10px] text-ide-text-dim cursor-pointer hover:text-ide-text">
                      Agent Analysis
                    </summary>
                    <div className="mt-1 text-[11px] text-ide-text whitespace-pre-wrap bg-ide-bg/30 border border-ide-border rounded p-2">
                      {draft.analysis}
                    </div>
                  </details>
                )}

                <div className="text-[10px] text-ide-text-dim mb-1">Draft Response:</div>
                {editingDraft === draft.id ? (
                  <textarea
                    value={draftEdits[draft.id] ?? draft.draft_response}
                    onChange={e => setDraftEdits(prev => ({ ...prev, [draft.id]: e.target.value }))}
                    rows={6}
                    className="w-full text-[11px] bg-ide-bg border border-ide-border rounded p-2 text-ide-text resize-none font-mono focus:outline-none focus:border-ide-accent"
                  />
                ) : (
                  <div className="text-[11px] text-ide-text whitespace-pre-wrap bg-ide-bg/20 border border-ide-border rounded p-2 max-h-40 overflow-y-auto">
                    {draftEdits[draft.id] ?? draft.draft_response || '(empty — edit before posting)'}
                  </div>
                )}

                {draft.status !== 'posted' && (
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => setEditingDraft(editingDraft === draft.id ? null : draft.id)}
                      className="flex items-center gap-1 text-[11px] px-2 py-1 border border-ide-border rounded text-ide-text-dim hover:text-ide-text transition-colors"
                    >
                      <Edit size={11} /> {editingDraft === draft.id ? 'Done Editing' : 'Edit'}
                    </button>
                    <button
                      onClick={() => handlePost(draft)}
                      className="flex items-center gap-1 text-[11px] px-2.5 py-1 bg-green-500/20 text-green-300 rounded hover:bg-green-500/30 transition-colors"
                    >
                      <Send size={11} /> Approve & Post
                    </button>
                  </div>
                )}

                {draft.posted_url && (
                  <a
                    href={draft.posted_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block mt-1 text-[10px] text-ide-accent hover:underline"
                  >
                    View Posted Response ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
