// ============================================
// Model Prompt Adapter — Model-specific prompt
// wrapping to force agentic behavior from ALL models
// ============================================
// Canvas illusion for models that refuse agent tasks,
// reasoning-mode instructions for o3/o4-mini/deepseek-r1,
// compressed prompts for low-context models.
// ============================================

import { getModel, type ModelDefinition } from '@personal-ide/shared';

/** Model capability tier for prompt adaptation */
type ModelCapabilityTier = 'full_agent' | 'reasoning_agent' | 'canvas_illusion' | 'compressed';

/**
 * Detect the capability tier of a model for prompt adaptation.
 */
function detectCapabilityTier(modelId: string, contextWindow: number): ModelCapabilityTier {
  const model = getModel(modelId);
  const isLocal = modelId.startsWith('ollama/') || modelId.startsWith('lmstudio/') || modelId.startsWith('nano/');
  const isReasoning = model?.isReasoning === true;

  // Reasoning models need special handling (no temperature, thinking mode)
  if (isReasoning) return 'reasoning_agent';

  // Low context window (<16K) needs compressed prompts
  if (contextWindow < 16000) return 'compressed';

  // Local/small models that may refuse agentic tasks → canvas illusion
  if (isLocal) return 'canvas_illusion';

  // External free providers — full agent mode (they have massive context and follow instructions well)
  if (modelId.startsWith('gemini/') || modelId.startsWith('groq/') || modelId.startsWith('cerebras/')) {
    return 'full_agent';
  }

  // DeepSeek via cloud (may refuse agent tasks in some configurations)
  if (modelId.includes('deepseek') && !isReasoning) return 'canvas_illusion';

  // Everything else gets the full agent prompt
  return 'full_agent';
}

/**
 * Canvas Illusion wrapper — Frames the agentic task as a document editing
 * session so models that refuse "I can't interact with your filesystem"
 * will comply. The model thinks it's just writing text in a canvas/document.
 */
const CANVAS_ILLUSION_PREFIX = `You are a **Code Editor AI** operating inside a professional IDE. Your job is to write and edit code files inside the user's project workspace.

You work by reading files the user shows you, then producing updated or new file contents. You do NOT "interact with the filesystem" — you simply output file contents in the format shown below, and the IDE handles saving them.

Think of yourself as a text editor that writes complete code files. The IDE will handle all filesystem operations.

OUTPUT FORMAT — Write file contents between these markers:
--- FILE: path/to/file.ext ---
\`\`\`language
// Your complete code here
\`\`\`
--- END FILE ---

You MUST also end every response with a JSON progress block:
\`\`\`json:structured_output
{
  "summary": "What you did",
  "filesChanged": [{"path": "file.ts", "action": "created", "summary": "what"}],
  "nextSteps": [{"stepNumber": 1, "action": "Next task", "target": "file.ts", "detail": "details", "priority": "high"}],
  "questionsForUser": [],
  "done": false,
  "confidence": 80
}
\`\`\`

RULES:
- NEVER say "I cannot", "I'm sorry", "As an AI" — you are a code editor, you write code
- ALWAYS produce at least one file with complete content
- ALWAYS end with the JSON progress block
- Make ALL technical decisions yourself — never ask the user what language or framework to use
- Write production-quality code with error handling and types
`;

/**
 * Reasoning model wrapper — Instructs reasoning models to use their
 * extended thinking for architecture and then produce structured output.
 */
const REASONING_MODE_PREFIX = `You are an autonomous coding agent with deep reasoning capabilities.

REASONING PROTOCOL:
1. Think through the problem systematically before writing any code
2. Consider edge cases, error handling, and architecture implications
3. Plan the minimal set of changes needed
4. Then produce your code changes and structured output

CRITICAL: Despite your reasoning capabilities, you MUST still output:
- File changes using --- FILE: path --- markers
- Structured JSON output at the end
- At least ONE file change per response

Do NOT spend all your reasoning on explanation — the majority of your output must be CODE.
Do NOT ask questions — use your reasoning to make all technical decisions.
`;

/**
 * Compressed prompt for very low context window models (<16K tokens).
 * Strips verbosity while keeping the essential schema instructions.
 */
