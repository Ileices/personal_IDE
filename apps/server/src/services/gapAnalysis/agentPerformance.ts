// ============================================
// Agent Performance Analysis Agent
// Computes per-agent metrics per cycle:
// conformance, retry, escalation, contribution,
// regression contribution, spawn efficiency,
// context efficiency.
// Writes to agent_performance table.
// ============================================
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';

export interface AgentMetrics {
  entry_id: string;
  agent_id: string;
  cycle_id: string;
  conformance_rate: number;  // % outputs passing tag validation first attempt
  retry_rate: number;        // % outputs needing retry
  escalation_rate: number;   // % tasks escalating past level 2
  cycle_contribution: number; // plantags moved to done
  regression_contribution: number; // regressions attributed to agent
  spawn_efficiency: number;  // sub-agents spawned per completed step
  context_efficiency: number; // % context window used vs ceiling
}

export interface PerformanceSummary {
  total_agents: number;
  low_conformance: AgentMetrics[];   // < 70%
  high_escalation: AgentMetrics[];   // > 20%
  top_contributors: AgentMetrics[];
  flagged_for_review: string[];
}

// Context window tier ceilings (token counts) per model tier
const MODEL_TIER_CEILINGS: Record<string, number> = {
  nano: 2048,
  small: 8192,
  medium: 32768,
  large: 131072,
  flagship: 200000,
};

export class AgentPerformanceAnalysisAgent {
  constructor(private db: Database.Database) {}

