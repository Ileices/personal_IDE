// ============================================
// Memory Tab - Unified read view for project memory notes
// ============================================
import React, { useEffect, useMemo, useState } from 'react';
import { Brain, ChevronDown, ChevronUp, Loader2, Search, Tag } from 'lucide-react';
import { useProjectStore } from '../stores/projectStore';
import { useChatStore } from '../stores/chatStore';
import { API_BASE } from '../config.js';
import { MemoryAccessBar } from './memory/MemoryAccessBar.js';
import type { MemoryAccessMode, MemoryNote, MemoryPreset } from './memory/types.js';

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
  } catch {
    return [];
  }
}

function mapNote(raw: any): MemoryNote {
  return {
    id: String(raw.id || ''),
    projectId: String(raw.projectId || raw.project_id || ''),
    source: String(raw.source || 'unknown'),
    category: String(raw.category || 'general'),
    title: String(raw.title || 'Untitled note'),
    content: String(raw.content || ''),
    tags: parseJsonArray(raw.tags),
    relatedFiles: parseJsonArray(raw.relatedFiles || raw.related_files),
    importance: Number(raw.importance || 0),
    conversationId: raw.conversationId || raw.conversation_id || undefined,
    interactionType: raw.interactionType || raw.interaction_type || undefined,
    createdAt: String(raw.createdAt || raw.created_at || new Date().toISOString()),
    updatedAt: String(raw.updatedAt || raw.updated_at || new Date().toISOString()),
  };
}

const SOURCE_LABELS: Record<string, string> = {
  user_note: 'User Note',
  auto_summary: 'Auto Summary',
  agent_log: 'Agent Log',
  file_summary: 'File Summary',
  question_answer: 'Q&A',
};

export function MemoryTab() {
  const { activeProject } = useProjectStore();
  const { conversationId } = useChatStore();
  const [notes, setNotes] = useState<MemoryNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [accessMode, setAccessMode] = useState<MemoryAccessMode>('total');
  const [preset, setPreset] = useState<MemoryPreset>('recent_decisions');
  const [customSources, setCustomSources] = useState<string[]>(['user_note', 'agent_log']);

  useEffect(() => {
    const projectId = activeProject?.id;
    if (!projectId) {
      setNotes([]);
      return;
    }

    setLoading(true);
    fetch(`${API_BASE}/api/memory/notes/${projectId}?limit=200&accessMode=${encodeURIComponent(accessMode)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { notes?: any[] } | null) => {
        const next = Array.isArray(data?.notes) ? data!.notes.map(mapNote) : [];
        setNotes(next);
      })
      .catch(() => setNotes([]))
      .finally(() => setLoading(false));
  }, [activeProject?.id, accessMode]);

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return notes.filter((note) => {
      if (accessMode === 'self' && conversationId) {
        const inConversation = note.conversationId === conversationId;
        const keepGlobal = note.source === 'user_note';
        if (!inConversation && !keepGlobal) return false;
      }

      if (accessMode === 'custom' && !customSources.includes(note.source)) return false;

      if (accessMode === 'preset') {
        if (preset === 'bugs_only') {
          const hasBugTag = note.tags.some((tag: string) => /bug|fix|regression/i.test(tag));
          if (!(note.category === 'bug' || hasBugTag)) return false;
        }
        if (preset === 'high_priority' && note.importance < 80) return false;
        if (preset === 'agent_activity' && !(note.source === 'agent_log' || note.source === 'auto_summary')) return false;
        if (preset === 'recent_decisions') {
          const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          const updatedAt = Date.parse(note.updatedAt);
          if (!(Number.isFinite(updatedAt) && updatedAt >= weekAgo)) return false;
        }
      }

      if (!q) return true;
      const searchable = [
        note.title,
        note.content,
        note.category,
        note.source,
        ...note.tags,
      ].join(' ').toLowerCase();
      return searchable.includes(q);
    });
  }, [notes, searchQuery, accessMode, customSources, preset, conversationId]);

  return (
    <div className="flex flex-col h-full bg-ide-panel text-ide-text">
      <div className="flex items-center gap-2 px-2 py-1 border-b border-ide-border">
        <Brain size={15} className="text-ide-accent" />
        <span className="text-xs font-semibold">Unified Memory</span>
      </div>

      <MemoryAccessBar
        mode={accessMode}
        preset={preset}
        customSources={customSources}
        onModeChange={setAccessMode}
        onPresetChange={setPreset}
        onToggleCustomSource={(source) => {
          setCustomSources((prev) => prev.includes(source)
            ? prev.filter((s) => s !== source)
            : [...prev, source]);
        }}
      />

      <div className="px-2 pb-2 border-b border-ide-border/60">
        <div className="flex items-center gap-1 bg-ide-bg border border-ide-border rounded px-1.5 py-1">
          <Search size={12} className="text-ide-text-dim" />
          <input
            className="w-full bg-transparent outline-none text-[10px]"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search title, tags, and content"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-2">
        {loading && (
          <div className="text-[10px] text-ide-text-dim flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading memory…
          </div>
        )}

        {!loading && filteredNotes.length === 0 && (
          <div className="text-[10px] text-ide-text-dim">No memory notes found for this scope.</div>
        )}

        {!loading && filteredNotes.length > 0 && (
          <div className="space-y-2">
            {filteredNotes.map((note) => {
              const expanded = expandedId === note.id;
              return (
                <div key={note.id} className="border border-ide-border rounded bg-ide-bg/30">
                  <button
                    onClick={() => setExpandedId(expanded ? null : note.id)}
                    className="w-full text-left px-2 py-1.5 flex items-start justify-between gap-2 hover:bg-ide-hover/30"
                  >
                    <div className="min-w-0">
                      <div className="text-[10px] font-medium truncate">{note.title}</div>
                      <div className="text-[9px] text-ide-text-dim flex items-center gap-1">
                        <span>{SOURCE_LABELS[note.source] || note.source}</span>
                        <span>•</span>
                        <span>{new Date(note.updatedAt).toLocaleString()}</span>
                      </div>
                    </div>
                    {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>

                  {expanded && (
                    <div className="px-2 pb-2 text-[10px] space-y-1.5 border-t border-ide-border/60">
                      <div className="pt-1 whitespace-pre-wrap break-words">{note.content}</div>
                      {note.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {note.tags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center gap-1 px-1 py-0.5 rounded bg-ide-accent/10 border border-ide-accent/30 text-ide-accent"
                            >
                              <Tag size={10} /> {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
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