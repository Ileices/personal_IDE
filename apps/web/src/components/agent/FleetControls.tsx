// ============================================
// Fleet Controls — Fleet agent cards, per-agent controls, message input
// Extracted from AgentControls.tsx for component decomposition
// ============================================
import React, { useState } from 'react';
import {
  Pause, Play, StopCircle, Send,
  Users, Brain, Bug, Beaker, Eye,
} from 'lucide-react';

interface FleetAgent {
  id: string;
  role: string;
  status: 'running' | 'paused' | 'stopped' | 'idle' | 'complete' | 'error';
  currentStep?: number;
  maxSteps?: number;
  currentTask?: string;
  error?: string;
}

interface PendingQuestion {
  questionId: string;
  question: string;
  agentId?: string;
}

interface FleetControlsProps {
  fleetAgents: FleetAgent[];
  isFleetRunning: boolean;
  pendingQuestions: PendingQuestion[];
  // Actions
  pauseAgent: (id: string) => void;
  resumeAgent: (id: string) => void;
  stopAgent: (id: string) => void;
  sendFleetMessage: (msg: string, agentId?: string) => void;
  answerQuestion: (qId: string, answer: string) => void;
}

const ROLE_ICON: Record<string, React.ReactNode> = {
  lead: <Brain className="w-3 h-3" />,
  implementer: <Users className="w-3 h-3" />,
  debugger: <Bug className="w-3 h-3" />,
  tester: <Beaker className="w-3 h-3" />,
  reviewer: <Eye className="w-3 h-3" />,
};

const ROLE_COLOR: Record<string, string> = {
  lead: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  implementer: 'bg-green-500/20 text-green-300 border-green-500/30',
  debugger: 'bg-red-500/20 text-red-300 border-red-500/30',
  tester: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  reviewer: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
};

const STATUS_DOT: Record<string, string> = {
  running: 'bg-green-400 animate-pulse',
  paused: 'bg-yellow-400',
  stopped: 'bg-red-400',
  idle: 'bg-gray-400',
  complete: 'bg-blue-400',
  error: 'bg-red-500 animate-pulse',
};

export function FleetControls({
  fleetAgents, isFleetRunning, pendingQuestions,
  pauseAgent, resumeAgent, stopAgent, sendFleetMessage, answerQuestion,
}: FleetControlsProps) {
  const [fleetMsg, setFleetMsg] = useState('');
  const [msgTarget, setMsgTarget] = useState<string | undefined>(undefined);
  const [answerTexts, setAnswerTexts] = useState<Record<string, string>>({});

  const handleSendMsg = () => {
    if (!fleetMsg.trim()) return;
    sendFleetMessage(fleetMsg.trim(), msgTarget);
    setFleetMsg('');
  };

  return (
    <div className="space-y-2 px-3 py-2 border-b border-ide-border/50">
      {/* Agent Cards */}
      {fleetAgents.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] text-ide-text-dim font-medium">Fleet Agents</span>
          {fleetAgents.map(agent => (
            <div key={agent.id}
              className={`flex items-center gap-2 px-2 py-1.5 rounded border ${ROLE_COLOR[agent.role] || 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[agent.status] || 'bg-gray-400'}`} />
              <span className="flex items-center gap-1 text-[10px] font-medium min-w-[80px]">
                {ROLE_ICON[agent.role] || <Users className="w-3 h-3" />} {agent.role}
              </span>
              <span className="text-[9px] text-ide-text-dim truncate flex-1">
                {agent.error
                  ? `Error: ${agent.error.slice(0, 60)}`
                  : agent.currentTask
                    ? agent.currentTask.slice(0, 80)
                    : agent.status}
              </span>
              {agent.currentStep != null && agent.maxSteps != null && (
                <span className="text-[9px] text-ide-text-dim">{agent.currentStep}/{agent.maxSteps}</span>
              )}
              {/* Per-agent controls */}
              {isFleetRunning && (
                <div className="flex items-center gap-0.5 shrink-0">
                  {agent.status === 'running' ? (
                    <button onClick={() => pauseAgent(agent.id)} className="p-0.5 hover:text-yellow-300" title="Pause">
                      <Pause className="w-3 h-3" />
                    </button>
                  ) : agent.status === 'paused' ? (
                    <button onClick={() => resumeAgent(agent.id)} className="p-0.5 hover:text-green-300" title="Resume">
                      <Play className="w-3 h-3" />
                    </button>
                  ) : null}
                  <button onClick={() => stopAgent(agent.id)} className="p-0.5 hover:text-red-300" title="Stop">
                    <StopCircle className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Fleet Message Input */}
      {isFleetRunning && (
        <div className="flex items-center gap-1">
          <select value={msgTarget || ''} onChange={e => setMsgTarget(e.target.value || undefined)}
            className="bg-ide-bg border border-ide-border/50 rounded px-1 py-0.5 text-[10px] text-ide-text">
            <option value="">All agents</option>
            {fleetAgents.map(a => <option key={a.id} value={a.id}>{a.role}</option>)}
          </select>
          <input type="text" value={fleetMsg} onChange={e => setFleetMsg(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSendMsg()}
            className="flex-1 bg-ide-bg border border-ide-border/50 rounded px-2 py-0.5 text-[10px] text-ide-text"
            placeholder="Send message to fleet..." />
          <button onClick={handleSendMsg}
            className="p-1 text-ide-text-dim hover:text-ide-accent" title="Send"><Send className="w-3 h-3" /></button>
        </div>
      )}

      {/* Pending Questions */}
      {pendingQuestions.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] text-yellow-400 font-medium">⚠ Pending Questions ({pendingQuestions.length})</span>
          {pendingQuestions.map(q => (
            <div key={q.questionId} className="bg-yellow-500/10 border border-yellow-500/30 rounded px-2 py-1.5">
              <p className="text-[10px] text-yellow-200 mb-1">
                {q.agentId && <span className="text-yellow-400 font-medium">[{q.agentId}] </span>}
                {q.question}
              </p>
              <div className="flex items-center gap-1">
                <input type="text"
                  value={answerTexts[q.questionId] || ''}
                  onChange={e => setAnswerTexts(prev => ({ ...prev, [q.questionId]: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && answerTexts[q.questionId]?.trim()) {
                      answerQuestion(q.questionId, answerTexts[q.questionId].trim());
                      setAnswerTexts(prev => ({ ...prev, [q.questionId]: '' }));
                    }
                  }}
                  className="flex-1 bg-ide-bg border border-ide-border/50 rounded px-2 py-0.5 text-[10px] text-ide-text"
                  placeholder="Type answer..." />
                <button onClick={() => {
                    if (answerTexts[q.questionId]?.trim()) {
                      answerQuestion(q.questionId, answerTexts[q.questionId].trim());
                      setAnswerTexts(prev => ({ ...prev, [q.questionId]: '' }));
                    }
                  }}
                  className="px-1.5 py-0.5 text-[10px] bg-yellow-500/20 text-yellow-300 rounded hover:bg-yellow-500/30">
                  Answer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
