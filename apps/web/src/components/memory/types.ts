export interface MemoryNote {
  id: string;
  projectId: string;
  source: string;
  category: string;
  title: string;
  content: string;
  tags: string[];
  relatedFiles: string[];
  importance: number;
  conversationId?: string;
  interactionType?: string;
  createdAt: string;
  updatedAt: string;
}

export type MemoryAccessMode = 'total' | 'self' | 'custom' | 'preset';
export type MemoryPreset = 'recent_decisions' | 'bugs_only' | 'high_priority' | 'agent_activity';
