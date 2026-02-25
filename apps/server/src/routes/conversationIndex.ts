// ============================================
// Conversation Index Routes
// Hotword search, decision history, file refs
// ============================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ConversationIndexer } from '../services/analysis/conversationIndexer.js';

export async function conversationIndexRoutes(app: FastifyInstance) {
  const db = (app as any).db;
  const indexer = new ConversationIndexer(db);

  // Index a conversation
  app.post('/index', async (req: FastifyRequest) => {
    const { projectId, conversationId } = req.body as { projectId: string; conversationId: string };
    if (!projectId || !conversationId) {
      return { error: 'projectId and conversationId are required' };
    }
    const entries = indexer.indexConversation(projectId, conversationId);
    return { indexed: entries.length };
  });

  // Search by hotwords
  app.get('/search/:projectId', async (req: FastifyRequest) => {
    const { projectId } = req.params as { projectId: string };
    const { keywords, limit } = req.query as { keywords?: string; limit?: string };
    if (!keywords) return { error: 'keywords query param required (comma-separated)' };

    const keywordList = keywords.split(',').map(k => k.trim()).filter(Boolean);
    const results = indexer.searchByHotwords(projectId, keywordList, parseInt(limit || '20'));
    return { results };
  });

  // Search by file references
  app.get('/files/:projectId', async (req: FastifyRequest) => {
    const { projectId } = req.params as { projectId: string };
    const { paths, limit } = req.query as { paths?: string; limit?: string };
    if (!paths) return { error: 'paths query param required (comma-separated)' };

    const filePaths = paths.split(',').map(p => p.trim()).filter(Boolean);
    const results = indexer.searchByFiles(projectId, filePaths, parseInt(limit || '20'));
    return { results };
  });

  // Get project decisions
  app.get('/decisions/:projectId', async (req: FastifyRequest) => {
    const { projectId } = req.params as { projectId: string };
    const { limit } = req.query as { limit?: string };
    const decisions = indexer.getProjectDecisions(projectId, parseInt(limit || '50'));
    return { decisions };
  });

  // Get hotword frequency
  app.get('/hotwords/:projectId', async (req: FastifyRequest) => {
    const { projectId } = req.params as { projectId: string };
    const frequency = indexer.getHotwordFrequency(projectId);
    return { frequency };
  });

  // Build context for LLM
  app.get('/context/:projectId', async (req: FastifyRequest) => {
    const { projectId } = req.params as { projectId: string };
    const { query, maxChars } = req.query as { query?: string; maxChars?: string };
    const context = indexer.buildIndexedContext(
      projectId,
      query || '',
      parseInt(maxChars || '3000')
    );
    return { context };
  });
}
