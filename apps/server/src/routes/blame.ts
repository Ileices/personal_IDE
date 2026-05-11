// ============================================
// BLAME Crawler Routes
// Full forensic attribution + quality analysis
// ============================================
import { createHash, randomUUID } from 'crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const QUALITY_WEIGHTS = {
  tagConformance: 0.30,
  hallucinationInverted: 0.20,
  instructionAdherence: 0.15,
  structuralIntegrity: 0.15,
  outputEfficiency: 0.10,
  contextUtilization: 0.05,
  regressionRiskInverted: 0.05,
};

type JsonValue = Record<string, unknown> | string[] | number[] | boolean[];

export interface BlameWriteInput {
  model: string;
  mode: string;
  projectId?: string;
  conversationId?: string;
  agentRunId?: string;
  taskType?: string;
  quality?: number;
  success: boolean;
  errorType?: string;
  filePath?: string;
  latencyMs?: number;
  tokenCount?: number;
  promptTokens?: number;
  completionTokens?: number;

  // Full schema fields
  modelVersion?: string;
  contextWindowTokens?: number;
  outputTokensAllowed?: number;
  agentId?: string;
  agentRole?: string;
  interactionType?: string;
  buildPhase?: string;
  cycleId?: string;
  sessionId?: string;
  decidedStepId?: string | null;
  plantagReferences?: string[];
  devtagReferences?: string[];
  buildtagReferences?: string[];
  tagValidationResult?: 'pass' | 'fail' | 'partial';
  tagValidationFailureCodes?: string[];
  retryCount?: number;
  escalationLevel?: number;
  driftDetected?: boolean;
  forensicEntryIds?: string[];
  durationMs?: number;
  outputText?: string;
  outputHash?: string;
  qualitySignals?: {
    tagConformanceScore?: number;
    contextUtilizationScore?: number;
    instructionAdherenceScore?: number;
    hallucinationRate?: number;
    structuralIntegrityScore?: number;
    regressionRiskScore?: number;
    outputEfficiencyScore?: number;
    failureModes?: string[];
  };
  activeToolConfigs?: string[];
  activePromptStructures?: string[];
}

interface ModelAggregate {
  modelId: string;
  provider: string;
  modelName: string;
  modelVersion: string;
  totalRuns: number;
  successRate: number;
  avgQuality: number;
  avgLatencyMs: number;
  totalTokens: number;
  trend: 'up' | 'down' | 'flat';
  observedConformanceRate: number;
  observedRetryRate: number;
  observedHallucinationRate: number;
  observedSpaghettiRate: number;
  observedAiSlopRate: number;
  observedAvgOutputTokens: number;
  observedAvgDurationMs: number;
  contextWindowTokens: number;
  safePromptCeilingTokens: number;
  safeOutputCeilingTokens: number;
  modelTier: number;
  recommendedInteractionTypes: string[];
  avoidedInteractionTypes: string[];
}

const safeJsonString = (value: JsonValue | null | undefined): string => {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '{}';
  }
};

const safeJsonArrayString = (value: unknown): string => {
  try {
    if (!value) return '[]';
    if (Array.isArray(value)) return JSON.stringify(value);
    return '[]';
  } catch {
    return '[]';
  }
};

const parseJsonArray = <T = string>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
};

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const clamp100 = (n: number): number => Math.max(0, Math.min(100, n));

function parseProvider(modelId: string): 'cloud' | 'local' {
  const provider = String(modelId || '').split('/')[0]?.toLowerCase() || 'unknown';
  return provider === 'nano' || provider === 'ollama' || provider === 'local' ? 'local' : 'cloud';
}

function parseModelName(modelId: string): string {
  const parts = String(modelId || '').split('/');
  return parts[parts.length - 1] || modelId || 'unknown';
}

function inferTier(contextWindowTokens: number): number {
  if (contextWindowTokens <= 2048) return 1;
  if (contextWindowTokens <= 8192) return 2;
  if (contextWindowTokens <= 32000) return 3;
  if (contextWindowTokens <= 128000) return 4;
  return 5;
}

function computeCompositeQuality(signals: {
  tagConformanceScore: number;
  contextUtilizationScore: number;
  instructionAdherenceScore: number;
  hallucinationRate: number;
  structuralIntegrityScore: number;
  regressionRiskScore: number;
  outputEfficiencyScore: number;
}): number {
  const score =
    QUALITY_WEIGHTS.tagConformance * signals.tagConformanceScore +
    QUALITY_WEIGHTS.hallucinationInverted * (1 - signals.hallucinationRate) +
    QUALITY_WEIGHTS.instructionAdherence * signals.instructionAdherenceScore +
    QUALITY_WEIGHTS.structuralIntegrity * signals.structuralIntegrityScore +
    QUALITY_WEIGHTS.outputEfficiency * signals.outputEfficiencyScore +
    QUALITY_WEIGHTS.contextUtilization * signals.contextUtilizationScore +
    QUALITY_WEIGHTS.regressionRiskInverted * (1 - signals.regressionRiskScore);
  const raw = clamp01(score);
  // Hard floor: a detected regression overrides all other quality signals.
  // Even perfect tag conformance cannot mask a correctness failure.
  // Threshold 0.8 = high-confidence regression detection.
  if (signals.regressionRiskScore > 0.8) return Math.min(raw, 0.50);
  return raw;
}

function writeOutputCaptureEvent(db: any, blameId: string, eventType: string, payload: Record<string, unknown>) {
  try {
    db.prepare(`
      INSERT INTO output_capture_events (id, blame_id, event_type, payload)
      VALUES (?, ?, ?, ?)
    `).run(randomUUID(), blameId, eventType, safeJsonString(payload));
  } catch {
    // non-blocking
  }
}

