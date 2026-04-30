export interface BlameRecord {
  id: string;
  model: string;
  mode: string;
  projectId?: string;
  timestamp: string;
  quality?: number;
  tokenCount?: number;
  taskType?: string;
  success?: boolean;
  errorType?: string;
  filePath?: string;
  latencyMs?: number;
}

export interface ModelStats {
  model: string;
  totalRuns: number;
  successRate: number;
  avgQuality: number;
  avgLatencyMs: number;
  totalTokens: number;
  lastUsed: string;
  trend: 'up' | 'down' | 'flat';
  tagConformance?: number;
  hallucination?: number;
  instructionAdherence?: number;
  structuralIntegrity?: number;
  outputEfficiency?: number;
}

export type TabId = 'models' | 'records' | 'analysis';
