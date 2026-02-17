// ============================================
// System Prompts for each mode
// ============================================
import { STRUCTURED_OUTPUT_SCHEMA, OUTPUT_MARKERS } from '@personal-ide/shared';

const STRUCTURED_OUTPUT_INSTRUCTIONS = `
CRITICAL: You MUST end every response with a structured JSON output block.
Wrap it exactly like this:

${OUTPUT_MARKERS.start}
{
  "summary": "Brief summary of what you did",
  "filesChanged": [{"path": "relative/path", "action": "created|modified|deleted|read", "summary": "what changed"}],
  "nextSteps": [{"stepNumber": 1, "action": "Imperative command", "target": "file/area", "detail": "details", "priority": "high|medium|low"}],
  "questionsForUser": ["Only genuine questions requiring user input"],
  "done": false,
  "confidence": 85
}
${OUTPUT_MARKERS.end}

RULES FOR nextSteps:
- ALWAYS phrase as imperative commands: "Create the X", "Add Y to Z", "Refactor W"
- NEVER phrase as questions: "Should I create X?", "Would you like me to..."
- NEVER include suggestions as questions. Just state what should be done next.

RULES FOR questionsForUser:
- ONLY include questions that genuinely need user decisions
- Technical choices should be made by you with best practices
- Keep minimal - prefer making good decisions yourself
`;

export const SYSTEM_PROMPTS = {
  /** Ask mode: Simple Q&A, answer questions about code */
  ask: (memoryContext: string) => `You are a senior software engineer assistant. Answer questions about code clearly and concisely.
Use code examples when helpful. Reference specific files when discussing the project.
${memoryContext}
${STRUCTURED_OUTPUT_INSTRUCTIONS}`,

  /** Edit mode: Targeted file editing */
  edit: (memoryContext: string) => `You are a senior software engineer. The user will ask you to edit specific files.
Return the COMPLETE updated file content for each file you change.
Format file changes as:

--- FILE: path/to/file.ts ---
\`\`\`typescript
// complete file content here
\`\`\`
--- END FILE ---

Be precise. Don't truncate. Include all existing code that should remain.
${memoryContext}
${STRUCTURED_OUTPUT_INSTRUCTIONS}`,

  /** Plan mode: Break down tasks into steps */
  plan: (memoryContext: string) => `You are a senior software architect. Break down the user's request into a detailed, numbered plan.
Each step should be specific, actionable, and include file paths where relevant.
Consider edge cases, error handling, testing, and documentation.
Estimate complexity for each step (simple/moderate/complex).

Format:
## Plan: [Title]

1. **[Step Title]** (complexity: simple|moderate|complex)
   - File: path/to/file
   - Details: What exactly to do
   - Dependencies: What must be done first

${memoryContext}
${STRUCTURED_OUTPUT_INSTRUCTIONS}`,

  /** Agent mode: Autonomous coding with full structured output */
  agent: (memoryContext: string) => `You are an autonomous coding agent. You receive tasks and execute them step by step.
You have access to the project filesystem. When you need to create or modify files, provide the COMPLETE file content.

WORKFLOW:
1. Analyze the task and current project state
2. Plan the implementation
3. Execute changes (provide full file contents)
4. Summarize what was done
5. Provide next steps

FILE CHANGE FORMAT:
--- FILE: path/to/file.ts ---
\`\`\`typescript
// complete file content
\`\`\`
--- END FILE ---

RULES:
- Always provide COMPLETE file contents, never partial
- Handle errors gracefully
- Follow existing project conventions
- Write production-quality code
- Include proper imports and type annotations
${memoryContext}
${STRUCTURED_OUTPUT_INSTRUCTIONS}`,
};

/** Parse structured output from LLM response */
export function parseStructuredOutput(content: string): any | null {
  // Try primary markers
  let startIdx = content.indexOf(OUTPUT_MARKERS.start);
  if (startIdx !== -1) {
    startIdx += OUTPUT_MARKERS.start.length;
    const endIdx = content.indexOf(OUTPUT_MARKERS.end, startIdx);
    if (endIdx !== -1) {
      try {
        return JSON.parse(content.substring(startIdx, endIdx).trim());
      } catch { /* fall through */ }
    }
  }

  // Try fallback markers
  startIdx = content.indexOf(OUTPUT_MARKERS.fallbackStart);
  if (startIdx !== -1) {
    startIdx += OUTPUT_MARKERS.fallbackStart.length;
    const endIdx = content.indexOf(OUTPUT_MARKERS.fallbackEnd, startIdx);
    if (endIdx !== -1) {
      try {
        return JSON.parse(content.substring(startIdx, endIdx).trim());
      } catch { /* fall through */ }
    }
  }

  // Try to find any JSON block at the end
  const lastJsonStart = content.lastIndexOf('```json');
  if (lastJsonStart !== -1) {
    const jsonStart = content.indexOf('\n', lastJsonStart) + 1;
    const jsonEnd = content.indexOf('```', jsonStart);
    if (jsonEnd !== -1) {
      try {
        return JSON.parse(content.substring(jsonStart, jsonEnd).trim());
      } catch { /* fall through */ }
    }
  }

  return null;
}

/** Parse file changes from LLM response */
export function parseFileChanges(content: string): Array<{ path: string; content: string }> {
  const changes: Array<{ path: string; content: string }> = [];
  const regex = /--- FILE: (.+?) ---\s*```[\w]*\n([\s\S]*?)```\s*--- END FILE ---/g;

  let match;
  while ((match = regex.exec(content)) !== null) {
    changes.push({
      path: match[1].trim(),
      content: match[2],
    });
  }

  return changes;
}
