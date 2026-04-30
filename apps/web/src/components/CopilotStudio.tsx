// ============================================
// The God Factory — Self-Improvement Agent Chat
//
// This is an in-app replacement for GitHub Copilot.
// Talk to an agent that can:
//   - Read/write any file in the codebase
//   - Run terminal commands (PowerShell/bash)
//   - Build, test, and fix the IDE itself
//   - Keep full prompt history
//   - Auto-backup before making edits
//   - Browse the web for solutions
// ============================================
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles, Send, Square, RotateCcw, History, ChevronDown,
  ChevronRight, Copy, Check, Trash2, Download, Upload,
  AlertTriangle, CheckCircle, Loader2, Clock, FolderOpen,
  Play, Archive, Zap, BookOpen, Settings, X, Plus,
} from 'lucide-react';
import { useProjectStore } from '../stores/projectStore';
import { useChatStore } from '../stores/chatStore';
import { API_BASE } from '../config.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StudioMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  model?: string;
  tokenCount?: number;
  backupPath?: string;  // Path of auto-backup taken before this edit
  status?: 'pending' | 'streaming' | 'done' | 'error';
}

interface PromptHistoryItem {
  id: string;
  prompt: string;
  usedAt: string;
  timesUsed: number;
  lastModel?: string;
}

// ─── Saved Prompts from localStorage ─────────────────────────────────────────

const HISTORY_KEY = 'studio_prompt_history';
const CONV_KEY = 'studio_conversation';

