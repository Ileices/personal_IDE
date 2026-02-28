// ============================================
// SQLite Database - Schema & Connection
// Migration-based schema management
// ============================================
import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname, resolve, isAbsolute } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function initDatabase(dbPath: string): Database.Database {
  // Resolve path relative to server root
  const fullPath = isAbsolute(dbPath) ? dbPath : resolve(__dirname, '../../..', dbPath);
  const dir = dirname(fullPath);

  // Ensure directory exists
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(fullPath);

  // Enable WAL mode for better concurrent performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run migrations
  runMigrations(db);

  return db;
}

// ─────────────────────────────────────────────
// Migration System
// ─────────────────────────────────────────────

interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
}

function ensureSchemaVersionTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function getCurrentVersion(db: Database.Database): number {
  const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as any;
  return row?.v ?? 0;
}

function runMigrations(db: Database.Database): void {
  ensureSchemaVersionTable(db);
  const current = getCurrentVersion(db);

  const pending = MIGRATIONS.filter(m => m.version > current);
  if (pending.length === 0) return;

  console.log(`📦 Running ${pending.length} database migration(s)…`);

  for (const m of pending) {
    const tx = db.transaction(() => {
      m.up(db);
      db.prepare('INSERT INTO schema_version (version, name) VALUES (?, ?)').run(m.version, m.name);
    });
    tx();
    console.log(`  ✅ Migration ${String(m.version).padStart(3, '0')}: ${m.name}`);
  }
}

