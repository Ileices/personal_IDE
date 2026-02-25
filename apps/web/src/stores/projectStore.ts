// ============================================
// Project Store - Project + memory management
// ============================================
import { create } from 'zustand';
import type { Project, MemoryNote } from '@personal-ide/shared';
import { apiGet, apiPost, apiDelete } from '../api/client';

interface ProjectStore {
  projects: Project[];
  activeProject: Project | null;
  memoryNotes: MemoryNote[];
  isLoading: boolean;

  loadProjects: () => Promise<void>;
  createProject: (name: string, rootPath: string, description?: string) => Promise<Project>;
  selectProject: (project: Project) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  loadNotes: (projectId: string) => Promise<void>;
  searchNotes: (query: string) => Promise<void>;
  addNote: (title: string, content: string, category?: string, tags?: string[]) => Promise<void>;
  deleteNote: (noteId: string) => Promise<void>;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  activeProject: null,
  memoryNotes: [],
  isLoading: false,

  loadProjects: async () => {
    set({ isLoading: true });
    try {
      const data = await apiGet<{ projects: Project[] }>('/memory/projects');
      set({ projects: data.projects });
    } catch { /* ignore */ }
    set({ isLoading: false });
  },

  createProject: async (name, rootPath, description) => {
    const data = await apiPost<{ project: Project }>('/memory/projects', { name, rootPath, description });
    set(s => ({ projects: [data.project, ...s.projects], activeProject: data.project }));
    return data.project;
  },

  selectProject: async (project) => {
    set({ activeProject: project });
    await get().loadNotes(project.id);
  },

  deleteProject: async (id) => {
    await apiDelete(`/memory/projects/${id}`);
    set(s => ({
      projects: s.projects.filter(p => p.id !== id),
      activeProject: s.activeProject?.id === id ? null : s.activeProject,
    }));
  },

  loadNotes: async (projectId) => {
    try {
      const data = await apiGet<{ notes: MemoryNote[] }>(`/memory/notes/${projectId}`);
      set({ memoryNotes: data.notes });
    } catch { /* ignore */ }
  },

  searchNotes: async (query) => {
    const { activeProject } = get();
    if (!activeProject) return;
    try {
      const data = await apiPost<{ notes: MemoryNote[] }>('/memory/notes/search', {
        projectId: activeProject.id,
        query,
      });
      set({ memoryNotes: data.notes });
    } catch { /* ignore */ }
  },

  addNote: async (title, content, category = 'general', tags = []) => {
    const { activeProject } = get();
    if (!activeProject) return;
    await apiPost('/memory/notes', {
      projectId: activeProject.id,
      source: 'user_note',
      category,
      title,
      content,
      tags,
    });
    await get().loadNotes(activeProject.id);
  },

  deleteNote: async (noteId) => {
    const { activeProject } = get();
    await apiDelete(`/memory/notes/${noteId}`);
    if (activeProject) await get().loadNotes(activeProject.id);
  },
}));
