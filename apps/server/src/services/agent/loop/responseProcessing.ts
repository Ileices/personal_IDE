// ============================================
// Response Processing — Handle LLM response, apply file changes
// Extracted from enhancedLoop.ts for <1000 LOC compliance
// ============================================
import { v4 as uuid } from 'uuid';
import { estimateTokens } from '../../llm/providers.js';
import { parseStructuredOutput, parseFileChanges } from '../../modes/prompts.js';
import { writeFile } from '../../filesystem/index.js';
import { runAllLintChecks, runTests, formatErrorsForLLM, formatTestsForLLM } from '../../errors/detector.js';
import type { StructuredAgentOutput } from '@personal-ide/shared';
import type Database from 'better-sqlite3';
import type { MemoryService } from '../../memory/index.js';
import type { CheckpointService } from '../../checkpoint/index.js';
import type { CodebaseAnalyzer } from '../../analysis/codebase.js';
import type { ConversationIndexer } from '../../analysis/conversationIndexer.js';
import type { LoopDetector } from '../loopDetector.js';
import type { LogWriter } from '../logWriter.js';
import { appConfig } from '../../../config.js';

type EmitFn = (event: any) => void;

export interface ResponseContext {
  db: Database.Database;
  config: {
    model: string;
    provider: string;
    projectRoot: string;
    autoFixErrors: boolean;
    autoRunTests: boolean;
    checkpointEvery: number;
    taskId?: string;
    maxTokensPerStep: number;
  };
  projectId: string;
  conversationId: string;
  runId: string;
  currentIteration: number;
  contextWindow: number;
}

export interface ResponseServices {
  memory: MemoryService;
  checkpoint: CheckpointService;
  analyzer: CodebaseAnalyzer;
  conversationIndexer: ConversationIndexer;
  loopDetector: LoopDetector;
  logWriter: LogWriter | null;
}

export interface ResponseResult {
  structured: StructuredAgentOutput | null;
  fileChangesCount: number;
  lastErrorContext: string;
  lastTestContext: string;
  conversationIndexContext: string;
}

/**
 * Process an LLM response: parse structured output, apply file changes,
 * run lint checks, run tests, create checkpoints.
 */
export function processResponse(
  content: string,
  currentTask: string,
  response: any,
  ctx: ResponseContext,
  services: ResponseServices,
  emit: EmitFn,
): ResponseResult {
  let lastErrorContext = '';
  let lastTestContext = '';
  let conversationIndexContext = '';

  // Record in loop detector
  try {
    services.loopDetector.record(
      ctx.currentIteration, currentTask, content, content.slice(0, 300)
    );
  } catch { /* non-critical */ }

  // Log the LLM call to persistent file
  try {
    services.logWriter?.logLLMCall({
      model: ctx.config.model,
      provider: ctx.config.provider,
      iteration: ctx.currentIteration,
      promptTokens: response.usage?.prompt_tokens || estimateTokens(currentTask),
      completionTokens: response.usage?.completion_tokens || estimateTokens(content),
      totalTokens: response.usage?.total_tokens || 0,
      taskSnippet: currentTask.slice(0, 500),
      responseSnippet: content.slice(0, 500),
    });
  } catch { /* non-critical */ }

  // Bird-feed observation to Nano trainer (fire-and-forget)
  try {
    const nanoRow = ctx.db.prepare(
      "SELECT base_url FROM provider_configs WHERE provider_id = 'nano' AND enabled = 1"
    ).get() as any;
    const nanoBaseUrl = (nanoRow?.base_url || appConfig.services.nanoSeaUrl).replace(/\/v1\/?$/, '');
    fetch(nanoBaseUrl + '/v1/training/observe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: currentTask.slice(0, 4000),
        response: content.slice(0, 8000),
        source: 'agent',
        quality: 0.8,
      }),
    }).catch(() => {});
  } catch { /* non-critical */ }

  // Index conversation messages
  try {
    services.conversationIndexer.indexMessage(ctx.projectId, ctx.conversationId, 'user-' + ctx.currentIteration, currentTask, 'user');
    services.conversationIndexer.indexMessage(ctx.projectId, ctx.conversationId, 'assistant-' + ctx.currentIteration, content, 'assistant');
    conversationIndexContext = services.conversationIndexer.buildIndexedContext(ctx.projectId, currentTask, Math.floor(ctx.contextWindow * 0.05));
  } catch { /* non-critical */ }

  // Parse structured output & file changes
  let structured = parseStructuredOutput(content) as StructuredAgentOutput | null;
  const fileChanges = parseFileChanges(content);

  // Guard: ensure required fields
  if (structured) {
    structured.summary = structured.summary || 'Step ' + ctx.currentIteration + ' completed';
    structured.filesChanged = structured.filesChanged || [];
    structured.nextSteps = structured.nextSteps || [];
    structured.questionsForUser = structured.questionsForUser || [];
    if (typeof structured.done !== 'boolean') structured.done = false;
    if (typeof structured.confidence !== 'number') structured.confidence = 50;
  }

  // Apply file changes
  let fileChangesCount = 0;
  for (const change of fileChanges) {
    try {
      writeFile(ctx.config.projectRoot, change.path, change.content, true);
      fileChangesCount++;
      emit({ type: 'file_changed', change: { path: change.path, action: 'modified', summary: 'Updated by agent' } });

      try {
        ctx.db.prepare(
          "INSERT INTO code_edit_log (id, project_id, file_path, edit_type, symbols_affected, change_reason, agent_run_id, created_at) VALUES (?, ?, ?, 'modify', '[]', ?, ?, datetime('now'))"
        ).run(uuid(), ctx.projectId, change.path, 'Agent step ' + ctx.currentIteration, ctx.runId);
      } catch { /* non-critical */ }
    } catch (err: any) {
      emit({ type: 'error', error: 'Failed to write ' + change.path + ': ' + err.message });
    }
  }

  // Auto Error Detection
  if (ctx.config.autoFixErrors && fileChangesCount > 0) {
    try {
      const errors = runAllLintChecks(ctx.config.projectRoot);
      if (errors.length > 0) {
        lastErrorContext = formatErrorsForLLM(errors);
        emit({ type: 'errors_detected', count: errors.length, errors: errors.slice(0, 10) });
      } else {
        emit({ type: 'info', message: 'No lint errors detected' });
      }
    } catch (err: any) {
      emit({ type: 'info', message: 'Lint check failed: ' + err.message });
    }
  }

  // Auto Test Running
  if (ctx.config.autoRunTests && fileChangesCount > 0) {
    try {
      const testResult = runTests(ctx.config.projectRoot);
      if (testResult.total > 0) {
        lastTestContext = formatTestsForLLM(testResult);
        if (testResult.failed > 0) {
          emit({ type: 'tests_failed', count: testResult.failed, result: testResult });
        } else {
          emit({ type: 'info', message: 'All tests passed (' + testResult.total + ' tests)' });
        }
      }
    } catch (err: any) {
      emit({ type: 'info', message: 'Test run failed: ' + err.message });
    }
  }

  // Auto Checkpointing
  if (ctx.config.checkpointEvery > 0 && ctx.currentIteration % ctx.config.checkpointEvery === 0 && fileChangesCount > 0) {
    try {
      const desc = structured?.summary || ('Auto-checkpoint at iteration ' + ctx.currentIteration);
      services.checkpoint.createCheckpoint(ctx.config.projectRoot, ctx.projectId, ctx.runId, ctx.currentIteration, desc);
      emit({ type: 'checkpoint_created', iteration: ctx.currentIteration, description: desc });
    } catch (err: any) {
      emit({ type: 'info', message: 'Checkpoint failed: ' + err.message });
    }
  }

  return {
    structured,
    fileChangesCount,
    lastErrorContext,
    lastTestContext,
    conversationIndexContext,
  };
}

