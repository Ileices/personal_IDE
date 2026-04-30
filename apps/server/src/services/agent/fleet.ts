// ============================================
// Agent Fleet Orchestrator
// Manages multiple EnhancedAgentLoop instances
// running in parallel with role-based decomposition.
// Agents coordinate via a shared message bus and
// file-lock system to avoid edit conflicts.
// ============================================
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import type { ProviderType } from '@personal-ide/shared';
import { getModel, extractProviderFromModelId } from '@personal-ide/shared';
import { appConfig } from '../../config.js';
import { EnhancedAgentLoop } from './enhancedLoop.js';
import { listAllFiles } from '../filesystem/index.js';
import { readFile } from '../filesystem/index.js';
import { CodebaseAnalyzer } from '../analysis/codebase.js';
import os from 'os';
import { execSync } from 'child_process';

// ── Types ──

export type AgentRole =
  | 'lead'            // Decomposes task, reviews work, coordinates team
  | 'implementer'     // Writes new code, implements features
  | 'debugger'        // Finds and fixes bugs, handles edge cases
  | 'tester'          // Writes tests, validates behavior
  | 'reviewer'        // Reviews code quality, security, patterns
  | 'documenter';     // Writes docs, improves logging, comments

export type FleetExecutionMode = 'local' | 'cloud' | 'hybrid';

const LOCAL_PROVIDERS: ProviderType[] = ['ollama', 'lmstudio', 'nano'];
const LOCAL_FIRST_ROLES: AgentRole[] = ['implementer', 'debugger', 'tester'];

export interface GpuDeviceInfo {
  index: number;
  name: string;
  totalMemoryGB: number;
}

export interface FleetCapacity {
  maxAgents: number;
  recommendedLocalAgents: number;
  recommendedHybridAgents: number;
  cpuCount: number;
  totalMemoryGB: number;
  freeMemoryGB: number;
  gpuCount: number;
  gpus: GpuDeviceInfo[];
}

export interface FleetAgent {
  id: string;
  role: AgentRole;
  loop: EnhancedAgentLoop;
  task: string;
  model: string;
  provider: ProviderType;
  placement: 'local' | 'cloud';
  assignedFiles: string[];          // File paths this agent "owns"
  status: 'starting' | 'running' | 'paused' | 'complete' | 'error';
  startedAt: string;
  completedAt?: string;
  iterations: number;
  filesChanged: number;
  tokensUsed: number;
}

export interface FleetConfig {
  projectId: string;
  projectRoot: string;
  masterTask: string;
  model: string;
  provider: ProviderType;
  fallbackModels?: string[];
  agentCount: number;              // How many agents to run
  continuousMode: boolean;
  cooldownMs: number;
  bypassRateLimits: boolean;
  enableSmartChunking: boolean;
  analyzeCodebase: boolean;
  executionMode: FleetExecutionMode;
  localModelPool: string[];
  cloudModelPool: string[];
  roleModelOverrides?: Partial<Record<AgentRole, string>>;
  contextWindow?: number;
  maxIterationsPerAgent?: number;
  enableSubAgents?: boolean;       // Allow agents to spawn sub-agents
}

export interface FleetStatus {
  fleetId: string;
  state: 'idle' | 'decomposing' | 'running' | 'complete' | 'error';
  masterTask: string;
  executionMode: FleetExecutionMode;
  agentCount: number;
  agents: {
    id: string;
    role: AgentRole;
    task: string;
    model: string;
    provider: ProviderType;
    placement: 'local' | 'cloud';
    status: string;
    iterations: number;
    filesChanged: number;
    tokensUsed: number;
    assignedFiles: string[];
  }[];
  totalIterations: number;
  totalFilesChanged: number;
  totalTokensUsed: number;
  startedAt: string;
  decomposition?: TaskDecomposition;
}

interface TaskDecomposition {
  subtasks: SubTask[];
  sharedContext: string;
  fileAssignments: Record<string, string[]>; // agentRole -> files[]
}

interface SubTask {
  role: AgentRole;
  task: string;
  priority: number;
  dependencies: AgentRole[];
  filePatterns: string[];
}

interface FleetModelAssignment {
  model: string;
  provider: ProviderType;
  placement: 'local' | 'cloud';
  source: 'role-override' | 'local-pool' | 'cloud-pool' | 'default';
}

type FleetEventCallback = (event: any) => void;

