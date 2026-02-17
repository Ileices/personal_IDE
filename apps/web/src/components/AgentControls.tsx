// ============================================
// Agent Controls - Start/stop/pause + event log
// Enhanced v3: verbosity modes, expandable entries,
// copy feed, message queue during runs
// ============================================
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useAgentStore, type VerbosityLevel } from '../stores/agentStore';
import { useProjectStore } from '../stores/projectStore';
import { useChatStore } from '../stores/chatStore';
import {
  Play, Square, Pause, SkipForward, Settings, Clock,
  AlertCircle, CheckCircle, Loader2, MessageSquare, Bot,
  Infinity, Zap, Puzzle, Timer, ShieldOff, Copy, Check,
  ChevronDown, ChevronRight, Send, Eye, EyeOff, Filter
} from 'lucide-react';

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
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll event log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  const handleStart = () => {
    if (!task.trim() || !activeProject) return;
    startAgent(activeProject.id, task.trim(), selectedModel);
    setTask('');
  };

  const handleQueueMessage = () => {
    if (!queueInput.trim()) return;
    sendQueuedMessage(queueInput.trim(), queuePriority);
    setQueueInput('');
  };

  const handleCopyFeed = () => {
    copyEventsToClipboard();
    setCopiedFeed(true);
    setTimeout(() => setCopiedFeed(false), 2000);
  };

  // Filter events by verbosity
  const filteredEvents = useMemo(() => {
    if (verbosity === 'full') return events;

    const minimalTypes = new Set([
      'error', 'run_complete', 'step_complete', 'file_changed',
      'errors_detected', 'tests_failed', 'checkpoint_created',
      'loop_detected', 'message_queued',
    ]);

    const detailedTypes = new Set([
      ...minimalTypes,
      'state_change', 'step_start', 'info', 'auto_answer',
      'question_logged', 'chunking_start', 'chunking_complete',
      'chunking_error', 'cooldown', 'continuous_mode',
      'rate_limit_bypass',
    ]);

    const allowed = verbosity === 'minimal' ? minimalTypes : detailedTypes;
    return events.filter(e => allowed.has(e.type));
  }, [events, verbosity]);

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
    <div className="flex flex-col h-full bg-ide-sidebar border-t border-ide-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-ide-border">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-medium">Agent Loop</span>
          <div className="flex items-center gap-1 text-[10px] text-ide-text-dim">
            {stateIcons[state] || stateIcons.idle}
            <span className="capitalize">{state}</span>
          </div>
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
        <div className="p-3 border-b border-ide-border bg-ide-bg/50 space-y-2 max-h-64 overflow-y-auto">
          {/* 24/7 Continuous Mode Toggle */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-ide-text-dim flex items-center gap-1">
              <Infinity className="w-3 h-3 text-purple-400" /> 24/7 Mode
            </label>
            <button
              onClick={() => setContinuousMode(!continuousMode)}
              className={`relative w-8 h-4 rounded-full transition-colors ${
                continuousMode ? 'bg-purple-500' : 'bg-ide-border'
              }`}
              disabled={isRunning}
            >
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                continuousMode ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

          {/* Rate Limit Bypass Toggle */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-ide-text-dim flex items-center gap-1">
              <ShieldOff className="w-3 h-3 text-orange-400" /> Bypass Rate Limits
            </label>
            <button
              onClick={() => setBypassRateLimits(!bypassRateLimits)}
              className={`relative w-8 h-4 rounded-full transition-colors ${
                bypassRateLimits ? 'bg-orange-500' : 'bg-ide-border'
              }`}
              disabled={isRunning}
            >
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                bypassRateLimits ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

          {/* Smart Chunking Toggle */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-ide-text-dim flex items-center gap-1">
              <Puzzle className="w-3 h-3 text-blue-400" /> Smart Chunking
            </label>
            <button
              onClick={() => setEnableSmartChunking(!enableSmartChunking)}
              className={`relative w-8 h-4 rounded-full transition-colors ${
                enableSmartChunking ? 'bg-blue-500' : 'bg-ide-border'
              }`}
              disabled={isRunning}
            >
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                enableSmartChunking ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

          <div className="border-t border-ide-border/50 my-1" />

          {/* Cooldown Slider */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-ide-text-dim flex items-center gap-1">
              <Timer className="w-3 h-3" /> Cooldown
            </label>
            <div className="flex items-center gap-1">
              <input
                type="range"
                value={cooldownMs}
                onChange={e => setCooldownMs(parseInt(e.target.value))}
                min={0}
                max={60000}
                step={1000}
                className="w-16"
                disabled={isRunning}
              />
              <span className="text-[10px] text-ide-text-dim w-10">
                {cooldownMs === 0 ? 'Off' : `${(cooldownMs / 1000).toFixed(0)}s`}
              </span>
            </div>
          </div>

          {/* Max Iterations (hidden in 24/7 mode) */}
          {!continuousMode && (
            <div className="flex items-center justify-between">
              <label className="text-xs text-ide-text-dim">Max Iterations</label>
              <input
                type="number"
                value={maxIterations}
                onChange={e => setMaxIterations(parseInt(e.target.value) || 50)}
                className="w-16 bg-ide-bg border border-ide-border rounded px-2 py-0.5 text-xs text-right focus:outline-none"
                min={1}
                max={1000}
                disabled={isRunning}
              />
            </div>
          )}

          {/* Step Delay */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-ide-text-dim flex items-center gap-1">
              <Clock className="w-3 h-3" /> Step Delay
            </label>
            <div className="flex items-center gap-1">
              <input
                type="range"
                value={stepDelayMs}
                onChange={e => setStepDelay(parseInt(e.target.value))}
                min={500}
                max={10000}
                step={500}
                className="w-20"
              />
              <span className="text-[10px] text-ide-text-dim w-10">{(stepDelayMs / 1000).toFixed(1)}s</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-xs text-ide-text-dim">Auto-approve file changes</label>
            <input
              type="checkbox"
              checked={autoApprove}
              onChange={e => setAutoApprove(e.target.checked)}
              className="accent-ide-accent"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-ide-text-dim">Auto-answer questions</label>
            <input
              type="checkbox"
              checked={autoAnswer}
              onChange={e => setAutoAnswer(e.target.checked)}
              className="accent-ide-accent"
            />
          </div>

          {/* Info badges */}
          <div className="flex flex-wrap gap-1 pt-1">
            {continuousMode && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">∞ 24/7</span>
            )}
            {bypassRateLimits && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300">⚡ No Limits</span>
            )}
            {enableSmartChunking && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">🧩 Chunking</span>
            )}
            {cooldownMs > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-ide-bg text-ide-text-dim">⏱ {cooldownMs/1000}s</span>
            )}
          </div>
        </div>
      )}

      {/* Task Input + Controls */}
      {!isRunning && (
        <div className="p-2">
          <textarea
            value={task}
            onChange={e => setTask(e.target.value)}
            placeholder="Describe the task for the agent..."
            rows={2}
            className="w-full bg-ide-bg border border-ide-border rounded px-2.5 py-2 text-xs focus:outline-none focus:border-ide-accent resize-none mb-2"
            disabled={!activeProject}
          />
          <button
            onClick={handleStart}
            disabled={!task.trim() || !activeProject}
            className="w-full flex items-center justify-center gap-1.5 bg-purple-600 text-white text-xs py-2 rounded font-medium hover:bg-purple-500 disabled:opacity-30 transition-colors"
          >
            <Play className="w-3.5 h-3.5" /> Start Agent
          </button>
        </div>
      )}

      {isRunning && (
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

      {/* Message Queue Input (visible during runs) */}
      {isRunning && (
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
      <div className="flex-1 overflow-y-auto border-t border-ide-border">
        {/* Event Log Header with verbosity + copy */}
        <div className="flex items-center justify-between px-3 py-1 border-b border-ide-border/50">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-ide-text-dim">Events ({filteredEvents.length}/{events.length})</span>
            {/* Verbosity Selector */}
            <div className="flex items-center bg-ide-bg rounded overflow-hidden border border-ide-border/50">
              {(['minimal', 'detailed', 'full'] as VerbosityLevel[]).map(level => (
                <button
                  key={level}
                  onClick={() => setVerbosity(level)}
                  className={`px-1.5 py-0.5 text-[9px] transition-colors ${
                    verbosity === level
                      ? 'bg-ide-accent text-white'
                      : 'text-ide-text-dim hover:text-ide-text'
                  }`}
                >
                  {level === 'minimal' ? 'Min' : level === 'detailed' ? 'Det' : 'Full'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleCopyFeed}
              className="text-[10px] text-ide-text-dim hover:text-ide-accent flex items-center gap-0.5"
              title="Copy event feed to clipboard"
            >
              {copiedFeed ? <Check className="w-3 h-3 text-ide-success" /> : <Copy className="w-3 h-3" />}
            </button>
            <button onClick={clearEvents} className="text-[10px] text-ide-text-dim hover:text-ide-accent">Clear</button>
          </div>
        </div>
        <div className="p-1 space-y-0.5">
          {filteredEvents.map((event, i) => {
            const realIndex = events.indexOf(event);
            const isExpandable = event.data && (
              event.data.delta || event.data.change || event.data.output ||
              event.data.errors || event.data.result || event.type === 'step_content' ||
              event.type === 'step_complete' || event.type === 'loop_detected'
            );
            const isExpanded = event.expanded;

            return (
              <div key={i} className="rounded hover:bg-ide-bg/30">
                <div
                  className={`px-2 py-1 text-[10px] flex items-start gap-1 ${isExpandable ? 'cursor-pointer' : ''}`}
                  onClick={() => isExpandable && toggleEventExpanded(realIndex)}
                >
                  {/* Expand/collapse icon */}
                  {isExpandable ? (
                    isExpanded
                      ? <ChevronDown className="w-3 h-3 text-ide-text-dim shrink-0 mt-0.5" />
                      : <ChevronRight className="w-3 h-3 text-ide-text-dim shrink-0 mt-0.5" />
                  ) : (
                    <span className="w-3 shrink-0" />
                  )}

                  <span className="text-ide-text-dim shrink-0">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={
                    event.type === 'error' ? 'text-ide-error font-medium' :
                    event.type === 'run_complete' ? 'text-ide-success font-medium' :
                    event.type === 'question_logged' ? 'text-yellow-400' :
                    event.type === 'loop_detected' ? 'text-orange-400 font-medium' :
                    event.type === 'message_queued' ? 'text-blue-400' :
                    event.type === 'file_changed' ? 'text-green-400' :
                    event.type === 'chunking_start' || event.type === 'chunking_progress' ? 'text-blue-400' :
                    event.type === 'chunking_complete' ? 'text-blue-300' :
                    event.type === 'chunking_error' ? 'text-red-400' :
                    event.type === 'cooldown' ? 'text-purple-400' :
                    event.type === 'continuous_mode' ? 'text-purple-300' :
                    event.type === 'rate_limit_bypass' ? 'text-orange-400' :
                    event.type === 'step_complete' ? 'text-green-300' :
                    event.type === 'errors_detected' ? 'text-yellow-400' :
                    event.type === 'tests_failed' ? 'text-red-400' :
                    event.type === 'checkpoint_created' ? 'text-cyan-400' :
                    'text-ide-text'
                  }>
                    [{event.type}]
                  </span>
                  <span className="text-ide-text-dim truncate">
                    {event.data?.step?.action?.slice(0, 120) || event.data?.summary || event.data?.error || event.data?.question || event.data?.state || event.data?.message?.slice(0, 120) || event.data?.change?.path || ''}
                  </span>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="mx-6 mb-1 px-2 py-1.5 bg-ide-bg/50 rounded border border-ide-border/30 text-[10px] text-ide-text-dim max-h-40 overflow-y-auto whitespace-pre-wrap font-mono">
                    {event.type === 'step_content' && (event.data?.delta?.slice(0, 2000) || 'No content')}
                    {event.type === 'step_complete' && (
                      <>
                        <div className="text-ide-text mb-1">Summary: {event.data?.output?.summary || 'N/A'}</div>
                        {event.data?.output?.filesChanged?.length > 0 && (
                          <div>Files: {event.data.output.filesChanged.map((f: any) => f.path).join(', ')}</div>
                        )}
                        {event.data?.output?.nextSteps?.length > 0 && (
                          <div className="mt-1">Next: {event.data.output.nextSteps.map((s: any) => s.action).join(', ')}</div>
                        )}
                      </>
                    )}
                    {event.type === 'loop_detected' && (
                      <div className="text-orange-300">Pattern: {event.data?.pattern || 'Unknown'}</div>
                    )}
                    {event.type === 'errors_detected' && (
                      <div>{event.data?.errors?.map((e: any, j: number) => <div key={j}>{e.file}:{e.line} — {e.message}</div>)}</div>
                    )}
                    {event.type === 'file_changed' && (
                      <div>Path: {event.data?.change?.path}<br/>Action: {event.data?.change?.action}<br/>Summary: {event.data?.change?.summary}</div>
                    )}
                    {!['step_content', 'step_complete', 'loop_detected', 'errors_detected', 'file_changed'].includes(event.type) && (
                      <div>{JSON.stringify(event.data, null, 2).slice(0, 1500)}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filteredEvents.length === 0 && (
            <p className="text-[10px] text-ide-text-dim text-center py-4">
              {events.length === 0
                ? 'No events yet. Start the agent to see activity here.'
                : `${events.length} events hidden by "${verbosity}" filter.`}
            </p>
          )}
          <div ref={logEndRef} />
        </div>
      </div>

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
