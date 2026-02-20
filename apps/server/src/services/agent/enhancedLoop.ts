// ============================================
// Enhanced Agent Loop v3
// Integrates: multi-provider, token management,
// checkpoints, error feedback, test running,
// codebase analysis, task tracking,
// PLUS: relationship index, log manager,
// tier engine, conversation indexer,
// message queue, loop detection, web search,
// code indexing, persistent logging,
// dynamic context discovery
// ============================================
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import type {
  AgentConfig, AgentState, AgentRunStatus,
  StructuredAgentOutput, ProviderType,
} from '@personal-ide/shared';
import { getModel } from '@personal-ide/shared';
import { getClientFromDb, isTokenLimitError, estimateTokens, checkTokenLimit, truncateToFit } from '../llm/providers.js';
import { ChunkingPipeline } from '../llm/chunkingPipeline.js';
import { completeChatResponse } from '../llm/streaming.js';
import { rateLimiter } from '../llm/rateLimiter.js';
import { MemoryService } from '../memory/index.js';
import { parseStructuredOutput, parseFileChanges } from '../modes/prompts.js';
import { buildAgentSystemPrompt } from '../modes/agentPrompts.js';
import { writeFile, readFile, listAllFiles } from '../filesystem/index.js';
import { detectProjectStack, runAllLintChecks, runTests, formatErrorsForLLM, formatTestsForLLM } from '../errors/detector.js';
import { CheckpointService } from '../checkpoint/index.js';
import { CodebaseAnalyzer } from '../analysis/codebase.js';
import { RelationshipIndexService } from '../analysis/relationshipIndex.js';
import { LogBloatManager } from '../analysis/logManager.js';
import { ProjectTierEngine } from '../analysis/projectTierEngine.js';
import { ConversationIndexer } from '../analysis/conversationIndexer.js';
import { LogWriter } from './logWriter.js';
import { LoopDetector } from './loopDetector.js';
import { webSearch, formatSearchForLLM } from './webSearch.js';
import { CodeIndexer } from './codeIndexer.js';
import { detectPlatform, formatPlatformForLLM, type PlatformInfo } from './platformDetector.js';

type EventCallback = (event: any) => void;

/** Queued user message to inject into the agent loop */
interface QueuedMessage {
  id: string;
  content: string;
  timestamp: string;
  priority: 'normal' | 'high';
}

interface EnhancedAgentConfig extends AgentConfig {
  provider: ProviderType;
  contextWindow: number;
  checkpointEvery: number;
  autoFixErrors: boolean;
  autoRunTests: boolean;
  analyzeCodebase: boolean;
  taskId?: string;
}

export class EnhancedAgentLoop {
  private state: AgentState = 'idle';
  private runId: string = '';
  private currentIteration = 0;
  private totalTokens = 0;
  private totalFilesChanged = 0;
  private pendingQuestions: string[] = [];
  private abortController: AbortController | null = null;
  private listeners: EventCallback[] = [];
  private memory: MemoryService;
  private checkpoint: CheckpointService;
  private analyzer: CodebaseAnalyzer;
  private conversationId: string = '';
  private contextWindow: number;
  private projectLanguages: string[] = [];
  private consecutiveErrors = 0;
  private maxConsecutiveErrors = 3;
  private lastErrorContext = '';
  private lastTestContext = '';
  private chunkingPipeline: ChunkingPipeline | null = null;
  private chunkingActive = false;
  private errorBackoff = 5000;
  // v2 services
  private relationshipIndex: RelationshipIndexService;
  private logManager: LogBloatManager;
  private tierEngine: ProjectTierEngine;
  private conversationIndexer: ConversationIndexer;
  private relationshipContext = '';
  private tierContext = '';
  private logHealthContext = '';
  private conversationIndexContext = '';
  // v3 services
  private logWriter: LogWriter | null = null;
  private loopDetector: LoopDetector;
  private codeIndexer: CodeIndexer;
  private messageQueue: QueuedMessage[] = [];
  private discoveredContextLimits: Map<string, number> = new Map();
  private platformContext = '';
  private platformInfo: PlatformInfo | null = null;

  constructor(
    private db: Database.Database,
    private config: EnhancedAgentConfig
  ) {
    this.memory = new MemoryService(db);
    this.checkpoint = new CheckpointService(db);
    this.analyzer = new CodebaseAnalyzer(db);
    // Use model's actual token limit, respect user overrides within model bounds
    const modelDef = getModel(config.model);
    const modelMax = modelDef?.maxInputTokens || 8000;
    this.contextWindow = config.contextWindow && config.contextWindow > 0 && config.contextWindow <= modelMax
      ? config.contextWindow
      : modelMax;
    this.relationshipIndex = new RelationshipIndexService(db);
    this.logManager = new LogBloatManager(db);
    this.tierEngine = new ProjectTierEngine(db);
    this.conversationIndexer = new ConversationIndexer(db);
    // v3 services
    this.loopDetector = new LoopDetector();
    this.codeIndexer = new CodeIndexer();

    if (config.enableSmartChunking) {
      this.chunkingPipeline = new ChunkingPipeline({
        modelContextWindow: this.contextWindow,
        model: config.model,
        onProgress: (event) => {
          this.chunkingActive = event.type !== 'pipeline_complete' && event.type !== 'pipeline_error';
          this.emit({
            type: event.type === 'chunk_start' ? 'chunking_start' :
                  event.type === 'chunk_complete' ? 'chunking_progress' :
                  event.type === 'pipeline_complete' ? 'chunking_complete' :
                  event.type === 'pipeline_error' ? 'chunking_error' : 'info',
            chunkIndex: event.chunkIndex,
            totalChunks: event.totalChunks,
            tokensUsed: event.tokensUsed,
            message: event.message,
          });
        },
      });
    }
  }

