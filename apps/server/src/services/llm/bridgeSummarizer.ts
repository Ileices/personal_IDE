// ─── Bridge Summarizer ───
// Generates running LLM summaries to maintain context between chunks
import type OpenAI from 'openai';
import { estimateTokens } from './providers.js';
import { completeChatResponse } from './streaming.js';

/**
 * Generate an LLM bridge summary that covers all previously processed data.
 * Replaces raw overlap: instead of repeating the tail of the previous chunk,
 * we ask the LLM to create a concise overview of everything covered so far.
 */
export async function generateBridgeSummary(
  client: OpenAI,
  model: string,
  temperature: number,
  previousBridgeSummary: string,
  latestChunkResponse: string,
  chunksProcessed: number,
  totalChunks: number,
  maxBridgeTokens: number,
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
        latestChunkResponse.slice(0, targetChars),
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
      temperature: Math.max(0.1, temperature - 0.1),
      maxTokens: Math.min(maxBridgeTokens, 2048),
    });

    return response.content.slice(0, targetChars);
  } catch {
    // Fallback: simple truncation
    return `[Summary of parts 1-${chunksProcessed}]: ${latestChunkResponse.slice(0, Math.floor(targetChars * 0.5))}`;
  }
}
