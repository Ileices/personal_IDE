// ============================================
// Response Processing — Handle LLM response, apply file changes
// Extracted from enhancedLoop.ts for <1000 LOC compliance
// ============================================
import { v4 as uuid } from 'uuid';
import { estimateTokens } from '../../llm/providers.js';
import { parseStructuredOutput, parseFileChanges } from '../../modes/prompts.js';
import { writeFile } from '../../filesystem/index.js';
import { runAllLintChecks, runTests, runBuild, formatBuildForLLM, formatErrorsForLLM, formatTestsForLLM } from '../../errors/detector.js';
import type { StructuredAgentOutput } from '@personal-ide/shared';
import type Database from 'better-sqlite3';
import type { MemoryService } from '../../memory/index.js';
import type { CheckpointService } from '../../checkpoint/index.js';
import type { CodebaseAnalyzer } from '../../analysis/codebase.js';
import type { ConversationIndexer } from '../../analysis/conversationIndexer.js';
import type { LoopDetector } from '../loopDetector.js';
import type { LogWriter } from '../logWriter.js';
import { appConfig } from '../../../config.js';
import { emitIterationMilestones, writeQualitySnapshot, inferQualityFromContext } from './milestoneEmitter.js';

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
  lastBuildContext: string;
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
  let lastBuildContext = '';
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

  // Bird-feed observation to Nano trainer (with retry logic + cleanup)
  try {
    const nanoRow = ctx.db.prepare(
      "SELECT base_url FROM provider_configs WHERE provider_id = 'nano' AND enabled = 1"
    ).get() as any;
    const nanoBaseUrl = (nanoRow?.base_url || appConfig.services.nanoSeaUrl).replace(/\/v1\/?$/, '');
    const nanoPayload = JSON.stringify({
      query: currentTask.slice(0, 4000),
      response: content.slice(0, 8000),
      source: 'agent',
      quality: 0.8,
    });

    // Retry up to 2 times with backoff on failure
    // Track pending timers so they can be garbage collected
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const sendToNano = async (attempt: number) => {
      try {
        const res = await fetch(nanoBaseUrl + '/v1/training/observe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: nanoPayload,
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          emit({ type: 'nano_training_received', attempt, status: res.status });
        } else if (attempt < 2) {
          retryTimer = setTimeout(() => { retryTimer = null; sendToNano(attempt + 1); }, 3000 * attempt);
        } else {
          emit({ type: 'info', message: `Nano training observe failed after ${attempt} attempts (status ${res.status})` });
        }
      } catch (err: any) {
        if (attempt < 2) {
          retryTimer = setTimeout(() => { retryTimer = null; sendToNano(attempt + 1); }, 3000 * attempt);
        } else {
          emit({ type: 'info', message: `Nano training observe failed after ${attempt} attempts: ${err.message?.slice(0, 100)}` });
        }
      }
    };
    sendToNano(1);
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
  // ── Smart Checkpoint: pre_write — snapshot BEFORE any file changes ──────────
  // This gives us a clean rollback point regardless of the checkpointEvery cadence.
  if (fileChanges.length > 0) {
    try {
      const preWriteLabel = `pre_write: ${fileChanges.map(f => f.path).join(', ').slice(0, 120)}`;
      services.checkpoint.createCheckpoint(
        ctx.config.projectRoot, ctx.projectId, ctx.runId,
        ctx.currentIteration, preWriteLabel, 'auto:pre_write',
      );
      emit({ type: 'checkpoint_created', iteration: ctx.currentIteration, trigger: 'pre_write', description: preWriteLabel });
    } catch { /* non-critical */ }
  }
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

      // Wire file summaries — record what each file contains for cross-session memory
      try {
        const ext = change.path.match(/\.(\w+)$/)?.[1] || 'unknown';
        const langMap: Record<string, string> = { ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', py: 'python', rs: 'rust', go: 'go' };
        const contentHash = simpleHash(change.content);
        const keySymbols = extractKeySymbols(change.content, langMap[ext] || ext);
        services.memory.upsertFileSummary(ctx.projectId, {
          projectId: ctx.projectId,
          filePath: change.path,
          summary: (structured?.filesChanged?.find(f => f.path === change.path)?.summary || 'Modified by agent').slice(0, 500),
          language: langMap[ext] || ext,
          fileSize: change.content.length,
          contentHash,
          keySymbols,
        });
      } catch { /* non-critical — file summaries are best-effort */ }
    } catch (err: any) {
      emit({ type: 'error', error: 'Failed to write ' + change.path + ': ' + err.message });
    }
  }

  // Auto Build Verification
  if ((ctx.config.autoFixErrors || ctx.config.autoRunTests) && fileChangesCount > 0) {
    try {
      const buildResult = runBuild(ctx.config.projectRoot);
      lastBuildContext = formatBuildForLLM(buildResult);
      emit({
        type: 'runtime_check',
        stage: 'build',
        success: buildResult.success,
        command: buildResult.command,
        exitCode: buildResult.exitCode,
        durationMs: buildResult.duration,
      });
      if (!buildResult.success) {
        // Treat build failures as high-priority error context for the next iteration.
        lastErrorContext = [
          'Build failed. Fix this before continuing.',
          lastBuildContext,
        ].join('\n\n');
      }
    } catch (err: any) {
      emit({ type: 'info', message: 'Build verification failed: ' + err.message });
    }
  }

  // Auto Error Detection
  if (ctx.config.autoFixErrors && fileChangesCount > 0) {
    try {
      const errors = runAllLintChecks(ctx.config.projectRoot);
      if (errors.length > 0) {
        const lintContext = formatErrorsForLLM(errors);
        lastErrorContext = lastErrorContext
          ? `${lastErrorContext}\n\n${lintContext}`
          : lintContext;
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
        emit({
          type: 'runtime_check',
          stage: 'tests',
          success: testResult.failed === 0,
          total: testResult.total,
          failed: testResult.failed,
          passed: testResult.passed,
        });
        if (testResult.failed > 0) {
          emit({ type: 'tests_failed', count: testResult.failed, result: testResult });
        } else {
          emit({ type: 'info', message: 'All tests passed (' + testResult.total + ' tests)' });
          // ── Smart Checkpoint: post_test — mark a known-good state ───────────
          try {
            const postTestLabel = `post_test: ${testResult.total} tests passing — iter ${ctx.currentIteration}`;
            services.checkpoint.createCheckpoint(
              ctx.config.projectRoot, ctx.projectId, ctx.runId,
              ctx.currentIteration, postTestLabel, 'auto:post_test',
            );
            emit({ type: 'checkpoint_created', iteration: ctx.currentIteration, trigger: 'post_test', description: postTestLabel });
          } catch { /* non-critical */ }
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

  // ── Milestone + Quality Tracking ───────────────────────────────────────────
  // Persist structured progress to the DB so the UI can render a milestone tree
  // and quality trend charts independent of the SSE event stream.
  const summary = structured?.summary || ('Iteration ' + ctx.currentIteration);
  const totalTokensThisStep =
    (response?.usage?.total_tokens ?? 0) ||
    estimateTokens(currentTask) + estimateTokens(content);

  try {
    emitIterationMilestones(
      ctx.db,
      ctx.projectId,
      ctx.runId,
      ctx.currentIteration,
      summary,
      fileChangesCount,
    );
  } catch { /* best-effort */ }

  try {
    const quality = inferQualityFromContext(lastErrorContext, lastTestContext, lastBuildContext);
    writeQualitySnapshot(ctx.db, {
      id: `${ctx.runId}:q:${ctx.currentIteration}`,
      projectId: ctx.projectId,
      runId: ctx.runId,
      iteration: ctx.currentIteration,
      buildOk: quality.buildOk,
      testsOk: quality.testsOk,
      lintOk: quality.lintOk,
      errorCount: quality.errorCount,
      testPassCount: quality.testPassCount,
      testFailCount: quality.testFailCount,
      filesChanged: fileChangesCount,
      tokensUsed: totalTokensThisStep,
      summary: summary.slice(0, 200),
    });
    // Emit the quality snapshot as an event so the frontend can render it
    emit({
      type: 'quality_snapshot',
      iteration: ctx.currentIteration,
      buildOk: quality.buildOk,
      testsOk: quality.testsOk,
      lintOk: quality.lintOk,
      errorCount: quality.errorCount,
      filesChanged: fileChangesCount,
    });
  } catch { /* best-effort */ }

  return {
    structured,
    fileChangesCount,
    lastBuildContext,
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
    const formattedSteps = structured.nextSteps
      .filter(s => s && (s.action || s.detail || s.target))
      .map(s => {
        const num = s.stepNumber ?? '?';
        const action = s.action || 'Continue';
        const detail = s.detail || 'Continue implementation';
        const target = s.target ? ` (target: ${s.target})` : '';
        return `${num}. ${action}: ${detail}${target}`;
      })
      .join('\n');
    nextTask += formattedSteps || 'Continue with the implementation. Review what has been done and identify what remains.';
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

// ── File Summary Helpers ──

function simpleHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

function extractKeySymbols(content: string, language: string): string[] {
  const symbols: string[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    if (['typescript', 'javascript'].includes(language)) {
      const expMatch = trimmed.match(/^export\s+(?:default\s+)?(?:class|function|interface|type|enum|const|let|var|async)\s+(\w+)/);
      if (expMatch) symbols.push(expMatch[1]);
    } else if (language === 'python') {
      const defMatch = trimmed.match(/^(?:class|def|async def)\s+(\w+)/);
      if (defMatch) symbols.push(defMatch[1]);
    } else {
      const funcMatch = trimmed.match(/^(?:pub\s+)?(?:fn|func|function|def)\s+(\w+)/);
      if (funcMatch) symbols.push(funcMatch[1]);
    }

    if (symbols.length >= 20) break;
  }

  return symbols;
}
