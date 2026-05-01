import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart2,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Cpu,
  Database,
  FileText,
  Play,
  RefreshCw,
  TrendingUp,
  Wrench,
} from 'lucide-react';

const API = 'http://localhost:3001/api/gap';

type GapTab =
  | 'summary'
  | 'coverage'
  | 'patterns'
  | 'debt'
  | 'tag-system'
  | 'performance'
  | 'tools'
  | 'reports';

type ToolSpec = {
  id: string;
  label: string;
  method: 'GET' | 'POST';
  endpoint: string;
  fields: Array<{
    key: string;
    label: string;
    placeholder?: string;
  }>;
  buildRequest: (values: Record<string, string>) => {
    path?: string;
    body?: Record<string, unknown>;
  };
};

const SEVERITY_BG: Record<string, string> = {
  info: 'bg-blue-500/10 text-blue-400',
  warning: 'bg-yellow-500/10 text-yellow-400',
  error: 'bg-orange-500/10 text-orange-400',
  critical: 'bg-red-500/10 text-red-400',
  fatal: 'bg-red-700/20 text-red-500',
};

const COVERAGE_BG: Record<string, string> = {
  covered: 'bg-green-500/10 text-green-400',
  partial: 'bg-yellow-500/10 text-yellow-400',
  missing: 'bg-red-500/10 text-red-400',
  not_required: 'bg-gray-500/10 text-gray-400',
};

async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(`${API}${path}`, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `${response.status} ${response.statusText}`);
  }
  return response.json();
}

function toNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function csvToList(value: string) {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-56 overflow-x-auto overflow-y-auto whitespace-pre-wrap break-all rounded bg-ide-input/50 p-2 text-[9px] text-ide-text">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mx-3 mt-2 rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[9px] text-red-300">
      {message}
    </div>
  );
}

function SevBadge({ severity }: { severity: string }) {
  return (
    <span className={`rounded px-1 py-0.5 text-[8px] font-bold uppercase ${SEVERITY_BG[severity] ?? 'bg-gray-500/10 text-gray-400'}`}>
      {severity}
    </span>
  );
}

function CoverageBadge({ state }: { state: string }) {
  return (
    <span className={`rounded px-1 py-0.5 text-[8px] font-bold uppercase ${COVERAGE_BG[state] ?? 'bg-gray-500/10 text-gray-400'}`}>
      {state}
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
  color = 'text-ide-text',
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded border border-ide-border/30 bg-ide-input/30 p-2 text-center">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[9px] text-ide-text-dim">{label}</div>
      {sub ? <div className="mt-0.5 text-[8px] text-ide-text-dim/70">{sub}</div> : null}
    </div>
  );
}

function RunButton({
  label,
  onClick,
  loading,
  icon: Icon = Play,
}: {
  label: string;
  onClick: () => void;
  loading?: boolean;
  icon?: React.ElementType;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-1 rounded border border-green-500/20 bg-green-500/20 px-2 py-1 text-[9px] text-green-400 transition-colors hover:bg-green-500/30 disabled:opacity-50"
    >
      <Icon size={9} />
      {loading ? 'Running...' : label}
    </button>
  );
}

