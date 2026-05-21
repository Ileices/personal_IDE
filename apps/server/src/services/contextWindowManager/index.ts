// ============================================================
// Context Window Manager Sub-Agent
// Enforces priority-based context inclusion with tiered
// token budgets and forensic logging of truncated content.
// ============================================================

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

// ── Priority ordering (lower number = higher priority) ──────
// high_importance_memory (score > 0.7) is promoted above devtags so that
// critical saved knowledge is never squeezed out by verbose devtag listings.

const PRIORITY_LEVELS = {
  system_prompt:          1,
  task_buildtags:         2,
  high_importance_memory: 3,  // memory_notes with importance_score > 0.7
  devtags:                4,
  history:                5,
  code_content:           6,
  memory:                 7,  // standard memory (importance_score <= 0.7)
} as const;

type PriorityLevel = keyof typeof PRIORITY_LEVELS;

// ── Tier token ceilings (tokens, not chars) ─────────────────

const TIER_CEILINGS: Record<number, number> = {
  1: 2_000,
  2: 6_000,
  3: 16_000,
  4: 80_000,
  5: 160_000,
};

// Budget thresholds (as fraction of ceiling)
const BUDGET_THRESHOLDS = {
  PASSTHROUGH:          0.80, // >80% available → passthrough
  SUMMARIZE_MEMORY:     0.60, // 60–80% → summarize memory
  TRUNCATE_CODE:        0.40, // 40–60% → truncate code to ±20 lines
  AGGRESSIVE:           0.00, // <40%  → aggressive truncation + warning
};

// ── Types ─────────────────────────────────────────────────────

export interface ContextSlot {
  key: PriorityLevel;
  content: string;
  /** Pre-computed rough token count (chars / 4 approximation) */
  tokens?: number;
}

export interface ContextBudget {
  tier: number;
  ceilingTokens: number;
  usedTokens: number;
  remainingFraction: number;
  strategy: 'passthrough' | 'summarize_memory' | 'truncate_code' | 'aggressive';
}

export interface ContextWindowResult {
  assembled: string;
  budget: ContextBudget;
  truncatedKeys: PriorityLevel[];
  forensicId: string;
}

export interface PrioritySlots {
  system_prompt: string;
  task_buildtags: string;
  /** High-importance memory notes (importance_score > 0.7). Pass empty string if not used. */
  high_importance_memory: string;
  devtags: string;
  history: string;
  memory: string;
  code_content: string;
}

export interface FitSlotsResult {
  slots: PrioritySlots;
  budget: ContextBudget;
  truncatedKeys: PriorityLevel[];
  forensicId: string;
}

// ── Service ──────────────────────────────────────────────────

export class ContextWindowManager {
  constructor(private db: Database.Database) {}

