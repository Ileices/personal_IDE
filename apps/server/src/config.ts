// ============================================
// Environment Config - loads .env and exposes typed config
// ============================================
import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from monorepo root
loadEnv({ path: resolve(__dirname, '../../../.env') });

export interface AppConfig {
  server: {
    port: number;
    host: string;
  };
  github: {
    pat: string;
    clientId: string;
    clientSecret: string;
  };
  frontend: {
    url: string;
  };
  db: {
    path: string;
  };
  projects: {
    defaultDir: string;
  };
  memory: {
    maxNotesPerProject: number;
    maxQuestionLogSizeMb: number;
    searchResultsLimit: number;
  };
  agent: {
    maxIterations: number;
    stepDelayMs: number;
    maxTokensPerStep: number;
  };
  rateLimit: {
    bufferPercent: number;
    enablePaidUsage: boolean;
  };
}

function env(key: string, fallback: string = ''): string {
  return process.env[key] || fallback;
}

function envInt(key: string, fallback: number): number {
  const val = process.env[key];
  return val ? parseInt(val, 10) : fallback;
}

function envBool(key: string, fallback: boolean): boolean {
  const val = process.env[key];
  if (!val) return fallback;
  return val === 'true' || val === '1';
}

export function loadConfig(): AppConfig {
  return {
    server: {
      port: envInt('SERVER_PORT', 3001),
      host: env('SERVER_HOST', '0.0.0.0'),
    },
    github: {
      pat: env('GITHUB_PAT'),
      clientId: env('GITHUB_CLIENT_ID'),
      clientSecret: env('GITHUB_CLIENT_SECRET'),
    },
    frontend: {
      url: env('FRONTEND_URL', 'http://localhost:5173'),
    },
    db: {
      path: env('DB_PATH', './data/personal-ide.db'),
    },
    projects: {
      defaultDir: env('DEFAULT_PROJECTS_DIR', ''),
    },
    memory: {
      maxNotesPerProject: envInt('MAX_MEMORY_NOTES_PER_PROJECT', 10000),
      maxQuestionLogSizeMb: envInt('MAX_QUESTION_LOG_SIZE_MB', 50),
      searchResultsLimit: envInt('MEMORY_SEARCH_RESULTS_LIMIT', 20),
    },
    agent: {
      maxIterations: envInt('AGENT_MAX_ITERATIONS', 50),
      stepDelayMs: envInt('AGENT_STEP_DELAY_MS', 2000),
      maxTokensPerStep: envInt('AGENT_MAX_TOKENS_PER_STEP', 4096),
    },
    rateLimit: {
      bufferPercent: envInt('RATE_LIMIT_BUFFER_PERCENT', 10),
      enablePaidUsage: envBool('ENABLE_PAID_USAGE', false),
    },
  };
}

export const appConfig = loadConfig();
