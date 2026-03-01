// ============================================
// ToggleRow — Reusable boolean toggle with label
// Extracted from MidwifePanel.tsx
// ============================================
import React from 'react';
import { ToggleLeft, ToggleRight } from 'lucide-react';

interface ToggleRowProps {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

export function ToggleRow({ label, description, value, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-xs text-ide-text">{label}</div>
        <div className="text-[10px] text-ide-text-dim">{description}</div>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`p-0.5 rounded transition-colors ${value ? 'text-green-400' : 'text-ide-text-dim'}`}
      >
        {value ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
      </button>
    </div>
  );
}