function upsertModelRegistryAggregate(db: any, agg: ModelAggregate) {
  db.prepare(`
    INSERT INTO model_registry (
      id, model_id, display_name, provider, model_name, model_version,
      context_window_tokens, safe_prompt_ceiling_tokens, safe_output_ceiling_tokens, model_tier,
      total_runs, success_rate, avg_quality, avg_latency_ms, total_tokens, trend,
      observed_conformance_rate, observed_retry_rate, observed_hallucination_rate,
      observed_spaghetti_rate, observed_ai_slop_rate, observed_avg_output_tokens,
      observed_avg_duration_ms, recommended_interaction_types, avoided_interaction_types,
      last_updated_cycle, last_updated_by, last_run_at, last_crawled_at, updated_at
    )
    VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, datetime('now'), datetime('now'), datetime('now')
    )
    ON CONFLICT(model_id) DO UPDATE SET
      display_name = excluded.display_name,
      provider = excluded.provider,
      model_name = excluded.model_name,
      model_version = excluded.model_version,
      context_window_tokens = excluded.context_window_tokens,
      safe_prompt_ceiling_tokens = excluded.safe_prompt_ceiling_tokens,
      safe_output_ceiling_tokens = excluded.safe_output_ceiling_tokens,
      model_tier = excluded.model_tier,
      total_runs = excluded.total_runs,
      success_rate = excluded.success_rate,
      avg_quality = excluded.avg_quality,
      avg_latency_ms = excluded.avg_latency_ms,
      total_tokens = excluded.total_tokens,
      trend = excluded.trend,
      observed_conformance_rate = excluded.observed_conformance_rate,
      observed_retry_rate = excluded.observed_retry_rate,
      observed_hallucination_rate = excluded.observed_hallucination_rate,
      observed_spaghetti_rate = excluded.observed_spaghetti_rate,
      observed_ai_slop_rate = excluded.observed_ai_slop_rate,
      observed_avg_output_tokens = excluded.observed_avg_output_tokens,
      observed_avg_duration_ms = excluded.observed_avg_duration_ms,
      recommended_interaction_types = excluded.recommended_interaction_types,
      avoided_interaction_types = excluded.avoided_interaction_types,
      last_updated_cycle = excluded.last_updated_cycle,
      last_updated_by = excluded.last_updated_by,
      last_run_at = excluded.last_run_at,
      last_crawled_at = datetime('now'),
      updated_at = datetime('now')
  `).run(
    randomUUID(),
    agg.modelId,
    agg.modelName,
    agg.provider,
    agg.modelName,
    agg.modelVersion,
    agg.contextWindowTokens,
    agg.safePromptCeilingTokens,
    agg.safeOutputCeilingTokens,
    agg.modelTier,
    agg.totalRuns,
    agg.successRate,
    agg.avgQuality,
    agg.avgLatencyMs,
    agg.totalTokens,
    agg.trend,
    agg.observedConformanceRate,
    agg.observedRetryRate,
    agg.observedHallucinationRate,
    agg.observedSpaghettiRate,
    agg.observedAiSlopRate,
    agg.observedAvgOutputTokens,
    agg.observedAvgDurationMs,
    safeJsonArrayString(agg.recommendedInteractionTypes),
    safeJsonArrayString(agg.avoidedInteractionTypes),
    Number(agg.totalRuns),
    'blame_crawler',
  );
}

function getFailureModesFromSignals(input: BlameWriteInput): string[] {
  const modes = new Set<string>(input.qualitySignals?.failureModes || []);
  if ((input.tagValidationResult || '').toLowerCase() === 'fail') modes.add('tag_validation_fail');
  if ((input.errorType || '').length > 0) modes.add(String(input.errorType));
  if ((input.qualitySignals?.hallucinationRate ?? 0) > 0.2) modes.add('hallucination');
  if ((input.qualitySignals?.structuralIntegrityScore ?? 1) < 0.5) modes.add('structural_integrity_fail');
  if ((input.qualitySignals?.outputEfficiencyScore ?? 1) < 0.3) modes.add('output_inefficiency');
  return [...modes];
}

