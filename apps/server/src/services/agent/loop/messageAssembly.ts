// ============================================
// Message Assembly — Extracted from enhancedLoop.ts
// Handles draining the queued user messages,
// loop detection breakout prompts, and schema
// miss recovery task construction.
// ============================================

type EmitFn = (event: any) => void;

export interface QueuedMessage {
  id: string;
  content: string;
  timestamp: string;
  priority: 'normal' | 'high';
}

/**
 * Drain all queued user messages, sorted by priority.
 * Returns the messages and clears the queue.
 */
export function drainMessageQueue(queue: QueuedMessage[]): {
  messages: QueuedMessage[];
  remaining: QueuedMessage[];
} {
  if (queue.length === 0) return { messages: [], remaining: [] };

  // Sort high priority first
  const messages = [...queue].sort((a, b) =>
    a.priority === 'high' && b.priority !== 'high' ? -1 :
    b.priority === 'high' && a.priority !== 'high' ? 1 : 0,
  );

  return { messages, remaining: [] };
}

/**
 * Build a context string from queued messages to inject into the current task.
 */
export function formatQueuedMessages(messages: QueuedMessage[]): string {
  if (messages.length === 0) return '';

  let context = '\n\n--- USER MESSAGES (queued while you were working) ---\n';
  for (const qm of messages) {
    context += `[${qm.priority.toUpperCase()}] ${qm.content}\n\n`;
  }
  context += '--- END QUEUED MESSAGES ---\n';
  context += 'Incorporate these user requests into your current work plan. High priority messages should be addressed first.\n';
  return context;
}

/**
 * Build a loop breakout prompt when the agent is stuck in a loop.
 * Uses the ORIGINAL task, not accumulated junk.
 */
export function buildLoopBreakoutTask(
  projectRoot: string,
  originalTask: string,
  loopPattern: string,
  codebaseOverview: string,
  breakoutAttempt: number,
): string {
  let task = `🔄 LOOP BREAKOUT (attempt #${breakoutAttempt}):
The agent was stuck repeating: "${loopPattern}"

ORIGINAL TASK: ${originalTask}

CURRENT CODEBASE OVERVIEW:
${codebaseOverview.slice(0, 1000)}

INSTRUCTIONS:
- Take a completely DIFFERENT approach to the task
- If you were trying to modify files, try creating new ones instead
- If you were stuck on an error, skip that file and work on something else
- Focus on producing at least ONE meaningful file change

`;

  // Forcefully re-inject the schema requirement
  task += [
    '',
    'ABSOLUTE REQUIREMENT: You MUST output file changes using --- FILE: path --- markers AND end with the structured JSON block.',
    'If you cannot complete the full task in one step, create at least ONE file with meaningful content.',
    'Example:',
    '',
    '--- FILE: src/main.ts ---',
    '```typescript',
    '// your code here',
    '```',
    '--- END FILE ---',
    '',
    '```json:structured_output',
    '{"summary": "Created main.ts", "filesChanged": [{"path": "src/main.ts", "action": "created", "summary": "Initial implementation"}], "nextSteps": [{"stepNumber": 1, "action": "Expand implementation", "target": "src/main.ts", "detail": "Add core logic", "priority": "high"}], "questionsForUser": [], "done": false, "confidence": 75}',
    '```',
  ].join('\n');

  return task;
}

/**
 * Build a schema-miss recovery task when the LLM didn't return structured JSON.
 */
export function buildSchemaMissTask(
  initialTask: string,
  fileChangesCount: number,
  lastErrorContext: string,
): string {
  let task = `CRITICAL: Your previous output was missing the required structured JSON output block.

You MUST end EVERY response with:
\`\`\`json:structured_output
{"summary": "...", "filesChanged": [...], "nextSteps": [...], "questionsForUser": [], "done": false, "confidence": N}
\`\`\`

${fileChangesCount > 0 ? `You made ${fileChangesCount} file change(s) which were applied successfully.` : 'No file changes were detected in your output.'}
${lastErrorContext ? `Current errors:\n${lastErrorContext.slice(0, 500)}` : ''}

Continue working on: ${initialTask.slice(0, 500)}

IMPORTANT: Focus on producing the structured JSON output block. It is REQUIRED.`;

  return task;
}

/**
 * Check if the current task content should be stored in conversation memory.
 * Schema-miss retries and loop detection prompts pollute history.
 */
export function shouldStoreInMemory(taskContent: string): boolean {
  if (taskContent.includes('previous output was missing')) return false;
  if (taskContent.includes('LOOP DETECTED')) return false;
  if (taskContent.includes('LOOP BREAKOUT')) return false;
  return true;
}

/**
 * Check if the response content is a failed/apologetic response.
 */
export function isFailedResponse(content: string): boolean {
  const contentLower = content.toLowerCase().slice(0, 300);
  return (
    (contentLower.includes("i'm sorry") ||
      contentLower.includes("i apologize") ||
      contentLower.includes("as an ai")) &&
    !content.includes('--- FILE:')
  );
}
