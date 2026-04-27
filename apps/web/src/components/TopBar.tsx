// ============================================
// Top Bar - Auth, Model Selector, Mode Tabs
// ============================================
import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useProjectStore } from '../stores/projectStore';
import { MODELS } from '@personal-ide/shared';
import {
  LogOut, User, ChevronDown, MessageSquare, Pencil, ListChecks, Bot,
  Zap, Gauge, Settings, Waves, Bird
} from 'lucide-react';
import { ProviderSettings } from './ProviderSettings';
import { NanoSeaControls } from './NanoSeaControls';
import { MidwifePanel } from './MidwifePanel';
import { API_BASE } from '../config.js';

const MODE_CONFIG = [
  { id: 'ask' as const, label: 'Ask', icon: MessageSquare, desc: 'Ask questions about code', color: 'text-blue-400' },
  { id: 'edit' as const, label: 'Edit', icon: Pencil, desc: 'Edit specific files', color: 'text-green-400' },
  { id: 'plan' as const, label: 'Plan', icon: ListChecks, desc: 'Plan a task step-by-step', color: 'text-yellow-400' },
  { id: 'agent' as const, label: 'Agent', icon: Bot, desc: 'Autonomous coding loop', color: 'text-purple-400' },
];

interface DynamicModel {
  id: string;
  name: string;
  provider: string;
  description: string;
  contextWindow: number;
  isFree?: boolean;
}

