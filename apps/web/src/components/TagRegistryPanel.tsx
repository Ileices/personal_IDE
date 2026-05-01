// ============================================
// Tag Registry Panel
// Browse and manage devtags, plantags, buildtags.
// Shows stats, relationship rules, and claim locks.
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { Tag, GitBranch, Layers, CheckSquare, AlertTriangle, RefreshCw, Search, Lock, Unlock } from 'lucide-react';

const API = 'http://localhost:3001/api/tags';

type TabId = 'devtags' | 'plantags' | 'buildtags' | 'rules' | 'stats';

interface TagStats {
  total_devtags: number;
  active_devtags: number;
  dead_devtags: number;
  retired_devtags: number;
  total_plantags: number;
  pending_plantags: number;
  done_plantags: number;
  blocked_plantags: number;
  total_buildtags: number;
  committed_buildtags: number;
  failed_buildtags: number;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'text-green-400',
  dead: 'text-red-400',
  retired: 'text-gray-400',
  orphaned: 'text-yellow-400',
  pending: 'text-blue-400',
  in_progress: 'text-yellow-300',
  done: 'text-green-400',
  blocked: 'text-red-400',
  committed: 'text-green-400',
  failed: 'text-red-400',
  reverted: 'text-gray-400',
};

export function TagRegistryPanel() {
  const [activeTab, setActiveTab] = useState<TabId>('stats');
  const [stats, setStats] = useState<TagStats | null>(null);
  const [devtags, setDevtags] = useState<any[]>([]);
  const [plantags, setPlantags] = useState<any[]>([]);
  const [buildtags, setBuildtags] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [projectId, setProjectId] = useState('');

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/stats${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''}`);
      if (res.ok) setStats(await res.json());
    } catch { /* silent */ }
  }, [projectId]);

  const fetchDevtags = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (projectId) params.set('project_id', projectId);
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`${API}/devtags?${params}`);
      if (res.ok) { const d = await res.json(); setDevtags(d.tags ?? []); }
    } catch { /* silent */ }
    setLoading(false);
  }, [projectId, statusFilter]);

  const fetchPlantags = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (projectId) params.set('project_id', projectId);
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`${API}/plantags?${params}`);
      if (res.ok) { const d = await res.json(); setPlantags(d.tags ?? []); }
    } catch { /* silent */ }
    setLoading(false);
  }, [projectId, statusFilter]);

  const fetchBuildtags = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (projectId) params.set('project_id', projectId);
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`${API}/buildtags?${params}`);
      if (res.ok) { const d = await res.json(); setBuildtags(d.tags ?? []); }
    } catch { /* silent */ }
    setLoading(false);
  }, [projectId, statusFilter]);

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch(`${API}/relationship-rules`);
      if (res.ok) { const d = await res.json(); setRules(d.rules ?? []); }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (activeTab === 'devtags') fetchDevtags();
    else if (activeTab === 'plantags') fetchPlantags();
    else if (activeTab === 'buildtags') fetchBuildtags();
    else if (activeTab === 'rules') fetchRules();
  }, [activeTab, fetchDevtags, fetchPlantags, fetchBuildtags, fetchRules]);

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'stats', label: 'Stats', icon: Layers },
    { id: 'devtags', label: 'Devtags', icon: Tag },
    { id: 'plantags', label: 'Plantags', icon: CheckSquare },
    { id: 'buildtags', label: 'Buildtags', icon: GitBranch },
    { id: 'rules', label: 'Schema Rules', icon: AlertTriangle },
  ];

  const filterItems = (items: any[]) => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(item => item.tag_key?.toLowerCase().includes(q) || item.name?.toLowerCase().includes(q));
  };

  return (
    <div className="flex flex-col h-full text-xs">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-ide-border">
        <Tag size={12} className="text-ide-accent flex-shrink-0" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ide-text-dim flex-1">Tag Registry</span>
        <button onClick={fetchStats} className="text-ide-text-dim hover:text-ide-accent transition-colors" title="Refresh">
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Project filter */}
      <div className="px-3 py-1.5 border-b border-ide-border">
        <input
          type="text"
          placeholder="Filter by project ID…"
          value={projectId}
          onChange={e => setProjectId(e.target.value)}
          className="w-full text-xs bg-ide-input border border-ide-border rounded px-2 py-1 text-ide-text placeholder-ide-text-dim focus:outline-none focus:border-ide-accent"
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-ide-border flex-shrink-0 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-ide-accent text-ide-accent'
                : 'border-transparent text-ide-text-dim hover:text-ide-text'
            }`}
          >
            <tab.icon size={10} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'stats' && stats && (
          <div className="p-3 space-y-3">
            <StatSection title="Devtags" items={[
              { label: 'Total', value: stats.total_devtags },
              { label: 'Active', value: stats.active_devtags, cls: 'text-green-400' },
              { label: 'Dead', value: stats.dead_devtags, cls: 'text-red-400' },
              { label: 'Retired', value: stats.retired_devtags, cls: 'text-gray-400' },
            ]} />
            <StatSection title="Plantags" items={[
              { label: 'Total', value: stats.total_plantags },
              { label: 'Pending', value: stats.pending_plantags, cls: 'text-blue-400' },
              { label: 'Done', value: stats.done_plantags, cls: 'text-green-400' },
              { label: 'Blocked', value: stats.blocked_plantags, cls: 'text-red-400' },
            ]} />
            <StatSection title="Buildtags" items={[
              { label: 'Total', value: stats.total_buildtags },
              { label: 'Committed', value: stats.committed_buildtags, cls: 'text-green-400' },
              { label: 'Failed', value: stats.failed_buildtags, cls: 'text-red-400' },
            ]} />
          </div>
        )}

        {activeTab === 'stats' && !stats && (
          <div className="p-3 text-ide-text-dim text-center">No stats yet. Register some tags to get started.</div>
        )}

        {(activeTab === 'devtags' || activeTab === 'plantags' || activeTab === 'buildtags') && (
          <div className="flex flex-col h-full">
            {/* Search + status filter */}
            <div className="flex gap-1.5 px-2 py-1.5 border-b border-ide-border flex-shrink-0">
              <div className="flex-1 flex items-center gap-1 bg-ide-input border border-ide-border rounded px-2">
                <Search size={10} className="text-ide-text-dim flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Search tag_key…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="flex-1 bg-transparent text-[10px] text-ide-text placeholder-ide-text-dim focus:outline-none py-0.5"
                />
              </div>
              <input
                type="text"
                placeholder="Status…"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="w-20 text-[10px] bg-ide-input border border-ide-border rounded px-2 text-ide-text placeholder-ide-text-dim focus:outline-none"
              />
            </div>

            {loading && <div className="p-3 text-ide-text-dim text-center text-[10px]">Loading…</div>}

            {!loading && (
              <div className="overflow-y-auto flex-1">
                {filterItems(activeTab === 'devtags' ? devtags : activeTab === 'plantags' ? plantags : buildtags).map(tag => (
                  <TagRow key={tag.id} tag={tag} />
                ))}
                {filterItems(activeTab === 'devtags' ? devtags : activeTab === 'plantags' ? plantags : buildtags).length === 0 && (
                  <div className="p-4 text-center text-ide-text-dim text-[10px]">No tags found</div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'rules' && (
          <div className="p-2 space-y-1">
            {rules.map((r: any) => (
              <div key={r.id} className="rounded border border-ide-border px-2 py-1.5 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className={`px-1 py-0.5 rounded text-[9px] font-mono ${r.rule_type === 'parent_child' ? 'bg-blue-900/40 text-blue-300' : r.rule_type === 'peer' ? 'bg-purple-900/40 text-purple-300' : 'bg-yellow-900/40 text-yellow-300'}`}>
                    {r.rule_type}
                  </span>
                  <span className="text-ide-text font-mono text-[10px]">{r.child_tag_type}</span>
                  <span className="text-ide-text-dim">→</span>
                  <span className="text-ide-accent font-mono text-[10px]">{r.parent_tag_type}</span>
                </div>
                {r.description && <div className="text-[9px] text-ide-text-dim pl-1">{r.description}</div>}
              </div>
            ))}
            {rules.length === 0 && <div className="p-4 text-center text-ide-text-dim text-[10px]">No rules loaded yet</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function TagRow({ tag }: { tag: any }) {
  const statusColor = STATUS_COLORS[tag.status] ?? 'text-ide-text-dim';
  return (
    <div className="border-b border-ide-border/50 px-2 py-1.5 hover:bg-ide-hover/30 transition-colors">
      <div className="flex items-start gap-1.5">
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[10px] text-ide-accent truncate" title={tag.tag_key}>{tag.tag_key}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[9px] text-ide-text-dim">{tag.tag_type}</span>
            {tag.file_path && <span className="text-[9px] text-ide-text-dim truncate max-w-[120px]" title={tag.file_path}>{tag.file_path.split(/[\\/]/).pop()}</span>}
            {tag.agent_id && <span className="text-[9px] text-ide-text-dim">agent:{tag.agent_id.slice(0, 8)}</span>}
          </div>
        </div>
        <span className={`text-[9px] font-medium flex-shrink-0 ${statusColor}`}>{tag.status}</span>
      </div>
    </div>
  );
}

function StatSection({ title, items }: { title: string; items: { label: string; value: number; cls?: string }[] }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ide-text-dim mb-1.5">{title}</div>
      <div className="grid grid-cols-2 gap-1.5">
        {items.map(item => (
          <div key={item.label} className="flex items-center justify-between bg-ide-input/50 rounded px-2 py-1">
            <span className="text-[10px] text-ide-text-dim">{item.label}</span>
            <span className={`text-[11px] font-bold ${item.cls ?? 'text-ide-text'}`}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
