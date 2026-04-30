// ============================================
// BLAME Panel — Model Quality & Attribution Tracking
//
// Every AI-generated output is "blamed" on the
// specific model + mode that produced it.
// This panel shows quality metrics, lets you
// trigger the crawler agent, and manage
// auto-update of model strategy configs.
// ============================================
import React, { useEffect, useState } from 'react';
import { Activity, Bot, Download, Fingerprint, Layers, RefreshCw } from 'lucide-react';
import { API_BASE } from '../config.js';
import { AnalysisTab } from './blame/AnalysisTab.js';
import { ModelsTab } from './blame/ModelsTab.js';
import { RecordsTab } from './blame/RecordsTab.js';
import type { BlameRecord, ModelStats, TabId } from './blame/types.js';

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

  useEffect(() => {
    if (!autoUpdate || !pendingConfig) return;
    applyConfig();
  }, [autoUpdate, pendingConfig]);

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
        {activeTab === 'models' && (
          <ModelsTab
            stats={stats}
            loading={loading}
            expandedModel={expandedModel}
            onToggleExpanded={(model) => setExpandedModel(prev => prev === model ? null : model)}
          />
        )}

        {activeTab === 'records' && (
          <RecordsTab
            records={records}
            filterModel={filterModel}
            filterMode={filterMode}
            onFilterModelChange={setFilterModel}
            onFilterModeChange={setFilterMode}
          />
        )}

        {activeTab === 'analysis' && (
          <AnalysisTab
            stats={stats}
            autoUpdate={autoUpdate}
            crawlerRunning={crawlerRunning}
            crawlerLog={crawlerLog}
            pendingConfig={pendingConfig}
            onToggleAutoUpdate={() => setAutoUpdate(v => !v)}
            onRunCrawler={runCrawler}
            onApplyConfig={applyConfig}
            onDiscardConfig={() => setPendingConfig(null)}
          />
        )}
      </div>
    </div>
  );
}