// ─────────────────────────────────────────────
// Migrations — add new entries at the end
// ─────────────────────────────────────────────

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up(db) {
      db.exec(`
    -- Projects
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      root_path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_accessed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Conversations
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT 'New Chat',
      mode TEXT NOT NULL DEFAULT 'ask',
      model TEXT NOT NULL DEFAULT 'openai/gpt-4.1',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Messages
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'complete',
      model TEXT,
      mode TEXT,
      token_count INTEGER DEFAULT 0,
      files_referenced TEXT DEFAULT '[]',
      structured_output TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Memory Notes
    CREATE TABLE IF NOT EXISTS memory_notes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK (source IN ('auto_summary', 'user_note', 'agent_log', 'file_summary', 'question_answer')),
      category TEXT NOT NULL DEFAULT 'general',
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      related_files TEXT DEFAULT '[]',
      importance INTEGER DEFAULT 50,
      conversation_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- File Summaries (cached)
    CREATE TABLE IF NOT EXISTS file_summaries (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      summary TEXT NOT NULL,
      language TEXT DEFAULT '',
      file_size INTEGER DEFAULT 0,
      content_hash TEXT NOT NULL,
      key_symbols TEXT DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_id, file_path)
    );

    -- Agent Run Logs
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      conversation_id TEXT REFERENCES conversations(id),
      task TEXT NOT NULL,
      iterations INTEGER DEFAULT 0,
      files_changed TEXT DEFAULT '[]',
      summary TEXT DEFAULT '',
      final_state TEXT DEFAULT 'idle',
      total_tokens INTEGER DEFAULT 0,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    -- Question Logs
    CREATE TABLE IF NOT EXISTS question_logs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      agent_run_id TEXT,
      question TEXT NOT NULL,
      resolution TEXT NOT NULL DEFAULT 'pending' CHECK (resolution IN ('auto_answered', 'user_answered', 'skipped', 'pending')),
      answer TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Provider configurations (multi-provider support)
    CREATE TABLE IF NOT EXISTS provider_configs (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key_encrypted TEXT,
      enabled INTEGER NOT NULL DEFAULT 0,
      requires_api_key INTEGER NOT NULL DEFAULT 1,
      setup_url TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Auth tokens (encrypted PATs per account)
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id TEXT PRIMARY KEY,
      github_user_id INTEGER NOT NULL UNIQUE,
      github_login TEXT NOT NULL,
      github_name TEXT,
      github_email TEXT,
      avatar_url TEXT,
      token_encrypted TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      has_copilot INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Code Symbols (knowledge graph nodes)
    CREATE TABLE IF NOT EXISTS code_symbols (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('function','class','interface','type','enum','variable','module','struct','trait','method','property','constant','import')),
      signature TEXT DEFAULT '',
      line_start INTEGER DEFAULT 0,
      line_end INTEGER DEFAULT 0,
      scope TEXT DEFAULT 'local',
      language TEXT NOT NULL DEFAULT 'unknown',
      purity_score REAL DEFAULT 0.5,
      domain TEXT DEFAULT '',
      exported INTEGER DEFAULT 0,
      doc_comment TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Code Relationships (knowledge graph edges)
    CREATE TABLE IF NOT EXISTS code_relationships (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      source_symbol_id TEXT NOT NULL REFERENCES code_symbols(id) ON DELETE CASCADE,
      target_symbol_id TEXT NOT NULL REFERENCES code_symbols(id) ON DELETE CASCADE,
      relationship_type TEXT NOT NULL CHECK (relationship_type IN ('imports','extends','implements','calls','uses','overrides','composes','instantiates','returns','parameter_of')),
      confidence REAL DEFAULT 1.0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Code Conflicts (namespace collisions, duplicate exports)
    CREATE TABLE IF NOT EXISTS code_conflicts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      symbol_a_id TEXT NOT NULL REFERENCES code_symbols(id) ON DELETE CASCADE,
      symbol_b_id TEXT NOT NULL REFERENCES code_symbols(id) ON DELETE CASCADE,
      conflict_type TEXT NOT NULL CHECK (conflict_type IN ('name_collision','signature_mismatch','circular_dependency','duplicate_export','type_incompatible')),
      severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','error','critical')),
      resolution_strategy TEXT DEFAULT '',
      resolved INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Code Edit Log (surgical change tracking for large corpora)
    CREATE TABLE IF NOT EXISTS code_edit_log (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      agent_run_id TEXT,
      file_path TEXT NOT NULL,
      edit_type TEXT NOT NULL CHECK (edit_type IN ('create','modify','delete','rename','move')),
      line_start INTEGER DEFAULT 0,
      line_end INTEGER DEFAULT 0,
      old_content_hash TEXT DEFAULT '',
      new_content_hash TEXT DEFAULT '',
      symbols_affected TEXT DEFAULT '[]',
      reason TEXT DEFAULT '',
      safety_score REAL DEFAULT 1.0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Conversation Index (extracted hotwords, decisions, file refs)
    CREATE TABLE IF NOT EXISTS conversation_index (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
      hotwords TEXT DEFAULT '[]',
      decisions TEXT DEFAULT '[]',
      file_references TEXT DEFAULT '[]',
      code_snippets TEXT DEFAULT '[]',
      sentiment TEXT DEFAULT 'neutral',
      importance REAL DEFAULT 0.5,
      extracted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Project Tier Config
    CREATE TABLE IF NOT EXISTS project_tier_config (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
      tier TEXT NOT NULL DEFAULT 'prototype' CHECK (tier IN ('prototype','production','enterprise','global')),
      primary_language TEXT DEFAULT '',
      architecture_pattern TEXT DEFAULT '',
      target_platforms TEXT DEFAULT '[]',
      quality_gates TEXT DEFAULT '{}',
      auto_detected INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Log Retention Tiers
    CREATE TABLE IF NOT EXISTS log_retention (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      tier TEXT NOT NULL DEFAULT 'hot' CHECK (tier IN ('hot','warm','cold','archived')),
      source_table TEXT NOT NULL,
      record_count INTEGER DEFAULT 0,
      total_bytes INTEGER DEFAULT 0,
      oldest_record TEXT,
      newest_record TEXT,
      compacted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Indexes for fast queries
    CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_memory_notes_project ON memory_notes(project_id);
    CREATE INDEX IF NOT EXISTS idx_memory_notes_search ON memory_notes(project_id, source, category);
    CREATE INDEX IF NOT EXISTS idx_file_summaries_project ON file_summaries(project_id, file_path);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_project ON agent_runs(project_id);
    CREATE INDEX IF NOT EXISTS idx_question_logs_project ON question_logs(project_id);

    -- Knowledge graph indexes
    CREATE INDEX IF NOT EXISTS idx_code_symbols_project ON code_symbols(project_id);
    CREATE INDEX IF NOT EXISTS idx_code_symbols_file ON code_symbols(project_id, file_path);
    CREATE INDEX IF NOT EXISTS idx_code_symbols_name ON code_symbols(name);
    CREATE INDEX IF NOT EXISTS idx_code_symbols_kind ON code_symbols(project_id, kind);
    CREATE INDEX IF NOT EXISTS idx_code_relationships_source ON code_relationships(source_symbol_id);
    CREATE INDEX IF NOT EXISTS idx_code_relationships_target ON code_relationships(target_symbol_id);
    CREATE INDEX IF NOT EXISTS idx_code_relationships_project ON code_relationships(project_id);
    CREATE INDEX IF NOT EXISTS idx_code_conflicts_project ON code_conflicts(project_id);
    CREATE INDEX IF NOT EXISTS idx_code_edit_log_project ON code_edit_log(project_id);
    CREATE INDEX IF NOT EXISTS idx_code_edit_log_file ON code_edit_log(file_path);
    CREATE INDEX IF NOT EXISTS idx_conversation_index_project ON conversation_index(project_id);
    CREATE INDEX IF NOT EXISTS idx_conversation_index_conv ON conversation_index(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_project_tier_config ON project_tier_config(project_id);
      `);
    },
  },

  // ──────────────────────────────────────────
  // Future migrations go here, e.g.:
  //
  // {
  //   version: 2,
  //   name: 'add_user_preferences',
  //   up(db) {
  //     db.exec(`
  //       CREATE TABLE IF NOT EXISTS user_preferences (
  //         user_id TEXT PRIMARY KEY,
  //         theme TEXT DEFAULT 'dark',
  //         ...
  //       );
  //     `);
  //   },
  // },
  // ──────────────────────────────────────────
];

// ─────────────────────────────────────────────
// Migration Status Query (used by /api/health)
// ─────────────────────────────────────────────
export interface MigrationStatus {
  currentVersion: number;
  totalMigrations: number;
  pendingMigrations: number;
  appliedMigrations: { version: number; name: string; applied_at: string }[];
}

export function getMigrationStatus(db: Database.Database): MigrationStatus {
  ensureSchemaVersionTable(db);
  const current = getCurrentVersion(db);
  const pending = MIGRATIONS.filter(m => m.version > current);

  const rows = db
    .prepare('SELECT version, name, applied_at FROM schema_version ORDER BY version')
    .all() as { version: number; name: string; applied_at: string }[];

  return {
    currentVersion: current,
    totalMigrations: MIGRATIONS.length,
    pendingMigrations: pending.length,
    appliedMigrations: rows,
  };
}

export type { Database };
