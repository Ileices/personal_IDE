// ============================================
// Shared UI Widgets — reusable micro-components
// extracted from NanoSeaControls for DRY use
// across panels (NanoSea, OpenClaw, Agent, etc.)
// ============================================
import React, { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

/** Small colored badge for status labels */
export function Badge({ children, color = 'blue' }: { children: React.ReactNode; color?: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-500/15 text-blue-400',
    green: 'bg-green-500/15 text-green-400',
    red: 'bg-red-500/15 text-red-400',
    yellow: 'bg-yellow-500/15 text-yellow-400',
    purple: 'bg-purple-500/15 text-purple-400',
    gray: 'bg-white/5 text-ide-text-dim',
    cyan: 'bg-cyan-500/15 text-cyan-400',
  };
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${colors[color] || colors.blue}`}>
      {children}
    </span>
  );
}

/** Collapsible section with icon, title, and optional badge */
export function Section({ title, icon: Icon, children, defaultOpen = true, badge }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-ide-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-ide-bg/50 hover:bg-ide-bg/80 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-ide-accent" />
          <span className="text-xs font-semibold">{title}</span>
          {badge}
        </div>
        {open ? <ChevronUp className="w-3 h-3 text-ide-text-dim" /> : <ChevronDown className="w-3 h-3 text-ide-text-dim" />}
      </button>
      {open && <div className="p-3 space-y-2">{children}</div>}
    </div>
  );
}

/** Toggle switch with label and optional description */
export function Toggle({ checked, onChange, label, desc, disabled }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  desc?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-2.5 ${disabled ? 'opacity-40' : 'cursor-pointer'}`}>
      <div
        onClick={() => !disabled && onChange(!checked)}
        className={`w-8 h-4.5 flex-shrink-0 rounded-full transition-colors relative mt-0.5 ${
          checked ? 'bg-ide-accent' : 'bg-ide-border'
        }`}
        style={{ minWidth: 32, height: 18 }}
      >
        <div
          className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[15px]' : 'translate-x-[2px]'
          }`}
          style={{ width: 14, height: 14 }}
        />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium">{label}</div>
        {desc && <div className="text-[10px] text-ide-text-dim">{desc}</div>}
      </div>
    </label>
  );
}

/** Range slider with label and value display */
export function Slider({ value, onChange, min = 0, max = 100, label, suffix = '%' }: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label: string;
  suffix?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-xs text-ide-accent font-mono">{value}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-ide-border rounded-full appearance-none cursor-pointer accent-ide-accent"
      />
    </div>
  );
}

/** Generic async JSON fetcher */
export async function fetchJson<T = any>(url: string, opts?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, opts);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
