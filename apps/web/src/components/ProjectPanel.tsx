// ============================================
// Project Panel - Create/load projects + memory
// ============================================
import React, { useState } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useFileStore } from '../stores/fileStore';
import type { MemoryNote } from '@personal-ide/shared';
import {
  FolderPlus, FolderOpen, Trash2, Search, Plus, Brain,
  Clock, Tag, ChevronDown, ChevronRight, BookOpen
} from 'lucide-react';

export function ProjectPanel() {
  const {
    projects, activeProject, memoryNotes,
    loadProjects, createProject, selectProject, deleteProject,
    searchNotes, addNote, deleteNote, loadNotes,
  } = useProjectStore();
  const { loadFileTree } = useFileStore();
  const [showNewProject, setShowNewProject] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPath, setNewPath] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddNote, setShowAddNote] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [showProjects, setShowProjects] = useState(true);
  const [showMemory, setShowMemory] = useState(true);

  const handleCreateProject = async () => {
    if (!newName.trim() || !newPath.trim()) return;
    const project = await createProject(newName.trim(), newPath.trim(), newDesc.trim());
    await loadFileTree(project.rootPath);
    setShowNewProject(false);
    setNewName('');
    setNewPath('');
    setNewDesc('');
  };

  const handleSelectProject = async (project: any) => {
    await selectProject(project);
    await loadFileTree(project.rootPath);
  };

  const handleSearch = () => {
    if (searchQuery.trim()) {
      searchNotes(searchQuery);
    } else if (activeProject) {
      loadNotes(activeProject.id);
    }
  };

  const handleAddNote = async () => {
    if (!noteTitle.trim() || !noteContent.trim()) return;
    await addNote(noteTitle.trim(), noteContent.trim());
    setShowAddNote(false);
    setNoteTitle('');
    setNoteContent('');
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Projects Section */}
      <div>
        <button
          onClick={() => setShowProjects(!showProjects)}
          className="w-full flex items-center justify-between px-3 py-2 border-b border-ide-border hover:bg-ide-bg/30"
        >
          <span className="text-xs font-medium text-ide-text-dim uppercase tracking-wider flex items-center gap-1.5">
            <FolderOpen className="w-3.5 h-3.5" /> Projects
          </span>
          {showProjects ? <ChevronDown className="w-3 h-3 text-ide-text-dim" /> : <ChevronRight className="w-3 h-3 text-ide-text-dim" />}
        </button>

        {showProjects && (
          <div className="p-2">
            {/* Project List */}
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => handleSelectProject(p)}
                className={`w-full text-left px-2.5 py-2 rounded text-xs mb-1 flex items-start gap-2 ${
                  activeProject?.id === p.id
                    ? 'bg-ide-accent/10 border border-ide-accent/30'
                    : 'hover:bg-ide-bg/50 border border-transparent'
                }`}
              >
                <FolderOpen className="w-3.5 h-3.5 text-ide-accent shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-[10px] text-ide-text-dim truncate">{p.rootPath}</div>
                  <div className="text-[10px] text-ide-text-dim mt-0.5">
                    {p.conversationCount} chats • {p.noteCount} notes
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteProject(p.id); }}
                  className="p-0.5 text-ide-text-dim hover:text-ide-error opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </button>
            ))}

            {/* New Project */}
            {showNewProject ? (
              <div className="bg-ide-bg rounded p-2 mt-1 border border-ide-border">
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Project name"
                  className="w-full bg-ide-sidebar border border-ide-border rounded px-2 py-1.5 text-xs mb-1.5 focus:outline-none focus:border-ide-accent"
                  autoFocus
                />
                <input
                  value={newPath}
                  onChange={e => setNewPath(e.target.value)}
                  placeholder="Root path (e.g. C:\Users\you\project)"
                  className="w-full bg-ide-sidebar border border-ide-border rounded px-2 py-1.5 text-xs mb-1.5 focus:outline-none focus:border-ide-accent"
                />
                <input
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="Description (optional)"
                  className="w-full bg-ide-sidebar border border-ide-border rounded px-2 py-1.5 text-xs mb-2 focus:outline-none focus:border-ide-accent"
                />
                <div className="flex gap-1">
                  <button onClick={handleCreateProject} className="flex-1 bg-ide-accent text-ide-panel text-xs py-1.5 rounded font-medium hover:bg-ide-accent/80">
                    Create
                  </button>
                  <button onClick={() => setShowNewProject(false)} className="flex-1 bg-ide-sidebar text-ide-text-dim text-xs py-1.5 rounded hover:bg-ide-border">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowNewProject(true)}
                className="w-full flex items-center gap-1.5 px-2.5 py-2 text-xs text-ide-accent hover:bg-ide-bg/50 rounded border border-dashed border-ide-border"
              >
                <FolderPlus className="w-3.5 h-3.5" /> New Project
              </button>
            )}
          </div>
        )}
      </div>

      {/* Memory Section */}
      <div className="border-t border-ide-border">
        <button
          onClick={() => setShowMemory(!showMemory)}
          className="w-full flex items-center justify-between px-3 py-2 border-b border-ide-border hover:bg-ide-bg/30"
        >
          <span className="text-xs font-medium text-ide-text-dim uppercase tracking-wider flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5" /> Memory
            {memoryNotes.length > 0 && (
              <span className="bg-ide-accent/20 text-ide-accent px-1 rounded text-[10px]">{memoryNotes.length}</span>
            )}
          </span>
          {showMemory ? <ChevronDown className="w-3 h-3 text-ide-text-dim" /> : <ChevronRight className="w-3 h-3 text-ide-text-dim" />}
        </button>

        {showMemory && activeProject && (
          <div className="p-2">
            {/* Search */}
            <div className="flex gap-1 mb-2">
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Search memory..."
                className="flex-1 bg-ide-bg border border-ide-border rounded px-2 py-1 text-xs focus:outline-none focus:border-ide-accent"
              />
              <button onClick={handleSearch} className="p-1 bg-ide-bg border border-ide-border rounded hover:border-ide-accent">
                <Search className="w-3 h-3" />
              </button>
            </div>

            {/* Add Note */}
            {showAddNote ? (
              <div className="bg-ide-bg rounded p-2 mb-2 border border-ide-border">
                <input
                  value={noteTitle}
                  onChange={e => setNoteTitle(e.target.value)}
                  placeholder="Note title"
                  className="w-full bg-ide-sidebar border border-ide-border rounded px-2 py-1 text-xs mb-1 focus:outline-none focus:border-ide-accent"
                  autoFocus
                />
                <textarea
                  value={noteContent}
                  onChange={e => setNoteContent(e.target.value)}
                  placeholder="Note content..."
                  rows={3}
                  className="w-full bg-ide-sidebar border border-ide-border rounded px-2 py-1 text-xs mb-1 focus:outline-none focus:border-ide-accent resize-none"
                />
                <div className="flex gap-1">
                  <button onClick={handleAddNote} className="flex-1 bg-ide-accent text-ide-panel text-xs py-1 rounded">Add</button>
                  <button onClick={() => setShowAddNote(false)} className="flex-1 bg-ide-sidebar text-xs py-1 rounded">Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddNote(true)}
                className="w-full flex items-center gap-1 px-2 py-1.5 text-xs text-ide-text-dim hover:text-ide-accent hover:bg-ide-bg/50 rounded mb-2"
              >
                <Plus className="w-3 h-3" /> Add Note
              </button>
            )}

            {/* Notes List */}
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {memoryNotes.map(note => (
                <NoteCard key={note.id} note={note} onDelete={deleteNote} />
              ))}
              {memoryNotes.length === 0 && (
                <p className="text-[10px] text-ide-text-dim text-center py-2">No memory notes yet</p>
              )}
            </div>
          </div>
        )}

        {showMemory && !activeProject && (
          <div className="p-3 text-xs text-ide-text-dim text-center">
            Select a project to view memory
          </div>
        )}
      </div>
    </div>
  );
}

