// ============================================
// Conversation Sidebar — Conversation tabs,
// history list, new chat, switch, delete
// ============================================
import React, { useState, useEffect } from 'react';
import { useChatStore, type ConversationInfo } from '../stores/chatStore';
import { useProjectStore } from '../stores/projectStore';
import {
  MessageSquare, Plus, Trash2, ChevronLeft, ChevronRight,
  Clock, Bot, Edit3, Check, X,
} from 'lucide-react';

interface ConversationSidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function ConversationSidebar({ collapsed = false, onToggleCollapse }: ConversationSidebarProps) {
  const {
    conversations, conversationsLoaded, conversationId,
    loadConversations, loadConversation, newConversation,
    deleteConversation, renameConversation,
  } = useChatStore();
  const { activeProject } = useProjectStore();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Load conversations when project changes
  useEffect(() => {
    if (activeProject?.id) {
      loadConversations(activeProject.id);
    }
  }, [activeProject?.id]);

  const handleNewChat = () => {
    newConversation();
  };

  const handleSwitch = (convId: string) => {
    if (convId === conversationId) return;
    loadConversation(convId);
  };

  const handleDelete = (convId: string) => {
    deleteConversation(convId);
    setConfirmDeleteId(null);
  };

  const handleRenameStart = (conv: ConversationInfo) => {
    setRenamingId(conv.id);
    setRenameValue(conv.title);
  };

  const handleRenameConfirm = () => {
    if (renamingId && renameValue.trim()) {
      renameConversation(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  };

  const handleRenameCancel = () => {
    setRenamingId(null);
    setRenameValue('');
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return 'Just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      const diffDay = Math.floor(diffHr / 24);
      if (diffDay < 7) return `${diffDay}d ago`;
      return d.toLocaleDateString();
    } catch {
      return '';
    }
  };

  // Collapsed state — just show toggle button
  if (collapsed) {
    return (
      <div className="w-8 flex flex-col items-center py-2 border-r border-ide-border bg-ide-sidebar">
        <button
          onClick={onToggleCollapse}
          className="p-1 text-ide-text-dim hover:text-ide-text rounded"
          title="Show conversations"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="mt-2 writing-mode-vertical text-[9px] text-ide-text-dim">
          {conversations.length} chats
        </div>
      </div>
    );
  }

  return (
    <div className="w-56 flex flex-col border-r border-ide-border bg-ide-sidebar">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-2 border-b border-ide-border">
        <div className="flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5 text-ide-accent" />
          <span className="text-xs font-medium text-ide-text">Conversations</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleNewChat}
            className="p-1 text-ide-text-dim hover:text-ide-accent rounded hover:bg-ide-bg/50"
            title="New conversation"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-1 text-ide-text-dim hover:text-ide-text rounded"
              title="Hide sidebar"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Active Conversation Indicator */}
      {!conversationId && (
        <div className="px-2 py-1.5 bg-ide-accent/10 border-b border-ide-accent/20">
          <div className="flex items-center gap-1.5 text-[10px] text-ide-accent">
            <Bot className="w-3 h-3" />
            <span className="font-medium">New Chat</span>
          </div>
        </div>
      )}

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {!conversationsLoaded ? (
          <div className="flex items-center justify-center py-8 text-ide-text-dim text-xs">
            Loading...
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-ide-text-dim text-xs">
            <MessageSquare className="w-6 h-6 mb-2 opacity-30" />
            <span>No conversations yet</span>
            <span className="text-[10px] mt-0.5">Start chatting to create one</span>
          </div>
        ) : (
          <div className="py-1">
            {conversations.map(conv => {
              const isActive = conv.id === conversationId;
              const isDeleting = confirmDeleteId === conv.id;
              const isRenaming = renamingId === conv.id;

              return (
                <div
                  key={conv.id}
                  className={`group px-2 py-1.5 cursor-pointer transition-colors border-l-2 ${
                    isActive
                      ? 'bg-ide-accent/10 border-ide-accent'
                      : 'border-transparent hover:bg-ide-bg/50'
                  }`}
                  onClick={() => !isRenaming && !isDeleting && handleSwitch(conv.id)}
                >
                  {/* Rename Mode */}
                  {isRenaming ? (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRenameConfirm();
                          if (e.key === 'Escape') handleRenameCancel();
                        }}
                        className="flex-1 bg-ide-bg border border-ide-border rounded px-1 py-0.5 text-[10px] focus:outline-none focus:border-ide-accent"
                        onClick={e => e.stopPropagation()}
                      />
                      <button onClick={(e) => { e.stopPropagation(); handleRenameConfirm(); }} className="p-0.5 text-green-400 hover:text-green-300">
                        <Check className="w-3 h-3" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleRenameCancel(); }} className="p-0.5 text-ide-text-dim hover:text-ide-error">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : isDeleting ? (
                    /* Delete Confirmation */
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-ide-error flex-1">Delete?</span>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(conv.id); }} className="px-1.5 py-0.5 text-[9px] bg-ide-error/20 text-ide-error rounded hover:bg-ide-error/30">
                        Yes
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }} className="px-1.5 py-0.5 text-[9px] bg-ide-bg text-ide-text-dim rounded hover:bg-ide-bg/80">
                        No
                      </button>
                    </div>
                  ) : (
                    /* Normal Display */
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-ide-text truncate flex-1 pr-1">
                          {conv.title}
                        </span>
                        {/* Hover Actions */}
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRenameStart(conv); }}
                            className="p-0.5 text-ide-text-dim hover:text-ide-accent rounded"
                            title="Rename"
                          >
                            <Edit3 className="w-2.5 h-2.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(conv.id); }}
                            className="p-0.5 text-ide-text-dim hover:text-ide-error rounded"
                            title="Delete"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-[9px] text-ide-text-dim mt-0.5">
                        <span className="capitalize">{conv.mode}</span>
                        {conv.messageCount > 0 && <span>{conv.messageCount} msgs</span>}
                        <span className="ml-auto">{formatDate(conv.updatedAt || conv.createdAt)}</span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
