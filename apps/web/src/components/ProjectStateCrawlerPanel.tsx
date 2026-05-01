// ============================================
// Project State Crawler Panel
// 6-tab VS Code-style panel for PSC data:
// Snapshots | Drift Events | Devtags | Skipped | Languages | Memory
// ============================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play, RefreshCw, CheckCircle, XCircle, AlertTriangle,
  Info, Filter, ChevronRight, Loader2, Database,
  FileCode, Globe, SkipForward, Layers, Cpu, Trash2, Plus,
} from 'lucide-react';

const BASE = '/api/project-state-crawler';

type TabId = 'snapshots' | 'drift' | 'devtags' | 'skipped' | 'languages' | 'memory';

// ── Types ─────────────────────────────────────
interface Snapshot {
  snapshot_id: string;
  cycle_id: string;
  project_path: string;
  status: 'running' | 'complete' | 'error';
  triggered_by: string;
  total_files: number;
  skipped_files_count: number;
  total_devtags: number;
  registry_surplus_count: number;
  registry_deficit_count: number;
  content_drift_count: number;
  location_drift_count: number;
  systemic_drift_flagged: number;
  parse_duration_ms: number;
  timestamp: string;
  error_message?: string;
}

interface DriftEvent {
  entry_id: string;
  snapshot_id: string;
  drift_type: 'registry_surplus' | 'registry_deficit' | 'content_drift' | 'location_drift';
  devtag: string;
  devtag_type: string | null;
  file_path: string;
  line_start_registry: number | null;
  line_start_snapshot: number | null;
  content_hash_registry: string | null;
  content_hash_snapshot: string | null;
  severity: 'info' | 'warning' | 'error';
  resolved: number;
  resolver_agent_id?: string;
  resolved_at?: string;
  systemic: number;
  timestamp: string;
}

interface Devtag {
  entry_id: string;
  devtag_type: string;
  devtag_name: string;
  file_path: string;
  line_start: number;
  line_end: number;
  parent_devtag: string | null;
  content_hash: string;
  language: string;
  relationship_tags: string;
}

interface SkippedFile {
  entry_id: string;
  snapshot_id: string;
  file_path: string;
  skip_reason: string;
  file_size_bytes: number | null;
  timestamp: string;
}

interface LanguageEntry {
  language_id: string;
  file_extension: string;
  grammar_name: string;
  grammar_version: string;
  registered_by: string;
  enabled: number;
  timestamp: string;
}

interface MemoryData {
  latest: Snapshot | null;
  stats: {
    typeBreakdown: Array<{ devtag_type: string; cnt: number }>;
    langBreakdown: Array<{ language: string; cnt: number }>;
    driftSummary: Array<{ drift_type: string; severity: string; cnt: number }>;
    topDriftFiles: Array<{ file_path: string; drift_count: number }>;
  } | null;
}

interface WhitelistEntry {
  id: string;
  path_pattern: string;
  reason: string;
  added_by: string;
  created_at: string;
}

interface DirectoryStat {
  directory_path: string;
  file_count: number;
  devtag_count: number;
  skipped_count: number;
  parse_duration_ms: number;
  sub_crawler_status: string;
}

interface VocabGap {
  entry_id: string;
  file_path: string;
  untagged_structure_type: string;
  occurrence_count: number;
  first_detected_cycle: string;
  resolved: number;
  proposed_tag_type: string;
}

interface TagMismatch {
  entry_id: string;
  devtag: string;
  mismatch_type: string;
  severity: string;
  cycle_id: string;
  file: string;
  created_at: string;
}

// ── Helpers ───────────────────────────────────
function fmt(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function relTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    error: 'bg-red-500/20 text-red-400 border border-red-500/30',
    warning: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
    info: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${map[severity] || map.info}`}>
      {severity}
    </span>
  );
}

function DriftTypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    registry_surplus: 'bg-red-500/20 text-red-300',
    registry_deficit: 'bg-orange-500/20 text-orange-300',
    content_drift: 'bg-yellow-500/20 text-yellow-300',
    location_drift: 'bg-blue-500/20 text-blue-300',
  };
  const labels: Record<string, string> = {
    registry_surplus: 'surplus',
    registry_deficit: 'deficit',
    content_drift: 'content',
    location_drift: 'location',
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${map[type] || ''}`}>
      {labels[type] || type}
    </span>
  );
}

