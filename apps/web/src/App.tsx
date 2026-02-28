// ============================================
// Main App Layout
// ============================================
import React, { useEffect, useState } from 'react';
import { useAuthStore } from './stores/authStore';
import { useProjectStore } from './stores/projectStore';
import { useChatStore } from './stores/chatStore';
import { LoginPage } from './components/LoginPage';
import { TopBar } from './components/TopBar';
import { ChatPanel } from './components/ChatPanel';
import { FileBrowser } from './components/FileBrowser';
import { CodeViewer } from './components/CodeViewer';
import { ProjectPanel } from './components/ProjectPanel';
import { AgentControls } from './components/AgentControls';
import { RateLimitDashboard } from './components/RateLimitDashboard';
import { ErrorPanel } from './components/ErrorPanel';
import { CheckpointViewer } from './components/CheckpointViewer';
import { MemoryPanel } from './components/MemoryPanel';
import { TerminalPanel } from './components/TerminalPanel';
import { OpenClawPanel } from './components/OpenClawPanel';
import { PanelErrorBoundary } from './components/PanelErrorBoundary';
import { Loader2 } from 'lucide-react';

export default function App() {
  const { user, isLoading: checking, checkAuth } = useAuthStore();
  const { loadProjects, activeProject } = useProjectStore();
  const { mode } = useChatStore();
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightSplit, setRightSplit] = useState(45); // % for chat vs code
  const [draggingLeft, setDraggingLeft] = useState(false);
  const [draggingRight, setDraggingRight] = useState(false);

  // Initial auth check + load projects
  useEffect(() => {
    checkAuth().then(() => loadProjects());
  }, []);

  // Drag logic for left panel
  useEffect(() => {
    if (!draggingLeft) return;
    const move = (e: MouseEvent) => setLeftWidth(Math.max(200, Math.min(450, e.clientX)));
    const up = () => setDraggingLeft(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [draggingLeft]);

  // Drag logic for right panel split
  useEffect(() => {
    if (!draggingRight) return;
    const move = (e: MouseEvent) => {
      const mainEl = document.getElementById('main-area');
      if (!mainEl) return;
      const rect = mainEl.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setRightSplit(Math.max(25, Math.min(75, pct)));
    };
    const up = () => setDraggingRight(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [draggingRight]);

  // Loading
  if (checking) {
    return (
      <div className="h-screen flex items-center justify-center bg-ide-bg text-ide-text">
        <Loader2 className="w-6 h-6 animate-spin text-ide-accent" />
      </div>
    );
  }

  // Not authenticated
  if (!user) return <LoginPage />;

  const showAgent = mode === 'agent';

  return (
    <div className="h-screen flex flex-col bg-ide-bg text-ide-text overflow-hidden">
      {/* Top Bar */}
      <TopBar />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* ─── Left Sidebar ─── */}
        <div className="flex flex-col overflow-hidden border-r border-ide-border" style={{ width: leftWidth, minWidth: leftWidth }}>
          {/* ProjectPanel: fixed height, never grows unbounded */}
          <div className="flex-shrink-0 overflow-y-auto" style={{ maxHeight: '35%' }}>
            <ProjectPanel />
          </div>
          {/* FileBrowser: takes remaining space, scrolls internally */}
          <div className="flex-1 min-h-0 overflow-y-auto border-t border-ide-border">
            <FileBrowser />
          </div>
          {/* Bottom panels: collapsible, each capped so they don't push others off */}
          <div className="flex-shrink-0 overflow-y-auto" style={{ maxHeight: '30%' }}>
            <MemoryPanel />
          </div>
          <div className="flex-shrink-0 overflow-y-auto" style={{ maxHeight: '25%' }}>
            <CheckpointViewer />
          </div>
          <div className="flex-shrink-0 overflow-y-auto" style={{ maxHeight: '20%' }}>
            <RateLimitDashboard />
          </div>
          <OpenClawPanel />
        </div>

        {/* Left resize handle */}
        <div
          className="w-1 cursor-col-resize bg-ide-border hover:bg-ide-accent/40 transition-colors flex-shrink-0"
          onMouseDown={() => setDraggingLeft(true)}
        />

        {/* ─── Main Area ─── */}
        <div id="main-area" className="flex flex-1 overflow-hidden">
          {/* Chat + Agent */}
          <div className="flex flex-col overflow-hidden min-w-0" style={{ width: `${rightSplit}%` }}>
            <PanelErrorBoundary name="Chat">
              <ChatPanel />
            </PanelErrorBoundary>
            {showAgent && (
              <PanelErrorBoundary name="Agent">
                <AgentControls />
              </PanelErrorBoundary>
            )}
          </div>

          {/* Center resize handle */}
          <div
            className="w-1 cursor-col-resize bg-ide-border hover:bg-ide-accent/40 transition-colors flex-shrink-0"
            onMouseDown={() => setDraggingRight(true)}
          />

          {/* Code Viewer */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex-1 overflow-hidden">
              <PanelErrorBoundary name="Code Viewer">
                <CodeViewer />
              </PanelErrorBoundary>
            </div>
            <PanelErrorBoundary name="Error Panel">
              <ErrorPanel projectRoot={activeProject?.rootPath || ''} />
            </PanelErrorBoundary>
          </div>
        </div>

        {/* Terminal Panel — spans full width below main area */}
      </div>
      <TerminalPanel />

      {/* Status Bar */}
      <div className="h-6 bg-ide-accent/10 border-t border-ide-border flex items-center px-3 text-[10px] text-ide-text-dim justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <span>Copilot Studio</span>
          <span>●</span>
          <span className="capitalize">{mode} mode</span>
        </div>
        <div className="flex items-center gap-3">
          <span>{user.login}</span>
        </div>
      </div>
    </div>
  );
}
