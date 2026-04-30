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
  Youtube, MessageSquare, DollarSign, ChevronDown, ChevronRight, ChevronLeft,
  Play, Star, Settings, Plus, Sparkles,
  Wrench, Shield, CheckCircle, XCircle, Terminal, FileCode,
  Eye, ChevronUp, ToggleLeft, ToggleRight, BookOpen, Search,
} from 'lucide-react';
import { useProjectStore } from '../stores/projectStore';
import { useChatStore } from '../stores/chatStore';
import { ModelDropdown } from './UniversalModelPicker';
import { API_BASE } from '../config.js';
import { MODELS } from '@personal-ide/shared';

// ─── Types ───────────────────────────────────────────────────────────────────

interface GodMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: string;
  model?: string;
  tokenCount?: number;
  backupPath?: string;
  status?: 'streaming' | 'done' | 'error';
  // Tool-specific
  toolName?: string;
  toolParams?: Record<string, unknown>;
  toolStatus?: 'running' | 'done' | 'approved' | 'rejected';
}

interface ToolCall {
  tool: string;
  params: Record<string, unknown>;
}

interface ApprovalDetails {
  type: 'patch' | 'write' | 'exec';
  path?: string;
  diff?: string;
  command?: string;
  explanation?: string;
  isNew?: boolean;
  oldString?: string;
  newString?: string;
}

interface PromptHistoryItem {
  id: string;
  prompt: string;
  usedAt: string;
  timesUsed: number;
  lastModel?: string;
}

// ─── Tool constants ───────────────────────────────────────────────────────────

const MAX_TOOL_ITERATIONS = 10;

const TOOL_DEFINITIONS_PROMPT = `
## God Factory Codebase Tools

You are operating as an autonomous coding agent with FULL ACCESS to the Personal IDE codebase.
You can read, search, and modify source files, and run build/lint commands.

To call a tool, output a fenced code block with language \`tool_call\` containing valid JSON:

\`\`\`tool_call
{"tool": "read_file", "params": {"path": "apps/web/src/App.tsx", "startLine": 1, "endLine": 50}}
\`\`\`

### Available Tools

| Tool | Description | Params |
|------|-------------|--------|
| list_files | Browse the file tree | \`path?\` (subdir), \`depth?\` (default 4) |
| read_file | Read file content | \`path\` (required), \`startLine?\`, \`endLine?\` |
| search_code | Grep search codebase | \`query\` (required), \`maxResults?\` |
| get_docs | Read documentation | \`section?\` (e.g. "architecture", "llm") |
| patch_file | Replace a string in a file (requires user approval) | \`path\`, \`oldString\`, \`newString\` |
| write_file | Write/create a whole file (requires user approval) | \`path\`, \`content\` |
| run_command | Run a terminal command (requires user approval) | \`command\`, \`explanation\`, \`cwd?\` |

### Tool Rules
- Use ONE tool call per response turn
- Always READ a file before patching it (ensures oldString matches exactly)
- For patch_file: include 3+ lines of unchanged context around the target text
- patch_file oldString must match EXACTLY ONCE — add more context if needed
- Dangerous commands (rm -rf, format, shutdown, etc.) are automatically blocked
- Maximum ${MAX_TOOL_ITERATIONS} tool calls per session
- After finishing, provide a clear summary of all changes made
`.trim();

function extractToolCall(text: string): ToolCall | null {
  const match = text.match(/```tool_call\s*\n([\s\S]*?)\n```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (typeof parsed.tool !== 'string') return null;
    return parsed as ToolCall;
  } catch { return null; }
}

