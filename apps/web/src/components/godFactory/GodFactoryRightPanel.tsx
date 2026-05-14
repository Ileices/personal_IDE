// ============================================
// GodFactoryRightPanel — Intel Panel for THE GOD FACTORY
// Collapsible sidebar with: Notifications, Suggested Jobs,
// Codebase Health snapshot, and Brainstorm Pad.
// ============================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Zap, ChevronDown, ChevronRight, ChevronLeft,
  AlertTriangle, Star, Shield, Sparkles, Send, X, SlidersHorizontal, Play,
  RefreshCw, Briefcase, Clock3, PauseCircle, PlayCircle,
} from 'lucide-react';
import { API_BASE } from '../../config.js';
import { useChatStore } from '../../stores/chatStore';

const GF_READY_NOTICE_KEY = 'gf_ready_notice_seen';

export interface SuggestedJob {
  id: string;          // internal UI id (same as job_id from API)
  job_id: string;      // canonical API id for action calls
  title: string;
  category: string;
  scope: 'internal' | 'external';
  priority: 'critical' | 'high' | 'medium' | 'low';
  source: string;
  description: string;
  implementation_status: string;
  affected_devtags: string[];
  affected_files: string[];
  atomic_steps: unknown[];
  sandbox_spec: { status: string; cycles_used: number; cycle_limit: number };
}

export interface IntelNotification {
  id: string;
  type: 'info' | 'warning' | 'success' | 'error' | 'critical' | 'fatal';
  message: string;
  timestamp: string;
  source: string;
  category?: string;
  subsystem?: SubsystemId | null;
}

interface IdleSuggestion {
  suggestion_id: string;
  category: 'trivial_enhancement' | 'feature_bridge' | 'performance_opportunity' | 'debt_warning' | 'regression_trend' | 'model_behavior_alert';
  source_devtags: string[];
  source_files: string[];
  source_lines: Array<[number, number]>;
  source_forensic_ids: string[];
  natural_language_summary: string;
  suggested_job_id: string | null;
  presented_to_user: boolean;
  user_response: 'accepted' | 'rejected' | 'deferred' | null;
  timestamp: string;
}

interface ModelHealthRecord {
  model_id: string;
  display_name: string;
  provider: string;
  avg_quality: number;
  success_rate: number;
  total_runs: number;
  tag_conformance: number;
  instruction_adherence: number;
  hallucination: number;
  trend: 'up' | 'down' | 'flat';
  composite_quality_score: number;
}

interface ModelStrategySnapshot {
  settings: {
    presetId: string;
    primaryModel: string;
    fallbackModels: string[];
    blockedModels: string[];
    cleanupFailedModels: boolean;
  };
  failedModels: string[];
}

interface WorkingModelProbe {
  model: string;
  latencyMs?: number;
  classification?: string;
  provider?: string;
}

interface BlameRegistryModel {
  modelId?: string;
  model?: string;
  avgQuality?: number;
  successRate?: number;
  strategyConfig?: {
    action?: string;
    reason?: string;
    recommended?: boolean;
  } | null;
}

interface NotificationDetailResponse {
  notification: Record<string, unknown> & {
    notification_id: string;
    category: string;
    severity: string;
    natural_language_summary: string;
    summary_tags: string[];
    timestamp: string;
  };
  source_detail: Record<string, unknown> | null;
}

interface ModelHealthDetailResponse {
  model: Record<string, unknown> & {
    model_id: string;
    display_name: string;
    provider: string;
    recommended_interaction_types?: string[];
    avoided_interaction_types?: string[];
    strengths?: string[];
    weaknesses?: string[];
  };
  recent_quality: Array<Record<string, unknown>>;
  recent_blame: Array<Record<string, unknown>>;
}

interface CodebaseHealthPayload {
  latest_snapshot: null | {
    snapshot_id: string;
    total_devtags: number;
    registry_surplus_count: number;
    registry_deficit_count: number;
    systemic_drift_flagged: boolean;
    content_drift_count: number;
    location_drift_count: number;
    parse_duration_ms: number;
    timestamp: string;
  };
  top_debt_files: Array<{
    file_path: string;
    debt_score: number;
    ceiling: number;
    ceiling_exceeded: boolean;
    score_breakdown: Record<string, unknown>;
  }>;
  gap_summary: {
    total_reports: number;
    flagged_reports: number;
  };
}

interface GodFactoryActionRecord {
  action_id: string;
  action_type: string;
  target_id: string | null;
  target_type: string | null;
  authority_invoked: string | null;
  justification_tags: string[];
  result: string;
  timestamp: string;
}

function mapApiJobToSuggestedJob(raw: Record<string, unknown>): SuggestedJob {
  const tags = Array.isArray(raw.affected_devtags) ? raw.affected_devtags as string[] : [];
  const files = Array.isArray(raw.affected_files) ? raw.affected_files as string[] : [];
  const steps = Array.isArray(raw.atomic_steps) ? raw.atomic_steps : [];
  const rawCategory = String(raw.job_category || '');
  const rawSource = String(raw.source || '');
  const externalScope = rawCategory === 'external_project' || rawSource === 'project_state_crawler';
  const sbSpec = (raw.sandbox_spec && typeof raw.sandbox_spec === 'object')
    ? raw.sandbox_spec as { status: string; cycles_used: number; cycle_limit: number }
    : { status: 'not_started', cycles_used: 0, cycle_limit: 50 };
  const descParts: string[] = [];
  if (tags.length) descParts.push(`${tags.length} devtag${tags.length !== 1 ? 's' : ''}`);
  if (files.length) descParts.push(`${files.length} file${files.length !== 1 ? 's' : ''}`);
  if (steps.length) descParts.push(`${steps.length} step${steps.length !== 1 ? 's' : ''}`);
  descParts.push(`sandbox: ${sbSpec.status}`);
  return {
    id: raw.job_id as string,
    job_id: raw.job_id as string,
    title: raw.title as string,
    category: rawCategory.replace(/_/g, ' '),
    scope: externalScope ? 'external' : 'internal',
    priority: (raw.priority as SuggestedJob['priority']) || 'medium',
    source: rawSource.replace(/_/g, ' '),
    description: descParts.join(' · '),
    implementation_status: raw.implementation_status as string,
    affected_devtags: tags,
    affected_files: files,
    atomic_steps: steps,
    sandbox_spec: sbSpec,
  };
}

// ── Component ─────────────────────────────────
interface Props {
  codebaseReady: boolean;
  codebaseTree: string;
  projectRoot?: string;
  projectId?: string;
  projectName?: string;
  onSendToBrainstorm: (text: string) => void;
}

type SubsystemId = 'ide_codebase_crawler' | 'project_state_crawler' | 'suggested_jobs_crawler' | 'gap_analysis' | 'god_factory_idle_scan';
interface SubsystemConfig {
  enabled: boolean;
  idleEnabled: boolean;
  idleIntervalSec: number;
  maxDepth: number;
  manualOnly: boolean;
}

interface SubsystemRuntime {
  lastRun?: { completedAt?: string; projectName?: string; projectRoot?: string; result?: { root?: string } } | null;
  nextRunAt?: string | null;
  schedulerActive?: boolean;
  targetRoot?: string | null;
  targetProjectName?: string | null;
}

interface SchedulerStatus {
  running: boolean;
  tickMs: number;
  lastTickAt?: string | null;
}

function mapCategoryToSubsystem(category: string): SubsystemId | null {
  const c = String(category || '').toLowerCase();
  if (!c) return null;
  if (c.includes('gap') || c.includes('debt') || c.includes('regression')) return 'gap_analysis';
  if (c.includes('model')) return 'suggested_jobs_crawler';
  if (c.includes('idle')) return 'god_factory_idle_scan';
  if (c.includes('project') || c.includes('state') || c.includes('drift')) return 'project_state_crawler';
  if (c.includes('job') || c.includes('queue')) return 'suggested_jobs_crawler';
  return 'ide_codebase_crawler';
}

interface BackgroundSubAgentStatus {
  label: string;
  description: string;
  last_run_cycle: string | null;
  last_run_at: string | null;
  status: string;
  scan_position?: string | null;
}

interface BackgroundStatusPayload {
  scheduler: SchedulerStatus;
  subsystemStatus: Record<SubsystemId, SubsystemRuntime>;
  controls?: {
    sandbox_paused: boolean;
  };
  idleScanner?: {
    scan_position?: string | null;
    last_monitor_run?: string | null;
  };
  backgroundSubAgents?: {
    registry_monitor: BackgroundSubAgentStatus;
    idle_scanner: BackgroundSubAgentStatus;
    debt_monitor: BackgroundSubAgentStatus;
    model_performance_monitor: BackgroundSubAgentStatus;
    gap_report_monitor: BackgroundSubAgentStatus;
    pattern_watch: BackgroundSubAgentStatus;
  };
}

interface ImplementationStage {
  stage: number;
  name: string;
  key: string;
  description: string;
  status: 'pending' | 'in_progress' | 'complete' | 'failed';
  entries: number;
  last_entry_at: string | null;
  last_validation: string | null;
}

interface ImplementingJob {
  job_id: string;
  title: string;
  implementation_status: string;
  current_stage: number | null;
  stages: ImplementationStage[];
  sandbox_spec: Record<string, unknown>;
}

interface SiliconFactoryTask {
  id: string;
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'ESCALATED';
  agent_type: string;
  instruction: string;
  attempt_count: number;
  created_at: number;
  completed_at: number | null;
}

interface SiliconFactoryDashboard {
  supervisor: {
    running: boolean;
    paused: boolean;
    heartbeatSec: number;
    lastHeartbeatAt: string | null;
    queue: {
      pending: number;
      active: number;
      completed: number;
      failed: number;
      escalated: number;
    };
    resources: {
      checkedAt: string;
      memoryPercent: number;
      load1m: number;
      vramPercent: number | null;
      throttleRecommended: boolean;
    };
  };
  active_tasks: SiliconFactoryTask[];
  pending_tasks: SiliconFactoryTask[];
  escalated_tasks: SiliconFactoryTask[];
  recent_tasks: SiliconFactoryTask[];
  iap_queue_depth: number;
  lock_count: number;
  snapshot_count: number;
}

const SUBSYSTEM_META: Record<SubsystemId, { label: string; description: string; scope: 'ide_app' | 'user_projects' | 'global' }> = {
  ide_codebase_crawler: {
    label: 'IDE Codebase Crawler',
    description: 'Scans the Personal IDE app itself so THE GOD FACTORY Agent can reason about and modify the IDE codebase.',
    scope: 'ide_app',
  },
  project_state_crawler: {
    label: 'Project Crawler',
    description: 'Scans the external project being built by the IDE agents (different from "THE GOD FACTORY Agent"), separate from the IDE app.',
    scope: 'user_projects',
  },
  suggested_jobs_crawler: {
    label: 'Suggested Jobs Crawler',
    description: 'Turns telemetry and model quality signals into concrete follow-up jobs.',
    scope: 'global',
  },
  gap_analysis: {
    label: 'Gap Analysis',
    description: 'Surfaces failure clusters and subsystem gaps from recent runs.',
    scope: 'global',
  },
  god_factory_idle_scan: {
    label: 'God Factory Idle Scan',
    description: 'Scans one IDE app file per idle window and queues improvement suggestions.',
    scope: 'ide_app',
  },
};

// ─── God Factory Autonomous Loop Panel ────────────────────────────────────────

interface GfLoopStatus {
  state: string;
  current_job_id: string | null;
  current_run_id: string | null;
  jobs_completed: number;
  jobs_failed: number;
  jobs_skipped: number;
  started_at: string | null;
  isRunning: boolean;
  pendingJobs: number;
  inProgressJobs: number;
  currentJob: { job_id: string; title: string; priority: number } | null;
  config?: {
    last_model: string | null;
    last_project_id: string | null;
    last_max_iterations: number | null;
    cooldown_profile?: string;
    auto_cooldown_profile?: boolean;
    governance?: {
      autoApproveChanges: boolean;
      autoAnswerQuestions: boolean;
      checkpointEvery: number;
      jobMaxIterations: number;
      mode: string;
    };
  };
  activeRun?: {
    auto_approve_changes?: number;
    auto_answer_questions?: number;
    checkpoint_every?: number;
  } | null;
}

