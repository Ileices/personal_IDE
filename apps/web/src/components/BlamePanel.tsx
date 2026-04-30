// ============================================
// BLAME Panel — Model Quality & Attribution Tracking
//
// Every AI-generated output is "blamed" on the
// specific model + mode that produced it.
// This panel shows quality metrics, lets you
// trigger the crawler agent, and manage
// auto-update of model strategy configs.
// ============================================
import React, { useState, useEffect } from 'react';
import { Fingerprint, RefreshCw, TrendingUp, TrendingDown, Minus,
  Bot, BarChart2, Zap, Globe, ToggleLeft, ToggleRight, AlertTriangle,
  CheckCircle, Clock, Filter, Download, ChevronDown, ChevronRight,
  Target, Activity, Brain, Shield, Star, Layers } from 'lucide-react';
import { API_BASE } from '../config.js';

interface BlameRecord {
  id: string;
  model: string;
  mode: string;
  projectId?: string;
  timestamp: string;
  quality?: number;     // 0-100 score
  tokenCount?: number;
  taskType?: string;    // 'code_gen' | 'refactor' | 'explain' | 'plan' | 'agent_step'
  success?: boolean;
  errorType?: string;
  filePath?: string;
  latencyMs?: number;
}

interface ModelStats {
  model: string;
  totalRuns: number;
  successRate: number;
  avgQuality: number;
  avgLatencyMs: number;
  totalTokens: number;
  lastUsed: string;
  trend: 'up' | 'down' | 'flat';
  // quality dimensions (optional enrichment)
  tagConformance?: number;
  hallucination?: number;
  instructionAdherence?: number;
  structuralIntegrity?: number;
  outputEfficiency?: number;
}

type TabId = 'models' | 'records' | 'analysis';