function formatToolSummary(call: ToolCall): string {
  const p = call.params;
  switch (call.tool) {
    case 'list_files':   return `list_files(${p.path || '.'})`;
    case 'read_file':    return `read_file(${p.path}${p.startLine ? `:${p.startLine}-${p.endLine || '?'}` : ''})`;
    case 'search_code':  return `search_code("${p.query}")`;
    case 'get_docs':     return `get_docs(${p.section || 'index'})`;
    case 'patch_file':   return `patch_file(${p.path})`;
    case 'write_file':   return `write_file(${p.path})`;
    case 'run_command':  return `run_command(${String(p.command).slice(0, 60)})`;
    default:             return `${call.tool}(${JSON.stringify(p).slice(0, 60)})`;
  }
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

  // Tool-calling state
  const [toolsEnabled, setToolsEnabled]           = useState(true);
  const [toolIterationCount, setToolIterationCount] = useState(0);
  const [pendingApproval, setPendingApproval]     = useState<ApprovalDetails | null>(null);
  const approvalResolveRef = useRef<((approved: boolean) => void) | null>(null);

  // Codebase snapshot — pre-loaded on mount so system prompt always has real context
  const [codebaseTree, setCodebaseTree]   = useState<string>('');
  const [codebaseReady, setCodebaseReady] = useState(false);

  const abortRef  = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  // Keep local model in sync with global if global changes and we haven't overridden
  useEffect(() => { if (selectedModel && !localModel) setLocalModel(selectedModel); }, [selectedModel]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { saveConv(messages); }, [messages]);
  useEffect(() => { saveHistory(history); }, [history]);

  // ── Load codebase tree on mount ───────────────────────────────────────────
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [treeRes, docsRes] = await Promise.all([
          fetch(`${API_BASE}/api/codebase/tree?path=.&depth=3`),
          fetch(`${API_BASE}/api/codebase/docs`),
        ]);
        function flatNode(node: { name: string; type: string; children?: unknown[] }, ind = 0): string {
          const pfx = '  '.repeat(ind) + (node.type === 'directory' ? '📁 ' : '   ');
          let out = `${pfx}${node.name}\n`;
          if (node.children) for (const c of node.children as typeof node[]) out += flatNode(c, ind + 1);
          return out;
        }
        const treeData = await treeRes.json().catch(() => ({}));
        const docsData = await docsRes.json().catch(() => ({}));
        if (!active) return;
        const treeText = treeData.tree ? flatNode(treeData.tree).slice(0, 5000) : '';
        const docsList = docsData.sections ? (docsData.sections as string[]).map((s: string) => `  - ${s}`).join('\n') : '';
        const snapshot = [
          treeText ? `## Personal IDE File Tree\n\`\`\`\n${treeText}\`\`\`` : '',
          docsList ? `## Available Documentation Sections\n${docsList}` : '',
        ].filter(Boolean).join('\n\n');
        setCodebaseTree(snapshot);
        setCodebaseReady(true);
      } catch {
        if (active) setCodebaseReady(true); // proceed even if offline
      }
    })();
    return () => { active = false; };
  }, []);

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

  // ── Approval helper (promise-based modal) ─────────────────────────────────
  const requestApproval = useCallback((details: ApprovalDetails): Promise<boolean> => {
    return new Promise((resolve) => {
      approvalResolveRef.current = resolve;
      setPendingApproval(details);
    });
  }, []);

  const handleApprovalDecision = (approved: boolean) => {
    approvalResolveRef.current?.(approved);
    approvalResolveRef.current = null;
    setPendingApproval(null);
  };

  // ── Tool execution ────────────────────────────────────────────────────────
  const executeToolCall = useCallback(async (call: ToolCall): Promise<string> => {
    const { tool, params } = call;
    try {
      switch (tool) {
        case 'list_files': {
          const qp = new URLSearchParams();
          if (params.path) qp.set('path', String(params.path));
          if (params.depth) qp.set('depth', String(params.depth));
          const res = await fetch(`${API_BASE}/api/codebase/tree?${qp}`);
          const data = await res.json();
          if (data.error) return `Error: ${data.error}`;
          function flatNode(node: { name: string; type: string; children?: unknown[] }, ind = 0): string {
            const pfx = '  '.repeat(ind) + (node.type === 'directory' ? '📁 ' : '   ');
            let out = `${pfx}${node.name}\n`;
            if (node.children) for (const c of node.children as typeof node[]) out += flatNode(c, ind + 1);
            return out;
          }
          return flatNode(data.tree).slice(0, 8000);
        }
        case 'read_file': {
          const qp = new URLSearchParams({ path: String(params.path) });
          if (params.startLine) qp.set('start', String(params.startLine));
          if (params.endLine)   qp.set('end',   String(params.endLine));
          const res = await fetch(`${API_BASE}/api/codebase/read?${qp}`);
          const data = await res.json();
          if (data.error) return `Error: ${data.error}`;
          return `// ${params.path} (lines ${params.startLine || 1}–${params.endLine || data.totalLines})\n${data.content}`;
        }
        case 'search_code': {
          const qp = new URLSearchParams({ q: String(params.query) });
          if (params.maxResults) qp.set('maxResults', String(params.maxResults));
          const res = await fetch(`${API_BASE}/api/codebase/search?${qp}`);
          const data = await res.json();
          if (data.error) return `Error: ${data.error}`;
          if (!data.results?.length) return 'No results found.';
          const lines = (data.results as Array<{ file: string; line: number; text: string }>)
            .slice(0, 30).map(r => `${r.file}:${r.line}: ${r.text.trim()}`);
          return `Found ${data.count} result(s):\n${lines.join('\n')}`;
        }
        case 'get_docs': {
          const qp = new URLSearchParams();
          if (params.section) qp.set('section', String(params.section));
          const res = await fetch(`${API_BASE}/api/codebase/docs?${qp}`);
          const data = await res.json();
          if (data.error) return `Error: ${data.error}`;
          if (data.sections) return `Available docs:\n${(data.sections as string[]).join('\n')}\n\nUse get_docs with a section name to read it.`;
          return String(data.content || '').slice(0, 8000);
        }
        case 'patch_file': {
          const prevRes = await fetch(`${API_BASE}/api/codebase/patch`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: params.path, oldString: params.oldString, newString: params.newString, approved: false }),
          });
          const preview = await prevRes.json();
          if (preview.error) return `Error: ${preview.error}`;
          const approved = await requestApproval({ type: 'patch', path: String(params.path), diff: preview.diff, oldString: String(params.oldString), newString: String(params.newString) });
          if (!approved) return `User rejected patch to ${params.path}.`;
          const applyRes = await fetch(`${API_BASE}/api/codebase/patch`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: params.path, oldString: params.oldString, newString: params.newString, approved: true }),
          });
          const result = await applyRes.json();
          return result.success ? `Successfully patched ${params.path}. Backup: ${params.path}.bak` : `Error: ${result.error}`;
        }
        case 'write_file': {
          const prevRes = await fetch(`${API_BASE}/api/codebase/write`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: params.path, content: params.content, approved: false }),
          });
          const preview = await prevRes.json();
          if (preview.error) return `Error: ${preview.error}`;
          const approved = await requestApproval({ type: 'write', path: String(params.path), diff: preview.diff, isNew: preview.isNew });
          if (!approved) return `User rejected write to ${params.path}.`;
          const applyRes = await fetch(`${API_BASE}/api/codebase/write`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: params.path, content: params.content, approved: true }),
          });
          const result = await applyRes.json();
          return result.success ? `${result.isNew ? 'Created' : 'Updated'} ${params.path} (${result.linesWritten} lines).` : `Error: ${result.error}`;
        }
        case 'run_command': {
          const approved = await requestApproval({ type: 'exec', command: String(params.command), explanation: String(params.explanation || '') });
          if (!approved) return `User rejected: ${params.command}`;
          const res = await fetch(`${API_BASE}/api/codebase/exec`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: params.command, explanation: params.explanation, cwd: params.cwd, approved: true }),
          });
          const result = await res.json();
          return result.success
            ? `Command succeeded:\n${result.output || '(no output)'}`
            : `Command failed (exit ${result.exitCode}):\n${result.output || result.error}`;
        }
        default:
          return `Unknown tool: ${tool}. Available: list_files, read_file, search_code, get_docs, patch_file, write_file, run_command`;
      }
    } catch (err: any) {
      return `Tool error (${tool}): ${err.message}`;
    }
  }, [requestApproval]);

  // ── Single SSE streaming turn ─────────────────────────────────────────────
  const streamTurn = useCallback(async (
    prompt: string,
    systemContext: string,
    abortCtrl: AbortController,
  ): Promise<{ content: string; msgId: string }> => {
    const msgId = `a-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    setMessages(prev => [...prev, {
      id: msgId, role: 'assistant', content: '', timestamp: new Date().toISOString(),
      model: localModel, status: 'streaming',
    }]);
    const res = await fetch(`${API_BASE}/api/chat/send`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: abortCtrl.signal,
      body: JSON.stringify({ message: prompt, model: localModel, mode: 'agent', projectId: activeProject?.id || 'default', systemPrompt: systemContext, autoInjectMemory: false }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: 'error', content: `Error: ${errData.error}` } : m));
      throw new Error(errData.error || `Server error ${res.status}`);
    }
    if (!res.body) throw new Error('No response body');
    const reader = res.body.getReader();
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
            setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: fullContent } : m));
          } else if (ev.type === 'content_done') {
            fullContent = ev.fullContent || fullContent;
          } else if (ev.type === 'done') {
            setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: 'done', tokenCount: ev.usage?.totalTokens } : m));
          } else if (ev.type === 'error') {
            throw new Error(ev.error);
          }
        } catch { /* skip malformed */ }
      }
    }
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: 'done', content: fullContent || m.content } : m));
    return { content: fullContent, msgId };
  }, [localModel, activeProject]);

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

    setMessages(prev => [...prev, {
      id: `u-${Date.now()}`, role: 'user', content: trimmed,
      timestamp: new Date().toISOString(), status: 'done',
    }]);

    // Auto-backup for destructive prompts
    if (/\b(write|edit|delete|remove|replace|refactor|rename|create|overwrite|rewrite)\b/i.test(trimmed)) {
      setBackupStatus('Backing up…');
      takeBackup().then(p => { setBackupStatus(p ? 'Backed up' : null); setTimeout(() => setBackupStatus(null), 4000); });
    }

    setIsStreaming(true);
    setToolIterationCount(0);
    const abort = new AbortController();
    abortRef.current = abort;

    const buildSystemCtx = (toolHistory: Array<{ role: string; content: string }>) => {
      const lines = [
        `You are The God Factory — a Principal Software Architect AI integrated into Personal IDE.`,
        `Your job is to improve Personal IDE itself — its built-in features, UX, architecture, models, onboarding, docs, and developer tooling.`,
        `Do NOT behave like a generic external project builder unless the user explicitly asks you to inspect an imported project. Your default scope is the Personal IDE application codebase and help/documentation system.`,
        `You have full access to the Personal IDE codebase, terminal, filesystem, and documentation.`,
        `Active project context: ${activeProject?.name || 'Personal IDE internal codebase (self-improvement mode)'}`,
        selectedFiles.length > 0 ? `Context files: ${selectedFiles.join(', ')}` : '',
        `Model: ${localModel}  Date: ${new Date().toISOString().slice(0, 10)}`,
        `When the user asks about how the app works, use the help/docs and source code to answer with specific details from Personal IDE.`,
        `Be direct and actionable. Show complete changes. Explain what changed and why.`,
        codebaseTree ? `\n${codebaseTree}` : '',
        toolsEnabled ? `\n${TOOL_DEFINITIONS_PROMPT}` : '',
      ].filter(Boolean).join('\n');
      if (toolHistory.length === 0) return lines;
      const histStr = toolHistory.map(m => `[${m.role.toUpperCase()}]: ${m.content.slice(0, 2000)}`).join('\n\n');
      return `${lines}\n\n## Current Tool Loop History\n${histStr}`;
    };

    try {
      const { content: firstContent } = await streamTurn(trimmed, buildSystemCtx([]), abort);

      if (!toolsEnabled || abort.signal.aborted) { setIsStreaming(false); abortRef.current = null; return; }

      const toolHistory: Array<{ role: string; content: string }> = [];
      let currentContent = firstContent;
      let iteration = 0;

      while (iteration < MAX_TOOL_ITERATIONS && !abort.signal.aborted) {
        const toolCall = extractToolCall(currentContent);
        if (!toolCall) break;

        iteration++;
        setToolIterationCount(iteration);
        toolHistory.push({ role: 'assistant', content: currentContent });

        const toolBubbleId = `tool-${Date.now()}-${iteration}`;
        setMessages(prev => [...prev, {
          id: toolBubbleId, role: 'tool', content: '', timestamp: new Date().toISOString(),
          toolName: toolCall.tool, toolParams: toolCall.params,
          toolStatus: 'running', status: 'streaming',
        }]);

        let toolResult: string;
        let bubbleStatus: GodMessage['toolStatus'] = 'done';
        try {
          toolResult = await executeToolCall(toolCall);
          if (toolResult.startsWith('User rejected')) bubbleStatus = 'rejected';
        } catch (e: any) {
          toolResult = `Tool execution failed: ${e.message}`;
        }

        setMessages(prev => prev.map(m => m.id === toolBubbleId
          ? { ...m, content: toolResult, toolStatus: bubbleStatus, status: 'done' } : m));

        toolHistory.push({ role: 'user', content: `[TOOL RESULT for ${formatToolSummary(toolCall)}]:\n${toolResult}` });

        const nextPrompt = `[TOOL RESULT for ${formatToolSummary(toolCall)}]:\n${toolResult.slice(0, 6000)}\n\nContinue. Use another tool if needed, or provide your final response.`;
        const { content: nextContent } = await streamTurn(nextPrompt, buildSystemCtx(toolHistory), abort);
        currentContent = nextContent;
      }

      if (iteration >= MAX_TOOL_ITERATIONS) {
        setMessages(prev => [...prev, {
          id: `sys-${Date.now()}`, role: 'tool',
          content: `[Tool loop limit reached (${MAX_TOOL_ITERATIONS} iterations). Stopping tool calls.]`,
          timestamp: new Date().toISOString(), toolName: 'system', toolStatus: 'done', status: 'done',
        }]);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        const errMsg = `**Error:** ${err.message}`;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && last.status === 'streaming') {
            return prev.map(m => m.id === last.id ? { ...m, status: 'error' as const, content: (m.content || '') + '\n\n' + errMsg } : m);
          }
          return [...prev, { id: `err-${Date.now()}`, role: 'assistant', content: errMsg, timestamp: new Date().toISOString(), status: 'error' as const }];
        });
      }
    } finally {
      setIsStreaming(false);
      setToolIterationCount(0);
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
      {/* Approval Modal */}
      {pendingApproval && (
        <ApprovalModal
          details={pendingApproval}
          onApprove={() => handleApprovalDecision(true)}
          onReject={() => handleApprovalDecision(false)}
        />
      )}
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
            {/* Tool iteration counter */}
            {toolIterationCount > 0 && (
              <span className="text-[10px] text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Wrench className="w-2.5 h-2.5 animate-pulse" />
                Tool loop: {toolIterationCount}/{MAX_TOOL_ITERATIONS}
              </span>
            )}
            {/* Backup status */}
            {backupStatus && (
              <span className="text-[10px] text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Archive className="w-2.5 h-2.5" /> {backupStatus}
              </span>
            )}
            {/* Tools toggle */}
            <button
              onClick={() => setToolsEnabled(v => !v)}
              title={toolsEnabled ? 'Agent tools ON — click to disable' : 'Agent tools OFF — click to enable'}
              className={`text-[10px] px-2 py-1 rounded border transition-colors flex items-center gap-1 ${toolsEnabled ? 'border-purple-500/40 text-purple-400 bg-purple-500/10' : 'border-ide-border text-ide-text-dim'}`}
            >
              {toolsEnabled ? <ToggleRight className="w-3 h-3" /> : <ToggleLeft className="w-3 h-3" />}
              {toolsEnabled ? 'Tools ON' : 'Tools OFF'}
            </button>
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
          {messages.length === 0 && <WelcomeScreen onSend={sendMessage} codebaseReady={codebaseReady} codebaseTree={codebaseTree} />}
          {messages.map(msg => (
            msg.role === 'tool'
              ? <ToolBubble key={msg.id} message={msg} />
              : <MessageBubble
                  key={msg.id}
                  message={msg}
                  copied={copied === msg.id}
                  onCopy={() => copyMsg(msg.content, msg.id)}
                />
          ))}
          {isStreaming && toolIterationCount === 0 && (
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
          {toolsEnabled && (
            <div className="flex items-center gap-2 mb-2 text-[10px] text-purple-400/70">
              <Wrench className="w-3 h-3" />
              <span>Agent mode: reads, searches, edits files and runs commands — writes/execs require your approval</span>
              {codebaseReady
                ? <span className="ml-auto text-green-400/70">✓ Codebase loaded</span>
                : <span className="ml-auto text-yellow-400/70 animate-pulse">⏳ Loading codebase…</span>}
            </div>
          )}
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={toolsEnabled
                ? "Tell The God Factory what to build, fix, or enhance… it will use tools autonomously (Enter sends)"
                : "Tell The God Factory what to build, fix, or enhance… (Enter sends, Shift+Enter = newline)"}
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

      {/* ── Right Panel ── */}
      <GodFactoryRightPanel
        codebaseReady={codebaseReady}
        codebaseTree={codebaseTree}
        onSendToBrainstorm={(text) => { setInput(text); inputRef.current?.focus(); }}
      />
    </div>
  );
}

// ─── Right Panel (Notifications, Suggestions, Health, Brainstorm) ────────────

interface SuggestedJob {
  id: string;
  title: string;
  category: string;
  priority: 'high' | 'medium' | 'low';
  source: string;
  description: string;
}

interface Notification {
  id: string;
  type: 'info' | 'warning' | 'success' | 'error';
  message: string;
  timestamp: string;
  source: string;
}

const DEMO_JOBS: SuggestedJob[] = [
  { id: '1', title: 'Fix agent loop spec-reading', category: 'agent', priority: 'high', source: 'Blame Crawler', description: 'Inject spec file content at agent start to prevent generic scaffold output' },
  { id: '2', title: 'Add per-model quality tracking', category: 'model_tool_enhancement', priority: 'medium', source: 'God Factory', description: 'Track quality scores per model per interaction type' },
  { id: '3', title: 'Memory tab isolation per agent', category: 'memory', priority: 'medium', source: 'God Factory', description: 'Each agent gets its own isolated memory view' },
];

function GodFactoryRightPanel({
  codebaseReady,
  codebaseTree,
  onSendToBrainstorm,
}: {
  codebaseReady: boolean;
  codebaseTree: string;
  onSendToBrainstorm: (text: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [jobs, setJobs] = useState<SuggestedJob[]>(DEMO_JOBS);
  const [brainstorm, setBrainstorm] = useState('');
  const [sections, setSections] = useState({ notifications: true, jobs: true, health: true, brainstorm: false });
  const [blameStats, setBlameStats] = useState<any[]>([]);

  useEffect(() => {
    // Load blame stats for health panel
    fetch(`${API_BASE}/api/blame/records?limit=5`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.stats) setBlameStats(d.stats.slice(0, 4)); })
      .catch(() => {});

    // Seed a notification if codebase ready
    if (codebaseReady) {
      setNotifications([{
        id: '1', type: 'success', source: 'Codebase Scanner',
        message: 'Codebase snapshot loaded — tools active',
        timestamp: new Date().toISOString(),
      }]);
    }
  }, [codebaseReady]);

  const toggleSection = (key: keyof typeof sections) => setSections(prev => ({ ...prev, [key]: !prev[key] }));

  const treeLineCount = codebaseTree.split('\n').length;

  const priorityColor = (p: SuggestedJob['priority']) =>
    p === 'high' ? 'text-red-400 bg-red-400/10' :
    p === 'medium' ? 'text-yellow-400 bg-yellow-400/10' :
    'text-green-400 bg-green-400/10';

  const notifColor = (t: Notification['type']) =>
    t === 'success' ? 'text-green-400' : t === 'warning' ? 'text-yellow-400' :
    t === 'error' ? 'text-red-400' : 'text-blue-400';

  if (collapsed) {
    return (
      <div className="w-8 flex-shrink-0 bg-ide-panel border-l border-ide-border flex flex-col items-center pt-3">
        <button onClick={() => setCollapsed(false)} title="Expand panel"
          className="p-1 text-ide-text-dim hover:text-purple-400 rounded">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <div className="mt-4 flex flex-col gap-3 text-ide-text-dim">
          <span className="text-[8px] rotate-90 whitespace-nowrap tracking-widest">INTEL</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 flex-shrink-0 bg-ide-panel border-l border-ide-border flex flex-col overflow-hidden">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-ide-border flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-[11px] font-semibold text-ide-text">Intel Panel</span>
        </div>
        <button onClick={() => setCollapsed(true)} title="Collapse"
          className="p-1 text-ide-text-dim hover:text-ide-text rounded">
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Notifications ── */}
        <div className="border-b border-ide-border/50">
          <button onClick={() => toggleSection('notifications')}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-ide-text-dim hover:text-ide-text hover:bg-ide-bg/30">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-yellow-400" />
              Notifications
              {notifications.length > 0 && (
                <span className="px-1 bg-yellow-400/20 text-yellow-300 rounded text-[9px]">{notifications.length}</span>
              )}
            </div>
            {sections.notifications ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {sections.notifications && (
            <div className="px-2 pb-2 space-y-1">
              {notifications.length === 0 && (
                <div className="text-[10px] text-ide-text-dim px-1 py-2 text-center">No notifications</div>
              )}
              {notifications.map(n => (
                <div key={n.id} className="flex items-start gap-1.5 p-1.5 rounded bg-ide-bg/30 group">
                  <span className={`text-[10px] mt-0.5 ${notifColor(n.type)}`}>●</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-ide-text leading-snug">{n.message}</div>
                    <div className="text-[9px] text-ide-text-dim mt-0.5">{n.source} · {new Date(n.timestamp).toLocaleTimeString()}</div>
                  </div>
                  <button onClick={() => setNotifications(prev => prev.filter(x => x.id !== n.id))}
                    className="opacity-0 group-hover:opacity-100 text-ide-text-dim hover:text-red-400">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Suggested Jobs ── */}
        <div className="border-b border-ide-border/50">
          <button onClick={() => toggleSection('jobs')}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-ide-text-dim hover:text-ide-text hover:bg-ide-bg/30">
            <div className="flex items-center gap-1.5">
              <Star className="w-3 h-3 text-purple-400" />
              Suggested Jobs
              {jobs.length > 0 && (
                <span className="px-1 bg-purple-400/20 text-purple-300 rounded text-[9px]">{jobs.length}</span>
              )}
            </div>
            {sections.jobs ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {sections.jobs && (
            <div className="px-2 pb-2 space-y-1.5">
              {jobs.map(job => (
                <div key={job.id} className="p-1.5 rounded bg-ide-bg/30 border border-ide-border/30 group">
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span className="text-[10px] text-ide-text font-medium leading-snug flex-1">{job.title}</span>
                    <span className={`text-[8px] px-1 py-0.5 rounded flex-shrink-0 ${priorityColor(job.priority)}`}>{job.priority}</span>
                  </div>
                  <div className="text-[9px] text-ide-text-dim leading-snug mb-1.5">{job.description}</div>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-purple-400/70">{job.source}</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={() => onSendToBrainstorm(`Work on this suggested job: ${job.title}\n\n${job.description}`)}
                        className="text-[9px] px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded hover:bg-purple-500/30"
                        title="Send to chat"
                      >→ Chat</button>
                      <button
                        onClick={() => setJobs(prev => prev.filter(j => j.id !== job.id))}
                        className="text-[9px] px-1 py-0.5 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20"
                        title="Dismiss"
                      ><X className="w-2 h-2" /></button>
                    </div>
                  </div>
                </div>
              ))}
              {jobs.length === 0 && (
                <div className="text-[10px] text-ide-text-dim px-1 py-2 text-center">No pending jobs</div>
              )}
            </div>
          )}
        </div>

        {/* ── Codebase Health ── */}
        <div className="border-b border-ide-border/50">
          <button onClick={() => toggleSection('health')}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-ide-text-dim hover:text-ide-text hover:bg-ide-bg/30">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3 h-3 text-green-400" />
              Codebase Health
            </div>
            {sections.health ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {sections.health && (
            <div className="px-3 pb-3 space-y-2">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-ide-text-dim">Snapshot</span>
                <span className={codebaseReady ? 'text-green-400' : 'text-yellow-400'}>
                  {codebaseReady ? '✓ Ready' : '⏳ Loading'}
                </span>
              </div>
              {treeLineCount > 1 && (
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-ide-text-dim">Tree lines</span>
                  <span className="text-ide-text">{treeLineCount.toLocaleString()}</span>
                </div>
              )}
              {blameStats.length > 0 && (
                <div>
                  <div className="text-[9px] text-ide-text-dim mb-1">Model Quality</div>
                  {blameStats.map((s: any) => (
                    <div key={s.model} className="flex items-center justify-between text-[9px] py-0.5">
                      <span className="text-ide-text-dim truncate max-w-[110px]" title={s.model}>
                        {(s.model || '').split('/').pop() || s.model}
                      </span>
                      <span className={`font-mono ${s.successRate > 0.8 ? 'text-green-400' : s.successRate > 0.6 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {s.avgQuality ? `${Math.round(s.avgQuality)}%` : `${Math.round((s.successRate || 0) * 100)}%`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-[9px] text-ide-text-dim">
                <span className="text-purple-400">Tip:</span> Ask the God Factory to scan for debt, gaps, or patterns
              </div>
            </div>
          )}
        </div>

        {/* ── Brainstorm Pad ── */}
        <div>
          <button onClick={() => toggleSection('brainstorm')}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-ide-text-dim hover:text-ide-text hover:bg-ide-bg/30">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-blue-400" />
              Brainstorm Pad
            </div>
            {sections.brainstorm ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {sections.brainstorm && (
            <div className="px-2 pb-2">
              <textarea
                value={brainstorm}
                onChange={e => setBrainstorm(e.target.value)}
                placeholder="Jot ideas here, then send to chat…"
                rows={4}
                className="w-full bg-ide-bg border border-ide-border/50 rounded px-2 py-1.5 text-[10px] text-ide-text placeholder-ide-text-dim resize-none focus:outline-none focus:border-blue-400/50 mb-1.5"
              />
              <button
                onClick={() => { if (brainstorm.trim()) { onSendToBrainstorm(brainstorm.trim()); setBrainstorm(''); } }}
                disabled={!brainstorm.trim()}
                className="w-full text-[10px] py-1 bg-blue-500/15 text-blue-300 rounded hover:bg-blue-500/25 disabled:opacity-30 flex items-center justify-center gap-1"
              >
                <Send className="w-2.5 h-2.5" /> Send to Chat
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Welcome Screen ───────────────────────────────────────────────────────────

function ApprovalModal({ details, onApprove, onReject }: {
  details: ApprovalDetails;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [showFull, setShowFull] = useState(false);
  const isExec = details.type === 'exec';
  const isWrite = details.type === 'write';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-ide-panel border border-ide-border rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[80vh] overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-ide-border bg-ide-bg/50 rounded-t-xl flex-shrink-0">
          <Shield className="w-5 h-5 text-yellow-400" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-ide-text">
              {isExec ? 'Approve Command Execution' : isWrite ? `Approve File ${details.isNew ? 'Creation' : 'Overwrite'}` : 'Approve File Patch'}
            </h3>
            {details.path && <p className="text-[11px] text-ide-text-dim mt-0.5">{details.path}</p>}
          </div>
          <button onClick={onReject} className="text-ide-text-dim hover:text-ide-text"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isExec ? (
            <div className="space-y-3">
              <div>
                <p className="text-[11px] text-ide-text-dim mb-1">Command to execute:</p>
                <div className="bg-ide-bg border border-ide-border rounded-lg p-3 font-mono text-sm text-green-300">
                  {details.command}
                </div>
              </div>
              {details.explanation && (
                <div>
                  <p className="text-[11px] text-ide-text-dim mb-1">Purpose:</p>
                  <p className="text-sm text-ide-text bg-ide-bg/50 rounded p-2">{details.explanation}</p>
                </div>
              )}
              <div className="flex items-center gap-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-[11px] text-yellow-400">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                This command will run in the IDE root directory. Dangerous commands are automatically blocked.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {details.diff && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-ide-text-dim">Diff preview:</p>
                    <button onClick={() => setShowFull(v => !v)} className="text-[10px] text-ide-accent hover:text-ide-accent/80 flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      {showFull ? 'Collapse' : 'Show full diff'}
                    </button>
                  </div>
                  <pre className={`text-[11px] font-mono bg-ide-bg border border-ide-border rounded-lg p-3 overflow-x-auto whitespace-pre-wrap ${showFull ? '' : 'max-h-64 overflow-y-auto'}`}>
                    {details.diff.split('\n').map((line, i) => {
                      const cls = line.startsWith('+') && !line.startsWith('+++')
                        ? 'text-green-400'
                        : line.startsWith('-') && !line.startsWith('---')
                        ? 'text-red-400'
                        : line.startsWith('@@')
                        ? 'text-blue-400'
                        : 'text-ide-text-dim';
                      return <span key={i} className={`block ${cls}`}>{line || ' '}</span>;
                    })}
                  </pre>
                </>
              )}
              {!details.diff && <div className="text-sm text-ide-text-dim p-3 bg-ide-bg/50 rounded">{details.isNew ? 'Creating new file.' : 'Modifying existing file.'}</div>}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-ide-border flex-shrink-0">
          <button onClick={onReject} className="flex items-center gap-2 px-4 py-2 text-sm bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors">
            <XCircle className="w-4 h-4" /> Reject
          </button>
          <button onClick={onApprove} className="flex items-center gap-2 px-4 py-2 text-sm bg-green-500/80 text-white rounded-lg hover:bg-green-500 transition-colors font-medium">
            <CheckCircle className="w-4 h-4" /> Approve & Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolBubble({ message: msg }: { message: GodMessage }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = msg.content.length > 400;
  const preview = isLong && !expanded ? msg.content.slice(0, 400) + '...' : msg.content;
  const icon = msg.toolName === 'run_command' ? <Terminal className="w-3 h-3" />
    : msg.toolName?.includes('file') ? <FileCode className="w-3 h-3" />
    : msg.toolName === 'search_code' ? <Search className="w-3 h-3" />
    : msg.toolName === 'get_docs' ? <BookOpen className="w-3 h-3" />
    : <Wrench className="w-3 h-3" />;

  const statusColor = msg.toolStatus === 'rejected' ? 'text-red-400 bg-red-500/10 border-red-500/20'
    : msg.toolStatus === 'running' ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
    : 'text-purple-400 bg-purple-500/10 border-purple-500/20';

  return (
    <div className="flex gap-3 ml-10">
      <div className={`flex-1 border rounded-lg px-3 py-2 text-[11px] font-mono max-w-[90%] ${statusColor}`}>
        <div className="flex items-center justify-between mb-1">
          <span className="flex items-center gap-1.5 font-semibold">
            {icon}
            {msg.toolName ? formatToolSummary({ tool: msg.toolName, params: msg.toolParams || {} }) : 'tool result'}
          </span>
          <div className="flex items-center gap-2">
            {msg.toolStatus === 'running' && <Loader2 className="w-3 h-3 animate-spin" />}
            {msg.toolStatus === 'rejected' && <span className="text-red-400">rejected</span>}
            {isLong && (
              <button onClick={() => setExpanded(v => !v)} className="opacity-60 hover:opacity-100">
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}
          </div>
        </div>
        <pre className="whitespace-pre-wrap break-words text-[10px] leading-relaxed">{preview}</pre>
      </div>
    </div>
  );
}

function WelcomeScreen({ onSend, codebaseReady, codebaseTree }: { onSend: (msg: string) => void; codebaseReady: boolean; codebaseTree: string }) {
  const starters = [
    { label: '🔍 Analyze & Prioritize', prompt: 'Analyze the entire Personal IDE codebase. List the source files, find what is incomplete, bugged, or not wired into the GUI, and give me a prioritized action plan.' },
    { label: '🔧 Fix All TS Errors', prompt: 'Search the web app and server for TypeScript compilation problems. Run tsc --noEmit and fix everything that fails.' },
    { label: '🤖 Audit Agent Pipeline', prompt: 'Read the agent loop, tool executor, and fleet UI. Why does the agent stall or fail to act? Fix the issues and make it production-ready.' },
    { label: '🔌 Wire All Features', prompt: 'Review all React components in apps/web/src. Find everything built but not accessible in the GUI. Wire it in properly.' },
    { label: '📚 Read the Docs', prompt: 'List all help/documentation sections available. Read IDE_ARCHITECTURE.md and USER_MANUAL.md, then explain how the app works and how a new user should use it.' },
    { label: '📊 Research Free Models', prompt: 'Search the model registry and provider routes. Tell me which free models are supported and which current free models are missing from the IDE.' },
    { label: '⚡ Hardware & Ollama', prompt: 'Run system info commands to detect CPU, GPU, and RAM. Based on the hardware, tell me which local models in the Ollama catalog are realistic to run.' },
    { label: '🚀 Release Checklist', prompt: 'Read TODO_ROADMAP.md and COMPLETED_LOG.md. Build me a release checklist for turning this into a real public product.' },
  ];

  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="text-center mb-8">
        <div className="text-5xl mb-3">⚡</div>
        <h2 className="text-2xl font-bold text-ide-text mb-2">The God Factory</h2>
        <p className="text-sm text-ide-text-dim leading-relaxed max-w-xl mx-auto">
          Your in-app Principal AI Architect. It can read files, search code, consult documentation,
          edit source, and run commands from inside the app. Writes and command execution require your approval.
        </p>
        <div className="mt-3 flex items-center justify-center gap-2">
          {codebaseReady
            ? <span className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1 bg-green-500/10 border border-green-500/20 text-green-400 rounded-full">
                ✓ Codebase loaded{codebaseTree ? ` · ${codebaseTree.split('\n').length} entries indexed` : ''}
              </span>
            : <span className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-full animate-pulse">
                ⏳ Loading codebase context…
              </span>
          }
        </div>
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
        <span>🔧 Tool-capable agent with file + docs access</span>
        <span>·</span>
        <span>🔒 Writes require approval + auto-backup</span>
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