  onEvent(callback: EventCallback): () => void {
    this.listeners.push(callback);
    return () => { this.listeners = this.listeners.filter(l => l !== callback); };
  }

  private emit(event: any): void {
    // Log every event to persistent file
    if (this.logWriter) {
      this.logWriter.logEvent(event);
    }
    for (const listener of this.listeners) {
      try { listener(event); } catch { /* ignore */ }
    }
  }

  private setState(newState: AgentState): void {
    this.state = newState;
    this.emit({ type: 'state_change', state: newState });
  }

  /** Queue a user message to be picked up by the agent loop */
  queueMessage(content: string, priority: 'normal' | 'high' = 'normal'): string {
    const msg: QueuedMessage = {
      id: uuid(),
      content,
      timestamp: new Date().toISOString(),
      priority,
    };
    this.messageQueue.push(msg);
    this.emit({
      type: 'message_queued',
      messageId: msg.id,
      content: content.slice(0, 200),
      queueSize: this.messageQueue.length,
    });
    return msg.id;
  }

  /** Get queued messages count */
  getQueueSize(): number {
    return this.messageQueue.length;
  }

  /** Drain the message queue — returns all queued messages and clears the queue */
  private drainMessageQueue(): QueuedMessage[] {
    if (this.messageQueue.length === 0) return [];
    // Sort high priority first
    const messages = [...this.messageQueue].sort((a, b) =>
      a.priority === 'high' && b.priority !== 'high' ? -1 :
      b.priority === 'high' && a.priority !== 'high' ? 1 : 0
    );
    this.messageQueue = [];
    return messages;
  }

  getStatus(): AgentRunStatus {
    return {
      runId: this.runId,
      projectId: this.config.projectRoot,
      state: this.state,
      currentIteration: this.currentIteration,
      maxIterations: this.config.continuousMode ? Infinity : this.config.maxIterations,
      totalFilesChanged: this.totalFilesChanged,
      totalTokensUsed: this.totalTokens,
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      pendingQuestions: this.pendingQuestions,
      continuousMode: this.config.continuousMode,
      bypassRateLimits: this.config.bypassRateLimits,
      chunkingStatus: { active: this.chunkingActive },
      queuedMessages: this.messageQueue.length,
      contextWindow: this.contextWindow,
      logPath: this.logWriter?.getLogDir(),
    } as any;
  }

