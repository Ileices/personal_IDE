// ============================================
// SQLite Database - Schema & Connection
// Migration-based schema management
// ============================================
import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname, resolve, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

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
  ensureGodFactorySchemaBackfill(db);

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
    try {
      const tx = db.transaction(() => {
        m.up(db);
        db.prepare('INSERT INTO schema_version (version, name) VALUES (?, ?)').run(m.version, m.name);
      });
      tx();
      console.log(`  ✅ Migration ${String(m.version).padStart(3, '0')}: ${m.name}`);
    } catch (err) {
      // Transaction auto-rolls back on throw; log and halt further migrations
      console.error(`  ❌ Migration ${String(m.version).padStart(3, '0')} (${m.name}) FAILED — rolled back`);
      console.error(`     Error: ${err instanceof Error ? err.message : String(err)}`);
      console.error(`     Database remains at schema version ${getCurrentVersion(db)}`);
      // Stop running further migrations — later ones may depend on this one
      break;
    }
  }
}

function ensureGodFactorySchemaBackfill(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_queue (
      notification_id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      source_forensic_id TEXT,
      severity TEXT NOT NULL,
      summary_tags TEXT NOT NULL DEFAULT '[]',
      natural_language_summary TEXT NOT NULL,
      cycle_id TEXT,
      presented_to_user INTEGER NOT NULL DEFAULT 0,
      user_acknowledged INTEGER NOT NULL DEFAULT 0,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notification_queue_ack ON notification_queue(user_acknowledged, timestamp);
    CREATE INDEX IF NOT EXISTS idx_notification_queue_severity ON notification_queue(severity, timestamp);
    CREATE INDEX IF NOT EXISTS idx_notification_queue_source ON notification_queue(source_forensic_id);

    CREATE TABLE IF NOT EXISTS idle_suggestions (
      suggestion_id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      source_devtags TEXT NOT NULL DEFAULT '[]',
      source_files TEXT NOT NULL DEFAULT '[]',
      source_lines TEXT NOT NULL DEFAULT '[]',
      source_forensic_ids TEXT NOT NULL DEFAULT '[]',
      natural_language_summary TEXT NOT NULL,
      suggested_job_id TEXT,
      presented_to_user INTEGER NOT NULL DEFAULT 0,
      user_response TEXT,
      cycle_id TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_idle_suggestions_response ON idle_suggestions(user_response, timestamp);
    CREATE INDEX IF NOT EXISTS idx_idle_suggestions_job ON idle_suggestions(suggested_job_id);

    CREATE TABLE IF NOT EXISTS brainstorm_records (
      brainstorm_id TEXT PRIMARY KEY,
      user_input_raw TEXT NOT NULL,
      generated_job_id TEXT,
      processing_status TEXT NOT NULL DEFAULT 'pending',
      cycle_id TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_brainstorm_processing_status ON brainstorm_records(processing_status, timestamp);

    CREATE TABLE IF NOT EXISTS god_factory_actions (
      action_id TEXT PRIMARY KEY,
      action_type TEXT NOT NULL,
      target_id TEXT,
      target_type TEXT,
      authority_invoked TEXT,
      justification_tags TEXT NOT NULL DEFAULT '[]',
      result TEXT NOT NULL,
      cycle_id TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_god_factory_actions_type ON god_factory_actions(action_type, timestamp);
    CREATE INDEX IF NOT EXISTS idx_god_factory_actions_target ON god_factory_actions(target_type, target_id);

    CREATE TABLE IF NOT EXISTS interactive_sessions (
      session_id TEXT PRIMARY KEY,
      start_cycle TEXT,
      end_cycle TEXT,
      user_inputs TEXT NOT NULL DEFAULT '[]',
      agent_responses TEXT NOT NULL DEFAULT '[]',
      sub_agents_spawned TEXT NOT NULL DEFAULT '[]',
      jobs_created TEXT NOT NULL DEFAULT '[]',
      jobs_implemented TEXT NOT NULL DEFAULT '[]',
      notifications_presented TEXT NOT NULL DEFAULT '[]',
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_interactive_sessions_timestamp ON interactive_sessions(timestamp);
  `);
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
  // Migration v2: Hierarchical Code Index
  // ──────────────────────────────────────────
  {
    version: 2,
    name: 'hierarchical_code_index',
    up(db: Database.Database) {
      db.exec(`
        -- Hierarchical AST node tree for codebase indexing
        -- Depth levels: ROOT(0) → DIR(1) → SUBDIR(2+) → FILE → IMPORT_BLOCK → CLASS → METHOD → FUNCTION → BLOCK → STATEMENT
        CREATE TABLE IF NOT EXISTS code_index_nodes (
          id TEXT PRIMARY KEY,
          project_root TEXT NOT NULL,
          parent_id TEXT,
          node_type TEXT NOT NULL,
          label TEXT NOT NULL,
          depth INTEGER NOT NULL DEFAULT 0,
          file_path TEXT,
          line_start INTEGER,
          line_end INTEGER,
          byte_start INTEGER,
          byte_end INTEGER,
          token_count INTEGER NOT NULL DEFAULT 0,
          signature TEXT,
          docstring TEXT,
          collapsed_summary TEXT,
          language TEXT,
          last_indexed INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (parent_id) REFERENCES code_index_nodes(id) ON DELETE CASCADE
        );

        -- Ordered parent→child join table for preserving source order
        CREATE TABLE IF NOT EXISTS code_index_edges (
          parent_id TEXT NOT NULL,
          child_id TEXT NOT NULL,
          position INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (parent_id, child_id),
          FOREIGN KEY (parent_id) REFERENCES code_index_nodes(id) ON DELETE CASCADE,
          FOREIGN KEY (child_id) REFERENCES code_index_nodes(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_cin_parent ON code_index_nodes(parent_id);
        CREATE INDEX IF NOT EXISTS idx_cin_project ON code_index_nodes(project_root);
        CREATE INDEX IF NOT EXISTS idx_cin_file ON code_index_nodes(file_path);
        CREATE INDEX IF NOT EXISTS idx_cin_type ON code_index_nodes(node_type);
        CREATE INDEX IF NOT EXISTS idx_cin_depth ON code_index_nodes(depth);
        CREATE INDEX IF NOT EXISTS idx_cie_parent ON code_index_edges(parent_id);
        CREATE INDEX IF NOT EXISTS idx_cie_child ON code_index_edges(child_id);
      `);
    },
  },

  // ──────────────────────────────────────────
  // Migration v3: App KV store (for midwife config, feature flags, etc.)
  // ──────────────────────────────────────────
  {
    version: 3,
    name: 'app_kv_store',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS app_kv (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    },
  },

  // ──────────────────────────────────────────
  // Migration v4: Forensic BLAME + quality tables
  // ──────────────────────────────────────────
  {
    version: 4,
    name: 'forensic_blame_tables',
    up(db: Database.Database) {
      db.exec(`
        -- Per-output BLAME records: every AI response is attributed to a model+mode
        CREATE TABLE IF NOT EXISTS blame_records (
          id TEXT PRIMARY KEY,
          model TEXT NOT NULL,
          mode TEXT NOT NULL DEFAULT 'ask',
          project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
          conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
          agent_run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
          task_type TEXT NOT NULL DEFAULT 'unknown',
          quality INTEGER,
          success INTEGER NOT NULL DEFAULT 1,
          error_type TEXT,
          file_path TEXT,
          latency_ms INTEGER,
          token_count INTEGER,
          prompt_tokens INTEGER,
          completion_tokens INTEGER,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Quality dimension scores (1:1 with blame_records, populated by crawler)
        CREATE TABLE IF NOT EXISTS quality_records (
          id TEXT PRIMARY KEY,
          blame_id TEXT NOT NULL REFERENCES blame_records(id) ON DELETE CASCADE,
          tag_conformance REAL DEFAULT 0,
          instruction_adherence REAL DEFAULT 0,
          hallucination REAL DEFAULT 0,
          structural_integrity REAL DEFAULT 0,
          output_efficiency REAL DEFAULT 0,
          dimension_notes TEXT DEFAULT '{}',
          crawled_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Tool criticism log: tracks tool call failures + patterns
        CREATE TABLE IF NOT EXISTS tool_criticism_records (
          id TEXT PRIMARY KEY,
          model TEXT NOT NULL,
          tool_name TEXT NOT NULL,
          agent_run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
          failure_type TEXT NOT NULL DEFAULT 'unknown',
          input_summary TEXT DEFAULT '',
          output_summary TEXT DEFAULT '',
          criticism TEXT DEFAULT '',
          severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','error','critical')),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Blame successes: high-quality outputs saved as training seeds
        CREATE TABLE IF NOT EXISTS blame_successes (
          id TEXT PRIMARY KEY,
          blame_id TEXT NOT NULL REFERENCES blame_records(id) ON DELETE CASCADE,
          model TEXT NOT NULL,
          task_type TEXT NOT NULL,
          prompt_excerpt TEXT DEFAULT '',
          output_excerpt TEXT DEFAULT '',
          quality_score INTEGER NOT NULL,
          tags TEXT DEFAULT '[]',
          promoted_to_training INTEGER DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Model registry: aggregated per-model strategy config
        CREATE TABLE IF NOT EXISTS model_registry (
          id TEXT PRIMARY KEY,
          model_id TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          provider TEXT NOT NULL DEFAULT 'unknown',
          total_runs INTEGER NOT NULL DEFAULT 0,
          success_rate REAL NOT NULL DEFAULT 0,
          avg_quality REAL NOT NULL DEFAULT 0,
          avg_latency_ms REAL NOT NULL DEFAULT 0,
          total_tokens INTEGER NOT NULL DEFAULT 0,
          trend TEXT NOT NULL DEFAULT 'flat' CHECK (trend IN ('up','down','flat')),
          tag_conformance REAL,
          instruction_adherence REAL,
          hallucination REAL,
          structural_integrity REAL,
          output_efficiency REAL,
          strategy_config TEXT DEFAULT '{}',
          last_run_at TEXT,
          last_crawled_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_blame_model ON blame_records(model);
        CREATE INDEX IF NOT EXISTS idx_blame_project ON blame_records(project_id);
        CREATE INDEX IF NOT EXISTS idx_blame_mode ON blame_records(mode);
        CREATE INDEX IF NOT EXISTS idx_blame_created ON blame_records(created_at);
        CREATE INDEX IF NOT EXISTS idx_quality_blame ON quality_records(blame_id);
        CREATE INDEX IF NOT EXISTS idx_tool_crit_model ON tool_criticism_records(model);
        CREATE INDEX IF NOT EXISTS idx_tool_crit_tool ON tool_criticism_records(tool_name);
        CREATE INDEX IF NOT EXISTS idx_blame_success_model ON blame_successes(model);
        CREATE INDEX IF NOT EXISTS idx_model_registry_id ON model_registry(model_id);
      `);
    },
  },

  // ──────────────────────────────────────────
  // Migration v5: Tag Registry (devtags, plantags, buildtags)
  // ──────────────────────────────────────────
  {
    version: 5,
    name: 'tag_registry',
    up(db: Database.Database) {
      db.exec(`
        -- Devtag registry: all structural code tags
        CREATE TABLE IF NOT EXISTS devtags (
          id TEXT PRIMARY KEY,
          tag_key TEXT NOT NULL UNIQUE,
          tag_type TEXT NOT NULL,
          name TEXT NOT NULL,
          parent_id TEXT REFERENCES devtags(id) ON DELETE SET NULL,
          file_path TEXT,
          line_start INTEGER,
          line_end INTEGER,
          project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','orphaned','dead','retired')),
          dead_detected_cycle INTEGER,
          retirement_scheduled_cycle INTEGER,
          last_commit_id TEXT,
          metadata TEXT DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Plantag registry: plan/requirement tags
        CREATE TABLE IF NOT EXISTS plantags (
          id TEXT PRIMARY KEY,
          tag_key TEXT NOT NULL UNIQUE,
          tag_type TEXT NOT NULL,
          name TEXT NOT NULL,
          project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done','blocked','orphaned')),
          blocking_reason TEXT,
          linked_devtag_id TEXT REFERENCES devtags(id) ON DELETE SET NULL,
          cycle_id TEXT,
          metadata TEXT DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Buildtag registry: action/build tags
        CREATE TABLE IF NOT EXISTS buildtags (
          id TEXT PRIMARY KEY,
          tag_key TEXT NOT NULL,
          tag_type TEXT NOT NULL,
          target_devtag_id TEXT REFERENCES devtags(id) ON DELETE SET NULL,
          agent_id TEXT NOT NULL,
          project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
          cycle_id TEXT,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','validated','executing','committed','failed','reverted','orphaned')),
          plantag_id TEXT REFERENCES plantags(id) ON DELETE SET NULL,
          commit_id TEXT,
          metadata TEXT DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Tag relationship schema rules (deterministic constraint table)
        CREATE TABLE IF NOT EXISTS tag_relationship_rules (
          id TEXT PRIMARY KEY,
          rule_type TEXT NOT NULL CHECK (rule_type IN ('parent_child','peer','requires_target')),
          child_tag_type TEXT NOT NULL,
          parent_tag_type TEXT NOT NULL,
          strict INTEGER NOT NULL DEFAULT 1,
          description TEXT DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Pending registry partition (for Diff Sub-Agent)
        CREATE TABLE IF NOT EXISTS devtag_pending (
          id TEXT PRIMARY KEY,
          cycle_id TEXT NOT NULL,
          buildtag_id TEXT REFERENCES buildtags(id) ON DELETE CASCADE,
          predicted_state TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Devtag claim locks (for Conflict Sub-Agent)
        CREATE TABLE IF NOT EXISTS devtag_claims (
          id TEXT PRIMARY KEY,
          devtag_id TEXT NOT NULL REFERENCES devtags(id) ON DELETE CASCADE,
          agent_id TEXT NOT NULL,
          cycle_id TEXT NOT NULL,
          claimed_at TEXT NOT NULL DEFAULT (datetime('now')),
          released_at TEXT,
          UNIQUE(devtag_id, agent_id, cycle_id)
        );

        -- Context window exclusion log
        CREATE TABLE IF NOT EXISTS context_window_exclusions (
          id TEXT PRIMARY KEY,
          cycle_id TEXT NOT NULL,
          agent_id TEXT NOT NULL,
          excluded_tag_id TEXT REFERENCES devtags(id) ON DELETE CASCADE,
          exclusion_reason TEXT NOT NULL,
          rank_score REAL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_devtags_project ON devtags(project_id);
        CREATE INDEX IF NOT EXISTS idx_devtags_status ON devtags(status);
        CREATE INDEX IF NOT EXISTS idx_devtags_type ON devtags(tag_type);
        CREATE INDEX IF NOT EXISTS idx_devtags_file ON devtags(file_path);
        CREATE INDEX IF NOT EXISTS idx_plantags_project ON plantags(project_id);
        CREATE INDEX IF NOT EXISTS idx_plantags_status ON plantags(status);
        CREATE INDEX IF NOT EXISTS idx_buildtags_project ON buildtags(project_id);
        CREATE INDEX IF NOT EXISTS idx_buildtags_agent ON buildtags(agent_id);
        CREATE INDEX IF NOT EXISTS idx_buildtags_cycle ON buildtags(cycle_id);
        CREATE INDEX IF NOT EXISTS idx_devtag_claims_devtag ON devtag_claims(devtag_id);
        CREATE INDEX IF NOT EXISTS idx_devtag_claims_agent ON devtag_claims(agent_id);
        CREATE INDEX IF NOT EXISTS idx_devtag_pending_cycle ON devtag_pending(cycle_id);
        CREATE INDEX IF NOT EXISTS idx_cwexclusions_cycle ON context_window_exclusions(cycle_id);

        -- Seed tag relationship rules from spec
        INSERT OR IGNORE INTO tag_relationship_rules (id,rule_type,child_tag_type,parent_tag_type,description) VALUES
          ('r1','parent_child','method','class','devtag:method requires parent devtag:class'),
          ('r2','parent_child','field','schema','devtag:field requires parent devtag:schema or devtag:model'),
          ('r3','parent_child','field','model','devtag:field requires parent devtag:model'),
          ('r4','parent_child','prop','component','devtag:prop requires parent devtag:component'),
          ('r5','parent_child','stage','pipeline','devtag:stage requires parent devtag:pipeline'),
          ('r6','parent_child','nano:node','nano:layer','devtag:nano:node requires parent devtag:nano:layer'),
          ('r7','parent_child','nano:layer','nano:module','devtag:nano:layer requires parent devtag:nano:module'),
          ('r8','parent_child','nano:weight:frozen','nano:module','devtag:nano:weight:frozen requires parent devtag:nano:module'),
          ('r9','parent_child','nano:weight:personal','nano:module','devtag:nano:weight:personal requires parent devtag:nano:module'),
          ('r10','parent_child','nano:rby:r','nano:trifecta','devtag:nano:rby:r requires parent devtag:nano:trifecta'),
          ('r11','parent_child','nano:rby:b','nano:trifecta','devtag:nano:rby:b requires parent devtag:nano:trifecta'),
          ('r12','parent_child','nano:rby:y','nano:trifecta','devtag:nano:rby:y requires parent devtag:nano:trifecta'),
          ('r13','peer','calls','function','devtag:calls requires caller and callee to be function or method'),
          ('r14','peer','depends_on','*','devtag:depends_on requires both a and b to exist in registry'),
          ('r15','peer','subscribes_to','event','devtag:subscribes_to requires event to exist as devtag:event'),
          ('r16','peer','publishes','event','devtag:publishes requires event to exist as devtag:event'),
          ('r17','requires_target','overrides','inherits','devtag:overrides requires parent devtag:inherits or devtag:extends'),
          ('r18','requires_target','injected_into','function','devtag:injected_into requires target devtag:function or method or class');
      `);
    },
  },

  // ──────────────────────────────────────────
  // Migration v6: Forensic Database (addendum tables)
  // ──────────────────────────────────────────
  {
    version: 6,
    name: 'forensic_addendum_tables',
    up(db: Database.Database) {
      db.exec(`
        -- regression_history: per-committed-step regression records
        CREATE TABLE IF NOT EXISTS regression_history (
          entry_id TEXT PRIMARY KEY,
          devtag TEXT NOT NULL,
          file TEXT NOT NULL,
          line_start INTEGER,
          line_end INTEGER,
          cause_buildtag_id TEXT REFERENCES buildtags(id) ON DELETE SET NULL,
          cause_agent_id TEXT NOT NULL,
          prior_plantag_status TEXT NOT NULL,
          cycle_id TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- conflict_log: devtag claim conflicts between parallel agents
        CREATE TABLE IF NOT EXISTS conflict_log (
          entry_id TEXT PRIMARY KEY,
          devtag_claimed TEXT NOT NULL,
          claiming_agent_id TEXT NOT NULL,
          blocked_agent_id TEXT NOT NULL,
          resolution TEXT NOT NULL DEFAULT 'queued' CHECK (resolution IN ('queued','released','deadlock','escalated','timeout')),
          wait_cycles INTEGER DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- dead_tags: devtags that no longer correspond to existing code
        CREATE TABLE IF NOT EXISTS dead_tags (
          entry_id TEXT PRIMARY KEY,
          devtag TEXT NOT NULL,
          last_known_file TEXT NOT NULL,
          last_known_line INTEGER,
          detected_cycle INTEGER NOT NULL,
          retirement_scheduled_cycle INTEGER,
          resolved INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- diff_failures: Diff Sub-Agent predicted state mismatches
        CREATE TABLE IF NOT EXISTS diff_failures (
          entry_id TEXT PRIMARY KEY,
          buildtag_set TEXT NOT NULL,
          predicted_devtag_state TEXT NOT NULL,
          required_plantag_state TEXT NOT NULL,
          mismatch_detail TEXT NOT NULL,
          agent_id TEXT NOT NULL,
          cycle_id TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- integration_failures: Integration Verification Sub-Agent results
        CREATE TABLE IF NOT EXISTS integration_failures (
          entry_id TEXT PRIMARY KEY,
          new_devtag TEXT NOT NULL,
          missing_connected_devtag TEXT NOT NULL,
          relationship_type TEXT NOT NULL,
          file TEXT NOT NULL,
          agent_id TEXT NOT NULL,
          severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','error','critical','fatal')),
          cycle_id TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- version_commits: Version Control Agent commit records
        CREATE TABLE IF NOT EXISTS version_commits (
          commit_id TEXT PRIMARY KEY,
          buildtag_set TEXT NOT NULL,
          devtag_state_before TEXT NOT NULL,
          devtag_state_after TEXT NOT NULL,
          plantags_satisfied TEXT NOT NULL DEFAULT '[]',
          agent_id TEXT NOT NULL,
          reverted INTEGER NOT NULL DEFAULT 0,
          revert_timestamp TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- nano_anomalies: Nano Liaison Agent anomaly records
        CREATE TABLE IF NOT EXISTS nano_anomalies (
          entry_id TEXT PRIMARY KEY,
          nano_devtag TEXT NOT NULL,
          anomaly_type TEXT NOT NULL CHECK (anomaly_type IN ('nan_weights','inf_weights','identical_generation','rby_stall','other')),
          cycle_id TEXT NOT NULL,
          generation_id TEXT,
          matrix_name TEXT,
          detail TEXT NOT NULL,
          agent_id TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- spawn_violations: unauthorized spawn attempts
        CREATE TABLE IF NOT EXISTS spawn_violations (
          entry_id TEXT PRIMARY KEY,
          requesting_agent_id TEXT NOT NULL,
          requested_sub_agent TEXT NOT NULL,
          authority_chart_result TEXT NOT NULL,
          blocked INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- systemic_regressions: Regression Agent pattern reports
        CREATE TABLE IF NOT EXISTS systemic_regressions (
          entry_id TEXT PRIMARY KEY,
          dimension TEXT NOT NULL CHECK (dimension IN ('devtag','file','agent_id','build_phase')),
          dimension_value TEXT NOT NULL,
          regression_count INTEGER NOT NULL,
          cycle_window INTEGER NOT NULL,
          affected_devtags TEXT NOT NULL DEFAULT '[]',
          suggested_guard_tags TEXT NOT NULL DEFAULT '[]',
          flagged_to_god_factory INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- tag_mismatches: base spec forensic table (referenced in retirement chart)
        CREATE TABLE IF NOT EXISTS tag_mismatches (
          entry_id TEXT PRIMARY KEY,
          devtag TEXT NOT NULL,
          mismatch_type TEXT NOT NULL,
          severity TEXT NOT NULL DEFAULT 'error' CHECK (severity IN ('info','warning','error','critical','fatal')),
          previous_occurrences INTEGER NOT NULL DEFAULT 0,
          cycle_id TEXT,
          file TEXT,
          agent_id TEXT,
          escalated INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_regression_devtag ON regression_history(devtag);
        CREATE INDEX IF NOT EXISTS idx_regression_cycle ON regression_history(cycle_id);
        CREATE INDEX IF NOT EXISTS idx_conflict_log_devtag ON conflict_log(devtag_claimed);
        CREATE INDEX IF NOT EXISTS idx_dead_tags_devtag ON dead_tags(devtag);
        CREATE INDEX IF NOT EXISTS idx_diff_failures_cycle ON diff_failures(cycle_id);
        CREATE INDEX IF NOT EXISTS idx_integration_failures_cycle ON integration_failures(cycle_id);
        CREATE INDEX IF NOT EXISTS idx_version_commits_agent ON version_commits(agent_id);
        CREATE INDEX IF NOT EXISTS idx_nano_anomalies_cycle ON nano_anomalies(cycle_id);
        CREATE INDEX IF NOT EXISTS idx_spawn_violations_agent ON spawn_violations(requesting_agent_id);
        CREATE INDEX IF NOT EXISTS idx_systemic_regressions_dim ON systemic_regressions(dimension, dimension_value);
        CREATE INDEX IF NOT EXISTS idx_tag_mismatches_devtag ON tag_mismatches(devtag);
        CREATE INDEX IF NOT EXISTS idx_tag_mismatches_severity ON tag_mismatches(severity);
      `);
    },
  },

  // ──────────────────────────────────────────
  // Migration v7: Addendum schema completions
  // build_phase in regression_history, missing
  // relationship rules, failure_escalation_log
  // ──────────────────────────────────────────
  {
    version: 7,
    name: 'addendum_schema_completions',
    up(db: Database.Database) {
      db.exec(`
        -- Add build_phase to regression_history (used by Regression Agent systemic analysis)
        ALTER TABLE regression_history ADD COLUMN build_phase TEXT;

        -- failure_escalation_log: tracks Builder/Command Agent failure escalation levels
        CREATE TABLE IF NOT EXISTS failure_escalation_log (
          entry_id TEXT PRIMARY KEY,
          decision_cycle_id TEXT NOT NULL,
          step_id TEXT,
          level INTEGER NOT NULL CHECK (level IN (1,2,3,4,5)),
          fail_count INTEGER NOT NULL DEFAULT 1,
          agent_id TEXT NOT NULL,
          action_taken TEXT NOT NULL,
          plantag_id TEXT REFERENCES plantags(id) ON DELETE SET NULL,
          detail TEXT DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_fail_esc_cycle ON failure_escalation_log(decision_cycle_id);
        CREATE INDEX IF NOT EXISTS idx_fail_esc_level ON failure_escalation_log(level);
        CREATE INDEX IF NOT EXISTS idx_regression_phase ON regression_history(build_phase);

        -- Seed missing relationship rules
        INSERT OR IGNORE INTO tag_relationship_rules (id,rule_type,child_tag_type,parent_tag_type,description) VALUES
          ('r13b','peer','calls','method','devtag:calls also requires caller and callee to be method'),
          ('r19','requires_target','symlink','file','devtag:symlink requires target devtag:file or devtag:directory'),
          ('r20','peer','circular_dependency','*','devtag:circular_dependency is only valid when both devtag_a and devtag_b exist and devtag:depends_on chains between them are verified');
      `);
    },
  },

  // ──────────────────────────────────────────
  // Migration v8: Gap Analysis System Tables
  // ──────────────────────────────────────────
  {
    version: 8,
    name: 'gap_analysis_tables',
    up(db: Database.Database) {
      db.exec(`
        -- coverage_matrix: Coverage Analysis Agent output
        CREATE TABLE IF NOT EXISTS coverage_matrix (
          entry_id TEXT PRIMARY KEY,
          scope TEXT NOT NULL CHECK (scope IN ('plan','test','nano','total')),
          plantag_or_devtag TEXT NOT NULL,
          coverage_state TEXT NOT NULL CHECK (coverage_state IN ('covered','partial','missing','not_required')),
          coverage_percent REAL NOT NULL DEFAULT 0,
          missing_tags TEXT NOT NULL DEFAULT '[]',
          cycle_id TEXT NOT NULL,
          timestamp TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_coverage_matrix_scope ON coverage_matrix(scope);
        CREATE INDEX IF NOT EXISTS idx_coverage_matrix_cycle ON coverage_matrix(cycle_id);
        CREATE INDEX IF NOT EXISTS idx_coverage_matrix_tag ON coverage_matrix(plantag_or_devtag);

        -- patterns: Pattern Recognition Agent registry
        CREATE TABLE IF NOT EXISTS patterns (
          pattern_id TEXT PRIMARY KEY,
          failure_type TEXT NOT NULL,
          devtag_type TEXT NOT NULL,
          agent_category TEXT NOT NULL,
          build_phase TEXT NOT NULL DEFAULT '',
          first_occurrence TEXT NOT NULL DEFAULT (datetime('now')),
          recurrence_count INTEGER NOT NULL DEFAULT 1,
          severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','error','critical','fatal')),
          severity_trend TEXT NOT NULL DEFAULT 'stable' CHECK (severity_trend IN ('stable','escalating','de-escalating')),
          contributing_forensic_ids TEXT NOT NULL DEFAULT '[]',
          flagged_to_god_factory INTEGER NOT NULL DEFAULT 0,
          is_anti_pattern INTEGER NOT NULL DEFAULT 0,
          anti_pattern_type TEXT,
          timestamp TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_patterns_type ON patterns(failure_type);
        CREATE INDEX IF NOT EXISTS idx_patterns_severity ON patterns(severity);
        CREATE INDEX IF NOT EXISTS idx_patterns_flagged ON patterns(flagged_to_god_factory);

        -- debt_history: Debt Tracking Agent history
        CREATE TABLE IF NOT EXISTS debt_history (
          entry_id TEXT PRIMARY KEY,
          file_path TEXT NOT NULL,
          debt_score REAL NOT NULL DEFAULT 0,
          score_breakdown TEXT NOT NULL DEFAULT '{}',
          ceiling REAL NOT NULL DEFAULT 15,
          ceiling_exceeded INTEGER NOT NULL DEFAULT 0,
          cycle_id TEXT NOT NULL,
          timestamp TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_debt_history_file ON debt_history(file_path);
        CREATE INDEX IF NOT EXISTS idx_debt_history_exceeded ON debt_history(ceiling_exceeded);
        CREATE INDEX IF NOT EXISTS idx_debt_history_cycle ON debt_history(cycle_id);

        -- tag_collisions: Tag System Analysis Agent — duplicate name detection
        CREATE TABLE IF NOT EXISTS tag_collisions (
          entry_id TEXT PRIMARY KEY,
          devtag_name TEXT NOT NULL,
          file_a TEXT NOT NULL,
          parent_a TEXT,
          file_b TEXT NOT NULL,
          parent_b TEXT,
          detected_cycle TEXT NOT NULL,
          resolved INTEGER NOT NULL DEFAULT 0,
          timestamp TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_tag_collisions_name ON tag_collisions(devtag_name);
        CREATE INDEX IF NOT EXISTS idx_tag_collisions_resolved ON tag_collisions(resolved);

        -- agent_performance: Agent Performance Analysis Agent metrics
        CREATE TABLE IF NOT EXISTS agent_performance (
          entry_id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL,
          cycle_id TEXT NOT NULL,
          conformance_rate REAL NOT NULL DEFAULT 0,
          retry_rate REAL NOT NULL DEFAULT 0,
          escalation_rate REAL NOT NULL DEFAULT 0,
          cycle_contribution INTEGER NOT NULL DEFAULT 0,
          regression_contribution INTEGER NOT NULL DEFAULT 0,
          spawn_efficiency REAL NOT NULL DEFAULT 0,
          context_efficiency REAL NOT NULL DEFAULT 0,
          timestamp TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_agent_perf_agent ON agent_performance(agent_id);
        CREATE INDEX IF NOT EXISTS idx_agent_perf_cycle ON agent_performance(cycle_id);

        -- tag_resolution_log: all tag resolution + gap tool call timing
        CREATE TABLE IF NOT EXISTS tag_resolution_log (
          entry_id TEXT PRIMARY KEY,
          tag_type TEXT NOT NULL,
          tag_id TEXT,
          agent_id TEXT NOT NULL,
          model_tier TEXT NOT NULL DEFAULT 'unknown',
          resolution_time_ms INTEGER NOT NULL DEFAULT 0,
          cache_hit INTEGER NOT NULL DEFAULT 0,
          cycle_id TEXT NOT NULL,
          timestamp TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_tag_res_type ON tag_resolution_log(tag_type);
        CREATE INDEX IF NOT EXISTS idx_tag_res_agent ON tag_resolution_log(agent_id);
        CREATE INDEX IF NOT EXISTS idx_tag_res_cycle ON tag_resolution_log(cycle_id);
        CREATE INDEX IF NOT EXISTS idx_tag_res_slow ON tag_resolution_log(resolution_time_ms);

        -- gap_reports: Gap Analysis Agent synthesized reports
        CREATE TABLE IF NOT EXISTS gap_reports (
          report_id TEXT PRIMARY KEY,
          cycle_range_start INTEGER NOT NULL,
          cycle_range_end INTEGER NOT NULL,
          session_id TEXT NOT NULL,
          gap_category TEXT NOT NULL CHECK (gap_category IN ('coverage','structural','process','tag_system','agent_performance')),
          affected_tags TEXT NOT NULL DEFAULT '[]',
          affected_agents TEXT NOT NULL DEFAULT '[]',
          affected_files TEXT NOT NULL DEFAULT '[]',
          severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','error','critical','fatal')),
          pattern_id TEXT REFERENCES patterns(pattern_id) ON DELETE SET NULL,
          recommended_action_tags TEXT NOT NULL DEFAULT '[]',
          forensic_entry_ids TEXT NOT NULL DEFAULT '[]',
          flagged_to_god_factory INTEGER NOT NULL DEFAULT 0,
          timestamp TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_gap_reports_category ON gap_reports(gap_category);
        CREATE INDEX IF NOT EXISTS idx_gap_reports_severity ON gap_reports(severity);
        CREATE INDEX IF NOT EXISTS idx_gap_reports_session ON gap_reports(session_id);
        CREATE INDEX IF NOT EXISTS idx_gap_reports_flagged ON gap_reports(flagged_to_god_factory);

        -- vocabulary_gaps: Tag System Analysis Agent — untagged structure findings
        CREATE TABLE IF NOT EXISTS vocabulary_gaps (
          entry_id TEXT PRIMARY KEY,
          file_path TEXT NOT NULL,
          untagged_structure_type TEXT NOT NULL,
          occurrence_count INTEGER NOT NULL DEFAULT 1,
          first_detected_cycle TEXT NOT NULL,
          resolved INTEGER NOT NULL DEFAULT 0,
          proposed_tag_type TEXT,
          timestamp TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_vocab_gaps_file ON vocabulary_gaps(file_path);
        CREATE INDEX IF NOT EXISTS idx_vocab_gaps_resolved ON vocabulary_gaps(resolved);
        CREATE INDEX IF NOT EXISTS idx_vocab_gaps_type ON vocabulary_gaps(untagged_structure_type);

        -- spaghetti_index: referenced by Debt Tracking Agent formula
        CREATE TABLE IF NOT EXISTS spaghetti_index (
          entry_id TEXT PRIMARY KEY,
          file_path TEXT NOT NULL,
          module_devtag TEXT NOT NULL,
          edge_count INTEGER NOT NULL DEFAULT 0,
          test_coverage_delta REAL NOT NULL DEFAULT 0,
          cycle_id TEXT NOT NULL,
          detected_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_spaghetti_file ON spaghetti_index(file_path);

        -- under_engineered_regions: referenced by Debt Tracking Agent formula
        CREATE TABLE IF NOT EXISTS under_engineered_regions (
          entry_id TEXT PRIMARY KEY,
          file_path TEXT NOT NULL,
          region_type TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          cycle_id TEXT NOT NULL,
          detected_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- over_engineered_regions: referenced by Debt Tracking Agent formula
        CREATE TABLE IF NOT EXISTS over_engineered_regions (
          entry_id TEXT PRIMARY KEY,
          file_path TEXT NOT NULL,
          region_type TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          cycle_id TEXT NOT NULL,
          detected_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    },
  },

  // ──────────────────────────────────────────
  // Migration v9: Blame Crawler full schema
  // + suggested jobs persistence
  // ──────────────────────────────────────────
  {
    version: 9,
    name: 'blame_crawler_full_schema',
    up(db: Database.Database) {
      const hasColumn = (table: string, column: string): boolean => {
        const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
        return cols.some(c => c.name === column);
      };

      const addColumnIfMissing = (table: string, sql: string, column: string) => {
        if (!hasColumn(table, column)) {
          db.exec(`ALTER TABLE ${table} ADD COLUMN ${sql}`);
        }
      };

      db.exec(`
        CREATE TABLE IF NOT EXISTS suggested_jobs (
          id TEXT PRIMARY KEY,
          category TEXT NOT NULL,
          source TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
          payload TEXT NOT NULL DEFAULT '{}',
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','dismissed')),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_suggested_jobs_category ON suggested_jobs(category);
        CREATE INDEX IF NOT EXISTS idx_suggested_jobs_status ON suggested_jobs(status);

        CREATE TABLE IF NOT EXISTS output_capture_events (
          id TEXT PRIMARY KEY,
          blame_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          payload TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_output_capture_events_blame ON output_capture_events(blame_id);
      `);

      // blame_records full spec columns
      addColumnIfMissing('blame_records', 'blame_id TEXT', 'blame_id');
      addColumnIfMissing('blame_records', 'model_id TEXT', 'model_id');
      addColumnIfMissing('blame_records', 'model_provider TEXT', 'model_provider');
      addColumnIfMissing('blame_records', 'model_name TEXT', 'model_name');
      addColumnIfMissing('blame_records', 'model_version TEXT', 'model_version');
      addColumnIfMissing('blame_records', 'context_window_tokens INTEGER', 'context_window_tokens');
      addColumnIfMissing('blame_records', 'output_tokens_allowed INTEGER', 'output_tokens_allowed');
      addColumnIfMissing('blame_records', 'context_utilization_percent REAL', 'context_utilization_percent');
      addColumnIfMissing('blame_records', 'output_utilization_percent REAL', 'output_utilization_percent');
      addColumnIfMissing('blame_records', 'agent_id TEXT', 'agent_id');
      addColumnIfMissing('blame_records', 'agent_role TEXT', 'agent_role');
      addColumnIfMissing('blame_records', 'interaction_type TEXT', 'interaction_type');
      addColumnIfMissing('blame_records', 'build_phase TEXT', 'build_phase');
      addColumnIfMissing('blame_records', 'cycle_id TEXT', 'cycle_id');
      addColumnIfMissing('blame_records', 'session_id TEXT', 'session_id');
      addColumnIfMissing('blame_records', 'decided_step_id TEXT', 'decided_step_id');
      addColumnIfMissing('blame_records', 'plantag_references TEXT DEFAULT "[]"', 'plantag_references');
      addColumnIfMissing('blame_records', 'devtag_references TEXT DEFAULT "[]"', 'devtag_references');
      addColumnIfMissing('blame_records', 'buildtag_references TEXT DEFAULT "[]"', 'buildtag_references');
      addColumnIfMissing('blame_records', 'tag_validation_result TEXT', 'tag_validation_result');
      addColumnIfMissing('blame_records', 'tag_validation_failure_codes TEXT DEFAULT "[]"', 'tag_validation_failure_codes');
      addColumnIfMissing('blame_records', 'retry_count INTEGER DEFAULT 0', 'retry_count');
      addColumnIfMissing('blame_records', 'escalation_level INTEGER DEFAULT 0', 'escalation_level');
      addColumnIfMissing('blame_records', 'output_hash TEXT', 'output_hash');
      addColumnIfMissing('blame_records', 'drift_detected INTEGER DEFAULT 0', 'drift_detected');
      addColumnIfMissing('blame_records', 'forensic_entry_ids TEXT DEFAULT "[]"', 'forensic_entry_ids');
      addColumnIfMissing('blame_records', 'duration_ms INTEGER', 'duration_ms');
      addColumnIfMissing('blame_records', 'timestamp TEXT', 'timestamp');

      // quality_records full spec columns
      addColumnIfMissing('quality_records', 'quality_id TEXT', 'quality_id');
      addColumnIfMissing('quality_records', 'model_id TEXT', 'model_id');
      addColumnIfMissing('quality_records', 'tag_conformance_score REAL', 'tag_conformance_score');
      addColumnIfMissing('quality_records', 'context_utilization_score REAL', 'context_utilization_score');
      addColumnIfMissing('quality_records', 'instruction_adherence_score REAL', 'instruction_adherence_score');
      addColumnIfMissing('quality_records', 'hallucination_rate REAL', 'hallucination_rate');
      addColumnIfMissing('quality_records', 'structural_integrity_score REAL', 'structural_integrity_score');
      addColumnIfMissing('quality_records', 'regression_risk_score REAL', 'regression_risk_score');
      addColumnIfMissing('quality_records', 'output_efficiency_score REAL', 'output_efficiency_score');
      addColumnIfMissing('quality_records', 'composite_quality_score REAL', 'composite_quality_score');
      addColumnIfMissing('quality_records', 'failure_modes TEXT DEFAULT "[]"', 'failure_modes');
      addColumnIfMissing('quality_records', 'cycle_id TEXT', 'cycle_id');
      addColumnIfMissing('quality_records', 'timestamp TEXT', 'timestamp');

      // tool_criticism_records full spec columns
      addColumnIfMissing('tool_criticism_records', 'criticism_id TEXT', 'criticism_id');
      addColumnIfMissing('tool_criticism_records', 'model_id TEXT', 'model_id');
      addColumnIfMissing('tool_criticism_records', 'interaction_type TEXT', 'interaction_type');
      addColumnIfMissing('tool_criticism_records', 'failing_quality_dimensions TEXT DEFAULT "[]"', 'failing_quality_dimensions');
      addColumnIfMissing('tool_criticism_records', 'active_tool_configs TEXT DEFAULT "[]"', 'active_tool_configs');
      addColumnIfMissing('tool_criticism_records', 'active_prompt_structures TEXT DEFAULT "[]"', 'active_prompt_structures');
      addColumnIfMissing('tool_criticism_records', 'failure_pattern TEXT', 'failure_pattern');
      addColumnIfMissing('tool_criticism_records', 'proposed_tool_modifications TEXT DEFAULT "[]"', 'proposed_tool_modifications');
      addColumnIfMissing('tool_criticism_records', 'proposed_new_tools TEXT DEFAULT "[]"', 'proposed_new_tools');
      addColumnIfMissing('tool_criticism_records', 'scales_to_model_tiers TEXT DEFAULT "[]"', 'scales_to_model_tiers');
      addColumnIfMissing('tool_criticism_records', 'suggested_job_id TEXT', 'suggested_job_id');
      addColumnIfMissing('tool_criticism_records', 'cycle_id TEXT', 'cycle_id');
      addColumnIfMissing('tool_criticism_records', 'timestamp TEXT', 'timestamp');

      // blame_successes full spec columns
      addColumnIfMissing('blame_successes', 'success_id TEXT', 'success_id');
      addColumnIfMissing('blame_successes', 'model_id TEXT', 'model_id');
      addColumnIfMissing('blame_successes', 'interaction_type TEXT', 'interaction_type');
      addColumnIfMissing('blame_successes', 'composite_quality_score_avg REAL', 'composite_quality_score_avg');
      addColumnIfMissing('blame_successes', 'prompt_structure_ids TEXT DEFAULT "[]"', 'prompt_structure_ids');
      addColumnIfMissing('blame_successes', 'tool_config_ids TEXT DEFAULT "[]"', 'tool_config_ids');
      addColumnIfMissing('blame_successes', 'context_size_tokens INTEGER', 'context_size_tokens');
      addColumnIfMissing('blame_successes', 'tag_types_involved TEXT DEFAULT "[]"', 'tag_types_involved');
      addColumnIfMissing('blame_successes', 'model_tier INTEGER', 'model_tier');
      addColumnIfMissing('blame_successes', 'consecutive_count INTEGER DEFAULT 0', 'consecutive_count');
      addColumnIfMissing('blame_successes', 'suggested_job_id TEXT', 'suggested_job_id');
      addColumnIfMissing('blame_successes', 'cycle_id TEXT', 'cycle_id');
      addColumnIfMissing('blame_successes', 'timestamp TEXT', 'timestamp');

      // model_registry full spec columns
      addColumnIfMissing('model_registry', 'model_name TEXT', 'model_name');
      addColumnIfMissing('model_registry', 'model_version TEXT', 'model_version');
      addColumnIfMissing('model_registry', 'context_window_tokens INTEGER', 'context_window_tokens');
      addColumnIfMissing('model_registry', 'safe_prompt_ceiling_tokens INTEGER', 'safe_prompt_ceiling_tokens');
      addColumnIfMissing('model_registry', 'safe_output_ceiling_tokens INTEGER', 'safe_output_ceiling_tokens');
      addColumnIfMissing('model_registry', 'model_tier INTEGER', 'model_tier');
      addColumnIfMissing('model_registry', 'observed_conformance_rate REAL', 'observed_conformance_rate');
      addColumnIfMissing('model_registry', 'observed_retry_rate REAL', 'observed_retry_rate');
      addColumnIfMissing('model_registry', 'observed_hallucination_rate REAL', 'observed_hallucination_rate');
      addColumnIfMissing('model_registry', 'observed_context_loss_threshold_tokens INTEGER', 'observed_context_loss_threshold_tokens');
      addColumnIfMissing('model_registry', 'observed_spaghetti_rate REAL', 'observed_spaghetti_rate');
      addColumnIfMissing('model_registry', 'observed_ai_slop_rate REAL', 'observed_ai_slop_rate');
      addColumnIfMissing('model_registry', 'observed_avg_output_tokens INTEGER', 'observed_avg_output_tokens');
      addColumnIfMissing('model_registry', 'observed_avg_duration_ms INTEGER', 'observed_avg_duration_ms');
      addColumnIfMissing('model_registry', 'strengths TEXT DEFAULT "[]"', 'strengths');
      addColumnIfMissing('model_registry', 'weaknesses TEXT DEFAULT "[]"', 'weaknesses');
      addColumnIfMissing('model_registry', 'recommended_interaction_types TEXT DEFAULT "[]"', 'recommended_interaction_types');
      addColumnIfMissing('model_registry', 'avoided_interaction_types TEXT DEFAULT "[]"', 'avoided_interaction_types');
      addColumnIfMissing('model_registry', 'tool_configs_generated TEXT DEFAULT "[]"', 'tool_configs_generated');
      addColumnIfMissing('model_registry', 'last_updated_cycle INTEGER', 'last_updated_cycle');
      addColumnIfMissing('model_registry', 'last_updated_by TEXT', 'last_updated_by');

      // Now that columns exist, create the indexes that reference them
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_quality_model ON quality_records(model_id);
        CREATE INDEX IF NOT EXISTS idx_quality_composite ON quality_records(composite_quality_score);
        CREATE INDEX IF NOT EXISTS idx_tool_crit_model_interaction ON tool_criticism_records(model_id, interaction_type);
        CREATE INDEX IF NOT EXISTS idx_blame_success_model_interaction ON blame_successes(model_id, interaction_type);
      `);

      // Seed/backfill derived alias columns
      db.exec(`
        UPDATE blame_records
        SET
          blame_id = COALESCE(blame_id, id),
          model_id = COALESCE(model_id, model),
          interaction_type = COALESCE(interaction_type, mode),
          duration_ms = COALESCE(duration_ms, latency_ms),
          timestamp = COALESCE(timestamp, created_at)
        WHERE blame_id IS NULL OR model_id IS NULL OR interaction_type IS NULL OR duration_ms IS NULL OR timestamp IS NULL;

        UPDATE quality_records
        SET
          quality_id = COALESCE(quality_id, id),
          tag_conformance_score = COALESCE(tag_conformance_score, tag_conformance),
          instruction_adherence_score = COALESCE(instruction_adherence_score, instruction_adherence),
          hallucination_rate = COALESCE(hallucination_rate, hallucination),
          structural_integrity_score = COALESCE(structural_integrity_score, structural_integrity),
          output_efficiency_score = COALESCE(output_efficiency_score, output_efficiency),
          timestamp = COALESCE(timestamp, crawled_at)
        WHERE quality_id IS NULL OR timestamp IS NULL;

        UPDATE model_registry
        SET
          model_name = COALESCE(model_name, display_name),
          model_version = COALESCE(model_version, 'unknown'),
          observed_avg_output_tokens = COALESCE(observed_avg_output_tokens, CAST(total_tokens / CASE WHEN total_runs > 0 THEN total_runs ELSE 1 END AS INTEGER)),
          observed_avg_duration_ms = COALESCE(observed_avg_duration_ms, CAST(avg_latency_ms AS INTEGER))
        WHERE model_name IS NULL OR model_version IS NULL;
      `);
    },
  },

  // ──────────────────────────────────────────
  // Migration v10: Project State Crawler tables
  // ──────────────────────────────────────────
  {
    version: 10,
    name: 'project_state_crawler_tables',
    up(db: Database.Database) {
      db.exec(`
        -- Ground truth snapshots: one per crawl run
        CREATE TABLE IF NOT EXISTS ground_truth_snapshots (
          id TEXT PRIMARY KEY,
          snapshot_id TEXT NOT NULL UNIQUE,
          cycle_id TEXT NOT NULL,
          total_devtags INTEGER NOT NULL DEFAULT 0,
          registry_surplus_count INTEGER NOT NULL DEFAULT 0,
          registry_deficit_count INTEGER NOT NULL DEFAULT 0,
          content_drift_count INTEGER NOT NULL DEFAULT 0,
          location_drift_count INTEGER NOT NULL DEFAULT 0,
          systemic_drift_flagged INTEGER NOT NULL DEFAULT 0,
          parse_duration_ms INTEGER NOT NULL DEFAULT 0,
          project_path TEXT NOT NULL DEFAULT '',
          total_files INTEGER NOT NULL DEFAULT 0,
          skipped_files_count INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'complete' CHECK (status IN ('running','complete','error')),
          error_message TEXT,
          triggered_by TEXT NOT NULL DEFAULT 'manual',
          timestamp TEXT NOT NULL DEFAULT (datetime('now')),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_gts_snapshot_id ON ground_truth_snapshots(snapshot_id);
        CREATE INDEX IF NOT EXISTS idx_gts_cycle ON ground_truth_snapshots(cycle_id);
        CREATE INDEX IF NOT EXISTS idx_gts_timestamp ON ground_truth_snapshots(timestamp);

        -- Devtags extracted from disk (per snapshot)
        CREATE TABLE IF NOT EXISTS snapshot_devtags (
          id TEXT PRIMARY KEY,
          entry_id TEXT NOT NULL UNIQUE,
          snapshot_id TEXT NOT NULL,
          devtag_type TEXT NOT NULL,
          devtag_name TEXT NOT NULL DEFAULT '',
          file_path TEXT NOT NULL DEFAULT '',
          line_start INTEGER NOT NULL DEFAULT 0,
          line_end INTEGER NOT NULL DEFAULT 0,
          parent_devtag TEXT,
          content_hash TEXT NOT NULL DEFAULT '',
          language TEXT NOT NULL DEFAULT 'unknown',
          relationship_tags TEXT NOT NULL DEFAULT '[]',
          skipped INTEGER NOT NULL DEFAULT 0,
          skip_reason TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_sd_snapshot ON snapshot_devtags(snapshot_id);
        CREATE INDEX IF NOT EXISTS idx_sd_file_path ON snapshot_devtags(file_path);
        CREATE INDEX IF NOT EXISTS idx_sd_devtag_type ON snapshot_devtags(devtag_type);
        CREATE INDEX IF NOT EXISTS idx_sd_devtag_name ON snapshot_devtags(devtag_name);

        -- Drift events: differences between snapshot and registry
        CREATE TABLE IF NOT EXISTS drift_events (
          id TEXT PRIMARY KEY,
          entry_id TEXT NOT NULL UNIQUE,
          snapshot_id TEXT NOT NULL,
          drift_type TEXT NOT NULL CHECK (drift_type IN ('registry_surplus','registry_deficit','content_drift','location_drift')),
          devtag TEXT NOT NULL DEFAULT '',
          devtag_type TEXT,
          file_path TEXT NOT NULL DEFAULT '',
          line_start_registry INTEGER,
          line_start_snapshot INTEGER,
          content_hash_registry TEXT,
          content_hash_snapshot TEXT,
          severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','error')),
          resolved INTEGER NOT NULL DEFAULT 0,
          resolver_agent_id TEXT,
          resolved_at TEXT,
          halted_build_step INTEGER NOT NULL DEFAULT 0,
          systemic INTEGER NOT NULL DEFAULT 0,
          timestamp TEXT NOT NULL DEFAULT (datetime('now')),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_de_snapshot ON drift_events(snapshot_id);
        CREATE INDEX IF NOT EXISTS idx_de_drift_type ON drift_events(drift_type);
        CREATE INDEX IF NOT EXISTS idx_de_severity ON drift_events(severity);
        CREATE INDEX IF NOT EXISTS idx_de_resolved ON drift_events(resolved);
        CREATE INDEX IF NOT EXISTS idx_de_file_path ON drift_events(file_path);

        -- Skipped files log
        CREATE TABLE IF NOT EXISTS psc_skipped_files (
          id TEXT PRIMARY KEY,
          entry_id TEXT NOT NULL UNIQUE,
          snapshot_id TEXT NOT NULL,
          file_path TEXT NOT NULL DEFAULT '',
          skip_reason TEXT NOT NULL DEFAULT 'unknown',
          file_size_bytes INTEGER,
          whitelisted INTEGER NOT NULL DEFAULT 0,
          timestamp TEXT NOT NULL DEFAULT (datetime('now')),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_pscsf_snapshot ON psc_skipped_files(snapshot_id);
        CREATE INDEX IF NOT EXISTS idx_pscsf_file_path ON psc_skipped_files(file_path);

        -- Language registry: extension → grammar
        CREATE TABLE IF NOT EXISTS language_registry (
          id TEXT PRIMARY KEY,
          language_id TEXT NOT NULL UNIQUE,
          file_extension TEXT NOT NULL,
          grammar_name TEXT NOT NULL,
          grammar_version TEXT NOT NULL DEFAULT '1.0.0',
          registered_by TEXT NOT NULL DEFAULT 'system',
          enabled INTEGER NOT NULL DEFAULT 1,
          timestamp TEXT NOT NULL DEFAULT (datetime('now')),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_lr_extension ON language_registry(file_extension);
      `);

      // Seed default language registry
      const langs = [
        ['ts', 'typescript', 'tree-sitter-typescript'],
        ['tsx', 'typescript', 'tree-sitter-typescript'],
        ['js', 'javascript', 'tree-sitter-javascript'],
        ['jsx', 'javascript', 'tree-sitter-javascript'],
        ['mjs', 'javascript', 'tree-sitter-javascript'],
        ['cjs', 'javascript', 'tree-sitter-javascript'],
        ['py', 'python', 'tree-sitter-python'],
        ['rs', 'rust', 'tree-sitter-rust'],
        ['go', 'go', 'tree-sitter-go'],
        ['java', 'java', 'tree-sitter-java'],
        ['c', 'c', 'tree-sitter-c'],
        ['cpp', 'cpp', 'tree-sitter-cpp'],
        ['h', 'c', 'tree-sitter-c'],
        ['hpp', 'cpp', 'tree-sitter-cpp'],
        ['rb', 'ruby', 'tree-sitter-ruby'],
        ['swift', 'swift', 'tree-sitter-swift'],
        ['kt', 'kotlin', 'tree-sitter-kotlin'],
        ['cs', 'csharp', 'tree-sitter-c-sharp'],
        ['php', 'php', 'tree-sitter-php'],
        ['json', 'json', 'tree-sitter-json'],
        ['yaml', 'yaml', 'tree-sitter-yaml'],
        ['yml', 'yaml', 'tree-sitter-yaml'],
        ['md', 'markdown', 'tree-sitter-markdown'],
        ['css', 'css', 'tree-sitter-css'],
        ['html', 'html', 'tree-sitter-html'],
        ['sql', 'sql', 'tree-sitter-sql'],
        ['sh', 'bash', 'tree-sitter-bash'],
        ['bash', 'bash', 'tree-sitter-bash'],
        ['toml', 'toml', 'tree-sitter-toml'],
        ['xml', 'xml', 'tree-sitter-xml'],
      ];
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO language_registry (id, language_id, file_extension, grammar_name, grammar_version, registered_by)
        VALUES (?, ?, ?, ?, '1.0.0', 'system')
      `);
      for (const [ext, lang, grammar] of langs) {
        stmt.run(randomUUID(), `${lang}_${ext}`, ext, grammar);
      }
    },
  },

  // ──────────────────────────────────────────
  // Migration v11: PSC whitelist + directory stats
  // ──────────────────────────────────────────
  {
    version: 11,
    name: 'psc_whitelist_and_dir_stats',
    up(db: Database.Database) {
      db.exec(`
        -- psc_whitelist: files/dirs forced to parse regardless of size or extension
        CREATE TABLE IF NOT EXISTS psc_whitelist (
          id TEXT PRIMARY KEY,
          path_pattern TEXT NOT NULL UNIQUE,
          reason TEXT NOT NULL DEFAULT 'manually_added',
          added_by TEXT NOT NULL DEFAULT 'user',
          force_parse INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_psc_whitelist_path ON psc_whitelist(path_pattern);

        -- psc_directory_stats: per-directory devtag counts per snapshot
        CREATE TABLE IF NOT EXISTS psc_directory_stats (
          id TEXT PRIMARY KEY,
          snapshot_id TEXT NOT NULL,
          directory_path TEXT NOT NULL,
          file_count INTEGER NOT NULL DEFAULT 0,
          devtag_count INTEGER NOT NULL DEFAULT 0,
          skipped_count INTEGER NOT NULL DEFAULT 0,
          parse_duration_ms INTEGER NOT NULL DEFAULT 0,
          sub_crawler_status TEXT NOT NULL DEFAULT 'complete' CHECK (sub_crawler_status IN ('complete','error','skipped')),
          error_message TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(snapshot_id, directory_path)
        );
        CREATE INDEX IF NOT EXISTS idx_psc_dir_stats_snapshot ON psc_directory_stats(snapshot_id);
        CREATE INDEX IF NOT EXISTS idx_psc_dir_stats_dir ON psc_directory_stats(directory_path);
      `);
    },
  },

  // ──────────────────────────────────────────
  // Migration v12: Suggested Jobs System
  // ──────────────────────────────────────────
  {
    version: 12,
    name: 'suggested_jobs_system',
    up(db: Database.Database) {
      db.exec(`
        -- job_records: canonical job list (the Judge)
        CREATE TABLE IF NOT EXISTS job_records (
          id TEXT PRIMARY KEY,
          job_id TEXT NOT NULL UNIQUE,
          job_category TEXT NOT NULL CHECK (job_category IN (
            'test_missing','dead_code_removal','debt_reduction','regression_hardening',
            'integration_repair','anti_pattern_mitigation','tag_schema_extension',
            'performance_test_missing','security_gap','nano_coverage_gap',
            'model_tool_enhancement','model_config_promotion','external_project',
            'user_requested','god_factory_scan'
          )),
          source TEXT NOT NULL CHECK (source IN (
            'blame_crawler','suggested_jobs_crawler','user','god_factory_agent'
          )),
          source_record_ids TEXT NOT NULL DEFAULT '[]',
          priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical','high','medium','low')),
          title TEXT NOT NULL,
          affected_files TEXT NOT NULL DEFAULT '[]',
          affected_devtags TEXT NOT NULL DEFAULT '[]',
          affected_plantags TEXT NOT NULL DEFAULT '[]',
          required_buildtags TEXT NOT NULL DEFAULT '[]',
          blocking_jobs TEXT NOT NULL DEFAULT '[]',
          blocked_by_jobs TEXT NOT NULL DEFAULT '[]',
          hierarchy TEXT NOT NULL DEFAULT '{}',
          atomic_steps TEXT NOT NULL DEFAULT '[]',
          sandbox_spec TEXT NOT NULL DEFAULT '{}',
          implementation_status TEXT NOT NULL DEFAULT 'suggested' CHECK (implementation_status IN (
            'suggested','sandbox_ready','implementing','implemented','rejected','archived'
          )),
          created_cycle INTEGER NOT NULL DEFAULT 0,
          last_updated_cycle INTEGER NOT NULL DEFAULT 0,
          timestamp TEXT NOT NULL DEFAULT (datetime('now')),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_job_records_status ON job_records(implementation_status);
        CREATE INDEX IF NOT EXISTS idx_job_records_priority ON job_records(priority, created_cycle);
        CREATE INDEX IF NOT EXISTS idx_job_records_category ON job_records(job_category);
        CREATE INDEX IF NOT EXISTS idx_job_records_source ON job_records(source);

        -- sandbox_runs: per-cycle loop records for each job sandbox
        CREATE TABLE IF NOT EXISTS sandbox_runs (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL UNIQUE,
          job_id TEXT NOT NULL,
          cycle_number INTEGER NOT NULL DEFAULT 0,
          stage TEXT NOT NULL DEFAULT 'building' CHECK (stage IN (
            'building','testing','review','debug','complete','failed'
          )),
          builder_output TEXT,
          test_results TEXT NOT NULL DEFAULT '[]',
          review_findings TEXT NOT NULL DEFAULT '[]',
          debug_records TEXT NOT NULL DEFAULT '[]',
          loop_coordinator_decision TEXT,
          timestamp TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_sandbox_runs_job ON sandbox_runs(job_id);
        CREATE INDEX IF NOT EXISTS idx_sandbox_runs_cycle ON sandbox_runs(job_id, cycle_number);

        -- sj_test_results: structured test outcomes per sandbox cycle
        CREATE TABLE IF NOT EXISTS sj_test_results (
          id TEXT PRIMARY KEY,
          test_id TEXT NOT NULL UNIQUE,
          job_id TEXT NOT NULL,
          sandbox_id TEXT,
          devtag_tested TEXT NOT NULL,
          test_type TEXT NOT NULL DEFAULT 'unit',
          expected_devtag_state TEXT,
          actual_devtag_state TEXT,
          passed INTEGER NOT NULL DEFAULT 0,
          failure_reason_tags TEXT NOT NULL DEFAULT '[]',
          agent_id TEXT,
          cycle_id TEXT,
          timestamp TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_sj_test_results_job ON sj_test_results(job_id);
        CREATE INDEX IF NOT EXISTS idx_sj_test_results_passed ON sj_test_results(job_id, passed);

        -- sj_debug_records: structured debug output from Debug Sub-Agent
        CREATE TABLE IF NOT EXISTS sj_debug_records (
          id TEXT PRIMARY KEY,
          debug_id TEXT NOT NULL UNIQUE,
          test_id TEXT NOT NULL,
          job_id TEXT NOT NULL,
          failing_devtag TEXT NOT NULL,
          failing_test_id TEXT NOT NULL,
          expected_state TEXT,
          actual_state TEXT,
          proposed_buildtag_correction TEXT,
          applied INTEGER NOT NULL DEFAULT 0,
          cycle_id TEXT,
          timestamp TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_sj_debug_job ON sj_debug_records(job_id);

        -- implementation_log: step-by-step implementation pipeline audit
        CREATE TABLE IF NOT EXISTS implementation_log (
          id TEXT PRIMARY KEY,
          log_id TEXT NOT NULL UNIQUE,
          job_id TEXT NOT NULL,
          stage TEXT NOT NULL,
          step_id TEXT,
          buildtag_applied TEXT,
          devtag_state_before TEXT,
          devtag_state_after TEXT,
          validation_result TEXT,
          test_result_ids TEXT NOT NULL DEFAULT '[]',
          cycle_id TEXT,
          timestamp TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_impl_log_job ON implementation_log(job_id);
        CREATE INDEX IF NOT EXISTS idx_impl_log_stage ON implementation_log(job_id, stage);

        -- crash_recovery_log: auto-recovery events for implementation pipeline
        CREATE TABLE IF NOT EXISTS crash_recovery_log (
          id TEXT PRIMARY KEY,
          recovery_id TEXT NOT NULL UNIQUE,
          job_id TEXT,
          stage_at_crash TEXT,
          rollback_point_id TEXT,
          recovery_action TEXT,
          recovery_result TEXT,
          timestamp TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_crash_recovery_job ON crash_recovery_log(job_id);

        -- sj_crawler_state: persistent state for the Suggested Jobs Crawler
        CREATE TABLE IF NOT EXISTS sj_crawler_state (
          id TEXT PRIMARY KEY DEFAULT 'singleton',
          mode TEXT NOT NULL DEFAULT 'idle' CHECK (mode IN ('idle','blame_driven','independent','paused')),
          current_protocol INTEGER,
          last_blame_processed_at TEXT,
          last_independent_run_at TEXT,
          cycle_count INTEGER NOT NULL DEFAULT 0,
          blame_queue_depth INTEGER NOT NULL DEFAULT 0,
          jobs_generated_total INTEGER NOT NULL DEFAULT 0,
          status_message TEXT,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT OR IGNORE INTO sj_crawler_state (id) VALUES ('singleton');
      `);
    },
  },

  // ──────────────────────────────────────────
  // Migration v13: God Factory Agent tables
  // ──────────────────────────────────────────
  {
    version: 13,
    name: 'god_factory_agent_tables',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS notification_queue (
          notification_id TEXT PRIMARY KEY,
          category TEXT NOT NULL,
          source_forensic_id TEXT,
          severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','error','critical','fatal')),
          summary_tags TEXT NOT NULL DEFAULT '[]',
          natural_language_summary TEXT NOT NULL,
          cycle_id TEXT,
          presented_to_user INTEGER NOT NULL DEFAULT 0,
          user_acknowledged INTEGER NOT NULL DEFAULT 0,
          timestamp TEXT NOT NULL DEFAULT (datetime('now')),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_notification_queue_ack ON notification_queue(user_acknowledged, timestamp);
        CREATE INDEX IF NOT EXISTS idx_notification_queue_severity ON notification_queue(severity, timestamp);
        CREATE INDEX IF NOT EXISTS idx_notification_queue_source ON notification_queue(source_forensic_id);

        CREATE TABLE IF NOT EXISTS idle_suggestions (
          suggestion_id TEXT PRIMARY KEY,
          category TEXT NOT NULL CHECK (category IN (
            'trivial_enhancement','feature_bridge','performance_opportunity',
            'debt_warning','regression_trend','model_behavior_alert'
          )),
          source_devtags TEXT NOT NULL DEFAULT '[]',
          source_files TEXT NOT NULL DEFAULT '[]',
          source_lines TEXT NOT NULL DEFAULT '[]',
          source_forensic_ids TEXT NOT NULL DEFAULT '[]',
          natural_language_summary TEXT NOT NULL,
          suggested_job_id TEXT,
          presented_to_user INTEGER NOT NULL DEFAULT 0,
          user_response TEXT CHECK (user_response IN ('accepted','rejected','deferred')),
          cycle_id TEXT,
          timestamp TEXT NOT NULL DEFAULT (datetime('now')),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_idle_suggestions_response ON idle_suggestions(user_response, timestamp);
        CREATE INDEX IF NOT EXISTS idx_idle_suggestions_presented ON idle_suggestions(presented_to_user, timestamp);

        CREATE TABLE IF NOT EXISTS brainstorm_records (
          brainstorm_id TEXT PRIMARY KEY,
          user_input_raw TEXT NOT NULL,
          generated_job_id TEXT,
          processing_status TEXT NOT NULL DEFAULT 'queued' CHECK (processing_status IN ('queued','processed','failed')),
          cycle_id TEXT,
          timestamp TEXT NOT NULL DEFAULT (datetime('now')),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_brainstorm_records_status ON brainstorm_records(processing_status, timestamp);

        CREATE TABLE IF NOT EXISTS god_factory_actions (
          action_id TEXT PRIMARY KEY,
          action_type TEXT NOT NULL,
          target_id TEXT,
          target_type TEXT,
          authority_invoked TEXT,
          justification_tags TEXT NOT NULL DEFAULT '[]',
          result TEXT NOT NULL DEFAULT 'recorded',
          cycle_id TEXT,
          timestamp TEXT NOT NULL DEFAULT (datetime('now')),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_gf_actions_type ON god_factory_actions(action_type, timestamp);

        CREATE TABLE IF NOT EXISTS interactive_sessions (
          session_id TEXT PRIMARY KEY,
          start_cycle INTEGER,
          end_cycle INTEGER,
          user_inputs TEXT NOT NULL DEFAULT '[]',
          agent_responses TEXT NOT NULL DEFAULT '[]',
          sub_agents_spawned TEXT NOT NULL DEFAULT '[]',
          jobs_created INTEGER NOT NULL DEFAULT 0,
          jobs_implemented INTEGER NOT NULL DEFAULT 0,
          notifications_presented INTEGER NOT NULL DEFAULT 0,
          timestamp TEXT NOT NULL DEFAULT (datetime('now')),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    },
  },

  // ──────────────────────────────────────────
  // Migration v14: Silicon Factory core tables
  // ──────────────────────────────────────────
  {
    version: 14,
    name: 'silicon_factory_core_tables',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS silicon_tasks (
          id TEXT PRIMARY KEY,
          parent_id TEXT REFERENCES silicon_tasks(id),
          previous_id TEXT REFERENCES silicon_tasks(id),
          status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','COMPLETED','FAILED','ESCALATED')),
          agent_type TEXT NOT NULL,
          instruction TEXT NOT NULL,
          context_keys TEXT,
          next_step_hint TEXT,
          output_raw TEXT,
          handshake_blob TEXT,
          files_modified TEXT,
          token_count_in INTEGER NOT NULL DEFAULT 0,
          token_count_out INTEGER NOT NULL DEFAULT 0,
          attempt_count INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          completed_at INTEGER,
          thermal_at_run REAL,
          provenance_tags TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_silicon_tasks_status_created ON silicon_tasks(status, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_silicon_tasks_previous ON silicon_tasks(previous_id);

        CREATE TABLE IF NOT EXISTS silicon_project_config (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS silicon_black_box_log (
          id TEXT PRIMARY KEY,
          task_id TEXT,
          agent_id TEXT NOT NULL,
          prompt TEXT NOT NULL,
          response TEXT NOT NULL,
          token_in INTEGER NOT NULL DEFAULT 0,
          token_out INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_silicon_black_box_task ON silicon_black_box_log(task_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS silicon_z_state_buffer (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          partial_output TEXT NOT NULL,
          token_position INTEGER NOT NULL DEFAULT 0,
          completed INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_silicon_zstate_task ON silicon_z_state_buffer(task_id, completed, updated_at DESC);
      `);
    },
  },

  // ──────────────────────────────────────────
  // Migration v15: Silicon Factory extensions
  // ──────────────────────────────────────────
  {
    version: 15,
    name: 'silicon_factory_iap_locks_snapshots',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS silicon_iap_messages (
          id TEXT PRIMARY KEY,
          from_agent TEXT NOT NULL,
          to_agent TEXT NOT NULL,
          message_type TEXT NOT NULL,
          payload TEXT NOT NULL DEFAULT '{}',
          status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'acked')),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          acked_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_silicon_iap_to_status ON silicon_iap_messages(to_agent, status, created_at DESC);

        CREATE TABLE IF NOT EXISTS silicon_sync_locks (
          lock_key TEXT PRIMARY KEY,
          owner_agent TEXT NOT NULL,
          acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
          expires_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_silicon_lock_expires ON silicon_sync_locks(expires_at);

        CREATE TABLE IF NOT EXISTS silicon_state_snapshots (
          snapshot_id TEXT PRIMARY KEY,
          reason TEXT NOT NULL DEFAULT 'manual',
          snapshot_blob TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_silicon_state_snapshots_created ON silicon_state_snapshots(created_at DESC);
      `);
    },
  },

  // ──────────────────────────────────────────
  // Migration v16: Test execution index + symbol embeddings
  // ──────────────────────────────────────────
  {
    version: 16,
    name: 'silicon_test_index_and_embeddings',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS silicon_test_index (
          id TEXT PRIMARY KEY,
          test_file TEXT NOT NULL,
          test_name TEXT NOT NULL,
          source_file TEXT,
          source_symbol TEXT,
          project_id TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          indexed_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_silicon_test_symbol ON silicon_test_index(source_symbol, project_id);
        CREATE INDEX IF NOT EXISTS idx_silicon_test_file ON silicon_test_index(source_file, project_id);
        CREATE INDEX IF NOT EXISTS idx_silicon_test_project ON silicon_test_index(project_id);

        CREATE TABLE IF NOT EXISTS silicon_symbol_embeddings (
          symbol_id TEXT NOT NULL,
          project_id TEXT NOT NULL DEFAULT '',
          terms TEXT NOT NULL DEFAULT '{}',
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (symbol_id, project_id)
        );
        CREATE INDEX IF NOT EXISTS idx_silicon_embeddings_project ON silicon_symbol_embeddings(project_id);
      `);
    },
  },

  // ──────────────────────────────────────────
  // Migration v17: Project Factory — milestones,
  // quality snapshots, god-factory loop state
  // ──────────────────────────────────────────
  {
    version: 17,
    name: 'project_factory_tracking',
    up(db: Database.Database) {
      db.exec(`
        -- Structured milestone tree written by the agent loop per run.
        -- Enables "what is the agent working on right now?" and historical progress views.
        CREATE TABLE IF NOT EXISTS loop_milestones (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          run_id TEXT NOT NULL,
          parent_id TEXT REFERENCES loop_milestones(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          detail TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending','in_progress','complete','failed','skipped')),
          source TEXT NOT NULL DEFAULT 'agent'
            CHECK (source IN ('agent','user','system','fleet')),
          iteration INTEGER NOT NULL DEFAULT 0,
          files_changed INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_lm_project_run ON loop_milestones(project_id, run_id);
        CREATE INDEX IF NOT EXISTS idx_lm_status ON loop_milestones(run_id, status);
        CREATE INDEX IF NOT EXISTS idx_lm_parent ON loop_milestones(parent_id);

        -- Per-iteration quality snapshot: build / test / lint outcomes.
        -- Enables quality trend charts (green/red per iteration).
        CREATE TABLE IF NOT EXISTS loop_quality_snapshots (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          run_id TEXT NOT NULL,
          iteration INTEGER NOT NULL,
          build_ok INTEGER NOT NULL DEFAULT 1,
          tests_ok INTEGER NOT NULL DEFAULT 1,
          lint_ok INTEGER NOT NULL DEFAULT 1,
          error_count INTEGER NOT NULL DEFAULT 0,
          test_pass_count INTEGER NOT NULL DEFAULT 0,
          test_fail_count INTEGER NOT NULL DEFAULT 0,
          files_changed INTEGER NOT NULL DEFAULT 0,
          tokens_used INTEGER NOT NULL DEFAULT 0,
          summary TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_lqs_project_run ON loop_quality_snapshots(project_id, run_id);
        CREATE INDEX IF NOT EXISTS idx_lqs_iteration ON loop_quality_snapshots(run_id, iteration);

        -- God Factory autonomous loop singleton state.
        -- Tracks whether the GF loop is processing the suggested-jobs queue.
        CREATE TABLE IF NOT EXISTS god_factory_loop_state (
          id TEXT NOT NULL DEFAULT 'singleton' PRIMARY KEY,
          state TEXT NOT NULL DEFAULT 'idle'
            CHECK (state IN ('idle','running','paused','stopping')),
          current_job_id TEXT,
          current_run_id TEXT,
          jobs_completed INTEGER NOT NULL DEFAULT 0,
          jobs_failed INTEGER NOT NULL DEFAULT 0,
          jobs_skipped INTEGER NOT NULL DEFAULT 0,
          started_at TEXT,
          last_active_at TEXT,
          config TEXT NOT NULL DEFAULT '{}'
        );
        INSERT OR IGNORE INTO god_factory_loop_state (id) VALUES ('singleton');

        -- Import analysis cache — expensive crawl results keyed by folder hash.
        CREATE TABLE IF NOT EXISTS import_analyses (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          folder_path TEXT NOT NULL,
          folder_hash TEXT NOT NULL,
          file_count INTEGER NOT NULL DEFAULT 0,
          language_breakdown TEXT NOT NULL DEFAULT '{}',
          tech_stack TEXT NOT NULL DEFAULT '[]',
          dependency_managers TEXT NOT NULL DEFAULT '[]',
          todo_count INTEGER NOT NULL DEFAULT 0,
          fixme_count INTEGER NOT NULL DEFAULT 0,
          test_file_count INTEGER NOT NULL DEFAULT 0,
          estimated_loc INTEGER NOT NULL DEFAULT 0,
          health_score INTEGER NOT NULL DEFAULT 50,
          issues TEXT NOT NULL DEFAULT '[]',
          recommended_workflow_mode TEXT NOT NULL DEFAULT 'import_refactor',
          recommended_strategy_template TEXT NOT NULL DEFAULT 'fullstack-balanced',
          analysis_report TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_ia_project ON import_analyses(project_id);
        CREATE INDEX IF NOT EXISTS idx_ia_folder_hash ON import_analyses(folder_hash);
      `);
    },
  },

  // ──────────────────────────────────────────
  // Future migrations go here
  // ──────────────────────────────────────────

  // ──────────────────────────────────────────
  // Migration vN: Forensic composite indexes
  // Cross-table Gap Analysis queries require
  // composite indexes to stay fast as tables grow
  // ──────────────────────────────────────────
  {
    version: 100,
    name: 'forensic_composite_indexes',
    up(db: Database.Database) {
      const tableHasColumns = (table: string, columns: string[]): boolean => {
        try {
          const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
          const existing = new Set(rows.map(r => r.name));
          return columns.every(c => existing.has(c));
        } catch {
          return false;
        }
      };

      const createIndexIfColumns = (indexName: string, table: string, columns: string[]): void => {
        if (!tableHasColumns(table, columns)) return;
        db.exec(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${table}(${columns.join(', ')});`);
      };

      // Add agent_class to agent_performance if not already present
      try {
        db.exec(`ALTER TABLE agent_performance ADD COLUMN agent_class TEXT NOT NULL DEFAULT 'unknown';`);
      } catch { /* column already exists — safe to ignore */ }

      // blame_records: model/project by created_at for fast forensic history slices
      createIndexIfColumns('idx_blame_model_created', 'blame_records', ['model', 'created_at']);
      createIndexIfColumns('idx_blame_project_created', 'blame_records', ['project_id', 'created_at']);

      // tag_mismatches: agent and cycle severity lookup
      createIndexIfColumns('idx_tag_mismatches_agent_created', 'tag_mismatches', ['agent_id', 'created_at']);
      createIndexIfColumns('idx_tag_mismatches_cycle_severity', 'tag_mismatches', ['cycle_id', 'severity']);

      // agent_performance: older schemas use timestamp, newer use created_at
      if (tableHasColumns('agent_performance', ['agent_class', 'created_at'])) {
        createIndexIfColumns('idx_agent_perf_class_created', 'agent_performance', ['agent_class', 'created_at']);
      } else {
        createIndexIfColumns('idx_agent_perf_class_created', 'agent_performance', ['agent_class', 'timestamp']);
      }

      // regression_history: older schemas use file, newer may use file_path
      if (tableHasColumns('regression_history', ['file_path', 'created_at'])) {
        createIndexIfColumns('idx_regression_file_created', 'regression_history', ['file_path', 'created_at']);
      } else {
        createIndexIfColumns('idx_regression_file_created', 'regression_history', ['file', 'created_at']);
      }
      createIndexIfColumns('idx_regression_cycle_phase', 'regression_history', ['cycle_id', 'build_phase']);

      // model registry + quality join composites
      createIndexIfColumns('idx_model_registry_provider_tier', 'model_registry', ['provider', 'model_tier']);
      createIndexIfColumns('idx_quality_blame_model', 'quality_records', ['blame_id', 'tag_conformance']);
    },
  },
  {
    version: 101,
    name: 'job_evidence_summary',
    up(db: Database.Database) {
      // Add evidence_summary to job_records so every generated job is traceable
      // to the "why was this job generated?" question with a human-readable audit trail.
      try {
        db.exec(`ALTER TABLE job_records ADD COLUMN evidence_summary TEXT NOT NULL DEFAULT '';`);
      } catch { /* column may already exist in a fresh schema */ }
      // Add an index to find jobs by their forensic source record IDs quickly
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_job_records_source_ids
          ON job_records(source, implementation_status);
      `);
    },
  },
  {
    version: 102,
    name: 'stability_snapshots',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS stability_snapshots (
          cycle                   INTEGER PRIMARY KEY,
          timestamp               TEXT NOT NULL DEFAULT (datetime('now')),
          process_alive           INTEGER NOT NULL DEFAULT 1,
          tests_failed            INTEGER NOT NULL DEFAULT 0,
          tests_total             INTEGER NOT NULL DEFAULT 0,
          avg_blame_score         REAL NOT NULL DEFAULT 0,
          loop_detected           INTEGER NOT NULL DEFAULT 0,
          buildtag_rejection_rate REAL NOT NULL DEFAULT 0,
          rollback_triggered      INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_stability_snapshots_cycle
          ON stability_snapshots(cycle DESC);
      `);
    },
  },
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
