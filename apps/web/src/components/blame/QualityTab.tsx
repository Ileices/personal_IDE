import React, { useState } from 'react';
import type { QualityRecord } from './types.js';
import { qualityBar, qualityColor } from './ui.js';

interface Props {
  quality: QualityRecord[];
  loading: boolean;
}

const WEIGHTS: Record<string, number> = {
  'Tag Conformance': 0.30,
  'Hallucination (inv)': 0.20,
  'Instr. Adherence': 0.15,
  'Struct. Integrity': 0.15,
  'Output Efficiency': 0.10,
  'Context Utilization': 0.05,
  'Regression Risk (inv)': 0.05,
};

export function QualityTab({ quality, loading }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return <div className="p-3 text-ide-text-dim text-[10px]">Loading quality records…</div>;
  }

  if (quality.length === 0) {
    return (
      <div className="p-3 text-center text-ide-text-dim text-[10px]">
        No quality records yet. Records are generated after each model output.
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      {/* Weight legend */}
      <div className="bg-ide-bg border border-ide-border rounded p-2">
        <div className="text-[9px] text-ide-text-dim uppercase tracking-wider mb-1.5">Composite Score Weights</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[9px]">
          {Object.entries(WEIGHTS).map(([dim, w]) => (
            <div key={dim} className="flex justify-between">
              <span className="text-ide-text-dim">{dim}</span>
              <span className="text-ide-text font-mono">{(w * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Records */}
      {quality.map(q => {
        const isExpanded = expandedId === q.qualityId;
        const composite = q.compositeQualityScore ?? 0;
        return (
          <div key={q.qualityId} className="bg-ide-bg border border-ide-border rounded">
            <button
              className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-ide-panel/30 rounded-t text-left"
              onClick={() => setExpandedId(prev => prev === q.qualityId ? null : q.qualityId)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-ide-text text-[10px] font-medium truncate" title={q.modelId}>
                    {(q.modelName || q.modelId || '').split('/').pop()}
                  </span>
                  {q.interactionType && (
                    <span className="text-[9px] text-ide-text-dim bg-ide-panel/60 px-1 rounded">{q.interactionType}</span>
                  )}
                </div>
                <div className="text-[9px] text-ide-text-dim">
                  {new Date(q.timestamp).toLocaleString()}
                </div>
              </div>
              <span className={`font-mono text-[11px] font-semibold flex-shrink-0 ${qualityColor(composite * 100)}`}>
                {Math.round(composite * 100)}%
              </span>
            </button>

            {isExpanded && (
              <div className="px-3 pb-3 pt-2 border-t border-ide-border/40 space-y-1.5">
                <div className="text-[9px] text-ide-text-dim uppercase tracking-wider mb-2">Quality Dimensions</div>

                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-ide-text-dim w-32">Tag Conformance (30%)</span>
                  {qualityBar((q.tagConformanceScore ?? 0) * 100, 'bg-green-500')}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-ide-text-dim w-32">Hallucination inv (20%)</span>
                  {qualityBar((1 - (q.hallucinationRate ?? 0)) * 100, 'bg-purple-500')}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-ide-text-dim w-32">Instr. Adherence (15%)</span>
                  {qualityBar((q.instructionAdherenceScore ?? 0) * 100, 'bg-blue-500')}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-ide-text-dim w-32">Struct. Integrity (15%)</span>
                  {qualityBar((q.structuralIntegrityScore ?? 0) * 100, 'bg-yellow-500')}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-ide-text-dim w-32">Output Efficiency (10%)</span>
                  {qualityBar((q.outputEfficiencyScore ?? 0) * 100, 'bg-cyan-500')}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-ide-text-dim w-32">Context Util. (5%)</span>
                  {qualityBar((q.contextUtilizationScore ?? 0) * 100, 'bg-orange-400')}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-ide-text-dim w-32">Regression inv (5%)</span>
                  {qualityBar((1 - (q.regressionRiskScore ?? 0)) * 100, 'bg-pink-400')}
                </div>

                {q.failureModes && q.failureModes.length > 0 && (
                  <div className="mt-1.5 pt-1.5 border-t border-ide-border/30">
                    <div className="text-[9px] text-ide-text-dim uppercase tracking-wider mb-1">Failure Modes</div>
                    <div className="flex flex-wrap gap-1">
                      {q.failureModes.map(f => (
                        <span key={f} className="text-[9px] px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded border border-red-500/20">
                          {f.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-[9px] text-ide-text-dim/60 pt-1">
                  blame_id: {q.blameId}
                  {q.cycleId && <span className="ml-2">cycle: {q.cycleId}</span>}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
