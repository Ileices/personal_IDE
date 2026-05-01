// ============================================
// Context Assembly — Build LLM context for each iteration
// Extracted from enhancedLoop.ts for <1000 LOC compliance
// ============================================
import type { AgentState } from '@personal-ide/shared';
import { estimateTokens } from '../../llm/providers.js';
import { buildAgentSystemPrompt } from '../../modes/agentPrompts.js';
import { listAllFiles } from '../../filesystem/index.js';
import type { MemoryService } from '../../memory/index.js';
import type { CheckpointService } from '../../checkpoint/index.js';
import type { CodebaseAnalyzer } from '../../analysis/codebase.js';
import type { CodeIndexer } from '../codeIndexer.js';
import type { HierarchicalCodeIndex } from '../indexer/hierarchicalIndex.js';
import type { ContextWindowManager } from '../../contextWindowManager/index.js';

const FILE_LIST_CACHE_TTL_MS = 20_000;
const FILE_LIST_SCAN_MAX_FILES = 400;
const FILE_LIST_SCAN_MAX_MS = 250;

const fileListCache = new Map<string, { at: number; fileList: string }>();

function getCachedFileList(projectRoot: string): string {
  const now = Date.now();
  const cached = fileListCache.get(projectRoot);
  if (cached && (now - cached.at) < FILE_LIST_CACHE_TTL_MS) {
    return cached.fileList;
  }

  let fileList = '';
  try {
    const allFiles = listAllFiles(projectRoot, {
      maxFiles: FILE_LIST_SCAN_MAX_FILES,
      maxMs: FILE_LIST_SCAN_MAX_MS,
    });

    fileList = allFiles.join('\n');
    if (allFiles.length >= FILE_LIST_SCAN_MAX_FILES) {
      fileList += '\n... file list truncated for responsiveness';
    }
  } catch {
    fileList = '';
  }

  fileListCache.set(projectRoot, { at: now, fileList });
  return fileList;
}

export interface ContextConfig {
  projectRoot: string;
  projectId: string;
  conversationId: string;
  currentTask: string;
  currentIteration: number;
  maxIterations: number;
  contextWindow: number;
  projectLanguages: string[];
  taskId?: string;
  // v2 context strings
  relationshipContext: string;
  tierContext: string;
  logHealthContext: string;
  conversationIndexContext: string;
  platformContext: string;
  // v3 context strings (new — depGraph, clustering, exploration)
  depGraphContext?: string;
  moduleClusterContext?: string;
  explorationContext?: string;
  // Error/test state
  lastErrorContext: string;
  lastTestContext: string;
  codebaseOverview: string;
}

export interface ContextServices {
  memory: MemoryService;
  checkpoint: CheckpointService;
  analyzer: CodebaseAnalyzer;
  codeIndexer: CodeIndexer;
  hierarchicalIndex?: HierarchicalCodeIndex;
  contextWindowManager?: ContextWindowManager;
}

export interface AssembledContext {
  systemPrompt: string;
  messages: any[];
  fileList: string;
}

/**
 * Build the complete message array for an LLM call.
 * Handles: system prompt, file list, conversation history, queued messages.
 */
