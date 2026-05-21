// seed-gap-analysis.mjs
// Inserts realistic sample data into all gap analysis tables
// and then calls the compute endpoints to populate derived data.
// Run: node seed-gap-analysis.mjs

import Database from 'better-sqlite3';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, '../data/personal-ide.db');

console.log('Opening DB at:', DB_PATH);
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF'); // Disable FK checks for seed data

const now = new Date().toISOString();
const cycle = 'seed-cycle-001';

// ─────────────────────────────────────────────────────────────
// 1. DEVTAGS — Register realistic tagged components
// Schema: id, tag_key, tag_type, name, parent_id, file_path,
//         line_start, line_end, project_id, status, metadata, created_at, updated_at
// ─────────────────────────────────────────────────────────────
console.log('Inserting devtags...');
const devtagStmt = db.prepare(`
  INSERT OR IGNORE INTO devtags (id, tag_key, tag_type, name, parent_id, file_path, line_start, line_end, project_id, status, metadata, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const devtags = [
  // Functions
  { id: randomUUID(), key: 'devtag:function:handleChatRequest', type: 'function', name: 'handleChatRequest', file: 'apps/server/src/routes/chat.ts', ls: 10, le: 45, parent: 'chat-router' },
  { id: randomUUID(), key: 'devtag:function:resolveContext', type: 'function', name: 'resolveContext', file: 'apps/server/src/services/context.ts', ls: 5, le: 30, parent: 'context-service' },
  { id: randomUUID(), key: 'devtag:function:buildTagRegistry', type: 'function', name: 'buildTagRegistry', file: 'apps/server/src/services/tags.ts', ls: 12, le: 65, parent: 'tag-service' },
  { id: randomUUID(), key: 'devtag:function:runGapAnalysis', type: 'function', name: 'runGapAnalysis', file: 'apps/server/src/services/gapAnalysis/index.ts', ls: 20, le: 80, parent: 'gap-agent' },
  { id: randomUUID(), key: 'devtag:function:computeDebtScore', type: 'function', name: 'computeDebtScore', file: 'apps/server/src/services/gapAnalysis/debtTracking.ts', ls: 55, le: 110, parent: 'debt-agent' },
  // Handlers
  { id: randomUUID(), key: 'devtag:handler:onAgentComplete', type: 'handler', name: 'onAgentComplete', file: 'apps/server/src/services/agentFleet.ts', ls: 100, le: 140, parent: 'fleet-manager' },
  { id: randomUUID(), key: 'devtag:handler:onBuildStep', type: 'handler', name: 'onBuildStep', file: 'apps/server/src/services/buildRunner.ts', ls: 60, le: 95, parent: 'build-runner' },
  { id: randomUUID(), key: 'devtag:handler:onPatternDetected', type: 'handler', name: 'onPatternDetected', file: 'apps/server/src/services/gapAnalysis/patternRecognition.ts', ls: 80, le: 120, parent: 'pattern-agent' },
  // Routes
  { id: randomUUID(), key: 'devtag:route:POST:/api/gap/run', type: 'route', name: 'POST:/api/gap/run', file: 'apps/server/src/routes/gapAnalysis.ts', ls: 42, le: 50, parent: 'gap-routes' },
  { id: randomUUID(), key: 'devtag:route:GET:/api/gap/summary', type: 'route', name: 'GET:/api/gap/summary', file: 'apps/server/src/routes/gapAnalysis.ts', ls: 29, le: 33, parent: 'gap-routes' },
  { id: randomUUID(), key: 'devtag:route:POST:/api/chat/send', type: 'route', name: 'POST:/api/chat/send', file: 'apps/server/src/routes/chat.ts', ls: 55, le: 90, parent: 'chat-router' },
  // Needs refactor
  { id: randomUUID(), key: 'devtag:needs_refactor:context-resolver-v1', type: 'needs_refactor', name: 'context-resolver-v1', file: 'apps/server/src/services/context.ts', ls: 200, le: 250, parent: 'context-service' },
  { id: randomUUID(), key: 'devtag:needs_refactor:legacy-tag-parser', type: 'needs_refactor', name: 'legacy-tag-parser', file: 'apps/server/src/services/tags.ts', ls: 300, le: 350, parent: 'tag-service' },
  // Dead code
  { id: randomUUID(), key: 'devtag:dead_code:old-embedding-router', type: 'dead_code', name: 'old-embedding-router', file: 'apps/server/src/services/embeddingRouter.ts', ls: 1, le: 80, parent: null },
  // Tests
  { id: randomUUID(), key: 'devtag:test:handleChatRequest', type: 'test', name: 'test:handleChatRequest', file: 'testing/e2e/chat.test.ts', ls: 1, le: 40, parent: 'chat-tests' },
  { id: randomUUID(), key: 'devtag:test:computeDebtScore', type: 'test', name: 'test:computeDebtScore', file: 'testing/e2e/debt.test.ts', ls: 1, le: 35, parent: 'debt-tests' },
  // Nano components
  { id: randomUUID(), key: 'devtag:nano:QueryParserNano', type: 'nano', name: 'QueryParserNano', file: 'NANO_train/nanos/QueryParserNano.py', ls: 1, le: 120, parent: 'nano-fleet' },
  { id: randomUUID(), key: 'devtag:nano:EmbeddingNano', type: 'nano', name: 'EmbeddingNano', file: 'NANO_train/nanos/EmbeddingNano.py', ls: 1, le: 90, parent: 'nano-fleet' },
  { id: randomUUID(), key: 'devtag:nano:RankNano', type: 'nano', name: 'RankNano', file: 'NANO_train/nanos/RankNano.py', ls: 1, le: 100, parent: 'nano-fleet' },
  { id: randomUUID(), key: 'devtag:nano:training_target:QueryParserNano', type: 'nano', name: 'training_target:QueryParserNano', file: 'NANO_train/training/QueryParserNano_targets.json', ls: 1, le: 5, parent: 'nano-training' },
];

const insertDevtags = db.transaction(() => {
  for (const d of devtags) {
    devtagStmt.run(d.id, d.key, d.type, d.name, d.parent ?? null, d.file, d.ls, d.le, 'default', 'active', '{}', now, now);
  }
});
insertDevtags();
console.log(`  Inserted ${devtags.length} devtags`);

// ─────────────────────────────────────────────────────────────
// 2. PLANTAGS — Active plan entries with requires/produces
// Schema: id, tag_key, tag_type, name, project_id, status,
//         blocking_reason, linked_devtag_id, cycle_id, metadata, created_at, updated_at
// ─────────────────────────────────────────────────────────────
console.log('Inserting plantags...');
const plantagStmt = db.prepare(`
  INSERT OR IGNORE INTO plantags (id, tag_key, tag_type, name, project_id, status, metadata, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const plantags = [
  {
    id: randomUUID(),
    key: 'plantag:goal:gap-analysis-system',
    type: 'goal',
    name: 'Gap Analysis System',
    status: 'active',
    meta: { phase: 'phase-3', milestone: 'gap-analysis', requires: ['devtag:function:runGapAnalysis', 'devtag:function:computeDebtScore', 'devtag:route:POST:/api/gap/run'], produces: ['devtag:test:runGapAnalysis'] }
  },
  {
    id: randomUUID(),
    key: 'plantag:step:wire-coverage-agent',
    type: 'step',
    name: 'Wire Coverage Agent',
    status: 'active',
    meta: { phase: 'phase-3', milestone: 'gap-analysis', requires: ['devtag:function:resolveContext', 'devtag:function:buildTagRegistry'], produces: ['devtag:test:resolveContext'] }
  },
  {
    id: randomUUID(),
    key: 'plantag:goal:nano-training-pipeline',
    type: 'goal',
    name: 'Nano Training Pipeline',
    status: 'active',
    meta: { phase: 'phase-2', milestone: 'nano-fleet', requires: ['devtag:nano:QueryParserNano', 'devtag:nano:EmbeddingNano', 'devtag:nano:training_target:QueryParserNano'], produces: ['devtag:nano:RankNano'] }
  },
  {
    id: randomUUID(),
    key: 'plantag:step:chat-api-handlers',
    type: 'step',
    name: 'Chat API Handlers',
    status: 'done',
    meta: { phase: 'phase-1', milestone: 'core-api', requires: ['devtag:function:handleChatRequest', 'devtag:route:POST:/api/chat/send'], produces: ['devtag:test:handleChatRequest'] }
  },
  {
    id: randomUUID(),
    key: 'plantag:step:agent-fleet-events',
    type: 'step',
    name: 'Agent Fleet Event Handlers',
    status: 'active',
    meta: { phase: 'phase-2', milestone: 'fleet', requires: ['devtag:handler:onAgentComplete', 'devtag:handler:onBuildStep'], produces: ['devtag:test:onAgentComplete'], test_required: true }
  },
];

const insertPlantags = db.transaction(() => {
  for (const p of plantags) {
    plantagStmt.run(p.id, p.key, p.type, p.name, 'default', p.status, JSON.stringify(p.meta), now, now);
  }
});
insertPlantags();
console.log(`  Inserted ${plantags.length} plantags`);

// ─────────────────────────────────────────────────────────────
// 3. REGRESSION HISTORY — For debt scoring
// Schema: entry_id, devtag, file, line_start, line_end,
//         cause_buildtag_id, cause_agent_id, prior_plantag_status, cycle_id, created_at, build_phase
// ─────────────────────────────────────────────────────────────
console.log('Inserting regression_history...');

const checkRegTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='regression_history'`).get();
if (checkRegTable) {
  const regressions = [
    [randomUUID(), 'devtag:function:resolveContext', 'apps/server/src/services/context.ts', 5, 30, 'buildtag:modify:context-v2', 'builder-agent-01', 'active', cycle, now, 'phase-2'],
    [randomUUID(), 'devtag:function:resolveContext', 'apps/server/src/services/context.ts', 5, 30, 'buildtag:modify:context-v3', 'builder-agent-02', 'active', cycle, now, 'phase-2'],
    [randomUUID(), 'devtag:function:buildTagRegistry', 'apps/server/src/services/tags.ts', 12, 65, 'buildtag:replace:tag-registry', 'builder-agent-01', 'active', cycle, now, 'phase-3'],
    [randomUUID(), 'devtag:handler:onBuildStep', 'apps/server/src/services/buildRunner.ts', 60, 95, 'buildtag:modify:build-runner', 'builder-agent-03', 'active', cycle, now, 'phase-2'],
    [randomUUID(), 'devtag:function:handleChatRequest', 'apps/server/src/routes/chat.ts', 10, 45, 'buildtag:add:chat-handler-v2', 'fleet-agent-04', 'done', cycle, now, 'phase-1'],
  ];

  const insReg = db.transaction(() => {
    const s = db.prepare(`INSERT OR IGNORE INTO regression_history (entry_id, devtag, file, line_start, line_end, cause_buildtag_id, cause_agent_id, prior_plantag_status, cycle_id, created_at, build_phase) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const r of regressions) s.run(...r);
  });
  insReg();
  console.log(`  Inserted ${regressions.length} regression_history records`);
} else {
  console.log('  regression_history table does not exist, skipping');
}

