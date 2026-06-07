// ============================================
// Silicon Factory Panel — Job Pipeline Kanban
//
// 6-stage Kanban view of the Suggested Jobs pipeline:
//   suggested → sandbox_ready → implementing → implemented → rejected/archived
//
// Also shows:
//   - Auto-complete loop status and controls
//   - Per-stage job counts
//   - Community crawler feed
//   - Quick job verify / approve / reject
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import {
  Factory, Play, Pause, StopCircle, RefreshCw, CheckCircle2,
  XCircle, Clock, Loader2, AlertTriangle, ChevronDown, ChevronUp,
  Users, Bug, Wrench, Shield, Zap,
} from 'lucide-react';

const API_BASE = (import.meta as any).env?.VITE_API_URL || '';

// ── Types ───────────────────────────────────

interface Job {
  job_id: string;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  job_category: string;
  implementation_status: string;
  source: string;
  created_cycle: number;
}

interface AutoCompleteState {
  status: 'idle' | 'running' | 'paused' | 'stopped';
  current_job_id: string | null;
  completed_count: number;
  failed_count: number;
  consecutive_failures: number;
  started_at: string | null;
  paused_at: string | null;
  pause_reason: string | null;
  updated_at: string;
}

interface LoopState {
  state: AutoCompleteState;
}

interface JobStats {
  total: number;
  active: number;
  byStatus: Array<{ key: string; count: number }>;
  byCategory: Array<{ key: string; count: number }>;
  byPriority: Array<{ key: string; count: number }>;
}

// ── Helpers ─────────────────────────────────

const STAGE_COLORS: Record<string, string> = {
  suggested:     'text-sky-400 bg-sky-900/20 border-sky-700/40',
  sandbox_ready: 'text-violet-400 bg-violet-900/20 border-violet-700/40',
  implementing:  'text-amber-400 bg-amber-900/20 border-amber-700/40',
  implemented:   'text-emerald-400 bg-emerald-900/20 border-emerald-700/40',
  rejected:      'text-red-400 bg-red-900/20 border-red-700/40',
  archived:      'text-gray-500 bg-gray-900/20 border-gray-700/40',
};

const PRIORITY_DOTS: Record<string, string> = {
  critical: 'bg-red-500',
  high:     'bg-orange-500',
  medium:   'bg-yellow-500',
  low:      'bg-gray-500',
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  test_missing:     <Bug className="w-3 h-3" />,
  security_gap:     <Shield className="w-3 h-3" />,
  performance_test_missing: <Zap className="w-3 h-3" />,
  user_requested:   <Users className="w-3 h-3" />,
};

const PIPELINE_STAGES = [
  { key: 'suggested',     label: 'Suggested' },
  { key: 'sandbox_ready', label: 'Sandbox Ready' },
  { key: 'implementing',  label: 'Implementing' },
  { key: 'implemented',   label: 'Done' },
  { key: 'rejected',      label: 'Rejected' },
];

// ── Sub-components ───────────────────────────

