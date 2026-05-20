// ============================================
// LLM Service Internal Types
// ============================================

import OpenAI from 'openai';

/** Database connection interface */
export interface DatabaseConnection {
  prepare: (query: string) => {
    get: (...params: any[]) => Record<string, unknown> | null | undefined;
    all: (...params: any[]) => Array<Record<string, unknown> | null>;
  };
}

/** Database row from provider_configs table */
export interface DbProviderRow {
  provider_id?: string;
  base_url: string;
  api_key_encrypted?: string | null;
  enabled?: 0 | 1;
}

/** Database row from auth_tokens table */
export interface DbAuthRow {
  token_encrypted: string | null;
  is_active?: 0 | 1;
}

/** Provider client configuration */
export interface ProviderClientConfig {
  baseURL: string;
  apiKey?: string;
  timeoutMs?: number;
  maxRetries?: number;
  defaultHeaders?: Record<string, string>;
}

/** Standardized LLM client interface */
export type StandardLLMClient = OpenAI;

/** GitHub-specific client configuration */
export interface GitHubClientConfig extends ProviderClientConfig {
  defaultHeaders: {
    'x-github-token': string;
    'x-github-api-version': string;
  };
}