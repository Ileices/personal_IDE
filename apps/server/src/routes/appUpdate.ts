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
  // GET — current git info (branch, last commit, remote status)
  app.get('/api/app/update-status', async (_req, reply) => {
    const [branch, log, remote] = await Promise.all([
      runGit(['rev-parse', '--abbrev-ref', 'HEAD']),
      runGit(['log', '--oneline', '-5']),
      runGit(['remote', '-v']),
    ]);

    // Check if behind remote
    await runGit(['fetch', '--dry-run']);
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
