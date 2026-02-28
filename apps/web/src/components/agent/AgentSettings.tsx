// ============================================
// Agent Settings Panel — Configuration toggles and sliders
// Extracted from AgentControls.tsx for component decomposition
// ============================================
import React from 'react';
import {
  Infinity, ShieldOff, Puzzle, Timer, Clock,
  Users, Cpu,
} from 'lucide-react';
import type { VerbosityLevel } from '../../stores/agentStore';

interface AgentSettingsProps {
  // State
  fleetMode: boolean;
  setFleetMode: (v: boolean) => void;
  selectedAgentCount: number;
  setSelectedAgentCount: (v: number) => void;
  maxAgents: number;
  continuousMode: boolean;
  setContinuousMode: (v: boolean) => void;
  bypassRateLimits: boolean;
  setBypassRateLimits: (v: boolean) => void;
  enableSmartChunking: boolean;
  setEnableSmartChunking: (v: boolean) => void;
  cooldownMs: number;
  setCooldownMs: (v: number) => void;
  maxIterations: number;
  setMaxIterations: (v: number) => void;
  stepDelayMs: number;
  setStepDelay: (v: number) => void;
  autoApprove: boolean;
  setAutoApprove: (v: boolean) => void;
  autoAnswer: boolean;
  setAutoAnswer: (v: boolean) => void;
  // Disabled states
  isRunning: boolean;
  isFleetRunning: boolean;
}