  /**
   * Assemble a context string from prioritized slots, respecting the
   * tier's token ceiling and logging any truncation to forensics.
   *
   * @param slots  Named context pieces, unordered — sorted by priority internally
   * @param tier   Agent tier (1–5); determines the token ceiling
   * @param agentId Identifier for forensic logging
   */
  assemble(
    slots: ContextSlot[],
    tier: number,
    agentId: string,
  ): ContextWindowResult {
    const ceiling = TIER_CEILINGS[tier] ?? TIER_CEILINGS[4];
    const forensicId = randomUUID();

    // Sort by priority (system_prompt first)
    const sorted = [...slots].sort(
      (a, b) => PRIORITY_LEVELS[a.key] - PRIORITY_LEVELS[b.key],
    );

    // Assign token estimates
    const withTokens = sorted.map(s => ({
      ...s,
      tokens: s.tokens ?? this._estimateTokens(s.content),
    }));

    const totalRaw = withTokens.reduce((sum, s) => sum + s.tokens, 0);
    const remainingFraction = totalRaw > 0 ? Math.min(1, ceiling / totalRaw) : 1;
    const strategy = this._pickStrategy(remainingFraction);

    const truncatedKeys: PriorityLevel[] = [];
    const parts: string[] = [];
    let usedTokens = 0;

    for (const slot of withTokens) {
      const remaining = ceiling - usedTokens;
      if (remaining <= 0) {
        truncatedKeys.push(slot.key);
        continue;
      }

      let content = slot.content;

      if (strategy === 'summarize_memory' && slot.key === 'memory') {
        content = this._summarizeMemory(content);
      } else if (
        (strategy === 'truncate_code' || strategy === 'aggressive') &&
        slot.key === 'code_content'
      ) {
        content = this._truncateCode(content, strategy === 'aggressive' ? 10 : 20);
      }

      const est = this._estimateTokens(content);
      if (est > remaining) {
        // Hard-truncate to fit
        const charBudget = remaining * 4;
        content = content.slice(0, charBudget) + '\n... [truncated by ContextWindowManager]';
        truncatedKeys.push(slot.key);
      }

      parts.push(content);
      usedTokens += this._estimateTokens(content);
    }

    const assembled = parts.join('\n\n');

    // Log forensic entry if anything was truncated
    if (truncatedKeys.length > 0) {
      this._logTruncation({
        forensicId,
        agentId,
        tier,
        ceiling,
        usedTokens,
        truncatedKeys,
        strategy,
      });
    }

    return {
      assembled,
      budget: {
        tier,
        ceilingTokens: ceiling,
        usedTokens,
        remainingFraction: 1 - usedTokens / ceiling,
        strategy,
      },
      truncatedKeys,
      forensicId,
    };
  }

  /**
   * Same budget logic as assemble(), but preserves individual priority slots
   * so callers can keep structured prompt channels while still enforcing one
   * canonical context policy.
   */
  fitPrioritySlots(
    slots: PrioritySlots,
    tier: number,
    agentId: string,
  ): FitSlotsResult {
    const ordered: ContextSlot[] = [
      { key: 'system_prompt',          content: slots.system_prompt },
      { key: 'task_buildtags',         content: slots.task_buildtags },
      { key: 'high_importance_memory', content: slots.high_importance_memory ?? '' },
      { key: 'devtags',                content: slots.devtags },
      { key: 'history',                content: slots.history },
      { key: 'code_content',           content: slots.code_content },
      { key: 'memory',                 content: slots.memory },
    ];

    const ceiling = TIER_CEILINGS[tier] ?? TIER_CEILINGS[4];
    const forensicId = randomUUID();
    const totalRaw = ordered.reduce((sum, s) => sum + this._estimateTokens(s.content), 0);
    const remainingFraction = totalRaw > 0 ? Math.min(1, ceiling / totalRaw) : 1;
    const strategy = this._pickStrategy(remainingFraction);

    const truncatedKeys: PriorityLevel[] = [];
    const out: PrioritySlots = {
      system_prompt: '',
      task_buildtags: '',
      high_importance_memory: '',
      devtags: '',
      history: '',
      memory: '',
      code_content: '',
    };

    let usedTokens = 0;
    for (const slot of ordered) {
      const remaining = ceiling - usedTokens;
      if (remaining <= 0) {
        out[slot.key] = '';
        truncatedKeys.push(slot.key);
        continue;
      }

      let content = slot.content;
      if (strategy === 'summarize_memory' && slot.key === 'memory') {
        content = this._summarizeMemory(content);
      } else if ((strategy === 'truncate_code' || strategy === 'aggressive') && slot.key === 'code_content') {
        content = this._truncateCode(content, strategy === 'aggressive' ? 10 : 20);
      } else if (strategy === 'aggressive' && slot.key === 'high_importance_memory') {
        content = content.slice(0, 2000);
      } else if (strategy === 'aggressive' && slot.key === 'high_importance_memory') {
        // Even in aggressive mode, preserve the first 500 chars of high-importance memory
        content = content.slice(0, 2000);
      }

      const est = this._estimateTokens(content);
      if (est > remaining) {
        const charBudget = Math.max(0, remaining * 4);
        content = content.slice(0, charBudget) + '\n... [truncated by ContextWindowManager]';
        truncatedKeys.push(slot.key);
      }

      out[slot.key] = content;
      usedTokens += this._estimateTokens(content);
    }

    if (truncatedKeys.length > 0) {
      this._logTruncation({
        forensicId,
        agentId,
        tier,
        ceiling,
        usedTokens,
        truncatedKeys,
        strategy,
      });
    }

    return {
      slots: out,
      budget: {
        tier,
        ceilingTokens: ceiling,
        usedTokens,
        remainingFraction: 1 - usedTokens / ceiling,
        strategy,
      },
      truncatedKeys,
      forensicId,
    };
  }