function NoteCard({ note, onDelete }: { note: MemoryNote; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  const sourceColors: Record<string, string> = {
    auto_summary: 'text-blue-400',
    user_note: 'text-green-400',
    agent_log: 'text-purple-400',
    file_summary: 'text-yellow-400',
    question_answer: 'text-orange-400',
  };

  return (
    <div className="bg-ide-bg/50 rounded p-2 border border-ide-border/50 group">
      <div className="flex items-start justify-between gap-1">
        <button onClick={() => setExpanded(!expanded)} className="text-left flex-1 min-w-0">
          <div className="text-xs font-medium truncate">{note.title}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`text-[10px] ${sourceColors[note.source] || 'text-ide-text-dim'}`}>
              {note.source.replace('_', ' ')}
            </span>
            <span className="text-[10px] text-ide-text-dim">
              • {new Date(note.createdAt).toLocaleDateString()}
            </span>
          </div>
        </button>
        <button
          onClick={() => onDelete(note.id)}
          className="p-0.5 text-ide-text-dim hover:text-ide-error opacity-0 group-hover:opacity-100"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      {expanded && (
        <div className="mt-1.5 text-[11px] text-ide-text-dim whitespace-pre-wrap border-t border-ide-border/30 pt-1.5">
          {note.content.slice(0, 500)}
          {note.content.length > 500 && '...'}
          {note.tags.length > 0 && (
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {note.tags.map(t => (
                <span key={t} className="bg-ide-accent/10 text-ide-accent px-1 rounded text-[9px]">{t}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
