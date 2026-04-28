// ============================================
// Model Strategy Panel
// Configure fallback chains and model selection
// All model selection uses the UniversalModelPicker
// for access to all 100+ models.
// ============================================
import React, { useState } from 'react';
import { MODELS, type ModelDefinition } from '@personal-ide/shared';
import { useChatStore } from '../stores/chatStore';
import { Zap, ArrowDownUp, Info } from 'lucide-react';
import { ModelDropdown, ModelPoolEditor, isFreeModel } from './UniversalModelPicker';

interface FallbackChain {
  primary: string;
  fallbacks: string[];
}

const STRATEGY_PRESETS: Record<string, FallbackChain> = {
  'Fastest (Free)': { primary: 'cerebras/llama3.1-8b', fallbacks: ['groq/llama-3.1-8b-instant', 'gemini/gemini-2.5-flash-lite'] },
  'Best Quality (Free)': { primary: 'gemini/gemini-2.5-pro', fallbacks: ['openai/gpt-4.1', 'groq/llama-3.3-70b-versatile'] },
  'Coding Focus': { primary: 'openai/gpt-4.1', fallbacks: ['deepseek-direct/deepseek-v4-pro', 'anthropic/claude-sonnet-4-6'] },
  'Long Context': { primary: 'gemini/gemini-2.5-pro', fallbacks: ['anthropic/claude-opus-4-7', 'deepseek-direct/deepseek-v4-flash'] },
  'Reasoning': { primary: 'openai/o4-mini', fallbacks: ['deepseek-direct/deepseek-v4-pro', 'groq/qwen/qwen3-32b'] },
};

const contextWindow = (m: ModelDefinition) => m.maxInputTokens;

export function ModelStrategyPanel() {
  const { selectedModel, setModel } = useChatStore();
  const [fallbackPool, setFallbackPool] = useState<string[]>([]);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const applyPreset = (name: string) => {
    const preset = STRATEGY_PRESETS[name];
    if (!preset) return;
    setModel(preset.primary);
    setFallbackPool(preset.fallbacks.filter(Boolean));
    setActivePreset(name);
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
          {Object.keys(STRATEGY_PRESETS).map(name => (
            <button key={name} onClick={() => applyPreset(name)}
              className={`px-2 py-1.5 rounded border text-left transition-all text-[11px] ${
                activePreset === name
                  ? 'border-ide-accent bg-ide-accent/10 text-ide-accent'
                  : 'border-ide-border hover:border-ide-accent/50 text-ide-text-dim hover:text-ide-text'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[10px] text-ide-text-dim uppercase tracking-wider mb-2">Primary Model</div>
        <ModelDropdown value={selectedModel} onChange={setModel} placeholder="Select primary model..." />
        {currentModel && (
          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-ide-text-dim">
            <Info className="w-3 h-3 shrink-0" />
            <span>
              {contextWindow(currentModel) > 0 ? `${(contextWindow(currentModel) / 1000).toFixed(0)}K ctx` : ''}
              {isFreeModel(currentModel) ? ' · FREE' : ''}
            </span>
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
          onChange={v => { setFallbackPool(v); setActivePreset(null); }}
          showBulkActions
        />
        <p className="mt-2 text-[10px] text-ide-text-dim leading-relaxed">
          If the primary model hits a rate limit or errors, the agent automatically tries each fallback in order.
        </p>
      </div>
    </div>
  );
}
