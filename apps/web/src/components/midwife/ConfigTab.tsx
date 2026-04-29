// ============================================
// ConfigTab — Global cooldown, provider toggles, nano port
// Extracted from MidwifePanel.tsx
// ============================================
import React, { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import { ToggleRow } from './ToggleRow';

interface ConfigTabProps {
  config: any;
  updateConfig: (updates: any) => Promise<void>;
  onProvidersChanged?: () => void;
}

export function ConfigTab({ config, updateConfig, onProvidersChanged }: ConfigTabProps) {
  // Local state prevents slider from snapping back during drag (async API calls)
  const [localCooldown, setLocalCooldown] = useState<number>(config?.globalCooldownMs ?? 2000);
  const [localNanoPort, setLocalNanoPort] = useState<number>(config?.nanoPort ?? 5100);

  useEffect(() => { setLocalCooldown(config?.globalCooldownMs ?? 2000); }, [config?.globalCooldownMs]);
  useEffect(() => { setLocalNanoPort(config?.nanoPort ?? 5100); }, [config?.nanoPort]);

  if (!config) return <p className="text-xs text-ide-text-dim">Loading config...</p>;

  return (
    <div className="space-y-4">
      {/* Global Cooldown */}
      <div>
        <label htmlFor="global-cooldown" className="text-[10px] text-ide-text-dim block mb-1">
          Global Cooldown: {(localCooldown / 1000).toFixed(1)}s (minimum between any LLM call)
        </label>
        <input
          id="global-cooldown"
          name="global-cooldown"
          type="range"
          min={500}
          max={30000}
          step={500}
          value={localCooldown}
          onChange={e => setLocalCooldown(parseInt(e.target.value))}
          onPointerUp={() => updateConfig({ globalCooldownMs: localCooldown })}
          onKeyUp={() => updateConfig({ globalCooldownMs: localCooldown })}
          className="w-full accent-ide-accent"
        />
      </div>

      {/* Toggles */}
      <div className="space-y-2">
        <ToggleRow
          label="Auto-Rotate on Rate Limit"
          description="Automatically switch to another model when rate-limited"
          value={config.autoRotateOnRateLimit}
          onChange={v => updateConfig({ autoRotateOnRateLimit: v })}
        />
        <ToggleRow
          label="Feed to Nano Trainer"
          description="Send generated data to the Nano Sea training pipeline"
          value={config.feedToNanoTrainer}
          onChange={v => updateConfig({ feedToNanoTrainer: v })}
        />
      </div>

      {/* Nano Port */}
      <div>
        <label htmlFor="nano-port" className="text-[10px] text-ide-text-dim block mb-1">Nano Trainer Port</label>
        <input
          id="nano-port"
          name="nano-port"
          type="number"
          value={localNanoPort}
          onChange={e => setLocalNanoPort(parseInt(e.target.value) || 5100)}
          onBlur={() => updateConfig({ nanoPort: localNanoPort })}
          className="w-24 text-xs bg-ide-bg border border-ide-border rounded px-2 py-1 text-ide-text"
        />
      </div>

      {/* Provider Toggles */}
      <div>
        <label className="text-[10px] text-ide-text-dim block mb-2">Enabled Providers</label>
        <div className="flex flex-wrap gap-2">
          {['github', 'ollama', 'nano', 'openrouter', 'groq', 'together', 'lmstudio'].map(provider => {
            const enabled = config.enabledProviders?.includes(provider);
            return (
              <button
                key={provider}
                onClick={async () => {
                  const current = config.enabledProviders || [];
                  const next = enabled
                    ? current.filter((p: string) => p !== provider)
                    : [...current, provider];
                  await updateConfig({ enabledProviders: next });
                  // Re-fetch models when providers change
                  setTimeout(() => onProvidersChanged?.(), 50000);
                }}
                className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                  enabled
                    ? 'border-ide-accent text-ide-accent bg-ide-accent/10'
                    : 'border-ide-border text-ide-text-dim hover:text-ide-text'
                }`}
              >
                {enabled ? <Check className="w-3 h-3 inline mr-1" /> : null}
                {provider}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
