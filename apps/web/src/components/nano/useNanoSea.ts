// ─── useNanoSea — custom hook for all NanoSea state, data-fetching & actions ───
import { useEffect, useState, useRef, useCallback } from 'react';
import { fetchJson } from '../ui/widgets';
import { API_BASE } from '../../config.js';
import type {
  NanoStatus, NanoConfig, EnvCheck, MeshInfo,
  PoolStats, DiscoveredPeer, DiscoveryStatus,
} from '../nano/types';

const API = `${API_BASE}/api/nano`;

const DEFAULT_CONFIG: NanoConfig = {
  meshEnabled: true,
  port: 5100,
  scanPaths: ['.'],
  donationPercent: 25,
  permanentNode: false,
  idleTraining: true,
  username: '',
  peerDiscovery: false,
  sharingLevel: 'metadata',
};

export function useNanoSea() {
  const [status, setStatus] = useState<NanoStatus | null>(null);
  const [envCheck, setEnvCheck] = useState<EnvCheck | null>(null);
  const [meshInfo, setMeshInfo] = useState<MeshInfo | null>(null);
  const [poolStats, setPoolStats] = useState<PoolStats | null>(null);
  const [discoveryStatus, setDiscoveryStatus] = useState<DiscoveryStatus | null>(null);
  const [peers, setPeers] = useState<DiscoveredPeer[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [trainingStatus, setTrainingStatus] = useState<any>(null);
  const [computeStatus, setComputeStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [serverReachable, setServerReachable] = useState(true);

  const [cfg, setCfg] = useState<NanoConfig>(DEFAULT_CONFIG);

  const logsRef = useRef<HTMLDivElement>(null);
  const rapidPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const configDirtyRef = useRef(false);
  const cfgRef = useRef(cfg);

  useEffect(() => { cfgRef.current = cfg; }, [cfg]);

  // ── Data Fetching ─────────────────────────────────────────
  const refresh = useCallback(async () => {
    const s = await fetchJson<NanoStatus>(`${API}/status`);
    if (!s) {
      setServerReachable(false);
      setLoading(false);
      return;
    }
    setServerReachable(true);
    setStatus(s);
    if (s.config && !configDirtyRef.current) setCfg(prev => ({ ...prev, ...s.config }));

    const [m, p, d, pr, l, tr, comp] = await Promise.all([
      fetchJson<MeshInfo>(`${API}/mesh/info`),
      fetchJson<PoolStats>(`${API}/pool/stats`),
      fetchJson<DiscoveryStatus>(`${API}/discovery/status`),
      fetchJson<{ peers: DiscoveredPeer[] }>(`${API}/discovery/peers`),
      fetchJson<{ lines: string[]; total: number }>(`${API}/logs?tail=200`),
      fetchJson(`${API}/training/status`),
      fetchJson(`${API}/compute/status`),
    ]);
    if (m) setMeshInfo(m);
    if (p) setPoolStats(p);
    if (d) setDiscoveryStatus(d);
    if (pr?.peers) setPeers(pr.peers);
    if (l?.lines) setLogs(l.lines);
    if (tr) setTrainingStatus(tr);
    if (comp) setComputeStatus(comp);
    setLoading(false);
  }, []);

  // Initial env check
  useEffect(() => {
    fetchJson<EnvCheck>(`${API}/check`).then(c => { if (c) setEnvCheck(c); });
  }, []);

  // Regular polling
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Auto-scroll logs
  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  // ── Rapid poll after actions ──────────────────────────────
  function startRapidPoll() {
    if (rapidPollRef.current) clearInterval(rapidPollRef.current);
    let count = 0;
    rapidPollRef.current = setInterval(async () => {
      count++;
      await refresh();
      if (count >= 30) {
        if (rapidPollRef.current) clearInterval(rapidPollRef.current);
        rapidPollRef.current = null;
      }
    }, 500);
  }

  useEffect(() => () => {
    if (rapidPollRef.current) clearInterval(rapidPollRef.current);
  }, []);

  // ── Actions ───────────────────────────────────────────────
  async function startNano() {
    setActionLoading('start');
    setActionError(null);
    const result = await fetchJson<{ success: boolean; error?: string; pid?: number }>(
      `${API}/start`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) },
    );
    if (result && !result.success) setActionError(result.error || 'Unknown error starting Nano Sea');
    startRapidPoll();
    await refresh();
    setActionLoading('');
  }

  async function stopNano() {
    setActionLoading('stop');
    setActionError(null);
    await fetchJson(`${API}/stop`, { method: 'POST' });
    startRapidPoll();
    await refresh();
    setActionLoading('');
  }

  async function restartNano() {
    setActionLoading('restart');
    setActionError(null);
    const result = await fetchJson<{ success: boolean; error?: string }>(
      `${API}/restart`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) },
    );
    if (result && !result.success) setActionError(result.error || 'Unknown error restarting');
    startRapidPoll();
    await refresh();
    setActionLoading('');
  }

  async function saveConfig(overrideCfg?: Partial<NanoConfig>) {
    const toSave = overrideCfg ? { ...cfgRef.current, ...overrideCfg } : cfgRef.current;
    if (overrideCfg) setCfg(prev => ({ ...prev, ...overrideCfg }));
    configDirtyRef.current = true;
    await fetchJson(`${API}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toSave),
    });
    setTimeout(() => { configDirtyRef.current = false; }, 20000);
  }

  async function connectPeer(nodeId: string) {
    await fetchJson(`${API}/discovery/connect`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node_id: nodeId }),
    });
    await refresh();
  }

  async function acceptPeer(nodeId: string) {
    await fetchJson(`${API}/discovery/accept`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node_id: nodeId }),
    });
    await refresh();
  }

  async function disconnectPeer(nodeId: string) {
    await fetchJson(`${API}/discovery/disconnect`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node_id: nodeId }),
    });
    await refresh();
  }

  async function recheckEnv() {
    setEnvCheck(null);
    const c = await fetchJson<EnvCheck>(`${API}/check`);
    if (c) setEnvCheck(c);
  }

  async function forwardPoolConfig(field: string, value: any) {
    if (!status?.running) return;
    const endpoints: Record<string, { path: string; method: string; payload: (v: any) => any }> = {
      donationPercent: {
        path: '/pool/donation',
        method: 'PUT',
        payload: v => ({ percent: v }),
      },
      idleTraining: {
        path: '/pool/idle-training',
        method: 'PUT',
        payload: v => ({ enabled: v }),
      },
      permanentNode: {
        path: '/pool/permanent-node',
        method: 'POST',
        payload: v => ({ enabled: v }),
      },
      peerDiscovery: {
        path: '/discovery/opt-in',
        method: 'POST',
        payload: v => ({ enabled: v, sharing_level: cfgRef.current.sharingLevel || 'metadata' }),
      },
      sharingLevel: {
        path: '/discovery/opt-in',
        method: 'POST',
        payload: v => ({ enabled: cfgRef.current.peerDiscovery, sharing_level: v }),
      },
    };
    const ep = endpoints[field];
    if (!ep) return;
    fetchJson(`${API}${ep.path}`, {
      method: ep.method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ep.payload(value)),
    }).catch(() => {});
  }

  // ── Derived state ─────────────────────────────────────────
  const isRunning = status?.running ?? false;
  const nanoCount = status?.api?.nano_count ?? 0;
  const uptimeMin = status?.api?.uptime_s ? Math.floor(status.api.uptime_s / 60) : 0;
  const apiReady = status?.api?.status === 'ok' || nanoCount > 0;
  const isStarting = isRunning && !apiReady;

  let statusLabel = 'Offline';
  let statusColor = 'red';
  if (!serverReachable) { statusLabel = 'Server Unreachable'; statusColor = 'red'; }
  else if (isStarting) { statusLabel = 'Starting…'; statusColor = 'yellow'; }
  else if (isRunning && apiReady) { statusLabel = 'Online'; statusColor = 'green'; }

  return {
    // State
    status, envCheck, meshInfo, poolStats, discoveryStatus,
    peers, logs, trainingStatus, computeStatus,
    loading, actionLoading, actionError, serverReachable,
    cfg, setCfg, configDirtyRef,
    logsRef,
    // Derived
    isRunning, nanoCount, uptimeMin, apiReady, isStarting,
    statusLabel, statusColor,
    // Actions
    refresh, startNano, stopNano, restartNano,
    saveConfig, connectPeer, acceptPeer, disconnectPeer,
    recheckEnv, forwardPoolConfig, setActionError,
  };
}
