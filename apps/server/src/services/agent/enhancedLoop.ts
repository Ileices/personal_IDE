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
// Extracted modules for <1000 LOC compliance
import { initializeRun, resolveModelContextWindow } from './loop/runSetup.js';
import { enforceTokenBudget, tryProactiveChunking, recoverFromTokenLimitError } from './loop/tokenRecovery.js';
import { buildAutoAnswer } from './loop/autoAnswers.js';
import { assembleContext, appendHistory, appendSchemaReminder } from './loop/contextAssembly.js';
import { processResponse, buildNextTask, buildSchemaMissTask } from './loop/responseProcessing.js';
import { handleQuestions, storeStepNote, updateTaskTracker, handleCompletion } from './loop/continuousMode.js';
import { appConfig } from '../../config.js';

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
  /** Ordered fallback models when primary is rate-limited */
  fallbackModels?: string[];
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
  private loopBreakoutAttempts = 0;
  private iterationsWithoutFileChanges = 0;
  private maxIterationsWithoutProgress = 15;

  constructor(
    private db: Database.Database,
    private config: EnhancedAgentConfig
  ) {
    this.memory = new MemoryService(db);
    this.checkpoint = new CheckpointService(db);
    this.analyzer = new CodebaseAnalyzer(db);
    // Use model's actual token limit, respect user overrides within model bounds
    const modelDef = getModel(config.model);
    // For known models use their context window; for dynamic models (ollama, nano)
    // use configurable default (env UNKNOWN_MODEL_CONTEXT) — will be corrected
    // at start() via resolveModelContextWindow() which queries the provider.
    const modelMax = modelDef?.maxInputTokens || appConfig.contextDefaults.unknownModelContext;
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

    // ── Phase 0 & -1: Environment + Knowledge Graph (extracted to loop/runSetup.ts) ──
    this.setState('planning');

    // Dynamic context discovery — queries Ollama/Nano for actual model context size
    // instead of assuming 128k for unknown models
    try {
      this.contextWindow = await resolveModelContextWindow(
        this.db, this.config.provider, this.config.model,
        this.config.contextWindow, (e) => this.emit(e),
      );
      this.emit({ type: 'info', message: 'Context window: ' + this.contextWindow + ' tokens' });
    } catch (err: any) {
      this.emit({ type: 'info', message: 'Context resolution: ' + err.message });
    }

    const setup = await initializeRun(
      this.db,
      { projectRoot: this.config.projectRoot, analyzeCodebase: this.config.analyzeCodebase },
      this.contextWindow,
      {
        analyzer: this.analyzer,
        relationshipIndex: this.relationshipIndex,
        logManager: this.logManager,
        tierEngine: this.tierEngine,
        codeIndexer: this.codeIndexer,
      },
      (e) => this.emit(e),
    );

    this.projectLanguages = setup.projectLanguages;
    this.platformInfo = setup.platformInfo;
    this.platformContext = setup.platformContext;
    this.relationshipContext = setup.relationshipContext;
    this.tierContext = setup.tierContext;
    this.logHealthContext = setup.logHealthContext;
    let codebaseOverview = setup.codebaseOverview;

    try {
      this.checkpoint.initGit(this.config.projectRoot);
      this.checkpoint.createCheckpoint(this.config.projectRoot, projectId, this.runId, 0, 'Agent start: ' + initialTask.slice(0, 100));
      this.emit({ type: 'info', message: 'Initial checkpoint created' });
    } catch (err: any) {
      this.emit({ type: 'info', message: 'Checkpoint init: ' + err.message });
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
            // Try ordered fallback chain first, then smart headroom-based fallback
            const fallback = canProceed.fallbackModel
              || rateLimiter.findFallback(this.config.model, 'agent', this.config.fallbackModels);
            if (fallback) {
              this.emit({ type: 'auto_answer', question: 'Rate limited on ' + this.config.model, answer: 'Switching to ' + fallback });
              this.config.model = fallback;
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

        // Build Context (extracted to loop/contextAssembly.ts)
        const assembled = assembleContext({
          projectRoot: this.config.projectRoot,
          projectId: projectId,
          conversationId: this.conversationId,
          currentTask,
          currentIteration: this.currentIteration,
          maxIterations: this.config.maxIterations,
          contextWindow: this.contextWindow,
          projectLanguages: this.projectLanguages,
          taskId: this.config.taskId,
          relationshipContext: this.relationshipContext,
          tierContext: this.tierContext,
          logHealthContext: this.logHealthContext,
          conversationIndexContext: this.conversationIndexContext,
          platformContext: this.platformContext,
          lastErrorContext: this.lastErrorContext,
          lastTestContext: this.lastTestContext,
          codebaseOverview,
        }, {
          memory: this.memory,
          checkpoint: this.checkpoint,
          analyzer: this.analyzer,
          codeIndexer: this.codeIndexer,
        });

        const messages = assembled.messages;

        // Append conversation history (extracted to loop/contextAssembly.ts)
        appendHistory(messages, this.conversationId, this.contextWindow, this.memory);

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
          this.loopBreakoutAttempts++;
          this.emit({ type: 'loop_detected', pattern: loopCheck.pattern, count: loopCheck.count });
          this.emit({ type: 'info', message: '🔄 LOOP DETECTED (breakout attempt #' + this.loopBreakoutAttempts + '): ' + loopCheck.pattern });

          // After 5 breakout attempts with no progress, halt — the model can't follow instructions
          if (this.loopBreakoutAttempts >= 5 && this.totalFilesChanged === 0) {
            this.setState('error');
            this.emit({ type: 'error', error: 'Agent halted: ' + this.loopBreakoutAttempts + ' loop breakout attempts with zero file changes. The model is not producing actionable output. Try a larger/different model, or simplify the task.' });
            this.db.prepare(
              "UPDATE agent_runs SET final_state = ?, summary = ?, completed_at = datetime('now'), iterations = ?, total_tokens = ? WHERE id = ?"
            ).run('error', 'Loop breakout failure: ' + this.loopBreakoutAttempts + ' attempts, 0 files changed', this.currentIteration, this.totalTokens, this.runId);
            break;
          }

          // Reset detector history so the breakout prompt gets a fresh start
          this.loopDetector.reset();

          // Use the ORIGINAL task on escalation, not the accumulated junk
          currentTask = this.loopDetector.generateBreakoutPrompt(
            this.config.projectRoot,
            initialTask,
            loopCheck.pattern || 'Repeated pattern',
            codebaseOverview
          );

          // Forcefully re-inject the schema requirement
          currentTask += [
            '',
            '',
            'ABSOLUTE REQUIREMENT: You MUST output file changes using --- FILE: path --- markers AND end with the structured JSON block.',
            'If you cannot complete the full task in one step, create at least ONE file with meaningful content.',
            'Example:',
            '',
            '--- FILE: src/main.ts ---',
            '```typescript',
            '// your code here',
            '```',
            '--- END FILE ---',
            '',
            '```json:structured_output',
            '{"summary": "Created main.ts", "filesChanged": [{"path": "src/main.ts", "action": "created", "summary": "Initial implementation"}], "nextSteps": [{"stepNumber": 1, "action": "Expand implementation", "target": "src/main.ts", "detail": "Add core logic", "priority": "high"}], "questionsForUser": [], "done": false, "confidence": 75}',
            '```',
          ].join('\n');

          // Try web search to find new approaches when stuck
          try {
            const errorQuery = this.lastErrorContext
              ? this.lastErrorContext.slice(0, 100)
              : initialTask.slice(0, 80);
            const searchResult = await webSearch(errorQuery + ' solution fix', 3);
            if (searchResult.results.length > 0) {
              const searchContext = formatSearchForLLM(searchResult);
              currentTask += '\n\n' + searchContext;
              this.emit({ type: 'info', message: 'Web search: Found ' + searchResult.results.length + ' results for context' });
            }
          } catch { /* web search is non-critical */ }
        }

        // Append compact schema reminder (extracted to loop/contextAssembly.ts)
        currentTask = appendSchemaReminder(currentTask);
        messages.push({ role: 'user', content: currentTask });

        let response: any = null;

        // Execute step
        this.setState('executing');
        this.emit({
          type: 'step_start',
          step: { stepNumber: this.currentIteration, action: currentTask.slice(0, 200), target: '', detail: '', priority: 'high' as const },
          iteration: this.currentIteration,
        });

        // ── EARLY BUDGET ENFORCEMENT (extracted to loop/tokenRecovery.ts) ──
        enforceTokenBudget(messages, this.contextWindow, this.config.maxTokensPerStep, (e) => this.emit(e));

        // ── Proactive Chunking (extracted to loop/tokenRecovery.ts) ──
        if (this.config.enableSmartChunking) {
          const proactiveResult = await tryProactiveChunking(
            client, messages, currentTask, this.contextWindow,
            this.config.model, this.config.maxTokensPerStep, (e) => this.emit(e),
          );
          if (proactiveResult) {
            this.totalTokens += proactiveResult.tokensUsed;
            response = {
              content: proactiveResult.content,
              usage: { total_tokens: proactiveResult.tokensUsed },
            };
            this.consecutiveErrors = 0;
          }
        }

        // Only store original tasks in conversation memory, not schema-miss retries (they pollute history)
        if (!currentTask.includes('previous output was missing') && !currentTask.includes('LOOP DETECTED')) {
          this.memory.addMessage(this.conversationId, 'user', currentTask, this.config.model, 'agent');
        }

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

            // ── Handle 404 — Model not found (bad model ID in fallback chain) ──
            if (statusCode === 404) {
              this.emit({ type: 'info', message: '404: Model "' + this.config.model + '" not found. Switching to fallback...' });
              const fallback = rateLimiter.findFallback(this.config.model, 'agent', this.config.fallbackModels);
              if (fallback) {
                this.emit({ type: 'auto_answer', question: 'Model not found: ' + this.config.model, answer: 'Switching to ' + fallback });
                this.config.model = fallback;
                const fallbackModelDef = getModel(fallback);
                if (fallbackModelDef) {
                  this.contextWindow = fallbackModelDef.maxInputTokens;
                }
              } else {
                // No fallback available — try the default model
                this.emit({ type: 'info', message: 'No fallback available. Falling back to openai/gpt-4.1-mini.' });
                this.config.model = 'openai/gpt-4.1-mini';
                this.contextWindow = 1047576;
              }
              continue;
            }

            // ── Handle 429/403 Rate Limits ──
            if (statusCode === 429 || statusCode === 403) {
              const check = rateLimiter.canRequest(this.config.model);
              this.emit({ type: 'info', message: `Rate limited (${statusCode}): ${check.reason || 'backing off'}` });
              const fallback = check.fallbackModel
                || rateLimiter.findFallback(this.config.model, 'agent', this.config.fallbackModels);
              if (fallback) {
                this.emit({ type: 'auto_answer', question: 'Rate limited on ' + this.config.model, answer: 'Switching to ' + fallback });
                this.config.model = fallback;
                // Update contextWindow for the new model
                const fallbackModelDef = getModel(fallback);
                if (fallbackModelDef) {
                  this.contextWindow = fallbackModelDef.maxInputTokens;
                }
              } else {
                await this.delay(check.retryAfterMs || 30000);
              }
              // Rate limit errors are recoverable — do NOT count toward consecutive errors
              continue;
            }

            // ── Handle 413 / Token Limit Errors (extracted to loop/tokenRecovery.ts) ──
            const limitCheck = isTokenLimitError(err);
            if (limitCheck.isLimit) {
              const recovery = await recoverFromTokenLimitError(
                err, client, messages, currentTask, this.config.model,
                this.contextWindow, this.discoveredContextLimits,
                this.config.enableSmartChunking, (e) => this.emit(e),
              );

              if (recovery.contextWindowUpdate) {
                this.contextWindow = recovery.contextWindowUpdate;
              }

              if (recovery.response) {
                this.totalTokens += recovery.response.usage?.total_tokens || 0;
                response = recovery.response;
                this.consecutiveErrors = 0;
              } else if (recovery.isRecoverableError) {
                this.consecutiveErrors++;
                if (this.consecutiveErrors < (this.config.continuousMode ? Infinity : this.maxConsecutiveErrors)) {
                  continue;
                }
                throw err;
              } else {
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

        // ── Process Response (extracted to loop/responseProcessing.ts) ──
        const content = response.content || '';
        this.totalTokens += response.usage?.total_tokens || 0;

        // Only store productive responses in memory
        const contentLower = content.toLowerCase().slice(0, 300);
        const isFailedResponse = (contentLower.includes("i'm sorry") || contentLower.includes("i apologize") ||
          contentLower.includes("as an ai")) && !content.includes('--- FILE:');
        if (!isFailedResponse) {
          this.memory.addMessage(this.conversationId, 'assistant', content, this.config.model, 'agent');
        }
        this.emit({ type: 'step_content', delta: content });

        // Store discovered context limit for this model
        if (response.usage?.total_tokens && !this.discoveredContextLimits.has(this.config.model)) {
          this.discoveredContextLimits.set(this.config.model, this.contextWindow);
        }

        const responseResult = processResponse(
          content, currentTask, response,
          {
            db: this.db,
            config: {
              model: this.config.model,
              provider: this.config.provider,
              projectRoot: this.config.projectRoot,
              autoFixErrors: this.config.autoFixErrors,
              autoRunTests: this.config.autoRunTests,
              checkpointEvery: this.config.checkpointEvery,
              taskId: this.config.taskId,
              maxTokensPerStep: this.config.maxTokensPerStep,
            },
            projectId,
            conversationId: this.conversationId,
            runId: this.runId,
            currentIteration: this.currentIteration,
            contextWindow: this.contextWindow,
          },
          {
            memory: this.memory,
            checkpoint: this.checkpoint,
            analyzer: this.analyzer,
            conversationIndexer: this.conversationIndexer,
            loopDetector: this.loopDetector,
            logWriter: this.logWriter,
          },
          (e) => this.emit(e),
        );

        this.totalFilesChanged += responseResult.fileChangesCount;
        this.lastErrorContext = responseResult.lastErrorContext;
        this.lastTestContext = responseResult.lastTestContext;
        this.conversationIndexContext = responseResult.conversationIndexContext;
        const structured = responseResult.structured;
        const fileChangesCount = responseResult.fileChangesCount;

        // ── No-Progress Detection ──
        if (fileChangesCount > 0) {
          this.iterationsWithoutFileChanges = 0;
          this.loopBreakoutAttempts = 0;
        } else {
          this.iterationsWithoutFileChanges++;
          if (this.iterationsWithoutFileChanges >= this.maxIterationsWithoutProgress) {
            this.setState('error');
            this.emit({ type: 'error', error: 'Agent halted: ' + this.maxIterationsWithoutProgress + ' consecutive iterations with zero file changes. Total iterations: ' + this.currentIteration + ', total tokens used: ' + this.totalTokens + '. The model is not producing actionable code. Try a different model or a more specific task.' });
            this.db.prepare(
              "UPDATE agent_runs SET final_state = ?, summary = ?, completed_at = datetime('now'), iterations = ?, total_tokens = ? WHERE id = ?"
            ).run('error', 'No progress: ' + this.iterationsWithoutFileChanges + ' iterations without file changes', this.currentIteration, this.totalTokens, this.runId);
            break;
          }
        }

        this.setState('evaluating');

        // ── Process Structured Output (extracted to loop/continuousMode.ts) ──
        if (structured) {
          this.emit({ type: 'step_complete', output: structured });

          const autoAnsweredContext = handleQuestions(
            structured, this.pendingQuestions,
            {
              projectId, conversationId: this.conversationId, runId: this.runId,
              currentIteration: this.currentIteration, totalFilesChanged: this.totalFilesChanged,
              totalTokens: this.totalTokens, initialTask,
              codebaseOverview, projectLanguages: this.projectLanguages, tierContext: this.tierContext,
              taskId: this.config.taskId,
            },
            {
              continuousMode: this.config.continuousMode,
              cooldownMs: this.config.cooldownMs || 0,
              autoAnswerQuestions: this.config.autoAnswerQuestions,
              projectRoot: this.config.projectRoot,
            },
            { memory: this.memory },
            (e) => this.emit(e),
          );

          storeStepNote(structured, {
            projectId, conversationId: this.conversationId, runId: this.runId,
            currentIteration: this.currentIteration, totalFilesChanged: this.totalFilesChanged,
            totalTokens: this.totalTokens, initialTask,
            codebaseOverview, projectLanguages: this.projectLanguages, tierContext: this.tierContext,
          }, { memory: this.memory });

          updateTaskTracker(structured, this.config.taskId, { analyzer: this.analyzer });

          // Check if done
          if (structured.done) {
            const nextContinuousTask = handleCompletion(
              structured,
              {
                projectId, conversationId: this.conversationId, runId: this.runId,
                currentIteration: this.currentIteration, totalFilesChanged: this.totalFilesChanged,
                totalTokens: this.totalTokens, initialTask,
                codebaseOverview, projectLanguages: this.projectLanguages, tierContext: this.tierContext,
              },
              {
                continuousMode: this.config.continuousMode,
                cooldownMs: this.config.cooldownMs || 0,
                autoAnswerQuestions: this.config.autoAnswerQuestions,
                projectRoot: this.config.projectRoot,
              },
              { memory: this.memory, checkpoint: this.checkpoint },
              (e) => this.emit(e),
            );

            if (nextContinuousTask) {
              currentTask = nextContinuousTask;
              await this.delay(Math.max(effectiveCooldown, 10000));
              continue;
            }
            this.setState('complete');
            break;
          }

          // Build Next Iteration Task (extracted to loop/responseProcessing.ts)
          currentTask = buildNextTask(
            structured, this.lastErrorContext, this.lastTestContext,
            this.config.autoFixErrors, this.config.autoRunTests,
            autoAnsweredContext,
          );

          this.consecutiveErrors = 0;
        } else {
          // ── Structured output NOT parsed ──
          this.consecutiveErrors++;
          this.emit({ type: 'info', message: 'Schema miss #' + this.consecutiveErrors + ': LLM did not return structured JSON output block. ' + (fileChangesCount > 0 ? fileChangesCount + ' file changes parsed from markdown.' : 'No file changes either.') });

          if (fileChangesCount > 0) this.consecutiveErrors = Math.max(0, this.consecutiveErrors - 2);

          currentTask = buildSchemaMissTask(initialTask, fileChangesCount, this.lastErrorContext);

          if (this.consecutiveErrors >= 8) {
            this.setState('error');
            this.emit({ type: 'error', error: 'Agent stopped: ' + this.consecutiveErrors + ' consecutive iterations without valid structured output. The LLM model may be unable to follow the required schema. Try a different/larger model.' });
            this.db.prepare(
              "UPDATE agent_runs SET final_state = ?, summary = ?, completed_at = datetime('now'), iterations = ?, total_tokens = ? WHERE id = ?"
            ).run('error', 'Schema compliance failure after ' + this.consecutiveErrors + ' attempts', this.currentIteration, this.totalTokens, this.runId);
            break;
          }
        }

        await this.delay(this.config.stepDelayMs);

      } catch (err: any) {
        this.consecutiveErrors++;

        // ── Connection Error — provider unreachable ──
        const errMsg = (err.message || '').toLowerCase();
        const isConnectionError = /connection error|econnrefused|enotfound|etimedout|fetch failed|network error|request was aborted|aborterror|the operation was aborted|timeout|socket hang up/.test(errMsg);

        if (isConnectionError) {
          this.emit({ type: 'error', error: 'Connection error on ' + this.config.provider + '/' + this.config.model + ': ' + err.message });
          const fallback = rateLimiter.findFallback(this.config.model, 'agent', this.config.fallbackModels);
          if (fallback) {
            this.emit({ type: 'info', message: 'Provider unreachable. Switching to ' + fallback });
            this.config.model = fallback;
            const fallbackModelDef = getModel(fallback);
            if (fallbackModelDef) {
              this.contextWindow = fallbackModelDef.maxInputTokens;
            }
            // Connection errors are provider-level, not logic errors — reset counter on switch
            this.consecutiveErrors = 0;
            continue;
          }
          // No fallback available — if continuous mode, backoff and retry
          if (this.config.continuousMode) {
            const backoffMs = Math.min(this.errorBackoff * Math.pow(2, this.consecutiveErrors - 1), 300_000);
            this.emit({ type: 'cooldown', ms: backoffMs, reason: 'All providers unreachable. Backing off for ' + Math.round(backoffMs / 1000) + 's...' } as any);
            await this.delay(backoffMs);
            continue;
          }
        }

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