  async start(projectId: string, initialTask: string): Promise<void> {
    if (this.state !== 'idle' && this.state !== 'complete' && this.state !== 'error') {
      throw new Error('Cannot start: agent is ' + this.state);
    }

    this.runId = uuid();
    this.currentIteration = 0;
    this.totalTokens = 0;
    this.totalFilesChanged = 0;
    this.pendingQuestions = [];
    this.consecutiveErrors = 0;
    this.abortController = new AbortController();
    this.loopDetector.reset();
    this.messageQueue = [];

    // Initialize persistent logger
    try {
      this.logWriter = new LogWriter(this.config.projectRoot);
      this.logWriter.logSummary('=== Agent Run Started ===');
      this.logWriter.logSummary('Task: ' + initialTask);
      this.logWriter.logSummary('Model: ' + this.config.model);
      this.logWriter.logSummary('Context Window: ' + this.contextWindow);
      this.emit({ type: 'info', message: 'Logs: ' + this.logWriter.getLogDir() });
    } catch (err: any) {
      this.emit({ type: 'info', message: 'Log writer init failed: ' + err.message });
    }

    this.conversationId = this.memory.createConversation(
      projectId, 'Agent: ' + initialTask.slice(0, 50), 'agent', this.config.model
    );

    this.db.prepare(
      "INSERT INTO agent_runs (id, project_id, conversation_id, task, started_at) VALUES (?, ?, ?, ?, datetime('now'))"
    ).run(this.runId, projectId, this.conversationId, initialTask);

    // ── Phase 0: Environment Analysis ──
    this.setState('planning');

    // Detect host platform for cross-platform build instructions
    try {
      this.platformInfo = detectPlatform();
      this.platformContext = formatPlatformForLLM(this.platformInfo);
      this.emit({ type: 'info', message: 'Host: ' + this.platformInfo.hostOS + ' ' + this.platformInfo.arch + ' | Runtimes: ' + Object.keys(this.platformInfo.runtimes).join(', ') });
    } catch (err: any) {
      this.emit({ type: 'info', message: 'Platform detection: ' + err.message });
    }

    try {
      const stack = detectProjectStack(this.config.projectRoot);
      this.projectLanguages = [...new Set(stack.languages)];
      this.emit({ type: 'info', message: 'Detected languages: ' + this.projectLanguages.join(', ') });
      this.emit({ type: 'info', message: 'Lint commands: ' + stack.lintCommands.length + ', Test commands: ' + stack.testCommands.length });
    } catch {
      this.emit({ type: 'info', message: 'Could not detect project stack' });
    }

    let codebaseOverview = '';
    if (this.config.analyzeCodebase) {
      try {
        this.emit({ type: 'info', message: 'Building codebase overview...' });
        const overview = this.analyzer.buildOverview(projectId, this.config.projectRoot);
        const overviewBudget = Math.floor(this.contextWindow * 0.15);
        codebaseOverview = this.analyzer.formatOverviewForLLM(overview, overviewBudget);
        this.emit({ type: 'info', message: 'Codebase: ' + overview.totalFiles + ' files, ' + overview.totalLines + ' lines' });
      } catch (err: any) {
        this.emit({ type: 'info', message: 'Codebase analysis failed: ' + err.message });
      }
    }

    // Build code index for surgical editing
    try {
      this.emit({ type: 'info', message: 'Building code index for surgical editing...' });
      const codeIndex = this.codeIndexer.buildIndex(this.config.projectRoot);
      this.emit({ type: 'info', message: 'Code index: ' + codeIndex.totalFiles + ' files indexed' });
    } catch (err: any) {
      this.emit({ type: 'info', message: 'Code indexer: ' + err.message });
    }

    try {
      this.checkpoint.initGit(this.config.projectRoot);
      this.checkpoint.createCheckpoint(this.config.projectRoot, projectId, this.runId, 0, 'Agent start: ' + initialTask.slice(0, 100));
      this.emit({ type: 'info', message: 'Initial checkpoint created' });
    } catch (err: any) {
      this.emit({ type: 'info', message: 'Checkpoint init: ' + err.message });
    }

    // ── Phase -1: Knowledge Graph & Tier Detection ──
    try {
      this.emit({ type: 'info', message: 'Building code relationship index...' });
      const files = listAllFiles(this.config.projectRoot);
      const scanResult = this.relationshipIndex.scanProject(projectId, this.config.projectRoot, files);
      this.relationshipContext = this.relationshipIndex.formatForLLM(projectId, Math.floor(this.contextWindow * 0.08));
      this.emit({ type: 'info', message: 'Knowledge graph: ' + scanResult.symbolCount + ' symbols, ' + scanResult.relationshipCount + ' relationships, ' + scanResult.conflictCount + ' conflicts' });
    } catch (err: any) {
      this.emit({ type: 'info', message: 'Relationship index: ' + err.message });
    }

    try {
      const tierConfig = this.tierEngine.detectTier(projectId, this.config.projectRoot);
      this.tierContext = this.tierEngine.formatForLLM(projectId);
      const gates = tierConfig.qualityGates ? Object.keys(tierConfig.qualityGates).filter(k => tierConfig.qualityGates[k]).join(', ') : 'none';
      this.emit({ type: 'info', message: 'Project tier: ' + tierConfig.tier + ' | Language: ' + tierConfig.primaryLanguage + ' | Quality gates: ' + gates });
    } catch (err: any) {
      this.emit({ type: 'info', message: 'Tier detection: ' + err.message });
    }

    try {
      if (this.logManager.needsCompaction()) {
        this.emit({ type: 'info', message: 'Running log compaction...' });
        const result = await this.logManager.runCompaction();
        this.emit({ type: 'info', message: 'Compaction: ' + result.rowsDeleted + ' rows deleted across ' + result.tablesProcessed + ' tables' });
      }
      this.logHealthContext = this.logManager.formatForLLM();
    } catch (err: any) {
      this.emit({ type: 'info', message: 'Log manager: ' + err.message });
    }

    // ── Main Loop ──
    let currentTask = initialTask;
    const effectiveMaxIterations = this.config.continuousMode ? Infinity : this.config.maxIterations;
    const effectiveCooldown = this.config.cooldownMs || 0;

    if (this.config.continuousMode) {
      this.emit({ type: 'continuous_mode', enabled: true, cooldownMs: effectiveCooldown } as any);
      this.emit({ type: 'info', message: '24/7 Continuous Mode ACTIVE' });
    }
    if (this.config.bypassRateLimits) {
      this.emit({ type: 'rate_limit_bypass', enabled: true } as any);
      this.emit({ type: 'info', message: 'Rate limit bypass ENABLED' });
    }
    if (this.config.enableSmartChunking) {
      this.emit({ type: 'info', message: 'Smart chunking pipeline ENABLED' });
    }

    while (
      this.currentIteration < effectiveMaxIterations &&
      this.state !== 'complete' &&
      this.state !== 'error' &&
      !this.abortController.signal.aborted
    ) {
      try {
        this.currentIteration++;

        // Get LLM Client
        const client = getClientFromDb(this.db, this.config.provider);
        if (!client) {
          this.setState('error');
          this.emit({ type: 'error', error: 'No credentials for ' + this.config.provider + '. Please configure the provider.' });
          break;
        }

        // Rate Limit Check (skip if bypassed)
        if (!this.config.bypassRateLimits) {
          const canProceed = rateLimiter.canRequest(this.config.model, 'agent');
          if (!canProceed.allowed) {
            if (canProceed.fallbackModel) {
              this.emit({ type: 'auto_answer', question: 'Rate limited on ' + this.config.model, answer: 'Switching to ' + canProceed.fallbackModel });
              this.config.model = canProceed.fallbackModel;
            } else if (this.config.continuousMode) {
              const waitMs = canProceed.retryAfterMs || 60000;
              this.emit({ type: 'cooldown', ms: waitMs, reason: 'Rate limited: ' + canProceed.reason + '. Waiting...' } as any);
              await this.delay(waitMs);
              continue;
            } else {
              this.emit({ type: 'paused', reason: 'Rate limited: ' + canProceed.reason });
              await this.delay(canProceed.retryAfterMs || 60000);
              continue;
            }
          }
        }

        // Build Context
        const memoryContext = this.memory.buildMemoryContext(projectId, currentTask);

        let taskTrackerContext = '';
        if (this.config.taskId) {
          try {
            const tracker = this.analyzer.getTaskTracker(this.config.taskId) as any;
            if (tracker) {
              const subtasks = typeof tracker.subtasks === 'string' ? JSON.parse(tracker.subtasks) : (tracker.subtasks || []);
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

        let checkpointInfo = '';
        try {
          const checkpoints = this.checkpoint.listCheckpoints(projectId);
          if (checkpoints.length > 0) {
            checkpointInfo = 'Last checkpoint: ' + checkpoints[0].description + ' (' + checkpoints[0].createdAt + ')';
            checkpointInfo += '\nTotal checkpoints: ' + checkpoints.length;
          }
        } catch { /* ignore */ }

        // Build System Prompt with v2 context
        const systemPrompt = buildAgentSystemPrompt({
          memoryContext,
          codebaseOverview,
          errorContext: this.lastErrorContext,
          testContext: this.lastTestContext,
          taskTrackerContext,
          checkpointInfo,
          iteration: this.currentIteration,
          maxIterations: this.config.maxIterations,
          projectLanguages: this.projectLanguages,
          relationshipContext: this.relationshipContext,
          tierContext: this.tierContext,
          logHealthContext: this.logHealthContext,
          conversationIndexContext: this.conversationIndexContext,
          platformContext: this.platformContext,
        });

        // Build Messages
        const messages: any[] = [
          { role: 'system', content: systemPrompt },
        ];

        let fileList = '';
        try {
          const allFiles = listAllFiles(this.config.projectRoot);
          fileList = allFiles.slice(0, 200).join('\n');
          if (allFiles.length > 200) {
            fileList += '\n... and ' + (allFiles.length - 200) + ' more files';
          }
        } catch { /* ignore */ }

        if (fileList) {
          messages.push({ role: 'system', content: 'PROJECT FILES:\n' + fileList });
        }

        // Conversation history (limited by token budget)
        const historyBudget = Math.floor(this.contextWindow * 0.2);
        const history = this.memory.getMessages(this.conversationId);
        let historyTokens = 0;
        const recentHistory: any[] = [];
        for (let i = history.length - 1; i >= 0 && historyTokens < historyBudget; i--) {
          const msgTokens = estimateTokens(history[i].content);
          if (historyTokens + msgTokens > historyBudget) break;
          historyTokens += msgTokens;
          recentHistory.unshift({ role: history[i].role, content: history[i].content });
        }
        messages.push(...recentHistory);

        // ── Drain queued user messages ──
        const queuedMsgs = this.drainMessageQueue();
        if (queuedMsgs.length > 0) {
          this.emit({ type: 'info', message: 'Processing ' + queuedMsgs.length + ' queued user message(s)' });
          let queueContext = '\n\n--- USER MESSAGES (queued while you were working) ---\n';
          for (const qm of queuedMsgs) {
            queueContext += `[${qm.priority.toUpperCase()}] ${qm.content}\n\n`;
            // Store in memory
            this.memory.addMessage(this.conversationId, 'user', '[Queued] ' + qm.content, this.config.model, 'agent');
          }
          queueContext += '--- END QUEUED MESSAGES ---\n';
          queueContext += 'Incorporate these user requests into your current work plan. High priority messages should be addressed first.\n';
          currentTask = currentTask + queueContext;
        }

        // ── Loop Detection ──
        const loopCheck = this.loopDetector.isStuck();
        if (loopCheck.stuck) {
          this.emit({ type: 'loop_detected', pattern: loopCheck.pattern, count: loopCheck.count });
          this.emit({ type: 'info', message: '🔄 LOOP DETECTED: ' + loopCheck.pattern });
          currentTask = this.loopDetector.generateBreakoutPrompt(
            this.config.projectRoot,
            currentTask,
            loopCheck.pattern || 'Repeated pattern',
            codebaseOverview
          );

          // Try web search to find new approaches when stuck
          try {
            const errorQuery = this.lastErrorContext
              ? this.lastErrorContext.slice(0, 100)
              : currentTask.slice(0, 80);
            const searchResult = await webSearch(errorQuery + ' solution fix', 3);
            if (searchResult.results.length > 0) {
              const searchContext = formatSearchForLLM(searchResult);
              currentTask += '\n\n' + searchContext;
              this.emit({ type: 'info', message: 'Web search: Found ' + searchResult.results.length + ' results for context' });
            }
          } catch { /* web search is non-critical */ }
        }

        messages.push({ role: 'user', content: currentTask });

        let response: any = null;

        // Execute step
        this.setState('executing');
        this.emit({
          type: 'step_start',
          step: { stepNumber: this.currentIteration, action: currentTask.slice(0, 200), target: '', detail: '', priority: 'high' as const },
          iteration: this.currentIteration,
        });

        // Token Limit Check — use real model limit, proactively chunk if too big
        const totalContent = messages.map(m => m.content).join('\n');
        const tokenCheck = checkTokenLimit(totalContent, this.contextWindow, this.config.maxTokensPerStep);

        if (!tokenCheck.withinLimit) {
          this.emit({ type: 'info', message: 'Context too large (' + tokenCheck.estimatedTokens + '/' + this.contextWindow + ' tokens). Truncating...' });
          const truncatedSystem = truncateToFit(systemPrompt, Math.floor(this.contextWindow * 0.4));
          messages[0] = { role: 'system', content: truncatedSystem };

          // Drop file list message if still over budget
          if (messages.length > 3) {
            const recheck = checkTokenLimit(messages.map(m => m.content).join('\n'), this.contextWindow, this.config.maxTokensPerStep);
            if (!recheck.withinLimit) {
              messages.splice(1, 1);
            }
          }

          // If STILL over budget after truncation, proactively use chunking pipeline
          const finalCheck = checkTokenLimit(messages.map(m => m.content).join('\n'), this.contextWindow, this.config.maxTokensPerStep);
          if (!finalCheck.withinLimit && this.config.enableSmartChunking) {
            this.emit({ type: 'info', message: 'Still over limit after truncation (' + finalCheck.estimatedTokens + ' tokens). Proactively activating chunking pipeline...' });

            if (client) {
              const oversizedContent = messages
                .filter(m => m.role !== 'system')
                .map(m => m.content)
                .join('\n\n---\n\n');

              const proactivePipeline = new ChunkingPipeline({
                modelContextWindow: this.contextWindow,
                model: this.config.model,
                onProgress: (event) => {
                  this.chunkingActive = event.type !== 'pipeline_complete' && event.type !== 'pipeline_error';
                  this.emit({
                    type: event.type === 'chunk_start' ? 'chunking_start' :
                          event.type === 'chunk_complete' ? 'chunking_progress' :
                          event.type === 'pipeline_complete' ? 'chunking_complete' :
                          event.type === 'pipeline_error' ? 'chunking_error' : 'info',
                    chunkIndex: event.chunkIndex,
                    totalChunks: event.totalChunks,
                    tokensUsed: event.tokensUsed,
                    message: event.message,
                  } as any);
                },
              });

              try {
                const chunkResult = await proactivePipeline.process(
                  client,
                  messages[0]?.content || '',
                  currentTask,
                  oversizedContent
                );

                if (chunkResult.success) {
                  this.totalTokens += chunkResult.totalTokensUsed;
                  this.emit({ type: 'info', message: 'Proactive chunking complete: ' + chunkResult.totalChunks + ' chunks, ' + chunkResult.totalTokensUsed + ' tokens' });
                  // Skip the normal LLM call — use chunked result directly
                  response = {
                    content: chunkResult.mergedResponse,
                    usage: { total_tokens: chunkResult.totalTokensUsed },
                  };
                  this.consecutiveErrors = 0;
                }
              } catch (chunkErr: any) {
                this.emit({ type: 'info', message: 'Proactive chunking failed: ' + chunkErr.message + '. Attempting normal call...' });
              }
            }
          }
        }

        this.memory.addMessage(this.conversationId, 'user', currentTask, this.config.model, 'agent');

        // Execute LLM Call (skip if we already got a response from proactive chunking)
        if (!response) {
          rateLimiter.recordStart(this.config.model);
          let llmCallSucceeded = false;
          try {
            response = await completeChatResponse(client, this.config.model, messages, {
              temperature: 0.3,
              maxTokens: this.config.maxTokensPerStep,
            });
            llmCallSucceeded = true;
          } catch (err: any) {
            // Extract status code from OpenAI SDK error
            const statusCode = err?.status || err?.statusCode || (err?.error?.status);

            // Record the failed request in rate limiter (only place we call recordEnd for errors)
            rateLimiter.recordEnd(this.config.model, {
              statusCode,
              success: false,
            });

            // ── Handle 429/403 Rate Limits ──
            if (statusCode === 429 || statusCode === 403) {
              const check = rateLimiter.canRequest(this.config.model);
              this.emit({ type: 'info', message: `Rate limited (${statusCode}): ${check.reason || 'backing off'}` });
              if (check.fallbackModel) {
                this.emit({ type: 'auto_answer', question: 'Rate limited on ' + this.config.model, answer: 'Switching to ' + check.fallbackModel });
                this.config.model = check.fallbackModel;
                // Update contextWindow for the new model
                const fallbackModelDef = getModel(check.fallbackModel);
                if (fallbackModelDef) {
                  this.contextWindow = fallbackModelDef.maxInputTokens;
                }
              } else {
                await this.delay(check.retryAfterMs || 30000);
              }
              // Rate limit errors are recoverable — do NOT count toward consecutive errors
              continue;
            }

            // ── Handle 413 / Token Limit Errors ──
            const limitCheck = isTokenLimitError(err);
            if (limitCheck.isLimit) {
              // Extract real limit from error message
              const realMax = limitCheck.suggestedMax || this.contextWindow;
              this.emit({ type: 'info', message: 'Token limit hit! Actual max: ' + realMax + ' tokens. Activating chunking...' });

              // Update context window to the REAL limit from the error
              if (limitCheck.suggestedMax && limitCheck.suggestedMax < this.contextWindow) {
                this.contextWindow = Math.floor(limitCheck.suggestedMax * 0.95);
                this.emit({ type: 'info', message: 'Context window corrected to ' + this.contextWindow + ' tokens' });
              }

              // Always activate chunking pipeline on token limit errors
              if (this.config.enableSmartChunking) {
                this.emit({ type: 'info', message: 'Activating smart chunking pipeline (context: ' + this.contextWindow + ' tokens)...' });

                const oversizedContent = messages
                  .filter(m => m.role !== 'system')
                  .map(m => m.content)
                  .join('\n\n---\n\n');

                // Create fresh pipeline with CORRECT context window from the error
                const recoveryPipeline = new ChunkingPipeline({
                  modelContextWindow: this.contextWindow,
                  model: this.config.model,
                  onProgress: (event) => {
                    this.chunkingActive = event.type !== 'pipeline_complete' && event.type !== 'pipeline_error';
                    this.emit({
                      type: event.type === 'chunk_start' ? 'chunking_start' :
                            event.type === 'chunk_complete' ? 'chunking_progress' :
                            event.type === 'pipeline_complete' ? 'chunking_complete' :
                            event.type === 'pipeline_error' ? 'chunking_error' : 'info',
                      chunkIndex: event.chunkIndex,
                      totalChunks: event.totalChunks,
                      tokensUsed: event.tokensUsed,
                      message: event.message,
                    } as any);
                  },
                });

                try {
                  const truncatedSystem = truncateToFit(
                    messages[0]?.content || '',
                    Math.floor(this.contextWindow * 0.3)
                  );

                  const chunkResult = await recoveryPipeline.process(
                    client,
                    truncatedSystem,
                    currentTask,
                    oversizedContent
                  );

                  if (chunkResult.success) {
                    this.totalTokens += chunkResult.totalTokensUsed;
                    this.emit({ type: 'info', message: 'Chunking recovery complete: ' + chunkResult.totalChunks + ' chunks, ' + chunkResult.totalTokensUsed + ' tokens' });
                    response = {
                      content: chunkResult.mergedResponse,
                      usage: { total_tokens: chunkResult.totalTokensUsed },
                    };
                    // Token limit was recovered — do NOT count toward consecutive errors
                    this.consecutiveErrors = 0;
                  } else {
                    this.emit({ type: 'info', message: 'Chunking pipeline failed: ' + chunkResult.error });
                    // Reduce context window further for next attempt
                    this.contextWindow = Math.floor(this.contextWindow * 0.7);
                    // Token limit recovery failed — count this one
                    this.consecutiveErrors++;
                    if (this.consecutiveErrors < (this.config.continuousMode ? Infinity : this.maxConsecutiveErrors)) {
                      continue;
                    }
                    throw err;
                  }
                } catch (chunkErr: any) {
                  if (chunkErr === err) throw err; // re-thrown from above
                  this.emit({ type: 'info', message: 'Chunking pipeline error: ' + chunkErr.message });
                  this.contextWindow = Math.floor(this.contextWindow * 0.7);
                  this.consecutiveErrors++;
                  if (this.consecutiveErrors < (this.config.continuousMode ? Infinity : this.maxConsecutiveErrors)) {
                    continue;
                  }
                  throw err;
                }
              } else {
                // No chunking available — shrink context and retry
                this.contextWindow = Math.floor(this.contextWindow * 0.7);
                this.emit({ type: 'info', message: 'Adjusted context window to ' + this.contextWindow + ' tokens (chunking disabled)' });
                this.consecutiveErrors++;
                if (this.consecutiveErrors < (this.config.continuousMode ? Infinity : this.maxConsecutiveErrors)) {
                  continue;
                }
                throw err;
              }
            } else {
              // Unknown / unrecoverable error — throw to outer catch
              throw err;
            }
          }

          // Record success in rate limiter (only if the LLM call itself succeeded)
          if (llmCallSucceeded && response) {
            rateLimiter.recordEnd(this.config.model, {
              statusCode: response?.statusCode,
              headers: response?.headers,
              success: true,
            });
          }
        }

        // ── Process Response ──
        this.consecutiveErrors = 0;
        const content = response.content;
        this.totalTokens += response.usage?.total_tokens || 0;

        this.memory.addMessage(this.conversationId, 'assistant', content, this.config.model, 'agent');
        this.emit({ type: 'step_content', delta: content });

        // Record in loop detector for stuck-detection
        try {
          this.loopDetector.record(
            this.currentIteration,
            currentTask,
            content,
            content.slice(0, 300)
          );
        } catch { /* loop recording is non-critical */ }

        // Log the LLM call to persistent file
        try {
          this.logWriter?.logLLMCall({
            model: this.config.model,
            provider: this.config.provider,
            iteration: this.currentIteration,
            promptTokens: response.usage?.prompt_tokens || estimateTokens(currentTask),
            completionTokens: response.usage?.completion_tokens || estimateTokens(content),
            totalTokens: response.usage?.total_tokens || 0,
            taskSnippet: currentTask.slice(0, 500),
            responseSnippet: content.slice(0, 500),
          });
        } catch { /* LLM logging is non-critical */ }

        // Store discovered context limit for this model
        if (response.usage?.total_tokens && !this.discoveredContextLimits.has(this.config.model)) {
          this.discoveredContextLimits.set(this.config.model, this.contextWindow);
        }

        // ── Bird-feed observation to Nano trainer (fire-and-forget) ──
        try {
          fetch('http://localhost:5100/v1/training/observe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pairs: [{
                input: currentTask.slice(0, 4000),
                output: content.slice(0, 8000),
                quality: 0.8,
              }],
            }),
          }).catch(() => {}); // nano may not be running
        } catch { /* non-critical */ }

        // Index conversation messages
        try {
          this.conversationIndexer.indexMessage(projectId, this.conversationId, 'user-' + this.currentIteration, currentTask, 'user');
          this.conversationIndexer.indexMessage(projectId, this.conversationId, 'assistant-' + this.currentIteration, content, 'assistant');
          this.conversationIndexContext = this.conversationIndexer.buildIndexedContext(projectId, currentTask, Math.floor(this.contextWindow * 0.05));
        } catch { /* conversation indexing is non-critical */ }

        // ── Parse & Apply File Changes ──
        this.setState('evaluating');
        const structured = parseStructuredOutput(content) as StructuredAgentOutput | null;
        const fileChanges = parseFileChanges(content);

        for (const change of fileChanges) {
          try {
            writeFile(this.config.projectRoot, change.path, change.content, true);
            this.totalFilesChanged++;
            this.emit({ type: 'file_changed', change: { path: change.path, action: 'modified', summary: 'Updated by agent' } });

            // Log edit to code_edit_log
            try {
              this.db.prepare(
                "INSERT INTO code_edit_log (id, project_id, file_path, edit_type, symbols_affected, change_reason, agent_run_id, created_at) VALUES (?, ?, ?, 'modify', '[]', ?, ?, datetime('now'))"
              ).run(uuid(), projectId, change.path, 'Agent step ' + this.currentIteration, this.runId);
            } catch { /* edit logging is non-critical */ }
          } catch (err: any) {
            this.emit({ type: 'error', error: 'Failed to write ' + change.path + ': ' + err.message });
          }
        }

        // Auto Error Detection
        if (this.config.autoFixErrors && fileChanges.length > 0) {
          try {
            const errors = runAllLintChecks(this.config.projectRoot);
            if (errors.length > 0) {
              this.lastErrorContext = formatErrorsForLLM(errors);
              this.emit({ type: 'errors_detected', count: errors.length, errors: errors.slice(0, 10) });
            } else {
              this.lastErrorContext = '';
              this.emit({ type: 'info', message: 'No lint errors detected' });
            }
          } catch (err: any) {
            this.emit({ type: 'info', message: 'Lint check failed: ' + err.message });
          }
        }

        // Auto Test Running
        if (this.config.autoRunTests && fileChanges.length > 0) {
          try {
            const testResult = runTests(this.config.projectRoot);
            if (testResult.total > 0) {
              this.lastTestContext = formatTestsForLLM(testResult);
              if (testResult.failed > 0) {
                this.emit({ type: 'tests_failed', count: testResult.failed, result: testResult });
              } else {
                this.emit({ type: 'info', message: 'All tests passed (' + testResult.total + ' tests)' });
              }
            }
          } catch (err: any) {
            this.emit({ type: 'info', message: 'Test run failed: ' + err.message });
          }
        }

        // Auto Checkpointing
        if (this.config.checkpointEvery > 0 && this.currentIteration % this.config.checkpointEvery === 0 && fileChanges.length > 0) {
          try {
            const desc = structured?.summary || ('Auto-checkpoint at iteration ' + this.currentIteration);
            this.checkpoint.createCheckpoint(this.config.projectRoot, projectId, this.runId, this.currentIteration, desc);
            this.emit({ type: 'checkpoint_created', iteration: this.currentIteration, description: desc });
          } catch (err: any) {
            this.emit({ type: 'info', message: 'Checkpoint failed: ' + err.message });
          }
        }

        // ── Process Structured Output ──
        if (structured) {
          this.emit({ type: 'step_complete', output: structured });

          const questions = structured.questionsForUser || [];
          for (const q of questions) {
            this.pendingQuestions.push(q);
            this.memory.logQuestion(projectId, q, this.runId);
            this.emit({ type: 'question_logged', question: q });
          }

          if (this.config.autoAnswerQuestions && questions.length > 0) {
            for (const q of questions) {
              this.emit({ type: 'auto_answer', question: q, answer: 'Proceeding with best practices.' });
            }
          }

          this.memory.addNote(projectId, {
            projectId,
            source: 'agent_log',
            category: 'agent_step',
            title: 'Step ' + this.currentIteration + ': ' + structured.summary.slice(0, 100),
            content: structured.summary,
            tags: ['agent', 'step-' + this.currentIteration, 'run-' + this.runId],
            relatedFiles: (structured.filesChanged || []).map(f => f.path),
            importance: 60,
            conversationId: this.conversationId,
          });

          // Update task tracker
          if (this.config.taskId && structured.done === false && (structured.nextSteps || []).length > 0) {
            try {
              const tracker = this.analyzer.getTaskTracker(this.config.taskId) as any;
              if (tracker) {
                const subtasks = typeof tracker.subtasks === 'string' ? JSON.parse(tracker.subtasks) : (tracker.subtasks || []);
                const currentIdx = subtasks.findIndex((s: any) => s.status === 'in_progress');
                if (currentIdx >= 0) {
                  this.analyzer.updateSubtask(this.config.taskId, currentIdx, { status: 'completed' });
                }
                const nextIdx = subtasks.findIndex((s: any) => s.status === 'pending');
                if (nextIdx >= 0) {
                  this.analyzer.updateSubtask(this.config.taskId, nextIdx, { status: 'in_progress' });
                }
              }
            } catch { /* ignore */ }
          }

          // Check if done
          if (structured.done) {
            try {
              this.checkpoint.createCheckpoint(this.config.projectRoot, projectId, this.runId, this.currentIteration, 'COMPLETED: ' + initialTask.slice(0, 100));
            } catch { /* ignore */ }

            if (this.config.continuousMode) {
              this.emit({ type: 'run_complete', summary: 'Task cycle complete: ' + structured.summary, totalSteps: this.currentIteration });
              this.emit({ type: 'info', message: '24/7 mode: Task cycle complete. Scanning for improvements and continuing...' });

              this.memory.addNote(projectId, {
                projectId,
                source: 'auto_summary',
                category: 'task_complete',
                title: 'Cycle Complete: ' + initialTask.slice(0, 100),
                content: 'Task: ' + initialTask + '\nSummary: ' + structured.summary + '\nSteps: ' + this.currentIteration + '\nFiles Changed: ' + this.totalFilesChanged + '\nTokens: ' + this.totalTokens,
                tags: ['completed', 'summary', 'continuous-mode'],
                relatedFiles: (structured.filesChanged || []).map(f => f.path),
                importance: 90,
                conversationId: this.conversationId,
              });

              currentTask = [
                'The previous task has been marked as complete. You are in 24/7 continuous mode.',
                'Review the current state of the project and:',
                '1. Check for any remaining TODOs, FIXMEs, or improvement opportunities',
                '2. Look for code quality improvements, missing error handling, or edge cases',
                '3. Verify all tests pass and add tests for untested code paths',
                '4. Optimize performance bottlenecks if any',
                '5. If everything is truly complete and optimal, generate a comprehensive project status report.',
                '',
                'DO NOT mark done=true unless there is genuinely nothing left to improve.',
              ].join('\n');

              const reviewCooldown = Math.max(effectiveCooldown, 10000);
              this.emit({ type: 'cooldown', ms: reviewCooldown, reason: '24/7 review cycle cooldown' } as any);
              await this.delay(reviewCooldown);
              continue;
            }

            // Normal mode: stop
            this.setState('complete');
            this.emit({ type: 'run_complete', summary: structured.summary, totalSteps: this.currentIteration });

            this.memory.addNote(projectId, {
              projectId,
              source: 'auto_summary',
              category: 'task_complete',
              title: 'Completed: ' + initialTask.slice(0, 100),
              content: 'Task: ' + initialTask + '\nSummary: ' + structured.summary + '\nSteps: ' + this.currentIteration + '\nFiles Changed: ' + this.totalFilesChanged + '\nTokens: ' + this.totalTokens,
              tags: ['completed', 'summary'],
              relatedFiles: (structured.filesChanged || []).map(f => f.path),
              importance: 90,
              conversationId: this.conversationId,
            });

            break;
          }

          // Build Next Iteration Task
          let nextTask = '';

          if (this.lastErrorContext && this.config.autoFixErrors) {
            nextTask = 'PRIORITY: Fix the following errors before continuing:\n\n' + this.lastErrorContext + '\n\nAfter fixing errors, continue with:\n';
          }

          if (this.lastTestContext && this.config.autoRunTests) {
            const hasFailures = this.lastTestContext.includes('FAIL');
            if (hasFailures) {
              nextTask += 'FAILING TESTS:\n' + this.lastTestContext + '\n\nFix these tests, then continue with:\n';
            }
          }

          if ((structured.nextSteps || []).length > 0) {
            nextTask += structured.nextSteps
              .map(s => s.stepNumber + '. ' + s.action + ': ' + s.detail + ' (target: ' + s.target + ')')
              .join('\n');
          } else {
            nextTask += 'Continue with the implementation. Review what has been done and identify what remains.';
          }

          currentTask = nextTask;
        } else {
          currentTask = 'Continue with the implementation. Remember to include the structured JSON output block.';
          if (this.lastErrorContext) {
            currentTask = 'PRIORITY: Fix these errors:\n' + this.lastErrorContext + '\n\nThen continue implementation.';
          }
        }

        await this.delay(this.config.stepDelayMs);

      } catch (err: any) {
        this.consecutiveErrors++;

        if (this.config.continuousMode) {
          const backoffMs = Math.min(this.errorBackoff * Math.pow(2, this.consecutiveErrors - 1), 300_000);
          this.emit({ type: 'error', error: 'Error (attempt ' + this.consecutiveErrors + '): ' + err.message });
          this.emit({ type: 'cooldown', ms: backoffMs, reason: 'Backing off for ' + Math.round(backoffMs / 1000) + 's before retry...' } as any);
          await this.delay(backoffMs);
          continue;
        }

        if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
          this.setState('error');
          this.emit({ type: 'error', error: this.maxConsecutiveErrors + ' consecutive errors. Stopping. Last: ' + err.message });
          this.db.prepare(
            "UPDATE agent_runs SET final_state = ?, summary = ?, completed_at = datetime('now'), iterations = ?, total_tokens = ? WHERE id = ?"
          ).run('error', 'Error: ' + err.message, this.currentIteration, this.totalTokens, this.runId);
          break;
        }

