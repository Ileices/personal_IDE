// ============================================
// Side Panel — Content area for the active
// ActivityBar view. Fully self-contained so
// adding a new feature = add a new case here.
// ============================================
import React, { useState, useCallback } from 'react';
import type { ActivityView } from './ActivityBar';
import { ProjectPanel } from './ProjectPanel';
import { FileBrowser } from './FileBrowser';
import { MemoryPanel } from './MemoryPanel';
import { CheckpointViewer } from './CheckpointViewer';
import { RateLimitDashboard } from './RateLimitDashboard';
import { ConversationSidebar } from './ConversationSidebar';
import { AgentControls } from './AgentControls';
import { OpenClawPanel } from './OpenClawPanel';
import { MidwifePanel } from './MidwifePanel';
import { NanoSeaControls } from './NanoSeaControls';
import { ProviderSettings } from './ProviderSettings';
import { TheGodFactory } from './TheGodFactory';
import { ModelStrategyPanel } from './ModelStrategyPanel';
import { BlamePanel } from './BlamePanel';
import { HelpPanel } from './HelpPanel';
import { LocalModelCatalog } from './LocalModelCatalog';
import { TagRegistryPanel } from './TagRegistryPanel';
import { ForensicPanel } from './ForensicPanel';
import { GapAnalysisPanel } from './GapAnalysisPanel';
import { ProjectStateCrawlerPanel } from './ProjectStateCrawlerPanel';
import { SuggestedJobsPanel } from './SuggestedJobsPanel';
import { ProviderSetupWizard } from './wizards/ProviderSetupWizard';
import { ModelStrategyWizard } from './wizards/ModelStrategyWizard';
import { HelpTip } from './HelpTip';

interface SidePanelProps {
  view: ActivityView;
  width: number;
  onClose?: () => void;
  onNewProject?: () => void;
}

export function SidePanel({ view, width, onClose, onNewProject }: SidePanelProps) {
  const [showMidwife, setShowMidwife] = useState(false);
  const [showNano, setShowNano] = useState(false);
  const [showProviders, setShowProviders] = useState(false);

  const innerStyle: React.CSSProperties = {
    width,
    minWidth: width,
    maxWidth: width,
  };

  return (
    <div
      className="flex flex-col h-full bg-ide-sidebar border-r border-ide-border overflow-hidden flex-shrink-0"
      style={innerStyle}
    >
      {view === 'explorer' && <ExplorerView onNewProject={onNewProject} />}
      {view === 'chat' && <ChatSidebarView />}
      {view === 'agent' && <AgentSidebarView />}
      {view === 'fleet' && <FleetView />}
      {view === 'memory' && <MemoryView />}
      {view === 'checkpoints' && <CheckpointsView />}
      {view === 'preview' && <PreviewSidebarView />}

      {view === 'nano' && (
        <NanoSidebarView />
      )}

      {view === 'midwife' && (
        <MidwifeSidebarView />
      )}

      {view === 'providers' && (
        <ProvidersSidebarView />
      )}

      {view === 'security' && (
        <SecurityView />
      )}

      {/* ── New views wired from ActivityBar ── */}
      {view === 'studio' && <StudioView />}
      {view === 'strategy' && <StrategyView />}
      {view === 'rates' && <RatesView />}
      {view === 'blame' && <BlameView />}
      {view === 'local-models' && <LocalModelCatalogView />}
      {view === 'tags' && <TagRegistryView />}
      {view === 'forensic' && <ForensicView />}
      {view === 'gap' && <GapAnalysisPanel />}
      {view === 'project-state-crawler' && <ProjectStateCrawlerPanel />}
      {view === 'suggested-jobs' && <SuggestedJobsPanel />}
      {view === 'help' && <HelpView />}
    </div>
  );
}

