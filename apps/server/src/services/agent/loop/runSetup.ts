// ============================================
// Agent Run Setup — Phase 0 & Phase -1
// Extracted from enhancedLoop.ts for <1000 LOC
// ============================================
import type Database from 'better-sqlite3';
import type { ProviderType } from '@personal-ide/shared';
import { getModel } from '@personal-ide/shared';
import { fetchProviderModels, getClientFromDb } from '../../llm/providers.js';
import { detectProjectStack } from '../../errors/detector.js';
import { CodebaseAnalyzer } from '../../analysis/codebase.js';
import { RelationshipIndexService } from '../../analysis/relationshipIndex.js';
import { LogBloatManager } from '../../analysis/logManager.js';
import { ProjectTierEngine } from '../../analysis/projectTierEngine.js';
import { listAllFiles } from '../../filesystem/index.js';
import { CodeIndexer } from '../codeIndexer.js';
import { detectPlatform, formatPlatformForLLM, type PlatformInfo } from '../platformDetector.js';
import { buildDepGraph, type DepGraph } from '../../analysis/depGraph.js';
import { clusterModules, type ClusterResult, type ModuleInfo } from '../../analysis/clustering/moduleClustering.js';
import { HierarchicalCodeIndex, type IndexStats } from '../indexer/hierarchicalIndex.js';
import { appConfig } from '../../../config.js';

export interface RunSetupResult {
  projectLanguages: string[];
  codebaseOverview: string;
  platformContext: string;
  platformInfo: PlatformInfo | null;
  relationshipContext: string;
  tierContext: string;
  logHealthContext: string;
  /** Dependency graph context for the LLM */
  depGraphContext: string;
  /** Module clustering context for the LLM */
  moduleClusterContext: string;
  /** Hierarchical index stats */
  hierarchicalIndexStats: IndexStats | null;
  /** Total code files found (for exploration gate) */
  totalCodeFiles: number;
  /** The actual context window after dynamic model discovery */
  resolvedContextWindow: number;
}

type EmitFn = (event: any) => void;

/**
 * Resolve the actual context window for a model.
 * For catalog models (GitHub), uses the known maxInputTokens.
 * For dynamic models (Ollama, Nano, etc.), queries the provider
 * to discover the real context size — prevents sending 128k tokens
 * to a 4k model.
 */
export async function resolveModelContextWindow(
  db: Database.Database,
  provider: ProviderType,
  model: string,
  configContextWindow: number | undefined,
  emit: EmitFn,
): Promise<number> {
  // 1. Check if the model is in our known catalog
  const catalogModel = getModel(model);
  if (catalogModel) {
    const modelMax = catalogModel.maxInputTokens;
    // Honor user override if within model bounds
    if (configContextWindow && configContextWindow > 0 && configContextWindow <= modelMax) {
      return configContextWindow;
    }
    return modelMax;
  }

  // 2. For dynamic models, try to discover the real context window from the provider
  const dynamicProviders: ProviderType[] = ['ollama', 'nano', 'groq', 'huggingface', 'mistral', 'together', 'openrouter', 'lmstudio'];
  if (dynamicProviders.includes(provider)) {
    try {
      const client = getClientFromDb(db, provider);
      if (client) {
        const models = await fetchProviderModels(client, provider);
        const match = models.find(m => m.id === model || m.providerId === model);
        if (match && match.contextWindow) {
          emit({ type: 'info', message: `Dynamic context discovery: ${model} → ${match.contextWindow} tokens` });
          // Honor user override within discovered bounds
          if (configContextWindow && configContextWindow > 0 && configContextWindow <= match.contextWindow) {
            return configContextWindow;
          }
          return match.contextWindow;
        }
      }
    } catch (err: any) {
      emit({ type: 'info', message: `Context discovery failed for ${provider}: ${err.message}. Using default.` });
    }
  }

  // 3. Fallback: use configurable default (env UNKNOWN_MODEL_CONTEXT, default 128k)
  const fallback = appConfig.contextDefaults.unknownModelContext;
  emit({ type: 'info', message: `Using default context window for ${model}: ${fallback} tokens` });
  if (configContextWindow && configContextWindow > 0 && configContextWindow <= fallback) {
    return configContextWindow;
  }
  return fallback;
}

/**
 * Run Phase 0 (environment analysis) and Phase -1 (knowledge graph & tier).
 * Extracts initialization logic from the main loop to keep it under 1000 LOC.
 */
