// ============================================
// GodFactoryRightPanel — Intel Panel for The God Factory
// Collapsible sidebar with: Notifications, Suggested Jobs,
// Codebase Health snapshot, and Brainstorm Pad.
// ============================================
import React, { useState, useEffect } from 'react';
import {
  Zap, ChevronDown, ChevronRight, ChevronLeft,
  AlertTriangle, Star, Shield, Sparkles, Send, X, SlidersHorizontal, Play,
} from 'lucide-react';
import { API_BASE } from '../../config.js';

export interface SuggestedJob {
  id: string;
  title: string;
  category: string;
  priority: 'high' | 'medium' | 'low';
  source: string;
  description: string;
}

export interface IntelNotification {
  id: string;
  type: 'info' | 'warning' | 'success' | 'error';
  message: string;
  timestamp: string;
  source: string;
}

export const DEMO_JOBS: SuggestedJob[] = [
  {
    id: '1',
    title: 'Fix agent loop spec-reading',
    category: 'agent',
    priority: 'high',
    source: 'Blame Crawler',
    description: 'Inject spec file content at agent start to prevent generic scaffold output',
  },
  {
    id: '2',
    title: 'Add per-model quality tracking',
    category: 'model_tool_enhancement',
    priority: 'medium',
    source: 'God Factory',
    description: 'Track quality scores per model per interaction type',
  },
  {
    id: '3',
    title: 'Memory tab isolation per agent',
    category: 'memory',
    priority: 'medium',
    source: 'God Factory',
    description: 'Each agent gets its own isolated memory view',
  },
];

// ── Component ─────────────────────────────────
interface Props {
  codebaseReady: boolean;
  codebaseTree: string;
  projectRoot?: string;
  onSendToBrainstorm: (text: string) => void;
}

type SubsystemId = 'project_state_crawler' | 'suggested_jobs_crawler' | 'gap_analysis';
interface SubsystemConfig {
  enabled: boolean;
  idleEnabled: boolean;
  idleIntervalSec: number;
  maxDepth: number;
  manualOnly: boolean;
}

