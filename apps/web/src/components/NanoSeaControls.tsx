// ============================================
// Nano Sea Controls — Real Settings Popup
//
// One-stop panel for everything Nano Sea:
//   - Environment check (Python found? NANO_train exists?)
//   - Start / Stop / Restart the Python backend
//   - Mesh toggle, port config
//   - Global pool: donation %, permanent node, idle training
//   - Peer discovery: opt-in, sharing level, peer list
//   - Live logs viewer with real-time updates
//   - Node status (grade, tier, nanos, uptime)
// ============================================
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  X, Play, Square, RotateCw, Wifi, WifiOff, Globe, Users,
  Cpu, HardDrive, Zap, Shield, UserPlus, UserMinus, Eye,
  ChevronDown, ChevronUp, Loader2, Activity, Server,
  Settings, Waves, Link, Unlink, Ban, Check, AlertTriangle,
  Terminal, RefreshCw,
} from 'lucide-react';

const API = 'http://localhost:3001/api/nano';

interface NanoStatus {
  running: boolean;
  pid: number | null;
  port: number;
  config: NanoConfig;
  api: { status: string; nano_count?: number; uptime_s?: number } | null;
  logLines: number;
  lastError: string | null;
  pythonFound: boolean;
  nanoDirExists: boolean;
}

interface NanoConfig {
  meshEnabled: boolean;
  port: number;
  scanPaths: string[];
  donationPercent: number;
  permanentNode: boolean;
  idleTraining: boolean;
  username: string;
  peerDiscovery: boolean;
  sharingLevel: string;
}

interface EnvCheck {
  ready: boolean;
  python: { bin: string; extraArgs: string[] } | null;
  pythonFound: boolean;
  nanoDir: string;
  nanoDirExists: boolean;
  mainPyExists: boolean;
  requirementsExist: boolean;
  platform: string;
  errors: string[];
}

interface MeshInfo {
  node_id?: string;
  hostname?: string;
  compute_grade?: number;
  tier?: number;
  cpu_model?: string;
  ram_gb?: number;
  gpu_model?: string;
  gpu_vram_gb?: number;
  has_cuda?: boolean;
  error?: string;
}

interface PoolStats {
  total_members?: number;
  online_members?: number;
  permanent_nodes?: number;
  total_pool_capacity?: number;
  active_jobs?: number;
  total_jobs_completed?: number;
  idle_training_enabled?: boolean;
  error?: string;
}

interface DiscoveredPeer {
  node_id: string;
  username: string;
  hostname: string;
  ip_address: string;
  state: string;
  compute_grade: number;
  tier: number;
  has_cuda: boolean;
  gpu_name: string;
  respect_score: number;
  trust_level: string;
  display_name: string;
}

interface DiscoveryStatus {
  discoverable?: boolean;
  opt_in?: boolean;
  sharing_level?: string;
  total_peers?: number;
  connected_peers?: number;
  pending_requests?: number;
  error?: string;
}

