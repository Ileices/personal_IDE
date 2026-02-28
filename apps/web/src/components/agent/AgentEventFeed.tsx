// ============================================
// Agent Event Feed — Event log with verbosity, copy, expand/collapse
// Extracted from AgentControls.tsx for component decomposition
// ============================================
import React, { useRef, useEffect, useMemo } from 'react';
import {
  ChevronDown, ChevronRight, Copy, Check,
} from 'lucide-react';
import type { VerbosityLevel } from '../../stores/agentStore';

interface AgentEvent {
  type: string;
  timestamp: string;
  data?: any;
  expanded?: boolean;
}

interface FleetEvent {
  type: string;
  timestamp: string;
  agentId?: string;
  agentRole?: string;
  data?: any;
}

interface AgentEventFeedProps {
  // Single agent
  events: AgentEvent[];
  verbosity: VerbosityLevel;
  setVerbosity: (v: VerbosityLevel) => void;
  toggleEventExpanded: (index: number) => void;
  // Fleet
  isFleetRunning: boolean;
  fleetMode: boolean;
  fleetEvents: FleetEvent[];
  // Actions
  clearEvents: () => void;
  clearFleetEvents: () => void;
  handleCopyFeed: () => void;
  copiedFeed: boolean;
}

export function AgentEventFeed({
  events, verbosity, setVerbosity, toggleEventExpanded,
  isFleetRunning, fleetMode, fleetEvents,
  clearEvents, clearFleetEvents, handleCopyFeed, copiedFeed,
}: AgentEventFeedProps) {
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events, fleetEvents]);

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

  return (
    <div className="flex-1 min-h-0 overflow-y-auto border-t border-ide-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-ide-border/50">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-ide-text-dim">
            {isFleetRunning
              ? `Fleet Events (${fleetEvents.length})`
              : `Events (${filteredEvents.length}/${events.length})`}
          </span>
          {!isFleetRunning && (
            <div className="flex items-center bg-ide-bg rounded overflow-hidden border border-ide-border/50">
              {(['minimal', 'detailed', 'full'] as VerbosityLevel[]).map(level => (
                <button key={level} onClick={() => setVerbosity(level)}
                  className={`px-1.5 py-0.5 text-[9px] transition-colors ${
                    verbosity === level ? 'bg-ide-accent text-white' : 'text-ide-text-dim hover:text-ide-text'
                  }`}>
                  {level === 'minimal' ? 'Min' : level === 'detailed' ? 'Det' : 'Full'}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleCopyFeed}
            className="text-[10px] text-ide-text-dim hover:text-ide-accent flex items-center gap-0.5"
            title="Copy event feed to clipboard">
            {copiedFeed ? <><Check className="w-3 h-3 text-ide-success" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
          </button>
          <button onClick={isFleetRunning ? clearFleetEvents : clearEvents}
            className="text-[10px] text-ide-text-dim hover:text-ide-accent">Clear</button>
        </div>
      </div>

      {/* Fleet Events */}
      {(isFleetRunning || fleetEvents.length > 0) && fleetMode ? (
        <div className="p-1 space-y-0.5">
          {fleetEvents.map((event, i) => (
            <div key={i} className="px-2 py-1 text-[10px] flex items-start gap-1 rounded hover:bg-ide-bg/30">
              <span className="text-ide-text-dim shrink-0">{new Date(event.timestamp).toLocaleTimeString()}</span>
              {event.agentId && (
                <span className={`px-1 rounded font-medium ${
                  event.agentRole === 'lead' ? 'bg-yellow-500/20 text-yellow-300' :
                  event.agentRole === 'implementer' ? 'bg-green-500/20 text-green-300' :
                  event.agentRole === 'debugger' ? 'bg-red-500/20 text-red-300' :
                  event.agentRole === 'tester' ? 'bg-blue-500/20 text-blue-300' :
                  event.agentRole === 'reviewer' ? 'bg-purple-500/20 text-purple-300' :
                  'bg-cyan-500/20 text-cyan-300'
                }`}>{event.agentRole || 'fleet'}</span>
              )}
              <span className={
                event.type.includes('error') ? 'text-ide-error font-medium' :
                event.type.includes('complete') ? 'text-ide-success font-medium' :
                event.type.includes('spawn') ? 'text-cyan-400' :
                event.type.includes('decompose') ? 'text-blue-400' : 'text-ide-text'
              }>[{event.type}]</span>
              <span className="text-ide-text-dim break-words select-text">
                {event.data?.message?.slice(0, 200) || event.data?.summary?.slice(0, 200) || event.data?.error?.slice(0, 200) || ''}
              </span>
            </div>
          ))}
          {fleetEvents.length === 0 && (
            <p className="text-[10px] text-ide-text-dim text-center py-4">Fleet events will appear here...</p>
          )}
          <div ref={logEndRef} />
        </div>
      ) : (
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
                  onClick={() => isExpandable && toggleEventExpanded(realIndex)}>
                  {isExpandable ? (
                    isExpanded
                      ? <ChevronDown className="w-3 h-3 text-ide-text-dim shrink-0 mt-0.5" />
                      : <ChevronRight className="w-3 h-3 text-ide-text-dim shrink-0 mt-0.5" />
                  ) : <span className="w-3 shrink-0" />}

                  <span className="text-ide-text-dim shrink-0">{new Date(event.timestamp).toLocaleTimeString()}</span>
                  <span className={getEventTypeClass(event.type)}>[{event.type}]</span>
                  <span className="text-ide-text-dim break-words select-text">
                    {event.data?.step?.action?.slice(0, 120) || event.data?.summary || event.data?.error ||
                     event.data?.question || event.data?.state || event.data?.message?.slice(0, 120) ||
                     event.data?.change?.path || ''}
                  </span>
                </div>

                {isExpanded && (
                  <div className="mx-6 mb-1 px-2 py-1.5 bg-ide-bg/50 rounded border border-ide-border/30 text-[10px] text-ide-text-dim max-h-40 overflow-y-auto whitespace-pre-wrap font-mono">
                    <ExpandedContent event={event} />
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
      )}
    </div>
  );
}

function getEventTypeClass(type: string): string {
  const map: Record<string, string> = {
    error: 'text-ide-error font-medium',
    run_complete: 'text-ide-success font-medium',
    question_logged: 'text-yellow-400',
    loop_detected: 'text-orange-400 font-medium',
    message_queued: 'text-blue-400',
    file_changed: 'text-green-400',
    chunking_start: 'text-blue-400', chunking_progress: 'text-blue-400',
    chunking_complete: 'text-blue-300', chunking_error: 'text-red-400',
    cooldown: 'text-purple-400', continuous_mode: 'text-purple-300',
    rate_limit_bypass: 'text-orange-400', step_complete: 'text-green-300',
    errors_detected: 'text-yellow-400', tests_failed: 'text-red-400',
    checkpoint_created: 'text-cyan-400',
  };
  return map[type] || 'text-ide-text';
}

function ExpandedContent({ event }: { event: AgentEvent }) {
  if (event.type === 'step_content') {
    return <>{event.data?.delta?.slice(0, 2000) || 'No content'}</>;
  }
  if (event.type === 'step_complete') {
    return (
      <>
        <div className="text-ide-text mb-1">Summary: {event.data?.output?.summary || 'N/A'}</div>
        {event.data?.output?.filesChanged?.length > 0 && (
          <div>Files: {event.data.output.filesChanged.map((f: any) => f.path).join(', ')}</div>
        )}
        {event.data?.output?.nextSteps?.length > 0 && (
          <div className="mt-1">Next: {event.data.output.nextSteps.map((s: any) => s.action).join(', ')}</div>
        )}
      </>
    );
  }
  if (event.type === 'loop_detected') {
    return <div className="text-orange-300">Pattern: {event.data?.pattern || 'Unknown'}</div>;
  }
  if (event.type === 'errors_detected') {
    return <div>{event.data?.errors?.map((e: any, j: number) => <div key={j}>{e.file}:{e.line} — {e.message}</div>)}</div>;
  }
  if (event.type === 'file_changed') {
    return <div>Path: {event.data?.change?.path}<br/>Action: {event.data?.change?.action}<br/>Summary: {event.data?.change?.summary}</div>;
  }
  return <div>{JSON.stringify(event.data, null, 2).slice(0, 1500)}</div>;
}
