// ─── NanoTraining — training status, sessions, registered nanos, compute ───
import React from 'react';
import { Activity } from 'lucide-react';
import { Badge, Section } from '../ui/widgets';

interface Props {
  trainingStatus: any;
  computeStatus: any;
}

export function NanoTraining({ trainingStatus, computeStatus }: Props) {
  const fmtNum = (n: any, digits = 4) => (typeof n === 'number' ? n.toFixed(digits) : '—');

  return (
    <Section title="Training & Models" icon={Activity} badge={
      trainingStatus?.running
        ? <Badge color="green">Training</Badge>
        : <Badge color="gray">Idle</Badge>
    }>
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

        {/* Recent training sessions */}
        {trainingStatus?.recent_sessions?.length > 0 && (
          <div className="mt-2">
            <div className="text-[10px] text-ide-text-dim mb-1">Recent Sessions</div>
            <div className="space-y-1 max-h-24 overflow-y-auto">
              {trainingStatus.recent_sessions.map((s: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-[10px] bg-ide-bg/50 px-2 py-1 rounded">
                  <span className="text-ide-text-dim">{s.id}</span>
                  <span>{s.steps} steps</span>
                  <span className="text-ide-accent">{s.avg_loss != null ? `loss: ${s.avg_loss.toFixed(4)}` : '—'}</span>
                  <span className="text-ide-text-dim">{s.nanos_trained?.length ?? 0} nanos</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Registered nanos */}
        {trainingStatus?.registered_nanos?.length > 0 && (
          <div className="mt-2">
            <div className="text-[10px] text-ide-text-dim mb-1">Nanos Being Trained</div>
            <div className="flex flex-wrap gap-1">
              {trainingStatus.registered_nanos.map((n: string) => (
                <Badge key={n} color="cyan">{n}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* GPU/Compute info */}
        {computeStatus && !computeStatus.error && (
          <div className="mt-2">
            <div className="text-[10px] text-ide-text-dim mb-1">Compute Backend</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-ide-text-dim">Backend</span>
                <Badge color={computeStatus.backend === 'cuda' ? 'green' : computeStatus.backend === 'cpu' ? 'yellow' : 'blue'}>
                  {computeStatus.backend}
                </Badge>
              </div>
              {computeStatus.vram_gb > 0 && (
                <div className="flex justify-between">
                  <span className="text-ide-text-dim">VRAM</span>
                  <span className="font-mono">{computeStatus.vram_gb} GB</span>
                </div>
              )}
            </div>
            {computeStatus.all_gpus?.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {computeStatus.all_gpus.map((g: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-[10px] bg-ide-bg/30 px-2 py-0.5 rounded">
                    <span>{g.name}</span>
                    <Badge color={g.backend === 'cuda' ? 'green' : 'blue'}>{g.backend}</Badge>
                    <span className="text-ide-text-dim">{g.vram_gb}GB</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Checkpoint directory */}
        {trainingStatus?.checkpoint_dir && (
          <div className="mt-1 text-[10px] text-ide-text-dim">
            📁 {trainingStatus.checkpoint_dir}
            {trainingStatus.checkpoints?.total_size_bytes > 0 && (
              <span className="ml-2">({(trainingStatus.checkpoints.total_size_bytes / 1024).toFixed(1)} KB)</span>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}
