// ============================================
// Top Bar - Auth, Model Selector, Mode Tabs
// ============================================
import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useProjectStore } from '../stores/projectStore';
import {
  LogOut, User, ChevronDown, MessageSquare, Pencil, ListChecks, Bot,
  Zap, Gauge, Settings, Waves, Bird
} from 'lucide-react';
import { ProviderSettings } from './ProviderSettings';
import { NanoSeaControls } from './NanoSeaControls';
import { MidwifePanel } from './MidwifePanel';
import { ModelDropdown } from './UniversalModelPicker';
import { useModelStore } from '../stores/modelStore';
import { HelpTip } from './HelpTip';

const MODE_CONFIG = [
  { id: 'ask' as const, label: 'Ask', icon: MessageSquare, desc: 'Ask questions about code', color: 'text-blue-400' },
  { id: 'edit' as const, label: 'Edit', icon: Pencil, desc: 'Edit specific files', color: 'text-green-400' },
  { id: 'plan' as const, label: 'Plan', icon: ListChecks, desc: 'Plan a task step-by-step', color: 'text-yellow-400' },
  { id: 'agent' as const, label: 'Agent', icon: Bot, desc: 'Autonomous coding loop', color: 'text-purple-400' },
];

interface TopBarProps {
  onNewProject?: () => void;
}

export function TopBar({ onNewProject }: TopBarProps) {
  const { user, logout } = useAuthStore();
  const { mode, setMode, selectedModel, setModel } = useChatStore();
  const { activeProject } = useProjectStore();
  const { allModels, providerErrors, fetchModels } = useModelStore();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showProviderSettings, setShowProviderSettings] = useState(false);
  const [showNanoSea, setShowNanoSea] = useState(false);
  const [showMidwife, setShowMidwife] = useState(false);

  useEffect(() => {
    void fetchModels();
  }, []);

  useEffect(() => {
    if (allModels.length === 0) return;
    if (!allModels.some(model => model.id === selectedModel)) {
      setModel(allModels[0].id);
    }
  }, [allModels, selectedModel, setModel]);

  const currentModel = allModels.find(m => m.id === selectedModel);


  return (
    <div className="h-12 bg-ide-sidebar border-b border-ide-border flex items-center px-3 gap-2 shrink-0">
      {/* App name + project */}
      <div className="flex items-center gap-2 mr-4">
        <Zap className="w-5 h-5 text-ide-accent" />
        <span className="font-semibold text-sm hidden sm:inline">Personal IDE</span>
        {activeProject && (
          <span className="text-xs text-ide-text-dim bg-ide-bg px-2 py-0.5 rounded">
            {activeProject.name}
          </span>
        )}
        {onNewProject && (
          <div className="flex items-center gap-1" data-help-id="top.new-project">
            <button
              onClick={onNewProject}
              className="text-xs text-ide-text-dim hover:text-ide-accent px-1.5 py-0.5 rounded hover:bg-ide-accent/10 transition-colors"
              title="New Project"
            >
              + New
            </button>
            <HelpTip helpId="top.new-project" />
          </div>
        )}
      </div>

      {/* Mode Tabs */}
      <div className="flex items-center gap-0.5 bg-ide-bg rounded-lg p-0.5">
        {MODE_CONFIG.map(m => (
          <div key={m.id} className="flex items-center" data-help-id={`top.mode.${m.id}`}>
            <button
              onClick={() => setMode(m.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === m.id
                  ? 'bg-ide-sidebar text-ide-text shadow-sm'
                  : 'text-ide-text-dim hover:text-ide-text'
              }`}
              title={m.desc}
            >
              <m.icon className={`w-3.5 h-3.5 ${mode === m.id ? m.color : ''}`} />
              <span className="hidden md:inline">{m.label}</span>
            </button>
            <HelpTip helpId={`top.mode.${m.id}`} className="ml-0.5" />
          </div>
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Model Selector */}
      <div className="flex items-center gap-2" data-help-id="top.model-picker">
        <Gauge className="w-3.5 h-3.5 text-ide-accent" />
        <div className="w-72 min-w-[13rem]">
          <ModelDropdown
            value={selectedModel}
            onChange={setModel}
            placeholder={currentModel?.name || selectedModel || 'Select model…'}
          />
        </div>
        <HelpTip helpId="top.model-picker" />
        {providerErrors.length > 0 && (
          <span
            className="hidden lg:inline text-[10px] px-2 py-1 rounded border border-yellow-500/30 bg-yellow-500/10 text-yellow-300 max-w-40 truncate"
            title={providerErrors.map(error => `${error.provider}: ${error.error}`).join('\n')}
          >
            {providerErrors.length} provider issue{providerErrors.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* Nano Sea Controls */}
      <div className="flex items-center" data-help-id="top.nano-controls">
        <button
          onClick={() => setShowNanoSea(true)}
          className="p-1.5 hover:bg-ide-bg rounded text-ide-text-dim hover:text-cyan-400 transition-colors"
          title="Nano Sea Controls"
        >
          <Waves className="w-4 h-4" />
        </button>
        <HelpTip helpId="top.nano-controls" />
      </div>

      {showNanoSea && (
        <NanoSeaControls onClose={() => setShowNanoSea(false)} />
      )}

      {/* Midwife Bird-Feeding */}
      <div className="flex items-center" data-help-id="top.midwife-controls">
        <button
          onClick={() => setShowMidwife(true)}
          className="p-1.5 hover:bg-ide-bg rounded text-ide-text-dim hover:text-amber-400 transition-colors"
          title="Midwife Bird-Feeding"
        >
          <Bird className="w-4 h-4" />
        </button>
        <HelpTip helpId="top.midwife-controls" />
      </div>

      {showMidwife && (
        <MidwifePanel onClose={() => setShowMidwife(false)} />
      )}

      {/* Provider Settings */}
      <div className="flex items-center" data-help-id="top.provider-settings">
        <button
          onClick={() => setShowProviderSettings(true)}
          className="p-1.5 hover:bg-ide-bg rounded text-ide-text-dim hover:text-ide-text transition-colors"
          title="AI Provider Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
        <HelpTip helpId="top.provider-settings" />
      </div>

      {showProviderSettings && (
        <ProviderSettings onClose={() => { setShowProviderSettings(false); void fetchModels(true); }} />
      )}

      {/* User Menu */}
      <div className="relative flex items-center" data-help-id="top.user-menu">
        <button
          onClick={() => setShowUserMenu(!showUserMenu)}
          className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-ide-bg transition-colors"
        >
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
          ) : (
            <User className="w-5 h-5 text-ide-text-dim" />
          )}
          <ChevronDown className="w-3 h-3 text-ide-text-dim" />
        </button>
        <HelpTip helpId="top.user-menu" className="ml-1" />

        {showUserMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
            <div className="absolute right-0 top-full mt-1 w-56 bg-ide-sidebar border border-ide-border rounded-lg shadow-xl z-50">
              {user && (
                <div className="p-3 border-b border-ide-border">
                  <div className="text-sm font-medium">{user.name || user.login}</div>
                  <div className="text-xs text-ide-text-dim">@{user.login}</div>
                  {user.hasCopilot && (
                    <div className="text-xs text-ide-success mt-1">✓ GitHub Copilot Active</div>
                  )}
                </div>
              )}
              <button
                onClick={() => { logout(); setShowUserMenu(false); }}
                className="w-full text-left px-3 py-2.5 text-sm text-ide-error hover:bg-ide-bg/50 flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
