// ============================================================
// Factory Messages Routes
// API for inter-factory communication between God Factory
// and Project Factory. Enables LLM-to-LLM discussion of
// best paths forward, status reporting, and capability requests.
// ============================================================

import type { FastifyInstance } from 'fastify';
import type { Database } from 'better-sqlite3';
import {
  sendMessage,
  getUnreadMessages,
  getRecentMessages,
  markRead,
  generateStatusReport,
  discussBestPath,
  requestCapability,
  type FactoryId,
  type MessageType,
} from '../services/factoryCommunication/index.js';

export async function factoryMessagesRoutes(
  app: FastifyInstance & { db?: Database },
  options: { db?: Database },
) {
  const db: Database = (app as any).db ?? options.db;

  // GET /api/factory-messages — recent messages
  app.get<{ Querystring: { limit?: string } }>('/', async (request) => {
    const limit = Math.max(1, Math.min(100, parseInt(request.query.limit ?? '50', 10)));
    return { messages: getRecentMessages(db, limit) };
  });

  // GET /api/factory-messages/unread/:factory — unread messages for a factory
  app.get<{ Params: { factory: string } }>('/unread/:factory', async (request) => {
    const factory = request.params.factory as FactoryId;
    if (!['god', 'project'].includes(factory)) {
      return { messages: [] };
    }
    const messages = getUnreadMessages(db, factory);
    // Auto-mark as read
    if (messages.length) markRead(db, messages.map(m => m.id));
    return { messages };
  });

  // POST /api/factory-messages/send — send a direct message
  app.post<{
    Body: {
      from: FactoryId;
      to: FactoryId;
      type: MessageType;
      body: string;
      subject?: string;
    };
  }>('/send', async (request) => {
    const { from, to, type, body, subject } = request.body;
    if (!from || !to || !type || !body) {
      return { error: 'Missing required fields' };
    }
    const id = sendMessage(db, from, to, type, body, subject);
    return { id, success: true };
  });

  // POST /api/factory-messages/status-report/:factory — generate LLM status report
  app.post<{ Params: { factory: string } }>('/status-report/:factory', async (request, reply) => {
    const factory = request.params.factory as FactoryId;
    if (!['god', 'project'].includes(factory)) {
      return reply.status(400).send({ error: 'Invalid factory' });
    }
    const report = await generateStatusReport(db, factory);
    return { report };
  });

  // POST /api/factory-messages/discuss — LLM-to-LLM best path discussion
  app.post<{ Body: { topic: string } }>('/discuss', async (request) => {
    const { topic } = request.body;
    if (!topic) return { error: 'topic is required' };
    const result = await discussBestPath(db, topic);
    return result;
  });

  // POST /api/factory-messages/request-capability — capability request
  app.post<{
    Body: { from: FactoryId; capability: string };
  }>('/request-capability', async (request) => {
    const { from, capability } = request.body;
    if (!from || !capability) return { error: 'from and capability are required' };
    const message = await requestCapability(db, from, capability);
    return { message };
  });
}
