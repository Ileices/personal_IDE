import { randomUUID } from 'crypto';
import { relative, resolve } from 'path';
import type Database from 'better-sqlite3';
import { HierarchicalCodeIndex } from '../agent/indexer/hierarchicalIndex.js';
import { RelationshipIndexService } from '../analysis/relationshipIndex.js';

export interface CrawlerCoordinatorInput {
  projectId: string;
  projectRoot: string;
  maxFiles?: number;
}

export interface CrawlerCoordinatorResult {
  projectId: string;
  projectRoot: string;
  indexedAt: string;
  snapshotId: string | null;
  filesIndexed: number;
  totalNodes: number;
  symbols: number;
  relationships: number;
  conflicts: number;
  driftEvents: number;
  semanticSymbols: number;
  topFiles: Array<{ filePath: string; symbols: number; relationships: number }>;
  hotPaths: string[];
}

type IntelligenceRow = {
  facet: 'overview' | 'file' | 'relationship' | 'drift' | 'semantic';
  entityKey: string;
  filePath?: string | null;
  summary: string;
  score: number;
  metrics: Record<string, unknown>;
  sourceSnapshotId?: string | null;
};

function clampMaxFiles(value: number | undefined): number {
  if (!Number.isFinite(Number(value))) return 5000;
  return Math.max(100, Math.min(20000, Number(value)));
}

function getProjectFilesFromIndex(db: Database.Database, projectRoot: string, maxFiles: number): string[] {
  const rows = db.prepare(`
    SELECT DISTINCT file_path
    FROM code_index_nodes
    WHERE project_root = ?
      AND node_type = 'FILE'
      AND file_path IS NOT NULL
    ORDER BY file_path ASC
    LIMIT ?
  `).all(projectRoot, maxFiles) as Array<{ file_path: string }>;

  return rows
    .map((r) => String(r.file_path || '').trim())
    .filter((v) => v.length > 0);
}

function upsertIntelligenceRows(
  db: Database.Database,
  projectId: string,
  projectRoot: string,
  indexedAt: string,
  rows: IntelligenceRow[],
): void {
  const upsert = db.prepare(`
    INSERT INTO codebase_intelligence (
      id, project_id, project_root, facet, entity_key, file_path, summary,
      score, metrics_json, source_snapshot_id, indexed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(project_id, facet, entity_key)
    DO UPDATE SET
      project_root = excluded.project_root,
      file_path = excluded.file_path,
      summary = excluded.summary,
      score = excluded.score,
      metrics_json = excluded.metrics_json,
      source_snapshot_id = excluded.source_snapshot_id,
      indexed_at = excluded.indexed_at,
      updated_at = datetime('now')
  `);

  const tx = db.transaction((payload: IntelligenceRow[]) => {
    for (const row of payload) {
      upsert.run(
        randomUUID(),
        projectId,
        projectRoot,
        row.facet,
        row.entityKey,
        row.filePath || null,
        row.summary,
        row.score,
        JSON.stringify(row.metrics || {}),
        row.sourceSnapshotId || null,
        indexedAt,
      );
    }
  });

  tx(rows);
}

