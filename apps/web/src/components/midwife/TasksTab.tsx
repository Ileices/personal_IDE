// ============================================
// TasksTab — Per-task model/cooldown config + bulk controls
// Extracted from MidwifePanel.tsx
// ============================================
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Zap, ToggleLeft, ToggleRight } from 'lucide-react';
import type { MidwifeTaskType, TaskModelAssignment } from '../../stores/midwifeStore';
import { ModelDropdown, ModelPoolEditor } from '../UniversalModelPicker';
import { MODELS } from '@personal-ide/shared';

interface TasksTabProps {
  tasks: TaskModelAssignment[];
  allModels: { id: string; name: string; publisher: string }[];
  expandedTask: string | null;
  setExpandedTask: (t: string | null) => void;
  onToggle: (taskType: MidwifeTaskType, enabled: boolean) => void;
  onModelChange: (taskType: MidwifeTaskType, models: string[]) => void;
  onCooldownChange: (taskType: MidwifeTaskType, cooldownMs: number) => void;
}

export function TasksTab({
  tasks, allModels, expandedTask, setExpandedTask, onToggle, onModelChange, onCooldownChange,
}: TasksTabProps) {
  const [showBulk, setShowBulk] = useState(false);
  const [bulkModel, setBulkModel] = useState(MODELS[0]?.id || '');
  const [bulkFallback, setBulkFallback] = useState(MODELS[1]?.id || '');
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
            <div className="space-y-2">
              <span className="text-[10px] text-ide-text-dim">Primary Model (bulk):</span>
              <ModelDropdown value={bulkModel} onChange={setBulkModel} placeholder="Select primary…" />
              <span className="text-[10px] text-ide-text-dim">Fallback Model (bulk):</span>
              <ModelDropdown value={bulkFallback} onChange={setBulkFallback} placeholder="Select fallback…" />
              <button
                onClick={applyBulkModels}
                className="w-full px-2 py-1 text-[10px] bg-ide-accent/20 text-ide-accent hover:bg-ide-accent/30 rounded"
              >
                Apply Models to All Tasks
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
                {/* Model Selection — full universal picker */}
                <ModelPoolEditor
                  title="Assigned Models"
                  description="First = primary, rest = fallbacks. Rotates on rate limit."
                  models={task.assignedModels}
                  onChange={(models) => onModelChange(task.taskType, models)}
                  showBulkActions
                />

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