// ── Fleet Orchestrator ──

export class AgentFleet {
  private fleetId: string;
  private state: 'idle' | 'decomposing' | 'running' | 'complete' | 'error' = 'idle';
  private agents: Map<string, FleetAgent> = new Map();
  private listeners: FleetEventCallback[] = [];
  private fileLocks: Map<string, string> = new Map(); // file -> agentId
  private messageBus: FleetMessage[] = [];
  private abortController: AbortController | null = null;
  private startedAt: string = '';
  private decomposition: TaskDecomposition | null = null;

  constructor(
    private db: Database.Database,
    private config: FleetConfig
  ) {
    this.fleetId = uuid();
  }

  // ── Event System ──

  onEvent(callback: FleetEventCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private emit(event: any): void {
    const fleetEvent = {
      ...event,
      fleetId: this.fleetId,
      timestamp: new Date().toISOString(),
    };
    for (const listener of this.listeners) {
      try { listener(fleetEvent); } catch { /* ignore */ }
    }
  }

  // ── Lifecycle ──

  async start(): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error('Fleet already running');
    }

    this.abortController = new AbortController();
    this.startedAt = new Date().toISOString();
    this.state = 'decomposing';

    this.emit({
      type: 'fleet_start',
      agentCount: this.config.agentCount,
      masterTask: this.config.masterTask,
    });