export function assembleContext(
  config: ContextConfig,
  services: ContextServices,
): AssembledContext {
  // Build task tracker context
  let taskTrackerContext = '';
  if (config.taskId) {
    try {
      const tracker = services.analyzer.getTaskTracker(config.taskId) as any;
      if (tracker) {
        const subtasks = typeof tracker.subtasks === 'string'
          ? JSON.parse(tracker.subtasks)
          : (tracker.subtasks || []);
        const completed = subtasks.filter((s: any) => s.status === 'completed').length;
        const total = subtasks.length;
        taskTrackerContext = 'Task: ' + tracker.title + ' (' + completed + '/' + total + ' subtasks complete)\n';
        taskTrackerContext += subtasks.map((s: any) => {
          const icon = s.status === 'completed' ? '[done]' : s.status === 'in_progress' ? '[wip]' : '[ ]';
          return '  ' + icon + ' ' + s.title;
        }).join('\n');
      }
    } catch { /* ignore */ }
  }

  // Checkpoint info
  let checkpointInfo = '';
  try {
    const checkpoints = services.checkpoint.listCheckpoints(config.projectId);
    if (checkpoints.length > 0) {
      checkpointInfo = 'Last checkpoint: ' + checkpoints[0].description + ' (' + checkpoints[0].createdAt + ')';
      checkpointInfo += '\nTotal checkpoints: ' + checkpoints.length;
    }
  } catch { /* ignore */ }

  // Code index context — prefer hierarchical index, fall back to flat index
  let codeIndexContext = '';
  try {
    if (services.hierarchicalIndex && services.hierarchicalIndex.getRootId()) {
      const indexBudget = Math.floor(config.contextWindow * 0.07);
      codeIndexContext = services.hierarchicalIndex.formatAtDepth(indexBudget);
    } else {
      const indexBudget = Math.floor(config.contextWindow * 0.05);
      codeIndexContext = services.codeIndexer.formatForLLM(indexBudget);
    }
  } catch { /* ignore */ }

  // Memory context
  let memoryContext = services.memory.buildMemoryContext(config.projectId, config.currentTask);
  let relationshipContext = config.relationshipContext;
  let tierContext = config.tierContext;
  let logHealthContext = config.logHealthContext;
  let conversationIndexContext = config.conversationIndexContext;
  let platformContext = config.platformContext;
  let depGraphContext = config.depGraphContext;
  let moduleClusterContext = config.moduleClusterContext;
  let explorationContext = config.explorationContext;

  // Canonical context-window shaping (Tier 4 budget for agent_loop).
  // This ensures the dedicated manager is part of real execution, not just API exposure.
  if (services.contextWindowManager) {
    const shaped = services.contextWindowManager.fitPrioritySlots({
      system_prompt: config.codebaseOverview || '',
      task_buildtags: [taskTrackerContext, checkpointInfo].filter(Boolean).join('\n\n'),
      devtags: [relationshipContext, tierContext, logHealthContext].filter(Boolean).join('\n\n'),
      history: [conversationIndexContext, platformContext, explorationContext || ''].filter(Boolean).join('\n\n'),
      memory: memoryContext,
      code_content: [codeIndexContext, depGraphContext || '', moduleClusterContext || ''].filter(Boolean).join('\n\n'),
    }, 4, `agent_loop:${config.conversationId}`);

    taskTrackerContext = shaped.slots.task_buildtags;
    checkpointInfo = '';
    memoryContext = shaped.slots.memory;
    // Collapse secondary contexts into canonical channels after shaping.
    const shapedDevtags = shaped.slots.devtags;
    const shapedHistory = shaped.slots.history;
    const shapedCode = shaped.slots.code_content;

    relationshipContext = shapedDevtags;
    tierContext = '';
    logHealthContext = '';
    conversationIndexContext = shapedHistory;
    platformContext = '';
    explorationContext = '';
    depGraphContext = '';
    moduleClusterContext = '';
    codeIndexContext = shapedCode;
  }

  // System prompt
  const systemPrompt = buildAgentSystemPrompt({
    memoryContext,
    codebaseOverview: config.codebaseOverview,
    errorContext: config.lastErrorContext,
    testContext: config.lastTestContext,
    taskTrackerContext,
    checkpointInfo,
    iteration: config.currentIteration,
    maxIterations: config.maxIterations,
    projectLanguages: config.projectLanguages,
    relationshipContext,
    tierContext,
    logHealthContext,
    conversationIndexContext,
    platformContext,
    codeIndexContext,
    depGraphContext,
    moduleClusterContext,
    explorationContext,
  });

  // Messages array
  const messages: any[] = [
    { role: 'system', content: systemPrompt },
  ];

  // File list
  const fileList = getCachedFileList(config.projectRoot);

  if (fileList) {
    messages.push({ role: 'system', content: 'PROJECT FILES:\n' + fileList });
  }

  return { systemPrompt, messages, fileList };
}

/**
 * Build and append conversation history to messages, respecting token budget.
 * Filters out poisoned messages (apologies, refusals, schema retries).
 */
export function appendHistory(
  messages: any[],
  conversationId: string,
  contextWindow: number,
  memory: MemoryService,
): void {
  const historyBudget = Math.floor(contextWindow * 0.15);
  const history = memory.getMessages(conversationId);
  let historyTokens = 0;
  const recentHistory: any[] = [];

  for (let i = history.length - 1; i >= 0 && historyTokens < historyBudget; i--) {
    const msg = history[i];
    let content = msg.content;

    // Skip poisoned messages
    if (msg.role === 'assistant') {
      const lower = content.toLowerCase().slice(0, 300);
      if (lower.includes("i'm sorry") || lower.includes("i apologize") ||
          lower.includes("as an ai model") || lower.includes("as an ai language")) {
        continue;
      }
      if (!content.includes('--- FILE:') && !content.includes('structured_output') && !content.includes('"summary"')) {
        continue;
      }
    }
    if (msg.role === 'user' && (content.startsWith('CRITICAL:') || content.includes('LOOP DETECTED:') ||
        content.includes('previous output was missing'))) {
      continue;
    }

    // Condense long messages
    if (msg.role === 'assistant' && content.length > 800) {
      const summaryMatch = content.match(/"summary"\s*:\s*"([^"]+)"/);
      const filesMatch = content.match(/--- FILE: (.+?) ---/g);
      if (summaryMatch) {
        content = 'Previous step: ' + summaryMatch[1] +
          (filesMatch ? '\nFiles: ' + filesMatch.map((f: string) => f.replace('--- FILE: ', '').replace(' ---', '')).join(', ') : '');
      } else {
        content = content.slice(0, 600) + '...[condensed]';
      }
    }
    if (msg.role === 'user' && content.length > 500) {
      content = content.slice(0, 400) + '...[condensed]';
    }

    const msgTokens = estimateTokens(content);
    if (historyTokens + msgTokens > historyBudget) break;
    historyTokens += msgTokens;
    recentHistory.unshift({ role: msg.role, content });
  }

  messages.push(...recentHistory);
}

/**
 * Append schema reminder to user task if not already present.
 */
export function appendSchemaReminder(task: string): string {
  if (!task.includes('json:structured_output')) {
    return task + '\n\n---\nREMINDER: End your response with ```json:structured_output { ... } ``` block. Include file changes with --- FILE: path --- markers.';
  }
  return task;
}
