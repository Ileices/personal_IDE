// ============================================
// Enhanced Agent Loop v5
// Orchestrates multi-provider LLM calls, token management,
// hierarchical code indexing, exploration gating,
// checkpoints, error feedback, loop detection,
// and continuous mode.
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
import { parseStructuredOutput, parseFileChanges, parseShellCommandsFromFreeText } from '../modes/prompts.js';
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
import { checkRateLimitAndFallback, extractErrorHeaders } from './loop/cooldownManager.js';
import { TimingService } from './loop/timingService.js';
import { DatasetBuilder } from './loop/datasetBuilder.js';
import { adaptPromptForModel } from '../modes/modelPromptAdapter.js';
import { OllamaHealthMonitor } from '../ollama/healthMonitor.js';
import { ToolExecutor } from './loop/toolExecutor.js';
import { HierarchicalCodeIndex } from './indexer/hierarchicalIndex.js';
import { checkExplorationGate, storeArchitectureSummary, extractArchitectureSummary } from './loop/explorationGate.js';
import { switchModel as switchModelFn, handle404ModelNotFound, handleRateLimit as handleRateLimitSwitch, shouldResetToOriginalModel } from './loop/modelSwitcher.js';
import { drainMessageQueue, formatQueuedMessages, buildLoopBreakoutTask as buildLoopBreakout, isFailedResponse, type QueuedMessage } from './loop/messageAssembly.js';
import { appConfig } from '../../config.js';

