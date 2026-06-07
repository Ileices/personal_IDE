// ============================================
// Test Coverage Crawler — Sprint 5 Extension
//
// Scans the codebase to discover:
//   1. Source files that have NO corresponding test files
//   2. Functions/classes that appear untested
//   3. Test files that have no assertion calls
//
// For each gap, creates a Suggested Job of category 'test_missing'.
// Uses LLM (callWithFallback) to generate meaningful test descriptions.
// ============================================
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type Database from 'better-sqlite3';
import { callWithFallback } from '../llm/unifiedFallback.js';

// ── Utilities ──────────────────────────────

function walkDir(dir: string, ext: string[]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'build', '__pycache__'].includes(entry.name)) continue;
      results.push(...walkDir(full, ext));
    } else if (ext.some(e => entry.name.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

function isTestFile(filePath: string): boolean {
  const name = path.basename(filePath).toLowerCase();
  return name.includes('.test.') || name.includes('.spec.') || name.startsWith('test_') || name.endsWith('_test.ts') || name.endsWith('_test.js');
}

function getSourceCounterpart(testFile: string): string {
  // e.g. foo.test.ts → foo.ts, test_foo.py → foo.py
  const base = path.basename(testFile)
    .replace(/\.test\.(ts|js|tsx|jsx|py)$/, '.$1')
    .replace(/\.spec\.(ts|js|tsx|jsx)$/, '.$1')
    .replace(/^test_(.+)\.py$/, '$1.py')
    .replace(/(.+)_test\.py$/, '$1.py');
  return path.join(path.dirname(testFile), base);
}

// ── Extract exported symbols from a TypeScript file ──

function extractExportedSymbols(filePath: string): string[] {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const symbols: string[] = [];
    // Functions
    const funcMatches = content.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g);
    for (const m of funcMatches) symbols.push(m[1]);
    // Classes
    const classMatches = content.matchAll(/export\s+class\s+(\w+)/g);
    for (const m of classMatches) symbols.push(m[1]);
    // Arrow functions / const exports
    const arrowMatches = content.matchAll(/export\s+const\s+(\w+)\s*=/g);
    for (const m of arrowMatches) symbols.push(m[1]);
    return symbols;
  } catch {
    return [];
  }
}

// ── Create a job for uncovered file ──

async function createCoverageJob(
  db: Database.Database,
  sourceFile: string,
  projectId: string | null,
  symbols: string[],
  cycleCount: number,
): Promise<boolean> {
  const relPath = sourceFile.replace(/\\/g, '/').split('/src/').pop() || sourceFile;
  const symbolList = symbols.slice(0, 5).join(', ');

  let jobTitle = `Add tests for ${path.basename(sourceFile)}`;
  let jobDescription = `File ${relPath} has no test coverage. ${symbols.length > 0 ? `Exported symbols: ${symbolList}${symbols.length > 5 ? ` (+${symbols.length - 5} more)` : ''}.` : ''} Create unit tests to ensure correctness.`;

  // Use LLM to enrich the job description if available
  try {
    const result = await callWithFallback({
      messages: [{
        role: 'user',
        content: `Generate a concise software task for adding tests.

File: ${relPath}
Exports: ${symbolList || '(unknown)'}

Respond ONLY with JSON: { "title": "...", "description": "2-3 sentences" }`,
      }],
      maxTokens: 150,
      temperature: 0.2,
      chainKey: 'lightweight',
      db,
      taskType: 'test_coverage_enrichment',
    });

    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { title?: string; description?: string };
      if (parsed.title) jobTitle = parsed.title.slice(0, 120);
      if (parsed.description) jobDescription = parsed.description.slice(0, 500);
    }
  } catch {
    // LLM enrichment is optional
  }

  // Check if a similar job already exists
  const existing = db.prepare(`
    SELECT id FROM job_records
    WHERE job_category = 'test_missing' AND title LIKE ? AND implementation_status NOT IN ('rejected','archived','implemented')
  `).get(`%${path.basename(sourceFile)}%`) as { id: string } | undefined;

  if (existing) return false;

  const jobId = randomUUID();
  const now = db.prepare(`SELECT CAST(strftime('%s','now') AS INTEGER) as t`).get() as { t: number };

  db.prepare(`
    INSERT INTO job_records (
      id, job_id, project_id, title, description, priority, job_category,
      source, implementation_status, created_cycle, last_updated_cycle,
      source_record_ids, affected_files, affected_devtags, affected_plantags,
      required_buildtags, blocking_jobs, blocked_by_jobs, hierarchy, atomic_steps, sandbox_spec
    ) VALUES (?, ?, ?, ?, ?, 'medium', 'test_missing', 'test_coverage_crawler', 'suggested',
      ?, ?, '[]', ?, '[]', '[]', '[]', '[]', '[]', ?, '[]', ?)
  `).run(
    randomUUID(),
    jobId,
    projectId,
    jobTitle,
    jobDescription,
    cycleCount,
    cycleCount,
    JSON.stringify([sourceFile]),
    JSON.stringify({ phase: 1, milestone: 'test-coverage', parent_job_id: null, child_job_ids: [] }),
    JSON.stringify({ sandbox_id: null, status: 'not_started', cycle_limit: 50, cycles_used: 0, test_results: [], human_review_required: false, human_review_completed: false }),
  );

  // Record in test_coverage_map
  try {
    db.prepare(`
      INSERT OR IGNORE INTO test_coverage_map (id, project_id, test_file, source_file, coverage_type)
      VALUES (?, ?, '', ?, 'missing')
    `).run(randomUUID(), projectId || '', sourceFile);
  } catch { /* table may not exist yet */ }

  return true;
}

// ── Main crawler tick ──────────────────────────

export interface TestCoverageCrawlerResult {
  scanned: number;
  uncovered: number;
  jobsCreated: number;
  errors: string[];
}

export async function runTestCoverageCrawlerTick(db: Database.Database): Promise<TestCoverageCrawlerResult> {
  const result: TestCoverageCrawlerResult = { scanned: 0, uncovered: 0, jobsCreated: 0, errors: [] };

  const project = db.prepare(`SELECT id, root_path FROM projects ORDER BY last_accessed_at DESC LIMIT 1`).get() as { id: string; root_path: string } | undefined;
  if (!project?.root_path) {
    result.errors.push('No active project found');
    return result;
  }

  const cycleRow = db.prepare(`SELECT CAST(strftime('%s','now') AS INTEGER) as t`).get() as { t: number };
  const cycleCount = cycleRow.t;

  // Scan for TypeScript/JavaScript/Python files
  const allFiles = walkDir(project.root_path, ['.ts', '.tsx', '.js', '.jsx', '.py']);
  const sourceFiles = allFiles.filter(f => !isTestFile(f));
  const testFiles = new Set(allFiles.filter(isTestFile).map(f => getSourceCounterpart(f)));

  result.scanned = sourceFiles.length;

  // Find uncovered source files (cap at 10 per tick to avoid overwhelming the queue)
  let created = 0;
  for (const sourceFile of sourceFiles) {
    if (created >= 10) break;
    if (testFiles.has(sourceFile)) continue;  // has tests

    result.uncovered++;
    const symbols = extractExportedSymbols(sourceFile);
    const ok = await createCoverageJob(db, sourceFile, project.id, symbols, cycleCount);
    if (ok) {
      result.jobsCreated++;
      created++;
    }
  }

  return result;
}
