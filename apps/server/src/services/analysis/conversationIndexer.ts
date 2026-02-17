// ============================================
// Conversation Indexer
// Auto-extracts hotwords, decisions, file
// references, code snippets, and sentiment
// from conversation messages for fast recall
// ============================================
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import type { ConversationIndexEntry } from '@personal-ide/shared';

// ── Hotword Extraction ──

/** Technical terms and patterns worth indexing */
const HOTWORD_PATTERNS: RegExp[] = [
  // Language/framework keywords
  /\b(?:React|Vue|Svelte|Angular|Next|Nuxt|Express|Fastify|Django|Flask|FastAPI|Rails|Spring|Laravel)\b/g,
  /\b(?:TypeScript|JavaScript|Python|Rust|Go|Java|C#|C\+\+|Swift|Kotlin|Dart|Ruby|PHP|Scala|Elixir|Haskell)\b/g,
  /\b(?:Docker|Kubernetes|AWS|Azure|GCP|Terraform|Ansible|Jenkins|GitHub Actions|CI\/CD)\b/g,
  /\b(?:PostgreSQL|MySQL|SQLite|MongoDB|Redis|Elasticsearch|DynamoDB|Supabase|Firebase)\b/g,
  /\b(?:REST|GraphQL|gRPC|WebSocket|SSE|OAuth|JWT|CORS|HTTPS)\b/g,
  /\b(?:Webpack|Vite|Rollup|ESBuild|Turbopack|SWC|Babel)\b/g,
  /\b(?:Git|npm|pnpm|yarn|cargo|pip|uv|poetry|composer|maven|gradle)\b/g,
  // Architecture terms
  /\b(?:microservice|monolith|serverless|event[- ]driven|CQRS|hexagonal|DDD|ECS)\b/gi,
  // Error/debug terms
  /\b(?:error|bug|crash|exception|stack trace|null pointer|segfault|memory leak|race condition|deadlock)\b/gi,
  // Design patterns
  /\b(?:singleton|factory|observer|decorator|adapter|proxy|builder|strategy|command|middleware)\b/gi,
  // Data structures
  /\b(?:array|hashmap|btree|linked list|queue|stack|heap|graph|trie|bloom filter)\b/gi,
];

/** Common noise words to exclude from hotword extraction */
const NOISE_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall',
  'should', 'may', 'might', 'must', 'can', 'could', 'to', 'of', 'in',
  'for', 'on', 'with', 'at', 'by', 'from', 'up', 'about', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'between',
  'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once',
  'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
  'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
  'very', 'just', 'but', 'and', 'or', 'if', 'because', 'as', 'until',
  'while', 'this', 'that', 'these', 'those', 'it', 'its', 'i', 'me',
  'my', 'we', 'our', 'you', 'your', 'he', 'she', 'they', 'them',
  'what', 'which', 'who', 'whom', 'also', 'like', 'need', 'want',
  'use', 'using', 'used', 'make', 'made', 'get', 'got', 'code',
  'file', 'files', 'think', 'know', 'see', 'look', 'let', 'please',
]);

// ── Decision Detection ──

