// ============================================
// Terminal Store — manages terminal sessions
// and output state for both user and LLM terminals
// ============================================
import { create } from 'zustand';
import { API } from '../config';

export interface TerminalSession {
  id: string;
  label: string;
  cwd: string;
  shell: string;
  owner: 'user' | 'agent';
  alive: boolean;
  createdAt: string;
}

interface TerminalLine {
  text: string;
  stream: 'stdout' | 'stderr' | 'stdin';
  timestamp: string;
}

interface TerminalState {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  outputMap: Record<string, TerminalLine[]>;  // sessionId → lines
  loading: boolean;
  error: string | null;

  // Actions
  fetchSessions: () => Promise<void>;
  createSession: (owner: 'user' | 'agent', label?: string, cwd?: string) => Promise<TerminalSession | null>;
  destroySession: (id: string) => void;
  setActiveSession: (id: string) => void;
  writeInput: (sessionId: string, input: string) => void;
  execCommand: (sessionId: string, command: string) => Promise<string>;
  fetchBuffer: (sessionId: string) => Promise<void>;
  appendOutput: (sessionId: string, line: TerminalLine) => void;
  clearOutput: (sessionId: string) => void;
}

const MAX_OUTPUT_LINES = 5000;

export const useTerminalStore = create<TerminalState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  outputMap: {},
  loading: false,
  error: null,

  fetchSessions: async () => {
    try {
      const res = await fetch(`${API}/terminal/sessions`);
      if (!res.ok) throw new Error('Failed to fetch sessions');
      const data = await res.json();
      set({ sessions: data.sessions || [] });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  createSession: async (owner, label, cwd) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${API}/terminal/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, label, cwd }),
      });
      if (!res.ok) throw new Error('Failed to create session');
      const data = await res.json();
      const session = data.session as TerminalSession;
      set(s => ({
        sessions: [...s.sessions, session],
        activeSessionId: session.id,
        outputMap: { ...s.outputMap, [session.id]: [] },
        loading: false,
      }));
      return session;
    } catch (err: any) {
      set({ error: err.message, loading: false });
      return null;
    }
  },

  destroySession: async (id) => {
    try {
      await fetch(`${API}/terminal/sessions/${id}`, { method: 'DELETE' });
    } catch { /* ignore */ }
    set(s => {
      const sessions = s.sessions.filter(ss => ss.id !== id);
      const { [id]: _, ...rest } = s.outputMap;
      return {
        sessions,
        outputMap: rest,
        activeSessionId: s.activeSessionId === id
          ? (sessions[0]?.id ?? null)
          : s.activeSessionId,
      };
    });
  },

  setActiveSession: (id) => set({ activeSessionId: id }),

  writeInput: async (sessionId, input) => {
    // Show what user typed in the output
    get().appendOutput(sessionId, {
      text: input.replace(/\n$/, ''),
      stream: 'stdin',
      timestamp: new Date().toISOString(),
    });
    try {
      await fetch(`${API}/terminal/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, input }),
      });
    } catch { /* ignore */ }
  },

  execCommand: async (sessionId, command) => {
    get().appendOutput(sessionId, {
      text: `$ ${command}`,
      stream: 'stdin',
      timestamp: new Date().toISOString(),
    });
    try {
      const res = await fetch(`${API}/terminal/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, command, timeout: 30000 }),
      });
      const data = await res.json();
      const output = data.output || '';
      if (output) {
        get().appendOutput(sessionId, {
          text: output,
          stream: 'stdout',
          timestamp: new Date().toISOString(),
        });
      }
      return output;
    } catch (err: any) {
      const errText = `Error: ${err.message}`;
      get().appendOutput(sessionId, {
        text: errText,
        stream: 'stderr',
        timestamp: new Date().toISOString(),
      });
      return errText;
    }
  },

  fetchBuffer: async (sessionId) => {
    try {
      const res = await fetch(`${API}/terminal/buffer/${sessionId}?lastN=200`);
      const data = await res.json();
      const lines: TerminalLine[] = (data.lines || []).map((text: string) => ({
        text,
        stream: 'stdout' as const,
        timestamp: new Date().toISOString(),
      }));
      set(s => ({
        outputMap: { ...s.outputMap, [sessionId]: lines },
      }));
    } catch { /* ignore */ }
  },

  appendOutput: (sessionId, line) => {
    set(s => {
      const existing = s.outputMap[sessionId] || [];
      const updated = [...existing, line];
      // Cap output
      const capped = updated.length > MAX_OUTPUT_LINES
        ? updated.slice(-MAX_OUTPUT_LINES)
        : updated;
      return { outputMap: { ...s.outputMap, [sessionId]: capped } };
    });
  },

  clearOutput: (sessionId) => {
    set(s => ({ outputMap: { ...s.outputMap, [sessionId]: [] } }));
  },
}));
