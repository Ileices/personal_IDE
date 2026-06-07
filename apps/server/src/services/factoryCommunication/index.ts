// ============================================================
// Factory Communication Service
//
// Enables God Factory and Project Factory to exchange structured
// messages: status reports, quality critiques, routing suggestions,
// and capability requests. Messages are stored in SQLite and
// generated using LLM (callWithFallback).
//
// God Factory can ask Project Factory for build context.
// Project Factory can ask God Factory for code generation.
// Both can discuss "best paths forward" per the directive.
// ============================================================

import { randomUUID } from 'crypto';
import type { Database } from 'better-sqlite3';
import { callWithFallback } from '../llm/unifiedFallback.js';

// ── Types ────────────────────────────────────────────────────

export type FactoryId = 'god' | 'project';

export type MessageType =
  | 'status_report'
  | 'quality_critique'
  | 'capability_request'
  | 'routing_suggestion'
  | 'best_path_discussion'
  | 'build_context'
  | 'code_review_request';

export interface FactoryMessage {
  id: string;
  from_factory: FactoryId;
  to_factory: FactoryId;
  message_type: MessageType;
  subject: string | null;
  body: string;
  model_used: string | null;
  read_at: string | null;
  created_at: string;
}

// ── Core Functions ───────────────────────────────────────────

/**
 * Send a message between factories.
 */
export function sendMessage(
  db: Database,
  from: FactoryId,
  to: FactoryId,
  type: MessageType,
  body: string,
  subject?: string,
  modelUsed?: string,
): string {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO factory_messages (id, from_factory, to_factory, message_type, subject, body, model_used, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(id, from, to, type, subject ?? null, body, modelUsed ?? null);
  return id;
}

/**
 * Get unread messages for a factory (oldest first).
 */
export function getUnreadMessages(
  db: Database,
  forFactory: FactoryId,
  limit = 20,
): FactoryMessage[] {
  return db.prepare(`
    SELECT * FROM factory_messages
    WHERE to_factory = ? AND read_at IS NULL
    ORDER BY created_at ASC
    LIMIT ?
  `).all(forFactory, limit) as FactoryMessage[];
}

/**
 * Get all recent messages between factories (for dashboard).
 */
export function getRecentMessages(
  db: Database,
  limit = 50,
): FactoryMessage[] {
  return db.prepare(`
    SELECT * FROM factory_messages
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as FactoryMessage[];
}

/**
 * Mark messages as read.
 */
export function markRead(db: Database, messageIds: string[]): void {
  if (messageIds.length === 0) return;
  const placeholders = messageIds.map(() => '?').join(', ');
  db.prepare(`UPDATE factory_messages SET read_at = datetime('now') WHERE id IN (${placeholders})`)
    .run(...messageIds);
}

/**
 * Generate a status report from a factory using LLM.
 * Summarizes current jobs, health, and priority concerns.
 */
export async function generateStatusReport(
  db: Database,
  from: FactoryId,
): Promise<string> {
  const toFactory: FactoryId = from === 'god' ? 'project' : 'god';

  // Gather context based on which factory is reporting
  let contextData = '';
  if (from === 'god') {
    const stats = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM suggested_jobs WHERE implementation_status = 'pending') as pending,
        (SELECT COUNT(*) FROM suggested_jobs WHERE implementation_status = 'completed') as completed,
        (SELECT COUNT(*) FROM suggested_jobs WHERE implementation_status = 'failed') as failed,
        (SELECT COUNT(*) FROM suggested_jobs WHERE implementation_status = 'in_progress') as in_progress
    `).get() as Record<string, number>;
    contextData = `God Factory jobs: ${stats.pending} pending, ${stats.in_progress} in-progress, ${stats.completed} completed, ${stats.failed} failed.`;
  } else {
    const recentJobs = db.prepare(`
      SELECT title, implementation_status FROM suggested_jobs
      ORDER BY created_at DESC LIMIT 5
    `).all() as Array<{ title: string; implementation_status: string }>;
    contextData = `Recent Project Factory activity: ${recentJobs.map(j => `${j.title} (${j.implementation_status})`).join(', ')}`;
  }

  try {
    const result = await callWithFallback({
      db,
      chainKey: 'lightweight',
      taskType: 'factory_status_report',
      messages: [{
        role: 'user',
        content: `You are the ${from === 'god' ? 'God Factory' : 'Project Factory'} AI orchestrator. Generate a brief, structured status report for the ${toFactory === 'god' ? 'God Factory' : 'Project Factory'}. Include: current state, priority concerns, and recommendations.

Context: ${contextData}

Format as 2-3 sentences. Be concise and actionable.`,
      }],
      maxTokens: 200,
    });

    const reportBody = result.content;
    sendMessage(db, from, toFactory, 'status_report', reportBody, `Status from ${from} factory`, result.modelId);
    return reportBody;
  } catch {
    const fallback = `${from} factory is operational. Context: ${contextData}`;
    sendMessage(db, from, toFactory, 'status_report', fallback, `Status from ${from} factory`);
    return fallback;
  }
}

