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
  CheckCircle, Clock, Filter, Download } from 'lucide-react';
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
}

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
    load();  // Refresh records
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
    if (!q) return 'text-ide-text-dim';
    if (q >= 80) return 'text-green-400';
    if (q >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="flex flex-col h-full p-3 gap-3 text-xs overflow-y-auto">
      {/* Header controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Fingerprint className="w-4 h-4 text-ide-accent" />
          <span className="font-semibold text-ide-text">BLAME Tracker</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={load} className="p-1.5 text-ide-text-dim hover:text-ide-text rounded hover:bg-ide-bg/50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={exportRecords} className="p-1.5 text-ide-text-dim hover:text-ide-text rounded hover:bg-ide-bg/50" title="Export CSV">
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Model Stats Cards */}
      {stats.length > 0 && (
        <div>
          <div className="text-[10px] text-ide-text-dim uppercase tracking-wider mb-2">Model Performance</div>
          <div className="space-y-1.5">
            {stats.slice(0, 8).map(s => (
              <div key={s.model} className="bg-ide-bg border border-ide-border rounded p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-ide-text font-medium truncate max-w-[140px]" title={s.model}>
                    {s.model.split('/').pop()}
                  </span>
                  <div className="flex items-center gap-1">
                    {s.trend === 'up' && <TrendingUp className="w-3 h-3 text-green-400" />}
                    {s.trend === 'down' && <TrendingDown className="w-3 h-3 text-red-400" />}
                    {s.trend === 'flat' && <Minus className="w-3 h-3 text-ide-text-dim" />}
                    <span className={`font-mono ${qualityColor(s.avgQuality)}`}>
                      {s.avgQuality.toFixed(0)}%
                    </span>
                  </div>
                </div>
                <div className="flex gap-3 text-[10px] text-ide-text-dim">
                  <span>{s.totalRuns} runs</span>
                  <span className={s.successRate > 0.8 ? 'text-green-400' : 'text-yellow-400'}>
                    {(s.successRate * 100).toFixed(0)}% ok
                  </span>
                  <span>{s.avgLatencyMs > 0 ? `${(s.avgLatencyMs / 1000).toFixed(1)}s avg` : ''}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.length === 0 && !loading && (
        <div className="bg-ide-bg border border-ide-border rounded p-3 text-center text-ide-text-dim">
          No BLAME data yet. BLAME records are created automatically as you use the IDE with AI models.
        </div>
      )}

      {/* Crawler controls */}
      <div className="bg-ide-bg border border-ide-border rounded p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-ide-accent" />
            <span className="font-medium text-ide-text">Quality Crawler Agent</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-ide-text-dim">Auto-update</span>
            <button onClick={() => setAutoUpdate(v => !v)}>
              {autoUpdate
                ? <ToggleRight className="w-5 h-5 text-ide-accent" />
                : <ToggleLeft className="w-5 h-5 text-ide-text-dim" />}
            </button>
          </div>
        </div>
        <p className="text-[10px] text-ide-text-dim">
          Crawls all BLAME records + researches current model benchmarks online to suggest optimized model strategy configurations.
        </p>
        <button
          onClick={runCrawler}
          disabled={crawlerRunning}
          className="w-full py-1.5 bg-ide-accent/15 text-ide-accent rounded hover:bg-ide-accent/25 disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {crawlerRunning
            ? <><Loader className="w-3 h-3 animate-spin" /> Running crawler...</>
            : <><Zap className="w-3 h-3" /> Run Crawler</>}
        </button>

        {crawlerLog.length > 0 && (
          <div className="bg-ide-panel rounded p-2 max-h-28 overflow-y-auto font-mono text-[10px] text-ide-text-dim space-y-0.5">
            {crawlerLog.map((log, i) => <div key={i}>{log}</div>)}
          </div>
        )}

        {pendingConfig && (
          <div className="border border-green-500/30 bg-green-500/5 rounded p-2 space-y-1.5">
            <div className="flex items-center gap-1.5 text-green-400">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>New strategy config ready</span>
            </div>
            <div className="text-[10px] text-ide-text-dim font-mono max-h-20 overflow-y-auto">
              {JSON.stringify(pendingConfig, null, 2)}
            </div>
            <div className="flex gap-2">
              <button onClick={applyConfig} className="flex-1 py-1 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 text-[10px]">
                Apply Strategy Update
              </button>
              <button onClick={() => setPendingConfig(null)} className="px-3 py-1 text-ide-text-dim border border-ide-border rounded text-[10px]">
                Discard
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Filters + Records */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="text-[10px] text-ide-text-dim uppercase tracking-wider flex-1">Recent Records ({filteredRecords.length})</div>
          <input
            value={filterModel}
            onChange={e => setFilterModel(e.target.value)}
            placeholder="Filter model..."
            className="w-28 bg-ide-bg border border-ide-border rounded px-1.5 py-0.5 text-[10px] focus:outline-none focus:border-ide-accent"
          />
          <select
            value={filterMode}
            onChange={e => setFilterMode(e.target.value)}
            className="bg-ide-bg border border-ide-border rounded px-1 py-0.5 text-[10px] focus:outline-none"
          >
            <option value="">All modes</option>
            <option value="ask">Ask</option>
            <option value="edit">Edit</option>
            <option value="agent">Agent</option>
            <option value="plan">Plan</option>
          </select>
        </div>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {filteredRecords.slice(0, 50).map(r => (
            <div key={r.id} className="flex items-center gap-2 px-2 py-1.5 bg-ide-bg border border-ide-border/50 rounded text-[10px]">
              <span className="text-ide-text-dim">
                <Bot className="w-3 h-3" />
              </span>
              <span className="text-ide-text truncate flex-1" title={r.model}>
                {r.model.split('/').pop()}
              </span>
              <span className="text-ide-text-dim px-1.5 py-0.5 bg-ide-panel rounded">{r.mode}</span>
              {r.quality !== undefined && (
                <span className={`font-mono ${qualityColor(r.quality)}`}>{r.quality}%</span>
              )}
              {r.success !== undefined && (
                r.success
                  ? <CheckCircle className="w-3 h-3 text-green-400" />
                  : <AlertTriangle className="w-3 h-3 text-red-400" />
              )}
              <span className="text-ide-text-dim">{new Date(r.timestamp).toLocaleTimeString()}</span>
            </div>
          ))}
          {filteredRecords.length === 0 && (
            <div className="text-center py-4 text-ide-text-dim">No records matching filter</div>
          )}
        </div>
      </div>
    </div>
  );
}

// Simple loader icon for crawlerRunning state
function Loader({ className }: { className?: string }) {
  return <RefreshCw className={className} />;
}
