import { execSync } from 'child_process';
import os from 'os';
import { randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';

type Db = Database.Database;

export type SiliconTaskStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'ESCALATED';

export interface SiliconTask {
  id: string;
  parent_id: string | null;
  previous_id: string | null;
  status: SiliconTaskStatus;
  agent_type: string;
  instruction: string;
  context_keys: string[];
  next_step_hint: string | null;
  output_raw: string | null;
  handshake_blob: Record<string, unknown> | null;
  files_modified: string[];
  token_count_in: number;
  token_count_out: number;
  attempt_count: number;
  created_at: number;
  completed_at: number | null;
  thermal_at_run: number | null;
  provenance_tags: Record<string, [number, number]>;
}

export interface ResourceSnapshot {
  checkedAt: string;
  memoryPercent: number;
  load1m: number;
  vramPercent: number | null;
  vramUsedMB: number | null;
  vramTotalMB: number | null;
  throttleRecommended: boolean;
}

export interface SupervisorStatus {
  running: boolean;
  paused: boolean;
  heartbeatSec: number;
  lastHeartbeatAt: string | null;
  queue: {
    pending: number;
    active: number;
    completed: number;
    failed: number;
    escalated: number;
  };
  resources: ResourceSnapshot;
}

export interface HandshakePrompt {
  task_id: string;
  anchor: string;
  ghost: string;
  previous_summary: string;
  flesh: string;
  seed: string;
  prompt: string;
  token_estimate: number;
  needs_compression: boolean;
}

export interface SiliconIapMessage {
  id: string;
  from_agent: string;
  to_agent: string;
  message_type: string;
  payload: Record<string, unknown>;
  status: 'queued' | 'acked';
  created_at: string;
  acked_at: string | null;
}

export interface SiliconLock {
  lock_key: string;
  owner_agent: string;
  acquired_at: string;
  expires_at: string;
}

export interface SiliconSnapshot {
  snapshot_id: string;
  reason: string;
  snapshot_blob: Record<string, unknown>;
  created_at: string;
}

export interface SiliconProjectContext {
  project_id: string | null;
  project_root: string | null;
}

export interface SiliconSymbolReadResult {
  read_type: 'function' | 'class_api' | 'struct' | 'signature';
  symbol_name: string;
  file_path: string;
  line_start: number;
  line_end: number;
  signature: string;
  content: string;
  token_estimate: number;
}

export interface SiliconSemanticResult {
  file_path: string;
  symbol: string;
  kind: string;
  signature: string;
  score: number;
  snippet: string;
}

const HEARTBEAT_SEC = 60;
const DEFAULT_ANCHOR = 'PROJECT_ANCHOR: [Lang: TypeScript, Style: Strict, Pattern: Modular, Arch: Service-Oriented, Vibe: Deterministic]';

let supervisorTimer: ReturnType<typeof setInterval> | null = null;
let supervisorPaused = false;
let lastHeartbeatAt: string | null = null;
let lastQueue = {
  pending: 0,
  active: 0,
  completed: 0,
  failed: 0,
  escalated: 0,
};
let lastResources: ResourceSnapshot = {
  checkedAt: new Date(0).toISOString(),
  memoryPercent: 0,
  load1m: 0,
  vramPercent: null,
  vramUsedMB: null,
  vramTotalMB: null,
  throttleRecommended: false,
};

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function setKv(db: Db, key: string, value: string): void {
  db.prepare(
    `INSERT INTO app_kv (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(key, value);
}

function getQueueSnapshot(db: Db): SupervisorStatus['queue'] {
  const rows = db
    .prepare(`
      SELECT status, COUNT(*) AS count
      FROM silicon_tasks
      GROUP BY status
    `)
    .all() as Array<{ status: string; count: number }>;

  const next = {
    pending: 0,
    active: 0,
    completed: 0,
    failed: 0,
    escalated: 0,
  };

  rows.forEach((row) => {
    if (row.status === 'PENDING') next.pending = row.count;
    if (row.status === 'ACTIVE') next.active = row.count;
    if (row.status === 'COMPLETED') next.completed = row.count;
    if (row.status === 'FAILED') next.failed = row.count;
    if (row.status === 'ESCALATED') next.escalated = row.count;
  });

  return next;
}

function readVramStatus(): { usedMB: number; totalMB: number; percent: number } | null {
  try {
    const raw = execSync(
      'nvidia-smi --query-gpu=memory.total,memory.used --format=csv,noheader,nounits',
      { timeout: 1000, encoding: 'utf-8', windowsHide: true }
    ).trim();

    if (!raw) return null;
    const first = raw.split(/\r?\n/).find(Boolean);
    if (!first) return null;

    const parts = first.split(',').map((x) => Number(String(x).trim()));
    if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1]) || parts[0] <= 0) {
      return null;
    }

    const totalMB = parts[0];
    const usedMB = parts[1];
    const percent = Math.round((usedMB / totalMB) * 1000) / 10;
    return { usedMB, totalMB, percent };
  } catch {
    return null;
  }
}

function getResourceSnapshot(): ResourceSnapshot {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const memoryPercent = totalMem > 0 ? Math.round(((totalMem - freeMem) / totalMem) * 1000) / 10 : 0;
  const load1m = Math.round((os.loadavg()[0] || 0) * 100) / 100;

  const vram = readVramStatus();
  const throttleRecommended = memoryPercent >= 90 || (vram?.percent ?? 0) >= 90;

  return {
    checkedAt: new Date().toISOString(),
    memoryPercent,
    load1m,
    vramPercent: vram?.percent ?? null,
    vramUsedMB: vram?.usedMB ?? null,
    vramTotalMB: vram?.totalMB ?? null,
    throttleRecommended,
  };
}

function tick(db: Db): void {
  lastHeartbeatAt = new Date().toISOString();
  lastQueue = getQueueSnapshot(db);
  lastResources = getResourceSnapshot();

  setKv(db, 'silicon_factory:last_heartbeat', lastHeartbeatAt);
  setKv(db, 'silicon_factory:last_queue', JSON.stringify(lastQueue));
  setKv(db, 'silicon_factory:last_resources', JSON.stringify(lastResources));

  if (lastResources.throttleRecommended) {
    setKv(db, 'silicon_factory:throttle', '1');
  } else {
    setKv(db, 'silicon_factory:throttle', '0');
  }
}

export function ensureSiliconFactoryDefaults(db: Db): void {
  const defaults: Record<string, string> = {
    global_anchor: DEFAULT_ANCHOR,
    confidence_threshold: '0.70',
    thermal_limit_celsius: '85',
    max_attempt_count: '3',
    architectural_manifesto: 'Deterministic, test-first, schema-enforced software construction.',
    vibe_embedding: '[]',
  };

  const stmt = db.prepare(
    `INSERT INTO silicon_project_config (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO NOTHING`
  );

  Object.entries(defaults).forEach(([key, value]) => stmt.run(key, value));
}

export function startSiliconFactorySupervisor(db: Db): void {
  ensureSiliconFactoryDefaults(db);
  if (supervisorTimer) return;
  supervisorPaused = false;
  tick(db);
  supervisorTimer = setInterval(() => {
    if (supervisorPaused) return;
    tick(db);
  }, HEARTBEAT_SEC * 1000);
}

export function stopSiliconFactorySupervisor(): void {
  if (supervisorTimer) {
    clearInterval(supervisorTimer);
    supervisorTimer = null;
  }
}

export function pauseSiliconFactorySupervisor(): void {
  supervisorPaused = true;
}

export function resumeSiliconFactorySupervisor(db: Db): void {
  supervisorPaused = false;
  tick(db);
}

export function getSiliconFactoryStatus(db: Db): SupervisorStatus {
  if (!lastHeartbeatAt) {
    lastQueue = getQueueSnapshot(db);
    lastResources = getResourceSnapshot();
  }

  return {
    running: supervisorTimer !== null,
    paused: supervisorPaused,
    heartbeatSec: HEARTBEAT_SEC,
    lastHeartbeatAt,
    queue: lastQueue,
    resources: lastResources,
  };
}

export function createSiliconTask(
  db: Db,
  payload: {
    instruction: string;
    agent_type?: string;
    context_keys?: string[];
    next_step_hint?: string;
    previous_id?: string;
    parent_id?: string;
  }
): SiliconTask {
  const id = randomUUID();
  const now = Date.now();

  db.prepare(`
    INSERT INTO silicon_tasks (
      id, parent_id, previous_id, status, agent_type, instruction,
      context_keys, next_step_hint, output_raw, handshake_blob, files_modified,
      token_count_in, token_count_out, attempt_count, created_at, completed_at,
      thermal_at_run, provenance_tags
    ) VALUES (?, ?, ?, 'PENDING', ?, ?, ?, ?, NULL, NULL, '[]', 0, 0, 0, ?, NULL, NULL, '{}')
  `).run(
    id,
    payload.parent_id ?? null,
    payload.previous_id ?? null,
    payload.agent_type ?? 'coder',
    payload.instruction,
    JSON.stringify(payload.context_keys ?? []),
    payload.next_step_hint ?? null,
    now,
  );

  const task = getSiliconTask(db, id);
  if (!task) {
    throw new Error('Failed to create task');
  }
  return task;
}

export function getSiliconTask(db: Db, id: string): SiliconTask | null {
  const row = db.prepare('SELECT * FROM silicon_tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return mapTaskRow(row);
}

function mapTaskRow(row: Record<string, unknown>): SiliconTask {
  return {
    id: String(row.id),
    parent_id: row.parent_id ? String(row.parent_id) : null,
    previous_id: row.previous_id ? String(row.previous_id) : null,
    status: String(row.status) as SiliconTaskStatus,
    agent_type: String(row.agent_type || 'coder'),
    instruction: String(row.instruction || ''),
    context_keys: parseJson<string[]>(row.context_keys, []),
    next_step_hint: row.next_step_hint ? String(row.next_step_hint) : null,
    output_raw: row.output_raw ? String(row.output_raw) : null,
    handshake_blob: parseJson<Record<string, unknown> | null>(row.handshake_blob, null),
    files_modified: parseJson<string[]>(row.files_modified, []),
    token_count_in: Number(row.token_count_in || 0),
    token_count_out: Number(row.token_count_out || 0),
    attempt_count: Number(row.attempt_count || 0),
    created_at: Number(row.created_at || 0),
    completed_at: row.completed_at ? Number(row.completed_at) : null,
    thermal_at_run: row.thermal_at_run != null ? Number(row.thermal_at_run) : null,
    provenance_tags: parseJson<Record<string, [number, number]>>(row.provenance_tags, {}),
  };
}

export function listSiliconTasks(
  db: Db,
  options: { status?: SiliconTaskStatus; limit?: number }
): SiliconTask[] {
  const limit = Math.max(1, Math.min(Number(options.limit || 25), 200));

  let rows: Array<Record<string, unknown>>;
  if (options.status) {
    rows = db
      .prepare('SELECT * FROM silicon_tasks WHERE status = ? ORDER BY created_at DESC LIMIT ?')
      .all(options.status, limit) as Array<Record<string, unknown>>;
  } else {
    rows = db
      .prepare('SELECT * FROM silicon_tasks ORDER BY created_at DESC LIMIT ?')
      .all(limit) as Array<Record<string, unknown>>;
  }

  return rows.map(mapTaskRow);
}

export function updateSiliconTaskStatus(
  db: Db,
  taskId: string,
  payload: {
    status: SiliconTaskStatus;
    output_raw?: string;
    handshake_blob?: Record<string, unknown>;
    files_modified?: string[];
    token_count_in?: number;
    token_count_out?: number;
    thermal_at_run?: number;
    provenance_tags?: Record<string, [number, number]>;
  }
): SiliconTask {
  const existing = getSiliconTask(db, taskId);
  if (!existing) throw new Error('Task not found');

  const completedAt = payload.status === 'COMPLETED' || payload.status === 'FAILED' || payload.status === 'ESCALATED'
    ? Date.now()
    : null;

  db.prepare(`
    UPDATE silicon_tasks
    SET
      status = ?,
      output_raw = COALESCE(?, output_raw),
      handshake_blob = COALESCE(?, handshake_blob),
      files_modified = COALESCE(?, files_modified),
      token_count_in = COALESCE(?, token_count_in),
      token_count_out = COALESCE(?, token_count_out),
      thermal_at_run = COALESCE(?, thermal_at_run),
      provenance_tags = COALESCE(?, provenance_tags),
      completed_at = COALESCE(?, completed_at)
    WHERE id = ?
  `).run(
    payload.status,
    payload.output_raw ?? null,
    payload.handshake_blob ? JSON.stringify(payload.handshake_blob) : null,
    payload.files_modified ? JSON.stringify(payload.files_modified) : null,
    payload.token_count_in ?? null,
    payload.token_count_out ?? null,
    payload.thermal_at_run ?? null,
    payload.provenance_tags ? JSON.stringify(payload.provenance_tags) : null,
    completedAt,
    taskId,
  );

  if (payload.status === 'FAILED' || payload.status === 'ESCALATED') {
    db.prepare('UPDATE silicon_tasks SET attempt_count = attempt_count + 1 WHERE id = ?').run(taskId);
  }

  const next = getSiliconTask(db, taskId);
  if (!next) throw new Error('Failed to read task after update');
  return next;
}

export function detectAmbiguity(instruction: string): {
  ambiguous: boolean;
  trigger_terms: string[];
  clarification_request: string | null;
} {
  const triggers = ['good', 'clean', 'fast', 'handle', 'make it look', 'work properly'];
  const lower = instruction.toLowerCase();
  const found = triggers.filter((term) => lower.includes(term));

  if (found.length === 0) {
    return { ambiguous: false, trigger_terms: [], clarification_request: null };
  }

  const request = `Clarify measurable criteria for: ${found.join(', ')}. Include acceptance tests and numeric targets.`;
  return {
    ambiguous: true,
    trigger_terms: found,
    clarification_request: request,
  };
}

function estimateTokens(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words * 1.35));
}

function normalizeFilePath(input: string): string {
  return input.replace(/\\/g, '/').replace(/^\.\//, '');
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

function resolveAbsoluteFile(projectRoot: string, relPath: string): string {
  const normalized = normalizeFilePath(relPath);
  const abs = path.resolve(projectRoot, normalized);
  const safeRoot = path.resolve(projectRoot);
  if (!abs.startsWith(safeRoot)) {
    throw new Error('Path traversal denied');
  }
  return abs;
}

function readLineRange(projectRoot: string, filePath: string, startLine: number, endLine: number): string {
  try {
    const abs = resolveAbsoluteFile(projectRoot, filePath);
    if (!existsSync(abs)) return '';
    const raw = readFileSync(abs, 'utf8');
    const lines = raw.split('\n');
    const start = Math.max(1, startLine);
    const end = Math.max(start, endLine);
    return lines.slice(start - 1, end).join('\n');
  } catch {
    return '';
  }
}

function splitQueryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((token) => token.length >= 2)
    .slice(0, 12);
}

function getProjectRow(db: Db, projectId: string): { id: string; root_path: string } | null {
  const row = db.prepare('SELECT id, root_path FROM projects WHERE id = ?').get(projectId) as { id: string; root_path: string } | undefined;
  return row || null;
}

function inferRecentProject(db: Db): { id: string; root_path: string } | null {
  const row = db.prepare(`
    SELECT id, root_path
    FROM projects
    ORDER BY datetime(last_accessed_at) DESC, datetime(created_at) DESC
    LIMIT 1
  `).get() as { id: string; root_path: string } | undefined;
  return row || null;
}

export function resolveSiliconProjectContext(
  db: Db,
  payload?: { project_id?: string; project_root?: string }
): SiliconProjectContext {
  if (payload?.project_id) {
    const row = getProjectRow(db, payload.project_id);
    if (row) {
      if (!payload.project_root) {
        upsertProjectConfig(db, 'active_project_id', row.id);
        upsertProjectConfig(db, 'active_project_root', row.root_path);
      }
      return { project_id: row.id, project_root: row.root_path };
    }
  }

  if (payload?.project_root) {
    const normalizedRoot = path.resolve(payload.project_root);
    if (payload.project_id) {
      upsertProjectConfig(db, 'active_project_id', payload.project_id);
    }
    upsertProjectConfig(db, 'active_project_root', normalizedRoot);
    return { project_id: payload.project_id || null, project_root: normalizedRoot };
  }

  const configRows = db.prepare(
    'SELECT key, value FROM silicon_project_config WHERE key IN (\'active_project_id\', \'active_project_root\')'
  ).all() as Array<{ key: string; value: string }>;

  let configProjectId: string | null = null;
  let configProjectRoot: string | null = null;
  for (const row of configRows) {
    if (row.key === 'active_project_id') configProjectId = row.value;
    if (row.key === 'active_project_root') configProjectRoot = row.value;
  }

  if (configProjectId) {
    const row = getProjectRow(db, configProjectId);
    if (row) {
      if (!configProjectRoot) {
        upsertProjectConfig(db, 'active_project_root', row.root_path);
      }
      return { project_id: row.id, project_root: configProjectRoot || row.root_path };
    }
  }

  if (configProjectRoot) {
    return { project_id: null, project_root: configProjectRoot };
  }

  const recent = inferRecentProject(db);
  if (!recent) return { project_id: null, project_root: null };

  upsertProjectConfig(db, 'active_project_id', recent.id);
  upsertProjectConfig(db, 'active_project_root', recent.root_path);
  return { project_id: recent.id, project_root: recent.root_path };
}

export function setSiliconProjectContext(db: Db, payload: { project_id?: string; project_root?: string }): SiliconProjectContext {
  const next = resolveSiliconProjectContext(db, payload);
  if (next.project_id) upsertProjectConfig(db, 'active_project_id', next.project_id);
  if (next.project_root) upsertProjectConfig(db, 'active_project_root', next.project_root);
  return next;
}

export function readSiliconSymbol(
  db: Db,
  payload: {
    symbol_name: string;
    read_type?: 'function' | 'class_api' | 'struct' | 'signature';
    project_id?: string;
    project_root?: string;
    file_path?: string;
  }
): SiliconSymbolReadResult | null {
  const readType = payload.read_type || 'signature';
  const context = resolveSiliconProjectContext(db, {
    project_id: payload.project_id,
    project_root: payload.project_root,
  });

  const symbolName = payload.symbol_name.trim();
  if (!symbolName) throw new Error('symbol_name is required');
  if (!context.project_root) throw new Error('project_root is not resolved; set active project context first');

  const where: string[] = ['name = ?'];
  const params: unknown[] = [symbolName];
  if (context.project_id) {
    where.push('project_id = ?');
    params.push(context.project_id);
  }
  if (payload.file_path) {
    where.push('file_path = ?');
    params.push(normalizeFilePath(payload.file_path));
  }

  const kindsByRead: Record<string, string[]> = {
    function: ['function', 'method'],
    class_api: ['class', 'interface', 'trait'],
    struct: ['struct', 'type'],
    signature: ['function', 'method', 'class', 'interface', 'type', 'struct', 'enum', 'variable', 'property', 'constant'],
  };

  const candidates = db.prepare(`
    SELECT id, file_path, name, kind, signature, line_start, line_end
    FROM code_symbols
    WHERE ${where.join(' AND ')}
    ORDER BY CASE kind
      WHEN 'function' THEN 1
      WHEN 'method' THEN 2
      WHEN 'class' THEN 3
      WHEN 'interface' THEN 4
      WHEN 'struct' THEN 5
      ELSE 99
    END, line_start ASC
    LIMIT 50
  `).all(...params) as Array<{
    id: string;
    file_path: string;
    name: string;
    kind: string;
    signature: string;
    line_start: number;
    line_end: number;
  }>;

  const match = candidates.find((row) => kindsByRead[readType].includes(row.kind)) || candidates[0];
  if (!match) return null;

  const contentByType = (): string => {
    if (readType === 'signature') {
      return (match.signature || `${match.kind} ${match.name}`).trim();
    }
    if (readType === 'function') {
      return readLineRange(context.project_root!, match.file_path, match.line_start, Math.max(match.line_start, match.line_end));
    }
    if (readType === 'class_api') {
      const methods = db.prepare(`
        SELECT name, kind, signature, line_start, line_end
        FROM code_symbols
        WHERE ${context.project_id ? 'project_id = ? AND' : ''} file_path = ?
          AND kind IN ('method','function','property','constant')
          AND line_start >= ?
          AND line_end <= ?
        ORDER BY line_start ASC
        LIMIT 80
      `).all(...(context.project_id ? [context.project_id, match.file_path, match.line_start, Math.max(match.line_start, match.line_end)] : [match.file_path, match.line_start, Math.max(match.line_start, match.line_end)])) as Array<{ name: string; kind: string; signature: string }>;

      const header = (match.signature || `${match.kind} ${match.name}`).trim();
      const apiLines = methods.map((m) => `- ${(m.signature || `${m.kind} ${m.name}`).trim()}`);
      return [header, ...apiLines].join('\n');
    }

    return readLineRange(context.project_root!, match.file_path, match.line_start, Math.max(match.line_start, match.line_end));
  };

  const content = contentByType();
  return {
    read_type: readType,
    symbol_name: match.name,
    file_path: match.file_path,
    line_start: match.line_start,
    line_end: Math.max(match.line_start, match.line_end),
    signature: (match.signature || `${match.kind} ${match.name}`).trim(),
    content,
    token_estimate: estimateTokens(content),
  };
}

export function querySiliconSymbolGraph(
  db: Db,
  payload: {
    mode: 'find_callers' | 'find_callees' | 'find_definitions' | 'find_usages' | 'get_includes' | 'get_includers' | 'get_symbol_type';
    symbol?: string;
    file_path?: string;
    project_id?: string;
    limit?: number;
  }
): Record<string, unknown> {
  const limit = Math.max(1, Math.min(Number(payload.limit || 30), 200));
  const projectContext = resolveSiliconProjectContext(db, { project_id: payload.project_id });
  const projectId = payload.project_id || projectContext.project_id;

  const scoped = (sql: string): string => projectId
    ? sql.replace(/\/\*PROJECT_SCOPE\*\//g, 'AND s.project_id = ?')
    : sql.replace(/\/\*PROJECT_SCOPE\*\//g, '');

  if (payload.mode === 'find_definitions') {
    if (!payload.symbol) throw new Error('symbol is required');
    const rows = db.prepare(`
      SELECT file_path, name, kind, signature, line_start, line_end
      FROM code_symbols s
      WHERE name = ?
      ${projectId ? 'AND project_id = ?' : ''}
      ORDER BY line_start ASC
      LIMIT ?
    `).all(...(projectId ? [payload.symbol, projectId, limit] : [payload.symbol, limit]));
    return { mode: payload.mode, symbol: payload.symbol, results: rows };
  }

  if (payload.mode === 'get_symbol_type') {
    if (!payload.symbol) throw new Error('symbol is required');
    const row = db.prepare(`
      SELECT name, kind, signature, file_path
      FROM code_symbols
      WHERE name = ?
      ${projectId ? 'AND project_id = ?' : ''}
      ORDER BY line_start ASC
      LIMIT 1
    `).get(...(projectId ? [payload.symbol, projectId] : [payload.symbol]));
    return { mode: payload.mode, symbol: payload.symbol, result: row || null };
  }

  if (payload.mode === 'get_includes') {
    if (!payload.file_path) throw new Error('file_path is required');
    const relFile = normalizeFilePath(payload.file_path);
    const rows = db.prepare(`
      SELECT DISTINCT t.file_path AS included_file
      FROM code_relationships r
      JOIN code_symbols s ON s.id = r.source_symbol_id
      JOIN code_symbols t ON t.id = r.target_symbol_id
      WHERE r.relationship_type = 'imports'
        AND s.file_path = ?
        ${projectId ? 'AND s.project_id = ? AND t.project_id = ?' : ''}
      ORDER BY included_file ASC
      LIMIT ?
    `).all(...(projectId ? [relFile, projectId, projectId, limit] : [relFile, limit]));
    return { mode: payload.mode, file_path: relFile, results: rows };
  }

  if (payload.mode === 'get_includers') {
    if (!payload.file_path) throw new Error('file_path is required');
    const relFile = normalizeFilePath(payload.file_path);
    const rows = db.prepare(`
      SELECT DISTINCT s.file_path AS includer_file
      FROM code_relationships r
      JOIN code_symbols s ON s.id = r.source_symbol_id
      JOIN code_symbols t ON t.id = r.target_symbol_id
      WHERE r.relationship_type = 'imports'
        AND t.file_path = ?
        ${projectId ? 'AND s.project_id = ? AND t.project_id = ?' : ''}
      ORDER BY includer_file ASC
      LIMIT ?
    `).all(...(projectId ? [relFile, projectId, projectId, limit] : [relFile, limit]));
    return { mode: payload.mode, file_path: relFile, results: rows };
  }

  if (!payload.symbol) throw new Error('symbol is required');
  const relationFilter = payload.mode === 'find_callers'
    ? `AND r.relationship_type IN ('calls','uses','imports')`
    : payload.mode === 'find_callees'
      ? `AND r.relationship_type IN ('calls','uses','imports')`
      : '';

  if (payload.mode === 'find_callers' || payload.mode === 'find_usages') {
    const rows = db.prepare(`
      SELECT DISTINCT s.file_path, s.name, s.kind, s.signature, s.line_start, s.line_end, r.relationship_type
      FROM code_relationships r
      JOIN code_symbols s ON s.id = r.source_symbol_id
      JOIN code_symbols t ON t.id = r.target_symbol_id
      WHERE t.name = ?
        ${projectId ? 'AND s.project_id = ? AND t.project_id = ?' : ''}
        ${relationFilter}
      ORDER BY s.file_path ASC, s.line_start ASC
      LIMIT ?
    `).all(...(projectId ? [payload.symbol, projectId, projectId, limit] : [payload.symbol, limit]));
    return { mode: payload.mode, symbol: payload.symbol, results: rows };
  }

  const rows = db.prepare(`
    SELECT DISTINCT t.file_path, t.name, t.kind, t.signature, t.line_start, t.line_end, r.relationship_type
    FROM code_relationships r
    JOIN code_symbols s ON s.id = r.source_symbol_id
    JOIN code_symbols t ON t.id = r.target_symbol_id
    WHERE s.name = ?
      ${projectId ? 'AND s.project_id = ? AND t.project_id = ?' : ''}
      ${relationFilter}
    ORDER BY t.file_path ASC, t.line_start ASC
    LIMIT ?
  `).all(...(projectId ? [payload.symbol, projectId, projectId, limit] : [payload.symbol, limit]));

  return { mode: payload.mode, symbol: payload.symbol, results: rows };
}

export function semanticFindSilicon(
  db: Db,
  payload: { query: string; project_id?: string; limit?: number }
): SiliconSemanticResult[] {
  const query = (payload.query || '').trim();
  if (!query) throw new Error('query is required');
  const tokens = splitQueryTokens(query);
  const limit = Math.max(1, Math.min(Number(payload.limit || 8), 30));

  const context = resolveSiliconProjectContext(db, { project_id: payload.project_id });
  const projectId = payload.project_id || context.project_id;

  const rows = db.prepare(`
    SELECT file_path, name, kind, signature, doc_comment
    FROM code_symbols
    WHERE ${projectId ? 'project_id = ? AND' : ''} (
      name LIKE ? OR signature LIKE ? OR doc_comment LIKE ?
    )
    LIMIT 500
  `).all(...(projectId ? [projectId, `%${query}%`, `%${query}%`, `%${query}%`] : [`%${query}%`, `%${query}%`, `%${query}%`])) as Array<{
    file_path: string;
    name: string;
    kind: string;
    signature: string;
    doc_comment: string;
  }>;

  const scored = rows.map((row) => {
    const hay = `${row.name} ${row.signature || ''} ${row.doc_comment || ''}`.toLowerCase();
    const tokenHits = tokens.reduce((acc, token) => acc + (hay.includes(token) ? 1 : 0), 0);
    const exactBoost = hay.includes(query.toLowerCase()) ? 2 : 0;
    const prefixBoost = row.name.toLowerCase().startsWith(query.toLowerCase()) ? 1.5 : 0;
    const score = tokenHits + exactBoost + prefixBoost;
    return {
      file_path: row.file_path,
      symbol: row.name,
      kind: row.kind,
      signature: row.signature || `${row.kind} ${row.name}`,
      score,
      snippet: (row.signature || row.doc_comment || '').slice(0, 220),
    };
  }).filter((row) => row.score > 0);

  scored.sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
  const maxScore = scored[0]?.score || 1;
  return scored.slice(0, limit).map((row) => ({ ...row, score: Math.round((row.score / maxScore) * 1000) / 1000 }));
}

export function compressDiagnostics(raw: string, maxItems: number = 20): Array<{ file: string; line: number; code: string; message: string }> {
  const lines = (raw || '').split(/\r?\n/);
  const parsed: Array<{ file: string; line: number; code: string; message: string }> = [];

  const tsRegex = /^(.+?)\((\d+),(\d+)\):\s*error\s+([A-Z]+\d+):\s+(.+)$/i;
  const genericRegex = /^([^:]+):(\d+):\s*(?:error\s*)?([A-Za-z0-9_\-]+)?:?\s*(.+)$/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const tsMatch = trimmed.match(tsRegex);
    if (tsMatch) {
      parsed.push({
        file: normalizeFilePath(tsMatch[1]),
        line: Number(tsMatch[2]),
        code: tsMatch[4],
        message: tsMatch[5].slice(0, 220),
      });
      continue;
    }

    const genericMatch = trimmed.match(genericRegex);
    if (genericMatch) {
      parsed.push({
        file: normalizeFilePath(genericMatch[1]),
        line: Number(genericMatch[2]),
        code: genericMatch[3] || 'ERR',
        message: genericMatch[4].slice(0, 220),
      });
    }
  }

  const dedup = new Map<string, { file: string; line: number; code: string; message: string }>();
  for (const item of parsed) {
    const key = `${item.file}:${item.code}:${item.message}`;
    if (!dedup.has(key)) dedup.set(key, item);
  }

  return [...dedup.values()].slice(0, Math.max(1, Math.min(maxItems, 100)));
}

export function compressTestOutput(raw: string, maxFailures: number = 10): {
  passed: number;
  failed: number;
  failures: Array<{ test: string; reason: string }>;
} {
  const lines = (raw || '').split(/\r?\n/);
  let passed = 0;
  let failed = 0;
  const failures: Array<{ test: string; reason: string }> = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/\b(pass|passed)\b/i.test(trimmed)) passed += 1;
    if (/\b(fail|failed|error|assertionerror)\b/i.test(trimmed)) {
      failed += 1;
      const m = trimmed.match(/^(?:FAIL|FAILED|ERROR)\s*[:\-]?\s*(.+)$/i);
      if (m) {
        failures.push({ test: m[1].slice(0, 120), reason: trimmed.slice(0, 220) });
      } else {
        failures.push({ test: 'unknown', reason: trimmed.slice(0, 220) });
      }
    }
  }

  return {
    passed,
    failed,
    failures: failures.slice(0, Math.max(1, Math.min(maxFailures, 50))),
  };
}

export function buildSiliconTaskContext(
  db: Db,
  payload: {
    task_id: string;
    project_id?: string;
    project_root?: string;
    budget_tokens?: number;
    diagnostics_raw?: string;
  }
): {
  task_id: string;
  budget_tokens: number;
  used_tokens: number;
  sections: Record<string, string>;
  context: string;
} {
  const task = getSiliconTask(db, payload.task_id);
  if (!task) throw new Error('Task not found');

  const budget = Math.max(300, Math.min(Number(payload.budget_tokens || 2000), 4000));
  const sections: Record<string, string> = {};

  sections.task = `TASK: ${task.instruction}`;

  const mentionCandidates = (task.instruction.match(/\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g) || [])
    .filter((x, i, arr) => arr.indexOf(x) === i)
    .slice(0, 12);

  const projectContext = resolveSiliconProjectContext(db, {
    project_id: payload.project_id,
    project_root: payload.project_root,
  });
  const projectId = payload.project_id || projectContext.project_id;

  const signatures: string[] = [];
  for (const symbol of mentionCandidates) {
    const row = db.prepare(`
      SELECT name, kind, signature, file_path, line_start
      FROM code_symbols
      WHERE name = ?
      ${projectId ? 'AND project_id = ?' : ''}
      ORDER BY line_start ASC
      LIMIT 1
    `).get(...(projectId ? [symbol, projectId] : [symbol])) as {
      name: string;
      kind: string;
      signature: string;
      file_path: string;
      line_start: number;
    } | undefined;

    if (row) {
      signatures.push(`${row.name}: ${(row.signature || `${row.kind} ${row.name}`).trim()} [${row.file_path}:${row.line_start}]`);
    }
  }
  if (signatures.length > 0) {
    sections.signatures = signatures.join('\n');
  }

  const semantic = semanticFindSilicon(db, {
    query: task.instruction,
    project_id: projectId || undefined,
    limit: 5,
  });
  if (semantic.length > 0) {
    sections.semantic = semantic
      .map((r) => `${r.symbol} (${r.kind}) @ ${r.file_path} score=${r.score}`)
      .join('\n');
  }

  if (payload.diagnostics_raw) {
    const diags = compressDiagnostics(payload.diagnostics_raw, 5);
    if (diags.length > 0) {
      sections.errors = diags.map((d) => `${d.file}:${d.line} ${d.code}: ${d.message}`).join('\n');
    }
  }

  const orderedSections = ['task', 'signatures', 'errors', 'semantic'];
  let used = 0;
  const merged: string[] = [];
  for (const key of orderedSections) {
    const content = sections[key];
    if (!content) continue;
    const block = `## ${key.toUpperCase()}\n${content}`;
    const tokens = estimateTokens(block);
    if (used + tokens > budget) continue;
    merged.push(block);
    used += tokens;
  }

  return {
    task_id: task.id,
    budget_tokens: budget,
    used_tokens: used,
    sections,
    context: merged.join('\n\n'),
  };
}

export function computeSiliconContextDelta(
  previousSections: Record<string, string>,
  currentSections: Record<string, string>
): {
  updated: Record<string, string>;
  unchanged: string[];
  removed: string[];
} {
  const updated: Record<string, string> = {};
  const unchanged: string[] = [];
  const removed: string[] = [];

  for (const [key, value] of Object.entries(currentSections || {})) {
    const prev = previousSections?.[key];
    if (typeof prev === 'string' && hashString(prev) === hashString(value)) {
      unchanged.push(key);
    } else {
      updated[key] = value;
    }
  }

  for (const key of Object.keys(previousSections || {})) {
    if (!(key in (currentSections || {}))) {
      removed.push(key);
    }
  }

  return { updated, unchanged, removed };
}

export function assembleHandshakePrompt(db: Db, taskId: string): HandshakePrompt {
  const task = getSiliconTask(db, taskId);
  if (!task) throw new Error('Task not found');

  const prev = task.previous_id ? getSiliconTask(db, task.previous_id) : null;
  const anchorRow = db
    .prepare('SELECT value FROM silicon_project_config WHERE key = ?')
    .get('global_anchor') as { value?: string } | undefined;

  const anchor = anchorRow?.value || DEFAULT_ANCHOR;
  const prevHandshake = prev?.handshake_blob || null;
  const ghost = typeof prevHandshake?.mental_seed === 'string' ? prevHandshake.mental_seed : 'Start of project.';
  const prevSummary = typeof prevHandshake?.summary === 'string' ? prevHandshake.summary : 'None';
  const seed = task.next_step_hint || 'Prepare for integration.';

  const prompt = [
    `[ANCHOR]: ${anchor}`,
    `[GHOST]: ${ghost} (Prior: ${prevSummary})`,
    `[FLESH]: ${task.instruction}`,
    `[SEED]: Next: ${seed}`,
    'OUTPUT: Raw code only. End with JSON: {"summary":"","mental_seed":""}',
  ].join('\n');

  const tokenEstimate = estimateTokens(prompt);

  db.prepare('UPDATE silicon_tasks SET token_count_in = ? WHERE id = ?').run(tokenEstimate, taskId);

  return {
    task_id: task.id,
    anchor,
    ghost,
    previous_summary: prevSummary,
    flesh: task.instruction,
    seed,
    prompt,
    token_estimate: tokenEstimate,
    needs_compression: tokenEstimate > 480,
  };
}

export function coldBootResume(db: Db): {
  requeued: number;
  touched_task_ids: string[];
  z_state_recovered: Array<{ task_id: string; partial_output: string }>;
} {
  const activeRows = db
    .prepare('SELECT id FROM silicon_tasks WHERE status = ? ORDER BY created_at ASC')
    .all('ACTIVE') as Array<{ id: string }>;

  const touched = activeRows.map((row) => row.id);
  if (touched.length > 0) {
    db.prepare(`
      UPDATE silicon_tasks
      SET status = 'PENDING', attempt_count = attempt_count + 1
      WHERE status = 'ACTIVE'
    `).run();
  }

  const recovered = db
    .prepare(`
      SELECT task_id, partial_output
      FROM silicon_z_state_buffer
      WHERE completed = 0
      ORDER BY updated_at DESC
      LIMIT 20
    `)
    .all() as Array<{ task_id: string; partial_output: string }>;

  return {
    requeued: touched.length,
    touched_task_ids: touched,
    z_state_recovered: recovered,
  };
}

export function upsertProjectConfig(db: Db, key: string, value: string): void {
  db.prepare(
    `INSERT INTO silicon_project_config (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(key, value);
}

export function getProjectConfig(db: Db): Array<{ key: string; value: string; updated_at: string }> {
  return db
    .prepare('SELECT key, value, updated_at FROM silicon_project_config ORDER BY key ASC')
    .all() as Array<{ key: string; value: string; updated_at: string }>;
}

export function sendIapMessage(
  db: Db,
  payload: {
    from_agent: string;
    to_agent: string;
    message_type: string;
    payload: Record<string, unknown>;
  }
): SiliconIapMessage {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO silicon_iap_messages
      (id, from_agent, to_agent, message_type, payload, status, created_at, acked_at)
    VALUES (?, ?, ?, ?, ?, 'queued', datetime('now'), NULL)
  `).run(id, payload.from_agent, payload.to_agent, payload.message_type, JSON.stringify(payload.payload));

  const row = db.prepare('SELECT * FROM silicon_iap_messages WHERE id = ?').get(id) as Record<string, unknown>;
  return {
    id: String(row.id),
    from_agent: String(row.from_agent),
    to_agent: String(row.to_agent),
    message_type: String(row.message_type),
    payload: parseJson<Record<string, unknown>>(row.payload, {}),
    status: String(row.status) as 'queued' | 'acked',
    created_at: String(row.created_at),
    acked_at: row.acked_at ? String(row.acked_at) : null,
  };
}

export function listIapMessages(
  db: Db,
  options: { to_agent?: string; status?: 'queued' | 'acked'; limit?: number }
): SiliconIapMessage[] {
  const limit = Math.max(1, Math.min(Number(options.limit || 30), 200));
  const where: string[] = [];
  const params: unknown[] = [];

  if (options.to_agent) {
    where.push('to_agent = ?');
    params.push(options.to_agent);
  }
  if (options.status) {
    where.push('status = ?');
    params.push(options.status);
  }

  const sql = `
    SELECT *
    FROM silicon_iap_messages
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY datetime(created_at) DESC
    LIMIT ?
  `;

  const rows = db.prepare(sql).all(...params, limit) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    from_agent: String(row.from_agent),
    to_agent: String(row.to_agent),
    message_type: String(row.message_type),
    payload: parseJson<Record<string, unknown>>(row.payload, {}),
    status: String(row.status) as 'queued' | 'acked',
    created_at: String(row.created_at),
    acked_at: row.acked_at ? String(row.acked_at) : null,
  }));
}

