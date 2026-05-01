import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import type { ToolCriticism } from './types.js';

interface Props {
  criticisms: ToolCriticism[];
  loading: boolean;
}

const severityColor = (s?: string) => {
  if (s === 'critical') return 'text-red-500';
  if (s === 'error') return 'text-red-400';
  if (s === 'warning') return 'text-yellow-400';
  return 'text-ide-text-dim';
};

const severityBg = (s?: string) => {
  if (s === 'critical') return 'border-red-500/30 bg-red-500/5';
  if (s === 'error') return 'border-red-400/20 bg-red-400/5';
  return 'border-yellow-400/20 bg-yellow-400/5';
};

export function CriticismsTab({ criticisms, loading }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return <div className="p-3 text-ide-text-dim text-[10px]">Loading criticisms…</div>;
  }

  if (criticisms.length === 0) {
    return (
      <div className="p-3 text-center text-ide-text-dim text-[10px]">
        No tool criticisms yet. Criticisms are generated after 3 consecutive quality failures in the same interaction type.
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      <div className="bg-ide-bg border border-ide-border rounded p-2 text-[9px] text-ide-text-dim">
        Tool criticisms activate when composite quality falls below 0.65 for 3+ consecutive outputs in the same interaction type. Each record proposes specific tool modifications and new tools to address failures.
      </div>

      {criticisms.map(c => {
        const isExpanded = expandedId === c.criticismId;
        const mods = c.proposedToolModifications || [];
        const newTools = c.proposedNewTools || [];
        return (
          <div key={c.criticismId} className={`border rounded ${severityBg(c.severity)}`}>
            <button
              className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-ide-panel/20 rounded-t"
              onClick={() => setExpandedId(prev => prev === c.criticismId ? null : c.criticismId)}
            >
              <AlertTriangle className={`w-3 h-3 flex-shrink-0 ${severityColor(c.severity)}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-ide-text text-[10px] font-medium truncate" title={c.modelId}>
                    {(c.modelId || '').split('/').pop()}
                  </span>
                  <span className="text-[9px] text-ide-text-dim bg-ide-panel/60 px-1 rounded">{c.interactionType}</span>
                  <span className={`text-[9px] uppercase font-medium ${severityColor(c.severity)}`}>{c.severity || 'error'}</span>
                </div>
                <div className="text-[9px] text-ide-text-dim truncate">{c.failurePattern}</div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[9px] text-ide-text-dim/60">{new Date(c.timestamp).toLocaleDateString()}</span>
                {isExpanded ? <ChevronDown className="w-3 h-3 text-ide-text-dim" /> : <ChevronRight className="w-3 h-3 text-ide-text-dim" />}
              </div>
            </button>

            {isExpanded && (
              <div className="px-3 pb-3 pt-2 border-t border-ide-border/30 space-y-3">

                {/* Failing dimensions */}
                {c.failingQualityDimensions?.length > 0 && (
                  <div>
                    <div className="text-[9px] text-ide-text-dim uppercase tracking-wider mb-1">Failing Dimensions</div>
                    <div className="flex flex-wrap gap-1">
                      {c.failingQualityDimensions.map(d => (
                        <span key={d} className="text-[9px] px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded border border-red-500/20">
                          {d.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Criticism text */}
                {c.criticism && (
                  <div>
                    <div className="text-[9px] text-ide-text-dim uppercase tracking-wider mb-1">Analysis</div>
                    <div className="text-[9px] text-ide-text bg-ide-panel/40 rounded px-2 py-1.5 border border-ide-border/30">
                      {c.criticism}
                    </div>
                  </div>
                )}

                {/* Active tool configs */}
                {c.activeToolConfigs?.length > 0 && (
                  <div>
                    <div className="text-[9px] text-ide-text-dim uppercase tracking-wider mb-1">Active Tool Configs</div>
                    <div className="flex flex-wrap gap-1">
                      {c.activeToolConfigs.map(t => (
                        <span key={t} className="text-[9px] px-1.5 py-0.5 bg-ide-panel/60 text-ide-text rounded border border-ide-border/40">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Proposed modifications */}
                {mods.length > 0 && (
                  <div>
                    <div className="text-[9px] text-ide-text-dim uppercase tracking-wider mb-1.5">Proposed Tool Modifications ({mods.length})</div>
                    <div className="space-y-1.5">
                      {mods.map((m: any, i) => (
                        <div key={i} className="rounded border border-ide-border/40 bg-ide-panel/30 px-2 py-1.5 text-[9px]">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-ide-text font-medium">{m.tool_config_id || 'unknown_tool'}</span>
                            <div className="flex items-center gap-1">
                              <span className={`uppercase text-[8px] px-1 rounded ${m.priority === 'high' ? 'bg-red-500/15 text-red-400' : m.priority === 'medium' ? 'bg-yellow-500/15 text-yellow-400' : 'bg-ide-panel text-ide-text-dim'}`}>
                                {m.priority || 'low'}
                              </span>
                              <span className="text-ide-text-dim">{m.modification_type?.replace(/_/g, ' ')}</span>
                            </div>
                          </div>
                          <div className="text-ide-text-dim">{m.modification_detail}</div>
                          {m.expected_impact_dimension && (
                            <div className="mt-0.5 text-[8px] text-ide-text-dim/70">
                              impact: {m.expected_impact_direction} → {m.expected_impact_dimension}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Proposed new tools */}
                {newTools.length > 0 && (
                  <div>
                    <div className="text-[9px] text-ide-text-dim uppercase tracking-wider mb-1.5">Proposed New Tools ({newTools.length})</div>
                    <div className="space-y-1.5">
                      {newTools.map((t: any, i) => (
                        <div key={i} className="rounded border border-blue-500/20 bg-blue-500/5 px-2 py-1.5 text-[9px]">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <Wrench className="w-3 h-3 text-blue-400 flex-shrink-0" />
                            <span className="text-blue-300 font-medium">{t.tool_name || 'unnamed'}</span>
                          </div>
                          <div className="text-ide-text-dim mb-0.5">{t.tool_purpose}</div>
                          {t.target_model_tiers && (
                            <div className="text-[8px] text-ide-text-dim/70">
                              Tiers: {Array.isArray(t.target_model_tiers) ? t.target_model_tiers.join(', ') : t.target_model_tiers}
                            </div>
                          )}
                          {t.intended_interaction_types && (
                            <div className="text-[8px] text-ide-text-dim/70">
                              For: {Array.isArray(t.intended_interaction_types) ? t.intended_interaction_types.join(', ') : t.intended_interaction_types}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Scale info */}
                {c.scalesToModelTiers?.length > 0 && (
                  <div className="text-[9px] text-ide-text-dim">
                    Scales to tiers: {c.scalesToModelTiers.join(', ')}
                    {c.suggestedJobId && <span className="ml-2 text-[8px]">job: {c.suggestedJobId.slice(0, 8)}…</span>}
                  </div>
                )}

                <div className="text-[9px] text-ide-text-dim/50">
                  {c.criticismId} · {new Date(c.timestamp).toLocaleString()}
                  {c.cycleId && <span className="ml-2">cycle: {c.cycleId}</span>}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
