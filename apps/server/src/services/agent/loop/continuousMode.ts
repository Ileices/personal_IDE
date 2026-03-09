// ============================================
// Continuous Mode & Completion — Handle 24/7 mode, done detection,
// task tracker updates, completion notes
// Extracted from enhancedLoop.ts for <1000 LOC compliance
// ============================================
import type { StructuredAgentOutput } from '@personal-ide/shared';
import type { MemoryService } from '../../memory/index.js';
import type { CheckpointService } from '../../checkpoint/index.js';
import type { CodebaseAnalyzer } from '../../analysis/codebase.js';
import { buildAutoAnswer } from './autoAnswers.js';

type EmitFn = (event: any) => void;

export interface CompletionConfig {
  continuousMode: boolean;
  cooldownMs: number;
  autoAnswerQuestions: boolean;
  projectRoot: string;
}

export interface CompletionContext {
  projectId: string;
  conversationId: string;
  runId: string;
  currentIteration: number;
  totalFilesChanged: number;
  totalTokens: number;
  initialTask: string;
  codebaseOverview: string;
  projectLanguages: string[];
  tierContext: string;
  taskId?: string;
  /** Last lint error context from previous cycle */
  lastErrorContext?: string;
  /** Last test result context from previous cycle */
  lastTestContext?: string;
}

/**
 * Handle questions from structured output: log them, auto-answer if enabled.
 * Returns auto-answered context string for injection into next iteration.
 */
export function handleQuestions(
  structured: StructuredAgentOutput,
  pendingQuestions: string[],
  ctx: CompletionContext,
  config: CompletionConfig,
  services: { memory: MemoryService },
  emit: EmitFn,
): string {
  const questions = structured.questionsForUser || [];
  let autoAnsweredContext = '';

  for (const q of questions) {
    pendingQuestions.push(q);
    services.memory.logQuestion(ctx.projectId, q, ctx.runId);
    emit({ type: 'question_logged', question: q });
  }

  if (config.autoAnswerQuestions && questions.length > 0) {
    for (const q of questions) {
      const answer = buildAutoAnswer(q, {
        codebaseOverview: ctx.codebaseOverview,
        task: ctx.initialTask,
        projectLanguages: ctx.projectLanguages,
        tierContext: ctx.tierContext,
      });
      emit({ type: 'auto_answer', question: q, answer });
      autoAnsweredContext += '\nQ: ' + q + '\nA: ' + answer;
    }
  }

  return autoAnsweredContext;
}

/**
 * Store step note in memory after processing structured output.
 */
export function storeStepNote(
  structured: StructuredAgentOutput,
  ctx: CompletionContext,
  services: { memory: MemoryService },
): void {
  services.memory.addNote(ctx.projectId, {
    projectId: ctx.projectId,
    source: 'agent_log',
    category: 'agent_step',
    title: 'Step ' + ctx.currentIteration + ': ' + structured.summary.slice(0, 100),
    content: structured.summary,
    tags: ['agent', 'step-' + ctx.currentIteration, 'run-' + ctx.runId],
    relatedFiles: (structured.filesChanged || []).map(f => f.path),
    importance: 60,
    conversationId: ctx.conversationId,
  });
}

/**
 * Update task tracker subtasks based on structured output progress.
 */
export function updateTaskTracker(
  structured: StructuredAgentOutput,
  taskId: string | undefined,
  services: { analyzer: CodebaseAnalyzer },
): void {
  if (!taskId || structured.done !== false || (structured.nextSteps || []).length === 0) return;

  try {
    const tracker = services.analyzer.getTaskTracker(taskId) as any;
    if (tracker) {
      const subtasks = typeof tracker.subtasks === 'string'
        ? JSON.parse(tracker.subtasks)
        : (tracker.subtasks || []);
      const currentIdx = subtasks.findIndex((s: any) => s.status === 'in_progress');
      if (currentIdx >= 0) {
        services.analyzer.updateSubtask(taskId, currentIdx, { status: 'completed' });
      }
      const nextIdx = subtasks.findIndex((s: any) => s.status === 'pending');
      if (nextIdx >= 0) {
        services.analyzer.updateSubtask(taskId, nextIdx, { status: 'in_progress' });
      }
    }
  } catch { /* ignore */ }
}

