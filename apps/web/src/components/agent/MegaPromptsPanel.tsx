// ============================================
// MegaPromptsPanel — Mega prompt preset manager
// Supports: preset presets from megaPrompts.ts,
// user-created custom prompts (localStorage),
// archive/delete, token estimate warnings
// ============================================
import React, { useState, useCallback } from 'react';
import { BookOpen, ChevronDown, ChevronRight, Plus, Archive,
  Trash2, AlertTriangle, X, Edit3, Check } from 'lucide-react';
import { MEGA_PROMPTS, type MegaPrompt } from '../../data/megaPrompts.js';

const ARCHIVE_KEY = 'mega_prompts_archived';
const CUSTOM_KEY  = 'mega_prompts_custom';

// ── Persistence helpers ───────────────────────
function loadArchived(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(ARCHIVE_KEY) || '[]')); } catch { return new Set(); }
}
function saveArchived(ids: Set<string>) {
  try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify([...ids])); } catch {}
}
function loadCustom(): MegaPrompt[] {
  try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); } catch { return []; }
}
function saveCustom(prompts: MegaPrompt[]) {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(prompts)); } catch {}
}

// ── Token estimate ────────────────────────────
function estimateTokens(text: string): number {
  return Math.round(text.length / 3.5);
}

function TokenBadge({ text }: { text: string }) {
  const tokens = estimateTokens(text);
  if (tokens < 3000) return null;
  const isLarge = tokens > 8000;
  return (
    <span className={`px-1 py-0.5 rounded text-[8px] font-mono ${
      isLarge ? 'bg-yellow-500/15 text-yellow-400' : 'bg-ide-text-dim/15 text-ide-text-dim'
    }`}>
      ~{tokens >= 1000 ? `${(tokens / 1000).toFixed(0)}K` : tokens} tok
    </span>
  );
}

// ── Component ─────────────────────────────────
interface Props {
  maxAgents: number;
  onSelect: (prompt: string, fleet: boolean, agentCount: number) => void;
}

