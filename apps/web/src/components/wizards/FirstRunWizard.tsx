// ============================================
// First Run Wizard
// Shown on first app launch (checks localStorage flag).
// Guides the user through: Welcome → Provider Setup → 
// Ollama → Model Strategy → Done.
// ============================================
import React, { useState, useEffect } from 'react';
import {
  Sparkles, ChevronRight, ChevronLeft, Check, X,
  Cpu, Zap, Globe, Rocket, ArrowRight, CheckCircle2,
  Star, Code2, Brain, Shield, ExternalLink,
} from 'lucide-react';
import { ProviderSetupWizard } from './ProviderSetupWizard';
import { ModelStrategyWizard } from './ModelStrategyWizard';

// ─── Types ───────────────────────────────────────────────────────────────────

type WizardStep = 'welcome' | 'provider' | 'ollama' | 'strategy' | 'done';

const STORAGE_KEY = 'personal_ide_first_run_complete';

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useFirstRunWizard() {
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    // Show wizard if first run flag is not set
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) {
      // Small delay so the app loads first
      const t = setTimeout(() => setShowWizard(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  function completeFirstRun() {
    localStorage.setItem(STORAGE_KEY, '1');
    setShowWizard(false);
  }

  function resetFirstRun() {
    localStorage.removeItem(STORAGE_KEY);
    setShowWizard(true);
  }

  return { showWizard, setShowWizard, completeFirstRun, resetFirstRun };
}

// ─── Main Wizard ─────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

export function FirstRunWizard({ onClose }: Props) {
  const [step, setStep] = useState<WizardStep>('welcome');
  const [showProviderWizard, setShowProviderWizard] = useState(false);
  const [showStrategyWizard, setShowStrategyWizard] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Set<WizardStep>>(new Set());

  function markComplete(s: WizardStep) {
    setCompletedSteps(prev => new Set([...prev, s]));
  }

  function finish() {
    localStorage.setItem(STORAGE_KEY, '1');
    onClose();
  }

  // Sub-wizard overlay — render on top of the first run wizard
  if (showProviderWizard) {
    return (
      <ProviderSetupWizard
        onClose={() => setShowProviderWizard(false)}
        onComplete={() => {
          setShowProviderWizard(false);
          markComplete('provider');
          setStep('ollama');
        }}
      />
    );
  }

  if (showStrategyWizard) {
    return (
      <ModelStrategyWizard
        onClose={() => setShowStrategyWizard(false)}
        onApply={() => {
          setShowStrategyWizard(false);
          markComplete('strategy');
          setStep('done');
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative bg-ide-bg border border-ide-border rounded-xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">

        {/* Accent top bar */}
        <div className="h-0.5 w-full bg-gradient-to-r from-ide-accent via-purple-400 to-pink-400 flex-shrink-0" />

        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-5 pb-2 flex-shrink-0">
          <div className="p-2 rounded-lg bg-ide-accent/15">
            <Sparkles className="w-5 h-5 text-ide-accent" />
          </div>
          <div>
            <div className="text-sm font-semibold text-ide-text">Welcome to Personal IDE</div>
            <div className="text-[11px] text-ide-text-dim">Let's get you set up in 2 minutes</div>
          </div>
          <button onClick={onClose} className="ml-auto text-ide-text-dim hover:text-ide-text" title="Skip setup (you can do this later)">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step indicator dots */}
        <div className="flex items-center justify-center gap-2 py-3 flex-shrink-0">
          {(['welcome', 'provider', 'ollama', 'strategy', 'done'] as WizardStep[]).map(s => (
            <div key={s} className={`rounded-full transition-all ${
              s === step ? 'w-4 h-1.5 bg-ide-accent' : completedSteps.has(s) ? 'w-1.5 h-1.5 bg-green-400' : 'w-1.5 h-1.5 bg-ide-border'
            }`} />
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">

          {/* ── Welcome ── */}
          {step === 'welcome' && (
            <WelcomeStep onNext={() => setStep('provider')} />
          )}

          {/* ── Provider Setup ── */}
          {step === 'provider' && (
            <ProviderStep
              completed={completedSteps.has('provider')}
              onOpenWizard={() => setShowProviderWizard(true)}
              onSkip={() => { markComplete('provider'); setStep('ollama'); }}
              onNext={() => setStep('ollama')}
            />
          )}

          {/* ── Ollama ── */}
          {step === 'ollama' && (
            <OllamaStep
              completed={completedSteps.has('ollama')}
              onMarkDone={() => { markComplete('ollama'); setStep('strategy'); }}
              onSkip={() => setStep('strategy')}
            />
          )}

          {/* ── Strategy ── */}
          {step === 'strategy' && (
            <StrategyStep
              completed={completedSteps.has('strategy')}
              onOpenWizard={() => setShowStrategyWizard(true)}
              onSkip={() => { markComplete('strategy'); setStep('done'); }}
            />
          )}

          {/* ── Done ── */}
          {step === 'done' && (
            <DoneStep completedSteps={completedSteps} onFinish={finish} />
          )}
        </div>

        {/* Prev/Next nav for middle steps */}
        {step !== 'welcome' && step !== 'done' && (
          <div className="flex items-center gap-3 px-6 py-4 border-t border-ide-border flex-shrink-0">
            <button
              onClick={() => {
                const prev: Record<WizardStep, WizardStep> = { welcome: 'welcome', provider: 'welcome', ollama: 'provider', strategy: 'ollama', done: 'strategy' };
                setStep(prev[step]);
              }}
              className="flex items-center gap-1 text-xs text-ide-text-dim hover:text-ide-text"
            >
              <ChevronLeft className="w-3 h-3" /> Back
            </button>
            <div className="flex-1" />
            <button
              onClick={() => {
                const next: Record<WizardStep, WizardStep> = { welcome: 'provider', provider: 'ollama', ollama: 'strategy', strategy: 'done', done: 'done' };
                setStep(next[step]);
              }}
              className="flex items-center gap-1 text-xs text-ide-text-dim hover:text-ide-text"
            >
              Skip <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-steps ────────────────────────────────────────────────────────────────

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-5">
      <div className="text-center py-4">
        <div className="text-3xl mb-3">🚀</div>
        <h2 className="text-base font-semibold text-ide-text mb-2">Your AI-powered development environment</h2>
        <p className="text-[11px] text-ide-text-dim leading-relaxed">
          Personal IDE gives you access to hundreds of AI models, an intelligent agent fleet, local model inference, and more — all in one place.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: Globe, color: 'text-blue-400 bg-blue-500/10', title: '145+ Cloud Models', desc: 'Groq, Gemini, OpenAI, Anthropic, and more' },
          { icon: Cpu, color: 'text-green-400 bg-green-500/10', title: 'Local Models', desc: 'Run models privately on your machine with Ollama' },
          { icon: Shield, color: 'text-purple-400 bg-purple-500/10', title: 'Auto Failover', desc: 'If one model fails, the next in chain is tried' },
          { icon: Brain, color: 'text-pink-400 bg-pink-500/10', title: 'Agent Fleet', desc: 'Specialized agents for coding, research, and more' },
        ].map(({ icon: Icon, color, title, desc }) => (
          <div key={title} className="p-3 rounded-lg border border-ide-border bg-ide-panel">
            <div className={`w-7 h-7 rounded-lg ${color.split(' ')[1]} flex items-center justify-center mb-2`}>
              <Icon className={`w-3.5 h-3.5 ${color.split(' ')[0]}`} />
            </div>
            <div className="text-[11px] font-medium text-ide-text">{title}</div>
            <div className="text-[10px] text-ide-text-dim mt-0.5">{desc}</div>
          </div>
        ))}
      </div>

      <button
        onClick={onNext}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-ide-accent text-ide-bg rounded-lg font-medium text-sm hover:bg-ide-accent/90 transition-colors"
      >
        Get Started <ArrowRight className="w-4 h-4" />
      </button>

      <p className="text-[10px] text-ide-text-dim text-center">Setup takes about 2 minutes. You can skip any step.</p>
    </div>
  );
}

function ProviderStep({
  completed, onOpenWizard, onSkip, onNext,
}: {
  completed: boolean;
  onOpenWizard: () => void;
  onSkip: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-ide-text mb-1">Connect an AI Provider</h2>
        <p className="text-[11px] text-ide-text-dim">
          Add at least one provider to start chatting. We recommend starting with a <span className="text-green-400 font-medium">free</span> provider like Groq or Gemini.
        </p>
      </div>

      {completed ? (
        <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
          <CheckCircle2 className="w-4 h-4 text-green-400" />
          <span className="text-[11px] text-green-400">Provider configured!</span>
          <button onClick={onNext} className="ml-auto text-[11px] text-ide-accent hover:underline">Continue →</button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {[
              { name: 'Groq', desc: 'Free · 14,400 req/day · Ultra-fast', color: 'text-green-400' },
              { name: 'Gemini', desc: 'Free · 1M context · Google AI', color: 'text-blue-400' },
              { name: 'Cerebras', desc: 'Free · Fastest (2000 t/s)', color: 'text-purple-400' },
            ].map(p => (
              <div key={p.name} className="flex items-center gap-3 p-2.5 rounded border border-ide-border bg-ide-panel">
                <div className={`text-[10px] font-medium ${p.color}`}>★</div>
                <div>
                  <span className="text-[11px] font-medium text-ide-text">{p.name}</span>
                  <span className="text-[10px] text-ide-text-dim ml-2">{p.desc}</span>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={onOpenWizard}
            className="w-full flex items-center justify-center gap-2 py-2 bg-ide-accent/20 text-ide-accent rounded hover:bg-ide-accent/30 text-sm transition-colors"
          >
            <Zap className="w-4 h-4" />
            Set Up a Provider
          </button>

          <button onClick={onSkip} className="w-full text-[11px] text-ide-text-dim hover:text-ide-text text-center py-1 transition-colors">
            Skip — I'll set this up later
          </button>
        </>
      )}
    </div>
  );
}

function OllamaStep({
  completed, onMarkDone, onSkip,
}: {
  completed: boolean;
  onMarkDone: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-ide-text mb-1">Local Models (Optional)</h2>
        <p className="text-[11px] text-ide-text-dim">
          Ollama lets you run AI models 100% on your own hardware. No API key, no internet required, fully private.
        </p>
      </div>

      <div className="p-3 bg-ide-panel rounded-lg border border-ide-border space-y-2">
        <div className="text-[11px] font-medium text-ide-text">Quick setup:</div>
        <ol className="text-[11px] text-ide-text-dim space-y-1.5 list-decimal list-inside">
          <li>
            Download Ollama from{' '}
            <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="text-ide-accent underline inline-flex items-center gap-0.5">
              ollama.com <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </li>
          <li>Run <code className="font-mono bg-ide-bg px-1 rounded">ollama serve</code> in your terminal</li>
          <li>Use the <span className="text-ide-accent">Local Model Catalog</span> in the sidebar to download models</li>
        </ol>
      </div>

      {completed ? (
        <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
          <CheckCircle2 className="w-4 h-4 text-green-400" />
          <span className="text-[11px] text-green-400">Ollama configured!</span>
          <button onClick={() => { onMarkDone(); }} className="ml-auto text-[11px] text-ide-accent hover:underline">Continue →</button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={onMarkDone}
            className="flex-1 py-2 text-sm bg-ide-accent/20 text-ide-accent rounded hover:bg-ide-accent/30 transition-colors"
          >
            I've set up Ollama
          </button>
          <button
            onClick={onSkip}
            className="px-4 py-2 text-sm border border-ide-border rounded text-ide-text-dim hover:text-ide-text transition-colors"
          >
            Skip
          </button>
        </div>
      )}
    </div>
  );
}

function StrategyStep({
  completed, onOpenWizard, onSkip,
}: {
  completed: boolean;
  onOpenWizard: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-ide-text mb-1">Model Strategy</h2>
        <p className="text-[11px] text-ide-text-dim">
          Set a primary model and a fallback chain. If the primary fails, the next model in line is automatically tried.
        </p>
      </div>

      <div className="p-3 bg-ide-panel rounded-lg border border-ide-border">
        <div className="text-[11px] font-medium text-ide-text mb-2">Example chain:</div>
        <div className="space-y-1">
          {[
            { label: 'Primary', model: 'groq/llama-3.3-70b-versatile', note: 'Fast & free' },
            { label: 'Fallback 1', model: 'gemini/gemini-1.5-flash', note: 'If Groq is overloaded' },
            { label: 'Fallback 2', model: 'cerebras/llama3.1-8b', note: 'If Gemini rate-limits' },
          ].map(item => (
            <div key={item.model} className="flex items-center gap-2 text-[10px]">
              <span className="w-14 text-right text-ide-text-dim">{item.label}</span>
              <span className="font-mono text-ide-text">{item.model}</span>
              <span className="text-ide-text-dim">— {item.note}</span>
            </div>
          ))}
        </div>
      </div>

      {completed ? (
        <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
          <CheckCircle2 className="w-4 h-4 text-green-400" />
          <span className="text-[11px] text-green-400">Strategy configured!</span>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={onOpenWizard}
            className="flex-1 py-2 text-sm bg-ide-accent/20 text-ide-accent rounded hover:bg-ide-accent/30 transition-colors"
          >
            <span className="flex items-center justify-center gap-1.5"><Zap className="w-3.5 h-3.5" />Configure Strategy</span>
          </button>
          <button
            onClick={onSkip}
            className="px-4 py-2 text-sm border border-ide-border rounded text-ide-text-dim hover:text-ide-text transition-colors"
          >
            Skip
          </button>
        </div>
      )}
    </div>
  );
}

function DoneStep({ completedSteps, onFinish }: { completedSteps: Set<WizardStep>; onFinish: () => void }) {
  const stepsChecked: { key: WizardStep; label: string }[] = [
    { key: 'provider', label: 'Provider configured' },
    { key: 'ollama', label: 'Ollama set up' },
    { key: 'strategy', label: 'Model strategy configured' },
  ];

  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <div className="text-4xl">🎉</div>
      <div>
        <h2 className="text-base font-semibold text-ide-text mb-1">You're all set!</h2>
        <p className="text-[11px] text-ide-text-dim max-w-xs mx-auto">
          Personal IDE is ready to use. Start a chat, run an agent, or explore the features.
        </p>
      </div>

      <div className="w-full space-y-1.5">
        {stepsChecked.map(({ key, label }) => (
          <div key={key} className={`flex items-center gap-2 p-2 rounded text-[11px] ${
            completedSteps.has(key)
              ? 'text-green-400'
              : 'text-ide-text-dim'
          }`}>
            {completedSteps.has(key)
              ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
              : <div className="w-3.5 h-3.5 rounded-full border border-ide-border flex-shrink-0" />
            }
            {label}
            {!completedSteps.has(key) && <span className="text-[10px]">(can set up later)</span>}
          </div>
        ))}
      </div>

      <button
        onClick={onFinish}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-ide-accent text-ide-bg rounded-lg font-medium text-sm hover:bg-ide-accent/90 transition-colors"
      >
        <Rocket className="w-4 h-4" />
        Launch Personal IDE
      </button>

      <p className="text-[10px] text-ide-text-dim">
        You can access these wizards anytime via the sidebar.
      </p>
    </div>
  );
}
