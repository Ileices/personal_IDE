// ============================================
// Module Classifier — categorizes source files
// into package domains using multi-signal scoring.
// Ported from auto_rebuilder.py classify_module()
// ============================================

/** Broad category for a source file */
export type ModuleCategory =
  | 'core' | 'ui' | 'io' | 'net' | 'train'
  | 'tools' | 'test' | 'config' | 'unknown';

const CATEGORY_KEYWORDS: Record<ModuleCategory, string[]> = {
  core: ['config', 'loader', 'utils', 'pipeline', 'model', 'engine', 'storage',
    'base', 'common', 'foundation', 'system', 'kernel', 'runtime', 'framework'],
  ui: ['gui', 'dash', 'visual', 'display', 'plot', 'view', 'window', 'panel',
    'form', 'widget', 'screen', 'render', 'layout', 'page', 'template', 'component'],
  io: ['input', 'output', 'load', 'save', 'export', 'file', 'persist', 'stream',
    'reader', 'writer', 'parser', 'formatter', 'serializer', 'database', 'db',
    'cache', 'buffer', 'json', 'xml', 'csv', 'sql'],
  net: ['http', 'server', 'api', 'network', 'sync', 'bridge', 'client', 'socket',
    'request', 'response', 'protocol', 'endpoint', 'route', 'rest', 'graphql',
    'grpc', 'websocket', 'tcp', 'oauth', 'auth', 'service'],
  train: ['train', 'learn', 'dataset', 'neural', 'epoch', 'batch', 'ml', 'ai',
    'tensor', 'vector', 'gradient', 'optimizer', 'loss', 'predict', 'inference',
    'classify', 'cluster', 'feature', 'weights', 'embedding'],
  tools: ['tool', 'util', 'helper', 'scanner', 'watch', 'monitor', 'check', 'cli',
    'script', 'task', 'job', 'worker', 'daemon', 'cron', 'schedule', 'test',
    'benchmark', 'profile', 'debug', 'log', 'logger', 'report', 'analyze', 'migrate'],
  test: ['test', 'spec', 'fixture', 'mock', 'stub', 'e2e', 'integration', 'unit'],
  config: ['config', 'env', 'setting', 'option', 'constant', 'default', 'setup'],
  unknown: [],
};

/** Import indicators — when code imports certain modules it hints at the category */
const IMPORT_INDICATORS: Record<string, ModuleCategory> = {
  // Python ML
  torch: 'train', tensorflow: 'train', keras: 'train', sklearn: 'train',
  numpy: 'train', pandas: 'io', scipy: 'train', transformers: 'train',
  // Python Web
  flask: 'net', django: 'net', fastapi: 'net', aiohttp: 'net',
  // Python UI
  tkinter: 'ui', pygame: 'ui', pyglet: 'ui', kivy: 'ui',
  // Node / TS
  react: 'ui', vue: 'ui', svelte: 'ui', express: 'net', fastify: 'net',
  prisma: 'io', typeorm: 'io', sequelize: 'io', mongoose: 'io',
  jest: 'test', vitest: 'test', mocha: 'test', pytest: 'test',
};

/**
 * Classify a source file into a package category.
 * Uses filename keywords, import analysis, and content heuristics.
 */
export function classifyModule(
  relativePath: string,
  imports: string[] = [],
  content?: string,
): ModuleCategory {
  const scores: Record<ModuleCategory, number> = {
    core: 0, ui: 0, io: 0, net: 0, train: 0,
    tools: 0, test: 0, config: 0, unknown: 0,
  };

  // 1. Filename keyword scoring
  const nameParts = relativePath.toLowerCase().replace(/[\\/.]/g, ' ').split(/\s+/);
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      for (const part of nameParts) {
        if (part.includes(kw)) scores[cat as ModuleCategory] += 2;
      }
    }
  }

  // 2. Import-based scoring
  for (const imp of imports) {
    const impLower = imp.toLowerCase();
    for (const [mod, cat] of Object.entries(IMPORT_INDICATORS)) {
      if (impLower.includes(mod)) scores[cat] += 3;
    }
  }

  // 3. Content keyword boost (light scan)
  if (content) {
    const snippet = content.slice(0, 2000).toLowerCase();
    for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      for (const kw of keywords) {
        if (snippet.includes(kw)) scores[cat as ModuleCategory] += 1;
      }
    }
  }

  // Pick highest
  let best: ModuleCategory = 'unknown';
  let bestScore = 0;
  for (const [cat, score] of Object.entries(scores)) {
    if (score > bestScore) { bestScore = score; best = cat as ModuleCategory; }
  }
  return bestScore > 0 ? best : 'unknown';
}
