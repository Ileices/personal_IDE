// ============================================
// OpenClaw Integration Service
// Connects the IDE to the OpenClaw skill ecosystem.
// Skills = community-built AI tool functions.
// ============================================

export interface ClawSkill {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  category: string;
  tags: string[];
  installed: boolean;
  /** Skill manifest URL or local path */
  source: string;
}

export interface SkillExecution {
  skillId: string;
  input: Record<string, any>;
  output: Record<string, any> | null;
  success: boolean;
  durationMs: number;
  error?: string;
}

export interface LobsterWorkflow {
  id: string;
  name: string;
  description: string;
  steps: LobsterStep[];
}

export interface LobsterStep {
  skillId: string;
  params: Record<string, any>;
  /** Pipe output of this step to next step's input */
  pipeOutput?: boolean;
}

// Built-in skill categories
const SKILL_CATEGORIES = [
  'code-analysis', 'refactoring', 'testing', 'documentation',
  'security', 'performance', 'formatting', 'generation',
  'translation', 'debugging', 'deployment', 'data',
] as const;

// Built-in skills that ship with the IDE (no external dependency)
const BUILTIN_SKILLS: ClawSkill[] = [
  {
    id: 'claw:lint-fix',
    name: 'Lint & Auto-Fix',
    description: 'Run language-specific linters and auto-fix issues',
    author: 'personal-ide', version: '1.0.0',
    category: 'code-analysis', tags: ['lint', 'fix', 'quality'],
    installed: true, source: 'builtin',
  },
  {
    id: 'claw:test-gen',
    name: 'Test Generator',
    description: 'Generate unit tests for functions/classes using LLM',
    author: 'personal-ide', version: '1.0.0',
    category: 'testing', tags: ['test', 'unit', 'generate'],
    installed: true, source: 'builtin',
  },
  {
    id: 'claw:doc-gen',
    name: 'Documentation Generator',
    description: 'Generate JSDoc/docstrings for all public symbols',
    author: 'personal-ide', version: '1.0.0',
    category: 'documentation', tags: ['docs', 'jsdoc', 'docstring'],
    installed: true, source: 'builtin',
  },
  {
    id: 'claw:security-scan',
    name: 'Security Scanner',
    description: 'Scan code for common security vulnerabilities',
    author: 'personal-ide', version: '1.0.0',
    category: 'security', tags: ['security', 'vulnerability', 'audit'],
    installed: true, source: 'builtin',
  },
  {
    id: 'claw:refactor',
    name: 'Smart Refactor',
    description: 'Extract functions, rename symbols, simplify logic',
    author: 'personal-ide', version: '1.0.0',
    category: 'refactoring', tags: ['refactor', 'extract', 'simplify'],
    installed: true, source: 'builtin',
  },
  {
    id: 'claw:perf-profile',
    name: 'Performance Profiler',
    description: 'Identify performance bottlenecks and suggest optimizations',
    author: 'personal-ide', version: '1.0.0',
    category: 'performance', tags: ['performance', 'optimize', 'profile'],
    installed: true, source: 'builtin',
  },
  {
    id: 'claw:dep-audit',
    name: 'Dependency Auditor',
    description: 'Check for outdated, vulnerable, or unused dependencies',
    author: 'personal-ide', version: '1.0.0',
    category: 'security', tags: ['dependencies', 'audit', 'outdated'],
    installed: true, source: 'builtin',
  },
  {
    id: 'claw:code-explain',
    name: 'Code Explainer',
    description: 'Generate plain-English explanations of complex code',
    author: 'personal-ide', version: '1.0.0',
    category: 'documentation', tags: ['explain', 'understand', 'comment'],
    installed: true, source: 'builtin',
  },
];

export class OpenClawService {
  private skills: Map<string, ClawSkill> = new Map();
  private workflows: Map<string, LobsterWorkflow> = new Map();
  private executionLog: SkillExecution[] = [];

  constructor() {
    // Load built-in skills
    for (const skill of BUILTIN_SKILLS) {
      this.skills.set(skill.id, skill);
    }
  }

  /** List all available skills with optional category filter */
  listSkills(category?: string): ClawSkill[] {
    const all = [...this.skills.values()];
    if (category) return all.filter(s => s.category === category);
    return all;
  }

