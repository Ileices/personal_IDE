// ============================================
// Smart Token Chunking Pipeline
// Detects token limit errors, splits oversized
// content into model-sized chunks, and uses
// LLM-generated summaries as bridge context
// between chunks for continuity.
// ============================================
import type OpenAI from 'openai';
import { estimateTokens, chunkContent, isTokenLimitError } from './providers.js';
import { completeChatResponse } from './streaming.js';

/** Result from processing a single chunk */
export interface ChunkProcessResult {
  chunkIndex: number;
  totalChunks: number;
  response: string;
  tokensUsed: number;
  bridgeSummary: string; // LLM-generated summary for next chunk's context
}

/** Final result from the full chunking pipeline */
export interface ChunkingPipelineResult {
  success: boolean;
  /** All individual chunk results in order */
  chunks: ChunkProcessResult[];
  /** Final merged response */
  mergedResponse: string;
  /** Total tokens consumed across all chunks */
  totalTokensUsed: number;
  /** How many chunks the data was split into */
  totalChunks: number;
  /** If failed, the error */
  error?: string;
}

/** Configuration for the chunking pipeline */
export interface ChunkingPipelineConfig {
  /** The model's context window in tokens */
  modelContextWindow: number;
  /** Fraction of context for each data chunk (default 0.75) */
  chunkFraction: number;
  /** Fraction of context reserved for bridge summary (default 0.125) */
  bridgeFraction: number;
  /** Fraction reserved for system prompt + output (default 0.125) */
  overheadFraction: number;
  /** Max tokens for each LLM response */
  maxOutputTokens: number;
  /** Model ID */
  model: string;
  /** Temperature for responses */
  temperature: number;
  /** Callback for progress events */
  onProgress?: (event: ChunkingProgressEvent) => void;
  /** Max recursion depth for sub-pipeline splitting (prevents stack overflow) */
  maxRecursionDepth: number;
  /** Current recursion depth (internal use) */
  _currentDepth: number;
}

export interface ChunkingProgressEvent {
  type: 'chunk_start' | 'chunk_complete' | 'bridge_generated' | 'pipeline_complete' | 'pipeline_error';
  chunkIndex?: number;
  totalChunks?: number;
  message: string;
  tokensUsed?: number;
}

const DEFAULT_CONFIG: Partial<ChunkingPipelineConfig> = {
  chunkFraction: 0.75,
  bridgeFraction: 0.125,
  overheadFraction: 0.125,
  maxOutputTokens: 4096,
  temperature: 0.3,
  maxRecursionDepth: 3,
  _currentDepth: 0,
};

/**
 * Smart Chunking Pipeline
 *
 * When content exceeds a model's token limit, this pipeline:
 * 1. Detects the effective token limit
 * 2. Splits content into chunks of ~75% of the limit
 * 3. Processes chunk 1 with no bridge (first pass)
 * 4. After each chunk, asks the LLM to generate a concise summary
 *    of everything covered so far (the "bridge summary")
 * 5. For chunks 2..N, prepends the bridge summary (~12.5% of limit)
 *    so the LLM has continuity across chunks
 * 6. Merges all chunk responses into a unified result
 *
 * Example: 8000 token model, 1M token codebase
 *  - Each chunk: ~6000 tokens of data
 *  - Bridge summary: ~1000 tokens (LLM-generated overview of previous chunks)
 *  - Overhead (system prompt + output reserve): ~1000 tokens
 *  - ~167 chunks, each with full context of what came before
 */
export class ChunkingPipeline {
  private config: ChunkingPipelineConfig;

  constructor(config: Partial<ChunkingPipelineConfig> & { modelContextWindow: number; model: string }) {
    this.config = { ...DEFAULT_CONFIG, ...config } as ChunkingPipelineConfig;
  }

