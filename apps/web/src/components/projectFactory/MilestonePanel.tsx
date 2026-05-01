// ============================================
// MilestonePanel
// Renders structured loop milestones for the active project run.
// Polls /api/project-factory/milestones/:projectId every 4s while running.
// ============================================
import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, Circle, Loader2, XCircle, ChevronRight, ChevronDown } from 'lucide-react';
import { API_BASE } from '../../config.js';

type MilestoneStatus = 'pending' | 'in_progress' | 'complete' | 'failed';

interface Milestone {
  id: string;
  parent_id: string | null;
  title: string;
  detail: string | null;
  status: MilestoneStatus;
  source: string | null;
  iteration: number;
  files_changed: number;
  created_at: string;
  updated_at: string;
}

interface Props {
  projectId: string;
  isRunning: boolean;
  /** If provided, poll for this specific run; otherwise picks the latest */
  runId?: string;
}

const STATUS_ICON: Record<MilestoneStatus, React.ReactNode> = {
  pending: <Circle className="w-3 h-3 text-ide-text-dim flex-shrink-0" />,
  in_progress: <Loader2 className="w-3 h-3 text-blue-400 animate-spin flex-shrink-0" />,
  complete: <CheckCircle2 className="w-3 h-3 text-green-400 flex-shrink-0" />,
  failed: <XCircle className="w-3 h-3 text-red-400 flex-shrink-0" />,
};

const STATUS_COLOR: Record<MilestoneStatus, string> = {
  pending: 'text-ide-text-dim',
  in_progress: 'text-blue-300',
  complete: 'text-green-300',
  failed: 'text-red-300',
};

export function MilestonePanel({ projectId, isRunning, runId }: Props) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(true);

  const fetchMilestones = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const url = `${API_BASE}/api/project-factory/milestones/${projectId}${runId ? `?runId=${runId}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      setMilestones(data.milestones || []);
    } catch { /* best-effort */ }
    finally { setLoading(false); }
  }, [projectId, runId]);

  // Poll while running
  useEffect(() => {
    fetchMilestones();
    if (!isRunning) return;
    const id = window.setInterval(fetchMilestones, 4_000);
    return () => window.clearInterval(id);
  }, [fetchMilestones, isRunning]);

  if (milestones.length === 0 && !loading) {
    if (!isRunning) return null;
    return (
      <div className="px-3 py-2 text-[10px] text-ide-text-dim italic">
        Milestones will appear once the loop starts…
      </div>
    );
  }

  // Build simple tree (parent-child)
  const rootMilestones = milestones.filter(m => !m.parent_id);
  const childrenOf = (id: string) => milestones.filter(m => m.parent_id === id);

  const renderMilestone = (m: Milestone, depth = 0) => {
    const children = childrenOf(m.id);
    const isCollapsed = collapsed.has(m.id);
    return (
      <div key={m.id} style={{ paddingLeft: depth * 12 }}>
        <div className={`flex items-start gap-1.5 py-0.5 group ${STATUS_COLOR[m.status]}`}>
          {children.length > 0 ? (
            <button
              className="flex-shrink-0 mt-0.5"
              onClick={() => setCollapsed(prev => {
                const next = new Set(prev);
                if (next.has(m.id)) next.delete(m.id); else next.add(m.id);
                return next;
              })}
            >
              {isCollapsed
                ? <ChevronRight className="w-3 h-3 text-ide-text-dim" />
                : <ChevronDown className="w-3 h-3 text-ide-text-dim" />
              }
            </button>
          ) : (
            <span className="flex-shrink-0 mt-0.5">{STATUS_ICON[m.status]}</span>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] leading-snug truncate" title={m.title}>{m.title}</div>
            {m.detail && !isCollapsed && (
              <div className="text-[9px] text-ide-text-dim leading-tight mt-0.5 line-clamp-2">{m.detail}</div>
            )}
          </div>
          {m.files_changed > 0 && (
            <span className="text-[9px] text-ide-text-dim flex-shrink-0">±{m.files_changed}</span>
          )}
          <span className="text-[9px] text-ide-text-dim flex-shrink-0 opacity-0 group-hover:opacity-100">
            i{m.iteration}
          </span>
        </div>
        {!isCollapsed && children.map(c => renderMilestone(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className="border-t border-ide-border/40">
      <button
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[10px] font-semibold text-ide-text-dim hover:text-ide-text uppercase tracking-wide"
        onClick={() => setOpen(o => !o)}
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        Milestones
        <span className="ml-auto font-normal normal-case">{milestones.length} tracked</span>
        {loading && isRunning && <Loader2 className="w-2.5 h-2.5 animate-spin ml-1" />}
      </button>
      {open && (
        <div className="px-2 pb-2 max-h-56 overflow-y-auto space-y-px">
          {rootMilestones.length === 0
            ? <div className="text-[9px] text-ide-text-dim italic px-1 py-1">No milestones yet</div>
            : rootMilestones.map(m => renderMilestone(m))
          }
        </div>
      )}
    </div>
  );
}
