// ─── NanoProcessControl — Start/Stop/Restart + mesh + port config ───
import React from 'react';
import {
  Play, Square, RotateCw, Loader2, Zap, Terminal,
} from 'lucide-react';
import { Badge, Section, Toggle } from '../ui/widgets';
import type { NanoConfig, EnvCheck } from './types';

interface Props {
  cfg: NanoConfig;
  setCfg: React.Dispatch<React.SetStateAction<NanoConfig>>;
  configDirtyRef: React.MutableRefObject<boolean>;
  envCheck: EnvCheck | null;
  isRunning: boolean;
  isStarting: boolean;
  actionLoading: string;
  startNano: () => void;
  stopNano: () => void;
  restartNano: () => void;
  saveConfig: (overrideCfg?: Partial<NanoConfig>) => void;
}

export function NanoProcessControl({
  cfg, setCfg, configDirtyRef, envCheck,
  isRunning, isStarting, actionLoading,
  startNano, stopNano, restartNano, saveConfig,
}: Props) {
  return (
    <Section title="Process Control" icon={Zap} badge={
      envCheck?.ready ? <Badge color="green">Ready</Badge> :
      envCheck ? <Badge color="yellow">Setup needed</Badge> : null
    }>
      <div className="flex items-center gap-2">
        <button onClick={startNano} disabled={isRunning || !!actionLoading || !envCheck?.ready}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-green-600/20 text-green-400 hover:bg-green-600/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title={!envCheck?.ready ? 'Fix environment issues first' : isRunning ? 'Already running' : 'Start Nano Sea'}>
          {actionLoading === 'start' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          {actionLoading === 'start' ? 'Starting…' : 'Start'}
        </button>
        <button onClick={stopNano} disabled={!isRunning || !!actionLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          {actionLoading === 'stop' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
          {actionLoading === 'stop' ? 'Stopping…' : 'Stop'}
        </button>
        <button onClick={restartNano} disabled={!!actionLoading || !envCheck?.ready}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          {actionLoading === 'restart' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
          {actionLoading === 'restart' ? 'Restarting…' : 'Restart'}
        </button>
      </div>

      {isStarting && (
        <div className="flex items-center gap-2 bg-yellow-500/10 rounded p-2 mt-1">
          <Loader2 className="w-3 h-3 animate-spin text-yellow-400" />
          <span className="text-xs text-yellow-300">Python backend is starting up… Waiting for API to respond.</span>
        </div>
      )}

      {envCheck?.python && (
        <div className="text-[10px] text-ide-text-dim mt-1 flex items-center gap-1.5">
          <Terminal className="w-3 h-3" />
          Python: <code className="text-ide-accent">{envCheck.python.bin}</code>
          {envCheck.platform && <span>({envCheck.platform})</span>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mt-2">
        <Toggle checked={cfg.meshEnabled} onChange={v => saveConfig({ meshEnabled: v })}
          label="Mesh Networking" desc="Enable P2P mesh for distributed compute" disabled={isRunning} />
        <div>
          <label className="text-xs font-medium block mb-1">API Port</label>
          <input type="number" value={cfg.port}
            onFocus={() => { configDirtyRef.current = true; }}
            onChange={e => { configDirtyRef.current = true; setCfg(c => ({ ...c, port: Number(e.target.value) })); }}
            onBlur={() => saveConfig()} disabled={isRunning}
            className="w-full text-xs bg-ide-bg border border-ide-border rounded px-2 py-1.5 focus:border-ide-accent focus:outline-none disabled:opacity-40" />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium block mb-1">Scan Paths</label>
        <input type="text" value={cfg.scanPaths.join(', ')}
          onFocus={() => { configDirtyRef.current = true; }}
          onChange={e => {
            configDirtyRef.current = true;
            const parts = e.target.value.split(',').map(s => s.trim());
            setCfg(c => ({ ...c, scanPaths: parts.length > 0 ? parts : ['.'] }));
          }}
          onBlur={() => {
            setCfg(c => ({ ...c, scanPaths: c.scanPaths.filter(Boolean).length ? c.scanPaths.filter(Boolean) : ['.'] }));
            saveConfig();
          }}
          placeholder="Paths to scan for AE seed, comma-separated" disabled={isRunning}
          className="w-full text-xs bg-ide-bg border border-ide-border rounded px-2 py-1.5 focus:border-ide-accent focus:outline-none disabled:opacity-40" />
        <p className="text-[10px] text-ide-text-dim mt-0.5">
          Comma-separated paths. The AE scanner reads your filesystem to create a unique seed.
        </p>
      </div>
    </Section>
  );
}
