// ============================================
// Chat Types - Messages, Conversations, Roles
// ============================================
import type { StructuredAgentOutput } from './agent.js';

/** The four operational modes the assistant supports */
export type AssistantMode = 'ask' | 'edit' | 'plan' | 'agent';

/** Role of a message sender */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/** Status of a message (for streaming) */
export type MessageStatus = 'pending' | 'streaming' | 'complete' | 'error' | 'cancelled';

/** A single chat message */
export interface ChatMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  model?: string;
  mode?: AssistantMode;
  /** Tokens used for this message */
  tokenCount?: number;
  /** Files referenced or modified by this message */
  filesReferenced?: string[];
  /** Structured output parsed from the assistant response */
  structuredOutput?: StructuredAgentOutput | null;
  createdAt: string;
  updatedAt: string;
}

/** A conversation (session of messages) */
export interface Conversation {
  id: string;
  projectId: string;
  title: string;
  mode: AssistantMode;
  model: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Request body for sending a chat message */
export interface ChatRequest {
  conversationId?: string;
  projectId: string;
  message: string;
  model: string;
  mode: AssistantMode;
  /** Optional file paths to include as context */
  contextFiles?: string[];
  /** Optional memory notes IDs to include */
  contextMemoryIds?: string[];
  /** Whether to auto-inject relevant memory */
  autoInjectMemory?: boolean;
  /** Override the default system prompt for this request */
  systemPrompt?: string;
  /** Override the session title */
  sessionTitle?: string;
}

/** SSE event types for chat streaming */
export type ChatStreamEvent =
  | { type: 'message_start'; messageId: string; conversationId: string }
  | { type: 'content_delta'; delta: string }
  | { type: 'content_done'; fullContent: string }
  | { type: 'structured_output'; data: StructuredAgentOutput }
  | { type: 'error'; error: string }
  | { type: 'done'; usage?: TokenUsage };

/** Token usage stats */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}
