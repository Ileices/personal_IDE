// ============================================
// Exploration Gate — Forces the agent to READ
// and UNDERSTAND the existing codebase before
// writing any code. This prevents the critical
// bug where the agent builds disconnected
// projects with 46+ redundant files and 5
// contradictory architectures.
//
// Behavior:
//   Iteration 1 (projects with >3 code files):
//     → Replace user task with mandatory exploration prompt
//     → Agent must read key files and produce architecture summary
//     → Block file writes on this iteration (via response filter)
//
//   Iteration 2+:
//     → Inject the architecture summary into context
//     → Allow normal operation
//
// The architecture summary is stored as a
// high-importance memory note for persistence.
// ============================================
import type { MemoryService } from '../../memory/index.js';
import type { HierarchicalCodeIndex } from '../indexer/hierarchicalIndex.js';

// ── Types ──

export interface ExplorationContext {
  /** The exploration prompt that replaces the user task on iteration 1 */
  explorationPrompt: string | null;
  /** Architecture summary from exploration (available on iteration 2+) */
  architectureSummary: string | null;
  /** Whether file writes should be blocked this iteration */
  blockWrites: boolean;
}

export interface ExplorationGateConfig {
  /** Minimum number of existing code files to trigger exploration (default: 3) */
  minFilesForExploration: number;
  /** Maximum number of files to trigger hard write block (default: 10) */
  hardBlockThreshold: number;
}

const DEFAULT_CONFIG: ExplorationGateConfig = {
  minFilesForExploration: 3,
  hardBlockThreshold: 10,
};

const EXPLORATION_CATEGORY = 'architecture_scan';
const EXPLORATION_IMPORTANCE = 95; // high importance — survives memory eviction

// ── Public API ──

/**
 * Check if the exploration gate should activate.
 * On iteration 1 for existing codebases, this replaces the user task
 * with a mandatory codebase exploration prompt.
 */
export function checkExplorationGate(params: {
  currentIteration: number;
  totalCodeFiles: number;
  projectRoot: string;
  projectId: string;
  userTask: string;
  codeIndex: HierarchicalCodeIndex | null;
  memory: MemoryService;
  config?: Partial<ExplorationGateConfig>;
}): ExplorationContext {
  const cfg = { ...DEFAULT_CONFIG, ...params.config };

  // ── Iteration 1: Force exploration if enough existing files ──
  if (params.currentIteration === 1 && params.totalCodeFiles >= cfg.minFilesForExploration) {
    const indexOverview = params.codeIndex
      ? params.codeIndex.formatAtDepth(2000) // 2000 token budget for exploration overview
      : `${params.totalCodeFiles} code files detected`;

    const explorationPrompt = buildExplorationPrompt(
      params.userTask,
      indexOverview,
      params.totalCodeFiles,
    );

    return {
      explorationPrompt,
      architectureSummary: null,
      blockWrites: params.totalCodeFiles >= cfg.hardBlockThreshold,
    };
  }

  // ── Iteration 2+: Inject stored architecture summary ──
  const summary = getStoredArchitectureSummary(params.memory, params.projectId);
  return {
    explorationPrompt: null,
    architectureSummary: summary,
    blockWrites: false,
  };
}

/**
 * Store the architecture summary from the agent's exploration response.
 * Called after iteration 1 completes, extracting the summary from
 * the structured output.
 */
export function storeArchitectureSummary(
  memory: MemoryService,
  projectId: string,
  conversationId: string,
  summary: string,
): void {
  if (!summary || summary.length < 20) return;

  try {
    memory.addNote(projectId, {
      projectId,
      source: 'agent_log',
      category: EXPLORATION_CATEGORY,
      title: 'Architecture scan: ' + summary.slice(0, 80),
      content: summary,
      importance: EXPLORATION_IMPORTANCE,
      tags: ['architecture', 'exploration'],
      relatedFiles: [],
      conversationId,
    });
  } catch { /* non-critical */ }
}

/**
 * Extract architecture summary from agent's response content.
 * Looks for a structured architecture block in the response.
 */
