import React from 'react';
import { AlertTriangle, Bot, CheckCircle } from 'lucide-react';
import type { BlameRecord } from './types.js';
import { qualityColor } from './ui.js';

interface Props {
  records: BlameRecord[];
  filterModel: string;
  filterMode: string;
  onFilterModelChange: (value: string) => void;
  onFilterModeChange: (value: string) => void;
}

export function RecordsTab({
  records,
  filterModel,
  filterMode,
  onFilterModelChange,
  onFilterModeChange,
}: Props) {
  const filteredRecords = records.filter(r => {
    if (filterModel && !r.model.toLowerCase().includes(filterModel.toLowerCase())) return false;
    if (filterMode && r.mode !== filterMode) return false;
    return true;
  });

  return (
    <div className="p-3">
      <div className="flex gap-2 mb-2">
        <input
          value={filterModel}
          onChange={e => onFilterModelChange(e.target.value)}
          placeholder="Filter model..."
          className="flex-1 bg-ide-bg border border-ide-border rounded px-2 py-1 text-[10px] focus:outline-none focus:border-ide-accent"
        />
        <select
          value={filterMode}
          onChange={e => onFilterModeChange(e.target.value)}
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
  );
}
