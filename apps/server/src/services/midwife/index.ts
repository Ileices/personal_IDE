// ============================================
// Midwife Bird-Feeding Service
// 
// Manages LLM-to-Nano training pipeline:
// - Model selection per task type
// - Cooldowns and rate limit rotation
// - Dataset generation (regurgitation)
// - Parallel model orchestration
// - Auto-switch on rate limits
// ============================================
import { MODELS, getModel } from '@personal-ide/shared';
import type { ProviderType } from '@personal-ide/shared';
import { getClientFromDb as getGitHubClient } from '../llm/client.js';
import { getClientFromDb as getProviderClient } from '../llm/providers.js';
import { rateLimiter } from '../llm/rateLimiter.js';

// ── Task Types ──────────────────────────────────────────────
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
  assignedModels: string[];       // ordered: primary → fallbacks
  cooldownMs: number;             // delay between calls for this task
  enabled: boolean;
  promptTemplate: string;         // template for generating training data
}

export interface MidwifeConfig {
  enabled: boolean;
  globalCooldownMs: number;       // minimum delay between any LLM call
  maxParallelTasks: number;
  autoRotateOnRateLimit: boolean;
  feedToNanoTrainer: boolean;
  nanoPort: number;
  tasks: TaskModelAssignment[];
  enabledProviders: ProviderType[];
}

export interface FeedingSession {
  id: string;
  startedAt: string;
  totalPairsGenerated: number;
  totalPairsFed: number;
  totalTokensUsed: number;
  errors: string[];
  isRunning: boolean;
  currentTask: string | null;
  currentModel: string | null;
}

export interface FeedingHistoryEntry {
  timestamp: string;
  taskType: MidwifeTaskType;
  model: string;
  input: string;
  outputSnippet: string;
  fullOutput: string;
  quality: number;
  tokensUsed: number;
  fedToNano: boolean;
}

// ── Default Task Definitions ────────────────────────────────
// Model priority strategy: high-throughput models (mini/nano: 15rpm, 150rpd) for
// routine tasks. Premium models (gpt-4.1: 10rpm, 50rpd) for complex tasks.
// Include cross-publisher fallbacks for resilience.
const DEFAULT_TASKS: TaskModelAssignment[] = [
  {
    taskType: 'code_generation',
    label: 'Code Generation',
    description: 'Generate diverse code samples for nano training',
    assignedModels: ['openai/gpt-4.1-mini', 'openai/gpt-4.1-nano', 'openai/gpt-4o-mini', 'meta/llama-4-maverick'],
    cooldownMs: 5000,
    enabled: true,
    promptTemplate: `Generate a high-quality {language} code example that demonstrates {concept}. Include proper error handling, comments, and best practices. Output ONLY the code.`,
  },
  {
    taskType: 'code_explanation',
    label: 'Code Explanation',
    description: 'Generate code-explanation pairs for understanding',
    assignedModels: ['openai/gpt-4o-mini', 'openai/gpt-4.1-mini', 'openai/gpt-4.1-nano', 'meta/llama-4-maverick'],
    cooldownMs: 5000,
    enabled: true,
    promptTemplate: `Explain this code clearly and concisely:\n\n{code}\n\nProvide: 1) Purpose, 2) How it works step-by-step, 3) Key patterns used.`,
  },
  {
    taskType: 'test_generation',
    label: 'Test Generation',
    description: 'Generate test cases to train testing nanos',
    assignedModels: ['openai/gpt-4.1-mini', 'openai/gpt-4o-mini', 'openai/gpt-4.1-nano'],
    cooldownMs: 8000,
    enabled: true,
    promptTemplate: `Write comprehensive unit tests for this code:\n\n{code}\n\nCover: happy path, edge cases, error cases. Use appropriate test framework.`,
  },
  {
    taskType: 'documentation',
    label: 'Documentation',
    description: 'Generate documentation for training doc nanos',
    assignedModels: ['openai/gpt-4.1-nano', 'openai/gpt-4.1-mini', 'openai/gpt-4o-mini'],
    cooldownMs: 6000,
    enabled: true,
    promptTemplate: `Generate clear, professional documentation for:\n\n{code}\n\nInclude: purpose, parameters, return values, examples, edge cases.`,
  },
  {
    taskType: 'refactoring',
    label: 'Refactoring',
    description: 'Generate before/after refactoring pairs',
    assignedModels: ['openai/gpt-4.1', 'openai/gpt-4.1-mini', 'openai/gpt-4o', 'meta/llama-4-maverick'],
    cooldownMs: 10000,
    enabled: false,
    promptTemplate: `Refactor this code for better readability, performance, and maintainability:\n\n{code}\n\nExplain each change.`,
  },
  {
    taskType: 'debugging',
    label: 'Debugging',
    description: 'Generate bug-finding pairs for debugging nanos',
    assignedModels: ['openai/gpt-4.1-mini', 'openai/gpt-4o-mini', 'openai/gpt-4.1-nano'],
    cooldownMs: 8000,
    enabled: false,
    promptTemplate: `Analyze this code for bugs, potential issues, and improvements:\n\n{code}\n\nFor each issue: describe the bug, its impact, and the fix.`,
  },
  {
    taskType: 'data_generation',
    label: 'Dataset Regurgitation',
    description: 'Generate diverse training data for all nano types',
    assignedModels: ['openai/gpt-4.1-nano', 'openai/gpt-4.1-mini', 'openai/gpt-4o-mini', 'meta/llama-4-maverick'],
    cooldownMs: 3000,
    enabled: true,
    promptTemplate: `Generate a diverse set of {count} training examples for a {domain} task. Each example should have an input and expected output. Format as JSON array: [{"input": "...", "output": "..."}]`,
  },
  {
    taskType: 'architecture',
    label: 'Architecture Review',
    description: 'Generate architecture analysis pairs',
    assignedModels: ['openai/gpt-4.1', 'openai/gpt-4o', 'openai/gpt-4.1-mini'],
    cooldownMs: 15000,
    enabled: false,
    promptTemplate: `Analyze this system architecture and provide recommendations:\n\n{description}\n\nCover: scalability, maintainability, security, performance.`,
  },
  {
    taskType: 'security_review',
    label: 'Security Review',
    description: 'Generate security analysis pairs',
    assignedModels: ['openai/gpt-4.1', 'openai/gpt-4o', 'openai/gpt-4.1-mini'],
    cooldownMs: 15000,
    enabled: false,
    promptTemplate: `Perform a security review of this code:\n\n{code}\n\nCheck for: injection, XSS, CSRF, auth bypass, data exposure, insecure crypto.`,
  },
];

