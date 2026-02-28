// ============================================
// Agent Store - Agent loop controls
// Enhanced: verbosity modes, message queue,
// event copy, expandable entries
// ============================================
import { create } from 'zustand';
import type { AgentState, AgentStep, StructuredAgentOutput } from '@personal-ide/shared';
import { apiPost, apiGet, apiStreamGet } from '../api/client';

export type VerbosityLevel = 'minimal' | 'detailed' | 'full';

interface AgentEvent {
  type: string;
  timestamp: string;
  data: any;
  expanded?: boolean;
}

interface AgentStore {
  isRunning: boolean;
  state: AgentState;
  currentIteration: number;
  maxIterations: number;
  currentStep: AgentStep | null;
  events: AgentEvent[];
  questions: string[];
  stepDelayMs: number;
  autoApprove: boolean;
  autoAnswer: boolean;
  eventSource: EventSource | null;
  /** WebSocket connection (preferred over SSE when available) */
  ws: WebSocket | null;

  // New: 24/7 mode, rate limits, chunking
  continuousMode: boolean;
  cooldownMs: number;
  bypassRateLimits: boolean;
  enableSmartChunking: boolean;
  chunkingActive: boolean;
  chunkingProgress: { current: number; total: number } | null;

  // v3: verbosity + message queue
  verbosity: VerbosityLevel;
  queuedMessageCount: number;

  startAgent: (projectId: string, task: string, model: string) => Promise<void>;
  stopAgent: () => Promise<void>;
  pauseAgent: () => Promise<void>;
  resumeAgent: () => Promise<void>;
  setStepDelay: (ms: number) => void;
  setAutoApprove: (val: boolean) => void;
  setAutoAnswer: (val: boolean) => void;
  setMaxIterations: (val: number) => void;
  setContinuousMode: (val: boolean) => void;
  setCooldownMs: (val: number) => void;
  setBypassRateLimits: (val: boolean) => void;
  setEnableSmartChunking: (val: boolean) => void;
  setVerbosity: (level: VerbosityLevel) => void;
  sendQueuedMessage: (message: string, priority?: 'normal' | 'high') => Promise<void>;
  toggleEventExpanded: (index: number) => void;
  copyEventsToClipboard: () => string;
  connectEvents: () => void;
  disconnectEvents: () => void;
  clearEvents: () => void;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  isRunning: false,
  state: 'idle',
  currentIteration: 0,
  maxIterations: 50,
  currentStep: null,
  events: [],
  questions: [],
  stepDelayMs: 2000,
  autoApprove: true,
  autoAnswer: true,
  eventSource: null,
  ws: null,

  // New defaults
  continuousMode: false,
  cooldownMs: 0,
  bypassRateLimits: false,
  enableSmartChunking: true,
  chunkingActive: false,
  chunkingProgress: null,

  // v3 defaults
  verbosity: 'detailed',
  queuedMessageCount: 0,

  startAgent: async (projectId, task, model) => {
    const { maxIterations, stepDelayMs, autoApprove, autoAnswer, continuousMode, cooldownMs, bypassRateLimits, enableSmartChunking } = get();

    await apiPost('/agent/start', {
      projectId,
      task,
      model,
      maxIterations,
      stepDelayMs,
      autoApproveChanges: autoApprove,
      autoAnswerQuestions: autoAnswer,
      continuousMode,
      cooldownMs,
      bypassRateLimits,
      enableSmartChunking,
    });

    set({ isRunning: true, state: 'planning', currentIteration: 0, events: [] });
    get().connectEvents();
  },

  stopAgent: async () => {
    await apiPost('/agent/stop', {});
    set({ isRunning: false, state: 'idle' });
    get().disconnectEvents();
  },

  pauseAgent: async () => {
    await apiPost('/agent/pause', {});
    set({ state: 'paused' });
  },

  resumeAgent: async () => {
    await apiPost('/agent/resume', {});
    set({ state: 'executing' });
  },

  setStepDelay: (ms) => set({ stepDelayMs: ms }),
  setAutoApprove: (val) => set({ autoApprove: val }),
  setAutoAnswer: (val) => set({ autoAnswer: val }),
  setMaxIterations: (val) => set({ maxIterations: val }),
  setContinuousMode: (val) => set({ continuousMode: val }),
  setCooldownMs: (val) => set({ cooldownMs: val }),
  setBypassRateLimits: (val) => set({ bypassRateLimits: val }),
  setEnableSmartChunking: (val) => set({ enableSmartChunking: val }),
  setVerbosity: (level) => set({ verbosity: level }),

  sendQueuedMessage: async (message, priority = 'normal') => {
    try {
      const res = await apiPost('/agent/message', { message, priority }) as any;
      if (res?.queueSize !== undefined) {
        set({ queuedMessageCount: res.queueSize });
      }
    } catch (err: any) {
      console.error('Failed to queue message:', err);
    }
  },

  toggleEventExpanded: (index) => {
    set(s => {
      const events = [...s.events];
      if (events[index]) {
        events[index] = { ...events[index], expanded: !events[index].expanded };
      }
      return { events };
    });
  },

