// ============================================
// Model Strategy Panel
// Configure fallback chains and model selection
// All model selection uses the UniversalModelPicker
// for access to all 100+ models.
// ============================================
import React, { useEffect, useState } from 'react';
import { MODELS, MODEL_PRESETS, getPreset, type ModelDefinition } from '@personal-ide/shared';
import { useChatStore } from '../stores/chatStore';
import { Zap, ArrowDownUp, Info } from 'lucide-react';
import { ModelDropdown, ModelPoolEditor, isFreeModel } from './UniversalModelPicker';
import { API_BASE } from '../config.js';

const contextWindow = (m: ModelDefinition) => m.maxInputTokens;

export function ModelStrategyPanel() {
  const { selectedModel, setModel } = useChatStore();
  const [fallbackPool, setFallbackPool] = useState<string[]>([]);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [failedModels, setFailedModels] = useState<string[]>([]);
  const [modelStatus, setModelStatus] = useState<Record<string, any>>({});

  const loadStrategy = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/model-strategy`);
      const data = await res.json().catch(() => null);
      if (!data?.settings) return;
      setModel(data.settings.primaryModel || selectedModel);
      setFallbackPool(data.settings.fallbackModels || []);
      setActivePreset(data.settings.presetId || null);
      setFailedModels(data.failedModels || []);
    } catch {}
  };

  useEffect(() => {
    void loadStrategy();

    const loadModelStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/models/status`);
        const data = await res.json().catch(() => null);
        if (data?.status && typeof data.status === 'object') {
          setModelStatus(data.status);
        }
      } catch {}
    };

    void loadModelStatus();
    const timer = window.setInterval(() => {
      void loadModelStatus();
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  const cooldownLabel = (modelId: string): string | null => {
    const status = modelStatus[modelId];
    if (!status) return null;
    const usage = status.usage || {};
    const now = Date.now();

    if (status.dead && Number(status.deadRemainingMs) > 0) {
      return `Dead ${Math.ceil(Number(status.deadRemainingMs) / 1000)}s`;
    }

    const resetMs = Math.max(0, (Number(usage.serverResetTime || 0) * 1000) - now);
    if (Number(usage.serverRemaining) <= 0 && resetMs > 0) {
      return `Reset ${Math.ceil(resetMs / 1000)}s`;
    }

    if (Number(usage.consecutiveFailures) > 0 && Number(usage.backoffMs) > 0) {
      return `Backoff ${Math.ceil(Number(usage.backoffMs) / 1000)}s`;
    }

    return null;
  };

  const persistStrategy = async (payload: { presetId?: string; primaryModel?: string; fallbackModels?: string[] }) => {
    try {
      const res = await fetch(`${API_BASE}/api/model-strategy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!data?.settings) return;
      setModel(data.settings.primaryModel || selectedModel);
      setFallbackPool(data.settings.fallbackModels || []);
      setActivePreset(data.settings.presetId || null);
    } catch {}
  };

  const applyPreset = (presetId: string) => {
    const preset = getPreset(presetId);
    if (!preset) return;
    const fallbackModels = preset.fallbackChain.filter(model => model !== preset.primaryModel);
    setModel(preset.primaryModel);
    setFallbackPool(fallbackModels);
    setActivePreset(presetId);
    void persistStrategy({ presetId, primaryModel: preset.primaryModel, fallbackModels });
  };

  const cleanupFailed = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/model-strategy/cleanup-failed`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!data?.settings) return;
      setModel(data.settings.primaryModel || selectedModel);
      setFallbackPool(data.settings.fallbackModels || []);
      setFailedModels(data.removedModelIds || []);
      setActivePreset(data.settings.presetId || null);
    } catch {}
  };

  const currentModel = MODELS.find(m => m.id === selectedModel);

  return (
    <div className="flex flex-col gap-4 p-4 text-xs">
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-ide-accent" />
        <span className="font-medium text-ide-text">Model Strategy</span>
      </div>
      <div>
        <div className="text-[10px] text-ide-text-dim uppercase tracking-wider mb-2">Quick Presets</div>
        <div className="grid grid-cols-2 gap-1.5">
          {MODEL_PRESETS.slice(0, 6).map(preset => (
            <button key={preset.id} onClick={() => applyPreset(preset.id)}
              className={`px-2 py-1.5 rounded border text-left transition-all text-[11px] ${
                activePreset === preset.id
                  ? 'border-ide-accent bg-ide-accent/10 text-ide-accent'
                  : 'border-ide-border hover:border-ide-accent/50 text-ide-text-dim hover:text-ide-text'
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[10px] text-ide-text-dim uppercase tracking-wider mb-2">Primary Model</div>
        <ModelDropdown
          value={selectedModel}
          onChange={(modelId) => {
            setModel(modelId);
            setActivePreset(null);
            void persistStrategy({ primaryModel: modelId, fallbackModels: fallbackPool });
          }}
          placeholder="Select primary model..."
        />
        {currentModel && (
          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-ide-text-dim">
            <Info className="w-3 h-3 shrink-0" />
            <span>
              {contextWindow(currentModel) > 0 ? `${(contextWindow(currentModel) / 1000).toFixed(0)}K ctx` : ''}
              {isFreeModel(currentModel) ? ' · FREE' : ''}
            </span>
            {cooldownLabel(selectedModel) && (
              <span className="rounded border border-yellow-500/30 bg-yellow-500/10 px-1.5 py-0.5 text-yellow-300">
                Cooldown: {cooldownLabel(selectedModel)}
              </span>
            )}
          </div>
        )}
      </div>
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <ArrowDownUp className="w-3 h-3 text-ide-text-dim" />
          <span className="text-[10px] text-ide-text-dim uppercase tracking-wider">Fallback Chain</span>
        </div>
        <ModelPoolEditor
          title="Fallback Models"
          description="Tried in order if the primary model fails or rate-limits. Add any of the 100+ models."
          models={fallbackPool}
          onChange={v => {
            setFallbackPool(v);
            setActivePreset(null);
            void persistStrategy({ primaryModel: selectedModel, fallbackModels: v });
          }}
          showBulkActions
        />
        {fallbackPool.length > 0 && (
          <div className="mt-2 space-y-1 rounded border border-ide-border bg-ide-panel/30 p-2">
            <div className="text-[10px] uppercase tracking-wider text-ide-text-dim">Fallback Cooldowns</div>
            {fallbackPool.map(modelId => {
              const cd = cooldownLabel(modelId);
              if (!cd) return null;
              return (
                <div key={modelId} className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="text-ide-text truncate">{modelId}</span>
                  <span className="rounded border border-yellow-500/30 bg-yellow-500/10 px-1.5 py-0.5 text-yellow-300">
                    {cd}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-[10px] text-ide-text-dim leading-relaxed">
          If the primary model hits a rate limit or errors, chat, THE GOD FACTORY, and the agent loop now share this fallback chain.
        </p>
        <div className="mt-2 flex items-center justify-between gap-2 rounded border border-ide-border bg-ide-panel/40 px-2 py-1.5 text-[10px]">
          <span className="text-ide-text-dim">
            Failed models detected: <span className="text-ide-text">{failedModels.length}</span>
          </span>
          <button
            onClick={cleanupFailed}
            className="rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-red-300 hover:bg-red-500/20"
          >
            Clean Failed From Chain
          </button>
        </div>
      </div>
    </div>
  );
}
