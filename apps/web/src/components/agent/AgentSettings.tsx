// ============================================
// Agent Settings Panel — Configuration toggles and sliders
// Enhanced with model preset selector and fallback chain display
// ============================================
import React, { useEffect, useState } from 'react';
import {
  Infinity, ShieldOff, Puzzle, Timer, Clock,
  Users, Cpu, Layers, Zap, ChevronDown, ChevronRight,
} from 'lucide-react';
import {
  MODEL_PRESETS, getPresetModels, estimateDailyCapacity, getModelCooldown,
} from '@personal-ide/shared';
import type {
  AgentRole,
  FleetCapacitySnapshot,
  FleetExecutionMode,
} from '../../stores/fleetStore';
import { ModelPoolEditor, RoleModelPicker, FLEET_ROLE_LABELS } from '../UniversalModelPicker';

const FLEET_ROLES: AgentRole[] = ['lead', 'implementer', 'debugger', 'tester', 'reviewer', 'documenter'];

const ROLE_LABELS: Record<AgentRole, string> = {
  lead: 'Lead',
  implementer: 'Implementer',
  debugger: 'Debugger',
  tester: 'Tester',
  reviewer: 'Reviewer',
  documenter: 'Documenter',
};

function parseModelPool(text: string): string[] {
  return text
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function buildRoleOverrideDrafts(overrides: Partial<Record<AgentRole, string>>): Record<AgentRole, string> {
  return {
    lead: overrides.lead || '',
    implementer: overrides.implementer || '',
    debugger: overrides.debugger || '',
    tester: overrides.tester || '',
    reviewer: overrides.reviewer || '',
    documenter: overrides.documenter || '',
  };
}

interface AgentSettingsProps {
  // State
  fleetMode: boolean;
  setFleetMode: (v: boolean) => void;
  selectedAgentCount: number;
  setSelectedAgentCount: (v: number) => void;
  maxAgents: number;
  capacity: FleetCapacitySnapshot | null;
  executionMode: FleetExecutionMode;
  setExecutionMode: (v: FleetExecutionMode) => void;
  localModelPool: string[];
  setLocalModelPool: (v: string[]) => void;
  cloudModelPool: string[];
  setCloudModelPool: (v: string[]) => void;
  roleModelOverrides: Partial<Record<AgentRole, string>>;
  setRoleModelOverride: (role: AgentRole, model: string | null) => void;
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
  // Preset support
  selectedPresetId: string;
  onPresetChange: (presetId: string) => void;
  // Timing display
  timingData?: {
    lastCallMs: number;
    avgCallMs: number;
    totalCalls: number;
    tokPerSec: number;
    activeMs: number;
  } | null;
  // Dataset display
  datasetStats?: {
    total: number;
    success: number;
    failures: number;
    avgQuality: number;
  } | null;
  // Disabled states
  isRunning: boolean;
  isFleetRunning: boolean;
}

export function AgentSettings({
  fleetMode, setFleetMode, selectedAgentCount, setSelectedAgentCount, maxAgents,
  capacity, executionMode, setExecutionMode,
  localModelPool, setLocalModelPool,
  cloudModelPool, setCloudModelPool,
  roleModelOverrides, setRoleModelOverride,
  continuousMode, setContinuousMode, bypassRateLimits, setBypassRateLimits,
  enableSmartChunking, setEnableSmartChunking, cooldownMs, setCooldownMs,
  maxIterations, setMaxIterations, stepDelayMs, setStepDelay,
  autoApprove, setAutoApprove, autoAnswer, setAutoAnswer,
  selectedPresetId, onPresetChange,
  timingData, datasetStats,
  isRunning, isFleetRunning,
}: AgentSettingsProps) {
  const [showFallbackChain, setShowFallbackChain] = useState(false);
  const [showRoleOverrides, setShowRoleOverrides] = useState(false);
  const selectedPreset = MODEL_PRESETS.find(p => p.id === selectedPresetId) || MODEL_PRESETS[0];

  const applyRoleOverride = (role: AgentRole, model: string) => {
    setRoleModelOverride(role, model || null);
  };

  return (
    <div className="p-3 border-b border-ide-border bg-ide-bg/50 space-y-2 max-h-[45vh] overflow-y-auto flex-shrink-0">
      {/* ── Model Strategy Preset ── */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1 text-[10px] text-ide-accent font-medium uppercase tracking-wide">
          <Layers className="w-3 h-3" /> Model Strategy
        </div>
        <select
          value={selectedPresetId}
          onChange={e => onPresetChange(e.target.value)}
          disabled={isRunning || isFleetRunning}
          className="w-full bg-ide-bg border border-ide-border rounded px-2 py-1 text-xs text-ide-text focus:outline-none focus:border-ide-accent disabled:opacity-50"
        >
          {MODEL_PRESETS.map(preset => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
        <div className="text-[9px] text-ide-text-dim px-1">{selectedPreset.description}</div>

        {/* Preset Stats */}
        <div className="flex flex-wrap gap-1.5 text-[9px]">
          <span className="px-1.5 py-0.5 rounded bg-green-500/15 text-green-300">
            ~{estimateDailyCapacity(selectedPreset)} RPD
          </span>
          <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300">
            {getPresetModels(selectedPreset).length} models
          </span>
          {selectedPreset.continuousReady && (
            <span className="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300">24/7 Ready</span>
          )}
        </div>

        {/* Fallback Chain (expandable) */}
        <button
          onClick={() => setShowFallbackChain(!showFallbackChain)}
          className="flex items-center gap-1 text-[10px] text-ide-text-dim hover:text-ide-accent"
        >
          {showFallbackChain ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Fallback Chain ({selectedPreset.fallbackChain.length} models)
        </button>
        {showFallbackChain && (
          <div className="space-y-0.5 pl-2 border-l-2 border-ide-border/50">
            {selectedPreset.fallbackChain.map((modelId, i) => {
              const cooldown = selectedPreset.cooldowns[modelId] || getModelCooldown(modelId);
              return (
                <div key={modelId} className="flex items-center justify-between text-[9px]">
                  <span className="text-ide-text">
                    <span className="text-ide-text-dim">{i + 1}.</span> {modelId.split('/')[1] || modelId}
                  </span>
                  <span className="text-ide-text-dim">{(cooldown / 1000).toFixed(0)}s</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-ide-border/50 my-1" />
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
        <>
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

          <div className="rounded border border-cyan-500/20 bg-cyan-500/5 p-2 space-y-1.5">
            <div className="text-[10px] text-cyan-200 font-medium uppercase tracking-wide">Fleet Placement</div>

            {capacity && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px]">
                <span className="text-ide-text-dim">CPU / RAM / GPU</span>
                <span className="text-right text-ide-text">
                  {capacity.cpuCount} / {capacity.totalMemoryGB}GB / {capacity.gpuCount}
                </span>
                <span className="text-ide-text-dim">Recommended</span>
                <span className="text-right text-ide-text">
                  local {capacity.recommendedLocalAgents || '-'} , hybrid {capacity.recommendedHybridAgents || '-'}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <label htmlFor="fleet-execution-mode" className="text-xs text-ide-text-dim">Execution Mode</label>
              <select
                id="fleet-execution-mode"
                value={executionMode}
                onChange={e => setExecutionMode(e.target.value as FleetExecutionMode)}
                disabled={isFleetRunning}
                className="w-28 bg-ide-bg border border-ide-border rounded px-2 py-0.5 text-xs text-ide-text focus:outline-none focus:border-cyan-400 disabled:opacity-50"
              >
                <option value="local">Local</option>
                <option value="cloud">Cloud</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>

            <ModelPoolEditor
              title="Local Model Pool"
              description="Ollama, Nano, and other on-device models"
              models={localModelPool}
              onChange={setLocalModelPool}
              disabled={isFleetRunning}
            />

            <ModelPoolEditor
              title="Cloud Model Pool"
              description="OpenAI, Groq, Gemini, Anthropic, etc."
              models={cloudModelPool}
              onChange={setCloudModelPool}
              disabled={isFleetRunning}
            />

            <button
              onClick={() => setShowRoleOverrides(v => !v)}
              className="flex items-center gap-1 text-[10px] text-ide-text-dim hover:text-cyan-300"
            >
              {showRoleOverrides ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Role model overrides
            </button>

            {showRoleOverrides && (
              <div className="space-y-2">
                {FLEET_ROLES.map(role => (
                  <RoleModelPicker
                    key={role}
                    role={role}
                    value={roleModelOverrides[role] || ''}
                    onChange={(model) => applyRoleOverride(role as AgentRole, model)}
                    disabled={isFleetRunning}
                  />
                ))}
              </div>
            )}
          </div>
        </>
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

      {/* ── Live Timing Display ── */}
      {timingData && timingData.totalCalls > 0 && (
        <div className="border-t border-ide-border/50 pt-1.5 mt-1">
          <div className="flex items-center gap-1 text-[10px] text-ide-accent font-medium mb-1">
            <Zap className="w-3 h-3" /> Call Timing
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px]">
            <span className="text-ide-text-dim">Last call:</span>
            <span className="text-ide-text text-right">{(timingData.lastCallMs / 1000).toFixed(1)}s</span>
            <span className="text-ide-text-dim">Avg call:</span>
            <span className="text-ide-text text-right">{(timingData.avgCallMs / 1000).toFixed(1)}s</span>
            <span className="text-ide-text-dim">Total calls:</span>
            <span className="text-ide-text text-right">{timingData.totalCalls}</span>
            <span className="text-ide-text-dim">Tok/sec:</span>
            <span className="text-ide-text text-right">{timingData.tokPerSec}</span>
            {timingData.activeMs > 0 && (
              <>
                <span className="text-ide-text-dim">Active:</span>
                <span className="text-yellow-300 text-right animate-pulse">{(timingData.activeMs / 1000).toFixed(0)}s</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Dataset Stats ── */}
      {datasetStats && datasetStats.total > 0 && (
        <div className="border-t border-ide-border/50 pt-1.5 mt-1">
          <div className="flex items-center gap-1 text-[10px] text-green-400 font-medium mb-1">
            📊 Training Data
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px]">
            <span className="text-ide-text-dim">Total pairs:</span>
            <span className="text-ide-text text-right">{datasetStats.total}</span>
            <span className="text-ide-text-dim">Quality avg:</span>
            <span className="text-ide-text text-right">{(datasetStats.avgQuality * 100).toFixed(0)}%</span>
            <span className="text-ide-text-dim">Success/Fail:</span>
            <span className="text-ide-text text-right">{datasetStats.success}/{datasetStats.failures}</span>
          </div>
        </div>
      )}
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