function loadHistory(): PromptHistoryItem[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function saveHistory(items: PromptHistoryItem[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 200))); } catch {}
}
function saveConversation(msgs: StudioMessage[]) {
  try { localStorage.setItem(CONV_KEY, JSON.stringify(msgs.slice(-100))); } catch {}
}
function loadConversation(): StudioMessage[] {
  try { return JSON.parse(localStorage.getItem(CONV_KEY) || '[]'); } catch { return []; }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CopilotStudio() {
  const { activeProject } = useProjectStore();
  const { selectedModel } = useChatStore();

  const [messages, setMessages] = useState<StudioMessage[]>(loadConversation);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<PromptHistoryItem[]>(loadHistory);
  const [historySearch, setHistorySearch] = useState('');
  const [autoBackup, setAutoBackup] = useState(true);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [showFileSelector, setShowFileSelector] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Persist conversation
  useEffect(() => { saveConversation(messages); }, [messages]);
  useEffect(() => { saveHistory(history); }, [history]);

  const addToHistory = useCallback((prompt: string, model?: string) => {
    setHistory(prev => {
      const existing = prev.find(h => h.prompt === prompt);
      if (existing) {
        return prev.map(h => h.prompt === prompt
          ? { ...h, timesUsed: h.timesUsed + 1, usedAt: new Date().toISOString(), lastModel: model }
          : h
        );
      }
      return [{ id: Date.now().toString(), prompt, usedAt: new Date().toISOString(), timesUsed: 1, lastModel: model }, ...prev];
    });
  }, []);

  const takeBackup = async (): Promise<string | null> => {
    if (!autoBackup || !activeProject) return null;
    try {
      const res = await fetch(`${API_BASE}/api/files/backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectRoot: activeProject.rootPath }),
      });
      const data = await res.json();
      return data.backupPath || null;
    } catch { return null; }
  };

  const sendMessage = async (prompt: string) => {
    if (!prompt.trim() || isStreaming) return;
    const trimmed = prompt.trim();
    setInput('');

    // Add user message
    const userMsg: StudioMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
      status: 'done',
    };
    setMessages(prev => [...prev, userMsg]);
    addToHistory(trimmed, selectedModel);

    // Take backup before potentially destructive operations
    let backupPath: string | null = null;
    const looksDestructive = /\b(write|edit|delete|remove|replace|refactor|rename|create|overwrite)\b/i.test(trimmed);
    if (looksDestructive) {
      setBackupStatus('Backing up...');
      backupPath = await takeBackup();
      setBackupStatus(backupPath ? `Backup: ${backupPath.split('/').pop()}` : null);
      setTimeout(() => setBackupStatus(null), 4000);
    }

    // Add streaming assistant message
    const assistantMsg: StudioMessage = {
      id: `a-${Date.now()}`,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      model: selectedModel,
      status: 'streaming',
      backupPath: backupPath || undefined,
    };
    setMessages(prev => [...prev, assistantMsg]);
    setIsStreaming(true);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      // Build context message with project info + file context
      const systemContext = [
        `You are a Principal Software Architect AI integrated into Personal IDE.`,
        `You can use tools to read/write files, run terminal commands, search the web, and build software.`,
        `Active project: ${activeProject?.name || 'None'} at ${activeProject?.rootPath || 'N/A'}`,
        selectedFiles.length > 0 ? `Context files: ${selectedFiles.join(', ')}` : '',
        `Current model: ${selectedModel}`,
        `When the user asks you to modify code, always describe what you changed and why.`,
        `Be direct and actionable. No apologies, no unnecessary caveats.`,
      ].filter(Boolean).join('\n');

      const conversationHistory = messages.slice(-20).map(m => ({
        role: m.role === 'system' ? 'user' : m.role,
        content: m.content,
      }));

      const res = await fetch(`${API_BASE}/api/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abort.signal,
        body: JSON.stringify({
          message: trimmed,
          model: selectedModel,
          mode: 'agent',
          projectId: activeProject?.id,
          contextFiles: selectedFiles.length > 0 ? selectedFiles : undefined,
          systemPrompt: systemContext,
          autoInjectMemory: true,
          conversationId: undefined,  // Fresh or use stored
        }),
      });

      if (!res.ok || !res.body) throw new Error(`Server error: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const ev = JSON.parse(data);
            if (ev.type === 'content_delta' && ev.delta) {
              fullContent += ev.delta;
              setMessages(prev => prev.map(m =>
                m.id === assistantMsg.id ? { ...m, content: fullContent } : m
              ));
            } else if (ev.type === 'done') {
              setMessages(prev => prev.map(m =>
                m.id === assistantMsg.id
                  ? { ...m, status: 'done', tokenCount: ev.usage?.totalTokens, content: ev.fullContent || fullContent }
                  : m
              ));
            }
          } catch { /* skip malformed SSE */ }
        }
      }

      setMessages(prev => prev.map(m =>
        m.id === assistantMsg.id ? { ...m, status: 'done', content: fullContent || m.content } : m
      ));
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsg.id ? { ...m, status: 'done', content: m.content + '\n\n_[Stopped by user]_' } : m
        ));
      } else {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsg.id ? { ...m, status: 'error', content: `Error: ${err.message}` } : m
        ));
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
  };

  const clearConversation = () => {
    setMessages([]);
    try { localStorage.removeItem(CONV_KEY); } catch {}
  };

  const copyMessage = (content: string, id: string) => {
    navigator.clipboard.writeText(content).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  const exportConversation = () => {
    const text = messages.map(m => `[${m.role.toUpperCase()}] ${m.timestamp}\n${m.content}`).join('\n\n---\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `studio-session-${Date.now()}.txt`;
    a.click(); URL.revokeObjectURL(url);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const filteredHistory = history.filter(h =>
    !historySearch || h.prompt.toLowerCase().includes(historySearch.toLowerCase())
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Prompt History Sidebar ──────────────────────────── */}
      {showHistory && (
        <div className="w-72 flex-shrink-0 bg-ide-panel border-r border-ide-border flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-ide-border">
            <span className="text-xs font-semibold text-ide-text">Prompt History</span>
            <button onClick={() => setShowHistory(false)} className="text-ide-text-dim hover:text-ide-text">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="p-2 border-b border-ide-border">
            <input
              value={historySearch}
              onChange={e => setHistorySearch(e.target.value)}
              placeholder="Search prompts..."
              className="w-full bg-ide-bg border border-ide-border rounded px-2 py-1 text-xs focus:outline-none focus:border-ide-accent"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredHistory.length === 0 && (
              <div className="p-3 text-xs text-ide-text-dim text-center">No saved prompts yet</div>
            )}
            {filteredHistory.map(h => (
              <div key={h.id} className="border-b border-ide-border/50 p-2 group hover:bg-ide-bg/30">
                <button
                  onClick={() => { setInput(h.prompt); setShowHistory(false); inputRef.current?.focus(); }}
                  className="w-full text-left text-xs text-ide-text line-clamp-3 mb-1"
                >
                  {h.prompt}
                </button>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-ide-text-dim">
                    Used {h.timesUsed}x · {new Date(h.usedAt).toLocaleDateString()}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={() => sendMessage(h.prompt)}
                      className="text-[10px] px-1.5 py-0.5 bg-ide-accent/20 text-ide-accent rounded hover:bg-ide-accent/30"
                      title="Re-send (iterate)"
                    >
                      <Play className="w-2.5 h-2.5" />
                    </button>
                    <button
                      onClick={() => setHistory(prev => prev.filter(x => x.id !== h.id))}
                      className="text-[10px] px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="p-2 border-t border-ide-border space-y-1.5">
            <button
              onClick={() => {
                // Chunk and compress history into a mega-prompt
                const prompts = history.slice(0, 20).map(h => h.prompt).join('\n- ');
                setInput(`Review and enhance the following previous prompts, combining them into a comprehensive improvement plan:\n- ${prompts}`);
                setShowHistory(false);
              }}
              className="w-full text-xs py-1.5 bg-ide-accent/15 text-ide-accent rounded hover:bg-ide-accent/25 flex items-center justify-center gap-1.5"
            >
              <Zap className="w-3 h-3" />
              Generate Mega-Prompt from History
            </button>
          </div>
        </div>
      )}

      {/* ── Main Chat Area ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-ide-border bg-ide-panel flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-ide-accent" />
            <span className="text-sm font-semibold text-ide-text">Copilot Studio</span>
            <span className="text-xs text-ide-text-dim px-2 py-0.5 bg-ide-accent/10 rounded-full">
              Self-Improvement Agent
            </span>
            {activeProject && (
              <span className="text-xs text-ide-text-dim">
                · {activeProject.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {backupStatus && (
              <span className="text-[10px] text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Archive className="w-2.5 h-2.5" />
                {backupStatus}
              </span>
            )}
            {/* Auto-backup toggle */}
            <button
              onClick={() => setAutoBackup(v => !v)}
              className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition-colors ${
                autoBackup ? 'border-green-500/40 text-green-400 bg-green-500/10' : 'border-ide-border text-ide-text-dim'
              }`}
              title="Auto-backup before edits"
            >
              <Archive className="w-3 h-3" />
              {autoBackup ? 'Backup ON' : 'Backup OFF'}
            </button>
            {/* File context selector */}
            <button
              onClick={() => setShowFileSelector(v => !v)}
              className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition-colors ${
                selectedFiles.length > 0 ? 'border-ide-accent/40 text-ide-accent bg-ide-accent/10' : 'border-ide-border text-ide-text-dim hover:text-ide-text'
              }`}
              title="Select files to inject as context"
            >
              <FolderOpen className="w-3 h-3" />
              {selectedFiles.length > 0 ? `${selectedFiles.length} files` : 'File context'}
            </button>
            <button onClick={() => setShowHistory(v => !v)} className="p-1.5 text-ide-text-dim hover:text-ide-accent rounded hover:bg-ide-accent/10 transition-colors" title="Prompt history">
              <History className="w-3.5 h-3.5" />
            </button>
            <button onClick={exportConversation} className="p-1.5 text-ide-text-dim hover:text-ide-text rounded hover:bg-ide-bg/50 transition-colors" title="Export conversation">
              <Download className="w-3.5 h-3.5" />
            </button>
            <button onClick={clearConversation} className="p-1.5 text-red-400/70 hover:text-red-400 rounded hover:bg-red-400/10 transition-colors" title="Clear conversation">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* File context selector dropdown */}
        {showFileSelector && (
          <FileContextSelector
            projectRoot={activeProject?.rootPath}
            selected={selectedFiles}
            onToggle={(path) => setSelectedFiles(prev =>
              prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
            )}
            onClose={() => setShowFileSelector(false)}
          />
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <WelcomeScreen onSend={sendMessage} />
          )}
          {messages.map(msg => (
            <MessageBubble
              key={msg.id}
              message={msg}
              copied={copied === msg.id}
              onCopy={() => copyMessage(msg.content, msg.id)}
            />
          ))}
          {isStreaming && (
            <div className="flex items-center gap-2 text-xs text-ide-text-dim">
              <Loader2 className="w-3 h-3 animate-spin text-ide-accent" />
              <span>Thinking...</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className="flex-shrink-0 border-t border-ide-border p-3">
          <div className="flex gap-2 items-end">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask the studio agent to build features, fix bugs, explain code, or enhance the IDE...  (Enter to send, Shift+Enter for newline)"
                className="w-full bg-ide-bg border border-ide-border rounded-lg px-3 py-2.5 text-sm text-ide-text placeholder-ide-text-dim resize-none focus:outline-none focus:border-ide-accent transition-colors min-h-[60px] max-h-[200px]"
                rows={2}
              />
              <div className="absolute bottom-2 right-2 text-[10px] text-ide-text-dim">
                Shift+Enter ↵ · Enter ⇒
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              {isStreaming ? (
                <button
                  onClick={stopStreaming}
                  className="w-9 h-9 flex items-center justify-center bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
                  title="Stop"
                >
                  <Square className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim()}
                  className="w-9 h-9 flex items-center justify-center bg-ide-accent text-ide-panel rounded-lg hover:bg-ide-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Send (Enter)"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          {selectedFiles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {selectedFiles.map(f => (
                <span key={f} className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-ide-accent/10 text-ide-accent rounded-full">
                  {f.split('/').pop()}
                  <button onClick={() => setSelectedFiles(prev => prev.filter(x => x !== f))}>
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Welcome Screen ───────────────────────────────────────────────────────────

function WelcomeScreen({ onSend }: { onSend: (msg: string) => void }) {
  const starters = [
    { label: 'Analyze the codebase', prompt: 'Analyze the entire Personal IDE codebase. Identify what is incomplete, what has bugs, what features are built but not wired into the GUI, and give me a prioritized action plan.' },
    { label: 'Fix all TypeScript errors', prompt: 'Find and fix all TypeScript compilation errors in the web app and server. Run tsc --noEmit and fix everything that fails.' },
    { label: 'Audit & improve the agent pipeline', prompt: 'Audit the agent pipeline end-to-end. Why does the agent stall on new projects? Why does it sometimes fail to execute tools? Fix all issues.' },
    { label: 'Wire all new features into GUI', prompt: 'Review all components and stores in apps/web/src. Find anything that is implemented but not accessible in the GUI. Wire everything in properly.' },
    { label: 'Benchmark hardware', prompt: 'Detect all hardware on this machine (CPU, GPU, RAM, storage, network). Recommend which local AI models are appropriate for this hardware profile.' },
    { label: 'Research & add models', prompt: 'Research the current best free AI models from Groq, Cerebras, Gemini, SiliconFlow, ZhipuAI, and Fireworks. Add them all to the model registry with correct IDs.' },
  ];

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Sparkles className="w-8 h-8 text-ide-accent" />
        </div>
        <h2 className="text-xl font-semibold text-ide-text mb-2">Copilot Studio</h2>
        <p className="text-sm text-ide-text-dim leading-relaxed">
          Your in-app AI architect. Build features, fix bugs, enhance the IDE — without leaving the app.
          This agent has full access to your codebase, terminal, and the web.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {starters.map(s => (
          <button
            key={s.label}
            onClick={() => onSend(s.prompt)}
            className="p-3 text-left bg-ide-panel border border-ide-border rounded-lg hover:border-ide-accent/50 hover:bg-ide-accent/5 transition-all group"
          >
            <div className="text-xs font-medium text-ide-text group-hover:text-ide-accent mb-1">{s.label}</div>
            <div className="text-[10px] text-ide-text-dim line-clamp-2">{s.prompt.slice(0, 80)}...</div>
          </button>
        ))}
      </div>
      <div className="mt-6 p-3 bg-ide-accent/5 border border-ide-accent/20 rounded-lg">
        <p className="text-[10px] text-ide-text-dim text-center">
          💡 <strong className="text-ide-text">Tip:</strong> Use the History button (top right) to re-send previous prompts.
          Enable <strong className="text-ide-text">Auto-backup</strong> to preserve your code before AI edits.
        </p>
      </div>
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message: msg, copied, onCopy }: {
  message: StudioMessage;
  copied: boolean;
  onCopy: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const isUser = msg.role === 'user';
  const isStreaming = msg.status === 'streaming';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold ${
        isUser ? 'bg-ide-accent/20 text-ide-accent' : 'bg-purple-500/20 text-purple-400'
      }`}>
        {isUser ? 'You' : <Sparkles className="w-3.5 h-3.5" />}
      </div>

      {/* Bubble */}
      <div className={`flex-1 max-w-[85%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        {/* Meta */}
        <div className={`flex items-center gap-2 text-[10px] text-ide-text-dim ${isUser ? 'flex-row-reverse' : ''}`}>
          <span>{isUser ? 'You' : (msg.model?.split('/').pop() || 'Assistant')}</span>
          <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
          {msg.tokenCount && <span>{msg.tokenCount} tokens</span>}
          {msg.backupPath && (
            <span className="text-green-400 flex items-center gap-0.5">
              <Archive className="w-2.5 h-2.5" />
              backed up
            </span>
          )}
          {msg.status === 'error' && <span className="text-red-400 flex items-center gap-0.5"><AlertTriangle className="w-2.5 h-2.5" />error</span>}
        </div>

        {/* Content */}
        <div className={`relative group rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-ide-accent/15 text-ide-text rounded-tr-sm'
            : msg.status === 'error'
              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
              : 'bg-ide-panel border border-ide-border text-ide-text rounded-tl-sm'
        }`}>
          {isStreaming && <span className="inline-block w-1.5 h-4 bg-ide-accent animate-pulse ml-0.5" />}
          {msg.content}
          {/* Copy button */}
          {!isStreaming && msg.content && (
            <button
              onClick={onCopy}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-ide-bg/50 transition-all"
              title="Copy"
            >
              {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-ide-text-dim" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── File Context Selector ─────────────────────────────────────────────────────

function FileContextSelector({ projectRoot, selected, onToggle, onClose }: {
  projectRoot?: string;
  selected: string[];
  onToggle: (path: string) => void;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!projectRoot) return;
    fetch(`${API_BASE}/api/files/list?root=${encodeURIComponent(projectRoot)}`)
      .then(r => r.json())
      .then(d => setFiles(d.files || []))
      .catch(() => {});
  }, [projectRoot]);

  const filtered = files.filter(f => !search || f.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="border-b border-ide-border bg-ide-panel p-3 max-h-48 overflow-hidden flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ide-text">Inject File Context</span>
        <button onClick={onClose}><X className="w-3.5 h-3.5 text-ide-text-dim hover:text-ide-text" /></button>
      </div>
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Filter files..."
        className="bg-ide-bg border border-ide-border rounded px-2 py-1 text-xs focus:outline-none focus:border-ide-accent"
      />
      <div className="overflow-y-auto flex-1 space-y-0.5">
        {filtered.slice(0, 50).map(f => (
          <label key={f} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-ide-bg/50 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.includes(f)}
              onChange={() => onToggle(f)}
              className="accent-ide-accent"
            />
            <span className="text-[11px] text-ide-text truncate">{f}</span>
          </label>
        ))}
        {files.length === 0 && !projectRoot && (
          <p className="text-[10px] text-ide-text-dim text-center py-2">Select a project first</p>
        )}
      </div>
    </div>
  );
}
