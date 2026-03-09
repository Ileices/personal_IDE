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
  const memoryContext = services.memory.buildMemoryContext(config.projectId, config.currentTask);

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
    relationshipContext: config.relationshipContext,
    tierContext: config.tierContext,
    logHealthContext: config.logHealthContext,
    conversationIndexContext: config.conversationIndexContext,
    platformContext: config.platformContext,
    codeIndexContext,
    depGraphContext: config.depGraphContext,
    moduleClusterContext: config.moduleClusterContext,
    explorationContext: config.explorationContext,
  });

  // Messages array
  const messages: any[] = [
    { role: 'system', content: systemPrompt },
  ];

  // File list
  let fileList = '';
  try {
    const allFiles = listAllFiles(config.projectRoot);
    fileList = allFiles.slice(0, 200).join('\n');
    if (allFiles.length > 200) {
      fileList += '\n... and ' + (allFiles.length - 200) + ' more files';
    }
  } catch { /* ignore */ }

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