// ── Code Corpus Seeds ───────────────────────────────────────
const CODE_CONCEPTS = [
  'binary search', 'linked list', 'hash map', 'tree traversal', 'graph BFS',
  'REST API endpoint', 'WebSocket handler', 'database query builder',
  'authentication middleware', 'rate limiter', 'cache layer', 'event emitter',
  'promise chain', 'async iterator', 'stream processing', 'file watcher',
  'CLI argument parser', 'JSON schema validator', 'state machine', 'observer pattern',
  'factory pattern', 'dependency injection', 'error boundary', 'retry with backoff',
  'debounce function', 'virtual DOM diff', 'CSS-in-JS engine', 'markdown parser',
  'syntax highlighter', 'code formatter', 'AST transformer', 'template engine',
];

const LANGUAGES = ['TypeScript', 'Python', 'Rust', 'Go', 'JavaScript', 'C++', 'Java'];

const DOMAINS = [
  'code completion', 'bug detection', 'code review', 'documentation generation',
  'test generation', 'refactoring suggestion', 'API design', 'database optimization',
  'security scanning', 'performance profiling', 'dependency analysis', 'type inference',
];

// ── Midwife Service ─────────────────────────────────────────
export class MidwifeService {
  private config: MidwifeConfig;
  private session: FeedingSession | null = null;
  private history: FeedingHistoryEntry[] = [];
  private abortController: AbortController | null = null;
  private db: any;

  constructor(db: any) {
    this.db = db;
    this.config = {
      enabled: true,
      globalCooldownMs: 2000,
      maxParallelTasks: 1,
      autoRotateOnRateLimit: true,
      feedToNanoTrainer: true,
      nanoPort: 5100,
      tasks: [...DEFAULT_TASKS],
      enabledProviders: ['github'],
    };
  }

  /** Auto-start feeding after a delay (called from server bootstrap) */
  autoStart(delayMs: number = 30000): void {
    if (!this.config.enabled) return;
    setTimeout(async () => {
      try {
        // Check if Nano Sea is reachable before starting
        const health = await fetch(`http://localhost:${this.config.nanoPort}/v1/health`, {
          signal: AbortSignal.timeout(5000),
        }).catch(() => null);
        if (!health?.ok) {
          console.log('[Midwife] Nano Sea not reachable — skipping auto-start');
          return;
        }
        console.log('[Midwife] Auto-starting feeding session...');
        await this.start();
      } catch (err: any) {
        console.log('[Midwife] Auto-start failed:', err.message);
      }
    }, delayMs);
  }

