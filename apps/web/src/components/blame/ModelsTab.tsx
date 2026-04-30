import React from 'react';
import { Bot, ChevronDown, ChevronRight, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import type { ModelStats } from './types.js';
import { qualityBar, qualityColor } from './ui.js';

interface Props {
  stats: ModelStats[];
  loading: boolean;
  expandedModel: string | null;
  onToggleExpanded: (model: string) => void;
}

export function ModelsTab({ stats, loading, expandedModel, onToggleExpanded }: Props) {
  return (
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
              onClick={() => onToggleExpanded(s.model)}
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

            <div className="flex gap-3 px-2 pb-1.5 text-[9px] text-ide-text-dim">
              <span>{s.totalRuns} runs</span>
              <span className={s.successRate > 0.8 ? 'text-green-400' : s.successRate > 0.6 ? 'text-yellow-400' : 'text-red-400'}>
                {(s.successRate * 100).toFixed(0)}% success
              </span>
              {s.avgLatencyMs > 0 && <span>{(s.avgLatencyMs / 1000).toFixed(1)}s avg</span>}
              {s.totalTokens > 0 && <span>{(s.totalTokens / 1000).toFixed(0)}K tok</span>}
            </div>

            {isExpanded && (
              <div className="px-3 pb-3 border-t border-ide-border/40 pt-2 space-y-1.5">
                <div className="text-[9px] text-ide-text-dim uppercase tracking-wider mb-2">Quality Dimensions</div>
                {hasDimensions ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-ide-text-dim w-28">Tag Conformance</span>
                      {qualityBar((s.tagConformance ?? 0) * 100, 'bg-green-500')}
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
  );
}
