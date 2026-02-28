// ─── Chunk Merger ───
// Merges results from multiple LLM chunk responses into a unified output
import type { ChunkProcessResult } from './chunkingPipeline.js';

/**
 * Merge all chunk responses into a single coherent result.
 * The last chunk's response gets priority since it has the most context
 * (via the running bridge summary).
 */
export function mergeChunkResponses(results: ChunkProcessResult[]): string {
  if (results.length === 0) return '';
  if (results.length === 1) return results[0].response;

  const parts: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const isLast = i === results.length - 1;
    if (isLast) {
      parts.push(results[i].response);
    } else {
      parts.push(`[Analysis of data part ${i + 1}/${results.length}]\n${results[i].response}`);
    }
  }

  return parts.join('\n\n---\n\n');
}
