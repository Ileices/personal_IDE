// ============================================
// Compressed Agent System Prompt (~1500 tokens)
// For GitHub Models' 8K per-request cap tier.
// Strips all verbosity while keeping:
//   - File change format (--- FILE: path ---)
//   - Structured JSON output schema
//   - Core agentic rules
//   - Minimal context injection
// ============================================

/**
 * Build a compressed system prompt for models with severe per-request
 * token caps (e.g. GitHub Models 8K tier). Target: ~1500 tokens total
 * to leave ~6000 tokens for context + response.
 */
export function buildCompressedSystemPrompt(opts: {
  iteration: number;
  maxIterations: number;
  projectLanguages?: string[];
  memorySnippet?: string;
  errorsSnippet?: string;
}): string {
  const { iteration, maxIterations, projectLanguages, memorySnippet, errorsSnippet } = opts;

  const langStr = projectLanguages?.length ? projectLanguages.slice(0, 3).join(', ') : 'TypeScript';

  let prompt = `# Autonomous Coding Agent
Iteration ${iteration}/${maxIterations}. Languages: ${langStr}.

## Rules
- Write code files. End with JSON output. Never apologize. Never ask questions.
- Make ALL technical decisions yourself. Create ≥1 file per response.

## File Format
--- FILE: path/file.ext ---
\`\`\`lang
// complete content
\`\`\`
--- END FILE ---

## JSON Output (REQUIRED at end)
\`\`\`json:structured_output
{
  "summary": "what you did",
  "filesChanged": [{"path": "f", "action": "created|modified|deleted", "summary": "s"}],
  "nextSteps": [{"stepNumber": 1, "action": "do X", "target": "file", "detail": "d", "priority": "high"}],
  "questionsForUser": [],
  "done": false,
  "confidence": 80
}
\`\`\`

## Directory Structure
Organize into subdirs (src/, components/, services/, etc). Never dump in root.

## Agent Protocol
- If unsure, make best-practice decision and proceed
- If file too large, split across iterations
- Track progress in nextSteps
- Set done=true only when ALL work complete`;

  // Inject compressed memory if available
  if (memorySnippet) {
    prompt += `\n\n## Memory\n${memorySnippet.slice(0, 800)}`;
  }

  // Inject compressed error context
  if (errorsSnippet) {
    prompt += `\n\n## Errors to Fix\n${errorsSnippet.slice(0, 500)}`;
  }

  return prompt;
}

/**
 * Check if a model needs the compressed prompt based on its tier.
 * Models on GitHub's 8K input token cap need aggressive compression.
 */
export function needsCompressedPrompt(tier: string): boolean {
  return ['low', 'high', 'reasoning', 'reasoning_mini', 'deepseek', 'grok', 'grok_mini'].includes(tier);
}
