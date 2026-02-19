// ============================================
// Project Panel - Create/load projects
// ============================================
import React, { useState } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useFileStore } from '../stores/fileStore';
import {
  FolderPlus, FolderOpen, Trash2,
  ChevronDown, ChevronRight
} from 'lucide-react';

export function ProjectPanel() {
  const {
    projects, activeProject,
    loadProjects, createProject, selectProject, deleteProject,
  } = useProjectStore();
  const { loadFileTree } = useFileStore();
  const [showNewProject, setShowNewProject] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPath, setNewPath] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [showProjects, setShowProjects] = useState(true);

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


    </div>
  );
}