// ── Explorer ────────────────────────────────────
function ExplorerView({ onNewProject }: { onNewProject?: () => void }) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center h-9 px-3 border-b border-ide-border flex-shrink-0" data-help-id="panel.explorer">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ide-text-dim flex-1">Explorer</span>
        <HelpTip helpId="panel.explorer" className="mr-1" />
        {onNewProject && (
          <div className="flex items-center gap-1" data-help-id="top.new-project">
            <button
              onClick={onNewProject}
              className="text-[10px] text-ide-text-dim hover:text-ide-accent px-1.5 py-0.5 rounded hover:bg-ide-accent/10 transition-colors"
              title="New Project"
            >
              + New
            </button>
            <HelpTip helpId="top.new-project" />
          </div>
        )}
      </div>
      <div className="flex-shrink-0 overflow-y-auto border-b border-ide-border" style={{ maxHeight: '40%' }}>
        <ProjectPanel />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <FileBrowser />
      </div>
    </div>
  );
}

// ── Chat ────────────────────────────────────────
function ChatSidebarView() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader title="Conversations" helpId="panel.chat" />
      <div className="flex-1 overflow-y-auto">
        <ConversationSidebar />
      </div>
      <div className="flex-shrink-0 border-t border-ide-border">
        <RateLimitDashboard />
      </div>
    </div>
  );
}

// ── Agent ────────────────────────────────────────
function AgentSidebarView() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader title="Agent" helpId="panel.agent" />
      <AgentControls />
      <div className="flex-shrink-0 border-t border-ide-border">
        <OpenClawPanel />
      </div>
    </div>
  );
}

// ── Fleet ────────────────────────────────────────
function FleetView() {
  // Fleet panel content (lazy import to avoid bloating initial bundle)
  const [Panel, setPanel] = React.useState<React.ComponentType | null>(null);
  React.useEffect(() => {
    import('./agent/FleetPanel').then(m => setPanel(() => m.FleetPanel as React.ComponentType)).catch(() => setPanel(() => FallbackPanel));
  }, []);
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader title="Agent Fleet" helpId="panel.fleet" />
      <div className="flex-1 overflow-y-auto p-2">
        {Panel ? <Panel /> : <LoadingPlaceholder label="Loading fleet…" />}
      </div>
    </div>
  );
}

// ── Nano Sea ─────────────────────────────────────
function NanoSidebarView() {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader title="Nano Sea" helpId="activity.nano" />
      <div className="flex-1 overflow-y-auto p-3">
        <p className="text-xs text-ide-text-dim mb-3">
          The Nano Sea is the distributed compute mesh of small trained models.
        </p>
        <button
          onClick={() => setShow(true)}
          className="w-full py-2 text-sm bg-ide-accent/20 text-ide-accent rounded hover:bg-ide-accent/30 transition-colors"
        >
          Open Nano Sea Controls
        </button>
      </div>
      {show && <NanoSeaControls onClose={() => setShow(false)} />}
    </div>
  );
}

// ── Midwife ──────────────────────────────────────
function MidwifeSidebarView() {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader title="Midwife Trainer" helpId="activity.midwife" />
      <div className="flex-1 overflow-y-auto p-3">
        <p className="text-xs text-ide-text-dim mb-3">
          The Midwife system feeds training examples to Nano models, improving
          them from real agent interactions (bird-feeding pattern).
        </p>
        <button
          onClick={() => setShow(true)}
          className="w-full py-2 text-sm bg-ide-accent/20 text-ide-accent rounded hover:bg-ide-accent/30 transition-colors"
        >
          Open Midwife Controls
        </button>
      </div>
      {show && <MidwifePanel onClose={() => setShow(false)} />}
    </div>
  );
}

// ── Memory ───────────────────────────────────────
function MemoryView() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader title="Memory" helpId="panel.memory" />
      <div className="flex-1 overflow-y-auto">
        <MemoryPanel />
      </div>
    </div>
  );
}

// ── Checkpoints ──────────────────────────────────
function CheckpointsView() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader title="Checkpoints" helpId="panel.checkpoints" />
      <div className="flex-1 overflow-y-auto">
        <CheckpointViewer />
      </div>
    </div>
  );
}

// ── Preview sidebar ───────────────────────────────
function PreviewSidebarView() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader title="Preview" helpId="panel.preview" />
      <div className="p-3 text-xs text-ide-text-dim space-y-2">
        <p>Use the Preview tab in the editor area to view a running app.</p>
        <p>The agent will automatically open the dev server URL when it starts one.</p>
      </div>
    </div>
  );
}

