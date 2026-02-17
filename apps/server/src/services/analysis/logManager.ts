// ============================================
// Log Bloat Manager
// Tiered retention (hot/warm/cold/archived),
// auto-compaction, buffered writes, and
// configurable retention policies to prevent
// unbounded DB growth in long-running agents
// ============================================
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import type { RetentionTier, LogRetentionEntry } from '@personal-ide/shared';

/** Retention policy per table */
interface RetentionPolicy {
  /** Table name */
  table: string;
  /** Column to use for age-based retention */
  timestampColumn: string;
  /** How long to keep in hot tier (minutes) */
  hotMinutes: number;
  /** How long to keep in warm tier (minutes) */
  warmMinutes: number;
  /** How long to keep in cold tier (minutes) — after this, archived/deleted */
  coldMinutes: number;
  /** Max rows before forced compaction */
  maxRows: number;
  /** Which columns to keep in compacted summaries */
  summaryColumns: string[];
  /** Whether to preserve high-importance records longer */
  importanceColumn?: string;
  /** Project ID column name */
  projectIdColumn: string;
}

// ── Default Retention Policies ──

const DEFAULT_POLICIES: RetentionPolicy[] = [
  {
    table: 'messages',
    timestampColumn: 'created_at',
    hotMinutes: 60 * 24 * 7,      // 7 days hot
    warmMinutes: 60 * 24 * 30,     // 30 days warm
    coldMinutes: 60 * 24 * 90,     // 90 days cold, then archive
    maxRows: 100_000,
    summaryColumns: ['id', 'conversation_id', 'role', 'created_at'],
    projectIdColumn: 'conversation_id', // indirect via conversations
  },
  {
    table: 'memory_notes',
    timestampColumn: 'updated_at',
    hotMinutes: 60 * 24 * 30,      // 30 days hot
    warmMinutes: 60 * 24 * 180,    // 180 days warm
    coldMinutes: 60 * 24 * 365,    // 1 year cold
    maxRows: 50_000,
    summaryColumns: ['id', 'project_id', 'title', 'source', 'category', 'importance'],
    importanceColumn: 'importance',
    projectIdColumn: 'project_id',
  },
  {
    table: 'agent_runs',
    timestampColumn: 'started_at',
    hotMinutes: 60 * 24 * 14,      // 14 days hot
    warmMinutes: 60 * 24 * 60,     // 60 days warm
    coldMinutes: 60 * 24 * 180,    // 180 days cold
    maxRows: 10_000,
    summaryColumns: ['id', 'project_id', 'task', 'final_state', 'iterations', 'total_tokens'],
    projectIdColumn: 'project_id',
  },
  {
    table: 'code_edit_log',
    timestampColumn: 'created_at',
    hotMinutes: 60 * 24 * 7,       // 7 days hot
    warmMinutes: 60 * 24 * 30,     // 30 days warm
    coldMinutes: 60 * 24 * 90,     // 90 days cold
    maxRows: 200_000,
    summaryColumns: ['id', 'project_id', 'file_path', 'edit_type', 'created_at'],
    projectIdColumn: 'project_id',
  },
  {
    table: 'conversation_index',
    timestampColumn: 'extracted_at',
    hotMinutes: 60 * 24 * 14,      // 14 days
    warmMinutes: 60 * 24 * 60,     // 60 days
    coldMinutes: 60 * 24 * 180,    // 180 days
    maxRows: 50_000,
    summaryColumns: ['id', 'project_id', 'conversation_id', 'hotwords', 'decisions'],
    projectIdColumn: 'project_id',
  },
  {
    table: 'question_logs',
    timestampColumn: 'created_at',
    hotMinutes: 60 * 24 * 7,
    warmMinutes: 60 * 24 * 30,
    coldMinutes: 60 * 24 * 90,
    maxRows: 10_000,
    summaryColumns: ['id', 'project_id', 'question', 'resolution'],
    projectIdColumn: 'project_id',
  },
];

/** Write buffer for batching DB operations */
interface BufferedWrite {
  sql: string;
  params: any[];
  timestamp: number;
}

