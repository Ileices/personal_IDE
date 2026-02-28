// ============================================
// Module Clustering
// Ported from auto_rebuilder.py: calculate_module_clusters
// Groups files into clusters by import similarity,
// naming conventions, and content keywords
// ============================================

export interface ModuleInfo {
  path: string;
  imports: string[];        // list of imported module paths
  exports: string[];        // list of exported symbol names
  category?: string;        // from moduleClassifier
  size: number;             // bytes
  tokens: number;           // estimated tokens
}

export interface Cluster {
  id: number;
  name: string;             // auto-generated descriptive name
  members: string[];        // file paths
  cohesion: number;         // 0-1, how similar members are
  domain: string;           // inferred domain
}

export interface ClusterResult {
  clusters: Cluster[];
  outliers: string[];       // files that don't fit any cluster
  totalFiles: number;
}

// Domain keyword buckets for filename-based clustering
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  core: ['core', 'engine', 'kernel', 'base', 'foundation'],
  ui: ['component', 'view', 'panel', 'page', 'layout', 'widget', 'modal', 'dialog'],
  io: ['file', 'stream', 'buffer', 'reader', 'writer', 'pipe', 'io'],
  net: ['http', 'api', 'route', 'endpoint', 'socket', 'client', 'server', 'fetch'],
  data: ['model', 'schema', 'entity', 'store', 'state', 'db', 'database', 'cache'],
  test: ['test', 'spec', 'mock', 'fixture', 'stub', 'e2e', 'integration'],
  config: ['config', 'env', 'setting', 'option', 'constant', 'default'],
  util: ['util', 'helper', 'common', 'shared', 'misc', 'tool', 'lib'],
};

/**
 * Cluster modules by import overlap, naming, and category.
 * Uses a simplified DBSCAN-like approach without numpy dependencies.
 */
export function clusterModules(modules: ModuleInfo[], maxClusterSize = 15): ClusterResult {
  const n = modules.length;
  if (n === 0) return { clusters: [], outliers: [], totalFiles: 0 };
  if (n <= 3) {
    return {
      clusters: [{ id: 0, name: inferDomain(modules.map(m => m.path)), members: modules.map(m => m.path), cohesion: 1, domain: 'mixed' }],
      outliers: [],
      totalFiles: n,
    };
  }

  // Step 1: Compute pairwise import similarity (Jaccard)
  const similarity: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = jaccardSimilarity(modules[i].imports, modules[j].imports);
      // Boost similarity if same domain keyword bucket
      const domainBoost = sameDomainBucket(modules[i].path, modules[j].path) ? 0.2 : 0;
      // Boost if same category
      const categoryBoost = (modules[i].category && modules[i].category === modules[j].category) ? 0.15 : 0;
      const combined = Math.min(1, sim * 0.6 + domainBoost + categoryBoost);
      similarity[i][j] = combined;
      similarity[j][i] = combined;
    }
  }

  // Step 2: Simple density-based clustering (DBSCAN-like)
  const THRESHOLD = 0.25; // minimum similarity to be in same cluster
  const MIN_NEIGHBORS = 1;
  const labels = new Array(n).fill(-1); // -1 = unassigned
  let clusterId = 0;

  for (let i = 0; i < n; i++) {
    if (labels[i] !== -1) continue;

    // Find neighbors
    const neighbors = [];
    for (let j = 0; j < n; j++) {
      if (i !== j && similarity[i][j] >= THRESHOLD) neighbors.push(j);
    }

    if (neighbors.length < MIN_NEIGHBORS) continue; // will be outlier

    // Start new cluster
    labels[i] = clusterId;
    const queue = [...neighbors];
    const visited = new Set([i]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      // Count cluster size
      const currentSize = [...labels.entries()].filter(([_, l]) => l === clusterId).length;
      if (currentSize >= maxClusterSize) break;

      labels[current] = clusterId;

      // Expand neighbors
      for (let k = 0; k < n; k++) {
        if (!visited.has(k) && similarity[current][k] >= THRESHOLD) {
          queue.push(k);
        }
      }
    }
    clusterId++;
  }

  // Step 3: Build cluster objects
  const clusterMap = new Map<number, string[]>();
  const outliers: string[] = [];

  for (let i = 0; i < n; i++) {
    if (labels[i] === -1) {
      outliers.push(modules[i].path);
    } else {
      const members = clusterMap.get(labels[i]) || [];
      members.push(modules[i].path);
      clusterMap.set(labels[i], members);
    }
  }

  const clusters: Cluster[] = [];
  for (const [id, members] of clusterMap) {
    // Compute cohesion (average pairwise similarity within cluster)
    let totalSim = 0;
    let pairs = 0;
    const indices = members.map(m => modules.findIndex(mod => mod.path === m));
    for (let a = 0; a < indices.length; a++) {
      for (let b = a + 1; b < indices.length; b++) {
        totalSim += similarity[indices[a]][indices[b]];
        pairs++;
      }
    }
    const cohesion = pairs > 0 ? totalSim / pairs : 0;

    clusters.push({
      id,
      name: inferDomain(members),
      members,
      cohesion: Math.round(cohesion * 100) / 100,
      domain: inferDomain(members),
    });
  }

  return {
    clusters: clusters.sort((a, b) => b.members.length - a.members.length),
    outliers,
    totalFiles: n,
  };
}

// ── Helpers ──

function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function sameDomainBucket(pathA: string, pathB: string): boolean {
  const a = pathA.toLowerCase();
  const b = pathB.toLowerCase();
  for (const keywords of Object.values(DOMAIN_KEYWORDS)) {
    const aMatch = keywords.some(kw => a.includes(kw));
    const bMatch = keywords.some(kw => b.includes(kw));
    if (aMatch && bMatch) return true;
  }
  return false;
}

function inferDomain(paths: string[]): string {
  const scores: Record<string, number> = {};
  for (const path of paths) {
    const lower = path.toLowerCase();
    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      for (const kw of keywords) {
        if (lower.includes(kw)) {
          scores[domain] = (scores[domain] || 0) + 1;
        }
      }
    }
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : 'misc';
}
