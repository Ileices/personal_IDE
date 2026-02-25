// ============================================
// File Browser - Tree view sidebar
// ============================================
import React, { useState } from 'react';
import { useFileStore } from '../stores/fileStore';
import { useProjectStore } from '../stores/projectStore';
import type { FileNode } from '@personal-ide/shared';
import {
  ChevronRight, ChevronDown, File, Folder, FolderOpen,
  RefreshCw, Search
} from 'lucide-react';

const EXT_ICONS: Record<string, string> = {
  '.ts': '🔷', '.tsx': '⚛️', '.js': '🟨', '.jsx': '⚛️',
  '.py': '🐍', '.json': '📋', '.md': '📝', '.css': '🎨',
  '.html': '🌐', '.sql': '🗃️', '.yaml': '📄', '.yml': '📄',
  '.env': '🔐', '.sh': '🐚', '.rs': '🦀', '.go': '🐹',
};

function FileTreeNode({ node, depth, rootPath }: { node: FileNode; depth: number; rootPath: string }) {
  const [isOpen, setIsOpen] = useState(depth < 2);
  const { openFile } = useFileStore();
  const isDir = node.type === 'directory';

  const handleClick = () => {
    if (isDir) {
      setIsOpen(!isOpen);
    } else {
      openFile(rootPath, node.path);
    }
  };

  const icon = isDir
    ? (isOpen ? <FolderOpen className="w-4 h-4 text-ide-accent" /> : <Folder className="w-4 h-4 text-ide-accent" />)
    : <span className="text-xs">{EXT_ICONS[node.extension || ''] || '📄'}</span>;

  return (
    <div>
      <button
        onClick={handleClick}
        className="w-full flex items-center gap-1.5 px-2 py-1 hover:bg-ide-bg/50 text-left text-xs group"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isDir && (
          isOpen
            ? <ChevronDown className="w-3 h-3 text-ide-text-dim shrink-0" />
            : <ChevronRight className="w-3 h-3 text-ide-text-dim shrink-0" />
        )}
        {!isDir && <span className="w-3 shrink-0" />}
        {icon}
        <span className="truncate">{node.name}</span>
        {!isDir && node.size !== undefined && (
          <span className="ml-auto text-[10px] text-ide-text-dim opacity-0 group-hover:opacity-100">
            {node.size < 1024 ? `${node.size}B` : `${(node.size / 1024).toFixed(0)}K`}
          </span>
        )}
      </button>

      {isDir && isOpen && node.children && (
        <div>
          {node.children.map(child => (
            <FileTreeNode key={child.path} node={child} depth={depth + 1} rootPath={rootPath} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileBrowser() {
  const { fileTree, isLoading, loadFileTree, searchInFiles, searchResults } = useFileStore();
  const { activeProject } = useProjectStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const handleSearch = () => {
    if (searchQuery.trim() && activeProject) {
      searchInFiles(activeProject.rootPath, searchQuery);
    }
  };

  if (!activeProject) {
    return (
      <div className="p-3 text-xs text-ide-text-dim text-center">
        Select a project to browse files
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-ide-border">
        <span className="text-xs font-medium text-ide-text-dim uppercase tracking-wider">Files</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="p-1 text-ide-text-dim hover:text-ide-text rounded"
            title="Search in files"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => loadFileTree(activeProject.rootPath)}
            className="p-1 text-ide-text-dim hover:text-ide-text rounded"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Search */}
      {showSearch && (
        <div className="p-2 border-b border-ide-border">
          <div className="flex gap-1">
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search in files..."
              className="flex-1 bg-ide-bg border border-ide-border rounded px-2 py-1 text-xs focus:outline-none focus:border-ide-accent"
            />
          </div>
          {searchResults.length > 0 && (
            <div className="mt-2 max-h-40 overflow-y-auto">
              {searchResults.slice(0, 20).map((r, i) => (
                <button
                  key={i}
                  onClick={() => useFileStore.getState().openFile(activeProject.rootPath, r.path)}
                  className="w-full text-left px-2 py-1 hover:bg-ide-bg/50 text-[10px]"
                >
                  <span className="text-ide-accent">{r.path}</span>
                  <span className="text-ide-text-dim">:{r.line}</span>
                  <div className="text-ide-text-dim truncate">{r.match}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto">
        {fileTree ? (
          <FileTreeNode node={fileTree} depth={0} rootPath={activeProject.rootPath} />
        ) : (
          <div className="p-3 text-xs text-ide-text-dim text-center">
            {isLoading ? 'Loading...' : 'No files loaded'}
          </div>
        )}
      </div>
    </div>
  );
}
