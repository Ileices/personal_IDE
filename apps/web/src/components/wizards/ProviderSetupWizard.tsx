// ============================================
// Provider Setup Wizard
// Step-by-step guided flow for adding AI provider API keys.
// Shows free vs paid providers, tests the connection,
// shows available models and lets user configure fallback chains.
// ============================================
import React, { useState, useEffect } from 'react';
import {
  ChevronRight, ChevronLeft, Check, X, Key, ExternalLink,
  Loader2, Zap, Globe, Shield, AlertTriangle, Info,
  CheckCircle2, XCircle, ArrowRight, Sparkles,
} from 'lucide-react';
import { API_BASE } from '../../config';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProviderOption {
  id: string;
  name: string;
  description: string;
  isFree: boolean;
  freeModels?: string[];
  requiresKey: boolean;
  setupUrl: string;
  keyPlaceholder: string;
  keyHint: string;
}

type WizardStep = 'choose' | 'key' | 'test' | 'models' | 'done';

interface WizardState {
  selectedProvider: ProviderOption | null;
  apiKey: string;
  baseUrl: string;
  testStatus: 'idle' | 'testing' | 'ok' | 'error';
  testMessage: string;
  availableModels: string[];
}

// ─── Provider catalog ────────────────────────────────────────────────────────

const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    id: 'groq',
    name: 'Groq',
    description: 'Ultra-fast inference on dedicated hardware. Generous free tier (14,400 req/day). Best for speed.',
    isFree: true,
    freeModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
    requiresKey: true,
    setupUrl: 'https://console.groq.com/keys',
    keyPlaceholder: 'gsk_...',
    keyHint: 'Get your free API key from console.groq.com/keys',
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    description: "World's fastest inference (2000 tokens/sec). Free tier available. Wafer-scale chips.",
    isFree: true,
    freeModels: ['llama-3.3-70b', 'llama-3.1-8b', 'qwen-3-32b'],
    requiresKey: true,
    setupUrl: 'https://cloud.cerebras.ai',
    keyPlaceholder: 'csk-...',
    keyHint: 'Create a free account at cloud.cerebras.ai',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: "Google's Gemini models. Free tier with Gemini 1.5 Flash (1M context). Access to Gemini 2.0.",
    isFree: true,
    freeModels: ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'],
    requiresKey: true,
    setupUrl: 'https://aistudio.google.com/app/apikey',
    keyPlaceholder: 'AIza...',
    keyHint: 'Get a free API key from Google AI Studio',
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    description: 'Run models 100% locally. No API key needed. Install Ollama and pull any model.',
    isFree: true,
    requiresKey: false,
    setupUrl: 'https://ollama.com',
    keyPlaceholder: '',
    keyHint: 'No API key needed. Just install Ollama and run: ollama serve',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Access 200+ models via one API. Many free models including DeepSeek R1, Llama 3.3, Gemini.',
    isFree: true,
    freeModels: ['meta-llama/llama-3.3-70b-instruct:free', 'deepseek/deepseek-r1:free', 'google/gemini-2.0-flash-exp:free'],
    requiresKey: true,
    setupUrl: 'https://openrouter.ai/keys',
    keyPlaceholder: 'sk-or-...',
    keyHint: 'Create a free account at openrouter.ai and generate a key',
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    description: 'Chinese LLM platform with generous free tiers. Qwen, DeepSeek, Llama models.',
    isFree: true,
    freeModels: ['Qwen/Qwen2.5-7B-Instruct', 'deepseek-ai/DeepSeek-R1-Distill-Llama-8B'],
    requiresKey: true,
    setupUrl: 'https://cloud.siliconflow.cn/account/ak',
    keyPlaceholder: 'sk-...',
    keyHint: 'Register at siliconflow.cn for free API access',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o, o3-mini, o1. Industry standard. Pay-as-you-go pricing.',
    isFree: false,
    requiresKey: true,
    setupUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-...',
    keyHint: 'Create an API key at platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    description: 'Claude 3.5 Sonnet, Claude 3 Opus. Excellent at reasoning and code.',
    isFree: false,
    requiresKey: true,
    setupUrl: 'https://console.anthropic.com/settings/keys',
    keyPlaceholder: 'sk-ant-...',
    keyHint: 'Create an API key at console.anthropic.com',
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    description: 'Grok 3 series. Fast and unfiltered. Competitive with frontier models.',
    isFree: false,
    requiresKey: true,
    setupUrl: 'https://console.x.ai',
    keyPlaceholder: 'xai-...',
    keyHint: 'Get an API key from console.x.ai',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek V3 and R1 — best open-weight models. Very affordable pricing.',
    isFree: false,
    requiresKey: true,
    setupUrl: 'https://platform.deepseek.com/api_keys',
    keyPlaceholder: 'sk-...',
    keyHint: 'Create an API key at platform.deepseek.com',
  },
  {
    id: 'together',
    name: 'Together.ai',
    description: 'Open-source model hosting. Llama, Qwen, DeepSeek. Affordable rates.',
    isFree: false,
    requiresKey: true,
    setupUrl: 'https://api.together.xyz/settings/api-keys',
    keyPlaceholder: '',
    keyHint: 'Get an API key from api.together.xyz',
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    description: 'Mistral Large, Codestral, Pixtral. European AI with free trial credits.',
    isFree: false,
    requiresKey: true,
    setupUrl: 'https://console.mistral.ai/api-keys/',
    keyPlaceholder: '',
    keyHint: 'Create an API key at console.mistral.ai',
  },
];

