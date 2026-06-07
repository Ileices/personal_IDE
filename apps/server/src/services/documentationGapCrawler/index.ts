// ============================================
// Documentation Gap Crawler — Sprint 5 Extension
//
// Scans TypeScript/JavaScript source files to find:
//   1. Exported public functions/classes WITHOUT JSDoc/docstrings
//   2. REST API route handlers without response schema docs
//   3. Public interfaces without type documentation
//
// Creates Suggested Jobs of category 'model_tool_enhancement'
// to add documentation where missing.
//
// Uses callWithFallback() for LLM enrichment of job descriptions.
// ============================================
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type Database from 'better-sqlite3';
import { callWithFallback } from '../llm/unifiedFallback.js';

// ── Walk file tree ─────────────────────────

function walkDir(dir: string, ext: string[]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) continue;
      results.push(...walkDir(full, ext));
    } else if (ext.some(e => entry.name.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

// ── Find undocumented exports ──────────────

interface DocGap {
  file: string;
  symbolName: string;
  symbolType: 'function' | 'class' | 'interface' | 'route';
  lineNumber: number;
  snippet: string;
}

function findDocGaps(filePath: string): DocGap[] {
  const gaps: DocGap[] = [];
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return gaps;
  }

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for exported function/class/interface
    const exportMatch = line.match(/^export\s+(?:async\s+)?(?:function|class|interface|const)\s+(\w+)/);
    if (!exportMatch) continue;

    const symbolName = exportMatch[1];

    // Check if previous non-empty line is a JSDoc comment
    let prevLine = i - 1;
    while (prevLine >= 0 && lines[prevLine].trim() === '') prevLine--;
    const hasDocs = prevLine >= 0 && (
      lines[prevLine].trim().endsWith('*/') ||          // end of JSDoc block
      lines[prevLine].trim().startsWith('// ')          // inline comment
    );

    if (!hasDocs) {
      const symbolType: DocGap['symbolType'] = line.includes('class ') ? 'class'
        : line.includes('interface ') ? 'interface'
        : 'function';

      gaps.push({
        file: filePath,
        symbolName,
        symbolType,
        lineNumber: i + 1,
        snippet: line.slice(0, 100),
      });
    }
  }

  return gaps;
}

// ── Create a job for doc gap ──

async function createDocGapJob(
  db: Database.Database,
  gap: DocGap,
  projectId: string | null,
  cycleCount: number,
): Promise<boolean> {
  const relPath = gap.file.replace(/\\/g, '/').split('/src/').pop() || gap.file;

  // Check for existing similar job
  const existing = db.prepare(`
    SELECT id FROM job_records
    WHERE job_category = 'model_tool_enhancement'
    AND title LIKE ? AND implementation_status NOT IN ('rejected','archived','implemented')
  `).get(`%${gap.symbolName}%`) as { id: string } | undefined;

  if (existing) return false;

  // Also check doc_gap_records
  try {
    const existingGap = db.prepare(`
      SELECT id FROM doc_gap_records WHERE file_path = ? AND symbol_name = ? AND resolved_at IS NULL
    `).get(gap.file, gap.symbolName) as { id: string } | undefined;
    if (existingGap) return false;
  } catch { /* table may not exist yet */ }

  let jobTitle = `Document ${gap.symbolType} \`${gap.symbolName}\` in ${path.basename(gap.file)}`;
  let jobDescription = `The ${gap.symbolType} \`${gap.symbolName}\` in ${relPath} (line ${gap.lineNumber}) has no JSDoc documentation. Add a JSDoc comment describing its purpose, parameters, and return type.`;

  // LLM enrichment
  try {
    const result = await callWithFallback({
      messages: [{
        role: 'user',
        content: `Generate a concise task to add documentation.

Symbol: ${gap.symbolName} (${gap.symbolType})
File: ${relPath}
Code: ${gap.snippet}

Respond ONLY with JSON: { "title": "...", "description": "2-3 sentences max" }`,
      }],
      maxTokens: 150,
      temperature: 0.2,
      chainKey: 'lightweight',
      db,
      taskType: 'doc_gap_enrichment',
    });

    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { title?: string; description?: string };
      if (parsed.title) jobTitle = parsed.title.slice(0, 120);
      if (parsed.description) jobDescription = parsed.description.slice(0, 500);
    }
  } catch { /* enrichment optional */ }

  const jobId = randomUUID();

  db.prepare(`
    INSERT INTO job_records (
      id, job_id, project_id, title, description, priority, job_category,
      source, implementation_status, created_cycle, last_updated_cycle,
      source_record_ids, affected_files, affected_devtags, affected_plantags,
      required_buildtags, blocking_jobs, blocked_by_jobs, hierarchy, atomic_steps, sandbox_spec
    ) VALUES (?, ?, ?, ?, ?, 'low', 'model_tool_enhancement', 'doc_gap_crawler', 'suggested',
      ?, ?, '[]', ?, '[]', '[]', '[]', '[]', '[]', ?, '[]', ?)
  `).run(
    randomUUID(),
    jobId,
    projectId,
    jobTitle,
    jobDescription,
    cycleCount,
    cycleCount,
    JSON.stringify([gap.file]),
    JSON.stringify({ phase: 1, milestone: 'documentation', parent_job_id: null, child_job_ids: [] }),
    JSON.stringify({ sandbox_id: null, status: 'not_started', cycle_limit: 20, cycles_used: 0, test_results: [], human_review_required: false, human_review_completed: false }),
  );

  // Record in doc_gap_records
  try {
    db.prepare(`
      INSERT OR IGNORE INTO doc_gap_records (id, project_id, file_path, symbol_name, symbol_type, gap_type, job_id)
      VALUES (?, ?, ?, ?, ?, 'missing_jsdoc', ?)
    `).run(randomUUID(), projectId || '', gap.file, gap.symbolName, gap.symbolType, jobId);
  } catch { /* table may not exist yet */ }

  return true;
}

// ── Main crawler tick ──────────────────────────

export interface DocGapCrawlerResult {
  filesScanned: number;
  gapsFound: number;
  jobsCreated: number;
  errors: string[];
}

export async function runDocumentationGapCrawlerTick(db: Database.Database): Promise<DocGapCrawlerResult> {
  const result: DocGapCrawlerResult = { filesScanned: 0, gapsFound: 0, jobsCreated: 0, errors: [] };

  const project = db.prepare(`SELECT id, root_path FROM projects ORDER BY last_accessed_at DESC LIMIT 1`).get() as { id: string; root_path: string } | undefined;
  if (!project?.root_path) {
    result.errors.push('No active project found');
    return result;
  }

  const cycleRow = db.prepare(`SELECT CAST(strftime('%s','now') AS INTEGER) as t`).get() as { t: number };
  const cycleCount = cycleRow.t;

  // Focus on server-side TypeScript (most documented)
  const serverSrc = path.join(project.root_path, 'apps', 'server', 'src');
  const files = walkDir(fs.existsSync(serverSrc) ? serverSrc : project.root_path, ['.ts', '.tsx']);

  result.filesScanned = files.length;

  let created = 0;
  for (const file of files) {
    if (created >= 8) break;  // cap per tick

    const gaps = findDocGaps(file);
    result.gapsFound += gaps.length;

    for (const gap of gaps.slice(0, 3)) {  // max 3 jobs per file per tick
      if (created >= 8) break;
      const ok = await createDocGapJob(db, gap, project.id, cycleCount);
      if (ok) {
        result.jobsCreated++;
        created++;
      }
    }
  }

  return result;
}
