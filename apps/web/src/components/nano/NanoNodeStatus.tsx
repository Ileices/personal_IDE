// ─── NanoNodeStatus — CPU, GPU, grade, tier, CUDA, node ID ───
import React from 'react';
import { Cpu } from 'lucide-react';
import { Badge, Section } from '../ui/widgets';
import type { MeshInfo } from './types';

interface Props {
  meshInfo: MeshInfo | null;
}

export function NanoNodeStatus({ meshInfo }: Props) {
  if (!meshInfo || meshInfo.error) return null;

  return (
    <Section title="Node Status" icon={Cpu}>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-ide-text-dim">CPU</span>
          <span>{meshInfo.cpu_model} ({meshInfo.ram_gb} GB RAM)</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ide-text-dim">GPU</span>
          <span>
            {meshInfo.gpu_model || 'None'}
            {meshInfo.gpu_vram_gb ? ` (${meshInfo.gpu_vram_gb} GB)` : ''}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-ide-text-dim">Grade</span>
          <span className="font-mono text-ide-accent">{meshInfo.compute_grade?.toFixed(1)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ide-text-dim">Tier</span>
          <Badge color={meshInfo.tier && meshInfo.tier <= 3 ? 'green' : meshInfo.tier && meshInfo.tier <= 6 ? 'yellow' : 'gray'}>
            Tier {meshInfo.tier}
          </Badge>
        </div>
        <div className="flex justify-between">
          <span className="text-ide-text-dim">CUDA</span>
          <span>{meshInfo.has_cuda ? '✓ Available' : '✗ CPU only'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ide-text-dim">Node ID</span>
          <span className="font-mono text-[10px]">{meshInfo.node_id?.slice(0, 16)}…</span>
        </div>
      </div>
    </Section>
  );
}
