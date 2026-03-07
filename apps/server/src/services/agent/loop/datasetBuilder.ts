// ============================================
// Dataset Builder — Agent log → NANO training
// data pipeline. Records ALL iterations with
// quality tagging and failure annotation.
// ============================================
import * as fs from 'fs';
import * as path from 'path';
import { appConfig } from '../../../config.js';

/** A single training data pair for the NANO pipeline */
export interface TrainingPair {
  timestamp: string;
  query: string;
  response: string;
  model: string;
  provider: string;
  iteration: number;
  runId: string;
  /** 0.0–1.0 quality score based on heuristics */
  quality: number;
  /** Task classification */
  taskType: 'planning' | 'coding' | 'debugging' | 'review' | 'iteration' | 'general';
  /** Tags for filtering */
  tags: string[];
  /** Whether the iteration produced actionable output */
  success: boolean;
  /** Number of files changed (0 = likely a failure) */
  filesChanged: number;
  /** Confidence from structured output */
  confidence: number;
  /** For failures: what went wrong */
  failureAnalysis?: string;
  /** Source of the data */
  source: 'agent_loop' | 'fleet' | 'chat' | 'distillation';
}

export interface DatasetStats {
  totalPairs: number;
  successPairs: number;
  failurePairs: number;
  averageQuality: number;
  modelBreakdown: Record<string, number>;
  lastFlushTime: string | null;
  pendingPairs: number;
}

/** Batch size before auto-flush to disk */
const FLUSH_THRESHOLD = 25;

/** Maximum pending pairs before forced flush */
const MAX_PENDING = 100;

export class DatasetBuilder {
  private buffer: TrainingPair[] = [];
  private stats: DatasetStats = {
    totalPairs: 0,
    successPairs: 0,
    failurePairs: 0,
    averageQuality: 0,
    modelBreakdown: {},
    lastFlushTime: null,
    pendingPairs: 0,
  };
  private outputDir: string;
  private outputFile: string;
  private nanoSeaUrl: string;
  private qualitySum = 0;

  constructor(projectRoot: string) {
    // Write to NANO_train data directory if it exists, otherwise project-local
    const nanoDataDir = path.resolve(projectRoot, '..', 'NANO_train', 'nano_data', 'training', 'agent_dataset');
    const localDir = path.join(projectRoot, '.ide-logs', 'training-data');

    if (fs.existsSync(path.resolve(projectRoot, '..', 'NANO_train'))) {
      this.outputDir = nanoDataDir;
    } else {
      this.outputDir = localDir;
    }

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    this.outputFile = path.join(this.outputDir, `agent-dataset-${timestamp}.jsonl`);
    this.nanoSeaUrl = (appConfig.services?.nanoSeaUrl || 'http://localhost:7437/v1').replace(/\/v1\/?$/, '');
  }