export function extractArchitectureSummary(responseContent: string): string | null {
  // Look for explicit architecture markers
  const markers = [
    /ARCHITECTURE SUMMARY[:\s]*\n([\s\S]+?)(?=\n---|\n```|$)/i,
    /CODEBASE UNDERSTANDING[:\s]*\n([\s\S]+?)(?=\n---|\n```|$)/i,
    /PROJECT ANALYSIS[:\s]*\n([\s\S]+?)(?=\n---|\n```|$)/i,
  ];

  for (const marker of markers) {
    const match = responseContent.match(marker);
    if (match && match[1].trim().length > 30) {
      return match[1].trim().slice(0, 2000);
    }
  }

  // Fallback: use the structured output summary if it's long enough
  const jsonMatch = responseContent.match(/```json:structured_output\s*\n([\s\S]+?)\n```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.summary && parsed.summary.length > 50) {
        return parsed.summary.slice(0, 2000);
      }
    } catch { /* not valid JSON */ }
  }

  return null;
}

/**
 * Filter file writes during exploration mode.
 * If blockWrites is true, return only read actions from the structured output.
 */
export function filterWritesDuringExploration(
  fileChanges: { path: string; content: string }[],
  blockWrites: boolean,
): { path: string; content: string }[] {
  if (!blockWrites) return fileChanges;

  // During exploration, allow creating documentation files but not code files
  const CODE_EXTENSIONS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.kt',
    '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.swift', '.dart',
  ]);

  return fileChanges.filter(change => {
    const ext = change.path.match(/\.[^.]+$/)?.[0]?.toLowerCase();
    return ext && !CODE_EXTENSIONS.has(ext);
  });
}

// ── Private ──

function buildExplorationPrompt(
  originalTask: string,
  indexOverview: string,
  totalFiles: number,
): string {
  return `## ⚠️ MANDATORY CODEBASE EXPLORATION — READ BEFORE WRITING ⚠️

You have been given a task to work on an EXISTING codebase with ${totalFiles} code files.
**Before writing ANY code, you MUST first understand the existing architecture.**

### YOUR ORIGINAL TASK (saved for next iteration):
${originalTask.slice(0, 500)}

### CURRENT CODEBASE INDEX:
${indexOverview}

### EXPLORATION REQUIREMENTS:

1. **READ the key files** using the Code Index above to identify:
   - Entry points and main modules
   - Core data structures and types
   - The overall architecture pattern (MVC, ECS, layered, etc.)
   - Naming conventions and coding style
   - Build system and dependencies
   - Existing test infrastructure

2. **IDENTIFY** what already exists that is relevant to your task:
   - Which existing modules could be extended vs. rewritten?
   - What interfaces/types already exist that you should conform to?
   - What file naming patterns are established?
   - Are there existing utilities you should reuse?

3. **PRODUCE an ARCHITECTURE SUMMARY** in this format:

ARCHITECTURE SUMMARY:
- **Pattern**: [architecture pattern]
- **Entry Points**: [main files]
- **Core Modules**: [key modules and their purposes]
- **Types/Interfaces**: [key shared types]
- **Build System**: [build tools, package manager]
- **Test Framework**: [test runner, patterns]
- **Conventions**: [naming, file structure, patterns]
- **Relevant to Task**: [which existing code relates to the task]
- **Integration Plan**: [how to integrate new code with existing architecture]

### RULES FOR THIS ITERATION:
- Do NOT create or modify any code files${totalFiles >= 10 ? ' (HARD BLOCK — too many existing files to modify blindly)' : ''}
- Do NOT start implementing the task yet
- ONLY read, analyze, and produce the architecture summary
- Your structured output should have done=false and confidence based on understanding
- The next iteration will use your summary to implement the task correctly

This exploration step prevents the critical failure mode where agents build
disconnected parallel architectures instead of extending existing code.`;
}

function getStoredArchitectureSummary(
  memory: MemoryService,
  projectId: string,
): string | null {
  try {
    // Use memory's note retrieval — notes with category 'architecture_scan'
    const notes = memory.getProjectNotes(projectId, 5);
    const archNote = notes.find(
      (n: any) => n.category === EXPLORATION_CATEGORY,
    );
    return archNote?.content || null;
  } catch {
    return null;
  }
}
