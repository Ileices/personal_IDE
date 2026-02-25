// ============================================
// Knowledge Graph Routes
// Symbols, relationships, conflicts, scanning
// ============================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { RelationshipIndexService } from '../services/analysis/relationshipIndex.js';
import { listAllFiles } from '../services/filesystem/index.js';

export async function knowledgeRoutes(app: FastifyInstance) {
  const db = (app as any).db;
  const indexer = new RelationshipIndexService(db);

  // Scan a project to build the knowledge graph
  app.post('/scan', async (req: FastifyRequest) => {
    const { projectId, projectRoot } = req.body as { projectId: string; projectRoot: string };
    if (!projectId || !projectRoot) {
      return { error: 'projectId and projectRoot are required' };
    }
    const files = listAllFiles(projectRoot);
    const result = indexer.scanProject(projectId, projectRoot, files);
    return { result };
  });

  // Get symbols for a file
  app.get('/symbols/:projectId/:filePath', async (req: FastifyRequest) => {
    const { projectId, filePath } = req.params as { projectId: string; filePath: string };
    const symbols = indexer.getFileSymbols(projectId, decodeURIComponent(filePath));
    return { symbols };
  });

  // Get all symbols for a project
  app.get('/symbols/:projectId', async (req: FastifyRequest) => {
    const { projectId } = req.params as { projectId: string };
    const symbols = indexer.getProjectSymbols(projectId);
    return { symbols };
  });

  // Get relationships for a symbol
  app.get('/relationships/:symbolId', async (req: FastifyRequest) => {
    const { symbolId } = req.params as { symbolId: string };
    const relationships = indexer.getSymbolRelationships(symbolId);
    return { relationships };
  });

  // Get all conflicts for a project
  app.get('/conflicts/:projectId', async (req: FastifyRequest) => {
    const { projectId } = req.params as { projectId: string };
    const conflicts = indexer.getProjectConflicts(projectId);
    return { conflicts };
  });

  // Get symbol stats for a project
  app.get('/stats/:projectId', async (req: FastifyRequest) => {
    const { projectId } = req.params as { projectId: string };
    const stats = indexer.getSymbolStats(projectId);
    return { stats };
  });

  // Get formatted context for LLM
  app.get('/context/:projectId', async (req: FastifyRequest) => {
    const { projectId } = req.params as { projectId: string };
    const { maxTokens } = req.query as { maxTokens?: string };
    const context = indexer.formatForLLM(projectId, parseInt(maxTokens || '2000'));
    return { context };
  });
}
