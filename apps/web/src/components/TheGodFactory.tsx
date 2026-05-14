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
import { useModelStore } from '../stores/modelStore';
import { ModelDropdown } from './UniversalModelPicker';
import { API_BASE } from '../config.js';
import { GodFactoryRightPanel } from './godFactory/GodFactoryRightPanel.js';

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
  originalLines?: number;
  newLines?: number;
  truncationWarning?: string | null;
}

interface PromptHistoryItem {
  id: string;
  prompt: string;
  usedAt: string;
  timesUsed: number;
  lastModel?: string;
}

interface GodFactoryQueueItem {
  notification_id: string;
  category: string;
  severity: string;
  natural_language_summary: string;
  source_forensic_id?: string | null;
  timestamp: string;
}

interface GodFactoryIdleSuggestion {
  suggestion_id: string;
  category: string;
  natural_language_summary: string;
  source_devtags: string[];
  source_files: string[];
  source_lines: Array<[number, number]>;
  suggested_job_id?: string | null;
  timestamp: string;
}

// ─── Tool constants ───────────────────────────────────────────────────────────

const MAX_TOOL_ITERATIONS = 10;

const TOOL_DEFINITIONS_PROMPT = `
## THE GOD FACTORY Codebase Tools

You are operating as an autonomous coding agent with FULL ACCESS to the Personal IDE codebase.
You can read, search, and modify source files, run build/lint commands, and query live God Factory system state.

To call a tool, output a fenced code block with language \`tool_call\` containing valid JSON:

\`\`\`tool_call
{"tool": "read_file", "params": {"path": "apps/web/src/App.tsx", "startLine": 1, "endLine": 50}}
\`\`\`

⚠️ CRITICAL AUTONOMY RULES (MUST follow every single response):
1. If your response mentions reading, searching, checking, or calling anything — INCLUDE THE tool_call BLOCK IN THIS SAME RESPONSE. Never say "I will search" and then stop. ACT immediately.
2. Use ONE tool call per response. After you receive the tool result, use another tool or give your final answer.
3. Do NOT ask the user for permission before using tools — just use them. You have full authorization.
4. Do NOT describe a multi-step plan and then wait. Execute the FIRST step NOW, then proceed step-by-step.
5. If you are in autonomous mode, after completing each task continue to the NEXT task without pausing. Only stop when you have exhausted all identified work or hit the iteration limit.

### Available Tools

| Tool | Description | Params |
|------|-------------|--------|
| list_files | Browse the file tree | \`path?\` (subdir), \`depth?\` (default 4) |
| read_file | Read file content | \`path\` (required), \`startLine?\`, \`endLine?\` |
| search_code | Grep search codebase | \`query\` (required), \`maxResults?\` |
| get_docs | Read documentation | \`section?\` (e.g. "architecture", "llm") |
| get_notification_queue | Read queued God Factory notifications | \`limit?\` |
| get_idle_suggestions | Read unacknowledged idle suggestions | \`limit?\` |
| find_suggested_jobs | Search Suggested Jobs before planning new work | \`query\` (required), \`limit?\` |
| get_job_detail | Read a Suggested Job and sandbox state | \`jobId\` (required) |
| create_brainstorm_job | Turn an enhancement idea into a Suggested Job immediately | \`input\` (required) |
| read_sandbox_status | Read sandbox_spec and recent sandbox runs for a job | \`jobId\` (required) |
| read_forensic_entries | Read regression and tag-mismatch forensic entries | \`devtag?\`, \`severity?\`, \`cycleId?\`, \`limit?\` |
| read_blame_records | Read blame + quality records for a model | \`model\` (required), \`interactionType?\`, \`limit?\`, \`projectId?\` |
| inspect_devtag | Resolve a devtag from the latest crawler snapshot | \`name\` (required), \`limit?\` |
| live_debt_check | Compute current debt scores for one or more files | \`files\` (required string array) |
| live_coverage_check | Read live coverage for one or more plantags or a scope | \`plantags?\` (string array), \`scope?\` |
| live_pattern_query | Query recurring patterns and severity trends | \`failure_type?\`, \`devtag_type?\`, \`agent_category?\`, \`build_phase?\`, \`min_recurrence?\`, \`anti_pattern_only?\` |
| patch_file | Replace a string in a file (requires user approval) | \`path\`, \`oldString\`, \`newString\` |
| write_file | Write/create a whole file (requires user approval) | \`path\`, \`content\` |
| run_command | Run a terminal command (requires user approval) | \`command\`, \`explanation\`, \`cwd?\` |
| resolve_devtag | Resolve a devtag by tag_key from the registry | \`tag_key\` (required) |
| tag_vocabulary_diff | Show all tag types in use, proposed, and unused | _(no params)_ |
| orphan_scan | Find dead/orphaned devtags and buildtags | _(no params)_ |
| conflict_scan | Show active devtag claim conflicts | \`devtag_ids?\` (comma-separated) |
| gap_scan | Run a live gap analysis scan | \`scope?\`, \`depth?\`, \`tag_filter?\` |
| regression_index | Get systemic regression entries | \`devtag?\`, \`limit?\` |
| debt_heatmap | Show debt heatmap by file/component | \`threshold?\` (0.0–1.0) |
| pattern_trend | Get trend data for a recurring pattern | \`pattern_id\` (required), \`limit?\` |
| agent_conformance_report | Get agent performance/conformance report | \`agent_id?\` |
| implementation_pipeline_status | Get staged pipeline progress for an implementing job | \`job_id\` (required) |
| spawn_authority_check | Request/validate sub-agent spawn with Tier 3+ confirmation gating | \`requesting_agent_id\`, \`requesting_agent_type\`, \`requested_sub_agent\` |
| silicon_factory_status | Read Silicon Factory supervisor, queue, and task ledger status | _(no params)_ |
| silicon_factory_enqueue_task | Enqueue one atomic task in the Silicon Factory task ledger | \`instruction\` (required), \`agent_type?\`, \`next_step_hint?\` |
| silicon_factory_resume | Run cold-boot resume to re-queue interrupted ACTIVE tasks | _(no params)_ |
| silicon_factory_lock_acquire | Acquire a Sync-Lock for a critical shard | \`lock_key\` (required), \`owner_agent\` (required), \`ttl_seconds?\` |
| silicon_factory_lock_release | Release a Sync-Lock | \`lock_key\` (required), \`owner_agent?\` |
| silicon_factory_snapshot | Create a Deep-State snapshot | \`reason?\` |
| silicon_factory_iap_send | Send an Inter-Agent Protocol message | \`from_agent\`, \`to_agent\`, \`message_type\`, \`payload?\` |
| silicon_factory_spec_validate | Validate code against the active spec contract | \`code?\`, \`task_id?\`, \`fail_task_on_violation?\` |
| silicon_project_context | Set/get active project context for Silicon tooling | \`project_id?\`, \`project_root?\`, \`mode?\` (\`get\` or \`set\`) |
| silicon_symbol_read | Symbol-level read for function/class API/struct/signature | \`symbol_name\` (required), \`read_type?\`, \`file_path?\`, \`project_id?\` |
| silicon_graph_query | Navigate symbol graph callers/callees/usages/includes | \`mode\` (required), \`symbol?\`, \`file_path?\`, \`project_id?\`, \`limit?\` |
| silicon_semantic_find | Semantic-like code retrieval by concept | \`query\` (required), \`project_id?\`, \`limit?\` |
| silicon_task_context | Build compressed context for one task | \`task_id\` (required), \`project_id?\`, \`budget_tokens?\`, \`diagnostics_raw?\` |
| silicon_context_delta | Delta-encode context sections | \`previous_sections\` (object), \`current_sections\` (object) |
| silicon_compress_diagnostics | Compress verbose compiler/linter output | \`raw\` (required), \`max_items?\` |
| silicon_compress_test_output | Compress verbose test output | \`raw\` (required), \`max_failures?\` |
| silicon_test_discovery | Find tests covering a symbol or file | \`symbol?\`, \`file_path?\`, \`project_id?\`, \`limit?\` |
| silicon_reindex_tests | Scan project test files and build test-coverage index | \`project_id?\`, \`project_root?\` |
| silicon_reindex_embeddings | Rebuild TF-IDF symbol embeddings for stronger semantic find | \`project_id?\` |

### Tool Rules
- Use ONE tool call per response turn — include it in the SAME response where you decide to use it
- NEVER describe what you will do and then stop — execute immediately
- **ALWAYS use \`patch_file\` for modifying existing files — NEVER use \`write_file\` on files that already exist**
- **ONLY use \`write_file\` when creating a brand-new file that does not yet exist**
- The reason: \`write_file\` replaces the entire file content. If your generated content is incomplete due to token limits or context loss, you will silently delete working code. \`patch_file\` surgically replaces only the matched region, leaving everything else untouched.
- Always READ a file before patching it (ensures oldString matches exactly)
- For patch_file: include 3+ lines of unchanged context around the target text
- patch_file oldString must match EXACTLY ONCE — add more context if needed
- When the user asks for a feature, enhancement, or implementation, call \`find_suggested_jobs\` first
- If a matching job exists, call \`get_job_detail\` or \`read_sandbox_status\` before recommending implementation
- If no matching job exists for a requested enhancement, call \`create_brainstorm_job\` to create a real Suggested Job instead of inventing one
- When the user asks about codebase state, regressions, model performance, coverage, debt, or recurring failures, use the live God Factory tools instead of guessing
- Brainstorm responses must cite live tool results such as devtags, files, debt scores, patterns, or blame/model data
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
    // Normalize: handle both {tool, params: {...}} and flat {tool, key1: val1, ...}
    if (!parsed.params || typeof parsed.params !== 'object') {
      const { tool, ...rest } = parsed;
      return { tool, params: rest } as ToolCall;
    }
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
    case 'get_notification_queue': return `get_notification_queue(${p.limit || 10})`;
    case 'get_idle_suggestions': return `get_idle_suggestions(${p.limit || 10})`;
    case 'find_suggested_jobs': return `find_suggested_jobs("${p.query}")`;
    case 'get_job_detail': return `get_job_detail(${p.jobId})`;
    case 'create_brainstorm_job': return `create_brainstorm_job(${String(p.input).slice(0, 40)})`;
    case 'read_sandbox_status': return `read_sandbox_status(${p.jobId})`;
    case 'read_forensic_entries': return `read_forensic_entries(${p.devtag || p.severity || 'recent'})`;
    case 'read_blame_records': return `read_blame_records(${p.model})`;
    case 'inspect_devtag': return `inspect_devtag(${p.name})`;
    case 'live_debt_check': return `live_debt_check(${Array.isArray(p.files) ? p.files.length : 0} files)`;
    case 'live_coverage_check': return `live_coverage_check(${Array.isArray(p.plantags) ? p.plantags.join(',') : p.scope || 'scope'})`;
    case 'live_pattern_query': return `live_pattern_query(${p.failure_type || p.devtag_type || 'patterns'})`;
    case 'patch_file':   return `patch_file(${p.path})`;
    case 'write_file':   return `write_file(${p.path})`;
    case 'run_command':  return `run_command(${String(p.command).slice(0, 60)})`;
    case 'resolve_devtag': return `resolve_devtag(${p.tag_key})`;
    case 'tag_vocabulary_diff': return `tag_vocabulary_diff()`;
    case 'orphan_scan':  return `orphan_scan()`;
    case 'conflict_scan': return `conflict_scan(${p.devtag_ids || 'all'})`;
    case 'gap_scan':     return `gap_scan(${p.scope || 'full'})`;
    case 'regression_index': return `regression_index(${p.devtag || 'all'})`;
    case 'debt_heatmap': return `debt_heatmap(threshold=${p.threshold ?? 0})`;
    case 'pattern_trend': return `pattern_trend(${p.pattern_id})`;
    case 'agent_conformance_report': return `agent_conformance_report(${p.agent_id || 'all'})`;
    case 'implementation_pipeline_status': return `implementation_pipeline_status(${p.job_id})`;
    case 'spawn_authority_check': return `spawn_authority_request(${p.requested_sub_agent})`;
    case 'silicon_factory_status': return 'silicon_factory_status()';
    case 'silicon_factory_enqueue_task': return `silicon_factory_enqueue_task(${String(p.instruction || '').slice(0, 28)}...)`;
    case 'silicon_factory_resume': return 'silicon_factory_resume()';
    case 'silicon_factory_lock_acquire': return `silicon_factory_lock_acquire(${p.lock_key})`;
    case 'silicon_factory_lock_release': return `silicon_factory_lock_release(${p.lock_key})`;
    case 'silicon_factory_snapshot': return `silicon_factory_snapshot(${p.reason || 'manual'})`;
    case 'silicon_factory_iap_send': return `silicon_factory_iap_send(${p.from_agent}→${p.to_agent})`;
    case 'silicon_factory_spec_validate': return `silicon_factory_spec_validate(${p.task_id || 'code'})`;
    case 'silicon_project_context': return `silicon_project_context(${p.mode || 'get'})`;
    case 'silicon_symbol_read': return `silicon_symbol_read(${p.symbol_name}, ${p.read_type || 'signature'})`;
    case 'silicon_graph_query': return `silicon_graph_query(${p.mode})`;
    case 'silicon_semantic_find': return `silicon_semantic_find(${String(p.query || '').slice(0, 24)}...)`;
    case 'silicon_task_context': return `silicon_task_context(${p.task_id})`;
    case 'silicon_context_delta': return 'silicon_context_delta()';
    case 'silicon_compress_diagnostics': return 'silicon_compress_diagnostics()';
    case 'silicon_compress_test_output': return 'silicon_compress_test_output()';
    case 'silicon_test_discovery': return `silicon_test_discovery(${p.symbol || p.file_path || '?'})`;
    case 'silicon_reindex_tests': return 'silicon_reindex_tests()';
    case 'silicon_reindex_embeddings': return 'silicon_reindex_embeddings()';
    default:             return `${call.tool}(${JSON.stringify(p).slice(0, 60)})`;
  }
}

function safePretty(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function buildSessionBriefing(notifications: GodFactoryQueueItem[], suggestions: GodFactoryIdleSuggestion[]): string {
  const lines: string[] = ['[THE GOD FACTORY STARTUP BRIEF]'];

  if (notifications.length === 0) {
    lines.push('Notification queue: no queued notifications.');
  } else {
    lines.push('Notification queue:');
    notifications.forEach((item, index) => {
      lines.push(`${index + 1}. [${item.severity}] ${item.category} — ${item.natural_language_summary}`);
    });
  }

  if (suggestions.length === 0) {
    lines.push('Idle suggestions: none waiting.');
  } else {
    lines.push('Idle suggestions:');
    suggestions.forEach((item, index) => {
      const refs = [
        item.source_devtags?.length ? `devtags: ${item.source_devtags.join(', ')}` : '',
        item.source_files?.length ? `files: ${item.source_files.join(', ')}` : '',
      ].filter(Boolean).join(' | ');
      lines.push(`${index + 1}. ${item.category} — ${item.natural_language_summary}${refs ? ` (${refs})` : ''}`);
    });
  }

  lines.push('I am ready for the next instruction.');
  return lines.join('\n');
}

// ─── Persistence ─────────────────────────────────────────────────────────────

const HIST_KEY = 'god_factory_prompt_history';
const CONV_KEY = 'god_factory_conversation';
const SESSION_KEY = 'god_factory_session_id';
const SESSION_BRIEF_KEY_PREFIX = 'god_factory_session_brief_shown:';

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
        title="YouTube — THE GOD FACTORY"
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
  const { allModels, fetchModels } = useModelStore();
  const [ideRootPath, setIdeRootPath] = useState<string | undefined>(undefined);

  // Use the global chat-store model as default to keep God Factory aligned with the rest of the app.
  const [localModel, setLocalModel] = useState(selectedModel || 'github/openai/gpt-4.1-mini');

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
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [godFactorySessionId, setGodFactorySessionId] = useState<string | null>(() => {
    try { return localStorage.getItem(SESSION_KEY); } catch { return null; }
  });
  const [sessionEpoch, setSessionEpoch] = useState(0);

  // Tool-calling state
  const [toolsEnabled, setToolsEnabled]           = useState(true);
  const [toolIterationCount, setToolIterationCount] = useState(0);
  const [pendingApproval, setPendingApproval]     = useState<ApprovalDetails | null>(null);
  const approvalResolveRef = useRef<((approved: boolean) => void) | null>(null);
  const [autonomousMode, setAutonomousMode]       = useState(false);

  // Codebase snapshot — pre-loaded on mount so system prompt always has real context
  const [codebaseTree, setCodebaseTree]   = useState<string>('');
  const [codebaseReady, setCodebaseReady] = useState(false);
  const [feedbackContext, setFeedbackContext] = useState<string>('');

  const abortRef  = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const godFactorySessionIdRef = useRef<string | null>(godFactorySessionId);
  const sessionIntroShownRef = useRef<string | null>(null);
  const autonomousModeRef = useRef(false);

  // Keep local model synced with the global model selection to avoid stale provider drift.
  useEffect(() => {
    if (selectedModel && selectedModel !== localModel) setLocalModel(selectedModel);
  }, [selectedModel]);
  // Force-refresh models on mount so GitHub PAT models are always current
  useEffect(() => { void fetchModels(true); }, [fetchModels]);
  useEffect(() => {
    if (allModels.length === 0 || !localModel) return;
    if (allModels.some(model => model.id === localModel)) return;
    const nextModel = allModels.find(model => model.id === selectedModel)?.id || allModels[0].id;
    setLocalModel(nextModel);
  }, [allModels, localModel, selectedModel]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { saveConv(messages); }, [messages]);
  useEffect(() => { saveHistory(history); }, [history]);
  useEffect(() => { godFactorySessionIdRef.current = godFactorySessionId; }, [godFactorySessionId]);
  useEffect(() => {
    try {
      if (godFactorySessionId) localStorage.setItem(SESSION_KEY, godFactorySessionId);
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      // no-op
    }
  }, [godFactorySessionId]);
  useEffect(() => { autonomousModeRef.current = autonomousMode; }, [autonomousMode]);

  // ── Load codebase tree on mount ───────────────────────────────────────────
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rootRes = await fetch(`${API_BASE}/api/codebase/root`);
        const rootData = await rootRes.json().catch(() => ({}));
        if (active && typeof rootData?.root === 'string' && rootData.root.trim()) {
          setIdeRootPath(rootData.root);
        }
        const [treeRes, docsRes, stateRes, projectStateRes, feedbackIndexRes] = await Promise.all([
          fetch(`${API_BASE}/api/codebase/tree?path=.&depth=3`),
          fetch(`${API_BASE}/api/codebase/docs`),
          fetch(`${API_BASE}/api/subsystems/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              subsystem: 'ide_codebase_crawler',
              depth: 4,
            }),
          }),
          activeProject?.rootPath
            ? fetch(`${API_BASE}/api/subsystems/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  subsystem: 'project_state_crawler',
                  projectRoot: activeProject.rootPath,
                  depth: 4,
                }),
              })
            : Promise.resolve(null),
          fetch(`${API_BASE}/api/codebase/feedback`),
        ]);
        function flatNode(node: { name: string; type: string; children?: unknown[] }, ind = 0): string {
          const pfx = '  '.repeat(ind) + (node.type === 'directory' ? '📁 ' : '   ');
          let out = `${pfx}${node.name}\n`;
          if (node.children) for (const c of node.children as typeof node[]) out += flatNode(c, ind + 1);
          return out;
        }
        const treeData = await treeRes.json().catch(() => ({}));
        const docsData = await docsRes.json().catch(() => ({}));
        const stateData = await stateRes.json().catch(() => ({}));
        const projectStateData = projectStateRes ? await projectStateRes.json().catch(() => ({})) : null;
        const feedbackIndex = await feedbackIndexRes.json().catch(() => ({}));
        if (!active) return;
        const treeText = treeData.tree ? flatNode(treeData.tree).slice(0, 5000) : '';
        const docsList = docsData.sections ? (docsData.sections as string[]).map((s: string) => `  - ${s}`).join('\n') : '';
        const ideSummary = stateData?.result?.summary ? `## IDE App State Summary\n${stateData.result.summary}` : '';
        const ideExtSummary = Array.isArray(stateData?.result?.topExtensions) && stateData.result.topExtensions.length
          ? `## IDE App File Types\n${stateData.result.topExtensions.map((x: { ext: string; count: number }) => `  - ${x.ext}: ${x.count}`).join('\n')}`
          : '';
        const projectSummary = projectStateData?.result?.summary ? `## Active Project State Summary\n${projectStateData.result.summary}` : '';
        const projectExtSummary = Array.isArray(projectStateData?.result?.topExtensions) && projectStateData.result.topExtensions.length
          ? `## Active Project File Types\n${projectStateData.result.topExtensions.map((x: { ext: string; count: number }) => `  - ${x.ext}: ${x.count}`).join('\n')}`
          : '';
        const preferredFeedbackSections = ['unifi_spec.txt', 'memory_tab_spec.txt', 'memory_tab_spec_addendum.txt'];
        const availableFeedbackSections = Array.isArray(feedbackIndex?.sections)
          ? (feedbackIndex.sections as string[])
          : [];
        const toFetch = preferredFeedbackSections.filter((s) => availableFeedbackSections.includes(s));
        const feedbackChunks = await Promise.all(
          toFetch.map(async (section) => {
            try {
              const res = await fetch(`${API_BASE}/api/codebase/feedback?section=${encodeURIComponent(section)}`);
              const data = await res.json().catch(() => ({}));
              if (!data?.content) return '';
              const content = String(data.content).slice(0, 10000);
              return `## Feedback Spec: ${section}\n\n${content}`;
            } catch {
              return '';
            }
          })
        );
        const snapshot = [
          treeText ? `## Personal IDE File Tree\n\`\`\`\n${treeText}\`\`\`` : '',
          ideSummary,
          ideExtSummary,
          projectSummary,
          projectExtSummary,
          docsList ? `## Available Documentation Sections\n${docsList}` : '',
        ].filter(Boolean).join('\n\n');
        setCodebaseTree(snapshot);
        setFeedbackContext(feedbackChunks.filter(Boolean).join('\n\n'));
        setCodebaseReady(true);
      } catch {
        if (active) setCodebaseReady(true); // proceed even if offline
      }
    })();
    return () => { active = false; };
  }, [activeProject?.rootPath]);

  const selectedModelDef = allModels.find(m => m.id === localModel);

  const addToHistory = useCallback((prompt: string, model?: string) => {
    setHistory(prev => {
      const existing = prev.find(h => h.prompt === prompt);
      if (existing) return prev.map(h => h.prompt === prompt
        ? { ...h, timesUsed: h.timesUsed + 1, usedAt: new Date().toISOString(), lastModel: model }
        : h);
      return [{ id: Date.now().toString(), prompt, usedAt: new Date().toISOString(), timesUsed: 1, lastModel: model }, ...prev];
    });
  }, []);

  const createGodFactorySession = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/god-factory/sessions/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_cycle: `${Date.now()}`,
          notifications_presented: [],
          project_id: null,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json().catch(() => null) as { session_id?: string } | null;
      if (!data?.session_id) return null;
      setGodFactorySessionId(data.session_id);
      godFactorySessionIdRef.current = data.session_id;
      return data.session_id;
    } catch {
      return null;
    }
  }, []);

  const ensureGodFactorySession = useCallback(async () => {
    return godFactorySessionIdRef.current || await createGodFactorySession();
  }, [createGodFactorySession]);

  const appendGodFactorySession = useCallback(async (payload: Record<string, unknown>) => {
    const sessionId = await ensureGodFactorySession();
    if (!sessionId) return;
    try {
      await fetch(`${API_BASE}/api/god-factory/sessions/${sessionId}/append`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      // noop
    }
  }, [ensureGodFactorySession]);

  const injectSessionBriefing = useCallback(async (sessionId: string) => {
    if (sessionIntroShownRef.current === sessionId) return;
    try {
      const persisted = sessionStorage.getItem(`${SESSION_BRIEF_KEY_PREFIX}${sessionId}`) === '1';
      if (persisted) {
        sessionIntroShownRef.current = sessionId;
        return;
      }
    } catch {
      // no-op
    }

    try {
      const [queueRes, suggestionsRes] = await Promise.all([
        fetch(`${API_BASE}/api/god-factory/queue?limit=5`),
        fetch(`${API_BASE}/api/god-factory/idle-suggestions?limit=5`),
      ]);
      const queueData = queueRes.ok ? await queueRes.json().catch(() => null) as { notifications?: GodFactoryQueueItem[] } | null : null;
      const suggestionsData = suggestionsRes.ok ? await suggestionsRes.json().catch(() => null) as { suggestions?: GodFactoryIdleSuggestion[] } | null : null;
      const notifications = queueData?.notifications || [];
      const suggestions = suggestionsData?.suggestions || [];

      setMessages(prev => {
        if (prev.some(msg => msg.id === `gf-startup-${sessionId}`)) return prev;
        return [...prev, {
          id: `gf-startup-${sessionId}`,
          role: 'assistant',
          content: buildSessionBriefing(notifications, suggestions),
          timestamp: new Date().toISOString(),
          status: 'done',
          model: localModel,
        }];
      });

      for (const item of notifications) {
        void appendGodFactorySession({ notification_presented: item.notification_id });
      }
    } finally {
      sessionIntroShownRef.current = sessionId;
      try { sessionStorage.setItem(`${SESSION_BRIEF_KEY_PREFIX}${sessionId}`, '1'); } catch {}
    }
  }, [appendGodFactorySession, localModel]);

  useEffect(() => {
    void ensureGodFactorySession();
  }, [ensureGodFactorySession, sessionEpoch]);

  useEffect(() => {
    if (!godFactorySessionId) return;
    void injectSessionBriefing(godFactorySessionId);
  }, [godFactorySessionId, injectSessionBriefing]);

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
        case 'get_notification_queue': {
          const limit = Math.min(Math.max(Number(params.limit || 10), 1), 20);
          const res = await fetch(`${API_BASE}/api/god-factory/queue?limit=${limit}`);
          const data = await res.json();
          if (data.error) return `Error: ${data.error}`;
          return safePretty(data.notifications || []);
        }
        case 'get_idle_suggestions': {
          const limit = Math.min(Math.max(Number(params.limit || 10), 1), 20);
          const res = await fetch(`${API_BASE}/api/god-factory/idle-suggestions?limit=${limit}`);
          const data = await res.json();
          if (data.error) return `Error: ${data.error}`;
          return safePretty(data.suggestions || []);
        }
        case 'find_suggested_jobs': {
          const query = String(params.query || '').trim();
          if (!query) return 'Error: query is required';
          const limit = Math.min(Math.max(Number(params.limit || 10), 1), 25);
          const qp = new URLSearchParams({ search: query, limit: String(limit) });
          const res = await fetch(`${API_BASE}/api/suggested-jobs/jobs?${qp}`);
          const data = await res.json();
          if (data.error) return `Error: ${data.error}`;
          return safePretty({ total: data.total, jobs: data.jobs });
        }
        case 'get_job_detail': {
          const jobId = String(params.jobId || '').trim();
          if (!jobId) return 'Error: jobId is required';
          const res = await fetch(`${API_BASE}/api/suggested-jobs/jobs/${encodeURIComponent(jobId)}`);
          const data = await res.json();
          if (data.error) return `Error: ${data.error}`;
          return safePretty(data);
        }
        case 'create_brainstorm_job': {
          const input = String(params.input || '').trim();
          if (!input) return 'Error: input is required';
          const res = await fetch(`${API_BASE}/api/god-factory/brainstorm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input }),
          });
          const data = await res.json();
          if (data.error) return `Error: ${data.error}`;
          return safePretty(data);
        }
        case 'read_sandbox_status': {
          const jobId = String(params.jobId || '').trim();
          if (!jobId) return 'Error: jobId is required';
          const res = await fetch(`${API_BASE}/api/suggested-jobs/jobs/${encodeURIComponent(jobId)}`);
          const data = await res.json();
          if (data.error) return `Error: ${data.error}`;
          return safePretty({
            job: data.job,
            sandbox_spec: data.job?.sandbox_spec,
            sandboxRuns: data.sandboxRuns,
            testResults: data.testResults,
          });
        }
        case 'read_forensic_entries': {
          const limit = Math.min(Math.max(Number(params.limit || 20), 1), 100);
          const devtag = params.devtag ? String(params.devtag) : '';
          const severity = params.severity ? String(params.severity) : '';
          const cycleId = params.cycleId ? String(params.cycleId) : '';
          const regQ = new URLSearchParams({ limit: String(limit) });
          if (devtag) regQ.set('devtag', devtag);
          if (cycleId) regQ.set('cycle_id', cycleId);
          const mismatchQ = new URLSearchParams();
          if (devtag) mismatchQ.set('devtag', devtag);
          if (severity) mismatchQ.set('severity', severity);
          const [regressionsRes, mismatchesRes] = await Promise.all([
            fetch(`${API_BASE}/api/forensic/regressions?${regQ}`),
            fetch(`${API_BASE}/api/forensic/tag-mismatches?${mismatchQ}`),
          ]);
          const regressions = regressionsRes.ok ? await regressionsRes.json().catch(() => ({})) : {};
          const mismatches = mismatchesRes.ok ? await mismatchesRes.json().catch(() => ({})) : {};
          return safePretty({ regressions: regressions.entries || [], tag_mismatches: mismatches.entries || [] });
        }
        case 'read_blame_records': {
          const model = String(params.model || '').trim();
          if (!model) return 'Error: model is required';
          const qp = new URLSearchParams({ model, limit: String(Math.min(Math.max(Number(params.limit || 20), 1), 100)) });
          if (params.interactionType) qp.set('interactionType', String(params.interactionType));
          if (params.projectId) qp.set('projectId', String(params.projectId));
          const res = await fetch(`${API_BASE}/api/blame/records?${qp}`);
          const data = await res.json();
          if (data.error) return `Error: ${data.error}`;
          return safePretty(data);
        }
        case 'inspect_devtag': {
          const name = String(params.name || '').trim();
          if (!name) return 'Error: name is required';
          const limit = Math.min(Math.max(Number(params.limit || 20), 1), 100);
          const snapshotsRes = await fetch(`${API_BASE}/api/project-state-crawler/snapshots`);
          const snapshots = await snapshotsRes.json().catch(() => []);
          const snapshotId = Array.isArray(snapshots) && snapshots[0]?.snapshot_id ? snapshots[0].snapshot_id : null;
          if (!snapshotId) return 'Error: no crawler snapshot is available';
          const qp = new URLSearchParams({ name, limit: String(limit) });
          const res = await fetch(`${API_BASE}/api/project-state-crawler/snapshots/${encodeURIComponent(snapshotId)}/devtags?${qp}`);
          const data = await res.json();
          if (data.error) return `Error: ${data.error}`;
          return safePretty({ snapshot_id: snapshotId, total: data.total, rows: data.rows });
        }
        case 'live_debt_check': {
          const files = Array.isArray(params.files) ? params.files.map(String).filter(Boolean) : [];
          if (files.length === 0) return 'Error: files must be a non-empty array';
          const results = await Promise.all(files.map(async (filePath) => {
            const res = await fetch(`${API_BASE}/api/gap/debt/score?file_path=${encodeURIComponent(filePath)}`);
            const data = await res.json().catch(() => ({ error: 'Failed to read debt score' }));
            return { file_path: filePath, result: data };
          }));
          results.sort((left, right) => Number(right.result?.debt_score || 0) - Number(left.result?.debt_score || 0));
          return safePretty(results);
        }
        case 'live_coverage_check': {
          const plantags = Array.isArray(params.plantags) ? params.plantags.map(String).filter(Boolean) : [];
          if (plantags.length > 0) {
            const results = await Promise.all(plantags.map(async (plantag) => {
              const res = await fetch(`${API_BASE}/api/gap/coverage/check/${encodeURIComponent(plantag)}`);
              const data = await res.json().catch(() => ({ error: 'Failed to read coverage' }));
              return { plantag, result: data };
            }));
            return safePretty(results);
          }
          const qp = new URLSearchParams();
          if (params.scope) qp.set('scope', String(params.scope));
          const res = await fetch(`${API_BASE}/api/gap/coverage?${qp}`);
          const data = await res.json();
          if (data.error) return `Error: ${data.error}`;
          return safePretty(data);
        }
        case 'live_pattern_query': {
          const qp = new URLSearchParams();
          if (params.failure_type) qp.set('failure_type', String(params.failure_type));
          if (params.devtag_type) qp.set('devtag_type', String(params.devtag_type));
          if (params.agent_category) qp.set('agent_category', String(params.agent_category));
          if (params.build_phase) qp.set('build_phase', String(params.build_phase));
          if (params.min_recurrence !== undefined) qp.set('min_recurrence', String(params.min_recurrence));
          if (params.anti_pattern_only !== undefined) qp.set('anti_pattern_only', String(Boolean(params.anti_pattern_only)));
          const res = await fetch(`${API_BASE}/api/gap/patterns?${qp}`);
          const data = await res.json();
          if (data.error) return `Error: ${data.error}`;
          return safePretty(data);
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
          const approved = await requestApproval({
            type: 'write',
            path: String(params.path),
            diff: preview.diff,
            isNew: preview.isNew,
            originalLines: preview.originalLines,
            newLines: preview.linesWritten,
            truncationWarning: preview.truncationWarning ?? null,
          });
          if (!approved) return `User rejected write to ${params.path}.`;
          const applyRes = await fetch(`${API_BASE}/api/codebase/write`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: params.path, content: params.content, approved: true, force: true }),
          });
          const result = await applyRes.json();
          if (!applyRes.ok) return `Error: ${result.error}`;
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
        case 'resolve_devtag': {
          const res = await fetch(`${API_BASE}/api/tags/devtags/resolve?tag_key=${encodeURIComponent(String(params.tag_key || ''))}`);
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Not found'}`;
          return safePretty(data);
        }
        case 'tag_vocabulary_diff': {
          const res = await fetch(`${API_BASE}/api/tags/vocabulary-diff`);
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Failed'}`;
          return safePretty(data);
        }
        case 'orphan_scan': {
          const res = await fetch(`${API_BASE}/api/tags/orphan-scan`);
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Failed'}`;
          return safePretty(data);
        }
        case 'conflict_scan': {
          const qs = params.devtag_ids ? `?devtag_ids=${encodeURIComponent(String(params.devtag_ids))}` : '';
          const res = await fetch(`${API_BASE}/api/tags/conflict-scan${qs}`);
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Failed'}`;
          return safePretty(data);
        }
        case 'gap_scan': {
          const qp = new URLSearchParams();
          if (params.scope) qp.set('scope', String(params.scope));
          if (params.depth) qp.set('depth', String(params.depth));
          if (params.tag_filter) qp.set('tag_filter', String(params.tag_filter));
          const res = await fetch(`${API_BASE}/api/gap/scan?${qp.toString()}`);
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Failed'}`;
          return safePretty(data);
        }
        case 'regression_index': {
          const qp = new URLSearchParams();
          if (params.devtag) qp.set('devtag', String(params.devtag));
          if (params.limit) qp.set('limit', String(params.limit));
          const res = await fetch(`${API_BASE}/api/forensic/regressions?${qp.toString()}`);
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Failed'}`;
          return safePretty(data);
        }
        case 'debt_heatmap': {
          const qp = new URLSearchParams();
          if (params.threshold) qp.set('threshold', String(params.threshold));
          const res = await fetch(`${API_BASE}/api/gap/debt/heatmap?${qp.toString()}`);
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Failed'}`;
          return safePretty(data);
        }
        case 'pattern_trend': {
          const patternId = encodeURIComponent(String(params.pattern_id || ''));
          const qp = new URLSearchParams();
          if (params.limit) qp.set('limit', String(params.limit));
          const res = await fetch(`${API_BASE}/api/gap/patterns/${patternId}?${qp.toString()}`);
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Failed'}`;
          return safePretty(data);
        }
        case 'agent_conformance_report': {
          const qp = new URLSearchParams();
          if (params.agent_id) qp.set('agent_id', String(params.agent_id));
          const res = await fetch(`${API_BASE}/api/gap/performance?${qp.toString()}`);
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Failed'}`;
          return safePretty(data);
        }
        case 'implementation_pipeline_status': {
          const jobId = encodeURIComponent(String(params.job_id || ''));
          const res = await fetch(`${API_BASE}/api/god-factory/implementation-pipeline/${jobId}`);
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Not found'}`;
          return safePretty(data);
        }
        case 'spawn_authority_check': {
          const res = await fetch(`${API_BASE}/api/spawn/request`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requesting_agent_id: params.requesting_agent_id,
              requesting_agent_type: params.requesting_agent_type,
              requested_sub_agent: params.requested_sub_agent,
            }),
          });
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Failed'}`;
          if (data?.status === 'pending_confirmation' && data?.confirmationId) {
            return safePretty({
              ...data,
              guidance: 'Tier 3+ spawn is pending confirmation. Approve via /api/spawn/confirmation/:id/approve, then execute via /api/spawn/execute with confirmation_id.',
            });
          }
          return safePretty(data);
        }
        case 'silicon_factory_status': {
          const res = await fetch(`${API_BASE}/api/silicon-factory/dashboard`);
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Failed'}`;
          return safePretty(data);
        }
        case 'silicon_factory_enqueue_task': {
          const res = await fetch(`${API_BASE}/api/silicon-factory/tasks`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              instruction: params.instruction,
              agent_type: params.agent_type,
              next_step_hint: params.next_step_hint,
            }),
          });
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Failed'}${data.ambiguity?.clarification_request ? `\n${data.ambiguity.clarification_request}` : ''}`;
          return safePretty(data);
        }
        case 'silicon_factory_resume': {
          const res = await fetch(`${API_BASE}/api/silicon-factory/cold-boot-resume`, {
            method: 'POST',
          });
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Failed'}`;
          return safePretty(data);
        }
        case 'silicon_factory_lock_acquire': {
          const res = await fetch(`${API_BASE}/api/silicon-factory/locks/acquire`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lock_key: params.lock_key,
              owner_agent: params.owner_agent,
              ttl_seconds: params.ttl_seconds,
            }),
          });
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Failed'}`;
          return safePretty(data);
        }
        case 'silicon_factory_lock_release': {
          const res = await fetch(`${API_BASE}/api/silicon-factory/locks/release`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lock_key: params.lock_key,
              owner_agent: params.owner_agent,
            }),
          });
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Failed'}`;
          return safePretty(data);
        }
        case 'silicon_factory_snapshot': {
          const res = await fetch(`${API_BASE}/api/silicon-factory/snapshots`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: params.reason }),
          });
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Failed'}`;
          return safePretty(data);
        }
        case 'silicon_factory_iap_send': {
          const res = await fetch(`${API_BASE}/api/silicon-factory/iap/messages`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from_agent: params.from_agent,
              to_agent: params.to_agent,
              message_type: params.message_type,
              payload: params.payload || {},
            }),
          });
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Failed'}`;
          return safePretty(data);
        }
        case 'silicon_factory_spec_validate': {
          const res = await fetch(`${API_BASE}/api/silicon-factory/validate-requirements`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: params.code,
              task_id: params.task_id,
              fail_task_on_violation: params.fail_task_on_violation,
            }),
          });
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Failed'}`;
          return safePretty(data);
        }
        case 'silicon_project_context': {
          const mode = String(params.mode || 'get').toLowerCase();
          if (mode === 'set') {
            const res = await fetch(`${API_BASE}/api/silicon-factory/project-context`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                project_id: params.project_id,
                project_root: params.project_root,
              }),
            });
            const data = await res.json();
            if (!res.ok) return `Error: ${data.error || 'Failed'}`;
            return safePretty(data);
          }
          const qp = new URLSearchParams();
          if (params.project_id) qp.set('project_id', String(params.project_id));
          if (params.project_root) qp.set('project_root', String(params.project_root));
          const res = await fetch(`${API_BASE}/api/silicon-factory/project-context?${qp.toString()}`);
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Failed'}`;
          return safePretty(data);
        }
        case 'silicon_symbol_read': {
          const qp = new URLSearchParams();
          qp.set('symbol_name', String(params.symbol_name || ''));
          if (params.read_type) qp.set('read_type', String(params.read_type));
          if (params.file_path) qp.set('file_path', String(params.file_path));
          if (params.project_id) qp.set('project_id', String(params.project_id));
          if (params.project_root) qp.set('project_root', String(params.project_root));
          const res = await fetch(`${API_BASE}/api/silicon-factory/symbol-read?${qp.toString()}`);
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Failed'}`;
          return safePretty(data);
        }
        case 'silicon_graph_query': {
          const qp = new URLSearchParams();
          qp.set('mode', String(params.mode || ''));
          if (params.symbol) qp.set('symbol', String(params.symbol));
          if (params.file_path) qp.set('file_path', String(params.file_path));
          if (params.project_id) qp.set('project_id', String(params.project_id));
          if (params.limit) qp.set('limit', String(params.limit));
          const res = await fetch(`${API_BASE}/api/silicon-factory/graph-query?${qp.toString()}`);
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Failed'}`;
          return safePretty(data);
        }
        case 'silicon_semantic_find': {
          const qp = new URLSearchParams();
          qp.set('query', String(params.query || ''));
          if (params.project_id) qp.set('project_id', String(params.project_id));
          if (params.limit) qp.set('limit', String(params.limit));
          const res = await fetch(`${API_BASE}/api/silicon-factory/semantic-find?${qp.toString()}`);
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Failed'}`;
          return safePretty(data);
        }
        case 'silicon_task_context': {
          const res = await fetch(`${API_BASE}/api/silicon-factory/task-context`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              task_id: params.task_id,
              project_id: params.project_id,
              budget_tokens: params.budget_tokens,
              diagnostics_raw: params.diagnostics_raw,
            }),
          });
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Failed'}`;
          return safePretty(data);
        }
        case 'silicon_context_delta': {
          const res = await fetch(`${API_BASE}/api/silicon-factory/context-delta`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              previous_sections: params.previous_sections || {},
              current_sections: params.current_sections || {},
            }),
          });
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Failed'}`;
          return safePretty(data);
        }
        case 'silicon_compress_diagnostics': {
          const res = await fetch(`${API_BASE}/api/silicon-factory/compress-diagnostics`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              raw: params.raw,
              max_items: params.max_items,
            }),
          });
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Failed'}`;
          return safePretty(data);
        }
        case 'silicon_compress_test_output': {
          const res = await fetch(`${API_BASE}/api/silicon-factory/compress-test-output`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              raw: params.raw,
              max_failures: params.max_failures,
            }),
          });
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Failed'}`;
          return safePretty(data);
        }
        case 'silicon_test_discovery': {
          const sp = new URLSearchParams();
          if (params.symbol) sp.set('symbol', String(params.symbol));
          if (params.file_path) sp.set('file_path', String(params.file_path));
          if (params.project_id) sp.set('project_id', String(params.project_id));
          if (params.limit) sp.set('limit', String(params.limit));
          const res = await fetch(`${API_BASE}/api/silicon-factory/test-discovery?${sp}`);
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Failed'}`;
          return safePretty(data);
        }
        case 'silicon_reindex_tests': {
          const res = await fetch(`${API_BASE}/api/silicon-factory/reindex-tests`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              project_id: params.project_id,
              project_root: params.project_root,
            }),
          });
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Failed'}`;
          return safePretty(data);
        }
        case 'silicon_reindex_embeddings': {
          const res = await fetch(`${API_BASE}/api/silicon-factory/reindex-embeddings`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id: params.project_id }),
          });
          const data = await res.json();
          if (!res.ok) return `Error: ${data.error || 'Failed'}`;
          return safePretty(data);
        }
        default:
          return `Unknown tool: ${tool}. Available: list_files, read_file, search_code, get_docs, get_notification_queue, get_idle_suggestions, find_suggested_jobs, get_job_detail, create_brainstorm_job, read_sandbox_status, read_forensic_entries, read_blame_records, inspect_devtag, live_debt_check, live_coverage_check, live_pattern_query, patch_file, write_file, run_command, resolve_devtag, tag_vocabulary_diff, orphan_scan, conflict_scan, gap_scan, regression_index, debt_heatmap, pattern_trend, agent_conformance_report, implementation_pipeline_status, spawn_authority_check, silicon_factory_status, silicon_factory_enqueue_task, silicon_factory_resume, silicon_factory_lock_acquire, silicon_factory_lock_release, silicon_factory_snapshot, silicon_factory_iap_send, silicon_factory_spec_validate, silicon_project_context, silicon_symbol_read, silicon_graph_query, silicon_semantic_find, silicon_task_context, silicon_context_delta, silicon_compress_diagnostics, silicon_compress_test_output, silicon_test_discovery, silicon_reindex_tests, silicon_reindex_embeddings`;
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
    const modelCandidates = allModels.some(model => model.id === localModel)
      ? [localModel]
      : (allModels[0]?.id ? [allModels[0].id] : [localModel]);

    let requestModel = modelCandidates[0];
    let fallbackModels: string[] | undefined;

    try {
      const strategyRes = await fetch(`${API_BASE}/api/model-strategy`);
      const strategy = strategyRes.ok ? await strategyRes.json().catch(() => null) : null;
      if (strategy?.settings) {
        if (!requestModel && strategy.settings.primaryModel) {
          requestModel = strategy.settings.primaryModel;
        }
        fallbackModels = [
          ...(strategy.settings.fallbackModels || []),
          strategy.settings.primaryModel,
        ].filter((modelId: string, index: number, arr: string[]) => !!modelId && modelId !== requestModel && arr.indexOf(modelId) === index);
      }
    } catch {
      fallbackModels = undefined;
    }

    const msgId = `a-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    setMessages(prev => [...prev, {
      id: msgId, role: 'assistant', content: '', timestamp: new Date().toISOString(),
      model: requestModel, status: 'streaming',
    }]);
    const res = await fetch(`${API_BASE}/api/chat/send`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: abortCtrl.signal,
      body: JSON.stringify({
        message: prompt,
        model: requestModel,
        fallbackModels,
        mode: 'agent',
        projectId: activeProject?.id || 'default',
        conversationId: conversationId || undefined,
        contextFiles: selectedFiles.length > 0 ? selectedFiles : undefined,
        systemPrompt: systemContext,
        autoInjectMemory: true,
      }),
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
          if (ev.type === 'message_start' && ev.conversationId) {
            setConversationId(ev.conversationId);
          } else if (ev.type === 'content_delta' && ev.delta) {
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
  }, [localModel, allModels, conversationId, selectedFiles]);

  const takeBackup = async (): Promise<string | null> => {
    if (!autoBackup || !ideRootPath) return null;
    try {
      const res = await fetch(`${API_BASE}/api/files/backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectRoot: ideRootPath }),
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
    let finalAssistantContent = '';

    const buildSystemCtx = (toolHistory: Array<{ role: string; content: string }>) => {
      // CONSTITUTION header — always injected so the model knows its operational boundaries
      const CONSTITUTION_HEADER = [
        `## SYSTEM CONSTITUTION (immutable — read-only for all agents)`,
        `You are operating under a constitutional constraint layer. The following invariants MUST NOT be violated:`,
        `1. Never modify these files: apps/server/src/routes/godFactory.ts, apps/web/src/components/TheGodFactory.tsx, CONSTITUTION.md, apps/server/src/services/spawnAuthority/index.ts`,
        `2. Never drop, truncate, or delete rows from any forensic table. Rollbacks set rolled_back=true only.`,
        `3. Never spawn Tier 4+ agents without surfacing a human confirmation in the notification queue.`,
        `4. Never disable the training observation hook in enhancedLoop.ts or chat.ts.`,
        `5. Never remove the regression floor from computeCompositeQuality in blame.ts.`,
        `6. Never weaken buildtag structural validation in tagRegistry/index.ts.`,
        `Any patch_file call targeting the files in rule 1 must be rejected and logged.`,
      ].join('\n');
      const lines = [
        CONSTITUTION_HEADER,
        `You are THE GOD FACTORY — a Principal Software Architect AI integrated into Personal IDE.`,
        `Your job is to improve Personal IDE itself — its built-in features, UX, architecture, models, onboarding, docs, and developer tooling.`,
        `Do NOT behave like a generic external project builder unless the user explicitly asks you to inspect an imported project. Your default scope is the Personal IDE application codebase and help/documentation system.`,
        `You have full access to the Personal IDE codebase, terminal, filesystem, and documentation.`,
        `Primary scope: Personal IDE internal codebase (self-improvement mode).`,
        `External telemetry project (read-only signals): ${activeProject?.name || 'none selected'}`,
        selectedFiles.length > 0 ? `Context files: ${selectedFiles.join(', ')}` : '',
        `Model: ${localModel}  Date: ${new Date().toISOString().slice(0, 10)}`,
        `When the user asks about how the app works, use the help/docs and source code to answer with specific details from Personal IDE.`,
        `Treat loaded feedback specs as hard product constraints when they apply.`,
        `When the user requests a feature or implementation, check Suggested Jobs first. If a matching job exists, inspect its sandbox status before proposing implementation.`,
        `If no matching Suggested Job exists for a requested enhancement, create one through the God Factory brainstorm/job path instead of inventing a fake record.`,
        `When the user asks about regressions, codebase health, model behavior, patterns, coverage, or forensic state, use the live God Factory tools and cite concrete results.`,
        `Brainstorm responses must be grounded in real IDE state such as devtags, files, debt scores, pattern data, or blame/model registry results.`,
        `Be direct and actionable. Show complete changes. Explain what changed and why.`,
        codebaseTree ? `\n${codebaseTree}` : '',
        feedbackContext ? `\n${feedbackContext}` : '',
        toolsEnabled ? `\n${TOOL_DEFINITIONS_PROMPT}` : '',
      ].filter(Boolean).join('\n');
      if (toolHistory.length === 0) return lines;
      const histStr = toolHistory.map(m => `[${m.role.toUpperCase()}]: ${m.content.slice(0, 2000)}`).join('\n\n');
      return `${lines}\n\n## Current Tool Loop History\n${histStr}`;
    };

    const requiresCodebaseGrounding = /\b(codebase|entire app|entire ide|everything you know|analyze the entire|scan.*codebase|tell me about.*codebase)\b/i.test(trimmed);
    const firstTurnPrompt = (toolsEnabled && requiresCodebaseGrounding)
      ? `${trimmed}\n\nGrounding requirement: Before your final answer, call at least one codebase tool (for example: list_files, read_file, search_code, get_docs) and cite what you found from those results.`
      : trimmed;

    try {
      const { content: firstContent } = await streamTurn(firstTurnPrompt, buildSystemCtx([]), abort);
      finalAssistantContent = firstContent;

      if (!toolsEnabled || abort.signal.aborted) { setIsStreaming(false); abortRef.current = null; return; }

      const toolHistory: Array<{ role: string; content: string }> = [];
      let currentContent = firstContent;
      let iteration = 0;

      while (iteration < MAX_TOOL_ITERATIONS && !abort.signal.aborted) {
        const toolCall = extractToolCall(currentContent);

        if (!toolCall) {
          // No tool call found. In autonomous mode, keep driving the agent unless it signals done.
          if (autonomousModeRef.current && toolsEnabled && iteration > 0) {
            const donePhrases = /autonomous loop complete|no more tasks|all tasks complete|nothing more to do|task complete|i'm done|i am done/i;
            if (donePhrases.test(currentContent)) break;
            // Inject continuation nudge so the agent keeps working
            toolHistory.push({ role: 'assistant', content: currentContent });
            const contPrompt = `Continue autonomously. Identify the next highest-priority task from the Intel Panel, codebase health signals, or prior analysis. Execute it immediately with a tool call. When all work is done, reply with "AUTONOMOUS LOOP COMPLETE".`;
            const { content: nextContent } = await streamTurn(contPrompt, buildSystemCtx(toolHistory), abort);
            currentContent = nextContent;
            finalAssistantContent = nextContent;
            iteration++;
            setToolIterationCount(iteration);
            continue;
          }
          break;
        }

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
        finalAssistantContent = nextContent;
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
      void appendGodFactorySession({
        user_input: trimmed,
        ...(finalAssistantContent ? { agent_response: finalAssistantContent } : {}),
      });
      setIsStreaming(false);
      setToolIterationCount(0);
      abortRef.current = null;
    }
  };

  const stopStreaming  = () => abortRef.current?.abort();
  const clearConv      = () => {
    setMessages([]);
    setConversationId(null);
    setGodFactorySessionId(null);
    godFactorySessionIdRef.current = null;
    sessionIntroShownRef.current = null;
    setSessionEpoch(prev => prev + 1);
    try { localStorage.removeItem(CONV_KEY); } catch {}
    try { localStorage.removeItem(SESSION_KEY); } catch {}
  };
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
              title="YouTube — THE GOD FACTORY"
            >
              THE GOD FACTORY
            </a>
            <span className="text-xs text-ide-text-dim px-2 py-0.5 bg-purple-500/10 text-purple-400 rounded-full">
              Self-Improvement Agent
            </span>
            <span className="text-xs text-ide-text-dim">Primary scope: Personal IDE codebase</span>
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
            Applies to: <span className="text-ide-accent">THE GOD FACTORY only</span>
            <span className="ml-2 text-ide-text-dim/50">· Chat uses its own model selector (top bar)</span>
          </div>
        </div>

        {/* File context selector dropdown */}
        {showFileSelector && (
          <FileContextSelector
            projectRoot={ideRootPath}
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
              {autonomousMode && (
                <span className="text-purple-300 font-semibold animate-pulse">∞ Autonomous ON</span>
              )}
              {codebaseReady
                ? <span className="ml-auto text-green-400/70">✓ Codebase loaded</span>
                : <span className="ml-auto text-yellow-400/70 animate-pulse">⏳ Loading codebase…</span>}
            </div>
          )}
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
              }}
              onKeyDown={handleKey}
              placeholder={toolsEnabled
                ? "Tell THE GOD FACTORY what to build, fix, or enhance… it will use tools autonomously (Enter sends)"
                : "Tell THE GOD FACTORY what to build, fix, or enhance… (Enter sends, Shift+Enter = newline)"}
              className="flex-1 bg-ide-bg border border-ide-border rounded-lg px-3 py-2.5 text-sm text-ide-text placeholder-ide-text-dim resize-none focus:outline-none focus:border-purple-500/50 transition-colors overflow-y-auto"
              style={{ minHeight: '60px', maxHeight: '200px', height: '60px' }}
              rows={2}
            />
            <div className="flex flex-col gap-1.5">
              {/* Autonomous mode toggle */}
              <button
                onClick={() => setAutonomousMode(prev => !prev)}
                title={autonomousMode ? 'Autonomous mode ON — agent will keep running until done. Click to disable.' : 'Autonomous mode OFF — agent stops after each response. Click to enable.'}
                className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors text-xs font-bold border ${
                  autonomousMode
                    ? 'bg-purple-600/80 border-purple-400 text-white'
                    : 'bg-ide-bg border-ide-border text-ide-text-dim hover:border-purple-500/50'
                }`}
              >
                ∞
              </button>
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
        projectRoot={activeProject?.rootPath}
        projectId={activeProject?.id}
        projectName={activeProject?.name}
        onSendToBrainstorm={(text) => { setInput(text); inputRef.current?.focus(); }}
      />
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
              {/* Truncation warning — shown prominently when file shrinks significantly */}
              {details.truncationWarning && (
                <div className="flex items-start gap-2 p-3 bg-red-500/15 border border-red-500/40 rounded-lg text-[11px] text-red-300">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
                  <div>
                    <p className="font-semibold text-red-400 mb-1">⚠ Truncation Risk Detected</p>
                    <p>{details.truncationWarning}</p>
                    <p className="mt-1 text-red-400/70">Approving will overwrite with the potentially incomplete content. The original will be backed up to <code>.bak</code>.</p>
                  </div>
                </div>
              )}
              {/* Line count summary */}
              {!details.isNew && details.originalLines !== undefined && details.newLines !== undefined && (
                <div className={`flex items-center gap-3 text-[11px] px-3 py-2 rounded border ${
                  details.newLines < details.originalLines * 0.8
                    ? 'bg-red-500/10 border-red-500/30 text-red-300'
                    : 'bg-ide-bg/50 border-ide-border text-ide-text-dim'
                }`}>
                  <span>Lines: <span className="font-mono">{details.originalLines}</span> → <span className="font-mono">{details.newLines}</span></span>
                  {details.newLines < details.originalLines * 0.8 && (
                    <span className="text-red-400 font-semibold">({Math.round(details.newLines / details.originalLines * 100)}% of original)</span>
                  )}
                </div>
              )}
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
        <h2 className="text-2xl font-bold text-ide-text mb-2">THE GOD FACTORY</h2>
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
          <span>{isUser ? 'You' : (msg.model?.split('/').pop() || 'THE GOD FACTORY')}</span>
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
