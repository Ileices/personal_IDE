// ============================================
// File System Types - File tree, operations
// ============================================

/** A node in the file tree */
export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  /** File size in bytes (files only) */
  size?: number;
  /** File extension (files only) */
  extension?: string;
  /** Children (directories only) */
  children?: FileNode[];
  /** Last modified ISO timestamp */
  modifiedAt?: string;
}

/** File read response */
export interface FileContent {
  path: string;
  content: string;
  language: string;
  size: number;
  modifiedAt: string;
  encoding: string;
}

/** File write request */
export interface FileWriteRequest {
  path: string;
  content: string;
  /** Create backup before writing */
  backup?: boolean;
}

/** File search result */
export interface FileSearchResult {
  path: string;
  line: number;
  column: number;
  match: string;
  context: string;
}

/** Supported operations */
export type FileOperation =
  | { type: 'read'; path: string }
  | { type: 'write'; path: string; content: string }
  | { type: 'create'; path: string; content?: string }
  | { type: 'delete'; path: string }
  | { type: 'rename'; oldPath: string; newPath: string }
  | { type: 'mkdir'; path: string };
