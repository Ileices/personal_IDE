import React, { useState } from 'react';
import { Award, ChevronDown, ChevronRight } from 'lucide-react';
import type { BlameSuccess } from './types.js';
import { qualityColor } from './ui.js';

interface Props {
  successes: BlameSuccess[];
  loading: boolean;
}

export function SuccessesTab({ successes, loading }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return <div className="p-3 text-ide-text-dim text-[10px]">Loading success attributions…</div>;
  }

  if (successes.length === 0) {
    return (
      <div className="p-3 text-center text-ide-text-dim text-[10px]">
        No success attributions yet. Attributions are recorded after 3 consecutive outputs above 0.85 composite quality in the same interaction type.
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      <div className="bg-ide-bg border border-ide-border rounded p-2 text-[9px] text-ide-text-dim">
        Success attributions capture exact conditions that produced high-quality outputs. These are forwarded to Suggested Jobs as <span className="text-green-400">model_config_promotion</span> within 2 cycles.
      </div>

      {successes.map(s => {
        const isExpanded = expandedId === s.successId;
        const avgScore = s.compositeQualityScoreAvg ?? 0;
        return (
          <div key={s.successId} className="border border-green-500/20 bg-green-500/5 rounded">
            <button
              className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-ide-panel/20 rounded-t"
              onClick={() => setExpandedId(prev => prev === s.successId ? null : s.successId)}
            >
              <Award className="w-3 h-3 flex-shrink-0 text-green-400" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-ide-text text-[10px] font-medium truncate" title={s.modelId}>
                    {(s.modelId || '').split('/').pop()}
                  </span>
                  <span className="text-[9px] text-ide-text-dim bg-ide-panel/60 px-1 rounded">{s.interactionType}</span>
                  <span className="text-[9px] text-green-400">streak ×{s.consecutiveCount}</span>
                </div>
                <div className="text-[9px] text-ide-text-dim">
                  {new Date(s.timestamp).toLocaleString()}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className={`font-mono text-[11px] font-semibold ${qualityColor(avgScore * 100)}`}>
                  {Math.round(avgScore * 100)}%
                </span>
                {isExpanded ? <ChevronDown className="w-3 h-3 text-ide-text-dim" /> : <ChevronRight className="w-3 h-3 text-ide-text-dim" />}
              </div>
            </button>

            {isExpanded && (
              <div className="px-3 pb-3 pt-2 border-t border-green-500/20 space-y-2">
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[9px]">
                  <div className="text-ide-text-dim">Composite Avg</div>
                  <div className={`text-right font-mono ${qualityColor(avgScore * 100)}`}>{(avgScore * 100).toFixed(1)}%</div>
                  <div className="text-ide-text-dim">Consecutive Count</div>
                  <div className="text-right text-green-400 font-semibold">{s.consecutiveCount}</div>
                  <div className="text-ide-text-dim">Model Tier</div>
                  <div className="text-right text-ide-text">{s.modelTier ?? '—'}</div>
                  <div className="text-ide-text-dim">Context Size</div>
                  <div className="text-right text-ide-text">{s.contextSizeTokens ? `${s.contextSizeTokens.toLocaleString()} tok` : '—'}</div>
                </div>

                {s.tagTypesInvolved?.length > 0 && (
                  <div>
                    <div className="text-[9px] text-ide-text-dim uppercase tracking-wider mb-1">Tag Types Involved</div>
                    <div className="flex flex-wrap gap-1">
                      {s.tagTypesInvolved.slice(0, 20).map(t => (
                        <span key={t} className="text-[9px] px-1.5 py-0.5 bg-green-500/10 text-green-300 rounded border border-green-500/20">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {s.toolConfigIds?.length > 0 && (
                  <div>
                    <div className="text-[9px] text-ide-text-dim uppercase tracking-wider mb-1">Tool Configs Active</div>
                    <div className="flex flex-wrap gap-1">
                      {s.toolConfigIds.map(t => (
                        <span key={t} className="text-[9px] px-1.5 py-0.5 bg-ide-panel/60 text-ide-text rounded border border-ide-border/40">{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                {s.promptStructureIds?.length > 0 && (
                  <div>
                    <div className="text-[9px] text-ide-text-dim uppercase tracking-wider mb-1">Prompt Structure IDs</div>
                    <div className="flex flex-wrap gap-1">
                      {s.promptStructureIds.map(t => (
                        <span key={t} className="text-[9px] px-1.5 py-0.5 bg-ide-panel/60 text-ide-text rounded border border-ide-border/40">{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-[9px] text-ide-text-dim/50">
                  {s.successId} · {s.cycleId ? `cycle: ${s.cycleId}` : ''}
                  {s.suggestedJobId && <span className="ml-2">→ job: {s.suggestedJobId.slice(0, 8)}…</span>}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
