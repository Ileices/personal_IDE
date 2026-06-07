// ============================================================
// Schema Drift Crawler
//
// Watches DB migration files (CREATE TABLE / ALTER TABLE) and
// compares against actual table structure in SQLite.
// Detects:
// - Columns referenced in code that don't exist in DB
// - Migrations that haven't been applied
// - Tables in DB that have no migration (orphan tables)
// Stores findings in app_kv.
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import type { Database } from 'better-sqlite3';

interface SchemaDriftFinding {
  severity: 'error' | 'warning' | 'info';
  table: string;
  issue: string;
  detail?: string;
}

interface SchemaDriftResult {
  totalTablesChecked: number;
  findingsCount: number;
  findings: SchemaDriftFinding[];
  currentMigrationVersion: number;
  crawledAt: string;
}

// ── Get actual DB schema ─────────────────────────────────────

function getActualTables(db: Database): string[] {
  const rows = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all() as { name: string }[];
  return rows.map(r => r.name);
}

function getActualColumns(db: Database, tableName: string): string[] {
  try {
    const rows = db.prepare(`PRAGMA table_info("${tableName}")`).all() as { name: string }[];
    return rows.map(r => r.name);
  } catch {
    return [];
  }
}

// ── Parse expected schema from migration source ──────────────

const CREATE_TABLE_RE = /CREATE TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+"?(\w+)"?\s*\(([^;]+)\)/gis;
const ALTER_TABLE_ADD_RE = /ALTER\s+TABLE\s+"?(\w+)"?\s+ADD\s+COLUMN\s+"?(\w+)"?/gi;

interface ParsedTable {
  name: string;
  columns: string[];
}

function parseMigrationSource(source: string): ParsedTable[] {
  const tables = new Map<string, Set<string>>();

  // Parse CREATE TABLE
  CREATE_TABLE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CREATE_TABLE_RE.exec(source)) !== null) {
    const tableName = m[1].toLowerCase();
    const body = m[2];
    const cols = new Set<string>();
    // Extract column names from body (first word of each comma-separated line)
    for (const line of body.split('\n')) {
      const trimmed = line.trim().replace(/,\s*$/, '');
      if (!trimmed || trimmed.startsWith('PRIMARY') || trimmed.startsWith('FOREIGN') ||
          trimmed.startsWith('UNIQUE') || trimmed.startsWith('CHECK') || trimmed.startsWith('INDEX')) continue;
      const colName = trimmed.match(/^"?(\w+)"?/)?.[1];
      if (colName && colName.toUpperCase() !== 'CONSTRAINT') cols.add(colName.toLowerCase());
    }
    tables.set(tableName, cols);
  }

  // Parse ALTER TABLE ADD COLUMN
  ALTER_TABLE_ADD_RE.lastIndex = 0;
  while ((m = ALTER_TABLE_ADD_RE.exec(source)) !== null) {
    const tableName = m[1].toLowerCase();
    const colName = m[2].toLowerCase();
    const existing = tables.get(tableName) ?? new Set<string>();
    existing.add(colName);
    tables.set(tableName, existing);
  }

  return Array.from(tables.entries()).map(([name, columns]) => ({
    name,
    columns: Array.from(columns),
  }));
}

// ── Main Crawler ─────────────────────────────────────────────

export function runSchemaDriftCrawlerTick(
  db: Database,
  opts: { dbSrcPath?: string } = {},
): SchemaDriftResult {
  const findings: SchemaDriftFinding[] = [];

  // Get current migration version
  let currentVersion = 0;
  try {
    const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null };
    currentVersion = row?.v ?? 0;
  } catch { /* no schema_version table yet */ }

  // Get actual tables
  const actualTables = getActualTables(db);

  // Read migrations from db/index.ts (or fallback path)
  const dbSrcPath = opts.dbSrcPath
    ?? path.join(process.cwd(), 'src', 'db', 'index.ts');

  let parsedTables: ParsedTable[] = [];
  if (fs.existsSync(dbSrcPath)) {
    try {
      const source = fs.readFileSync(dbSrcPath, 'utf-8');
      parsedTables = parseMigrationSource(source);
    } catch { /* non-fatal */ }
  }

  // Build map of expected tables from migrations
  const expectedMap = new Map(parsedTables.map(t => [t.name.toLowerCase(), t.columns]));

  // Check each actual table against expected schema
  for (const tableName of actualTables) {
    const lowerName = tableName.toLowerCase();
    const actualCols = getActualColumns(db, tableName);
    const expectedCols = expectedMap.get(lowerName);

    if (!expectedCols) {
      // Table exists in DB but not in migration source
      findings.push({
        severity: 'info',
        table: tableName,
        issue: 'table_not_in_migrations',
        detail: `Table "${tableName}" exists in DB but was not found in migration source. May be created dynamically.`,
      });
      continue;
    }

    // Check for expected columns missing from actual DB
    for (const expectedCol of expectedCols) {
      if (!actualCols.map(c => c.toLowerCase()).includes(expectedCol.toLowerCase())) {
        findings.push({
          severity: 'error',
          table: tableName,
          issue: 'column_missing_in_db',
          detail: `Column "${expectedCol}" expected in "${tableName}" but not found in actual schema. Migration may not have run.`,
        });
      }
    }
  }

  // Check for expected tables missing from actual DB (migrations not applied?)
  for (const [expectedName] of expectedMap) {
    if (!actualTables.map(t => t.toLowerCase()).includes(expectedName)) {
      findings.push({
        severity: 'warning',
        table: expectedName,
        issue: 'table_missing_in_db',
        detail: `Table "${expectedName}" defined in migrations but not found in DB. May not have been created yet.`,
      });
    }
  }

  const result: SchemaDriftResult = {
    totalTablesChecked: actualTables.length,
    findingsCount: findings.length,
    findings,
    currentMigrationVersion: currentVersion,
    crawledAt: new Date().toISOString(),
  };

  // Persist
  try {
    db.prepare('INSERT OR REPLACE INTO app_kv (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))')
      .run('schema_drift:result', JSON.stringify(result));
    db.prepare('INSERT OR REPLACE INTO app_kv (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))')
      .run('schema_drift:last_run', new Date().toISOString());
  } catch { /* non-fatal */ }

  return result;
}
