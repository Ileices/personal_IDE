// ============================================
// Agent Controls - Start/stop/pause + event log
// Enhanced v4: fleet mode with multi-agent,
// verbosity modes, expandable entries,
// copy feed, message queue during runs
// ============================================
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getPreset } from '@personal-ide/shared';
import { useAgentStore, type VerbosityLevel } from '../stores/agentStore';
import { useFleetStore, type FleetAgentInfo } from '../stores/fleetStore';
import { useProjectStore } from '../stores/projectStore';
import { useChatStore } from '../stores/chatStore';
import { useModelStore } from '../stores/modelStore';
import { API_BASE } from '../config.js';
import {
  Play, Square, Pause, SkipForward, Settings, Clock,
  AlertCircle, CheckCircle, Loader2, MessageSquare, Bot,
  Infinity, Zap, Puzzle, Timer, ShieldOff, Copy, Check,
  ChevronDown, ChevronRight, Send, Eye, EyeOff, Filter,
  Users, UserPlus, Cpu, ArrowRightLeft, History, X, Trash2,
} from 'lucide-react';
import { AgentSettings } from './agent/AgentSettings';
import { AgentEventFeed } from './agent/AgentEventFeed';
import { MegaPromptsPanel } from './agent/MegaPromptsPanel';
import { MilestonePanel } from './projectFactory/MilestonePanel';
import { QualityTrend } from './projectFactory/QualityTrend';
import { ProjectFactoryWizard, type WorkflowMode } from './projectFactory/ProjectFactoryWizard';

// Prompt history persistence
const AGENT_HIST_KEY = 'agent_loop_prompt_history';
interface AgentHistoryItem { id: string; prompt: string; usedAt: string; timesUsed: number; }
const loadAgentHistory  = (): AgentHistoryItem[] => { try { return JSON.parse(localStorage.getItem(AGENT_HIST_KEY) || '[]'); } catch { return []; } };
const saveAgentHistory  = (v: AgentHistoryItem[]) => { try { localStorage.setItem(AGENT_HIST_KEY, JSON.stringify(v.slice(0, 200))); } catch {} };

type UnifiedModelLike = {
  id: string;
  name?: string;
  provider?: string;
  description?: string;
  contextWindow?: number;
  supportsVision?: boolean;
  isFree?: boolean;
};

type StrategyTemplate = {
  id: string;
  name: string;
  description: string;
  categories: string[];
};

const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    id: 'fullstack-balanced',
    name: 'Full-Stack Balanced',
    description: 'Best default for app/game/web build loops using coding + reasoning + long context.',
    categories: ['coding', 'reasoning', 'general', 'long_context'],
  },
  {
    id: 'reasoning-first',
    name: 'Reasoning First',
    description: 'Use planning-heavy stacks for architecture, decomposition, and hard debugging.',
    categories: ['reasoning', 'general'],
  },
  {
    id: 'specialized-boost',
    name: 'Specialized Boost',
    description: 'Inject specialized models (sql/medical/embedding/vision) into fallback chain automatically.',
    categories: ['specialized', 'embedding', 'vision', 'coding', 'general'],
  },
  {
    id: 'local-only-247',
    name: 'Local-Only 24/7',
    description: 'Run continuously on local providers first (Ollama/Nano/LMStudio).',
    categories: ['local_only', 'coding', 'reasoning', 'general'],
  },
  {
    id: 'cloud-burst-local-sustain',
    name: 'Cloud Burst + Local Sustain',
    description: 'Start with strongest cloud model, then sustain with local fallback chain for long runs.',
    categories: ['cloud_first', 'coding', 'reasoning', 'general'],
  },
];

function inferModelTags(model: UnifiedModelLike): string[] {
  const raw = `${model.id} ${model.name || ''} ${model.description || ''}`.toLowerCase();
  const tags = new Set<string>();

  if (/coder|code|codellama|starcoder|codegemma|program/.test(raw)) tags.add('coding');
  if (/reason|r1|qwq|think|logic|math/.test(raw)) tags.add('reasoning');
  if (/vision|llava|moondream|image|multimodal/.test(raw) || model.supportsVision) tags.add('vision');
  if (/embed|embedding|mxbai|nomic/.test(raw)) tags.add('embedding');
  if (/sql|medical|med|special/.test(raw)) tags.add('specialized');
  if (/128k|200k|long[-_ ]?context|yarn/.test(raw)) tags.add('long_context');
  if (/uncensored|dolphin|hermes|mythomax/.test(raw)) tags.add('uncensored');
  if (tags.size === 0) tags.add('general');

  const provider = (model.provider || '').toLowerCase();
  if (provider === 'ollama' || provider === 'nano' || provider === 'lmstudio') {
    tags.add('local');
  } else {
    tags.add('cloud');
  }

  return [...tags];
}

