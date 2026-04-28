// ============================================
// New Project Wizard
// Full project creation with template scaffolding.
// Opens from Explorer sidebar "New Project" button.
// ============================================
import React, { useState } from 'react';
import { FolderOpen, Loader2, X, ChevronRight } from 'lucide-react';
import { useProjectStore } from '../../stores/projectStore';
import { useAgentStore } from '../../stores/agentStore';

interface Props {
  onClose: () => void;
  onCreated?: () => void;
}

const TEMPLATES = [
  {
    id: 'blank', icon: '📁', label: 'Blank Project', desc: 'Empty workspace — agent starts from scratch',
    initPrompt: '',
  },
  {
    id: 'webapp', icon: '🌐', label: 'Web App', desc: 'React + TypeScript + Vite + Tailwind',
    initPrompt: 'Scaffold a React + TypeScript + Vite + Tailwind CSS web app. Create src/App.tsx, src/main.tsx, index.html, package.json, vite.config.ts, tailwind.config.js, postcss.config.js. Make it runnable with npm run dev.',
  },
  {
    id: 'game', icon: '🎮', label: 'Browser Game', desc: 'Phaser 3 + TypeScript — 2D game starter',
    initPrompt: 'Scaffold a 2D browser game using Phaser 3 + TypeScript + Vite. Create a playable starter with: a main menu scene, a game scene with a player sprite that moves with WASD/arrow keys, and basic score tracking. Make it runnable with npm run dev.',
  },
  {
    id: 'python', icon: '🐍', label: 'Python App', desc: 'FastAPI + uvicorn — REST API backend',
    initPrompt: 'Scaffold a Python FastAPI app. Create main.py with a basic API (health endpoint, example CRUD routes), requirements.txt, and a README. Make it runnable with uvicorn main:app --reload.',
  },
  {
    id: 'fullstack', icon: '⚡', label: 'Full-Stack App', desc: 'Express API + React frontend (monorepo)',
    initPrompt: 'Scaffold a full-stack app with: apps/server (Express + TypeScript, port 3000), apps/web (React + Vite + TypeScript, port 5173). Use pnpm workspaces. Both should be runnable with pnpm dev from root.',
  },
  {
    id: 'rust', icon: '🦀', label: 'Rust App', desc: 'Cargo project — CLI or systems program',
    initPrompt: 'Scaffold a Rust CLI app using Cargo. Create src/main.rs with a clean main function, Cargo.toml with name and version, and a basic command-line argument parser using clap. Make it runnable with cargo run.',
  },
  {
    id: 'discord_bot', icon: '🤖', label: 'Discord Bot', desc: 'discord.js bot with slash commands',
    initPrompt: 'Scaffold a Discord bot using discord.js v14 + TypeScript. Create src/index.ts, src/commands/ with a hello slash command, package.json, tsconfig.json, and a .env.example. Include deploy-commands.ts. Make it runnable with npm start.',
  },
  {
    id: 'mobile', icon: '📱', label: 'Mobile App', desc: 'React Native + Expo — iOS & Android',
    initPrompt: 'Scaffold a React Native + Expo app. Create app/(tabs)/index.tsx, app/(tabs)/settings.tsx, components/ThemedText.tsx, package.json with expo dependencies. Make it runnable with npx expo start.',
  },
];

export function NewProjectWizard({ onClose, onCreated }: Props) {
  const { createProject } = useProjectStore();
  const { startAgent } = useAgentStore();
  const [selectedTemplate, setSelectedTemplate] = useState('blank');
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [description, setDescription] = useState('');
  const [autoScaffold, setAutoScaffold] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const template = TEMPLATES.find(t => t.id === selectedTemplate)!;

  async function handleCreate() {
    if (!name.trim()) { setError('Project name is required'); return; }
    if (!path.trim()) { setError('Folder path is required'); return; }
    setCreating(true);
    setError('');
    try {
      const project = await createProject(name.trim(), path.trim(), description.trim() || `${template.label} project`);
      // Auto-scaffold if template has a prompt and user opted in
      if (autoScaffold && template.initPrompt) {
        startAgent(project.id, template.initPrompt, 'gpt-4.1');
      }
      onCreated?.();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to create project');
    }
    setCreating(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-ide-sidebar border border-ide-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ide-border flex-shrink-0">
          <h2 className="text-sm font-semibold text-ide-text">New Project</h2>
          <button onClick={onClose} className="text-ide-text-dim hover:text-ide-text">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Template list */}
          <div className="w-56 border-r border-ide-border flex flex-col overflow-y-auto flex-shrink-0 bg-ide-panel">
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedTemplate(t.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors border-l-2 ${
                  selectedTemplate === t.id
                    ? 'border-ide-accent bg-ide-accent/10 text-ide-text'
                    : 'border-transparent text-ide-text-dim hover:text-ide-text hover:bg-ide-bg/50'
                }`}
              >
                <span className="text-base shrink-0">{t.icon}</span>
                <div>
                  <div className="text-xs font-medium">{t.label}</div>
                  <div className="text-[10px] text-ide-text-dim leading-tight">{t.desc}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Right: form */}
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
            <div>
              <div className="text-2xl mb-1">{template.icon}</div>
              <h3 className="text-sm font-semibold text-ide-text">{template.label}</h3>
              <p className="text-xs text-ide-text-dim">{template.desc}</p>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-ide-text-dim mb-1 block">Project Name *</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="my-project"
                  className="w-full bg-ide-panel border border-ide-border rounded-lg px-3 py-2 text-sm text-ide-text focus:outline-none focus:border-ide-accent"
                />
              </div>

              <div>
                <label className="text-xs text-ide-text-dim mb-1 block">Folder Path * <span className="text-[10px]">(absolute path on this machine)</span></label>
                <input
                  value={path}
                  onChange={e => setPath(e.target.value)}
                  placeholder="C:\projects\my-project"
                  className="w-full bg-ide-panel border border-ide-border rounded-lg px-3 py-2 text-sm text-ide-text focus:outline-none focus:border-ide-accent"
                />
              </div>

              <div>
                <label className="text-xs text-ide-text-dim mb-1 block">Description <span className="text-[10px]">(optional — helps the agent understand the goal)</span></label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="A multiplayer tower defense game with procedural maps..."
                  rows={3}
                  className="w-full bg-ide-panel border border-ide-border rounded-lg px-3 py-2 text-sm text-ide-text focus:outline-none focus:border-ide-accent resize-none"
                />
              </div>

              {template.initPrompt && (
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoScaffold}
                    onChange={e => setAutoScaffold(e.target.checked)}
                    className="mt-0.5 accent-ide-accent"
                  />
                  <div>
                    <span className="text-xs text-ide-text">Auto-scaffold with agent</span>
                    <p className="text-[10px] text-ide-text-dim mt-0.5">The agent will immediately generate the initial file structure for this template.</p>
                  </div>
                </label>
              )}
            </div>

            {error && <div className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</div>}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-ide-border flex-shrink-0 bg-ide-panel">
          <button onClick={onClose} className="text-xs text-ide-text-dim hover:text-ide-text px-3 py-1.5">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-4 py-2 rounded-lg bg-ide-accent text-ide-bg font-semibold text-sm flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />}
            {creating ? 'Creating...' : 'Create Project'}
            {!creating && <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