export function ackIapMessage(db: Db, id: string): boolean {
  const result = db.prepare(`
    UPDATE silicon_iap_messages
    SET status = 'acked', acked_at = datetime('now')
    WHERE id = ? AND status = 'queued'
  `).run(id);
  return result.changes > 0;
}

export function acquireSyncLock(
  db: Db,
  payload: { lock_key: string; owner_agent: string; ttl_seconds?: number }
): { acquired: boolean; lock: SiliconLock | null; reason?: string } {
  const ttlSec = Math.max(5, Math.min(Number(payload.ttl_seconds || 120), 3600));

  db.prepare(`
    DELETE FROM silicon_sync_locks
    WHERE datetime(expires_at) <= datetime('now')
  `).run();

  const existing = db.prepare('SELECT * FROM silicon_sync_locks WHERE lock_key = ?').get(payload.lock_key) as Record<string, unknown> | undefined;
  if (existing) {
    return {
      acquired: false,
      reason: `lock held by ${String(existing.owner_agent)}`,
      lock: {
        lock_key: String(existing.lock_key),
        owner_agent: String(existing.owner_agent),
        acquired_at: String(existing.acquired_at),
        expires_at: String(existing.expires_at),
      },
    };
  }

  db.prepare(`
    INSERT INTO silicon_sync_locks (lock_key, owner_agent, acquired_at, expires_at)
    VALUES (?, ?, datetime('now'), datetime('now', '+' || ? || ' seconds'))
  `).run(payload.lock_key, payload.owner_agent, ttlSec);

  const row = db.prepare('SELECT * FROM silicon_sync_locks WHERE lock_key = ?').get(payload.lock_key) as Record<string, unknown>;
  return {
    acquired: true,
    lock: {
      lock_key: String(row.lock_key),
      owner_agent: String(row.owner_agent),
      acquired_at: String(row.acquired_at),
      expires_at: String(row.expires_at),
    },
  };
}

