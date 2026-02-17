// ============================================
// Knowledge Graph Types - Code Symbols, 
// Relationships, Conflicts, Edit Tracking
// ============================================

/** Kinds of code symbols the analyzer can extract */
export type SymbolKind =
  | 'function' | 'class' | 'interface' | 'type' | 'enum'
  | 'variable' | 'module' | 'struct' | 'trait' | 'method'
  | 'property' | 'constant' | 'import';

/** A code symbol node in the knowledge graph */
export interface CodeSymbol {
  id: string;
  projectId: string;
  filePath: string;
  name: string;
  kind: SymbolKind;
  /** Full signature (e.g. "async function foo(x: number): Promise<void>") */
  signature: string;
  lineStart: number;
  lineEnd: number;
  /** Scope: 'module' | 'class' | 'function' | 'block' | 'global' */
  scope: string;
  language: string;
  /** Purity score 0-1 (1 = pure function, 0 = heavy side effects) */
  purityScore: number;
  /** Domain category (e.g. "auth", "database", "rendering") */
  domain: string;
  /** Whether this symbol is exported / public */
  exported: boolean;
  /** Documentation comment if present */
  docComment: string;
  createdAt: string;
  updatedAt: string;
}

/** Types of relationships between symbols */
export type RelationshipType =
  | 'imports' | 'extends' | 'implements' | 'calls' | 'uses'
  | 'overrides' | 'composes' | 'instantiates' | 'returns' | 'parameter_of';

/** An edge in the code knowledge graph */
export interface CodeRelationship {
  id: string;
  projectId: string;
  sourceSymbolId: string;
  targetSymbolId: string;
  relationshipType: RelationshipType;
  /** Confidence 0-1 that this relationship is correct */
  confidence: number;
  createdAt: string;
}

/** Types of code conflicts */
export type ConflictType =
  | 'name_collision' | 'signature_mismatch' | 'circular_dependency'
  | 'duplicate_export' | 'type_incompatible';

/** A conflict between two symbols */
export interface CodeConflict {
  id: string;
  projectId: string;
  symbolAId: string;
  symbolBId: string;
  conflictType: ConflictType;
  severity: 'info' | 'warning' | 'error' | 'critical';
  resolutionStrategy: string;
  resolved: boolean;
  createdAt: string;
}

/** Edit types for change tracking */
export type EditType = 'create' | 'modify' | 'delete' | 'rename' | 'move';

/** A logged code edit for audit trail */
export interface CodeEditLogEntry {
  id: string;
  projectId: string;
  agentRunId?: string;
  filePath: string;
  editType: EditType;
  lineStart: number;
  lineEnd: number;
  oldContentHash: string;
  newContentHash: string;
  symbolsAffected: string[];
  reason: string;
  /** Safety score 0-1 (1 = perfectly safe, 0 = dangerous) */
  safetyScore: number;
  createdAt: string;
}

/** Indexed conversation data for fast recall */
export interface ConversationIndexEntry {
  id: string;
  projectId: string;
  conversationId: string;
  messageId?: string;
  /** Key technical terms extracted */
  hotwords: string[];
  /** Decisions made by user or agent */
  decisions: string[];
  /** Files mentioned or modified */
  fileReferences: string[];
  /** Code snippets referenced */
  codeSnippets: string[];
  /** Sentiment: positive/negative/neutral */
  sentiment: string;
  /** Importance 0-1 */
  importance: number;
  extractedAt: string;
}

/** Project tiers for scaling decisions */
export type ProjectTier = 'prototype' | 'production' | 'enterprise' | 'global';

/** Project tier configuration */
export interface ProjectTierConfig {
  id: string;
  projectId: string;
  tier: ProjectTier;
  primaryLanguage: string;
  architecturePattern: string;
  targetPlatforms: string[];
  qualityGates: Record<string, boolean>;
  autoDetected: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Log retention tiers */
export type RetentionTier = 'hot' | 'warm' | 'cold' | 'archived';

/** Log retention metadata */
export interface LogRetentionEntry {
  id: string;
  projectId: string;
  tier: RetentionTier;
  sourceTable: string;
  recordCount: number;
  totalBytes: number;
  oldestRecord: string;
  newestRecord: string;
  compactedAt?: string;
  createdAt: string;
}

/** Architecture patterns for tier engine */
export type ArchitecturePattern =
  | 'monolith' | 'modular_monolith' | 'microservices' | 'serverless'
  | 'event_driven' | 'layered' | 'hexagonal' | 'cqrs' | 'ecs'
  | 'component_based' | 'plugin_based' | 'monorepo';

/** Language decision result from tier engine */
export interface LanguageDecision {
  primaryLanguage: string;
  secondaryLanguages: string[];
  buildSystem: string;
  packageManager: string;
  testFramework: string;
  linter: string;
  formatter: string;
  architecture: ArchitecturePattern;
  reasoning: string;
}

/** Result from relationship index scan */
export interface RelationshipScanResult {
  symbolCount: number;
  relationshipCount: number;
  conflictCount: number;
  fileCount: number;
  languages: string[];
  hotPaths: string[]; // Most connected symbol chains
  orphanedSymbols: string[]; // Symbols with no references
  circularDeps: string[][]; // Groups of circular dependencies
  scanDurationMs: number;
}