/**
 * Facilitate a best-path discussion between both factories.
 * God Factory and Project Factory discuss the optimal approach to a challenge.
 */
export async function discussBestPath(
  db: Database,
  topic: string,
): Promise<{ godResponse: string; projectResponse: string }> {
  let godResponse = '';
  let projectResponse = '';

  try {
    const godResult = await callWithFallback({
      db,
      chainKey: 'reasoning',
      taskType: 'best_path_discussion',
      messages: [{
        role: 'system',
        content: 'You are the God Factory — the meta-orchestrator responsible for code generation, feature planning, and architectural decisions.',
      }, {
        role: 'user',
        content: `Discuss the best path forward for: ${topic}. Focus on code quality, architecture, and implementation strategy. Be concise (2-3 sentences).`,
      }],
      maxTokens: 150,
    });
    godResponse = godResult.content;
    sendMessage(db, 'god', 'project', 'best_path_discussion', godResponse, `Best path: ${topic.slice(0, 60)}`, godResult.modelId);
  } catch {
    godResponse = 'God Factory unavailable for discussion.';
  }

  try {
    const projectResult = await callWithFallback({
      db,
      chainKey: 'reasoning',
      taskType: 'best_path_discussion',
      messages: [{
        role: 'system',
        content: 'You are the Project Factory — responsible for project structure, build systems, and delivery pipeline.',
      }, {
        role: 'user',
        content: `Respond to God Factory's suggestion about: ${topic}. God Factory said: "${godResponse}". Provide your perspective on feasibility and project impact. Be concise (2-3 sentences).`,
      }],
      maxTokens: 150,
    });
    projectResponse = projectResult.content;
    sendMessage(db, 'project', 'god', 'best_path_discussion', projectResponse, `Response: ${topic.slice(0, 60)}`, projectResult.modelId);
  } catch {
    projectResponse = 'Project Factory unavailable for discussion.';
  }

  return { godResponse, projectResponse };
}

/**
 * God Factory requests a capability from Project Factory.
 * (e.g., "I need the test runner wired before I can validate this change")
 */
export async function requestCapability(
  db: Database,
  from: FactoryId,
  capability: string,
): Promise<string> {
  const to: FactoryId = from === 'god' ? 'project' : 'god';

  try {
    const result = await callWithFallback({
      db,
      chainKey: 'lightweight',
      taskType: 'capability_request',
      messages: [{
        role: 'user',
        content: `The ${from} factory needs: ${capability}. Generate a brief, actionable request message to the ${to} factory explaining what is needed and why.`,
      }],
      maxTokens: 120,
    });

    sendMessage(db, from, to, 'capability_request', result.content, `Capability: ${capability.slice(0, 60)}`, result.modelId);
    return result.content;
  } catch {
    const fallback = `${from} factory requests: ${capability}`;
    sendMessage(db, from, to, 'capability_request', fallback, `Capability: ${capability.slice(0, 60)}`);
    return fallback;
  }
}
