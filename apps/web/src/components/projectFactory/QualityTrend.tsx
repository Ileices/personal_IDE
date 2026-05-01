// ============================================
// QualityTrend
// Per-iteration quality badge row for the active project run.
// Polls /api/project-factory/quality/:projectId and
// reacts to `quality_snapshot` SSE events from the agent stream.
// ============================================
import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import { API_BASE } from '../../config.js';

interface QualitySnapshot {
  id: string;
  iteration: number;
  build_ok: number; // 0/1 from SQLite
  tests_ok: number;
  lint_ok: number;
  error_count: number;
  test_pass_count: number;
  test_fail_count: number;
  files_changed: number;
  tokens_used: number;
  summary: string | null;
  created_at: string;
}

interface Props {
  projectId: string;
  isRunning: boolean;
  runId?: string;
  /** Inbound SSE event payload for real-time updates */
  latestQualityEvent?: {
    type: 'quality_snapshot';
    iteration: number;
    buildOk: boolean;
    testsOk: boolean;
    lintOk: boolean;
    errorCount: number;
    filesChanged: number;
  } | null;
}

function OkBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded font-medium ${
        ok ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'
      }`}
      title={label}
    >
      {ok
        ? <CheckCircle2 className="w-2.5 h-2.5" />
        : <XCircle className="w-2.5 h-2.5" />
      }
      {label}
    </span>
  );
}

export function QualityTrend({ projectId, isRunning, runId, latestQualityEvent }: Props) {
  const [snapshots, setSnapshots] = useState<QualitySnapshot[]>([]);
  const [stats, setStats] = useState<{ total: number; buildsOk: number; testsOk: number; lintOk: number } | null>(null);
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);

  const fetchQuality = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const url = `${API_BASE}/api/project-factory/quality/${projectId}${runId ? `?runId=${runId}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      setSnapshots(data.snapshots || []);
      setStats(data.stats || null);
    } catch { /* best-effort */ }
    finally { setLoading(false); }
  }, [projectId, runId]);

  // Poll when running
  useEffect(() => {
    fetchQuality();
    if (!isRunning) return;
    const id = window.setInterval(fetchQuality, 6_000);
    return () => window.clearInterval(id);
  }, [fetchQuality, isRunning]);

  // React to live SSE quality events
  useEffect(() => {
    if (!latestQualityEvent) return;
    const ev = latestQualityEvent;
    setSnapshots(prev => {
      // Upsert by iteration
      const existing = prev.findIndex(s => s.iteration === ev.iteration);
      const fake: QualitySnapshot = {
        id: `live-${ev.iteration}`,
        iteration: ev.iteration,
        build_ok: ev.buildOk ? 1 : 0,
        tests_ok: ev.testsOk ? 1 : 0,
        lint_ok: ev.lintOk ? 1 : 0,
        error_count: ev.errorCount,
        test_pass_count: 0,
        test_fail_count: 0,
        files_changed: ev.filesChanged,
        tokens_used: 0,
        summary: null,
        created_at: new Date().toISOString(),
      };
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = { ...next[existing], ...fake };
        return next;
      }
      return [...prev, fake].sort((a, b) => a.iteration - b.iteration);
    });
  }, [latestQualityEvent]);

  if (snapshots.length === 0 && !loading) {
    if (!isRunning) return null;
    return (
      <div className="px-3 py-2 text-[10px] text-ide-text-dim italic">
        Quality badges appear after each iteration…
      </div>
    );
  }

  const total = stats?.total ?? snapshots.length;

  return (
    <div className="border-t border-ide-border/40">
      <button
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[10px] font-semibold text-ide-text-dim hover:text-ide-text uppercase tracking-wide"
        onClick={() => setOpen(o => !o)}
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        Quality Trend
        {stats && (
          <span className="ml-1 font-normal normal-case text-[9px]">
            {stats.buildsOk}/{total} builds · {stats.testsOk}/{total} tests
          </span>
        )}
        {loading && isRunning && <Loader2 className="w-2.5 h-2.5 animate-spin ml-auto" />}
      </button>

      {open && (
        <div className="px-2 pb-2">
          {/* Badge row — most recent 20 iterations */}
          <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
            {snapshots.slice(-20).map(s => (
              <div
                key={s.id}
                className="flex flex-col items-center gap-0.5 px-1.5 py-1 rounded border border-ide-border/40 bg-ide-bg/30 min-w-[44px]"
                title={s.summary ?? `Iteration ${s.iteration}`}
              >
                <span className="text-[9px] text-ide-text-dim font-mono">i{s.iteration}</span>
                <div className="flex gap-0.5">
                  <span title="Build" className={`w-2 h-2 rounded-full ${s.build_ok ? 'bg-green-400' : 'bg-red-400'}`} />
                  <span title="Tests" className={`w-2 h-2 rounded-full ${s.tests_ok ? 'bg-green-400' : 'bg-yellow-400'}`} />
                  <span title="Lint" className={`w-2 h-2 rounded-full ${s.lint_ok ? 'bg-green-400' : 'bg-orange-400'}`} />
                </div>
                {s.files_changed > 0 && (
                  <span className="text-[8px] text-ide-text-dim">±{s.files_changed}</span>
                )}
              </div>
            ))}
          </div>
          {/* Legend */}
          <div className="flex gap-2 mt-1 text-[9px] text-ide-text-dim">
            <span><span className="inline-block w-2 h-2 rounded-full bg-green-400 mr-0.5" />pass</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-0.5" />build fail</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-400 mr-0.5" />test warn</span>
          </div>
        </div>
      )}
    </div>
  );
}