  /** Compute and persist metrics for one agent in one cycle */
  computeMetrics(agent_id: string, cycle_id: string): AgentMetrics {
    const t0 = Date.now();

    // ── Conformance Rate ──────────────────────────────────────────────────
    const totalOutputs = (this.db.prepare(
      `SELECT COUNT(*) as c FROM buildtags WHERE agent_id = ? AND cycle_id = ?`
    ).get(agent_id, cycle_id) as any)?.c ?? 0;

    // Outputs that failed validation = ended up in diff_failures for this agent/cycle
    const failedOutputs = (this.db.prepare(
      `SELECT COUNT(*) as c FROM diff_failures WHERE agent_id = ? AND cycle_id = ?`
    ).get(agent_id, cycle_id) as any)?.c ?? 0;

    const conformance_rate = totalOutputs > 0
      ? Math.max(0, ((totalOutputs - failedOutputs) / totalOutputs) * 100)
      : 100;

    // ── Retry Rate ────────────────────────────────────────────────────────
    // Buildtags that were retried = multiple buildtags targeting the same devtag in the same cycle
    const retriedOutputs = (this.db.prepare(`
      SELECT COUNT(*) as c FROM (
        SELECT target_devtag_id, COUNT(*) as cnt FROM buildtags
        WHERE agent_id = ? AND cycle_id = ?
        GROUP BY target_devtag_id HAVING cnt > 1
      )
    `).get(agent_id, cycle_id) as any)?.c ?? 0;

    const retry_rate = totalOutputs > 0 ? (retriedOutputs / totalOutputs) * 100 : 0;

    // ── Escalation Rate ───────────────────────────────────────────────────
    const escalatedTasks = (this.db.prepare(
      `SELECT COUNT(*) as c FROM failure_escalation_log WHERE agent_id = ? AND decision_cycle_id = ? AND level > 2`
    ).get(agent_id, cycle_id) as any)?.c ?? 0;

    const totalTasks = Math.max(totalOutputs, 1);
    const escalation_rate = (escalatedTasks / totalTasks) * 100;

    // ── Cycle Contribution ────────────────────────────────────────────────
    const cycle_contribution = (this.db.prepare(`
      SELECT COUNT(*) as c FROM plantags pt
      INNER JOIN buildtags bt ON pt.id = bt.plantag_id
      WHERE bt.agent_id = ? AND bt.cycle_id = ? AND pt.status = 'done'
    `).get(agent_id, cycle_id) as any)?.c ?? 0;

    // ── Regression Contribution ───────────────────────────────────────────
    const regression_contribution = (this.db.prepare(
      `SELECT COUNT(*) as c FROM regression_history WHERE cause_agent_id = ? AND cycle_id = ?`
    ).get(agent_id, cycle_id) as any)?.c ?? 0;

    // ── Spawn Efficiency ──────────────────────────────────────────────────
    const spawnedSubAgents = (this.db.prepare(
      `SELECT COUNT(*) as c FROM spawn_violations WHERE requesting_agent_id = ? AND blocked = 0 AND created_at LIKE ?`
    ).get(agent_id, `%${cycle_id}%`) as any)?.c ?? 0;

    const completedSteps = (this.db.prepare(
      `SELECT COUNT(*) as c FROM buildtags WHERE agent_id = ? AND cycle_id = ? AND status = 'committed'`
    ).get(agent_id, cycle_id) as any)?.c ?? 1;

    const spawn_efficiency = completedSteps > 0 ? spawnedSubAgents / completedSteps : 0;

    // ── Context Efficiency ────────────────────────────────────────────────
    // Approximate from token counts in buildtag metadata
    const tokensUsed = (this.db.prepare(`
      SELECT SUM(CAST(json_extract(metadata, '$.token_count') AS INTEGER)) as tokens
      FROM buildtags WHERE agent_id = ? AND cycle_id = ?
    `).get(agent_id, cycle_id) as any)?.tokens ?? 0;

    const modelTier = this.getAgentModelTier(agent_id);
    const tierCeiling = MODEL_TIER_CEILINGS[modelTier] ?? MODEL_TIER_CEILINGS['medium'];
    const context_efficiency = tierCeiling > 0 ? Math.min(100, (tokensUsed / tierCeiling) * 100) : 0;

    const metrics: AgentMetrics = {
      entry_id: uuid(),
      agent_id,
      cycle_id,
      conformance_rate: Math.round(conformance_rate * 10) / 10,
      retry_rate: Math.round(retry_rate * 10) / 10,
      escalation_rate: Math.round(escalation_rate * 10) / 10,
      cycle_contribution,
      regression_contribution,
      spawn_efficiency: Math.round(spawn_efficiency * 100) / 100,
      context_efficiency: Math.round(context_efficiency * 10) / 10,
    };

    // Persist
    this.db.prepare(`
      INSERT OR REPLACE INTO agent_performance
        (entry_id, agent_id, cycle_id, conformance_rate, retry_rate, escalation_rate,
         cycle_contribution, regression_contribution, spawn_efficiency, context_efficiency)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      metrics.entry_id, agent_id, cycle_id,
      metrics.conformance_rate, metrics.retry_rate, metrics.escalation_rate,
      metrics.cycle_contribution, metrics.regression_contribution,
      metrics.spawn_efficiency, metrics.context_efficiency
    );

    this.logToolCall('agent_performance_compute', agent_id, cycle_id, Date.now() - t0);
    return metrics;
  }

  /** Compute metrics for all active agents in a cycle */
  computeAllForCycle(cycle_id: string): AgentMetrics[] {
    const agentIds = (this.db.prepare(
      'SELECT DISTINCT agent_id FROM buildtags WHERE cycle_id = ?'
    ).all(cycle_id) as any[]).map(r => r.agent_id);

    return agentIds.map(id => this.computeMetrics(id, cycle_id));
  }

  /** Summarize performance across agents, flag low performers */
  getPerformanceSummary(cycle_id?: string): PerformanceSummary {
    let query = 'SELECT * FROM agent_performance WHERE 1=1';
    const params: any[] = [];
    if (cycle_id) { query += ' AND cycle_id = ?'; params.push(cycle_id); }
    query += ' ORDER BY timestamp DESC LIMIT 500';

    const rows = this.db.prepare(query).all(...params) as AgentMetrics[];

    const lowConformance = rows.filter(r => r.conformance_rate < 70);
    const highEscalation = rows.filter(r => r.escalation_rate > 20);
    const topContributors = [...rows].sort((a, b) => b.cycle_contribution - a.cycle_contribution).slice(0, 5);
    const flagged = new Set([
      ...lowConformance.map(r => r.agent_id),
      ...highEscalation.map(r => r.agent_id),
    ]);

    return {
      total_agents: new Set(rows.map(r => r.agent_id)).size,
      low_conformance: lowConformance,
      high_escalation: highEscalation,
      top_contributors: topContributors,
      flagged_for_review: [...flagged],
    };
  }

  /** Full conformance report for a single agent over a cycle range */
  getConformanceReport(agent_id: string, cycle_range_start: string, cycle_range_end: string): {
    agent_id: string;
    avg_conformance_rate: number;
    avg_retry_rate: number;
    avg_escalation_rate: number;
    total_cycle_contribution: number;
    total_regression_contribution: number;
    avg_spawn_efficiency: number;
    avg_context_efficiency: number;
    flagged: boolean;
    entries: AgentMetrics[];
  } {
    const rows = this.db.prepare(`
      SELECT * FROM agent_performance
      WHERE agent_id = ? AND cycle_id >= ? AND cycle_id <= ?
      ORDER BY timestamp DESC
    `).all(agent_id, cycle_range_start, cycle_range_end) as AgentMetrics[];

    if (rows.length === 0) {
      return {
        agent_id, avg_conformance_rate: 0, avg_retry_rate: 0, avg_escalation_rate: 0,
        total_cycle_contribution: 0, total_regression_contribution: 0,
        avg_spawn_efficiency: 0, avg_context_efficiency: 0, flagged: false, entries: [],
      };
    }

    const avg = (field: keyof AgentMetrics) =>
      Math.round(rows.reduce((s, r) => s + (r[field] as number), 0) / rows.length * 10) / 10;

    const avgConformance = avg('conformance_rate');
    const avgEscalation = avg('escalation_rate');

    return {
      agent_id,
      avg_conformance_rate: avgConformance,
      avg_retry_rate: avg('retry_rate'),
      avg_escalation_rate: avgEscalation,
      total_cycle_contribution: rows.reduce((s, r) => s + r.cycle_contribution, 0),
      total_regression_contribution: rows.reduce((s, r) => s + r.regression_contribution, 0),
      avg_spawn_efficiency: avg('spawn_efficiency'),
      avg_context_efficiency: avg('context_efficiency'),
      flagged: avgConformance < 70 || avgEscalation > 20,
      entries: rows,
    };
  }

  /** Get latest metrics for all agents */
  getLatestAllAgents(): AgentMetrics[] {
    return this.db.prepare(`
      SELECT ap.* FROM agent_performance ap
      INNER JOIN (
        SELECT agent_id, MAX(timestamp) as max_ts FROM agent_performance GROUP BY agent_id
      ) latest ON ap.agent_id = latest.agent_id AND ap.timestamp = latest.max_ts
      ORDER BY ap.conformance_rate ASC
    `).all() as AgentMetrics[];
  }

  private getAgentModelTier(agent_id: string): string {
    if (agent_id.includes('nano')) return 'nano';
    if (agent_id.includes('small')) return 'small';
    if (agent_id.includes('large') || agent_id.includes('flagship')) return 'flagship';
    return 'medium';
  }

  private logToolCall(tag_type: string, agent_id: string, cycle_id: string, ms: number) {
    try {
      this.db.prepare(`
        INSERT INTO tag_resolution_log (entry_id, tag_type, agent_id, cycle_id, resolution_time_ms)
        VALUES (?, ?, ?, ?, ?)
      `).run(uuid(), tag_type, agent_id, cycle_id, ms);
    } catch { /* non-blocking */ }
  }
}
