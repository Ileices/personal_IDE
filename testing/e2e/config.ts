// testing/e2e/config.ts
// Centralized test endpoint configuration
// Usage: import { API } from './config';

// Base URL (defaults to localhost:3001 if not set in env)
export const API_BASE = process.env.API_BASE || 'http://localhost:3001';

// API Endpoints
export const API = {
  filesWrite: '/api/files/write',
  filesRename: '/api/files/rename',
  terminalWrite: '/api/terminal/write',
  terminalExec: '/api/terminal/exec',
  terminalResize: '/api/terminal/resize',
  tiersDetect: '/api/tiers/detect',
  tiersDecideLanguage: '/api/tiers/decide-language',
  errorsCheck: '/api/errors/check',
  errorsTaskPlan: '/api/errors/task-plan',
  previewRun: '/api/preview/run',
  previewScript: '/api/preview/script',
  previewUrl: '/api/preview/url',
  health: '/api/health',
  chatSend: '/api/chat/send',
  agentStart: '/api/agent/start',
  agentStop: '/api/agent/stop',
  fleetStatus: '/api/fleet/status',
};

// Helper to construct full URLs
export function apiUrl(endpoint: string): string {
  return `${API_BASE}${endpoint}`;
}