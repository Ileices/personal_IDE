// ============================================
// Checkpoint & Versioning Service
// Git-based snapshots every N iterations
// with rollback support
// ============================================
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import type { Checkpoint } from '@personal-ide/shared';

export class CheckpointService {
  constructor(private db: Database.Database) {
    this.ensureTable();
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        agent_run_id TEXT,
        iteration INTEGER NOT NULL DEFAULT 0,
        label TEXT NOT NULL,
        description TEXT DEFAULT '',
        files_snapshot TEXT DEFAULT '[]',
        git_commit_hash TEXT,
        can_rollback INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_checkpoints_project ON checkpoints(project_id);
    `);
  }

  /** Initialize git in project if not already done */
  initGit(projectRoot: string): boolean {
    try {
      if (!existsSync(join(projectRoot, '.git'))) {
        execSync('git init', { cwd: projectRoot, stdio: 'pipe' });
        // Create initial .gitignore
        const gitignore = 'node_modules/\ndist/\nbuild/\n.env\n*.db\n__pycache__/\n.venv/\ntarget/\n';
        require('fs').writeFileSync(join(projectRoot, '.gitignore'), gitignore);
        execSync('git add -A && git commit -m "Initial checkpoint"', {
          cwd: projectRoot,
          stdio: 'pipe',
          env: { ...process.env, GIT_AUTHOR_NAME: 'PersonalIDE', GIT_AUTHOR_EMAIL: 'agent@personal-ide', GIT_COMMITTER_NAME: 'PersonalIDE', GIT_COMMITTER_EMAIL: 'agent@personal-ide' },
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  /** Create a checkpoint (git commit + DB record) */
  createCheckpoint(
    projectRoot: string,
    projectId: string,
    agentRunId: string,
    iteration: number,
    label: string,
    description: string = '',
    type: 'auto' | 'user' = 'user'
  ): Checkpoint | null {
    try {
      this.initGit(projectRoot);

      // Stage all changes
      execSync('git add -A', { cwd: projectRoot, stdio: 'pipe' });

      // Check if there are changes to commit
      try {
        execSync('git diff --cached --quiet', { cwd: projectRoot, stdio: 'pipe' });
        // No changes - still create DB record but skip git commit
        const id = uuid();
        const lastHash = this.getLastCommitHash(projectRoot);
        this.db.prepare(
          'INSERT INTO checkpoints (id, project_id, agent_run_id, iteration, label, description, git_commit_hash, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(id, projectId, agentRunId, iteration, label, description, lastHash, type);

        return {
          id,
          projectId,
          agentRunId,
          iteration,
          label,
          description,
          filesSnapshot: [],
          gitCommitHash: lastHash || undefined,
          createdAt: new Date().toISOString(),
          canRollback: true,
          type,
        };
      } catch {
        // There are changes - commit them
      }

      const commitMsg = `[Checkpoint ${iteration}] ${label}`;
      execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, {
        cwd: projectRoot,
        stdio: 'pipe',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'PersonalIDE Agent',
          GIT_AUTHOR_EMAIL: 'agent@personal-ide',
          GIT_COMMITTER_NAME: 'PersonalIDE Agent',
          GIT_COMMITTER_EMAIL: 'agent@personal-ide',
        },
      });

      const commitHash = this.getLastCommitHash(projectRoot);
      const changedFiles = this.getChangedFiles(projectRoot);

      const id = uuid();
      this.db.prepare(
        'INSERT INTO checkpoints (id, project_id, agent_run_id, iteration, label, description, files_snapshot, git_commit_hash, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(id, projectId, agentRunId, iteration, label, description, JSON.stringify(changedFiles), commitHash, type);

      return {
        id,
        projectId,
        agentRunId,
        iteration,
        label,
        description,
        filesSnapshot: changedFiles,
        gitCommitHash: commitHash || undefined,
        createdAt: new Date().toISOString(),
        canRollback: true,
        type,
      };
    } catch (err: any) {
      console.error('Checkpoint creation failed:', err.message);
      return null;
    }
  }

  /** Rollback to a specific checkpoint */
  rollback(projectRoot: string, checkpointId: string): boolean {
    const cp = this.db.prepare('SELECT * FROM checkpoints WHERE id = ?').get(checkpointId) as any;
    if (!cp || !cp.git_commit_hash) return false;

    try {
      execSync(`git checkout ${cp.git_commit_hash} -- .`, {
        cwd: projectRoot,
        stdio: 'pipe',
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Get all checkpoints for a project */
  listCheckpoints(projectId: string): Checkpoint[] {
    const rows = this.db.prepare(
      'SELECT * FROM checkpoints WHERE project_id = ? ORDER BY created_at DESC'
    ).all(projectId) as any[];

    return rows.map(r => ({
      id: r.id,
      projectId: r.project_id,
      agentRunId: r.agent_run_id,
      iteration: r.iteration,
      label: r.label,
      description: r.description,
      filesSnapshot: JSON.parse(r.files_snapshot || '[]'),
      gitCommitHash: r.git_commit_hash || undefined,
      createdAt: r.created_at,
      canRollback: !!r.can_rollback,
      type: (r.type === 'auto' ? 'auto' : 'user') as 'auto' | 'user',
    }));
  }

  /** Get diff between two checkpoints */
  getDiff(projectRoot: string, fromHash: string, toHash: string): string {
    try {
      return execSync(`git diff ${fromHash} ${toHash} --stat`, {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      return '';
    }
  }

  private getLastCommitHash(projectRoot: string): string | null {
    try {
      return execSync('git rev-parse HEAD', {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch {
      return null;
    }
  }

  private getChangedFiles(projectRoot: string): string[] {
    try {
      const output = execSync('git diff HEAD~1 --name-only', {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return output.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }
}