  /**
   * Record an agent iteration as a training pair.
   * Quality is computed automatically from heuristics.
   * ALL iterations are recorded — including failures (with annotation).
   */
  recordIteration(data: {
    task: string;
    response: string;
    model: string;
    provider: string;
    iteration: number;
    runId: string;
    structured: { summary?: string; filesChanged?: any[]; confidence?: number; done?: boolean; nextSteps?: any[] } | null;
    filesChanged: number;
    errors: string;
    isFailedResponse: boolean;
  }): void {
    // ── Compute quality score ──
    let quality = 0.5; // baseline
    const tags: string[] = [];

    // Positive signals
    if (data.filesChanged > 0) { quality += 0.15; tags.push('productive'); }
    if (data.structured) { quality += 0.1; tags.push('structured'); }
    if (data.structured?.confidence && data.structured.confidence > 70) quality += 0.1;
    if (data.structured?.filesChanged && data.structured.filesChanged.length > 0) quality += 0.05;
    if (!data.errors) quality += 0.05;

    // Negative signals
    if (data.isFailedResponse) { quality -= 0.3; tags.push('refusal'); }
    if (data.filesChanged === 0 && !data.structured?.done) { quality -= 0.1; tags.push('no-output'); }
    if (data.errors) { quality -= 0.1; tags.push('has-errors'); }
    if (data.response.length < 100) { quality -= 0.15; tags.push('short-response'); }

    quality = Math.max(0.05, Math.min(1.0, quality));

    // ── Classify task type ──
    const taskLower = data.task.toLowerCase();
    let taskType: TrainingPair['taskType'] = 'general';
    if (taskLower.includes('fix') || taskLower.includes('error') || taskLower.includes('debug') || taskLower.includes('bug')) {
      taskType = 'debugging';
    } else if (taskLower.includes('plan') || taskLower.includes('architect') || taskLower.includes('design')) {
      taskType = 'planning';
    } else if (taskLower.includes('review') || taskLower.includes('audit') || taskLower.includes('check')) {
      taskType = 'review';
    } else if (taskLower.includes('implement') || taskLower.includes('create') || taskLower.includes('build') || taskLower.includes('add')) {
      taskType = 'coding';
    } else if (data.iteration > 1) {
      taskType = 'iteration';
    }

    // ── Build failure analysis for bad iterations ──
    let failureAnalysis: string | undefined;
    const success = data.filesChanged > 0 || (data.structured?.done === true);

    if (!success) {
      const reasons: string[] = [];
      if (data.isFailedResponse) reasons.push('Model refused the task (said "I cannot" or "As an AI")');
      if (data.filesChanged === 0) reasons.push('No file changes produced');
      if (!data.structured) reasons.push('No structured JSON output returned');
      if (data.errors) reasons.push('Errors detected: ' + data.errors.slice(0, 200));
      if (data.response.length < 100) reasons.push('Response too short (' + data.response.length + ' chars)');

      failureAnalysis = 'FAILURE ANALYSIS: ' + reasons.join('. ') + '. ' +
        'CORRECT BEHAVIOR: The model should have produced code file changes using --- FILE: path --- markers ' +
        'and ended with structured JSON output. It should never refuse agentic tasks.';
      tags.push('failure-annotated');
    }

    const pair: TrainingPair = {
      timestamp: new Date().toISOString(),
      query: data.task.slice(0, 8000),
      response: data.response.slice(0, 16000),
      model: data.model,
      provider: data.provider,
      iteration: data.iteration,
      runId: data.runId,
      quality,
      taskType,
      tags,
      success,
      filesChanged: data.filesChanged,
      confidence: data.structured?.confidence || 0,
      failureAnalysis,
      source: 'agent_loop',
    };

    this.buffer.push(pair);
    this.stats.totalPairs++;
    this.stats.pendingPairs = this.buffer.length;
    if (success) this.stats.successPairs++;
    else this.stats.failurePairs++;
    this.qualitySum += quality;
    this.stats.averageQuality = this.qualitySum / this.stats.totalPairs;
    this.stats.modelBreakdown[data.model] = (this.stats.modelBreakdown[data.model] || 0) + 1;

    // Auto-flush when buffer is full
    if (this.buffer.length >= FLUSH_THRESHOLD) {
      this.flush();
    }

    // Fire-and-forget: send high-quality pairs to Nano Sea
    if (quality >= 0.6) {
      this.sendToNanoSea(pair).catch(() => {});
    }
  }

  /**
   * Flush buffered pairs to disk as JSONL.
   */
  flush(): void {
    if (this.buffer.length === 0) return;

    try {
      const lines = this.buffer.map(p => JSON.stringify(p)).join('\n') + '\n';
      fs.appendFileSync(this.outputFile, lines);
      this.stats.lastFlushTime = new Date().toISOString();
      this.buffer = [];
      this.stats.pendingPairs = 0;
    } catch (err) {
      // Don't crash the agent if dataset write fails
      console.error('[DatasetBuilder] Flush failed:', err);
    }
  }

  /**
   * Force flush if we have pending data (e.g., on agent stop).
   */
  finalize(): void {
    if (this.buffer.length > 0) {
      this.flush();
    }
  }

  /**
   * Send a training pair to the Nano Sea for live training.
   */
  private async sendToNanoSea(pair: TrainingPair): Promise<void> {
    try {
      await fetch(this.nanoSeaUrl + '/v1/training/observe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: pair.query.slice(0, 4000),
          response: pair.response.slice(0, 8000),
          source: pair.source,
          quality: pair.quality,
          model: pair.model,
          tags: pair.tags,
          success: pair.success,
          failure_analysis: pair.failureAnalysis,
        }),
      });
    } catch {
      // Nano Sea might not be running — non-critical
    }
  }

  /**
   * Get current dataset statistics.
   */
  getStats(): DatasetStats {
    return { ...this.stats, pendingPairs: this.buffer.length };
  }

  /**
   * Get the output file path.
   */
  getOutputPath(): string {
    return this.outputFile;
  }

  /**
   * Format stats for event emission.
   */
  formatForEvent(): Record<string, any> {
    const s = this.getStats();
    return {
      total: s.totalPairs,
      success: s.successPairs,
      failures: s.failurePairs,
      avgQuality: Math.round(s.averageQuality * 100) / 100,
      pending: s.pendingPairs,
    };
  }
}
