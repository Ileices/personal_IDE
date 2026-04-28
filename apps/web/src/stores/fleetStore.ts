// ============================================
// Fleet Store — Multi-agent fleet state
// Manages parallel agent instances via Zustand
// ============================================
import { create } from 'zustand';
import { apiPost, apiGet, apiStreamGet } from '../api/client';

export type AgentRole = 'lead' | 'implementer' | 'debugger' | 'tester' | 'reviewer' | 'documenter';
export type FleetExecutionMode = 'local' | 'cloud' | 'hybrid';

export interface FleetCapacitySnapshot {
  maxAgents: number;
  cpuCount: number;
  totalMemoryGB: number;
  freeMemoryGB: number;
  gpuCount: number;
  recommendedLocalAgents?: number;
  recommendedHybridAgents?: number;
}

export interface FleetAgentInfo {
  id: string;
  role: AgentRole;
  task: string;
  model?: string;
  provider?: string;
  placement?: 'local' | 'cloud';
  assignmentSource?: string;
  status: string;
  iterations: number;
  filesChanged: number;
  tokensUsed: number;
  assignedFiles: string[];
}

export interface FleetEvent {
  type: string;
  timestamp: string;
  data: any;
  agentId?: string;
  agentRole?: string;
}

interface FleetStore {
  // State
  isFleetRunning: boolean;
  fleetState: 'idle' | 'decomposing' | 'running' | 'paused' | 'complete' | 'error';
  fleetId: string | null;
  agents: FleetAgentInfo[];
  events: FleetEvent[];
  totalIterations: number;
  totalFilesChanged: number;
  totalTokensUsed: number;
  maxAgents: number;
  selectedAgentCount: number;
  capacity: FleetCapacitySnapshot | null;
  eventSource: EventSource | null;

  // Fleet settings
  fleetContinuousMode: boolean;
  fleetCooldownMs: number;
  fleetBypassRateLimits: boolean;
  executionMode: FleetExecutionMode;
  localModelPool: string[];
  cloudModelPool: string[];
  roleModelOverrides: Partial<Record<AgentRole, string>>;

  // Actions
  startFleet: (projectId: string, task: string, model: string) => Promise<void>;
  stopFleet: () => Promise<void>;
  pauseFleet: () => Promise<void>;
  resumeFleet: () => Promise<void>;
  sendFleetMessage: (message: string, agentId?: string) => Promise<void>;
  pauseAgent: (agentId: string) => Promise<void>;
  resumeAgent: (agentId: string) => Promise<void>;
  stopAgent: (agentId: string) => Promise<void>;
  fetchMaxAgents: () => Promise<void>;
  fetchFleetCapacity: () => Promise<void>;
  setSelectedAgentCount: (count: number) => void;
  setFleetContinuousMode: (val: boolean) => void;
  setFleetCooldownMs: (val: number) => void;
  setFleetBypassRateLimits: (val: boolean) => void;
  setExecutionMode: (mode: FleetExecutionMode) => void;
  setLocalModelPool: (models: string[]) => void;
  setCloudModelPool: (models: string[]) => void;
  setRoleModelOverride: (role: AgentRole, model: string | null) => void;
  connectFleetEvents: () => void;
  disconnectFleetEvents: () => void;
  clearFleetEvents: () => void;
}

