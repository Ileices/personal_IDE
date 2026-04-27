// ============================================
// Memory Service - Project memory management
// ============================================
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import type { Project, MemoryNote, MemorySearchQuery, FileSummary, QuestionLogEntry } from '@personal-ide/shared';

export class MemoryService {
  constructor(private db: Database.Database) {}

  // --- Projects ---

  createProject(name: string, rootPath: string, description: string = ''): Project {
    const id = uuid();
    const now = new Date().toISOString();
    this.db.prepare(
      'INSERT INTO projects (id, name, description, root_path, created_at, last_accessed_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, name, description, rootPath, now, now);

    return this.getProject(id)!;
  }

  getProject(id: string): Project | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapProject(row);
  }

  listProjects(): Project[] {
    const rows = this.db.prepare('SELECT * FROM projects ORDER BY last_accessed_at DESC').all() as any[];
    return rows.map(r => this.mapProject(r));
  }

  updateProjectAccess(id: string): void {
    this.db.prepare('UPDATE projects SET last_accessed_at = datetime(\'now\') WHERE id = ?').run(id);
  }

  deleteProject(id: string): void {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  }

  private mapProject(row: any): Project {
    const convCount = this.db.prepare('SELECT COUNT(*) as c FROM conversations WHERE project_id = ?').get(row.id) as any;
    const noteCount = this.db.prepare('SELECT COUNT(*) as c FROM memory_notes WHERE project_id = ?').get(row.id) as any;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      rootPath: row.root_path,
      createdAt: row.created_at,
      lastAccessedAt: row.last_accessed_at,
      conversationCount: convCount?.c || 0,
      noteCount: noteCount?.c || 0,
    };
  }

  // --- Memory Notes ---

  addNote(projectId: string, note: Omit<MemoryNote, 'id' | 'createdAt' | 'updatedAt'>): MemoryNote {
    const id = uuid();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO memory_notes (id, project_id, source, category, title, content, tags, related_files, importance, conversation_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, projectId, note.source, note.category, note.title, note.content,
      JSON.stringify(note.tags), JSON.stringify(note.relatedFiles),
      note.importance, note.conversationId || null, now, now
    );

    return { ...note, id, projectId, createdAt: now, updatedAt: now };
  }

  /** Search memory notes by text query */
  searchNotes(query: MemorySearchQuery): MemoryNote[] {
    let sql = 'SELECT * FROM memory_notes WHERE project_id = ?';
    const params: any[] = [query.projectId];

    if (query.sources && query.sources.length > 0) {
      sql += ` AND source IN (${query.sources.map(() => '?').join(',')})`;
      params.push(...query.sources);
    }

    if (query.query) {
      sql += ' AND (title LIKE ? OR content LIKE ? OR tags LIKE ?)';
      const q = `%${query.query}%`;
      params.push(q, q, q);
    }

    if (query.tags && query.tags.length > 0) {
      for (const tag of query.tags) {
        sql += ' AND tags LIKE ?';
        params.push(`%"${tag}"%`);
      }
    }

    sql += ' ORDER BY importance DESC, updated_at DESC';
    sql += ` LIMIT ${query.limit || 20}`;

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(r => this.mapNote(r));
  }

  /** Get all notes for a project */
  getProjectNotes(projectId: string, limit: number = 100): MemoryNote[] {
    const rows = this.db.prepare(
      'SELECT * FROM memory_notes WHERE project_id = ? ORDER BY importance DESC, updated_at DESC LIMIT ?'
    ).all(projectId, limit) as any[];
    return rows.map(r => this.mapNote(r));
  }

  /** Get notes relevant to specific files */
  getNotesForFiles(projectId: string, filePaths: string[]): MemoryNote[] {
    const rows: any[] = [];
    for (const fp of filePaths) {
      const matches = this.db.prepare(
        'SELECT * FROM memory_notes WHERE project_id = ? AND related_files LIKE ?'
      ).all(projectId, `%"${fp}"%`) as any[];
      rows.push(...matches);
    }
    // Deduplicate
    const seen = new Set<string>();
    return rows.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    }).map(r => this.mapNote(r));
  }

  deleteNote(noteId: string): void {
    this.db.prepare('DELETE FROM memory_notes WHERE id = ?').run(noteId);
  }

  updateNote(noteId: string, updates: Partial<Pick<MemoryNote, 'title' | 'content' | 'tags' | 'importance' | 'category'>>): void {
    const sets: string[] = [];
    const params: any[] = [];

    if (updates.title !== undefined) { sets.push('title = ?'); params.push(updates.title); }
    if (updates.content !== undefined) { sets.push('content = ?'); params.push(updates.content); }
    if (updates.tags !== undefined) { sets.push('tags = ?'); params.push(JSON.stringify(updates.tags)); }
    if (updates.importance !== undefined) { sets.push('importance = ?'); params.push(updates.importance); }
    if (updates.category !== undefined) { sets.push('category = ?'); params.push(updates.category); }

    if (sets.length === 0) return;

    sets.push('updated_at = datetime(\'now\')');
    params.push(noteId);

    this.db.prepare(`UPDATE memory_notes SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  }

  private mapNote(row: any): MemoryNote {
    return {
      id: row.id,
      projectId: row.project_id,
      source: row.source,
      category: row.category,
      title: row.title,
      content: row.content,
      tags: JSON.parse(row.tags || '[]'),
      relatedFiles: JSON.parse(row.related_files || '[]'),
      importance: row.importance,
      conversationId: row.conversation_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // --- File Summaries ---

  upsertFileSummary(projectId: string, summary: Omit<FileSummary, 'id' | 'createdAt' | 'updatedAt'>): void {
    const id = uuid();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO file_summaries (id, project_id, file_path, summary, language, file_size, content_hash, key_symbols, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, file_path) DO UPDATE SET
        summary = excluded.summary, language = excluded.language,
        file_size = excluded.file_size, content_hash = excluded.content_hash,
        key_symbols = excluded.key_symbols, updated_at = datetime('now')
    `).run(id, projectId, summary.filePath, summary.summary, summary.language, summary.fileSize, summary.contentHash, JSON.stringify(summary.keySymbols), now, now);
  }

  getFileSummary(projectId: string, filePath: string): FileSummary | null {
    const row = this.db.prepare('SELECT * FROM file_summaries WHERE project_id = ? AND file_path = ?').get(projectId, filePath) as any;
    if (!row) return null;
    return {
      id: row.id, projectId: row.project_id, filePath: row.file_path,
      summary: row.summary, language: row.language, fileSize: row.file_size,
      contentHash: row.content_hash, keySymbols: JSON.parse(row.key_symbols || '[]'),
      createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  // --- Question Logs ---

  logQuestion(projectId: string, question: string, agentRunId?: string): QuestionLogEntry {
    const id = uuid();
    const now = new Date().toISOString();
    this.db.prepare(
      'INSERT INTO question_logs (id, project_id, agent_run_id, question, resolution, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, projectId, agentRunId || null, question, 'pending', now);
    return { id, projectId, agentRunId, question, resolution: 'pending', createdAt: now };
  }

  resolveQuestion(questionId: string, resolution: 'auto_answered' | 'user_answered' | 'skipped', answer?: string): void {
    this.db.prepare(
      'UPDATE question_logs SET resolution = ?, answer = ? WHERE id = ?'
    ).run(resolution, answer || null, questionId);
  }

  getPendingQuestions(projectId: string): QuestionLogEntry[] {
    const rows = this.db.prepare(
      'SELECT * FROM question_logs WHERE project_id = ? AND resolution = ? ORDER BY created_at DESC'
    ).all(projectId, 'pending') as any[];
    return rows.map(r => ({
      id: r.id, projectId: r.project_id, agentRunId: r.agent_run_id,
      question: r.question, resolution: r.resolution, answer: r.answer, createdAt: r.created_at,
    }));
  }

  // --- Conversations ---

  createConversation(projectId: string, title: string, mode: string, model: string): string {
    const id = uuid();
    this.db.prepare(
      'INSERT INTO conversations (id, project_id, title, mode, model) VALUES (?, ?, ?, ?, ?)'
    ).run(id, projectId, title, mode, model);
    return id;
  }

  getConversations(projectId: string): any[] {
    return this.db.prepare(
      `SELECT c.*, COUNT(m.id) as message_count
       FROM conversations c
       LEFT JOIN messages m ON m.conversation_id = c.id
       WHERE c.project_id = ?
       GROUP BY c.id
       ORDER BY c.updated_at DESC`
    ).all(projectId) as any[];
  }

  renameConversation(conversationId: string, title: string): void {
    this.db.prepare(
      "UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(title, conversationId);
  }

  deleteConversation(conversationId: string): void {
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(conversationId);
  }

  addMessage(conversationId: string, role: string, content: string, model?: string, mode?: string, structuredOutput?: any): string {
    const id = uuid();
    this.db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, model, mode, structured_output)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, conversationId, role, content, model || null, mode || null, structuredOutput ? JSON.stringify(structuredOutput) : null);

    this.db.prepare('UPDATE conversations SET updated_at = datetime(\'now\') WHERE id = ?').run(conversationId);

    return id;
  }

  getMessages(conversationId: string): any[] {
    return this.db.prepare(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
    ).all(conversationId) as any[];
  }

  /** Build context string from relevant memory for prompt injection */
  buildMemoryContext(projectId: string, userMessage: string, maxChars: number = 4000): string {
    // Search for relevant notes based on the user's message
    const notes = this.searchNotes({
      projectId,
      query: userMessage,
      limit: 10,
    });

    if (notes.length === 0) return '';

    let context = '\n--- PROJECT MEMORY (relevant past context) ---\n';
    let charCount = context.length;

    for (const note of notes) {
      const entry = `[${note.source}/${note.category}] ${note.title}: ${note.content}\n`;
      if (charCount + entry.length > maxChars) break;
      context += entry;
      charCount += entry.length;
    }

    context += '--- END PROJECT MEMORY ---\n';
    return context;
  }
}
