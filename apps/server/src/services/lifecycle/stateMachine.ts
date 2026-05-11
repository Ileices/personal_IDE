/**
 * LifecycleStateMachine — canonical status contract for all control planes.
 *
 * IMPORTANT: This module is the single authoritative source of status string
 * literals used by every pipeline in the system:
 *   - God Factory autonomous loop (godFactory.ts)
 *   - Suggested jobs crawler (suggestedJobsCrawler)
 *   - Subsystem scheduler (subsystemScheduler.ts)
 *   - Community Hub (github.ts)
 *   - Silicon Factory (siliconFactory)
 *
 * CAUTION: Do NOT define status string literals in individual route files.
 * Import from this module instead. Doing so allows TypeScript to catch status
 * drift at compile time and ensures the DB CHECK constraints remain in sync.
 *
 * Valid DB values for job_records.implementation_status:
 *   suggested | implementing | implemented | rejected | archived
 *
 * Valid DB values for god_factory_runs.status:
 *   running | completed | stopped | crashed | error
 *
 * Source cluster: C6 https://github.com/orgs/community/discussions/195397#discussioncomment-16869611
 * Design rationale: https://github.com/Ileices/personal_IDE/discussions/20
 */

// ── Job / Task Status ──────────────────────────────────────────────────────

/**
 * Canonical job status values.
 * These must match the CHECK constraint in job_records.implementation_status.
 *
 * CAUTION: Do not add status variants here without a matching DB migration that
 * updates the CHECK constraint. Otherwise SQLite will silently reject writes
 * on databases whose schema pre-dates the new value.
 */
export const JOB_STATUS = {
  /** Queued, ready to be claimed by the loop. */
  SUGGESTED:     'suggested',
  /** Claimed by the loop; execution is in progress. */
  IMPLEMENTING:  'implementing',
  /** Execution completed successfully. */
  IMPLEMENTED:   'implemented',
  /** Execution failed or was explicitly rejected. */
  REJECTED:      'rejected',
  /** Superseded/archived; no longer active. */
  ARCHIVED:      'archived',
} as const;

export type JobStatus = typeof JOB_STATUS[keyof typeof JOB_STATUS];

/**
 * Valid job status transitions.
 *
 * The map value lists all statuses that the given status may transition INTO.
 * Any transition not in this map is illegal and should throw via assertValidJobTransition().
 *
 * CAUTION: transitions are intentionally strict. If the loop emits a status
 * that is not in the allowed transition list the assertValidJobTransition
 * call will throw — exposing the bug rather than silently writing bad data.
 */
export const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  [JOB_STATUS.SUGGESTED]:    [JOB_STATUS.IMPLEMENTING, JOB_STATUS.ARCHIVED],
  [JOB_STATUS.IMPLEMENTING]: [JOB_STATUS.IMPLEMENTED, JOB_STATUS.REJECTED, JOB_STATUS.SUGGESTED],
  [JOB_STATUS.IMPLEMENTED]:  [JOB_STATUS.ARCHIVED],
  [JOB_STATUS.REJECTED]:     [JOB_STATUS.SUGGESTED, JOB_STATUS.ARCHIVED],
  [JOB_STATUS.ARCHIVED]:     [],
};

/**
 * Assert that transitioning a job from `from` to `to` is legal.
 * Throws a descriptive Error on illegal transitions so callers cannot silently
 * write bad state.
 *
 * CAUTION: Call this before every job status UPDATE in the autonomous loop.
 * If you need to bypass a transition for a migration or emergency fix, explicitly
 * comment why the assertion is skipped — do not delete the assertion.
 */
export function assertValidJobTransition(from: JobStatus, to: JobStatus): void {
  const allowed = JOB_TRANSITIONS[from];
  if (!allowed) {
    throw new Error(
      `LifecycleStateMachine: unknown source job status "${from}". ` +
      `Valid statuses: ${Object.values(JOB_STATUS).join(', ')}.`
    );
  }
  if (!allowed.includes(to)) {
    throw new Error(
      `LifecycleStateMachine: illegal job transition "${from}" → "${to}". ` +
      `Allowed from "${from}": ${allowed.length ? allowed.join(', ') : '(terminal — no transitions allowed)'}.`
    );
  }
}

// ── Loop Run Status ────────────────────────────────────────────────────────

/**
 * Canonical God Factory loop run status values.
 * These match god_factory_runs.status.
 */
