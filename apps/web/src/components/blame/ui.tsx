import React from 'react';

export const qualityColor = (q?: number) => {
  if (q === undefined || q === null) return 'text-ide-text-dim';
  if (q >= 80) return 'text-green-400';
  if (q >= 60) return 'text-yellow-400';
  return 'text-red-400';
};

export const qualityBar = (score: number, color: string) => (
  <div className="flex items-center gap-1.5">
    <div className="flex-1 h-1 bg-ide-border rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
    </div>
    <span className="text-[9px] font-mono w-6 text-right text-ide-text-dim">{Math.round(score)}</span>
  </div>
);