export function GodFactoryRightPanel({ codebaseReady, codebaseTree, projectRoot, onSendToBrainstorm }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [notifications, setNotifications] = useState<IntelNotification[]>([]);
  const [jobs, setJobs] = useState<SuggestedJob[]>(DEMO_JOBS);
  const [brainstorm, setBrainstorm] = useState('');
  const [sections, setSections] = useState({ notifications: true, jobs: true, health: true, subsystems: false, brainstorm: false });
  const [blameStats, setBlameStats] = useState<any[]>([]);
  const [subsystems, setSubsystems] = useState<Record<SubsystemId, SubsystemConfig>>({
    project_state_crawler: { enabled: true, idleEnabled: true, idleIntervalSec: 90, maxDepth: 5, manualOnly: false },
    suggested_jobs_crawler: { enabled: true, idleEnabled: true, idleIntervalSec: 120, maxDepth: 4, manualOnly: false },
    gap_analysis: { enabled: true, idleEnabled: true, idleIntervalSec: 180, maxDepth: 4, manualOnly: false },
  });
  const [runningSubsystem, setRunningSubsystem] = useState<SubsystemId | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/blame/records?limit=5`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.stats) setBlameStats(d.stats.slice(0, 4)); })
      .catch(() => {});

    fetch(`${API_BASE}/api/subsystems/settings`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.settings) setSubsystems(d.settings); })
      .catch(() => {});

    if (codebaseReady) {
      setNotifications([{
        id: '1', type: 'success', source: 'Codebase Scanner',
        message: 'Codebase snapshot loaded — tools active',
        timestamp: new Date().toISOString(),
      }]);
    }
  }, [codebaseReady]);

  const toggleSection = (key: keyof typeof sections) =>
    setSections(prev => ({ ...prev, [key]: !prev[key] }));

  const updateSubsystem = (id: SubsystemId, patch: Partial<SubsystemConfig>) => {
    const next = { ...subsystems, [id]: { ...subsystems[id], ...patch } };
    setSubsystems(next);
    fetch(`${API_BASE}/api/subsystems/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [id]: next[id] }),
    }).catch(() => {});
  };

  const runSubsystem = async (id: SubsystemId) => {
    setRunningSubsystem(id);
    try {
      const res = await fetch(`${API_BASE}/api/subsystems/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subsystem: id, projectRoot, depth: subsystems[id].maxDepth }),
      });
      const data = await res.json();
      const summary = data?.result?.summary || data?.error || 'Run complete';
      setNotifications(prev => [{
        id: `${Date.now()}`,
        type: (data.success ? 'info' : 'error') as IntelNotification['type'],
        source: id,
        message: summary,
        timestamp: new Date().toISOString(),
      }, ...prev].slice(0, 12));

      if (id === 'suggested_jobs_crawler' && data?.result?.suggestedJobs?.length) {
        const incoming = data.result.suggestedJobs as SuggestedJob[];
        setJobs(prev => [...incoming, ...prev].slice(0, 30));
      }
    } catch (err: any) {
      setNotifications(prev => [{
        id: `${Date.now()}`,
        type: 'error' as IntelNotification['type'],
        source: id,
        message: `Run failed: ${err.message}`,
        timestamp: new Date().toISOString(),
      }, ...prev].slice(0, 12));
    } finally {
      setRunningSubsystem(null);
    }
  };

  const treeLineCount = codebaseTree.split('\n').length;

  const priorityColor = (p: SuggestedJob['priority']) =>
    p === 'high'   ? 'text-red-400 bg-red-400/10' :
    p === 'medium' ? 'text-yellow-400 bg-yellow-400/10' :
                     'text-green-400 bg-green-400/10';

  const notifColor = (t: IntelNotification['type']) =>
    t === 'success' ? 'text-green-400' :
    t === 'warning' ? 'text-yellow-400' :
    t === 'error'   ? 'text-red-400'   : 'text-blue-400';

  if (collapsed) {
    return (
      <div className="w-8 flex-shrink-0 bg-ide-panel border-l border-ide-border flex flex-col items-center pt-3">
        <button onClick={() => setCollapsed(false)} title="Expand panel"
          className="p-1 text-ide-text-dim hover:text-purple-400 rounded">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <div className="mt-4 flex flex-col gap-3 text-ide-text-dim">
          <span className="text-[8px] rotate-90 whitespace-nowrap tracking-widest">INTEL</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 flex-shrink-0 bg-ide-panel border-l border-ide-border flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-ide-border flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-[11px] font-semibold text-ide-text">Intel Panel</span>
        </div>
        <button onClick={() => setCollapsed(true)} title="Collapse"
          className="p-1 text-ide-text-dim hover:text-ide-text rounded">
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Notifications ── */}
        <div className="border-b border-ide-border/50">
          <button onClick={() => toggleSection('notifications')}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-ide-text-dim hover:text-ide-text hover:bg-ide-bg/30">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-yellow-400" />
              Notifications
              {notifications.length > 0 && (
                <span className="px-1 bg-yellow-400/20 text-yellow-300 rounded text-[9px]">{notifications.length}</span>
              )}
            </div>
            {sections.notifications ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {sections.notifications && (
            <div className="px-2 pb-2 space-y-1">
              {notifications.length === 0 ? (
                <div className="text-[10px] text-ide-text-dim px-1 py-2 text-center">No notifications</div>
              ) : notifications.map(n => (
                <div key={n.id} className="flex items-start gap-1.5 p-1.5 rounded bg-ide-bg/30 group">
                  <span className={`text-[10px] mt-0.5 ${notifColor(n.type)}`}>●</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-ide-text leading-snug">{n.message}</div>
                    <div className="text-[9px] text-ide-text-dim mt-0.5">
                      {n.source} · {new Date(n.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                  <button
                    onClick={() => setNotifications(prev => prev.filter(x => x.id !== n.id))}
                    className="opacity-0 group-hover:opacity-100 text-ide-text-dim hover:text-red-400">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Suggested Jobs ── */}
        <div className="border-b border-ide-border/50">
          <button onClick={() => toggleSection('jobs')}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-ide-text-dim hover:text-ide-text hover:bg-ide-bg/30">
            <div className="flex items-center gap-1.5">
              <Star className="w-3 h-3 text-purple-400" />
              Suggested Jobs
              {jobs.length > 0 && (
                <span className="px-1 bg-purple-400/20 text-purple-300 rounded text-[9px]">{jobs.length}</span>
              )}
            </div>
            {sections.jobs ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {sections.jobs && (
            <div className="px-2 pb-2 space-y-1.5">
              {jobs.length === 0 ? (
                <div className="text-[10px] text-ide-text-dim px-1 py-2 text-center">No pending jobs</div>
              ) : jobs.map(job => (
                <div key={job.id} className="p-1.5 rounded bg-ide-bg/30 border border-ide-border/30 group">
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span className="text-[10px] text-ide-text font-medium leading-snug flex-1">{job.title}</span>
                    <span className={`text-[8px] px-1 py-0.5 rounded flex-shrink-0 ${priorityColor(job.priority)}`}>
                      {job.priority}
                    </span>
                  </div>
                  <div className="text-[9px] text-ide-text-dim leading-snug mb-1.5">{job.description}</div>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-purple-400/70">{job.source}</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={() => onSendToBrainstorm(`Work on this suggested job: ${job.title}\n\n${job.description}`)}
                        className="text-[9px] px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded hover:bg-purple-500/30"
                      >→ Chat</button>
                      <button
                        onClick={() => setJobs(prev => prev.filter(j => j.id !== job.id))}
                        className="text-[9px] px-1 py-0.5 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20"
                      ><X className="w-2 h-2" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Codebase Health ── */}
        <div className="border-b border-ide-border/50">
          <button onClick={() => toggleSection('health')}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-ide-text-dim hover:text-ide-text hover:bg-ide-bg/30">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3 h-3 text-green-400" />
              Codebase Health
            </div>
            {sections.health ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {sections.health && (
            <div className="px-3 pb-3 space-y-2">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-ide-text-dim">Snapshot</span>
                <span className={codebaseReady ? 'text-green-400' : 'text-yellow-400'}>
                  {codebaseReady ? '✓ Ready' : '⏳ Loading'}
                </span>
              </div>
              {treeLineCount > 1 && (
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-ide-text-dim">Tree lines</span>
                  <span className="text-ide-text">{treeLineCount.toLocaleString()}</span>
                </div>
              )}
              {blameStats.length > 0 && (
                <div>
                  <div className="text-[9px] text-ide-text-dim mb-1">Model Quality</div>
                  {blameStats.map((s: any) => (
                    <div key={s.model} className="flex items-center justify-between text-[9px] py-0.5">
                      <span className="text-ide-text-dim truncate max-w-[110px]" title={s.model}>
                        {(s.model || '').split('/').pop() || s.model}
                      </span>
                      <span className={`font-mono ${
                        s.successRate > 0.8 ? 'text-green-400' :
                        s.successRate > 0.6 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {s.avgQuality ? `${Math.round(s.avgQuality)}%` : `${Math.round((s.successRate || 0) * 100)}%`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-[9px] text-ide-text-dim">
                <span className="text-purple-400">Tip:</span> Ask the God Factory to scan for debt, gaps, or patterns
              </div>
            </div>
          )}
        </div>

        {/* ── Brainstorm Pad ── */}
        <div className="border-b border-ide-border/50">
          <button onClick={() => toggleSection('subsystems')}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-ide-text-dim hover:text-ide-text hover:bg-ide-bg/30">
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal className="w-3 h-3 text-cyan-400" />
              Subsystem Controls
            </div>
            {sections.subsystems ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {sections.subsystems && (
            <div className="px-2 pb-2 space-y-1.5">
              {(['project_state_crawler', 'suggested_jobs_crawler', 'gap_analysis'] as SubsystemId[]).map(id => {
                const cfg = subsystems[id];
                const label = id.replace(/_/g, ' ');
                return (
                  <div key={id} className="p-1.5 rounded bg-ide-bg/30 border border-ide-border/30 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-ide-text font-medium capitalize">{label}</span>
                      <button
                        onClick={() => runSubsystem(id)}
                        disabled={runningSubsystem !== null}
                        className="text-[9px] px-1.5 py-0.5 bg-cyan-500/15 text-cyan-300 rounded hover:bg-cyan-500/25 disabled:opacity-40 flex items-center gap-1"
                      >
                        <Play className="w-2 h-2" />
                        {runningSubsystem === id ? 'Running' : 'Run now'}
                      </button>
                    </div>
                    <div className="flex items-center gap-1 text-[9px]">
                      <button
                        onClick={() => updateSubsystem(id, { enabled: !cfg.enabled })}
                        className={`px-1.5 py-0.5 rounded border ${cfg.enabled ? 'border-green-500/40 text-green-400 bg-green-500/10' : 'border-ide-border text-ide-text-dim'}`}
                      >
                        {cfg.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                      <button
                        onClick={() => updateSubsystem(id, { idleEnabled: !cfg.idleEnabled })}
                        className={`px-1.5 py-0.5 rounded border ${cfg.idleEnabled ? 'border-blue-500/40 text-blue-400 bg-blue-500/10' : 'border-ide-border text-ide-text-dim'}`}
                      >
                        Idle {cfg.idleEnabled ? 'ON' : 'OFF'}
                      </button>
                      <button
                        onClick={() => updateSubsystem(id, { manualOnly: !cfg.manualOnly })}
                        className={`px-1.5 py-0.5 rounded border ${cfg.manualOnly ? 'border-yellow-500/40 text-yellow-400 bg-yellow-500/10' : 'border-ide-border text-ide-text-dim'}`}
                      >
                        Manual {cfg.manualOnly ? 'ONLY' : 'AUTO'}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-[9px] text-ide-text-dim">
                      <label className="flex items-center gap-1">
                        Depth
                        <input
                          type="number"
                          min={1}
                          max={8}
                          value={cfg.maxDepth}
                          onChange={e => updateSubsystem(id, { maxDepth: Math.max(1, Math.min(8, Number(e.target.value) || 1)) })}
                          className="w-10 bg-ide-panel border border-ide-border rounded px-1 py-0.5 text-[9px]"
                        />
                      </label>
                      <label className="flex items-center gap-1 justify-end">
                        Idle s
                        <input
                          type="number"
                          min={15}
                          max={3600}
                          value={cfg.idleIntervalSec}
                          onChange={e => updateSubsystem(id, { idleIntervalSec: Math.max(15, Math.min(3600, Number(e.target.value) || 15)) })}
                          className="w-12 bg-ide-panel border border-ide-border rounded px-1 py-0.5 text-[9px]"
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Brainstorm Pad ── */}
        <div>
          <button onClick={() => toggleSection('brainstorm')}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-ide-text-dim hover:text-ide-text hover:bg-ide-bg/30">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-blue-400" />
              Brainstorm Pad
            </div>
            {sections.brainstorm ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {sections.brainstorm && (
            <div className="px-2 pb-2">
              <textarea
                value={brainstorm}
                onChange={e => setBrainstorm(e.target.value)}
                placeholder="Jot ideas here, then send to chat…"
                rows={4}
                className="w-full bg-ide-bg border border-ide-border/50 rounded px-2 py-1.5 text-[10px] text-ide-text placeholder-ide-text-dim resize-none focus:outline-none focus:border-blue-400/50 mb-1.5"
              />
              <button
                onClick={() => { if (brainstorm.trim()) { onSendToBrainstorm(brainstorm.trim()); setBrainstorm(''); } }}
                disabled={!brainstorm.trim()}
                className="w-full text-[10px] py-1 bg-blue-500/15 text-blue-300 rounded hover:bg-blue-500/25 disabled:opacity-30 flex items-center justify-center gap-1"
              >
                <Send className="w-2.5 h-2.5" /> Send to Chat
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