function computeAndWriteQualityRecord(db: any, blameId: string, input: BlameWriteInput, derived: {
  modelId: string;
  contextUtilizationPercent: number;
  outputUtilizationPercent: number;
  cycleId: string;
  interactionType: string;
}) {
  const tagConformanceScore = clamp01((input.qualitySignals?.tagConformanceScore ?? ((input.tagValidationResult === 'pass' || input.success) ? 1 : 0)));
  const contextUtilizationScore = clamp01(input.qualitySignals?.contextUtilizationScore ?? (
    derived.contextUtilizationPercent < 30 ? 0.4 : derived.contextUtilizationPercent > 90 ? 0.5 : 0.9
  ));
  const instructionAdherenceScore = clamp01(input.qualitySignals?.instructionAdherenceScore ?? (input.success ? 0.9 : 0.4));
  const hallucinationRate = clamp01(input.qualitySignals?.hallucinationRate ?? (input.success ? 0.02 : 0.18));
  const structuralIntegrityScore = clamp01(input.qualitySignals?.structuralIntegrityScore ?? (input.success ? 0.9 : 0.45));
  const regressionRiskScore = clamp01(input.qualitySignals?.regressionRiskScore ?? 0.1);

  const plants = input.plantagReferences?.length ?? 0;
  const outTokens = input.completionTokens ?? input.tokenCount ?? 0;
  const outputEfficiencyScore = clamp01(input.qualitySignals?.outputEfficiencyScore ?? (plants > 0 ? Math.min(1, plants / Math.max(1, outTokens / 300)) : (outTokens > 0 ? 0 : 0.5)));

  const composite = computeCompositeQuality({
    tagConformanceScore,
    contextUtilizationScore,
    instructionAdherenceScore,
    hallucinationRate,
    structuralIntegrityScore,
    regressionRiskScore,
    outputEfficiencyScore,
  });

  const failureModes = getFailureModesFromSignals(input);

  db.prepare(`
    INSERT INTO quality_records (
      id, quality_id, blame_id, model_id,
      tag_conformance, instruction_adherence, hallucination, structural_integrity, output_efficiency,
      tag_conformance_score, context_utilization_score, instruction_adherence_score, hallucination_rate,
      structural_integrity_score, regression_risk_score, output_efficiency_score,
      composite_quality_score, failure_modes, cycle_id, timestamp, crawled_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(blame_id) DO UPDATE SET
      model_id = excluded.model_id,
      tag_conformance = excluded.tag_conformance,
      instruction_adherence = excluded.instruction_adherence,
      hallucination = excluded.hallucination,
      structural_integrity = excluded.structural_integrity,
      output_efficiency = excluded.output_efficiency,
      tag_conformance_score = excluded.tag_conformance_score,
      context_utilization_score = excluded.context_utilization_score,
      instruction_adherence_score = excluded.instruction_adherence_score,
      hallucination_rate = excluded.hallucination_rate,
      structural_integrity_score = excluded.structural_integrity_score,
      regression_risk_score = excluded.regression_risk_score,
      output_efficiency_score = excluded.output_efficiency_score,
      composite_quality_score = excluded.composite_quality_score,
      failure_modes = excluded.failure_modes,
      cycle_id = excluded.cycle_id,
      timestamp = datetime('now'),
      crawled_at = datetime('now')
  `).run(
    randomUUID(),
    randomUUID(),
    blameId,
    derived.modelId,
    tagConformanceScore,
    instructionAdherenceScore,
    hallucinationRate,
    structuralIntegrityScore,
    outputEfficiencyScore,
    tagConformanceScore,
    contextUtilizationScore,
    instructionAdherenceScore,
    hallucinationRate,
    structuralIntegrityScore,
    regressionRiskScore,
    outputEfficiencyScore,
    composite,
    safeJsonArrayString(failureModes),
    derived.cycleId,
  );

  maybeWriteToolCriticism(db, {
    modelId: derived.modelId,
    interactionType: derived.interactionType,
    compositeQuality: composite,
    cycleId: derived.cycleId,
    failureModes,
    activeToolConfigs: input.activeToolConfigs || [],
    activePromptStructures: input.activePromptStructures || [],
  });

  maybeWriteSuccessAttribution(db, {
    blameId,
    modelId: derived.modelId,
    interactionType: derived.interactionType,
    compositeQuality: composite,
    cycleId: derived.cycleId,
    contextSizeTokens: input.contextWindowTokens || 0,
    modelTier: inferTier(input.contextWindowTokens || 0),
    tagTypesInvolved: [
      ...(input.devtagReferences || []).slice(0, 12),
      ...(input.buildtagReferences || []).slice(0, 12),
    ],
  });
}

function insertSuggestedJob(db: any, job: {
  category: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  payload: Record<string, unknown>;
}): string {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO suggested_jobs (id, category, source, title, description, priority, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, job.category, job.source, job.title, job.description, job.priority, safeJsonString(job.payload));
  return id;
}

function maybeWriteToolCriticism(db: any, args: {
  modelId: string;
  interactionType: string;
  compositeQuality: number;
  cycleId: string;
  failureModes: string[];
  activeToolConfigs: string[];
  activePromptStructures: string[];
}) {
  if (args.compositeQuality >= 0.65) return;

  const rows = db.prepare(`
    SELECT q.composite_quality_score as score
    FROM quality_records q
    INNER JOIN blame_records b ON b.id = q.blame_id
    WHERE b.model_id = ? AND b.interaction_type = ?
    ORDER BY b.created_at DESC
    LIMIT 3
  `).all(args.modelId, args.interactionType) as Array<{ score: number }>;

  if (rows.length < 3 || rows.some(r => Number(r.score) >= 0.65)) return;

  const failurePattern = args.failureModes.length > 0
    ? `three_consecutive_low_quality:${args.failureModes.join(',')}`
    : 'three_consecutive_low_quality';

  const proposedToolModifications = [
    {
      tool_config_id: 'default_structure_guard',
      modification_type: 'add_constraint',
      modification_detail: 'Add stricter output schema + required tag references',
      expected_impact_dimension: 'tag_conformance',
      expected_impact_direction: 'improve',
      priority: 'high',
    },
  ];

  const proposedNewTools = [
    {
      tool_name: 'model_output_guardrail',
      tool_purpose: 'Constrain low-conformance outputs before validator stage',
      input_schema: '{ model_output, required_tags, interaction_type }',
      output_schema: '{ sanitized_output, violations[] }',
      target_model_tiers: [1, 2, 3],
      intended_interaction_types: [args.interactionType],
    },
  ];

  const suggestedJobId = insertSuggestedJob(db, {
    category: 'model_tool_enhancement',
    source: 'Blame Crawler',
    title: `Tool hardening for ${parseModelName(args.modelId)}`,
    description: `Three consecutive low-quality outputs for ${args.interactionType}. Add stronger tool constraints.`,
    priority: 'high',
    payload: {
      modelId: args.modelId,
      interactionType: args.interactionType,
      failurePattern,
      scales_to_model_tiers: [1, 2, 3, 4, 5],
    },
  });

  db.prepare(`
    INSERT INTO tool_criticism_records (
      id, criticism_id, model, model_id, interaction_type,
      failing_quality_dimensions, active_tool_configs, active_prompt_structures,
      failure_pattern, proposed_tool_modifications, proposed_new_tools,
      scales_to_model_tiers, suggested_job_id, cycle_id, timestamp,
      tool_name, failure_type, criticism, severity
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?)
  `).run(
    randomUUID(),
    randomUUID(),
    args.modelId,
    args.modelId,
    args.interactionType,
    safeJsonArrayString(args.failureModes.length ? args.failureModes : ['composite_quality']),
    safeJsonArrayString(args.activeToolConfigs),
    safeJsonArrayString(args.activePromptStructures),
    failurePattern,
    safeJsonArrayString(proposedToolModifications),
    safeJsonArrayString(proposedNewTools),
    safeJsonArrayString([1, 2, 3, 4, 5]),
    suggestedJobId,
    args.cycleId,
    'quality_guardrail',
    'low_quality_streak',
    `Composite score below 0.65 for 3 consecutive outputs in ${args.interactionType}`,
    'error',
  );
}