export function releaseSyncLock(db: Db, payload: { lock_key: string; owner_agent?: string }): boolean {
  const result = payload.owner_agent
    ? db.prepare('DELETE FROM silicon_sync_locks WHERE lock_key = ? AND owner_agent = ?').run(payload.lock_key, payload.owner_agent)
    : db.prepare('DELETE FROM silicon_sync_locks WHERE lock_key = ?').run(payload.lock_key);
  return result.changes > 0;
}

export function listSyncLocks(db: Db): SiliconLock[] {
  db.prepare(`
    DELETE FROM silicon_sync_locks
    WHERE datetime(expires_at) <= datetime('now')
  `).run();

  const rows = db
    .prepare('SELECT lock_key, owner_agent, acquired_at, expires_at FROM silicon_sync_locks ORDER BY datetime(acquired_at) DESC')
    .all() as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    lock_key: String(row.lock_key),
    owner_agent: String(row.owner_agent),
    acquired_at: String(row.acquired_at),
    expires_at: String(row.expires_at),
  }));
}

type RequirementContract = {
  requirements: Array<{
    id: string;
    rule: string;
    enforcer?: string;
  }>;
};

export function getSpecContract(db: Db): RequirementContract {
  const row = db.prepare('SELECT value FROM silicon_project_config WHERE key = ?').get('spec_contract') as { value?: string } | undefined;
  return parseJson<RequirementContract>(row?.value, { requirements: [] });
}

