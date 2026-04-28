// ============================================
// Model Strategy Wizard
// Guided flow for setting up primary + fallback chain.
// Auto-detects configured providers, suggests optimal chains.
// ============================================
import React, { useState, useEffect } from 'react';
import {
  Zap, ChevronRight, ChevronLeft, Check, X,
  Loader2, Sparkles, ArrowDown, GripVertical,
  Info, AlertTriangle, CheckCircle2, Shuffle,
  Shield, Brain, Code2, Globe,
} from 'lucide-react';
import { API_BASE } from '../../config';
import { ModelDropdown } from '../UniversalModelPicker';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ConfiguredProvider {
  id: string;
  name: string;
  enabled: boolean;
  hasApiKey: boolean;
}

type WizardStep = 'goal' | 'primary' | 'fallbacks' | 'review' | 'done';

type StrategyGoal = 'speed' | 'quality' | 'coding' | 'balance' | 'free-only';

interface FallbackEntry {
  id: string;
  modelId: string;
  reason: string;
}

const GOAL_OPTIONS: { id: StrategyGoal; label: string; icon: React.ComponentType<any>; description: string }[] = [
  { id: 'speed', label: 'Speed First', icon: Zap, description: 'Fastest response times. Best for quick tasks and iteration.' },
  { id: 'quality', label: 'Best Quality', icon: Sparkles, description: 'Best output quality. Best for complex tasks and research.' },
  { id: 'coding', label: 'Coding Focus', icon: Code2, description: 'Optimized for code generation, review, and debugging.' },
  { id: 'balance', label: 'Balanced', icon: Shield, description: 'Good balance of speed, quality, and cost.' },
  { id: 'free-only', label: 'Free Only', icon: Globe, description: 'Use only providers with free tiers. No API cost.' },
];

const PRESETS: Record<StrategyGoal, { primary: string; fallbacks: string[]; explanation: string }> = {
  speed: {
    primary: 'cerebras/llama3.1-8b',
    fallbacks: ['groq/llama-3.1-8b-instant', 'groq/llama-3.3-70b-versatile', 'gemini/gemini-2.5-flash-lite'],
    explanation: 'Cerebras is the fastest inference in the world. Falls back to Groq (also very fast), then Gemini Flash.',
  },
  quality: {
    primary: 'gemini/gemini-2.5-pro',
    fallbacks: ['openai/gpt-4.1', 'anthropic/claude-sonnet-4-6', 'groq/llama-3.3-70b-versatile'],
    explanation: 'Gemini 2.5 Pro for best quality. Falls back to GPT-4.1, Claude Sonnet, then free Groq.',
  },
  coding: {
    primary: 'openai/gpt-4.1',
    fallbacks: ['deepseek-direct/deepseek-v4-pro', 'groq/qwen2.5-coder-32b', 'anthropic/claude-sonnet-4-6'],
    explanation: 'GPT-4.1 is excellent at code. Falls back to DeepSeek V3 (also great at code), then Qwen Coder.',
  },
  balance: {
    primary: 'groq/llama-3.3-70b-versatile',
    fallbacks: ['gemini/gemini-1.5-flash', 'cerebras/llama3.1-8b', 'openrouter/meta-llama/llama-3.3-70b-instruct:free'],
    explanation: 'Groq Llama 3.3 70B is fast, powerful, and free. Falls back to Gemini Flash, Cerebras, then OpenRouter.',
  },
  'free-only': {
    primary: 'groq/llama-3.3-70b-versatile',
    fallbacks: ['cerebras/llama3.1-8b', 'gemini/gemini-1.5-flash', 'openrouter/meta-llama/llama-3.3-70b-instruct:free', 'siliconflow/Qwen/Qwen2.5-72B-Instruct'],
    explanation: 'All free providers. Groq 70B as primary with multiple free fallbacks so you never hit limits.',
  },
};

// ─── Main Wizard ─────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onApply?: (primary: string, fallbacks: string[]) => void;
}