export async function initializeRun(
  db: Database.Database,
  config: {
    projectRoot: string;
    analyzeCodebase: boolean;
  },
  contextWindow: number,
  services: {
    analyzer: CodebaseAnalyzer;
    relationshipIndex: RelationshipIndexService;
    logManager: LogBloatManager;
    tierEngine: ProjectTierEngine;
    codeIndexer: CodeIndexer;
    hierarchicalIndex: HierarchicalCodeIndex;
  },
  emit: EmitFn,
): Promise<RunSetupResult> {
  const result: RunSetupResult = {
    projectLanguages: [],
    codebaseOverview: '',
    platformContext: '',
    platformInfo: null,
    relationshipContext: '',
    tierContext: '',
    logHealthContext: '',
    depGraphContext: '',
    moduleClusterContext: '',
    hierarchicalIndexStats: null,
    totalCodeFiles: 0,
    resolvedContextWindow: contextWindow,
  };

  // ── Platform Detection ──
  try {
    result.platformInfo = detectPlatform();
    result.platformContext = formatPlatformForLLM(result.platformInfo);
    emit({
      type: 'info',
      message: `Host: ${result.platformInfo.hostOS} ${result.platformInfo.arch} | Runtimes: ${Object.keys(result.platformInfo.runtimes).join(', ')}`,
    });
  } catch (err: any) {
    emit({ type: 'info', message: 'Platform detection: ' + err.message });
  }

  // ── Project Stack Detection ──
  try {
    const stack = detectProjectStack(config.projectRoot);
    result.projectLanguages = [...new Set(stack.languages)];
    emit({ type: 'info', message: 'Detected languages: ' + result.projectLanguages.join(', ') });
    emit({ type: 'info', message: `Lint commands: ${stack.lintCommands.length}, Test commands: ${stack.testCommands.length}` });
  } catch {
    emit({ type: 'info', message: 'Could not detect project stack' });
  }

  // ── Codebase Analysis ──
  if (config.analyzeCodebase) {
    try {
      emit({ type: 'info', message: 'Building codebase overview...' });
      const projectId = config.projectRoot; // used as key
      const overview = services.analyzer.buildOverview(projectId, config.projectRoot);
      const overviewBudget = Math.floor(contextWindow * 0.15);
      result.codebaseOverview = services.analyzer.formatOverviewForLLM(overview, overviewBudget);
      emit({ type: 'info', message: `Codebase: ${overview.totalFiles} files, ${overview.totalLines} lines` });
    } catch (err: any) {
      emit({ type: 'info', message: 'Codebase analysis failed: ' + err.message });
    }
  }

  // ── Code Index ──
  try {
    emit({ type: 'info', message: 'Building code index for surgical editing...' });
    const codeIndex = services.codeIndexer.buildIndex(config.projectRoot);
    result.totalCodeFiles = codeIndex.totalFiles;
    emit({ type: 'info', message: `Code index: ${codeIndex.totalFiles} files indexed` });
  } catch (err: any) {
    emit({ type: 'info', message: 'Code indexer: ' + err.message });
  }

  // ── Hierarchical Code Index (v2) ──
  try {
    emit({ type: 'info', message: 'Building hierarchical code index...' });
    const hStats = services.hierarchicalIndex.buildIndex(config.projectRoot);
    result.hierarchicalIndexStats = hStats;
    result.totalCodeFiles = Math.max(result.totalCodeFiles, hStats.totalFiles);
    emit({
      type: 'info',
      message: `Hierarchical index: ${hStats.totalNodes} nodes, ${hStats.totalFiles} files, ~${hStats.totalTokens}tok, depth ${hStats.maxDepth}`,
    });
  } catch (err: any) {
    emit({ type: 'info', message: 'Hierarchical indexer: ' + err.message });
  }

  // ── Dependency Graph (wires orphaned depGraph module) ──
  try {
    const indexObj = services.codeIndexer.getIndex();
    if (indexObj && indexObj.files.length > 0) {
      const depFiles = indexObj.files.map(f => ({
        relativePath: f.relativePath,
        imports: f.imports,
      }));
      const depGraph = buildDepGraph(depFiles);
      result.depGraphContext = formatDepGraphForLLM(depGraph, Math.floor(contextWindow * 0.03));
      emit({
        type: 'info',
        message: `Dep graph: ${depGraph.nodes.size} nodes, ${depGraph.roots.length} entry points, ${depGraph.cycles.length} cycles`,
      });
    }
  } catch (err: any) {
    emit({ type: 'info', message: 'Dep graph: ' + err.message });
  }

  // ── Module Clustering (wires orphaned moduleClustering module) ──
  try {
    const indexObj = services.codeIndexer.getIndex();
    if (indexObj && indexObj.files.length > 0) {
      const modules: ModuleInfo[] = indexObj.files.map(f => ({
        path: f.relativePath,
        imports: f.imports,
        exports: f.exports,
        size: f.totalBytes,
        tokens: f.totalTokens,
      }));
      const clusters = clusterModules(modules);
      result.moduleClusterContext = formatClustersForLLM(clusters, Math.floor(contextWindow * 0.02));
      emit({
        type: 'info',
        message: `Module clusters: ${clusters.clusters.length} clusters, ${clusters.outliers.length} outliers`,
      });
    }
  } catch (err: any) {
    emit({ type: 'info', message: 'Module clustering: ' + err.message });
  }

  // ── Knowledge Graph ──
  const projectId = config.projectRoot;
  try {
    emit({ type: 'info', message: 'Building code relationship index...' });
    const files = listAllFiles(config.projectRoot);
    const scanResult = services.relationshipIndex.scanProject(projectId, config.projectRoot, files);
    result.relationshipContext = services.relationshipIndex.formatForLLM(
      projectId,
      Math.floor(contextWindow * 0.08),
    );
    emit({
      type: 'info',
      message: `Knowledge graph: ${scanResult.symbolCount} symbols, ${scanResult.relationshipCount} relationships, ${scanResult.conflictCount} conflicts`,
    });
  } catch (err: any) {
    emit({ type: 'info', message: 'Relationship index: ' + err.message });
  }

  // ── Tier Detection ──
  try {
    const tierConfig = services.tierEngine.detectTier(projectId, config.projectRoot);
    result.tierContext = services.tierEngine.formatForLLM(projectId);
    const gates = tierConfig.qualityGates
      ? Object.keys(tierConfig.qualityGates).filter(k => tierConfig.qualityGates[k]).join(', ')
      : 'none';
    emit({
      type: 'info',
      message: `Project tier: ${tierConfig.tier} | Language: ${tierConfig.primaryLanguage} | Quality gates: ${gates}`,
    });
  } catch (err: any) {
    emit({ type: 'info', message: 'Tier detection: ' + err.message });
  }

  // ── Log Compaction ──
  try {
    if (services.logManager.needsCompaction()) {
      emit({ type: 'info', message: 'Running log compaction...' });
      const compaction = await services.logManager.runCompaction();
      emit({
        type: 'info',
        message: `Compaction: ${compaction.rowsDeleted} rows deleted across ${compaction.tablesProcessed} tables`,
      });
    }
    result.logHealthContext = services.logManager.formatForLLM();
  } catch (err: any) {
    emit({ type: 'info', message: 'Log manager: ' + err.message });
  }

  return result;
}

