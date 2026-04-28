// ============================================
// THE GOD FACTORY
// Self-Improvement Agent — Full Codebase Access
//
// Built by RizzyRoz. Support the project:
//   YouTube:  https://www.youtube.com/@TheGodFactory
//   Discord:  https://discord.gg/bAzFxZuWMw
//   PayPal:   https://www.paypal.com/qrcodes/managed/612c1610-5df1-48f9-8326-9b631fdeaf6c
//   Cash App: $RizzyRoz
// ============================================
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Square, History, Copy, Check, Trash2, Download,
  AlertTriangle, Loader2, FolderOpen, Archive, Zap, X,
  Youtube, MessageSquare, DollarSign, ChevronDown, ChevronRight,
  Play, Star, Settings, Plus, Sparkles,
} from 'lucide-react';
import { useProjectStore } from '../stores/projectStore';
import { useChatStore } from '../stores/chatStore';
import { ModelDropdown } from './UniversalModelPicker';
import { API_BASE } from '../config.js';
import { MODELS } from '@personal-ide/shared';

// ─── Types ───────────────────────────────────────────────────────────────────

interface GodMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  model?: string;
  tokenCount?: number;
  backupPath?: string;
  status?: 'streaming' | 'done' | 'error';
}

interface PromptHistoryItem {
  id: string;
  prompt: string;
  usedAt: string;
  timesUsed: number;
  lastModel?: string;
}

// ─── Persistence ─────────────────────────────────────────────────────────────

const HIST_KEY = 'god_factory_prompt_history';
const CONV_KEY = 'god_factory_conversation';

const loadHistory  = (): PromptHistoryItem[] => { try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch { return []; } };
const saveHistory  = (v: PromptHistoryItem[]) => { try { localStorage.setItem(HIST_KEY, JSON.stringify(v.slice(0, 300))); } catch {} };
const loadConv     = (): GodMessage[] => { try { return JSON.parse(localStorage.getItem(CONV_KEY) || '[]'); } catch { return []; } };
const saveConv     = (v: GodMessage[]) => { try { localStorage.setItem(CONV_KEY, JSON.stringify(v.slice(-150))); } catch {} };

// ─── Social Links Bar ─────────────────────────────────────────────────────────

