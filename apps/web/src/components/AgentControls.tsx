// ============================================
// Agent Controls - Start/stop/pause + event log
// Enhanced v4: fleet mode with multi-agent,
// verbosity modes, expandable entries,
// copy feed, message queue during runs
// ============================================
import React, { useState, useEffect } from 'react';
import { useAgentStore, type VerbosityLevel } from '../stores/agentStore';
import { useFleetStore, type FleetAgentInfo } from '../stores/fleetStore';
import { useProjectStore } from '../stores/projectStore';
import { useChatStore } from '../stores/chatStore';
import {
  Play, Square, Pause, SkipForward, Settings, Clock,
  AlertCircle, CheckCircle, Loader2, MessageSquare, Bot,
  Infinity, Zap, Puzzle, Timer, ShieldOff, Copy, Check,
  ChevronDown, ChevronRight, Send, Eye, EyeOff, Filter,
  Users, UserPlus, Cpu, BookOpen
} from 'lucide-react';
import { MEGA_PROMPTS, type MegaPrompt } from '../data/megaPrompts';
import { AgentSettings } from './agent/AgentSettings';
import { AgentEventFeed } from './agent/AgentEventFeed';

export function AgentControls() {
  const {
    isRunning, state, currentIteration, maxIterations, events, questions,
    stepDelayMs, autoApprove, autoAnswer,
    continuousMode, cooldownMs, bypassRateLimits, enableSmartChunking,
    chunkingActive, chunkingProgress,
    verbosity, queuedMessageCount,
    startAgent, stopAgent, pauseAgent, resumeAgent,
    setStepDelay, setAutoApprove, setAutoAnswer, setMaxIterations, clearEvents,
    setContinuousMode, setCooldownMs, setBypassRateLimits, setEnableSmartChunking,
    setVerbosity, sendQueuedMessage, toggleEventExpanded, copyEventsToClipboard,
  } = useAgentStore();
  const { activeProject } = useProjectStore();
  const { selectedModel } = useChatStore();
  const [task, setTask] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [queueInput, setQueueInput] = useState('');
  const [queuePriority, setQueuePriority] = useState<'normal' | 'high'>('normal');
  const [copiedFeed, setCopiedFeed] = useState(false);
  const [fleetMode, setFleetMode] = useState(false);
  const [fleetMessage, setFleetMessage] = useState('');
  const [showPresets, setShowPresets] = useState(false);

  // Fleet store
  const {
    isFleetRunning, fleetState, agents: fleetAgents, events: fleetEvents,
    totalIterations, totalFilesChanged, totalTokensUsed,
    maxAgents, selectedAgentCount,
    startFleet, stopFleet, pauseFleet, resumeFleet,
    sendFleetMessage: sendFleetMsg,
    pauseAgent: pauseFleetAgent, resumeAgent: resumeFleetAgent, stopAgent: stopFleetAgent,
    fetchMaxAgents, setSelectedAgentCount, clearFleetEvents,
    connectFleetEvents, disconnectFleetEvents,
  } = useFleetStore();

  // Fetch max agents on mount
  useEffect(() => { fetchMaxAgents(); }, []);

  // Connect fleet SSE when fleet is running
  useEffect(() => {
    if (isFleetRunning) {
      connectFleetEvents();
      return () => disconnectFleetEvents();
    }
  }, [isFleetRunning]);


  const handleStart = () => {
    if (!task.trim() || !activeProject) return;
    if (fleetMode) {
      startFleet(activeProject.id, task.trim(), selectedModel);
      setTask('');
    } else {
      startAgent(activeProject.id, task.trim(), selectedModel);
      setTask('');
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
          <span className="text-xs font-medium">{fleetMode ? 'Agent Fleet' : 'Agent Loop'}</span>
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
        </div>
        <div className="flex items-center gap-1">
          {isRunning && (
            <span className="text-[10px] text-ide-text-dim">
              {continuousMode ? `∞ (${currentIteration})` : `${currentIteration}/${maxIterations}`}
            </span>
          )}
          <button
            onClick={() => setShowSettings(!showSettings)}
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
          continuousMode={continuousMode}
          setContinuousMode={setContinuousMode}
          bypassRateLimits={bypassRateLimits}
          setBypassRateLimits={setBypassRateLimits}
          enableSmartChunking={enableSmartChunking}
          setEnableSmartChunking={setEnableSmartChunking}
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
          isRunning={isRunning}
          isFleetRunning={isFleetRunning}
        />
      )}
      {/* Task Input + Controls */}
      {!isRunning && !isFleetRunning && (
        <div className="p-2">
          {/* Mega-Prompt Presets */}
          <div className="mb-2">
            <button
              onClick={() => setShowPresets(!showPresets)}
              className="flex items-center gap-1 text-[10px] text-ide-text-dim hover:text-ide-accent mb-1"
            >
              <BookOpen className="w-3 h-3" />
              Mega-Prompts
              {showPresets ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
            {showPresets && (
              <div className="space-y-1 mb-2">
                {MEGA_PROMPTS.map(preset => (
                  <button
                    key={preset.id}
                    onClick={() => {
                      setTask(preset.prompt);
                      if (preset.fleetRecommended) {
                        setFleetMode(true);
                        setSelectedAgentCount(Math.min(preset.recommendedAgentCount, maxAgents));
                      }
                      setShowPresets(false);
                    }}
                    className="w-full text-left px-2 py-1.5 bg-ide-bg/50 hover:bg-ide-bg border border-ide-border/50 rounded text-[10px] transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-ide-text">{preset.name}</span>
                      {preset.fleetRecommended && (
                        <span className="px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[8px]">Fleet ×{preset.recommendedAgentCount}</span>
                      )}
                    </div>
                    <div className="text-ide-text-dim mt-0.5">{preset.description}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
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
    </div>
  );
}
