// ============================================
// HistoryTab — Feeding history viewer
// Extracted from MidwifePanel.tsx
// ============================================
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Check, RefreshCw } from 'lucide-react';

interface HistoryTabProps {
  history: any[];
  onRefresh: () => void;
}

export function HistoryTab({ history, onRefresh }: HistoryTabProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-ide-text-dim">{history.length} entries</span>
        <button onClick={onRefresh} className="p-1 hover:bg-ide-bg rounded text-ide-text-dim hover:text-ide-text">
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {history.length === 0 ? (
        <p className="text-xs text-ide-text-dim text-center py-8">
          No feeding history yet. Start a feeding session to generate training data.
        </p>
      ) : (
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {[...history].reverse().map((entry, i) => {
            const isExpanded = expandedIdx === i;
            return (
              <div
                key={i}
                className="border border-ide-border/50 rounded hover:bg-ide-bg/30 cursor-pointer transition-colors"
                onClick={() => setExpandedIdx(isExpanded ? null : i)}
              >
                <div className="flex items-start gap-2 px-2 py-1.5 text-[10px]">
                  <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${entry.fedToNano ? 'bg-green-400' : 'bg-yellow-400'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {isExpanded ? <ChevronDown className="w-3 h-3 text-ide-text-dim flex-shrink-0" /> : <ChevronRight className="w-3 h-3 text-ide-text-dim flex-shrink-0" />}
                      <span className="text-ide-text font-medium">{entry.taskType}</span>
                      <span className="text-ide-text-dim">{entry.model}</span>
                      {entry.fedToNano && <Check className="w-3 h-3 text-green-400" />}
                      <span className="text-ide-text-dim ml-auto">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                    </div>
                    {!isExpanded && (
                      <div className="text-ide-text-dim truncate mt-0.5 ml-5">{entry.outputSnippet}</div>
                    )}
                  </div>
                </div>
                {isExpanded && (
                  <div className="px-3 py-2 border-t border-ide-border/30 bg-ide-bg/20">
                    {entry.inputSnippet && (
                      <div className="mb-2">
                        <div className="text-[9px] text-ide-accent font-semibold mb-0.5">INPUT / PROMPT</div>
                        <pre className="text-[10px] text-ide-text-dim whitespace-pre-wrap break-words max-h-[120px] overflow-y-auto bg-ide-bg/40 rounded p-1.5">
                          {entry.inputSnippet}
                        </pre>
                      </div>
                    )}
                    <div>
                      <div className="text-[9px] text-green-400 font-semibold mb-0.5">OUTPUT / RESPONSE</div>
                      <pre className="text-[10px] text-ide-text whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto bg-ide-bg/40 rounded p-1.5">
                        {entry.fullOutput || entry.outputSnippet}
                      </pre>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-[9px] text-ide-text-dim">
                      <span>Tokens: {entry.tokensUsed?.toLocaleString() || '?'}</span>
                      <span>Quality: {entry.quality || '?'}</span>
                      <span>{entry.fedToNano ? '✅ Fed to trainer' : '⏳ Not yet fed'}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