export class LogBloatManager {
  private writeBuffer: BufferedWrite[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private bufferFlushMs = 5000; // flush every 5 seconds
  private maxBufferSize = 100; // or when buffer hits 100 entries
  private policies: RetentionPolicy[];
  private compactionRunning = false;

  constructor(
    private db: Database.Database,
    customPolicies?: RetentionPolicy[]
  ) {
    this.policies = customPolicies || DEFAULT_POLICIES;
    this.startFlushTimer();
  }

  // ── Buffered Writes ──

  /** Add a write to the buffer instead of executing immediately */
  bufferWrite(sql: string, params: any[]): void {
    this.writeBuffer.push({ sql, params, timestamp: Date.now() });
    if (this.writeBuffer.length >= this.maxBufferSize) {
      this.flushWrites();
    }
  }

  /** Flush all buffered writes as a transaction */
  flushWrites(): void {
    if (this.writeBuffer.length === 0) return;

    const writes = [...this.writeBuffer];
    this.writeBuffer = [];

    try {
      const transaction = this.db.transaction(() => {
        for (const w of writes) {
          this.db.prepare(w.sql).run(...w.params);
        }
      });
      transaction();
    } catch (err) {
      // On failure, put them back (or log and discard)
      console.error('LogBloatManager: Flush failed, discarding', writes.length, 'writes');
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => this.flushWrites(), this.bufferFlushMs);
  }

  /** Stop the flush timer (for cleanup) */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushWrites(); // final flush
  }

  // ── Compaction & Retention ──

  /** Run compaction across all managed tables */
  async runCompaction(projectId?: string): Promise<{
    tablesProcessed: number;
    rowsArchived: number;
    rowsDeleted: number;
    bytesReclaimed: number;
  }> {
    if (this.compactionRunning) {
      return { tablesProcessed: 0, rowsArchived: 0, rowsDeleted: 0, bytesReclaimed: 0 };
    }
    this.compactionRunning = true;

    let tablesProcessed = 0;
    let totalArchived = 0;
    let totalDeleted = 0;
    let totalBytes = 0;

    try {
      for (const policy of this.policies) {
        try {
          const result = this.compactTable(policy, projectId);
          tablesProcessed++;
          totalArchived += result.archived;
          totalDeleted += result.deleted;
          totalBytes += result.bytesReclaimed;
        } catch (err) {
          console.error(`LogBloatManager: Failed to compact ${policy.table}:`, err);
        }
      }

      // Run SQLite VACUUM to reclaim space
      if (totalDeleted > 1000) {
        try {
          this.db.pragma('wal_checkpoint(TRUNCATE)');
        } catch { /* ignore */ }
      }
    } finally {
      this.compactionRunning = false;
    }

    return { tablesProcessed, rowsArchived: totalArchived, rowsDeleted: totalDeleted, bytesReclaimed: totalBytes };
  }

  /** Compact a single table according to its retention policy */
  private compactTable(policy: RetentionPolicy, projectId?: string): {
    archived: number;
    deleted: number;
    bytesReclaimed: number;
  } {
    const now = new Date();
    let archived = 0;
    let deleted = 0;
    let bytesReclaimed = 0;

    // Calculate cutoff timestamps
    const coldCutoff = new Date(now.getTime() - policy.coldMinutes * 60_000).toISOString();
    const warmCutoff = new Date(now.getTime() - policy.warmMinutes * 60_000).toISOString();

    // Phase 1: Delete records older than cold tier threshold
    let deleteWhere = `${policy.timestampColumn} < ?`;
    const deleteParams: any[] = [coldCutoff];

    // Preserve high-importance records
    if (policy.importanceColumn) {
      deleteWhere += ` AND ${policy.importanceColumn} < 80`;
    }

    if (projectId && policy.projectIdColumn === 'project_id') {
      deleteWhere += ` AND project_id = ?`;
      deleteParams.push(projectId);
    }

    // Count before delete for stats
    const countBefore = (this.db.prepare(`SELECT COUNT(*) as c FROM ${policy.table} WHERE ${deleteWhere}`).get(...deleteParams) as any)?.c || 0;

    if (countBefore > 0) {
      // Estimate bytes (rough: avg 200 bytes per row)
      bytesReclaimed = countBefore * 200;

      this.db.prepare(`DELETE FROM ${policy.table} WHERE ${deleteWhere}`).run(...deleteParams);
      deleted = countBefore;
    }

    // Phase 2: Check max rows constraint
    const totalRows = (this.db.prepare(`SELECT COUNT(*) as c FROM ${policy.table}`).get() as any)?.c || 0;
    if (totalRows > policy.maxRows) {
      const excess = totalRows - policy.maxRows;
      // Delete oldest rows beyond the limit
      let orderBy = policy.timestampColumn;
      if (policy.importanceColumn) {
        orderBy = `${policy.importanceColumn} ASC, ${policy.timestampColumn} ASC`;
      }

      this.db.prepare(`
        DELETE FROM ${policy.table} WHERE rowid IN (
          SELECT rowid FROM ${policy.table} ORDER BY ${orderBy} LIMIT ?
        )
      `).run(excess);

      deleted += excess;
      bytesReclaimed += excess * 200;
    }

    // Phase 3: Update retention tracking
    this.updateRetentionEntry(policy, projectId);

    return { archived, deleted, bytesReclaimed };
  }

