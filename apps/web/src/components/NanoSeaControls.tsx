// ============================================
// Nano Sea Controls — Thin Shell
//
// All state + actions extracted to nano/useNanoSea.ts
// UI sections extracted to nano/*.tsx sub-components
// ============================================
import React from 'react';
import {
  X, Loader2, AlertTriangle, RefreshCw, Waves,
} from 'lucide-react';
import { Badge } from './ui/widgets';
import { useNanoSea } from './nano/useNanoSea';
import { NanoProcessControl } from './nano/NanoProcessControl';
import { NanoNodeStatus } from './nano/NanoNodeStatus';
import { NanoTraining } from './nano/NanoTraining';
import { NanoPool } from './nano/NanoPool';
import { NanoPeers } from './nano/NanoPeers';
import { NanoLogs } from './nano/NanoLogs';

export function NanoSeaControls({ onClose }: { onClose: () => void }) {
  const nano = useNanoSea();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[780px] max-h-[85vh] bg-ide-sidebar border border-ide-border rounded-xl shadow-2xl flex flex-col">

        {/* ── Header ───────────────────────────────────── */}
        <div className="flex items-center justify-between p-4 border-b border-ide-border">
          <div className="flex items-center gap-3">
            <Waves className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-semibold">Nano Sea Controls</h2>
            <div className="flex items-center gap-1.5">
              <Badge color={nano.statusColor}>● {nano.statusLabel}</Badge>
              {nano.nanoCount > 0 && <Badge color="blue">{nano.nanoCount} nanos</Badge>}
              {nano.uptimeMin > 0 && <Badge color="gray">{nano.uptimeMin}m</Badge>}
              {nano.status?.pid && <Badge color="cyan">PID {nano.status.pid}</Badge>}
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-ide-bg rounded transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Content ──────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {nano.loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-ide-accent" />
              <span className="ml-2 text-xs text-ide-text-dim">Connecting to server…</span>
            </div>
          ) : !nano.serverReachable ? (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center">
              <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-2" />
              <p className="text-sm text-red-300 font-medium">Cannot reach IDE server</p>
              <p className="text-xs text-ide-text-dim mt-1">
                Make sure the server is running at the configured API endpoint
              </p>
              <button onClick={nano.refresh} className="mt-3 px-3 py-1 text-xs bg-ide-accent/20 text-ide-accent rounded hover:bg-ide-accent/30 transition-colors">
                <RefreshCw className="w-3 h-3 inline mr-1" /> Retry
              </button>
            </div>
          ) : (
            <>
              {/* Environment Check */}
              {nano.envCheck && !nano.envCheck.ready && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-400" />
                    <span className="text-xs font-semibold text-yellow-300">Environment Issues</span>
                    <button onClick={nano.recheckEnv} className="ml-auto text-[10px] text-ide-accent hover:underline flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" /> Recheck
                    </button>
                  </div>
                  <ul className="space-y-1">
                    {nano.envCheck.errors.map((e, i) => (
                      <li key={i} className="text-xs text-yellow-200/80 flex items-start gap-1.5">
                        <span className="text-yellow-400 mt-0.5">•</span>{e}
                      </li>
                    ))}
                  </ul>
                  {nano.envCheck.nanoDir && (
                    <p className="text-[10px] text-ide-text-dim mt-2">
                      Looking for NANO_train at: <code className="text-ide-accent">{nano.envCheck.nanoDir}</code>
                    </p>
                  )}
                </div>
              )}

              {/* Action Error Banner */}
              {(nano.actionError || nano.status?.lastError) && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2.5 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-xs text-red-300">{nano.actionError || nano.status?.lastError}</span>
                  </div>
                  <button onClick={() => nano.setActionError(null)} className="text-red-400 hover:text-red-300 flex-shrink-0">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              <NanoProcessControl
                cfg={nano.cfg} setCfg={nano.setCfg} configDirtyRef={nano.configDirtyRef}
                envCheck={nano.envCheck} isRunning={nano.isRunning} isStarting={nano.isStarting}
                actionLoading={nano.actionLoading}
                startNano={nano.startNano} stopNano={nano.stopNano} restartNano={nano.restartNano}
                saveConfig={nano.saveConfig}
              />
              <NanoNodeStatus meshInfo={nano.meshInfo} />
              <NanoTraining trainingStatus={nano.trainingStatus} computeStatus={nano.computeStatus} />
              <NanoPool
                cfg={nano.cfg} setCfg={nano.setCfg} poolStats={nano.poolStats}
                saveConfig={nano.saveConfig} forwardPoolConfig={nano.forwardPoolConfig}
              />
              <NanoPeers
                cfg={nano.cfg} setCfg={nano.setCfg} configDirtyRef={nano.configDirtyRef}
                discoveryStatus={nano.discoveryStatus} peers={nano.peers}
                saveConfig={nano.saveConfig} forwardPoolConfig={nano.forwardPoolConfig}
                connectPeer={nano.connectPeer} acceptPeer={nano.acceptPeer} disconnectPeer={nano.disconnectPeer}
              />
              <NanoLogs logs={nano.logs} logsRef={nano.logsRef} isRunning={nano.isRunning} />
            </>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-ide-border text-[10px] text-ide-text-dim">
          <div className="flex items-center gap-2">
            <Waves className="w-3 h-3 text-cyan-400" />
            <span>Sea of Nanos v1.0</span>
          </div>
          <div className="flex items-center gap-3">
            <span>Port {nano.cfg.port}</span>
            {nano.isRunning && nano.status?.api?.uptime_s && (
              <span>Uptime: {Math.floor(nano.status.api.uptime_s / 60)}m {Math.floor(nano.status.api.uptime_s % 60)}s</span>
            )}
            {nano.envCheck?.python && <span>{nano.envCheck.python.bin}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