function PanelHeader({ title }: { title: string }) {
  return (
    <div className="h-9 flex items-center px-3 border-b border-ide-border flex-shrink-0">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-ide-text-dim">{title}</span>
    </div>
  );
}

// ── Main Panel ────────────────────────────────
export function ProjectStateCrawlerPanel() {
  const [tab, setTab] = useState<TabId>('snapshots');

  const tabs: Array<{ id: TabId; label: string; icon: React.ElementType }> = [
    { id: 'snapshots', label: 'Snapshots', icon: Database },
    { id: 'drift', label: 'Drift Events', icon: AlertTriangle },
    { id: 'devtags', label: 'Devtags', icon: FileCode },
    { id: 'skipped', label: 'Skipped', icon: SkipForward },
    { id: 'languages', label: 'Languages', icon: Globe },
    { id: 'memory', label: 'Memory', icon: Cpu },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader title="Project State Crawler" />

      {/* Tab rail */}
      <div className="flex border-b border-ide-border bg-ide-sidebar flex-shrink-0 overflow-x-auto scrollbar-none">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={[
                'flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium whitespace-nowrap border-b-2 transition-colors',
                tab === t.id
                  ? 'border-ide-accent text-ide-accent'
                  : 'border-transparent text-ide-text-dim hover:text-ide-text',
              ].join(' ')}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'snapshots' && <SnapshotsTab />}
        {tab === 'drift' && <DriftEventsTab />}
        {tab === 'devtags' && <DevtagsTab />}
        {tab === 'skipped' && <SkippedFilesTab />}
        {tab === 'languages' && <LanguagesTab />}
        {tab === 'memory' && <MemoryTab />}
      </div>
    </div>
  );
}

