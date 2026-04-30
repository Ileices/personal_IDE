import React from 'react';
import { CheckCircle, Globe, RefreshCw, ToggleLeft, ToggleRight, Zap } from 'lucide-react';
import type { ModelStats } from './types.js';
import { qualityColor } from './ui.js';

interface Props {
  stats: ModelStats[];
  autoUpdate: boolean;
  crawlerRunning: boolean;
  crawlerLog: string[];
  pendingConfig: any;
  onToggleAutoUpdate: () => void;
  onRunCrawler: () => void;
  onApplyConfig: () => void;
  onDiscardConfig: () => void;
}

export function AnalysisTab({
  stats,
  autoUpdate,
  crawlerRunning,
  crawlerLog,
  pendingConfig,
  onToggleAutoUpdate,
  onRunCrawler,
  onApplyConfig,
  onDiscardConfig,
}: Props) {
  const avgQuality = stats.length > 0 ? stats.reduce((a, s) => a + s.avgQuality, 0) / stats.length : 0;
  const bestModel = stats.slice().sort((a, b) => b.avgQuality - a.avgQuality)[0]?.model || '---';

  return (
    <div className="p-3 space-y-3">
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
              <span className={qualityColor(avgQuality)}>{avgQuality.toFixed(0)}%</span>
            </div>
            <div className="text-ide-text-dim">Best Model</div>
            <div className="text-right text-ide-text truncate" title={bestModel}>
              {bestModel.split('/').pop()}
            </div>
          </div>
        </div>
      )}

      <div className="bg-ide-bg border border-ide-border rounded p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-ide-accent" />
            <span className="font-medium text-ide-text text-[10px]">Quality Crawler</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="text-ide-text-dim">Auto</span>
            <button onClick={onToggleAutoUpdate}>
              {autoUpdate
                ? <ToggleRight className="w-4 h-4 text-ide-accent" />
                : <ToggleLeft className="w-4 h-4 text-ide-text-dim" />}
            </button>
          </div>
        </div>

        <p className="text-[9px] text-ide-text-dim leading-relaxed">
          Analyzes all BLAME records. Identifies failing models and proposes strategy updates.
        </p>

        <button
          onClick={onRunCrawler}
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
              <button
                onClick={onApplyConfig}
                className="flex-1 py-1 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 text-[10px]"
              >
                Apply Update
              </button>
              <button
                onClick={onDiscardConfig}
                className="px-2 py-1 text-ide-text-dim border border-ide-border rounded text-[10px]"
              >
                Discard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