  /**
   * Process oversized content through the chunking pipeline.
   *
   * @param client - OpenAI-compatible client
   * @param systemPrompt - The system prompt to use for each chunk
   * @param taskPrompt - The user's task/question to apply to the content
   * @param oversizedContent - The content that exceeds token limits
   * @param existingMessages - Any existing conversation context (will be compacted)
   */
  async process(
    client: OpenAI,
    systemPrompt: string,
    taskPrompt: string,
    oversizedContent: string,
    existingMessages: Array<{ role: string; content: string }> = []
  ): Promise<ChunkingPipelineResult> {
    const {
      modelContextWindow,
      chunkFraction,
      bridgeFraction,
      overheadFraction,
      maxOutputTokens,
      model,
      temperature,
      onProgress,
    } = this.config;

    // Calculate token budgets
    const effectiveLimit = Math.floor(modelContextWindow * 0.95);
    const chunkTokenBudget = Math.floor(effectiveLimit * chunkFraction);
    const bridgeTokenBudget = Math.floor(effectiveLimit * bridgeFraction);
    const overheadBudget = Math.floor(effectiveLimit * overheadFraction);

    // Estimate overhead from system prompt + task prompt + existing messages
    const systemTokens = estimateTokens(systemPrompt);
    const taskTokens = estimateTokens(taskPrompt);
    const existingTokens = existingMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    const fixedOverhead = systemTokens + taskTokens + Math.min(existingTokens, overheadBudget);

    // Actual tokens available per chunk for data
    const dataTokensPerChunk = Math.max(
      1000, // minimum chunk size
      chunkTokenBudget - fixedOverhead
    );

    // Split the oversized content into chunks
    const dataChunks = chunkContent(oversizedContent, dataTokensPerChunk);
    const totalChunks = dataChunks.length;

    if (totalChunks === 0) {
      return {
        success: false,
        chunks: [],
        mergedResponse: '',
        totalTokensUsed: 0,
        totalChunks: 0,
        error: 'No content to process',
      };
    }

    // If it fits in one chunk, just process normally
    if (totalChunks === 1) {
      try {
        const messages: any[] = [
          { role: 'system', content: systemPrompt },
          ...existingMessages.slice(-4), // keep last 4 conversation messages
          { role: 'user', content: `${taskPrompt}\n\n---\n\n${dataChunks[0]}` },
        ];

        const response = await completeChatResponse(client, model, messages, {
          temperature,
          maxTokens: maxOutputTokens,
        });

        return {
          success: true,
          chunks: [{
            chunkIndex: 0,
            totalChunks: 1,
            response: response.content,
            tokensUsed: response.usage?.total_tokens || 0,
            bridgeSummary: '',
          }],
          mergedResponse: response.content,
          totalTokensUsed: response.usage?.total_tokens || 0,
          totalChunks: 1,
        };
      } catch (err: any) {
        return {
          success: false,
          chunks: [],
          mergedResponse: '',
          totalTokensUsed: 0,
          totalChunks: 1,
          error: err.message,
        };
      }
    }

    // Multi-chunk processing
    const results: ChunkProcessResult[] = [];
    let runningBridgeSummary = '';
    let totalTokensUsed = 0;

    onProgress?.({
      type: 'chunk_start',
      totalChunks,
      message: `Splitting content into ${totalChunks} chunks (${dataTokensPerChunk} tokens each, ${bridgeTokenBudget} tokens for bridge summaries)`,
    });

    for (let i = 0; i < totalChunks; i++) {
      const chunk = dataChunks[i];

      onProgress?.({
        type: 'chunk_start',
        chunkIndex: i,
        totalChunks,
        message: `Processing chunk ${i + 1}/${totalChunks}...`,
      });

      try {
        // Build messages for this chunk
        const chunkMessages: any[] = [
          { role: 'system', content: systemPrompt },
        ];

        // For chunks after the first, include the bridge summary
        let userContent = '';
        if (i === 0) {
          userContent = [
            taskPrompt,
            '',
            `--- DATA (Part ${i + 1} of ${totalChunks}) ---`,
            '',
            chunk,
            '',
            `--- END PART ${i + 1} of ${totalChunks} ---`,
            '',
            `NOTE: This is part ${i + 1} of ${totalChunks} parts. Process this part and provide your analysis. I will send the remaining parts next.`,
          ].join('\n');
        } else {
          userContent = [
            taskPrompt,
            '',
            `--- SUMMARY OF PREVIOUSLY COVERED DATA (Parts 1-${i}) ---`,
            '',
            runningBridgeSummary,
            '',
            `--- END SUMMARY ---`,
            '',
            `--- DATA (Part ${i + 1} of ${totalChunks}) ---`,
            '',
            chunk,
            '',
            `--- END PART ${i + 1} of ${totalChunks} ---`,
            '',
            i < totalChunks - 1
              ? `Continue your analysis incorporating the previous summary context. More parts will follow.`
              : `This is the FINAL part. Provide your complete analysis incorporating all previous context.`,
          ].join('\n');
        }

        chunkMessages.push({ role: 'user', content: userContent });

        // Execute LLM call for this chunk
        const response = await completeChatResponse(client, model, chunkMessages, {
          temperature,
          maxTokens: maxOutputTokens,
        });

        const chunkTokens = response.usage?.total_tokens || 0;
        totalTokensUsed += chunkTokens;

        onProgress?.({
          type: 'chunk_complete',
          chunkIndex: i,
          totalChunks,
          tokensUsed: chunkTokens,
          message: `Chunk ${i + 1}/${totalChunks} processed (${chunkTokens} tokens)`,
        });

        // Generate bridge summary for next chunk (unless this is the last chunk)
        let bridgeSummary = '';
        if (i < totalChunks - 1) {
          bridgeSummary = await this.generateBridgeSummary(
            client,
            model,
            temperature,
            runningBridgeSummary,
            response.content,
            i + 1,
            totalChunks,
            bridgeTokenBudget
          );
          totalTokensUsed += estimateTokens(bridgeSummary); // rough estimate of bridge call cost
          runningBridgeSummary = bridgeSummary;

          onProgress?.({
            type: 'bridge_generated',
            chunkIndex: i,
            totalChunks,
            message: `Bridge summary generated (${estimateTokens(bridgeSummary)} tokens)`,
          });
        }

        results.push({
          chunkIndex: i,
          totalChunks,
          response: response.content,
          tokensUsed: chunkTokens,
          bridgeSummary,
        });

      } catch (err: any) {
        // ── Rate limit errors (429) are NOT token-size problems — propagate immediately ──
        const statusCode = err?.status || err?.statusCode || err?.error?.status;
        if (statusCode === 429 || statusCode === 403) {
          onProgress?.({
            type: 'pipeline_error',
            chunkIndex: i,
            totalChunks,
            message: `Rate limited (${statusCode}) on chunk ${i + 1}. Propagating to caller for backoff.`,
          });
          return {
            success: false,
            chunks: results,
            mergedResponse: results.map(r => r.response).join('\n\n---\n\n'),
            totalTokensUsed,
            totalChunks,
            error: `Rate limited (${statusCode}): ${err.message}`,
          };
        }

        // Check if this chunk itself hit a token limit
        const limitCheck = isTokenLimitError(err);
        if (limitCheck.isLimit) {
          onProgress?.({
            type: 'pipeline_error',
            chunkIndex: i,
            totalChunks,
            message: `Chunk ${i + 1} still too large (depth ${this.config._currentDepth}/${this.config.maxRecursionDepth}). Error: ${err.message}`,
          });

          // Try with an even smaller chunk by recursing with halved context — but only if depth allows
          if (dataTokensPerChunk > 2000 && this.config._currentDepth < this.config.maxRecursionDepth) {
            const subPipeline = new ChunkingPipeline({
              ...this.config,
              modelContextWindow: Math.floor(this.config.modelContextWindow * 0.5),
              _currentDepth: this.config._currentDepth + 1,
              onProgress,
            });
            const subResult = await subPipeline.process(
              client, systemPrompt, taskPrompt, chunk, existingMessages
            );
            if (subResult.success) {
              totalTokensUsed += subResult.totalTokensUsed;
              results.push({
                chunkIndex: i,
                totalChunks,
                response: subResult.mergedResponse,
                tokensUsed: subResult.totalTokensUsed,
                bridgeSummary: runningBridgeSummary,
              });
              continue;
            }
          } else if (this.config._currentDepth >= this.config.maxRecursionDepth) {
            onProgress?.({
              type: 'pipeline_error',
              chunkIndex: i,
              totalChunks,
              message: `Max recursion depth (${this.config.maxRecursionDepth}) reached. Stopping sub-chunking.`,
            });
          }
        }

        // Non-recoverable error for this chunk
        onProgress?.({
          type: 'pipeline_error',
          chunkIndex: i,
          totalChunks,
          message: `Failed on chunk ${i + 1}: ${err.message}`,
        });

        return {
          success: false,
          chunks: results,
          mergedResponse: results.map(r => r.response).join('\n\n---\n\n'),
          totalTokensUsed,
          totalChunks,
          error: `Failed on chunk ${i + 1}/${totalChunks}: ${err.message}`,
        };
      }
    }

    // Merge all chunk responses
    const mergedResponse = this.mergeResponses(results);

    onProgress?.({
      type: 'pipeline_complete',
      totalChunks,
      tokensUsed: totalTokensUsed,
      message: `Pipeline complete: ${totalChunks} chunks, ${totalTokensUsed} total tokens`,
    });

    return {
      success: true,
      chunks: results,
      mergedResponse,
      totalTokensUsed,
      totalChunks,
    };
  }

