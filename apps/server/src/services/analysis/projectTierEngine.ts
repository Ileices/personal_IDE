// ============================================
// Project Tier & Language Decision Engine
// Hardcoded tier system:
//   Prototype → Production → Enterprise → Global
// Automatic language selection, architecture
// pattern resolution, quality gate enforcement
// ============================================
import { v4 as uuid } from 'uuid';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import type Database from 'better-sqlite3';
import type {
  ProjectTier, ProjectTierConfig, LanguageDecision, ArchitecturePattern,
} from '@personal-ide/shared';

// ── Tier Definitions ──

interface TierSpec {
  tier: ProjectTier;
  /** Min lines of code to qualify */
  minLines: number;
  /** Max lines of code for this tier */
  maxLines: number;
  /** Min file count */
  minFiles: number;
  /** Required quality gates */
  requiredGates: string[];
  /** Recommended architecture patterns */
  architectures: ArchitecturePattern[];
  /** Description */
  description: string;
}

const TIER_SPECS: TierSpec[] = [
  {
    tier: 'prototype',
    minLines: 0, maxLines: 5_000, minFiles: 1,
    requiredGates: [],
    architectures: ['monolith'],
    description: 'Quick prototype, script, or proof of concept. No gates required.',
  },
  {
    tier: 'production',
    minLines: 1_000, maxLines: 100_000, minFiles: 5,
    requiredGates: ['lint', 'typecheck', 'tests'],
    architectures: ['monolith', 'modular_monolith', 'layered', 'component_based'],
    description: 'Production application. Requires linting, type checking, and test coverage.',
  },
  {
    tier: 'enterprise',
    minLines: 10_000, maxLines: 1_000_000, minFiles: 50,
    requiredGates: ['lint', 'typecheck', 'tests', 'security_audit', 'performance_benchmarks', 'documentation'],
    architectures: ['modular_monolith', 'microservices', 'hexagonal', 'cqrs', 'event_driven', 'monorepo'],
    description: 'Enterprise-scale software. Full quality gates, security, performance benchmarks.',
  },
  {
    tier: 'global',
    minLines: 100_000, maxLines: Infinity, minFiles: 200,
    requiredGates: ['lint', 'typecheck', 'tests', 'security_audit', 'performance_benchmarks', 'documentation', 'accessibility', 'i18n', 'disaster_recovery', 'compliance'],
    architectures: ['microservices', 'event_driven', 'cqrs', 'monorepo', 'serverless'],
    description: 'Global-scale, mission-critical systems (NASA probes, submarines, medical, financial). All gates mandatory.',
  },
];

// ── Language Decision Matrix ──

interface DomainLanguageRule {
  domain: string;
  keywords: string[];
  primaryLanguage: string;
  secondaryLanguages: string[];
  buildSystem: string;
  packageManager: string;
  testFramework: string;
  linter: string;
  formatter: string;
  architecture: ArchitecturePattern;
}

