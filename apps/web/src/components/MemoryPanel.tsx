// ============================================
// Memory Panel - View, search, create notes
// ============================================
import React, { useState, useEffect } from 'react';
import { useProjectStore } from '../stores/projectStore';
import {
  Brain, Plus, Search, X, ChevronDown, ChevronRight,
  Trash2, Edit3, Save, Tag, FileText, Loader2, StickyNote
} from 'lucide-react';

const API_BASE = 'http://localhost:3001';

interface MemoryNote {
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
  createdAt: string;
  updatedAt: string;
}

export function MemoryPanel() {
  const { activeProject } = useProjectStore();
  const [notes, setNotes] = useState<MemoryNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // New note form
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newTags, setNewTags] = useState('');
  const [newCategory, setNewCategory] = useState('general');
  const [newImportance, setNewImportance] = useState(50);

  // Edit form
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  useEffect(() => {
    if (activeProject) fetchNotes();
  }, [activeProject?.id]);

  async function fetchNotes() {
    if (!activeProject) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/memory/notes/${activeProject.id}?limit=200`);
      const data = await res.json();
      setNotes((data.notes || []).map(mapNote));
    } catch (err) {
      console.error('Failed to fetch notes:', err);
    } finally {
      setLoading(false);
    }
  }

  async function searchNotes() {
    if (!activeProject || !searchQuery.trim()) {
      fetchNotes();
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/memory/notes/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject.id, query: searchQuery, limit: 100 }),
      });
      const data = await res.json();
      setNotes((data.notes || []).map(mapNote));
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  }

  async function createNote() {
    if (!activeProject || !newTitle.trim()) return;
    try {
      await fetch(`${API_BASE}/api/memory/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject.id,
          source: 'user_note',
          category: newCategory,
          title: newTitle,
          content: newContent,
          tags: newTags.split(',').map(t => t.trim()).filter(Boolean),
          importance: newImportance,
        }),
      });
      setNewTitle('');
      setNewContent('');
      setNewTags('');
      setNewCategory('general');
      setNewImportance(50);
      setShowCreate(false);
      fetchNotes();
    } catch (err) {
      console.error('Failed to create note:', err);
    }
  }

  async function updateNote(noteId: string) {
    try {
      await fetch(`${API_BASE}/api/memory/notes/${noteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, content: editContent }),
      });
      setEditingId(null);
      fetchNotes();
    } catch (err) {
      console.error('Failed to update note:', err);
    }
  }

  async function deleteNote(noteId: string) {
    try {
      await fetch(`${API_BASE}/api/memory/notes/${noteId}`, { method: 'DELETE' });
      fetchNotes();
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  }

  function startEdit(note: MemoryNote) {
    setEditingId(note.id);
    setEditTitle(note.title);
    setEditContent(note.content);
  }

  function mapNote(raw: any): MemoryNote {
    return {
      id: raw.id,
      projectId: raw.projectId || raw.project_id,
      source: raw.source,
      category: raw.category,
      title: raw.title,
      content: raw.content,
      tags: typeof raw.tags === 'string' ? JSON.parse(raw.tags || '[]') : (raw.tags || []),
      relatedFiles: typeof raw.relatedFiles === 'string' ? JSON.parse(raw.relatedFiles || raw.related_files || '[]') : (raw.relatedFiles || raw.related_files || []),
      importance: raw.importance,
      conversationId: raw.conversationId || raw.conversation_id,
      createdAt: raw.createdAt || raw.created_at,
      updatedAt: raw.updatedAt || raw.updated_at,
    };
  }

  const sourceColors: Record<string, string> = {
    user_note: 'text-blue-400',
    auto_summary: 'text-green-400',
    agent_log: 'text-purple-400',
    file_summary: 'text-yellow-400',
    question_answer: 'text-orange-400',
  };

  const sourceLabels: Record<string, string> = {
    user_note: '📝 User',
    auto_summary: '🤖 Auto',
    agent_log: '🔧 Agent',
    file_summary: '📄 File',
    question_answer: '❓ Q&A',
  };

  if (!activeProject) {
    return (
      <div className="p-3 text-xs text-ide-text-dim">
        <div className="flex items-center gap-1.5 mb-2">
          <Brain className="w-3.5 h-3.5" />
          <span className="font-medium">Memory</span>
        </div>
        <p>Select a project to view memory notes</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col border-t border-ide-border">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium hover:bg-ide-bg/50 transition-colors"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Brain className="w-3.5 h-3.5 text-ide-accent" />
        <span>Memory</span>
        <span className="text-ide-text-dim ml-auto">{notes.length}</span>
      </button>

      {expanded && (
        <div className="flex flex-col overflow-hidden" style={{ maxHeight: '300px' }}>
          {/* Search + Create Bar */}
          <div className="flex items-center gap-1 px-2 pb-1.5">
            <div className="flex-1 flex items-center bg-ide-bg rounded border border-ide-border">
              <Search className="w-3 h-3 text-ide-text-dim ml-1.5" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchNotes()}
                placeholder="Search notes..."
                className="flex-1 text-[11px] bg-transparent border-none px-1.5 py-1 focus:outline-none"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(''); fetchNotes(); }} className="mr-1">
                  <X className="w-3 h-3 text-ide-text-dim hover:text-ide-text" />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="p-1 hover:bg-ide-bg rounded text-ide-text-dim hover:text-ide-accent"
              title="Add note"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Create Form */}
          {showCreate && (
            <div className="mx-2 mb-2 p-2 bg-ide-bg rounded border border-ide-accent/30 space-y-1.5">
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Note title..."
                className="w-full text-[11px] bg-ide-sidebar border border-ide-border rounded px-2 py-1 focus:outline-none focus:border-ide-accent"
              />
              <textarea
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                placeholder="Note content..."
                rows={3}
                className="w-full text-[11px] bg-ide-sidebar border border-ide-border rounded px-2 py-1 focus:outline-none focus:border-ide-accent resize-none"
              />
              <div className="flex gap-1.5">
                <input
                  value={newTags}
                  onChange={e => setNewTags(e.target.value)}
                  placeholder="Tags (comma sep)"
                  className="flex-1 text-[10px] bg-ide-sidebar border border-ide-border rounded px-1.5 py-0.5 focus:outline-none focus:border-ide-accent"
                />
                <select
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  className="text-[10px] bg-ide-sidebar border border-ide-border rounded px-1 py-0.5"
                >
                  <option value="general">General</option>
                  <option value="architecture">Architecture</option>
                  <option value="decision">Decision</option>
                  <option value="todo">Todo</option>
                  <option value="bug">Bug</option>
                  <option value="convention">Convention</option>
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] text-ide-text-dim">Priority:</label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={newImportance}
                  onChange={e => setNewImportance(parseInt(e.target.value))}
                  className="flex-1 h-1"
                />
                <span className="text-[10px] text-ide-text-dim w-6">{newImportance}</span>
              </div>
              <div className="flex justify-end gap-1.5">
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-2 py-0.5 text-[10px] text-ide-text-dim hover:text-ide-text rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={createNote}
                  disabled={!newTitle.trim()}
                  className="px-2 py-0.5 text-[10px] bg-ide-accent/20 text-ide-accent rounded hover:bg-ide-accent/30 disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {/* Notes List */}
          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-ide-accent" />
              </div>
            ) : notes.length === 0 ? (
              <div className="text-center py-4">
                <StickyNote className="w-5 h-5 text-ide-text-dim mx-auto mb-1" />
                <p className="text-[10px] text-ide-text-dim">No notes yet</p>
                <button
                  onClick={() => setShowCreate(true)}
                  className="text-[10px] text-ide-accent hover:underline mt-1"
                >
                  Add your first note
                </button>
              </div>
            ) : (
              notes.map(note => (
                <div
                  key={note.id}
                  className="p-2 bg-ide-bg rounded border border-ide-border hover:border-ide-accent/30 transition-colors"
                >
                  {editingId === note.id ? (
                    <div className="space-y-1">
                      <input
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        className="w-full text-[11px] bg-ide-sidebar border border-ide-border rounded px-1.5 py-0.5 focus:outline-none focus:border-ide-accent"
                      />
                      <textarea
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        rows={3}
                        className="w-full text-[10px] bg-ide-sidebar border border-ide-border rounded px-1.5 py-0.5 focus:outline-none focus:border-ide-accent resize-none"
                      />
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setEditingId(null)} className="p-0.5">
                          <X className="w-3 h-3 text-ide-text-dim" />
                        </button>
                        <button onClick={() => updateNote(note.id)} className="p-0.5">
                          <Save className="w-3 h-3 text-ide-accent" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-1">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className={`text-[9px] ${sourceColors[note.source] || 'text-ide-text-dim'}`}>
                              {sourceLabels[note.source] || note.source}
                            </span>
                            {note.importance >= 80 && (
                              <span className="text-[8px] bg-yellow-500/20 text-yellow-400 px-1 rounded">★</span>
                            )}
                          </div>
                          <div className="text-[11px] font-medium mt-0.5 truncate">{note.title}</div>
                        </div>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <button onClick={() => startEdit(note)} className="p-0.5 opacity-50 hover:opacity-100">
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button onClick={() => deleteNote(note.id)} className="p-0.5 opacity-50 hover:opacity-100 text-ide-error">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      {note.content && (
                        <p className="text-[10px] text-ide-text-dim mt-1 line-clamp-2">{note.content}</p>
                      )}
                      {note.tags.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-1">
                          {note.tags.map(tag => (
                            <span key={tag} className="text-[8px] bg-ide-accent/10 text-ide-accent px-1 py-0.5 rounded">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {note.relatedFiles.length > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          <FileText className="w-2.5 h-2.5 text-ide-text-dim" />
                          <span className="text-[8px] text-ide-text-dim truncate">
                            {note.relatedFiles.slice(0, 2).join(', ')}
                            {note.relatedFiles.length > 2 && ` +${note.relatedFiles.length - 2}`}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
