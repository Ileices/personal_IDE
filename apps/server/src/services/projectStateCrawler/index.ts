// ============================================
// Project State Crawler — Main Service v2
// Walks the project tree, parses files,
// detects drift against the tag registry,
// writes forensic events, and persists
// snapshot results to SQLite.
// ============================================
import { randomUUID } from 'crypto';
import { readdirSync, statSync } from 'fs';
import { join, relative, extname, dirname } from 'path';
import type Database from 'better-sqlite3';
import { parseFile, type DevTagRecord } from './parser.js';

// ── Directories to always skip ─────────────
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'target', 'vendor',
  '__pycache__', '.venv', 'venv', '.next', '.nuxt', 'coverage',
  '.cache', '.turbo', '.svelte-kit', '.parcel-cache',
]);

// ── File extensions to parse ────────────────
const PARSE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rs', '.go', '.java', '.c', '.cpp', '.h', '.hpp',
  '.rb', '.swift', '.kt', '.cs', '.php',
  '.json', '.yaml', '.yml', '.md', '.css', '.html', '.sql',
  '.sh', '.bash', '.toml', '.xml',
]);

const MAX_FILE_SIZE = 500 * 1024; // 500KB

// ── Progress event shape (for SSE streaming) ─
export interface CrawlProgressEvent {
  type: 'progress' | 'file_parsed' | 'drift_found' | 'complete' | 'error';
  message: string;
  snapshot_id?: string;
  files_parsed?: number;
  files_total?: number;
  drift_count?: number;
  elapsed_ms?: number;
  error?: string;
}

export interface CrawlOptions {
  projectRoot: string;
  triggeredBy?: string;
  onProgress?: (event: CrawlProgressEvent) => void;
}

export interface CrawlResult {
  snapshotId: string;
  cycleId: string;
  totalFiles: number;
  parsedFiles: number;
  skippedFiles: number;
  totalDevtags: number;
  driftEvents: number;
  registrySurplus: number;
  registryDeficit: number;
  contentDrift: number;
  locationDrift: number;
  systemicDrift: boolean;
  parseDurationMs: number;
  errors: string[];
}

// ── Sub-crawler result ────────────────────────
interface SubCrawlResult {
  files: Array<{ filePath: string; records: DevTagRecord[] }>;
  skipped: Array<{ filePath: string; reason: string; sizeBytes?: number }>;
}

