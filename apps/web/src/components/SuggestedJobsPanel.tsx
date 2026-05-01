// ============================================
// Suggested Jobs Panel
// VS Code-style panel with 5 tabs:
//   Jobs | Detail | Sandbox | Crawler | Stats
// ============================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Briefcase, ChevronDown, ChevronRight, RefreshCw, Play, Archive,
  XCircle, CheckCircle, AlertTriangle, Clock, Cpu, BarChart2,
  Terminal, Bug, FlaskConical, Layers, Filter, Search, Plus, Merge,
  StopCircle, Eye, List,
} from 'lucide-react';

const BASE = '/api/suggested-jobs';

// ── Types ────────────────────────────────────
interface JobRecord {
  id: string;
  job_id: string;
  job_category: string;
  source: string;
  source_record_ids: string[];
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  affected_files: string[];
  affected_devtags: string[];
  affected_plantags: string[];
  required_buildtags: string[];
  blocking_jobs: string[];
  blocked_by_jobs: string[];
  hierarchy: Record<string, unknown>;
  atomic_steps: AtomicStep[];
  sandbox_spec: SandboxSpec;
  implementation_status: string;
  created_cycle: number;
  last_updated_cycle: number;
  timestamp: string;
  created_at: string;
}

interface AtomicStep {
  step_id: string;
  step_index: number;
  description: string;
  devtags_required: string[];
  devtags_produced: string[];
  buildtags_required: string[];
  plantag_satisfied: string | null;
  token_budget: number;
  model_tier_minimum: number;
  can_parallelize: boolean;
}

interface SandboxSpec {
  sandbox_id: string | null;
  status: string;
  cycle_limit: number;
  cycles_used: number;
  test_results: unknown[];
  human_review_required: boolean;
  human_review_completed: boolean;
  human_review_notes?: string | null;
}

interface SandboxRun {
  run_id: string;
  job_id: string;
  cycle_number: number;
  stage: string;
  loop_coordinator_decision: string | null;
  timestamp: string;
}

interface CrawlerStatus {
  crawlerState: {
    mode: string;
    current_protocol: number | null;
    last_blame_processed_at: string | null;
    last_independent_run_at: string | null;
    cycle_count: number;
    blame_queue_depth: number;
    jobs_generated_total: number;
    status_message: string | null;
    updated_at: string;
  } | null;
  totalActiveJobs: number;
  suggestedJobs: number;
  sandboxReadyJobs: number;
}

interface StatsData {
  total: number;
  active: number;
  byStatus: { key: string; count: number }[];
  byCategory: { key: string; count: number }[];
  byPriority: { key: string; count: number }[];
  bySource: { key: string; count: number }[];
}

type Tab = 'jobs' | 'detail' | 'sandbox' | 'crawler' | 'stats';

// ── Helpers ──────────────────────────────────
const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border border-red-500/40',
  high:     'bg-orange-500/20 text-orange-400 border border-orange-500/40',
  medium:   'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40',
  low:      'bg-blue-500/20 text-blue-300 border border-blue-500/40',
};

const STATUS_COLORS: Record<string, string> = {
  suggested:     'bg-slate-500/20 text-slate-300',
  sandbox_ready: 'bg-emerald-500/20 text-emerald-400',
  implementing:  'bg-purple-500/20 text-purple-400',
  implemented:   'bg-green-500/20 text-green-400',
  rejected:      'bg-red-500/20 text-red-500',
  archived:      'bg-slate-600/20 text-slate-500',
};