function GodFactoryLoopPanel({ projectId }: { projectId?: string }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<GfLoopStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [maxIterations, setMaxIterations] = useState(50);
  const [jobMaxIterations, setJobMaxIterations] = useState(50);
  const [autoApproveChanges, setAutoApproveChanges] = useState(false);
  const [autoAnswerQuestions, setAutoAnswerQuestions] = useState(false);
  const [checkpointEvery, setCheckpointEvery] = useState(5);
  const [cooldownProfile, setCooldownProfile] = useState<'safe-exhaustive' | 'aggressive' | 'paced' | 'slow' | 'crawl'>('safe-exhaustive');
  const [autoCooldownProfile, setAutoCooldownProfile] = useState(true);
  const [hydratedFromStatus, setHydratedFromStatus] = useState(false);
  const selectedModel = useChatStore((s) => s.selectedModel);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/god-factory/loop/status`);
      if (res.ok) setStatus(await res.json());
    } catch { /* best-effort */ }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchStatus();
    const id = window.setInterval(fetchStatus, 3_000);
    return () => window.clearInterval(id);
  }, [open, fetchStatus]);

  useEffect(() => {
    if (!open) {
      setHydratedFromStatus(false);
      return;
    }
    if (hydratedFromStatus || !status?.config) return;
    if (status.config.last_max_iterations) setMaxIterations(status.config.last_max_iterations);
    if (typeof status.config.last_max_iterations === 'number') setMaxIterations(status.config.last_max_iterations);
    if (status.config.cooldown_profile) setCooldownProfile(status.config.cooldown_profile as 'safe-exhaustive' | 'aggressive' | 'paced' | 'slow' | 'crawl');
    if (typeof status.config.auto_cooldown_profile === 'boolean') setAutoCooldownProfile(status.config.auto_cooldown_profile);
    if (status.config.governance) {
      setAutoApproveChanges(status.config.governance.autoApproveChanges);
      setAutoAnswerQuestions(status.config.governance.autoAnswerQuestions);
      setCheckpointEvery(status.config.governance.checkpointEvery);
      setJobMaxIterations(status.config.governance.jobMaxIterations || 50);
    }
    setHydratedFromStatus(true);
  }, [open, status, hydratedFromStatus]);

  const start = async () => {
    const normalizedIterations = Math.trunc(maxIterations || 0);
    const boundedIterations = normalizedIterations <= 0 ? 0 : Math.min(100000, Math.max(1, normalizedIterations));
    const boundedJobIterations = Math.min(5000, Math.max(1, Math.trunc(jobMaxIterations || 0)));
    const boundedCheckpointEvery = Math.min(10, Math.max(1, Math.trunc(checkpointEvery || 0)));
    setBusy(true);
    try {
      await fetch(`${API_BASE}/api/god-factory/loop/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          model: selectedModel,
          maxIterations: boundedIterations,
          jobMaxIterations: boundedJobIterations,
          autoApproveChanges,
          autoAnswerQuestions,
          checkpointEvery: boundedCheckpointEvery,
          cooldownProfile,
          autoCooldownProfile,
        }),
      });
      await fetchStatus();
    } catch { /* best-effort */ }
    finally { setBusy(false); }
  };

  const stop = async () => {
    setBusy(true);
    try {
      await fetch(`${API_BASE}/api/god-factory/loop/stop`, { method: 'POST' });
      await fetchStatus();
    } catch { /* best-effort */ }
    finally { setBusy(false); }
  };

  const isRunning = status?.isRunning ?? false;
  const activeGovernance = status?.activeRun
    ? {
        autoApproveChanges: status.activeRun.auto_approve_changes === 1,
        autoAnswerQuestions: status.activeRun.auto_answer_questions === 1,
        checkpointEvery: status.activeRun.checkpoint_every ?? checkpointEvery,
      }
    : {
        autoApproveChanges,
        autoAnswerQuestions,
        checkpointEvery,
      };
  const governanceModeLabel = activeGovernance.autoApproveChanges ? 'UNSAFE OVERRIDE' : 'SAFE MODE';

  return (
    <div className="border-t border-ide-border/40">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-ide-text-dim hover:text-ide-text hover:bg-ide-bg/30"
      >
        <div className="flex items-center gap-1.5">
          <Zap className={`w-3 h-3 ${isRunning ? 'text-yellow-400 animate-pulse' : 'text-ide-text-dim'}`} />
          THE GOD FACTORY Loop
          {isRunning && <span className="text-[9px] px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-300 font-medium">RUNNING</span>}
        </div>
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-2">
          <p className="text-[9px] text-ide-text-dim leading-relaxed">
            Automatically processes your highest-priority <em>Suggested Jobs</em> queue — building IDE enhancements autonomously, 24/7.
          </p>

          <div className="grid grid-cols-1 gap-1 text-[9px]">
            <div className="bg-ide-bg/40 rounded px-2 py-1">
              <div className="text-ide-text-dim">Model</div>
              <div className="text-ide-text font-medium truncate" title={selectedModel}>{selectedModel}</div>
            </div>
            <label className="bg-ide-bg/40 rounded px-2 py-1 flex items-center justify-between gap-2">
              <span className="text-ide-text-dim">Max iterations</span>
              <input
                type="number"
                min={0}
                max={100000}
                step={1}
                value={maxIterations}
                onChange={(e) => {
                  const n = Math.trunc(Number(e.target.value) || 0);
                  setMaxIterations(n <= 0 ? 0 : Math.min(100000, Math.max(1, n)));
                }}
                className="w-16 px-1 py-0.5 rounded bg-ide-bg border border-ide-border/50 text-ide-text text-right"
              />
            </label>
            <div className="text-[8px] text-ide-text-dim -mt-0.5 px-2">0 = unlimited (24/7 until manually stopped)</div>
            <label className="bg-ide-bg/40 rounded px-2 py-1 flex items-center justify-between gap-2">
              <span className="text-ide-text-dim">Per-job step cap</span>
              <input
                type="number"
                min={1}
                max={5000}
                step={1}
                value={jobMaxIterations}
                onChange={(e) => setJobMaxIterations(Math.min(5000, Math.max(1, Number(e.target.value) || 1)))}
                className="w-16 px-1 py-0.5 rounded bg-ide-bg border border-ide-border/50 text-ide-text text-right"
              />
            </label>
            <label className="bg-ide-bg/40 rounded px-2 py-1 flex items-center justify-between gap-2">
              <span className="text-ide-text-dim">Checkpoint every</span>
              <input
                type="number"
                min={1}
                max={10}
                step={1}
                value={checkpointEvery}
                onChange={(e) => setCheckpointEvery(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
                className="w-16 px-1 py-0.5 rounded bg-ide-bg border border-ide-border/50 text-ide-text text-right"
              />
            </label>
            <label className="bg-ide-bg/40 rounded px-2 py-1 flex items-center justify-between gap-2">
              <span className="text-ide-text-dim">Cooldown profile</span>
              <select
                value={cooldownProfile}
                onChange={(e) => setCooldownProfile(e.target.value as 'safe-exhaustive' | 'aggressive' | 'paced' | 'slow' | 'crawl')}
                className="w-28 px-1 py-0.5 rounded bg-ide-bg border border-ide-border/50 text-ide-text"
              >
                <option value="safe-exhaustive">safe-exhaustive</option>
                <option value="aggressive">aggressive</option>
                <option value="paced">paced</option>
                <option value="slow">slow</option>
                <option value="crawl">crawl</option>
              </select>
            </label>
            <label className="bg-ide-bg/40 rounded px-2 py-1 flex items-center justify-between gap-2">
              <span className="text-ide-text-dim">Auto cooldown profile</span>
              <input
                type="checkbox"
                checked={autoCooldownProfile}
                onChange={(e) => setAutoCooldownProfile(e.target.checked)}
                className="accent-cyan-400"
              />
            </label>
            <label className="bg-ide-bg/40 rounded px-2 py-1 flex items-center justify-between gap-2">
              <span className="text-ide-text-dim">Auto-approve changes</span>
              <input
                type="checkbox"
                checked={autoApproveChanges}
                onChange={(e) => setAutoApproveChanges(e.target.checked)}
                className="accent-red-400"
              />
            </label>
            <label className="bg-ide-bg/40 rounded px-2 py-1 flex items-center justify-between gap-2">
              <span className="text-ide-text-dim">Auto-answer questions</span>
              <input
                type="checkbox"
                checked={autoAnswerQuestions}
                onChange={(e) => setAutoAnswerQuestions(e.target.checked)}
                className="accent-yellow-400"
              />
            </label>
            <div className={`rounded px-2 py-1 border text-[9px] ${activeGovernance.autoApproveChanges ? 'bg-red-500/10 border-red-500/30 text-red-200' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'}`}>
              <div className="font-semibold">{governanceModeLabel}</div>
              <div>
                approval gate: {activeGovernance.autoApproveChanges ? 'bypassed' : 'required'} · answers: {activeGovernance.autoAnswerQuestions ? 'automatic' : 'operator required'} · inner-loop cap: {status?.config?.governance?.jobMaxIterations ?? 10} · checkpoint every {activeGovernance.checkpointEvery} step{activeGovernance.checkpointEvery === 1 ? '' : 's'}
              </div>
            </div>
          </div>

          {/* Status grid */}
          {status && (
            <div className="grid grid-cols-2 gap-1 text-[9px]">
              <div className="bg-ide-bg/40 rounded px-2 py-1 flex flex-col items-center">
                <span className="text-green-300 font-bold text-sm">{status.jobs_completed}</span>
                <span className="text-ide-text-dim">Completed</span>
              </div>
              <div className="bg-ide-bg/40 rounded px-2 py-1 flex flex-col items-center">
                <span className="text-red-300 font-bold text-sm">{status.jobs_failed}</span>
                <span className="text-ide-text-dim">Failed</span>
              </div>
              <div className="bg-ide-bg/40 rounded px-2 py-1 flex flex-col items-center">
                <span className="text-yellow-300 font-bold text-sm">{status.pendingJobs}</span>
                <span className="text-ide-text-dim">Pending</span>
              </div>
              <div className="bg-ide-bg/40 rounded px-2 py-1 flex flex-col items-center">
                <span className={`font-bold text-sm ${isRunning ? 'text-blue-300' : 'text-ide-text-dim'}`}>
                  {status.state}
                </span>
                <span className="text-ide-text-dim">State</span>
              </div>
            </div>
          )}

          {/* Current job */}
          {status?.currentJob && (
            <div className="text-[9px] text-ide-text bg-blue-500/10 border border-blue-500/20 rounded px-2 py-1.5">
              <span className="text-blue-300 font-medium">Working on:</span>{' '}
              {status.currentJob.title}
            </div>
          )}

          {/* Controls */}
          <div className="flex gap-1">
            {!isRunning ? (
              <button
                onClick={start}
                disabled={busy || (status?.pendingJobs ?? 0) === 0}
                className="flex-1 py-1.5 text-[10px] rounded bg-green-500/15 text-green-300 border border-green-500/30 hover:bg-green-500/25 disabled:opacity-40 flex items-center justify-center gap-1"
              >
                {busy ? <RefreshCw className="w-3 h-3 animate-spin" /> : <PlayCircle className="w-3 h-3" />}
                {status?.pendingJobs === 0 ? 'No pending jobs' : 'Start Loop'}
              </button>
            ) : (
              <button
                onClick={stop}
                disabled={busy}
                className="flex-1 py-1.5 text-[10px] rounded bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25 disabled:opacity-40 flex items-center justify-center gap-1"
              >
                {busy ? <RefreshCw className="w-3 h-3 animate-spin" /> : <PauseCircle className="w-3 h-3" />}
                Stop Loop
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function GodFactoryRightPanel({ codebaseReady, codebaseTree, projectRoot, projectId, projectName, onSendToBrainstorm }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [notifications, setNotifications] = useState<IntelNotification[]>([]);
  const [idleSuggestions, setIdleSuggestions] = useState<IdleSuggestion[]>([]);
  const [modelHealth, setModelHealth] = useState<ModelHealthRecord[]>([]);
  const [modelStrategy, setModelStrategy] = useState<ModelStrategySnapshot | null>(null);
  const [codebaseHealth, setCodebaseHealth] = useState<CodebaseHealthPayload | null>(null);
  const [backgroundStatus, setBackgroundStatus] = useState<BackgroundStatusPayload | null>(null);
  const [selectedNotification, setSelectedNotification] = useState<NotificationDetailResponse | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelHealthDetailResponse | null>(null);
  const [recentActions, setRecentActions] = useState<GodFactoryActionRecord[]>([]);
  const [controlBusy, setControlBusy] = useState<string | null>(null);
  const [jobs, setJobs] = useState<SuggestedJob[]>([]);
  const [externalJobs, setExternalJobs] = useState<SuggestedJob[]>([]);
  const [implementingJobs, setImplementingJobs] = useState<ImplementingJob[]>([]);
  const [siliconDashboard, setSiliconDashboard] = useState<SiliconFactoryDashboard | null>(null);
  const [siliconBusy, setSiliconBusy] = useState<string | null>(null);
  const [siliconTaskInput, setSiliconTaskInput] = useState('');
  const [siliconLockKey, setSiliconLockKey] = useState('codebase:main');
  const [siliconSymbolInput, setSiliconSymbolInput] = useState('');
  const [siliconSemanticQuery, setSiliconSemanticQuery] = useState('');
  const [siliconTestTarget, setSiliconTestTarget] = useState('');
  const [siliconTestMode, setSiliconTestMode] = useState<'symbol' | 'file'>('symbol');
  const [totalJobs, setTotalJobs] = useState(0);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [brainstorm, setBrainstorm] = useState('');
  const [brainstormConfirm, setBrainstormConfirm] = useState<string | null>(null);
  const [sections, setSections] = useState({ notifications: true, idleSuggestions: true, jobs: true, externalProjects: false, implementingPipeline: false, health: true, modelCycle: true, modelHealth: true, background: false, subsystems: false, siliconFactory: false, brainstorm: false, employer: false });
  const [blameStats, setBlameStats] = useState<any[]>([]);
  const [workingModels, setWorkingModels] = useState<WorkingModelProbe[]>([]);
  const [blameRegistry, setBlameRegistry] = useState<BlameRegistryModel[]>([]);
  const [strategyBusy, setStrategyBusy] = useState<string | null>(null);
  const [lastCycleSummary, setLastCycleSummary] = useState<string>('Not applied yet');
  const [subsystems, setSubsystems] = useState<Record<SubsystemId, SubsystemConfig>>({
    ide_codebase_crawler: { enabled: true, idleEnabled: true, idleIntervalSec: 60, maxDepth: 5, manualOnly: false },
    project_state_crawler: { enabled: true, idleEnabled: true, idleIntervalSec: 90, maxDepth: 5, manualOnly: false },
    suggested_jobs_crawler: { enabled: true, idleEnabled: true, idleIntervalSec: 120, maxDepth: 4, manualOnly: false },
    gap_analysis: { enabled: true, idleEnabled: true, idleIntervalSec: 180, maxDepth: 4, manualOnly: false },
    god_factory_idle_scan: { enabled: true, idleEnabled: true, idleIntervalSec: 600, maxDepth: 1, manualOnly: false },
  });
  const [subsystemStatus, setSubsystemStatus] = useState<Record<SubsystemId, SubsystemRuntime>>({
    ide_codebase_crawler: {},
    project_state_crawler: {},
    suggested_jobs_crawler: {},
    gap_analysis: {},
    god_factory_idle_scan: {},
  });
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [runningSubsystem, setRunningSubsystem] = useState<SubsystemId | null>(null);

  // ── Auto-intelligence toggle state (localStorage-persisted) ──
  const [autoIntelEnabled, setAutoIntelEnabled] = useState(() => {
    try { return localStorage.getItem('gf_autoIntelEnabled') === '1'; } catch { return false; }
  });
  const [autoIntelExecuteJobs, setAutoIntelExecuteJobs] = useState(() => {
    try { return localStorage.getItem('gf_autoIntelExecuteJobs') === '1'; } catch { return false; }
  });
  const [autoIntelIntervalMin, setAutoIntelIntervalMin] = useState(() => {
    try { return parseInt(localStorage.getItem('gf_autoIntelIntervalMin') || '15', 10); } catch { return 15; }
  });
  const [autoIntelCountdown, setAutoIntelCountdown] = useState(0);
  const [autoIntelBusy, setAutoIntelBusy] = useState(false);
  const [autoIntelLastRun, setAutoIntelLastRun] = useState<string | null>(null);
  const [autoIntelError, setAutoIntelError] = useState<string | null>(null);
  const [autoIntelFailCount, setAutoIntelFailCount] = useState(0);

// ── Rate usage state (server-aggregated via /api/blame/usage-summary) ──
  const [rateUsage, setRateUsage] = useState<Array<{ model: string; count: number; limitEst: number; usagePct?: number; status?: string }>>([]); 

  // ── Employer Crawler state ──
  type EmployerSuggestion = { model_id: string; recommended_role: string; role_confidence: number; task_types: string; avoid_task_types: string; retirement_recommended: number; sample_count: number; success_rate: number; cooldown_override_type?: string };
  const [employerSuggestions, setEmployerSuggestions] = useState<EmployerSuggestion[]>([]);
  const [employerStatus, setEmployerStatus] = useState<{ last_cycle: number; models_analyzed: number; pending_retirement: number; active_cooldown_overrides: number } | null>(null);
  const [employerAnalyzing, setEmployerAnalyzing] = useState(false);
  const [cooldownBusy, setCooldownBusy] = useState<string | null>(null);

  // ── Notification action busy state ──
  const [notifActionBusy, setNotifActionBusy] = useState<string | null>(null);
  const readyNoticeShownRef = useRef(false);
  const chatSelectedModel = useChatStore((s) => s.selectedModel);

  const loadQueue = useCallback(() => {
    fetch(`${API_BASE}/api/god-factory/queue?limit=20`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { notifications?: Array<Record<string, unknown>> } | null) => {
        if (!d?.notifications) return;
        const mapped = d.notifications.map((n) => ({
          id: String(n.notification_id || ''),
          type: (String(n.severity || 'info') as IntelNotification['type']),
          message: String(n.natural_language_summary || ''),
          timestamp: String(n.timestamp || new Date().toISOString()),
          source: String(n.category || 'god_factory').replace(/_/g, ' '),
          category: String(n.category || ''),
          subsystem: mapCategoryToSubsystem(String(n.category || '')),
        }));
        setNotifications(mapped);
      })
      .catch(() => {});
  }, []);

  const loadIdleSuggestions = useCallback(() => {
    fetch(`${API_BASE}/api/god-factory/idle-suggestions?limit=10`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { suggestions?: IdleSuggestion[] } | null) => {
        if (d?.suggestions) setIdleSuggestions(d.suggestions);
      })
      .catch(() => {});
  }, []);

  const loadModelHealth = useCallback(() => {
    fetch(`${API_BASE}/api/god-factory/model-health?limit=8`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { models?: ModelHealthRecord[] } | null) => {
        if (d?.models) setModelHealth(d.models);
      })
      .catch(() => {});
  }, []);

  const loadModelStrategy = useCallback(() => {
    fetch(`${API_BASE}/api/model-strategy`)
      .then(r => r.ok ? r.json() : null)
      .then((d: ModelStrategySnapshot | null) => {
        if (d?.settings) setModelStrategy(d);
      })
      .catch(() => {});
  }, []);

  const loadBackgroundStatus = useCallback(() => {
    fetch(`${API_BASE}/api/god-factory/background-status`)
      .then(r => r.ok ? r.json() : null)
      .then((d: BackgroundStatusPayload | null) => {
        if (d) setBackgroundStatus(d);
      })
      .catch(() => {});
  }, []);

  const loadCodebaseHealth = useCallback(() => {
    fetch(`${API_BASE}/api/god-factory/codebase-health`)
      .then(r => r.ok ? r.json() : null)
      .then((d: CodebaseHealthPayload | null) => {
        if (d) setCodebaseHealth(d);
      })
      .catch(() => {});
  }, []);

  const loadRecentActions = useCallback(() => {
    fetch(`${API_BASE}/api/god-factory/actions?limit=8`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { actions?: GodFactoryActionRecord[] } | null) => {
        if (d?.actions) setRecentActions(d.actions);
      })
      .catch(() => {});
  }, []);

  const loadSiliconDashboard = useCallback(() => {
    fetch(`${API_BASE}/api/silicon-factory/dashboard`)
      .then(r => r.ok ? r.json() : null)
      .then((d: SiliconFactoryDashboard | null) => {
        if (d) setSiliconDashboard(d);
      })
      .catch(() => {});
  }, []);

  const loadSuggestedJobs = useCallback(() => {
    setJobsLoading(true);
    const qp = new URLSearchParams({ limit: '50', status: 'suggested' });
    fetch(`${API_BASE}/api/suggested-jobs/jobs?${qp.toString()}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { jobs?: Record<string, unknown>[]; total?: number } | null) => {
        if (d?.jobs) {
          const mapped = d.jobs.map(mapApiJobToSuggestedJob);
          const internalJobs = mapped.filter(job => job.scope === 'internal');
          setJobs(internalJobs.slice(0, 10));
          setTotalJobs(internalJobs.length);
        }
      })
      .catch(() => {})
      .finally(() => setJobsLoading(false));
  }, []);

  // ── Rate usage loader (uses /api/blame/usage-summary server-side aggregation) ──
  const loadRateUsage = useCallback(() => {
    fetch(`${API_BASE}/api/blame/usage-summary?window=3600&top=8`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { models?: Array<{ model: string; count: number; limitEst: number; usagePct: number; status: string }> } | null) => {
        if (!d?.models?.length) return;
        setRateUsage(d.models);
      })
      .catch(() => {});
  }, []);

  const loadBlameRegistry = useCallback(() => {
    fetch(`${API_BASE}/api/blame/registry`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { models?: BlameRegistryModel[] } | null) => {
        if (d?.models) setBlameRegistry(d.models);
      })
      .catch(() => {});
  }, []);

  const probeWorkingModels = useCallback(async () => {
    setStrategyBusy('probe');
    try {
      const res = await fetch(`${API_BASE}/api/models/bulk-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'github', max: 20, timeoutMs: 15000 }),
      });
      const data = await res.json().catch(() => ({} as any));
      const raw = Array.isArray(data?.results) ? data.results : [];
      const good = raw
        .filter((r: any) => r?.ok && (r?.classification || 'working') !== 'failed')
        .map((r: any) => ({
          model: String(r.model || ''),
          provider: String(r.provider || ''),
          latencyMs: typeof r.latencyMs === 'number' ? r.latencyMs : undefined,
          classification: typeof r.classification === 'string' ? r.classification : 'working',
        }))
        .filter((r: WorkingModelProbe) => r.model)
        .sort((a: WorkingModelProbe, b: WorkingModelProbe) => (a.latencyMs ?? 1e9) - (b.latencyMs ?? 1e9));

      setWorkingModels(good);
      setLastCycleSummary(good.length
        ? `Loaded ${good.length} working GitHub models`
        : 'Bulk test returned no working GitHub models');
    } catch {
      setLastCycleSummary('Model probe failed');
    } finally {
      setStrategyBusy(null);
    }
  }, []);

  const applyIntelligentCycle = useCallback(async () => {
    setStrategyBusy('apply');
    try {
      const candidateIds = (workingModels.length ? workingModels.map(m => m.model) : modelHealth.map(m => m.model_id))
        .filter(Boolean);
      const uniqueCandidates = Array.from(new Set(candidateIds));
      if (uniqueCandidates.length === 0) {
        setLastCycleSummary('No model candidates available to apply');
        return;
      }

      const usageByModel = new Map(rateUsage.map(r => [r.model, r.usagePct ?? Math.min(100, Math.round((r.count / Math.max(1, r.limitEst)) * 100))]));
      const healthByModel = new Map(modelHealth.map(h => [h.model_id, h]));
      const employerByModel = new Map(employerSuggestions.map(s => [s.model_id, s]));
      const blameByModel = new Map(blameRegistry.map(r => [r.modelId || r.model || '', r]));

      const scored = uniqueCandidates.map(modelId => {
        const health = healthByModel.get(modelId);
        const usage = usageByModel.get(modelId) ?? 0;
        const employer = employerByModel.get(modelId);
        const blame = blameByModel.get(modelId);
        const role = (employer?.recommended_role || '').toLowerCase();
        const action = (blame?.strategyConfig?.action || '').toLowerCase();

        let score = 0;
        score += (health?.composite_quality_score ?? 0.65) * 100;
        score += (health?.success_rate ?? 0.65) * 30;
        score -= usage * 0.35;
        if (role.includes('architect')) score += 7;
        if (role.includes('implementer')) score += 4;
        if (action.includes('promote')) score += 6;
        if (action.includes('deprioritize') || action.includes('retire')) score -= 12;

        return { modelId, score };
      }).sort((a, b) => b.score - a.score);

      const primaryModel = scored[0]?.modelId;
      const fallbackModels = scored.slice(1, 9).map(s => s.modelId);
      const blockedModels = blameRegistry
        .filter(r => {
          const action = (r.strategyConfig?.action || '').toLowerCase();
          return action.includes('retire') || action.includes('deprioritize') || action.includes('block');
        })
        .map(r => r.modelId || r.model || '')
        .filter(Boolean);

      if (!primaryModel) {
        setLastCycleSummary('Could not determine a primary model');
        return;
      }

      await fetch(`${API_BASE}/api/model-strategy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          presetId: 'intel-auto-cycle',
          primaryModel,
          fallbackModels,
          blockedModels: Array.from(new Set(blockedModels)).slice(0, 12),
          cleanupFailedModels: true,
        }),
      });

      setLastCycleSummary(`Applied cycle: ${primaryModel} + ${fallbackModels.length} fallback(s)`);
      loadModelStrategy();
    } catch {
      setLastCycleSummary('Failed to apply intelligent cycle');
    } finally {
      setStrategyBusy(null);
    }
  }, [workingModels, modelHealth, rateUsage, employerSuggestions, blameRegistry, loadModelStrategy]);

  // ── Employer Crawler loaders ──
  const loadEmployerStatus = useCallback(() => {
    fetch(`${API_BASE}/api/employer/status`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setEmployerStatus(d); })
      .catch(() => {});
  }, []);

  const loadEmployerSuggestions = useCallback(() => {
    fetch(`${API_BASE}/api/employer/suggestions?limit=20`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { suggestions?: EmployerSuggestion[] } | null) => {
        if (d?.suggestions) setEmployerSuggestions(d.suggestions);
      })
      .catch(() => {});
  }, []);

  const runEmployerAnalysis = useCallback(async () => {
    setEmployerAnalyzing(true);
    try {
      await fetch(`${API_BASE}/api/employer/analyze`, { method: 'POST' });
      loadEmployerStatus();
      loadEmployerSuggestions();
    } finally {
      setEmployerAnalyzing(false);
    }
  }, [loadEmployerStatus, loadEmployerSuggestions]);

  const injectCooldown = useCallback(async (modelId: string, type: 'cooldown' | 'skip' | 'sleep' | 'clear', durationSec?: number) => {
    setCooldownBusy(modelId);
    try {
      await fetch(`${API_BASE}/api/employer/cooldowns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: modelId, type, duration_sec: durationSec ?? 3600, reason: 'Manual override from Intel Panel' }),
      });
      loadRateUsage();
      loadEmployerStatus();
    } finally {
      setCooldownBusy(null);
    }
  }, [loadRateUsage, loadEmployerStatus]);

  const retireModel = useCallback(async (modelId: string) => {
    if (!window.confirm(`Mark ${modelId} for retirement? A suggested job will be created to remove it.`)) return;
    await fetch(`${API_BASE}/api/employer/retire/${encodeURIComponent(modelId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Retired from Intel Panel by user' }),
    });
    loadEmployerStatus();
    loadEmployerSuggestions();
  }, [loadEmployerStatus, loadEmployerSuggestions]);

  const loadExternalJobs = useCallback(() => {
    const qp = new URLSearchParams({ limit: '10', category: 'external_project' });
    fetch(`${API_BASE}/api/suggested-jobs/jobs?${qp.toString()}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { jobs?: Record<string, unknown>[] } | null) => {
        if (d?.jobs) setExternalJobs(d.jobs.map(mapApiJobToSuggestedJob));
      })
      .catch(() => {});
  }, []);

  const loadImplementingJobs = useCallback(() => {
    const qp = new URLSearchParams({ limit: '5', status: 'implementing' });
    if (projectId) qp.set('project_id', projectId);
    fetch(`${API_BASE}/api/suggested-jobs/jobs?${qp.toString()}`)
      .then(r => r.ok ? r.json() : null)
      .then(async (d: { jobs?: Record<string, unknown>[] } | null) => {
        if (!d?.jobs?.length) { setImplementingJobs([]); return; }
        const details = await Promise.all(
          d.jobs.map(async (j) => {
            const jobId = String(j.job_id || '');
            const res = await fetch(`${API_BASE}/api/god-factory/implementation-pipeline/${encodeURIComponent(jobId)}`).catch(() => null);
            if (!res || !res.ok) return null;
            return res.json() as Promise<ImplementingJob>;
          })
        );
        setImplementingJobs(details.filter((x): x is ImplementingJob => x !== null));
      })
      .catch(() => {});
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    let jobsTimer: number | undefined;
    let gfTimer: number | undefined;
    let refreshTimer: number | undefined;

    const waitForApiReady = async () => {
      const maxAttempts = 8;
      for (let i = 0; i < maxAttempts && !cancelled; i++) {
        try {
          const res = await fetch(`${API_BASE}/api/health`);
          if (res.ok) return true;
        } catch {
          // Retry until server is up.
        }
        await new Promise((resolve) => window.setTimeout(resolve, 700));
      }
      return false;
    };

    const loadSubsystemSettings = () => fetch(`${API_BASE}/api/subsystems/settings`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.settings) setSubsystems(d.settings);
        if (d?.status) setSubsystemStatus(d.status);
        if (d?.scheduler) setSchedulerStatus(d.scheduler);
      })
      .catch(() => {});

    (async () => {
      const ready = await waitForApiReady();
      if (!ready || cancelled) return;

      fetch(`${API_BASE}/api/blame/records?limit=5`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.stats) setBlameStats(d.stats.slice(0, 4)); })
        .catch(() => {});

      // Load real suggested jobs
      loadSuggestedJobs();
      loadExternalJobs();
      loadImplementingJobs();
      loadQueue();
      loadIdleSuggestions();
      loadModelHealth();
      loadModelStrategy();
      loadCodebaseHealth();
      loadBackgroundStatus();
      loadRecentActions();
      loadSiliconDashboard();
      loadRateUsage();
      loadEmployerStatus();
      loadEmployerSuggestions();
      loadBlameRegistry();

      jobsTimer = window.setInterval(() => {
        loadSuggestedJobs();
        loadExternalJobs();
        loadImplementingJobs();
      }, 30_000);
      gfTimer = window.setInterval(() => {
        loadQueue();
        loadIdleSuggestions();
        loadModelHealth();
        loadModelStrategy();
        loadCodebaseHealth();
        loadBackgroundStatus();
        loadRecentActions();
        loadSiliconDashboard();
        loadRateUsage();
        loadEmployerStatus();
        loadBlameRegistry();
      }, 20_000);

      void loadSubsystemSettings();
      refreshTimer = window.setInterval(() => {
        void loadSubsystemSettings();
      }, 15000);
    })();

    if (codebaseReady && !readyNoticeShownRef.current) {
      readyNoticeShownRef.current = true;
      try { sessionStorage.setItem(GF_READY_NOTICE_KEY, '1'); } catch {}
      setNotifications(prev => [{
        id: `codebase-${Date.now()}`,
        type: 'success' as const,
        source: 'interactive state',
        message: 'Codebase snapshot loaded and God Factory interactive state is active.',
        timestamp: new Date().toISOString(),
      }, ...prev].slice(0, 20));
    }

    return () => {
      cancelled = true;
      if (refreshTimer) window.clearInterval(refreshTimer);
      if (jobsTimer) window.clearInterval(jobsTimer);
      if (gfTimer) window.clearInterval(gfTimer);
    };
  }, [codebaseReady, loadSuggestedJobs, loadExternalJobs, loadImplementingJobs, loadQueue, loadIdleSuggestions, loadModelHealth, loadModelStrategy, loadCodebaseHealth, loadBackgroundStatus, loadRecentActions, loadSiliconDashboard, loadRateUsage, loadEmployerStatus, loadEmployerSuggestions, loadBlameRegistry]);

  // ── Persist auto-intel settings to localStorage ──
  useEffect(() => { try { localStorage.setItem('gf_autoIntelEnabled', autoIntelEnabled ? '1' : '0'); } catch {} }, [autoIntelEnabled]);
  useEffect(() => { try { localStorage.setItem('gf_autoIntelExecuteJobs', autoIntelExecuteJobs ? '1' : '0'); } catch {} }, [autoIntelExecuteJobs]);
  useEffect(() => { try { localStorage.setItem('gf_autoIntelIntervalMin', String(autoIntelIntervalMin)); } catch {} }, [autoIntelIntervalMin]);
  useEffect(() => {
    try {
      readyNoticeShownRef.current = sessionStorage.getItem(GF_READY_NOTICE_KEY) === '1';
    } catch {
      readyNoticeShownRef.current = false;
    }
  }, []);

  const toggleSection = (key: keyof typeof sections) =>
    setSections(prev => ({ ...prev, [key]: !prev[key] }));

  const updateSubsystem = (id: SubsystemId, patch: Partial<SubsystemConfig>) => {
    const next = { ...subsystems, [id]: { ...subsystems[id], ...patch } };
    setSubsystems(next);
    fetch(`${API_BASE}/api/subsystems/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [id]: next[id] }),
    })
      .then(() => fetch(`${API_BASE}/api/subsystems/settings`))
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.status) setSubsystemStatus(d.status);
        if (d?.scheduler) setSchedulerStatus(d.scheduler);
      })
      .catch(() => {});
  };

  const runSubsystem = async (id: SubsystemId) => {
    setRunningSubsystem(id);
    try {
      const runPayload: Record<string, any> = {
        subsystem: id,
        depth: subsystems[id].maxDepth,
      };
      if (id === 'project_state_crawler') {
        if (projectRoot) runPayload.projectRoot = projectRoot;
        if (projectId) runPayload.projectId = projectId;
        if (projectName) runPayload.projectName = projectName;
      }

      const res = await fetch(`${API_BASE}/api/subsystems/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(runPayload),
      });
      const data = await res.json();
      const summary = data?.result?.summary || data?.error || 'Run complete';
      setNotifications(prev => [{
        id: `${Date.now()}`,
        type: (data.success ? 'info' : 'error') as IntelNotification['type'],
        source: id,
        message: summary,
        timestamp: new Date().toISOString(),
      }, ...prev].slice(0, 12));

      if (id === 'suggested_jobs_crawler' && data?.result?.suggestedJobs?.length) {
        const incoming = data.result.suggestedJobs as SuggestedJob[];
        setJobs(prev => [...incoming, ...prev].slice(0, 30));
      }

      const settingsRes = await fetch(`${API_BASE}/api/subsystems/settings`);
      const settingsData = settingsRes.ok ? await settingsRes.json() : null;
      if (settingsData?.status) setSubsystemStatus(settingsData.status);
      if (settingsData?.scheduler) setSchedulerStatus(settingsData.scheduler);
    } catch (err: any) {
      setNotifications(prev => [{
        id: `${Date.now()}`,
        type: 'error' as IntelNotification['type'],
        source: id,
        message: `Run failed: ${err.message}`,
        timestamp: new Date().toISOString(),
      }, ...prev].slice(0, 12));
    } finally {
      setRunningSubsystem(null);
    }
  };

  const runSiliconControl = async (action: 'pause' | 'resume') => {
    setSiliconBusy(action);
    try {
      await fetch(`${API_BASE}/api/silicon-factory/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      loadSiliconDashboard();
    } catch {
      // no-op
    } finally {
      setSiliconBusy(null);
    }
  };

  const enqueueSiliconTask = async () => {
    const instruction = siliconTaskInput.trim();
    if (!instruction) return;
    setSiliconBusy('enqueue');
    try {
      const res = await fetch(`${API_BASE}/api/silicon-factory/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction, agent_type: 'coder' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotifications(prev => [{
          id: `${Date.now()}-silicon-err`,
          type: 'warning' as const,
          source: 'silicon factory',
          message: data?.ambiguity?.clarification_request || data?.error || 'Could not enqueue task',
          timestamp: new Date().toISOString(),
        }, ...prev].slice(0, 20));
      } else {
        setSiliconTaskInput('');
      }
      loadSiliconDashboard();
    } catch {
      // no-op
    } finally {
      setSiliconBusy(null);
    }
  };

  const runSiliconColdBoot = async () => {
    setSiliconBusy('resume');
    try {
      await fetch(`${API_BASE}/api/silicon-factory/cold-boot-resume`, {
        method: 'POST',
      });
      loadSiliconDashboard();
    } catch {
      // no-op
    } finally {
      setSiliconBusy(null);
    }
  };

  const runSiliconSnapshot = async () => {
    setSiliconBusy('snapshot');
    try {
      await fetch(`${API_BASE}/api/silicon-factory/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'manual_gui_snapshot' }),
      });
      loadSiliconDashboard();
    } catch {
      // no-op
    } finally {
      setSiliconBusy(null);
    }
  };

  const runSiliconLock = async (action: 'acquire' | 'release') => {
    if (!siliconLockKey.trim()) return;
    setSiliconBusy(`lock_${action}`);
    try {
      const endpoint = action === 'acquire' ? 'acquire' : 'release';
      const body = action === 'acquire'
        ? { lock_key: siliconLockKey.trim(), owner_agent: 'god_factory_ui', ttl_seconds: 180 }
        : { lock_key: siliconLockKey.trim(), owner_agent: 'god_factory_ui' };
      await fetch(`${API_BASE}/api/silicon-factory/locks/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      loadSiliconDashboard();
    } catch {
      // no-op
    } finally {
      setSiliconBusy(null);
    }
  };

  const runSiliconSpecValidate = async () => {
    const code = siliconTaskInput.trim();
    if (!code) return;
    setSiliconBusy('validate');
    try {
      const res = await fetch(`${API_BASE}/api/silicon-factory/validate-requirements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, fail_task_on_violation: false }),
      });
      const data = await res.json().catch(() => ({}));
      setNotifications(prev => [{
        id: `${Date.now()}-silicon-validate`,
        type: (data?.pass ? 'success' : 'warning') as IntelNotification['type'],
        source: 'silicon factory',
        message: data?.pass ? 'Spec contract check passed for current draft.' : `Spec contract violations: ${(data?.violated_requirements || []).join(', ') || 'unknown'}`,
        timestamp: new Date().toISOString(),
      }, ...prev].slice(0, 20));
    } catch {
      // no-op
    } finally {
      setSiliconBusy(null);
    }
  };

  const runSiliconIapPing = async () => {
    setSiliconBusy('iap');
    try {
      await fetch(`${API_BASE}/api/silicon-factory/iap/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_agent: 'god_factory_ui',
          to_agent: 'architect',
          message_type: 'heartbeat_ping',
          payload: { issued_at: new Date().toISOString(), note: 'ui_ping' },
        }),
      });
      loadSiliconDashboard();
    } catch {
      // no-op
    } finally {
      setSiliconBusy(null);
    }
  };

  const syncSiliconProjectContext = async () => {
    setSiliconBusy('project_context');
    try {
      await fetch(`${API_BASE}/api/silicon-factory/project-context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          project_root: projectRoot,
        }),
      });
      loadSiliconDashboard();
      setNotifications(prev => [{
        id: `${Date.now()}-silicon-project-context`,
        type: 'success' as const,
        source: 'silicon factory',
        message: 'Silicon active project context synced from current workspace.',
        timestamp: new Date().toISOString(),
      }, ...prev].slice(0, 20));
    } catch {
      // no-op
    } finally {
      setSiliconBusy(null);
    }
  };

  const runSiliconSemanticFind = async () => {
    const query = siliconSemanticQuery.trim();
    if (!query) return;
    setSiliconBusy('semantic_find');
    try {
      const qp = new URLSearchParams({ query });
      if (projectId) qp.set('project_id', projectId);
      qp.set('limit', '6');
      const res = await fetch(`${API_BASE}/api/silicon-factory/semantic-find?${qp.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotifications(prev => [{
          id: `${Date.now()}-silicon-semantic-err`,
          type: 'warning' as const,
          source: 'silicon factory',
          message: data?.error || 'Semantic find failed',
          timestamp: new Date().toISOString(),
        }, ...prev].slice(0, 20));
        return;
      }

      const results = Array.isArray(data?.results) ? data.results : [];
      setNotifications(prev => [{
        id: `${Date.now()}-silicon-semantic-ok`,
        type: 'info' as const,
        source: 'silicon factory',
        message: `Semantic search found ${results.length} match${results.length === 1 ? '' : 'es'} for "${query}".`,
        timestamp: new Date().toISOString(),
      }, ...prev].slice(0, 20));

      if (results.length) {
        onSendToBrainstorm(`Silicon semantic results for "${query}":\n\n${JSON.stringify(results, null, 2)}`);
      }
    } catch {
      // no-op
    } finally {
      setSiliconBusy(null);
    }
  };

  const runSiliconSymbolRead = async (readType: 'signature' | 'function' | 'class_api' | 'struct') => {
    const symbol = siliconSymbolInput.trim();
    if (!symbol) return;
    setSiliconBusy(`symbol_${readType}`);
    try {
      const qp = new URLSearchParams({ symbol_name: symbol, read_type: readType });
      if (projectId) qp.set('project_id', projectId);
      const res = await fetch(`${API_BASE}/api/silicon-factory/symbol-read?${qp.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotifications(prev => [{
          id: `${Date.now()}-silicon-symbol-err`,
          type: 'warning' as const,
          source: 'silicon factory',
          message: data?.error || `Could not read symbol ${symbol}`,
          timestamp: new Date().toISOString(),
        }, ...prev].slice(0, 20));
        return;
      }
      onSendToBrainstorm(`Silicon symbol read (${readType}) for ${symbol}:\n\n${JSON.stringify(data, null, 2)}`);
    } catch {
      // no-op
    } finally {
      setSiliconBusy(null);
    }
  };

  const runSiliconTaskContext = async () => {
    const latestTaskId = siliconDashboard?.recent_tasks?.[0]?.id;
    if (!latestTaskId) return;
    setSiliconBusy('task_context');
    try {
      const res = await fetch(`${API_BASE}/api/silicon-factory/task-context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: latestTaskId,
          project_id: projectId,
          budget_tokens: 2000,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotifications(prev => [{
          id: `${Date.now()}-silicon-task-context-err`,
          type: 'warning' as const,
          source: 'silicon factory',
          message: data?.error || 'Task context build failed',
          timestamp: new Date().toISOString(),
        }, ...prev].slice(0, 20));
        return;
      }
      onSendToBrainstorm(`Silicon task context for ${latestTaskId}:\n\n${data.context || ''}`);
      setNotifications(prev => [{
        id: `${Date.now()}-silicon-task-context-ok`,
        type: 'success' as const,
        source: 'silicon factory',
        message: `Built task context for ${latestTaskId} using ${data.used_tokens || 0}/${data.budget_tokens || 0} tokens.`,
        timestamp: new Date().toISOString(),
      }, ...prev].slice(0, 20));
    } catch {
      // no-op
    } finally {
      setSiliconBusy(null);
    }
  };

  const treeLineCount = codebaseTree.split('\n').length;

  const runTestDiscovery = async () => {
    const target = siliconTestTarget.trim();
    if (!target) return;
    setSiliconBusy('test_discovery');
    try {
      const sp = new URLSearchParams();
      sp.set(siliconTestMode === 'symbol' ? 'symbol' : 'file_path', target);
      if (projectId) sp.set('project_id', projectId);
      const res = await fetch(`${API_BASE}/api/silicon-factory/test-discovery?${sp}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotifications(prev => [{
          id: `${Date.now()}-silicon-test-disc-err`,
          type: 'warning' as const,
          source: 'silicon factory',
          message: data?.error || 'Test discovery failed',
          timestamp: new Date().toISOString(),
        }, ...prev].slice(0, 20));
        return;
      }
      const count = data.total ?? 0;
      onSendToBrainstorm(`Test discovery for ${siliconTestMode}="${target}" (${count} results):\n\n${JSON.stringify(data.results, null, 2)}`);
      setNotifications(prev => [{
        id: `${Date.now()}-silicon-test-disc-ok`,
        type: 'success' as const,
        source: 'silicon factory',
        message: `Found ${count} test(s) for ${siliconTestMode} "${target}".`,
        timestamp: new Date().toISOString(),
      }, ...prev].slice(0, 20));
    } catch {
      // no-op
    } finally {
      setSiliconBusy(null);
    }
  };

  const runReindexTests = async () => {
    setSiliconBusy('reindex_tests');
    try {
      const res = await fetch(`${API_BASE}/api/silicon-factory/reindex-tests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotifications(prev => [{
          id: `${Date.now()}-silicon-reindex-tests-err`,
          type: 'warning' as const,
          source: 'silicon factory',
          message: data?.error || 'Test reindex failed',
          timestamp: new Date().toISOString(),
        }, ...prev].slice(0, 20));
        return;
      }
      setNotifications(prev => [{
        id: `${Date.now()}-silicon-reindex-tests-ok`,
        type: 'success' as const,
        source: 'silicon factory',
        message: `Test index rebuilt: ${data.indexed ?? 0} entries from ${data.test_files_found ?? 0} test files.`,
        timestamp: new Date().toISOString(),
      }, ...prev].slice(0, 20));
    } catch {
      // no-op
    } finally {
      setSiliconBusy(null);
    }
  };

  const runReindexEmbeddings = async () => {
    setSiliconBusy('reindex_embeddings');
    try {
      const res = await fetch(`${API_BASE}/api/silicon-factory/reindex-embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotifications(prev => [{
          id: `${Date.now()}-silicon-reindex-emb-err`,
          type: 'warning' as const,
          source: 'silicon factory',
          message: data?.error || 'Embedding reindex failed',
          timestamp: new Date().toISOString(),
        }, ...prev].slice(0, 20));
        return;
      }
      setNotifications(prev => [{
        id: `${Date.now()}-silicon-reindex-emb-ok`,
        type: 'success' as const,
        source: 'silicon factory',
        message: `Symbol embeddings rebuilt: ${data.updated ?? 0} symbols indexed.`,
        timestamp: new Date().toISOString(),
      }, ...prev].slice(0, 20));
    } catch {
      // no-op
    } finally {
      setSiliconBusy(null);
    }
  };

  const archiveJob = async (jobId: string) => {
    await fetch(`${API_BASE}/api/suggested-jobs/jobs/${jobId}/archive`, { method: 'POST' }).catch(() => {});
    setJobs(prev => prev.filter(j => j.job_id !== jobId));
    setTotalJobs(prev => Math.max(0, prev - 1));
  };

  const implementJob = async (job: SuggestedJob) => {
    onSendToBrainstorm(`Implement this suggested job:\n\n**${job.title}**\n\nCategory: ${job.category}\nAffected devtags: ${job.affected_devtags.join(', ') || 'none'}\nAffected files: ${job.affected_files.join(', ') || 'none'}\nAtomic steps: ${job.atomic_steps.length}\n\nJob ID: ${job.job_id}`);
    await fetch(`${API_BASE}/api/suggested-jobs/jobs/${job.job_id}/implement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ override_sandbox: true }),
    }).catch(() => {});
    loadSuggestedJobs();
  };

  const priorityColor = (p: SuggestedJob['priority']) =>
    p === 'critical' ? 'text-red-400 bg-red-500/15 border border-red-500/30' :
    p === 'high'     ? 'text-orange-400 bg-orange-400/10' :
    p === 'medium'   ? 'text-yellow-400 bg-yellow-400/10' :
                       'text-green-400 bg-green-400/10';

  const notifColor = (t: IntelNotification['type']) =>
    t === 'success' ? 'text-green-400' :
    t === 'warning' ? 'text-yellow-400' :
    t === 'error'   ? 'text-red-400'   :
    t === 'critical' ? 'text-red-500'  :
    t === 'fatal'   ? 'text-red-600'   : 'text-blue-400';

  const acknowledgeNotification = async (id: string) => {
    await fetch(`${API_BASE}/api/god-factory/notifications/${id}/dismiss`, { method: 'POST' }).catch(() => {});
    setNotifications(prev => prev.filter(x => x.id !== id));
  };

  // ── Auto-intelligence pipeline trigger ──
  const runAutoIntelPipeline = useCallback(async () => {
    if (autoIntelBusy) return;
    setAutoIntelBusy(true);
    setAutoIntelError(null);
    try {
      // Step 1: flush flagged gap reports to jobs
      const flushRes = await fetch(`${API_BASE}/api/god-factory/gap-reports/flush-to-jobs`, { method: 'POST' }).catch(() => null);
      if (!flushRes || !flushRes.ok) throw new Error('flush-to-jobs failed');
      // Step 2: refresh God Factory signals
      await fetch(`${API_BASE}/api/god-factory/signals`, { method: 'GET' }).catch(() => null);
      // Step 3: reload queue and jobs
      loadQueue();
      loadSuggestedJobs();
      loadImplementingJobs();
      loadBackgroundStatus();
      loadCodebaseHealth();

      // Step 4: optionally advance pending work through the real autonomous loop
      if (autoIntelExecuteJobs) {
        if (!projectId) {
          throw new Error('Auto-run queued jobs requires an active project selection.');
        }

        const loopStatusRes = await fetch(`${API_BASE}/api/god-factory/loop/status`);
        const loopStatus = loopStatusRes.ok
          ? await loopStatusRes.json() as { isRunning?: boolean; pendingJobs?: number }
          : null;

        if (loopStatus && !loopStatus.isRunning && (loopStatus.pendingJobs || 0) > 0) {
          const startRes = await fetch(`${API_BASE}/api/god-factory/loop/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId,
              model: chatSelectedModel,
              maxIterations: 0,
              jobMaxIterations: 50,
              autoApproveChanges: false,
              autoAnswerQuestions: false,
              checkpointEvery: 5,
            }),
          });

          if (!startRes.ok) {
            const startData = await startRes.json().catch(() => null) as { error?: string } | null;
            throw new Error(startData?.error || 'Failed to start the God Factory loop.');
          }

          loadImplementingJobs();
          loadBackgroundStatus();
        }
      }

      setAutoIntelLastRun(new Date().toISOString());
      setAutoIntelFailCount(0);
      setAutoIntelCountdown(autoIntelIntervalMin * 60);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'pipeline error';
      setAutoIntelError(msg);
      setAutoIntelFailCount(prev => prev + 1);
      if (autoIntelFailCount + 1 >= 3) {
        setAutoIntelEnabled(false);
        setAutoIntelError(`Auto-intelligence disabled after 3 consecutive failures. Last error: ${msg}`);
      }
    } finally {
      setAutoIntelBusy(false);
    }
  }, [
    autoIntelBusy,
    autoIntelExecuteJobs,
    autoIntelFailCount,
    autoIntelIntervalMin,
    chatSelectedModel,
    loadBackgroundStatus,
    loadCodebaseHealth,
    loadImplementingJobs,
    loadQueue,
    loadSuggestedJobs,
    projectId,
  ]);

  // ── Auto-intelligence interval effect ──
  useEffect(() => {
    if (!autoIntelEnabled) { setAutoIntelCountdown(0); return; }
    setAutoIntelCountdown(autoIntelIntervalMin * 60);
    const countdownId = window.setInterval(() => {
      setAutoIntelCountdown(prev => {
        if (prev <= 1) return autoIntelIntervalMin * 60;
        return prev - 1;
      });
    }, 1000);
    const pipelineId = window.setInterval(() => {
      void runAutoIntelPipeline();
    }, autoIntelIntervalMin * 60 * 1000);
    return () => { window.clearInterval(countdownId); window.clearInterval(pipelineId); };
  }, [autoIntelEnabled, autoIntelIntervalMin, runAutoIntelPipeline]);

  // ── Notification action handlers ──
  const notifFlushToJob = async (notifId: string) => {
    setNotifActionBusy('flush');
    try {
      await fetch(`${API_BASE}/api/god-factory/gap-reports/flush-to-jobs`, { method: 'POST' });
      await acknowledgeNotification(notifId);
      loadSuggestedJobs();
      loadQueue();
    } catch { /* no-op */ }
    finally { setNotifActionBusy(null); setSelectedNotification(null); }
  };

  const notifViewModelHealth = () => {
    setSelectedNotification(null);
    setSections(prev => ({ ...prev, modelHealth: true }));
  };

  const notifAddToQueue = async (notifId: string) => {
    setNotifActionBusy('queue');
    try {
      await fetch(`${API_BASE}/api/god-factory/gap-reports/flush-to-jobs`, { method: 'POST' });
      await acknowledgeNotification(notifId);
      loadSuggestedJobs();
    } catch { /* no-op */ }
    finally { setNotifActionBusy(null); setSelectedNotification(null); }
  };

  const respondIdleSuggestion = async (suggestionId: string, response: 'accepted' | 'rejected' | 'deferred') => {
    const actionMap: Record<string, string> = { accepted: 'accept', rejected: 'reject', deferred: 'defer' };
    await fetch(`${API_BASE}/api/god-factory/idle-suggestions/${suggestionId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: actionMap[response] ?? response }),
    }).catch(() => {});

    setIdleSuggestions(prev => prev.filter(s => s.suggestion_id !== suggestionId));
    if (response === 'accepted') {
      loadSuggestedJobs();
      loadQueue();
    }
  };

  const inspectNotification = async (id: string) => {
    const res = await fetch(`${API_BASE}/api/god-factory/queue/${id}`).catch(() => null);
    const data = res && res.ok ? await res.json() as NotificationDetailResponse : null;
    if (data) setSelectedNotification(data);
  };

  const inspectModel = async (modelId: string) => {
    const res = await fetch(`${API_BASE}/api/god-factory/model-health/${encodeURIComponent(modelId)}`).catch(() => null);
    const data = res && res.ok ? await res.json() as ModelHealthDetailResponse : null;
    if (data) setSelectedModel(data);
  };

  const runControl = async (control: string, subsystemId?: SubsystemId) => {
    const busyKey = subsystemId ? `${control}:${subsystemId}` : control;
    setControlBusy(busyKey);
    try {
      await fetch(`${API_BASE}/api/god-factory/controls/background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ control, subsystem_id: subsystemId, reason: 'god_factory_gui' }),
      });
      loadBackgroundStatus();
      loadRecentActions();
      loadQueue();
    } catch {
      // noop
    } finally {
      setControlBusy(null);
    }
  };

  if (collapsed) {
    return (
      <div className="w-8 flex-shrink-0 bg-ide-panel border-l border-ide-border flex flex-col items-center pt-3">
        <button onClick={() => setCollapsed(false)} title="Expand panel"
          className="p-1 text-ide-text-dim hover:text-purple-400 rounded">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <div className="mt-4 flex flex-col gap-3 text-ide-text-dim">
          <span className="text-[8px] rotate-90 whitespace-nowrap tracking-widest">INTEL</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 flex-shrink-0 bg-ide-panel border-l border-ide-border flex flex-col overflow-hidden relative">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-ide-border flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-[11px] font-semibold text-ide-text">Intel Panel</span>
        </div>
        <button onClick={() => setCollapsed(true)} title="Collapse"
          className="p-1 text-ide-text-dim hover:text-ide-text rounded">
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      <div className="border-b border-ide-border/40 px-3 py-2 text-[9px] leading-snug bg-ide-bg/25">
        <div className="text-purple-300 font-semibold">Primary Focus: Personal IDE Internal Codebase</div>
        <div className="text-cyan-300/90 mt-0.5">External telemetry: {projectName || 'none selected'} (analysis only)</div>
      </div>

      {(selectedNotification || selectedModel) && (
        <div className="absolute inset-0 z-10 bg-ide-panel/95 backdrop-blur-sm flex flex-col border-l border-ide-border">
          <div className="flex items-center justify-between px-3 py-2 border-b border-ide-border">
            <div className="text-[11px] font-semibold text-ide-text">
              {selectedNotification ? 'Notification Detail' : 'Model Detail'}
            </div>
            <button
              onClick={() => { setSelectedNotification(null); setSelectedModel(null); }}
              className="p-1 text-ide-text-dim hover:text-ide-text"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 text-[10px] space-y-2">
            {selectedNotification && (
              <>
                <div className="rounded border border-ide-border/40 bg-ide-bg/30 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ide-text font-medium">{selectedNotification.notification.category.replace(/_/g, ' ')}</span>
                    <span className={`text-[9px] ${notifColor(selectedNotification.notification.severity as IntelNotification['type'])}`}>
                      {selectedNotification.notification.severity}
                    </span>
                  </div>
                  <div className="text-ide-text mt-1 leading-snug">{selectedNotification.notification.natural_language_summary}</div>
                  <div className="text-[9px] text-ide-text-dim mt-1">
                    {new Date(selectedNotification.notification.timestamp).toLocaleString()}
                  </div>
                </div>
                {selectedNotification.notification.summary_tags?.length > 0 && (
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-ide-text-dim mb-1">Summary Tags</div>
                    <div className="flex flex-wrap gap-1">
                      {selectedNotification.notification.summary_tags.map((tag) => (
                        <span key={tag} className="text-[9px] px-1 py-0.5 rounded bg-ide-bg text-ide-text-dim border border-ide-border/40">{tag}</span>
                      ))}
                    </div>
                  </div>
                )}
                {selectedNotification.source_detail && (
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-ide-text-dim mb-1">Decoded Source Detail</div>
                    <pre className="max-h-72 overflow-auto rounded border border-ide-border/40 bg-ide-bg/30 p-2 text-[9px] text-ide-text whitespace-pre-wrap break-all">
                      {JSON.stringify(selectedNotification.source_detail, null, 2)}
                    </pre>
                  </div>
                )}
                {/* ── Notification action controls ── */}
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-ide-text-dim mb-1">Actions</div>
                  <div className="flex flex-wrap gap-1">
                    {(() => {
                      const cat = selectedNotification.notification.category as string;
                      const id = selectedNotification.notification.notification_id;
                      const mappedSubsystem = mapCategoryToSubsystem(cat);
                      const isGapCategory = cat === 'gap_report' || cat === 'code_health' || cat === 'drift' || cat === 'regression_trend';
                      const isModelAlert = cat === 'model_behavior_alert' || cat === 'model_performance';
                      const isDebt = cat === 'debt_warning';
                      const isCritical = selectedNotification.notification.severity === 'critical' || selectedNotification.notification.severity === 'fatal';
                      return (
                        <>
                          {mappedSubsystem && (
                            <>
                              <button
                                onClick={() => void runSubsystem(mappedSubsystem)}
                                disabled={runningSubsystem === mappedSubsystem}
                                className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 disabled:opacity-40 flex items-center gap-1"
                              >
                                {runningSubsystem === mappedSubsystem ? <RefreshCw className="w-2 h-2 animate-spin" /> : <Play className="w-2 h-2" />}
                                Run Crawler
                              </button>
                              <button
                                onClick={() => void runControl(subsystems[mappedSubsystem].enabled ? 'pause_subsystem' : 'resume_subsystem', mappedSubsystem)}
                                disabled={controlBusy === `pause_subsystem:${mappedSubsystem}` || controlBusy === `resume_subsystem:${mappedSubsystem}`}
                                className="text-[9px] px-1.5 py-0.5 rounded bg-ide-border/25 text-ide-text-dim border border-ide-border/40 hover:bg-ide-border/50 disabled:opacity-40 flex items-center gap-1"
                              >
                                <SlidersHorizontal className="w-2 h-2" />
                                {subsystems[mappedSubsystem].enabled ? 'Pause Crawler' : 'Resume Crawler'}
                              </button>
                            </>
                          )}
                          {(isGapCategory || isCritical) && (
                            <button
                              onClick={() => void notifFlushToJob(id)}
                              disabled={notifActionBusy === 'flush'}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-300 border border-yellow-500/30 hover:bg-yellow-500/25 disabled:opacity-40 flex items-center gap-1"
                            >
                              {notifActionBusy === 'flush' ? <RefreshCw className="w-2 h-2 animate-spin" /> : <Zap className="w-2 h-2" />}
                              Create Job
                            </button>
                          )}
                          {isModelAlert && (
                            <button
                              onClick={notifViewModelHealth}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 hover:bg-blue-500/25 flex items-center gap-1"
                            >
                              <Shield className="w-2 h-2" /> View Model Health
                            </button>
                          )}
                          {isDebt && (
                            <button
                              onClick={() => void notifAddToQueue(id)}
                              disabled={notifActionBusy === 'queue'}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-300 border border-orange-500/30 hover:bg-orange-500/25 disabled:opacity-40 flex items-center gap-1"
                            >
                              {notifActionBusy === 'queue' ? <RefreshCw className="w-2 h-2 animate-spin" /> : <Briefcase className="w-2 h-2" />}
                              Add to Queue
                            </button>
                          )}
                          <button
                            onClick={() => void acknowledgeNotification(id).then(() => setSelectedNotification(null))}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-ide-border/30 text-ide-text-dim border border-ide-border/40 hover:bg-ide-border/50 flex items-center gap-1"
                          >
                            <X className="w-2 h-2" /> Dismiss
                          </button>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </>
            )}
            {selectedModel && (
              <>
                <div className="rounded border border-ide-border/40 bg-ide-bg/30 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ide-text font-medium">{selectedModel.model.display_name || selectedModel.model.model_id}</span>
                    <span className="text-[9px] text-ide-text-dim">{selectedModel.model.provider}</span>
                  </div>
                  <div className="text-[9px] text-ide-text-dim mt-1">{selectedModel.model.model_id}</div>
                  {!!selectedModel.model.recommended_interaction_types?.length && (
                    <div className="mt-2">
                      <div className="text-[9px] uppercase tracking-wider text-ide-text-dim mb-1">Recommended</div>
                      <div className="flex flex-wrap gap-1">
                        {selectedModel.model.recommended_interaction_types.map((item) => (
                          <span key={item} className="text-[9px] px-1 py-0.5 rounded bg-green-500/10 text-green-300 border border-green-500/20">{item}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {!!selectedModel.model.avoided_interaction_types?.length && (
                    <div className="mt-2">
                      <div className="text-[9px] uppercase tracking-wider text-ide-text-dim mb-1">Avoid</div>
                      <div className="flex flex-wrap gap-1">
                        {selectedModel.model.avoided_interaction_types.map((item) => (
                          <span key={item} className="text-[9px] px-1 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/20">{item}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-ide-text-dim mb-1">Recent Quality</div>
                  <div className="space-y-1">
                    {selectedModel.recent_quality.length === 0 ? (
                      <div className="text-[9px] text-ide-text-dim">No quality records.</div>
                    ) : selectedModel.recent_quality.map((item, index) => (
                      <div key={`${item.id || index}`} className="rounded border border-ide-border/30 bg-ide-bg/20 px-2 py-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-ide-text-dim">{String(item.interaction_type || 'unknown')}</span>
                          <span className="text-ide-text font-mono">{Math.round(Number(item.composite_quality_score || 0) * 100)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-ide-text-dim mb-1">Recent Blame</div>
                  <pre className="max-h-72 overflow-auto rounded border border-ide-border/40 bg-ide-bg/30 p-2 text-[9px] text-ide-text whitespace-pre-wrap break-all">
                    {JSON.stringify(selectedModel.recent_blame, null, 2)}
                  </pre>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* ── Auto-Intelligence Toggle ── */}
        <div className="border-b border-ide-border/50 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-purple-400" />
              <span className="text-[10px] font-semibold text-ide-text-dim">Auto-Intelligence</span>
            </div>
            <button
              onClick={() => { setAutoIntelEnabled(v => !v); setAutoIntelError(null); setAutoIntelFailCount(0); }}
              className={`relative w-8 h-4 rounded-full transition-colors ${autoIntelEnabled ? 'bg-purple-500' : 'bg-ide-border'}`}
              title={autoIntelEnabled ? 'Disable auto-intelligence pipeline' : 'Enable auto-intelligence pipeline'}
            >
              <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${autoIntelEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          </div>
          {autoIntelEnabled && (
            <div className="mt-1.5 space-y-1 text-[9px]">
              <label className="flex items-center justify-between gap-2 rounded bg-ide-bg/30 px-1.5 py-1">
                <span className="text-ide-text-dim">Auto-run queued jobs</span>
                <input
                  type="checkbox"
                  checked={autoIntelExecuteJobs}
                  onChange={e => setAutoIntelExecuteJobs(e.target.checked)}
                  className="accent-purple-400"
                />
              </label>
              <div className="flex items-center justify-between gap-2">
                <span className="text-ide-text-dim">Interval</span>
                <select
                  value={autoIntelIntervalMin}
                  onChange={e => setAutoIntelIntervalMin(Number(e.target.value))}
                  className="bg-ide-bg border border-ide-border/40 rounded px-1 text-ide-text text-[9px]"
                >
                  <option value={5}>5 min</option>
                  <option value={15}>15 min</option>
                  <option value={30}>30 min</option>
                  <option value={60}>60 min</option>
                </select>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-ide-text-dim">Next run in</span>
                <span className="text-purple-300 font-mono">
                  {autoIntelCountdown > 0 ? `${Math.floor(autoIntelCountdown / 60)}m ${autoIntelCountdown % 60}s` : '—'}
                </span>
              </div>
              {autoIntelLastRun && (
                <div className="text-ide-text-dim">Last: {new Date(autoIntelLastRun).toLocaleTimeString()}</div>
              )}
              {autoIntelExecuteJobs && !projectId && (
                <div className="text-yellow-400 leading-snug">Select an active project before auto-executing Suggested Jobs.</div>
              )}
              <button
                onClick={() => void runAutoIntelPipeline()}
                disabled={autoIntelBusy}
                className="w-full py-1 text-[9px] rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25 disabled:opacity-40 flex items-center justify-center gap-1"
              >
                {autoIntelBusy ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Zap className="w-2.5 h-2.5" />}
                Run Now
              </button>
            </div>
          )}
          {autoIntelError && (
            <div className="mt-1 text-[9px] text-red-400 leading-snug flex items-start gap-1">
              <AlertTriangle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
              <span>{autoIntelError}</span>
            </div>
          )}
        </div>

        {/* ── Notifications ── */}
        <div className="border-b border-ide-border/50">
          <button onClick={() => toggleSection('notifications')}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-ide-text-dim hover:text-ide-text hover:bg-ide-bg/30">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-yellow-400" />
              Notifications
              {notifications.length > 0 && (
                <span className="px-1 bg-yellow-400/20 text-yellow-300 rounded text-[9px]">{notifications.length}</span>
              )}
            </div>
            {sections.notifications ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {sections.notifications && (
            <div className="px-2 pb-2 space-y-1">
              {notifications.length === 0 ? (
                <div className="text-[10px] text-ide-text-dim px-1 py-2 text-center">No notifications</div>
              ) : notifications.map(n => (
                <div key={n.id} className="flex items-start gap-1.5 p-1.5 rounded bg-ide-bg/30 group">
                  <span className={`text-[10px] mt-0.5 ${notifColor(n.type)}`}>●</span>
                  <div className="flex-1 min-w-0">
                    <button onClick={() => void inspectNotification(n.id)} className="w-full text-left">
                      <div className="text-[10px] text-ide-text leading-snug">{n.message}</div>
                      <div className="text-[9px] text-ide-text-dim mt-0.5">
                        {n.source} · {new Date(n.timestamp).toLocaleTimeString()}
                      </div>
                    </button>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {n.subsystem && (
                        <>
                          <button
                            onClick={() => void runSubsystem(n.subsystem as SubsystemId)}
                            disabled={runningSubsystem === n.subsystem}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 disabled:opacity-40 flex items-center gap-1"
                          >
                            {runningSubsystem === n.subsystem ? <RefreshCw className="w-2 h-2 animate-spin" /> : <Play className="w-2 h-2" />}
                            Run
                          </button>
                          <button
                            onClick={() => void runControl(subsystems[n.subsystem as SubsystemId].enabled ? 'pause_subsystem' : 'resume_subsystem', n.subsystem as SubsystemId)}
                            disabled={controlBusy === `pause_subsystem:${n.subsystem}` || controlBusy === `resume_subsystem:${n.subsystem}`}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-ide-border/25 text-ide-text-dim border border-ide-border/40 hover:bg-ide-border/50 disabled:opacity-40"
                          >
                            {subsystems[n.subsystem as SubsystemId].enabled ? 'Pause' : 'Resume'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => void acknowledgeNotification(n.id)}
                    className="opacity-0 group-hover:opacity-100 text-ide-text-dim hover:text-red-400">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Idle Suggestions ── */}
        <div className="border-b border-ide-border/50">
          <button onClick={() => toggleSection('idleSuggestions')}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-ide-text-dim hover:text-ide-text hover:bg-ide-bg/30">
            <div className="flex items-center gap-1.5">
              <Star className="w-3 h-3 text-cyan-400" />
              Idle Suggestions
              {idleSuggestions.length > 0 && (
                <span className="px-1 bg-cyan-400/20 text-cyan-300 rounded text-[9px]">{idleSuggestions.length}</span>
              )}
            </div>
            {sections.idleSuggestions ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {sections.idleSuggestions && (
            <div className="px-2 pb-2 space-y-1.5">
              {idleSuggestions.length === 0 ? (
                <div className="text-[10px] text-ide-text-dim px-1 py-2 text-center">No pending idle suggestions</div>
              ) : idleSuggestions.map(s => (
                <div key={s.suggestion_id} className="p-1.5 rounded bg-ide-bg/30 border border-ide-border/30">
                  <div className="text-[9px] text-cyan-300 mb-0.5">{s.category.replace(/_/g, ' ')}</div>
                  <div className="text-[10px] text-ide-text leading-snug">{s.natural_language_summary}</div>
                  {!!s.source_files?.length && (
                    <div className="text-[9px] text-ide-text-dim mt-1 truncate" title={s.source_files.join(', ')}>
                      Files: {s.source_files.slice(0, 2).join(', ')}{s.source_files.length > 2 ? '…' : ''}
                    </div>
                  )}
                  {!!s.source_lines?.length && (
                    <div className="text-[9px] text-ide-text-dim mt-0.5">
                      Lines: {s.source_lines.map(([start, end]) => `${start}${end !== start ? `-${end}` : ''}`).join(', ')}
                    </div>
                  )}
                  <div className="mt-1.5 flex items-center gap-1">
                    <button
                      onClick={() => void respondIdleSuggestion(s.suggestion_id, 'accepted')}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-300 hover:bg-green-500/30"
                    >Accept</button>
                    <button
                      onClick={() => void respondIdleSuggestion(s.suggestion_id, 'deferred')}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30"
                    >Defer</button>
                    <button
                      onClick={() => void respondIdleSuggestion(s.suggestion_id, 'rejected')}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30"
                    >Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Suggested Jobs ── */}
        <div className="border-b border-ide-border/50">
          <button onClick={() => toggleSection('jobs')}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-ide-text-dim hover:text-ide-text hover:bg-ide-bg/30">
            <div className="flex items-center gap-1.5">
              <Briefcase className="w-3 h-3 text-purple-400" />
              Suggested Jobs
              {totalJobs > 0 && (
                <span className="px-1 bg-purple-400/20 text-purple-300 rounded text-[9px]">{totalJobs}</span>
              )}
              {jobsLoading && <RefreshCw className="w-2.5 h-2.5 text-ide-text-dim animate-spin" />}
            </div>
            {sections.jobs ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {sections.jobs && (
            <div className="px-2 pb-2 space-y-1.5">
              {jobs.length === 0 && !jobsLoading ? (
                <div className="text-[10px] text-ide-text-dim px-1 py-2 text-center">No pending jobs — crawler is running</div>
              ) : jobs.length === 0 && jobsLoading ? (
                <div className="text-[10px] text-ide-text-dim px-1 py-2 text-center">Loading…</div>
              ) : jobs.map(job => (
                <div key={job.id} className="p-1.5 rounded bg-ide-bg/30 border border-ide-border/30 group">
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span className="text-[10px] text-ide-text font-medium leading-snug flex-1">{job.title}</span>
                    <span className={`text-[8px] px-1 py-0.5 rounded flex-shrink-0 ${priorityColor(job.priority)}`}>
                      {job.priority}
                    </span>
                  </div>
                  <div className="text-[9px] text-ide-text-dim leading-snug mb-1.5">{job.description}</div>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-purple-400/70">{job.category}</span>
                    <span className="text-[8px] px-1 py-0.5 rounded border border-purple-500/30 text-purple-200 bg-purple-500/10">internal function</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => void implementJob(job)}
                        title="Send to chat & trigger implementation"
                        className="text-[9px] px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded hover:bg-purple-500/30"
                      >→ Implement</button>
                      <button
                        onClick={() => onSendToBrainstorm(`Job to discuss: ${job.title}\n\nCategory: ${job.category}\nSource: ${job.source}\n${job.description}`)}
                        title="Discuss in chat"
                        className="text-[9px] px-1.5 py-0.5 bg-ide-accent/15 text-ide-accent rounded hover:bg-ide-accent/25"
                      >→ Chat</button>
                      <button
                        onClick={() => void archiveJob(job.job_id)}
                        title="Archive job"
                        className="text-[9px] px-1 py-0.5 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20"
                      ><X className="w-2 h-2" /></button>
                    </div>
                  </div>
                </div>
              ))}
              {totalJobs > jobs.length && (
                <div className="text-[9px] text-ide-text-dim text-center pt-1">
                  +{totalJobs - jobs.length} more — open Suggested Jobs panel to see all
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── External Projects ── */}
        <div className="border-b border-ide-border/50">
          <button onClick={() => toggleSection('externalProjects')}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-ide-text-dim hover:text-ide-text hover:bg-ide-bg/30">
            <div className="flex items-center gap-1.5">
              <Briefcase className="w-3 h-3 text-cyan-400" />
              External Projects
              {externalJobs.length > 0 && (
                <span className="px-1 bg-cyan-400/20 text-cyan-300 rounded text-[9px]">{externalJobs.length}</span>
              )}
            </div>
            {sections.externalProjects ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {sections.externalProjects && (
            <div className="px-2 pb-2 space-y-1.5">
              <div className="text-[9px] text-ide-text-dim px-1 pb-1">Jobs from external codebase reviews. These do not feed the IDE implementation pipeline.</div>
              {externalJobs.length === 0 ? (
                <div className="text-[10px] text-ide-text-dim px-1 py-2 text-center">No external project jobs</div>
              ) : externalJobs.map(job => (
                <div key={job.id} className="p-1.5 rounded bg-ide-bg/30 border border-cyan-500/20 group">
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span className="text-[10px] text-ide-text font-medium leading-snug flex-1">{job.title}</span>
                    <span className={`text-[8px] px-1 py-0.5 rounded flex-shrink-0 ${priorityColor(job.priority)}`}>
                      {job.priority}
                    </span>
                  </div>
                  <div className="text-[9px] text-ide-text-dim leading-snug mb-1.5">{job.description}</div>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-cyan-400/70">external project</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onSendToBrainstorm(`Review external project job:\n\n**${job.title}**\n\nSource: ${job.source}\n${job.description}`)}
                        title="Discuss in chat"
                        className="text-[9px] px-1.5 py-0.5 bg-cyan-500/20 text-cyan-300 rounded hover:bg-cyan-500/30"
                      >→ Chat</button>
                      <button
                        onClick={() => void archiveJob(job.job_id)}
                        title="Archive job"
                        className="text-[9px] px-1 py-0.5 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20"
                      ><X className="w-2 h-2" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Implementation Pipeline ── */}
        <div className="border-b border-ide-border/50">
          <button onClick={() => toggleSection('implementingPipeline')}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-ide-text-dim hover:text-ide-text hover:bg-ide-bg/30">
            <div className="flex items-center gap-1.5">
              <Play className="w-3 h-3 text-green-400" />
              Implementing
              {implementingJobs.length > 0 && (
                <span className="px-1 bg-green-400/20 text-green-300 rounded text-[9px]">{implementingJobs.length}</span>
              )}
            </div>
            {sections.implementingPipeline ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {sections.implementingPipeline && (
            <div className="px-2 pb-2 space-y-2">
              {implementingJobs.length === 0 ? (
                <div className="text-[10px] text-ide-text-dim px-1 py-2 text-center">No jobs currently implementing</div>
              ) : implementingJobs.map(job => (
                <div key={job.job_id} className="p-1.5 rounded bg-ide-bg/30 border border-green-500/20">
                  <div className="text-[10px] text-ide-text font-medium mb-1.5 leading-snug">{job.title}</div>
                  <div className="text-[9px] text-ide-text-dim mb-1.5">
                    Stage {job.current_stage ?? '?'} of 6 · {job.implementation_status}
                  </div>
                  <div className="space-y-0.5">
                    {job.stages.map(stage => (
                      <div key={stage.stage} className="flex items-center gap-1.5 text-[9px]">
                        <span className={
                          stage.status === 'complete' ? 'text-green-400' :
                          stage.status === 'in_progress' ? 'text-yellow-300' :
                          stage.status === 'failed' ? 'text-red-400' :
                          'text-ide-text-dim'
                        }>
                          {stage.status === 'complete' ? '✓' :
                           stage.status === 'in_progress' ? '▶' :
                           stage.status === 'failed' ? '✗' : '○'}
                        </span>
                        <span className={stage.status === 'in_progress' ? 'text-yellow-300 font-medium' : stage.status === 'complete' ? 'text-green-400/70' : 'text-ide-text-dim'}>
                          {stage.name}
                        </span>
                        {stage.status === 'in_progress' && <RefreshCw className="w-2 h-2 text-yellow-400 animate-spin" />}
                        {stage.entries > 0 && (
                          <span className="text-ide-text-dim ml-auto">{stage.entries} steps</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Codebase Health ── */}
        <div className="border-b border-ide-border/50">
          <button onClick={() => toggleSection('health')}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-ide-text-dim hover:text-ide-text hover:bg-ide-bg/30">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3 h-3 text-green-400" />
              Codebase Health
            </div>
            {sections.health ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {sections.health && (
            <div className="px-3 pb-3 space-y-2">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-ide-text-dim">Snapshot</span>
                <span className={codebaseReady ? 'text-green-400' : 'text-yellow-400'}>
                  {codebaseReady ? '✓ Ready' : '⏳ Loading'}
                </span>
              </div>
              {codebaseHealth?.latest_snapshot && (
                <>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-ide-text-dim">Registered devtags</span>
                    <span className="text-ide-text">{codebaseHealth.latest_snapshot.total_devtags.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-ide-text-dim">Registry surplus</span>
                    <span className="text-red-400">{codebaseHealth.latest_snapshot.registry_surplus_count}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-ide-text-dim">Registry deficit</span>
                    <span className="text-yellow-400">{codebaseHealth.latest_snapshot.registry_deficit_count}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-ide-text-dim">Systemic drift</span>
                    <span className={codebaseHealth.latest_snapshot.systemic_drift_flagged ? 'text-red-400' : 'text-green-400'}>
                      {codebaseHealth.latest_snapshot.systemic_drift_flagged ? 'FLAGGED' : 'Clear'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-ide-text-dim">Gap reports</span>
                    <span className="text-ide-text">{codebaseHealth.gap_summary.total_reports} total / {codebaseHealth.gap_summary.flagged_reports} flagged</span>
                  </div>
                </>
              )}
              {treeLineCount > 1 && (
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-ide-text-dim">Tree lines</span>
                  <span className="text-ide-text">{treeLineCount.toLocaleString()}</span>
                </div>
              )}
              {codebaseHealth?.top_debt_files?.length ? (
                <div>
                  <div className="text-[9px] text-ide-text-dim mb-1">Debt Heatmap</div>
                  {codebaseHealth.top_debt_files.slice(0, 4).map((file) => (
                    <div key={file.file_path} className="flex items-center justify-between text-[9px] py-0.5 gap-2">
                      <span className="text-ide-text-dim truncate" title={file.file_path}>{file.file_path.split(/[\\/]/).pop()}</span>
                      <span className={file.ceiling_exceeded ? 'text-red-400 font-mono' : 'text-yellow-400 font-mono'}>
                        {file.debt_score.toFixed(1)}/{file.ceiling.toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
              {blameStats.length > 0 && (
                <div>
                  <div className="text-[9px] text-ide-text-dim mb-1">Model Quality</div>
                  {blameStats.map((s: any) => (
                    <div key={s.model} className="flex items-center justify-between text-[9px] py-0.5">
                      <span className="text-ide-text-dim truncate max-w-[110px]" title={s.model}>
                        {(s.model || '').split('/').pop() || s.model}
                      </span>
                      <span className={`font-mono ${
                        s.successRate > 0.8 ? 'text-green-400' :
                        s.successRate > 0.6 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {s.avgQuality ? `${Math.round(s.avgQuality)}%` : `${Math.round((s.successRate || 0) * 100)}%`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-[9px] text-ide-text-dim">
                <span className="text-purple-400">Tip:</span> Ask THE GOD FACTORY to scan for debt, gaps, or patterns
              </div>
            </div>
          )}
        </div>

        {/* ── Model Health ── */}
        <div className="border-b border-ide-border/50">
          <button onClick={() => toggleSection('modelCycle')}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-ide-text-dim hover:text-ide-text hover:bg-ide-bg/30">
            <div className="flex items-center gap-1.5">
              <PlayCircle className="w-3 h-3 text-cyan-400" />
              Model Cycle Strategy
            </div>
            {sections.modelCycle ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {sections.modelCycle && (
            <div className="px-2 pb-2 space-y-1.5 text-[9px]">
              <div className="grid grid-cols-2 gap-1">
                <button
                  onClick={() => void probeWorkingModels()}
                  disabled={strategyBusy !== null}
                  className="px-2 py-1 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-40 flex items-center justify-center gap-1"
                  title="Run bulk model tests and keep the currently working GitHub models"
                >
                  {strategyBusy === 'probe' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <PlayCircle className="w-3 h-3" />}
                  Load working
                </button>
                <button
                  onClick={() => void applyIntelligentCycle()}
                  disabled={strategyBusy !== null}
                  className="px-2 py-1 rounded border border-green-500/30 bg-green-500/10 text-green-300 hover:bg-green-500/20 disabled:opacity-40 flex items-center justify-center gap-1"
                  title="Auto-rank models from health, usage, and feedback then apply to /api/model-strategy"
                >
                  {strategyBusy === 'apply' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  Apply cycle
                </button>
              </div>
              <div className="rounded border border-ide-border/30 bg-ide-bg/20 px-2 py-1 text-ide-text-dim">
                Last cycle: <span className="text-ide-text">{lastCycleSummary}</span>
              </div>

              {!modelStrategy ? (
                <div className="text-[10px] text-ide-text-dim px-1 py-2 text-center">No strategy loaded</div>
              ) : (
                <>
                  <div className="rounded border border-ide-border/30 bg-ide-bg/30 px-2 py-1.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-ide-text-dim">Preset</span>
                      <span className="text-ide-text uppercase">{modelStrategy.settings.presetId}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-ide-text-dim">Primary</span>
                      <span className="text-ide-text truncate max-w-[150px]" title={modelStrategy.settings.primaryModel}>
                        {modelStrategy.settings.primaryModel}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-ide-text-dim">Fallbacks</span>
                      <span className="text-cyan-300">{modelStrategy.settings.fallbackModels.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-ide-text-dim">Blocked</span>
                      <span className="text-yellow-300">{modelStrategy.settings.blockedModels.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-ide-text-dim">Failed (registry)</span>
                      <span className="text-red-300">{modelStrategy.failedModels.length}</span>
                    </div>
                  </div>

                  {modelStrategy.settings.fallbackModels.length > 0 && (
                    <div className="rounded border border-ide-border/30 bg-ide-bg/20 px-2 py-1.5">
                      <div className="text-ide-text-dim mb-1">Fallback order</div>
                      <div className="space-y-0.5">
                        {modelStrategy.settings.fallbackModels.slice(0, 8).map((m, idx) => (
                          <div key={m} className="flex items-center justify-between gap-2">
                            <span className="text-ide-text-dim">{idx + 1}.</span>
                            <span className="text-ide-text truncate" title={m}>{m}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-[9px] text-ide-text-dim">
                    Chat, God Factory, and loop fallback rotation should read this same chain.
                  </div>
                </>
              )}

              {workingModels.length > 0 && (
                <div className="rounded border border-ide-border/30 bg-ide-bg/20 px-2 py-1.5">
                  <div className="text-ide-text-dim mb-1">Working models ({workingModels.length})</div>
                  <div className="space-y-0.5 max-h-28 overflow-y-auto pr-1">
                    {workingModels.slice(0, 12).map((wm, i) => (
                      <div key={`${wm.model}-${i}`} className="flex items-center justify-between gap-2">
                        <span className="text-ide-text truncate" title={wm.model}>{wm.model}</span>
                        <span className="text-cyan-300 font-mono">{wm.latencyMs ? `${wm.latencyMs}ms` : 'ok'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded border border-amber-500/20 bg-amber-500/5 px-2 py-1.5">
                <div className="text-[9px] uppercase tracking-wider text-amber-200 mb-1">Feedback bridge: Blame + Employer</div>
                <div className="space-y-0.5">
                  {blameRegistry
                    .filter(r => !!r.strategyConfig?.action || !!r.strategyConfig?.recommended)
                    .slice(0, 4)
                    .map((r, idx) => (
                      <div key={`${r.modelId || r.model}-${idx}`} className="flex items-center justify-between gap-2">
                        <span className="text-ide-text-dim truncate" title={r.modelId || r.model || ''}>{r.modelId || r.model}</span>
                        <span className="text-amber-300">{r.strategyConfig?.action || (r.strategyConfig?.recommended ? 'recommended' : 'observe')}</span>
                      </div>
                    ))}
                  {employerSuggestions.slice(0, 2).map((s) => (
                    <div key={s.model_id} className="flex items-center justify-between gap-2">
                      <span className="text-ide-text-dim truncate" title={s.model_id}>{s.model_id}</span>
                      <span className="text-cyan-300">{s.recommended_role || 'unknown role'}</span>
                    </div>
                  ))}
                  {blameRegistry.length === 0 && employerSuggestions.length === 0 && (
                    <div className="text-ide-text-dim">No feedback payload loaded yet</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Model Health ── */}
        <div className="border-b border-ide-border/50">
          <button onClick={() => toggleSection('modelHealth')}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-ide-text-dim hover:text-ide-text hover:bg-ide-bg/30">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3 h-3 text-blue-400" />
              Model Health
            </div>
            {sections.modelHealth ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {sections.modelHealth && (
            <div className="px-2 pb-2 space-y-1">
              {modelHealth.length === 0 ? (
                <div className="text-[10px] text-ide-text-dim px-1 py-2 text-center">No model health records</div>
              ) : modelHealth.map(m => (
                <button key={m.model_id} onClick={() => void inspectModel(m.model_id)} className="w-full text-left rounded border border-ide-border/30 bg-ide-bg/30 px-2 py-1.5 hover:bg-ide-bg/50 transition-colors">
                  <div className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="text-ide-text truncate" title={m.model_id}>{m.display_name || m.model_id}</span>
                    <span className={m.composite_quality_score < 0.6 ? 'text-red-400 font-mono' : m.composite_quality_score < 0.75 ? 'text-yellow-400 font-mono' : 'text-green-400 font-mono'}>
                      {Math.round(m.composite_quality_score * 100)}%
                    </span>
                  </div>
                  <div className="text-[9px] text-ide-text-dim mt-0.5 flex items-center justify-between">
                    <span>{Math.round(m.success_rate * 100)}% success</span>
                    <span>{m.total_runs} runs</span>
                  </div>
                </button>
              ))}
              {rateUsage.length === 0 ? (
                <div className="text-[9px] text-ide-text-dim px-1 pb-1 text-center">No usage data yet</div>
              ) : (
                <div className="mt-2">
                  <div className="text-[9px] uppercase tracking-wider text-ide-text-dim mb-1">Rate Usage (last 1h)</div>
                  {rateUsage.map(u => {
                    const pct = u.usagePct ?? Math.min(100, Math.round((u.count / u.limitEst) * 100));
                    const barColor = pct >= 90 ? 'bg-red-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-green-500';
                    const textColor = pct >= 90 ? 'text-red-400' : pct >= 60 ? 'text-yellow-400' : 'text-green-400';
                    const isBusy = cooldownBusy === u.model;
                    return (
                      <div key={u.model} className="mb-2">
                        <div className="flex items-center justify-between text-[9px] mb-0.5">
                          <span className="text-ide-text-dim truncate max-w-[100px]" title={u.model}>{u.model.split('/').pop() || u.model}</span>
                          <span className={textColor}>{u.count}/{u.limitEst}</span>
                        </div>
                        <div className="h-1 rounded bg-ide-border/40 overflow-hidden mb-1">
                          <div className={`h-full rounded ${barColor}`} style={{ width: `${pct}%` }} />
                        </div>
                        {/* Manual cooldown controls */}
                        <div className="flex gap-1">
                          <button
                            title="Inject 1h cooldown for this model"
                            disabled={isBusy}
                            onClick={() => void injectCooldown(u.model, 'cooldown', 3600)}
                            className="flex-1 text-[8px] px-1 py-0.5 rounded bg-orange-900/40 text-orange-300 hover:bg-orange-800/50 disabled:opacity-40 border border-orange-700/30">
                            {isBusy ? <RefreshCw className="w-2 h-2 animate-spin mx-auto" /> : 'Cooldown'}
                          </button>
                          <button
                            title="Skip this model on its next cycle"
                            disabled={isBusy}
                            onClick={() => void injectCooldown(u.model, 'skip')}
                            className="flex-1 text-[8px] px-1 py-0.5 rounded bg-yellow-900/40 text-yellow-300 hover:bg-yellow-800/50 disabled:opacity-40 border border-yellow-700/30">
                            Skip
                          </button>
                          <button
                            title="Put this model to sleep for 4h"
                            disabled={isBusy}
                            onClick={() => void injectCooldown(u.model, 'sleep', 14400)}
                            className="flex-1 text-[8px] px-1 py-0.5 rounded bg-slate-700/40 text-slate-300 hover:bg-slate-600/50 disabled:opacity-40 border border-slate-600/30">
                            Sleep
                          </button>
                          <button
                            title="Clear any active cooldown override"
                            disabled={isBusy}
                            onClick={() => void injectCooldown(u.model, 'clear')}
                            className="flex-1 text-[8px] px-1 py-0.5 rounded bg-green-900/40 text-green-300 hover:bg-green-800/50 disabled:opacity-40 border border-green-700/30">
                            Clear
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Background Scan Status ── */}
        <div className="border-b border-ide-border/50">
          <button onClick={() => toggleSection('background')}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-ide-text-dim hover:text-ide-text hover:bg-ide-bg/30">
            <div className="flex items-center gap-1.5">
              <Clock3 className="w-3 h-3 text-indigo-400" />
              Background Scan Status
            </div>
            {sections.background ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {sections.background && (
            <div className="px-2 pb-2 space-y-1.5 text-[9px]">
              <div className="rounded border border-ide-border/30 bg-ide-bg/30 px-2 py-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-ide-text-dim">Scheduler</span>
                  <span className={backgroundStatus?.scheduler?.running ? 'text-green-400' : 'text-yellow-400'}>
                    {backgroundStatus?.scheduler?.running ? 'Running' : 'Paused'}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-ide-text-dim">Last tick</span>
                  <span className="text-ide-text">{backgroundStatus?.scheduler?.lastTickAt ? new Date(backgroundStatus.scheduler.lastTickAt).toLocaleTimeString() : 'Never'}</span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-ide-text-dim">Idle scan position</span>
                  <span className="text-ide-text truncate max-w-[130px]" title={backgroundStatus?.idleScanner?.scan_position || ''}>{backgroundStatus?.idleScanner?.scan_position || 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-ide-text-dim">Sandbox loop</span>
                  <span className={backgroundStatus?.controls?.sandbox_paused ? 'text-yellow-400' : 'text-green-400'}>
                    {backgroundStatus?.controls?.sandbox_paused ? 'Paused' : 'Running'}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <button
                    onClick={() => void runControl(backgroundStatus?.scheduler?.running ? 'pause_scheduler' : 'resume_scheduler')}
                    disabled={controlBusy === 'pause_scheduler' || controlBusy === 'resume_scheduler'}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 disabled:opacity-40 flex items-center gap-1"
                  >
                    {backgroundStatus?.scheduler?.running ? <PauseCircle className="w-2.5 h-2.5" /> : <PlayCircle className="w-2.5 h-2.5" />}
                    {backgroundStatus?.scheduler?.running ? 'Pause scheduler' : 'Resume scheduler'}
                  </button>
                  <button
                    onClick={() => void runControl(backgroundStatus?.controls?.sandbox_paused ? 'resume_sandbox' : 'pause_sandbox')}
                    disabled={controlBusy === 'pause_sandbox' || controlBusy === 'resume_sandbox'}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-40 flex items-center gap-1"
                  >
                    {backgroundStatus?.controls?.sandbox_paused ? <PlayCircle className="w-2.5 h-2.5" /> : <PauseCircle className="w-2.5 h-2.5" />}
                    {backgroundStatus?.controls?.sandbox_paused ? 'Resume sandbox' : 'Pause sandbox'}
                  </button>
                </div>
              </div>
              {/* Per-sub-agent monitor breakdown */}
              {backgroundStatus?.backgroundSubAgents && (
                <div className="space-y-1">
                  <div className="text-[9px] text-ide-text-dim uppercase tracking-wider px-0.5 pt-0.5">God Factory Monitors</div>
                  {Object.entries(backgroundStatus.backgroundSubAgents).map(([key, agent]) => (
                    <div key={key} className="rounded border border-ide-border/30 bg-ide-bg/20 px-2 py-1">
                      <div className="flex items-center justify-between">
                        <span className="text-ide-text font-medium">{agent.label}</span>
                        <span className={
                          agent.status === 'running' ? 'text-green-400' :
                          agent.status === 'error' ? 'text-red-400' :
                          agent.status === 'idle' ? 'text-ide-text-dim' :
                          'text-yellow-400'
                        }>{agent.status}</span>
                      </div>
                      <div className="text-[9px] text-ide-text-dim mt-0.5 truncate" title={agent.description}>{agent.description}</div>
                      <div className="text-[9px] text-ide-text-dim mt-0.5 flex items-center gap-2">
                        <span>Last: {agent.last_run_at ? new Date(agent.last_run_at).toLocaleTimeString() : 'Never'}</span>
                        {agent.last_run_cycle && <span>· cycle {agent.last_run_cycle}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Employer Crawler — Model Stratification ── */}
        <div className="border-b border-ide-border/50">
          <button onClick={() => toggleSection('employer')}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-ide-text-dim hover:text-ide-text hover:bg-ide-bg/30">
            <div className="flex items-center gap-1.5">
              <Briefcase className="w-3 h-3 text-amber-400" />
              Employer Crawler
              {employerStatus && employerStatus.pending_retirement > 0 && (
                <span className="text-[8px] bg-red-500/20 text-red-400 border border-red-500/30 rounded px-1 ml-1">
                  {employerStatus.pending_retirement} retire
                </span>
              )}
            </div>
            {sections.employer ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {sections.employer && (
            <div className="px-2 pb-2 space-y-1.5">
              {/* Status row */}
              {employerStatus && (
                <div className="text-[9px] text-ide-text-dim grid grid-cols-2 gap-x-2 gap-y-0.5 px-1 py-1 rounded bg-ide-bg/30 border border-ide-border/20">
                  <span>Cycle: <span className="text-ide-text font-mono">{employerStatus.last_cycle}</span></span>
                  <span>Analyzed: <span className="text-ide-text font-mono">{employerStatus.models_analyzed}</span></span>
                  <span>Retirements: <span className={employerStatus.pending_retirement > 0 ? 'text-red-400 font-mono' : 'text-ide-text font-mono'}>{employerStatus.pending_retirement}</span></span>
                  <span>Overrides: <span className="text-amber-400 font-mono">{employerStatus.active_cooldown_overrides}</span></span>
                </div>
              )}
              <button
                disabled={employerAnalyzing}
                onClick={() => void runEmployerAnalysis()}
                className="w-full flex items-center justify-center gap-1 text-[9px] px-2 py-1 rounded bg-amber-900/30 text-amber-300 hover:bg-amber-800/40 disabled:opacity-50 border border-amber-700/30">
                {employerAnalyzing ? <RefreshCw className="w-2 h-2 animate-spin" /> : <Zap className="w-2 h-2" />}
                {employerAnalyzing ? 'Analyzing...' : 'Run Analysis Pass'}
              </button>
              {/* Model role suggestions */}
              {employerSuggestions.length === 0 ? (
                <div className="text-[9px] text-ide-text-dim text-center py-1">No analysis data — run a pass first</div>
              ) : employerSuggestions.slice(0, 8).map(s => {
                const roleColor = s.recommended_role === 'architect' ? 'text-purple-400' :
                  s.recommended_role === 'senior_developer' ? 'text-blue-400' :
                  s.recommended_role === 'micro_editor' ? 'text-green-400' :
                  s.recommended_role === 'documenter' ? 'text-cyan-400' :
                  s.recommended_role === 'unreliable' ? 'text-red-400' : 'text-ide-text-dim';
                const tasks = (() => { try { return JSON.parse(s.task_types || '[]') as string[]; } catch { return []; } })();
                return (
                  <div key={s.model_id} className="rounded border border-ide-border/30 bg-ide-bg/30 px-2 py-1.5 text-[9px]">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="text-ide-text truncate max-w-[110px]" title={s.model_id}>{s.model_id.split('/').pop() || s.model_id}</span>
                      <span className={`${roleColor} font-semibold capitalize`}>{s.recommended_role.replace(/_/g, ' ')}</span>
                    </div>
                    <div className="flex items-center justify-between text-ide-text-dim mb-0.5">
                      <span>{Math.round(s.success_rate * 100)}% success · {s.sample_count} runs</span>
                      <span className="text-ide-text-dim">{Math.round(s.role_confidence * 100)}% conf</span>
                    </div>
                    {tasks.length > 0 && (
                      <div className="text-ide-text-dim truncate">{tasks.slice(0, 3).join(', ')}</div>
                    )}
                    {s.cooldown_override_type && (
                      <div className="text-orange-400 text-[8px] mt-0.5">Override: {s.cooldown_override_type}</div>
                    )}
                    {s.retirement_recommended === 1 && (
                      <button
                        onClick={() => void retireModel(s.model_id)}
                        className="mt-1 w-full text-[8px] px-1 py-0.5 rounded bg-red-900/40 text-red-300 hover:bg-red-800/50 border border-red-700/30">
                        Mark Retired
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Brainstorm Pad ── */}
        <div className="border-b border-ide-border/50">
          <button onClick={() => toggleSection('subsystems')}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-ide-text-dim hover:text-ide-text hover:bg-ide-bg/30">
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal className="w-3 h-3 text-cyan-400" />
              Subsystem Controls
            </div>
            {sections.subsystems ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {sections.subsystems && (
            <div className="px-2 pb-2 space-y-1.5">
              {schedulerStatus && (
                <div className="rounded border border-ide-border/30 bg-ide-panel/50 px-2 py-1.5 text-[9px] text-ide-text-dim">
                  <div className="flex items-center justify-between gap-2">
                    <span>Idle scheduler</span>
                    <span className={schedulerStatus.running ? 'text-green-400' : 'text-red-400'}>
                      {schedulerStatus.running ? 'Running' : 'Stopped'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span>Tick</span>
                    <span className="text-ide-text">{Math.round(schedulerStatus.tickMs / 1000)}s</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span>Last tick</span>
                    <span className="text-ide-text">{schedulerStatus.lastTickAt ? new Date(schedulerStatus.lastTickAt).toLocaleTimeString() : 'Never'}</span>
                  </div>
                </div>
              )}
              {(['ide_codebase_crawler', 'project_state_crawler', 'suggested_jobs_crawler', 'gap_analysis', 'god_factory_idle_scan'] as SubsystemId[]).map(id => {
                const cfg = subsystems[id];
                const meta = SUBSYSTEM_META[id];
                const runtime = subsystemStatus[id] || {};
                return (
                  <div key={id} className="p-1.5 rounded bg-ide-bg/30 border border-ide-border/30 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-ide-text font-medium">{meta.label}</span>
                        <span className={`text-[8px] px-1 py-0.5 rounded border ${
                          meta.scope === 'ide_app'
                            ? 'border-purple-500/40 text-purple-300 bg-purple-500/10'
                            : meta.scope === 'user_projects'
                            ? 'border-cyan-500/40 text-cyan-300 bg-cyan-500/10'
                            : 'border-ide-border text-ide-text-dim'
                        }`}>
                          {meta.scope === 'ide_app' ? 'IDE App' : meta.scope === 'user_projects' ? 'User Projects' : 'Global'}
                        </span>
                      </div>
                      <button
                        onClick={() => runSubsystem(id)}
                        disabled={runningSubsystem !== null}
                        className="text-[9px] px-1.5 py-0.5 bg-cyan-500/15 text-cyan-300 rounded hover:bg-cyan-500/25 disabled:opacity-40 flex items-center gap-1"
                      >
                        <Play className="w-2 h-2" />
                        {runningSubsystem === id ? 'Running' : 'Run now'}
                      </button>
                    </div>
                    <div className="text-[9px] leading-snug text-ide-text-dim">{meta.description}</div>
                    <div className="rounded border border-ide-border/30 bg-ide-panel/40 px-1.5 py-1 text-[9px] text-ide-text-dim space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span>Scheduler</span>
                        <span className={runtime.schedulerActive ? 'text-green-400' : 'text-yellow-400'}>
                          {runtime.schedulerActive ? 'Active' : 'Manual only'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span>Last run</span>
                        <span className="text-ide-text">{runtime.lastRun?.completedAt ? new Date(runtime.lastRun.completedAt).toLocaleTimeString() : 'Never'}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span>Next run</span>
                        <span className="text-ide-text">{runtime.nextRunAt ? new Date(runtime.nextRunAt).toLocaleTimeString() : 'N/A'}</span>
                      </div>
                      {(runtime.targetProjectName || runtime.targetRoot) && (
                        <div className="truncate" title={runtime.targetRoot || undefined}>
                          Target: <span className="text-cyan-300">{runtime.targetProjectName || runtime.targetRoot}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[9px]">
                      <button
                        onClick={() => updateSubsystem(id, { enabled: !cfg.enabled })}
                        className={`px-1.5 py-0.5 rounded border ${cfg.enabled ? 'border-green-500/40 text-green-400 bg-green-500/10' : 'border-ide-border text-ide-text-dim'}`}
                      >
                        {cfg.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                      <button
                        onClick={() => void runControl(cfg.enabled ? 'pause_subsystem' : 'resume_subsystem', id)}
                        disabled={controlBusy === `pause_subsystem:${id}` || controlBusy === `resume_subsystem:${id}`}
                        className="px-1.5 py-0.5 rounded border border-cyan-500/30 text-cyan-300 bg-cyan-500/10 disabled:opacity-40"
                      >
                        {cfg.enabled ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        onClick={() => updateSubsystem(id, { idleEnabled: !cfg.idleEnabled })}
                        className={`px-1.5 py-0.5 rounded border ${cfg.idleEnabled ? 'border-blue-500/40 text-blue-400 bg-blue-500/10' : 'border-ide-border text-ide-text-dim'}`}
                      >
                        Idle {cfg.idleEnabled ? 'ON' : 'OFF'}
                      </button>
                      <button
                        onClick={() => updateSubsystem(id, { manualOnly: !cfg.manualOnly })}
                        className={`px-1.5 py-0.5 rounded border ${cfg.manualOnly ? 'border-yellow-500/40 text-yellow-400 bg-yellow-500/10' : 'border-ide-border text-ide-text-dim'}`}
                      >
                        Manual {cfg.manualOnly ? 'ONLY' : 'AUTO'}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-[9px] text-ide-text-dim">
                      <label className="flex items-center gap-1">
                        Depth
                        <input
                          type="number"
                          min={1}
                          max={8}
                          value={cfg.maxDepth}
                          onChange={e => updateSubsystem(id, { maxDepth: Math.max(1, Math.min(8, Number(e.target.value) || 1)) })}
                          className="w-10 bg-ide-panel border border-ide-border rounded px-1 py-0.5 text-[9px]"
                        />
                      </label>
                      <label className="flex items-center gap-1 justify-end">
                        Idle s
                        <input
                          type="number"
                          min={15}
                          max={3600}
                          value={cfg.idleIntervalSec}
                          onChange={e => updateSubsystem(id, { idleIntervalSec: Math.max(15, Math.min(3600, Number(e.target.value) || 15)) })}
                          className="w-12 bg-ide-panel border border-ide-border rounded px-1 py-0.5 text-[9px]"
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
              {recentActions.length > 0 && (
                <div className="rounded border border-ide-border/30 bg-ide-panel/50 px-2 py-1.5">
                  <div className="text-[9px] text-ide-text-dim uppercase tracking-wider mb-1">Recent Authority Actions</div>
                  <div className="space-y-1">
                    {recentActions.slice(0, 4).map((action) => (
                      <div key={action.action_id} className="text-[9px] leading-snug">
                        <div className="text-ide-text">{action.action_type.replace(/_/g, ' ')}{action.target_id ? ` · ${action.target_id}` : ''}</div>
                        <div className="text-ide-text-dim">{action.result} · {new Date(action.timestamp).toLocaleTimeString()}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Silicon Factory ── */}
        <div className="border-b border-ide-border/50">
          <button onClick={() => toggleSection('siliconFactory')}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-ide-text-dim hover:text-ide-text hover:bg-ide-bg/30">
            <div className="flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-amber-400" />
              Silicon Factory
            </div>
            {sections.siliconFactory ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {sections.siliconFactory && (
            <div className="px-2 pb-2 space-y-1.5">
              <div className="rounded border border-ide-border/30 bg-ide-panel/50 px-2 py-1.5 text-[9px] text-ide-text-dim space-y-0.5">
                <div className="flex items-center justify-between">
                  <span>Supervisor</span>
                  <span className={siliconDashboard?.supervisor?.running && !siliconDashboard?.supervisor?.paused ? 'text-green-400' : 'text-yellow-400'}>
                    {siliconDashboard?.supervisor?.running ? (siliconDashboard?.supervisor?.paused ? 'Paused' : 'Running') : 'Stopped'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Heartbeat</span>
                  <span className="text-ide-text">{siliconDashboard?.supervisor?.heartbeatSec ?? 60}s</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Last pulse</span>
                  <span className="text-ide-text">{siliconDashboard?.supervisor?.lastHeartbeatAt ? new Date(siliconDashboard.supervisor.lastHeartbeatAt).toLocaleTimeString() : 'Never'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Queue</span>
                  <span className="text-ide-text font-mono">
                    P:{siliconDashboard?.supervisor?.queue?.pending ?? 0} A:{siliconDashboard?.supervisor?.queue?.active ?? 0} E:{siliconDashboard?.supervisor?.queue?.escalated ?? 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>IAP / Locks / Snapshots</span>
                  <span className="text-ide-text font-mono">
                    {siliconDashboard?.iap_queue_depth ?? 0} / {siliconDashboard?.lock_count ?? 0} / {siliconDashboard?.snapshot_count ?? 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Memory / VRAM</span>
                  <span className="text-ide-text font-mono">
                    {siliconDashboard?.supervisor?.resources?.memoryPercent?.toFixed(1) ?? '0.0'}% /
                    {siliconDashboard?.supervisor?.resources?.vramPercent != null ? ` ${siliconDashboard.supervisor.resources.vramPercent.toFixed(1)}%` : ' n/a'}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <button
                    onClick={() => void runSiliconControl(siliconDashboard?.supervisor?.paused ? 'resume' : 'pause')}
                    disabled={siliconBusy === 'pause' || siliconBusy === 'resume'}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 disabled:opacity-40"
                  >
                    {siliconDashboard?.supervisor?.paused ? 'Resume supervisor' : 'Pause supervisor'}
                  </button>
                  <button
                    onClick={() => void runSiliconColdBoot()}
                    disabled={siliconBusy === 'resume'}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-40"
                  >
                    Cold-boot resume
                  </button>
                  <button
                    onClick={() => void runSiliconSnapshot()}
                    disabled={siliconBusy === 'snapshot'}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 hover:bg-purple-500/25 disabled:opacity-40"
                  >
                    Deep snapshot
                  </button>
                  <button
                    onClick={() => void runSiliconIapPing()}
                    disabled={siliconBusy === 'iap'}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40"
                  >
                    IAP ping
                  </button>
                </div>
              </div>

              <div className="rounded border border-ide-border/30 bg-ide-bg/30 px-2 py-1.5 space-y-1">
                <div className="text-[9px] text-ide-text-dim">Enqueue Atomic Task</div>
                <textarea
                  rows={3}
                  value={siliconTaskInput}
                  onChange={e => setSiliconTaskInput(e.target.value)}
                  placeholder="Define one atomic task for the task ledger..."
                  className="w-full bg-ide-panel border border-ide-border/50 rounded px-2 py-1 text-[10px] text-ide-text placeholder-ide-text-dim resize-none focus:outline-none focus:border-amber-400/50"
                />
                <button
                  onClick={() => void enqueueSiliconTask()}
                  disabled={!siliconTaskInput.trim() || siliconBusy === 'enqueue'}
                  className="w-full text-[10px] py-1 rounded bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 disabled:opacity-40"
                >
                  Add to Task Ledger
                </button>
                <button
                  onClick={() => void runSiliconSpecValidate()}
                  disabled={!siliconTaskInput.trim() || siliconBusy === 'validate'}
                  className="w-full text-[10px] py-1 rounded bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 disabled:opacity-40"
                >
                  Validate Draft vs Spec Contract
                </button>
              </div>

              <div className="rounded border border-ide-border/30 bg-ide-bg/20 px-2 py-1.5 space-y-1">
                <div className="text-[9px] text-ide-text-dim">Sync-Lock Manager</div>
                <input
                  value={siliconLockKey}
                  onChange={e => setSiliconLockKey(e.target.value)}
                  placeholder="lock key"
                  className="w-full bg-ide-panel border border-ide-border/50 rounded px-2 py-1 text-[10px] text-ide-text placeholder-ide-text-dim focus:outline-none focus:border-cyan-400/50"
                />
                <div className="flex gap-1">
                  <button
                    onClick={() => void runSiliconLock('acquire')}
                    disabled={!siliconLockKey.trim() || siliconBusy === 'lock_acquire'}
                    className="flex-1 text-[10px] py-1 rounded bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-40"
                  >
                    Acquire
                  </button>
                  <button
                    onClick={() => void runSiliconLock('release')}
                    disabled={!siliconLockKey.trim() || siliconBusy === 'lock_release'}
                    className="flex-1 text-[10px] py-1 rounded bg-slate-500/15 text-slate-300 hover:bg-slate-500/25 disabled:opacity-40"
                  >
                    Release
                  </button>
                </div>
              </div>

              <div className="rounded border border-ide-border/30 bg-ide-bg/20 px-2 py-1.5 space-y-1">
                <div className="text-[9px] text-ide-text-dim">Small-Context Tooling</div>
                <button
                  onClick={() => void syncSiliconProjectContext()}
                  disabled={siliconBusy === 'project_context'}
                  className="w-full text-[10px] py-1 rounded bg-teal-500/15 text-teal-300 hover:bg-teal-500/25 disabled:opacity-40"
                >
                  Sync Active Project Context
                </button>

                <input
                  value={siliconSemanticQuery}
                  onChange={e => setSiliconSemanticQuery(e.target.value)}
                  placeholder="semantic query"
                  className="w-full bg-ide-panel border border-ide-border/50 rounded px-2 py-1 text-[10px] text-ide-text placeholder-ide-text-dim focus:outline-none focus:border-teal-400/50"
                />
                <button
                  onClick={() => void runSiliconSemanticFind()}
                  disabled={!siliconSemanticQuery.trim() || siliconBusy === 'semantic_find'}
                  className="w-full text-[10px] py-1 rounded bg-teal-500/15 text-teal-300 hover:bg-teal-500/25 disabled:opacity-40"
                >
                  Semantic Find
                </button>

                <input
                  value={siliconSymbolInput}
                  onChange={e => setSiliconSymbolInput(e.target.value)}
                  placeholder="symbol name"
                  className="w-full bg-ide-panel border border-ide-border/50 rounded px-2 py-1 text-[10px] text-ide-text placeholder-ide-text-dim focus:outline-none focus:border-violet-400/50"
                />
                <div className="grid grid-cols-2 gap-1">
                  <button
                    onClick={() => void runSiliconSymbolRead('signature')}
                    disabled={!siliconSymbolInput.trim() || siliconBusy === 'symbol_signature'}
                    className="text-[9px] py-1 rounded bg-violet-500/15 text-violet-300 hover:bg-violet-500/25 disabled:opacity-40"
                  >
                    Read Signature
                  </button>
                  <button
                    onClick={() => void runSiliconSymbolRead('function')}
                    disabled={!siliconSymbolInput.trim() || siliconBusy === 'symbol_function'}
                    className="text-[9px] py-1 rounded bg-violet-500/15 text-violet-300 hover:bg-violet-500/25 disabled:opacity-40"
                  >
                    Read Function
                  </button>
                  <button
                    onClick={() => void runSiliconSymbolRead('class_api')}
                    disabled={!siliconSymbolInput.trim() || siliconBusy === 'symbol_class_api'}
                    className="text-[9px] py-1 rounded bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 disabled:opacity-40"
                  >
                    Read Class API
                  </button>
                  <button
                    onClick={() => void runSiliconTaskContext()}
                    disabled={!siliconDashboard?.recent_tasks?.length || siliconBusy === 'task_context'}
                    className="text-[9px] py-1 rounded bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 disabled:opacity-40"
                  >
                    Build Task Context
                  </button>
                </div>
              </div>

              {/* ── Test Discovery ── */}
              <div className="rounded border border-ide-border/30 bg-ide-panel/40 px-2 py-1.5">
                <div className="text-[9px] text-ide-text-dim uppercase tracking-wider mb-1">Test Discovery</div>
                <div className="flex gap-1 mb-1">
                  <button
                    onClick={() => setSiliconTestMode('symbol')}
                    className={`text-[9px] px-2 py-0.5 rounded ${siliconTestMode === 'symbol' ? 'bg-teal-500/30 text-teal-200' : 'bg-ide-border/20 text-ide-text-dim'}`}
                  >symbol</button>
                  <button
                    onClick={() => setSiliconTestMode('file')}
                    className={`text-[9px] px-2 py-0.5 rounded ${siliconTestMode === 'file' ? 'bg-teal-500/30 text-teal-200' : 'bg-ide-border/20 text-ide-text-dim'}`}
                  >file</button>
                </div>
                <input
                  type="text"
                  placeholder={siliconTestMode === 'symbol' ? 'symbolName' : 'src/foo.ts'}
                  value={siliconTestTarget}
                  onChange={e => setSiliconTestTarget(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && void runTestDiscovery()}
                  className="w-full text-[9px] bg-ide-bg/40 border border-ide-border/40 rounded px-1.5 py-1 text-ide-text placeholder:text-ide-text-dim/50 mb-1"
                />
                <div className="grid grid-cols-3 gap-1">
                  <button
                    onClick={() => void runTestDiscovery()}
                    disabled={!siliconTestTarget.trim() || siliconBusy === 'test_discovery'}
                    className="text-[9px] py-1 rounded bg-teal-500/15 text-teal-300 hover:bg-teal-500/25 disabled:opacity-40"
                  >
                    Find Tests
                  </button>
                  <button
                    onClick={() => void runReindexTests()}
                    disabled={siliconBusy === 'reindex_tests'}
                    className="text-[9px] py-1 rounded bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 disabled:opacity-40"
                  >
                    Reindex Tests
                  </button>
                  <button
                    onClick={() => void runReindexEmbeddings()}
                    disabled={siliconBusy === 'reindex_embeddings'}
                    className="text-[9px] py-1 rounded bg-purple-500/15 text-purple-300 hover:bg-purple-500/25 disabled:opacity-40"
                  >
                    Rebuild Embeddings
                  </button>
                </div>
              </div>

              <div className="rounded border border-ide-border/30 bg-ide-panel/40 px-2 py-1.5">
                <div className="text-[9px] text-ide-text-dim uppercase tracking-wider mb-1">Recent Tasks</div>
                {!siliconDashboard?.recent_tasks?.length ? (
                  <div className="text-[9px] text-ide-text-dim">No tasks in ledger yet</div>
                ) : (
                  <div className="space-y-1">
                    {siliconDashboard.recent_tasks.slice(0, 6).map((task) => (
                      <div key={task.id} className="text-[9px] leading-snug rounded border border-ide-border/30 bg-ide-bg/20 px-1.5 py-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-ide-text truncate" title={task.instruction}>{task.instruction}</span>
                          <span className={
                            task.status === 'COMPLETED' ? 'text-green-400 font-mono' :
                            task.status === 'FAILED' || task.status === 'ESCALATED' ? 'text-red-400 font-mono' :
                            task.status === 'ACTIVE' ? 'text-cyan-400 font-mono' :
                            'text-yellow-400 font-mono'
                          }>
                            {task.status}
                          </span>
                        </div>
                        <div className="text-ide-text-dim">{task.agent_type} · attempts {task.attempt_count}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Brainstorm Pad ── */}
        <div>
          <button onClick={() => toggleSection('brainstorm')}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-ide-text-dim hover:text-ide-text hover:bg-ide-bg/30">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-blue-400" />
              Brainstorm Pad
            </div>
            {sections.brainstorm ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {sections.brainstorm && (
            <div className="px-2 pb-2">
              <textarea
                value={brainstorm}
                onChange={e => setBrainstorm(e.target.value)}
                placeholder="Jot ideas here, then send to chat…"
                rows={4}
                className="w-full bg-ide-bg border border-ide-border/50 rounded px-2 py-1.5 text-[10px] text-ide-text placeholder-ide-text-dim resize-none focus:outline-none focus:border-blue-400/50 mb-1.5"
              />
              <button
                onClick={async () => {
                  if (!brainstorm.trim()) return;
                  const text = brainstorm.trim();
                  try {
                    const res = await fetch(`${API_BASE}/api/god-factory/brainstorm`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ input: text }),
                    });
                    if (res.ok) {
                      setBrainstormConfirm('Brainstorm saved — Suggested Job created');
                      setTimeout(() => setBrainstormConfirm(null), 3000);
                    }
                  } catch { /* ignore */ }
                  onSendToBrainstorm(text);
                  setBrainstorm('');
                  loadSuggestedJobs();
                  loadQueue();
                }}
                disabled={!brainstorm.trim()}
                className="w-full text-[10px] py-1 bg-blue-500/15 text-blue-300 rounded hover:bg-blue-500/25 disabled:opacity-30 flex items-center justify-center gap-1"
              >
                <Send className="w-2.5 h-2.5" /> Send to Chat
              </button>
              {brainstormConfirm && (
                <div className="text-[9px] text-green-400 mt-1 text-center">{brainstormConfirm}</div>
              )}
            </div>
          )}
        </div>

        {/* ── God Factory Autonomous Loop ── */}
        <GodFactoryLoopPanel projectId={projectId} />
      </div>
    </div>
  );
}