const DECISION_PATTERNS: RegExp[] = [
  // Explicit decisions
  /(?:I(?:'ll| will)\s+(?:use|go with|choose|pick|implement|create|build|add|write|design|refactor|deploy)\s+.+)/gi,
  /(?:Let's\s+(?:use|go with|switch to|implement|create|build|add|try|start with)\s+.+)/gi,
  /(?:We(?:'ll| should| will| need to)\s+(?:use|implement|create|build|add|switch|migrate|refactor)\s+.+)/gi,
  // Architecture decisions
  /(?:(?:The|Our)\s+(?:architecture|design|approach|strategy|pattern|structure)\s+(?:will be|should be|is)\s+.+)/gi,
  // Rejection decisions
  /(?:(?:Don't|Do not|Avoid|Skip|Remove|Stop)\s+(?:using|using|implementing|adding)\s+.+)/gi,
  // Preference signals
  /(?:(?:prefer|chosen|decided|settled on|going with|opted for)\s+.+)/gi,
];

// ── File Reference Detection ──

const FILE_PATTERNS: RegExp[] = [
  // Common file path patterns
  /(?:(?:src|lib|app|packages|components|services|routes|utils|hooks|types|models|views|controllers|tests?)\/[\w/.-]+\.\w+)/g,
  // File extensions
  /\b[\w.-]+\.(?:ts|tsx|js|jsx|py|rs|go|java|cs|cpp|c|h|swift|kt|rb|php|lua|dart|sql|yaml|yml|json|toml|md)\b/g,
  // Import paths
  /(?:from|import)\s+['"]([^'"]+)['"]/g,
  // File references in conversation
  /(?:file|modify|create|edit|update|read|open|check|look at|see)\s+[`"]?([/\w.-]+\.\w+)[`"]?/gi,
];

// ── Code Snippet Detection ──

const CODE_FENCE_PATTERN = /```[\w]*\n([\s\S]*?)```/g;

// ── Sentiment Analysis (simple keyword-based) ──

const POSITIVE_WORDS = new Set([
  'works', 'working', 'fixed', 'solved', 'great', 'perfect', 'excellent',
  'good', 'nice', 'awesome', 'correct', 'right', 'success', 'passed',
  'done', 'complete', 'ready', 'clean', 'fast', 'efficient',
]);

const NEGATIVE_WORDS = new Set([
  'error', 'bug', 'broken', 'failed', 'wrong', 'bad', 'crash', 'slow',
  'missing', 'undefined', 'null', 'issue', 'problem', 'broken', 'stuck',
  'confused', 'unclear', 'messy', 'ugly', 'complicated', 'bloated',
]);

// ── Main Service ──

export class ConversationIndexer {
  constructor(private db: Database.Database) {}

  /** Index a single message and store the extracted data */
  indexMessage(projectId: string, conversationId: string, messageId: string, content: string, role: string): ConversationIndexEntry {
    const hotwords = this.extractHotwords(content);
    const decisions = role === 'user' ? this.extractDecisions(content) : this.extractAgentDecisions(content);
    const fileReferences = this.extractFileReferences(content);
    const codeSnippets = this.extractCodeSnippets(content);
    const sentiment = this.analyzeSentiment(content);
    const importance = this.calculateImportance(hotwords, decisions, fileReferences, codeSnippets, role);

    const entry: ConversationIndexEntry = {
      id: uuid(),
      projectId,
      conversationId,
      messageId,
      hotwords,
      decisions,
      fileReferences,
      codeSnippets,
      sentiment,
      importance,
      extractedAt: new Date().toISOString(),
    };

    this.db.prepare(`
      INSERT INTO conversation_index (id, project_id, conversation_id, message_id, hotwords, decisions, file_references, code_snippets, sentiment, importance, extracted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.id, projectId, conversationId, messageId,
      JSON.stringify(hotwords), JSON.stringify(decisions),
      JSON.stringify(fileReferences), JSON.stringify(codeSnippets),
      sentiment, importance, entry.extractedAt
    );

    return entry;
  }

  /** Index all messages in a conversation */
  indexConversation(projectId: string, conversationId: string): ConversationIndexEntry[] {
    const messages = this.db.prepare(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
    ).all(conversationId) as any[];

    // Clear existing index for this conversation
    this.db.prepare('DELETE FROM conversation_index WHERE conversation_id = ?').run(conversationId);

    const entries: ConversationIndexEntry[] = [];
    for (const msg of messages) {
      const entry = this.indexMessage(projectId, conversationId, msg.id, msg.content, msg.role);
      entries.push(entry);
    }

    return entries;
  }

  /** Search indexed conversations by hotwords */
  searchByHotwords(projectId: string, keywords: string[], limit: number = 20): ConversationIndexEntry[] {
    let sql = 'SELECT * FROM conversation_index WHERE project_id = ?';
    const params: any[] = [projectId];

    for (const kw of keywords) {
      sql += ' AND hotwords LIKE ?';
      params.push(`%"${kw}"%`);
    }

    sql += ' ORDER BY importance DESC, extracted_at DESC';
    sql += ` LIMIT ${limit}`;

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(mapIndexRow);
  }

  /** Search by file references */
  searchByFiles(projectId: string, filePaths: string[], limit: number = 20): ConversationIndexEntry[] {
    let sql = 'SELECT * FROM conversation_index WHERE project_id = ?';
    const params: any[] = [projectId];

    for (const fp of filePaths) {
      sql += ' AND file_references LIKE ?';
      params.push(`%${fp}%`);
    }

    sql += ' ORDER BY importance DESC, extracted_at DESC';
    sql += ` LIMIT ${limit}`;

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(mapIndexRow);
  }

  /** Get all decisions made in a project */
  getProjectDecisions(projectId: string, limit: number = 50): string[] {
    const rows = this.db.prepare(
      'SELECT decisions FROM conversation_index WHERE project_id = ? AND decisions != \'[]\' ORDER BY extracted_at DESC LIMIT ?'
    ).all(projectId, limit) as any[];

    const allDecisions: string[] = [];
    for (const row of rows) {
      try {
        const decisions = JSON.parse(row.decisions);
        allDecisions.push(...decisions);
      } catch { /* ignore */ }
    }

    return [...new Set(allDecisions)];
  }

  /** Get hotword frequency for a project */
  getHotwordFrequency(projectId: string): Record<string, number> {
    const rows = this.db.prepare(
      'SELECT hotwords FROM conversation_index WHERE project_id = ?'
    ).all(projectId) as any[];

    const freq: Record<string, number> = {};
    for (const row of rows) {
      try {
        const hotwords = JSON.parse(row.hotwords) as string[];
        for (const hw of hotwords) {
          freq[hw] = (freq[hw] || 0) + 1;
        }
      } catch { /* ignore */ }
    }

    return freq;
  }

  /** Build memory context from indexed conversations */
  buildIndexedContext(projectId: string, currentQuery: string, maxChars: number = 3000): string {
    // Extract hotwords from current query to find relevant past context
    const queryHotwords = this.extractHotwords(currentQuery);
    const queryFiles = this.extractFileReferences(currentQuery);

    const parts: string[] = [];
    let totalChars = 0;

    // Get relevant indexed entries
    if (queryHotwords.length > 0) {
      const relevant = this.searchByHotwords(projectId, queryHotwords.slice(0, 5), 10);
      for (const entry of relevant) {
        if (totalChars >= maxChars) break;
        if (entry.decisions.length > 0) {
          const text = `Decisions: ${entry.decisions.join('; ')}`;
          parts.push(text);
          totalChars += text.length;
        }
      }
    }

    if (queryFiles.length > 0) {
      const fileEntries = this.searchByFiles(projectId, queryFiles.slice(0, 3), 5);
      for (const entry of fileEntries) {
        if (totalChars >= maxChars) break;
        if (entry.decisions.length > 0) {
          const text = `File context [${entry.fileReferences.join(', ')}]: ${entry.decisions.join('; ')}`;
          parts.push(text);
          totalChars += text.length;
        }
      }
    }

    // Always include recent decisions
    const recentDecisions = this.getProjectDecisions(projectId, 10);
    if (recentDecisions.length > 0 && totalChars < maxChars) {
      const text = 'Recent decisions: ' + recentDecisions.slice(0, 5).join('; ');
      parts.push(text);
    }

    // Hotword frequency (top terms)
    const freq = this.getHotwordFrequency(projectId);
    const topTerms = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([term, count]) => `${term}(${count})`);

    if (topTerms.length > 0) {
      parts.push('Key topics: ' + topTerms.join(', '));
    }

    if (parts.length === 0) return '';
    return '### Conversation Memory\n' + parts.join('\n');
  }

  /** Format for LLM context */
  formatForLLM(projectId: string, maxTokens: number): string {
    return this.buildIndexedContext(projectId, '', maxTokens * 4);
  }

  // ── Private Extraction Methods ──

  private extractHotwords(content: string): string[] {
    const hotwords = new Set<string>();

    // Pattern-based extraction
    for (const pattern of HOTWORD_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        hotwords.add(match[0].trim());
      }
    }

    // Also extract CamelCase/PascalCase identifiers that look like class/function names
    const identifiers = content.match(/\b[A-Z][a-zA-Z0-9]{3,}\b/g);
    if (identifiers) {
      for (const id of identifiers) {
        if (!NOISE_WORDS.has(id.toLowerCase()) && id.length > 3) {
          hotwords.add(id);
        }
      }
    }

    // Extract words with special suffixes
    const techWords = content.match(/\b\w+(?:Config|Service|Controller|Handler|Manager|Factory|Builder|Provider|Store|Context|Hook|Reducer|Middleware|Plugin|Module|Component|Router|Guard|Interceptor|Pipe|Directive)\b/g);
    if (techWords) {
      for (const tw of techWords) hotwords.add(tw);
    }

    return [...hotwords].slice(0, 50); // cap at 50 hotwords per message
  }

  private extractDecisions(content: string): string[] {
    const decisions: string[] = [];

    for (const pattern of DECISION_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const decision = match[0].trim();
        if (decision.length > 10 && decision.length < 200) {
          decisions.push(decision);
        }
      }
    }

    return [...new Set(decisions)].slice(0, 10);
  }

  private extractAgentDecisions(content: string): string[] {
    const decisions: string[] = [];

    // Agent-specific decision patterns
    const agentPatterns = [
      /(?:I (?:created|modified|updated|deleted|added|removed|refactored|implemented|built|designed)\s+.+)/gi,
      /(?:(?:Created|Modified|Updated|Added|Removed|Implemented|Built)\s+.+?(?:\.|$))/gm,
      /(?:Changed\s+.+?(?:to|from)\s+.+)/gi,
      /(?:(?:Using|Chose|Selected|Applied)\s+.+?(?:for|because|since)\s+.+)/gi,
    ];

    for (const pattern of agentPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const decision = match[0].trim();
        if (decision.length > 10 && decision.length < 300) {
          decisions.push(decision);
        }
      }
    }

    return [...new Set(decisions)].slice(0, 10);
  }

  private extractFileReferences(content: string): string[] {
    const files = new Set<string>();

    for (const pattern of FILE_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const file = (match[1] || match[0]).trim();
        // Filter out obvious non-files
        if (file.length > 3 && file.length < 200 && !file.startsWith('http')) {
          files.add(file);
        }
      }
    }

    return [...files].slice(0, 30);
  }

  private extractCodeSnippets(content: string): string[] {
    const snippets: string[] = [];
    CODE_FENCE_PATTERN.lastIndex = 0;
    let match;
    while ((match = CODE_FENCE_PATTERN.exec(content)) !== null) {
      const snippet = match[1].trim();
      if (snippet.length > 10 && snippet.length < 1000) {
        // Just store a hash/preview, not the full snippet
        snippets.push(snippet.slice(0, 100) + (snippet.length > 100 ? '...' : ''));
      }
    }
    return snippets.slice(0, 5);
  }

  private analyzeSentiment(content: string): string {
    const words = content.toLowerCase().split(/\s+/);
    let positive = 0;
    let negative = 0;

    for (const word of words) {
      if (POSITIVE_WORDS.has(word)) positive++;
      if (NEGATIVE_WORDS.has(word)) negative++;
    }

    if (positive > negative * 1.5) return 'positive';
    if (negative > positive * 1.5) return 'negative';
    return 'neutral';
  }

  private calculateImportance(
    hotwords: string[], decisions: string[], fileRefs: string[],
    codeSnippets: string[], role: string
  ): number {
    let score = 0.3; // base

    // Decisions are very important
    score += decisions.length * 0.15;

    // File references indicate actionable context
    score += Math.min(fileRefs.length * 0.05, 0.2);

    // Hotwords indicate technical depth
    score += Math.min(hotwords.length * 0.02, 0.15);

    // Code snippets are high-value
    score += Math.min(codeSnippets.length * 0.05, 0.15);

    // User messages with decisions are most important
    if (role === 'user' && decisions.length > 0) score += 0.1;

    return Math.min(1, score);
  }
}

// ── Row Mapper ──

function mapIndexRow(row: any): ConversationIndexEntry {
  return {
    id: row.id,
    projectId: row.project_id,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    hotwords: JSON.parse(row.hotwords || '[]'),
    decisions: JSON.parse(row.decisions || '[]'),
    fileReferences: JSON.parse(row.file_references || '[]'),
    codeSnippets: JSON.parse(row.code_snippets || '[]'),
    sentiment: row.sentiment,
    importance: row.importance,
    extractedAt: row.extracted_at,
  };
}