function ExpandableRow({
  summary,
  details,
  badge,
}: {
  summary: React.ReactNode;
  details: React.ReactNode;
  badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-ide-border/30 transition-colors hover:bg-ide-hover/20">
      <button
        onClick={() => setOpen(current => !current)}
        className="flex w-full items-start gap-1.5 px-2 py-1.5 text-left"
      >
        {open ? (
          <ChevronDown size={9} className="mt-0.5 flex-shrink-0 text-ide-text-dim" />
        ) : (
          <ChevronRight size={9} className="mt-0.5 flex-shrink-0 text-ide-text-dim" />
        )}
        <div className="min-w-0 flex-1 text-[10px] text-ide-text">{summary}</div>
        {badge}
      </button>
      {open ? <div className="px-4 pb-2">{details}</div> : null}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="p-4 text-center text-[10px] text-ide-text-dim">{label}</div>;
}

function SummaryTab() {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await requestJson('/summary'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load summary');
    } finally {
      setLoading(false);
    }
  }, []);

  const runAnalysis = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      await requestJson('/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: `session_${Date.now()}`,
          cycle_range: [0, Date.now()],
        }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run analysis');
    } finally {
      setRunning(false);
    }
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-ide-border px-3 py-2 flex-shrink-0">
        <RunButton label="Run Full Analysis" onClick={() => void runAnalysis()} loading={running} />
        <button onClick={() => void load()} className="text-ide-text-dim hover:text-ide-accent">
          <RefreshCw size={11} />
        </button>
      </div>
      <ErrorBanner message={error} />
      {loading && !summary ? <EmptyState label="Loading summary..." /> : null}
      {summary ? (
        <div className="space-y-3 p-3">
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Total Reports" value={summary.total_reports ?? 0} />
            <StatCard label="God Factory Flags" value={summary.god_factory_flags ?? 0} color="text-red-400" />
            <StatCard label="Coverage" value={`${summary.latest_coverage_pct ?? 0}%`} color="text-green-400" />
            <StatCard label="Debt" value={summary.total_debt_score ?? 0} color="text-yellow-400" />
            <StatCard label="Patterns" value={summary.pattern_count ?? 0} />
          </div>
          <div className="space-y-1">
            {['coverage', 'structural', 'process', 'tag_system', 'agent_performance'].map(category => (
              <div key={category} className="flex items-center justify-between border-b border-ide-border/20 px-2 py-1 text-[10px]">
                <span className="capitalize text-ide-text-dim">{category.replace(/_/g, ' ')}</span>
                <span className={(summary[category] ?? 0) > 0 ? 'font-bold text-orange-400' : 'font-bold text-green-400'}>
                  {summary[category] ?? 0}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CoverageTab() {
  const [data, setData] = useState<any>(null);
  const [scope, setScope] = useState('total');
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await requestJson(`/coverage?scope=${encodeURIComponent(scope)}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load coverage');
    } finally {
      setLoading(false);
    }
  }, [scope]);

  const runCoverage = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      await requestJson('/coverage/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cycle_id: String(Date.now()) }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run coverage');
    } finally {
      setRunning(false);
    }
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-ide-border px-3 py-2 flex-shrink-0">
        <select
          value={scope}
          onChange={event => setScope(event.target.value)}
          className="rounded border border-ide-border bg-ide-input px-1 py-0.5 text-[9px] text-ide-text"
        >
          {['total', 'plan', 'test', 'nano'].map(item => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <RunButton label="Run Coverage" onClick={() => void runCoverage()} loading={running} />
        <button onClick={() => void load()} className="text-ide-text-dim hover:text-ide-accent">
          <RefreshCw size={11} />
        </button>
      </div>
      <ErrorBanner message={error} />
      {data?.stats ? (
        <div className="grid grid-cols-4 gap-1 border-b border-ide-border px-3 py-2">
          <StatCard label="Total" value={data.stats.total} />
          <StatCard label="Covered" value={data.stats.covered} color="text-green-400" />
          <StatCard label="Partial" value={data.stats.partial} color="text-yellow-400" />
          <StatCard label="Missing" value={data.stats.missing} color="text-red-400" />
        </div>
      ) : null}
      <div className="flex-1 overflow-y-auto">
        {loading && !data ? <EmptyState label="Loading coverage..." /> : null}
        {!loading && data?.records?.length ? data.records.map((record: any, index: number) => (
          <ExpandableRow
            key={record.entry_id ?? index}
            summary={
              <div className="flex items-center gap-2">
                <span className="font-mono">[{record.scope}] {record.plantag_or_devtag}</span>
                <span className="text-ide-text-dim">{record.coverage_percent}%</span>
              </div>
            }
            badge={<CoverageBadge state={record.coverage_state} />}
            details={
              record.missing_tags?.length ? (
                <div className="space-y-1 text-[9px] text-ide-text-dim">
                  <div className="text-ide-text">Missing tags</div>
                  {record.missing_tags.map((tag: string) => (
                    <div key={tag} className="rounded bg-red-500/5 px-1.5 py-0.5 font-mono text-red-300">{tag}</div>
                  ))}
                </div>
              ) : (
                <div className="text-[9px] text-green-400">Fully covered</div>
              )
            }
          />
        )) : null}
        {!loading && (!data?.records || data.records.length === 0) ? <EmptyState label="No coverage records yet" /> : null}
      </div>
    </div>
  );
}

function PatternsTab() {
  const [patterns, setPatterns] = useState<any[]>([]);
  const [trendById, setTrendById] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [minRecurrence, setMinRecurrence] = useState('1');
  const [antiOnly, setAntiOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('min_recurrence', String(toNumber(minRecurrence, 1)));
      if (antiOnly) params.set('anti_pattern_only', 'true');
      const result = await requestJson(`/patterns?${params.toString()}`);
      setPatterns(result.patterns ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load patterns');
    } finally {
      setLoading(false);
    }
  }, [antiOnly, minRecurrence]);

  const runCrawl = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      await requestJson('/patterns/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_cycle: Date.now() }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to crawl patterns');
    } finally {
      setRunning(false);
    }
  }, [load]);

  const loadTrend = useCallback(async (patternId: string) => {
    if (!patternId || trendById[patternId]) return;
    try {
      const trend = await requestJson(`/patterns/${encodeURIComponent(patternId)}/trend?cycle_window=10`);
      setTrendById(current => ({ ...current, [patternId]: trend }));
    } catch {
      setTrendById(current => ({ ...current, [patternId]: { error: true } }));
    }
  }, [trendById]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-ide-border px-3 py-2 flex-shrink-0">
        <span className="text-[9px] text-ide-text-dim">Min recurrence</span>
        <input
          value={minRecurrence}
          onChange={event => setMinRecurrence(event.target.value)}
          className="w-12 rounded border border-ide-border bg-ide-input px-1 py-0.5 text-[9px] text-ide-text"
        />
        <label className="flex items-center gap-1 text-[9px] text-ide-text-dim">
          <input type="checkbox" checked={antiOnly} onChange={event => setAntiOnly(event.target.checked)} className="h-3 w-3" />
          Anti only
        </label>
        <RunButton label="Crawl Patterns" onClick={() => void runCrawl()} loading={running} />
        <button onClick={() => void load()} className="text-ide-text-dim hover:text-ide-accent">
          <RefreshCw size={11} />
        </button>
      </div>
      <ErrorBanner message={error} />
      <div className="flex-1 overflow-y-auto">
        {loading && !patterns.length ? <EmptyState label="Loading patterns..." /> : null}
        {!loading && patterns.length ? patterns.map((pattern, index) => (
          <ExpandableRow
            key={pattern.pattern_id ?? index}
            summary={
              <div className="flex items-center gap-2">
                {pattern.is_anti_pattern ? (
                  <span className="rounded bg-purple-500/10 px-1 py-0.5 text-[8px] font-bold text-purple-400">ANTI</span>
                ) : null}
                <span className="font-mono">{pattern.failure_type}</span>
                <span className="text-[9px] text-ide-text-dim">x{pattern.recurrence_count}</span>
                <span className="text-[9px] text-ide-text-dim">{pattern.severity_trend}</span>
              </div>
            }
            badge={<SevBadge severity={pattern.severity ?? 'warning'} />}
            details={
              <div className="space-y-1 text-[9px] text-ide-text-dim">
                <div>Devtag type: <span className="text-ide-text">{pattern.devtag_type}</span></div>
                <div>Agent category: <span className="text-ide-text">{pattern.agent_category}</span></div>
                <div>Build phase: <span className="text-ide-text">{pattern.build_phase || 'n/a'}</span></div>
                {pattern.anti_pattern_type ? <div>Anti-pattern: <span className="text-purple-400">{pattern.anti_pattern_type}</span></div> : null}
                {pattern.flagged_to_god_factory ? <div className="font-semibold text-red-400">Flagged to God Factory</div> : null}
                <div>
                  <button
                    onClick={() => void loadTrend(pattern.pattern_id)}
                    className="rounded bg-blue-500/10 px-2 py-0.5 text-[9px] text-blue-300 hover:bg-blue-500/20"
                  >
                    Load Trend
                  </button>
                </div>
                {trendById[pattern.pattern_id] ? <JsonBlock value={trendById[pattern.pattern_id]} /> : null}
              </div>
            }
          />
        )) : null}
        {!loading && !patterns.length ? <EmptyState label="No patterns detected" /> : null}
      </div>
    </div>
  );
}

function DebtTab() {
  const [heatmap, setHeatmap] = useState<any[]>([]);
  const [threshold, setThreshold] = useState('15');
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await requestJson(`/debt/heatmap?threshold=${encodeURIComponent(threshold)}`);
      setHeatmap(result.files ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load debt heatmap');
    } finally {
      setLoading(false);
    }
  }, [threshold]);

  const compute = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      await requestJson('/debt/compute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cycle_id: String(Date.now()) }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to compute debt');
    } finally {
      setRunning(false);
    }
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-ide-border px-3 py-2 flex-shrink-0">
        <span className="text-[9px] text-ide-text-dim">Threshold</span>
        <input
          value={threshold}
          onChange={event => setThreshold(event.target.value)}
          className="w-12 rounded border border-ide-border bg-ide-input px-1 py-0.5 text-[9px] text-ide-text"
        />
        <RunButton label="Compute Debt" onClick={() => void compute()} loading={running} />
        <button onClick={() => void load()} className="text-ide-text-dim hover:text-ide-accent">
          <RefreshCw size={11} />
        </button>
      </div>
      <ErrorBanner message={error} />
      <div className="flex-1 overflow-y-auto">
        {loading && !heatmap.length ? <EmptyState label="Loading debt heatmap..." /> : null}
        {!loading && heatmap.length ? heatmap.map((entry, index) => (
          <ExpandableRow
            key={entry.file_path ?? index}
            summary={
              <div className="flex items-center gap-2">
                {entry.ceiling_exceeded ? <span className="rounded bg-red-500/10 px-1 py-0.5 text-[8px] font-bold text-red-400">OVER</span> : null}
                <span className="max-w-[150px] truncate font-mono text-[9px]">{entry.file_path}</span>
                <span className={entry.ceiling_exceeded ? 'font-bold text-red-400' : 'font-bold text-yellow-400'}>{entry.debt_score}</span>
              </div>
            }
            badge={entry.excluded_from_assignment ? <span className="rounded bg-gray-500/10 px-1 py-0.5 text-[8px] text-gray-400">EXCL</span> : undefined}
            details={
              <div className="space-y-1 text-[9px] text-ide-text-dim">
                <div>Ceiling: {entry.ceiling}</div>
                <div>Excluded: {entry.excluded_from_assignment ? 'yes' : 'no'}</div>
                <JsonBlock value={entry.score_breakdown ?? {}} />
              </div>
            }
          />
        )) : null}
        {!loading && !heatmap.length ? <EmptyState label="No files meet the current debt threshold" /> : null}
      </div>
    </div>
  );
}

function TagSystemTab() {
  const [subTab, setSubTab] = useState<'vocabulary' | 'collisions' | 'utilization' | 'latency'>('vocabulary');
  const [vocabulary, setVocabulary] = useState<any[]>([]);
  const [collisions, setCollisions] = useState<any[]>([]);
  const [utilization, setUtilization] = useState<any>(null);
  const [slowResolutions, setSlowResolutions] = useState<any[]>([]);
  const [latencyReport, setLatencyReport] = useState<any>(null);
  const [latencyInputs, setLatencyInputs] = useState({ tag_type: '*', model_tier: '*' });
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [vocabResult, collisionResult, utilizationResult, slowResult] = await Promise.all([
        requestJson('/tag-system/vocabulary-gaps'),
        requestJson('/tag-system/collisions'),
        requestJson('/tag-system/utilization'),
        requestJson('/tag-system/slow-resolutions'),
      ]);
      setVocabulary(vocabResult.gaps ?? []);
      setCollisions(collisionResult.collisions ?? []);
      setUtilization(utilizationResult);
      setSlowResolutions(slowResult.flags ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tag system analysis');
    } finally {
      setLoading(false);
    }
  }, []);

  const runAnalysis = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      await requestJson('/tag-system/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cycle_id: String(Date.now()) }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run tag system analysis');
    } finally {
      setRunning(false);
    }
  }, [load]);

  const resolveVocabulary = useCallback(async (entryId: string) => {
    await requestJson(`/tag-system/vocabulary-gaps/${encodeURIComponent(entryId)}/resolve`, { method: 'POST' });
    setVocabulary(current => current.filter(item => item.entry_id !== entryId));
  }, []);

  const resolveCollision = useCallback(async (entryId: string) => {
    await requestJson(`/tag-system/collisions/${encodeURIComponent(entryId)}/resolve`, { method: 'POST' });
    setCollisions(current => current.filter(item => item.entry_id !== entryId));
  }, []);

  const queryLatency = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        tag_type: latencyInputs.tag_type || '*',
        model_tier: latencyInputs.model_tier || '*',
      });
      setLatencyReport(await requestJson(`/tag-system/resolution-latency?${params.toString()}`));
    } catch (err) {
      setLatencyReport({ error: err instanceof Error ? err.message : 'Failed to load resolution latency' });
    }
  }, [latencyInputs]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-ide-border px-3 py-2 flex-shrink-0">
        <RunButton label="Run Tag Analysis" onClick={() => void runAnalysis()} loading={running} />
        <button onClick={() => void load()} className="text-ide-text-dim hover:text-ide-accent">
          <RefreshCw size={11} />
        </button>
      </div>
      <div className="flex border-b border-ide-border flex-shrink-0">
        {[
          ['vocabulary', `Vocab (${vocabulary.length})`],
          ['collisions', `Collisions (${collisions.length})`],
          ['utilization', 'Utilization'],
          ['latency', `Latency (${slowResolutions.length})`],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSubTab(id as 'vocabulary' | 'collisions' | 'utilization' | 'latency')}
            className={`border-b-2 px-2 py-1 text-[9px] transition-colors ${subTab === id ? 'border-blue-400 text-blue-300' : 'border-transparent text-ide-text-dim hover:text-ide-text'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <ErrorBanner message={error} />
      <div className="flex-1 overflow-y-auto">
        {loading && !vocabulary.length && !collisions.length && !utilization ? <EmptyState label="Loading tag analysis..." /> : null}
        {!loading && subTab === 'vocabulary' ? (
          vocabulary.length ? vocabulary.map((gap, index) => (
            <ExpandableRow
              key={gap.entry_id ?? index}
              summary={<span className="font-mono text-[9px]">{gap.untagged_structure_type} in {gap.file_path}</span>}
              badge={<span className="text-[9px] text-yellow-400">x{gap.occurrence_count}</span>}
              details={
                <div className="space-y-1 text-[9px] text-ide-text-dim">
                  <div>Proposed tag: <span className="font-mono text-blue-300">{gap.proposed_tag_type || 'n/a'}</span></div>
                  <button
                    onClick={() => void resolveVocabulary(gap.entry_id)}
                    className="rounded bg-green-500/20 px-2 py-0.5 text-[9px] text-green-400 hover:bg-green-500/30"
                  >
                    Mark Resolved
                  </button>
                </div>
              }
            />
          )) : <EmptyState label="No vocabulary gaps detected" />
        ) : null}
        {!loading && subTab === 'collisions' ? (
          collisions.length ? collisions.map((collision, index) => (
            <ExpandableRow
              key={collision.entry_id ?? index}
              summary={<span className="font-mono text-[9px] text-orange-400">{collision.devtag_name}</span>}
              details={
                <div className="space-y-1 text-[9px] text-ide-text-dim">
                  <div>File A: <span className="font-mono text-ide-text">{collision.file_a}</span></div>
                  <div>File B: <span className="font-mono text-ide-text">{collision.file_b}</span></div>
                  <div>Parent A: <span className="font-mono text-ide-text">{collision.parent_a || 'n/a'}</span></div>
                  <div>Parent B: <span className="font-mono text-ide-text">{collision.parent_b || 'n/a'}</span></div>
                  <button
                    onClick={() => void resolveCollision(collision.entry_id)}
                    className="rounded bg-green-500/20 px-2 py-0.5 text-[9px] text-green-400 hover:bg-green-500/30"
                  >
                    Mark Resolved
                  </button>
                </div>
              }
            />
          )) : <EmptyState label="No tag collisions detected" />
        ) : null}
        {!loading && subTab === 'utilization' ? (
          utilization ? (
            <div className="space-y-3 p-3 text-[10px]">
              <div className="grid grid-cols-2 gap-2">
                <StatCard label="Total Types" value={utilization.total_types ?? 0} />
                <StatCard label="Never Used" value={utilization.never_used_types?.length ?? 0} color="text-red-400" />
              </div>
              <div>
                <div className="mb-1 text-[9px] text-ide-text-dim">God Factory Only</div>
                {utilization.god_factory_only_types?.length ? utilization.god_factory_only_types.map((item: string) => (
                  <div key={item} className="px-1 font-mono text-[9px] text-orange-300">{item}</div>
                )) : <div className="text-[9px] text-ide-text-dim">None</div>}
              </div>
              <div>
                <div className="mb-1 text-[9px] text-ide-text-dim">Well Used Types</div>
                {utilization.well_used_types?.length ? utilization.well_used_types.map((item: any) => (
                  <div key={item.tag_type} className="flex justify-between px-1 text-[9px]">
                    <span className="font-mono text-ide-text">{item.tag_type}</span>
                    <span className="text-green-400">x{item.count}</span>
                  </div>
                )) : <div className="text-[9px] text-ide-text-dim">None</div>}
              </div>
            </div>
          ) : <EmptyState label="No utilization data" />
        ) : null}
        {!loading && subTab === 'latency' ? (
          <div className="space-y-3 p-3">
            <div className="space-y-1">
              <div className="text-[9px] text-ide-text-dim">Query resolution latency</div>
              <div className="flex gap-2">
                <input
                  value={latencyInputs.tag_type}
                  onChange={event => setLatencyInputs(current => ({ ...current, tag_type: event.target.value }))}
                  placeholder="tag type"
                  className="flex-1 rounded border border-ide-border bg-ide-input px-2 py-1 text-[9px] text-ide-text"
                />
                <input
                  value={latencyInputs.model_tier}
                  onChange={event => setLatencyInputs(current => ({ ...current, model_tier: event.target.value }))}
                  placeholder="model tier"
                  className="w-24 rounded border border-ide-border bg-ide-input px-2 py-1 text-[9px] text-ide-text"
                />
                <button
                  onClick={() => void queryLatency()}
                  className="rounded bg-blue-500/10 px-2 py-1 text-[9px] text-blue-300 hover:bg-blue-500/20"
                >
                  Query
                </button>
              </div>
            </div>
            {latencyReport ? <JsonBlock value={latencyReport} /> : null}
            <div>
              <div className="mb-1 text-[9px] text-ide-text-dim">Slow resolutions</div>
              {slowResolutions.length ? slowResolutions.map((entry, index) => (
                <ExpandableRow
                  key={`${entry.tag_type}-${entry.model_tier}-${index}`}
                  summary={<span className="font-mono text-[9px]">{entry.tag_type} @ {entry.model_tier}</span>}
                  badge={<span className="text-[9px] text-red-400">{entry.average_ms}ms</span>}
                  details={<JsonBlock value={entry} />}
                />
              )) : <EmptyState label="No slow resolution types" />}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PerformanceTab() {
  const [summary, setSummary] = useState<any>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryResult, latestResult] = await Promise.all([
        requestJson('/performance/summary'),
        requestJson('/performance/latest'),
      ]);
      setSummary(summaryResult);
      setAgents(latestResult.agents ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agent performance');
    } finally {
      setLoading(false);
    }
  }, []);

  const compute = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      await requestJson('/performance/compute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cycle_id: String(Date.now()) }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to compute agent performance');
    } finally {
      setRunning(false);
    }
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-ide-border px-3 py-2 flex-shrink-0">
        <RunButton label="Compute Metrics" onClick={() => void compute()} loading={running} />
        <button onClick={() => void load()} className="text-ide-text-dim hover:text-ide-accent">
          <RefreshCw size={11} />
        </button>
      </div>
      <ErrorBanner message={error} />
      {summary ? (
        <div className="grid grid-cols-3 gap-1 border-b border-ide-border px-3 py-2">
          <StatCard label="Agents" value={summary.total_agents ?? 0} />
          <StatCard label="Low Conformance" value={summary.low_conformance?.length ?? 0} color="text-orange-400" />
          <StatCard label="High Escalation" value={summary.high_escalation?.length ?? 0} color="text-red-400" />
        </div>
      ) : null}
      <div className="flex-1 overflow-y-auto">
        {loading && !agents.length ? <EmptyState label="Loading agent performance..." /> : null}
        {!loading && agents.length ? agents.map((agent, index) => (
          <ExpandableRow
            key={agent.entry_id ?? index}
            summary={
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${agent.conformance_rate >= 70 ? 'bg-green-400' : 'bg-red-400'}`} />
                <span className="font-mono text-[9px]">{agent.agent_id}</span>
                <span className="text-[9px] text-ide-text-dim">{agent.conformance_rate?.toFixed?.(1) ?? agent.conformance_rate}%</span>
              </div>
            }
            badge={agent.conformance_rate < 70 ? <span className="rounded bg-red-500/10 px-1 py-0.5 text-[8px] text-red-400">FLAGGED</span> : undefined}
            details={<JsonBlock value={agent} />}
          />
        )) : null}
        {!loading && !agents.length ? <EmptyState label="No agent performance records yet" /> : null}
      </div>
    </div>
  );
}

function ReportsTab() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', '100');
      if (category) params.set('gap_category', category);
      if (flaggedOnly) params.set('flagged_only', 'true');
      const result = await requestJson(`/reports?${params.toString()}`);
      const nextReports = (result.reports ?? []).filter((report: any) => !severity || report.severity === severity);
      setReports(nextReports);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [category, flaggedOnly, severity]);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      await requestJson('/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: `session_${Date.now()}`, cycle_range: [0, Date.now()] }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run full analysis');
    } finally {
      setRunning(false);
    }
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-ide-border px-3 py-2 flex-shrink-0">
        <RunButton label="Run Full Analysis" onClick={() => void run()} loading={running} />
        <select value={category} onChange={event => setCategory(event.target.value)} className="rounded border border-ide-border bg-ide-input px-1 py-0.5 text-[9px] text-ide-text">
          <option value="">all categories</option>
          <option value="coverage">coverage</option>
          <option value="structural">structural</option>
          <option value="process">process</option>
          <option value="tag_system">tag_system</option>
          <option value="agent_performance">agent_performance</option>
        </select>
        <select value={severity} onChange={event => setSeverity(event.target.value)} className="rounded border border-ide-border bg-ide-input px-1 py-0.5 text-[9px] text-ide-text">
          <option value="">all severities</option>
          <option value="info">info</option>
          <option value="warning">warning</option>
          <option value="error">error</option>
          <option value="critical">critical</option>
          <option value="fatal">fatal</option>
        </select>
        <label className="flex items-center gap-1 text-[9px] text-ide-text-dim">
          <input type="checkbox" checked={flaggedOnly} onChange={event => setFlaggedOnly(event.target.checked)} className="h-3 w-3" />
          God only
        </label>
        <button onClick={() => void load()} className="text-ide-text-dim hover:text-ide-accent">
          <RefreshCw size={11} />
        </button>
      </div>
      <ErrorBanner message={error} />
      <div className="flex-1 overflow-y-auto">
        {loading && !reports.length ? <EmptyState label="Loading reports..." /> : null}
        {!loading && reports.length ? reports.map((report, index) => (
          <ExpandableRow
            key={report.report_id ?? index}
            summary={
              <div className="flex items-center gap-2">
                {report.flagged_to_god_factory ? <span className="rounded bg-red-500/10 px-1 py-0.5 text-[8px] font-bold text-red-400">GOD</span> : null}
                <span className="capitalize">{report.gap_category?.replace(/_/g, ' ')}</span>
                <span className="text-[9px] text-ide-text-dim">{new Date(report.timestamp).toLocaleString()}</span>
              </div>
            }
            badge={<SevBadge severity={report.severity ?? 'info'} />}
            details={<JsonBlock value={report} />}
          />
        )) : null}
        {!loading && !reports.length ? <EmptyState label="No reports found for the current filters" /> : null}
      </div>
    </div>
  );
}

function ToolsTab() {
  const toolSpecs: ToolSpec[] = useMemo(() => [
    {
      id: 'gap-scan',
      label: 'gap_scan',
      method: 'POST',
      endpoint: '/tools/gap-scan',
      fields: [
        { key: 'scope', label: 'scope', placeholder: 'total' },
        { key: 'depth', label: 'depth', placeholder: '1' },
        { key: 'tag_filter', label: 'tag_filter csv', placeholder: 'route,test' },
      ],
      buildRequest: values => ({
        body: {
          scope: values.scope || 'total',
          depth: toNumber(values.depth, 1),
          tag_filter: csvToList(values.tag_filter || ''),
        },
      }),
    },
    {
      id: 'coverage-check',
      label: 'coverage_check',
      method: 'GET',
      endpoint: '/tools/coverage-check',
      fields: [{ key: 'plantag_id', label: 'plantag_id', placeholder: 'plantag:...' }],
      buildRequest: values => ({ path: `/tools/coverage-check/${encodeURIComponent(values.plantag_id || '')}` }),
    },
    {
      id: 'debt-score',
      label: 'debt_score',
      method: 'GET',
      endpoint: '/tools/debt-score',
      fields: [
        { key: 'file_path', label: 'file_path', placeholder: 'apps/server/src/index.ts' },
        { key: 'cycle_id', label: 'cycle_id', placeholder: 'manual' },
      ],
      buildRequest: values => ({
        path: `/tools/debt-score?file_path=${encodeURIComponent(values.file_path || '')}&cycle_id=${encodeURIComponent(values.cycle_id || 'manual')}`,
      }),
    },
    {
      id: 'pattern-query',
      label: 'pattern_query',
      method: 'POST',
      endpoint: '/tools/pattern-query',
      fields: [
        { key: 'forensic_table', label: 'forensic_table', placeholder: 'patterns' },
        { key: 'failure_type', label: 'failure_type', placeholder: 'regression' },
        { key: 'devtag_type', label: 'devtag_type', placeholder: 'route' },
        { key: 'agent_category', label: 'agent_category', placeholder: 'fleet' },
        { key: 'build_phase', label: 'build_phase', placeholder: 'commit' },
        { key: 'min_recurrence', label: 'min_recurrence', placeholder: '3' },
      ],
      buildRequest: values => ({
        body: {
          forensic_table: values.forensic_table || 'patterns',
          signature_filter: {
            failure_type: values.failure_type || undefined,
            devtag_type: values.devtag_type || undefined,
            agent_category: values.agent_category || undefined,
            build_phase: values.build_phase || undefined,
          },
          min_recurrence: toNumber(values.min_recurrence, 3),
        },
      }),
    },
    {
      id: 'regression-index',
      label: 'regression_index',
      method: 'GET',
      endpoint: '/tools/regression-index',
      fields: [{ key: 'devtag', label: 'devtag', placeholder: 'devtag:...' }],
      buildRequest: values => ({ path: `/tools/regression-index/${encodeURIComponent(values.devtag || '')}` }),
    },
    {
      id: 'orphan-scan',
      label: 'orphan_scan',
      method: 'GET',
      endpoint: '/tools/orphan-scan',
      fields: [{ key: 'scope', label: 'scope', placeholder: 'total' }],
      buildRequest: values => ({ path: `/tools/orphan-scan?scope=${encodeURIComponent(values.scope || 'total')}` }),
    },
    {
      id: 'conflict-scan',
      label: 'conflict_scan',
      method: 'POST',
      endpoint: '/tools/conflict-scan',
      fields: [{ key: 'devtag_list', label: 'devtag_list csv', placeholder: 'devtag:a,devtag:b' }],
      buildRequest: values => ({ body: { devtag_list: csvToList(values.devtag_list || '') } }),
    },
    {
      id: 'gap-report',
      label: 'gap_report',
      method: 'POST',
      endpoint: '/tools/gap-report',
      fields: [
        { key: 'agent_id', label: 'agent_id', placeholder: 'agent:builder' },
        { key: 'cycle_start', label: 'cycle_start', placeholder: '0' },
        { key: 'cycle_end', label: 'cycle_end', placeholder: '100' },
        { key: 'session_id', label: 'session_id', placeholder: 'manual' },
      ],
      buildRequest: values => ({
        body: {
          agent_id: values.agent_id || '',
          cycle_range: [toNumber(values.cycle_start, 0), toNumber(values.cycle_end, Date.now())],
          session_id: values.session_id || 'manual',
        },
      }),
    },
    {
      id: 'tag-vocab-diff',
      label: 'tag_vocabulary_diff',
      method: 'GET',
      endpoint: '/tools/tag-vocab-diff',
      fields: [
        { key: 'cycle_a', label: 'cycle_a', placeholder: '2024-01-01T00:00:00.000Z' },
        { key: 'cycle_b', label: 'cycle_b', placeholder: new Date().toISOString() },
      ],
      buildRequest: values => ({
        path: `/tools/tag-vocab-diff?cycle_a=${encodeURIComponent(values.cycle_a || '')}&cycle_b=${encodeURIComponent(values.cycle_b || new Date().toISOString())}`,
      }),
    },
    {
      id: 'coverage-matrix',
      label: 'coverage_matrix',
      method: 'GET',
      endpoint: '/tools/coverage-matrix',
      fields: [
        { key: 'scope', label: 'scope', placeholder: 'total' },
        { key: 'phase_filter', label: 'phase_filter', placeholder: 'phase-a' },
      ],
      buildRequest: values => ({
        path: `/tools/coverage-matrix?scope=${encodeURIComponent(values.scope || 'total')}&phase_filter=${encodeURIComponent(values.phase_filter || '')}`,
      }),
    },
    {
      id: 'debt-heatmap',
      label: 'debt_heatmap',
      method: 'GET',
      endpoint: '/tools/debt-heatmap',
      fields: [{ key: 'threshold', label: 'threshold', placeholder: '15' }],
      buildRequest: values => ({ path: `/tools/debt-heatmap?threshold=${encodeURIComponent(values.threshold || '15')}` }),
    },
    {
      id: 'pattern-trend',
      label: 'pattern_trend',
      method: 'GET',
      endpoint: '/tools/pattern-trend',
      fields: [
        { key: 'pattern_id', label: 'pattern_id', placeholder: 'uuid' },
        { key: 'cycle_window', label: 'cycle_window', placeholder: '10' },
      ],
      buildRequest: values => ({
        path: `/tools/pattern-trend/${encodeURIComponent(values.pattern_id || '')}?cycle_window=${encodeURIComponent(values.cycle_window || '10')}`,
      }),
    },
    {
      id: 'conformance-report',
      label: 'agent_conformance_report',
      method: 'GET',
      endpoint: '/tools/conformance-report',
      fields: [
        { key: 'agent_id', label: 'agent_id', placeholder: 'agent:builder' },
        { key: 'cycle_start', label: 'cycle_start', placeholder: '0' },
        { key: 'cycle_end', label: 'cycle_end', placeholder: '100' },
      ],
      buildRequest: values => ({
        path: `/tools/conformance-report/${encodeURIComponent(values.agent_id || '')}?cycle_start=${encodeURIComponent(values.cycle_start || '0')}&cycle_end=${encodeURIComponent(values.cycle_end || String(Date.now()))}`,
      }),
    },
    {
      id: 'resolution-latency',
      label: 'resolution_latency_report',
      method: 'GET',
      endpoint: '/tools/resolution-latency',
      fields: [
        { key: 'tag_type', label: 'tag_type', placeholder: '*' },
        { key: 'model_tier', label: 'model_tier', placeholder: '*' },
      ],
      buildRequest: values => ({
        path: `/tools/resolution-latency?tag_type=${encodeURIComponent(values.tag_type || '*')}&model_tier=${encodeURIComponent(values.model_tier || '*')}`,
      }),
    },
  ], []);

  const [activeToolId, setActiveToolId] = useState(toolSpecs[0]?.id ?? 'gap-scan');
  const [values, setValues] = useState<Record<string, string>>({});
  const [output, setOutput] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const activeTool = toolSpecs.find(tool => tool.id === activeToolId) ?? toolSpecs[0];

  const runTool = useCallback(async () => {
    if (!activeTool) return;
    setLoading(true);
    setError(null);
    setOutput(null);
    try {
      const request = activeTool.buildRequest(values);
      if (activeTool.method === 'GET') {
        const path = request.path || activeTool.endpoint;
        setOutput(await requestJson(path));
      } else {
        setOutput(await requestJson(activeTool.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request.body ?? {}),
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tool execution failed');
    } finally {
      setLoading(false);
    }
  }, [activeTool, values]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ide-border px-3 py-2 flex-shrink-0">
        <div className="flex flex-wrap gap-1">
          {toolSpecs.map(tool => (
            <button
              key={tool.id}
              onClick={() => {
                setActiveToolId(tool.id);
                setOutput(null);
                setError(null);
              }}
              className={`rounded border px-2 py-1 text-[9px] transition-colors ${tool.id === activeToolId ? 'border-blue-500/30 bg-blue-500/20 text-blue-300' : 'border-ide-border text-ide-text-dim hover:text-ide-text'}`}
            >
              {tool.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {activeTool?.fields.map(field => (
          <div key={field.key} className="space-y-0.5">
            <div className="text-[9px] text-ide-text-dim">{field.label}</div>
            <input
              value={values[field.key] ?? ''}
              onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))}
              placeholder={field.placeholder}
              className="w-full rounded border border-ide-border bg-ide-input px-2 py-1 font-mono text-[10px] text-ide-text"
            />
          </div>
        ))}
        <RunButton label={`Run ${activeTool?.label ?? 'tool'}`} onClick={() => void runTool()} loading={loading} icon={Wrench} />
        <ErrorBanner message={error} />
        {output ? <JsonBlock value={output} /> : null}
      </div>
    </div>
  );
}

export function GapAnalysisPanel() {
  const [activeTab, setActiveTab] = useState<GapTab>('summary');

  const tabs: Array<{ id: GapTab; label: string; icon: React.ElementType }> = [
    { id: 'summary', label: 'Summary', icon: BarChart2 },
    { id: 'coverage', label: 'Coverage', icon: CheckCircle },
    { id: 'patterns', label: 'Patterns', icon: Activity },
    { id: 'debt', label: 'Debt', icon: TrendingUp },
    { id: 'tag-system', label: 'Tag Sys.', icon: Database },
    { id: 'performance', label: 'Agents', icon: Cpu },
    { id: 'tools', label: 'Tools', icon: Wrench },
    { id: 'reports', label: 'Reports', icon: FileText },
  ];

  return (
    <div className="flex h-full flex-col text-xs">
      <div className="flex items-center gap-2 border-b border-ide-border px-3 py-2 flex-shrink-0">
        <Activity size={12} className="flex-shrink-0 text-green-400" />
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-ide-text-dim">Gap Analysis</span>
      </div>

      <div className="flex border-b border-ide-border flex-shrink-0 overflow-x-auto scrollbar-none">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1 whitespace-nowrap border-b-2 px-2 py-1.5 text-[9px] font-medium transition-colors ${activeTab === tab.id ? 'border-green-400 text-green-300' : 'border-transparent text-ide-text-dim hover:text-ide-text'}`}
          >
            <tab.icon size={9} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        {activeTab === 'summary' ? <SummaryTab /> : null}
        {activeTab === 'coverage' ? <CoverageTab /> : null}
        {activeTab === 'patterns' ? <PatternsTab /> : null}
        {activeTab === 'debt' ? <DebtTab /> : null}
        {activeTab === 'tag-system' ? <TagSystemTab /> : null}
        {activeTab === 'performance' ? <PerformanceTab /> : null}
        {activeTab === 'tools' ? <ToolsTab /> : null}
        {activeTab === 'reports' ? <ReportsTab /> : null}
      </div>
    </div>
  );
}