export function runCrawlerCoordinatorTick(db: Database.Database, input: CrawlerCoordinatorInput): CrawlerCoordinatorResult {
  const projectRoot = resolve(input.projectRoot);
  const maxFiles = clampMaxFiles(input.maxFiles);
  const indexedAt = new Date().toISOString();

  const hierarchical = new HierarchicalCodeIndex(db);
  const indexStats = hierarchical.incrementalUpdate(projectRoot);

  const files = getProjectFilesFromIndex(db, projectRoot, maxFiles);
  const relationship = new RelationshipIndexService(db).scanProject(input.projectId, projectRoot, files);

  const latestSnapshot = db.prepare(`
    SELECT snapshot_id, total_devtags, drift_events
    FROM ground_truth_snapshots
    WHERE project_path = ?
    ORDER BY datetime(created_at) DESC
    LIMIT 1
  `).get(projectRoot) as
    | { snapshot_id: string; total_devtags: number; drift_events: number }
    | undefined;

  const semanticCount = (db.prepare(`
    SELECT COUNT(*) AS c
    FROM silicon_symbol_embeddings
    WHERE project_id = ?
  `).get(input.projectId) as { c?: number } | undefined)?.c || 0;

  const topFiles = db.prepare(`
    SELECT
      s.file_path AS file_path,
      COUNT(DISTINCT s.id) AS symbol_count,
      COUNT(DISTINCT r.id) AS relationship_count
    FROM code_symbols s
    LEFT JOIN code_relationships r
      ON r.project_id = s.project_id
     AND (r.source_symbol_id = s.id OR r.target_symbol_id = s.id)
    WHERE s.project_id = ?
    GROUP BY s.file_path
    ORDER BY symbol_count DESC, relationship_count DESC
    LIMIT 30
  `).all(input.projectId) as Array<{
    file_path: string;
    symbol_count: number;
    relationship_count: number;
  }>;

  const rows: IntelligenceRow[] = [];
  rows.push({
    facet: 'overview',
    entityKey: 'latest',
    summary: `Indexed ${relationship.fileCount} files with ${relationship.symbolCount} symbols and ${relationship.relationshipCount} relationships.`,
    score: Math.min(1, (relationship.symbolCount + relationship.relationshipCount) / 20000),
    sourceSnapshotId: latestSnapshot?.snapshot_id || null,
    metrics: {
      indexedAt,
      filesIndexed: relationship.fileCount,
      totalNodes: indexStats.totalNodes,
      totalTokens: indexStats.totalTokens,
      symbols: relationship.symbolCount,
      relationships: relationship.relationshipCount,
      conflicts: relationship.conflictCount,
      driftEvents: latestSnapshot?.drift_events || 0,
      snapshotDevtags: latestSnapshot?.total_devtags || 0,
      semanticSymbols: semanticCount,
    },
  });

  for (const hotPath of relationship.hotPaths.slice(0, 20)) {
    rows.push({
      facet: 'relationship',
      entityKey: `hot:${hotPath}`,
      summary: `High connectivity symbol path: ${hotPath}`,
      score: 0.8,
      metrics: { symbol: hotPath },
      sourceSnapshotId: latestSnapshot?.snapshot_id || null,
    });
  }

  for (const file of topFiles) {
    const relPath = String(file.file_path || '').replace(/\\/g, '/');
    rows.push({
      facet: 'file',
      entityKey: relPath,
      filePath: relPath,
      summary: `${relPath} has ${file.symbol_count} indexed symbols and ${file.relationship_count} linked relationships.`,
      score: Math.min(1, (Number(file.symbol_count || 0) + Number(file.relationship_count || 0)) / 400),
      sourceSnapshotId: latestSnapshot?.snapshot_id || null,
      metrics: {
        symbolCount: Number(file.symbol_count || 0),
        relationshipCount: Number(file.relationship_count || 0),
      },
    });
  }

  rows.push({
    facet: 'drift',
    entityKey: latestSnapshot?.snapshot_id || 'none',
    summary: latestSnapshot
      ? `Latest PSC snapshot ${latestSnapshot.snapshot_id} reports ${latestSnapshot.drift_events} drift events.`
      : 'No PSC snapshot available yet for this project root.',
    score: latestSnapshot ? Math.min(1, Number(latestSnapshot.drift_events || 0) / 100) : 0,
    sourceSnapshotId: latestSnapshot?.snapshot_id || null,
    metrics: {
      snapshotId: latestSnapshot?.snapshot_id || null,
      driftEvents: latestSnapshot?.drift_events || 0,
      totalDevtags: latestSnapshot?.total_devtags || 0,
    },
  });

  rows.push({
    facet: 'semantic',
    entityKey: 'embedding_coverage',
    summary: `Semantic symbol embeddings available for ${semanticCount} symbols in this project.`,
    score: Math.min(1, semanticCount / 5000),
    sourceSnapshotId: latestSnapshot?.snapshot_id || null,
    metrics: {
      semanticSymbols: semanticCount,
      embeddingSource: 'silicon_symbol_embeddings',
    },
  });

  upsertIntelligenceRows(db, input.projectId, projectRoot, indexedAt, rows);

  return {
    projectId: input.projectId,
    projectRoot,
    indexedAt,
    snapshotId: latestSnapshot?.snapshot_id || null,
    filesIndexed: relationship.fileCount,
    totalNodes: indexStats.totalNodes,
    symbols: relationship.symbolCount,
    relationships: relationship.relationshipCount,
    conflicts: relationship.conflictCount,
    driftEvents: latestSnapshot?.drift_events || 0,
    semanticSymbols: semanticCount,
    topFiles: topFiles.map((f) => ({
      filePath: String(f.file_path || '').replace(/\\/g, '/'),
      symbols: Number(f.symbol_count || 0),
      relationships: Number(f.relationship_count || 0),
    })),
    hotPaths: relationship.hotPaths,
  };
}

export function readCodebaseIntelligence(
  db: Database.Database,
  projectId: string,
  facet?: 'overview' | 'file' | 'relationship' | 'drift' | 'semantic',
  limit = 100,
): Array<{
  facet: string;
  entityKey: string;
  filePath: string | null;
  summary: string;
  score: number;
  metrics: Record<string, unknown>;
  sourceSnapshotId: string | null;
  indexedAt: string;
}> {
  const cap = Math.max(1, Math.min(limit, 1000));

  const rows = facet
    ? db.prepare(`
      SELECT facet, entity_key, file_path, summary, score, metrics_json, source_snapshot_id, indexed_at
      FROM codebase_intelligence
      WHERE project_id = ? AND facet = ?
      ORDER BY score DESC, datetime(indexed_at) DESC
      LIMIT ?
    `).all(projectId, facet, cap)
    : db.prepare(`
      SELECT facet, entity_key, file_path, summary, score, metrics_json, source_snapshot_id, indexed_at
      FROM codebase_intelligence
      WHERE project_id = ?
      ORDER BY datetime(indexed_at) DESC, score DESC
      LIMIT ?
    `).all(projectId, cap);

  return (rows as Array<{
    facet: string;
    entity_key: string;
    file_path: string | null;
    summary: string;
    score: number;
    metrics_json: string;
    source_snapshot_id: string | null;
    indexed_at: string;
  }>).map((row) => ({
    facet: row.facet,
    entityKey: row.entity_key,
    filePath: row.file_path,
    summary: row.summary,
    score: Number(row.score || 0),
    metrics: (() => {
      try {
        return JSON.parse(row.metrics_json || '{}');
      } catch {
        return {};
      }
    })(),
    sourceSnapshotId: row.source_snapshot_id,
    indexedAt: row.indexed_at,
  }));
}