  getConfig(): MidwifeConfig {
    return { ...this.config, tasks: this.config.tasks.map(t => ({ ...t })) };
  }

  updateConfig(updates: Partial<MidwifeConfig>): MidwifeConfig {
    if (updates.tasks) {
      this.config.tasks = updates.tasks;
    }
    if (updates.globalCooldownMs !== undefined) this.config.globalCooldownMs = updates.globalCooldownMs;
    if (updates.maxParallelTasks !== undefined) this.config.maxParallelTasks = updates.maxParallelTasks;
    if (updates.autoRotateOnRateLimit !== undefined) this.config.autoRotateOnRateLimit = updates.autoRotateOnRateLimit;
    if (updates.feedToNanoTrainer !== undefined) this.config.feedToNanoTrainer = updates.feedToNanoTrainer;
    if (updates.nanoPort !== undefined) this.config.nanoPort = updates.nanoPort;
    if (updates.enabledProviders !== undefined) this.config.enabledProviders = updates.enabledProviders;
    return this.getConfig();
  }

  updateTask(taskType: MidwifeTaskType, updates: Partial<TaskModelAssignment>): TaskModelAssignment | null {
    const task = this.config.tasks.find(t => t.taskType === taskType);
    if (!task) return null;
    Object.assign(task, updates);
    return { ...task };
  }

  getStatus(): FeedingSession | { isRunning: false } {
    if (this.session) return { ...this.session };
    return { isRunning: false };
  }

  getHistory(limit = 50): FeedingHistoryEntry[] {
    return this.history.slice(-limit);
  }

  getTasks(): TaskModelAssignment[] {
    return this.config.tasks.map(t => ({ ...t }));
  }

  // ── Start Feeding Session ──
  async start(): Promise<{ success: boolean; error?: string }> {
    if (this.session?.isRunning) {
      return { success: false, error: 'Already running' };
    }

    this.abortController = new AbortController();
    this.session = {
      id: `midwife-${Date.now()}`,
      startedAt: new Date().toISOString(),
      totalPairsGenerated: 0,
      totalPairsFed: 0,
      totalTokensUsed: 0,
      errors: [],
      isRunning: true,
      currentTask: null,
      currentModel: null,
    };

    // Run feeding loop in background
    this.feedingLoop().catch((err) => {
      if (this.session) {
        this.session.errors.push(err.message);
        this.session.isRunning = false;
      }
    });

    return { success: true };
  }

  async stop(): Promise<{ success: boolean }> {
    this.abortController?.abort();
    if (this.session) {
      this.session.isRunning = false;
      this.session.currentTask = null;
      this.session.currentModel = null;
    }
    return { success: true };
  }

  // ── Core Feeding Loop ──
  private async feedingLoop(): Promise<void> {
    const enabledTasks = this.config.tasks.filter(t => t.enabled);
    if (enabledTasks.length === 0) {
      if (this.session) {
        this.session.errors.push('No tasks enabled');
        this.session.isRunning = false;
      }
      return;
    }

    let taskIndex = 0;

    while (this.session?.isRunning && !this.abortController?.signal.aborted) {
      const task = enabledTasks[taskIndex % enabledTasks.length];
      taskIndex++;

      if (this.session) {
        this.session.currentTask = task.taskType;
      }

      try {
        await this.executeTask(task);
      } catch (err: any) {
        if (err.name === 'AbortError') break;
        if (this.session) {
          this.session.errors.push(`${task.taskType}: ${err.message}`);
          if (this.session.errors.length > 100) {
            this.session.errors = this.session.errors.slice(-50);
          }
        }
      }

      // Cooldown between tasks
      const cooldown = Math.max(task.cooldownMs, this.config.globalCooldownMs);
      await this.delay(cooldown);
    }

    if (this.session) {
      this.session.isRunning = false;
      this.session.currentTask = null;
      this.session.currentModel = null;
    }
  }