  // ── Private Helpers ───────────────────────────────────────

  private _estimateTokens(text: string): number {
    // ~4 chars per token is a common approximation
    return Math.ceil(text.length / 4);
  }

  private _pickStrategy(
    remainingFraction: number,
  ): 'passthrough' | 'summarize_memory' | 'truncate_code' | 'aggressive' {
    if (remainingFraction >= BUDGET_THRESHOLDS.PASSTHROUGH) return 'passthrough';
    if (remainingFraction >= BUDGET_THRESHOLDS.SUMMARIZE_MEMORY) return 'summarize_memory';
    if (remainingFraction >= BUDGET_THRESHOLDS.TRUNCATE_CODE) return 'truncate_code';
    return 'aggressive';
  }

  private _summarizeMemory(content: string): string {
    // Keep only the first and last paragraph of memory content
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length <= 6) return content;
    const head = lines.slice(0, 3).join('\n');
    const tail = lines.slice(-3).join('\n');
    return `${head}\n... [memory summarized — ${lines.length} lines → 6] ...\n${tail}`;
  }

  private _truncateCode(content: string, contextLines: number): string {
    const lines = content.split('\n');
    if (lines.length <= contextLines * 2) return content;
    const head = lines.slice(0, contextLines).join('\n');
    const tail = lines.slice(-contextLines).join('\n');
    return `${head}\n... [${lines.length - contextLines * 2} lines truncated] ...\n${tail}`;
  }

  private _logTruncation(info: {
    forensicId: string;
    agentId: string;
    tier: number;
    ceiling: number;
    usedTokens: number;
    truncatedKeys: PriorityLevel[];
    strategy: string;
  }): void {
    // Notification queue warning
    try {
      this.db.prepare(`
        INSERT INTO notification_queue
          (notification_id, severity, category, natural_language_summary,
           summary_tags, presented_to_user, user_acknowledged, timestamp)
        VALUES (?, 'warning', 'context_truncation', ?, ?, 0, 0, datetime('now'))
      `).run(
        info.forensicId,
        `[ContextWindowManager] Agent ${info.agentId} (Tier ${info.tier}) truncated ` +
          `${info.truncatedKeys.join(', ')} — strategy=${info.strategy}, ` +
          `used=${info.usedTokens}/${info.ceiling} tokens`,
        JSON.stringify([
          `agent:${info.agentId}`,
          `tier:${info.tier}`,
          `strategy:${info.strategy}`,
          ...info.truncatedKeys.map(k => `truncated:${k}`),
        ]),
      );
    } catch { /* non-critical */ }
  }

  /**
   * Load high-importance memory notes (importance_score > 0.7) from the DB
   * for a given project.  Returns formatted text suitable for the
   * `high_importance_memory` PrioritySlots field.
   *
   * Falls back gracefully if the importance_score column doesn't exist yet
   * (migration v118 not yet applied).
   */
  loadHighImportanceMemory(projectId: string, maxNotes = 20): string {
    try {
      const rows = this.db.prepare(`
        SELECT content, category, source
        FROM memory_notes
        WHERE project_id = ? AND importance_score > 0.7
        ORDER BY importance_score DESC, extracted_at DESC
        LIMIT ?
      `).all(projectId, maxNotes) as Array<{ content: string; category: string; source: string }>;

      if (rows.length === 0) return '';

      return rows
        .map(r => `[${r.category}/${r.source}] ${r.content}`)
        .join('\n');
    } catch {
      // importance_score column not yet added (migration v118 pending) — skip
      return '';
    }
  }
}
