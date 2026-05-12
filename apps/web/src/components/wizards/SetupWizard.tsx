// ============================================
// First-Run Setup Wizard
// Shown when no LLM provider is configured.
// Steps: Welcome → Add Provider → Create Project → Done
// ============================================
import React, { useState } from 'react';
import { Bot, Key, FolderOpen, CheckCircle2, ChevronRight, Loader2, Eye, EyeOff, Zap } from 'lucide-react';
import { useProjectStore } from '../../stores/projectStore';
import { API_BASE } from '../../config.js';

interface Props {
  onComplete: () => void;
}

type Step = 'welcome' | 'provider' | 'project' | 'done';

const PROVIDER_OPTIONS = [
  { id: 'github', label: 'GitHub Models', desc: 'Access GPT-4o, o4-mini, DeepSeek R1 via GitHub Models marketplace. Free with a GitHub account (models:read scope).', color: 'text-slate-300', placeholder: 'ghp_xxxxxxxxxxxx' },
  { id: 'openai', label: 'OpenAI', desc: 'GPT-4o, o3-mini. Pay-per-token.', color: 'text-green-400', placeholder: 'sk-xxxxxxxxxxxx' },
  { id: 'ollama', label: 'Ollama (Local)', desc: 'Run models locally — no API key needed.', color: 'text-blue-400', placeholder: 'http://localhost:11434' },
  { id: 'groq', label: 'Groq', desc: 'Ultra-fast inference. Free tier available.', color: 'text-orange-400', placeholder: 'gsk_xxxxxxxxxxxx' },
];

const PROJECT_TEMPLATES = [
  { id: 'blank', label: 'Blank Project', desc: 'Empty workspace — agent starts from scratch', icon: '📁' },
  { id: 'webapp', label: 'Web App', desc: 'React + TypeScript + Vite + Tailwind', icon: '🌐' },
  { id: 'game', label: 'Browser Game', desc: 'Phaser 3 + TypeScript — 2D game starter', icon: '🎮' },
  { id: 'python', label: 'Python App', desc: 'FastAPI + Python — backend or script', icon: '🐍' },
  { id: 'fullstack', label: 'Full-Stack App', desc: 'Node + React — API + frontend', icon: '⚡' },
];