  private async executeTask(task: TaskModelAssignment): Promise<void> {
    // Find a model that isn't rate-limited
    let selectedModel: string | null = null;
    for (const modelId of task.assignedModels) {
      const check = rateLimiter.canRequest(modelId);
      if (check.allowed) {
        selectedModel = modelId;
        break;
      }
    }

    // Auto-rotate: use smart fallback with headroom scoring
    if (!selectedModel && this.config.autoRotateOnRateLimit) {
      selectedModel = rateLimiter.findFallback(
        task.assignedModels[0],
        undefined,
        task.assignedModels.slice(1)
      );
    }

    if (!selectedModel) {
      throw new Error('All models rate-limited');
    }

    if (this.session) {
      this.session.currentModel = selectedModel;
    }

    // Detect provider from model
    let provider: ProviderType = 'github';
    const slashIdx = selectedModel.indexOf('/');
    if (slashIdx > 0) {
      const prefix = selectedModel.substring(0, slashIdx).toLowerCase();
      if (['ollama', 'nano'].includes(prefix)) {
        provider = prefix as ProviderType;
      }
    }

    const client = provider === 'github'
      ? getGitHubClient(this.db)
      : getProviderClient(this.db, provider);

    if (!client) {
      throw new Error(`No client for provider: ${provider}`);
    }

    // Generate training prompt
    const prompt = this.buildPrompt(task);

    rateLimiter.recordStart(selectedModel);

    try {
      const modelDef = getModel(selectedModel);
      const completion = await client.chat.completions.create({
        model: selectedModel.split('/').pop() || selectedModel,
        messages: [
          { role: 'system', content: 'You are a training data generator. Provide high-quality, diverse outputs. Be concise and precise.' },
          { role: 'user', content: prompt.input },
        ],
        max_tokens: modelDef?.maxOutputTokens || 4096,
        temperature: 0.8, // higher for diversity
      });

      rateLimiter.recordEnd(selectedModel, { success: true });

      const output = completion.choices?.[0]?.message?.content || '';
      const tokensUsed = completion.usage?.total_tokens || 0;

      if (this.session) {
        this.session.totalPairsGenerated++;
        this.session.totalTokensUsed += tokensUsed;
      }

      // Feed to nano trainer (correct format: query/response/source/quality)
      let fedToNano = false;
      if (this.config.feedToNanoTrainer && output.length > 10) {
        try {
          const res = await fetch(`http://localhost:${this.config.nanoPort}/v1/training/observe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: prompt.input.slice(0, 4000),
              response: output.slice(0, 8000),
              source: 'midwife',
              quality: 0.85,
            }),
          });
          fedToNano = res.ok;
          if (fedToNano && this.session) {
            this.session.totalPairsFed++;
          }
        } catch { /* nano not running */ }
      }

      // Save to disk as JSONL (persists even if nano trainer isn't running)
      try {
        const { appendFileSync, mkdirSync } = await import('fs');
        const { join } = await import('path');
        const dir = join(process.cwd(), '..', 'NANO_train', 'nano_data', 'training', 'midwife');
        mkdirSync(dir, { recursive: true });
        const line = JSON.stringify({
          timestamp: new Date().toISOString(),
          task: task.taskType,
          model: selectedModel,
          input: prompt.input,
          output,
          quality: 0.85,
          tokens: tokensUsed,
          fed: fedToNano,
        });
        appendFileSync(join(dir, 'feeding_data.jsonl'), line + '\n');
      } catch { /* disk save non-critical */ }

      // Record in history (store full output for expandable view)
      this.history.push({
        timestamp: new Date().toISOString(),
        taskType: task.taskType,
        model: selectedModel,
        input: prompt.input.slice(0, 500),
        outputSnippet: output.slice(0, 200),
        fullOutput: output,
        quality: 0.85,
        tokensUsed,
        fedToNano,
      });
      if (this.history.length > 500) {
        this.history = this.history.slice(-250);
      }

    } catch (err: any) {
      const statusCode = err?.status || err?.statusCode;
      rateLimiter.recordEnd(selectedModel, { statusCode, success: false });

      if (statusCode === 429 || statusCode === 403) {
        // Rate limited — will auto-rotate next time
        throw new Error(`Rate limited on ${selectedModel}`);
      }
      throw err;
    }
  }

  private buildPrompt(task: TaskModelAssignment): { input: string } {
    let input = task.promptTemplate;

    // Fill in template variables
    const lang = LANGUAGES[Math.floor(Math.random() * LANGUAGES.length)];
    const concept = CODE_CONCEPTS[Math.floor(Math.random() * CODE_CONCEPTS.length)];
    const domain = DOMAINS[Math.floor(Math.random() * DOMAINS.length)];

    input = input
      .replace('{language}', lang)
      .replace('{concept}', concept)
      .replace('{domain}', domain)
      .replace('{count}', String(Math.floor(Math.random() * 5) + 3))
      .replace('{code}', `// Example ${lang} code implementing ${concept}\n// (Use your knowledge to generate a realistic example)`)
      .replace('{description}', `A ${domain} system built with ${lang}`);

    return { input };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      this.abortController?.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    });
  }
}
