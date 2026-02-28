// ============================================
// Token Budget Enforcement & Recovery
// Extracted from enhancedLoop.ts for <1000 LOC
//
// Handles: pre-LLM budget trimming, proactive
// chunking, token-limit error recovery with
// dynamic context discovery.
// ============================================
import type OpenAI from 'openai';
import { getModel } from '@personal-ide/shared';
import { estimateTokens, truncateToFit, checkTokenLimit, isTokenLimitError } from '../../llm/providers.js';
import { ChunkingPipeline } from '../../llm/chunkingPipeline.js';
import { rateLimiter } from '../../llm/rateLimiter.js';
import { appConfig } from '../../../config.js';

type EmitFn = (event: any) => void;

// ── Pre-LLM Budget Enforcement ──────────────────────────

/**
 * Aggressively trim messages to fit within the model's actual context window
 * BEFORE sending to the LLM. Prevents sending 12k tokens to a 4k model.
 */
export function enforceTokenBudget(
  messages: any[],
  contextWindow: number,
  maxTokensPerStep: number | undefined,
  emit: EmitFn,
): void {
  const outputReserve = Math.min(
    maxTokensPerStep || appConfig.contextDefaults.defaultOutputReserve,
    Math.floor(contextWindow * 0.25),
  );
  const maxInputTokens = contextWindow - outputReserve;
  let totalEstimated = messages.reduce((sum: number, m: any) => sum + estimateTokens(m.content), 0);

  if (totalEstimated <= maxInputTokens) return;

  emit({ type: 'info', message: `Budget enforcement: ${totalEstimated}/${maxInputTokens} tokens. Trimming...` });

  // 1. Truncate system prompt (largest contributor) to 40% of budget
  const systemBudget = Math.floor(maxInputTokens * 0.4);
  if (estimateTokens(messages[0].content) > systemBudget) {
    messages[0] = { role: 'system', content: truncateToFit(messages[0].content, systemBudget) };
  }

  // 2. Drop file list if still over
  totalEstimated = messages.reduce((sum: number, m: any) => sum + estimateTokens(m.content), 0);
  if (totalEstimated > maxInputTokens && messages.length > 2) {
    const fileListIdx = messages.findIndex((m: any, i: number) =>
      i > 0 && m.role === 'system' && m.content.startsWith('PROJECT FILES:'),
    );
    if (fileListIdx > 0) {
      messages.splice(fileListIdx, 1);
    }
  }

  // 3. Drop oldest history messages until fits
  totalEstimated = messages.reduce((sum: number, m: any) => sum + estimateTokens(m.content), 0);
  while (totalEstimated > maxInputTokens && messages.length > 2) {
    const removed = messages.splice(1, 1);
    totalEstimated -= estimateTokens(removed[0]?.content || '');
  }

  // 4. If STILL over (system + task alone too big), truncate the task
  totalEstimated = messages.reduce((sum: number, m: any) => sum + estimateTokens(m.content), 0);
  if (totalEstimated > maxInputTokens) {
    const taskBudget = maxInputTokens - estimateTokens(messages[0].content) - 100;
    if (taskBudget > 500) {
      messages[messages.length - 1] = {
        role: 'user',
        content: truncateToFit(messages[messages.length - 1].content, Math.max(500, taskBudget)),
      };
    }
  }

  totalEstimated = messages.reduce((sum: number, m: any) => sum + estimateTokens(m.content), 0);
  emit({ type: 'info', message: `After trimming: ${totalEstimated}/${maxInputTokens} tokens (${messages.length} messages)` });
}

// ── Proactive Chunking ──────────────────────────────────

/**
 * If messages are still over token limit after budget enforcement,
 * proactively use the chunking pipeline to split and process.
 * Returns the chunked response if successful, null otherwise.
 */