function maybeWriteSuccessAttribution(db: any, args: {
  blameId: string;
  modelId: string;
  interactionType: string;
  compositeQuality: number;
  cycleId: string;
  contextSizeTokens: number;
  modelTier: number;
  tagTypesInvolved: string[];
}) {
  if (args.compositeQuality < 0.85) return;

  const rows = db.prepare(`
    SELECT q.composite_quality_score as score
    FROM quality_records q
    INNER JOIN blame_records b ON b.id = q.blame_id
    WHERE b.model_id = ? AND b.interaction_type = ?
    ORDER BY b.created_at DESC
    LIMIT 3
  `).all(args.modelId, args.interactionType) as Array<{ score: number }>;

  if (rows.length < 3 || rows.some(r => Number(r.score) < 0.85)) return;

  const avg = rows.reduce((a, r) => a + Number(r.score || 0), 0) / rows.length;

  const suggestedJobId = insertSuggestedJob(db, {
    category: 'model_config_promotion',
    source: 'Blame Crawler',
    title: `Promote ${parseModelName(args.modelId)} for ${args.interactionType}`,
    description: `Composite quality >0.85 for 3 consecutive ${args.interactionType} outputs.`,
    priority: 'medium',
    payload: {
      modelId: args.modelId,
      interactionType: args.interactionType,
      consecutiveCount: rows.length,
      avgComposite: avg,
    },
  });

  db.prepare(`
    INSERT INTO blame_successes (
      id, success_id, blame_id, model, model_id, interaction_type,
      composite_quality_score_avg, context_size_tokens, model_tier,
      consecutive_count, tag_types_involved, tool_config_ids,
      prompt_structure_ids, suggested_job_id, cycle_id, timestamp,
      task_type, quality_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)
  `).run(
    randomUUID(),
    randomUUID(),
    args.blameId,
    args.modelId,
    args.modelId,
    args.interactionType,
    avg,
    args.contextSizeTokens,
    args.modelTier,
    rows.length,
    safeJsonArrayString(args.tagTypesInvolved.slice(0, 30)),
    safeJsonArrayString([]),
    safeJsonArrayString([]),
    suggestedJobId,
    args.cycleId,
    args.interactionType,
    Math.round(avg * 100),
  );
}

/**
 * Deterministic output-capture write. Must not throw.
 */
