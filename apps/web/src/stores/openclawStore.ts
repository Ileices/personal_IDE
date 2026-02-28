// ============================================
// OpenClaw Store — manages skill listing,
// execution, and workflow state
// ============================================
import { create } from 'zustand';
import { API } from '../config';

export interface ClawSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  inputSchema: Record<string, any>;
  builtIn: boolean;
}

export interface LobsterWorkflow {
  id: string;
  name: string;
  description: string;
  steps: { skillId: string; inputMap: Record<string, string> }[];
  createdAt: string;
}

export interface SkillExecution {
  skillId: string;
  output: any;
  success: boolean;
  durationMs: number;
  timestamp: string;
}

interface OpenClawState {
  skills: ClawSkill[];
  categories: string[];
  workflows: LobsterWorkflow[];
  executionLog: SkillExecution[];
  selectedSkill: ClawSkill | null;
  loading: boolean;
  error: string | null;
  panelOpen: boolean;

  // Actions
  fetchSkills: (category?: string) => Promise<void>;
  fetchCategories: () => Promise<void>;
  fetchWorkflows: () => Promise<void>;
  fetchLog: () => Promise<void>;
  executeSkill: (skillId: string, input?: Record<string, any>) => Promise<SkillExecution | null>;
  createWorkflow: (name: string, description: string, steps: any[]) => Promise<void>;
  selectSkill: (skill: ClawSkill | null) => void;
  togglePanel: () => void;
}

export const useOpenClawStore = create<OpenClawState>((set, get) => ({
  skills: [],
  categories: [],
  workflows: [],
  executionLog: [],
  selectedSkill: null,
  loading: false,
  error: null,
  panelOpen: false,

  fetchSkills: async (category) => {
    try {
      const url = category
        ? `${API}/openclaw/skills?category=${encodeURIComponent(category)}`
        : `${API}/openclaw/skills`;
      const res = await fetch(url);
      const data = await res.json();
      set({ skills: data.skills || [] });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  fetchCategories: async () => {
    try {
      const res = await fetch(`${API}/openclaw/categories`);
      const data = await res.json();
      set({ categories: data.categories || [] });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  fetchWorkflows: async () => {
    try {
      const res = await fetch(`${API}/openclaw/workflows`);
      const data = await res.json();
      set({ workflows: data.workflows || [] });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  fetchLog: async () => {
    try {
      const res = await fetch(`${API}/openclaw/log?limit=50`);
      const data = await res.json();
      set({ executionLog: data.log || [] });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  executeSkill: async (skillId, input = {}) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${API}/openclaw/skills/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId, input }),
      });
      const data = await res.json();
      const exec: SkillExecution = {
        skillId,
        output: data.output,
        success: data.success ?? true,
        durationMs: data.durationMs ?? 0,
        timestamp: new Date().toISOString(),
      };
      set(s => ({
        executionLog: [exec, ...s.executionLog].slice(0, 100),
        loading: false,
      }));
      return exec;
    } catch (err: any) {
      set({ error: err.message, loading: false });
      return null;
    }
  },

  createWorkflow: async (name, description, steps) => {
    try {
      await fetch(`${API}/openclaw/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, steps }),
      });
      await get().fetchWorkflows();
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  selectSkill: (skill) => set({ selectedSkill: skill }),
  togglePanel: () => set(s => ({ panelOpen: !s.panelOpen })),
}));
