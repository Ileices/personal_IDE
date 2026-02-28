// ─── NanoPool — Global compute pool donation, permanent node, idle training ───
import React from 'react';
import { Globe, Users, Activity, Check } from 'lucide-react';
import { Badge, Section, Toggle, Slider } from '../ui/widgets';
import type { NanoConfig, PoolStats } from './types';

interface Props {
  cfg: NanoConfig;
  setCfg: React.Dispatch<React.SetStateAction<NanoConfig>>;
  poolStats: PoolStats | null;
  saveConfig: (overrideCfg?: Partial<NanoConfig>) => void;
  forwardPoolConfig: (field: string, value: any) => void;
}

export function NanoPool({ cfg, setCfg, poolStats, saveConfig, forwardPoolConfig }: Props) {
  return (
    <Section title="Global Compute Pool" icon={Globe}>
      <p className="text-[10px] text-ide-text-dim mb-2">
        Donate idle compute to the shared pool. Separate from peer-to-peer — anyone in the pool can use donated resources.
      </p>

      <Slider
        value={cfg.donationPercent}
        onChange={v => setCfg(c => ({ ...c, donationPercent: v }))}
        label="Compute Donation"
        suffix="% of idle"
      />
      <button
        onClick={() => { saveConfig(); forwardPoolConfig('donationPercent', cfg.donationPercent); }}
        className="text-[10px] text-ide-accent hover:underline mt-1"
      >
        Apply
      </button>

      <div className="grid grid-cols-2 gap-3 mt-1">
        <Toggle checked={cfg.permanentNode}
          onChange={v => { saveConfig({ permanentNode: v }); forwardPoolConfig('permanentNode', v); }}
          label="Permanent Node" desc="Always part of the pool (anchors the network)" />
        <Toggle checked={cfg.idleTraining}
          onChange={v => { saveConfig({ idleTraining: v }); forwardPoolConfig('idleTraining', v); }}
          label="Idle Training" desc="Auto-train nanos when pool is idle" />
      </div>

      {poolStats && !poolStats.error && (
        <div className="grid grid-cols-3 gap-2 mt-2">
          {[
            { label: 'Online', value: poolStats.online_members ?? 0, icon: Users },
            { label: 'Capacity', value: poolStats.total_pool_capacity?.toFixed(0) ?? '0', icon: Activity },
            { label: 'Jobs Done', value: poolStats.total_jobs_completed ?? 0, icon: Check },
          ].map(s => (
            <div key={s.label} className="bg-ide-bg rounded p-2 text-center">
              <s.icon className="w-3 h-3 text-ide-accent mx-auto mb-0.5" />
              <div className="text-sm font-semibold">{s.value}</div>
              <div className="text-[9px] text-ide-text-dim">{s.label}</div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
