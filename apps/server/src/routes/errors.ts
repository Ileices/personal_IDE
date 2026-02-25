// ============================================
// Error Detection & Analysis Routes
// ============================================
import type { FastifyInstance } from 'fastify';
import { detectProjectStack, runAllLintChecks, runTests, formatErrorsForLLM, formatTestsForLLM } from '../services/errors/detector.js';
import { CodebaseAnalyzer } from '../services/analysis/codebase.js';

export async function errorRoutes(app: FastifyInstance): Promise<void> {
  const db = (app as any).db;
  const analyzer = new CodebaseAnalyzer(db);

  /** POST /api/errors/check - Run lint checks on a project */
  app.post<{ Body: { projectRoot: string } }>('/check', async (request) => {
    const { projectRoot } = request.body;
    const errors = runAllLintChecks(projectRoot);
    return {
      errors,
      summary: errors.length > 0 ? formatErrorsForLLM(errors) : 'No errors detected ✅',
      count: errors.length,
    };
  });

  /** POST /api/errors/test - Run tests on a project */
  app.post<{ Body: { projectRoot: string } }>('/test', async (request) => {
    const { projectRoot } = request.body;
    const result = runTests(projectRoot);
    return {
      result,
      summary: formatTestsForLLM(result),
      total: result.total,
      passed: result.passed,
      failed: result.failed,
    };
  });

  /** POST /api/errors/stack - Detect project stack/languages */
  app.post<{ Body: { projectRoot: string } }>('/stack', async (request) => {
    const { projectRoot } = request.body;
    return detectProjectStack(projectRoot);
  });

  /** POST /api/analysis/overview - Build codebase overview */
  app.post<{ Body: { projectId: string; projectRoot: string; tokenBudget?: number } }>(
    '/analysis/overview',
    async (request) => {
      const { projectId, projectRoot, tokenBudget } = request.body;
      const overview = analyzer.buildOverview(projectId, projectRoot);
      return {
        overview,
        formatted: analyzer.formatOverviewForLLM(overview, tokenBudget || 8000),
      };
    }
  );

  /** POST /api/analysis/scan - Scan project files */
  app.post<{ Body: { projectRoot: string } }>('/analysis/scan', async (request) => {
    const { projectRoot } = request.body;
    const files = analyzer.scanProject(projectRoot);
    const languages = analyzer.getLanguageDistribution(files);
    const entryPoints = analyzer.detectEntryPoints(projectRoot, files);
    return {
      totalFiles: files.length,
      languages,
      entryPoints,
      files: files.slice(0, 100).map(f => ({
        path: f.relativePath,
        language: f.language,
        lines: f.lines,
      })),
    };
  });

  /** Task tracker endpoints */

  /** POST /api/analysis/tasks - Create a task tracker */
  app.post<{ Body: { projectId: string; agentRunId?: string; title: string; subtasks: { title: string; description: string; targetFiles?: string[]; language?: string; tokenBudget?: number }[] } }>(
    '/analysis/tasks',
    async (request) => {
      const { projectId, agentRunId, title, subtasks } = request.body;
      const fullSubtasks = subtasks.map(s => ({
        title: s.title,
        description: s.description,
        targetFiles: s.targetFiles || [],
        language: s.language || '',
        tokenBudget: s.tokenBudget || 4000,
      }));
      return analyzer.createTaskTracker(projectId, agentRunId || '', title, fullSubtasks);
    }
  );

  /** GET /api/analysis/tasks/:projectId - Get all tasks for a project */
  app.get<{ Params: { projectId: string } }>('/analysis/tasks/:projectId', async (request) => {
    const { projectId } = request.params;
    return analyzer.getProjectTasks(projectId);
  });

  /** PATCH /api/analysis/tasks/:taskId/subtasks/:subtaskIndex - Update subtask status */
  app.patch<{
    Params: { taskId: string; subtaskIndex: string };
    Body: { status?: string; result?: string; errorOutput?: string; tokensUsed?: number };
  }>('/analysis/tasks/:taskId/subtasks/:subtaskIndex', async (request) => {
    const { taskId, subtaskIndex } = request.params;
    const updates = request.body;
    analyzer.updateSubtask(taskId, parseInt(subtaskIndex, 10), updates);
    return { success: true };
  });
}
