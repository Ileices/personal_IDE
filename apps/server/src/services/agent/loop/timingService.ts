// ============================================
// Timing Service — Per-call timing, rolling averages,
// ETA predictions, stall detection
// ============================================

export interface CallTiming {
  id: string;
  modelId: string;
  iteration: number;
  startTime: number;
  endTime: number;
  durationMs: number;
  tokensUsed: number;
  filesChanged: number;
  success: boolean;
}

export interface TimingStats {
  totalCalls: number;
  totalDurationMs: number;
  averageDurationMs: number;
  lastCallDurationMs: number;
  modelAverages: Record<string, number>;
  modelCallCounts: Record<string, number>;
  estimatedIterationMs: number;
  stallDetected: boolean;
  tokensPerSecond: number;
}

/** Maximum number of timings to keep in memory (rolling window) */
const MAX_HISTORY = 200;

/** If a call takes longer than this, it's considered a stall */
const STALL_THRESHOLD_MS = 300_000; // 5 minutes

export class TimingService {
  private history: CallTiming[] = [];
  private activeCall: { id: string; modelId: string; iteration: number; startTime: number } | null = null;
  private callCounter = 0;

  /**
   * Start timing an LLM call.
   * @returns A call ID to pass to endCall()
   */
  startCall(modelId: string, iteration: number): string {
    const id = `call-${++this.callCounter}-${Date.now()}`;
    this.activeCall = { id, modelId, iteration, startTime: Date.now() };
    return id;
  }

  /**
   * End timing for a call and record the result.
   */
  endCall(callId: string, result: { tokensUsed?: number; filesChanged?: number; success?: boolean } = {}): CallTiming | null {
    if (!this.activeCall || this.activeCall.id !== callId) return null;

    const endTime = Date.now();
    const timing: CallTiming = {
      id: callId,
      modelId: this.activeCall.modelId,
      iteration: this.activeCall.iteration,
      startTime: this.activeCall.startTime,
      endTime,
      durationMs: endTime - this.activeCall.startTime,
      tokensUsed: result.tokensUsed || 0,
      filesChanged: result.filesChanged || 0,
      success: result.success !== false,
    };

    this.history.push(timing);
    if (this.history.length > MAX_HISTORY) {
      this.history = this.history.slice(-MAX_HISTORY);
    }

    this.activeCall = null;
    return timing;
  }

  /**
   * Cancel an active call (e.g., on error).
   */
  cancelCall(): void {
    this.activeCall = null;
  }

  /**
   * Get the duration of the current active call (live timer).
   * Returns 0 if no call is active.
   */
  getActiveCallDuration(): number {
    if (!this.activeCall) return 0;
    return Date.now() - this.activeCall.startTime;
  }

  /**
   * Check if the current call is stalling.
   */
  isStalling(): boolean {
    return this.getActiveCallDuration() > STALL_THRESHOLD_MS;
  }

  /**
   * Get rolling average duration for a specific model.
   */
  getModelAverage(modelId: string): number {
    const modelCalls = this.history.filter(c => c.modelId === modelId && c.success);
    if (modelCalls.length === 0) return 0;
    const total = modelCalls.reduce((sum, c) => sum + c.durationMs, 0);
    return Math.round(total / modelCalls.length);
  }

  /**
   * Get overall average across all models.
   */
  getOverallAverage(): number {
    const successful = this.history.filter(c => c.success);
    if (successful.length === 0) return 0;
    const total = successful.reduce((sum, c) => sum + c.durationMs, 0);
    return Math.round(total / successful.length);
  }

  /**
   * Estimate time remaining for N more iterations.
   */
  getETA(remainingIterations: number): number {
    const avg = this.getOverallAverage();
    if (avg === 0 || remainingIterations <= 0) return 0;
    return avg * remainingIterations;
  }

  /**
   * Get the last completed call timing.
   */
  getLastCall(): CallTiming | null {
    return this.history.length > 0 ? this.history[this.history.length - 1] : null;
  }

  /**
   * Get tokens processed per second (rolling average).
   */
  getTokensPerSecond(): number {
    const recent = this.history.filter(c => c.success && c.tokensUsed > 0).slice(-20);
    if (recent.length === 0) return 0;
    const totalTokens = recent.reduce((sum, c) => sum + c.tokensUsed, 0);
    const totalMs = recent.reduce((sum, c) => sum + c.durationMs, 0);
    if (totalMs === 0) return 0;
    return Math.round((totalTokens / totalMs) * 1000);
  }

  /**
   * Get comprehensive timing stats for display.
   */
  getStats(): TimingStats {
    const successful = this.history.filter(c => c.success);
    const totalDuration = successful.reduce((sum, c) => sum + c.durationMs, 0);
    const avg = successful.length > 0 ? Math.round(totalDuration / successful.length) : 0;
    const lastCall = this.getLastCall();

    // Per-model breakdown
    const modelAverages: Record<string, number> = {};
    const modelCallCounts: Record<string, number> = {};
    const modelIds = new Set(this.history.map(c => c.modelId));
    for (const mid of modelIds) {
      modelAverages[mid] = this.getModelAverage(mid);
      modelCallCounts[mid] = this.history.filter(c => c.modelId === mid).length;
    }

    return {
      totalCalls: this.history.length,
      totalDurationMs: totalDuration,
      averageDurationMs: avg,
      lastCallDurationMs: lastCall?.durationMs || 0,
      modelAverages,
      modelCallCounts,
      estimatedIterationMs: avg,
      stallDetected: this.isStalling(),
      tokensPerSecond: this.getTokensPerSecond(),
    };
  }

  /**
   * Format timing data for event emission (compact summary for UI).
   */
  formatForEvent(): Record<string, any> {
    const stats = this.getStats();
    const active = this.getActiveCallDuration();
    return {
      lastCallMs: stats.lastCallDurationMs,
      avgCallMs: stats.averageDurationMs,
      totalCalls: stats.totalCalls,
      tokPerSec: stats.tokensPerSecond,
      activeMs: active,
      stalling: stats.stallDetected,
    };
  }

  /**
   * Reset all timing data.
   */
  reset(): void {
    this.history = [];
    this.activeCall = null;
    this.callCounter = 0;
  }
}
