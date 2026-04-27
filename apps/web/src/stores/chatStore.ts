// ============================================
// Chat Store - Messages, streaming, conversations
// Enhanced: conversation list, tabs, management
// ============================================
import { create } from 'zustand';
import type { AssistantMode, ChatMessage } from '@personal-ide/shared';
import { apiStream, apiGet, apiPut, apiDelete } from '../api/client';

/** Summary info for a conversation in the sidebar */
export interface ConversationInfo {
  id: string;
  title: string;
  mode: string;
  model: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ChatStore {
  messages: ChatMessage[];
  conversationId: string | null;
  isStreaming: boolean;
  streamingContent: string;
  mode: AssistantMode;
  selectedModel: string;
  contextFiles: string[];
  abortController: AbortController | null;

  // Conversation management
  conversations: ConversationInfo[];
  conversationsLoaded: boolean;

  setMode: (mode: AssistantMode) => void;
  setModel: (model: string) => void;
  setContextFiles: (files: string[]) => void;
  sendMessage: (projectId: string, message: string) => Promise<void>;
  stopStreaming: () => void;
  loadConversation: (conversationId: string) => Promise<void>;
  newConversation: () => void;
  clearMessages: () => void;
  // New conversation management
  loadConversations: (projectId: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  renameConversation: (conversationId: string, title: string) => Promise<void>;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  conversationId: null,
  isStreaming: false,
  streamingContent: '',
  mode: 'ask',
  selectedModel: 'openai/gpt-4.1',
  contextFiles: [],
  abortController: null,

  // Conversation management
  conversations: [],
  conversationsLoaded: false,

  setMode: (mode) => set({ mode }),
  setModel: (model) => set({ selectedModel: model }),
  setContextFiles: (files) => set({ contextFiles: files }),

  sendMessage: async (projectId: string, message: string) => {
    const { conversationId, selectedModel, mode, contextFiles } = get();

    // Add user message to UI immediately
    const userMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      conversationId: conversationId || '',
      role: 'user',
      content: message,
      status: 'complete',
      mode,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    set(s => ({
      messages: [...s.messages, userMsg],
      isStreaming: true,
      streamingContent: '',
    }));

    const abort = new AbortController();
    set({ abortController: abort });

    let fullContent = '';
    let newConvId = conversationId;

    try {
      await apiStream(
        '/chat/send',
        {
          projectId,
          message,
          model: selectedModel,
          mode,
          conversationId,
          contextFiles: contextFiles.length > 0 ? contextFiles : undefined,
          autoInjectMemory: true,
        },
        (event) => {
          switch (event.type) {
            case 'message_start':
              if (event.conversationId) newConvId = event.conversationId;
              break;
            case 'content_delta':
              fullContent += event.delta;
              set({ streamingContent: fullContent });
              break;
            case 'content_done':
              fullContent = event.fullContent || fullContent;
              break;
            case 'done': {
              const assistantMsg: ChatMessage = {
                id: `msg-${Date.now()}`,
                conversationId: newConvId || '',
                role: 'assistant',
                content: fullContent,
                status: 'complete',
                model: selectedModel,
                mode,
                tokenCount: event.usage?.totalTokens,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              set(s => ({
                messages: [...s.messages, assistantMsg],
                isStreaming: false,
                streamingContent: '',
                conversationId: newConvId,
                abortController: null,
              }));
              if (newConvId && (!conversationId || newConvId !== conversationId)) {
                void get().loadConversations(projectId);
              }
              break;
            }
            case 'error':
              set(s => ({
                messages: [...s.messages, {
                  id: `err-${Date.now()}`,
                  conversationId: newConvId || '',
                  role: 'assistant',
                  content: `❌ Error: ${event.error}`,
                  status: 'error',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                } as ChatMessage],
                isStreaming: false,
                streamingContent: '',
                abortController: null,
              }));
              break;
          }
        },
        (error) => {
          set(s => ({
            messages: [...s.messages, {
              id: `err-${Date.now()}`,
              conversationId: '',
              role: 'assistant',
              content: `❌ ${error}`,
              status: 'error',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            } as ChatMessage],
            isStreaming: false,
            abortController: null,
          }));
        },
        abort.signal
      );
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        set({ isStreaming: false, abortController: null });
      }
    }
  },

  stopStreaming: () => {
    const { abortController, streamingContent } = get();
    abortController?.abort();

    if (streamingContent) {
      set(s => ({
        messages: [...s.messages, {
          id: `cancelled-${Date.now()}`,
          conversationId: s.conversationId || '',
          role: 'assistant',
          content: streamingContent + '\n\n*[Stopped by user]*',
          status: 'cancelled',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as ChatMessage],
        isStreaming: false,
        streamingContent: '',
        abortController: null,
      }));
    } else {
      set({ isStreaming: false, streamingContent: '', abortController: null });
    }
  },

  loadConversation: async (conversationId: string) => {
    try {
      const data = await apiGet<{ messages: any[] }>(`/chat/messages/${conversationId}`);
      const mapped: ChatMessage[] = data.messages.map(m => ({
        id: m.id,
        conversationId: m.conversation_id,
        role: m.role,
        content: m.content,
        status: m.status,
        model: m.model,
        mode: m.mode,
        tokenCount: m.token_count,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
      }));
      set({ messages: mapped, conversationId });
    } catch { /* ignore */ }
  },

  newConversation: () => set({
    messages: [],
    conversationId: null,
    streamingContent: '',
    isStreaming: false,
  }),

  clearMessages: () => set({ messages: [], conversationId: null }),

  // ── Conversation Management ──

  loadConversations: async (projectId: string) => {
    try {
      const data = await apiGet<{ conversations: any[] }>(`/chat/conversations/${projectId}`);
      const convos: ConversationInfo[] = (data.conversations || []).map((c: any) => ({
        id: c.id,
        title: c.title || c.summary || 'Untitled',
        mode: c.mode || 'ask',
        model: c.model || '',
        messageCount: c.message_count || 0,
        createdAt: c.created_at || c.createdAt || '',
        updatedAt: c.updated_at || c.updatedAt || '',
      }));
      set({ conversations: convos, conversationsLoaded: true });
    } catch {
      // Server may not support this endpoint yet — graceful degradation
      set({ conversations: [], conversationsLoaded: true });
    }
  },

  deleteConversation: async (conversationId: string) => {
    try {
      await apiDelete(`/chat/conversations/${conversationId}`);
      set(s => ({
        conversations: s.conversations.filter(c => c.id !== conversationId),
        ...(s.conversationId === conversationId ? { messages: [], conversationId: null } : {}),
      }));
    } catch {
      // Graceful — just remove from local state
      set(s => ({
        conversations: s.conversations.filter(c => c.id !== conversationId),
      }));
    }
  },

  renameConversation: async (conversationId: string, title: string) => {
    try {
      await apiPut(`/chat/conversations/${conversationId}`, { title });
    } catch { /* non-critical */ }
    set(s => ({
      conversations: s.conversations.map(c =>
        c.id === conversationId ? { ...c, title } : c
      ),
    }));
  },
}));