export function MegaPromptsPanel({ maxAgents, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archived, setArchived] = useState<Set<string>>(loadArchived);
  const [custom, setCustom] = useState<MegaPrompt[]>(loadCustom);
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrompt, setEditPrompt] = useState('');

  const archivePreset = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(archived);
    next.add(id);
    setArchived(next);
    saveArchived(next);
  }, [archived]);

  const unarchivePreset = useCallback((id: string) => {
    const next = new Set(archived);
    next.delete(id);
    setArchived(next);
    saveArchived(next);
  }, [archived]);

  const deleteCustom = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this custom mega-prompt?')) return;
    const next = custom.filter(p => p.id !== id);
    setCustom(next);
    saveCustom(next);
  }, [custom]);

  const addCustom = useCallback(() => {
    if (!newName.trim() || !newPrompt.trim()) return;
    const item: MegaPrompt = {
      id: `custom-${Date.now()}`,
      name: newName.trim(),
      description: '',
      projectPath: '',
      prompt: newPrompt.trim(),
      tags: ['custom'],
      fleetRecommended: false,
      recommendedAgentCount: 1,
    };
    const next = [item, ...custom];
    setCustom(next);
    saveCustom(next);
    setNewName('');
    setNewPrompt('');
    setAddingNew(false);
  }, [newName, newPrompt, custom]);

  const saveEdit = useCallback(() => {
    if (!editingId) return;
    const next = custom.map(p => p.id === editingId
      ? { ...p, name: editName.trim() || p.name, prompt: editPrompt.trim() || p.prompt }
      : p
    );
    setCustom(next);
    saveCustom(next);
    setEditingId(null);
  }, [editingId, editName, editPrompt, custom]);

  const activePresets = MEGA_PROMPTS.filter(p => !archived.has(p.id));
  const archivedPresets = MEGA_PROMPTS.filter(p => archived.has(p.id));

  const renderPreset = (preset: MegaPrompt, isCustom = false, isArchivedItem = false) => {
    if (editingId === preset.id && isCustom) {
      return (
        <div key={preset.id} className="border border-ide-accent/30 rounded p-2 space-y-1.5 bg-ide-bg">
          <input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            className="w-full bg-ide-panel border border-ide-border rounded px-2 py-1 text-[10px] focus:outline-none focus:border-ide-accent"
            placeholder="Name"
          />
          <textarea
            value={editPrompt}
            onChange={e => setEditPrompt(e.target.value)}
            rows={4}
            className="w-full bg-ide-panel border border-ide-border rounded px-2 py-1 text-[10px] font-mono focus:outline-none focus:border-ide-accent resize-none"
            placeholder="Prompt text..."
          />
          <div className="flex gap-1">
            <button onClick={saveEdit} className="flex items-center gap-1 px-2 py-1 bg-ide-accent/20 text-ide-accent rounded text-[9px] hover:bg-ide-accent/30">
              <Check className="w-2.5 h-2.5" /> Save
            </button>
            <button onClick={() => setEditingId(null)} className="px-2 py-1 text-ide-text-dim border border-ide-border rounded text-[9px]">
              Cancel
            </button>
          </div>
        </div>
      );
    }

    return (
      <div key={preset.id} className="relative group">
        <button
          onClick={() => {
            if (!isArchivedItem) {
              onSelect(preset.prompt, preset.fleetRecommended, Math.min(preset.recommendedAgentCount, maxAgents));
              setOpen(false);
            }
          }}
          className={`w-full text-left px-2 py-1.5 bg-ide-bg/50 hover:bg-ide-bg border rounded text-[10px] transition-colors ${
            isArchivedItem ? 'border-ide-border/30 opacity-50' : 'border-ide-border/50 hover:border-ide-border'
          }`}
        >
          <div className="flex items-center gap-1 pr-12">
            <span className="font-medium text-ide-text truncate">{preset.name}</span>
            {preset.fleetRecommended && (
              <span className="px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[8px] flex-shrink-0">
                Fleet ×{preset.recommendedAgentCount}
              </span>
            )}
            <TokenBadge text={preset.prompt} />
          </div>
          {preset.description && (
            <div className="text-ide-text-dim mt-0.5 truncate">{preset.description}</div>
          )}
        </button>

        {/* Action buttons — appear on hover */}
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5">
          {isCustom && !isArchivedItem && (
            <button
              onClick={e => { e.stopPropagation(); setEditingId(preset.id); setEditName(preset.name); setEditPrompt(preset.prompt); }}
              className="p-1 rounded text-ide-text-dim hover:text-ide-accent hover:bg-ide-panel"
              title="Edit"
            >
              <Edit3 className="w-2.5 h-2.5" />
            </button>
          )}
          {isCustom ? (
            <button
              onClick={e => deleteCustom(preset.id, e)}
              className="p-1 rounded text-ide-text-dim hover:text-red-400 hover:bg-ide-panel"
              title="Delete"
            >
              <Trash2 className="w-2.5 h-2.5" />
            </button>
          ) : isArchivedItem ? (
            <button
              onClick={e => { e.stopPropagation(); unarchivePreset(preset.id); }}
              className="p-1 rounded text-ide-text-dim hover:text-green-400 hover:bg-ide-panel text-[8px]"
              title="Restore"
            >
              ↩
            </button>
          ) : (
            <button
              onClick={e => archivePreset(preset.id, e)}
              className="p-1 rounded text-ide-text-dim hover:text-yellow-400 hover:bg-ide-panel"
              title="Archive"
            >
              <Archive className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mb-2">
      {/* Header toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-[10px] text-ide-text-dim hover:text-ide-accent mb-1 w-full"
      >
        <BookOpen className="w-3 h-3" />
        <span>Mega-Prompts</span>
        {(custom.length > 0 || activePresets.length < MEGA_PROMPTS.length) && (
          <span className="text-[9px] text-ide-accent ml-0.5">
            {activePresets.length + custom.length}
          </span>
        )}
        {open ? <ChevronDown className="w-3 h-3 ml-auto" /> : <ChevronRight className="w-3 h-3 ml-auto" />}
      </button>

      {open && (
        <div className="space-y-1 mb-2">
          {/* Custom prompts */}
          {custom.length > 0 && (
            <>
              <div className="text-[9px] text-ide-text-dim px-1 uppercase tracking-wider">Custom</div>
              {custom.map(p => renderPreset(p, true))}
            </>
          )}

          {/* Add new custom */}
          {addingNew ? (
            <div className="border border-ide-accent/30 rounded p-2 space-y-1.5 bg-ide-bg">
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="w-full bg-ide-panel border border-ide-border rounded px-2 py-1 text-[10px] focus:outline-none focus:border-ide-accent"
                placeholder="Prompt name..."
              />
              <textarea
                value={newPrompt}
                onChange={e => setNewPrompt(e.target.value)}
                rows={4}
                className="w-full bg-ide-panel border border-ide-border rounded px-2 py-1 text-[10px] font-mono focus:outline-none focus:border-ide-accent resize-none"
                placeholder="Prompt text..."
              />
              {newPrompt && <TokenBadge text={newPrompt} />}
              <div className="flex gap-1">
                <button onClick={addCustom} disabled={!newName.trim() || !newPrompt.trim()}
                  className="flex items-center gap-1 px-2 py-1 bg-ide-accent/20 text-ide-accent rounded text-[9px] hover:bg-ide-accent/30 disabled:opacity-40">
                  <Check className="w-2.5 h-2.5" /> Save
                </button>
                <button onClick={() => setAddingNew(false)} className="px-2 py-1 text-ide-text-dim border border-ide-border rounded text-[9px]">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAddingNew(true)}
              className="w-full text-left px-2 py-1.5 border border-dashed border-ide-border/50 rounded text-[10px] text-ide-text-dim hover:text-ide-accent hover:border-ide-accent/50 flex items-center gap-1 transition-colors">
              <Plus className="w-2.5 h-2.5" /> New custom prompt
            </button>
          )}

          {/* Built-in presets */}
          {activePresets.length > 0 && (
            <>
              <div className="text-[9px] text-ide-text-dim px-1 uppercase tracking-wider mt-1">Presets</div>
              {activePresets.map(p => renderPreset(p))}
            </>
          )}

          {/* Archived section */}
          {archivedPresets.length > 0 && (
            <div>
              <button
                onClick={() => setShowArchived(v => !v)}
                className="flex items-center gap-1 text-[9px] text-ide-text-dim hover:text-ide-text px-1 mt-1"
              >
                <Archive className="w-2.5 h-2.5" />
                Archived ({archivedPresets.length})
                {showArchived ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
              </button>
              {showArchived && (
                <div className="mt-1 space-y-1">
                  {archivedPresets.map(p => renderPreset(p, false, true))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
