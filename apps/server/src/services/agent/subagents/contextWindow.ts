// ============================================
// Context Window Manager Sub-Agent
// Chunks and prioritizes crawl outputs for delivery
// to any agent. Enforces model tier token ceilings.
// Logs all excluded tags for on-demand retrieval.
// ============================================
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import type { TagRegistryService } from '../../tagRegistry/index.js';
import { SpawnAuthorityService } from '../../spawnAuthority/index.js';
import { ContextWindowManager } from '../../contextWindowManager/index.js';

// Rough token estimation (4 chars ≈ 1 token)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface ChunkResult {
  cycle_id: string;
  agent_role: string;
  tier: number;
  safe_ceiling: number;
  included_tags: TagChunk[];
  excluded_count: number;
  total_tokens_used: number;
}

export interface TagChunk {
  tag_key: string;
  tag_type: string;
  rank: number;
  token_estimate: number;
  data: Record<string, unknown>;
}

export class ContextWindowManagerSubAgent {
  private canonicalManager: ContextWindowManager;

  constructor(
    private db: Database.Database,
    private tagRegistry: TagRegistryService
  ) {
    this.canonicalManager = new ContextWindowManager(db);
  }

  /**
   * Chunk a set of tags for delivery to a model tier.
   * Priority: tags in current buildtag/plantag set > relationship tags > recency.
   * Excluded tags are logged for on-demand retrieval.
   */
  chunk(opts: {
    cycle_id: string;
    agent_id: string;
    agent_role: string;
    all_tags: { tag_key: string; tag_type: string; data: Record<string, unknown> }[];
    priority_tag_keys: string[];     // Tags in current buildtag/plantag set
    relationship_tag_keys: string[]; // Connected relationship tags
  }): ChunkResult {
    const { cycle_id, agent_id, agent_role, all_tags, priority_tag_keys, relationship_tag_keys } = opts;

    const { tier, safe_ceiling_tokens } = SpawnAuthorityService.getModelTier(agent_role);

    // Rank all tags
    const ranked = all_tags.map(tag => {
      let rank = 0;
      if (priority_tag_keys.includes(tag.tag_key)) rank = 100;
      else if (relationship_tag_keys.includes(tag.tag_key)) rank = 50;
      else rank = 10; // Remaining — recency handled by order below

      const serialized = JSON.stringify(tag.data);
      return {
        tag_key: tag.tag_key,
        tag_type: tag.tag_type,
        rank,
        token_estimate: estimateTokens(serialized),
        data: tag.data,
      };
    });

    // Sort by rank descending
    ranked.sort((a, b) => b.rank - a.rank);

    // Fill to ceiling
    const included: TagChunk[] = [];
    const excluded: TagChunk[] = [];
    let tokensUsed = 0;

    for (const tag of ranked) {
      if (tokensUsed + tag.token_estimate <= safe_ceiling_tokens) {
        included.push(tag);
        tokensUsed += tag.token_estimate;
      } else {
        excluded.push(tag);
      }
    }

    // Log all exclusions (spec: no exclusion is silent)
    const devtagMap = new Map<string, string>();
    for (const dt of this.tagRegistry.listDevtags()) {
      devtagMap.set(dt.tag_key, dt.id);
    }

    for (const ex of excluded) {
      const devtag_id = devtagMap.get(ex.tag_key) ?? ex.tag_key;
      this.tagRegistry.logExclusion(
        cycle_id, agent_id, devtag_id,
        `Token ceiling exceeded (${safe_ceiling_tokens} tokens)`,
        ex.rank
      );
    }

    // Canonical manager pass (single source of truth for strategy + forensic logs).
    // Legacy include/exclude behavior above is preserved for compatibility, but
    // truncation policy and notifications come from ContextWindowManager.
    try {
      this.canonicalManager.assemble([
        {
          key: 'task_buildtags',
          content: priority_tag_keys.join('\n'),
        },
        {
          key: 'devtags',
          content: relationship_tag_keys.join('\n'),
        },
        {
          key: 'code_content',
          content: included.map(i => JSON.stringify(i.data)).join('\n'),
        },
      ], tier, agent_id);
    } catch { /* non-critical */ }

    return {
      cycle_id,
      agent_role,
      tier,
      safe_ceiling: safe_ceiling_tokens,
      included_tags: included,
      excluded_count: excluded.length,
      total_tokens_used: tokensUsed,
    };
  }

  /**
   * Retrieve excluded tags for a given cycle (resolve_excluded_tags).
   */
  resolveExcludedTags(cycle_id: string): {
    excluded_tag_id: string;
    exclusion_reason: string;
    rank_score: number;
    devtag?: unknown;
  }[] {
    const exclusions = this.tagRegistry.getExcludedTags(cycle_id);
    return exclusions.map((ex: { excluded_tag_id: string; exclusion_reason: string; rank_score: number }) => {
      const devtag = this.tagRegistry.getDevtagById(ex.excluded_tag_id);
      return {
        ...ex,
        devtag: devtag ?? undefined,
      };
    });
  }
}