/**
 * Handle task completion: create checkpoint, store note, emit event.
 * Returns the next task string for continuous mode, or null to break.
 */
export function handleCompletion(
  structured: StructuredAgentOutput,
  ctx: CompletionContext,
  config: CompletionConfig,
  services: { memory: MemoryService; checkpoint: CheckpointService },
  emit: EmitFn,
): string | null {
  try {
    services.checkpoint.createCheckpoint(
      config.projectRoot, ctx.projectId, ctx.runId,
      ctx.currentIteration, 'COMPLETED: ' + ctx.initialTask.slice(0, 100)
    );
  } catch { /* ignore */ }

  const completionNote = 'Task: ' + ctx.initialTask + '\nSummary: ' + structured.summary +
    '\nSteps: ' + ctx.currentIteration + '\nFiles Changed: ' + ctx.totalFilesChanged +
    '\nTokens: ' + ctx.totalTokens;
  const isContinuous = config.continuousMode;

  emit({
    type: 'run_complete',
    summary: (isContinuous ? 'Task cycle complete: ' : '') + structured.summary,
    totalSteps: ctx.currentIteration,
  });

  services.memory.addNote(ctx.projectId, {
    projectId: ctx.projectId, source: 'auto_summary', category: 'task_complete',
    title: (isContinuous ? 'Cycle Complete: ' : 'Completed: ') + ctx.initialTask.slice(0, 100),
    content: completionNote,
    tags: isContinuous ? ['completed', 'summary', 'continuous-mode'] : ['completed', 'summary'],
    relatedFiles: (structured.filesChanged || []).map(f => f.path),
    importance: 90, conversationId: ctx.conversationId,
  });

  if (isContinuous) {
    emit({ type: 'info', message: '24/7 mode: Task cycle complete. Scanning for improvements...' });

    // Dynamic review prompt — gives the model specific things to look for
    const reviewParts = [
      'The previous task is complete. You are in 24/7 continuous mode.',
      '',
      '## REVIEW CHECKLIST — Scan the project for:',
      '1. **TODO/FIXME comments** — Find and resolve them',
      '2. **Lint/type errors** — Run checks and fix any issues',
      '3. **Missing tests** — Add unit tests for untested code paths',
      '4. **Error handling gaps** — Add try/catch, input validation, null checks',
      '5. **Performance issues** — Optimize hot paths, reduce bundle size',
      '6. **Dead code** — Remove unused imports, functions, variables',
      '7. **Security concerns** — Fix hardcoded secrets, XSS vectors, injection risks',
      '8. **Documentation** — Add JSDoc to exported functions missing it',
      '',
      `Previous cycle stats: ${ctx.currentIteration} iterations, ` +
        `${ctx.totalFilesChanged} files changed, ${ctx.totalTokens} tokens used.`,
    ];

    // Inject real lint errors if we have them
    if (ctx.lastErrorContext) {
      reviewParts.push('');
      reviewParts.push('## 🔴 KNOWN LINT/TYPE ERRORS FROM PREVIOUS CYCLE:');
      reviewParts.push(ctx.lastErrorContext.slice(0, 2000));
      reviewParts.push('Fix these FIRST before scanning for new issues.');
    }

    // Inject real test failures if we have them
    if (ctx.lastTestContext) {
      reviewParts.push('');
      reviewParts.push('## 🧪 TEST RESULTS FROM PREVIOUS CYCLE:');
      reviewParts.push(ctx.lastTestContext.slice(0, 1500));
      if (ctx.lastTestContext.toLowerCase().includes('fail')) {
        reviewParts.push('Fix failing tests FIRST before moving on.');
      }
    }

    reviewParts.push('');
    reviewParts.push('DO NOT mark done=true unless there is genuinely nothing left to improve.');
    reviewParts.push('Focus on the HIGHEST IMPACT improvements first.');

    return reviewParts.join('\n');
  }

  return null; // Signal to break the loop
}
