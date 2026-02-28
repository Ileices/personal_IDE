// ============================================
// Nano Sea Types — shared interfaces for
// NanoSeaControls and related components
// ============================================

export interface NanoStatus {
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

export interface NanoConfig {
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

export interface EnvCheck {
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

export interface MeshInfo {
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

export interface PoolStats {
  total_members?: number;
  online_members?: number;
  permanent_nodes?: number;
  total_pool_capacity?: number;
  active_jobs?: number;
  total_jobs_completed?: number;
  idle_training_enabled?: boolean;
  error?: string;
}

export interface DiscoveredPeer {
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

export interface DiscoveryStatus {
  discoverable?: boolean;
  opt_in?: boolean;
  sharing_level?: string;
  total_peers?: number;
  connected_peers?: number;
  pending_requests?: number;
  error?: string;
}
