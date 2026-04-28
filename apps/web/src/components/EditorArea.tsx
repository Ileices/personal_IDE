// ============================================
// EditorArea — Tabbed main content area.
// Tabs: Code, Chat, Agent, Preview.
// Each tab is lazily rendered, never unmounted
// (display:none when inactive) to preserve state.
// ============================================
import React, { useState, useCallback } from 'react';
import { Code2, MessageSquare, Bot, Globe, Play, Square, Loader2 } from 'lucide-react';
import { ChatPanel } from './ChatPanel';
import { CodeViewer } from './CodeViewer';
import { AgentControls } from './AgentControls';
import { PreviewPanel } from './PreviewPanel';
import { ErrorPanel } from './ErrorPanel';
import { PanelErrorBoundary } from './PanelErrorBoundary';
import { useProjectStore } from '../stores/projectStore';
import { API_BASE } from '../config.js';

export type EditorTab = 'code' | 'chat' | 'agent' | 'preview';

interface EditorAreaProps {
  activeTab: EditorTab;
  onTabChange: (tab: EditorTab) => void;
  previewUrl?: string;
}

const TAB_DEFS: { id: EditorTab; icon: React.ElementType; label: string }[] = [
  { id: 'code',    icon: Code2,          label: 'Code' },
  { id: 'chat',    icon: MessageSquare,  label: 'Chat' },
  { id: 'agent',   icon: Bot,            label: 'Agent' },
  { id: 'preview', icon: Globe,          label: 'Preview' },
];

export function EditorArea({ activeTab, onTabChange, previewUrl }: EditorAreaProps) {
  const { activeProject } = useProjectStore();
  const [runState, setRunState] = useState<'idle' | 'running' | 'error'>('idle');
  const [runLabel, setRunLabel] = useState('Build & Run');

  const handleBuildRun = useCallback(async () => {
    if (!activeProject) return;
    if (runState === 'running') {
      // Stop
      try {
        await fetch(`${API_BASE}/api/preview/stop`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: activeProject.id }),
        });
      } catch { /* ignore */ }
      setRunState('idle');
      setRunLabel('Build & Run');
      return;
    }
    setRunState('running');
    setRunLabel('Running…');
    try {
      const res = await fetch(`${API_BASE}/api/preview/smart-start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectRoot: activeProject.rootPath }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setRunLabel('Stop');
        onTabChange('preview');
      } else {
        setRunState('error');
        setRunLabel(data.error ? `Error: ${data.error}` : 'Failed — see terminal');
        setTimeout(() => { setRunState('idle'); setRunLabel('Build & Run'); }, 3000);
      }
    } catch (e: any) {
      setRunState('error');
      setRunLabel('Failed — see terminal');
      setTimeout(() => { setRunState('idle'); setRunLabel('Build & Run'); }, 3000);
    }
  }, [activeProject, runState, onTabChange]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center h-9 bg-ide-panel border-b border-ide-border flex-shrink-0 overflow-x-auto">
        {TAB_DEFS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={[
                'flex items-center gap-1.5 px-4 h-full text-xs border-r border-ide-border whitespace-nowrap transition-colors',
                isActive
                  ? 'bg-ide-bg text-ide-text border-t-2 border-t-ide-accent'
                  : 'text-ide-text-dim hover:text-ide-text hover:bg-ide-bg/50',
              ].join(' ')}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
        <div className="flex-1" />
        {/* Build & Run button */}
        {activeProject && (
          <button
            onClick={handleBuildRun}
            title={activeProject ? `Project: ${activeProject.name}` : ''}
            className={[
              'flex items-center gap-1.5 px-3 h-full text-xs font-medium transition-colors mr-1',
              runState === 'running'
                ? 'text-red-400 hover:text-red-300'
                : runState === 'error'
                ? 'text-yellow-400'
                : 'text-green-400 hover:text-green-300',
            ].join(' ')}
          >
            {runState === 'running' ? (
              <><Square className="w-3 h-3" /> {runLabel}</>
            ) : runState === 'error' ? (
              <span>{runLabel}</span>
            ) : (
              <><Play className="w-3 h-3" /> {runLabel}</>
            )}
          </button>
        )}
      </div>

      {/* Tab content — all mounted, shown/hidden via CSS to preserve state */}
      <div className="flex-1 overflow-hidden relative">
        {/* Code */}
        <div className={`absolute inset-0 flex flex-col overflow-hidden ${activeTab === 'code' ? '' : 'hidden'}`}>
          <div className="flex-1 overflow-hidden">
            <PanelErrorBoundary name="Code Viewer">
              <CodeViewer />
            </PanelErrorBoundary>
          </div>
          <div className="flex-shrink-0">
            <PanelErrorBoundary name="Error Panel">
              <ErrorPanel projectRoot={activeProject?.rootPath || ''} />
            </PanelErrorBoundary>
          </div>
        </div>

        {/* Chat */}
        <div className={`absolute inset-0 overflow-hidden ${activeTab === 'chat' ? '' : 'hidden'}`}>
          <PanelErrorBoundary name="Chat">
            <ChatPanel />
          </PanelErrorBoundary>
        </div>

        {/* Agent */}
        <div className={`absolute inset-0 overflow-hidden ${activeTab === 'agent' ? '' : 'hidden'}`}>
          <PanelErrorBoundary name="Agent">
            <AgentControls />
          </PanelErrorBoundary>
        </div>

        {/* Preview */}
        <div className={`absolute inset-0 overflow-hidden ${activeTab === 'preview' ? '' : 'hidden'}`}>
          <PanelErrorBoundary name="Preview">
            <PreviewPanel
              defaultUrl={previewUrl || 'http://localhost:5173'}
              height="100%"
            />
          </PanelErrorBoundary>
        </div>
      </div>
    </div>
  );
}