export async function tryProactiveChunking(
  client: OpenAI,
  messages: any[],
  currentTask: string,
  contextWindow: number,
  model: string,
  maxTokensPerStep: number | undefined,
  emit: EmitFn,
): Promise<{ content: string; tokensUsed: number } | null> {
  const totalContent = messages.map((m: any) => m.content).join('\n');
  const tokenCheck = checkTokenLimit(totalContent, contextWindow, maxTokensPerStep);

  if (tokenCheck.withinLimit) return null;

  emit({ type: 'info', message: `Context too large (${tokenCheck.estimatedTokens}/${contextWindow} tokens). Attempting proactive chunking...` });

  // Truncate system prompt first
  const truncatedSystem = truncateToFit(messages[0]?.content || '', Math.floor(contextWindow * 0.4));
  messages[0] = { role: 'system', content: truncatedSystem };

  // Drop file list if still over
  if (messages.length > 3) {
    const recheck = checkTokenLimit(messages.map((m: any) => m.content).join('\n'), contextWindow, maxTokensPerStep);
    if (!recheck.withinLimit) {
      const fileListIdx = messages.findIndex((m: any, i: number) =>
        i > 0 && m.role === 'system' && m.content.startsWith('PROJECT FILES:'),
      );
      if (fileListIdx > 0) messages.splice(fileListIdx, 1);
    }
  }

  // Check again after truncation
  const finalCheck = checkTokenLimit(messages.map((m: any) => m.content).join('\n'), contextWindow, maxTokensPerStep);
  if (finalCheck.withinLimit) return null;

  // Still over — use chunking pipeline
  const oversizedContent = messages
    .filter((m: any) => m.role !== 'system')
    .map((m: any) => m.content)
    .join('\n\n---\n\n');

  let chunkingActive = false;
  const pipeline = new ChunkingPipeline({
    modelContextWindow: contextWindow,
    model,
    onProgress: (event) => {
      chunkingActive = event.type !== 'pipeline_complete' && event.type !== 'pipeline_error';
      emit({
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
    const result = await pipeline.process(client, messages[0]?.content || '', currentTask, oversizedContent);
    if (result.success) {
      emit({ type: 'info', message: `Proactive chunking complete: ${result.totalChunks} chunks, ${result.totalTokensUsed} tokens` });
      return { content: result.mergedResponse, tokensUsed: result.totalTokensUsed };
    }
  } catch (err: any) {
    emit({ type: 'info', message: `Proactive chunking failed: ${err.message}. Attempting normal call...` });
  }

  return null;
}

// ── Token Limit Error Recovery ──────────────────────────

export interface TokenRecoveryResult {
  /** Recovered response content, null if recovery failed */
  response: { content: string; usage: any } | null;
  /** Updated per-request token limit for chunking (NOT the model's actual context window) */
  perRequestLimit?: number;
  /** Updated context window (only if real model limit discovered) */
  contextWindowUpdate?: number;
  /** Whether to count this as a consecutive error */
  isRecoverableError: boolean;
}

/**
 * Handle token limit / 413 errors with smart recovery:
 * - Distinguishes rate-limit token caps from real model context limits
 * - Activates chunking pipeline with the correct (smaller) limit
 * - Uses configurable CONTEXT_FLOOR instead of hardcoded 16000
 */
export async function recoverFromTokenLimitError(
  err: any,
  client: OpenAI,
  messages: any[],
  currentTask: string,
  model: string,
  contextWindow: number,
  discoveredContextLimits: Map<string, number>,
  enableSmartChunking: boolean,
  emit: EmitFn,
): Promise<TokenRecoveryResult> {
  const limitCheck = isTokenLimitError(err);
  if (!limitCheck.isLimit) {
    return { response: null, isRecoverableError: false };
  }

  const rateLimitMax = limitCheck.suggestedMax;
  const modelDef = getModel(model);
  const modelActualMax = modelDef?.maxInputTokens || appConfig.contextDefaults.unknownModelContext;
  const CONTEXT_FLOOR = appConfig.contextDefaults.contextFloor;

  // Distinguish rate-limit caps from real model limits
  const isRateLimitCap = rateLimitMax && rateLimitMax < modelActualMax * 0.25;
  let contextWindowUpdate: number | undefined;
  let perRequestLimit: number | undefined;

  if (isRateLimitCap) {
    perRequestLimit = Math.floor(rateLimitMax * 0.95);
    emit({
      type: 'info',
      message: `Rate-limit token cap: ${rateLimitMax} tokens/request (model actual: ${modelActualMax}). Chunking to fit.`,
    });
    discoveredContextLimits.set(model, perRequestLimit);
  } else {
    const realMax = rateLimitMax || contextWindow;
    emit({ type: 'info', message: `Model context limit: ${realMax} tokens. Adjusting window.` });
    if (rateLimitMax && rateLimitMax < contextWindow) {
      contextWindowUpdate = Math.floor(rateLimitMax * 0.95);
      contextWindow = contextWindowUpdate;
      emit({ type: 'info', message: `Context window corrected to ${contextWindow} tokens` });
    }
  }

  // For chunking, use the SMALLER of context window or discovered per-request limit
  const chunkingLimit = Math.min(
    contextWindow,
    discoveredContextLimits.get(model) || contextWindow,
  );

  if (!enableSmartChunking) {
    // No chunking — shrink per-request limit and retry
    const currentLimit = discoveredContextLimits.get(model) || contextWindow;
    discoveredContextLimits.set(model, Math.max(CONTEXT_FLOOR, Math.floor(currentLimit * 0.7)));
    emit({
      type: 'info',
      message: `Adjusted per-request limit to ${discoveredContextLimits.get(model)} tokens (chunking disabled)`,
    });
    return {
      response: null,
      perRequestLimit: discoveredContextLimits.get(model),
      contextWindowUpdate,
      isRecoverableError: true,
    };
  }

  emit({
    type: 'info',
    message: `Activating smart chunking (limit: ${chunkingLimit} tokens, window: ${contextWindow})...`,
  });

  const oversizedContent = messages
    .filter((m: any) => m.role !== 'system')
    .map((m: any) => m.content)
    .join('\n\n---\n\n');

  const recoveryPipeline = new ChunkingPipeline({
    modelContextWindow: chunkingLimit,
    model,
    onProgress: (event) => {
      emit({
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
      Math.floor(chunkingLimit * 0.3),
    );

    const result = await recoveryPipeline.process(client, truncatedSystem, currentTask, oversizedContent);

    if (result.success) {
      emit({
        type: 'info',
        message: `Chunking recovery complete: ${result.totalChunks} chunks, ${result.totalTokensUsed} tokens`,
      });
      return {
        response: {
          content: result.mergedResponse,
          usage: { total_tokens: result.totalTokensUsed },
        },
        contextWindowUpdate,
        isRecoverableError: true,
      };
    }

    // Chunking pipeline ran but failed — reduce limit for next attempt
    const currentLimit = discoveredContextLimits.get(model) || contextWindow;
    discoveredContextLimits.set(model, Math.max(CONTEXT_FLOOR, Math.floor(currentLimit * 0.7)));
    emit({ type: 'info', message: `Chunking pipeline failed: ${result.error}` });
    return {
      response: null,
      perRequestLimit: discoveredContextLimits.get(model),
      contextWindowUpdate,
      isRecoverableError: true,
    };
  } catch (chunkErr: any) {
    const currentLimit = discoveredContextLimits.get(model) || contextWindow;
    discoveredContextLimits.set(model, Math.max(CONTEXT_FLOOR, Math.floor(currentLimit * 0.7)));
    emit({ type: 'info', message: `Chunking pipeline error: ${chunkErr.message}` });
    return {
      response: null,
      perRequestLimit: discoveredContextLimits.get(model),
      contextWindowUpdate,
      isRecoverableError: true,
    };
  }
}
