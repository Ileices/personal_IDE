// ============================================
// Structured Output Schema
// Forces the LLM to produce parseable output
// ============================================

/**
 * JSON Schema that is injected into the system prompt
 * to force the LLM to return structured, parseable output.
 * This is the contract between the LLM and the automation loop.
 */
export const STRUCTURED_OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    summary: {
      type: 'string',
      description: 'A concise summary of what was accomplished in this step. 1-3 sentences.',
    },
    filesChanged: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path' },
          action: { type: 'string', enum: ['created', 'modified', 'deleted', 'read'] },
          summary: { type: 'string', description: 'What was changed in this file' },
        },
        required: ['path', 'action', 'summary'],
      },
    },
    nextSteps: {
      type: 'array',
      description: 'Imperative commands for next actions. NEVER phrase as questions.',
      items: {
        type: 'object',
        properties: {
          stepNumber: { type: 'number' },
          action: { type: 'string', description: 'Imperative command. e.g. "Create the auth middleware"' },
          target: { type: 'string', description: 'File path or area this step targets' },
          detail: { type: 'string', description: 'Detailed description of what to do' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['stepNumber', 'action', 'target', 'detail', 'priority'],
      },
    },
    questionsForUser: {
      type: 'array',
      items: { type: 'string' },
      description: 'Questions that genuinely require user input. Keep minimal.',
    },
    done: {
      type: 'boolean',
      description: 'True if the entire task is complete and no more steps needed.',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 100,
      description: 'Confidence level in the quality of the output. 0-100.',
    },
  },
  required: ['summary', 'filesChanged', 'nextSteps', 'questionsForUser', 'done', 'confidence'],
};

/**
 * Delimiter markers used to extract structured JSON from mixed LLM output.
 * The LLM wraps its structured output between these markers.
 */
export const OUTPUT_MARKERS = {
  start: '```json:structured_output',
  end: '```',
  fallbackStart: '<!-- STRUCTURED_OUTPUT_START -->',
  fallbackEnd: '<!-- STRUCTURED_OUTPUT_END -->',
} as const;

/**
 * Max sizes for various log files
 */
export const LOG_LIMITS = {
  /** Max size of each question log file in bytes (5MB) */
  maxQuestionLogFileSize: 5 * 1024 * 1024,
  /** Max total question log storage per project in bytes (50MB) */
  maxQuestionLogTotalSize: 50 * 1024 * 1024,
  /** Max memory notes per project */
  maxMemoryNotesPerProject: 10000,
  /** Max characters per memory note */
  maxNoteContentLength: 50000,
} as const;