// ── Snapshots Tab ─────────────────────────────
function SnapshotsTab() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [progressLog, setProgressLog] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(BASE + '/snapshots');
      if (res.ok) setSnapshots(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [progressLog]);

  const runCrawl = useCallback(async () => {
    setRunning(true);
    setProgressLog([]);
    try {
      const res = await fetch(BASE + '/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggered_by: 'ui' }),
      });
      if (!res.body) throw new Error('No response body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.replace(/^data: /, '').trim();
          if (line === '[DONE]') break;
          if (!line) continue;
          try {
            const ev = JSON.parse(line);
            setProgressLog(p => [...p, ev.message ?? line]);
          } catch {
            setProgressLog(p => [...p, line]);
          }
        }
      }
      await load();
    } catch (e: unknown) {
      setProgressLog(p => [...p, `Error: ${e instanceof Error ? e.message : String(e)}`]);
    } finally {
      setRunning(false);
    }
  }, [load]);

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2">
        <button
          onClick={runCrawl}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-ide-accent text-ide-panel rounded hover:bg-ide-accent/80 disabled:opacity-50 transition-colors"
        >
          {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          {running ? 'Crawling…' : 'Run Crawler'}
        </button>
        <button onClick={load} disabled={loading} className="p-1.5 text-ide-text-dim hover:text-ide-text rounded transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <span className="text-xs text-ide-text-dim">{snapshots.length} snapshots</span>
      </div>

      {/* Progress log */}
      {progressLog.length > 0 && (
        <div
          ref={logRef}
          className="bg-ide-bg border border-ide-border rounded p-2 max-h-32 overflow-y-auto font-mono text-[10px] text-ide-text-dim space-y-0.5"
        >
          {progressLog.map((line, i) => (
            <div key={i} className="leading-relaxed">{line}</div>
          ))}
        </div>
      )}

      {/* Snapshot list */}
      <div className="space-y-2">
        {loading && <div className="text-xs text-ide-text-dim text-center py-4">Loading…</div>}
        {!loading && snapshots.length === 0 && (
          <div className="text-xs text-ide-text-dim text-center py-4">No snapshots yet. Run the crawler to start.</div>
        )}
        {snapshots.map(s => (
          <div key={s.snapshot_id} className="bg-ide-bg border border-ide-border rounded p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {s.status === 'complete' && <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />}
                {s.status === 'error' && <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                {s.status === 'running' && <Loader2 className="w-3.5 h-3.5 text-ide-accent animate-spin flex-shrink-0" />}
                <span className="font-mono text-[10px] text-ide-text-dim">{s.snapshot_id.slice(0, 8)}</span>
                {s.systemic_drift_flagged === 1 && (
                  <span className="text-[9px] px-1.5 py-0.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded font-semibold">
                    SYSTEMIC DRIFT
                  </span>
                )}
              </div>
              <span className="text-[10px] text-ide-text-dim">{relTime(s.timestamp)}</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 text-[10px]">
              <Stat label="Files" value={s.total_files} />
              <Stat label="Devtags" value={s.total_devtags} />
              <Stat label="Skipped" value={s.skipped_files_count} />
              <Stat label="Surplus" value={s.registry_surplus_count} color="text-red-400" />
              <Stat label="Deficit" value={s.registry_deficit_count} color="text-orange-400" />
              <Stat label="Content Δ" value={s.content_drift_count} color="text-yellow-400" />
              <Stat label="Location Δ" value={s.location_drift_count} color="text-blue-400" />
              <Stat label="Duration" value={fmt(s.parse_duration_ms)} />
              <Stat label="Trigger" value={s.triggered_by} />
            </div>

            {s.error_message && (
              <div className="text-[10px] text-red-400 font-mono truncate">{s.error_message}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, color = 'text-ide-text' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5 bg-ide-sidebar p-1.5 rounded">
      <span className="text-ide-text-dim text-[9px] uppercase tracking-wider">{label}</span>
      <span className={`${color} font-mono text-[11px] font-semibold`}>{value}</span>
    </div>
  );
}

// ── Drift Events Tab ──────────────────────────
function DriftEventsTab() {
  const [events, setEvents] = useState<DriftEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ drift_type: '', severity: '', resolved: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (filters.drift_type) params.set('drift_type', filters.drift_type);
      if (filters.severity) params.set('severity', filters.severity);
      if (filters.resolved) params.set('resolved', filters.resolved);
      const res = await fetch(`${BASE}/drift-events?${params}`);
      if (res.ok) {
        const d = await res.json();
        setEvents(d.rows);
        setTotal(d.total);
      }
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const resolve = useCallback(async (entryId: string) => {
    await fetch(`${BASE}/drift-events/${entryId}/resolve`, { method: 'PATCH' });
    setEvents(prev => prev.map(e => e.entry_id === entryId ? { ...e, resolved: 1 } : e));
  }, []);

  return (
    <div className="p-3 space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="w-3.5 h-3.5 text-ide-text-dim flex-shrink-0" />

        <select
          value={filters.drift_type}
          onChange={e => setFilters(f => ({ ...f, drift_type: e.target.value }))}
          className="text-xs bg-ide-bg border border-ide-border rounded px-2 py-1 text-ide-text"
        >
          <option value="">All types</option>
          <option value="registry_surplus">Registry Surplus</option>
          <option value="registry_deficit">Registry Deficit</option>
          <option value="content_drift">Content Drift</option>
          <option value="location_drift">Location Drift</option>
        </select>

        <select
          value={filters.severity}
          onChange={e => setFilters(f => ({ ...f, severity: e.target.value }))}
          className="text-xs bg-ide-bg border border-ide-border rounded px-2 py-1 text-ide-text"
        >
          <option value="">All severities</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>

        <select
          value={filters.resolved}
          onChange={e => setFilters(f => ({ ...f, resolved: e.target.value }))}
          className="text-xs bg-ide-bg border border-ide-border rounded px-2 py-1 text-ide-text"
        >
          <option value="">All</option>
          <option value="false">Unresolved</option>
          <option value="true">Resolved</option>
        </select>

        <span className="text-xs text-ide-text-dim ml-auto">{total} events</span>
        <button onClick={load} disabled={loading} className="p-1 text-ide-text-dim hover:text-ide-text">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Event list */}
      <div className="space-y-1.5">
        {loading && <div className="text-xs text-ide-text-dim text-center py-4">Loading…</div>}
        {!loading && events.length === 0 && (
          <div className="text-xs text-ide-text-dim text-center py-4">No drift events found.</div>
        )}
        {events.map(ev => (
          <div
            key={ev.entry_id}
            className={`bg-ide-bg border rounded p-2.5 space-y-1 ${ev.resolved ? 'opacity-50 border-ide-border' : 'border-ide-border'}`}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <DriftTypeBadge type={ev.drift_type} />
              <SeverityBadge severity={ev.severity} />
              {ev.systemic === 1 && (
                <span className="text-[9px] px-1 py-0.5 bg-red-500/20 text-red-400 rounded">systemic</span>
              )}
              {ev.resolved === 1 && (
                <span className="text-[9px] px-1 py-0.5 bg-green-500/20 text-green-400 rounded">resolved</span>
              )}
              <span className="text-[10px] text-ide-text-dim ml-auto">{relTime(ev.timestamp)}</span>
            </div>

            <div className="text-xs text-ide-text font-mono font-medium truncate">{ev.devtag}</div>

            <div className="text-[10px] text-ide-text-dim truncate">
              {ev.file_path}
              {ev.line_start_snapshot != null && (
                <span className="text-ide-text-dim/70"> :L{ev.line_start_snapshot}</span>
              )}
            </div>

            {ev.resolved === 0 && (
              <button
                onClick={() => resolve(ev.entry_id)}
                className="text-[10px] px-2 py-0.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded hover:bg-green-500/20 transition-colors"
              >
                Resolve
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Devtags Tab ───────────────────────────────
function DevtagsTab() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState('');
  const [devtags, setDevtags] = useState<Devtag[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ type: '', language: '', file: '' });

  useEffect(() => {
    fetch(BASE + '/snapshots')
      .then(r => r.json())
      .then((rows: Snapshot[]) => {
        setSnapshots(rows);
        if (rows.length > 0) setSelectedSnapshot(rows[0].snapshot_id);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!selectedSnapshot) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '300' });
      if (filters.type) params.set('type', filters.type);
      if (filters.language) params.set('language', filters.language);
      if (filters.file) params.set('file', filters.file);
      const res = await fetch(`${BASE}/snapshots/${selectedSnapshot}/devtags?${params}`);
      if (res.ok) {
        const d = await res.json();
        setDevtags(d.rows);
        setTotal(d.total);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedSnapshot, filters]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-3 space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={selectedSnapshot}
          onChange={e => setSelectedSnapshot(e.target.value)}
          className="text-xs bg-ide-bg border border-ide-border rounded px-2 py-1 text-ide-text flex-1 min-w-0 max-w-[160px] font-mono"
        >
          <option value="">Select snapshot</option>
          {snapshots.map(s => (
            <option key={s.snapshot_id} value={s.snapshot_id}>
              {s.snapshot_id.slice(0, 8)} — {relTime(s.timestamp)}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Filter by file…"
          value={filters.file}
          onChange={e => setFilters(f => ({ ...f, file: e.target.value }))}
          className="text-xs bg-ide-bg border border-ide-border rounded px-2 py-1 text-ide-text w-32"
        />

        <select
          value={filters.type}
          onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}
          className="text-xs bg-ide-bg border border-ide-border rounded px-2 py-1 text-ide-text"
        >
          <option value="">All types</option>
          {['file','module','class','function','method','import','export','interface','type','enum','constant','route','schema','test'].map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <span className="text-xs text-ide-text-dim ml-auto">{total} devtags</span>
        <button onClick={load} disabled={loading} className="p-1 text-ide-text-dim hover:text-ide-text">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="space-y-1">
        {loading && <div className="text-xs text-ide-text-dim text-center py-4">Loading…</div>}
        {!loading && devtags.length === 0 && (
          <div className="text-xs text-ide-text-dim text-center py-4">
            {selectedSnapshot ? 'No devtags found.' : 'Select a snapshot.'}
          </div>
        )}
        {devtags.map(d => (
          <div key={d.entry_id} className="flex items-start gap-2 py-1 border-b border-ide-border/40 group">
            <DevtagTypePill type={d.devtag_type} />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-ide-text font-mono truncate">{d.devtag_name}</div>
              <div className="text-[10px] text-ide-text-dim truncate">
                {d.file_path}:{d.line_start}
                <span className="ml-2 text-ide-text-dim/60">{d.language}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DevtagTypePill({ type }: { type: string }) {
  const colors: Record<string, string> = {
    class: 'bg-purple-500/20 text-purple-300',
    function: 'bg-blue-500/20 text-blue-300',
    interface: 'bg-cyan-500/20 text-cyan-300',
    type: 'bg-teal-500/20 text-teal-300',
    enum: 'bg-indigo-500/20 text-indigo-300',
    constant: 'bg-green-500/20 text-green-300',
    route: 'bg-orange-500/20 text-orange-300',
    schema: 'bg-yellow-500/20 text-yellow-300',
    test: 'bg-pink-500/20 text-pink-300',
    import: 'bg-ide-bg text-ide-text-dim',
    export: 'bg-ide-bg text-ide-text-dim',
    module: 'bg-red-500/20 text-red-300',
    file: 'bg-ide-border text-ide-text-dim',
  };
  return (
    <span className={`flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded font-mono w-16 text-center ${colors[type] || 'bg-ide-border text-ide-text-dim'}`}>
      {type}
    </span>
  );
}

// ── Skipped Files Tab ─────────────────────────
function SkippedFilesTab() {
  const [files, setFiles] = useState<SkippedFile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
  const [wlLoading, setWlLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [showWhitelist, setShowWhitelist] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/skipped-files?limit=200`);
      if (res.ok) {
        const d = await res.json();
        setFiles(d.rows);
        setTotal(d.total);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWhitelist = useCallback(async () => {
    setWlLoading(true);
    try {
      const res = await fetch(`${BASE}/whitelist`);
      if (res.ok) setWhitelist(await res.json());
    } finally {
      setWlLoading(false);
    }
  }, []);

  useEffect(() => { load(); loadWhitelist(); }, [load, loadWhitelist]);

  const addToWhitelist = useCallback(async (filePath: string) => {
    setAdding(filePath);
    try {
      await fetch(`${BASE}/whitelist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path_pattern: filePath, reason: 'force_parse', added_by: 'ui' }),
      });
      await loadWhitelist();
    } finally {
      setAdding(null);
    }
  }, [loadWhitelist]);

  const removeFromWhitelist = useCallback(async (id: string) => {
    await fetch(`${BASE}/whitelist/${id}`, { method: 'DELETE' });
    await loadWhitelist();
  }, [loadWhitelist]);

  const whitelistPaths = new Set(whitelist.map(w => w.path_pattern));

  const reasonColor: Record<string, string> = {
    file_too_large: 'bg-orange-500/20 text-orange-400',
    binary_file: 'bg-red-500/20 text-red-400',
    stat_error: 'bg-yellow-500/20 text-yellow-400',
    skipped: 'bg-ide-border text-ide-text-dim',
  };

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-ide-text-dim">{total} skipped files</span>
        <button
          onClick={() => setShowWhitelist(v => !v)}
          className="text-xs px-2 py-0.5 bg-ide-accent/10 text-ide-accent rounded hover:bg-ide-accent/20 transition-colors"
        >
          Whitelist ({whitelist.length})
        </button>
        <button onClick={() => { load(); loadWhitelist(); }} disabled={loading} className="ml-auto p-1 text-ide-text-dim hover:text-ide-text">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {showWhitelist && (
        <div className="bg-ide-bg border border-ide-accent/30 rounded p-2 space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ide-accent mb-1">
            Whitelist — files forced to parse
          </div>
          {wlLoading && <div className="text-xs text-ide-text-dim">Loading…</div>}
          {!wlLoading && whitelist.length === 0 && (
            <div className="text-xs text-ide-text-dim">No whitelisted entries.</div>
          )}
          {whitelist.map(w => (
            <div key={w.id} className="flex items-center gap-2 py-0.5">
              <span className="text-[10px] font-mono text-ide-text truncate flex-1 min-w-0">{w.path_pattern}</span>
              <span className="text-[9px] text-ide-text-dim">{w.reason}</span>
              <button
                onClick={() => removeFromWhitelist(w.id)}
                className="flex-shrink-0 p-0.5 text-red-400/60 hover:text-red-400 transition-colors"
                title="Remove from whitelist"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1">
        {loading && <div className="text-xs text-ide-text-dim text-center py-4">Loading…</div>}
        {!loading && files.length === 0 && (
          <div className="text-xs text-ide-text-dim text-center py-4">No skipped files.</div>
        )}
        {files.map(f => (
          <div key={f.entry_id} className="flex items-center gap-2 py-1 border-b border-ide-border/40 group">
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono flex-shrink-0 ${reasonColor[f.skip_reason] || reasonColor.skipped}`}>
              {f.skip_reason}
            </span>
            <span className="text-xs text-ide-text font-mono truncate flex-1 min-w-0">{f.file_path}</span>
            {f.file_size_bytes != null && (
              <span className="text-[10px] text-ide-text-dim flex-shrink-0">{(f.file_size_bytes / 1024).toFixed(0)}KB</span>
            )}
            {!whitelistPaths.has(f.file_path) && (
              <button
                onClick={() => addToWhitelist(f.file_path)}
                disabled={adding === f.file_path}
                className="flex-shrink-0 text-[9px] px-1.5 py-0.5 bg-ide-accent/10 text-ide-accent rounded hover:bg-ide-accent/20 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                title="Add to whitelist"
              >
                <Plus className="w-2.5 h-2.5 inline mr-0.5" />
                whitelist
              </button>
            )}
            {whitelistPaths.has(f.file_path) && (
              <span className="text-[9px] text-green-400 flex-shrink-0">✓ whitelisted</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Languages Tab ─────────────────────────────
function LanguagesTab() {
  const [langs, setLangs] = useState<LanguageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newLang, setNewLang] = useState({ file_extension: '', grammar_name: '', grammar_version: '1.0.0' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(BASE + '/language-registry');
      if (res.ok) setLangs(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addLang = useCallback(async () => {
    if (!newLang.file_extension || !newLang.grammar_name) return;
    setSaving(true);
    try {
      await fetch(BASE + '/language-registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLang),
      });
      setShowAdd(false);
      setNewLang({ file_extension: '', grammar_name: '', grammar_version: '1.0.0' });
      await load();
    } finally {
      setSaving(false);
    }
  }, [newLang, load]);

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-ide-text-dim">{langs.length} languages registered</span>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="ml-auto text-xs px-2 py-1 bg-ide-accent/10 text-ide-accent rounded hover:bg-ide-accent/20 transition-colors"
        >
          + Register
        </button>
      </div>

      {showAdd && (
        <div className="bg-ide-bg border border-ide-border rounded p-3 space-y-2">
          <input
            placeholder="File extension (e.g. rs)"
            value={newLang.file_extension}
            onChange={e => setNewLang(n => ({ ...n, file_extension: e.target.value }))}
            className="w-full text-xs bg-ide-sidebar border border-ide-border rounded px-2 py-1 text-ide-text"
          />
          <input
            placeholder="Grammar name (e.g. tree-sitter-rust)"
            value={newLang.grammar_name}
            onChange={e => setNewLang(n => ({ ...n, grammar_name: e.target.value }))}
            className="w-full text-xs bg-ide-sidebar border border-ide-border rounded px-2 py-1 text-ide-text"
          />
          <input
            placeholder="Version (default 1.0.0)"
            value={newLang.grammar_version}
            onChange={e => setNewLang(n => ({ ...n, grammar_version: e.target.value }))}
            className="w-full text-xs bg-ide-sidebar border border-ide-border rounded px-2 py-1 text-ide-text"
          />
          <div className="flex gap-2">
            <button
              onClick={addLang}
              disabled={saving}
              className="text-xs px-3 py-1 bg-ide-accent text-ide-panel rounded hover:bg-ide-accent/80 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setShowAdd(false)} className="text-xs px-3 py-1 text-ide-text-dim hover:text-ide-text">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {loading && <div className="text-xs text-ide-text-dim text-center py-4">Loading…</div>}
        {langs.map(l => (
          <div key={l.language_id} className="flex items-center gap-2 py-1 border-b border-ide-border/40">
            <span className="font-mono text-[11px] text-ide-accent bg-ide-accent/10 px-1.5 py-0.5 rounded w-10 text-center flex-shrink-0">
              .{l.file_extension}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-ide-text truncate">{l.grammar_name}</div>
              <div className="text-[10px] text-ide-text-dim">{l.grammar_version} — by {l.registered_by}</div>
            </div>
            <span className={`text-[9px] px-1 py-0.5 rounded flex-shrink-0 ${l.enabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              {l.enabled ? 'on' : 'off'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Memory Tab ────────────────────────────────
function MemoryTab() {
  const [data, setData] = useState<MemoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirStats, setDirStats] = useState<DirectoryStat[]>([]);
  const [vocabGaps, setVocabGaps] = useState<VocabGap[]>([]);
  const [tagMismatches, setTagMismatches] = useState<TagMismatch[]>([]);
  const [showDir, setShowDir] = useState(false);
  const [showVocab, setShowVocab] = useState(false);
  const [showMismatches, setShowMismatches] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(BASE + '/memory');
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadDirStats = useCallback(async (snapshotId: string) => {
    const res = await fetch(`${BASE}/snapshots/${snapshotId}/directory-stats`);
    if (res.ok) setDirStats(await res.json());
  }, []);

  const loadVocabGaps = useCallback(async () => {
    const res = await fetch(`${BASE}/vocabulary-gaps?limit=50`);
    if (res.ok) setVocabGaps(await res.json());
  }, []);

  const loadTagMismatches = useCallback(async () => {
    const res = await fetch(`${BASE}/tag-mismatches?limit=50`);
    if (res.ok) setTagMismatches(await res.json());
  }, []);

  useEffect(() => {
    if (data?.latest?.snapshot_id) {
      loadDirStats(data.latest.snapshot_id);
      loadVocabGaps();
      loadTagMismatches();
    }
  }, [data, loadDirStats, loadVocabGaps, loadTagMismatches]);

  if (loading) return <div className="text-xs text-ide-text-dim text-center py-8">Loading…</div>;
  if (!data?.latest) {
    return <div className="p-4 text-xs text-ide-text-dim text-center">No crawl data yet. Run the crawler first.</div>;
  }

  const { latest, stats } = data;

  return (
    <div className="p-3 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-ide-text">Last Crawl Summary</span>
        <button onClick={load} className="p-1 text-ide-text-dim hover:text-ide-text">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Latest snapshot overview */}
      <div className="bg-ide-bg border border-ide-border rounded p-2.5 grid grid-cols-2 gap-2 text-[10px]">
        <StatRow label="Snapshot" value={latest.snapshot_id.slice(0, 12) + '…'} />
        <StatRow label="Status" value={latest.status} />
        <StatRow label="Total Devtags" value={String(latest.total_devtags)} />
        <StatRow label="Total Files" value={String(latest.total_files)} />
        <StatRow label="Skipped" value={String(latest.skipped_files_count)} />
        <StatRow label="Parse Time" value={fmt(latest.parse_duration_ms)} />
        <StatRow label="Surplus" value={String(latest.registry_surplus_count)} />
        <StatRow label="Deficit" value={String(latest.registry_deficit_count)} />
        <StatRow label="Content Drift" value={String(latest.content_drift_count)} />
        <StatRow label="Location Drift" value={String(latest.location_drift_count)} />
        <StatRow label="Systemic" value={latest.systemic_drift_flagged ? 'YES ⚠' : 'No'} />
        <StatRow label="Triggered By" value={latest.triggered_by} />
      </div>

      {/* Directory Stats collapsible */}
      <div>
        <button
          onClick={() => setShowDir(v => !v)}
          className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ide-text-dim hover:text-ide-text mb-1 w-full border-b border-ide-border pb-1"
        >
          <ChevronRight className={`w-3 h-3 transition-transform ${showDir ? 'rotate-90' : ''}`} />
          Per-Directory Breakdown ({dirStats.length} dirs)
        </button>
        {showDir && dirStats.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] font-mono border-collapse">
              <thead>
                <tr className="text-ide-text-dim border-b border-ide-border">
                  <th className="text-left py-1 pr-2">Directory</th>
                  <th className="text-right pr-2">Files</th>
                  <th className="text-right pr-2">Devtags</th>
                  <th className="text-right pr-2">Skipped</th>
                  <th className="text-right pr-2">ms</th>
                  <th className="text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {dirStats.map(ds => (
                  <tr key={ds.directory_path} className="border-b border-ide-border/30 hover:bg-ide-bg/50">
                    <td className="py-0.5 pr-2 text-ide-text truncate max-w-[120px]" title={ds.directory_path}>
                      {ds.directory_path || '.'}
                    </td>
                    <td className="text-right pr-2 text-ide-text">{ds.file_count}</td>
                    <td className="text-right pr-2 text-ide-accent">{ds.devtag_count}</td>
                    <td className="text-right pr-2 text-orange-400">{ds.skipped_count}</td>
                    <td className="text-right pr-2 text-ide-text-dim">{ds.parse_duration_ms}</td>
                    <td className="text-right">
                      <span className={`px-1 rounded ${ds.sub_crawler_status === 'complete' ? 'text-green-400' : 'text-red-400'}`}>
                        {ds.sub_crawler_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {showDir && dirStats.length === 0 && (
          <div className="text-xs text-ide-text-dim py-2">No directory stats available.</div>
        )}
      </div>

      {stats && (
        <>
          <Section title="Devtags by Type">
            {stats.typeBreakdown.map(r => (
              <BarRow key={r.devtag_type} label={r.devtag_type} value={r.cnt} max={stats.typeBreakdown[0]?.cnt || 1} />
            ))}
          </Section>

          <Section title="Devtags by Language">
            {stats.langBreakdown.map(r => (
              <BarRow key={r.language} label={r.language} value={r.cnt} max={stats.langBreakdown[0]?.cnt || 1} />
            ))}
          </Section>

          <Section title="Drift Summary">
            {stats.driftSummary.map((r, i) => (
              <div key={i} className="flex items-center gap-2 py-0.5">
                <DriftTypeBadge type={r.drift_type} />
                <SeverityBadge severity={r.severity} />
                <span className="text-xs text-ide-text ml-auto">{r.cnt}</span>
              </div>
            ))}
          </Section>

          {stats.topDriftFiles.length > 0 && (
            <Section title="Top Drift Files">
              {stats.topDriftFiles.map(f => (
                <div key={f.file_path} className="flex items-center gap-2 py-0.5">
                  <span className="text-[10px] text-ide-text font-mono truncate flex-1 min-w-0">{f.file_path}</span>
                  <span className="text-[10px] text-red-400 flex-shrink-0">{f.drift_count} events</span>
                </div>
              ))}
            </Section>
          )}
        </>
      )}

      {/* Vocabulary Gaps */}
      <div>
        <button
          onClick={() => setShowVocab(v => !v)}
          className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400 hover:text-orange-300 mb-1 w-full border-b border-ide-border pb-1"
        >
          <ChevronRight className={`w-3 h-3 transition-transform ${showVocab ? 'rotate-90' : ''}`} />
          Vocabulary Gaps ({vocabGaps.length})
        </button>
        {showVocab && (
          <div className="space-y-1">
            {vocabGaps.length === 0 && <div className="text-xs text-ide-text-dim py-1">No vocabulary gaps.</div>}
            {vocabGaps.map(vg => (
              <div key={vg.entry_id} className="flex items-center gap-2 py-0.5 border-b border-ide-border/30">
                <span className="text-[10px] bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded font-mono flex-shrink-0">
                  {vg.untagged_structure_type}
                </span>
                <span className="text-[10px] font-mono text-ide-text truncate flex-1 min-w-0">{vg.file_path}</span>
                <span className="text-[9px] text-ide-text-dim flex-shrink-0">×{vg.occurrence_count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tag Mismatches */}
      <div>
        <button
          onClick={() => setShowMismatches(v => !v)}
          className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-red-400 hover:text-red-300 mb-1 w-full border-b border-ide-border pb-1"
        >
          <ChevronRight className={`w-3 h-3 transition-transform ${showMismatches ? 'rotate-90' : ''}`} />
          PSC Tag Mismatches ({tagMismatches.length})
        </button>
        {showMismatches && (
          <div className="space-y-1">
            {tagMismatches.length === 0 && <div className="text-xs text-ide-text-dim py-1">No mismatches.</div>}
            {tagMismatches.map(tm => (
              <div key={tm.entry_id} className="flex items-center gap-2 py-0.5 border-b border-ide-border/30">
                <SeverityBadge severity={tm.severity} />
                <span className="text-[10px] font-mono text-ide-text truncate flex-1 min-w-0">{tm.devtag}</span>
                <span className="text-[9px] text-ide-text-dim flex-shrink-0">{tm.mismatch_type}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-ide-text-dim text-[9px] uppercase tracking-wider">{label}</span>
      <span className="text-ide-text font-mono text-[11px]">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ide-text-dim mb-1.5 border-b border-ide-border pb-1">
        {title}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-[10px] text-ide-text-dim font-mono w-24 flex-shrink-0 truncate">{label}</span>
      <div className="flex-1 bg-ide-border rounded-full h-1.5 overflow-hidden">
        <div className="h-full bg-ide-accent/60 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-ide-text font-mono w-10 text-right flex-shrink-0">{value}</span>
    </div>
  );
}
