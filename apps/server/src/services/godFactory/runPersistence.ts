/**
 * RunPersistence — Durable run record management for God Factory loop.
 *
 * Handles:
 * - Creating and tracking run records for each loop invocation
 * - Detecting and recovering from crashed runs (server restart)
 * - Requeuing orphaned jobs (those stuck in 'implementing' state)
 * - Heartbeat monitoring to detect stale loops
 *
 * Source: Discussion #63, Problem P1
 */

import { randomUUID } from 'crypto';

type Db = import('better-sqlite3').Database;

export interface GodFactoryRun {
  run_id: string;
  project_id: string;
  status: 'running' | 'stopped' | 'crashed' | 'completed' | 'error';
  started_at: string;
  ended_at: string | null;
  max_iterations: number;
  iteration_count: number;
  model_provider: string;
  model_name: string;
  last_heartbeat: string;
  stop_reason: string | null;
  jobs_completed: number;
  jobs_failed: number;
}

export class RunPersistence {
  constructor(private db: Db) {
    this.ensureTablesExist();
  }

  private ensureTablesExist() {
    // Ensure god_factory_runs table exists with proper schema
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS god_factory_runs (
        run_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('running', 'stopped', 'crashed', 'completed', 'error')),
        started_at TEXT NOT NULL,
        ended_at TEXT,
        max_iterations INTEGER NOT NULL,
        iteration_count INTEGER DEFAULT 0,
        model_provider TEXT NOT NULL,
        model_name TEXT NOT NULL,
        last_heartbeat TEXT NOT NULL,
        stop_reason TEXT,
        jobs_completed INTEGER DEFAULT 0,
        jobs_failed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_gf_runs_project ON god_factory_runs(project_id);
      CREATE INDEX IF NOT EXISTS idx_gf_runs_status ON god_factory_runs(status);
      CREATE INDEX IF NOT EXISTS idx_gf_runs_last_heartbeat ON god_factory_runs(last_heartbeat);
    `);
  }

  /**
   * Start a new run record.
   * @returns the run_id for this execution
   */
  startRun(projectId: string, config: { maxIterations: number; modelProvider: string; modelName: string }): string {
    const runId = randomUUID();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO god_factory_runs (
        run_id, project_id, status, started_at, max_iterations, 
        model_provider, model_name, last_heartbeat
      )
      VALUES (?, ?, 'running', ?, ?, ?, ?, ?)
    `);

    stmt.run(runId, projectId, now, config.maxIterations, config.modelProvider, config.modelName, now);
    return runId;
  }

  /**
   * Record a heartbeat to mark the loop as still alive.
   */
  heartbeat(runId: string) {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE god_factory_runs
      SET last_heartbeat = ?, updated_at = ?
      WHERE run_id = ?
    `).run(now, now, runId);
  }

  /**
   * Mark a run as stopped with a reason.
   */
  stopRun(runId: string, reason: string, iterationCount: number = 0) {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE god_factory_runs
      SET status = 'stopped', ended_at = ?, stop_reason = ?, iteration_count = ?, updated_at = ?
      WHERE run_id = ?
    `).run(now, reason, iterationCount, now, runId);
  }

  /**
   * Mark a run as completed.
   */
  completeRun(runId: string, iterationCount: number = 0) {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE god_factory_runs
      SET status = 'completed', ended_at = ?, iteration_count = ?, updated_at = ?
      WHERE run_id = ?
    `).run(now, iterationCount, now, runId);
  }

  /**
   * Mark a run as errored.
   */
  errorRun(runId: string, reason: string, iterationCount: number = 0) {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE god_factory_runs
      SET status = 'error', ended_at = ?, stop_reason = ?, iteration_count = ?, updated_at = ?
      WHERE run_id = ?
    `).run(now, reason, iterationCount, now, runId);
  }

  /**
   * Update job completion count.
   */
  recordJobCompletion(runId: string) {
    this.db.prepare(`
      UPDATE god_factory_runs
      SET jobs_completed = jobs_completed + 1, updated_at = CURRENT_TIMESTAMP
      WHERE run_id = ?
    `).run(runId);
  }

  /**
   * Update job failure count.
   */
  recordJobFailure(runId: string) {
    this.db.prepare(`
      UPDATE god_factory_runs
      SET jobs_failed = jobs_failed + 1, updated_at = CURRENT_TIMESTAMP
      WHERE run_id = ?
    `).run(runId);
  }

  /**
   * Detect crashed runs by checking for stale heartbeats.
   * Returns array of crashed run IDs that need recovery.
   * @param staleTimeoutMs time without heartbeat before marking as crashed (default 60s)
   */
  recoverCrashedRuns(staleTimeoutMs: number = 60000): GodFactoryRun[] {
    const staleTime = new Date(Date.now() - staleTimeoutMs).toISOString();
    const now = new Date().toISOString();

    const crashed = this.db.prepare(`
      SELECT * FROM god_factory_runs
      WHERE status = 'running' AND last_heartbeat < ?
    `).all(staleTime) as GodFactoryRun[];

    // Mark them as crashed
    for (const run of crashed) {
      this.db.prepare(`
        UPDATE god_factory_runs
        SET status = 'crashed', ended_at = ?, updated_at = ?
        WHERE run_id = ?
      `).run(now, now, run.run_id);

      // Requeue any jobs stuck in 'implementing' for this project
      this.db.prepare(`
        UPDATE job_records
        SET implementation_status = 'suggested', updated_at = ?
        WHERE project_id = ? AND implementation_status = 'implementing'
      `).run(now, run.project_id);
    }

    return crashed;
  }

  /**
   * Get the active/most recent run for a project.
   */
  getActiveRun(projectId: string): GodFactoryRun | null {
    const run = this.db.prepare(`
      SELECT * FROM god_factory_runs
      WHERE project_id = ? AND status = 'running'
      ORDER BY started_at DESC
      LIMIT 1
    `).get(projectId) as GodFactoryRun | null;

    return run || null;
  }

  /**
   * Get run history for a project (for UI display).
   */
  getRunHistory(projectId: string, limit: number = 10): GodFactoryRun[] {
    return this.db.prepare(`
      SELECT * FROM god_factory_runs
      WHERE project_id = ?
      ORDER BY started_at DESC
      LIMIT ?
    `).all(projectId, limit) as GodFactoryRun[];
  }

  /**
   * Get a specific run by ID.
   */
  getRun(runId: string): GodFactoryRun | null {
    return this.db.prepare(`
      SELECT * FROM god_factory_runs WHERE run_id = ?
    `).get(runId) as GodFactoryRun | null;
  }

  /**
   * Update iteration count for a run.
   */
  updateIterationCount(runId: string, iterationCount: number) {
    this.db.prepare(`
      UPDATE god_factory_runs
      SET iteration_count = ?, updated_at = CURRENT_TIMESTAMP
      WHERE run_id = ?
    `).run(iterationCount, runId);
  }
}