// ─── Wizard Component ─────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onComplete?: (providerId: string) => void;
  initialStep?: WizardStep;
}

export function ProviderSetupWizard({ onClose, onComplete }: Props) {
  const [step, setStep] = useState<WizardStep>('choose');
  const [state, setState] = useState<WizardState>({
    selectedProvider: null,
    apiKey: '',
    baseUrl: '',
    testStatus: 'idle',
    testMessage: '',
    availableModels: [],
  });
  const [saving, setSaving] = useState(false);

  const steps: WizardStep[] = ['choose', 'key', 'test', 'models', 'done'];
  const stepIndex = steps.indexOf(step);

  function update(partial: Partial<WizardState>) {
    setState(prev => ({ ...prev, ...partial }));
  }

  function selectProvider(p: ProviderOption) {
    update({ selectedProvider: p, apiKey: '', testStatus: 'idle', testMessage: '', availableModels: [] });
    // Skip key step for local providers
    setStep(p.requiresKey ? 'key' : 'test');
  }

  async function testConnection() {
    if (!state.selectedProvider) return;
    update({ testStatus: 'testing', testMessage: 'Connecting…', availableModels: [] });

    try {
      const body: any = { provider: state.selectedProvider.id };
      if (state.apiKey) body.apiKey = state.apiKey;
      if (state.baseUrl) body.baseUrl = state.baseUrl;

      const res = await fetch(`${API_BASE}/api/providers/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.success || data.ok) {
        update({
          testStatus: 'ok',
          testMessage: data.message || 'Connection successful!',
          availableModels: data.models || state.selectedProvider.freeModels || [],
        });
      } else {
        update({ testStatus: 'error', testMessage: data.error || data.message || 'Connection failed.' });
      }
    } catch (err: any) {
      update({ testStatus: 'error', testMessage: `Network error: ${err.message}` });
    }
  }

  async function saveAndFinish() {
    if (!state.selectedProvider) return;
    setSaving(true);

    try {
      const body: any = {
        enabled: true,
        ...(state.apiKey ? { apiKey: state.apiKey } : {}),
        ...(state.baseUrl ? { baseUrl: state.baseUrl } : {}),
      };

      await fetch(`${API_BASE}/api/providers/${state.selectedProvider.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      setStep('done');
      onComplete?.(state.selectedProvider.id);
    } catch (err: any) {
      update({ testMessage: `Save failed: ${err.message}` });
    } finally {
      setSaving(false);
    }
  }

  const STEPS_LABELS: Record<WizardStep, string> = {
    choose: 'Choose Provider',
    key: 'Enter API Key',
    test: 'Test Connection',
    models: 'Available Models',
    done: 'Done',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative bg-ide-bg border border-ide-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-ide-border flex-shrink-0">
          <Sparkles className="w-5 h-5 text-ide-accent" />
          <div>
            <div className="text-sm font-semibold text-ide-text">Provider Setup Wizard</div>
            <div className="text-[11px] text-ide-text-dim">Add and configure an AI model provider</div>
          </div>
          <button onClick={onClose} className="ml-auto text-ide-text-dim hover:text-ide-text">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step progress */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-ide-border flex-shrink-0">
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-1.5 text-[10px] font-medium ${
                i < stepIndex ? 'text-green-400'
                : i === stepIndex ? 'text-ide-accent'
                : 'text-ide-text-dim'
              }`}>
                {i < stepIndex ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : (
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${
                    i === stepIndex ? 'bg-ide-accent/20 text-ide-accent border border-ide-accent/40' : 'bg-ide-panel border border-ide-border'
                  }`}>{i + 1}</div>
                )}
                {STEPS_LABELS[s]}
              </div>
              {i < steps.length - 1 && <div className="w-4 border-t border-ide-border" />}
            </React.Fragment>
          ))}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ── Step: Choose Provider ── */}
          {step === 'choose' && (
            <ChooseProviderStep onSelect={selectProvider} />
          )}

          {/* ── Step: API Key ── */}
          {step === 'key' && state.selectedProvider && (
            <ApiKeyStep
              provider={state.selectedProvider}
              apiKey={state.apiKey}
              baseUrl={state.baseUrl}
              onChange={(apiKey, baseUrl) => update({ apiKey, baseUrl })}
            />
          )}

          {/* ── Step: Test Connection ── */}
          {step === 'test' && state.selectedProvider && (
            <TestConnectionStep
              provider={state.selectedProvider}
              status={state.testStatus}
              message={state.testMessage}
              onTest={testConnection}
            />
          )}

          {/* ── Step: Models ── */}
          {step === 'models' && (
            <ModelsStep
              models={state.availableModels}
              freeModels={state.selectedProvider?.freeModels}
            />
          )}

          {/* ── Step: Done ── */}
          {step === 'done' && state.selectedProvider && (
            <DoneStep provider={state.selectedProvider} onClose={onClose} />
          )}
        </div>

        {/* Footer navigation */}
        {step !== 'choose' && step !== 'done' && (
          <div className="flex items-center gap-3 px-6 py-4 border-t border-ide-border flex-shrink-0">
            <button
              onClick={() => {
                const prev: Record<WizardStep, WizardStep> = {
                  choose: 'choose',
                  key: 'choose',
                  test: state.selectedProvider?.requiresKey ? 'key' : 'choose',
                  models: 'test',
                  done: 'models',
                };
                setStep(prev[step]);
              }}
              className="flex items-center gap-1 text-xs px-3 py-1.5 border border-ide-border rounded hover:border-ide-accent/40 text-ide-text-dim hover:text-ide-text transition-colors"
            >
              <ChevronLeft className="w-3 h-3" />
              Back
            </button>

            <div className="flex-1" />

            {step === 'key' && (
              <button
                onClick={() => setStep('test')}
                disabled={!!(state.selectedProvider?.requiresKey && !state.apiKey.trim())}
                className="flex items-center gap-1.5 text-xs px-4 py-1.5 bg-ide-accent/20 text-ide-accent rounded hover:bg-ide-accent/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next: Test Connection
                <ChevronRight className="w-3 h-3" />
              </button>
            )}

            {step === 'test' && (
              <>
                {state.testStatus !== 'ok' ? (
                  <button
                    onClick={testConnection}
                    disabled={state.testStatus === 'testing'}
                    className="flex items-center gap-1.5 text-xs px-4 py-1.5 bg-ide-accent/20 text-ide-accent rounded hover:bg-ide-accent/30 disabled:opacity-40 transition-colors"
                  >
                    {state.testStatus === 'testing' ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Zap className="w-3 h-3" />
                    )}
                    Test Connection
                  </button>
                ) : (
                  <button
                    onClick={() => setStep('models')}
                    className="flex items-center gap-1.5 text-xs px-4 py-1.5 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition-colors"
                  >
                    <ArrowRight className="w-3 h-3" />
                    View Models
                  </button>
                )}
              </>
            )}

            {step === 'models' && (
              <button
                onClick={saveAndFinish}
                disabled={saving}
                className="flex items-center gap-1.5 text-xs px-4 py-1.5 bg-ide-accent text-ide-bg rounded hover:bg-ide-accent/90 disabled:opacity-40 transition-colors font-medium"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Save & Enable Provider
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-steps ────────────────────────────────────────────────────────────────

function ChooseProviderStep({ onSelect }: { onSelect: (p: ProviderOption) => void }) {
  const [showPaid, setShowPaid] = useState(false);
  const free = PROVIDER_OPTIONS.filter(p => p.isFree);
  const paid = PROVIDER_OPTIONS.filter(p => !p.isFree);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-ide-text mb-1">Choose a Provider</h2>
        <p className="text-[11px] text-ide-text-dim">Start with free providers — they have generous limits and no cost.</p>
      </div>

      <div className="space-y-2 mb-4">
        <div className="text-[10px] font-semibold text-green-400 uppercase tracking-wider px-1 mb-1">
          Free Providers (recommended)
        </div>
        {free.map(p => (
          <ProviderCard key={p.id} provider={p} onSelect={onSelect} />
        ))}
      </div>

      <button
        onClick={() => setShowPaid(!showPaid)}
        className="flex items-center gap-1 text-[11px] text-ide-text-dim hover:text-ide-text mb-3"
      >
        {showPaid ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {showPaid ? 'Hide paid providers' : 'Show paid providers'}
      </button>

      {showPaid && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold text-ide-text-dim uppercase tracking-wider px-1 mb-1">
            Paid Providers
          </div>
          {paid.map(p => (
            <ProviderCard key={p.id} provider={p} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProviderCard({ provider, onSelect }: { provider: ProviderOption; onSelect: (p: ProviderOption) => void }) {
  return (
    <button
      onClick={() => onSelect(provider)}
      className="w-full text-left p-3 rounded-lg border border-ide-border bg-ide-panel hover:border-ide-accent/40 hover:bg-ide-accent/5 transition-all group"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-ide-text">{provider.name}</span>
            {provider.isFree && (
              <span className="text-[9px] px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded font-medium">FREE</span>
            )}
            {!provider.requiresKey && (
              <span className="text-[9px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded">No key needed</span>
            )}
          </div>
          <p className="text-[11px] text-ide-text-dim mt-0.5">{provider.description}</p>
          {provider.freeModels && (
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {provider.freeModels.slice(0, 3).map(m => (
                <span key={m} className="text-[9px] px-1 py-0 bg-ide-bg border border-ide-border rounded text-ide-text-dim font-mono">
                  {m.split('/').pop()?.split(':')[0]}
                </span>
              ))}
              {(provider.freeModels.length > 3) && (
                <span className="text-[9px] text-ide-text-dim">+{provider.freeModels.length - 3} more</span>
              )}
            </div>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-ide-text-dim group-hover:text-ide-accent flex-shrink-0 mt-0.5 transition-colors" />
      </div>
    </button>
  );
}

function ApiKeyStep({
  provider, apiKey, baseUrl, onChange,
}: {
  provider: ProviderOption;
  apiKey: string;
  baseUrl: string;
  onChange: (apiKey: string, baseUrl: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-ide-text mb-1">Enter Your API Key</h2>
        <p className="text-[11px] text-ide-text-dim">{provider.keyHint}</p>
      </div>

      <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-start gap-2">
        <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-[11px] text-blue-300">
          Your API key is stored encrypted in your local database. It is never sent to any server other than {provider.name}.{' '}
          <a href={provider.setupUrl} target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">
            Get your key <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-ide-text-dim mb-1.5">API Key</label>
        <div className="relative">
          <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ide-text-dim" />
          <input
            type="password"
            value={apiKey}
            onChange={e => onChange(e.target.value, baseUrl)}
            placeholder={provider.keyPlaceholder || 'Paste your API key…'}
            autoComplete="off"
            className="w-full pl-9 pr-3 py-2 bg-ide-panel border border-ide-border rounded text-sm font-mono focus:outline-none focus:border-ide-accent text-ide-text"
          />
        </div>
      </div>

      {provider.id === 'ollama' && (
        <div>
          <label className="block text-[11px] font-medium text-ide-text-dim mb-1.5">Ollama Base URL (optional)</label>
          <input
            type="text"
            value={baseUrl}
            onChange={e => onChange(apiKey, e.target.value)}
            placeholder="http://localhost:11434"
            className="w-full px-3 py-2 bg-ide-panel border border-ide-border rounded text-sm font-mono focus:outline-none focus:border-ide-accent text-ide-text"
          />
          <p className="text-[10px] text-ide-text-dim mt-1">Leave blank to use default (localhost:11434)</p>
        </div>
      )}
    </div>
  );
}

function TestConnectionStep({
  provider, status, message, onTest,
}: {
  provider: ProviderOption;
  status: WizardState['testStatus'];
  message: string;
  onTest: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-ide-text mb-1">Test Connection to {provider.name}</h2>
        <p className="text-[11px] text-ide-text-dim">Click the button below to verify your credentials work.</p>
      </div>

      <div className={`p-4 rounded-lg border flex items-start gap-3 ${
        status === 'idle'    ? 'border-ide-border bg-ide-panel' :
        status === 'testing' ? 'border-ide-accent/30 bg-ide-accent/5' :
        status === 'ok'      ? 'border-green-500/30 bg-green-500/5' :
                               'border-red-500/30 bg-red-500/5'
      }`}>
        {status === 'testing' && <Loader2 className="w-4 h-4 text-ide-accent animate-spin flex-shrink-0 mt-0.5" />}
        {status === 'ok' && <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />}
        {status === 'error' && <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />}
        {status === 'idle' && <Info className="w-4 h-4 text-ide-text-dim flex-shrink-0 mt-0.5" />}

        <div>
          <div className={`text-xs font-medium ${
            status === 'ok' ? 'text-green-400' : status === 'error' ? 'text-red-400' : 'text-ide-text'
          }`}>
            {status === 'idle' ? 'Ready to test' :
             status === 'testing' ? 'Testing connection…' :
             status === 'ok' ? 'Connection successful!' : 'Connection failed'}
          </div>
          {message && <div className="text-[11px] text-ide-text-dim mt-0.5">{message}</div>}
        </div>
      </div>

      {status !== 'ok' && (
        <button
          onClick={onTest}
          disabled={status === 'testing'}
          className="flex items-center gap-2 text-sm px-4 py-2 bg-ide-accent/20 text-ide-accent rounded hover:bg-ide-accent/30 disabled:opacity-40 transition-colors"
        >
          {status === 'testing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          {status === 'testing' ? 'Testing…' : 'Test Connection'}
        </button>
      )}

      {status === 'error' && (
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="text-[11px] text-yellow-400">
            <div className="font-medium mb-1">Common fixes:</div>
            <ul className="list-disc list-inside space-y-0.5 text-yellow-400/80">
              <li>Check your API key is correct and hasn't expired</li>
              <li>Ensure you have credits/quota on your account</li>
              <li>Check that the provider's service is online</li>
              {provider.id === 'ollama' && <li>Run <code className="font-mono bg-yellow-500/10 px-1 rounded">ollama serve</code> in your terminal</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function ModelsStep({ models, freeModels }: { models: string[]; freeModels?: string[] }) {
  const displayModels = models.length > 0 ? models : (freeModels || []);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-ide-text mb-1">Available Models</h2>
        <p className="text-[11px] text-ide-text-dim">
          {models.length > 0
            ? `${models.length} models detected on your account`
            : 'Models that will be available after setup:'}
        </p>
      </div>

      <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
        {displayModels.map(m => (
          <div key={m} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-ide-panel">
            <CheckCircle2 className="w-3 h-3 text-green-400 flex-shrink-0" />
            <span className="text-[11px] font-mono text-ide-text">{m}</span>
          </div>
        ))}
        {displayModels.length === 0 && (
          <div className="text-[11px] text-ide-text-dim py-4 text-center">No models listed — they'll appear after saving.</div>
        )}
      </div>
    </div>
  );
}

function DoneStep({ provider, onClose }: { provider: ProviderOption; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-5 py-6 text-center">
      <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center">
        <CheckCircle2 className="w-8 h-8 text-green-400" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-ide-text mb-1">{provider.name} is ready!</h2>
        <p className="text-[11px] text-ide-text-dim max-w-xs mx-auto">
          Your provider has been configured and enabled. All model pickers will now show {provider.name} models.
        </p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm bg-ide-accent text-ide-bg rounded hover:bg-ide-accent/90 font-medium transition-colors"
        >
          Start Using Models
        </button>
      </div>
      <div className="text-[10px] text-ide-text-dim">
        Tip: Add more providers for automatic fallback if one fails.
      </div>
    </div>
  );
}
