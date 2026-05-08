// ============================================
// App Update Route — pull latest from GitHub
// POST /api/app/update  — runs `git pull` in the repo root
// GET  /api/app/update-status — returns current git info
// ============================================
import type { FastifyInstance } from 'fastify';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);

// Resolve the monorepo root (two levels up from apps/server/src/routes/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../../');

async function runGit(args: string[]): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync('git', args, {
      cwd: REPO_ROOT,
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    });
    return { stdout: result.stdout.trim(), stderr: result.stderr.trim() };
  } catch (err: any) {
    return { stdout: '', stderr: err?.message || String(err) };
  }
}

export async function appUpdateRoutes(app: FastifyInstance) {
  // GET — lightweight background check (just behindCount + branch)
  // Used by startup check and 6-hour auto-poll — no full log or remote dump
  app.get('/api/app/check-updates', async (_req, reply) => {
    // Real git fetch so remote tracking ref is up to date
    await runGit(['fetch', 'origin', '--quiet']);
    const [branch, behindResult, localLog, remoteLog] = await Promise.all([
      runGit(['rev-parse', '--abbrev-ref', 'HEAD']),
      runGit(['rev-list', 'HEAD..@{u}', '--count']),
      runGit(['log', '-1', '--format=%H %s']),
      runGit(['log', '-1', 'origin/main', '--format=%H %s']),
    ]);
    const behind = parseInt(behindResult.stdout, 10) || 0;
    return reply.send({
      branch: branch.stdout || 'unknown',
      behindCount: behind,
      localHead: localLog.stdout,
      remoteHead: remoteLog.stdout,
      checkedAt: new Date().toISOString(),
    });
  });

  // GET — full status (used by Settings panel manual check)
  app.get('/api/app/update-status', async (_req, reply) => {
    const [branch, log, remote] = await Promise.all([
      runGit(['rev-parse', '--abbrev-ref', 'HEAD']),
      runGit(['log', '--oneline', '-5']),
      runGit(['remote', '-v']),
    ]);

    // Real fetch so behind count is accurate
    await runGit(['fetch', 'origin', '--quiet']);
    const behindResult = await runGit(['rev-list', 'HEAD..@{u}', '--count']);
    const behind = parseInt(behindResult.stdout, 10) || 0;

    return reply.send({
      branch: branch.stdout || 'unknown',
      recentCommits: log.stdout,
      remotes: remote.stdout,
      behindCount: behind,
      repoRoot: REPO_ROOT,
    });
  });

  // POST — git pull
  app.post('/api/app/update', async (_req, reply) => {
    const fetchResult = await runGit(['fetch', 'origin']);
    const pullResult = await runGit(['pull', '--ff-only', 'origin', 'main']);

    const success = !pullResult.stderr.includes('error') && !pullResult.stderr.includes('CONFLICT');
    const alreadyUpToDate = pullResult.stdout.includes('Already up to date') ||
      pullResult.stdout.includes('Already up-to-date');

    return reply.send({
      success,
      alreadyUpToDate,
      output: pullResult.stdout || fetchResult.stdout,
      stderr: pullResult.stderr,
      message: alreadyUpToDate
        ? 'Already up to date.'
        : success
          ? `Updated successfully.\n${pullResult.stdout}`
          : `Pull failed: ${pullResult.stderr}`,
    });
  });
}