export const useFleetStore = create<FleetStore>((set, get) => ({
  isFleetRunning: false,
  fleetState: 'idle',
  fleetId: null,
  agents: [],
  events: [],
  totalIterations: 0,
  totalFilesChanged: 0,
  totalTokensUsed: 0,
  maxAgents: 4,
  selectedAgentCount: 3,
  capacity: null,
  eventSource: null,
  fleetContinuousMode: true,
  fleetCooldownMs: 5000,
  fleetBypassRateLimits: true,
  executionMode: 'hybrid',
  localModelPool: [],
  cloudModelPool: [],
  roleModelOverrides: {},

  startFleet: async (projectId, task, model) => {
    const {
      selectedAgentCount,
      fleetContinuousMode,
      fleetCooldownMs,
      fleetBypassRateLimits,
      executionMode,
      localModelPool,
      cloudModelPool,
      roleModelOverrides,
    } = get();

    const payload: Record<string, any> = {
      projectId,
      task,
      model,
      agentCount: selectedAgentCount,
      continuousMode: fleetContinuousMode,
      cooldownMs: fleetCooldownMs,
      bypassRateLimits: fleetBypassRateLimits,
      enableSmartChunking: true,
      executionMode,
    };

    if (localModelPool.length > 0) payload.localModelPool = localModelPool;
    if (cloudModelPool.length > 0) payload.cloudModelPool = cloudModelPool;
    if (Object.keys(roleModelOverrides).length > 0) payload.roleModelOverrides = roleModelOverrides;

    const res = await apiPost('/fleet/start', payload) as any;

    set({
      isFleetRunning: true,
      fleetState: 'decomposing',
      fleetId: res?.fleetId || null,
      agents: [],
      events: [],
      totalIterations: 0,
      totalFilesChanged: 0,
      totalTokensUsed: 0,
    });

    get().connectFleetEvents();
  },

  stopFleet: async () => {
    await apiPost('/fleet/stop', {});
    set({ isFleetRunning: false, fleetState: 'idle' });
    get().disconnectFleetEvents();
  },

  pauseFleet: async () => {
    await apiPost('/fleet/pause', {});
    set({ fleetState: 'paused' });
  },

  resumeFleet: async () => {
    await apiPost('/fleet/resume', {});
    set({ fleetState: 'running' });
  },

  sendFleetMessage: async (message, agentId) => {
    await apiPost('/fleet/message', { message, agentId, priority: 'high' });
  },

  pauseAgent: async (agentId) => {
    await apiPost(`/fleet/agent/${agentId}/pause`, {});
  },

  resumeAgent: async (agentId) => {
    await apiPost(`/fleet/agent/${agentId}/resume`, {});
  },

  stopAgent: async (agentId) => {
    await apiPost(`/fleet/agent/${agentId}/stop`, {});
  },

  fetchMaxAgents: async () => {
    try {
      await get().fetchFleetCapacity();
    } catch { /* ignore */ }
  },

  fetchFleetCapacity: async () => {
    try {
      const res = await apiGet('/fleet/capacity') as FleetCapacitySnapshot;
      if (res?.maxAgents) {
        set({ capacity: res, maxAgents: res.maxAgents });
        if (get().selectedAgentCount > res.maxAgents) {
          set({ selectedAgentCount: res.maxAgents });
        }
      }
    } catch {
      // Backward-compatible fallback when capacity endpoint is unavailable
      const res = await apiGet('/fleet/max-agents') as FleetCapacitySnapshot;
      if (res?.maxAgents) {
        set({ capacity: res, maxAgents: res.maxAgents });
        if (get().selectedAgentCount > res.maxAgents) {
          set({ selectedAgentCount: res.maxAgents });
        }
      }
    }
  },

  setSelectedAgentCount: (count) => set({ selectedAgentCount: count }),
  setFleetContinuousMode: (val) => set({ fleetContinuousMode: val }),
  setFleetCooldownMs: (val) => set({ fleetCooldownMs: val }),
  setFleetBypassRateLimits: (val) => set({ fleetBypassRateLimits: val }),
  setExecutionMode: (mode) => set({ executionMode: mode }),
  setLocalModelPool: (models) => set({ localModelPool: models }),
  setCloudModelPool: (models) => set({ cloudModelPool: models }),
  setRoleModelOverride: (role, model) => set((s) => {
    const next = { ...s.roleModelOverrides };
    if (!model?.trim()) {
      delete next[role];
    } else {
      next[role] = model.trim();
    }
    return { roleModelOverrides: next };
  }),

  connectFleetEvents: () => {
    get().disconnectFleetEvents();

    const es = apiStreamGet(
      '/fleet/stream',
      (event) => {
        const fleetEvent: FleetEvent = {
          type: event.type || event.innerType || 'unknown',
          timestamp: event.timestamp || new Date().toISOString(),
          data: event,
          agentId: event.agentId,
          agentRole: event.agentRole,
        };

        set(s => ({ events: [...s.events, fleetEvent] }));

        // Update state based on event types
        switch (event.type) {
          case 'fleet_start':
            set({ fleetState: 'decomposing' });
            break;

          case 'fleet_decomposed':
            set({ fleetState: 'running' });
            break;

          case 'agent_spawned':
            set(s => ({
              agents: [...s.agents, {
                id: event.agentId,
                role: event.role,
                task: event.task || '',
                model: event.model,
                provider: event.provider,
                placement: event.placement,
                assignmentSource: event.assignmentSource,
                status: 'running',
                iterations: 0,
                filesChanged: 0,
                tokensUsed: 0,
                assignedFiles: [],
              }],
            }));
            break;

          case 'agent_complete':
            set(s => ({
              agents: s.agents.map(a =>
                a.id === event.agentId
                  ? { ...a, status: 'complete', iterations: event.iterations || a.iterations, filesChanged: event.filesChanged || a.filesChanged }
                  : a
              ),
            }));
            break;

          case 'agent_error':
            set(s => ({
              agents: s.agents.map(a =>
                a.id === event.agentId ? { ...a, status: 'error' } : a
              ),
            }));
            break;

          case 'agent_event':
            // Update agent metrics from inner events
            if (event.innerType === 'step_start' && event.agentId) {
              set(s => ({
                agents: s.agents.map(a =>
                  a.id === event.agentId ? { ...a, iterations: a.iterations + 1 } : a
                ),
                totalIterations: s.totalIterations + 1,
              }));
            }
            if (event.innerType === 'file_changed' && event.agentId) {
              set(s => ({
                agents: s.agents.map(a =>
                  a.id === event.agentId ? { ...a, filesChanged: a.filesChanged + 1 } : a
                ),
                totalFilesChanged: s.totalFilesChanged + 1,
              }));
            }
            break;

          case 'fleet_complete':
            set({
              isFleetRunning: false,
              fleetState: 'complete',
              totalIterations: event.totalIterations || 0,
              totalFilesChanged: event.totalFilesChanged || 0,
              totalTokensUsed: event.totalTokensUsed || 0,
            });
            break;

          case 'fleet_stopped':
            set({ isFleetRunning: false, fleetState: 'idle' });
            break;

          case 'fleet_error':
            set({ isFleetRunning: false, fleetState: 'error' });
            break;
        }
      },
      () => {
        // Connection closed
        set({ isFleetRunning: false });
      }
    );

    set({ eventSource: es });
  },

  disconnectFleetEvents: () => {
    const { eventSource } = get();
    if (eventSource) {
      eventSource.close();
      set({ eventSource: null });
    }
  },

  clearFleetEvents: () => set({ events: [] }),
}));
