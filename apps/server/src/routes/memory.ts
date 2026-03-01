// ============================================
// Memory Routes - Project & notes CRUD
// ============================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MemoryService } from '../services/memory/index.js';
import type { ProjectRequest, MemorySearchQuery } from '@personal-ide/shared';
import { safeRoute } from '../plugins/safeRoute.js';

export async function memoryRoutes(app: FastifyInstance) {
  const db = (app as any).db;
  const memory = new MemoryService(db);

  // --- Projects ---

  app.post('/projects', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as ProjectRequest;
    const project = memory.createProject(body.name, body.rootPath, body.description);
    return { project };
  }));

  app.get('/projects', safeRoute(async () => {
    return { projects: memory.listProjects() };
  }));

  app.get('/projects/:id', safeRoute(async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const project = memory.getProject(id);
    if (!project) return reply.status(404).send({ error: 'Project not found' });
    memory.updateProjectAccess(id);
    return { project };
  }));

  app.delete('/projects/:id', safeRoute(async (req: FastifyRequest) => {
    const { id } = req.params as { id: string };
    memory.deleteProject(id);
    return { success: true };
  }));

  // --- Notes ---

  app.post('/notes', safeRoute(async (req: FastifyRequest) => {
    const body = req.body as any;
    const note = memory.addNote(body.projectId, {
      projectId: body.projectId,
      source: body.source || 'user_note',
      category: body.category || 'general',
      title: body.title,
      content: body.content,
      tags: body.tags || [],
      relatedFiles: body.relatedFiles || [],
      importance: body.importance || 50,
      conversationId: body.conversationId,
    });
    return { note };
  }));

  app.get('/notes/:projectId', safeRoute(async (req: FastifyRequest) => {
    const { projectId } = req.params as { projectId: string };
    const { limit } = req.query as { limit?: string };
    const notes = memory.getProjectNotes(projectId, limit ? parseInt(limit) : 100);
    return { notes };
  }));

  app.post('/notes/search', safeRoute(async (req: FastifyRequest) => {
    const query = req.body as MemorySearchQuery;
    const notes = memory.searchNotes(query);
    return { notes };
  }));

  app.put('/notes/:noteId', safeRoute(async (req: FastifyRequest) => {
    const { noteId } = req.params as { noteId: string };
    const updates = req.body as any;
    memory.updateNote(noteId, updates);
    return { success: true };
  }));

  app.delete('/notes/:noteId', safeRoute(async (req: FastifyRequest) => {
    const { noteId } = req.params as { noteId: string };
    memory.deleteNote(noteId);
    return { success: true };
  }));

  // --- Questions ---

  app.get('/questions/:projectId', safeRoute(async (req: FastifyRequest) => {
    const { projectId } = req.params as { projectId: string };
    return { questions: memory.getPendingQuestions(projectId) };
  }));

  app.post('/questions/:questionId/resolve', safeRoute(async (req: FastifyRequest) => {
    const { questionId } = req.params as { questionId: string };
    const { resolution, answer } = req.body as { resolution: string; answer?: string };
    memory.resolveQuestion(questionId, resolution as any, answer);
    return { success: true };
  }));

  // --- Conversations ---

  app.get('/conversations/:projectId', safeRoute(async (req: FastifyRequest) => {
    const { projectId } = req.params as { projectId: string };
    return { conversations: memory.getConversations(projectId) };
  }));

  app.get('/messages/:conversationId', safeRoute(async (req: FastifyRequest) => {
    const { conversationId } = req.params as { conversationId: string };
    return { messages: memory.getMessages(conversationId) };
  }));
}