export function setSpecContract(db: Db, contract: RequirementContract): void {
  upsertProjectConfig(db, 'spec_contract', JSON.stringify(contract));
}

export function validateSpecContract(
  db: Db,
  payload: { code: string; task_id?: string; fail_task_on_violation?: boolean }
): {
  pass: boolean;
  requirement_results: Array<{ id: string; pass: boolean; reason: string }>;
  violated_requirements: string[];
  task_status_updated: boolean;
} {
  const contract = getSpecContract(db);
  const code = payload.code || '';

  const results = contract.requirements.map((req) => {
    const rule = req.rule.toLowerCase();
    if (rule.includes('typed responses')) {
      const hasAny = /\bany\b/.test(code);
      return {
        id: req.id,
        pass: !hasAny,
        reason: hasAny ? 'Detected any-typed response surface.' : 'No obvious any-typed response surface detected.',
      };
    }
    if (rule.includes('no global mutable state')) {
      const hasWindowMutation = /window\.[A-Za-z0-9_]+\s*=/.test(code);
      return {
        id: req.id,
        pass: !hasWindowMutation,
        reason: hasWindowMutation ? 'Detected global window mutation.' : 'No obvious global window mutation detected.',
      };
    }
    if (rule.includes('async') && rule.includes('error')) {
      const asyncFn = /async\s+function|async\s*\(/.test(code);
      const hasTryCatch = /try\s*\{[\s\S]*?\}\s*catch\s*\(/.test(code);
      const pass = !asyncFn || hasTryCatch;
      return {
        id: req.id,
        pass,
        reason: pass ? 'Async path appears to include error boundary.' : 'Async path missing obvious try/catch boundary.',
      };
    }

    return {
      id: req.id,
      pass: true,
      reason: 'No deterministic checker mapped; treated as advisory pass.',
    };
  });

  const violated = results.filter((r) => !r.pass).map((r) => r.id);
  let taskStatusUpdated = false;

  if (violated.length > 0 && payload.fail_task_on_violation && payload.task_id) {
    const task = getSiliconTask(db, payload.task_id);
    if (task) {
      updateSiliconTaskStatus(db, payload.task_id, {
        status: task.attempt_count >= 2 ? 'ESCALATED' : 'FAILED',
        output_raw: `${task.output_raw || ''}\n[spec-validator] Violations: ${violated.join(', ')}`,
      });
      taskStatusUpdated = true;
    }
  }

  return {
    pass: violated.length === 0,
    requirement_results: results,
    violated_requirements: violated,
    task_status_updated: taskStatusUpdated,
  };
}

export function createDeepStateSnapshot(db: Db, reason: string): SiliconSnapshot {
  const snapshotId = randomUUID();

  const tasks = listSiliconTasks(db, { limit: 200 });
  const queue = getQueueSnapshot(db);
  const config = getProjectConfig(db);
  const locks = listSyncLocks(db);

  const blob: Record<string, unknown> = {
    snapshot_id: snapshotId,
    queue,
    config,
    resources: getResourceSnapshot(),
    tasks,
    locks,
    created_at: new Date().toISOString(),
  };

  db.prepare(`
    INSERT INTO silicon_state_snapshots (snapshot_id, reason, snapshot_blob, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(snapshotId, reason || 'manual', JSON.stringify(blob));

  return {
    snapshot_id: snapshotId,
    reason: reason || 'manual',
    snapshot_blob: blob,
    created_at: new Date().toISOString(),
  };
}

export function listDeepStateSnapshots(db: Db, limit: number = 20): SiliconSnapshot[] {
  const lim = Math.max(1, Math.min(Number(limit || 20), 200));
  const rows = db
    .prepare('SELECT snapshot_id, reason, snapshot_blob, created_at FROM silicon_state_snapshots ORDER BY datetime(created_at) DESC LIMIT ?')
    .all(lim) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    snapshot_id: String(row.snapshot_id),
    reason: String(row.reason || 'manual'),
    snapshot_blob: parseJson<Record<string, unknown>>(row.snapshot_blob, {}),
    created_at: String(row.created_at),
  }));
}

export function appendBlackBoxRecord(
  db: Db,
  payload: {
    task_id: string | null;
    agent_id: string;
    prompt: string;
    response: string;
    token_in: number;
    token_out: number;
  }
): string {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO silicon_black_box_log
      (id, task_id, agent_id, prompt, response, token_in, token_out, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    id,
    payload.task_id,
    payload.agent_id,
    payload.prompt,
    payload.response,
    payload.token_in,
    payload.token_out,
  );
  return id;
}

export function getSiliconDashboard(db: Db): {
  supervisor: SupervisorStatus;
  active_tasks: SiliconTask[];
  pending_tasks: SiliconTask[];
  escalated_tasks: SiliconTask[];
  recent_tasks: SiliconTask[];
  config: Array<{ key: string; value: string; updated_at: string }>;
  iap_queue_depth: number;
  lock_count: number;
  snapshot_count: number;
} {
  const iapQueueDepth = db.prepare(`SELECT COUNT(*) AS c FROM silicon_iap_messages WHERE status = 'queued'`).get() as { c: number };
  const lockCount = db.prepare(`SELECT COUNT(*) AS c FROM silicon_sync_locks`).get() as { c: number };
  const snapshotCount = db.prepare(`SELECT COUNT(*) AS c FROM silicon_state_snapshots`).get() as { c: number };

  return {
    supervisor: getSiliconFactoryStatus(db),
    active_tasks: listSiliconTasks(db, { status: 'ACTIVE', limit: 8 }),
    pending_tasks: listSiliconTasks(db, { status: 'PENDING', limit: 8 }),
    escalated_tasks: listSiliconTasks(db, { status: 'ESCALATED', limit: 8 }),
    recent_tasks: listSiliconTasks(db, { limit: 12 }),
    config: getProjectConfig(db),
    iap_queue_depth: iapQueueDepth.c || 0,
    lock_count: lockCount.c || 0,
    snapshot_count: snapshotCount.c || 0,
  };
}

// ─────────────────────────────────────────────
// Test Execution Mapping
// ─────────────────────────────────────────────

const TEST_FILE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /^test_.*\.py$/,
  /.*_test\.py$/,
  /\.test\.ts$/,
  /\.spec\.ts$/,
];

function isTestFile(filename: string): boolean {
  const base = path.basename(filename);
  return TEST_FILE_PATTERNS.some(p => p.test(base));
}

function extractTestNames(content: string, lang: 'ts' | 'js' | 'py'): string[] {
  const names: string[] = [];
  if (lang === 'py') {
    // def test_xxx or async def test_xxx
    for (const m of content.matchAll(/(?:async\s+)?def\s+(test\w+)\s*\(/g)) {
      names.push(m[1]);
    }
  } else {
    // it('...') / test('...') / describe('...')
    for (const m of content.matchAll(/(?:it|test|describe)\s*\(\s*['"`]([^'"`\n]{1,120})['"`]/g)) {
      names.push(m[1]);
    }
    // also function test_xxx() or testXxx()
    for (const m of content.matchAll(/(?:function|async function)\s+(test\w+)\s*\(/g)) {
      names.push(m[1]);
    }
  }
  return [...new Set(names)].slice(0, 200);
}

function inferSourceFileFromTest(testFile: string, projectRoot: string): string | null {
  // Strip test suffixes to guess the source file
  const rel = path.relative(projectRoot, testFile).replace(/\\/g, '/');
  const candidates = [
    rel.replace(/\.test\.([jt]sx?)$/, '.$1'),
    rel.replace(/\.spec\.([jt]sx?)$/, '.$1'),
    rel.replace(/^tests?\//, 'src/').replace(/\.test\.([jt]sx?)$/, '.$1'),
    rel.replace(/^__tests__\//, 'src/').replace(/\.test\.([jt]sx?)$/, '.$1'),
    rel.replace(/test_(.+)\.py$/, '$1.py'),
    rel.replace(/(.+)_test\.py$/, '$1.py'),
  ];
  for (const cand of candidates) {
    if (cand !== rel) {
      const abs = path.join(projectRoot, cand);
      if (existsSync(abs)) return cand;
    }
  }
  return null;
}

function inferSourceSymbolFromTestName(testName: string): string | null {
  // test_myFunction -> myFunction, testMyFunction -> MyFunction
  const stripped = testName
    .replace(/^test[_\s]?/i, '')
    .replace(/[_\s]test$/i, '')
    .trim();
  if (!stripped || stripped.length < 2) return null;
  // camelCase the stripped name
  return stripped.charAt(0).toLowerCase() + stripped.slice(1);
}

export function reindexSiliconTests(
  db: Db,
  payload: { project_id?: string; project_root?: string }
): { indexed: number; test_files_found: number } {
  const ctx = resolveSiliconProjectContext(db, payload);
  if (!ctx.project_root) throw new Error('project_root required for test indexing');
  const root = ctx.project_root;
  const projectId = ctx.project_id || '';

  // Delete stale index for this project
  db.prepare('DELETE FROM silicon_test_index WHERE project_id = ?').run(projectId);

  // Collect all test files by scanning code_symbols file_path column (fastest — already indexed)
  const symbolFiles = db.prepare(
    `SELECT DISTINCT file_path FROM code_symbols ${projectId ? 'WHERE project_id = ?' : ''} LIMIT 5000`
  ).all(...(projectId ? [projectId] : [])) as Array<{ file_path: string }>;

  const testFiles = symbolFiles
    .map(r => r.file_path)
    .filter(isTestFile);

  let indexed = 0;

  const insert = db.prepare(`
    INSERT OR REPLACE INTO silicon_test_index (id, test_file, test_name, source_file, source_symbol, project_id, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const insertMany = db.transaction((rows: Array<{
    id: string; testFile: string; testName: string;
    sourceFile: string | null; sourceSymbol: string | null; projectId: string;
  }>) => {
    for (const r of rows) {
      insert.run(r.id, r.testFile, r.testName, r.sourceFile, r.sourceSymbol, r.projectId);
    }
  });

  for (const testFile of testFiles) {
    try {
      const absPath = resolveAbsoluteFile(root, testFile);
      if (!existsSync(absPath)) continue;
      const content = readFileSync(absPath, 'utf8');
      const lang = testFile.endsWith('.py') ? 'py' : 'ts';
      const testNames = extractTestNames(content, lang);
      const sourceFile = inferSourceFileFromTest(absPath, root);

      const rows = testNames.map(testName => ({
        id: randomUUID(),
        testFile,
        testName,
        sourceFile,
        sourceSymbol: inferSourceSymbolFromTestName(testName),
        projectId,
      }));

      insertMany(rows);
      indexed += rows.length;
    } catch {
      // Skip unreadable files
    }
  }

  return { indexed, test_files_found: testFiles.length };
}

export function findTestsForSymbol(
  db: Db,
  payload: { symbol_name: string; project_id?: string; limit?: number }
): Array<{ test_file: string; test_name: string; source_file: string | null }> {
  const limit = Math.max(1, Math.min(Number(payload.limit || 30), 100));
  const ctx = resolveSiliconProjectContext(db, { project_id: payload.project_id });
  const projectId = payload.project_id || ctx.project_id || '';

  const rows = db.prepare(`
    SELECT test_file, test_name, source_file
    FROM silicon_test_index
    WHERE source_symbol = ?
      ${projectId ? 'AND project_id = ?' : ''}
    ORDER BY test_file ASC, test_name ASC
    LIMIT ?
  `).all(...(projectId ? [payload.symbol_name, projectId, limit] : [payload.symbol_name, limit])) as Array<{
    test_file: string; test_name: string; source_file: string | null;
  }>;

  return rows;
}

export function findTestsForFile(
  db: Db,
  payload: { file_path: string; project_id?: string; limit?: number }
): Array<{ test_file: string; test_name: string; source_symbol: string | null }> {
  const limit = Math.max(1, Math.min(Number(payload.limit || 50), 200));
  const ctx = resolveSiliconProjectContext(db, { project_id: payload.project_id });
  const projectId = payload.project_id || ctx.project_id || '';
  const relFile = normalizeFilePath(payload.file_path);

  const rows = db.prepare(`
    SELECT test_file, test_name, source_symbol
    FROM silicon_test_index
    WHERE source_file = ?
      ${projectId ? 'AND project_id = ?' : ''}
    ORDER BY test_file ASC, test_name ASC
    LIMIT ?
  `).all(...(projectId ? [relFile, projectId, limit] : [relFile, limit])) as Array<{
    test_file: string; test_name: string; source_symbol: string | null;
  }>;

  return rows;
}

// ─────────────────────────────────────────────
// Symbol Embeddings (Lightweight TF-IDF)
// ─────────────────────────────────────────────

function tokenizeSymbol(name: string, kind: string, filePath: string): string[] {
  // Split camelCase and snake_case, add kind and path segments
  const tokens: string[] = [];

  // camelCase / PascalCase split
  const camelSplit = name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  for (const part of camelSplit.toLowerCase().split(/[^a-z0-9]+/)) {
    if (part.length >= 2) tokens.push(part);
  }

  // snake_case already split by the above
  tokens.push(kind.toLowerCase());

  // File path segments (up to 3 deepest)
  const segments = filePath.replace(/\\/g, '/').split('/').filter(Boolean).slice(-3);
  for (const seg of segments) {
    const base = seg.replace(/\.[^.]+$/, '').toLowerCase();
    for (const part of base.split(/[^a-z0-9]+/)) {
      if (part.length >= 2) tokens.push(part);
    }
  }

  return [...new Set(tokens)];
}

export function rebuildSymbolEmbeddings(
  db: Db,
  payload: { project_id?: string }
): { updated: number } {
  const ctx = resolveSiliconProjectContext(db, { project_id: payload.project_id });
  const projectId = ctx.project_id || '';

  // Pull all symbols for this project
  const symbols = db.prepare(`
    SELECT id, name, kind, file_path
    FROM code_symbols
    ${projectId ? 'WHERE project_id = ?' : ''}
    LIMIT 20000
  `).all(...(projectId ? [projectId] : [])) as Array<{
    id: string; name: string; kind: string; file_path: string;
  }>;

  if (symbols.length === 0) return { updated: 0 };

  // Compute document frequencies
  const df = new Map<string, number>();
  const tokenSets = symbols.map(s => {
    const toks = tokenizeSymbol(s.name, s.kind, s.file_path);
    for (const t of toks) df.set(t, (df.get(t) || 0) + 1);
    return toks;
  });

  const N = symbols.length;
  const idf = (term: string): number => {
    const d = df.get(term) || 1;
    return Math.log((N + 1) / (d + 1)) + 1;
  };

  const upsert = db.prepare(`
    INSERT INTO silicon_symbol_embeddings (symbol_id, project_id, terms, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(symbol_id, project_id) DO UPDATE SET terms = excluded.terms, updated_at = excluded.updated_at
  `);

  const upsertMany = db.transaction((batch: Array<{ id: string; projectId: string; terms: string }>) => {
    for (const r of batch) upsert.run(r.id, r.projectId, r.terms);
  });

  const batch = symbols.map((s, i) => {
    const toks = tokenSets[i];
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
    const total = toks.length || 1;
    const terms: Record<string, number> = {};
    for (const [term, count] of tf) {
      terms[term] = Math.round((count / total) * idf(term) * 1000) / 1000;
    }
    return { id: s.id, projectId, terms: JSON.stringify(terms) };
  });

  upsertMany(batch);
  return { updated: batch.length };
}

// Enhanced semantic find: uses embeddings when available, falls back to token scoring
export function semanticFindSiliconWithEmbeddings(
  db: Db,
  payload: {
    query: string;
    project_id?: string;
    limit?: number;
  }
): Array<{ symbol: string; kind: string; file_path: string; score: number; source: 'embedding' | 'lexical' }> {
  const limit = Math.max(1, Math.min(Number(payload.limit || 10), 50));
  const ctx = resolveSiliconProjectContext(db, { project_id: payload.project_id });
  const projectId = payload.project_id || ctx.project_id || '';
  const queryTokens = splitQueryTokens(payload.query);
  if (queryTokens.length === 0) return [];

  // Check if embeddings exist for this project
  const embCount = db.prepare(
    `SELECT COUNT(*) AS c FROM silicon_symbol_embeddings WHERE project_id = ?`
  ).get(projectId) as { c: number };

  if (embCount.c > 0) {
    // Use embedding-based scoring
    const symbols = db.prepare(`
      SELECT cs.id, cs.name, cs.kind, cs.file_path, se.terms
      FROM code_symbols cs
      JOIN silicon_symbol_embeddings se ON se.symbol_id = cs.id AND se.project_id = cs.project_id
      WHERE cs.project_id = ?
      LIMIT 20000
    `).all(projectId) as Array<{ id: string; name: string; kind: string; file_path: string; terms: string }>;

    // Query vector
    const qTokens = queryTokens;

    const scored = symbols.map(s => {
      let score = 0;
      let terms: Record<string, number>;
      try {
        terms = JSON.parse(s.terms) as Record<string, number>;
      } catch {
        terms = {};
      }
      for (const qt of qTokens) {
        score += terms[qt] || 0;
        // Also partial match
        for (const [term, val] of Object.entries(terms)) {
          if (term.includes(qt) && term !== qt) score += val * 0.3;
        }
      }
      return { symbol: s.name, kind: s.kind, file_path: s.file_path, score, source: 'embedding' as const };
    });

    return scored
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // Fallback: use existing lexical semantic find
  const lexical = semanticFindSilicon(db, { query: payload.query, project_id: projectId || undefined, limit });
  return lexical.map(r => ({ ...r, source: 'lexical' as const }));
}
