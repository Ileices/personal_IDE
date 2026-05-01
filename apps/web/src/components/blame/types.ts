export interface BlameRecord {
  id: string;
  blameId?: string;
  model: string;
  modelId?: string;
  modelProvider?: string;
  modelName?: string;
  modelVersion?: string;
  mode: string;
  interactionType?: string;
  buildPhase?: string;
  cycleId?: string;
  sessionId?: string;
  projectId?: string;
  timestamp: string;
  quality?: number;
  compositeQualityScore?: number;
  tokenCount?: number;
  promptTokens?: number;
  completionTokens?: number;
  contextWindowTokens?: number;
  outputTokensAllowed?: number;
  contextUtilizationPercent?: number;
  outputUtilizationPercent?: number;
  taskType?: string;
  tagValidationResult?: 'pass' | 'fail' | 'partial';
  tagValidationFailureCodes?: string[];
  retryCount?: number;
  escalationLevel?: number;
  outputHash?: string;
  driftDetected?: boolean;
  forensicEntryIds?: string[];
  success?: boolean;
  errorType?: string;
  filePath?: string;
  latencyMs?: number;
  durationMs?: number;

  // Quality dimension details
  tagConformance?: number;
  contextUtilizationScore?: number;
  instructionAdherence?: number;
  hallucination?: number;
  structuralIntegrity?: number;
  regressionRisk?: number;
  outputEfficiency?: number;
  failureModes?: string[];
}

export interface ModelStats {
  model: string;
  modelId?: string;
  modelName?: string;
  modelVersion?: string;
  provider?: string;
  totalRuns: number;
  successRate: number;
  avgQuality: number;
  avgLatencyMs: number;
  totalTokens: number;
  lastUsed: string;
  trend: 'up' | 'down' | 'flat';
  modelTier?: number;
  contextWindowTokens?: number;
  safePromptCeilingTokens?: number;
  safeOutputCeilingTokens?: number;
  strengths?: string[];
  weaknesses?: string[];
  recommendedInteractionTypes?: string[];
  avoidedInteractionTypes?: string[];
  toolConfigsGenerated?: string[];
  tagConformance?: number;
  hallucination?: number;
  instructionAdherence?: number;
  structuralIntegrity?: number;
  outputEfficiency?: number;
  strategyConfig?: {
    recommended?: boolean;
    action?: string;
    reason?: string;
    cleanupEligible?: boolean;
    blockScope?: 'temporary' | 'persistent';
    failureSummary?: { providerFailures: number; authFailures: number; rateLimitFailures: number };
    source?: string;
    observedAt?: string;
  };
}

export interface ToolCriticism {
  criticismId: string;
  modelId: string;
  interactionType: string;
  failingQualityDimensions: string[];
  activeToolConfigs: string[];
  activePromptStructures: string[];
  failurePattern: string;
  proposedToolModifications: Array<Record<string, unknown>>;
  proposedNewTools: Array<Record<string, unknown>>;
  scalesToModelTiers: number[];
  suggestedJobId?: string;
  cycleId?: string;
  timestamp: string;
  severity?: string;
  criticism?: string;
}

export interface BlameSuccess {
  successId: string;
  modelId: string;
  interactionType: string;
  compositeQualityScoreAvg: number;
  promptStructureIds: string[];
  toolConfigIds: string[];
  contextSizeTokens: number;
  tagTypesInvolved: string[];
  modelTier: number;
  consecutiveCount: number;
  suggestedJobId?: string;
  cycleId?: string;
  timestamp: string;
}

export interface SuggestedJob {
  id: string;
  category: string;
  source: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  payload: Record<string, unknown>;
  status: 'pending' | 'applied' | 'dismissed';
  createdAt: string;
  updatedAt: string;
}

export interface QualityRecord {
  qualityId: string;
  blameId: string;
  modelId: string;
  modelName?: string;
  interactionType?: string;
  tagConformanceScore: number;
  contextUtilizationScore: number;
  instructionAdherenceScore: number;
  hallucinationRate: number;
  structuralIntegrityScore: number;
  regressionRiskScore: number;
  outputEfficiencyScore: number;
  compositeQualityScore: number;
  failureModes: string[];
  cycleId?: string;
  timestamp: string;
}

export type TabId = 'models' | 'records' | 'quality' | 'criticisms' | 'successes' | 'jobs' | 'analysis';