function JobCard({ job, onVerify, onReject }: { job: Job; onVerify: (id: string) => void; onReject: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded border p-2 mb-1 text-xs ${STAGE_COLORS[job.implementation_status] || 'border-gray-700/40'}`}>
      <div className="flex items-start gap-1">
        <span className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${PRIORITY_DOTS[job.priority] || 'bg-gray-500'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            {CATEGORY_ICONS[job.job_category]}
            <span className="font-medium truncate">{job.title}</span>
            <button onClick={() => setExpanded(e => !e)} className="ml-auto text-gray-500 hover:text-gray-300 flex-shrink-0">
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
          {expanded && (
            <p className="mt-1 text-gray-400 text-[10px] leading-relaxed whitespace-pre-wrap break-words">
              {job.description?.slice(0, 200)}{(job.description?.length ?? 0) > 200 ? '…' : ''}
            </p>
          )}
          <div className="mt-1 flex items-center gap-1">
            <span className="px-1 rounded bg-black/20 text-[9px] text-gray-500">{job.source}</span>
            {job.implementation_status === 'implementing' && (
              <button onClick={() => onVerify(job.job_id)} className="px-1.5 py-0.5 rounded bg-emerald-800/40 hover:bg-emerald-700/60 text-emerald-300 text-[9px] flex items-center gap-0.5">
                <CheckCircle2 className="w-2.5 h-2.5" /> Verify
              </button>
            )}
            {job.implementation_status === 'suggested' && (
              <button onClick={() => onReject(job.job_id)} className="px-1.5 py-0.5 rounded bg-red-800/30 hover:bg-red-700/50 text-red-400 text-[9px] flex items-center gap-0.5">
                <XCircle className="w-2.5 h-2.5" /> Reject
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoopStatusBadge({ status }: { status: AutoCompleteState['status'] }) {
  if (status === 'running') return <span className="flex items-center gap-1 text-emerald-400 text-xs"><Loader2 className="w-3 h-3 animate-spin" /> Running</span>;
  if (status === 'paused') return <span className="flex items-center gap-1 text-amber-400 text-xs"><Pause className="w-3 h-3" /> Paused</span>;
  return <span className="flex items-center gap-1 text-gray-400 text-xs"><StopCircle className="w-3 h-3" /> Idle</span>;
}

// ── Main Panel ───────────────────────────────

export function SiliconFactoryPanel() {
  const [stats, setStats] = useState<JobStats | null>(null);
  const [jobsByStage, setJobsByStage] = useState<Record<string, Job[]>>({});
  const [loopState, setLoopState] = useState<AutoCompleteState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, loopRes] = await Promise.all([
        fetch(`${API_BASE}/api/suggested-jobs/jobs/stats`),
        fetch(`${API_BASE}/api/suggested-jobs/auto-complete/status`),
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (loopRes.ok) {
        const l: LoopState = await loopRes.json();
        setLoopState(l.state as AutoCompleteState);
      }

      // Fetch jobs per stage (limit 20 each)
      const stages: Record<string, Job[]> = {};
      await Promise.all(PIPELINE_STAGES.map(async ({ key }) => {
        try {
          const r = await fetch(`${API_BASE}/api/suggested-jobs/jobs?status=${key}&limit=20`);
          if (r.ok) { const d = await r.json(); stages[key] = d.jobs || []; }
          else stages[key] = [];
        } catch { stages[key] = []; }
      }));
      setJobsByStage(stages);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const controlLoop = async (action: 'start' | 'pause' | 'stop') => {
    await fetch(`${API_BASE}/api/suggested-jobs/auto-complete/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    setTimeout(fetchData, 500);
  };

  const verifyJob = async (jobId: string) => {
    setVerifyingId(jobId);
    try {
      await fetch(`${API_BASE}/api/suggested-jobs/jobs/${jobId}/verify`, { method: 'POST' });
      await fetchData();
    } finally {
      setVerifyingId(null);
    }
  };

  const rejectJob = async (jobId: string) => {
    await fetch(`${API_BASE}/api/suggested-jobs/jobs/${jobId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ implementation_status: 'rejected' }) });
    await fetchData();
  };

  const isRunning = loopState?.status === 'running';
  const isPaused  = loopState?.status === 'paused';

  return (
    <div className="flex flex-col h-full bg-ide-panel text-ide-text text-xs overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-ide-border flex-shrink-0">
        <Factory className="w-4 h-4 text-violet-400" />
        <span className="font-semibold text-violet-300 uppercase tracking-wider text-[11px]">Silicon Factory</span>
        <button onClick={fetchData} disabled={loading} className="ml-auto text-gray-500 hover:text-gray-300 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="px-3 py-2 bg-red-900/30 text-red-400 border-b border-red-800/40 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* Auto-Complete Loop Controls */}
        <div className="px-3 py-2 border-b border-ide-border/50">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-gray-400 font-medium">Auto-Complete Loop</span>
            {loopState && <LoopStatusBadge status={loopState.status} />}
          </div>
          <div className="flex items-center gap-2">
            {!isRunning && (
              <button onClick={() => controlLoop('start')} className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-800/40 hover:bg-emerald-700/60 text-emerald-300 transition-colors">
                <Play className="w-3 h-3" /> Start
              </button>
            )}
            {isRunning && (
              <button onClick={() => controlLoop('pause')} className="flex items-center gap-1 px-2 py-1 rounded bg-amber-800/40 hover:bg-amber-700/60 text-amber-300 transition-colors">
                <Pause className="w-3 h-3" /> Pause
              </button>
            )}
            {(isRunning || isPaused) && (
              <button onClick={() => controlLoop('stop')} className="flex items-center gap-1 px-2 py-1 rounded bg-red-900/40 hover:bg-red-800/60 text-red-400 transition-colors">
                <StopCircle className="w-3 h-3" /> Stop
              </button>
            )}
            {loopState && (
              <div className="ml-auto flex items-center gap-3 text-gray-500">
                <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" />{loopState.completed_count}</span>
                <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-red-500" />{loopState.failed_count}</span>
                {(loopState.consecutive_failures ?? 0) >= 2 && (
                  <span className="flex items-center gap-1 text-amber-400"><AlertTriangle className="w-3 h-3" />{loopState.consecutive_failures} fail streak</span>
                )}
              </div>
            )}
          </div>
          {loopState?.pause_reason && (
            <p className="mt-1 text-amber-400 text-[10px]">Paused: {loopState.pause_reason}</p>
          )}
        </div>

        {/* Stats Summary */}
        {stats && (
          <div className="px-3 py-2 border-b border-ide-border/50">
            <div className="flex items-center gap-4">
              <span className="text-gray-400">Total: <span className="text-gray-200 font-medium">{stats.total}</span></span>
              <span className="text-gray-400">Active: <span className="text-amber-300 font-medium">{stats.active}</span></span>
            </div>
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              {stats.byStatus?.map(({ key, count }) => count > 0 && (
                <span key={key} className={`px-1.5 py-0.5 rounded border text-[10px] ${STAGE_COLORS[key] || 'border-gray-700/40'}`}>
                  {key}: {count}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Kanban Pipeline */}
        <div className="px-3 py-2">
          <h3 className="text-gray-400 font-medium mb-2 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> Pipeline
          </h3>
          <div className="space-y-3">
            {PIPELINE_STAGES.map(({ key, label }) => {
              const jobs = jobsByStage[key] || [];
              const stageClass = STAGE_COLORS[key] || 'border-gray-700/40';
              return (
                <div key={key}>
                  <div className={`flex items-center gap-2 px-2 py-1 rounded-t border-l-2 border-t border-r ${stageClass} bg-black/10`}>
                    <span className="font-medium">{label}</span>
                    <span className="ml-auto text-[10px] text-gray-500">{jobs.length} jobs</span>
                  </div>
                  <div className={`border-l-2 border-b border-r rounded-b px-2 py-1 ${stageClass} bg-black/5 min-h-[40px]`}>
                    {jobs.length === 0 ? (
                      <p className="text-gray-600 text-[10px] italic py-1">No jobs in this stage</p>
                    ) : (
                      jobs.slice(0, 8).map(job => (
                        <JobCard
                          key={job.job_id}
                          job={job}
                          onVerify={verifyJob}
                          onReject={rejectJob}
                        />
                      ))
                    )}
                    {jobs.length > 8 && (
                      <p className="text-gray-600 text-[10px] text-center py-1">+{jobs.length - 8} more — see Suggested Jobs panel</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
