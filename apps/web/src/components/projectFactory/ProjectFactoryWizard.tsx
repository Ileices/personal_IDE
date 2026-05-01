// ============================================
// ProjectFactoryWizard
// A guided "What are you building?" wizard that:
//   1. Lets user pick a template (or import existing codebase)
//   2. Configures project details + path
//   3. Selects workflow mode + strategy settings
//   4. Scaffolds files and/or runs import analysis
//   5. Pre-fills the task prompt and optionally launches the loop
// ============================================
import React, { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Loader2, FolderOpen, Play, Upload, ExternalLink } from 'lucide-react';
import { API_BASE } from '../../config.js';
import { useProjectStore } from '../../stores/projectStore.js';

interface ScaffoldTemplate {
  id: string;
  name: string;
  description: string;
  stack: string[];
  recommended_workflow: string;
  recommended_strategy: string;
}

export type WorkflowMode = 'build_new' | 'import_refactor' | 'code_review' | 'scale_research';

interface WizardResult {
  workflowMode: WorkflowMode;
  strategyTemplate: string;
  taskPrompt: string;
  autoStart: boolean;
}

interface Props {
  onClose: () => void;
  onLaunch: (result: WizardResult) => void;
}

interface ScaffoldBootstrapStep {
  step: 'install' | 'build' | 'test';
  command: string;
  success: boolean;
  exitCode: number;
  durationMs: number;
  output: string;
}

interface ScaffoldBootstrapInfo {
  enabled: boolean;
  detectedStack?: string;
  recommendedPreviewCommand?: string | null;
  results?: ScaffoldBootstrapStep[];
  allPassed?: boolean;
}

const WORKFLOW_LABELS: Record<WorkflowMode, { label: string; description: string; emoji: string }> = {
  build_new: { emoji: '🏗️', label: 'Build New', description: 'Scaffold and build a brand-new project from scratch' },
  import_refactor: { emoji: '🔧', label: 'Import & Expand', description: 'Bring in an existing codebase, fix it, and grow it' },
  code_review: { emoji: '🔍', label: 'Code Review', description: 'Audit, bug-hunt, and harden an existing codebase' },
  scale_research: { emoji: '🧠', label: 'Scale / Research', description: 'Data science, HPC pipelines, crowdsourced compute, distributed ML' },
};

// Curated example prompts per workflow mode
const EXAMPLE_PROMPTS: Record<WorkflowMode, string[]> = {
  build_new: [
    'Build a 2D platformer game with physics, enemies, and a level editor.',
    'Create a full-stack SaaS dashboard with authentication, billing, and analytics.',
    'Build a Discord bot that tracks server stats and posts weekly reports.',
    'Scaffold a React Native app for tracking workouts with charts and history.',
    'Build a Rust CLI tool that parses CSV files and generates SQL inserts.',
  ],
  import_refactor: [
    'Analyze this imported codebase, map its architecture, fix all errors, and add missing tests.',
    'Refactor this Python data pipeline to use async I/O and add distributed execution support.',
    'Review the existing API, add OpenAPI documentation, fix security issues, and add rate limiting.',
    'Migrate this Express app to Fastify + TypeScript with proper error handling and tests.',
  ],
  code_review: [
    'Perform a full security audit — find SQL injections, XSS vectors, and auth bypasses.',
    'Review all API endpoints for missing validation, rate limiting, and authentication checks.',
    'Find all performance bottlenecks in the data processing pipeline and profile them.',
    'Audit test coverage — identify untested critical paths and write missing tests.',
  ],
  scale_research: [
    'Build a distributed ML training pipeline with checkpointing and multi-GPU support.',
    'Create a crowdsourced HPC coordinator that distributes jobs across volunteered machines.',
    'Implement a federated learning system where clients train locally and aggregate globally.',
    'Build a data lake ingestion pipeline that handles 1M+ events per day with deduplication.',
  ],
};

type Step = 'mode' | 'template' | 'details' | 'prompt' | 'review';

