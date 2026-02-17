// ============================================
// File Store - File tree, reading, editing
// ============================================
import { create } from 'zustand';
import type { FileNode, FileContent } from '@personal-ide/shared';
import { apiGet, apiPost } from '../api/client';

interface OpenFile {
  path: string;
  content: string;
  language: string;
  isDirty: boolean;
}

interface FileStore {
  fileTree: FileNode | null;
  openFiles: OpenFile[];
  activeFilePath: string | null;
  isLoading: boolean;
  searchResults: any[];

  loadFileTree: (rootPath: string) => Promise<void>;
  openFile: (rootPath: string, filePath: string) => Promise<void>;
  closeFile: (path: string) => void;
  setActiveFile: (path: string) => void;
  saveFile: (rootPath: string, path: string, content: string) => Promise<void>;
  updateFileContent: (path: string, content: string) => void;
  searchInFiles: (rootPath: string, query: string) => Promise<void>;
  refreshTree: (rootPath: string) => Promise<void>;
}

export const useFileStore = create<FileStore>((set, get) => ({
  fileTree: null,
  openFiles: [],
  activeFilePath: null,
  isLoading: false,
  searchResults: [],

  loadFileTree: async (rootPath) => {
    set({ isLoading: true });
    try {
      const data = await apiGet<{ tree: FileNode }>(`/files/tree?root=${encodeURIComponent(rootPath)}`);
      set({ fileTree: data.tree });
    } catch { /* ignore */ }
    set({ isLoading: false });
  },

  openFile: async (rootPath, filePath) => {
    // Check if already open
    if (get().openFiles.some(f => f.path === filePath)) {
      set({ activeFilePath: filePath });
      return;
    }

    try {
      const data = await apiGet<FileContent>(
        `/files/read?root=${encodeURIComponent(rootPath)}&path=${encodeURIComponent(filePath)}`
      );
      set(s => ({
        openFiles: [...s.openFiles, {
          path: filePath,
          content: data.content,
          language: data.language,
          isDirty: false,
        }],
        activeFilePath: filePath,
      }));
    } catch { /* ignore */ }
  },

  closeFile: (path) => {
    set(s => {
      const remaining = s.openFiles.filter(f => f.path !== path);
      return {
        openFiles: remaining,
        activeFilePath: s.activeFilePath === path
          ? (remaining.length > 0 ? remaining[remaining.length - 1].path : null)
          : s.activeFilePath,
      };
    });
  },

  setActiveFile: (path) => set({ activeFilePath: path }),

  saveFile: async (rootPath, path, content) => {
    await apiPost('/files/write', { root: rootPath, path, content });
    set(s => ({
      openFiles: s.openFiles.map(f =>
        f.path === path ? { ...f, content, isDirty: false } : f
      ),
    }));
  },

  updateFileContent: (path, content) => {
    set(s => ({
      openFiles: s.openFiles.map(f =>
        f.path === path ? { ...f, content, isDirty: true } : f
      ),
    }));
  },

  searchInFiles: async (rootPath, query) => {
    try {
      const data = await apiGet<{ results: any[] }>(
        `/files/search?root=${encodeURIComponent(rootPath)}&query=${encodeURIComponent(query)}`
      );
      set({ searchResults: data.results });
    } catch { /* ignore */ }
  },

  refreshTree: async (rootPath) => {
    await get().loadFileTree(rootPath);
  },
}));