export function TopBar() {
  const { user, logout } = useAuthStore();
  const { mode, setMode, selectedModel, setModel } = useChatStore();
  const { activeProject } = useProjectStore();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showProviderSettings, setShowProviderSettings] = useState(false);
  const [showNanoSea, setShowNanoSea] = useState(false);
  const [showMidwife, setShowMidwife] = useState(false);
  const [dynamicModels, setDynamicModels] = useState<DynamicModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [providerErrors, setProviderErrors] = useState<{ provider: string; error: string }[]>([]);

  // Fetch models from all providers on mount (once — cached on server for 5 min)
  useEffect(() => {
    fetchAllModels();
  }, []);

  async function fetchAllModels() {
    setModelsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/providers/all-models`);
      const data = await res.json();
      if (data.models?.length > 0) {
        setDynamicModels(data.models);

        // Auto-fallback when current model is unavailable (common in guest mode).
        const modelIds = new Set<string>(data.models.map((m: DynamicModel) => m.id));
        if (!modelIds.has(selectedModel)) {
          setModel(data.models[0].id);
        }
      }
      // Surface errors so user knows which providers failed
      if (data.errors?.length > 0) {
        setProviderErrors(data.errors);
      } else {
        setProviderErrors([]);
      }
    } catch {
      // Fall back to static models
    } finally {
      setModelsLoading(false);
    }
  }

  // Use dynamic models if available, otherwise static
  const allModels = dynamicModels.length > 0
    ? dynamicModels
    : MODELS.map(m => ({
        id: m.id,
        name: m.name,
        provider: m.publisher || 'github',
        description: m.description,
        contextWindow: 128000,
        isFree: false,
      }));

  // Group models by provider
  const modelsByProvider = allModels.reduce((acc, m) => {
    const key = m.provider;
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {} as Record<string, DynamicModel[]>);

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
      </div>

      {/* Mode Tabs */}
      <div className="flex items-center gap-0.5 bg-ide-bg rounded-lg p-0.5">
        {MODE_CONFIG.map(m => (
          <button
            key={m.id}
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
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Model Selector */}
      <div className="relative">
        <button
          onClick={() => setShowModelMenu(!showModelMenu)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-ide-bg rounded text-xs hover:bg-ide-border transition-colors"
        >
          <Gauge className="w-3.5 h-3.5 text-ide-accent" />
          <span className="hidden sm:inline max-w-[140px] truncate">{currentModel?.name || selectedModel}</span>
          {currentModel?.provider && (
            <span className="text-[9px] text-ide-text-dim">({currentModel.provider})</span>
          )}
          <ChevronDown className="w-3 h-3 text-ide-text-dim" />
        </button>

        {showModelMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowModelMenu(false)} />
            <div className="absolute right-0 top-full mt-1 w-80 bg-ide-sidebar border border-ide-border rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
              {/* Refresh button */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-ide-border">
                <span className="text-[10px] text-ide-text-dim">{allModels.length} models available</span>
                <button
                  onClick={fetchAllModels}
                  className="text-[10px] text-ide-accent hover:underline"
                >
                  Refresh
                </button>
              </div>

              {/* Provider errors — show user why some providers are missing */}
              {providerErrors.length > 0 && (
                <div className="px-3 py-2 border-b border-ide-border bg-yellow-500/5">
                  <div className="text-[10px] font-semibold text-yellow-400 mb-1">⚠ Some providers unavailable:</div>
                  {providerErrors.map((e, i) => (
                    <div key={i} className="text-[9px] text-ide-text-dim flex items-start gap-1 mb-0.5">
                      <span className="text-yellow-500 font-medium capitalize shrink-0">{e.provider}:</span>
                      <span className="truncate">{e.error}</span>
                    </div>
                  ))}
                </div>
              )}

              {Object.entries(modelsByProvider).map(([provider, models]) => (
                <div key={provider}>
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-ide-text-dim uppercase bg-ide-bg/50 border-b border-ide-border sticky top-0">
                    {provider} ({models.length})
                  </div>
                  {models.map(m => (
                    <button
                      key={m.id}
                      onClick={() => { setModel(m.id); setShowModelMenu(false); }}
                      className={`w-full text-left px-3 py-2 hover:bg-ide-bg/50 flex items-start gap-2 ${
                        selectedModel === m.id ? 'bg-ide-accent/10' : ''
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium flex items-center gap-1.5">
                          {m.name}
                          {m.isFree && (
                            <span className="text-[9px] text-green-400 bg-green-500/10 px-1 rounded">free</span>
                          )}
                        </div>
                        <div className="text-[10px] text-ide-text-dim mt-0.5 truncate">
                          {m.description}
                          {m.contextWindow && (
                            <span className="ml-1 text-[9px]">· {Math.round(m.contextWindow / 1000)}K ctx</span>
                          )}
                        </div>
                      </div>
                      {selectedModel === m.id && (
                        <div className="w-1.5 h-1.5 bg-ide-accent rounded-full mt-1.5" />
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Nano Sea Controls */}
      <button
        onClick={() => setShowNanoSea(true)}
        className="p-1.5 hover:bg-ide-bg rounded text-ide-text-dim hover:text-cyan-400 transition-colors"
        title="Nano Sea Controls"
      >
        <Waves className="w-4 h-4" />
      </button>

      {showNanoSea && (
        <NanoSeaControls onClose={() => setShowNanoSea(false)} />
      )}

      {/* Midwife Bird-Feeding */}
      <button
        onClick={() => setShowMidwife(true)}
        className="p-1.5 hover:bg-ide-bg rounded text-ide-text-dim hover:text-amber-400 transition-colors"
        title="Midwife Bird-Feeding"
      >
        <Bird className="w-4 h-4" />
      </button>

      {showMidwife && (
        <MidwifePanel onClose={() => setShowMidwife(false)} />
      )}

      {/* Provider Settings */}
      <button
        onClick={() => setShowProviderSettings(true)}
        className="p-1.5 hover:bg-ide-bg rounded text-ide-text-dim hover:text-ide-text transition-colors"
        title="AI Provider Settings"
      >
        <Settings className="w-4 h-4" />
      </button>

      {showProviderSettings && (
        <ProviderSettings onClose={() => { setShowProviderSettings(false); fetchAllModels(); }} />
      )}

      {/* User Menu */}
      <div className="relative">
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