        this.emit({ type: 'error', error: 'Error (attempt ' + this.consecutiveErrors + '): ' + err.message });
        await this.delay(5000);
        continue;
      }

      // Cooldown between iterations (24/7 mode)
      if (effectiveCooldown > 0 && (this.state as string) !== 'complete') {
        this.emit({ type: 'cooldown', ms: effectiveCooldown, reason: 'Cooldown between iterations' } as any);
        await this.delay(effectiveCooldown);
      }

      // Periodic compaction (every 50 iterations)
      if (this.currentIteration % 50 === 0) {
        try {
          if (this.logManager.needsCompaction()) {
            this.logManager.runCompaction();
            this.logHealthContext = this.logManager.formatForLLM();
          }
        } catch { /* non-critical */ }
      }
    }

    // Final log
    if (this.state !== 'error') {
      this.db.prepare(
        "UPDATE agent_runs SET final_state = ?, iterations = ?, total_tokens = ?, completed_at = datetime('now') WHERE id = ?"
      ).run(this.state, this.currentIteration, this.totalTokens, this.runId);
    }
  }

  pause(): void {
    if (this.state === 'executing' || this.state === 'evaluating' || this.state === 'planning') {
      this.setState('paused');
    }
  }

  resume(): void {
    if (this.state === 'paused') {
      this.setState('executing');
    }
  }

  stop(): void {
    this.abortController?.abort();
    this.setState('complete');
  }

  async rollback(projectId: string, checkpointId: string): Promise<void> {
    const checkpoint = this.checkpoint.listCheckpoints(projectId).find(c => c.id === checkpointId);
    if (!checkpoint) throw new Error('Checkpoint not found');
    this.checkpoint.rollback(this.config.projectRoot, checkpointId);
    this.emit({ type: 'rollback', checkpointId, description: checkpoint.label });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