const DOMAIN_RULES: DomainLanguageRule[] = [
  // Web Frontend
  {
    domain: 'web-frontend', keywords: ['react', 'vue', 'svelte', 'angular', 'next', 'nuxt', 'astro', 'remix', 'gatsby'],
    primaryLanguage: 'TypeScript', secondaryLanguages: ['CSS', 'HTML'],
    buildSystem: 'vite', packageManager: 'pnpm', testFramework: 'vitest',
    linter: 'eslint', formatter: 'prettier', architecture: 'component_based',
  },
  // Web Backend (Node)
  {
    domain: 'web-backend-node', keywords: ['express', 'fastify', 'koa', 'hono', 'nest', 'node'],
    primaryLanguage: 'TypeScript', secondaryLanguages: ['SQL'],
    buildSystem: 'tsup', packageManager: 'pnpm', testFramework: 'vitest',
    linter: 'eslint', formatter: 'prettier', architecture: 'layered',
  },
  // Web Backend (Python)
  {
    domain: 'web-backend-python', keywords: ['django', 'flask', 'fastapi', 'starlette', 'tornado'],
    primaryLanguage: 'Python', secondaryLanguages: ['SQL'],
    buildSystem: 'setuptools', packageManager: 'uv', testFramework: 'pytest',
    linter: 'ruff', formatter: 'ruff', architecture: 'layered',
  },
  // Systems Programming
  {
    domain: 'systems', keywords: ['kernel', 'driver', 'firmware', 'embedded', 'os', 'bare-metal', 'rtos'],
    primaryLanguage: 'Rust', secondaryLanguages: ['C', 'Assembly'],
    buildSystem: 'cargo', packageManager: 'cargo', testFramework: 'cargo test',
    linter: 'clippy', formatter: 'rustfmt', architecture: 'modular_monolith',
  },
  // CLI Tools
  {
    domain: 'cli', keywords: ['cli', 'command-line', 'terminal', 'shell', 'repl'],
    primaryLanguage: 'Rust', secondaryLanguages: ['Go'],
    buildSystem: 'cargo', packageManager: 'cargo', testFramework: 'cargo test',
    linter: 'clippy', formatter: 'rustfmt', architecture: 'monolith',
  },
  // Data Science / ML
  {
    domain: 'data-science', keywords: ['pandas', 'numpy', 'scipy', 'scikit', 'tensorflow', 'pytorch', 'jupyter', 'kaggle', 'ml', 'deep-learning'],
    primaryLanguage: 'Python', secondaryLanguages: ['SQL', 'R'],
    buildSystem: 'setuptools', packageManager: 'uv', testFramework: 'pytest',
    linter: 'ruff', formatter: 'black', architecture: 'monolith',
  },
  // Game Development
  {
    domain: 'game-2d', keywords: ['phaser', 'pygame', 'love2d', 'pixi', 'gamemaker', 'rpg', 'platformer', 'arcade'],
    primaryLanguage: 'TypeScript', secondaryLanguages: ['GLSL'],
    buildSystem: 'vite', packageManager: 'pnpm', testFramework: 'vitest',
    linter: 'eslint', formatter: 'prettier', architecture: 'ecs',
  },
  {
    domain: 'game-3d', keywords: ['three', 'babylon', 'bevy', 'godot', 'unity', 'unreal', '3d', 'opengl', 'vulkan', 'webgpu'],
    primaryLanguage: 'Rust', secondaryLanguages: ['GLSL', 'WGSL'],
    buildSystem: 'cargo', packageManager: 'cargo', testFramework: 'cargo test',
    linter: 'clippy', formatter: 'rustfmt', architecture: 'ecs',
  },
  {
    domain: 'game-godot', keywords: ['gdscript', 'godot'],
    primaryLanguage: 'GDScript', secondaryLanguages: ['C#'],
    buildSystem: 'godot', packageManager: 'godot', testFramework: 'gut',
    linter: 'gdlint', formatter: 'gdformat', architecture: 'component_based',
  },
  {
    domain: 'game-unity', keywords: ['unity', 'monobehaviour', 'unityscript'],
    primaryLanguage: 'C#', secondaryLanguages: ['HLSL'],
    buildSystem: 'dotnet', packageManager: 'nuget', testFramework: 'nunit',
    linter: 'roslyn', formatter: 'dotnet-format', architecture: 'component_based',
  },
  // Mobile
  {
    domain: 'mobile-android', keywords: ['android', 'kotlin', 'jetpack', 'compose-android'],
    primaryLanguage: 'Kotlin', secondaryLanguages: ['XML'],
    buildSystem: 'gradle', packageManager: 'gradle', testFramework: 'junit',
    linter: 'ktlint', formatter: 'ktlint', architecture: 'layered',
  },
  {
    domain: 'mobile-ios', keywords: ['ios', 'swift', 'swiftui', 'uikit', 'xcode'],
    primaryLanguage: 'Swift', secondaryLanguages: ['Objective-C'],
    buildSystem: 'xcode', packageManager: 'swift-pm', testFramework: 'xctest',
    linter: 'swiftlint', formatter: 'swift-format', architecture: 'layered',
  },
  {
    domain: 'mobile-cross', keywords: ['flutter', 'react-native', 'expo', 'ionic', 'capacitor'],
    primaryLanguage: 'Dart', secondaryLanguages: ['TypeScript'],
    buildSystem: 'flutter', packageManager: 'pub', testFramework: 'flutter test',
    linter: 'dart-analyzer', formatter: 'dart-format', architecture: 'component_based',
  },
  // DevOps / Infrastructure
  {
    domain: 'devops', keywords: ['docker', 'kubernetes', 'k8s', 'terraform', 'ansible', 'ci', 'cd', 'pipeline', 'deployment'],
    primaryLanguage: 'Go', secondaryLanguages: ['Bash', 'YAML', 'HCL'],
    buildSystem: 'go', packageManager: 'go mod', testFramework: 'go test',
    linter: 'golangci-lint', formatter: 'gofmt', architecture: 'microservices',
  },
  // Blockchain / Web3
  {
    domain: 'blockchain', keywords: ['solidity', 'ethereum', 'web3', 'smart-contract', 'defi', 'nft'],
    primaryLanguage: 'Solidity', secondaryLanguages: ['TypeScript'],
    buildSystem: 'hardhat', packageManager: 'pnpm', testFramework: 'mocha',
    linter: 'solhint', formatter: 'prettier-plugin-solidity', architecture: 'modular_monolith',
  },
  // API / Microservices
  {
    domain: 'microservices', keywords: ['grpc', 'protobuf', 'microservice', 'service-mesh', 'api-gateway'],
    primaryLanguage: 'Go', secondaryLanguages: ['TypeScript', 'Protobuf'],
    buildSystem: 'go', packageManager: 'go mod', testFramework: 'go test',
    linter: 'golangci-lint', formatter: 'gofmt', architecture: 'microservices',
  },
  // Desktop Application
  {
    domain: 'desktop', keywords: ['electron', 'tauri', 'qt', 'gtk', 'wxwidgets', 'winui', 'wpf', 'maui'],
    primaryLanguage: 'Rust', secondaryLanguages: ['TypeScript', 'HTML', 'CSS'],
    buildSystem: 'cargo', packageManager: 'cargo', testFramework: 'cargo test',
    linter: 'clippy', formatter: 'rustfmt', architecture: 'layered',
  },
  // Scientific / HPC
  {
    domain: 'scientific', keywords: ['simulation', 'physics', 'numerical', 'hpc', 'mpi', 'openmp', 'cuda', 'submarine', 'aerospace', 'nasa', 'satellite', 'probe'],
    primaryLanguage: 'Rust', secondaryLanguages: ['C++', 'Python', 'Fortran'],
    buildSystem: 'cargo', packageManager: 'cargo', testFramework: 'cargo test',
    linter: 'clippy', formatter: 'rustfmt', architecture: 'modular_monolith',
  },
];

