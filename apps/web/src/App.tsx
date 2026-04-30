// ============================================
// Main App Layout — VS Code-style
// Activity Bar → Side Panel → Editor Area + Terminal
// ============================================
import React, { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from './stores/authStore';
import { useProjectStore } from './stores/projectStore';
import { useChatStore } from './stores/chatStore';
import { useAgentStore } from './stores/agentStore';
import { useFleetStore } from './stores/fleetStore';
import { LoginPage } from './components/LoginPage';
import { TopBar } from './components/TopBar';
import { ActivityBar, type ActivityView } from './components/ActivityBar';
import { SidePanel } from './components/SidePanel';
import { EditorArea, type EditorTab } from './components/EditorArea';
import { TerminalPanel } from './components/TerminalPanel';
import { PanelErrorBoundary } from './components/PanelErrorBoundary';
import { SetupWizard } from './components/wizards/SetupWizard';
import { NewProjectWizard } from './components/wizards/NewProjectWizard';
import { FirstRunWizard, useFirstRunWizard } from './components/wizards/FirstRunWizard';
import { TheGodFactory } from './components/TheGodFactory';
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { API_BASE } from './config.js';

function getStored<T>(key: string, fallback: T): T {
  try { return JSON.parse(sessionStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}
function setStored(key: string, val: unknown) {
  try { sessionStorage.setItem(key, JSON.stringify(val)); } catch { /* ignore */ }
}

export default function App() {
  const { user, isLoading: checking, checkAuth } = useAuthStore();
  const { loadProjects } = useProjectStore();

  const [activeView, setActiveView]     = useState<ActivityView>(() => getStored('ide_view', 'explorer'));
  const [activeTab,  setActiveTab]      = useState<EditorTab>(() => getStored('ide_tab', 'code'));
  const [sideWidth,  setSideWidth]      = useState<number>(() => getStored('ide_side_w', 280));
  const [termHeight, setTermHeight]     = useState<number>(() => getStored('ide_term_h', 200));
  const [termOpen,   setTermOpen]       = useState<boolean>(() => getStored('ide_term_open', true));
  const [draggingSide, setDraggingSide] = useState(false);
  const [draggingTerm, setDraggingTerm] = useState(false);

  const { events: agentEvents } = useAgentStore();
  const [previewUrl, setPreviewUrl] = useState('http://localhost:5173');
  const { agents: fleetAgents } = useFleetStore();
  const fleetBadge = fleetAgents.filter(a => a.status === 'running').length || undefined;
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const { showWizard: showFirstRun, setShowWizard: setShowFirstRun, completeFirstRun } = useFirstRunWizard();

  useEffect(() => { checkAuth().then(() => loadProjects()); }, []);

  // First-run check: show setup wizard if no models/providers configured
  useEffect(() => {
    if (!user) return;
    fetch(`${API_BASE}/api/providers/all-models`)
      .then(r => r.json())
      .then(d => {
        const models = d.models || d;
        if (!Array.isArray(models) || models.length === 0) {
          setShowSetupWizard(true);
        }
      })
      .catch(() => { /* server might not be ready — don't block */ });
  }, [user]);
  useEffect(() => { setStored('ide_view', activeView); }, [activeView]);
  useEffect(() => { setStored('ide_tab', activeTab); }, [activeTab]);
  useEffect(() => { setStored('ide_side_w', sideWidth); }, [sideWidth]);
  useEffect(() => { setStored('ide_term_h', termHeight); }, [termHeight]);
  useEffect(() => { setStored('ide_term_open', termOpen); }, [termOpen]);

  useEffect(() => {
    const last = agentEvents[agentEvents.length - 1];
    if (!last) return;
    if (last.type === 'server_started' || last.type === 'preview_url') {
      const url = (last as any).url || (last as any).data?.url;
      if (url) { setPreviewUrl(url); setActiveTab('preview'); }
    }
  }, [agentEvents]);

  useEffect(() => {
    if (!draggingSide) return;
    const move = (e: MouseEvent) => setSideWidth(Math.max(180, Math.min(600, e.clientX - 48)));
    const up = () => setDraggingSide(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [draggingSide]);

  useEffect(() => {
    if (!draggingTerm) return;
    const move = (e: MouseEvent) => setTermHeight(Math.max(80, Math.min(500, window.innerHeight - e.clientY - 28)));
    const up = () => setDraggingTerm(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [draggingTerm]);

  const handleViewChange = useCallback((view: ActivityView) => {
    setActiveView(view);
    if (view === 'preview') setActiveTab('preview');
    if (view === 'chat')    setActiveTab('chat');
    if (view === 'agent')   setActiveTab('agent');
    // 'studio' uses full-width main area — no tab switch needed
  }, []);

  // Studio view takes over the full main content area
  const isStudio = activeView === 'studio';

  if (checking) {
    return (
      <div className="h-screen flex items-center justify-center bg-ide-bg text-ide-text">
        <Loader2 className="w-6 h-6 animate-spin text-ide-accent" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <div className="h-screen flex flex-col bg-ide-bg text-ide-text overflow-hidden select-none">
      {showSetupWizard && <SetupWizard onComplete={() => setShowSetupWizard(false)} />}
      {showFirstRun && <FirstRunWizard onClose={completeFirstRun} />}
      {showNewProject && (
        <NewProjectWizard
          onClose={() => setShowNewProject(false)}
          onCreated={() => setShowNewProject(false)}
        />
      )}
      <TopBar onNewProject={() => setShowNewProject(true)} />
      <div className="flex flex-1 overflow-hidden">
        <ActivityBar active={activeView} onChange={handleViewChange} fleetBadge={fleetBadge} />
        {/* When studio is active, hide normal side panel & editor, show full-width Studio */}
        {isStudio ? (
          <div className="flex-1 overflow-hidden">
            <PanelErrorBoundary name="Studio">
              <TheGodFactory />
            </PanelErrorBoundary>
          </div>
        ) : (
          <>
        <SidePanel view={activeView} width={sideWidth} onNewProject={() => setShowNewProject(true)} />
        <div
          className="w-1 cursor-col-resize bg-ide-border hover:bg-ide-accent/40 transition-colors flex-shrink-0"
          onMouseDown={() => setDraggingSide(true)}
        />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="flex-1 overflow-hidden">
            <PanelErrorBoundary name="Editor">
              <EditorArea activeTab={activeTab} onTabChange={setActiveTab} previewUrl={previewUrl} />
            </PanelErrorBoundary>
          </div>
          {termOpen && (
            <div
              className="h-1 cursor-row-resize bg-ide-border hover:bg-ide-accent/40 transition-colors flex-shrink-0"
              onMouseDown={() => setDraggingTerm(true)}
            />
          )}
          <div
            className="flex-shrink-0 border-t border-ide-border flex flex-col"
            style={termOpen ? { height: termHeight } : { height: 28 }}
          >
            <div
              className="h-7 flex items-center px-3 bg-ide-panel border-b border-ide-border flex-shrink-0 cursor-pointer"
              onClick={() => setTermOpen(v => !v)}
            >
              <span className="text-[10px] uppercase tracking-wider text-ide-text-dim font-semibold flex-1">Terminal</span>
              {termOpen ? <ChevronDown className="w-3.5 h-3.5 text-ide-text-dim" /> : <ChevronUp className="w-3.5 h-3.5 text-ide-text-dim" />}
            </div>
            {termOpen && (
              <div className="flex-1 overflow-hidden">
                <PanelErrorBoundary name="Terminal">
                  <TerminalPanel />
                </PanelErrorBoundary>
              </div>
            )}
          </div>
        </div>
          </>
        )}
      </div>
      <StatusBar />
    </div>
  );
}

function StatusBar() {
  const { user } = useAuthStore();
  const { mode } = useChatStore();
  const { state: agentState } = useAgentStore();
  const dot =
    agentState === 'executing' ? 'bg-green-400 animate-pulse' :
    agentState === 'planning' ? 'bg-yellow-400 animate-pulse' :
    agentState === 'error'    ? 'bg-red-400' :
    agentState === 'complete' ? 'bg-blue-400' : 'bg-ide-text-dim';
  return (
    <div className="h-6 bg-ide-accent/10 border-t border-ide-border flex items-center px-3 text-[10px] text-ide-text-dim justify-between flex-shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-ide-accent font-semibold">Personal IDE</span>
        <span className="capitalize">{mode} mode</span>
        <span className="flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
          <span className="capitalize">{agentState}</span>
        </span>
      </div>
      <div className="flex items-center gap-3">{user && <span>{user.login}</span>}</div>
    </div>
  );
}
