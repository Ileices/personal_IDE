// ─── NanoPeers — Peer discovery, connection, sharing level ───
import React from 'react';
import { Users, Link, Unlink, Check } from 'lucide-react';
import { Badge, Section, Toggle } from '../ui/widgets';
import type { NanoConfig, DiscoveryStatus, DiscoveredPeer } from './types';

interface Props {
  cfg: NanoConfig;
  setCfg: React.Dispatch<React.SetStateAction<NanoConfig>>;
  configDirtyRef: React.MutableRefObject<boolean>;
  discoveryStatus: DiscoveryStatus | null;
  peers: DiscoveredPeer[];
  saveConfig: (overrideCfg?: Partial<NanoConfig>) => void;
  forwardPoolConfig: (field: string, value: any) => void;
  connectPeer: (nodeId: string) => void;
  acceptPeer: (nodeId: string) => void;
  disconnectPeer: (nodeId: string) => void;
}

export function NanoPeers({
  cfg, setCfg, configDirtyRef, discoveryStatus, peers,
  saveConfig, forwardPoolConfig, connectPeer, acceptPeer, disconnectPeer,
}: Props) {
  return (
    <Section title="Peer Discovery" icon={Users}>
      <p className="text-[10px] text-ide-text-dim mb-2">
        Discover other IDE instances on your network. Peer connections are personal — different from the global pool.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Toggle checked={cfg.peerDiscovery}
          onChange={v => { saveConfig({ peerDiscovery: v }); forwardPoolConfig('peerDiscovery', v); }}
          label="Enable Discovery" desc="Make yourself visible to other IDE instances" />
        <div>
          <label className="text-xs font-medium block mb-1">Sharing Level</label>
          <select value={cfg.sharingLevel}
            onChange={e => { saveConfig({ sharingLevel: e.target.value }); forwardPoolConfig('sharingLevel', e.target.value); }}
            className="w-full text-xs bg-ide-bg border border-ide-border rounded px-2 py-1.5 focus:border-ide-accent focus:outline-none">
            <option value="none">None — Discovery only</option>
            <option value="metadata">Metadata — Name + grade visible</option>
            <option value="compute">Compute — Share resources</option>
            <option value="code">Code — Share code + compute</option>
            <option value="full">Full — Everything</option>
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium block mb-1">Your Username</label>
        <input type="text" value={cfg.username}
          onFocus={() => { configDirtyRef.current = true; }}
          onChange={e => { configDirtyRef.current = true; setCfg(c => ({ ...c, username: e.target.value })); }}
          onBlur={() => saveConfig()}
          placeholder="Visible to other peers"
          className="w-full text-xs bg-ide-bg border border-ide-border rounded px-2 py-1.5 focus:border-ide-accent focus:outline-none" />
      </div>

      {discoveryStatus && !discoveryStatus.error && (
        <div className="flex items-center gap-3 text-[10px] text-ide-text-dim bg-ide-bg/50 rounded p-2">
          <span>{discoveryStatus.discoverable ? '🟢 Discoverable' : '🔴 Hidden'}</span>
          <span>·</span>
          <span>{discoveryStatus.total_peers ?? 0} peers found</span>
          <span>·</span>
          <span>{discoveryStatus.connected_peers ?? 0} connected</span>
          {(discoveryStatus.pending_requests ?? 0) > 0 && (
            <><span>·</span><span className="text-yellow-400">{discoveryStatus.pending_requests} pending</span></>
          )}
        </div>
      )}

      {/* Peer List */}
      {peers.length > 0 && (
        <div className="space-y-1 mt-1">
          <div className="text-[10px] font-semibold text-ide-text-dim uppercase">Discovered Peers</div>
          {peers.map(p => (
            <div key={p.node_id} className="flex items-center gap-2 bg-ide-bg rounded p-2 text-xs">
              <div className="flex-1 min-w-0">
                <div className="font-medium flex items-center gap-1.5">
                  {p.display_name}
                  <Badge color={
                    p.trust_level === 'trusted' ? 'green' :
                    p.trust_level === 'reliable' ? 'blue' :
                    p.trust_level === 'neutral' ? 'gray' : 'red'
                  }>{p.trust_level}</Badge>
                  {p.has_cuda && <Badge color="purple">GPU</Badge>}
                </div>
                <div className="text-[10px] text-ide-text-dim flex items-center gap-2">
                  <span>Tier {p.tier}</span><span>·</span>
                  <span>Grade {p.compute_grade.toFixed(1)}</span><span>·</span>
                  <span>RESPECT {p.respect_score.toFixed(0)}</span>
                  {p.gpu_name && <><span>·</span><span>{p.gpu_name}</span></>}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {p.state === 'connected' ? (
                  <button onClick={() => disconnectPeer(p.node_id)}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-red-500/10 text-red-400 hover:bg-red-500/20">
                    <Unlink className="w-3 h-3" /> Disconnect
                  </button>
                ) : p.state === 'pending_in' ? (
                  <button onClick={() => acceptPeer(p.node_id)}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-green-500/10 text-green-400 hover:bg-green-500/20">
                    <Check className="w-3 h-3" /> Accept
                  </button>
                ) : p.state === 'blocked' ? (
                  <Badge color="red">Blocked</Badge>
                ) : (
                  <button onClick={() => connectPeer(p.node_id)}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-ide-accent/10 text-ide-accent hover:bg-ide-accent/20">
                    <Link className="w-3 h-3" /> Connect
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {peers.length === 0 && cfg.peerDiscovery && (
        <div className="text-[10px] text-ide-text-dim text-center py-3 bg-ide-bg/30 rounded">
          Scanning for other IDE instances on your network…
        </div>
      )}
    </Section>
  );
}