export function ProjectFactoryWizard({ onClose, onLaunch }: Props) {
  const { activeProject } = useProjectStore();
  const [step, setStep] = useState<Step>('mode');

  // Selections
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>('build_new');
  const [templateId, setTemplateId] = useState<string>('');
  const [importPath, setImportPath] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectPath, setProjectPath] = useState('');
  const [selectedPrompt, setSelectedPrompt] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [strategyTemplate, setStrategyTemplate] = useState('fullstack-balanced');
  const [strictQualityGate, setStrictQualityGate] = useState(true);
  const [autoStart, setAutoStart] = useState(true);
  const [bootstrapAfterScaffold, setBootstrapAfterScaffold] = useState(true);
  const [autoStartPreview, setAutoStartPreview] = useState(true);

  // Remote state
  const [templates, setTemplates] = useState<ScaffoldTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [scaffolding, setScaffolding] = useState(false);
  const [startingPreview, setStartingPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [scaffoldResult, setScaffoldResult] = useState<{ written: string[]; message: string; bootstrap?: ScaffoldBootstrapInfo } | null>(null);
  const [analysisResult, setAnalysisResult] = useState<{
    healthScore: number; fileCount: number; techStack: string[];
    issues: string[]; recommendedWorkflowMode: string; recommendedStrategyTemplate: string;
    analysisReport: string;
  } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (step === 'template' && workflowMode === 'build_new') {
      setLoadingTemplates(true);
      fetch(`${API_BASE}/api/project-factory/templates`)
        .then(r => r.json())
        .then(d => setTemplates(d.templates || []))
        .catch(() => {})
        .finally(() => setLoadingTemplates(false));
    }
  }, [step, workflowMode]);

  const handleScaffold = async () => {
    if (!activeProject || !templateId) return;
    setScaffolding(true);
    setError('');
    setPreviewUrl('');
    try {
      const res = await fetch(`${API_BASE}/api/project-factory/scaffold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject.id,
          templateId,
          targetPath: projectPath || undefined,
          bootstrap: bootstrapAfterScaffold,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Scaffold failed'); return; }
      setScaffoldResult(data);
      // Apply recommended settings
      if (data.recommendedWorkflowMode) setWorkflowMode(data.recommendedWorkflowMode);
      if (data.recommendedStrategyTemplate) setStrategyTemplate(data.recommendedStrategyTemplate);

      if (autoStartPreview && data?.bootstrap?.recommendedPreviewCommand) {
        setStartingPreview(true);
        try {
          const previewRes = await fetch(`${API_BASE}/api/preview/smart-start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectRoot: projectPath || activeProject.rootPath }),
          });
          const previewData = await previewRes.json();
          if (previewData?.url) setPreviewUrl(String(previewData.url));
        } catch {
          // best-effort
        } finally {
          setStartingPreview(false);
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setScaffolding(false);
    }
  };

  const handleAnalyzeImport = async () => {
    if (!activeProject) return;
    const path = importPath || activeProject.rootPath;
    setAnalyzing(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/project-factory/analyze-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject.id, folderPath: path }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Analysis failed'); return; }
      setAnalysisResult(data);
      // Accept recommendations
      if (data.recommendedWorkflowMode) setWorkflowMode(data.recommendedWorkflowMode as WorkflowMode);
      if (data.recommendedStrategyTemplate) setStrategyTemplate(data.recommendedStrategyTemplate);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const finalPrompt = customPrompt.trim() || selectedPrompt;

  const handleLaunch = () => {
    if (!finalPrompt) { setError('Please enter or select a task prompt'); return; }
    let taskText = finalPrompt;
    if (strictQualityGate) {
      taskText += '\n\nQUALITY GATE (STRICT): A change is not complete until build passes, relevant tests pass, and high-severity diagnostics are addressed.';
    }
    if (analysisResult?.analysisReport) {
      taskText = `${taskText}\n\n--- IMPORT ANALYSIS ---\n${analysisResult.analysisReport.slice(0, 8000)}\n--- END IMPORT ANALYSIS ---`;
    }
    onLaunch({ workflowMode, strategyTemplate, taskPrompt: taskText, autoStart });
    onClose();
  };

  const canProceedFromMode = () => true;
  const canProceedFromTemplate = () =>
    workflowMode !== 'build_new' || templateId !== '';
  const canProceedFromDetails = () => true;
  const canProceedFromPrompt = () => !!finalPrompt;

  const steps: Step[] = ['mode', 'template', 'details', 'prompt', 'review'];
  const stepIndex = steps.indexOf(step);

  function goNext() {
    const next = steps[stepIndex + 1];
    if (next) setStep(next);
  }
  function goBack() {
    const prev = steps[stepIndex - 1];
    if (prev) setStep(prev);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-xl bg-ide-panel border border-ide-border rounded-xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-ide-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ide-text">The Project Factory</span>
            <span className="text-xs text-ide-text-dim">— What are you building?</span>
          </div>
          <button onClick={onClose} className="p-1 text-ide-text-dim hover:text-ide-text rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1 px-4 py-2 border-b border-ide-border/40">
          {steps.map((s, i) => (
            <div
              key={s}
              className={`flex-1 h-1 rounded-full transition-colors ${
                i < stepIndex ? 'bg-purple-500' : i === stepIndex ? 'bg-purple-400' : 'bg-ide-border'
              }`}
            />
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {error && (
            <div className="mb-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-300">
              {error}
            </div>
          )}

          {/* Step: Mode */}
          {step === 'mode' && (
            <div className="space-y-3">
              <div className="text-sm font-medium text-ide-text mb-2">What's your goal?</div>
              {(Object.keys(WORKFLOW_LABELS) as WorkflowMode[]).map(mode => {
                const info = WORKFLOW_LABELS[mode];
                return (
                  <button
                    key={mode}
                    onClick={() => setWorkflowMode(mode)}
                    className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-all text-left ${
                      workflowMode === mode
                        ? 'border-purple-500 bg-purple-500/10 text-ide-text'
                        : 'border-ide-border/60 hover:border-ide-border text-ide-text-dim hover:text-ide-text'
                    }`}
                  >
                    <span className="text-2xl">{info.emoji}</span>
                    <div>
                      <div className="text-sm font-medium">{info.label}</div>
                      <div className="text-xs text-ide-text-dim mt-0.5">{info.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Step: Template / Import */}
          {step === 'template' && (
            <div className="space-y-3">
              {workflowMode === 'build_new' ? (
                <>
                  <div className="text-sm font-medium text-ide-text mb-2">Pick a starter template</div>
                  {loadingTemplates ? (
                    <div className="flex items-center gap-2 text-xs text-ide-text-dim py-4">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading templates…
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {templates.map(t => (
                        <button
                          key={t.id}
                          onClick={() => setTemplateId(t.id)}
                          className={`p-3 rounded-lg border text-left transition-all ${
                            templateId === t.id
                              ? 'border-purple-500 bg-purple-500/10'
                              : 'border-ide-border/60 hover:border-ide-border'
                          }`}
                        >
                          <div className="text-xs font-medium text-ide-text">{t.name}</div>
                          <div className="text-[10px] text-ide-text-dim mt-0.5 line-clamp-2">{t.description}</div>
                          <div className="flex flex-wrap gap-0.5 mt-1">
                            {t.stack.slice(0, 3).map(s => (
                              <span key={s} className="text-[9px] px-1 py-0.5 rounded bg-ide-bg border border-ide-border/40 text-ide-text-dim">{s}</span>
                            ))}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="text-sm font-medium text-ide-text mb-2">Import existing codebase</div>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        value={importPath}
                        onChange={e => setImportPath(e.target.value)}
                        placeholder={`Folder to import (defaults to project root: ${activeProject?.rootPath || ''})`}
                        className="flex-1 bg-ide-bg border border-ide-border rounded px-3 py-2 text-xs focus:outline-none focus:border-ide-accent"
                      />
                    </div>
                    <button
                      onClick={handleAnalyzeImport}
                      disabled={analyzing || !activeProject}
                      className="w-full py-2 bg-blue-500/15 text-blue-300 border border-blue-500/30 rounded text-xs hover:bg-blue-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {analyzing
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing…</>
                        : <><Upload className="w-3.5 h-3.5" /> Analyze Codebase</>
                      }
                    </button>
                    {analysisResult && (
                      <div className="rounded-lg border border-ide-border/60 bg-ide-bg/40 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-ide-text">Analysis Complete</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                            analysisResult.healthScore >= 70 ? 'bg-green-500/20 text-green-300'
                            : analysisResult.healthScore >= 40 ? 'bg-yellow-500/20 text-yellow-300'
                            : 'bg-red-500/20 text-red-300'
                          }`}>
                            Health {analysisResult.healthScore}/100
                          </span>
                        </div>
                        <div className="text-[10px] text-ide-text-dim">
                          {analysisResult.fileCount} files · {analysisResult.techStack.join(', ') || 'no frameworks detected'}
                        </div>
                        {analysisResult.issues.length > 0 && (
                          <div className="space-y-0.5">
                            {analysisResult.issues.map((issue, i) => (
                              <div key={i} className="text-[10px] text-yellow-300">⚠ {issue}</div>
                            ))}
                          </div>
                        )}
                        <div className="text-[10px] text-ide-text-dim">
                          Recommended: <span className="text-purple-300">{analysisResult.recommendedWorkflowMode}</span>
                          {' · '}<span className="text-blue-300">{analysisResult.recommendedStrategyTemplate}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step: Project details */}
          {step === 'details' && (
            <div className="space-y-3">
              <div className="text-sm font-medium text-ide-text mb-2">Project details</div>
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] text-ide-text-dim block mb-1">Project name (optional)</label>
                  <input
                    value={projectName}
                    onChange={e => setProjectName(e.target.value)}
                    placeholder="My Awesome Project"
                    className="w-full bg-ide-bg border border-ide-border rounded px-3 py-2 text-xs focus:outline-none focus:border-ide-accent"
                  />
                </div>
                {workflowMode === 'build_new' && (
                  <div>
                    <label className="text-[10px] text-ide-text-dim block mb-1">Target folder path (optional)</label>
                    <div className="flex gap-2">
                      <input
                        value={projectPath}
                        onChange={e => setProjectPath(e.target.value)}
                        placeholder={activeProject?.rootPath || 'Leave empty to use project root'}
                        className="flex-1 bg-ide-bg border border-ide-border rounded px-3 py-2 text-xs focus:outline-none focus:border-ide-accent"
                      />
                    </div>
                  </div>
                )}
                {templateId && workflowMode === 'build_new' && (
                  <div>
                    <div className="mb-2 space-y-1.5 rounded border border-ide-border/40 bg-ide-bg/30 p-2">
                      <label className="flex items-center gap-2 text-[10px] text-ide-text-dim">
                        <input
                          type="checkbox"
                          checked={bootstrapAfterScaffold}
                          onChange={e => setBootstrapAfterScaffold(e.target.checked)}
                          className="accent-green-500"
                        />
                        Run bootstrap checks after writing files (install + build + test)
                      </label>
                      <label className="flex items-center gap-2 text-[10px] text-ide-text-dim">
                        <input
                          type="checkbox"
                          checked={autoStartPreview}
                          onChange={e => setAutoStartPreview(e.target.checked)}
                          className="accent-blue-500"
                        />
                        Auto-start preview server when bootstrap detects a dev command
                      </label>
                    </div>
                    <button
                      onClick={handleScaffold}
                      disabled={scaffolding || !activeProject}
                      className="w-full py-2 bg-green-500/15 text-green-300 border border-green-500/30 rounded text-xs hover:bg-green-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {scaffolding
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Scaffolding…</>
                        : <><FolderOpen className="w-3.5 h-3.5" /> Write Starter Files Now (optional)</>
                      }
                    </button>
                    {scaffoldResult && (
                      <div className="mt-2 text-[10px] text-green-300 bg-green-500/10 border border-green-500/20 rounded p-2">
                        ✓ {scaffoldResult.message}
                        <div className="text-ide-text-dim mt-1">{scaffoldResult.written.join(', ')}</div>
                        {scaffoldResult.bootstrap?.enabled && (
                          <div className="mt-2 rounded border border-ide-border/40 bg-ide-bg/40 p-2 space-y-1">
                            <div className="text-ide-text-dim">
                              Bootstrap stack: <span className="text-ide-text">{scaffoldResult.bootstrap.detectedStack || 'unknown'}</span>
                            </div>
                            {(scaffoldResult.bootstrap.results || []).map((r, i) => (
                              <div key={i} className={`rounded px-2 py-1 border ${r.success ? 'border-green-500/30 bg-green-500/10 text-green-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>
                                <div className="font-medium">{r.step.toUpperCase()} · {r.success ? 'PASS' : 'FAIL'}</div>
                                <div className="text-ide-text-dim">{r.command} (exit {r.exitCode}, {Math.round(r.durationMs / 1000)}s)</div>
                              </div>
                            ))}
                            {startingPreview && (
                              <div className="text-blue-300 flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" /> Starting preview server...
                              </div>
                            )}
                            {previewUrl && (
                              <a
                                href={previewUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-blue-300 hover:text-blue-200"
                              >
                                <ExternalLink className="w-3 h-3" /> Open Preview ({previewUrl})
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <label className="text-[10px] text-ide-text-dim block mb-1">Strategy template</label>
                  <select
                    value={strategyTemplate}
                    onChange={e => setStrategyTemplate(e.target.value)}
                    className="w-full bg-ide-bg border border-ide-border rounded px-3 py-2 text-xs focus:outline-none focus:border-ide-accent"
                  >
                    <option value="fullstack-balanced">Full-Stack Balanced (default)</option>
                    <option value="reasoning-first">Reasoning First (complex architecture)</option>
                    <option value="specialized-boost">Specialized Boost (ML / vision / SQL)</option>
                    <option value="local-only-247">Local-Only 24/7 (offline / private)</option>
                    <option value="cloud-burst-local-sustain">Cloud Burst + Local Sustain</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-xs text-ide-text-dim">
                  <input
                    type="checkbox"
                    checked={strictQualityGate}
                    onChange={e => setStrictQualityGate(e.target.checked)}
                    className="accent-purple-500"
                  />
                  Strict quality gate (build + tests must pass before each commit)
                </label>
              </div>
            </div>
          )}

          {/* Step: Prompt */}
          {step === 'prompt' && (
            <div className="space-y-3">
              <div className="text-sm font-medium text-ide-text mb-2">What should the loop build?</div>
              <div className="space-y-1">
                <div className="text-[10px] text-ide-text-dim mb-1">Quick picks:</div>
                {EXAMPLE_PROMPTS[workflowMode].map((p, i) => (
                  <button
                    key={i}
                    onClick={() => { setSelectedPrompt(p); setCustomPrompt(''); }}
                    className={`w-full text-left text-[11px] px-2 py-1.5 rounded border transition-all ${
                      selectedPrompt === p && !customPrompt
                        ? 'border-purple-500 bg-purple-500/10 text-ide-text'
                        : 'border-ide-border/40 hover:border-ide-border text-ide-text-dim hover:text-ide-text'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div>
                <div className="text-[10px] text-ide-text-dim mb-1">Or write your own:</div>
                <textarea
                  value={customPrompt}
                  onChange={e => { setCustomPrompt(e.target.value); setSelectedPrompt(''); }}
                  placeholder="Describe exactly what you want The Project Factory to build, fix, or analyze…"
                  rows={5}
                  className="w-full bg-ide-bg border border-ide-border rounded px-3 py-2 text-xs resize-none focus:outline-none focus:border-ide-accent"
                />
              </div>
            </div>
          )}

          {/* Step: Review & Launch */}
          {step === 'review' && (
            <div className="space-y-3">
              <div className="text-sm font-medium text-ide-text mb-2">Ready to launch</div>
              <div className="rounded-lg border border-ide-border/60 bg-ide-bg/40 divide-y divide-ide-border/40 text-xs">
                <div className="px-3 py-2 flex justify-between">
                  <span className="text-ide-text-dim">Mode</span>
                  <span className="text-ide-text font-medium">{WORKFLOW_LABELS[workflowMode].emoji} {WORKFLOW_LABELS[workflowMode].label}</span>
                </div>
                <div className="px-3 py-2 flex justify-between">
                  <span className="text-ide-text-dim">Strategy</span>
                  <span className="text-ide-text font-medium">{strategyTemplate}</span>
                </div>
                <div className="px-3 py-2 flex justify-between">
                  <span className="text-ide-text-dim">Quality gate</span>
                  <span className={strictQualityGate ? 'text-green-300' : 'text-ide-text-dim'}>
                    {strictQualityGate ? 'Strict' : 'Relaxed'}
                  </span>
                </div>
                <div className="px-3 py-2">
                  <div className="text-ide-text-dim mb-1">Task prompt</div>
                  <div className="text-ide-text text-[10px] line-clamp-4 leading-relaxed">{finalPrompt}</div>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-ide-text-dim">
                <input
                  type="checkbox"
                  checked={autoStart}
                  onChange={e => setAutoStart(e.target.checked)}
                  className="accent-purple-500"
                />
                Auto-start The Project Factory loop immediately
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-ide-border">
          <button
            onClick={goBack}
            disabled={stepIndex === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-ide-text-dim hover:text-ide-text disabled:opacity-30"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Back
          </button>

          {step !== 'review' ? (
            <button
              onClick={goNext}
              disabled={
                (step === 'mode' && !canProceedFromMode()) ||
                (step === 'template' && !canProceedFromTemplate()) ||
                (step === 'details' && !canProceedFromDetails()) ||
                (step === 'prompt' && !canProceedFromPrompt())
              }
              className="flex items-center gap-1.5 px-4 py-1.5 bg-purple-500 text-white text-xs rounded-lg hover:bg-purple-600 disabled:opacity-40"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={handleLaunch}
              disabled={!finalPrompt}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-500 text-white text-xs rounded-lg hover:bg-green-600 disabled:opacity-40 font-semibold"
            >
              <Play className="w-3.5 h-3.5" />
              {autoStart ? 'Launch Project Factory' : 'Apply Settings'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