function SocialBar() {
  return (
    <div className="flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-purple-900/20 to-ide-panel border-b border-ide-border/50">
      <a
        href="https://www.youtube.com/@TheGodFactory"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 transition-colors"
        title="YouTube — The God Factory"
      >
        <Youtube className="w-3 h-3" />
        <span>YouTube</span>
      </a>
      <span className="text-ide-border">·</span>
      <a
        href="https://discord.gg/bAzFxZuWMw"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
        title="Discord Server"
      >
        <MessageSquare className="w-3 h-3" />
        <span>Discord</span>
      </a>
      <span className="text-ide-border">·</span>
      <a
        href="https://www.paypal.com/qrcodes/managed/612c1610-5df1-48f9-8326-9b631fdeaf6c?utm_source=consapp_download"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
        title="Tip Jar — PayPal"
      >
        <DollarSign className="w-3 h-3" />
        <span>PayPal Tip Jar</span>
      </a>
      <span className="text-ide-border">·</span>
      <span className="flex items-center gap-1 text-[10px] text-green-400" title="Cash App: $RizzyRoz">
        <DollarSign className="w-3 h-3" />
        <span>Cash App: $RizzyRoz</span>
      </span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TheGodFactory() {
  const { activeProject } = useProjectStore();
  const { selectedModel, setModel } = useChatStore();

  // Use the chatStore's model as default, but allow local override
  const [localModel, setLocalModel] = useState(selectedModel || 'gemini/gemini-2.5-flash-lite');

  const [messages, setMessages]           = useState<GodMessage[]>(loadConv);
  const [input, setInput]                 = useState('');
  const [isStreaming, setIsStreaming]     = useState(false);
  const [showHistory, setShowHistory]     = useState(false);
  const [history, setHistory]             = useState<PromptHistoryItem[]>(loadHistory);
  const [historySearch, setHistorySearch] = useState('');
  const [autoBackup, setAutoBackup]       = useState(true);
  const [backupStatus, setBackupStatus]   = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [showFileSelector, setShowFileSelector] = useState(false);
  const [copied, setCopied]               = useState<string | null>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);

  const abortRef  = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  // Keep local model in sync with global if global changes and we haven't overridden
  useEffect(() => { if (selectedModel && !localModel) setLocalModel(selectedModel); }, [selectedModel]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { saveConv(messages); }, [messages]);
  useEffect(() => { saveHistory(history); }, [history]);

  const selectedModelDef = MODELS.find(m => m.id === localModel);

  const addToHistory = useCallback((prompt: string, model?: string) => {
    setHistory(prev => {
      const existing = prev.find(h => h.prompt === prompt);
      if (existing) return prev.map(h => h.prompt === prompt
        ? { ...h, timesUsed: h.timesUsed + 1, usedAt: new Date().toISOString(), lastModel: model }
        : h);
      return [{ id: Date.now().toString(), prompt, usedAt: new Date().toISOString(), timesUsed: 1, lastModel: model }, ...prev];
    });
  }, []);

  const takeBackup = async (): Promise<string | null> => {
    if (!autoBackup || !activeProject?.rootPath) return null;
    try {
      const res = await fetch(`${API_BASE}/api/files/backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectRoot: activeProject.rootPath }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.backupPath || null;
    } catch { return null; }
  };

  const sendMessage = async (prompt: string) => {
    if (!prompt.trim() || isStreaming) return;
    const trimmed = prompt.trim();
    setInput('');
    addToHistory(trimmed, localModel);

    const userMsg: GodMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
      status: 'done',
    };
    setMessages(prev => [...prev, userMsg]);

    // Auto-backup for destructive operations
    let backupPath: string | null = null;
    if (/\b(write|edit|delete|remove|replace|refactor|rename|create|overwrite|rewrite)\b/i.test(trimmed)) {
      setBackupStatus('Backing up…');
      backupPath = await takeBackup();
      setBackupStatus(backupPath ? `Backed up` : null);
      setTimeout(() => setBackupStatus(null), 4000);
    }

    const assistantMsgId = `a-${Date.now()}`;
    const assistantMsg: GodMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      model: localModel,
      status: 'streaming',
      backupPath: backupPath || undefined,
    };
    setMessages(prev => [...prev, assistantMsg]);
    setIsStreaming(true);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const systemContext = [
        `You are The God Factory — a Principal Software Architect AI integrated into Personal IDE.`,
        `You have full access to the codebase, terminal, filesystem, and the web.`,
        `You build, fix, enhance, and ship software autonomously.`,
        `Active project: ${activeProject?.name || 'No project selected'} at ${activeProject?.rootPath || 'N/A'}`,
        selectedFiles.length > 0 ? `Context files: ${selectedFiles.join(', ')}` : '',
        `Model: ${localModel}`,
        `Date: ${new Date().toISOString().slice(0, 10)}`,
        ``,
        `When editing code: show the complete change, explain what changed and why.`,
        `Be direct, specific, and actionable. No apologies or unnecessary caveats.`,
        `Use all available tools to actually DO things, not just describe them.`,
      ].filter(Boolean).join('\n');

      const payload = {
        message: trimmed,
        model: localModel,
        mode: 'agent' as const,
        projectId: activeProject?.id || 'default',
        contextFiles: selectedFiles.length > 0 ? selectedFiles : undefined,
        systemPrompt: systemContext,
        autoInjectMemory: true,
      };

      const res = await fetch(`${API_BASE}/api/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abort.signal,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errData.error || `Server error ${res.status}`);
      }

      if (!res.body) throw new Error('No response body');

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;
          try {
            const ev = JSON.parse(data);
            if (ev.type === 'content_delta' && ev.delta) {
              fullContent += ev.delta;
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? { ...m, content: fullContent } : m
              ));
            } else if (ev.type === 'content_done') {
              fullContent = ev.fullContent || fullContent;
            } else if (ev.type === 'done') {
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? { ...m, status: 'done', tokenCount: ev.usage?.totalTokens, content: fullContent || m.content } : m
              ));
            } else if (ev.type === 'error') {
              throw new Error(ev.error);
            }
          } catch (parseErr) { /* skip malformed */ }
        }
      }

      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId ? { ...m, status: 'done', content: fullContent || m.content } : m
      ));
    } catch (err: any) {
      const errMsg = err.name === 'AbortError' ? '_[Stopped by user]_' : `**Error:** ${err.message}`;
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId ? { ...m, status: err.name === 'AbortError' ? 'done' : 'error', content: m.content + (m.content ? '\n\n' : '') + errMsg } : m
      ));
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const stopStreaming  = () => abortRef.current?.abort();
  const clearConv      = () => { setMessages([]); try { localStorage.removeItem(CONV_KEY); } catch {} };
  const copyMsg        = (content: string, id: string) => { navigator.clipboard.writeText(content).catch(() => {}); setCopied(id); setTimeout(() => setCopied(null), 1500); };
  const exportConv     = () => {
    const text = messages.map(m => `[${m.role.toUpperCase()}] ${m.timestamp}\n${m.content}`).join('\n\n---\n\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: 'text/plain' })), download: `god-factory-${Date.now()}.txt` });
    a.click();
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const filteredHistory = history.filter(h => !historySearch || h.prompt.toLowerCase().includes(historySearch.toLowerCase()));

  return (
    <div className="flex h-full overflow-hidden bg-ide-bg">
      {/* ── Prompt History Sidebar ── */}
      {showHistory && (
        <div className="w-72 flex-shrink-0 bg-ide-panel border-r border-ide-border flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-ide-border">
            <span className="text-xs font-semibold text-ide-text">Prompt History</span>
            <button onClick={() => setShowHistory(false)} className="text-ide-text-dim hover:text-ide-text"><X className="w-3.5 h-3.5" /></button>
          </div>
          <div className="p-2 border-b border-ide-border">
            <input value={historySearch} onChange={e => setHistorySearch(e.target.value)} placeholder="Search…"
              className="w-full bg-ide-bg border border-ide-border rounded px-2 py-1 text-xs focus:outline-none focus:border-ide-accent" />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredHistory.length === 0 && <div className="p-3 text-xs text-ide-text-dim text-center">No saved prompts yet</div>}
            {filteredHistory.map(h => (
              <div key={h.id} className="border-b border-ide-border/50 p-2 group hover:bg-ide-bg/30">
                <button onClick={() => { setInput(h.prompt); setShowHistory(false); inputRef.current?.focus(); }}
                  className="w-full text-left text-xs text-ide-text line-clamp-3 mb-1">{h.prompt}</button>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-ide-text-dim">×{h.timesUsed} · {new Date(h.usedAt).toLocaleDateString()}</span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                    <button onClick={() => sendMessage(h.prompt)} title="Re-send"
                      className="p-1 bg-ide-accent/20 text-ide-accent rounded hover:bg-ide-accent/30"><Play className="w-2.5 h-2.5" /></button>
                    <button onClick={() => setHistory(prev => prev.filter(x => x.id !== h.id))}
                      className="p-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20"><Trash2 className="w-2.5 h-2.5" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="p-2 border-t border-ide-border">
            <button
              onClick={() => {
                const top = history.slice(0, 20).map(h => h.prompt).join('\n- ');
                setInput(`Review and combine these previous prompts into a comprehensive improvement plan for the IDE:\n- ${top}`);
                setShowHistory(false);
              }}
              className="w-full text-[10px] py-1.5 bg-ide-accent/15 text-ide-accent rounded hover:bg-ide-accent/25 flex items-center justify-center gap-1.5"
            >
              <Zap className="w-3 h-3" /> Generate Mega-Prompt
            </button>
          </div>
        </div>
      )}

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Social Links */}
        <SocialBar />

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-ide-border bg-ide-panel flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <a
              href="https://www.youtube.com/@TheGodFactory"
              target="_blank"
              rel="noopener noreferrer"
              className="text-base font-bold text-ide-text hover:text-purple-400 transition-colors cursor-pointer"
              title="YouTube — The God Factory"
            >
              The God Factory
            </a>
            <span className="text-xs text-ide-text-dim px-2 py-0.5 bg-purple-500/10 text-purple-400 rounded-full">
              Self-Improvement Agent
            </span>
            {activeProject && <span className="text-xs text-ide-text-dim">· {activeProject.name}</span>}
          </div>
          <div className="flex items-center gap-1.5">
            {/* Backup status */}
            {backupStatus && (
              <span className="text-[10px] text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Archive className="w-2.5 h-2.5" /> {backupStatus}
              </span>
            )}
            {/* Auto-backup toggle */}
            <button
              onClick={() => setAutoBackup(v => !v)}
              className={`text-[10px] px-2 py-1 rounded border transition-colors flex items-center gap-1 ${autoBackup ? 'border-green-500/40 text-green-400 bg-green-500/10' : 'border-ide-border text-ide-text-dim'}`}
              title="Auto-backup before destructive edits"
            >
              <Archive className="w-3 h-3" /> {autoBackup ? 'Backup ON' : 'Backup OFF'}
            </button>
            {/* File context */}
            <button
              onClick={() => setShowFileSelector(v => !v)}
              className={`text-[10px] px-2 py-1 rounded border transition-colors flex items-center gap-1 ${selectedFiles.length > 0 ? 'border-ide-accent/40 text-ide-accent bg-ide-accent/10' : 'border-ide-border text-ide-text-dim hover:text-ide-text'}`}
            >
              <FolderOpen className="w-3 h-3" /> {selectedFiles.length > 0 ? `${selectedFiles.length} files` : 'File ctx'}
            </button>
            <button onClick={() => setShowHistory(v => !v)} className="p-1.5 text-ide-text-dim hover:text-purple-400 rounded hover:bg-purple-400/10 transition-colors" title="Prompt history">
              <History className="w-3.5 h-3.5" />
            </button>
            <button onClick={exportConv} className="p-1.5 text-ide-text-dim hover:text-ide-text rounded hover:bg-ide-bg/50" title="Export">
              <Download className="w-3.5 h-3.5" />
            </button>
            <button onClick={clearConv} className="p-1.5 text-red-400/60 hover:text-red-400 rounded hover:bg-red-400/10" title="Clear conversation">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Model Selector Bar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-ide-border bg-ide-panel/50 flex-shrink-0">
          <span className="text-[10px] text-ide-text-dim">Model:</span>
          <div className="w-72">
            <ModelDropdown
              value={localModel}
              onChange={(id) => { setLocalModel(id); setModel(id); }}
              placeholder="Select model…"
            />
          </div>
          {selectedModelDef && (
            <div className="flex items-center gap-2 text-[10px] text-ide-text-dim">
              <span>{(selectedModelDef.maxInputTokens / 1000).toFixed(0)}K ctx</span>
              {selectedModelDef.supportsTools && <span className="text-purple-400">Tools ✓</span>}
              {selectedModelDef.supportsStreaming && <span className="text-green-400">Stream ✓</span>}
            </div>
          )}
          <div className="ml-auto text-[10px] text-ide-text-dim">
            Applies to: <span className="text-ide-accent">The God Factory only</span>
            <span className="ml-2 text-ide-text-dim/50">· Chat uses its own model selector (top bar)</span>
          </div>
        </div>

        {/* File context selector dropdown */}
        {showFileSelector && (
          <FileContextSelector
            projectRoot={activeProject?.rootPath}
            selected={selectedFiles}
            onToggle={(path) => setSelectedFiles(prev => prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path])}
            onClose={() => setShowFileSelector(false)}
          />
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && <WelcomeScreen onSend={sendMessage} />}
          {messages.map(msg => (
            <MessageBubble
              key={msg.id}
              message={msg}
              copied={copied === msg.id}
              onCopy={() => copyMsg(msg.content, msg.id)}
            />
          ))}
          {isStreaming && (
            <div className="flex items-center gap-2 text-xs text-ide-text-dim">
              <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
              <span>Thinking…</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="flex-shrink-0 border-t border-ide-border p-3 bg-ide-panel/30">
          {selectedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {selectedFiles.map(f => (
                <span key={f} className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-ide-accent/10 text-ide-accent rounded-full">
                  {f.split(/[/\\]/).pop()}
                  <button onClick={() => setSelectedFiles(prev => prev.filter(x => x !== f))}><X className="w-2.5 h-2.5" /></button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Tell The God Factory what to build, fix, or enhance… (Enter sends, Shift+Enter = newline)"
              className="flex-1 bg-ide-bg border border-ide-border rounded-lg px-3 py-2.5 text-sm text-ide-text placeholder-ide-text-dim resize-none focus:outline-none focus:border-purple-500/50 transition-colors min-h-[60px] max-h-[200px]"
              rows={2}
            />
            <div className="flex flex-col gap-1.5">
              {isStreaming ? (
                <button onClick={stopStreaming}
                  className="w-9 h-9 flex items-center justify-center bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30">
                  <Square className="w-4 h-4" />
                </button>
              ) : (
                <button onClick={() => sendMessage(input)} disabled={!input.trim()}
                  className="w-9 h-9 flex items-center justify-center bg-purple-500/80 text-white rounded-lg hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Welcome Screen ───────────────────────────────────────────────────────────

function WelcomeScreen({ onSend }: { onSend: (msg: string) => void }) {
  const starters = [
    { label: '🔍 Analyze & Prioritize', prompt: 'Analyze the entire Personal IDE codebase. Find what is incomplete, has bugs, or is built but not wired into the GUI. Give me a prioritized action plan to make this a shippable product.' },
    { label: '🔧 Fix All TS Errors', prompt: 'Find and fix all TypeScript compilation errors in the web app and server. Run pnpm tsc --noEmit and fix everything that fails.' },
    { label: '🤖 Audit Agent Pipeline', prompt: 'Audit the full agent pipeline end-to-end: 24/7 loop, fleet mode, rate limiting, fallback chains. Why does it stall? Fix all issues and make it production-ready.' },
    { label: '🔌 Wire All Features', prompt: 'Review all components in apps/web/src. Find everything built but not accessible in the GUI. Wire all of it in with proper navigation and controls.' },
    { label: '📊 Research Free Models', prompt: 'Research the current best free AI models from Groq, Cerebras, Gemini, SiliconFlow, ZhipuAI, Fireworks, DeepSeek as of today. Add all of them to the model registry with correct API IDs.' },
    { label: '⚡ Hardware Benchmark', prompt: 'Detect all hardware on this machine (CPU, GPU, RAM, storage). Recommend which local AI models (Ollama, llama.cpp) are appropriate for this hardware profile. Configure the IDE accordingly.' },
    { label: '🚀 Make Monetizable', prompt: 'What does this IDE need to be a real, publicly monetizable product? Identify every gap: missing features, broken flows, UX issues, security holes. Build me a release checklist.' },
    { label: '🐦 Fix Bird Feeder', prompt: 'The Midwife / Bird Feeder feature has broken dropdowns and cannot change models. Fix all controls. Make all models selectable. Add bulk operations to set all roles at once.' },
  ];

  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="text-center mb-8">
        <div className="text-5xl mb-3">⚡</div>
        <h2 className="text-2xl font-bold text-ide-text mb-2">The God Factory</h2>
        <p className="text-sm text-ide-text-dim leading-relaxed max-w-xl mx-auto">
          Your in-app Principal AI Architect. Build features, fix bugs, ship products — without leaving the app.
          Full codebase access. Auto-backup before edits. Prompt history for iteration.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-6">
        {starters.map(s => (
          <button key={s.label} onClick={() => onSend(s.prompt)}
            className="p-3 text-left bg-ide-panel border border-ide-border rounded-lg hover:border-purple-500/50 hover:bg-purple-500/5 transition-all group">
            <div className="text-xs font-medium text-ide-text group-hover:text-purple-400 mb-1">{s.label}</div>
            <div className="text-[10px] text-ide-text-dim line-clamp-2">{s.prompt.slice(0, 90)}…</div>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-4 justify-center text-[10px] text-ide-text-dim">
        <span>💡 Enter to send · Shift+Enter for newline</span>
        <span>·</span>
        <span>🔒 Auto-backup before destructive edits</span>
        <span>·</span>
        <span>📜 History button saves all prompts</span>
      </div>
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message: msg, copied, onCopy }: { message: GodMessage; copied: boolean; onCopy: () => void }) {
  const isUser = msg.role === 'user';
  const isStream = msg.status === 'streaming';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold ${isUser ? 'bg-ide-accent/20 text-ide-accent' : 'bg-purple-500/20 text-purple-400'}`}>
        {isUser ? 'You' : '⚡'}
      </div>
      <div className={`flex-1 max-w-[88%] flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`flex items-center gap-2 text-[10px] text-ide-text-dim ${isUser ? 'flex-row-reverse' : ''}`}>
          <span>{isUser ? 'You' : (msg.model?.split('/').pop() || 'The God Factory')}</span>
          <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
          {msg.tokenCount && <span>{msg.tokenCount} tokens</span>}
          {msg.backupPath && <span className="text-green-400 flex items-center gap-0.5"><Archive className="w-2.5 h-2.5" />backed up</span>}
          {msg.status === 'error' && <span className="text-red-400 flex items-center gap-0.5"><AlertTriangle className="w-2.5 h-2.5" />error</span>}
        </div>
        <div className={`relative group rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isUser ? 'bg-ide-accent/15 text-ide-text rounded-tr-sm'
            : msg.status === 'error' ? 'bg-red-500/10 text-red-300 border border-red-500/20'
            : 'bg-ide-panel border border-ide-border text-ide-text rounded-tl-sm'
        }`}>
          {isStream && <span className="inline-block w-1.5 h-4 bg-purple-400 animate-pulse ml-0.5 align-middle" />}
          {msg.content}
          {!isStream && msg.content && (
            <button onClick={onCopy} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-ide-bg/50">
              {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-ide-text-dim" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── File Context Selector ────────────────────────────────────────────────────

function FileContextSelector({ projectRoot, selected, onToggle, onClose }: {
  projectRoot?: string; selected: string[]; onToggle: (path: string) => void; onClose: () => void;
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
    <div className="border-b border-ide-border bg-ide-panel p-3 max-h-52 overflow-hidden flex flex-col gap-2 flex-shrink-0">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ide-text">Inject File Context</span>
        <button onClick={onClose}><X className="w-3.5 h-3.5 text-ide-text-dim hover:text-ide-text" /></button>
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter files…"
        className="bg-ide-bg border border-ide-border rounded px-2 py-1 text-xs focus:outline-none focus:border-ide-accent" />
      <div className="overflow-y-auto flex-1 space-y-0.5">
        {filtered.slice(0, 100).map(f => (
          <label key={f} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-ide-bg/50 cursor-pointer">
            <input type="checkbox" checked={selected.includes(f)} onChange={() => onToggle(f)} className="accent-ide-accent" />
            <span className="text-[11px] text-ide-text truncate">{f}</span>
          </label>
        ))}
        {files.length === 0 && !projectRoot && <p className="text-[10px] text-ide-text-dim text-center py-2">Select a project first</p>}
      </div>
    </div>
  );
}