export function writeBlameRecord(db: any, input: BlameWriteInput): void {
  try {
    const id = randomUUID();
    // Attribution fallback: if no model field, default to 'github/copilot'
    // (codebase with no explicit blame attribution came from GitHub Copilot suggestions)
    const modelId = (input.model && input.model.trim()) ? input.model.trim() : 'github/copilot';
    const provider = parseProvider(modelId);
    // User signature detection: # $usersignature[TAG] in output text marks manually-authored lines
    const sigMatch = typeof input.outputText === 'string'
      ? input.outputText.match(/#\s*\$usersignature\[([^\]]+)\]/)
      : null;
    const userAuthored = sigMatch ? 1 : 0;
    const userSignatureTag = sigMatch ? sigMatch[1].trim() : null;
    const attributedSource = userAuthored ? userSignatureTag : modelId;
    const modelName = parseModelName(modelId);
    const modelVersion = input.modelVersion || 'unknown';
    const interactionType = input.interactionType || input.mode || 'ask';
    const contextWindowTokens = input.contextWindowTokens || 0;
    const outputTokensAllowed = input.outputTokensAllowed || 0;
    const promptTokens = input.promptTokens || 0;
    const completionTokens = input.completionTokens || input.tokenCount || 0;
    const tokenCount = input.tokenCount || (promptTokens + completionTokens);
    const contextUtilizationPercent = contextWindowTokens > 0
      ? clamp100((promptTokens / contextWindowTokens) * 100)
      : 0;
    const outputUtilizationPercent = outputTokensAllowed > 0
      ? clamp100((completionTokens / outputTokensAllowed) * 100)
      : 0;
    const outputHash = input.outputHash || createHash('sha256').update(String(input.outputText || '')).digest('hex');
    const cycleId = input.cycleId || new Date().toISOString().slice(0, 10);
    const timestamp = new Date().toISOString();

    // Synchronous deterministic capture marker (before downstream analysis)
    writeOutputCaptureEvent(db, id, 'capture_start', {
      modelId,
      interactionType,
      cycleId,
      sessionId: input.sessionId || null,
    });

    db.prepare(`
      INSERT INTO blame_records (
        id, blame_id, model, model_id, model_provider, model_name, model_version,
        mode, interaction_type,
        project_id, conversation_id, agent_run_id,
        agent_id, agent_role,
        task_type, build_phase,
        cycle_id, session_id, decided_step_id,
        plantag_references, devtag_references, buildtag_references,
        tag_validation_result, tag_validation_failure_codes,
        retry_count, escalation_level,
        quality, success, error_type, file_path,
        latency_ms, duration_ms,
        token_count, prompt_tokens, completion_tokens,
        context_window_tokens, output_tokens_allowed,
        context_utilization_percent, output_utilization_percent,
        output_hash, drift_detected, forensic_entry_ids,
        user_authored, user_signature_tag, attributed_source,
        created_at, timestamp
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        datetime('now'), ?
      )
    `).run(
      id,
      id,
      modelId,
      modelId,
      provider,
      modelName,
      modelVersion,
      input.mode || interactionType,
      interactionType,
      input.projectId || null,
      input.conversationId || null,
      input.agentRunId || null,
      input.agentId || null,
      input.agentRole || null,
      input.taskType || interactionType,
      input.buildPhase || null,
      cycleId,
      input.sessionId || null,
      input.decidedStepId || null,
      safeJsonArrayString(input.plantagReferences || []),
      safeJsonArrayString(input.devtagReferences || []),
      safeJsonArrayString(input.buildtagReferences || []),
      input.tagValidationResult || (input.success ? 'pass' : 'fail'),
      safeJsonArrayString(input.tagValidationFailureCodes || []),
      input.retryCount || 0,
      input.escalationLevel || 0,
      typeof input.quality === 'number' ? input.quality : null,
      input.success ? 1 : 0,
      input.errorType || null,
      input.filePath || null,
      input.latencyMs || input.durationMs || null,
      input.durationMs || input.latencyMs || null,
      tokenCount || null,
      promptTokens || null,
      completionTokens || null,
      contextWindowTokens || null,
      outputTokensAllowed || null,
      contextUtilizationPercent,
      outputUtilizationPercent,
      outputHash,
      input.driftDetected ? 1 : 0,
      safeJsonArrayString(input.forensicEntryIds || []),
      userAuthored,
      userSignatureTag,
      attributedSource,
      timestamp,
    );

    writeOutputCaptureEvent(db, id, 'validator_append', {
      tagValidationResult: input.tagValidationResult || (input.success ? 'pass' : 'fail'),
      failureCodes: input.tagValidationFailureCodes || [],
    });

    computeAndWriteQualityRecord(db, id, input, {
      modelId,
      contextUtilizationPercent,
      outputUtilizationPercent,
      cycleId,
      interactionType,
    });

    recalcModelRegistryForModel(db, modelId);

    writeOutputCaptureEvent(db, id, 'capture_complete', {
      qualityComputed: true,
    });
  } catch {
    // Best effort; never throw from instrumentation path.
  }
}

function recalcModelRegistryForModel(db: any, modelId: string) {
  const rows = db.prepare(`
    SELECT
      b.model_id,
      b.model_provider,
      b.model_name,
      b.model_version,
      b.interaction_type,
      b.context_window_tokens,
      b.duration_ms,
      b.token_count,
      b.retry_count,
      b.success,
      q.composite_quality_score,
      q.tag_conformance_score,
      q.hallucination_rate,
      q.failure_modes
    FROM blame_records b
    LEFT JOIN quality_records q ON q.blame_id = b.id
    WHERE b.model_id = ?
    ORDER BY b.created_at DESC
  `).all(modelId) as Array<{
    model_id: string;
    model_provider: string;
    model_name: string;
    model_version: string;
    interaction_type: string;
    context_window_tokens: number;
    duration_ms: number;
    token_count: number;
    retry_count: number;
    success: number;
    composite_quality_score: number;
    tag_conformance_score: number;
    hallucination_rate: number;
    failure_modes: string;
  }>;

  if (rows.length === 0) return;

  const totalRuns = rows.length;
  const successRate = rows.reduce((a, r) => a + (r.success ? 1 : 0), 0) / totalRuns;
  const avgQuality = rows.reduce((a, r) => a + Number(r.composite_quality_score || 0), 0) / totalRuns;
  const avgLatencyMs = rows.reduce((a, r) => a + Number(r.duration_ms || 0), 0) / totalRuns;
  const totalTokens = rows.reduce((a, r) => a + Number(r.token_count || 0), 0);

  const conformanceRate = rows.reduce((a, r) => a + Number(r.tag_conformance_score || 0), 0) / totalRuns;
  const retryRate = rows.reduce((a, r) => a + Number((r.retry_count || 0) > 0 ? 1 : 0), 0) / totalRuns;
  const hallucinationRate = rows.reduce((a, r) => a + Number(r.hallucination_rate || 0), 0) / totalRuns;
  const aiSlopRate = rows.reduce((a, r) => {
    const failures = parseJsonArray<string>(r.failure_modes || '[]');
    return a + (failures.includes('output_inefficiency') || failures.includes('tag_validation_fail') ? 1 : 0);
  }, 0) / totalRuns;
  const spaghettiRate = rows.reduce((a, r) => {
    const failures = parseJsonArray<string>(r.failure_modes || '[]');
    return a + (failures.includes('structural_integrity_fail') ? 1 : 0);
  }, 0) / totalRuns;

  const half = Math.floor(rows.length / 2);
  const oldHalf = half > 0 ? rows.slice(half) : rows;
  const newHalf = half > 0 ? rows.slice(0, half) : rows;
  const oldAvg = oldHalf.reduce((a, r) => a + Number(r.composite_quality_score || 0), 0) / Math.max(1, oldHalf.length);
  const newAvg = newHalf.reduce((a, r) => a + Number(r.composite_quality_score || 0), 0) / Math.max(1, newHalf.length);
  const trend: 'up' | 'down' | 'flat' = newAvg > oldAvg + 0.05 ? 'up' : newAvg < oldAvg - 0.05 ? 'down' : 'flat';

  const interactionCounts = new Map<string, number>();
  for (const row of rows) {
    const key = row.interaction_type || 'ask';
    interactionCounts.set(key, (interactionCounts.get(key) || 0) + 1);
  }
  const recommendedInteractionTypes = [...interactionCounts.entries()].filter(([, c]) => c >= 3).map(([k]) => k);
  const avoidedInteractionTypes = trend === 'down' ? recommendedInteractionTypes.slice(0, 2) : [];

  const contextWindowTokens = Number(rows[0]?.context_window_tokens || 0);
  const safePromptCeilingTokens = Math.floor(contextWindowTokens * 0.8);
  const safeOutputCeilingTokens = Math.floor(contextWindowTokens * 0.6);

  const agg: ModelAggregate = {
    modelId,
    provider: rows[0]?.model_provider || parseProvider(modelId),
    modelName: rows[0]?.model_name || parseModelName(modelId),
    modelVersion: rows[0]?.model_version || 'unknown',
    totalRuns,
    successRate,
    avgQuality,
    avgLatencyMs,
    totalTokens,
    trend,
    observedConformanceRate: conformanceRate,
    observedRetryRate: retryRate,
    observedHallucinationRate: hallucinationRate,
    observedSpaghettiRate: spaghettiRate,
    observedAiSlopRate: aiSlopRate,
    observedAvgOutputTokens: Math.round(totalTokens / Math.max(1, totalRuns)),
    observedAvgDurationMs: Math.round(avgLatencyMs),
    contextWindowTokens,
    safePromptCeilingTokens,
    safeOutputCeilingTokens,
    modelTier: inferTier(contextWindowTokens),
    recommendedInteractionTypes,
    avoidedInteractionTypes,
  };

  upsertModelRegistryAggregate(db, agg);
}

function normalizeRecordRow(r: any) {
  return {
    id: r.id,
    blameId: r.blame_id || r.id,
    model: r.model_id || r.model,
    modelId: r.model_id || r.model,
    modelProvider: r.model_provider,
    modelName: r.model_name,
    modelVersion: r.model_version,
    mode: r.mode,
    interactionType: r.interaction_type || r.mode,
    buildPhase: r.build_phase,
    cycleId: r.cycle_id,
    sessionId: r.session_id,
    projectId: r.project_id,
    conversationId: r.conversation_id,
    taskType: r.task_type,
    quality: typeof r.composite_quality_score === 'number' ? Math.round(r.composite_quality_score * 100) : r.quality,
    compositeQualityScore: r.composite_quality_score,
    tokenCount: r.token_count,
    promptTokens: r.prompt_tokens,
    completionTokens: r.completion_tokens,
    contextWindowTokens: r.context_window_tokens,
    outputTokensAllowed: r.output_tokens_allowed,
    contextUtilizationPercent: r.context_utilization_percent,
    outputUtilizationPercent: r.output_utilization_percent,
    tagValidationResult: r.tag_validation_result,
    tagValidationFailureCodes: parseJsonArray<string>(r.tag_validation_failure_codes),
    retryCount: r.retry_count,
    escalationLevel: r.escalation_level,
    outputHash: r.output_hash,
    driftDetected: Boolean(r.drift_detected),
    forensicEntryIds: parseJsonArray<string>(r.forensic_entry_ids),
    success: r.success === 1,
    errorType: r.error_type,
    filePath: r.file_path,
    latencyMs: r.latency_ms,
    durationMs: r.duration_ms,
    timestamp: r.timestamp || r.created_at,
    tagConformance: r.tag_conformance_score,
    contextUtilizationScore: r.context_utilization_score,
    instructionAdherence: r.instruction_adherence_score,
    hallucination: r.hallucination_rate,
    structuralIntegrity: r.structural_integrity_score,
    regressionRisk: r.regression_risk_score,
    outputEfficiency: r.output_efficiency_score,
    failureModes: parseJsonArray<string>(r.failure_modes),
  };
}

function normalizeRegistryRow(r: any) {
  return {
    model: r.model_id,
    modelId: r.model_id,
    modelName: r.model_name || r.display_name,
    modelVersion: r.model_version,
    provider: r.provider,
    totalRuns: r.total_runs,
    successRate: r.success_rate,
    avgQuality: (r.avg_quality || 0) * 100,
    avgLatencyMs: r.avg_latency_ms,
    totalTokens: r.total_tokens,
    trend: r.trend,
    tagConformance: r.observed_conformance_rate,
    instructionAdherence: r.instruction_adherence,
    hallucination: r.observed_hallucination_rate,
    structuralIntegrity: r.structural_integrity,
    outputEfficiency: r.output_efficiency,
    modelTier: r.model_tier,
    contextWindowTokens: r.context_window_tokens,
    safePromptCeilingTokens: r.safe_prompt_ceiling_tokens,
    safeOutputCeilingTokens: r.safe_output_ceiling_tokens,
    strengths: parseJsonArray<string>(r.strengths),
    weaknesses: parseJsonArray<string>(r.weaknesses),
    recommendedInteractionTypes: parseJsonArray<string>(r.recommended_interaction_types),
    avoidedInteractionTypes: parseJsonArray<string>(r.avoided_interaction_types),
    toolConfigsGenerated: parseJsonArray<string>(r.tool_configs_generated),
    strategyConfig: (() => {
      try {
        return r.strategy_config ? JSON.parse(r.strategy_config) : undefined;
      } catch {
        return undefined;
      }
    })(),
    lastUsed: r.last_run_at || r.updated_at,
  };
}

export async function blameRoutes(app: FastifyInstance) {
  const db = (app as any).db;

  // GET /records
  app.get('/records', async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number(query.limit || 100), 1), 500);

    const where: string[] = [];
    const params: any[] = [];

    if (query.model) {
      where.push('(b.model_id LIKE ? OR b.model LIKE ?)');
      params.push(`%${query.model}%`, `%${query.model}%`);
    }
    if (query.mode) {
      where.push('(b.mode = ? OR b.interaction_type = ?)');
      params.push(query.mode, query.mode);
    }
    if (query.interactionType) {
      where.push('b.interaction_type = ?');
      params.push(query.interactionType);
    }
    if (query.projectId) {
      where.push('b.project_id = ?');
      params.push(query.projectId);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = db.prepare(`
      SELECT
        b.*, q.tag_conformance_score, q.context_utilization_score,
        q.instruction_adherence_score, q.hallucination_rate,
        q.structural_integrity_score, q.regression_risk_score,
        q.output_efficiency_score, q.composite_quality_score, q.failure_modes
      FROM blame_records b
      LEFT JOIN quality_records q ON q.blame_id = b.id
      ${whereSql}
      ORDER BY b.created_at DESC
      LIMIT ?
    `).all(...params, limit);

    const records = rows.map(normalizeRecordRow);

    const regRows = db.prepare(`SELECT * FROM model_registry ORDER BY total_runs DESC`).all();
    const stats = regRows.map(normalizeRegistryRow);

    return reply.send({ records, stats });
  });

  // POST /record
  app.post('/record', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as BlameWriteInput;
    if (!body?.model) {
      return reply.status(400).send({ error: 'model is required' });
    }
    writeBlameRecord(db, {
      ...body,
      mode: body.mode || body.interactionType || 'ask',
      success: body.success !== false,
    });
    return reply.status(201).send({ ok: true });
  });

  // POST /capture (alias)
  app.post('/capture', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as BlameWriteInput;
    if (!body?.model) {
      return reply.status(400).send({ error: 'model is required' });
    }
    writeBlameRecord(db, {
      ...body,
      mode: body.mode || body.interactionType || 'ask',
      success: body.success !== false,
    });
    return reply.send({ ok: true });
  });

  // GET /registry
  app.get('/registry', async (_req: FastifyRequest, reply: FastifyReply) => {
    const rows = db.prepare(`SELECT * FROM model_registry ORDER BY total_runs DESC`).all();
    return reply.send({ models: rows.map(normalizeRegistryRow) });
  });

  // POST /registry/update
  app.post('/registry/update', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      modelId: string;
      updates: Record<string, unknown>;
      updatedBy?: string;
      cycleId?: number;
    };

    if (!body?.modelId || !body?.updates || typeof body.updates !== 'object') {
      return reply.status(400).send({ error: 'modelId and updates are required' });
    }

    const updates = body.updates;
    const allowed = [
      'strengths', 'weaknesses', 'recommended_interaction_types', 'avoided_interaction_types',
      'tool_configs_generated', 'safe_prompt_ceiling_tokens', 'safe_output_ceiling_tokens',
      'context_window_tokens', 'model_tier', 'strategy_config', 'model_name', 'model_version',
    ];

    const sets: string[] = [];
    const params: any[] = [];

    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        sets.push(`${key} = ?`);
        const value = (updates as any)[key];
        if (Array.isArray(value) || (value && typeof value === 'object' && key === 'strategy_config')) {
          params.push(JSON.stringify(value));
        } else {
          params.push(value);
        }
      }
    }

    sets.push('last_updated_by = ?');
    params.push(body.updatedBy || 'god_factory');
    sets.push('last_updated_cycle = ?');
    params.push(Number(body.cycleId || 0));
    sets.push("updated_at = datetime('now')");

    params.push(body.modelId);

    db.prepare(`UPDATE model_registry SET ${sets.join(', ')} WHERE model_id = ?`).run(...params);
    return reply.send({ ok: true });
  });

  // GET /quality
  app.get('/quality', async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number(query.limit || 100), 1), 500);

    const where: string[] = [];
    const params: any[] = [];

    if (query.modelId) {
      where.push('q.model_id = ?');
      params.push(query.modelId);
    }
    if (query.interactionType) {
      where.push('b.interaction_type = ?');
      params.push(query.interactionType);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = db.prepare(`
      SELECT q.*, b.interaction_type, b.model_name, b.model_id
      FROM quality_records q
      INNER JOIN blame_records b ON b.id = q.blame_id
      ${whereSql}
      ORDER BY q.timestamp DESC
      LIMIT ?
    `).all(...params, limit);

    const quality = rows.map((r: any) => ({
      qualityId: r.quality_id || r.id,
      blameId: r.blame_id,
      modelId: r.model_id,
      modelName: r.model_name,
      interactionType: r.interaction_type,
      tagConformanceScore: r.tag_conformance_score,
      contextUtilizationScore: r.context_utilization_score,
      instructionAdherenceScore: r.instruction_adherence_score,
      hallucinationRate: r.hallucination_rate,
      structuralIntegrityScore: r.structural_integrity_score,
      regressionRiskScore: r.regression_risk_score,
      outputEfficiencyScore: r.output_efficiency_score,
      compositeQualityScore: r.composite_quality_score,
      failureModes: parseJsonArray<string>(r.failure_modes),
      cycleId: r.cycle_id,
      timestamp: r.timestamp || r.crawled_at,
    }));

    return reply.send({ quality });
  });

  // GET /criticisms
  app.get('/criticisms', async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number(query.limit || 100), 1), 300);

    const where: string[] = [];
    const params: any[] = [];
    if (query.modelId) {
      where.push('(model_id = ? OR model = ?)');
      params.push(query.modelId, query.modelId);
    }
    if (query.interactionType) {
      where.push('interaction_type = ?');
      params.push(query.interactionType);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = db.prepare(`
      SELECT * FROM tool_criticism_records
      ${whereSql}
      ORDER BY timestamp DESC, created_at DESC
      LIMIT ?
    `).all(...params, limit);

    const criticisms = rows.map((r: any) => ({
      criticismId: r.criticism_id || r.id,
      modelId: r.model_id || r.model,
      interactionType: r.interaction_type,
      failingQualityDimensions: parseJsonArray<string>(r.failing_quality_dimensions),
      activeToolConfigs: parseJsonArray<string>(r.active_tool_configs),
      activePromptStructures: parseJsonArray<string>(r.active_prompt_structures),
      failurePattern: r.failure_pattern || r.failure_type,
      proposedToolModifications: parseJsonArray<Record<string, unknown>>(r.proposed_tool_modifications),
      proposedNewTools: parseJsonArray<Record<string, unknown>>(r.proposed_new_tools),
      scalesToModelTiers: parseJsonArray<number>(r.scales_to_model_tiers),
      suggestedJobId: r.suggested_job_id,
      cycleId: r.cycle_id,
      timestamp: r.timestamp || r.created_at,
      severity: r.severity,
      criticism: r.criticism,
    }));

    return reply.send({ criticisms });
  });

  // GET /successes
  app.get('/successes', async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number(query.limit || 100), 1), 300);

    const where: string[] = [];
    const params: any[] = [];

    if (query.modelId) {
      where.push('(model_id = ? OR model = ?)');
      params.push(query.modelId, query.modelId);
    }
    if (query.interactionType) {
      where.push('interaction_type = ?');
      params.push(query.interactionType);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = db.prepare(`
      SELECT * FROM blame_successes
      ${whereSql}
      ORDER BY timestamp DESC, created_at DESC
      LIMIT ?
    `).all(...params, limit);

    const successes = rows.map((r: any) => ({
      successId: r.success_id || r.id,
      modelId: r.model_id || r.model,
      interactionType: r.interaction_type || r.task_type,
      compositeQualityScoreAvg: r.composite_quality_score_avg,
      promptStructureIds: parseJsonArray<string>(r.prompt_structure_ids),
      toolConfigIds: parseJsonArray<string>(r.tool_config_ids),
      contextSizeTokens: r.context_size_tokens,
      tagTypesInvolved: parseJsonArray<string>(r.tag_types_involved),
      modelTier: r.model_tier,
      consecutiveCount: r.consecutive_count,
      suggestedJobId: r.suggested_job_id,
      cycleId: r.cycle_id,
      timestamp: r.timestamp || r.created_at,
    }));

    return reply.send({ successes });
  });

  // GET /jobs
  app.get('/jobs', async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number(query.limit || 100), 1), 500);

    const where: string[] = [];
    const params: any[] = [];

    if (query.category) {
      where.push('category = ?');
      params.push(query.category);
    }
    if (query.status) {
      where.push('status = ?');
      params.push(query.status);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = db.prepare(`
      SELECT * FROM suggested_jobs
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT ?
    `).all(...params, limit);

    const jobs = rows.map((r: any) => ({
      id: r.id,
      category: r.category,
      source: r.source,
      title: r.title,
      description: r.description,
      priority: r.priority,
      payload: (() => {
        try {
          return r.payload ? JSON.parse(r.payload) : {};
        } catch {
          return {};
        }
      })(),
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    return reply.send({ jobs });
  });

  // POST /jobs/:id/status
  app.post('/jobs/:id/status', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { status: 'pending' | 'applied' | 'dismissed' };
    if (!body?.status) {
      return reply.status(400).send({ error: 'status is required' });
    }

    db.prepare(`
      UPDATE suggested_jobs SET status = ?, updated_at = datetime('now') WHERE id = ?
    `).run(body.status, id);

    return reply.send({ ok: true });
  });

  // POST /crawl - SSE stream of crawler pass
  app.post('/crawl', async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const emit = (event: Record<string, unknown>) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      emit({ log: 'Blame crawler started' });

      const models = db.prepare(`SELECT DISTINCT model_id FROM blame_records WHERE model_id IS NOT NULL`).all() as Array<{ model_id: string }>;
      emit({ log: `Discovered ${models.length} model(s)` });

      const configUpdates: Record<string, Record<string, unknown>> = {};

      for (const m of models) {
        const modelId = m.model_id;
        recalcModelRegistryForModel(db, modelId);

        const reg = db.prepare(`SELECT * FROM model_registry WHERE model_id = ?`).get(modelId) as any;
        if (!reg) continue;

        emit({ log: `Analyzed ${parseModelName(modelId)}: quality=${Math.round((reg.avg_quality || 0) * 100)}% success=${Math.round((reg.success_rate || 0) * 100)}% trend=${reg.trend}` });

        const failureReason = (reg.observed_hallucination_rate || 0) > 0.2
          ? 'hallucination'
          : (reg.observed_ai_slop_rate || 0) > 0.35
            ? 'ai_slop'
            : (reg.success_rate || 0) < 0.55
              ? 'low_success_rate'
              : 'stable';

        if ((reg.avg_quality || 0) < 0.55 || (reg.success_rate || 0) < 0.55) {
          configUpdates[modelId] = {
            recommended: false,
            action: 'deprioritize',
            reason: failureReason,
            cleanupEligible: failureReason === 'ai_slop',
            blockScope: failureReason === 'ai_slop' ? 'persistent' : 'temporary',
            observedAt: new Date().toISOString(),
            source: 'blame_crawler',
          };
        } else if ((reg.avg_quality || 0) >= 0.85 && (reg.success_rate || 0) >= 0.85) {
          configUpdates[modelId] = {
            recommended: true,
            action: 'promote',
            tier: 'primary',
            reason: 'high_quality_streak',
            observedAt: new Date().toISOString(),
            source: 'blame_crawler',
          };
        }
      }

      emit({ log: `Crawler complete. ${Object.keys(configUpdates).length} recommendation(s) generated` });
      emit({ config: configUpdates });
    } catch (err: any) {
      emit({ log: `Crawler error: ${String(err?.message || err)}` });
    }

    reply.raw.end();
  });

  // POST /apply-config
  app.post('/apply-config', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { config: Record<string, Record<string, unknown>> };
    if (!body?.config || typeof body.config !== 'object') {
      return reply.status(400).send({ error: 'config object required' });
    }

    const updates = Object.entries(body.config);

    for (const [modelId, cfg] of updates) {
      db.prepare(`
        UPDATE model_registry
        SET strategy_config = ?, updated_at = datetime('now')
        WHERE model_id = ?
      `).run(safeJsonString(cfg), modelId);
    }

    return reply.send({ ok: true, updated: updates.length });
  });
}
