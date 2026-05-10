// ============================================
// Midwife Panel â€” Bird-feeding controls (thin shell)
// Sub-components: TasksTab, ConfigTab, HistoryTab, ToggleRow
// ============================================
import React, { useEffect, useState, useCallback } from 'react';
import { useMidwifeStore, type MidwifeTaskType } from '../stores/midwifeStore';
import { useModelStore } from '../stores/modelStore';
import {
  X, Play, Square,
  Bird, Cpu, AlertCircle, Settings2, History as HistoryIcon,
} from 'lucide-react';
import { TasksTab } from './midwife/TasksTab';
import { ConfigTab } from './midwife/ConfigTab';
import { HistoryTab } from './midwife/HistoryTab';

interface Props {
  onClose: () => void;
}

export function MidwifePanel({ onClose }: Props) {
  const {
    config, status, tasks, history, loading, error,
    fetchConfig, updateConfig, fetchTasks, updateTask,
    fetchStatus, fetchHistory, startFeeding, stopFeeding,
  } = useMidwifeStore();
  const { allModels, failedModels, clearSessionSkips, fetchModels } = useModelStore();

  const [activeTab, setActiveTab] = useState<'tasks' | 'config' | 'history'>('tasks');
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [excludeBrokenOnStart, setExcludeBrokenOnStart] = useState(true);

  // Initial fetch
  useEffect(() => {
    fetchConfig();
    fetchTasks();
    fetchStatus();
    fetchHistory();
    void fetchModels();
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

  const modelCatalog: { id: string; name: string; publisher: string }[] = allModels.map((m) => ({
    id: m.id,
    name: m.name,
    publisher: m.publisher,
  }));

  const handleToggleTask = useCallback((taskType: MidwifeTaskType, enabled: boolean) => {
    updateTask(taskType, { enabled });
  }, [updateTask]);

  const handleModelChange = useCallback((taskType: MidwifeTaskType, models: string[]) => {
    updateTask(taskType, { assignedModels: models });
  }, [updateTask]);

  const handleCooldownChange = useCallback((taskType: MidwifeTaskType, cooldownMs: number) => {
    updateTask(taskType, { cooldownMs });
  }, [updateTask]);

  const handleStartFeeding = useCallback(async () => {
    clearSessionSkips();
    if (excludeBrokenOnStart) {
      for (const task of tasks) {
        const filtered = task.assignedModels.filter(modelId => !failedModels[modelId]);
        if (filtered.length !== task.assignedModels.length) {
          await updateTask(task.taskType, { assignedModels: filtered });
        }
      }
      await fetchTasks();
    }
    await startFeeding();
  }, [clearSessionSkips, excludeBrokenOnStart, failedModels, fetchTasks, startFeeding, tasks, updateTask]);

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
                onClick={handleStartFeeding}
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
              <span>ðŸ¦ Task: <strong>{status.currentTask || 'idle'}</strong></span>
              <span>Model: <strong>{status.currentModel || 'â€”'}</strong></span>
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
            { id: 'history' as const, label: 'History', icon: HistoryIcon },
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

        {!status?.isRunning && (
          <div className="px-4 py-2 border-b border-ide-border bg-ide-bg/30 flex items-center gap-2 text-[11px] text-ide-text-dim">
            <input
              type="checkbox"
              checked={excludeBrokenOnStart}
              onChange={e => setExcludeBrokenOnStart(e.target.checked)}
              className="accent-ide-accent"
            />
            Exclude models already marked broken / failed before bulk auto generation starts
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'tasks' && (
            <TasksTab
              tasks={tasks}
              allModels={modelCatalog}
              expandedTask={expandedTask}
              setExpandedTask={setExpandedTask}
              onToggle={handleToggleTask}
              onModelChange={handleModelChange}
              onCooldownChange={handleCooldownChange}
            />
          )}

          {activeTab === 'config' && (
            <ConfigTab config={config} updateConfig={updateConfig} onProvidersChanged={() => void fetchModels()} />
          )}

          {activeTab === 'history' && (
            <HistoryTab history={history} onRefresh={fetchHistory} />
          )}
        </div>
      </div>
    </div>
  );
}
