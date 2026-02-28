// ============================================
// TerminalPanel — dual-mode terminal with tabs
// for user shell and LLM agent shell.
// Pure DOM rendering (no xterm.js dependency).
// ============================================
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTerminalStore, TerminalSession } from '../stores/terminalStore';
import { Terminal, Plus, X, Trash2, Bot, User } from 'lucide-react';

/** Color helpers for output streams */
const streamColor = (stream: string) => {
  if (stream === 'stderr') return 'text-red-400';
  if (stream === 'stdin') return 'text-ide-accent';
  return 'text-green-300';
};

export function TerminalPanel() {
  const {
    sessions, activeSessionId, outputMap,
    fetchSessions, createSession, destroySession,
    setActiveSession, writeInput, clearOutput,
  } = useTerminalStore();

  const [inputValue, setInputValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch existing sessions on mount
  useEffect(() => {
    fetchSessions();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [outputMap, activeSessionId]);

  // SSE connection for real-time output
  useEffect(() => {
    if (!activeSessionId) return;
    const session = sessions.find(s => s.id === activeSessionId);
    if (!session?.alive) return;

    const API = (import.meta.env.VITE_API_URL as string || '').replace(/\/+$/, '');
    const eventSource = new EventSource(`${API}/api/terminal/stream/${activeSessionId}`);
    eventSource.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        useTerminalStore.getState().appendOutput(activeSessionId, {
          text: data.data || '',
          stream: data.stream || 'stdout',
          timestamp: data.timestamp || new Date().toISOString(),
        });
      } catch { /* ignore malformed */ }
    };
    eventSource.onerror = () => {
      eventSource.close();
    };
    return () => eventSource.close();
  }, [activeSessionId, sessions]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !activeSessionId) return;
    writeInput(activeSessionId, inputValue + '\n');
    setHistory(h => [...h, inputValue]);
    setHistoryIdx(-1);
    setInputValue('');
    inputRef.current?.focus();
  }, [inputValue, activeSessionId, writeInput]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const newIdx = historyIdx < 0 ? history.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(newIdx);
      setInputValue(history[newIdx] || '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx < 0) return;
      const newIdx = historyIdx + 1;
      if (newIdx >= history.length) {
        setHistoryIdx(-1);
        setInputValue('');
      } else {
        setHistoryIdx(newIdx);
        setInputValue(history[newIdx] || '');
      }
    }
  };

  const lines = activeSessionId ? (outputMap[activeSessionId] || []) : [];
  const activeSession = sessions.find(s => s.id === activeSessionId);

  if (collapsed) {
    return (
      <div
        className="h-8 bg-ide-bg-darker border-t border-ide-border flex items-center px-3 cursor-pointer hover:bg-ide-bg"
        onClick={() => setCollapsed(false)}
      >
        <Terminal className="w-3.5 h-3.5 text-ide-accent mr-2" />
        <span className="text-xs text-ide-text-dim">Terminal ({sessions.length} session{sessions.length !== 1 ? 's' : ''})</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col border-t border-ide-border bg-ide-bg-darker" style={{ height: 280 }}>
      {/* Tab bar */}
      <div className="flex items-center h-7 bg-ide-bg border-b border-ide-border px-1 gap-0.5 flex-shrink-0">
        {sessions.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSession(s.id)}
            className={`flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-t border-b-2 transition-colors ${
              s.id === activeSessionId
                ? 'border-ide-accent text-ide-text bg-ide-bg-darker'
                : 'border-transparent text-ide-text-dim hover:text-ide-text'
            }`}
          >
            {s.owner === 'agent' ? <Bot className="w-3 h-3" /> : <User className="w-3 h-3" />}
            <span className="truncate max-w-[80px]">{s.label}</span>
            {!s.alive && <span className="text-red-400 text-[9px]">●</span>}
            <X
              className="w-3 h-3 ml-1 opacity-40 hover:opacity-100"
              onClick={(e) => { e.stopPropagation(); destroySession(s.id); }}
            />
          </button>
        ))}

        {/* New session buttons */}
        <button
          onClick={() => createSession('user', 'Shell')}
          className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-ide-text-dim hover:text-ide-text"
          title="New user terminal"
        >
          <Plus className="w-3 h-3" /><User className="w-3 h-3" />
        </button>
        <button
          onClick={() => createSession('agent', 'Agent Shell')}
          className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-ide-text-dim hover:text-ide-text"
          title="New LLM agent terminal"
        >
          <Plus className="w-3 h-3" /><Bot className="w-3 h-3" />
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Actions */}
        {activeSessionId && (
          <button
            onClick={() => clearOutput(activeSessionId)}
            className="p-0.5 text-ide-text-dim hover:text-ide-text"
            title="Clear"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
        <button
          onClick={() => setCollapsed(true)}
          className="p-0.5 text-ide-text-dim hover:text-ide-text ml-1"
          title="Minimize"
        >
          <span className="text-[10px]">▼</span>
        </button>
      </div>

      {/* Output area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden p-2 font-mono text-xs leading-relaxed"
        onClick={() => inputRef.current?.focus()}
      >
        {sessions.length === 0 ? (
          <div className="text-ide-text-dim text-center mt-8">
            <Terminal className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>No terminal sessions.</p>
            <p className="text-[10px] mt-1">Click + to create a user or agent terminal.</p>
          </div>
        ) : lines.length === 0 ? (
          <div className="text-ide-text-dim">
            {activeSession?.alive ? 'Terminal ready. Type a command below.' : 'Session ended.'}
          </div>
        ) : (
          lines.map((line, i) => (
            <div key={i} className={`${streamColor(line.stream)} whitespace-pre-wrap break-all`}>
              {line.text}
            </div>
          ))
        )}
      </div>

      {/* Input line */}
      {activeSession?.alive && (
        <form
          onSubmit={handleSubmit}
          className="flex items-center border-t border-ide-border px-2 py-1 flex-shrink-0"
        >
          <span className="text-ide-accent text-xs mr-1 font-mono">
            {activeSession.owner === 'agent' ? '🤖 $' : '$ '}
          </span>
          <input
            ref={inputRef}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-xs font-mono text-ide-text outline-none"
            placeholder={activeSession.owner === 'agent' ? 'Agent command...' : 'Type a command...'}
            autoFocus
          />
        </form>
      )}
    </div>
  );
}