function walkDirectory(dir: string, projectRoot: string): string[] {
  const files: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (entry.startsWith('.') && entry !== '.') {
      // Allow dot files but skip dot dirs handled below
    }
    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      files.push(...walkDirectory(fullPath, projectRoot));
    } else if (stat.isFile()) {
      const ext = extname(entry).toLowerCase();
      if (PARSE_EXTENSIONS.has(ext)) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

function spawnSubCrawler(
  dir: string,
  projectRoot: string,
  whitelist: Set<string>,
  onDirProgress?: (dirPath: string, fileCount: number, devtagCount: number) => void,
): SubCrawlResult {
  const allFiles = walkDirectory(dir, projectRoot);
  const result: SubCrawlResult = { files: [], skipped: [] };

  // Track per-directory stats
  const dirStats = new Map<string, { files: number; devtags: number; skipped: number; start: number }>();

  for (const filePath of allFiles) {
    const relPath = relative(projectRoot, filePath).replace(/\\/g, '/');
    const dirKey = dirname(relPath);
    if (!dirStats.has(dirKey)) dirStats.set(dirKey, { files: 0, devtags: 0, skipped: 0, start: Date.now() });
    const ds = dirStats.get(dirKey)!;

    const isWhitelisted = whitelist.has(relPath) || whitelist.has(filePath);
    let size = 0;
    try {
      size = statSync(filePath).size;
    } catch {
      ds.skipped++;
      result.skipped.push({ filePath, reason: 'stat_error' });
      continue;
    }

    if (!isWhitelisted && size > MAX_FILE_SIZE) {
      ds.skipped++;
      result.skipped.push({ filePath, reason: 'file_too_large', sizeBytes: size });
      continue;
    }

    const records = parseFile(filePath, isWhitelisted ? Infinity : MAX_FILE_SIZE);

    // Check if parse returned a skip sentinel
    const skippedRec = records.find(r => r.skipped);
    if (skippedRec && !isWhitelisted) {
      ds.skipped++;
      result.skipped.push({ filePath, reason: skippedRec.skipReason || 'skipped', sizeBytes: size });
      continue;
    }

    ds.files++;
    ds.devtags += records.filter(r => !r.skipped).length;
    result.files.push({ filePath, records });
  }

  // Emit per-directory progress
  if (onDirProgress) {
    for (const [dirPath, ds] of dirStats.entries()) {
      onDirProgress(dirPath, ds.files, ds.devtags);
    }
  }

  // Attach directory stats to result for DB write
  (result as SubCrawlResult & { dirStats?: typeof dirStats }).dirStats = dirStats;

  return result;
}

function computeDrift(
  db: Database.Database,
  snapshotId: string,
  allRecords: DevTagRecord[],
  projectRoot: string,
): {
  surplus: number;
  deficit: number;
  content: number;
  location: number;
  driftEvents: Array<{
    entryId: string;
    snapshotId: string;
    driftType: string;
    devtag: string;
    devtagType: string | null;
    filePath: string;
    lineStartRegistry: number | null;
    lineStartSnapshot: number | null;
    contentHashRegistry: string | null;
    contentHashSnapshot: string | null;
    severity: string;
    systemic: number;
  }>;
} {
  // Load existing tag registry (devtags table from BLAME system or the snapshot_devtags from last run)
  // We compare snapshot devtags against the most recent prior snapshot
  const lastSnapshot = db.prepare(`
    SELECT snapshot_id FROM ground_truth_snapshots
    WHERE snapshot_id != ?
    ORDER BY created_at DESC LIMIT 1
  `).get(snapshotId) as { snapshot_id: string } | undefined;

  let registryMap: Map<string, { lineStart: number; contentHash: string }> = new Map();

  if (lastSnapshot) {
    const prev = db.prepare(`
      SELECT devtag_name, file_path, line_start, content_hash
      FROM snapshot_devtags
      WHERE snapshot_id = ?
    `).all(lastSnapshot.snapshot_id) as Array<{
      devtag_name: string;
      file_path: string;
      line_start: number;
      content_hash: string;
    }>;

    for (const r of prev) {
      const key = `${r.file_path}::${r.devtag_name}`;
      registryMap.set(key, { lineStart: r.line_start, contentHash: r.content_hash });
    }
  }

  const events: ReturnType<typeof computeDrift>['driftEvents'] = [];
  const currentKeys = new Set<string>();
  let surplus = 0, deficit = 0, content = 0, location = 0;

  for (const rec of allRecords) {
    if (rec.devtagType === 'file' || rec.devtagType === 'import') continue;
    const key = `${rec.filePath}::${rec.devtagName}`;
    currentKeys.add(key);

    const prev = registryMap.get(key);
    if (!prev) {
      // New tag not in registry → registry_deficit
      deficit++;
      events.push({
        entryId: randomUUID(),
        snapshotId,
        driftType: 'registry_deficit',
        devtag: rec.devtagName,
        devtagType: rec.devtagType,
        filePath: rec.filePath,
        lineStartRegistry: null,
        lineStartSnapshot: rec.lineStart,
        contentHashRegistry: null,
        contentHashSnapshot: rec.contentHash,
        severity: 'info',
        systemic: 0,
      });
    } else {
      // Exists in registry — check content drift
      if (prev.contentHash !== rec.contentHash) {
        content++;
        events.push({
          entryId: randomUUID(),
          snapshotId,
          driftType: 'content_drift',
          devtag: rec.devtagName,
          devtagType: rec.devtagType,
          filePath: rec.filePath,
          lineStartRegistry: prev.lineStart,
          lineStartSnapshot: rec.lineStart,
          contentHashRegistry: prev.contentHash,
          contentHashSnapshot: rec.contentHash,
          severity: Math.abs(rec.lineStart - prev.lineStart) > 50 ? 'error' : 'warning',
          systemic: 0,
        });
      } else if (prev.lineStart !== rec.lineStart) {
        // Line moved but content unchanged → location drift
        location++;
        events.push({
          entryId: randomUUID(),
          snapshotId,
          driftType: 'location_drift',
          devtag: rec.devtagName,
          devtagType: rec.devtagType,
          filePath: rec.filePath,
          lineStartRegistry: prev.lineStart,
          lineStartSnapshot: rec.lineStart,
          contentHashRegistry: prev.contentHash,
          contentHashSnapshot: rec.contentHash,
          severity: 'info',
          systemic: 0,
        });
      }
    }
  }

  // Registry surplus: tags in registry NOT in current snapshot
  for (const [key, prev] of registryMap.entries()) {
    if (!currentKeys.has(key)) {
      const [filePath, devtag] = key.split('::');
      surplus++;
      events.push({
        entryId: randomUUID(),
        snapshotId,
        driftType: 'registry_surplus',
        devtag,
        devtagType: null,
        filePath,
        lineStartRegistry: prev.lineStart,
        lineStartSnapshot: null,
        contentHashRegistry: prev.contentHash,
        contentHashSnapshot: null,
        severity: 'error',
        systemic: 0,
      });
    }
  }

  return { surplus, deficit, content, location, driftEvents: events };
}

export async function runProjectStateCrawler(
  db: Database.Database,
  options: CrawlOptions,
): Promise<CrawlResult> {
  const { projectRoot, triggeredBy = 'manual', onProgress } = options;
  const snapshotId = randomUUID();
  const cycleId = randomUUID();
  const startTime = Date.now();
  const errors: string[] = [];

  const emit = (event: CrawlProgressEvent) => {
    if (onProgress) onProgress(event);
  };

  emit({ type: 'progress', message: 'Starting project state crawl…', snapshot_id: snapshotId });

  // Load whitelist
  let whitelist: Set<string>;
  try {
    const wRows = db.prepare(`SELECT path_pattern FROM psc_whitelist`).all() as Array<{ path_pattern: string }>;
    whitelist = new Set(wRows.map(r => r.path_pattern));
  } catch {
    whitelist = new Set();
  }

  // Create snapshot record (status=running)
  db.prepare(`
    INSERT INTO ground_truth_snapshots
      (id, snapshot_id, cycle_id, project_path, triggered_by, status, timestamp, created_at)
    VALUES (?, ?, ?, ?, ?, 'running', datetime('now'), datetime('now'))
  `).run(snapshotId, snapshotId, cycleId, projectRoot, triggeredBy);

  // Walk project tree with per-dir progress
  emit({ type: 'progress', message: `Scanning directory tree: ${projectRoot}` });
  const dirProgressLog: Array<{ dirPath: string; fileCount: number; devtagCount: number }> = [];
  const crawlResult = spawnSubCrawler(projectRoot, projectRoot, whitelist, (dirPath, fileCount, devtagCount) => {
    dirProgressLog.push({ dirPath, fileCount, devtagCount });
    emit({ type: 'progress', message: `dir: ${dirPath} → ${devtagCount} devtags (${fileCount} files)` });
  });

  const totalFiles = crawlResult.files.length + crawlResult.skipped.length;
  emit({
    type: 'progress',
    message: `Found ${totalFiles} files (${crawlResult.skipped.length} skipped)`,
    files_total: totalFiles,
  });

  // Insert skipped files
  const insertSkip = db.prepare(`
    INSERT INTO psc_skipped_files
      (id, entry_id, snapshot_id, file_path, skip_reason, file_size_bytes, timestamp, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);
  for (const skip of crawlResult.skipped) {
    insertSkip.run(randomUUID(), randomUUID(), snapshotId, skip.filePath, skip.reason, skip.sizeBytes ?? null);
  }

  // Insert devtags
  const insertTag = db.prepare(`
    INSERT INTO snapshot_devtags
      (id, entry_id, snapshot_id, devtag_type, devtag_name, file_path, line_start, line_end,
       parent_devtag, content_hash, language, relationship_tags, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  let totalDevtags = 0;
  let parsedFiles = 0;

  const insertMany = db.transaction(() => {
    for (const { filePath, records } of crawlResult.files) {
      parsedFiles++;
      const relPath = relative(projectRoot, filePath).replace(/\\/g, '/');

      for (const rec of records) {
        const entryId = randomUUID();
        insertTag.run(
          randomUUID(),
          entryId,
          snapshotId,
          rec.devtagType,
          rec.devtagName,
          relPath,
          rec.lineStart,
          rec.lineEnd,
          rec.parentDevtag,
          rec.contentHash,
          rec.language,
          JSON.stringify(rec.relationshipTags),
        );
        totalDevtags++;
      }

      if (parsedFiles % 50 === 0) {
        emit({
          type: 'file_parsed',
          message: `Parsed ${parsedFiles}/${crawlResult.files.length} files…`,
          files_parsed: parsedFiles,
          files_total: crawlResult.files.length,
        });
      }
    }
  });

  try {
    insertMany();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`Devtag insert error: ${msg}`);
    emit({ type: 'error', message: `Insert error: ${msg}` });
  }

  emit({ type: 'progress', message: 'Computing drift against previous snapshot…' });

  // Collect all non-skipped records for drift analysis
  const allRecords = crawlResult.files.flatMap(f => f.records);
  const drift = computeDrift(db, snapshotId, allRecords, projectRoot);

  // Systemic drift: surplus > 5% of total devtags
  const systemicDrift = totalDevtags > 0 && (drift.surplus / totalDevtags) > 0.05;

  // Mark systemic drift events
  if (systemicDrift) {
    for (const ev of drift.driftEvents) {
      ev.systemic = 1;
    }
  }

  // Insert drift events
  const insertDrift = db.prepare(`
    INSERT INTO drift_events
      (id, entry_id, snapshot_id, drift_type, devtag, devtag_type, file_path,
       line_start_registry, line_start_snapshot, content_hash_registry, content_hash_snapshot,
       severity, resolved, systemic, timestamp, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, datetime('now'), datetime('now'))
  `);

  const insertDriftBatch = db.transaction(() => {
    for (const ev of drift.driftEvents) {
      insertDrift.run(
        randomUUID(),
        ev.entryId,
        ev.snapshotId,
        ev.driftType,
        ev.devtag,
        ev.devtagType,
        ev.filePath,
        ev.lineStartRegistry,
        ev.lineStartSnapshot,
        ev.contentHashRegistry,
        ev.contentHashSnapshot,
        ev.severity,
        ev.systemic,
      );
    }
  });

  try {
    insertDriftBatch();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`Drift insert error: ${msg}`);
  }

  // ── Forensic writes ────────────────────────────
  // Auto-update snapshot devtag line numbers for location_drift
  const locationDriftEvents = drift.driftEvents.filter(ev => ev.driftType === 'location_drift');
  if (locationDriftEvents.length > 0) {
    const updateLine = db.prepare(`
      UPDATE snapshot_devtags SET line_start = ?, line_end = line_end + (? - line_start)
      WHERE snapshot_id = ? AND devtag_name = ? AND file_path = ?
    `);
    const updateBatch = db.transaction(() => {
      for (const ev of locationDriftEvents) {
        if (ev.lineStartSnapshot != null) {
          updateLine.run(ev.lineStartSnapshot, ev.lineStartSnapshot, snapshotId, ev.devtag, ev.filePath);
        }
      }
    });
    try { updateBatch(); } catch { /* non-critical */ }
  }

  // Write surplus events to tag_mismatches
  const surplusEvents = drift.driftEvents.filter(ev => ev.driftType === 'registry_surplus');
  if (surplusEvents.length > 0) {
    const insertMismatch = db.prepare(`
      INSERT OR IGNORE INTO tag_mismatches
        (entry_id, devtag, mismatch_type, severity, previous_occurrences, cycle_id, file, agent_id, escalated, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'psc', 0, datetime('now'))
    `);
    const batchMismatch = db.transaction(() => {
      for (const ev of surplusEvents) {
        insertMismatch.run(ev.entryId, ev.devtag, 'registry_surplus', 'error', 0, cycleId, ev.filePath);
      }
    });
    try { batchMismatch(); } catch { /* non-critical */ }
  }

  // Write content_drift events to tag_mismatches
  const contentDriftEvents = drift.driftEvents.filter(ev => ev.driftType === 'content_drift');
  if (contentDriftEvents.length > 0) {
    const insertCDMismatch = db.prepare(`
      INSERT OR IGNORE INTO tag_mismatches
        (entry_id, devtag, mismatch_type, severity, previous_occurrences, cycle_id, file, agent_id, escalated, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'psc', 0, datetime('now'))
    `);
    const batchCD = db.transaction(() => {
      for (const ev of contentDriftEvents) {
        insertCDMismatch.run(ev.entryId, ev.devtag, 'content_drift', ev.severity, 0, cycleId, ev.filePath);
      }
    });
    try { batchCD(); } catch { /* non-critical */ }
  }

  // Write registry_deficit events to vocabulary_gaps
  const deficitEvents = drift.driftEvents.filter(ev => ev.driftType === 'registry_deficit');
  if (deficitEvents.length > 0) {
    const insertVocabGap = db.prepare(`
      INSERT OR IGNORE INTO vocabulary_gaps
        (entry_id, file_path, untagged_structure_type, occurrence_count, first_detected_cycle, resolved, proposed_tag_type, timestamp)
      VALUES (?, ?, ?, 1, ?, 0, ?, datetime('now'))
    `);
    const batchVocab = db.transaction(() => {
      for (const ev of deficitEvents) {
        insertVocabGap.run(ev.entryId, ev.filePath, ev.devtagType || 'unknown', cycleId, ev.devtagType);
      }
    });
    try { batchVocab(); } catch { /* non-critical */ }
  }

  // Write per-directory stats
  const crawlResultWithDirStats = crawlResult as typeof crawlResult & { dirStats?: Map<string, { files: number; devtags: number; skipped: number; start: number }> };
  if (crawlResultWithDirStats.dirStats && crawlResultWithDirStats.dirStats.size > 0) {
    const insertDirStat = db.prepare(`
      INSERT OR REPLACE INTO psc_directory_stats
        (id, snapshot_id, directory_path, file_count, devtag_count, skipped_count, parse_duration_ms, sub_crawler_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'complete', datetime('now'))
    `);
    const batchDirStats = db.transaction(() => {
      for (const [dirPath, ds] of crawlResultWithDirStats.dirStats!.entries()) {
        insertDirStat.run(randomUUID(), snapshotId, dirPath, ds.files, ds.devtags, ds.skipped, Date.now() - ds.start);
      }
    });
    try { batchDirStats(); } catch { /* non-critical */ }
  }

  const parseDurationMs = Date.now() - startTime;

  // Update snapshot to complete
  db.prepare(`
    UPDATE ground_truth_snapshots SET
      total_devtags = ?,
      registry_surplus_count = ?,
      registry_deficit_count = ?,
      content_drift_count = ?,
      location_drift_count = ?,
      systemic_drift_flagged = ?,
      parse_duration_ms = ?,
      total_files = ?,
      skipped_files_count = ?,
      status = ?,
      error_message = ?
    WHERE snapshot_id = ?
  `).run(
    totalDevtags,
    drift.surplus,
    drift.deficit,
    drift.content,
    drift.location,
    systemicDrift ? 1 : 0,
    parseDurationMs,
    crawlResult.files.length,
    crawlResult.skipped.length,
    errors.length > 0 ? 'error' : 'complete',
    errors.length > 0 ? errors.join('; ') : null,
    snapshotId,
  );

  emit({
    type: 'complete',
    message: `Crawl complete: ${totalDevtags} devtags, ${drift.driftEvents.length} drift events (${parseDurationMs}ms)`,
    snapshot_id: snapshotId,
    files_parsed: parsedFiles,
    files_total: totalFiles,
    drift_count: drift.driftEvents.length,
    elapsed_ms: parseDurationMs,
  });

  return {
    snapshotId,
    cycleId,
    totalFiles,
    parsedFiles,
    skippedFiles: crawlResult.skipped.length,
    totalDevtags,
    driftEvents: drift.driftEvents.length,
    registrySurplus: drift.surplus,
    registryDeficit: drift.deficit,
    contentDrift: drift.content,
    locationDrift: drift.location,
    systemicDrift,
    parseDurationMs,
    errors,
  };
}
