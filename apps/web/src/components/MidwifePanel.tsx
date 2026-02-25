// ============================================
// Midwife Panel — Bird-feeding controls
// Model selection, task assignments, cooldowns,
// start/stop feeding, status, history
// ============================================
import React, { useEffect, useState, useCallback } from 'react';
import { useMidwifeStore, type MidwifeTaskType, type TaskModelAssignment } from '../stores/midwifeStore';
import { MODELS } from '@personal-ide/shared';
import {
  X, Play, Square, RefreshCw, ChevronDown, ChevronRight,
  Zap, Clock, ToggleLeft, ToggleRight, History,
  Bird, Cpu, AlertCircle, Check, Settings2
} from 'lucide-react';

const API_BASE = 'http://localhost:3001';

interface DynamicModel {
  id: string;
  name: string;
  provider: string;
}

interface Props {
  onClose: () => void;
}

export function MidwifePanel({ onClose }: Props) {
  const {
    config, status, tasks, history, loading, error,
    fetchConfig, updateConfig, fetchTasks, updateTask,
    fetchStatus, fetchHistory, startFeeding, stopFeeding,
  } = useMidwifeStore();

  const [activeTab, setActiveTab] = useState<'tasks' | 'config' | 'history'>('tasks');
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [dynamicModels, setDynamicModels] = useState<DynamicModel[]>([]);

  // Fetch dynamic models from all enabled providers
  const fetchDynamicModels = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/providers/all-models`);
      const data = await res.json();
      if (data.models?.length > 0) {
        setDynamicModels(data.models.map((m: any) => ({
          id: m.id,
          name: m.name,
          provider: m.provider || m.publisher || 'unknown',
        })));
      }
    } catch {
      // Fall back to static models
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchConfig();
    fetchTasks();
    fetchStatus();
    fetchHistory();
    fetchDynamicModels();
  }, []);

  // Poll status while running
  useEffect(() => {
    if (!status?.isRunning) return;
    const interval = setInterval(() => {
      fetchStatus();
      fetchHistory();
    }, 3000);
    return () => clearInterval(interval);
  }, [status?.isRunning]);

  // Use dynamic models if available, else fall back to static
  const allModels: { id: string; name: string; publisher: string }[] = dynamicModels.length > 0
    ? dynamicModels.map(m => ({ id: m.id, name: m.name, publisher: m.provider }))
    : MODELS.map(m => ({ id: m.id, name: m.name, publisher: m.publisher }));

  const handleToggleTask = useCallback((taskType: MidwifeTaskType, enabled: boolean) => {
    updateTask(taskType, { enabled });
  }, [updateTask]);

  const handleModelChange = useCallback((taskType: MidwifeTaskType, models: string[]) => {
    updateTask(taskType, { assignedModels: models });
  }, [updateTask]);

  const handleCooldownChange = useCallback((taskType: MidwifeTaskType, cooldownMs: number) => {
    updateTask(taskType, { cooldownMs });
  }, [updateTask]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-ide-bg-light border border-ide-border rounded-lg shadow-2xl w-[700px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-ide-border">
          <div className="flex items-center gap-2">
            <Bird className="w-5 h-5 text-amber-400" />
            <h2 className="text-sm font-semibold text-ide-text">Midwife Bird-Feeding</h2>
            {status?.isRunning && (
              <span className="px-2 py-0.5 text-[10px] bg-green-500/20 text-green-400 rounded-full animate-pulse">
                FEEDING
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {status?.isRunning ? (
              <button
                onClick={stopFeeding}
                disabled={loading}
                className="flex items-center gap-1 px-3 py-1 text-xs bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded transition-colors"
              >
                <Square className="w-3 h-3" /> Stop
              </button>
            ) : (
              <button
                onClick={startFeeding}
                disabled={loading}
                className="flex items-center gap-1 px-3 py-1 text-xs bg-green-600/20 text-green-400 hover:bg-green-600/30 rounded transition-colors"
              >
                <Play className="w-3 h-3" /> Start Feeding
              </button>
            )}
            <button onClick={onClose} className="p-1 hover:bg-ide-bg rounded text-ide-text-dim hover:text-ide-text">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Status Banner */}
        {status?.isRunning && (
          <div className="px-4 py-2 bg-green-900/20 border-b border-green-800/30 text-xs text-green-300 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span>🐦 Task: <strong>{status.currentTask || 'idle'}</strong></span>
              <span>Model: <strong>{status.currentModel || '—'}</strong></span>
            </div>
            <div className="flex items-center gap-3">
              <span>Generated: <strong>{status.totalPairsGenerated || 0}</strong></span>
              <span>Fed: <strong>{status.totalPairsFed || 0}</strong></span>
              <span>Tokens: <strong>{(status.totalTokensUsed || 0).toLocaleString()}</strong></span>
            </div>
          </div>
        )}

        {error && (
          <div className="px-4 py-2 bg-red-900/20 border-b border-red-800/30 text-xs text-red-300 flex items-center gap-2">
            <AlertCircle className="w-3 h-3" /> {error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-ide-border">
          {([
            { id: 'tasks' as const, label: 'Tasks & Models', icon: Cpu },
            { id: 'config' as const, label: 'Settings', icon: Settings2 },
            { id: 'history' as const, label: 'History', icon: History },
          ]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'border-ide-accent text-ide-accent'
                  : 'border-transparent text-ide-text-dim hover:text-ide-text'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'tasks' && (
            <TasksTab
              tasks={tasks}
              allModels={allModels}
              expandedTask={expandedTask}
              setExpandedTask={setExpandedTask}
              onToggle={handleToggleTask}
              onModelChange={handleModelChange}
              onCooldownChange={handleCooldownChange}
            />
          )}

          {activeTab === 'config' && (
            <ConfigTab config={config} updateConfig={updateConfig} onProvidersChanged={fetchDynamicModels} />
          )}

          {activeTab === 'history' && (
            <HistoryTab history={history} onRefresh={fetchHistory} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tasks Tab ──
function TasksTab({
  tasks, allModels, expandedTask, setExpandedTask, onToggle, onModelChange, onCooldownChange,
}: {
  tasks: TaskModelAssignment[];
  allModels: { id: string; name: string; publisher: string }[];
  expandedTask: string | null;
  setExpandedTask: (t: string | null) => void;
  onToggle: (taskType: MidwifeTaskType, enabled: boolean) => void;
  onModelChange: (taskType: MidwifeTaskType, models: string[]) => void;
  onCooldownChange: (taskType: MidwifeTaskType, cooldownMs: number) => void;
}) {
  const [showBulk, setShowBulk] = useState(false);
  const [bulkModel, setBulkModel] = useState(allModels[1]?.id || allModels[0]?.id || '');
  const [bulkFallback, setBulkFallback] = useState(allModels[2]?.id || allModels[0]?.id || '');
  const [bulkCooldown, setBulkCooldown] = useState(10000);

  const applyBulkModels = () => {
    tasks.forEach(task => {
      const models = bulkFallback !== bulkModel ? [bulkModel, bulkFallback] : [bulkModel];
      onModelChange(task.taskType, models);
    });
  };

  const applyBulkCooldown = () => {
    tasks.forEach(task => onCooldownChange(task.taskType, bulkCooldown));
  };

  const toggleAll = (enabled: boolean) => {
    tasks.forEach(task => onToggle(task.taskType, enabled));
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-ide-text-dim mb-1">
        Configure which tasks generate training data and which LLM models perform each task.
        Models rotate automatically when rate-limited.
      </p>

      {/* Bulk Controls */}
      <div className="mb-3">
        <button
          onClick={() => setShowBulk(!showBulk)}
          className="flex items-center gap-1.5 text-[10px] text-ide-accent hover:text-ide-accent/80 transition-colors"
        >
          {showBulk ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <Zap className="w-3 h-3" /> Bulk Controls — Apply to All Tasks
        </button>

        {showBulk && (
          <div className="mt-2 p-3 border border-ide-accent/30 rounded-lg bg-ide-accent/5 space-y-3">
            {/* Bulk Enable/Disable */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-ide-text-dim w-20">All Tasks:</span>
              <button
                onClick={() => toggleAll(true)}
                className="px-2 py-0.5 text-[10px] bg-green-600/20 text-green-400 hover:bg-green-600/30 rounded"
              >
                Enable All
              </button>
              <button
                onClick={() => toggleAll(false)}
                className="px-2 py-0.5 text-[10px] bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded"
              >
                Disable All
              </button>
            </div>

            {/* Bulk Model Selection */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-ide-text-dim w-20">Primary:</span>
              <select
                value={bulkModel}
                onChange={e => setBulkModel(e.target.value)}
                className="flex-1 text-xs bg-ide-bg border border-ide-border rounded px-2 py-1 text-ide-text min-w-[180px]"
              >
                {allModels.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-ide-text-dim w-20">Fallback:</span>
              <select
                value={bulkFallback}
                onChange={e => setBulkFallback(e.target.value)}
                className="flex-1 text-xs bg-ide-bg border border-ide-border rounded px-2 py-1 text-ide-text min-w-[180px]"
              >
                {allModels.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <button
                onClick={applyBulkModels}
                className="px-2 py-1 text-[10px] bg-ide-accent/20 text-ide-accent hover:bg-ide-accent/30 rounded"
              >
                Apply Models to All
              </button>
            </div>

            {/* Bulk Cooldown */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-ide-text-dim w-20">Cooldown:</span>
              <input
                id="bulk-cooldown"
                name="bulk-cooldown"
                type="range"
                min={1000}
                max={60000}
                step={1000}
                value={bulkCooldown}
                onChange={e => setBulkCooldown(parseInt(e.target.value))}
                className="flex-1 accent-ide-accent min-w-[120px]"
              />
              <span className="text-[10px] text-ide-text min-w-[40px]">{(bulkCooldown / 1000).toFixed(0)}s</span>
              <button
                onClick={applyBulkCooldown}
                className="px-2 py-1 text-[10px] bg-ide-accent/20 text-ide-accent hover:bg-ide-accent/30 rounded"
              >
                Apply Cooldown to All
              </button>
            </div>
          </div>
        )}
      </div>
      {tasks.map(task => {
        const isExpanded = expandedTask === task.taskType;
        return (
          <div key={task.taskType} className="border border-ide-border rounded-lg overflow-hidden">
            {/* Task Header */}
            <div
              className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-ide-bg/50 transition-colors"
              onClick={() => setExpandedTask(isExpanded ? null : task.taskType)}
            >
              <div className="flex items-center gap-2">
                {isExpanded ? <ChevronDown className="w-3 h-3 text-ide-text-dim" /> : <ChevronRight className="w-3 h-3 text-ide-text-dim" />}
                <span className="text-xs font-medium text-ide-text">{task.label}</span>
                <span className="text-[10px] text-ide-text-dim">{task.description}</span>
              </div>
              <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                <span className="text-[10px] text-ide-text-dim">{task.assignedModels.length} models</span>
                <button
                  onClick={() => onToggle(task.taskType, !task.enabled)}
                  className={`p-0.5 rounded transition-colors ${task.enabled ? 'text-green-400' : 'text-ide-text-dim'}`}
                >
                  {task.enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Task Details */}
            {isExpanded && (
              <div className="px-3 py-3 border-t border-ide-border bg-ide-bg/30 space-y-3">
                {/* Model Selection */}
                <div>
                  <label className="text-[10px] text-ide-text-dim block mb-1">Assigned Models (first = primary, rest = fallbacks)</label>
                  <div className="space-y-1">
                    {task.assignedModels.map((modelId, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-[10px] text-ide-text-dim w-4">{idx === 0 ? '★' : `#${idx + 1}`}</span>
                        <select
                          value={modelId}
                          onChange={e => {
                            const newModels = [...task.assignedModels];
                            newModels[idx] = e.target.value;
                            onModelChange(task.taskType, newModels);
                          }}
                          className="flex-1 text-xs bg-ide-bg border border-ide-border rounded px-2 py-1 text-ide-text"
                        >
                          {allModels.map(m => (
                            <option key={m.id} value={m.id}>{m.name} ({m.publisher})</option>
                          ))}
                        </select>
                        {task.assignedModels.length > 1 && (
                          <button
                            onClick={() => onModelChange(task.taskType, task.assignedModels.filter((_, i) => i !== idx))}
                            className="text-red-400 hover:text-red-300 text-xs"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() => onModelChange(task.taskType, [...task.assignedModels, allModels[0]?.id || ''])}
                      className="text-[10px] text-ide-accent hover:text-ide-accent/80 mt-1"
                    >
                      + Add fallback model
                    </button>
                  </div>
                </div>

                {/* Cooldown */}
                <div>
                  <label htmlFor={`cooldown-${task.taskType}`} className="text-[10px] text-ide-text-dim block mb-1">
                    Cooldown: {(task.cooldownMs / 1000).toFixed(1)}s
                  </label>
                  <input
                    id={`cooldown-${task.taskType}`}
                    name={`cooldown-${task.taskType}`}
                    type="range"
                    min={1000}
                    max={60000}
                    step={1000}
                    value={task.cooldownMs}
                    onChange={e => onCooldownChange(task.taskType, parseInt(e.target.value))}
                    className="w-full accent-ide-accent"
                  />
                  <div className="flex justify-between text-[9px] text-ide-text-dim">
                    <span>1s</span><span>30s</span><span>60s</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Config Tab ──
function ConfigTab({
  config,
  updateConfig,
  onProvidersChanged,
}: {
  config: any;
  updateConfig: (updates: any) => Promise<void>;
  onProvidersChanged?: () => void;
}) {
  if (!config) return <p className="text-xs text-ide-text-dim">Loading config...</p>;

  return (
    <div className="space-y-4">
      {/* Global Cooldown */}
      <div>
        <label htmlFor="global-cooldown" className="text-[10px] text-ide-text-dim block mb-1">
          Global Cooldown: {(config.globalCooldownMs / 1000).toFixed(1)}s (minimum between any LLM call)
        </label>
        <input
          id="global-cooldown"
          name="global-cooldown"
          type="range"
          min={500}
          max={30000}
          step={500}
          value={config.globalCooldownMs}
          onChange={e => updateConfig({ globalCooldownMs: parseInt(e.target.value) })}
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
          value={config.nanoPort}
          onChange={e => updateConfig({ nanoPort: parseInt(e.target.value) || 5100 })}
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

// ── History Tab ──
function HistoryTab({
  history,
  onRefresh,
}: {
  history: any[];
  onRefresh: () => void;
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-ide-text-dim">{history.length} entries</span>
        <button onClick={onRefresh} className="p-1 hover:bg-ide-bg rounded text-ide-text-dim hover:text-ide-text">
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {history.length === 0 ? (
        <p className="text-xs text-ide-text-dim text-center py-8">
          No feeding history yet. Start a feeding session to generate training data.
        </p>
      ) : (
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {[...history].reverse().map((entry, i) => {
            const isExpanded = expandedIdx === i;
            return (
              <div
                key={i}
                className="border border-ide-border/50 rounded hover:bg-ide-bg/30 cursor-pointer transition-colors"
                onClick={() => setExpandedIdx(isExpanded ? null : i)}
              >
                <div className="flex items-start gap-2 px-2 py-1.5 text-[10px]">
                  <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${entry.fedToNano ? 'bg-green-400' : 'bg-yellow-400'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {isExpanded ? <ChevronDown className="w-3 h-3 text-ide-text-dim flex-shrink-0" /> : <ChevronRight className="w-3 h-3 text-ide-text-dim flex-shrink-0" />}
                      <span className="text-ide-text font-medium">{entry.taskType}</span>
                      <span className="text-ide-text-dim">{entry.model}</span>
                      {entry.fedToNano && <Check className="w-3 h-3 text-green-400" />}
                      <span className="text-ide-text-dim ml-auto">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                    </div>
                    {!isExpanded && (
                      <div className="text-ide-text-dim truncate mt-0.5 ml-5">{entry.outputSnippet}</div>
                    )}
                  </div>
                </div>
                {isExpanded && (
                  <div className="px-3 py-2 border-t border-ide-border/30 bg-ide-bg/20">
                    {entry.inputSnippet && (
                      <div className="mb-2">
                        <div className="text-[9px] text-ide-accent font-semibold mb-0.5">INPUT / PROMPT</div>
                        <pre className="text-[10px] text-ide-text-dim whitespace-pre-wrap break-words max-h-[120px] overflow-y-auto bg-ide-bg/40 rounded p-1.5">
                          {entry.inputSnippet}
                        </pre>
                      </div>
                    )}
                    <div>
                      <div className="text-[9px] text-green-400 font-semibold mb-0.5">OUTPUT / RESPONSE</div>
                      <pre className="text-[10px] text-ide-text whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto bg-ide-bg/40 rounded p-1.5">
                        {entry.fullOutput || entry.outputSnippet}
                      </pre>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-[9px] text-ide-text-dim">
                      <span>Tokens: {entry.tokensUsed?.toLocaleString() || '?'}</span>
                      <span>Quality: {entry.quality || '?'}</span>
                      <span>{entry.fedToNano ? '✅ Fed to trainer' : '⏳ Not yet fed'}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Toggle Row ──
function ToggleRow({
  label, description, value, onChange,
}: {
  label: string; description: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-xs text-ide-text">{label}</div>
        <div className="text-[10px] text-ide-text-dim">{description}</div>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`p-0.5 rounded transition-colors ${value ? 'text-green-400' : 'text-ide-text-dim'}`}
      >
        {value ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
      </button>
    </div>
  );
}