  copyEventsToClipboard: () => {
    const { events, verbosity } = get();
    const filtered = filterEventsByVerbosity(events, verbosity);
    const text = filtered.map(e => {
      const time = new Date(e.timestamp).toLocaleTimeString();
      const detail = e.data?.step?.action || e.data?.summary || e.data?.error || e.data?.question || e.data?.state || e.data?.message || '';
      return `[${time}] [${e.type}] ${detail}`;
    }).join('\n');
    navigator.clipboard.writeText(text);
    return text;
  },

  connectEvents: () => {
    get().disconnectEvents();

    // ── Reconnect state ──
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 8;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    /** Exponential backoff: 1s → 2s → 4s → … → 128s cap */
    function getBackoffMs() {
      return Math.min(1000 * Math.pow(2, reconnectAttempts), 128_000);
    }

    // ── Shared event handler for both WebSocket and SSE ──
    const handleEvent = (event: any) => {
      const agentEvent: AgentEvent = {
        type: event.type,
        timestamp: new Date().toISOString(),
        data: event,
      };

      set(s => ({ events: [...s.events, agentEvent] }));

      switch (event.type) {
        case 'state_change':
          set({ state: event.state });
          if (event.state === 'complete' || event.state === 'error') {
            if (event.state === 'error' && !get().continuousMode) {
              set({ isRunning: false });
            }
            if (event.state === 'complete') {
              set({ isRunning: false });
            }
          }
          break;
        case 'step_start':
          set({ currentStep: event.step, currentIteration: event.iteration });
          break;
        case 'question_logged':
          set(s => ({ questions: [...s.questions, event.question] }));
          break;
        case 'run_complete':
          if (!get().continuousMode) {
            set({ isRunning: false, state: 'complete' });
          }
          break;
        case 'error':
          if (!get().continuousMode) {
            set({ isRunning: false, state: 'error' });
          }
          break;
        case 'chunking_start':
          set({ chunkingActive: true, chunkingProgress: { current: 0, total: event.totalChunks || 0 } });
          break;
        case 'chunking_progress':
          set({ chunkingProgress: { current: event.chunkIndex + 1, total: event.totalChunks || 0 } });
          break;
        case 'chunking_complete':
        case 'chunking_error':
          set({ chunkingActive: false, chunkingProgress: null });
          break;
        case 'message_queued':
          set({ queuedMessageCount: event.queueSize || 0 });
          break;
        // Ignore heartbeat / status (initial handshake)
      }
    };

    function attemptReconnect() {
      if (!get().isRunning) return; // Don't reconnect if agent stopped
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.warn(`[agentStore] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached, falling back to SSE`);
        connectViaSSE(handleEvent);
        return;
      }
      const delay = getBackoffMs();
      console.info(`[agentStore] Reconnecting WS in ${delay}ms (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
      reconnectTimer = setTimeout(() => {
        reconnectAttempts++;
        connectViaWS();
      }, delay);
    }

    function connectViaWS() {
      try {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.hostname}:3001/api/agent/ws`;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          // Reset backoff on successful connection
          reconnectAttempts = 0;
        };

        ws.onmessage = (msg) => {
          try {
            const event = JSON.parse(msg.data);
            if (event.type === 'heartbeat') return; // silent
            handleEvent(event);
          } catch { /* bad JSON */ }
        };

        ws.onclose = () => {
          // If WS closes unexpectedly while running, try reconnecting with backoff
          if (get().isRunning && !get().eventSource) {
            attemptReconnect();
          }
        };

        ws.onerror = () => {
          // WebSocket not available — try reconnect or fall back to SSE
          ws.close();
          if (reconnectAttempts === 0) {
            // First failure — go straight to SSE
            connectViaSSE(handleEvent);
          }
        };

        set({ ws });
      } catch {
        // WebSocket constructor failed — use SSE
        connectViaSSE(handleEvent);
      }
    }

    // ── Try WebSocket first, fall back to SSE ──
    connectViaWS();

    function connectViaSSE(handler: (event: any) => void) {
      const es = apiStreamGet(
        '/agent/stream',
        handler,
        () => { set({ isRunning: false }); },
      );
      set({ eventSource: es });
    }

    // Expose cleanup for disconnectEvents
    (get() as any)._reconnectCleanup = () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  },

  disconnectEvents: () => {
    const state = get() as any;
    // Clear reconnect timer if present
    if (state._reconnectCleanup) state._reconnectCleanup();
    const { eventSource, ws } = get();
    if (ws) {
      ws.close();
      set({ ws: null });
    }
    if (eventSource) {
      eventSource.close();
      set({ eventSource: null });
    }
  },

  clearEvents: () => set({ events: [], questions: [] }),
}));

/** Filter events based on verbosity level */
function filterEventsByVerbosity(events: AgentEvent[], level: VerbosityLevel): AgentEvent[] {
  if (level === 'full') return events;

  const minimalTypes = new Set([
    'error', 'run_complete', 'step_complete', 'file_changed',
    'errors_detected', 'tests_failed', 'checkpoint_created',
    'loop_detected', 'message_queued',
  ]);

  const detailedTypes = new Set([
    ...minimalTypes,
    'state_change', 'step_start', 'info', 'auto_answer',
    'question_logged', 'chunking_start', 'chunking_complete',
    'chunking_error', 'cooldown', 'continuous_mode',
    'rate_limit_bypass',
  ]);

  const allowedTypes = level === 'minimal' ? minimalTypes : detailedTypes;
  return events.filter(e => allowedTypes.has(e.type));
}
