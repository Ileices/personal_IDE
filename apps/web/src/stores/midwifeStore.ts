// ============================================
// Midwife Store - Bird-feeding state management
// ============================================
import { create } from 'zustand';
import { apiGet, apiPost, apiPut } from '../api/client';

export type MidwifeTaskType =
  | 'code_generation'
  | 'code_explanation'
  | 'test_generation'
  | 'documentation'
  | 'refactoring'
  | 'debugging'
  | 'data_generation'
  | 'architecture'
  | 'security_review';

export interface TaskModelAssignment {
  taskType: MidwifeTaskType;
  label: string;
  description: string;
  assignedModels: string[];
  cooldownMs: number;
  enabled: boolean;
  promptTemplate: string;
}

export interface MidwifeConfig {
  enabled: boolean;
  globalCooldownMs: number;
  maxParallelTasks: number;
  autoRotateOnRateLimit: boolean;
  feedToNanoTrainer: boolean;
  nanoPort: number;
  tasks: TaskModelAssignment[];
  enabledProviders: string[];
}

export interface FeedingSession {
  id?: string;
  startedAt?: string;
  totalPairsGenerated?: number;
  totalPairsFed?: number;
  totalTokensUsed?: number;
  errors?: string[];
  isRunning: boolean;
  currentTask?: string | null;
  currentModel?: string | null;
}

export interface FeedingHistoryEntry {
  timestamp: string;
  taskType: string;
  model: string;
  input: string;
  outputSnippet: string;
  fullOutput?: string;
  quality: number;
  tokensUsed: number;
  fedToNano: boolean;
}

interface MidwifeStore {
  config: MidwifeConfig | null;
  status: FeedingSession;
  tasks: TaskModelAssignment[];
  history: FeedingHistoryEntry[];
  loading: boolean;
  error: string | null;

  fetchConfig: () => Promise<void>;
  updateConfig: (updates: Partial<MidwifeConfig>) => Promise<void>;
  fetchTasks: () => Promise<void>;
  updateTask: (taskType: MidwifeTaskType, updates: Partial<TaskModelAssignment>) => Promise<void>;
  fetchStatus: () => Promise<void>;
  fetchHistory: () => Promise<void>;
  startFeeding: () => Promise<void>;
  stopFeeding: () => Promise<void>;
}

export const useMidwifeStore = create<MidwifeStore>((set, get) => ({
  config: null,
  status: { isRunning: false },
  tasks: [],
  history: [],
  loading: false,
  error: null,

  fetchConfig: async () => {
    try {
      const data = await apiGet<MidwifeConfig>('/midwife/config');
      set({ config: data, error: null });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  updateConfig: async (updates) => {
    try {
      const res = await apiPut<{ success: boolean; config: MidwifeConfig }>('/midwife/config', updates);
      if (res.config) set({ config: res.config, error: null });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  fetchTasks: async () => {
    try {
      const data = await apiGet<{ tasks: TaskModelAssignment[] }>('/midwife/tasks');
      set({ tasks: data.tasks || [], error: null });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  updateTask: async (taskType, updates) => {
    try {
      await apiPut(`/midwife/tasks/${taskType}`, updates);
      await get().fetchTasks();
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  fetchStatus: async () => {
    try {
      const data = await apiGet<FeedingSession>('/midwife/status');
      set({ status: data, error: null });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  fetchHistory: async () => {
    try {
      const data = await apiGet<{ history: FeedingHistoryEntry[] }>('/midwife/history');
      set({ history: data.history || [], error: null });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  startFeeding: async () => {
    set({ loading: true });
    try {
      await apiPost('/midwife/start', {});
      set({ loading: false, error: null });
      await get().fetchStatus();
    } catch (err: any) {
      set({ loading: false, error: err.message });
    }
  },

  stopFeeding: async () => {
    set({ loading: true });
    try {
      await apiPost('/midwife/stop', {});
      set({ loading: false, error: null });
      await get().fetchStatus();
    } catch (err: any) {
      set({ loading: false, error: err.message });
    }
  },
}));