// ── Providers ────────────────────────────────────
function ProvidersSidebarView() {
  const [show, setShow] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader title="Providers & Settings" helpId="panel.providers" />
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <p className="text-xs text-ide-text-dim">
          Configure AI providers: GitHub Copilot, Ollama (local models), Nano Sea, and more.
        </p>
        <button
          onClick={() => setShowSetupWizard(true)}
          className="w-full py-2 text-sm bg-ide-accent/20 text-ide-accent rounded hover:bg-ide-accent/30 transition-colors"
        >
          + Add New Provider (Wizard)
        </button>
        <button
          onClick={() => setShow(true)}
          className="w-full py-2 text-sm border border-ide-border rounded text-ide-text-dim hover:text-ide-text hover:border-ide-accent/40 transition-colors"
        >
          Open All Provider Settings
        </button>
      </div>
      {show && <ProviderSettings onClose={() => setShow(false)} />}
      {showSetupWizard && <ProviderSetupWizard onClose={() => setShowSetupWizard(false)} />}
    </div>
  );
}

// ── THE GOD FACTORY ───────────────────────────────
function StudioView() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TheGodFactory />
    </div>
  );
}

// ── Model Strategy ────────────────────────────────
function StrategyView() {
  const [showWizard, setShowWizard] = useState(false);
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader title="Model Strategy & Fallbacks" helpId="panel.strategy" />
      <div className="flex-shrink-0 p-3 border-b border-ide-border">
        <button
          onClick={() => setShowWizard(true)}
          className="w-full py-2 text-sm bg-ide-accent/20 text-ide-accent rounded hover:bg-ide-accent/30 transition-colors"
        >
          Open Strategy Wizard
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <ModelStrategyPanel />
      </div>
      {showWizard && <ModelStrategyWizard onClose={() => setShowWizard(false)} />}
    </div>
  );
}

// ── Rate Limits ───────────────────────────────────
function RatesView() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader title="Rate Limits & Usage" helpId="panel.rates" />
      <div className="flex-1 overflow-y-auto p-3">
        <RateLimitDashboard />
      </div>
    </div>
  );
}

// ── BLAME Tracking ────────────────────────────────
function BlameView() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <BlamePanel />
    </div>
  );
}

// ── Local Model Catalog ─────────────────────────────
function LocalModelCatalogView() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <LocalModelCatalog />
    </div>
  );
}

// ── Help ──────────────────────────────────────────
function HelpView() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-1 border-b border-ide-border flex items-center gap-1" data-help-id="panel.help">
        <span className="text-[10px] uppercase tracking-wider text-ide-text-dim">Help Tools</span>
        <HelpTip helpId="panel.help" />
      </div>
      <HelpPanel />
    </div>
  );
}

// ── Tag Registry ──────────────────────────────────
function TagRegistryView() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TagRegistryPanel />
    </div>
  );
}

// ── Forensic Database ─────────────────────────────
function ForensicView() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ForensicPanel />
    </div>
  );
}

// ── Security ─────────────────────────────────────
function SecurityView() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader title="Security & Auth" helpId="panel.security" />
      <div className="p-3 text-xs text-ide-text-dim space-y-2">
        <p>Auth is handled via GitHub OAuth.</p>
        <p>API keys for cloud providers are stored encrypted in the local database.</p>
        <p>The agent runs in a sandboxed environment — dangerous shell commands are blocked.</p>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────
function PanelHeader({ title, helpId }: { title: string; helpId?: string }) {
  return (
    <div className="flex items-center h-9 px-3 border-b border-ide-border flex-shrink-0" data-help-id={helpId}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-ide-text-dim flex-1">
        {title}
      </span>
      {helpId && <HelpTip helpId={helpId} />}
    </div>
  );
}

function LoadingPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-8 text-xs text-ide-text-dim">{label}</div>
  );
}

function FallbackPanel() {
  return <div className="p-3 text-xs text-ide-text-dim">Fleet panel unavailable.</div>;
}