/**
 * Build the next iteration task from structured output, errors, and test results.
 */
export function buildNextTask(
  structured: StructuredAgentOutput,
  lastErrorContext: string,
  lastTestContext: string,
  autoFixErrors: boolean,
  autoRunTests: boolean,
  autoAnsweredContext: string,
): string {
  let nextTask = '';

  if (lastErrorContext && autoFixErrors) {
    nextTask = 'PRIORITY: Fix the following errors before continuing:\n\n' + lastErrorContext + '\n\nAfter fixing errors, continue with:\n';
  }

  if (lastTestContext && autoRunTests) {
    const hasFailures = lastTestContext.includes('FAIL');
    if (hasFailures) {
      nextTask += 'FAILING TESTS:\n' + lastTestContext + '\n\nFix these tests, then continue with:\n';
    }
  }

  if ((structured.nextSteps || []).length > 0) {
    nextTask += structured.nextSteps
      .map(s => s.stepNumber + '. ' + s.action + ': ' + s.detail + ' (target: ' + s.target + ')')
      .join('\n');
  } else {
    nextTask += 'Continue with the implementation. Review what has been done and identify what remains.';
  }

  if (autoAnsweredContext) {
    nextTask += '\n\nAUTO-ANSWERED (do NOT re-ask these):' + autoAnsweredContext + '\nAll questions answered. Continue coding.\n';
  }

  return nextTask;
}

/**
 * Build the schema-miss retry task when structured output wasn't parsed.
 */
export function buildSchemaMissTask(
  initialTask: string,
  fileChangesCount: number,
  lastErrorContext: string,
): string {
  let retryTask = [
    initialTask.slice(0, 2000), '',
    '---',
    'Your previous output was missing the required JSON block. Include it this time.',
    'Create or modify at least ONE file, then end with:',
    '```json:structured_output',
    '{"summary":"What you did","filesChanged":[{"path":"src/file.ts","action":"created","summary":"Created file"}],"nextSteps":[{"stepNumber":1,"action":"Next action","target":"src/file.ts","detail":"Details","priority":"high"}],"questionsForUser":[],"done":false,"confidence":80}',
    '```',
  ].join('\n');

  if (lastErrorContext) {
    retryTask += '\n\nPRIORITY ERRORS TO FIX:\n' + lastErrorContext;
  }

  return retryTask;
}