// ─────────────────────────────────────────────────────────────
// 4. COVERAGE MATRIX — Realistic coverage records
// ─────────────────────────────────────────────────────────────
console.log('Inserting coverage_matrix...');
const covStmt = db.prepare(`
  INSERT OR REPLACE INTO coverage_matrix (entry_id, scope, plantag_or_devtag, coverage_state, coverage_percent, missing_tags, cycle_id)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const coverageRecords = [
  // Plan coverage - mixed states
  [randomUUID(), 'plan', 'plantag:goal:gap-analysis-system', 'partial', 66.7, JSON.stringify(['devtag:test:runGapAnalysis']), cycle],
  [randomUUID(), 'plan', 'plantag:step:wire-coverage-agent', 'partial', 50.0, JSON.stringify(['devtag:test:resolveContext']), cycle],
  [randomUUID(), 'plan', 'plantag:goal:nano-training-pipeline', 'partial', 75.0, JSON.stringify(['devtag:nano:fitness:QueryParserNano']), cycle],
  [randomUUID(), 'plan', 'plantag:step:chat-api-handlers', 'covered', 100.0, JSON.stringify([]), cycle],
  [randomUUID(), 'plan', 'plantag:step:agent-fleet-events', 'missing', 40.0, JSON.stringify(['devtag:test:onAgentComplete', 'devtag:test:onBuildStep']), cycle],
  // Test coverage
  [randomUUID(), 'test', 'devtag:function:handleChatRequest', 'covered', 100.0, JSON.stringify([]), cycle],
  [randomUUID(), 'test', 'devtag:function:resolveContext', 'missing', 0.0, JSON.stringify(['devtag:test:resolveContext']), cycle],
  [randomUUID(), 'test', 'devtag:function:buildTagRegistry', 'missing', 0.0, JSON.stringify(['devtag:test:buildTagRegistry']), cycle],
  [randomUUID(), 'test', 'devtag:function:runGapAnalysis', 'missing', 0.0, JSON.stringify(['devtag:test:runGapAnalysis']), cycle],
  [randomUUID(), 'test', 'devtag:function:computeDebtScore', 'covered', 100.0, JSON.stringify([]), cycle],
  [randomUUID(), 'test', 'devtag:handler:onAgentComplete', 'missing', 0.0, JSON.stringify(['devtag:test:onAgentComplete']), cycle],
  [randomUUID(), 'test', 'devtag:handler:onBuildStep', 'missing', 0.0, JSON.stringify(['devtag:test:onBuildStep']), cycle],
  [randomUUID(), 'test', 'devtag:handler:onPatternDetected', 'missing', 0.0, JSON.stringify(['devtag:test:onPatternDetected']), cycle],
  [randomUUID(), 'test', 'devtag:route:POST:/api/gap/run', 'missing', 0.0, JSON.stringify(['devtag:test:POST:/api/gap/run']), cycle],
  [randomUUID(), 'test', 'devtag:route:GET:/api/gap/summary', 'missing', 0.0, JSON.stringify(['devtag:test:GET:/api/gap/summary']), cycle],
  // Nano coverage
  [randomUUID(), 'nano', 'devtag:nano:QueryParserNano', 'partial', 50.0, JSON.stringify(['devtag:nano:fitness:QueryParserNano']), cycle],
  [randomUUID(), 'nano', 'devtag:nano:EmbeddingNano', 'missing', 0.0, JSON.stringify(['devtag:nano:training_target:EmbeddingNano', 'devtag:nano:fitness:EmbeddingNano']), cycle],
  [randomUUID(), 'nano', 'devtag:nano:RankNano', 'missing', 0.0, JSON.stringify(['devtag:nano:training_target:RankNano', 'devtag:nano:fitness:RankNano']), cycle],
];

const insCov = db.transaction(() => {
  for (const r of coverageRecords) covStmt.run(...r);
});
insCov();
console.log(`  Inserted ${coverageRecords.length} coverage_matrix records`);

// ─────────────────────────────────────────────────────────────
// 5. PATTERNS — 5 anti-patterns (realistic)
// ─────────────────────────────────────────────────────────────
console.log('Inserting patterns...');
const patStmt = db.prepare(`
  INSERT OR REPLACE INTO patterns (pattern_id, failure_type, devtag_type, agent_category, build_phase, first_occurrence, recurrence_count, severity, severity_trend, contributing_forensic_ids, flagged_to_god_factory, is_anti_pattern, anti_pattern_type)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const patterns = [
  [randomUUID(), 'context-loss', 'needs_refactor', 'memory-crawler', 'phase-3', now, 4, 'warning', 'escalating', JSON.stringify(['reg-001','reg-002','reg-003','reg-004']), 0, 1, 'context_loss'],
  [randomUUID(), 'ai-slop', 'function', 'builder-agent', 'phase-2', now, 3, 'error', 'stable', JSON.stringify(['rej-001','rej-002','rej-003']), 0, 1, 'ai_slop'],
  [randomUUID(), 'drift', 'handler', 'builder-agent', 'phase-2', now, 5, 'error', 'escalating', JSON.stringify(['dft-001','dft-002','dft-003','dft-004','dft-005']), 1, 1, 'drift'],
  [randomUUID(), 'spaghetti-growth', 'function', 'fleet-agent', 'phase-3', now, 3, 'warning', 'stable', JSON.stringify(['spg-001','spg-002','spg-003']), 0, 1, 'spaghetti_growth'],
  [randomUUID(), 'hallucination-loop', 'function', 'fleet-agent', 'phase-1', now, 3, 'critical', 'escalating', JSON.stringify(['hal-001','hal-002','hal-003']), 1, 1, 'hallucination_loop'],
  // Additional structural patterns
  [randomUUID(), 'missing-test', 'route', 'coverage-agent', 'phase-3', now, 7, 'warning', 'stable', JSON.stringify(['cov-001','cov-002','cov-003']), 0, 0, null],
  [randomUUID(), 'missing-test', 'handler', 'coverage-agent', 'phase-2', now, 4, 'warning', 'escalating', JSON.stringify(['cov-010','cov-011']), 0, 0, null],
];

const insPat = db.transaction(() => {
  for (const r of patterns) patStmt.run(...r);
});
insPat();
console.log(`  Inserted ${patterns.length} patterns`);

// ─────────────────────────────────────────────────────────────
// 6. DEBT HISTORY — Per-file debt scores
// ─────────────────────────────────────────────────────────────
console.log('Inserting debt_history...');
const debtStmt = db.prepare(`
  INSERT OR REPLACE INTO debt_history (entry_id, file_path, debt_score, score_breakdown, ceiling, ceiling_exceeded, cycle_id)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const debtRecords = [
  {
    file: 'apps/server/src/services/context.ts',
    score: 18,
    breakdown: { needs_refactor: 1, needs_test: 4, dead_code: 0, circular_dependency: 0, spaghetti_index: 2, regressions: 2, tests_covering: -2, done_plantags: -1 },
    ceiling: 15, exceeded: 1
  },
  {
    file: 'apps/server/src/services/tags.ts',
    score: 16,
    breakdown: { needs_refactor: 1, needs_test: 4, dead_code: 0, circular_dependency: 0, spaghetti_index: 2, regressions: 1, tests_covering: -2, done_plantags: 0 },
    ceiling: 15, exceeded: 1
  },
  {
    file: 'apps/server/src/services/embeddingRouter.ts',
    score: 12,
    breakdown: { needs_refactor: 0, needs_test: 0, dead_code: 1, circular_dependency: 0, spaghetti_index: 1, regressions: 0, tests_covering: 0, done_plantags: 0 },
    ceiling: 15, exceeded: 0
  },
  {
    file: 'apps/server/src/services/agentFleet.ts',
    score: 8,
    breakdown: { needs_refactor: 0, needs_test: 4, dead_code: 0, circular_dependency: 0, spaghetti_index: 0, regressions: 1, tests_covering: 0, done_plantags: -1 },
    ceiling: 15, exceeded: 0
  },
  {
    file: 'apps/server/src/services/gapAnalysis/index.ts',
    score: 4,
    breakdown: { needs_refactor: 0, needs_test: 2, dead_code: 0, circular_dependency: 0, spaghetti_index: 0, regressions: 0, tests_covering: -1, done_plantags: 0 },
    ceiling: 15, exceeded: 0
  },
  {
    file: 'apps/server/src/routes/chat.ts',
    score: 2,
    breakdown: { needs_refactor: 0, needs_test: 0, dead_code: 0, circular_dependency: 0, spaghetti_index: 0, regressions: 1, tests_covering: -1, done_plantags: -2 },
    ceiling: 15, exceeded: 0
  },
  {
    file: 'NANO_train/nanos/QueryParserNano.py',
    score: 6,
    breakdown: { needs_refactor: 0, needs_test: 4, dead_code: 0, circular_dependency: 0, spaghetti_index: 0, regressions: 0, tests_covering: 0, done_plantags: 0 },
    ceiling: 15, exceeded: 0
  },
];

const insDebt = db.transaction(() => {
  for (const r of debtRecords) {
    debtStmt.run(randomUUID(), r.file, r.score, JSON.stringify(r.breakdown), r.ceiling, r.exceeded, cycle);
  }
});
insDebt();
console.log(`  Inserted ${debtRecords.length} debt_history records`);

// ─────────────────────────────────────────────────────────────
// 7. TAG COLLISIONS
// ─────────────────────────────────────────────────────────────
console.log('Inserting tag_collisions...');
const colStmt = db.prepare(`
  INSERT OR REPLACE INTO tag_collisions (entry_id, devtag_name, file_a, parent_a, file_b, parent_b, detected_cycle, resolved)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const collisions = [
  [randomUUID(), 'handleRequest', 'apps/server/src/routes/chat.ts', 'chat-router', 'apps/server/src/routes/files.ts', 'files-router', cycle, 0],
  [randomUUID(), 'getContext', 'apps/server/src/services/context.ts', 'context-service', 'apps/server/src/services/agentFleet.ts', 'fleet-manager', cycle, 0],
  [randomUUID(), 'parseQuery', 'apps/server/src/services/queryParser.ts', 'query-service', 'NANO_train/nanos/QueryParserNano.py', 'nano-fleet', cycle, 0],
];

const insCol = db.transaction(() => {
  for (const r of collisions) colStmt.run(...r);
});
insCol();
console.log(`  Inserted ${collisions.length} tag_collisions`);

// ─────────────────────────────────────────────────────────────
// 8. AGENT PERFORMANCE
// ─────────────────────────────────────────────────────────────
console.log('Inserting agent_performance...');
const apStmt = db.prepare(`
  INSERT OR REPLACE INTO agent_performance (entry_id, agent_id, cycle_id, conformance_rate, retry_rate, escalation_rate, cycle_contribution, regression_contribution, spawn_efficiency, context_efficiency)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const agents = [
  { id: 'gap-analysis-agent', conf: 0.94, retry: 0.06, esc: 0.02, contrib: 8, regress: 0, spawn: 1.2, ctx: 0.62 },
  { id: 'coverage-analysis-agent', conf: 0.88, retry: 0.12, esc: 0.04, contrib: 5, regress: 0, spawn: 0.8, ctx: 0.45 },
  { id: 'pattern-recognition-agent', conf: 0.91, retry: 0.09, esc: 0.03, contrib: 6, regress: 0, spawn: 1.0, ctx: 0.55 },
  { id: 'debt-tracking-agent', conf: 0.97, retry: 0.03, esc: 0.01, contrib: 7, regress: 0, spawn: 0.5, ctx: 0.38 },
  { id: 'tag-system-analysis-agent', conf: 0.85, retry: 0.15, esc: 0.08, contrib: 4, regress: 1, spawn: 1.5, ctx: 0.72 },
  { id: 'agent-performance-agent', conf: 0.92, retry: 0.08, esc: 0.02, contrib: 3, regress: 0, spawn: 0.6, ctx: 0.41 },
  { id: 'builder-agent-01', conf: 0.61, retry: 0.39, esc: 0.22, contrib: 12, regress: 3, spawn: 2.4, ctx: 0.89 },
  { id: 'builder-agent-02', conf: 0.74, retry: 0.26, esc: 0.14, contrib: 9, regress: 1, spawn: 1.8, ctx: 0.76 },
  { id: 'fleet-agent-04', conf: 0.68, retry: 0.32, esc: 0.18, contrib: 7, regress: 2, spawn: 2.1, ctx: 0.91 },
  { id: 'memory-crawler', conf: 0.95, retry: 0.05, esc: 0.01, contrib: 2, regress: 0, spawn: 0.4, ctx: 0.33 },
];

const insAp = db.transaction(() => {
  for (const a of agents) {
    apStmt.run(randomUUID(), a.id, cycle, a.conf, a.retry, a.esc, a.contrib, a.regress, a.spawn, a.ctx);
  }
});
insAp();
console.log(`  Inserted ${agents.length} agent_performance records`);

// ─────────────────────────────────────────────────────────────
// 9. TAG RESOLUTION LOG
// ─────────────────────────────────────────────────────────────
console.log('Inserting tag_resolution_log...');
const trlStmt = db.prepare(`
  INSERT OR REPLACE INTO tag_resolution_log (entry_id, tag_type, tag_id, agent_id, model_tier, resolution_time_ms, cache_hit, cycle_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const resLogs = [
  ['function', 'devtag:function:resolveContext', 'coverage-analysis-agent', 'nano', 45, 0],
  ['function', 'devtag:function:buildTagRegistry', 'gap-analysis-agent', 'nano', 38, 1],
  ['handler', 'devtag:handler:onAgentComplete', 'pattern-recognition-agent', 'small', 210, 0],
  ['handler', 'devtag:handler:onBuildStep', 'coverage-analysis-agent', 'nano', 67, 0],
  ['route', 'devtag:route:POST:/api/gap/run', 'gap-analysis-agent', 'nano', 22, 1],
  ['nano', 'devtag:nano:QueryParserNano', 'tag-system-analysis-agent', 'small', 155, 0],
  ['nano', 'devtag:nano:EmbeddingNano', 'tag-system-analysis-agent', 'small', 189, 0],
  ['nano', 'devtag:nano:RankNano', 'tag-system-analysis-agent', 'small', 230, 0],
  ['gap_scan', 'gap_scan', 'gap-analysis-agent', 'nano', 312, 0],
  ['coverage_check', 'coverage_check', 'coverage-analysis-agent', 'nano', 88, 0],
  ['debt_score', 'debt_score', 'debt-tracking-agent', 'nano', 44, 1],
  ['pattern_query', 'pattern_query', 'pattern-recognition-agent', 'nano', 76, 0],
  ['needs_refactor', 'devtag:needs_refactor:context-resolver-v1', 'memory-crawler', 'nano', 29, 1],
  ['needs_refactor', 'devtag:needs_refactor:legacy-tag-parser', 'memory-crawler', 'nano', 31, 1],
  ['dead_code', 'devtag:dead_code:old-embedding-router', 'tag-system-analysis-agent', 'small', 145, 0],
];

const insTrl = db.transaction(() => {
  for (const r of resLogs) {
    trlStmt.run(randomUUID(), r[0], r[1], r[2], r[3], r[4], r[5], cycle);
  }
});
insTrl();
console.log(`  Inserted ${resLogs.length} tag_resolution_log records`);

// ─────────────────────────────────────────────────────────────
// 10. VOCABULARY GAPS
// ─────────────────────────────────────────────────────────────
console.log('Inserting vocabulary_gaps...');
const vgStmt = db.prepare(`
  INSERT OR REPLACE INTO vocabulary_gaps (entry_id, file_path, untagged_structure_type, occurrence_count, first_detected_cycle, resolved, proposed_tag_type)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const vocabGaps = [
  [randomUUID(), 'apps/server/src/services/agentFleet.ts', 'event-emitter-binding', 5, cycle, 0, 'devtag:event_binding'],
  [randomUUID(), 'apps/server/src/services/buildRunner.ts', 'pipeline-stage', 3, cycle, 0, 'devtag:pipeline_stage'],
  [randomUUID(), 'NANO_train/training/QueryParserNano_targets.json', 'training-target-spec', 12, cycle, 0, 'devtag:nano:training_target'],
  [randomUUID(), 'apps/web/src/components/GapAnalysisPanel.tsx', 'react-hook-dependency', 8, cycle, 0, 'devtag:react_hook'],
  [randomUUID(), 'apps/server/src/plugins/safeRoute.ts', 'error-boundary-wrapper', 4, cycle, 0, 'devtag:error_boundary'],
];

const insVg = db.transaction(() => {
  for (const r of vocabGaps) vgStmt.run(...r);
});
insVg();
console.log(`  Inserted ${vocabGaps.length} vocabulary_gaps`);

// ─────────────────────────────────────────────────────────────
// 11. GAP REPORTS — Synthesized final reports
// ─────────────────────────────────────────────────────────────
console.log('Inserting gap_reports...');
const grStmt = db.prepare(`
  INSERT OR REPLACE INTO gap_reports (report_id, cycle_range_start, cycle_range_end, session_id, gap_category, affected_tags, affected_agents, affected_files, severity, pattern_id, recommended_action_tags, forensic_entry_ids, flagged_to_god_factory)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const sessionId = 'seed-session-001';
const gapReports = [
  {
    category: 'coverage',
    tags: ['devtag:test:resolveContext','devtag:test:buildTagRegistry','devtag:test:runGapAnalysis'],
    agents: ['coverage-analysis-agent'],
    files: ['apps/server/src/services/context.ts','apps/server/src/services/tags.ts'],
    severity: 'warning',
    pattern_id: null,
    actions: ['plantag:step:add-missing-tests'],
    forensic_ids: ['cov-001','cov-002','cov-003'],
    flagged: 0
  },
  {
    category: 'structural',
    tags: ['devtag:needs_refactor:context-resolver-v1','devtag:needs_refactor:legacy-tag-parser'],
    agents: ['debt-tracking-agent'],
    files: ['apps/server/src/services/context.ts','apps/server/src/services/tags.ts'],
    severity: 'error',
    pattern_id: null,
    actions: ['plantag:step:refactor-context-service','plantag:step:refactor-tag-parser'],
    forensic_ids: ['dbt-001','dbt-002'],
    flagged: 0
  },
  {
    category: 'process',
    tags: ['devtag:handler:onBuildStep','devtag:handler:onPatternDetected'],
    agents: ['pattern-recognition-agent'],
    files: ['apps/server/src/services/buildRunner.ts','apps/server/src/services/gapAnalysis/patternRecognition.ts'],
    severity: 'error',
    pattern_id: null,
    actions: ['plantag:step:fix-drift-pattern','plantag:step:add-handler-tests'],
    forensic_ids: ['pat-001','pat-002'],
    flagged: 1
  },
  {
    category: 'tag_system',
    tags: ['devtag:event_binding','devtag:pipeline_stage','devtag:react_hook'],
    agents: ['tag-system-analysis-agent'],
    files: ['apps/server/src/services/agentFleet.ts','apps/server/src/services/buildRunner.ts'],
    severity: 'warning',
    pattern_id: null,
    actions: ['plantag:step:extend-tag-schema'],
    forensic_ids: ['vg-001','vg-002','vg-004'],
    flagged: 0
  },
  {
    category: 'agent_performance',
    tags: [],
    agents: ['builder-agent-01','fleet-agent-04'],
    files: [],
    severity: 'critical',
    pattern_id: null,
    actions: ['plantag:step:review-builder-agent-01','plantag:step:downgrade-fleet-agent-04-model-tier'],
    forensic_ids: ['ap-001','ap-009'],
    flagged: 1
  },
];

const insGr = db.transaction(() => {
  for (const r of gapReports) {
    grStmt.run(
      randomUUID(), 1, 10, sessionId,
      r.category,
      JSON.stringify(r.tags),
      JSON.stringify(r.agents),
      JSON.stringify(r.files),
      r.severity,
      r.pattern_id,
      JSON.stringify(r.actions),
      JSON.stringify(r.forensic_ids),
      r.flagged
    );
  }
});
insGr();
console.log(`  Inserted ${gapReports.length} gap_reports`);

// ─────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────
const counts = {
  devtags: db.prepare('SELECT COUNT(*) as n FROM devtags').get().n,
  plantags: db.prepare('SELECT COUNT(*) as n FROM plantags').get().n,
  coverage_matrix: db.prepare('SELECT COUNT(*) as n FROM coverage_matrix').get().n,
  patterns: db.prepare('SELECT COUNT(*) as n FROM patterns').get().n,
  debt_history: db.prepare('SELECT COUNT(*) as n FROM debt_history').get().n,
  tag_collisions: db.prepare('SELECT COUNT(*) as n FROM tag_collisions').get().n,
  agent_performance: db.prepare('SELECT COUNT(*) as n FROM agent_performance').get().n,
  tag_resolution_log: db.prepare('SELECT COUNT(*) as n FROM tag_resolution_log').get().n,
  vocabulary_gaps: db.prepare('SELECT COUNT(*) as n FROM vocabulary_gaps').get().n,
  gap_reports: db.prepare('SELECT COUNT(*) as n FROM gap_reports').get().n,
};

console.log('\n=== SEED COMPLETE ===');
console.log(JSON.stringify(counts, null, 2));
db.close();