  /** Update the log_retention tracking table */
  private updateRetentionEntry(policy: RetentionPolicy, projectId?: string): void {
    const id = uuid();
    const now = new Date();

    const totalRows = (this.db.prepare(`SELECT COUNT(*) as c FROM ${policy.table}`).get() as any)?.c || 0;
    const oldest = this.db.prepare(`SELECT MIN(${policy.timestampColumn}) as t FROM ${policy.table}`).get() as any;
    const newest = this.db.prepare(`SELECT MAX(${policy.timestampColumn}) as t FROM ${policy.table}`).get() as any;

    // Determine current tier based on age
    let tier: RetentionTier = 'hot';
    if (oldest?.t) {
      const ageMs = now.getTime() - new Date(oldest.t).getTime();
      const ageMinutes = ageMs / 60_000;
      if (ageMinutes > policy.coldMinutes) tier = 'cold';
      else if (ageMinutes > policy.warmMinutes) tier = 'warm';
    }

    this.db.prepare(`
      INSERT OR REPLACE INTO log_retention (id, project_id, tier, source_table, record_count, total_bytes, oldest_record, newest_record, compacted_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      id, projectId || 'global', tier, policy.table,
      totalRows, totalRows * 200,
      oldest?.t || null, newest?.t || null
    );
  }

  // ── Stats & Monitoring ──

  /** Get storage stats across all managed tables */
  getStorageStats(): {
    tables: Array<{ table: string; rowCount: number; estimatedBytes: number; tier: RetentionTier }>;
    totalRows: number;
    totalEstimatedBytes: number;
  } {
    const tables: Array<{ table: string; rowCount: number; estimatedBytes: number; tier: RetentionTier }> = [];
    let totalRows = 0;
    let totalEstimatedBytes = 0;

    for (const policy of this.policies) {
      try {
        const count = (this.db.prepare(`SELECT COUNT(*) as c FROM ${policy.table}`).get() as any)?.c || 0;
        const bytes = count * 200; // rough estimate
        const oldest = this.db.prepare(`SELECT MIN(${policy.timestampColumn}) as t FROM ${policy.table}`).get() as any;

        let tier: RetentionTier = 'hot';
        if (oldest?.t) {
          const ageMinutes = (Date.now() - new Date(oldest.t).getTime()) / 60_000;
          if (ageMinutes > policy.coldMinutes) tier = 'cold';
          else if (ageMinutes > policy.warmMinutes) tier = 'warm';
        }

        tables.push({ table: policy.table, rowCount: count, estimatedBytes: bytes, tier });
        totalRows += count;
        totalEstimatedBytes += bytes;
      } catch { /* table might not exist yet */ }
    }

    return { tables, totalRows, totalEstimatedBytes };
  }

  /** Get database file size */
  getDbSize(): number {
    try {
      const result = this.db.pragma('page_count') as any[];
      const pageSize = (this.db.pragma('page_size') as any[])[0]?.page_size || 4096;
      const pageCount = result[0]?.page_count || 0;
      return pageCount * pageSize;
    } catch {
      return 0;
    }
  }

  /** Check if compaction is needed */
  needsCompaction(): boolean {
    for (const policy of this.policies) {
      try {
        const count = (this.db.prepare(`SELECT COUNT(*) as c FROM ${policy.table}`).get() as any)?.c || 0;
        if (count > policy.maxRows * 0.9) return true;

        const oldest = this.db.prepare(`SELECT MIN(${policy.timestampColumn}) as t FROM ${policy.table}`).get() as any;
        if (oldest?.t) {
          const ageMinutes = (Date.now() - new Date(oldest.t).getTime()) / 60_000;
          if (ageMinutes > policy.coldMinutes) return true;
        }
      } catch { /* ignore */ }
    }
    return false;
  }

  /** Format stats for LLM context */
  formatForLLM(): string {
    const stats = this.getStorageStats();
    const dbSize = this.getDbSize();

    const lines = [
      '## DATABASE HEALTH',
      `DB size: ${(dbSize / 1024 / 1024).toFixed(1)} MB | Total rows: ${stats.totalRows.toLocaleString()}`,
      '',
    ];

    for (const t of stats.tables) {
      const icon = t.tier === 'hot' ? '🔴' : t.tier === 'warm' ? '🟡' : '🔵';
      lines.push(`  ${icon} ${t.table}: ${t.rowCount.toLocaleString()} rows (${(t.estimatedBytes / 1024).toFixed(0)} KB) [${t.tier}]`);
    }

    if (this.needsCompaction()) {
      lines.push('', '⚠️ Compaction recommended — some tables exceed retention thresholds');
    }

    return lines.join('\n');
  }
}
