// ============================================
// Forensic Panel
// Unified view of all forensic database tables.
// Regressions, conflicts, dead tags, diff failures,
// integration failures, version commits, nano anomalies,
// spawn violations, systemic regressions.
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, RotateCcw, Tag, Zap, Link, GitCommit,
  Cpu, Shield, TrendingUp, RefreshCw, ChevronDown, ChevronRight,
  BarChart2
} from 'lucide-react';
import { API_BASE } from '../config.js';

const API = `${API_BASE}/api/forensic`;

type ForensicTab =
  | 'summary'
  | 'regressions'
  | 'conflicts'
  | 'dead-tags'
  | 'diff-failures'
  | 'integration'
  | 'commits'
  | 'nano'
  | 'spawn'
  | 'systemic'
  | 'tag-mismatches';

interface ForensicSummary {
  counts: Record<string, number>;
}

const SEVERITY_COLORS: Record<string, string> = {
  info: 'text-blue-400',
  warning: 'text-yellow-400',
  error: 'text-orange-400',
  critical: 'text-red-400',
  fatal: 'text-red-600',
};

export function ForensicPanel() {
  const [activeTab, setActiveTab] = useState<ForensicTab>('summary');
  const [summary, setSummary] = useState<ForensicSummary | null>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch(`${API}/summary`);
      if (res.ok) setSummary(await res.json());
    } catch { /* silent */ }
  }, []);

  const fetchTab = useCallback(async (tab: ForensicTab) => {
    if (tab === 'summary') { fetchSummary(); return; }
    setLoading(true);
    setEntries([]);
    const endpoints: Record<ForensicTab, string> = {
      summary: '',
      regressions: '/regressions?limit=100',
      conflicts: '/conflicts',
      'dead-tags': '/dead-tags',
      'diff-failures': '/diff-failures',
      integration: '/integration-failures',
      commits: '/version-commits?limit=50',
      nano: '/nano-anomalies',
      spawn: '/spawn-violations',
      systemic: '/systemic-regressions',
      'tag-mismatches': '/tag-mismatches?limit=200',
    };
    try {
      const res = await fetch(`${API}${endpoints[tab]}`);
      if (res.ok) {
        const data = await res.json();
        const key = Object.keys(data).find(k => Array.isArray(data[k]));
        setEntries(key ? data[key] : []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [fetchSummary]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    fetchTab(activeTab);
  }, [activeTab, fetchTab]);

  const tabs: { id: ForensicTab; label: string; icon: React.ElementType; countKey?: string }[] = [
    { id: 'summary', label: 'Summary', icon: BarChart2 },
    { id: 'regressions', label: 'Regressions', icon: RotateCcw, countKey: 'regression_history' },
    { id: 'conflicts', label: 'Conflicts', icon: Zap, countKey: 'conflict_log' },
    { id: 'dead-tags', label: 'Dead Tags', icon: Tag, countKey: 'dead_tags' },
    { id: 'diff-failures', label: 'Diff Fails', icon: AlertTriangle, countKey: 'diff_failures' },
    { id: 'integration', label: 'Integration', icon: Link, countKey: 'integration_failures' },
    { id: 'commits', label: 'Commits', icon: GitCommit, countKey: 'version_commits' },
    { id: 'nano', label: 'Nano', icon: Cpu, countKey: 'nano_anomalies' },
    { id: 'spawn', label: 'Spawn', icon: Shield, countKey: 'spawn_violations' },
    { id: 'systemic', label: 'Systemic', icon: TrendingUp, countKey: 'systemic_regressions' },
    { id: 'tag-mismatches', label: 'Mismatches', icon: AlertTriangle, countKey: 'tag_mismatches' },
  ];

  const handleRevertCommit = async (commit_id: string) => {
    if (!confirm(`Revert commit ${commit_id.slice(0, 8)}?`)) return;
    try {
      const res = await fetch(`${API}/version-commits/${commit_id}/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoking_agent_id: 'user' }),
      });
      if (res.ok) fetchTab(activeTab);
    } catch { /* silent */ }
  };

  const handleResolveDeadTag = async (devtag: string) => {
    try {
      const res = await fetch(`${API}/dead-tags/${encodeURIComponent(devtag)}/resolve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      if (res.ok) fetchTab(activeTab);
    } catch { /* silent */ }
  };

  const handleScanDeadTags = async () => {
    setLoading(true);
    try {
      await fetch(`${API}/dead-tags/scan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_cycle: Date.now() }),
      });
      fetchTab('dead-tags');
    } catch { /* silent */ }
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full text-xs">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-ide-border">
        <AlertTriangle size={12} className="text-orange-400 flex-shrink-0" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ide-text-dim flex-1">Forensic Database</span>
        <button onClick={() => fetchTab(activeTab)} className="text-ide-text-dim hover:text-ide-accent transition-colors" title="Refresh">
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-ide-border flex-shrink-0 overflow-x-auto scrollbar-none">
        {tabs.map(tab => {
          const count = summary?.counts?.[tab.countKey ?? ''];
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-1 px-2 py-1.5 text-[9px] font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-orange-400 text-orange-300'
                  : 'border-transparent text-ide-text-dim hover:text-ide-text'
              }`}
            >
              <tab.icon size={9} />
              <span>{tab.label}</span>
              {count !== undefined && count > 0 && (
                <span className="ml-0.5 px-1 py-0.5 rounded-full bg-orange-500/20 text-orange-400 text-[8px] font-bold leading-none">
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'summary' && summary && (
          <div className="p-3 space-y-1">
            {Object.entries(summary.counts).map(([key, count]) => (
              <div key={key} className="flex items-center justify-between py-1 border-b border-ide-border/30">
                <span className="text-ide-text-dim text-[10px]">{key.replace(/_/g, ' ')}</span>
                <span className={`font-bold text-[11px] ${count > 0 ? 'text-orange-400' : 'text-green-400'}`}>{count}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'dead-tags' && (
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-ide-border">
            <button
              onClick={handleScanDeadTags}
              disabled={loading}
              className="text-[9px] px-2 py-1 bg-orange-500/20 text-orange-400 rounded hover:bg-orange-500/30 transition-colors disabled:opacity-50"
            >
              Run Dead Tag Scan
            </button>
          </div>
        )}

        {loading && (
          <div className="p-4 text-center text-ide-text-dim text-[10px]">Loading…</div>
        )}

        {!loading && activeTab !== 'summary' && entries.length === 0 && (
          <div className="p-4 text-center text-green-400 text-[10px]">No entries — all clear</div>
        )}

        {!loading && entries.map((entry: any, i: number) => (
          <ForensicEntry
            key={entry.entry_id ?? entry.commit_id ?? i}
            tab={activeTab}
            entry={entry}
            expanded={expanded === (entry.entry_id ?? entry.commit_id ?? String(i))}
            onToggle={() => setExpanded(
              expanded === (entry.entry_id ?? entry.commit_id ?? String(i))
                ? null
                : (entry.entry_id ?? entry.commit_id ?? String(i))
            )}
            onRevertCommit={handleRevertCommit}
            onResolveDeadTag={handleResolveDeadTag}
          />
        ))}
      </div>
    </div>
  );
}

function ForensicEntry({
  tab, entry, expanded, onToggle, onRevertCommit, onResolveDeadTag,
}: {
  tab: ForensicTab;
  entry: any;
  expanded: boolean;
  onToggle: () => void;
  onRevertCommit: (id: string) => void;
  onResolveDeadTag: (tag: string) => void;
}) {
  const id = entry.entry_id ?? entry.commit_id;
  const severity = entry.severity;

  const renderSummaryLine = () => {
    switch (tab) {
      case 'regressions': return `${entry.devtag} → ${entry.file?.split(/[\\/]/).pop() ?? 'unknown'} (cycle ${entry.cycle_id})`;
      case 'conflicts': return `${entry.devtag_claimed}: ${entry.claiming_agent_id?.slice(0, 8)} vs ${entry.blocked_agent_id?.slice(0, 8)} [${entry.resolution}]`;
      case 'dead-tags': return `${entry.devtag} — last seen ${entry.last_known_file?.split(/[\\/]/).pop() ?? '?'} L${entry.last_known_line ?? '?'}`;
      case 'diff-failures': return `cycle ${entry.cycle_id} — ${entry.mismatch_detail?.slice(0, 60) ?? 'unknown mismatch'}`;
      case 'integration': return `${entry.new_devtag} → missing ${entry.missing_connected_devtag} (${entry.relationship_type})`;
      case 'commits': return `${id?.slice(0, 8)} by ${entry.agent_id?.slice(0, 8)} ${entry.reverted ? '(REVERTED)' : ''}`;
      case 'nano': return `${entry.nano_devtag} — ${entry.anomaly_type} (cycle ${entry.cycle_id})`;
      case 'spawn': return `${entry.requesting_agent_id?.slice(0, 8)} tried to spawn ${entry.requested_sub_agent} [BLOCKED]`;
      case 'systemic': return `${entry.dimension}: ${entry.dimension_value} — ${entry.regression_count} regressions in ${entry.cycle_window} cycles`;
      case 'tag-mismatches': return `${entry.devtag} [${entry.mismatch_type}] severity: ${entry.severity}${entry.escalated ? ' ↑ESC' : ''}`;
      default: return JSON.stringify(entry).slice(0, 80);
    }
  };

  return (
    <div className="border-b border-ide-border/40 hover:bg-ide-hover/20 transition-colors">
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-1.5 px-2 py-1.5 text-left"
      >
        {expanded ? <ChevronDown size={9} className="mt-0.5 flex-shrink-0 text-ide-text-dim" /> : <ChevronRight size={9} className="mt-0.5 flex-shrink-0 text-ide-text-dim" />}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-ide-text truncate">{renderSummaryLine()}</div>
          <div className="flex items-center gap-2 mt-0.5">
            {entry.created_at && <span className="text-[9px] text-ide-text-dim">{new Date(entry.created_at).toLocaleString()}</span>}
            {severity && <span className={`text-[9px] font-medium ${SEVERITY_COLORS[severity] ?? 'text-ide-text-dim'}`}>{severity}</span>}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-2 space-y-1">
          <pre className="text-[9px] text-ide-text-dim bg-ide-input/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(entry, null, 2)}
          </pre>
          {/* Action buttons */}
          {tab === 'commits' && !entry.reverted && (
            <button
              onClick={() => onRevertCommit(entry.commit_id)}
              className="text-[9px] px-2 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
            >
              Revert This Commit
            </button>
          )}
          {tab === 'dead-tags' && !entry.resolved && (
            <button
              onClick={() => onResolveDeadTag(entry.devtag)}
              className="text-[9px] px-2 py-1 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition-colors"
            >
              Mark Resolved
            </button>
          )}
        </div>
      )}
    </div>
  );
}