    try {
      // Phase 1: Analyze project structure
      this.emit({ type: 'fleet_info', message: 'Analyzing project structure for task decomposition...' });
      const projectFiles = listAllFiles(this.config.projectRoot);
      const filesByDir = this.groupFilesByDirectory(projectFiles);

      // Phase 2: Decompose task into sub-tasks based on roles
      this.emit({ type: 'fleet_info', message: 'Decomposing master task into ' + this.config.agentCount + ' agent roles...' });
      this.decomposition = this.decomposeTask(
        this.config.masterTask,
        projectFiles,
        filesByDir,
        this.config.agentCount
      );

      this.emit({
        type: 'fleet_decomposed',
        subtasks: this.decomposition.subtasks.map(s => ({
          role: s.role,
          task: s.task.slice(0, 200),
          fileCount: s.filePatterns.length,
        })),
      });

      // Phase 3: Spawn agents
      this.state = 'running';
      const agentPromises: Promise<void>[] = [];

      for (const [index, subtask] of this.decomposition.subtasks.entries()) {
        const agentId = uuid();
        const assignment = this.selectModelAssignment(subtask.role, index);
        const agentConfig = this.buildAgentConfig(subtask, assignment);
        const loop = new EnhancedAgentLoop(this.db, agentConfig);

        const agent: FleetAgent = {
          id: agentId,
          role: subtask.role,
          loop,
          task: subtask.task,
          model: assignment.model,
          provider: assignment.provider,
          placement: assignment.placement,
          assignedFiles: subtask.filePatterns,
          status: 'starting',
          startedAt: new Date().toISOString(),
          iterations: 0,
          filesChanged: 0,
          tokensUsed: 0,
        };

        this.agents.set(agentId, agent);

        // Subscribe to agent events and re-emit with fleet context
        loop.onEvent((event: any) => {
          this.handleAgentEvent(agentId, subtask.role, event);
        });

        // Lock files for this agent
        for (const f of subtask.filePatterns) {
          this.fileLocks.set(f, agentId);
        }

        this.emit({
          type: 'agent_spawned',
          agentId,
          role: subtask.role,
          model: assignment.model,
          provider: assignment.provider,
          placement: assignment.placement,
          assignmentSource: assignment.source,
          task: subtask.task.slice(0, 200),
          fileCount: subtask.filePatterns.length,
        });

        // Start agent (fire-and-forget, collect promise)
        const promise = loop.start(this.config.projectId, subtask.task)
          .then(() => {
            agent.status = 'complete';
            agent.completedAt = new Date().toISOString();
            this.emit({
              type: 'agent_complete',
              agentId,
              role: subtask.role,
              iterations: agent.iterations,
              filesChanged: agent.filesChanged,
            });
          })
          .catch((err: any) => {
            agent.status = 'error';
            this.emit({
              type: 'agent_error',
              agentId,
              role: subtask.role,
              error: err.message,
            });
          });

        agent.status = 'running';
        agentPromises.push(promise);

        // Stagger agent launches to avoid slamming the LLM with concurrent requests.
        // Local providers (Ollama, LMStudio, Nano) process sequentially — much longer delay
        // to allow each agent’s first request to complete before the next agent starts.
        // Cloud providers still need staggering to avoid 429 rate-limit stampede —
        // all agents firing at once triggers per-minute request caps.
        const isLocal = assignment.placement === 'local';
        const staggerMs = isLocal ? 15000 : 3000;
        await new Promise(resolve => setTimeout(resolve, staggerMs));
      }

      // Wait for all agents to complete (or run until stopped)
      await Promise.allSettled(agentPromises);

      // Fleet complete
      if (this.state === 'running') {
        this.state = 'complete';
        this.emit({
          type: 'fleet_complete',
          totalAgents: this.agents.size,
          totalIterations: this.getTotalIterations(),
          totalFilesChanged: this.getTotalFilesChanged(),
          totalTokensUsed: this.getTotalTokens(),
        });
      }
    } catch (err: any) {
      this.state = 'error';
      this.emit({ type: 'fleet_error', error: err.message });
    }
  }

  stop(): void {
    this.abortController?.abort();
    for (const [, agent] of this.agents) {
      try {
        agent.loop.stop();
        agent.status = 'complete';
      } catch { /* ignore */ }
    }
    this.state = 'complete';
    this.emit({ type: 'fleet_stopped' });
  }

  pauseAll(): void {
    for (const [, agent] of this.agents) {
      try { agent.loop.pause(); agent.status = 'paused'; } catch { /* ignore */ }
    }
    this.emit({ type: 'fleet_paused' });
  }

  resumeAll(): void {
    for (const [, agent] of this.agents) {
      try { agent.loop.resume(); agent.status = 'running'; } catch { /* ignore */ }
    }
    this.emit({ type: 'fleet_resumed' });
  }

  pauseAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) { agent.loop.pause(); agent.status = 'paused'; }
  }

  resumeAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) { agent.loop.resume(); agent.status = 'running'; }
  }

  stopAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) { agent.loop.stop(); agent.status = 'complete'; }
  }

  /** Send a message to all agents or a specific agent */
  broadcastMessage(message: string, targetAgentId?: string, priority: 'normal' | 'high' = 'high'): void {
    if (targetAgentId) {
      const agent = this.agents.get(targetAgentId);
      if (agent) {
        agent.loop.queueMessage(message, priority);
      }
    } else {
      for (const [, agent] of this.agents) {
        agent.loop.queueMessage(message, priority);
      }
    }
    this.emit({
      type: 'fleet_message',
      target: targetAgentId || 'all',
      message: message.slice(0, 200),
    });
  }

  // ── Status ──

  getStatus(): FleetStatus {
    const agents = Array.from(this.agents.values());
    return {
      fleetId: this.fleetId,
      state: this.state,
      masterTask: this.config.masterTask,
      executionMode: this.config.executionMode,
      agentCount: agents.length,
      agents: agents.map(a => ({
        id: a.id,
        role: a.role,
        task: a.task.slice(0, 300),
        model: a.model,
        provider: a.provider,
        placement: a.placement,
        status: a.status,
        iterations: a.iterations,
        filesChanged: a.filesChanged,
        tokensUsed: a.tokensUsed,
        assignedFiles: a.assignedFiles.slice(0, 20),
      })),
      totalIterations: this.getTotalIterations(),
      totalFilesChanged: this.getTotalFilesChanged(),
      totalTokensUsed: this.getTotalTokens(),
      startedAt: this.startedAt,
      decomposition: this.decomposition || undefined,
    };
  }

  static detectMaxAgents(): number {
    return this.detectCapacity().maxAgents;
  }

  static detectCapacity(): FleetCapacity {
    const cpuCount = os.cpus().length;
    const totalMemGB = os.totalmem() / (1024 ** 3);
    const freeMemGB = os.freemem() / (1024 ** 3);
    const gpus = this.detectGpuDevices();

    // Each agent roughly needs 2 CPU cores and ~2 GB free memory.
    const byCpu = Math.max(1, Math.floor(cpuCount / 2));
    const byMem = Math.max(1, Math.floor(totalMemGB / 2));
    const gpuBudget = gpus.length > 0 ? Math.max(2, gpus.length * 3) : 8;
    const maxAgents = Math.min(byCpu, byMem, gpuBudget, 16);

    const recommendedLocalAgents = gpus.length > 0
      ? Math.max(1, Math.min(maxAgents, gpus.length * 2))
      : Math.max(1, Math.min(maxAgents, Math.floor(byCpu / 2)));
    const recommendedHybridAgents = Math.max(
      recommendedLocalAgents,
      Math.min(maxAgents, recommendedLocalAgents + 2)
    );

    return {
      maxAgents,
      recommendedLocalAgents,
      recommendedHybridAgents,
      cpuCount,
      totalMemoryGB: Math.round(totalMemGB * 10) / 10,
      freeMemoryGB: Math.round(freeMemGB * 10) / 10,
      gpuCount: gpus.length,
      gpus,
    };
  }

  // ── Private Helpers ──

  private handleAgentEvent(agentId: string, role: AgentRole, event: any): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    // Track metrics
    if (event.type === 'step_start') agent.iterations++;
    if (event.type === 'file_changed') agent.filesChanged++;

    // Update token count from status
    try {
      const status = agent.loop.getStatus();
      agent.tokensUsed = status.totalTokensUsed || 0;
    } catch { /* ignore */ }

    // Re-emit with fleet context
    this.emit({
      ...event,
      agentId,
      agentRole: role,
      type: 'agent_event',
      innerType: event.type,
    });

    // Inter-agent coordination: if one agent finds errors, notify debugger
    if (event.type === 'errors_detected' && role !== 'debugger') {
      const debugger_ = Array.from(this.agents.values()).find(a => a.role === 'debugger');
      if (debugger_ && debugger_.status === 'running') {
        const errorMsg = `[FROM ${role.toUpperCase()} AGENT] Errors detected in files I'm working on:\n${
          (event.errors || []).map((e: any) => `${e.file}:${e.line} — ${e.message}`).join('\n')
        }\nPlease investigate and fix these.`;
        debugger_.loop.queueMessage(errorMsg, 'high');
      }
    }

    // If an agent completes a subtask, notify the lead
    if (event.type === 'run_complete' && role !== 'lead') {
      const lead = Array.from(this.agents.values()).find(a => a.role === 'lead');
      if (lead && lead.status === 'running') {
        lead.loop.queueMessage(
          `[TEAM UPDATE] The ${role} agent has completed: ${event.summary || 'task finished'}. ` +
          `${agent.filesChanged} files changed, ${agent.iterations} iterations. ` +
          `Review their work and coordinate next steps.`,
          'high'
        );
      }
    }
  }

  private decomposeTask(
    masterTask: string,
    allFiles: string[],
    filesByDir: Map<string, string[]>,
    agentCount: number
  ): TaskDecomposition {
    // Determine which roles to activate based on agent count
    const roles = this.selectRoles(agentCount);

    // Categorize files by purpose
    const fileCategories = this.categorizeFiles(allFiles);

    // Build subtasks with role-specific instructions
    const subtasks: SubTask[] = roles.map((role, idx) => ({
      role,
      task: this.buildRoleTask(role, masterTask, fileCategories, allFiles),
      priority: role === 'lead' ? 0 : idx,
      dependencies: role === 'lead' ? [] : ['lead'],
      filePatterns: this.assignFilesForRole(role, fileCategories, allFiles, roles.length),
    }));

    // Build file assignments map
    const fileAssignments: Record<string, string[]> = {};
    for (const st of subtasks) {
      fileAssignments[st.role] = st.filePatterns;
    }

    return {
      subtasks,
      sharedContext: `Fleet of ${agentCount} agents working on: ${masterTask.slice(0, 500)}`,
      fileAssignments,
    };
  }

  private selectRoles(count: number): AgentRole[] {
    // Priority-ordered roles
    const allRoles: AgentRole[] = [
      'lead', 'implementer', 'debugger', 'tester', 'reviewer', 'documenter',
    ];

    if (count >= 6) return allRoles;
    if (count === 5) return ['lead', 'implementer', 'debugger', 'tester', 'reviewer'];
    if (count === 4) return ['lead', 'implementer', 'debugger', 'tester'];
    if (count === 3) return ['lead', 'implementer', 'debugger'];
    if (count === 2) return ['lead', 'implementer'];
    return ['lead']; // single agent gets lead role (does everything)
  }

  private buildRoleTask(
    role: AgentRole,
    masterTask: string,
    fileCategories: FileCategories,
    allFiles: string[]
  ): string {
    const fileCount = allFiles.length;
    const specFiles = fileCategories.specs;
    const srcFiles = fileCategories.source;

    const base = `MASTER TASK: ${masterTask}\n\n` +
      `PROJECT SCALE: ${fileCount} files total, ${srcFiles.length} source files, ${specFiles.length} spec/doc files.\n` +
      `You are part of a TEAM of agents working together. Your role is: ${role.toUpperCase()}.\n` +
      `Coordinate with your team by reading shared files and not modifying files assigned to other agents.\n\n`;

    switch (role) {
      case 'lead':
        return base +
          `AS THE LEAD AGENT, your responsibilities are:\n` +
          `1. Read ALL spec/documentation files in the spec/ directory to understand the full project vision\n` +
          `2. Read through the codebase to understand the current implementation state\n` +
          `3. Create a master plan document at FLEET_PLAN.md with:\n` +
          `   - What's already implemented\n` +
          `   - What's missing or incomplete\n` +
          `   - Priority-ordered list of remaining work\n` +
          `   - Architecture decisions and patterns to follow\n` +
          `4. Coordinate the team by updating FLEET_PLAN.md as work progresses\n` +
          `5. Review changes made by other agents (they will notify you when done)\n` +
          `6. Ensure consistency across the entire codebase\n` +
          `7. Handle cross-cutting concerns that span multiple modules\n` +
          `8. Keep files under 500 lines — split if needed\n\n` +
          `SPEC FILES TO READ FIRST:\n${specFiles.slice(0, 100).join('\n')}\n`;

      case 'implementer':
        return base +
          `AS THE IMPLEMENTER AGENT, your responsibilities are:\n` +
          `1. Read the spec files and understand what needs to be built\n` +
          `2. Read existing source code to understand patterns and conventions\n` +
          `3. Implement all missing features, modules, and functionality\n` +
          `4. Follow existing code patterns and architecture\n` +
          `5. Ensure all imports, exports, and interfaces are correct\n` +
          `6. Keep files under 500 lines — split large files into modules\n` +
          `7. Add proper TypeScript/type annotations throughout\n` +
          `8. Handle all TODO/FIXME items in the source code\n\n` +
          `FOCUS ON: Source code implementation, feature completion, module wiring.\n` +
          `SOURCE FILES: ${srcFiles.length} files across the project.\n`;

      case 'debugger':
        return base +
          `AS THE DEBUGGER AGENT, your responsibilities are:\n` +
          `1. Scan the entire codebase for bugs, errors, and edge cases\n` +
          `2. Fix all TypeScript/JavaScript errors and type mismatches\n` +
          `3. Add null checks, boundary validation, and error handling\n` +
          `4. Fix all import/export issues and missing dependencies\n` +
          `5. Ensure proper error messages and graceful degradation\n` +
          `6. Fix race conditions, memory leaks, and async issues\n` +
          `7. Add try/catch blocks where appropriate\n` +
          `8. Run lint checks and fix all warnings\n` +
          `9. Keep files under 500 lines\n\n` +
          `FOCUS ON: Bug fixes, error handling, edge cases, robustness.\n`;

      case 'tester':
        return base +
          `AS THE TESTER AGENT, your responsibilities are:\n` +
          `1. Read the spec files to understand expected behavior\n` +
          `2. Create comprehensive test suites for all modules\n` +
          `3. Test edge cases, error paths, and boundary conditions\n` +
          `4. Add integration tests that verify cross-module interactions\n` +
          `5. Create test fixtures and mock data as needed\n` +
          `6. Run existing tests and fix any failures\n` +
          `7. Aim for >80% code coverage\n` +
          `8. Keep test files under 500 lines — split by module\n\n` +
          `FOCUS ON: Test creation, validation, coverage.\n`;

      case 'reviewer':
        return base +
          `AS THE REVIEWER AGENT, your responsibilities are:\n` +
          `1. Review ALL code for quality, security, and best practices\n` +
          `2. Check for security vulnerabilities (XSS, injection, etc.)\n` +
          `3. Verify proper input validation and sanitization\n` +
          `4. Check for performance issues and optimization opportunities\n` +
          `5. Ensure consistent naming conventions and code style\n` +
          `6. Verify proper separation of concerns\n` +
          `7. Check for dead code and unused imports\n` +
          `8. Create a REVIEW_REPORT.md with findings and fixes applied\n` +
          `9. Keep files under 500 lines\n\n` +
          `FOCUS ON: Code quality, security, performance, patterns.\n`;

      case 'documenter':
        return base +
          `AS THE DOCUMENTER AGENT, your responsibilities are:\n` +
          `1. Read all spec files and source code\n` +
          `2. Add JSDoc/TSDoc comments to all public functions and classes\n` +
          `3. Create/update README.md with setup instructions\n` +
          `4. Add inline comments explaining complex logic\n` +
          `5. Create architecture documentation if missing\n` +
          `6. Ensure all logging is clear and actionable\n` +
          `7. Add proper error messages throughout the codebase\n` +
          `8. Keep files under 500 lines\n\n` +
          `FOCUS ON: Documentation, comments, logging, readability.\n`;

      default:
        return base + 'Implement and improve the project as needed.\n';
    }
  }

  private categorizeFiles(files: string[]): FileCategories {
    const categories: FileCategories = {
      specs: [],
      source: [],
      tests: [],
      configs: [],
      docs: [],
      assets: [],
    };

    for (const f of files) {
      const lower = f.toLowerCase();
      if (lower.includes('/spec/') || lower.includes('/docs/') || lower.endsWith('.md')) {
        categories.specs.push(f);
        categories.docs.push(f);
      } else if (lower.includes('.test.') || lower.includes('.spec.') || lower.includes('__tests__')) {
        categories.tests.push(f);
      } else if (lower.endsWith('.json') || lower.endsWith('.toml') || lower.endsWith('.yaml') || lower.endsWith('.yml') || lower.includes('config')) {
        categories.configs.push(f);
      } else if (/\.(ts|tsx|js|jsx|py|rs|go|java|cs|rb|php|c|cpp|h)$/.test(lower)) {
        categories.source.push(f);
      } else {
        categories.assets.push(f);
      }
    }

    return categories;
  }

  private assignFilesForRole(
    role: AgentRole,
    categories: FileCategories,
    allFiles: string[],
    totalAgents: number
  ): string[] {
    switch (role) {
      case 'lead':
        return [...categories.specs, ...categories.docs, ...categories.configs].slice(0, 200);
      case 'implementer':
        return categories.source.slice(0, 500);
      case 'debugger':
        return categories.source.slice(0, 500);
      case 'tester':
        return [...categories.tests, ...categories.source.slice(0, 100)];
      case 'reviewer':
        return categories.source.slice(0, 500);
      case 'documenter':
        return [...categories.docs, ...categories.source.slice(0, 200)];
      default:
        return allFiles.slice(0, 200);
    }
  }

  private groupFilesByDirectory(files: string[]): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const f of files) {
      const dir = f.substring(0, f.lastIndexOf('/') || f.lastIndexOf('\\'));
      const arr = map.get(dir) || [];
      arr.push(f);
      map.set(dir, arr);
    }
    return map;
  }

  private buildAgentConfig(subtask: SubTask, assignment: FleetModelAssignment): any {
    const modelDef = getModel(assignment.model);
    const isLocal = assignment.placement === 'local';
    // Local models process requests sequentially — each agent must wait for others.
    // Step delay = 10s per agent to prevent queue saturation and timeout cascades.
    const stepDelay = isLocal ? Math.max(10000, 10000 * this.config.agentCount) : 3000;
    return {
      maxIterations: this.config.maxIterationsPerAgent || (this.config.continuousMode ? Infinity : 200),
      stepDelayMs: stepDelay,
      maxTokensPerStep: 4096,
      autoApproveChanges: true,
      autoAnswerQuestions: true,
      model: assignment.model,
      fallbackModels: this.config.fallbackModels,
      projectRoot: this.config.projectRoot,
      continuousMode: this.config.continuousMode,
      cooldownMs: this.config.cooldownMs,
      bypassRateLimits: isLocal ? true : this.config.bypassRateLimits,
      enableSmartChunking: this.config.enableSmartChunking,
      provider: assignment.provider,
      contextWindow: this.config.contextWindow ?? modelDef?.maxInputTokens ?? appConfig.contextDefaults.unknownModelContext,
      checkpointEvery: 0,
      autoFixErrors: subtask.role === 'debugger' || subtask.role === 'implementer',
      autoRunTests: subtask.role === 'tester' || subtask.role === 'debugger',
      analyzeCodebase: this.config.analyzeCodebase,
    };
  }

  private selectModelAssignment(role: AgentRole, agentIndex: number): FleetModelAssignment {
    const roleOverride = this.config.roleModelOverrides?.[role]?.trim();
    if (roleOverride) {
      const provider = this.resolveProvider(roleOverride, this.config.provider);
      return {
        model: roleOverride,
        provider,
        placement: this.isLocalProvider(provider) ? 'local' : 'cloud',
        source: 'role-override',
      };
    }

    const localPool = this.normalizeModelPool(this.config.localModelPool);
    const cloudPool = this.normalizeModelPool(this.config.cloudModelPool);
    const defaultProvider = this.resolveProvider(this.config.model, this.config.provider);

    if (this.isLocalProvider(defaultProvider) && !localPool.includes(this.config.model)) {
      localPool.unshift(this.config.model);
    }
    if (!this.isLocalProvider(defaultProvider) && !cloudPool.includes(this.config.model)) {
      cloudPool.unshift(this.config.model);
    }

    const localModel = this.pickRoundRobin(localPool, agentIndex);
    const cloudModel = this.pickRoundRobin(cloudPool, agentIndex);

    let selectedModel = this.config.model;
    let source: FleetModelAssignment['source'] = 'default';

    if (this.config.executionMode === 'local') {
      if (localModel) {
        selectedModel = localModel;
        source = 'local-pool';
      }
    } else if (this.config.executionMode === 'cloud') {
      if (cloudModel) {
        selectedModel = cloudModel;
        source = 'cloud-pool';
      }
    } else {
      const localFirst = LOCAL_FIRST_ROLES.includes(role);
      if (localFirst && localModel) {
        selectedModel = localModel;
        source = 'local-pool';
      } else if (!localFirst && cloudModel) {
        selectedModel = cloudModel;
        source = 'cloud-pool';
      } else if (localModel) {
        selectedModel = localModel;
        source = 'local-pool';
      } else if (cloudModel) {
        selectedModel = cloudModel;
        source = 'cloud-pool';
      }
    }

    const provider = this.resolveProvider(selectedModel, this.config.provider);
    return {
      model: selectedModel,
      provider,
      placement: this.isLocalProvider(provider) ? 'local' : 'cloud',
      source,
    };
  }

  private normalizeModelPool(pool: string[] | undefined): string[] {
    if (!pool?.length) return [];

    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const model of pool) {
      const trimmed = model.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      cleaned.push(trimmed);
    }
    return cleaned;
  }

  private pickRoundRobin(pool: string[], agentIndex: number): string | null {
    if (!pool.length) return null;
    return pool[agentIndex % pool.length];
  }

  private resolveProvider(model: string, fallback: ProviderType): ProviderType {
    return (extractProviderFromModelId(model) as ProviderType) || fallback;
  }

  private isLocalProvider(provider: ProviderType): boolean {
    return LOCAL_PROVIDERS.includes(provider);
  }

  private static detectGpuDevices(): GpuDeviceInfo[] {
    try {
      const raw = execSync(
        'nvidia-smi --query-gpu=index,name,memory.total --format=csv,noheader,nounits',
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500, windowsHide: true }
      );

      return raw
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .map((line): GpuDeviceInfo | null => {
          const [indexRaw, nameRaw, memRaw] = line.split(',').map(x => x.trim());
          const index = Number(indexRaw);
          const memMb = Number(memRaw);
          if (!Number.isFinite(index) || !nameRaw || !Number.isFinite(memMb)) return null;
          return {
            index,
            name: nameRaw,
            totalMemoryGB: Math.round((memMb / 1024) * 10) / 10,
          };
        })
        .filter((gpu): gpu is GpuDeviceInfo => Boolean(gpu));
    } catch {
      return [];
    }
  }

  private getTotalIterations(): number {
    let total = 0;
    for (const [, a] of this.agents) total += a.iterations;
    return total;
  }

  private getTotalFilesChanged(): number {
    let total = 0;
    for (const [, a] of this.agents) total += a.filesChanged;
    return total;
  }

  private getTotalTokens(): number {
    let total = 0;
    for (const [, a] of this.agents) total += a.tokensUsed;
    return total;
  }
}

interface FleetMessage {
  from: string;
  to: string | 'all';
  content: string;
  timestamp: string;
  priority: 'normal' | 'high';
}

interface FileCategories {
  specs: string[];
  source: string[];
  tests: string[];
  configs: string[];
  docs: string[];
  assets: string[];
}
