import React from 'react';
import type { MemoryAccessMode, MemoryPreset } from './types.js';

const SOURCE_OPTIONS = ['user_note', 'auto_summary', 'agent_log', 'file_summary', 'question_answer'];

interface Props {
  mode: MemoryAccessMode;
  preset: MemoryPreset;
  customSources: string[];
  onModeChange: (mode: MemoryAccessMode) => void;
  onPresetChange: (preset: MemoryPreset) => void;
  onToggleCustomSource: (source: string) => void;
}

export function MemoryAccessBar({
  mode,
  preset,
  customSources,
  onModeChange,
  onPresetChange,
  onToggleCustomSource,
}: Props) {
  return (
    <div className="px-2 pb-1.5 space-y-1.5">
      <div className="grid grid-cols-4 gap-1">
        {(['total', 'self', 'custom', 'preset'] as MemoryAccessMode[]).map(m => (
          <button
            key={m}
            onClick={() => onModeChange(m)}
            className={`text-[9px] py-0.5 rounded border transition-colors ${
              mode === m
                ? 'bg-ide-accent/15 text-ide-accent border-ide-accent/40'
                : 'bg-ide-bg text-ide-text-dim border-ide-border hover:text-ide-text'
            }`}
          >
            {m.toUpperCase()}
          </button>
        ))}
      </div>

      {mode === 'preset' && (
        <select
          value={preset}
          onChange={e => onPresetChange(e.target.value as MemoryPreset)}
          className="w-full text-[10px] bg-ide-bg border border-ide-border rounded px-1.5 py-1 focus:outline-none focus:border-ide-accent"
        >
          <option value="recent_decisions">Preset: Recent Decisions</option>
          <option value="bugs_only">Preset: Bugs Only</option>
          <option value="high_priority">Preset: High Priority</option>
          <option value="agent_activity">Preset: Agent Activity</option>
        </select>
      )}

      {mode === 'custom' && (
        <div className="flex flex-wrap gap-1">
          {SOURCE_OPTIONS.map(source => {
            const active = customSources.includes(source);
            return (
              <button
                key={source}
                onClick={() => onToggleCustomSource(source)}
                className={`text-[8px] px-1.5 py-0.5 rounded border ${
                  active
                    ? 'bg-ide-accent/10 text-ide-accent border-ide-accent/40'
                    : 'bg-ide-bg text-ide-text-dim border-ide-border'
                }`}
              >
                {source.replace('_', ' ')}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