export function BlamePanel() {
  const [records, setRecords] = useState<BlameRecord[]>([]);
  const [stats, setStats] = useState<ModelStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [crawlerRunning, setCrawlerRunning] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [pendingConfig, setPendingConfig] = useState<any>(null);
  const [filterModel, setFilterModel] = useState('');
  const [filterMode, setFilterMode] = useState('');
  const [crawlerLog, setCrawlerLog] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('models');
  const [expandedModel, setExpandedModel] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/blame/records?limit=100`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
        setStats(data.stats || []);
      }
    } catch { /* server may not have this endpoint yet — show empty state */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const runCrawler = async () => {
    setCrawlerRunning(true);
    setCrawlerLog(['Starting BLAME crawler...']);
    try {
      const res = await fetch(`${API_BASE}/api/blame/crawl`, { method: 'POST' });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          chunk.split('\n').filter(Boolean).forEach(line => {
            try {
              const ev = JSON.parse(line.replace('data: ', ''));
              if (ev.log) setCrawlerLog(prev => [...prev.slice(-50), ev.log]);
              if (ev.config) setPendingConfig(ev.config);
            } catch { setCrawlerLog(prev => [...prev.slice(-50), line]); }
          });
        }
      }
    } catch (err: any) {
      setCrawlerLog(prev => [...prev, `Error: ${err.message}`]);
    }
    setCrawlerRunning(false);
    load();
  };

  const applyConfig = async () => {
    if (!pendingConfig) return;
    try {
      await fetch(`${API_BASE}/api/blame/apply-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: pendingConfig }),
      });
      setPendingConfig(null);
      setCrawlerLog(prev => [...prev, '✓ Model strategy updated from BLAME data']);
    } catch (err: any) {
      setCrawlerLog(prev => [...prev, `Error applying config: ${err.message}`]);
    }
  };

  const exportRecords = () => {
    const csv = [
      'model,mode,quality,success,taskType,latencyMs,timestamp',
      ...records.map(r =>
        `"${r.model}","${r.mode}",${r.quality ?? ''},${r.success},${r.taskType ?? ''},${r.latencyMs ?? ''},"${r.timestamp}"`
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `blame-export-${Date.now()}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const filteredRecords = records.filter(r => {
    if (filterModel && !r.model.toLowerCase().includes(filterModel.toLowerCase())) return false;
    if (filterMode && r.mode !== filterMode) return false;
    return true;
  });

  const qualityColor = (q?: number) => {
    if (q === undefined || q === null) return 'text-ide-text-dim';
    if (q >= 80) return 'text-green-400';
    if (q >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  const qualityBar = (score: number, color: string) => (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1 bg-ide-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </div>
      <span className="text-[9px] font-mono w-6 text-right text-ide-text-dim">{Math.round(score)}</span>
    </div>
  );

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'models', label: 'Models', icon: <Bot className="w-3 h-3" /> },
    { id: 'records', label: 'Records', icon: <Layers className="w-3 h-3" /> },
    { id: 'analysis', label: 'Analysis', icon: <Activity className="w-3 h-3" /> },
  ];

  return (
    <div className="flex flex-col h-full text-xs overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-ide-border flex-shrink-0 bg-ide-panel">
        <div className="flex items-center gap-1.5">
          <Fingerprint className="w-4 h-4 text-ide-accent" />
          <span className="font-semibold text-ide-text">BLAME Tracker</span>
          {records.length > 0 && (
            <span className="text-[9px] px-1.5 bg-ide-accent/15 text-ide-accent rounded">{records.length}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={load} className="p-1.5 text-ide-text-dim hover:text-ide-text rounded hover:bg-ide-bg/50" title="Refresh">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={exportRecords} className="p-1.5 text-ide-text-dim hover:text-ide-text rounded hover:bg-ide-bg/50" title="Export CSV">
            <Download className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-ide-border flex-shrink-0 bg-ide-panel">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1 px-3 py-1.5 text-[10px] font-medium border-b-2 transition-colors ${
              activeTab === t.id
                ? 'border-ide-accent text-ide-accent'
                : 'border-transparent text-ide-text-dim hover:text-ide-text'
            }`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {/* ── Models Tab ── */}
        {activeTab === 'models' && (
          <div className="p-3 space-y-2">
            {stats.length === 0 && !loading && (
              <div className="bg-ide-bg border border-ide-border rounded p-3 text-center text-ide-text-dim">
                No BLAME data yet. Records are created as you use AI models.
              </div>
            )}
            {stats.slice(0, 12).map(s => {
              const isExpanded = expandedModel === s.model;
              const hasDimensions = s.tagConformance !== undefined;
              return (
                <div key={s.model} className="bg-ide-bg border border-ide-border rounded">
                  <button
                    className="w-full flex items-center gap-2 p-2 hover:bg-ide-panel/30 rounded transition-colors"
                    onClick={() => setExpandedModel(isExpanded ? null : s.model)}
                  >
                    <Bot className="w-3 h-3 text-ide-text-dim flex-shrink-0" />
                    <span className="text-ide-text font-medium truncate flex-1 text-left" title={s.model}>
                      {s.model.split('/').pop() || s.model}
                    </span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {s.trend === 'up' && <TrendingUp className="w-3 h-3 text-green-400" />}
                      {s.trend === 'down' && <TrendingDown className="w-3 h-3 text-red-400" />}
                      {s.trend === 'flat' && <Minus className="w-3 h-3 text-ide-text-dim" />}
                      <span className={`font-mono text-[11px] ${qualityColor(s.avgQuality)}`}>
                        {s.avgQuality?.toFixed(0) ?? '--'}%
                      </span>
                      {isExpanded ? <ChevronDown className="w-3 h-3 text-ide-text-dim" /> : <ChevronRight className="w-3 h-3 text-ide-text-dim" />}
                    </div>
                  </button>

                  {/* Summary stats row */}
                  <div className="flex gap-3 px-2 pb-1.5 text-[9px] text-ide-text-dim">
                    <span>{s.totalRuns} runs</span>
                    <span className={s.successRate > 0.8 ? 'text-green-400' : s.successRate > 0.6 ? 'text-yellow-400' : 'text-red-400'}>
                      {(s.successRate * 100).toFixed(0)}% success
                    </span>
                    {s.avgLatencyMs > 0 && <span>{(s.avgLatencyMs / 1000).toFixed(1)}s avg</span>}
                    {s.totalTokens > 0 && <span>{(s.totalTokens / 1000).toFixed(0)}K tok</span>}
                  </div>

                  {/* Expanded quality dimensions */}
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-ide-border/40 pt-2 space-y-1.5">
                      <div className="text-[9px] text-ide-text-dim uppercase tracking-wider mb-2">Quality Dimensions</div>
                      {hasDimensions ? (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-ide-text-dim w-28">Tag Conformance</span>
                            {qualityBar(s.tagConformance! * 100, 'bg-green-500')}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-ide-text-dim w-28">Instr. Adherence</span>
                            {qualityBar((s.instructionAdherence ?? 0) * 100, 'bg-blue-500')}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-ide-text-dim w-28">Hallucination (inv)</span>
                            {qualityBar((1 - (s.hallucination ?? 0)) * 100, 'bg-purple-500')}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-ide-text-dim w-28">Structural Integrity</span>
                            {qualityBar((s.structuralIntegrity ?? 0) * 100, 'bg-yellow-500')}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-ide-text-dim w-28">Output Efficiency</span>
                            {qualityBar((s.outputEfficiency ?? 0) * 100, 'bg-cyan-500')}
                          </div>
                        </>
                      ) : (
                        <div className="text-[9px] text-ide-text-dim">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="w-28">Success Rate</span>
                            {qualityBar(s.successRate * 100, 'bg-green-500')}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-28">Avg Quality</span>
                            {qualityBar(s.avgQuality || 0, 'bg-blue-500')}
                          </div>
                          <div className="mt-1.5 text-[9px] text-ide-text-dim/60">
                            Full dimensions available after running the Quality Crawler
                          </div>
                        </div>
                      )}
                      <div className="mt-1 text-[9px] text-ide-text-dim">
                        Last used: {new Date(s.lastUsed).toLocaleDateString()}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Records Tab ── */}
        {activeTab === 'records' && (
          <div className="p-3">
            {/* Filters */}
            <div className="flex gap-2 mb-2">
              <input
                value={filterModel}
                onChange={e => setFilterModel(e.target.value)}
                placeholder="Filter model..."
                className="flex-1 bg-ide-bg border border-ide-border rounded px-2 py-1 text-[10px] focus:outline-none focus:border-ide-accent"
              />
              <select
                value={filterMode}
                onChange={e => setFilterMode(e.target.value)}
                className="bg-ide-bg border border-ide-border rounded px-1.5 py-1 text-[10px] focus:outline-none"
              >
                <option value="">All</option>
                <option value="ask">Ask</option>
                <option value="edit">Edit</option>
                <option value="agent">Agent</option>
                <option value="plan">Plan</option>
              </select>
            </div>
            <div className="text-[9px] text-ide-text-dim mb-1.5">{filteredRecords.length} records</div>
            <div className="space-y-1">
              {filteredRecords.slice(0, 60).map(r => (
                <div key={r.id} className="flex items-center gap-2 px-2 py-1.5 bg-ide-bg border border-ide-border/50 rounded">
                  <Bot className="w-3 h-3 text-ide-text-dim flex-shrink-0" />
                  <span className="text-ide-text truncate flex-1" title={r.model}>
                    {(r.model || '').split('/').pop()}
                  </span>
                  <span className="text-[9px] text-ide-text-dim px-1 py-0.5 bg-ide-panel rounded">{r.mode}</span>
                  {r.quality !== undefined && (
                    <span className={`font-mono text-[9px] ${qualityColor(r.quality)}`}>{r.quality}%</span>
                  )}
                  {r.success !== undefined && (
                    r.success
                      ? <CheckCircle className="w-2.5 h-2.5 text-green-400 flex-shrink-0" />
                      : <AlertTriangle className="w-2.5 h-2.5 text-red-400 flex-shrink-0" />
                  )}
                  {r.latencyMs && (
                    <span className="text-[9px] text-ide-text-dim">{(r.latencyMs / 1000).toFixed(1)}s</span>
                  )}
                  <span className="text-[9px] text-ide-text-dim flex-shrink-0">
                    {new Date(r.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
              {filteredRecords.length === 0 && (
                <div className="text-center py-6 text-ide-text-dim">No records matching filter</div>
              )}
            </div>
          </div>
        )}

        {/* ── Analysis / Crawler Tab ── */}
        {activeTab === 'analysis' && (
          <div className="p-3 space-y-3">
            {/* Quick summary */}
            {stats.length > 0 && (
              <div className="bg-ide-bg border border-ide-border rounded p-2.5">
                <div className="text-[10px] font-semibold text-ide-text mb-2">Fleet Summary</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                  <div className="text-ide-text-dim">Total Models</div>
                  <div className="text-ide-text text-right">{stats.length}</div>
                  <div className="text-ide-text-dim">Total Runs</div>
                  <div className="text-ide-text text-right">{stats.reduce((a, s) => a + s.totalRuns, 0)}</div>
                  <div className="text-ide-text-dim">Avg Quality</div>
                  <div className="text-right">
                    <span className={qualityColor(stats.reduce((a, s) => a + s.avgQuality, 0) / stats.length)}>
                      {(stats.reduce((a, s) => a + s.avgQuality, 0) / stats.length).toFixed(0)}%
                    </span>
                  </div>
                  <div className="text-ide-text-dim">Best Model</div>
                  <div className="text-right text-ide-text truncate" title={stats.slice().sort((a, b) => b.avgQuality - a.avgQuality)[0]?.model}>
                    {(stats.slice().sort((a, b) => b.avgQuality - a.avgQuality)[0]?.model || '—').split('/').pop()}
                  </div>
                </div>
              </div>
            )}

            {/* Crawler panel */}
            <div className="bg-ide-bg border border-ide-border rounded p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-ide-accent" />
                  <span className="font-medium text-ide-text text-[10px]">Quality Crawler</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="text-ide-text-dim">Auto</span>
                  <button onClick={() => setAutoUpdate(v => !v)}>
                    {autoUpdate
                      ? <ToggleRight className="w-4 h-4 text-ide-accent" />
                      : <ToggleLeft className="w-4 h-4 text-ide-text-dim" />}
                  </button>
                </div>
              </div>
              <p className="text-[9px] text-ide-text-dim leading-relaxed">
                Analyzes all BLAME records. Identifies failing models, tool configs that need updating, and routes improvements to Suggested Jobs.
              </p>
              <button
                onClick={runCrawler}
                disabled={crawlerRunning}
                className="w-full py-1.5 bg-ide-accent/15 text-ide-accent rounded hover:bg-ide-accent/25 disabled:opacity-50 flex items-center justify-center gap-1.5 text-[10px]"
              >
                {crawlerRunning
                  ? <><RefreshCw className="w-3 h-3 animate-spin" /> Running...</>
                  : <><Zap className="w-3 h-3" /> Run Crawler</>}
              </button>

              {crawlerLog.length > 0 && (
                <div className="bg-ide-panel rounded p-2 max-h-24 overflow-y-auto font-mono text-[9px] text-ide-text-dim space-y-0.5">
                  {crawlerLog.map((log, i) => <div key={i}>{log}</div>)}
                </div>
              )}

              {pendingConfig && (
                <div className="border border-green-500/30 bg-green-500/5 rounded p-2 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-green-400 text-[10px]">
                    <CheckCircle className="w-3 h-3" />
                    <span>Strategy config ready</span>
                  </div>
                  <div className="text-[9px] text-ide-text-dim font-mono max-h-16 overflow-y-auto">
                    {JSON.stringify(pendingConfig, null, 2)}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={applyConfig}
                      className="flex-1 py-1 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 text-[10px]">
                      Apply Update
                    </button>
                    <button onClick={() => setPendingConfig(null)}
                      className="px-2 py-1 text-ide-text-dim border border-ide-border rounded text-[10px]">
                      Discard
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