  /**
   * Generate an LLM bridge summary that covers all previously processed data.
   * This replaces raw overlap — instead of repeating the tail of the previous chunk,
   * we ask the LLM to create a concise overview of everything covered so far.
   */
  private async generateBridgeSummary(
    client: OpenAI,
    model: string,
    temperature: number,
    previousBridgeSummary: string,
    latestChunkResponse: string,
    chunksProcessed: number,
    totalChunks: number,
    maxBridgeTokens: number
  ): Promise<string> {
    const targetChars = Math.floor(maxBridgeTokens * 3.5);

    const summaryPrompt = previousBridgeSummary
      ? [
          `You are maintaining a running summary of a large dataset being processed in ${totalChunks} parts.`,
          `${chunksProcessed} parts have been processed so far.`,
          '',
          `PREVIOUS RUNNING SUMMARY:`,
          previousBridgeSummary,
          '',
          `LATEST CHUNK ANALYSIS:`,
          latestChunkResponse.slice(0, targetChars), // limit input size
          '',
          `UPDATE the running summary to incorporate the latest analysis.`,
          `The summary MUST be concise (under ${maxBridgeTokens} tokens / ~${targetChars} characters).`,
          `Include: key findings, important file paths, function names, patterns discovered, decisions made.`,
          `Drop: verbose explanations, code blocks, duplicate information.`,
          `This summary will be used as context for processing the remaining ${totalChunks - chunksProcessed} parts.`,
        ].join('\n')
      : [
          `You are processing a large dataset in ${totalChunks} parts. Part 1 has been processed.`,
          '',
          `PART 1 ANALYSIS:`,
          latestChunkResponse.slice(0, targetChars),
          '',
          `Create a concise summary (under ${maxBridgeTokens} tokens / ~${targetChars} characters) of the key findings.`,
          `Include: key findings, important file paths, function names, patterns discovered, decisions made.`,
          `Drop: verbose explanations, code blocks.`,
          `This summary will be used as context for processing the remaining ${totalChunks - 1} parts.`,
        ].join('\n');

    try {
      const response = await completeChatResponse(client, model, [
        { role: 'system', content: 'You are a precise technical summarizer. Output ONLY the summary, no preamble.' },
        { role: 'user', content: summaryPrompt },
      ], {
        temperature: Math.max(0.1, temperature - 0.1), // slightly lower temp for summaries
        maxTokens: Math.min(maxBridgeTokens, 2048),
      });

      return response.content.slice(0, targetChars); // hard cap
    } catch {
      // If bridge generation fails, use a simple truncation of the latest response
      return `[Summary of parts 1-${chunksProcessed}]: ${latestChunkResponse.slice(0, Math.floor(targetChars * 0.5))}`;
    }
  }