export function AgentSettings({
  fleetMode, setFleetMode, selectedAgentCount, setSelectedAgentCount, maxAgents,
  continuousMode, setContinuousMode, bypassRateLimits, setBypassRateLimits,
  enableSmartChunking, setEnableSmartChunking, cooldownMs, setCooldownMs,
  maxIterations, setMaxIterations, stepDelayMs, setStepDelay,
  autoApprove, setAutoApprove, autoAnswer, setAutoAnswer,
  isRunning, isFleetRunning,
}: AgentSettingsProps) {
  return (
    <div className="p-3 border-b border-ide-border bg-ide-bg/50 space-y-2 max-h-72 overflow-y-auto flex-shrink-0">
      {/* Fleet Mode Toggle */}
      <ToggleRow
        icon={<Users className="w-3 h-3 text-cyan-400" />}
        label="Fleet Mode"
        value={fleetMode}
        onChange={() => setFleetMode(!fleetMode)}
        disabled={isRunning || isFleetRunning}
        activeColor="bg-cyan-500"
      />

      {/* Agent Count (fleet only) */}
      {fleetMode && (
        <div className="flex items-center justify-between">
          <label htmlFor="agent-count" className="text-xs text-ide-text-dim flex items-center gap-1">
            <Cpu className="w-3 h-3 text-cyan-400" /> Agents ({selectedAgentCount})
          </label>
          <div className="flex items-center gap-1">
            <input id="agent-count" name="agent-count" type="range"
              value={selectedAgentCount} onChange={e => setSelectedAgentCount(parseInt(e.target.value))}
              min={2} max={maxAgents} step={1} className="w-20" disabled={isFleetRunning} />
            <span className="text-[10px] text-ide-text-dim w-10">{selectedAgentCount}/{maxAgents}</span>
          </div>
        </div>
      )}

      <div className="border-t border-ide-border/50 my-1" />

      {/* 24/7 Mode */}
      <ToggleRow
        icon={<Infinity className="w-3 h-3 text-purple-400" />}
        label="24/7 Mode"
        value={continuousMode}
        onChange={() => setContinuousMode(!continuousMode)}
        disabled={isRunning}
        activeColor="bg-purple-500"
      />

      {/* Rate Limit Bypass */}
      <ToggleRow
        icon={<ShieldOff className="w-3 h-3 text-orange-400" />}
        label="Bypass Rate Limits"
        value={bypassRateLimits}
        onChange={() => setBypassRateLimits(!bypassRateLimits)}
        disabled={isRunning}
        activeColor="bg-orange-500"
      />

      {/* Smart Chunking */}
      <ToggleRow
        icon={<Puzzle className="w-3 h-3 text-blue-400" />}
        label="Smart Chunking"
        value={enableSmartChunking}
        onChange={() => setEnableSmartChunking(!enableSmartChunking)}
        disabled={isRunning}
        activeColor="bg-blue-500"
      />

      <div className="border-t border-ide-border/50 my-1" />

      {/* Cooldown */}
      <SliderRow icon={<Timer className="w-3 h-3" />} label="Cooldown"
        id="agent-cooldown" value={cooldownMs} onChange={v => setCooldownMs(v)}
        min={0} max={60000} step={1000} disabled={isRunning}
        displayValue={cooldownMs === 0 ? 'Off' : `${(cooldownMs / 1000).toFixed(0)}s`} />

      {/* Max Iterations */}
      {!continuousMode && (
        <div className="flex items-center justify-between">
          <label htmlFor="max-iterations" className="text-xs text-ide-text-dim">Max Iterations</label>
          <input id="max-iterations" name="max-iterations" type="number"
            value={maxIterations} onChange={e => setMaxIterations(parseInt(e.target.value) || 50)}
            className="w-16 bg-ide-bg border border-ide-border rounded px-2 py-0.5 text-xs text-right focus:outline-none"
            min={1} max={1000} disabled={isRunning} />
        </div>
      )}

      {/* Step Delay */}
      <SliderRow icon={<Clock className="w-3 h-3" />} label="Step Delay"
        id="step-delay" value={stepDelayMs} onChange={v => setStepDelay(v)}
        min={500} max={10000} step={500} disabled={false}
        displayValue={`${(stepDelayMs / 1000).toFixed(1)}s`} />

      {/* Checkboxes */}
      <div className="flex items-center justify-between">
        <label htmlFor="auto-approve" className="text-xs text-ide-text-dim">Auto-approve file changes</label>
        <input id="auto-approve" name="auto-approve" type="checkbox"
          checked={autoApprove} onChange={e => setAutoApprove(e.target.checked)} className="accent-ide-accent" />
      </div>
      <div className="flex items-center justify-between">
        <label htmlFor="auto-answer" className="text-xs text-ide-text-dim">Auto-answer questions</label>
        <input id="auto-answer" name="auto-answer" type="checkbox"
          checked={autoAnswer} onChange={e => setAutoAnswer(e.target.checked)} className="accent-ide-accent" />
      </div>

      {/* Info Badges */}
      <div className="flex flex-wrap gap-1 pt-1">
        {fleetMode && <Badge color="cyan" text={`🤖 Fleet (${selectedAgentCount})`} />}
        {continuousMode && <Badge color="purple" text="∞ 24/7" />}
        {bypassRateLimits && <Badge color="orange" text="⚡ No Limits" />}
        {enableSmartChunking && <Badge color="blue" text="🧩 Chunking" />}
        {cooldownMs > 0 && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-ide-bg text-ide-text-dim">⏱ {cooldownMs/1000}s</span>
        )}
      </div>
    </div>
  );
}

// ─── Reusable sub-components ────────────────────────────────

function ToggleRow({ icon, label, value, onChange, disabled, activeColor }: {
  icon: React.ReactNode; label: string; value: boolean;
  onChange: () => void; disabled: boolean; activeColor: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs text-ide-text-dim flex items-center gap-1">{icon} {label}</label>
      <button onClick={onChange}
        className={`relative w-8 h-4 rounded-full transition-colors ${value ? activeColor : 'bg-ide-border'}`}
        disabled={disabled}>
        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

function SliderRow({ icon, label, id, value, onChange, min, max, step, disabled, displayValue }: {
  icon: React.ReactNode; label: string; id: string; value: number;
  onChange: (v: number) => void; min: number; max: number; step: number;
  disabled: boolean; displayValue: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <label htmlFor={id} className="text-xs text-ide-text-dim flex items-center gap-1">{icon} {label}</label>
      <div className="flex items-center gap-1">
        <input id={id} name={id} type="range" value={value}
          onChange={e => onChange(parseInt(e.target.value))}
          min={min} max={max} step={step} className="w-20" disabled={disabled} />
        <span className="text-[10px] text-ide-text-dim w-10">{displayValue}</span>
      </div>
    </div>
  );
}

function Badge({ color, text }: { color: string; text: string }) {
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded bg-${color}-500/20 text-${color}-300`}>{text}</span>
  );
}