// ── Formatting Helpers ──

function formatDepGraphForLLM(graph: DepGraph, budget: number): string {
  let output = `### Dependency Graph\n`;
  output += `Entry points: ${graph.roots.join(', ') || 'none detected'}\n`;

  if (graph.cycles.length > 0) {
    output += `⚠️ Circular dependencies (${graph.cycles.length}):\n`;
    for (const cycle of graph.cycles.slice(0, 5)) {
      output += `  ${cycle.join(' → ')} → [cycle]\n`;
    }
  }

  output += `\nDependency chains:\n`;
  const sorted = [...graph.nodes.entries()]
    .sort((a, b) => b[1].dependsOn.length - a[1].dependsOn.length);

  for (const [file, node] of sorted) {
    if (output.length > budget * 3.5) break;
    if (node.dependsOn.length > 0) {
      output += `  ${file} → [${node.dependsOn.join(', ')}]\n`;
    }
  }

  return output;
}

function formatClustersForLLM(result: ClusterResult, budget: number): string {
  let output = `### Module Clusters (${result.clusters.length} groups, ${result.outliers.length} outliers)\n`;

  for (const cluster of result.clusters) {
    if (output.length > budget * 3.5) break;
    output += `\n📦 ${cluster.name} (${cluster.members.length} files, cohesion: ${cluster.cohesion}):\n`;
    for (const member of cluster.members.slice(0, 10)) {
      output += `  - ${member}\n`;
    }
    if (cluster.members.length > 10) {
      output += `  ... and ${cluster.members.length - 10} more\n`;
    }
  }

  if (result.outliers.length > 0) {
    output += `\n🔹 Outliers: ${result.outliers.slice(0, 5).join(', ')}`;
    if (result.outliers.length > 5) output += ` (+${result.outliers.length - 5} more)`;
    output += '\n';
  }

  return output;
}