export function ModelStrategyWizard({ onClose, onApply }: Props) {
  const [step, setStep] = useState<WizardStep>('goal');
  const [goal, setGoal] = useState<StrategyGoal | null>(null);
  const [primaryModel, setPrimaryModel] = useState('');
  const [fallbacks, setFallbacks] = useState<FallbackEntry[]>([]);
  const [providers, setProviders] = useState<ConfiguredProvider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProviders();
  }, []);

  async function fetchProviders() {
    setLoadingProviders(true);
    try {
      const res = await fetch(`${API_BASE}/api/providers`);
      if (res.ok) {
        const data = await res.json();
        setProviders(data.filter((p: any) => p.enabled || p.hasApiKey));
      }
    } catch { /* ignore */ }
    setLoadingProviders(false);
  }

  function applyPreset(g: StrategyGoal) {
    const preset = PRESETS[g];
    setPrimaryModel(preset.primary);
    setFallbacks(preset.fallbacks.map((modelId, i) => ({
      id: `fallback-${i}`,
      modelId,
      reason: `Fallback #${i + 1}`,
    })));
  }

  function selectGoal(g: StrategyGoal) {
    setGoal(g);
    applyPreset(g);
  }

  function addFallback() {
    setFallbacks(prev => [...prev, { id: `f-${Date.now()}`, modelId: '', reason: '' }]);
  }

  function removeFallback(id: string) {
    setFallbacks(prev => prev.filter(f => f.id !== id));
  }

  function updateFallbackModel(id: string, modelId: string) {
    setFallbacks(prev => prev.map(f => f.id === id ? { ...f, modelId } : f));
  }

  function moveFallback(id: string, dir: 'up' | 'down') {
    setFallbacks(prev => {
      const idx = prev.findIndex(f => f.id === id);
      if (idx < 0) return prev;
      if (dir === 'up' && idx === 0) return prev;
      if (dir === 'down' && idx === prev.length - 1) return prev;
      const arr = [...prev];
      const swap = dir === 'up' ? idx - 1 : idx + 1;
      [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
      return arr;
    });
  }

  async function applyAndSave() {
    setSaving(true);
    const validFallbacks = fallbacks.filter(f => f.modelId).map(f => f.modelId);
    try {
      // Save to app's chat store — call the strategy API endpoint if it exists,
      // otherwise just apply via onApply callback
      await fetch(`${API_BASE}/api/strategy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryModel, fallbacks: validFallbacks }),
      }).catch(() => {/* endpoint optional */});

      onApply?.(primaryModel, validFallbacks);
      setStep('done');
    } finally {
      setSaving(false);
    }
  }

  const steps: WizardStep[] = ['goal', 'primary', 'fallbacks', 'review', 'done'];
  const stepIndex = steps.indexOf(step);
  const STEP_LABELS: Record<WizardStep, string> = {
    goal: 'Choose Goal', primary: 'Primary Model', fallbacks: 'Fallback Chain',
    review: 'Review', done: 'Done',
  };

  const validFallbacks = fallbacks.filter(f => f.modelId);
  const preset = goal ? PRESETS[goal] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative bg-ide-bg border border-ide-border rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-ide-border flex-shrink-0">
          <Zap className="w-5 h-5 text-ide-accent" />
          <div>
            <div className="text-sm font-semibold text-ide-text">Model Strategy Wizard</div>
            <div className="text-[11px] text-ide-text-dim">Configure your primary model and fallback chain</div>
          </div>
          <button onClick={onClose} className="ml-auto text-ide-text-dim hover:text-ide-text">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Steps */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-ide-border flex-shrink-0 overflow-x-auto">
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-1.5 text-[10px] font-medium whitespace-nowrap ${
                i < stepIndex ? 'text-green-400' : i === stepIndex ? 'text-ide-accent' : 'text-ide-text-dim'
              }`}>
                {i < stepIndex ? <CheckCircle2 className="w-3 h-3" /> : (
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${
                    i === stepIndex ? 'bg-ide-accent/20 text-ide-accent border border-ide-accent/40' : 'bg-ide-panel border border-ide-border'
                  }`}>{i + 1}</div>
                )}
                {STEP_LABELS[s]}
              </div>
              {i < steps.length - 1 && <div className="w-4 border-t border-ide-border flex-shrink-0" />}
            </React.Fragment>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* Goal */}
          {step === 'goal' && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-ide-text">What's your primary goal?</h2>
              <p className="text-[11px] text-ide-text-dim">This will suggest an optimal model chain. You can customize it in the next steps.</p>
              <div className="space-y-2 mt-4">
                {GOAL_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => { selectGoal(opt.id); setStep('primary'); }}
                      className={`w-full text-left p-3 rounded-lg border transition-all group ${
                        goal === opt.id
                          ? 'border-ide-accent bg-ide-accent/10'
                          : 'border-ide-border bg-ide-panel hover:border-ide-accent/40 hover:bg-ide-accent/5'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`w-4 h-4 flex-shrink-0 ${goal === opt.id ? 'text-ide-accent' : 'text-ide-text-dim group-hover:text-ide-accent'}`} />
                        <div>
                          <div className="text-xs font-medium text-ide-text">{opt.label}</div>
                          <div className="text-[11px] text-ide-text-dim">{opt.description}</div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-ide-text-dim ml-auto group-hover:text-ide-accent" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Primary model */}
          {step === 'primary' && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-ide-text">Choose your primary model</h2>
              {preset && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-blue-300">{preset.explanation}</p>
                </div>
              )}
              <div>
                <div className="text-[11px] text-ide-text-dim mb-2">Suggested primary model</div>
                <ModelDropdown
                  value={primaryModel}
                  onChange={setPrimaryModel}
                  placeholder="Select primary model…"
                />
              </div>
              {primaryModel && (
                <div className="flex items-center gap-2 p-2 bg-green-500/5 border border-green-500/20 rounded text-[11px] text-green-400">
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                  Selected: <span className="font-mono">{primaryModel}</span>
                </div>
              )}
            </div>
          )}

          {/* Fallbacks */}
          {step === 'fallbacks' && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-ide-text">Configure fallback chain</h2>
              <p className="text-[11px] text-ide-text-dim">
                If the primary model fails (rate limit, error, no funds), the next model in this list is tried automatically.
              </p>

              <div className="space-y-2">
                {/* Primary (read-only) */}
                <div className="flex items-center gap-2 p-2 bg-ide-panel rounded border border-ide-border/60">
                  <div className="w-5 h-5 rounded-full bg-ide-accent/20 flex items-center justify-center text-[9px] font-bold text-ide-accent flex-shrink-0">P</div>
                  <span className="font-mono text-xs text-ide-accent flex-1">{primaryModel || '(no primary)'}</span>
                  <span className="text-[9px] text-ide-text-dim">Primary</span>
                </div>

                <ArrowDown className="w-3.5 h-3.5 text-ide-text-dim mx-auto" />

                {fallbacks.map((fb, i) => (
                  <div key={fb.id} className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-ide-panel border border-ide-border flex items-center justify-center text-[9px] text-ide-text-dim flex-shrink-0">{i + 1}</div>
                    <div className="flex-1">
                      <ModelDropdown
                        value={fb.modelId}
                        onChange={mid => updateFallbackModel(fb.id, mid)}
                        placeholder={`Fallback #${i + 1}…`}
                      />
                    </div>
                    <div className="flex gap-0.5">
                      <button onClick={() => moveFallback(fb.id, 'up')} disabled={i === 0} className="p-1 text-ide-text-dim hover:text-ide-text disabled:opacity-30">
                        <ChevronLeft className="w-3 h-3 rotate-90" />
                      </button>
                      <button onClick={() => moveFallback(fb.id, 'down')} disabled={i === fallbacks.length - 1} className="p-1 text-ide-text-dim hover:text-ide-text disabled:opacity-30">
                        <ChevronRight className="w-3 h-3 rotate-90" />
                      </button>
                      <button onClick={() => removeFallback(fb.id)} className="p-1 text-ide-text-dim hover:text-red-400">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}

                {fallbacks.length > 0 && <ArrowDown className="w-3.5 h-3.5 text-ide-text-dim mx-auto" />}
                <button onClick={addFallback} className="w-full py-1.5 border border-dashed border-ide-border rounded text-[11px] text-ide-text-dim hover:text-ide-accent hover:border-ide-accent/40 transition-colors">
                  + Add fallback model
                </button>
              </div>
            </div>
          )}

          {/* Review */}
          {step === 'review' && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-ide-text">Review your strategy</h2>
              <div className="space-y-2">
                <div className="text-[10px] font-semibold text-ide-text-dim uppercase tracking-wider">Model Chain</div>
                <div className="space-y-1.5">
                  {[{ label: 'Primary', modelId: primaryModel, accent: true }, ...validFallbacks.map((f, i) => ({ label: `Fallback ${i + 1}`, modelId: f.modelId, accent: false }))].map(item => (
                    <div key={item.label} className="flex items-center gap-2 p-2 rounded bg-ide-panel border border-ide-border/60">
                      <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${item.accent ? 'bg-ide-accent/15 text-ide-accent' : 'bg-ide-panel text-ide-text-dim border border-ide-border'}`}>
                        {item.label}
                      </span>
                      <span className="font-mono text-[11px] text-ide-text flex-1">{item.modelId}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg flex items-start gap-2">
                <Shield className="w-3.5 h-3.5 text-green-400 flex-shrink-0 mt-0.5" />
                <div className="text-[11px] text-green-300">
                  If the primary model fails due to rate limits, errors, or billing issues, the system will automatically try each fallback in order.
                </div>
              </div>
            </div>
          )}

          {/* Done */}
          {step === 'done' && (
            <div className="flex flex-col items-center gap-5 py-6 text-center">
              <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-ide-text mb-1">Strategy applied!</h2>
                <p className="text-[11px] text-ide-text-dim max-w-xs mx-auto">
                  Your model chain is now active. Any chat or agent request will use this strategy with automatic failover.
                </p>
              </div>
              <button onClick={onClose} className="px-4 py-2 text-sm bg-ide-accent text-ide-bg rounded hover:bg-ide-accent/90 font-medium transition-colors">
                Close
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== 'goal' && step !== 'done' && (
          <div className="flex items-center gap-3 px-6 py-4 border-t border-ide-border flex-shrink-0">
            <button
              onClick={() => {
                const prev: Record<WizardStep, WizardStep> = { goal: 'goal', primary: 'goal', fallbacks: 'primary', review: 'fallbacks', done: 'review' };
                setStep(prev[step]);
              }}
              className="flex items-center gap-1 text-xs px-3 py-1.5 border border-ide-border rounded hover:border-ide-accent/40 text-ide-text-dim hover:text-ide-text transition-colors"
            >
              <ChevronLeft className="w-3 h-3" /> Back
            </button>
            <div className="flex-1" />
            {step === 'primary' && (
              <button
                onClick={() => setStep('fallbacks')}
                disabled={!primaryModel}
                className="flex items-center gap-1.5 text-xs px-4 py-1.5 bg-ide-accent/20 text-ide-accent rounded hover:bg-ide-accent/30 disabled:opacity-40 transition-colors"
              >
                Next: Fallbacks <ChevronRight className="w-3 h-3" />
              </button>
            )}
            {step === 'fallbacks' && (
              <button
                onClick={() => setStep('review')}
                className="flex items-center gap-1.5 text-xs px-4 py-1.5 bg-ide-accent/20 text-ide-accent rounded hover:bg-ide-accent/30 transition-colors"
              >
                Review <ChevronRight className="w-3 h-3" />
              </button>
            )}
            {step === 'review' && (
              <button
                onClick={applyAndSave}
                disabled={!primaryModel || saving}
                className="flex items-center gap-1.5 text-xs px-4 py-1.5 bg-ide-accent text-ide-bg rounded hover:bg-ide-accent/90 disabled:opacity-40 transition-colors font-medium"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Apply Strategy
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