export class ProjectTierEngine {
  constructor(private db: Database.Database) {}

  /** Auto-detect the tier and language for a project */
  detectTier(projectId: string, rootPath: string): ProjectTierConfig {
    // Gather project metrics
    const metrics = this.gatherMetrics(rootPath);

    // Determine tier
    let tier: ProjectTier = 'prototype';
    for (const spec of TIER_SPECS) {
      if (metrics.totalLines >= spec.minLines && metrics.totalFiles >= spec.minFiles) {
        tier = spec.tier;
      }
    }

    // Determine domain and language
    const decision = this.decideLanguage(rootPath, metrics);
    const tierSpec = TIER_SPECS.find(s => s.tier === tier)!;

    // Select architecture (prefer what matches existing project)
    const architecture = metrics.existingArchitecture || decision.architecture;

    const config: ProjectTierConfig = {
      id: uuid(),
      projectId,
      tier,
      primaryLanguage: metrics.existingPrimaryLanguage || decision.primaryLanguage,
      architecturePattern: architecture,
      targetPlatforms: metrics.detectedPlatforms,
      qualityGates: this.buildQualityGates(tierSpec),
      autoDetected: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Store in DB
    this.db.prepare(`
      INSERT OR REPLACE INTO project_tier_config (id, project_id, tier, primary_language, architecture_pattern, target_platforms, quality_gates, auto_detected, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      config.id, projectId, config.tier, config.primaryLanguage,
      config.architecturePattern, JSON.stringify(config.targetPlatforms),
      JSON.stringify(config.qualityGates), config.autoDetected ? 1 : 0
    );

    return config;
  }

  /** Get the current tier config for a project */
  getTierConfig(projectId: string): ProjectTierConfig | null {
    const row = this.db.prepare('SELECT * FROM project_tier_config WHERE project_id = ?').get(projectId) as any;
    if (!row) return null;

    return {
      id: row.id,
      projectId: row.project_id,
      tier: row.tier,
      primaryLanguage: row.primary_language,
      architecturePattern: row.architecture_pattern,
      targetPlatforms: JSON.parse(row.target_platforms || '[]'),
      qualityGates: JSON.parse(row.quality_gates || '{}'),
      autoDetected: !!row.auto_detected,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** Manually set a project's tier */
  setTier(projectId: string, tier: ProjectTier): void {
    const existing = this.getTierConfig(projectId);
    if (existing) {
      const tierSpec = TIER_SPECS.find(s => s.tier === tier)!;
      this.db.prepare(`
        UPDATE project_tier_config SET tier = ?, quality_gates = ?, auto_detected = 0, updated_at = datetime('now')
        WHERE project_id = ?
      `).run(tier, JSON.stringify(this.buildQualityGates(tierSpec)), projectId);
    } else {
      this.db.prepare(`
        INSERT INTO project_tier_config (id, project_id, tier, primary_language, architecture_pattern, target_platforms, quality_gates, auto_detected, created_at, updated_at)
        VALUES (?, ?, ?, '', '', '[]', ?, 0, datetime('now'), datetime('now'))
      `).run(uuid(), projectId, tier, JSON.stringify(this.buildQualityGates(TIER_SPECS.find(s => s.tier === tier)!)));
    }
  }

  /** Get language decision for a domain/task description */
  decideLanguageFromTask(taskDescription: string): LanguageDecision {
    const taskLower = taskDescription.toLowerCase();

    // Match against domain rules
    for (const rule of DOMAIN_RULES) {
      const matchScore = rule.keywords.reduce((score, kw) => {
        return score + (taskLower.includes(kw) ? 1 : 0);
      }, 0);

      if (matchScore > 0) {
        return {
          primaryLanguage: rule.primaryLanguage,
          secondaryLanguages: rule.secondaryLanguages,
          buildSystem: rule.buildSystem,
          packageManager: rule.packageManager,
          testFramework: rule.testFramework,
          linter: rule.linter,
          formatter: rule.formatter,
          architecture: rule.architecture,
          reasoning: `Domain match: ${rule.domain} (${matchScore} keyword hits: ${rule.keywords.filter(kw => taskLower.includes(kw)).join(', ')})`,
        };
      }
    }

    // Default: TypeScript web stack
    return {
      primaryLanguage: 'TypeScript',
      secondaryLanguages: ['CSS', 'HTML'],
      buildSystem: 'vite',
      packageManager: 'pnpm',
      testFramework: 'vitest',
      linter: 'eslint',
      formatter: 'prettier',
      architecture: 'monolith',
      reasoning: 'Default web stack — no specific domain detected',
    };
  }

  /** Format tier config for LLM context */
  formatForLLM(projectId: string): string {
    const config = this.getTierConfig(projectId);
    if (!config) return '';

    const tierSpec = TIER_SPECS.find(s => s.tier === config.tier)!;

    const lines = [
      '## PROJECT TIER',
      `**Tier**: ${config.tier.toUpperCase()} — ${tierSpec.description}`,
      `**Language**: ${config.primaryLanguage}`,
      `**Architecture**: ${config.architecturePattern}`,
      `**Platforms**: ${config.targetPlatforms.join(', ') || 'unspecified'}`,
      '',
      '### Quality Gates:',
      ...Object.entries(config.qualityGates).map(([gate, required]) =>
        `  ${required ? '✅' : '⬜'} ${gate}`
      ),
      '',
      '### Tier Rules:',
      `  - Max scale: ${tierSpec.maxLines === Infinity ? 'unlimited' : tierSpec.maxLines.toLocaleString()} lines`,
      `  - Min files: ${tierSpec.minFiles}`,
      `  - Required gates: ${tierSpec.requiredGates.join(', ') || 'none'}`,
    ];

    return lines.join('\n');
  }

  // ── Private Helpers ──

  private gatherMetrics(rootPath: string): {
    totalFiles: number;
    totalLines: number;
    existingPrimaryLanguage: string;
    existingArchitecture: string;
    detectedPlatforms: string[];
    languageDistribution: Record<string, number>;
    dependencies: string[];
  } {
    const langLines: Record<string, number> = {};
    let totalFiles = 0;
    let totalLines = 0;
    const dependencies: string[] = [];
    const detectedPlatforms: string[] = [];

    // Scan files
    const IGNORED = new Set(['node_modules', '.git', 'dist', 'build', 'target', '__pycache__', '.next', '.venv', 'vendor']);

    function walk(dir: string): void {
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (IGNORED.has(entry.name) || entry.name.startsWith('.')) continue;
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else {
            const ext = extname(entry.name).toLowerCase();
            const LANG_MAP: Record<string, string> = {
              '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.jsx': 'JavaScript',
              '.py': 'Python', '.rs': 'Rust', '.go': 'Go', '.java': 'Java', '.cs': 'C#',
              '.cpp': 'C++', '.c': 'C', '.h': 'C/C++', '.swift': 'Swift', '.kt': 'Kotlin',
              '.rb': 'Ruby', '.php': 'PHP', '.lua': 'Lua', '.dart': 'Dart', '.scala': 'Scala',
              '.ex': 'Elixir', '.hs': 'Haskell', '.zig': 'Zig', '.gd': 'GDScript',
              '.sol': 'Solidity', '.nim': 'Nim',
            };
            const lang = LANG_MAP[ext];
            if (lang) {
              totalFiles++;
              try {
                const content = readFileSync(fullPath, 'utf8');
                const lines = content.split('\n').length;
                totalLines += lines;
                langLines[lang] = (langLines[lang] || 0) + lines;
              } catch { /* skip unreadable */ }
            }
          }
        }
      } catch { /* ignore */ }
    }

    walk(rootPath);

    // Detect dependencies
    try {
      if (existsSync(join(rootPath, 'package.json'))) {
        const pkg = JSON.parse(readFileSync(join(rootPath, 'package.json'), 'utf8'));
        dependencies.push(...Object.keys(pkg.dependencies || {}));
        dependencies.push(...Object.keys(pkg.devDependencies || {}));
      }
    } catch { /* ignore */ }
    try {
      if (existsSync(join(rootPath, 'Cargo.toml'))) {
        const cargo = readFileSync(join(rootPath, 'Cargo.toml'), 'utf8');
        const depSection = cargo.match(/\[dependencies\]([\s\S]*?)(?:\[|$)/);
        if (depSection) {
          dependencies.push(...depSection[1].split('\n').filter(l => l.includes('=')).map(l => l.split('=')[0].trim()));
        }
      }
    } catch { /* ignore */ }

    // Detect platforms
    if (dependencies.some(d => /electron|tauri/i.test(d))) detectedPlatforms.push('desktop');
    if (dependencies.some(d => /react-native|expo|flutter/i.test(d))) detectedPlatforms.push('mobile');
    if (dependencies.some(d => /react|vue|svelte|next|angular/i.test(d))) detectedPlatforms.push('web');
    if (existsSync(join(rootPath, 'Dockerfile'))) detectedPlatforms.push('docker');

    // Detect architecture
    let existingArchitecture = '';
    if (existsSync(join(rootPath, 'pnpm-workspace.yaml')) || existsSync(join(rootPath, 'lerna.json'))) {
      existingArchitecture = 'monorepo';
    } else if (existsSync(join(rootPath, 'docker-compose.yml')) || existsSync(join(rootPath, 'docker-compose.yaml'))) {
      existingArchitecture = 'microservices';
    }

    // Find primary language
    const sortedLangs = Object.entries(langLines).sort((a, b) => b[1] - a[1]);
    const existingPrimaryLanguage = sortedLangs[0]?.[0] || '';

    return {
      totalFiles, totalLines, existingPrimaryLanguage, existingArchitecture,
      detectedPlatforms, languageDistribution: langLines, dependencies,
    };
  }

  private decideLanguage(rootPath: string, metrics: ReturnType<typeof this.gatherMetrics>): LanguageDecision {
    // Check if existing project has a clear language
    if (metrics.existingPrimaryLanguage) {
      // Find a matching domain rule for existing deps
      for (const rule of DOMAIN_RULES) {
        if (rule.primaryLanguage === metrics.existingPrimaryLanguage) {
          const depMatch = rule.keywords.some(kw => metrics.dependencies.some(d => d.toLowerCase().includes(kw)));
          if (depMatch) {
            return {
              primaryLanguage: rule.primaryLanguage,
              secondaryLanguages: rule.secondaryLanguages,
              buildSystem: rule.buildSystem,
              packageManager: rule.packageManager,
              testFramework: rule.testFramework,
              linter: rule.linter,
              formatter: rule.formatter,
              architecture: rule.architecture,
              reasoning: `Matched existing project: ${metrics.existingPrimaryLanguage} with ${rule.domain} domain`,
            };
          }
        }
      }

      // Fallback: return existing language with defaults
      return {
        primaryLanguage: metrics.existingPrimaryLanguage,
        secondaryLanguages: [],
        buildSystem: 'default',
        packageManager: 'default',
        testFramework: 'default',
        linter: 'default',
        formatter: 'default',
        architecture: (metrics.existingArchitecture as ArchitecturePattern) || 'monolith',
        reasoning: `Using existing project language: ${metrics.existingPrimaryLanguage}`,
      };
    }

    // No existing language — default to TypeScript web stack
    return {
      primaryLanguage: 'TypeScript',
      secondaryLanguages: ['CSS', 'HTML'],
      buildSystem: 'vite',
      packageManager: 'pnpm',
      testFramework: 'vitest',
      linter: 'eslint',
      formatter: 'prettier',
      architecture: 'monolith',
      reasoning: 'New project — defaulting to TypeScript web stack',
    };
  }

  private buildQualityGates(tierSpec: TierSpec): Record<string, boolean> {
    const allGates = [
      'lint', 'typecheck', 'tests', 'security_audit', 'performance_benchmarks',
      'documentation', 'accessibility', 'i18n', 'disaster_recovery', 'compliance',
    ];
    const gates: Record<string, boolean> = {};
    for (const gate of allGates) {
      gates[gate] = tierSpec.requiredGates.includes(gate);
    }
    return gates;
  }
}
