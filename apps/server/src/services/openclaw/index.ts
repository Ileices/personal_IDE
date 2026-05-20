// ============================================
// OpenClaw Integration Service
// Connects the IDE to the OpenClaw skill ecosystem.
// Skills = community-built AI tool functions.
// ============================================
import { readFile } from 'fs/promises';

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

interface OpenClawRequestData {
  [key: string]: any;
}

interface OpenClawResponseData {
  [key: string]: any;
}

interface SkillRunOutcome {
  output: Record<string, any> | null;
  success: boolean;
  error?: string;
}

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
    const normalizedSource = source.trim();
    if (!normalizedSource) {
      throw new Error('Skill source cannot be empty');
    }

    const existing = [...this.skills.values()].find((skill) =>
      skill.id === normalizedSource
      || skill.source === normalizedSource
      || skill.name.toLowerCase() === normalizedSource.toLowerCase()
    );
    if (existing) return existing;

    const manifest = await this.loadSkillManifest(normalizedSource);
    const installed = this.skillFromManifest(manifest, normalizedSource);

    const duplicateById = this.skills.get(installed.id);
    if (duplicateById) return duplicateById;

    this.skills.set(installed.id, installed);
    return installed;
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
      const outcome = await this.runSkill(skill, input);
      const exec: SkillExecution = {
        skillId,
        input,
        output: outcome.output,
        success: outcome.success,
        durationMs: Date.now() - start,
        ...(outcome.error ? { error: outcome.error } : {}),
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
  ): Promise<SkillRunOutcome> {
    if (skill.source !== 'builtin') {
      const fallbackByCategory: Partial<Record<(typeof SKILL_CATEGORIES)[number], string>> = {
        'code-analysis': 'claw:lint-fix',
        testing: 'claw:test-gen',
        documentation: 'claw:doc-gen',
        security: 'claw:security-scan',
        performance: 'claw:perf-profile',
        refactoring: 'claw:refactor',
      };

      const fallbackSkillId = fallbackByCategory[skill.category as (typeof SKILL_CATEGORIES)[number]];
      if (fallbackSkillId) {
        const fallbackSkill = this.skills.get(fallbackSkillId);
        if (fallbackSkill) {
          const fallbackResult = await this.runSkill(fallbackSkill, input);
          return {
            output: {
              action: 'external-skill-fallback',
              skill: skill.id,
              fallbackSkillId,
              fallbackOutput: fallbackResult.output,
            },
            success: fallbackResult.success,
            ...(fallbackResult.error ? { error: fallbackResult.error } : {}),
          };
        }
      }

      return {
        output: {
          action: 'custom',
          skill: skill.id,
          status: 'unsupported',
          message: 'External skill runner is not configured.',
        },
        success: false,
        error: 'External skill runner is not configured.',
      };
    }

    const sourceText = this.extractTextInput(input);

    switch (skill.id) {
      case 'claw:lint-fix':
        if (!sourceText) {
          return {
            output: {
              action: 'lint',
              status: 'missing-input',
              message: 'Provide input.code, input.content, or input.text to run static lint checks.',
            },
            success: false,
            error: 'Missing code/content input for lint checks.',
          };
        }

        {
          const lines = sourceText.split(/\r?\n/);
          const findings: Array<{ rule: string; severity: 'low' | 'medium'; line: number; message: string }> = [];

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (/\s+$/.test(line)) {
              findings.push({ rule: 'no-trailing-spaces', severity: 'low', line: i + 1, message: 'Trailing whitespace detected.' });
            }
            if (/\t/.test(line)) {
              findings.push({ rule: 'no-tabs', severity: 'low', line: i + 1, message: 'Tab indentation detected.' });
            }
            if (/\bconsole\.log\s*\(/.test(line)) {
              findings.push({ rule: 'no-console-log', severity: 'medium', line: i + 1, message: 'console.log found in source.' });
            }
            if (/==[^=]/.test(line)) {
              findings.push({ rule: 'eqeqeq', severity: 'medium', line: i + 1, message: 'Loose equality detected; prefer ===.' });
            }
            if (findings.length >= 50) break;
          }

          const fixedLines = lines.map((line) => line.replace(/\s+$/g, ''));
          const fixedCode = fixedLines.join('\n');
          const hasFixes = fixedCode !== sourceText;

          return {
            output: {
              action: 'lint',
              files: Array.isArray(input.files) ? input.files : [],
              findings,
              fixesAvailable: hasFixes,
              fixedCode: input.applyFixes ? fixedCode : undefined,
              suggestedCommand: 'pnpm lint --fix',
              message: findings.length
                ? `Detected ${findings.length} lint issue(s) via static checks.`
                : 'No lint issues detected by static checks.',
            },
            success: true,
          };
        }
      case 'claw:test-gen':
        if (!sourceText) {
          return {
            output: {
              action: 'test-gen',
              status: 'missing-input',
              message: 'Provide input.code, input.content, or input.text to generate test scaffolds.',
            },
            success: false,
            error: 'Missing code/content input for test generation.',
          };
        }

        {
          const names = this.extractTopLevelFunctionNames(sourceText).slice(0, 6);
          const framework = typeof input.framework === 'string' && input.framework.trim()
            ? input.framework.trim().toLowerCase()
            : 'vitest';
          const tests = (names.length ? names : ['subjectUnderTest']).map((name) => this.buildTestScaffold(name, framework));

          return {
            output: {
              action: 'test-gen',
              target: input.target || '',
              framework,
              tests,
              message: `Generated ${tests.length} deterministic test scaffold(s).`,
            },
            success: true,
          };
        }
      case 'claw:doc-gen':
        if (!sourceText) {
          return {
            output: {
              action: 'doc-gen',
              status: 'missing-input',
              message: 'Provide input.code, input.content, or input.text to generate doc templates.',
            },
            success: false,
            error: 'Missing code/content input for documentation generation.',
          };
        }

        {
          const symbols = this.extractTopLevelFunctionNames(sourceText).slice(0, 8);
          const docs = (symbols.length ? symbols : ['symbol']).map((symbol) => ({
            symbol,
            doc: [
              '/**',
              ` * ${symbol}`,
              ' *',
              ' * Describe what this function does and the guarantees it provides.',
              ' * @param args Input parameters.',
              ' * @returns Result value.',
              ' */',
            ].join('\n'),
          }));

          return {
            output: {
              action: 'doc-gen',
              target: input.target || '',
              docs,
              message: `Generated ${docs.length} deterministic documentation template(s).`,
            },
            success: true,
          };
        }
      case 'claw:security-scan':
        if (!sourceText) {
          return {
            output: {
              action: 'security-scan',
              status: 'missing-input',
              message: 'Provide input.code, input.content, or input.text to run static scan heuristics.',
            },
            success: false,
            error: 'Missing code/content input for security scan.',
          };
        }

        {
          const patterns = [
            { id: 'dynamic-eval', regex: /\beval\s*\(/, severity: 'high', message: 'Avoid eval() on runtime strings.' },
            { id: 'child-process-shell', regex: /\bexec\s*\(/, severity: 'medium', message: 'Check command injection risks for exec().' },
            { id: 'inner-html', regex: /\.innerHTML\s*=|dangerouslySetInnerHTML/, severity: 'medium', message: 'Review XSS risk when injecting HTML.' },
            { id: 'weak-random', regex: /Math\.random\s*\(/, severity: 'low', message: 'Use crypto-strength randomness for security-sensitive tokens.' },
          ];
          const findings = patterns
            .filter((rule) => rule.regex.test(sourceText))
            .map((rule) => ({ id: rule.id, severity: rule.severity, message: rule.message }));
          const score = Math.max(0, 100 - findings.length * 20);

          return {
            output: {
              action: 'security-scan',
              findings,
              score,
              scanned_chars: sourceText.length,
              files: Array.isArray(input.files) ? input.files : [],
            },
            success: true,
          };
        }
      case 'claw:refactor':
        if (!sourceText) {
          return {
            output: {
              action: 'refactor',
              status: 'missing-input',
              message: 'Provide input.code, input.content, or input.text to generate static refactor hints.',
            },
            success: false,
            error: 'Missing code/content input for refactor hints.',
          };
        }

        {
          const suggestions: string[] = [];
          const lineCount = sourceText.split(/\r?\n/).length;
          if (lineCount > 120) {
            suggestions.push('Large block detected; consider extracting smaller helper functions.');
          }
          if (/(for|while)\s*\([\s\S]{0,240}(for|while)\s*\(/m.test(sourceText)) {
            suggestions.push('Nested loops detected; review for algorithmic simplification or indexed lookup maps.');
          }
          if (/==[^=]/.test(sourceText)) {
            suggestions.push('Loose equality found; prefer strict equality (===) unless coercion is intentional.');
          }
          if (/function\s+[A-Za-z0-9_]+\s*\([^)]{120,}\)/.test(sourceText)) {
            suggestions.push('Function signature appears wide; consider grouping params into a config object.');
          }

          return {
            output: {
              action: 'refactor',
              target: input.target || '',
              suggestions,
              metrics: { lineCount },
              message: suggestions.length
                ? 'Potential refactor opportunities detected by static heuristics.'
                : 'No obvious refactor opportunities found by static heuristics.',
            },
            success: true,
          };
        }
      case 'claw:perf-profile':
        if (!sourceText) {
          return {
            output: {
              action: 'perf-profile',
              status: 'missing-input',
              message: 'Provide input.code, input.content, or input.text to run static perf heuristics.',
            },
            success: false,
            error: 'Missing code/content input for performance profile.',
          };
        }

        {
          const bottlenecks: string[] = [];
          if (/(for|while)\s*\([\s\S]{0,240}(for|while)\s*\(/m.test(sourceText)) {
            bottlenecks.push('Nested loops may cause O(n^2)+ behavior on large collections.');
          }
          if (/\bfs\.(readFileSync|writeFileSync|readdirSync|statSync)\b/.test(sourceText)) {
            bottlenecks.push('Synchronous filesystem calls can block the event loop.');
          }
          if (/JSON\.parse\s*\([^)]{500,}\)/.test(sourceText)) {
            bottlenecks.push('Large inline JSON parse detected; consider streaming or chunking.');
          }

          return {
            output: {
              action: 'perf-profile',
              target: input.target || '',
              bottlenecks,
              message: bottlenecks.length
                ? 'Potential performance bottlenecks detected by static heuristics.'
                : 'No obvious bottlenecks detected by static heuristics.',
            },
            success: true,
          };
        }
      case 'claw:dep-audit':
        {
          const dependencies = this.normalizeDependencies(input.dependencies);
          if (dependencies.length === 0) {
            return {
              output: {
                action: 'dep-audit',
                status: 'missing-input',
                message: 'Provide input.dependencies as an object or array to audit versions.',
              },
              success: false,
              error: 'Missing dependencies input for dependency audit.',
            };
          }

          const outdated = dependencies.filter((dep) => dep.version.startsWith('0.') || /[\^~*]/.test(dep.version));
          const riskyVersionRanges = dependencies.filter((dep) => /(alpha|beta|rc)/i.test(dep.version));

          return {
            output: {
              action: 'dep-audit',
              analyzed: dependencies.length,
              outdated,
              riskyVersionRanges,
              vulnerable: [],
              unused: [],
              note: 'Static version-shape audit only; no vulnerability feed is queried.',
            },
            success: true,
          };
        }
      case 'claw:code-explain':
        if (!sourceText) {
          return {
            output: {
              action: 'code-explain',
              status: 'missing-input',
              message: 'Provide input.code, input.content, or input.text for deterministic explanation.',
            },
            success: false,
            error: 'Missing code/content input for code explanation.',
          };
        }

        {
          const lineCount = sourceText.split(/\r?\n/).length;
          const importCount = (sourceText.match(/\bimport\b/g) || []).length;
          const functionCount = (sourceText.match(/\bfunction\b|=>/g) || []).length;
          const classCount = (sourceText.match(/\bclass\s+[A-Za-z0-9_]+/g) || []).length;
          const complexityHints: string[] = [];

          if (lineCount > 120) complexityHints.push('Large snippet size may indicate mixed responsibilities.');
          if ((sourceText.match(/\bif\b/g) || []).length > 10) complexityHints.push('High branch count detected; review readability.');
          if ((sourceText.match(/try\s*\{/g) || []).length > 3) complexityHints.push('Multiple error boundaries present; verify fallback paths.');

          return {
            output: {
              action: 'code-explain',
              target: input.target || '',
              explanation: `Snippet has ${lineCount} lines with ${classCount} class declarations, ${functionCount} function-like declarations, and ${importCount} imports.`,
              summary: {
                lineCount,
                importCount,
                functionCount,
                classCount,
              },
              hints: complexityHints,
            },
            success: true,
          };
        }
      default:
        return {
          output: {
            action: 'custom',
            skill: skill.id,
            status: 'unsupported',
            message: `No runtime handler is registered for ${skill.id}.`,
          },
          success: false,
          error: `No runtime handler is registered for ${skill.id}.`,
        };
    }
  }

  private async loadSkillManifest(source: string): Promise<Record<string, any>> {
    const isHttp = /^https?:\/\//i.test(source);
    let raw = '';

    if (isHttp) {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`Failed to fetch skill manifest: HTTP ${response.status}`);
      }
      raw = await response.text();
    } else {
      raw = await readFile(source, 'utf8');
    }

    try {
      return JSON.parse(raw) as Record<string, any>;
    } catch {
      throw new Error('Skill manifest must be valid JSON.');
    }
  }

  private skillFromManifest(manifest: Record<string, any>, source: string): ClawSkill {
    const id = typeof manifest.id === 'string' && manifest.id.trim()
      ? manifest.id.trim()
      : '';
    const name = typeof manifest.name === 'string' && manifest.name.trim()
      ? manifest.name.trim()
      : '';
    const description = typeof manifest.description === 'string'
      ? manifest.description.trim()
      : '';
    const author = typeof manifest.author === 'string' && manifest.author.trim()
      ? manifest.author.trim()
      : 'unknown';
    const version = typeof manifest.version === 'string' && manifest.version.trim()
      ? manifest.version.trim()
      : '1.0.0';
    const category = typeof manifest.category === 'string' && SKILL_CATEGORIES.includes(manifest.category as any)
      ? manifest.category
      : 'generation';
    const tags = Array.isArray(manifest.tags)
      ? manifest.tags.filter((tag) => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean)
      : [];

    if (!id || !name || !description) {
      throw new Error('Skill manifest must include non-empty id, name, and description fields.');
    }

    return {
      id,
      name,
      description,
      author,
      version,
      category,
      tags,
      installed: true,
      source,
    };
  }

  private extractTopLevelFunctionNames(sourceText: string): string[] {
    const names = new Set<string>();
    const patterns = [
      /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
      /(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
      /(?:export\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    ];

    for (const pattern of patterns) {
      for (const match of sourceText.matchAll(pattern)) {
        if (match[1]) names.add(match[1]);
      }
    }

    return [...names];
  }

  private buildTestScaffold(name: string, framework: string): string {
    if (framework === 'jest') {
      return [
        `describe('${name}', () => {`,
        `  it('returns expected output for valid input', () => {`,
        `    // TODO: replace with realistic input/output assertions`,
        `    expect(typeof ${name}).toBe('function');`,
        '  });',
        '});',
      ].join('\n');
    }

    return [
      `import { describe, it, expect } from 'vitest';`,
      '',
      `describe('${name}', () => {`,
      `  it('returns expected output for valid input', () => {`,
      `    // TODO: replace with realistic input/output assertions`,
      `    expect(typeof ${name}).toBe('function');`,
      '  });',
      '});',
    ].join('\n');
  }

  private extractTextInput(input: Record<string, any>): string {
    const candidates = [input.code, input.content, input.text, input.snippet];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }
    return '';
  }

  private normalizeDependencies(input: unknown): Array<{ name: string; version: string }> {
    if (!input) return [];

    if (Array.isArray(input)) {
      return input
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null;
          const obj = entry as Record<string, unknown>;
          const name = typeof obj.name === 'string' ? obj.name : '';
          const version = typeof obj.version === 'string' ? obj.version : '';
          if (!name || !version) return null;
          return { name, version };
        })
        .filter((entry): entry is { name: string; version: string } => Boolean(entry));
    }

    if (typeof input === 'object') {
      return Object.entries(input as Record<string, unknown>)
        .filter(([, version]) => typeof version === 'string')
        .map(([name, version]) => ({ name, version: String(version) }));
    }

    return [];
  }
}