  /**
   * Merge all chunk responses into a single coherent result.
   * The last chunk's response gets priority since it has the most context.
   */
  private mergeResponses(results: ChunkProcessResult[]): string {
    if (results.length === 0) return '';
    if (results.length === 1) return results[0].response;

    // For the final merged output, the last chunk should have the most comprehensive view
    // since it received the full bridge summary. Prepend earlier unique insights.
    const parts: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const isLast = i === results.length - 1;
      if (isLast) {
        // Last chunk gets full inclusion — it has the complete context
        parts.push(results[i].response);
      } else {
        // Earlier chunks: include a header so the user can see per-chunk analysis
        parts.push(`[Analysis of data part ${i + 1}/${results.length}]\n${results[i].response}`);
      }
    }

    return parts.join('\n\n---\n\n');
  }

  /**
   * Quick check: does this content need chunking for the configured model?
   */
  needsChunking(content: string, additionalOverhead: number = 0): boolean {
    const estimated = estimateTokens(content) + additionalOverhead;
    const effectiveLimit = Math.floor(this.config.modelContextWindow * 0.95);
    return estimated > effectiveLimit;
  }

  /**
   * Estimate how many chunks the content will be split into.
   */
  estimateChunkCount(content: string): number {
    const effectiveLimit = Math.floor(this.config.modelContextWindow * 0.95);
    const chunkTokenBudget = Math.floor(effectiveLimit * this.config.chunkFraction);
    const contentTokens = estimateTokens(content);
    return Math.ceil(contentTokens / chunkTokenBudget);
  }
}

/**
 * Convenience function: process oversized content through the chunking pipeline.
 * Use this when you catch a token limit error and need to retry with chunking.
 */
export async function processWithChunking(
  client: OpenAI,
  model: string,
  modelContextWindow: number,
  systemPrompt: string,
  taskPrompt: string,
  oversizedContent: string,
  onProgress?: (event: ChunkingProgressEvent) => void
): Promise<ChunkingPipelineResult> {
  const pipeline = new ChunkingPipeline({
    modelContextWindow,
    model,
    onProgress,
  });

  return pipeline.process(client, systemPrompt, taskPrompt, oversizedContent);
}