const CATEGORY_LABELS: Record<string, string> = {
  test_missing:           'Missing Test',
  dead_code_removal:      'Dead Code',
  debt_reduction:         'Debt Reduction',
  regression_hardening:   'Regression',
  integration_repair:     'Integration',
  anti_pattern_mitigation:'Anti-Pattern',
  tag_schema_extension:   'Tag Schema',
  performance_test_missing:'Perf Test',
  security_gap:           'Security',
  nano_coverage_gap:      'Nano Coverage',
  model_tool_enhancement: 'Model Tool',
  model_config_promotion: 'Config Promo',
  external_project:       'External',
  user_requested:         'User Request',
  god_factory_scan:       'God Factory',
};

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${PRIORITY_COLORS[priority] || 'bg-slate-600/20 text-slate-400'}`}>
      {priority}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[status] || 'bg-slate-600/20 text-slate-400'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="text-[9px] px-1 py-0.5 rounded bg-ide-accent/10 text-ide-accent border border-ide-accent/20">
      {CATEGORY_LABELS[category] || category}
    </span>
  );
}

function RelativeTime({ ts }: { ts: string }) {
  if (!ts) return null;
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  let label = 'just now';
  if (days > 0) label = `${days}d ago`;
  else if (hrs > 0) label = `${hrs}h ago`;
  else if (mins > 0) label = `${mins}m ago`;
  return <span className="text-ide-text-dim text-[9px]">{label}</span>;
}

// ── API calls ─────────────────────────────────
async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || res.statusText);
  }
  return res.json() as Promise<T>;
}

// ── New Job Dialog ────────────────────────────
function NewJobDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('user_requested');
  const [priority, setPriority] = useState('medium');
  const [files, setFiles] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!title.trim()) { setError('Title required'); return; }
    setLoading(true);
    try {
      await apiFetch('/jobs', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          job_category: category,
          priority,
          affected_files: files.split('\n').map(f => f.trim()).filter(Boolean),
        }),
      });
      onCreated();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-ide-sidebar border border-ide-border rounded-lg shadow-2xl w-full max-w-md p-4">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-ide-text">Create Job</span>
          <button onClick={onClose} className="text-ide-text-dim hover:text-ide-text">
            <XCircle size={16} />
          </button>
        </div>

        {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2 mb-3">{error}</div>}

        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-ide-text-dim uppercase tracking-wider mb-1 block">Title *</label>
            <input
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Describe the job…"
              className="w-full bg-ide-bg border border-ide-border rounded px-2 py-1.5 text-xs text-ide-text outline-none focus:border-ide-accent"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-ide-text-dim uppercase tracking-wider mb-1 block">Category</label>
              <select
                value={category} onChange={e => setCategory(e.target.value)}
                className="w-full bg-ide-bg border border-ide-border rounded px-2 py-1.5 text-xs text-ide-text"
              >
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-ide-text-dim uppercase tracking-wider mb-1 block">Priority</label>
              <select
                value={priority} onChange={e => setPriority(e.target.value)}
                className="w-full bg-ide-bg border border-ide-border rounded px-2 py-1.5 text-xs text-ide-text"
              >
                {['critical','high','medium','low'].map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-ide-text-dim uppercase tracking-wider mb-1 block">Affected Files (one per line)</label>
            <textarea
              value={files} onChange={e => setFiles(e.target.value)}
              rows={3}
              placeholder="src/foo.ts&#10;src/bar.ts"
              className="w-full bg-ide-bg border border-ide-border rounded px-2 py-1.5 text-xs text-ide-text font-mono outline-none focus:border-ide-accent resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="text-xs text-ide-text-dim hover:text-ide-text px-3 py-1.5 rounded hover:bg-ide-hover transition-colors">
            Cancel
          </button>
          <button
            onClick={submit} disabled={loading}
            className="text-xs bg-ide-accent text-white px-3 py-1.5 rounded hover:bg-ide-accent/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating…' : 'Create Job'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Job Row ───────────────────────────────────
function JobRow({
  job, selected, onClick, onAction,
}: {
  job: JobRecord;
  selected: boolean;
  onClick: () => void;
  onAction: (action: string, jobId: string) => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`px-3 py-2 border-b border-ide-border cursor-pointer hover:bg-ide-hover transition-colors ${selected ? 'bg-ide-accent/10 border-l-2 border-l-ide-accent' : ''}`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <PriorityBadge priority={job.priority} />
            <CategoryBadge category={job.job_category} />
            <StatusBadge status={job.implementation_status} />
          </div>
          <div className="text-xs text-ide-text leading-tight truncate" title={job.title}>
            {job.title}
          </div>
          <div className="flex items-center gap-2 mt-1">
            {job.affected_devtags.length > 0 && (
              <span className="text-[9px] text-ide-text-dim">
                {job.affected_devtags.length} devtag{job.affected_devtags.length !== 1 ? 's' : ''}
              </span>
            )}
            {job.affected_files.length > 0 && (
              <span className="text-[9px] text-ide-text-dim">
                {job.affected_files.length} file{job.affected_files.length !== 1 ? 's' : ''}
              </span>
            )}
            <RelativeTime ts={job.created_at} />
          </div>
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          {job.implementation_status === 'suggested' && (
            <button
              onClick={e => { e.stopPropagation(); onAction('implement', job.job_id); }}
              title="Implement"
              className="p-1 rounded hover:bg-green-500/20 text-green-500 hover:text-green-400 transition-colors"
            >
              <Play size={12} />
            </button>
          )}
          {['suggested','sandbox_ready'].includes(job.implementation_status) && (
            <button
              onClick={e => { e.stopPropagation(); onAction('reject', job.job_id); }}
              title="Reject"
              className="p-1 rounded hover:bg-red-500/20 text-red-500 hover:text-red-400 transition-colors"
            >
              <XCircle size={12} />
            </button>
          )}
          {job.implementation_status !== 'archived' && job.implementation_status !== 'implemented' && (
            <button
              onClick={e => { e.stopPropagation(); onAction('archive', job.job_id); }}
              title="Archive"
              className="p-1 rounded hover:bg-slate-500/20 text-slate-400 hover:text-slate-300 transition-colors"
            >
              <Archive size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Jobs Tab ──────────────────────────────────
function JobsTab({
  jobs, loading, total, limit, offset, setOffset, filters, setFilters,
  selectedJobId, setSelectedJobId, onAction, onNewJob, onRefresh,
}: {
  jobs: JobRecord[];
  loading: boolean;
  total: number;
  limit: number;
  offset: number;
  setOffset: (n: number) => void;
  filters: { status: string; priority: string; category: string; search: string };
  setFilters: (f: typeof filters) => void;
  selectedJobId: string | null;
  setSelectedJobId: (id: string | null) => void;
  onAction: (action: string, jobId: string) => void;
  onNewJob: () => void;
  onRefresh: () => void;
}) {
  const [showFilters, setShowFilters] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-ide-border flex-shrink-0">
        <button onClick={onRefresh} title="Refresh" className="p-1 rounded hover:bg-ide-hover text-ide-text-dim hover:text-ide-text transition-colors">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
        <div className="flex-1 flex items-center gap-1 bg-ide-bg border border-ide-border rounded px-1.5 py-0.5">
          <Search size={11} className="text-ide-text-dim flex-shrink-0" />
          <input
            value={filters.search}
            onChange={e => setFilters({ ...filters, search: e.target.value })}
            placeholder="Search jobs…"
            className="flex-1 bg-transparent text-xs text-ide-text outline-none placeholder:text-ide-text-dim"
          />
        </div>
        <button onClick={() => setShowFilters(p => !p)} title="Filters"
          className={`p-1 rounded transition-colors ${showFilters ? 'bg-ide-accent/20 text-ide-accent' : 'hover:bg-ide-hover text-ide-text-dim hover:text-ide-text'}`}>
          <Filter size={13} />
        </button>
        <button onClick={onNewJob} title="New job"
          className="p-1 rounded hover:bg-ide-hover text-ide-text-dim hover:text-ide-text transition-colors">
          <Plus size={13} />
        </button>
      </div>

      {/* filters panel */}
      {showFilters && (
        <div className="px-2 py-2 border-b border-ide-border flex-shrink-0 bg-ide-bg/50 space-y-1.5">
          <div className="grid grid-cols-3 gap-1.5">
            <select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}
              className="bg-ide-bg border border-ide-border rounded px-1.5 py-1 text-[10px] text-ide-text col-span-1">
              <option value="">All statuses</option>
              {['suggested','sandbox_ready','implementing','implemented','rejected','archived'].map(s => (
                <option key={s} value={s}>{s.replace(/_/g,' ')}</option>
              ))}
            </select>
            <select value={filters.priority} onChange={e => setFilters({ ...filters, priority: e.target.value })}
              className="bg-ide-bg border border-ide-border rounded px-1.5 py-1 text-[10px] text-ide-text">
              <option value="">All priorities</option>
              {['critical','high','medium','low'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={filters.category} onChange={e => setFilters({ ...filters, category: e.target.value })}
              className="bg-ide-bg border border-ide-border rounded px-1.5 py-1 text-[10px] text-ide-text">
              <option value="">All categories</option>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <button onClick={() => setFilters({ status: '', priority: '', category: '', search: '' })}
            className="text-[10px] text-ide-text-dim hover:text-ide-text">
            Clear filters
          </button>
        </div>
      )}

      {/* count */}
      <div className="px-3 py-1 text-[10px] text-ide-text-dim border-b border-ide-border flex-shrink-0">
        {total} job{total !== 1 ? 's' : ''}
        {(filters.status || filters.priority || filters.category || filters.search) && ' (filtered)'}
      </div>

      {/* job list */}
      <div className="flex-1 overflow-y-auto">
        {loading && jobs.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-xs text-ide-text-dim">Loading…</div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 gap-2 text-xs text-ide-text-dim">
            <Briefcase size={24} className="opacity-30" />
            <span>No jobs found</span>
          </div>
        ) : (
          jobs.map(job => (
            <JobRow
              key={job.job_id}
              job={job}
              selected={selectedJobId === job.job_id}
              onClick={() => setSelectedJobId(job.job_id)}
              onAction={onAction}
            />
          ))
        )}
      </div>

      {/* pagination */}
      {total > limit && (
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-ide-border flex-shrink-0">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="text-[10px] text-ide-text-dim hover:text-ide-text disabled:opacity-30"
          >
            ← Prev
          </button>
          <span className="text-[10px] text-ide-text-dim">
            {offset + 1}–{Math.min(offset + limit, total)} of {total}
          </span>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            className="text-[10px] text-ide-text-dim hover:text-ide-text disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Detail Tab ────────────────────────────────
function DetailTab({ job, onAction }: { job: JobRecord | null; onAction: (action: string, jobId: string) => void }) {
  const [stepsExpanded, setStepsExpanded] = useState(true);
  const [filesExpanded, setFilesExpanded] = useState(true);

  if (!job) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-xs text-ide-text-dim">
        <Eye size={24} className="opacity-30" />
        <span>Select a job to view details</span>
      </div>
    );
  }

  const hier = job.hierarchy as Record<string, unknown>;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* header */}
      <div className="px-3 py-3 border-b border-ide-border flex-shrink-0">
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <PriorityBadge priority={job.priority} />
          <CategoryBadge category={job.job_category} />
          <StatusBadge status={job.implementation_status} />
        </div>
        <div className="text-xs font-medium text-ide-text leading-snug mb-2">{job.title}</div>

        {/* actions */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {job.implementation_status === 'suggested' && (
            <button
              onClick={() => onAction('sandbox', job.job_id)}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors"
            >
              <FlaskConical size={11} /> Start Sandbox
            </button>
          )}
          {['suggested','sandbox_ready'].includes(job.implementation_status) && (
            <button
              onClick={() => onAction('implement', job.job_id)}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border border-purple-500/30 transition-colors"
            >
              <Play size={11} /> Implement
            </button>
          )}
          {!['rejected','archived','implemented'].includes(job.implementation_status) && (
            <button
              onClick={() => onAction('reject', job.job_id)}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 transition-colors"
            >
              <XCircle size={11} /> Reject
            </button>
          )}
          {!['archived','implemented'].includes(job.implementation_status) && (
            <button
              onClick={() => onAction('archive', job.job_id)}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-slate-600/20 text-slate-400 hover:bg-slate-600/30 border border-slate-600/30 transition-colors"
            >
              <Archive size={11} /> Archive
            </button>
          )}
          {job.sandbox_spec.status !== 'abandoned' && job.implementation_status !== 'implemented' && (
            <button
              onClick={() => onAction('abandon_sandbox', job.job_id)}
              title="Stop sandbox loop and mark as abandoned"
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-slate-700/20 text-slate-500 hover:bg-slate-700/30 border border-slate-700/30 transition-colors"
            >
              <StopCircle size={11} /> Abandon
            </button>
          )}
          <button
            onClick={() => onAction('extend_cycles', job.job_id)}
            title="Extend cycle limit by 50 (user/God Factory only)"
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 border border-cyan-500/30 transition-colors"
          >
            <Plus size={11} /> +50 Cycles
          </button>
        </div>
      </div>

      {/* meta */}
      <div className="px-3 py-2 border-b border-ide-border">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
          <div className="text-ide-text-dim">Source</div>
          <div className="text-ide-text">{job.source.replace(/_/g,' ')}</div>
          <div className="text-ide-text-dim">Phase</div>
          <div className="text-ide-text">{(hier.phase as number) ?? '—'}</div>
          <div className="text-ide-text-dim">Milestone</div>
          <div className="text-ide-text">{(hier.milestone as string) || '—'}</div>
          <div className="text-ide-text-dim">Cycles</div>
          <div className="text-ide-text">{job.last_updated_cycle}</div>
          <div className="text-ide-text-dim">Created</div>
          <div className="text-ide-text"><RelativeTime ts={job.created_at} /></div>
        </div>
      </div>

      {/* sandbox status bar */}
      <div className="px-3 py-2 border-b border-ide-border">
        <div className="text-[10px] text-ide-text-dim uppercase tracking-wider mb-1.5">Sandbox</div>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-ide-bg rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-ide-accent rounded-full transition-all"
              style={{ width: `${Math.min(100, (job.sandbox_spec.cycles_used / Math.max(1, job.sandbox_spec.cycle_limit)) * 100)}%` }}
            />
          </div>
          <span className="text-[9px] text-ide-text-dim flex-shrink-0">
            {job.sandbox_spec.cycles_used}/{job.sandbox_spec.cycle_limit}
          </span>
          <StatusBadge status={job.sandbox_spec.status} />
        </div>
        {job.sandbox_spec.human_review_required && !job.sandbox_spec.human_review_completed && (
          <div className="mt-2 text-[10px] text-yellow-400 flex items-center gap-1">
            <AlertTriangle size={11} /> Human review required
          </div>
        )}
      </div>

      {/* atomic steps */}
      <div className="border-b border-ide-border">
        <button
          onClick={() => setStepsExpanded(p => !p)}
          className="flex items-center gap-1.5 w-full px-3 py-2 hover:bg-ide-hover transition-colors text-[10px] font-semibold uppercase tracking-wider text-ide-text-dim"
        >
          {stepsExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Atomic Steps ({job.atomic_steps.length})
        </button>
        {stepsExpanded && (
          <div className="divide-y divide-ide-border">
            {job.atomic_steps.length === 0 ? (
              <div className="px-4 py-2 text-[10px] text-ide-text-dim">No steps defined</div>
            ) : job.atomic_steps.map((step, i) => (
              <div key={step.step_id || i} className="px-4 py-2 bg-ide-bg/30">
                <div className="text-[10px] text-ide-text leading-snug mb-1">{step.description}</div>
                <div className="flex flex-wrap gap-2 text-[9px] text-ide-text-dim">
                  <span>Budget: {step.token_budget} tok</span>
                  <span>Tier: {step.model_tier_minimum}</span>
                  {step.devtags_required?.length > 0 && (
                    <span>Requires: {step.devtags_required.join(', ')}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* affected files */}
      <div className="border-b border-ide-border">
        <button
          onClick={() => setFilesExpanded(p => !p)}
          className="flex items-center gap-1.5 w-full px-3 py-2 hover:bg-ide-hover transition-colors text-[10px] font-semibold uppercase tracking-wider text-ide-text-dim"
        >
          {filesExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Affected Files ({job.affected_files.length})
        </button>
        {filesExpanded && (
          <div className="px-4 py-2 space-y-0.5">
            {job.affected_files.length === 0 ? (
              <span className="text-[10px] text-ide-text-dim">None specified</span>
            ) : job.affected_files.map(f => (
              <div key={f} className="text-[10px] text-ide-text font-mono truncate" title={f}>{f}</div>
            ))}
          </div>
        )}
      </div>

      {/* devtags */}
      {job.affected_devtags.length > 0 && (
        <div className="px-3 py-2 border-b border-ide-border">
          <div className="text-[10px] text-ide-text-dim uppercase tracking-wider mb-1.5">Affected Devtags</div>
          <div className="flex flex-wrap gap-1">
            {job.affected_devtags.map(dt => (
              <span key={dt} className="text-[9px] bg-ide-bg border border-ide-border rounded px-1 py-0.5 text-ide-text font-mono">{dt}</span>
            ))}
          </div>
        </div>
      )}

      {/* blocking / blocked-by */}
      {(job.blocking_jobs.length > 0 || job.blocked_by_jobs.length > 0) && (
        <div className="px-3 py-2 border-b border-ide-border">
          {job.blocking_jobs.length > 0 && (
            <div className="mb-2">
              <div className="text-[10px] text-ide-text-dim uppercase tracking-wider mb-1">Blocking</div>
              {job.blocking_jobs.map(jid => (
                <div key={jid} className="text-[10px] font-mono text-ide-text">{jid}</div>
              ))}
            </div>
          )}
          {job.blocked_by_jobs.length > 0 && (
            <div>
              <div className="text-[10px] text-ide-text-dim uppercase tracking-wider mb-1">Blocked By</div>
              {job.blocked_by_jobs.map(jid => (
                <div key={jid} className="text-[10px] font-mono text-ide-text">{jid}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sandbox Tab ───────────────────────────────
function SandboxTab({ selectedJobId }: { selectedJobId: string | null }) {
  const [runs, setRuns] = useState<SandboxRun[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!selectedJobId) return;
    setLoading(true);
    try {
      const data = await apiFetch<{ runs: SandboxRun[] }>(`/sandbox-runs?job_id=${selectedJobId}`);
      setRuns(data.runs);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [selectedJobId]);

  useEffect(() => { load(); }, [load]);

  const STAGE_COLORS: Record<string, string> = {
    building: 'text-yellow-400',
    testing: 'text-blue-400',
    review: 'text-purple-400',
    debug: 'text-orange-400',
    complete: 'text-green-400',
    failed: 'text-red-400',
    ready: 'text-emerald-400',
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-ide-border flex-shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ide-text-dim">
          Sandbox Cycles {selectedJobId ? '' : '— select a job'}
        </span>
        <button onClick={load} className="p-1 rounded hover:bg-ide-hover text-ide-text-dim hover:text-ide-text transition-colors">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!selectedJobId ? (
          <div className="flex items-center justify-center h-24 text-xs text-ide-text-dim">Select a job in the Jobs tab</div>
        ) : loading && runs.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-xs text-ide-text-dim">Loading…</div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 gap-2 text-xs text-ide-text-dim">
            <Terminal size={20} className="opacity-30" />
            <span>No sandbox cycles yet</span>
          </div>
        ) : (
          <div>
            {runs.map(run => (
              <div key={run.run_id} className="px-3 py-2 border-b border-ide-border">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-ide-text-dim">Cycle {run.cycle_number}</span>
                  <span className={`text-[10px] font-mono ${STAGE_COLORS[run.stage] || 'text-ide-text'}`}>
                    {run.stage}
                  </span>
                </div>
                {run.loop_coordinator_decision && (
                  <div className="text-[9px] text-ide-text-dim mt-0.5">{run.loop_coordinator_decision}</div>
                )}
                <RelativeTime ts={run.timestamp} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Crawler Tab ───────────────────────────────
function CrawlerTab() {
  const [status, setStatus] = useState<CrawlerStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [ticking, setTicking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<CrawlerStatus>('/crawler/status');
      setStatus(data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const triggerTick = async () => {
    setTicking(true);
    try {
      await apiFetch('/crawler/tick', { method: 'POST' });
      await load();
    } catch { /* ignore */ } finally {
      setTicking(false);
    }
  };

  const cs = status?.crawlerState;

  const MODE_COLORS: Record<string, string> = {
    idle: 'text-slate-400',
    blame_driven: 'text-orange-400',
    independent: 'text-green-400',
    paused: 'text-yellow-400',
  };

  const PROTOCOL_NAMES: Record<number, string> = {
    1: 'Missing Tests',
    2: 'Dead Code',
    3: 'Debt Violations',
    4: 'Regression Clusters',
    5: 'Integration Failures',
    6: 'Anti-Patterns',
    7: 'Vocabulary Gaps',
    8: 'Perf Gaps',
    9: 'Security Gaps',
    10: 'Nano Coverage',
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-ide-border flex-shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ide-text-dim">Crawler Status</span>
        <div className="flex items-center gap-1">
          <button
            onClick={triggerTick}
            disabled={ticking}
            title="Run one crawler tick now"
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-ide-accent/20 text-ide-accent hover:bg-ide-accent/30 transition-colors disabled:opacity-50"
          >
            <Play size={10} className={ticking ? 'animate-pulse' : ''} />
            Tick
          </button>
          <button onClick={load} className="p-1 rounded hover:bg-ide-hover text-ide-text-dim hover:text-ide-text transition-colors">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {cs ? (
        <div className="p-3 space-y-4">
          {/* mode indicator */}
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cs.mode === 'blame_driven' ? 'bg-orange-400 animate-pulse' : cs.mode === 'independent' ? 'bg-green-400 animate-pulse' : 'bg-slate-500'}`} />
            <span className={`text-sm font-semibold ${MODE_COLORS[cs.mode] || 'text-ide-text'}`}>
              {cs.mode.replace(/_/g, ' ').toUpperCase()}
            </span>
          </div>

          {cs.status_message && (
            <div className="text-[10px] text-ide-text-dim bg-ide-bg border border-ide-border rounded p-2">
              {cs.status_message}
            </div>
          )}

          {/* stats grid */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Cycles Run', value: cs.cycle_count },
              { label: 'Jobs Generated', value: cs.jobs_generated_total },
              { label: 'Blame Queue', value: cs.blame_queue_depth },
              { label: 'Active Protocol', value: cs.current_protocol ? `${cs.current_protocol} — ${PROTOCOL_NAMES[cs.current_protocol] || ''}` : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-ide-bg border border-ide-border rounded p-2">
                <div className="text-[9px] text-ide-text-dim uppercase tracking-wider mb-0.5">{label}</div>
                <div className="text-sm font-semibold text-ide-text">{String(value)}</div>
              </div>
            ))}
          </div>

          {/* timing */}
          <div>
            <div className="text-[10px] text-ide-text-dim uppercase tracking-wider mb-2">Timing</div>
            <div className="space-y-1 text-[10px]">
              {[
                { label: 'Last Blame Run', ts: cs.last_blame_processed_at },
                { label: 'Last Independent Run', ts: cs.last_independent_run_at },
                { label: 'State Updated', ts: cs.updated_at },
              ].map(({ label, ts }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-ide-text-dim">{label}</span>
                  {ts ? <RelativeTime ts={ts} /> : <span className="text-ide-text-dim">—</span>}
                </div>
              ))}
            </div>
          </div>

          {/* job summary */}
          <div>
            <div className="text-[10px] text-ide-text-dim uppercase tracking-wider mb-2">Job Summary</div>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: 'Total Active', value: status?.totalActiveJobs ?? 0, color: 'text-ide-text' },
                { label: 'Suggested', value: status?.suggestedJobs ?? 0, color: 'text-yellow-400' },
                { label: 'Ready', value: status?.sandboxReadyJobs ?? 0, color: 'text-emerald-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-ide-bg border border-ide-border rounded p-1.5 text-center">
                  <div className={`text-base font-bold ${color}`}>{value}</div>
                  <div className="text-[9px] text-ide-text-dim">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* protocol list */}
          <div>
            <div className="text-[10px] text-ide-text-dim uppercase tracking-wider mb-2">Protocols</div>
            <div className="space-y-1">
              {Object.entries(PROTOCOL_NAMES).map(([num, name]) => (
                <div
                  key={num}
                  className={`flex items-center gap-2 text-[10px] px-2 py-1 rounded ${cs.current_protocol === parseInt(num) ? 'bg-ide-accent/10 text-ide-accent' : 'text-ide-text-dim'}`}
                >
                  <span className="w-4 text-center font-mono">{num}</span>
                  <span>{name}</span>
                  {cs.current_protocol === parseInt(num) && (
                    <span className="ml-auto text-[9px] bg-ide-accent/20 px-1 rounded">active</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center h-24 text-xs text-ide-text-dim">Loading…</div>
      ) : (
        <div className="flex flex-col items-center justify-center h-24 gap-2 text-xs text-ide-text-dim">
          <AlertTriangle size={20} className="opacity-30" />
          <span>Could not load crawler state</span>
        </div>
      )}
    </div>
  );
}

// ── Stats Tab ─────────────────────────────────
function StatsTab() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<StatsData>('/jobs/stats');
      setStats(data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function BarList({ items, maxValue }: { items: { key: string; count: number }[]; maxValue: number }) {
    return (
      <div className="space-y-1.5">
        {items.map(item => (
          <div key={item.key} className="flex items-center gap-2">
            <div className="w-28 text-[9px] text-ide-text-dim truncate flex-shrink-0 text-right" title={item.key}>
              {CATEGORY_LABELS[item.key] || item.key.replace(/_/g,' ')}
            </div>
            <div className="flex-1 bg-ide-bg rounded-full h-3 overflow-hidden border border-ide-border">
              <div
                className="h-full bg-ide-accent/60 rounded-full transition-all"
                style={{ width: `${(item.count / Math.max(1, maxValue)) * 100}%` }}
              />
            </div>
            <span className="text-[9px] text-ide-text w-6 text-right flex-shrink-0">{item.count}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-ide-border flex-shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ide-text-dim">Statistics</span>
        <button onClick={load} className="p-1 rounded hover:bg-ide-hover text-ide-text-dim hover:text-ide-text transition-colors">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {stats ? (
        <div className="p-3 space-y-5">
          {/* totals */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Total Jobs', value: stats.total, color: 'text-ide-text' },
              { label: 'Active Jobs', value: stats.active, color: 'text-ide-accent' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-ide-bg border border-ide-border rounded p-3 text-center">
                <div className={`text-2xl font-bold ${color}`}>{value}</div>
                <div className="text-[9px] text-ide-text-dim mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {/* by priority */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ide-text-dim mb-2">By Priority</div>
            <div className="grid grid-cols-4 gap-1.5">
              {stats.byPriority.map(({ key, count }) => (
                <div key={key} className="rounded p-2 text-center border border-ide-border bg-ide-bg">
                  <div className={`text-base font-bold ${PRIORITY_COLORS[key]?.split(' ')[1] || 'text-ide-text'}`}>{count}</div>
                  <div className="text-[8px] text-ide-text-dim capitalize mt-0.5">{key}</div>
                </div>
              ))}
            </div>
          </div>

          {/* by status */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ide-text-dim mb-2">By Status</div>
            <BarList
              items={stats.byStatus}
              maxValue={Math.max(...stats.byStatus.map(s => s.count), 1)}
            />
          </div>

          {/* by category */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ide-text-dim mb-2">By Category</div>
            <BarList
              items={stats.byCategory.slice(0, 10)}
              maxValue={Math.max(...stats.byCategory.map(s => s.count), 1)}
            />
          </div>

          {/* by source */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ide-text-dim mb-2">By Source</div>
            <BarList
              items={stats.bySource}
              maxValue={Math.max(...stats.bySource.map(s => s.count), 1)}
            />
          </div>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center h-24 text-xs text-ide-text-dim">Loading…</div>
      ) : (
        <div className="flex flex-col items-center justify-center h-24 gap-2 text-xs text-ide-text-dim">
          <BarChart2 size={20} className="opacity-30" />
          <span>No stats available</span>
        </div>
      )}
    </div>
  );
}

// ── Main Panel ────────────────────────────────
export function SuggestedJobsPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('jobs');
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 30;
  const [filters, setFilters] = useState({ status: '', priority: '', category: '', search: '' });
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobRecord | null>(null);
  const [showNewJob, setShowNewJob] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadJobs = useCallback(async (currentOffset = offset) => {
    setLoadingJobs(true);
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(currentOffset) });
      if (filters.status) params.set('status', filters.status);
      if (filters.priority) params.set('priority', filters.priority);
      if (filters.category) params.set('category', filters.category);
      if (filters.search) params.set('search', filters.search);

      const data = await apiFetch<{ jobs: JobRecord[]; total: number }>(`/jobs?${params}`);
      setJobs(data.jobs);
      setTotal(data.total);
    } catch { /* ignore */ } finally {
      setLoadingJobs(false);
    }
  }, [filters, offset]);

  // Debounce filter changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setOffset(0);
      loadJobs(0);
    }, 300);
  }, [filters]);

  useEffect(() => { loadJobs(offset); }, [offset]);

  // Load selected job detail
  useEffect(() => {
    if (!selectedJobId) { setSelectedJob(null); return; }
    apiFetch<{ job: JobRecord }>(`/jobs/${selectedJobId}`)
      .then(d => setSelectedJob(d.job))
      .catch(() => setSelectedJob(null));
  }, [selectedJobId]);

  const handleAction = useCallback(async (action: string, jobId: string) => {
    setActionLoading(true);
    try {
      if (action === 'reject') {
        await apiFetch(`/jobs/${jobId}/reject`, { method: 'POST' });
      } else if (action === 'archive') {
        await apiFetch(`/jobs/${jobId}/archive`, { method: 'POST' });
      } else if (action === 'implement') {
        await apiFetch(`/jobs/${jobId}/implement`, { method: 'POST', body: JSON.stringify({ override_sandbox: true }) });
      } else if (action === 'sandbox') {
        await apiFetch(`/jobs/${jobId}/sandbox/start`, { method: 'POST' });
        setActiveTab('sandbox');
      } else if (action === 'abandon_sandbox') {
        await apiFetch(`/jobs/${jobId}/sandbox/abandon`, { method: 'POST' });
      } else if (action === 'extend_cycles') {
        await apiFetch(`/jobs/${jobId}/sandbox/extend-cycle-limit`, {
          method: 'POST',
          body: JSON.stringify({ extend_by: 50 }),
        });
      }
      await loadJobs(offset);
      if (selectedJobId === jobId) {
        const updated = await apiFetch<{ job: JobRecord }>(`/jobs/${jobId}`);
        setSelectedJob(updated.job);
      }
    } catch { /* ignore */ } finally {
      setActionLoading(false);
    }
  }, [loadJobs, offset, selectedJobId]);

  const handleJobSelect = (jobId: string | null) => {
    setSelectedJobId(jobId);
    if (jobId && activeTab === 'jobs') setActiveTab('detail');
  };

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'jobs',    label: 'Jobs',    icon: List },
    { id: 'detail',  label: 'Detail',  icon: Eye },
    { id: 'sandbox', label: 'Sandbox', icon: FlaskConical },
    { id: 'crawler', label: 'Crawler', icon: Cpu },
    { id: 'stats',   label: 'Stats',   icon: BarChart2 },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* header */}
      <div className="flex items-center h-9 px-3 border-b border-ide-border flex-shrink-0">
        <Briefcase size={13} className="text-ide-accent mr-2 flex-shrink-0" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ide-text-dim flex-1 truncate">
          Suggested Jobs
        </span>
        {actionLoading && (
          <RefreshCw size={12} className="text-ide-accent animate-spin mr-1" />
        )}
      </div>

      {/* tab bar */}
      <div className="flex border-b border-ide-border flex-shrink-0 overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium whitespace-nowrap transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'border-ide-accent text-ide-accent'
                  : 'border-transparent text-ide-text-dim hover:text-ide-text'
              }`}
            >
              <Icon size={11} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'jobs' && (
          <JobsTab
            jobs={jobs}
            loading={loadingJobs}
            total={total}
            limit={limit}
            offset={offset}
            setOffset={setOffset}
            filters={filters}
            setFilters={setFilters}
            selectedJobId={selectedJobId}
            setSelectedJobId={handleJobSelect}
            onAction={handleAction}
            onNewJob={() => setShowNewJob(true)}
            onRefresh={() => loadJobs(offset)}
          />
        )}
        {activeTab === 'detail' && (
          <DetailTab job={selectedJob} onAction={handleAction} />
        )}
        {activeTab === 'sandbox' && (
          <SandboxTab selectedJobId={selectedJobId} />
        )}
        {activeTab === 'crawler' && <CrawlerTab />}
        {activeTab === 'stats' && <StatsTab />}
      </div>

      {showNewJob && (
        <NewJobDialog
          onClose={() => setShowNewJob(false)}
          onCreated={() => loadJobs(0)}
        />
      )}
    </div>
  );
}
