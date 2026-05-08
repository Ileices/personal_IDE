// ============================================
// Memory Types - Projects, Notes, Context
// ============================================

/** A project container for memory + conversations */
export interface Project {
  id: string;
  name: string;
  description: string;
  /** Root directory on disk for this project */
  rootPath: string;
  /** When this project was created */
  createdAt: string;
  /** Last time any activity happened */
  lastAccessedAt: string;
  /** Total conversations in this project */
  conversationCount: number;
  /** Total memory notes */
  noteCount: number;
}

/** A memory note - a searchable piece of context */
export interface MemoryNote {
  id: string;
  projectId: string;
  /** What generated this note */
  source: 'auto_summary' | 'user_note' | 'agent_log' | 'file_summary' | 'question_answer';
  /** Category for filtering */
  category: string;
  /** Short title */
  title: string;
  /** Full content */
  content: string;
  /** Tags for search */
  tags: string[];
  /** Related file paths */
  relatedFiles: string[];
  /** Importance score 0-100 (auto-computed or user-set) */
  importance: number;
  /** Conversation ID that generated this note */
  conversationId?: string;
  /** Interaction type that created this note (e.g. ask_chat, edit_agent) */
  interactionType?: string;
  createdAt: string;
  updatedAt: string;
}

/** A file summary cached in memory */
export interface FileSummary {
  id: string;
  projectId: string;
  filePath: string;
  /** LLM-generated summary of the file */
  summary: string;
  /** File language/type */
  language: string;
  /** File size in bytes at time of summary */
  fileSize: number;
  /** Hash to detect if file changed */
  contentHash: string;
  /** Key exports/classes/functions */
  keySymbols: string[];
  createdAt: string;
  updatedAt: string;
}

/** Agent run log for audit trail */
export interface AgentRunLog {
  id: string;
  projectId: string;
  conversationId: string;
  /** What task was being performed */
  task: string;
  /** Total iterations executed */
  iterations: number;
  /** All file changes made */
  filesChanged: string[];
  /** Final summary */
  summary: string;
  /** Final state */
  finalState: string;
  /** Total tokens consumed */
  totalTokens: number;
  startedAt: string;
  completedAt: string;
}

/** Question log entry */
export interface QuestionLogEntry {
  id: string;
  projectId: string;
  agentRunId?: string;
  /** The question the LLM asked */
  question: string;
  /** How it was resolved */
  resolution: 'auto_answered' | 'user_answered' | 'skipped' | 'pending';
  /** The answer provided */
  answer?: string;
  createdAt: string;
}

/** Request to create or load a project */
export interface ProjectRequest {
  name: string;
  description?: string;
  rootPath: string;
}

/** Memory search query */
export interface MemorySearchQuery {
  projectId: string;
  query: string;
  /** Filter by source type */
  sources?: MemoryNote['source'][];
  /** Filter by tags */
  tags?: string[];
  /** Max results */
  limit?: number;
}