export const RUN_STATUS = {
  /** Loop is actively executing. */
  RUNNING:   'running',
  /** Loop ran to completion (queue empty or maxIterations reached). */
  COMPLETED: 'completed',
  /** Loop was manually stopped via /loop/stop. */
  STOPPED:   'stopped',
  /** Server restarted while loop was in RUNNING state (detected by recovery job). */
  CRASHED:   'crashed',
  /** Loop exited due to an unhandled error. */
  ERROR:     'error',
} as const;

export type RunStatus = typeof RUN_STATUS[keyof typeof RUN_STATUS];

/**
 * Valid loop run status transitions.
 */
export const RUN_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  [RUN_STATUS.RUNNING]:   [RUN_STATUS.COMPLETED, RUN_STATUS.STOPPED, RUN_STATUS.ERROR],
  [RUN_STATUS.COMPLETED]: [],
  [RUN_STATUS.STOPPED]:   [RUN_STATUS.RUNNING],
  [RUN_STATUS.CRASHED]:   [RUN_STATUS.RUNNING],
  [RUN_STATUS.ERROR]:     [RUN_STATUS.RUNNING],
};

/**
 * Assert that a loop run status transition is legal.
 * Same semantics as assertValidJobTransition.
 */
export function assertValidRunTransition(from: RunStatus, to: RunStatus): void {
  const allowed = RUN_TRANSITIONS[from];
  if (!allowed) {
    throw new Error(
      `LifecycleStateMachine: unknown source run status "${from}". ` +
      `Valid statuses: ${Object.values(RUN_STATUS).join(', ')}.`
    );
  }
  if (!allowed.includes(to)) {
    throw new Error(
      `LifecycleStateMachine: illegal run transition "${from}" → "${to}". ` +
      `Allowed from "${from}": ${allowed.length ? allowed.join(', ') : '(terminal — no transitions allowed)'}.`
    );
  }
}

// ── Stop Reason ───────────────────────────────────────────────────────────

/**
 * Canonical stop_reason values written to god_factory_runs.stop_reason.
 *
 * CAUTION: The stop reason must always be set alongside the status update.
 * A run with status=stopped/completed/error and stop_reason=null is an
 * observability gap — the operator cannot understand why the run ended.
 */
export const STOP_REASON = {
  /** Operator explicitly called /loop/stop. */
  MANUAL:          'manual',
  /** Queue was empty after the last tick. */
  QUEUE_EMPTY:     'queue_empty',
  /** maxIterations was reached. */
  MAX_ITERATIONS:  'max_iterations',
  /** Unhandled exception in the tick() path. */
  ERROR:           'error',
  /** Server restarted mid-run. */
  CRASH_RECOVERY:  'crash_recovery',
  /** Loop state cleared after crash recovery on server restart. */
  RECOVERED:       'crash_recovery_complete',
} as const;

export type StopReason = typeof STOP_REASON[keyof typeof STOP_REASON];

// ── Legacy status map (migration helpers) ─────────────────────────────────

/**
 * Maps legacy illegal status values (written by older loop code) to their
 * canonical replacements. Use this during DB migration to reclassify existing
 * rows that were written before the status contract was enforced.
 *
 * CAUTION: Do NOT use this map for new writes. It exists solely for migration.
 * Any new code that needs to write a status must import from JOB_STATUS directly.
 */
export const LEGACY_STATUS_MAP: Record<string, JobStatus> = {
  'in_progress': JOB_STATUS.IMPLEMENTING,
  'complete':    JOB_STATUS.IMPLEMENTED,
  'failed':      JOB_STATUS.REJECTED,
  'processing':  JOB_STATUS.IMPLEMENTING,
  'done':        JOB_STATUS.IMPLEMENTED,
};

/**
 * Normalizes a potentially-legacy status string to the canonical value.
 * Returns the canonical value if the input is already canonical.
 * Throws if the string is completely unrecognised.
 */
export function normalizeJobStatus(raw: string): JobStatus {
  const canonical = raw as JobStatus;
  if (Object.values(JOB_STATUS).includes(canonical)) return canonical;
  const mapped = LEGACY_STATUS_MAP[raw];
  if (mapped) return mapped;
  throw new Error(
    `LifecycleStateMachine: unrecognised job status "${raw}". ` +
    `Known values: ${Object.values(JOB_STATUS).join(', ')}. ` +
    `Legacy aliases: ${Object.keys(LEGACY_STATUS_MAP).join(', ')}.`
  );
}
