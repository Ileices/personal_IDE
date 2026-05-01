// ============================================
// Environment Config - loads .env and exposes typed config
// ============================================
import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '../../../.env');

// Load .env from monorepo root
loadEnv({ path: ENV_PATH });

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
  security: {
    encryptKey: string;
  };
  /** Default service URLs — overridable via env or DB provider_configs */
  services: {
    ollamaUrl: string;
    nanoSeaUrl: string;
  };
  /** Dynamic context detection settings */
  contextDefaults: {
    /** Default context window for unknown/dynamic models (Ollama, Nano, etc.) */
    unknownModelContext: number;
    /** Absolute minimum context floor — prevents shrinking below this even on errors */
    contextFloor: number;
    /** Default output token reserve */
    defaultOutputReserve: number;
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

/**
 * Resolve ENCRYPT_KEY — auto-generate and persist to .env if missing or insecure.
 * Ensures the key is never the insecure hardcoded default in production.
 */
function resolveEncryptKey(): string {
  const INSECURE_DEFAULT = 'personal-ide-default-key-change-in-production';
  const existing = process.env['ENCRYPT_KEY'];

  // If set and not the insecure default, use it
  if (existing && existing !== INSECURE_DEFAULT && existing !== 'change-me-to-a-random-string') {
    return existing;
  }

  // Auto-generate a secure 256-bit key
  const generated = randomBytes(32).toString('hex');

  // Persist to .env so subsequent restarts use the same key
  try {
    if (existsSync(ENV_PATH)) {
      let content = readFileSync(ENV_PATH, 'utf-8');
      if (content.includes('ENCRYPT_KEY=')) {
        // Replace existing line
        content = content.replace(/^ENCRYPT_KEY=.*$/m, `ENCRYPT_KEY=${generated}`);
      } else {
        // Append
        content += `\n# Auto-generated encryption key — DO NOT commit to git\nENCRYPT_KEY=${generated}\n`;
      }
      writeFileSync(ENV_PATH, content, 'utf-8');
    } else {
      writeFileSync(ENV_PATH, `# Auto-generated encryption key — DO NOT commit to git\nENCRYPT_KEY=${generated}\n`, 'utf-8');
    }
    console.warn('⚠️  ENCRYPT_KEY was missing or insecure — auto-generated and saved to .env');
  } catch (err) {
    console.warn('⚠️  Could not persist ENCRYPT_KEY to .env:', err);
  }

  // Update process.env for this run
  process.env['ENCRYPT_KEY'] = generated;
  return generated;
}

export function loadConfig(): AppConfig {
  return {
    server: {
      port: envInt('SERVER_PORT', 3001),
      host: env('SERVER_HOST', '127.0.0.1'),
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
    security: {
      encryptKey: resolveEncryptKey(),
    },
    services: {
      ollamaUrl: env('OLLAMA_URL', 'http://localhost:11434'),
      nanoSeaUrl: env('NANO_SEA_URL', 'http://localhost:5100'),
    },
    contextDefaults: {
      unknownModelContext: envInt('UNKNOWN_MODEL_CONTEXT', 128000),
      contextFloor: envInt('CONTEXT_FLOOR', 2048),
      defaultOutputReserve: envInt('DEFAULT_OUTPUT_RESERVE', 4096),
    },
  };
}

export const appConfig = loadConfig();