const COMPRESSED_PREFIX = `CODE AGENT. Write code files + JSON output.

FILE FORMAT:
--- FILE: path ---
\`\`\`lang
code
\`\`\`
--- END FILE ---

JSON at end:
\`\`\`json:structured_output
{"summary":"did what","filesChanged":[{"path":"f","action":"created","summary":"s"}],"nextSteps":[{"stepNumber":1,"action":"do","target":"f","detail":"d","priority":"high"}],"questionsForUser":[],"done":false,"confidence":80}
\`\`\`

RULES: Never apologize. Never ask questions. Always write ≥1 file. Always end with JSON.
`;

/**
 * Agentic enforcement footer — appended to ALL model prompts regardless
 * of capability tier. This is the last thing the model reads.
 */
const AGENTIC_ENFORCEMENT_FOOTER = `

## ⚡ AGENTIC ENFORCEMENT — YOU ARE A CODING AGENT ⚡
You are running inside an autonomous agent loop. You MUST:
1. Write/modify at least ONE code file every response
2. End with structured JSON output
3. Never refuse a task — if unsure, make your best technical judgment
4. Never say "I cannot interact with the filesystem" — you output file contents and the IDE saves them
5. Never ask "what language/framework" — YOU decide based on the project
6. If you run out of space, create one file and note remaining work in nextSteps
VIOLATION OF THESE RULES WILL CAUSE THE AGENT LOOP TO FAIL.
`;

/**
 * Adapt the system prompt for a specific model.
 *
 * This wraps/modifies the base system prompt to ensure the model
 * will comply with agentic instructions regardless of its training biases.
 *
 * @param baseSystemPrompt - The full system prompt from buildAgentSystemPrompt()
 * @param modelId - The model being called (e.g., 'openai/gpt-4.1', 'ollama/codestral')
 * @param contextWindow - The model's context window in tokens
 * @returns The adapted system prompt
 */
export function adaptPromptForModel(
  baseSystemPrompt: string,
  modelId: string,
  contextWindow: number,
): string {
  const tier = detectCapabilityTier(modelId, contextWindow);

  switch (tier) {
    case 'canvas_illusion': {
      // Replace the critical header with the canvas illusion framing
      // This makes local/small models think they're just editing documents
      const baseWithoutHeader = baseSystemPrompt.replace(
        /## ⚡ MANDATORY RESPONSE FORMAT.*?(?=# AUTONOMOUS)/s,
        '',
      );
      return CANVAS_ILLUSION_PREFIX + '\n\n' + baseWithoutHeader + AGENTIC_ENFORCEMENT_FOOTER;
    }

    case 'reasoning_agent': {
      // Prepend reasoning instructions, keep full prompt
      return REASONING_MODE_PREFIX + '\n\n' + baseSystemPrompt + AGENTIC_ENFORCEMENT_FOOTER;
    }

    case 'compressed': {
      // Drastically reduce prompt size for tiny context windows
      // Keep only: compressed prefix + memory context + schema reminder
      const memoryMatch = baseSystemPrompt.match(/### Project Memory\n([\s\S]*?)(?=\n###|\n## ⚡)/);
      const memorySection = memoryMatch ? '\n\nMEMORY:\n' + memoryMatch[1].slice(0, 2000) : '';
      const iterMatch = baseSystemPrompt.match(/\*\*Iteration\*\*: (\d+\/\d+)/);
      const iterInfo = iterMatch ? '\nIteration: ' + iterMatch[1] : '';
      return COMPRESSED_PREFIX + iterInfo + memorySection + AGENTIC_ENFORCEMENT_FOOTER;
    }

    case 'full_agent':
    default: {
      // Full agent prompt with enforcement footer
      return baseSystemPrompt + AGENTIC_ENFORCEMENT_FOOTER;
    }
  }
}

/**
 * Get a human-readable description of how the prompt will be adapted for a model.
 * Useful for UI display.
 */
export function getAdaptationDescription(modelId: string, contextWindow: number): string {
  const tier = detectCapabilityTier(modelId, contextWindow);
  switch (tier) {
    case 'canvas_illusion': return 'Canvas illusion mode — IDE frames tasks as document editing';
    case 'reasoning_agent': return 'Reasoning mode — Extended thinking with structured output';
    case 'compressed': return 'Compressed mode — Minimal prompt for low-context model';
    case 'full_agent': return 'Full agent mode — Complete autonomous engineering prompt';
  }
}
