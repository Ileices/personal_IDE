// ============================================
// Chat Panel - Messages, streaming, input
// ============================================
import React, { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useProjectStore } from '../stores/projectStore';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Send, Square, Bot, User, Copy, Check, Loader2, ClipboardCopy } from 'lucide-react';

export function ChatPanel() {
  const {
    messages, isStreaming, streamingContent, mode,
    sendMessage, stopStreaming, newConversation
  } = useChatStore();
  const { activeProject } = useProjectStore();
  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedConvo, setCopiedConvo] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const handleSend = () => {
    if (!input.trim() || !activeProject || isStreaming) return;
    sendMessage(activeProject.id, input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 20000);
  };

  const copyConversation = () => {
    const text = messages.map(msg => {
      const role = msg.role === 'user' ? 'USER' : 'ASSISTANT';
      return `--- ${role} ---\n${msg.content}\n`;
    }).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedConvo(true);
    setTimeout(() => setCopiedConvo(false), 20000);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-ide-text-dim">
            <Bot className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">Start a conversation</p>
            <p className="text-xs mt-1">
              Mode: <span className="text-ide-accent capitalize">{mode}</span>
              {activeProject && <> • Project: <span className="text-ide-accent">{activeProject.name}</span></>}
            </p>
          </div>
        )}

        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role !== 'user' && (
              <div className="w-7 h-7 rounded-full bg-ide-accent/20 flex items-center justify-center shrink-0 mt-1">
                <Bot className="w-4 h-4 text-ide-accent" />
              </div>
            )}

            <div className={`max-w-[85%] rounded-lg px-4 py-3 ${
              msg.role === 'user'
                ? 'bg-ide-user-msg border border-ide-border'
                : 'bg-ide-assistant-msg border border-ide-border'
            } ${msg.status === 'error' ? 'border-ide-error/30' : ''}`}>
              <div className="prose prose-invert prose-sm max-w-none select-text">
                <ReactMarkdown
                  components={{
                    code({ className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '');
                      const codeString = String(children).replace(/\n$/, '');
                      const isInline = !match;

                      if (isInline) {
                        return <code className="bg-ide-bg px-1 py-0.5 rounded text-ide-accent text-xs" {...props}>{children}</code>;
                      }

                      return (
                        <div className="relative group my-2">
                          <div className="flex items-center justify-between bg-ide-panel px-3 py-1 rounded-t text-xs text-ide-text-dim">
                            <span>{match[1]}</span>
                            <button
                              onClick={() => copyToClipboard(codeString, msg.id + match[1])}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              {copiedId === msg.id + match[1] ? <Check className="w-3.5 h-3.5 text-ide-success" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          <SyntaxHighlighter
                            style={oneDark}
                            language={match[1]}
                            customStyle={{ margin: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, fontSize: '12px' }}
                          >
                            {codeString}
                          </SyntaxHighlighter>
                        </div>
                      );
                    },
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              </div>

              {msg.tokenCount && (
                <div className="text-[10px] text-ide-text-dim mt-2">
                  {msg.tokenCount} tokens • {msg.model}
                </div>
              )}
            </div>

            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-ide-accent/10 flex items-center justify-center shrink-0 mt-1">
                <User className="w-4 h-4 text-ide-text-dim" />
              </div>
            )}
          </div>
        ))}

        {/* Streaming message */}
        {isStreaming && streamingContent && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-ide-accent/20 flex items-center justify-center shrink-0 mt-1">
              <Bot className="w-4 h-4 text-ide-accent" />
            </div>
            <div className="max-w-[85%] rounded-lg px-4 py-3 bg-ide-assistant-msg border border-ide-border">
              <div className="prose prose-invert prose-sm max-w-none streaming-cursor select-text">
                <ReactMarkdown>{streamingContent}</ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        {isStreaming && !streamingContent && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-ide-accent/20 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-ide-accent" />
            </div>
            <div className="flex items-center gap-2 text-ide-text-dim text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Thinking...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-ide-border p-3">
        {!activeProject && (
          <div className="text-center text-ide-warning text-xs mb-2">
            ⚠ Select or create a project first (left sidebar)
          </div>
        )}
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              id="chat-input"
              name="chat-input"
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={activeProject ? `Message (${mode} mode)...` : 'Select a project first...'}
              disabled={!activeProject}
              rows={1}
              className="w-full bg-ide-bg border border-ide-border rounded-lg px-4 py-3 text-sm text-ide-text placeholder:text-ide-text-dim/50 focus:outline-none focus:border-ide-accent resize-none disabled:opacity-50"
              style={{ minHeight: '44px', maxHeight: '120px' }}
              onInput={(e) => {
                const t = e.currentTarget;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 120) + 'px';
              }}
            />
          </div>

          {isStreaming ? (
            <button
              onClick={stopStreaming}
              className="p-3 bg-ide-error text-white rounded-lg hover:bg-ide-error/80 transition-colors shrink-0"
              title="Stop generating"
            >
              <Square className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim() || !activeProject}
              className="p-3 bg-ide-accent text-ide-panel rounded-lg hover:bg-ide-accent/80 transition-colors disabled:opacity-30 shrink-0"
              title="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between mt-1.5 text-[10px] text-ide-text-dim px-1">
          <span>Enter to send, Shift+Enter for new line</span>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button onClick={copyConversation} className="hover:text-ide-accent flex items-center gap-0.5" title="Copy entire conversation">
                {copiedConvo ? <Check className="w-3 h-3 text-ide-success" /> : <ClipboardCopy className="w-3 h-3" />}
                {copiedConvo ? 'Copied!' : 'Copy Chat'}
              </button>
            )}
            <button onClick={newConversation} className="hover:text-ide-accent">New Chat</button>
          </div>
        </div>
      </div>
    </div>
  );
}