export function AgentControls() {
  const {
    isRunning, state, currentIteration, maxIterations, events, questions,
    stepDelayMs, autoApprove, autoAnswer,
    continuousMode, cooldownMs, bypassRateLimits, enableSmartChunking,
    chunkingActive, chunkingProgress,
    verbosity, queuedMessageCount,
    timingData: storeTimingData, datasetStats: storeDatasetStats,
    currentModel, modelSwitchHistory,
    startAgent, stopAgent, pauseAgent, resumeAgent,
    setStepDelay, setAutoApprove, setAutoAnswer, setMaxIterations, clearEvents,
    setContinuousMode, setCooldownMs, setBypassRateLimits, setEnableSmartChunking,
    setVerbosity, sendQueuedMessage, toggleEventExpanded, copyEventsToClipboard,
  } = useAgentStore();
  const latestQualityEvent = useAgentStore(s => s.latestQualityEvent);
  const { activeProject } = useProjectStore();
  const { selectedModel, setModel } = useChatStore();
  const { allModels } = useModelStore();
  const [task, setTask] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [promptHistory, setPromptHistory] = useState<AgentHistoryItem[]>(loadAgentHistory);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<string>>(new Set());
  const [megaPromptModelSource, setMegaPromptModelSource] = useState<'auto' | 'cloud' | 'local'>('auto');
  const [histSearch, setHistSearch] = useState('');
  const [queueInput, setQueueInput] = useState('');
  const [queuePriority, setQueuePriority] = useState<'normal' | 'high'>('normal');
  const [copiedFeed, setCopiedFeed] = useState(false);
  const [fleetMode, setFleetMode] = useState(false);
  const [fleetMessage, setFleetMessage] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState('all-models-balanced');
  const [strategyPrimaryModel, setStrategyPrimaryModel] = useState(selectedModel || 'openai/gpt-4.1');
  const [strategyFallbackModels, setStrategyFallbackModels] = useState<string[]>([]);
  const [failedModelCount, setFailedModelCount] = useState(0);
  const [cleanupFailedModelsBusy, setCleanupFailedModelsBusy] = useState(false);
  const [analyzeCodebase, setAnalyzeCodebase] = useState(true);
  const [availableModels, setAvailableModels] = useState<UnifiedModelLike[]>([]);
  const [templateBusy, setTemplateBusy] = useState<string | null>(null);
  const [useCorpusManifesto, setUseCorpusManifesto] = useState(true);
  const [autoIngestCorpus, setAutoIngestCorpus] = useState(true);
  const [autoProjectIntel, setAutoProjectIntel] = useState(true);
  const [corpusPath, setCorpusPath] = useState('');
  const [corpusStats, setCorpusStats] = useState<{ file_count?: number; total_tokens?: number; updated_at?: string } | null>(null);
  const [manifestoPreview, setManifestoPreview] = useState('');
  const [corpusBusy, setCorpusBusy] = useState<string | null>(null);
  const [projectIntel, setProjectIntel] = useState<{
    runs?: { total?: number; complete?: number; error?: number; runningLike?: number };
    suggestedJobs?: { suggested?: number; implementing?: number; implemented?: number };
    blame?: { failures24h?: number; successes24h?: number };
  } | null>(null);
  const [intelBusy, setIntelBusy] = useState(false);
  const [timingData, setTimingData] = useState<{
    lastCallMs: number; avgCallMs: number; totalCalls: number; tokPerSec: number; activeMs: number;
  } | null>(null);
  const [datasetStats, setDatasetStats] = useState<{
    total: number; success: number; failures: number; avgQuality: number;
  } | null>(null);
  const [runtimeTelemetry, setRuntimeTelemetry] = useState<{
    selectedModel?: string;
    rateLimiter?: {
      selectedModel?: {
        usage?: {
          serverRemaining?: number | null;
          serverLimit?: number | null;
          backoffMs?: number;
          consecutiveFailures?: number;
        };
      } | null;
      deadModels?: { count?: number };
    };
    quality?: {
      stats?: {
        buildPassRate?: number;
        testPassRate?: number;
        avgErrors?: number;
        recentFailures?: number;
      };
      recommendedCooldownMs?: number;
    } | null;
  } | null>(null);

  // Project Factory: workflow mode, quality gate, wizard
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>('build_new');
  const [strictQualityGate, setStrictQualityGate] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  const filteredHistory = useMemo(() => (
    promptHistory.filter(h => !histSearch || h.prompt.toLowerCase().includes(histSearch.toLowerCase()))
  ), [promptHistory, histSearch]);

  const estimateTokens = useCallback((text: string) => {
    return Math.max(1, Math.round(text.length / 3.5));
  }, []);

  const resolveSelectedModelContextWindow = useCallback(() => {
    const byUnifiedModel = allModels.find(m => m.id === selectedModel)?.maxInputTokens;
    if (byUnifiedModel && Number.isFinite(byUnifiedModel) && byUnifiedModel > 0) return byUnifiedModel;
    const byProviderModel = availableModels.find(m => m.id === selectedModel)?.contextWindow;
    if (byProviderModel && Number.isFinite(byProviderModel) && byProviderModel > 0) return byProviderModel;
    return 128000;
  }, [allModels, availableModels, selectedModel]);

  const generateMegaPromptFromHistory = useCallback(() => {
    const selected = promptHistory.filter(h => selectedHistoryIds.has(h.id));
    const baseItems = selected.length > 0 ? selected : promptHistory.slice(0, 30);
    if (baseItems.length === 0) return;

    const ctxWindow = resolveSelectedModelContextWindow();
    const maxPromptBudget = Math.max(2000, Math.floor(ctxWindow * 0.35));
    const header = [
      'Create a comprehensive implementation plan and execution strategy using the task history below.',
      `Preferred model source: ${megaPromptModelSource}.`,
      `Current model context window: ${ctxWindow.toLocaleString()} tokens; history budget target (35%): ${maxPromptBudget.toLocaleString()} tokens.`,
      'Prioritize unresolved items, deduplicate overlapping requests, and preserve chronology where it affects implementation order.',
    ].join('\n');

    const renderedItems = baseItems.map((item, idx) => {
      const stamp = new Date(item.usedAt).toLocaleString();
      return `(${idx + 1}) [used ${stamp}, x${item.timesUsed}] ${item.prompt}`;
    });

    const totalHistoryTokens = estimateTokens(renderedItems.join('\n'));
    if (totalHistoryTokens <= maxPromptBudget) {
      const compact = `${header}\n\nTask History:\n- ${renderedItems.join('\n- ')}`;
      setTask(compact);
      setShowHistory(false);
      return;
    }

    const chunkBudget = Math.max(800, maxPromptBudget - 400);
    const chunks: string[][] = [];
    let currentChunk: string[] = [];
    let currentTokens = 0;
    for (const line of renderedItems) {
      const lineTokens = estimateTokens(line) + 4;
      if (currentChunk.length > 0 && currentTokens + lineTokens > chunkBudget) {
        chunks.push(currentChunk);
        currentChunk = [line];
        currentTokens = lineTokens;
      } else {
        currentChunk.push(line);
        currentTokens += lineTokens;
      }
    }
    if (currentChunk.length > 0) chunks.push(currentChunk);

    const chunked = [
      header,
      '',
      `History was chunked into ${chunks.length} sections to stay within the 35% context budget.`,
      'Process chunks in order. Build a single coherent plan that references cross-chunk dependencies explicitly.',
      '',
      ...chunks.map((chunk, idx) => `### History Chunk ${idx + 1}\n- ${chunk.join('\n- ')}`),
    ].join('\n');

    setTask(chunked);
    setShowHistory(false);
  }, [
    promptHistory,
    selectedHistoryIds,
    resolveSelectedModelContextWindow,
    megaPromptModelSource,
    estimateTokens,
  ]);

  // Sync timing/dataset from store events
  useEffect(() => {
    if (storeTimingData) setTimingData(storeTimingData);
  }, [storeTimingData]);
  useEffect(() => {
    if (storeDatasetStats) setDatasetStats(storeDatasetStats);
  }, [storeDatasetStats]);

  // Fleet store
  const {
    isFleetRunning, fleetState, agents: fleetAgents, events: fleetEvents,
    totalIterations, totalFilesChanged, totalTokensUsed,
    maxAgents, selectedAgentCount, capacity,
    executionMode, setExecutionMode,
    localModelPool, setLocalModelPool,
    cloudModelPool, setCloudModelPool,
    roleModelOverrides, setRoleModelOverride,
    startFleet, stopFleet, pauseFleet, resumeFleet,
    sendFleetMessage: sendFleetMsg,
    pauseAgent: pauseFleetAgent, resumeAgent: resumeFleetAgent, stopAgent: stopFleetAgent,
    fetchMaxAgents, setSelectedAgentCount, clearFleetEvents,
    connectFleetEvents, disconnectFleetEvents,
  } = useFleetStore();

  const persistStrategy = useCallback(async (payload: { presetId?: string; primaryModel?: string; fallbackModels?: string[] }) => {
    try {
      const res = await fetch(`${API_BASE}/api/model-strategy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!data?.settings) return;
      setSelectedPresetId(data.settings.presetId || 'all-models-balanced');
      setStrategyPrimaryModel(data.settings.primaryModel || selectedModel);
      setStrategyFallbackModels(data.settings.fallbackModels || []);
      setFailedModelCount((data.failedModels || []).length);
    } catch {}
  }, [selectedModel]);

  const refreshStrategy = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/model-strategy`);
      const data = await res.json().catch(() => null);
      if (!data?.settings) return null;
      setSelectedPresetId(data.settings.presetId || 'all-models-balanced');
      setStrategyPrimaryModel(data.settings.primaryModel || selectedModel);
      setStrategyFallbackModels(data.settings.fallbackModels || []);
      setFailedModelCount((data.failedModels || []).length);
      if (data.settings.primaryModel) setModel(data.settings.primaryModel);
      return data;
    } catch {
      return null;
    }
  }, [selectedModel, setModel]);

  useEffect(() => {
    void refreshStrategy();
    const timer = window.setInterval(() => {
      void refreshStrategy();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [refreshStrategy]);

  const refreshCorpus = useCallback(async () => {
    if (!activeProject?.id) {
      setCorpusStats(null);
      setManifestoPreview('');
      return;
    }
    try {
      const statsRes = await fetch(`${API_BASE}/api/corpus/stats?projectId=${encodeURIComponent(activeProject.id)}`);
      const statsData = await statsRes.json().catch(() => null);
      setCorpusStats(statsData?.corpus || null);
    } catch {
      setCorpusStats(null);
    }
    try {
      const manRes = await fetch(`${API_BASE}/api/corpus/manifesto?projectId=${encodeURIComponent(activeProject.id)}`);
      const manData = await manRes.json().catch(() => null);
      setManifestoPreview((manData?.manifesto || '').slice(0, 800));
    } catch {
      setManifestoPreview('');
    }
  }, [activeProject?.id]);

  const refreshProjectIntel = useCallback(async () => {
    if (!activeProject?.id) {
      setProjectIntel(null);
      return;
    }
    setIntelBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/agent/project-intel/${encodeURIComponent(activeProject.id)}`);
      const data = await res.json().catch(() => null);
      if (!data) return;
      setProjectIntel({
        runs: data.runs,
        suggestedJobs: data.suggestedJobs,
        blame: data.blame,
      });
    } finally {
      setIntelBusy(false);
    }
  }, [activeProject?.id]);

  const refreshRuntimeTelemetry = useCallback(async () => {
    if (!activeProject?.id) {
      setRuntimeTelemetry(null);
      return;
    }
    try {
      const params = new URLSearchParams({ projectId: activeProject.id });
      if (currentModel) params.set('model', currentModel);
      const res = await fetch(`${API_BASE}/api/agent/telemetry?${params.toString()}`);
      const data = await res.json().catch(() => null);
      if (!data) return;
      setRuntimeTelemetry(data);
    } catch {
      // best-effort polling
    }
  }, [activeProject?.id, currentModel]);

  useEffect(() => {
    void refreshCorpus();
  }, [refreshCorpus]);

  useEffect(() => {
    void refreshProjectIntel();
  }, [refreshProjectIntel]);

  useEffect(() => {
    void refreshRuntimeTelemetry();
    const intervalMs = isRunning || isFleetRunning ? 4000 : 12000;
    const id = window.setInterval(() => {
      void refreshRuntimeTelemetry();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [refreshRuntimeTelemetry, isRunning, isFleetRunning]);

  useEffect(() => {
    const loadSettings = async () => {
      if (!activeProject?.id) return;
      try {
        const res = await fetch(`${API_BASE}/api/agent/project-settings/${encodeURIComponent(activeProject.id)}`);
        const data = await res.json().catch(() => null);
        if (!data?.settings) return;
        setUseCorpusManifesto(!!data.settings.useCorpusManifesto);
        setAutoIngestCorpus(!!data.settings.autoIngestCorpus);
        setAutoProjectIntel(!!data.settings.autoProjectIntel);
        setCorpusPath(String(data.settings.corpusPath || ''));
      } catch {
        // no-op
      }
    };
    void loadSettings();
  }, [activeProject?.id]);

  useEffect(() => {
    if (!activeProject?.id) return;
    const timer = window.setTimeout(() => {
      void fetch(`${API_BASE}/api/agent/project-settings/${encodeURIComponent(activeProject.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          useCorpusManifesto,
          autoIngestCorpus,
          autoProjectIntel,
          corpusPath,
        }),
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [activeProject?.id, useCorpusManifesto, autoIngestCorpus, autoProjectIntel, corpusPath]);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/providers/all-models`);
        const data = await res.json().catch(() => null);
        if (data?.models?.length) {
          setAvailableModels(data.models);
        }
      } catch {
        setAvailableModels([]);
      }
    };
    void loadModels();
  }, []);

  const capabilityCounts = useMemo(() => {
    const counts: Record<string, number> = {
      coding: 0,
      reasoning: 0,
      vision: 0,
      embedding: 0,
      specialized: 0,
      local: 0,
      cloud: 0,
    };
    for (const model of availableModels) {
      const tags = inferModelTags(model);
      tags.forEach((tag) => {
        if (counts[tag] !== undefined) counts[tag] += 1;
      });
    }
    return counts;
  }, [availableModels]);

  const handlePresetChange = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = getPreset(presetId);
    if (!preset) return;
    const fallbackModels = preset.fallbackChain.filter(model => model !== preset.primaryModel);
    setStrategyPrimaryModel(preset.primaryModel);
    setStrategyFallbackModels(fallbackModels);
    setModel(preset.primaryModel);
    void persistStrategy({ presetId, primaryModel: preset.primaryModel, fallbackModels });
  };

  const applyStrategyTemplate = async (templateId: string) => {
    setTemplateBusy(templateId);
    try {
      const template = STRATEGY_TEMPLATES.find(t => t.id === templateId);
      if (!template || availableModels.length === 0) return;

      const scored = availableModels
        .map((m) => {
          const tags = inferModelTags(m);
          let score = 0;

          for (const tag of template.categories) {
            if (tag === 'local_only') {
              if (tags.includes('local')) score += 4;
              if (tags.includes('cloud')) score -= 3;
              continue;
            }
            if (tag === 'cloud_first') {
              if (tags.includes('cloud')) score += 4;
              if (tags.includes('local')) score += 1;
              continue;
            }
            if (tags.includes(tag)) score += 3;
          }

          if ((m.provider || '').toLowerCase() === 'github' || (m.provider || '').toLowerCase() === 'openai') score += 1;
          if ((m.id || '').includes('gpt-5') || (m.id || '').includes('o3') || (m.id || '').includes('r1')) score += 1;
          return { model: m.id, score };
        })
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score);

      const selected = scored.slice(0, 12).map(s => s.model);
      if (selected.length === 0) return;

      const primaryModel = selected[0];
      const fallbackModels = selected.slice(1);
      setStrategyPrimaryModel(primaryModel);
      setStrategyFallbackModels(fallbackModels);
      setModel(primaryModel);
      await persistStrategy({
        presetId: 'all-models-balanced',
        primaryModel,
        fallbackModels,
      });
    } finally {
      setTemplateBusy(null);
    }
  };

  const ingestCorpus = async () => {
    if (!activeProject?.id) return;
    setCorpusBusy('ingest');
    try {
      await fetch(`${API_BASE}/api/corpus/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject.id,
          folderPath: corpusPath.trim() || undefined,
          maxFilesPerDir: 120,
        }),
      });
      await refreshCorpus();
    } finally {
      setCorpusBusy(null);
    }
  };

  const generateManifesto = async (): Promise<string> => {
    if (!activeProject?.id) return '';
    setCorpusBusy('manifesto');
    try {
      await fetch(`${API_BASE}/api/corpus/manifesto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject.id }),
      });
      const res = await fetch(`${API_BASE}/api/corpus/manifesto?projectId=${encodeURIComponent(activeProject.id)}`);
      const data = await res.json().catch(() => null);
      const manifesto = data?.manifesto || '';
      setManifestoPreview(manifesto.slice(0, 800));
      await refreshCorpus();
      return manifesto;
    } finally {
      setCorpusBusy(null);
    }
  };

  const runProjectIntelPreflight = async () => {
    await Promise.allSettled([
      fetch(`${API_BASE}/api/silicon-factory/reindex-tests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: activeProject?.id }),
      }),
      fetch(`${API_BASE}/api/silicon-factory/reindex-embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: activeProject?.id }),
      }),
    ]);
  };

  // Fetch max agents on mount
  useEffect(() => { fetchMaxAgents(); }, []);

  // Connect fleet SSE when fleet is running
  useEffect(() => {
    if (isFleetRunning) {
      connectFleetEvents();
      return () => disconnectFleetEvents();
    }
  }, [isFleetRunning]);


  const handleStart = async () => {
    if (!task.trim() || !activeProject) return;
    const trimmed = task.trim();
    let runTask = trimmed;

    // Append workflow mode directive
    if (workflowMode === 'import_refactor') {
      runTask += '\n\nWORKFLOW MODE: IMPORT_REFACTOR_AND_EXPAND\nTreat this as an imported codebase migration/refactor. First map architecture, run diagnostics/tests, then fix, harden, and expand features without regressing behavior.';
    } else if (workflowMode === 'code_review') {
      runTask += '\n\nWORKFLOW MODE: CODE_REVIEW\nPrioritize bug/risk/regression discovery, then apply fixes with tests. Produce strict review findings before implementation.';
    } else if (workflowMode === 'scale_research') {
      runTask += '\n\nWORKFLOW MODE: SCALE_RESEARCH\nPrioritize architecture scalability, distributed execution, observability, and reproducible experiment pipelines.';
    }
    if (strictQualityGate) {
      runTask += '\n\nQUALITY GATE (STRICT): A change is not complete until build passes, relevant tests pass, and high-severity diagnostics are addressed. Avoid speculative/sloppy code.';
    }

    // For fleet mode we still pre-compose corpus context client-side (fleet route parity).
    if (fleetMode) {
      if (useCorpusManifesto) {
        if (autoIngestCorpus) {
          await ingestCorpus();
        }
        let manifesto = manifestoPreview;
        if (!manifesto.trim()) {
          manifesto = await generateManifesto();
        }
        if (manifesto.trim()) {
          runTask = `${trimmed}\n\n--- PROJECT CORPUS MANIFESTO ---\n${manifesto}\n--- END PROJECT CORPUS MANIFESTO ---\n\nUse this manifesto as the source-of-truth planning corpus. Generate a full roadmap with build/test/run steps and keep iterating 24/7.`;
        }
      }
      if (autoProjectIntel) {
        await runProjectIntelPreflight();
      }
    }

    const latest = await refreshStrategy();
    const latestSettings = latest?.settings;
    const preset = getPreset(latestSettings?.presetId || selectedPresetId);
    const runModel = latestSettings?.primaryModel || strategyPrimaryModel || preset?.primaryModel || selectedModel;
    const fallbackModels = (latestSettings?.fallbackModels?.length ? latestSettings.fallbackModels : strategyFallbackModels).length > 0
      ? (latestSettings?.fallbackModels?.length ? latestSettings.fallbackModels : strategyFallbackModels)
      : (preset?.fallbackChain || []).filter(model => model !== runModel);
    // Save to prompt history
    setPromptHistory(prev => {
      const existing = prev.find(h => h.prompt === trimmed);
      const updated = existing
        ? prev.map(h => h.prompt === trimmed ? { ...h, timesUsed: h.timesUsed + 1, usedAt: new Date().toISOString() } : h)
        : [{ id: Date.now().toString(), prompt: trimmed, usedAt: new Date().toISOString(), timesUsed: 1 }, ...prev];
      saveAgentHistory(updated);
      return updated;
    });
    if (fleetMode) {
      startFleet(activeProject.id, runTask, runModel, {
        continuousMode,
        cooldownMs,
        bypassRateLimits,
        enableSmartChunking,
        analyzeCodebase,
        maxIterationsPerAgent: maxIterations,
        fallbackModels,
        useCorpusManifesto,
        autoProjectIntel,
        autoIngestCorpus,
      });
      setTask('');
    } else {
      startAgent(activeProject.id, runTask, runModel, {
        fallbackModels,
        analyzeCodebase,
        useCorpusManifesto,
        autoProjectIntel,
      });
      setTask('');
    }
  };

  // Wizard → applies settings + optionally starts the loop
  const handleWizardLaunch = useCallback(async (result: { workflowMode: WorkflowMode; strategyTemplate: string; taskPrompt: string; autoStart: boolean }) => {
    setWorkflowMode(result.workflowMode);
    setTask(result.taskPrompt);
    // Apply strategy template if one was selected
    if (result.strategyTemplate) {
      void applyStrategyTemplate(result.strategyTemplate);
    }
    if (result.autoStart && activeProject) {
      // Brief delay so strategy applies first
      setTimeout(() => {
        if (!task && result.taskPrompt) {
          // Task state might not have updated yet — call startAgent directly
          startAgent(activeProject.id, result.taskPrompt, strategyPrimaryModel || 'openai/gpt-4.1', {
            analyzeCodebase,
            useCorpusManifesto,
            autoProjectIntel,
          });
        }
      }, 200);
    }
  }, [activeProject, applyStrategyTemplate, strategyPrimaryModel, analyzeCodebase, useCorpusManifesto, autoProjectIntel, startAgent, task]);

  const handleCleanupFailedModels = async () => {
    setCleanupFailedModelsBusy(true);
    try {
      await fetch(`${API_BASE}/api/model-strategy/cleanup-failed`, { method: 'POST' });
      await refreshStrategy();
    } finally {
      setCleanupFailedModelsBusy(false);
    }
  };

  const handleFleetMessage = () => {
    if (!fleetMessage.trim()) return;
    sendFleetMsg(fleetMessage.trim());
    setFleetMessage('');
  };

  const handleQueueMessage = () => {
    if (!queueInput.trim()) return;
    sendQueuedMessage(queueInput.trim(), queuePriority);
    setQueueInput('');
  };

  const handleCopyFeed = () => {
    copyEventsToClipboard();
    setCopiedFeed(true);
    setTimeout(() => setCopiedFeed(false), 20000);
  };

  const stateIcons: Record<string, React.ReactNode> = {
    idle: <div className="w-2 h-2 rounded-full bg-ide-text-dim" />,
    planning: <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />,
    executing: <Loader2 className="w-3 h-3 text-green-400 animate-spin" />,
    evaluating: <Loader2 className="w-3 h-3 text-yellow-400 animate-spin" />,
    paused: <Pause className="w-3 h-3 text-yellow-400" />,
    complete: <CheckCircle className="w-3 h-3 text-ide-success" />,
    error: <AlertCircle className="w-3 h-3 text-ide-error" />,
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-ide-sidebar border-t border-ide-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-ide-border">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-medium">{fleetMode ? 'Project Factory Fleet' : 'The Project Factory'}</span>
          <div className="flex items-center gap-1 text-[10px] text-ide-text-dim">
            {fleetMode ? (
              <>
                <Users className="w-3 h-3 text-cyan-400" />
                <span className="capitalize">{isFleetRunning ? fleetState : 'idle'}</span>
              </>
            ) : (
              <>
                {stateIcons[state] || stateIcons.idle}
                <span className="capitalize">{state}</span>
              </>
            )}
          </div>
          {fleetMode && isFleetRunning && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-medium">
              {fleetAgents.length} agents
            </span>
          )}
          {continuousMode && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-medium">
              24/7
            </span>
          )}
          {currentModel && isRunning && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-300 font-medium truncate max-w-24" title={currentModel}>
              {currentModel.split('/')[1] || currentModel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isRunning && (
            <span className="text-[10px] text-ide-text-dim">
              {continuousMode ? `∞ (${currentIteration})` : `${currentIteration}/${maxIterations}`}
            </span>
          )}
          <button
            onClick={() => { setShowHistory(!showHistory); setShowSettings(false); }}
            className={`p-1 rounded transition-colors ${showHistory ? 'text-purple-400' : 'text-ide-text-dim hover:text-ide-text'}`}
            title="Prompt history"
          >
            <History className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => { setShowSettings(!showSettings); setShowHistory(false); }}
            className="p-1 text-ide-text-dim hover:text-ide-text rounded"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Chunking Status Banner */}
      {chunkingActive && chunkingProgress && (
        <div className="px-3 py-1.5 bg-blue-500/10 border-b border-blue-500/20 flex items-center gap-2">
          <Puzzle className="w-3 h-3 text-blue-400 animate-pulse" />
          <span className="text-[10px] text-blue-300">
            Chunking: {chunkingProgress.current}/{chunkingProgress.total} chunks
          </span>
          <div className="flex-1 h-1 bg-ide-bg rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-400 rounded-full transition-all"
              style={{ width: `${(chunkingProgress.current / Math.max(chunkingProgress.total, 1)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Settings */}
      {showSettings && (
        <AgentSettings
          fleetMode={fleetMode}
          setFleetMode={setFleetMode}
          selectedAgentCount={selectedAgentCount}
          setSelectedAgentCount={setSelectedAgentCount}
          maxAgents={maxAgents}
          capacity={capacity}
          executionMode={executionMode}
          setExecutionMode={setExecutionMode}
          localModelPool={localModelPool}
          setLocalModelPool={setLocalModelPool}
          cloudModelPool={cloudModelPool}
          setCloudModelPool={setCloudModelPool}
          roleModelOverrides={roleModelOverrides}
          setRoleModelOverride={setRoleModelOverride}
          continuousMode={continuousMode}
          setContinuousMode={setContinuousMode}
          bypassRateLimits={bypassRateLimits}
          setBypassRateLimits={setBypassRateLimits}
          enableSmartChunking={enableSmartChunking}
          setEnableSmartChunking={setEnableSmartChunking}
          analyzeCodebase={analyzeCodebase}
          setAnalyzeCodebase={setAnalyzeCodebase}
          cooldownMs={cooldownMs}
          setCooldownMs={setCooldownMs}
          maxIterations={maxIterations}
          setMaxIterations={setMaxIterations}
          stepDelayMs={stepDelayMs}
          setStepDelay={setStepDelay}
          autoApprove={autoApprove}
          setAutoApprove={setAutoApprove}
          autoAnswer={autoAnswer}
          setAutoAnswer={setAutoAnswer}
          selectedPresetId={selectedPresetId}
          onPresetChange={handlePresetChange}
          failedModelCount={failedModelCount}
          onCleanupFailedModels={handleCleanupFailedModels}
          cleanupFailedModelsBusy={cleanupFailedModelsBusy}
          timingData={timingData}
          datasetStats={datasetStats}
          isRunning={isRunning}
          isFleetRunning={isFleetRunning}
        />
      )}
      {/* Prompt History Drawer */}
      {showHistory && (
        <div className="border-b border-ide-border bg-ide-bg/50 flex flex-col max-h-60 overflow-hidden flex-shrink-0">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-ide-border/50">
            <span className="text-[10px] font-semibold text-ide-text">Prompt History</span>
            <button onClick={() => setShowHistory(false)}><X className="w-3 h-3 text-ide-text-dim hover:text-ide-text" /></button>
          </div>
          <div className="px-2 py-1">
            <input value={histSearch} onChange={e => setHistSearch(e.target.value)} placeholder="Search history…"
              className="w-full bg-ide-bg border border-ide-border rounded px-2 py-0.5 text-[11px] focus:outline-none focus:border-ide-accent" />
          </div>
          <div className="overflow-y-auto flex-1">
            {filteredHistory.length === 0 && (
              <div className="px-3 py-3 text-[10px] text-ide-text-dim text-center">No history yet — start the agent to record prompts</div>
            )}
            {filteredHistory
              .map(h => (
              <div key={h.id} className="flex items-start gap-1.5 px-2 py-1.5 border-b border-ide-border/30 group hover:bg-ide-bg/30">
                <input
                  type="checkbox"
                  checked={selectedHistoryIds.has(h.id)}
                  onChange={(e) => {
                    setSelectedHistoryIds(prev => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(h.id);
                      else next.delete(h.id);
                      return next;
                    });
                  }}
                  className="mt-1 h-3 w-3 rounded border-ide-border bg-ide-bg"
                  title="Select for mega-prompt"
                />
                <div className="flex-1 min-w-0">
                  <button onClick={() => { setTask(h.prompt); setShowHistory(false); }}
                    className="w-full text-left text-[11px] text-ide-text line-clamp-2">{h.prompt}</button>
                  <span className="text-[9px] text-ide-text-dim">×{h.timesUsed} · {new Date(h.usedAt).toLocaleDateString()}</span>
                </div>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 flex-shrink-0">
                  <button onClick={() => { setTask(h.prompt); setShowHistory(false); }}
                    title="Load prompt" className="p-1 bg-ide-accent/15 text-ide-accent rounded hover:bg-ide-accent/25">
                    <Play className="w-2.5 h-2.5" />
                  </button>
                  <button onClick={() => {
                    setPromptHistory(prev => { const u = prev.filter(x => x.id !== h.id); saveAgentHistory(u); return u; });
                  }} className="p-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20">
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="p-2 border-t border-ide-border/50">
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="text-[9px] text-ide-text-dim">
                {selectedHistoryIds.size > 0
                  ? `${selectedHistoryIds.size} selected`
                  : 'No selection (uses top recent prompts)'}
              </div>
              <div className="flex items-center gap-1">
                <label className="text-[9px] text-ide-text-dim">Model source</label>
                <select
                  value={megaPromptModelSource}
                  onChange={(e) => setMegaPromptModelSource(e.target.value as 'auto' | 'cloud' | 'local')}
                  className="text-[9px] bg-ide-bg border border-ide-border rounded px-1 py-0.5"
                >
                  <option value="auto">Auto</option>
                  <option value="cloud">Cloud</option>
                  <option value="local">Local</option>
                </select>
              </div>
            </div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <button
                onClick={() => setSelectedHistoryIds(new Set(filteredHistory.map(h => h.id)))}
                className="text-[9px] px-1.5 py-0.5 rounded border border-ide-border text-ide-text-dim hover:text-ide-text"
              >
                Select Visible
              </button>
              <button
                onClick={() => setSelectedHistoryIds(new Set())}
                className="text-[9px] px-1.5 py-0.5 rounded border border-ide-border text-ide-text-dim hover:text-ide-text"
              >
                Clear Selection
              </button>
            </div>
            <button
              onClick={generateMegaPromptFromHistory}
              className="w-full text-[10px] py-1 bg-purple-500/10 text-purple-400 rounded hover:bg-purple-500/20 flex items-center justify-center gap-1"
            >
              <Zap className="w-3 h-3" /> Generate Mega-Prompt from History
            </button>
          </div>
        </div>
      )}
      {/* Task Input + Controls */}
      {!isRunning && !isFleetRunning && (
        <div className="p-2">
          <div className="mb-2 rounded border border-ide-border/60 bg-ide-panel/50 p-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-semibold text-ide-text uppercase tracking-wide">The Project Factory — 24/7 Build Pipeline</div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowWizard(true)}
                  disabled={!activeProject}
                  className="text-[9px] px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25 disabled:opacity-40 flex items-center gap-1"
                  title="Open Project Factory Wizard"
                >
                  <Zap className="w-2.5 h-2.5" /> Wizard
                </button>
                <div className="text-[9px] text-ide-text-dim">
                  code {capabilityCounts.coding} · reason {capabilityCounts.reasoning}
                </div>
              </div>
            </div>

            {/* Workflow mode selector */}
            <div className="flex gap-1 flex-wrap">
              {(['build_new', 'import_refactor', 'code_review', 'scale_research'] as WorkflowMode[]).map(mode => {
                const labels: Record<WorkflowMode, string> = { build_new: '🏗 Build New', import_refactor: '🔧 Import', code_review: '🔍 Review', scale_research: '🧠 Research' };
                return (
                  <button
                    key={mode}
                    onClick={() => setWorkflowMode(mode)}
                    className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                      workflowMode === mode
                        ? 'border-purple-500 bg-purple-500/20 text-purple-200'
                        : 'border-ide-border/50 text-ide-text-dim hover:text-ide-text'
                    }`}
                  >
                    {labels[mode]}
                  </button>
                );
              })}
              <label className="flex items-center gap-1 text-[9px] text-ide-text-dim ml-auto">
                <input type="checkbox" checked={strictQualityGate} onChange={e => setStrictQualityGate(e.target.checked)} className="accent-orange-500" />
                Strict QA
              </label>
            </div>

            <div className="rounded border border-cyan-500/25 bg-cyan-500/5 px-2 py-1.5 text-[9px] text-cyan-100/90">
              <div className="font-semibold text-cyan-200">Memory Surface Map</div>
              <div className="mt-0.5 text-cyan-100/80">Ask/Edit/Plan (Chat tab) and Ask/Edit/Plan (Agent Loop) are distinct interaction memories in the unified spec.</div>
              <div className="mt-0.5 text-cyan-100/80">This panel is the Agent Loop surface. Shared memory scope policy: Agent Loop and Fleet default to SELF/CUSTOM/PRESET constraints.</div>
            </div>

            <div className="flex flex-wrap gap-1">
              {STRATEGY_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() => void applyStrategyTemplate(template.id)}
                  disabled={templateBusy !== null}
                  title={template.description}
                  className="text-[9px] px-1.5 py-0.5 rounded border border-ide-border/60 text-ide-text-dim hover:text-ide-text hover:bg-ide-bg/40 disabled:opacity-40"
                >
                  {templateBusy === template.id ? 'Applying…' : template.name}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-1 text-[10px]">
              <label className="flex items-center gap-1 text-ide-text-dim">
                <input type="checkbox" checked={useCorpusManifesto} onChange={e => setUseCorpusManifesto(e.target.checked)} className="accent-purple-500" />
                Use Corpus Manifesto
              </label>
              <label className="flex items-center gap-1 text-ide-text-dim">
                <input type="checkbox" checked={autoIngestCorpus} onChange={e => setAutoIngestCorpus(e.target.checked)} className="accent-purple-500" />
                Auto Ingest Corpus
              </label>
              <label className="flex items-center gap-1 text-ide-text-dim col-span-2">
                <input type="checkbox" checked={autoProjectIntel} onChange={e => setAutoProjectIntel(e.target.checked)} className="accent-cyan-500" />
                Auto Project Intel Preflight (tests + embeddings)
              </label>
            </div>

            <div className="flex gap-1">
              <input
                value={corpusPath}
                onChange={(e) => setCorpusPath(e.target.value)}
                placeholder="Corpus folder path (optional, defaults to project root)"
                className="flex-1 bg-ide-bg border border-ide-border rounded px-2 py-1 text-[10px] focus:outline-none focus:border-ide-accent"
              />
              <button
                onClick={() => void ingestCorpus()}
                disabled={!activeProject || corpusBusy !== null}
                className="px-2 py-1 text-[10px] rounded bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 disabled:opacity-40"
              >
                {corpusBusy === 'ingest' ? 'Ingest…' : 'Ingest'}
              </button>
              <button
                onClick={() => void generateManifesto()}
                disabled={!activeProject || corpusBusy !== null}
                className="px-2 py-1 text-[10px] rounded bg-purple-500/15 text-purple-300 hover:bg-purple-500/25 disabled:opacity-40"
              >
                {corpusBusy === 'manifesto' ? 'Build…' : 'Manifesto'}
              </button>
            </div>

            <div className="text-[9px] text-ide-text-dim">
              Corpus files: {corpusStats?.file_count ?? 0} · tokens: {corpusStats?.total_tokens ?? 0}
            </div>
            <div className="rounded border border-ide-border/40 bg-ide-bg/30 p-1.5 text-[9px] text-ide-text-dim">
              <div className="flex items-center justify-between">
                <span>Project Intel</span>
                <button
                  onClick={() => void refreshProjectIntel()}
                  className="text-[9px] px-1 py-0.5 rounded border border-ide-border/50 hover:bg-ide-bg/40"
                  disabled={intelBusy}
                >
                  {intelBusy ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5">
                <span>Runs</span><span className="text-right">{projectIntel?.runs?.total ?? 0}</span>
                <span>Completed</span><span className="text-right text-green-300">{projectIntel?.runs?.complete ?? 0}</span>
                <span>Errors</span><span className="text-right text-red-300">{projectIntel?.runs?.error ?? 0}</span>
                <span>Jobs</span><span className="text-right">{projectIntel?.suggestedJobs?.suggested ?? 0} pending</span>
                <span>Blame 24h</span><span className="text-right">{projectIntel?.blame?.failures24h ?? 0} fail / {projectIntel?.blame?.successes24h ?? 0} ok</span>
              </div>
            </div>
            {manifestoPreview && (
              <div className="rounded border border-ide-border/40 bg-ide-bg/40 p-1.5 text-[9px] text-ide-text-dim max-h-20 overflow-y-auto whitespace-pre-wrap">
                {manifestoPreview}
              </div>
            )}
          </div>

          {/* Mega-Prompt Presets — extracted component */}
          <MegaPromptsPanel
            maxAgents={maxAgents}
            onSelect={(prompt, fleet, agentCount) => {
              setTask(prompt);
              if (fleet) {
                setFleetMode(true);
                setSelectedAgentCount(agentCount);
              }
            }}
          />
          {/* Task size indicator */}
          {task.length > 500 && (
            <div className={`flex items-center justify-between mb-1.5 px-2 py-1 rounded text-[9px] ${
              task.length > 10000 ? 'bg-yellow-500/10 text-yellow-400' : 'bg-ide-bg text-ide-text-dim'
            }`}>
              <span>~{Math.round(task.length / 3.5).toLocaleString()} tokens</span>
              {task.length > 10000 && <span>⚠ Large prompt — consider chunking</span>}
              <button onClick={() => setTask('')} className="text-ide-text-dim hover:text-red-400 ml-2">
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          )}
          <textarea
            value={task}
            onChange={e => setTask(e.target.value)}
            placeholder={fleetMode
              ? "Describe the project task for the fleet team..."
              : "Describe the task for the agent..."}
            rows={task.length > 500 ? 6 : 2}
            className="w-full bg-ide-bg border border-ide-border rounded px-2.5 py-2 text-xs focus:outline-none focus:border-ide-accent resize-none mb-2"
            disabled={!activeProject}
          />
          <button
            onClick={handleStart}
            disabled={!task.trim() || !activeProject}
            className={`w-full flex items-center justify-center gap-1.5 text-white text-xs py-2 rounded font-medium disabled:opacity-30 transition-colors ${
              fleetMode
                ? 'bg-cyan-600 hover:bg-cyan-500'
                : 'bg-purple-600 hover:bg-purple-500'
            }`}
          >
            {fleetMode ? (
              <><Users className="w-3.5 h-3.5" /> Launch Fleet ({selectedAgentCount} agents)</>
            ) : (
              <><Play className="w-3.5 h-3.5" /> Start Agent</>
            )}
          </button>
        </div>
      )}

      {/* Fleet Running Controls */}
      {isFleetRunning && (
        <div className="p-2 space-y-2">
          <div className="flex items-center gap-1">
            {fleetState === 'paused' ? (
              <button onClick={resumeFleet} className="flex-1 flex items-center justify-center gap-1 bg-green-600 text-white text-xs py-1.5 rounded hover:bg-green-500">
                <SkipForward className="w-3.5 h-3.5" /> Resume Fleet
              </button>
            ) : (
              <button onClick={pauseFleet} className="flex-1 flex items-center justify-center gap-1 bg-yellow-600 text-white text-xs py-1.5 rounded hover:bg-yellow-500">
                <Pause className="w-3.5 h-3.5" /> Pause Fleet
              </button>
            )}
            <button onClick={stopFleet} className="flex-1 flex items-center justify-center gap-1 bg-ide-error text-white text-xs py-1.5 rounded hover:bg-ide-error/80">
              <Square className="w-3.5 h-3.5" /> Stop Fleet
            </button>
          </div>
          {/* Fleet Stats */}
          <div className="flex items-center gap-3 text-[10px] text-ide-text-dim px-1">
            <span>📊 {totalIterations} iters</span>
            <span>📝 {totalFilesChanged} files</span>
            <span>🔤 {(totalTokensUsed / 1000).toFixed(1)}k tok</span>
          </div>
          {/* Fleet Message Input */}
          <div className="flex gap-1">
            <input
              value={fleetMessage}
              onChange={e => setFleetMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleFleetMessage()}
              placeholder="Broadcast to all agents..."
              className="flex-1 bg-ide-bg border border-ide-border rounded px-2 py-1 text-[11px] focus:outline-none focus:border-cyan-500"
            />
            <button
              onClick={handleFleetMessage}
              disabled={!fleetMessage.trim()}
              className="px-2 py-1 bg-cyan-600 text-white rounded text-[10px] hover:bg-cyan-500 disabled:opacity-30"
            >
              <Send className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Fleet Agent Status Cards */}
      {isFleetRunning && fleetAgents.length > 0 && (
        <div className="border-t border-ide-border px-2 py-1.5 space-y-1 max-h-40 overflow-y-auto flex-shrink-0">
          <div className="flex items-center gap-1 mb-1">
            <Users className="w-3 h-3 text-cyan-400" />
            <span className="text-[10px] text-ide-text-dim font-medium">Team Status</span>
          </div>
          {fleetAgents.map((agent) => (
            <div key={agent.id} className="flex items-center gap-2 bg-ide-bg/50 rounded px-2 py-1 text-[10px]">
              {/* Role Badge */}
              <span className={`px-1.5 py-0.5 rounded font-medium ${
                agent.role === 'lead' ? 'bg-yellow-500/20 text-yellow-300' :
                agent.role === 'implementer' ? 'bg-green-500/20 text-green-300' :
                agent.role === 'debugger' ? 'bg-red-500/20 text-red-300' :
                agent.role === 'tester' ? 'bg-blue-500/20 text-blue-300' :
                agent.role === 'reviewer' ? 'bg-purple-500/20 text-purple-300' :
                'bg-cyan-500/20 text-cyan-300'
              }`}>
                {agent.role}
              </span>
              {/* Status */}
              <span className={`capitalize ${
                agent.status === 'running' ? 'text-green-400' :
                agent.status === 'completed' ? 'text-ide-success' :
                agent.status === 'error' ? 'text-ide-error' :
                agent.status === 'paused' ? 'text-yellow-400' :
                'text-ide-text-dim'
              }`}>
                {agent.status}
              </span>
              {/* Iteration count */}
              <span className="text-ide-text-dim ml-auto">it:{agent.iterations}</span>
              {/* Per-agent controls */}
              {agent.status === 'running' && (
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => pauseFleetAgent(agent.id)}
                    className="p-0.5 text-yellow-400 hover:bg-yellow-500/20 rounded"
                    title="Pause this agent"
                  >
                    <Pause className="w-2.5 h-2.5" />
                  </button>
                  <button
                    onClick={() => stopFleetAgent(agent.id)}
                    className="p-0.5 text-ide-error hover:bg-ide-error/20 rounded"
                    title="Stop this agent"
                  >
                    <Square className="w-2.5 h-2.5" />
                  </button>
                </div>
              )}
              {agent.status === 'paused' && (
                <button
                  onClick={() => resumeFleetAgent(agent.id)}
                  className="p-0.5 text-green-400 hover:bg-green-500/20 rounded"
                  title="Resume this agent"
                >
                  <SkipForward className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Single-agent Running Controls */}
      {isRunning && !isFleetRunning && (
        <div className="flex items-center gap-1 p-2">
          {state === 'paused' ? (
            <button onClick={resumeAgent} className="flex-1 flex items-center justify-center gap-1 bg-green-600 text-white text-xs py-1.5 rounded hover:bg-green-500">
              <SkipForward className="w-3.5 h-3.5" /> Resume
            </button>
          ) : (
            <button onClick={pauseAgent} className="flex-1 flex items-center justify-center gap-1 bg-yellow-600 text-white text-xs py-1.5 rounded hover:bg-yellow-500">
              <Pause className="w-3.5 h-3.5" /> Pause
            </button>
          )}
          <button onClick={stopAgent} className="flex-1 flex items-center justify-center gap-1 bg-ide-error text-white text-xs py-1.5 rounded hover:bg-ide-error/80">
            <Square className="w-3.5 h-3.5" /> Stop
          </button>
        </div>
      )}

      {/* Message Queue Input (visible during single-agent runs) */}
      {isRunning && !isFleetRunning && (
        <div className="p-2 border-b border-ide-border bg-ide-bg/30">
          <div className="flex items-center gap-1 mb-1">
            <MessageSquare className="w-3 h-3 text-blue-400" />
            <span className="text-[10px] text-ide-text-dim">Queue a message for the agent</span>
            {queuedMessageCount > 0 && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-300">{queuedMessageCount} queued</span>
            )}
          </div>
          <div className="flex gap-1">
            <input
              value={queueInput}
              onChange={e => setQueueInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleQueueMessage()}
              placeholder="Send instruction to agent..."
              className="flex-1 bg-ide-bg border border-ide-border rounded px-2 py-1 text-[11px] focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => setQueuePriority(p => p === 'normal' ? 'high' : 'normal')}
              className={`px-1.5 py-1 rounded text-[9px] font-medium border ${
                queuePriority === 'high'
                  ? 'border-orange-500/50 text-orange-400 bg-orange-500/10'
                  : 'border-ide-border text-ide-text-dim bg-ide-bg'
              }`}
              title={queuePriority === 'high' ? 'High priority' : 'Normal priority'}
            >
              {queuePriority === 'high' ? '⚡' : '📋'}
            </button>
            <button
              onClick={handleQueueMessage}
              disabled={!queueInput.trim()}
              className="px-2 py-1 bg-blue-600 text-white rounded text-[10px] hover:bg-blue-500 disabled:opacity-30"
            >
              <Send className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Runtime Telemetry */}
      {activeProject && runtimeTelemetry && (
        <div className="border-t border-ide-border p-2 bg-ide-bg/20">
          <div className="text-[10px] font-medium text-ide-text mb-1">Runtime Telemetry</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-ide-text-dim">
            <span>Model</span>
            <span className="text-right text-ide-text truncate" title={runtimeTelemetry.selectedModel || ''}>{runtimeTelemetry.selectedModel || 'n/a'}</span>
            <span>Server quota</span>
            <span className="text-right">
              {runtimeTelemetry.rateLimiter?.selectedModel?.usage?.serverRemaining ?? '-'}
              /
              {runtimeTelemetry.rateLimiter?.selectedModel?.usage?.serverLimit ?? '-'}
            </span>
            <span>Backoff</span>
            <span className="text-right">{Math.round((runtimeTelemetry.rateLimiter?.selectedModel?.usage?.backoffMs || 0) / 1000)}s</span>
            <span>Recent build pass</span>
            <span className="text-right">{Math.round((runtimeTelemetry.quality?.stats?.buildPassRate || 0) * 100)}%</span>
            <span>Recent test pass</span>
            <span className="text-right">{Math.round((runtimeTelemetry.quality?.stats?.testPassRate || 0) * 100)}%</span>
            <span>Avg errors/iter</span>
            <span className="text-right">{(runtimeTelemetry.quality?.stats?.avgErrors || 0).toFixed(1)}</span>
            <span>Suggested cooldown</span>
            <span className="text-right text-yellow-300">{runtimeTelemetry.quality?.recommendedCooldownMs ?? cooldownMs}ms</span>
          </div>
          {!!runtimeTelemetry.rateLimiter?.deadModels?.count && (
            <div className="text-[9px] text-orange-300 mt-1">
              Dead models temporarily blacklisted: {runtimeTelemetry.rateLimiter.deadModels.count}
            </div>
          )}
        </div>
      )}

      {/* Event Log */}
      <AgentEventFeed
        events={events}
        verbosity={verbosity}
        setVerbosity={setVerbosity}
        toggleEventExpanded={toggleEventExpanded}
        isFleetRunning={isFleetRunning}
        fleetMode={fleetMode}
        fleetEvents={fleetEvents}
        clearEvents={clearEvents}
        clearFleetEvents={clearFleetEvents}
        handleCopyFeed={handleCopyFeed}
        copiedFeed={copiedFeed}
      />

      {/* Milestone + Quality panels — shown during/after a run */}
      {activeProject && (isRunning || (!isRunning && events.length > 0)) && (
        <>
          <MilestonePanel
            projectId={activeProject.id}
            isRunning={isRunning || isFleetRunning}
          />
          <QualityTrend
            projectId={activeProject.id}
            isRunning={isRunning || isFleetRunning}
            latestQualityEvent={latestQualityEvent}
          />
        </>
      )}

      {/* Pending Questions */}
      {questions.length > 0 && (
        <div className="border-t border-ide-border p-2">
          <div className="text-[10px] text-yellow-400 font-medium mb-1 flex items-center gap-1">
            <MessageSquare className="w-3 h-3" /> Questions ({questions.length})
          </div>
          <div className="max-h-24 overflow-y-auto space-y-1">
            {questions.slice(-5).map((q, i) => (
              <div key={i} className="text-[10px] text-ide-text-dim bg-ide-bg/50 rounded p-1.5">{q}</div>
            ))}
          </div>
        </div>
      )}

      {/* Project Factory Wizard modal */}
      {showWizard && (
        <ProjectFactoryWizard
          onClose={() => setShowWizard(false)}
          onLaunch={handleWizardLaunch}
        />
      )}
    </div>
  );
}
