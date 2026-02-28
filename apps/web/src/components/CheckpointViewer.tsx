// ============================================
// Checkpoint Viewer - Git-based versioning UI
// ============================================
import React, { useState, useEffect } from 'react';
import {
  GitBranch, RotateCcw, Clock, FileCode, Plus,
  Loader2, ChevronDown, ChevronRight, Check, AlertTriangle
} from 'lucide-react';
import { useProjectStore } from '../stores/projectStore';
import { API_BASE } from '../config.js';

interface Checkpoint {
  id: string;
  projectId: string;
  description: string;
  hash: string;
  filesSnapshot: string[];
  iterationNumber: number;
  createdAt: string;
}

export function CheckpointViewer() {
  const { activeProject } = useProjectStore();
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (activeProject?.id) fetchCheckpoints();
  }, [activeProject?.id]);

  async function fetchCheckpoints() {
    if (!activeProject) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/checkpoints/${activeProject.id}`);
      const data = await res.json();
      setCheckpoints(Array.isArray(data) ? data : []);
    } catch {
      setCheckpoints([]);
    } finally {
      setLoading(false);
    }
  }

  async function createCheckpoint() {
    if (!activeProject || !description.trim()) return;
    setCreating(true);
    try {
      await fetch(`${API_BASE}/api/checkpoints/${activeProject.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectRoot: activeProject.rootPath,
          description: description.trim(),
        }),
      });
      setDescription('');
      fetchCheckpoints();
    } catch (err) {
      console.error('Checkpoint creation failed:', err);
    } finally {
      setCreating(false);
    }
  }

  async function rollback(checkpointId: string) {
    if (!activeProject) return;
    if (!confirm('Are you sure? This will revert files to this checkpoint.')) return;
    setRollingBack(checkpointId);
    try {
      await fetch(`${API_BASE}/api/checkpoints/${activeProject.id}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkpointId,
          projectRoot: activeProject.rootPath,
        }),
      });
      fetchCheckpoints();
    } catch (err) {
      console.error('Rollback failed:', err);
    } finally {
      setRollingBack(null);
    }
  }

  if (!activeProject) return null;

  return (
    <div className="border-t border-ide-border">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-3 py-2 hover:bg-ide-bg/50 text-left"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <GitBranch className="w-3.5 h-3.5 text-ide-accent" />
        <span className="text-xs font-medium">Checkpoints</span>
        <span className="text-[10px] text-ide-text-dim ml-auto">{checkpoints.length}</span>
      </button>

      {expanded && (
        <div className="px-2 pb-2">
          {/* Create checkpoint */}
          <div className="flex gap-1 mb-2">
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Checkpoint description..."
              className="flex-1 text-[11px] bg-ide-bg border border-ide-border rounded px-2 py-1 focus:border-ide-accent focus:outline-none"
              onKeyDown={e => e.key === 'Enter' && createCheckpoint()}
            />
            <button
              onClick={createCheckpoint}
              disabled={creating || !description.trim()}
              className="p-1 bg-ide-accent/20 text-ide-accent rounded hover:bg-ide-accent/30 disabled:opacity-40"
            >
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Checkpoint list */}
          {loading ? (
            <div className="flex justify-center py-2">
              <Loader2 className="w-4 h-4 animate-spin text-ide-text-dim" />
            </div>
          ) : checkpoints.length === 0 ? (
            <div className="text-[10px] text-ide-text-dim text-center py-2">
              No checkpoints yet
            </div>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {checkpoints.map((cp, i) => (
                <div
                  key={cp.id}
                  className="flex items-start gap-1.5 px-2 py-1.5 bg-ide-bg/50 rounded text-[11px] group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{cp.description}</div>
                    <div className="text-[10px] text-ide-text-dim flex items-center gap-1.5 mt-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      {new Date(cp.createdAt).toLocaleString()}
                      {cp.iterationNumber > 0 && <span>· iter {cp.iterationNumber}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => rollback(cp.id)}
                    disabled={rollingBack === cp.id || i === 0}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-ide-border rounded text-ide-text-dim hover:text-yellow-400 disabled:opacity-20"
                    title="Rollback to this checkpoint"
                  >
                    {rollingBack === cp.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3 h-3" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
