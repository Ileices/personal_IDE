// ============================================
// Agent Loop - Autonomous coding state machine
// ============================================
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import type { AgentConfig, AgentState, AgentRunStatus, StructuredAgentOutput, AgentStep } from '@personal-ide/shared';
import { getClientFromDb } from '../llm/client.js';
import { completeChatResponse } from '../llm/streaming.js';
import { rateLimiter } from '../llm/rateLimiter.js';
import { MemoryService } from '../memory/index.js';
import { SYSTEM_PROMPTS, parseStructuredOutput, parseFileChanges } from '../modes/prompts.js';
import { writeFile, readFile, listAllFiles } from '../filesystem/index.js';

type EventCallback = (event: any) => void;

export class AgentLoop {
  private state: AgentState = 'idle';
  private runId: string = '';
  private currentIteration = 0;
  private totalTokens = 0;
  private totalFilesChanged = 0;
  private pendingQuestions: string[] = [];
  private abortController: AbortController | null = null;
  private listeners: EventCallback[] = [];
  private memory: MemoryService;
  private conversationId: string = '';

  constructor(
    private db: Database.Database,
    private config: AgentConfig
  ) {
    this.memory = new MemoryService(db);
  }

  /** Subscribe to agent events */
  onEvent(callback: EventCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private emit(event: any): void {
    for (const listener of this.listeners) {
      try { listener(event); } catch { /* ignore listener errors */ }
    }
  }

  private setState(newState: AgentState): void {
    this.state = newState;
    this.emit({ type: 'state_change', state: newState });
  }

  /** Get current status */
  getStatus(): AgentRunStatus {
    return {
      runId: this.runId,
      projectId: this.config.projectRoot,
      state: this.state,
      currentIteration: this.currentIteration,
      maxIterations: this.config.maxIterations,
      totalFilesChanged: this.totalFilesChanged,
      totalTokensUsed: this.totalTokens,
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      pendingQuestions: this.pendingQuestions,
    };
  }

  /** Start the agent loop */
  async start(projectId: string, initialTask: string): Promise<void> {
    if (this.state !== 'idle' && this.state !== 'complete' && this.state !== 'error') {
      throw new Error(`Cannot start: agent is ${this.state}`);
    }

    this.runId = uuid();
    this.currentIteration = 0;
    this.totalTokens = 0;
    this.totalFilesChanged = 0;
    this.pendingQuestions = [];
    this.abortController = new AbortController();

    // Create a conversation for this run
    this.conversationId = this.memory.createConversation(
      projectId, `Agent: ${initialTask.slice(0, 50)}`, 'agent', this.config.model
    );

    // Log the run
    this.db.prepare(
      'INSERT INTO agent_runs (id, project_id, conversation_id, task, started_at) VALUES (?, ?, ?, ?, datetime(\'now\'))'
    ).run(this.runId, projectId, this.conversationId, initialTask);

    // Start the loop
    this.setState('planning');

    let currentTask = initialTask;

    while (
      this.currentIteration < this.config.maxIterations &&
      this.state !== 'complete' &&
      this.state !== 'error' &&
      !this.abortController.signal.aborted
    ) {
      try {
        this.currentIteration++;

        // Get LLM client
        const client = getClientFromDb(this.db);
        if (!client) {
          this.setState('error');
          this.emit({ type: 'error', error: 'Not authenticated. Please log in.' });
          break;
        }

        // Check rate limits
        const canProceed = rateLimiter.canRequest(this.config.model);
        if (!canProceed.allowed) {
          // Try fallback model
          const fallback = rateLimiter.findFallback(this.config.model, 'agent');
          if (fallback) {
            this.emit({ type: 'auto_answer', question: `Rate limited on ${this.config.model}`, answer: `Switching to ${fallback}` });
            this.config.model = fallback;
          } else {
            this.emit({ type: 'paused', reason: `Rate limited: ${canProceed.reason}. Will retry.` });
            await this.delay(canProceed.retryAfterMs || 60000);
            continue;
          }
        }

        // Build memory context
        const memoryContext = this.memory.buildMemoryContext(projectId, currentTask);

        // Build messages
        const systemPrompt = SYSTEM_PROMPTS.agent(memoryContext);
        const messages: any[] = [
          { role: 'system', content: systemPrompt },
        ];

        // Add codebase overview
        const allFiles = listAllFiles(this.config.projectRoot);
        messages.push({
          role: 'system',
          content: `PROJECT FILES:\n${allFiles.join('\n')}`,
        });

        // Add conversation history (last 10 messages)
        const history = this.memory.getMessages(this.conversationId);
        const recentHistory = history.slice(-10);
        for (const msg of recentHistory) {
          messages.push({ role: msg.role, content: msg.content });
        }

        // Add current task
        messages.push({ role: 'user', content: currentTask });

        // Record the user message
        this.memory.addMessage(this.conversationId, 'user', currentTask, this.config.model, 'agent');

        this.setState('executing');
        this.emit({ type: 'step_start', step: { stepNumber: this.currentIteration, action: currentTask, target: '', detail: '', priority: 'high' as const }, iteration: this.currentIteration });

        // Call LLM
        rateLimiter.recordStart(this.config.model);
        let response;
        try {
          response = await completeChatResponse(client, this.config.model, messages, {
            temperature: 0.3,
            maxTokens: this.config.maxTokensPerStep,
          });
        } finally {
          rateLimiter.recordEnd(this.config.model);
        }

        const content = response.content;
        this.totalTokens += response.usage?.total_tokens || 0;

        // Record assistant message
        this.memory.addMessage(this.conversationId, 'assistant', content, this.config.model, 'agent');

        this.emit({ type: 'step_content', delta: content });

        // Parse structured output
        this.setState('evaluating');
        const structured = parseStructuredOutput(content) as StructuredAgentOutput | null;

        // Parse and apply file changes
        const fileChanges = parseFileChanges(content);
        for (const change of fileChanges) {
          try {
            writeFile(this.config.projectRoot, change.path, change.content, true);
            this.totalFilesChanged++;
            this.emit({ type: 'file_changed', change: { path: change.path, action: 'modified', summary: `Updated by agent` } });
          } catch (err: any) {
            this.emit({ type: 'error', error: `Failed to write ${change.path}: ${err.message}` });
          }
        }

        if (structured) {
          this.emit({ type: 'step_complete', output: structured });

          // Log questions
          const questions = structured.questionsForUser || [];
          for (const q of questions) {
            this.pendingQuestions.push(q);
            this.memory.logQuestion(projectId, q, this.runId);
            this.emit({ type: 'question_logged', question: q });
          }

          // Auto-answer questions if enabled
          if (this.config.autoAnswerQuestions && questions.length > 0) {
            for (const q of questions) {
              this.emit({ type: 'auto_answer', question: q, answer: 'Auto-resolved: proceeding with best practices.' });
            }
          }

          // Auto-save summary as memory note
          this.memory.addNote(projectId, {
            projectId,
            source: 'agent_log',
            category: 'agent_step',
            title: `Step ${this.currentIteration}: ${structured.summary.slice(0, 100)}`,
            content: structured.summary,
            tags: ['agent', `step-${this.currentIteration}`],
            relatedFiles: (structured.filesChanged || []).map(f => f.path),
            importance: 60,
            conversationId: this.conversationId,
          });

          // Check if done
          if (structured.done) {
            this.setState('complete');
            this.emit({ type: 'run_complete', summary: structured.summary, totalSteps: this.currentIteration });

            // Save final summary as high-importance memory
            this.memory.addNote(projectId, {
              projectId,
              source: 'auto_summary',
              category: 'task_complete',
              title: `Completed: ${initialTask.slice(0, 100)}`,
              content: `Task: ${initialTask}\n\nFinal Summary: ${structured.summary}\nSteps: ${this.currentIteration}\nFiles Changed: ${this.totalFilesChanged}`,
              tags: ['completed', 'summary'],
              relatedFiles: (structured.filesChanged || []).map(f => f.path),
              importance: 90,
              conversationId: this.conversationId,
            });

            break;
          }

          // Build next task from next steps
          if ((structured.nextSteps || []).length > 0) {
            currentTask = structured.nextSteps
              .map(s => `${s.stepNumber}. ${s.action}: ${s.detail} (target: ${s.target})`)
              .join('\n');
          } else {
            currentTask = 'Continue with the implementation. Review what has been done and identify what remains.';
          }
        } else {
          // No structured output - try to continue
          currentTask = 'Continue with the implementation. Remember to include the structured JSON output block at the end of your response.';
        }

        // Delay between steps
        await this.delay(this.config.stepDelayMs);

      } catch (err: any) {
        this.setState('error');
        this.emit({ type: 'error', error: err.message });

        // Log error
        this.db.prepare(
          'UPDATE agent_runs SET final_state = ?, summary = ?, completed_at = datetime(\'now\'), iterations = ?, total_tokens = ? WHERE id = ?'
        ).run('error', `Error: ${err.message}`, this.currentIteration, this.totalTokens, this.runId);

        break;
      }
    }

    // Final log
    if (this.state !== 'error') {
      this.db.prepare(
        'UPDATE agent_runs SET final_state = ?, iterations = ?, total_tokens = ?, completed_at = datetime(\'now\') WHERE id = ?'
      ).run(this.state, this.currentIteration, this.totalTokens, this.runId);
    }
  }

  /** Pause the loop */
  pause(): void {
    if (this.state === 'executing' || this.state === 'evaluating' || this.state === 'planning') {
      this.setState('paused');
    }
  }

  /** Resume the loop */
  resume(): void {
    if (this.state === 'paused') {
      this.setState('executing');
    }
  }

  /** Stop the loop */
  stop(): void {
    this.abortController?.abort();
    this.setState('complete');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