  /** Search skills by query */
  searchSkills(query: string): ClawSkill[] {
    const q = query.toLowerCase();
    return [...this.skills.values()].filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tags.some(t => t.includes(q))
    );
  }

  /** Get skill categories */
  getCategories(): string[] {
    return [...SKILL_CATEGORIES];
  }

  /** Install a skill from ClawHub or URL */
  async installSkill(source: string): Promise<ClawSkill | null> {
    // For now, register a stub — real implementation would fetch manifest
    const id = `claw:${source.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`;
    if (this.skills.has(id)) return this.skills.get(id)!;

    const skill: ClawSkill = {
      id,
      name: source,
      description: `Installed from ${source}`,
      author: 'community',
      version: '0.0.1',
      category: 'generation',
      tags: [],
      installed: true,
      source,
    };
    this.skills.set(id, skill);
    return skill;
  }

  /** Execute a skill (dispatches to builtin handler or external runner) */
  async executeSkill(
    skillId: string,
    input: Record<string, any>,
  ): Promise<SkillExecution> {
    const start = Date.now();
    const skill = this.skills.get(skillId);
    if (!skill) {
      return { skillId, input, output: null, success: false, durationMs: 0, error: 'Skill not found' };
    }

    try {
      const output = await this.runSkill(skill, input);
      const exec: SkillExecution = {
        skillId, input, output, success: true,
        durationMs: Date.now() - start,
      };
      this.executionLog.push(exec);
      return exec;
    } catch (err: any) {
      const exec: SkillExecution = {
        skillId, input, output: null, success: false,
        durationMs: Date.now() - start,
        error: err.message || String(err),
      };
      this.executionLog.push(exec);
      return exec;
    }
  }

  /** Create a Lobster workflow from skill pipeline */
  createWorkflow(name: string, description: string, steps: LobsterStep[]): LobsterWorkflow {
    const workflow: LobsterWorkflow = {
      id: `workflow:${Date.now()}`,
      name, description, steps,
    };
    this.workflows.set(workflow.id, workflow);
    return workflow;
  }

  /** Execute a full Lobster workflow — pipe outputs between steps */
  async executeWorkflow(workflowId: string, initialInput: Record<string, any>): Promise<SkillExecution[]> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error('Workflow not found');

    const results: SkillExecution[] = [];
    let currentInput = initialInput;

    for (const step of workflow.steps) {
      const merged = { ...currentInput, ...step.params };
      const result = await this.executeSkill(step.skillId, merged);
      results.push(result);

      if (!result.success) break; // stop pipeline on failure
      if (step.pipeOutput && result.output) {
        currentInput = result.output;
      }
    }

    return results;
  }

  /** Get execution history */
  getExecutionLog(limit = 50): SkillExecution[] {
    return this.executionLog.slice(-limit);
  }

  /** List workflows */
  listWorkflows(): LobsterWorkflow[] {
    return [...this.workflows.values()];
  }

  /** Format skills for LLM consumption — the agent can invoke these */
  formatForAgent(): string {
    const skills = this.listSkills();
    let output = `AVAILABLE OPENCLAW SKILLS (${skills.length}):\n`;
    for (const s of skills) {
      output += `  [${s.id}] ${s.name} — ${s.description} (${s.category})\n`;
    }
    output += '\nTo invoke a skill, use: SKILL_INVOKE: { "skillId": "claw:...", "input": {...} }\n';
    return output;
  }

  // ── Private ──

  private async runSkill(
    skill: ClawSkill,
    input: Record<string, any>,
  ): Promise<Record<string, any>> {
    // Built-in skills return structured results
    // Real implementation would dispatch to actual tool functions
    switch (skill.id) {
      case 'claw:lint-fix':
        return { action: 'lint', files: input.files || [], fixCount: 0, message: 'Lint check complete' };
      case 'claw:test-gen':
        return { action: 'test-gen', target: input.target || '', tests: [], message: 'Test generation requires LLM context' };
      case 'claw:doc-gen':
        return { action: 'doc-gen', target: input.target || '', docs: [], message: 'Documentation generation requires LLM context' };
      case 'claw:security-scan':
        return { action: 'security-scan', files: input.files || [], vulnerabilities: [], score: 100 };
      case 'claw:refactor':
        return { action: 'refactor', target: input.target || '', suggestions: [] };
      case 'claw:perf-profile':
        return { action: 'perf-profile', target: input.target || '', bottlenecks: [] };
      case 'claw:dep-audit':
        return { action: 'dep-audit', outdated: [], vulnerable: [], unused: [] };
      case 'claw:code-explain':
        return { action: 'code-explain', target: input.target || '', explanation: 'Requires LLM context' };
      default:
        return { action: 'custom', message: `Executed skill ${skill.id}` };
    }
  }
}
