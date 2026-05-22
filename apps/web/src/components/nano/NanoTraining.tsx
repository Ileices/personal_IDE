import React from 'react';
import { Activity, Pause, Play, Square } from 'lucide-react';
import { Badge, Section } from '../ui/widgets';

interface Props {
  trainingStatus: any;
  computeStatus: any;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
}

export function NanoTraining({ trainingStatus, computeStatus, onPause, onResume, onStop }: Props) {
  const fmtNum = (n: any, digits = 4) => (typeof n === 'number' ? n.toFixed(digits) : '—');

  return (
    <Section
      title="Training & Models"
      icon={Activity}
      badge={
        trainingStatus?.running
          ? <Badge color="green">Training</Badge>
          : <Badge color="gray">Idle</Badge>
      }
    >
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-ide-text-dim">Status</span>
            <span className={trainingStatus?.running ? 'text-green-400' : 'text-ide-text-dim'}>
              {trainingStatus?.running ? '● Training' : '○ Idle'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-ide-text-dim">Device</span>
            <Badge color={trainingStatus?.device === 'cpu' ? 'yellow' : 'green'}>
              {computeStatus?.gpu_name || trainingStatus?.device || 'cpu'}
            </Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-ide-text-dim">Total Steps</span>
            <span className="font-mono text-ide-accent">{trainingStatus?.total_steps ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ide-text-dim">Trained Batches</span>
            <span className="font-mono">{trainingStatus?.trained_batches ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ide-text-dim">Cycle</span>
            <span className="font-mono">{trainingStatus?.cycle_phase || 'idle'} #{trainingStatus?.cycle_count ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ide-text-dim">Buffer Size</span>
            <span className="font-mono">{trainingStatus?.buffer_size ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ide-text-dim">Nanos</span>
            <span className="font-mono">{trainingStatus?.total_nanos ?? trainingStatus?.nano_count ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ide-text-dim">Total Params</span>
            <span className="font-mono">{trainingStatus?.total_params ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ide-text-dim">Last Loss</span>
            <span className="font-mono text-ide-accent">{fmtNum(trainingStatus?.last_loss)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ide-text-dim">CE Loss</span>
            <span className="font-mono">{fmtNum(trainingStatus?.last_ce_loss)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ide-text-dim">Router Entropy</span>
            <span className="font-mono">{fmtNum(trainingStatus?.last_router_entropy, 3)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ide-text-dim">Checkpoints</span>
            <span className="font-mono">{trainingStatus?.total_checkpoints ?? trainingStatus?.checkpoints?.total_checkpoints ?? 0}</span>
          </div>
        </div>

        {/* NEW: Training Controls */}
        <div className="mt-3 flex gap-2">
          {trainingStatus?.running ? (
            <button
              onClick={onPause}
              className="px-2 py-1 rounded border border-ide-border bg-ide-bg/60 hover:bg-ide-bg text-xs flex items-center gap-1"
            >
              <Pause size={12} /> Pause
            </button>
          ) : (
            <button
              onClick={onResume}
              className="px-2 py-1 rounded border border-ide-border bg-ide-bg/60 hover:bg-ide-bg text-xs flex items-center gap-1"
            >
              <Play size={12} /> Resume
            </button>
          )}
          <button
            onClick={onStop}
            className="px-2 py-1 rounded border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 text-xs flex items-center gap-1"
          >
            <Square size={12} /> Stop
          </button>
        </div>

        {(typeof trainingStatus?.gpu_hit_rate === 'number' || typeof trainingStatus?.cpu_hit_rate === 'number') && (
          <div className="mt-2">
            <div className="text-[10px] text-ide-text-dim mb-1">Memory Paging (Phase 4)</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-ide-text-dim">GPU Hit Rate</span>
                <span className="font-mono">{fmtNum((trainingStatus?.gpu_hit_rate ?? 0) * 100, 1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ide-text-dim">CPU Hit Rate</span>
                <span className="font-mono">{fmtNum((trainingStatus?.cpu_hit_rate ?? 0) * 100, 1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ide-text-dim">Disk Hit Rate</span>
                <span className="font-mono">{fmtNum((trainingStatus?.disk_hit_rate ?? 0) * 100, 1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ide-text-dim">GPU/CPU Used</span>
                <span className="font-mono">{fmtNum(trainingStatus?.gpu_used_mb ?? 0, 1)} / {fmtNum(trainingStatus?.cpu_used_mb ?? 0, 1)} MB</span>
              </div>
            </div>
          </div>
        )}

        {/* Recent training sessions (unchanged) */}
        {trainingStatus?.recent_sessions?.length > 0 && (
          <div className="mt-2">
            <div className="text-[10px] text-ide-text-dim mb-1">Recent Sessions</div>
            <div className="space-y-1 max-h-24 overflow-y-auto">
              {trainingStatus.recent_sessions.map((s: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-[10px] bg-ide-bg/50 px-2 py-1 rounded">
                  <span className="text-ide-text-dim">{s.id}</span>
                  <span>{s.steps} steps</span>
                  <span className="text-ide-accent">{s.avg_loss != null ? `loss: ${s.avg_loss.toFixed(4)}` : '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}