export function SetupWizard({ onComplete }: Props) {
  const { createProject } = useProjectStore();
  const [step, setStep] = useState<Step>('welcome');
  const [selectedProvider, setSelectedProvider] = useState('github');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [projectName, setProjectName] = useState('');
  const [projectPath, setProjectPath] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('blank');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  async function testAndSaveProvider() {
    if (!apiKey.trim() && selectedProvider !== 'ollama') {
      setTestResult({ ok: false, msg: 'Enter an API key first' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const testBody = selectedProvider === 'ollama'
        ? { baseUrl: apiKey || 'http://localhost:11434' }
        : { apiKey };
      const res = await fetch(`${API_BASE}/api/providers/${selectedProvider}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testBody),
      });
      const data = await res.json();
      if (data.ok) {
        // Save provider config
        const configBody = selectedProvider === 'ollama'
          ? { baseUrl: apiKey || 'http://localhost:11434', enabled: true }
          : { apiKey, enabled: true };
        await fetch(`${API_BASE}/api/providers/${selectedProvider}/configure`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(configBody),
        });
        setTestResult({ ok: true, msg: '✓ Connected! Provider saved.' });
        setTimeout(() => setStep('project'), 800);
      } else {
        setTestResult({ ok: false, msg: data.error || 'Connection failed' });
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message });
    }
    setTesting(false);
  }

  async function createNewProject() {
    if (!projectName.trim()) { setError('Project name is required'); return; }
    if (!projectPath.trim()) { setError('Project folder path is required'); return; }
    setCreating(true);
    setError('');
    try {
      await createProject(projectName.trim(), projectPath.trim(), `Template: ${selectedTemplate}`);
      setStep('done');
    } catch (e: any) {
      setError(e.message || 'Failed to create project');
    }
    setCreating(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-xl bg-ide-sidebar border border-ide-border rounded-xl shadow-2xl overflow-hidden">

        {/* Progress bar */}
        <div className="h-1 bg-ide-border">
          <div
            className="h-full bg-ide-accent transition-all duration-500"
            style={{ width: step === 'welcome' ? '0%' : step === 'provider' ? '33%' : step === 'project' ? '66%' : '100%' }}
          />
        </div>

        {/* ── Step: Welcome ── */}
        {step === 'welcome' && (
          <div className="p-8 flex flex-col items-center text-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-ide-accent/20 flex items-center justify-center">
              <Bot className="w-8 h-8 text-ide-accent" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-ide-text mb-2">Welcome to Personal IDE</h1>
              <p className="text-ide-text-dim text-sm leading-relaxed max-w-sm">
                Your autonomous coding assistant. Let's set up an LLM provider and create your first project — takes about 60 seconds.
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full text-left bg-ide-panel rounded-lg p-4 text-xs text-ide-text-dim">
              <div className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" /> Connect an LLM (GitHub Copilot, OpenAI, Ollama, Groq)</div>
              <div className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" /> Create a project with a template</div>
              <div className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" /> Tell the agent what to build — it writes, runs, and fixes code for you</div>
            </div>
            <button
              onClick={() => setStep('provider')}
              className="w-full py-2.5 rounded-lg bg-ide-accent text-ide-bg font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
            >
              Get Started <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Step: Provider ── */}
        {step === 'provider' && (
          <div className="p-6 flex flex-col gap-4">
            <div>
              <h2 className="text-base font-semibold text-ide-text mb-1">Connect an LLM Provider</h2>
              <p className="text-xs text-ide-text-dim">The agent uses this to write code. Pick one to start — you can add more later.</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {PROVIDER_OPTIONS.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedProvider(p.id); setApiKey(''); setTestResult(null); }}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    selectedProvider === p.id
                      ? 'border-ide-accent bg-ide-accent/10'
                      : 'border-ide-border bg-ide-panel hover:border-ide-accent/50'
                  }`}
                >
                  <div className={`text-xs font-semibold ${p.color}`}>{p.label}</div>
                  <div className="text-[10px] text-ide-text-dim mt-0.5 leading-tight">{p.desc}</div>
                </button>
              ))}
            </div>

            <div>
              <label className="text-xs text-ide-text-dim mb-1 block">
                {selectedProvider === 'ollama' ? 'Ollama Base URL' : 'API Key'}
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => { setApiKey(e.target.value); setTestResult(null); }}
                  placeholder={PROVIDER_OPTIONS.find(p => p.id === selectedProvider)?.placeholder}
                  className="w-full bg-ide-panel border border-ide-border rounded-lg px-3 py-2 text-sm text-ide-text pr-10 focus:outline-none focus:border-ide-accent"
                />
                <button
                  onClick={() => setShowKey(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ide-text-dim hover:text-ide-text"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {testResult && (
              <div className={`text-xs rounded-lg px-3 py-2 ${testResult.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                {testResult.msg}
              </div>
            )}

            <button
              onClick={testAndSaveProvider}
              disabled={testing}
              className="w-full py-2.5 rounded-lg bg-ide-accent text-ide-bg font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {testing ? 'Testing...' : 'Test & Save'}
            </button>

            <button onClick={() => setStep('project')} className="text-xs text-ide-text-dim hover:text-ide-text text-center">
              Skip for now (configure later in Settings)
            </button>
          </div>
        )}

        {/* ── Step: Project ── */}
        {step === 'project' && (
          <div className="p-6 flex flex-col gap-4">
            <div>
              <h2 className="text-base font-semibold text-ide-text mb-1">Create Your First Project</h2>
              <p className="text-xs text-ide-text-dim">Pick a template and set a folder. The agent will scaffold and build inside this folder.</p>
            </div>

            <div className="grid grid-cols-1 gap-1.5 max-h-44 overflow-y-auto pr-1">
              {PROJECT_TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplate(t.id)}
                  className={`p-2.5 rounded-lg border text-left flex items-center gap-3 transition-all ${
                    selectedTemplate === t.id
                      ? 'border-ide-accent bg-ide-accent/10'
                      : 'border-ide-border bg-ide-panel hover:border-ide-accent/50'
                  }`}
                >
                  <span className="text-xl shrink-0">{t.icon}</span>
                  <div>
                    <div className="text-xs font-semibold text-ide-text">{t.label}</div>
                    <div className="text-[10px] text-ide-text-dim">{t.desc}</div>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <div>
                <label className="text-xs text-ide-text-dim mb-1 block">Project Name</label>
                <input
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  placeholder="my-awesome-app"
                  className="w-full bg-ide-panel border border-ide-border rounded-lg px-3 py-2 text-sm text-ide-text focus:outline-none focus:border-ide-accent"
                />
              </div>
              <div>
                <label className="text-xs text-ide-text-dim mb-1 block">Folder Path (on this machine)</label>
                <input
                  value={projectPath}
                  onChange={e => setProjectPath(e.target.value)}
                  placeholder="C:\projects\my-awesome-app"
                  className="w-full bg-ide-panel border border-ide-border rounded-lg px-3 py-2 text-sm text-ide-text focus:outline-none focus:border-ide-accent"
                />
              </div>
            </div>

            {error && <div className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</div>}

            <div className="flex gap-2">
              <button onClick={() => setStep('provider')} className="flex-1 py-2 rounded-lg border border-ide-border text-xs text-ide-text-dim hover:border-ide-accent/50">
                Back
              </button>
              <button
                onClick={createNewProject}
                disabled={creating}
                className="flex-1 py-2 rounded-lg bg-ide-accent text-ide-bg font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />}
                {creating ? 'Creating...' : 'Create Project'}
              </button>
            </div>

            <button onClick={onComplete} className="text-xs text-ide-text-dim hover:text-ide-text text-center">
              Skip — I'll create a project later
            </button>
          </div>
        )}

        {/* ── Step: Done ── */}
        {step === 'done' && (
          <div className="p-8 flex flex-col items-center text-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-green-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-ide-text mb-2">You're all set!</h2>
              <p className="text-ide-text-dim text-sm leading-relaxed max-w-sm">
                Your project is ready. Click <strong className="text-ide-accent">Agent</strong> in the left bar, describe what you want to build, and hit Start.
              </p>
            </div>
            <div className="w-full bg-ide-panel rounded-lg p-4 text-xs text-ide-text-dim text-left flex flex-col gap-2">
              <p className="font-semibold text-ide-text">Quick tips:</p>
              <div>• <strong>Chat tab</strong> — ask questions about code</div>
              <div>• <strong>Agent tab</strong> — autonomous build loop (write → run → fix)</div>
              <div>• <strong>Preview tab</strong> — live app preview once agent starts a server</div>
              <div>• <strong>Terminal</strong> at the bottom — run commands yourself</div>
            </div>
            <button
              onClick={onComplete}
              className="w-full py-2.5 rounded-lg bg-ide-accent text-ide-bg font-semibold text-sm hover:opacity-90"
            >
              Open My IDE →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
