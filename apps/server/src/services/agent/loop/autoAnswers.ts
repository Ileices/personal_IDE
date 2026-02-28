// ============================================
// Auto-Answer Builder
// Extracted from enhancedLoop.ts for <1000 LOC
// ============================================

/**
 * Build a context-aware auto-answer for LLM-generated questions.
 * This prevents the agent from pausing for user input on questions
 * that can be inferred from the codebase and task context.
 */
export function buildAutoAnswer(
  question: string,
  context: {
    codebaseOverview: string;
    task: string;
    projectLanguages: string[];
    tierContext: string;
  },
): string {
  const qLower = question.toLowerCase();

  if (qLower.includes('language') || qLower.includes('framework') || qLower.includes('technology')) {
    const langs = context.projectLanguages.length ? context.projectLanguages.join(', ') : 'TypeScript';
    return 'Use ' + langs + '. ' + (context.tierContext ? context.tierContext.slice(0, 200) : 'Choose based on project type.');
  }

  if (qLower.includes('structure') || qLower.includes('architecture') || qLower.includes('organize') || qLower.includes('directory')) {
    return 'Follow standard project structure. ' + (context.codebaseOverview ? context.codebaseOverview.slice(0, 300) : 'Use src/ for source, tests/ for tests.');
  }

  if (qLower.includes('component') || qLower.includes('section') || qLower.includes('main') || qLower.includes('files')) {
    return 'Analyze the codebase yourself and proceed. ' + (context.codebaseOverview ? 'Overview: ' + context.codebaseOverview.slice(0, 300) : '');
  }

  if (qLower.includes('test')) {
    return 'Yes, write tests using the project test framework.';
  }

  if (qLower.includes('implement') || qLower.includes('functionality') || qLower.includes('specific')) {
    return 'Implement everything described in the task: ' + context.task.slice(0, 300);
  }

  if (qLower.includes('purpose') || qLower.includes('goal') || qLower.includes('expected') || qLower.includes('outcome') || qLower.includes('change')) {
    return 'The goal is to complete the task: ' + context.task.slice(0, 300);
  }

  return 'Make your best technical decision. Languages: ' + (context.projectLanguages.join(', ') || 'auto-detect') + '. Task: ' + context.task.slice(0, 200);
}