// ── Helpers ─────────────────────────────────────────────────
async function fetchJson<T = any>(url: string, opts?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, opts);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function Badge({ children, color = 'blue' }: { children: React.ReactNode; color?: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-500/15 text-blue-400',
    green: 'bg-green-500/15 text-green-400',
    red: 'bg-red-500/15 text-red-400',
    yellow: 'bg-yellow-500/15 text-yellow-400',
    purple: 'bg-purple-500/15 text-purple-400',
    gray: 'bg-white/5 text-ide-text-dim',
    cyan: 'bg-cyan-500/15 text-cyan-400',
  };
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${colors[color] || colors.blue}`}>
      {children}
    </span>
  );
}

function Section({ title, icon: Icon, children, defaultOpen = true, badge }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-ide-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-ide-bg/50 hover:bg-ide-bg/80 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-ide-accent" />
          <span className="text-xs font-semibold">{title}</span>
          {badge}
        </div>
        {open ? <ChevronUp className="w-3 h-3 text-ide-text-dim" /> : <ChevronDown className="w-3 h-3 text-ide-text-dim" />}
      </button>
      {open && <div className="p-3 space-y-2">{children}</div>}
    </div>
  );
}

function Toggle({ checked, onChange, label, desc, disabled }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  desc?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-2.5 ${disabled ? 'opacity-40' : 'cursor-pointer'}`}>
      <div
        onClick={() => !disabled && onChange(!checked)}
        className={`w-8 h-4.5 flex-shrink-0 rounded-full transition-colors relative mt-0.5 ${
          checked ? 'bg-ide-accent' : 'bg-ide-border'
        }`}
        style={{ minWidth: 32, height: 18 }}
      >
        <div
          className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[15px]' : 'translate-x-[2px]'
          }`}
          style={{ width: 14, height: 14 }}
        />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium">{label}</div>
        {desc && <div className="text-[10px] text-ide-text-dim">{desc}</div>}
      </div>
    </label>
  );
}

function Slider({ value, onChange, min = 0, max = 100, label, suffix = '%' }: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label: string;
  suffix?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-xs text-ide-accent font-mono">{value}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-ide-border rounded-full appearance-none cursor-pointer accent-ide-accent"
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════
export function NanoSeaControls({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<NanoStatus | null>(null);
  const [envCheck, setEnvCheck] = useState<EnvCheck | null>(null);
  const [meshInfo, setMeshInfo] = useState<MeshInfo | null>(null);
  const [poolStats, setPoolStats] = useState<PoolStats | null>(null);
  const [discoveryStatus, setDiscoveryStatus] = useState<DiscoveryStatus | null>(null);
  const [peers, setPeers] = useState<DiscoveredPeer[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [serverReachable, setServerReachable] = useState(true);

  // Config form state
  const [cfg, setCfg] = useState<NanoConfig>({
    meshEnabled: true,
    port: 5100,
    scanPaths: ['.'],
    donationPercent: 25,
    permanentNode: false,
    idleTraining: true,
    username: '',
    peerDiscovery: false,
    sharingLevel: 'metadata',
  });

  const logsRef = useRef<HTMLDivElement>(null);
  const rapidPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    if (s.config) setCfg(prev => ({ ...prev, ...s.config }));

    // Fetch secondary data in parallel
    const [m, p, d, pr, l] = await Promise.all([
      fetchJson<MeshInfo>(`${API}/mesh/info`),
      fetchJson<PoolStats>(`${API}/pool/stats`),
      fetchJson<DiscoveryStatus>(`${API}/discovery/status`),
      fetchJson<{ peers: DiscoveredPeer[] }>(`${API}/discovery/peers`),
      fetchJson<{ lines: string[]; total: number }>(`${API}/logs?tail=200`),
    ]);
    if (m) setMeshInfo(m);
    if (p) setPoolStats(p);
    if (d) setDiscoveryStatus(d);
    if (pr?.peers) setPeers(pr.peers);
    if (l?.lines) setLogs(l.lines);
    setLoading(false);
  }, []);

  // Initial env check
  useEffect(() => {
    fetchJson<EnvCheck>(`${API}/check`).then(c => {
      if (c) setEnvCheck(c);
    });
  }, []);

  // Regular polling
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Auto-scroll logs
  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  // ── Rapid poll after actions ──────────────────────────────
  // Poll every 500ms for 15 seconds after start/stop/restart
  function startRapidPoll() {
    if (rapidPollRef.current) clearInterval(rapidPollRef.current);
    let count = 0;
    rapidPollRef.current = setInterval(async () => {
      count++;
      await refresh();
      if (count >= 30) { // 30 × 500ms = 15 seconds
        if (rapidPollRef.current) clearInterval(rapidPollRef.current);
        rapidPollRef.current = null;
      }
    }, 500);
  }

  useEffect(() => {
    return () => {
      if (rapidPollRef.current) clearInterval(rapidPollRef.current);
    };
  }, []);

  // ── Actions ───────────────────────────────────────────────
  async function startNano() {
    setActionLoading('start');
    setActionError(null);
    const result = await fetchJson<{ success: boolean; error?: string; pid?: number }>(
      `${API}/start`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      }
    );
    if (result && !result.success) {
      setActionError(result.error || 'Unknown error starting Nano Sea');
    }
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
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      }
    );
    if (result && !result.success) {
      setActionError(result.error || 'Unknown error restarting');
    }
    startRapidPoll();
    await refresh();
    setActionLoading('');
  }

  async function saveConfig() {
    await fetchJson(`${API}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
  }

  async function connectPeer(nodeId: string) {
    await fetchJson(`${API}/discovery/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node_id: nodeId }),
    });
    await refresh();
  }

  async function disconnectPeer(nodeId: string) {
    await fetchJson(`${API}/discovery/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node_id: nodeId }),
    });
    await refresh();
  }

  async function recheckEnv() {
    setEnvCheck(null);
    const c = await fetchJson<EnvCheck>(`${API}/check`);
    if (c) setEnvCheck(c);
  }

  const isRunning = status?.running ?? false;
  const nanoCount = status?.api?.nano_count ?? 0;
  const uptimeMin = status?.api?.uptime_s ? Math.floor(status.api.uptime_s / 60) : 0;
  const apiReady = status?.api?.status === 'ok' || (status?.api?.nano_count ?? 0) > 0;
  const isStarting = isRunning && !apiReady;

  // Compute status label
  let statusLabel = 'Offline';
  let statusColor = 'red';
  if (!serverReachable) { statusLabel = 'Server Unreachable'; statusColor = 'red'; }
  else if (isStarting) { statusLabel = 'Starting…'; statusColor = 'yellow'; }
  else if (isRunning && apiReady) { statusLabel = 'Online'; statusColor = 'green'; }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[780px] max-h-[85vh] bg-ide-sidebar border border-ide-border rounded-xl shadow-2xl flex flex-col">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between p-4 border-b border-ide-border">
          <div className="flex items-center gap-3">
            <Waves className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-semibold">Nano Sea Controls</h2>
            <div className="flex items-center gap-1.5">
              <Badge color={statusColor}>● {statusLabel}</Badge>
              {nanoCount > 0 && <Badge color="blue">{nanoCount} nanos</Badge>}
              {uptimeMin > 0 && <Badge color="gray">{uptimeMin}m</Badge>}
              {status?.pid && <Badge color="cyan">PID {status.pid}</Badge>}
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-ide-bg rounded transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Content ────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-ide-accent" />
              <span className="ml-2 text-xs text-ide-text-dim">Connecting to server…</span>
            </div>
          ) : !serverReachable ? (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center">
              <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-2" />
              <p className="text-sm text-red-300 font-medium">Cannot reach IDE server</p>
              <p className="text-xs text-ide-text-dim mt-1">
                Make sure the server is running at <code className="text-ide-accent">localhost:3001</code>
              </p>
              <button onClick={refresh} className="mt-3 px-3 py-1 text-xs bg-ide-accent/20 text-ide-accent rounded hover:bg-ide-accent/30 transition-colors">
                <RefreshCw className="w-3 h-3 inline mr-1" /> Retry
              </button>
            </div>
          ) : (
            <>
              {/* ── Environment Check ─────────────────────────── */}
              {envCheck && !envCheck.ready && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-400" />
                    <span className="text-xs font-semibold text-yellow-300">Environment Issues</span>
                    <button onClick={recheckEnv} className="ml-auto text-[10px] text-ide-accent hover:underline flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" /> Recheck
                    </button>
                  </div>
                  <ul className="space-y-1">
                    {envCheck.errors.map((e, i) => (
                      <li key={i} className="text-xs text-yellow-200/80 flex items-start gap-1.5">
                        <span className="text-yellow-400 mt-0.5">•</span>
                        {e}
                      </li>
                    ))}
                  </ul>
                  {envCheck.nanoDir && (
                    <p className="text-[10px] text-ide-text-dim mt-2">
                      Looking for NANO_train at: <code className="text-ide-accent">{envCheck.nanoDir}</code>
                    </p>
                  )}
                </div>
              )}

              {/* ── Action Error Banner ──────────────────────── */}
              {(actionError || status?.lastError) && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2.5 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-xs text-red-300">{actionError || status?.lastError}</span>
                  </div>
                  <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-300 flex-shrink-0">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* ── Start / Stop Controls ─────────────────────── */}
              <Section title="Process Control" icon={Zap} badge={
                envCheck?.ready ? <Badge color="green">Ready</Badge> :
                envCheck ? <Badge color="yellow">Setup needed</Badge> : null
              }>
                <div className="flex items-center gap-2">
                  <button
                    onClick={startNano}
                    disabled={isRunning || !!actionLoading || !envCheck?.ready}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-green-600/20 text-green-400 hover:bg-green-600/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title={!envCheck?.ready ? 'Fix environment issues first' : isRunning ? 'Already running' : 'Start Nano Sea'}
                  >
                    {actionLoading === 'start' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                    {actionLoading === 'start' ? 'Starting…' : 'Start'}
                  </button>
                  <button
                    onClick={stopNano}
                    disabled={!isRunning || !!actionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    {actionLoading === 'stop' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
                    {actionLoading === 'stop' ? 'Stopping…' : 'Stop'}
                  </button>
                  <button
                    onClick={restartNano}
                    disabled={!!actionLoading || !envCheck?.ready}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    {actionLoading === 'restart' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
                    {actionLoading === 'restart' ? 'Restarting…' : 'Restart'}
                  </button>
                </div>

                {/* Starting progress indicator */}
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
                  <Toggle
                    checked={cfg.meshEnabled}
                    onChange={v => { setCfg(c => ({ ...c, meshEnabled: v })); saveConfig(); }}
                    label="Mesh Networking"
                    desc="Enable P2P mesh for distributed compute"
                    disabled={isRunning}
                  />
                  <div>
                    <label className="text-xs font-medium block mb-1">API Port</label>
                    <input
                      type="number"
                      value={cfg.port}
                      onChange={e => setCfg(c => ({ ...c, port: Number(e.target.value) }))}
                      onBlur={saveConfig}
                      disabled={isRunning}
                      className="w-full text-xs bg-ide-bg border border-ide-border rounded px-2 py-1.5 focus:border-ide-accent focus:outline-none disabled:opacity-40"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium block mb-1">Scan Paths</label>
                  <input
                    type="text"
                    value={cfg.scanPaths.join(', ')}
                    onChange={e => setCfg(c => ({ ...c, scanPaths: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                    onBlur={saveConfig}
                    placeholder="Paths to scan for AE seed, comma-separated"
                    disabled={isRunning}
                    className="w-full text-xs bg-ide-bg border border-ide-border rounded px-2 py-1.5 focus:border-ide-accent focus:outline-none disabled:opacity-40"
                  />
                  <p className="text-[10px] text-ide-text-dim mt-0.5">
                    Comma-separated paths. The AE scanner reads your filesystem to create a unique seed.
                  </p>
                </div>
              </Section>

              {/* ── Node Status ───────────────────────────────── */}
              {meshInfo && !meshInfo.error && (
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
              )}

              {/* ── Global Compute Pool ──────────────────────── */}
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
                  onClick={saveConfig}
                  className="text-[10px] text-ide-accent hover:underline mt-1"
                >
                  Apply
                </button>

                <div className="grid grid-cols-2 gap-3 mt-1">
                  <Toggle
                    checked={cfg.permanentNode}
                    onChange={v => { setCfg(c => ({ ...c, permanentNode: v })); saveConfig(); }}
                    label="Permanent Node"
                    desc="Always part of the pool (anchors the network)"
                  />
                  <Toggle
                    checked={cfg.idleTraining}
                    onChange={v => { setCfg(c => ({ ...c, idleTraining: v })); saveConfig(); }}
                    label="Idle Training"
                    desc="Auto-train nanos when pool is idle"
                  />
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

              {/* ── Peer Discovery ────────────────────────────── */}
              <Section title="Peer Discovery" icon={Users}>
                <p className="text-[10px] text-ide-text-dim mb-2">
                  Discover other IDE instances on your network. Peer connections are personal — different from the global pool.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <Toggle
                    checked={cfg.peerDiscovery}
                    onChange={v => { setCfg(c => ({ ...c, peerDiscovery: v })); saveConfig(); }}
                    label="Enable Discovery"
                    desc="Make yourself visible to other IDE instances"
                  />
                  <div>
                    <label className="text-xs font-medium block mb-1">Sharing Level</label>
                    <select
                      value={cfg.sharingLevel}
                      onChange={e => { setCfg(c => ({ ...c, sharingLevel: e.target.value })); saveConfig(); }}
                      className="w-full text-xs bg-ide-bg border border-ide-border rounded px-2 py-1.5 focus:border-ide-accent focus:outline-none"
                    >
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
                  <input
                    type="text"
                    value={cfg.username}
                    onChange={e => setCfg(c => ({ ...c, username: e.target.value }))}
                    onBlur={saveConfig}
                    placeholder="Visible to other peers"
                    className="w-full text-xs bg-ide-bg border border-ide-border rounded px-2 py-1.5 focus:border-ide-accent focus:outline-none"
                  />
                </div>

                {discoveryStatus && !discoveryStatus.error && (
                  <div className="flex items-center gap-3 text-[10px] text-ide-text-dim bg-ide-bg/50 rounded p-2">
                    <span>{discoveryStatus.discoverable ? '🟢 Discoverable' : '🔴 Hidden'}</span>
                    <span>·</span>
                    <span>{discoveryStatus.total_peers ?? 0} peers found</span>
                    <span>·</span>
                    <span>{discoveryStatus.connected_peers ?? 0} connected</span>
                    {(discoveryStatus.pending_requests ?? 0) > 0 && (
                      <>
                        <span>·</span>
                        <span className="text-yellow-400">{discoveryStatus.pending_requests} pending</span>
                      </>
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
                            }>
                              {p.trust_level}
                            </Badge>
                            {p.has_cuda && <Badge color="purple">GPU</Badge>}
                          </div>
                          <div className="text-[10px] text-ide-text-dim flex items-center gap-2">
                            <span>Tier {p.tier}</span>
                            <span>·</span>
                            <span>Grade {p.compute_grade.toFixed(1)}</span>
                            <span>·</span>
                            <span>RESPECT {p.respect_score.toFixed(0)}</span>
                            {p.gpu_name && <><span>·</span><span>{p.gpu_name}</span></>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {p.state === 'connected' ? (
                            <button
                              onClick={() => disconnectPeer(p.node_id)}
                              className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-red-500/10 text-red-400 hover:bg-red-500/20"
                            >
                              <Unlink className="w-3 h-3" /> Disconnect
                            </button>
                          ) : p.state === 'pending_in' ? (
                            <button
                              onClick={() => connectPeer(p.node_id)}
                              className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-green-500/10 text-green-400 hover:bg-green-500/20"
                            >
                              <Check className="w-3 h-3" /> Accept
                            </button>
                          ) : p.state === 'blocked' ? (
                            <Badge color="red">Blocked</Badge>
                          ) : (
                            <button
                              onClick={() => connectPeer(p.node_id)}
                              className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-ide-accent/10 text-ide-accent hover:bg-ide-accent/20"
                            >
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

              {/* ── Logs ──────────────────────────────────────── */}
              <Section title="Process Logs" icon={Terminal} defaultOpen={isRunning || logs.length > 0} badge={
                logs.length > 0 ? <Badge color="gray">{logs.length} lines</Badge> : null
              }>
                <div
                  ref={logsRef}
                  className="bg-black/50 rounded p-2 font-mono text-[10px] text-green-300/80 max-h-56 overflow-y-auto leading-relaxed"
                  style={{ minHeight: 80 }}
                >
                  {logs.length === 0 ? (
                    <div className="text-ide-text-dim text-center py-4">
                      No logs yet. Start the Nano Sea to see output.
                    </div>
                  ) : (
                    logs.map((line, i) => (
                      <div key={i} className={
                        line.includes('[ERR]') || line.includes('ERROR') ? 'text-red-400' :
                        line.includes('[IDE]') ? 'text-cyan-300' :
                        line.includes('SPAWN ERROR') ? 'text-red-500 font-bold' :
                        ''
                      }>
                        {line}
                      </div>
                    ))
                  )}
                </div>
              </Section>
            </>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-ide-border text-[10px] text-ide-text-dim">
          <div className="flex items-center gap-2">
            <Waves className="w-3 h-3 text-cyan-400" />
            <span>Sea of Nanos v1.0</span>
          </div>
          <div className="flex items-center gap-3">
            <span>Port {cfg.port}</span>
            {isRunning && status?.api?.uptime_s && (
              <span>Uptime: {Math.floor(status.api.uptime_s / 60)}m {Math.floor(status.api.uptime_s % 60)}s</span>
            )}
            {envCheck?.python && (
              <span>{envCheck.python.bin}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
