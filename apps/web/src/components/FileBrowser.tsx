// ============================================
// File Browser - Tree view sidebar
// ============================================
import React, { useState, useRef, useEffect } from 'react';
import { useFileStore } from '../stores/fileStore';
import { useProjectStore } from '../stores/projectStore';
import type { FileNode } from '@personal-ide/shared';
import {
  ChevronRight, ChevronDown, Folder, FolderOpen,
  RefreshCw, Search
} from 'lucide-react';
import { API_BASE } from '../config.js';

const EXT_ICONS: Record<string, string> = {
  '.ts': '🔷', '.tsx': '⚛️', '.js': '🟨', '.jsx': '⚛️',
  '.py': '🐍', '.json': '📋', '.md': '📝', '.yaml': '📄', '.yml': '📄',
  '.env': '🔒', '.rs': '🦀', '.go': '🐹',
};

// ---- Right-click Context Menu ----
interface ContextMenuState {
  x: number;
  y: number;
  node: FileNode;
  rootPath: string;
}

function ContextMenu({ state, onClose }: { state: ContextMenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { node, rootPath } = state;
  const fullPath = (rootPath + '/' + node.path).replace(/\\/g, '/').replace(/\/\//g, '/');
  const relativePath = node.path;
  const fileName = node.name;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    onClose();
  };

  const revealInExplorer = async () => {
    try {
      await fetch(`${API_BASE}/api/files/reveal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: fullPath }),
      });
    } catch { /* best effort */ }
    onClose();
  };

  type MenuItem =
    | { label: string; action: () => void; separator?: false }
    | { separator: true; label?: never; action?: never };

  const menuItems: MenuItem[] = [
    { label: 'Reveal in Explorer', action: revealInExplorer },
    { separator: true },
    { label: 'Copy File Name', action: () => copy(fileName) },
    { label: 'Copy Relative Path', action: () => copy(relativePath) },
    { label: 'Copy Absolute Path', action: () => copy(fullPath) },
  ];

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-ide-sidebar border border-ide-border rounded shadow-xl py-1 min-w-[180px] text-xs"
      style={{ left: state.x, top: state.y }}
    >
      {menuItems.map((item, i) =>
        item.separator ? (
          <div key={i} className="border-t border-ide-border my-1" />
        ) : (
          <button
            key={i}
            onClick={item.action}
            className="w-full text-left px-3 py-1.5 hover:bg-ide-accent/20 hover:text-ide-accent transition-colors"
          >
            {item.label}
          </button>
        )
      )}
    </div>
  );
}

// ---- File Tree Node ----
function FileTreeNode({ node, depth, rootPath, onContextMenu }: {
  node: FileNode;
  depth: number;
  rootPath: string;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
}) {
  const [isOpen, setIsOpen] = useState(depth < 2);
  const { openFile } = useFileStore();
  const isDir = node.type === 'directory';

  const handleClick = () => {
    if (isDir) setIsOpen(!isOpen);
    else openFile(rootPath, node.path);
  };

  const icon = isDir
    ? (isOpen ? <FolderOpen className="w-4 h-4 text-ide-accent" /> : <Folder className="w-4 h-4 text-ide-accent" />)
    : <span className="text-xs">{EXT_ICONS[node.extension || ''] || '📄'}</span>;

  return (
    <div>
      <button
        onClick={handleClick}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, node); }}
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
            <FileTreeNode key={child.path} node={child} depth={depth + 1} rootPath={rootPath} onContextMenu={onContextMenu} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Main FileBrowser Component ----
export function FileBrowser() {
  const { fileTree, isLoading, loadFileTree, searchInFiles, searchResults } = useFileStore();
  const { activeProject } = useProjectStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const handleSearch = () => {
    if (searchQuery.trim() && activeProject) {
      searchInFiles(activeProject.rootPath, searchQuery);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
    if (!activeProject) return;
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - 160);
    setContextMenu({ x, y, node, rootPath: activeProject.rootPath });
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
        {(fileTree?.children ?? []).map(node => (
          <FileTreeNode
            key={node.path}
            node={node}
            depth={0}
            rootPath={activeProject.rootPath}
            onContextMenu={handleContextMenu}
          />
        ))}
        {(!fileTree?.children || fileTree.children.length === 0) && !isLoading && (
          <div className="p-3 text-xs text-ide-text-dim text-center">No files found</div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu state={contextMenu} onClose={() => setContextMenu(null)} />
      )}
    </div>
  );
}
