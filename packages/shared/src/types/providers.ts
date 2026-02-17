// ============================================
// Provider Types - Multi-provider LLM architecture
// ============================================

/** Supported LLM providers */
export type ProviderType = 'github' | 'ollama' | 'groq' | 'huggingface' | 'cohere' | 'mistral' | 'gemini' | 'together' | 'openrouter' | 'lmstudio';

/** Provider configuration */
export interface ProviderConfig {
  id: ProviderType;
  name: string;
  description: string;
  baseURL: string;
  /** Whether this provider requires an API key */
  requiresApiKey: boolean;
  /** Whether it's a local provider (no internet needed) */
  isLocal: boolean;
  /** Whether it's free to use */
  isFree: boolean;
  /** Setup instructions URL */
  setupUrl: string;
  /** Optional: direct link (no signup needed) */
  noSignupUrl?: string;
  /** Whether the provider is currently enabled */
  enabled: boolean;
  /** API key (if required) */
  apiKey?: string;
  /** Custom base URL override */
  customBaseURL?: string;
  /** Additional notes */
  notes: string;
}

/** A unified model descriptor from any provider */
export interface UnifiedModel {
  id: string;
  name: string;
  provider: ProviderType;
  /** Original model ID from the provider (may differ from our id) */
  providerId: string;
  description: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  contextWindow: number;
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsJsonMode: boolean;
  supportsVision: boolean;
  /** Our effective limit = 95% of contextWindow */
  effectiveTokenLimit: number;
  /** Is this model free to use? */
  isFree: boolean;
  /** Raw metadata from provider */
  meta?: Record<string, any>;
}

/** Token limit enforcement result */
export interface TokenLimitCheck {
  withinLimit: boolean;
  estimatedTokens: number;
  maxAllowed: number;
  effectiveLimit: number;
  reductionNeeded: number;
  suggestion: string;
}

/** Task tracking for incremental work */
export interface TaskTracker {
  id: string;
  projectId: string;
  agentRunId: string;
  title: string;
  totalSubtasks: number;
  completedSubtasks: number;
  currentSubtaskIndex: number;
  subtasks: TaskSubtask[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'paused';
  createdAt: string;
  updatedAt: string;
}

export interface TaskSubtask {
  id: string;
  index: number;
  title: string;
  description: string;
  targetFiles: string[];
  language: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  result?: string;
  errorOutput?: string;
  tokenBudget: number;
  tokensUsed: number;
}

/** Checkpoint for versioning */
export interface Checkpoint {
  id: string;
  projectId: string;
  agentRunId: string;
  iteration: number;
  label: string;
  description: string;
  filesSnapshot: string[];
  gitCommitHash?: string;
  createdAt: string;
  canRollback: boolean;
}

/** Error from code analysis */
export interface CodeError {
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  source: string;  // 'typescript' | 'python' | 'eslint' | 'rustc' etc
  code?: string;
  ruleId?: string;
}

/** Test result from running tests */
export interface TestResult {
  framework: string;
  command: string;
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  duration: number;
  failures: TestFailure[];
  output: string;
}

export interface TestFailure {
  name: string;
  file?: string;
  message: string;
  stack?: string;
  expected?: string;
  actual?: string;
}

/** Codebase analysis chunk */
export interface CodebaseChunk {
  id: string;
  projectId: string;
  path: string;
  chunkIndex: number;
  totalChunks: number;
  summary: string;
  language: string;
  symbols: string[];
  dependencies: string[];
  tokenCount: number;
  createdAt: string;
}

/** Codebase overview */
export interface CodebaseOverview {
  projectId: string;
  totalFiles: number;
  totalLines: number;
  languages: Record<string, number>;
  entryPoints: string[];
  dependencies: string[];
  architecture: string;
  chunks: CodebaseChunk[];
  createdAt: string;
}
