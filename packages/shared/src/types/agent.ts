// ============================================
// Agent Types - Loop, Steps, Structured Output
// ============================================

/** Agent loop states (state machine) */
export type AgentState =
  | 'idle'
  | 'planning'
  | 'executing'
  | 'evaluating'
  | 'waiting_for_user'
  | 'paused'
  | 'complete'
  | 'error';

/**
 * STRUCTURED OUTPUT SCHEMA
 * Every LLM response in agent/plan mode MUST conform to this.
 * The automation loop parses this to extract next steps.
 */
export interface StructuredAgentOutput {
  /** Short summary of what was done this step */
  summary: string;

  /** Files that were changed, created, or read */
  filesChanged: FileChange[];

  /**
   * Next steps - formatted as IMPERATIVE COMMANDS, never questions.
   * These get copied back as the next user message.
   * e.g. "Create the database schema in src/db/schema.ts"
   * NEVER: "Should I create the database schema?"
   */
  nextSteps: AgentStep[];

  /**
   * Questions the LLM has for the user.
   * These are SEPARATED from nextSteps and logged to files.
   * The automation will try to auto-answer these by reading the codebase.
   */
  questionsForUser: string[];

  /** Whether the overall task is complete */
  done: boolean;

  /** Confidence level 0-100 */
  confidence: number;

  /**
   * Shell commands the agent wants to execute (e.g., npm install, npm run dev, test commands).
   * These are executed via the ToolExecutor and results fed back into the next iteration.
   */
  commands?: AgentCommand[];

  /** Edit log tracking symbols affected by changes */
  editLog?: { file: string; symbolsAffected: string[]; changeReason: string }[];
}

/** A command the agent wants to execute in the terminal */
export interface AgentCommand {
  /** Shell command to run */
  command: string;
  /** Purpose of this command */
  purpose: string;
  /** Working directory relative to project root */
  cwd?: string;
  /** Timeout in ms (default 30000) */
  timeoutMs?: number;
}

/** A single file change record */
export interface FileChange {
  path: string;
  action: 'created' | 'modified' | 'deleted' | 'read';
  summary: string;
}

/** A single step for the agent to execute next */
export interface AgentStep {
  /** Sequential step number */
  stepNumber: number;
  /** Imperative command describing what to do */
  action: string;
  /** Target file path or area */
  target: string;
  /** Detailed description of the change */
  detail: string;
  /** Priority: high, medium, low */
  priority: 'high' | 'medium' | 'low';
}

/** Configuration for the agent loop */
export interface AgentConfig {
  /** Max iterations before auto-stop */
  maxIterations: number;
  /** Delay between steps in milliseconds */
  stepDelayMs: number;
  /** Max tokens per LLM call */
  maxTokensPerStep: number;
  /** Whether to auto-approve file changes */
  autoApproveChanges: boolean;
  /** Whether to auto-answer LLM questions */
  autoAnswerQuestions: boolean;
  /** Model to use for the agent loop */
  model: string;
  /** Project root path */
  projectRoot: string;

  // ── New: 24/7 & Rate Limit & Chunking Options ──

  /** Enable 24/7 continuous mode — infinite loop, never stops unless user stops it */
  continuousMode: boolean;
  /** Cooldown delay between iterations in ms (0 = no cooldown) */
  cooldownMs: number;
  /** Skip rate limit checks (for paid/local services like Ollama) */
  bypassRateLimits: boolean;
  /** Enable smart chunking pipeline on token limit errors */
  enableSmartChunking: boolean;
}

/** Status of the current agent run */
export interface AgentRunStatus {
  runId: string;
  projectId: string;
  state: AgentState;
  currentIteration: number;
  maxIterations: number;
  currentStep?: AgentStep;
  totalFilesChanged: number;
  totalTokensUsed: number;
  startedAt: string;
  lastActivityAt: string;
  /** All questions logged so far */
  pendingQuestions: string[];
  /** Error if state is 'error' */
  error?: string;
  /** 24/7 mode active */
  continuousMode?: boolean;
  /** Rate limits bypassed */
  bypassRateLimits?: boolean;
  /** Chunking pipeline status */
  chunkingStatus?: {
    active: boolean;
    currentChunk?: number;
    totalChunks?: number;
    tokensProcessed?: number;
  };
}

/** SSE events for the agent loop */
export type AgentStreamEvent =
  | { type: 'state_change'; state: AgentState }
  | { type: 'step_start'; step: AgentStep; iteration: number }
  | { type: 'step_content'; delta: string }
  | { type: 'step_complete'; output: StructuredAgentOutput }
  | { type: 'file_changed'; change: FileChange }
  | { type: 'question_logged'; question: string }
  | { type: 'auto_answer'; question: string; answer: string }
  | { type: 'run_complete'; summary: string; totalSteps: number }
  | { type: 'error'; error: string }
  | { type: 'paused'; reason: string }
  | { type: 'info'; message: string }
  | { type: 'continuous_mode'; enabled: boolean; cooldownMs: number }
  | { type: 'rate_limit_bypass'; enabled: boolean }
  | { type: 'chunking_start'; totalChunks: number; message: string }
  | { type: 'chunking_progress'; chunkIndex: number; totalChunks: number; tokensUsed: number; message: string }
  | { type: 'chunking_complete'; totalChunks: number; totalTokensUsed: number; message: string }
  | { type: 'chunking_error'; chunkIndex: number; totalChunks: number; error: string }
  | { type: 'cooldown'; ms: number; reason: string };