type EventCallback = (event: any) => void;

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
  // v4 services
  private timingService: TimingService;
  private datasetBuilder: DatasetBuilder | null = null;
  private ollamaHealthMonitor: OllamaHealthMonitor | null = null;
  private toolExecutor: ToolExecutor;
  // v5 services — hierarchical index + exploration gate
  private hierarchicalIndex: HierarchicalCodeIndex;
  private depGraphContext = '';
  private moduleClusterContext = '';
  private explorationContext = '';
  private totalCodeFiles = 0;

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
    // v4 services
    this.timingService = new TimingService();
    this.toolExecutor = new ToolExecutor(config.projectRoot);
    // v5 services
    this.hierarchicalIndex = new HierarchicalCodeIndex(db);

    // Start Ollama health monitor if provider is ollama
    if (config.provider === 'ollama') {
      try {
        const ollamaRow = db.prepare(
          "SELECT base_url FROM provider_configs WHERE provider_id = 'ollama' AND enabled = 1"
        ).get() as any;
        const ollamaUrl = ollamaRow?.base_url || 'http://localhost:11434';
        this.ollamaHealthMonitor = new OllamaHealthMonitor(ollamaUrl);
        this.ollamaHealthMonitor.startMonitoring(30_000);
      } catch { /* non-critical */ }
    }

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

  /**
   * Switch to a different model — delegates to extracted modelSwitcher module.
   */
  private switchModel(newModelId: string, reason: string): void {
    const result = switchModelFn(
      this.config.model, this.config.provider, this.contextWindow,
      newModelId, reason, (e) => this.emit(e),
    );
    this.config.model = result.newModel;
    this.config.provider = result.newProvider;
    this.contextWindow = result.newContextWindow;
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
  private drainQueue(): QueuedMessage[] {
    const result = drainMessageQueue(this.messageQueue);
    this.messageQueue = result.remaining;
    return result.messages;
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

    // Initialize persistent logger + dataset builder
    try {
      this.logWriter = new LogWriter(this.config.projectRoot);
      this.logWriter.logSummary('=== Agent Run Started === Task: ' + initialTask.slice(0, 100) + ' | Model: ' + this.config.model + ' | Context: ' + this.contextWindow);
      this.emit({ type: 'info', message: 'Logs: ' + this.logWriter.getLogDir() });
    } catch (err: any) { this.emit({ type: 'info', message: 'Log writer init failed: ' + err.message }); }
    try {
      this.datasetBuilder = new DatasetBuilder(this.config.projectRoot);
    } catch (err: any) { this.emit({ type: 'info', message: 'Dataset builder init failed: ' + err.message }); }

    // Reset timing service for new run
    this.timingService.reset();

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
        hierarchicalIndex: this.hierarchicalIndex,
      },
      (e) => this.emit(e),
    );

    this.projectLanguages = setup.projectLanguages;
    this.platformInfo = setup.platformInfo;
    this.platformContext = setup.platformContext;
    this.relationshipContext = setup.relationshipContext;
    this.tierContext = setup.tierContext;
    this.logHealthContext = setup.logHealthContext;
    this.depGraphContext = setup.depGraphContext;
    this.moduleClusterContext = setup.moduleClusterContext;
    this.totalCodeFiles = setup.totalCodeFiles;
    let codebaseOverview = setup.codebaseOverview;

    if ((this.config.checkpointEvery || 0) > 0) {
      try {
        this.checkpoint.initGit(this.config.projectRoot);
        this.checkpoint.createCheckpoint(this.config.projectRoot, projectId, this.runId, 0, 'Agent start: ' + initialTask.slice(0, 100));
        this.emit({ type: 'info', message: 'Initial checkpoint created' });
      } catch (err: any) {
        this.emit({ type: 'info', message: 'Checkpoint init: ' + err.message });
      }
    } else {
      this.emit({ type: 'info', message: 'Checkpointing disabled (checkpointEvery=0)' });
    }

    // ── Main Loop ──
    let currentTask = initialTask;
    const effectiveMaxIterations = this.config.continuousMode ? Infinity : this.config.maxIterations;
    // Store the original model so we can retry it after rate-limit windows reset
    const originalModel = this.config.model;
    let lastModelResetCheck = Date.now();

    if (this.config.continuousMode) this.emit({ type: 'continuous_mode', enabled: true, cooldownMs: this.config.cooldownMs || 0 } as any);
    if (this.config.bypassRateLimits) this.emit({ type: 'rate_limit_bypass', enabled: true } as any);
    if (this.config.enableSmartChunking) this.emit({ type: 'info', message: 'Smart chunking pipeline ENABLED' });

    while (
      this.currentIteration < effectiveMaxIterations &&
      this.state !== 'complete' &&
      this.state !== 'error' &&
      !this.abortController.signal.aborted
    ) {
      try {
        while ((this.state as string) === 'paused' && !this.abortController.signal.aborted) {
          await this.delay(200);
        }
        if (this.abortController.signal.aborted || (this.state as string) === 'complete' || (this.state as string) === 'error') {
          break;
        }

        this.currentIteration++;

        // Get LLM Client
        const client = getClientFromDb(this.db, this.config.provider);
        if (!client) {
          this.setState('error');
          this.emit({ type: 'error', error: 'No credentials for ' + this.config.provider + '. Please configure the provider.' });
          break;
        }

        // Rate Limit Check (skip if bypassed, but still respect cooldowns)
        if (!this.config.bypassRateLimits) {
          // Periodically try to switch back to original model (every 2 minutes)
          if (shouldResetToOriginalModel(this.config.model, originalModel, lastModelResetCheck, 120_000, rateLimiter)) {
            lastModelResetCheck = Date.now();
            this.emit({ type: 'info', message: 'Rate limit window reset — switching back to primary model: ' + originalModel });
            this.switchModel(originalModel, 'Rate limit window reset — returning to primary');
          }

          const canProceed = rateLimiter.canRequest(this.config.model, 'agent');
          if (!canProceed.allowed) {
            // Try ordered fallback chain first, then smart headroom-based fallback
            const fallback = canProceed.fallbackModel
              || rateLimiter.findFallback(this.config.model, 'agent', this.config.fallbackModels);
            if (fallback) {
              this.emit({ type: 'auto_answer', question: 'Rate limited on ' + this.config.model, answer: 'Switching to ' + fallback });
              this.switchModel(fallback, 'Rate limited (pre-call check)');
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

        // ── Exploration Gate (v5) — force agent to read before writing ──
        const explorationResult = checkExplorationGate({
          currentIteration: this.currentIteration,
          totalCodeFiles: this.totalCodeFiles,
          projectRoot: this.config.projectRoot,
          projectId: projectId,
          userTask: currentTask,
          codeIndex: this.hierarchicalIndex,
          memory: this.memory,
        });
        if (explorationResult.explorationPrompt) {
          currentTask = explorationResult.explorationPrompt;
          this.emit({ type: 'info', message: '🔍 Exploration gate: forcing codebase scan before writing' });
        }
        if (explorationResult.architectureSummary) {
          this.explorationContext = explorationResult.architectureSummary;
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
          depGraphContext: this.depGraphContext,
          moduleClusterContext: this.moduleClusterContext,
          explorationContext: this.explorationContext,
        }, {
          memory: this.memory,
          checkpoint: this.checkpoint,
          analyzer: this.analyzer,
          codeIndexer: this.codeIndexer,
          hierarchicalIndex: this.hierarchicalIndex,
        });

        const messages = assembled.messages;

        // ── Adapt system prompt for model capabilities ──
        // Canvas illusion for local/small models, reasoning mode for o3/deepseek, etc.
        if (messages.length > 0 && messages[0].role === 'system') {
          messages[0].content = adaptPromptForModel(
            messages[0].content,
            this.config.model,
            this.contextWindow,
          );
        }

        // Append conversation history (extracted to loop/contextAssembly.ts)
        appendHistory(messages, this.conversationId, this.contextWindow, this.memory);

        // ── Drain queued user messages ──
        const queuedMsgs = this.drainQueue();
        if (queuedMsgs.length > 0) {
          this.emit({ type: 'info', message: 'Processing ' + queuedMsgs.length + ' queued user message(s)' });
          for (const qm of queuedMsgs) {
            this.memory.addMessage(this.conversationId, 'user', '[Queued] ' + qm.content, this.config.model, 'agent');
          }
          currentTask = currentTask + formatQueuedMessages(queuedMsgs);
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

          // Use extracted breakout prompt builder (includes schema re-injection)
          currentTask = buildLoopBreakout(
            this.config.projectRoot,
            initialTask,
            loopCheck.pattern || 'Repeated pattern',
            codebaseOverview,
            this.loopBreakoutAttempts,
          );

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
          const timingCallId = this.timingService.startCall(this.config.model, this.currentIteration);
          let llmCallSucceeded = false;
          try {
            response = await completeChatResponse(client, this.config.model, messages, {
              temperature: 0.3,
              maxTokens: this.config.maxTokensPerStep,
            });
            llmCallSucceeded = true;
          } catch (err: any) {
            // Cancel timing on error
            this.timingService.cancelCall();
            // Extract status code from OpenAI SDK error
            const statusCode = err?.status || err?.statusCode || (err?.error?.status);

            // Extract rate-limit headers from error response (extracted to cooldownManager.ts)
            const parsedHeaders = extractErrorHeaders(err);

            // Record the failed request in rate limiter WITH error headers
            rateLimiter.recordEnd(this.config.model, {
              statusCode,
              headers: parsedHeaders,
              success: false,
            });

            // ── Handle 404 — Model not found (extracted to modelSwitcher.ts) ──
            if (statusCode === 404) {
              const fallback = handle404ModelNotFound(
                this.config.model, this.config.fallbackModels, rateLimiter, (e) => this.emit(e),
              );
              if (fallback) {
                this.switchModel(fallback, '404 model not found (blacklisted)');
              } else {
                this.setState('error');
                this.emit({ type: 'error', error: 'All models returning 404. Cannot proceed.' });
                break;
              }
              continue;
            }

            // ── Handle 429/403 Rate Limits (extracted to modelSwitcher.ts) ──
            if (statusCode === 429 || statusCode === 403) {
              const rl = handleRateLimitSwitch(
                this.config.model, statusCode, this.config.fallbackModels, rateLimiter, (e) => this.emit(e),
              );
              if (rl.fallback) {
                this.switchModel(rl.fallback, `Rate limited (${statusCode})`);
              } else {
                await this.delay(rl.waitMs);
              }
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
            // End timing and emit timing event
            this.timingService.endCall(timingCallId, {
              tokensUsed: response.usage?.total_tokens || 0,
              success: true,
            });
            this.emit({ type: 'timing_update', timing: this.timingService.formatForEvent() });
          }
        }

        // ── Process Response (extracted to loop/responseProcessing.ts) ──
        const content = response.content || '';
        this.totalTokens += response.usage?.total_tokens || 0;

        // Only store productive responses in memory
        const failedResp = isFailedResponse(content);
        if (!failedResp) {
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

        // ── Extract architecture summary after exploration gate iteration ──
        if (this.currentIteration === 1 && this.totalCodeFiles >= 3) {
          const archSummary = extractArchitectureSummary(content);
          if (archSummary) {
            storeArchitectureSummary(this.memory, projectId, this.conversationId, archSummary);
            this.explorationContext = archSummary;
            this.emit({ type: 'info', message: '📐 Architecture summary captured (' + archSummary.length + ' chars)' });
          }
        }

        // ── Record in Dataset Builder for NANO Training ──
        try {
          this.datasetBuilder?.recordIteration({
            task: currentTask.slice(0, 8000),
            response: content.slice(0, 16000),
            model: this.config.model,
            provider: this.config.provider,
            iteration: this.currentIteration,
            runId: this.runId,
            structured,
            filesChanged: fileChangesCount,
            errors: this.lastErrorContext,
            isFailedResponse: failedResp,
          });
          this.emit({ type: 'dataset_update', dataset: this.datasetBuilder?.formatForEvent() });
        } catch { /* non-critical */ }

        // ── Execute Agent Commands via ToolExecutor ──
        const commandsToRun = structured?.commands && structured.commands.length > 0
          ? structured.commands
          : parseShellCommandsFromFreeText(content); // fallback: freeform code blocks (local models)
        if (commandsToRun.length > 0) {
          try {
            this.emit({ type: 'info', message: 'Executing ' + commandsToRun.length + ' agent command(s)...' });
            const { results, formattedForLLM } = await this.toolExecutor.executeCommands(
              commandsToRun,
              (e: any) => this.emit(e),
            );
            if (formattedForLLM) {
              currentTask = (currentTask || '') + '\n\n' + formattedForLLM;
            }
            this.emit({ type: 'info', message: 'Commands complete: ' + results.filter(r => r.success).length + '/' + results.length + ' succeeded' });
          } catch (cmdErr: any) {
            this.emit({ type: 'info', message: 'Command execution error: ' + cmdErr.message });
          }
        }

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

          // ── Self-Reflection (every 10 iterations or when done) ──
          if (structured.done || (this.currentIteration > 1 && this.currentIteration % 10 === 0)) {
            this.emit({ type: 'info', message: '🔍 Self-reflection at iteration ' + this.currentIteration });
            currentTask = [
              'SELF-REFLECTION: Iterations=' + this.currentIteration + ' Files=' + this.totalFilesChanged + ' Tokens=' + this.totalTokens,
              'Confidence: ' + (structured.confidence || 'N/A') + ' Summary: ' + (structured.summary || '').slice(0, 200),
              this.lastErrorContext ? 'Errors:\n' + this.lastErrorContext.slice(0, 400) : 'No errors',
              this.lastTestContext ? 'Tests:\n' + this.lastTestContext.slice(0, 200) : '',
              'Check: bugs? edge cases? clean code? TODOs?',
              structured.done ? 'Is the task TRULY complete, or marking done prematurely?' : '',
              'Set done=false if issues found.',
            ].filter(Boolean).join('\n') + '\n\n' + (currentTask || '');
          }

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
              await this.delay(Math.max(this.config.cooldownMs || 0, 10000));
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
            this.switchModel(fallback, 'Provider unreachable — connection error');
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

      // Cooldown between iterations (24/7 mode) — re-read config each iteration
      const iterationCooldown = this.config.cooldownMs || 0;
      if (iterationCooldown > 0 && (this.state as string) !== 'complete') {
        this.emit({ type: 'cooldown', ms: iterationCooldown, reason: 'Cooldown between iterations' } as any);
        await this.delay(iterationCooldown);
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

    // ── Finalize services at end of run ──
    try { this.datasetBuilder?.finalize(); } catch { /* non-critical */ }
    try { this.ollamaHealthMonitor?.destroy(); } catch { /* non-critical */ }
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
    // Finalize dataset builder — flush remaining pairs to disk
    try { this.datasetBuilder?.finalize(); } catch { /* non-critical */ }
    // Destroy Ollama health monitor polling
    try { this.ollamaHealthMonitor?.destroy(); } catch { /* non-critical */ }
    // Destroy tool executor terminal sessions
    try { this.toolExecutor?.destroy(); } catch { /* non-critical */ }
    // Reset timing service
    this.timingService.reset();
    // Clean up LogBloatManager flush interval to prevent leaks
    this.logManager.destroy();
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
